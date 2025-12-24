/**
 * AI Assistant Service
 *
 * Provides intelligent natural language assistance including:
 * - Query understanding and response
 * - Context-aware suggestions
 * - Activity summaries and insights
 * - Automated actions
 */

import { searchEngine } from '../search/SearchEngine';
import { aiClient } from '../ai/AIClient';
import type { Task, Project } from '@core/types/database';

// ========================================
// Types
// ========================================

export interface AssistantContext {
    currentProjectId?: number;
    currentTaskId?: number;
    currentView?: 'projects' | 'board' | 'task' | 'settings' | 'dashboard';
    recentActivity?: ActivityItem[];
    userPreferences?: UserPreferences;
}

export interface ActivityItem {
    type: 'task_created' | 'task_completed' | 'task_updated' | 'project_created' | 'comment_added';
    entityId: number;
    entityType: 'task' | 'project' | 'comment';
    title: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}

export interface UserPreferences {
    language: 'ko' | 'en';
    defaultAIProvider?: string;
    timezone?: string;
}

export interface AssistantResponse {
    type: 'text' | 'list' | 'action' | 'chart' | 'summary' | 'suggestion';
    content: string;
    data?: unknown;
    actions?: AssistantAction[];
    suggestions?: Suggestion[];
    followUp?: string[];
}

export interface AssistantAction {
    id: string;
    label: string;
    type: 'navigate' | 'create' | 'update' | 'delete' | 'execute';
    payload: Record<string, unknown>;
    icon?: string;
    variant?: 'primary' | 'secondary' | 'danger';
}

export interface Suggestion {
    id: string;
    type: 'task' | 'skill' | 'action' | 'tip';
    title: string;
    description: string;
    relevanceScore: number;
    action?: AssistantAction;
}

export interface ConversationMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    actions?: AssistantAction[];
}

export interface ActivitySummary {
    period: 'daily' | 'weekly' | 'monthly';
    startDate: Date;
    endDate: Date;
    tasksCreated: number;
    tasksCompleted: number;
    totalTimeSpent: number;
    topProjects: Array<{ id: number; name: string; taskCount: number }>;
    highlights: string[];
    insights: string[];
}

export interface Insight {
    type: 'bottleneck' | 'cost_optimization' | 'productivity' | 'deadline' | 'workload';
    severity: 'info' | 'warning' | 'critical';
    title: string;
    description: string;
    recommendation: string;
    relatedEntities?: Array<{ type: string; id: number; name: string }>;
}

// ========================================
// Query Intent Types
// ========================================

type QueryIntent =
    | 'search'
    | 'summary'
    | 'status'
    | 'recommendation'
    | 'create'
    | 'update'
    | 'navigate'
    | 'deadline'
    | 'help'
    | 'unknown';

interface ParsedQuery {
    intent: QueryIntent;
    entities: {
        projectName?: string;
        taskName?: string;
        timeRange?: 'today' | 'week' | 'month' | 'all';
        status?: string;
        priority?: string;
    };
    originalQuery: string;
}

// ========================================
// AI Assistant Implementation
// ========================================

export class AIAssistant {
    private conversationHistory: ConversationMessage[];
    private readonly maxHistoryLength = 50;

    // Korean and English query patterns
    private readonly queryPatterns: Array<{ patterns: RegExp[]; intent: QueryIntent }> = [
        {
            intent: 'summary',
            patterns: [
                /이번\s*주에?\s*(뭐|무엇을?)\s*(했|한|했어|했나)/i,
                /오늘\s*(뭐|무엇을?)\s*(했|한)/i,
                /활동\s*요약/i,
                /진행\s*상황/i,
                /what\s*(did|have)\s*i\s*do/i,
                /summary/i,
                /progress\s*report/i,
            ],
        },
        {
            intent: 'recommendation',
            patterns: [
                /다음에?\s*(뭐|무엇을?)\s*(해야|할까)/i,
                /추천/i,
                /제안/i,
                /what\s*should\s*i\s*do/i,
                /recommend/i,
                /suggest/i,
            ],
        },
        {
            intent: 'status',
            patterns: [
                /프로젝트.*상황/i,
                /프로젝트.*상태/i,
                /진행.*어때/i,
                /project\s*status/i,
                /how.*going/i,
            ],
        },
        {
            intent: 'deadline',
            patterns: [/마감/i, /임박/i, /due\s*date/i, /deadline/i, /upcoming/i, /urgent/i],
        },
        {
            intent: 'create',
            patterns: [/생성/i, /만들어/i, /추가/i, /create/i, /add/i, /new/i],
        },
        {
            intent: 'navigate',
            patterns: [/보여줘/i, /이동/i, /열어/i, /show/i, /open/i, /go\s*to/i],
        },
        {
            intent: 'search',
            patterns: [/찾아/i, /검색/i, /어디/i, /find/i, /search/i, /where/i],
        },
        {
            intent: 'help',
            patterns: [/도움/i, /어떻게/i, /help/i, /how\s*to/i],
        },
    ];

