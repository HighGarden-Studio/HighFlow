/**
 * Event Bus
 *
 * Centralized event system for inter-service communication.
 * Supports typed events, wildcards, and async handlers.
 */

// Browser-compatible EventEmitter implementation
class BrowserEventEmitter {
    private listeners: Map<string, Set<(...args: any[]) => void>> = new Map();
    private maxListeners: number = 10;

    setMaxListeners(n: number): this {
        this.maxListeners = n;
        return this;
    }

    on(event: string, listener: (...args: any[]) => void): this {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        const listeners = this.listeners.get(event)!;
        if (listeners.size >= this.maxListeners) {
            console.warn(
                `[EventEmitter] Listener count for "${event}" (${listeners.size}) exceeded max of ${this.maxListeners}`
            );
        }
        listeners.add(listener);
        return this;
    }

    off(event: string, listener: (...args: any[]) => void): this {
        this.listeners.get(event)?.delete(listener);
        return this;
    }

    emit(event: string, ...args: any[]): boolean {
        const listeners = this.listeners.get(event);
        if (!listeners || listeners.size === 0) return false;
        listeners.forEach((listener) => {
            try {
                listener(...args);
            } catch (error) {
                console.error(`[EventEmitter] Error in listener for "${event}":`, error);
            }
        });
        return true;
    }

    removeAllListeners(event?: string): this {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
        return this;
    }

    listenerCount(event: string): number {
        return this.listeners.get(event)?.size || 0;
    }
}

// ========================================
// Event Types
// ========================================

export type EventCategory =
    | 'task'
    | 'project'
    | 'workflow'
    | 'automation'
    | 'ai'
    | 'user'
    | 'system';

const EVENT_CATEGORY_SET = new Set<EventCategory>([
    'task',
    'project',
    'workflow',
    'automation',
    'ai',
    'user',
    'system',
]);

export interface BaseEvent {
    id: string;
    timestamp: Date;
    category: EventCategory;
    type: string;
    source: string;
    metadata?: Record<string, any>;
    payload?: Record<string, any>;
}

// Task Events
export interface TaskCreatedEvent extends BaseEvent {
    category: 'task';
    type: 'task.created';
    payload: {
        projectId: number;
        projectSequence: number;
        title: string;
        status: string;
        priority: string;
        createdBy: number;
    };
}

export interface TaskUpdatedEvent extends BaseEvent {
    category: 'task';
    type: 'task.updated';
    payload: {
        projectId: number;
        projectSequence: number;
        changes: Record<string, { old: any; new: any }>;
        updatedBy: number;
    };
}

export interface TaskStatusChangedEvent extends BaseEvent {
    category: 'task';
    type: 'task.status_changed';
    payload: {
        projectId: number;
        projectSequence: number;
        previousStatus: string;
        newStatus: string;
        changedBy: number;
    };
}

export interface TaskAssignedEvent extends BaseEvent {
    category: 'task';
    type: 'task.assigned';
    payload: {
        projectId: number;
        projectSequence: number;
        previousAssignee?: number;
        newAssignee: number;
        assignedBy: number;
    };
}

export interface TaskDeletedEvent extends BaseEvent {
    category: 'task';
    type: 'task.deleted';
    payload: {
        projectId: number;
        projectSequence: number;
        deletedBy: number;
    };
}

// Project Events
export interface ProjectCreatedEvent extends BaseEvent {
    category: 'project';
    type: 'project.created';
    payload: {
        projectId: number;
        title: string;
        ownerId: number;
    };
}

export interface ProjectUpdatedEvent extends BaseEvent {
    category: 'project';
    type: 'project.updated';
    payload: {
        projectId: number;
        changes: Record<string, { old: any; new: any }>;
        updatedBy: number;
    };
}

// Workflow Events
export interface WorkflowStartedEvent extends BaseEvent {
    category: 'workflow';
    type: 'workflow.started';
    payload: {
        workflowId: string;
        projectId: number;
        taskCount: number;
        estimatedDuration: number;
        startedBy: number;
    };
}

export interface WorkflowProgressEvent extends BaseEvent {
    category: 'workflow';
    type: 'workflow.progress';
    payload: {
        workflowId: string;
        currentStage: number;
        totalStages: number;
        completedTasks: number;
        totalTasks: number;
        percentage: number;
        eta?: number;
    };
}

export interface WorkflowCompletedEvent extends BaseEvent {
    category: 'workflow';
    type: 'workflow.completed';
    payload: {
        workflowId: string;
        status: 'completed' | 'failed' | 'partial' | 'cancelled';
        duration: number;
        totalCost: number;
        successCount: number;
        failureCount: number;
    };
}

