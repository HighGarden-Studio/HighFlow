<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useMarketplaceStore } from '../../stores/marketplaceStore';
import MarketplaceCard from '../../../components/marketplace/MarketplaceCard.vue';
import MarketplaceNavigation from '../../../components/marketplace/MarketplaceNavigation.vue';

const store = useMarketplaceStore();
const router = useRouter();

onMounted(async () => {
    if (store.items.length === 0) {
        await store.fetchItems();
    }
});

const filteredItems = computed(() => {
    let result = store.items;

    if (store.selectedCategory) {
        result = result.filter((item) => item.categories.includes(store.selectedCategory!));
    }

    if (store.selectedType) {
        result = result.filter((item) => item.type === store.selectedType);
    }

    if (store.searchQuery) {
        const query = store.searchQuery.toLowerCase();
        result = result.filter(
            (item) =>
                item.name.toLowerCase().includes(query) ||
                item.summary.toLowerCase().includes(query) ||
                item.tags.some((tag) => tag.toLowerCase().includes(query))
        );
    }

    return result;
});

function handleCardClick(item: any) {
    router.push({ name: 'marketplace-item-detail', params: { id: item.id } });
}
</script>

<template>
    <div class="p-8">
        <!-- Navigation Tabs -->
        <MarketplaceNavigation active-tab="all" />

        <!-- Header & Search -->
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Discover</h1>
                <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">
                    Find high-quality projects, operators, and scripts to supercharge your workflow.
                </p>
            </div>

            <div class="relative w-full md:w-96">
                <input
                    v-model="store.searchQuery"
                    type="text"
                    placeholder="Search marketplace..."
                    class="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400"
                />
                <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg
                        class="h-5 w-5 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                    </svg>
                </div>
            </div>
        </div>

        <!-- Content Grid -->
        <div v-if="store.loading" class="flex justify-center py-20">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>

        <div
            v-else-if="filteredItems.length === 0"
            class="text-center py-20 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700"
        >
            <div class="text-6xl mb-4">🔍</div>
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No items found</h3>
            <p class="text-gray-500">
                Try adjusting your search or filters to find what you're looking for.
            </p>
            <button
                @click="
                    store.searchQuery = '';
                    store.selectedCategory = null;
                    store.selectedType = null;
                "
                class="mt-4 px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
                Clear all filters
            </button>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <MarketplaceCard
                v-for="item in filteredItems"
                :key="item.id"
                :item="item"
                @click="handleCardClick"
            />
        </div>
    </div>
</template>