    constructor() {
        this.conversationHistory = [];
    }

    // ========================================
    // Main Query Handler
    // ========================================

    /**
     * Handle a natural language query
     */
    async handleQuery(
        query: string,
        context?: AssistantContext,
        dataProvider?: DataProvider
    ): Promise<AssistantResponse> {
        // Parse the query to understand intent
        const parsed = this.parseQuery(query);

        // Add to conversation history
        this.addToHistory({
            id: this.generateId(),
            role: 'user',
            content: query,
            timestamp: new Date(),
        });

        let response: AssistantResponse;

        try {
            switch (parsed.intent) {
                case 'summary':
                    response = await this.handleSummaryQuery(parsed, context, dataProvider);
                    break;
                case 'recommendation':
                    response = await this.handleRecommendationQuery(parsed, context, dataProvider);
                    break;
                case 'status':
                    response = await this.handleStatusQuery(parsed, context, dataProvider);
                    break;
                case 'deadline':
                    response = await this.handleDeadlineQuery(parsed, context, dataProvider);
                    break;
                case 'create':
                    response = await this.handleCreateQuery(parsed, context);
                    break;
                case 'navigate':
                    response = await this.handleNavigateQuery(parsed, context);
                    break;
                case 'search':
                    response = await this.handleSearchQuery(parsed, context);
                    break;
                case 'help':
                    response = this.handleHelpQuery(parsed);
                    break;
                default:
                    response = await this.handleUnknownQuery(parsed, context);
            }
        } catch (error) {
            response = {
                type: 'text',
                content: '죄송합니다. 요청을 처리하는 중 오류가 발생했습니다. 다시 시도해 주세요.',
                followUp: ['다시 질문하기', '도움말 보기'],
            };
        }

        // Add response to history
        this.addToHistory({
            id: this.generateId(),
            role: 'assistant',
            content: response.content,
            timestamp: new Date(),
            actions: response.actions,
        });

        return response;
    }

    /**
     * Chat with context awareness
     */
    async chatWithContext(
        message: string,
        context: AssistantContext,
        dataProvider?: DataProvider
    ): Promise<string> {
        const response = await this.handleQuery(message, context, dataProvider);
        return response.content;
    }

    /**
     * Get suggestions based on current context
     */
    async getSuggestions(
        context: AssistantContext,
        _dataProvider?: DataProvider
    ): Promise<Suggestion[]> {
        const suggestions: Suggestion[] = [];

        // Context-aware suggestions
        if (context.currentView === 'board' && context.currentProjectId) {
            suggestions.push({
                id: 'create-task',
                type: 'action',
                title: '새 태스크 생성',
                description: '이 프로젝트에 새로운 태스크를 추가합니다.',
                relevanceScore: 0.9,
                action: {
                    id: 'create-task',
                    label: '태스크 생성',
                    type: 'create',
                    payload: { entityType: 'task', projectId: context.currentProjectId },
                    icon: 'plus',
                    variant: 'primary',
                },
            });
        }

        // Add general suggestions
        suggestions.push(
            {
                id: 'weekly-summary',
                type: 'action',
                title: '이번 주 요약 보기',
                description: '이번 주 활동 요약을 확인합니다.',
                relevanceScore: 0.7,
                action: {
                    id: 'weekly-summary',
                    label: '요약 보기',
                    type: 'execute',
                    payload: { action: 'summary', period: 'weekly' },
                    icon: 'chart',
                },
            },
            {
                id: 'urgent-tasks',
                type: 'tip',
                title: '마감 임박 태스크 확인',
                description: '마감일이 가까운 태스크를 확인하세요.',
                relevanceScore: 0.8,
                action: {
                    id: 'urgent-tasks',
                    label: '확인하기',
                    type: 'navigate',
                    payload: { view: 'tasks', filter: 'urgent' },
                    icon: 'alert',
                },
            }
        );

        return suggestions.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }

