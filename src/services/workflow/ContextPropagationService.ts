/**
 * Context Propagation Service
 *
 * Manages the flow of data between tasks in a workflow.
 * Allows Task B to automatically receive Task A's results as input context.
 *
 * Features:
 * - Automatic context injection from parent/predecessor tasks
 * - Configurable propagation modes (full, summary, selective)
 * - Context transformation and filtering
 * - Circular dependency detection
 */

import type { TaskResult } from './types';

// ========================================
// Types
// ========================================

export type PropagationMode = 'full' | 'summary' | 'selective' | 'none';

export interface ContextPropagationConfig {
    /** Enable/disable context propagation */
    enabled: boolean;
    /** How to propagate context: full output, summary, or selective fields */
    mode: PropagationMode;
    /** Maximum context size in characters (to avoid token limits) */
    maxContextSize: number;
    /** Fields to include when mode is 'selective' */
    includeFields?: string[];
    /** Fields to exclude */
    excludeFields?: string[];
    /** Whether to include parent task results */
    includeParentResults: boolean;
    /** Whether to include sibling task results (parallel tasks) */
    includeSiblingResults: boolean;
    /** Custom context template */
    contextTemplate?: string;
    /** Summarization prompt for 'summary' mode */
    summarizationPrompt?: string;
}

export interface PropagatedContext {
    /** Previous task results formatted for injection */
    previousResults: FormattedResult[];
    /** Aggregated context string ready for prompt injection */
    contextString: string;
    /** Variables extracted from previous results */
    extractedVariables: Record<string, unknown>;
    /** Total size of context */
    totalSize: number;
    /** Warning if context was truncated */
    wasTruncated: boolean;
}

export interface FormattedResult {
    taskId: number;
    taskTitle: string;
    status: string;
    output: string;
    summary?: string;
    timestamp: Date;
}

export interface TaskDependency {
    taskId: number;
    dependsOn: number[];
    contextConfig?: Partial<ContextPropagationConfig>;
}

// ========================================
// Default Configuration
// ========================================

const DEFAULT_CONFIG: ContextPropagationConfig = {
    enabled: true,
    mode: 'summary',
    maxContextSize: 8000, // ~2000 tokens
    includeParentResults: true,
    includeSiblingResults: false,
    excludeFields: ['metadata', 'raw', 'debug'],
};

const DEFAULT_SUMMARIZATION_PROMPT = `
다음 태스크 결과를 300자 이내로 요약해주세요. 핵심 정보와 다음 태스크에 필요한 내용만 포함하세요:
`;

// ========================================
// Context Propagation Service
// ========================================

class ContextPropagationService {
    private taskConfigs: Map<number, ContextPropagationConfig> = new Map();
    private taskDependencies: Map<number, number[]> = new Map();
    private resultCache: Map<number, TaskResult> = new Map();

    /**
     * Configure context propagation for a specific task
     */
    configureTask(taskId: number, config: Partial<ContextPropagationConfig>): void {
        const mergedConfig = { ...DEFAULT_CONFIG, ...config };
        this.taskConfigs.set(taskId, mergedConfig);
    }

    /**
     * Set task dependencies (which tasks a task depends on)
     */
    setDependencies(taskId: number, dependsOn: number[]): void {
        // Check for circular dependencies
        if (this.wouldCreateCircularDependency(taskId, dependsOn)) {
            throw new Error(`Circular dependency detected for task ${taskId}`);
        }
        this.taskDependencies.set(taskId, dependsOn);
    }

    /**
     * Cache a task result for later propagation
     */
    cacheResult(taskId: number, result: TaskResult): void {
        this.resultCache.set(taskId, result);
    }

    /**
     * Get propagated context for a task
     */
    async getPropagatedContext(
        taskId: number,
        allResults: TaskResult[],
        taskTitles: Map<number, string>
    ): Promise<PropagatedContext> {
        const config = this.taskConfigs.get(taskId) || DEFAULT_CONFIG;

        if (!config.enabled) {
            return this.createEmptyContext();
        }

        // Get dependent task results
        const dependencies = this.taskDependencies.get(taskId) || [];
        const relevantResults = this.getRelevantResults(taskId, dependencies, allResults, config);

        // Format results based on mode
        const formattedResults = await this.formatResults(relevantResults, taskTitles, config);

        // Build context string
        const contextString = this.buildContextString(formattedResults, config);

        // Extract variables
        const extractedVariables = this.extractVariables(relevantResults);

        // Check if truncation occurred
        const wasTruncated = contextString.length >= config.maxContextSize;

        return {
            previousResults: formattedResults,
            contextString,
            extractedVariables,
            totalSize: contextString.length,
            wasTruncated,
        };
    }

