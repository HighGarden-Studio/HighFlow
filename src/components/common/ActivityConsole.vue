<template>
    <div class="activity-console" :class="{ open: isOpen }">
        <!-- Toggle Bar -->
        <div class="console-toggle-bar" @mousedown.prevent="startResize">
            <div class="toggle-info">
                <button class="toggle-icon-btn" @click.stop="toggleConsole">
                    <svg
                        v-if="isOpen"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        class="icon"
                    >
                        <path
                            fill-rule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                            clip-rule="evenodd"
                        />
                    </svg>
                    <svg
                        v-else
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        class="icon"
                    >
                        <path
                            fill-rule="evenodd"
                            d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z"
                            clip-rule="evenodd"
                        />
                    </svg>
                </button>

                <!-- Tabs -->
                <div class="tabs">
                    <button
                        class="tab-btn"
                        :class="{ active: activeTab === 'activity' && isOpen }"
                        @click.stop="selectTab('activity')"
                    >
                        Activity
                        <span v-if="unreadCount > 0" class="unread-badge">{{ unreadCount }}</span>
                    </button>
                    <button
                        class="tab-btn"
                        :class="{ active: activeTab === 'terminal' && isOpen }"
                        @click.stop="selectTab('terminal')"
                    >
                        Terminal
                    </button>
                </div>
            </div>

            <div class="toggle-stats">
                <template v-if="activeTab === 'activity' || !isOpen">
                    <span class="stat" :class="{ active: stats.error > 0 }">
                        <span class="stat-dot error"></span>
                        {{ stats.error }}
                    </span>
                    <span class="stat" :class="{ active: stats.warning > 0 }">
                        <span class="stat-dot warning"></span>
                        {{ stats.warning }}
                    </span>
                    <span class="stat">
                        <span class="stat-dot info"></span>
                        {{ stats.info + stats.success }}
                    </span>
                </template>
                <template v-else-if="activeTab === 'terminal'">
                    <span class="stat">
                        <span class="stat-dot success"></span>
                        {{ currentProjectName }}
                    </span>
                </template>
            </div>
        </div>

        <!-- Console Content -->
        <div v-show="isOpen" class="console-content" :style="{ height: consoleHeight + 'px' }">
            <!-- Activity View -->
            <div v-show="activeTab === 'activity'" class="view-container">
                <!-- Toolbar -->
                <div class="console-toolbar">
                    <div class="filter-buttons">
                        <button
                            v-for="level in logLevels"
                            :key="level.value"
                            class="filter-btn"
                            :class="{ active: filter.levels.includes(level.value) }"
                            :title="level.label"
                            @click="toggleLevel(level.value)"
                        >
                            <span class="level-dot" :class="level.value"></span>
                            {{ level.label }}
                        </button>
                    </div>

                    <div class="filter-categories">
                        <select v-model="selectedCategory" class="category-select">
                            <option value="">All Categories</option>
                            <option v-for="cat in categories" :key="cat.value" :value="cat.value">
                                {{ cat.label }}
                            </option>
                        </select>
                    </div>

                    <div class="search-box">
                        <input
                            v-model="searchQuery"
                            type="text"
                            placeholder="Search logs..."
                            class="search-input"
                        />
                    </div>

                    <div class="toolbar-actions">
                        <button
                            class="action-btn"
                            :class="{ active: autoscroll }"
                            @click="toggleAutoscroll"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                class="icon"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                        </button>
                        <button class="action-btn" title="Clear logs" @click="clearLogs">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                class="icon"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.519.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Log List -->
                <div ref="logContainerRef" class="log-container">
                    <div v-if="filteredLogs.length === 0" class="empty-state">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            class="empty-icon"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625zM7.5 15a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5A.75.75 0 017.5 15zm.75 2.25a.75.75 0 000 1.5H12a.75.75 0 000-1.5H8.25z"
                                clip-rule="evenodd"
                            />
                            <path
                                d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z"
                            />
                        </svg>
                        <p>No activity logs yet</p>
                    </div>

                    <div
                        v-for="log in filteredLogs"
                        :key="log.id"
                        class="log-entry"
                        :class="log.level"
                    >
                        <span class="log-time">{{ formatTime(log.timestamp) }}</span>
                        <span class="log-level" :class="log.level">{{
                            log.level.toUpperCase()
                        }}</span>
                        <span class="log-category">{{ log.category }}</span>
                        <span class="log-message">{{ log.message }}</span>
                        <button
                            v-if="log.details"
                            class="details-btn"
                            @click="toggleDetails(log.id)"
                        >
                            {{ expandedLogs.has(log.id) ? '−' : '+' }}
                        </button>
                        <div v-if="log.details && expandedLogs.has(log.id)" class="log-details">
                            <pre>{{ JSON.stringify(log.details, null, 2) }}</pre>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Terminal View -->
            <div v-show="activeTab === 'terminal'" class="view-container">
                <div v-if="projectBaseFolder" class="h-full">
                    <TerminalComponent
                        :id="`global-terminal-${currentProjectId}`"
                        :key="currentProjectId"
                        :cwd="projectBaseFolder"
                    />
                </div>
                <div v-else class="empty-state">
                    <p>Open a project to use the terminal</p>
                </div>
            </div>
        </div>

        <!-- Resize Handle -->
        <div v-if="isOpen" class="resize-handle" @mousedown.prevent="startResize"></div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useActivityLogStore, type LogLevel } from '../../renderer/stores/activityLogStore';
