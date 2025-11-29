<script setup lang="ts">
import { computed } from 'vue';
import type { Progress } from '../../services/workflow/types';

interface Props {
  progress: Progress | null;
  showDetails?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showDetails: true,
});

const progressColor = computed(() => {
  if (!props.progress) return 'bg-gray-400';

  const percentage = props.progress.percentage;
  if (percentage < 25) return 'bg-red-500';
  if (percentage < 50) return 'bg-yellow-500';
  if (percentage < 75) return 'bg-blue-500';
  return 'bg-green-500';
});

const formattedETA = computed(() => {
  if (!props.progress?.eta) return null;

  const seconds = Math.floor(props.progress.eta / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}시간 ${minutes % 60}분`;
  } else if (minutes > 0) {
    return `${minutes}분`;
  } else {
    return `${seconds}초`;
  }
});

const formattedElapsedTime = computed(() => {
  if (!props.progress?.elapsedTime) return '0초';

  const seconds = Math.floor(props.progress.elapsedTime / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}시간 ${minutes % 60}분`;
  } else if (minutes > 0) {
    return `${minutes}분`;
  } else {
    return `${seconds}초`;
  }
});
</script>

<template>
  <div v-if="progress" class="w-full">
    <!-- Progress Bar -->
    <div class="relative">
      <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full transition-all duration-300 ease-out"
          :class="progressColor"
          :style="{ width: `${progress.percentage}%` }"
        >
          <div class="h-full animate-pulse bg-white/20" />
        </div>
      </div>

      <!-- Percentage Label -->
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="text-xs font-bold text-gray-700 dark:text-gray-300 mix-blend-difference">
          {{ Math.round(progress.percentage) }}%
        </span>
      </div>
    </div>

    <!-- Details -->
    <div v-if="showDetails" class="mt-3 space-y-2">
      <!-- Current Task -->
      <div v-if="progress.currentTaskName" class="text-sm text-gray-700 dark:text-gray-300">
        <span class="font-semibold">현재 작업:</span>
        {{ progress.currentTaskName }}
      </div>

      <!-- Stats Grid -->
      <div class="grid grid-cols-2 gap-3 text-sm">
        <!-- Stage Progress -->
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" />
          </svg>
          <span class="text-gray-600 dark:text-gray-400">
            Stage {{ progress.currentStage }}/{{ progress.totalStages }}
          </span>
        </div>

        <!-- Task Progress -->
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
          <span class="text-gray-600 dark:text-gray-400">
            {{ progress.completedTasks }}/{{ progress.totalTasks }} 완료
          </span>
        </div>

        <!-- Elapsed Time -->
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" />
          </svg>
          <span class="text-gray-600 dark:text-gray-400">
            경과: {{ formattedElapsedTime }}
          </span>
        </div>

        <!-- ETA -->
        <div v-if="formattedETA" class="flex items-center gap-2">
          <svg class="w-4 h-4 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" />
          </svg>
          <span class="text-gray-600 dark:text-gray-400">
            남은 시간: {{ formattedETA }}
          </span>
        </div>
      </div>

      <!-- Failed Tasks -->
      <div v-if="progress.failedTasks > 0" class="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
        </svg>
        <span>{{ progress.failedTasks }}개 작업 실패</span>
      </div>
    </div>
  </div>

  <!-- Empty State -->
  <div v-else class="text-center py-8 text-gray-500 dark:text-gray-400">
    <svg class="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
    <p class="text-sm">진행 정보 없음</p>
  </div>
</template>