    // ========================================
    // Query Handlers
    // ========================================

    private async handleSummaryQuery(
        parsed: ParsedQuery,
        _context?: AssistantContext,
        _dataProvider?: DataProvider
    ): Promise<AssistantResponse> {
        const timeRange = parsed.entities.timeRange || 'week';

        // Generate summary content
        let summaryContent = '';
        const actions: AssistantAction[] = [];

        if (timeRange === 'today') {
            summaryContent = `📊 **오늘의 활동 요약**\n\n`;
        } else if (timeRange === 'week') {
            summaryContent = `📊 **이번 주 활동 요약**\n\n`;
        } else {
            summaryContent = `📊 **이번 달 활동 요약**\n\n`;
        }

        // Add mock data (would be replaced with actual data from dataProvider)
        summaryContent += `• 완료한 태스크: 12개\n`;
        summaryContent += `• 진행 중인 태스크: 5개\n`;
        summaryContent += `• 승인 대기: 2개\n`;
        summaryContent += `• 총 소요 시간: 24시간\n\n`;
        summaryContent += `💡 **인사이트**: 이번 주 생산성이 지난 주 대비 15% 증가했습니다.`;

        actions.push({
            id: 'view-detail',
            label: '상세 보기',
            type: 'navigate',
            payload: { view: 'dashboard', tab: 'analytics' },
            variant: 'secondary',
        });

        return {
            type: 'summary',
            content: summaryContent,
            actions,
            followUp: ['더 자세한 분석 보기', '지난 주와 비교하기'],
        };
    }

    private async handleRecommendationQuery(
        _parsed: ParsedQuery,
        _context?: AssistantContext,
        _dataProvider?: DataProvider
    ): Promise<AssistantResponse> {
        const content = `🎯 **추천 태스크**\n\n다음 태스크들을 우선적으로 처리하는 것을 추천합니다:\n\n`;

        const suggestions: Suggestion[] = [
            {
                id: 'rec-1',
                type: 'task',
                title: '긴급: API 버그 수정',
                description: '마감일이 내일입니다. 우선순위가 높습니다.',
                relevanceScore: 0.95,
                action: {
                    id: 'open-task-1',
                    label: '태스크 열기',
                    type: 'navigate',
                    payload: { view: 'task', taskId: 1 },
                },
            },
            {
                id: 'rec-2',
                type: 'task',
                title: '승인 대기: 디자인 검토',
                description: '사용자 승인이 필요합니다.',
                relevanceScore: 0.9,
                action: {
                    id: 'open-task-2',
                    label: '승인하기',
                    type: 'navigate',
                    payload: { view: 'task', taskId: 2 },
                },
            },
        ];

        return {
            type: 'suggestion',
            content,
            suggestions,
            followUp: ['다른 추천 보기', '오늘 할 일 정하기'],
        };
    }

    private async handleStatusQuery(
        _parsed: ParsedQuery,
        context?: AssistantContext,
        _dataProvider?: DataProvider
    ): Promise<AssistantResponse> {
        let content = '';

        if (context?.currentProjectId) {
            content = `📈 **프로젝트 진행 상황**\n\n`;
            content += `• 전체 태스크: 25개\n`;
            content += `• 완료: 15개 (60%)\n`;
            content += `• 진행 중: 7개\n`;
            content += `• 승인 대기: 2개\n`;
            content += `• 차단됨: 1개\n\n`;
            content += `🔄 예상 완료일: 12월 15일`;
        } else {
            content = `📈 **전체 프로젝트 현황**\n\n`;
            content += `• 활성 프로젝트: 3개\n`;
            content += `• 이번 주 완료 태스크: 12개\n`;
            content += `• 진행 중인 태스크: 8개\n`;
            content += `• 승인 대기: 3개`;
        }

        return {
            type: 'summary',
            content,
            actions: [
                {
                    id: 'view-board',
                    label: '칸반 보드 보기',
                    type: 'navigate',
                    payload: { view: 'board', projectId: context?.currentProjectId },
                    variant: 'primary',
                },
            ],
            followUp: ['상세 분석 보기', '병목 구간 확인'],
        };
    }

