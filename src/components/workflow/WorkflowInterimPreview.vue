<script setup lang="ts">
/**
 * Workflow Interim Preview
 *
 * Allows users to pause a running workflow and preview current results.
 * Shows progress so far, completed task outputs, and preview of generated files.
 */

import { ref, computed, watch } from 'vue';
import {
  workflowProgressService,
  type WorkflowProgressState,
} from '../../services/realtime/WorkflowProgressService';

// ========================================
// Types
// ========================================

interface TaskResult {
  taskId: number;
  taskTitle?: string;
  status: 'success' | 'failure' | 'partial' | 'skipped';
  output?: string;
  cost?: number;
  duration?: number;
}

interface InterimState {
  isPaused: boolean;
  pausedAt?: Date;
  completedResults: TaskResult[];
  currentProgress: number;
  canResume: boolean;
}

// ========================================
// Props & Emits
// ========================================

const props = defineProps<{
  workflowId: string;
  projectId: number;
  outputPath?: string;
}>();

const emit = defineEmits<{
  (e: 'pause'): void;
  (e: 'resume'): void;
  (e: 'cancel'): void;
  (e: 'open-preview', path: string): void;
}>();

// ========================================
// State
// ========================================

const progress = ref<WorkflowProgressState | null>(null);
const interimState = ref<InterimState>({
  isPaused: false,
  completedResults: [],
  currentProgress: 0,
  canResume: true,
});
const showPreviewModal = ref(false);
const previewContent = ref<string>('');
const selectedResult = ref<TaskResult | null>(null);

// ========================================
// Computed
// ========================================

const isRunning = computed(() => progress.value?.status === 'running');
const isPaused = computed(() => progress.value?.status === 'paused' || interimState.value.isPaused);
const canPause = computed(() => isRunning.value && !isPaused.value);
const canResume = computed(() => isPaused.value && interimState.value.canResume);

const completedCount = computed(() => progress.value?.completedTasks || 0);
const totalCount = computed(() => progress.value?.totalTasks || 0);
const progressPercent = computed(() => progress.value?.percentage || 0);

const elapsedTime = computed(() => {
  const ms = progress.value?.elapsedTime || 0;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}분 ${seconds % 60}초`;
  }
  return `${seconds}초`;
});

const estimatedRemaining = computed(() => {
  const eta = progress.value?.eta;
  if (!eta) return null;
  const seconds = Math.floor(eta / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `약 ${minutes}분 ${seconds % 60}초`;
  }
  return `약 ${seconds}초`;
});

// ========================================
// Methods
// ========================================

function handlePause(): void {
  interimState.value.isPaused = true;
  interimState.value.pausedAt = new Date();
  emit('pause');
}

function handleResume(): void {
  interimState.value.isPaused = false;
  emit('resume');
}

function handleCancel(): void {
  if (confirm('워크플로우를 취소하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
    emit('cancel');
  }
}

function openPreview(result: TaskResult): void {
  selectedResult.value = result;
  previewContent.value = result.output || '';
  showPreviewModal.value = true;
}

function closePreview(): void {
  showPreviewModal.value = false;
  selectedResult.value = null;
}

function openOutputFolder(): void {
  if (props.outputPath) {
    emit('open-preview', props.outputPath);
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}분 ${seconds % 60}초`;
}

// ========================================
// Lifecycle
// ========================================

// Subscribe to progress updates
const unsubscribe = workflowProgressService.subscribe(props.workflowId, (state) => {
  progress.value = state;
});

watch(() => props.workflowId, () => {
  unsubscribe.unsubscribe();
  const newSub = workflowProgressService.subscribe(props.workflowId, (state) => {
    progress.value = state;
  });
  // Update unsubscribe reference
  Object.assign(unsubscribe, newSub);
});

// Initial load
progress.value = workflowProgressService.getProgress(props.workflowId) || null;
</script>