import { useProjectStore } from '../../renderer/stores/projectStore';
import TerminalComponent from './TerminalComponent.vue';

const store = useActivityLogStore();
const projectStore = useProjectStore();

// Local state
const logContainerRef = ref<HTMLElement | null>(null);
const expandedLogs = ref(new Set<string>());
const searchQuery = ref('');
const selectedCategory = ref('');
const isResizing = ref(false);
const startY = ref(0);
const startHeight = ref(0);
const activeTab = ref<'activity' | 'terminal'>('activity');

// Log levels config
const logLevels = [
    { value: 'error' as LogLevel, label: 'Error' },
    { value: 'warning' as LogLevel, label: 'Warning' },
    { value: 'success' as LogLevel, label: 'Success' },
    { value: 'info' as LogLevel, label: 'Info' },
    { value: 'debug' as LogLevel, label: 'Debug' },
];

// Categories config
const categories = [
    { value: 'task', label: 'Task' },
    { value: 'project', label: 'Project' },
    { value: 'workflow', label: 'Workflow' },
    { value: 'ai', label: 'AI' },
    { value: 'automation', label: 'Automation' },
    { value: 'system', label: 'System' },
    { value: 'ipc', label: 'IPC' },
];

// Computed from store
const isOpen = computed(() => store.isConsoleOpen);
const consoleHeight = computed(() => store.consoleHeight);
const filter = computed(() => store.filter);
const autoscroll = computed(() => store.autoscroll);
const filteredLogs = computed(() => store.filteredLogs);
const unreadCount = computed(() => store.unreadCount);
const stats = computed(() => store.stats);

const projectBaseFolder = computed(() => projectStore.currentProject?.baseDevFolder);
const currentProjectId = computed(() => projectStore.currentProject?.id || 'default');
const currentProjectName = computed(() => projectStore.currentProject?.title || 'No Project');

// Watch for search and category changes
watch(searchQuery, (value) => {
    store.setFilter({ search: value });
});

watch(selectedCategory, (value) => {
    if (value) {
        store.setFilter({ categories: [value as never] });
    } else {
        store.setFilter({
            categories: ['task', 'project', 'workflow', 'ai', 'automation', 'system', 'ipc'],
        });
    }
});

// Auto-scroll when new logs arrive
watch(
    () => store.logs.length,
    () => {
        if (autoscroll.value && isOpen.value && activeTab.value === 'activity') {
            nextTick(() => {
                if (logContainerRef.value) {
                    logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight;
                }
            });
        }
    }
);

// Actions
function toggleConsole() {
    if (!isResizing.value) {
        store.toggleConsole();
    }
}

function selectTab(tab: 'activity' | 'terminal') {
    if (!isOpen.value) {
        store.toggleConsole();
    }
    activeTab.value = tab;
}

