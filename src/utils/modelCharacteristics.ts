/**
 * Model characteristics metadata
 */
export interface ModelCharacteristics {
    /** Display name */
    name?: string;
    /** Model description */
    description?: string;
    /** Context window size in tokens */
    contextWindow?: number;
    /** Supports vision/image input */
    supportsVision?: boolean;
    /** Supports function/tool calling */
    supportsTools?: boolean;
    /** Supports streaming */
    supportsStreaming?: boolean;
    /** Speed tier: fast, medium, slow */
    speed?: 'fast' | 'medium' | 'slow';
    /** Cost tier: free, low, medium, high */
    costTier?: 'free' | 'low' | 'medium' | 'high';
    /** Special capabilities */
    capabilities?: string[];
}

/**
 * Model metadata registry
 * Maps model IDs to their characteristics
 */
export const MODEL_CHARACTERISTICS: Record<string, ModelCharacteristics> = {
    // OpenAI
    'gpt-4o': {
        name: 'GPT-4o',
        description: '최신 멀티모달 모델, 빠른 응답',
        contextWindow: 128000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        speed: 'fast',
        costTier: 'medium',
        capabilities: ['vision', 'tools', 'reasoning'],
    },
    'gpt-4o-mini': {
        name: 'GPT-4o Mini',
        description: '경제적이고 빠른 소형 모델',
        contextWindow: 128000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        speed: 'fast',
        costTier: 'low',
        capabilities: ['vision', 'tools'],
    },
    o1: {
        name: 'o1',
        description: '고급 추론 모델',
        contextWindow: 128000,
        supportsVision: false,
        supportsTools: false,
        supportsStreaming: false,
        speed: 'slow',
        costTier: 'high',
        capabilities: ['deep-reasoning', 'complex-tasks'],
    },
    'o1-preview': {
        name: 'o1 Preview',
        description: '고급 추론 모델 프리뷰',
        contextWindow: 128000,
        supportsVision: false,
        supportsTools: false,
        supportsStreaming: false,
        speed: 'slow',
        costTier: 'high',
        capabilities: ['deep-reasoning'],
    },
    'o1-mini': {
        name: 'o1 Mini',
        description: '빠른 추론 모델',
        contextWindow: 128000,
        supportsVision: false,
        supportsTools: false,
        supportsStreaming: false,
        speed: 'medium',
        costTier: 'medium',
        capabilities: ['reasoning'],
    },
    'gpt-4-turbo': {
        name: 'GPT-4 Turbo',
        description: '강력한 성능, 큰 컨텍스트',
        contextWindow: 128000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        speed: 'medium',
        costTier: 'high',
        capabilities: ['vision', 'tools', 'long-context'],
    },
    'gpt-4': {
        name: 'GPT-4',
        description: '안정적인 고성능 모델',
        contextWindow: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        speed: 'medium',
        costTier: 'high',
        capabilities: ['tools', 'reasoning'],
    },
    'gpt-3.5-turbo': {
        name: 'GPT-3.5 Turbo',
        description: '빠르고 경제적',
        contextWindow: 16384,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        speed: 'fast',
        costTier: 'low',
        capabilities: ['tools'],
    },

    // Anthropic
    'claude-3-5-sonnet-20241022': {
        name: 'Claude 3.5 Sonnet',
        description: '최고 성능의 균형잡힌 모델',
        contextWindow: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        speed: 'medium',
        costTier: 'medium',
        capabilities: ['vision', 'tools', 'long-context', 'coding'],
    },
    'claude-3-5-haiku-20241022': {
        name: 'Claude 3.5 Haiku',
        description: '빠르고 경제적인 모델',
        contextWindow: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        speed: 'fast',
        costTier: 'low',
        capabilities: ['vision', 'tools', 'long-context'],
    },
    'claude-3-opus-20240229': {
        name: 'Claude 3 Opus',
        description: '최고 성능 모델',
        contextWindow: 200000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        speed: 'slow',
        costTier: 'high',
        capabilities: ['vision', 'tools', 'long-context', 'reasoning'],
    },

    // Google
    'gemini-2.5-pro': {
        name: 'Gemini 2.5 Pro',
        description: '강력한 멀티모달 모델',
        contextWindow: 1000000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        speed: 'medium',
        costTier: 'medium',
        capabilities: ['vision', 'tools', 'ultra-long-context'],
    },
    'gemini-2.5-flash': {
        name: 'Gemini 2.5 Flash',
        description: '빠른 멀티모달 모델',
        contextWindow: 1000000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        speed: 'fast',
        costTier: 'low',
        capabilities: ['vision', 'tools', 'ultra-long-context'],
    },
    'gemini-1.5-flash-8b': {
        name: 'Gemini 1.5 Flash 8B',
        description: '매우 빠르고 경제적',
        contextWindow: 1000000,
        supportsVision: true,
        supportsTools: true,
        supportsStreaming: true,
        speed: 'fast',
        costTier: 'free',
        capabilities: ['vision', 'tools', 'ultra-long-context'],
    },

    // Local models
    'llama3.1': {
        name: 'Llama 3.1',
        description: '로컬 오픈소스 모델',
        contextWindow: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        speed: 'medium',
        costTier: 'free',
        capabilities: ['local', 'tools'],
    },
    'llama3.1:70b': {
        name: 'Llama 3.1 70B',
        description: '대형 로컬 모델',
        contextWindow: 8192,
        supportsVision: false,
        supportsTools: true,
        supportsStreaming: true,
        speed: 'slow',
        costTier: 'free',
        capabilities: ['local', 'tools', 'high-quality'],
    },
};

/**
 * Get model characteristics by model ID
 */
export function getModelCharacteristics(modelId: string): ModelCharacteristics | null {
    return MODEL_CHARACTERISTICS[modelId] || null;
}

/**
 * Format context window for display
 */
export function formatContextWindow(tokens: number): string {
    if (tokens >= 1000000) {
        return `${(tokens / 1000000).toFixed(1)}M`;
    }
    if (tokens >= 1000) {
        return `${Math.round(tokens / 1000)}K`;
    }
    return `${tokens}`;
}

/**
 * Get speed emoji
 */
export function getSpeedEmoji(speed?: 'fast' | 'medium' | 'slow'): string {
    switch (speed) {
        case 'fast':
            return '⚡';
        case 'medium':
            return '🔵';
        case 'slow':
            return '🐢';
        default:
            return '';
    }
}

/**
 * Get cost tier emoji
 */
export function getCostTierEmoji(costTier?: 'free' | 'low' | 'medium' | 'high'): string {
    switch (costTier) {
        case 'free':
            return '🎁';
        case 'low':
            return '💵';
        case 'medium':
            return '💰';
        case 'high':
            return '💎';
        default:
            return '';
    }
}
