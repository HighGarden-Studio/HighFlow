<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useDragDrop } from '../../composables/useDragDrop';
import { useRealtime } from '../../composables/useRealtime';
import type { Task } from '@core/types/database';
import KanbanColumn from './KanbanColumn.vue';

interface Project {
    id: number;
    name: string;
    color: string;
    tasks: Task[];
}

interface Props {
    projects: Project[];
    showCollaboration?: boolean;
    groupBy?: 'status' | 'priority' | 'assignee';
    filterBy?: {
        priority?: string[];
        assignee?: number[];
        tags?: string[];
    };
}

const props = withDefaults(defineProps<Props>(), {
    showCollaboration: true,
    groupBy: 'status',
});

const emit = defineEmits<{
    (e: 'taskClick', task: Task): void;
    (e: 'taskUpdate', task: Task): void;
    (e: 'addTask', projectId: number, status: string): void;
    (e: 'taskExecute', task: Task): void;
    (e: 'taskEnhancePrompt', task: Task): void;
    (e: 'taskPreviewPrompt', task: Task): void;
    (e: 'taskPreviewResult', task: Task): void;
    (e: 'taskRetry', task: Task): void;
    (e: 'taskViewHistory', task: Task): void;
    (e: 'taskViewProgress', task: Task): void;
    (e: 'taskViewStepHistory', task: Task): void;
    (e: 'taskPause', task: Task): void;
    (e: 'taskResume', task: Task): void;
    (e: 'taskStop', task: Task): void;
    (e: 'taskSubdivide', task: Task): void;
}>();

// Column definitions
const columns = [
    { id: 'todo', title: 'To Do', color: 'gray' },
    { id: 'in_progress', title: 'In Progress', color: 'blue' },
    { id: 'needs_approval', title: 'Needs Approval', color: 'orange' },
    { id: 'in_review', title: 'In Review', color: 'purple' },
    { id: 'done', title: 'Done', color: 'green' },
    { id: 'blocked', title: 'Blocked', color: 'red' },
];

// State
const isLoading = ref(false);
const selectedTask = ref<Task | null>(null);
const searchQuery = ref('');
const currentDragColumn = ref<string | null>(null);
const expandedProjects = ref<Set<number>>(new Set(props.projects.map((p) => p.id)));

// Real-time collaboration
const { otherUsers, emit: emitRealtimeEvent } = props.showCollaboration
    ? useRealtime(`board-multi-project`, 1) // TODO: Get user ID from auth
    : { otherUsers: computed(() => []), emit: () => {} };

/**
 * Toggle project expansion
 */
function toggleProject(projectId: number) {
    if (expandedProjects.value.has(projectId)) {
        expandedProjects.value.delete(projectId);
    } else {
        expandedProjects.value.add(projectId);
    }
}

// Drag & Drop
const { onDragStart, onDragOver, onDrop, isColumnDragOver } = useDragDrop({
    async onDrop(task: Task, targetStatus: string) {
        // Optimistic update is already done in the composable
        // Emit event to parent for API call
        const updatedTask = { ...task, status: targetStatus as any };
        emit('taskUpdate', updatedTask);

        // Broadcast to other users
        emitRealtimeEvent('task-moved', {
            taskId: task.id,
            fromStatus: task.status,
            toStatus: targetStatus,
        });
    },
    onDragStart(task: Task) {
        // Broadcast drag start
        emitRealtimeEvent('task-drag-start', {
            taskId: task.id,
            status: task.status,
        });
    },
    onDragEnd() {
        currentDragColumn.value = null;
        // Broadcast drag end
        emitRealtimeEvent('task-drag-end', {});
    },
});

/**
 * Filter and group tasks by project and column
 */
