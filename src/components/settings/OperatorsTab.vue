<template>
    <div class="operators-tab">
        <!-- Header -->
        <div class="operators-header">
            <div class="header-title">
                <h2>AI Operators</h2>
                <p>Create AI agent presets with roles and configurations</p>
            </div>
            <button class="btn-primary" @click="showCreateModal = true">
                <i class="ph ph-plus"></i>
                New Operator
            </button>
        </div>

        <!-- Operators List -->
        <div v-if="loading" class="loading-state">
            <i class="ph ph-spinner ph-spin"></i>
            Loading operators...
        </div>

        <div v-else-if="operators.length === 0" class="empty-state">
            <i class="ph ph-robot"></i>
            <h3>No Operators Yet</h3>
            <p>Create your first AI operator to get started</p>
        </div>

        <div v-else class="operators-grid">
            <OperatorCard
                v-for="operator in operators"
                :key="operator.id"
                :operator="operator"
                @edit="editOperator"
                @delete="deleteOperator"
            />
        </div>

        <!-- Create/Edit Modal -->
        <OperatorModal
            v-if="showCreateModal || selectedOperator"
            :operator="selectedOperator"
            :open="showCreateModal || selectedOperator !== null"
            @close="closeModal"
            @save="saveOperator"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { Operator } from '@core/types/database';
import OperatorCard from './OperatorCard.vue';
import OperatorModal from './OperatorModal.vue';

const operators = ref<Operator[]>([]);
const loading = ref(true);
const showCreateModal = ref(false);
const selectedOperator = ref<Operator | null>(null);

onMounted(async () => {
    await loadOperators();
});

async function loadOperators() {
    loading.value = true;
    try {
        // Get global operators (projectId = null)
        operators.value = await window.electron.invoke('operators:list', null);
    } catch (error) {
        console.error('Failed to load operators:', error);
    } finally {
        loading.value = false;
    }
}

function editOperator(operator: Operator) {
    selectedOperator.value = operator;
}

async function deleteOperator(operator: Operator) {
    if (!confirm(`Are you sure you want to delete "${operator.name}"?`)) {
        return;
    }

    try {
        await window.electron.invoke('operators:delete', operator.id);
        await loadOperators();
    } catch (error) {
        console.error('Failed to delete operator:', error);
        alert('Failed to delete operator');
    }
}

async function saveOperator(data: any) {
    try {
        if (selectedOperator.value) {
            await window.electron.invoke('operators:update', selectedOperator.value.id, data);
        } else {
            await window.electron.invoke('operators:create', data);
        }
        await loadOperators();
        closeModal();
    } catch (error) {
        console.error('Failed to save operator:', error);
        alert('Failed to save operator');
    }
}

function closeModal() {
    showCreateModal.value = false;
    selectedOperator.value = null;
}
</script>

<style scoped>
.operators-tab {
    padding: 2rem;
    max-width: 1200px;
    margin: 0 auto;
}

.operators-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
}

.header-title h2 {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 0.25rem;
}

.header-title p {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
}

.btn-primary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.loading-state {
    text-align: center;
    padding: 4rem;
    color: var(--color-text-secondary);
}

.loading-state i {
    font-size: 2rem;
    margin-bottom: 1rem;
}

.empty-state {
    text-align: center;
    padding: 4rem;
}

.empty-state i {
    font-size: 4rem;
    color: var(--color-text-tertiary);
    margin-bottom: 1rem;
}

.empty-state h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 0.5rem;
}

.empty-state p {
    color: var(--color-text-secondary);
    margin-bottom: 1.5rem;
}

.operators-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1.5rem;
}
</style>
