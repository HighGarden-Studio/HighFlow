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
        this.providers.set('gemini-cli' as AIProvider, new GeminiProvider(true)); // Alias for gemini-cli

        // Load models from DB cache for each provider
        // Check environment and load models accordingly
        if (typeof window !== 'undefined' && (window as any).electron?.ai) {
            // Renderer Process
            const electron = (window as any).electron;
            for (const [name, provider] of this.providers.entries()) {
                try {
                    const models = await electron.ai.getModelsFromCache(name);
                    if (models && models.length > 0) {
                        provider.setDynamicModels(models);
                    }
                } catch (error) {
                    console.warn(
                        `[ProviderFactory] Failed to load models for ${name} (IPC):`,
                        error
                    );
                }
            }
        } else {
            // Main Process or fallback
            try {
                const { providerModelsRepository } =
                    await import('../../../../electron/main/database/repositories/provider-models-repository');

                for (const [name, provider] of this.providers.entries()) {
                    try {
                        const models = await providerModelsRepository.getModels(name);
                        if (models && models.length > 0) {
                            provider.setDynamicModels(models);
                        }
                    } catch (error) {
                        // Ignore specific model load errors
                        // console.warn(`[ProviderFactory] Failed to load models for ${name} (DB):`, error);
                    }
                }
            } catch (repoError) {
                // Repository not found (e.g. strict renderer environment without IPC?)
                console.warn('[ProviderFactory] Cannot access DB repository in this environment');
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

            // Also set for gemini-cli alias
            const geminiCliProvider = this.providers.get(
                'gemini-cli' as AIProvider
            ) as GeminiProvider;
            geminiCliProvider?.setApiKey(keys.google);
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
        const provider = this.providers.get(name);
        if (!provider) return;

        // generic setConfig
        if ('setConfig' in provider && typeof (provider as any).setConfig === 'function') {
            (provider as any).setConfig(config);
        }

        // specific setApiKey fallback
        if (
            config.apiKey &&
            'setApiKey' in provider &&
            typeof (provider as any).setApiKey === 'function'
        ) {
            (provider as any).setApiKey(config.apiKey!);
        }

        // Handle aliases / synced configurations
        if (name === 'google' && config.apiKey) {
            const geminiCli = this.providers.get('gemini-cli' as AIProvider);
            if (geminiCli && 'setApiKey' in geminiCli) {
                (geminiCli as any).setApiKey(config.apiKey);
            }
        }
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
     * Check if provider is ready (async check for auth etc)
     */
    async isProviderReady(name: AIProvider): Promise<boolean> {
        const provider = this.providers.get(name);
        if (!provider) return false;

        // Check availability (config check)
        if (!this.isProviderAvailable(name)) return false;

        // Check specific readiness (e.g. auth check)
        if ('isReady' in provider && typeof (provider as any).isReady === 'function') {
            return await (provider as any).isReady();
        }

        return true;
    }

    /**
     * Get provider names
     */
    getAvailableProviders(): AIProvider[] {
        return Array.from(this.providers.keys());
    }
}