const projectTasksByColumn = computed(() => {
    return props.projects.map((project) => {
        let tasks = project.tasks;

        // Search filter
        if (searchQuery.value) {
            const query = searchQuery.value.toLowerCase();
            tasks = tasks.filter(
                (task) =>
                    task.title.toLowerCase().includes(query) ||
                    task.description?.toLowerCase().includes(query)
            );
        }

        // Priority filter
        if (props.filterBy?.priority && props.filterBy.priority.length > 0) {
            tasks = tasks.filter((task) => props.filterBy?.priority?.includes(task.priority || ''));
        }

        // Assignee filter
        if (props.filterBy?.assignee && props.filterBy.assignee.length > 0) {
            tasks = tasks.filter(
                (task) => task.assigneeId && props.filterBy?.assignee?.includes(task.assigneeId)
            );
        }

        // Tags filter
        if (props.filterBy?.tags && props.filterBy.tags.length > 0) {
            tasks = tasks.filter((task) => {
                const taskTags = task.tags || [];
                return props.filterBy?.tags?.some((tag) => taskTags.includes(tag));
            });
        }

        // Group by column
        const tasksByColumn = columns.reduce(
            (acc, column) => {
                acc[column.id] = tasks.filter((task) => task.status === column.id);
                return acc;
            },
            {} as Record<string, Task[]>
        );

        return {
            project,
            tasksByColumn,
            totalTasks: tasks.length,
        };
    });
});

/**
 * Handle column drag over
 */
function handleColumnDragEnter(columnId: string) {
    currentDragColumn.value = columnId;
}

/**
 * Handle column drag leave
 */
function handleColumnDragLeave() {
    currentDragColumn.value = null;
}

/**
 * Handle task drop on column
 */
async function handleTaskDrop(columnId: string, event: DragEvent) {
    await onDrop(columnId, event);
    currentDragColumn.value = null;
}

/**
 * Handle task click
 */
function handleTaskClick(task: Task) {
    selectedTask.value = task;
    emit('taskClick', task);
}

/**
 * Handle add task to column
 */
function handleAddTask(projectId: number, status: string) {
    emit('addTask', projectId, status);
}

/**
 * Handle task execute
 */
function handleTaskExecute(task: Task) {
    emit('taskExecute', task);
}

/**
 * Handle task enhance prompt
 */
function handleTaskEnhancePrompt(task: Task) {
    emit('taskEnhancePrompt', task);
}

/**
 * Handle task preview prompt
 */
function handleTaskPreviewPrompt(task: Task) {
    emit('taskPreviewPrompt', task);
}

/**
 * Handle task preview result
 */
function handleTaskPreviewResult(task: Task) {
    emit('taskPreviewResult', task);
}

/**
 * Handle task retry
 */
