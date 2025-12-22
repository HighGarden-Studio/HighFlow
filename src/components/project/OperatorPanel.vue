<template>
    <div class="operator-panel" :class="{ collapsed: isCollapsed }">
        <!-- Toggle Button -->
        <button
            @click="togglePanel"
            class="toggle-btn"
            :title="isCollapsed ? 'Show Operators' : 'Hide Operators'"
        >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    :d="isCollapsed ? 'M19 9l-7 7-7-7' : 'M5 15l7-7 7 7'"
                />
            </svg>
            <span class="ml-2">AI Operators</span>
            <span v-if="operators.length > 0" class="operator-count">{{ operators.length }}</span>
        </button>

        <!-- Operators List -->
        <Transition
            enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 max-h-0"
            enter-to-class="opacity-100 max-h-96"
            leave-active-class="transition-all duration-200 ease-in"
            leave-from-class="opacity-100 max-h-96"
            leave-to-class="opacity-0 max-h-0"
        >
            <div v-show="!isCollapsed" class="operators-container">
                <!-- Filter Bar -->
                <div v-if="uniqueTags.length > 0" class="filter-bar">
                    <button
                        @click="selectTag(null)"
                        class="filter-chip"
                        :class="{ active: selectedTag === null }"
                    >
                        All
                    </button>
                    <button
                        v-for="tag in uniqueTags"
                        :key="tag"
                        @click="selectTag(tag)"
                        class="filter-chip"
                        :class="{ active: selectedTag === tag }"
                    >
                        {{ tag }}
                    </button>
                </div>

                <!-- Operators List -->
                <div v-if="loading" class="loading-state">
                    <svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
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
                    <span>Loading operators...</span>
                </div>

                <div v-else-if="operators.length === 0" class="empty-state">
                    <p>No operators available</p>
                    <p class="text-sm">Create operators in Settings</p>
                </div>

                <div v-else class="operators-scroll-area">
                    <div
                        v-for="operator in filteredOperators"
                        :key="operator.id"
                        class="operator-card"
                        draggable="true"
                        @dragstart="handleDragStart($event, operator)"
                        @dragend="handleDragEnd"
                        :style="{ borderColor: operator.color || undefined }"
                    >
                        <div
                            class="operator-avatar"
                            :style="{ backgroundColor: operator.color || undefined }"
                        >
                            {{ operator.avatar || '🤖' }}
                        </div>
                        <div class="operator-info">
                            <div class="operator-name">{{ operator.name }}</div>
                            <div class="operator-role">{{ operator.role }}</div>
                            <div v-if="operator.aiProvider" class="operator-ai-info">
                                <span class="ai-provider">{{
                                    getProviderLabel(operator.aiProvider)
                                }}</span>
                                <span v-if="operator.aiModel" class="ai-model">{{
                                    operator.aiModel
                                }}</span>
                            </div>
                        </div>
                        <div class="drag-indicator">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path
                                    d="M9 3h2v2H9V3zm0 4h2v2H9V7zm0 4h2v2H9v-2zm0 4h2v2H9v-2zm0 4h2v2H9v-2zm4-16h2v2h-2V3zm0 4h2v2h-2V7zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2zm0 4h2v2h-2v-2z"
                                />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import type { Operator } from '@core/types/database';

const props = defineProps<{
    projectId: number | null;
}>();

const operators = ref<Operator[]>([]);
const loading = ref(true);
const isCollapsed = ref(true);

const selectedTag = ref<string | null>(null);

const uniqueTags = computed(() => {
    const tags = new Set<string>();
    operators.value.forEach((op) => {
        if (op.tags && Array.isArray(op.tags)) {
            op.tags.forEach((tag) => tags.add(tag));
        }
    });
    return Array.from(tags).sort();
});

const filteredOperators = computed(() => {
    if (!selectedTag.value) return operators.value;
    const tag = selectedTag.value; // Store in local const to satisfy TS type narrowing
    return operators.value.filter((op) => op.tags && op.tags.includes(tag));
});

// Load collapsed state from localStorage
onMounted(async () => {
    const savedState = localStorage.getItem('operatorPanelCollapsed');
    if (savedState !== null) {
        isCollapsed.value = JSON.parse(savedState);
    }

    await loadOperators();
});

// Watch for project changes
watch(
    () => props.projectId,
    () => {
        loadOperators();
        selectedTag.value = null;
    }
);

async function loadOperators() {
    if (!props.projectId) return;

    loading.value = true;
    try {
        operators.value = await window.electron.operators.list(props.projectId);
    } catch (error) {
        console.error('Failed to load operators:', error);
    } finally {
        loading.value = false;
    }
}

function selectTag(tag: string | null) {
    selectedTag.value = selectedTag.value === tag ? null : tag;
}

