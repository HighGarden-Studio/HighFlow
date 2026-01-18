<script setup lang="ts">
/**
 * Prompt Template Picker
 *
 * UI for browsing, searching, and selecting prompt templates.
 */

import { ref, computed, onMounted } from 'vue';
import {
  promptTemplateLibrary,
  type TemplateSearchOptions,
} from '../../services/prompt/PromptTemplateLibrary';
import type { PromptTemplate, PromptCategory, TemplateVariable } from '../../services/prompt/PromptEnhancementService';

// ========================================
// Props & Emits
// ========================================

const emit = defineEmits<{
  (e: 'select', template: PromptTemplate): void;
  (e: 'apply', prompt: string): void;
  (e: 'close'): void;
}>();

// ========================================
// State
// ========================================

const searchQuery = ref('');
const selectedCategory = ref<PromptCategory | ''>('');
const templates = ref<PromptTemplate[]>([]);
const selectedTemplate = ref<PromptTemplate | null>(null);
const variableValues = ref<Record<string, string>>({});
const renderedPrompt = ref('');
const renderWarnings = ref<string[]>([]);

const categories = ref<{ category: PromptCategory; count: number }[]>([]);
const popularTags = ref<{ tag: string; count: number }[]>([]);

// ========================================
// Computed
// ========================================

const categoryLabels: Record<PromptCategory, string> = {
  coding: '코딩',
  writing: '문서 작성',
  analysis: '분석',
  design: '디자인',
  data: '데이터',
  translation: '번역',
  summarization: '요약',
  brainstorming: '브레인스토밍',
  debugging: '디버깅',
  review: '리뷰',
  custom: '사용자 정의',
};

const sortedTemplates = computed(() => {
  return templates.value.sort((a, b) => b.usageCount - a.usageCount);
});

const isFormValid = computed(() => {
  if (!selectedTemplate.value) return false;

  for (const variable of selectedTemplate.value.variables) {
    if (variable.required && !variableValues.value[variable.name]) {
      return false;
    }
  }
  return true;
});

// ========================================
// Methods
// ========================================

function loadTemplates(): void {
  const options: TemplateSearchOptions = {
    query: searchQuery.value || undefined,
    category: selectedCategory.value || undefined,
    sortBy: 'usageCount',
    sortOrder: 'desc',
  };

  templates.value = promptTemplateLibrary.searchTemplates(options);
}

function loadCategories(): void {
  categories.value = promptTemplateLibrary.getCategories();
  popularTags.value = promptTemplateLibrary.getTags().slice(0, 10);
}

function selectTemplate(template: PromptTemplate): void {
  selectedTemplate.value = template;
  variableValues.value = {};
  renderedPrompt.value = '';
  renderWarnings.value = [];

  // Set default values
  for (const variable of template.variables) {
    if (variable.defaultValue) {
      variableValues.value[variable.name] = variable.defaultValue;
    }
  }

  emit('select', template);
}

function renderTemplate(): void {
  if (!selectedTemplate.value) return;

  const result = promptTemplateLibrary.renderTemplate(
    selectedTemplate.value.id,
    variableValues.value
  );

  renderedPrompt.value = result.renderedPrompt;
  renderWarnings.value = result.warnings;
}

function applyTemplate(): void {
  if (!renderedPrompt.value) {
    renderTemplate();
  }
  emit('apply', renderedPrompt.value);
}

function filterByCategory(category: PromptCategory | ''): void {
  selectedCategory.value = category;
  loadTemplates();
}

function filterByTag(tag: string): void {
  searchQuery.value = tag;
  loadTemplates();
}

