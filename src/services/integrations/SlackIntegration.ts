/**
 * Slack Integration Service
 *
 * Provides Slack integration with OAuth, messaging, file upload,
 * slash commands, and interactive messages support.
 */

import crypto from 'crypto';

// ========================================
// Types
// ========================================

export interface SlackConfig {
    clientId: string;
    clientSecret: string;
    signingSecret: string;
    redirectUri: string;
    scopes: string[];
    botScopes: string[];
}

export interface SlackTokens {
    accessToken: string;
    botAccessToken: string;
    teamId: string;
    teamName: string;
    userId: string;
    botUserId: string;
    scope: string;
    botScope: string;
}

export interface SlackChannel {
    id: string;
    name: string;
    isPrivate: boolean;
    isArchived: boolean;
    isMember: boolean;
    memberCount?: number;
    topic?: string;
    purpose?: string;
}

export interface SlackUser {
    id: string;
    name: string;
    realName: string;
    email?: string;
    avatar: string;
    isBot: boolean;
    isAdmin: boolean;
}

export interface SlackMessage {
    channel: string;
    text?: string;
    blocks?: SlackBlock[];
    attachments?: SlackAttachment[];
    threadTs?: string;
    replyBroadcast?: boolean;
    unfurlLinks?: boolean;
    unfurlMedia?: boolean;
    mrkdwn?: boolean;
}

export interface SlackBlock {
    type: 'section' | 'divider' | 'header' | 'context' | 'actions' | 'image';
    text?: {
        type: 'plain_text' | 'mrkdwn';
        text: string;
        emoji?: boolean;
    };
    accessory?: SlackBlockElement;
    elements?: SlackBlockElement[];
    block_id?: string;
}

export interface SlackBlockElement {
    type: 'button' | 'image' | 'static_select' | 'overflow' | 'plain_text' | 'mrkdwn';
    text?:
        | string
        | {
              type: 'plain_text' | 'mrkdwn';
              text: string;
              emoji?: boolean;
          };
    action_id?: string;
    value?: string;
    url?: string;
    style?: 'primary' | 'danger';
    image_url?: string;
    alt_text?: string;
    options?: SlackOption[];
    emoji?: boolean;
}

export interface SlackOption {
    text: {
        type: 'plain_text';
        text: string;
    };
    value: string;
}

export interface SlackAttachment {
    color?: string;
    pretext?: string;
    author_name?: string;
    author_icon?: string;
    title?: string;
    title_link?: string;
    text?: string;
    fields?: Array<{
        title: string;
        value: string;
        short?: boolean;
    }>;
    image_url?: string;
    thumb_url?: string;
    footer?: string;
    footer_icon?: string;
    ts?: number;
}

export interface SlackMessageResult {
    ok: boolean;
    channel: string;
    ts: string;
    message?: {
        text: string;
        user: string;
        ts: string;
    };
    error?: string;
}

export interface SlackFileUpload {
    channels: string[];
    content?: string;
    file?: Buffer;
    filename: string;
    filetype?: string;
    title?: string;
    initialComment?: string;
    threadTs?: string;
}

export interface SlackSlashCommand {
    token: string;
    teamId: string;
    teamDomain: string;
    channelId: string;
    channelName: string;
    userId: string;
    userName: string;
    command: string;
    text: string;
    responseUrl: string;
    triggerId: string;
}

export interface SlackInteraction {
    type: 'block_actions' | 'message_action' | 'shortcut' | 'view_submission';
    user: {
        id: string;
        name: string;
    };
    team: {
        id: string;
        domain: string;
    };
    channel?: {
        id: string;
        name: string;
    };
    message?: {
        ts: string;
        text: string;
    };
    actions?: Array<{
        action_id: string;
        block_id: string;
        value: string;
        type: string;
    }>;
    responseUrl: string;
    triggerId: string;
}

export type SlackCommandHandler = (
    command: SlackSlashCommand
) => Promise<SlackMessage | string | void>;

export type SlackInteractionHandler = (
    interaction: SlackInteraction
) => Promise<SlackMessage | string | void>;

// ========================================
// Slack Integration Service
// ========================================

export class SlackIntegration {
    private config: SlackConfig;
    private tokens: SlackTokens | null = null;
    private commandHandlers: Map<string, SlackCommandHandler> = new Map();
    private interactionHandlers: Map<string, SlackInteractionHandler> = new Map();
    private baseUrl = 'https://slack.com/api';

    constructor(config: SlackConfig) {
        this.config = config;
    }

    // ========================================
    // OAuth
    // ========================================

