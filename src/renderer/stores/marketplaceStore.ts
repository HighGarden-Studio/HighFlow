import { defineStore } from 'pinia';
import { ref } from 'vue';
import { marketplaceAPI } from '../api/marketplace';
import type {
    LibraryItem,
    MarketplaceItem,
    MarketplaceItemType,
    MarketplaceCategory,
} from '../../core/types/marketplace';

export const useMarketplaceStore = defineStore('marketplace', () => {
    // State
    const items = ref<MarketplaceItem[]>([]);
    const currentItem = ref<MarketplaceItem | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);

    // Filters
    const searchQuery = ref('');
    const selectedCategory = ref<MarketplaceCategory | null>(null);
    const selectedType = ref<MarketplaceItemType | null>(null);

    // Actions
    const libraryItems = ref<{
        purchased: LibraryItem[];
        published: LibraryItem[];
    }>({ purchased: [], published: [] });

    async function fetchItems() {
        loading.value = true;
        error.value = null;
        try {
            const response = await marketplaceAPI.getItems({
                search: searchQuery.value,
                category: selectedCategory.value as any,
                itemType: selectedType.value as any,
            });
            items.value = response.items;
        } catch (e: any) {
            error.value = e.message;
        } finally {
            loading.value = false;
        }
    }

    async function fetchItemDetails(id: string) {
        loading.value = true;
        error.value = null;
        try {
            const details = await marketplaceAPI.getItemDetails(id);
            currentItem.value = details;
        } catch (e: any) {
            error.value = e.message;
        } finally {
            loading.value = false;
        }
    }

    async function fetchLibrary() {
        loading.value = true;
        try {
            const response = await marketplaceAPI.getLibrary();
            // Split items into purchased and published based on associationType
            const all = response?.items || [];
            libraryItems.value = {
                purchased: all.filter((i: LibraryItem) => i.associationType === 'purchased'),
                published: all.filter((i: LibraryItem) => i.associationType === 'published'),
            };
        } catch (e: any) {
            console.error('Failed to fetch library', e);
        } finally {
            loading.value = false;
        }
    }

    async function purchaseItem(itemId: string) {
        loading.value = true;
        error.value = null;
        try {
            const response = await marketplaceAPI.purchaseItem(itemId);
            // After purchase, refresh item details to update ownership status
            await fetchItemDetails(itemId);
            // Also refresh library
            await fetchLibrary();
            return response;
        } catch (e: any) {
            error.value = e.message;
            throw e;
        } finally {
            loading.value = false;
        }
    }

    async function deleteItem(itemId: string) {
        loading.value = true;
        error.value = null;
        try {
            await marketplaceAPI.deleteItem(itemId);
            // Refresh library to remove the deleted item
            await fetchLibrary();
        } catch (e: any) {
            error.value = e.message;
            throw e;
        } finally {
            loading.value = false;
        }
    }

    return {
        // State
        items,
        currentItem,
        libraryItems,
        loading,
        error,

        // Filters
        searchQuery,
        selectedCategory,
        selectedType,

        // Actions
        fetchItems,
        fetchItemDetails,
        fetchLibrary,
        purchaseItem,
        deleteItem,
    };
});
