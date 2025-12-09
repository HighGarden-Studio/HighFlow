<template>
    <div class="operator-card" :style="{ borderLeft: `4px solid ${operator.color || '#667eea'}` }">
        <div class="operator-header">
            <div class="operator-avatar">
                {{ operator.avatar || '🤖' }}
            </div>
            <div class="operator-info">
                <h3>{{ operator.name }}</h3>
                <span class="operator-role">{{ operator.role }}</span>
            </div>
            <div class="operator-actions">
                <button @click="$emit('edit', operator)" class="btn-icon btn-edit" title="Edit">
                    <i class="ph ph-pencil"></i>
                </button>
                <button
                    @click="$emit('delete', operator)"
                    class="btn-icon btn-danger"
                    title="Delete"
                >
                    <i class="ph ph-trash"></i>
                </button>
            </div>
        </div>

        <div class="operator-config">
            <div class="config-item">
                <i class="ph ph-brain"></i>
                <span>{{ operator.aiModel }}</span>
            </div>
            <div class="config-item" v-if="operator.isReviewer">
                <i class="ph ph-check-circle"></i>
                <span>QA Reviewer</span>
            </div>
        </div>

        <div class="operator-stats" v-if="operator.usageCount > 0">
            <span>{{ operator.usageCount }} tasks</span>
            <span v-if="operator.successRate"
                >{{ Math.round(operator.successRate * 100) }}% success</span
            >
        </div>
    </div>
</template>

<script setup lang="ts">
import type { Operator } from '@core/types/database';

defineProps<{
    operator: Operator;
}>();

defineEmits<{
    edit: [operator: Operator];
    delete: [operator: Operator];
}>();
</script>

<style scoped>
.operator-card {
    background: var(--color-bg-secondary);
    border-radius: 0.75rem;
    padding: 1.5rem;
    transition: all 0.2s;
}

.operator-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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
}

.operator-info h3 {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 0.25rem;
}

.operator-role {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
}

.operator-actions {
    display: flex;
    gap: 0.5rem;
}

.btn-icon {
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-tertiary);
    border: none;
    border-radius: 0.375rem;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.2s;
}

.btn-icon:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
}

.btn-edit {
    color: #3b82f6;
}

.btn-edit:hover {
    background: rgba(59, 130, 246, 0.1);
    color: #2563eb;
}

.btn-danger:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
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

.config-item i {
    font-size: 1rem;
}

.operator-stats {
    display: flex;
    gap: 1rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border);
    font-size: 0.8125rem;
    color: var(--color-text-tertiary);
}
</style>