function getVariableInputType(variable: TemplateVariable): string {
  switch (variable.type) {
    case 'number': return 'number';
    case 'multiline': return 'textarea';
    case 'select': return 'select';
    default: return 'text';
  }
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ========================================
// Lifecycle
// ========================================

onMounted(() => {
  loadTemplates();
  loadCategories();
});
</script>

<template>
  <div class="template-picker">
    <!-- Header -->
    <div class="picker-header">
      <div class="flex items-center space-x-2">
        <svg class="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
        <h3 class="text-lg font-semibold text-gray-200">템플릿 라이브러리</h3>
      </div>
      <button class="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-200" @click="emit('close')">
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="picker-content">
      <!-- Search & Filters -->
      <div class="search-section">
        <div class="relative">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="템플릿 검색..."
            class="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            @input="loadTemplates"
          />
        </div>

        <!-- Categories -->
        <div class="categories mt-4">
          <div class="flex flex-wrap gap-2">
            <button
              class="category-chip"
              :class="{ active: selectedCategory === '' }"
              @click="filterByCategory('')"
            >
              전체
            </button>
            <button
              v-for="cat in categories"
              :key="cat.category"
              class="category-chip"
              :class="{ active: selectedCategory === cat.category }"
              @click="filterByCategory(cat.category)"
            >
              {{ categoryLabels[cat.category] }}
              <span class="ml-1 text-xs opacity-70">({{ cat.count }})</span>
            </button>
          </div>
        </div>

        <!-- Popular Tags -->
        <div v-if="popularTags.length > 0" class="tags mt-3">
          <span class="text-xs text-gray-500 mr-2">인기 태그:</span>
          <button
            v-for="tag in popularTags"
            :key="tag.tag"
            class="tag-chip"
            @click="filterByTag(tag.tag)"
          >
            #{{ tag.tag }}
          </button>
        </div>
      </div>

      <div class="main-area">
        <!-- Template List -->
        <div class="template-list">
          <div
            v-for="template in sortedTemplates"
            :key="template.id"
            class="template-item"
            :class="{ selected: selectedTemplate?.id === template.id }"
            @click="selectTemplate(template)"
          >
            <div class="flex items-start justify-between">
              <div>
                <h4 class="font-medium text-gray-200">{{ template.name }}</h4>
                <p class="text-sm text-gray-500 mt-1 line-clamp-2">{{ template.description }}</p>
              </div>
              <span class="text-xs text-gray-600 whitespace-nowrap ml-2">
                {{ template.usageCount }}회 사용
              </span>
            </div>

            <div class="flex items-center justify-between mt-2">
              <div class="flex flex-wrap gap-1">
                <span class="category-badge">
                  {{ categoryLabels[template.category] }}
                </span>
                <span
                  v-for="tag in template.tags.slice(0, 2)"
                  :key="tag"
                  class="tag-badge"
                >
                  {{ tag }}
                </span>
              </div>
              <div class="flex items-center text-xs text-gray-600">
                <svg class="w-3 h-3 mr-1 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                {{ template.rating.toFixed(1) }}
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div v-if="sortedTemplates.length === 0" class="empty-state">
            <svg class="w-12 h-12 text-gray-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p class="text-gray-500 mt-2">템플릿을 찾을 수 없습니다</p>
          </div>
        </div>

        <!-- Template Detail -->
        <div class="template-detail">
          <template v-if="selectedTemplate">
            <div class="detail-header">
              <h4 class="text-lg font-semibold text-gray-200">{{ selectedTemplate.name }}</h4>
              <p class="text-sm text-gray-400 mt-1">{{ selectedTemplate.description }}</p>
              <div class="text-xs text-gray-600 mt-2">
                업데이트: {{ formatDate(selectedTemplate.updatedAt) }}
              </div>
            </div>

            <!-- Variables Form -->
            <div class="variables-form mt-4">
              <h5 class="text-sm font-medium text-gray-400 mb-3">변수 입력</h5>

              <div class="space-y-4">
                <div
                  v-for="variable in selectedTemplate.variables"
                  :key="variable.name"
                  class="variable-input"
                >
                  <label class="block text-sm text-gray-300 mb-1">
                    {{ variable.name }}
                    <span v-if="variable.required" class="text-red-400">*</span>
                  </label>
                  <p v-if="variable.description" class="text-xs text-gray-500 mb-1">
                    {{ variable.description }}
                  </p>

                  <!-- Select -->
                  <select
                    v-if="variable.type === 'select'"
                    v-model="variableValues[variable.name]"
                    class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-gray-200"
                  >
                    <option value="">선택하세요</option>
                    <option v-for="opt in variable.options" :key="opt" :value="opt">
                      {{ opt }}
                    </option>
                  </select>

                  <!-- Textarea -->
                  <textarea
                    v-else-if="variable.type === 'multiline'"
                    v-model="variableValues[variable.name]"
                    rows="3"
                    class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-gray-200 resize-none"
                    :placeholder="variable.defaultValue || ''"
                  ></textarea>

                  <!-- Text/Number -->
                  <input
                    v-else
                    v-model="variableValues[variable.name]"
                    :type="getVariableInputType(variable)"
                    class="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-gray-200"
                    :placeholder="variable.defaultValue || ''"
                  />
                </div>
              </div>

              <button
                :disabled="!isFormValid"
                class="w-full mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-200 rounded-lg text-sm"
                @click="renderTemplate"
              >
                미리보기 생성
              </button>
            </div>

            <!-- Preview -->
            <div v-if="renderedPrompt" class="preview mt-4">
              <h5 class="text-sm font-medium text-gray-400 mb-2">미리보기</h5>
              <div class="preview-content bg-gray-900 border border-gray-700 rounded-lg p-3">
                <pre class="text-sm text-gray-300 whitespace-pre-wrap">{{ renderedPrompt }}</pre>
              </div>

              <div v-if="renderWarnings.length > 0" class="warnings mt-2">
                <div
                  v-for="warning in renderWarnings"
                  :key="warning"
                  class="text-xs text-yellow-400"
                >
                  ⚠️ {{ warning }}
                </div>
              </div>
            </div>

            <!-- Examples -->
            <div v-if="selectedTemplate.examples.length > 0" class="examples mt-4">
              <h5 class="text-sm font-medium text-gray-400 mb-2">사용 예시</h5>
              <ul class="text-sm text-gray-500 space-y-1">
                <li v-for="(example, idx) in selectedTemplate.examples" :key="idx">
                  • {{ example }}
                </li>
              </ul>
            </div>
          </template>

          <!-- No Selection -->
          <div v-else class="no-selection">
            <svg class="w-16 h-16 text-gray-700 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
            </svg>
            <p class="text-gray-500 mt-4">템플릿을 선택하세요</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="picker-footer">
      <button
        class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm"
        @click="emit('close')"
      >
        취소
      </button>
      <button
        :disabled="!renderedPrompt"
        class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm"
        @click="applyTemplate"
      >
        적용하기
      </button>
    </div>
  </div>
</template>

<style scoped>
.template-picker {
  @apply flex flex-col h-full bg-gray-800 rounded-lg border border-gray-700;
}

.picker-header {
  @apply flex items-center justify-between p-4 border-b border-gray-700;
}

.picker-content {
  @apply flex-1 overflow-hidden flex flex-col;
}

.search-section {
  @apply p-4 border-b border-gray-700;
}

.main-area {
  @apply flex-1 flex overflow-hidden;
}

.template-list {
  @apply w-1/2 overflow-y-auto border-r border-gray-700 p-4 space-y-3;
}

.template-detail {
  @apply w-1/2 overflow-y-auto p-4;
}

.template-item {
  @apply p-4 bg-gray-900/50 rounded-lg cursor-pointer border border-transparent hover:border-gray-600 transition-colors;
}

.template-item.selected {
  @apply border-blue-500 bg-blue-900/20;
}

.category-chip {
  @apply px-3 py-1 bg-gray-700 text-gray-300 rounded-full text-sm hover:bg-gray-600 transition-colors;
}

.category-chip.active {
  @apply bg-blue-600 text-white;
}

.tag-chip {
  @apply px-2 py-0.5 text-xs text-gray-400 hover:text-blue-400 transition-colors;
}

.category-badge {
  @apply px-2 py-0.5 bg-purple-900/30 text-purple-400 rounded text-xs;
}

.tag-badge {
  @apply px-2 py-0.5 bg-gray-700 text-gray-400 rounded text-xs;
}

.picker-footer {
  @apply flex items-center justify-end space-x-3 p-4 border-t border-gray-700;
}

.empty-state,
.no-selection {
  @apply flex flex-col items-center justify-center h-full text-center py-12;
}

.preview-content {
  @apply max-h-48 overflow-y-auto;
}

.preview-content::-webkit-scrollbar,
.template-list::-webkit-scrollbar,
.template-detail::-webkit-scrollbar {
  width: 6px;
}

.preview-content::-webkit-scrollbar-track,
.template-list::-webkit-scrollbar-track,
.template-detail::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.preview-content::-webkit-scrollbar-thumb,
.template-list::-webkit-scrollbar-thumb,
.template-detail::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}
</style>
