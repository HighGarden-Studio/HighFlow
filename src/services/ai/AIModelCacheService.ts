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
    /** Whether to use localStorage for persistence */
    useLocalStorage: boolean;
}

const DEFAULT_CONFIG: ModelCacheConfig = {
    cacheTTL: 24 * 60 * 60 * 1000, // 24 hours
    persistToDb: true,
    useLocalStorage: true,
};

const CACHE_STORAGE_KEY = 'ai_model_cache_v1';

export class AIModelCacheService {
    private static instance: AIModelCacheService;
    private cache: Map<AIProvider, CacheEntry> = new Map();
    private config: ModelCacheConfig;
    private refreshCallbacks: Map<AIProvider, () => Promise<ModelInfo[]>> = new Map();

    private constructor(config: Partial<ModelCacheConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };

        // Load from localStorage on initialization
        if (this.config.useLocalStorage && typeof localStorage !== 'undefined') {
            this.loadFromLocalStorage();
        }
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
     * Priority: Memory cache → Database → API refresh
     */
    async getModels(provider: AIProvider): Promise<ModelInfo[]> {
        const entry = this.cache.get(provider);

        // If we have fresh cache, return it
        if (entry && !this.isStale(provider)) {
            return entry.models;
        }

        // If no cache or stale, try loading from DB first
        if (this.config.persistToDb) {
            const dbModels = await this.loadFromDatabase(provider);
            if (dbModels.length > 0) {
                console.log(
                    `[AIModelCache] Loaded ${dbModels.length} models from DB for ${provider}`
                );
                // Update memory cache with DB models
                await this.setCachedModels(provider, dbModels);
                return dbModels;
            }
        }

        // No DB cache, try to refresh from API
        return this.refreshModels(provider);
    }

    /**
     * Force refresh models from provider API
     */
    async refreshModels(provider: AIProvider): Promise<ModelInfo[]> {
        console.log(`[AIModelCache] FORCE REFRESH requested for provider: ${provider}`);

        const fetchFn = this.refreshCallbacks.get(provider);

        if (!fetchFn) {
            console.warn(`[AIModelCache] No fetch function registered for provider: ${provider}`);
            return this.cache.get(provider)?.models || [];
        }

        try {
            console.log(`[AIModelCache] Calling fetch function for provider: ${provider}`);
            const models = await fetchFn();

            await this.setCachedModels(provider, models);
            return models;
        } catch (error) {
            console.error(`[AIModelCache] Failed to refresh models for ${provider}:`, error);

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
     * Manually set cached models (e.g. from IPC fetch)
     */
    async setCachedModels(provider: AIProvider, models: ModelInfo[]): Promise<void> {
        const now = new Date();
        const entry: CacheEntry = {
            models,
            fetchedAt: now,
            expiresAt: new Date(now.getTime() + this.config.cacheTTL),
        };

        this.cache.set(provider, entry);

        if (this.config.useLocalStorage && typeof localStorage !== 'undefined') {
            this.saveToLocalStorage();
        }

        // Persist to database if enabled
        if (this.config.persistToDb) {
            await this.persistToDatabase(provider, models);
        }

        console.log(`[AIModelCache] Cached ${models.length} models for ${provider}`);
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

        // Update localStorage
        if (this.config.useLocalStorage && typeof localStorage !== 'undefined') {
            this.saveToLocalStorage();
        }
    }

    /**
     * Check if a provider has cached models
     */
    isCached(provider: AIProvider): boolean {
        return this.cache.has(provider);
    }

    /**
     * Get last fetch time for a provider
     */
    getLastFetchTime(provider: AIProvider): Date | null {
        const entry = this.cache.get(provider);
        return entry ? entry.fetchedAt : null;
    }

    /**
     * Load cache from localStorage
     */
    private loadFromLocalStorage(): void {
        try {
            const stored = localStorage.getItem(CACHE_STORAGE_KEY);
            if (!stored) return;

            const data = JSON.parse(stored);

            // Reconstruct cache map with Date objects
            for (const [provider, entry] of Object.entries(data)) {
                const cacheEntry = entry as any;
                this.cache.set(provider as AIProvider, {
                    models: cacheEntry.models,
                    fetchedAt: new Date(cacheEntry.fetchedAt),
                    expiresAt: new Date(cacheEntry.expiresAt),
                });
            }

            console.log(
                `[AIModelCache] Loaded cache from localStorage for ${this.cache.size} providers`
            );
        } catch (error) {
            console.error('[AIModelCache] Failed to load from localStorage:', error);
        }
    }

    /**
     * Save cache to localStorage
     */
    private saveToLocalStorage(): void {
        try {
            const data: Record<string, any> = {};

            for (const [provider, entry] of this.cache.entries()) {
                data[provider] = {
                    models: entry.models,
                    fetchedAt: entry.fetchedAt.toISOString(),
                    expiresAt: entry.expiresAt.toISOString(),
                };
            }

            localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(data));
            console.log(
                `[AIModelCache] Saved cache to localStorage for ${this.cache.size} providers`
            );
        } catch (error) {
            console.error('[AIModelCache] Failed to save to localStorage:', error);
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
