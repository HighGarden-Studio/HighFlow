<script setup lang="ts">
import { reactive, computed, ref } from 'vue';
import type { Task, InputTaskConfig } from '@core/types/database';
import { getAPI } from '../../utils/electron';

interface Props {
    task: Task;
}

const props = defineProps<Props>();
const emit = defineEmits<{
    (e: 'submit', data: any): void;
    (e: 'cancel'): void;
}>();

const fileInput = ref<HTMLInputElement | null>(null);

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
    selectedOptionType: '', // 'option' or '__custom__' (for radio)
    customValue: '',
});

const error = reactive({ message: '' });

const validate = (): boolean => {
    error.message = '';

    if (config.value?.sourceType === 'LOCAL_FILE') {
        if (!formData.value) {
            error.message = '파일을 선택해주세요.';
            return false;
        }
        return true;
    }

    if (config.value?.sourceType === 'USER_INPUT' && config.value.userInput) {
        const { required, mode, options, allowCustom } = config.value.userInput;

        if (mode === 'confirm') {
            if (required && !formData.confirmed) {
                error.message = 'Confirmation is required';
                return false;
            }
        } else {
            // Check options logic
            if (options && options.length > 0) {
                let actualValue = formData.value;

                // Handle custom value logic
                if (allowCustom) {
                    if (
                        formData.selectedOptionType === '__custom__' ||
                        formData.value === '__custom__'
                    ) {
                        actualValue = formData.customValue;
                    }
                }

                if (required && !actualValue?.trim()) {
                    error.message = 'Selection or input is required';
                    return false;
                }
            } else {
                // Standard text input logic
                if (required && !formData.value.trim()) {
                    error.message = 'Input is required';
                    return false;
                }
            }
        }
    }
    return true;
};

const triggerFileSelect = async () => {
    // Try Electron native dialog first
    try {
        const result = await getAPI().fs.selectFile();
        if (result) {
            formData.value = result;
            return;
        }
    } catch (e) {
        // Fallback to HTML input
        console.warn('Native file selection failed, using fallback:', e);
    }

    // Fallback
    fileInput.value?.click();
};

const handleFileChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
        const file = input.files[0];
        if (!file) return;

        // In Electron, File object usually has 'path' property
        if ('path' in file) {
            formData.value = (file as any).path;
        } else {
            // Web fallback (might not work for backend file reading)
            formData.value = (file as any).name;
            error.message =
                '파일 경로를 가져올 수 없습니다. (브라우저 제한). 직접 경로를 입력해야 할 수도 있습니다.';
        }
    }
};

const handleSubmit = () => {
    if (validate()) {
        let submission: any;

        if (config.value?.sourceType === 'LOCAL_FILE') {
            submission = { filePath: formData.value };
        } else if (config.value?.userInput?.mode === 'confirm') {
            submission = { confirmed: formData.confirmed };
        } else {
            // Determine final value
            let finalValue = formData.value;
            if (config.value?.userInput?.allowCustom) {
                if (
                    formData.selectedOptionType === '__custom__' ||
                    formData.value === '__custom__'
                ) {
                    finalValue = formData.customValue;
                }
            }
            submission = { value: finalValue };
        }

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
                    <!-- Options Selection (Radio <= 3, Select > 3) -->
                    <div
                        v-if="config.userInput.options && config.userInput.options.length > 0"
                        class="space-y-3"
                    >
                        <!-- Radio Buttons for few options -->
                        <div
                            v-if="config.userInput.options.length <= 3"
                            class="flex flex-col gap-2"
                        >
                            <label
                                v-for="option in config.userInput.options"
                                :key="option"
                                class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 transition-all"
                            >
                                <input
                                    type="radio"
                                    :name="'option-' + task.id"
                                    :value="option"
                                    v-model="formData.value"
                                    class="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                />
                                <span class="text-sm text-gray-700 dark:text-gray-300">{{
                                    option
                                }}</span>
                            </label>

                            <!-- Custom Option Radio -->
                            <label
                                v-if="config.userInput.allowCustom"
                                class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 transition-all"
                            >
                                <input
                                    type="radio"
                                    :name="'option-' + task.id"
                                    value="__custom__"
                                    v-model="formData.selectedOptionType"
                                    class="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                                />
                                <span class="text-sm text-gray-700 dark:text-gray-300"
                                    >직접 입력</span
                                >
                            </label>
                        </div>

                        <!-- Select Dropdown for many options -->
                        <select
                            v-else
                            v-model="formData.value"
                            class="w-full px-4 py-2 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                        >
                            <option value="" disabled selected>옵션을 선택하세요</option>
                            <option
                                v-for="option in config.userInput.options"
                                :key="option"
                                :value="option"
                            >
                                {{ option }}
                            </option>
                            <option v-if="config.userInput.allowCustom" value="__custom__">
                                직접 입력...
                            </option>
                        </select>

                        <!-- Custom Input Field -->
                        <input
                            v-if="
                                config.userInput.allowCustom &&
                                (formData.selectedOptionType === '__custom__' ||
                                    formData.value === '__custom__')
                            "
                            type="text"
                            v-model="formData.customValue"
                            class="w-full px-4 py-2 mt-2 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                            placeholder="직접 입력하세요..."
                        />
                    </div>

                    <!-- Short Text Input (only if no options) -->
                    <input
                        v-else-if="config.userInput.mode === 'short'"
                        type="text"
                        v-model="formData.value"
                        class="w-full px-4 py-2 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white"
                        :placeholder="config.userInput.placeholder || 'Enter text...'"
                    />

                    <!-- Long Text Input (only if no options) -->
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

            <!-- Local File Source -->
            <div v-if="config.sourceType === 'LOCAL_FILE'">
                <div class="form-group space-y-4">
                    <label class="block text-base font-medium text-gray-800 dark:text-gray-200">
                        파일 선택
                        <span class="text-red-500">*</span>
                    </label>

                    <div
                        class="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                        @click="triggerFileSelect"
                    >
                        <div v-if="formData.value" class="text-center">
                            <div class="text-2xl mb-2">📄</div>
                            <div
                                class="text-sm font-medium text-gray-900 dark:text-white break-all"
                            >
                                {{ formData.value }}
                            </div>
                            <div class="text-xs text-blue-500 mt-2">클릭하여 변경</div>
                        </div>
                        <div v-else class="text-center">
                            <div class="text-2xl mb-2">📂</div>
                            <div class="text-sm font-medium text-gray-700 dark:text-gray-300">
                                파일을 선택하세요
                            </div>
                            <div class="text-xs text-gray-500 mt-1">
                                {{
                                    config.localFile?.acceptedExtensions?.length
                                        ? `허용: ${config.localFile.acceptedExtensions.join(', ')}`
                                        : '모든 파일'
                                }}
                            </div>
                        </div>
                        <input
                            type="file"
                            ref="fileInput"
                            class="hidden"
                            @change="handleFileChange"
                            :accept="
                                config.localFile?.acceptedExtensions
                                    ?.map((ext) => (ext.startsWith('.') ? ext : '.' + ext))
                                    .join(',')
                            "
                        />
                    </div>
                    <div class="text-xs text-gray-400">
                        * 선택된 파일 경로는 시스템에 의해 자동으로 읽힙니다.
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
                    type="button"
                    @click="$emit('cancel')"
                    class="px-6 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-lg text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    class="px-6 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors flex items-center gap-2"
                >
                    <span>{{
                        config.sourceType === 'LOCAL_FILE' ? 'Load File' : 'Submit Input'
                    }}</span>
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