    /**
     * Get OAuth authorization URL
     */
    getAuthUrl(state?: string): string {
        const params = new URLSearchParams({
            client_id: this.config.clientId,
            scope: this.config.scopes.join(','),
            user_scope: this.config.botScopes.join(','),
            redirect_uri: this.config.redirectUri,
            state: state || this.generateState(),
        });

        return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
    }

    /**
     * Handle OAuth callback
     */
    async handleOAuthCallback(code: string): Promise<SlackTokens> {
        const response = await fetch(`${this.baseUrl}/oauth.v2.access`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                code,
                redirect_uri: this.config.redirectUri,
            }),
        });

        const data = await response.json();

        if (!data.ok) {
            throw new Error(`Slack OAuth failed: ${data.error}`);
        }

        this.tokens = {
            accessToken: data.authed_user?.access_token || '',
            botAccessToken: data.access_token,
            teamId: data.team.id,
            teamName: data.team.name,
            userId: data.authed_user?.id || '',
            botUserId: data.bot_user_id,
            scope: data.authed_user?.scope || '',
            botScope: data.scope,
        };

        return this.tokens;
    }

    /**
     * Set tokens (for restoring from storage)
     */
    setTokens(tokens: SlackTokens): void {
        this.tokens = tokens;
    }

    /**
     * Check if authenticated
     */
    isAuthenticated(): boolean {
        return this.tokens !== null;
    }

    /**
     * Disconnect (clear tokens)
     */
    disconnect(): void {
        this.tokens = null;
    }

    // ========================================
    // Channels
    // ========================================

    /**
     * Get list of channels
     */
    async getChannels(includePrivate = false): Promise<SlackChannel[]> {
        const channels: SlackChannel[] = [];
        let cursor: string | undefined;

        do {
            const params: Record<string, string> = {
                types: includePrivate ? 'public_channel,private_channel' : 'public_channel',
                limit: '200',
            };

            if (cursor) {
                params.cursor = cursor;
            }

            const response = await this.apiCall('conversations.list', params);
            const responseChannels = response.channels as
                | Array<Record<string, unknown>>
                | undefined;

            if (responseChannels) {
                channels.push(
                    ...responseChannels.map((ch: Record<string, unknown>) => ({
                        id: ch.id as string,
                        name: ch.name as string,
                        isPrivate: ch.is_private as boolean,
                        isArchived: ch.is_archived as boolean,
                        isMember: ch.is_member as boolean,
                        memberCount: ch.num_members as number | undefined,
                        topic: (ch.topic as { value: string })?.value,
                        purpose: (ch.purpose as { value: string })?.value,
                    }))
                );
            }

            const metadata = response.response_metadata as { next_cursor?: string } | undefined;
            cursor = metadata?.next_cursor;
        } while (cursor);

        return channels;
    }

    /**
     * Get channel info
     */
    async getChannelInfo(channelId: string): Promise<SlackChannel> {
        const response = await this.apiCall('conversations.info', {
            channel: channelId,
        });

        const ch = response.channel as Record<string, unknown>;
        return {
            id: ch.id as string,
            name: ch.name as string,
            isPrivate: ch.is_private as boolean,
            isArchived: ch.is_archived as boolean,
            isMember: ch.is_member as boolean,
            memberCount: ch.num_members as number | undefined,
            topic: (ch.topic as { value: string } | undefined)?.value,
            purpose: (ch.purpose as { value: string } | undefined)?.value,
        };
    }

    /**
     * Join a channel
     */
    async joinChannel(channelId: string): Promise<void> {
        await this.apiCall('conversations.join', { channel: channelId });
    }

    // ========================================
    // Messages
    // ========================================

    /**
     * Send a message to a channel
     */
    async sendMessage(message: SlackMessage): Promise<SlackMessageResult> {
        const payload: Record<string, unknown> = {
            channel: message.channel,
            text: message.text,
        };

        if (message.blocks) {
            payload.blocks = JSON.stringify(message.blocks);
        }

        if (message.attachments) {
            payload.attachments = JSON.stringify(message.attachments);
        }

        if (message.threadTs) {
            payload.thread_ts = message.threadTs;
            if (message.replyBroadcast) {
                payload.reply_broadcast = true;
            }
        }

        if (message.unfurlLinks !== undefined) {
            payload.unfurl_links = message.unfurlLinks;
        }

        if (message.unfurlMedia !== undefined) {
            payload.unfurl_media = message.unfurlMedia;
        }

        if (message.mrkdwn !== undefined) {
            payload.mrkdwn = message.mrkdwn;
        }

        const response = await this.apiCall('chat.postMessage', payload as Record<string, string>);

        return {
            ok: response.ok as boolean,
            channel: response.channel as string,
            ts: response.ts as string,
            message: response.message as { text: string; user: string; ts: string } | undefined,
            error: response.error as string | undefined,
        };
    }

    /**
     * Send a direct message to a user
     */
    async sendDirectMessage(
        userId: string,
        message: Omit<SlackMessage, 'channel'>
    ): Promise<SlackMessageResult> {
        // Open a DM channel with the user
        const dmResponse = await this.apiCall('conversations.open', {
            users: userId,
        });

        const channel = dmResponse.channel as { id: string };
        const channelId = channel.id;

        return this.sendMessage({
            ...message,
            channel: channelId,
        });
    }

    /**
     * Update a message
     */
    async updateMessage(
        channel: string,
        ts: string,
        message: Omit<SlackMessage, 'channel'>
    ): Promise<SlackMessageResult> {
        const payload: Record<string, unknown> = {
            channel,
            ts,
            text: message.text,
        };

        if (message.blocks) {
            payload.blocks = JSON.stringify(message.blocks);
        }

        if (message.attachments) {
            payload.attachments = JSON.stringify(message.attachments);
        }

        const response = await this.apiCall('chat.update', payload as Record<string, string>);

        return {
            ok: response.ok as boolean,
            channel: response.channel as string,
            ts: response.ts as string,
            error: response.error as string | undefined,
        };
    }

    /**
     * Delete a message
     */
    async deleteMessage(channel: string, ts: string): Promise<void> {
        await this.apiCall('chat.delete', { channel, ts });
    }

    // ========================================
    // Files
    // ========================================

    /**
     * Upload a file
     */
    async uploadFile(upload: SlackFileUpload): Promise<{ fileId: string; permalink: string }> {
        const formData = new FormData();

        formData.append('channels', upload.channels.join(','));
        formData.append('filename', upload.filename);

        if (upload.content) {
            formData.append('content', upload.content);
        }

        if (upload.file) {
            // Convert Buffer to Uint8Array for Blob compatibility
            const uint8Array = new Uint8Array(upload.file);
            formData.append('file', new Blob([uint8Array]), upload.filename);
        }

        if (upload.filetype) {
            formData.append('filetype', upload.filetype);
        }

        if (upload.title) {
            formData.append('title', upload.title);
        }

        if (upload.initialComment) {
            formData.append('initial_comment', upload.initialComment);
        }

        if (upload.threadTs) {
            formData.append('thread_ts', upload.threadTs);
        }

        const response = await fetch(`${this.baseUrl}/files.upload`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.getBotToken()}`,
            },
            body: formData,
        });

        const data = await response.json();

        if (!data.ok) {
            throw new Error(`File upload failed: ${data.error}`);
        }

        return {
            fileId: data.file.id,
            permalink: data.file.permalink,
        };
    }

    // ========================================
    // Users
    // ========================================

    /**
     * Get user info
     */
    async getUserInfo(userId: string): Promise<SlackUser> {
        const response = await this.apiCall('users.info', { user: userId });

        const user = response.user as Record<string, unknown>;
        const profile = user.profile as Record<string, unknown> | undefined;
        return {
            id: user.id as string,
            name: user.name as string,
            realName: user.real_name as string,
            email: profile?.email as string | undefined,
            avatar: profile?.image_192 as string,
            isBot: user.is_bot as boolean,
            isAdmin: user.is_admin as boolean,
        };
    }

    /**
     * Get list of users
     */
    async getUsers(): Promise<SlackUser[]> {
        const users: SlackUser[] = [];
        let cursor: string | undefined;

        do {
            const params: Record<string, string> = { limit: '200' };

            if (cursor) {
                params.cursor = cursor;
            }

            const response = await this.apiCall('users.list', params);
            const members = response.members as Array<Record<string, unknown>> | undefined;

            if (members) {
                users.push(
                    ...members
                        .filter((u: Record<string, unknown>) => !u.deleted && !u.is_bot)
                        .map((u: Record<string, unknown>) => ({
                            id: u.id as string,
                            name: u.name as string,
                            realName: u.real_name as string,
                            email: (u.profile as Record<string, unknown>)?.email as
                                | string
                                | undefined,
                            avatar: (u.profile as Record<string, unknown>)?.image_192 as string,
                            isBot: u.is_bot as boolean,
                            isAdmin: u.is_admin as boolean,
                        }))
                );
            }

            const metadata = response.response_metadata as { next_cursor?: string } | undefined;
            cursor = metadata?.next_cursor;
        } while (cursor);

        return users;
    }

    // ========================================
    // Slash Commands
    // ========================================

    /**
     * Register a slash command handler
     */
    registerCommand(command: string, handler: SlackCommandHandler): void {
        this.commandHandlers.set(command, handler);
    }

    /**
     * Handle incoming slash command
     */
    async handleSlashCommand(command: SlackSlashCommand): Promise<SlackMessage | string | void> {
        // Verify the request
        const handler = this.commandHandlers.get(command.command);

        if (!handler) {
            return `Unknown command: ${command.command}`;
        }

        return handler(command);
    }

    // ========================================
    // Interactive Messages
    // ========================================

    /**
     * Register an interaction handler
     */
    registerInteractionHandler(actionId: string, handler: SlackInteractionHandler): void {
        this.interactionHandlers.set(actionId, handler);
    }

    /**
     * Handle incoming interaction
     */
    async handleInteraction(interaction: SlackInteraction): Promise<SlackMessage | string | void> {
        if (interaction.actions && interaction.actions.length > 0) {
            const action = interaction.actions[0];
            if (action) {
                const handler = this.interactionHandlers.get(action.action_id);

                if (handler) {
                    return handler(interaction);
                }
            }
        }

        return undefined;
    }

    /**
     * Respond to an interaction via response URL
     */
    async respondToInteraction(
        responseUrl: string,
        message: SlackMessage & { replace_original?: boolean; delete_original?: boolean }
    ): Promise<void> {
        await fetch(responseUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });
    }

    // ========================================
    // Notification Helpers
    // ========================================

    /**
     * Send task completion notification
     */
    async notifyTaskCompletion(
        channelId: string,
        task: {
            id: string;
            title: string;
            projectName: string;
            completedBy: string;
            duration: number;
        }
    ): Promise<SlackMessageResult> {
        const blocks: SlackBlock[] = [
            {
                type: 'header',
                text: {
                    type: 'plain_text',
                    text: 'Task Completed',
                    emoji: true,
                },
            },
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*${task.title}*\nProject: ${task.projectName}`,
                },
                accessory: {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: 'View Task',
                        emoji: true,
                    },
                    action_id: `view_task_${task.id}`,
                    value: task.id,
                },
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: `Completed by ${task.completedBy} in ${Math.round(task.duration / 60)} minutes`,
                    },
                ],
            },
        ];

        return this.sendMessage({
            channel: channelId,
            text: `Task "${task.title}" completed`,
            blocks,
        });
    }

    /**
     * Send mention notification
     */
    async notifyMention(
        userId: string,
        mention: {
            mentionedBy: string;
            context: string;
            link: string;
        }
    ): Promise<SlackMessageResult> {
        return this.sendDirectMessage(userId, {
            text: `You were mentioned by ${mention.mentionedBy}`,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*${mention.mentionedBy}* mentioned you:\n>${mention.context}`,
                    },
                },
                {
                    type: 'actions',
                    elements: [
                        {
                            type: 'button',
                            text: {
                                type: 'plain_text',
                                text: 'View Comment',
                            },
                            url: mention.link,
                        },
                    ],
                },
            ],
        });
    }

    // ========================================
    // Request Verification
    // ========================================

    /**
     * Verify Slack request signature
     */
    verifyRequestSignature(signature: string, timestamp: string, body: string): boolean {
        const sigBasestring = `v0:${timestamp}:${body}`;
        const mySignature = `v0=${crypto
            .createHmac('sha256', this.config.signingSecret)
            .update(sigBasestring)
            .digest('hex')}`;

        return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(signature));
    }

    // ========================================
    // Private Methods
    // ========================================

    private async apiCall(
        method: string,
        params: Record<string, string>
    ): Promise<Record<string, unknown>> {
        const token = this.getBotToken();

        if (!token) {
            throw new Error('Not authenticated with Slack');
        }

        const response = await fetch(`${this.baseUrl}/${method}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Bearer ${token}`,
            },
            body: new URLSearchParams(params),
        });

        const data = await response.json();

        if (!data.ok) {
            throw new Error(`Slack API error: ${data.error}`);
        }

        return data;
    }

    private getBotToken(): string | null {
        return this.tokens?.botAccessToken || null;
    }

    private generateState(): string {
        return crypto.randomBytes(16).toString('hex');
    }
}

// ========================================
// Singleton Instance
// ========================================

let slackInstance: SlackIntegration | null = null;

export function initializeSlack(config: SlackConfig): SlackIntegration {
    slackInstance = new SlackIntegration(config);
    return slackInstance;
}

export function getSlackIntegration(): SlackIntegration | null {
    return slackInstance;
}

export default SlackIntegration;
