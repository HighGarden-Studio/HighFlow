<script setup lang="ts">
/**
 * Global Search Component
 *
 * Command palette style search (Cmd+K)
 * - Real-time autocomplete
 * - Category-based results
 * - Keyboard navigation
 * - Recent search history
 */

import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import IconRenderer from '../common/IconRenderer.vue';
import {
    searchEngine,
    type SearchResult,
    type SearchFilters,
    type EntityType,
} from '../../services/search/SearchEngine';

// ========================================
// Props & Emits
// ========================================

const props = defineProps<{
    open: boolean;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'select', result: SearchResult): void;
}>();

const router = useRouter();
const { t } = useI18n();

// ========================================
// State
// ========================================

const searchQuery = ref('');
const searchResults = ref<SearchResult[]>([]);
const recentSearches = ref<string[]>([]);
const suggestions = ref<string[]>([]);
const selectedIndex = ref(0);
const loading = ref(false);
const activeFilter = ref<EntityType | 'all'>('all');
const searchInputRef = ref<HTMLInputElement | null>(null);

// ========================================
// Filters
// ========================================

const filters = computed<Array<{ id: EntityType | 'all'; label: string; icon: string }>>(() => [
    { id: 'all', label: t('global_search.filters.all'), icon: '🔍' },
    { id: 'project', label: t('global_search.filters.project'), icon: '📁' },
    { id: 'task', label: t('global_search.filters.task'), icon: '✅' },
    { id: 'skill', label: t('global_search.filters.skill'), icon: '⚡' },
    { id: 'user', label: t('global_search.filters.user'), icon: '👤' },
]);

// ========================================
// Computed
// ========================================

const groupedResults = computed(() => {
    const groups: Record<string, SearchResult[]> = {
        project: [],
        task: [],
        skill: [],
        user: [],
        template: [],
        comment: [],
    };

    for (const result of searchResults.value) {
        const group = groups[result.entityType];
        if (group) {
            group.push(result);
        }
    }

    return groups;
});

const hasResults = computed(() => searchResults.value.length > 0);

const displayItems = computed(() => {
    if (!searchQuery.value.trim()) {
        // Show recent searches and suggestions
        return recentSearches.value.map((term, i) => ({
            type: 'recent' as const,
            id: `recent-${i}`,
            title: term,
            icon: '🕐',
        }));
    }

    // Show search results
    return searchResults.value.map((r) => ({
        type: 'result' as const,
        id: `${r.entityType}-${r.entityId}`,
        title: r.title,
        snippet: r.snippet,
        entityType: r.entityType,
        entityId: r.entityId,
        icon: getEntityIcon(r.entityType),
        result: r,
    }));
});

// ========================================
// Methods
// ========================================

function getEntityIcon(type: EntityType): string {
    const icons: Record<EntityType, string> = {
        project: '📁',
        task: '✅',
        skill: '⚡',
        user: '👤',
        template: '📋',
        comment: '💬',
    };
    return icons[type] || '📄';
}

async function performSearch() {
    if (!searchQuery.value.trim()) {
        searchResults.value = [];
        return;
    }

    loading.value = true;

    try {
        const searchFilters: SearchFilters = {};
        if (activeFilter.value !== 'all') {
            searchFilters.entityTypes = [activeFilter.value];
        }

        const results = await searchEngine.search(searchQuery.value, searchFilters, {
            limit: 20,
            highlight: true,
        });

        searchResults.value = results;
        selectedIndex.value = 0;

        // Get autocomplete suggestions
        suggestions.value = await searchEngine.autocomplete(searchQuery.value, 5);
    } catch (error) {
        console.error('Search failed:', error);
        searchResults.value = [];
    } finally {
        loading.value = false;
    }
}

function handleSelect(item: (typeof displayItems.value)[0]) {
    if (item.type === 'recent') {
        searchQuery.value = item.title;
        performSearch();
    } else if (item.type === 'result' && 'result' in item) {
        emit('select', item.result);
        navigateToResult(item.result);
    }
}

function navigateToResult(result: SearchResult) {
    switch (result.entityType) {
        case 'project':
            router.push(`/projects/${result.entityId}/board`);
            break;
        case 'task': {
            const projectId = result.metadata.projectId as number;
            if (projectId) {
                router.push(`/projects/${projectId}/board?task=${result.entityId}`);
            }
            break;
        }
        case 'skill':
            router.push(`/skills/${result.entityId}`);
            break;
        case 'user':
            router.push(`/users/${result.entityId}`);
            break;
        case 'template':
            router.push(`/templates/${result.entityId}`);
            break;
    }
    emit('close');
}

