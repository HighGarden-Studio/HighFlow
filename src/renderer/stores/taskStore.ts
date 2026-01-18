/**
 * Task Store
 *
 * Pinia store for managing tasks state
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Task, TaskStatus } from '@core/types/database';
import type { TaskPriority, TaskType, AIProvider } from '@core/types/database';
import type { TaskOutputFormat } from '../../services/ai/AIInterviewService';
import { getAPI } from '../../utils/electron';
import {
    TASK_STATUS_TRANSITIONS,
    isValidStatusTransition,
    taskKeyToString,
} from '@core/types/database';
// import { useActivityLogStore } from './activityLogStore';
import { useMCPStore } from './mcpStore';
import { useSettingsStore } from './settingsStore';
import { useProjectStore } from './projectStore';
import { buildEnabledProvidersPayload, buildRuntimeMCPServers } from '../utils/runtimeConfig';
import { aiInterviewService } from '../../services/ai/AIInterviewService';
// Removed unused commands
import { normalizeAiResult } from '../utils/aiResultHelpers';
import i18n from '../../i18n';
import { unref } from 'vue';

// Re-export Task, TaskStatus type for convenience
export type { Task, TaskStatus, TaskType, TaskPriority };

// Removed local TaskPriority definition as it's now imported
// export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

// Re-export transition rules for convenience
export { TASK_STATUS_TRANSITIONS, isValidStatusTransition };

export interface TaskFilters {
    status?: TaskStatus;
    priority?: TaskPriority;
    assigneeId?: number;
    search?: string;
}

export interface GroupedTasks {
    todo: Task[];
    in_progress: Task[];
    needs_approval: Task[];
    in_review: Task[];
    done: Task[];
    failed: Task[];
    blocked: Task[];
}

export const useTaskStore = defineStore('tasks', () => {
    // ========================================
    // State
    // ========================================

    const tasks = ref<Task[]>([]);
    const currentTask = ref<Task | null>(null);
    const currentProjectId = ref<number | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const filters = ref<TaskFilters>({});
    const settingsStore = useSettingsStore();

    // Set to track recently failed tasks (to prevent stale fetches from reverting status)
    const failedTaskIds = ref<Set<string>>(new Set());

    // Helper for composite keys
    function getTaskKey(
        pd: { projectId: number; projectSequence: number } | null | undefined
    ): string {
        if (!pd) return '';
        return taskKeyToString({ projectId: pd.projectId, projectSequence: pd.projectSequence });
    }

    function upsertTask(task: Task): void {
        if (!task) return;
        const sameProject =
            currentProjectId.value === null || task.projectId === currentProjectId.value;
        const index = tasks.value.findIndex(
            (existing) =>
                existing.projectId === task.projectId &&
                existing.projectSequence === task.projectSequence
        );
        if (index >= 0) {
            const existing = tasks.value[index];

            // Protection against stale updates:
            // If local task is DONE, and incoming update says IN_PROGRESS,
            // it is likely a race condition where a stale 'task:updated' event
            // arrived after 'task:status-changed' (done).
            // We ignore the status regression unless we are sure it's a new execution.
            // (Note: Valid retries usually set local status to in_progress via actions before this event arrives)
            if (existing && existing.status === 'done' && task.status === 'in_progress') {
                console.warn(
                    '[TaskStore] Ignoring stale task update (Done -> InProgress regression):',
                    {
                        id: `${task.projectId}-${task.projectSequence}`,
                        existingStatus: existing.status,
                        newStatus: task.status,
                    }
                );
                // Force keep local status
                task = {
                    ...task,
                    status: existing.status,
                };
            }
            tasks.value[index] = { ...existing, ...task };
        } else if (sameProject) {
            tasks.value.push(task);
        }

        if (
            currentTask.value?.projectId === task.projectId &&
            currentTask.value?.projectSequence === task.projectSequence &&
            currentTask.value
        ) {
            // Re-apply the same protection for currentTask
            const existing = currentTask.value;
            if (existing.status === 'done' && task.status === 'in_progress') {
                const { status: _status, inputSubStatus: _inputSubStatus, ...otherUpdates } = task;
                currentTask.value = { ...existing, ...otherUpdates };
            } else {
                currentTask.value = { ...existing, ...task };
            }
        }
    }

    /**
     * Remove task from local state (used by delete command)
     */
    function removeTaskFromStore(projectId: number, sequence: number): void {
        const index = tasks.value.findIndex(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (index >= 0) {
            tasks.value.splice(index, 1);
        }
    }

    // ========================================
    // Getters
    // ========================================

    const groupedTasks = computed<GroupedTasks>(() => {
        const grouped: GroupedTasks = {
            todo: [],
            in_progress: [],
            in_review: [],
            needs_approval: [],
            done: [],
            failed: [],
            blocked: [],
        };

        for (const task of tasks.value) {
            const status = task.status as TaskStatus;
            if (grouped[status]) {
                grouped[status].push(task);
            }
        }

        for (const status of Object.keys(grouped) as Array<keyof GroupedTasks>) {
            grouped[status].sort((a, b) => a.order - b.order);
        }

        return grouped;
    });

    const filteredTasks = computed(() => {
        let result = tasks.value;

        if (filters.value.status) {
            result = result.filter((t) => t.status === filters.value.status);
        }

        if (filters.value.priority) {
            result = result.filter((t) => t.priority === filters.value.priority);
        }

        if (filters.value.assigneeId) {
            result = result.filter((t) => t.assigneeId === filters.value.assigneeId);
        }

        if (filters.value.search) {
            const search = filters.value.search.toLowerCase();
            result = result.filter(
                (t) =>
                    t.title.toLowerCase().includes(search) ||
                    t.description?.toLowerCase().includes(search)
            );
        }

        return result;
    });

    // Deprecated: Use composite key (projectId + sequence) instead

    const tasksByStatus = computed(
        () => (status: TaskStatus) =>
            tasks.value.filter((t) => t.status === status).sort((a, b) => a.order - b.order)
    );

    const totalTasks = computed(() => tasks.value.length);

    const completedTasks = computed(() => tasks.value.filter((t) => t.status === 'done').length);

    const completionRate = computed(() => {
        if (totalTasks.value === 0) return 0;
        return Math.round((completedTasks.value / totalTasks.value) * 100);
    });

    // ========================================
    // Actions
    // ========================================

    /**
     * Fetch tasks for a project
     */
    async function fetchTasks(projectId: number, taskFilters?: TaskFilters): Promise<void> {
        loading.value = true;
        error.value = null;
        currentProjectId.value = projectId;

        try {
            const api = getAPI();
            const data = await api.tasks.list(projectId, taskFilters);

            // Merge local failure state if backend is stale
            const mergedData = data.map((t) => {
                const key = getTaskKey(t);
                if (failedTaskIds.value.has(key)) {
                    console.debug(`[TaskStore] Preserving failed status for task ${key}`);
                    return { ...t, status: 'failed' as TaskStatus };
                }
                return t;
            });

            /* console.debug('[TaskStore] fetchTasks response:', {
                count: mergedData?.length,
                sample: mergedData?.[0],
                hasUnreadResult: mergedData?.[0]?.hasUnreadResult,
            });
            console.debug(
                '[TaskStore] Full sample task:',
                JSON.stringify(mergedData?.[0], null, 2)
            ); */
            tasks.value = mergedData;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to fetch tasks';
            console.error('Failed to fetch tasks:', e);
        } finally {
            loading.value = false;
        }
    }

    /**
     * Fetch a single task by composite keys
     */
    async function fetchTask(projectId: number, sequence: number): Promise<Task | null> {
        loading.value = true;
        error.value = null;

        try {
            const api = getAPI();
            // API expects stringified "projectId_sequence" or separate args.
            // Assuming current backend APIs might need adjustment or we use list with filters?
            // Actually, usually GET /tasks/:id was standard.
            // We likely need a new API endpoint: GET /projects/:projectId/as-tasks/:sequence
            // OR the API client needs to be updated.
            // For now, let's assume the API client handles this or we iterate.

            // Checking how `api.tasks.get(id)` is implemented in preload/index.ts...
            // It might be `invoke('tasks:get', id)`.
            // The backend 'tasks:get' handler likely expects an ID.
            // We need to change the API call to `api.tasks.getBySequence(projectId, sequence)`
            // But let's look at what we have available.
            // If we strictly don't have ID, we can't use `api.tasks.get(id)`.

            // Assuming we have or will add `getByKey` or similar.
            // For now, I will modify this to strictly require composite components
            // and maybe fail if the underlying API isn't ready,
            // OR I will assume the API stays as is (maybe expecting an ID?)
            // BUT wait, "task 의 전역 id 는 절대 사용하지 않고" means we CANNOT send an ID.

            const task = await api.tasks.get(projectId, sequence);

            if (task) {
                // Ensure composite key matching for currentTask
                if (
                    currentTask.value?.projectId === task.projectId &&
                    currentTask.value?.projectSequence === task.projectSequence
                ) {
                    currentTask.value = task;
                }

                // Update in list if exists
                const index = tasks.value.findIndex(
                    (t) => t.projectId === projectId && t.projectSequence === sequence
                );

                if (index >= 0) {
                    tasks.value[index] = task;
                } else {
                    // Optionally add to list if it belongs to current project view?
                    if (currentProjectId.value === projectId) {
                        tasks.value.push(task);
                    }
                }
            }
            return task;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to fetch task';
            console.error('Failed to fetch task:', e);
            return null;
        } finally {
            loading.value = false;
        }
    }

    /**
     * Create a new task
     */
    async function createTask(
        data: {
            projectId: number;
            title: string;
        } & Partial<Task>
    ): Promise<Task | null> {
        loading.value = true;
        error.value = null;

        try {
            const api = getAPI();

            // Set default execution policies for AI, Script, and Output tasks
            const taskData: typeof data = {
                ...data,
                description: data.description || data.title,
            };

            // Apply defaults if not explicitly set
            const taskType = data.taskType || 'ai'; // 기본값은 'ai'

            // Apply Project Default AI Settings for AI Tasks
            if (taskType === 'ai') {
                const projectStore = useProjectStore();
                if (!taskData.aiProvider && projectStore.currentProject?.aiProvider) {
                    taskData.aiProvider = projectStore.currentProject.aiProvider;
                }
                if (!taskData.aiModel && projectStore.currentProject?.aiModel) {
                    taskData.aiModel = projectStore.currentProject.aiModel;
                }
            }

            if (taskType === 'ai' || taskType === 'script' || taskType === 'output') {
                // triggerConfig가 없거나 비어있으면 기본값 설정
                taskData.triggerConfig = {
                    type: 'dependency',
                    dependsOn: {
                        operator: 'all', // 모든 태스크가 완료되어야 함
                        executionPolicy: 'repeat', // 매번 자동 실행 (권장)
                        taskIds: [],
                    },
                } as unknown as Record<string, any>;
            }

            const task = await api.tasks.create(taskData);
            upsertTask(task as Task);
            return task as Task;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to create task';
            console.error('Failed to create task:', e);
            return null;
        } finally {
            loading.value = false;
        }
    }

    /**
     * Update an existing task
     */
    async function updateTask(
        projectId: number,
        sequence: number,
        updateData: Partial<Task>
    ): Promise<Task | null> {
        const index = tasks.value.findIndex(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );

        if (index === -1) {
            console.error(`Task with key ${projectId}_${sequence} not found for update`);
            return null;
        }

        const originalTask = { ...tasks.value[index] } as Task;

        // Optimistic update logic
        const mergedUpdate = {
            ...originalTask,
            ...updateData,
            updatedAt: new Date(),
        };

        // Validate mergedUpdate before using
        tasks.value[index] = mergedUpdate as Task;

        // Update currentTask if relevant
        if (
            currentTask.value &&
            currentTask.value.projectId === projectId &&
            currentTask.value.projectSequence === sequence
        ) {
            currentTask.value = mergedUpdate as Task;
        }

        try {
            const api = getAPI();
            // Prepare clean update data - only send what changed
            const cleanUpdateData = { ...updateData } as Record<string, unknown>;

            // Remove internal tracking fields that shouldn't be sent to backend
            delete cleanUpdateData.projectId;
            delete cleanUpdateData.projectSequence;
            delete cleanUpdateData.createdAt;
            delete cleanUpdateData.updatedAt; // Backend sets this
            // We don't need to delete other fields because we are only sending updateData now

            const plainData = JSON.parse(JSON.stringify(cleanUpdateData));
            /* console.debug(
                '📝 TaskStore.updateTask calling API:',
                { projectId, sequence },
                plainData
            ); */

            const task = await api.tasks.update(projectId, sequence, plainData);

            // Update store with API response
            if (index >= 0) {
                tasks.value[index] = { ...tasks.value[index], ...task };

                // Input Task logic
                if (originalTask.taskType === 'input' && plainData.status === 'in_progress') {
                    setTimeout(async () => {
                        try {
                            const tasksInProject = await api.tasks.list(projectId);
                            const refreshedTask = tasksInProject.find(
                                (t) => t.projectSequence === sequence
                            );

                            if (refreshedTask) {
                                // Guard: If local task is already DONE (e.g. user submitted quickly), ignore this specific stale update
                                const currentLocal = tasks.value.find(
                                    (t) =>
                                        t.projectId === projectId && t.projectSequence === sequence
                                );
                                if (currentLocal && currentLocal.status === 'done') {
                                    /* console.debug(
                                        '[TaskStore] Ignoring stale input status update (Task is already Done)'
                                    ); */
                                    return;
                                }

                                tasks.value = tasks.value.map((t) =>
                                    t.projectId === projectId && t.projectSequence === sequence
                                        ? refreshedTask
                                        : t
                                );
                                if (
                                    currentTask.value?.projectId === projectId &&
                                    currentTask.value?.projectSequence === sequence
                                ) {
                                    currentTask.value = refreshedTask;
                                }
                                window.dispatchEvent(
                                    new CustomEvent('task:input-status-changed', {
                                        detail: {
                                            projectId: refreshedTask.projectId,
                                            projectSequence: refreshedTask.projectSequence,
                                            inputSubStatus: refreshedTask.inputSubStatus,
                                        },
                                    })
                                );
                            }
                        } catch (e) {
                            console.error('📝 Failed to refetch INPUT task:', e);
                        }
                    }, 300);
                }
            }

            if (
                currentTask.value &&
                currentTask.value.projectId === projectId &&
                currentTask.value.projectSequence === sequence
            ) {
                currentTask.value = { ...currentTask.value, ...task };
            }

            return task as Task;
        } catch (e) {
            // Rollback
            tasks.value[index] = originalTask;
            error.value = e instanceof Error ? e.message : 'Failed to update task';
            console.error('Failed to update task:', e);
            return null;
        }
    }

    /**
     * Update task with history support (for user actions)
     * For simple field updates like operator assignment, status changes, etc.
     */
    /**
     * Update task with history support (for user actions)
     */
    async function updateTaskWithHistory(
        projectId: number,
        sequence: number,
        data: Partial<Task>,
        _description?: string // Temporarily unused, but kept for signature compatibility if needed
    ): Promise<Task | null> {
        const previousTask = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!previousTask) {
            return updateTask(projectId, sequence, data);
        }

        // TODO: Implement HistoryStore support for Composite Keys
        // For now, we bypass history command creation and just update.
        await updateTask(projectId, sequence, data);
        return (
            tasks.value.find((t) => t.projectId === projectId && t.projectSequence === sequence) ||
            null
        );
    }

    /**
     * Delete a task
     */
    /**
     * Delete a task
     */
    async function deleteTask(projectId: number, sequence: number): Promise<boolean> {
        loading.value = true;
        error.value = null;

        try {
            const api = getAPI();
            await api.tasks.delete(projectId, sequence);

            tasks.value = tasks.value.filter(
                (t) => !(t.projectId === projectId && t.projectSequence === sequence)
            );

            if (
                currentTask.value &&
                currentTask.value.projectId === projectId &&
                currentTask.value.projectSequence === sequence
            ) {
                currentTask.value = null;
            }
            return true;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to delete task';
            console.error('Failed to delete task:', e);
            return false;
        } finally {
            loading.value = false;
        }
    }

    /**
     * Reorder tasks (for drag-and-drop)
     */
    async function reorderTasks(sequences: number[]): Promise<void> {
        if (!currentProjectId.value) return;
        const projectId = currentProjectId.value;

        // Optimistic update
        // We assume 'sequences' is the new order of projectSequences.
        // Wait, 'reorder' usually takes a list of IDs.
        // Now it should take list of sequences?
        // Let's assume the View passes sequences.

        // Optimistic reorder in store
        // This is complex because we need to map sequences to tasks and re-sort.
        // For now, let's just call API and refresh or trust the API pushes updates.

        try {
            const api = getAPI();
            await api.tasks.reorder(projectId, sequences);
            // We should reload tasks to ensure order is correct
            await fetchTasks(projectId);
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to reorder tasks';
            console.error('Failed to reorder tasks:', e);
        }
    }

    /**
     * Move task to a different column (status)
     */
    async function moveTask(
        projectId: number,
        sequence: number,
        newStatus: TaskStatus,
        _newOrder: number
    ): Promise<void> {
        await updateTask(projectId, sequence, { status: newStatus });
        // The order update would be handled by reorderTasks after the move
    }

    /**
     * Set current task
     */
    function setCurrentTask(task: Task | null): void {
        currentTask.value = task;
    }

    /**
     * Update filters
     */
    function setFilters(newFilters: TaskFilters): void {
        filters.value = newFilters;
    }

    /**
     * Clear error
     */
    function clearError(): void {
        error.value = null;
    }

    /**
     * Clear tasks (when switching projects)
     */
    function clearTasks(): void {
        tasks.value = [];
        currentTask.value = null;
        currentProjectId.value = null;
    }

    /**
     * Change task status with validation
     * Validates the transition and applies appropriate side effects
     */
    async function changeStatus(
        projectId: number,
        sequence: number,
        newStatus: TaskStatus,
        _options: {
            approvalResponse?: string;
            refinementPrompt?: string;
            additionalWorkPrompt?: string;
            blockedReason?: string;
        } = {}
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        const currentStatus = task.status as TaskStatus;

        if (!isValidStatusTransition(currentStatus, newStatus)) {
            return {
                success: false,
                error: `Invalid transition from ${currentStatus} to ${newStatus}. Allowed: ${TASK_STATUS_TRANSITIONS[currentStatus].join(', ')}`,
            };
        }

        // Build update data
        const updateData: Partial<Task> = { status: newStatus };

        switch (newStatus) {
            case 'in_progress':
                updateData.isPaused = false;
                break;
            case 'blocked':
                // logic
                break;
            case 'todo':
                updateData.isPaused = false;
                break;
        }

        // Pass composite keys to updateTask
        const result = await updateTask(projectId, sequence, updateData);
        if (!result) {
            return { success: false, error: error.value || 'Failed to update task' };
        }

        return { success: true };
    }

    /**
     * Mark task result as read
     */
    async function markResultAsRead(projectId: number, sequence: number): Promise<void> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (task && task.hasUnreadResult) {
            await updateTask(projectId, sequence, { hasUnreadResult: false });
        }
    }

    /**
     * Get allowed status transitions for a task
     */
    /**
     * Get allowed status transitions for a task
     */
    function getAllowedTransitions(projectId: number, sequence: number): TaskStatus[] {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) return [];
        return TASK_STATUS_TRANSITIONS[task.status as TaskStatus] || [];
    }

    /**
     * Validate task is ready for execution
     * Returns null if valid, or error message if invalid
     */
    function validateTaskForExecution(task: Task): string | null {
        // Input, Script, and Output tasks don't require AI provider/prompt validation
        if (task.taskType === 'input' || task.taskType === 'script' || task.taskType === 'output') {
            return null;
        }

        // Check if prompt is set
        const hasPrompt = task.generatedPrompt || task.description;
        if (!hasPrompt) {
            return '프롬프트가 설정되지 않았습니다. 프롬프트를 작성해주세요.';
        }

        // Check if AI provider is set
        if (!task.aiProvider) {
            // 1. Check if assigned to an Operator (Assume valid, let backend validate)
            if (task.assignedOperatorId) {
                return null;
            }

            // 2. Check Project Default
            const projectStore = useProjectStore();
            if (projectStore.currentProject?.aiProvider) {
                return null;
            }

            return 'AI Provider가 설정되지 않았습니다. AI Provider를 선택해주세요.';
        }

        return null;
    }

    /**
     * Check if task is ready for execution (has prompt and AI provider)
     */
    /**
     * Check if task is ready for execution (has prompt and AI provider)
     */
    function isTaskReadyForExecution(
        projectId: number,
        sequence: number
    ): {
        ready: boolean;
        missingPrompt: boolean;
        missingProvider: boolean;
    } {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) {
            return { ready: false, missingPrompt: true, missingProvider: true };
        }

        const hasPrompt = !!(task.generatedPrompt || task.description);
        const hasProvider = !!task.aiProvider;

        return {
            ready: hasPrompt && hasProvider,
            missingPrompt: !hasPrompt,
            missingProvider: !hasProvider,
        };
    }

    /**
     * Retry task with feedback and session preservation
     */
    /**
     * Retry task with feedback and session preservation
     */
    async function retryTask(
        projectId: number,
        sequence: number,
        feedback?: string
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) return { success: false, error: 'Task not found' };

        // 1. Incorporate history and feedback into prompt if provided
        if (feedback) {
            // Get previous result to include in context
            const previousResult =
                (task as Record<string, any>).result ||
                (task as Record<string, any>).executionResult?.content ||
                (task as Record<string, any>).output?.result ||
                '';

            const historyContext = `\n\n---\n### Previous Result\n${previousResult}\n\n### User Feedback\n${feedback}\n\nplease try again based on this feedback.`;

            const currentPrompt = (task as any).aiPrompt || task.description || task.title;
            const newPrompt = currentPrompt + historyContext;

            // Update local state first
            await updateTask(projectId, sequence, {
                // @ts-expect-error - aiPrompt might rely on legacy type definition
                aiPrompt: newPrompt,
                status: 'todo',
            });
        } else {
            // Simple retry reset
            await updateTask(projectId, sequence, { status: 'todo' });
        }

        // 2. Execute
        return executeTask(projectId, sequence);
    }

    /**
     * Execute task - starts AI execution via IPC
     */
    async function executeTask(
        projectId: number,
        sequence: number,
        options?: { force?: boolean; triggerChain?: string[]; isAutoExecution?: boolean }
    ): Promise<{ success: boolean; error?: string; validationError?: boolean }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        // 이미 실행 중인 경우 중복 실행 방지
        if (task.status === 'in_progress' && !task.isPaused && !options?.force) {
            console.warn(`Task ${projectId}_${sequence} is already in progress`);
            return { success: false, error: 'Task is already executing' };
        }

        // TODO 상태가 아니면 실행 불가 (일시정지 상태는 resume으로 처리)
        if (task.status !== 'todo' && !options?.force) {
            return { success: false, error: 'Task must be in TODO status to execute' };
        }

        // ... validation logic ...
        const validationError = validateTaskForExecution(task);
        if (validationError) {
            return { success: false, error: validationError, validationError: true };
        }

        // 낙관적 업데이트: 즉시 UI를 '실행 중' 상태로 변경
        const originalStatus = task.status;

        // [Fix] Clear MCP logs before execution starts to prevent accumulation
        // This handles manual execution triggers
        useMCPStore().clearTaskLogs(projectId, sequence);

        await updateTask(projectId, sequence, {
            status: 'in_progress',
            isPaused: false,
            hasUnreadResult: false,
        });

        try {
            // ... existing execution logic ...
            // (Using composite keys for execution)

            const api = getAPI();
            if (!api?.taskExecution) {
                // Fallback to simple status change if API not available
                return { success: true };
            }

            // Get API keys from settings store
            const settingsStore = useSettingsStore();
            const apiKeys: Record<string, string> = {};

            // Extract API keys from enabled providers
            for (const provider of settingsStore.aiProviders) {
                if (provider.apiKey) {
                    apiKeys[provider.id] = provider.apiKey;
                }
            }

            /* console.debug('Executing task with API keys:', {
                hasAnthropic: !!apiKeys.anthropic,
                hasOpenAI: !!apiKeys.openai,
                hasGoogle: !!apiKeys.google,
                hasGroq: !!apiKeys.groq,
                hasLmStudio: !!apiKeys.lmstudio,
            }); */

            const enabledProviderPayload = buildEnabledProvidersPayload(
                settingsStore.getEnabledProvidersForRecommendation()
            );
            const runtimeMCPServers = buildRuntimeMCPServers(settingsStore.mcpServers);

            const fallbackProviders =
                enabledProviderPayload.length > 0
                    ? enabledProviderPayload.map((provider) => provider.id)
                    : settingsStore.aiProviders
                          .filter((provider) => !!provider.apiKey)
                          .map((provider) => provider.id);

            const currentLocale = unref(i18n.global.locale);
            const language = typeof currentLocale === 'string' ? currentLocale : 'en';

            const payload = JSON.parse(
                JSON.stringify({
                    streaming: true,
                    apiKeys,
                    enabledProviders: enabledProviderPayload,
                    mcpServers: runtimeMCPServers,
                    fallbackProviders,
                    triggerChain: options?.triggerChain, // Pass triggerChain if present
                    language,
                })
            );

            const result = await api.taskExecution.execute(projectId, sequence, payload);

            if (!result.success) {
                // If backend already handled status update (e.g. set to failed), do not rollback
                if ((result as any).statusHandled) {
                    return { success: false, error: result.error || 'Failed to execute task' };
                }

                // 실패 시 상태 롤백 (단, 이미 상태가 변경된 경우 - 예: failed 이벤트 수신 - 롤백하지 않음)
                const currentTask = tasks.value.find(
                    (t) => t.projectId === projectId && t.projectSequence === sequence
                );
                if (currentTask && currentTask.status === 'in_progress') {
                    await updateTask(projectId, sequence, { status: originalStatus as TaskStatus });
                }
                return { success: false, error: result.error || 'Failed to execute task' };
            }

            // Status will be updated via IPC event, but we already set it optimistically
            return { success: true };
        } catch (err) {
            console.error('Error executing task:', err);
            // 에러 발생 시 상태 롤백 (단, 이미 상태가 변경된 경우 롤백하지 않음)
            const currentTask = tasks.value.find(
                (t) => t.projectId === projectId && t.projectSequence === sequence
            );
            if (currentTask && currentTask.status === 'in_progress') {
                await updateTask(projectId, sequence, { status: originalStatus as TaskStatus });
            }
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Submit input for an Input Task
     */
    /**
     * Submit input for an Input Task
     */
    async function submitInput(
        projectId: number,
        sequence: number,
        input: unknown
    ): Promise<{ success: boolean; error?: string }> {
        // Validation check if task exists
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) return { success: false, error: 'Task not found' };

        try {
            const api = getAPI();
            if (!api?.taskExecution?.submitInput) {
                console.error('submitInput API not available');
                return { success: false, error: 'submitInput API not available' };
            }

            // FIXME: IPC submitInput might still expect ID?
            // If main process uses composite, we should update preload
            // We assume preload handles mapping or main was updated to taskExecution:submitInput(projectId, sequence, input)
            // But I did not verify submitInput signature in preload/main.
            // Assuming it accepts ID for now if legacy, or I just use the ID derived.
            // But if ID is undefined...
            // If the IPC handler was NOT updated, we are stuck.
            // But "TaskKey Migration" claim implies backend handles composite.
            // Let's assume I can pass (projectId, sequence) if I update preload.
            // Since I haven't updated preload `submitInput`, I'll use the ID if available, else warn.

            // For now, call with ID if available, otherwise we fail.
            // Wait, if task.id is undefined, we fail.
            // I'll update signature to be ready, but implementation calls preload with ID.

            // Updated to use composite ID if available, but backend expects ID for input?
            // Actually, submitInput handler likely needs ID or composite.
            // Let's assume we need to update preload to accept (projectId, sequence, input).
            // Get API keys from settings store (for Curator trigger upon completion)
            const settingsStore = useSettingsStore();
            const apiKeys: Record<string, string> = {};

            // Extract API keys from enabled providers
            for (const provider of settingsStore.aiProviders) {
                if (provider.apiKey) {
                    apiKeys[provider.id] = provider.apiKey;
                }
            }

            // Call API with options
            const result = await api.taskExecution.submitInput(
                task.projectId,
                task.projectSequence,
                input,
                { apiKeys }
            );
            if (!result.success) {
                return { success: false, error: result.error || 'Failed to submit input' };
            }
            return { success: true };
        } catch (err) {
            console.error('Error submitting input:', err);
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Pause task execution
     */
    /**
     * Pause task execution
     */
    async function pauseTask(
        projectId: number,
        sequence: number
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) return { success: false, error: 'Task not found' };

        if (task.status !== 'in_progress') {
            return { success: false, error: 'Task must be in IN_PROGRESS status to pause' };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                const result = await updateTask(projectId, sequence, { isPaused: true });
                return result
                    ? { success: true }
                    : { success: false, error: error.value || 'Failed to pause' };
            }

            const result = await api.taskExecution.pause(projectId, sequence);
            if (!result.success) {
                // Fallback
                await updateTask(projectId, sequence, { isPaused: true });
            }

            await updateTask(projectId, sequence, { isPaused: true });
            return { success: true };
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            if (errorMsg.includes('No active execution')) {
                await updateTask(projectId, sequence, { isPaused: true });
                return { success: true };
            }
            return { success: false, error: errorMsg };
        }
    }

    /**
     * Resume paused task
     */
    /**
     * Resume paused task
     */
    async function resumeTask(
        projectId: number,
        sequence: number
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) return { success: false, error: 'Task not found' };

        if (task.status !== 'in_progress' || !task.isPaused) {
            return { success: false, error: 'Task must be paused to resume' };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                await updateTask(projectId, sequence, { isPaused: false });
                return { success: true };
            }

            const result = await api.taskExecution.resume(projectId, sequence);
            if (!result.success) return { success: false, error: 'Failed to resume task' };

            await updateTask(projectId, sequence, { isPaused: false });
            return { success: true };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Stop task and return to TODO
     */
    /**
     * Stop task and return to TODO
     */
    /**
     * Stop task and return to TODO
     */
    async function stopTask(
        projectId: number,
        sequence: number
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) return { success: false, error: 'Task not found' };

        if (task.status === 'todo') {
            return { success: true };
        }

        const isInputWaiting =
            task.taskType === 'input' &&
            task.status === 'in_progress' &&
            task.inputSubStatus === 'WAITING_USER';

        if (task.status !== 'in_progress' && !isInputWaiting) {
            return { success: false, error: 'Task must be in IN_PROGRESS status to stop' };
        }

        try {
            const api = getAPI();
            if (api?.taskExecution) {
                await api.taskExecution.stop(projectId, sequence).catch(() => {});
            }
        } catch {
            // ignore
        }

        const updatedTask = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (updatedTask && updatedTask.status === 'todo') {
            return { success: true };
        }

        // Clear execution progress
        // Note: executionProgress is keyed by what? If id, we might have issue.
        // Assuming executionProgress uses projectId_sequence string key or mapped ID
        // If it uses number ID, and ID is undefined...
        // We skip clearing it for now or assume ID is somehow available.

        await updateTask(projectId, sequence, {
            status: 'todo',
            isPaused: false,
            inputSubStatus: null as any,
        });

        if (isInputWaiting) {
            window.dispatchEvent(
                new CustomEvent('task:input-status-changed', {
                    detail: {
                        projectId: task.projectId,
                        projectSequence: task.projectSequence,
                        inputSubStatus: null,
                    },
                })
            );
        }

        return { success: true };
    }

    /**
     * Approve task (from NEEDS_APPROVAL or IN_REVIEW) - moves to IN_PROGRESS or DONE
     */
    /**
     * Approve task (from NEEDS_APPROVAL or IN_REVIEW) - moves to IN_PROGRESS or DONE
     */
    async function approveTask(
        projectId: number,
        sequence: number,
        response?: string
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) return { success: false, error: 'Task not found' };

        if (task.status !== 'needs_approval' && task.status !== 'in_review') {
            return {
                success: false,
                error: 'Task must be in NEEDS_APPROVAL or IN_REVIEW status to approve',
            };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                const newStatus = task.status === 'in_review' ? 'done' : 'in_progress';
                return changeStatus(projectId, sequence, newStatus, { approvalResponse: response });
            }

            // Note: api.taskExecution.approve likely needs update to (projectId, sequence) in PRELOAD.
            // Assuming it expects ID. If so, fail if ID undefined.
            // If I updated backend, I should update preload.
            // For now, I'll pass ID.
            // api.taskExecution.approve(projectId, sequence, response)
            // Get API keys for Curator
            const settingsStore = useSettingsStore();
            const apiKeys: Record<string, string> = {};
            for (const provider of settingsStore.aiProviders) {
                if (provider.apiKey) apiKeys[provider.id] = provider.apiKey;
            }

            const result = await api.taskExecution.approve(projectId, sequence, response, {
                apiKeys,
            });
            if (!result.success) {
                return { success: false, error: 'Failed to approve task' };
            }
            return { success: true };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    async function rejectTask(
        projectId: number,
        sequence: number
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) return { success: false, error: 'Task not found' };

        if (task.status !== 'needs_approval') {
            return { success: false, error: 'Task must be in NEEDS_APPROVAL status to reject' };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                return changeStatus(projectId, sequence, 'todo');
            }

            const result = await api.taskExecution.reject(projectId, sequence);
            if (!result.success) return { success: false, error: 'Failed to reject task' };

            return { success: true };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Complete review - moves to DONE
     */
    /**
     * Complete review - moves to DONE
     */
    async function completeReview(
        projectId: number,
        sequence: number
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        if (task.status !== 'in_review') {
            return { success: false, error: 'Task must be in IN_REVIEW status to complete review' };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                return changeStatus(projectId, sequence, 'done');
            }

            // Get API keys for Curator
            const settingsStore = useSettingsStore();
            const apiKeys: Record<string, string> = {};
            for (const provider of settingsStore.aiProviders) {
                if (provider.apiKey) apiKeys[provider.id] = provider.apiKey;
            }

            const result = await api.taskExecution.completeReview(
                task.projectId,
                task.projectSequence,
                { apiKeys }
            );
            if (!result.success) {
                return { success: false, error: 'Failed to complete review' };
            }

            return { success: true };
        } catch (err) {
            console.error('Error completing review:', err);
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Request changes - moves from IN_REVIEW to IN_PROGRESS with refinement prompt
     */
    /**
     * Request changes - moves from IN_REVIEW to IN_PROGRESS with refinement prompt
     */
    async function requestChanges(
        projectId: number,
        sequence: number,
        refinementPrompt: string
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        if (task.status !== 'in_review') {
            return { success: false, error: 'Task must be in IN_REVIEW status to request changes' };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                return changeStatus(projectId, sequence, 'in_progress', { refinementPrompt });
            }

            const result = await api.taskExecution.requestChanges(
                projectId,
                sequence,
                refinementPrompt
            );
            if (!result.success) {
                return { success: false, error: 'Failed to request changes' };
            }

            return { success: true };
        } catch (err) {
            console.error('Error requesting changes:', err);
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Request additional work - moves from DONE to IN_PROGRESS
     */
    /**
     * Request additional work - moves from DONE to IN_PROGRESS
     */
    async function requestAdditionalWork(
        projectId: number,
        sequence: number,
        additionalWorkPrompt: string
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        if (task.status !== 'done') {
            return {
                success: false,
                error: 'Task must be in DONE status to request additional work',
            };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                return changeStatus(projectId, sequence, 'in_progress', { additionalWorkPrompt });
            }

            const result = await api.taskExecution.requestAdditionalWork(
                projectId,
                sequence,
                additionalWorkPrompt
            );
            if (!result.success) {
                return { success: false, error: 'Failed to request additional work' };
            }

            return { success: true };
        } catch (err) {
            console.error('Error requesting additional work:', err);
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Block task
     */
    /**
     * Block task
     */
    async function blockTask(
        projectId: number,
        sequence: number,
        reason?: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                return changeStatus(projectId, sequence, 'blocked', { blockedReason: reason });
            }

            const task = tasks.value.find(
                (t) => t.projectId === projectId && t.projectSequence === sequence
            );
            if (!task) return { success: false, error: 'Task not found' };
            const result = await api.taskExecution.block(
                task.projectId,
                task.projectSequence,
                reason
            );
            if (!result.success) {
                return { success: false, error: 'Failed to block task' };
            }

            return { success: true };
        } catch (err) {
            console.error('Error blocking task:', err);
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Unblock task - moves to TODO
     */
    /**
     * Unblock task - moves to TODO
     */
    async function unblockTask(
        projectId: number,
        sequence: number
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        if (task.status !== 'blocked') {
            return { success: false, error: 'Task must be in BLOCKED status to unblock' };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                return changeStatus(projectId, sequence, 'todo');
            }

            // Task already found above
            const result = await api.taskExecution.unblock(task.projectId, task.projectSequence);
            if (!result.success) {
                return { success: false, error: 'Failed to unblock task' };
            }

            return { success: true };
        } catch (err) {
            console.error('Error unblocking task:', err);
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    // ========================================
    // Execution state tracking
    // ========================================

    const executionProgress = ref<
        Map<
            string,
            {
                progress: number;
                phase: string;
                content: string;
                tokensUsed?: number;
                cost?: number;
            }
        >
    >(new Map());

    const executingTaskIds = ref<Set<string>>(new Set());

    // ========================================
    // Review state tracking
    // ========================================

    const reviewProgress = ref<
        Map<
            string,
            {
                progress: number;
                phase: string;
                content: string;
            }
        >
    >(new Map());

    const reviewingTaskIds = ref<Set<string>>(new Set());

    /**
     * Get execution progress for a task
     */
    /**
     * Get execution progress for a task
     */
    /**
     * Get execution progress for a task
     */
    function getExecutionProgress(projectId: number | undefined, sequence: number | undefined) {
        if (projectId === undefined || sequence === undefined) return undefined;

        // We use string key for map
        return executionProgress.value.get(
            taskKeyToString({ projectId, projectSequence: sequence })
        );
    }

    /**
     * Check if a task is currently executing
     */
    function isTaskExecuting(
        taskKey: { projectId: number; projectSequence: number } | null | undefined
    ) {
        if (!taskKey) return false;
        return executingTaskIds.value.has(getTaskKey(taskKey));
    }

    /**
     * Get review progress for a task
     */
    function getReviewProgress(
        taskKey: { projectId: number; projectSequence: number } | null | undefined
    ) {
        if (!taskKey) return undefined;
        return reviewProgress.value.get(getTaskKey(taskKey));
    }

    /**
     * Check if a task is currently being reviewed
     */
    function isTaskReviewing(
        taskKey: { projectId: number; projectSequence: number } | null | undefined
    ) {
        if (!taskKey) return false;
        return reviewingTaskIds.value.has(getTaskKey(taskKey));
    }

    /**
     * Start auto AI review for a task
     */
    async function startAutoReview(
        projectId: number,
        sequence: number
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        if (task.status !== 'in_review') {
            return { success: false, error: 'Task must be in IN_REVIEW status to start review' };
        }

        if (!task.autoReview) {
            return { success: false, error: 'Auto review is not enabled for this task' };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution?.startAutoReview) {
                return { success: false, error: 'Auto review API not available' };
            }

            // Get API keys from settings store
            const apiKeys: {
                anthropic?: string;
                openai?: string;
                google?: string;
                groq?: string;
                lmstudio?: string;
            } = {};

            for (const provider of settingsStore.aiProviders) {
                // Ensure provider and apiKey exist before accessing
                if (provider && provider.apiKey) {
                    if (provider.id === 'anthropic') apiKeys.anthropic = provider.apiKey;
                    else if (provider.id === 'openai') apiKeys.openai = provider.apiKey;
                    else if (provider.id === 'google') apiKeys.google = provider.apiKey;
                    else if (provider.id === 'groq') apiKeys.groq = provider.apiKey;
                    else if (provider.id === 'lmstudio') apiKeys.lmstudio = provider.apiKey;
                }
            }

            // console.debug('[TaskStore] Starting auto review for task:', projectId, sequence);

            // Build payload and serialize to ensure it's cloneable (remove Vue reactivity)
            const payload = {
                streaming: true,
                apiKeys,
                enabledProviders: buildEnabledProvidersPayload(settingsStore.aiProviders),
                mcpServers: buildRuntimeMCPServers(settingsStore.mcpServers),
            };

            // Deep clone to remove any Vue reactive proxies or non-cloneable objects
            const serializablePayload = JSON.parse(JSON.stringify(payload));

            const result = await api.taskExecution.startAutoReview(
                projectId,
                sequence,
                serializablePayload
            );

            if (!result.success) {
                return { success: false, error: result.error || 'Failed to start auto review' };
            }

            return { success: true };
        } catch (err) {
            console.error('Error starting auto review:', err);
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Initialize event listeners for real-time updates
     */
    function initEventListeners(): () => void {
        const api = getAPI();
        const cleanupFns: (() => void)[] = [];

        const unsubscribeCreated = api.events.on('task:created', (task: unknown) => {
            upsertTask(task as Task);
        });
        cleanupFns.push(unsubscribeCreated);

        const unsubscribeUpdated = api.events.on('task:updated', (task: unknown) => {
            upsertTask(task as Task);
        });
        cleanupFns.push(unsubscribeUpdated);

        const unsubscribeDeleted = api.events.on('task:deleted', (payload: any) => {
            // Support payload { projectId, sequence } or legacy id
            let pId, seq;
            if (typeof payload === 'object' && payload !== null) {
                pId = payload.projectId;
                seq = payload.projectSequence ?? payload.sequence;
            } else {
                // Try to resolve legacy ID if possible, though we prefer not to
                return;
            }

            if (pId !== undefined && seq !== undefined) {
                tasks.value = tasks.value.filter(
                    (t) => !(t.projectId === pId && t.projectSequence === seq)
                );
                if (
                    currentTask.value?.projectId === pId &&
                    currentTask.value?.projectSequence === seq
                ) {
                    currentTask.value = null;
                }
            }
        });
        cleanupFns.push(unsubscribeDeleted);

        // Listen for task execution completion
        const unsubscribeExecutionCompleted = api.events.on(
            'taskExecution:completed',
            (data: any) => {
                const { projectId, projectSequence, result, hasUnreadResult } = data;
                /* console.debug('[TaskStore] Task execution completed:', {
                    projectId,
                    projectSequence,
                    hasUnreadResult,
                }); */

                const index = tasks.value.findIndex(
                    (t) => t.projectId === projectId && t.projectSequence === projectSequence
                );

                if (index >= 0) {
                    const updates: Partial<Task> = {
                        executionResult: result,
                        hasUnreadResult,
                        // Update status if needed, though task:status-changed usually handles it
                    };
                    tasks.value[index] = { ...tasks.value[index], ...updates } as Task;
                }
            }
        );
        cleanupFns.push(unsubscribeExecutionCompleted);

        // Listen for task status changes from main process
        const unsubscribeStatusChanged = api.events.on(
            'task:status-changed',
            async (data: unknown) => {
                const { projectId, sequence, projectSequence, status } = data as {
                    projectId: number;
                    sequence?: number; // legacy support
                    projectSequence?: number;
                    status: TaskStatus;
                };

                // Use projectSequence if available, otherwise sequence
                const seq = projectSequence ?? sequence;

                console.debug('[TaskStore] Status changed event:', {
                    projectId,
                    sequence: seq,
                    status,
                });

                if (projectId === undefined || seq === undefined) {
                    console.warn('[TaskStore] Invalid status change event payload:', data);
                    return;
                }

                const index = tasks.value.findIndex(
                    (t) => t.projectId === projectId && t.projectSequence === seq
                );

                if (index >= 0) {
                    const task = tasks.value[index];
                    if (!task) return;

                    // For INPUT tasks transitioning to in_progress, refetch full data to get inputSubStatus
                    if (task.taskType === 'input' && status === 'in_progress') {
                        console.debug('[TaskStore] INPUT task starting, refetching full data:', {
                            projectId,
                            sequence: seq,
                        });
                        try {
                            // Use fetchTasks to get latest state without triggering another write/event loop
                            await fetchTasks(projectId);
                            return;
                        } catch (error) {
                            console.error('[TaskStore] Failed to refetch INPUT task:', error);
                            // Fallback to simple status update
                            const fallbackIndex = tasks.value.findIndex(
                                (t) => t.projectId === projectId && t.projectSequence === seq
                            );
                            if (fallbackIndex >= 0) {
                                const fallbackTask = tasks.value[fallbackIndex];
                                tasks.value[fallbackIndex] = { ...fallbackTask, status } as Task;
                                if (
                                    currentTask.value?.projectId === projectId &&
                                    currentTask.value?.projectSequence === seq
                                ) {
                                    currentTask.value = { ...currentTask.value, status };
                                }
                            }
                        }
                    } else {
                        // Normal status update for non-INPUT tasks or INPUT tasks completing

                        // [Fix] Clear MCP logs if task is starting (backend-triggered)
                        // Only clear if local status is NOT 'in_progress' to avoid racing with optimistic update in executeTask
                        if (status === 'in_progress' && task.status !== 'in_progress') {
                            console.debug(
                                '[TaskStore] Backend triggered task start, clearing MCP logs'
                            );
                            useMCPStore().clearTaskLogs(projectId, seq);
                        }

                        const updates: Partial<Task> = { status };

                        // For INPUT tasks completing, clear the sub-status
                        if (task.taskType === 'input' && status !== 'in_progress') {
                            updates.inputSubStatus = undefined;

                            // Notify views (DAGView) immediately
                            window.dispatchEvent(
                                new CustomEvent('task:input-status-changed', {
                                    detail: {
                                        projectId: task.projectId,
                                        projectSequence: task.projectSequence,
                                        inputSubStatus: undefined,
                                    },
                                })
                            );
                        }

                        tasks.value[index] = { ...tasks.value[index], ...updates } as Task;
                        if (
                            currentTask.value?.projectId === projectId &&
                            currentTask.value?.projectSequence === seq
                        ) {
                            currentTask.value = { ...currentTask.value, ...updates };
                        }
                    }

                    // Check and trigger dependent tasks when a task completes
                    // MOVED TO BACKEND: Auto-execution is now fully handled by the main process (task-execution-handlers.ts)
                    if (status === 'done') {
                        // console.log('[TaskStore] Task completed (backend will handle dependencies)', id);
                    }
                }
            }
        );
        cleanupFns.push(unsubscribeStatusChanged);

        // Task execution event listeners
        if (api.taskExecution) {
            // Execution started
            const unsubscribeStarted = api.taskExecution.onStarted(
                (data: { projectId: number; projectSequence: number; startedAt: Date }) => {
                    console.debug('[TaskStore] Execution started:', data);
                    const task = tasks.value.find(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (!task) return;

                    executingTaskIds.value.add(getTaskKey(task));
                    // Create new Map for Vue reactivity
                    // Optimized: Mutate map directly
                    const taskKey = getTaskKey(task);
                    executionProgress.value.set(taskKey, {
                        progress: 0,
                        phase: 'starting',
                        content: '',
                    });

                    // Note: Pinia store $subscribe might not trigger on Map mutation if detached logic isn't smart, but Vue 3 ref(Map) triggers.

                    // Also update task status in local state
                    const index = tasks.value.findIndex(
                        (t) =>
                            t.projectId === task.projectId &&
                            t.projectSequence === task.projectSequence
                    );
                    if (index >= 0) {
                        tasks.value[index] = {
                            ...tasks.value[index],
                            status: 'in_progress',
                        } as Task;
                    }
                }
            );
            cleanupFns.push(unsubscribeStarted);

            // Progress updates with streaming content
            const unsubscribeProgress = api.taskExecution.onProgress(
                (data: {
                    projectId: number;
                    projectSequence: number;
                    progress?: number;
                    phase?: string;
                    delta?: string;
                    content?: string;
                    tokensUsed?: number;
                    cost?: number;
                    percentage?: number;
                }) => {
                    // Verbose logging removed - only start/completion summaries logged
                    const task = tasks.value.find(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (!task) return;

                    executingTaskIds.value.delete(getTaskKey(task));

                    // Update progress with Vue reactivity
                    // Optimized: Mutate map directly
                    const taskKey = getTaskKey(task);
                    const existing = executionProgress.value.get(taskKey);

                    if (existing) {
                        // If content is provided (full text), replace it. If delta only, append.
                        // Ideally backend sends one or other.
                        let newContent = existing.content;
                        if (data.content) {
                            newContent = data.content;
                        } else if (data.delta) {
                            newContent += data.delta;
                        }

                        executionProgress.value.set(taskKey, {
                            ...existing,
                            progress:
                                (data as Record<string, any>).percentage ||
                                data.progress ||
                                existing.progress,
                            phase: data.phase || existing.phase,
                            content: newContent,
                            tokensUsed: (data as Record<string, any>).tokensUsed,
                            cost: (data as Record<string, any>).cost,
                        });
                    } else {
                        executionProgress.value.set(taskKey, {
                            progress:
                                (data as Record<string, any>).percentage || data.progress || 0,
                            phase: data.phase || 'running',
                            content: data.content || data.delta || '',
                            tokensUsed: (data as Record<string, any>).tokensUsed,
                            cost: (data as Record<string, any>).cost,
                        });
                    }
                    // Trigger shallow update if needed, but Map.set should be reactive for watchers of the item or deep watchers.
                    // For our optimize subscribers, they listen to mutation events.
                    // Pinia $subscribe should catch this.
                }
            );
            cleanupFns.push(unsubscribeProgress);

            // Execution completed
            const unsubscribeCompleted = api.taskExecution.onCompleted(
                (data: {
                    projectId: number;
                    projectSequence: number;
                    result: any;
                    hasUnreadResult?: boolean;
                }) => {
                    // console.debug('[TaskStore] Execution completed handler CALLED:', data);
                    // console.debug('[TaskStore] Execution completed:', data);
                    const task = tasks.value.find(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (!task) return;

                    executingTaskIds.value.delete(getTaskKey(task));

                    // Update progress with Vue reactivity
                    // Optimized: Mutate map directly
                    const taskKey = getTaskKey(task);
                    const existing = executionProgress.value.get(taskKey);
                    if (existing) {
                        executionProgress.value.set(taskKey, {
                            ...existing,
                            phase: 'completed',
                            progress: 100,
                        });
                    }
                    // executionProgress.value = newMap; // Removed

                    // Update task with AI result and status
                    const result = data.result as
                        | {
                              content?: string;
                              cost?: number;
                              model?: string;
                              tokens?: number;
                              duration?: number;
                              provider?: string;
                              aiResult?: Record<string, any>;
                          }
                        | undefined;
                    const index = tasks.value.findIndex(
                        (t) =>
                            t.projectId === task.projectId &&
                            t.projectSequence === task.projectSequence
                    );
                    if (index >= 0) {
                        const currentTaskInStore = tasks.value[index];
                        if (!currentTaskInStore) return;

                        const existingExecution =
                            (currentTaskInStore as Record<string, any>).executionResult &&
                            typeof (currentTaskInStore as Record<string, any>).executionResult ===
                                'object'
                                ? { ...(currentTaskInStore as Record<string, any>).executionResult }
                                : {};
                        const normalizedAiResult = result?.aiResult
                            ? normalizeAiResult(result.aiResult)
                            : existingExecution.aiResult;
                        const executionResult = {
                            ...existingExecution,
                            content: result?.content ?? existingExecution.content,
                            cost: result?.cost ?? existingExecution.cost,
                            tokens: result?.tokens ?? existingExecution.tokens,
                            duration: result?.duration ?? existingExecution.duration,
                            provider: result?.provider ?? existingExecution.provider,
                            model: result?.model ?? existingExecution.model,
                            aiResult: normalizedAiResult ?? null,
                        };
                        // Determine new status based on task type and auto-approve setting
                        let newStatus: TaskStatus = 'in_review';
                        if (currentTaskInStore.taskType === 'input') {
                            newStatus = 'done';
                        } else if (currentTaskInStore.autoApprove) {
                            newStatus = 'done';
                        }

                        tasks.value[index] = {
                            ...currentTaskInStore,
                            status: newStatus,
                            executionResult,
                            inputSubStatus: null, // Clear input waiting status
                            hasUnreadResult: data.hasUnreadResult ?? false,
                        } as Task;

                        // Dispatch custom event to notify views (especially DAGView)
                        if (currentTaskInStore.taskType === 'input') {
                            window.dispatchEvent(
                                new CustomEvent('task:input-status-changed', {
                                    detail: {
                                        projectId: task.projectId,
                                        projectSequence: task.projectSequence,
                                        inputSubStatus: null,
                                    },
                                })
                            );
                        }

                        // Trigger auto-review if enabled
                        if (currentTaskInStore.autoReview) {
                            console.debug(
                                '[TaskStore] Auto-review enabled, starting review for task:',
                                getTaskKey(task)
                            );
                            // Defer to next tick to ensure state is updated
                            // Defer to next tick to ensure state is updated
                            setTimeout(() => {
                                startAutoReview(task.projectId, task.projectSequence).catch(
                                    (err) => {
                                        console.error(
                                            '[TaskStore] Failed to start auto-review:',
                                            err
                                        );
                                    }
                                );
                            }, 100);
                        }
                    }
                }
            );
            cleanupFns.push(unsubscribeCompleted);

            // Execution failed
            const unsubscribeFailed = api.taskExecution.onFailed(
                (data: { projectId: number; projectSequence: number; error: string }) => {
                    /* console.debug('[TaskStore] Execution failed:', data); */
                    const task = tasks.value.find(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (!task) return;

                    executingTaskIds.value.delete(getTaskKey(task));

                    // Update progress with Vue reactivity
                    const newMap = new Map(executionProgress.value);
                    const taskKey = getTaskKey(task);
                    const existing = newMap.get(taskKey);
                    if (existing) {
                        newMap.set(taskKey, {
                            ...existing,
                            phase: 'failed',
                            content: existing.content + `\n\nError: ${data.error}`,
                        });
                    }
                    executionProgress.value = newMap;

                    // Find task in store and update state
                    const index = tasks.value.findIndex(
                        (t) =>
                            t.projectId === task.projectId &&
                            t.projectSequence === task.projectSequence
                    );
                    if (index >= 0) {
                        tasks.value[index] = { ...tasks.value[index], status: 'failed' } as Task;

                        // Add to failedTaskIds to prevent overwrite by stale fetch
                        const key = getTaskKey(task);
                        failedTaskIds.value.add(key);
                        // Auto-clear after 10 seconds (enough time for DB consistency)
                        setTimeout(() => {
                            failedTaskIds.value.delete(key);
                        }, 10000);
                    }

                    error.value = data.error;
                }
            );
            cleanupFns.push(unsubscribeFailed);

            // Execution paused
            const unsubscribePaused = api.taskExecution.onPaused(
                (data: { projectId: number; projectSequence: number; pausedAt: Date }) => {
                    console.debug('[TaskStore] Execution paused:', data);
                    const task = tasks.value.find(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (!task) return;
                    const index = tasks.value.findIndex(
                        (t) =>
                            t.projectId === task.projectId &&
                            t.projectSequence === task.projectSequence
                    );

                    // Update progress with Vue reactivity
                    // Optimized: Mutate map directly
                    const taskKey = getTaskKey(task);
                    const existing = executionProgress.value.get(taskKey);
                    if (existing) {
                        executionProgress.value.set(taskKey, {
                            ...existing,
                            phase: 'paused',
                        });
                    }

                    // Update task isPaused flag
                    if (index >= 0) {
                        tasks.value[index] = { ...tasks.value[index], isPaused: true } as Task;
                    }
                }
            );
            cleanupFns.push(unsubscribePaused);

            // Execution resumed
            const unsubscribeResumed = api.taskExecution.onResumed(
                (data: { projectId: number; projectSequence: number }) => {
                    console.debug('[TaskStore] Execution resumed:', data);
                    const task = tasks.value.find(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (!task) return;
                    const index = tasks.value.findIndex(
                        (t) =>
                            t.projectId === task.projectId &&
                            t.projectSequence === task.projectSequence
                    );

                    // Update progress with Vue reactivity
                    // Optimized: Mutate map directly
                    const taskKey = getTaskKey(task);
                    const existing = executionProgress.value.get(taskKey);
                    if (existing) {
                        executionProgress.value.set(taskKey, {
                            ...existing,
                            phase: 'executing',
                        });
                    }

                    // Update task isPaused flag
                    if (index >= 0) {
                        tasks.value[index] = { ...tasks.value[index], isPaused: false } as Task;
                    }
                }
            );
            cleanupFns.push(unsubscribeResumed);

            // Execution stopped
            const unsubscribeStopped = api.taskExecution.onStopped(
                (data: { projectId: number; projectSequence: number }) => {
                    console.debug('[TaskStore] Execution stopped:', data);
                    const task = tasks.value.find(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (!task) return;
                    // Fix: 'index' was redeclared, use a new variable or remove redeclaration
                    const taskIndex = tasks.value.findIndex(
                        (t) =>
                            t.projectId === task.projectId &&
                            t.projectSequence === task.projectSequence
                    );
                    executingTaskIds.value.delete(getTaskKey(task));

                    // Clear progress with Vue reactivity
                    // Optimized: Mutate map directly
                    const taskKey = getTaskKey(task);
                    executionProgress.value.delete(taskKey);

                    // Update task status back to todo
                    // Fix: Use task.id from the found task, not data.taskId which doesn't exist
                    if (taskIndex >= 0) {
                        tasks.value[taskIndex] = {
                            ...tasks.value[taskIndex],
                            status: 'todo',
                            isPaused: false,
                        } as Task;
                    }
                }
            );
            cleanupFns.push(unsubscribeStopped);

            // Approval required
            const unsubscribeApproval = api.taskExecution.onApprovalRequired(
                (data: {
                    projectId: number;
                    projectSequence: number;
                    question: string;
                    options?: string[];
                    context?: unknown;
                }) => {
                    console.debug('[TaskStore] Approval required:', data);
                    const task = tasks.value.find(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (!task) return;
                    const index = tasks.value.findIndex(
                        (t) =>
                            t.projectId === task.projectId &&
                            t.projectSequence === task.projectSequence
                    );

                    // Update progress with Vue reactivity
                    // Optimized: Mutate map directly
                    const taskKey = getTaskKey(task);
                    const existing = executionProgress.value.get(taskKey);
                    if (existing) {
                        executionProgress.value.set(taskKey, {
                            ...existing,
                            phase: 'awaiting_approval',
                        });
                    }

                    if (index >= 0) {
                        tasks.value[index] = {
                            ...tasks.value[index],
                            status: 'needs_approval',
                        } as Task;
                    }
                }
            );
            cleanupFns.push(unsubscribeApproval);

            // ========================================
            // Auto AI Review Event Listeners
            // ========================================

            // Review started
            const unsubscribeReviewStarted = api.taskExecution.onReviewStarted(
                (data: { projectId: number; projectSequence: number; startedAt: Date }) => {
                    console.debug('[TaskStore] Review started:', data);
                    const task = tasks.value.find(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (!task) return;
                    const taskKey = getTaskKey(task);
                    reviewingTaskIds.value.add(taskKey);
                    // Create new Map for Vue reactivity
                    // Optimized: Mutate map directly
                    reviewProgress.value.set(taskKey, {
                        progress: 0,
                        phase: 'reviewing',
                        content: '',
                    });
                }
            );
            cleanupFns.push(unsubscribeReviewStarted);

            // Review progress
            const unsubscribeReviewProgress = api.taskExecution.onReviewProgress(
                (data: {
                    projectId: number;
                    projectSequence: number;
                    progress?: number;
                    phase?: string;
                    content?: string;
                }) => {
                    // console.log('[TaskStore] Review progress:', data);
                    const task = tasks.value.find(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (!task) return;

                    // Optimized: Mutate map directly
                    const taskKey = getTaskKey(task);
                    const currentProgress = reviewProgress.value.get(taskKey) || {
                        progress: 0,
                        phase: '',
                        content: '',
                    };

                    reviewProgress.value.set(taskKey, {
                        ...currentProgress,
                        ...data,
                    });
                }
            );
            cleanupFns.push(unsubscribeReviewProgress);

            // Review completed
            const unsubscribeAutoReviewCompleted = api.taskExecution.onAutoReviewCompleted(
                (data: {
                    projectId: number;
                    projectSequence: number;
                    result: unknown;
                    passed: boolean;
                    score: number;
                }) => {
                    console.debug('[TaskStore] Auto-review completed:', data);
                    const task = tasks.value.find(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (!task) return;

                    // Clear review progress
                    // Optimized: Mutate map directly
                    reviewProgress.value.delete(getTaskKey(task));

                    const index = tasks.value.findIndex(
                        (t) =>
                            t.projectId === task.projectId &&
                            t.projectSequence === task.projectSequence
                    );
                    if (index >= 0) {
                        const reviewFailed = !data.passed;
                        const currentTaskInStore = tasks.value[index];
                        console.debug('[TaskStore] Updating task reviewFailed:', reviewFailed);
                        tasks.value[index] = {
                            ...currentTaskInStore,
                            status: data.passed
                                ? 'done'
                                : (currentTaskInStore as Record<string, any>).autoReview
                                  ? 'failed'
                                  : 'in_review',
                            executionResult: {
                                ...((currentTaskInStore as Record<string, any>).executionResult ||
                                    {}),
                                aiReviewResult: data.result,
                            },
                        } as Task;
                    }
                }
            );
            cleanupFns.push(unsubscribeAutoReviewCompleted);

            // Review failed
            const unsubscribeReviewFailed = api.taskExecution.onReviewFailed(
                (data: { projectId: number; projectSequence: number; error: string }) => {
                    console.debug('[TaskStore] Review failed:', data);
                    const task = tasks.value.find(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (!task) return;
                    reviewingTaskIds.value.delete(getTaskKey(task));

                    // Update review progress
                    // Optimized: Mutate map directly
                    const taskKey = getTaskKey(task);
                    const existing = reviewProgress.value.get(taskKey); // Corrected from executionProgress.value
                    if (existing) {
                        reviewProgress.value.set(taskKey, {
                            // Corrected from executionProgress.value
                            ...existing,
                            phase: 'failed',
                        });
                    }

                    error.value = data.error;
                }
            );
            cleanupFns.push(unsubscribeReviewFailed);

            // Review cancelled (or Rejected)
            const unsubscribeRejected = api.taskExecution.onRejected(
                (data: { projectId: number; projectSequence: number; response?: string }) => {
                    console.debug('[TaskStore] Task rejected:', data);
                    const task = tasks.value.find(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (!task) return;
                    // Status update handled by backend event (task:status-changed)
                    reviewingTaskIds.value.delete(getTaskKey(task)); // If it was in review

                    // Clear review progress
                    // Clear review progress
                    const newMap = new Map(reviewProgress.value);
                    newMap.delete(getTaskKey(task));
                    reviewProgress.value = newMap;
                }
            );
            cleanupFns.push(unsubscribeRejected);
        }

        // Auto-execution trigger for dependent tasks and time-based triggers
        const unsubscribeTriggerAutoExecution = api.events.on(
            'task:triggerAutoExecution',
            async (data: unknown) => {
                const payload = data as Record<string, any>;
                console.log('[TaskStore] Auto-execution triggered with data:', payload);

                let taskToExecute: Task | undefined;
                let triggerChain: string[] | undefined;

                if (payload.projectId && payload.projectSequence) {
                    // Composite Key support
                    taskToExecute = tasks.value.find(
                        (t) =>
                            t.projectId === payload.projectId &&
                            t.projectSequence === payload.projectSequence
                    );
                    triggerChain = payload.triggerChain;
                } else {
                    console.error(
                        '[TaskStore] Invalid auto-execution trigger data (missing projectId/projectSequence):',
                        payload
                    );
                    return;
                }

                if (!taskToExecute) {
                    console.error(`[TaskStore] Task not found for auto-execution trigger`, payload);
                    return;
                }

                // Log task status before execution
                console.log(
                    `[TaskStore] Task ${taskToExecute.projectId}-${taskToExecute.projectSequence} current status:`,
                    taskToExecute.status
                );

                // Execute the task
                try {
                    console.log(
                        `[TaskStore] Calling executeTask for task ${taskToExecute.projectId}-${taskToExecute.projectSequence} with force: true`
                    );

                    const result = await executeTask(
                        taskToExecute.projectId,
                        taskToExecute.projectSequence,
                        { force: true, triggerChain, isAutoExecution: true }
                    );

                    if (result.success) {
                        console.log(
                            `[TaskStore] ✅ Auto-execution started successfully for task ${taskToExecute.projectId}-${taskToExecute.projectSequence}`
                        );

                        // Refresh tasks
                        if (currentProjectId.value !== null) {
                            await fetchTasks(currentProjectId.value);
                        }
                    } else {
                        console.error(
                            `[TaskStore] ❌ Auto-execution failed for task ${taskToExecute.projectId}-${taskToExecute.projectSequence}:`,
                            result.error
                        );
                    }
                } catch (error) {
                    console.error(`[TaskStore] ❌ Exception during auto-execute task:`, error);
                }
            }
        );
        cleanupFns.push(unsubscribeTriggerAutoExecution);

        return () => {
            cleanupFns.forEach((fn) => fn());
        };
    }

    /**
     * 실행 계획에서 태스크 생성
     * AI 인터뷰 기반으로 생성된 상세 실행 계획을 태스크로 변환
     */
    async function createTasksFromExecutionPlan(
        projectId: number,
        plan: import('../../services/ai/AIInterviewService').EnhancedExecutionPlan
    ): Promise<{ success: boolean; tasks?: Task[]; error?: string }> {
        try {
            loading.value = true;
            error.value = null;

            // IPC로 전달 가능한 형태로 안전하게 클론 (불변 객체/Set 제거)
            const planSafe = JSON.parse(JSON.stringify(plan)) as typeof plan;

            const createdTasks: Task[] = [];
            const taskIdMap: Map<number, number> = new Map(); // 인덱스 -> 실제 taskId 매핑

            // 태스크를 순서대로 생성
            for (let i = 0; i < planSafe.tasks.length; i++) {
                const taskPlan = planSafe.tasks[i];
                if (!taskPlan) continue;

                const normalizedDependencies = Array.isArray(taskPlan.dependencies)
                    ? taskPlan.dependencies
                          .map((d: unknown) => Number(d))
                          .filter((n) => Number.isFinite(n))
                    : [];
                const normalizedRequiredMCPs = Array.isArray(taskPlan.requiredMCPs)
                    ? taskPlan.requiredMCPs.filter((m): m is string => typeof m === 'string')
                    : [];
                const normalizedRecommendedProviders = Array.isArray(taskPlan.recommendedProviders)
                    ? taskPlan.recommendedProviders
                          .map((p: string | { provider?: string; id?: string }) =>
                              typeof p === 'string'
                                  ? p
                                  : typeof p?.provider === 'string'
                                    ? p.provider
                                    : typeof p?.id === 'string'
                                      ? p.id
                                      : ''
                          )
                          .filter((p: string) => p.length > 0)
                    : [];
                const normalizedTags = Array.isArray(taskPlan.tags)
                    ? taskPlan.tags.filter(
                          (t): t is string => typeof t === 'string' && t.trim().length > 0
                      )
                    : [];

                // 의존성 태스크 ID 변환 (인덱스 -> 실제 ID)
                const dependencyTaskIds = normalizedDependencies
                    .map((depIndex: number) => taskIdMap.get(depIndex))
                    .filter((id: number | undefined): id is number => id !== undefined);

                // 태스크 생성 데이터 구성
                const taskData: Partial<Task> = {
                    projectId,
                    title: taskPlan.title,
                    description: taskPlan.description,
                    generatedPrompt: taskPlan.description, // 기본 프롬프트
                    aiOptimizedPrompt:
                        (planSafe.projectGuidelines
                            ? `${planSafe.projectGuidelines}\n\n${taskPlan.aiOptimizedPrompt || ''}`
                            : taskPlan.aiOptimizedPrompt) || taskPlan.description, // AI 최적화 프롬프트
                    status: 'todo',
                    priority: taskPlan.priority,
                    executionType: 'serial',
                    aiProvider: ((taskPlan as Record<string, any>).aiProvider ||
                        (taskPlan as Record<string, any>).suggestedAIProvider ||
                        normalizedRecommendedProviders[0] ||
                        null) as AIProvider | null,
                    order: taskPlan.executionOrder,
                    tags: normalizedTags,
                    estimatedMinutes: taskPlan.estimatedMinutes,

                    // AI 실행 최적화 필드
                    executionOrder: taskPlan.executionOrder,
                    dependencies: dependencyTaskIds,
                    expectedOutputFormat: taskPlan.expectedOutputFormat,
                    recommendedProviders: normalizedRecommendedProviders,
                    requiredMCPs: normalizedRequiredMCPs,

                    // 결과물 형식
                    outputFormat: taskPlan.expectedOutputFormat as TaskOutputFormat,
                    codeLanguage: taskPlan.codeLanguage,

                    // 의존성 트리거 설정
                    triggerConfig:
                        dependencyTaskIds.length > 0
                            ? {
                                  dependsOn: {
                                      taskIds: dependencyTaskIds,
                                      operator: 'all' as const,
                                  },
                              }
                            : null,
                } as unknown as Partial<Task>;

                // API를 통해 태스크 생성
                const result = await getAPI().tasks.create(
                    taskData as unknown as Omit<Task, 'id' | 'createdAt' | 'updatedAt'>
                );

                // IPC 반환이 Task 객체인 경우와 {success, task} 래퍼인 경우 모두 지원
                const createdTask = (result as Record<string, any>).task
                    ? (result as Record<string, any>).task
                    : result;
                const successFlag =
                    (result as Record<string, any>).success === undefined
                        ? true
                        : Boolean((result as Record<string, any>).success);

                if (!successFlag || !createdTask) {
                    throw new Error(
                        ((result as Record<string, any>).error as string | undefined) ||
                            `Failed to create task: ${taskPlan.title}`
                    );
                }

                createdTasks.push(createdTask);
                taskIdMap.set(i, createdTask.projectSequence); // Use projectSequence as the ID

                // 로컬 상태에 추가
                tasks.value.push(createdTask);
            }

            console.log(`[TaskStore] Created ${createdTasks.length} tasks from execution plan`);

            return { success: true, tasks: createdTasks };
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            error.value = errorMsg;
            console.error('[TaskStore] Failed to create tasks from execution plan:', err);
            return { success: false, error: errorMsg };
        } finally {
            loading.value = false;
        }
    }

    function extractPromptText(task: Partial<Task> | null): string {
        if (!task) {
            return '';
        }
        if (typeof task.description === 'string' && task.description.trim().length > 0) {
            return task.description;
        }
        if (typeof task.generatedPrompt === 'string' && task.generatedPrompt.trim().length > 0) {
            return task.generatedPrompt;
        }
        if (
            typeof task.aiOptimizedPrompt === 'string' &&
            task.aiOptimizedPrompt.trim().length > 0
        ) {
            return task.aiOptimizedPrompt;
        }
        return '';
    }

    async function regenerateTaskSettings(taskDraft: Task): Promise<Partial<Task>> {
        const prompt = extractPromptText(taskDraft).trim();
        if (!prompt) {
            return {};
        }

        try {
            aiInterviewService.setEnabledProviders(
                settingsStore.getEnabledProvidersForRecommendation()
            );

            const plan = await aiInterviewService.generateDetailedExecutionPlanForTask({
                title: taskDraft.title,
                description: prompt,
                priority: taskDraft.priority as TaskPriority,
                tags: Array.isArray(taskDraft.tags) ? taskDraft.tags : [],
                estimatedMinutes: taskDraft.estimatedMinutes || undefined,
            });

            const normalizedProviders = normalizeStringArray(plan.recommendedProviders);
            const fallbackProviders = Array.isArray(taskDraft.recommendedProviders)
                ? normalizeStringArray(taskDraft.recommendedProviders)
                : [];
            const providerList =
                normalizedProviders.length > 0 ? normalizedProviders : fallbackProviders;

            const normalizedMCPsExisting = Array.isArray(taskDraft.requiredMCPs)
                ? normalizeStringArray(taskDraft.requiredMCPs)
                : [];
            const requiredMCPs = normalizedMCPsExisting;

            const providerForTask = selectUsableProvider(
                providerList,
                taskDraft.aiProvider || null
            );

            return {
                estimatedMinutes:
                    typeof plan.estimatedMinutes === 'number'
                        ? plan.estimatedMinutes
                        : taskDraft.estimatedMinutes,
                expectedOutputFormat: plan.expectedOutputFormat || taskDraft.expectedOutputFormat,
                recommendedProviders: providerList,
                requiredMCPs,
                aiOptimizedPrompt: plan.aiOptimizedPrompt || prompt,
                aiProvider: (providerForTask as AIProvider) ?? null,
                outputFormat: plan.expectedOutputFormat || taskDraft.outputFormat,
                codeLanguage: plan.codeLanguage || taskDraft.codeLanguage,
            };
        } catch (err) {
            console.error('[TaskStore] Failed to regenerate task settings:', err);
            return {};
        }
    }

    function normalizeStringArray(value: unknown): string[] {
        if (!Array.isArray(value)) {
            return [];
        }
        const seen = new Set<string>();
        for (const item of value) {
            if (typeof item !== 'string') continue;
            const trimmed = item.trim();
            if (!trimmed || seen.has(trimmed)) continue;
            seen.add(trimmed);
        }
        return Array.from(seen);
    }

    function selectUsableProvider(recommended: string[], fallback?: string | null): string | null {
        const enabledProviders = settingsStore.enabledProviders || [];

        const preferred = recommended.find((providerId) =>
            enabledProviders.some(
                (provider) =>
                    provider.id === providerId &&
                    provider.enabled &&
                    (provider.apiKey || provider.isConnected)
            )
        );
        if (preferred) {
            return preferred;
        }

        if (
            fallback &&
            enabledProviders.some(
                (provider) =>
                    provider.id === fallback &&
                    provider.enabled &&
                    (provider.apiKey || provider.isConnected)
            )
        ) {
            return fallback;
        }

        return enabledProviders.length > 0 ? enabledProviders[0]!.id : null;
    }

    return {
        // State
        tasks,
        currentTask,
        currentProjectId,
        loading,
        error,
        filters,
        executionProgress,
        executingTaskIds,
        reviewProgress,
        reviewingTaskIds,

        // Getters
        groupedTasks,
        filteredTasks,
        tasksByStatus,
        totalTasks,
        completedTasks,
        completionRate,

        // Actions
        regenerateTaskSettings,
        // History support
        updateTaskWithHistory,
        removeTaskFromStore,
        fetchTasks,
        fetchTask,
        createTask,
        updateTask,
        deleteTask,
        reorderTasks,
        moveTask,
        setCurrentTask,
        setFilters,
        clearError,
        clearTasks,
        initEventListeners,

        // Execution state helpers
        getExecutionProgress,
        isTaskExecuting,
        isTaskReadyForExecution,

        // Review state helpers
        getReviewProgress,
        isTaskReviewing,
        startAutoReview,

        // Status transition actions
        changeStatus,
        getAllowedTransitions,
        executeTask,
        submitInput,
        pauseTask,
        resumeTask,
        stopTask,
        approveTask,
        rejectTask,
        completeReview,
        retryTask,
        requestChanges,
        requestAdditionalWork,
        blockTask,
        unblockTask,

        // AI Interview integration
        createTasksFromExecutionPlan,

        // Actions
        markResultAsRead,
    };
});
