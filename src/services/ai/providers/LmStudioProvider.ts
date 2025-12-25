import type {
    AIProvider,
    AIModel,
    AIConfig,
    ExecutionContext,
    AIResponse,
    StreamChunk,
    AIFeature,
    Capability,
    ModelInfo,
    AIMessage,
} from '@core/types/ai';
import { BaseAIProvider } from './BaseAIProvider';

interface LmStudioProviderConfig {
    baseUrl?: string;
    apiKey?: string;
    defaultModel?: string;
}

interface ChatCompletionPayload {
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    response_format?: { type: 'json_object' };
}

export class LmStudioProvider extends BaseAIProvider {
    readonly name: AIProvider = 'lmstudio';
    readonly models: ModelInfo[];

    private baseUrl: string;
    private apiKey?: string;
    private defaultModel: AIModel;

    constructor(config: LmStudioProviderConfig = {}) {
        super();
        this.baseUrl = this.normalizeBaseUrl(config.baseUrl);
        this.apiKey = config.apiKey || undefined;
        this.defaultModel = this.normalizeModel(config.defaultModel);
        this.models = [
            {
                name: this.defaultModel,
                provider: 'lmstudio',
                contextWindow: 16384,
                maxOutputTokens: 4096,
                costPerInputToken: 0,
                costPerOutputToken: 0,
                averageLatency: 450,
                features: ['streaming', 'system_prompt', 'json_mode'],
                bestFor: ['Local experimentation', 'Offline prototyping', 'Privacy-sensitive work'],
            },
        ];
    }

    setConfig(config: LmStudioProviderConfig): void {
        if (config.baseUrl) {
            this.baseUrl = this.normalizeBaseUrl(config.baseUrl);
        }
        if (config.apiKey !== undefined) {
            this.apiKey = config.apiKey || undefined;
        }
        if (config.defaultModel) {
            this.defaultModel = this.normalizeModel(config.defaultModel);
            this.models[0].name = this.defaultModel;
        }
    }

    setApiKey(apiKey: string): void {
        this.apiKey = apiKey;
    }

    private normalizeBaseUrl(baseUrl?: string): string {
        // Check if process exists (Node.js environment vs browser)
        const envBaseUrl =
            typeof process !== 'undefined' && process.env
                ? process.env.LM_STUDIO_BASE_URL
                : undefined;
        const url = baseUrl || envBaseUrl || 'http://localhost:1234/v1';
        return url.endsWith('/') ? url.slice(0, -1) : url;
    }

    private normalizeModel(model?: string | null): AIModel {
        return (model as AIModel) || ('local-model' as AIModel);
    }

    async execute(
        prompt: string,
        config: AIConfig,
        context?: ExecutionContext
    ): Promise<AIResponse> {
        const messages: AIMessage[] = [];
        if (config.systemPrompt) {
            messages.push({ role: 'system', content: config.systemPrompt });
        }
        messages.push({ role: 'user', content: prompt });
        return this.chat(messages, config, context);
    }

    streamExecute(
        prompt: string,
        config: AIConfig,
        onToken: (token: string) => void,
        context?: ExecutionContext
    ): AsyncGenerator<StreamChunk> {
        const self = this;
        const generator = async function* () {
            const response = await self.execute(prompt, config, context);
            if (response.content) {
                onToken(response.content);
            }
            yield {
                delta: response.content,
                accumulated: response.content,
                done: true,
                metadata: response.metadata,
            };
        };
        return generator();
    }

    async chat(
        messages: AIMessage[],
        config: AIConfig,
        _context?: ExecutionContext
    ): Promise<AIResponse> {
        this.validateConfig(config);
        const start = Date.now();
        const payload = this.buildPayload(messages, config);
        const data = await this.sendRequest(payload);
        const duration = Date.now() - start;

        const choice = data.choices?.[0];
        const content = choice?.message?.content || '';
        const promptTokens =
            data.usage?.prompt_tokens ?? this.estimateTokens(JSON.stringify(payload.messages));
        const completionTokens = data.usage?.completion_tokens ?? this.estimateTokens(content);

        return {
            content,
            tokensUsed: {
                prompt: promptTokens,
                completion: completionTokens,
                total: promptTokens + completionTokens,
            },
            cost: 0,
            duration,
            model: (payload.model as AIModel) || this.defaultModel,
            finishReason: this.mapFinishReason(choice?.finish_reason),
            metadata: {
                provider: this.name,
                baseUrl: this.baseUrl,
            },
        };
    }

