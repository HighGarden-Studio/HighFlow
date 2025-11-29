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
                return `Task #${payload.taskId} updated`;
            case 'task.status_changed':
                return `Task #${payload.taskId} status: ${payload.previousStatus} -> ${payload.newStatus}`;
            case 'task.assigned':
                return `Task #${payload.taskId} assigned to user #${payload.newAssignee}`;
            case 'task.deleted':
                return `Task #${payload.taskId} deleted`;

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
                return `Workflow task #${payload.taskId} ${payload.status}`;

            // AI events
            case 'ai.execution_started':
                return `AI execution started for task #${payload.taskId} (${payload.provider}/${payload.model})`;
            case 'ai.execution_completed':
                return `AI execution ${payload.success ? 'completed' : 'failed'} for task #${payload.taskId} (tokens: ${payload.tokensUsed}, cost: ${payload.cost})`;
            case 'ai.token_stream':
                return `Token stream for task #${payload.taskId}`;
            case 'ai.prompt_generated': {
                const provider = payload.provider || 'unknown';
                const model = payload.model || 'unknown';
                const preview = truncateText(payload.prompt);
                return `Prompt prepared for task #${payload.taskId ?? 'n/a'} (${provider}/${model}): ${preview}`;
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
                const duration = typeof payload.duration === 'number' ? `${payload.duration}ms` : '';
                const preview = payload.dataPreview ? ` ${truncateText(payload.dataPreview)}` : '';
                return `MCP response "${tool}" ${status} ${duration}${preview}`;
            }

            // Automation events
            case 'automation.triggered':
                return `Automation rule "${payload.ruleId}" triggered`;
            case 'automation.action_executed':
                return `Automation action "${payload.actionType}" ${payload.success ? 'succeeded' : 'failed'}`;

            // System events
            case 'system.error':
                return `System error: ${payload.error}`;
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
        const api = getAPI();
        if (!api) return;

        // Task execution events
        if (api.taskExecution) {
            api.taskExecution.onStarted((data) => {
                addLog({
                    level: 'info',
                    category: 'ipc',
                    type: 'taskExecution.started',
                    message: `Task #${data.taskId} execution started`,
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
                    message: `Task #${data.taskId} progress: ${data.progress ?? data.percentage ?? 0}%`,
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
                    message: `Task #${data.taskId} execution completed`,
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
                    message: `Task #${data.taskId} execution failed: ${data.error}`,
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
                    message: `Task #${data.taskId} execution paused`,
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
                    message: `Task #${data.taskId} execution resumed`,
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
                    message: `Task #${data.taskId} execution stopped`,
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
                    message: `Task #${data.taskId} needs approval: ${data.question}`,
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
                    message: `Task #${eventData.id} status changed to ${eventData.status}`,
                    details: eventData as unknown as Record<string, unknown>,
                    source: 'ipc',
                    taskId: eventData.id,
                });
            });
        }
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
