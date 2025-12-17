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

export interface MacroContext {
    previousResults: TaskResult[];
    variables: Record<string, unknown>;
    projectName?: string;
    projectDescription?: string;
    currentTaskId?: number;
}

export interface ParsedMacro {
    fullMatch: string;
    type: MacroType;
    taskId?: number;
    field?: string;
    varName?: string;
    offset?: number; // For recursive prev (0 = last, 1 = second last)
}

export type MacroType = 'task' | 'prev' | 'all_results' | 'var' | 'date' | 'datetime' | 'project';

export interface MacroSuggestion {
    macro: string;
    description: string;
    example: string;
    category: 'dependency' | 'context' | 'system';
}

/**
 * 매크로 파싱 및 치환 서비스
 */
export class PromptMacroService {
    // 매크로 패턴: {{...}}
    private static readonly MACRO_PATTERN = /\{\{([^}]+)\}\}/g;

    /**
     * 텍스트에서 모든 매크로 찾기
     */
    static findMacros(text: string): ParsedMacro[] {
        const macros: ParsedMacro[] = [];
        let match;

        while ((match = this.MACRO_PATTERN.exec(text)) !== null) {
            const fullMatch = match[0];
            const content = match[1];
            if (fullMatch && content) {
                const parsed = this.parseMacro(fullMatch, content);
                if (parsed) {
                    macros.push(parsed);
                }
            }
        }

        // Reset regex lastIndex
        this.MACRO_PATTERN.lastIndex = 0;

        return macros;
    }

    /**
     * 단일 매크로 파싱
     */
    private static parseMacro(fullMatch: string, content: string): ParsedMacro | null {
        const trimmed = content.trim();

        // {{task:ID}} 또는 {{task:ID.field}}
        if (trimmed.startsWith('task:')) {
            const parts = trimmed.substring(5).split('.');
            const firstPart = parts[0] ?? '';
            const taskId = parseInt(firstPart, 10);
            if (!isNaN(taskId)) {
                return {
                    fullMatch,
                    type: 'task',
                    taskId,
                    field: parts[1] ?? 'content',
                };
            }
        }

        // {{prev}} or {{prev - N}} handling
        if (trimmed.startsWith('prev')) {
            // Regex to match: prev, prev-1, prev - 1, prev.field, prev-1.field
            const prevMatch = trimmed.match(/^prev\s*(?:-\s*(\d+))?(?:\.(.+))?$/);
            if (prevMatch) {
                const offsetStr = prevMatch[1];
                const field = prevMatch[2] ?? 'content';
                const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

                return {
                    fullMatch,
                    type: 'prev',
                    field,
                    offset,
                };
            }
        }

        // {{all_results}} 또는 {{all_results.summary}}
        if (trimmed === 'all_results' || trimmed.startsWith('all_results.')) {
            const parts = trimmed.split('.');
            return {
                fullMatch,
                type: 'all_results',
                field: parts[1] ?? 'full',
            };
        }

        // {{var:NAME}}
        if (trimmed.startsWith('var:')) {
            return {
                fullMatch,
                type: 'var',
                varName: trimmed.substring(4),
            };
        }

        // {{date}}
        if (trimmed === 'date') {
            return {
                fullMatch,
                type: 'date',
            };
        }

        // {{datetime}}
        if (trimmed === 'datetime') {
            return {
                fullMatch,
                type: 'datetime',
            };
        }

        // {{project.name}} 또는 {{project.description}}
        if (trimmed.startsWith('project.')) {
            return {
                fullMatch,
                type: 'project',
                field: trimmed.substring(8),
            };
        }

        // 기존 호환성: {{previous_result}}
        if (trimmed === 'previous_result') {
            return {
                fullMatch,
                type: 'prev',
                field: 'output',
            };
        }

        return null;
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
        const result = context.previousResults.find((r) => r.taskId === taskId);

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

            case 'summary':
                const content = this.extractContentForMacro(result.output, result.taskId);
                return content.length > 500 ? content.substring(0, 500) + '...' : content;

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
     * 사용 가능한 매크로 제안 목록 생성
     */
    static getSuggestions(dependentTaskIds: number[], variables: string[]): MacroSuggestion[] {
        const suggestions: MacroSuggestion[] = [];

        // 의존성 태스크 매크로
        for (const taskId of dependentTaskIds) {
            suggestions.push({
                macro: `{{task:${taskId}}}`,
                description: `Task #${taskId}의 결과 (content)`,
                example: `{{task:${taskId}}}`,
                category: 'dependency',
            });
            suggestions.push({
                macro: `{{task:${taskId}.summary}}`,
                description: `Task #${taskId}의 결과 요약 (500자)`,
                example: `{{task:${taskId}.summary}}`,
                category: 'dependency',
            });
            suggestions.push({
                macro: `{{task:${taskId}.output}}`,
                description: `Task #${taskId}의 전체 output (JSON)`,
                example: `{{task:${taskId}.output}}`,
                category: 'dependency',
            });
        }

        // 이전 태스크 매크로
        suggestions.push({
            macro: '{{prev}}',
            description: '바로 이전 태스크의 결과',
            example: '{{prev}}',
            category: 'dependency',
        });
        suggestions.push({
            macro: '{{prev.summary}}',
            description: '이전 태스크 결과 요약',
            example: '{{prev.summary}}',
            category: 'dependency',
        });
        suggestions.push({
            macro: '{{all_results}}',
            description: '모든 이전 결과 (JSON)',
            example: '{{all_results}}',
            category: 'dependency',
        });
        suggestions.push({
            macro: '{{all_results.summary}}',
            description: '모든 이전 결과 요약',
            example: '{{all_results.summary}}',
            category: 'dependency',
        });

        // 컨텍스트 변수
        for (const varName of variables) {
            suggestions.push({
                macro: `{{var:${varName}}}`,
                description: `변수 '${varName}'의 값`,
                example: `{{var:${varName}}}`,
                category: 'context',
            });
        }

        // 시스템 매크로
        suggestions.push({
            macro: '{{date}}',
            description: '오늘 날짜 (YYYY-MM-DD)',
            example: '{{date}}',
            category: 'system',
        });
        suggestions.push({
            macro: '{{datetime}}',
            description: '현재 날짜/시간 (ISO)',
            example: '{{datetime}}',
            category: 'system',
        });
        suggestions.push({
            macro: '{{project.name}}',
            description: '프로젝트 이름',
            example: '{{project.name}}',
            category: 'system',
        });
        suggestions.push({
            macro: '{{project.description}}',
            description: '프로젝트 설명',
            example: '{{project.description}}',
            category: 'system',
        });

        return suggestions;
    }

    /**
     * 매크로 유효성 검사
     */
    static validateMacros(
        text: string,
        availableTaskIds: number[],
        availableVariables: string[]
    ): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        const macros = this.findMacros(text);

        for (const macro of macros) {
            switch (macro.type) {
                case 'task':
                    if (!availableTaskIds.includes(macro.taskId!)) {
                        errors.push(
                            `Task #${macro.taskId}은(는) 의존성에 포함되어 있지 않습니다. 먼저 의존성을 설정해주세요.`
                        );
                    }
                    break;

                case 'var':
                    if (!availableVariables.includes(macro.varName!)) {
                        errors.push(`변수 '${macro.varName}'이(가) 정의되어 있지 않습니다.`);
                    }
                    break;
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * 프롬프트에 매크로 미리보기 (실제 값 대신 설명으로 대체)
     */
    static previewMacros(text: string, _dependentTaskIds?: number[]): string {
        let result = text;
        const macros = this.findMacros(text);

        for (const macro of macros) {
            let preview: string;

            switch (macro.type) {
                case 'task':
                    preview = `[📋 Task #${macro.taskId}의 ${macro.field}]`;
                    break;
                case 'prev':
                    preview = `[⬆️ 이전 태스크의 ${macro.field}]`;
                    break;
                case 'all_results':
                    preview = `[📚 모든 이전 결과${macro.field === 'summary' ? ' 요약' : ''}]`;
                    break;
                case 'var':
                    preview = `[🔤 변수: ${macro.varName}]`;
                    break;
                case 'date':
                    preview = `[📅 ${new Date().toISOString().split('T')[0]}]`;
                    break;
                case 'datetime':
                    preview = `[🕐 ${new Date().toISOString()}]`;
                    break;
                case 'project':
                    preview = `[📁 프로젝트 ${macro.field}]`;
                    break;
                default:
                    preview = macro.fullMatch;
            }

            result = result.replace(macro.fullMatch, preview);
        }

        return result;
    }
}

// 싱글톤 export
export const promptMacroService = new PromptMacroService();
