<script setup lang="ts">
/**
 * Project Info Panel
 *
 * Displays detailed project information including:
 * - Main prompt / Initial instructions
 * - AI guidelines for task execution
 * - AI provider and model settings
 * - Output type and path
 * - Cost and token usage statistics
 */

import { computed, ref, watch } from 'vue';
import { marked } from 'marked';

// ========================================
// Types
// ========================================

interface Project {
  id: number;
  title: string;
  description?: string | null;
  mainPrompt?: string | null;
  aiGuidelines?: string | null; // 레거시 지침서 필드
  projectGuidelines?: string | null; // 최신 프로젝트 지침
  technicalStack?: string[] | null; // 기술 스택
  status: string;
  aiProvider?: string | null;
  aiModel?: string | null;
  outputType?: string | null;
  outputPath?: string | null;
  baseDevFolder?: string | null;
  totalCost: number;
  totalTokens: number;
  estimatedHours?: number | null;
  actualHours?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// ========================================
// Props & Emits
// ========================================

const props = defineProps<{
  project: Project;
  compact?: boolean;
}>();

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'open-output'): void;
  (e: 'update-guidelines', guidelines: string): void;
  (e: 'update-base-folder', folder: string): void;
}>();

// ========================================
// State
// ========================================

const showGuidelines = ref(false);
const isEditingGuidelines = ref(false);
const editedGuidelines = ref('');
const editedBaseFolder = ref('');

// ========================================
// Computed
// ========================================

const aiProviderDisplay = computed(() => {
  const providers: Record<string, { name: string; color: string; icon: string }> = {
    openai: { name: 'OpenAI', color: 'text-green-400', icon: '🤖' },
    anthropic: { name: 'Anthropic', color: 'text-purple-400', icon: '🧠' },
    google: { name: 'Google AI', color: 'text-blue-400', icon: '🔷' },
    local: { name: 'Local', color: 'text-gray-400', icon: '💻' },
  };
  return providers[props.project.aiProvider || ''] || { name: '미설정', color: 'text-gray-500', icon: '❓' };
});

const aiModelDisplay = computed(() => {
  const models: Record<string, string> = {
    'gpt-4-turbo': 'GPT-4 Turbo',
    'gpt-4': 'GPT-4',
    'gpt-3.5-turbo': 'GPT-3.5 Turbo',
    'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
    'claude-3-opus': 'Claude 3 Opus',
    'claude-3-sonnet': 'Claude 3 Sonnet',
    'claude-3-haiku': 'Claude 3 Haiku',
    'gemini-pro': 'Gemini Pro',
    'gemini-ultra': 'Gemini Ultra',
  };
  return models[props.project.aiModel || ''] || props.project.aiModel || '미설정';
});

const outputTypeDisplay = computed(() => {
  const types: Record<string, { name: string; icon: string; description: string }> = {
    web: { name: '웹 프로젝트', icon: '🌐', description: 'HTML/CSS/JS 웹 애플리케이션' },
    document: { name: '문서', icon: '📄', description: 'Markdown, PDF 등 문서 파일' },
    image: { name: '이미지', icon: '🖼️', description: '이미지 생성/편집 결과물' },
    video: { name: '비디오', icon: '🎬', description: '비디오 컨텐츠' },
    code: { name: '코드', icon: '💻', description: '소스 코드 및 스크립트' },
    data: { name: '데이터', icon: '📊', description: 'JSON, CSV 등 데이터 파일' },
    other: { name: '기타', icon: '📦', description: '기타 형식의 결과물' },
  };
  return types[props.project.outputType || ''] || { name: '미지정', icon: '❓', description: '결과물 타입이 지정되지 않음' };
});

const statusDisplay = computed(() => {
  const statuses: Record<string, { name: string; color: string }> = {
    active: { name: '진행중', color: 'bg-green-500' },
    completed: { name: '완료', color: 'bg-blue-500' },
    archived: { name: '보관됨', color: 'bg-gray-500' },
    on_hold: { name: '보류', color: 'bg-yellow-500' },
  };
  return statuses[props.project.status] || { name: props.project.status, color: 'bg-gray-500' };
});

