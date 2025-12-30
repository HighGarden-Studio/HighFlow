/**
 * Task Notification Service
 *
 * Handles sending Slack and Webhook notifications for task events
 */

import { BrowserWindow } from 'electron';
import { notificationResolver } from './notification-resolver';
import { db } from '../database/client';
import { tasks, projects } from '../database/schema';
import { eq, and } from 'drizzle-orm';
import type { Task } from '../database/schema';
import type { TaskExecutionMetadata, NotificationEvent } from '@core/types/notifications';
import {
    extractImages,
    filterCodeBlocks,
    extractSummary,
    isPrimarilyCode,
} from '../utils/result-processor';

export class TaskNotificationService {
    private mainWindow: BrowserWindow | null = null;

    initialize(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
        console.log('[TaskNotificationService] Initialized');
    }

    /**
     * Notify task status change
     */
    async notifyStatusChange(
        projectId: number,
        sequence: number,
        oldStatus: string,
        newStatus: string
    ) {
        const config = await notificationResolver.resolveConfig(projectId, sequence);
        if (!config) return;

        const shouldNotify =
            config.slack?.events.includes('task.status-changed') ||
            config.webhook?.events.includes('task.status-changed');

        if (!shouldNotify) return;

        const task = await this.getTask(projectId, sequence);
        if (!task) return;

        const project = task.projectId ? await this.getProject(task.projectId) : null;

        console.log(
            `[TaskNotificationService] Notifying status change: ${task.title} (${oldStatus} → ${newStatus})`
        );

        // Send Slack notification
        if (config.slack?.enabled && config.slack.events.includes('task.status-changed')) {
            await this.sendSlackNotification(config.slack, {
                task,
                project,
                event: 'status-changed',
                oldStatus,
                newStatus,
            });
        }

        // Send Webhook notification
        if (config.webhook?.enabled && config.webhook.events.includes('task.status-changed')) {
            await this.sendWebhookNotification(config.webhook, {
                event: 'task.status-changed',
                task: {
                    id: `${task.projectId}-${task.projectSequence}`,
                    title: task.title,
                    status: newStatus,
                    oldStatus,
                    projectId: task.projectId,
                    projectName: project?.name,
                },
            });
        }
    }

    /**
     * Notify task completion with results
     */
    async notifyCompletion(
        projectId: number,
        sequence: number,
        result: string,
        metadata?: TaskExecutionMetadata
    ) {
        const config = await notificationResolver.resolveConfig(projectId, sequence);

        console.log(
            `[TaskNotificationService] notifyCompletion config for ${projectId}:${sequence}:`,
            JSON.stringify(config, null, 2)
        );

        if (!config) return;

        const shouldNotify =
            config.slack?.events.includes('task.completed') ||
            config.slack?.events.includes('task.execution-complete') ||
            config.webhook?.events.includes('task.completed') ||
            config.webhook?.events.includes('task.execution-complete');

        if (!shouldNotify) {
            console.log(
                '[TaskNotificationService] notifyCompletion: Notification disabled for this event inside config'
            );
            return;
        }

        const task = await this.getTask(projectId, sequence);
        if (!task) return;

        const project = task.projectId ? await this.getProject(task.projectId) : null;

        console.log(`[TaskNotificationService] Notifying completion: ${task.title}`);

        // Process result
        const processedResult = this.processResult(result, config.slack?.includeResults);
        const images = config.slack?.includeImages ? extractImages(result) : [];

        // Send Slack notification
        if (
            config.slack?.enabled &&
            (config.slack.events.includes('task.completed') ||
                config.slack.events.includes('task.execution-complete'))
        ) {
            await this.sendSlackNotification(config.slack, {
                task,
                project,
                event: 'completed',
                result: processedResult,
                images,
                metadata,
            });
        }

        // Send Webhook notification
        if (
            config.webhook?.enabled &&
            (config.webhook.events.includes('task.completed') ||
                config.webhook.events.includes('task.execution-complete'))
        ) {
            await this.sendWebhookNotification(config.webhook, {
                event: 'task.completed',
                task: {
                    id: `${task.projectId}-${task.projectSequence}`,
                    title: task.title,
                    status: task.status,
                    projectId: task.projectId,
                    projectName: project?.name,
                },
                result: processedResult,
                metadata,
            });
        }
    }

