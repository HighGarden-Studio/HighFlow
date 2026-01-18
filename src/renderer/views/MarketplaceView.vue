<script setup lang="ts">
/**
 * Marketplace View
 *
 * Main marketplace page for browsing and purchasing items
 */
import { onMounted, ref, computed } from 'vue';
import { useMarketplaceStore } from '../stores/marketplaceStore';
import { useUserStore } from '../stores/userStore';
import { useUIStore } from '../stores/uiStore';
import MarketplaceItemCard from '../../components/marketplace/MarketplaceItemCard.vue';
import type { MarketplaceItem, MarketplaceCategory, ItemType } from '@core/types/marketplace';

const marketplaceStore = useMarketplaceStore();
const userStore = useUserStore();
const uiStore = useUIStore();

// State
const viewMode = ref<'grid' | 'list'>('grid');
const showSubmitModal = ref(false);
const selectedItemForDetail = ref<MarketplaceItem | null>(null);

// Categories for filter dropdown
const categories: { value: MarketplaceCategory | null; label: string }[] = [
    { value: null, label: 'All Categories' },
    { value: 'content-creation', label: 'Content Creation' },
    { value: 'development', label: 'Development' },
    { value: 'productivity', label: 'Productivity' },
    { value: 'data-analysis', label: 'Data Analysis' },
    { value: 'business-ops', label: 'Business Operations' },
    { value: 'education', label: 'Education' },
    { value: 'personal', label: 'Personal' },
    { value: 'automated-agents', label: 'Automated Agents' },
    { value: 'other', label: 'Other' },
];

// Item types for filter
const itemTypes: { value: ItemType | undefined; label: string }[] = [
    { value: undefined, label: 'All Types' },
    { value: 'project', label: '📦 Projects' },
    { value: 'operator', label: '⚙️ Operators' },
];

// Computed
const displayedItems = computed(() => marketplaceStore.items);
const hasItems = computed(() => displayedItems.value.length > 0);

// Actions
function handleSearch(event: Event) {
    const target = event.target as HTMLInputElement;
    marketplaceStore.searchQuery = target.value;
    // Debounce would be better here, but calling directly for now
    marketplaceStore.fetchItems();
}

function handleCategoryChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const category = target.value === '' ? null : (target.value as MarketplaceCategory);
    marketplaceStore.selectedCategory = category;
    marketplaceStore.fetchItems();
}

function handleItemTypeChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    const itemType =
        target.value === '' ? null : (target.value as 'project' | 'operator' | 'script-template');
    marketplaceStore.selectedType = itemType;
    marketplaceStore.fetchItems();
}

// function toggleViewMode() {
//     viewMode.value = viewMode.value === 'grid' ? 'list' : 'grid';
// }

function clearAllFilters() {
    marketplaceStore.searchQuery = '';
    marketplaceStore.selectedCategory = null;
    marketplaceStore.selectedType = null;
    marketplaceStore.fetchItems();
}

function handleItemClick(item: MarketplaceItem) {
    selectedItemForDetail.value = item;
    // TODO: Open detail modal
    // TODO: Open detail modal
    uiStore.showToast({ message: 'Item detail modal coming soon!', type: 'info' });
}

function openSubmitModal() {
    if (!userStore.isAuthenticated) {
        uiStore.showToast({ message: 'Please login to submit items', type: 'warning' });
        return;
    }
    showSubmitModal.value = true;
}

// Lifecycle
onMounted(async () => {
    // marketplaceStore.initialize(); - removed as not defined
    await marketplaceStore.fetchItems();
});
</script>

