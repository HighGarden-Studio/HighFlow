/**
 * AI Client Service
 *
 * Browser-compatible AI client that uses stored API keys from settings
 * and makes API calls directly from the renderer process.
 */

import { useSettingsStore } from '../../renderer/stores/settingsStore';

// ========================================
// Types
// ========================================

export interface AIMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface AICompletionOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
    stream?: boolean;
}

export interface AICompletionResponse {
    content: string;
    model: string;
    provider?: AIProviderType;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    finishReason?: string;
}

export type AIProviderType =
    | 'openai'
    | 'anthropic'
    | 'google'
    | 'azure-openai'
    | 'mistral'
    | 'cohere'
    | 'groq'
    | 'perplexity'
    | 'together'
    | 'fireworks'
    | 'deepseek'
    | 'ollama'
    | 'lmstudio'
    | 'openrouter'
    | 'huggingface'
    | 'replicate'
    | 'zhipu'
    | 'moonshot'
    | 'qwen'
    | 'baidu';

// ========================================
// Model Performance Rankings
// ========================================

/**
 * Model performance scores based on benchmark results and capabilities
 * Higher score = better performance
 * Scores are based on: reasoning, coding, analysis, and general capabilities
 */
export const MODEL_PERFORMANCE_SCORES: Record<string, number> = {
    // Tier 1: Top performers (90-100)
    'claude-3-5-sonnet-20241022': 98,
    'claude-3-5-sonnet-latest': 98,
    'claude-sonnet-4-20250514': 97,
    'claude-3-opus-20240229': 96,
    'gpt-4o': 95,
    'gpt-4o-2024-11-20': 95,
    'gpt-4-turbo': 94,
    'gpt-4-turbo-preview': 94,
    'o1-preview': 99,
    'o1-mini': 93,
    'gemini-2.5-pro': 95,
    'gemini-2.0-pro-exp': 94,

    // Tier 2: High performers (80-89)
    'claude-3-5-haiku-20241022': 88,
    'claude-3-haiku-20240307': 85,
    'gpt-4o-mini': 87,
    'gpt-4': 86,
    'gemini-2.5-flash': 86,
    'gemini-2.0-flash': 85,
    'deepseek-chat': 83,
    'deepseek-coder': 85,

    // Legacy mapping (to be removed)
    'gemini-1.5-pro': 92,
    'gemini-1.5-flash': 84,

    // Tier 3: Mid performers (70-79)
    'mistral-large-latest': 79,
    'mistral-large': 79,
    'mixtral-8x7b-32768': 77,
    'llama-3.1-70b-versatile': 78,
    'llama-3.1-405b': 82,
    'qwen-max': 76,
    'qwen-plus': 74,
    'moonshot-v1-128k': 75,
    'glm-4': 74,
    'command-r-plus': 76,

    // Tier 4: Standard performers (60-69)
    'mistral-medium-latest': 68,
    'mistral-small-latest': 65,
    'llama-3.1-8b-instant': 66,
    'gemma-7b-it': 62,
    'command-r': 64,
    'qwen-turbo': 63,
    'ernie-4.0': 67,

    // Tier 5: Local/lightweight models (50-59)
    llama3: 58,
    'llama3:8b': 56,
    'llama3:70b': 68,
    codellama: 55,
    mistral: 54,
    mixtral: 60,
    phi3: 52,
    gemma: 50,
};

/**
 * Default performance scores for providers (used when specific model is unknown)
 * Based on their flagship model capabilities
 */
export const PROVIDER_DEFAULT_SCORES: Record<AIProviderType, number> = {
    anthropic: 98, // Claude 3.5 Sonnet
    openai: 95, // GPT-4o
    google: 95, // Gemini 2.5 Pro
    'azure-openai': 94, // GPT-4 Turbo
    deepseek: 83, // DeepSeek Chat
    mistral: 79, // Mistral Large
    groq: 78, // Fast inference, Llama 3.1 70B
    cohere: 76, // Command R Plus
    perplexity: 75, // Search-augmented
    together: 78, // Various high-quality models
    fireworks: 76, // Fast inference
    openrouter: 85, // Can access top models
    qwen: 76, // Qwen Max
    moonshot: 75, // Moonshot
    zhipu: 74, // GLM-4
    baidu: 67, // ERNIE
    huggingface: 60, // Variable quality
    replicate: 60, // Variable quality
    ollama: 58, // Local models
    lmstudio: 58, // Local models
};