    /**
     * Notify task in review
     */
    async notifyReviewReady(projectId: number, sequence: number, result: string) {
        const config = await notificationResolver.resolveConfig(projectId, sequence);

        console.log(
            `[TaskNotificationService] notifyReviewReady config for ${projectId}:${sequence}:`,
            JSON.stringify(config, null, 2)
        );

        if (!config) return;

        const shouldNotify =
            config.slack?.events.includes('task.in-review') ||
            config.slack?.events.includes('task.review-start') ||
            config.slack?.events.includes('task.execution-complete') ||
            config.webhook?.events.includes('task.in-review') ||
            config.webhook?.events.includes('task.review-start') ||
            config.webhook?.events.includes('task.execution-complete');

        if (!shouldNotify) {
            console.log(
                '[TaskNotificationService] notifyReviewReady: Notification disabled for this event inside config'
            );
            return;
        }

        const task = await this.getTask(projectId, sequence);
        if (!task) return;

        const project = task.projectId ? await this.getProject(task.projectId) : null;

        console.log(`[TaskNotificationService] Notifying review ready: ${task.title}`);

        const processedResult = this.processResult(result, config.slack?.includeResults);
        const images = config.slack?.includeImages ? extractImages(result) : [];

        // Send notifications similar to completion
        if (
            config.slack?.enabled &&
            (config.slack.events.includes('task.in-review') ||
                config.slack.events.includes('task.review-start') ||
                config.slack.events.includes('task.execution-complete'))
        ) {
            await this.sendSlackNotification(config.slack, {
                task,
                project,
                event: 'in-review',
                result: processedResult,
                images,
            });
        }

        if (
            config.webhook?.enabled &&
            (config.webhook.events.includes('task.in-review') ||
                config.webhook.events.includes('task.review-start'))
        ) {
            await this.sendWebhookNotification(config.webhook, {
                event: 'task.in-review',
                task: {
                    id: `${task.projectId}-${task.projectSequence}`,
                    title: task.title,
                    status: task.status,
                    projectId: task.projectId,
                    projectName: project?.name,
                },
                result: processedResult,
            });
        }
    }

    /**
     * Notify task failure
     */
    async notifyFailure(projectId: number, sequence: number, error: string) {
        const config = await notificationResolver.resolveConfig(projectId, sequence);
        if (!config) return;

        const shouldNotify =
            config.slack?.events.includes('task.failed') ||
            config.webhook?.events.includes('task.failed');

        if (!shouldNotify) return;

        const task = await this.getTask(projectId, sequence);
        if (!task) return;

        const project = task.projectId ? await this.getProject(task.projectId) : null;

        console.log(`[TaskNotificationService] Notifying failure: ${task.title}`);

        // Send Slack notification
        if (config.slack?.enabled && config.slack.events.includes('task.failed')) {
            await this.sendSlackNotification(config.slack, {
                task,
                project,
                event: 'failed',
                error,
            });
        }

        // Send Webhook notification
        if (config.webhook?.enabled && config.webhook.events.includes('task.failed')) {
            await this.sendWebhookNotification(config.webhook, {
                event: 'task.failed',
                task: {
                    id: `${task.projectId}-${task.projectSequence}`,
                    title: task.title,
                    status: task.status,
                    projectId: task.projectId,
                    projectName: project?.name,
                },
                error,
            });
        }
    }

    /**
     * Process result content
     */
    private processResult(result: string, includeResults: boolean = true): string {
        if (!includeResults) {
            return extractSummary(result, 200);
        }

        // If primarily code, just return summary
        if (isPrimarilyCode(result)) {
            return `${extractSummary(result, 100)}\n\n_[Full code output not included in notification]_`;
        }

        // Filter code blocks but keep text
        return filterCodeBlocks(result);
    }

    /**
     * Send Slack notification
     */
    private async sendSlackNotification(config: any, data: any) {
        try {
            // TODO: Integrate with SlackIntegration service
            // For now, just log
            console.log('[TaskNotificationService] Slack notification:', {
                channel: config.channelId,
                webhook: config.webhookUrl,
                event: data.event,
                task: data.task?.title,
            });

            // If webhook URL is provided, send directly
            if (config.webhookUrl) {
                await this.sendSlackWebhook(config.webhookUrl, data);
            }
        } catch (error) {
            console.error('[TaskNotificationService] Failed to send Slack notification:', error);
        }
    }

