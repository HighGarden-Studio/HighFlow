/**
 * AI Service Type Definitions
 *
 * Complete type definitions for AI integration services
 */

import type { Task, Skill, MCPIntegration, Template } from './database';

// ========================================
// Core AI Types
// ========================================

export type AIProvider =
    | 'anthropic'
    | 'openai'
    | 'google'
    | 'azure-openai'
    | 'groq'
    | 'mistral'
    | 'cohere'
    | 'deepseek'
    | 'together'
    | 'fireworks'
    | 'perplexity'
    | 'stability'
    | 'runway'
    | 'pika'
    | 'google-tts'
    | 'elevenlabs'
    | 'suno'
    | 'huggingface'
    | 'replicate'
    | 'openrouter'
    | 'ollama'
    | 'lmstudio'
    | 'zhipu'
    | 'moonshot'
    | 'qwen'
    | 'baidu'
    | 'claude-code'
    | 'antigravity'
    | 'codex'
    | 'local';

export type AIModel =
    | 'gpt-4o'
    | 'gpt-4o-mini'
    | 'o1-preview'
    | 'o1-mini'
    | 'gpt-4-turbo'
    | 'gpt-4'
    | 'gpt-3.5-turbo'
    | 'claude-3-5-sonnet-20250219'
    | 'claude-3-opus-20240229'
    | 'claude-3-sonnet-20240229'
    | 'claude-3-haiku-20240307'
    | 'gemini-1.5-pro'
    | 'gemini-1.5-flash'
    | 'gemini-pro'
    | 'llama-3.3-70b-versatile'
    | 'llama-3.1-70b-versatile'
    | 'llama-3.1-8b-instant'
    | 'mixtral-8x7b-32768'
    | 'gemma2-9b-it'
    | 'antigravity-pro'
    | 'antigravity-standard'
    | 'codex-latest'
    | 'codex-standard';

export type TaskComplexity = 'simple' | 'medium' | 'complex';

export type ExecutionType = 'serial' | 'parallel' | 'conditional';

// ========================================
// User Context
// ========================================

export interface UserContext {
    userId: number;
    preferences: {
        preferredAI?: AIProvider;
        maxCostPerTask?: number;
        maxLatency?: number;
        language?: string;
    };
    recentProjects: Array<{
        id: number;
        title: string;
        category: string;
    }>;
    skillLevel: 'beginner' | 'intermediate' | 'expert';
    timezone: string;
}

// ========================================
// Prompt Analysis
// ========================================

export interface RequirementGap {
    category: 'scope' | 'technical' | 'timeline' | 'resources' | 'constraints';
    question: string;
    importance: 'critical' | 'high' | 'medium' | 'low';
    suggestedAnswers?: string[];
}

export interface PromptAnalysisResult {
    requirements: RequirementGap[];
    suggestedTemplates: Template[];
    estimatedComplexity: TaskComplexity;
    recommendedAI: AIProvider;
    confidence: number;
    detectedKeywords: string[];
    detectedDomain: string;
}

// ========================================
// Conversational Flow
// ========================================

export interface ConversationContext {
    sessionId: string;
    mainPrompt: string;
    messages: ConversationMessage[];
    collectedInfo: Record<string, any>;
    currentPhase: 'initial' | 'clarification' | 'refinement' | 'finalization';
}

export interface ConversationMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
    timestamp: Date;
    metadata?: Record<string, any>;
}

export interface Question {
    id: string;
    text: string;
    type: 'text' | 'choice' | 'multiChoice' | 'range' | 'boolean';
    options?: string[];
    defaultValue?: any;
    validation?: {
        required: boolean;
        minLength?: number;
        maxLength?: number;
        pattern?: string;
    };
    dependsOn?: string; // Question ID this depends on
}

export interface Answer {
    questionId: string;
    value: any;
    confidence: number;
    timestamp: Date;
}

// ========================================
// Structured Requirements
// ========================================

export interface StructuredRequirement {
    title: string;
    description: string;
    goals: string[];
    constraints: {
        budget?: number;
        deadline?: Date;
        resources?: string[];
        technical?: string[];
    };
    context: {
        domain: string;
        existingAssets?: string[];
        stakeholders?: string[];
    };
    acceptanceCriteria: string[];
    metadata: Record<string, any>;
}

