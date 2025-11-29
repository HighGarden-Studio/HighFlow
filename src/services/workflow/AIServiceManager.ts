/**
 * AI Service Manager
 *
 * Centralized manager for AI provider selection, execution, and fallback handling.
 * Integrates with AdvancedTaskExecutor for workflow execution.
 */

import type { Task, MCPIntegration, MCPConfig } from '@core/types/database';
import type {
    AIProvider,
    AIModel,
    AIConfig,
    ExecutionContext as AIExecutionContext,
    MCPToolDefinition,
    AIMessage,
    ToolCall,
    EnabledProviderInfo,
    MCPServerRuntimeConfig,
    AiResult,
} from '@core/types/ai';
import { ProviderFactory, type ProviderApiKeys } from '../ai/providers/ProviderFactory';
import { buildPlainTextResult } from '../ai/utils/aiResultUtils';
import { MultiVendorAiClient } from '../ai/MultiVendorAiClient';
import type { ExecutionContext } from './types';
import type { MCPManager } from '../mcp/MCPManager';
import { isMCPPermissionError } from '../mcp/errors';
import { eventBus } from '../events/EventBus';
import type { AIPromptGeneratedEvent } from '../events/EventBus';

// ========================================
// Types
// ========================================

export interface AIExecutionOptions {
    streaming?: boolean;
    onToken?: (token: string) => void;
    onProgress?: (progress: AIExecutionProgress) => void;
    timeout?: number;
    maxRetries?: number;
    fallbackProviders?: AIProvider[];
    onLog?: (level: 'info' | 'warn' | 'error' | 'debug', message: string, details?: any) => void;
}

export interface AIExecutionProgress {
    phase: 'preparing' | 'executing' | 'streaming' | 'completed' | 'failed';
    tokensGenerated?: number;
    estimatedTokensTotal?: number;
    elapsedTime: number;
    provider: AIProvider;
    model: AIModel;
    currentContent?: string; // Streaming content for real-time display
}

export interface AIExecutionResult {
    success: boolean;
    content: string;
    aiResult?: AiResult;
    tokensUsed: {
        prompt: number;
        completion: number;
        total: number;
    };
    cost: number;
    duration: number;
    provider: AIProvider;
    model: AIModel;
    finishReason: 'stop' | 'length' | 'content_filter' | 'error';
    error?: Error;
    metadata: Record<string, any>;
}

interface MCPContextInsight {
    name: string;
    description?: string;
    endpoint?: string;
    recommendedTools?: string[];
    sampleOutput?: string;
    error?: string;
    userContext?: Record<string, unknown>;
    envOverrides?: string[];
}

interface SlackHistoryHints {
    channelId?: string;
    channelName?: string;
    limit?: number;
    oldestISO?: string;
    latestISO?: string;
}

const MCP_SUFFIX_PATTERN = /-(?:mcp|server)$/i;

// Default models for each provider
const DEFAULT_MODELS: Partial<Record<AIProvider, AIModel>> = {
    anthropic: 'claude-3-5-sonnet-20250219',
    openai: 'gpt-4-turbo',
    google: 'gemini-1.5-pro',
    groq: 'llama-3.3-70b-versatile',
    'claude-code': 'claude-3-5-sonnet-20250219',
    antigravity: 'antigravity-pro',
    codex: 'codex-latest',
    local: 'gpt-3.5-turbo',
};

// Default fallback order (used when no enabled providers are configured)
const DEFAULT_FALLBACK_ORDER: AIProvider[] = ['anthropic', 'openai', 'google'];

// ========================================
// AIServiceManager Class
// ========================================

export class AIServiceManager {
    private providerFactory: ProviderFactory;
    private multiVendorClient: MultiVendorAiClient;
    private activeExecutions: Map<string, AbortController> = new Map();
    private enabledProviders: EnabledProviderInfo[] = []; // 연동된 Provider 목록
    private runtimeMCPServers: MCPServerRuntimeConfig[] = [];
    private mcpManager: MCPManager | null = null;
    private static readonly MAX_TOOL_ITERATIONS = 5;
    private static readonly TOOL_RESULT_CHAR_LIMIT = 6000;
    private autoDetectMCPsEnabled = false;

    constructor() {
        this.providerFactory = new ProviderFactory();
        this.multiVendorClient = new MultiVendorAiClient(this.providerFactory);

        // Initialize MCPManager asynchronously to handle ESM import
        this.initializeMCPManager();
    }

    private async initializeMCPManager() {
        try {
            // Dynamic import to avoid ERR_REQUIRE_ESM
            const module = await import('../mcp/MCPManager');
            const MCPManagerClass = module.MCPManager;
            this.mcpManager = new MCPManagerClass();

            // Apply runtime servers if any were set before initialization
            if (this.runtimeMCPServers.length > 0) {
                this.mcpManager?.setRuntimeServers(this.runtimeMCPServers);
            }
        } catch (error) {
            console.warn('[AIServiceManager] Failed to initialize MCPManager:', error);
            this.mcpManager = null;
        }
    }

    /**
     * Get MCPManager instance
     */
    private getMCPManager(): MCPManager | null {
        return this.mcpManager;
    }

    /**
     * 연동된 Provider 목록 설정
     * settingsStore에서 연동된 Provider 목록을 받아 설정합니다.
     */
    setEnabledProviders(providers: EnabledProviderInfo[]): void {
        this.enabledProviders = providers;
    }

    /**
     * Allows runtime toggling of MCP auto-detection.
     * Default is disabled until explicitly enabled via settings.
     */
    setAutoDetectMCPsEnabled(enabled: boolean): void {
        this.autoDetectMCPsEnabled = Boolean(enabled);
    }

    setMCPServers(servers: MCPServerRuntimeConfig[]): void {
        this.runtimeMCPServers = servers || [];
        if (this.mcpManager) {
            this.mcpManager.setRuntimeServers(this.runtimeMCPServers);
        }
    }

    /**
     * API 키 설정 (IPC 핸들러에서 설정 스토어의 값을 전달받아 설정)
     */
    setApiKeys(keys: ProviderApiKeys): void {
        this.providerFactory.setApiKeys(keys);
        this.multiVendorClient.setApiKeys(keys);
    }

    /**
     * 연동된 Provider 목록 가져오기
     */
    getEnabledProviders(): EnabledProviderInfo[] {
        return this.enabledProviders;
    }

    /**
     * 연동된 Provider ID 목록 반환 (fallback order로 사용)
     */
    private getEnabledProviderIds(): AIProvider[] {
        if (this.enabledProviders.length === 0) {
            return DEFAULT_FALLBACK_ORDER;
        }
        return this.enabledProviders.map((p) => p.id as AIProvider);
    }

