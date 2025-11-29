<script setup lang="ts">
/**
 * TagInput Component
 *
 * Reusable tag input component with autocomplete
 */
import { ref, computed } from 'vue';

interface Props {
  modelValue: string[];
  placeholder?: string;
  suggestions?: string[];
  maxTags?: number;
  disabled?: boolean;
  allowCustom?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Add tag...',
  suggestions: () => [],
  maxTags: 10,
  disabled: false,
  allowCustom: true,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void;
}>();

// State
const inputValue = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const showSuggestions = ref(false);
const highlightedIndex = ref(-1);

// Computed
const tags = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
});

const filteredSuggestions = computed(() => {
  if (!inputValue.value.trim()) {
    return props.suggestions.filter(s => !tags.value.includes(s)).slice(0, 5);
  }

  const query = inputValue.value.toLowerCase();
  return props.suggestions
    .filter(s => s.toLowerCase().includes(query) && !tags.value.includes(s))
    .slice(0, 5);
});

const canAddMore = computed(() => tags.value.length < props.maxTags);

// Tag colors based on hash
const tagColors = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-900/50 dark:text-pink-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300',
];

function getTagColor(tag: string): string {
  const hash = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const color = tagColors[hash % tagColors.length];
  return color ?? tagColors[0] ?? 'bg-gray-100 text-gray-700';
}

// Actions
function addTag(tag: string) {
  const trimmed = tag.trim().toLowerCase();

  if (!trimmed) return;
  if (tags.value.includes(trimmed)) return;
  if (!canAddMore.value) return;
  if (!props.allowCustom && !props.suggestions.includes(trimmed)) return;

  tags.value = [...tags.value, trimmed];
  inputValue.value = '';
  showSuggestions.value = false;
  highlightedIndex.value = -1;
}

function removeTag(index: number) {
  if (props.disabled) return;
  tags.value = tags.value.filter((_, i) => i !== index);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();

    if (highlightedIndex.value >= 0 && highlightedIndex.value < filteredSuggestions.value.length) {
      const selectedSuggestion = filteredSuggestions.value[highlightedIndex.value];
      if (selectedSuggestion) addTag(selectedSuggestion);
    } else if (inputValue.value.trim()) {
      addTag(inputValue.value);
    }
  } else if (event.key === 'Backspace' && !inputValue.value && tags.value.length > 0) {
    removeTag(tags.value.length - 1);
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (highlightedIndex.value < filteredSuggestions.value.length - 1) {
      highlightedIndex.value++;
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (highlightedIndex.value > 0) {
      highlightedIndex.value--;
    }
  } else if (event.key === 'Escape') {
    showSuggestions.value = false;
    highlightedIndex.value = -1;
  }
}

function handleInput() {
  showSuggestions.value = true;
  highlightedIndex.value = -1;
}

function handleBlur() {
  setTimeout(() => {
    showSuggestions.value = false;
  }, 200);
}

function selectSuggestion(suggestion: string) {
  addTag(suggestion);
  inputRef.value?.focus();
}
</script>

<template>
  <div class="tag-input-container">
    <div
      class="flex flex-wrap items-center gap-2 p-2 border rounded-lg bg-white dark:bg-gray-700 transition-colors"
      :class="[
        disabled
          ? 'border-gray-200 dark:border-gray-600 opacity-50 cursor-not-allowed'
          : 'border-gray-300 dark:border-gray-600 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-200 dark:focus-within:ring-blue-800'
      ]"
    >
      <!-- Tags -->
      <span
        v-for="(tag, index) in tags"
        :key="tag"
        :class="[
          'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
          getTagColor(tag)
        ]"
      >
        {{ tag }}
        <button
          v-if="!disabled"
          type="button"
          class="hover:bg-black/10 dark:hover:bg-white/10 rounded-full p-0.5"
          @click="removeTag(index)"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </span>

      <!-- Input -->
      <div v-if="canAddMore && !disabled" class="relative flex-1 min-w-[120px]">
        <input
          ref="inputRef"
          v-model="inputValue"
          type="text"
          :placeholder="tags.length === 0 ? placeholder : 'Add more...'"
          class="w-full bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
          @keydown="handleKeydown"
          @input="handleInput"
          @focus="showSuggestions = true"
          @blur="handleBlur"
        />

        <!-- Suggestions Dropdown -->
        <div
          v-if="showSuggestions && filteredSuggestions.length > 0"
          class="absolute left-0 right-0 top-full mt-1 z-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden"
        >
          <button
            v-for="(suggestion, index) in filteredSuggestions"
            :key="suggestion"
            type="button"
            :class="[
              'w-full px-3 py-2 text-left text-sm transition-colors',
              highlightedIndex === index
                ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            ]"
            @click="selectSuggestion(suggestion)"
          >
            {{ suggestion }}
          </button>
        </div>
      </div>

      <!-- Max Tags Indicator -->
      <span v-if="!canAddMore" class="text-xs text-gray-400 dark:text-gray-500">
        Max {{ maxTags }} tags
      </span>
    </div>

    <!-- Helper Text -->
    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
      Press Enter to add{{ allowCustom ? '' : ' (from suggestions only)' }}
    </p>
  </div>
</template>

<style scoped>
.tag-input-container {
  width: 100%;
}
</style>