// ========================================
// Task Decomposition
// ========================================

export interface DependencyGraph {
    nodes: Array<{
        taskId: string;
        title: string;
        estimatedMinutes: number;
    }>;
    edges: Array<{
        from: string;
        to: string;
        type: 'blocks' | 'requires' | 'suggests';
    }>;
}

export interface ExecutionPlan {
    phases: ExecutionPhase[];
    criticalPath: string[];
    parallelizableGroups: string[][];
    estimatedTotalTime: number;
    bottlenecks: string[];
}

export interface ExecutionPhase {
    phaseNumber: number;
    name: string;
    taskIds: string[];
    estimatedDuration: number;
    canStartAfter?: number; // Phase number
}

export interface TaskDecompositionResult {
    tasks: Task[];
    dependencyGraph: DependencyGraph;
    executionPlan: ExecutionPlan;
    estimatedTime: number;
    estimatedCost: number;
    risks: Risk[];
}

export interface Risk {
    type: 'technical' | 'resource' | 'timeline' | 'dependency';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    mitigation: string;
}

// ========================================
// Skill Recommendations
// ========================================

export interface SkillRecommendation {
    skill: Skill;
    relevanceScore: number;
    reason: string;
    estimatedImpact: {
        timeReduction?: number;
        qualityImprovement?: number;
        costSaving?: number;
    };
    requiredMCPs: string[];
}

// ========================================
// MCP Matching
// ========================================

export interface MCPMatch {
    mcp: MCPIntegration;
    confidence: number;
    reason: string;
    suggestedTools: Array<{
        name: string;
        description: string;
        parameters: Record<string, any>;
    }>;
}

// ========================================
// AI Provider Selection
// ========================================

export interface ProviderSelectionConstraints {
    maxCost?: number;
    maxLatency?: number;
    requiredFeatures?: AIFeature[];
    excludeProviders?: AIProvider[];
}

export interface ProviderSelectionResult {
    provider: AIProvider;
    model: AIModel;
    estimatedCost: number;
    estimatedTime: number;
    reasoning: string;
    alternatives: Array<{
        provider: AIProvider;
        model: AIModel;
        tradeoff: string;
    }>;
}

// ========================================
// AI Configuration
// ========================================

export interface AIConfig {
    model: AIModel;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stopSequences?: string[];
    systemPrompt?: string;
    responseFormat?: 'text' | 'json';
    tools?: MCPToolDefinition[];
    toolChoice?: 'auto' | 'required' | 'none';
}

export interface ExecutionContext {
    taskId?: number;
    projectId?: number;
    userId: number;
    previousExecutions?: Array<{
        prompt: string;
        response: string;
        success: boolean;
    }>;
    skills?: Skill[];
    mcpTools?: MCPIntegration[];
    metadata?: Record<string, any>;
}

export interface EnabledProviderInfo {
    id: string;
    name: string;
    tags?: string[];
    models?: string[];
    defaultModel?: string;
}

export interface MCPServerRuntimeConfig {
    id: string;
    name: string;
    description?: string;
    endpoint?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    installCommand?: string;
    installArgs?: string[];
    enabled: boolean;
    isConnected?: boolean;
    installed?: boolean;
    config?: Record<string, any>;
    tags?: string[];
    permissions?: Record<string, boolean>;
    featureScopes?: MCPRuntimeFeatureScope[];
    scopes?: string[];
}

export interface MCPRuntimeFeatureScope {
    id: string;
    scopes: string[];
    toolPatterns?: string[];
}

// ========================================
// AI Response
// ========================================

export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, any>;
}

export type AIMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface AIMessage {
    role: AIMessageRole;
    content: string;
    name?: string;
    toolCallId?: string;
    toolCalls?: ToolCall[];
}

export interface AIResponse {
    content: string;
    tokensUsed: {
        prompt: number;
        completion: number;
        total: number;
    };
    cost: number;
    duration: number;
    model: AIModel;
    finishReason: 'stop' | 'length' | 'content_filter' | 'error' | 'tool_calls';
    metadata: Record<string, any>;
    toolCalls?: ToolCall[];
}

export interface StreamChunk {
    delta: string;
    accumulated: string;
    done: boolean;
    metadata?: Record<string, any>;
}

export type AiKind = 'text' | 'code' | 'document' | 'image' | 'audio' | 'video' | 'data';

