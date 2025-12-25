/**
 * Task Store
 *
 * Pinia store for managing tasks state
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Task, TaskStatus } from '@core/types/database';
import { getAPI } from '../../utils/electron';
import type { ExecutionProgress } from '@core/types/electron.d';
import { TASK_STATUS_TRANSITIONS, isValidStatusTransition } from '@core/types/database';
import { useSettingsStore } from './settingsStore';
import { buildEnabledProvidersPayload, buildRuntimeMCPServers } from '../utils/runtimeConfig';
import { aiInterviewService } from '../../services/ai/AIInterviewService';
import { normalizeAiResult } from '../utils/aiResultHelpers';
import { useHistoryStore } from './historyStore';
import {
    CreateTaskCommand,
    UpdateTaskCommand,
    DeleteTaskCommand,
    MoveTaskCommand,
    ReorderTasksCommand,
    AssignOperatorCommand,
} from '../../core/commands/TaskCommands';

// Re-export Task, TaskStatus type for convenience
export type { Task, TaskStatus };

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

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
    in_review: Task[];
    done: Task[];
    blocked: Task[];
}

type TaskExecutionProgressPayload = {
    taskId: number;
    progress?: number;
} & Partial<ExecutionProgress>;

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
    const historyStore = useHistoryStore();

    function upsertTask(task: Task): void {
        if (!task) return;
        const sameProject =
            currentProjectId.value === null || task.projectId === currentProjectId.value;
        const index = tasks.value.findIndex((existing) => existing.id === task.id);
        if (index >= 0) {
            tasks.value[index] = { ...tasks.value[index], ...task };
        } else if (sameProject) {
            tasks.value.push(task);
        }

        if (currentTask.value?.id === task.id && currentTask.value) {
            currentTask.value = { ...currentTask.value, ...task };
        }
    }

    /**
     * Remove task from local state (used by delete command)
     */
    function removeTaskFromStore(taskId: number): void {
        const index = tasks.value.findIndex((t) => t.id === taskId);
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
            done: [],
            blocked: [],
        };

        for (const task of tasks.value) {
            const status = task.status as TaskStatus;
            if (grouped[status]) {
                grouped[status].push(task);
            }
        }

        // Sort each group by order
        for (const status of Object.keys(grouped) as TaskStatus[]) {
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

    const taskById = computed(() => (id: number) => tasks.value.find((t) => t.id === id));

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
            tasks.value = data;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to fetch tasks';
            console.error('Failed to fetch tasks:', e);
        } finally {
            loading.value = false;
        }
    }

    /**
     * Fetch a single task by ID
     */
    async function fetchTask(id: number): Promise<Task | null> {
        loading.value = true;
        error.value = null;

        try {
            const api = getAPI();
            const task = await api.tasks.get(id);
            if (task) {
                currentTask.value = task;
                // Update in list if exists
                const index = tasks.value.findIndex((t) => t.id === id);
                if (index >= 0) {
                    tasks.value[index] = task;
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
            // Auto-populate description with title if not provided
            const taskData = {
                ...data,
                description: data.description || data.title,
            };
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
    async function updateTask(id: number, data: Partial<Task>): Promise<Task | null> {
        const index = tasks.value.findIndex((t) => t.id === id);
        const originalTask = index >= 0 ? { ...tasks.value[index] } : null;

        const shouldReanalyzePrompt = shouldRegenerateTaskFromPrompt(
            originalTask,
            data as Partial<Task>
        );
        const userChangedProvider =
            originalTask !== null &&
            Object.prototype.hasOwnProperty.call(data, 'aiProvider') &&
            data.aiProvider !== undefined &&
            data.aiProvider !== originalTask.aiProvider;

        let mergedUpdate: Partial<Task> = { ...data };

        if (shouldReanalyzePrompt && originalTask) {
            const taskDraft: Task = {
                ...originalTask,
                ...(data as Partial<Task>),
            };

            const regenerated = await regenerateTaskSettings(taskDraft);
            if (regenerated && Object.keys(regenerated).length > 0) {
                // 사용자가 Provider를 직접 변경한 경우 추천값으로 덮어쓰지 않음
                if (userChangedProvider) {
                    delete regenerated.aiProvider;
                }
                mergedUpdate = {
                    ...mergedUpdate,
                    ...regenerated,
                };
            }
        }

        // Optimistic update
        if (index >= 0) {
            tasks.value[index] = { ...tasks.value[index], ...mergedUpdate } as Task;
        }

        try {
            const api = getAPI();
            // Remove fields that shouldn't be updated directly
            const {
                id: _id,
                createdAt: _createdAt,
                updatedAt: _updatedAt,
                projectId: _projectId,
                ...updateData
            } = mergedUpdate as Record<string, unknown>;

            // CRITICAL: Preserve notificationConfig from current task if not in update
            const currentTaskInStore = tasks.value[index];
            if (
                updateData.notificationConfig === undefined &&
                currentTaskInStore?.notificationConfig
            ) {
                updateData.notificationConfig = currentTaskInStore.notificationConfig;
                console.log(
                    '📝 Preserving notificationConfig:',
                    currentTaskInStore.notificationConfig
                );
            }

            // Convert to plain JSON object to avoid serialization issues with Date objects and Vue reactivity
            const plainData = JSON.parse(JSON.stringify(updateData));
            console.groupCollapsed('📝 TaskStore.updateTask trace');
            console.trace();
            console.groupEnd();
            console.log('📝 TaskStore.updateTask calling API:', id, plainData);
            const task = await api.tasks.update(id, plainData);
            console.log('📝 Task updated from API:', task);
            if (index >= 0) {
                tasks.value[index] = { ...tasks.value[index], ...task };
                console.log('📝 Task updated in store:', tasks.value[index]);

                // For INPUT tasks transitioning to in_progress, refetch after a delay to get inputSubStatus
                const originalTask = tasks.value[index];
                if (originalTask.taskType === 'input' && plainData.status === 'in_progress') {
                    console.log('📝 INPUT task starting, scheduling refetch for inputSubStatus');
                    setTimeout(async () => {
                        try {
                            const refreshedTask = await api.tasks.get(id);
                            if (refreshedTask) {
                                console.log(
                                    '📝 INPUT task refetched, inputSubStatus:',
                                    refreshedTask.inputSubStatus
                                );
                                // Force Vue reactivity by replacing entire array
                                tasks.value = tasks.value.map((t) =>
                                    t.id === id ? refreshedTask : t
                                );
                                if (currentTask.value?.id === id) {
                                    currentTask.value = refreshedTask;
                                }

                                // Dispatch custom event to notify views (especially DAGView)
                                window.dispatchEvent(
                                    new CustomEvent('task:input-status-changed', {
                                        detail: {
                                            taskId: id,
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
            if (currentTask.value?.id === id && currentTask.value) {
                currentTask.value = { ...currentTask.value, ...task };
            }
            return task as Task;
        } catch (e) {
            // Rollback on error
            if (originalTask && index >= 0) {
                tasks.value[index] = originalTask as Task;
            }
            error.value = e instanceof Error ? e.message : 'Failed to update task';
            console.error('Failed to update task:', e);
            return null;
        }
    }

    /**
     * Update task with history support (for user actions)
     * For simple field updates like operator assignment, status changes, etc.
     */
    async function updateTaskWithHistory(
        id: number,
        data: Partial<Task>,
        description?: string
    ): Promise<Task | null> {
        const previousTask = tasks.value.find((t) => t.id === id);
        if (!previousTask) {
            return updateTask(id, data); // Fallback to regular update
        }

        // Extract only the fields being changed for undo
        const previousData: Partial<Task> = {};
        for (const key of Object.keys(data)) {
            previousData[key] = (previousTask as any)[key];
        }

        const command = new UpdateTaskCommand(id, data, previousData, description);

        await historyStore.executeCommand(command);

        // Refresh tasks from store to ensure UI updates
        await fetchTasks(currentProjectId.value!);

        return tasks.value.find((t) => t.id === id) || null;
    }

    /**
     * Delete a task
     */
    async function deleteTask(id: number): Promise<boolean> {
        loading.value = true;
        error.value = null;

        try {
            const api = getAPI();
            await api.tasks.delete(id);
            tasks.value = tasks.value.filter((t) => t.id !== id);
            if (currentTask.value?.id === id) {
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
    async function reorderTasks(taskIds: number[]): Promise<void> {
        if (!currentProjectId.value) return;

        // Optimistic update
        const originalTasks = [...tasks.value];
        tasks.value = taskIds
            .map((id, index) => {
                const task = tasks.value.find((t) => t.id === id);
                return task ? { ...task, order: index } : null;
            })
            .filter((t): t is Task => t !== null);

        try {
            const api = getAPI();
            await api.tasks.reorder(currentProjectId.value, taskIds);
        } catch (e) {
            // Rollback on error
            tasks.value = originalTasks;
            error.value = e instanceof Error ? e.message : 'Failed to reorder tasks';
            console.error('Failed to reorder tasks:', e);
        }
    }

    /**
     * Move task to a different column (status)
     */
    async function moveTask(
        taskId: number,
        newStatus: TaskStatus,
        _newOrder: number
    ): Promise<void> {
        await updateTask(taskId, { status: newStatus });
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
        taskId: number,
        newStatus: TaskStatus,
        options?: {
            // For NEEDS_APPROVAL -> IN_PROGRESS (user approved)
            approvalResponse?: string;
            // For IN_REVIEW -> IN_PROGRESS (request changes with refinement prompt)
            refinementPrompt?: string;
            // For DONE -> IN_PROGRESS (request additional work)
            additionalWorkPrompt?: string;
            // For moving to BLOCKED
            blockedReason?: string;
        }
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find((t) => t.id === taskId);
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        const currentStatus = task.status as TaskStatus;

        // Validate the transition
        if (!isValidStatusTransition(currentStatus, newStatus)) {
            return {
                success: false,
                error: `Invalid transition from ${currentStatus} to ${newStatus}. Allowed: ${TASK_STATUS_TRANSITIONS[currentStatus].join(', ')}`,
            };
        }

        // Build update data based on the transition
        const updateData: Parameters<typeof updateTask>[1] = { status: newStatus };

        // Handle specific transitions
        switch (newStatus) {
            case 'in_progress':
                // Reset pause state when starting/resuming
                updateData.isPaused = false;
                break;

            case 'blocked':
                if (options?.blockedReason) {
                    // Note: blockedReason field may need to be added to updateTask params
                }
                // TODO: Cancel running AI work
                // TODO: Remove dependencies from other tasks
                break;

            case 'done':
                // Mark completion time if not already set
                break;

            case 'todo':
                // Reset any progress-related flags
                updateData.isPaused = false;
                break;
        }

        const result = await updateTask(taskId, updateData);
        if (!result) {
            return { success: false, error: error.value || 'Failed to update task' };
        }

        return { success: true };
    }

    /**
     * Get allowed status transitions for a task
     */
    function getAllowedTransitions(taskId: number): TaskStatus[] {
        const task = tasks.value.find((t) => t.id === taskId);
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
            return 'AI Provider가 설정되지 않았습니다. AI Provider를 선택해주세요.';
        }

        return null;
    }

    /**
     * Check if task is ready for execution (has prompt and AI provider)
     */
    function isTaskReadyForExecution(taskId: number): {
        ready: boolean;
        missingPrompt: boolean;
        missingProvider: boolean;
    } {
        const task = tasks.value.find((t) => t.id === taskId);
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
     * Execute task - starts AI execution via IPC
     */
    async function executeTask(
        taskId: number,
        options?: { force?: boolean }
    ): Promise<{ success: boolean; error?: string; validationError?: boolean }> {
        const task = tasks.value.find((t) => t.id === taskId);
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        // 이미 실행 중인 경우 중복 실행 방지
        if (task.status === 'in_progress' && !task.isPaused) {
            console.warn(`Task ${taskId} is already in progress`);
            return { success: false, error: 'Task is already executing' };
        }

        // TODO 상태가 아니면 실행 불가 (일시정지 상태는 resume으로 처리)
        if (task.status !== 'todo' && !options?.force) {
            return { success: false, error: 'Task must be in TODO status to execute' };
        }

        if (task.isSubdivided) {
            return { success: false, error: 'Cannot execute subdivided tasks directly' };
        }

        // Validate prompt and AI provider
        const validationError = validateTaskForExecution(task);
        if (validationError) {
            return { success: false, error: validationError, validationError: true };
        }

        // 낙관적 업데이트: 즉시 UI를 '실행 중' 상태로 변경
        const originalStatus = task.status;
        await updateTask(taskId, { status: 'in_progress', isPaused: false });

        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                // Fallback to simple status change if API not available
                return { success: true };
            }

            // Get API keys from settings store
            const settingsStore = useSettingsStore();
            const apiKeys: {
                anthropic?: string;
                openai?: string;
                google?: string;
                groq?: string;
                lmstudio?: string;
            } = {};

            // Extract API keys from enabled providers
            for (const provider of settingsStore.aiProviders) {
                if (provider.apiKey) {
                    if (provider.id === 'anthropic') {
                        apiKeys.anthropic = provider.apiKey;
                    } else if (provider.id === 'openai') {
                        apiKeys.openai = provider.apiKey;
                    } else if (provider.id === 'google') {
                        apiKeys.google = provider.apiKey;
                    } else if (provider.id === 'groq') {
                        apiKeys.groq = provider.apiKey;
                    } else if (provider.id === 'lmstudio') {
                        apiKeys.lmstudio = provider.apiKey;
                    }
                }
            }

            console.log('Executing task with API keys:', {
                hasAnthropic: !!apiKeys.anthropic,
                hasOpenAI: !!apiKeys.openai,
                hasGoogle: !!apiKeys.google,
                hasGroq: !!apiKeys.groq,
                hasLmStudio: !!apiKeys.lmstudio,
            });

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

            const payload = JSON.parse(
                JSON.stringify({
                    streaming: true,
                    apiKeys,
                    enabledProviders: enabledProviderPayload,
                    mcpServers: runtimeMCPServers,
                    fallbackProviders,
                })
            );

            const result = await api.taskExecution.execute(taskId, payload);

            if (!result.success) {
                // 실패 시 상태 롤백
                await updateTask(taskId, { status: originalStatus as TaskStatus });
                return { success: false, error: result.error || 'Failed to execute task' };
            }

            // Status will be updated via IPC event, but we already set it optimistically
            return { success: true };
        } catch (err) {
            console.error('Error executing task:', err);
            // 에러 발생 시 상태 롤백
            await updateTask(taskId, { status: originalStatus as TaskStatus });
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Submit input for an Input Task
     */
    async function submitInput(
        taskId: number,
        input: any
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find((t) => t.id === taskId);
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution?.submitInput) {
                console.error('submitInput API not available');
                return { success: false, error: 'submitInput API not available' };
            }

            const result = await api.taskExecution.submitInput(taskId, input);
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
    async function pauseTask(taskId: number): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find((t) => t.id === taskId);
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        if (task.status !== 'in_progress') {
            return { success: false, error: 'Task must be in IN_PROGRESS status to pause' };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                // Fallback to simple status update
                const result = await updateTask(taskId, { isPaused: true });
                return result
                    ? { success: true }
                    : { success: false, error: error.value || 'Failed to pause task' };
            }

            const result = await api.taskExecution.pause(taskId);
            if (!result.success) {
                // If no active execution, just update local state
                console.warn('No active execution found, updating local state only');
                const updateResult = await updateTask(taskId, { isPaused: true });
                return updateResult
                    ? { success: true }
                    : { success: false, error: 'Failed to pause task' };
            }

            // Also update local state
            await updateTask(taskId, { isPaused: true });
            return { success: true };
        } catch (err) {
            // If error is "No active execution", fallback to local state update
            const errorMsg = err instanceof Error ? err.message : String(err);
            if (errorMsg.includes('No active execution')) {
                console.warn('No active execution found, updating local state only');
                const updateResult = await updateTask(taskId, { isPaused: true });
                return updateResult
                    ? { success: true }
                    : { success: false, error: 'Failed to pause task' };
            }
            console.error('Error pausing task:', err);
            return { success: false, error: errorMsg };
        }
    }

    /**
     * Resume paused task
     */
    async function resumeTask(taskId: number): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find((t) => t.id === taskId);
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        if (task.status !== 'in_progress' || !task.isPaused) {
            return { success: false, error: 'Task must be paused to resume' };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                // Fallback to simple status update
                const result = await updateTask(taskId, { isPaused: false });
                return result
                    ? { success: true }
                    : { success: false, error: error.value || 'Failed to resume task' };
            }

            const result = await api.taskExecution.resume(taskId);
            if (!result.success) {
                return { success: false, error: 'Failed to resume task' };
            }

            // Also update local state
            await updateTask(taskId, { isPaused: false });
            return { success: true };
        } catch (err) {
            console.error('Error resuming task:', err);
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Check and auto-trigger dependent tasks when a task completes
     */
    async function checkAndTriggerDependentTasks(completedTaskId: number): Promise<void> {
        console.log('[TaskStore] Checking for tasks that depend on:', completedTaskId);

        // Find all tasks in the same project that have triggerConfig.dependsOn including this task
        const completedTask = tasks.value.find((t) => t.id === completedTaskId);
        if (!completedTask) return;

        const projectTasks = tasks.value.filter((t) => t.projectId === completedTask.projectId);

        for (const task of projectTasks) {
            const triggerConfig = task.triggerConfig;
            if (!triggerConfig?.dependsOn) continue;

            const { taskIds, operator, executionPolicy } = triggerConfig.dependsOn;
            if (!taskIds.includes(completedTaskId)) continue;

            console.log('[TaskStore] Found dependent task:', task.id, task.title);

            // Check execution policy
            const policy = executionPolicy || 'once';
            if (policy === 'once' && task.status !== 'todo') {
                console.log('[TaskStore] Skipping task (policy: once, status:', task.status, ')');
                continue;
            }

            // Check if dependencies are satisfied
            const allDone = taskIds.every((depId: number) => {
                const depTask = tasks.value.find((t) => t.id === depId);
                return depTask?.status === 'done';
            });

            const anyDone = taskIds.some((depId: number) => {
                const depTask = tasks.value.find((t) => t.id === depId);
                return depTask?.status === 'done';
            });

            const shouldTrigger = operator === 'all' ? allDone : anyDone;

            if (shouldTrigger) {
                console.log('[TaskStore] Auto-triggering task:', task.id, task.title);
                try {
                    // Execute the task
                    await executeTask(task.id);
                } catch (error) {
                    console.error('[TaskStore] Failed to auto-trigger task:', task.id, error);
                }
            } else {
                console.log('[TaskStore] Dependencies not yet satisfied for task:', task.id);
            }
        }
    }

    /**
     * Stop task and return to TODO
     */
    async function stopTask(taskId: number): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find((t) => t.id === taskId);
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        // If already in TODO, nothing to do
        if (task.status === 'todo') {
            console.log('[TaskStore] Task already in TODO status, skipping stop');
            return { success: true };
        }

        // Allow stopping INPUT tasks that are waiting for user input
        const isInputWaiting =
            task.taskType === 'input' &&
            task.status === 'in_progress' &&
            task.inputSubStatus === 'WAITING_USER';

        if (task.status !== 'in_progress' && !isInputWaiting) {
            return { success: false, error: 'Task must be in IN_PROGRESS status to stop' };
        }

        // Try to stop via IPC first (to cleanup active execution if any)
        try {
            const api = getAPI();
            if (api?.taskExecution) {
                await api.taskExecution.stop(taskId).catch(() => {
                    // Ignore IPC errors - execution might not exist
                });
            }
        } catch {
            // Ignore IPC errors
        }

        // Check if task status was already updated to 'todo' by event listeners
        const updatedTask = tasks.value.find((t) => t.id === taskId);
        if (updatedTask && updatedTask.status === 'todo') {
            return { success: true };
        }

        // Clear execution progress from local state
        executionProgress.value.delete(taskId);

        // Always change status to TODO directly
        const result = await changeStatus(taskId, 'todo');

        // Clear inputSubStatus for INPUT tasks
        if (isInputWaiting && result.success) {
            await updateTask(taskId, { inputSubStatus: null as any });
            // Notify views about INPUT task status change
            window.dispatchEvent(
                new CustomEvent('task:input-status-changed', {
                    detail: { taskId, inputSubStatus: null },
                })
            );
        }

        return result;
    }

    /**
     * Approve task (from NEEDS_APPROVAL or IN_REVIEW) - moves to IN_PROGRESS or DONE
     */
    async function approveTask(
        taskId: number,
        response?: string
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find((t) => t.id === taskId);
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        // Support both needs_approval (AI tasks) and in_review (Script tasks)
        if (task.status !== 'needs_approval' && task.status !== 'in_review') {
            return {
                success: false,
                error: 'Task must be in NEEDS_APPROVAL or IN_REVIEW status to approve',
            };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                // Fallback: Script tasks (in_review) go to done, AI tasks go back to in_progress
                const newStatus = task.status === 'in_review' ? 'done' : 'in_progress';
                return changeStatus(taskId, newStatus, { approvalResponse: response });
            }

            const result = await api.taskExecution.approve(taskId, response);
            if (!result.success) {
                return { success: false, error: 'Failed to approve task' };
            }

            // Status will be updated via IPC event
            return { success: true };
        } catch (err) {
            console.error('Error approving task:', err);
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Reject task (from NEEDS_APPROVAL) - moves to TODO
     */
    async function rejectTask(taskId: number): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find((t) => t.id === taskId);
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        if (task.status !== 'needs_approval') {
            return { success: false, error: 'Task must be in NEEDS_APPROVAL status to reject' };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                return changeStatus(taskId, 'todo');
            }

            const result = await api.taskExecution.reject(taskId);
            if (!result.success) {
                return { success: false, error: 'Failed to reject task' };
            }

            return { success: true };
        } catch (err) {
            console.error('Error rejecting task:', err);
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Complete review - moves to DONE
     */
    async function completeReview(taskId: number): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find((t) => t.id === taskId);
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        if (task.status !== 'in_review') {
            return { success: false, error: 'Task must be in IN_REVIEW status to complete review' };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                return changeStatus(taskId, 'done');
            }

            const result = await api.taskExecution.completeReview(taskId);
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
    async function requestChanges(
        taskId: number,
        refinementPrompt: string
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find((t) => t.id === taskId);
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        if (task.status !== 'in_review') {
            return { success: false, error: 'Task must be in IN_REVIEW status to request changes' };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                return changeStatus(taskId, 'in_progress', { refinementPrompt });
            }

            const result = await api.taskExecution.requestChanges(taskId, refinementPrompt);
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
    async function requestAdditionalWork(
        taskId: number,
        additionalWorkPrompt: string
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find((t) => t.id === taskId);
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
                return changeStatus(taskId, 'in_progress', { additionalWorkPrompt });
            }

            const result = await api.taskExecution.requestAdditionalWork(
                taskId,
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
    async function blockTask(
        taskId: number,
        reason?: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                return changeStatus(taskId, 'blocked', { blockedReason: reason });
            }

            const result = await api.taskExecution.block(taskId, reason);
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
    async function unblockTask(taskId: number): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find((t) => t.id === taskId);
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        if (task.status !== 'blocked') {
            return { success: false, error: 'Task must be in BLOCKED status to unblock' };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                return changeStatus(taskId, 'todo');
            }

            const result = await api.taskExecution.unblock(taskId);
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
            number,
            {
                progress: number;
                phase: string;
                content: string;
                tokensUsed?: number;
                cost?: number;
            }
        >
    >(new Map());

    const executingTaskIds = ref<Set<number>>(new Set());

    // ========================================
    // Review state tracking
    // ========================================

    const reviewProgress = ref<
        Map<
            number,
            {
                progress: number;
                phase: string;
                content: string;
            }
        >
    >(new Map());

    const reviewingTaskIds = ref<Set<number>>(new Set());

    /**
     * Get execution progress for a task
     */
    function getExecutionProgress(taskId: number) {
        return executionProgress.value.get(taskId);
    }

    /**
     * Check if a task is currently executing
     */
    function isTaskExecuting(taskId: number) {
        return executingTaskIds.value.has(taskId);
    }

    /**
     * Get review progress for a task
     */
    function getReviewProgress(taskId: number) {
        return reviewProgress.value.get(taskId);
    }

    /**
     * Check if a task is currently being reviewed
     */
    function isTaskReviewing(taskId: number) {
        return reviewingTaskIds.value.has(taskId);
    }

    /**
     * Start auto AI review for a task
     */
    async function startAutoReview(taskId: number): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find((t) => t.id === taskId);
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
                if (provider.apiKey) {
                    if (provider.id === 'anthropic') apiKeys.anthropic = provider.apiKey;
                    else if (provider.id === 'openai') apiKeys.openai = provider.apiKey;
                    else if (provider.id === 'google') apiKeys.google = provider.apiKey;
                    else if (provider.id === 'groq') apiKeys.groq = provider.apiKey;
                    else if (provider.id === 'lmstudio') apiKeys.lmstudio = provider.apiKey;
                }
            }

            console.log('[TaskStore] Starting auto review for task:', taskId);

            // Build payload and serialize to ensure it's cloneable (remove Vue reactivity)
            const payload = {
                streaming: true,
                apiKeys,
                enabledProviders: buildEnabledProvidersPayload(settingsStore.aiProviders),
                mcpServers: buildRuntimeMCPServers(settingsStore.mcpServers),
            };

            // Deep clone to remove any Vue reactive proxies or non-cloneable objects
            const serializablePayload = JSON.parse(JSON.stringify(payload));

            const result = await api.taskExecution.startAutoReview(taskId, serializablePayload);

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

        const unsubscribeDeleted = api.events.on('task:deleted', (id: unknown) => {
            const taskId = id as number;
            tasks.value = tasks.value.filter((t) => t.id !== taskId);
            if (currentTask.value?.id === taskId) {
                currentTask.value = null;
            }
        });
        cleanupFns.push(unsubscribeDeleted);

        // Listen for task status changes from main process
        const unsubscribeStatusChanged = api.events.on(
            'task:status-changed',
            async (data: unknown) => {
                const { id, status } = data as { id: number; status: TaskStatus };
                console.log('[TaskStore] Status changed event:', { id, status });
                const index = tasks.value.findIndex((t) => t.id === id);
                if (index >= 0) {
                    const task = tasks.value[index];

                    // For INPUT tasks transitioning to in_progress, refetch full data to get inputSubStatus
                    if (task.taskType === 'input' && status === 'in_progress') {
                        console.log('[TaskStore] INPUT task starting, refetching full data:', id);
                        try {
                            const updatedTask = await api.tasks.get(id);
                            if (updatedTask) {
                                tasks.value[index] = updatedTask;
                                if (currentTask.value?.id === id) {
                                    currentTask.value = updatedTask;
                                }
                            }
                        } catch (error) {
                            console.error('[TaskStore] Failed to refetch INPUT task:', error);
                            // Fallback to simple status update
                            tasks.value[index] = { ...tasks.value[index], status } as Task;
                            if (currentTask.value?.id === id) {
                                currentTask.value = { ...currentTask.value, status };
                            }
                        }
                    } else {
                        // Normal status update for non-INPUT tasks
                        tasks.value[index] = { ...tasks.value[index], status } as Task;
                        if (currentTask.value?.id === id) {
                            currentTask.value = { ...currentTask.value, status };
                        }
                    }

                    // Check and trigger dependent tasks when a task completes
                    // MOVED TO BACKEND: Auto-execution is now fully handled by the main process (task-execution-handlers.ts)
                    // to prevent duplicate executions, infinite loops, and to respect global pause state securely.
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
                (data: { taskId: number; startedAt: Date }) => {
                    console.log('[TaskStore] Execution started:', data);
                    executingTaskIds.value.add(data.taskId);
                    // Create new Map for Vue reactivity
                    const newMap = new Map(executionProgress.value);
                    newMap.set(data.taskId, {
                        progress: 0,
                        phase: 'starting',
                        content: '',
                    });
                    executionProgress.value = newMap;

                    // Also update task status in local state
                    const index = tasks.value.findIndex((t) => t.id === data.taskId);
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
                (data: TaskExecutionProgressPayload) => {
                    // Verbose logging removed - only start/completion summaries logged
                    const progressValue = data.progress ?? data.percentage ?? 0;
                    const existing = executionProgress.value.get(data.taskId) || {
                        progress: 0,
                        phase: 'executing',
                        content: '',
                    };
                    // Create new Map for Vue reactivity
                    const newMap = new Map(executionProgress.value);
                    const delta = data.delta ?? '';

                    // Fix: Prioritize delta for streaming, append to existing content
                    // If content is provided directly (non-streaming or snapshot), we might use it differently
                    // but per user request, we assume we should append chunks.
                    // If delta exists, append it. If not, check if content is string and seemingly a chunk.
                    // Ideally the backend ensures 'delta' is populated for streaming.

                    let newContent = existing.content;
                    if (delta) {
                        newContent += delta;
                    } else if (typeof data.content === 'string') {
                        // Fallback: if no delta but content is string, assume it's a chunk to append
                        // (unless we detect it's a full replacement, but strictly following user request to add)
                        newContent += data.content;
                    }

                    newMap.set(data.taskId, {
                        progress: progressValue,
                        phase: data.phase || existing.phase,
                        content: newContent,
                        tokensUsed: data.tokensUsed || existing.tokensUsed,
                        cost: data.cost || existing.cost,
                    });
                    executionProgress.value = newMap;
                }
            );
            cleanupFns.push(unsubscribeProgress);

            // Execution completed
            const unsubscribeCompleted = api.taskExecution.onCompleted(
                (data: { taskId: number; result: any }) => {
                    console.log('[TaskStore] Execution completed:', data);
                    executingTaskIds.value.delete(data.taskId);

                    // Update progress with Vue reactivity
                    const newMap = new Map(executionProgress.value);
                    const existing = newMap.get(data.taskId);
                    if (existing) {
                        newMap.set(data.taskId, {
                            ...existing,
                            percentage: 100,
                            phase: 'completed',
                        });
                    }
                    executionProgress.value = newMap;

                    // Update task with AI result and status
                    const result = data.result as
                        | {
                              content?: string;
                              cost?: number;
                              model?: string;
                              tokens?: number;
                              duration?: number;
                              provider?: string;
                              aiResult?: any;
                          }
                        | undefined;
                    const index = tasks.value.findIndex((t) => t.id === data.taskId);
                    if (index >= 0) {
                        const task = tasks.value[index];
                        const existingExecution =
                            (task as any).executionResult &&
                            typeof (task as any).executionResult === 'object'
                                ? { ...(task as any).executionResult }
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
                        if (task.taskType === 'input') {
                            newStatus = 'done';
                        } else if (task.autoApprove) {
                            newStatus = 'done';
                        }

                        tasks.value[index] = {
                            ...task,
                            status: newStatus,
                            executionResult,
                            inputSubStatus: null, // Clear input waiting status
                        } as Task;

                        // Dispatch custom event to notify views (especially DAGView)
                        if (task.taskType === 'input') {
                            window.dispatchEvent(
                                new CustomEvent('task:input-status-changed', {
                                    detail: {
                                        taskId: data.taskId,
                                        inputSubStatus: null,
                                    },
                                })
                            );
                        }

                        // Trigger auto-review if enabled
                        if (task.autoReview) {
                            console.log(
                                '[TaskStore] Auto-review enabled, starting review for task:',
                                data.taskId
                            );
                            // Defer to next tick to ensure state is updated
                            setTimeout(() => {
                                startAutoReview(data.taskId).catch((err) => {
                                    console.error('[TaskStore] Failed to start auto-review:', err);
                                });
                            }, 100);
                        }
                    }
                }
            );
            cleanupFns.push(unsubscribeCompleted);

            // Execution failed
            const unsubscribeFailed = api.taskExecution.onFailed(
                (data: { taskId: number; error: string }) => {
                    console.log('[TaskStore] Execution failed:', data);
                    executingTaskIds.value.delete(data.taskId);

                    // Update progress with Vue reactivity
                    const newMap = new Map(executionProgress.value);
                    const existing = newMap.get(data.taskId);
                    if (existing) {
                        newMap.set(data.taskId, {
                            ...existing,
                            phase: 'failed',
                        });
                    }
                    executionProgress.value = newMap;

                    // Update task status back to todo on failure
                    const index = tasks.value.findIndex((t) => t.id === data.taskId);
                    if (index >= 0) {
                        tasks.value[index] = { ...tasks.value[index], status: 'in_review' } as Task;
                    }

                    error.value = data.error;
                }
            );
            cleanupFns.push(unsubscribeFailed);

            // Execution paused
            const unsubscribePaused = api.taskExecution.onPaused((data: { taskId: number }) => {
                console.log('[TaskStore] Execution paused:', data);

                // Update progress with Vue reactivity
                const newMap = new Map(executionProgress.value);
                const existing = newMap.get(data.taskId);
                if (existing) {
                    newMap.set(data.taskId, {
                        ...existing,
                        phase: 'paused',
                    });
                }
                executionProgress.value = newMap;

                // Update task isPaused flag
                const index = tasks.value.findIndex((t) => t.id === data.taskId);
                if (index >= 0) {
                    tasks.value[index] = { ...tasks.value[index], isPaused: true } as Task;
                }
            });
            cleanupFns.push(unsubscribePaused);

            // Execution resumed
            const unsubscribeResumed = api.taskExecution.onResumed((data: { taskId: number }) => {
                console.log('[TaskStore] Execution resumed:', data);

                // Update progress with Vue reactivity
                const newMap = new Map(executionProgress.value);
                const existing = newMap.get(data.taskId);
                if (existing) {
                    newMap.set(data.taskId, {
                        ...existing,
                        phase: 'executing',
                    });
                }
                executionProgress.value = newMap;

                // Update task isPaused flag
                const index = tasks.value.findIndex((t) => t.id === data.taskId);
                if (index >= 0) {
                    tasks.value[index] = { ...tasks.value[index], isPaused: false } as Task;
                }
            });
            cleanupFns.push(unsubscribeResumed);

            // Execution stopped
            const unsubscribeStopped = api.taskExecution.onStopped((data: { taskId: number }) => {
                console.log('[TaskStore] Execution stopped:', data);
                executingTaskIds.value.delete(data.taskId);

                // Clear progress with Vue reactivity
                const newMap = new Map(executionProgress.value);
                newMap.delete(data.taskId);
                executionProgress.value = newMap;

                // Update task status back to todo
                const index = tasks.value.findIndex((t) => t.id === data.taskId);
                if (index >= 0) {
                    tasks.value[index] = {
                        ...tasks.value[index],
                        status: 'todo',
                        isPaused: false,
                    } as Task;
                }
            });
            cleanupFns.push(unsubscribeStopped);

            // Approval required
            const unsubscribeApproval = api.taskExecution.onApprovalRequired(
                (data: {
                    taskId: number;
                    question: string;
                    options?: string[];
                    context?: unknown;
                }) => {
                    console.log('[TaskStore] Approval required:', data);

                    // Update progress with Vue reactivity
                    const newMap = new Map(executionProgress.value);
                    const existing = newMap.get(data.taskId);
                    if (existing) {
                        newMap.set(data.taskId, {
                            ...existing,
                            phase: 'awaiting_approval',
                        });
                    }
                    executionProgress.value = newMap;

                    // Update task status to needs_approval
                    const index = tasks.value.findIndex((t) => t.id === data.taskId);
                    if (index >= 0) {
                        tasks.value[index] = {
                            ...tasks.value[index],
                            status: 'needs_approval',
                        };
                    }
                }
            );
            cleanupFns.push(unsubscribeApproval);

            // ========================================
            // Auto AI Review Event Listeners
            // ========================================

            // Review started
            const unsubscribeReviewStarted = api.taskExecution.onReviewStarted(
                (data: { taskId: number; startedAt: Date }) => {
                    console.log('[TaskStore] Review started:', data);
                    reviewingTaskIds.value.add(data.taskId);
                    // Create new Map for Vue reactivity
                    const newMap = new Map(reviewProgress.value);
                    newMap.set(data.taskId, {
                        progress: 0,
                        phase: 'reviewing',
                        content: '',
                    });
                    reviewProgress.value = newMap;
                }
            );
            cleanupFns.push(unsubscribeReviewStarted);

            // Review progress
            const unsubscribeReviewProgress = api.taskExecution.onReviewProgress(
                (data: { taskId: number; progress?: number; phase?: string; content?: string }) => {
                    console.log(
                        '[TaskStore] Review progress:',
                        data.taskId,
                        data.phase,
                        data.content?.slice(0, 20)
                    );
                    const existing = reviewProgress.value.get(data.taskId) || {
                        progress: 0,
                        phase: 'reviewing',
                        content: '',
                    };
                    // Create new Map for Vue reactivity
                    const newMap = new Map(reviewProgress.value);
                    newMap.set(data.taskId, {
                        progress: data.progress ?? existing.progress,
                        phase: data.phase || existing.phase,
                        content: existing.content + (data.content || ''),
                    });
                    reviewProgress.value = newMap;
                }
            );
            cleanupFns.push(unsubscribeReviewProgress);

            // Review completed
            const unsubscribeAutoReviewCompleted = api.taskExecution.onAutoReviewCompleted(
                (data: { taskId: number; result: unknown; passed: boolean; score: number }) => {
                    console.log(
                        '[TaskStore] Review completed:',
                        data,
                        'passed:',
                        data.passed,
                        'score:',
                        data.score
                    );
                    reviewingTaskIds.value.delete(data.taskId);

                    // Update review progress
                    const newMap = new Map(reviewProgress.value);
                    const existing = newMap.get(data.taskId);
                    if (existing) {
                        newMap.set(data.taskId, {
                            ...existing,
                            progress: 100,
                            phase: 'completed',
                        });
                    }
                    reviewProgress.value = newMap;

                    // Update task with review result and reviewFailed flag
                    const index = tasks.value.findIndex((t) => t.id === data.taskId);
                    if (index >= 0) {
                        const reviewFailed = !data.passed;
                        console.log('[TaskStore] Updating task reviewFailed:', reviewFailed);
                        tasks.value[index] = {
                            ...tasks.value[index],
                            aiReviewResult: JSON.stringify(data.result),
                            reviewFailed: reviewFailed,
                            // If passed, status changes to 'done', otherwise stays 'in_review'
                            status: data.passed ? 'done' : 'in_review',
                        };
                    }
                }
            );
            cleanupFns.push(unsubscribeAutoReviewCompleted);

            // Review failed
            const unsubscribeReviewFailed = api.taskExecution.onReviewFailed(
                (data: { taskId: number; error: string }) => {
                    console.log('[TaskStore] Review failed:', data);
                    reviewingTaskIds.value.delete(data.taskId);

                    // Update review progress
                    const newMap = new Map(reviewProgress.value);
                    const existing = newMap.get(data.taskId);
                    if (existing) {
                        newMap.set(data.taskId, {
                            ...existing,
                            phase: 'failed',
                        });
                    }
                    reviewProgress.value = newMap;

                    error.value = data.error;
                }
            );
            cleanupFns.push(unsubscribeReviewFailed);

            // Review cancelled
            const unsubscribeReviewCancelled = api.taskExecution.onReviewCancelled(
                (data: { taskId: number }) => {
                    console.log('[TaskStore] Review cancelled:', data);
                    reviewingTaskIds.value.delete(data.taskId);

                    // Clear review progress
                    const newMap = new Map(reviewProgress.value);
                    newMap.delete(data.taskId);
                    reviewProgress.value = newMap;
                }
            );
            cleanupFns.push(unsubscribeReviewCancelled);
        }

        // Auto-execution trigger for dependent tasks and time-based triggers
        const unsubscribeTriggerAutoExecution = api.events.on(
            'task:triggerAutoExecution',
            async (data: unknown) => {
                // Handle both number (time-based) and object (dependency-based) formats
                const taskId =
                    typeof data === 'number'
                        ? data
                        : (data as { taskId: number; triggeredBy: number }).taskId;
                const triggeredBy =
                    typeof data === 'number'
                        ? undefined
                        : (data as { taskId: number; triggeredBy?: number }).triggeredBy;

                console.log(
                    `[TaskStore] Auto-execution triggered for task ${taskId}`,
                    triggeredBy ? `(triggered by task ${triggeredBy})` : '(time-based trigger)'
                );

                // Find the task to execute
                const taskToExecute = tasks.value.find((t) => t.id === taskId);
                if (!taskToExecute) {
                    console.error(`[TaskStore] Task ${taskId} not found for auto-execution`);
                    return;
                }

                // Log task status before execution
                console.log(`[TaskStore] Task ${taskId} current status:`, taskToExecute.status);
                console.log(`[TaskStore] Task ${taskId} title:`, taskToExecute.title);

                // Execute the task
                try {
                    console.log(
                        `[TaskStore] Calling executeTask for task ${taskId} with force: true`
                    );
                    const result = await executeTask(taskId, { force: true });

                    if (result.success) {
                        console.log(
                            `[TaskStore] ✅ Auto-execution started successfully for task ${taskId}`
                        );

                        // Refresh tasks to sync UI with DB (especially for autoApprove: done status)
                        if (currentProjectId.value) {
                            console.log(`[TaskStore] Refreshing tasks after auto-execution`);
                            await fetchTasks(currentProjectId.value);
                        }
                    } else {
                        console.error(
                            `[TaskStore] ❌ Auto-execution failed for task ${taskId}:`,
                            result.error
                        );
                    }
                } catch (error) {
                    console.error(
                        `[TaskStore] ❌ Exception during auto-execute task ${taskId}:`,
                        error
                    );
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
                          .map((p: any) =>
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
                    aiProvider:
                        (taskPlan as any).aiProvider ||
                        (taskPlan as any).suggestedAIProvider ||
                        (normalizedRecommendedProviders[0] as any) ||
                        null,
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
                    outputFormat: taskPlan.expectedOutputFormat as any,
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
                };

                // API를 통해 태스크 생성
                const result = await getAPI().tasks.create(taskData);

                // IPC 반환이 Task 객체인 경우와 {success, task} 래퍼인 경우 모두 지원
                const createdTask = (result as any).task ? (result as any).task : result;
                const successFlag =
                    (result as any).success === undefined ? true : Boolean((result as any).success);

                if (!successFlag || !createdTask) {
                    throw new Error(
                        ((result as any).error as string | undefined) ||
                            `Failed to create task: ${taskPlan.title}`
                    );
                }

                createdTasks.push(createdTask);
                taskIdMap.set(i, createdTask.id);

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

    function shouldRegenerateTaskFromPrompt(
        originalTask: Task | null,
        updates: Partial<Task>
    ): boolean {
        if (!originalTask) {
            return false;
        }

        const descriptionChanged =
            typeof updates.description === 'string' &&
            updates.description.trim() !== (originalTask.description || '').trim();
        const generatedPromptChanged =
            typeof updates.generatedPrompt === 'string' &&
            updates.generatedPrompt.trim() !== (originalTask.generatedPrompt || '').trim();
        const optimizedPromptChanged =
            typeof updates.aiOptimizedPrompt === 'string' &&
            updates.aiOptimizedPrompt.trim() !== (originalTask.aiOptimizedPrompt || '').trim();

        if (!(descriptionChanged || generatedPromptChanged || optimizedPromptChanged)) {
            return false;
        }

        const nextPrompt = getUpdatedPromptValue(originalTask, updates).trim();
        return nextPrompt.length > 0;
    }

    function getUpdatedPromptValue(originalTask: Task, updates: Partial<Task>): string {
        if (typeof updates.description === 'string' && updates.description.trim().length > 0) {
            return updates.description;
        }
        if (
            typeof updates.generatedPrompt === 'string' &&
            updates.generatedPrompt.trim().length > 0
        ) {
            return updates.generatedPrompt;
        }
        if (
            typeof updates.aiOptimizedPrompt === 'string' &&
            updates.aiOptimizedPrompt.trim().length > 0
        ) {
            return updates.aiOptimizedPrompt;
        }
        return extractPromptText(originalTask);
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
                aiProvider: providerForTask ?? null,
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

        return enabledProviders.length > 0 ? enabledProviders[0].id : null;
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
        taskById,
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
        requestChanges,
        requestAdditionalWork,
        blockTask,
        unblockTask,

        // AI Interview integration
        createTasksFromExecutionPlan,
    };
});