export interface WorkflowTaskCompletedEvent extends BaseEvent {
    category: 'workflow';
    type: 'workflow.task_completed';
    payload: {
        workflowId: string;
        projectId: number;
        projectSequence: number;
        status: 'success' | 'failure';
        duration: number;
        cost?: number;
        tokens?: number;
    };
}

// AI Events
export interface AIExecutionStartedEvent extends BaseEvent {
    category: 'ai';
    type: 'ai.execution_started';
    payload: {
        projectId: number;
        projectSequence: number;
        provider: string;
        model: string;
    };
}

export interface AIExecutionCompletedEvent extends BaseEvent {
    category: 'ai';
    type: 'ai.execution_completed';
    payload: {
        projectId: number;
        projectSequence: number;
        provider: string;
        model: string;
        tokensUsed: number;
        cost: number;
        duration: number;
        success: boolean;
    };
}

export interface AITokenStreamEvent extends BaseEvent {
    category: 'ai';
    type: 'ai.token_stream';
    payload: {
        projectId: number;
        projectSequence: number;
        token: string;
        accumulated: string;
    };
}

export interface AIPromptGeneratedEvent extends BaseEvent {
    category: 'ai';
    type: 'ai.prompt_generated';
    payload: {
        projectId?: number;
        projectSequence?: number;
        provider: string;
        model: string;
        prompt: string;
        systemPrompt?: string;
        requiredMCPs?: string[];
        streaming?: boolean;
        metadata?: Record<string, any>;
    };
}

export interface MCPRequestEvent extends BaseEvent {
    category: 'ai';
    type: 'ai.mcp_request';
    payload: {
        taskId?: number;
        projectId?: number;
        projectSequence?: number;
        taskTitle?: string;
        projectName?: string;
        mcpId: number;
        mcpName?: string;
        endpoint?: string;
        toolName: string;
        parameters: Record<string, any>;
    };
}

export interface MCPResponseEvent extends BaseEvent {
    category: 'ai';
    type: 'ai.mcp_response';
    payload: {
        taskId?: number;
        projectId?: number;
        projectSequence?: number;
        taskTitle?: string;
        projectName?: string;
        mcpId: number;
        mcpName?: string;
        toolName: string;
        success: boolean;
        duration?: number;
        dataPreview?: string;
        error?: string;
    };
}

export interface MCPErrorEvent extends BaseEvent {
    category: 'ai';
    type: 'ai.mcp_error';
    payload: {
        mcpId: number;
        error: string;
        context?: string;
    };
}

export interface CuratorStartedEvent extends BaseEvent {
    category: 'ai';
    type: 'ai.curator_started';
    payload: {
        projectId: number;
        projectSequence: number;
        taskTitle: string;
    };
}

export interface CuratorStepEvent extends BaseEvent {
    category: 'ai';
    type: 'ai.curator_step';
    payload: {
        projectId: number;
        projectSequence: number;
        step: 'analyzing' | 'extracting' | 'updating' | 'saving';
        detail: string;
    };
}

export interface CuratorCompletedEvent extends BaseEvent {
    category: 'ai';
    type: 'ai.curator_completed';
    payload: {
        projectId: number;
        projectSequence: number;
        summaryUpdate?: string;
        newDecisionsCount: number;
        glossaryUpdatesCount: number;
        success: boolean;
    };
}

// Automation Events
export interface AutomationTriggeredEvent extends BaseEvent {
    category: 'automation';
    type: 'automation.triggered';
    payload: {
        ruleId: string;
        triggerType: string;
        triggerEvent: BaseEvent;
    };
}

export interface AutomationActionExecutedEvent extends BaseEvent {
    category: 'automation';
    type: 'automation.action_executed';
    payload: {
        ruleId: string;
        actionType: string;
        success: boolean;
        result?: any;
        error?: string;
    };
}

// Comment Events
export interface CommentCreatedEvent extends BaseEvent {
    category: 'task';
    type: 'comment.created';
    payload: {
        commentId: number;
        projectId: number;
        projectSequence: number;
        userId: number;
        content: string;
        mentions: number[];
    };
}

// System Events
export interface SystemErrorEvent extends BaseEvent {
    category: 'system';
    type: 'system.error';
    payload: {
        error: string;
        stack?: string;
        context?: Record<string, any>;
    };
}

export interface WebhookReceivedEvent extends BaseEvent {
    category: 'system';
    type: 'webhook.received';
    payload: {
        webhookId: string;
        method: string;
        headers: Record<string, string>;
        body: any;
    };
}

// Cost Events
export interface CostExceededEvent extends BaseEvent {
    category: 'system';
    type: 'cost.exceeded';
    payload: {
        currentCost: number;
        limit: number;
        projectId?: number;
        workflowId?: string;
    };
}

// UI Events
export interface UICloseModalEvent extends BaseEvent {
    category: 'system';
    type: 'ui.close_modal';
    payload: Record<string, never>;
}

