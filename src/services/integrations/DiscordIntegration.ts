/**
 * Discord Integration Service
 *
 * Provides Discord integration via webhooks with support for
 * embed messages, file attachments, and thread creation.
 */

// ========================================
// Types
// ========================================

export interface DiscordWebhook {
  id: string;
  name: string;
  url: string;
  channelId?: string;
  guildId?: string;
  avatar?: string;
  createdAt: Date;
  lastUsed?: Date;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: {
    text: string;
    icon_url?: string;
  };
  image?: {
    url: string;
    height?: number;
    width?: number;
  };
  thumbnail?: {
    url: string;
  };
  author?: {
    name: string;
    url?: string;
    icon_url?: string;
  };
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
}

export interface DiscordMessage {
  content?: string;
  username?: string;
  avatar_url?: string;
  tts?: boolean;
  embeds?: DiscordEmbed[];
  allowed_mentions?: {
    parse?: ('roles' | 'users' | 'everyone')[];
    roles?: string[];
    users?: string[];
  };
  flags?: number;
  thread_name?: string; // For creating a new thread
}

export interface DiscordFile {
  name: string;
  content: Buffer | string;
  contentType?: string;
}

export interface DiscordMessageResult {
  success: boolean;
  messageId?: string;
  channelId?: string;
  error?: string;
}

export interface DiscordWebhookInfo {
  id: string;
  type: number;
  guild_id?: string;
  channel_id: string;
  name: string;
  avatar?: string;
  token: string;
}

// Embed colors
export const DiscordColors = {
  DEFAULT: 0x000000,
  SUCCESS: 0x57f287,
  WARNING: 0xfee75c,
  ERROR: 0xed4245,
  INFO: 0x5865f2,
  PRIMARY: 0x5865f2,
  SECONDARY: 0x99aab5,
  BLURPLE: 0x5865f2,
  GREYPLE: 0x99aab5,
  DARK: 0x23272a,
  NOT_QUITE_BLACK: 0x2c2f33,
  GREEN: 0x57f287,
  YELLOW: 0xfee75c,
  RED: 0xed4245,
  FUCHSIA: 0xeb459e,
  AQUA: 0x1abc9c,
} as const;

// ========================================
// Discord Integration Service
// ========================================

export class DiscordIntegration {
  private webhooks: Map<string, DiscordWebhook> = new Map();
  private defaultWebhook: string | null = null;

  // ========================================
  // Webhook Management
  // ========================================

  /**
   * Add a webhook
   */
  addWebhook(id: string, name: string, url: string): DiscordWebhook {
    // Validate webhook URL format
    if (!this.isValidWebhookUrl(url)) {
      throw new Error('Invalid Discord webhook URL format');
    }

    const webhook: DiscordWebhook = {
      id,
      name,
      url,
      createdAt: new Date(),
    };

    // Extract webhook info from URL if possible
    const urlParts = this.parseWebhookUrl(url);
    if (urlParts) {
      webhook.channelId = urlParts.channelId;
    }

    this.webhooks.set(id, webhook);

    // Set as default if it's the first webhook
    if (!this.defaultWebhook) {
      this.defaultWebhook = id;
    }

    return webhook;
  }

  /**
   * Remove a webhook
   */
  removeWebhook(id: string): boolean {
    const deleted = this.webhooks.delete(id);

    if (deleted && this.defaultWebhook === id) {
      // Set new default if available
      const firstWebhook = this.webhooks.keys().next().value;
      this.defaultWebhook = firstWebhook || null;
    }

    return deleted;
  }

