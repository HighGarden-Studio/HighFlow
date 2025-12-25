/**
 * GPT Provider
 *
 * OpenAI GPT provider implementation
 */

import OpenAI from 'openai';
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
    ToolCall,
    AiResult,
    AiSubType,
} from '@core/types/ai';
import { detectTextSubType } from '../utils/aiResultUtils';

export class GPTProvider extends BaseAIProvider {
    readonly name: AIProvider = 'openai';

    private client: OpenAI | null = null;
    private injectedApiKey: string | null = null;

    /**
     * Set API key from external source (e.g., settings store via IPC)
     */
    setApiKey(apiKey: string): void {
        this.injectedApiKey = apiKey;
        this.client = null; // Reset client to use new key
    }

    constructor() {
        super();
        console.log('[GPTProvider] Initialized, models will be loaded from DB cache');
    }

    /**
     * Fetch available models from OpenAI API
     */
    async fetchModels(): Promise<ModelInfo[]> {
        try {
            if (!this.injectedApiKey) {
                console.warn('[GPTProvider] No API key configured, loading from DB cache');
                const { providerModelsRepository } =
                    await import('../../../../electron/main/database/repositories/provider-models-repository');
                return await providerModelsRepository.getModels('openai');
            }

            const client = this.getClient();
            const response = await client.models.list();
            console.log('[GPTProvider] Fetched models:', response.data);

            // Map API models to ModelInfo
            const gptModels = response.data
                .map((m) => {
                    return {
                        name: m.id,
                        provider: 'openai' as const,
                        contextWindow: 128000,
                        maxOutputTokens: 4096,
                        costPerInputToken: 0,
                        costPerOutputToken: 0,
                        averageLatency: 1000,
                        features: ['streaming'] as AIFeature[],
                        bestFor: [],
                        deprecated: m.id.includes('0314') || m.id.includes('0613'),
                    };
                })
                .sort((a, b) => a.name.localeCompare(b.name));

            // Save to DB cache
            const { providerModelsRepository: repo1 } =
                await import('../../../../electron/main/database/repositories/provider-models-repository');
            await repo1.saveModels('openai', gptModels);
            console.log(`[GPTProvider] Saved ${gptModels.length} models to DB cache`);

            return gptModels;
        } catch (error) {
            console.error('[GPTProvider] Failed to fetch models from API:', error);
            // Fallback to DB cache
            const { providerModelsRepository: repo2 } =
                await import('../../../../electron/main/database/repositories/provider-models-repository');
            const cachedModels = await repo2.getModels('openai');
            if (cachedModels.length > 0) {
                console.log('[GPTProvider] Using cached models from DB');
                return cachedModels;
            }
            console.warn('[GPTProvider] No cached models available');
            return [];
        }
    }

    /**
     * Initialize OpenAI client
     */
    private getClient(): OpenAI {
        if (!this.client) {
            if (!this.injectedApiKey) {
                throw new Error(
                    'API key not configured. Please set your API key in Settings > AI Providers.'
                );
            }
            console.log(
                '[GPTProvider] Creating new OpenAI client with key length:',
                this.injectedApiKey.length
            );
            this.client = new OpenAI({
                apiKey: this.injectedApiKey,
                dangerouslyAllowBrowser: true,
            });
        }
        return this.client;
    }

