/**
 * Marketplace API Client
 */

import axios from 'axios';
import type {
    MarketplaceItemDetail,
    MarketplaceItemsResponse,
    MarketplaceFilters,
    ReviewsResponse,
    ReviewSubmission,
    PurchaseResponse,
    MarketplaceSubmission,
    SubmissionResponse,
} from '@core/types/marketplace';

// Get backend URL from environment or default
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8081';

/**
 * Marketplace API
 */
export const marketplaceAPI = {
    /**
     * Browse and search marketplace items
     */
    async getItems(filters?: MarketplaceFilters): Promise<MarketplaceItemsResponse> {
        try {
            // Get session token from main process
            const tokenResult = await window.electron.auth.getSessionToken();

            const params: any = {};
            if (filters?.category) params.category = filters.category;
            if (filters?.search) params.search = filters.search;
            if (filters?.itemType) params.itemType = filters.itemType;
            if (filters?.limit) params.limit = filters.limit;
            if (filters?.offset) params.offset = filters.offset;

            const headers: any = {
                'Content-Type': 'application/json',
            };

            // Add auth token if available (optional for browsing)
            if (tokenResult.success && tokenResult.data) {
                headers.Authorization = `Bearer ${tokenResult.data}`;
            }

            const response = await axios.get<MarketplaceItemsResponse>(
                `${BACKEND_URL}/v1/marketplace/items`,
                {
                    params,
                    headers,
                    timeout: 30000,
                }
            );

            return response.data;
        } catch (error: any) {
            console.error('Failed to fetch marketplace items:', error);
            throw error;
        }
    },

    /**
     * Get detailed information for a specific item
     */
    async getItemDetails(itemId: string): Promise<MarketplaceItemDetail> {
        try {
            // Get session token from main process
            const tokenResult = await window.electron.auth.getSessionToken();

            const headers: any = {
                'Content-Type': 'application/json',
            };

            // Add auth token if available (optional for viewing)
            if (tokenResult.success && tokenResult.data) {
                headers.Authorization = `Bearer ${tokenResult.data}`;
            }

            const response = await axios.get<MarketplaceItemDetail>(
                `${BACKEND_URL}/v1/marketplace/items/${itemId}`,
                {
                    headers,
                    timeout: 30000,
                }
            );

            return response.data;
        } catch (error: any) {
            console.error('Failed to fetch item details:', error);
            throw error;
        }
    },

    /**
     * Purchase an item using credits
     */
    async purchaseItem(itemId: string, idempotencyKey?: string): Promise<PurchaseResponse> {
        try {
            // Get session token from main process
            const tokenResult = await window.electron.auth.getSessionToken();

            if (!tokenResult.success || !tokenResult.data) {
                throw new Error('Not authenticated - please log in');
            }

            const token = tokenResult.data;

            const response = await axios.post<PurchaseResponse>(
                `${BACKEND_URL}/v1/marketplace/items/${itemId}/purchase`,
                {
                    idempotencyKey: idempotencyKey || undefined,
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    timeout: 30000,
                }
            );

            return response.data;
        } catch (error: any) {
            console.error('Failed to purchase item:', error);

            // Handle specific error codes
            if (error.response?.status === 401) {
                console.warn('⚠️  Session expired, logging out...');
                await window.electron.auth.logout();
                window.location.reload();
            }

            throw error;
        }
    },

    /**
     * Get reviews for an item
     */
    async getReviews(itemId: string, limit = 20, offset = 0): Promise<ReviewsResponse> {
        try {
            const tokenResult = await window.electron.auth.getSessionToken();

            const headers: any = {
                'Content-Type': 'application/json',
            };

            // Add auth token if available (optional for viewing)
            if (tokenResult.success && tokenResult.data) {
                headers.Authorization = `Bearer ${tokenResult.data}`;
            }

            const response = await axios.get<ReviewsResponse>(
                `${BACKEND_URL}/v1/marketplace/items/${itemId}/reviews`,
                {
                    params: { limit, offset },
                    headers,
                    timeout: 30000,
                }
            );

            return response.data;
        } catch (error: any) {
            console.error('Failed to fetch reviews:', error);
            throw error;
        }
    },

    /**
     * Submit a review for a purchased item
     */
    async submitReview(itemId: string, review: ReviewSubmission): Promise<void> {
        try {
            // Get session token from main process
            const tokenResult = await window.electron.auth.getSessionToken();

            if (!tokenResult.success || !tokenResult.data) {
                throw new Error('Not authenticated - please log in');
            }

            const token = tokenResult.data;

            await axios.post(`${BACKEND_URL}/v1/marketplace/items/${itemId}/reviews`, review, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                timeout: 30000,
            });
        } catch (error: any) {
            console.error('Failed to submit review:', error);

            // Handle specific error codes
            if (error.response?.status === 401) {
                console.warn('⚠️  Session expired, logging out...');
                await window.electron.auth.logout();
                window.location.reload();
            }

            throw error;
        }
    },

    /**
     * Submit a project or operator to the marketplace
     */
    async submitToMarketplace(submission: MarketplaceSubmission): Promise<SubmissionResponse> {
        try {
            // Get session token from main process
            const tokenResult = await window.electron.auth.getSessionToken();

            if (!tokenResult.success || !tokenResult.data) {
                throw new Error('Not authenticated - please log in');
            }

            const token = tokenResult.data;

            const response = await axios.post<SubmissionResponse>(
                `${BACKEND_URL}/v1/marketplace/submissions`,
                submission,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    timeout: 30000,
                }
            );

            return response.data;
        } catch (error: any) {
            console.error('Failed to submit to marketplace:', error);

            // Handle specific error codes
            if (error.response?.status === 401) {
                console.warn('⚠️  Session expired, logging out...');
                await window.electron.auth.logout();
                window.location.reload();
            }

            throw error;
        }
    },
};
