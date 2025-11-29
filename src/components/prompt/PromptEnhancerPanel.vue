<script setup lang="ts">
/**
 * Prompt Enhancer Panel
 *
 * UI for analyzing and enhancing prompts with AI-powered suggestions.
 */

import { ref, computed, watch } from 'vue';
import {
  promptEnhancementService,
  type PromptAnalysis,
  type EnhancementResult,
  type EnhancementOptions,
} from '../../services/prompt/PromptEnhancementService';

// ========================================
// Props & Emits
// ========================================

const props = defineProps<{
  initialPrompt?: string;
  taskId?: number;
}>();

const emit = defineEmits<{
  (e: 'apply', prompt: string): void;
  (e: 'close'): void;
}>();

// ========================================
// State
// ========================================

const prompt = ref(props.initialPrompt || '');
const analysis = ref<PromptAnalysis | null>(null);
const enhancementResult = ref<EnhancementResult | null>(null);
const isAnalyzing = ref(false);
const isEnhancing = ref(false);
const showEnhanced = ref(false);

const enhancementOptions = ref<EnhancementOptions>({
  outputFormat: 'general',
  complexity: 'moderate',
  focusAreas: ['clarity', 'specificity', 'completeness', 'actionability'],
});

// ========================================
// Computed
// ========================================

const scoreColor = computed(() => {
  if (!analysis.value) return 'gray';
  const score = analysis.value.overallScore;
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  if (score >= 40) return 'orange';
  return 'red';
});

const scoreLabel = computed(() => {
  if (!analysis.value) return '';
  const score = analysis.value.overallScore;
  if (score >= 80) return '우수';
  if (score >= 60) return '양호';
  if (score >= 40) return '개선 필요';
  return '주의 필요';
});

// ========================================
// Methods
// ========================================

function analyzePrompt(): void {
  if (!prompt.value.trim()) return;

  isAnalyzing.value = true;
  try {
    analysis.value = promptEnhancementService.analyzePrompt(prompt.value);
  } finally {
    isAnalyzing.value = false;
  }
}

async function enhancePrompt(): Promise<void> {
  if (!prompt.value.trim()) return;

  isEnhancing.value = true;
  try {
    enhancementResult.value = await promptEnhancementService.enhancePrompt(
      prompt.value,
      enhancementOptions.value
    );
    showEnhanced.value = true;
  } finally {
    isEnhancing.value = false;
  }
}

function applyEnhancement(): void {
  if (enhancementResult.value) {
    prompt.value = enhancementResult.value.enhancedPrompt;
    analyzePrompt();
    showEnhanced.value = false;
  }
}

function applyAndSave(): void {
  emit('apply', showEnhanced.value && enhancementResult.value
    ? enhancementResult.value.enhancedPrompt
    : prompt.value
  );
}

function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'high': return 'text-red-400';
    case 'medium': return 'text-yellow-400';
    default: return 'text-gray-400';
  }
}

function getMetricColor(value: number): string {
  if (value >= 80) return 'text-green-400';
  if (value >= 60) return 'text-yellow-400';
  if (value >= 40) return 'text-orange-400';
  return 'text-red-400';
}

// Watch for initial prompt changes
watch(() => props.initialPrompt, (newVal) => {
  if (newVal) {
    prompt.value = newVal;
    analyzePrompt();
  }
}, { immediate: true });
</script>

