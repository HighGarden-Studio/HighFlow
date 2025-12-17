<script setup lang="ts">
import { computed } from 'vue';
import type { Task } from '@core/types/database';
import BaseTaskCard from './BaseTaskCard.vue';
import { LucideFileText, LucideHash, LucideFile, LucideExternalLink } from 'lucide-vue-next';

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
    (e: 'execute', task: Task): void;
    (e: 'stop', task: Task): void;
    (e: 'delete', task: Task): void;
    (e: 'previewResult', task: Task): void;
    (e: 'retry', task: Task): void;
    (e: 'viewHistory', task: Task): void;
}>();

// Helper for display
const destinationLabel = computed(() => {
    const dest = props.task.outputConfig?.destination;
    switch (dest) {
        case 'local_file':
            return 'Local File';
        case 'slack':
            return 'Slack';
        case 'google_docs':
            return 'Google Docs';
        default:
            return 'Output';
    }
});

const destinationIcon = computed(() => {
    const dest = props.task.outputConfig?.destination;
    switch (dest) {
        case 'local_file':
            return LucideFile;
        case 'slack':
            return LucideHash;
        case 'google_docs':
            return LucideFileText;
        default:
            return LucideExternalLink;
    }
});

const detailsLabel = computed(() => {
    const config = props.task.outputConfig;
    if (!config) return 'Not Configured';

    if (config.destination === 'local_file') {
        return config.localFile?.pathTemplate || 'No path set';
    }
    if (config.destination === 'slack') {
        return config.slack?.channelId || 'No channel set';
    }
    if (config.destination === 'google_docs') {
        return config.googleDocs?.documentName || 'Untitled Doc';
    }
    return '';
});

// Check if there is any result to show
const hasResult = computed(() => {
    return !!(
        (props.task as any).result ||
        (props.task as any).executionResult?.content ||
        (props.task as any).executionProgress?.content
    );
});

function handleExecute(event: Event) {
    event.stopPropagation();
    emit('execute', props.task);
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
        @delete="(t) => emit('delete', t)"
    >
        <template #header>
            <div class="flex flex-col gap-2">
                <!-- Row 1: Destination Config -->
                <div class="flex items-center gap-2 px-0.5">
                    <div
                        class="flex items-center justify-center w-6 h-6 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800"
                        title="Output Task"
                    >
                        <component :is="destinationIcon" class="w-4 h-4" />
                    </div>
                    <div class="flex flex-col leading-none overflow-hidden">
                        <span
                            class="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
                        >
                            {{ destinationLabel }}
                        </span>
                        <span
                            class="text-xs font-medium text-gray-700 dark:text-gray-200 truncate"
                            :title="detailsLabel"
                        >
                            {{ detailsLabel }}
                        </span>
                    </div>
                </div>

                <!-- Row 2: Task Title & ID -->
                <div class="flex items-start justify-between gap-2 mt-1">
                    <h3
                        class="text-sm font-bold text-gray-900 dark:text-gray-100 leading-snug break-words line-clamp-2"
                    >
                        {{ task.title }}
                    </h3>
                    <div class="flex items-center gap-1">
                        <span class="text-[10px] text-gray-400 font-mono mt-0.5 whitespace-nowrap">
                            #{{ task.projectSequence }}
                        </span>
                    </div>
                </div>

                <!-- Row 3: Tags -->
                <div
                    v-if="showTags && task.tags && task.tags.length > 0"
                    class="flex items-center gap-1 overflow-hidden justify-end mt-1"
                >
                    <span
                        v-for="tag in task.tags.slice(0, 2)"
                        :key="tag"
                        class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800 truncate max-w-[60px]"
                    >
                        #{{ tag }}
                    </span>
                </div>
            </div>
        </template>

        <template #default>
            <!-- Description -->
            <div class="mt-3 mb-2">
                <p
                    v-if="!hidePrompt && task.description"
                    class="text-xs text-gray-600 dark:text-gray-300 line-clamp-2"
                >
                    {{ task.description }}
                </p>
                <p v-else class="text-xs text-gray-400 dark:text-gray-500 italic">No description</p>
            </div>

            <!-- Streaming Preview (Matches AiTaskCard style) -->
            <div
                v-if="task.status === 'in_progress' && !task.isPaused"
                class="mb-3 p-2 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800 cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-600 transition-all shadow-sm group"
                @click.stop="emit('previewResult', task)"
                title="클릭하여 실시간 결과 보기"
            >
                <!-- Header with live indicator -->
                <div class="flex items-center justify-between mb-1.5">
                    <div class="flex items-center gap-1.5">
                        <span class="relative flex h-2 w-2">
                            <span
                                class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
                            ></span>
                            <span
                                class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"
                            ></span>
                        </span>
                        <span
                            class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide"
                            >Writing...</span
                        >
                    </div>
                    <span
                        class="text-[10px] text-gray-500 dark:text-gray-400 group-hover:text-emerald-500 transition-colors"
                        >View Live &rarr;</span
                    >
                </div>
            </div>
        </template>

        <template #footer>
            <div
                v-if="!hideExtraActions"
                class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-1.5"
            >
                <!-- Execute Button (TODO) -->
                <button
                    v-if="task.status === 'todo'"
                    class="flex-1 px-3 py-1.5 text-xs font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700 flex items-center justify-center gap-1 shadow-sm"
                    @click="handleExecute"
                >
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                        />
                    </svg>
                    Run Output
                </button>

                <!-- Previous Result (TODO but has result) -->
                <button
                    v-if="task.status === 'todo' && hasResult"
                    class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center gap-1 shadow-sm"
                    @click="
                        (e) => {
                            e.stopPropagation();
                            emit('previewResult', task);
                        }
                    "
                >
                    Prev Result
                </button>

                <!-- DONE or IN_PROGRESS Actions -->
                <template v-if="task.status === 'done' || task.status === 'in_progress'">
                    <button
                        class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-slate-600 text-white hover:bg-slate-700 flex items-center justify-center gap-1 shadow-sm"
                        @click="
                            (e) => {
                                e.stopPropagation();
                                emit('previewResult', task);
                            }
                        "
                    >
                        View Result
                    </button>
                    <!-- Retry -->
                    <button
                        class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700 flex items-center justify-center gap-1 shadow-sm"
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
                        Retry
                    </button>
                </template>
            </div>
        </template>
    </BaseTaskCard>
</template>
