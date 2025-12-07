/**
 * Project Claude Sync Service
 *
 * Manages synchronization state between projects and Claude Desktop settings.
 * Tracks when settings should auto-sync and when they've been manually overridden.
 */

import type { Project } from '@core/types/database';

interface ProjectMetadata {
    claudeCodeIntegration?: boolean; // Whether settings were synced from Claude
    settingsOverridden?: boolean; // Whether user manually changed settings
    lastSyncedAt?: string; // ISO timestamp of last sync
    [key: string]: any;
}

export class ProjectClaudeSyncService {
    /**
     * Check if project settings should sync with Claude Desktop config
     */
    shouldSyncWithClaude(project: Project): boolean {
        const metadata = project.metadata as ProjectMetadata;

        // Only sync if:
        // 1. Project was created from Claude Code repo
        // 2. Settings have not been manually overridden
        return !!(metadata?.claudeCodeIntegration && !metadata?.settingsOverridden);
    }

    /**
     * Check if project was created from Claude Code repo
     */
    isClaudeCodeProject(project: Project): boolean {
        const metadata = project.metadata as ProjectMetadata;
        return !!metadata?.claudeCodeIntegration;
    }

    /**
     * Mark project settings as manually overridden (stops auto-sync)
     */
    markAsOverridden(project: Project): Partial<Project> {
        const metadata = (project.metadata || {}) as ProjectMetadata;

        return {
            metadata: {
                ...metadata,
                settingsOverridden: true,
                lastModifiedAt: new Date().toISOString(),
            } as any,
        };
    }

    /**
     * Update project with Claude settings if sync is enabled
     * Returns true if sync was performed, false otherwise
     */
    async syncIfNeeded(projectId: number, project: Project, getAPI: () => any): Promise<boolean> {
        if (!this.shouldSyncWithClaude(project)) {
            return false;
        }

        try {
            // Read Claude Desktop settings
            const claudeConfig = await (window as any).electron?.fs?.readClaudeSettings();
            if (!claudeConfig) {
                console.log('[ProjectClaudeSync] No Claude Desktop config found');
                return false;
            }

            // Parse settings
            const { claudeCodeSettingsParser } = await import('./ClaudeCodeSettingsParser');
            const settings = claudeCodeSettingsParser.parseSettings(claudeConfig);

            if (!settings) {
                console.log('[ProjectClaudeSync] Failed to parse Claude settings');
                return false;
            }

            // Update project
            const api = getAPI();
            const metadata = project.metadata as ProjectMetadata;

            await api.projects.update(projectId, {
                aiProvider: settings.aiProvider,
                aiModel: settings.aiModel,
                mcpConfig: settings.mcpConfig,
                metadata: {
                    ...metadata,
                    lastSyncedAt: new Date().toISOString(),
                },
            });

            console.log('[ProjectClaudeSync] Successfully synced with Claude Desktop settings');
            return true;
        } catch (error) {
            console.error('[ProjectClaudeSync] Failed to sync with Claude settings:', error);
            return false;
        }
    }

    /**
     * Get sync status description for UI display
     */
    getSyncStatusText(project: Project): string | null {
        const metadata = project.metadata as ProjectMetadata;

        if (!metadata?.claudeCodeIntegration) {
            return null;
        }

        if (metadata.settingsOverridden) {
            return 'Claude Code 설정 연동 해제됨';
        }

        if (metadata.lastSyncedAt) {
            const date = new Date(metadata.lastSyncedAt);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);

            if (diffMins < 1) {
                return 'Claude Code와 동기화됨 (방금)';
            } else if (diffMins < 60) {
                return `Claude Code와 동기화됨 (${diffMins}분 전)`;
            } else {
                const diffHours = Math.floor(diffMins / 60);
                return `Claude Code와 동기화됨 (${diffHours}시간 전)`;
            }
        }

        return 'Claude Code와 동기화됨';
    }

    /**
     * Get sync status badge color
     */
    getSyncStatusColor(project: Project): 'green' | 'gray' | null {
        const metadata = project.metadata as ProjectMetadata;

        if (!metadata?.claudeCodeIntegration) {
            return null;
        }

        return metadata.settingsOverridden ? 'gray' : 'green';
    }
}

// Export singleton instance
export const projectClaudeSyncService = new ProjectClaudeSyncService();