<template>
  <div class="prompt-enhancer-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="flex items-center space-x-2">
        <svg class="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <h3 class="text-lg font-semibold text-gray-200">프롬프트 고도화</h3>
      </div>
      <button @click="emit('close')" class="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-200">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="panel-content">
      <!-- Prompt Input -->
      <div class="prompt-section">
        <label class="block text-sm font-medium text-gray-400 mb-2">프롬프트</label>
        <textarea
          v-model="prompt"
          rows="6"
          class="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          placeholder="분석할 프롬프트를 입력하세요..."
          @input="analysis = null"
        ></textarea>

        <div class="flex items-center justify-between mt-3">
          <span class="text-xs text-gray-500">{{ prompt.length }}자</span>
          <div class="flex space-x-2">
            <button
              @click="analyzePrompt"
              :disabled="!prompt.trim() || isAnalyzing"
              class="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 rounded-lg text-sm transition-colors"
            >
              <span v-if="isAnalyzing">분석 중...</span>
              <span v-else>분석하기</span>
            </button>
            <button
              @click="enhancePrompt"
              :disabled="!prompt.trim() || isEnhancing"
              class="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
            >
              <span v-if="isEnhancing">개선 중...</span>
              <span v-else>AI 개선</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Analysis Results -->
      <div v-if="analysis" class="analysis-section mt-6">
        <h4 class="text-sm font-medium text-gray-400 mb-3">분석 결과</h4>

        <!-- Overall Score -->
        <div class="score-card mb-4">
          <div class="flex items-center justify-between">
            <div>
              <span class="text-2xl font-bold" :class="`text-${scoreColor}-400`">
                {{ analysis.overallScore }}
              </span>
              <span class="text-gray-500 text-sm ml-1">/ 100</span>
            </div>
            <span
              class="px-3 py-1 rounded-full text-sm font-medium"
              :class="`bg-${scoreColor}-900/30 text-${scoreColor}-400`"
            >
              {{ scoreLabel }}
            </span>
          </div>

          <!-- Metric Bars -->
          <div class="metrics-grid mt-4">
            <div class="metric-item">
              <div class="flex justify-between text-xs mb-1">
                <span class="text-gray-400">명확성</span>
                <span :class="getMetricColor(analysis.clarity)">{{ analysis.clarity }}%</span>
              </div>
              <div class="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="`bg-${analysis.clarity >= 60 ? 'green' : 'orange'}-500`"
                  :style="{ width: `${analysis.clarity}%` }"
                ></div>
              </div>
            </div>

            <div class="metric-item">
              <div class="flex justify-between text-xs mb-1">
                <span class="text-gray-400">구체성</span>
                <span :class="getMetricColor(analysis.specificity)">{{ analysis.specificity }}%</span>
              </div>
              <div class="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="`bg-${analysis.specificity >= 60 ? 'green' : 'orange'}-500`"
                  :style="{ width: `${analysis.specificity}%` }"
                ></div>
              </div>
            </div>

            <div class="metric-item">
              <div class="flex justify-between text-xs mb-1">
                <span class="text-gray-400">완전성</span>
                <span :class="getMetricColor(analysis.completeness)">{{ analysis.completeness }}%</span>
              </div>
              <div class="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="`bg-${analysis.completeness >= 60 ? 'green' : 'orange'}-500`"
                  :style="{ width: `${analysis.completeness}%` }"
                ></div>
              </div>
            </div>

            <div class="metric-item">
              <div class="flex justify-between text-xs mb-1">
                <span class="text-gray-400">실행 가능성</span>
                <span :class="getMetricColor(analysis.actionability)">{{ analysis.actionability }}%</span>
              </div>
              <div class="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all"
                  :class="`bg-${analysis.actionability >= 60 ? 'green' : 'orange'}-500`"
                  :style="{ width: `${analysis.actionability}%` }"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Issues -->
        <div v-if="analysis.issues.length > 0" class="issues-section mb-4">
          <h5 class="text-xs font-medium text-gray-500 uppercase mb-2">발견된 문제</h5>
          <div class="space-y-2">
            <div
              v-for="(issue, idx) in analysis.issues"
              :key="idx"
              class="issue-item p-3 bg-gray-900/50 rounded-lg border-l-2"
              :class="{
                'border-red-500': issue.severity === 'high',
                'border-yellow-500': issue.severity === 'medium',
                'border-gray-500': issue.severity === 'low',
              }"
            >
              <div class="flex items-start justify-between">
                <span class="text-sm text-gray-300">{{ issue.message }}</span>
                <span
                  class="text-xs px-2 py-0.5 rounded"
                  :class="getSeverityColor(issue.severity)"
                >
                  {{ issue.severity === 'high' ? '높음' : issue.severity === 'medium' ? '중간' : '낮음' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Suggestions -->
        <div v-if="analysis.suggestions.length > 0" class="suggestions-section">
          <h5 class="text-xs font-medium text-gray-500 uppercase mb-2">개선 제안</h5>
          <div class="space-y-2">
            <div
              v-for="(suggestion, idx) in analysis.suggestions"
              :key="idx"
              class="suggestion-item p-3 bg-blue-900/20 rounded-lg border border-blue-800/30"
            >
              <div class="flex items-start space-x-2">
                <svg class="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p class="text-sm text-gray-300">{{ suggestion.description }}</p>
                  <p class="text-xs text-gray-500 mt-1">{{ suggestion.reason }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Enhanced Prompt Preview -->
      <div v-if="showEnhanced && enhancementResult" class="enhanced-section mt-6">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-sm font-medium text-gray-400">개선된 프롬프트</h4>
          <div class="flex items-center space-x-2">
            <span class="text-xs text-green-400">
              +{{ enhancementResult.analysis.overallScore - (analysis?.overallScore || 0) }}점 개선
            </span>
            <button
              @click="applyEnhancement"
              class="px-3 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-sm"
            >
              적용
            </button>
          </div>
        </div>

        <div class="enhanced-preview bg-gray-900 border border-green-800/30 rounded-lg p-4">
          <pre class="text-sm text-gray-300 whitespace-pre-wrap">{{ enhancementResult.enhancedPrompt }}</pre>
        </div>

        <div v-if="enhancementResult.improvements.length > 0" class="mt-3">
          <h5 class="text-xs text-gray-500 mb-1">적용된 개선사항:</h5>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="improvement in enhancementResult.improvements"
              :key="improvement"
              class="text-xs px-2 py-1 bg-green-900/30 text-green-400 rounded"
            >
              {{ improvement }}
            </span>
          </div>
        </div>
      </div>

      <!-- Enhancement Options -->
      <div class="options-section mt-6">
        <h4 class="text-sm font-medium text-gray-400 mb-3">개선 옵션</h4>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs text-gray-500 mb-1">출력 형식</label>
            <select
              v-model="enhancementOptions.outputFormat"
              class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-300"
            >
              <option value="general">일반</option>
              <option value="code">코드</option>
              <option value="document">문서</option>
              <option value="design">디자인</option>
              <option value="data">데이터</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">복잡도</label>
            <select
              v-model="enhancementOptions.complexity"
              class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-300"
            >
              <option value="simple">간단</option>
              <option value="moderate">보통</option>
              <option value="complex">복잡</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="panel-footer">
      <button
        @click="emit('close')"
        class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
      >
        취소
      </button>
      <button
        @click="applyAndSave"
        :disabled="!prompt.trim()"
        class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm"
      >
        적용하기
      </button>
    </div>
  </div>
</template>

<style scoped>
.prompt-enhancer-panel {
  @apply flex flex-col h-full bg-gray-800 rounded-lg border border-gray-700;
}

.panel-header {
  @apply flex items-center justify-between p-4 border-b border-gray-700;
}

.panel-content {
  @apply flex-1 overflow-y-auto p-4;
}

.panel-footer {
  @apply flex items-center justify-end space-x-3 p-4 border-t border-gray-700;
}

.score-card {
  @apply p-4 bg-gray-900/50 rounded-lg;
}

.metrics-grid {
  @apply grid grid-cols-2 gap-4;
}

.metric-item {
  @apply space-y-1;
}

.enhanced-preview {
  @apply max-h-64 overflow-y-auto;
}

.enhanced-preview::-webkit-scrollbar {
  width: 6px;
}

.enhanced-preview::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.enhanced-preview::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}
</style>