    /**
     * Send Slack webhook
     */
    private async sendSlackWebhook(webhookUrl: string, data: any) {
        const blocks = this.buildSlackBlocks(data);

        const payload = {
            text: `Task ${data.event}: ${data.task.title}`,
            blocks,
        };

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Slack webhook failed: ${response.status}`);
        }
    }

    /**
     * Build Slack blocks
     */
    private buildSlackBlocks(data: any): any[] {
        const blocks: any[] = [];

        // Header
        const emoji = this.getEventEmoji(data.event);
        blocks.push({
            type: 'header',
            text: {
                type: 'plain_text',
                text: `${emoji} Task ${data.event}`,
                emoji: true,
            },
        });

        // Task info
        let taskInfo = `*${data.task.title}*`;
        if (data.project) {
            taskInfo += `\nProject: ${data.project.name}`;
        }
        if (data.oldStatus && data.newStatus) {
            taskInfo += `\nStatus: ${data.oldStatus} → *${data.newStatus}*`;
        }

        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: taskInfo,
            },
        });

        // Result
        if (data.result) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Result:*\n${data.result}`,
                },
            });
        }

        // Metadata
        if (data.metadata) {
            const metadataText = [];
            if (data.metadata.duration) {
                metadataText.push(`⏱️ ${Math.round(data.metadata.duration / 1000)}s`);
            }
            if (data.metadata.cost) {
                metadataText.push(`💰 $${data.metadata.cost.toFixed(4)}`);
            }
            if (data.metadata.tokenUsage) {
                metadataText.push(`🔢 ${data.metadata.tokenUsage.total} tokens`);
            }

            if (metadataText.length > 0) {
                blocks.push({
                    type: 'context',
                    elements: [
                        {
                            type: 'mrkdwn',
                            text: metadataText.join(' • '),
                        },
                    ],
                });
            }
        }

        // Images
        if (data.images && data.images.length > 0) {
            for (const imageUrl of data.images.slice(0, 3)) {
                blocks.push({
                    type: 'image',
                    image_url: imageUrl,
                    alt_text: 'Task result image',
                });
            }
        }

        // Error
        if (data.error) {
            blocks.push({
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Error:*\n\`\`\`${data.error}\`\`\``,
                },
            });
        }

        return blocks;
    }

    /**
     * Send Webhook notification
     */
    private async sendWebhookNotification(config: any, payload: any) {
        try {
            if (!config.url) return;

            console.log('[TaskNotificationService] Webhook notification:', {
                url: config.url,
                event: payload.event,
            });

            const body = JSON.stringify({
                ...payload,
                timestamp: new Date().toISOString(),
            });

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'User-Agent': 'AI-Workflow-Manager/1.0',
                ...config.headers,
            };

            // Add signature if secret is provided
            if (config.secret) {
                const crypto = require('crypto');
                const signature = crypto
                    .createHmac('sha256', config.secret)
                    .update(body)
                    .digest('hex');
                headers['X-Webhook-Signature'] = `sha256=${signature}`;
            }

            const response = await fetch(config.url, {
                method: 'POST',
                headers,
                body,
                signal: AbortSignal.timeout(30000),
            });

            if (!response.ok) {
                throw new Error(`Webhook failed: ${response.status}`);
            }
        } catch (error) {
            console.error('[TaskNotificationService] Failed to send webhook:', error);
        }
    }

    /**
     * Get emoji for event type
     */
    private getEventEmoji(event: string): string {
        const emojis: Record<string, string> = {
            'status-changed': '🔄',
            completed: '✅',
            'in-review': '👀',
            failed: '❌',
            'result-ready': '📋',
        };
        return emojis[event] || '📌';
    }

    /**
     * Get task from database
     */
    private async getTask(projectId: number, sequence: number): Promise<Task | null> {
        const result = await db
            .select()
            .from(tasks)
            .where(and(eq(tasks.projectId, projectId), eq(tasks.projectSequence, sequence)))
            .limit(1);

        return (result[0] as Task) || null;
    }

    /**
     * Get project from database
     */
    private async getProject(projectId: number): Promise<any | null> {
        const result = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

        return result[0] || null;
    }

    /**
     * Send test notification
     */
    async sendTestNotification(
        projectId: number,
        sequence: number,
        config: any,
        taskInfo: { taskName?: string; taskDescription?: string | null }
    ) {
        console.log(
            `[TaskNotificationService] Sending test notification for task ${projectId}:${sequence}`
        );

        const testPayload = {
            event: 'test',
            task: {
                id: `${projectId}-${sequence}`,
                name: taskInfo.taskName || `Task ${projectId}-${sequence}`,
                description: taskInfo.taskDescription || '테스트 알림입니다.',
            },
            message:
                '🧪 알림 테스트: 이것은 테스트 메시지입니다. 실제 알림은 태스크 실행 시 전송됩니다.',
            timestamp: new Date().toISOString(),
        };

        const promises: Promise<void>[] = [];

        // Send Slack notification
        if (config.slack?.enabled && config.slack.webhookUrl) {
            promises.push(
                this.sendSlackNotification(config.slack, {
                    task: {
                        id: `${projectId}-${sequence}`,
                        title: taskInfo.taskName || `Task ${projectId}-${sequence}`,
                        description: taskInfo.taskDescription,
                    } as any,
                    project: null,
                    event: 'test' as any,
                    result: '🧪 테스트 알림입니다.',
                })
            );
        }

        // Send Webhook notification
        if (config.webhook?.enabled && config.webhook.url) {
            promises.push(this.sendWebhookNotification(config.webhook, testPayload));
        }

        await Promise.all(promises);
        console.log('[TaskNotificationService] Test notification sent');
    }
}

// Singleton instance
export const taskNotificationService = new TaskNotificationService();
