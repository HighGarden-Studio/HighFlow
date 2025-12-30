/**
 * Task Store
 *
 * Pinia store for managing tasks state
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Task, TaskStatus, TaskKey, AIProvider } from '@core/types/database';
import { getAPI } from '../../utils/electron';
import type { ExecutionProgress } from '@core/types/electron.d';
import { TASK_STATUS_TRANSITIONS, isValidStatusTransition } from '@core/types/database';
import { useSettingsStore } from './settingsStore';
import { useHistoryStore } from './historyStore';
import { buildEnabledProvidersPayload, buildRuntimeMCPServers } from '../utils/runtimeConfig';
import { aiInterviewService } from '../../services/ai/AIInterviewService';
// CreateTaskCommand 등은 아직 복합키 지원이 안되어 잠시 주석처리 하거나 제거
import { UpdateTaskCommand } from '../../core/commands/TaskCommands';

// Re-export Task, TaskStatus type for convenience
export type { Task, TaskStatus, TaskKey };

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
    needs_approval: Task[];
}

type TaskExecutionProgressPayload = {
    projectId: number;
    projectSequence: number;
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

    // Execution & Review State (Map key: composite "projectId-sequence")
    const executionProgress = ref<Map<string, ExecutionProgress>>(new Map());
    const reviewProgress = ref<Map<string, ExecutionProgress>>(new Map());
    const executingTaskIds = ref<Set<string>>(new Set());
    const reviewingTaskIds = ref<Set<string>>(new Set());

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
            tasks.value[index] = { ...tasks.value[index], ...task };
        } else if (sameProject) {
            tasks.value.push(task);
        }

        if (
            currentTask.value?.projectId === task.projectId &&
            currentTask.value?.projectSequence === task.projectSequence &&
            currentTask.value
        ) {
            currentTask.value = { ...currentTask.value, ...task };
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
            done: [],
            blocked: [],
            needs_approval: [],
        };

        for (const task of tasks.value) {
            const status = task.status; // TaskStatus 타입 단언 제거 또는 유지
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

    const taskById = computed(
        () => (projectId: number, sequence: number) =>
            tasks.value.find((t) => t.projectId === projectId && t.projectSequence === sequence)
    );
    // Helper for current project
    const taskBySequence = computed(
        () => (sequence: number) =>
            tasks.value.find(
                (t) => t.projectId === currentProjectId.value && t.projectSequence === sequence
            )
    );

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
    async function fetchTask(projectId: number, sequence: number): Promise<Task | null> {
        loading.value = true;
        error.value = null;

        try {
            const api = getAPI();
            const task = await api.tasks.getBySequence(projectId, sequence);
            if (task) {
                currentTask.value = task;
                // Update in list if exists
                const index = tasks.value.findIndex(
                    (t) => t.projectId === projectId && t.projectSequence === sequence
                );
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
            // Task의 projectId는 data.projectId로 덮어씌워지거나 보장됨
            // getBySequence가 없다는 에러가 있었으나, createTask에서는 getAPI().tasks.create 사용
            const api = getAPI();

            // Set default execution policies for AI, Script, and Output tasks
            const taskData: typeof data = {
                ...data,
                description: data.description || data.title,
            };

            // Apply defaults if not explicitly set
            const taskType = data.taskType || 'ai'; // 기본값은 'ai'
            if (taskType === 'ai' || taskType === 'script' || taskType === 'output') {
                // triggerConfig가 없거나 비어있으면 기본값 설정
                if (!taskData.triggerConfig) {
                    taskData.triggerConfig = {
                        type: 'dependency',
                        dependencyOperator: 'all', // 모든 태스크가 완료되어야 함
                        dependencyExecutionPolicy: 'repeat', // 매번 자동 실행 (권장)
                        dependencyTaskIds: [],
                    } as any;
                }
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
        data: Partial<Task>
    ): Promise<Task | null> {
        const index = tasks.value.findIndex(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        const originalTask = index >= 0 ? ({ ...tasks.value[index] } as Task) : null;

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
            console.log('📝 TaskStore.updateTask calling API:', projectId, sequence, plainData);
            const task = await api.tasks.update(projectId, sequence, plainData);
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
                            const refreshedTask = await api.tasks.getBySequence(
                                projectId,
                                sequence
                            );
                            if (refreshedTask) {
                                console.log(
                                    '📝 INPUT task refetched, inputSubStatus:',
                                    refreshedTask.inputSubStatus
                                );
                                // Force Vue reactivity by replacing entire array
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

                                // Dispatch custom event to notify views (especially DAGView)
                                window.dispatchEvent(
                                    new CustomEvent('task:input-status-changed', {
                                        detail: {
                                            projectId,
                                            projectSequence: sequence,
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
                currentTask.value?.projectId === projectId &&
                currentTask.value?.projectSequence === sequence &&
                currentTask.value
            ) {
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
        projectId: number,
        sequence: number,
        data: Partial<Task>,
        description?: string
    ): Promise<Task | null> {
        const previousTask = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!previousTask) {
            return updateTask(projectId, sequence, data); // Fallback to regular update
        }

        // Extract only the fields being changed for undo
        const previousData: Partial<Task> = {};
        for (const key of Object.keys(data)) {
            previousData[key] = (previousTask as any)[key];
        }

        // Commmand 생성 시 task id 대신 projectId, sequence 사용 필요
        // 하지만 Command 구조 자체가 id 기반일 수 있음. 확인 필요.
        // 일단은 놔두고, Command 클래스 수정은 별도 태스크로 잡거나 여기서 임시 해결.
        // UpdateTaskCommand가 (taskId, ...) 형태라면 (projectId, sequence, ...)로 바꿔야 함.
        // 여기서는 taskId 대신 임시로 taskId 처럼 쓰거나, Command 리팩토링이 선행되어야 함.
        // 마이그레이션 과도기이므로, command에 taskKey를 넘길 수 있도록 수정했다고 가정하거나
        // 일단 주석 처리하고 updateTask만 호출.

        // FIXME: History Command Refactoring required
        // const command = new UpdateTaskCommand(id, data, previousData, description);
        // await historyStore.executeCommand(command);

        // 직접 updateTask 호출로 대체 (History 일시 중단)
        await updateTask(projectId, sequence, data);

        // Refresh tasks from store to ensure UI updates
        await fetchTasks(currentProjectId.value!);

        return (
            tasks.value.find((t) => t.projectId === projectId && t.projectSequence === sequence) ||
            null
        );
    }

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
                currentTask.value?.projectId === projectId &&
                currentTask.value?.projectSequence === sequence
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
    /**
     * Reorder tasks (for drag-and-drop)
     * @param sequences Ordered list of projectSequences
     */
    async function reorderTasks(sequences: number[]): Promise<void> {
        if (!currentProjectId.value) return;

        // Optimistic update
        const originalTasks = [...tasks.value];

        // Create a map for O(1) lookup of current tasks by sequence
        const taskMap = new Map<number, Task>();
        tasks.value.forEach((t) => taskMap.set(t.projectSequence, t));

        // Reconstruct tasks array based on new sequence order
        // Note: This logic assumes we are reordering ALL tasks or a subset.
        // If sorting within a specific status, we need to be careful not to lose other tasks.
        // Usually, reorderTasks is called with IDs of tasks in a specific column or strict order.

        // Simplified optimistic update: Just update 'order' property locally if applicable
        // But since we rely on DB order, we might just fetch after reorder.
        // For now, let's skip complex optimistic update for reorder as it's tricky with sequence vs order index.

        try {
            const api = getAPI();
            await api.tasks.reorder(currentProjectId.value, sequences);
            // Fetch to get exact state
            await fetchTasks(currentProjectId.value);
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
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
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
        const updateData: Parameters<typeof updateTask>[2] = { status: newStatus };

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

        const result = await updateTask(projectId, sequence, updateData);
        if (!result) {
            return { success: false, error: error.value || 'Failed to update task' };
        }

        return { success: true };
    }

    function normalizeAiResult(result: any) {
        if (!result) return null;
        if (typeof result === 'string') {
            return {
                kind: 'text',
                subType: 'markdown',
                value: result,
            };
        }
        if (typeof result === 'object') {
            return {
                kind: result.kind || 'text',
                subType: result.subType || 'markdown',
                value: result.value || result.content || (result.toString ? result.toString() : ''),
            };
        }
        return null;
    }

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
            return 'AI Provider가 설정되지 않았습니다. AI Provider를 선택해주세요.';
        }

        return null;
    }

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
     * Execute task - starts AI execution via IPC
     */
    async function executeTask(
        projectId: number,
        sequence: number,
        options?: { force?: boolean }
    ): Promise<{ success: boolean; error?: string; validationError?: boolean }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        // 이미 실행 중인 경우 중복 실행 방지
        if (task.status === 'in_progress' && !task.isPaused) {
            console.warn(`Task ${projectId}-${sequence} is already in progress`);
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
        await updateTask(projectId, sequence, { status: 'in_progress', isPaused: false });

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

            const result = await api.taskExecution.execute(projectId, sequence, payload);

            if (!result.success) {
                // 실패 시 상태 롤백
                await updateTask(projectId, sequence, { status: originalStatus as TaskStatus });
                return { success: false, error: result.error || 'Failed to execute task' };
            }

            // Status will be updated via IPC event, but we already set it optimistically
            return { success: true };
        } catch (err) {
            console.error('Error executing task:', err);
            // 에러 발생 시 상태 롤백
            await updateTask(projectId, sequence, { status: originalStatus as TaskStatus });
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Submit input for an Input Task
     */
    async function submitInput(
        projectId: number,
        sequence: number,
        input: any
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution?.submitInput) {
                console.error('submitInput API not available');
                return { success: false, error: 'submitInput API not available' };
            }

            const result = await api.taskExecution.submitInput(projectId, sequence, input);
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
    async function pauseTask(
        projectId: number,
        sequence: number
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
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
                const result = await updateTask(projectId, sequence, { isPaused: true });
                return result
                    ? { success: true }
                    : { success: false, error: error.value || 'Failed to pause task' };
            }

            // Using composite key for pause
            const result = await api.taskExecution.pause(projectId, sequence);
            if (!result.success) {
                // If no active execution, just update local state
                console.warn('No active execution found, updating local state only');
                const updateResult = await updateTask(projectId, sequence, { isPaused: true });
                return updateResult
                    ? { success: true }
                    : { success: false, error: 'Failed to pause task' };
            }

            // Also update local state
            await updateTask(projectId, sequence, { isPaused: true });
            return { success: true };
        } catch (err) {
            // If error is "No active execution", fallback to local state update
            const errorMsg = err instanceof Error ? err.message : String(err);
            if (errorMsg.includes('No active execution')) {
                console.warn('No active execution found, updating local state only');
                const updateResult = await updateTask(projectId, sequence, { isPaused: true });
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
    async function resumeTask(
        projectId: number,
        sequence: number
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
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
                const result = await updateTask(projectId, sequence, { isPaused: false });
                return result
                    ? { success: true }
                    : { success: false, error: error.value || 'Failed to resume task' };
            }

            const result = await api.taskExecution.resume(projectId, sequence);
            if (!result.success) {
                return { success: false, error: 'Failed to resume task' };
            }

            // Also update local state
            await updateTask(projectId, sequence, { isPaused: false });
            return { success: true };
        } catch (err) {
            console.error('Error resuming task:', err);
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    }

    /**
     * Check and auto-trigger dependent tasks when a task completes
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
                // FIXME: API stop needs composite key
                await api.taskExecution.stop(projectId, sequence).catch(() => {
                    // Ignore IPC errors - execution might not exist
                });
            }
        } catch {
            // Ignore IPC errors
        }

        // Check if task status was already updated to 'todo' by event listeners
        const updatedTask = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (updatedTask && updatedTask.status === 'todo') {
            return { success: true };
        }

        // Clear execution progress from local state
        executionProgress.value.delete(`${projectId}-${sequence}`);

        // Always change status to TODO directly
        const result = await changeStatus(projectId, sequence, 'todo');

        // Clear inputSubStatus for INPUT tasks
        if (isInputWaiting && result.success) {
            await updateTask(projectId, sequence, { inputSubStatus: null as any });
            // Notify views about INPUT task status change
            window.dispatchEvent(
                new CustomEvent('task:input-status-changed', {
                    detail: { projectId, sequence, inputSubStatus: null },
                })
            );
        }

        return result;
    }

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
                return changeStatus(projectId, sequence, newStatus, { approvalResponse: response });
            }

            const result = await api.taskExecution.approve(projectId, sequence, response);
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
    async function rejectTask(
        projectId: number,
        sequence: number
    ): Promise<{ success: boolean; error?: string }> {
        const task = tasks.value.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        if (task.status !== 'needs_approval') {
            return { success: false, error: 'Task must be in NEEDS_APPROVAL status to reject' };
        }

        try {
            const api = getAPI();
            if (!api?.taskExecution) {
                return changeStatus(projectId, sequence, 'todo');
            }

            const result = await api.taskExecution.reject(projectId, sequence);
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

            const result = await api.taskExecution.completeReview(projectId, sequence);
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

            const result = await api.taskExecution.block(projectId, sequence, reason);
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

            const result = await api.taskExecution.unblock(projectId, sequence);
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

    // State moved to top

    /**
     * Get execution progress for a task
     */
    function getExecutionProgress(projectId: number, sequence: number) {
        return executionProgress.value.get(`${projectId}-${sequence}`);
    }

    /**
     * Check if a task is currently executing
     */
    function isTaskExecuting(projectId: number, sequence: number) {
        return executingTaskIds.value.has(`${projectId}-${sequence}`);
    }

    /**
     * Get review progress for a task
     */
    function getReviewProgress(projectId: number, sequence: number) {
        return reviewProgress.value.get(`${projectId}-${sequence}`);
    }

    /**
     * Check if a task is currently being reviewed
     */
    function isTaskReviewing(projectId: number, sequence: number) {
        return reviewingTaskIds.value.has(`${projectId}-${sequence}`);
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

            console.log('[TaskStore] Starting auto review for task:', projectId, sequence);

            // Build payload and serialize to ensure it's cloneable (remove Vue reactivity)
            const payload = {
                streaming: true,
                apiKeys: settingsStore.aiProviders.reduce(
                    (acc, p) => {
                        if (p.apiKey) acc[p.id] = p.apiKey;
                        return acc;
                    },
                    {} as Record<string, string>
                ),
                enabledProviders: buildEnabledProvidersPayload(settingsStore.aiProviders),
                mcpServers: buildRuntimeMCPServers(settingsStore.mcpServers),
            };

            // Deep clone to remove any Vue reactive proxies or non-cloneable objects
            const serializablePayload = JSON.parse(JSON.stringify(payload));

            // FIXME: API startAutoReview need composite key
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

        const unsubscribeDeleted = api.events.on('task:deleted', (key: unknown) => {
            const { projectId, projectSequence } = key as {
                projectId: number;
                projectSequence: number;
            };
            tasks.value = tasks.value.filter(
                (t) => !(t.projectId === projectId && t.projectSequence === projectSequence)
            );
            if (
                currentTask.value?.projectId === projectId &&
                currentTask.value?.projectSequence === projectSequence
            ) {
                currentTask.value = null;
            }
        });
        cleanupFns.push(unsubscribeDeleted);

        // Listen for task status changes from main process
        const unsubscribeStatusChanged = api.events.on(
            'task:status-changed',
            async (data: unknown) => {
                const { projectId, projectSequence, status } = data as {
                    projectId: number;
                    projectSequence: number;
                    status: TaskStatus;
                };
                console.log('[TaskStore] Status changed event:', {
                    projectId,
                    projectSequence,
                    status,
                });
                const index = tasks.value.findIndex(
                    (t) => t.projectId === projectId && t.projectSequence === projectSequence
                );
                if (index >= 0) {
                    const task = tasks.value[index];
                    if (!task) return;

                    // For INPUT tasks transitioning to in_progress, refetch full data to get inputSubStatus
                    if (task.taskType === 'input' && status === 'in_progress') {
                        console.log(
                            '[TaskStore] INPUT task starting, refetching full data:',
                            projectId,
                            projectSequence
                        );
                        try {
                            // FIXME: api.tasks.get should accept composite key
                            // Assuming api.tasks.get supports composite lookup via query or new method
                            // For now using fallback logic mostly.
                            // If api.tasks.get is not updated, this will fail.
                            // Let's assume we can fetch by projectId/sequence or update locally.
                            // We might need a `getBySequence` or similar.
                            // Using stub for compilation:
                            // const updatedTask = await api.tasks.getBySequence(projectId, projectSequence);

                            // Since we don't have getBySequence yet exposed, let's just update local state
                            tasks.value[index] = { ...tasks.value[index], status } as Task;
                            if (
                                currentTask.value?.projectId === projectId &&
                                currentTask.value?.projectSequence === projectSequence
                            ) {
                                currentTask.value = { ...currentTask.value, status };
                            }
                        } catch (error) {
                            console.error('[TaskStore] Failed to refetch INPUT task:', error);
                            // Fallback to simple status update
                            tasks.value[index] = { ...tasks.value[index], status } as Task;
                            if (
                                currentTask.value?.projectId === projectId &&
                                currentTask.value?.projectSequence === projectSequence
                            ) {
                                currentTask.value = { ...currentTask.value, status };
                            }
                        }
                    } else {
                        // Normal status update for non-INPUT tasks or INPUT tasks completing
                        const updates: Partial<Task> = { status };

                        // For INPUT tasks completing, clear the sub-status
                        if (task.taskType === 'input' && status !== 'in_progress') {
                            updates.inputSubStatus = undefined;

                            // Notify views (DAGView) immediately
                            window.dispatchEvent(
                                new CustomEvent('task:input-status-changed', {
                                    detail: {
                                        projectId,
                                        sequence: projectSequence,
                                        inputSubStatus: undefined,
                                    },
                                })
                            );
                        }

                        tasks.value[index] = { ...tasks.value[index], ...updates } as Task;
                        if (
                            currentTask.value?.projectId === projectId &&
                            currentTask.value?.projectSequence === projectSequence
                        ) {
                            currentTask.value = { ...currentTask.value, ...updates };
                        }
                    }

                    // Check and trigger dependent tasks when a task completes
                    // MOVED TO BACKEND
                }
            }
        );
        cleanupFns.push(unsubscribeStatusChanged);

        // Task execution event listeners
        if (api.taskExecution) {
            // Execution started
            const unsubscribeStarted = api.taskExecution.onStarted(
                (data: { projectId: number; projectSequence: number; startedAt: Date }) => {
                    console.log('[TaskStore] Execution started:', data);
                    const taskKey = `${data.projectId}-${data.projectSequence}`;
                    executingTaskIds.value.add(taskKey);
                    // Create new Map for Vue reactivity
                    const newMap = new Map(executionProgress.value);
                    newMap.set(taskKey, {
                        percentage: 0,
                        phase: 'starting',
                        content: '',
                    });
                    executionProgress.value = newMap;

                    // Also update task status in local state
                    const index = tasks.value.findIndex(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
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

            // Execution completed

            // Progress updates with streaming content
            const unsubscribeProgress = api.taskExecution.onProgress(
                (data: { projectId: number; projectSequence: number } & any) => {
                    // Verbose logging removed - only start/completion summaries logged
                    const progressValue = data.progress ?? data.percentage ?? 0;
                    const taskKey = `${data.projectId}-${data.projectSequence}`;
                    const existing = executionProgress.value.get(taskKey) || {
                        percentage: 0,
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

                    newMap.set(taskKey, {
                        percentage: progressValue,
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
                (data: { projectId: number; projectSequence: number; result: any }) => {
                    console.log('[TaskStore] Execution completed:', data);
                    const taskKey = `${data.projectId}-${data.projectSequence}`;
                    executingTaskIds.value.delete(taskKey);

                    // Update progress with Vue reactivity
                    const newMap = new Map(executionProgress.value);
                    const existing = newMap.get(taskKey);
                    if (existing) {
                        newMap.set(taskKey, {
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
                    const index = tasks.value.findIndex(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (index >= 0) {
                        const task = tasks.value[index];
                        if (!task) return;
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
                                        projectId: data.projectId,
                                        sequence: data.projectSequence,
                                        inputSubStatus: null,
                                    },
                                })
                            );
                        }

                        // Trigger auto-review if enabled
                        if (task.autoReview) {
                            console.log(
                                '[TaskStore] Auto-review enabled, starting review for task:',
                                data.projectId,
                                data.projectSequence
                            );
                            // Defer to next tick to ensure state is updated
                            setTimeout(() => {
                                startAutoReview(data.projectId, data.projectSequence).catch(
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
                    console.log('[TaskStore] Execution failed:', data);
                    const taskKey = `${data.projectId}-${data.projectSequence}`;
                    executingTaskIds.value.delete(taskKey);

                    // Update progress with Vue reactivity
                    const newMap = new Map(executionProgress.value);
                    const existing = newMap.get(taskKey);
                    if (existing) {
                        newMap.set(taskKey, {
                            ...existing,
                            phase: 'failed',
                        });
                    }
                    executionProgress.value = newMap;

                    // Update task status back to todo on failure
                    const index = tasks.value.findIndex(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (index >= 0) {
                        tasks.value[index] = { ...tasks.value[index], status: 'in_review' } as Task;
                    }

                    error.value = data.error;
                }
            );
            cleanupFns.push(unsubscribeFailed);

            // Execution paused
            const unsubscribePaused = api.taskExecution.onPaused(
                (data: { projectId: number; projectSequence: number }) => {
                    console.log('[TaskStore] Execution paused:', data);
                    const taskKey = `${data.projectId}-${data.projectSequence}`;

                    // Update progress with Vue reactivity
                    const newMap = new Map(executionProgress.value);
                    const existing = newMap.get(taskKey);
                    if (existing) {
                        newMap.set(taskKey, {
                            ...existing,
                            phase: 'paused',
                        });
                    }
                    executionProgress.value = newMap;

                    // Update task isPaused flag
                    const index = tasks.value.findIndex(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (index >= 0) {
                        tasks.value[index] = { ...tasks.value[index], isPaused: true } as Task;
                    }
                }
            );
            cleanupFns.push(unsubscribePaused);

            // Execution resumed
            const unsubscribeResumed = api.taskExecution.onResumed(
                (data: { projectId: number; projectSequence: number }) => {
                    console.log('[TaskStore] Execution resumed:', data);
                    const taskKey = `${data.projectId}-${data.projectSequence}`;

                    // Update progress with Vue reactivity
                    const newMap = new Map(executionProgress.value);
                    const existing = newMap.get(taskKey);
                    if (existing) {
                        newMap.set(taskKey, {
                            ...existing,
                            phase: 'executing',
                        });
                    }
                    executionProgress.value = newMap;

                    // Update task isPaused flag
                    const index = tasks.value.findIndex(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (index >= 0) {
                        tasks.value[index] = { ...tasks.value[index], isPaused: false } as Task;
                    }
                }
            );
            cleanupFns.push(unsubscribeResumed);

            // Execution stopped
            const unsubscribeStopped = api.taskExecution.onStopped(
                (data: { projectId: number; projectSequence: number }) => {
                    console.log('[TaskStore] Execution stopped:', data);
                    const taskKey = `${data.projectId}-${data.projectSequence}`;
                    executingTaskIds.value.delete(taskKey);

                    // Clear progress with Vue reactivity
                    const newMap = new Map(executionProgress.value);
                    newMap.delete(taskKey);
                    executionProgress.value = newMap;

                    // Update task status back to todo
                    const index = tasks.value.findIndex(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (index >= 0) {
                        tasks.value[index] = {
                            ...tasks.value[index],
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
                    console.log('[TaskStore] Approval required:', data);
                    const taskKey = `${data.projectId}-${data.projectSequence}`;

                    // Update progress with Vue reactivity
                    const newMap = new Map(executionProgress.value);
                    const existing = newMap.get(taskKey);
                    if (existing) {
                        newMap.set(taskKey, {
                            ...existing,
                            phase: 'awaiting_approval',
                        });
                    }
                    executionProgress.value = newMap;

                    // Update task status to needs_approval
                    const index = tasks.value.findIndex(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
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
                    console.log('[TaskStore] Review started:', data);
                    const taskKey = `${data.projectId}-${data.projectSequence}`;
                    reviewingTaskIds.value.add(taskKey);
                    // Create new Map for Vue reactivity
                    const newMap = new Map(reviewProgress.value);
                    newMap.set(taskKey, {
                        percentage: 0,
                        phase: 'reviewing',
                        content: '',
                    });
                    reviewProgress.value = newMap;
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
                    console.log(
                        '[TaskStore] Review progress:',
                        data.projectId,
                        data.projectSequence,
                        data.phase,
                        data.content?.slice(0, 20)
                    );
                    const taskKey = `${data.projectId}-${data.projectSequence}`;
                    const existing = reviewProgress.value.get(taskKey) || {
                        percentage: 0,
                        phase: 'reviewing',
                        content: '',
                    };
                    // Create new Map for Vue reactivity
                    const newMap = new Map(reviewProgress.value);
                    newMap.set(taskKey, {
                        percentage: data.progress ?? existing.percentage,
                        phase: data.phase || existing.phase,
                        content: existing.content + (data.content || ''),
                    });
                    reviewProgress.value = newMap;
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
                    console.log(
                        '[TaskStore] Review completed:',
                        data,
                        'passed:',
                        data.passed,
                        'score:',
                        data.score
                    );
                    const taskKey = `${data.projectId}-${data.projectSequence}`;
                    reviewingTaskIds.value.delete(taskKey);

                    // Update review progress
                    const newMap = new Map(reviewProgress.value);
                    const existing = newMap.get(taskKey);
                    if (existing) {
                        newMap.set(taskKey, {
                            ...existing,
                            percentage: 100,
                            phase: 'completed',
                        });
                    }
                    reviewProgress.value = newMap;

                    // Update task with review result and reviewFailed flag
                    const index = tasks.value.findIndex(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );
                    if (index >= 0) {
                        const task = tasks.value[index];
                        if (!task) return;
                        const reviewFailed = !data.passed;
                        console.log('[TaskStore] Updating task reviewFailed:', reviewFailed);
                        tasks.value[index] = {
                            ...task,
                            // Store review result in executionResult
                            executionResult: {
                                ...(task.executionResult || {}),
                                aiResult: normalizeAiResult(data.result),
                            },
                            reviewFailed: reviewFailed,
                            // If passed, status changes to 'done', otherwise stays 'in_review'
                            status: data.passed ? 'done' : 'in_review',
                        } as Task;
                    }
                }
            );
            cleanupFns.push(unsubscribeAutoReviewCompleted);

            // Review failed
            const unsubscribeReviewFailed = api.taskExecution.onReviewFailed(
                (data: { projectId: number; projectSequence: number; error: string }) => {
                    console.log('[TaskStore] Review failed:', data);
                    const taskKey = `${data.projectId}-${data.projectSequence}`;
                    reviewingTaskIds.value.delete(taskKey);

                    // Update review progress
                    const newMap = new Map(reviewProgress.value);
                    const existing = newMap.get(taskKey);
                    if (existing) {
                        newMap.set(taskKey, {
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
                (data: { projectId: number; projectSequence: number }) => {
                    console.log('[TaskStore] Review cancelled:', data);
                    const taskKey = `${data.projectId}-${data.projectSequence}`;
                    reviewingTaskIds.value.delete(taskKey);

                    // Clear review progress
                    const newMap = new Map(reviewProgress.value);
                    newMap.delete(taskKey);
                    reviewProgress.value = newMap;
                }
            );
            cleanupFns.push(unsubscribeReviewCancelled);
        }

        // Auto-execution trigger for dependent tasks and time-based triggers
        const unsubscribeTriggerAutoExecution = api.events.on(
            'task:triggerAutoExecution',
            async (data: unknown) => {
                // Data should be { projectId: number; projectSequence: number; triggeredBy?: number }
                // We don't support single number (global ID) anymore.
                const projectId = (data as any).projectId;
                const projectSequence = (data as any).projectSequence;
                const triggeredBy = (data as any).triggeredBy;

                console.log(
                    `[TaskStore] Auto-execution triggered for task ${projectId}-${projectSequence}`,
                    triggeredBy ? `(triggered by task ${triggeredBy})` : '(time-based trigger)'
                );

                // Find the task to execute
                const taskToExecute = tasks.value.find(
                    (t) => t.projectId === projectId && t.projectSequence === projectSequence
                );
                if (!taskToExecute) {
                    console.error(
                        `[TaskStore] Task ${projectId}-${projectSequence} not found for auto-execution`
                    );
                    return;
                }

                // Log task status before execution
                console.log(
                    `[TaskStore] Task ${projectId}-${projectSequence} current status:`,
                    taskToExecute.status
                );
                console.log(
                    `[TaskStore] Task ${projectId}-${projectSequence} title:`,
                    taskToExecute.title
                );

                // Execute the task
                try {
                    console.log(
                        `[TaskStore] Calling executeTask for task ${projectId}-${projectSequence} with force: true`
                    );
                    const result = await executeTask(projectId, projectSequence, { force: true });

                    if (result.success) {
                        console.log(
                            `[TaskStore] ✅ Auto-execution started successfully for task ${projectId}-${projectSequence}`
                        );

                        // Refresh tasks to sync UI with DB (especially for autoApprove: done status)
                        if (currentProjectId.value) {
                            console.log(`[TaskStore] Refreshing tasks after auto-execution`);
                            await fetchTasks(currentProjectId.value);
                        }
                    } else {
                        console.error(
                            `[TaskStore] ❌ Auto-execution failed for task ${projectId}-${projectSequence}:`,
                            result.error
                        );
                    }
                } catch (error) {
                    console.error(
                        `[TaskStore] ❌ Exception during auto-execute task ${projectId}-${projectSequence}:`,
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
            const taskKeyMap: Map<number, TaskKey> = new Map(); // 인덱스 -> 실제 taskKey 매핑

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

                // 의존성 태스크 Key 매핑 (인덱스 -> 실제 Key)
                const dependencyTaskKeys = normalizedDependencies
                    .map((depIndex: number) => taskKeyMap.get(depIndex))
                    .filter((key): key is TaskKey => key !== undefined);

                const dependencyProjectSequences = dependencyTaskKeys.map((k) => k.projectSequence);

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
                    dependencies: dependencyProjectSequences,
                    expectedOutputFormat: taskPlan.expectedOutputFormat,
                    recommendedProviders: normalizedRecommendedProviders,
                    requiredMCPs: normalizedRequiredMCPs,

                    // 결과물 형식
                    outputFormat: taskPlan.expectedOutputFormat as any,
                    codeLanguage: taskPlan.codeLanguage,

                    // 의존성 트리거 설정
                    triggerConfig:
                        dependencyTaskKeys.length > 0
                            ? {
                                  dependsOn: {
                                      taskKeys: dependencyTaskKeys,
                                      operator: 'all' as const,
                                  },
                              }
                            : null,
                };

                // API를 통해 태스크 생성
                const result = await getAPI().tasks.create(taskData as any);

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
                // createdTask must have projectSequence
                if (createdTask.projectSequence) {
                    taskKeyMap.set(i, {
                        projectId: createdTask.projectId,
                        projectSequence: createdTask.projectSequence,
                    });
                }

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
