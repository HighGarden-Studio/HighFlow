/**
 * Marketplace Store - Pinia State Management
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { marketplaceAPI } from '../api/marketplace';
import type {
    MarketplaceItem,
    MarketplaceItemDetail,
    MarketplaceFilters,
    ReviewsResponse,
    ReviewSubmission,
    PurchaseResponse,
    MarketplaceSubmission,
    ItemType,
    MarketplaceCategory,
} from '@core/types/marketplace';
import { isCompatible } from '../../utils/versionCompat';

export const useMarketplaceStore = defineStore('marketplace', () => {
    // State
    const items = ref<MarketplaceItem[]>([]);
    const selectedItem = ref<MarketplaceItemDetail | null>(null);
    const reviews = ref<ReviewsResponse | null>(null);
    const purchasedItems = ref<Set<string>>(new Set());

    // Filters
    const filters = ref<MarketplaceFilters>({
        search: '',
        category: undefined,
        itemType: undefined,
        limit: 50,
        offset: 0,
    });

    // Loading states
    const loading = ref(false);
    const loadingDetails = ref(false);
    const loadingReviews = ref(false);
    const purchasing = ref(false);
    const submittingReview = ref(false);
    const submittingItem = ref(false);

    // Error
    const error = ref<string | null>(null);

    // Current app version (will be fetched from electron)
    const currentVersion = ref<string>('1.0.0');

    // Computed
    const filteredItems = computed(() => {
        let result = items.value;

        // Apply search filter
        if (filters.value.search) {
            const searchLower = filters.value.search.toLowerCase();
            result = result.filter(
                (item) =>
                    item.name.toLowerCase().includes(searchLower) ||
                    item.description.toLowerCase().includes(searchLower) ||
                    item.tags?.some((tag) => tag.toLowerCase().includes(searchLower))
            );
        }

        // Apply category filter
        if (filters.value.category) {
            result = result.filter((item) => item.category === filters.value.category);
        }

        // Apply item type filter
        if (filters.value.itemType) {
            result = result.filter((item) => item.itemType === filters.value.itemType);
        }

        return result;
    });

    // Actions
    async function initialize() {
        try {
            // Get current app version
            const version = await window.electron.app.getVersion();
            currentVersion.value = version;
            console.log('[Marketplace] Initialized with version:', version);
        } catch (err) {
            console.error('[Marketplace] Failed to get app version:', err);
        }
    }

    /**
     * Fetch marketplace items with current filters
     */
    async function fetchItems(newFilters?: Partial<MarketplaceFilters>) {
        loading.value = true;
        error.value = null;

        try {
            // Update filters if provided
            if (newFilters) {
                filters.value = { ...filters.value, ...newFilters };
            }

            const response = await marketplaceAPI.getItems(filters.value);
            items.value = response.items || [];

            console.log(`[Marketplace] Fetched ${items.value.length} items`);
        } catch (err: any) {
            error.value = err.message || 'Failed to fetch marketplace items';
            console.error('[Marketplace] Fetch error:', err);
        } finally {
            loading.value = false;
        }
    }

    /**
     * Fetch details for a specific item
     */
    async function fetchItemDetails(itemId: string) {
        loadingDetails.value = true;
        error.value = null;

        try {
            const details = await marketplaceAPI.getItemDetails(itemId);
            selectedItem.value = details;

            console.log('[Marketplace] Fetched item details:', details.name);
        } catch (err: any) {
            error.value = err.message || 'Failed to fetch item details';
            console.error('[Marketplace] Fetch details error:', err);
        } finally {
            loadingDetails.value = false;
        }
    }

    /**
     * Purchase an item
     */
    async function purchaseItem(itemId: string): Promise<PurchaseResponse | null> {
        purchasing.value = true;
        error.value = null;

        try {
            const response = await marketplaceAPI.purchaseItem(itemId);

            // Mark as purchased
            purchasedItems.value.add(itemId);

            console.log('[Marketplace] Purchased item:', itemId, response);

            return response;
        } catch (err: any) {
            // Handle specific errors
            if (err.response?.status === 402) {
                error.value = 'Insufficient credits. Please top up your account.';
            } else if (err.response?.status === 403) {
                error.value = 'You do not have permission to purchase this item.';
            } else {
                error.value = err.message || 'Failed to purchase item';
            }

            console.error('[Marketplace] Purchase error:', err);
            return null;
        } finally {
            purchasing.value = false;
        }
    }

    /**
     * Fetch reviews for an item
     */
    async function fetchReviews(itemId: string, limit = 20, offset = 0) {
        loadingReviews.value = true;
        error.value = null;

        try {
            const response = await marketplaceAPI.getReviews(itemId, limit, offset);
            reviews.value = response;

            console.log('[Marketplace] Fetched reviews:', response.reviews.length);
        } catch (err: any) {
            error.value = err.message || 'Failed to fetch reviews';
            console.error('[Marketplace] Fetch reviews error:', err);
        } finally {
            loadingReviews.value = false;
        }
    }

    /**
     * Submit a review
     */
    async function submitReview(itemId: string, review: ReviewSubmission): Promise<boolean> {
        submittingReview.value = true;
        error.value = null;

        try {
            await marketplaceAPI.submitReview(itemId, review);

            // Refresh reviews
            await fetchReviews(itemId);

            console.log('[Marketplace] Submitted review for:', itemId);
            return true;
        } catch (err: any) {
            // Handle specific errors
            if (err.response?.status === 403) {
                error.value = 'You must purchase this item before reviewing it.';
            } else if (err.response?.status === 409) {
                error.value = 'You have already reviewed this item.';
            } else {
                error.value = err.message || 'Failed to submit review';
            }

            console.error('[Marketplace] Submit review error:', err);
            return false;
        } finally {
            submittingReview.value = false;
        }
    }

    /**
     * Submit an item to marketplace
     */
    async function submitToMarketplace(submission: Omit<MarketplaceSubmission, 'clientVersion'>) {
        submittingItem.value = true;
        error.value = null;

        try {
            // Add current version
            const fullSubmission: MarketplaceSubmission = {
                ...submission,
                clientVersion: currentVersion.value,
                minClientVersion: submission.minClientVersion || currentVersion.value,
            };

            const response = await marketplaceAPI.submitToMarketplace(fullSubmission);

            console.log('[Marketplace] Submitted item:', response);
            return response;
        } catch (err: any) {
            // Handle specific errors
            if (err.response?.status === 400) {
                error.value = 'Invalid submission data. Please check all fields.';
            } else if (err.response?.status === 404) {
                error.value = 'Workflow not found or access denied.';
            } else if (err.response?.status === 409) {
                error.value = 'This workflow has already been submitted.';
            } else {
                error.value = err.message || 'Failed to submit to marketplace';
            }

            console.error('[Marketplace] Submit error:', err);
            return null;
        } finally {
            submittingItem.value = false;
        }
    }

    /**
     * Check if an item is compatible with current version
     */
    function checkCompatibility(item: MarketplaceItem | MarketplaceItemDetail): boolean {
        return isCompatible(currentVersion.value, item.minClientVersion);
    }

    /**
     * Check if item is purchased
     */
    function isPurchased(itemId: string): boolean {
        return purchasedItems.value.has(itemId);
    }

    /**
     * Update search filter
     */
    function setSearch(search: string) {
        filters.value.search = search;
    }

    /**
     * Update category filter
     */
    function setCategory(category: MarketplaceCategory | undefined) {
        filters.value.category = category;
    }

    /**
     * Update item type filter
     */
    function setItemType(itemType: ItemType | undefined) {
        filters.value.itemType = itemType;
    }

    /**
     * Clear all filters
     */
    function clearFilters() {
        filters.value = {
            search: '',
            category: undefined,
            itemType: undefined,
            limit: 50,
            offset: 0,
        };
    }

    /**
     * Clear selected item
     */
    function clearSelectedItem() {
        selectedItem.value = null;
        reviews.value = null;
    }

    return {
        // State
        items,
        filteredItems,
        selectedItem,
        reviews,
        filters,
        currentVersion,
        purchasedItems,

        // Loading states
        loading,
        loadingDetails,
        loadingReviews,
        purchasing,
        submittingReview,
        submittingItem,

        // Error
        error,

        // Actions
        initialize,
        fetchItems,
        fetchItemDetails,
        purchaseItem,
        fetchReviews,
        submitReview,
        submitToMarketplace,
        checkCompatibility,
        isPurchased,
        setSearch,
        setCategory,
        setItemType,
        clearFilters,
        clearSelectedItem,
    };
});
