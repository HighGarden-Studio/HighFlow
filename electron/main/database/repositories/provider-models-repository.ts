/**
 * Provider Models Repository
 *
 * Data access layer for cached AI provider models
 */

import { db } from '../client';
import { providerModels, type ProviderModel, type NewProviderModel } from '../schema';
import { eq, and, sql, desc } from 'drizzle-orm';
import type { ModelInfo } from '@core/types/ai';

export class ProviderModelsRepository {
    /**
     * Save models for a provider (replaces existing models)
     * Analyzes model characteristics using AI before saving
     */
    async saveModels(
        provider: string,
        models: ModelInfo[],
        options?: {
            analyzeCharacteristics?: boolean;
            geminiApiKey?: string;
        }
    ): Promise<void> {
        try {
            const shouldAnalyze = options?.analyzeCharacteristics ?? true;
            let modelsToSave = models;

            // Analyze characteristics if enabled and API key available
            if (shouldAnalyze && options?.geminiApiKey && models.length > 0) {
                try {
                    const { analyzeModels } =
                        await import('../../../../src/services/ai/AIModelAnalyzer');
                    console.log(
                        `[ProviderModelsRepository] Analyzing ${models.length} models with AI...`
                    );
                    modelsToSave = await analyzeModels(models, options.geminiApiKey);
                    console.log('[ProviderModelsRepository] Model analysis complete');
                } catch (error) {
                    console.warn(
                        '[ProviderModelsRepository] Failed to analyze models, saving without characteristics:',
                        error
                    );
                }
            }

            // Delete existing models and insert new ones
            // Note: better-sqlite3 with drizzle requires synchronous operations
            db.delete(providerModels).where(eq(providerModels.provider, provider)).run();

            // Insert new models
            if (modelsToSave.length > 0) {
                const now = new Date();
                const entries: NewProviderModel[] = modelsToSave.map((model: any) => ({
                    provider,
                    modelId: model.name,
                    modelName: model.name,
                    displayName: model.displayName || model.name,
                    contextWindow: model.contextWindow,
                    maxOutputTokens: model.maxOutputTokens,
                    inputCostPer1M: model.costPerInputToken ? model.costPerInputToken * 1000000 : 0,
                    outputCostPer1M: model.costPerOutputToken
                        ? model.costPerOutputToken * 1000000
                        : 0,
                    features: JSON.stringify(model.features || []),
                    bestFor: JSON.stringify(model.bestFor || []),
                    supportedActions: JSON.stringify(model.supportedActions || []),
                    description: model.description || null,
                    metadata: JSON.stringify({
                        averageLatency: model.averageLatency,
                        characteristics: model.characteristics || [],
                        characteristicsUpdatedAt: model.characteristicsUpdatedAt || null,
                    }),
                    deprecated: model.deprecated || false,
                    fetchedAt: now,
                    updatedAt: now,
                    createdAt: now,
                }));

                db.insert(providerModels).values(entries).run();
            }

            console.log(`[ProviderModelsRepository] Saved ${models.length} models for ${provider}`);
        } catch (error) {
            console.error(
                `[ProviderModelsRepository] Failed to save models for ${provider}:`,
                error
            );
            throw error;
        }
    }

    /**
     * Get all cached models for a provider
     */
    async getModels(provider: string): Promise<ModelInfo[]> {
        try {
            const models = await db
                .select()
                .from(providerModels)
                .where(eq(providerModels.provider, provider))
                .orderBy(desc(providerModels.fetchedAt));

            return models.map((model) => this.toModelInfo(model));
        } catch (error) {
            console.error(
                `[ProviderModelsRepository] Failed to get models for ${provider}:`,
                error
            );
            return [];
        }
    }

    /**
     * Get a specific model
     */
    async getModel(provider: string, modelId: string): Promise<ModelInfo | null> {
        try {
            const model = await db
                .select()
                .from(providerModels)
                .where(
                    and(eq(providerModels.provider, provider), eq(providerModels.modelId, modelId))
                )
                .limit(1);

            return model[0] ? this.toModelInfo(model[0]) : null;
        } catch (error) {
            console.error(
                `[ProviderModelsRepository] Failed to get model ${modelId} for ${provider}:`,
                error
            );
            return null;
        }
    }

    /**
     * Check if models are stale (older than 24 hours)
     */
    async areModelsStale(provider: string, maxAgeHours: number = 24): Promise<boolean> {
        try {
            const cutoffTime = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

            const result = await db
                .select({ count: sql<number>`count(*)` })
                .from(providerModels)
                .where(
                    and(
                        eq(providerModels.provider, provider),
                        sql`${providerModels.fetchedAt} >= ${cutoffTime}`
                    )
                );

            return (result[0]?.count || 0) === 0;
        } catch (error) {
            console.error(
                `[ProviderModelsRepository] Failed to check staleness for ${provider}:`,
                error
            );
            return true; // Assume stale on error
        }
    }

    /**
     * Clear all models for a provider
     */
    async clearProviderModels(provider: string): Promise<void> {
        try {
            await db.delete(providerModels).where(eq(providerModels.provider, provider));
            console.log(`[ProviderModelsRepository] Cleared models for ${provider}`);
        } catch (error) {
            console.error(
                `[ProviderModelsRepository] Failed to clear models for ${provider}:`,
                error
            );
            throw error;
        }
    }

    /**
     * Clear all cached models
     */
    async clearAllModels(): Promise<void> {
        try {
            await db.delete(providerModels);
            console.log(`[ProviderModelsRepository] Cleared all cached models`);
        } catch (error) {
            console.error(`[ProviderModelsRepository] Failed to clear all models:`, error);
            throw error;
        }
    }

    /**
     * Convert DB model to ModelInfo
     */
    private toModelInfo(model: ProviderModel): ModelInfo {
        const features = typeof model.features === 'string' ? JSON.parse(model.features) : [];
        const bestFor = typeof model.bestFor === 'string' ? JSON.parse(model.bestFor) : [];
        const supportedActions =
            typeof model.supportedActions === 'string' ? JSON.parse(model.supportedActions) : [];
        const metadata = typeof model.metadata === 'string' ? JSON.parse(model.metadata) : {};

        return {
            name: model.modelId,
            provider: model.provider as any,
            displayName: model.displayName || model.modelName || model.modelId,
            contextWindow: model.contextWindow || 0,
            maxOutputTokens: model.maxOutputTokens || 0,
            costPerInputToken: model.inputCostPer1M ? model.inputCostPer1M / 1000000 : 0,
            costPerOutputToken: model.outputCostPer1M ? model.outputCostPer1M / 1000000 : 0,
            averageLatency: metadata.averageLatency || 0,
            features: features as any[],
            bestFor: bestFor,
            // description: model.description, // Removed as not in ModelInfo
            supportedActions: supportedActions,
            deprecated: Boolean(model.deprecated),
            characteristics: metadata.characteristics || [],
            characteristicsUpdatedAt: metadata.characteristicsUpdatedAt || undefined,
        };
    }
}

// Singleton instance
export const providerModelsRepository = new ProviderModelsRepository();
