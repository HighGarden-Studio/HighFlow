<template>
    <div class="operator-card" :style="{ borderLeft: `4px solid ${operator.color || '#667eea'}` }">
        <!-- Main Content -->
        <div class="card-content">
            <div class="operator-header">
                <div class="operator-avatar">
                    {{ operator.avatar || '🤖' }}
                </div>
                <div class="operator-info">
                    <h3>{{ operator.name }}</h3>
                    <span class="operator-role">{{ operator.role }}</span>
                </div>
            </div>

            <div class="operator-config">
                <!-- AI Provider (New) -->
                <div class="config-item">
                    <div
                        class="provider-icon-wrapper bg-gradient-to-br"
                        :class="getProviderColorClass(operator.aiProvider)"
                    >
                        <Icon
                            :icon="getProviderIcon(operator.aiProvider || '')"
                            class="provider-icon text-white"
                        />
                    </div>
                    <span>{{ getProviderLabel(operator.aiProvider) }}</span>
                </div>
                <!-- AI Model -->
                <div class="config-item">
                    <i class="ph ph-brain"></i>
                    <span>{{ operator.aiModel }}</span>
                </div>
                <div v-if="operator.isReviewer" class="config-item">
                    <i class="ph ph-check-circle"></i>
                    <span>QA Reviewer</span>
                </div>
            </div>

            <div v-if="operator.usageCount > 0" class="operator-stats">
                <span>{{ operator.usageCount }} tasks</span>
                <span v-if="operator.successRate"
                    >{{ Math.round(operator.successRate * 100) }}% success</span
                >
            </div>
        </div>

        <!-- Footer Actions (Moved) -->
        <div class="operator-actions">
            <button class="btn-action btn-edit" title="Edit" @click="$emit('edit', operator)">
                <i class="ph ph-pencil"></i>
                <span>Edit</span>
            </button>
            <button
                v-if="!operator.isCurator"
                class="btn-action btn-delete"
                title="Delete"
                @click="$emit('delete', operator)"
            >
                <i class="ph ph-trash"></i>
                <span>Delete</span>
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue';
import type { Operator } from '@core/types/database';
import { getProviderIcon } from '../../utils/iconMapping';

defineProps<{
    operator: Operator;
}>();

defineEmits<{
    edit: [operator: Operator];
    delete: [operator: Operator];
}>();

const providerLabels: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google Gemini',
    mistral: 'Mistral AI',
    groq: 'Groq',
    lmstudio: 'LM Studio',
    ollama: 'Ollama',
};

const providerColors: Record<string, string> = {
    openai: 'from-green-400 to-teal-500',
    anthropic: 'from-orange-400 to-amber-500',
    google: 'from-blue-400 to-indigo-500',
    mistral: 'from-purple-500 to-indigo-600',
    groq: 'from-amber-500 to-orange-600',
    lmstudio: 'from-emerald-500 to-green-600',
    ollama: 'from-gray-600 to-gray-800',
    default: 'from-gray-400 to-gray-500',
};

function getProviderLabel(provider?: string): string {
    if (!provider) return '';
    return providerLabels[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}

function getProviderColorClass(provider?: string): string {
    if (!provider) return providerColors.default;
    const normalized = provider.toLowerCase();
    return providerColors[normalized] ?? providerColors.default;
}
</script>

<style scoped>
.operator-card {
    background: var(--color-bg-secondary);
    border: 1px solid rgba(255, 255, 255, 0.1); /* Explicit border color */
    border-radius: 0.75rem;
    padding: 0;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    height: 100%;
}

.operator-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
}

.card-content {
    padding: 1.5rem;
    flex: 1;
}

.operator-header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1rem;
}

.operator-avatar {
    font-size: 2.5rem;
    width: 3.5rem;
    height: 3.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-tertiary);
    border-radius: 0.75rem;
}

.operator-info {
    flex: 1;
    min-width: 0; /* Text truncation fix */
}

.operator-info h3 {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 0.25rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.operator-role {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
    display: block; /* Ensure it takes width */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.operator-config {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
}

.config-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--color-text-secondary);
}

.provider-icon-wrapper {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.config-item i,
.provider-icon {
    font-size: 1rem;
    width: 1rem; /* Fixed width for alignment */
    text-align: center;
    display: inline-block;
    color: white; /* Ensure white for colored backgrounds */
}

.config-item i {
    color: var(--color-text-secondary); /* Restore default color for non-wrapped icons */
}

.operator-stats {
    display: flex;
    gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    font-size: 0.8125rem;
    color: var(--color-text-tertiary);
}

/* Footer Actions */
.operator-actions {
    display: flex;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.btn-action {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: transparent;
    border: none;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border-right: 1px solid rgba(255, 255, 255, 0.1); /* Explicit button border */
}

.btn-action:first-child {
    border-bottom-left-radius: 0.75rem;
}

.btn-action:last-child {
    border-right: none;
    border-bottom-right-radius: 0.75rem;
}

.btn-action i {
    font-size: 1.125rem;
}

.btn-edit {
    color: var(--color-text-secondary);
}

.btn-edit:hover {
    background: var(--color-bg-hover);
    color: #3b82f6;
}

.btn-delete {
    color: var(--color-text-secondary);
}

.btn-delete:hover {
    background: var(--color-bg-hover);
    color: #ef4444;
}
</style>
