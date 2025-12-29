/**
 * Claude Provider
 *
 * Anthropic Claude AI provider implementation
 */

import Anthropic from '@anthropic-ai/sdk';
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

export class ClaudeProvider extends BaseAIProvider {
    readonly name: AIProvider = 'anthropic';

    private client: Anthropic | null = null;
    private injectedApiKey: string | null = null;

    /**
     * Set API key from external source (e.g., settings store via IPC)
     */
    setApiKey(apiKey: string): void {
        this.injectedApiKey = apiKey;
        this.client = null; // Reset client to use new key
    }

    /**
     * Fetch available models from Anthropic API
     */
    async fetchModels(): Promise<ModelInfo[]> {
        try {
            if (!this.injectedApiKey) {
                console.warn('[ClaudeProvider] No API key configured, loading from DB cache');
                const { providerModelsRepository } =
                    await import('../../../../electron/main/database/repositories/provider-models-repository');
                return await providerModelsRepository.getModels('anthropic');
            }

            // Anthropic models API endpoint
            const response = await fetch('https://api.anthropic.com/v1/models', {
                headers: {
                    'x-api-key': this.injectedApiKey || '',
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.status}`);
            }

            const data = await response.json();
            const models = (data.data || []).map((m: any) => {
                return {
                    name: m.id,
                    provider: 'anthropic' as const,
                    displayName: m.display_name || m.id,
                    contextWindow: 200000,
                    maxOutputTokens: 4096,
                    costPerInputToken: 0,
                    costPerOutputToken: 0,
                    averageLatency: 1500,
                    features: ['streaming'] as AIFeature[],
                    bestFor: [],
                };
            });

            // Save to DB cache
            const { providerModelsRepository: repo1 } =
                await import('../../../../electron/main/database/repositories/provider-models-repository');
            await repo1.saveModels('anthropic', models);
            console.log(`[ClaudeProvider] Saved ${models.length} models to DB cache`);

            return models;
        } catch (error) {
            console.error('[ClaudeProvider] Failed to fetch models from API:', error);
            // Fallback to DB cache
            const { providerModelsRepository: repo2 } =
                await import('../../../../electron/main/database/repositories/provider-models-repository');
            const cachedModels = await repo2.getModels('anthropic');
            if (cachedModels.length > 0) {
                console.log('[ClaudeProvider] Using cached models from DB');
                return cachedModels;
            }
            console.warn('[ClaudeProvider] No cached models available');
            return [];
        }
    }

    async generateText(
        messages: AIMessage[],
        config: AIConfig,
        context?: ExecutionContext
    ): Promise<AiResult> {
        this.validateConfig(config);

        const enrichedMessages = this.enforceJsonCompliance(messages);
        const response = await this.chat(enrichedMessages, config, context);
        let parsed: unknown;
        try {
            parsed = JSON.parse(response.content);
        } catch {
            parsed = undefined;
        }

        const baseMeta = {
            ...(response.metadata || {}),
            provider: this.name,
            model: config.model,
            finishReason: response.finishReason,
            toolCalls: response.toolCalls,
        };

        if (parsed !== undefined) {
            return {
                kind: 'data',
                subType: 'json',
                format: 'plain',
                value: JSON.stringify(parsed, null, 2),
                mime: 'application/json',
                meta: baseMeta,
                raw: response,
            };
        }

        const detection = detectTextSubType(response.content);
        return {
            kind: detection.kind,
            subType: detection.subType,
            format: 'plain',
            value: response.content,
            mime: detection.mime,
            meta: {
                ...baseMeta,
                ...(detection.meta || {}),
            },
            raw: response,
        };
    }

    private enforceJsonCompliance(messages: AIMessage[]): AIMessage[] {
        const reminder =
            'You must respond with pure JSON only. Do not include explanations. JSON must be valid and parseable.';
        const hasSystem = messages.some((msg) => msg.role === 'system');
        if (hasSystem) {
            return messages.map((msg) =>
                msg.role === 'system' ? { ...msg, content: `${msg.content}\n\n${reminder}` } : msg
            );
        }
        return [{ role: 'system', content: reminder }, ...messages];
    }

    /**
     * Initialize Anthropic client
     */
    private getClient(): Anthropic {
        if (!this.client) {
            if (!this.injectedApiKey) {
                throw new Error(
                    'API key not configured. Please set your API key in Settings > AI Providers.'
                );
            }
            this.client = new Anthropic({ apiKey: this.injectedApiKey });
        }
        return this.client;
    }

    async chat(
        messages: AIMessage[],
        config: AIConfig,
        context?: ExecutionContext
    ): Promise<AIResponse> {
        this.validateConfig(config);

        const startTime = Date.now();
        const client = this.getClient();

        return this.executeWithRetry(async () => {
            const { systemPrompt, conversation } = this.buildAnthropicChat(
                messages,
                config,
                context
            );
            let response;
            try {
                response = await client.messages.create({
                    model: config.model,
                    max_tokens: config.maxTokens || 4096,
                    temperature: config.temperature,
                    top_p: config.topP,
                    system: systemPrompt || undefined,
                    messages: conversation,
                    tools: this.mapTools(config.tools),
                    tool_choice: config.toolChoice === 'none' ? undefined : config.toolChoice,
                });
            } catch (error: any) {
                console.error('[ClaudeProvider] API Error:', error);

                let detailedMessage = `Anthropic API Error: ${error.message || String(error)}`;
                const status = error.status || error.statusCode;

                if (status) detailedMessage += ` (Status: ${status})`;
                if (status === 401) detailedMessage += ' - Check your API Key.';
                if (status === 403)
                    detailedMessage += ' - Permission denied. Check your account settings.';
                if (status === 429) detailedMessage += ' - Rate limit exceeded. Try again later.';
                if (status === 529)
                    detailedMessage += ' - Anthropic is overloaded. Try again later.';

                throw new Error(detailedMessage);
            }

            const duration = Date.now() - startTime;
            const tokensUsed = {
                prompt: response.usage?.input_tokens || 0,
                completion: response.usage?.output_tokens || 0,
                total: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
            };

            const cost = this.calculateCost(
                { prompt: tokensUsed.prompt, completion: tokensUsed.completion },
                config.model
            );

            const textParts = response.content
                .filter((block: any) => block.type === 'text')
                .map((block: any) => block.text || '');

            const toolCalls = this.extractToolCalls(response.content) || [];
            const finishReason =
                toolCalls.length > 0
                    ? ('tool_calls' as const)
                    : this.mapStopReason(response.stop_reason);

            return {
                content: textParts.join('\n'),
                tokensUsed,
                cost,
                duration,
                model: config.model,
                finishReason,
                metadata: {
                    id: response.id,
                    model: response.model,
                    stopReason: response.stop_reason,
                },
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            };
        });
    }

    /**
     * Execute prompt with Claude
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

            let response;
            try {
                response = await client.messages.create({
                    model: config.model,
                    max_tokens: config.maxTokens || 4096,
                    temperature: config.temperature,
                    top_p: config.topP,
                    system: systemPrompt || undefined,
                    messages: [
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                    stop_sequences: config.stopSequences,
                });
            } catch (error: any) {
                console.error('[ClaudeProvider] API Error:', error);

                let detailedMessage = `Anthropic API Error: ${error.message || String(error)}`;
                const status = error.status || error.statusCode;

                if (status) detailedMessage += ` (Status: ${status})`;
                if (status === 401) detailedMessage += ' - Check your API Key.';
                if (status === 429) detailedMessage += ' - Rate limit exceeded.';
                if (status === 529) detailedMessage += ' - Overloaded.';

                throw new Error(detailedMessage);
            }

            const duration = Date.now() - startTime;
            const tokensUsed = {
                prompt: response.usage.input_tokens,
                completion: response.usage.output_tokens,
                total: response.usage.input_tokens + response.usage.output_tokens,
            };

            const cost = this.calculateCost(
                { prompt: tokensUsed.prompt, completion: tokensUsed.completion },
                config.model
            );

            // Extract text content
            const content = response.content
                .filter((block) => block.type === 'text')
                .map((block: any) => block.text)
                .join('\n');

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
                finishReason: this.mapStopReason(response.stop_reason),
                metadata: {
                    id: response.id,
                    model: response.model,
                    stopReason: response.stop_reason,
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

        const stream = await client.messages.create({
            model: config.model,
            max_tokens: config.maxTokens || 4096,
            temperature: config.temperature,
            top_p: config.topP,
            system: systemPrompt || undefined,
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            stream: true,
        });

        let accumulated = '';

        for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                const delta = chunk.delta.text;
                accumulated += delta;
                onToken(delta);

                yield {
                    delta,
                    accumulated,
                    done: false,
                };
            } else if (chunk.type === 'message_stop') {
                yield {
                    delta: '',
                    accumulated,
                    done: true,
                    metadata: {
                        finishReason: 'stop',
                    },
                };
            }
        }
    }

    /**
     * Get supported features
     */
    getSupportedFeatures(): AIFeature[] {
        return ['streaming', 'function_calling', 'vision', 'system_prompt', 'context_caching'];
    }

    /**
     * Get capabilities
     */
    getCapabilities(): Capability[] {
        return [
            {
                name: 'Long Context',
                description: 'Supports up to 200K token context window',
                supported: true,
            },
            {
                name: 'Vision',
                description: 'Can analyze images and visual content',
                supported: true,
            },
            {
                name: 'Function Calling',
                description: 'Supports tool use and function calling',
                supported: true,
            },
            {
                name: 'Streaming',
                description: 'Real-time token streaming',
                supported: true,
            },
            {
                name: 'Context Caching',
                description: 'Cache frequently used context to reduce costs',
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
     * Map Claude stop reason to standard finish reason
     */
    private mapStopReason(stopReason: string | null): AIResponse['finishReason'] {
        switch (stopReason) {
            case 'end_turn':
                return 'stop';
            case 'max_tokens':
                return 'length';
            case 'stop_sequence':
                return 'stop';
            default:
                return 'stop';
        }
    }

    private buildAnthropicChat(
        messages: AIMessage[],
        _config: AIConfig,
        _context?: ExecutionContext
    ): {
        systemPrompt: string | undefined;
        conversation: Anthropic.Messages.MessageParam[];
    } {
        const systemSegments = messages
            .filter((msg) => msg.role === 'system')
            .map((msg) => msg.content)
            .filter(Boolean);

        const conversation = messages
            .filter((msg) => msg.role !== 'system')
            .map((msg) => this.mapMessageToAnthropic(msg));

        return {
            systemPrompt: systemSegments.length > 0 ? systemSegments.join('\n\n') : undefined,
            conversation,
        };
    }

    private mapMessageToAnthropic(message: AIMessage): Anthropic.Messages.MessageParam {
        if (message.role === 'assistant') {
            const content: any[] = [];
            if (message.content) {
                content.push({ type: 'text', text: message.content });
            }
            if (message.toolCalls) {
                for (const call of message.toolCalls) {
                    content.push({
                        type: 'tool_use',
                        id: call.id,
                        name: call.name,
                        input: call.arguments,
                    } as any);
                }
            }
            return {
                role: 'assistant',
                content,
            };
        }

        if (message.role === 'tool') {
            return {
                role: 'user',
                content: [
                    {
                        type: 'tool_result',
                        tool_use_id: message.toolCallId || 'unknown',
                        content: message.content,
                    } as any,
                ],
            };
        }

        const content: any[] = [];
        if (message.content) {
            content.push({ type: 'text', text: message.content });
        }

        if (message.multiModalContent) {
            for (const part of message.multiModalContent) {
                if (part.type === 'image') {
                    // Ensure data is base64 (strip prefix if present, though ai.ts says it should be raw)
                    const base64Data = part.data.includes(',')
                        ? part.data.split(',')[1]
                        : part.data;
                    content.push({
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: part.mimeType,
                            data: base64Data,
                        },
                    });
                } else if (part.type === 'text') {
                    // Avoid duplicate text if it's the same as message.content
                    // But usually message.content is a fallback str.
                    // If multiModalContent exists, we should probably rely on it primarily.
                    // However, for safety, let's just append if it's different or just rely on multiModalContent if present.
                    // The current logic pushes message.content first.
                    // Let's change strategy: If multiModalContent exists, use it. If not, use message.content.
                }
            }
        }

        // Redoing the strategy:
        // If multiModalContent is present, map it directly.
        // Else, use message.content.

        let anthropicContent: any[] = [];
        if (message.multiModalContent && message.multiModalContent.length > 0) {
            anthropicContent = message.multiModalContent
                .map((part) => {
                    if (part.type === 'text') {
                        return { type: 'text', text: part.text };
                    } else if (part.type === 'image') {
                        const base64Data = part.data.includes(',')
                            ? part.data.split(',')[1]
                            : part.data;
                        return {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: part.mimeType,
                                data: base64Data,
                            },
                        };
                    }
                    return null;
                })
                .filter(Boolean);
        } else {
            anthropicContent = [{ type: 'text', text: message.content }];
        }

        return {
            role: message.role as 'user' | 'assistant',
            content: anthropicContent,
        };
    }

    private mapTools(tools?: AIConfig['tools']) {
        if (!tools || tools.length === 0) return undefined;
        return tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.parameters,
        }));
    }

    private extractToolCalls(blocks: Anthropic.Messages.ContentBlock[]): ToolCall[] | undefined {
        const calls: ToolCall[] = [];
        for (const block of blocks as any[]) {
            if (block.type === 'tool_use') {
                calls.push({
                    id: block.id,
                    name: block.name,
                    arguments: block.input || {},
                });
            }
        }
        return calls.length > 0 ? calls : undefined;
    }
}
