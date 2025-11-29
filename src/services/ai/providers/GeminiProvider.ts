/**
 * Gemini Provider
 *
 * Google Gemini AI provider implementation
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
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

export class GeminiProvider extends BaseAIProvider {
    readonly name: AIProvider = 'google';
    readonly models: ModelInfo[] = [
        {
            name: 'gemini-1.5-pro',
            provider: 'google',
            contextWindow: 1000000,
            maxOutputTokens: 8192,
            costPerInputToken: 3.5,
            costPerOutputToken: 10.5,
            averageLatency: 2000,
            features: ['streaming', 'function_calling', 'vision', 'system_prompt'],
            bestFor: ['Extremely long context', 'Multimodal tasks', 'Complex analysis'],
        },
        {
            name: 'gemini-1.5-flash',
            provider: 'google',
            contextWindow: 1000000,
            maxOutputTokens: 8192,
            costPerInputToken: 0.075,
            costPerOutputToken: 0.3,
            averageLatency: 800,
            features: ['streaming', 'function_calling', 'vision', 'system_prompt'],
            bestFor: ['Fast responses', 'High volume', 'Cost-effective', 'Long context'],
        },
        {
            name: 'gemini-pro',
            provider: 'google',
            contextWindow: 32000,
            maxOutputTokens: 8192,
            costPerInputToken: 0.5,
            costPerOutputToken: 1.5,
            averageLatency: 1000,
            features: ['streaming', 'function_calling', 'system_prompt'],
            bestFor: ['General purpose', 'Balanced performance', 'Free tier available'],
        },
    ];

    private client: GoogleGenerativeAI | null = null;
    private injectedApiKey: string | null = null;

    /**
     * Set API key from external source (e.g., settings store via IPC)
     */
    setApiKey(apiKey: string): void {
        this.injectedApiKey = apiKey;
        this.client = null; // Reset client to use new key
    }

    /**
     * Initialize Google AI client
     */
    private getClient(): GoogleGenerativeAI {
        if (!this.client) {
            const apiKey = this.injectedApiKey || process.env.GOOGLE_API_KEY;
            if (!apiKey) {
                throw new Error(
                    'GOOGLE_API_KEY not configured. Please set your API key in Settings > AI Providers.'
                );
            }
            this.client = new GoogleGenerativeAI(apiKey);
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
            const { systemInstruction, contents } = this.buildGeminiConversation(messages, config);
            const toolDeclarations = this.mapTools(config.tools);

            const model = client.getGenerativeModel({
                model: config.model,
                generationConfig: {
                    temperature: config.temperature,
                    topP: config.topP,
                    maxOutputTokens: config.maxTokens || 8192,
                    stopSequences: config.stopSequences,
                },
                ...(systemInstruction && ({ systemInstruction } as any)),
                ...(toolDeclarations && ({ tools: toolDeclarations } as any)),
            } as any);

            const result = await model.generateContent({ contents } as any);
            const response = result.response;
            const topCandidate = response.candidates?.[0];
            const parts: any[] = topCandidate?.content?.parts || [];

            const textParts = parts.filter((part) => part.text).map((part) => part.text as string);

            const toolCalls = this.extractGeminiToolCalls(parts);
            const finishReason =
                toolCalls && toolCalls.length > 0
                    ? ('tool_calls' as const)
                    : this.mapFinishReason(topCandidate?.finishReason);

            const usage = (response as any).usageMetadata;
            const tokensUsed = {
                prompt: usage?.promptTokenCount || this.estimateTokens(JSON.stringify(contents)),
                completion:
                    usage?.candidatesTokenCount || this.estimateTokens(textParts.join('\n')),
                total: usage?.totalTokenCount || 0,
            };

            if (!tokensUsed.total) {
                tokensUsed.total = tokensUsed.prompt + tokensUsed.completion;
            }

            const cost = this.calculateCost(
                { prompt: tokensUsed.prompt, completion: tokensUsed.completion },
                config.model
            );

            return {
                content: textParts.join('\n').trim() || response.text(),
                tokensUsed,
                cost,
                duration: Date.now() - startTime,
                model: config.model,
                finishReason,
                metadata: {
                    candidates: response.candidates?.length || 0,
                    promptFeedback: response.promptFeedback,
                },
                toolCalls,
            };
        });
    }

    /**
     * Execute prompt with Gemini
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
            const systemPrompt = config.systemPrompt
                ? this.buildSystemPrompt(config, context)
                : undefined;
            const model = client.getGenerativeModel({
                model: config.model,
                generationConfig: {
                    temperature: config.temperature,
                    topP: config.topP,
                    maxOutputTokens: config.maxTokens || 8192,
                    stopSequences: config.stopSequences,
                },
                ...(systemPrompt && { systemInstruction: systemPrompt }),
            } as any);

            const result = await model.generateContent(prompt);
            const response = result.response;

            const duration = Date.now() - startTime;

            // Estimate tokens (Gemini doesn't always provide usage)
            const estimatedPromptTokens = this.estimateTokens(prompt);
            const content = response.text();
            const estimatedCompletionTokens = this.estimateTokens(content);

            const tokensUsed = {
                prompt: estimatedPromptTokens,
                completion: estimatedCompletionTokens,
                total: estimatedPromptTokens + estimatedCompletionTokens,
            };

            const cost = this.calculateCost(
                { prompt: tokensUsed.prompt, completion: tokensUsed.completion },
                config.model
            );

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
                finishReason: this.mapFinishReason(response.candidates?.[0]?.finishReason),
                metadata: {
                    candidates: response.candidates?.length || 0,
                    promptFeedback: response.promptFeedback,
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
        const systemPrompt = config.systemPrompt
            ? this.buildSystemPrompt(config, context)
            : undefined;

        const model = client.getGenerativeModel({
            model: config.model,
            generationConfig: {
                temperature: config.temperature,
                topP: config.topP,
                maxOutputTokens: config.maxTokens || 8192,
            },
            ...(systemPrompt && { systemInstruction: systemPrompt }),
        } as any);

        const result = await model.generateContentStream(prompt);

        let accumulated = '';

        for await (const chunk of result.stream) {
            const delta = chunk.text();
            accumulated += delta;
            onToken(delta);

            yield {
                delta,
                accumulated,
                done: false,
            };
        }

        yield {
            delta: '',
            accumulated,
            done: true,
            metadata: {
                finishReason: 'stop',
            },
        };
    }

    async generateText(
        messages: AIMessage[],
        config: AIConfig,
        context?: ExecutionContext
    ): Promise<AiResult> {
        const prompt = messages.map((msg) => msg.content).join('\n');
        const response = await this.execute(prompt, config, context);
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

    /**
     * Get supported features
     */
    getSupportedFeatures(): AIFeature[] {
        return ['streaming', 'function_calling', 'vision', 'system_prompt'];
    }

    /**
     * Get capabilities
     */
    getCapabilities(): Capability[] {
        return [
            {
                name: 'Ultra Long Context',
                description: 'Supports up to 1M token context window',
                supported: true,
            },
            {
                name: 'Multimodal',
                description: 'Native support for text, images, audio, and video',
                supported: true,
            },
            {
                name: 'Function Calling',
                description: 'Function calling and tool use support',
                supported: true,
            },
            {
                name: 'Streaming',
                description: 'Real-time token streaming',
                supported: true,
            },
            {
                name: 'Free Tier',
                description: 'Generous free tier available',
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
     * Map Gemini finish reason to standard finish reason
     */
    private mapFinishReason(finishReason: string | undefined): AIResponse['finishReason'] {
        switch (finishReason) {
            case 'STOP':
                return 'stop';
            case 'MAX_TOKENS':
                return 'length';
            case 'SAFETY':
                return 'content_filter';
            case 'RECITATION':
                return 'content_filter';
            default:
                return 'stop';
        }
    }

    private buildGeminiConversation(
        messages: AIMessage[],
        config: AIConfig
    ): {
        systemInstruction?: string;
        contents: Array<{ role: string; parts: any[] }>;
    } {
        const systemSegments = messages
            .filter((msg) => msg.role === 'system')
            .map((msg) => msg.content)
            .filter(Boolean);

        const contents = messages
            .filter((msg) => msg.role !== 'system')
            .map((msg) => this.mapMessageToGemini(msg));

        return {
            systemInstruction: systemSegments.length > 0 ? systemSegments.join('\n\n') : undefined,
            contents,
        };
    }

    private mapMessageToGemini(message: AIMessage): { role: string; parts: any[] } {
        if (message.role === 'assistant') {
            const parts: any[] = [];
            if (message.content) {
                parts.push({ text: message.content });
            }
            if (message.toolCalls) {
                for (const call of message.toolCalls) {
                    parts.push({
                        functionCall: {
                            name: call.name,
                            args: call.arguments || {},
                        },
                    });
                }
            }
            return { role: 'model', parts };
        }

        if (message.role === 'tool') {
            return {
                role: 'function',
                parts: [
                    {
                        functionResponse: {
                            name: message.name || 'tool',
                            response: this.safeParseContent(message.content),
                        },
                    },
                ],
            };
        }

        return {
            role: 'user',
            parts: [{ text: message.content }],
        };
    }

    private mapTools(tools?: AIConfig['tools']) {
        if (!tools || tools.length === 0) return undefined;
        return [
            {
                functionDeclarations: tools.map((tool) => ({
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.parameters,
                })),
            },
        ];
    }

    private extractGeminiToolCalls(parts: any[]): ToolCall[] | undefined {
        const calls: ToolCall[] = [];
        for (const part of parts) {
            if (part.functionCall) {
                const rawArgs = part.functionCall.args;
                const args =
                    typeof rawArgs === 'string' ? this.safeParseContent(rawArgs) : rawArgs || {};
                calls.push({
                    id: `${part.functionCall.name || 'tool'}_${calls.length + 1}`,
                    name: part.functionCall.name || 'tool',
                    arguments: args,
                });
            }
        }
        return calls.length > 0 ? calls : undefined;
    }

    private safeParseContent(content: string): Record<string, any> {
        if (!content) return {};
        try {
            return JSON.parse(content);
        } catch {
            return { result: content };
        }
    }
}
