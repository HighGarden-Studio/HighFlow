<template>
    <Teleport to="body">
        <Transition
            enter-active-class="transition-opacity duration-200"
            enter-from-class="opacity-0"
            enter-to-class="opacity-100"
            leave-active-class="transition-opacity duration-200"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0"
        >
            <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
                <!-- Backdrop -->
                <div
                    class="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    @click="$emit('close')"
                />

                <!-- Modal Container -->
                <Transition
                    enter-active-class="transition-all duration-200"
                    enter-from-class="opacity-0 scale-95"
                    enter-to-class="opacity-100 scale-100"
                    leave-active-class="transition-all duration-200"
                    leave-from-class="opacity-100 scale-100"
                    leave-to-class="opacity-0 scale-95"
                >
                    <div
                        v-if="open"
                        class="relative w-full max-w-2xl max-h-[85vh] bg-gray-900 rounded-xl shadow-2xl border border-gray-700 overflow-hidden flex flex-col"
                    >
                        <!-- Modal Header -->
                        <div
                            class="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800/50"
                        >
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-2xl"
                                >
                                    {{ operator ? operator.avatar : '🤖' }}
                                </div>
                                <div>
                                    <h2 class="text-lg font-semibold text-white">
                                        {{ operator ? 'Edit Operator' : 'Create Operator' }}
                                    </h2>
                                    <p class="text-sm text-gray-400">
                                        AI agent preset configuration
                                    </p>
                                </div>
                            </div>
                            <button
                                @click="$emit('close')"
                                class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <svg
                                    class="w-5 h-5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>

                        <!-- Modal Body -->
                        <div class="flex-1 overflow-y-auto p-6 space-y-5">
                            <!-- Name -->
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >Name</label
                                >
                                <input
                                    v-model="form.name"
                                    type="text"
                                    placeholder="Alex"
                                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                                />
                            </div>

                            <!-- Role Preset -->
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >Role Preset</label
                                >
                                <select
                                    v-model="selectedPreset"
                                    @change="onPresetChange"
                                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                                >
                                    <option
                                        v-for="option in rolePresetOptions"
                                        :key="option.value"
                                        :value="option.value"
                                    >
                                        {{ option.emoji }} {{ option.label }}
                                    </option>
                                </select>
                                <div
                                    v-if="selectedPresetData"
                                    class="mt-2 p-3 bg-gray-800/50 border border-gray-700 rounded-lg text-sm text-gray-400"
                                >
                                    {{ selectedPresetData.description }}
                                </div>
                            </div>

                            <!-- Custom Role Name -->
                            <div v-if="selectedPreset === 'custom'">
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >Custom Role Name</label
                                >
                                <input
                                    v-model="form.role"
                                    type="text"
                                    placeholder="Enter custom role..."
                                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                                />
                            </div>

                            <!-- Avatar and Color Row -->
                            <div class="grid grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-300 mb-2"
                                        >Avatar (Emoji)</label
                                    >
                                    <input
                                        v-model="form.avatar"
                                        type="text"
                                        placeholder="🧑‍💻"
                                        class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-center text-2xl"
                                    />
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-300 mb-2"
                                        >Color</label
                                    >
                                    <input
                                        v-model="form.color"
                                        type="color"
                                        class="w-full h-[42px] px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                                    />
                                </div>
                            </div>

                            <!-- AI Provider & Model -->
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >AI Provider & Model</label
                                >
                                <UnifiedAISelector
                                    :model-value="{
                                        provider: form.aiProvider,
                                        model: form.aiModel,
                                        mode: 'api',
                                        localAgent: null,
                                    }"
                                    @update:model-value="handleAIChange"
                                    compact
                                />
                            </div>

                            <!-- System Prompt -->
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >System Prompt</label
                                >
                                <textarea
                                    v-model="form.systemPrompt"
                                    placeholder="You are a senior developer..."
                                    rows="8"
                                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all font-mono text-sm resize-vertical min-h-[200px]"
                                ></textarea>
                                <p class="mt-2 text-xs text-gray-500 italic">
                                    {{
                                        selectedPreset === 'custom'
                                            ? 'Enter your custom system prompt'
                                            : 'Pre-filled from role preset. You can edit it.'
                                    }}
                                </p>
                            </div>

                            <!-- QA Reviewer Checkbox -->
                            <div class="flex items-center gap-2">
                                <input
                                    v-model="form.isReviewer"
                                    type="checkbox"
                                    id="is-reviewer"
                                    class="w-4 h-4 rounded bg-gray-800 border-gray-700 text-purple-600 focus:ring-purple-500 focus:ring-2 cursor-pointer"
                                />
                                <label
                                    for="is-reviewer"
                                    class="text-sm text-gray-300 cursor-pointer select-none"
                                >
                                    Use as QA Reviewer
                                </label>
                            </div>
                        </div>

                        <!-- Modal Footer -->
                        <div class="px-6 py-4 border-t border-gray-700 bg-gray-800/50">
                            <div class="flex items-center justify-end gap-3">
                                <button
                                    @click="$emit('close')"
                                    class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    @click="save"
                                    class="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-lg transition-all shadow-lg shadow-purple-900/30"
                                >
                                    {{ operator ? 'Update' : 'Create' }}
                                </button>
                            </div>
                        </div>
                    </div>
                </Transition>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { Operator } from '@core/types/database';