    async chat(
        messages: AIMessage[],
        config: AIConfig,
        _context?: ExecutionContext
    ): Promise<AIResponse> {
        this.validateConfig(config);

        const startTime = Date.now();
        const client = this.getClient();

        return this.executeWithRetry(async () => {
            const convertedMessages = this.buildChatMessages(messages);
            const response = await client.chat.completions.create({
                model: config.model,
                messages: convertedMessages,
                tools: this.mapTools(config.tools),
                tool_choice: config.toolChoice === 'none' ? undefined : config.toolChoice,
                max_tokens: config.maxTokens || 4096,
                temperature: config.temperature,
                top_p: config.topP,
                frequency_penalty: config.frequencyPenalty,
                presence_penalty: config.presencePenalty,
                stop: config.stopSequences,
                response_format:
                    config.responseFormat === 'json' ? { type: 'json_object' } : undefined,
            });

            const choice = response.choices[0];
            const toolCalls = this.parseToolCalls(choice?.message?.tool_calls);
            const finishReason =
                choice?.finish_reason === 'tool_calls'
                    ? 'tool_calls'
                    : this.mapFinishReason(choice?.finish_reason);

            const tokensUsed = {
                prompt: response.usage?.prompt_tokens || 0,
                completion: response.usage?.completion_tokens || 0,
                total: response.usage?.total_tokens || 0,
            };

            const cost = this.calculateCost(
                { prompt: tokensUsed.prompt, completion: tokensUsed.completion },
                config.model
            );

            const duration = Date.now() - startTime;

            return {
                content: choice?.message?.content || '',
                tokensUsed,
                cost,
                duration,
                model: config.model,
                finishReason,
                metadata: {
                    id: response.id,
                    model: response.model,
                    finishReason: choice?.finish_reason,
                },
                toolCalls,
            };
        });
    }

    async generateText(
        messages: AIMessage[],
        config: AIConfig,
        context?: ExecutionContext
    ): Promise<AiResult> {
        this.validateConfig(config);

        const client = this.getClient();
        const convertedMessages = this.buildChatMessages(messages);

        let response;
        try {
            response = await client.chat.completions.create({
                model: config.model,
                messages: convertedMessages,
                temperature: config.temperature,
                top_p: config.topP,
                frequency_penalty: config.frequencyPenalty,
                presence_penalty: config.presencePenalty,
                max_tokens: config.maxTokens || 4096,
                response_format: { type: 'json_object' },
            });
        } catch (error: any) {
            console.error('[GPTProvider] API Error:', error);
            // Enhance error message with details if available from OpenAI library
            const status = error.status || error.statusCode;
            const code = error.code;
            const type = error.type;
            const message = error.message;

            let detailedMessage = `OpenAI API Error: ${message}`;
            if (status) detailedMessage += ` (Status: ${status})`;
            if (code) detailedMessage += ` (Code: ${code})`;

            // Add helpful hints for common errors
            if (status === 401) detailedMessage += ' - Check your API Key.';
            if (status === 403) detailedMessage += ' - Check your account permissions or quota.';
            if (status === 429) detailedMessage += ' - Rate limit exceeded.';
            if (code === 'model_not_found')
                detailedMessage +=
                    ' - The requested model does not exist or you do not have access.';

            throw new Error(detailedMessage);
        }

        const choice = response.choices[0];
        const toolCalls = this.parseToolCalls(choice?.message?.tool_calls);
        const rawContent = choice?.message?.content || (toolCalls?.length ? '{}' : '');
        let parsed: unknown;
        try {
            parsed = JSON.parse(rawContent);
        } catch {
            parsed = undefined;
        }

        let result: AiResult;
        if (parsed !== undefined) {
            result = {
                kind: 'data',
                subType: 'json',
                format: 'plain',
                value: JSON.stringify(parsed, null, 2),
                mime: 'application/json',
            };
        } else {
            const detection = detectTextSubType(rawContent);
            result = {
                kind: detection.kind,
                subType: detection.subType,
                format: 'plain',
                value: rawContent,
                mime: detection.mime,
                meta: detection.meta,
            };
        }

        result.meta = {
            ...(result.meta || {}),
            provider: this.name,
            model: config.model,
            finishReason: choice?.finish_reason,
            toolCalls,
        };
        result.raw = response;
        return result;
    }

