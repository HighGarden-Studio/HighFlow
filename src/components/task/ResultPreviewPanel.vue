<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Task } from '@core/types/database';
import { extractTaskResult } from '../../renderer/utils/aiResultHelpers';

interface InlineComment {
    id: number;
    line: number;
    text: string;
    author: string;
    timestamp: Date;
}

interface Props {
    task: Task | null;
    open: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'retry', task: Task, comments: InlineComment[]): void;
    (e: 'approve', task: Task): void;
}>();

// State
const resultContent = ref('');
const inlineComments = ref<InlineComment[]>([]);
const selectedLine = ref<number | null>(null);
const newCommentText = ref('');
const showCommentInput = ref(false);
const viewOptions = [
    { id: 'code', label: '코드', icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4' },
    {
        id: 'document',
        label: '문서',
        icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    },
    {
        id: 'design',
        label: '디자인',
        icon: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01',
    },
] as const;
type ViewId = (typeof viewOptions)[number]['id'];
const activeView = ref<ViewId>('code');
const modificationPrompt = ref('');

// Watch for task changes
watch(
    () => props.task,
    (newTask) => {
        const { content } = extractTaskResult(newTask as any);
        resultContent.value =
            content ||
            (newTask
                ? `// Task: ${newTask.title}\n// Status: ${newTask.status}\n// Description: ${newTask.description || ''}`
                : '');
    },
    { immediate: true }
);

/**
 * Get lines with numbers for display
 */
const contentLines = computed(() => {
    return resultContent.value.split('\n').map((line, index) => ({
        number: index + 1,
        text: line,
        hasComment: inlineComments.value.some((c) => c.line === index + 1),
    }));
});

/**
 * Get comments for a specific line
 */
function getCommentsForLine(lineNumber: number): InlineComment[] {
    return inlineComments.value.filter((c) => c.line === lineNumber);
}

/**
 * Handle line click for adding comment
 */
function handleLineClick(lineNumber: number) {
    selectedLine.value = lineNumber;
    showCommentInput.value = true;
}

/**
 * Add inline comment
 */
function addInlineComment() {
    if (!newCommentText.value.trim() || selectedLine.value === null) return;

    inlineComments.value.push({
        id: Date.now(),
        line: selectedLine.value,
        text: newCommentText.value,
        author: '현재 사용자', // TODO: Get from auth
        timestamp: new Date(),
    });

    newCommentText.value = '';
    showCommentInput.value = false;
    selectedLine.value = null;
}

/**
 * Remove inline comment
 */
function removeInlineComment(commentId: number) {
    inlineComments.value = inlineComments.value.filter((c) => c.id !== commentId);
}

/**
 * Collect all comments and modifications, then retry
 */
function handleRetry() {
    if (!props.task) return;

    // Combine modification prompt with inline comments
    const allFeedback = [
        modificationPrompt.value,
        ...inlineComments.value.map((c) => `Line ${c.line}: ${c.text}`),
    ]
        .filter(Boolean)
        .join('\n\n');

    console.debug('Retry with feedback:', allFeedback);
    emit('retry', props.task, inlineComments.value);

    // Clear comments after retry
    inlineComments.value = [];
    modificationPrompt.value = '';
}

/**
 * Approve and move to done
 */
function handleApprove() {
    if (!props.task) return;
    emit('approve', props.task);
}

/**
 * Handle close
 */
function handleClose() {
    emit('close');
}

/**
 * Format date
 */
function formatDate(date: Date): string {
    return date.toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
</script>

<template>
    <!-- Slide-over panel from right -->
    <div v-if="open" class="fixed inset-0 z-50 overflow-hidden pointer-events-none">
        <!-- Backdrop -->
        <div
            class="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity pointer-events-auto"
            :class="open ? 'opacity-100' : 'opacity-0'"
            @click="handleClose"
        />

        <!-- Panel -->
        <div class="absolute inset-y-0 right-0 flex max-w-full pl-10 pointer-events-none">
            <div
                class="w-screen max-w-4xl transform transition-transform pointer-events-auto"
                :class="open ? 'translate-x-0' : 'translate-x-full'"
            >
                <div class="flex h-full flex-col bg-white dark:bg-gray-800 shadow-2xl">
                    <!-- Header -->
                    <div
                        class="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 px-6 py-4"
                    >
                        <div class="flex items-center justify-between">
                            <div class="flex-1">
                                <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
                                    결과물 미리보기
                                </h2>
                                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    {{ task?.title }}
                                </p>
                            </div>

                            <!-- Close button -->
                            <button
                                class="ml-4 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                                @click="handleClose"
                            >
                                <svg
                                    class="h-6 w-6"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>

                        <!-- View Type Tabs -->
                        <div class="mt-4 flex gap-2">
                            <button
                                v-for="view in viewOptions"
                                :key="view.id"
                                :class="[
                                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                    activeView === view.id
                                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
                                ]"
                                @click="activeView = view.id"
                            >
                                <svg
                                    class="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        :d="view.icon"
                                    />
                                </svg>
                                {{ view.label }}
                            </button>
                        </div>
                    </div>

                    <!-- Content Area -->
                    <div class="flex-1 overflow-hidden flex flex-col">
                        <!-- Result Viewer with Line Numbers -->
                        <div class="flex-1 overflow-y-auto">
                            <div class="flex">
                                <!-- Line Numbers -->
                                <div
                                    class="flex-shrink-0 bg-gray-50 dark:bg-gray-900 px-4 py-4 text-right select-none"
                                >
                                    <div
                                        v-for="line in contentLines"
                                        :key="line.number"
                                        class="text-sm text-gray-500 dark:text-gray-400 font-mono leading-6 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                                        :class="{
                                            'bg-blue-50 dark:bg-blue-900/20': line.hasComment,
                                        }"
                                        @click="handleLineClick(line.number)"
                                    >
                                        {{ line.number }}
                                    </div>
                                </div>

                                <!-- Code Content -->
                                <div class="flex-1 px-4 py-4 overflow-x-auto">
                                    <div
                                        v-for="line in contentLines"
                                        :key="line.number"
                                        class="relative group"
                                    >
                                        <!-- Code Line -->
                                        <pre
                                            class="text-sm font-mono leading-6 text-gray-900 dark:text-white whitespace-pre hover:bg-gray-50 dark:hover:bg-gray-700/50 px-2 -mx-2 rounded cursor-pointer"
                                            :class="{
                                                'bg-yellow-50 dark:bg-yellow-900/20':
                                                    selectedLine === line.number,
                                                'bg-blue-50 dark:bg-blue-900/20': line.hasComment,
                                            }"
                                            @click="handleLineClick(line.number)"
                                            >{{ line.text }}</pre
                                        >

                                        <!-- Inline Comments for this line -->
                                        <div v-if="line.hasComment" class="ml-4 mt-1 space-y-2">
                                            <div
                                                v-for="comment in getCommentsForLine(line.number)"
                                                :key="comment.id"
                                                class="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-600 rounded"
                                            >
                                                <div class="flex-1">
                                                    <div
                                                        class="flex items-center justify-between mb-1"
                                                    >
                                                        <span
                                                            class="text-xs font-medium text-gray-900 dark:text-white"
                                                        >
                                                            {{ comment.author }}
                                                        </span>
                                                        <span class="text-xs text-gray-500">
                                                            {{ formatDate(comment.timestamp) }}
                                                        </span>
                                                    </div>
                                                    <p
                                                        class="text-sm text-gray-700 dark:text-gray-300"
                                                    >
                                                        {{ comment.text }}
                                                    </p>
                                                </div>
                                                <button
                                                    class="flex-shrink-0 text-gray-400 hover:text-red-500"
                                                    @click="removeInlineComment(comment.id)"
                                                >
                                                    <svg
                                                        class="w-4 h-4"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            stroke-linecap="round"
                                                            stroke-linejoin="round"
                                                            stroke-width="2"
                                                            d="M6 18L18 6M6 6l12 12"
                                                        />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>

                                        <!-- Comment Input (shown when line is selected) -->
                                        <div
                                            v-if="showCommentInput && selectedLine === line.number"
                                            class="ml-4 mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded"
                                        >
                                            <textarea
                                                v-model="newCommentText"
                                                rows="2"
                                                class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                placeholder="이 라인에 대한 수정 사항을 입력하세요..."
                                                @keydown.enter.meta="addInlineComment"
                                                @keydown.enter.ctrl="addInlineComment"
                                            />
                                            <div class="flex gap-2 mt-2">
                                                <button
                                                    class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                                                    @click="addInlineComment"
                                                >
                                                    추가
                                                </button>
                                                <button
                                                    class="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                                                    @click="
                                                        showCommentInput = false;
                                                        selectedLine = null;
                                                    "
                                                >
                                                    취소
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Modification Prompt Section -->
                        <div
                            class="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900"
                        >
                            <label
                                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                            >
                                전체 수정 요청 프롬프트
                            </label>
                            <textarea
                                v-model="modificationPrompt"
                                rows="3"
                                class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                placeholder="결과물 전체에 대한 수정 요청사항을 입력하세요..."
                            />
                            <div
                                class="flex items-center justify-between mt-2 text-xs text-gray-500"
                            >
                                <span> 인라인 코멘트 {{ inlineComments.length }}개 </span>
                                <span> Cmd+Enter 또는 Ctrl+Enter로 빠르게 입력 </span>
                            </div>
                        </div>
                    </div>

                    <!-- Footer Actions -->
                    <div
                        class="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 px-6 py-4"
                    >
                        <div class="flex items-center justify-between gap-4">
                            <div class="flex gap-2">
                                <button
                                    class="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium flex items-center gap-2"
                                    :disabled="!modificationPrompt && inlineComments.length === 0"
                                    @click="handleRetry"
                                >
                                    <svg
                                        class="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                        />
                                    </svg>
                                    재시도 ({{
                                        inlineComments.length + (modificationPrompt ? 1 : 0)
                                    }}개 수정사항)
                                </button>

                                <button
                                    v-if="task?.status === 'in_review'"
                                    class="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium flex items-center gap-2"
                                    @click="handleApprove"
                                >
                                    <svg
                                        class="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M5 13l4 4L19 7"
                                        />
                                    </svg>
                                    승인 (Done으로 이동)
                                </button>
                            </div>

                            <button
                                class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                @click="handleClose"
                            >
                                닫기
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Smooth transitions */
.transform {
    transition: transform 0.3s ease-in-out;
}

/* Custom scrollbar */
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

.overflow-x-auto::-webkit-scrollbar {
    height: 6px;
}

.overflow-x-auto::-webkit-scrollbar-track {
    background: transparent;
}

.overflow-x-auto::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
}

.dark .overflow-x-auto::-webkit-scrollbar-thumb {
    background: #475569;
}
</style>
