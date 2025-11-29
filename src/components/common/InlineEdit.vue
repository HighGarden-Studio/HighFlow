<script setup lang="ts">
/**
 * InlineEdit Component
 *
 * Reusable inline editing component with keyboard support
 */
import { ref, watch, nextTick, computed } from 'vue';

interface Props {
  value: string;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  required?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showEditIcon?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Click to edit...',
  multiline: false,
  rows: 3,
  disabled: false,
  required: false,
  size: 'md',
  showEditIcon: true,
});

const emit = defineEmits<{
  (e: 'update:value', value: string): void;
  (e: 'save', value: string): void;
  (e: 'cancel'): void;
}>();

// State
const isEditing = ref(false);
const localValue = ref(props.value);
const inputRef = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);
const hasError = ref(false);

// Watch for external value changes
watch(() => props.value, (newValue) => {
  if (!isEditing.value) {
    localValue.value = newValue;
  }
});

// Computed
const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'text-sm py-0.5 px-1';
    case 'lg':
      return 'text-lg py-2 px-3';
    case 'xl':
      return 'text-xl font-semibold py-2 px-3';
    default:
      return 'text-base py-1 px-2';
  }
});

const displaySizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'text-sm';
    case 'lg':
      return 'text-lg';
    case 'xl':
      return 'text-xl font-semibold';
    default:
      return 'text-base';
  }
});

// Actions
async function startEditing() {
  if (props.disabled) return;

  isEditing.value = true;
  localValue.value = props.value;
  hasError.value = false;

  await nextTick();
  if (inputRef.value) {
    inputRef.value.focus();
    inputRef.value.select();
  }
}

function handleSave() {
  const trimmedValue = localValue.value.trim();

  // Validation
  if (props.required && !trimmedValue) {
    hasError.value = true;
    return;
  }

  isEditing.value = false;
  hasError.value = false;

  if (trimmedValue !== props.value) {
    emit('update:value', trimmedValue);
    emit('save', trimmedValue);
  }
}

function handleCancel() {
  isEditing.value = false;
  localValue.value = props.value;
  hasError.value = false;
  emit('cancel');
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !props.multiline) {
    event.preventDefault();
    handleSave();
  } else if (event.key === 'Enter' && props.multiline && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    handleSave();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    handleCancel();
  }
}

function handleBlur() {
  // Delay to allow click on save/cancel buttons
  setTimeout(() => {
    if (isEditing.value) {
      handleSave();
    }
  }, 150);
}
</script>

<template>
  <div class="inline-edit-container">
    <!-- Display Mode -->
    <div
      v-if="!isEditing"
      class="group flex items-center gap-2 cursor-pointer rounded transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/50"
      :class="[displaySizeClasses, { 'opacity-50': disabled }]"
      @click="startEditing"
    >
      <span
        class="flex-1 text-gray-900 dark:text-white"
        :class="{ 'text-gray-400 dark:text-gray-500 italic': !value }"
      >
        {{ value || placeholder }}
      </span>
      <svg
        v-if="showEditIcon && !disabled"
        class="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
        />
      </svg>
    </div>

    <!-- Edit Mode -->
    <div v-else class="relative">
      <textarea
        v-if="multiline"
        ref="inputRef"
        v-model="localValue"
        :rows="rows"
        :maxlength="maxLength"
        :placeholder="placeholder"
        class="w-full rounded-lg border bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors resize-none"
        :class="[
          sizeClasses,
          hasError
            ? 'border-red-500 dark:border-red-500'
            : 'border-gray-300 dark:border-gray-600'
        ]"
        @keydown="handleKeydown"
        @blur="handleBlur"
      />
      <input
        v-else
        ref="inputRef"
        v-model="localValue"
        type="text"
        :maxlength="maxLength"
        :placeholder="placeholder"
        class="w-full rounded-lg border bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
        :class="[
          sizeClasses,
          hasError
            ? 'border-red-500 dark:border-red-500'
            : 'border-gray-300 dark:border-gray-600'
        ]"
        @keydown="handleKeydown"
        @blur="handleBlur"
      />

      <!-- Helper Text -->
      <div class="flex items-center justify-between mt-1 text-xs">
        <span v-if="hasError" class="text-red-500">
          This field is required
        </span>
        <span v-else class="text-gray-500 dark:text-gray-400">
          {{ multiline ? 'Cmd/Ctrl+Enter to save, Escape to cancel' : 'Enter to save, Escape to cancel' }}
        </span>
        <span v-if="maxLength" class="text-gray-500 dark:text-gray-400">
          {{ localValue.length }}/{{ maxLength }}
        </span>
      </div>

      <!-- Action Buttons (for multiline) -->
      <div v-if="multiline" class="flex justify-end gap-2 mt-2">
        <button
          type="button"
          class="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          @click="handleCancel"
        >
          Cancel
        </button>
        <button
          type="button"
          class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          @click="handleSave"
        >
          Save
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.inline-edit-container {
  min-width: 0;
}
</style>
