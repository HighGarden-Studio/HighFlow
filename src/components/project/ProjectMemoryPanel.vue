<script setup lang="ts">
/**
 * ProjectMemoryPanel - Read-only view of project AI context and memory
 *
 * Displays:
 * - Project Overview (Goal, Constraints, Phase)
 * - Project Memory (Summary, Recent Decisions, Glossary)
 */

import { computed, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Project, ProjectMemory, DecisionLog, Operator } from '@core/types/database';
import { getAPI } from '../../utils/electron';

const { t } = useI18n();

interface Props {
    project: Project;
}

const props = defineProps<Props>();

// Reset confirmation state
const showResetConfirm = ref(false);
const isResetting = ref(false);

// Curator operator management
const operators = ref<Operator[]>([]);
const selectedCuratorId = ref<number | null>(props.project.curatorOperatorId || null);
const isLoadingOperators = ref(false);

// Load available operators on mount
onMounted(async () => {
    isLoadingOperators.value = true;
    try {
        const api = getAPI();
        const result = await api.operators.list(props.project.id);
        operators.value = result;
    } catch (error) {
        console.error('Failed to load operators:', error);
    } finally {
        isLoadingOperators.value = false;
    }
});

// Get global curator and other operators
const globalCurator = computed(() => operators.value.find((op) => op.isCurator && !op.projectId));

const availableOperators = computed(() => operators.value.filter((op) => op.isActive));

const selectedOperatorName = computed(() => {
    if (!selectedCuratorId.value) {
        return globalCurator.value?.name || t('project.memory.global_default');
    }
    const selected = operators.value.find((op) => op.id === selectedCuratorId.value);
    return selected?.name || t('common.error');
});

// Update project curator
async function updateCurator(operatorId: number | null) {
    try {
        const api = getAPI();
        await api.projects.update(props.project.id, {
            curatorOperatorId: operatorId,
        });
        selectedCuratorId.value = operatorId;
        console.log(`[ProjectMemoryPanel] Updated curator to: ${operatorId || 'default'}`);
    } catch (error) {
        console.error('Failed to update curator:', error);
    }
}

// Reset project memory
async function resetMemory() {
    isResetting.value = true;
    try {
        const api = getAPI();
        await api.projects.update(props.project.id, {
            memory: JSON.stringify({
                summary: '',
                recentDecisions: [],
                glossary: {},
                lastUpdatedAt: new Date().toISOString(),
            }),
        });
        showResetConfirm.value = false;
        console.log('[ProjectMemoryPanel] Memory reset successfully');
        // Reload the page to show updated memory
        window.location.reload();
    } catch (error) {
        console.error('Failed to reset memory:', error);
        alert(t('project.msg.reset_fail') + ': ' + error);
    } finally {
        isResetting.value = false;
    }
}

// Computed properties for template
const hasContextInfo = computed(() => {
    return props.project.goal || props.project.constraints || props.project.phase;
});

const memory = computed<ProjectMemory | null>(() => {
    if (!props.project.memory) return null;
    if (typeof props.project.memory === 'string') {
        try {
            return JSON.parse(props.project.memory);
        } catch {
            return null;
        }
    }
    return props.project.memory;
});

const hasMemory = computed(() => {
    if (!memory.value) return false;
    return (
        memory.value.summary ||
        (memory.value.recentDecisions?.length || 0) > 0 ||
        Object.keys(memory.value.glossary || {}).length > 0
    );
});

const recentDecisions = computed<DecisionLog[]>(() => {
    return memory.value?.recentDecisions?.slice(-10).reverse() || [];
});

const glossaryEntries = computed(() => {
    const glossary = memory.value?.glossary || {};
    return Object.entries(glossary).sort(([a], [b]) => a.localeCompare(b));
});

