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
                            <!-- Curator Locked Message -->
                            <div
                                v-if="form.isCurator"
                                class="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-start gap-3"
                            >
                                <div class="text-xl">🔒</div>
                                <div>
                                    <h4 class="text-sm font-semibold text-blue-200">
                                        System Curator
                                    </h4>
                                    <p class="text-xs text-blue-300/80 mt-1">
                                        For the System Curator, only AI Provider and Model settings
                                        can be modified. Other fields are locked to ensure system
                                        integrity.
                                    </p>
                                </div>
                            </div>

                            <!-- Name -->
                            <div :class="{ 'opacity-50 pointer-events-none': form.isCurator }">
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >Name</label
                                >
                                <input
                                    v-model="form.name"
                                    type="text"
                                    :disabled="form.isCurator"
                                    placeholder="Alex"
                                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                            </div>

                            <!-- Role Preset -->
                            <div :class="{ 'opacity-50 pointer-events-none': form.isCurator }">
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >Role Preset</label
                                >
                                <select
                                    v-model="selectedPreset"
                                    @change="onPresetChange"
                                    :disabled="form.isCurator"
                                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                            <div
                                v-if="selectedPreset === 'custom'"
                                :class="{ 'opacity-50 pointer-events-none': form.isCurator }"
                            >
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >Custom Role Name</label
                                >
                                <input
                                    v-model="form.role"
                                    type="text"
                                    :disabled="form.isCurator"
                                    placeholder="Enter custom role..."
                                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                            </div>

                            <!-- Avatar and Color Row -->
                            <div
                                class="grid grid-cols-2 gap-4"
                                :class="{ 'opacity-50 pointer-events-none': form.isCurator }"
                            >
                                <div>
                                    <label class="block text-sm font-medium text-gray-300 mb-2"
                                        >Avatar (Emoji)</label
                                    >
                                    <input
                                        v-model="form.avatar"
                                        type="text"
                                        :disabled="form.isCurator"
                                        placeholder="🧑‍💻"
                                        class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-center text-2xl disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-300 mb-2"
                                        >Color</label
                                    >
                                    <input
                                        v-model="form.color"
                                        type="color"
                                        :disabled="form.isCurator"
                                        class="w-full h-[42px] px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    />
                                </div>
                            </div>

                            <!-- AI Provider & Model -->
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >AI Provider & Model</label
                                >
                                <UnifiedAISelector
                                    :mode="aiMode"
                                    :provider="form.aiProvider"
                                    :model="form.aiModel"
                                    :local-agent="localAgent"
                                    :show-local-agents="true"
                                    :is-dev-project="true"
                                    label="AI Configuration"
                                    @update:mode="handleModeChange"
                                    @update:provider="handleProviderChange"
                                    @update:model="handleModelChange"
                                    @update:local-agent="handleLocalAgentChange"
                                />
                            </div>

                            <!-- System Prompt -->
                            <div :class="{ 'opacity-50 pointer-events-none': form.isCurator }">
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >System Prompt</label
                                >
                                <textarea
                                    v-model="form.systemPrompt"
                                    :disabled="form.isCurator"
                                    placeholder="You are a senior developer..."
                                    rows="8"
                                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all font-mono text-sm resize-vertical min-h-[200px] disabled:opacity-50 disabled:cursor-not-allowed"
                                ></textarea>
                                <p class="mt-2 text-xs text-gray-500 italic">
                                    {{
                                        form.isCurator
                                            ? 'System Prompt is locked for the Curator.'
                                            : selectedPreset === 'custom'
                                              ? 'Enter your custom system prompt'
                                              : 'Pre-filled from role preset. You can edit it.'
                                    }}
                                </p>
                            </div>

                            <!-- QA Reviewer Checkbox -->
                            <div
                                class="flex items-center gap-2"
                                :class="{ 'opacity-50 pointer-events-none': form.isCurator }"
                            >
                                <input
                                    v-model="form.isReviewer"
                                    type="checkbox"
                                    id="is-reviewer"
                                    :disabled="form.isCurator"
                                    class="w-4 h-4 rounded bg-gray-800 border-gray-700 text-purple-600 focus:ring-purple-500 focus:ring-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                                <label
                                    for="is-reviewer"
                                    class="text-sm text-gray-300 cursor-pointer select-none"
                                >
                                    Use as QA Reviewer
                                </label>
                            </div>
                            <!-- Tags -->
                            <div :class="{ 'opacity-50 pointer-events-none': form.isCurator }">
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >Tags</label
                                >
                                <div class="flex flex-wrap gap-2 mb-2">
                                    <div
                                        v-for="tag in form.tags"
                                        :key="tag"
                                        class="flex items-center gap-1 px-2 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-full text-xs"
                                    >
                                        <span>{{ tag }}</span>
                                        <button
                                            @click="removeTag(tag)"
                                            :disabled="form.isCurator"
                                            class="hover:text-white focus:outline-none disabled:cursor-not-allowed"
                                        >
                                            <svg
                                                class="w-3 h-3"
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
                                    <input
                                        v-model="tagInput"
                                        @keydown.enter.prevent="addTag"
                                        @keydown.comma.prevent="addTag"
                                        @blur="addTag"
                                        type="text"
                                        placeholder="Add tag..."
                                        class="flex-1 min-w-[100px] bg-transparent border-none text-white placeholder-gray-500 focus:outline-none focus:ring-0 text-sm"
                                    />
                                </div>
                                <div class="h-px bg-gray-700 w-full"></div>
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
import { ref, watch, computed, onMounted } from 'vue';
import type { Operator } from '@core/types/database';
import { getRolePresetOptions, getRolePreset } from '../../utils/operatorRolePresets';
import UnifiedAISelector from '../common/UnifiedAISelector.vue';
import { usePromptStore } from '../../stores/promptStore';

