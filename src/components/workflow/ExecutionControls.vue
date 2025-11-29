<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  isExecuting: boolean;
  isPaused?: boolean;
  canPause?: boolean;
  canResume?: boolean;
  canCancel?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isPaused: false,
  canPause: true,
  canResume: true,
  canCancel: true,
});

const emit = defineEmits<{
  (e: 'pause'): void;
  (e: 'resume'): void;
  (e: 'cancel'): void;
  (e: 'execute'): void;
}>();

const statusText = computed(() => {
  if (props.isPaused) return '일시정지됨';
  if (props.isExecuting) return '실행 중';
  return '대기 중';
});

const statusColor = computed(() => {
  if (props.isPaused) return 'text-yellow-600 dark:text-yellow-400';
  if (props.isExecuting) return 'text-green-600 dark:text-green-400';
  return 'text-gray-600 dark:text-gray-400';
});
</script>

<template>
  <div class="flex items-center gap-3">
    <!-- Status Indicator -->
    <div class="flex items-center gap-2">
      <div
        class="w-3 h-3 rounded-full"
        :class="{
          'bg-green-500 animate-pulse': isExecuting && !isPaused,
          'bg-yellow-500': isPaused,
          'bg-gray-400': !isExecuting,
        }"
      />
      <span class="text-sm font-medium" :class="statusColor">
        {{ statusText }}
      </span>
    </div>

    <!-- Control Buttons -->
    <div class="flex items-center gap-2">
      <!-- Execute Button -->
      <button
        v-if="!isExecuting"
        class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        @click="emit('execute')"
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
        </svg>
        실행
      </button>

      <!-- Pause Button -->
      <button
        v-if="isExecuting && !isPaused && canPause"
        class="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        @click="emit('pause')"
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
        </svg>
        일시정지
      </button>

      <!-- Resume Button -->
      <button
        v-if="isPaused && canResume"
        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        @click="emit('resume')"
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
        </svg>
        재개
      </button>

      <!-- Cancel Button -->
      <button
        v-if="(isExecuting || isPaused) && canCancel"
        class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
        @click="emit('cancel')"
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
        </svg>
        취소
      </button>
    </div>
  </div>
</template>
