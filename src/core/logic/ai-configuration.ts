/**
 * Core AI Configuration Logic
 *
 * Shared logic for resolving AI provider and model configuration
 * across Task, Project, and Global levels.
 */

import type { AIProvider } from '../types/database';
import type { Task, Project } from '../types/database';

export interface AIConfiguration {
    provider: AIProvider | null;
    model: string | null;
    source: 'task' | 'project' | 'global' | 'none';
}

export interface DefaultSettings {
    defaultProvider?: AIProvider;
    defaultModel?: string;
}

/**
 * Resolve the effective AI Provider and Model for execution.
 * Hierarchy: Task > Project > Global Default
 */
export function resolveAIProvider(
    task: Task | null | undefined,
    project: Project | null | undefined,
    defaults?: DefaultSettings
): AIConfiguration {
    // 1. Task Level
    if (task?.aiProvider) {
        return {
            provider: task.aiProvider,
            model: task.aiModel || defaults?.defaultModel || '',
            source: 'task',
        };
    }

    // 2. Project Level
    if (project?.aiProvider) {
        return {
            provider: project.aiProvider,
            model: project.aiModel || defaults?.defaultModel || '',
            source: 'project',
        };
    }

    // 3. Global Level
    if (defaults?.defaultProvider) {
        return {
            provider: defaults.defaultProvider,
            model: defaults.defaultModel || '',
            source: 'global',
        };
    }

    return {
        provider: null,
        model: null,
        source: 'none',
    };
}

/**
 * Resolve the effective AI Provider and Model for Auto-Review.
 * Hierarchy:
 * 1. Task Review Settings (task.reviewAiProvider)
 * 2. Project Auto-Review Settings (project.metadata.autoReviewProvider)
 * 3. Project Default Settings (project.aiProvider)
 * 4. Global Default
 */
export function resolveAutoReviewProvider(
    task: Task | null | undefined,
    project: Project | null | undefined,
    defaults?: DefaultSettings
): AIConfiguration {
    // 1. Task Review Settings
    if (task?.reviewAiProvider) {
        return {
            provider: task.reviewAiProvider,
            model: task.reviewAiModel || defaults?.defaultModel || '',
            source: 'task',
        };
    }

    // 2. Project Auto-Review Settings
    // metadata is explicitly typed as 'any' in Project interface, but we treat it safely
    const metadata = project?.metadata as Record<string, any> | undefined;
    if (metadata?.autoReviewProvider) {
        return {
            provider: metadata.autoReviewProvider as AIProvider,
            model: (metadata.autoReviewModel as string) || defaults?.defaultModel || '',
            source: 'project', // Specifically project auto-review override
        };
    }

    // 3. Project Default Settings (Inheritance)
    if (project?.aiProvider) {
        return {
            provider: project.aiProvider,
            model: project.aiModel || defaults?.defaultModel || '',
            source: 'project', // Inherited from project default
        };
    }

    // 4. Global Level
    if (defaults?.defaultProvider) {
        return {
            provider: defaults.defaultProvider,
            model: defaults.defaultModel || '',
            source: 'global',
        };
    }

    return {
        provider: null,
        model: null,
        source: 'none',
    };
}
