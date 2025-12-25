<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { useTaskExecution } from '../../composables/useTaskExecution';
import { useSettingsStore } from '../../renderer/stores/settingsStore';
import { useTaskStore } from '../../renderer/stores/taskStore';
import type { Task } from '@core/types/database';

interface Props {
    task: Task;
    autoStart?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    autoStart: false,
});

const emit = defineEmits<{
    (e: 'completed', result: { content: string; stats: unknown }): void;
    (e: 'failed', error: string): void;
    (e: 'stopped'): void;
    (e: 'approvalRequired', data: { question: string; options?: string[] }): void;
}>();

// Task execution composable
const taskExecution = useTaskExecution();
const settingsStore = useSettingsStore();
const taskStore = useTaskStore();

// Get streaming content from global taskStore as fallback
const globalStreamedContent = computed(() => {
    const progress = taskStore.executionProgress.get(props.task.id);
    return progress?.content || '';
});

// Use global content if local is empty but global has content
const effectiveStreamedContent = computed(() => {
    return taskExecution.streamedContent.value || globalStreamedContent.value;
});

// Check if executing from either local or global state
const isEffectivelyExecuting = computed(() => {
    return taskExecution.isExecuting.value || taskStore.isTaskExecuting(props.task.id);
});

// Local state
const approvalResponse = ref('');
const showFullContent = ref(false);

// Check if current provider supports streaming
const supportsStreaming = computed(() => {
    const providerId = props.task.aiProvider;
    if (!providerId) return false;
    return settingsStore.providerSupportsStreaming(providerId);
});

// Computed
const progressPercentage = computed(() => taskExecution.progress.value);

const statusMessage = computed(() => {
    if (taskExecution.executionError.value) {
        return taskExecution.executionError.value;
    }
    if (taskExecution.isPaused.value) {
        return 'Paused';
    }
    if (taskExecution.approvalRequest.value) {
        return 'Awaiting Approval';
    }
    if (!taskExecution.isExecuting.value && taskExecution.hasResults.value) {
        return 'Completed';
    }
    if (taskExecution.isExecuting.value) {
        if (progressPercentage.value < 20) return 'Initializing...';
        if (progressPercentage.value < 50) return 'Processing...';
        if (progressPercentage.value < 80) return 'Generating response...';
        return 'Finalizing...';
    }
    return 'Ready';
});

const statusColor = computed(() => {
    if (taskExecution.executionError.value) return 'text-red-500';
    if (taskExecution.isPaused.value) return 'text-yellow-500';
    if (taskExecution.approvalRequest.value) return 'text-orange-500';
    if (!taskExecution.isExecuting.value && taskExecution.hasResults.value) return 'text-green-500';
    if (taskExecution.isExecuting.value) return 'text-blue-500';
    return 'text-gray-500';
});

const progressBarColor = computed(() => {
    if (taskExecution.executionError.value) return 'bg-red-500';
    if (taskExecution.isPaused.value) return 'bg-yellow-500';
    if (taskExecution.approvalRequest.value) return 'bg-orange-500';
    if (!taskExecution.isExecuting.value && taskExecution.hasResults.value) return 'bg-green-500';
    return 'bg-blue-500';
});

const truncatedContent = computed(() => {
    const content = effectiveStreamedContent.value;
    if (!content) return '';
    if (showFullContent.value || content.length <= 1000) return content;
    return content.slice(0, 1000) + '...';
});

// Check if content is likely an image
const isImageResult = computed(() => {
    const content = effectiveStreamedContent.value;
    if (!content) return false;

    // Check task metadata first
    if (
        props.task.outputFormat === 'png' ||
        props.task.expectedOutputFormat === 'png' ||
        props.task.aiModel?.includes('image') ||
        props.task.aiModel?.includes('veo')
    ) {
        return true;
    }

    // Heuristic check for base64 image start sequences
    // PNG: ivbORw0KGgo
    // JPEG: /9j/
    // GIF: R0lGOD
    return (
        content.startsWith('iVBORw0KGgo') ||
        content.startsWith('/9j/') ||
        content.startsWith('R0lGOD')
    );
});

