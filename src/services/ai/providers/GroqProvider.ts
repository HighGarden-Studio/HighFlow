/**
 * Groq Provider
 *
 * Groq AI provider implementation using official groq-sdk
 */

import Groq from 'groq-sdk';
import { BaseAIProvider } from './BaseAIProvider';
import type {
    AIProvider,
    AIConfig,
    ExecutionContext,
    AIResponse,
    StreamChunk,
    AIFeature,
    Capability,
    ModelInfo,
    AIMessage,
    AiResult,
} from '@core/types/ai';
import { detectTextSubType } from '../utils/aiResultUtils';

export class GroqProvider extends BaseAIProvider {
    readonly name: AIProvider = 'groq' as AIProvider;
    readonly defaultModels: ModelInfo[] = [
        {
            name: 'llama-3.3-70b-versatile',
            provider: 'groq' as AIProvider,
            contextWindow: 128000,
            maxOutputTokens: 32768,
            costPerInputToken: 0.59,
            costPerOutputToken: 0.79,
            averageLatency: 300,
            features: ['streaming', 'function_calling', 'system_prompt'],
            bestFor: ['Fast responses', 'General purpose', 'Code generation'],
        },
        {
            name: 'llama-3.1-70b-versatile',
            provider: 'groq' as AIProvider,
            contextWindow: 128000,
            maxOutputTokens: 8192,
            costPerInputToken: 0.59,
            costPerOutputToken: 0.79,
            averageLatency: 300,
            features: ['streaming', 'function_calling', 'system_prompt'],
            bestFor: ['Fast responses', 'General purpose', 'Code generation'],
        },
        {
            name: 'llama-3.1-8b-instant',
            provider: 'groq' as AIProvider,
            contextWindow: 128000,
            maxOutputTokens: 8192,
            costPerInputToken: 0.05,
            costPerOutputToken: 0.08,
            averageLatency: 100,
            features: ['streaming', 'function_calling', 'system_prompt'],
            bestFor: ['Ultra-fast responses', 'Simple tasks', 'High volume'],
        },
        {
            name: 'mixtral-8x7b-32768',
            provider: 'groq' as AIProvider,
            contextWindow: 32768,
            maxOutputTokens: 8192,
            costPerInputToken: 0.24,
            costPerOutputToken: 0.24,
            averageLatency: 200,
            features: ['streaming', 'function_calling', 'system_prompt'],
            bestFor: ['Balanced performance', 'Code tasks', 'Long context'],
        },
        {
            name: 'gemma2-9b-it',
            provider: 'groq' as AIProvider,
            contextWindow: 8192,
            maxOutputTokens: 8192,
            costPerInputToken: 0.2,
            costPerOutputToken: 0.2,
            averageLatency: 150,
            features: ['streaming', 'system_prompt'],
            bestFor: ['Fast responses', 'Instruction following'],
        },
    ];

    private client: Groq | null = null;
    private injectedApiKey: string | null = null;

    /**
     * Set API key from external source (e.g., settings store via IPC)
     */
    setApiKey(apiKey: string): void {
        this.injectedApiKey = apiKey;
        this.client = null; // Reset client to use new key
    }

    async generateText(
        messages: AIMessage[],
        config: AIConfig,
        context?: ExecutionContext
    ): Promise<AiResult> {
        await this.validateConfig(config);
        const client = this.getClient();

        const systemPrompt = this.buildSystemPrompt(config, context);
        const systemMessage: Groq.Chat.ChatCompletionMessageParam | undefined = systemPrompt
            ? { role: 'system', content: systemPrompt }
            : undefined;

        const userMessages = this.buildChatMessages(messages.filter((m) => m.role !== 'system'));
        const chatMessages = systemMessage ? [systemMessage, ...userMessages] : userMessages;

        const response = await client.chat.completions.create({
            model: config.model,
            messages: chatMessages,
            max_tokens: config.maxTokens || 4096,
            temperature: config.temperature,
            top_p: config.topP,
            stop: config.stopSequences,
        });

        const content = response.choices[0]?.message?.content || '';
        const detection = detectTextSubType(content);

        return {
            kind: detection.kind,
            subType: detection.subType,
            format: 'plain',
            value: content,
            mime: detection.mime,
            meta: {
                ...(detection.meta || {}),
                provider: this.name,
                model: config.model,
                finishReason: response.choices[0]?.finish_reason,
            },
            raw: response,
        };
    }

    /**
     * Initialize Groq client
     */
    private getClient(): Groq {
        if (!this.client) {
            const apiKey = this.injectedApiKey || process.env.GROQ_API_KEY;
            if (!apiKey) {
                throw new Error(
                    'GROQ_API_KEY not configured. Please set your API key in Settings > AI Providers.'
                );
            }
            this.client = new Groq({
                apiKey,
                dangerouslyAllowBrowser: true, // Essential for Electron renderer process
            });
        }
        return this.client;
    }