// Union type for all events
export type AppEvent =
    | TaskCreatedEvent
    | TaskUpdatedEvent
    | TaskStatusChangedEvent
    | TaskAssignedEvent
    | TaskDeletedEvent
    | ProjectCreatedEvent
    | ProjectUpdatedEvent
    | WorkflowStartedEvent
    | WorkflowProgressEvent
    | WorkflowCompletedEvent
    | WorkflowTaskCompletedEvent
    | AIExecutionStartedEvent
    | AIExecutionCompletedEvent
    | AITokenStreamEvent
    | AIPromptGeneratedEvent
    | MCPRequestEvent
    | MCPResponseEvent
    | MCPErrorEvent
    | CuratorStartedEvent
    | CuratorStepEvent
    | CuratorCompletedEvent
    | AutomationTriggeredEvent
    | AutomationActionExecutedEvent
    | CommentCreatedEvent
    | SystemErrorEvent
    | WebhookReceivedEvent
    | CostExceededEvent
    | UICloseModalEvent;

// Event handler types
export type EventHandler<T extends BaseEvent = BaseEvent> = (event: T) => void | Promise<void>;
export type AsyncEventHandler<T extends BaseEvent = BaseEvent> = (event: T) => Promise<void>;

// ========================================
// EventBus Class
// ========================================

export class EventBus {
    private emitter: BrowserEventEmitter;
    private eventHistory: BaseEvent[] = [];
    private maxHistorySize: number = 1000;
    private handlers: Map<string, Set<EventHandler>> = new Map();
    private wildcardHandlers: Set<EventHandler> = new Set();

    constructor() {
        this.emitter = new BrowserEventEmitter();
        this.emitter.setMaxListeners(100);
    }

    /**
     * Generate unique event ID
     */
    private generateEventId(): string {
        return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    private inferCategoryFromType(type: string): EventCategory {
        const key = type.split(/\.|:/)[0] as EventCategory;
        return EVENT_CATEGORY_SET.has(key) ? key : 'system';
    }

    /**
     * Emit an event
     */
    emit<T extends AppEvent>(
        type: T['type'],
        payload: T['payload'],
        source?: string,
        metadata?: Record<string, any>
    ): T;
    emit(
        type: string,
        payload: Record<string, any>,
        source?: string,
        metadata?: Record<string, any>
    ): BaseEvent;
    emit(
        type: string,
        payload: Record<string, any>,
        source: string = 'system',
        metadata?: Record<string, any>
    ): BaseEvent {
        const category = this.inferCategoryFromType(type);

        const event: BaseEvent = {
            id: this.generateEventId(),
            timestamp: new Date(),
            category,
            type,
            source,
            payload,
            metadata,
        };

        // Store in history
        this.eventHistory.push(event);
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.shift();
        }

        // Emit to specific handlers
        this.emitter.emit(type, event);

        // Emit to category handlers (e.g., 'task.*')
        this.emitter.emit(`${category}.*`, event);

        // Emit to wildcard handlers
        this.emitter.emit('*', event);

        console.log(`[EventBus] Emitted: ${type}`, { id: event.id, source });

        return event;
    }

    /**
     * Subscribe to an event type
     */
    on<T extends AppEvent>(
        type: T['type'] | `${EventCategory}.*` | '*',
        handler: EventHandler<T>
    ): () => void;
    on(type: string, handler: EventHandler): () => void;
    on(type: string, handler: EventHandler): () => void {
        this.emitter.on(type, handler as any);

        // Track handler for cleanup
        if (type === '*') {
            this.wildcardHandlers.add(handler as EventHandler);
        } else {
            if (!this.handlers.has(type)) {
                this.handlers.set(type, new Set());
            }
            this.handlers.get(type)!.add(handler as EventHandler);
        }

        // Return unsubscribe function
        return () => this.off(type, handler);
    }

    /**
     * Subscribe to an event type (one-time)
     */
    once<T extends AppEvent>(
        type: T['type'] | `${EventCategory}.*` | '*',
        handler: EventHandler<T>
    ): () => void;
    once(type: string, handler: EventHandler): () => void;
    once(type: string, handler: EventHandler): () => void {
        const wrappedHandler = (event: BaseEvent) => {
            this.off(type, wrappedHandler as EventHandler);
            handler(event);
        };

        return this.on(type, wrappedHandler);
    }

    /**
     * Unsubscribe from an event type
     */
    off<T extends AppEvent>(
        type: T['type'] | `${EventCategory}.*` | '*',
        handler: EventHandler<T>
    ): void;
    off(type: string, handler: EventHandler): void;
    off(type: string, handler: EventHandler): void {
        this.emitter.off(type, handler as any);

        if (type === '*') {
            this.wildcardHandlers.delete(handler as EventHandler);
        } else {
            this.handlers.get(type)?.delete(handler as EventHandler);
        }
    }