    async generateImage(
        prompt: string,
        config: AIConfig,
        context?: ExecutionContext,
        options?: Record<string, any>
    ): Promise<AiResult> {
        console.log('[GPTProvider] generateImage called with:', {
            prompt: prompt.substring(0, 100) + '...',
            model: config.model,
            options,
        });

        try {
            const client = this.getClient();
            // DALL-E 모델 이름 수정: 'dall-e-3' 또는 'dall-e-2'
            const imageModel = config.model || 'dall-e-3';
            const size = options?.size || '1024x1024';
            const quality = options?.quality || 'standard';
            const style = options?.style;
            const background = options?.background;
            const format = options?.format || 'png';
            const count = options?.count ?? 1;

            console.log('[GPTProvider] Calling OpenAI images.generate with:', {
                model: imageModel,
                size,
                quality,
                style,
                count,
            });

            const response = await client.images.generate({
                model: imageModel,
                prompt,
                size,
                quality,
                style,
                background,
                response_format: 'b64_json',
                n: count,
                user: context?.userId ? String(context.userId) : undefined,
            } as any);

            console.log('[GPTProvider] OpenAI images.generate response received:', {
                dataLength: response.data?.length,
                hasB64: !!response.data?.[0]?.b64_json,
                hasUrl: !!response.data?.[0]?.url,
            });

            const primary = response.data?.[0];
            if (!primary) {
                throw new Error('Image generation failed to return any result.');
            }

            const base64 = primary.b64_json;
            const buffer = base64 ? base64 : primary.url;
            if (!buffer) {
                throw new Error('Image generation response did not include image data.');
            }

            const aiResult: AiResult = {
                kind: 'image',
                subType: (format as AiSubType) || 'png',
                format: base64 ? 'base64' : 'url',
                value: buffer,
                mime: format === 'png' ? 'image/png' : `image/${format}`,
                meta: {
                    provider: this.name,
                    model: imageModel,
                    size,
                    quality,
                    style,
                    background,
                    count,
                    raw: response.data?.map((item) => ({
                        url: item.url,
                        revised_prompt: (item as any).revised_prompt,
                    })),
                },
                raw: response,
            };

            console.log('[GPTProvider] Image generation successful, returning AiResult');
            return aiResult;
        } catch (error) {
            console.error('[GPTProvider] Image generation FAILED:', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                name: error instanceof Error ? error.name : undefined,
            });
            throw error;
        }
    }

    /**
     * Execute prompt with GPT
     */
    async execute(
        prompt: string,
        config: AIConfig,
        context?: ExecutionContext
    ): Promise<AIResponse> {
        this.validateConfig(config);

        const startTime = Date.now();
        const client = this.getClient();

        return this.executeWithRetry(async () => {
            const systemPrompt = this.buildSystemPrompt(config, context);

            const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

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
                frequency_penalty: config.frequencyPenalty,
                presence_penalty: config.presencePenalty,
                stop: config.stopSequences,
                response_format:
                    config.responseFormat === 'json' ? { type: 'json_object' } : undefined,
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
        prompt: string,
        config: AIConfig,
        onToken: (token: string) => void,
        context?: ExecutionContext
    ): AsyncGenerator<StreamChunk> {
        this.validateConfig(config);

        const client = this.getClient();
        const systemPrompt = this.buildSystemPrompt(config, context);

        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

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

        let stream;
        try {
            stream = await client.chat.completions.create({
                model: config.model,
                messages,
                max_tokens: config.maxTokens || 4096,
                temperature: config.temperature,
                top_p: config.topP,
                stream: true,
            });
        } catch (error: any) {
            console.error('[GPTProvider] Stream API Error:', error);
            const status = error.status || error.statusCode;
            const code = error.code;
            const message = error.message;

            let detailedMessage = `OpenAI API Error: ${message}`;
            if (status) detailedMessage += ` (Status: ${status})`;
            if (code) detailedMessage += ` (Code: ${code})`;

            if (status === 401) detailedMessage += ' - Check your API Key.';
            if (status === 403)
                detailedMessage +=
                    ' - Access denied. Check account permissions, billing status, or model availability (e.g., gpt-4 requires successful payment history).';
            if (status === 429) detailedMessage += ' - Rate limit exceeded or quota check failed.';
            if (code === 'model_not_found')
                detailedMessage += ' - Model not found or not accessible.';

            throw new Error(detailedMessage);
        }

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
        return [
            'streaming',
            'function_calling',
            'vision',
            'json_mode',
            'system_prompt',
            'fine_tuning',
        ];
    }

    /**
     * Get capabilities
     */
    getCapabilities(): Capability[] {
        return [
            {
                name: 'Large Context',
                description: 'Supports up to 128K token context window (GPT-4 Turbo)',
                supported: true,
            },
            {
                name: 'Vision',
                description: 'Can analyze images (GPT-4 Turbo with vision)',
                supported: true,
            },
            {
                name: 'Function Calling',
                description: 'Native function calling support',
                supported: true,
            },
            {
                name: 'JSON Mode',
                description: 'Guaranteed valid JSON output',
                supported: true,
            },
            {
                name: 'Streaming',
                description: 'Real-time token streaming',
                supported: true,
            },
            {
                name: 'Fine-tuning',
                description: 'Custom model fine-tuning available',
                supported: true,
            },
        ];
    }

    /**
     * Map OpenAI finish reason to standard finish reason
     */
    private mapFinishReason(finishReason: string | null | undefined): AIResponse['finishReason'] {
        switch (finishReason) {
            case 'stop':
                return 'stop';
            case 'length':
                return 'length';
            case 'content_filter':
                return 'content_filter';
            default:
                return 'stop';
        }
    }

    private buildChatMessages(messages: AIMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
        return messages.map((message) => {
            if (message.role === 'tool') {
                return {
                    role: 'tool',
                    content: message.content,
                    tool_call_id: message.toolCallId || '',
                    name: message.name,
                } as OpenAI.Chat.ChatCompletionMessageParam;
            }

            if (message.role === 'assistant') {
                const toolCalls = message.toolCalls?.map((call) => ({
                    id: call.id,
                    type: 'function',
                    function: {
                        name: call.name,
                        arguments: JSON.stringify(call.arguments ?? {}),
                    },
                }));
                return {
                    role: 'assistant',
                    content: message.content,
                    tool_calls: toolCalls as any,
                } as OpenAI.Chat.ChatCompletionMessageParam;
            }

            if (message.role === 'user' && message.multiModalContent) {
                const contentParts: any[] = message.multiModalContent
                    .map((part) => {
                        if (part.type === 'text') {
                            return { type: 'text', text: part.text };
                        } else if (part.type === 'image') {
                            return {
                                type: 'image_url',
                                image_url: {
                                    url: `data:${part.mimeType};base64,${part.data}`,
                                },
                            };
                        }
                        return null;
                    })
                    .filter(Boolean);

                return {
                    role: 'user',
                    content: contentParts,
                } as OpenAI.Chat.ChatCompletionMessageParam;
            }

            return {
                role: message.role as 'user' | 'system',
                content: message.content,
            };
        });
    }

    private mapTools(tools?: AIConfig['tools']) {
        if (!tools || tools.length === 0) return undefined;
        return tools.map((tool) => ({
            type: 'function' as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
            },
        }));
    }

    private parseToolCalls(
        toolCalls?: OpenAI.Chat.ChatCompletionMessageToolCall[]
    ): ToolCall[] | undefined {
        if (!toolCalls || toolCalls.length === 0) {
            return undefined;
        }

        return toolCalls.map((call) => {
            let parsedArgs: Record<string, any> = {};
            try {
                parsedArgs = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
            } catch {
                parsedArgs = { raw: call.function?.arguments };
            }

            return {
                id: call.id,
                name: call.function?.name || 'unknown_tool',
                arguments: parsedArgs,
            };
        });
    }
}