const lastUpdatedFormatted = computed(() => {
    if (!memory.value?.lastUpdatedAt) return null;
    try {
        const date = new Date(memory.value.lastUpdatedAt);
        // Use default locale or explicit undefined to use browser locale
        // Include time in the output
        return date.toLocaleString(undefined, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return memory.value.lastUpdatedAt;
    }
});
</script>

<template>
    <div class="project-memory-panel">
        <!-- Curator Settings Section -->
        <section class="memory-section curator-section">
            <h3 class="section-title">
                <span class="icon">🤖</span>
                {{ t('project.memory.curator_settings') }}
            </h3>
            <div class="curator-config">
                <div class="config-row">
                    <label class="config-label">{{ t('project.memory.memory_curator') }}</label>
                    <select
                        v-model="selectedCuratorId"
                        class="curator-select"
                        :disabled="isLoadingOperators"
                        @change="updateCurator(selectedCuratorId)"
                    >
                        <option :value="null">
                            {{ globalCurator?.name || t('project.memory.sys_curator') }} ({{
                                t('project.memory.global_default')
                            }})
                        </option>
                        <option
                            v-for="operator in availableOperators.filter(
                                (op) => !op.isCurator || op.projectId
                            )"
                            :key="operator.id"
                            :value="operator.id"
                        >
                            {{ operator.name }} ({{ operator.role }})
                        </option>
                    </select>
                </div>
                <p class="config-hint">
                    <span class="hint-icon">ℹ️</span>
                    {{ t('project.memory.curator_tip') }}
                </p>
            </div>
        </section>

        <!-- Empty State -->
        <div v-if="!hasContextInfo && !hasMemory" class="empty-state">
            <div class="empty-icon">✨</div>
            <h3>{{ t('project.memory.no_context_title') }}</h3>
            <p class="whitespace-pre-wrap">{{ t('project.memory.no_context_desc') }}</p>
        </div>

        <!-- Project Overview Section -->
        <section v-if="hasContextInfo" class="memory-section">
            <h3 class="section-title">
                <span class="icon">📋</span>
                {{ t('project.memory.project_overview') }}
            </h3>
            <div class="overview-grid">
                <div v-if="project.goal" class="overview-item">
                    <label>{{ t('project.memory.goal') }}</label>
                    <pre class="overview-content">{{ project.goal }}</pre>
                </div>
                <div v-if="project.constraints" class="overview-item">
                    <label>{{ t('project.memory.constraints') }}</label>
                    <pre class="overview-content">{{ project.constraints }}</pre>
                </div>
                <div v-if="project.phase" class="overview-item">
                    <label>{{ t('project.memory.phase') }}</label>
                    <div class="phase-badge">{{ project.phase }}</div>
                </div>
            </div>
        </section>

        <!-- Project Memory Section -->
        <section v-if="hasMemory" class="memory-section">
            <div class="flex items-center justify-between mb-4">
                <h3 class="section-title mb-0">
                    <span class="icon">✨</span>
                    {{ t('project.memory.title') }}
                    <span v-if="lastUpdatedFormatted" class="last-updated">
                        {{ t('project.memory.last_updated', { date: lastUpdatedFormatted }) }}
                    </span>
                </h3>
                <button
                    class="px-3 py-1.5 text-xs font-medium rounded bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors flex items-center gap-1.5"
                    :title="t('project.memory.reset_confirm_title')"
                    @click="showResetConfirm = true"
                >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                    </svg>
                    {{ t('project.memory.reset_btn') }}
                </button>
            </div>

            <!-- Summary -->
            <div v-if="memory?.summary" class="memory-subsection">
                <h4>{{ t('project.memory.summary') }}</h4>
                <pre class="memory-content summary-box">{{ memory.summary }}</pre>
            </div>

            <!-- Recent Decisions -->
            <div v-if="recentDecisions.length > 0" class="memory-subsection">
                <h4>
                    {{ t('project.memory.recent_decisions', { count: recentDecisions.length }) }}
                </h4>
                <div class="decisions-timeline">
                    <div
                        v-for="(decision, index) in recentDecisions"
                        :key="index"
                        class="decision-item"
                    >
                        <div class="decision-date">{{ decision.date }}</div>
                        <div class="decision-content">
                            <span v-if="decision.taskId" class="task-badge">
                                {{ t('project.memory.task_badge', { id: decision.taskId }) }}
                            </span>
                            {{ decision.summary }}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Glossary -->
            <div v-if="glossaryEntries.length > 0" class="memory-subsection">
                <h4>{{ t('project.memory.glossary', { count: glossaryEntries.length }) }}</h4>
                <div class="glossary-table">
                    <div
                        v-for="[term, definition] in glossaryEntries"
                        :key="term"
                        class="glossary-item"
                    >
                        <span class="term">{{ term }}</span>
                        <span class="definition">{{ definition }}</span>
                    </div>
                </div>
            </div>
        </section>

        <!-- Info Notice -->
        <div v-if="hasMemory" class="info-notice">
            <span class="info-icon">ℹ️</span>
            {{ t('project.memory.info_notice') }}
        </div>

        <!-- Reset Confirmation Dialog -->
        <div
            v-if="showResetConfirm"
            class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            @click.self="showResetConfirm = false"
        >
            <div
                class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
                @click.stop
            >
                <div class="flex items-start gap-4">
                    <div
                        class="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center"
                    >
                        <svg
                            class="w-6 h-6 text-red-600 dark:text-red-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                        </svg>
                    </div>
                    <div class="flex-1">
                        <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                            {{ t('project.memory.reset_confirm_title') }}
                        </h3>
                        <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">
                            {{ t('project.memory.reset_confirm_desc') }}
                        </p>
                        <div class="flex gap-3 justify-end">
                            <button
                                :disabled="isResetting"
                                class="px-4 py-2 text-sm font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                                @click="showResetConfirm = false"
                            >
                                {{ t('project.memory.cancel') }}
                            </button>
                            <button
                                :disabled="isResetting"
                                class="px-4 py-2 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                @click="resetMemory"
                            >
                                <svg
                                    v-if="isResetting"
                                    class="animate-spin h-4 w-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        class="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        stroke-width="4"
                                    ></circle>
                                    <path
                                        class="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                </svg>
                                {{
                                    isResetting
                                        ? t('project.memory.resetting')
                                        : t('project.memory.reset')
                                }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.project-memory-panel {
    padding: 1.5rem;
    max-height: 70vh;
    overflow-y: auto;
}

.empty-state {
    text-align: center;
    padding: 3rem 2rem;
    color: var(--text-secondary);
}

.empty-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.empty-state h3 {
    color: var(--text-primary);
    margin-bottom: 0.5rem;
}

.empty-state p {
    font-size: 0.9rem;
    line-height: 1.6;
}

.memory-section {
    margin-bottom: 2rem;
}

.curator-section {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 1.5rem;
    border: 1px solid var(--border-color);
}

.curator-config {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.config-row {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.config-label {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-secondary);
}

.curator-select {
    padding: 0.625rem 0.875rem;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s;
}

.curator-select:hover:not(:disabled) {
    border-color: var(--primary-color);
}

.curator-select:focus {
    outline: none;
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.curator-select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.config-hint {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--text-tertiary);
    line-height: 1.5;
    margin: 0;
}

.hint-icon {
    flex-shrink: 0;
}

.section-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--border-color);
}

