/**
 * Mistral AI Provider
 *
 * Mistral AI provider implementation using official @mistralai/mistralai SDK
 */

import { Mistral } from '@mistralai/mistralai';
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
} from '@core/types/ai';
import { detectTextSubType } from '../utils/aiResultUtils';

export class MistralProvider extends BaseAIProvider {
    readonly name: AIProvider = 'mistral' as AIProvider;

    private client: Mistral | null = null;
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
        this.validateConfig(config);
        const client = this.getClient();
        const chatMessages = this.buildChatMessages(messages, config, context);

        const response = await client.chat.complete({
            model: config.model,
            messages: chatMessages,
            maxTokens: config.maxTokens || 4096,
            temperature: config.temperature,
            topP: config.topP,
            tools: this.mapTools(config.tools),
        });

        const rawContent = response.choices?.[0]?.message?.content || '';
        const content = this.normalizeContent(rawContent);
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
                finishReason: response.choices?.[0]?.finishReason,
            },
            raw: response,
        };
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
            const chatMessages = messages.map((msg) => {
                if (msg.role === 'tool') {
                    return {
                        role: 'tool' as const,
                        tool_call_id: (msg as any).toolCallId || 'unknown',
                        content: msg.content,
                    };
                }
                return {
                    role: msg.role as 'system' | 'user' | 'assistant',
                    content: msg.content,
                    ...(msg.toolCalls && {
                        tool_calls: msg.toolCalls.map((tc) => ({
                            id: tc.id,
                            type: 'function' as const,
                            function: {
                                name: tc.name,
                                arguments: JSON.stringify(tc.arguments),
                            },
                        })),
                    }),
                };
            });

            const response = await client.chat.complete({
                model: config.model,
                messages: chatMessages as any[],
                maxTokens: config.maxTokens || 4096,
                temperature: config.temperature,
                topP: config.topP,
                tools: this.mapTools(config.tools),
            });

            const duration = Date.now() - startTime;
            const tokensUsed = {
                prompt: response.usage?.promptTokens || 0,
                completion: response.usage?.completionTokens || 0,
                total: response.usage?.totalTokens || 0,
            };

            const cost = this.calculateCost(
                { prompt: tokensUsed.prompt, completion: tokensUsed.completion },
                config.model
            );

            const rawContent = response.choices?.[0]?.message?.content || '';
            const content = this.normalizeContent(rawContent);
            const toolCalls = this.parseToolCalls(response.choices?.[0]?.message?.toolCalls);
            return {
                content,
                tokensUsed,
                cost,
                duration,
                model: config.model,
                finishReason:
                    toolCalls && toolCalls.length > 0
                        ? 'tool_calls'
                        : this.mapFinishReason(response.choices?.[0]?.finishReason),
                metadata: {
                    id: response.id,
                    model: response.model,
                    finishReason: response.choices?.[0]?.finishReason,
                },
                toolCalls,
            };
        });
    }

    private buildChatMessages(
        messages: AIMessage[],
        config: AIConfig,
        context?: ExecutionContext
    ): any[] {
        const systemPrompt =
            `${this.buildSystemPrompt(config, context)}\nYou must respond in valid JSON whenever possible. If JSON is not feasible, return a concise answer.`.trim();
        const chatMessages: any[] = [];
        if (systemPrompt) {
            chatMessages.push({ role: 'system', content: systemPrompt });
        }
        for (const message of messages) {
            chatMessages.push({
                role: message.role as 'system' | 'user' | 'assistant',
                content: message.content,
            });
        }
        return chatMessages;
    }

    /**
     * Initialize Mistral client
     */
    private getClient(): Mistral {
        if (!this.client) {
            if (!this.injectedApiKey) {
                throw new Error(
                    'API key not configured. Please set your API key in Settings > AI Providers.'
                );
            }
            this.client = new Mistral({
                apiKey: this.injectedApiKey,
            });
        }
        return this.client;
    }

    /**
     * Fetch models from Mistral API
     */
    async fetchModels(): Promise<ModelInfo[]> {
        // Return empty array if no API key is configured (not an error condition)
        if (!this.injectedApiKey) {
            console.log('[MistralProvider] No API key configured, skipping model fetch');
            return [];
        }

        try {
            const client = this.getClient();
            const response = await client.models.list();

            const models = (response.data || []).map((model: any) => ({
                name: model.id,
                provider: 'mistral' as AIProvider,
                contextWindow: model.max_context_length || 32000,
                maxOutputTokens: 8192,
                costPerInputToken: 0,
                costPerOutputToken: 0,
                averageLatency: 0,
                features: model.capabilities?.function_calling
                    ? (['streaming', 'function_calling'] as AIFeature[])
                    : (['streaming'] as AIFeature[]),
                bestFor: [],
            }));

            // Save to DB cache
            await (
                await import('../../../../electron/main/database/repositories/provider-models-repository')
            ).providerModelsRepository.saveModels('mistral', models);
            console.log(`[MistralProvider] Saved ${models.length} models to DB cache`);

            return models;
        } catch (error) {
            console.error('Failed to fetch Mistral models:', error);
            // Fallback to DB cache
            const cachedModels = await (
                await import('../../../../electron/main/database/repositories/provider-models-repository')
            ).providerModelsRepository.getModels('mistral');
            if (cachedModels.length > 0) {
                console.log('[MistralProvider] Using cached models from DB');
                return cachedModels;
            }
            console.warn('[MistralProvider] No cached models available');
            return [];
        }
    }

    /**
     * Execute prompt with Mistral
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

            const messages: any[] = [];

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

            const response = await client.chat.complete({
                model: config.model,
                messages,
                maxTokens: config.maxTokens || 4096,
                temperature: config.temperature,
                topP: config.topP,
            });

            const duration = Date.now() - startTime;
            const tokensUsed = {
                prompt: response.usage?.promptTokens || 0,
                completion: response.usage?.completionTokens || 0,
                total: response.usage?.totalTokens || 0,
            };

            const cost = this.calculateCost(
                { prompt: tokensUsed.prompt, completion: tokensUsed.completion },
                config.model
            );

            const rawContent = response.choices?.[0]?.message?.content || '';
            const content = this.normalizeContent(rawContent);

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
                finishReason: this.mapFinishReason(response.choices?.[0]?.finishReason),
                metadata: {
                    id: response.id,
                    model: response.model,
                    finishReason: response.choices?.[0]?.finishReason,
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
        this.validateConfig(config);
        const prompt = this.getPromptText(input);

        const client = this.getClient();
        const systemPrompt = this.buildSystemPrompt(config, context);

        const messages: any[] = [];

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

        const stream = await client.chat.stream({
            model: config.model,
            messages,
            maxTokens: config.maxTokens || 4096,
            temperature: config.temperature,
            topP: config.topP,
        });

        let accumulated = '';

        for await (const chunk of stream) {
            const rawDelta = chunk.data.choices?.[0]?.delta?.content || '';
            const delta = this.normalizeContent(rawDelta);
            if (delta) {
                accumulated += delta;
                onToken(delta);

                yield {
                    delta,
                    accumulated,
                    done: false,
                };
            }

            if (chunk.data.choices?.[0]?.finishReason) {
                yield {
                    delta: '',
                    accumulated,
                    done: true,
                    metadata: {
                        finishReason: chunk.data.choices[0].finishReason,
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
                name: 'Advanced Reasoning',
                description: 'Powerful reasoning capabilities for complex tasks',
                supported: true,
            },
            {
                name: 'Code Generation',
                description: 'Specialized Codestral models for coding tasks',
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
                name: 'Large Context',
                description: 'Up to 128K token context window',
                supported: true,
            },
            {
                name: 'Vision',
                description: 'Image analysis capabilities',
                supported: false,
                limitations: ['Not yet available in current models'],
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
            case 'model_length':
                return 'length';
            case 'tool_calls':
                return 'stop'; // Map to stop for now
            default:
                return 'stop';
        }
    }

    private normalizeContent(content: any): string {
        if (typeof content === 'string') {
            return content;
        }
        if (Array.isArray(content)) {
            return content.map((chunk: any) => chunk.text || '').join('');
        }
        return '';
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

    private parseToolCalls(toolCalls?: any[]): ToolCall[] | undefined {
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
