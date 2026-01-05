import type { AiResult } from '@core/types/ai';

export interface TaskResultPayload {
    aiResult: AiResult | null;
    content: string;
    provider?: string;
    model?: string;
    language?: string;
    files?: Array<{
        path: string;
        absolutePath: string;
        type: 'add' | 'modify' | 'delete';
        content?: string;
        size?: number;
        extension?: string;
    }>;
}

type TaskLike = {
    executionResult?: {
        content?: string;
        aiResult?: unknown;
        provider?: string;
        model?: string;
        language?: string;
        text?: string;
        files?: Array<{
            path: string;
            absolutePath: string;
            type: 'add' | 'modify' | 'delete';
            content?: string;
            size?: number;
            extension?: string;
        }>;
    } | null;
    aiReviewResult?: {
        content?: string;
        aiResult?: unknown;
    } | null;
    aiResult?: unknown;
    result?: string;
    codeLanguage?: string;
};

export function normalizeAiResult(input: unknown): AiResult | null {
    if (!input) {
        return null;
    }
    if (typeof input === 'string') {
        try {
            return JSON.parse(input) as AiResult;
        } catch {
            return null;
        }
    }
    if (typeof input === 'object') {
        return input as AiResult;
    }
    return null;
}

export function extractTaskResult(task?: TaskLike | null): TaskResultPayload {
    if (!task) {
        return {
            aiResult: null,
            content: '',
        };
    }

    let executionResult = task.executionResult || null;
    let aiReviewResult = task.aiReviewResult || null;

    // Handle stringified execution result
    if (typeof executionResult === 'string') {
        try {
            executionResult = JSON.parse(executionResult);
        } catch (e) {
            console.error('Failed to parse executionResult in helper:', e);
            executionResult = null;
        }
    }

    // Handle stringified review result
    if (typeof aiReviewResult === 'string') {
        try {
            aiReviewResult = JSON.parse(aiReviewResult);
        } catch (e) {
            console.error('Failed to parse aiReviewResult in helper:', e);
            aiReviewResult = null;
        }
    }

    const aiResult =
        normalizeAiResult(executionResult?.aiResult) ||
        normalizeAiResult(aiReviewResult?.aiResult) ||
        normalizeAiResult(task.aiResult);

    const content =
        aiResult?.value ??
        executionResult?.content ??
        executionResult?.text ??
        aiReviewResult?.content ??
        task.result ??
        '';

    const provider = executionResult?.provider || aiResult?.meta?.provider;
    const model = executionResult?.model || aiResult?.meta?.model;
    const language =
        aiResult?.meta?.language || executionResult?.language || task.codeLanguage || undefined;

    return {
        aiResult,
        content,
        provider: provider || undefined,
        model: model || undefined,
        language,
        files: executionResult?.files || [],
    };
}