    /**
     * Fetch models from Groq API
     */
    async fetchModels(): Promise<ModelInfo[]> {
        const providerId = 'groq';
        try {
            const client = this.getClient();
            const response = await client.models.list();

            const models = response.data.map((model: any) => ({
                name: model.id,
                provider: providerId as AIProvider,
                contextWindow: model.context_window || 8192, // Default fallback
                maxOutputTokens: 4096, // Default fallback
                costPerInputToken: 0,
                costPerOutputToken: 0,
                averageLatency: 0,
                features: ['streaming'] as AIFeature[],
                bestFor: [],
            }));

            // Save to DB cache
            try {
                const { providerModelsRepository } =
                    await import('../../../../electron/main/database/repositories/provider-models-repository');
                await providerModelsRepository.saveModels(providerId, models);
                console.log('[GroqProvider] Saved models to DB cache');
            } catch (saveError) {
                console.error('[GroqProvider] Failed to save models to DB:', saveError);
            }

            // Allow immediate usage by setting dynamic models
            this.setDynamicModels(models);

            return models;
        } catch (error) {
            console.error('Failed to fetch Groq models:', error);

            // Fallback to DB cache
            try {
                const { providerModelsRepository } =
                    await import('../../../../electron/main/database/repositories/provider-models-repository');
                const cachedModels = await providerModelsRepository.getModels(providerId);
                if (cachedModels.length > 0) {
                    console.log('[GroqProvider] Using cached models from DB');
                    this.setDynamicModels(cachedModels);
                    return cachedModels;
                }
            } catch (dbError) {
                console.warn('[GroqProvider] Failed to load cached models:', dbError);
            }

            console.warn('[GroqProvider] Using default hardcoded models');
            this.setDynamicModels(this.defaultModels);
            return this.defaultModels;
        }
    }

    /**
     * Ensure models are loaded from DB if not already available
     */
    private async ensureModelsLoaded(): Promise<void> {
        if (this.models.length > 0) return;

        console.log('[GroqProvider] Models not loaded, attempting to load from DB...');
        try {
            const { providerModelsRepository } =
                await import('../../../../electron/main/database/repositories/provider-models-repository');
            const cachedModels = await providerModelsRepository.getModels('groq');

            if (cachedModels.length > 0) {
                console.log(`[GroqProvider] Loaded ${cachedModels.length} models from DB`);
                this.setDynamicModels(cachedModels);
            } else {
                console.log('[GroqProvider] No models in DB, fetching from API...');
                try {
                    await this.fetchModels();
                } catch (fetchError) {
                    console.error('[GroqProvider] Failed to fetch models from API:', fetchError);
                    console.log('[GroqProvider] Falling back to default models');
                    this.setDynamicModels(this.defaultModels);
                }
            }
        } catch (error) {
            console.error('[GroqProvider] Failed to load models from DB:', error);
            // Try fetching from API as last resort
            try {
                await this.fetchModels();
            } catch (fetchError) {
                console.error('[GroqProvider] Failed to fetch models from API:', fetchError);
                this.setDynamicModels(this.defaultModels);
            }
        }
    }

    /**
     * Execute prompt with Groq
     */
    async execute(
        prompt: string,
        config: AIConfig,
        context?: ExecutionContext
    ): Promise<AIResponse> {
        await this.ensureModelsLoaded();
        await this.validateConfig(config);

        const startTime = Date.now();
        const client = this.getClient();

        return this.executeWithRetry(async () => {
            const systemPrompt = this.buildSystemPrompt(config, context);

            const messages: Groq.Chat.ChatCompletionMessageParam[] = [];

            if (systemPrompt) {
                messages.push({
                    role: 'system',
                    content: systemPrompt,
                });
            }

            messages.push({
                role: 'user',
                content: prompt,
            });

            const response = await client.chat.completions.create({
                model: config.model,
                messages,
                max_tokens: config.maxTokens || 4096,
                temperature: config.temperature,
                top_p: config.topP,
                stop: config.stopSequences,
            });

            const duration = Date.now() - startTime;
            const tokensUsed = {
                prompt: response.usage?.prompt_tokens || 0,
                completion: response.usage?.completion_tokens || 0,
                total: response.usage?.total_tokens || 0,
            };

            const cost = this.calculateCost(
                { prompt: tokensUsed.prompt, completion: tokensUsed.completion },
                config.model
            );

            const content = response.choices[0]?.message?.content || '';

            this.logMetrics('execute', {
                tokensUsed: tokensUsed.total,
                cost,
                duration,
                model: config.model,
            });

            return {
                content,
                tokensUsed,
                cost,
                duration,
                model: config.model,
                finishReason: this.mapFinishReason(response.choices[0]?.finish_reason),
                metadata: {
                    id: response.id,
                    model: response.model,
                    finishReason: response.choices[0]?.finish_reason,
                },
            };
        });
    }

