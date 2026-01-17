import { WebClient } from '@slack/web-api';
import type { OutputConnector, OutputResult } from '../OutputConnector';
import type { OutputTaskConfig } from '@core/types/database';

export class SlackConnector implements OutputConnector {
    readonly id = 'slack';

    async validate(config: OutputTaskConfig): Promise<boolean> {
        return config.destination === 'slack' && !!config.slack?.channelId;
    }

    async execute(
        config: OutputTaskConfig,
        content: string,
        _context: { basePath: string; taskId?: string; project?: any }
    ): Promise<OutputResult> {
        try {
            if (config.destination !== 'slack' || !config.slack) {
                return { success: false, error: 'Misconfigured Slack connector' };
            }

            const { channelId } = config.slack;
            const token = process.env.SLACK_BOT_TOKEN; // Or from a secure store/config

            if (!token) {
                // In production, might fetch from Settings/DB
                return {
                    success: false,
                    error: 'Slack Bot Token not configured (env SLACK_BOT_TOKEN missing)',
                };
            }

            if (!channelId) {
                return { success: false, error: 'Slack Channel ID not specified' };
            }

            const client = new WebClient(token);

            // Post message
            const response = await client.chat.postMessage({
                channel: channelId,
                text: content,
                // blocks: ... (could parse markdown to blocks eventually)
            });

            if (response.ok) {
                return {
                    success: true,
                    data: {
                        ts: response.ts,
                        channel: response.channel,
                        messageId: response.message?.ts,
                    },
                };
            } else {
                return {
                    success: false,
                    error: response.error?.toString() || 'Unknown Slack error',
                };
            }
        } catch (error: any) {
            console.error('Slack Connector Error:', error);
            return { success: false, error: error.message };
        }
    }
}