    /**
     * Execute a task with AI
     */
    async executeTask(
        task: Task,
        context: ExecutionContext,
        options: AIExecutionOptions = {}
    ): Promise<AIExecutionResult> {
        const startTime = Date.now();
        const executionId = `exec-${task.id}-${startTime}`;
        const abortController = new AbortController();
        this.activeExecutions.set(executionId, abortController);
        const mcpManager = this.getMCPManager();
        const hasTaskOverrides = Boolean(task.mcpConfig && mcpManager);
        if (hasTaskOverrides && mcpManager) {
            mcpManager.setTaskOverrides(task.id, task.mcpConfig as MCPConfig);
        }

        try {
            // Determine provider and model
            const provider = this.resolveProvider(task.aiProvider as AIProvider | null);
            const model = this.resolveModel(provider, task.aiModel as AIModel | null);
            const explicitMCPs = this.normalizeExplicitRequiredMCPs(task.requiredMCPs);
            const shouldAutoDetect = this.autoDetectMCPsEnabled && explicitMCPs.length === 0;
            const detectedMCPs = shouldAutoDetect
                ? await this.detectRelevantMCPs(task, options.onLog)
                : [];
            if (!shouldAutoDetect) {
                options.onLog?.(
                    'debug',
                    '[AIServiceManager] MCP auto-detection skipped (explicit configuration present or feature disabled)',
                    {
                        taskId: task.id,
                        hasExplicitMCPs: explicitMCPs.length > 0,
                        autoDetectEnabled: this.autoDetectMCPsEnabled,
                    }
                );
            } else {
                options.onLog?.(
                    'info',
                    `[AIServiceManager] Auto-detected relevant MCPs: ${
                        detectedMCPs.length ? detectedMCPs.join(', ') : 'none'
                    }`,
                    {
                        taskId: task.id,
                        detectedMCPs,
                    }
                );
            }

            const allRequiredMCPs = explicitMCPs.length > 0 ? explicitMCPs : detectedMCPs;

            options.onLog?.(
                'info',
                `[AIServiceManager] Task ${task.id} requires MCPs: ${
                    allRequiredMCPs.length ? allRequiredMCPs.join(', ') : 'none'
                }`,
                {
                    taskId: task.id,
                    requiredMCPs: allRequiredMCPs,
                    detectedMCPs,
                }
            );

            // Collect MCP context if the task requires MCP integrations
            const taskWithMCPs = { ...task, requiredMCPs: allRequiredMCPs };
            const mcpContext = await this.collectRequiredMCPContext(taskWithMCPs);
            const contextWithMCP: ExecutionContext = {
                ...context,
                metadata: {
                    ...(context.metadata || {}),
                    requiredMCPs: allRequiredMCPs,
                    mcpContext,
                },
            };

            // Build AI config with MCP tools
            const aiConfig = await this.buildAIConfig(task, model, mcpContext, allRequiredMCPs);

            // Build AI execution context
            const aiContext = this.buildAIContext(task, contextWithMCP, mcpContext);
            const userPrompt = this.buildPrompt(task, mcpContext);
            const baseMessages: AIMessage[] = [];
            if (aiConfig.systemPrompt) {
                baseMessages.push({ role: 'system', content: aiConfig.systemPrompt });
            }
            baseMessages.push({ role: 'user', content: userPrompt });

            options.onLog?.('info', `[AIServiceManager] Generated prompt for task ${task.id}`, {
                taskId: task.id,
                systemPromptLength: aiConfig.systemPrompt?.length,
                userPromptLength: userPrompt.length,
                model: aiConfig.model,
            });

            const toolCount = Array.isArray(aiConfig.tools) ? aiConfig.tools.length : 0;
            const hasTools = toolCount > 0;
            if (!hasTools) {
                options.onLog?.(
                    'warn',
                    `[AIServiceManager] No MCP tools available for task ${task.id} despite required list`,
                    {
                        taskId: task.id,
                        requiredMCPs: allRequiredMCPs,
                    }
                );
            } else {
                options.onLog?.(
                    'info',
                    `[AIServiceManager] Collected ${toolCount} MCP tools for task ${task.id}`,
                    {
                        taskId: task.id,
                        toolNames: (aiConfig.tools ?? []).map((t) => t.name),
                    }
                );
            }

            this.logPromptEvent(
                task,
                provider,
                model,
                userPrompt,
                aiConfig.systemPrompt,
                mcpContext,
                options
            );

            // Report progress
            options.onProgress?.({
                phase: 'preparing',
                elapsedTime: Date.now() - startTime,
                provider,
                model,
            });

            // Execute with streaming, tool loop, or standard completion
            let result: AIExecutionResult;

            if (hasTools) {
                if (options.streaming) {
                    console.warn(
                        '[AIServiceManager] Streaming not supported when MCP tools are enabled. Falling back to iterative tool execution.'
                    );
                }
                result = await this.executeWithToolLoop(
                    task,
                    [...baseMessages],
                    aiConfig,
                    aiContext,
                    provider,
                    options,
                    startTime
                );
            } else if (options.streaming && options.onToken) {
                result = await this.executeWithStreaming(
                    task,
                    userPrompt,
                    aiConfig,
                    aiContext,
                    provider,
                    options,
                    startTime,
                    abortController.signal
                );
            } else {
                result = await this.executeNonStreaming(
                    task,
                    [...baseMessages],
                    aiConfig,
                    aiContext,
                    provider,
                    options,
                    startTime
                );
            }

            // Clean content if it looks like JSON wrapped in markdown
            if (aiConfig.responseFormat === 'json') {
                result.content = this.cleanAIResponse(result.content);
            }

            // Report completion
            options.onProgress?.({
                phase: 'completed',
                tokensGenerated: result.tokensUsed.completion,
                elapsedTime: result.duration,
                provider: result.provider,
                model: result.model,
            });

            return result;
        } catch (error) {
            const elapsed = Date.now() - startTime;

            // Try fallback providers
            if (options.fallbackProviders && options.fallbackProviders.length > 0) {
                console.log(`Primary provider failed, trying fallbacks...`);
                return this.executeWithFallback(task, context, options, startTime);
            }

            const resolvedProvider = (task.aiProvider as AIProvider) || 'anthropic';
            const resolvedModel = DEFAULT_MODELS[resolvedProvider];

            options.onProgress?.({
                phase: 'failed',
                elapsedTime: elapsed,
                provider: resolvedProvider,
                model: resolvedModel as AIModel,
            });

            return {
                success: false,
                content: '',
                tokensUsed: { prompt: 0, completion: 0, total: 0 },
                cost: 0,
                duration: elapsed,
                provider: resolvedProvider,
                model: resolvedModel as AIModel,
                finishReason: 'error',
                error: error instanceof Error ? error : new Error(String(error)),
                metadata: {},
            };
        } finally {
            this.activeExecutions.delete(executionId);
            if (hasTaskOverrides && mcpManager) {
                mcpManager.clearTaskOverrides(task.id);
            }
        }
    }

    /**
     * Execute with streaming
     */
    private async executeWithStreaming(
        _task: Task,
        prompt: string,
        config: AIConfig,
        context: AIExecutionContext,
        providerName: AIProvider,
        options: AIExecutionOptions,
        startTime: number,
        signal: AbortSignal
    ): Promise<AIExecutionResult> {
        const provider = await this.providerFactory.getProvider(providerName);

        let accumulated = '';
        let tokensGenerated = 0;

        options.onProgress?.({
            phase: 'streaming',
            tokensGenerated: 0,
            elapsedTime: Date.now() - startTime,
            provider: providerName,
            model: config.model,
        });

        const stream = provider.streamExecute(
            prompt,
            config,
            (token) => {
                if (signal.aborted) return;
                accumulated += token; // Accumulate tokens
                options.onToken?.(token);
                tokensGenerated++;

                options.onProgress?.({
                    phase: 'streaming',
                    tokensGenerated,
                    elapsedTime: Date.now() - startTime,
                    provider: providerName,
                    model: config.model,
                    currentContent: token, // Send the latest token for streaming display
                });
            },
            context
        );

        for await (const chunk of stream) {
            if (signal.aborted) {
                throw new Error('Execution aborted');
            }
            accumulated = chunk.accumulated;
            if (chunk.done) break;
        }

        const duration = Date.now() - startTime;
        const promptTokens = provider.estimateTokens(prompt);
        const completionTokens = provider.estimateTokens(accumulated);
        const cost = provider.calculateCost(
            { prompt: promptTokens, completion: completionTokens },
            config.model
        );

        const aiResult = buildPlainTextResult(accumulated, { streaming: true });
        aiResult.meta = {
            ...(aiResult.meta || {}),
            provider: providerName,
            model: config.model,
            streaming: true,
        };

        return {
            success: true,
            content: accumulated,
            tokensUsed: {
                prompt: promptTokens,
                completion: completionTokens,
                total: promptTokens + completionTokens,
            },
            cost,
            duration,
            provider: providerName,
            model: config.model,
            finishReason: 'stop',
            metadata: aiResult.meta || {},
            aiResult,
        };
    }

