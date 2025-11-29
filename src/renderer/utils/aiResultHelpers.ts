import type { AiResult } from '@core/types/ai';

export interface TaskResultPayload {
    aiResult: AiResult | null;
    content: string;
    provider?: string;
    model?: string;
    language?: string;
}

type TaskLike = {
    executionResult?: {
        content?: string;
        aiResult?: unknown;
        provider?: string;
        model?: string;
        language?: string;
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

    const executionResult = task.executionResult || null;
    const aiResult =
        normalizeAiResult(executionResult?.aiResult) ||
        normalizeAiResult(task.aiResult);

    const content =
        aiResult?.value ??
        executionResult?.content ??
        task.result ??
        '';

    const provider = executionResult?.provider || aiResult?.meta?.provider;
    const model = executionResult?.model || aiResult?.meta?.model;
    const language =
        aiResult?.meta?.language ||
        executionResult?.language ||
        task.codeLanguage ||
        undefined;

    return {
        aiResult,
        content,
        provider: provider || undefined,
        model: model || undefined,
        language,
    };
}
