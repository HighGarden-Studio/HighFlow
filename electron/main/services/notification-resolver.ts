/**
 * Notification Resolver Service
 *
 * Resolves notification configuration using 3-tier priority:
 * Task > Project > Global
 */

import { db } from '../database/client';
import { tasks, projects } from '../database/schema';
import { eq, and } from 'drizzle-orm';
import type { NotificationConfig } from '@core/types/notifications';

export class NotificationResolver {
    /**
     * Resolve notification config for a task with 3-tier priority
     */
    /**
     * Resolve notification config for a task with 3-tier priority
     */
    async resolveConfig(projectId: number, sequence: number): Promise<NotificationConfig | null> {
        // 1. Get task config
        const task = await db
            .select()
            .from(tasks)
            .where(and(eq(tasks.projectId, projectId), eq(tasks.projectSequence, sequence)))
            .limit(1);

        if (!task[0]) {
            console.error(`[NotificationResolver] Task ${projectId}-${sequence} not found`);
            return null;
        }

        const taskData = task[0];

        // Priority 1: Task-level config
        if (taskData.notificationConfig) {
            try {
                const config = JSON.parse(taskData.notificationConfig as string);
                if (this.isConfigValid(config)) {
                    console.log(
                        `[NotificationResolver] Using task-level config for task ${projectId}-${sequence}`
                    );
                    return config;
                }
            } catch (error) {
                console.error(`[NotificationResolver] Invalid task config:`, error);
            }
        }

        // Priority 2: Project-level config
        if (taskData.projectId) {
            const project = await db
                .select()
                .from(projects)
                .where(eq(projects.id, taskData.projectId))
                .limit(1);

            if (project[0]?.notificationConfig) {
                try {
                    const config = JSON.parse(project[0].notificationConfig as string);
                    if (this.isConfigValid(config)) {
                        console.log(
                            `[NotificationResolver] Using project-level config for task ${projectId}-${sequence}`
                        );
                        return config;
                    }
                } catch (error) {
                    console.error(`[NotificationResolver] Invalid project config:`, error);
                }
            }
        }

        // Priority 3: Global config
        try {
            const { settingsRepository } =
                await import('../database/repositories/settings-repository');
            const globalConfig =
                await settingsRepository.getJSON<NotificationConfig>('notification.global');

            if (globalConfig && this.isConfigValid(globalConfig)) {
                console.log(
                    `[NotificationResolver] Using global config for task ${projectId}-${sequence}`
                );
                return globalConfig;
            }
        } catch (error) {
            console.error(`[NotificationResolver] Failed to load global config:`, error);
        }

        console.log(
            `[NotificationResolver] No notification config found for task ${projectId}-${sequence}`
        );
        return null;
    }

    /**
     * Check if config is valid and enabled
     */
    private isConfigValid(config: NotificationConfig): boolean {
        if (!config) return false;

        const hasSlack =
            config.slack?.enabled &&
            (config.slack?.channelId || config.slack?.webhookUrl) &&
            config.slack?.events?.length > 0;

        const hasWebhook =
            config.webhook?.enabled && config.webhook?.url && config.webhook?.events?.length > 0;

        return hasSlack || hasWebhook;
    }

    /**
     * Get Slack config for task
     */
    async getSlackConfig(projectId: number, sequence: number) {
        const config = await this.resolveConfig(projectId, sequence);
        return config?.slack?.enabled ? config.slack : null;
    }

    /**
     * Get Webhook config for task
     */
    async getWebhookConfig(projectId: number, sequence: number) {
        const config = await this.resolveConfig(projectId, sequence);
        return config?.webhook?.enabled ? config.webhook : null;
    }
}

// Singleton instance
export const notificationResolver = new NotificationResolver();