    /**
     * Execute with streaming
     */
    async *streamExecute(
        input: string | AIMessage[],
        config: AIConfig,
        onToken: (token: string) => void,
        context?: ExecutionContext
    ): AsyncGenerator<StreamChunk> {
        await this.ensureModelsLoaded();
        await this.validateConfig(config);

        const client = this.getClient();
        const systemPrompt = this.buildSystemPrompt(config, context);

        let messages: Groq.Chat.ChatCompletionMessageParam[] = [];

        if (systemPrompt) {
            messages.push({
                role: 'system',
                content: systemPrompt,
            });
        }

        if (Array.isArray(input)) {
            // Filter out system messages from input since we handled them via config/buildSystemPrompt
            // or if they are in input, we might duplicate?
            // BaseAIProvider usually puts system prompt in config.
            // If input has system message, we should probably prefer it or merge.
            // For now, let's assume input 'user/assistant' messages are what we need + config system prompt.
            const chatMessages = this.buildChatMessages(input.filter((m) => m.role !== 'system'));
            messages = [...messages, ...chatMessages];
        } else {
            messages.push({
                role: 'user',
                content: input,
            });
        }

        const stream = await client.chat.completions.create({
            model: config.model,
            messages,
            max_tokens: config.maxTokens || 4096,
            temperature: config.temperature,
            top_p: config.topP,
            stream: true,
        });

        let accumulated = '';

        for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content || '';
            if (delta) {
                accumulated += delta;
                onToken(delta);

                yield {
                    delta,
                    accumulated,
                    done: false,
                };
            }

            if (chunk.choices[0]?.finish_reason) {
                yield {
                    delta: '',
                    accumulated,
                    done: true,
                    metadata: {
                        finishReason: chunk.choices[0].finish_reason,
                    },
                };
            }
        }
    }

    /**
     * Get supported features
     */
    getSupportedFeatures(): AIFeature[] {
        return ['streaming', 'function_calling', 'system_prompt'];
    }

    /**
     * Get capabilities
     */
    getCapabilities(): Capability[] {
        return [
            {
                name: 'Ultra-Fast Inference',
                description: 'Industry-leading inference speed with LPU technology',
                supported: true,
            },
            {
                name: 'Large Context',
                description: 'Supports up to 128K token context window',
                supported: true,
            },
            {
                name: 'Function Calling',
                description: 'Tool use and function calling support',
                supported: true,
            },
            {
                name: 'Streaming',
                description: 'Real-time token streaming',
                supported: true,
            },
            {
                name: 'Vision',
                description: 'Image analysis capabilities',
                supported: true,
            },
            {
                name: 'JSON Mode',
                description: 'Structured JSON output',
                supported: false,
                limitations: ['Requires prompt engineering'],
            },
        ];
    }

    /**
     * Map finish reason to standard finish reason
     */
    private mapFinishReason(finishReason: string | null | undefined): AIResponse['finishReason'] {
        switch (finishReason) {
            case 'stop':
                return 'stop';
            case 'length':
                return 'length';
            case 'content_filter': // Groq typically uses standard OpenAI reasons
            case 'tool_calls':
                return 'stop'; // Map specialized stops to generic 'stop' for now or expand AIResponse type
            default:
                return 'stop';
        }
    }

    private buildChatMessages(messages: AIMessage[]): Groq.Chat.ChatCompletionMessageParam[] {
        return messages.map((message) => {
            // Handle multi-modal content (Vision)
            if (message.multiModalContent && message.multiModalContent.length > 0) {
                const contentParts: any[] = [];

                message.multiModalContent.forEach((part) => {
                    if (part.type === 'text') {
                        contentParts.push({ type: 'text', text: part.text });
                    } else if (part.type === 'image' && part.data) {
                        let imageUrl = part.data;
                        // For Groq/OpenAI, it expects data URI for base64 inline images
                        if (!imageUrl.startsWith('data:')) {
                            imageUrl = `data:${part.mimeType || 'image/png'};base64,${part.data}`;
                        }

                        contentParts.push({
                            type: 'image_url',
                            image_url: {
                                url: imageUrl,
                            },
                        });
                    }
                });

                return {
                    role: message.role as any,
                    content: contentParts,
                };
            }

            // Standard text content
            return {
                role: message.role as any,
                content: message.content,
            };
        });
    }
}
