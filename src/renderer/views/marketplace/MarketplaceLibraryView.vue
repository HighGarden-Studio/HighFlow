<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useMarketplaceStore } from '../../stores/marketplaceStore';
import MarketplaceCard from '../../../components/marketplace/MarketplaceCard.vue';

const store = useMarketplaceStore();
const router = useRouter();

onMounted(async () => {
    if (store.items.length === 0) {
        await store.fetchItems();
    }
});

// Mock "Purchased" items by just taking the first 2 items from the store
// In real app, this would be `store.libraryItems` fetching from `/v1/marketplace/library`
const libraryItems = computed(() => {
    return store.items.slice(0, 2);
});

function handleCardClick(id: string) {
    router.push({ name: 'marketplace-item-detail', params: { id } });
}
</script>

<template>
    <div class="p-8">
        <div class="mb-8">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">My Library</h1>
            <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">
                Manage your purchased projects, operators, and scripts.
            </p>
        </div>

        <div v-if="store.loading" class="flex justify-center py-20">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>

        <div
            v-else-if="libraryItems.length === 0"
            class="text-center py-20 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700"
        >
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Your library is empty
            </h3>
            <p class="text-gray-500 mb-4">You haven't purchased any items yet.</p>
            <router-link
                to="/marketplace"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors inline-block"
            >
                Browse Marketplace
            </router-link>
        </div>

        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <MarketplaceCard
                v-for="item in libraryItems"
                :key="item.id"
                :item="item"
                @click="handleCardClick"
            />
        </div>
    </div>
</template>
