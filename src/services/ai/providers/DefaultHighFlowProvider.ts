/**
 * Default HighFlow Provider
 *
 * Uses backend proxy to access Gemini (or other) API with app account credits.
 * Requires user authentication.
 */

import { GeminiProvider } from './GeminiProvider';
import type {
    AIProvider,
    AIConfig,
    ExecutionContext,
    AIResponse,
    StreamChunk,
    AIMessage,
} from '@core/types/ai';

import { BACKEND_URL } from '../../../config';
import type { ModelInfo } from '@core/types/ai';

export class DefaultHighFlowProvider extends GeminiProvider {
    readonly name: AIProvider = 'default-highflow';

    /**
     * Vertex AI supported Gemini models (per Google Cloud documentation)
     * https://cloud.google.com/vertex-ai/generative-ai/docs/models
     */
    readonly defaultModels: ModelInfo[] = [
        // GA Gemini Models
        {
            name: 'gemini-2.5-pro',
            provider: 'default-highflow',
            displayName: 'Gemini 2.5 Pro',
            contextWindow: 1000000,
            maxOutputTokens: 65536,
            costPerInputToken: 5.0,
            costPerOutputToken: 15.0,
            averageLatency: 2000,
            features: ['streaming', 'function_calling', 'vision', 'system_prompt'],
            bestFor: ['Complex reasoning', 'Advanced coding', 'Agentic workflows'],
        },
        {
            name: 'gemini-2.5-flash',
            provider: 'default-highflow',
            displayName: 'Gemini 2.5 Flash',
            contextWindow: 1000000,
            maxOutputTokens: 65536,
            costPerInputToken: 0.15,
            costPerOutputToken: 0.6,
            averageLatency: 800,
            features: ['streaming', 'function_calling', 'vision', 'system_prompt'],
            bestFor: ['Fast responses', 'Balance of cost and performance'],
        },
        {
            name: 'gemini-2.5-flash-lite',
            provider: 'default-highflow',
            displayName: 'Gemini 2.5 Flash Lite',
            contextWindow: 1000000,
            maxOutputTokens: 65536,
            costPerInputToken: 0.075,
            costPerOutputToken: 0.3,
            averageLatency: 500,
            features: ['streaming', 'function_calling', 'system_prompt'],
            bestFor: ['High volume', 'Cost-effective', 'Simple tasks'],
        },
        {
            name: 'gemini-2.0-flash',
            provider: 'default-highflow',
            displayName: 'Gemini 2.0 Flash',
            contextWindow: 1000000,
            maxOutputTokens: 8192,
            costPerInputToken: 0.1,
            costPerOutputToken: 0.4,
            averageLatency: 800,
            features: ['streaming', 'function_calling', 'vision', 'system_prompt'],
            bestFor: ['General purpose', 'Multimodal tasks'],
        },
        // Preview Models
        {
            name: 'gemini-3.0-pro',
            provider: 'default-highflow',
            displayName: 'Gemini 3.0 Pro (Preview)',
            contextWindow: 1000000,
            maxOutputTokens: 65536,
            costPerInputToken: 7.0,
            costPerOutputToken: 21.0,
            averageLatency: 3000,
            features: ['streaming', 'function_calling', 'vision', 'system_prompt'],
            bestFor: ['Complex reasoning', 'Agentic workflows', 'Autonomous coding'],
        },
        // Image Models
        {
            name: 'gemini-2.5-flash-preview-image-generation',
            provider: 'default-highflow',
            displayName: 'Gemini 2.5 Flash Image',
            contextWindow: 0,
            maxOutputTokens: 0,
            costPerInputToken: 0,
            costPerOutputToken: 0,
            averageLatency: 3000,
            features: ['vision'],
            bestFor: ['Fast image generation', '1024px resolution'],
        },
        {
            name: 'imagen-4.0-generate-001',
            provider: 'default-highflow',
            displayName: 'Imagen 4',
            contextWindow: 0,
            maxOutputTokens: 0,
            costPerInputToken: 0,
            costPerOutputToken: 0,
            averageLatency: 5000,
            features: [],
            bestFor: ['High-fidelity image generation', '4K resolution'],
        },
        {
            name: 'imagen-3.0-generate-002',
            provider: 'default-highflow',
            displayName: 'Imagen 3',
            contextWindow: 0,
            maxOutputTokens: 0,
            costPerInputToken: 0,
            costPerOutputToken: 0,
            averageLatency: 4000,
            features: [],
            bestFor: ['Image generation', 'Illustrations'],
        },
        // Video Models
        {
            name: 'veo-3.1-generate-001',
            provider: 'default-highflow',
            displayName: 'Veo 3.1',
            contextWindow: 0,
            maxOutputTokens: 0,
            costPerInputToken: 0,
            costPerOutputToken: 0,
            averageLatency: 20000,
            features: [],
            bestFor: ['High-fidelity video generation', '1080p video'],
        },
        {
            name: 'veo-3.0-generate-001',
            provider: 'default-highflow',
            displayName: 'Veo 3.0',
            contextWindow: 0,
            maxOutputTokens: 0,
            costPerInputToken: 0,
            costPerOutputToken: 0,
            averageLatency: 15000,
            features: [],
            bestFor: ['Video generation'],
        },
        {
            name: 'veo-2.0-generate-001',
            provider: 'default-highflow',
            displayName: 'Veo 2.0',
            contextWindow: 0,
            maxOutputTokens: 0,
            costPerInputToken: 0,
            costPerOutputToken: 0,
            averageLatency: 10000,
            features: [],
            bestFor: ['Fast video generation', '720p video'],
        },
        // Legacy Models (keeping for backward compatibility)
        {
            name: 'gemini-1.5-pro',
            provider: 'default-highflow',
            displayName: 'Gemini 1.5 Pro',
            contextWindow: 1000000,
            maxOutputTokens: 8192,
            costPerInputToken: 3.5,
            costPerOutputToken: 10.5,
            averageLatency: 2000,
            features: ['streaming', 'function_calling', 'vision', 'system_prompt'],
            bestFor: ['Long context', 'Complex analysis'],
        },
        {
            name: 'gemini-1.5-flash',
            provider: 'default-highflow',
            displayName: 'Gemini 1.5 Flash',
            contextWindow: 1000000,
            maxOutputTokens: 8192,
            costPerInputToken: 0.075,
            costPerOutputToken: 0.3,
            averageLatency: 800,
            features: ['streaming', 'function_calling', 'vision', 'system_prompt'],
            bestFor: ['Fast responses', 'Cost-effective'],
        },
    ];

