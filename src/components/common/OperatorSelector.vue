<template>
    <div class="operator-selector">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Assigned Operator
        </label>
        <div class="flex gap-2">
            <select
                :value="modelValue"
                class="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                @change="handleChange"
            >
                <option :value="null">No Operator (Use Task Settings)</option>
                <option v-for="operator in operators" :key="operator.id" :value="operator.id">
                    {{ operator.avatar || '🤖' }} {{ operator.name }} - {{ operator.role }}
                </option>
            </select>
            <button
                v-if="modelValue"
                class="px-3 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                title="Clear operator assignment"
                @click="handleClear"
            >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                    />
                </svg>
            </button>
        </div>
        <p v-if="selectedOperator" class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Using {{ selectedOperator.aiProvider }} / {{ selectedOperator.aiModel }}
        </p>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { Operator } from '@core/types/database';

interface Props {
    modelValue: number | null;
    projectId?: number | null;
}

const props = withDefaults(defineProps<Props>(), {
    projectId: null,
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: number | null): void;
}>();

const operators = ref<Operator[]>([]);

onMounted(async () => {
    await loadOperators();
});

async function loadOperators() {
    try {
        // Load operators for this project (or global if projectId is null)
        operators.value = await window.electron.operators.list(props.projectId ?? undefined);
    } catch (error) {
        console.error('Failed to load operators:', error);
    }
}

const selectedOperator = computed(() => {
    if (!props.modelValue) return null;
    return operators.value.find((op) => op.id === props.modelValue);
});

function handleChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const value = target.value === 'null' ? null : parseInt(target.value);
    emit('update:modelValue', value);
}

function handleClear() {
    emit('update:modelValue', null);
}
</script>

<style scoped>
.operator-selector select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
    background-position: right 0.5rem center;
    background-repeat: no-repeat;
    background-size: 1.5em 1.5em;
    padding-right: 2.5rem;
}
</style>
