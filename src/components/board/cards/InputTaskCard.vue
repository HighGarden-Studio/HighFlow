<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Task } from '@core/types/database';
import BaseTaskCard from './BaseTaskCard.vue';
import { useTaskStatus } from '../../../composables/task/useTaskStatus';
import { useTaskStore } from '../../../renderer/stores/taskStore';

interface Props {
    task: Task;
    isDragging?: boolean;
    missingProvider?: any;
    hideConnectionHandles?: boolean;
    hidePrompt?: boolean;
    showTags?: boolean;
    hideExtraActions?: boolean;
    hidePromptActions?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    isDragging: false,
    missingProvider: null,
    hideConnectionHandles: false,
    hidePrompt: false,
    showTags: true,
    hideExtraActions: false,
    hidePromptActions: false,
});

const emit = defineEmits<{
    (e: 'click', task: Task): void;
    (e: 'connectionStart', task: Task, event: DragEvent): void;
    (e: 'connectionEnd', task: Task): void;
    (e: 'connectionCancel'): void;
    (e: 'operatorDrop', projectId: number, sequence: number, operatorId: number): void;
    (e: 'execute', task: Task): void;
    (e: 'stop', task: Task): void;
    (e: 'delete', task: Task): void;
    (e: 'provideInput', task: Task): void;
    (e: 'previewResult', task: Task): void; // 결과 보기
    (e: 'retry', task: Task): void; // 재실행
    (e: 'viewHistory', task: Task): void; // 히스토리
}>();

const taskStore = useTaskStore();
const { t } = useI18n();
const { isWaitingForInput, outputFormatInfo } = useTaskStatus(props);

// Operator state
const assignedOperator = ref<any>(null);

// Fetch operator details
const fetchOperator = async () => {
    if (props.task.assignedOperatorId) {
        try {
            const op = await window.electron.operators.get(props.task.assignedOperatorId);
            assignedOperator.value = op;
        } catch (error) {
            console.error('Failed to fetch operator:', error);
            assignedOperator.value = null;
        }
    } else {
        assignedOperator.value = null;
    }
};

onMounted(fetchOperator);

watch(
    () => props.task.assignedOperatorId,
    () => {
        fetchOperator();
    }
);

// Dependency display helper
const dependencySequences = computed(() => {
    const taskIds = props.task.triggerConfig?.dependsOn?.taskIds;
    if (!taskIds || taskIds.length === 0) return '';
    return taskIds
        .map((id) => {
            const t = taskStore.tasks.find((task) => task.projectSequence === id);
            return t ? `#${t.projectSequence}` : '';
        })
        .filter(Boolean)
        .join(', ');
});

const inputTypeLabel = computed(() => {
    if (!props.task.inputConfig) return 'User Input';
    const type = props.task.inputConfig.sourceType;
    if (type === 'USER_INPUT') return t('task.input.type.user');
    if (type === 'LOCAL_FILE') return t('task.input.type.local');
    if (type === 'REMOTE_RESOURCE') return t('task.input.type.remote');
    return type;
});

const inputModeLabel = computed(() => {
    if (!props.task.inputConfig) return 'Manual';
    if (props.task.inputConfig.sourceType === 'USER_INPUT') {
        const mode = props.task.inputConfig.userInput?.mode;
        if (mode === 'confirm') return t('task.input.mode.confirm');
        if (mode === 'short') return t('task.input.mode.short');
        if (mode === 'long') return t('task.input.mode.long');
    }
    return ''; // Less relevant for other types unless specified
});

const descriptionLabel = computed(() => {
    if (!props.task.inputConfig) return t('task.input.label.message');
    const type = props.task.inputConfig.sourceType;
    if (type === 'USER_INPUT') return t('task.input.label.message');
    if (type === 'LOCAL_FILE') return t('task.input.label.file');
    if (type === 'REMOTE_RESOURCE') return t('task.input.label.url');
    return t('task.input.label.message');
});

function handleExecute(event: Event) {
    event.stopPropagation();
    emit('execute', props.task);
}

function handleStop(event: Event) {
    event.stopPropagation();
    emit('stop', props.task);
}

