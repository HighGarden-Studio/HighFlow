<script setup lang="ts">
/**
 * ProjectMemoryPanel - Read-only view of project AI context and memory
 *
 * Displays:
 * - Project Overview (Goal, Constraints, Phase)
 * - Project Memory (Summary, Recent Decisions, Glossary)
 */

import { computed } from 'vue';
import type { Project, ProjectMemory, DecisionLog } from '@core/types/database';

interface Props {
    project: Project;
}

const props = defineProps<Props>();

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
        return date.toLocaleString('ko-KR', {
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
        <!-- Empty State -->
        <div v-if="!hasContextInfo && !hasMemory" class="empty-state">
            <div class="empty-icon">🧠</div>
            <h3>AI 컨텍스트가 없습니다</h3>
            <p>
                태스크가 완료되면 AI가 자동으로 프로젝트 메모리를 업데이트합니다.<br />
                프로젝트 목표, 제약조건, 단계를 설정하면 AI 에이전트들이 더 일관된 결과를
                생성합니다.
            </p>
        </div>

        <!-- Project Overview Section -->
        <section v-if="hasContextInfo" class="memory-section">
            <h3 class="section-title">
                <span class="icon">📋</span>
                프로젝트 개요
            </h3>
            <div class="overview-grid">
                <div v-if="project.goal" class="overview-item">
                    <label>목표 (Goal)</label>
                    <pre class="overview-content">{{ project.goal }}</pre>
                </div>
                <div v-if="project.constraints" class="overview-item">
                    <label>제약조건 / Non-Goals</label>
                    <pre class="overview-content">{{ project.constraints }}</pre>
                </div>
                <div v-if="project.phase" class="overview-item">
                    <label>현재 단계 (Phase)</label>
                    <div class="phase-badge">{{ project.phase }}</div>
                </div>
            </div>
        </section>

        <!-- Project Memory Section -->
        <section v-if="hasMemory" class="memory-section">
            <h3 class="section-title">
                <span class="icon">🧠</span>
                프로젝트 메모리
                <span v-if="lastUpdatedFormatted" class="last-updated">
                    마지막 업데이트: {{ lastUpdatedFormatted }}
                </span>
            </h3>

            <!-- Summary -->
            <div v-if="memory?.summary" class="memory-subsection">
                <h4>요약</h4>
                <pre class="memory-content summary-box">{{ memory.summary }}</pre>
            </div>

            <!-- Recent Decisions -->
            <div v-if="recentDecisions.length > 0" class="memory-subsection">
                <h4>최근 결정사항 ({{ recentDecisions.length }}개)</h4>
                <div class="decisions-timeline">
                    <div
                        v-for="(decision, index) in recentDecisions"
                        :key="index"
                        class="decision-item"
                    >
                        <div class="decision-date">{{ decision.date }}</div>
                        <div class="decision-content">
                            <span v-if="decision.taskId" class="task-badge">
                                Task #{{ decision.taskId }}
                            </span>
                            {{ decision.summary }}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Glossary -->
            <div v-if="glossaryEntries.length > 0" class="memory-subsection">
                <h4>용어집 ({{ glossaryEntries.length }}개)</h4>
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
            이 메모리는 AI Curator가 태스크 완료 시 자동으로 업데이트합니다. 모든 AI 에이전트가 이
            컨텍스트를 공유하여 일관된 작업을 수행합니다.
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