    /**
     * Create context injection prompt
     */
    createContextInjectionPrompt(context: PropagatedContext, taskPrompt: string): string {
        if (!context.contextString || context.previousResults.length === 0) {
            return taskPrompt;
        }

        return `
## 이전 태스크 결과 (컨텍스트)

${context.contextString}

---

## 현재 태스크

${taskPrompt}

---

**참고**: 위의 이전 태스크 결과를 참고하여 현재 태스크를 수행해주세요.
${context.wasTruncated ? '(일부 컨텍스트가 길이 제한으로 인해 생략되었습니다)' : ''}
`;
    }

    /**
     * Get default configuration
     */
    getDefaultConfig(): ContextPropagationConfig {
        return { ...DEFAULT_CONFIG };
    }

    /**
     * Update global default configuration
     */
    setDefaultConfig(config: Partial<ContextPropagationConfig>): void {
        Object.assign(DEFAULT_CONFIG, config);
    }

    // ========================================
    // Private Methods
    // ========================================

    private getRelevantResults(
        taskId: number,
        dependencies: number[],
        allResults: TaskResult[],
        config: ContextPropagationConfig
    ): TaskResult[] {
        const relevant: TaskResult[] = [];

        // Add explicit dependencies
        for (const depId of dependencies) {
            const result =
                allResults.find((r) => r.taskId === depId) || this.resultCache.get(depId);
            if (result && result.status === 'success') {
                relevant.push(result);
            }
        }

        // If no explicit dependencies, use all previous results
        if (relevant.length === 0 && config.includeParentResults) {
            // Get results in order (assuming taskId order represents execution order)
            const previousResults = allResults
                .filter((r) => r.taskId < taskId && r.status === 'success')
                .sort((a, b) => a.taskId - b.taskId);
            relevant.push(...previousResults);
        }

        return relevant;
    }

    private async formatResults(
        results: TaskResult[],
        taskTitles: Map<number, string>,
        config: ContextPropagationConfig
    ): Promise<FormattedResult[]> {
        const formatted: FormattedResult[] = [];

        for (const result of results) {
            const title = taskTitles.get(result.taskId) || `Task #${result.taskId}`;
            let output = this.extractOutput(result.output, config);

            // Apply mode-specific formatting
            if (config.mode === 'summary') {
                output = this.summarizeOutput(output, config);
            } else if (config.mode === 'selective' && config.includeFields) {
                output = this.selectFields(result.output, config.includeFields);
            }

            formatted.push({
                taskId: result.taskId,
                taskTitle: title,
                status: result.status,
                output,
                timestamp: result.endTime,
            });
        }

        return formatted;
    }

    private extractOutput(output: unknown, config: ContextPropagationConfig): string {
        if (typeof output === 'string') {
            return output;
        }

        if (typeof output === 'object' && output !== null) {
            // Handle common output structures
            const obj = output as Record<string, unknown>;

            if (obj.content) {
                return String(obj.content);
            }
            if (obj.result) {
                return String(obj.result);
            }
            if (obj.text) {
                return String(obj.text);
            }

            // Filter out excluded fields
            const filtered = { ...obj };
            for (const field of config.excludeFields || []) {
                delete filtered[field];
            }

            let resultString = JSON.stringify(filtered, null, 2);

            // Check for attachments and append them if they are text-based
            // This is crucial for LocalFileProvider which returns a summary in 'text' but content in 'attachments'
            if (
                obj.metadata &&
                typeof obj.metadata === 'object' &&
                (obj.metadata as any).attachments
            ) {
                const attachments = (obj.metadata as any).attachments as any[];
                if (Array.isArray(attachments) && attachments.length > 0) {
                    const textAttachments = attachments.filter(
                        (a) => a.encoding === 'text' && a.value
                    );
                    if (textAttachments.length > 0) {
                        resultString += '\n\n### Attached Files Content:\n';
                        for (const att of textAttachments) {
                            resultString += `\n#### File: ${att.name}\n\`\`\`\n${att.value}\n\`\`\`\n`;
                        }
                    }
                }
            }

            return resultString;
        }

        return String(output);
    }

    private summarizeOutput(output: string, config: ContextPropagationConfig): string {
        // Simple truncation-based summarization
        // In production, this could call an AI to generate a proper summary
        const maxLength = Math.floor(config.maxContextSize / 3); // 1/3 of max per result

        if (output.length <= maxLength) {
            return output;
        }

        // Try to find a good breakpoint
        const truncated = output.slice(0, maxLength);
        const lastPeriod = truncated.lastIndexOf('.');
        const lastNewline = truncated.lastIndexOf('\n');
        const breakpoint = Math.max(lastPeriod, lastNewline, maxLength - 100);

        return truncated.slice(0, breakpoint + 1) + '\n... (요약됨)';
    }

    private selectFields(output: unknown, fields: string[]): string {
        if (typeof output !== 'object' || output === null) {
            return String(output);
        }

        const obj = output as Record<string, unknown>;
        const selected: Record<string, unknown> = {};

        for (const field of fields) {
            if (field in obj) {
                selected[field] = obj[field];
            }
        }

        return JSON.stringify(selected, null, 2);
    }

