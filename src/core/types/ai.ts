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
    | 'openai'
    | 'anthropic'
    | 'google'
    | 'default-highflow'
    | 'default-gemini'
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
    | 'stability'
    | 'runway'
    | 'pika'
    | 'figma-ai'
    | 'galileo'
    | 'uizard'
    | 'google-tts'
    | 'elevenlabs'
    | 'suno'
    | 'zhipu'
    | 'moonshot'
    | 'qwen'
    | 'baidu'
    | 'claude-code'
    | 'codex'
    | 'local';

export type AIModel =
    // OpenAI Models
    | 'gpt-4o'
    | 'gpt-4o-mini'
    | 'o1-preview'
    | 'o1-mini'
    | 'o1'
    | 'gpt-4-turbo'
    | 'gpt-4'
    | 'gpt-3.5-turbo'
    | 'gpt-image-1'
    | 'dall-e-3'
    | 'dall-e-2'
    // Claude Models
    | 'claude-3-5-sonnet-20250219'
    | 'claude-3-opus-20240229'
    | 'claude-3-sonnet-20240229'
    | 'claude-3-haiku-20240307'
    | 'claude-3-5-haiku-20241022'
    | 'claude-4-5-sonnet-20251022'
    | 'claude-4-5-opus-20251022'
    // Gemini Models (Vertex AI / Gemini API)
    | 'gemini-3.0-pro'
    | 'gemini-2.5-pro'
    | 'gemini-2.5-flash'
    | 'gemini-2.5-flash-lite'
    | 'gemini-2.5-flash-image'
    | 'gemini-2.5-flash-preview-image-generation'
    | 'gemini-2.0-flash'
    | 'gemini-2.0-flash-lite'
    | 'gemini-1.5-pro'
    | 'gemini-1.5-flash'
    | 'gemini-pro'
    | 'gemini-3-pro-image-preview'
    | 'gemini-3-pro-preview'
    | 'gemini-3.0-pro-exp'
    | 'gemini-3.0-flash-exp'
    | 'gemini-2.0-flash-thinking-exp-1219'
    // Imagen Models
    | 'imagen-4.0-generate-001'
    | 'imagen-3.0-generate-002'
    | 'imagen-3.0-generate-001'
    | 'imagen-3.0'
    | 'imagen-3.0-lite'
    // Veo Video Models
    | 'veo-3.1-generate-001'
    | 'veo-3.0-generate-001'
    | 'veo-2.0-generate-001'
    | 'veo-3.1-generate-preview'
    | 'veo-2.0-generate-preview'
    // Other Models
    | 'deepseek-reasoner'
    | 'sonar'
    | 'sonar-pro'
    | 'sonar-reasoning'
    | 'llama-3.3-70b-versatile'
    | 'llama-3.1-70b-versatile'
    | 'llama-3.1-8b-instant'
    | 'mixtral-8x7b-32768'
    | 'gemma2-9b-it'
    | 'local-model'
    | 'codex-latest'
    | 'codex-standard'
    // Allow dynamic model names from API
    | (string & {});

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
    projectSequence?: number;
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
    baseUrl?: string;
    apiKey?: string;
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

export type MultiModalContentPart =
    | { type: 'text'; text: string }
    | { type: 'image'; mimeType: string; data: string } // base64
    | { type: 'file'; mimeType: string; data: string; name: string };

export interface AIMessage {
    role: AIMessageRole;
    content: string;
    multiModalContent?: MultiModalContentPart[];
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
    | 'jpg'
    | 'jpeg'
    | 'webp'
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

/**
 * Model Characteristics - AI-generated tags describing model properties
 */
export type ModelCharacteristic =
    | '안정적'
    | '균형형'
    | '창의적'
    | '글 잘씀'
    | '논리적'
    | '구조중심'
    | '비판적'
    | '검증용'
    | '빠름'
    | '비용절약'
    | '코딩'
    | '설계강함'
    | '실험용'
    | '가벼움'
    | '비쌈'
    | '저렴'
    | '무료'
    // Output types
    | '텍스트'
    | '이미지'
    | '비디오'
    | '오디오'
    | '멀티모달';

export interface ModelInfo {
    name: AIModel;
    provider: AIProvider;
    displayName?: string;
    contextWindow: number;
    maxOutputTokens: number;
    costPerInputToken: number;
    costPerOutputToken: number;
    averageLatency: number;
    features: AIFeature[];
    bestFor: string[];
    deprecated?: boolean;
    deprecatedSince?: string;
    replacementModel?: string;
    supportedActions?: string[];
    // AI-generated characteristics
    characteristics?: ModelCharacteristic[];
    characteristicsUpdatedAt?: number; // timestamp
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