// ========================================
// AI Client Class
// ========================================

class AIClient {
    private getApiKey(provider: AIProviderType): string | null {
        // First try to get from Pinia store
        try {
            const settingsStore = useSettingsStore();
            const providerConfig = settingsStore.aiProviders.find((p) => p.id === provider);
            if (providerConfig?.apiKey) {
                const key = providerConfig.apiKey;
                return key;
            }
        } catch (e) {
            // Silently fail if Pinia not available, fall back to localStorage
        }

        // Fallback to localStorage directly
        try {
            const stored = localStorage.getItem('workflow_settings_aiProviders');
            if (stored) {
                const providers = JSON.parse(stored);
                const providerConfig = providers.find((p: any) => p.id === provider);
                if (providerConfig?.apiKey) {
                    const key = providerConfig.apiKey;
                    return key;
                }
            }
        } catch (e) {
            console.error(`[AIClient] Failed to get API key from localStorage`, e);
        }

        console.warn(`[AIClient] No API key found for ${provider}`);
        return null;
    }

    private getDefaultModel(provider: AIProviderType): string {
        const models: Partial<Record<AIProviderType, string>> = {
            anthropic: 'claude-3-5-sonnet-20241022',
            openai: 'gpt-4o-mini',
            google: 'gemini-2.5-pro',
        };
        return models[provider] || 'gpt-4o-mini';
    }

    private readonly openAIModelLimits: { name: string; limit: number }[] = [
        { name: 'gpt-4o', limit: 16000 },
        { name: 'gpt-4o-mini', limit: 8000 },
        { name: 'gpt-4-turbo-preview', limit: 4096 },
        { name: 'gpt-4-turbo', limit: 4096 },
        { name: 'gpt-4', limit: 2048 },
        { name: 'gpt-3.5-turbo', limit: 2048 },
    ];

    private getOpenAIModelLimit(model: string): number {
        const match = this.openAIModelLimits.find((entry) => model.startsWith(entry.name));
        return match?.limit ?? 4096;
    }

    private findOpenAIModelForTokens(
        requestedTokens: number
    ): { name: string; limit: number } | null {
        return (
            this.openAIModelLimits.find((entry) => requestedTokens <= entry.limit) ??
            this.openAIModelLimits[this.openAIModelLimits.length - 1] ??
            null
        );
    }

    /**
     * Check if a provider is configured with an API key
     */
    isProviderConfigured(provider: AIProviderType): boolean {
        try {
            const settingsStore = useSettingsStore();
            const providerConfig = settingsStore.aiProviders.find((p) => p.id === provider);

            // Provider must be enabled AND have either API key or be a local provider
            if (!providerConfig?.enabled) return false;

            // Local providers (Ollama, LM Studio) don't need API key
            if (provider === 'ollama' || provider === 'lmstudio') {
                return !!providerConfig.baseUrl;
            }

            const apiKey = this.getApiKey(provider);
            return !!apiKey && apiKey.length > 10;
        } catch {
            return false;
        }
    }

    /**
     * Get model performance score for a provider
     * Uses the configured model's score or falls back to provider default score
     */
    getProviderPerformanceScore(provider: AIProviderType): number {
        try {
            const config = this.getProviderConfig(provider);
            const model = config?.defaultModel;

            // If we have a specific model configured, use its score
            if (model && MODEL_PERFORMANCE_SCORES[model]) {
                return MODEL_PERFORMANCE_SCORES[model];
            }

            // Fall back to provider default score
            return PROVIDER_DEFAULT_SCORES[provider] || 50;
        } catch {
            return PROVIDER_DEFAULT_SCORES[provider] || 50;
        }
    }

    /**
     * Get the first available provider (highest performance score)
     */
    getAvailableProvider(): AIProviderType | null {
        const configuredProviders = this.getConfiguredProviders();
        return configuredProviders[0] ?? null;
    }