function togglePanel() {
    isCollapsed.value = !isCollapsed.value;
    localStorage.setItem('operatorPanelCollapsed', JSON.stringify(isCollapsed.value));
}

function handleDragStart(event: DragEvent, operator: Operator) {
    if (!event.dataTransfer) return;

    // Changed from 'move' to 'copy' to match dropEffect
    event.dataTransfer.effectAllowed = 'copy';
    const operatorData = JSON.stringify({
        id: operator.id,
        name: operator.name,
        avatar: operator.avatar,
        role: operator.role,
        color: operator.color,
        aiProvider: operator.aiProvider,
        aiModel: operator.aiModel,
    });
    event.dataTransfer.setData('application/x-operator', operatorData);

    // Store globally as fallback for mouseup
    (window as any).__operatorDragData = {
        'application/x-operator': operatorData,
    };

    console.log('🟠 Operator drag started:', operator.id);

    // Add visual feedback
    const target = event.target as HTMLElement;
    target.classList.add('dragging');
}

function handleDragEnd(event: DragEvent) {
    console.log('🟠 Operator drag ended');
    // Clear global drag data
    delete (window as any).__operatorDragData;
    const target = event.target as HTMLElement;
    target.classList.remove('dragging');
}

function getProviderLabel(providerId: string): string {
    const providerMap: Record<string, string> = {
        anthropic: 'Claude',
        openai: 'OpenAI',
        google: 'Gemini',
        groq: 'Groq',
        'claude-code': 'Claude Code',
        antigravity: 'Antigravity',
        codex: 'Codex',
    };
    return providerMap[providerId] || providerId;
}
</script>

<style scoped>
.operator-panel {
    background: linear-gradient(to bottom, #1a1a2e 0%, #16213e 100%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.3s ease;
}

.toggle-btn {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.75rem 1.5rem;
    background: transparent;
    border: none;
    color: #e0e0e0;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}

.toggle-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: white;
}

.operator-count {
    margin-left: auto;
    padding: 0.25rem 0.5rem;
    background: rgba(102, 126, 234, 0.2);
    border-radius: 9999px;
    font-size: 0.75rem;
    color: #667eea;
    font-weight: 600;
}

.operators-container {
    overflow: hidden;
    transition: all 0.2s;
}

.filter-bar {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1rem 0;
    overflow-x: auto;
    scrollbar-width: none; /* Firefox */
}

.filter-bar::-webkit-scrollbar {
    display: none; /* Chrome/Safari */
}

.filter-chip {
    padding: 0.25rem 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 9999px;
    color: #aaa;
    font-size: 0.75rem;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.2s;
}

.filter-chip:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
}

.filter-chip.active {
    background: rgba(102, 126, 234, 0.2);
    border-color: rgba(102, 126, 234, 0.5);
    color: #667eea;
}

.loading-state,
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 2rem 1.5rem;
    color: #888;
    font-size: 0.875rem;
}

.operators-scroll-area {
    display: flex;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    overflow-x: auto;
    scrollbar-width: thin;
}

.operator-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.03);
    border: 2px solid;
    border-radius: 0.5rem;
    cursor: move;
    transition: all 0.2s;
    min-width: 200px; /* Fixed width for horizontal scroll items */
}

.operator-card:hover {
    background: rgba(255, 255, 255, 0.08);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.operator-card.dragging {
    opacity: 0.5;
    transform: scale(0.95);
}

.operator-avatar {
    width: 2.5rem;
    height: 2.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.5rem;
    font-size: 1.25rem;
    flex-shrink: 0;
}

.operator-info {
    flex: 1;
    min-width: 0;
}

.operator-name {
    font-weight: 600;
    color: white;
    font-size: 0.875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.operator-role {
    font-size: 0.75rem;
    color: #888;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.operator-ai-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    margin-top: 0.25rem;
    font-size: 0.625rem;
}

.ai-provider {
    color: #aaa;
    font-weight: 600;
}

.ai-model {
    color: #999;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.drag-indicator {
    color: #666;
    flex-shrink: 0;
}

/* Scrollbar Styling */
.operators-scroll-area::-webkit-scrollbar {
    height: 6px; /* Horizontal scrollbar */
}

.operators-scroll-area::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
}

.operators-scroll-area::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
}

.operators-scroll-area::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}

.task-card {
    @apply rounded-lg p-4 shadow-sm border-2 transition-all duration-200 cursor-pointer relative;
}

.task-card.dragging {
    @apply opacity-50 rotate-2;
}

.task-card.connection-dragging {
    @apply opacity-75;
}

.task-card.connection-target {
    @apply border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 shadow-lg scale-105;
}

.task-card.hovered:not(.operator-drag-over) {
    @apply shadow-md;
}

.task-card.operator-drag-over {
    @apply border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-lg scale-105;
}
</style>
