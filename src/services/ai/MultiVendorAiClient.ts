import type { AIProvider, AIConfig, ExecutionContext, AIMessage, AiResult } from '@core/types/ai';
import { ProviderFactory, type ProviderApiKeys } from './providers/ProviderFactory';
import type { BaseAIProvider } from './providers/BaseAIProvider';

export interface GenerateTextParams {
    messages: AIMessage[];
    config: AIConfig;
    context?: ExecutionContext;
}

export interface MediaGenerationParams {
    prompt: string;
    config: AIConfig;
    context?: ExecutionContext;
    options?: Record<string, any>;
}

/**
 * MultiVendorAiClient
 *
 * Thin orchestration layer that normalizes access to every provider.
 * Ensures AiResult metadata is consistent regardless of vendor.
 */
export class MultiVendorAiClient {
    constructor(
        private readonly providerFactory: ProviderFactory = new ProviderFactory(),
        private defaultProvider: AIProvider = 'anthropic'
    ) {}

    setApiKeys(keys: ProviderApiKeys): void {
        this.providerFactory.setApiKeys(keys);
    }

    setDefaultProvider(provider: AIProvider): void {
        this.defaultProvider = provider;
    }

    private async resolveProvider(
        vendor?: AIProvider,
        instance?: BaseAIProvider
    ): Promise<{ provider: BaseAIProvider; name: AIProvider }> {
        if (instance) {
            return { provider: instance, name: instance.name as AIProvider };
        }

        const name = vendor || this.defaultProvider;
        const provider = await this.providerFactory.getProvider(name);
        return { provider, name };
    }

    async generateText(
        params: GenerateTextParams & { signal?: AbortSignal },
        vendor?: AIProvider,
        instance?: BaseAIProvider
    ): Promise<AiResult> {
        const { provider, name } = await this.resolveProvider(vendor, instance);

        // Use chat method to support tool calling
        const aiResponse = await provider.chat(params.messages, params.config, params.context);

        // Convert AIResponse to AiResult format
        const aiResult: AiResult = {
            kind: 'data',
            subType: 'text',
            format: 'plain',
            value: aiResponse.content,
            mime: 'text/plain',
            meta: {
                provider: name,
                model: params.config.model,
                finishReason: aiResponse.finishReason,
                tokensUsed: aiResponse.tokensUsed,
                cost: aiResponse.cost,
                duration: aiResponse.duration,
                toolCalls: aiResponse.toolCalls,
            },
            raw: aiResponse,
        };

        return aiResult;
    }

    async generateImage(
        params: MediaGenerationParams,
        vendor?: AIProvider,
        instance?: BaseAIProvider
    ): Promise<AiResult> {
        const { provider, name } = await this.resolveProvider(vendor, instance);
        const aiResult = await provider.generateImage(
            params.prompt,
            params.config,
            params.context,
            params.options
        );
        aiResult.meta = {
            ...(aiResult.meta || {}),
            provider: name,
            model: params.config.model,
            kind: 'image',
        };
        return aiResult;
    }

    async generateVideo(
        params: MediaGenerationParams,
        vendor?: AIProvider,
        instance?: BaseAIProvider
    ): Promise<AiResult> {
        const { provider, name } = await this.resolveProvider(vendor, instance);
        const aiResult = await provider.generateVideo(
            params.prompt,
            params.config,
            params.context,
            params.options
        );
        aiResult.meta = {
            ...(aiResult.meta || {}),
            provider: name,
            model: params.config.model,
            kind: 'video',
        };
        return aiResult;
    }
}
