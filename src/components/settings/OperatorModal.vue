<template>
    <div class="modal-overlay" @click.self="$emit('close')">
        <div class="modal-content operator-modal">
            <div class="modal-header">
                <h2>{{ operator ? 'Edit Operator' : 'Create Operator' }}</h2>
                <button @click="$emit('close')" class="btn-close">
                    <i class="ph ph-x"></i>
                </button>
            </div>

            <div class="modal-body">
                <div class="form-group">
                    <label>Name</label>
                    <input v-model="form.name" type="text" placeholder="Alex" />
                </div>

                <div class="form-group">
                    <label>Role Preset</label>
                    <select
                        v-model="selectedPreset"
                        @change="onPresetChange"
                        class="preset-selector"
                    >
                        <option
                            v-for="option in rolePresetOptions"
                            :key="option.value"
                            :value="option.value"
                        >
                            {{ option.emoji }} {{ option.label }}
                        </option>
                    </select>
                    <div v-if="selectedPresetData" class="preset-description">
                        {{ selectedPresetData.description }}
                    </div>
                </div>

                <div v-if="selectedPreset === 'custom'" class="form-group">
                    <label>Custom Role Name</label>
                    <input v-model="form.role" type="text" placeholder="Enter custom role..." />
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Avatar (Emoji)</label>
                        <input v-model="form.avatar" type="text" placeholder="🧑‍💻" />
                    </div>

                    <div class="form-group">
                        <label>Color</label>
                        <input v-model="form.color" type="color" />
                    </div>
                </div>

                <div class="form-group">
                    <label>AI Provider</label>
                    <select v-model="form.aiProvider">
                        <option value="anthropic">Anthropic (Claude)</option>
                        <option value="openai">OpenAI (GPT)</option>
                        <option value="google">Google (Gemini)</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>AI Model</label>
                    <input v-model="form.aiModel" type="text" placeholder="claude-3-5-sonnet" />
                </div>

                <div class="form-group">
                    <label>System Prompt</label>
                    <textarea
                        v-model="form.systemPrompt"
                        placeholder="You are a senior developer..."
                        rows="8"
                        class="system-prompt-textarea"
                    ></textarea>
                    <div class="hint-text">
                        {{
                            selectedPreset === 'custom'
                                ? 'Enter your custom system prompt'
                                : 'Pre-filled from role preset. You can edit it.'
                        }}
                    </div>
                </div>

                <div class="form-group">
                    <label class="checkbox-label">
                        <input v-model="form.isReviewer" type="checkbox" />
                        <span>Use as QA Reviewer</span>
                    </label>
                </div>
            </div>

            <div class="modal-footer">
                <button @click="$emit('close')" class="btn-secondary">Cancel</button>
                <button @click="save" class="btn-primary">
                    {{ operator ? 'Update' : 'Create' }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { Operator } from '@core/types/database';
import {
    getRolePresetOptions,
    getRolePreset,
    type RolePreset,
} from '../../utils/operatorRolePresets';

const props = defineProps<{
    operator?: Operator | null;
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
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-content {
    background: var(--color-bg-primary);
    border-radius: 1rem;
    max-width: 600px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid var(--color-border);
}

.modal-header h2 {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text-primary);
}

.btn-close {
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 0.375rem;
    color: var(--color-text-secondary);
    cursor: pointer;
}

.btn-close:hover {
    background: var(--color-bg-hover);
}

.modal-body {
    padding: 1.5rem;
}

.form-group {
    margin-bottom: 1.5rem;
}

.form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
}

.form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-secondary);
}

.form-group input,
.form-group select,
.form-group textarea {
    width: 100%;
    padding: 0.625rem;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    color: var(--color-text-primary);
    font-size: 0.875rem;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
    outline: none;
    border-color: #667eea;
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
}

.checkbox-label input[type='checkbox'] {
    width: auto;
}

.preset-selector {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
}

.preset-description {
    margin-top: 0.5rem;
    padding: 0.75rem;
    background: var(--color-bg-tertiary);
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    line-height: 1.5;
}

.system-prompt-textarea {
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 0.8125rem;
    line-height: 1.6;
    resize: vertical;
    min-height: 200px;
}

.hint-text {
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: var(--color-text-tertiary);
    font-style: italic;
}

.modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1.5rem;
    border-top: 1px solid var(--color-border);
}

.btn-secondary {
    padding: 0.625rem 1rem;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: 0.5rem;
    color: var(--color-text-primary);
    cursor: pointer;
}

.btn-primary {
    padding: 0.625rem 1rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border: none;
    border-radius: 0.5rem;
    color: white;
    cursor: pointer;
}
</style>
