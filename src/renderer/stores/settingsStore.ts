/**
 * Settings Store
 *
 * Pinia store for managing application settings
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getElectronAPI } from '../../utils/electron';
import type { RunCommandResult } from '@core/types/electron.d';

// Local storage helper functions
const STORAGE_PREFIX = 'workflow_settings_';

function loadFromStorage<T>(key: string, defaultValue: T): T {
    try {
        const stored = localStorage.getItem(STORAGE_PREFIX + key);
        return stored ? JSON.parse(stored) : defaultValue;
    } catch {
        return defaultValue;
    }
}

function saveToStorage<T>(key: string, value: T): void {
    try {
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch (e) {
        console.error(`Failed to save ${key} to storage:`, e);
    }
}

// Types
export type AuthMethod = 'apiKey' | 'oauth' | 'both';

export interface OAuthConfig {
    clientId?: string;
    authUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: string;
}

// Capability tags for AI providers
export type AIProviderTag =
    | 'chat' // 채팅/대화형 AI
    | 'code' // 코드 생성/분석
    | 'design' // UI/UX 디자인 전용
    | 'reasoning' // 추론/분석 능력
    | 'image' // 이미지 생성
    | 'image-analysis' // 이미지 분석/비전
    | 'video' // 비디오 생성
    | 'audio' // 오디오/음성 처리
    | 'tts' // Text-to-Speech
    | 'stt' // Speech-to-Text
    | 'music' // 음악 생성
    | 'embedding' // 임베딩/벡터
    | 'search' // 실시간 검색
    | 'long-context' // 긴 컨텍스트 지원
    | 'fast' // 빠른 응답 속도
    | 'local' // 로컬 실행
    | 'multi-modal' // 멀티모달
    | 'agent' // 에이전트/도구 사용
    | 'free-tier'; // 무료 티어 있음

export interface AIProviderConfig {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    website?: string;
    // Tags for capability filtering
    tags: AIProviderTag[];
    // Authentication
    authMethods: AuthMethod[]; // Supported auth methods
    activeAuthMethod?: 'apiKey' | 'oauth'; // Currently active method
    apiKey?: string;
    oauthToken?: string;
    oauth?: OAuthConfig;
    requiresLogin?: boolean; // Requires user login (for proxy providers)
    // Configuration
    baseUrl?: string;
    enabled: boolean;
    models: string[];
    defaultModel?: string;
    // Status
    isConnected?: boolean;
    lastValidated?: string;
    // Features
    supportsStreaming?: boolean;
    supportsVision?: boolean;
    supportsTools?: boolean;
    maxTokens?: number;
    isComingSoon?: boolean;
}

const LOCAL_PROVIDER_DEFAULTS: Record<string, string> = {
    ollama: 'http://localhost:11434',
    lmstudio: 'http://localhost:1234/v1',
};

const LOCAL_PROVIDER_DETECTION: Record<
    string,
    {
        endpoint: string;
        mode?: RequestMode;
        method?: string;
    }
> = {
    ollama: { endpoint: '/api/tags', mode: 'cors' },
    lmstudio: { endpoint: '/models', mode: 'no-cors' },
};

const isBrowserDevEnvironment =
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    window.location?.protocol.startsWith('http') &&
    !navigator.userAgent.toLowerCase().includes('electron');

function normalizeBaseUrl(url?: string): string | undefined {
    if (!url) return undefined;
    return url.trim().replace(/\/+$/, '');
}

function resolveProviderBaseUrl(
    provider?: AIProviderConfig,
    override?: string
): string | undefined {
    const overrideUrl = normalizeBaseUrl(override);
    if (overrideUrl) {
        return overrideUrl;
    }
    if (provider) {
        const providerUrl = normalizeBaseUrl(provider.baseUrl);
        if (providerUrl) {
            return providerUrl;
        }
        if (LOCAL_PROVIDER_DEFAULTS[provider.id]) {
            return LOCAL_PROVIDER_DEFAULTS[provider.id];
        }
    }
    return undefined;
}

function sanitizeModelIdentifier(model: unknown): string | null {
    if (!model) return null;
    if (typeof model === 'string') {
        const trimmed = model.trim();
        return trimmed.length > 0 ? trimmed : null;
    }
    return null;
}

function sanitizeModelList(models: unknown): string[] {
    if (!Array.isArray(models)) return [];
    const deduped = new Set<string>();
    for (const entry of models) {
        const id = sanitizeModelIdentifier(entry);
        if (id && !deduped.has(id)) {
            deduped.add(id);
        }
    }
    return Array.from(deduped);
}

function scoreLmStudioModel(modelId: string): number {
    const name = modelId.toLowerCase();
    let score = 0;
    const moeMatch = name.match(/(\d+)\s*(x|×)\s*(\d+)\s*b/);
    if (moeMatch) {
        const experts = parseInt(moeMatch[1] || '0', 10);
        const size = parseInt(moeMatch[3] || '0', 10);
        if (!isNaN(experts) && !isNaN(size)) {
            score = experts * size;
        }
    }
    if (score === 0) {
        const billionMatch = name.match(/(\d+(\.\d+)?)\s*(b|billion)/);
        if (billionMatch) {
            score = parseFloat(billionMatch[1] || '0');
        }
    }
    if (score === 0) {
        const shorthandMatch = name.match(/(\d+(\.\d+)?)b/);
        if (shorthandMatch) {
            score = parseFloat(shorthandMatch[1] || '0');
        }
    }
    if (score === 0) {
        const millionMatch = name.match(/(\d+(\.\d+)?)m/);
        if (millionMatch) {
            score = parseFloat(millionMatch[1] || '0') / 1000;
        }
    }
    if (score === 0) {
        if (name.includes('tiny')) score = 0.25;
        else if (name.includes('mini')) score = 0.5;
        else if (name.includes('small')) score = 1;
        else if (name.includes('medium')) score = 3;
        else if (name.includes('large')) score = 7;
    }
    if (name.includes('70b')) score = Math.max(score, 70);
    if (name.includes('405b')) score = Math.max(score, 405);
    if (name.includes('instruct')) score += 0.3;
    if (name.includes('coder') || name.includes('code')) score += 0.2;
    if (name.includes('chat')) score += 0.1;
    if (name.includes('q4') || name.includes('q5')) score -= 0.3;
    if (name.includes('q6') || name.includes('q8')) score -= 0.2;
    return score;
}

function selectPreferredLmStudioModel(models: string[], current?: string): string {
    if (current && (!models.length || models.includes(current))) {
        return current;
    }
    if (models.length === 0) {
        return current || 'local-model';
    }
    const sorted = [...models].sort((a, b) => scoreLmStudioModel(b) - scoreLmStudioModel(a));
    return sorted[0] || current || 'local-model';
}

function shallowEqualStringArrays(a?: string[], b?: string[]): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

export interface UserProfile {
    id?: number;
    email: string;
    displayName: string;
    avatar?: string;
    timezone: string;
    language: string;
    notificationsEnabled: boolean;
}

export interface GeneralSettings {
    autoSave: boolean;
    autoSaveInterval: number; // in seconds
    showWelcomeScreen: boolean;
    defaultProjectView: 'kanban' | 'list' | 'timeline' | 'calendar';
    compactMode: boolean;
    showTaskIds: boolean;
    enableAnimations: boolean;
    desktopNotifications: DesktopNotificationSettings;
}

export interface DesktopNotificationSettings {
    enabled: boolean; // Master switch
    notifyOnTaskStart: boolean;
    notifyOnTaskComplete: boolean;
    notifyOnTaskError: boolean;
}

export interface SetupWizardState {
    completed: boolean;
    completedAt?: string;
    skipped: boolean;
    skippedAt?: string;
    dontShowAgain: boolean;
}

export interface LocalProviderStatus {
    status: 'unknown' | 'checking' | 'available' | 'unavailable';
    lastChecked?: string;
    details?: string;
    baseUrl?: string;
    models?: string[];
    preferredModel?: string;
}

export interface KeyboardShortcut {
    id: string;
    label: string;
    keys: string[];
    customKeys?: string[];
    category: string;
}

export interface IntegrationAccount {
    id: string; // unique account ID (e.g. email or provider-sub)
    name: string;
    email: string;
    avatar?: string;
    authData?: any; // Token, refresh token, etc. (Store securely in main process ideally, but for UI ref)
    connectedAt: string;
}

export interface IntegrationConfig {
    id: string;
    name: string;
    enabled: boolean;
    connected: boolean;
    config?: Record<string, any>;
    lastSync?: string;
    icon?: string;
    category?: string;
    accounts?: IntegrationAccount[];
}

// MCP Server capability tags
export type MCPServerTag =
    | 'filesystem' // 파일 시스템 접근
    | 'shell' // 쉘 명령 실행
    | 'git' // Git 버전 관리
    | 'http' // HTTP 요청
    | 'database' // 데이터베이스 접근
    | 'cloud' // 클라우드 서비스
    | 'devops' // DevOps 도구
    | 'productivity' // 생산성 도구
    | 'search' // 검색 기능
    | 'browser' // 브라우저 자동화
    | 'memory' // 메모리/컨텍스트 관리
    | 'code' // 코드 분석/실행
    | 'design' // UI/UX 디자인 보조
    | 'communication'; // Communication tools

export type MCPPermissionId = 'read' | 'write' | 'delete' | 'execute' | 'network' | 'secrets';

export interface MCPPermissionDefinition {
    id: MCPPermissionId;
    label: string;
    description: string;
    icon: string;
    category: 'filesystem' | 'system' | 'network' | 'data';
    defaultEnabled?: boolean;
}

export const MCP_PERMISSION_DEFINITIONS: MCPPermissionDefinition[] = [
    {
        id: 'read',
        label: '읽기',
        description: '파일, 리소스, 프로젝트 데이터를 읽을 수 있습니다.',
        icon: '📖',
        category: 'filesystem',
        defaultEnabled: true,
    },
    {
        id: 'write',
        label: '쓰기',
        description: '파일 또는 원격 리소스에 변경사항을 기록할 수 있습니다.',
        icon: '✍️',
        category: 'filesystem',
    },
    {
        id: 'delete',
        label: '삭제',
        description: '파일이나 리소스를 삭제/제거할 수 있습니다.',
        icon: '🗑️',
        category: 'filesystem',
    },
    {
        id: 'execute',
        label: '명령 실행',
        description: '쉘/스크립트 실행 등 시스템 명령을 호출할 수 있습니다.',
        icon: '⚙️',
        category: 'system',
    },
    {
        id: 'network',
        label: '네트워크',
        description: '외부 HTTP API 호출, 다운로드 등 네트워크 접근을 허용합니다.',
        icon: '🌐',
        category: 'network',
    },
    {
        id: 'secrets',
        label: '자격증명 사용',
        description: '토큰/키와 같은 민감한 정보를 MCP가 사용할 수 있습니다.',
        icon: '🔐',
        category: 'data',
    },
];

export type MCPPermissionMap = Record<MCPPermissionId, boolean>;

export interface MCPFeatureScopeConfig {
    id: string;
    label: string;
    description: string;
    requiredScopes: string[];
    toolPatterns?: string[];
    defaultEnabled?: boolean;
}

export interface MCPServerConfig {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    website?: string;
    repository?: string;
    tags: MCPServerTag[];
    // Configuration
    enabled: boolean;
    isConnected?: boolean;
    comingSoon?: boolean; // Mark servers that are not yet available
    // Server settings
    command?: string; // npx, uvx, node, etc.
    args?: string[]; // Command arguments
    env?: Record<string, string>; // Environment variables
    installCommand?: string;
    installArgs?: string[];
    installed?: boolean;
    installLog?: string;
    lastInstalledAt?: string;
    setupInstructions?: string; // Markdown formatted setup guide (e.g., OAuth setup wizard instructions)
    // Custom configuration fields
    config?: {
        path?: string; // For filesystem MCP
        allowedPaths?: string[];
        apiKey?: string; // For external services
        baseUrl?: string;
        username?: string;
        password?: string;
        token?: string;
        region?: string; // For cloud services
        projectId?: string;
        [key: string]: any;
    };
    // Status
    lastValidated?: string;
    permissions: MCPPermissionMap;
    featureScopes?: MCPFeatureScopeConfig[];
    scopes?: string[];
}

const TAG_PERMISSION_DEFAULTS: Partial<Record<MCPServerTag, MCPPermissionId[]>> = {
    filesystem: ['read', 'write', 'delete'],
    shell: ['execute', 'read'],
    git: ['read', 'write'],
    http: ['network', 'read'],
    database: ['read', 'write', 'delete'],
    cloud: ['network', 'read', 'write', 'secrets'],
    devops: ['execute', 'network', 'read'],
    productivity: ['read', 'write'],
    search: ['network', 'read'],
    browser: ['network', 'read'],
    memory: ['read', 'write'],
    code: ['read', 'write', 'execute'],
    design: ['read'],
    communication: ['read', 'write', 'network'],
};

function buildMCPPermissionDefaults(server?: Partial<MCPServerConfig>): MCPPermissionMap {
    const enabledByTag = new Set<MCPPermissionId>();
    const tags = server?.tags || [];
    tags.forEach((tag) => {
        const defaults = TAG_PERMISSION_DEFAULTS[tag];
        if (defaults) {
            defaults.forEach((perm) => enabledByTag.add(perm));
        }
    });

    if (enabledByTag.size === 0) {
        enabledByTag.add('read');
    }

    return MCP_PERMISSION_DEFINITIONS.reduce<MCPPermissionMap>((acc, def) => {
        const fallback = def.defaultEnabled ?? false;
        acc[def.id] = enabledByTag.has(def.id) || fallback;
        return acc;
    }, {} as MCPPermissionMap);
}

function buildFeatureScopeDefaults(server?: Partial<MCPServerConfig>): string[] {
    const selected = new Set<string>();
    if (server?.featureScopes) {
        for (const feature of server.featureScopes) {
            if (feature.defaultEnabled) {
                feature.requiredScopes.forEach((scope) => {
                    if (scope) {
                        selected.add(scope);
                    }
                });
            }
        }
    }
    return Array.from(selected);
}

function mergeMCPPermissions(
    server: Partial<MCPServerConfig>,
    existing?: MCPPermissionMap
): MCPPermissionMap {
    const defaults = buildMCPPermissionDefaults(server);
    if (!existing) {
        return defaults;
    }
    const merged: MCPPermissionMap = { ...defaults };
    for (const def of MCP_PERMISSION_DEFINITIONS) {
        if (Object.prototype.hasOwnProperty.call(existing, def.id)) {
            merged[def.id] = Boolean(existing[def.id]);
        }
    }
    return merged;
}

function mergeFeatureScopeSelections(
    server: Partial<MCPServerConfig>,
    existing?: string[]
): string[] {
    if (!existing || existing.length === 0) {
        return buildFeatureScopeDefaults(server);
    }
    return Array.from(
        new Set(
            existing.filter(
                (scope): scope is string => typeof scope === 'string' && scope.length > 0
            )
        )
    );
}

function withPermissionDefaults<T extends Partial<MCPServerConfig>>(server: T): MCPServerConfig {
    const baseServer = server as MCPServerConfig | undefined;
    const permissions = mergeMCPPermissions(server, baseServer?.permissions);
    const scopes = mergeFeatureScopeSelections(server, baseServer?.scopes);
    return {
        ...server,
        permissions,
        scopes,
    } as MCPServerConfig;
}

// Local Agent Definition
export interface LocalAgent {
    id: string;
    name: string;
    description: string;
    icon: string;
    gradient: string;
    command: string;
    installCommand: string;
    website: string;
    docsUrl: string;
    requiresApiKey: boolean;
    apiKeyEnvVar?: string;
    isInstalled: boolean;
    isChecking: boolean;
    version?: string;
}

export const useSettingsStore = defineStore('settings', () => {
    // ========================================
    // State
    // ========================================

    const localAgents = ref<LocalAgent[]>([
        {
            id: 'claude-code',
            name: 'Claude Code',
            description: 'settings.agents.claude_code.description',
            icon: '🤖',
            gradient: 'bg-gradient-to-br from-orange-400 to-amber-500',
            command: 'claude',
            installCommand: 'npm install -g @anthropic-ai/claude-code',
            website: 'https://docs.anthropic.com/en/docs/claude-code',
            docsUrl: 'https://docs.anthropic.com/en/docs/claude-code/getting-started',
            requiresApiKey: true,
            apiKeyEnvVar: 'ANTHROPIC_API_KEY',
            isInstalled: false,
            isChecking: true,
        },
        {
            id: 'codex',
            name: 'OpenAI Codex CLI',
            description: 'settings.agents.codex.description',
            icon: '💚',
            gradient: 'bg-gradient-to-br from-green-400 to-teal-500',
            command: 'codex',
            installCommand: 'npm install -g @openai/codex',
            website: 'https://github.com/openai/codex',
            docsUrl: 'https://github.com/openai/codex#readme',
            requiresApiKey: true,
            apiKeyEnvVar: 'OPENAI_API_KEY',
            isInstalled: false,
            isChecking: true,
        },
    ]);

    const aiProviders = ref<AIProviderConfig[]>([
        // === Default HighFlow ===
        {
            id: 'default-highflow',
            name: 'HighFlow',
            description: 'settings.ai.providers.default_highflow.description',
            icon: '/src/assets/logo/highflow_logo.png',
            website: 'https://highflow.ai',
            tags: [
                'chat',
                'code',
                'reasoning',
                'image-analysis',
                'long-context',
                'multi-modal',
                'agent',
                'free-tier',
            ],
            authMethods: ['oauth'], // Requires cloud login
            requiresLogin: true, // Login required to use
            enabled: false,
            models: [
                'gemini-3-pro-image-preview',
                'gemini-2.5-flash-image',
                'veo-3.1-generate-preview',
                'veo-2.0-generate-preview',
                'gemini-3.0-pro-exp',
                'gemini-3.0-flash-exp',
                'gemini-2.0-flash-thinking-exp-1219',
                'gemini-2.5-pro',
                'gemini-2.5-flash',
                'gemini-2.5-flash-8b',
                'gemini-exp-1206',
            ],
            defaultModel: 'gemini-2.5-flash',
            supportsStreaming: false, // Streaming not supported through proxy
            supportsVision: true,
            supportsTools: true,
            maxTokens: 1000000,
        },
        // === Major AI Providers ===
        {
            id: 'openai',
            name: 'OpenAI',
            description: 'settings.ai.providers.openai.description',
            icon: 'openai',
            website: 'https://platform.openai.com',
            tags: [
                'chat',
                'code',
                'reasoning',
                'image',
                'image-analysis',
                'tts',
                'stt',
                'embedding',
                'multi-modal',
                'agent',
            ],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: [], // Will be loaded from DB cache on app start
            defaultModel: 'gpt-4o',
            supportsStreaming: true,
            supportsVision: true,
            supportsTools: true,
            maxTokens: 128000,
        },
        {
            id: 'anthropic',
            name: 'Anthropic',
            description: 'settings.ai.providers.anthropic.description',
            icon: 'anthropic',
            website: 'https://console.anthropic.com',
            tags: [
                'chat',
                'code',
                'reasoning',
                'image-analysis',
                'long-context',
                'multi-modal',
                'agent',
            ],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: [
                'claude-4-5-sonnet-20251022',
                'claude-4-5-opus-20251022',
                'claude-3-5-sonnet-20241022',
                'claude-3-5-haiku-20241022',
                'claude-3-opus-20240229',
                'claude-3-sonnet-20240229',
                'claude-3-haiku-20240307',
            ],
            defaultModel: 'claude-3-5-sonnet-20241022',
            supportsStreaming: true,
            supportsVision: true,
            supportsTools: true,
            maxTokens: 200000,
        },
        {
            id: 'google',
            name: 'Google AI',
            description: 'settings.ai.providers.google.description',
            icon: 'google',
            website: 'https://aistudio.google.com',
            tags: [
                'chat',
                'code',
                'reasoning',
                'image-analysis',
                'long-context',
                'multi-modal',
                'agent',
                'free-tier',
            ],
            authMethods: ['both'],
            apiKey: '',
            oauth: {
                authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
                tokenUrl: 'https://oauth2.googleapis.com/token',
                scopes: ['https://www.googleapis.com/auth/generative-language'],
            },
            enabled: false,
            models: [
                'gemini-3-pro-image-preview', // Nano Banana Pro (premium, 4K, grounding)
                'gemini-2.5-flash-image', // Nano Banana (fast, stable)
                'veo-3.1-generate-preview',
                'veo-2.0-generate-preview',
                'gemini-3.0-pro-exp',
                'gemini-3.0-flash-exp',
                'gemini-2.0-flash-thinking-exp-1219',
                'gemini-2.5-pro',
                'gemini-2.5-flash',
                'gemini-2.5-flash-8b',
                'gemini-exp-1206',
            ],
            defaultModel: 'gemini-2.5-flash',
            supportsStreaming: true,
            supportsVision: true,
            supportsTools: true,
            maxTokens: 1000000,
        },

        {
            id: 'azure-openai',
            isComingSoon: true,
            name: 'Azure OpenAI',
            description: 'Microsoft Azure hosted OpenAI models',
            icon: 'azure',
            website: 'https://azure.microsoft.com/products/ai-services/openai-service',
            tags: [
                'chat',
                'code',
                'reasoning',
                'image',
                'image-analysis',
                'tts',
                'stt',
                'embedding',
                'multi-modal',
                'agent',
            ],
            authMethods: ['apiKey', 'oauth'],
            apiKey: '',
            oauth: {
                authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
                tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
                scopes: ['https://cognitiveservices.azure.com/.default'],
            },
            baseUrl: '', // User needs to provide endpoint
            enabled: false,
            models: ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-35-turbo'],
            defaultModel: 'gpt-4o',
            supportsStreaming: true,
            supportsVision: true,
            supportsTools: true,
            maxTokens: 128000,
        },

        // === Open Source / Alternative Providers ===
        {
            id: 'mistral',
            name: 'Mistral AI',
            description: 'Mistral Large, Medium, and Small models',
            icon: 'mistral',
            website: 'https://console.mistral.ai',
            tags: ['chat', 'code', 'reasoning', 'agent', 'free-tier'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: [
                'mistral-large-latest',
                'mistral-medium-latest',
                'mistral-small-latest',
                'codestral-latest',
                'open-mixtral-8x22b',
            ],
            defaultModel: 'mistral-large-latest',
            supportsStreaming: true,
            supportsVision: false,
            supportsTools: true,
            maxTokens: 32000,
        },
        {
            id: 'cohere',
            isComingSoon: true,
            name: 'Cohere',
            description: 'Command R+, Command R, and embedding models',
            icon: 'cohere',
            website: 'https://dashboard.cohere.com',
            tags: ['chat', 'reasoning', 'embedding', 'search', 'long-context', 'agent'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: ['command-r-plus', 'command-r', 'command', 'command-light'],
            defaultModel: 'command-r-plus',
            supportsStreaming: true,
            supportsVision: false,
            supportsTools: true,
            maxTokens: 128000,
        },
        {
            id: 'groq',
            name: 'Groq',
            description: 'Ultra-fast inference with Llama, Mixtral models',
            icon: 'groq',
            website: 'https://console.groq.com',
            tags: ['chat', 'code', 'fast', 'image-analysis', 'free-tier'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: [
                'llama-3.3-70b-versatile',
                'llama-3.1-8b-instant',
                'llama-3.2-90b-vision-preview',
                'mixtral-8x7b-32768',
                'gemma2-9b-it',
            ],
            defaultModel: 'llama-3.3-70b-versatile',
            supportsStreaming: true,
            supportsVision: true,
            supportsTools: true,
            maxTokens: 32768,
        },
        {
            id: 'perplexity',
            isComingSoon: true,
            name: 'Perplexity',
            description: 'Online LLMs with real-time web search',
            icon: 'perplexity',
            website: 'https://www.perplexity.ai/settings/api',
            tags: ['chat', 'search', 'reasoning', 'long-context'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: [
                'sonar-pro',
                'sonar',
                'sonar-reasoning',
                'llama-3.1-sonar-large-128k-online',
                'llama-3.1-sonar-small-128k-online',
                'llama-3.1-sonar-large-128k-chat',
            ],
            defaultModel: 'llama-3.1-sonar-large-128k-online',
            supportsStreaming: true,
            supportsVision: false,
            supportsTools: false,
            maxTokens: 128000,
        },
        {
            id: 'together',
            isComingSoon: true,
            name: 'Together AI',
            description: 'Open source models at scale',
            icon: 'together',
            website: 'https://api.together.xyz',
            tags: ['chat', 'code', 'image', 'embedding', 'fast'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: [
                'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
                'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
                'mistralai/Mixtral-8x22B-Instruct-v0.1',
            ],
            defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
            supportsStreaming: true,
            supportsVision: false,
            supportsTools: true,
            maxTokens: 32768,
        },
        {
            id: 'fireworks',
            isComingSoon: true,
            name: 'Fireworks AI',
            description: 'Fast inference for open source models',
            icon: 'fireworks',
            website: 'https://fireworks.ai',
            tags: ['chat', 'code', 'image', 'fast', 'embedding'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: [
                'accounts/fireworks/models/llama-v3p1-70b-instruct',
                'accounts/fireworks/models/llama-v3p1-8b-instruct',
                'accounts/fireworks/models/mixtral-8x22b-instruct',
            ],
            defaultModel: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
            supportsStreaming: true,
            supportsVision: false,
            supportsTools: true,
            maxTokens: 32768,
        },
        {
            id: 'deepseek',
            isComingSoon: true,
            name: 'DeepSeek',
            description: 'DeepSeek Coder and Chat models',
            icon: 'deepseek',
            website: 'https://platform.deepseek.com',
            tags: ['chat', 'code', 'reasoning', 'long-context', 'free-tier'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: ['deepseek-chat', 'deepseek-reasoner', 'deepseek-coder'],
            defaultModel: 'deepseek-chat',
            supportsStreaming: true,
            supportsVision: false,
            supportsTools: true,
            maxTokens: 64000,
        },

        // === Local / Self-hosted ===
        {
            id: 'ollama',
            isComingSoon: true,
            name: 'Ollama',
            description: 'Run LLMs locally on your machine',
            icon: 'ollama',
            website: 'https://ollama.ai',
            tags: ['chat', 'code', 'image-analysis', 'local', 'free-tier'],
            authMethods: ['apiKey'], // No auth needed, but baseUrl required
            baseUrl: 'http://localhost:11434',
            enabled: false,
            models: [
                'llama3.1',
                'llama3.1:70b',
                'codellama',
                'mistral',
                'mixtral',
                'qwen2.5-coder',
            ],
            defaultModel: 'llama3.1',
            supportsStreaming: true,
            supportsVision: true,
            supportsTools: true,
            maxTokens: 8192,
        },
        {
            id: 'lmstudio',
            name: 'LM Studio',
            description: 'Local LLM server with OpenAI-compatible API',
            icon: 'lmstudio',
            website: 'https://lmstudio.ai',
            tags: ['chat', 'code', 'local', 'free-tier'],
            authMethods: ['apiKey'],
            baseUrl: 'http://localhost:1234/v1',
            enabled: false,
            models: ['local-model'], // User configures models
            defaultModel: 'local-model',
            supportsStreaming: true,
            supportsVision: false,
            supportsTools: false,
            maxTokens: 4096,
        },

        // === Specialized Providers ===
        {
            id: 'openrouter',
            isComingSoon: true,
            name: 'OpenRouter',
            description: 'Access multiple AI providers through one API',
            icon: 'openrouter',
            website: 'https://openrouter.ai',
            tags: [
                'chat',
                'code',
                'reasoning',
                'image-analysis',
                'multi-modal',
                'agent',
                'free-tier',
            ],
            authMethods: ['apiKey', 'oauth'],
            apiKey: '',
            oauth: {
                authUrl: 'https://openrouter.ai/auth',
                scopes: ['openid', 'profile'],
            },
            enabled: false,
            models: [
                'anthropic/claude-3.5-sonnet',
                'openai/gpt-4o',
                'google/gemini-pro-1.5',
                'meta-llama/llama-3.1-70b-instruct',
            ],
            defaultModel: 'anthropic/claude-3.5-sonnet',
            supportsStreaming: true,
            supportsVision: true,
            supportsTools: true,
            maxTokens: 200000,
        },
        {
            id: 'huggingface',
            isComingSoon: true,
            name: 'Hugging Face',
            description: 'Inference API for thousands of models',
            icon: 'huggingface',
            website: 'https://huggingface.co/settings/tokens',
            tags: ['chat', 'code', 'image', 'audio', 'embedding', 'multi-modal', 'free-tier'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: [
                'meta-llama/Meta-Llama-3.1-70B-Instruct',
                'mistralai/Mixtral-8x7B-Instruct-v0.1',
                'bigcode/starcoder2-15b',
            ],
            defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
            supportsStreaming: true,
            supportsVision: false,
            supportsTools: false,
            maxTokens: 8192,
        },
        {
            id: 'replicate',
            isComingSoon: true,
            name: 'Replicate',
            description: 'Run open-source models in the cloud',
            icon: 'replicate',
            website: 'https://replicate.com',
            tags: ['chat', 'image', 'video', 'audio', 'multi-modal'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: [
                'meta/meta-llama-3.1-405b-instruct',
                'meta/llama-2-70b-chat',
                'mistralai/mixtral-8x7b-instruct-v0.1',
            ],
            defaultModel: 'meta/meta-llama-3.1-405b-instruct',
            supportsStreaming: true,
            supportsVision: true,
            supportsTools: false,
            maxTokens: 8192,
        },

        // === UI/UX Design Providers ===
        {
            id: 'figma-ai',
            isComingSoon: true,
            name: 'Figma AI',
            description: 'Figma Dev Mode AI와 디자인 에이전트를 통한 UI/UX 자동화',
            icon: 'figma',
            website: 'https://www.figma.com/developers/api',
            tags: ['design', 'image', 'multi-modal'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: ['figma-design-agent', 'figma-flow-scribe'],
            defaultModel: 'figma-design-agent',
            supportsStreaming: false,
            supportsVision: true,
            supportsTools: false,
            maxTokens: 0,
        },
        {
            id: 'galileo',
            isComingSoon: true,
            name: 'Galileo AI',
            description: '고해상도 UI 목업과 UX 카피를 자동으로 생성하는 디자인 특화 모델',
            icon: 'galileo',
            website: 'https://www.galileo.ai',
            tags: ['design', 'image', 'multi-modal'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: ['galileo-studio', 'galileo-mockup-pro'],
            defaultModel: 'galileo-studio',
            supportsStreaming: false,
            supportsVision: true,
            supportsTools: false,
            maxTokens: 0,
        },
        {
            id: 'uizard',
            isComingSoon: true,
            name: 'Uizard Autodesigner',
            description: '와이어프레임, 컴포넌트, UX 카피를 빠르게 생성하는 UI/UX 전용 AI',
            icon: 'uizard',
            website: 'https://uizard.io',
            tags: ['design', 'image', 'multi-modal', 'free-tier'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: ['uizard-autodesigner', 'uizard-wireflow'],
            defaultModel: 'uizard-autodesigner',
            supportsStreaming: false,
            supportsVision: true,
            supportsTools: false,
            maxTokens: 0,
        },

        // === Image/Video Generation Providers ===
        {
            id: 'stability',
            isComingSoon: true,
            name: 'Stability AI',
            description: 'Stable Diffusion image generation models',
            icon: 'stability',
            website: 'https://platform.stability.ai',
            tags: ['image', 'video'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: [
                'stable-diffusion-xl-1024-v1-0',
                'stable-diffusion-v1-6',
                'stable-video-diffusion',
                'stable-image-core',
                'stable-image-ultra',
            ],
            defaultModel: 'stable-diffusion-xl-1024-v1-0',
            supportsStreaming: false,
            supportsVision: false,
            supportsTools: false,
            maxTokens: 0,
        },
        {
            id: 'runway',
            isComingSoon: true,
            name: 'Runway',
            description: 'AI-powered video generation and editing',
            icon: 'runway',
            website: 'https://runwayml.com',
            tags: ['video', 'image'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: ['gen-3-alpha', 'gen-2', 'gen-1'],
            defaultModel: 'gen-3-alpha',
            supportsStreaming: false,
            supportsVision: false,
            supportsTools: false,
            maxTokens: 0,
        },
        {
            id: 'pika',
            isComingSoon: true,
            name: 'Pika',
            description: 'AI video generation platform',
            icon: 'pika',
            website: 'https://pika.art',
            tags: ['video', 'image'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: ['pika-1.0', 'pika-1.5'],
            defaultModel: 'pika-1.5',
            supportsStreaming: false,
            supportsVision: false,
            supportsTools: false,
            maxTokens: 0,
        },

        // === Audio/TTS/Music Providers ===
        {
            id: 'google-tts',
            isComingSoon: true,
            name: 'Google Cloud TTS',
            description: 'Google Cloud Text-to-Speech service',
            icon: 'google',
            website: 'https://cloud.google.com/text-to-speech',
            tags: ['tts', 'audio'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: [
                'en-US-Neural2-A',
                'en-US-Neural2-C',
                'en-US-Wavenet-D',
                'ko-KR-Neural2-A',
                'ko-KR-Wavenet-A',
            ],
            defaultModel: 'en-US-Neural2-A',
            supportsStreaming: true,
            supportsVision: false,
            supportsTools: false,
            maxTokens: 5000,
        },
        {
            id: 'elevenlabs',
            isComingSoon: true,
            name: 'ElevenLabs',
            description: 'Advanced AI voice synthesis and cloning',
            icon: 'elevenlabs',
            website: 'https://elevenlabs.io',
            tags: ['tts', 'audio', 'stt'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: ['eleven_multilingual_v2', 'eleven_turbo_v2', 'eleven_monolingual_v1'],
            defaultModel: 'eleven_multilingual_v2',
            supportsStreaming: true,
            supportsVision: false,
            supportsTools: false,
            maxTokens: 5000,
        },
        {
            id: 'suno',
            isComingSoon: true,
            name: 'Suno',
            description: 'AI music generation platform',
            icon: 'suno',
            website: 'https://suno.ai',
            tags: ['music', 'audio'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: ['suno-v3.5', 'suno-v3', 'bark'],
            defaultModel: 'suno-v3.5',
            supportsStreaming: false,
            supportsVision: false,
            supportsTools: false,
            maxTokens: 0,
        },

        // === Chinese AI Providers ===
        {
            id: 'zhipu',
            isComingSoon: true,
            name: 'Zhipu AI (智谱)',
            description: 'GLM-4 and ChatGLM models',
            icon: 'zhipu',
            website: 'https://open.bigmodel.cn',
            tags: [
                'chat',
                'code',
                'reasoning',
                'image-analysis',
                'long-context',
                'multi-modal',
                'agent',
            ],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: ['glm-4', 'glm-4-flash', 'glm-4v', 'glm-3-turbo'],
            defaultModel: 'glm-4',
            supportsStreaming: true,
            supportsVision: true,
            supportsTools: true,
            maxTokens: 128000,
        },
        {
            id: 'moonshot',
            isComingSoon: true,
            name: 'Moonshot AI (月之暗面)',
            description: 'Kimi chat models with long context',
            icon: 'moonshot',
            website: 'https://platform.moonshot.cn',
            tags: ['chat', 'code', 'reasoning', 'long-context', 'agent'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: ['moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k'],
            defaultModel: 'moonshot-v1-128k',
            supportsStreaming: true,
            supportsVision: false,
            supportsTools: true,
            maxTokens: 128000,
        },
        {
            id: 'qwen',
            isComingSoon: true,
            name: 'Alibaba Qwen (通义千问)',
            description: 'Qwen models for chat and coding',
            icon: 'qwen',
            website: 'https://dashscope.aliyun.com',
            tags: ['chat', 'code', 'reasoning', 'image-analysis', 'multi-modal', 'agent'],
            authMethods: ['apiKey'],
            apiKey: '',
            enabled: false,
            models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-coder-turbo'],
            defaultModel: 'qwen-max',
            supportsStreaming: true,
            supportsVision: true,
            supportsTools: true,
            maxTokens: 32000,
        },
        {
            id: 'baidu',
            isComingSoon: true,
            name: 'Baidu ERNIE (文心一言)',
            description: 'ERNIE Bot models',
            icon: 'baidu',
            website: 'https://cloud.baidu.com/product/wenxinworkshop',
            tags: ['chat', 'code', 'reasoning', 'image-analysis', 'multi-modal', 'agent'],
            authMethods: ['apiKey', 'oauth'],
            apiKey: '',
            oauth: {
                authUrl: 'https://openapi.baidu.com/oauth/2.0/authorize',
                tokenUrl: 'https://openapi.baidu.com/oauth/2.0/token',
            },
            enabled: false,
            models: ['ernie-4.0', 'ernie-3.5-turbo', 'ernie-speed'],
            defaultModel: 'ernie-4.0',
            supportsStreaming: true,
            supportsVision: true,
            supportsTools: true,
            maxTokens: 8192,
        },
    ]);

    const userProfile = ref<UserProfile>({
        email: '',
        displayName: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: 'ko',
        notificationsEnabled: true,
    });

    const generalSettings = ref<GeneralSettings>({
        autoSave: true,
        autoSaveInterval: 30,
        showWelcomeScreen: true,
        defaultProjectView: 'kanban',
        compactMode: false,
        showTaskIds: false,
        enableAnimations: true,
        desktopNotifications: {
            enabled: true,
            notifyOnTaskStart: true,
            notifyOnTaskComplete: true,
            notifyOnTaskError: true,
        },
    });

    const keyboardShortcuts = ref<KeyboardShortcut[]>([
        { id: 'command-palette', label: 'Command Palette', keys: ['⌘', 'K'], category: 'General' },
        { id: 'new-project', label: 'New Project', keys: ['⌘', 'N'], category: 'Projects' },
        { id: 'new-task', label: 'New Task', keys: ['⌘', 'T'], category: 'Tasks' },
        { id: 'toggle-sidebar', label: 'Toggle Sidebar', keys: ['⌘', 'B'], category: 'View' },
        { id: 'search', label: 'Search', keys: ['⌘', 'F'], category: 'General' },
        { id: 'save', label: 'Save', keys: ['⌘', 'S'], category: 'General' },
        { id: 'undo', label: 'Undo', keys: ['⌘', 'Z'], category: 'Edit' },
        { id: 'redo', label: 'Redo', keys: ['⌘', '⇧', 'Z'], category: 'Edit' },
        { id: 'settings', label: 'Settings', keys: ['⌘', ','], category: 'General' },
        { id: 'close-modal', label: 'Close Modal', keys: ['Esc'], category: 'General' },
    ]);

    const integrations = ref<IntegrationConfig[]>([
        { id: 'slack', name: 'Slack', enabled: false, connected: false, accounts: [] },
        {
            id: 'google_drive',
            name: 'Google Drive',
            enabled: false,
            connected: false,
            accounts: [],
        },
        { id: 'discord', name: 'Discord', enabled: false, connected: false, accounts: [] },
        { id: 'github', name: 'GitHub', enabled: false, connected: false },
        { id: 'gitlab', name: 'GitLab', enabled: false, connected: false },
        { id: 'google-drive', name: 'Google Drive', enabled: false, connected: false },
        { id: 'notion', name: 'Notion', enabled: false, connected: false },
    ]);

    // MCP Servers
    const mcpServerSeeds: Omit<MCPServerConfig, 'permissions'>[] = [
        // === Core MCP Servers ===
        {
            id: 'filesystem',
            name: 'Filesystem',
            description: 'settings.mcp.servers.filesystem.description',
            icon: 'folder',
            website: 'https://modelcontextprotocol.io/docs/servers/filesystem',
            repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
            tags: ['filesystem'],
            enabled: false,
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/directory'],
            installCommand: 'npm',
            installArgs: ['install', '-g', '@modelcontextprotocol/server-filesystem'],
            installed: false,
            comingSoon: true,
        },
        {
            id: 'shell',
            name: 'Shell',
            description: 'settings.mcp.servers.shell.description',
            icon: 'terminal',
            website: 'https://github.com/anthropics/anthropic-quickstarts/tree/main/mcp-shell',
            repository: 'https://github.com/anthropics/anthropic-quickstarts/tree/main/mcp-shell',
            tags: ['shell', 'code'],
            enabled: false,
            command: 'npx',
            args: ['-y', 'mcp-shell'],
            installCommand: 'npm',
            installArgs: ['install', '-g', 'mcp-shell'],
            installed: false,
            comingSoon: true,
        },
        {
            id: 'git',
            name: 'Git',
            description: 'settings.mcp.servers.git.description',
            icon: 'git-branch',
            website: 'https://modelcontextprotocol.io/docs/servers/git',
            repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/git',
            tags: ['git', 'code'],
            enabled: false,
            command: 'uvx',
            args: ['mcp-server-git', '--repository', '/path/to/repo'],
            installCommand: 'pip',
            installArgs: ['install', 'mcp-server-git'],
            installed: false,
            comingSoon: true,
        },
        {
            id: 'fetch',
            name: 'HTTP Fetch',
            description: 'settings.mcp.servers.fetch.description',
            icon: 'globe',
            website: 'https://modelcontextprotocol.io/docs/servers/fetch',
            repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
            tags: ['http', 'search'],
            enabled: false,
            command: 'uvx',
            args: ['mcp-server-fetch'],
            installCommand: 'npm',
            installArgs: ['install', '-g', '@modelcontextprotocol/server-fetch'],
            installed: false,
            comingSoon: true,
        },

        // === Atlassian ===
        {
            id: 'jira',
            name: 'Jira',
            description: 'settings.mcp.servers.jira.description',
            icon: 'jira',
            website: 'https://github.com/sooperset/mcp-atlassian',
            repository: 'https://github.com/sooperset/mcp-atlassian',
            tags: ['productivity', 'devops'],
            enabled: false,
            command: 'uvx',
            args: ['mcp-atlassian'],
            installCommand: 'pip',
            installArgs: ['install', 'mcp-atlassian'],
            installed: false,
            comingSoon: true,
            config: {
                baseUrl: '',
                username: '',
                token: '',
            },
        },
        {
            id: 'confluence',
            name: 'Confluence',
            description: 'settings.mcp.servers.confluence.description',
            icon: 'confluence',
            website: 'https://github.com/sooperset/mcp-atlassian',
            repository: 'https://github.com/sooperset/mcp-atlassian',
            tags: ['productivity', 'search'],
            enabled: false,
            command: 'uvx',
            args: ['mcp-atlassian'],
            installCommand: 'pip',
            installArgs: ['install', 'mcp-atlassian'],
            installed: false,
            comingSoon: true,
            config: {
                baseUrl: '',
                username: '',
                token: '',
            },
        },
        {
            id: 'atlassian-cloud-oauth',
            name: 'Atlassian Cloud (OAuth)',
            description: 'settings.mcp.servers.atlassian_cloud_oauth.description',
            icon: 'atlassian',
            website: 'https://github.com/sooperset/mcp-atlassian',
            repository: 'https://github.com/sooperset/mcp-atlassian',
            tags: ['productivity', 'devops', 'search'],
            enabled: false,
            command: 'docker',
            args: [
                'run',
                '--rm',
                '-i',
                '-v',
                '${HOME}/.mcp-atlassian:/home/app/.mcp-atlassian',
                '-e',
                'JIRA_URL',
                '-e',
                'CONFLUENCE_URL',
                '-e',
                'ATLASSIAN_OAUTH_CLIENT_ID',
                '-e',
                'ATLASSIAN_OAUTH_CLIENT_SECRET',
                '-e',
                'ATLASSIAN_OAUTH_REDIRECT_URI',
                '-e',
                'ATLASSIAN_OAUTH_SCOPE',
                '-e',
                'ATLASSIAN_OAUTH_CLOUD_ID',
                'ghcr.io/sooperset/mcp-atlassian:latest',
            ],
            installCommand: 'docker',
            installArgs: ['pull', 'ghcr.io/sooperset/mcp-atlassian:latest'],
            installed: false,
            comingSoon: true,
            env: {
                JIRA_URL: '',
                CONFLUENCE_URL: '',
                ATLASSIAN_OAUTH_CLIENT_ID: '',
                ATLASSIAN_OAUTH_CLIENT_SECRET: '',
                ATLASSIAN_OAUTH_REDIRECT_URI: 'http://localhost:8080/callback',
                ATLASSIAN_OAUTH_SCOPE:
                    'read:jira-work write:jira-work read:confluence-content.all write:confluence-content offline_access',
                ATLASSIAN_OAUTH_CLOUD_ID: '',
            },
            config: {
                jiraUrl: '',
                confluenceUrl: '',
                oauthClientId: '',
                oauthClientSecret: '',
                oauthRedirectUri: 'http://localhost:8080/callback',
                oauthScope:
                    'read:jira-work write:jira-work read:confluence-content.all write:confluence-content offline_access',
                oauthCloudId: '',
            },
            setupInstructions: `
## OAuth 2.0 Setup Guide

### Step 1: Create OAuth App
1. Go to [Atlassian Developer Console](https://developer.atlassian.com/console/myapps/)
2. Click "Create" and choose "OAuth 2.0 (3LO) integration"
3. Give your app a name
4. Set **Callback URL**: \`http://localhost:8080/callback\`
5. Configure **Permissions (Scopes)**:
   - Jira: \`read:jira-work\`, \`write:jira-work\`
   - Confluence: \`read:confluence-content.all\`, \`write:confluence-content\`
   - **Important**: Add \`offline_access\` for automatic token refresh
6. Save and note your **Client ID** and **Client Secret**

### Step 2: Run OAuth Setup Wizard
\`\`\`bash
docker run --rm -i \\
  -p 8080:8080 \\
  -v "\${HOME}/.mcp-atlassian:/home/app/.mcp-atlassian" \\
  ghcr.io/sooperset/mcp-atlassian:latest --oauth-setup -v
\`\`\`

### Step 3: Complete Authorization
1. The wizard will open your browser
2. Log in to Atlassian and authorize the app
3. The wizard will output your **Cloud ID**

### Step 4: Configure Below
Enter all values from the wizard in the configuration form below:
- **JIRA_URL**: Your Jira Cloud URL (e.g., \`https://your-company.atlassian.net\`)
- **CONFLUENCE_URL**: Your Confluence URL (e.g., \`https://your-company.atlassian.net/wiki\`)
- **ATLASSIAN_OAUTH_CLIENT_ID**: From Step 1
- **ATLASSIAN_OAUTH_CLIENT_SECRET**: From Step 1
- **ATLASSIAN_OAUTH_CLOUD_ID**: From Step 3 wizard output

**Note**: The volume mount (\`-v ...\`) is crucial for persisting OAuth tokens and enabling automatic refresh.
            `,
        },
        {
            id: 'atlassian-rovo',
            name: 'Atlassian Rovo MCP (Official)',
            description: 'settings.mcp.servers.atlassian_rovo.description',
            icon: 'atlassian',
            website: 'https://support.atlassian.com/atlassian-rovo-mcp-server/',
            repository: 'https://www.npmjs.com/package/mcp-remote',
            tags: ['productivity', 'devops', 'search'],
            enabled: false,
            command: 'npx',
            args: ['-y', 'mcp-remote', 'https://mcp.atlassian.com/v1/mcp'],
            installCommand: 'npm',
            installArgs: ['install', '-g', 'mcp-remote'],
            installed: false,
            setupInstructions: `
## Atlassian Rovo MCP Server Setup

### Overview
Atlassian Rovo MCP Server is the **official cloud-based MCP server** from Atlassian. It provides seamless integration with Jira, Confluence, and Compass using OAuth 2.1 authentication.

### Prerequisites
- Node.js v18+ installed
- Atlassian Cloud site with Jira, Confluence, and/or Compass
- Modern browser for OAuth authorization

### Setup Steps

#### Step 1: Connect via mcp-remote
The connection is automatically handled by \`mcp-remote\` proxy:
\`\`\`bash
npx -y mcp-remote https://mcp.atlassian.com/v1/mcp
\`\`\`

#### Step 2: OAuth Authorization
1. When you first use the MCP server, it will trigger an OAuth 2.1 flow
2. Your browser will open automatically
3. Log in to your Atlassian Cloud account
4. Approve the requested permissions
5. The OAuth tokens are securely stored for future use

#### Step 3: Start Using
Once authorized, the MCP server will have access to:
- **Jira**: Create, update, search issues
- **Confluence**: Search, create, update pages
- **Compass**: Component and service management

### Key Features
- ✅ **Official Atlassian Service**: Maintained by Atlassian
- ✅ **No Manual OAuth Setup**: Just-in-time authorization (lazy loading)
- ✅ **Automatic Installation**: Installed on first OAuth consent
- ✅ **Session-based Tokens**: Secure, scoped access
- ✅ **Permission Inheritance**: Respects existing Atlassian permissions

### Security
- OAuth 2.1 (3LO) authorization
- All actions respect user's existing access controls
- Session-based tokens
- No manual token management required

### Note
This is different from the self-hosted Docker version (\`atlassian-cloud-oauth\`). The Rovo MCP Server is a fully managed cloud service by Atlassian.

**Important**: The first user to authorize must have access to all Atlassian apps (Jira, Confluence, Compass) to properly register the MCP app for your site.
            `,
        },

        // === Cloud & DevOps ===
        {
            id: 'aws',
            name: 'AWS',
            description: 'settings.mcp.servers.aws.description',
            icon: 'aws',
            website: 'https://github.com/aws-samples/sample-mcp-server',
            repository: 'https://github.com/aws-samples/sample-mcp-server',
            tags: ['cloud', 'devops'],
            enabled: false,
            command: 'npx',
            args: ['-y', '@anthropic-ai/mcp-server-aws'],
            installCommand: 'npm',
            installArgs: ['install', '-g', '@anthropic-ai/mcp-server-aws'],
            installed: false,
            comingSoon: true,
            config: {
                region: 'us-east-1',
                accessKeyId: '',
                secretAccessKey: '',
            },
        },
        {
            id: 'kubernetes',
            name: 'Kubernetes',
            description: 'settings.mcp.servers.kubernetes.description',
            icon: 'kubernetes',
            website: 'https://github.com/strowk/mcp-k8s-go',
            repository: 'https://github.com/strowk/mcp-k8s-go',
            tags: ['cloud', 'devops'],
            enabled: false,
            command: 'mcp-k8s',
            args: [],
            installCommand: 'npm',
            installArgs: ['install', '-g', 'mcp-k8s'],
            installed: false,
            comingSoon: true,
            config: {
                kubeconfig: '~/.kube/config',
                context: '',
            },
        },

        // === Database ===
        {
            id: 'sqlite',
            name: 'SQLite',
            description: 'settings.mcp.servers.sqlite.description',
            icon: 'database',
            website: 'https://modelcontextprotocol.io/docs/servers/sqlite',
            repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
            tags: ['database'],
            enabled: false,
            command: 'uvx',
            args: ['mcp-server-sqlite', '--db-path', '/path/to/database.db'],
            installCommand: 'pip',
            installArgs: ['install', 'mcp-server-sqlite'],
            installed: false,
            comingSoon: true,
        },
        {
            id: 'postgres',
            name: 'PostgreSQL',
            description: 'settings.mcp.servers.postgres.description',
            icon: 'database',
            website: 'https://modelcontextprotocol.io/docs/servers/postgres',
            repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
            tags: ['database'],
            enabled: false,
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-postgres'],
            installCommand: 'npm',
            installArgs: ['install', '-g', '@modelcontextprotocol/server-postgres'],
            installed: false,
            comingSoon: true,
            config: {
                connectionString: '',
            },
        },

        // === Search & Memory ===
        {
            id: 'brave-search',
            name: 'Brave Search',
            description: 'settings.mcp.servers.brave_search.description',
            icon: 'search',
            website: 'https://modelcontextprotocol.io/docs/servers/brave-search',
            repository:
                'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
            tags: ['search', 'http'],
            enabled: false,
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-brave-search'],
            installCommand: 'npm',
            installArgs: ['install', '-g', '@modelcontextprotocol/server-brave-search'],
            installed: false,
            comingSoon: true,
            config: {
                apiKey: '',
            },
        },
        {
            id: 'memory',
            name: 'Memory',
            description: 'settings.mcp.servers.memory.description',
            icon: 'brain',
            website: 'https://modelcontextprotocol.io/docs/servers/memory',
            repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
            tags: ['memory'],
            enabled: false,
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-memory'],
            installCommand: 'npm',
            installArgs: ['install', '-g', '@modelcontextprotocol/server-memory'],
            installed: false,
            comingSoon: true,
        },

        // === Browser Automation ===
        {
            id: 'puppeteer',
            name: 'Puppeteer',
            description: 'settings.mcp.servers.puppeteer.description',
            icon: 'browser',
            website: 'https://modelcontextprotocol.io/docs/servers/puppeteer',
            repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
            tags: ['browser', 'http'],
            enabled: false,
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-puppeteer'],
            installCommand: 'npm',
            installArgs: ['install', '-g', '@modelcontextprotocol/server-puppeteer'],
            installed: false,
            comingSoon: true,
        },
        {
            id: 'playwright',
            name: 'Playwright',
            description: 'settings.mcp.servers.playwright.description',
            icon: 'browser',
            website: 'https://github.com/executeautomation/mcp-playwright',
            repository: 'https://github.com/executeautomation/mcp-playwright',
            tags: ['browser', 'http'],
            enabled: false,
            command: 'npx',
            args: ['-y', '@anthropic-ai/mcp-server-playwright'],
            installCommand: 'npm',
            installArgs: ['install', '-g', '@anthropic-ai/mcp-server-playwright'],
            installed: false,
            comingSoon: true,
        },

        // === Productivity ===
        {
            id: 'github-mcp',
            name: 'GitHub',
            description: 'settings.mcp.servers.github_mcp.description',
            icon: 'github',
            website: 'https://modelcontextprotocol.io/docs/servers/github',
            repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
            tags: ['git', 'productivity', 'code'],
            enabled: false,
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            installCommand: 'npm',
            installArgs: ['install', '-g', '@modelcontextprotocol/server-github'],
            installed: false,
            comingSoon: true,
            config: {
                token: '',
            },
        },
        {
            id: 'github-remote',
            name: 'GitHub (Remote)',
            description: 'settings.mcp.servers.github_remote.description',
            icon: 'github',
            website: 'https://github.com/github/github-mcp-server',
            repository: 'https://github.com/github/github-mcp-server',
            tags: ['git', 'productivity', 'code'],
            enabled: false,
            // Remote server doesn't use command/npx typically but needs endpoint config
            // For UI consistency we might keep empty command or specific placeholder
            command: '',
            args: [],
            installCommand: '',
            installArgs: [],
            installed: true, // Always "installed" as it is remote
            config: {
                token: '',
                endpoint: 'https://api.githubcopilot.com/mcp/',
            },
        },
        {
            id: 'gitlab-mcp',
            name: 'GitLab',
            description: 'settings.mcp.servers.gitlab_mcp.description',
            icon: 'gitlab',
            website: 'https://github.com/theomarchand/mcp-server-gitlab',
            repository: 'https://github.com/theomarchand/mcp-server-gitlab',
            tags: ['git', 'productivity', 'code'],
            enabled: false,
            command: 'npx',
            args: ['-y', 'mcp-server-gitlab'],
            installCommand: 'npm',
            installArgs: ['install', '-g', 'mcp-server-gitlab'],
            installed: false,
            config: {
                token: '',
                baseUrl: 'https://gitlab.com',
            },
        },
        {
            id: 'slack-mcp',
            name: 'Slack',
            description: 'settings.mcp.servers.slack_mcp.description',
            icon: 'slack',
            website: 'https://modelcontextprotocol.io/docs/servers/slack',
            repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
            tags: ['productivity', 'communication'],
            enabled: false,
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-slack'],
            installCommand: 'npm',
            installArgs: ['install', '-g', '@modelcontextprotocol/server-slack'],
            installed: false,
            config: {
                token: '',
                teamId: '',
            },
            featureScopes: [
                {
                    id: 'slack.channels.read',
                    label: 'settings.mcp.features.slack.channels_read.label',
                    description: 'settings.mcp.features.slack.channels_read.description',
                    requiredScopes: ['channels:read'],
                    toolPatterns: ['channels_list', 'list_channels', 'fetch_channels'],
                    defaultEnabled: true,
                },
                {
                    id: 'slack.channels.history',
                    label: 'settings.mcp.features.slack.channels_history.label',
                    description: 'settings.mcp.features.slack.channels_history.description',
                    requiredScopes: ['channels:history'],
                    toolPatterns: ['channels_history', 'fetch_channel_history'],
                    defaultEnabled: true,
                },
                {
                    id: 'slack.groups.read',
                    label: 'settings.mcp.features.slack.groups_read.label',
                    description: 'settings.mcp.features.slack.groups_read.description',
                    requiredScopes: ['groups:read'],
                    toolPatterns: ['groups_list', 'list_groups', 'fetch_private_channels'],
                    defaultEnabled: true,
                },
                {
                    id: 'slack.groups.history',
                    label: 'settings.mcp.features.slack.groups_history.label',
                    description: 'settings.mcp.features.slack.groups_history.description',
                    requiredScopes: ['groups:history'],
                    toolPatterns: ['groups_history', 'fetch_group_history'],
                    defaultEnabled: true,
                },
                {
                    id: 'slack.dm.read',
                    label: 'settings.mcp.features.slack.dm_read.label',
                    description: 'settings.mcp.features.slack.dm_read.description',
                    requiredScopes: ['im:read'],
                    toolPatterns: ['im_list', 'dm_list'],
                    defaultEnabled: true,
                },
                {
                    id: 'slack.dm.history',
                    label: 'settings.mcp.features.slack.dm_history.label',
                    description: 'settings.mcp.features.slack.dm_history.description',
                    requiredScopes: ['im:history'],
                    toolPatterns: ['im_history', 'dm_history'],
                    defaultEnabled: true,
                },
                {
                    id: 'slack.mpdm.read',
                    label: 'settings.mcp.features.slack.mpdm_read.label',
                    description: 'settings.mcp.features.slack.mpdm_read.description',
                    requiredScopes: ['mpim:read'],
                    toolPatterns: ['mpim_list', 'group_dm_list'],
                    defaultEnabled: true,
                },
                {
                    id: 'slack.mpdm.history',
                    label: 'settings.mcp.features.slack.mpdm_history.label',
                    description: 'settings.mcp.features.slack.mpdm_history.description',
                    requiredScopes: ['mpim:history'],
                    toolPatterns: ['mpim_history', 'group_dm_history'],
                    defaultEnabled: true,
                },
                {
                    id: 'slack.messages.write',
                    label: 'settings.mcp.features.slack.messages_write.label',
                    description: 'settings.mcp.features.slack.messages_write.description',
                    requiredScopes: ['chat:write'],
                    toolPatterns: ['chat_post', 'chat_postMessage', 'chat_update', 'send_message'],
                    defaultEnabled: true,
                },
                {
                    id: 'slack.files.write',
                    label: 'settings.mcp.features.slack.files_write.label',
                    description: 'settings.mcp.features.slack.files_write.description',
                    requiredScopes: ['files:write'],
                    toolPatterns: ['files_upload', 'upload_file'],
                    defaultEnabled: true,
                },
                {
                    id: 'slack.users.read',
                    label: 'settings.mcp.features.slack.users_read.label',
                    description: 'settings.mcp.features.slack.users_read.description',
                    requiredScopes: ['users:read'],
                    toolPatterns: ['users_list', 'users_info'],
                    defaultEnabled: true,
                },
                {
                    id: 'slack.reactions.write',
                    label: 'settings.mcp.features.slack.reactions_write.label',
                    description: 'settings.mcp.features.slack.reactions_write.description',
                    requiredScopes: ['reactions:write'],
                    toolPatterns: ['reactions_add', 'reactions_remove'],
                },
            ],
        },
        {
            id: 'notion-mcp',
            name: 'Notion',
            description: 'settings.mcp.servers.notion_mcp.description',
            icon: 'notion',
            website: 'https://github.com/v-3/notion-server',
            repository: 'https://github.com/v-3/notion-server',
            tags: ['productivity', 'database'],
            enabled: false,
            command: 'npx',
            args: ['-y', 'notion-mcp-server'],
            installCommand: 'npm',
            installArgs: ['install', '-g', 'notion-mcp-server'],
            installed: false,
            comingSoon: true,
            config: {
                token: '',
            },
        },
        {
            id: 'google-drive',
            name: 'Google Drive',
            description: 'settings.mcp.servers.google_drive.description',
            icon: 'google-drive',
            website: 'https://modelcontextprotocol.io/docs/servers/google-drive',
            repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive',
            tags: ['productivity', 'filesystem'],
            enabled: false,
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-gdrive'],
            installCommand: 'npm',
            installArgs: ['install', '-g', '@modelcontextprotocol/server-gdrive'],
            installed: false,
            comingSoon: true,
            config: {
                clientId: '',
                clientSecret: '',
            },
        },

        // === Design & Collaboration ===
        {
            id: 'figma-mcp',
            name: 'Figma',
            description: 'settings.mcp.servers.figma_mcp.description',
            icon: 'figma',
            website: 'https://www.figma.com/developers/api',
            repository: 'https://github.com/design-mcp/figma-server',
            tags: ['design', 'productivity'],
            enabled: false,
            command: 'npx',
            args: ['-y', '@designmcp/server-figma'],
            installCommand: 'npm',
            installArgs: ['install', '-g', '@designmcp/server-figma'],
            installed: false,
            comingSoon: true,
            env: {
                FIGMA_ACCESS_TOKEN: '',
            },
            config: {
                fileId: '',
                teamId: '',
                token: '',
            },
        },
        {
            id: 'framer-mcp',
            name: 'Framer',
            description: 'settings.mcp.servers.framer_mcp.description',
            icon: 'framer',
            website: 'https://www.framer.com/developers',
            repository: 'https://github.com/design-mcp/framer-server',
            tags: ['design', 'browser'],
            enabled: false,
            command: 'npx',
            args: ['-y', '@designmcp/server-framer'],
            installCommand: 'npm',
            installArgs: ['install', '-g', '@designmcp/server-framer'],
            installed: false,
            comingSoon: true,
            config: {
                apiKey: '',
                projectId: '',
            },
        },
        {
            id: 'penpot-mcp',
            name: 'Penpot',
            description: 'settings.mcp.servers.penpot_mcp.description',
            icon: 'penpot',
            website: 'https://penpot.app',
            repository: 'https://github.com/design-mcp/penpot-server',
            tags: ['design', 'productivity', 'filesystem'],
            enabled: false,
            command: 'npx',
            args: ['-y', '@designmcp/server-penpot'],
            installCommand: 'npm',
            installArgs: ['install', '-g', '@designmcp/server-penpot'],
            installed: false,
            comingSoon: true,
            config: {
                baseUrl: 'https://design.penpot.app',
                token: '',
                workspaceId: '',
            },
        },

        // === Code Analysis ===
        {
            id: 'sequential-thinking',
            name: 'Sequential Thinking',
            description: 'settings.mcp.servers.sequential_thinking.description',
            icon: 'brain',
            website:
                'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
            repository:
                'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
            tags: ['code', 'memory'],
            enabled: false,
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
            installCommand: 'npm',
            installArgs: ['install', '-g', '@modelcontextprotocol/server-sequential-thinking'],
            installed: false,
            comingSoon: true,
        },
        {
            id: 'sentry',
            name: 'Sentry',
            description: 'settings.mcp.servers.sentry.description',
            icon: 'bug',
            website: 'https://modelcontextprotocol.io/docs/servers/sentry',
            repository: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sentry',
            tags: ['devops', 'code'],
            enabled: false,
            command: 'uvx',
            args: ['mcp-server-sentry'],
            installCommand: 'pip',
            installArgs: ['install', 'mcp-server-sentry'],
            installed: false,
            comingSoon: true,
            config: {
                authToken: '',
                organization: '',
            },
        },
    ];

    const mcpServers = ref<MCPServerConfig[]>(
        mcpServerSeeds.map((seed) => withPermissionDefaults(seed))
    );

    // Sync missing seeds (e.g. newly added defaults)
    mcpServerSeeds.forEach((seed) => {
        if (!mcpServers.value.find((s) => s.id === seed.id)) {
            mcpServers.value.push(withPermissionDefaults(seed));
        }
    });

    const loading = ref(false);
    const error = ref<string | null>(null);

    // Setup Wizard State
    const setupWizard = ref<SetupWizardState>({
        completed: false,
        skipped: false,
        dontShowAgain: false,
    });

    const localProviderStatus = ref<Record<string, LocalProviderStatus>>({});

    // ========================================
    // Getters
    // ========================================

    const enabledProviders = computed(() =>
        aiProviders.value.filter((p) => {
            if (!p.enabled) return false;
            if (['ollama', 'lmstudio'].includes(p.id)) {
                return true;
            }
            return Boolean(p.apiKey || p.isConnected);
        })
    );

    const defaultProvider = computed(() => enabledProviders.value[0] || null);

    const connectedIntegrations = computed(() => integrations.value.filter((i) => i.connected));

    /**
     * Get enabled MCP servers (connected and enabled)
     */
    const enabledMCPServers = computed(() =>
        mcpServers.value.filter((s) => s.enabled && s.isConnected)
    );

    function getLocalProviderStatus(providerId: string): LocalProviderStatus {
        return localProviderStatus.value[providerId] || { status: 'unknown' };
    }

    /**
     * Get all MCP server tags
     */
    const allMCPTags = computed(() => {
        const tagSet = new Set<MCPServerTag>();
        for (const server of mcpServers.value) {
            if (server.tags) {
                for (const tag of server.tags) {
                    tagSet.add(tag);
                }
            }
        }
        return Array.from(tagSet).sort();
    });

    /**
     * MCP Server tag display names (한국어)
     */
    const mcpTagDisplayNames: Record<MCPServerTag, string> = {
        filesystem: 'settings.mcp.tags.filesystem',
        shell: 'settings.mcp.tags.shell',
        git: 'settings.mcp.tags.git',
        http: 'settings.mcp.tags.http',
        database: 'settings.mcp.tags.database',
        cloud: 'settings.mcp.tags.cloud',
        devops: 'settings.mcp.tags.devops',
        productivity: 'settings.mcp.tags.productivity',
        search: 'settings.mcp.tags.search',
        browser: 'settings.mcp.tags.browser',
        memory: 'settings.mcp.tags.memory',
        code: 'settings.mcp.tags.code',
        design: 'settings.mcp.tags.design',
        communication: 'settings.mcp.tags.communication',
    };

    /**
     * Get MCP tag display name
     */
    function getMCPTagDisplayName(tag: MCPServerTag): string {
        return mcpTagDisplayNames[tag] || tag;
    }

    /**
     * Get MCP servers filtered by tags
     */
    function getMCPServersByTags(tags: MCPServerTag[]): MCPServerConfig[] {
        if (tags.length === 0) return mcpServers.value;
        return mcpServers.value.filter(
            (server) => server.tags && server.tags.some((tag) => tags.includes(tag))
        );
    }

    function getMCPPermissionDefinitions() {
        return MCP_PERMISSION_DEFINITIONS;
    }

    function getMCPPermissions(serverId: string): MCPPermissionMap | null {
        const server = mcpServers.value.find((s) => s.id === serverId);
        if (!server) return null;
        return mergeMCPPermissions(server, server.permissions);
    }

    function buildMCPPermissionsFor(server: MCPServerConfig | null): MCPPermissionMap {
        if (!server) {
            return buildMCPPermissionDefaults();
        }
        return mergeMCPPermissions(server, server.permissions);
    }

    const shortcutsByCategory = computed(() => {
        const grouped: Record<string, KeyboardShortcut[]> = {};
        for (const shortcut of keyboardShortcuts.value) {
            const category = shortcut.category;
            if (!grouped[category]) {
                grouped[category] = [];
            }
            const categoryArray = grouped[category];
            if (categoryArray) {
                categoryArray.push(shortcut);
            }
        }
        return grouped;
    });

    const shouldShowSetupWizard = computed(() => {
        // Don't show if user opted out
        if (setupWizard.value.dontShowAgain) return false;
        // Don't show if already completed
        if (setupWizard.value.completed) return false;
        // Show wizard for new users
        return true;
    });

    /**
     * Get all unique tags from all providers
     */
    const allTags = computed(() => {
        const tagSet = new Set<AIProviderTag>();
        for (const provider of aiProviders.value) {
            if (provider.tags) {
                for (const tag of provider.tags) {
                    tagSet.add(tag);
                }
            }
        }
        return Array.from(tagSet).sort();
    });

    /**
     * Get providers filtered by tags (any match)
     */
    function getProvidersByTags(tags: AIProviderTag[]): AIProviderConfig[] {
        if (tags.length === 0) return aiProviders.value;
        return aiProviders.value.filter(
            (provider) => provider.tags && provider.tags.some((tag) => tags.includes(tag))
        );
    }

    /**
     * Get providers filtered by tags (all match)
     */
    function getProvidersByAllTags(tags: AIProviderTag[]): AIProviderConfig[] {
        if (tags.length === 0) return aiProviders.value;
        return aiProviders.value.filter(
            (provider) => provider.tags && tags.every((tag) => provider.tags.includes(tag))
        );
    }

    /**
     * Get enabled providers filtered by tags
     */
    function getEnabledProvidersByTags(tags: AIProviderTag[]): AIProviderConfig[] {
        const enabled = enabledProviders.value;
        if (tags.length === 0) return enabled;
        return enabled.filter(
            (provider) => provider.tags && provider.tags.some((tag) => tags.includes(tag))
        );
    }

    /**
     * Tag display names (한국어)
     */
    const tagDisplayNames: Record<AIProviderTag, string> = {
        chat: 'Chat',
        code: 'Code',
        design: 'Design',
        reasoning: 'Reasoning',
        image: 'Image',
        'image-analysis': 'Vision',
        video: 'Video',
        audio: 'Audio',
        tts: 'TTS',
        stt: 'STT',
        music: 'Music',
        embedding: 'Embedding',
        search: 'Search',
        'long-context': 'Long Context',
        fast: 'Fast',
        local: 'Local',
        'multi-modal': 'Multi-modal',
        agent: 'Agent',
        'free-tier': 'Free Tier',
    };

    /**
     * Get tag display name
     */
    function getTagDisplayName(tag: AIProviderTag): string {
        return tagDisplayNames[tag] || tag;
    }

    /**
     * Check if a provider supports streaming
     */
    function providerSupportsStreaming(providerId: string): boolean {
        // Local Agent Providers always support streaming
        if (['claude-code', 'codex'].includes(providerId)) {
            return true;
        }
        const provider = aiProviders.value.find((p) => p.id === providerId);
        return provider?.supportsStreaming ?? false;
    }

    /**
     * Get provider by ID
     */
    function getProviderById(providerId: string): AIProviderConfig | undefined {
        return aiProviders.value.find((p) => p.id === providerId);
    }

    function cloneProviderConfig(provider: AIProviderConfig): AIProviderConfig {
        return {
            ...provider,
            tags: provider.tags ? [...provider.tags] : [],
            authMethods: [...provider.authMethods],
            models: provider.models ? [...provider.models] : [],
            oauth: provider.oauth
                ? {
                      ...provider.oauth,
                      scopes: provider.oauth.scopes ? [...provider.oauth.scopes] : undefined,
                  }
                : undefined,
        };
    }

    /**
     * AIModelRecommendationService용 EnabledProviderConfig 형식으로 변환
     * AI 모델 추천 서비스에서 사용하는 형식으로 연동된 Provider 정보를 반환합니다.
     */
    function getEnabledProvidersForRecommendation(): AIProviderConfig[] {
        const primary = enabledProviders.value.map(cloneProviderConfig);

        if (primary.length > 0) {
            return primary;
        }

        // Fallback: include providers that at least have API keys configured
        return aiProviders.value
            .filter((provider) => !!provider.apiKey)
            .map((provider) => cloneProviderConfig({ ...provider, enabled: true }));
    }

    // ========================================
    // Actions
    // ========================================

    /**
     * Sync desktop notification settings to main process
     */
    function syncDesktopNotifications() {
        if (window.electron?.app?.updateDesktopNotifications) {
            window.electron.app.updateDesktopNotifications(
                JSON.parse(JSON.stringify(generalSettings.value.desktopNotifications))
            );
        }
    }

    /**
     * Load all settings from storage
     */
    async function loadSettings(): Promise<void> {
        loading.value = true;
        error.value = null;

        try {
            // Load from localStorage and merge with default providers
            const storedProviders = loadFromStorage<AIProviderConfig[] | null>('aiProviders', null);
            if (storedProviders) {
                // Merge stored settings into default providers (keeps new providers, updates existing with stored settings)
                const defaultProviders = aiProviders.value;
                const mergedProviders = defaultProviders.map((defaultProvider) => {
                    const storedProvider = storedProviders.find(
                        (sp) => sp.id === defaultProvider.id
                    );
                    if (storedProvider) {
                        // Check if stored defaultModel is still valid (exists in models list)
                        const storedModelValid =
                            storedProvider.defaultModel &&
                            defaultProvider.models.includes(storedProvider.defaultModel);

                        // Merge stored data with default, keeping default's new fields like authMethods
                        return {
                            ...defaultProvider,
                            apiKey: storedProvider.apiKey,
                            enabled: storedProvider.enabled,
                            // Merge stored models if available
                            models:
                                storedProvider.models && storedProvider.models.length > 0
                                    ? storedProvider.models
                                    : defaultProvider.models,
                            // Only use stored model if it's valid, otherwise use default
                            defaultModel: storedModelValid
                                ? storedProvider.defaultModel
                                : defaultProvider.defaultModel,
                            baseUrl: storedProvider.baseUrl,
                            isConnected: storedProvider.isConnected,
                            lastValidated: storedProvider.lastValidated,
                            activeAuthMethod: storedProvider.activeAuthMethod,
                            oauth: storedProvider.oauth,
                        };
                    }
                    return defaultProvider;
                });
                aiProviders.value = mergedProviders;
            }

            const storedProfile = loadFromStorage<Partial<UserProfile> | null>('userProfile', null);
            if (storedProfile) {
                userProfile.value = {
                    ...userProfile.value,
                    ...storedProfile,
                    language: storedProfile.language || 'ko',
                };
            }

            const storedGeneral = loadFromStorage<Partial<GeneralSettings> | null>(
                'generalSettings',
                null
            );
            if (storedGeneral) {
                generalSettings.value = { ...generalSettings.value, ...storedGeneral };
            }

            const storedShortcuts = loadFromStorage<KeyboardShortcut[] | null>(
                'keyboardShortcuts',
                null
            );
            if (storedShortcuts) {
                keyboardShortcuts.value = storedShortcuts;
            }

            const storedIntegrations = loadFromStorage<IntegrationConfig[] | null>(
                'integrations',
                null
            );
            if (storedIntegrations) {
                integrations.value = storedIntegrations;
            }

            const storedMCPServers = loadFromStorage<MCPServerConfig[] | null>('mcpServers', null);
            if (storedMCPServers) {
                // Merge stored settings into default MCP servers (keeps new servers, updates existing with stored settings)
                const defaultServers = mcpServers.value;
                const mergedServers = defaultServers.map((defaultServer) => {
                    const storedServer = storedMCPServers.find((ss) => ss.id === defaultServer.id);
                    if (storedServer) {
                        return withPermissionDefaults({
                            ...defaultServer,
                            enabled: storedServer.enabled,
                            isConnected: storedServer.isConnected,
                            config: (() => {
                                // Auto-migration: Fix incorrect GitHub Remote endpoint if it was saved as the repo URL
                                if (defaultServer.id === 'github-remote') {
                                    const storedEndpoint = storedServer.config?.endpoint;
                                    const badUrl = 'https://github.com/github/github-mcp-server';
                                    if (storedEndpoint === badUrl || !storedEndpoint) {
                                        return {
                                            ...storedServer.config,
                                            endpoint: 'https://api.githubcopilot.com/mcp/',
                                        };
                                    }
                                }
                                return storedServer.config;
                            })(),
                            args: storedServer.args,
                            lastValidated: storedServer.lastValidated,
                            installed: storedServer.installed ?? defaultServer.installed,
                            installLog: storedServer.installLog ?? defaultServer.installLog,
                            lastInstalledAt:
                                storedServer.lastInstalledAt ?? defaultServer.lastInstalledAt,
                            permissions: storedServer.permissions,
                            scopes: storedServer.scopes,
                        });
                    }
                    return defaultServer;
                });
                mcpServers.value = mergedServers;
            }

            const storedSetupWizard = loadFromStorage<SetupWizardState | null>('setupWizard', null);
            if (storedSetupWizard) {
                setupWizard.value = storedSetupWizard;
            }

            // Load models from DB cache for all enabled providers
            console.debug('[SettingsStore] Loading models from DB cache on startup...');
            for (const provider of aiProviders.value) {
                const hasAuth =
                    provider.apiKey ||
                    provider.authMethods.includes('oauth') ||
                    provider.requiresLogin;
                if (provider.enabled && hasAuth) {
                    try {
                        const models = await window.electron.ai.getModelsFromCache(provider.id);
                        if (models && models.length > 0) {
                            const modelNames = models.map((m: any) => m.name);
                            const providerIndex = aiProviders.value.findIndex(
                                (p) => p.id === provider.id
                            );
                            if (providerIndex >= 0) {
                                const updatedProviders = [...aiProviders.value];
                                updatedProviders[providerIndex] = {
                                    ...updatedProviders[providerIndex]!,
                                    models: modelNames,
                                };
                                aiProviders.value = updatedProviders;
                                console.debug(
                                    `[SettingsStore] Loaded ${models.length} models from DB for ${provider.id}`
                                );
                            }
                        }
                    } catch (err) {
                        console.warn(
                            `[SettingsStore] Failed to load models for ${provider.id}:`,
                            err
                        );
                    }
                }
            }

            aiProviders.value
                .filter(
                    (provider) =>
                        provider.enabled &&
                        (provider.tags?.includes('local') ||
                            provider.id === 'lmstudio' ||
                            provider.id === 'ollama')
                )
                .forEach((provider) => {
                    detectLocalProvider(provider.id).catch((err) =>
                        console.warn(`Failed to detect provider ${provider.id}:`, err)
                    );
                });
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to load settings';
            console.error('Failed to load settings:', e);
        } finally {
            loading.value = false;
            // Sync initial notification settings to main process
            syncDesktopNotifications();
        }
    }

    /**
     * Save settings to storage
     */
    async function saveSettings(): Promise<void> {
        try {
            // Save to localStorage
            saveToStorage('aiProviders', aiProviders.value);
            saveToStorage('userProfile', userProfile.value);
            saveToStorage('generalSettings', generalSettings.value);
            saveToStorage('keyboardShortcuts', keyboardShortcuts.value);
            saveToStorage('integrations', integrations.value);
            saveToStorage('mcpServers', mcpServers.value);
            saveToStorage('setupWizard', setupWizard.value);

            // Sync desktop notification settings to main process whenever saved
            // Sync desktop notification settings to main process whenever saved
            if (window.electron?.app?.updateDesktopNotifications) {
                window.electron.app.updateDesktopNotifications(
                    JSON.parse(JSON.stringify(generalSettings.value.desktopNotifications))
                );
            }
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to save settings';
            console.error('Failed to save settings:', e);
        }
    }

    /**
     * Update AI provider configuration
     */
    async function updateAIProvider(
        providerId: string,
        updates: Partial<AIProviderConfig>
    ): Promise<void> {
        const index = aiProviders.value.findIndex((p) => p.id === providerId);
        if (index >= 0) {
            const currentProvider = aiProviders.value[index];
            if (currentProvider) {
                const updatedProvider: AIProviderConfig = {
                    ...currentProvider,
                    ...updates,
                    id: currentProvider.id,
                };
                aiProviders.value[index] = updatedProvider;

                await saveSettings();

                // Sync with backend (for System Curator/Persistence)
                if (
                    window.electron &&
                    window.electron.ai &&
                    window.electron.ai.saveProviderConfig
                ) {
                    console.debug(`[SettingsStore] Syncing ${providerId} config to backend`);
                    // We only send minimal config (e.g. key, url), or the whole object?
                    // Let's send the specific updates merged with current config
                    const safeConfig = JSON.parse(JSON.stringify(updatedProvider));
                    await window.electron.ai.saveProviderConfig(providerId, safeConfig);
                }
            }
        }
    }

    /**
     * Validate API key for a provider by making a real API call
     */
    async function validateApiKey(providerId: string): Promise<boolean> {
        const provider = aiProviders.value.find((p) => p.id === providerId);
        if (!provider?.apiKey) return false;

        if (!provider?.apiKey) return false;

        // Sanitize API key centrally: trim whitespace and remove non-ASCII characters
        // This prevents header errors and ensures consistent behavior across all providers
        if (provider.apiKey) {
            provider.apiKey = provider.apiKey.trim().replace(/[^\x00-\x7F]/g, '');
        }

        loading.value = true;

        try {
            let isValid = false;

            // Validate based on provider type
            switch (providerId) {
                case 'anthropic':
                    isValid = await validateAnthropicKey(provider.apiKey);
                    break;
                case 'openai':
                    isValid = await validateOpenAIKey(provider.apiKey);
                    break;
                case 'google':
                    isValid = await validateGoogleKey(provider.apiKey);
                    break;
                default:
                    // For unknown providers, just check length
                    isValid = provider.apiKey.length >= 10;
            }

            if (isValid) {
                // Try to fetch updated models list from provider
                try {
                    const fetchedModels = await window.electron.ai.fetchModels(
                        providerId,
                        provider.apiKey
                    );
                    if (fetchedModels && Array.isArray(fetchedModels) && fetchedModels.length > 0) {
                        const modelList = fetchedModels.map((m: any) => m.name);

                        // Analyze model characteristics using AI (background, non-blocking)
                        console.debug(
                            `[Settings] Starting model characteristics analysis for ${fetchedModels.length} models...`
                        );

                        // Get Google API key for model analysis (primary)
                        const googleProvider = aiProviders.value.find((p) => p.id === 'google');
                        const googleApiKey = googleProvider?.apiKey || '';

                        // Build fallback providers list from connected providers
                        const fallbackProviders: {
                            provider: string;
                            apiKey: string;
                            model: string;
                        }[] = [];

                        // Groq (free tier available)
                        const groqProvider = aiProviders.value.find((p) => p.id === 'groq');
                        if (groqProvider?.apiKey) {
                            fallbackProviders.push({
                                provider: 'groq',
                                apiKey: groqProvider.apiKey,
                                model: 'llama-3.3-70b-versatile', // Free, fast
                            });
                        }

                        // OpenAI (fallback to gpt-4o-mini - cheap)
                        const openaiProvider = aiProviders.value.find((p) => p.id === 'openai');
                        if (openaiProvider?.apiKey) {
                            fallbackProviders.push({
                                provider: 'openai',
                                apiKey: openaiProvider.apiKey,
                                model: 'gpt-4o-mini',
                            });
                        }

                        import('../../services/ai/AIModelAnalyzer')
                            .then(({ analyzeModels }) => {
                                return analyzeModels(
                                    fetchedModels,
                                    googleApiKey,
                                    fallbackProviders
                                );
                            })
                            .then((analyzedModels) => {
                                // Update cache with characteristics
                                import('../../services/ai/AIModelCacheService').then(
                                    ({ modelCache }) => {
                                        modelCache.setCachedModels(
                                            providerId as any,
                                            analyzedModels
                                        );
                                        console.debug(
                                            `[Settings] Model characteristics analysis complete for ${providerId}`
                                        );
                                    }
                                );
                            })
                            .catch((err) => {
                                console.warn(
                                    `[Settings] Model analysis failed (using models without characteristics):`,
                                    err
                                );
                            });

                        // Update provider with key, validation time, and NEW MODELS
                        await updateAIProvider(providerId, {
                            lastValidated: new Date().toISOString(),
                            models: modelList,
                        });
                        return true;
                    }
                } catch (err) {
                    console.warn(`[Settings] Failed to refresh models for ${providerId}:`, err);
                }

                await updateAIProvider(providerId, {
                    lastValidated: new Date().toISOString(),
                });
            }

            return isValid;
        } catch (e) {
            console.error('Failed to validate API key:', e);
            return false;
        } finally {
            loading.value = false;
        }
    }

    /**
     * Validate Anthropic API key
     */
    async function validateAnthropicKey(apiKey: string): Promise<boolean> {
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true',
                },
                body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    max_tokens: 10,
                    messages: [{ role: 'user', content: 'Hi' }],
                }),
            });

            // 200 = success
            if (response.ok) return true;

            // Check error response
            const data = await response.json().catch(() => ({}));
            console.debug('Anthropic validation response:', response.status, data);

            // 401 or authentication errors = invalid key
            if (response.status === 401) return false;
            if (data.error?.type === 'authentication_error') return false;
            if (data.error?.message?.toLowerCase().includes('invalid')) return false;

            // 400 with invalid_api_key error
            if (response.status === 400 && data.error?.type === 'invalid_request_error') {
                if (data.error?.message?.toLowerCase().includes('api key')) return false;
            }

            // 429 = rate limit (key is valid but rate limited)
            if (response.status === 429) return true;

            // Other errors - assume invalid
            return false;
        } catch (error) {
            console.error('Anthropic validation error:', error);
            return false;
        }
    }

    function applyLmStudioModelUpdates(
        models: string[],
        baseUrl?: string
    ): {
        preferredModel: string;
        models: string[];
    } | null {
        const providerIndex = aiProviders.value.findIndex((p) => p.id === 'lmstudio');
        if (providerIndex === -1) {
            return null;
        }

        const provider = aiProviders.value[providerIndex];
        if (!provider) return null;

        const sanitized = sanitizeModelList(models);
        const preferredModel = selectPreferredLmStudioModel(sanitized, provider.defaultModel);

        let changed = false;

        if (!shallowEqualStringArrays(provider.models, sanitized)) {
            provider.models = sanitized;
            changed = true;
        }

        if (preferredModel && provider.defaultModel !== preferredModel) {
            provider.defaultModel = preferredModel;
            changed = true;
        }

        if (baseUrl && provider.baseUrl !== baseUrl) {
            provider.baseUrl = baseUrl;
            changed = true;
        }

        if (changed) {
            aiProviders.value = [...aiProviders.value];
            return { preferredModel, models: sanitized };
        }

        return null;
    }

    async function detectLocalProvider(
        providerId: string,
        overrideBaseUrl?: string
    ): Promise<LocalProviderStatus> {
        const provider = aiProviders.value.find((p) => p.id === providerId);
        const isLocal =
            provider?.tags?.includes('local') ||
            providerId === 'lmstudio' ||
            providerId === 'ollama';
        if (!isLocal) {
            const unavailable: LocalProviderStatus = {
                status: 'unavailable',
                lastChecked: new Date().toISOString(),
            };
            localProviderStatus.value[providerId] = unavailable;
            return unavailable;
        }

        const baseUrl = resolveProviderBaseUrl(provider, overrideBaseUrl);
        if (!baseUrl) {
            const unavailable: LocalProviderStatus = {
                status: 'unavailable',
                lastChecked: new Date().toISOString(),
                details: 'Base URL not configured',
            };
            localProviderStatus.value[providerId] = unavailable;
            return unavailable;
        }

        const normalizedUrl = baseUrl.replace(/\/+$/, '');
        localProviderStatus.value[providerId] = { status: 'checking', baseUrl: normalizedUrl };

        const electronAPI = getElectronAPI();

        if (providerId === 'lmstudio' && electronAPI?.localProviders?.fetchLmStudioModels) {
            try {
                const result = await electronAPI.localProviders.fetchLmStudioModels(normalizedUrl);
                const sanitized = sanitizeModelList(result?.models || []);
                const preferredModel = selectPreferredLmStudioModel(
                    sanitized,
                    provider?.defaultModel || undefined
                );

                let changed = false;
                const updates = applyLmStudioModelUpdates(sanitized, normalizedUrl);
                if (updates) {
                    changed = true;
                }
                if (provider && !provider.isConnected) {
                    provider.isConnected = true;
                    changed = true;
                    aiProviders.value = [...aiProviders.value];
                }
                if (changed) {
                    await saveSettings();
                }

                const available: LocalProviderStatus = {
                    status: 'available',
                    lastChecked: new Date().toISOString(),
                    baseUrl: normalizedUrl,
                    models: sanitized,
                    preferredModel,
                    details:
                        sanitized.length === 0
                            ? 'LM Studio 응답은 정상이나 모델 목록이 비어 있습니다. LM Studio에서 모델을 다운로드한 후 다시 시도하세요.'
                            : undefined,
                };
                localProviderStatus.value[providerId] = available;
                return available;
            } catch (error) {
                console.warn('Failed to detect LM Studio via Electron bridge:', error);
                const unavailable: LocalProviderStatus = {
                    status: 'unavailable',
                    lastChecked: new Date().toISOString(),
                    baseUrl: normalizedUrl,
                    details: error instanceof Error ? error.message : String(error),
                };
                localProviderStatus.value[providerId] = unavailable;

                const index = aiProviders.value.findIndex((p) => p.id === providerId);
                if (index >= 0) {
                    const currentProvider = aiProviders.value[index];
                    if (currentProvider && currentProvider.isConnected) {
                        aiProviders.value[index] = {
                            ...currentProvider,
                            isConnected: false,
                            id: currentProvider.id,
                        };
                    }
                }
                return unavailable;
            }
        }

        const detection = LOCAL_PROVIDER_DETECTION[providerId] || {
            endpoint: '/models',
            mode: 'cors',
        };
        const healthEndpoint = `${normalizedUrl}${detection.endpoint}`;

        if (detection.mode === 'no-cors' && isBrowserDevEnvironment) {
            const assumed: LocalProviderStatus = {
                status: 'available',
                lastChecked: new Date().toISOString(),
                baseUrl: normalizedUrl,
                details:
                    'Browser dev server cannot verify LM Studio due to CORS, assuming it is running. Launch via Electron for an accurate status.',
            };
            localProviderStatus.value[providerId] = assumed;
            return assumed;
        }

        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 3000);

        try {
            const response = await fetch(healthEndpoint, {
                signal: controller.signal,
                method: detection.method || 'GET',
                mode: detection.mode || 'cors',
                cache: 'no-cache',
            });
            const succeeded = response.ok || response.type === 'opaque';
            if (!succeeded) {
                throw new Error(`HTTP ${response.status}`);
            }
            const available: LocalProviderStatus = {
                status: 'available',
                lastChecked: new Date().toISOString(),
                baseUrl: normalizedUrl,
            };
            localProviderStatus.value[providerId] = available;

            const index = aiProviders.value.findIndex((p) => p.id === providerId);
            if (index >= 0) {
                const currentProvider = aiProviders.value[index];
                if (currentProvider) {
                    if (!currentProvider.isConnected || currentProvider.baseUrl !== normalizedUrl) {
                        aiProviders.value[index] = {
                            ...currentProvider,
                            isConnected: true,
                            baseUrl: currentProvider.baseUrl || normalizedUrl,
                            id: currentProvider.id,
                        };
                    }
                }
            }

            return available;
        } catch (error) {
            const unavailable: LocalProviderStatus = {
                status: 'unavailable',
                lastChecked: new Date().toISOString(),
                details: error instanceof Error ? error.message : String(error),
                baseUrl: normalizedUrl,
            };
            localProviderStatus.value[providerId] = unavailable;

            const index = aiProviders.value.findIndex((p) => p.id === providerId);
            if (index >= 0) {
                const currentProvider = aiProviders.value[index];
                if (currentProvider && currentProvider.isConnected) {
                    aiProviders.value[index] = {
                        ...currentProvider,
                        isConnected: false,
                        id: currentProvider.id,
                    };
                }
            }

            return unavailable;
        } finally {
            clearTimeout(timeout);
        }
    }
    /**
     * Validate OpenAI API key
     */
    async function validateOpenAIKey(apiKey: string): Promise<boolean> {
        if (!apiKey.startsWith('sk-')) return false;

        // Skip direct API validation in browser due to CORS issues.
        // The real validation will happen when models are fetched in the Main process.
        console.debug(
            '[SettingsStore] Skipping strict OpenAI CORS validation, checking format only.'
        );
        return true;
    }

    /**
     * Validate Google AI API key
     */
    async function validateGoogleKey(apiKey: string): Promise<boolean> {
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
                { method: 'GET' }
            );

            return response.ok;
        } catch (error) {
            console.error('Google validation error:', error);
            return false;
        }
    }

    /**
     * Update user profile
     */
    async function updateProfile(updates: Partial<UserProfile>): Promise<void> {
        userProfile.value = { ...userProfile.value, ...updates };
        await saveSettings();
    }

    /**
     * Update general settings
     */
    async function updateGeneralSettings(updates: Partial<GeneralSettings>): Promise<void> {
        generalSettings.value = { ...generalSettings.value, ...updates };
        await saveSettings();
    }

    /**
     * Update keyboard shortcut
     */
    async function updateShortcut(shortcutId: string, customKeys: string[]): Promise<void> {
        const index = keyboardShortcuts.value.findIndex((s) => s.id === shortcutId);
        if (index >= 0) {
            const shortcut = keyboardShortcuts.value[index];
            if (shortcut) {
                shortcut.customKeys = customKeys;
                await saveSettings();
            }
        }
    }

    /**
     * Reset shortcut to default
     */
    async function resetShortcut(shortcutId: string): Promise<void> {
        const index = keyboardShortcuts.value.findIndex((s) => s.id === shortcutId);
        if (index >= 0) {
            const shortcut = keyboardShortcuts.value[index];
            if (shortcut) {
                shortcut.customKeys = undefined;
                await saveSettings();
            }
        }
    }

    /**
     * Update integration config
     */
    async function updateIntegration(
        integrationId: string,
        updates: Partial<IntegrationConfig>
    ): Promise<void> {
        const index = integrations.value.findIndex((i) => i.id === integrationId);
        if (index >= 0) {
            const currentIntegration = integrations.value[index];
            if (currentIntegration) {
                integrations.value[index] = { ...currentIntegration, ...updates };
                await saveSettings();
            }
        }
    }

    /**
     * Update MCP server configuration
     */
    async function updateMCPServer(
        serverId: string,
        updates: Partial<MCPServerConfig>
    ): Promise<void> {
        const index = mcpServers.value.findIndex((s) => s.id === serverId);
        if (index >= 0) {
            const currentServer = mcpServers.value[index];
            if (currentServer) {
                const nextServer = {
                    ...currentServer,
                    ...updates,
                    permissions: updates.permissions
                        ? mergeMCPPermissions(currentServer, updates.permissions)
                        : currentServer.permissions,
                    scopes: updates.scopes
                        ? Array.from(
                              new Set(updates.scopes.filter((scope) => typeof scope === 'string'))
                          )
                        : currentServer.scopes,
                };
                mcpServers.value[index] = withPermissionDefaults(nextServer);
                await saveSettings();
            }
        }
    }

    /**
     * Connect MCP server (mark as connected)
     */
    async function connectMCPServer(serverId: string): Promise<boolean> {
        loading.value = true;

        try {
            const server = mcpServers.value.find((s) => s.id === serverId);
            if (!server) {
                throw new Error('MCP 서버 정보를 찾을 수 없습니다.');
            }

            const isRemote =
                server.tags?.some((t) => ['http', 'cloud'].includes(t)) ||
                server.id === 'github-remote' ||
                server.config?.baseUrl ||
                server.config?.endpoint;

            if (!server.command && !isRemote) {
                throw new Error('실행할 커맨드가 설정되지 않았습니다.');
            }

            if (server.installCommand && !server.installed) {
                throw new Error('먼저 Install 버튼을 눌러 MCP 서버를 설치해 주세요.');
            }

            const configError = validateMCPServerConfig(server);
            if (configError) {
                throw new Error(configError);
            }

            // Start - Enforce GitHub Remote Endpoint
            if (server.id === 'github-remote') {
                // Force the correct endpoint for github-remote before connection
                if (server.config?.endpoint !== 'https://api.githubcopilot.com/mcp/') {
                    server.config = {
                        ...server.config,
                        endpoint: 'https://api.githubcopilot.com/mcp/',
                    };
                    await updateMCPServer(serverId, { config: server.config });
                }
            }
            // End - Enforce GitHub Remote Endpoint

            await performMCPRemoteValidation(server);

            await updateMCPServer(serverId, {
                isConnected: true,
                enabled: true,
                lastValidated: new Date().toISOString(),
            });

            return true;
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Failed to connect MCP server';
            error.value = message;
            throw new Error(message);
        } finally {
            loading.value = false;
        }
    }

    /**
     * Disconnect MCP server
     */
    async function disconnectMCPServer(serverId: string): Promise<void> {
        await updateMCPServer(serverId, {
            isConnected: false,
            enabled: false,
        });
    }

    /**
     * Install MCP server dependencies via system command
     */
    async function installMCPServer(serverId: string): Promise<RunCommandResult> {
        const server = mcpServers.value.find((s) => s.id === serverId);
        if (!server) {
            throw new Error('MCP 서버를 찾을 수 없습니다.');
        }
        if (!server.installCommand) {
            throw new Error('이 MCP 서버는 자동 설치 명령을 제공하지 않습니다.');
        }

        const electronAPI = getElectronAPI();
        if (!electronAPI?.system) {
            throw new Error('Electron 환경에서만 설치를 지원합니다.');
        }

        const installArgs = server.installArgs ? [...server.installArgs] : [];
        const env = server.env ? { ...server.env } : undefined;

        const result = await electronAPI.system.runCommand({
            command: server.installCommand,
            args: installArgs,
            env,
            shell: true,
        });

        await updateMCPServer(serverId, {
            installed: result.success,
            installLog: [result.stdout, result.stderr].filter(Boolean).join('\n'),
            lastInstalledAt: new Date().toISOString(),
        });

        if (!result.success) {
            throw new Error(result.stderr || '설치에 실패했습니다.');
        }

        return result;
    }

    function validateMCPServerConfig(server: MCPServerConfig): string | null {
        const cfg = server.config || {};

        switch (server.id) {
            case 'slack-mcp': {
                const token = (cfg.token || '').trim();
                if (!/^xox[abprs]-/.test(token)) {
                    return 'Slack Bot Token 형식이 올바르지 않습니다 (xoxb- 로 시작).';
                }
                break;
            }
            case 'github-mcp': {
                const token = (cfg.token || '').trim();
                if (token && !/^gh[pous]_/.test(token) && !token.startsWith('github_pat_')) {
                    return 'GitHub Personal Access Token 형식이 올바르지 않습니다.';
                }
                break;
            }
            case 'gitlab-mcp': {
                const token = (cfg.token || '').trim();
                if (!token) {
                    return 'GitLab Access Token을 입력해 주세요.';
                }
                break;
            }
            case 'notion-mcp': {
                const token = (cfg.token || '').trim();
                if (!token.startsWith('secret_')) {
                    return 'Notion Integration Token은 secret_ 로 시작해야 합니다.';
                }
                break;
            }
            case 'google-drive': {
                const clientId = (cfg.clientId || '').trim();
                if (!clientId.endsWith('apps.googleusercontent.com')) {
                    return 'Google Client ID 형식이 올바르지 않습니다.';
                }
                break;
            }
            default:
                break;
        }

        return null;
    }

    async function performMCPRemoteValidation(server: MCPServerConfig): Promise<void> {
        const cfg = server.config || {};

        switch (server.id) {
            case 'slack-mcp': {
                const token = (cfg.token || '').trim();
                await validateSlackToken(token);
                break;
            }
            default:
                break;
        }
    }

    async function validateSlackToken(token: string): Promise<void> {
        if (!token) {
            throw new Error('Slack Bot Token을 입력해 주세요.');
        }

        try {
            const response = await fetch('https://slack.com/api/auth.test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({ token }),
            });

            if (!response.ok) {
                throw new Error('Slack API 호출에 실패했습니다.');
            }

            const data = await response.json();
            if (!data.ok) {
                throw new Error(`Slack 토큰 검증 실패: ${data.error || '알 수 없는 오류'}`);
            }
        } catch (error) {
            if (error instanceof Error) {
                throw error;
            }
            throw new Error('Slack 토큰 검증 중 오류가 발생했습니다.');
        }
    }

    /**
     * Connect OAuth for provider
     * Note: This is a placeholder - actual OAuth would require external window flow
     */
    async function connectOAuth(providerId: string): Promise<boolean> {
        loading.value = true;

        try {
            // Simulate OAuth connection - in production, this would open an OAuth window
            await new Promise((resolve) => setTimeout(resolve, 1500));

            // Mock success - generate a fake token
            const mockToken = `oauth_${providerId}_${Date.now()}`;

            await updateAIProvider(providerId, {
                isConnected: true,
                oauthToken: mockToken,
                enabled: true,
            });
            return true;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to connect OAuth';
            return false;
        } finally {
            loading.value = false;
        }
    }

    /**
     * Disconnect OAuth for provider
     */
    async function disconnectOAuth(providerId: string): Promise<void> {
        await updateAIProvider(providerId, {
            isConnected: false,
            oauthToken: undefined,
        });
    }

    /**
     * Connect integration
     * Note: This is a placeholder - actual integration would require external API
     */
    async function connectIntegration(integrationId: string): Promise<boolean> {
        loading.value = true;

        try {
            // Simulate integration connection
            await new Promise((resolve) => setTimeout(resolve, 1500));

            await updateIntegration(integrationId, {
                connected: true,
                enabled: true,
                lastSync: new Date().toISOString(),
            });

            return true;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to connect integration';
            return false;
        } finally {
            loading.value = false;
        }
    }

    /**
     * Disconnect integration
     */
    async function disconnectIntegration(integrationId: string): Promise<void> {
        await updateIntegration(integrationId, {
            connected: false,
            enabled: false,
        });
    }

    /**
     * Export settings
     */
    async function exportSettings(): Promise<string> {
        const exportData = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            generalSettings: generalSettings.value,
            keyboardShortcuts: keyboardShortcuts.value,
            // Don't export sensitive data
            aiProviders: aiProviders.value.map((p) => ({
                ...p,
                apiKey: undefined,
                oauthToken: undefined,
            })),
            integrations: integrations.value.map((i) => ({
                ...i,
                config: undefined,
            })),
        };

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Import settings
     */
    async function importSettings(jsonData: string): Promise<boolean> {
        try {
            const data = JSON.parse(jsonData);

            if (data.generalSettings) {
                generalSettings.value = { ...generalSettings.value, ...data.generalSettings };
            }

            if (data.keyboardShortcuts) {
                keyboardShortcuts.value = data.keyboardShortcuts;
            }

            await saveSettings();
            return true;
        } catch (e) {
            error.value = 'Invalid settings file';
            return false;
        }
    }

    /**
     * Reset all settings to defaults
     */
    async function resetToDefaults(): Promise<void> {
        generalSettings.value = {
            autoSave: true,
            autoSaveInterval: 30,
            showWelcomeScreen: true,
            defaultProjectView: 'kanban',
            compactMode: false,
            showTaskIds: false,
            enableAnimations: true,
            desktopNotifications: {
                enabled: true,
                notifyOnTaskStart: true,
                notifyOnTaskComplete: true,
                notifyOnTaskError: true,
            },
        };

        // Reset shortcuts
        keyboardShortcuts.value.forEach((s) => {
            s.customKeys = undefined;
        });

        await saveSettings();
    }

    /**
     * Mark setup wizard as completed
     */
    async function completeSetupWizard(): Promise<void> {
        setupWizard.value = {
            ...setupWizard.value,
            completed: true,
            completedAt: new Date().toISOString(),
        };
        await saveSettings();
    }

    /**
     * Mark setup wizard as skipped
     */
    async function skipSetupWizard(dontShowAgain: boolean = false): Promise<void> {
        setupWizard.value = {
            ...setupWizard.value,
            skipped: true,
            skippedAt: new Date().toISOString(),
            dontShowAgain,
        };
        await saveSettings();
    }

    /**
     * Reset setup wizard to show again
     */
    async function resetSetupWizard(): Promise<void> {
        setupWizard.value = {
            completed: false,
            skipped: false,
            dontShowAgain: false,
        };
        await saveSettings();
    }

    /**
     * Clear error
     */

    // Model management state
    const providerFetchTimes = ref<Record<string, number>>({});

    // Model management functions
    function getProviderModels(providerId: string): string[] {
        const provider = aiProviders.value.find((p) => p.id === providerId);
        return provider?.models || [];
    }

    function getProviderModelsFetchTime(providerId: string): Date | null {
        // Check lastValidated from provider first
        const provider = aiProviders.value.find((p) => p.id === providerId);
        if (provider?.lastValidated) {
            return new Date(provider.lastValidated);
        }

        // Fallback to cache (for backwards compatibility)
        const timestamp = providerFetchTimes.value[providerId];
        return timestamp ? new Date(timestamp) : null;
    }

    async function refreshProviderModels(providerId: string): Promise<void> {
        try {
            console.log(`[SettingsStore] Refreshing models for ${providerId}`);

            // Find provider config to get API key
            const providerConfig = aiProviders.value.find((p) => p.id === providerId);
            // Use IPC to fetch models (consistent with validateApiKey) - avoids Browser environment issues
            // and ensures we get the full list of models just like validation
            console.log(`[SettingsStore] Fetching models via IPC for ${providerId}`);
            const models = await window.electron.ai.fetchModels(
                providerId,
                providerConfig?.apiKey || ''
            );

            if (!models || !Array.isArray(models)) {
                throw new Error('Failed to fetch models from provider');
            }

            // Manually update the client-side cache so AIServiceManager has access to it
            const { modelCache } = await import('../../services/ai/AIModelCacheService');
            await modelCache.setCachedModels(providerId as any, models as any[]);

            console.log(
                `[SettingsStore] Successfully fetched ${models.length} models for ${providerId}`
            );

            const modelNames = models.map((m) => m.name);

            // Update aiProviders models array and lastValidated (ensure Vue reactivity)
            const providerIndex = aiProviders.value.findIndex((p) => p.id === providerId);
            if (providerIndex >= 0 && aiProviders.value[providerIndex]) {
                const now = new Date();
                const updatedProviders = [...aiProviders.value];
                updatedProviders[providerIndex] = {
                    ...updatedProviders[providerIndex]!,
                    models: modelNames,
                    lastValidated: now.toISOString(), // Update last validated timestamp
                };
                aiProviders.value = updatedProviders;
            }

            // Update fetch time (for backwards compatibility)
            providerFetchTimes.value = {
                ...providerFetchTimes.value,
                [providerId]: Date.now(),
            };

            console.log(
                `[SettingsStore] Successfully refreshed ${models.length} models for ${providerId}`
            );
        } catch (error) {
            console.error(`[SettingsStore] Failed to refresh models for ${providerId}:`, error);
            throw error;
        }
    }

    async function checkLocalAgent(agentId: string): Promise<void> {
        const agent = localAgents.value.find((a) => a.id === agentId);
        if (!agent) return;

        agent.isChecking = true;
        try {
            const result = await window.electron.localAgents.checkInstalled(agent.command);
            agent.isInstalled = result.installed;
            agent.version = result.version;
        } catch (err) {
            console.error(`Failed to check local agent ${agentId}:`, err);
            agent.isInstalled = false;
        } finally {
            agent.isChecking = false;
        }
    }

    /**
     * Clear the current error state
     */
    function clearError(): void {
        error.value = null;
    }

    function checkRequirement(req: { provider: string; model: string }): boolean {
        // 1. Check AI Providers
        const provider = aiProviders.value.find((p) => p.id === req.provider);
        if (provider) {
            // Check if enabled and has credentials
            return !!(
                provider.enabled &&
                (provider.apiKey || provider.isConnected || provider.authMethods.includes('oauth'))
            );
        }

        // 2. Check Local Agents
        const agent = localAgents.value.find(
            (a) => a.id === req.provider || a.command === req.provider
        );
        if (agent) {
            return agent.isInstalled;
        }

        return false;
    }

    return {
        // State
        aiProviders,
        localAgents,
        userProfile,
        generalSettings,
        keyboardShortcuts,
        integrations,
        mcpServers,
        loading,
        error,
        setupWizard,
        localProviderStatus,

        // Getters
        enabledProviders,
        defaultProvider,
        connectedIntegrations,
        enabledMCPServers,
        allMCPTags,
        shortcutsByCategory,
        shouldShowSetupWizard,
        allTags,

        // Tag helpers
        getProvidersByTags,
        getProvidersByAllTags,
        getEnabledProvidersByTags,
        getTagDisplayName,
        tagDisplayNames,
        getEnabledProvidersForRecommendation,
        getLocalProviderStatus,

        // Provider helpers
        providerSupportsStreaming,
        getProviderById,

        // MCP helpers
        getMCPTagDisplayName,
        mcpTagDisplayNames,
        getMCPServersByTags,
        getMCPPermissionDefinitions,
        getMCPPermissions,
        buildMCPPermissionsFor,

        // Actions
        loadSettings,
        saveSettings,
        updateAIProvider,
        validateApiKey,
        updateProfile,
        updateGeneralSettings,
        updateShortcut,
        resetShortcut,
        updateIntegration,
        updateMCPServer,
        connectMCPServer,
        disconnectMCPServer,
        installMCPServer,
        detectLocalProvider,
        connectOAuth,
        disconnectOAuth,
        connectIntegration,
        disconnectIntegration,
        exportSettings,
        importSettings,
        resetToDefaults,
        completeSetupWizard,
        skipSetupWizard,
        resetSetupWizard,
        clearError,
        checkLocalAgent,
        checkRequirement,

        // Model management
        getProviderModels,
        getProviderModelsFetchTime,
        refreshProviderModels,
    };
});
