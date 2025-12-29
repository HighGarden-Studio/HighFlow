/**
 * Activity Log Store
 *
 * Centralized store for activity logs displayed in the console
 * Collects events from EventBus and IPC messages
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { eventBus, type BaseEvent, type EventCategory } from '../../services/events/EventBus';
import { getAPI } from '../../utils/electron';
import { useTaskStore } from './taskStore';
import { useProjectStore } from './projectStore';
import { useUIStore } from './uiStore';

export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'debug';

export interface ActivityLogEntry {
    id: string;
    timestamp: Date;
    level: LogLevel;
    category: EventCategory | 'system' | 'ipc';
    type: string;
    message: string;
    details?: Record<string, unknown>;
    source: string;
    projectId?: number;
    taskId?: number;
}

export const useActivityLogStore = defineStore('activityLog', () => {
    // State
    const logs = ref<ActivityLogEntry[]>([]);
    const maxLogs = ref(500);
    const isConsoleOpen = ref(false);
    const consoleHeight = ref(250);
    const filter = ref<{
        levels: LogLevel[];
        categories: (EventCategory | 'system' | 'ipc')[];
        search: string;
    }>({
        levels: ['info', 'success', 'warning', 'error'],
        categories: ['task', 'project', 'workflow', 'ai', 'automation', 'system', 'ipc'],
        search: '',
    });
    const autoscroll = ref(true);
    const isSubscribed = ref(false);
    const isIPCSubscribed = ref(false);

    // Helpers
    function resolveTaskName(taskId: number): string {
        const taskStore = useTaskStore();
        const projectStore = useProjectStore();

        const task = taskStore.tasks.find((t) => t.id === taskId);

        if (task) {
            const project = projectStore.projectById(task.projectId);
            const projectTitle = project ? project.title : 'Unknown Project';
            const sequence = task.projectSequence || '?';
            return `[${projectTitle}] #${sequence}`;
        }

        return `Task #${taskId}`;
    }

    // Computed
    const filteredLogs = computed(() => {
        return logs.value.filter((log) => {
            // Filter by level
            if (!filter.value.levels.includes(log.level)) return false;

            // Filter by category
            if (!filter.value.categories.includes(log.category)) return false;

            // Filter by search
            if (filter.value.search) {
                const searchLower = filter.value.search.toLowerCase();
                return (
                    log.message.toLowerCase().includes(searchLower) ||
                    log.type.toLowerCase().includes(searchLower) ||
                    log.source.toLowerCase().includes(searchLower)
                );
            }

            return true;
        });
    });

    const unreadCount = computed(() => {
        if (isConsoleOpen.value) return 0;
        return logs.value.filter((log) => log.level === 'error' || log.level === 'warning').length;
    });

    const stats = computed(() => ({
        total: logs.value.length,
        info: logs.value.filter((l) => l.level === 'info').length,
        success: logs.value.filter((l) => l.level === 'success').length,
        warning: logs.value.filter((l) => l.level === 'warning').length,
        error: logs.value.filter((l) => l.level === 'error').length,
    }));

    // Actions
    function addLog(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>) {
        const log: ActivityLogEntry = {
            ...entry,
            id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            timestamp: new Date(),
        };

        logs.value.push(log);

        // Trim old logs incrementally to avoid abrupt clearing
        while (logs.value.length > maxLogs.value) {
            logs.value.shift(); // Remove oldest entry
        }

        // Trigger persistent toast for errors
        if (log.level === 'error') {
            const uiStore = useUIStore();
            let toastMessage = log.message;

            // Format: Project - Task - Content
            const parts: string[] = [];

            // Add Project Name if available
            if (log.details?.projectName) {
                parts.push(log.details.projectName as string);
            } else if (log.details?.projectId) {
                parts.push(`Project #${log.details.projectId}`);
            }

            // Add Task Name if available (using resolveTaskName logic or explicit name)
            if (log.details?.taskTitle) {
                parts.push(log.details.taskTitle as string);
            } else if (log.details?.taskId) {
                parts.push(resolveTaskName(log.details.taskId as number));
            } else if (typeof log.details?.task === 'string') {
                parts.push(log.details.task); // Legacy support
            }

            // Add Content (Error Message)
            parts.push(log.message);

            if (parts.length > 1) {
                toastMessage = parts.join(' - ');
            }

            uiStore.showToast({
                message: toastMessage,
                type: 'error',
                duration: 0, // Persistent until dismissed
            });
        }
    }

    function addEventLog(event: BaseEvent) {
        const level = getLogLevelFromEvent(event);
        const message = formatEventMessage(event);

        addLog({
            level,
            category: event.category,
            type: event.type,
            message,
            details: event.payload as Record<string, unknown>,
            source: event.source,
            projectId: (event.payload as Record<string, unknown>)?.projectId as number | undefined,
            taskId: (event.payload as Record<string, unknown>)?.taskId as number | undefined,
        });
    }

    function getLogLevelFromEvent(event: BaseEvent): LogLevel {
        const type = event.type;

        // Errors
        if (type.includes('error') || type.includes('failed')) return 'error';

        // Warnings
        if (type.includes('exceeded') || type.includes('warning')) return 'warning';

        // Success
        if (type.includes('completed') || type.includes('created') || type.includes('success')) {
            return 'success';
        }

        // Default to info
        return 'info';
    }

    function truncateText(value?: string, limit: number = 160): string {
        if (!value) return '';
        return value.length > limit ? `${value.slice(0, limit)}…` : value;
    }

    function formatEventMessage(event: BaseEvent): string {
        const payload = event.payload as Record<string, any>;

        switch (event.type) {
            // Task events
            case 'task.created':
                return `Task "${payload.title}" created`;
            case 'task.updated':
                return `${resolveTaskName(payload.taskId)} updated`;
            case 'task.status_changed':
                return `${resolveTaskName(payload.taskId)} status: ${payload.previousStatus} -> ${payload.newStatus}`;
            case 'task.assigned':
                return `${resolveTaskName(payload.taskId)} assigned to user #${payload.newAssignee}`;
            case 'task.deleted':
                return `${resolveTaskName(payload.taskId)} deleted`;

            // Project events
            case 'project.created':
                return `Project "${payload.title}" created`;
            case 'project.updated':
                return `Project #${payload.projectId} updated`;

            // Workflow events
            case 'workflow.started':
                return `Workflow started with ${payload.taskCount} tasks`;
            case 'workflow.progress':
                return `Workflow progress: ${payload.percentage}% (${payload.completedTasks}/${payload.totalTasks})`;
            case 'workflow.completed':
                return `Workflow ${payload.status}: ${payload.successCount} success, ${payload.failureCount} failed`;
            case 'workflow.task_completed':
                return `Workflow task ${resolveTaskName(payload.taskId)} ${payload.status}`;

            // AI events
            case 'ai.execution_started':
                return `AI execution started for ${resolveTaskName(payload.taskId)} (${payload.provider}/${payload.model})`;
            case 'ai.execution_completed':
                return `AI execution ${payload.success ? 'completed' : 'failed'} for ${resolveTaskName(payload.taskId)} (tokens: ${payload.tokensUsed}, cost: ${payload.cost})`;
            case 'ai.token_stream':
                return `Token stream for ${resolveTaskName(payload.taskId)}`;
            case 'ai.prompt_generated': {
                const provider = payload.provider || 'unknown';
                const model = payload.model || 'unknown';
                const preview = truncateText(payload.prompt);
                const taskLabel = payload.taskId ? resolveTaskName(payload.taskId) : 'n/a';
                return `Prompt prepared for ${taskLabel} (${provider}/${model}): ${preview}`;
            }
            case 'ai.mcp_request': {
                const tool = payload.toolName || 'unknown tool';
                const mcp = payload.mcpName || payload.mcpId || 'unknown MCP';
                const params = truncateText(
                    typeof payload.parameters === 'object'
                        ? JSON.stringify(payload.parameters)
                        : String(payload.parameters || '')
                );
                return `MCP request "${tool}" via ${mcp}: ${params}`;
            }
            case 'ai.mcp_response': {
                const tool = payload.toolName || 'unknown tool';
                const status = payload.success ? 'succeeded' : 'failed';
                const duration =
                    typeof payload.duration === 'number' ? `${payload.duration}ms` : '';
                const preview = payload.dataPreview ? ` ${truncateText(payload.dataPreview)}` : '';
                const errorMessage =
                    !payload.success && payload.error ? ` Error: ${payload.error}` : '';
                return `MCP response "${tool}" ${status} ${duration}${preview}${errorMessage}`;
            }

            // Automation events
            case 'automation.triggered':
                return `Automation rule "${payload.ruleId}" triggered`;
            case 'automation.action_executed':
                return `Automation action "${payload.actionType}" ${payload.success ? 'succeeded' : 'failed'}`;

            // System events
            case 'system.error':
                return `System error: ${payload.error}`;
            case 'system.test':
                return `System test: ${payload.message || 'Test event received'}`;
            case 'webhook.received':
                return `Webhook received: ${payload.webhookId}`;
            case 'cost.exceeded':
                return `Cost limit exceeded: $${payload.currentCost} / $${payload.limit}`;

            default:
                return `${event.type}: ${JSON.stringify(payload).substring(0, 100)}`;
        }
    }

    function clearLogs() {
        logs.value = [];
    }

    function toggleConsole() {
        isConsoleOpen.value = !isConsoleOpen.value;
    }

    function setConsoleHeight(height: number) {
        consoleHeight.value = Math.max(100, Math.min(600, height));
    }

    function setFilter(newFilter: Partial<typeof filter.value>) {
        filter.value = { ...filter.value, ...newFilter };
    }

    function toggleLevel(level: LogLevel) {
        const index = filter.value.levels.indexOf(level);
        if (index === -1) {
            filter.value.levels.push(level);
        } else {
            filter.value.levels.splice(index, 1);
        }
    }

    function toggleCategory(category: EventCategory | 'system' | 'ipc') {
        const index = filter.value.categories.indexOf(category);
        if (index === -1) {
            filter.value.categories.push(category);
        } else {
            filter.value.categories.splice(index, 1);
        }
    }

    // Subscribe to EventBus
    function subscribeToEvents() {
        if (isSubscribed.value) return;

        // Subscribe to all events
        eventBus.on('*', addEventLog);

        // Load existing history
        const history = eventBus.getHistory({ limit: 100 });
        history.forEach(addEventLog);

        isSubscribed.value = true;
    }

    // Subscribe to IPC events
    function subscribeToIPCEvents() {
        if (isIPCSubscribed.value) return;

        const api = getAPI();
        if (!api) return;

        // Task execution events
        if (api.taskExecution) {
            api.taskExecution.onStarted((data) => {
                addLog({
                    level: 'info',
                    category: 'ipc',
                    type: 'taskExecution.started',
                    message: `${resolveTaskName(data.taskId)} execution started`,
                    details: data as unknown as Record<string, unknown>,
                    source: 'ipc',
                    taskId: data.taskId,
                });
            });

            api.taskExecution.onProgress((data) => {
                addLog({
                    level: 'debug',
                    category: 'ipc',
                    type: 'taskExecution.progress',
                    message: `${resolveTaskName(data.taskId)} progress: ${(data as any).progress ?? (data as any).percentage ?? 0}%`,
                    details: data as unknown as Record<string, unknown>,
                    source: 'ipc',
                    taskId: data.taskId,
                });
            });

            api.taskExecution.onCompleted((data) => {
                addLog({
                    level: 'success',
                    category: 'ipc',
                    type: 'taskExecution.completed',
                    message: `${resolveTaskName(data.taskId)} execution completed`,
                    details: data as unknown as Record<string, unknown>,
                    source: 'ipc',
                    taskId: data.taskId,
                });
            });

            api.taskExecution.onFailed((data) => {
                addLog({
                    level: 'error',
                    category: 'ipc',
                    type: 'taskExecution.failed',
                    message: `${resolveTaskName(data.taskId)} execution failed: ${data.error}`,
                    details: data as unknown as Record<string, unknown>,
                    source: 'ipc',
                    taskId: data.taskId,
                });
            });

            api.taskExecution.onPaused((data) => {
                addLog({
                    level: 'warning',
                    category: 'ipc',
                    type: 'taskExecution.paused',
                    message: `${resolveTaskName(data.taskId)} execution paused`,
                    details: data as unknown as Record<string, unknown>,
                    source: 'ipc',
                    taskId: data.taskId,
                });
            });

            api.taskExecution.onResumed((data) => {
                addLog({
                    level: 'info',
                    category: 'ipc',
                    type: 'taskExecution.resumed',
                    message: `${resolveTaskName(data.taskId)} execution resumed`,
                    details: data as unknown as Record<string, unknown>,
                    source: 'ipc',
                    taskId: data.taskId,
                });
            });

            api.taskExecution.onStopped((data) => {
                addLog({
                    level: 'warning',
                    category: 'ipc',
                    type: 'taskExecution.stopped',
                    message: `${resolveTaskName(data.taskId)} execution stopped`,
                    details: data as unknown as Record<string, unknown>,
                    source: 'ipc',
                    taskId: data.taskId,
                });
            });

            api.taskExecution.onApprovalRequired((data) => {
                addLog({
                    level: 'warning',
                    category: 'ipc',
                    type: 'taskExecution.approvalRequired',
                    message: `${resolveTaskName(data.taskId)} needs approval: ${data.question}`,
                    details: data as unknown as Record<string, unknown>,
                    source: 'ipc',
                    taskId: data.taskId,
                });
            });
        }

        // General events
        if (api.events) {
            api.events.on('task:status-changed', (data: unknown) => {
                const eventData = data as { id: number; status: string };
                addLog({
                    level: 'info',
                    category: 'ipc',
                    type: 'task.status-changed',
                    message: `${resolveTaskName(eventData.id)} status changed to ${eventData.status}`,
                    details: eventData as unknown as Record<string, unknown>,
                    source: 'ipc',
                    taskId: eventData.id,
                });
            });

            // Listen for project events
            api.events.on('project:updated', (data: unknown) => {
                const project = data as { id: number; title: string };
                addLog({
                    level: 'info',
                    category: 'ipc',
                    type: 'project.updated',
                    message: `Project "${project.title}" (ID: ${project.id}) settings updated`,
                    details: project as unknown as Record<string, unknown>,
                    source: 'ipc',
                    projectId: project.id,
                });
            });

            // Listen for generic activity logs from backend
            api.events.on('activity:log', (data: unknown) => {
                const log = data as {
                    level: LogLevel;
                    message: string;
                    details?: Record<string, unknown>;
                    timestamp: string;
                };
                addLog({
                    level: log.level,
                    category: 'ipc',
                    type: 'backend.log',
                    message: log.message,
                    details: log.details,
                    source: 'backend',
                    taskId: (log.details?.taskId as number) || undefined,
                });
            });

            // Listen for new task history entries
            api.events.on('task-history:created', (data: unknown) => {
                const history = data as {
                    taskId: number;
                    eventType: string;
                    eventData?: any;
                    metadata?: any;
                };

                // We map specific history events to readable log messages
                let message = `${resolveTaskName(history.taskId)} event: ${history.eventType}`;
                let level: LogLevel = 'info';

                if (history.eventType === 'execution_started') {
                    // Already covered by taskExecution.started, but good to have history confirmation
                    return;
                } else if (history.eventType === 'execution_completed') {
                    // Already covered
                    return;
                } else if (history.eventType === 'execution_failed') {
                    // Already covered
                    return;
                } else if (history.eventType === 'ai_review_requested') {
                    message = `AI Review requested for ${resolveTaskName(history.taskId)}`;
                } else if (history.eventType === 'ai_review_completed') {
                    const approved = history.eventData?.approved;
                    message = `AI Review completed for ${resolveTaskName(history.taskId)}: ${approved ? 'Approved' : 'Changes Requested'}`;
                    level = approved ? 'success' : 'warning';
                } else if (history.eventType === 'prompt_refined') {
                    message = `Prompt refined for ${resolveTaskName(history.taskId)}`;
                }

                addLog({
                    level,
                    category: 'ipc',
                    type: `history.${history.eventType}`,
                    message,
                    details: history as unknown as Record<string, unknown>,
                    source: 'ipc',
                    taskId: history.taskId,
                });
            });
        }

        isIPCSubscribed.value = true;
    }

    // Initialize
    function initialize() {
        subscribeToEvents();
        subscribeToIPCEvents();

        // Add initial log
        addLog({
            level: 'info',
            category: 'system',
            type: 'system.initialized',
            message: 'Activity log initialized',
            source: 'activityLogStore',
        });
    }

    return {
        // State
        logs,
        maxLogs,
        isConsoleOpen,
        consoleHeight,
        filter,
        autoscroll,

        // Computed
        filteredLogs,
        unreadCount,
        stats,

        // Actions
        addLog,
        addEventLog,
        clearLogs,
        toggleConsole,
        setConsoleHeight,
        setFilter,
        toggleLevel,
        toggleCategory,
        subscribeToEvents,
        subscribeToIPCEvents,
        initialize,
    };
});