function handleKeyDown(event: KeyboardEvent) {
    const itemCount = displayItems.value.length;

    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            selectedIndex.value = (selectedIndex.value + 1) % Math.max(1, itemCount);
            break;
        case 'ArrowUp':
            event.preventDefault();
            selectedIndex.value = (selectedIndex.value - 1 + itemCount) % Math.max(1, itemCount);
            break;
        case 'Enter': {
            event.preventDefault();
            const selectedItem = displayItems.value[selectedIndex.value];
            if (selectedItem) {
                handleSelect(selectedItem);
            }
            break;
        }
        case 'Escape':
            event.preventDefault();
            emit('close');
            break;
        case 'Tab':
            // Apply suggestion
            if (suggestions.value.length > 0 && searchQuery.value && suggestions.value[0]) {
                event.preventDefault();
                searchQuery.value = suggestions.value[0];
                performSearch();
            }
            break;
    }
}

function clearRecentSearches() {
    searchEngine.clearRecentSearches();
    recentSearches.value = [];
}

function close() {
    emit('close');
}

// ========================================
// Watchers
// ========================================

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>;
watch(searchQuery, () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(performSearch, 150);
});

watch(activeFilter, () => {
    if (searchQuery.value) {
        performSearch();
    }
});

// Focus input when opened
watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            recentSearches.value = searchEngine.getRecentSearches();
            nextTick(() => {
                searchInputRef.value?.focus();
            });
        } else {
            searchQuery.value = '';
            searchResults.value = [];
            selectedIndex.value = 0;
        }
    }
);

// ========================================
// Keyboard Shortcut
// ========================================

function handleGlobalKeyDown(event: KeyboardEvent) {
    // Cmd+K or Ctrl+K to open
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        if (!props.open) {
            // This would be handled by parent component
        }
    }
}

onMounted(() => {
    window.addEventListener('keydown', handleGlobalKeyDown);
});

onUnmounted(() => {
    window.removeEventListener('keydown', handleGlobalKeyDown);
    clearTimeout(searchTimeout);
});
</script>