const imageSrc = computed(() => {
    const content = effectiveStreamedContent.value;
    if (!content) return '';

    // If already has data prefix, return as is
    if (content.startsWith('data:image')) return content;

    // Otherwise assume standard base64 and guess mime type
    let mimeType = 'image/png';
    if (content.startsWith('/9j/')) mimeType = 'image/jpeg';
    else if (content.startsWith('R0lGOD')) mimeType = 'image/gif';

    return `data:${mimeType};base64,${content}`;
});

// Methods
async function startExecution() {
    try {
        const result = await taskExecution.executeTaskViaIPC(props.task.id);
        if (result?.success) {
            emit('completed', {
                content: taskExecution.streamedContent.value,
                stats: taskExecution.executionStats.value,
            });
        } else if (result?.error) {
            emit('failed', result.error);
        }
    } catch (error) {
        emit('failed', (error as Error).message);
    }
}

async function stopExecution() {
    // Use taskStore.stopTask for reliable status change
    await taskStore.stopTask(props.task.id);
    emit('stopped');
}

async function handleApprove() {
    await taskExecution.approveTask(props.task.id, approvalResponse.value);
    approvalResponse.value = '';
}

async function handleReject() {
    await taskExecution.rejectTask(props.task.id);
    emit('stopped');
}

// Watch for approval requests
watch(
    () => taskExecution.approvalRequest.value,
    (request) => {
        if (request) {
            emit('approvalRequired', request);
        }
    }
);

// Watch for task status changes to sync execution state
watch(
    () => props.task,
    (newTask) => {
        // Sync currentTaskId to allow listening to IPC events
        if (newTask.id !== taskExecution.currentTaskId.value) {
            taskExecution.currentTaskId.value = newTask.id;
        }

        // Sync execution state
        if (newTask.status === 'in_progress' && !newTask.isPaused) {
            if (!taskExecution.isExecuting.value) {
                taskExecution.isExecuting.value = true;
            }
        } else if (
            newTask.status === 'todo' ||
            newTask.status === 'done' ||
            newTask.status === 'blocked'
        ) {
            if (taskExecution.isExecuting.value) {
                taskExecution.isExecuting.value = false;
            }
        }
    },
    { immediate: true, deep: true }
);

// Auto-start if configured
onMounted(() => {
    if (props.autoStart) {
        startExecution();
    }
});

// Cleanup on unmount
onUnmounted(() => {
    if (taskExecution.isExecuting.value) {
        taskExecution.stopExecutionViaIPC();
    }
});

// Expose methods for parent component
defineExpose({
    startExecution,
    stopExecution,
});
</script>

