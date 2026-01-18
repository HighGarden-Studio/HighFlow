<template>
    <div class="mcp-tool-log">
        <!-- Overall Statistics (when timeline mode) -->
        <div v-if="showTimeline && logs.length > 0" class="overall-stats">
            <div class="stats-header">Tool Execution Summary</div>
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-label">Total Tools</span>
                    <span class="stat-value">{{ overallStats.total }}</span>
                </div>
                <div class="stat-item success">
                    <span class="stat-label">Successful</span>
                    <span class="stat-value">{{ overallStats.successful }}</span>
                </div>
                <div v-if="overallStats.failed > 0" class="stat-item failed">
                    <span class="stat-label">Failed</span>
                    <span class="stat-value">{{ overallStats.failed }}</span>
                </div>
                <div v-if="overallStats.avgDuration > 0" class="stat-item">
                    <span class="stat-label">Avg Duration</span>
                    <span class="stat-value">{{ overallStats.avgDuration }}ms</span>
                </div>
            </div>
        </div>

        <!-- Timeline View (grouped by phase) -->
        <div v-if="showTimeline && groupedByPhase" class="timeline-view">
            <div v-for="group in groupedByPhase" :key="group.phase" class="phase-group">
                <!-- Phase Header -->
                <div class="phase-header" @click="togglePhaseExpand(group.phase)">
                    <div class="phase-left">
                        <span class="phase-icon">{{
                            isPhaseExpanded(group.phase) ? '▼' : '▶'
                        }}</span>
                        <span class="phase-title">Phase {{ group.phase + 1 }}</span>
                        <span class="phase-count"
                            >{{ group.logs.length }} tool{{
                                group.logs.length > 1 ? 's' : ''
                            }}</span
                        >
                    </div>
                    <div class="phase-right">
                        <span class="phase-stats">
                            {{ getPhaseStats(group.logs).successful }} success
                            <span v-if="getPhaseStats(group.logs).failed > 0" class="failed-count">
                                / {{ getPhaseStats(group.logs).failed }} failed
                            </span>
                        </span>
                    </div>
                </div>

                <!-- Phase Content (Collapsible) -->
                <div v-if="isPhaseExpanded(group.phase)" class="phase-content">
                    <div v-for="log in group.logs" :key="log.id" class="log-entry">
                        <!-- Log Header -->
                        <div class="log-header" @click="toggleExpand(logs.indexOf(log))">
                            <div class="header-left">
                                <span class="icon" :class="log.status">
                                    <i
                                        v-if="log.status === 'running'"
                                        class="icon-spinner animate-spin"
                                        >⟳</i
                                    >
                                    <i v-else-if="log.status === 'success'" class="icon-check">✓</i>
                                    <i v-else class="icon-error">✕</i>
                                </span>
                                <span class="tool-name">{{ log.tool }}</span>
                            </div>
                            <div class="header-right">
                                <span v-if="log.duration" class="duration">{{ log.duration }}</span>
                                <span class="expand-icon">{{
                                    isExpanded(logs.indexOf(log)) ? '▼' : '▶'
                                }}</span>
                            </div>
                        </div>

                        <!-- Log Details (Collapsible) -->
                        <div v-if="isExpanded(logs.indexOf(log))" class="log-details">
                            <div v-if="log.input" class="detail-section">
                                <div class="section-label">Input</div>
                                <div class="code-block input-block">
                                    <pre>{{ formatJson(log.input) }}</pre>
                                </div>
                            </div>
                            <div v-if="log.output" class="detail-section">
                                <div class="section-label">Output</div>
                                <div class="code-block output-block">
                                    <pre>{{ formatJson(log.output) }}</pre>
                                </div>
                            </div>
                            <div v-if="log.error" class="detail-section error-section">
                                <div class="section-label">Error</div>
                                <div class="error-message">{{ log.error }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Simple List View (default, no timeline) -->
        <div v-else>
            <div v-for="(log, index) in logs" :key="index" class="log-entry">
                <!-- Header (Always visible) -->
                <div
                    class="log-header"
                    :class="{ expanded: isExpanded(index) }"
                    @click="toggleExpand(index)"
                >
                    <div class="header-left">
                        <span class="icon" :class="log.status">
                            <i v-if="log.status === 'running'" class="icon-spinner animate-spin"
                                >⟳</i
                            >
                            <i v-else-if="log.status === 'success'" class="icon-check">✓</i>
                            <i v-else class="icon-error">✕</i>
                        </span>
                        <span class="tool-name">{{ log.tool }}</span>
                    </div>
                    <div class="header-right">
                        <span v-if="log.duration" class="duration">{{ log.duration }}</span>
                        <span class="expand-icon">{{ isExpanded(index) ? '▼' : '▶' }}</span>
                    </div>
                </div>

                <!-- Details (Collapsible) -->
                <div v-if="isExpanded(index)" class="log-details">
                    <!-- Input Params -->
                    <div v-if="log.input" class="detail-section">
                        <div class="section-label">Input</div>
                        <div class="code-block input-block">
                            <pre>{{ formatJson(log.input) }}</pre>
                        </div>
                    </div>

                    <!-- Result/Output -->
                    <div v-if="log.output" class="detail-section">
                        <div class="section-label">Output</div>
                        <div class="code-block output-block">
                            <pre>{{ formatJson(log.output) }}</pre>
                        </div>
                    </div>

                    <!-- Error -->
                    <div v-if="log.error" class="detail-section error-section">
                        <div class="section-label">Error</div>
                        <div class="error-message">
                            {{ log.error }}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

export interface LogEntry {
    id: string;
    tool: string;
    status: 'running' | 'success' | 'failed';
    duration?: string;
    input?: any;
    output?: any;
    error?: string;
    timestamp?: Date;
    phase?: number; // Optional phase identifier
}

const props = defineProps<{
    logs: LogEntry[];
    showTimeline?: boolean; // When true, show enhanced timeline view
}>();

const expandedIndices = ref<Set<number>>(new Set());
const expandedPhases = ref<Set<number>>(new Set([0])); // First phase expanded by default

function isExpanded(index: number): boolean {
    return expandedIndices.value.has(index);
}

function toggleExpand(index: number) {
    if (expandedIndices.value.has(index)) {
        expandedIndices.value.delete(index);
    } else {
        expandedIndices.value.add(index);
    }
}

function isPhaseExpanded(phase: number): boolean {
    return expandedPhases.value.has(phase);
}

function togglePhaseExpand(phase: number) {
    if (expandedPhases.value.has(phase)) {
        expandedPhases.value.delete(phase);
    } else {
        expandedPhases.value.add(phase);
    }
}

function formatJson(data: any): string {
    if (typeof data === 'string') return data;
    try {
        return JSON.stringify(data, null, 2);
    } catch (e) {
        return String(data);
    }
}

// Group logs by phase
const groupedByPhase = computed(() => {
    if (!props.showTimeline) return null;

    const phases = new Map<number, LogEntry[]>();
    props.logs.forEach((log) => {
        const phase = log.phase ?? 0;
        if (!phases.has(phase)) {
            phases.set(phase, []);
        }
        phases.get(phase)!.push(log);
    });

    return Array.from(phases.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([phase, logs]) => ({ phase, logs }));
});

// Calculate statistics per phase
function getPhaseStats(logs: LogEntry[]) {
    const successful = logs.filter((l) => l.status === 'success').length;
    const failed = logs.filter((l) => l.status === 'failed').length;
    const running = logs.filter((l) => l.status === 'running').length;

    // Parse duration strings like "234ms" and sum them
    let totalDuration = 0;
    logs.forEach((log) => {
        if (log.duration) {
            const match = log.duration.match(/(\d+)ms/);
            if (match && match[1]) {
                totalDuration += parseInt(match[1]);
            }
        }
    });

    return {
        total: logs.length,
        successful,
        failed,
        running,
        avgDuration:
            totalDuration > 0 && successful > 0 ? Math.round(totalDuration / successful) : 0,
        totalDuration,
    };
}

// Overall statistics
const overallStats = computed(() => {
    return getPhaseStats(props.logs);
});
</script>

<style scoped>
.mcp-tool-log {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
    font-size: 0.9em;
}

.log-entry {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    overflow: hidden;
}

.log-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--bg-tertiary);
    cursor: pointer;
    user-select: none;
    transition: background-color 0.2s;
}

