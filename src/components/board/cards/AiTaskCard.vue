<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import type { Task } from '@core/types/database';
import BaseTaskCard from './BaseTaskCard.vue';
import IconRenderer from '../../common/IconRenderer.vue';
import { useTaskStatus } from '../../../composables/task/useTaskStatus';
import { useTaskStore } from '../../../renderer/stores/taskStore';
import { getProviderIcon } from '../../../utils/iconMapping';

interface Props {
    task: Task;
    isDragging?: boolean;
    missingProvider?: any;
    hideConnectionHandles?: boolean;
    hidePrompt?: boolean;
    hideExtraActions?: boolean;
    hidePromptActions?: boolean;
    showAssignee?: boolean;
    showDueDate?: boolean;
    showPriority?: boolean;
    showTags?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    isDragging: false,
    missingProvider: null,
    hideConnectionHandles: false,
    hidePrompt: false,
    hideExtraActions: false,
    hidePromptActions: false,
    showAssignee: true,
    showDueDate: true,
    showPriority: true,
    showTags: true,
});

const emit = defineEmits<{
    (e: 'click', task: Task): void;
    (e: 'connectionStart', task: Task, event: DragEvent): void;
    (e: 'connectionEnd', task: Task): void;
    (e: 'connectionCancel'): void;
    (e: 'operatorDrop', taskId: number, operatorId: number): void;
    (e: 'execute', task: Task): void;
    (e: 'stop', task: Task): void;
    (e: 'delete', task: Task): void;
    (e: 'retry', task: Task): void;
    (e: 'pause', task: Task): void;
    (e: 'resume', task: Task): void;
    (e: 'previewStream', task: Task): void;
    (e: 'previewPrompt', task: Task): void;
    (e: 'enhancePrompt', task: Task): void;
    (e: 'previewResult', task: Task): void;
    (e: 'viewHistory', task: Task): void;
    (e: 'viewProgress', task: Task): void;
    (e: 'connectProvider', providerId: string): void;
    (e: 'approve', task: Task): void;
    (e: 'openApproval', task: Task): void;
}>();

const taskStore = useTaskStore();
const { isMissingExecutionSettings, hasMissingProvider, outputFormatInfo } = useTaskStatus({
    task: props.task,
    missingProvider: props.missingProvider,
});

// Operator state
const assignedOperator = ref<any>(null);

function loadAssignedOperator() {
    if (props.task.assignedOperatorId) {
        window.electron.operators
            .get(props.task.assignedOperatorId)
            .then((operator: any) => {
                assignedOperator.value = operator;
            })
            .catch((error: any) => {
                console.error('Failed to load operator:', error);
            });
    } else {
        assignedOperator.value = null;
    }
}

onMounted(() => {
    loadAssignedOperator();
});

watch(
    () => props.task.assignedOperatorId,
    () => {
        loadAssignedOperator();
    }
);

// Store-bound computed properties
const streamedContent = computed(() => {
    const progress = taskStore.executionProgress.get(props.task.id);
    return progress?.content || '';
});

const reviewStreamedContent = computed(() => {
    const progress = taskStore.reviewProgress.get(props.task.id);
    return progress?.content || '';
});

const isTaskCurrentlyReviewing = computed(() => {
    return taskStore.isTaskReviewing(props.task.id);
});

// Provider Icon helper - uses centralized icon mapping
// Prioritize operator's AI provider if operator is assigned (matches AI settings priority)
const aiProviderIcon = computed(() => {
    const provider = assignedOperator.value?.aiProvider || props.task.aiProvider;
    return getProviderIcon(provider || 'default');
});

// Dependency display helper
const dependencySequences = computed(() => {
    const taskIds = props.task.triggerConfig?.dependsOn?.taskIds;
    if (!taskIds || taskIds.length === 0) return '';
    return taskIds
        .map((id) => {
            const t = taskStore.tasks.find((task) => task.id === id);
            return t ? `#${t.projectSequence}` : '';
        })
        .filter(Boolean)
        .join(', ');
});

const hasPreviousResult = computed(() => {
    const t = props.task as any;
    return !!(t.executionResult?.content || t.result);
});

// Action handlers
function handleExecute(event: Event) {
    event.stopPropagation();
    emit('execute', props.task);
}

function handleStop(event: Event) {
    event.stopPropagation();
    emit('stop', props.task);
}

function handleRetry(event: Event) {
    event.stopPropagation();
    emit('retry', props.task);
}

function handlePreviewPrompt(event: Event) {
    event.stopPropagation();
    emit('previewPrompt', props.task);
}

function handleEnhancePrompt(event: Event) {
    event.stopPropagation();
    emit('enhancePrompt', props.task);
}