    /**
     * Execute without streaming
     */
    private async executeNonStreaming(
        _task: Task,
        messages: AIMessage[],
        config: AIConfig,
        context: AIExecutionContext,
        providerName: AIProvider,
        options: AIExecutionOptions,
        startTime: number
    ): Promise<AIExecutionResult> {
        const provider = await this.providerFactory.getProvider(providerName);
        const chatConfig = { ...config, systemPrompt: undefined };

        options.onProgress?.({
            phase: 'executing',
            elapsedTime: Date.now() - startTime,
            provider: providerName,
            model: config.model,
        });

        const aiResult = await this.multiVendorClient.generateText(
            {
                messages: [...messages],
                config: chatConfig,
                context,
            },
            providerName,
            provider
        );
        const completionTokens = provider.estimateTokens(aiResult.value);
        const promptTokens = provider.estimateTokens(JSON.stringify(messages));
        const tokensUsed = {
            prompt: promptTokens,
            completion: completionTokens,
            total: promptTokens + completionTokens,
        };
        const cost = provider.calculateCost(tokensUsed, config.model);

        return {
            success: true,
            content: aiResult.value,
            tokensUsed,
            cost,
            duration: Date.now() - startTime,
            provider: providerName,
            model: config.model,
            finishReason: 'stop',
            metadata: aiResult.meta || {},
            aiResult,
        };
    }

    private async executeWithToolLoop(
        task: Task,
        messages: AIMessage[],
        config: AIConfig,
        context: AIExecutionContext,
        providerName: AIProvider,
        options: AIExecutionOptions,
        startTime: number
    ): Promise<AIExecutionResult> {
        const provider = await this.providerFactory.getProvider(providerName);
        const chatConfig = { ...config, systemPrompt: undefined };
        const conversation: AIMessage[] = [...messages];
        let iteration = 0;
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;
        let totalCost = 0;
        const toolHistory: Array<{ call: ToolCall; metadata: Record<string, any> }> = [];

        while (iteration < AIServiceManager.MAX_TOOL_ITERATIONS) {
            options.onProgress?.({
                phase: 'executing',
                elapsedTime: Date.now() - startTime,
                provider: providerName,
                model: config.model,
            });

            const aiResult = await this.multiVendorClient.generateText(
                {
                    messages: [...conversation],
                    config: chatConfig,
                    context,
                },
                providerName,
                provider
            );
            const completionTokens = provider.estimateTokens(aiResult.value);
            const promptTokens = provider.estimateTokens(JSON.stringify(conversation));
            totalPromptTokens += promptTokens;
            totalCompletionTokens += completionTokens;
            totalCost += provider.calculateCost(
                { prompt: promptTokens, completion: completionTokens },
                config.model
            );

            let toolCalls = (aiResult.meta?.toolCalls || aiResult.meta?.tool_calls) as
                | ToolCall[]
                | undefined;

            // Fallback: Try to detect JSON tool call in the content if no native tool calls are present
            if (!toolCalls || toolCalls.length === 0) {
                const jsonToolCall = this.detectJsonToolCall(aiResult.value);
                if (jsonToolCall) {
                    console.log('[MCP Tool Loop] Detected JSON tool call in content');
                    toolCalls = [jsonToolCall];
                }
            }

            console.log(`[MCP Tool Loop] Iteration ${iteration + 1}: AI response received`);
            if (toolCalls && toolCalls.length > 0) {
                console.log(
                    `[MCP Tool Loop] AI requested ${toolCalls.length} tool calls:`,
                    toolCalls.map((tc) => tc.name)
                );
                conversation.push({
                    role: 'assistant',
                    content: aiResult.value,
                    toolCalls,
                });

                for (const call of toolCalls) {
                    console.log(`[MCP Tool Loop] Executing tool: ${call.name}`);
                    const toolResult = await this.executeToolCallForAI(call, task, options);
                    console.log(`[MCP Tool Loop] Tool ${call.name} completed`);
                    conversation.push({
                        role: 'tool',
                        name: call.name,
                        toolCallId: call.id,
                        content: toolResult.content,
                    });
                    toolHistory.push({
                        call,
                        metadata: toolResult.metadata,
                    });
                }

                iteration++;
                continue;
            } else {
                console.log(
                    '[MCP Tool Loop] No tool calls requested by AI, returning final response'
                );
            }

            return {
                success: true,
                content: aiResult.value,
                tokensUsed: {
                    prompt: totalPromptTokens,
                    completion: totalCompletionTokens,
                    total: totalPromptTokens + totalCompletionTokens,
                },
                cost: totalCost,
                duration: Date.now() - startTime,
                provider: providerName,
                model: config.model,
                finishReason: 'stop',
                metadata: {
                    ...(aiResult.meta || {}),
                    toolIterations: iteration,
                    toolHistory,
                },
                aiResult,
            };
        }

        throw new Error(
            `Exceeded maximum MCP tool iterations (${AIServiceManager.MAX_TOOL_ITERATIONS}) while executing task ${task.id}`
        );
    }

