/**
 * AI Model Cache Service
 *
 * Caches fetched models from AI provider APIs and manages refresh cycles.
 * Models are stored in memory and optionally persisted to database.
 */

import type { ModelInfo, AIProvider } from '@core/types/ai';

interface CacheEntry {
    models: ModelInfo[];
    fetchedAt: Date;
    expiresAt: Date;
}

interface ModelCacheConfig {
    /** Cache TTL in milliseconds (default: 24 hours) */
    cacheTTL: number;
    /** Whether to persist cache to database */
    persistToDb: boolean;
}

const DEFAULT_CONFIG: ModelCacheConfig = {
    cacheTTL: 24 * 60 * 60 * 1000, // 24 hours
    persistToDb: true,
};

export class AIModelCacheService {
    private static instance: AIModelCacheService;
    private cache: Map<AIProvider, CacheEntry> = new Map();
    private config: ModelCacheConfig;
    private refreshCallbacks: Map<AIProvider, () => Promise<ModelInfo[]>> = new Map();

    private constructor(config: Partial<ModelCacheConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    static getInstance(config?: Partial<ModelCacheConfig>): AIModelCacheService {
        if (!AIModelCacheService.instance) {
            AIModelCacheService.instance = new AIModelCacheService(config);
        }
        return AIModelCacheService.instance;
    }

    /**
     * Register a provider's fetchModels function
     */
    registerProvider(provider: AIProvider, fetchFn: () => Promise<ModelInfo[]>): void {
        this.refreshCallbacks.set(provider, fetchFn);
    }

    /**
     * Get cached models for a provider
     * If cache is stale or empty, automatically refreshes
     */
    async getModels(provider: AIProvider): Promise<ModelInfo[]> {
        const entry = this.cache.get(provider);

        if (entry && !this.isStale(provider)) {
            return entry.models;
        }

        // Try to refresh from API
        return this.refreshModels(provider);
    }

    /**
     * Force refresh models from provider API
     */
    async refreshModels(provider: AIProvider): Promise<ModelInfo[]> {
        const fetchFn = this.refreshCallbacks.get(provider);

        if (!fetchFn) {
            console.warn(`[AIModelCache] No fetch function registered for provider: ${provider}`);
            return this.cache.get(provider)?.models || [];
        }

        try {
            console.log(`[AIModelCache] Fetching models for provider: ${provider}`);
            const models = await fetchFn();

            const now = new Date();
            const entry: CacheEntry = {
                models,
                fetchedAt: now,
                expiresAt: new Date(now.getTime() + this.config.cacheTTL),
            };

            this.cache.set(provider, entry);

            // Persist to database if enabled
            if (this.config.persistToDb) {
                await this.persistToDatabase(provider, models);
            }

            console.log(`[AIModelCache] Cached ${models.length} models for ${provider}`);
            return models;
        } catch (error) {
            console.error(`[AIModelCache] Failed to fetch models for ${provider}:`, error);

            // Try to load from database as fallback
            if (this.config.persistToDb) {
                const dbModels = await this.loadFromDatabase(provider);
                if (dbModels.length > 0) {
                    console.log(
                        `[AIModelCache] Loaded ${dbModels.length} models from database for ${provider}`
                    );
                    return dbModels;
                }
            }

            return this.cache.get(provider)?.models || [];
        }
    }

    /**
     * Refresh all registered providers
     */
    async refreshAllProviders(): Promise<void> {
        const providers = Array.from(this.refreshCallbacks.keys());
        console.log(`[AIModelCache] Refreshing models for ${providers.length} providers`);

        await Promise.allSettled(providers.map((provider) => this.refreshModels(provider)));
    }

    /**
     * Check if cache is stale for a provider
     */
    isStale(provider: AIProvider): boolean {
        const entry = this.cache.get(provider);
        if (!entry) return true;
        return new Date() > entry.expiresAt;
    }

    /**
     * Get cache info for debugging
     */
    getCacheInfo(): Map<
        AIProvider,
        { modelCount: number; fetchedAt: Date; expiresAt: Date; isStale: boolean }
    > {
        const info = new Map();

        for (const [provider, entry] of this.cache.entries()) {
            info.set(provider, {
                modelCount: entry.models.length,
                fetchedAt: entry.fetchedAt,
                expiresAt: entry.expiresAt,
                isStale: this.isStale(provider),
            });
        }

        return info;
    }

    /**
     * Clear cache for a specific provider or all providers
     */
    clearCache(provider?: AIProvider): void {
        if (provider) {
            this.cache.delete(provider);
        } else {
            this.cache.clear();
        }
    }

    /**
     * Persist models to database
     */
    private async persistToDatabase(provider: AIProvider, models: ModelInfo[]): Promise<void> {
        try {
            // TODO: Implement database persistence
            // This would use the database service to store models
            // For now, just log
            console.log(
                `[AIModelCache] Would persist ${models.length} models for ${provider} to database`
            );
        } catch (error) {
            console.error(`[AIModelCache] Failed to persist models to database:`, error);
        }
    }

    /**
     * Load models from database
     */
    private async loadFromDatabase(provider: AIProvider): Promise<ModelInfo[]> {
        try {
            // TODO: Implement database loading
            // This would use the database service to load models
            console.log(`[AIModelCache] Would load models for ${provider} from database`);
            return [];
        } catch (error) {
            console.error(`[AIModelCache] Failed to load models from database:`, error);
            return [];
        }
    }
}

// Export singleton instance
export const modelCache = AIModelCacheService.getInstance();