    /**
     * Wait for an event (Promise-based)
     */
    waitFor<T extends AppEvent>(
        type: T['type'],
        timeout?: number,
        predicate?: (event: T) => boolean
    ): Promise<T>;
    waitFor(
        type: string,
        timeout?: number,
        predicate?: (event: BaseEvent) => boolean
    ): Promise<BaseEvent>;
    waitFor(
        type: string,
        timeout?: number,
        predicate?: (event: BaseEvent) => boolean
    ): Promise<BaseEvent> {
        return new Promise((resolve, reject) => {
            let timeoutId: NodeJS.Timeout | undefined;

            const handler = (event: BaseEvent) => {
                if (!predicate || predicate(event)) {
                    if (timeoutId) clearTimeout(timeoutId);
                    this.off(type, handler);
                    resolve(event);
                }
            };

            this.on(type, handler);

            if (timeout) {
                timeoutId = setTimeout(() => {
                    this.off(type, handler);
                    reject(new Error(`Timeout waiting for event: ${type}`));
                }, timeout);
            }
        });
    }

    /**
     * Get event history
     */
    getHistory(filter?: {
        type?: string;
        category?: EventCategory;
        since?: Date;
        limit?: number;
    }): BaseEvent[] {
        let events = [...this.eventHistory];

        if (filter?.type) {
            events = events.filter((e) => e.type === filter.type);
        }

        if (filter?.category) {
            events = events.filter((e) => e.category === filter.category);
        }

        if (filter?.since) {
            events = events.filter((e) => e.timestamp >= filter.since!);
        }

        if (filter?.limit) {
            events = events.slice(-filter.limit);
        }

        return events;
    }

    /**
     * Clear event history
     */
    clearHistory(): void {
        this.eventHistory = [];
    }

    /**
     * Get listener count for an event type
     */
    listenerCount(type: string): number {
        return this.emitter.listenerCount(type);
    }

    /**
     * Remove all listeners
     */
    removeAllListeners(type?: string): void {
        if (type) {
            this.emitter.removeAllListeners(type);
            this.handlers.delete(type);
        } else {
            this.emitter.removeAllListeners();
            this.handlers.clear();
            this.wildcardHandlers.clear();
        }
    }

    /**
     * Create typed emitter helpers
     */
    createEmitter<T extends AppEvent>(type: T['type'], source: string) {
        return (payload: T['payload'], metadata?: Record<string, any>) => {
            return this.emit<T>(type, payload, source, metadata);
        };
    }
}

// Export singleton instance
export const eventBus = new EventBus();

// Export helper functions
export function emitTaskCreated(
    payload: TaskCreatedEvent['payload'],
    source: string = 'task-service'
): TaskCreatedEvent {
    return eventBus.emit<TaskCreatedEvent>('task.created', payload, source);
}

export function emitTaskStatusChanged(
    payload: TaskStatusChangedEvent['payload'],
    source: string = 'task-service'
): TaskStatusChangedEvent {
    return eventBus.emit<TaskStatusChangedEvent>('task.status_changed', payload, source);
}

export function emitTaskAssigned(
    payload: TaskAssignedEvent['payload'],
    source: string = 'task-service'
): TaskAssignedEvent {
    return eventBus.emit<TaskAssignedEvent>('task.assigned', payload, source);
}

export function emitWorkflowStarted(
    payload: WorkflowStartedEvent['payload'],
    source: string = 'workflow-service'
): WorkflowStartedEvent {
    return eventBus.emit<WorkflowStartedEvent>('workflow.started', payload, source);
}

export function emitWorkflowProgress(
    payload: WorkflowProgressEvent['payload'],
    source: string = 'workflow-service'
): WorkflowProgressEvent {
    return eventBus.emit<WorkflowProgressEvent>('workflow.progress', payload, source);
}

export function emitWorkflowCompleted(
    payload: WorkflowCompletedEvent['payload'],
    source: string = 'workflow-service'
): WorkflowCompletedEvent {
    return eventBus.emit<WorkflowCompletedEvent>('workflow.completed', payload, source);
}

export function emitCommentCreated(
    payload: CommentCreatedEvent['payload'],
    source: string = 'comment-service'
): CommentCreatedEvent {
    return eventBus.emit<CommentCreatedEvent>('comment.created', payload, source);
}

export function emitCostExceeded(
    payload: CostExceededEvent['payload'],
    source: string = 'budget-service'
): CostExceededEvent {
    return eventBus.emit<CostExceededEvent>('cost.exceeded', payload, source);
}

export function emitWebhookReceived(
    payload: WebhookReceivedEvent['payload'],
    source: string = 'webhook-service'
): WebhookReceivedEvent {
    return eventBus.emit<WebhookReceivedEvent>('webhook.received', payload, source);
}
