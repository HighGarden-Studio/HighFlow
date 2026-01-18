<script setup lang="ts">
/**
 * Execution Plan Preview Component
 *
 * Modal for previewing AI-generated execution plan before creating tasks
 */

import { computed, ref } from 'vue';
import type { EnhancedExecutionPlan } from '../../services/ai/AIInterviewService';
import TaskPlanCard from './TaskPlanCard.vue';

interface Props {
    plan: EnhancedExecutionPlan;
    loading?: boolean;
}

interface Emits {
    (e: 'create'): void;
    (e: 'cancel'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const activeTab = ref<'plan' | 'interview'>('plan');

// Calculate task count by milestone
const milestoneTaskCounts = computed(() => {
    return props.plan.suggestedMilestones.map((milestone) => ({
        ...milestone,
        taskCount: milestone.taskIndices.length,
    }));
});
</script>

<template>
    <Teleport to="body">
        <div
            class="modal-overlay fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        >
            <div
                class="modal-content bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            >
                <!-- Header -->
                <div class="header px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div class="flex items-start justify-between">
                        <div class="flex-1">
                            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                {{ plan.projectTitle }}
                            </h2>
                            <p class="text-gray-600 dark:text-gray-400">
                                {{ plan.projectSummary }}
                            </p>
                        </div>
                        <button
                            class="ml-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            @click="emit('cancel')"
                        >
                            <svg
                                class="w-6 h-6"
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

                <!-- Tabs -->
                <div class="px-6 border-b border-gray-200 dark:border-gray-700">
                    <div class="flex gap-6">
                        <button
                            class="py-3 text-sm font-medium border-b-2 transition-colors"
                            :class="
                                activeTab === 'plan'
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            "
                            @click="activeTab = 'plan'"
                        >
                            실행 계획
                        </button>
                        <button
                            class="py-3 text-sm font-medium border-b-2 transition-colors"
                            :class="
                                activeTab === 'interview'
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                            "
                            @click="activeTab = 'interview'"
                        >
                            인터뷰 원본
                        </button>
                    </div>
                </div>

                <!-- Content -->
                <div class="flex-1 overflow-y-auto px-6 py-4">
                    <div v-if="activeTab === 'plan'">
                        <!-- Architecture -->
                        <div class="architecture mb-6">
                            <h3
                                class="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2"
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
                                        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                                    />
                                </svg>
                                아키텍처
                            </h3>
                            <p
                                class="text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4"
                            >
                                {{ plan.architecture }}
                            </p>
                        </div>

                        <!-- Tasks -->
                        <div class="tasks mb-6">
                            <h3
                                class="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2"
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
                                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                    />
                                </svg>
                                태스크 목록 ({{ plan.tasks.length }}개)
                            </h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <TaskPlanCard
                                    v-for="(task, index) in plan.tasks"
                                    :key="index"
                                    :task="task"
                                    :index="index"
                                />
                            </div>
                        </div>

                        <!-- Milestones -->
                        <div v-if="plan.suggestedMilestones.length > 0" class="milestones mb-6">
                            <h3
                                class="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2"
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
                                        d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                                    />
                                </svg>
                                마일스톤
                            </h3>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div
                                    v-for="(milestone, index) in milestoneTaskCounts"
                                    :key="index"
                                    class="p-4 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg border border-blue-200 dark:border-blue-700"
                                >
                                    <div class="flex items-center justify-between mb-2">
                                        <h4 class="font-semibold text-gray-900 dark:text-white">
                                            {{ milestone.name }}
                                        </h4>
                                        <span class="text-xs text-gray-500 dark:text-gray-400">
                                            {{ milestone.taskCount }}개 태스크
                                        </span>
                                    </div>
                                    <p class="text-sm text-gray-600 dark:text-gray-400">
                                        예상 완료: {{ milestone.estimatedCompletion }}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Summary -->
                        <div
                            class="summary bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-700"
                        >
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                                <div>
                                    <div
                                        class="text-2xl font-bold text-indigo-600 dark:text-indigo-400"
                                    >
                                        {{ plan.tasks.length }}
                                    </div>
                                    <div class="text-sm text-gray-600 dark:text-gray-400">
                                        총 태스크
                                    </div>
                                </div>
                                <div>
                                    <div
                                        class="text-2xl font-bold text-blue-600 dark:text-blue-400"
                                    >
                                        {{ plan.totalEstimatedHours }}h
                                    </div>
                                    <div class="text-sm text-gray-600 dark:text-gray-400">
                                        예상 소요 시간
                                    </div>
                                </div>
                                <div>
                                    <div
                                        class="text-2xl font-bold text-purple-600 dark:text-purple-400"
                                    >
                                        {{ plan.suggestedMilestones.length }}
                                    </div>
                                    <div class="text-sm text-gray-600 dark:text-gray-400">
                                        마일스톤
                                    </div>
                                </div>
                                <div>
                                    <div
                                        class="text-2xl font-bold text-green-600 dark:text-green-400"
                                    >
                                        {{ Math.ceil(plan.totalEstimatedHours / 8) }}
                                    </div>
                                    <div class="text-sm text-gray-600 dark:text-gray-400">
                                        예상 작업일
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-else class="space-y-6">
                        <div class="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4">
                            <h3 class="font-semibold text-gray-900 dark:text-white mb-2">
                                초기 아이디어
                            </h3>
                            <p class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                {{ plan.originalIdea }}
                            </p>
                        </div>

                        <div
                            v-if="plan.interviewAnswers && plan.interviewAnswers.length > 0"
                            class="space-y-4"
                        >
                            <h3 class="font-semibold text-gray-900 dark:text-white">인터뷰 내용</h3>
                            <div
                                v-for="(qa, idx) in plan.interviewAnswers"
                                :key="idx"
                                class="border-l-2 border-blue-200 dark:border-blue-800 pl-4 py-1"
                            >
                                <p
                                    class="text-sm text-blue-600 dark:text-blue-400 font-medium mb-1"
                                >
                                    Q. {{ qa.question }}
                                </p>
                                <p class="text-gray-700 dark:text-gray-300">{{ qa.answer }}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer Actions -->
                <div
                    class="footer px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
                >
                    <div class="flex items-center justify-between">
                        <p class="text-sm text-gray-600 dark:text-gray-400">
                            태스크를 생성하면 Kanban 보드에 추가되며 의존성에 따라 자동으로
                            실행됩니다.
                        </p>
                        <div class="flex gap-3">
                            <button
                                class="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                                @click="emit('cancel')"
                            >
                                취소
                            </button>
                            <button
                                :disabled="loading"
                                class="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                @click="emit('create')"
                            >
                                <svg
                                    v-if="loading"
                                    class="animate-spin h-5 w-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        class="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        stroke-width="4"
                                    />
                                    <path
                                        class="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                </svg>
                                <span>{{ loading ? '생성 중...' : '태스크 생성' }}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.modal-overlay {
    animation: fadeIn 0.2s ease;
}

.modal-content {
    animation: slideUp 0.3s ease;
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

@keyframes slideUp {
    from {
        opacity: 0;
        transform: translateY(20px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>
