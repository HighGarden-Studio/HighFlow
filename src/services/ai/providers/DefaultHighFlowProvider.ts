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
    AiResult,
    ToolCall,
} from '@core/types/ai';

import { BACKEND_URL } from '../../../config';
import type { ModelInfo } from '@core/types/ai';

export class DefaultHighFlowProvider extends GeminiProvider {
    readonly name: AIProvider = 'default-highflow';

    /**
     * Vertex AI supported Gemini models
     * Now strictly dynamic - fetched from API or DB.
     * No hardcoded defaults to prevent stale data.
     */
    readonly defaultModels: ModelInfo[] = [];

    /**
     * Fetch models from HighFlow server API
     */
    async fetchModels(): Promise<ModelInfo[]> {
        console.log('[DefaultHighFlowProvider] Fetching models from HighFlow server...');

        try {
            // Get backend URL
            let apiUrl = BACKEND_URL;
            try {
                const { config } = await import('../../../../electron/main/config');
                apiUrl = config.BACKEND_URL;
            } catch (e) {
                // Fallback to static config
            }

            // Check authentication
            const auth = await this.checkAuthentication();
            if (!auth.authenticated || !auth.token) {
                console.warn('[DefaultHighFlowProvider] No authentication, loading from DB cache');
                const { providerModelsRepository } =
                    await import('../../../../electron/main/database/repositories/provider-models-repository');
                const cachedModels = await providerModelsRepository.getModels('default-highflow');
                return cachedModels;
            }

            // Call HighFlow server API
            console.log(`[DefaultHighFlowProvider] Calling ${apiUrl}/v1/ai/models...`);
            const response = await fetch(`${apiUrl}/v1/ai/models`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${auth.token}`,
                },
            });

            if (!response.ok) {
                throw new Error(
                    `Failed to fetch models: ${response.status} ${response.statusText}`
                );
            }

            const data = await response.json();
            const apiModels = data.models || [];

            console.log(`[DefaultHighFlowProvider] Fetched ${apiModels.length} models from server`);

            // Transform API response to ModelInfo format
            const models: ModelInfo[] = apiModels.map((model: any) => ({
                name: model.name?.replace('models/', '') || model.name,
                provider: 'default-highflow',
                displayName: model.displayName || model.name,
                description: model.description,
                contextWindow: model.inputTokenLimit || 0,
                maxOutputTokens: model.maxOutputTokens || 0,
                costPerInputToken: 0, // Will be calculated by backend
                costPerOutputToken: 0, // Will be calculated by backend
                averageLatency: 1000,
                features: model.supportedGenerationMethods?.includes('streamGenerateContent')
                    ? ['streaming', 'function_calling', 'vision', 'system_prompt']
                    : ['vision'], // Assume non-streaming are image/video
                bestFor: [],
                supportedActions: model.supportedGenerationMethods || [],
            }));

            console.log(
                `[DefaultHighFlowProvider] Total models available from API: ${models.length}`,
                models.map((m) => m.name)
            );

            // Save to DB cache
            try {
                const { providerModelsRepository } =
                    await import('../../../../electron/main/database/repositories/provider-models-repository');
                await providerModelsRepository.saveModels('default-highflow', models);
                console.log('[DefaultHighFlowProvider] Saved models to DB cache');
            } catch (saveError) {
                console.error('[DefaultHighFlowProvider] Failed to save models to DB:', saveError);
            }

            return models;
        } catch (error) {
            console.error('[DefaultHighFlowProvider] Failed to fetch models from server:', error);

            // Fallback to DB cache
            console.warn('[DefaultHighFlowProvider] Using cached models due to error');
            const { providerModelsRepository } =
                await import('../../../../electron/main/database/repositories/provider-models-repository');
            const cachedModels = await providerModelsRepository.getModels('default-highflow');

            return cachedModels;
        }
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
            // console.log(
            //    `[DefaultHighFlowProvider] checkAuthentication called. Token exists: ${!!token}, Length: ${token?.length}`
            // );

            if (!token) {
                // console.warn('[DefaultHighFlowProvider] No session token found');
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
     * Check if provider is ready (authenticated)
     */
    async isReady(): Promise<boolean> {
        const auth = await this.checkAuthentication();
        // console.log(
        //    `[DefaultHighFlowProvider] isReady called. Authenticated: ${auth.authenticated}`
        // );
        return auth.authenticated;
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
                    // Send Toast Notification (Main Process -> Renderer)
                    try {
                        const { BrowserWindow } = await import('electron');
                        const wins = BrowserWindow.getAllWindows();
                        if (wins.length > 0 && wins[0]) {
                            wins[0].webContents.send('app:notification', {
                                type: 'error',
                                message: 'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.',
                                duration: 5000,
                            });
                        }
                    } catch (e) {
                        console.error('[DefaultHighFlowProvider] Failed to send notification:', e);
                    }

                    const error: any = new Error(
                        'API 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.'
                    );
                    error.status = 429;
                    throw error;
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
     * Override shouldNotRetry to fail immediately on 429
     */
    protected shouldNotRetry(error: any): boolean {
        // Check for 429 status or message
        if (
            error.status === 429 ||
            error.statusCode === 429 ||
            error.message?.includes('429') ||
            error.message?.includes('API 요청 한도를 초과했습니다')
        ) {
            return true;
        }
        return super.shouldNotRetry(error);
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
                '[DefaultHighFlowProvider] Model gemini-2.0-flash-exp is deprecated, falling back to gemini-2.5-flash'
            );
            config.model = 'gemini-2.5-flash';
        }

        await this.validateConfig(config);

        // Check authentication
        const auth = await this.checkAuthentication();
        if (!auth.authenticated || !auth.token) {
            throw new Error(
                'Default HighFlow Provider를 사용하려면 로그인이 필요합니다. Settings에서 로그인해주세요.'
            );
        }

        const startTime = Date.now();

        return this.executeWithRetry(async () => {
            // Sanitize tools in config for System Prompt consistency
            // Sanitize tools in config for System Prompt consistency
            const sanitizedConfig = { ...config };
            const toolNameReplacements = new Map<string, string>();

            if (config.tools) {
                sanitizedConfig.tools = config.tools.map((t: any) => {
                    const sanitizedName = t.name.replace(/-/g, '_');
                    toolNameReplacements.set(t.name, sanitizedName);
                    return {
                        ...t,
                        name: sanitizedName,
                    };
                });
            }

            let systemPrompt = config.systemPrompt
                ? this.buildSystemPrompt(sanitizedConfig, context)
                : undefined;

            // Sanitize system prompt text if it exists
            if (systemPrompt) {
                for (const [original, sanitized] of toolNameReplacements) {
                    systemPrompt = systemPrompt.split(original).join(sanitized);
                }
            }

            const toolDeclarations = this.mapTools(sanitizedConfig.tools);

            // Prepare content parts (Text + Attachments)
            const requestParts: any[] = [{ text: prompt }];

            // Handle Context Attachments (e.g. from LocalFileProvider)
            if (context?.metadata?.attachments && Array.isArray(context.metadata.attachments)) {
                const attachments = context.metadata.attachments;
                console.log(
                    `[DefaultHighFlowProvider] Found ${attachments.length} attachments in context`
                );

                for (const att of attachments) {
                    // Handle Image Attachments
                    if (att.type === 'image' && att.data) {
                        let base64Data = att.data;
                        if (typeof base64Data === 'string') {
                            // Strip prefix if present
                            if (base64Data.startsWith('data:')) {
                                base64Data = base64Data.split(',')[1];
                            }

                            requestParts.push({
                                inlineData: {
                                    mimeType: att.mime || 'image/png',
                                    data: base64Data,
                                },
                            });
                            console.log(`[DefaultHighFlowProvider] Attached image: ${att.name}`);
                        }
                    }
                    // Handle Text File Attachments (bypass truncation)
                    else if (att.type === 'file' && att.value && typeof att.value === 'string') {
                        const isText =
                            att.mime?.startsWith('text/') ||
                            att.mime === 'application/json' ||
                            att.mime === 'application/javascript' ||
                            att.mime?.includes('xml');

                        if (isText) {
                            requestParts.push({
                                text: `\n\n--- File: ${att.name} ---\n${att.value}\n--- End of File ---\n`,
                            });
                            console.log(
                                `[DefaultHighFlowProvider] Attached text file: ${att.name} (${att.value.length} chars)`
                            );
                        }
                    }
                }
            }

            // Build Gemini API format request
            const request: any = {
                contents: [
                    {
                        role: 'user',
                        parts: requestParts,
                    },
                ],
                generationConfig: {
                    temperature: config.temperature,
                    topP: config.topP,
                    maxOutputTokens: config.maxTokens || 8192,
                    stopSequences: config.stopSequences,
                },
                model: config.model,
            };

            if (systemPrompt) {
                request.systemInstruction = systemPrompt;
            }

            if (toolDeclarations) {
                // Transform to snake_case for REST API and sanitize names
                const sanitizedTools = toolDeclarations.map((td: any) => {
                    if (td.functionDeclarations) {
                        return {
                            function_declarations: td.functionDeclarations.map((fd: any) => ({
                                ...fd,
                                name: fd.name.replace(/-/g, '_'),
                            })),
                        };
                    }
                    return td;
                });
                request.tools = sanitizedTools;

                // When tools are present, we should set mode to ANY to force usage if applicable
                if (config.tools && config.tools.length > 0) {
                    request.tool_config = {
                        function_calling_config: {
                            mode: 'ANY',
                        },
                    };
                }
            }

            // Call backend proxy
            if (config.tools && config.tools.length > 0) {
                console.log('[DefaultHighFlowProvider] Sending request with tools:', {
                    toolCount: toolDeclarations?.length,
                    toolConfig: request.tool_config,
                    firstTool: request.tools?.[0]?.function_declarations?.[0]?.name,
                });
            }

            const result = await this.callBackendProxy(request, auth.token!);

            // Parse Gemini API response
            const topCandidate = result.candidates?.[0];
            const parts: any[] = topCandidate?.content?.parts || [];
            const textParts = parts.filter((part) => part.text).map((part) => part.text as string);

            const toolCalls = this.extractGeminiToolCalls(parts);

            // Restore original tool names
            if (toolCalls) {
                const toolNameMap = new Map<string, string>();
                if (toolDeclarations) {
                    toolDeclarations.forEach((td: any) => {
                        td.functionDeclarations?.forEach((fd: any) => {
                            toolNameMap.set(fd.name.replace(/-/g, '_'), fd.name);
                        });
                    });
                }

                toolCalls.forEach((tc) => {
                    if (tc.name) {
                        const originalName = toolNameMap.get(tc.name);
                        if (originalName) {
                            tc.name = originalName;
                        }
                    }
                });
            }
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
        context?: ExecutionContext
    ): Promise<AIResponse> {
        // Fallback for deprecated/removed models
        if ((config.model as string) === 'gemini-2.0-flash-exp') {
            console.warn(
                '[DefaultHighFlowProvider] Model gemini-2.0-flash-exp is deprecated, falling back to gemini-2.5-flash'
            );
            config.model = 'gemini-2.5-flash';
        }

        await this.validateConfig(config);

        // Check authentication
        const auth = await this.checkAuthentication();
        if (!auth.authenticated || !auth.token) {
            throw new Error(
                'Default HighFlow Provider를 사용하려면 로그인이 필요합니다. Settings에서 로그인해주세요.'
            );
        }

        const startTime = Date.now();

        return this.executeWithRetry(async () => {
            // Sanitize tools in config for System Prompt consistency
            // We need to ensure the System Prompt descriptions match the sanitized names we send to the API.
            // Sanitize tools in config for System Prompt consistency
            // We need to ensure the System Prompt descriptions match the sanitized names we send to the API.
            const sanitizedConfig = { ...config };
            const toolNameReplacements = new Map<string, string>();

            if (config.tools) {
                sanitizedConfig.tools = config.tools.map((t: any) => {
                    const sanitizedName = t.name.replace(/-/g, '_');
                    toolNameReplacements.set(t.name, sanitizedName);
                    return {
                        ...t,
                        name: sanitizedName,
                    };
                });
            }

            // Also sanitize the system prompt within messages to ensure it references the sanitized tool names
            const sanitizedMessages = messages.map((msg) => {
                if (msg.role === 'system') {
                    let content = msg.content;
                    // Replace all known tool names in the system prompt
                    for (const [original, sanitized] of toolNameReplacements) {
                        // Use global replacement
                        content = content.split(original).join(sanitized);
                    }
                    return { ...msg, content };
                }
                return msg;
            });

            // Build additional system prompt from context (Date, MCP, Skills)
            let additionalSystemPrompt = this.buildSystemPrompt(sanitizedConfig, context);

            // Sanitize additional prompt
            if (additionalSystemPrompt) {
                for (const [original, sanitized] of toolNameReplacements) {
                    additionalSystemPrompt = additionalSystemPrompt.split(original).join(sanitized);
                }
            }

            const { systemInstruction: msgSystemInstruction, contents } =
                this.buildGeminiConversation(sanitizedMessages, sanitizedConfig);

            // Handle Context Attachments (e.g. from LocalFileProvider in Chat)
            if (context?.metadata?.attachments && Array.isArray(context.metadata.attachments)) {
                const attachments = context.metadata.attachments;
                console.log(
                    `[DefaultHighFlowProvider] Found ${attachments.length} attachments in chat context`
                );

                // Find or create a user message to attach to
                // We prefer attaching to the LAST user message to keep it relevant to the current turn
                let targetMessage = contents
                    .slice()
                    .reverse()
                    .find((c) => c.role === 'user');

                if (!targetMessage) {
                    // No user message found? Create one at the start (contextual data)
                    // Note: This might be rare in chat, but possible if only system prompts exist
                    targetMessage = { role: 'user', parts: [] };
                    contents.push(targetMessage);
                }

                for (const att of attachments) {
                    // Handle Image Attachments
                    if (att.type === 'image' && att.data) {
                        let base64Data = att.data;
                        if (typeof base64Data === 'string') {
                            if (base64Data.startsWith('data:')) {
                                base64Data = base64Data.split(',')[1];
                            }

                            targetMessage.parts.push({
                                inlineData: {
                                    mimeType: att.mime || 'image/png',
                                    data: base64Data,
                                },
                            });
                        }
                    }
                    // Handle Text File Attachments
                    else if (att.type === 'file' && att.value && typeof att.value === 'string') {
                        const isText =
                            att.mime?.startsWith('text/') ||
                            att.mime === 'application/json' ||
                            att.mime === 'application/javascript' ||
                            att.mime?.includes('xml');

                        if (isText) {
                            targetMessage.parts.push({
                                text: `\n\n--- File: ${att.name} ---\n${att.value}\n--- End of File ---\n`,
                            });
                        }
                    }
                }
            }

            // Merge system instructions
            const systemInstruction = [additionalSystemPrompt, msgSystemInstruction]
                .filter(Boolean)
                .join('\n\n');
            const toolDeclarations = this.mapTools(sanitizedConfig.tools);

            // Build Gemini API format request
            const request: any = {
                contents: contents,
                generationConfig: {
                    temperature: config.temperature,
                    topP: config.topP,
                    maxOutputTokens: config.maxTokens || 8192,
                    stopSequences: config.stopSequences,
                },
                model: config.model,
            };

            if (systemInstruction) {
                request.systemInstruction = systemInstruction;
            }

            if (toolDeclarations) {
                // Transform to snake_case for REST API and sanitize names
                const sanitizedTools = toolDeclarations.map((td: any) => {
                    if (td.functionDeclarations) {
                        return {
                            function_declarations: td.functionDeclarations.map((fd: any) => ({
                                ...fd,
                                name: fd.name.replace(/-/g, '_'),
                            })),
                        };
                    }
                    return td;
                });
                request.tools = sanitizedTools;

                // Create reverse mapping for restoring tool names
                const toolNameMap = new Map<string, string>();
                toolDeclarations.forEach((td: any) => {
                    td.functionDeclarations?.forEach((fd: any) => {
                        toolNameMap.set(fd.name.replace(/-/g, '_'), fd.name);
                    });
                });

                // When tools are present, we should set mode to ANY to force usage if applicable
                if (config.tools && config.tools.length > 0) {
                    request.tool_config = {
                        function_calling_config: {
                            mode: 'ANY',
                        },
                    };
                }
            }

            // Call backend proxy
            const result = await this.callBackendProxy(request, auth.token!);

            // Parse response (same as execute)
            const topCandidate = result.candidates?.[0];
            const parts: any[] = topCandidate?.content?.parts || [];
            const textParts = parts.filter((part) => part.text).map((part) => part.text as string);

            const toolCalls = this.extractGeminiToolCalls(parts);

            // Restore original tool names
            if (toolCalls) {
                const toolNameMap = new Map<string, string>();
                if (toolDeclarations) {
                    toolDeclarations.forEach((td: any) => {
                        td.functionDeclarations?.forEach((fd: any) => {
                            toolNameMap.set(fd.name.replace(/-/g, '_'), fd.name);
                        });
                    });
                }

                toolCalls.forEach((tc) => {
                    if (tc.name) {
                        const originalName = toolNameMap.get(tc.name);
                        if (originalName) {
                            tc.name = originalName;
                        }
                    }
                });
            }
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
        input: string | AIMessage[],
        config: AIConfig,
        onToken: (token: string) => void,
        context?: ExecutionContext,
        signal?: AbortSignal
    ): AsyncGenerator<StreamChunk> {
        const prompt = this.getPromptText(input);
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

    /**
     * Generate Image using Default HighFlow (Proxy)
     */
    async generateImage(
        prompt: string,
        config: AIConfig,
        _context?: ExecutionContext,
        options: Record<string, any> = {},
        signal?: AbortSignal
    ): Promise<AiResult> {
        try {
            if (signal?.aborted) {
                throw new Error('Request aborted');
            }

            // Check authentication
            const auth = await this.checkAuthentication();
            if (!auth.authenticated || !auth.token) {
                throw new Error(
                    'Default HighFlow Provider를 사용하려면 로그인이 필요합니다. Settings에서 로그인해주세요.'
                );
            }

            const modelName = config.model || 'gemini-2.5-flash-image';
            console.log(
                `[DefaultHighFlowProvider] Attempting image generation with model: ${modelName}`
            );

            // Prepare generation config (similar to GeminiProvider)
            const generationConfig: any = {
                temperature: config.temperature,
                maxOutputTokens: config.maxTokens || 2048,
            };

            // Model specific settings
            if (modelName.includes('imagen')) {
                generationConfig.sampleCount = options.sampleCount || 1;
                generationConfig.aspectRatio = options.aspectRatio;
            } else if (modelName.includes('gemini-3')) {
                // Gemini 3 specific config for image generation
                generationConfig.responseModalities = ['IMAGE'];
                generationConfig['response_modalities'] = ['IMAGE']; // Snake case for REST API compatibility
                if (options.aspectRatio) {
                    // Note: Gemini 3 might handle aspect ratio differently in prompt or config
                    // For now, we rely on prompt or default behavior
                }
            } else if (modelName.includes('gemini-2.5-flash-preview-image-generation')) {
                generationConfig.imageGenerationConfig = {
                    numberOfImages: options.sampleCount || 1,
                    aspectRatio: options.aspectRatio || '1:1',
                    imageSize: options.imageSize || '1024x1024',
                };
            } else {
                // Fallback
                generationConfig.responseModalities = ['IMAGE'];
            }

            // Build request for backend proxy
            // If using a multimodal model for image generation (like Gemini 2.0/3.0),
            // it is safer to explicitly prompt for image generation in text
            const explicitPrompt =
                modelName.includes('gemini') && !prompt.toLowerCase().includes('generate')
                    ? `Generate an image of: ${prompt}`
                    : prompt;

            const contentParts: any[] = [{ text: explicitPrompt }];

            // Add input images if present (for Image-to-Image)
            if (
                options.inputImages &&
                Array.isArray(options.inputImages) &&
                options.inputImages.length > 0
            ) {
                console.log(
                    `[DefaultHighFlowProvider] Including ${options.inputImages.length} input images in request`
                );
                for (const img of options.inputImages) {
                    contentParts.push({
                        inlineData: {
                            mimeType: img.mimeType,
                            data: img.data,
                        },
                    });
                }
            }

            const request: any = {
                contents: [
                    {
                        role: 'user',
                        parts: contentParts,
                    },
                ],
                generationConfig,
                model: modelName,
            };

            // Call backend
            const result = await this.callBackendProxy(request, auth.token);

            console.log('[DefaultHighFlowProvider] Image API response received');

            // Extract ALL inline images (logic from GeminiProvider)
            const allParts = result.candidates?.flatMap((c: any) => c.content?.parts || []) || [];
            const imageParts = allParts.filter((part: any) => part.inlineData);

            if (imageParts.length === 0) {
                console.error(
                    `[DefaultHighFlowProvider] No inline data in response. Full response:`,
                    JSON.stringify(result, null, 2)
                );
                throw new Error('HighFlow image generation did not return any inline data.');
            }

            console.log(`[DefaultHighFlowProvider] Found ${imageParts.length} images in response`);

            // Use the first image as the primary result
            const firstImage = imageParts[0].inlineData;
            const mime = firstImage.mimeType || 'image/png';
            const base64Data = firstImage.data;

            if (!base64Data) {
                throw new Error('Image data is missing');
            }

            const dataSizeKB = Math.round((base64Data.length * 3) / 4 / 1024);

            // Save images to temp files
            const fs = await import('fs/promises');
            const path = await import('path');
            const os = await import('os');

            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'highflow-images-'));
            const files: Array<{ path: string; type: 'created' }> = [];

            for (let i = 0; i < imageParts.length; i++) {
                const imageData = imageParts[i].inlineData;
                const imageMime = imageData.mimeType || 'image/png';
                const imageBase64 = imageData.data || '';

                if (!imageBase64) continue;

                const ext = imageMime.split('/')[1] || 'png';
                const fileName = `image_${i + 1}.${ext}`;
                const filePath = path.join(tempDir, fileName);

                const buffer = Buffer.from(imageBase64, 'base64');
                await fs.writeFile(filePath, buffer);

                files.push({ path: filePath, type: 'created' });
            }

            return {
                kind: 'image',
                subType: mime.includes('png') ? 'png' : 'jpeg',
                format: 'base64',
                value: base64Data,
                mime,
                meta: {
                    provider: this.name,
                    model: modelName,
                    dataSizeKB,
                    imageCount: imageParts.length,
                    files,
                },
                raw: result,
            };
        } catch (error) {
            console.error('[DefaultHighFlowProvider] Image generation error:', error);
            throw error;
        }
    }

    /**
     * Override tool call extraction to support "tool_code" markdown blocks
     * This is a fallback for when the HighFlow model outputs a code block instead of native tool calls
     */
    protected extractGeminiToolCalls(parts: any[]): ToolCall[] | undefined {
        const calls: ToolCall[] = [];

        for (const part of parts) {
            // 1. Native Function Calls
            if (part.functionCall) {
                calls.push({
                    id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    name: part.functionCall.name,
                    arguments: part.functionCall.args || {},
                });
            }

            // 2. Fallback: Parse "tool_code" blocks from text
            // Format: ```tool_code \n function_name(arg="value", arg2="value") \n ```
            if (part.text) {
                const toolCodeRegex = /```tool_code\s+([a-zA-Z0-9_]+)\(([\s\S]*?)\)\s*```/g;
                let match;
                while ((match = toolCodeRegex.exec(part.text)) !== null) {
                    const toolName = match[1];
                    const argsString = match[2];

                    if (!toolName || !argsString) continue;

                    const args: Record<string, any> = {};

                    // Parse arguments: currently supports key="value" format
                    // e.g. query="space:AD...", site="https://..."
                    const argRegex = /([a-zA-Z0-9_]+)="([^"]*)"/g;
                    let argMatch;
                    while ((argMatch = argRegex.exec(argsString)) !== null) {
                        const key = argMatch[1];
                        const value = argMatch[2];
                        if (key && value !== undefined) {
                            args[key] = value;
                        }
                    }

                    // Also try to match simple numbers or booleans: key=123 or key=true
                    const primitiveRegex = /([a-zA-Z0-9_]+)=([0-9]+|true|false)(?=[,\s]|$)/g;
                    while ((argMatch = primitiveRegex.exec(argsString)) !== null) {
                        const key = argMatch[1];
                        const value = argMatch[2];
                        if (key && value && !args[key]) {
                            // Don't overwrite if parsed as string
                            if (value === 'true') args[key] = true;
                            else if (value === 'false') args[key] = false;
                            else args[key] = Number(value);
                        }
                    }

                    console.log(
                        `[DefaultHighFlowProvider] Extracted tool call from text markdown: ${toolName}`,
                        args
                    );

                    calls.push({
                        id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        name: toolName,
                        arguments: args,
                    });
                }
            }
        }

        return calls.length > 0 ? calls : undefined;
    }
}