function handlePreviewResult(event: Event) {
    event.stopPropagation();
    emit('previewResult', props.task);
}

function handleViewHistory(event: Event) {
    event.stopPropagation();
    emit('viewHistory', props.task);
}

function handleViewProgress(event: Event) {
    event.stopPropagation();
    emit('viewProgress', props.task);
}

function handleConnectProviderClick() {
    if (props.missingProvider) {
        emit('connectProvider', props.missingProvider.id);
    }
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
        @operator-drop="(tid, oid) => emit('operatorDrop', tid, oid)"
        @delete="(t) => emit('delete', t)"
    >
        <template #header>
            <div class="flex flex-col gap-2">
                <!-- Row 1: Operator Info (If Assigned) -->
                <div
                    v-if="assignedOperator"
                    class="flex items-center gap-2 p-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800"
                >
                    <!-- Avatar/Emoji -->
                    <img
                        v-if="
                            assignedOperator.avatar?.startsWith('http') ||
                            assignedOperator.avatar?.startsWith('/')
                        "
                        :src="assignedOperator.avatar"
                        class="w-6 h-6 rounded-full object-cover border border-purple-200 dark:border-purple-700"
                    />
                    <div
                        v-else
                        class="w-6 h-6 rounded-full bg-white dark:bg-purple-800 border border-purple-200 dark:border-purple-700 flex items-center justify-center text-sm"
                    >
                        <!-- Use IconRenderer for emoji consistency if needed, but direct text usually works better for raw emoji strings -->
                        {{ assignedOperator.avatar || '🤖' }}
                    </div>

                    <div class="flex flex-col min-w-0">
                        <span
                            class="text-xs font-semibold text-purple-900 dark:text-purple-100 truncate"
                        >
                            {{ assignedOperator.name }}
                        </span>
                        <span class="text-[10px] text-purple-600 dark:text-purple-300 truncate">
                            {{ assignedOperator.role || 'Operator' }}
                        </span>
                    </div>
                </div>

                <!-- Row 2: AI Configuration -->
                <div class="flex items-center gap-2 px-0.5">
                    <div
                        class="flex items-center justify-center w-7 h-7 rounded bg-white dark:bg-white shadow-sm border border-gray-200 dark:border-gray-300"
                        :title="
                            assignedOperator
                                ? assignedOperator.aiProvider || task.aiProvider || 'AI Provider'
                                : task.aiProvider || 'AI Provider'
                        "
                    >
                        <IconRenderer :icon="aiProviderIcon" class="w-5 h-5" />
                    </div>
                    <div class="flex flex-col leading-none">
                        <span
                            class="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
                        >
                            {{
                                assignedOperator
                                    ? assignedOperator.aiProvider || task.aiProvider || 'AI'
                                    : task.aiProvider || 'AI'
                            }}
                        </span>
                        <span class="text-xs font-medium text-gray-700 dark:text-gray-200">
                            {{
                                assignedOperator
                                    ? assignedOperator.aiModel || task.aiModel || 'Default Model'
                                    : task.aiModel || 'Default Model'
                            }}
                        </span>
                    </div>
                </div>

                <!-- Row 3: Task Title & ID -->
                <div class="flex items-start justify-between gap-2 mt-1">
                    <h3
                        class="text-sm font-bold text-gray-900 dark:text-gray-100 leading-snug break-words line-clamp-2"
                    >
                        {{ task.title }}
                    </h3>
                    <span class="text-[10px] text-gray-400 font-mono mt-0.5 whitespace-nowrap">
                        #{{ task.projectSequence }}
                    </span>
                </div>

                <!-- Row 4: Output Type & Tags -->
                <div class="flex items-center justify-between gap-2">
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
            <!-- Row 5: Content (Prompt/Description) -->
            <div class="mt-3 mb-2">
                <p
                    v-if="!hidePrompt && task.description && !hasMissingProvider"
                    class="text-xs text-gray-600 dark:text-gray-300 line-clamp-2"
                >
                    {{ task.description }}
                </p>
                <p
                    v-else-if="!hidePrompt && task.generatedPrompt"
                    class="text-xs text-gray-500 dark:text-gray-400 italic line-clamp-2"
                >
                    "{{ task.generatedPrompt }}"
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
                                dependencySequences ? `Task ${dependencySequences}` : '이전 태스크'
                            }}
                            {{
                                task.triggerConfig.dependsOn.operator === 'all'
                                    ? '모두'
                                    : '하나라도'
                            }}
                            완료 시
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
                            예약 실행
                        </p>
                        <p class="text-[10px] text-indigo-600 dark:text-indigo-400 leading-tight">
                            {{ task.triggerConfig.scheduledAt.type === 'once' ? '1회' : '반복' }}:
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

            <!-- Missing Provider Warning -->
            <div
                v-if="hasMissingProvider && !assignedOperator"
                class="mb-3 p-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded"
            >
                <div class="flex items-center gap-2">
                    <svg
                        class="w-4 h-4 text-amber-500 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                    >
                        <path
                            fill-rule="evenodd"
                            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                            clip-rule="evenodd"
                        />
                    </svg>
                    <span class="text-xs font-medium text-amber-800 dark:text-amber-200">
                        Provider 연동 필요
                    </span>
                </div>
            </div>

            <!-- Streaming Preview - ALWAYS VISIBLE -->
            <div
                class="mb-3 p-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800 cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 transition-all shadow-sm group"
                :class="{
                    'border-blue-400 dark:border-blue-600':
                        task.status === 'in_progress' && !task.isPaused,
                }"
                @click.stop="emit('previewStream', task)"
                title="클릭하여 실시간 응답 크게 보기"
            >
                <!-- Header with live indicator -->
                <div class="flex items-center justify-between mb-1.5">
                    <div class="flex items-center gap-1.5">
                        <span
                            v-if="task.status === 'in_progress' && !task.isPaused"
                            class="relative flex h-2 w-2"
                        >
                            <span
                                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"
                            ></span>
                            <span
                                class="relative inline-flex rounded-full h-2 w-2 bg-blue-500"
                            ></span>
                        </span>
                        <span
                            v-else
                            class="relative inline-flex rounded-full h-2 w-2 bg-gray-400"
                        ></span>
                        <span
                            class="text-[10px] font-semibold uppercase tracking-wide"
                            :class="
                                task.status === 'in_progress' && !task.isPaused
                                    ? 'text-blue-600 dark:text-blue-400'
                                    : 'text-gray-500 dark:text-gray-400'
                            "
                        >
                            {{
                                task.status === 'in_progress' && !task.isPaused ? 'LIVE' : 'AI 응답'
                            }}
                        </span>
                    </div>
                    <span
                        class="text-[10px] text-gray-500 dark:text-gray-400 group-hover:text-blue-500 transition-colors"
                        >자세히 보기 &rarr;</span
                    >
                </div>

                <!-- Streaming content -->
                <div class="relative overflow-hidden" style="height: 40px">
                    <p
                        v-if="streamedContent || hasPreviousResult"
                        class="text-gray-700 dark:text-gray-200 font-mono leading-tight overflow-hidden text-[10px]"
                        style="
                            display: -webkit-box;
                            -webkit-line-clamp: 3;
                            -webkit-box-orient: vertical;
                        "
                    >
                        {{
                            task.status === 'in_progress'
                                ? streamedContent
                                : task.status === 'todo'
                                  ? ''
                                  : streamedContent ||
                                    (task as any).executionResult?.content?.slice(0, 300) ||
                                    (task as any).result?.slice(0, 300) ||
                                    '이전 결과 없음'
                        }}
                    </p>
                    <p
                        v-else
                        class="text-gray-400 dark:text-gray-500 italic text-[10px] flex items-center h-full"
                    >
                        {{
                            task.status === 'in_progress'
                                ? '⏳ 응답 대기중...'
                                : '아직 실행되지 않음'
                        }}
                    </p>
                </div>
            </div>

            <!-- Review Streaming Preview -->
            <div
                v-if="task.status === 'in_review' && isTaskCurrentlyReviewing"
                class="mb-3 p-2 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200 dark:border-purple-800 cursor-pointer hover:border-purple-400 dark:hover:border-purple-600 transition-all shadow-sm"
                @click.stop="emit('click', task)"
            >
                <div class="flex items-center justify-between mb-1.5">
                    <div class="flex items-center gap-1.5">
                        <span class="relative flex h-2 w-2">
                            <span
                                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"
                            ></span>
                            <span
                                class="relative inline-flex rounded-full h-2 w-2 bg-purple-500"
                            ></span>
                        </span>
                        <span
                            class="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide"
                            >REVIEWING</span
                        >
                    </div>
                    <span class="text-[10px] text-gray-500 dark:text-gray-400">AI 검토중</span>
                </div>
                <div class="relative overflow-hidden" style="min-height: 36px; max-height: 48px">
                    <p
                        v-if="reviewStreamedContent"
                        class="text-gray-700 dark:text-gray-200 font-mono leading-tight overflow-hidden text-[10px]"
                        style="
                            display: -webkit-box;
                            -webkit-line-clamp: 3;
                            -webkit-box-orient: vertical;
                        "
                    >
                        {{ reviewStreamedContent.slice(-300) }}
                    </p>
                    <p
                        v-else
                        class="text-gray-400 dark:text-gray-500 italic animate-pulse text-[10px]"
                    >
                        🔍 검토 시작중...
                    </p>
                </div>
            </div>
        </template>

        <template #footer>
            <!-- Row 7: Actions -->
            <div
                v-if="!hideExtraActions"
                class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-1.5"
            >
                <!-- 1. TODO Status: EXECUTE / CONNECT / PREVIEW / VIEW PREVIOUS -->
                <template v-if="task.status === 'todo'">
                    <button
                        v-if="hasMissingProvider && !assignedOperator"
                        class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-amber-500 text-white hover:bg-amber-600 flex items-center justify-center gap-1 shadow-sm"
                        @click.stop="handleConnectProviderClick"
                    >
                        연동하기
                    </button>
                    <template v-else>
                        <button
                            v-if="!props.hidePromptActions"
                            class="flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1 border"
                            :class="
                                isMissingExecutionSettings
                                    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                            "
                            @click="handlePreviewPrompt"
                        >
                            {{ isMissingExecutionSettings ? '설정' : '프롬프트' }}
                        </button>
                        <button
                            v-if="!props.hidePromptActions"
                            class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-900/50 flex items-center justify-center gap-1"
                            @click="handleEnhancePrompt"
                        >
                            고도화
                        </button>
                        <!-- Previous Result Button (Only if result exists) -->
                        <button
                            v-if="hasPreviousResult"
                            class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center gap-1 shadow-sm"
                            @click="handlePreviewResult"
                        >
                            이전 결과보기
                        </button>
                        <button
                            v-if="!task.triggerConfig?.dependsOn?.taskIds?.length"
                            class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center gap-1 shadow-sm"
                            @click="handleExecute"
                        >
                            <svg
                                class="w-3 h-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
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
                            실행
                        </button>
                    </template>
                </template>

                <!-- 2. IN_PROGRESS Status: VIEW / PAUSE / STOP -->
                <template v-if="task.status === 'in_progress'">
                    <button
                        class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center gap-1 shadow-sm"
                        :class="{ 'animate-pulse': !task.isPaused }"
                        @click="handleViewProgress"
                    >
                        <svg
                            v-if="task.isPaused"
                            class="w-3 h-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
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
                        <svg v-else class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle
                                class="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                stroke-width="4"
                            ></circle>
                            <path
                                class="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                        </svg>
                        {{ task.isPaused ? '재개' : '진행중' }}
                    </button>
                    <button
                        class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-center gap-1 shadow-sm"
                        @click="handlePreviewResult"
                    >
                        결과보기
                    </button>
                    <button
                        class="px-3 py-1.5 text-xs font-medium rounded bg-white dark:bg-gray-800 text-red-600 border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center"
                        @click="handleStop"
                    >
                        중지
                    </button>
                </template>

                <!-- 3. IN_REVIEW Status: PREVIEW RESULT / RETRY / APPROVE -->
                <template v-if="task.status === 'in_review'">
                    <div class="w-full flex gap-1.5">
                        <button
                            class="flex-1 px-2 py-1.5 text-xs font-medium rounded flex items-center justify-center gap-1 border transition-colors"
                            :class="
                                task.reviewFailed
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                            "
                            @click="(e) => handlePreviewResult(e)"
                        >
                            {{ task.reviewFailed ? '실패 분석' : '결과 확인' }}
                        </button>
                        <button
                            class="px-2 py-1.5 text-xs font-medium rounded bg-white dark:bg-gray-800 text-orange-600 border border-orange-200 hover:bg-orange-50"
                            @click="handleRetry"
                            title="다시 실행"
                        >
                            재시도
                        </button>
                        <button
                            class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 flex items-center justify-center gap-1 shadow-sm"
                            @click.stop="
                                () => {
                                    console.log('🟢 [AiTaskCard] Approve button clicked', task.id);
                                    emit('approve', task);
                                }
                            "
                        >
                            승인
                        </button>
                    </div>
                </template>

                <!-- 4. DONE: HISTORY -->
                <template v-if="task.status === 'done'">
                    <button
                        class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-slate-600 text-white hover:bg-slate-700 flex items-center justify-center gap-1 shadow-sm"
                        @click="(e) => handlePreviewResult(e)"
                    >
                        결과보기
                    </button>
                    <!-- Show retry button if task has no auto-execute dependencies -->
                    <button
                        v-if="!task.triggerConfig?.dependsOn"
                        class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 flex items-center justify-center gap-1 shadow-sm"
                        @click="(e) => handleRetry(e)"
                    >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                        재실행
                    </button>
                    <button
                        class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50"
                        @click="(e) => handleViewHistory(e)"
                    >
                        히스토리
                    </button>
                </template>
            </div>
        </template>
    </BaseTaskCard>
</template>
