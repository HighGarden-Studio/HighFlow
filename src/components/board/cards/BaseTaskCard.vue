<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Task } from '@core/types/database';
import { useTaskStatus } from '../../../composables/task/useTaskStatus';
import { useTaskDragAndDrop } from '../../../composables/task/useTaskDragAndDrop';

interface Props {
    task: Task;
    subtasks?: Task[];
    isDragging?: boolean;
    missingProvider?: any;
    hideConnectionHandles?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    subtasks: () => [],
    isDragging: false,
    missingProvider: null,
    hideConnectionHandles: false,
});

const emit = defineEmits<{
    (e: 'click', task: Task): void;
    (e: 'connectionStart', task: Task, event: DragEvent): void;
    (e: 'connectionEnd', task: Task): void;
    (e: 'connectionCancel'): void;
    (e: 'operatorDrop', projectId: number, sequence: number, operatorId: number): void;
    (e: 'subdivide', task: Task): void;
    (e: 'delete', task: Task): void;
}>();

// Use Composables
const { isWaitingForInput, hasMissingProvider } = useTaskStatus({
    task: props.task,
    missingProvider: props.missingProvider,
});

const {
    isConnectionDragging,
    isConnectionTarget,
    isOperatorDragOver,
    isHovered,
    handleConnectionDragStart,
    handleConnectionDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleOperatorDragOver,
    handleOperatorDragLeave,
    handleOperatorDrop,
} = useTaskDragAndDrop({ task: props.task }, emit as any);

// Subtask Logic
const isExpanded = ref(false);

const subtaskStats = computed(() => {
    if (!props.subtasks || props.subtasks.length === 0) {
        return { total: 0, done: 0, inProgress: 0, todo: 0 };
    }
    return {
        total: props.subtasks.length,
        done: props.subtasks.filter((st) => st.status === 'done').length,
        inProgress: props.subtasks.filter((st) => st.status === 'in_progress').length,
        todo: props.subtasks.filter((st) => st.status === 'todo').length,
    };
});

const subtaskProgress = computed(() => {
    if (subtaskStats.value.total === 0) return 0;
    return Math.round((subtaskStats.value.done / subtaskStats.value.total) * 100);
});

function toggleExpand(event: Event) {
    event.stopPropagation();
    isExpanded.value = !isExpanded.value;
}

const taskTypeConfig = computed(() => {
    switch (props.task.taskType) {
        case 'ai':
            return { label: 'AI', class: 'bg-purple-600 text-white border-purple-700' };
        case 'script':
            return { label: 'SCRIPT', class: 'bg-slate-600 text-white border-slate-700' };
        case 'input':
            return { label: 'INPUT', class: 'bg-emerald-600 text-white border-emerald-700' };
        case 'output':
            return { label: 'OUTPUT', class: 'bg-blue-600 text-white border-blue-700' };
        default:
            return {
                label: (props.task.taskType as unknown as string)
                    ? (props.task.taskType as unknown as string).toUpperCase()
                    : 'UNKNOWN',
                class: 'bg-gray-600 text-white border-gray-700',
            };
    }
});

// Status-based Border Logic
const containerClasses = computed(() => {
    // 1. Interaction States (Highest Priority)
    if (isConnectionTarget.value) {
        return 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 shadow-lg scale-[1.02]';
    }
    if (isOperatorDragOver.value) {
        return 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-lg scale-[1.02]';
    }

    // 2. Base Classes
    const classes = ['bg-white dark:bg-gray-800 hover:shadow-md'];

    // 3. Status-based Borders
    // Special Case: Script Task Explicit Stop
    const isExplicitStop =
        props.task.taskType === 'script' &&
        props.task.status === 'done' &&
        (props.task.executionResult as any)?.control?.next?.length === 0;

    if (isExplicitStop) {
        classes.push('border-red-500 dark:border-red-500 ring-1 ring-red-500');
    } else if (hasMissingProvider.value) {
        classes.push('border-amber-400 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-600');
    } else {
        switch (props.task.status) {
            case 'failed':
            case 'blocked':
                classes.push('border-red-500 dark:border-red-500');
                break;
            case 'done':
                classes.push('border-green-500 dark:border-green-500');
                break;
            case 'in_progress':
                if (!isWaitingForInput.value) {
                    classes.push('border-blue-500 dark:border-blue-500');
                }
                break;
            case 'in_review':
            case 'needs_approval':
                classes.push('border-amber-500 dark:border-amber-500');
                break;
            default: // todo
                classes.push('border-gray-200 dark:border-gray-700');
        }
    }

    return classes.join(' ');
});