import { getRolePresetOptions, getRolePreset } from '../../utils/operatorRolePresets';
import UnifiedAISelector from '../common/UnifiedAISelector.vue';

const props = defineProps<{
    operator?: Operator | null;
    open: boolean;
}>();

const emit = defineEmits<{
    close: [];
    save: [data: any];
}>();

const rolePresetOptions = getRolePresetOptions();
const selectedPreset = ref<string>('custom');

const form = ref({
    name: '',
    role: '',
    avatar: '🤖',
    color: '#667eea',
    aiProvider: 'anthropic',
    aiModel: 'claude-3-5-sonnet-20241022',
    systemPrompt: '',
    isReviewer: false,
    specialty: [] as string[],
    isActive: true,
    projectId: null as number | null,
});

// Get selected preset data
const selectedPresetData = computed(() => {
    if (selectedPreset.value === 'custom') return null;
    return getRolePreset(selectedPreset.value);
});

// Handle AI provider/model change from UnifiedAISelector
function handleAIChange(config: {
    provider: string | null;
    model: string | null;
    mode: string;
    localAgent: string | null;
}) {
    if (config.provider) {
        form.value.aiProvider = config.provider as any;
    }
    if (config.model) {
        form.value.aiModel = config.model;
    }
}

// Handle preset change
function onPresetChange() {
    const preset = selectedPresetData.value;
    if (preset) {
        // Auto-fill from preset
        form.value.role = preset.name;
        form.value.avatar = preset.emoji;
        form.value.systemPrompt = preset.systemPrompt;
        form.value.aiProvider = preset.recommendedProvider as any;
        form.value.aiModel = preset.recommendedModel;

        // Auto-generate name if empty
        if (!form.value.name) {
            form.value.name = preset.name.split(' ')[0]; // e.g., "Senior" from "Senior Developer"
        }
    } else {
        // Custom role - reset to defaults
        form.value.role = '';
        form.value.systemPrompt = '';
    }
}

watch(
    () => props.operator,
    (operator) => {
        if (operator) {
            form.value = {
                name: operator.name,
                role: operator.role,
                avatar: operator.avatar || '🤖',
                color: operator.color || '#667eea',
                aiProvider: operator.aiProvider,
                aiModel: operator.aiModel,
                systemPrompt: operator.systemPrompt || '',
                isReviewer: operator.isReviewer,
                specialty: operator.specialty || [],
                isActive: operator.isActive,
                projectId: operator.projectId,
            };

            // Try to match with preset
            const matchedPreset = rolePresetOptions.find((p) => p.label === operator.role);
            selectedPreset.value = matchedPreset?.value || 'custom';
        }
    },
    { immediate: true }
);

function save() {
    emit('save', form.value);
}
</script>

<style scoped>
/* Custom scrollbar for modal content */
.overflow-y-auto::-webkit-scrollbar {
    width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}
</style>
```
