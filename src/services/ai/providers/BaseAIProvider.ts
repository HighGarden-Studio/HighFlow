/**
 * Base AI Provider
 *
 * Abstract base class for all AI provider implementations
 */

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
    AiResult,
} from '@core/types/ai';
import { buildPlainTextResult } from '../utils/aiResultUtils';

export abstract class BaseAIProvider {
    abstract readonly name: AIProvider;

    /**
     * Static model list (fallback when API fetch fails)
     */
    abstract readonly defaultModels: ModelInfo[];

    /**
     * Dynamic model list (fetched from API)
     * Falls back to defaultModels if not fetched
     */
    protected _dynamicModels: ModelInfo[] | null = null;

    /**
     * Get models - returns dynamic models if available, otherwise default models
     */
    get models(): ModelInfo[] {
        return this._dynamicModels || this.defaultModels;
    }

    /**
     * Set dynamic models (called after API fetch)
     */
    setDynamicModels(models: ModelInfo[]): void {
        this._dynamicModels = models;
    }

    /**
     * Fetch available models from provider API
     * Each provider should implement this to query their API
     */
    abstract fetchModels(): Promise<ModelInfo[]>;

    /**
     * Execute a prompt and get response
     */
    abstract execute(
        prompt: string,
        config: AIConfig,
        context?: ExecutionContext,
        signal?: AbortSignal
    ): Promise<AIResponse>;

    /**
     * Execute with streaming support
     */
    abstract streamExecute(
        prompt: string,
        config: AIConfig,
        onToken: (token: string) => void,
        context?: ExecutionContext,
        signal?: AbortSignal
    ): AsyncGenerator<StreamChunk>;

    /**
     * Execute using structured conversation messages (supports tool-calling)
     * Default implementation degrades to single prompt execution.
     */
    async chat(
        messages: AIMessage[],
        config: AIConfig,
        context?: ExecutionContext,
        signal?: AbortSignal
    ): Promise<AIResponse> {
        const systemPrompts = messages
            .filter((msg) => msg.role === 'system')
            .map((msg) => msg.content);
        const conversationalContent = messages
            .filter((msg) => msg.role !== 'system')
            .map((msg) => {
                const header =
                    msg.role === 'tool'
                        ? `Tool Response (${msg.name || msg.toolCallId || 'unknown'})`
                        : msg.role === 'assistant'
                          ? 'Assistant'
                          : 'User';
                const body = msg.content || '';
                return `### ${header}\n${body}`;
            })
            .join('\n\n');

        const prompt = conversationalContent || messages[messages.length - 1]?.content || '';
        const mergedConfig = {
            ...config,
            systemPrompt:
                [config.systemPrompt, ...systemPrompts].filter(Boolean).join('\n\n') ||
                config.systemPrompt,
        };

        return this.execute(prompt, mergedConfig, context, signal);
    }

    async generateText(
        messages: AIMessage[],
        config: AIConfig,
        context?: ExecutionContext,
        signal?: AbortSignal
    ): Promise<AiResult> {
        const response = await this.chat(messages, config, context, signal);
        const meta = {
            ...(response.metadata || {}),
            toolCalls: response.toolCalls,
        };
        const aiResult = buildPlainTextResult(response.content, meta);
        aiResult.raw = response;
        return aiResult;
    }

    async generateImage(
        _prompt: string,
        _config: AIConfig,
        _context?: ExecutionContext,
        _options?: Record<string, any>,
        _signal?: AbortSignal
    ): Promise<AiResult> {
        throw new Error(`${this.name} provider does not support image generation yet.`);
    }

    async generateVideo(
        _prompt: string,
        _config: AIConfig,
        _context?: ExecutionContext,
        _options?: Record<string, any>,
        _signal?: AbortSignal
    ): Promise<AiResult> {
        throw new Error(`${this.name} provider does not support video generation yet.`);
    }

    /**
     * Estimate tokens for a prompt
     */
    estimateTokens(prompt: string): number {
        // Rough estimation: ~4 characters per token
        return Math.ceil(prompt.length / 4);
    }

    /**
     * Calculate cost for token usage
     */
    calculateCost(tokens: { prompt: number; completion: number }, model: AIModel): number {
        const modelInfo = this.models.find((m) => m.name === model);
        if (!modelInfo) return 0;

        const inputCost = (tokens.prompt / 1000000) * modelInfo.costPerInputToken;
        const outputCost = (tokens.completion / 1000000) * modelInfo.costPerOutputToken;

        return inputCost + outputCost;
    }

