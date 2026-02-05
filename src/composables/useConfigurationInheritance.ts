import { useSettingsStore } from '../renderer/stores/settingsStore';
import type { Task, Project } from '@core/types/database';
import type { AIProvider } from '@core/types/ai';
import {
    resolveAIProvider as resolveCoreAIProvider,
    resolveAutoReviewProvider as resolveCoreAutoReviewProvider,
} from '../core/logic/ai-configuration';

export function useConfigurationInheritance() {
    const settingsStore = useSettingsStore();

    function getGlobalDefaults() {
        // Find default provider from settings
        // Since AIProviderConfig doesn't have isDefault, we fallback to first enabled
        const defaultProvider = settingsStore.aiProviders.find((p) => p.enabled);

        if (!defaultProvider) return undefined;

        return {
            defaultProvider: defaultProvider.id as AIProvider,
            defaultModel:
                defaultProvider.defaultModel ||
                (defaultProvider.models && defaultProvider.models[0]) ||
                'gpt-4o',
        };
    }

    /**
     * Resolve the effective AI Provider and Model.
     * Hierarchy: Task > Project > Global Default
     */
    function resolveAIProvider(task?: Task | null, project?: Project | null) {
        return resolveCoreAIProvider(task, project, getGlobalDefaults());
    }

    /**
     * Resolve the effective Auto-Review Provider and Model.
     * Hierarchy: Task Review > Project Auto-Review > Project Default > Global Default
     */
    function resolveAutoReviewProvider(task?: Task | null, project?: Project | null) {
        return resolveCoreAutoReviewProvider(task, project, getGlobalDefaults());
    }

    /**
     * Resolve the effective MCP Tools.
     */
    function resolveMCPTools(task?: Task | null, project?: Project | null) {
        // 1. Task Level
        if (task && task.requiredMCPs && task.requiredMCPs.length > 0) {
            return {
                mcpIds: task.requiredMCPs,
                config: task.mcpConfig || {},
                source: 'task' as const,
            };
        }

        // 2. Project Level
        if (project && (project as any).defaultMCPs && (project as any).defaultMCPs.length > 0) {
            return {
                mcpIds: (project as any).defaultMCPs as string[],
                config: (project as any).mcpConfig || {},
                source: 'project' as const,
            };
        }

        // 3. Global
        return {
            mcpIds: [],
            config: {},
            source: 'global' as const,
        };
    }

    return {
        resolveAIProvider,
        resolveAutoReviewProvider,
        resolveMCPTools,
    };
}
