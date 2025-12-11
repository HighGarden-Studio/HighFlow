/**
 * Notification Configuration Types
 *
 * Shared types for 3-tier Slack/Webhook integration
 */

export type NotificationEvent =
    | 'task.status-changed'
    | 'task.in-review'
    | 'task.completed'
    | 'task.failed'
    | 'task.result-ready';

export interface SlackNotificationConfig {
    enabled: boolean;
    channelId?: string;
    webhookUrl?: string;
    events: NotificationEvent[];
    includeResults?: boolean;
    includeImages?: boolean;
}

export interface WebhookNotificationConfig {
    enabled: boolean;
    url?: string;
    secret?: string;
    events: NotificationEvent[];
    headers?: Record<string, string>;
}

export interface NotificationConfig {
    slack?: SlackNotificationConfig;
    webhook?: WebhookNotificationConfig;
}

export interface TaskExecutionMetadata {
    duration: number;
    cost?: number;
    tokenUsage?: {
        input: number;
        output: number;
        total: number;
    };
    provider?: string;
    model?: string;
}