const formattedCost = computed(() => {
  return `$${props.project.totalCost.toFixed(4)}`;
});

const formattedTokens = computed(() => {
  if (props.project.totalTokens >= 1000000) {
    return `${(props.project.totalTokens / 1000000).toFixed(2)}M`;
  }
  if (props.project.totalTokens >= 1000) {
    return `${(props.project.totalTokens / 1000).toFixed(1)}K`;
  }
  return props.project.totalTokens.toString();
});

const truncatedPrompt = computed(() => {
  const prompt = props.project.mainPrompt || '';
  if (props.compact && prompt.length > 150) {
    return prompt.slice(0, 150) + '...';
  }
  return prompt;
});

const effectiveGuidelines = computed(() => props.project.projectGuidelines || props.project.aiGuidelines || '');
const renderedGuidelines = computed(() => {
  if (!effectiveGuidelines.value) return '';
  return marked(effectiveGuidelines.value);
});

const hasGuidelines = computed(() => {
  return !!effectiveGuidelines.value && effectiveGuidelines.value.trim().length > 0;
});

// Init base folder display
watch(
  () => props.project,
  (project) => {
    editedBaseFolder.value = project?.baseDevFolder || '';
  },
  { immediate: true }
);

// ========================================
// Methods
// ========================================

function handleEdit(): void {
  emit('edit');
}

function handleOpenOutput(): void {
  emit('open-output');
}

function copyPrompt(): void {
  if (props.project.mainPrompt) {
    navigator.clipboard.writeText(props.project.mainPrompt);
  }
}

function toggleGuidelines(): void {
  showGuidelines.value = !showGuidelines.value;
}

function startEditGuidelines(): void {
  editedGuidelines.value = effectiveGuidelines.value || '';
  isEditingGuidelines.value = true;
}

function cancelEditGuidelines(): void {
  isEditingGuidelines.value = false;
  editedGuidelines.value = '';
}

function saveGuidelines(): void {
  emit('update-guidelines', editedGuidelines.value);
  isEditingGuidelines.value = false;
}

function copyGuidelines(): void {
  if (effectiveGuidelines.value) {
    navigator.clipboard.writeText(effectiveGuidelines.value);
  }
}

function saveBaseFolder(): void {
  emit('update-base-folder', editedBaseFolder.value);
}

async function pickBaseFolder(): Promise<void> {
  const dir = await (window as any)?.electron?.fs?.selectDirectory?.();
  if (dir) {
    editedBaseFolder.value = dir;
    saveBaseFolder();
  }
}
</script>