    /**
     * Get supported AI features
     */
    abstract getSupportedFeatures(): AIFeature[];

    /**
     * Get detailed capabilities
     */
    abstract getCapabilities(): Capability[];

    /**
     * Build context from previous executions and skills
     */
    buildContext(
        previousExecutions: Array<{ prompt: string; response: string; success: boolean }>,
        skills: Array<{ name: string; description: string; prompt: string }>
    ): string {
        let context = '';

        if (previousExecutions.length > 0) {
            context += '## Previous Executions\n\n';
            previousExecutions.slice(-3).forEach((exec, i) => {
                context += `### Execution ${i + 1} ${exec.success ? '✓' : '✗'}\n`;
                context += `**Prompt:** ${exec.prompt.substring(0, 200)}...\n`;
                context += `**Response:** ${exec.response.substring(0, 200)}...\n\n`;
            });
        }

        if (skills.length > 0) {
            context += '## Available Skills\n\n';
            skills.forEach((skill) => {
                context += `- **${skill.name}**: ${skill.description}\n`;
            });
        }

        return context;
    }

    /**
     * Get model info by name
     */
    getModelInfo(model: AIModel): ModelInfo | undefined {
        return this.models.find((m) => m.name === model);
    }

    /**
     * Validate config before execution
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

        const modelInfo = this.getModelInfo(config.model);
        if (!modelInfo) {
            console.error(`[BaseAIProvider] Model validation failed for provider ${this.name}`);
            console.error(`[BaseAIProvider] Requested model: '${config.model}'`);
            console.error(
                `[BaseAIProvider] Available models:`,
                this.models.map((m) => m.name)
            );
            throw new Error(
                `Model ${config.model} not supported by ${this.name}. Available models: ${this.models.map((m) => m.name).join(', ')}`
            );
        }
    }

    /**
     * Handle errors and retry logic
     */
    protected async executeWithRetry<T>(
        fn: () => Promise<T>,
        maxRetries: number = 3,
        delayMs: number = 1000
    ): Promise<T> {
        let lastError: Error | undefined;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error as Error;

                // Don't retry on certain errors
                if (this.shouldNotRetry(error)) {
                    throw error;
                }

                if (attempt < maxRetries) {
                    await this.delay(delayMs * attempt);
                }
            }
        }

        throw lastError || new Error('Max retries exceeded');
    }

    /**
     * Check if error should not be retried
     */
    protected shouldNotRetry(error: any): boolean {
        const noRetryStatuses = [400, 401, 403, 404];
        return noRetryStatuses.includes(error.status || error.statusCode);
    }

    /**
     * Delay helper
     */
    protected delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Build system prompt with context
     */
    protected buildSystemPrompt(config: AIConfig, context?: ExecutionContext): string {
        let systemPrompt = config.systemPrompt || '';

        if (context) {
            if (context.skills && context.skills.length > 0) {
                systemPrompt += '\n\n## Available Skills\n';
                context.skills.forEach((skill) => {
                    systemPrompt += `- ${skill.name}: ${skill.description}\n`;
                });
            }

            if (context.mcpTools && context.mcpTools.length > 0) {
                systemPrompt += '\n\n## Available MCP Tools\n';
                context.mcpTools.forEach((mcp) => {
                    systemPrompt += `- ${mcp.name}: ${mcp.description}\n`;
                });
            }

            if (context.previousExecutions && context.previousExecutions.length > 0) {
                systemPrompt += '\n\n## Recent History\n';
                systemPrompt += 'Previous attempts:\n';
                context.previousExecutions.slice(-2).forEach((exec, i) => {
                    systemPrompt += `${i + 1}. ${exec.success ? 'Success' : 'Failed'}: ${exec.prompt.substring(0, 100)}...\n`;
                });
            }
        }

        return systemPrompt;
    }

    /**
     * Log execution metrics
     */
    protected logMetrics(
        operation: string,
        metrics: {
            tokensUsed?: number;
            cost?: number;
            duration?: number;
            model?: string;
        }
    ): void {
        console.log(`[${this.name}] ${operation}`, {
            model: metrics.model,
            tokens: metrics.tokensUsed,
            cost: metrics.cost ? `$${metrics.cost.toFixed(4)}` : undefined,
            duration: metrics.duration ? `${metrics.duration}ms` : undefined,
        });
    }
}
