/**
 * Webhook Manager Service
 *
 * Manages webhook registrations, triggering, verification,
 * and retry logic for outgoing webhooks.
 */

import crypto from 'crypto';

// ========================================
// Types
// ========================================

export type WebhookEvent =
  | 'project.created'
  | 'project.updated'
  | 'project.completed'
  | 'project.deleted'
  | 'task.created'
  | 'task.updated'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.blocked'
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted'
  | 'user.mentioned'
  | 'skill.executed'
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed';

export interface Webhook {
  id: string;
  projectId: string | null; // null means global webhook
  name: string;
  url: string;
  events: WebhookEvent[];
  secret?: string;
  headers?: Record<string, string>;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastTriggeredAt?: Date;
  failureCount: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  webhookId: string;
  deliveryId: string;
  projectId?: string;
  data: Record<string, unknown>;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: WebhookPayload;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  statusCode?: number;
  response?: string;
  error?: string;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  completedAt?: Date;
  nextRetryAt?: Date;
}

export interface WebhookStats {
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  averageResponseTime: number;
  lastDeliveryAt?: Date;
  eventCounts: Record<WebhookEvent, number>;
}

export interface CreateWebhookParams {
  projectId?: string | null;
  name: string;
  url: string;
  events: WebhookEvent[];
  secret?: string;
  headers?: Record<string, string>;
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface WebhookEventData {
  // Project events
  project?: {
    id: string;
    name: string;
    status: string;
    progress?: number;
  };
  // Task events
  task?: {
    id: string;
    title: string;
    status: string;
    projectId: string;
    assignee?: string;
    duration?: number;
    cost?: number;
  };
  // Comment events
  comment?: {
    id: string;
    taskId: string;
    content: string;
    author: string;
  };
  // User mention events
  mention?: {
    userId: string;
    mentionedBy: string;
    context: string;
    entityType: 'task' | 'comment';
    entityId: string;
  };
  // Additional context
  [key: string]: unknown;
}

// ========================================
// Webhook Manager Service
// ========================================

export class WebhookManager {
  private webhooks: Map<string, Webhook> = new Map();
  private deliveries: Map<string, WebhookDelivery> = new Map();
  private stats: Map<string, WebhookStats> = new Map();
  private retryQueue: Map<string, ReturnType<typeof setTimeout>> = new Map();

  // Event listeners for webhook triggers
  private eventListeners: Map<WebhookEvent, Set<string>> = new Map();

  constructor() {
    // Initialize event listeners map
    const events: WebhookEvent[] = [
      'project.created', 'project.updated', 'project.completed', 'project.deleted',
      'task.created', 'task.updated', 'task.started', 'task.completed', 'task.failed', 'task.blocked',
      'comment.created', 'comment.updated', 'comment.deleted',
      'user.mentioned',
      'skill.executed',
      'workflow.started', 'workflow.completed', 'workflow.failed',
    ];

    for (const event of events) {
      this.eventListeners.set(event, new Set());
    }
  }

  // ========================================
  // Webhook Management
  // ========================================

  /**
   * Register a new webhook
   */
  async registerWebhook(params: CreateWebhookParams): Promise<Webhook> {
    const id = this.generateId();
    const now = new Date();

    const webhook: Webhook = {
      id,
      projectId: params.projectId ?? null,
      name: params.name,
      url: params.url,
      events: params.events,
      secret: params.secret,
      headers: params.headers,
      active: true,
      createdAt: now,
      updatedAt: now,
      failureCount: 0,
      maxRetries: params.maxRetries ?? 3,
      retryDelayMs: params.retryDelayMs ?? 5000,
    };

    // Validate URL
    if (!this.isValidUrl(webhook.url)) {
      throw new Error('Invalid webhook URL');
    }

    // Store webhook
    this.webhooks.set(id, webhook);

    // Register for events
    for (const event of webhook.events) {
      this.eventListeners.get(event)?.add(id);
    }

    // Initialize stats
    this.stats.set(id, {
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      averageResponseTime: 0,
      eventCounts: {} as Record<WebhookEvent, number>,
    });

    return webhook;
  }

  /**
   * Update a webhook
   */
  async updateWebhook(
    webhookId: string,
    updates: Partial<Omit<Webhook, 'id' | 'createdAt'>>
  ): Promise<Webhook> {
    const webhook = this.webhooks.get(webhookId);

    if (!webhook) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }

    // If events changed, update listeners
    if (updates.events) {
      // Remove from old events
      for (const event of webhook.events) {
        this.eventListeners.get(event)?.delete(webhookId);
      }

      // Add to new events
      for (const event of updates.events) {
        this.eventListeners.get(event)?.add(webhookId);
      }
    }