function toggleLevel(level: LogLevel) {
    store.toggleLevel(level);
}

function clearLogs() {
    store.clearLogs();
    expandedLogs.value.clear();
}

function toggleAutoscroll() {
    store.autoscroll = !store.autoscroll;
}

function toggleDetails(logId: string) {
    if (expandedLogs.value.has(logId)) {
        expandedLogs.value.delete(logId);
    } else {
        expandedLogs.value.add(logId);
    }
}

function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

// Resize handling
function startResize(e: MouseEvent) {
    // Allow start resize if matched resize-handle or the header itself
    const target = e.target as HTMLElement;
    if (
        target.classList.contains('resize-handle') ||
        target.classList.contains('console-toggle-bar')
    ) {
        isResizing.value = true;
        startY.value = e.clientY;
        startHeight.value = consoleHeight.value;
        document.addEventListener('mousemove', onResize);
        document.addEventListener('mouseup', stopResize);
    }
}

function onResize(e: MouseEvent) {
    if (!isResizing.value) return;
    const delta = startY.value - e.clientY;
    store.setConsoleHeight(startHeight.value + delta);
}

function stopResize() {
    isResizing.value = false;
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', stopResize);
}

// Initialize store
onMounted(() => {
    store.initialize();
});

onUnmounted(() => {
    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('mouseup', stopResize);
});
</script>