    private async handleDeadlineQuery(
        _parsed: ParsedQuery,
        _context?: AssistantContext,
        _dataProvider?: DataProvider
    ): Promise<AssistantResponse> {
        const content = `⏰ **마감 임박 태스크**\n\n`;

        // Mock deadline tasks
        const deadlineTasks = [
            { id: 1, title: 'API 버그 수정', dueDate: '내일', priority: 'urgent' },
            { id: 2, title: 'UI 컴포넌트 구현', dueDate: '2일 후', priority: 'high' },
            { id: 3, title: '테스트 코드 작성', dueDate: '3일 후', priority: 'medium' },
        ];

        return {
            type: 'list',
            content:
                content +
                deadlineTasks
                    .map((t) => `• **${t.title}** - ${t.dueDate} (${t.priority})`)
                    .join('\n'),
            data: deadlineTasks,
            actions: deadlineTasks.map((t) => ({
                id: `open-task-${t.id}`,
                label: t.title,
                type: 'navigate' as const,
                payload: { view: 'task', taskId: t.id },
            })),
            followUp: ['이번 주 마감 태스크 보기', '마감일 변경하기'],
        };
    }

    private async handleCreateQuery(
        _parsed: ParsedQuery,
        context?: AssistantContext
    ): Promise<AssistantResponse> {
        const content = `✨ **생성 옵션**\n\n무엇을 생성하시겠습니까?`;

        return {
            type: 'action',
            content,
            actions: [
                {
                    id: 'create-project',
                    label: '새 프로젝트',
                    type: 'create',
                    payload: { entityType: 'project' },
                    icon: 'folder',
                    variant: 'primary',
                },
                {
                    id: 'create-task',
                    label: '새 태스크',
                    type: 'create',
                    payload: { entityType: 'task', projectId: context?.currentProjectId },
                    icon: 'task',
                    variant: 'secondary',
                },
                {
                    id: 'ai-project',
                    label: 'AI 프로젝트 생성',
                    type: 'create',
                    payload: { entityType: 'project', useAI: true },
                    icon: 'sparkles',
                    variant: 'primary',
                },
            ],
            followUp: ['AI로 태스크 분해하기', '템플릿에서 생성하기'],
        };
    }

    private async handleNavigateQuery(
        parsed: ParsedQuery,
        _context?: AssistantContext
    ): Promise<AssistantResponse> {
        // Try to find matching entities through search
        const query = (parsed.entities.projectName ||
            parsed.entities.taskName ||
            parsed.originalQuery) as string;
        const searchResults = await searchEngine.search(query, {}, { limit: 5 });

        if (searchResults.length > 0) {
            return {
                type: 'list',
                content: `🔍 **찾은 결과**\n\n다음 중 이동하실 항목을 선택하세요:`,
                data: searchResults,
                actions: searchResults.map((r) => ({
                    id: `nav-${r.entityType}-${r.entityId}`,
                    label: r.title,
                    type: 'navigate' as const,
                    payload: { view: r.entityType, entityId: r.entityId },
                })),
            };
        }

        return {
            type: 'text',
            content: '검색 결과가 없습니다. 다른 검색어로 시도해 보세요.',
            followUp: ['프로젝트 목록 보기', '전체 검색하기'],
        };
    }