  /**
   * Get all webhooks
   */
  getWebhooks(): DiscordWebhook[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Get a webhook by ID
   */
  getWebhook(id: string): DiscordWebhook | undefined {
    return this.webhooks.get(id);
  }

  /**
   * Set default webhook
   */
  setDefaultWebhook(id: string): void {
    if (!this.webhooks.has(id)) {
      throw new Error(`Webhook ${id} not found`);
    }
    this.defaultWebhook = id;
  }

  /**
   * Validate webhook by fetching its info
   */
  async validateWebhook(webhookUrl: string): Promise<DiscordWebhookInfo | null> {
    try {
      const response = await fetch(webhookUrl);

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }

  // ========================================
  // Messaging
  // ========================================

  /**
   * Send a message via webhook
   */
  async sendMessage(
    message: DiscordMessage,
    webhookId?: string
  ): Promise<DiscordMessageResult> {
    const webhook = this.getTargetWebhook(webhookId);

    if (!webhook) {
      return {
        success: false,
        error: 'No webhook configured',
      };
    }

    try {
      // Append ?wait=true to get message details in response
      const response = await fetch(`${webhook.url}?wait=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.message || response.statusText,
        };
      }

      const data = await response.json();

      // Update last used timestamp
      webhook.lastUsed = new Date();

      return {
        success: true,
        messageId: data.id,
        channelId: data.channel_id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send an embed message
   */
  async sendEmbed(
    embed: DiscordEmbed,
    content?: string,
    webhookId?: string
  ): Promise<DiscordMessageResult> {
    return this.sendMessage(
      {
        content,
        embeds: [embed],
      },
      webhookId
    );
  }

  /**
   * Send multiple embeds
   */
  async sendEmbeds(
    embeds: DiscordEmbed[],
    content?: string,
    webhookId?: string
  ): Promise<DiscordMessageResult> {
    // Discord allows up to 10 embeds per message
    if (embeds.length > 10) {
      throw new Error('Maximum 10 embeds per message');
    }

    return this.sendMessage(
      {
        content,
        embeds,
      },
      webhookId
    );
  }

  /**
   * Send a message with file attachment
   */
  async sendWithFile(
    message: DiscordMessage,
    file: DiscordFile,
    webhookId?: string
  ): Promise<DiscordMessageResult> {
    return this.sendWithFiles(message, [file], webhookId);
  }

  /**
   * Send a message with multiple file attachments
   */
  async sendWithFiles(
    message: DiscordMessage,
    files: DiscordFile[],
    webhookId?: string
  ): Promise<DiscordMessageResult> {
    const webhook = this.getTargetWebhook(webhookId);

    if (!webhook) {
      return {
        success: false,
        error: 'No webhook configured',
      };
    }

    try {
      const formData = new FormData();

      // Add message payload as JSON
      formData.append('payload_json', JSON.stringify(message));

      // Add files
      files.forEach((file, index) => {
        let blob: Blob;
        if (typeof file.content === 'string') {
          blob = new Blob([file.content], { type: file.contentType || 'text/plain' });
        } else {
          // Convert Buffer to Uint8Array for Blob compatibility
          const uint8Array = new Uint8Array(file.content);
          blob = new Blob([uint8Array], { type: file.contentType || 'application/octet-stream' });
        }

        formData.append(`files[${index}]`, blob, file.name);
      });

      const response = await fetch(`${webhook.url}?wait=true`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.message || response.statusText,
        };
      }

      const data = await response.json();

      // Update last used timestamp
      webhook.lastUsed = new Date();

      return {
        success: true,
        messageId: data.id,
        channelId: data.channel_id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create a thread with a message
   */
  async createThread(
    threadName: string,
    message: Omit<DiscordMessage, 'thread_name'>,
    webhookId?: string
  ): Promise<DiscordMessageResult> {
    return this.sendMessage(
      {
        ...message,
        thread_name: threadName,
      },
      webhookId
    );
  }

  // ========================================
  // Notification Helpers
  // ========================================

  /**
   * Send task completion notification
   */
  async notifyTaskCompletion(
    task: {
      id: string;
      title: string;
      projectName: string;
      completedBy: string;
      duration: number;
    },
    webhookId?: string
  ): Promise<DiscordMessageResult> {
    const embed: DiscordEmbed = {
      title: 'Task Completed',
      description: task.title,
      color: DiscordColors.SUCCESS,
      fields: [
        {
          name: 'Project',
          value: task.projectName,
          inline: true,
        },
        {
          name: 'Completed By',
          value: task.completedBy,
          inline: true,
        },
        {
          name: 'Duration',
          value: `${Math.round(task.duration / 60)} minutes`,
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: `Task ID: ${task.id}`,
      },
    };

    return this.sendEmbed(embed, undefined, webhookId);
  }

  /**
   * Send project status update
   */
  async notifyProjectStatus(
    project: {
      id: string;
      name: string;
      status: string;
      progress: number;
      tasksCompleted: number;
      totalTasks: number;
    },
    webhookId?: string
  ): Promise<DiscordMessageResult> {
    const progressBar = this.createProgressBar(project.progress);

    const embed: DiscordEmbed = {
      title: `Project Update: ${project.name}`,
      color: project.progress === 100 ? DiscordColors.SUCCESS : DiscordColors.INFO,
      fields: [
        {
          name: 'Status',
          value: project.status,
          inline: true,
        },
        {
          name: 'Progress',
          value: `${project.progress}%`,
          inline: true,
        },
        {
          name: 'Tasks',
          value: `${project.tasksCompleted}/${project.totalTasks}`,
          inline: true,
        },
        {
          name: 'Progress Bar',
          value: progressBar,
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    return this.sendEmbed(embed, undefined, webhookId);
  }

  /**
   * Send error notification
   */
  async notifyError(
    error: {
      title: string;
      message: string;
      context?: string;
      taskId?: string;
      projectId?: string;
    },
    webhookId?: string
  ): Promise<DiscordMessageResult> {
    const fields: DiscordEmbed['fields'] = [];

    if (error.context) {
      fields.push({
        name: 'Context',
        value: error.context,
        inline: false,
      });
    }

    if (error.taskId) {
      fields.push({
        name: 'Task ID',
        value: error.taskId,
        inline: true,
      });
    }

    if (error.projectId) {
      fields.push({
        name: 'Project ID',
        value: error.projectId,
        inline: true,
      });
    }

    const embed: DiscordEmbed = {
      title: `Error: ${error.title}`,
      description: error.message,
      color: DiscordColors.ERROR,
      fields: fields.length > 0 ? fields : undefined,
      timestamp: new Date().toISOString(),
    };

    return this.sendEmbed(embed, undefined, webhookId);
  }

  /**
   * Send daily summary
   */
  async sendDailySummary(
    summary: {
      date: Date;
      projectName: string;
      tasksCreated: number;
      tasksCompleted: number;
      tasksInProgress: number;
      topContributors: Array<{ name: string; completedTasks: number }>;
    },
    webhookId?: string
  ): Promise<DiscordMessageResult> {
    const contributorsList =
      summary.topContributors.length > 0
        ? summary.topContributors.map((c, i) => `${i + 1}. ${c.name} (${c.completedTasks} tasks)`).join('\n')
        : 'No contributions today';

    const embed: DiscordEmbed = {
      title: `Daily Summary - ${summary.projectName}`,
      description: `Summary for ${summary.date.toLocaleDateString()}`,
      color: DiscordColors.INFO,
      fields: [
        {
          name: 'Tasks Created',
          value: summary.tasksCreated.toString(),
          inline: true,
        },
        {
          name: 'Tasks Completed',
          value: summary.tasksCompleted.toString(),
          inline: true,
        },
        {
          name: 'In Progress',
          value: summary.tasksInProgress.toString(),
          inline: true,
        },
        {
          name: 'Top Contributors',
          value: contributorsList,
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
    };

    return this.sendEmbed(embed, undefined, webhookId);
  }

  // ========================================
  // Private Methods
  // ========================================

  private getTargetWebhook(webhookId?: string): DiscordWebhook | undefined {
    if (webhookId) {
      return this.webhooks.get(webhookId);
    }

    if (this.defaultWebhook) {
      return this.webhooks.get(this.defaultWebhook);
    }

    return undefined;
  }

  private isValidWebhookUrl(url: string): boolean {
    const webhookPattern = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w-]+$/;
    const discordappPattern = /^https:\/\/discordapp\.com\/api\/webhooks\/\d+\/[\w-]+$/;
    return webhookPattern.test(url) || discordappPattern.test(url);
  }

  private parseWebhookUrl(url: string): { webhookId: string; token: string; channelId?: string } | null {
    const match = url.match(/\/webhooks\/(\d+)\/([\w-]+)/);
    if (!match || !match[1] || !match[2]) {
      return null;
    }

    return {
      webhookId: match[1],
      token: match[2],
    };
  }

  private createProgressBar(progress: number, length = 20): string {
    const filled = Math.round((progress / 100) * length);
    const empty = length - filled;
    const filledBar = '█'.repeat(filled);
    const emptyBar = '░'.repeat(empty);
    return `\`${filledBar}${emptyBar}\` ${progress}%`;
  }
}

// ========================================
// Embed Builder
// ========================================

export class DiscordEmbedBuilder {
  private embed: DiscordEmbed = {};

  setTitle(title: string): this {
    this.embed.title = title;
    return this;
  }

  setDescription(description: string): this {
    this.embed.description = description;
    return this;
  }

  setUrl(url: string): this {
    this.embed.url = url;
    return this;
  }

  setColor(color: number): this {
    this.embed.color = color;
    return this;
  }

  setTimestamp(date?: Date): this {
    this.embed.timestamp = (date || new Date()).toISOString();
    return this;
  }

  setFooter(text: string, iconUrl?: string): this {
    this.embed.footer = { text, icon_url: iconUrl };
    return this;
  }

  setImage(url: string): this {
    this.embed.image = { url };
    return this;
  }

  setThumbnail(url: string): this {
    this.embed.thumbnail = { url };
    return this;
  }

  setAuthor(name: string, url?: string, iconUrl?: string): this {
    this.embed.author = { name, url, icon_url: iconUrl };
    return this;
  }

  addField(name: string, value: string, inline = false): this {
    if (!this.embed.fields) {
      this.embed.fields = [];
    }
    this.embed.fields.push({ name, value, inline });
    return this;
  }

  build(): DiscordEmbed {
    return { ...this.embed };
  }
}

// ========================================
// Singleton Instance
// ========================================

let discordInstance: DiscordIntegration | null = null;

export function initializeDiscord(): DiscordIntegration {
  if (!discordInstance) {
    discordInstance = new DiscordIntegration();
  }
  return discordInstance;
}

export function getDiscordIntegration(): DiscordIntegration | null {
  return discordInstance;
}

export default DiscordIntegration;