<template>
    <Teleport to="body">
        <Transition name="modal">
            <div
                v-if="open"
                class="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
                @keydown="handleKeyDown"
            >
                <!-- Backdrop -->
                <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="close" />

                <!-- Search Modal -->
                <div
                    class="relative w-full max-w-2xl mx-4 bg-gray-800 rounded-xl shadow-2xl border border-gray-700 overflow-hidden"
                >
                    <!-- Search Input -->
                    <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-700">
                        <svg
                            class="w-5 h-5 text-gray-400 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                        </svg>
                        <input
                            ref="searchInputRef"
                            v-model="searchQuery"
                            type="text"
                            :placeholder="t('global_search.placeholder')"
                            class="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-lg"
                            autocomplete="off"
                        />
                        <div v-if="loading" class="w-5 h-5">
                            <svg class="animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                                <circle
                                    class="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    stroke-width="4"
                                />
                                <path
                                    class="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                />
                            </svg>
                        </div>
                        <kbd
                            class="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-400 bg-gray-700 rounded"
                        >
                            ESC
                        </kbd>
                    </div>

                    <!-- Filter Tabs -->
                    <div
                        class="flex items-center gap-1 px-4 py-2 border-b border-gray-700 overflow-x-auto"
                    >
                        <button
                            v-for="filter in filters"
                            :key="filter.id"
                            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors"
                            :class="
                                activeFilter === filter.id
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : 'text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                            "
                            @click="activeFilter = filter.id"
                        >
                            <IconRenderer :emoji="filter.icon" class="w-4 h-4" />
                            <span>{{ filter.label }}</span>
                        </button>
                    </div>

                    <!-- Results -->
                    <div class="max-h-[60vh] overflow-y-auto">
                        <!-- Empty State (No Query) -->
                        <div
                            v-if="!searchQuery.trim() && recentSearches.length === 0"
                            class="px-4 py-8 text-center"
                        >
                            <div
                                class="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-700 flex items-center justify-center"
                            >
                                <svg
                                    class="w-6 h-6 text-gray-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                                    />
                                </svg>
                            </div>
                            <p class="text-gray-400 text-sm">
                                {{ t('global_search.empty.title') }}
                            </p>
                            <div class="mt-4 flex flex-wrap justify-center gap-2 text-xs">
                                <span class="text-gray-500">{{
                                    t('global_search.empty.tip_label')
                                }}</span>
                                <kbd class="px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded">{{
                                    t('global_search.empty.shortcuts.nav')
                                }}</kbd>
                                <span class="text-gray-500">{{
                                    t('global_search.empty.nav')
                                }}</span>
                                <kbd class="px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded">{{
                                    t('global_search.empty.shortcuts.select')
                                }}</kbd>
                                <span class="text-gray-500">{{
                                    t('global_search.empty.select')
                                }}</span>
                                <kbd class="px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded">{{
                                    t('global_search.empty.shortcuts.autocomplete')
                                }}</kbd>
                                <span class="text-gray-500">{{
                                    t('global_search.empty.autocomplete')
                                }}</span>
                            </div>
                        </div>

                        <!-- Recent Searches -->
                        <div
                            v-else-if="!searchQuery.trim() && recentSearches.length > 0"
                            class="py-2"
                        >
                            <div class="flex items-center justify-between px-4 py-2">
                                <span
                                    class="text-xs font-medium text-gray-500 uppercase tracking-wider"
                                    >{{ t('global_search.recent') }}</span
                                >
                                <button
                                    class="text-xs text-gray-500 hover:text-gray-400 transition-colors"
                                    @click="clearRecentSearches"
                                >
                                    {{ t('global_search.clear_recent') }}
                                </button>
                            </div>
                            <div
                                v-for="(item, index) in displayItems"
                                :key="item.id"
                                class="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors"
                                :class="
                                    index === selectedIndex ? 'bg-gray-700' : 'hover:bg-gray-700/50'
                                "
                                @click="handleSelect(item)"
                            >
                                <span class="text-gray-400">{{ item.icon }}</span>
                                <span class="text-gray-300">{{ item.title }}</span>
                            </div>
                        </div>

                        <!-- No Results -->
                        <div
                            v-else-if="searchQuery.trim() && !loading && !hasResults"
                            class="px-4 py-8 text-center"
                        >
                            <div
                                class="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-700 flex items-center justify-center"
                            >
                                <svg
                                    class="w-6 h-6 text-gray-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                </svg>
                            </div>
                            <p class="text-gray-400 text-sm">
                                {{ t('global_search.no_results', { query: searchQuery }) }}
                            </p>
                            <p class="text-gray-500 text-xs mt-1">
                                {{ t('global_search.try_another') }}
                            </p>
                        </div>

                        <!-- Search Results (Grouped) -->
                        <div v-else-if="hasResults" class="py-2">
                            <!-- Projects -->
                            <template v-if="(groupedResults.project?.length ?? 0) > 0">
                                <div class="px-4 py-2">
                                    <span
                                        class="text-xs font-medium text-gray-500 uppercase tracking-wider"
                                        >{{ t('global_search.filters.project') }}</span
                                    >
                                </div>
                                <div
                                    v-for="result in groupedResults.project"
                                    :key="`project-${result.entityId}`"
                                    class="flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-gray-700/50"
                                    @click="navigateToResult(result)"
                                >
                                    <span class="text-xl flex-shrink-0">📁</span>
                                    <div class="flex-1 min-w-0">
                                        <div
                                            class="text-white font-medium truncate"
                                            v-html="result.highlightedTitle || result.title"
                                        />
                                        <div
                                            class="text-gray-400 text-sm truncate"
                                            v-html="result.highlightedSnippet || result.snippet"
                                        />
                                    </div>
                                </div>
                            </template>

                            <!-- Tasks -->
                            <template v-if="(groupedResults.task?.length ?? 0) > 0">
                                <div class="px-4 py-2 mt-2">
                                    <span
                                        class="text-xs font-medium text-gray-500 uppercase tracking-wider"
                                        >{{ t('global_search.filters.task') }}</span
                                    >
                                </div>
                                <div
                                    v-for="result in groupedResults.task"
                                    :key="`task-${result.entityId}`"
                                    class="flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-gray-700/50"
                                    @click="navigateToResult(result)"
                                >
                                    <span class="text-xl flex-shrink-0">✅</span>
                                    <div class="flex-1 min-w-0">
                                        <div class="flex items-center gap-2">
                                            <span
                                                class="text-white font-medium truncate"
                                                v-html="result.highlightedTitle || result.title"
                                            />
                                            <span
                                                v-if="result.metadata.status"
                                                class="px-1.5 py-0.5 text-xs rounded"
                                                :class="{
                                                    'bg-gray-600 text-gray-300':
                                                        result.metadata.status === 'todo',
                                                    'bg-blue-500/20 text-blue-400':
                                                        result.metadata.status === 'in_progress',
                                                    'bg-orange-500/20 text-orange-400':
                                                        result.metadata.status === 'needs_approval',
                                                    'bg-yellow-500/20 text-yellow-400':
                                                        result.metadata.status === 'in_review',
                                                    'bg-green-500/20 text-green-400':
                                                        result.metadata.status === 'done',
                                                }"
                                            >
                                                {{ result.metadata.status }}
                                            </span>
                                        </div>
                                        <div
                                            class="text-gray-400 text-sm truncate"
                                            v-html="result.highlightedSnippet || result.snippet"
                                        />
                                    </div>
                                </div>
                            </template>

                            <!-- Skills -->
                            <template v-if="(groupedResults.skill?.length ?? 0) > 0">
                                <div class="px-4 py-2 mt-2">
                                    <span
                                        class="text-xs font-medium text-gray-500 uppercase tracking-wider"
                                        >{{ t('global_search.filters.skill') }}</span
                                    >
                                </div>
                                <div
                                    v-for="result in groupedResults.skill"
                                    :key="`skill-${result.entityId}`"
                                    class="flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-gray-700/50"
                                    @click="navigateToResult(result)"
                                >
                                    <span class="text-xl flex-shrink-0">⚡</span>
                                    <div class="flex-1 min-w-0">
                                        <div
                                            class="text-white font-medium truncate"
                                            v-html="result.highlightedTitle || result.title"
                                        />
                                        <div
                                            class="text-gray-400 text-sm truncate"
                                            v-html="result.highlightedSnippet || result.snippet"
                                        />
                                    </div>
                                </div>
                            </template>

                            <!-- Users -->
                            <template v-if="(groupedResults.user?.length ?? 0) > 0">
                                <div class="px-4 py-2 mt-2">
                                    <span
                                        class="text-xs font-medium text-gray-500 uppercase tracking-wider"
                                        >{{ t('global_search.filters.user') }}</span
                                    >
                                </div>
                                <div
                                    v-for="result in groupedResults.user"
                                    :key="`user-${result.entityId}`"
                                    class="flex items-start gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-gray-700/50"
                                    @click="navigateToResult(result)"
                                >
                                    <span class="text-xl flex-shrink-0">👤</span>
                                    <div class="flex-1 min-w-0">
                                        <div
                                            class="text-white font-medium truncate"
                                            v-html="result.highlightedTitle || result.title"
                                        />
                                        <div class="text-gray-400 text-sm truncate">
                                            {{ result.metadata.email }}
                                        </div>
                                    </div>
                                </div>
                            </template>
                        </div>
                    </div>

                    <!-- Autocomplete Suggestions -->
                    <div
                        v-if="suggestions.length > 0 && searchQuery"
                        class="px-4 py-2 border-t border-gray-700"
                    >
                        <div class="flex items-center gap-2 text-xs text-gray-500">
                            <kbd class="px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded">Tab</kbd>
                            <span>{{ t('global_search.autocomplete_label') }}</span>
                            <span class="text-gray-400">{{ suggestions[0] }}</span>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div
                        class="flex items-center justify-between px-4 py-2 border-t border-gray-700 bg-gray-800/50"
                    >
                        <div class="flex items-center gap-4 text-xs text-gray-500">
                            <span class="flex items-center gap-1">
                                <kbd class="px-1 py-0.5 bg-gray-700 rounded">↑↓</kbd>
                                {{ t('global_search.footer.nav') }}
                            </span>
                            <span class="flex items-center gap-1">
                                <kbd class="px-1 py-0.5 bg-gray-700 rounded">↵</kbd>
                                {{ t('global_search.footer.select') }}
                            </span>
                            <span class="flex items-center gap-1">
                                <kbd class="px-1 py-0.5 bg-gray-700 rounded">esc</kbd>
                                {{ t('global_search.footer.close') }}
                            </span>
                        </div>
                        <div class="text-xs text-gray-500">
                            {{
                                t('global_search.footer.stats', {
                                    n: searchEngine.getStats().totalDocuments,
                                })
                            }}
                        </div>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
    transition: opacity 0.15s ease;
}

.modal-enter-from,
.modal-leave-to {
    opacity: 0;
}

.modal-enter-active .relative,
.modal-leave-active .relative {
    transition: transform 0.15s ease;
}

.modal-enter-from .relative {
    transform: scale(0.95) translateY(-10px);
}

.modal-leave-to .relative {
    transform: scale(0.95) translateY(-10px);
}

/* Highlight styles for search results */
:deep(mark) {
    background-color: rgba(59, 130, 246, 0.3);
    color: inherit;
    padding: 0 2px;
    border-radius: 2px;
}
</style>