function handleProvideInput(event: Event) {
    event.stopPropagation();
    emit('provideInput', props.task);
}
function hexToRgba(hex: string, alpha: number) {
    // Remove hash if present
    hex = hex.replace('#', '');

    // Parse r, g, b
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
</script>

<template>
    <BaseTaskCard
        :task="task"
        :is-dragging="isDragging"
        :missing-provider="missingProvider"
        :hide-connection-handles="hideConnectionHandles"
        @click="emit('click', task)"
        @connection-start="(t, e) => emit('connectionStart', t, e)"
        @connection-end="(t) => emit('connectionEnd', t)"
        @connection-cancel="emit('connectionCancel')"
        @operator-drop="(pid, seq, oid) => emit('operatorDrop', pid, seq, oid)"
        @delete="(t) => emit('delete', t)"
    >
        <template #header>
            <div class="flex flex-col gap-2">
                <!-- Row 1: Operator Info (If Assigned) -->
                <div
                    v-if="assignedOperator"
                    class="flex items-center gap-2 p-1.5 rounded-lg border transition-colors"
                    :style="{
                        backgroundColor: assignedOperator.color
                            ? hexToRgba(assignedOperator.color, 0.1)
                            : undefined,
                        borderColor: assignedOperator.color
                            ? hexToRgba(assignedOperator.color, 0.2)
                            : undefined,
                    }"
                    :class="[
                        !assignedOperator.color
                            ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-800'
                            : '',
                    ]"
                >
                    <!-- Avatar/Emoji -->
                    <img
                        v-if="
                            assignedOperator.avatar?.startsWith('http') ||
                            assignedOperator.avatar?.startsWith('/')
                        "
                        :src="assignedOperator.avatar"
                        class="w-6 h-6 rounded-full object-cover border"
                        :style="{
                            borderColor: assignedOperator.color
                                ? hexToRgba(assignedOperator.color, 0.3)
                                : undefined,
                        }"
                        :class="[
                            !assignedOperator.color
                                ? 'border-orange-200 dark:border-orange-700'
                                : '',
                        ]"
                    />
                    <div
                        v-else
                        class="w-6 h-6 rounded-full border flex items-center justify-center text-sm"
                        :style="{
                            backgroundColor: assignedOperator.color
                                ? hexToRgba(assignedOperator.color, 0.05)
                                : undefined,
                            borderColor: assignedOperator.color
                                ? hexToRgba(assignedOperator.color, 0.3)
                                : undefined,
                        }"
                        :class="[
                            !assignedOperator.color
                                ? 'bg-white dark:bg-orange-800 border-orange-200 dark:border-orange-700'
                                : 'bg-white dark:bg-gray-800',
                        ]"
                    >
                        {{ assignedOperator.avatar || '👤' }}
                    </div>

                    <div class="flex flex-col min-w-0">
                        <span
                            class="text-xs font-semibold truncate"
                            :style="{ color: assignedOperator.color || undefined }"
                            :class="[
                                !assignedOperator.color
                                    ? 'text-orange-900 dark:text-orange-100'
                                    : '',
                            ]"
                        >
                            {{ assignedOperator.name }}
                        </span>
                        <span
                            class="text-[10px] truncate"
                            :style="{
                                color: assignedOperator.color
                                    ? hexToRgba(assignedOperator.color, 0.7)
                                    : undefined,
                            }"
                            :class="[
                                !assignedOperator.color
                                    ? 'text-orange-600 dark:text-orange-300'
                                    : '',
                            ]"
                        >
                            {{ assignedOperator.role || 'Input Provider' }}
                        </span>
                    </div>
                </div>

                <!-- Row 2: Input Configuration -->
                <div class="flex items-center gap-2 px-0.5">
                    <div
                        class="flex items-center justify-center w-5 h-5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                        title="Input Task"
                    >
                        <span class="text-xs">⌨️</span>
                    </div>
                    <div class="flex flex-col leading-none">
                        <span
                            class="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
                        >
                            {{ inputTypeLabel }}
                        </span>
                        <span
                            v-if="inputModeLabel"
                            class="text-xs font-medium text-gray-700 dark:text-gray-200"
                        >
                            {{ inputModeLabel }}
                        </span>
                    </div>
                    <!-- Task ID (moved from Row 3) -->
                    <div class="ml-auto flex items-center gap-1">
                        <span class="text-[10px] text-gray-400 font-mono whitespace-nowrap">
                            #{{ task.projectSequence }}
                        </span>
                    </div>
                </div>

                <!-- Row 3: Task Title -->
                <h3
                    class="text-sm font-bold text-gray-900 dark:text-gray-100 leading-snug break-words line-clamp-2 mt-2"
                >
                    {{ task.title }}
                </h3>

                <!-- Row 4: Output Type & Tags -->
                <div class="flex items-center justify-between gap-2 mt-2">
                    <!-- Output Format Badge -->
                    <div
                        v-if="outputFormatInfo"
                        class="flex items-center gap-1.5 px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                        :title="outputFormatInfo.label"
                    >
                        <span class="text-xs">{{ outputFormatInfo.icon }}</span>
                        <span class="text-[10px] font-medium text-gray-600 dark:text-gray-300">{{
                            outputFormatInfo.label
                        }}</span>
                    </div>
                    <div
                        v-else
                        class="flex items-center gap-1.5 px-2 py-1 rounded bg-gray-50 dark:bg-gray-800/50 border border-transparent"
                    >
                        <span class="text-xs">📄</span>
                        <span class="text-[10px] text-gray-400">Text</span>
                    </div>

                    <!-- Tags -->
                    <div
                        v-if="showTags && task.tags && task.tags.length > 0"
                        class="flex items-center gap-1 overflow-hidden justify-end"
                    >
                        <span
                            v-for="tag in task.tags.slice(0, 2)"
                            :key="tag"
                            class="px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 truncate max-w-[60px]"
                        >
                            #{{ tag }}
                        </span>
                        <span v-if="task.tags.length > 2" class="text-[10px] text-gray-400 px-1">
                            +{{ task.tags.length - 2 }}
                        </span>
                    </div>
                </div>
            </div>
        </template>

        <template #default>
            <!-- Row 5: Content (Description) -->
            <div class="mt-3 mb-2">
                <div class="text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1">
                    {{ descriptionLabel }}
                </div>
                <p
                    v-if="!hidePrompt && task.description"
                    class="text-xs text-gray-600 dark:text-gray-300 line-clamp-2"
                >
                    {{ task.inputConfig?.userInput?.message }}
                </p>
                <p v-else class="text-xs text-gray-400 dark:text-gray-500 italic">
                    {{ t('task.type.input_desc') }}
                </p>
            </div>

            <!-- Waiting for Input UI (Takes precedence or sits alongside triggers) -->
            <div
                v-if="isWaitingForInput"
                class="mb-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg text-center"
            >
                <div
                    class="inline-flex items-center justify-center p-2 mb-2 bg-yellow-100 dark:bg-yellow-800 rounded-full animate-bounce"
                >
                    <svg
                        class="w-5 h-5 text-yellow-600 dark:text-yellow-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        ></path>
                    </svg>
                </div>
                <p class="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                    {{ t('task.status.waiting_input') }}
                </p>
            </div>

            <!-- Row 6: Trigger Information -->
            <div
                v-if="task.triggerConfig"
                class="mb-3 p-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded text-xs"
            >
                <!-- Dependency Trigger -->
                <div v-if="task.triggerConfig.dependsOn" class="flex items-start gap-2">
                    <svg
                        class="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                    </svg>
                    <div class="flex-1">
                        <p class="font-medium text-indigo-700 dark:text-indigo-300 mb-0.5">
                            자동 실행
                        </p>
                        <p class="text-[10px] text-indigo-600 dark:text-indigo-400 leading-tight">
                            {{
                                dependencySequences
                                    ? `Task ${dependencySequences}`
                                    : t('common.prev_task')
                            }}
                            {{
                                task.triggerConfig.dependsOn.operator === 'all'
                                    ? t('task.trigger.all')
                                    : t('task.trigger.any')
                            }}
                            {{ t('task.trigger.on_complete') }}
                        </p>
                    </div>
                </div>

                <!-- Schedule Trigger -->
                <div v-if="task.triggerConfig.scheduledAt" class="flex items-start gap-2 mt-1.5">
                    <svg
                        class="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    <div class="flex-1">
                        <p class="font-medium text-indigo-700 dark:text-indigo-300 mb-0.5">
                            {{ t('task.trigger.scheduled') }}
                        </p>
                        <p class="text-[10px] text-indigo-600 dark:text-indigo-400 leading-tight">
                            {{
                                task.triggerConfig.scheduledAt.type === 'once'
                                    ? t('task.trigger.once')
                                    : t('task.trigger.repeat')
                            }}:
                            {{
                                task.triggerConfig.scheduledAt.datetime
                                    ? new Date(
                                          task.triggerConfig.scheduledAt.datetime
                                      ).toLocaleString('ko-KR', {
                                          month: 'numeric',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                      })
                                    : task.triggerConfig.scheduledAt.cron
                            }}
                        </p>
                    </div>
                </div>
            </div>
        </template>

        <template #footer>
            <!-- Row 7: Actions -->
            <div
                v-if="!hideExtraActions"
                class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-1.5"
            >
                <!-- Provide Input Button -->
                <button
                    v-if="isWaitingForInput"
                    class="flex-1 px-3 py-1.5 text-xs font-medium rounded bg-rose-500 text-white hover:bg-rose-600 flex items-center justify-center gap-1 animate-pulse shadow-sm"
                    @click="handleProvideInput"
                >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                    </svg>
                    {{ t('task.actions.input') }}
                </button>

                <!-- Execute Button (TODO) -->
                <button
                    v-if="task.status === 'todo' && !task.triggerConfig?.dependsOn"
                    class="flex-1 px-3 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center gap-1 shadow-sm"
                    @click="handleExecute"
                >
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                        />
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    {{ t('task.card.execute') }}
                </button>

                <!--Stop Button (In Progress) - Including waiting for input -->
                <button
                    v-if="task.status === 'in_progress'"
                    class="px-3 py-1.5 text-xs font-medium rounded bg-white dark:bg-gray-800 text-red-600 border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center"
                    @click="handleStop"
                >
                    {{ t('common.stop') }}
                </button>

                <!-- DONE Status Actions -->
                <template v-if="task.status === 'done'">
                    <button
                        class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-slate-600 text-white hover:bg-slate-700 flex items-center justify-center gap-1 shadow-sm"
                        @click="
                            (e) => {
                                e.stopPropagation();
                                emit('previewResult', task);
                            }
                        "
                    >
                        {{ t('task.actions.view_result') }}
                    </button>
                    <!-- Show retry button if task has no auto-execute dependencies -->
                    <button
                        v-if="!task.triggerConfig?.dependsOn"
                        class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center gap-1 shadow-sm"
                        @click="
                            (e) => {
                                e.stopPropagation();
                                emit('retry', task);
                            }
                        "
                    >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                        {{ t('common.retry') }}
                    </button>
                </template>
            </div>
        </template>
    </BaseTaskCard>
</template>
