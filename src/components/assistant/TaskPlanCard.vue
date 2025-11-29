<script setup lang="ts">
/**
 * Task Plan Card Component
 *
 * Displays individual task plan in a card format with metadata
 */

import { computed } from 'vue';
import type { DetailedTaskPlan } from '../../services/ai/AIInterviewService';

interface Props {
    task: DetailedTaskPlan;
    index: number;
}

const props = defineProps<Props>();

// Priority colors
const priorityColors = {
    urgent: 'bg-red-100 dark:bg-red-900/30 border-red-500',
    high: 'bg-orange-100 dark:bg-orange-900/30 border-orange-500',
    medium: 'bg-blue-100 dark:bg-blue-900/30 border-blue-500',
    low: 'bg-gray-100 dark:bg-gray-700 border-gray-400',
};

const priorityColor = computed(() => priorityColors[props.task.priority]);

// Format duration
const formattedDuration = computed(() => {
    const hours = Math.floor(props.task.estimatedMinutes / 60);
    const minutes = props.task.estimatedMinutes % 60;
    if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
});
</script>

<template>
    <div
        :class="[
            'task-plan-card p-4 rounded-lg border-2 transition-all hover:shadow-lg',
            priorityColor,
        ]"
    >
        <!-- Header -->
        <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-2">
                <span class="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    #{{ task.executionOrder }}
                </span>
                <h3 class="font-semibold text-gray-900 dark:text-white">
                    {{ task.title }}
                </h3>
            </div>
            <span
                :class="[
                    'px-2 py-1 text-xs font-medium rounded',
                    task.priority === 'urgent'
                        ? 'bg-red-500 text-white'
                        : task.priority === 'high'
                          ? 'bg-orange-500 text-white'
                          : task.priority === 'medium'
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-500 text-white',
                ]"
            >
                {{ task.priority }}
            </span>
        </div>

        <!-- Description -->
        <p class="text-sm text-gray-700 dark:text-gray-300 mb-3 line-clamp-2">
            {{ task.description }}
        </p>

        <!-- Metadata Grid -->
        <div class="space-y-2 text-xs">
            <!-- Duration -->
            <div class="flex items-center gap-2">
                <svg
                    class="w-4 h-4 text-gray-500"
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
                <span class="text-gray-600 dark:text-gray-400">{{ formattedDuration }}</span>
            </div>

            <!-- Dependencies -->
            <div v-if="task.dependencies.length > 0" class="flex items-center gap-2">
                <svg
                    class="w-4 h-4 text-gray-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                </svg>
                <span class="text-gray-600 dark:text-gray-400">
                    Depends on: #{{ task.dependencies && task.dependencies.length && task.dependencies.join(', #') }}
                </span>
            </div>

            <!-- Output Format -->
            <div class="flex items-center gap-2">
                <svg
                    class="w-4 h-4 text-gray-500"
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
                <span class="text-gray-600 dark:text-gray-400">{{
                    task.expectedOutputFormat
                }}</span>
            </div>

            <!-- Recommended Providers -->
            <div v-if="task.recommendedProviders.length > 0" class="flex items-start gap-2">
                <svg
                    class="w-4 h-4 text-gray-500 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                </svg>
                <div class="flex flex-wrap gap-1">
                    <span
                        v-for="provider in task.recommendedProviders.slice(0, 2)"
                        :key="provider"
                        class="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded"
                    >
                        {{ provider }}
                    </span>
                </div>
            </div>

            <!-- Required MCPs -->
            <div v-if="task.requiredMCPs.length > 0" class="flex items-start gap-2">
                <svg
                    class="w-4 h-4 text-gray-500 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                </svg>
                <div class="flex flex-wrap gap-1">
                    <span
                        v-for="mcp in task.requiredMCPs"
                        :key="mcp"
                        class="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded"
                    >
                        {{ mcp }}
                    </span>
                </div>
            </div>

            <!-- Tags -->
            <div v-if="task.tags.length > 0" class="flex items-start gap-2">
                <svg
                    class="w-4 h-4 text-gray-500 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                    />
                </svg>
                <div class="flex flex-wrap gap-1">
                    <span
                        v-for="tag in task.tags"
                        :key="tag"
                        class="px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded"
                    >
                        {{ tag }}
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.task-plan-card {
    transition: transform 0.2s ease;
}

.task-plan-card:hover {
    transform: translateY(-2px);
}

.line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
</style>