<template>
  <div class="workflow-interim-preview bg-gray-800/50 rounded-lg border border-gray-700">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-gray-700">
      <div class="flex items-center space-x-3">
        <div
          class="w-3 h-3 rounded-full"
          :class="{
            'bg-blue-400 animate-pulse': isRunning,
            'bg-yellow-400': isPaused,
            'bg-green-400': progress?.status === 'completed',
            'bg-red-400': progress?.status === 'failed',
          }"
        />
        <h3 class="text-lg font-semibold text-gray-200">
          {{ isPaused ? '일시정지됨' : '실행 중' }}
        </h3>
      </div>

      <div class="flex items-center space-x-2">
        <!-- Pause Button -->
        <button
          v-if="canPause"
          class="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-sm font-medium flex items-center space-x-2 transition-colors"
          @click="handlePause"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
          </svg>
          <span>일시정지</span>
        </button>

        <!-- Resume Button -->
        <button
          v-if="canResume"
          class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium flex items-center space-x-2 transition-colors"
          @click="handleResume"
        >
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
          </svg>
          <span>재개</span>
        </button>

        <!-- Cancel Button -->
        <button
          class="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg text-sm font-medium transition-colors"
          @click="handleCancel"
        >
          취소
        </button>
      </div>
    </div>

    <!-- Progress Section -->
    <div class="p-4 border-b border-gray-700">
      <div class="space-y-3">
        <!-- Progress Bar -->
        <div>
          <div class="flex justify-between text-sm text-gray-400 mb-1">
            <span>진행률</span>
            <span>{{ progressPercent }}%</span>
          </div>
          <div class="w-full bg-gray-700 rounded-full h-3">
            <div
              class="h-3 rounded-full transition-all duration-500"
              :class="isPaused ? 'bg-yellow-500' : 'bg-blue-500'"
              :style="{ width: `${progressPercent}%` }"
            />
          </div>
        </div>

        <!-- Stats Grid -->
        <div class="grid grid-cols-4 gap-3 text-center">
          <div class="bg-gray-900/30 rounded-lg p-2">
            <div class="text-xl font-bold text-blue-400">{{ completedCount }}</div>
            <div class="text-xs text-gray-500">완료</div>
          </div>
          <div class="bg-gray-900/30 rounded-lg p-2">
            <div class="text-xl font-bold text-gray-400">{{ totalCount - completedCount }}</div>
            <div class="text-xs text-gray-500">남은 태스크</div>
          </div>
          <div class="bg-gray-900/30 rounded-lg p-2">
            <div class="text-xl font-bold text-green-400">{{ elapsedTime }}</div>
            <div class="text-xs text-gray-500">경과 시간</div>
          </div>
          <div class="bg-gray-900/30 rounded-lg p-2">
            <div class="text-xl font-bold text-purple-400">{{ estimatedRemaining || '-' }}</div>
            <div class="text-xs text-gray-500">예상 남은 시간</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Interim Preview Section (visible when paused) -->
    <div v-if="isPaused" class="p-4 bg-yellow-900/10 border-b border-yellow-700/30">
      <div class="flex items-center space-x-2 mb-3">
        <svg class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
        </svg>
        <span class="text-yellow-400 font-medium">중간 결과물 확인</span>
      </div>
      <p class="text-sm text-gray-400 mb-4">
        현재까지 {{ completedCount }}개의 태스크가 완료되었습니다. 아래에서 중간 결과물을 확인할 수 있습니다.
      </p>

      <div class="flex space-x-3">
        <button
          v-if="outputPath"
          class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm flex items-center space-x-2"
          @click="openOutputFolder"
        >
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
          </svg>
          <span>출력 폴더 열기</span>
        </button>
      </div>
    </div>

    <!-- Current Task -->
    <div v-if="progress?.currentTask && !isPaused" class="p-4 border-b border-gray-700">
      <div class="text-xs text-gray-500 mb-1">현재 실행 중</div>
      <div class="flex items-center space-x-2">
        <div class="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        <span class="text-gray-200">{{ progress.currentTask.title }}</span>
      </div>
    </div>

    <!-- Completed Results Preview -->
    <div class="p-4">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-medium text-gray-400">완료된 태스크 결과</h4>
        <span class="text-xs text-gray-500">{{ completedCount }}개</span>
      </div>

      <div class="space-y-2 max-h-64 overflow-y-auto">
        <div
          v-for="(result, index) in interimState.completedResults"
          :key="result.taskId"
          class="p-3 bg-gray-900/30 rounded-lg cursor-pointer hover:bg-gray-900/50 transition-colors"
          @click="openPreview(result)"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span
                class="w-2 h-2 rounded-full"
                :class="result.status === 'success' ? 'bg-green-400' : 'bg-red-400'"
              />
              <span class="text-sm text-gray-200">
                {{ result.taskTitle || `태스크 #${index + 1}` }}
              </span>
            </div>
            <div class="flex items-center space-x-2 text-xs text-gray-500">
              <span v-if="result.duration">{{ formatDuration(result.duration) }}</span>
              <span v-if="result.cost">${{ result.cost.toFixed(4) }}</span>
            </div>
          </div>
          <div v-if="result.output" class="mt-2 text-xs text-gray-500 line-clamp-2">
            {{ result.output.slice(0, 100) }}{{ result.output.length > 100 ? '...' : '' }}
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-if="interimState.completedResults.length === 0 && completedCount === 0"
        class="text-center py-8 text-gray-500"
      >
        <svg class="mx-auto h-12 w-12 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p class="mt-2 text-sm">아직 완료된 결과가 없습니다</p>
      </div>
    </div>

    <!-- Preview Modal -->
    <Teleport to="body">
      <div
        v-if="showPreviewModal"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="absolute inset-0 bg-black/70" @click="closePreview" />
        <div class="relative bg-gray-800 rounded-lg w-full max-w-3xl max-h-[80vh] overflow-hidden shadow-xl">
          <div class="flex items-center justify-between p-4 border-b border-gray-700">
            <h3 class="text-lg font-semibold text-gray-200">
              {{ selectedResult?.taskTitle || '결과 미리보기' }}
            </h3>
            <button
              class="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-200"
              @click="closePreview"
            >
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="p-4 max-h-[60vh] overflow-auto">
            <pre class="text-sm text-gray-300 whitespace-pre-wrap font-mono">{{ previewContent }}</pre>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.workflow-interim-preview {
  @apply w-full;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.max-h-64::-webkit-scrollbar {
  width: 6px;
}

.max-h-64::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.max-h-64::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.max-h-64::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