<template>
    <div class="flex-1 flex flex-col h-full bg-gray-900">
        <!-- Header -->
        <header class="border-b border-gray-800 px-6 py-4">
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-2xl font-bold text-white">Marketplace</h1>
                    <p class="text-gray-400 text-sm mt-1">
                        Discover and share project templates and operators
                    </p>
                </div>
                <button
                    class="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-purple-500/20"
                    @click="openSubmitModal"
                >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 4v16m8-8H4"
                        />
                    </svg>
                    Submit Item
                </button>
            </div>

            <!-- Filters and Search -->
            <div class="mt-4 flex items-center gap-3 flex-wrap">
                <!-- Search -->
                <div class="flex-1 min-w-[300px]">
                    <div class="relative">
                        <svg
                            class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
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
                            v-model="marketplaceStore.searchQuery"
                            type="text"
                            placeholder="Search items..."
                            class="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            @change="handleSearch"
                        />
                    </div>
                </div>

                <!-- Category Filter -->
                <select
                    v-model="marketplaceStore.selectedCategory"
                    class="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    @change="handleCategoryChange"
                >
                    <option v-for="cat in categories" :key="cat.label" :value="cat.value || ''">
                        {{ cat.label }}
                    </option>
                </select>

                <!-- Item Type Filter -->
                <select
                    v-model="marketplaceStore.selectedType"
                    class="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    @change="handleItemTypeChange"
                >
                    <option v-for="type in itemTypes" :key="type.label" :value="type.value || ''">
                        {{ type.label }}
                    </option>
                </select>

                <!-- Clear Filters -->
                <button
                    v-if="
                        marketplaceStore.searchQuery ||
                        marketplaceStore.selectedCategory ||
                        marketplaceStore.selectedType
                    "
                    class="px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                    @click="clearAllFilters"
                >
                    Clear Filters
                </button>

                <!-- View Toggle -->
                <div class="ml-auto flex items-center gap-1 bg-gray-800 rounded-lg p-1">
                    <button
                        :class="[
                            'p-2 rounded transition-colors',
                            viewMode === 'grid'
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-400 hover:text-white',
                        ]"
                        title="Grid view"
                        @click="viewMode = 'grid'"
                    >
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path
                                d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                            />
                        </svg>
                    </button>
                    <button
                        :class="[
                            'p-2 rounded transition-colors',
                            viewMode === 'list'
                                ? 'bg-blue-600 text-white'
                                : 'text-gray-400 hover:text-white',
                        ]"
                        title="List view"
                        @click="viewMode = 'list'"
                    >
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path
                                fill-rule="evenodd"
                                d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                                clip-rule="evenodd"
                            />
                        </svg>
                    </button>
                </div>
            </div>
        </header>

        <!-- Content -->
        <main class="flex-1 overflow-y-auto p-6">
            <!-- Loading -->
            <div v-if="marketplaceStore.loading" class="flex items-center justify-center h-64">
                <div class="flex flex-col items-center gap-3">
                    <div
                        class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"
                    ></div>
                    <p class="text-gray-400 text-sm">Loading marketplace...</p>
                </div>
            </div>

            <!-- Empty State - No Items -->
            <div
                v-else-if="
                    !hasItems &&
                    !marketplaceStore.searchQuery &&
                    !marketplaceStore.selectedCategory &&
                    !marketplaceStore.selectedType
                "
                class="flex flex-col items-center justify-center h-64 text-center"
            >
                <svg
                    class="w-20 h-20 text-gray-600 mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                </svg>
                <h3 class="text-lg font-medium text-gray-300 mb-2">Marketplace is Empty</h3>
                <p class="text-gray-500 mb-4">Be the first to share your projects and operators!</p>
                <button
                    class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    @click="openSubmitModal"
                >
                    Submit an Item
                </button>
            </div>

            <!-- Empty State - No Results -->
            <div
                v-else-if="!hasItems"
                class="flex flex-col items-center justify-center h-64 text-center"
            >
                <svg
                    class="w-16 h-16 text-gray-600 mb-4"
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
                <h3 class="text-lg font-medium text-gray-300 mb-2">No Results Found</h3>
                <p class="text-gray-500 mb-4">Try adjusting your search or filters</p>
                <button
                    class="text-blue-400 hover:text-blue-300 font-medium transition-colors"
                    @click="clearAllFilters"
                >
                    Clear All Filters
                </button>
            </div>

            <!-- Items Grid/List -->
            <div v-else>
                <!-- Results Count -->
                <div class="mb-4 text-sm text-gray-400">
                    {{ displayedItems.length }} item{{ displayedItems.length !== 1 ? 's' : '' }}
                    found
                </div>

                <!-- Grid View -->
                <div
                    v-if="viewMode === 'grid'"
                    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                >
                    <MarketplaceItemCard
                        v-for="item in displayedItems"
                        :key="item.id"
                        :item="item"
                        view-mode="grid"
                        @click="handleItemClick"
                    />
                </div>

                <!-- List View -->
                <div v-else class="space-y-3">
                    <MarketplaceItemCard
                        v-for="item in displayedItems"
                        :key="item.id"
                        :item="item"
                        view-mode="list"
                        @click="handleItemClick"
                    />
                </div>
            </div>
        </main>

        <!-- TODO: Add modals for item detail and submit -->
    </div>
</template>
