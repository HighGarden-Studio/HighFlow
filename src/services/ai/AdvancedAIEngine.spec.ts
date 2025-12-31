/**
 * AdvancedAIEngine Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdvancedAIEngine } from './AdvancedAIEngine';
import type {
    UserContext,
    ConversationContext,
    Answer,
    StructuredRequirement,
} from '@core/types/ai';
import type { Task, Skill, MCPIntegration, Template } from '@core/types/database';

// ==========================================
// Mock Provider Factory
// ==========================================

// ==========================================
// Mock Provider Factory
// ==========================================

const { mockExecute } = vi.hoisted(() => ({
    mockExecute: vi.fn(),
}));

vi.mock('./providers/ProviderFactory', () => {
    const MockProvider = {
        name: 'anthropic',
        execute: mockExecute,
        models: ['claude-3-5-sonnet-20250219'],
        getSupportedFeatures: vi.fn().mockReturnValue(['json_mode', 'streaming']),
        getCapabilities: vi.fn().mockReturnValue({ maxTokens: 200000, vision: true }),
    };

    const OpenAIProvider = {
        name: 'openai',
        models: ['gpt-4-turbo'],
        getSupportedFeatures: vi.fn().mockReturnValue(['json_mode', 'function_calling']),
        getCapabilities: vi.fn().mockReturnValue({ maxTokens: 128000, vision: true }),
    };

    return {
        ProviderFactory: class {
            async getProvider() {
                return MockProvider;
            }
            async getAllProviders() {
                return [MockProvider, OpenAIProvider];
            }
        },
    };
});

// ==========================================
// Test Data
// ==========================================

const mockUserContext: UserContext = {
    userId: 1,
    skillLevel: 'intermediate',
    recentProjects: [
        { title: 'E-commerce Site', id: 1, category: 'web' },
        { title: 'Blog Platform', id: 2, category: 'web' },
    ],
    preferences: {
        preferredAI: 'anthropic',
        language: 'ko',
    },
    timezone: 'Asia/Seoul',
};

const mockConversationContext: ConversationContext = {
    sessionId: 'session-123',
    mainPrompt: '인스타그램 클론 앱을 만들어주세요',
    messages: [
        {
            role: 'user',
            content: '인스타그램 클론 앱을 만들어주세요',
            timestamp: new Date(),
            metadata: { userId: 1 },
        },
    ],
    collectedInfo: {
        targetPlatform: 'web',
    },
    currentPhase: 'initial',
};

const mockAnswers: Answer[] = [
    { questionId: 'q1', value: '사진 공유 기능', confidence: 0.9, timestamp: new Date() },
    { questionId: 'q2', value: '웹과 모바일', confidence: 0.9, timestamp: new Date() },
    { questionId: 'q3', value: '소셜 로그인', confidence: 0.9, timestamp: new Date() },
];

const mockRequirement: StructuredRequirement = {
    title: '소셜 미디어 앱',
    description: '인스타그램과 유사한 사진 공유 앱',
    goals: [
        '사용자가 사진을 업로드하고 공유할 수 있다',
        '다른 사용자를 팔로우할 수 있다',
        '피드에서 팔로우한 사용자의 게시물을 볼 수 있다',
    ],
    constraints: {
        budget: 50000,
        deadline: '2024-06-01',
        technical: ['Vue 3', 'TypeScript', 'PostgreSQL'],
    },
    context: {
        domain: 'social-media',
        stakeholders: ['end-users', 'content-creators'],
    },
    acceptanceCriteria: [
        '사용자가 1분 이내에 사진을 업로드할 수 있다',
        '피드가 3초 이내에 로드된다',
        '동시 사용자 1000명 지원',
    ],
    metadata: {
        priority: 'high',
        tags: ['social', 'photos', 'mobile-first'],
    },
};

const mockTask: Task = {
    id: 1,
    projectId: 1,
    projectSequence: 1,
    title: '사용자 인증 구현',
    description: '이메일/비밀번호 및 소셜 로그인 기능 구현',
    generatedPrompt: null,
    status: 'todo',
    executionType: 'serial',
    aiProvider: 'anthropic',
    aiModel: 'claude-3-5-sonnet-20250219',
    reviewAiProvider: null,
    reviewAiModel: null,
    mcpConfig: {},
    assignedOperatorId: null,
    order: 0,
    parentTaskId: null,
    assigneeId: null,
    watcherIds: [],
    actualMinutes: null,
    tokenUsage: null,
    estimatedCost: 0,
    actualCost: 0,
    dueDate: null,
    startedAt: null,
    completedAt: null,
    blockedReason: null,
    blockedByTaskId: null,
    gitCommits: [],
    deletedAt: null,
    isPaused: false,
    autoReview: false,
    autoReviewed: false,
    autoApprove: false,
    reviewFailed: false,
    triggerConfig: null,
    pausedAt: null,
    isSubdivided: false,
    subtaskCount: 0,
    executionOrder: null,
    dependencies: [],
    expectedOutputFormat: null,
    recommendedProviders: [],
    requiredMCPs: [],
    aiOptimizedPrompt: null,
    executionResult: null,
    priority: 'high',
    estimatedMinutes: 480,
    tags: ['auth', 'backend', 'security'],
    createdAt: new Date(),
    updatedAt: new Date(),
};

const mockSkills: Skill[] = [
    {
        id: 1,
        name: 'OAuth Integration',
        category: 'authentication',
        description: 'OAuth 2.0 social login integration',
        mcpRequirements: ['github-mcp'],
        createdAt: new Date(),
        updatedAt: new Date(),
        prompt: '',
        aiProvider: null,
        inputSchema: null,
        outputSchema: null,
        isPublic: true,
        isOfficial: true,
        authorId: 1,
        teamId: null,
        version: 1,
        forkCount: 0,
        usageCount: 0,
        rating: 0,
        reviews: [],
        changelog: [],
    },
    {
        id: 2,
        name: 'Database Design',
        category: 'backend',
        description: 'Relational database schema design',
        mcpRequirements: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        prompt: '',
        aiProvider: null,
        inputSchema: null,
        outputSchema: null,
        isPublic: true,
        isOfficial: true,
        authorId: 1,
        teamId: null,
        version: 1,
        forkCount: 0,
        usageCount: 0,
        rating: 0,
        reviews: [],
        changelog: [],
    },
];

const mockMCPs: MCPIntegration[] = [
    {
        id: 1,
        name: 'GitHub MCP',
        description: 'GitHub repository and code management',
        endpoint: 'https://api.github.com',
        isOfficial: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        configSchema: {},
        isEnabled: true,
        installedBy: 1,
        installedAt: new Date(),
        settings: {},
    },
    {
        id: 2,
        name: 'Slack MCP',
        description: 'Slack messaging and notifications',
        endpoint: 'https://slack.com/api',
        isOfficial: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        configSchema: {},
        isEnabled: true,
        installedBy: 1,
        installedAt: new Date(),
        settings: {},
    },
];

// ==========================================
// Tests
// ==========================================

describe('AdvancedAIEngine', () => {
    let engine: AdvancedAIEngine;

    beforeEach(() => {
        vi.clearAllMocks();
        engine = new AdvancedAIEngine();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ==========================================
    // analyzeMainPrompt Tests
    // ==========================================

    describe('analyzeMainPrompt', () => {
        it('should analyze prompt and return requirements', async () => {
            mockExecute.mockResolvedValue({
                content: JSON.stringify({
                    requirements: [
                        {
                            category: 'feature',
                            question: '어떤 기능이 필요하나요?',
                            importance: 'high',
                        },
                    ],
                    complexity: 'complex',
                    recommendedAI: 'anthropic',
                    confidence: 0.85,
                    keywords: ['인스타그램', '클론', '소셜'],
                    domain: 'social-media',
                }),
            });

            const result = await engine.analyzeMainPrompt(
                '인스타그램 클론 만들기',
                mockUserContext
            );

            expect(result).toBeDefined();
            expect(result.requirements.length).toBeGreaterThan(0);
            expect(result.estimatedComplexity).toBe('complex');
            expect(result.confidence).toBeGreaterThan(0);
        });

        it('should handle JSON parsing errors gracefully', async () => {
            mockExecute.mockResolvedValue({
                content: 'Invalid JSON response',
            });

            const result = await engine.analyzeMainPrompt('간단한 블로그 만들기', mockUserContext);

            expect(result).toBeDefined();
            expect(result.estimatedComplexity).toBe('medium');
            expect(result.confidence).toBeLessThan(1);
        });

        it('should call provider with correct parameters', async () => {
            mockExecute.mockResolvedValue({
                content: JSON.stringify({
                    requirements: [],
                    complexity: 'simple',
                    recommendedAI: 'openai',
                    confidence: 0.9,
                    keywords: [],
                    domain: 'general',
                }),
            });

            await engine.analyzeMainPrompt('Test prompt', mockUserContext);

            expect(mockExecute).toHaveBeenCalledWith(
                expect.stringContaining('Test prompt'),
                expect.objectContaining({
                    model: 'claude-3-5-sonnet-20250219',
                    temperature: 0.3,
                    responseFormat: 'json',
                }),
                expect.objectContaining({
                    userId: mockUserContext.userId,
                })
            );
        });
    });

    // ==========================================
    // generateFollowUpQuestions Tests
    // ==========================================

    describe('generateFollowUpQuestions', () => {
        it('should generate relevant follow-up questions', async () => {
            mockExecute.mockResolvedValue({
                content: JSON.stringify({
                    questions: [
                        {
                            id: 'q1',
                            text: '타겟 사용자층은 어떻게 되나요?',
                            type: 'text',
                            validation: { required: true },
                        },
                        {
                            id: 'q2',
                            text: '예상 사용자 수는?',
                            type: 'range',
                            options: ['100-1000', '1000-10000', '10000+'],
                            validation: { required: true },
                        },
                    ],
                }),
            });

            const questions = await engine.generateFollowUpQuestions(
                mockConversationContext,
                mockAnswers
            );

            expect(questions).toBeDefined();
            expect(questions.length).toBeGreaterThan(0);
            expect(questions[0]).toHaveProperty('id');
            expect(questions[0]).toHaveProperty('text');
            expect(questions[0]).toHaveProperty('type');
        });

        it('should return empty array on parsing error', async () => {
            mockExecute.mockResolvedValue({
                content: 'not valid json',
            });

            const questions = await engine.generateFollowUpQuestions(mockConversationContext, []);

            expect(questions).toEqual([]);
        });
    });

    // ==========================================
    // synthesizeRequirements Tests
    // ==========================================

    describe('synthesizeRequirements', () => {
        it('should synthesize answers into structured requirements', async () => {
            mockExecute.mockResolvedValue({
                content: JSON.stringify({
                    title: '소셜 미디어 앱',
                    description: '사진 공유 중심의 소셜 플랫폼',
                    goals: ['사진 업로드', '팔로우 기능', '피드 구현'],
                    constraints: { budget: 50000 },
                    context: { domain: 'social-media' },
                    acceptanceCriteria: ['빠른 로딩', '안정적인 업로드'],
                    metadata: { priority: 'high' },
                }),
            });

            const result = await engine.synthesizeRequirements('인스타그램 클론', mockAnswers);

            expect(result).toBeDefined();
            expect(result.title).toBe('소셜 미디어 앱');
            expect(result.goals.length).toBeGreaterThan(0);
            expect(result.acceptanceCriteria.length).toBeGreaterThan(0);
        });

        it('should handle synthesis with template context', async () => {
            const mockTemplate: Template = {
                id: 1,
                name: 'Social Media App',
                description: 'Template for social media applications',
                category: 'social',
                createdAt: new Date(),
                updatedAt: new Date(),
                coverImage: 'cover.jpg',
                tags: ['social', 'app'],
                projectStructure: { tasks: [] },
                aiProviderRecommendations: null,
                authorId: 1,
                isOfficial: true,
                isPublic: true,
                usageCount: 0,
                rating: 0,
            };

            mockExecute.mockResolvedValue({
                content: JSON.stringify({
                    title: 'Social App from Template',
                    description: 'Based on social media template',
                    goals: [],
                    constraints: {},
                    context: { domain: 'social' },
                    acceptanceCriteria: [],
                    metadata: {},
                }),
            });

            const result = await engine.synthesizeRequirements(
                'Make a social app',
                mockAnswers,
                mockTemplate
            );

            expect(result.title).toBe('Social App from Template');
        });
    });

    // ==========================================
    // decomposeTasks Tests
    // ==========================================

    describe('decomposeTasks', () => {
        it('should decompose requirements into tasks with dependencies', async () => {
            mockExecute.mockResolvedValue({
                content: JSON.stringify({
                    tasks: [
                        {
                            title: '프로젝트 설정',
                            description: '초기 환경 구성',
                            priority: 'high',
                            estimatedMinutes: 120,
                            dependencies: [],
                        },
                        {
                            title: '인증 구현',
                            description: '사용자 인증 시스템',
                            priority: 'high',
                            estimatedMinutes: 480,
                            dependencies: ['프로젝트 설정'],
                        },
                    ],
                    dependencyGraph: {
                        nodes: ['task-1', 'task-2'],
                        edges: [{ from: 'task-1', to: 'task-2' }],
                    },
                    executionPlan: {
                        phases: ['setup', 'core', 'features'],
                        criticalPath: ['task-1', 'task-2'],
                        parallelizableGroups: [],
                        estimatedTotalTime: 600,
                        bottlenecks: [],
                    },
                    estimatedTime: 600,
                    estimatedCost: 500,
                    risks: [{ description: 'Tight deadline', severity: 'medium' }],
                }),
            });

            const result = await engine.decomposeTasks(mockRequirement);

            expect(result).toBeDefined();
            expect(result.tasks.length).toBeGreaterThan(0);
            expect(result.dependencyGraph).toBeDefined();
            expect(result.estimatedTime).toBeGreaterThan(0);
        });

        it('should return empty result on parsing error', async () => {
            mockExecute.mockResolvedValue({
                content: 'invalid',
            });

            const result = await engine.decomposeTasks(mockRequirement);

            expect(result.tasks).toEqual([]);
            expect(result.estimatedTime).toBe(0);
        });
    });

    // ==========================================
    // recommendSkills Tests
    // ==========================================

    describe('recommendSkills', () => {
        it('should recommend relevant skills for a task', async () => {
            mockExecute.mockResolvedValue({
                content: JSON.stringify({
                    recommendations: [
                        {
                            skillId: 'skill-1',
                            skillName: 'OAuth Integration',
                            relevanceScore: 0.95,
                            reason: 'Essential for social login implementation',
                            estimatedImpact: { timeReduction: 30, qualityImprovement: 20 },
                            requiredMCPs: ['github-mcp'],
                        },
                    ],
                }),
            });

            const recommendations = await engine.recommendSkills(mockTask, mockSkills);

            expect(recommendations).toBeDefined();
            expect(recommendations.length).toBeGreaterThan(0);
            expect(recommendations[0].relevanceScore).toBeGreaterThan(0);
        });
    });

    // ==========================================
    // matchMCPTools Tests
    // ==========================================

    describe('matchMCPTools', () => {
        it('should match relevant MCP tools for a task', async () => {
            mockExecute.mockResolvedValue({
                content: JSON.stringify({
                    matches: [
                        {
                            mcpId: 'mcp-1',
                            mcpName: 'GitHub MCP',
                            confidence: 0.9,
                            reason: 'Code management and version control',
                            suggestedTools: ['create_repo', 'commit_changes'],
                        },
                    ],
                }),
            });

            const matches = await engine.matchMCPTools(mockTask, mockMCPs);

            expect(matches).toBeDefined();
            expect(matches.length).toBeGreaterThan(0);
            expect(matches[0].confidence).toBeGreaterThan(0);
        });
    });

    // ==========================================
    // selectOptimalProvider Tests
    // ==========================================

    describe('selectOptimalProvider', () => {
        it('should select optimal AI provider based on constraints', async () => {
            mockExecute.mockResolvedValue({
                content: JSON.stringify({
                    provider: 'anthropic',
                    model: 'claude-3-5-sonnet-20250219',
                    estimatedCost: 0.05,
                    estimatedTime: 30000,
                    reasoning: 'Best for complex reasoning tasks',
                    alternatives: [
                        {
                            provider: 'openai',
                            model: 'gpt-4-turbo',
                            tradeoff: 'Slightly faster but less accurate',
                        },
                    ],
                }),
            });

            const result = await engine.selectOptimalProvider(mockTask, {
                maxCost: 0.1,
                maxLatency: 60000,
                requiredFeatures: ['json_mode'],
            });

            expect(result).toBeDefined();
            expect(result.provider).toBe('anthropic');
            expect(result.reasoning).toBeTruthy();
            expect(result.alternatives.length).toBeGreaterThan(0);
        });

        it('should return default provider on parsing error', async () => {
            mockExecute.mockResolvedValue({
                content: 'invalid json',
            });

            const result = await engine.selectOptimalProvider(mockTask, {});

            expect(result.provider).toBe('anthropic');
            expect(result.model).toBe('claude-3-5-sonnet-20250219');
        });
    });

    // ==========================================
    // Conversation Management Tests
    // ==========================================

    describe('Conversation Management', () => {
        it('should create a new conversation context', () => {
            const context = engine.createConversation('새 프로젝트 만들기', 1);

            expect(context).toBeDefined();
            expect(context.sessionId).toBeTruthy();
            expect(context.mainPrompt).toBe('새 프로젝트 만들기');
            expect(context.messages.length).toBe(1);
            expect(context.currentPhase).toBe('initial');
        });

        it('should update conversation with new messages', () => {
            const context = engine.createConversation('Test prompt', 1);
            const sessionId = context.sessionId;

            engine.updateConversation(sessionId, 'User response', 'user');
            engine.updateConversation(sessionId, 'AI response', 'assistant');

            const updatedContext = engine.getConversation(sessionId);
            expect(updatedContext?.messages.length).toBe(3);
        });

        it('should retrieve conversation by session ID', () => {
            const context = engine.createConversation('Test', 1);
            const retrieved = engine.getConversation(context.sessionId);

            expect(retrieved).toBeDefined();
            expect(retrieved?.sessionId).toBe(context.sessionId);
        });

        it('should return undefined for non-existent session', () => {
            const result = engine.getConversation('non-existent-session');
            expect(result).toBeUndefined();
        });
    });
});
