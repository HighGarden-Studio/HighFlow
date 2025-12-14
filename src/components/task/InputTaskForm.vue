<script setup lang="ts">
import { reactive, computed } from 'vue';
import type { Task, InputTaskConfig } from '@core/types/database';

interface Props {
    task: Task;
}

const props = defineProps<Props>();
const emit = defineEmits<{
    (e: 'submit', data: any): void;
    (e: 'cancel'): void;
}>();

const config = computed<InputTaskConfig | null>(() => {
    if (!props.task.inputConfig) {
        // Default to simple user input if no config exists
        return {
            sourceType: 'USER_INPUT',
            userInput: {
                message: '입력을 완료해주세요.',
                placeholder: 'Enter your input...',
                required: true,
                mode: 'short',
            },
        };
    }
    return typeof props.task.inputConfig === 'string'
        ? JSON.parse(props.task.inputConfig)
        : props.task.inputConfig;
});

// Form state
const formData = reactive({
    value: '',
    confirmed: false,
});

const error = reactive({ message: '' });

const validate = (): boolean => {
    error.message = '';

    if (config.value?.sourceType === 'USER_INPUT' && config.value.userInput) {
        const { required, mode } = config.value.userInput;

        if (mode === 'confirm') {
            if (required && !formData.confirmed) {
                error.message = 'Confirmation is required';
                return false;
            }
        } else {
            if (required && !formData.value.trim()) {
                error.message = 'Input is required';
                return false;
            }
        }
    }
    return true;
};

const handleSubmit = () => {
    if (validate()) {
        const submission =
            config.value?.userInput?.mode === 'confirm'
                ? { confirmed: formData.confirmed }
                : { value: formData.value };

        emit('submit', submission);
    }
};
</script>

<template>
    <div
        class="input-task-form p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm"
    >
        <h3
            class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2"
        >
            <span class="text-blue-500">⌨️</span> Input Required
        </h3>

        <div v-if="!config" class="text-red-500 p-4 bg-red-50 dark:bg-red-900/20 rounded">
            Invalid Input Configuration.
        </div>

        <form v-else @submit.prevent="handleSubmit" class="space-y-6">
            <!-- User Input Source -->
            <div v-if="config.sourceType === 'USER_INPUT' && config.userInput">
                <div class="form-group">
                    <label
                        class="block text-base font-medium text-gray-800 dark:text-gray-200 mb-2"
                    >
                        {{ config.userInput.message }}
                        <span v-if="config.userInput.required" class="text-red-500">*</span>
                    </label>

                    <!-- Short Text Input -->
                    <input
                        v-if="config.userInput.mode === 'short'"
                        type="text"
                        v-model="formData.value"
                        class="w-full px-4 py-2 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                        :placeholder="config.userInput.placeholder || 'Enter text...'"
                    />

                    <!-- Long Text Input -->
                    <textarea
                        v-else-if="config.userInput.mode === 'long'"
                        v-model="formData.value"
                        rows="5"
                        class="w-full px-4 py-2 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                        :placeholder="config.userInput.placeholder || 'Enter detailed text...'"
                    ></textarea>

                    <!-- Confirmation -->
                    <div
                        v-else-if="config.userInput.mode === 'confirm'"
                        class="flex items-center p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                    >
                        <input
                            type="checkbox"
                            id="confirm-check"
                            v-model="formData.confirmed"
                            class="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                        />
                        <label
                            for="confirm-check"
                            class="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none"
                        >
                            {{ config.userInput.placeholder || 'I confirm appropriately' }}
                        </label>
                    </div>
                </div>
            </div>

            <!-- Validation Error -->
            <div
                v-if="error.message"
                class="text-sm text-red-600 bg-red-50 dark:bg-red-900/10 p-2 rounded flex items-center gap-2"
            >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    ></path>
                </svg>
                {{ error.message }}
            </div>

            <!-- Actions -->
            <div class="flex justify-end space-x-3 pt-2">
                <button
                    type="submit"
                    class="px-6 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors flex items-center gap-2"
                >
                    <span>Submit Input</span>
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M14 5l7 7m0 0l-7 7m7-7H3"
                        ></path>
                    </svg>
                </button>
            </div>
        </form>
    </div>
</template>