const taskCardClasses = computed(() => [
    'rounded-lg p-4 shadow-sm border-2 transition-all duration-200 cursor-pointer relative group',
    props.isDragging && 'opacity-50 rotate-2',
    props.task.status === 'in_progress' && !isWaitingForInput.value && 'task-pulse-border',
    isWaitingForInput.value && 'task-waiting-input-border mt-1',
    containerClasses.value,
]);
</script>

<template>
    <div
        :class="taskCardClasses"
        @click="
            () => {
                emit('click', task);
            }
        "
        @mouseenter="isHovered = true"
        @mouseleave="isHovered = false"
        @dragover.prevent="
            (e) => {
                handleOperatorDragOver(e);
                handleDragOver(e);
            }
        "
        @dragleave="
            (e) => {
                handleOperatorDragLeave(e);
                handleDragLeave();
            }
        "
        @drop.prevent="
            (e) => {
                handleOperatorDrop(e);
                handleDrop(e);
            }
        "
    >
        <!-- Task Type Badge (Top Left) -->
        <div
            class="absolute -top-2.5 -left-2.5 z-30 px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm border tracking-wider"
            :class="taskTypeConfig.class"
        >
            {{ taskTypeConfig.label }}
        </div>

        <!-- Delete Button (Top Right, visible on hover) -->
        <button
            class="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded opacity-0 group-hover:opacity-100 transition-all z-20"
            title="태스크 삭제"
            @click.stop="emit('delete', task)"
        >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
            </svg>
        </button>

        <!-- Connection Points -->
        <div
            v-if="
                !hideConnectionHandles &&
                (isHovered || isConnectionDragging) &&
                task.status === 'todo'
            "
            class="absolute -right-3 top-1/2 -translate-y-1/2 z-20"
        >
            <div
                draggable="true"
                class="w-6 h-6 rounded-full bg-white dark:bg-gray-800 border-2 border-indigo-500 hover:scale-110 transition-transform cursor-crosshair flex items-center justify-center shadow-sm"
                @dragstart="handleConnectionDragStart"
                @dragend="handleConnectionDragEnd"
            >
                <div class="w-2 h-2 rounded-full bg-indigo-500"></div>
            </div>
        </div>

        <!-- Connection Target Overlay -->
        <div
            v-if="isConnectionTarget"
            class="absolute inset-0 bg-indigo-500/10 rounded-lg pointer-events-none flex items-center justify-center z-10"
        >
            <div
                class="bg-indigo-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg"
            >
                Drop to Connect
            </div>
        </div>

        <!-- Operator Target Overlay -->
        <div
            v-if="isOperatorDragOver"
            class="absolute inset-0 bg-purple-500/10 rounded-lg pointer-events-none flex items-center justify-center z-10"
        >
            <div
                class="bg-purple-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg"
            >
                Assign Operator
            </div>
        </div>

        <!-- Status Icon Overlay -->
        <div class="status-icon-overlay absolute -top-2 -right-2 z-10 pointer-events-none">
            <slot name="status-icon"></slot>
        </div>

        <!-- Header Slot -->
        <div class="mb-3">
            <slot name="header"></slot>
        </div>

        <!-- Body Slot -->
        <div class="mb-3">
            <slot></slot>
        </div>

        <!-- Footer Slot -->
        <div class="mt-auto">
            <slot name="footer"></slot>
        </div>

        <!-- Subtask Section -->
        <div
            v-if="task.isSubdivided && subtasks.length > 0"
            class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700"
            @click.stop
        >
            <!-- Subtask Progress Bar -->
            <div class="mb-3">
                <div
                    class="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1"
                >
                    <span class="font-medium">서브테스크 진행률</span>
                    <span
                        >{{ subtaskStats.done }}/{{ subtaskStats.total }} ({{
                            subtaskProgress
                        }}%)</span
                    >
                </div>
                <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                        class="h-full bg-gradient-to-r from-blue-500 to-teal-500 transition-all duration-300"
                        :style="{ width: `${subtaskProgress}%` }"
                    />
                </div>
                <div
                    class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500 mt-1"
                >
                    <span>진행중: {{ subtaskStats.inProgress }}</span>
                    <span>대기: {{ subtaskStats.todo }}</span>
                </div>
            </div>

            <!-- Expand/Collapse Button -->
            <button
                class="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                @click="toggleExpand"
            >
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    서브테스크 {{ isExpanded ? '숨기기' : '보기' }}
                </span>
                <svg
                    class="w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform"
                    :class="{ 'rotate-180': isExpanded }"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 9l-7 7-7-7"
                    />
                </svg>
            </button>

            <!-- Collapsed State: Subtask Titles Preview -->
            <div v-if="!isExpanded" class="mt-2 space-y-1">
                <div
                    v-for="subtask in subtasks.slice(0, 3)"
                    :key="subtask.id"
                    class="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-700/30 rounded text-xs"
                >
                    <div class="flex-shrink-0">
                        <span v-if="subtask.status === 'done'" class="text-green-500">✓</span>
                        <span v-else-if="subtask.status === 'in_progress'" class="text-blue-500"
                            >⚡</span
                        >
                        <span v-else class="text-gray-400">·</span>
                    </div>
                    <span class="flex-1 truncate text-gray-700 dark:text-gray-300">{{
                        subtask.title
                    }}</span>
                    <span class="text-gray-500">#{{ subtask.id }}</span>
                </div>
                <div v-if="subtasks.length > 3" class="text-center text-xs text-gray-400 mt-1">
                    +{{ subtasks.length - 3 }}개 더보기
                </div>
            </div>

            <!-- Expanded State -->
            <div v-else class="mt-2 space-y-2">
                <!-- Full list could be rendered here or emitted to parent to handle viewing details -->
                <div class="text-center py-2 text-xs text-gray-500">
                    (상세 목록 뷰는 현재 태스크 상세 패널에서 확인하세요)
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Keyframes for pulse animation */
@keyframes rotate-border {
    0% {
        background-position: 0% 50%;
    }
    100% {
        background-position: 400% 50%;
    }
}