    // Update webhook
    const updatedWebhook: Webhook = {
      ...webhook,
      ...updates,
      updatedAt: new Date(),
    };

    this.webhooks.set(webhookId, updatedWebhook);

    return updatedWebhook;
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    const webhook = this.webhooks.get(webhookId);

    if (!webhook) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }

    // Remove from event listeners
    for (const event of webhook.events) {
      this.eventListeners.get(event)?.delete(webhookId);
    }

    // Cancel any pending retries
    const retryTimeout = this.retryQueue.get(webhookId);
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      this.retryQueue.delete(webhookId);
    }

    // Remove webhook and stats
    this.webhooks.delete(webhookId);
    this.stats.delete(webhookId);
  }

  /**
   * Get a webhook by ID
   */
  getWebhook(webhookId: string): Webhook | undefined {
    return this.webhooks.get(webhookId);
  }

  /**
   * Get all webhooks
   */
  getWebhooks(projectId?: string): Webhook[] {
    const webhooks = Array.from(this.webhooks.values());

    if (projectId === undefined) {
      return webhooks;
    }

    return webhooks.filter(
      (w) => w.projectId === projectId || w.projectId === null
    );
  }

  /**
   * Enable/disable a webhook
   */
  async setWebhookActive(webhookId: string, active: boolean): Promise<void> {
    const webhook = this.webhooks.get(webhookId);

    if (!webhook) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }

    webhook.active = active;
    webhook.updatedAt = new Date();

    if (active) {
      // Re-register for events
      for (const event of webhook.events) {
        this.eventListeners.get(event)?.add(webhookId);
      }
    } else {
      // Unregister from events
      for (const event of webhook.events) {
        this.eventListeners.get(event)?.delete(webhookId);
      }
    }
  }

  // ========================================
  // Webhook Triggering
  // ========================================

  /**
   * Trigger webhooks for an event
   */
  async triggerEvent(
    event: WebhookEvent,
    data: WebhookEventData,
    projectId?: string
  ): Promise<string[]> {
    const webhookIds = this.eventListeners.get(event);
    const deliveryIds: string[] = [];

    if (!webhookIds || webhookIds.size === 0) {
      return deliveryIds;
    }

    for (const webhookId of webhookIds) {
      const webhook = this.webhooks.get(webhookId);

      if (!webhook || !webhook.active) {
        continue;
      }

      // Check if webhook is for this project (or global)
      if (webhook.projectId !== null && webhook.projectId !== projectId) {
        continue;
      }

      const deliveryId = await this.deliverWebhook(webhook, event, data, projectId);
      deliveryIds.push(deliveryId);
    }

    return deliveryIds;
  }

  /**
   * Trigger a specific webhook
   */
  async triggerWebhook(
    webhookId: string,
    event: WebhookEvent,
    data: WebhookEventData
  ): Promise<string> {
    const webhook = this.webhooks.get(webhookId);

    if (!webhook) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }

    if (!webhook.active) {
      throw new Error('Webhook is not active');
    }

    if (!webhook.events.includes(event)) {
      throw new Error(`Webhook is not subscribed to event: ${event}`);
    }

    return this.deliverWebhook(webhook, event, data);
  }

  /**
   * Deliver a webhook
   */
  private async deliverWebhook(
    webhook: Webhook,
    event: WebhookEvent,
    data: WebhookEventData,
    projectId?: string
  ): Promise<string> {
    const deliveryId = this.generateId();
    const timestamp = new Date().toISOString();

    const payload: WebhookPayload = {
      event,
      timestamp,
      webhookId: webhook.id,
      deliveryId,
      projectId,
      data,
    };

    const delivery: WebhookDelivery = {
      id: deliveryId,
      webhookId: webhook.id,
      event,
      payload,
      status: 'pending',
      attempts: 0,
      maxAttempts: webhook.maxRetries + 1,
      createdAt: new Date(),
    };

    this.deliveries.set(deliveryId, delivery);

    // Attempt delivery
    await this.attemptDelivery(delivery, webhook);

    return deliveryId;
  }

  /**
   * Attempt to deliver a webhook
   */
  private async attemptDelivery(
    delivery: WebhookDelivery,
    webhook: Webhook
  ): Promise<void> {
    delivery.attempts++;

    const startTime = Date.now();

    try {
      const payloadString = JSON.stringify(delivery.payload);

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'AI-Workflow-Manager-Webhook/1.0',
        'X-Webhook-Event': delivery.event,
        'X-Webhook-Delivery': delivery.id,
        'X-Webhook-Timestamp': delivery.payload.timestamp,
        ...webhook.headers,
      };

      // Add signature if secret is configured
      if (webhook.secret) {
        const signature = this.generateSignature(payloadString, webhook.secret);
        headers['X-Webhook-Signature'] = signature;
        headers['X-Webhook-Signature-256'] = signature;
      }

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      const responseTime = Date.now() - startTime;
      const responseText = await response.text();

      delivery.statusCode = response.status;
      delivery.response = responseText.substring(0, 1000); // Limit response size

      if (response.ok) {
        // Success
        delivery.status = 'success';
        delivery.completedAt = new Date();

        // Update webhook stats
        webhook.lastTriggeredAt = new Date();
        webhook.failureCount = 0;

        // Update stats
        this.updateStats(webhook.id, true, responseTime, delivery.event);
      } else {
        // Failed with HTTP error
        throw new Error(`HTTP ${response.status}: ${responseText.substring(0, 200)}`);
      }
    } catch (error) {
      delivery.error = error instanceof Error ? error.message : 'Unknown error';

      const canRetry = delivery.attempts < delivery.maxAttempts;

      if (canRetry) {
        // Schedule retry
        delivery.status = 'retrying';
        delivery.nextRetryAt = new Date(Date.now() + webhook.retryDelayMs * delivery.attempts);

        const retryTimeout = setTimeout(async () => {
          this.retryQueue.delete(delivery.id);
          await this.attemptDelivery(delivery, webhook);
        }, webhook.retryDelayMs * delivery.attempts);

        this.retryQueue.set(delivery.id, retryTimeout);
      } else {
        // Max retries exceeded
        delivery.status = 'failed';
        delivery.completedAt = new Date();

        // Update failure count
        webhook.failureCount++;

        // Auto-disable webhook if too many failures
        if (webhook.failureCount >= 10) {
          webhook.active = false;
          console.warn(`Webhook ${webhook.id} disabled due to repeated failures`);
        }

        // Update stats
        const responseTime = Date.now() - startTime;
        this.updateStats(webhook.id, false, responseTime, delivery.event);
      }
    }
  }

  // ========================================
  // Retry Management
  // ========================================

  /**
   * Retry a failed webhook delivery
   */
  async retryFailedWebhook(webhookId: string, deliveryId: string): Promise<void> {
    const webhook = this.webhooks.get(webhookId);
    const delivery = this.deliveries.get(deliveryId);

    if (!webhook) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }

    if (!delivery) {
      throw new Error(`Delivery not found: ${deliveryId}`);
    }

    if (delivery.webhookId !== webhookId) {
      throw new Error('Delivery does not belong to this webhook');
    }

    // Reset attempts and status
    delivery.attempts = 0;
    delivery.status = 'pending';
    delivery.error = undefined;
    delivery.response = undefined;
    delivery.statusCode = undefined;

    await this.attemptDelivery(delivery, webhook);
  }

  /**
   * Get pending retries
   */
  getPendingRetries(): WebhookDelivery[] {
    return Array.from(this.deliveries.values()).filter(
      (d) => d.status === 'retrying'
    );
  }

  /**
   * Cancel a pending retry
   */
  cancelRetry(deliveryId: string): void {
    const timeout = this.retryQueue.get(deliveryId);
    if (timeout) {
      clearTimeout(timeout);
      this.retryQueue.delete(deliveryId);
    }

    const delivery = this.deliveries.get(deliveryId);
    if (delivery && delivery.status === 'retrying') {
      delivery.status = 'failed';
      delivery.completedAt = new Date();
    }
  }

  // ========================================
  // Signature Verification
  // ========================================

  /**
   * Generate HMAC signature for payload
   */
  generateSignature(payload: string, secret: string): string {
    return `sha256=${crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')}`;
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const expectedSignature = this.generateSignature(payload, secret);

    // Use timing-safe comparison to prevent timing attacks
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  // ========================================
  // Statistics
  // ========================================

  /**
   * Get webhook statistics
   */
  getWebhookStats(webhookId: string): WebhookStats | undefined {
    return this.stats.get(webhookId);
  }

  /**
   * Get delivery history for a webhook
   */
  getDeliveryHistory(webhookId: string, limit = 50): WebhookDelivery[] {
    return Array.from(this.deliveries.values())
      .filter((d) => d.webhookId === webhookId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get a specific delivery
   */
  getDelivery(deliveryId: string): WebhookDelivery | undefined {
    return this.deliveries.get(deliveryId);
  }

  /**
   * Update webhook statistics
   */
  private updateStats(
    webhookId: string,
    success: boolean,
    responseTime: number,
    event: WebhookEvent
  ): void {
    const stats = this.stats.get(webhookId);
    if (!stats) return;

    stats.totalDeliveries++;
    stats.lastDeliveryAt = new Date();

    if (success) {
      stats.successfulDeliveries++;
    } else {
      stats.failedDeliveries++;
    }

    // Update average response time (exponential moving average)
    const alpha = 0.1;
    stats.averageResponseTime =
      alpha * responseTime + (1 - alpha) * stats.averageResponseTime;

    // Update event counts
    stats.eventCounts[event] = (stats.eventCounts[event] || 0) + 1;
  }

  // ========================================
  // Test Webhook
  // ========================================

  /**
   * Test a webhook with a ping event
   */
  async testWebhook(webhookId: string): Promise<{
    success: boolean;
    statusCode?: number;
    responseTime: number;
    error?: string;
  }> {
    const webhook = this.webhooks.get(webhookId);

    if (!webhook) {
      throw new Error(`Webhook not found: ${webhookId}`);
    }

    const startTime = Date.now();

    try {
      const testPayload = {
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        webhookId: webhook.id,
        deliveryId: this.generateId(),
        data: {
          message: 'This is a test webhook delivery',
        },
      };

      const payloadString = JSON.stringify(testPayload);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'AI-Workflow-Manager-Webhook/1.0',
        'X-Webhook-Event': 'webhook.test',
        'X-Webhook-Delivery': testPayload.deliveryId,
        ...webhook.headers,
      };

      if (webhook.secret) {
        headers['X-Webhook-Signature'] = this.generateSignature(
          payloadString,
          webhook.secret
        );
      }

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: payloadString,
        signal: AbortSignal.timeout(10000), // 10 second timeout for test
      });

      const responseTime = Date.now() - startTime;

      return {
        success: response.ok,
        statusCode: response.status,
        responseTime,
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ========================================
  // Utility Methods
  // ========================================

  private generateId(): string {
    return crypto.randomUUID();
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Clean up old deliveries
   */
  cleanupOldDeliveries(maxAge: number = 7 * 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - maxAge;
    let deleted = 0;

    for (const [id, delivery] of this.deliveries) {
      if (
        delivery.completedAt &&
        delivery.completedAt.getTime() < cutoff
      ) {
        this.deliveries.delete(id);
        deleted++;
      }
    }

    return deleted;
  }
}

// ========================================
// Event Emitter Helper
// ========================================

export function createWebhookEventEmitter(manager: WebhookManager) {
  return {
    async emitProjectCreated(project: { id: string; name: string; status: string }) {
      return manager.triggerEvent('project.created', { project }, project.id);
    },

    async emitProjectUpdated(project: { id: string; name: string; status: string; progress?: number }) {
      return manager.triggerEvent('project.updated', { project }, project.id);
    },

    async emitProjectCompleted(project: { id: string; name: string; status: string }) {
      return manager.triggerEvent('project.completed', { project }, project.id);
    },

    async emitTaskCreated(task: { id: string; title: string; status: string; projectId: string }) {
      return manager.triggerEvent('task.created', { task }, task.projectId);
    },

    async emitTaskUpdated(task: { id: string; title: string; status: string; projectId: string }) {
      return manager.triggerEvent('task.updated', { task }, task.projectId);
    },

    async emitTaskCompleted(task: {
      id: string;
      title: string;
      status: string;
      projectId: string;
      completedBy?: string;
      duration?: number;
      cost?: number;
    }) {
      return manager.triggerEvent('task.completed', { task }, task.projectId);
    },

    async emitTaskFailed(task: {
      id: string;
      title: string;
      status: string;
      projectId: string;
      error?: string;
    }) {
      return manager.triggerEvent('task.failed', { task }, task.projectId);
    },

    async emitCommentCreated(comment: {
      id: string;
      taskId: string;
      content: string;
      author: string;
    }, projectId: string) {
      return manager.triggerEvent('comment.created', { comment }, projectId);
    },

    async emitUserMentioned(mention: {
      userId: string;
      mentionedBy: string;
      context: string;
      entityType: 'task' | 'comment';
      entityId: string;
    }, projectId: string) {
      return manager.triggerEvent('user.mentioned', { mention }, projectId);
    },
  };
}

// ========================================
// Singleton Instance
// ========================================

let webhookManagerInstance: WebhookManager | null = null;

export function initializeWebhookManager(): WebhookManager {
  if (!webhookManagerInstance) {
    webhookManagerInstance = new WebhookManager();
  }
  return webhookManagerInstance;
}

export function getWebhookManager(): WebhookManager | null {
  return webhookManagerInstance;
}

export default WebhookManager;
