/**
 * AI Service Manager
 *
 * Centralized manager for AI provider selection, execution, and fallback handling.
 * Integrates with AdvancedTaskExecutor for workflow execution.
 */

// Polyfill process for browser environment to prevent Slack SDK crash
if (typeof window !== 'undefined' && !window.process) {
    (window as any).process = { env: {}, version: '' };
}

import type { Task, MCPIntegration, MCPConfig, ImageGenerationConfig } from '@core/types/database';
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
    ModelInfo,
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
    signal?: AbortSignal;
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
    envVars?: Record<string, string>;
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
    google: 'gemini-2.5-pro',
    groq: 'llama-3.3-70b-versatile',
    'claude-code': 'claude-3-5-sonnet-20250219',
    antigravity: 'antigravity-pro',
    codex: 'codex-latest',
    local: 'gpt-3.5-turbo',
    lmstudio: 'local-model',
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
    private static instance: AIServiceManager;

    public static getInstance(): AIServiceManager {
        if (!AIServiceManager.instance) {
            AIServiceManager.instance = new AIServiceManager();
        }
        return AIServiceManager.instance;
    }

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
     * @param providers 연동된 Provider 목록
     * @param shouldFetchModels 모델 목록을 즉시 fetch할지 여부 (기본값: false)
     */
    setEnabledProviders(
        providers: EnabledProviderInfo[],
        shouldFetchModels: boolean = false
    ): void {
        this.enabledProviders = providers;
        this.applyProviderConfigurations();

        // Fetch models only if explicitly requested (e.g., from settings page, not from task execution)
        if (shouldFetchModels) {
            this.fetchModelsForEnabledProviders();
        }
    }

    /**
     * Fetch models for all enabled providers
     * Called when providers are configured or on manual refresh request
     */
    async fetchModelsForEnabledProviders(): Promise<void> {
        if (this.enabledProviders.length === 0) {
            console.log('[AIServiceManager] No enabled providers to fetch models for');
            return;
        }

        console.log(
            '[AIServiceManager] Fetching models for enabled providers:',
            this.enabledProviders.map((p) => p.id)
        );

        // Import model cache service
        const { modelCache } = await import('../ai/AIModelCacheService');

        for (const provider of this.enabledProviders) {
            if (!provider.id || !provider.apiKey) continue;

            try {
                const providerInstance = await this.providerFactory.getProvider(
                    provider.id as AIProvider
                );
                if (providerInstance && typeof providerInstance.fetchModels === 'function') {
                    // Set API key if provider supports it
                    if (typeof (providerInstance as any).setApiKey === 'function') {
                        (providerInstance as any).setApiKey(provider.apiKey);
                    }

                    // Register provider's fetch function with cache
                    modelCache.registerProvider(provider.id as AIProvider, () =>
                        providerInstance.fetchModels()
                    );

                    // Fetch models (will cache automatically)
                    const models = await modelCache.refreshModels(provider.id as AIProvider);

                    // Update provider's dynamic models
                    if (models.length > 0) {
                        providerInstance.setDynamicModels(models);
                        console.log(
                            `[AIServiceManager] Fetched ${models.length} models for ${provider.id}`
                        );
                    }
                }
            } catch (error) {
                console.warn(
                    `[AIServiceManager] Failed to fetch models for ${provider.id}:`,
                    error
                );
            }
        }
    }

    /**
     * Get available models for a specific provider (with caching)
     */
    async getModelsForProvider(providerId: AIProvider): Promise<ModelInfo[]> {
        const { modelCache } = await import('../ai/AIModelCacheService');
        return modelCache.getModels(providerId);
    }

    /**
     * Manually refresh models for a provider
     * Called when user requests model refresh from UI
     */
    async refreshProviderModels(providerId: AIProvider, apiKey?: string): Promise<ModelInfo[]> {
        console.log(`[AIServiceManager] refreshProviderModels called for ${providerId}`);
        const { modelCache } = await import('../ai/AIModelCacheService');

        // Ensure provider is registered before refreshing
        try {
            console.log(`[AIServiceManager] Getting provider instance for ${providerId}`);
            const providerInstance = await this.providerFactory.getProvider(providerId);

            if (providerInstance && typeof providerInstance.fetchModels === 'function') {
                // Update API key if provided
                if (apiKey && 'setApiKey' in providerInstance) {
                    (providerInstance as any).setApiKey(apiKey);
                }

                console.log(`[AIServiceManager] Registering provider ${providerId}`);
                modelCache.registerProvider(providerId, () => providerInstance.fetchModels());
            } else {
                console.warn(
                    `[AIServiceManager] Cannot refresh models for ${providerId}: Provider instance or fetchModels not found`
                );
            }
        } catch (err) {
            console.error(
                `[AIServiceManager] Error retrieving provider instance for ${providerId}:`,
                err
            );
        }

        console.log(`[AIServiceManager] Calling modelCache.refreshModels for ${providerId}`);
        return modelCache.refreshModels(providerId);
    }

    /**
     * Refresh models for all providers
     * Called when user requests full refresh from UI
     */
    async refreshAllProviderModels(): Promise<void> {
        const { modelCache } = await import('../ai/AIModelCacheService');
        await modelCache.refreshAllProviders();
    }

    private applyProviderConfigurations(): void {
        if (!this.enabledProviders || this.enabledProviders.length === 0) {
            return;
        }
        for (const provider of this.enabledProviders) {
            if (!provider.id) continue;
            const hasConfig = provider.baseUrl || provider.apiKey || provider.defaultModel;
            if (hasConfig) {
                this.providerFactory.configureProvider(provider.id as AIProvider, {
                    baseUrl: provider.baseUrl,
                    apiKey: provider.apiKey,
                    defaultModel: provider.defaultModel,
                });
            }
        }
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

        if (options.signal) {
            options.signal.addEventListener('abort', () => {
                abortController.abort();
            });
        }

        const mcpManager = this.getMCPManager();

        // [Feature: MCP Config Inheritance]
        // If an MCP requires specific configuration (e.g. environment variables) and is enabled in the task,
        // we should try to inherit configuration from the Project Level if the Task Level config is missing.
        const projectMcpConfig = context.metadata?.projectMcpConfig as MCPConfig | undefined;
        let effectiveMcpConfig: MCPConfig = task.mcpConfig || {};

        if (projectMcpConfig) {
            // Merge logic: Project Config acts as a base, Task Config overrides it.
            // However, we only care about keys that are relevant to this task (though merging all is safe).
            effectiveMcpConfig = {
                ...projectMcpConfig,
                ...effectiveMcpConfig,
            };

            // Deep merge for nested objects if necessary (e.g. env vars)?
            // For now, simple spread merges the Server Config Entry level.
            // If task defines 'slack', it completely overwrites project 'slack'.
            // To allow partial inheritance (e.g. update one env var but keep others), we'd need deep merge.
            // User request implies: "If AI task enables MCP, it inherits project settings".
            // So if task has NO config for 'slack' but enables 'slack', it should use Project 'slack'.
            // If task HAS config for 'slack', it uses Task 'slack'.
            // So shallow merge at the Server ID level is correct per requirement.
        }

        const hasTaskOverrides = Boolean(
            effectiveMcpConfig && Object.keys(effectiveMcpConfig).length > 0 && mcpManager
        );
        if (hasTaskOverrides && mcpManager) {
            mcpManager.setTaskOverrides(task.id, effectiveMcpConfig);
        }

        try {
            // Determine provider and model
            const provider = this.resolveProvider(task.aiProvider as AIProvider | null);

            // If we fell back to a different provider, we must reset the model to the new provider's default
            // to avoid sending an incompatible model (e.g. Claude) to the fallback provider (e.g. OpenAI).
            // We only use the task's model if the resolved provider matches what was requested.
            const shouldUseRequestedModel = task.aiProvider === provider;
            const model = this.resolveModel(
                provider,
                shouldUseRequestedModel ? (task.aiModel as AIModel | null) : null
            );
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
                        projectId: task.projectId,
                        projectSequence: task.projectSequence,
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
                        projectId: task.projectId,
                        projectSequence: task.projectSequence,
                        detectedMCPs,
                    }
                );
            }

            const allRequiredMCPs = explicitMCPs.length > 0 ? explicitMCPs : detectedMCPs;

            options.onLog?.(
                'info',
                `[AIServiceManager] Task #${task.projectSequence} requires MCPs: ${
                    allRequiredMCPs.length ? allRequiredMCPs.join(', ') : 'none'
                }`,
                {
                    projectId: task.projectId,
                    projectSequence: task.projectSequence,
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
            const aiConfig = await this.buildAIConfig(
                task,
                model,
                mcpContext,
                allRequiredMCPs,
                context
            );

            // Build AI execution context
            // Build AI execution context
            const aiContext = this.buildAIContext(task, contextWithMCP, mcpContext);
            const userPrompt = this.buildPrompt(task, mcpContext, contextWithMCP);
            const baseMessages: AIMessage[] = [];
            if (aiConfig.systemPrompt) {
                baseMessages.push({ role: 'system', content: aiConfig.systemPrompt });
            }

            // Check if task has imageData for vision models (e.g., for auto-review of images)
            // Enhanced: Check for generic attachments from Input Task (Local File)
            const explicitAttachments = (context.metadata?.attachments || []) as Array<{
                type: string;
                mime: string;
                data: string;
                name: string;
            }>;

            // Collect attachments from dependencies
            const dependencyAttachments: Array<{
                type: string;
                mime: string;
                data: string;
                name: string;
            }> = [];

            if (task.dependencies && task.dependencies.length > 0 && context.previousResults) {
                const depResults = context.previousResults.filter((r) =>
                    task.dependencies.includes(r.taskId)
                );
                for (const res of depResults) {
                    if (res.attachments && res.attachments.length > 0) {
                        for (const att of res.attachments) {
                            // Ensure compatibility
                            dependencyAttachments.push(att as any);
                        }
                    }
                }
            }

            const attachments = [...explicitAttachments, ...dependencyAttachments];

            const imageData = (task as any).imageData || context.metadata?.imageData;

            const inputImages: Array<{ mimeType: string; data: string }> = [];

            if (attachments && attachments.length > 0) {
                // Construct Multi-Modal Message
                console.log(
                    `[AIServiceManager] Task #${task.projectSequence} has ${attachments.length} attachments. Constructing multi-modal message.`
                );

                const multiModalContent: any[] = [{ type: 'text', text: userPrompt }];

                for (const att of attachments) {
                    if (att.type === 'image') {
                        const data = att.data || (att as any).value;
                        const mime = att.mime || (att as any).mimeType;

                        // Detailed debug for image attachment
                        console.log(`[AIServiceManager] Processing image attachment:`, {
                            name: att.name,
                            mime: mime,
                            hasData: !!data,
                            dataLen: data ? data.length : 0,
                            keys: Object.keys(att),
                        });

                        if (data) {
                            const imagePart = {
                                type: 'image',
                                mimeType: mime,
                                data: data, // Base64
                            };
                            multiModalContent.push(imagePart);
                            inputImages.push({ mimeType: mime, data: data });
                        } else {
                            console.warn(
                                `[AIServiceManager] Image attachment ${att.name} has no data/value`
                            );
                        }
                    } else if (att.type === 'file' || att.type === 'binary') {
                        // Future support for other file types?
                        // For now, only images are strictly supported by `MultiModalContentPart` in `ai.ts`
                        // But we can extend this or just ignore non-image attachments for vision models
                        console.warn(
                            `[AIServiceManager] Attachment type ${att.type} (${att.mime}) not yet fully supported for vision models.`
                        );
                    }
                }

                baseMessages.push({
                    role: 'user',
                    content: userPrompt, // Fallback content for legacy/non-supported
                    multiModalContent: multiModalContent,
                });
            } else if (imageData) {
                // Legacy single-image support
                console.log(
                    '[AIServiceManager] Vision task detected (legacy imageData), creating multimodal message'
                );

                // Construct standard multiModalContent from legacy imageData
                const mimeType = imageData.startsWith('data:image/png')
                    ? 'image/png'
                    : 'image/jpeg'; // Guess or parse
                const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
                inputImages.push({ mimeType, data: base64Data });

                baseMessages.push({
                    role: 'user',
                    content: userPrompt,
                    multiModalContent: [
                        { type: 'text', text: userPrompt },
                        { type: 'image', mimeType: mimeType, data: base64Data },
                    ],
                });
            } else {
                // Standard text message
                baseMessages.push({ role: 'user', content: userPrompt });
            }

            options.onLog?.(
                'info',
                `[AIServiceManager] Generated prompt for task #${task.projectSequence}`,
                {
                    taskId: task.id,
                    systemPromptLength: aiConfig.systemPrompt?.length,
                    userPromptLength: userPrompt.length,
                    model: aiConfig.model,
                }
            );

            const toolCount = Array.isArray(aiConfig.tools) ? aiConfig.tools.length : 0;
            const hasTools = toolCount > 0;
            if (!hasTools) {
                options.onLog?.(
                    'warn',
                    `[AIServiceManager] No MCP tools available for task #${task.projectSequence} despite required list`,
                    {
                        taskId: task.id,
                        requiredMCPs: allRequiredMCPs,
                    }
                );
            } else {
                options.onLog?.(
                    'info',
                    `[AIServiceManager] Collected ${toolCount} MCP tools for task #${task.projectSequence}`,
                    {
                        taskId: task.id,
                        toolNames: (aiConfig.tools ?? []).map((t) => t.name),
                    }
                );
            }

            // Update system prompt with collected MCP context
            if (mcpContext && mcpContext.length > 0) {
                // Rebuild system prompt to include the collected environment variables
                const updatedSystemPrompt = this.buildSystemPrompt(task, mcpContext, context);

                // Only update if it actually changed (it should, as we're adding context)
                if (updatedSystemPrompt !== aiConfig.systemPrompt) {
                    aiConfig.systemPrompt = updatedSystemPrompt;
                    options.onLog?.(
                        'info',
                        '[AIServiceManager] System Prompt updated with MCP Context details',
                        {
                            taskId: task.id,
                            contextCount: mcpContext.length,
                        }
                    );
                }
            }

            if (mcpContext && mcpContext.length > 0) {
                console.log('🔍 [AIServiceManager] MCP Context Data Review:');
                console.log(
                    '🔍 [AIServiceManager] mcpContext envVars:',
                    mcpContext.map((c) => ({
                        name: c.name,
                        envVars: c.envVars,
                        envOverrides: c.envOverrides,
                    }))
                );

                const promptTail = aiConfig.systemPrompt?.slice(-2000) || '';
                console.log(
                    '🔍 [AIServiceManager] System Prompt Tail (Last 2000 chars):\n',
                    '...' + promptTail
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

            const outputFormat = this.getTaskOutputFormat(task);
            let isImageTask = this.isImageOutputFormat(outputFormat);

            // [Corrective Logic for Input Images]
            // If the task has Input Images, it is likely a Vision Analysis task (e.g. "Convert this diagram to text"),
            // even if the user mistakenly set the Output Format to 'png'.
            // Most Image Generation models (DALL-E 3) do NOT support Image-to-Image, so sending them input images results in them ignoring the input
            // and generating a hallucination from the prompt.
            // Therefore, if we have input images, we force the task to be treated as a Text/Analysis task (not Image Generation),
            // which routes it to Vision models (GPT-4o, Gemini Pro Vision, etc.).
            if (isImageTask && inputImages.length > 0) {
                options.onLog?.(
                    'warn',
                    '[AIServiceManager] Input images detected for an Image Output task. Switching to Vision Analysis mode (Text Generation) to ensure input is analyzed.',
                    { taskId: task.id }
                );
                isImageTask = false;

                // We must also ensure the model is suitable for Chat/Vision, not Image Generation
                // If the selected model was DALL-E or similar, switch to the provider's default Chat model.
                if (
                    model.includes('dall-e') ||
                    model.includes('image-generation') ||
                    model.includes('fly')
                ) {
                    const newModel = this.resolveModel(provider, null); // Get default chat model
                    options.onLog?.(
                        'info',
                        `[AIServiceManager] Switching model from ${model} to ${newModel} for Vision Analysis`,
                        { taskId: task.id }
                    );
                    // Update the aiConfig model to the new chat-capable model
                    aiConfig.model = newModel;
                }
            }

            // Report progress
            options.onProgress?.({
                phase: 'preparing',
                elapsedTime: Date.now() - startTime,
                provider,
                model: aiConfig.model,
            });

            // Execute with streaming, tool loop, or standard completion
            let result: AIExecutionResult;

            // Debug log for message content
            console.log(
                '[AIServiceManager] Executing with messages:',
                baseMessages.map((m) => ({
                    role: m.role,
                    hasMultiModal: !!m.multiModalContent,
                    multiModalLen: m.multiModalContent?.length,
                }))
            );

            if (isImageTask) {
                result = await this.executeImageGenerationTask(
                    task,
                    userPrompt,
                    aiContext,
                    provider,
                    options,
                    startTime,
                    inputImages // Pass collected images
                );
            } else if (hasTools) {
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
                    startTime,
                    abortController.signal
                );
            } else if (options.streaming && options.onToken) {
                result = await this.executeWithStreaming(
                    task,
                    [...baseMessages], // Pass full messages including MM content
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
                    startTime,
                    abortController.signal
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

            // [Feature: MCP Error Reporting]
            // If we have MCP context insights that indicate errors (either explicit error field or error-like JSON in output),
            // and the AI output didn't seem to mention them (or even if it did), we should append them to the result
            // to ensure the user sees why the task might have "failed" to produce useful output.
            if (mcpContext && mcpContext.length > 0) {
                const mcpErrors = mcpContext.filter((insight) => {
                    // 1. Explicit connection/execution error
                    if (insight.error) return true;

                    // 2. Error inside the output (e.g. Slack API returning { ok: false, error: ... })
                    if (insight.sampleOutput) {
                        try {
                            if (
                                insight.sampleOutput.includes('"ok":false') ||
                                insight.sampleOutput.includes('"error":') ||
                                insight.sampleOutput.includes('"ok": false') ||
                                /"error"\s*:/.test(insight.sampleOutput)
                            ) {
                                return true;
                            }
                        } catch (e) {
                            return false;
                        }
                    }
                    return false;
                });

                if (mcpErrors.length > 0) {
                    const errorSummary = mcpErrors
                        .map((e) => {
                            const errorContent = e.error || e.sampleOutput || 'Unknown error';
                            return `**MCP Tool Error (${e.name})**:\n\`\`\`json\n${errorContent}\n\`\`\``;
                        })
                        .join('\n\n');

                    // Append to content if not already present
                    if (!result.content.includes(errorSummary)) {
                        result.content += `\n\n---\n### ⚠️ System Alerts\nThe following errors were reported by connected tools during task preparation:\n\n${errorSummary}`;
                    }
                }
            }

            return result;
        } catch (error) {
            const elapsed = Date.now() - startTime;
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error(`[AIServiceManager] Task failed: ${errorMsg}`);

            // Fallback logic removed as per user request
            // We now propagate the original error directly

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
        messages: AIMessage[],
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
            messages,
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
                    currentContent: accumulated, // Send the full accumulated content for correct streaming display
                });
            },
            context,
            signal // Pass abort signal to provider
        );

        for await (const chunk of stream) {
            if (signal.aborted) {
                throw new Error('Execution aborted');
            }
            accumulated = chunk.accumulated;
            if (chunk.done) break;
        }

        const duration = Date.now() - startTime;
        // Estimate tokens using provider's helper (now handles string | AIMessage[])
        // We'll just estimate based on the text content for now as a rough approx
        const promptText = messages.map((m) => m.content).join('\n');
        const promptTokens = provider.estimateTokens(promptText);
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
        startTime: number,
        signal: AbortSignal
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
                signal,
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
        startTime: number,
        signal: AbortSignal
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
                    signal,
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
            `Exceeded maximum MCP tool iterations (${AIServiceManager.MAX_TOOL_ITERATIONS}) while executing task #${task.projectSequence}`
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
                    taskTitle: task.title,
                    projectName: (task as any).projectName, // Try to pass project name if available
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
        // Remove markdown code blocks if present
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch?.[1]) {
            return jsonMatch[1]; // Do not trim to preserve whitespace
        }
        return content; // Do not trim to preserve whitespace
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

    private static readonly IMAGE_MODELS: Partial<Record<AIProvider, string[]>> = {
        openai: ['dall-e-3', 'dall-e-2', 'gpt-image-1', 'gpt-image-1-mini'],
        google: [
            'imagen-3.0',
            'imagen-3.0-generate-001',
            'imagen-3.0-generate-002',
            'gemini-2.5-flash-image',
            'gemini-3-pro-image-preview',
            'veo-3.1-generate-preview',
            'veo-2.0-generate-preview',
        ],
        'default-highflow': [
            'imagen-3.0',
            'imagen-3.0-generate-001',
            'imagen-3.0-generate-002',
            'gemini-2.5-flash-image',
            'gemini-3-pro-image-preview',
            'veo-3.1-generate-preview',
            'veo-2.0-generate-preview',
        ],
        anthropic: [],
        ollama: [],
        perplexity: [],
        groq: [],
        lmstudio: [],
        mistral: [],
        deepseek: [],
        cohere: [],
        together: [],
        fireworks: [],
        openrouter: [],
    };

    private getTaskOutputFormat(task: Task): string | null {
        // 1. 모델이 이미지 전용 모델인지 확인 (가장 높은 우선순위)
        // 사용자가 명시적으로 이미지 모델을 선택했다면, expectedOutputFormat이 text여도 이미지를 의도한 것으로 간주
        if (task.aiProvider && task.aiModel) {
            const imageModels = AIServiceManager.IMAGE_MODELS[task.aiProvider as AIProvider] || [];
            if (imageModels.includes(task.aiModel)) {
                console.log(
                    `[AIServiceManager] Model ${task.aiModel} is an image-only model. Forcing output format to 'png'.`
                );
                return 'png';
            }
        }

        // 2. expectedOutputFormat을 우선 사용 (사용자가 UI에서 설정한 값)
        const raw =
            task.expectedOutputFormat || ((task as any).outputFormat as string | undefined) || null;
        const result = raw ? raw.toLowerCase() : null;
        console.log(
            `[AIServiceManager] getTaskOutputFormat: outputFormat="${(task as any).outputFormat}", expectedOutputFormat="${task.expectedOutputFormat}" => result="${result}"`
        );
        return result;
    }

    private isImageOutputFormat(format: string | null): boolean {
        if (!format) {
            return false;
        }
        const isImage = ['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(format);
        console.log(
            `[AIServiceManager] isImageOutputFormat check: format="${format}" => ${isImage}`
        );
        return isImage;
    }

    private async resolveImageModelForProvider(
        provider: AIProvider,
        task: Task,
        imageConfig: ImageGenerationConfig
    ): Promise<AIModel> {
        const preferredModel = (imageConfig.model || task.aiModel) as AIModel | undefined;

        // Valid image models for each provider
        const validImageModels = AIServiceManager.IMAGE_MODELS;
        const models = validImageModels[provider] || [];

        // Check if preferred model is actually a valid image model
        if (preferredModel && validImageModels[provider]?.includes(preferredModel)) {
            const providerInstance = await this.providerFactory.getProvider(provider);
            const modelInfo = providerInstance.getModelInfo(preferredModel);
            console.log(
                `[AIServiceManager] Model info for ${provider} - ${preferredModel}:`,
                modelInfo
            );
            if (modelInfo) {
                console.log(`[AIServiceManager] Using preferred image model: ${preferredModel}`);
                return preferredModel;
            }
        }

        // If preferred model is not an image model, log and use default
        if (preferredModel) {
            console.log(
                `[AIServiceManager] Model "${preferredModel}" is not a valid image model for ${provider}, using default`
            );
        }

        switch (provider) {
            case 'openai':
                return 'dall-e-3';
            case 'google':
                return 'gemini-2.0-flash-exp-image-generation';
            default:
                throw new Error(
                    `Provider ${provider} does not currently support image generation in this workspace.`
                );
        }
    }

    private async executeImageGenerationTask(
        task: Task,
        prompt: string,
        aiContext: AIExecutionContext,
        provider: AIProvider | null, // Provider resolved by executeTask
        options: AIExecutionOptions,
        startTime: number,
        inputImages: Array<{ mimeType: string; data: string }> = []
    ): Promise<AIExecutionResult> {
        const imageConfig = (task as any).imageConfig || {};
        let preferredProvider =
            (imageConfig.provider as AIProvider | null) ||
            (task.aiProvider as AIProvider | null) ||
            provider ||
            'google'; // Default to google if null
        const preferredModel = (imageConfig.model || task.aiModel) as AIModel | undefined;

        // Auto-detect provider if model matches a known invalid provider combination
        // (e.g. User configured Google model but provider is somehow OpenAI in DB)
        if (preferredModel && preferredProvider) {
            const validImageModels = AIServiceManager.IMAGE_MODELS;
            const currentProviderModels = validImageModels[preferredProvider] || [];

            if (!currentProviderModels.includes(preferredModel)) {
                // Check if this model belongs to another provider
                for (const [p, models] of Object.entries(validImageModels)) {
                    if (models && models.includes(preferredModel)) {
                        console.warn(
                            `[AIServiceManager] Model ${preferredModel} not found in ${preferredProvider}, but found in ${p}. Switching provider.`
                        );
                        preferredProvider = p as AIProvider;
                        break;
                    }
                }
            }
        }

        const promptWithTemplate = imageConfig.promptTemplate
            ? imageConfig.promptTemplate.replace('{{prompt}}', prompt)
            : prompt;

        const imageOptions = {
            size: imageConfig.size,
            quality: imageConfig.quality,
            style: imageConfig.style,
            background: imageConfig.background,
            format: imageConfig.format,
            count: imageConfig.count,

            extra: imageConfig.extra,
            inputImages: inputImages, // Pass input images to provider
        };

        const model = await this.resolveImageModelForProvider(preferredProvider, task, imageConfig);

        const aiConfig: AIConfig = {
            model,
        };

        options.onProgress?.({
            phase: 'executing',
            elapsedTime: Date.now() - startTime,
            provider: preferredProvider,
            model,
        });

        try {
            const aiResult = await this.multiVendorClient.generateImage(
                {
                    prompt: promptWithTemplate,
                    config: aiConfig,
                    context: aiContext,
                    options: imageOptions,
                },
                preferredProvider
            );

            const duration = Date.now() - startTime;
            options.onProgress?.({
                phase: 'completed',
                elapsedTime: duration,
                provider: preferredProvider,
                model,
                tokensGenerated: 0,
            });

            // Construct AIExecutionResult from AiResult
            const executionResult: AIExecutionResult = {
                success: true,
                content: aiResult.value,
                tokensUsed: { prompt: 0, completion: 0, total: 0 },
                cost: 0,
                finishReason: 'stop',
                duration: duration,
                provider: preferredProvider,
                model: model,
                metadata: {
                    ...aiResult.meta,
                    kind: aiResult.kind,
                    format: aiResult.format,
                    ...(aiResult.meta?.files && { resultFiles: aiResult.meta.files }),
                },
                aiResult, // Include full aiResult for proper typing
            };

            // Check for fallback and log it
            if (
                task.aiProvider &&
                task.aiModel &&
                (preferredProvider !== task.aiProvider || model !== task.aiModel)
            ) {
                executionResult.metadata = {
                    ...executionResult.metadata,
                    usedFallback: true,
                    originalProvider: task.aiProvider,
                    fallbackMetadata: {
                        originalProvider: task.aiProvider,
                        originalModel: task.aiModel,
                        fallbackReason: `Requested combination (${task.aiProvider}/${task.aiModel}) is not valid for image generation. System used ${preferredProvider}/${model} instead.`,
                    },
                };
            }

            return executionResult;
        } catch (error) {
            const failure = error instanceof Error ? error : new Error(String(error));
            options.onLog?.(
                'error',
                `[AIServiceManager] Image provider ${preferredProvider} failed: ${failure.message}`
            );
            throw failure;
        }
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
            // Check for obvious mismatches (heuristic)
            const isClaude = taskModel.includes('claude');
            const isGPT = taskModel.includes('gpt') || taskModel.includes('o1-');
            const isGemini = taskModel.includes('gemini');

            let isValid = true;
            if (provider === 'openai' && (isClaude || isGemini)) isValid = false;
            if (provider === 'anthropic' && (isGPT || isGemini)) isValid = false;
            if (provider === 'google' && (isClaude || isGPT)) isValid = false;

            if (isValid) {
                return taskModel;
            } else {
                console.warn(
                    `[AIServiceManager] Model mismatch detected: ${taskModel} is not valid for ${provider}. Using default.`
                );
            }
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
        requiredMCPs: string[] = [],
        context?: ExecutionContext
    ): Promise<AIConfig> {
        // Collect MCP tool definitions
        const tools = await this.collectMCPTools(task, requiredMCPs);

        const config: AIConfig = {
            model,
            temperature: (task as any).aiTemperature ?? 0.7,
            maxTokens: (task as any).aiMaxTokens ?? 4096,
            systemPrompt: this.buildSystemPrompt(task, mcpContext, context),
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

    private buildSystemPrompt(
        task: Task,
        mcpContext: MCPContextInsight[] = [],
        context?: ExecutionContext
    ): string {
        let systemPrompt = `You are an AI assistant helping to complete the following task.

## Task Information
- Title: ${task.title}
- Priority: ${task.priority}
- Status: ${task.status}
`;

        // Inject Project Context from Metadata (injected by task-execution-handlers)
        if (context?.metadata?.project) {
            const project = context.metadata.project;
            systemPrompt += `\n## Project Context\n`;
            systemPrompt += `Project: ${project.title}\n`;
            if (project.goal) systemPrompt += `Goal: ${project.goal}\n`;
            if (project.constraints) systemPrompt += `Constraints: ${project.constraints}\n`;
            if (project.phase) systemPrompt += `Current Phase: ${project.phase}\n`;

            if (project.memory) {
                const mem = project.memory;
                if (mem.summary) systemPrompt += `\n### Project Memory (Summary)\n${mem.summary}\n`;

                if (mem.glossary && Object.keys(mem.glossary).length > 0) {
                    systemPrompt += `\n### Glossary\n`;
                    for (const [term, def] of Object.entries(mem.glossary)) {
                        systemPrompt += `- **${term}**: ${def}\n`;
                    }
                }

                if (
                    mem.recentDecisions &&
                    Array.isArray(mem.recentDecisions) &&
                    mem.recentDecisions.length > 0
                ) {
                    systemPrompt += `\n### Recent Decisions\n`;
                    mem.recentDecisions.forEach((d: any) => {
                        systemPrompt += `- ${d.date}: ${d.summary}\n`;
                    });
                }
            }
            systemPrompt += `\n`;
        }

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
                console.log(`[buildSystemPrompt] Processing insight: ${insight.name}`, {
                    envVars: insight.envVars,
                    keys: insight.envVars ? Object.keys(insight.envVars) : [],
                });
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
                if (insight.envVars && Object.keys(insight.envVars).length > 0) {
                    console.log(`[buildSystemPrompt] Adding env vars for ${insight.name}`);
                    systemPrompt += `- Environment Configuration:\n`;
                    for (const [key, value] of Object.entries(insight.envVars)) {
                        systemPrompt += `  - ${key}=${value}\n`;
                    }
                    systemPrompt += `  (Use these values if tool arguments require IDs or tokens. For example, if a tool needs a channel_id, pick a valid ID from SLACK_CHANNEL_IDS. DO NOT use placeholders like "CONSTRAINTS".)\n`;
                } else if (insight.envOverrides?.length) {
                    console.log(`[buildSystemPrompt] Adding env overrides for ${insight.name}`);
                    systemPrompt += `- Custom environment variables: ${insight.envOverrides.join(
                        ', '
                    )}\n`;
                }
            }
            systemPrompt += `\nLeverage the MCP context above to ground your response. If additional MCP tool output is needed, clearly specify which tool and parameters you require.\n`;

            // APPEND STRONG INSTRUCTION
            systemPrompt += `
## CRITICAL INSTRUCTION: TOOL USAGE MANDATORY
You have access to external tools (MCPs) to retrieve information (e.g., Jira issues, Confluence pages, Slack messages, Filesystem).
- **You MUST use these tools** to answer the user's request.
- **Do NOT** reply with "I cannot access..." or "I don't have information..." without trying the relevant tools first.
- **Do NOT** ask the user for IDs or links if you can search for them using the provided search tools (e.g., "atlassian-rovo_search", "slack_search").
- If the user asks for a summary, you MUST fetch the content using tools FIRST, then summarize it.
- **Do NOT** write Python code or pseudo-code to call tools (e.g., \`print(tool_name(...))\`). Use the native function calling capability provided to you.
`;
        }

        systemPrompt += `
## Instructions
- Provide clear, actionable responses
- If code is requested, include proper formatting
- Consider the task priority and requirements
- Be concise but thorough


## CRITICAL OUTPUT RULES
- **NO CONVERSATIONAL TEXT**: Do not include "Here is the code", "Sure", "I have updated...", or any other natural language commentary. Return ONLY the requested content.
- **NO MARKDOWN FENCES (unless Markdown)**: If the requested format is HTML, CSS, JavaScript, Python, JSON, XML, YAML, or CSV, return the RAW code/data only. DO NOT wrap it in \`\`\` code blocks. enclosing the content in markdown blocks will break the system.
- **STRICT STRUCTURE**: Ensure the output is valid and parseable in the requested format.

## Output Format
${
    (task as any).outputFormat === 'json'
        ? 'You must respond with valid JSON only. Do not include any markdown formatting, code blocks, or explanatory text outside the JSON object.'
        : (task as any).outputFormat === 'markdown'
          ? 'Return valid Markdown. You may use code blocks for code snippets, but do not include conversational filler.'
          : 'Return ONLY the raw content (e.g., pure HTML, pure Python). Do NOT use markdown code blocks.'
}
`;

        return systemPrompt;
    }

    private buildPrompt(
        task: Task,
        mcpContext: MCPContextInsight[] = [],
        context?: ExecutionContext
    ): string {
        let prompt = task.description || task.title;

        if ((task as any).aiPrompt) {
            prompt = (task as any).aiPrompt;
        }

        // Implicit Context Injection from Dependencies
        // If the task has dependencies, we automatically inject their outputs into the prompt
        // unless they are macros (which are already resolved in aiPrompt).
        if (task.dependencies && task.dependencies.length > 0 && context?.previousResults) {
            const dependencyResults = context.previousResults.filter((r) =>
                task.dependencies.includes(r.taskId)
            );

            if (dependencyResults.length > 0) {
                prompt += `\n\n## Context from Dependencies\n`;
                for (const result of dependencyResults) {
                    if (result.status === 'success' && result.output) {
                        // Skip input parsing if output is empty/null
                        if (
                            result.output === null ||
                            result.output === undefined ||
                            result.output === ''
                        ) {
                            continue;
                        }

                        const depTitle = result.taskTitle || `Task #${result.taskId}`;
                        prompt += `### Output from ${depTitle}\n`;

                        if (typeof result.output === 'string') {
                            prompt += `${result.output}\n`;
                        } else if (typeof result.output === 'object') {
                            // Handle special output structures if needed, else JSON verify
                            if (result.output.content) {
                                prompt += `${result.output.content}\n`;
                            } else {
                                prompt += `${JSON.stringify(result.output, null, 2)}\n`;
                            }
                        } else {
                            prompt += `${String(result.output)}\n`;
                        }
                        prompt += '\n';
                    }
                }
            }
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
            prompt += `\nREMINDER: You have access to tools. USE THEM. Do not say you cannot access information.`;
        }

        return prompt;
    }

    private buildToolUsageDirective(required: string[] = []): string {
        if (!Array.isArray(required) || required.length === 0) {
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
            '- You must CALL the tools directly, not just suggest how to use them. Execute the tools to get actual results.',
        ];

        if (canonicalRequired.includes('slack')) {
            directives.push(
                '- For Slack-related questions, you must call the Slack MCP history tools (e.g., list channel messages) to fetch the requested data such as channel transcripts before summarizing. Do not provide instructions or sample code for Slack APIs; provide the actual summarized result from the tool output.'
            );
        }

        if (canonicalRequired.includes('atlassian-rovo')) {
            directives.push(
                '- For Atlassian/Jira/Confluence searches, ALWAYS use the atlassian-rovo_search tool first with the search query. This tool searches across both Jira and Confluence.',
                '- Do NOT suggest manual steps like "getAccessibleAtlassianResources" or "getConfluenceSpaces" unless the search tool fails.',
                "- Call the search tool immediately with the user's search terms to get actual results."
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
            taskId: task.id, // Keeping for backward compatibility if needed, though mostly deprecated
            projectId: task.projectId,
            projectSequence: task.projectSequence,
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
                projectId: task.projectId,
                projectSequence: task.projectSequence,
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
            `[AI] Prompt prepared for task #${task.projectSequence} (${provider}/${model}): ${this.truncateString(prompt, 200)}`,
            {
                taskId: task.id,
                projectId: task.projectId,
                projectSequence: task.projectSequence,
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
                    `[MCP Detection] ✓ Successfully auto-detected ${detectedMCPs.length} relevant MCPs for task #${task.projectSequence}:`,
                    detectedMCPs
                );
                onLog?.(
                    'info',
                    `[MCP Detection] ✓ Successfully auto-detected ${detectedMCPs.length} relevant MCPs: ${detectedMCPs.join(', ')}`
                );
            } else {
                console.log(
                    `[MCP Detection] ✗ No MCPs auto-detected for task #${task.projectSequence}`
                );
                onLog?.(
                    'info',
                    `[MCP Detection] ✗ No MCPs auto-detected for task #${task.projectSequence}`
                );
            }

            return detectedMCPs;
        } catch (error) {
            console.error('[AIServiceManager] Failed to detect relevant MCPs:', error);
            return [];
        }
    }

    private async collectRequiredMCPContext(task: Task): Promise<MCPContextInsight[]> {
        const rawInput = task.requiredMCPs;
        const normalizedRequired = (Array.isArray(rawInput) ? rawInput : []) as Array<
            string | null | undefined
        >;
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
                        envVars: taskConfigEntry?.env as Record<string, string> | undefined,
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
                                envVars: taskConfigEntry?.env as Record<string, string> | undefined,
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
                    envVars: taskConfigEntry?.env as Record<string, string> | undefined,
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

        // More strict regex to avoid matching words like "CONSTRAINTS"
        // Slack channel IDs: C or G followed by exactly 8-10 alphanumeric characters
        const channelIdMatch = text.match(/\b[CG][A-Z0-9]{8,10}\b/);
        const channelNameMatch = text.match(/#([a-z0-9_-]{2,})/i);

        let channelId = channelIdMatch ? channelIdMatch[0].toUpperCase() : undefined;

        // Fallback to environment variable if no channel ID found in text
        if (!channelId) {
            console.log('[extractSlackHistoryHints] No channel ID in text, trying env fallback');
            const taskConfigEntry =
                this.getTaskMCPConfigEntry(task, 'slack-mcp') ||
                this.getTaskMCPConfigEntry(task, 'slack');

            console.log(
                '[extractSlackHistoryHints] taskConfigEntry:',
                taskConfigEntry ? 'FOUND' : 'NULL'
            );

            if (taskConfigEntry?.env) {
                const envVars = taskConfigEntry.env as Record<string, string>;
                const channelIds = envVars.SLACK_CHANNEL_IDS || envVars.SLACK_CHANNEL_ID;

                console.log('[extractSlackHistoryHints] envVars:', envVars);
                console.log('[extractSlackHistoryHints] channelIds:', channelIds);

                if (channelIds) {
                    // Extract first channel ID from comma-separated list
                    const firstChannelId = channelIds.split(',')[0]?.trim();
                    console.log('[extractSlackHistoryHints] firstChannelId:', firstChannelId);
                    if (firstChannelId && /^[CG][A-Z0-9]{8,}$/i.test(firstChannelId)) {
                        channelId = firstChannelId.toUpperCase();
                        console.log(
                            `[extractSlackHistoryHints] ✅ Using channel ID from env: ${channelId}`
                        );
                    } else {
                        console.log(
                            '[extractSlackHistoryHints] ❌ firstChannelId failed regex test'
                        );
                    }
                } else {
                    console.log('[extractSlackHistoryHints] ❌ No channelIds in env');
                }
            } else {
                console.log('[extractSlackHistoryHints] ❌ No taskConfigEntry.env');
            }
        } else {
            console.log(`[extractSlackHistoryHints] Found channel ID in text: ${channelId}`);
        }

        const hints: SlackHistoryHints = {
            channelId,
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
