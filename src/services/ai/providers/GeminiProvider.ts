/**
 * Gemini Provider
 *
 * Google Gemini AI provider implementation
 */

import { GoogleGenAI } from '@google/genai';
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
    private readonly IMAGE_MODEL = 'gemini-3-pro-image-preview'; // Premium model with 4K support

    readonly defaultModels: ModelInfo[] = [
        {
            name: 'gemini-3-pro-image-preview',
            provider: 'google',
            contextWindow: 65536,
            maxOutputTokens: 32768,
            costPerInputToken: 5.0,
            costPerOutputToken: 15.0,
            averageLatency: 5000,
            features: ['vision', 'function_calling'],
            bestFor: [
                'High-fidelity 4K image generation',
                'Text rendering in images',
                'Complex design mockups',
                'Google Search grounding',
            ],
        },
        {
            name: 'gemini-2.5-flash-image',
            provider: 'google',
            contextWindow: 65536,
            maxOutputTokens: 32768,
            costPerInputToken: 0.1,
            costPerOutputToken: 0.4,
            averageLatency: 2000,
            features: ['vision', 'function_calling'],
            bestFor: ['Fast image generation', 'Cost-effective', '1024px resolution'],
        },
        {
            name: 'veo-3.1-generate-preview',
            provider: 'google',
            contextWindow: 0,
            maxOutputTokens: 0,
            costPerInputToken: 0, // Priced per second of video
            costPerOutputToken: 0,
            averageLatency: 15000,
            features: ['vision'],
            bestFor: ['High-fidelity video generation', '1080p video', 'Text-to-video'],
        },
        {
            name: 'veo-2.0-generate-preview',
            provider: 'google',
            contextWindow: 0,
            maxOutputTokens: 0,
            costPerInputToken: 0,
            costPerOutputToken: 0,
            averageLatency: 10000,
            features: ['vision'],
            bestFor: ['Fast video generation', '720p video'],
        },
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

    private client: GoogleGenAI | null = null;
    private injectedApiKey: string | null = null;

    /**
     * Set API key from external source (e.g., settings store via IPC)
     */
    setApiKey(apiKey: string): void {
        this.injectedApiKey = apiKey;
        this.client = null; // Reset client to use new key
    }

    /**
     * Fetch available models from Gemini API using SDK
     */
    async fetchModels(): Promise<ModelInfo[]> {
        console.log('[GeminiProvider] Fetching models from API... (Force Update)');
        try {
            // Safely access process.env or use empty string
            const envKey = typeof process !== 'undefined' ? process.env.GOOGLE_API_KEY : undefined;
            const apiKey = this.injectedApiKey || envKey;

            if (!apiKey) {
                console.warn('[GeminiProvider] No API key, using default models');
                return this.defaultModels;
            }

            // Use SDK to fetch models
            const client = new GoogleGenAI({ apiKey });
            const pager = await client.models.list();

            console.log('[GeminiProvider] Fetched models via SDK');

            // Collect models from pager
            const fetchedModels: any[] = [];
            for await (const model of pager) {
                fetchedModels.push(model);
            }

            const models: ModelInfo[] = fetchedModels
                .map((m: any) => {
                    return {
                        name: m.name.replace('models/', ''),
                        provider: 'google' as AIProvider,
                        contextWindow: m.inputTokenLimit || 32000,
                        maxOutputTokens: m.outputTokenLimit || 2048,
                        description: m.description,
                        features: ['streaming', 'function_calling'] as AIFeature[], // Default features
                        supportedActions: m.supportedGenerationMethods || [],
                        costPerInputToken: 0,
                        costPerOutputToken: 0,
                        averageLatency: 0,
                        bestFor: [],
                    };
                })
                .filter(
                    (m: any) =>
                        m.supportedActions?.includes('generateContent') ||
                        m.name?.includes('gemini')
                );

            console.log(
                '[GeminiProvider] Fetched models from API:',
                models.map((m: any) => m.name)
            );
            return models;
        } catch (error) {
            console.error('[GeminiProvider] Failed to fetch models from API:', error);
            return this.defaultModels;
        }
    }

    /**
     * Initialize Google AI client
     */
    private getClient(): GoogleGenAI {
        if (!this.client) {
            // Safely access process.env
            const envKey = typeof process !== 'undefined' ? process.env.GOOGLE_API_KEY : undefined;
            const apiKey = this.injectedApiKey || envKey;
            if (!apiKey) {
                throw new Error(
                    'GOOGLE_API_KEY not configured. Please set your API key in Settings > AI Providers.'
                );
            }
            this.client = new GoogleGenAI({ apiKey });
        }
        return this.client;
    }

    async chat(
        messages: AIMessage[],
        config: AIConfig,
        _context?: ExecutionContext,
        signal?: AbortSignal
    ): Promise<AIResponse> {
        this.validateConfig(config);

        const startTime = Date.now();
        const client = this.getClient();

        return this.executeWithRetry(async () => {
            if (signal?.aborted) {
                throw new Error('Request aborted');
            }
            const { systemInstruction, contents } = this.buildGeminiConversation(messages, config);
            const toolDeclarations = this.mapTools(config.tools);

            const result = await client.models.generateContent({
                model: config.model,
                contents: contents,
                config: {
                    temperature: config.temperature,
                    topP: config.topP,
                    maxOutputTokens: config.maxTokens || 8192,
                    stopSequences: config.stopSequences,
                    ...(systemInstruction && { systemInstruction }),
                    ...(toolDeclarations && { tools: toolDeclarations }),
                },
            });
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
                content: textParts.join('\n').trim() || result.text || '',
                tokensUsed,
                cost,
                duration: Date.now() - startTime,
                model: config.model,
                finishReason,
                metadata: {
                    candidates: result.candidates?.length || 0,
                    promptFeedback: result.promptFeedback,
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
        context?: ExecutionContext,
        signal?: AbortSignal
    ): Promise<AIResponse> {
        this.validateConfig(config);

        const startTime = Date.now();
        const client = this.getClient();

        return this.executeWithRetry(async () => {
            if (signal?.aborted) {
                throw new Error('Request aborted');
            }
            const systemPrompt = config.systemPrompt
                ? this.buildSystemPrompt(config, context)
                : undefined;
            const result = await client.models.generateContent({
                model: config.model,
                contents: prompt,
                config: {
                    temperature: config.temperature,
                    topP: config.topP,
                    maxOutputTokens: config.maxTokens || 8192,
                    stopSequences: config.stopSequences,
                    ...(systemPrompt && { systemInstruction: systemPrompt }),
                },
            });

            const duration = Date.now() - startTime;
            const estimatedPromptTokens = this.estimateTokens(prompt);
            const content = result.text || '';
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
                finishReason: this.mapFinishReason(result.candidates?.[0]?.finishReason),
                metadata: {
                    candidates: result.candidates?.length || 0,
                    promptFeedback: result.promptFeedback,
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
        context?: ExecutionContext,
        signal?: AbortSignal
    ): AsyncGenerator<StreamChunk> {
        this.validateConfig(config);

        const client = this.getClient();
        const systemPrompt = config.systemPrompt
            ? this.buildSystemPrompt(config, context)
            : undefined;

        const result = await client.models.generateContentStream({
            model: config.model,
            contents: prompt,
            config: {
                temperature: config.temperature,
                topP: config.topP,
                maxOutputTokens: config.maxTokens || 8192,
                ...(systemPrompt && { systemInstruction: systemPrompt }),
            },
        });

        let accumulated = '';

        for await (const chunk of result) {
            // Check if aborted
            if (signal?.aborted) {
                throw new Error('Request aborted');
            }

            const delta = chunk.text || '';
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
            const client = this.getClient();
            // Use gemini-3-pro-image-preview unless explicitly overridden
            const modelName =
                config.model === 'gemini-pro' || !config.model ? this.IMAGE_MODEL : config.model;

            console.log(`[GeminiProvider] Attempting image generation with model: ${modelName}`);

            // Gemini 3 Pro Image specific config
            let generationConfig: any = {
                temperature: config.temperature ?? 0.4,
            };

            if (modelName === 'gemini-3-pro-image-preview') {
                generationConfig.imageConfig = {
                    aspectRatio: options.aspectRatio || '16:9',
                    imageSize: options.imageSize || '1024x1024',
                };
            } else {
                // For older/Flash models, we rely on responseModalities
                generationConfig.responseModalities = ['IMAGE'];
            }

            // New SDK API: client.models.generateContent
            const response = await client.models.generateContent({
                model: modelName,
                contents: prompt,
                config: generationConfig,
            });

            console.log(`[GeminiProvider] API response received:`, {
                hasCandidates: !!response.candidates,
                candidateCount: response.candidates?.length,
            });

            // Log response structure for debugging
            console.log(`[GeminiProvider] Response structure:`, {
                candidates: response.candidates?.map((c: any) => ({
                    contentParts: c.content?.parts?.length,
                    hasInlineData: c.content?.parts?.some((p: any) => p.inlineData),
                })),
            });

            // Log all parts to see what we got
            const allParts = response.candidates?.flatMap((c: any) => c.content?.parts || []) || [];

            // Extract ALL inline images
            const imageParts = allParts.filter((part: any) => part.inlineData);

            if (imageParts.length === 0) {
                console.error(
                    `[GeminiProvider] No inline data in response. Full response:`,
                    JSON.stringify(response, null, 2)
                );
                throw new Error('Gemini image generation did not return any inline data.');
            }

            console.log(`[GeminiProvider] Found ${imageParts.length} images in response`);

            // Use the first image as the primary result
            const firstImage = imageParts[0].inlineData;
            const mime = firstImage.mimeType || 'image/png';
            const base64Data = firstImage.data;

            // Safety check for data
            if (!base64Data) {
                throw new Error('Image data is missing');
            }

            const dataSizeKB = Math.round((base64Data.length * 3) / 4 / 1024);

            console.log(`[GeminiProvider] Primary image:`, {
                mime,
                dataSizeKB,
                dataLength: base64Data.length,
            });

            // Warn if image is very large (>10MB)
            if (dataSizeKB > 10240) {
                console.warn(
                    `[GeminiProvider] Large image generated (${dataSizeKB}KB). May cause rendering issues.`
                );
            }

            // Save all images as files for multi-image results
            const fs = await import('fs/promises');
            const path = await import('path');
            const os = await import('os');

            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-images-'));
            const files: Array<{ path: string; type: 'created' }> = [];

            for (let i = 0; i < imageParts.length; i++) {
                const imageData = imageParts[i].inlineData;
                const imageMime = imageData.mimeType || 'image/png';
                const imageBase64 = imageData.data || '';

                if (!imageBase64) continue;

                const ext = imageMime.split('/')[1] || 'png';
                const fileName = `image_${i + 1}.${ext}`;
                const filePath = path.join(tempDir, fileName);

                // Write base64 to file
                const buffer = Buffer.from(imageBase64, 'base64');
                await fs.writeFile(filePath, buffer);

                files.push({ path: filePath, type: 'created' });
            }

            return {
                kind: 'image',
                subType: this.mapMimeToSubType(mime),
                format: 'base64',
                value: base64Data,
                mime,
                meta: {
                    provider: this.name,
                    model: modelName,
                    size: options.size,
                    quality: options.quality,
                    style: options.style,
                    dataSizeKB,
                    imageCount: imageParts.length,
                    files, // Include file paths
                },
                raw: response,
            };
        } catch (error) {
            console.error(`[GeminiProvider] Image generation error:`, error);
            throw error;
        }
    }

    async generateVideo(
        prompt: string,
        config: AIConfig,
        _context?: ExecutionContext,
        _options: Record<string, any> = {},
        signal?: AbortSignal
    ): Promise<AiResult> {
        try {
            if (signal?.aborted) {
                throw new Error('Request aborted');
            }
            const client = this.getClient();
            const modelName = config.model || 'veo-3.1-generate-preview';

            console.log(`[GeminiProvider] Attempting video generation with model: ${modelName}`);

            const response = await client.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    // Veo specific config
                },
            });

            console.log(`[GeminiProvider] Video API response received`);

            // Extract inline video data
            const allParts = response.candidates?.flatMap((c: any) => c.content?.parts || []) || [];
            const videoParts = allParts.filter(
                (part: any) => part.inlineData && part.inlineData.mimeType?.startsWith('video/')
            );

            if (videoParts.length === 0) {
                console.error(
                    `[GeminiProvider] No video inline data in response. Full response:`,
                    JSON.stringify(response, null, 2)
                );
                throw new Error('Gemini video generation did not return any inline video data.');
            }

            console.log(`[GeminiProvider] Found ${videoParts.length} videos in response`);

            const firstVideo = videoParts[0].inlineData;
            const mime = firstVideo.mimeType || 'video/mp4';
            const base64Data = firstVideo.data;

            if (!base64Data) {
                throw new Error('Video data is missing');
            }

            const dataSizeKB = Math.round((base64Data.length * 3) / 4 / 1024);

            // Save video to temp file
            const fs = await import('fs/promises');
            const path = await import('path');
            const os = await import('os');

            const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gemini-videos-'));
            const ext = mime.split('/')[1] || 'mp4';
            const fileName = `video_${Date.now()}.${ext}`;
            const filePath = path.join(tempDir, fileName);

            const buffer = Buffer.from(base64Data, 'base64');
            await fs.writeFile(filePath, buffer);

            console.log(
                `[GeminiProvider] Saved video to: ${filePath} (${Math.round(buffer.length / 1024)}KB)`
            );

            return {
                kind: 'video',
                subType: 'mp4',
                format: 'base64',
                value: base64Data,
                mime,
                meta: {
                    provider: this.name,
                    model: modelName,
                    dataSizeKB,
                    filePath,
                },
                raw: response,
            };
        } catch (error) {
            console.error(`[GeminiProvider] Video generation error:`, error);
            throw error;
        }
    }

    private mapMimeToSubType(mime: string): AiResult['subType'] {
        if (mime.includes('webp')) return 'webp';
        if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
        if (mime.includes('svg')) return 'svg';
        return 'png';
    }

    async generateText(
        messages: AIMessage[],
        config: AIConfig,
        context?: ExecutionContext,
        signal?: AbortSignal
    ): Promise<AiResult> {
        const prompt = messages.map((msg) => msg.content).join('\n');

        // Check for image generation intent
        if (this.isImageGenerationPrompt(prompt) && !config.model.includes('image-preview')) {
            console.log(
                '[GeminiProvider] Detected image generation intent, switching to image model'
            );
            try {
                return await this.generateImage(
                    prompt,
                    { ...config, model: this.IMAGE_MODEL },
                    context,
                    {},
                    signal
                );
            } catch (error) {
                console.warn(
                    '[GeminiProvider] Image generation failed, falling back to text',
                    error
                );
                // Fallback to text generation if image fails
            }
        }

        // Pass signal to execute
        const response = await this.execute(prompt, config, context, signal);
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
    protected mapFinishReason(finishReason: string | undefined): AIResponse['finishReason'] {
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

    protected buildGeminiConversation(
        messages: AIMessage[],
        _config: AIConfig
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
        const role = message.role === 'user' ? 'user' : 'model';
        let parts: any[] = [{ text: message.content }];

        // Cast message to any to access multiModalContent if it exists at runtime
        const msgAny = message as any;
        if (msgAny.multiModalContent) {
            parts = msgAny.multiModalContent.map((content: any) => {
                if (content.type === 'text') {
                    return { text: content.value };
                } else if (content.type === 'image') {
                    // Extract base64 and mime type
                    const matches = content.value.match(/^data:(image\/[a-z]+);base64,(.+)$/);
                    if (matches) {
                        return {
                            inlineData: {
                                mimeType: matches[1],
                                data: matches[2],
                            },
                        };
                    }
                }
                return { text: '' };
            });
        }

        return { role, parts };
    }

    private extractGeminiToolCalls(_parts: any[]): ToolCall[] | undefined {
        // Implement tool call extraction if needed
        // For basic text generation, this is typically not populated in the same way as OpenAI
        return undefined;
    }

    private mapTools(_tools: any[] | undefined): any[] | undefined {
        // Implement tool mapping if needed
        return undefined;
    }

    // Helper to calculate cost
    public calculateCost(tokens: { prompt: number; completion: number }, model: string): number {
        const modelInfo = this.defaultModels.find((m) => m.name === model);
        if (!modelInfo) return 0;

        // Cost in dollars
        const promptCost = (tokens.prompt / 1000000) * modelInfo.costPerInputToken;
        const completionCost = (tokens.completion / 1000000) * modelInfo.costPerOutputToken;

        return promptCost + completionCost || 0;
    }

    // Helper to estimate tokens (rough approximation)
    public estimateTokens(text: string): number {
        return Math.ceil(text.length / 4);
    }

    private isImageGenerationPrompt(prompt: string): boolean {
        const imageKeywords = [
            'generate an image',
            'create an image',
            'draw',
            'paint',
            'sketch',
            'illustration',
            'picture of',
        ];
        return imageKeywords.some((keyword) => prompt.toLowerCase().includes(keyword));
    }
}