export type AiSubType =
    | 'text'
    | 'markdown'
    | 'html'
    | 'pdf'
    | 'json'
    | 'yaml'
    | 'csv'
    | 'sql'
    | 'shell'
    | 'mermaid'
    | 'svg'
    | 'png'
    | 'mp4'
    | 'mp3'
    | 'diff'
    | 'log'
    | 'code';

export type AiFormat = 'plain' | 'url' | 'base64' | 'binary';

export interface AiResult {
    kind: AiKind;
    subType?: AiSubType;
    format: AiFormat;
    value: string;
    mime?: string;
    meta?: Record<string, any>;
    raw?: any;
}

// ========================================
// AI Features & Capabilities
// ========================================

export type AIFeature =
    | 'streaming'
    | 'function_calling'
    | 'vision'
    | 'json_mode'
    | 'system_prompt'
    | 'context_caching'
    | 'fine_tuning'
    | 'embeddings'
    | 'reasoning';

export interface Capability {
    name: string;
    description: string;
    supported: boolean;
    limitations?: string[];
}

export interface ModelInfo {
    name: AIModel;
    provider: AIProvider;
    contextWindow: number;
    maxOutputTokens: number;
    costPerInputToken: number;
    costPerOutputToken: number;
    averageLatency: number;
    features: AIFeature[];
    bestFor: string[];
}

// ========================================
// MCP Integration
// ========================================

export interface MCPResult {
    success: boolean;
    data?: any;
    error?: {
        code: string;
        message: string;
        details?: Record<string, any>;
    };
    executionTime: number;
    metadata?: Record<string, any>;
}

export interface MCPHealth {
    status: 'healthy' | 'degraded' | 'down';
    latency: number;
    lastChecked: Date;
    errors: Array<{
        timestamp: Date;
        error: string;
    }>;
    uptime: number;
}

export interface MCPToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<
            string,
            {
                type: string;
                description: string;
                required?: boolean;
                enum?: string[];
            }
        >;
        required: string[];
    };
}

// ========================================
// LangChain Types
// ========================================

export interface ChainConfig {
    name: string;
    steps: ChainStep[];
    memory?: MemoryConfig;
    callbacks?: CallbackConfig;
}

export interface ChainStep {
    name: string;
    type: 'llm' | 'tool' | 'transform' | 'conditional';
    config: Record<string, any>;
    nextSteps?: string[]; // Step names
    condition?: (result: any) => boolean;
}

export interface MemoryConfig {
    type: 'buffer' | 'summary' | 'vector';
    maxTokens?: number;
    summarizeAfter?: number;
}

export interface CallbackConfig {
    onStart?: (data: any) => void;
    onProgress?: (data: any) => void;
    onComplete?: (data: any) => void;
    onError?: (error: Error) => void;
}

export interface AgentConfig {
    name: string;
    objective: string;
    tools: AgentTool[];
    maxIterations: number;
    thinkingMode: 'react' | 'plan-and-execute' | 'reflection';
}

export interface AgentTool {
    name: string;
    description: string;
    execute: (params: Record<string, any>) => Promise<any>;
}

export interface AgentResult {
    success: boolean;
    finalAnswer: string;
    steps: AgentStep[];
    tokensUsed: number;
    cost: number;
    duration: number;
}

export interface AgentStep {
    thought: string;
    action: string;
    actionInput: Record<string, any>;
    observation: string;
    iteration: number;
}

// ========================================
// Error Types
// ========================================

export class AIServiceError extends Error {
    constructor(
        message: string,
        public code: string,
        public provider?: AIProvider,
        public details?: Record<string, any>
    ) {
        super(message);
        this.name = 'AIServiceError';
    }
}

export class RateLimitError extends AIServiceError {
    constructor(provider: AIProvider, retryAfter?: number) {
        super(`Rate limit exceeded for ${provider}`, 'RATE_LIMIT_EXCEEDED', provider, {
            retryAfter,
        });
        this.name = 'RateLimitError';
    }
}

export class InsufficientCreditsError extends AIServiceError {
    constructor(provider: AIProvider, required: number, available: number) {
        super(`Insufficient credits for ${provider}`, 'INSUFFICIENT_CREDITS', provider, {
            required,
            available,
        });
        this.name = 'InsufficientCreditsError';
    }
}
