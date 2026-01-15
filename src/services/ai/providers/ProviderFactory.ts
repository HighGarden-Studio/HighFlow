/**
 * Provider Factory
 *
 * Factory for creating and managing AI providers
 */

import type { AIProvider } from '@core/types/ai';
import { BaseAIProvider } from './BaseAIProvider';
import { ClaudeProvider } from './ClaudeProvider';
import { GPTProvider } from './GPTProvider';
import { GeminiProvider } from './GeminiProvider';
import { DefaultHighFlowProvider } from './DefaultHighFlowProvider';
import { GroqProvider } from './GroqProvider';
import { MistralProvider } from './MistralProvider';
import { LmStudioProvider } from './LmStudioProvider';

export interface ProviderApiKeys {
    anthropic?: string;
    openai?: string;
    google?: string;
    groq?: string;
    mistral?: string;
    lmstudio?: string;
}

export class ProviderFactory {
    private providers: Map<AIProvider, BaseAIProvider>;
    private initialized: Promise<void>;

    constructor() {
        this.providers = new Map();
        this.initialized = this.initializeProviders();
    }

    /**
     * Initialize all providers and load models from DB cache
     */
    private async initializeProviders(): Promise<void> {
        // Create providers
        this.providers.set('anthropic', new ClaudeProvider());
        this.providers.set('openai', new GPTProvider());
        this.providers.set('google', new GeminiProvider());
        this.providers.set('default-highflow', new DefaultHighFlowProvider());
        this.providers.set('groq' as AIProvider, new GroqProvider());
        this.providers.set('mistral' as AIProvider, new MistralProvider());
        this.providers.set('lmstudio', new LmStudioProvider());

        // Load models from DB cache for each provider
        // Load models from DB cache for each provider
        // console.log('[ProviderFactory] Loading models from DB cache for all providers...');
        const providerModelsRepository =
            await import('../../../../electron/main/database/repositories/provider-models-repository').then(
                (m) => m.providerModelsRepository
            );

        for (const [name, provider] of this.providers.entries()) {
            try {
                const models = await providerModelsRepository.getModels(name);
                if (models.length > 0) {
                    provider.setDynamicModels(models);
                    // console.log(
                    //    `[ProviderFactory] Loaded ${models.length} models for ${name} from DB`
                    // );
                }
            } catch (error) {
                console.warn(`[ProviderFactory] Failed to load models for ${name}:`, error);
            }
        }
    }

    /**
     * Set API keys for providers (called from IPC handler with settings)
     */
    setApiKeys(keys: ProviderApiKeys): void {
        if (keys.anthropic) {
            const claudeProvider = this.providers.get('anthropic') as ClaudeProvider;
            claudeProvider?.setApiKey(keys.anthropic);
        }
        if (keys.openai) {
            const gptProvider = this.providers.get('openai') as GPTProvider;
            gptProvider?.setApiKey(keys.openai);
        }
        if (keys.google) {
            const geminiProvider = this.providers.get('google') as GeminiProvider;
            geminiProvider?.setApiKey(keys.google);
        }
        if (keys.groq) {
            const groqProvider = this.providers.get('groq' as AIProvider) as GroqProvider;
            groqProvider?.setApiKey(keys.groq);
        }
        if (keys.mistral) {
            const mistralProvider = this.providers.get('mistral' as AIProvider) as MistralProvider;
            mistralProvider?.setApiKey(keys.mistral);
        }
        if (keys.lmstudio) {
            const lmStudioProvider = this.providers.get('lmstudio') as LmStudioProvider;
            lmStudioProvider?.setApiKey(keys.lmstudio);
        }
    }

    configureProvider(name: AIProvider, config: Record<string, any>): void {
        const provider = this.providers.get(name) as BaseAIProvider & {
            setConfig?: (config: Record<string, any>) => void;
        };
        provider?.setConfig?.(config);
    }

    /**
     * Get provider by name
     */
    async getProvider(name: AIProvider): Promise<BaseAIProvider> {
        await this.initialized; // Wait for providers to be initialized with models
        const provider = this.providers.get(name);
        if (!provider) {
            throw new Error(`Provider ${name} not found`);
        }
        return provider;
    }

    /**
     * Get all providers
     */
    async getAllProviders(): Promise<BaseAIProvider[]> {
        return Array.from(this.providers.values());
    }

    /**
     * Check if provider is available
     */
    isProviderAvailable(name: AIProvider): boolean {
        return this.providers.has(name);
    }

    /**
     * Get provider names
     */
    getAvailableProviders(): AIProvider[] {
        return Array.from(this.providers.keys());
    }
}