    private async handleSearchQuery(
        parsed: ParsedQuery,
        _context?: AssistantContext
    ): Promise<AssistantResponse> {
        const searchResults = await searchEngine.search(
            parsed.originalQuery,
            {},
            { limit: 10, highlight: true }
        );

        if (searchResults.length === 0) {
            return {
                type: 'text',
                content: `🔍 "${parsed.originalQuery}"에 대한 검색 결과가 없습니다.`,
                followUp: ['다른 키워드로 검색', '고급 검색 사용'],
            };
        }

        const content = `🔍 **검색 결과** (${searchResults.length}건)\n\n`;

        return {
            type: 'list',
            content,
            data: searchResults,
            actions: searchResults.slice(0, 5).map((r) => ({
                id: `search-${r.entityType}-${r.entityId}`,
                label: r.title,
                type: 'navigate' as const,
                payload: { view: r.entityType, entityId: r.entityId },
            })),
            followUp: ['검색 결과 더 보기', '검색 조건 수정'],
        };
    }

    private handleHelpQuery(_parsed: ParsedQuery): AssistantResponse {
        const content = `🤖 **AI 비서 도움말**\n\n다음과 같은 질문을 할 수 있습니다:\n\n`;
        const examples = [
            '• "이번 주에 뭐 했어?" - 주간 활동 요약',
            '• "다음에 뭐 해야 해?" - 우선순위 추천',
            '• "프로젝트 X 진행 상황은?" - 프로젝트 현황',
            '• "마감 임박한 태스크 보여줘" - 마감 목록',
            '• "새 프로젝트 만들어줘" - 프로젝트 생성',
            '• "API 관련 태스크 찾아줘" - 검색',
        ];

        return {
            type: 'text',
            content: content + examples.join('\n'),
            followUp: ['더 많은 예시 보기', '설정으로 이동'],
        };
    }

    private async handleUnknownQuery(
        parsed: ParsedQuery,
        context?: AssistantContext
    ): Promise<AssistantResponse> {
        // First, try to use real AI if available
        if (aiClient.getAvailableProvider()) {
            try {
                const aiResponse = await this.getAIResponse(parsed.originalQuery, context);
                return {
                    type: 'text',
                    content: aiResponse,
                    followUp: ['더 자세히 알려줘', '다른 질문하기'],
                };
            } catch (error) {
                console.warn('AI response failed, falling back to search:', error);
            }
        }

        // Try search as fallback
        const searchResults = await searchEngine.search(
            parsed.originalQuery,
            {},
            { limit: 5, fuzzy: true }
        );

        if (searchResults.length > 0) {
            return {
                type: 'list',
                content: `💡 다음 결과가 도움이 될 수 있습니다:`,
                data: searchResults,
                actions: searchResults.map((r) => ({
                    id: `unknown-${r.entityType}-${r.entityId}`,
                    label: r.title,
                    type: 'navigate' as const,
                    payload: { view: r.entityType, entityId: r.entityId },
                })),
                followUp: ['다시 질문하기', '도움말 보기'],
            };
        }

        // No AI available message
        if (!aiClient.getAvailableProvider()) {
            return {
                type: 'text',
                content:
                    '🔧 **AI 설정 필요**\n\nAI 비서 기능을 사용하려면 Settings에서 AI 제공자(OpenAI, Anthropic, Google)의 API 키를 설정해주세요.\n\n현재는 기본 명령어만 사용 가능합니다. "도움말"을 입력하여 사용 가능한 명령어를 확인하세요.',
                followUp: ['설정으로 이동', '도움말 보기'],
                actions: [
                    {
                        id: 'go-settings',
                        label: 'Settings 열기',
                        type: 'navigate',
                        payload: { view: 'settings', tab: 'ai' },
                        variant: 'primary',
                    },
                ],
            };
        }

        return {
            type: 'text',
            content:
                '죄송합니다. 질문을 이해하지 못했습니다. 다른 방식으로 질문해 주시거나, "도움말"이라고 입력하여 사용 가능한 명령어를 확인하세요.',
            followUp: ['도움말 보기', '예시 질문 보기'],
        };
    }

