/**
 * Provider Registry
 *
 * Centralized registry for all AI providers and local agents
 * Defines provider type and execution strategy
 */

export type ProviderType = 'api' | 'local-agent';
export type ExecutionStrategy = 'ai-service' | 'local-session' | 'custom';

export interface ProviderConfig {
    id: string;
    name: string;
    type: ProviderType;
    executionStrategy: ExecutionStrategy;
    // For local agents
    agentCommand?: string;
    // For API providers
    requiresApiKey?: boolean;
}

/**
 * Provider Registry
 * Add new providers here to support them across the application
 */
export const PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
    // API Providers
    openai: {
        id: 'openai',
        name: 'OpenAI',
        type: 'api',
        executionStrategy: 'ai-service',
        requiresApiKey: true,
    },
    anthropic: {
        id: 'anthropic',
        name: 'Anthropic',
        type: 'api',
        executionStrategy: 'ai-service',
        requiresApiKey: true,
    },
    google: {
        id: 'google',
        name: 'Google AI',
        type: 'api',
        executionStrategy: 'ai-service',
        requiresApiKey: true,
    },
    groq: {
        id: 'groq',
        name: 'Groq',
        type: 'api',
        executionStrategy: 'ai-service',
        requiresApiKey: true,
    },
    lmstudio: {
        id: 'lmstudio',
        name: 'LM Studio',
        type: 'api',
        executionStrategy: 'ai-service',
        requiresApiKey: false,
    },

    // Local Agents
    'claude-code': {
        id: 'claude-code',
        name: 'Claude Code',
        type: 'local-agent',
        executionStrategy: 'local-session',
        agentCommand: 'claude',
    },
    codex: {
        id: 'codex',
        name: 'OpenAI Codex CLI',
        type: 'local-agent',
        executionStrategy: 'local-session',
        agentCommand: 'codex',
    },
    'gemini-cli': {
        id: 'gemini-cli',
        name: 'Gemini CLI',
        type: 'local-agent',
        executionStrategy: 'local-session',
        agentCommand: 'gemini',
    },
};

/**
 * Get provider configuration
 */
export function getProviderConfig(providerId: string): ProviderConfig | null {
    return PROVIDER_REGISTRY[providerId] || null;
}

/**
 * Check if provider is a local agent
 */
export function isLocalAgent(providerId: string): boolean {
    const config = getProviderConfig(providerId);
    return config?.type === 'local-agent';
}

/**
 * Check if provider is an API provider
 */
export function isApiProvider(providerId: string): boolean {
    const config = getProviderConfig(providerId);
    return config?.type === 'api';
}

/**
 * Get local agent type for provider
 */
export function getLocalAgentType(providerId: string): 'claude' | 'codex' | 'gemini-cli' | null {
    const config = getProviderConfig(providerId);
    if (config?.type !== 'local-agent') return null;

    // Map provider ID to agent type
    const agentMap: Record<string, 'claude' | 'codex' | 'gemini-cli'> = {
        'claude-code': 'claude',
        codex: 'codex',
        'gemini-cli': 'gemini-cli',
    };

    return agentMap[providerId] || null;
}

/**
 * Get all providers of a specific type
 */
export function getProvidersByType(type: ProviderType): ProviderConfig[] {
    return Object.values(PROVIDER_REGISTRY).filter((p) => p.type === type);
}

/**
 * Get all API providers
 */
export function getAllApiProviders(): ProviderConfig[] {
    return getProvidersByType('api');
}

/**
 * Get all local agents
 */
export function getAllLocalAgents(): ProviderConfig[] {
    return getProvidersByType('local-agent');
}
