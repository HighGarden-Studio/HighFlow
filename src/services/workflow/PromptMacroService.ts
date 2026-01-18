/**
 * Prompt Macro Service
 *
 * 프롬프트 내 매크로를 파싱하고 실제 값으로 치환하는 서비스
 *
 * 지원하는 매크로:
 * - {{task:ID}} - 특정 태스크의 전체 결과
 * - {{task:ID.content}} - 특정 태스크의 content 필드
 * - {{task:ID.output}} - 특정 태스크의 output 객체
 * - {{task:ID.summary}} - 특정 태스크 결과의 요약 (처음 500자)
 * - {{prev}} - 바로 이전 태스크의 결과
 * - {{prev - 1}} - 2단계 전 태스크의 결과
 * - {{prev.content}} - 바로 이전 태스크의 content
 * - {{all_results}} - 모든 이전 결과를 JSON 배열로
 * - {{all_results.summary}} - 모든 이전 결과의 요약
 * - {{var:NAME}} - 컨텍스트 변수
 * - {{date}} - 현재 날짜
 * - {{datetime}} - 현재 날짜/시간
 * - {{project.name}} - 프로젝트 이름
 * - {{project.description}} - 프로젝트 설명
 */

import type { TaskResult } from './types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MacroParser, type ParsedMacro, type MacroType, type MacroSuggestion } from './MacroParser';

export type { ParsedMacro, MacroType, MacroSuggestion };

export interface MacroContext {
    previousResults: TaskResult[];
    variables: Record<string, unknown>;
    projectName?: string;
    projectDescription?: string;
    currentTaskId?: number;
}

/**
 * 매크로 파싱 및 치환 서비스
 */
export class PromptMacroService {
    /**
     * 텍스트에서 모든 매크로 찾기 (Delegated to MacroParser)
     */
    static findMacros(text: string): ParsedMacro[] {
        return MacroParser.findMacros(text);
    }

    /**
     * 매크로를 실제 값으로 치환
     */
    static replaceMacros(text: string, context: MacroContext): string {
        let result = text;

        const macros = this.findMacros(text);

        for (const macro of macros) {
            const value = this.getMacroValue(macro, context);
            result = result.replace(macro.fullMatch, value);
        }

        return result;
    }

    /**
     * 매크로 값 가져오기
     */
    private static getMacroValue(macro: ParsedMacro, context: MacroContext): string {
        switch (macro.type) {
            case 'task':
                return this.getTaskResult(macro.taskId!, macro.field!, context);

            case 'prev':
                return this.getPreviousResult(macro.field!, context, macro.offset);

            case 'all_results':
                return this.getAllResults(macro.field!, context);

            case 'var':
                return this.getVariable(macro.varName!, context);

            case 'date':
                return new Date().toISOString().split('T')[0] ?? '';

            case 'datetime':
                return new Date().toISOString();

            case 'project':
                return this.getProjectField(macro.field!, context);

            default:
                return macro.fullMatch;
        }
    }

    /**
     * 특정 태스크 결과 가져오기
     */
    private static getTaskResult(taskId: number, field: string, context: MacroContext): string {
        // 1. Try to find by Task ID (Database ID)
        let result = context.previousResults.find((r) => r.taskId === taskId);

        // 2. If not found, try by Project Sequence (User-facing ID)
        if (!result) {
            result = context.previousResults.find((r) => r.projectSequence === taskId);
            // Validation: Warn if we found a sequence match but user might have meant ID?
            // In most cases, users mean Sequence.
        }

        if (!result) {
            return `[Task #${taskId} 결과 없음]`;
        }

        return this.extractField(result, field);
    }

    /**
     * 이전 태스크 결과 가져오기 (Recursive support)
     */
    private static getPreviousResult(
        field: string,
        context: MacroContext,
        offset: number = 0
    ): string {
        if (context.previousResults.length === 0) {
            return '[이전 태스크 결과 없음]';
        }

        // 0 means last item (index = length - 1)
        // 1 means second last (index = length - 2)
        const index = context.previousResults.length - 1 - offset;

        if (index < 0) {
            return `[Prev - ${offset}: 결과 없음 (범위 초과)]`;
        }

        const result = context.previousResults[index];
        if (!result) {
            return `[Prev - ${offset}: 결과 없음]`;
        }
        return this.extractField(result, field);
    }

    /**
     * 모든 결과 가져오기
     */
    private static getAllResults(field: string, context: MacroContext): string {
        if (context.previousResults.length === 0) {
            return '[이전 태스크 결과 없음]';
        }

        if (field === 'summary') {
            return context.previousResults
                .map((r) => {
                    const content = this.extractContentForMacro(r.output, r.taskId);
                    const summary =
                        content.length > 200 ? content.substring(0, 200) + '...' : content;
                    return `[Task #${r.taskId}${r.taskTitle ? ` - ${r.taskTitle}` : ''}]\n${summary}`;
                })
                .join('\n\n');
        }

        // full - 전체 JSON
        return JSON.stringify(
            context.previousResults.map((r) => ({
                taskId: r.taskId,
                taskTitle: r.taskTitle,
                status: r.status,
                output: r.output,
            })),
            null,
            2
        );
    }

    /**
     * 변수 값 가져오기
     */
    private static getVariable(varName: string, context: MacroContext): string {
        const value = context.variables[varName];
        if (value === undefined) {
            return `[변수 '${varName}' 없음]`;
        }
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
    }

    /**
     * 프로젝트 필드 가져오기
     */
    private static getProjectField(field: string, context: MacroContext): string {
        switch (field) {
            case 'name':
                return context.projectName || '[프로젝트 이름 없음]';
            case 'description':
                return context.projectDescription || '[프로젝트 설명 없음]';
            default:
                return `[알 수 없는 프로젝트 필드: ${field}]`;
        }
    }

