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
     * Dynamic model list (fetched from API and cached in DB)
     */
    protected _dynamicModels: ModelInfo[] | null = null;

    /**
     * Get models - returns dynamic models if available, otherwise empty array
     */
    get models(): ModelInfo[] {
        return this._dynamicModels || [];
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
    /**
     * Helper to extract text prompt from input
     */
    protected getPromptText(input: string | AIMessage[]): string {
        if (typeof input === 'string') return input;
        // Basic fallback: join non-system messages or take last user message
        const lastUserMsg = [...input].reverse().find((m) => m.role === 'user');
        return lastUserMsg?.content || '';
    }

    /**
     * Execute with streaming support
     */
    abstract streamExecute(
        input: string | AIMessage[],
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

        // Dynamic Model Validation:
        // If the model exists in the dynamic list (fetched from DB/API), it is valid.
        // We do NOT strictly check against the AIModel enum here to allow for new models
        // to be supported dynamically without code changes.
        if (modelInfo) {
            return;
        }

        // Fallback: If not found in dynamic list, check if it's a known static model
        // that hasn't been synced yet (edge case).
        // But generally, if it's not in the list, we warn/error.

        console.error(`[BaseAIProvider] Model validation failed for provider ${this.name}`);
        console.error(`[BaseAIProvider] Requested model: '${config.model}'`);
        try {
            console.error(
                `[BaseAIProvider] Available models:`,
                this.models.map((m) => m.name)
            );
        } catch (e) {
            console.error(`[BaseAIProvider] Could not list available models`, e);
        }

        throw new Error(
            `Model ${config.model} not supported by ${this.name}. Available models: ${this.models.map((m) => m.name).join(', ')}`
        );
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

        // Inject Current Date and Time
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        const timeStr = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZoneName: 'short',
        });
        systemPrompt = `Current Date: ${dateStr}\nCurrent Time: ${timeStr}\n\n${systemPrompt}`;

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

                // Add specific guidance for Rovo/Atlassian tools
                const hasAtlassianTools = context.mcpTools.some((tool) =>
                    tool.name.includes('atlassian')
                );
                if (hasAtlassianTools) {
                    systemPrompt += `
### Tool Usage Guidelines for Atlassian/Rovo
- **CRITICAL FOR "RECENT" or "DATE" QUERIES**: You MUST use 'atlassian-rovo_searchJiraIssuesUsingJql' or 'atlassian-rovo_searchConfluenceUsingCql' IMMEDIATELY.
    - ❌ DO NOT use 'atlassian-rovo_search' for dates (it ignores them).
    - ❌ DO NOT use 'atlassian-rovo_getPagesInConfluenceSpace' (it returns old/stale pages).
    - ❌ DO NOT use 'atlassian-rovo_getConfluenceSpaces' (it is for structure, not content).
- **JQL Example** (Last 7 days): "project = AD AND updated >= -7d ORDER BY updated DESC"
- **CQL Example** (Last 7 days): "space = AD AND lastModified >= now('-7d') ORDER BY lastModified DESC"
- Trust the search results. If search returns nothing, report "No recent updates found" rather than crawling the hierarchy.
`;
                }
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