<style scoped>
.activity-console {
    display: flex;
    flex-direction: column;
    background: var(--color-bg-secondary, #1e1e1e);
    border-top: 1px solid var(--color-border, #333);
    width: 100%;
    flex-shrink: 0;
}

.console-toggle-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    height: 36px;
    user-select: none;
    background: var(--color-bg-tertiary, #252525);
    border-bottom: 1px solid var(--color-border, #333);
    cursor: ns-resize; /* Indicate resize capability */
}

/* New header styling */
.toggle-info {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 100%;
}

.toggle-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    color: var(--color-text-secondary, #888);
    cursor: pointer;
    transition: all 0.2s;
}

.toggle-icon-btn:hover {
    background: var(--color-bg-hover, #333);
    color: var(--color-text-primary, #fff);
}

.tabs {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 100%;
    margin-left: 8px;
}

.tab-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    height: 100%;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-tertiary, #666);
    border-bottom: 2px solid transparent;
    cursor: pointer;
    transition: all 0.2s;
}

.tab-btn:hover {
    color: var(--color-text-primary, #e0e0e0);
    background: var(--color-bg-hover, #2a2a2a);
}

.tab-btn.active {
    color: var(--color-primary, #3b82f6);
    border-bottom-color: var(--color-primary, #3b82f6);
}

/* Original styles below */
.icon {
    width: 16px;
    height: 16px;
}

.unread-badge {
    background: var(--color-error, #ef4444);
    color: white;
    font-size: 10px;
    font-weight: 600;
    padding: 0 5px;
    border-radius: 8px;
    min-width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.toggle-stats {
    display: flex;
    align-items: center;
    gap: 12px;
}

.stat {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--color-text-secondary, #888);
}

.stat.active {
    color: var(--color-text-primary, #e0e0e0);
}

.stat-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
}

.stat-dot.error {
    background: var(--color-error, #ef4444);
}

.stat-dot.warning {
    background: var(--color-warning, #f59e0b);
}

.stat-dot.info {
    background: var(--color-info, #3b82f6);
}

.stat-dot.success {
    background: var(--color-success, #22c55e);
}

.console-content {
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.view-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
}

.console-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: var(--color-bg-tertiary, #252525);
    border-bottom: 1px solid var(--color-border, #333);
    flex-shrink: 0;
}

.filter-buttons {
    display: flex;
    gap: 4px;
}

.filter-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 11px;
    background: transparent;
    border: 1px solid var(--color-border, #444);
    border-radius: 4px;
    color: var(--color-text-secondary, #888);
    cursor: pointer;
    transition: all 0.15s;
}

.filter-btn:hover {
    background: var(--color-bg-hover, #333);
}

.filter-btn.active {
    background: var(--color-bg-active, #3b82f6);
    border-color: var(--color-primary, #3b82f6);
    color: white;
}

.level-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
}

.level-dot.error {
    background: var(--color-error, #ef4444);
}

.level-dot.warning {
    background: var(--color-warning, #f59e0b);
}

.level-dot.success {
    background: var(--color-success, #22c55e);
}

.level-dot.info {
    background: var(--color-info, #3b82f6);
}

.level-dot.debug {
    background: var(--color-debug, #8b5cf6);
}

.category-select {
    padding: 4px 8px;
    font-size: 11px;
    background: var(--color-bg-primary, #1e1e1e);
    border: 1px solid var(--color-border, #444);
    border-radius: 4px;
    color: var(--color-text-primary, #e0e0e0);
    cursor: pointer;
}

.search-box {
    flex: 1;
    max-width: 200px;
}

.search-input {
    width: 100%;
    padding: 4px 8px;
    font-size: 11px;
    background: var(--color-bg-primary, #1e1e1e);
    border: 1px solid var(--color-border, #444);
    border-radius: 4px;
    color: var(--color-text-primary, #e0e0e0);
}

.search-input::placeholder {
    color: var(--color-text-tertiary, #666);
}

.toolbar-actions {
    display: flex;
    gap: 4px;
    margin-left: auto;
}

.action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: 1px solid var(--color-border, #444);
    border-radius: 4px;
    color: var(--color-text-secondary, #888);
    cursor: pointer;
    transition: all 0.15s;
}

.action-btn:hover {
    background: var(--color-bg-hover, #333);
    color: var(--color-text-primary, #e0e0e0);
}

.action-btn.active {
    background: var(--color-primary, #3b82f6);
    border-color: var(--color-primary, #3b82f6);
    color: white;
}

.log-container {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 12px;
}

.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-tertiary, #666);
    gap: 8px;
}

.empty-icon {
    width: 32px;
    height: 32px;
    opacity: 0.5;
}

.log-entry {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 4px 8px;
    border-radius: 4px;
    flex-wrap: wrap;
}

.log-entry:hover {
    background: var(--color-bg-hover, #2a2a2a);
}

.log-entry.error {
    background: rgba(239, 68, 68, 0.1);
}

.log-entry.warning {
    background: rgba(245, 158, 11, 0.1);
}

.log-time {
    color: var(--color-text-tertiary, #666);
    font-size: 11px;
    flex-shrink: 0;
}

.log-level {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 4px;
    border-radius: 3px;
    flex-shrink: 0;
}

.log-level.error {
    background: var(--color-error, #ef4444);
    color: white;
}

.log-level.warning {
    background: var(--color-warning, #f59e0b);
    color: black;
}

.log-level.success {
    background: var(--color-success, #22c55e);
    color: white;
}

.log-level.info {
    background: var(--color-info, #3b82f6);
    color: white;
}

.log-level.debug {
    background: var(--color-debug, #8b5cf6);
    color: white;
}

.log-category {
    color: var(--color-text-secondary, #888);
    font-size: 11px;
    padding: 1px 4px;
    background: var(--color-bg-tertiary, #333);
    border-radius: 3px;
    flex-shrink: 0;
}

.log-message {
    color: var(--color-text-primary, #e0e0e0);
    flex: 1;
    word-break: break-word;
}

.details-btn {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-tertiary, #333);
    border: none;
    border-radius: 3px;
    color: var(--color-text-secondary, #888);
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
}

.details-btn:hover {
    background: var(--color-bg-hover, #444);
    color: var(--color-text-primary, #e0e0e0);
}

.log-details {
    width: 100%;
    margin-top: 4px;
    padding: 8px;
    background: var(--color-bg-primary, #1a1a1a);
    border-radius: 4px;
    overflow-x: auto;
}

.log-details pre {
    margin: 0;
    font-size: 11px;
    color: var(--color-text-secondary, #aaa);
    white-space: pre-wrap;
    word-break: break-all;
}

.resize-handle {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4px;
    cursor: ns-resize;
    background: transparent;
}

.resize-handle:hover {
    background: var(--color-primary, #3b82f6);
}
</style>
