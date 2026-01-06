import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { AIProvider } from '../../core/types/ai';

export type MarketplaceItemType = 'project' | 'operator' | 'script_template';

export interface MarketplaceAuthor {
    id: string;
    name: string;
    avatarUrl?: string;
    isVerified: boolean;
}

export interface MarketplaceItemStats {
    installCount: number;
    viewCount: number;
    rating: number;
    reviewCount: number;
}

export interface MarketplaceItem {
    id: string;
    type: MarketplaceItemType;
    name: string;
    summary: string;
    description: string;
    author: MarketplaceAuthor;
    price: number;
    currency: 'credit';
    stats: MarketplaceItemStats;
    version: string;
    lastUpdated: string;
    iconUrl?: string;
    previewImages: string[];
    tags: string[];
    categories: string[];
    // Optional workflow preview
    previewGraph?: {
        nodes: any[];
        edges: any[];
    };
    isOwned: boolean;
}

export const useMarketplaceStore = defineStore('marketplace', () => {
    // State
    const items = ref<MarketplaceItem[]>([]);
    const currentItem = ref<MarketplaceItem | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);

    // Filters
    const searchQuery = ref('');
    const selectedCategory = ref<string | null>(null);
    const selectedType = ref<MarketplaceItemType | null>(null);

    // Mock Data Generator
    const generateMockItems = (): MarketplaceItem[] => {
        return [
            {
                id: 'proj_1',
                type: 'project',
                name: 'Advanced RAG Workflow',
                summary:
                    'Complete RAG implementation with vector database integration and citation capability.',
                description:
                    '# Advanced RAG\nThis workflow demonstrates a production-grade RAG setup...',
                author: {
                    id: 'auth_1',
                    name: 'HighFlow Team',
                    isVerified: true,
                    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=HighFlow',
                },
                price: 0,
                currency: 'credit',
                stats: {
                    installCount: 1250,
                    viewCount: 5000,
                    rating: 4.8,
                    reviewCount: 42,
                },
                version: '1.2.0',
                lastUpdated: new Date().toISOString(),
                iconUrl: '🤖',
                previewImages: [],
                tags: ['ai', 'rag', 'search'],
                categories: ['AI Modules'],
                previewGraph: { nodes: [], edges: [] },
                isOwned: false,
            },
            {
                id: 'op_1',
                type: 'operator',
                name: 'Slack Notifier',
                summary: 'Send formatted messages to Slack channels with support for blocks.',
                description: '# Slack Notifier\nSend updates to your team...',
                author: {
                    id: 'auth_2',
                    name: 'Community Dev',
                    isVerified: false,
                    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Dev',
                },
                price: 0,
                currency: 'credit',
                stats: {
                    installCount: 890,
                    viewCount: 2100,
                    rating: 4.5,
                    reviewCount: 15,
                },
                version: '1.0.1',
                lastUpdated: new Date().toISOString(),
                iconUrl: '📢',
                previewImages: [],
                tags: ['integration', 'slack', 'notification'],
                categories: ['Integrations'],
                isOwned: true,
            },
            {
                id: 'script_1',
                type: 'script_template',
                name: 'JSON Transformer',
                summary: 'Efficiently transform deeply nested JSON structures using Lodash.',
                description:
                    '# JSON Transformer\nUtility script for common data transformations...',
                author: {
                    id: 'auth_1',
                    name: 'HighFlow Team',
                    isVerified: true,
                },
                price: 10,
                currency: 'credit',
                stats: {
                    installCount: 300,
                    viewCount: 800,
                    rating: 4.9,
                    reviewCount: 8,
                },
                version: '1.0.0',
                lastUpdated: new Date().toISOString(),
                iconUrl: '⚡️',
                previewImages: [],
                tags: ['utility', 'json', 'data-processing'],
                categories: ['Utilities'],
                isOwned: false,
            },
        ];
    };

    // Actions
    async function fetchItems() {
        loading.value = true;
        error.value = null;
        try {
            // TODO: Replace with API call
            await new Promise((resolve) => setTimeout(resolve, 800)); // Simulate latency
            items.value = generateMockItems();
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
            // TODO: Replace with API call
            await new Promise((resolve) => setTimeout(resolve, 500));
            const found = items.value.find((i) => i.id === id);
            if (found) {
                currentItem.value = found;
            } else {
                // If not in list (direct link), fetch specific or mock
                currentItem.value = generateMockItems()[0]; // Fallback for demo
                currentItem.value.id = id;
            }
        } catch (e: any) {
            error.value = e.message;
        } finally {
            loading.value = false;
        }
    }

    return {
        items,
        currentItem,
        loading,
        error,
        searchQuery,
        selectedCategory,
        selectedType,
        fetchItems,
        fetchItemDetails,
    };
});