<template>
    <div class="task-execution-progress space-y-4">
        <!-- Status Header -->
        <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
                <!-- Status Indicator -->
                <div
                    :class="[
                        'w-3 h-3 rounded-full',
                        taskExecution.isExecuting.value ? 'animate-pulse' : '',
                        taskExecution.executionError.value
                            ? 'bg-red-500'
                            : taskExecution.isPaused.value
                              ? 'bg-yellow-500'
                              : taskExecution.approvalRequest.value
                                ? 'bg-orange-500'
                                : !taskExecution.isExecuting.value && taskExecution.hasResults.value
                                  ? 'bg-green-500'
                                  : taskExecution.isExecuting.value
                                    ? 'bg-blue-500'
                                    : 'bg-gray-400',
                    ]"
                />
                <span :class="['text-sm font-medium', statusColor]">
                    {{ statusMessage }}
                </span>
            </div>

            <!-- Progress Percentage -->
            <span class="text-sm font-mono text-gray-600 dark:text-gray-400">
                {{ progressPercentage }}%
            </span>
        </div>

        <!-- Progress Bar -->
        <div class="relative">
            <div class="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                    :class="['h-full transition-all duration-300 ease-out', progressBarColor]"
                    :style="{ width: `${progressPercentage}%` }"
                />
            </div>

            <!-- Animated Stripe (when executing) -->
            <div
                v-if="taskExecution.isExecuting.value && !taskExecution.isPaused.value"
                class="absolute inset-0 overflow-hidden rounded-full"
            >
                <div
                    :class="['h-full opacity-20', progressBarColor]"
                    :style="{ width: `${progressPercentage}%` }"
                >
                    <div class="h-full w-full animate-stripe bg-stripes" />
                </div>
            </div>
        </div>

        <!-- Stats Row -->
        <div
            v-if="taskExecution.executionStats.value"
            class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400"
        >
            <!-- Duration -->
            <div v-if="taskExecution.durationFormatted.value" class="flex items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
                <span>{{ taskExecution.durationFormatted.value }}</span>
            </div>

            <!-- Token Usage -->
            <div
                v-if="taskExecution.executionStats.value.tokensUsed"
                class="flex items-center gap-1"
            >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                </svg>
                <span>{{ taskExecution.executionStats.value.tokensUsed.total }} tokens</span>
            </div>

            <!-- Cost -->
            <div v-if="taskExecution.costFormatted.value" class="flex items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
                <span>{{ taskExecution.costFormatted.value }}</span>
            </div>

            <!-- Model -->
            <div v-if="taskExecution.executionStats.value.model" class="flex items-center gap-1">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                </svg>
                <span>{{ taskExecution.executionStats.value.model }}</span>
            </div>
        </div>

        <!-- Streaming Content Preview (shown when has content or executing) -->
        <div
            v-if="effectiveStreamedContent || isEffectivelyExecuting"
            class="relative rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden"
        >
            <!-- Header with status -->
            <div
                class="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-between"
            >
                <div class="flex items-center gap-2">
                    <span
                        v-if="isEffectivelyExecuting"
                        class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"
                    ></span>
                    <span v-else class="w-2 h-2 rounded-full bg-green-500"></span>
                    <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {{ isEffectivelyExecuting ? 'AI 응답 생성중...' : 'AI 응답' }}
                    </span>
                </div>
                <span v-if="effectiveStreamedContent" class="text-xs text-gray-500">
                    {{ effectiveStreamedContent.length.toLocaleString() }} chars
                </span>
            </div>

            <!-- Content area - larger and more readable, limited height to not obscure buttons below -->
            <div class="px-4 py-4 max-h-[350px] overflow-y-auto">
                <div v-if="effectiveStreamedContent">
                    <div
                        v-if="isImageResult"
                        class="flex flex-col items-center justify-center bg-gray-900/5 rounded-lg p-2"
                    >
                        <img
                            :src="imageSrc"
                            alt="Generated Image"
                            class="max-w-full h-auto rounded shadow-sm object-contain max-h-[300px]"
                        />
                        <div class="mt-2 text-xs text-gray-500 font-mono">
                            {{ effectiveStreamedContent.length.toLocaleString() }} bytes
                        </div>
                    </div>
                    <pre
                        v-else
                        class="text-base text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono leading-relaxed"
                        >{{ truncatedContent }}</pre
                    >
                </div>
                <div v-else class="flex items-center justify-center py-8 text-gray-400">
                    <svg class="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
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
                    응답 대기중...
                </div>
            </div>

            <!-- Expand/Collapse Button -->
            <div
                v-if="effectiveStreamedContent.length > 1000"
                class="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
            >
                <button
                    class="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    @click="showFullContent = !showFullContent"
                >
                    {{
                        showFullContent
                            ? '접기'
                            : `전체 보기 (${effectiveStreamedContent.length.toLocaleString()} 문자)`
                    }}
                </button>
            </div>
        </div>

        <!-- Non-streaming indicator (when provider doesn't support streaming) -->
        <div
            v-if="!supportsStreaming && taskExecution.isExecuting.value"
            class="p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20"
        >
            <div class="flex items-center gap-3">
                <svg class="w-5 h-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
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
                <p class="text-sm text-blue-700 dark:text-blue-300">
                    Processing... Real-time streaming is not available for this AI provider.
                </p>
            </div>
        </div>

        <!-- Approval Request -->
        <div
            v-if="taskExecution.approvalRequest.value"
            class="p-4 rounded-lg border-2 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20"
        >
            <div class="flex items-start gap-3 mb-4">
                <svg
                    class="w-6 h-6 text-orange-500 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
                <div class="flex-1">
                    <h4 class="font-medium text-orange-800 dark:text-orange-200 mb-1">
                        Approval Required
                    </h4>
                    <p class="text-sm text-orange-700 dark:text-orange-300">
                        {{ taskExecution.approvalRequest.value.question }}
                    </p>
                </div>
            </div>

            <!-- Options (if provided) -->
            <div v-if="taskExecution.approvalRequest.value.options?.length" class="mb-4 space-y-2">
                <button
                    v-for="option in taskExecution.approvalRequest.value.options"
                    :key="option"
                    :class="[
                        'w-full px-4 py-2 text-left text-sm rounded-lg transition-colors',
                        approvalResponse === option
                            ? 'bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200'
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-orange-100 dark:hover:bg-orange-900/50',
                    ]"
                    @click="approvalResponse = option"
                >
                    {{ option }}
                </button>
            </div>

            <!-- Custom Response Input -->
            <div v-else class="mb-4">
                <input
                    v-model="approvalResponse"
                    type="text"
                    class="w-full px-3 py-2 border border-orange-300 dark:border-orange-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-orange-500"
                    placeholder="Enter your response..."
                />
            </div>

            <!-- Approval Actions -->
            <div class="flex gap-2">
                <button
                    class="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium text-sm"
                    @click="handleApprove"
                >
                    Approve
                </button>
                <button
                    class="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium text-sm"
                    @click="handleReject"
                >
                    Reject
                </button>
            </div>
        </div>

        <!-- Control Buttons -->
        <div class="flex items-center gap-2">
            <!-- Stop Button (when executing) -->
            <button
                v-if="isEffectivelyExecuting"
                class="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors font-medium text-sm"
                @click="stopExecution"
            >
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 6h12v12H6z" />
                </svg>
                중지
            </button>

            <!-- Clear Button (when has results) -->
            <button
                v-if="!taskExecution.isExecuting.value && taskExecution.hasResults.value"
                class="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium text-sm"
                @click="taskExecution.clearResults"
            >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                </svg>
                Clear
            </button>

            <!-- Re-run Button (when has results) -->
            <button
                v-if="!taskExecution.isExecuting.value && taskExecution.hasResults.value"
                class="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium text-sm"
                @click="startExecution"
            >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                </svg>
                Re-run
            </button>
        </div>

        <!-- Error Display -->
        <div
            v-if="taskExecution.executionError.value"
            class="p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
        >
            <div class="flex items-start gap-3">
                <svg
                    class="w-5 h-5 text-red-500 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
                <div class="flex-1">
                    <h4 class="font-medium text-red-800 dark:text-red-200 text-sm">
                        Execution Failed
                    </h4>
                    <p class="text-sm text-red-700 dark:text-red-300 mt-1">
                        {{ taskExecution.executionError.value }}
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.animate-stripe {
    animation: stripe-scroll 1s linear infinite;
}

.bg-stripes {
    background-image: repeating-linear-gradient(
        45deg,
        transparent,
        transparent 10px,
        rgba(255, 255, 255, 0.3) 10px,
        rgba(255, 255, 255, 0.3) 20px
    );
}

@keyframes stripe-scroll {
    0% {
        background-position: 0 0;
    }
    100% {
        background-position: 40px 0;
    }
}

/* Custom scrollbar for content preview */
.max-h-64::-webkit-scrollbar {
    width: 6px;
}

.max-h-64::-webkit-scrollbar-track {
    background: transparent;
}

.max-h-64::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
}

.dark .max-h-64::-webkit-scrollbar-thumb {
    background: #475569;
}
</style>