async function handleTaskRetry(task: Task) {
    // Retry: reset to TODO first, then execute
    if (task.status === 'done') {
        const updatedTask = { ...task, status: 'todo' as any };
        emit('taskUpdate', updatedTask);
        // Wait a bit for the update to propagate
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    emit('taskExecute', task);
}

/**
 * Handle task view history
 */
function handleTaskViewHistory(task: Task) {
    emit('taskViewHistory', task);
}

/**
 * Handle task view progress
 */
function handleTaskViewProgress(task: Task) {
    emit('taskViewProgress', task);
}

/**
 * Handle task view step history
 */
function handleTaskViewStepHistory(task: Task) {
    emit('taskViewStepHistory', task);
}

/**
 * Handle task pause
 */
function handleTaskPause(task: Task) {
    emit('taskPause', task);
}

/**
 * Handle task resume
 */
function handleTaskResume(task: Task) {
    emit('taskResume', task);
}

/**
 * Handle task stop
 */
function handleTaskStop(task: Task) {
    emit('taskStop', task);
}

/**
 * Handle task subdivide
 */
function handleTaskSubdivide(task: Task) {
    emit('taskSubdivide', task);
}

/**
 * Get overall statistics
 */
const statistics = computed(() => {
    let total = 0;
    let completed = 0;
    let inProgress = 0;
    let blocked = 0;

    projectTasksByColumn.value.forEach(({ tasksByColumn }) => {
        total += Object.values(tasksByColumn).reduce((sum, tasks) => sum + tasks.length, 0);
        completed += tasksByColumn.done?.length || 0;
        inProgress += tasksByColumn.in_progress?.length || 0;
        blocked += tasksByColumn.blocked?.length || 0;
    });

    return {
        total,
        completed,
        inProgress,
        blocked,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
});

// Watch for real-time task updates
onMounted(() => {
    if (props.showCollaboration) {
        // Listen for task movements from other users
        // Implementation depends on WebSocket setup
    }
});
</script>

<template>
    <div class="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
        <!-- Header -->
        <div
            class="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4"
        >
            <div class="flex items-center justify-between">
                <!-- Title & Stats -->
                <div>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Kanban Board</h1>
                    <div
                        class="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400"
                    >
                        <span>{{ statistics.total }} tasks</span>
                        <span class="text-blue-600 dark:text-blue-400"
                            >{{ statistics.inProgress }} in progress</span
                        >
                        <span class="text-green-600 dark:text-green-400"
                            >{{ statistics.completed }} completed</span
                        >
                        <span v-if="statistics.blocked > 0" class="text-red-600 dark:text-red-400">
                            {{ statistics.blocked }} blocked
                        </span>
                        <span
                            class="ml-2 px-2 py-0.5 rounded bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 font-semibold"
                        >
                            {{ statistics.completionRate }}% complete
                        </span>
                    </div>
                </div>

                <!-- Search & Collaboration Indicators -->
                <div class="flex items-center gap-4">
                    <!-- Search -->
                    <div class="relative">
                        <input
                            v-model="searchQuery"
                            type="text"
                            placeholder="Search tasks..."
                            class="w-64 px-4 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <svg
                            class="absolute left-3 top-2.5 w-5 h-5 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                        </svg>
                    </div>

                    <!-- Collaboration Users -->
                    <div
                        v-if="showCollaboration && otherUsers.length > 0"
                        class="flex items-center gap-2"
                    >
                        <div class="flex -space-x-2">
                            <div
                                v-for="user in otherUsers.slice(0, 5)"
                                :key="user.id"
                                class="w-8 h-8 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center text-white text-xs font-semibold"
                                :style="{ backgroundColor: user.color }"
                                :title="user.name"
                            >
                                {{ user.name.charAt(0).toUpperCase() }}
                            </div>
                            <div
                                v-if="otherUsers.length > 5"
                                class="w-8 h-8 rounded-full border-2 border-white dark:border-gray-800 bg-gray-500 flex items-center justify-center text-white text-xs font-semibold"
                            >
                                +{{ otherUsers.length - 5 }}
                            </div>
                        </div>
                        <span class="text-sm text-gray-600 dark:text-gray-400">
                            {{ otherUsers.length }} online
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Board with Swimlanes -->
        <div class="flex-1 overflow-y-auto" style="overscroll-behavior: contain">
            <!-- Column Headers (Sticky) -->
            <div
                class="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shadow-sm"
            >
                <div class="flex gap-4 px-6 py-3 min-w-min">
                    <!-- Project Column Header -->
                    <div
                        class="w-64 flex-shrink-0 font-semibold text-sm text-gray-700 dark:text-gray-300"
                    >
                        프로젝트
                    </div>

                    <!-- Status Column Headers -->
                    <div
                        v-for="column in columns"
                        :key="column.id"
                        class="w-80 flex-shrink-0 font-semibold text-sm text-gray-900 dark:text-white uppercase tracking-wide"
                    >
                        {{ column.title }}
                    </div>
                </div>
            </div>

            <!-- Swimlanes -->
            <div class="p-6 space-y-4">
                <div
                    v-for="{ project, tasksByColumn, totalTasks } in projectTasksByColumn"
                    :key="project.id"
                    class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
                >
                    <!-- Project Header -->
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                        @click="toggleProject(project.id)"
                        :data-testid="'project-header-' + project.id"
                    >
                        <div class="flex items-center gap-3">
                            <!-- Expand/Collapse Icon -->
                            <svg
                                class="w-5 h-5 text-gray-500 transition-transform duration-200"
                                :class="{ 'rotate-90': expandedProjects.has(project.id) }"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M9 5l7 7-7 7"
                                />
                            </svg>

                            <!-- Project Color Indicator -->
                            <div
                                class="w-3 h-3 rounded-full flex-shrink-0"
                                :style="{ backgroundColor: project.color }"
                            />

                            <!-- Project Name -->
                            <h3 class="text-base font-semibold text-gray-900 dark:text-white">
                                {{ project.name }}
                            </h3>

                            <!-- Task Count Badge -->
                            <span
                                class="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                            >
                                {{ totalTasks }} tasks
                            </span>
                        </div>

                        <!-- Project Statistics -->
                        <div
                            class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400"
                        >
                            <span
                                v-if="tasksByColumn.done"
                                class="text-green-600 dark:text-green-400"
                            >
                                {{ tasksByColumn.done.length }} completed
                            </span>
                            <span
                                v-if="tasksByColumn.in_progress"
                                class="text-blue-600 dark:text-blue-400"
                            >
                                {{ tasksByColumn.in_progress.length }} in progress
                            </span>
                            <span
                                v-if="tasksByColumn.blocked && tasksByColumn.blocked.length > 0"
                                class="text-red-600 dark:text-red-400"
                            >
                                {{ tasksByColumn.blocked.length }} blocked
                            </span>
                        </div>
                    </div>

                    <!-- Project Swimlane (Collapsible) -->
                    <transition
                        enter-active-class="transition-all duration-200 ease-out"
                        leave-active-class="transition-all duration-200 ease-in"
                        enter-from-class="max-h-0 opacity-0"
                        enter-to-class="max-h-screen opacity-100"
                        leave-from-class="max-h-screen opacity-100"
                        leave-to-class="max-h-0 opacity-0"
                    >
                        <div v-if="expandedProjects.has(project.id)" class="overflow-hidden">
                            <div class="overflow-x-auto" style="overscroll-behavior: contain">
                                <div class="flex gap-4 p-4 min-w-min">
                                    <!-- Project Name Column (Empty space for alignment) -->
                                    <div class="w-64 flex-shrink-0" />

                                    <!-- Task Columns -->
                                    <KanbanColumn
                                        v-for="column in columns"
                                        :key="`${project.id}-${column.id}`"
                                        :status="column.id"
                                        :title="''"
                                        :color="column.color"
                                        :tasks="tasksByColumn[column.id] || []"
                                        :is-drag-over="isColumnDragOver(column.id)"
                                        class="w-80 flex-shrink-0"
                                        @dragover="onDragOver"
                                        @dragenter="handleColumnDragEnter(column.id)"
                                        @dragleave="handleColumnDragLeave"
                                        @drop="handleTaskDrop(column.id, $event)"
                                        @task-click="handleTaskClick"
                                        @task-edit="handleTaskClick"
                                        @add-task="handleAddTask(project.id, column.id)"
                                        @dragstart-task="onDragStart"
                                        @task-execute="handleTaskExecute"
                                        @task-enhance-prompt="handleTaskEnhancePrompt"
                                        @task-preview-prompt="handleTaskPreviewPrompt"
                                        @task-preview-result="handleTaskPreviewResult"
                                        @task-retry="handleTaskRetry"
                                        @task-view-history="handleTaskViewHistory"
                                        @task-view-progress="handleTaskViewProgress"
                                        @task-view-step-history="handleTaskViewStepHistory"
                                        @task-pause="handleTaskPause"
                                        @task-resume="handleTaskResume"
                                        @task-stop="handleTaskStop"
                                        @task-subdivide="handleTaskSubdivide"
                                    />
                                </div>
                            </div>
                        </div>
                    </transition>
                </div>

                <!-- Empty State -->
                <div
                    v-if="projectTasksByColumn.length === 0"
                    class="flex flex-col items-center justify-center py-16 text-center"
                >
                    <svg
                        class="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                    </svg>
                    <p class="text-base text-gray-600 dark:text-gray-400 mb-2">
                        프로젝트가 없습니다
                    </p>
                    <p class="text-sm text-gray-500 dark:text-gray-500">
                        새 프로젝트를 생성하여 시작하세요
                    </p>
                </div>
            </div>
        </div>

        <!-- Loading Overlay -->
        <div
            v-if="isLoading"
            class="absolute inset-0 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50"
        >
            <div class="flex flex-col items-center gap-3">
                <div
                    class="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"
                />
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300">Loading tasks...</p>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Custom scrollbar for horizontal scroll */
.overflow-x-auto::-webkit-scrollbar {
    height: 8px;
}

.overflow-x-auto::-webkit-scrollbar-track {
    background: #f1f5f9;
}

.dark .overflow-x-auto::-webkit-scrollbar-track {
    background: #1e293b;
}

.overflow-x-auto::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 4px;
}

.dark .overflow-x-auto::-webkit-scrollbar-thumb {
    background: #475569;
}

.overflow-x-auto::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
}

.dark .overflow-x-auto::-webkit-scrollbar-thumb:hover {
    background: #64748b;
}
</style>
