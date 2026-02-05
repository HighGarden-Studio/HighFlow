/**
 * Console Store
 *
 * Manages global state for the Activity Console, including:
 * - Active task executions (AI generating, Scripts running)
 * - Structured transcripts for each execution
 * - Parallel execution tracking (Swimlanes)
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Task } from '@core/types/database';

export type ExecutionStatus = 'idle' | 'running' | 'success' | 'failed' | 'paused' | 'waiting';

export interface ConsoleEvent {
    id: string;
    type: 'user' | 'assistant' | 'system' | 'thought' | 'tool_use' | 'tool_result' | 'error';
    content: string;
    timestamp: Date;
    metadata?: Record<string, any>;
    // For tool use/result
    toolName?: string;
    input?: string;
    output?: string;
    isExpanded?: boolean; // UI state
}

export interface ExecutionContext {
    taskId: number;
    projectId: number;
    projectSequence: number;
    title: string;
    status: ExecutionStatus;
    startTime: Date;
    endTime?: Date;
    agentType?: string; // e.g., 'claude', 'gpt-4', 'script'
    transcript: ConsoleEvent[];
    // Task-specific data for display
    taskType?: 'ai' | 'script' | 'input' | 'output' | null;
    taskResult?: {
        content?: string;
        inputValue?: string; // For input tasks
        outputSummary?: string; // For output tasks
        savedContent?: string; // For output tasks - the actual content that was saved
        returnValue?: unknown; // For script tasks
    };
}

export const useConsoleStore = defineStore('console', () => {
    // ========================================
    // State
    // ========================================

    // Counter for generating unique execution IDs
    let executionCounter = 0;
    const generateExecutionId = () => ++executionCounter;

    // Map of Execution ID -> Execution Context (allows multiple instances of same task)
    const executions = ref<Map<number, ExecutionContext>>(new Map());

    // Ordered list of active execution IDs for visualization layout
    const activeExecutionIds = ref<number[]>([]);

    // Map of Task ID -> Current Execution ID (for finding the most recent execution of a task)
    const taskToCurrentExecution = ref<Map<number, number>>(new Map());

    const isConsoleOpen = ref(false);

    // ========================================
    // Getters
    // ========================================

    // Get all active executions (running or recently finished but still relevant)
    const activeExecutions = computed(() => {
        return activeExecutionIds.value
            .map((id) => executions.value.get(id))
            .filter((ctx): ctx is ExecutionContext => !!ctx);
    });

    // For backwards compatibility - looks up by taskId using current execution mapping
    const getExecutionByTaskId = computed(() => (taskId: number) => {
        const executionId = taskToCurrentExecution.value.get(taskId);
        return executionId ? executions.value.get(executionId) : undefined;
    });

    // Get execution by execution ID directly
    const getExecutionById = computed(() => (executionId: number) => {
        return executions.value.get(executionId);
    });

    const hasActiveExecutions = computed(() => {
        return activeExecutionIds.value.some((id) => {
            const ctx = executions.value.get(id);
            return (
                ctx &&
                (ctx.status === 'running' || ctx.status === 'waiting' || ctx.status === 'paused')
            );
        });
    });

    // Legacy alias for activeTaskIds (returns executionIds now)
    const activeTaskIds = activeExecutionIds;

    // ========================================
    // Actions
    // ========================================

    /**
     * Start tracking a task execution.
     * ALWAYS creates a NEW card for each execution - never merges.
     * Each execution is independent, history is preserved.
     */
    function registerExecution(task: Task, agentType: string = 'unknown') {
        if (!task.id) return;

        // ALWAYS create new execution with unique ID - no merging ever
        const executionId = generateExecutionId();

        const context: ExecutionContext = {
            taskId: task.id,
            projectId: task.projectId,
            projectSequence: task.projectSequence,
            title: task.title,
            status: 'running',
            startTime: new Date(),
            agentType,
            transcript: [
                {
                    id: `evt-start-${Date.now()}`,
                    type: 'system',
                    content: `Execution started${agentType !== 'unknown' ? ` using ${agentType}` : ''}...`,
                    timestamp: new Date(),
                },
            ],
        };

        // Store by executionId (not taskId) - this allows multiple cards for same task
        executions.value.set(executionId, context);

        // Update task -> current execution mapping (points to this new execution)
        taskToCurrentExecution.value.set(task.id, executionId);

        // Add to active list at the END (most recent)
        activeExecutionIds.value.push(executionId);

        // Auto-open console
        if (!isConsoleOpen.value) {
            isConsoleOpen.value = true;
        }
    }

    /**
     * Update execution status (uses taskId, resolves to current executionId)
     */
    function updateStatus(taskId: number, status: ExecutionStatus) {
        const executionId = taskToCurrentExecution.value.get(taskId);
        const ctx = executionId ? executions.value.get(executionId) : undefined;
        if (ctx) {
            ctx.status = status;
            if (status === 'success' || status === 'failed') {
                ctx.endTime = new Date();

                // Keep in active list for a while so user can see result,
                // but eventually we might want to archive it.
                // For now, we keep it until manually cleared or new execution starts.
            }
        }
    }

    /**
     * Append an event to the transcript (uses taskId, resolves to current executionId)
     */
    function appendEvent(taskId: number, event: Omit<ConsoleEvent, 'id' | 'timestamp'>) {
        const executionId = taskToCurrentExecution.value.get(taskId);
        const ctx = executionId ? executions.value.get(executionId) : undefined;
        if (!ctx) return;

        const newEvent: ConsoleEvent = {
            ...event,
            id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            timestamp: new Date(),
        };

        ctx.transcript.push(newEvent);
    }

    /**
     * Stream content to the latest event or create a new one (uses taskId)
     */
    function streamToLatestEvent(
        taskId: number,
        content: string,
        type: Omit<ConsoleEvent, 'id' | 'timestamp' | 'content'> & { type: ConsoleEvent['type'] }
    ) {
        const executionId = taskToCurrentExecution.value.get(taskId);
        const ctx = executionId ? executions.value.get(executionId) : undefined;
        if (!ctx) return;

        const lastEvent = ctx.transcript[ctx.transcript.length - 1];

        // Check if we can append to the last event
        // We can append if:
        // 1. It exists
        // 2. Types match
        // 3. Last event is not an error (errors usually stand alone)
        // 4. Last event is not a tool_use/result (those usually come in blocks) - though tool output streaming might differ
        // For 'assistant' (AI response) and 'thought' (reasoning), we definitely want to stream.
        if (lastEvent && lastEvent.type === type.type && !lastEvent.metadata?.finalized) {
            lastEvent.content += content;
            // Update other props if provided (e.g. metadata)
            if (type.metadata) {
                lastEvent.metadata = { ...lastEvent.metadata, ...type.metadata };
            }
        } else {
            // Create new event
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { type: _type, ...otherProps } = type;
            appendEvent(taskId, {
                type: type.type,
                content: content,
                ...otherProps,
            });
        }
    }

    /**
     * Update the latest event content (replace instead of append)
     * Useful for non-streaming updates where we receive the full cumulative content.
     */
    function updateLatestEventContent(
        taskId: number,
        content: string,
        type: Omit<ConsoleEvent, 'id' | 'timestamp' | 'content'> & { type: ConsoleEvent['type'] }
    ) {
        const executionId = taskToCurrentExecution.value.get(taskId);
        const ctx = executionId ? executions.value.get(executionId) : undefined;
        if (!ctx) return;

        const lastEvent = ctx.transcript[ctx.transcript.length - 1];

        // If we can update the last event (same type)
        if (lastEvent && lastEvent.type === type.type && !lastEvent.metadata?.finalized) {
            lastEvent.content = content;
            if (type.metadata) {
                lastEvent.metadata = { ...lastEvent.metadata, ...type.metadata };
            }
        } else {
            // Create new event if we can't update
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { type: _type, ...otherProps } = type;
            appendEvent(taskId, {
                type: type.type,
                content: content,
                ...otherProps,
            });
        }
    }

    /**
     * Clear specific execution by taskId (removes its current execution)
     */
    function clearExecution(taskId: number) {
        const executionId = taskToCurrentExecution.value.get(taskId);
        if (executionId) {
            executions.value.delete(executionId);
            activeExecutionIds.value = activeExecutionIds.value.filter((id) => id !== executionId);
        }
        taskToCurrentExecution.value.delete(taskId);
    }

    /**
     * Clear all executions
     */
    function clearAll() {
        executions.value.clear();
        activeExecutionIds.value = [];
        taskToCurrentExecution.value.clear();
    }

    function setConsoleOpen(open: boolean) {
        isConsoleOpen.value = open;
    }

    /**
     * Update task result data for display (uses taskId, resolves to current executionId)
     */
    function updateTaskResult(
        taskId: number,
        taskType: 'ai' | 'script' | 'input' | 'output' | null,
        result: ExecutionContext['taskResult']
    ) {
        const executionId = taskToCurrentExecution.value.get(taskId);
        const ctx = executionId ? executions.value.get(executionId) : undefined;
        if (ctx) {
            ctx.taskType = taskType;
            ctx.taskResult = result;
        }
    }

    // ========================================
    // Event Handling
    // ========================================

    // We can listen to eventBus here if we want centralized handling,
    // or components/services can call actions directly.
    // For better decoupling, let's expose specific actions and let the IPC handlers call them.

    return {
        executions,
        activeTaskIds,
        activeExecutionIds,
        activeExecutions,
        isConsoleOpen,
        getExecutionByTaskId,
        getExecutionById,
        hasActiveExecutions,
        registerExecution,
        updateStatus,
        appendEvent,
        streamToLatestEvent,
        updateLatestEventContent,
        clearExecution,
        clearAll,
        setConsoleOpen,
        updateTaskResult,
    };
});