.section-title .icon {
    font-size: 1.2rem;
}

.section-title .last-updated {
    margin-left: auto;
    font-size: 0.75rem;
    font-weight: normal;
    color: var(--text-tertiary);
}

.overview-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.overview-item {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 1rem;
}

.overview-item label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 0.5rem;
}

.overview-content {
    color: var(--text-primary);
    font-size: 0.95rem;
    line-height: 1.6;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: inherit;
    margin: 0;
}

.phase-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    background: var(--primary-color);
    color: white;
    border-radius: 12px;
    font-size: 0.85rem;
    font-weight: 500;
}

.memory-subsection {
    margin-bottom: 1.5rem;
}

.memory-subsection h4 {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 0.75rem;
}

.memory-content {
    color: var(--text-primary);
    line-height: 1.6;
}

.summary-box {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 1rem;
    border-left: 3px solid var(--primary-color);
    white-space: pre-wrap;
    word-wrap: break-word;
}

.decisions-timeline {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.decision-item {
    display: flex;
    gap: 1rem;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 8px;
    align-items: flex-start;
}

.decision-date {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-tertiary);
    white-space: nowrap;
    min-width: 80px;
}

.decision-content {
    flex: 1;
    font-size: 0.9rem;
    color: var(--text-primary);
    line-height: 1.4;
}

.task-badge {
    display: inline-block;
    padding: 0.125rem 0.375rem;
    background: var(--bg-tertiary);
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin-right: 0.5rem;
}

.glossary-table {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.glossary-item {
    display: flex;
    gap: 1rem;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-radius: 8px;
}

.glossary-item .term {
    font-weight: 600;
    color: var(--primary-color);
    min-width: 120px;
}

.glossary-item .definition {
    flex: 1;
    color: var(--text-primary);
    font-size: 0.9rem;
}

.info-notice {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 1rem;
    background: var(--bg-info);
    border-radius: 8px;
    font-size: 0.85rem;
    color: var(--text-secondary);
    line-height: 1.5;
}

.info-icon {
    flex-shrink: 0;
}

/* Scrollbar styling */
.project-memory-panel::-webkit-scrollbar {
    width: 6px;
}

.project-memory-panel::-webkit-scrollbar-track {
    background: transparent;
}

.project-memory-panel::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 3px;
}

.project-memory-panel::-webkit-scrollbar-thumb:hover {
    background: var(--text-tertiary);
}
</style>