    /**
     * Detects a JSON-formatted tool call in the text content.
     * Supports format: { "tool": "tool_name", "parameters": { ... } }
     */
    private detectJsonToolCall(content: string): ToolCall | null {
        try {
            const trimmed = content.trim();
            // Check if it looks like a JSON object
            if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                const parsed = JSON.parse(trimmed);
                if (parsed.tool && typeof parsed.tool === 'string') {
                    return {
                        id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        name: parsed.tool,
                        arguments: parsed.parameters || {},
                    };
                }
            }

            // Also try to find JSON block within markdown code blocks
            const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/;
            const match = trimmed.match(jsonBlockRegex);
            if (match && match[1]) {
                const parsed = JSON.parse(match[1]);
                if (parsed.tool && typeof parsed.tool === 'string') {
                    return {
                        id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        name: parsed.tool,
                        arguments: parsed.parameters || {},
                    };
                }
            }
        } catch (e) {
            // Not valid JSON or not a tool call, ignore
        }
        return null;
    }

    private async executeToolCallForAI(
        call: ToolCall,
        task: Task,
        options?: AIExecutionOptions
    ): Promise<{ content: string; metadata: Record<string, any> }> {
        const logMCP = (
            level: 'info' | 'warn' | 'error' | 'debug',
            message: string,
            details?: Record<string, any>
        ) => {
            options?.onLog?.(level, message, {
                taskId: task.id,
                ...details,
            });
        };

        const fail = (message: string) => {
            logMCP('error', `[MCP] ${call.name} failed: ${message}`, {
                toolCallId: call.id,
                toolLabel: call.name,
            });
            return {
                content: this.truncateString(
                    JSON.stringify(
                        {
                            success: false,
                            error: message,
                        },
                        null,
                        2
                    )
                ),
                metadata: {
                    success: false,
                    error: message,
                    toolLabel: call.name,
                    toolName: call.name,
                },
            };
        };

        const separatorIndex = call.name.indexOf('_');
        if (separatorIndex === -1) {
            return fail('Unable to determine MCP name from tool identifier');
        }

        const mcpIdentifier = this.normalizeMCPIdentifier(call.name.slice(0, separatorIndex));
        const toolName = call.name.slice(separatorIndex + 1);
        const args = call.arguments || {};
        const mcpManager = this.getMCPManager();
        if (!mcpManager) {
            return fail('MCP manager is not available in this environment');
        }

        try {
            const mcp =
                (await mcpManager.findMCPByName(mcpIdentifier)) ||
                (await mcpManager.findMCPByName(call.name.slice(0, separatorIndex)));
            if (!mcp) {
                return fail(`MCP '${mcpIdentifier}' is not registered or enabled`);
            }

            logMCP('info', `[MCP] Executing ${call.name}`, {
                toolCallId: call.id,
                toolLabel: call.name,
                toolName,
                mcpName: mcp.name,
                parameters: args,
            });

            let execution;
            try {
                execution = await mcpManager.executeMCPTool(mcp.id, toolName, args, {
                    taskId: task.id,
                    projectId: task.projectId,
                    source: 'ai-service',
                });
            } catch (error) {
                if (isMCPPermissionError(error)) {
                    throw error;
                }
                return fail((error as Error).message);
            }

            if (execution.success) {
                const content = this.formatToolResponseData(execution.data);
                logMCP('info', `[MCP] ${call.name} succeeded`, {
                    toolCallId: call.id,
                    toolLabel: call.name,
                    toolName,
                    mcpName: mcp.name,
                    executionTime: execution.executionTime,
                    dataPreview: this.truncateString(content, 400),
                });
                return {
                    content,
                    metadata: {
                        success: true,
                        executionTime: execution.executionTime,
                        toolLabel: call.name,
                        mcpName: mcp.name,
                        toolName,
                    },
                };
            }

            const errorPayload = this.truncateString(
                JSON.stringify(
                    {
                        success: false,
                        error: execution.error?.message || 'Tool execution failed',
                        details: execution.error?.details,
                    },
                    null,
                    2
                )
            );
            logMCP('warn', `[MCP] ${call.name} reported failure`, {
                toolCallId: call.id,
                toolLabel: call.name,
                toolName,
                mcpName: mcp.name,
                executionTime: execution.executionTime,
                error: execution.error?.message,
            });
            return {
                content: errorPayload,
                metadata: {
                    success: false,
                    executionTime: execution.executionTime,
                    toolLabel: call.name,
                    mcpName: mcp.name,
                    toolName,
                    error: execution.error?.message,
                },
            };
        } catch (error) {
            if (isMCPPermissionError(error)) {
                throw error;
            }
            logMCP('error', `[MCP] ${call.name} threw error: ${(error as Error).message}`, {
                toolCallId: call.id,
                toolLabel: call.name,
                toolName,
                error: (error as Error).message,
            });
            return fail((error as Error).message);
        }
    }

    private formatToolResponseData(data: any): string {
        if (data === undefined || data === null) {
            return 'null';
        }
        if (typeof data === 'string') {
            return this.truncateString(data);
        }
        return this.truncateString(JSON.stringify(data, null, 2));
    }

    private cleanAIResponse(content: string): string {
        // Remove markdown code blocks
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch?.[1]) {
            return jsonMatch[1].trim();
        }
        return content.trim();
    }

    private truncateString(
        value: string,
        limit: number = AIServiceManager.TOOL_RESULT_CHAR_LIMIT
    ): string {
        if (!value) return '';
        if (value.length <= limit) {
            return value;
        }
        return `${value.slice(0, limit)}\n... (truncated ${value.length - limit} characters)`;
    }

    /**
     * Execute with fallback providers
     */
    private async executeWithFallback(
        task: Task,
        context: ExecutionContext,
        options: AIExecutionOptions,
        startTime: number
    ): Promise<AIExecutionResult> {
        const fallbacks = options.fallbackProviders || this.getEnabledProviderIds();

        for (const fallbackProvider of fallbacks) {
            try {
                console.log(`Trying fallback provider: ${fallbackProvider}`);

                const modifiedTask = {
                    ...task,
                    aiProvider: fallbackProvider,
                    aiModel: DEFAULT_MODELS[fallbackProvider],
                };

                const result = await this.executeTask(modifiedTask as Task, context, {
                    ...options,
                    fallbackProviders: [], // Don't recurse
                });

                if (result.success) {
                    return {
                        ...result,
                        metadata: {
                            ...result.metadata,
                            usedFallback: true,
                            originalProvider: task.aiProvider,
                        },
                    };
                }
            } catch (error) {
                console.error(`Fallback provider ${fallbackProvider} failed:`, error);
            }
        }

        // All fallbacks failed
        return {
            success: false,
            content: '',
            tokensUsed: { prompt: 0, completion: 0, total: 0 },
            cost: 0,
            duration: Date.now() - startTime,
            provider: (task.aiProvider as AIProvider) || 'anthropic',
            model: (task.aiModel as AIModel) || DEFAULT_MODELS.anthropic,
            finishReason: 'error',
            error: new Error('All providers failed'),
            metadata: { allFallbacksFailed: true },
        };
    }

    /**
     * Cancel an active execution
     */
    cancelExecution(taskId: number): boolean {
        for (const [key, controller] of this.activeExecutions) {
            if (key.includes(`exec-${taskId}-`)) {
                controller.abort();
                this.activeExecutions.delete(key);
                return true;
            }
        }
        return false;
    }

    /**
     * Check if a task execution is active
     */
    isExecutionActive(taskId: number): boolean {
        for (const key of this.activeExecutions.keys()) {
            if (key.includes(`exec-${taskId}-`)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get available providers
     */
    getAvailableProviders(): AIProvider[] {
        return this.providerFactory.getAvailableProviders();
    }

    /**
     * Check if a provider is available
     */
    isProviderAvailable(provider: AIProvider): boolean {
        return this.providerFactory.isProviderAvailable(provider);
    }

    /**
     * Estimate cost for a task
     */
    async estimateCost(task: Task): Promise<number> {
        const provider = this.resolveProvider(task.aiProvider as AIProvider | null);
        const model = this.resolveModel(provider, task.aiModel as AIModel | null);
        const prompt = this.buildPrompt(task);

        const providerInstance = await this.providerFactory.getProvider(provider);
        const promptTokens = providerInstance.estimateTokens(prompt);

        // Estimate completion tokens as 2x prompt tokens (rough estimate)
        const estimatedCompletionTokens = promptTokens * 2;

        return providerInstance.calculateCost(
            { prompt: promptTokens, completion: estimatedCompletionTokens },
            model
        );
    }

    // ========================================
    // Private Helper Methods
    // ========================================

    private resolveProvider(taskProvider: AIProvider | null): AIProvider {
        const enabledProviderIds = this.getEnabledProviderIds();

        // 1. taskProvider가 연동된 목록에 있는지 확인
        if (
            taskProvider &&
            enabledProviderIds.includes(taskProvider) &&
            this.providerFactory.isProviderAvailable(taskProvider)
        ) {
            return taskProvider;
        }

        // 2. taskProvider가 연동 목록에 없으면 첫 번째 연동된 Provider 사용
        for (const providerId of enabledProviderIds) {
            if (this.providerFactory.isProviderAvailable(providerId)) {
                return providerId;
            }
        }

        // 3. Fallback to anthropic (기본값)
        return 'anthropic';
    }

    private resolveModel(provider: AIProvider, taskModel: AIModel | null): AIModel {
        if (taskModel) {
            return taskModel;
        }

        // 연동된 Provider에서 defaultModel 찾기
        const enabledProvider = this.enabledProviders.find((p) => p.id === provider);
        if (enabledProvider?.defaultModel) {
            return enabledProvider.defaultModel as AIModel;
        }

        return DEFAULT_MODELS[provider] || (DEFAULT_MODELS.anthropic as AIModel);
    }

    private async buildAIConfig(
        task: Task,
        model: AIModel,
        mcpContext: MCPContextInsight[] = [],
        requiredMCPs: string[] = []
    ): Promise<AIConfig> {
        // Collect MCP tool definitions
        const tools = await this.collectMCPTools(task, requiredMCPs);

        const config: AIConfig = {
            model,
            temperature: (task as any).aiTemperature ?? 0.7,
            maxTokens: (task as any).aiMaxTokens ?? 4096,
            systemPrompt: this.buildSystemPrompt(task, mcpContext),
            responseFormat: (task as any).outputFormat === 'json' ? 'json' : undefined,
        };

        // Add tools if any MCP tools are available
        if (tools && tools.length > 0) {
            console.log(
                `[MCP Tools] Adding ${tools.length} MCP tools to AI config:`,
                tools.map((t) => t.name)
            );
            config.tools = tools;
            config.toolChoice = 'auto'; // Let AI decide when to use tools
        } else {
            console.log('[MCP Tools] No MCP tools available for this task');
        }

        return config;
    }

    /**
     * Collect MCP tool definitions for function calling
     */
    private async collectMCPTools(
        task: Task,
        requiredMCPs: string[]
    ): Promise<MCPToolDefinition[]> {
        if (!requiredMCPs || requiredMCPs.length === 0) {
            return [];
        }

        const mcpManager = this.getMCPManager();
        if (!mcpManager) {
            return [];
        }

        const allTools: MCPToolDefinition[] = [];

        for (const mcpName of requiredMCPs) {
            try {
                const mcp = await mcpManager.findMCPByName(mcpName);
                if (!mcp) {
                    console.warn(`[MCP Tools] MCP not found: ${mcpName}`);
                    continue;
                }

                console.log(`[MCP Tools] Collecting tools from MCP: ${mcpName} (ID: ${mcp.id})`);
                let tools: MCPToolDefinition[] = [];
                try {
                    tools = (await mcpManager.listTools(mcp.id, {
                        taskId: task.id,
                    })) as MCPToolDefinition[];
                    console.log(
                        `[MCP Tools] Found ${tools.length} tools in ${mcpName}:`,
                        tools.map((t) => t.name)
                    );
                } catch (error) {
                    console.warn(
                        `[MCP Tools] Failed to list tools for MCP ${mcpName} (ID: ${mcp.id}):`,
                        error
                    );
                    continue;
                }

                // Prefix tool names with MCP name for identification
                const prefixedTools = tools.map((tool) => ({
                    ...tool,
                    name: `${mcpName}_${tool.name}`,
                    description: `[${mcpName}] ${tool.description}`,
                }));

                allTools.push(...prefixedTools);
            } catch (error) {
                console.error(`[MCP Tools] Failed to collect tools from ${mcpName}:`, error);
            }
        }

        console.log(
            `[MCP Tools] ✓ Successfully collected ${allTools.length} MCP tools from ${requiredMCPs.length} MCPs`
        );
        if (allTools.length > 0) {
            console.log(
                '[MCP Tools] Tool details:',
                allTools.map((t) => ({ name: t.name, description: t.description }))
            );
        }
        return allTools;
    }

    private buildSystemPrompt(task: Task, mcpContext: MCPContextInsight[] = []): string {
        let systemPrompt = `You are an AI assistant helping to complete the following task.

## Task Information
- Title: ${task.title}
- Priority: ${task.priority}
- Status: ${task.status}
`;

        if ((task as any).contextFromParent) {
            systemPrompt += `\n## Context from Parent Task\n${(task as any).contextFromParent}\n`;
        }

        if ((task as any).acceptanceCriteria) {
            systemPrompt += `\n## Acceptance Criteria\n${(task as any).acceptanceCriteria}\n`;
        }

        if (task.requiredMCPs && task.requiredMCPs.length > 0) {
            systemPrompt += `\n## Required MCP Integrations\n${task.requiredMCPs
                .map((mcp) => `- ${mcp}`)
                .join('\n')}\n`;
        }

        const toolDirective = this.buildToolUsageDirective(task.requiredMCPs);
        if (toolDirective) {
            systemPrompt += `\n## Tool Usage Requirements\n${toolDirective}\n`;
        }

        if (mcpContext && mcpContext.length > 0) {
            systemPrompt += `\n## MCP Context Data\n`;
            for (const insight of mcpContext) {
                systemPrompt += `### ${insight.name}\n`;
                if (insight.description) {
                    systemPrompt += `- Description: ${insight.description}\n`;
                }
                if (insight.recommendedTools?.length) {
                    systemPrompt += `- Recommended tools:\n${insight.recommendedTools
                        .map((tool) => `  - ${tool}`)
                        .join('\n')}\n`;
                }
                if (insight.sampleOutput) {
                    systemPrompt += `- Sample output:\n${insight.sampleOutput}\n`;
                }
                if (insight.error) {
                    systemPrompt += `- Warning: ${insight.error}\n`;
                }
                if (insight.userContext && Object.keys(insight.userContext).length > 0) {
                    systemPrompt += `- User-provided context: ${JSON.stringify(
                        insight.userContext
                    )}\n`;
                }
                if (insight.envOverrides?.length) {
                    systemPrompt += `- Custom environment variables: ${insight.envOverrides.join(
                        ', '
                    )}\n`;
                }
            }
            systemPrompt += `\nLeverage the MCP context above to ground your response. If additional MCP tool output is needed, clearly specify which tool and parameters you require.\n`;
        }

        systemPrompt += `
## Instructions
- Provide clear, actionable responses
- If code is requested, include proper formatting
- Consider the task priority and requirements
- Be concise but thorough

## Output Format
You must respond with valid JSON only. Do not include any markdown formatting, code blocks, or explanatory text outside the JSON object.
`;

        return systemPrompt;
    }

    private buildPrompt(task: Task, mcpContext: MCPContextInsight[] = []): string {
        let prompt = task.description || task.title;

        if ((task as any).aiPrompt) {
            prompt = (task as any).aiPrompt;
        }

        if (mcpContext && mcpContext.length > 0) {
            prompt += `\n\n## MCP Insights\n`;
            for (const insight of mcpContext) {
                prompt += `### ${insight.name}\n`;
                if (insight.sampleOutput) {
                    prompt += `${insight.sampleOutput}\n`;
                } else if (insight.recommendedTools?.length) {
                    prompt += `${insight.recommendedTools.join('\n')}\n`;
                } else if (insight.error) {
                    prompt += `Unable to fetch context (${insight.error}). Outline the MCP steps you would take.\n`;
                }
                if (insight.userContext && Object.keys(insight.userContext).length > 0) {
                    prompt += `User context: ${JSON.stringify(insight.userContext)}\n`;
                }
                if (insight.envOverrides?.length) {
                    prompt += `Environment variables already configured: ${insight.envOverrides.join(
                        ', '
                    )}\n`;
                }
            }
        }

        return prompt;
    }

    private buildToolUsageDirective(required: string[] = []): string {
        if (!required || required.length === 0) {
            return '';
        }

        const canonicalRequired = required
            .map((req) => this.normalizeMCPIdentifier(req))
            .filter(Boolean);

        if (canonicalRequired.length === 0) {
            return '';
        }

        const directives: string[] = [
            '- Always consult the provided MCP tools before giving a final answer. Never fabricate data; base your conclusions on tool output.',
        ];

        if (canonicalRequired.includes('slack')) {
            directives.push(
                '- For Slack-related questions, you must call the Slack MCP history tools (e.g., list channel messages) to fetch the requested data such as channel transcripts before summarizing. Do not provide instructions or sample code for Slack APIs; provide the actual summarized result from the tool output.'
            );
        }

        return directives.join('\n');
    }

    private buildAIContext(
        task: Task,
        context: ExecutionContext,
        mcpContext: MCPContextInsight[] = []
    ): AIExecutionContext {
        return {
            taskId: task.id,
            projectId: task.projectId,
            userId: context.userId,
            previousExecutions: context.previousResults?.map((r) => ({
                prompt: String(r.output?.prompt || ''),
                response: String(r.output?.content || ''),
                success: r.status === 'success',
            })),
            metadata: {
                ...(context.metadata || {}),
                requiredMCPs: task.requiredMCPs || [],
                mcpContext,
            },
        };
    }

    private logPromptEvent(
        task: Task,
        provider: AIProvider,
        model: AIModel,
        prompt: string,
        systemPrompt: string | undefined,
        mcpContext: MCPContextInsight[],
        options: AIExecutionOptions
    ): void {
        const truncate = (text: string, limit = 6000) =>
            text && text.length > limit ? `${text.slice(0, limit)}\n...[truncated]` : text;

        eventBus.emit<AIPromptGeneratedEvent>(
            'ai.prompt_generated',
            {
                taskId: task.id,
                projectId: task.projectId,
                provider,
                model,
                prompt: truncate(prompt),
                systemPrompt: truncate(systemPrompt || ''),
                requiredMCPs: task.requiredMCPs || [],
                streaming: options.streaming ?? false,
                metadata: {
                    mcpContext: mcpContext.map((ctx) => ({
                        name: ctx.name,
                        description: ctx.description,
                        recommendedTools: ctx.recommendedTools,
                        error: ctx.error,
                        sampleOutput: ctx.sampleOutput
                            ? truncate(ctx.sampleOutput, 2000)
                            : undefined,
                    })),
                },
            },
            'ai-service'
        );

        options.onLog?.(
            'info',
            `[AI] Prompt prepared for task #${task.id} (${provider}/${model}): ${this.truncateString(prompt, 200)}`,
            {
                taskId: task.id,
                projectId: task.projectId,
                provider,
                model,
                prompt,
                systemPrompt,
                requiredMCPs: task.requiredMCPs || [],
                mcpContext,
            }
        );
    }

    /**
     * Detect relevant MCPs from task prompt and description
     * Analyzes the content to automatically identify which enabled MCPs should be used
     */
    private async detectRelevantMCPs(
        task: Task,
        onLog?: (level: 'info' | 'warn' | 'error' | 'debug', message: string, details?: any) => void
    ): Promise<string[]> {
        if (!this.autoDetectMCPsEnabled) {
            onLog?.('debug', '[MCP Detection] Auto-detection disabled. Skipping detection.');
            return [];
        }

        console.log('[MCP Detection] Detect relevant MCPs start.');
        const mcpManager = this.getMCPManager();
        if (!mcpManager) {
            console.log('[MCP Detection] MCP Manager not available.');
            onLog?.('warn', '[MCP Detection] MCP Manager not available');
            return [];
        }

        try {
            console.log('[MCP Detection] Detect relevant MCPs try.');
            // Get all available (enabled) MCPs
            let availableMCPs: MCPIntegration[] | undefined = (await mcpManager.listMCPs()) as
                | MCPIntegration[]
                | undefined;
            console.log('[MCP Detection] Detect relevant MCPs listMCPs:', availableMCPs);
            if (!availableMCPs || availableMCPs.length === 0) {
                console.log(
                    '[MCP Detection] No MCPs found via listMCPs, attempting discoverMCPs...'
                );
                availableMCPs = (await mcpManager.discoverMCPs()) as MCPIntegration[] | undefined;
            }
            if (!availableMCPs || availableMCPs.length === 0) {
                console.log('[MCP Detection] No available MCPs found');
                onLog?.('info', '[MCP Detection] No available MCPs found');
                return [];
            }

            const normalizedMCPs = availableMCPs;

            console.log(
                `[MCP Detection] Found ${normalizedMCPs.length} available MCPs:`,
                normalizedMCPs.map((m) => m.name)
            );
            onLog?.(
                'info',
                `[MCP Detection] Found ${normalizedMCPs.length} available MCPs: ${normalizedMCPs
                    .map((m) => m.name)
                    .join(', ')}`
            );

            // Combine prompt, description, and title for analysis
            const taskContent = [
                task.title,
                task.description,
                (task as any).aiPrompt,
                (task as any).generatedPrompt,
                (task as any).aiOptimizedPrompt,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            console.log(
                '[MCP Detection] Analyzing task content:',
                taskContent.substring(0, 200) + '...'
            );

            const detectedMCPs: string[] = [];

            // MCP keyword patterns for common services
            const mcpPatterns: Record<string, RegExp[]> = {
                slack: [
                    /slack/i,
                    /슬랙/i,
                    /채널\s*(id|아이디)/i,
                    /메시지.*전송/i,
                    /대화.*요약/i,
                    /C[A-Z0-9]{10}/i, // Slack channel ID pattern
                ],
                github: [
                    /github/i,
                    /깃허브/i,
                    /git\s+repo/i,
                    /저장소/i,
                    /pull request/i,
                    /pr/i,
                    /commit/i,
                ],
                filesystem: [
                    /파일.*읽/i,
                    /파일.*작성/i,
                    /디렉[토토]리/i,
                    /read.*file/i,
                    /write.*file/i,
                    /directory/i,
                    /폴더/i,
                ],
                database: [/데이터베이스/i, /database/i, /db/i, /쿼리/i, /query/i, /sql/i],
                web: [/웹.*검색/i, /web.*search/i, /crawl/i, /크롤/i, /스크랩/i, /scrape/i],
                email: [
                    /이메일/i,
                    /email/i,
                    /메일.*전송/i,
                    /send.*mail/i,
                    /@[a-z0-9.-]+\.[a-z]{2,}/i,
                ],
            };

            // Check each available MCP against patterns
            for (const mcp of normalizedMCPs) {
                const mcpName = mcp.name.toLowerCase();
                const normalizedName = this.normalizeMCPIdentifier(mcpName);
                const mcpSlug = this.normalizeMCPIdentifier(mcp.slug?.toLowerCase() || mcpName);

                console.log(
                    `[MCP Detection] Checking MCP: ${mcp.name} (normalized: ${normalizedName}, slug: ${mcpSlug})`
                );

                // Direct name match (highest priority)
                if (taskContent.includes(mcpName) || taskContent.includes(mcpSlug)) {
                    console.log(`[MCP Detection] ✓ Direct name match for ${mcp.name}`);
                    detectedMCPs.push(mcp.name);
                    continue;
                }

                // Pattern-based detection
                for (const [key, patterns] of Object.entries(mcpPatterns)) {
                    if (normalizedName.includes(key) || mcpSlug.includes(key)) {
                        const matchedPattern = patterns.find((pattern) =>
                            pattern.test(taskContent)
                        );
                        if (matchedPattern) {
                            console.log(
                                `[MCP Detection] ✓ Pattern match for ${mcp.name}: ${key} pattern matched (${matchedPattern})`
                            );
                            detectedMCPs.push(mcp.name);
                            break;
                        } else {
                            console.log(
                                `[MCP Detection] ✗ ${mcp.name} matched key '${key}' but no patterns matched in task content`
                            );
                        }
                    }
                }

                // Check MCP description/tags if available
                if (mcp.description) {
                    const descWords = mcp.description.toLowerCase().split(/\s+/);
                    const taskWords = taskContent.split(/\s+/);
                    const commonWords = descWords.filter((word: string) =>
                        word.length > 3 ? taskWords.includes(word) : false
                    );
                    if (commonWords.length >= 2) {
                        console.log(
                            `[MCP Detection] ✓ Description/tag match for ${mcp.name}: found ${commonWords.length} common words.`
                        );
                        detectedMCPs.push(mcp.name);
                    }
                }
            }

            if (detectedMCPs.length > 0) {
                console.log(
                    `[MCP Detection] ✓ Successfully auto-detected ${detectedMCPs.length} relevant MCPs for task ${task.id}:`,
                    detectedMCPs
                );
                onLog?.(
                    'info',
                    `[MCP Detection] ✓ Successfully auto-detected ${detectedMCPs.length} relevant MCPs: ${detectedMCPs.join(', ')}`
                );
            } else {
                console.log(`[MCP Detection] ✗ No MCPs auto-detected for task ${task.id}`);
                onLog?.('info', `[MCP Detection] ✗ No MCPs auto-detected for task ${task.id}`);
            }

            return detectedMCPs;
        } catch (error) {
            console.error('[AIServiceManager] Failed to detect relevant MCPs:', error);
            return [];
        }
    }

    private async collectRequiredMCPContext(task: Task): Promise<MCPContextInsight[]> {
        const normalizedRequired = (task.requiredMCPs || []) as Array<string | null | undefined>;
        const rawRequired = Array.from(new Set(normalizedRequired));
        const required: string[] = rawRequired.filter(
            (req): req is string => typeof req === 'string' && req.length > 0
        );
        const canonicalRequired: string[] = required.map((req) => this.normalizeMCPIdentifier(req));
        if (required.length === 0) {
            return [];
        }

        const mcpManager = this.getMCPManager();
        if (!mcpManager) {
            return []; // MCP not available in this environment
        }

        const insights: MCPContextInsight[] = [];

        for (let i = 0; i < required.length; i++) {
            const requirement = required[i];
            if (!requirement) {
                continue;
            }
            const slugCandidate = canonicalRequired[i];
            const slug: string =
                (typeof slugCandidate === 'string' && slugCandidate.length > 0
                    ? slugCandidate
                    : this.normalizeMCPIdentifier(requirement)) || requirement;
            try {
                const mcp =
                    ((await mcpManager.findMCPByName(requirement)) as MCPIntegration | null) ||
                    ((await mcpManager.findMCPByName(slug)) as MCPIntegration | null);
                if (!mcp) {
                    insights.push({
                        name: requirement,
                        error: 'MCP server not found. Ensure it is installed and configured.',
                        recommendedTools: this.buildFallbackToolHints(slug, task),
                    });
                    continue;
                }

                const taskConfigEntry =
                    this.getTaskMCPConfigEntry(task, requirement) ||
                    this.getTaskMCPConfigEntry(task, slug) ||
                    this.getTaskMCPConfigEntry(task, mcp.slug || mcp.name || '');
                const userContext =
                    (taskConfigEntry?.context as Record<string, unknown>) || undefined;
                const envOverrideKeys = taskConfigEntry?.env
                    ? Object.keys(taskConfigEntry.env as Record<string, string>)
                    : undefined;

                let tools: MCPToolDefinition[] = [];
                try {
                    tools = (await mcpManager.listTools(mcp.id, {
                        taskId: task.id,
                    })) as MCPToolDefinition[];
                } catch (error) {
                    console.warn(
                        `[AIServiceManager] Failed to list tools for MCP ${mcp.name} (ID: ${mcp.id}):`,
                        error
                    );
                    insights.push({
                        name: mcp.name,
                        description: mcp.description || '',
                        endpoint: mcp.endpoint,
                        recommendedTools: [],
                        error: `Failed to connect to MCP: ${(error as Error).message}`,
                        userContext,
                        envOverrides: envOverrideKeys,
                    });
                    continue;
                }
                const toolSummaries =
                    tools.length > 0
                        ? tools
                              .slice(0, 5)
                              .map(
                                  (tool) => `${tool.name}: ${tool.description || 'No description'}`
                              )
                        : this.buildFallbackToolHints(slug, task);

                let sampleOutput: string | undefined;
                const specializedCall = this.getSpecializedMCPCall(slug, task, tools);
                if (specializedCall) {
                    try {
                        const sample = await mcpManager.executeMCPTool(
                            mcp.id,
                            specializedCall.name,
                            specializedCall.params,
                            {
                                taskId: task.id,
                                projectId: task.projectId,
                                source: 'ai-service',
                            }
                        );
                        if (sample.success && sample.data) {
                            sampleOutput = this.formatToolResponseData(sample.data);
                        }
                    } catch (error) {
                        insights.push({
                            name: mcp.name,
                            description: mcp.description || '',
                            endpoint: mcp.endpoint,
                            recommendedTools: toolSummaries,
                            error: (error as Error).message,
                            userContext,
                            envOverrides: envOverrideKeys,
                        });
                        continue;
                    }
                }

                const summaryTool = tools.find((tool) =>
                    /summary|context|describe|overview/i.test(tool.name)
                );
                if (!sampleOutput && summaryTool) {
                    try {
                        const sample = await mcpManager.executeMCPTool(
                            mcp.id,
                            summaryTool.name,
                            {
                                query: `${task.title}\n${task.description || ''}`.slice(0, 500),
                                projectId: task.projectId,
                                taskId: task.id,
                            },
                            {
                                taskId: task.id,
                                projectId: task.projectId,
                                source: 'ai-service',
                            }
                        );
                        if (sample.success && sample.data) {
                            sampleOutput = this.formatToolResponseData(sample.data);
                        }
                    } catch (error) {
                        insights.push({
                            name: mcp.name,
                            description: mcp.description || '',
                            endpoint: mcp.endpoint,
                            recommendedTools: toolSummaries,
                            error: (error as Error).message,
                            userContext,
                            envOverrides: envOverrideKeys,
                        });
                        continue;
                    }
                }
                // If no summary tool or summary failed, attempt a default heuristic call
                if (!sampleOutput) {
                    const defaultCall = this.getDefaultMCPToolCall(slug, task, tools);
                    if (defaultCall) {
                        try {
                            const sample = await mcpManager.executeMCPTool(
                                mcp.id,
                                defaultCall.name,
                                defaultCall.params,
                                {
                                    taskId: task.id,
                                    projectId: task.projectId,
                                    source: 'ai-service',
                                }
                            );
                            if (sample.success && sample.data) {
                                sampleOutput = this.formatToolResponseData(sample.data);
                            }
                        } catch (error) {
                            insights.push({
                                name: mcp.name,
                                description: mcp.description || '',
                                endpoint: mcp.endpoint,
                                recommendedTools: toolSummaries,
                                error: (error as Error).message,
                                userContext,
                                envOverrides: envOverrideKeys,
                            });
                            continue;
                        }
                    }
                }

                insights.push({
                    name: mcp.name,
                    description: mcp.description || '',
                    endpoint: mcp.endpoint,
                    recommendedTools: toolSummaries,
                    sampleOutput,
                    userContext,
                    envOverrides: envOverrideKeys,
                });
            } catch (error) {
                insights.push({
                    name: requirement,
                    error: (error as Error).message,
                    recommendedTools: this.buildFallbackToolHints(slug, task),
                });
            }
        }

        return insights;
    }

    private normalizeExplicitRequiredMCPs(required?: string[] | null): string[] {
        if (!Array.isArray(required)) {
            return [];
        }
        const seen = new Set<string>();
        const normalized: string[] = [];
        for (const entry of required) {
            if (typeof entry !== 'string') continue;
            const trimmed = entry.trim();
            if (!trimmed) continue;
            const key = trimmed.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            normalized.push(trimmed);
        }
        return normalized;
    }

    private buildFallbackToolHints(mcpName: string, task: Task): string[] {
        const fallback: Record<string, string[]> = {
            filesystem: [
                'read_file(path): Inspect specific files relevant to the task.',
                'list_directory(path, depth): Understand project structure before editing files.',
                'search(pattern): Locate references inside the repository.',
            ],
            git: [
                'list_commits(limit): Review recent changes for context.',
                'diff(ref1, ref2): Inspect modifications between branches.',
                'create_branch(name): Prepare an isolated workspace for your changes.',
            ],
            slack: [
                'list_channels(): Identify appropriate communication channels.',
                'post_message(channel, text): Share progress updates or request clarification.',
            ],
            postgres: [
                'describe_table(table): Understand schema before writing queries.',
                'run_query(sql): Validate assumptions with live data.',
            ],
            'google-drive': [
                'list_files(folderId): Discover shared assets or specs.',
                'download_file(fileId): Pull latest design docs before implementation.',
            ],
        };

        const normalized = this.normalizeMCPIdentifier(mcpName);
        return (
            fallback[normalized] || [
                `No tool metadata available for ${mcpName}. Describe how you would leverage this MCP to progress the task "${task.title}".`,
            ]
        );
    }

    private getDefaultMCPToolCall(
        slug: string,
        task: Task,
        tools: MCPToolDefinition[]
    ): { name: string; params: Record<string, any> } | null {
        const toolByName = (name: string) =>
            tools.find((tool) => tool.name?.toLowerCase() === name.toLowerCase());

        const canonical = this.normalizeMCPIdentifier(slug);

        switch (canonical) {
            case 'slack': {
                const taskText = `${task.title} ${task.description || ''}`.toLowerCase();
                const wantsChannels =
                    taskText.includes('채널') ||
                    taskText.includes('channel') ||
                    taskText.includes('message');

                if (wantsChannels) {
                    const tool = toolByName('list_channels') || tools[0];
                    if (tool) {
                        return { name: tool.name, params: { limit: 20 } };
                    }
                }
                break;
            }
            case 'filesystem': {
                const tool = toolByName('list_directory') || tools[0];
                if (tool) {
                    return {
                        name: tool.name,
                        params: {
                            path: task.generatedPrompt?.includes('/src') ? '/src' : '.',
                            depth: 2,
                        },
                    };
                }
                break;
            }
            case 'git':
            case 'github':
            case 'gitlab': {
                const tool = toolByName('list_repos') || toolByName('list_branches') || tools[0];
                if (tool) {
                    return { name: tool.name, params: {} };
                }
                break;
            }
            default:
                break;
        }

        return null;
    }

    private getSpecializedMCPCall(
        slug: string,
        task: Task,
        tools: MCPToolDefinition[]
    ): { name: string; params: Record<string, any> } | null {
        const canonical = this.normalizeMCPIdentifier(slug);
        switch (canonical) {
            case 'slack':
                return this.buildSlackHistoryCall(task, tools);
            default:
                return null;
        }
    }

    private buildSlackHistoryCall(
        task: Task,
        tools: MCPToolDefinition[]
    ): { name: string; params: Record<string, any> } | null {
        const hints = this.extractSlackHistoryHints(task);
        if (!hints.channelId && !hints.channelName) {
            return null;
        }

        const historyTool =
            tools.find((tool) => /history|messages|conversation|fetch/i.test(tool.name || '')) ||
            tools.find((tool) => this.hasSlackChannelParams(tool));
        if (!historyTool) {
            return null;
        }

        const params = this.buildSlackToolParameters(historyTool, hints);
        if (!params) {
            return null;
        }

        return { name: historyTool.name, params };
    }

    private buildSlackToolParameters(
        tool: MCPToolDefinition,
        hints: SlackHistoryHints
    ): Record<string, any> | null {
        const properties = tool.parameters?.properties || {};
        const required = tool.parameters?.required || [];
        const params: Record<string, any> = {};

        const channelKey = this.findMatchingPropertyKey(properties, [
            'channelid',
            'channel',
            'channel_name',
            'conversation',
            'conversationid',
        ]);
        if (channelKey) {
            params[channelKey] = hints.channelId || hints.channelName;
        }

        const limitKey = this.findMatchingPropertyKey(properties, [
            'limit',
            'count',
            'maxmessages',
        ]);
        if (limitKey && hints.limit) {
            params[limitKey] = hints.limit;
        }

        const startKey = this.findMatchingPropertyKey(properties, [
            'oldest',
            'start',
            'starttime',
            'since',
            'from',
        ]);
        if (startKey && hints.oldestISO) {
            params[startKey] = hints.oldestISO;
        }

        const endKey = this.findMatchingPropertyKey(properties, [
            'latest',
            'end',
            'endtime',
            'until',
            'to',
        ]);
        if (endKey && hints.latestISO) {
            params[endKey] = hints.latestISO;
        }

        // Ensure required fields are populated
        if (required.some((key) => params[key] === undefined)) {
            return null;
        }

        return Object.keys(params).length > 0 ? params : null;
    }

    private hasSlackChannelParams(tool: MCPToolDefinition): boolean {
        const properties = tool.parameters?.properties || {};
        return Object.keys(properties).some((key) =>
            /channel|conversation|thread/i.test(key.toLowerCase())
        );
    }

    private extractSlackHistoryHints(task: Task): SlackHistoryHints {
        const text = [
            task.title,
            task.description,
            (task as any).aiPrompt,
            (task as any).aiOptimizedPrompt,
        ]
            .filter(Boolean)
            .join(' ');

        const channelIdMatch = text.match(/C[A-Z0-9]{8,}/i);
        const channelNameMatch = text.match(/#([a-z0-9_-]{2,})/i);
        const hints: SlackHistoryHints = {
            channelId: channelIdMatch ? channelIdMatch[0].toUpperCase() : undefined,
            channelName: channelNameMatch ? channelNameMatch[1] : undefined,
            limit: this.extractSlackLimit(text) || 200,
        };

        const timeframe = this.extractSlackTimeframe(text);
        if (timeframe.oldestISO) {
            hints.oldestISO = timeframe.oldestISO;
        }
        if (timeframe.latestISO) {
            hints.latestISO = timeframe.latestISO;
        }

        return hints;
    }

    private extractSlackLimit(text: string): number | undefined {
        const match = text.match(/최근\s*(\d+)\s*(?:개|건|messages?)/i);
        if (match) {
            return Number(match[1]);
        }
        return undefined;
    }

    private extractSlackTimeframe(text: string): { oldestISO?: string; latestISO?: string } {
        const now = Date.now();
        const lower = text.toLowerCase();
        const units: Record<string, number> = {
            시간: 1 / 24,
            시간대: 1 / 24,
            일: 1,
            주: 7,
            주일: 7,
            달: 30,
            개월: 30,
        };
        const isUnitKey = (label: string): label is keyof typeof units =>
            Object.prototype.hasOwnProperty.call(units, label);

        let days: number | undefined;
        const regex = /최근\s*(\d+)\s*(시간|시간대|일|주일|주|달|개월)/i;
        const match = text.match(regex);
        if (match) {
            const value = Number(match[1]);
            const unitLabel = match[2];
            if (unitLabel && isUnitKey(unitLabel)) {
                const multiplier = units[unitLabel];
                days = value * (multiplier ?? 1);
            } else {
                days = value;
            }
        } else if (lower.includes('최근 일주일') || lower.includes('최근 한주')) {
            days = 7;
        } else if (lower.includes('최근 한달') || lower.includes('최근 한 달')) {
            days = 30;
        } else if (lower.includes('최근 하루') || lower.includes('최근 24시간')) {
            days = 1;
        }

        if (days && days > 0) {
            const oldest = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
            return { oldestISO: oldest };
        }

        return {};
    }

    private findMatchingPropertyKey(
        properties: Record<string, any>,
        candidates: string[]
    ): string | undefined {
        const normalizedCandidates = candidates.map((candidate) =>
            candidate.replace(/[^a-z0-9]/gi, '').toLowerCase()
        );
        for (const key of Object.keys(properties || {})) {
            const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
            if (normalizedCandidates.some((candidate) => normalizedKey.includes(candidate))) {
                return key;
            }
        }
        return undefined;
    }

    private normalizeMCPIdentifier(identifier?: string): string {
        if (!identifier) {
            return '';
        }
        return identifier.replace(MCP_SUFFIX_PATTERN, '').trim().toLowerCase();
    }

    private getTaskMCPConfigEntry(
        task: Task,
        identifier: string
    ): MCPConfig[keyof MCPConfig] | undefined {
        const config = (task.mcpConfig as MCPConfig | null) || null;
        if (!config) {
            return undefined;
        }
        if (config[identifier]) {
            return config[identifier];
        }
        const normalized = this.normalizeMCPIdentifier(identifier);
        if (normalized && config[normalized]) {
            return config[normalized];
        }
        return undefined;
    }
}

// Export singleton instance
export const aiServiceManager = new AIServiceManager();