    getSupportedFeatures(): AIFeature[] {
        return ['streaming', 'system_prompt', 'json_mode'];
    }

    getCapabilities(): Capability[] {
        return [
            {
                name: 'Local Execution',
                description: 'Runs models locally via LM Studio OpenAI-compatible API',
                supported: true,
            },
            {
                name: 'Function Calling',
                description: 'LM Studio currently has limited tool calling support',
                supported: false,
                limitations: ['Tool calling is not yet exposed through this integration'],
            },
        ];
    }

    private buildPayload(messages: AIMessage[], config: AIConfig): ChatCompletionPayload {
        const preparedMessages: Array<{ role: string; content: string }> = [];

        if (config.systemPrompt) {
            preparedMessages.push({ role: 'system', content: config.systemPrompt });
        }

        for (const message of messages) {
            if (message.role === 'system') {
                continue;
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

                preparedMessages.push({
                    role: 'user',
                    content: contentParts as any,
                });
            } else {
                const content =
                    typeof message.content === 'string'
                        ? message.content
                        : JSON.stringify(message.content);
                preparedMessages.push({
                    role: message.role,
                    content,
                });
            }
        }

        const payload: ChatCompletionPayload = {
            model: (config.model as AIModel) || this.defaultModel,
            messages: preparedMessages,
            temperature: config.temperature ?? 0.7,
            max_tokens: config.maxTokens ?? this.models[0].maxOutputTokens,
            stream: false,
        };

        if (config.responseFormat === 'json') {
            payload.response_format = { type: 'json_object' };
        }

        return payload;
    }

    private async sendRequest(body: ChatCompletionPayload): Promise<any> {
        const url = `${this.baseUrl}/chat/completions`;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (this.apiKey) {
            headers.Authorization = `Bearer ${this.apiKey}`;
        }

        console.log(`[LmStudioProvider] Sending request to ${url}`);
        console.log(`[LmStudioProvider] Payload:`, JSON.stringify(body, null, 2));

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(
                    `[LmStudioProvider] Request failed: ${response.status} ${response.statusText}`
                );
                console.error(`[LmStudioProvider] Error details:`, errorText);

                let errorJson;
                try {
                    errorJson = JSON.parse(errorText);
                } catch {
                    // Ignore parsing error
                }

                throw new Error(
                    errorJson?.error?.message ||
                        `LM Studio request failed: ${response.status} ${response.statusText}`
                );
            }

            const data = await response.json();
            console.log(`[LmStudioProvider] Response received successfully`);
            return data;
        } catch (error) {
            console.error(`[LmStudioProvider] Network or parsing error:`, error);
            throw error;
        }
    }

    /**
     * Override validateConfig to allow any model name for LM Studio
     * since users can load any model locally.
     */
    protected validateConfig(config: AIConfig): void {
        if (
            config.temperature !== undefined &&
            (config.temperature < 0 || config.temperature > 2)
        ) {
            throw new Error('Temperature must be between 0 and 2');
        }

        if (config.maxTokens !== undefined && config.maxTokens < 1) {
            throw new Error('maxTokens must be at least 1');
        }

        if (config.topP !== undefined && (config.topP < 0 || config.topP > 1)) {
            throw new Error('topP must be between 0 and 1');
        }

        // Skip model validation for LM Studio
        // We accept any model name since it's running locally
    }

    private mapFinishReason(reason: string | undefined): AIResponse['finishReason'] {
        switch (reason) {
            case 'length':
                return 'length';
            case 'content_filter':
            case 'content-filter':
                return 'content_filter';
            case 'stop':
            case undefined:
                return 'stop';
            default:
                return 'stop';
        }
    }
}