    private buildContextString(
        results: FormattedResult[],
        config: ContextPropagationConfig
    ): string {
        if (results.length === 0) {
            return '';
        }

        // Use custom template if provided
        if (config.contextTemplate) {
            return this.applyTemplate(results, config.contextTemplate);
        }

        // Default formatting
        const parts: string[] = [];

        for (const result of results) {
            parts.push(`### ${result.taskTitle} (Task #${result.taskId})`);
            parts.push(`상태: ${result.status}`);
            parts.push(`완료 시간: ${result.timestamp.toLocaleString()}`);
            parts.push('');
            parts.push('**결과:**');
            parts.push(result.output);
            parts.push('');
            parts.push('---');
            parts.push('');
        }

        let contextString = parts.join('\n');

        // Truncate if necessary
        if (contextString.length > config.maxContextSize) {
            contextString = contextString.slice(0, config.maxContextSize - 20) + '\n\n... (생략됨)';
        }

        return contextString;
    }

    private applyTemplate(results: FormattedResult[], template: string): string {
        let output = template;

        // Replace placeholders
        const resultsJson = JSON.stringify(results, null, 2);
        output = output.replace(/\{\{results\}\}/g, resultsJson);
        output = output.replace(/\{\{count\}\}/g, String(results.length));

        // Per-result templates
        const perResultMatch = template.match(/\{\{#each\}\}([\s\S]*?)\{\{\/each\}\}/);
        if (perResultMatch) {
            const perResultTemplate = perResultMatch[1];
            const perResultOutputs = results.map((result) => {
                return perResultTemplate
                    .replace(/\{\{taskId\}\}/g, String(result.taskId))
                    .replace(/\{\{title\}\}/g, result.taskTitle)
                    .replace(/\{\{status\}\}/g, result.status)
                    .replace(/\{\{output\}\}/g, result.output);
            });
            output = output.replace(
                /\{\{#each\}\}[\s\S]*?\{\{\/each\}\}/,
                perResultOutputs.join('\n')
            );
        }

        return output;
    }

    private extractVariables(results: TaskResult[]): Record<string, unknown> {
        const variables: Record<string, unknown> = {};

        for (const result of results) {
            const prefix = `task_${result.taskId}`;

            if (typeof result.output === 'object' && result.output !== null) {
                const obj = result.output as Record<string, unknown>;
                for (const [key, value] of Object.entries(obj)) {
                    variables[`${prefix}_${key}`] = value;
                }
            } else {
                variables[`${prefix}_output`] = result.output;
            }

            variables[`${prefix}_status`] = result.status;
            variables[`${prefix}_duration`] = result.duration;
        }

        return variables;
    }

    private wouldCreateCircularDependency(taskId: number, newDependencies: number[]): boolean {
        const visited = new Set<number>();
        const stack = [...newDependencies];

        while (stack.length > 0) {
            const current = stack.pop()!;

            if (current === taskId) {
                return true; // Found circular dependency
            }

            if (visited.has(current)) {
                continue;
            }

            visited.add(current);
            const deps = this.taskDependencies.get(current);
            if (deps) {
                stack.push(...deps);
            }
        }

        return false;
    }

    private createEmptyContext(): PropagatedContext {
        return {
            previousResults: [],
            contextString: '',
            extractedVariables: {},
            totalSize: 0,
            wasTruncated: false,
        };
    }

    /**
     * Clear all cached data
     */
    clear(): void {
        this.taskConfigs.clear();
        this.taskDependencies.clear();
        this.resultCache.clear();
    }
}

// Export singleton instance
export const contextPropagationService = new ContextPropagationService();

// Export composable
export function useContextPropagation() {
    return {
        configureTask: (taskId: number, config: Partial<ContextPropagationConfig>) =>
            contextPropagationService.configureTask(taskId, config),
        setDependencies: (taskId: number, dependsOn: number[]) =>
            contextPropagationService.setDependencies(taskId, dependsOn),
        cacheResult: (taskId: number, result: TaskResult) =>
            contextPropagationService.cacheResult(taskId, result),
        getPropagatedContext: (
            taskId: number,
            allResults: TaskResult[],
            taskTitles: Map<number, string>
        ) => contextPropagationService.getPropagatedContext(taskId, allResults, taskTitles),
        createContextInjectionPrompt: (context: PropagatedContext, taskPrompt: string) =>
            contextPropagationService.createContextInjectionPrompt(context, taskPrompt),
        getDefaultConfig: () => contextPropagationService.getDefaultConfig(),
        setDefaultConfig: (config: Partial<ContextPropagationConfig>) =>
            contextPropagationService.setDefaultConfig(config),
        clear: () => contextPropagationService.clear(),
    };
}
