<script setup lang="ts">
import { computed } from 'vue';
import type { Task } from '@core/types/database';
import TaskCard from './TaskCard.vue';

interface Props {
    status: string;
    title: string;
    tasks: Task[];
    color?: string;
    isDragOver?: boolean;
    maxTasks?: number;
}

const props = withDefaults(defineProps<Props>(), {
    color: 'blue',
    isDragOver: false,
    maxTasks: 100,
});

const emit = defineEmits<{
    (e: 'dragover', event: DragEvent): void;
    (e: 'dragenter'): void;
    (e: 'dragleave'): void;
    (e: 'drop', event: DragEvent): void;
    (e: 'taskClick', task: Task): void;
    (e: 'taskEdit', task: Task): void;
    (e: 'taskDelete', task: Task): void;
    (e: 'addTask'): void;
    (e: 'dragstartTask', task: Task, event: DragEvent): void;
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
    (e: 'operatorDrop', taskId: number, operatorId: number): void;
}>();

/**
 * Handle task drag start
 */
function handleTaskDragStart(task: Task, event: DragEvent) {
    // Stop event from bubbling to prevent scroll issues
    event.stopPropagation();
    emit('dragstartTask', task, event);
}

/**
 * Column header color classes
 */
const headerColorClasses = computed(() => {
    const colorMap: Record<string, string> = {
        blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
        yellow: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
        purple: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
        green: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
        red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
        gray: 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800',
    };

    return colorMap[props.color] || colorMap.blue;
});

/**
 * Task count display
 */
const taskCountText = computed(() => {
    const count = props.tasks.length;
    if (count === 0) return 'No tasks';
    if (count === 1) return '1 task';
    return `${count} tasks`;
});

/**
 * Check if column is at capacity
 */
const isAtCapacity = computed(() => {
    return props.tasks.length >= props.maxTasks;
});

/**
 * Get subtasks for a given parent task
 */
function getSubtasksForTask(taskId: number): Task[] {
    return props.tasks.filter((t) => t.parentTaskId === taskId);
}

/**
 * Filter to show only parent tasks (no subtasks) or tasks without parents
 */
const parentTasks = computed(() => {
    return props.tasks.filter((t) => t.parentTaskId === null);
});
</script>

<template>
    <div
        :class="[
            'flex flex-col h-full rounded-lg border-2 transition-all duration-200',
            isDragOver
                ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-900/10 scale-[1.02]'
                : 'border-gray-200 dark:border-gray-700',
        ]"
        @dragover="emit('dragover', $event)"
        @dragenter="emit('dragenter')"
        @dragleave="emit('dragleave')"
        @drop="emit('drop', $event)"
    >
        <!-- Column Header -->
        <div :class="['px-4 py-3 border-b-2 rounded-t-lg', headerColorClasses]">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <h3
                        class="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide"
                    >
                        {{ title }}
                    </h3>
                    <span
                        class="px-2 py-0.5 text-xs font-semibold rounded-full bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    >
                        {{ tasks.length }}
                    </span>
                </div>

                <!-- Add Task Button -->
                <button
                    class="w-6 h-6 rounded hover:bg-white dark:hover:bg-gray-800 flex items-center justify-center transition-colors"
                    :disabled="isAtCapacity"
                    :title="isAtCapacity ? 'Column at capacity' : 'Add new task'"
                    @click="emit('addTask')"
                >
                    <svg
                        class="w-4 h-4"
                        :class="isAtCapacity ? 'text-gray-400' : 'text-gray-600 dark:text-gray-300'"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 4v16m8-8H4"
                        />
                    </svg>
                </button>
            </div>

            <!-- Task Count Info -->
            <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {{ taskCountText }}
            </p>
        </div>

        <!-- Task List -->
        <div class="flex-1 overflow-y-auto px-3 pb-3 pt-10 space-y-3 min-h-[200px]">
            <!-- Empty State -->
            <div
                v-if="tasks.length === 0"
                class="flex flex-col items-center justify-center h-full text-center p-6"
            >
                <svg
                    class="w-12 h-12 text-gray-300 dark:text-gray-600 mb-2"
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
                <p class="text-sm text-gray-500 dark:text-gray-400">No tasks yet</p>
                <button
                    class="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    @click="emit('addTask')"
                >
                    Add first task
                </button>
            </div>

            <!-- Task Cards (Only showing parent tasks) -->
            <div
                v-for="task in parentTasks"
                :key="task.id"
                draggable="true"
                @dragstart="handleTaskDragStart(task, $event)"
            >
                <TaskCard
                    :task="task"
                    :subtasks="task.id !== undefined ? getSubtasksForTask(task.id) : []"
                    :hide-prompt-actions="true"
                    class="group cursor-move"
                    @click="emit('taskClick', task)"
                    @edit="emit('taskEdit', task)"
                    @delete="emit('taskDelete', task)"
                    @execute="emit('taskExecute', task)"
                    @enhance-prompt="emit('taskEnhancePrompt', task)"
                    @preview-prompt="emit('taskPreviewPrompt', task)"
                    @preview-result="emit('taskPreviewResult', task)"
                    @retry="emit('taskRetry', task)"
                    @view-history="emit('taskViewHistory', task)"
                    @view-progress="emit('taskViewProgress', task)"
                    @view-step-history="emit('taskViewStepHistory', task)"
                    @pause="emit('taskPause', task)"
                    @resume="emit('taskResume', task)"
                    @stop="emit('taskStop', task)"
                    @subdivide="emit('taskSubdivide', task)"
                    @operator-drop="
                        (taskId, operatorId) => emit('operatorDrop', taskId, operatorId)
                    "
                />
            </div>

            <!-- Capacity Warning -->
            <div
                v-if="isAtCapacity"
                class="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg"
            >
                <p class="text-xs text-yellow-800 dark:text-yellow-200">
                    Column at maximum capacity ({{ maxTasks }} tasks)
                </p>
            </div>
        </div>

        <!-- Drop Zone Indicator -->
        <div
            v-if="isDragOver"
            class="absolute inset-0 pointer-events-none flex items-center justify-center bg-blue-100/50 dark:bg-blue-900/20 rounded-lg"
        >
            <div class="text-center">
                <svg
                    class="w-16 h-16 text-blue-500 dark:text-blue-400 mx-auto animate-bounce"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                    />
                </svg>
                <p class="text-sm font-semibold text-blue-700 dark:text-blue-300 mt-2">Drop here</p>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Custom scrollbar for task list */
.overflow-y-auto::-webkit-scrollbar {
    width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
}

.dark .overflow-y-auto::-webkit-scrollbar-thumb {
    background: #475569;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
}

.dark .overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: #64748b;
}
</style>