.log-header:hover {
    background: var(--bg-hover);
}

.header-left {
    display: flex;
    align-items: center;
    gap: 8px;
}

.icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    font-size: 12px;
    font-weight: bold;
}

.icon.success {
    color: var(--success-color);
    background: rgba(var(--success-color-rgb), 0.1);
}

.icon.failed {
    color: var(--error-color);
    background: rgba(var(--error-color-rgb), 0.1);
}

.icon.running {
    color: var(--primary-color);
}

.animate-spin {
    animation: spin 1s linear infinite;
    display: inline-block;
}

.tool-name {
    font-weight: 600;
    color: var(--text-primary);
}

.header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-muted);
    font-size: 0.85em;
}

.expand-icon {
    font-size: 10px;
}

.log-details {
    padding: 12px;
    border-top: 1px solid var(--border-color);
    background: var(--bg-secondary);
}

.detail-section {
    margin-bottom: 12px;
}

.detail-section:last-child {
    margin-bottom: 0;
}

.section-label {
    font-size: 0.8em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin-bottom: 4px;
    font-weight: 600;
}

.code-block {
    background: var(--bg-primary);
    padding: 8px;
    border-radius: 4px;
    overflow-x: auto;
    font-family: monospace;
    font-size: 0.9em;
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
}