const props = defineProps<{
    operator?: Operator | null;
    open: boolean;
}>();

const emit = defineEmits<{
    close: [];
    save: [data: any];
}>();

const promptStore = usePromptStore();
const rolePresetOptions = getRolePresetOptions();
const selectedPreset = ref<string>('custom');
const aiMode = ref<'api' | 'local'>('api');
const localAgent = ref<string | null>(null);

const form = ref({
    name: '',
    role: '',
    avatar: '🤖',
    color: '#667eea',
    aiProvider: 'anthropic',
    aiModel: 'claude-3-5-sonnet-20241022',
    systemPrompt: '',
    isReviewer: false,
    isCurator: false,
    specialty: [] as string[],
    isActive: true,
    projectId: null as number | null,
    tags: [] as string[],
});

onMounted(() => {
    promptStore.init();
});

// Tag management
const tagInput = ref('');

function addTag() {
    const tag = tagInput.value.trim();
    if (tag && !form.value.tags.includes(tag)) {
        form.value.tags.push(tag);
    }
    tagInput.value = '';
}

function removeTag(tag: string) {
    if (form.value.isCurator) return;
    form.value.tags = form.value.tags.filter((t) => t !== tag);
}

// Get selected preset data
const selectedPresetData = computed(() => {
    if (selectedPreset.value === 'custom') return null;
    return getRolePreset(selectedPreset.value);
});

// Handle AI configuration changes
function handleModeChange(mode: 'api' | 'local') {
    aiMode.value = mode;
}

function handleProviderChange(provider: string | null) {
    if (provider) {
        form.value.aiProvider = provider as any;
    }
}

function handleModelChange(model: string | null) {
    if (model) {
        form.value.aiModel = model;
    }
}

function handleLocalAgentChange(agent: string | null) {
    localAgent.value = agent;
    // Map local agent to provider
    if (agent === 'claude') {
        form.value.aiProvider = 'claude-code' as any;
    } else if (agent === 'codex') {
        form.value.aiProvider = 'codex' as any;
    } else if (agent === 'antigravity') {
        form.value.aiProvider = 'antigravity' as any;
    }
}

// Handle preset change
function onPresetChange() {
    if (form.value.isCurator) return;

    const preset = selectedPresetData.value;
    if (preset) {
        // Auto-fill from preset
        form.value.role = preset.name;
        form.value.avatar = preset.emoji;
        form.value.systemPrompt = promptStore.getPrompt(preset.systemPromptId);
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
                isCurator: operator.isCurator || false,
                specialty: operator.specialty || [],
                isActive: operator.isActive,
                projectId: operator.projectId,
                tags: operator.tags || [],
            };

            // Detect Local Agent
            const provider = operator.aiProvider;
            if (['claude-code', 'codex', 'antigravity'].includes(provider as string)) {
                aiMode.value = 'local';
                const reverseMap: Record<string, string> = {
                    'claude-code': 'claude',
                    codex: 'codex',
                    antigravity: 'antigravity',
                };
                localAgent.value = reverseMap[provider as string] || null;
            } else {
                aiMode.value = 'api';
                localAgent.value = null;
            }

            // Try to match with preset
            const matchedPreset = rolePresetOptions.find((p) => p.label === operator.role);
            selectedPreset.value = matchedPreset?.value || 'custom';
        }
    },
    { immediate: true }
);

function save() {
    // Create a clean, serializable object for IPC transmission
    const operatorData = {
        name: form.value.name,
        role: form.value.role,
        avatar: form.value.avatar,
        color: form.value.color,
        aiProvider: form.value.aiProvider,
        aiModel: aiMode.value === 'local' ? 'cli-default' : form.value.aiModel,
        systemPrompt: form.value.systemPrompt,
        isReviewer: form.value.isReviewer ? 1 : 0,
        specialty: JSON.stringify(form.value.specialty || []),
        isActive: form.value.isActive ? 1 : 0,
        projectId: form.value.projectId,
        tags: JSON.stringify(form.value.tags || []),
    };

    emit('save', operatorData);
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