<template>
  <div class="project-info-panel bg-gray-800/50 rounded-lg border border-gray-700">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-gray-700">
      <div class="flex items-center space-x-3">
        <h3 class="text-lg font-semibold text-gray-200">프로젝트 정보</h3>
        <span
          class="px-2 py-0.5 text-xs rounded-full text-white"
          :class="statusDisplay.color"
        >
          {{ statusDisplay.name }}
        </span>
      </div>
      <button
        @click="handleEdit"
        class="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-gray-200"
        title="편집"
      >
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>
    </div>

    <div class="p-4 space-y-4">
      <!-- Main Prompt Section -->
      <div v-if="project.mainPrompt" class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium text-gray-400">초기 프롬프트</label>
          <button
            @click="copyPrompt"
            class="text-xs text-gray-500 hover:text-gray-300 flex items-center space-x-1"
            title="복사"
          >
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span>복사</span>
          </button>
        </div>
        <div class="bg-gray-900/50 rounded-lg p-3 text-sm text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
          {{ truncatedPrompt }}
        </div>
        <button
          v-if="compact && project.mainPrompt && project.mainPrompt.length > 150"
          class="text-xs text-blue-400 hover:text-blue-300"
        >
          전체 보기
        </button>
      </div>

      <div v-else class="text-center py-4 text-gray-500 text-sm">
        초기 프롬프트가 설정되지 않았습니다
      </div>

      <!-- AI Guidelines Section -->
      <div class="space-y-2 border-t border-gray-700 pt-4">
        <div class="flex items-center justify-between">
          <button
            @click="toggleGuidelines"
            class="flex items-center space-x-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
          >
            <svg
              class="w-4 h-4 transition-transform"
              :class="{ 'rotate-90': showGuidelines }"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <span>AI 지침서</span>
            <span
              v-if="hasGuidelines"
              class="px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-300 rounded"
            >
              설정됨
            </span>
            <span
              v-else
              class="px-1.5 py-0.5 text-xs bg-gray-600/50 text-gray-400 rounded"
            >
              미설정
            </span>
          </button>
          <div v-if="hasGuidelines" class="flex items-center space-x-1">
            <button
              @click="copyGuidelines"
              class="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-gray-200"
              title="복사"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              @click="startEditGuidelines"
              class="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-gray-200"
              title="편집"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Guidelines Content -->
        <div v-if="showGuidelines" class="space-y-3">
          <!-- View Mode -->
          <div v-if="!isEditingGuidelines && hasGuidelines" class="bg-gray-900/50 rounded-lg p-4 max-h-96 overflow-y-auto">
            <div class="guidelines-content prose prose-invert prose-sm max-w-none" v-html="renderedGuidelines"></div>
          </div>

          <!-- Empty State -->
          <div v-else-if="!isEditingGuidelines && !hasGuidelines" class="bg-gray-900/30 rounded-lg p-6 text-center">
            <div class="text-gray-500 text-sm mb-3">
              AI 지침서가 아직 생성되지 않았습니다.
            </div>
            <button
              @click="startEditGuidelines"
              class="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
            >
              지침서 작성하기
            </button>
          </div>

          <!-- Edit Mode -->
          <div v-if="isEditingGuidelines" class="space-y-3">
            <textarea
              v-model="editedGuidelines"
              class="w-full h-64 bg-gray-900 border border-gray-600 rounded-lg p-3 text-sm text-gray-300 resize-y focus:outline-none focus:border-purple-500"
              placeholder="AI 지침서를 마크다운 형식으로 작성하세요..."
            ></textarea>
            <div class="flex justify-end space-x-2">
              <button
                @click="cancelEditGuidelines"
                class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                @click="saveGuidelines"
                class="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Base Dev Folder -->
      <div class="space-y-2 border-t border-gray-700 pt-4">
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium text-gray-400">개발 베이스 폴더</label>
          <button
            class="text-xs text-blue-400 hover:text-blue-300"
            @click="pickBaseFolder"
          >
            폴더 선택
          </button>
        </div>
        <div class="flex gap-2">
          <input
            v-model="editedBaseFolder"
            type="text"
            class="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
            placeholder="/path/to/project"
          />
          <button
            class="px-3 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
            @click="saveBaseFolder"
          >
            저장
          </button>
        </div>
        <p class="text-xs text-gray-500">
          Local agent 실행 시 기본 작업 디렉토리로 사용됩니다.
        </p>
      </div>

      <!-- AI Settings -->
      <div class="grid grid-cols-2 gap-4">
        <!-- AI Provider -->
        <div class="space-y-1">
          <label class="text-xs text-gray-500">AI 제공자</label>
          <div class="flex items-center space-x-2">
            <span>{{ aiProviderDisplay.icon }}</span>
            <span :class="aiProviderDisplay.color" class="text-sm font-medium">
              {{ aiProviderDisplay.name }}
            </span>
          </div>
        </div>

        <!-- AI Model -->
        <div class="space-y-1">
          <label class="text-xs text-gray-500">AI 모델</label>
          <div class="text-sm font-medium text-gray-300">
            {{ aiModelDisplay }}
          </div>
        </div>
      </div>

      <!-- Output Settings -->
      <div class="space-y-2">
        <label class="text-xs text-gray-500">결과물 타입</label>
        <div class="flex items-center space-x-3 bg-gray-900/30 rounded-lg p-3">
          <span class="text-2xl">{{ outputTypeDisplay.icon }}</span>
          <div>
            <div class="text-sm font-medium text-gray-200">{{ outputTypeDisplay.name }}</div>
            <div class="text-xs text-gray-500">{{ outputTypeDisplay.description }}</div>
          </div>
        </div>
      </div>

      <!-- Output Path -->
      <div v-if="project.outputPath" class="space-y-1">
        <label class="text-xs text-gray-500">결과물 경로</label>
        <div class="flex items-center space-x-2">
          <div class="flex-1 bg-gray-900/50 rounded px-3 py-2 text-sm text-gray-400 font-mono truncate">
            {{ project.outputPath }}
          </div>
          <button
            @click="handleOpenOutput"
            class="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors text-gray-300"
            title="폴더 열기"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Statistics -->
      <div class="grid grid-cols-2 gap-3 pt-3 border-t border-gray-700">
        <div class="bg-gray-900/30 rounded-lg p-3">
          <div class="text-xs text-gray-500">총 비용</div>
          <div class="text-lg font-semibold text-green-400">{{ formattedCost }}</div>
        </div>
        <div class="bg-gray-900/30 rounded-lg p-3">
          <div class="text-xs text-gray-500">총 토큰</div>
          <div class="text-lg font-semibold text-blue-400">{{ formattedTokens }}</div>
        </div>
      </div>

      <!-- Time Estimates -->
      <div v-if="project.estimatedHours || project.actualHours" class="grid grid-cols-2 gap-3">
        <div v-if="project.estimatedHours" class="text-center">
          <div class="text-xs text-gray-500">예상 시간</div>
          <div class="text-sm text-gray-300">{{ project.estimatedHours }}시간</div>
        </div>
        <div v-if="project.actualHours" class="text-center">
          <div class="text-xs text-gray-500">실제 시간</div>
          <div class="text-sm text-gray-300">{{ project.actualHours }}시간</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.project-info-panel {
  @apply w-full;
}