    /**
     * Fetch models - for DefaultHighFlow, we return static Vertex AI models
     * as we don't have direct access to Vertex AI model listing API
     */
    async fetchModels(): Promise<ModelInfo[]> {
        console.log('[DefaultHighFlowProvider] Using Vertex AI model list');
        return this.defaultModels;
    }

    /**
     * Check if user is authenticated
     * Note: This code runs in Electron main process, so we use direct imports
     */
    private async checkAuthentication(): Promise<{ authenticated: boolean; token?: string }> {
        try {
            // In Electron main process, we can't use window.electron
            // Instead, we dynamically import the auth module
            const { loadSessionToken } =
                await import('../../../../electron/main/auth/google-oauth');

            const token = loadSessionToken();

            if (!token) {
                console.warn('[DefaultHighFlowProvider] No session token found');
                return { authenticated: false };
            }

            return {
                authenticated: true,
                token: token,
            };
        } catch (error) {
            console.error('[DefaultHighFlowProvider] Authentication check failed:', error);
            return { authenticated: false };
        }
    }

    /**
     * Call backend proxy API
     */
    private async callBackendProxy(request: any, token: string): Promise<any> {
        try {
            let apiUrl = BACKEND_URL;
            try {
                // Dynamically import config from electron main process if possible
                // This ensures we respect process.env in the main process
                const { config } = await import('../../../../electron/main/config');
                apiUrl = config.BACKEND_URL;
            } catch (e) {
                // Fallback to static config if import fails (e.g. in renderer)
            }

            console.log(
                `[DefaultHighFlowProvider] Calling backend proxy at ${apiUrl}/v1/ai/generate...`
            );

            const response = await fetch(`${apiUrl}/v1/ai/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(request),
            });

            if (!response.ok) {
                console.error(
                    `[DefaultHighFlowProvider] Backend response status: ${response.status} ${response.statusText}`
                );

                // Handle specific error codes
                if (response.status === 402) {
                    const errorData = await response
                        .json()
                        .catch(() => ({ required: '?', available: '?' }));
                    throw new Error(
                        `크레딧이 부족합니다. 필요: ${errorData.required}, 보유: ${errorData.available}`
                    );
                } else if (response.status === 429) {
                    throw new Error('API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
                } else if (response.status === 401) {
                    // Session expired
                    console.warn('[DefaultHighFlowProvider] 401 Unauthorized - session expired');
                    // We can't call window.electron.auth.logout() here, just log the error
                    throw new Error('세션이 만료되었습니다. 다시 로그인해주세요.');
                }

                const errorText = await response.text();
                const errorMsg = `Backend proxy error (${response.status}): ${errorText}`;
                console.error(`[DefaultHighFlowProvider] ${errorMsg}`);
                throw new Error(errorMsg);
            }

            const data = await response.json();
            console.log('[DefaultHighFlowProvider] Backend proxy response received successfully');
            return data;
        } catch (error: any) {
            console.error('[DefaultHighFlowProvider] Backend proxy call failed:', error);
            throw error;
        }
    }

    /**
     * Execute prompt with Default HighFlow (non-streaming)
     */
    async execute(
        prompt: string,
        config: AIConfig,
        context?: ExecutionContext
    ): Promise<AIResponse> {
        // Fallback for deprecated/removed models
        if ((config.model as string) === 'gemini-2.0-flash-exp') {
            console.warn(
                '[DefaultHighFlowProvider] Model gemini-2.0-flash-exp is deprecated, falling back to gemini-1.5-flash'
            );
            config.model = 'gemini-1.5-flash';
        }

        this.validateConfig(config);

        // Check authentication
        const auth = await this.checkAuthentication();
        if (!auth.authenticated || !auth.token) {
            throw new Error(
                'Default HighFlow Provider를 사용하려면 로그인이 필요합니다. Settings에서 로그인해주세요.'
            );
        }

        const startTime = Date.now();

        return this.executeWithRetry(async () => {
            const systemPrompt = config.systemPrompt
                ? this.buildSystemPrompt(config, context)
                : undefined;

            // Build Gemini API format request
            const request: any = {
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: prompt }],
                    },
                ],
                generationConfig: {
                    temperature: config.temperature,
                    topP: config.topP,
                    maxOutputTokens: config.maxTokens || 8192,
                    stopSequences: config.stopSequences,
                },
            };

            if (systemPrompt) {
                request.systemInstruction = systemPrompt;
            }

            // Call backend proxy
            const result = await this.callBackendProxy(request, auth.token!);

            // Parse Gemini API response
            const topCandidate = result.candidates?.[0];
            const parts: any[] = topCandidate?.content?.parts || [];
            const textParts = parts.filter((part) => part.text).map((part) => part.text as string);

            const toolCalls = this.extractGeminiToolCalls(parts);
            const finishReason =
                toolCalls && toolCalls.length > 0
                    ? ('tool_calls' as const)
                    : this.mapFinishReason(topCandidate?.finishReason);

            const usage = result.usageMetadata;
            const tokensUsed = {
                prompt: usage?.promptTokenCount || this.estimateTokens(prompt),
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
                content: textParts.join('\n').trim() || '',
                tokensUsed,
                cost,
                duration: Date.now() - startTime,
                model: config.model,
                finishReason,
                metadata: {
                    candidates: result.candidates?.length || 0,
                    promptFeedback: result.promptFeedback,
                    provider: 'default-highflow',
                },
                toolCalls,
            };
        });
    }

    /**
     * Chat with Default HighFlow
     */
    async chat(
        messages: AIMessage[],
        config: AIConfig,
        _context?: ExecutionContext
    ): Promise<AIResponse> {
        // Fallback for deprecated/removed models
        if ((config.model as string) === 'gemini-2.0-flash-exp') {
            console.warn(
                '[DefaultHighFlowProvider] Model gemini-2.0-flash-exp is deprecated, falling back to gemini-1.5-flash'
            );
            config.model = 'gemini-1.5-flash';
        }

        this.validateConfig(config);

        // Check authentication
        const auth = await this.checkAuthentication();
        if (!auth.authenticated || !auth.token) {
            throw new Error(
                'Default HighFlow Provider를 사용하려면 로그인이 필요합니다. Settings에서 로그인해주세요.'
            );
        }

        const startTime = Date.now();

        return this.executeWithRetry(async () => {
            const { systemInstruction, contents } = this.buildGeminiConversation(messages, config);
            const toolDeclarations = this.mapTools(config.tools);

            // Build Gemini API format request
            const request: any = {
                contents: contents,
                generationConfig: {
                    temperature: config.temperature,
                    topP: config.topP,
                    maxOutputTokens: config.maxTokens || 8192,
                    stopSequences: config.stopSequences,
                },
            };

            if (systemInstruction) {
                request.systemInstruction = systemInstruction;
            }

            if (toolDeclarations) {
                request.tools = toolDeclarations;
            }

            // Call backend proxy
            const result = await this.callBackendProxy(request, auth.token!);

            // Parse response (same as execute)
            const topCandidate = result.candidates?.[0];
            const parts: any[] = topCandidate?.content?.parts || [];
            const textParts = parts.filter((part) => part.text).map((part) => part.text as string);

            const toolCalls = this.extractGeminiToolCalls(parts);
            const finishReason =
                toolCalls && toolCalls.length > 0
                    ? ('tool_calls' as const)
                    : this.mapFinishReason(topCandidate?.finishReason);

            const usage = result.usageMetadata;
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
                content: textParts.join('\n').trim() || '',
                tokensUsed,
                cost,
                duration: Date.now() - startTime,
                model: config.model,
                finishReason,
                metadata: {
                    candidates: result.candidates?.length || 0,
                    promptFeedback: result.promptFeedback,
                    provider: 'default-highflow',
                },
                toolCalls,
            };
        });
    }

    /**
     * Streaming is not supported for Default HighFlow
     */
    async *streamExecute(
        prompt: string,
        config: AIConfig,
        onToken: (token: string) => void,
        context?: ExecutionContext,
        signal?: AbortSignal
    ): AsyncGenerator<StreamChunk> {
        // Default HighFlow does not support real streaming yet, so we wrap the non-streaming execute
        // and yield the result as a single chunk. This allows it to work with the streaming architecture.
        try {
            // Check if aborted before execution
            if (signal?.aborted) {
                throw new Error('Request aborted');
            }

            const response = await this.execute(prompt, config, context);
            const content = response.content;

            if (content) {
                onToken(content);
                yield {
                    accumulated: content,
                    delta: content,
                    done: true,
                };
            } else {
                yield {
                    accumulated: '',
                    delta: '',
                    done: true,
                };
            }
        } catch (error) {
            console.error('[DefaultHighFlowProvider] Stream execution failed:', error);
            throw error;
        }
    }
}