.error-message {
    color: var(--error-color);
    background: rgba(var(--error-color-rgb), 0.1);
    padding: 8px;
    border-radius: 4px;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

/* Timeline-specific styles */
.overall-stats {
    background: linear-gradient(
        to right,
        var(--bg-secondary, #f9fafb),
        var(--bg-tertiary, #f3f4f6)
    );
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
}

.stats-header {
    font-size: 0.85em;
    font-weight: 700;
    color: var(--text-primary, #111827);
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 8px;
}

.stat-item {
    display: flex;
    flex-direction: column;
    padding: 8px;
    background: var(--bg-primary, #ffffff);
    border-radius: 6px;
    border: 1px solid var(--border-color, #e5e7eb);
}

.stat-item.success {
    background: rgba(16, 185, 129, 0.05);
    border-color: rgba(16, 185, 129, 0.2);
}

.stat-item.failed {
    background: rgba(239, 68, 68, 0.05);
    border-color: rgba(239, 68, 68, 0.2);
}

.stat-label {
    font-size: 0.75em;
    color: var(--text-muted, #6b7280);
    text-transform: uppercase;
    margin-bottom: 4px;
}

.stat-value {
    font-size: 1.2em;
    font-weight: 700;
    color: var(--text-primary, #111827);
}

.stat-item.success .stat-value {
    color: rgb(16, 185, 129);
}

.stat-item.failed .stat-value {
    color: rgb(239, 68, 68);
}

.timeline-view {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.phase-group {
    border: 1px solid var(--border-color, #e5e7eb);
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg-tertiary, #f9fafb);
}

.phase-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: linear-gradient(
        to right,
        var(--bg-secondary, #f3f4f6),
        var(--bg-tertiary, #f9fafb)
    );
    cursor: pointer;
    user-select: none;
    border-bottom: 1px solid var(--border-color, #e5e7eb);
    transition: background-color 0.2s;
}

.phase-header:hover {
    background: var(--bg-hover, #e5e7eb);
}

.phase-left {
    display: flex;
    align-items: center;
    gap: 10px;
}

.phase-icon {
    font-size: 10px;
    color: var(--text-muted, #6b7280);
    transition: transform 0.2s;
}

.phase-title {
    font-weight: 700;
    font-size: 0.9em;
    color: var(--text-primary, #111827);
}

.phase-count {
    font-size: 0.8em;
    color: var(--text-muted, #6b7280);
    background: var(--bg-primary, #ffffff);
    padding: 2px 8px;
    border-radius: 12px;
    border: 1px solid var(--border-color, #e5e7eb);
}

.phase-right {
    display: flex;
    align-items: center;
    gap: 8px;
}

.phase-stats {
    font-size: 0.85em;
    color: var(--text-secondary, #4b5563);
}

.failed-count {
    color: var(--error-color, #ef4444);
    font-weight: 600;
}

.phase-content {
    padding: 8px;
    background: var(--bg-primary, #ffffff);
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.phase-content .log-entry {
    margin: 0;
}
</style>