.task-pulse-border {
    position: relative;
    border: 2px solid transparent !important;
    background-clip: padding-box !important; /* Ensure background doesn't bleed into border area if transparent */
    box-shadow: 0 0 10px rgba(59, 130, 246, 0.4);
    /* Remove background-image gradients that were causing the white background issue */
    background-image: none !important;
}

.task-pulse-border::before {
    content: '';
    position: absolute;
    inset: -2px; /* Extend to cover the border area */
    border-radius: inherit;
    padding: 2px; /* Thickness of the border */
    background: linear-gradient(
        90deg,
        #3b82f6,
        #60a5fa,
        #93c5fd,
        #60a5fa,
        #3b82f6,
        #60a5fa,
        #3b82f6
    );
    background-size: 400% 100%;
    animation: rotate-border 3s linear infinite;

    -webkit-mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
    mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
    z-index: 0;
}

/* Waiting for input border animation - yellow theme */
.task-waiting-input-border {
    position: relative;
    border: 2px solid transparent !important;
    background-color: rgb(254 252 232) !important; /* yellow-50 */
    background-clip: padding-box !important;
    box-shadow: 0 0 15px rgba(251, 191, 36, 0.5);
}

.dark .task-waiting-input-border {
    background-color: rgba(113, 63, 18, 0.1) !important; /* yellow-900/10 */
}

.task-waiting-input-border::before {
    content: '';
    position: absolute;
    inset: -2px;
    border-radius: inherit;
    padding: 2px;
    background: linear-gradient(
        90deg,
        #f59e0b,
        #fbbf24,
        #fcd34d,
        #fbbf24,
        #f59e0b,
        #fbbf24,
        #f59e0b
    );
    background-size: 400% 100%;
    animation: rotate-border 3s linear infinite;

    -webkit-mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
    mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
    z-index: 0;
}
</style>