/* Custom scrollbar for prompt area */
.max-h-48::-webkit-scrollbar {
  width: 6px;
}

.max-h-48::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.max-h-48::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.max-h-48::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Guidelines content scrollbar */
.max-h-96::-webkit-scrollbar {
  width: 6px;
}

.max-h-96::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.max-h-96::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.max-h-96::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Guidelines markdown styling */
.guidelines-content :deep(h1) {
  @apply text-lg font-bold text-gray-200 mb-3 mt-4 first:mt-0;
}

.guidelines-content :deep(h2) {
  @apply text-base font-semibold text-gray-300 mb-2 mt-4 first:mt-0;
}

.guidelines-content :deep(h3) {
  @apply text-sm font-medium text-gray-300 mb-2 mt-3;
}

.guidelines-content :deep(p) {
  @apply text-sm text-gray-400 mb-2;
}

.guidelines-content :deep(ul) {
  @apply list-disc list-inside text-sm text-gray-400 mb-2 space-y-1;
}

.guidelines-content :deep(ol) {
  @apply list-decimal list-inside text-sm text-gray-400 mb-2 space-y-1;
}

.guidelines-content :deep(li) {
  @apply text-gray-400;
}

.guidelines-content :deep(code) {
  @apply bg-gray-800 px-1.5 py-0.5 rounded text-xs text-purple-300;
}

.guidelines-content :deep(pre) {
  @apply bg-gray-800 p-3 rounded-lg mb-2 overflow-x-auto;
}

.guidelines-content :deep(pre code) {
  @apply bg-transparent p-0;
}

.guidelines-content :deep(blockquote) {
  @apply border-l-2 border-purple-500 pl-3 italic text-gray-500 mb-2;
}

.guidelines-content :deep(hr) {
  @apply border-gray-700 my-4;
}

.guidelines-content :deep(strong) {
  @apply font-semibold text-gray-200;
}

.guidelines-content :deep(a) {
  @apply text-purple-400 hover:text-purple-300 underline;
}
</style>