    /**
     * Get response from AI using the configured provider
     */
    private async getAIResponse(query: string, context?: AssistantContext): Promise<string> {
        // Build conversation history for context
        const recentMessages = this.conversationHistory.slice(-6);

        const systemPrompt = `당신은 HighFlow 앱의 AI 비서입니다. 사용자가 프로젝트와 태스크를 관리하는 것을 돕습니다.

주요 역할:
- 프로젝트 관리에 대한 조언 제공
- 태스크 우선순위 및 일정 관리 도움
- 생산성 향상을 위한 제안
- 질문에 대한 친절하고 도움이 되는 답변

현재 컨텍스트:
- 현재 화면: ${context?.currentView || '알 수 없음'}
${context?.currentProjectId ? `- 현재 프로젝트 ID: ${context.currentProjectId}` : ''}
${context?.currentTaskId ? `- 현재 태스크 ID: ${context.currentTaskId}` : ''}

응답 시 마크다운 형식을 사용하세요. 간결하고 실용적인 답변을 제공하세요.`;

        const messages = [
            { role: 'system' as const, content: systemPrompt },
            ...recentMessages.map((m) => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            })),
            { role: 'user' as const, content: query },
        ];

        const response = await aiClient.completion(messages, {
            temperature: 0.7,
            maxTokens: 1000,
        });

        return response.content;
    }

    // ========================================
    // Summary & Insights
    // ========================================

    /**
     * Generate activity summary
     */
    async generateActivitySummary(
        period: 'daily' | 'weekly' | 'monthly',
        _dataProvider: DataProvider
    ): Promise<ActivitySummary> {
        const now = new Date();
        let startDate: Date;

        switch (period) {
            case 'daily':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'weekly':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'monthly':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
        }

        // This would fetch real data from dataProvider
        return {
            period,
            startDate,
            endDate: now,
            tasksCreated: 0,
            tasksCompleted: 0,
            totalTimeSpent: 0,
            topProjects: [],
            highlights: [],
            insights: [],
        };
    }

    /**
     * Detect insights and provide recommendations
     */
    async detectInsights(_dataProvider: DataProvider): Promise<Insight[]> {
        const insights: Insight[] = [];

        // These would be calculated from real data
        insights.push({
            type: 'bottleneck',
            severity: 'warning',
            title: '리뷰 단계 병목 감지',
            description: '현재 5개의 태스크가 IN_REVIEW 상태에서 3일 이상 대기 중입니다.',
            recommendation: '검토 프로세스를 점검하거나 리뷰어를 추가로 지정해 보세요.',
            relatedEntities: [],
        });

        return insights;
    }

    // ========================================
    // Conversation History
    // ========================================

    /**
     * Get conversation history
     */
    getConversationHistory(): ConversationMessage[] {
        return [...this.conversationHistory];
    }

    /**
     * Clear conversation history
     */
    clearConversationHistory(): void {
        this.conversationHistory = [];
    }

    // ========================================
    // Private Helper Methods
    // ========================================

    private parseQuery(query: string): ParsedQuery {
        const normalizedQuery = query.toLowerCase().trim();

        // Detect intent
        let intent: QueryIntent = 'unknown';
        for (const { patterns, intent: patternIntent } of this.queryPatterns) {
            if (patterns.some((p) => p.test(normalizedQuery))) {
                intent = patternIntent;
                break;
            }
        }

        // Extract time range
        let timeRange: 'today' | 'week' | 'month' | 'all' | undefined;
        if (/오늘|today/.test(normalizedQuery)) {
            timeRange = 'today';
        } else if (/이번\s*주|this\s*week/.test(normalizedQuery)) {
            timeRange = 'week';
        } else if (/이번\s*달|this\s*month/.test(normalizedQuery)) {
            timeRange = 'month';
        }

        return {
            intent,
            entities: {
                timeRange,
            },
            originalQuery: query,
        };
    }

    private addToHistory(message: ConversationMessage): void {
        this.conversationHistory.push(message);

        // Trim history if too long
        if (this.conversationHistory.length > this.maxHistoryLength) {
            this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
        }
    }

    private generateId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

// ========================================
// Data Provider Interface
// ========================================

export interface DataProvider {
    getTasks: (filters?: { projectId?: number; status?: string }) => Promise<Task[]>;
    getProjects: () => Promise<Project[]>;
    getRecentActivity: (limit?: number) => Promise<ActivityItem[]>;
}

// ========================================
// Singleton Export
// ========================================

export const aiAssistant = new AIAssistant();
export default aiAssistant;
