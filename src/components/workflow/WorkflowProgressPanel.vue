<script setup lang="ts">
/**
 * Workflow Progress Panel
 *
 * Displays real-time progress of workflow execution with detailed metrics
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import {
  workflowProgressService,
  type WorkflowProgressState,
  type ProgressSubscription,
  type CompletionCallback,
} from '../../services/realtime/WorkflowProgressService';

// ========================================
// Props & Emits
// ========================================

const props = defineProps<{
  workflowId?: string;
  showAllActive?: boolean;
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'pause', workflowId: string): void;
  (e: 'resume', workflowId: string): void;
  (e: 'cancel', workflowId: string): void;
  (e: 'complete', result: any): void;
}>();

// ========================================
// State
// ========================================

const progress = ref<WorkflowProgressState | null>(null);
const allProgress = ref<WorkflowProgressState[]>([]);
const subscription = ref<ProgressSubscription | null>(null);
const completionSubscription = ref<ProgressSubscription | null>(null);

// ========================================
// Computed
// ========================================

const displayProgress = computed(() => {
  if (props.showAllActive) {
    return allProgress.value;
  }
  return progress.value ? [progress.value] : [];
});

const hasActiveWorkflows = computed(() => displayProgress.value.length > 0);

// ========================================
// Methods
// ========================================

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function getStatusColor(status: WorkflowProgressState['status']): string {
  switch (status) {
    case 'running':
      return 'text-blue-400';
    case 'paused':
      return 'text-yellow-400';
    case 'completed':
      return 'text-green-400';
    case 'failed':
      return 'text-red-400';
    case 'cancelled':
      return 'text-gray-400';
    default:
      return 'text-gray-400';
  }
}

function getProgressBarColor(status: WorkflowProgressState['status']): string {
  switch (status) {
    case 'running':
      return 'bg-blue-500';
    case 'paused':
      return 'bg-yellow-500';
    case 'completed':
      return 'bg-green-500';
    case 'failed':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}

function handlePause(workflowId: string): void {
  emit('pause', workflowId);
}

function handleResume(workflowId: string): void {
  emit('resume', workflowId);
}

function handleCancel(workflowId: string): void {
  if (confirm('Are you sure you want to cancel this workflow?')) {
    emit('cancel', workflowId);
  }
}

// ========================================
// Lifecycle
// ========================================

function setupSubscriptions(): void {
  // Cleanup existing subscriptions
  subscription.value?.unsubscribe();
  completionSubscription.value?.unsubscribe();

  if (props.showAllActive) {
    // Subscribe to all workflows
    subscription.value = workflowProgressService.subscribeAll((state: WorkflowProgressState) => {
      const index = allProgress.value.findIndex((p: WorkflowProgressState) => p.workflowId === state.workflowId);
      if (index >= 0) {
        allProgress.value[index] = state;
      } else {
        allProgress.value.push(state);
      }
    });

    const onComplete: CompletionCallback = (result) => {
      // Remove completed workflow from active list after a delay
      setTimeout(() => {
        allProgress.value = allProgress.value.filter(
          (p: WorkflowProgressState) => p.workflowId !== result.workflowId
        );
      }, 5000);
      emit('complete', result);
    };
    completionSubscription.value = workflowProgressService.onAnyComplete(onComplete);

    // Initial load
    allProgress.value = workflowProgressService.getAllProgress();
  } else if (props.workflowId) {
    // Subscribe to specific workflow
    subscription.value = workflowProgressService.subscribe(
      props.workflowId,
      (state: WorkflowProgressState) => {
        progress.value = state;
      }
    );

    const onComplete: CompletionCallback = (result) => {
      emit('complete', result);
    };
    completionSubscription.value = workflowProgressService.onComplete(
      props.workflowId,
      onComplete
    );

    // Initial load
    progress.value = workflowProgressService.getProgress(props.workflowId) || null;
  }
}

onMounted(() => {
  setupSubscriptions();
});

onUnmounted(() => {
  subscription.value?.unsubscribe();
  completionSubscription.value?.unsubscribe();
});

watch(() => props.workflowId, () => {
  setupSubscriptions();
});
</script>

<template>
  <div class="workflow-progress-panel">
    <!-- Empty State -->
    <div
      v-if="!hasActiveWorkflows"
      class="text-center py-8 text-gray-500"
    >
      <svg
        class="mx-auto h-12 w-12 text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <p class="mt-2 text-sm">No active workflows</p>
    </div>

    <!-- Progress Cards -->
    <div
      v-else
      class="space-y-4"
    >
      <div
        v-for="state in displayProgress"
        :key="state.workflowId"
        class="bg-gray-800/50 rounded-lg p-4 border border-gray-700"
      >
        <!-- Header -->
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center space-x-2">
            <div
              class="w-2 h-2 rounded-full animate-pulse"
              :class="state.status === 'running' ? 'bg-blue-400' : 'bg-gray-400'"
            />
            <span class="font-medium text-gray-200">
              Workflow {{ state.workflowId.slice(0, 8) }}...
            </span>
            <span
              class="text-xs px-2 py-0.5 rounded-full bg-gray-700"
              :class="getStatusColor(state.status)"
            >
              {{ state.status }}
            </span>
          </div>

          <!-- Actions -->
          <div class="flex items-center space-x-2">
            <button
              v-if="state.status === 'running'"
              @click="handlePause(state.workflowId)"
              class="p-1 hover:bg-gray-700 rounded text-yellow-400"
              title="Pause"
            >
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
            <button
              v-if="state.status === 'paused'"
              @click="handleResume(state.workflowId)"
              class="p-1 hover:bg-gray-700 rounded text-green-400"
              title="Resume"
            >
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
            <button
              v-if="state.status === 'running' || state.status === 'paused'"
              @click="handleCancel(state.workflowId)"
              class="p-1 hover:bg-gray-700 rounded text-red-400"
              title="Cancel"
            >
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="mb-3">
          <div class="flex justify-between text-xs text-gray-400 mb-1">
            <span>Progress</span>
            <span>{{ state.percentage }}%</span>
          </div>
          <div class="w-full bg-gray-700 rounded-full h-2">
            <div
              class="h-2 rounded-full transition-all duration-300"
              :class="getProgressBarColor(state.status)"
              :style="{ width: `${state.percentage}%` }"
            />
          </div>
        </div>

        <!-- Current Task -->
        <div
          v-if="state.currentTask && !compact"
          class="mb-3 p-2 bg-gray-900/50 rounded text-sm"
        >
          <div class="flex items-center space-x-2">
            <div
              v-if="state.currentTask.status === 'executing' || state.currentTask.status === 'streaming'"
              class="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"
            />
            <span class="text-gray-300 truncate">
              {{ state.currentTask.title }}
            </span>
          </div>
        </div>

        <!-- Stats -->
        <div
          v-if="!compact"
          class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm"
        >
          <div>
            <div class="text-gray-500 text-xs">Tasks</div>
            <div class="text-gray-300">
              {{ state.completedTasks }}/{{ state.totalTasks }}
              <span v-if="state.failedTasks > 0" class="text-red-400">
                ({{ state.failedTasks }} failed)
              </span>
            </div>
          </div>
          <div>
            <div class="text-gray-500 text-xs">Stage</div>
            <div class="text-gray-300">
              {{ state.currentStage }}/{{ state.totalStages }}
            </div>
          </div>
          <div>
            <div class="text-gray-500 text-xs">Elapsed</div>
            <div class="text-gray-300">
              {{ formatDuration(state.elapsedTime) }}
            </div>
          </div>
          <div>
            <div class="text-gray-500 text-xs">Cost</div>
            <div class="text-gray-300">
              {{ formatCost(state.totalCost) }}
            </div>
          </div>
        </div>

        <!-- Compact Stats -->
        <div
          v-else
          class="flex items-center justify-between text-xs text-gray-400"
        >
          <span>{{ state.completedTasks }}/{{ state.totalTasks }} tasks</span>
          <span>{{ formatDuration(state.elapsedTime) }}</span>
        </div>

        <!-- ETA -->
        <div
          v-if="state.eta && state.status === 'running' && !compact"
          class="mt-2 text-xs text-gray-500"
        >
          Estimated time remaining: {{ formatDuration(state.eta) }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workflow-progress-panel {
  @apply w-full;
}
</style>
