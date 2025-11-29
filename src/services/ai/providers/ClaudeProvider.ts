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
    readonly models: ModelInfo[] = [
        {
            name: 'claude-3-5-sonnet-20250219',
            provider: 'anthropic',
            contextWindow: 200000,
            maxOutputTokens: 8192,
            costPerInputToken: 3.0,
            costPerOutputToken: 15.0,
            averageLatency: 2000,
            features: [
                'streaming',
                'function_calling',
                'vision',
                'system_prompt',
                'context_caching',
            ],
            bestFor: [
                'Long-form analysis',
                'Code review',
                'Complex reasoning',
                'Document analysis',
            ],
        },
        {
            name: 'claude-3-opus-20240229',
            provider: 'anthropic',
            contextWindow: 200000,
            maxOutputTokens: 4096,
            costPerInputToken: 15.0,
            costPerOutputToken: 75.0,
            averageLatency: 3000,
            features: ['streaming', 'function_calling', 'vision', 'system_prompt'],
            bestFor: ['Complex tasks', 'Highest quality', 'Critical decisions'],
        },
        {
            name: 'claude-3-sonnet-20240229',
            provider: 'anthropic',
            contextWindow: 200000,
            maxOutputTokens: 4096,
            costPerInputToken: 3.0,
            costPerOutputToken: 15.0,
            averageLatency: 1500,
            features: ['streaming', 'function_calling', 'vision', 'system_prompt'],
            bestFor: ['Balanced performance', 'General purpose', 'Cost-effective'],
        },
        {
            name: 'claude-3-haiku-20240307',
            provider: 'anthropic',
            contextWindow: 200000,
            maxOutputTokens: 4096,
            costPerInputToken: 0.25,
            costPerOutputToken: 1.25,
            averageLatency: 500,
            features: ['streaming', 'function_calling', 'system_prompt'],
            bestFor: ['Fast responses', 'Simple tasks', 'High volume', 'Budget-friendly'],
        },
    ];

    private client: Anthropic | null = null;
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
            const apiKey = this.injectedApiKey || process.env.ANTHROPIC_API_KEY;
            if (!apiKey) {
                throw new Error(
                    'ANTHROPIC_API_KEY not configured. Please set your API key in Settings > AI Providers.'
                );
            }
            this.client = new Anthropic({ apiKey });
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
            const response = await client.messages.create({
                model: config.model,
                max_tokens: config.maxTokens || 4096,
                temperature: config.temperature,
                top_p: config.topP,
                system: systemPrompt || undefined,
                messages: conversation,
                // tools: this.mapTools(config.tools), // Removed - not supported in current SDK version
                // tool_choice: config.toolChoice === 'none' ? undefined : config.toolChoice,
            });

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

            const toolCalls = this.extractToolCalls(response.content);
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
                toolCalls: toolCalls?.length > 0 ? toolCalls : undefined,
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

            const response = await client.messages.create({
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
        prompt: string,
        config: AIConfig,
        onToken: (token: string) => void,
        context?: ExecutionContext
    ): AsyncGenerator<StreamChunk> {
        this.validateConfig(config);

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

        return {
            role: message.role as 'user' | 'assistant',
            content: [
                {
                    type: 'text',
                    text: message.content,
                },
            ],
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
