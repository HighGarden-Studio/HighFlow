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

    readonly models: ModelInfo[] = [
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
     * Initialize Google AI client
     */
    private getClient(): GoogleGenAI {
        if (!this.client) {
            const apiKey = this.injectedApiKey || process.env.GOOGLE_API_KEY;
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
        _context?: ExecutionContext
    ): Promise<AIResponse> {
        this.validateConfig(config);

        const startTime = Date.now();
        const client = this.getClient();

        return this.executeWithRetry(async () => {
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
        context?: ExecutionContext
    ): Promise<AIResponse> {
        this.validateConfig(config);

        const startTime = Date.now();
        const client = this.getClient();

        return this.executeWithRetry(async () => {
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
        context?: ExecutionContext
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
        options: Record<string, any> = {}
    ): Promise<AiResult> {
        try {
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
                // Note: responseModalities might not be needed for 3-pro-image if imageConfig is present,
                // but keeping it if it aids consistency, or removing if it conflicts.
                // Documentation implies tooling/imageConfig trigger image generation.
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
            console.log(`[GeminiProvider] All parts:`, {
                totalParts: allParts.length,
                parts: allParts.map((p: any, idx: number) => ({
                    index: idx,
                    hasText: !!p.text,
                    hasInlineData: !!p.inlineData,
                    inlineDataMime: p.inlineData?.mimeType,
                    textPreview: p.text ? p.text.substring(0, 100) : undefined,
                })),
            });

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
                const ext = imageMime.split('/')[1] || 'png';
                const fileName = `image_${i + 1}.${ext}`;
                const filePath = path.join(tempDir, fileName);

                // Write base64 to file
                const buffer = Buffer.from(imageData.data, 'base64');
                await fs.writeFile(filePath, buffer);

                files.push({ path: filePath, type: 'created' });
                console.log(
                    `[GeminiProvider] Saved image ${i + 1}/${imageParts.length}: ${filePath} (${Math.round(buffer.length / 1024)}KB)`
                );
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
            console.error(`[GeminiProvider] Error details:`, {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                raw: error,
            });
            throw error;
        }
    }

    async generateVideo(
        prompt: string,
        config: AIConfig,
        _context?: ExecutionContext,
        options: Record<string, any> = {}
    ): Promise<AiResult> {
        try {
            const client = this.getClient();
            const modelName = config.model || 'veo-3.1-generate-preview';

            console.log(`[GeminiProvider] Attempting video generation with model: ${modelName}`);

            // Construct prompt content
            // Veo supports text prompt directly.
            // It might also support 'videoConfig' in generation config if needed in future.

            const response = await client.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    // Veo specific config can go here if documentation specifics arise.
                    // For now, simple text prompt is the baseline.
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
        context?: ExecutionContext
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
                    context
                );
            } catch (error) {
                console.warn(
                    '[GeminiProvider] Image generation failed, falling back to text',
                    error
                );
                // Fallback to text generation if image fails
            }
        }

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

    private isImageGenerationPrompt(prompt: string): boolean {
        const lower = prompt.toLowerCase();
        const keywords = [
            'generate an image',
            'create an image',
            'draw a',
            'paint a',
            'make a picture',
            'generate a picture',
            'create a picture',
            'sketch of',
            'illustration of',
        ];
        return keywords.some((k) => lower.includes(k));
    }
}
