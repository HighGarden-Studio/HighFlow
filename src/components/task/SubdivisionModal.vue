<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Task } from '../../core/types/database';
import { taskSubdivisionService } from '../../services/ai/TaskSubdivisionService';

interface Props {
    task: Task;
    isOpen: boolean;
}

interface SubtaskTemplate {
    title: string;
    description: string;
    estimatedMinutes: number | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'subdivide', subtasks: SubtaskTemplate[]): void;
}>();

const isLoadingAI = ref(false);
const aiReasoning = ref('');
const subtaskCount = ref(3);
const subtasks = ref<SubtaskTemplate[]>([
    { title: '', description: '', estimatedMinutes: null },
    { title: '', description: '', estimatedMinutes: null },
    { title: '', description: '', estimatedMinutes: null },
]);

// 모달이 열릴 때 AI 제안 자동 로드
watch(
    () => props.isOpen,
    async (newValue) => {
        if (newValue) {
            await loadAISuggestions();
        }
    }
);

/**
 * AI 세분화 제안 로드
 */
async function loadAISuggestions() {
    if (!props.task) return;

    isLoadingAI.value = true;
    aiReasoning.value = '';

    try {
        const suggestion = await taskSubdivisionService.suggestSubdivision(props.task);

        // AI 제안을 subtasks에 반영
        subtasks.value = suggestion.subtasks.map((st) => ({
            title: st.title,
            description: st.description,
            estimatedMinutes: st.estimatedMinutes,
        }));

        subtaskCount.value = suggestion.subtasks.length;
        aiReasoning.value = suggestion.reasoning;
    } catch (error) {
        console.error('AI 제안 로드 실패:', error);
        // 에러 시 기본 빈 폼 유지
    } finally {
        isLoadingAI.value = false;
    }
}

const isValid = computed(() => {
    return subtasks.value.every((st) => st.title.trim().length > 0);
});

function addSubtask() {
    subtasks.value.push({ title: '', description: '', estimatedMinutes: null });
    subtaskCount.value++;
}

function removeSubtask(index: number) {
    if (subtasks.value.length > 1) {
        subtasks.value.splice(index, 1);
        subtaskCount.value--;
    }
}

function handleSubdivide() {
    if (!isValid.value) return;
    emit('subdivide', subtasks.value);
    handleClose();
}

function handleClose() {
    // Reset form
    subtaskCount.value = 3;
    subtasks.value = [
        { title: '', description: '', estimatedMinutes: null },
        { title: '', description: '', estimatedMinutes: null },
        { title: '', description: '', estimatedMinutes: null },
    ];
    emit('close');
}
</script>

<template>
    <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        @click.self="handleClose"
    >
        <div
            class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
        >
            <!-- Header -->
            <div
                class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700"
            >
                <div>
                    <h2 class="text-2xl font-bold text-gray-900 dark:text-white">테스크 세분화</h2>
                    <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        "{{ task.title }}" 테스크를 서브테스크로 나누기
                    </p>
                </div>
                <button
                    class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    @click="handleClose"
                >
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-y-auto p-6">
                <!-- AI 로딩 상태 -->
                <div v-if="isLoadingAI" class="flex flex-col items-center justify-center py-12">
                    <div
                        class="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"
                    ></div>
                    <p class="text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                        AI가 최적의 세분화 방안을 분석하고 있습니다...
                    </p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                        작업의 목적과 범위를 고려하여 제안을 생성 중입니다
                    </p>
                </div>

                <!-- AI 제안 이유 (로딩 완료 후) -->
                <div
                    v-if="!isLoadingAI && aiReasoning"
                    class="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
                >
                    <div class="flex gap-3">
                        <div class="flex-shrink-0">
                            <svg
                                class="w-6 h-6 text-blue-600 dark:text-blue-400"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                            >
                                <path
                                    d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"
                                />
                            </svg>
                        </div>
                        <div class="flex-1">
                            <h4 class="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                                AI 분석 결과
                            </h4>
                            <p class="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
                                {{ aiReasoning }}
                            </p>
                        </div>
                    </div>
                </div>

                <div v-if="!isLoadingAI" class="space-y-4">
                    <div
                        v-for="(subtask, index) in subtasks"
                        :key="index"
                        class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
                    >
                        <div class="flex items-start justify-between mb-3">
                            <div class="flex items-center gap-2">
                                <div
                                    class="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center"
                                >
                                    <span
                                        class="text-sm font-semibold text-blue-600 dark:text-blue-300"
                                    >
                                        {{ index + 1 }}
                                    </span>
                                </div>
                                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    서브테스크 {{ index + 1 }}
                                </span>
                            </div>
                            <button
                                v-if="subtasks.length > 1"
                                class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                                @click="removeSubtask(index)"
                            >
                                <svg
                                    class="w-5 h-5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                </svg>
                            </button>
                        </div>

                        <div class="space-y-3">
                            <!-- Title -->
                            <div>
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                >
                                    제목 <span class="text-red-500">*</span>
                                </label>
                                <input
                                    v-model="subtask.title"
                                    type="text"
                                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                    placeholder="서브테스크 제목을 입력하세요"
                                />
                            </div>

                            <!-- Description -->
                            <div>
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                >
                                    설명
                                </label>
                                <textarea
                                    v-model="subtask.description"
                                    rows="2"
                                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white resize-none"
                                    placeholder="서브테스크 설명 (선택사항)"
                                />
                            </div>

                            <!-- Estimated Time -->
                            <div>
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                                >
                                    예상 시간 (분)
                                </label>
                                <input
                                    v-model.number="subtask.estimatedMinutes"
                                    type="number"
                                    min="0"
                                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                    placeholder="예: 30"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Add Subtask Button -->
                <button
                    class="mt-4 w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-400 hover:border-blue-500 hover:text-blue-500 dark:hover:border-blue-400 dark:hover:text-blue-400 transition-colors flex items-center justify-center gap-2"
                    @click="addSubtask"
                >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                        />
                    </svg>
                    서브테스크 추가
                </button>

                <!-- Info Box -->
                <div
                    v-if="!isLoadingAI"
                    class="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
                >
                    <div class="flex gap-3">
                        <svg
                            class="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                clip-rule="evenodd"
                            />
                        </svg>
                        <div class="text-sm text-blue-800 dark:text-blue-200">
                            <p class="font-medium mb-1">AI 제안 내용 수정 가능:</p>
                            <ul class="list-disc list-inside space-y-1">
                                <li>제안된 서브테스크는 자유롭게 수정, 추가, 삭제할 수 있습니다</li>
                                <li>
                                    상위 테스크는 실행이 비활성화되고 그룹핑 용도로만 사용됩니다
                                </li>
                                <li>서브테스크는 세분화를 제외한 모든 기능을 사용할 수 있습니다</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div
                class="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700"
            >
                <button
                    class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    @click="handleClose"
                >
                    취소
                </button>
                <button
                    class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    :disabled="!isValid"
                    @click="handleSubdivide"
                >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                        />
                    </svg>
                    세분화 실행 ({{ subtasks.length }}개)
                </button>
            </div>
        </div>
    </div>
</template>
