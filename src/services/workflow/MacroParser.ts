/**
 * Macro Parser Service
 *
 * Shared logic for parsing and suggesting macros.
 * Safe for use in both Main and Renderer processes (no Node.js imports).
 */

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
 * 매크로 파싱 및 제안 서비스
 */
export class MacroParser {
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

        // {{task:ID}} 또는 {{task:ID.field}} (콜론 표기)
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

        // {{task.ID}} 또는 {{task.ID.field}} (점 표기 - 통일된 표기법)
        if (trimmed.startsWith('task.')) {
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

        // {{prev}} or {{prev-N}} or {{prev.N}} handling (두 표기법 모두 지원)
        if (trimmed.startsWith('prev')) {
            // Regex to match: prev, prev-1, prev.1, prev - 1, prev.field, prev-1.field, prev.1.field
            const prevMatch = trimmed.match(/^prev\s*(?:[-.]?\s*(\d+))?(?:\.(\w+))?$/);
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
     * 사용 가능한 매크로 제안 목록 생성
     */
    static getSuggestions(dependentTaskIds: number[], variables: string[]): MacroSuggestion[] {
        const suggestions: MacroSuggestion[] = [];

        // 의존성 태스크 매크로 (최신 표기법: 띄어쓰기 없이)
        for (const taskId of dependentTaskIds) {
            suggestions.push({
                macro: `{{task.${taskId}}}`,
                description: `Task #${taskId}의 결과 (content)`,
                example: `{{task.${taskId}}}`,
                category: 'dependency',
            });
            suggestions.push({
                macro: `{{task.${taskId}.summary}}`,
                description: `Task #${taskId}의 결과 요약 (500자)`,
                example: `{{task.${taskId}.summary}}`,
                category: 'dependency',
            });
            suggestions.push({
                macro: `{{task.${taskId}.output}}`,
                description: `Task #${taskId}의 전체 output (JSON)`,
                example: `{{task.${taskId}.output}}`,
                category: 'dependency',
            });
        }

        // 이전 태스크 매크로
        suggestions.push({
            macro: '{{prev}}',
            description: '바로 이전 태스크(마지막 dependency)',
            example: '{{prev}}',
            category: 'dependency',
        });
        suggestions.push({
            macro: '{{prev.0}}',
            description: '마지막 dependency (prev와 동일)',
            example: '{{prev.0}}',
            category: 'dependency',
        });
        suggestions.push({
            macro: '{{prev.1}}',
            description: '두 번째 최근 dependency',
            example: '{{prev.1}}',
            category: 'dependency',
        });
        suggestions.push({
            macro: '{{prev.summary}}',
            description: '이전 결과 요약',
            example: '{{prev.summary}}',
            category: 'dependency',
        });
        suggestions.push({
            macro: '{{all_results}}',
            description: '모든 이전 결과 (JSON 배열)',
            example: '{{all_results}}',
            category: 'dependency',
        });
        suggestions.push({
            macro: '{{all_results.summary}}',
            description: '모든 결과 요약',
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