    /**
     * TaskResult에서 필드 추출
     */
    private static extractField(result: TaskResult, field: string): string {
        switch (field) {
            case 'content':
                return this.extractContentForMacro(result.output, result.taskId);

            case 'output':
                return typeof result.output === 'object'
                    ? JSON.stringify(result.output, null, 2)
                    : String(result.output);

            case 'summary': {
                const content = this.extractContentForMacro(result.output, result.taskId);
                return content.length > 500 ? content.substring(0, 500) + '...' : content;
            }

            case 'status':
                return result.status;

            case 'duration':
                return `${result.duration}ms`;

            case 'cost':
                return result.cost ? `$${result.cost.toFixed(4)}` : 'N/A';

            case 'tokens':
                return result.tokens ? String(result.tokens) : 'N/A';

            case 'metadata':
                return JSON.stringify(result.metadata, null, 2);

            default:
                // 중첩 필드 접근 시도 (예: output.data)
                try {
                    const parts = field.split('.');
                    let value: unknown = result;
                    for (const part of parts) {
                        if (value && typeof value === 'object' && part in value) {
                            value = (value as Record<string, unknown>)[part];
                        } else {
                            return `[필드 '${field}' 없음]`;
                        }
                    }
                    return typeof value === 'object'
                        ? JSON.stringify(value, null, 2)
                        : String(value);
                } catch {
                    return `[필드 '${field}' 접근 오류]`;
                }
        }
    }

    /**
     * output에서 content 추출 (원본 데이터 반환 - UI 표시용)
     */
    private static extractContent(output: unknown): string {
        if (typeof output === 'string') {
            return output;
        }

        if (output && typeof output === 'object') {
            const obj = output as Record<string, unknown>;

            // 이미지 생성 결과
            if ('imageUrl' in obj && typeof obj.imageUrl === 'string') {
                return obj.imageUrl;
            }

            // 일반적인 content 필드들
            if ('content' in obj && typeof obj.content === 'string') {
                return obj.content;
            }
            if ('text' in obj && typeof obj.text === 'string') {
                return obj.text;
            }
            if ('result' in obj && typeof obj.result === 'string') {
                return obj.result;
            }
            if ('message' in obj && typeof obj.message === 'string') {
                return obj.message;
            }
            // 객체 전체를 JSON으로
            return JSON.stringify(obj, null, 2);
        }

        return String(output);
    }

    /**
     * 매크로 치환용 - content 추출 후 이미지면 파일로 변환
     */
    private static extractContentForMacro(output: unknown, taskId?: number): string {
        const content = this.extractContent(output);

        // Base64 이미지인 경우에만 파일로 저장
        if (this.isBase64Image(content)) {
            return this.saveBase64ImageToTempFile(content, taskId);
        }

        return content;
    }

    /**
     * Base64 이미지를 임시 파일로 저장하고 경로 반환
     */
    private static saveBase64ImageToTempFile(base64Data: string, taskId?: number): string {
        try {
            // Base64 데이터 형식 감지: data:image/png;base64,... 또는 순수 base64
            let imageData = base64Data;
            let extension = 'png';

            // data URL 형식에서 타입과 데이터 추출
            const dataUrlMatch = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
            if (dataUrlMatch) {
                extension = dataUrlMatch[1] ?? 'png';
                imageData = dataUrlMatch[2] ?? base64Data;
            }

            // 임시 디렉토리 생성
            const tempDir = path.join(os.tmpdir(), 'workflow-manager-images');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }

            // 파일명 생성 (task ID + timestamp)
            const timestamp = Date.now();
            const filename = taskId
                ? `task-${taskId}-${timestamp}.${extension}`
                : `image-${timestamp}.${extension}`;
            const filePath = path.join(tempDir, filename);

            // Base64 디코딩 후 파일로 저장
            const buffer = Buffer.from(imageData, 'base64');
            fs.writeFileSync(filePath, buffer);

            console.log(`✨ Saved image to temp file: ${filePath}`);
            return filePath;
        } catch (error) {
            console.error('Failed to save base64 image to temp file:', error);
            return '[Image save failed]';
        }
    }

    /**
     * 문자열이 base64 인코딩된 이미지인지 확인
     */
    private static isBase64Image(str: string): boolean {
        // Data URL 형식
        if (str.startsWith('data:image/')) {
            return true;
        }

        // 순수 base64: 길이가 충분히 길고 (50KB 이상), base64 문자만 포함
        if (str.length > 50000 && /^[A-Za-z0-9+/=\s]+$/.test(str)) {
            return true;
        }

        return false;
    }

    /**
     * 사용 가능한 매크로 제안 목록 생성 (Delegated to MacroParser)
     */
    static getSuggestions(dependentTaskIds: number[], variables: string[]): MacroSuggestion[] {
        return MacroParser.getSuggestions(dependentTaskIds, variables);
    }

    /**
     * 매크로 유효성 검사 (Delegated to MacroParser)
     */
    static validateMacros(
        text: string,
        availableTaskIds: number[],
        availableVariables: string[]
    ): { valid: boolean; errors: string[] } {
        return MacroParser.validateMacros(text, availableTaskIds, availableVariables);
    }

    /**
     * 프롬프트에 매크로 미리보기 (Delegated to MacroParser)
     */
    static previewMacros(text: string, dependentTaskIds?: number[]): string {
        return MacroParser.previewMacros(text, dependentTaskIds);
    }
}

// 싱글톤 export
export const promptMacroService = new PromptMacroService();