    /**
     * Send a chat completion request to Anthropic
     */
    async anthropicCompletion(
        messages: AIMessage[],
        options: AICompletionOptions = {}
    ): Promise<AICompletionResponse> {
        const apiKey = this.getApiKey('anthropic');
        if (!apiKey) {
            throw new Error('Anthropic API key not configured. Please set it in Settings.');
        }

        const model = options.model || this.getDefaultModel('anthropic');
        const systemMessage = messages.find((m) => m.role === 'system');
        const userMessages = messages.filter((m) => m.role !== 'system');

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model,
                max_tokens: options.maxTokens || 4096,
                temperature: options.temperature ?? 0.7,
                system: options.systemPrompt || systemMessage?.content,
                messages: userMessages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
            }),
        });

        if (!response.ok) {
            const error = await response
                .json()
                .catch(() => ({ error: { message: response.statusText } }));
            throw new Error(`Anthropic API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json();

        return {
            content: data.content[0]?.text || '',
            model: data.model,
            usage: {
                promptTokens: data.usage?.input_tokens || 0,
                completionTokens: data.usage?.output_tokens || 0,
                totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
            },
            finishReason: data.stop_reason,
        };
    }

    /**
     * Send a chat completion request to OpenAI
     */
    async openaiCompletion(
        messages: AIMessage[],
        options: AICompletionOptions = {}
    ): Promise<AICompletionResponse> {
        const apiKey = this.getApiKey('openai');
        if (!apiKey) {
            throw new Error('OpenAI API key not configured. Please set it in Settings.');
        }

        let model = options.model || this.getDefaultModel('openai');
        const requestedTokens = options.maxTokens ?? 4096;
        let maxTokens = requestedTokens;
        const currentLimit = this.getOpenAIModelLimit(model);

        if (!options.model && requestedTokens > currentLimit) {
            const upgraded = this.findOpenAIModelForTokens(requestedTokens);
            if (upgraded && upgraded.name !== model) {
                console.info(
                    `[AIClient] Upgrading OpenAI model from ${model} to ${upgraded.name} to satisfy maxTokens=${requestedTokens}`
                );
                model = upgraded.name;
                maxTokens = Math.min(requestedTokens, upgraded.limit);
            } else {
                console.warn(
                    `[AIClient] Requested maxTokens ${requestedTokens} exceeds limit ${currentLimit} for model ${model}. Clamping to ${currentLimit}`
                );
                maxTokens = currentLimit;
            }
        } else {
            maxTokens = Math.min(requestedTokens, currentLimit);
            if (requestedTokens > currentLimit) {
                console.warn(
                    `[AIClient] Requested maxTokens ${requestedTokens} exceeds limit ${currentLimit} for model ${model}. Clamping to ${currentLimit}`
                );
            }
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                max_tokens: maxTokens,
                temperature: options.temperature ?? 0.7,
                messages: messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
            }),
        });

        if (!response.ok) {
            const error = await response
                .json()
                .catch(() => ({ error: { message: response.statusText } }));
            throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json();

        return {
            content: data.choices[0]?.message?.content || '',
            model: data.model,
            usage: {
                promptTokens: data.usage?.prompt_tokens || 0,
                completionTokens: data.usage?.completion_tokens || 0,
                totalTokens: data.usage?.total_tokens || 0,
            },
            finishReason: data.choices[0]?.finish_reason,
        };
    }

    /**
     * Send a chat completion request to Google Gemini
     */
    async googleCompletion(
        messages: AIMessage[],
        options: AICompletionOptions = {}
    ): Promise<AICompletionResponse> {
        const apiKey = this.getApiKey('google');
        if (!apiKey) {
            throw new Error('Google API key not configured. Please set it in Settings.');
        }

        const model = options.model || this.getDefaultModel('google');
        const systemMessage = messages.find((m) => m.role === 'system');
        const userMessages = messages.filter((m) => m.role !== 'system');

        // Convert messages to Gemini format
        const contents = userMessages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));

        // Use v1 API for stable models, v1beta for experimental
        const apiVersion =
            model.includes('exp') || model.includes('thinking') ? 'v1beta' : 'v1beta';

        const response = await fetch(
            `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents,
                    systemInstruction: systemMessage
                        ? { parts: [{ text: systemMessage.content }] }
                        : undefined,
                    generationConfig: {
                        maxOutputTokens: options.maxTokens || 4096,
                        temperature: options.temperature ?? 0.7,
                    },
                }),
            }
        );

        if (!response.ok) {
            const error = await response
                .json()
                .catch(() => ({ error: { message: response.statusText } }));
            throw new Error(`Google API error: ${error.error?.message || response.statusText}`);
        }

        const data = await response.json();

        return {
            content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
            model,
            usage: {
                promptTokens: data.usageMetadata?.promptTokenCount || 0,
                completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
                totalTokens: data.usageMetadata?.totalTokenCount || 0,
            },
            finishReason: data.candidates?.[0]?.finishReason,
        };
    }

    /**
     * Get all configured providers sorted by model performance score (highest first)
     */
    getConfiguredProviders(): AIProviderType[] {
        // All supported providers
        const allProviders: AIProviderType[] = [
            'anthropic',
            'openai',
            'google',
            'azure-openai',
            'mistral',
            'groq',
            'deepseek',
            'cohere',
            'openrouter',
            'together',
            'fireworks',
            'perplexity',
            'ollama',
            'lmstudio',
            'zhipu',
            'moonshot',
            'qwen',
            'baidu',
            'huggingface',
            'replicate',
        ];

        // Filter to only configured providers
        const configuredProviders = allProviders.filter((p) => this.isProviderConfigured(p));

        // Sort by performance score (highest first)
        return configuredProviders.sort((a, b) => {
            const scoreA = this.getProviderPerformanceScore(a);
            const scoreB = this.getProviderPerformanceScore(b);
            return scoreB - scoreA; // Descending order (higher score first)
        });
    }

    /**
     * Get configured providers with their performance scores (for debugging/display)
     */
    getConfiguredProvidersWithScores(): Array<{ provider: AIProviderType; score: number }> {
        return this.getConfiguredProviders().map((provider) => ({
            provider,
            score: this.getProviderPerformanceScore(provider),
        }));
    }

    /**
     * Get provider configuration
     */
    private getProviderConfig(provider: AIProviderType) {
        try {
            const settingsStore = useSettingsStore();
            return settingsStore.aiProviders.find((p) => p.id === provider);
        } catch {
            return null;
        }
    }

    /**
     * OpenAI-compatible API completion (used by many providers)
     */
    private async openaiCompatibleCompletion(
        messages: AIMessage[],
        options: AICompletionOptions,
        config: {
            baseUrl: string;
            apiKey: string;
            model: string;
            headers?: Record<string, string>;
        }
    ): Promise<AICompletionResponse> {
        const response = await fetch(`${config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.apiKey}`,
                ...config.headers,
            },
            body: JSON.stringify({
                model: config.model,
                max_tokens: options.maxTokens || 4096,
                temperature: options.temperature ?? 0.7,
                messages: messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
            }),
        });

        if (!response.ok) {
            const error = await response
                .json()
                .catch(() => ({ error: { message: response.statusText } }));
            throw new Error(error.error?.message || response.statusText);
        }

        const data = await response.json();

        return {
            content: data.choices[0]?.message?.content || '',
            model: data.model || config.model,
            usage: {
                promptTokens: data.usage?.prompt_tokens || 0,
                completionTokens: data.usage?.completion_tokens || 0,
                totalTokens: data.usage?.total_tokens || 0,
            },
            finishReason: data.choices[0]?.finish_reason,
        };
    }

    /**
     * Try a single provider completion
     */
    private async tryProviderCompletion(
        provider: AIProviderType,
        messages: AIMessage[],
        options: AICompletionOptions
    ): Promise<AICompletionResponse> {
        const config = this.getProviderConfig(provider);
        const apiKey = this.getApiKey(provider);
        const model = options.model || config?.defaultModel || this.getDefaultModel(provider);

        switch (provider) {
            case 'anthropic':
                return this.anthropicCompletion(messages, options);

            case 'openai':
                return this.openaiCompletion(messages, options);

            case 'google':
                return this.googleCompletion(messages, options);

            case 'azure-openai':
                if (!config?.baseUrl) throw new Error('Azure OpenAI endpoint not configured');
                return this.openaiCompatibleCompletion(messages, options, {
                    baseUrl: config.baseUrl,
                    apiKey: apiKey || '',
                    model,
                    headers: { 'api-key': apiKey || '' },
                });

            case 'mistral':
                return this.openaiCompatibleCompletion(messages, options, {
                    baseUrl: 'https://api.mistral.ai/v1',
                    apiKey: apiKey || '',
                    model,
                });

            case 'groq':
                return this.openaiCompatibleCompletion(messages, options, {
                    baseUrl: 'https://api.groq.com/openai/v1',
                    apiKey: apiKey || '',
                    model,
                });

            case 'deepseek':
                return this.openaiCompatibleCompletion(messages, options, {
                    baseUrl: 'https://api.deepseek.com/v1',
                    apiKey: apiKey || '',
                    model,
                });

            case 'together':
                return this.openaiCompatibleCompletion(messages, options, {
                    baseUrl: 'https://api.together.xyz/v1',
                    apiKey: apiKey || '',
                    model,
                });

            case 'fireworks':
                return this.openaiCompatibleCompletion(messages, options, {
                    baseUrl: 'https://api.fireworks.ai/inference/v1',
                    apiKey: apiKey || '',
                    model,
                });

            case 'perplexity':
                return this.openaiCompatibleCompletion(messages, options, {
                    baseUrl: 'https://api.perplexity.ai',
                    apiKey: apiKey || '',
                    model,
                });

            case 'openrouter':
                return this.openaiCompatibleCompletion(messages, options, {
                    baseUrl: 'https://openrouter.ai/api/v1',
                    apiKey: apiKey || '',
                    model,
                    headers: {
                        'HTTP-Referer': 'https://workflow-manager.app',
                        'X-Title': 'HighFlow',
                    },
                });

            case 'ollama':
                return this.openaiCompatibleCompletion(messages, options, {
                    baseUrl: config?.baseUrl || 'http://localhost:11434/v1',
                    apiKey: 'ollama', // Ollama doesn't need real API key
                    model,
                });

            case 'lmstudio':
                return this.openaiCompatibleCompletion(messages, options, {
                    baseUrl: config?.baseUrl || 'http://localhost:1234/v1',
                    apiKey: 'lm-studio', // LM Studio doesn't need real API key
                    model,
                });

            case 'cohere':
                return this.cohereCompletion(messages, options, apiKey || '', model);

            case 'zhipu':
                return this.zhipuCompletion(messages, options, apiKey || '', model);

            case 'moonshot':
                return this.openaiCompatibleCompletion(messages, options, {
                    baseUrl: 'https://api.moonshot.cn/v1',
                    apiKey: apiKey || '',
                    model,
                });

            case 'qwen':
                return this.qwenCompletion(messages, options, apiKey || '', model);

            case 'baidu':
                return this.baiduCompletion(messages, options, apiKey || '', model);

            case 'huggingface':
                return this.huggingfaceCompletion(messages, options, apiKey || '', model);

            case 'replicate':
                return this.replicateCompletion(messages, options, apiKey || '', model);

            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }

    /**
     * Cohere completion
     */
    private async cohereCompletion(
        messages: AIMessage[],
        options: AICompletionOptions,
        apiKey: string,
        model: string
    ): Promise<AICompletionResponse> {
        const chatHistory = messages.slice(0, -1).map((m) => ({
            role: m.role === 'assistant' ? 'CHATBOT' : 'USER',
            message: m.content,
        }));
        const lastMessage = messages[messages.length - 1]?.content || '';

        const response = await fetch('https://api.cohere.ai/v1/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                message: lastMessage,
                chat_history: chatHistory,
                max_tokens: options.maxTokens || 4096,
                temperature: options.temperature ?? 0.7,
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || response.statusText);
        }

        const data = await response.json();
        return {
            content: data.text || '',
            model,
            usage: {
                promptTokens: data.meta?.billed_units?.input_tokens || 0,
                completionTokens: data.meta?.billed_units?.output_tokens || 0,
                totalTokens:
                    (data.meta?.billed_units?.input_tokens || 0) +
                    (data.meta?.billed_units?.output_tokens || 0),
            },
            finishReason: data.finish_reason,
        };
    }

    /**
     * Zhipu AI completion
     */
    private async zhipuCompletion(
        messages: AIMessage[],
        options: AICompletionOptions,
        apiKey: string,
        model: string
    ): Promise<AICompletionResponse> {
        const response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: messages.map((m) => ({ role: m.role, content: m.content })),
                max_tokens: options.maxTokens || 4096,
                temperature: options.temperature ?? 0.7,
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error?.message || response.statusText);
        }

        const data = await response.json();
        return {
            content: data.choices?.[0]?.message?.content || '',
            model,
            usage: {
                promptTokens: data.usage?.prompt_tokens || 0,
                completionTokens: data.usage?.completion_tokens || 0,
                totalTokens: data.usage?.total_tokens || 0,
            },
            finishReason: data.choices?.[0]?.finish_reason,
        };
    }

    /**
     * Qwen (Alibaba) completion
     */
    private async qwenCompletion(
        messages: AIMessage[],
        options: AICompletionOptions,
        apiKey: string,
        model: string
    ): Promise<AICompletionResponse> {
        const response = await fetch(
            'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    input: {
                        messages: messages.map((m) => ({ role: m.role, content: m.content })),
                    },
                    parameters: {
                        max_tokens: options.maxTokens || 4096,
                        temperature: options.temperature ?? 0.7,
                    },
                }),
            }
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.message || response.statusText);
        }

        const data = await response.json();
        return {
            content: data.output?.text || data.output?.choices?.[0]?.message?.content || '',
            model,
            usage: {
                promptTokens: data.usage?.input_tokens || 0,
                completionTokens: data.usage?.output_tokens || 0,
                totalTokens: data.usage?.total_tokens || 0,
            },
            finishReason: data.output?.finish_reason,
        };
    }

    /**
     * Baidu ERNIE completion
     */
    private async baiduCompletion(
        messages: AIMessage[],
        options: AICompletionOptions,
        apiKey: string,
        model: string
    ): Promise<AICompletionResponse> {
        // Baidu uses access_token in URL
        const modelEndpoints: Record<string, string> = {
            'ernie-4.0': 'completions_pro',
            'ernie-3.5-turbo': 'ernie-3.5-8k',
            'ernie-speed': 'ernie_speed',
        };
        const endpoint = modelEndpoints[model] || 'completions_pro';

        const response = await fetch(
            `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/${endpoint}?access_token=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: messages.map((m) => ({ role: m.role, content: m.content })),
                    max_output_tokens: options.maxTokens || 4096,
                    temperature: options.temperature ?? 0.7,
                }),
            }
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error_msg || response.statusText);
        }

        const data = await response.json();
        return {
            content: data.result || '',
            model,
            usage: {
                promptTokens: data.usage?.prompt_tokens || 0,
                completionTokens: data.usage?.completion_tokens || 0,
                totalTokens: data.usage?.total_tokens || 0,
            },
            finishReason: data.finish_reason,
        };
    }

    /**
     * Hugging Face completion
     */
    private async huggingfaceCompletion(
        messages: AIMessage[],
        options: AICompletionOptions,
        apiKey: string,
        model: string
    ): Promise<AICompletionResponse> {
        // Format messages as a single prompt
        const prompt =
            messages
                .map((m) => {
                    if (m.role === 'system') return `System: ${m.content}`;
                    if (m.role === 'assistant') return `Assistant: ${m.content}`;
                    return `User: ${m.content}`;
                })
                .join('\n') + '\nAssistant:';

        const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_new_tokens: options.maxTokens || 4096,
                    temperature: options.temperature ?? 0.7,
                    return_full_text: false,
                },
            }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || response.statusText);
        }

        const data = await response.json();
        const content = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;

        return {
            content: content || '',
            model,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            finishReason: 'stop',
        };
    }

    /**
     * Replicate completion
     */
    private async replicateCompletion(
        messages: AIMessage[],
        options: AICompletionOptions,
        apiKey: string,
        model: string
    ): Promise<AICompletionResponse> {
        // Format messages as prompt
        const prompt =
            messages
                .map((m) => {
                    if (m.role === 'system') return `<|system|>${m.content}</s>`;
                    if (m.role === 'assistant') return `<|assistant|>${m.content}</s>`;
                    return `<|user|>${m.content}</s>`;
                })
                .join('') + '<|assistant|>';

        // Create prediction
        const createResponse = await fetch('https://api.replicate.com/v1/predictions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Token ${apiKey}`,
            },
            body: JSON.stringify({
                version: model,
                input: {
                    prompt,
                    max_tokens: options.maxTokens || 4096,
                    temperature: options.temperature ?? 0.7,
                },
            }),
        });

        if (!createResponse.ok) {
            const error = await createResponse.json().catch(() => ({}));
            throw new Error(error.detail || createResponse.statusText);
        }

        const prediction = await createResponse.json();

        // Poll for completion
        let result = prediction;
        while (result.status !== 'succeeded' && result.status !== 'failed') {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const pollResponse = await fetch(result.urls.get, {
                headers: { Authorization: `Token ${apiKey}` },
            });
            result = await pollResponse.json();
        }

        if (result.status === 'failed') {
            throw new Error(result.error || 'Prediction failed');
        }

        const content = Array.isArray(result.output) ? result.output.join('') : result.output;

        return {
            content: content || '',
            model,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            finishReason: 'stop',
        };
    }

    /**
     * Universal completion method that tries multiple providers with fallback
     */
    async completion(
        messages: AIMessage[],
        options: AICompletionOptions & {
            provider?: AIProviderType;
            preferredProvider?: AIProviderType;
        } = {}
    ): Promise<AICompletionResponse> {
        // If specific provider is requested, try only that one
        if (options.provider) {
            const response = await this.tryProviderCompletion(options.provider, messages, options);
            return { ...response, provider: options.provider };
        }

        // Get all configured providers
        let providers = this.getConfiguredProviders();

        if (providers.length === 0) {
            throw new Error('No AI provider configured. Please add an API key in Settings.');
        }

        // If preferred provider is set, try it first
        if (options.preferredProvider && providers.includes(options.preferredProvider)) {
            providers = [
                options.preferredProvider,
                ...providers.filter((p) => p !== options.preferredProvider),
            ];
        }

        // Try each provider in order until one succeeds
        const errors: { provider: AIProviderType; error: string }[] = [];

        for (const provider of providers) {
            try {
                const response = await this.tryProviderCompletion(provider, messages, options);
                return { ...response, provider };
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.warn(`[AIClient] Provider ${provider} failed: ${errorMessage}`);
                errors.push({ provider, error: errorMessage });
                // Continue to next provider
            }
        }

        // All providers failed
        const errorSummary = errors.map((e) => `${e.provider}: ${e.error}`).join('\n');
        throw new Error(`All AI providers failed:\n${errorSummary}`);
    }

    /**
     * Simple text completion (convenience method)
     * Returns just the content string for backward compatibility
     */
    async complete(
        prompt: string,
        options: AICompletionOptions & {
            provider?: AIProviderType;
            preferredProvider?: AIProviderType;
        } = {}
    ): Promise<string> {
        const messages: AIMessage[] = [];

        if (options.systemPrompt) {
            messages.push({ role: 'system', content: options.systemPrompt });
        }

        messages.push({ role: 'user', content: prompt });

        const response = await this.completion(messages, options);
        return response.content;
    }

    /**
     * Simple text completion with full response (includes provider info)
     */
    async completeWithInfo(
        prompt: string,
        options: AICompletionOptions & {
            provider?: AIProviderType;
            preferredProvider?: AIProviderType;
        } = {}
    ): Promise<AICompletionResponse> {
        const messages: AIMessage[] = [];

        if (options.systemPrompt) {
            messages.push({ role: 'system', content: options.systemPrompt });
        }

        messages.push({ role: 'user', content: prompt });

        return this.completion(messages, options);
    }
}

// ========================================
// Singleton Export
// ========================================

export const aiClient = new AIClient();
export default aiClient;
