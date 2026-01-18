/**
 * AI Interview Service
 *
 * Conducts AI-powered interviews to refine and concretize user ideas.
 * Manages conversation flow, context gathering, and determines when
 * sufficient information has been collected.
 */

import { eventBus } from '../events/EventBus';
import {
    aiClient,
    MODEL_PERFORMANCE_SCORES,
    PROVIDER_DEFAULT_SCORES,
    type AIProviderType,
} from './AIClient';
import type { EnabledProviderInfo, AIProvider as CoreAIProvider } from '@core/types/ai';

// ========================================
// Types
// ========================================

export type AIProvider = CoreAIProvider;

export interface InterviewMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    metadata?: {
        questionType?: QuestionType;
        questionId?: string;
        extractedInfo?: Record<string, any>;
        attachments?: AttachmentInfo[];
        typing?: boolean;
        streaming?: boolean;
        options?: string[];
    };
}

export interface AttachmentInfo {
    id: string;
    name: string;
    type: 'document' | 'image' | 'code' | 'data';
    size: number;
    content?: string;
    summary?: string;
}

export type QuestionType =
    | 'clarification' // 명확화 질문
    | 'scope' // 범위 확인
    | 'technical' // 기술 스택 관련
    | 'constraint' // 제약 조건
    | 'priority' // 우선순위
    | 'timeline' // 일정
    | 'resource' // 리소스
    | 'integration' // 통합 요구사항
    | 'output' // 결과물 형태
    | 'validation' // 검증 질문
    | 'feature_suggestions'; // 유사 기능 제안 확인

// 프리셋 답변 타입 (AI 판단에 맡기기, 업계 표준 등)
export type PresetAnswerType = 'ai-decide' | 'skip' | 'best-practice' | 'minimal';

// 프리셋 답변 정보
export interface PresetAnswerInfo {
    questionType: QuestionType;
    presetType: PresetAnswerType;
    originalQuestion: string;
}

export interface InterviewContext {
    // 기본 정보
    originalIdea: string;
    domain?: string;
    projectType?: string;

    // 수집된 정보
    clarifiedRequirements: string[]; // 사용자가 직접 작성한 구체적 요구사항만
    technicalStack: string[];
    constraints: string[];
    priorities: { item: string; level: 'high' | 'medium' | 'low' }[];
    timeline?: { deadline?: string; milestones?: string[] };
    resources?: { budget?: string; team?: string };
    integrations: string[];
    outputFormats: string[];

    // 프리셋 답변 추적 (AI가 구체화 시 참고)
    presetAnswers: PresetAnswerInfo[]; // 프리셋으로 응답한 질문들
    delegatedDecisions: string[]; // AI에게 위임된 결정사항들

    // 첨부 자료
    attachments: AttachmentInfo[];

    // 메타데이터
    confidence: number; // 0-100, 정보 충분성
    coveredAreas: Set<QuestionType>;
    missingAreas: QuestionType[];

    // 아이디어 구체성 수준
    ideaSpecificityLevel: 'vague' | 'moderate' | 'specific';
}

export interface InterviewSession {
    id: string;
    aiProvider: AIProvider;
    originalProvider?: AIProvider; // 원래 선택된 provider (폴백 시 다를 수 있음)
    fallbackOccurred?: boolean; // 폴백 발생 여부
    context: InterviewContext;
    messages: InterviewMessage[];
    status: 'active' | 'completed' | 'paused';
    createdAt: Date;
    updatedAt: Date;
    askedQuestionIds?: Set<string>;
    featureSuggestionAsked?: boolean;
}

export interface InterviewQuestion {
    id: string;
    type: QuestionType;
    question: string;
    options?: string[]; // 선택지가 있는 경우
    followUp?: string; // 후속 질문 힌트
    priority: number; // 질문 우선순위
}

export interface ConcretizedIdea {
    title: string;
    summary: string;
    detailedRequirements: string[];
    technicalSpecification: {
        stack: string[];
        architecture?: string;
        integrations: string[];
    };
    constraints: string[];
    deliverables: string[];
    estimatedComplexity: 'simple' | 'moderate' | 'complex' | 'enterprise';
    suggestedTasks: SuggestedTask[];
}

// 태스크 결과물 형식 타입
export type TaskOutputFormat =
    | 'text' // 일반 텍스트
    | 'markdown' // 마크다운 문서
    | 'html' // HTML 코드
    | 'pdf' // PDF 문서 생성 지시
    | 'json' // JSON 데이터
    | 'yaml' // YAML 설정 파일
    | 'csv' // CSV 데이터
    | 'sql' // SQL 쿼리/스키마
    | 'shell' // 셸 스크립트
    | 'mermaid' // Mermaid 다이어그램
    | 'svg' // SVG 이미지
    | 'png' // 이미지 생성 지시
    | 'mp4' // 비디오 생성 지시
    | 'mp3' // 오디오 생성 지시
    | 'diff' // 코드 변경사항
    | 'log' // 로그 형식
    | 'code'; // 소스 코드 (언어별)

// MCP 도구 힌트 (태스크 실행 시 필요한 도구)
export interface MCPToolHint {
    server: string; // MCP 서버 이름 (예: 'filesystem', 'github', 'database')
    tools?: string[]; // 필요한 도구 목록 (예: ['read_file', 'write_file'])
    required: boolean; // 필수 여부
}

export interface SuggestedTask {
    title: string;
    description: string;
    category: string;
    estimatedMinutes: number;
    dependencies: string[];
    suggestedAIProvider: AIProvider;
    suggestedModel: string;
    complexity: 'low' | 'medium' | 'high';
    promptTemplate?: string;
    // 결과물 관련 필드
    outputFormats: TaskOutputFormat[]; // 예상 결과물 형식 (복수 가능)
    primaryOutputFormat: TaskOutputFormat; // 주요 결과물 형식
    outputDescription?: string; // 결과물에 대한 상세 설명
    // MCP 도구 관련 필드
    mcpTools?: MCPToolHint[]; // 필요한 MCP 도구 힌트
    // 코드 관련 필드 (outputFormat이 'code'인 경우)
    codeLanguage?: string; // 프로그래밍 언어 (예: 'typescript', 'python')
    codeContext?: {
        targetPath?: string; // 생성될 파일 경로
        relatedFiles?: string[]; // 관련 파일들
    };
    taskType?: 'output' | 'input' | 'script';
    autoExecute?: boolean;
}

/**
 * Detailed Task Plan (AI 실행 최적화)
 * 인터뷰 기반으로 생성되는 상세한 태스크 계획
 */
export interface DetailedTaskPlan {
    title: string;
    description: string;
    aiOptimizedPrompt: string; // AI 실행에 최적화된 프롬프트
    executionOrder: number; // 실행 순서 (1부터 시작)
    dependencies: number[]; // 의존 태스크 인덱스 (배열 내 위치)
    expectedOutputFormat: string; // 예상 결과 형식 (markdown, code, json 등)
    recommendedProviders: string[]; // 추천 AI Provider 목록 (우선순위 순)
    requiredMCPs: string[]; // 필요한 MCP 서버 목록
    estimatedMinutes: number; // 예상 소요 시간 (분)
    priority: 'low' | 'medium' | 'high' | 'urgent';
    tags: string[];
    // 기존 SuggestedTask와의 호환성
    category?: string;
    complexity?: 'low' | 'medium' | 'high';
    codeLanguage?: string; // code 형식일 때 언어
    taskType?: 'output' | 'input' | 'script';
    autoExecute?: boolean;
}

/**
 * Enhanced Execution Plan
 * 인터뷰 컨텍스트를 기반으로 생성된 전체 실행 계획
 */
export interface EnhancedExecutionPlan {
    projectTitle: string;
    projectSummary: string;
    projectGuidelines: string;
    architecture: string;
    tasks: DetailedTaskPlan[];
    totalEstimatedHours: number;
    suggestedMilestones: {
        name: string;
        taskIndices: number[]; // 마일스톤에 포함되는 태스크 인덱스
        estimatedCompletion: string; // 예상 완료 시점
    }[];
    // 원본 데이터 보존
    originalIdea: string;
    interviewAnswers: { question: string; answer: string }[];
}

// ========================================
// Interview Question Templates
// ========================================

const QUESTION_TEMPLATES: Record<QuestionType, InterviewQuestion[]> = {
    clarification: [
        {
            id: 'clarify_unique',
            type: 'clarification',
            question:
                '이 아이디어의 가장 독특하거나 혁신적인 부분은 무엇인가요? 기존 솔루션과 어떻게 다른가요?',
            priority: 1,
        },
        {
            id: 'clarify_goal',
            type: 'clarification',
            question:
                '이 프로젝트로 해결하고 싶은 가장 핵심적인 문제 한 가지를 구체적으로 설명해주세요.',
            priority: 2,
        },
        {
            id: 'clarify_scenario',
            type: 'clarification',
            question:
                '완성된 결과물이 실제로 사용되는 상황을 구체적으로 상상해서 설명해주세요. 누가, 언제, 어떻게 사용하나요?',
            priority: 3,
        },
        {
            id: 'clarify_success',
            type: 'clarification',
            question: '이 프로젝트가 성공했다고 말할 수 있는 구체적인 기준은 무엇인가요?',
            priority: 4,
        },
    ],
    scope: [
        {
            id: 'scope_core',
            type: 'scope',
            question:
                '가장 먼저 만들어야 하는 핵심 기능 3가지를 중요도 순으로 알려주세요. 각 기능이 왜 중요한지도 간단히 설명해주세요.',
            priority: 1,
        },
        {
            id: 'scope_detail',
            type: 'scope',
            question:
                '방금 말씀하신 핵심 기능 중 하나를 골라서, 그 기능이 어떻게 동작해야 하는지 상세히 설명해주세요.',
            priority: 2,
        },
        {
            id: 'scope_exclusion',
            type: 'scope',
            question: '절대 포함하지 않을 기능이나, 나중으로 미뤄도 되는 부분이 있나요?',
            priority: 3,
        },
    ],
    technical: [
        {
            id: 'tech_preference',
            type: 'technical',
            question: '특별히 사용하고 싶은 기술이나 도구가 있나요? 없다면 "없음"이라고 해주세요.',
            priority: 1,
        },
        {
            id: 'tech_existing',
            type: 'technical',
            question:
                '이미 사용 중인 시스템이나 연동해야 하는 외부 서비스가 있나요? 있다면 구체적으로 알려주세요.',
            priority: 2,
        },
        {
            id: 'tech_data',
            type: 'technical',
            question:
                '이 프로젝트에서 다루는 데이터는 무엇인가요? 데이터의 양이나 민감도도 알려주세요.',
            priority: 3,
        },
    ],
    constraint: [
        {
            id: 'constraint_budget',
            type: 'constraint',
            question: '예산 제한이 있나요? 대략적인 범위를 알려주세요.',
            priority: 2,
        },
        {
            id: 'constraint_security',
            type: 'constraint',
            question: '보안이나 규정 준수 요구사항이 있나요? (예: GDPR, 개인정보보호법)',
            priority: 1,
        },
        {
            id: 'constraint_performance',
            type: 'constraint',
            question: '성능 요구사항이 있나요? (예: 응답 시간, 동시 사용자 수)',
            priority: 2,
        },
    ],
    priority: [
        {
            id: 'priority_features',
            type: 'priority',
            question: '가장 중요한 기능 3가지를 우선순위대로 알려주세요.',
            priority: 1,
        },
        {
            id: 'priority_quality',
            type: 'priority',
            question: '품질, 속도, 비용 중 가장 중요한 것은 무엇인가요?',
            options: ['품질 우선', '속도 우선', '비용 효율'],
            priority: 2,
        },
    ],
    timeline: [
        {
            id: 'timeline_deadline',
            type: 'timeline',
            question: '완료 희망 일정이나 마감일이 있나요?',
            priority: 1,
        },
        {
            id: 'timeline_milestone',
            type: 'timeline',
            question: '중간에 확인하고 싶은 마일스톤이 있나요?',
            priority: 2,
        },
    ],
    resource: [
        {
            id: 'resource_team',
            type: 'resource',
            question: '프로젝트에 참여하는 인원이나 역할이 있나요?',
            priority: 2,
        },
        {
            id: 'resource_existing',
            type: 'resource',
            question: '활용 가능한 기존 코드, 디자인, 문서 등이 있나요?',
            priority: 1,
        },
    ],
    integration: [
        {
            id: 'integration_api',
            type: 'integration',
            question: '연동해야 하는 외부 API나 서비스가 있나요?',
            priority: 1,
        },
        {
            id: 'integration_data',
            type: 'integration',
            question: '가져오거나 내보내야 하는 데이터 형식이 있나요?',
            priority: 2,
        },
    ],
    output: [
        {
            id: 'output_format',
            type: 'output',
            question: '최종적으로 어떤 형태의 결과물을 원하시나요?',
            options: [
                '웹 애플리케이션',
                '모바일 앱',
                'API/백엔드',
                '문서/보고서',
                '디자인',
                '데이터 분석',
                '자동화 스크립트',
                '기타',
            ],
            priority: 1,
        },
        {
            id: 'output_example',
            type: 'output',
            question: '참고하고 싶은 기존 제품이나 서비스가 있나요? 어떤 점을 참고하고 싶으신가요?',
            priority: 2,
        },
        {
            id: 'output_ui',
            type: 'output',
            question:
                '사용자 화면이 필요하다면, 어떤 느낌이나 스타일을 원하시나요? (예: 심플, 화려함, 다크모드 등)',
            priority: 3,
        },
    ],
    validation: [
        {
            id: 'validation_demo',
            type: 'validation',
            question:
                '완성된 결과물을 확인할 때 가장 먼저 테스트해보고 싶은 시나리오는 무엇인가요?',
            priority: 1,
        },
        {
            id: 'validation_quality',
            type: 'validation',
            question: '품질 면에서 특히 신경 써야 할 부분이 있나요? (예: 속도, 정확도, 보안 등)',
            priority: 2,
        },
    ],
    feature_suggestions: [
        {
            id: 'feature_reference',
            type: 'feature_suggestions',
            question:
                '참고하고 싶은 제품이나 서비스가 있다면 알려주세요. 어떤 기능을 참고하고 싶으신가요?',
            priority: 1,
            options: ['특정 제품의 UX', '경쟁사 주요 기능', '대시보드 구성', '잘 모르겠어요'],
        },
        {
            id: 'feature_priority',
            type: 'feature_suggestions',
            question: '추가로 고려해볼 만한 기능(예: 알림, 협업, 자동화)이 있다면 무엇이 있을까요?',
            priority: 2,
        },
    ],
};

// ========================================
// AI Interview Service Class
// ========================================

// 연동된 Provider 설정 타입
export class AIInterviewService {
    private sessions: Map<string, InterviewSession> = new Map();
    private readonly CONFIDENCE_THRESHOLD = 75; // 충분성 판단 기준
    private enabledProviders: EnabledProviderInfo[] = []; // 연동된 Provider 목록
    private preferBestOverall = true; // 연동 여부 무관하게 최적 모델 제안
    private static readonly ALLOWED_PROVIDERS: AIProvider[] = [
        'anthropic',
        'openai',
        'google',
        'azure-openai',
        'groq',
        'mistral',
        'cohere',
        'deepseek',
        'together',
        'fireworks',
        'perplexity',
        'stability',
        'runway',
        'pika',
        'google-tts',
        'elevenlabs',
        'suno',
        'huggingface',
        'replicate',
        'openrouter',
        'ollama',
        'lmstudio',
        'zhipu',
        'moonshot',
        'qwen',
        'baidu',
        'claude-code',

        'codex',
        'local',
    ];
    private readonly allowedProviderSet: Set<AIProvider> = new Set(
        AIInterviewService.ALLOWED_PROVIDERS
    );

    /**
     * 연동된 Provider 목록 설정
     * settingsStore에서 연동된 Provider 목록을 받아 설정합니다.
     */
    setEnabledProviders(providers: EnabledProviderInfo[]): void {
        this.enabledProviders = providers;
        // shouldFetchModels parameter removed
        console.log(
            '[AIInterviewService] Enabled providers set:',
            providers.map((p) => p.id).join(', ')
        );
    }

    /**
     * 프로젝트 지침 생성 (AI 실행 컨텍스트 공유용)
     */
    private buildProjectGuidelines(context: InterviewContext): string {
        const parts: string[] = [];
        parts.push(`프로젝트 목적: ${context.originalIdea}`);
        if (context.clarifiedRequirements.length > 0) {
            parts.push(
                `핵심 요구사항:\n${context.clarifiedRequirements
                    .slice(0, 5)
                    .map((r) => `- ${r}`)
                    .join('\n')}`
            );
        }
        if (context.technicalStack.length > 0) {
            parts.push(`기술 스택: ${context.technicalStack.join(', ')}`);
        }
        if (context.constraints.length > 0) {
            parts.push(`제약사항: ${context.constraints.join(', ')}`);
        }
        if (context.priorities.length > 0) {
            parts.push(
                `우선순위:\n${context.priorities.map((p) => `- ${p.item} (${p.level})`).join('\n')}`
            );
        }
        return parts.join('\n');
    }

    /**
     * 연동된 Provider 목록 가져오기
     */
    getEnabledProviders(): EnabledProviderInfo[] {
        return this.enabledProviders;
    }

    /**
     * 연동 여부와 무관하게 최적 모델 제안을 우선할지 여부 설정
     */
    setPreferBestOverall(prefer: boolean): void {
        this.preferBestOverall = prefer;
    }

    private logPromptRequest(
        stage: string,
        provider: string | null | undefined,
        prompt: string,
        metadata?: Record<string, any>
    ): void {
        try {
            // Only log summary info, not full prompt body unless needed for deep debugging
            const summary = {
                provider: provider || 'auto',
                length: prompt.length,
                hasSystemPrompt: !!metadata?.systemPrompt,
            };

            // Use debug level for prompt details (filtered out by default in many consoles)
            console.debug(`[AIInterviewService][${stage}] Dispatching request`, summary);
        } catch (error) {
            // Ignore logging errors
        }
    }

    private isValidProviderId(value: string): value is AIProvider {
        return this.allowedProviderSet.has(value as AIProvider);
    }

    private sanitizeProviderList(list: unknown): AIProvider[] {
        if (!Array.isArray(list)) {
            return [];
        }
        const sanitized: AIProvider[] = [];
        for (const entry of list) {
            if (typeof entry !== 'string') continue;
            const id = entry.trim().toLowerCase();
            if (!id || !this.isValidProviderId(id)) continue;
            if (!sanitized.includes(id as AIProvider)) {
                sanitized.push(id as AIProvider);
            }
        }
        return sanitized;
    }

    private resolveRecommendedProviders(task: any): AIProvider[] {
        const sanitized = this.sanitizeProviderList(task?.recommendedProviders);
        if (sanitized.length > 0) {
            return sanitized;
        }
        return this.recommendAIProviders(task);
    }

    /**
     * 새 인터뷰 세션 시작
     */
    startSession(originalIdea: string, aiProvider: AIProvider): InterviewSession {
        const sessionId = `interview-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

        const context: InterviewContext = {
            originalIdea,
            clarifiedRequirements: [],
            technicalStack: [],
            constraints: [],
            priorities: [],
            integrations: [],
            outputFormats: [],
            presetAnswers: [],
            delegatedDecisions: [],
            attachments: [],
            confidence: 0,
            coveredAreas: new Set(),
            missingAreas: Object.keys(QUESTION_TEMPLATES) as QuestionType[],
            ideaSpecificityLevel: 'moderate', // 초기값, AI 분석 후 업데이트
        };

        const session: InterviewSession = {
            id: sessionId,
            aiProvider,
            originalProvider: aiProvider, // 원래 선택된 provider 저장
            fallbackOccurred: false,
            context,
            messages: [],
            status: 'active',
            createdAt: new Date(),
            updatedAt: new Date(),
            askedQuestionIds: new Set<string>(),
            featureSuggestionAsked: false,
        };

        // 초기 분석 메시지 추가 (동기 버전)
        const analysisMessage = this.analyzeInitialIdea(originalIdea);
        session.messages.push({
            id: `msg-${Date.now()}`,
            role: 'assistant',
            content: analysisMessage,
            timestamp: new Date(),
            metadata: { typing: true },
        });

        this.sessions.set(sessionId, session);

        // AI가 설정되어 있으면 비동기로 더 나은 분석 제공
        this.analyzeInitialIdeaWithAI(originalIdea, aiProvider)
            .then((result) => {
                if (result.content !== analysisMessage) {
                    // AI 분석이 다르면 업데이트
                    const initialMessage = session.messages[0];
                    if (initialMessage) {
                        initialMessage.content = result.content;
                        initialMessage.metadata = {
                            ...(initialMessage.metadata || {}),
                            typing: false,
                            streaming: false,
                        };
                        session.updatedAt = new Date();
                    }
                }

                // 폴백 발생 체크
                if (result.usedProvider && result.usedProvider !== aiProvider) {
                    session.aiProvider = result.usedProvider as AIProvider;
                    session.fallbackOccurred = true;

                    // 폴백 알림 메시지 추가
                    const fallbackMessage: InterviewMessage = {
                        id: `msg-${Date.now()}-fallback`,
                        role: 'system',
                        content: `⚠️ **AI 프로바이더 변경 알림**\n\n선택하신 **${this.getProviderDisplayName(aiProvider)}**에 연결할 수 없어 **${this.getProviderDisplayName(result.usedProvider)}**(으)로 전환하여 인터뷰를 진행합니다.`,
                        timestamp: new Date(),
                    };
                    session.messages.splice(1, 0, fallbackMessage);
                    session.updatedAt = new Date();

                    // 세션 업데이트 이벤트 발생 (UI에서 스크롤 등 처리)
                    eventBus.emit(
                        'interview.sessionUpdated' as any,
                        {
                            sessionId: session.id,
                            type: 'fallback',
                        },
                        'AIInterviewService'
                    );
                }
            })
            .catch(console.error);

        eventBus.emit(
            'system.notification' as any,
            {
                type: 'info',
                title: '인터뷰 시작',
                message: '아이디어 구체화를 위한 인터뷰가 시작되었습니다.',
            },
            'AIInterviewService'
        );

        return session;
    }

    /**
     * Provider 표시 이름 반환
     */
    private getProviderDisplayName(provider: string): string {
        const names: Record<string, string> = {
            anthropic: 'Anthropic Claude',
            openai: 'OpenAI GPT',
            google: 'Google Gemini',
            groq: 'Groq',
            mistral: 'Mistral AI',
            deepseek: 'DeepSeek',
            cohere: 'Cohere',
            together: 'Together AI',
            fireworks: 'Fireworks AI',
            perplexity: 'Perplexity',
            openrouter: 'OpenRouter',
            ollama: 'Ollama (로컬)',
            lmstudio: 'LM Studio (로컬)',
        };
        return names[provider] || provider;
    }

    /**
     * 초기 아이디어 분석
     */
    private analyzeInitialIdea(idea: string): string {
        // AI 분석이 완료되면 대체될 임시 로딩 메시지
        return `아이디어를 분석 중입니다...\n\n> "${idea.slice(0, 100)}${idea.length > 100 ? '...' : ''}"\n\n잠시만 기다려주세요.`;
    }

    /**
     * AI를 사용한 초기 아이디어 분석 (비동기)
     * preferredProvider를 우선적으로 시도하고, 실패하면 다른 provider로 폴백
     */
    private async analyzeInitialIdeaWithAI(
        idea: string,
        preferredProvider?: AIProvider
    ): Promise<{ content: string; usedProvider?: string }> {
        // AI가 설정되어 있지 않으면 기본 분석 사용
        if (!aiClient.getAvailableProvider()) {
            return { content: this.generateFallbackAnalysis(idea) };
        }

        try {
            const systemPrompt = `당신은 사용자의 아이디어에서 핵심 가치와 독창성을 발견하는 전문 컨설턴트입니다.

## 분석 목표
사용자의 아이디어를 그대로 이해하고, 구체화를 위한 핵심 질문을 해주세요.

## 응답 형식 (간결하게)
1. 아이디어 이해 확인 (1-2문장으로 요약)
2. 첫 번째 질문: 아이디어를 더 구체화하기 위한 핵심 질문 1개

## 중요 사항
- 정형화된 분석(도메인, 키워드 나열) 대신 아이디어 자체에 집중
- 사용자가 말한 내용을 바탕으로 자연스럽게 대화를 이어가세요
- 관련 문서나 참고 자료가 있으면 업로드해달라고 안내

한국어로 따뜻하고 전문적인 톤으로 작성하세요.`;

            const userPrompt = `다음 아이디어에 대해 이해한 내용을 확인하고, 구체화를 위한 첫 질문을 해주세요:\n\n"${idea}"`;
            const promptMetadata = {
                systemPrompt,
                temperature: 0.7,
                maxTokens: 600,
                preferredProvider,
            };
            this.logPromptRequest(
                'analyze-initial-idea',
                preferredProvider,
                userPrompt,
                promptMetadata
            );

            // preferredProvider를 우선 시도하도록 옵션 설정
            const response = await aiClient.completeWithInfo(userPrompt, {
                systemPrompt,
                temperature: 0.7,
                maxTokens: 600,
                preferredProvider: preferredProvider as any, // AIProviderType으로 변환
            });

            return {
                content: response.content,
                usedProvider: response.provider,
            };
        } catch (error) {
            console.error('AI 아이디어 분석 실패:', error);
            // 폴백: 아이디어 기반 분석 사용
            return { content: this.generateFallbackAnalysis(idea) };
        }
    }

    /**
     * AI 없이 아이디어 기반 폴백 분석 생성
     */
    private generateFallbackAnalysis(idea: string): string {
        // 아이디어에서 의미있는 첫 질문 생성
        const hasQuestion = idea.includes('?');
        const isShort = idea.length < 50;

        let response = `아이디어를 확인했습니다.\n\n`;
        response += `> "${idea}"\n\n`;

        if (isShort) {
            response += `흥미로운 아이디어네요! 조금 더 구체적으로 알고 싶습니다.\n\n`;
            response += `**첫 번째 질문:** 이 아이디어로 어떤 문제를 해결하고 싶으신가요? 또는 어떤 가치를 제공하고 싶으신가요?\n\n`;
        } else if (hasQuestion) {
            response += `질문을 포함한 아이디어를 주셨네요. 함께 구체화해 보겠습니다.\n\n`;
            response += `**첫 번째 질문:** 이 아이디어의 주요 사용자(타겟)는 누구인가요?\n\n`;
        } else {
            response += `상세한 설명 감사합니다! 아이디어를 더 구체화해 보겠습니다.\n\n`;
            response += `**첫 번째 질문:** 이 아이디어에서 가장 핵심적인 기능은 무엇인가요?\n\n`;
        }

        response += `관련 문서나 참고 자료가 있다면 업로드해주세요.`;

        return response;
    }

    /**
     * 도메인 감지
     */
    private detectDomain(text: string): string[] {
        const domains: string[] = [];
        const domainPatterns: Record<string, RegExp[]> = {
            '웹 개발': [/웹|web|사이트|site|프론트엔드|frontend|react|vue|angular/i],
            '모바일 앱': [/앱|app|모바일|mobile|ios|android|flutter|react native/i],
            '백엔드/API': [/api|서버|server|백엔드|backend|rest|graphql/i],
            '데이터/AI': [/데이터|data|분석|analytics|ai|ml|machine learning|머신러닝/i],
            자동화: [/자동화|automation|봇|bot|스크립트|script|크롤링|crawl/i],
            디자인: [/디자인|design|ui|ux|figma|스케치/i],
            '문서/콘텐츠': [/문서|document|콘텐츠|content|블로그|blog|글|writing/i],
            인프라: [/인프라|infra|devops|배포|deploy|docker|kubernetes|aws|클라우드/i],
        };

        for (const [domain, patterns] of Object.entries(domainPatterns)) {
            if (patterns.some((p) => p.test(text))) {
                domains.push(domain);
            }
        }

        return domains.length > 0 ? domains : ['일반'];
    }

    /**
     * 키워드 추출
     */
    private extractKeywords(text: string): string[] {
        const techKeywords = [
            'react',
            'vue',
            'angular',
            'node',
            'python',
            'java',
            'typescript',
            'api',
            'database',
            'sql',
            'nosql',
            'mongodb',
            'postgresql',
            'ai',
            'ml',
            'gpt',
            'claude',
            'openai',
            'anthropic',
            'docker',
            'kubernetes',
            'aws',
            'gcp',
            'azure',
            'authentication',
            '인증',
            'oauth',
            'jwt',
            'realtime',
            '실시간',
            'websocket',
            'payment',
            '결제',
            'stripe',
        ];

        const found: string[] = [];
        const lowerText = text.toLowerCase();

        for (const keyword of techKeywords) {
            if (lowerText.includes(keyword.toLowerCase())) {
                found.push(keyword);
            }
        }

        return found.slice(0, 10); // 최대 10개
    }

    /**
     * 다음 질문 생성 (AI 우선, 템플릿 폴백)
     */
    async getNextQuestionAsync(sessionId: string): Promise<InterviewQuestion | null> {
        const session = this.sessions.get(sessionId);
        if (!session || session.status !== 'active') return null;

        const { context } = session;

        // 1) AI 기반 동적 질문 생성 (가능한 경우 우선 시도)
        if (aiClient.getAvailableProvider()) {
            const aiQuestion = await this.generateNextQuestionWithAI(session);
            if (aiQuestion) {
                session.askedQuestionIds?.add(aiQuestion.id);
                return aiQuestion;
            }
        }

        // 2) 템플릿 기반 폴백
        for (const area of context.missingAreas) {
            const questions = QUESTION_TEMPLATES[area];
            const unasked = questions.find(
                (q) =>
                    !session.messages.some(
                        (m) => m.metadata?.questionType === q.type && m.content.includes(q.question)
                    )
            );

            if (unasked) {
                session.askedQuestionIds?.add(unasked.id);
                return unasked;
            }
        }

        return null;
    }

    /**
     * AI를 사용한 동적 후속 질문 생성
     */
    private async generateNextQuestionWithAI(
        session: InterviewSession
    ): Promise<InterviewQuestion | null> {
        try {
            const { context, messages } = session;
            const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
            const askedQuestions = messages
                .filter((m) => m.role === 'assistant' && m.metadata?.questionType)
                .map((m) => m.content);
            const askedQuestionIds = Array.from(session.askedQuestionIds || []);
            const targetType = context.missingAreas[0] || 'clarification';

            const prompt = `당신은 제품 아이디어를 구체화하는 시니어 PM 겸 인터뷰어입니다.
지금까지의 대화를 바탕으로, **비전문가도 편하게 답할 수 있는** 다음 질문을 작성하세요. 어려운 용어는 피하고 예시를 곁들여 주세요. 답변을 돕기 위해 번호가 붙은 선택지(3~4개)도 함께 제안하세요.

## 입력
- 원래 아이디어: ${context.originalIdea}
- 수집된 요구사항: ${context.clarifiedRequirements.slice(-5).join(' | ') || '없음'}
- 기술 스택: ${context.technicalStack.join(', ') || '미정'}
- 아직 커버되지 않은 영역: ${context.missingAreas.join(', ')}
- 마지막 사용자 답변: ${lastUserMsg?.content || '없음'}
- 이미 물어본 질문 수: ${askedQuestions.length}
- 이미 물어본 질문 ID: ${askedQuestionIds.join(', ')}
- 이번 질문의 목표 영역(type): ${targetType}

## 출력 형식 (JSON)
{
  "id": "ai-q-${Date.now()}",
  "type": "clarification|scope|technical|constraint|priority|timeline|output",
  "question": "한 문장 질문 (${targetType} 영역에 맞게)",
  "options": ["선택지1", "선택지2", "선택지3", "잘 모르겠어요"],
  "priority": 1
}

조건:
- type은 지정된 값 중 하나만 사용
- 질문은 구체적이고 실행 가능한 정보를 끌어낼 수 있어야 함 (이전 질문과 주제가 겹치지 않게)
- **옵션은 질문에 대한 직접적인 답변이어야 하며, 기능 목록이나 무관한 예시는 금지**
- 이미 물어본 질문과 중복되지 않도록 작성
- 한국어로 작성`;

            this.logPromptRequest('generate-next-question', session.aiProvider, prompt, {
                temperature: 0.4,
                maxTokens: 200,
            });
            const response = (await aiClient.complete(prompt, {
                temperature: 0.4,
                maxTokens: 200,
            })) as any;

            const text = typeof response === 'string' ? response : (response?.content as string);
            if (!text) return null;

            const match =
                text.match(/```json\n([\s\S]*?)```/) || text.match(/```\n([\s\S]*?)```/) || null;
            const jsonString = match?.[1] ?? text;
            const parsed = JSON.parse(jsonString);

            if (!parsed || !parsed.question || !parsed.type) return null;

            const options =
                Array.isArray(parsed.options) && parsed.options.length > 0
                    ? parsed.options
                    : ['네', '아니요', '잘 모르겠어요'];

            const question: InterviewQuestion = {
                id: parsed.id || `ai-q-${Date.now()}`,
                type: (parsed.type as QuestionType) || targetType,
                question: parsed.question,
                options,
                priority: parsed.priority || 1,
            };

            return question;
        } catch (error) {
            console.error(
                '[AIInterviewService] Failed to generate AI question, fallback to templates:',
                error
            );
            return null;
        }
    }

    /**
     * 사용자 응답 처리
     */
    async processResponse(
        sessionId: string,
        userMessage: string,
        questionType?: QuestionType
    ): Promise<InterviewMessage> {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error('Session not found');

        // 사용자 메시지 추가
        const userMsg: InterviewMessage = {
            id: `msg-${Date.now()}`,
            role: 'user',
            content: userMessage,
            timestamp: new Date(),
            metadata: { questionType },
        };
        session.messages.push(userMsg);

        // 컨텍스트 업데이트
        this.updateContext(session, userMessage, questionType);

        // 충분성 평가
        const confidence = this.evaluateConfidence(session.context);
        session.context.confidence = confidence;
        if (confidence >= this.CONFIDENCE_THRESHOLD && session.status !== 'completed') {
            session.status = 'completed';
        }

        // AI 응답 생성
        let responseContent: string;
        const nextQuestionForContext = await this.getNextQuestionAsync(sessionId);
        let nextQuestion: InterviewQuestion | null = null;

        // 간단한 아이디어는 인터뷰 스킵
        if (this.shouldFastComplete(session.context)) {
            const summary = this.generateSummary(session.context);
            const completionMsg: InterviewMessage = {
                id: `msg-${Date.now() + 1}`,
                role: 'assistant',
                content: `아이디어가 간결하여 추가 인터뷰 없이 진행해도 충분해 보입니다.\n\n${summary}`,
                timestamp: new Date(),
            };
            session.status = 'completed';
            session.messages.push(completionMsg);
            session.updatedAt = new Date();
            return completionMsg;
        }

        // 기능 제안 단계 (중복 방지)
        if (
            !session.featureSuggestionAsked &&
            confidence >= this.CONFIDENCE_THRESHOLD - 10 // 후반부에서 제안
        ) {
            const suggestionQuestion = await this.buildFeatureSuggestionQuestion(session);
            session.featureSuggestionAsked = true;

            const suggestionMsg: InterviewMessage = {
                id: `msg-${Date.now() + 1}`,
                role: 'assistant',
                content: this.formatQuestionWithOptions(suggestionQuestion),
                timestamp: new Date(),
                metadata: {
                    questionType: 'feature_suggestions',
                    questionId: suggestionQuestion.id,
                    options: suggestionQuestion.options,
                },
            };
            session.messages.push(suggestionMsg);
            session.updatedAt = new Date();
            session.askedQuestionIds?.add(suggestionQuestion.id);
            return suggestionMsg;
        }

        if (confidence >= this.CONFIDENCE_THRESHOLD) {
            // 충분한 정보 수집됨
            responseContent = await this.generateCompletionMessageWithAI(session, userMessage);
            session.status = 'completed';
        } else {
            // 추가 질문 필요
            nextQuestion = nextQuestionForContext;
            if (nextQuestion) {
                // AI가 설정되어 있으면 AI 응답 사용
                responseContent = await this.generateFollowUpResponseWithAI(
                    session,
                    nextQuestion,
                    userMessage
                );
            } else {
                responseContent =
                    '추가로 알려주실 내용이 있으시면 말씀해주세요. 없으시다면 "완료"라고 입력해주세요.';
            }
        }

        const assistantMsg: InterviewMessage = {
            id: `msg-${Date.now() + 1}`,
            role: 'assistant',
            content: responseContent,
            timestamp: new Date(),
            metadata: nextQuestion
                ? {
                      questionType: nextQuestion.type,
                      questionId: nextQuestion.id,
                      options: nextQuestion.options,
                  }
                : undefined,
        };
        if (nextQuestion) {
            session.askedQuestionIds?.add(nextQuestion.id);
        }
        session.messages.push(assistantMsg);
        session.updatedAt = new Date();

        return assistantMsg;
    }

    private async buildFeatureSuggestionQuestion(
        session: InterviewSession
    ): Promise<InterviewQuestion> {
        const baseTemplate = QUESTION_TEMPLATES.feature_suggestions[0] || {
            id: 'feature_suggestions_default',
            type: 'feature_suggestions' as QuestionType,
            question: '추가로 고려해볼 만한 기능이 있을까요?',
            priority: 1,
            options: ['알림 기능', '협업 기능', '자동화', '잘 모르겠어요'],
        };

        const recentHighlights = session.context.clarifiedRequirements.slice(-2).join(', ');
        const questionText = recentHighlights
            ? `${baseTemplate.question}\n\n최근 요구사항: ${recentHighlights}`
            : baseTemplate.question;

        return {
            ...baseTemplate,
            id: `${baseTemplate.id}-${Date.now()}`,
            type: baseTemplate.type || 'feature_suggestions',
            question: questionText,
            options: baseTemplate.options || ['네', '아니요', '잘 모르겠어요'],
        };
    }

    private formatQuestionWithOptions(question: InterviewQuestion): string {
        if (!question.options || question.options.length === 0) {
            return question.question;
        }

        const optionsText = question.options
            .map((option, idx) => `${idx + 1}. ${option}`)
            .join('\n');
        return `${question.question}\n\n${optionsText}`;
    }

    /**
     * 컨텍스트 업데이트 (프리셋 답변과 실질적 요구사항 구분)
     */
    private updateContext(
        session: InterviewSession,
        message: string,
        questionType?: QuestionType
    ): void {
        const { context } = session;

        // 질문 유형에 따른 정보 추출
        if (questionType) {
            context.coveredAreas.add(questionType);
            context.missingAreas = context.missingAreas.filter((a) => a !== questionType);

            // 유사 기능 제안 응답은 요구사항에 바로 반영
            if (questionType === 'feature_suggestions') {
                const choices = message
                    .split('\n')
                    .map((line) => line.trim().replace(/^\d+[).]\s*/, ''))
                    .filter((line) => line.length > 0);
                if (choices.length > 0) {
                    context.clarifiedRequirements.push(
                        ...choices.filter((c) => !context.clarifiedRequirements.includes(c))
                    );
                }
            }
        }

        // 프리셋 답변 감지
        const presetType = this.detectPresetAnswer(message);

        if (presetType !== null && questionType) {
            // 프리셋 답변은 별도로 추적 (요구사항에 저장하지 않음)
            const lastQuestion = this.getLastAskedQuestion(session);
            context.presetAnswers.push({
                questionType,
                presetType,
                originalQuestion: lastQuestion || '',
            });

            // AI 위임 결정사항으로 기록
            const delegationNote = this.generateDelegationNote(
                questionType,
                presetType,
                lastQuestion
            );
            if (delegationNote) {
                context.delegatedDecisions.push(delegationNote);
            }

            // 프리셋 답변은 요구사항에 저장하지 않고 바로 리턴
            return;
        }

        // 일반적인 정보 추출 (기술 스택 키워드)
        const techStack = this.extractKeywords(message);
        if (techStack.length > 0) {
            context.technicalStack.push(
                ...techStack.filter((t) => !context.technicalStack.includes(t))
            );
        }

        const detectedDomains = this.detectDomain(message);
        if (detectedDomains.length > 0 && !context.domain) {
            context.domain = detectedDomains[0];
        }

        // 제약 조건 추출
        if (message.includes('반드시') || message.includes('필수') || message.includes('제한')) {
            context.constraints.push(message);
        }

        // 실질적인 요구사항만 저장 (프리셋이나 모호한 답변 제외)
        if (this.isSubstantiveRequirement(message)) {
            context.clarifiedRequirements.push(message);
        }
    }

    /**
     * 마지막으로 물어본 질문 가져오기
     */
    private getLastAskedQuestion(session: InterviewSession): string {
        // assistant 메시지 중 마지막 질문 찾기
        for (let i = session.messages.length - 1; i >= 0; i--) {
            const msg = session.messages[i];
            if (!msg) {
                continue;
            }
            if (msg.role === 'assistant' && msg.content.includes('?')) {
                // 질문 부분만 추출
                const lines = msg.content.split('\n');
                for (const line of lines) {
                    if (line.includes('?')) {
                        return line.replace(/^\*\*|\*\*$/g, '').trim();
                    }
                }
            }
        }
        return '';
    }

    /**
     * AI 위임 결정사항 메모 생성
     */
    private generateDelegationNote(
        questionType: QuestionType,
        presetType: PresetAnswerType,
        question: string
    ): string {
        const questionTypeLabels: Record<QuestionType, string> = {
            clarification: '명확화',
            scope: '범위',
            technical: '기술',
            constraint: '제약',
            priority: '우선순위',
            timeline: '일정',
            resource: '리소스',
            integration: '연동',
            output: '결과물',
            validation: '검증',
            feature_suggestions: '기능 제안',
        };

        const presetLabels: Record<PresetAnswerType, string> = {
            'ai-decide': 'AI가 최적의 방법으로 결정',
            'best-practice': '업계 표준/베스트 프랙티스 적용',
            skip: '나중에 결정 (현재 미정)',
            minimal: '최소 기능으로 구현',
        };

        const area = questionTypeLabels[questionType] || questionType;
        const decision = presetLabels[presetType] || presetType;

        return `[${area}] ${decision}${question ? ` (질문: ${question.substring(0, 50)}...)` : ''}`;
    }

    /**
     * 충분성 평가
     */
    private evaluateConfidence(context: InterviewContext): number {
        const totalAreas = Object.keys(QUESTION_TEMPLATES).length;
        const coveredCount = totalAreas - context.missingAreas.length;

        // 기본 진행률: 영역 커버 비율 기반
        let score = Math.round((coveredCount / totalAreas) * 70); // 영역 모두 커버 시 70점

        // 추가 점수
        if (context.originalIdea.length > 50) score += 5;
        if (context.clarifiedRequirements.length >= 3) score += 10;
        if (context.technicalStack.length >= 2) score += 5;
        if (context.attachments.length > 0) score += 5;

        // 상한
        return Math.min(score, 100);
    }

    /**
     * 아이디어 규모가 작고 간단한 경우 인터뷰를 일찍 종료할지 판단
     */
    private shouldFastComplete(context: InterviewContext): boolean {
        const smallIdea =
            context.originalIdea.length < 120 &&
            context.clarifiedRequirements.length <= 2 &&
            context.technicalStack.length <= 1;
        const simpleConstraints = context.constraints.length === 0;
        return smallIdea && simpleConstraints;
    }

    /**
     * 후속 응답 생성
     */
    private generateFollowUpResponse(
        context: InterviewContext,
        nextQuestion: InterviewQuestion
    ): string {
        let response = '';

        // 이전 답변 인정
        if (context.clarifiedRequirements.length > 0) {
            response += '감사합니다. 이해했습니다.\n\n';
        }

        // 진행 상황
        response += `📊 **진행률:** ${context.confidence}%\n\n`;

        // 다음 질문
        response += `${nextQuestion.question}`;

        if (nextQuestion.options) {
            response += '\n\n**선택 가능한 옵션:**\n';
            nextQuestion.options.forEach((opt, i) => {
                response += `**${i + 1}번.** ${opt}\n`;
            });
            response += '\n_번호나 옵션 이름을 입력하시거나, 직접 답변을 작성해주세요._';
        }

        return response;
    }

    /**
     * AI를 사용한 후속 응답 생성
     */
    private async generateFollowUpResponseWithAI(
        session: InterviewSession,
        nextQuestion: InterviewQuestion,
        userMessage: string
    ): Promise<string> {
        const context = session.context;
        // AI가 설정되어 있지 않으면 기본 응답 사용
        if (!aiClient.getAvailableProvider()) {
            return this.generateFollowUpResponse(context, nextQuestion);
        }

        try {
            const formattedQuestion = this.formatQuestionWithOptions(nextQuestion);

            // 지금까지 수집된 핵심 정보 요약
            const collectedInfoSummary =
                context.clarifiedRequirements.length > 0
                    ? `지금까지 파악된 핵심 내용:\n${context.clarifiedRequirements
                          .slice(-3)
                          .map((r) => `• ${r.substring(0, 100)}`)
                          .join('\n')}`
                    : '아직 구체적인 정보가 수집되지 않았습니다.';

            // 사용자 답변의 충실도 판단 (간단한 휴리스틱)
            const isVagueAnswer = this.isVagueOrUnclearAnswer(userMessage);

            const systemPrompt = `당신은 사용자의 아이디어를 비즈니스와 기술적 관점에서 깊이 있게 분석하고 구체화하는 등급의 **프로덕트 매니저(PM)**이자 **서비스 기획 전문가**입니다.

## 핵심 목표
단순히 질문을 던지는 것이 아니라, 사용자가 미처 생각하지 못한 비즈니스적 가치, 사용자 경험(UX), 시스템 안정성 등을 고려하여 아이디어를 "완성도 높은 기획안"으로 발전시켜야 합니다.
사용자의 아이디어, 독창성, 차별점을 존중하면서도 전문적인 시각에서 날카로운 질문을 통해 구체적인 요구사항을 도출하세요.

## 현재 인터뷰 상황
- 원래 아이디어: "${context.originalIdea}"
- 진행률: ${context.confidence}%
- ${collectedInfoSummary}

## 사용자의 방금 답변
"${userMessage}"

## 다음 질문 정보
- 질문 유형: ${nextQuestion.type}
- 기본 질문: ${nextQuestion.question}
- 선택지: ${
                nextQuestion.options && nextQuestion.options.length > 0
                    ? nextQuestion.options.map((opt, idx) => `${idx + 1}번. ${opt}`).join(' | ')
                    : '없음'
            }

## 응답 가이드라인
1. **전문적인 피드백 (Bridging)**:
   - 사용자의 답변을 기계적으로 "네 알겠습니다"라고 하지 마세요.
   - "아, 그렇게 되면 ~한 장점이 있겠군요.", "~기능을 고려하시는 건 사용성 측면에서 훌륭한 선택입니다." 처럼 전문가로서의 통찰력이 담긴 피드백을 먼저 1~2문장 주세요.
   - 답변이 모호하다면, 기획자로서 구체적인 예시를 들어 가이드해주세요.

2. **진행률 표시**: 📊 **진행률:** XX% 형식

3. **자연스러운 대화 흐름**:
   - 질문을 던질 때도 "다음 질문입니다" 보다는 답변 내용과 연결하여 "그렇다면 이 부분은 어떻게 생각하시나요?" 형태로 자연스럽게 이어주세요.
   - 필요하다면 질문의 의도를 설명하여(예: "이 결정이 나중에 DB 구조에 영향을 주기 때문에...") 사용자가 더 정확한 판단을 내리도록 도우세요.

4. 질문과 선택지는 별도로 제공되므로 **다시 작성하지 마세요.**
5. 마지막 문장은 "아래 선택지를 참고하시거나, 자유롭게 말씀해 주세요." 형태로 편안하게 마무리하세요.

${
    isVagueAnswer
        ? `
## 🔔 중요: 사용자 답변이 모호하거나 불명확합니다!
사용자가 "모르겠어요", "그냥요", "아무거나요" 등 모호한 답변을 했습니다.
숙련된 기획자로서 사용자가 선택하기 쉽도록 **업계 표준(Best Practice)**이나 **유사 서비스의 사례**를 들어 구체적으로 제안해야 합니다.

가이드:
1. 사용자의 아이디어("${context.originalIdea}")와 유사한 성공적인 서비스들의 기능을 분석하여 3-5개 추천
2. 각 기능이 왜 필요한지 기획자 관점에서 설명 (예: "사용자 이탈을 막기 위해...", "초기 마케팅을 위해...")
3. "이 중에서 우리 서비스의 핵심 가치에 부합하는 것이 있나요?" 형태로 질문

예시 형식:
"비슷한 ${context.domain || '서비스'}에서는 보통 다음 기능들을 핵심적으로 가져갑니다:
• **소셜 로그인**: 진입 장벽을 낮추기 위해 필수적입니다.
• **실시간 알림**: 사용자 리텐션(재방문)을 높이는 데 효과적입니다.
• **데이터 시각화**: 복잡한 정보를 한눈에 보여주어 만족도를 높입니다.

이 중에서 초기 버전에 꼭 넣고 싶은 기능이 있으신가요?"
`
        : ''
}

한국어로 정중하면서도 신뢰감을 주는 '유능한 파트너'의 톤앤매너로 응답하세요.`;

            const prompt =
                '사용자의 최근 답변을 분석하고, 다음 질문으로 자연스럽게 이어지는 안내 메시지를 작성해주세요.';
            this.logPromptRequest('follow-up-response', session.aiProvider, prompt, {
                systemPrompt,
                temperature: 0.7,
                maxTokens: 800,
            });

            const response = await aiClient.complete(prompt, {
                systemPrompt,
                temperature: 0.7,
                maxTokens: 800,
            });

            const aiText =
                typeof response === 'string'
                    ? response
                    : typeof (response as any)?.content === 'string'
                      ? (response as any).content
                      : '';

            const bridge = aiText?.trim() || '다음 질문으로 이어가 볼게요.';
            return `${bridge}\n\n${formattedQuestion}`;
        } catch (error) {
            console.error('AI 후속 응답 생성 실패:', error);
            return this.generateFollowUpResponse(context, nextQuestion);
        }
    }

    /**
     * 사용자 답변이 모호하거나 불명확한지 판단
     */
    private isVagueOrUnclearAnswer(message: string): boolean {
        const normalizedMessage = message.trim().toLowerCase();

        // 너무 짧은 답변
        if (normalizedMessage.length < 10) {
            return true;
        }

        // 모호한 표현 패턴
        const vaguePatterns = [
            /^(모르겠|잘 모르|모름|몰라)/,
            /^(아무거나|아무렇게나|상관없|괜찮|그냥)/,
            /^(네|예|응|ㅇㅇ|ㅇ|ok|okay)$/i,
            /^(글쎄|음|흠|어|아)/,
            /(알아서|맡길게|맡겨요|결정해|정해줘)/,
            /(뭐든|아무|상관없어|whatever)/i,
            /^(패스|스킵|skip|pass)$/i,
            /(잘 모르겠|생각 안|떠오르지 않|없는 것 같)/,
            /^(딱히|특별히).*(없|모르)/,
        ];

        for (const pattern of vaguePatterns) {
            if (pattern.test(normalizedMessage)) {
                return true;
            }
        }

        // 실질적인 내용이 부족한 답변 (명사나 동사가 거의 없는 경우)
        const meaningfulWords = normalizedMessage.split(/\s+/).filter((word) => word.length > 2);
        if (meaningfulWords.length < 2) {
            return true;
        }

        return false;
    }

    /**
     * 프리셋 답변인지 감지하고 타입 반환
     */
    private detectPresetAnswer(message: string): PresetAnswerType | null {
        const normalizedMessage = message.trim().toLowerCase();

        // AI 판단에 맡기기 패턴
        const aiDecidePatterns = [
            /ai.*판단|ai.*맡기|ai.*결정|ai.*선택/i,
            /전문.*판단.*맡기|판단.*맡기/,
            /알아서.*진행|알아서.*결정|알아서.*해/,
            /ai가.*최선|ai에게.*위임/i,
        ];

        // 업계 표준 / 베스트 프랙티스 패턴
        const bestPracticePatterns = [
            /업계.*표준|표준.*방법|표준.*방식/,
            /베스트.*프랙티스|best.*practice/i,
            /일반적.*방법|일반적.*방식|보편적/,
            /권장.*방식|권장.*방법|추천.*방식/,
        ];

        // 스킵/패스 패턴
        const skipPatterns = [
            /^(패스|스킵|skip|pass|다음|넘어가)$/i,
            /나중에.*결정|나중에.*정|미정/,
            /아직.*모르|아직.*결정/,
        ];

        // 최소한으로 패턴
        const minimalPatterns = [
            /최소.*기능|최소한|mvp|기본.*기능만/i,
            /심플.*하게|간단.*하게|단순.*하게/,
        ];

        for (const pattern of aiDecidePatterns) {
            if (pattern.test(normalizedMessage)) return 'ai-decide';
        }

        for (const pattern of bestPracticePatterns) {
            if (pattern.test(normalizedMessage)) return 'best-practice';
        }

        for (const pattern of skipPatterns) {
            if (pattern.test(normalizedMessage)) return 'skip';
        }

        for (const pattern of minimalPatterns) {
            if (pattern.test(normalizedMessage)) return 'minimal';
        }

        return null;
    }

    /**
     * 메시지가 실질적인 요구사항인지 판단
     */
    private isSubstantiveRequirement(message: string): boolean {
        // 프리셋 답변이면 실질적 요구사항 아님
        if (this.detectPresetAnswer(message) !== null) {
            return false;
        }

        // 모호한 답변이면 실질적 요구사항 아님
        if (this.isVagueOrUnclearAnswer(message)) {
            return false;
        }

        // 최소 길이 (의미있는 내용이 있어야 함)
        if (message.trim().length < 15) {
            return false;
        }

        // 실질적인 동사나 명사가 있어야 함
        const hasActionableContent =
            /[을를이가은는로으로에서]|하다|만들|구현|개발|설계|사용|필요|원하|포함/.test(message);

        return hasActionableContent || message.length > 50;
    }

    /**
     * AI를 사용한 완료 메시지 생성
     */
    private async generateCompletionMessageWithAI(
        session: InterviewSession,
        lastUserMessage: string
    ): Promise<string> {
        const context = session.context;
        // AI가 설정되어 있지 않으면 기본 메시지 사용
        if (!aiClient.getAvailableProvider()) {
            return this.generateCompletionMessage(context);
        }

        try {
            // 인터뷰 대화 요약
            const conversationSummary =
                context.clarifiedRequirements.join('\n- ') || '(수집된 요구사항 없음)';

            const systemPrompt = `당신은 아이디어 인터뷰를 마무리하는 전문 컨설턴트입니다.

## 상황
사용자와의 아이디어 인터뷰가 완료되었습니다. 마지막 답변에 대한 반응과 함께 인터뷰를 마무리해주세요.

## 수집된 정보
- 원래 아이디어: "${context.originalIdea}"
- 수집된 요구사항:
  - ${conversationSummary}
- 기술 스택: ${context.technicalStack.join(', ') || '미정'}
- 첨부 자료: ${context.attachments.length}개

## 응답 형식
1. **마지막 답변에 대한 반응** (1-2문장): 사용자의 마지막 답변을 인정/반영
2. **✅ 인터뷰 완료** 헤더
3. **핵심 요약** (3-5개 bullet point): 수집된 정보 중 가장 중요한 포인트
4. **다음 단계 안내**: 아이디어 구체화 진행 안내

## 중요 사항
- 정형화된 "요구사항: N개" 형식 대신 실제 내용을 요약
- 사용자의 아이디어와 답변 내용을 구체적으로 반영
- 따뜻하고 긍정적인 톤 유지

한국어로 작성하세요.`;

            const prompt = `사용자의 마지막 답변: "${lastUserMessage}"\n\n인터뷰를 마무리하고 수집된 정보를 요약해주세요.`;
            this.logPromptRequest('interview-completion-message', session.aiProvider, prompt, {
                systemPrompt,
                temperature: 0.7,
                maxTokens: 600,
            });

            const response = await aiClient.complete(prompt, {
                systemPrompt,
                temperature: 0.7,
                maxTokens: 600,
            });

            return response;
        } catch (error) {
            console.error('AI 완료 메시지 생성 실패:', error);
            return this.generateCompletionMessage(context);
        }
    }

    /**
     * 완료 메시지 생성 (폴백용)
     */
    private generateCompletionMessage(context: InterviewContext): string {
        let response = '✅ **인터뷰 완료**\n\n';

        // 마지막 요구사항이 있으면 반영
        if (context.clarifiedRequirements.length > 0) {
            const lastReq = context.clarifiedRequirements[context.clarifiedRequirements.length - 1];
            response += `좋습니다! "${lastReq?.slice(0, 50)}${(lastReq?.length || 0) > 50 ? '...' : ''}" - 잘 이해했습니다.\n\n`;
        }

        response += '충분한 정보가 수집되었습니다. 아이디어 구체화를 진행합니다.\n\n';
        response += '**핵심 요약:**\n';

        // 실제 요구사항 내용 표시 (최대 5개)
        const reqs = context.clarifiedRequirements.slice(0, 5);
        if (reqs.length > 0) {
            reqs.forEach((req, _i) => {
                response += `- ${req.slice(0, 80)}${req.length > 80 ? '...' : ''}\n`;
            });
        } else {
            response += `- 원래 아이디어: ${context.originalIdea.slice(0, 80)}${context.originalIdea.length > 80 ? '...' : ''}\n`;
        }

        if (context.technicalStack.length > 0) {
            response += `- 기술 스택: ${context.technicalStack.join(', ')}\n`;
        }

        if (context.attachments.length > 0) {
            response += `- 참고 자료: ${context.attachments.map((a) => a.name).join(', ')}\n`;
        }

        return response;
    }

    /**
     * 문서 첨부 처리
     */
    async attachDocument(
        sessionId: string,
        file: { name: string; type: string; content: string; size: number }
    ): Promise<AttachmentInfo> {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error('Session not found');

        const attachment: AttachmentInfo = {
            id: `att-${Date.now()}`,
            name: file.name,
            type: this.detectFileType(file.type, file.name),
            size: file.size,
            content: file.content,
            summary: await this.summarizeDocument(file.content, file.type),
        };

        session.context.attachments.push(attachment);

        // 문서 내용 분석하여 컨텍스트 업데이트
        this.analyzeAttachment(session, attachment);

        session.messages.push({
            id: `msg-${Date.now()}`,
            role: 'system',
            content: `📎 문서 첨부됨: ${file.name}\n요약: ${attachment.summary}`,
            timestamp: new Date(),
            metadata: { attachments: [attachment] },
        });

        return attachment;
    }

    /**
     * 파일 타입 감지
     */
    private detectFileType(mimeType: string, fileName: string): AttachmentInfo['type'] {
        if (mimeType.includes('image')) return 'image';
        if (fileName.match(/\.(js|ts|py|java|cpp|c|go|rs|rb)$/i)) return 'code';
        if (fileName.match(/\.(csv|json|xml|xlsx?)$/i)) return 'data';
        return 'document';
    }

    /**
     * 문서 요약
     */
    private async summarizeDocument(content: string, type: string): Promise<string> {
        // AI가 설정되어 있지 않으면 기본 요약 사용
        if (!aiClient.getAvailableProvider()) {
            const lines = content.split('\n').filter((l) => l.trim());
            const preview = lines.slice(0, 5).join(' ').substring(0, 200);
            return `${preview}...`;
        }

        try {
            const systemPrompt = `당신은 문서 분석 전문가입니다.
첨부된 문서의 핵심 내용을 간결하게 요약하세요.
- 프로젝트 요구사항, 기술 스택, 제약사항 등 중요 정보를 추출하세요
- 200자 이내로 요약하세요
- 한국어로 작성하세요`;

            // 문서가 너무 길면 앞부분만 분석
            const truncatedContent =
                content.length > 4000 ? content.substring(0, 4000) + '...' : content;

            const prompt = `다음 ${type} 문서를 요약해주세요:\n\n${truncatedContent}`;
            this.logPromptRequest('document-summary', null, prompt, {
                systemPrompt,
                temperature: 0.3,
                maxTokens: 300,
            });

            const response = await aiClient.complete(prompt, {
                systemPrompt,
                temperature: 0.3,
                maxTokens: 300,
            });

            return response;
        } catch (error) {
            console.error('AI 문서 요약 실패:', error);
            // 폴백: 기본 요약
            const lines = content.split('\n').filter((l) => l.trim());
            const preview = lines.slice(0, 5).join(' ').substring(0, 200);
            return `${preview}...`;
        }
    }

    /**
     * 첨부 파일 분석
     */
    private analyzeAttachment(session: InterviewSession, attachment: AttachmentInfo): void {
        const { context } = session;

        if (attachment.content) {
            // 기술 스택 추출
            const tech = this.extractKeywords(attachment.content);
            context.technicalStack.push(...tech.filter((t) => !context.technicalStack.includes(t)));

            // 충분성 점수 증가
            context.confidence = Math.min(context.confidence + 10, 100);
        }
    }

    /**
     * 아이디어 구체화 실행
     */
    async concretizeIdea(sessionId: string): Promise<ConcretizedIdea> {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error('Session not found');

        const { context } = session;

        // AI가 설정되어 있으면 AI로 구체화
        if (aiClient.getAvailableProvider()) {
            try {
                return await this.concretizeIdeaWithAI(context);
            } catch (error) {
                console.error('AI 아이디어 구체화 실패, 기본 로직 사용:', error);
            }
        }

        // 구체화된 아이디어 생성 (기본 로직)
        const concretized: ConcretizedIdea = {
            title: this.generateTitle(context),
            summary: this.generateSummary(context),
            detailedRequirements: context.clarifiedRequirements,
            technicalSpecification: {
                stack: context.technicalStack,
                architecture: this.suggestArchitecture(context),
                integrations: context.integrations,
            },
            constraints: context.constraints,
            deliverables: context.outputFormats,
            estimatedComplexity: this.estimateComplexity(context),
            suggestedTasks: this.generateSuggestedTasks(context),
        };

        eventBus.emit(
            'system.notification' as any,
            {
                type: 'success',
                title: '아이디어 구체화 완료',
                message: `${concretized.suggestedTasks.length}개의 태스크가 생성되었습니다.`,
            },
            'AIInterviewService'
        );

        return concretized;
    }

    /**
     * AI를 사용한 아이디어 구체화
     */
    private async concretizeIdeaWithAI(context: InterviewContext): Promise<ConcretizedIdea> {
        // 사용 가능한 Provider 목록
        const availableProvidersInfo = this.enabledProviders
            .map((p) => `- ${p.name} (ID: ${p.id})${p.baseUrl ? ' [Local/Custom]' : ''}`)
            .join('\n');

        const systemPrompt = `당신은 HighFlow 앱 생태계에 정통한 **고도로 숙련된 수석 개발자**이자 **AI 아키텍트**입니다.
사용자의 아이디어를 실제 동작하는 소프트웨어로 만들기 위해, HighFlow 앱의 모든 기능과 리소스를 100% 활용하는 완벽한 실행 계획을 설계해야 합니다.

## HighFlow 핵심 기능 및 설계 지침 (이 기능들을 적극 활용하세요)
1. **Task Types (태스크 유형)**:
   - **Output Task**: 일반적인 AI 작업 (코드 생성, 문서 작성 등 기본).
   - **Input Task**: 사용자로부터 텍스트 입력을 받아야 할 때 사용 (예: "사용자 API 키 입력", "특정 의사결정 입력").
   - **Script Task**: 로컬 환경에서 쉘 스크립트 실행이 필요할 때 사용 (예: "패키지 설치", "DB 마이그레이션", "서버 실행").
   
2. **Auto Execution (자동 실행)**:
   - \`autoExecute: true\`로 설정하면, 태스크가 준비되는 즉시(의존성 해결 시) 자동으로 실행됩니다.
   - 명확한 스크립트 실행이나, 사용자 개입이 필요 없는 AI 작업은 적극적으로 자동 실행을 켜주세요.

3. **Dependencies (의존성)**:
   - 태스크 간의 순서를 \`dependencies\` 배열로 명확히 지정하여 워크플로우를 만드세요.
   - 예: "환경 설정" -> "코드 생성" -> "테스트"

4. **MCP (Model Context Protocol) Tools**:
   - 파일 시스템 접근(\`filesystem\`), 깃허브 연동(\`github\`), 웹 검색(\`search\`), 브라우저 제어(\`browser\`) 등 MCP 도구를 적극 활용하세요.
   - 파일 생성/수정은 반드시 \`filesystem\` MCP가 필요합니다.

5. **Local Agents & Providers**:
   - 로컬 에이전트(Claude Code, Codex 등)가 연결되어 있다면, 보안이 중요하거나 로컬 컨텍스트가 많이 필요한 작업에 적극 배정하세요.
   - **현재 사용 가능한 AI Providers** (아래 목록에 있는 것만 우선적으로 사용하세요):
${availableProvidersInfo || '(사용 가능한 정보 없음 - 일반적인 모델 추천)'}
   - 목록에 없는 Provider는 꼭 필요한 경우가 아니면 배정하지 마세요.

6. **Project Goals & Guidelines**:
   - 프로젝트 전반에 적용될 '골(Goal)'과 '지침(Guidelines)'을 명확히 설정하여 AI가 일관된 방향으로 작업하도록 하세요.

## 작업 목표
사용자의 아이디어는 아직 "원석"입니다. 당신은 이를 다듬어 "보석" 같은 실행 계획으로 만들어야 합니다.
- 사용자의 답변을 그대로 태스크로 옮기지 마세요. 개발자 관점에서 **실제 구현에 필요한 하위 작업(로그인, DB설계, API구현, UI개발, 배포설정 등)으로 변환**하세요.
- 프로젝트 규모에 맞게 충분한 수의 태스크(최소 10개 이상 권장)로 세분화하세요.

## 태스크 생성 가이드라인
- **구체성**: 태스크 제목은 "기능 구현"이 아닌 "JWT 기반 인증 미들웨어 구현"처럼 구체적이어야 합니다.
- **실행 가능성**: 각 태스크는 AI가 한 번에 처리할 수 있는 단위(30~60분)여야 합니다. 너무 크면 쪼개세요.
- **HighFlow 기능 활용**:
  - 패키지 설치는 **Script Task**로 생성하고 스크립트 내용을 미리 적어주세요.
  - 사용자 설정이 필요한 값(API Key 등)은 **Input Task**로 만드세요.
  - 단순 코드 생성은 **Output Task (Auto-Exec)**로 설정하여 속도를 높이세요.

## 결과물 형식 가이드
각 태스크는 반드시 결과물 형식(outputFormats)을 지정해야 합니다. 사용 가능한 형식:
- text, markdown, html, pdf
- json, yaml, csv, sql
- shell (스크립트 실행용)
- mermaid, svg, png, mp4, mp3
- diff, log
- code (codeLanguage 필수로 지정)

## MCP 도구 가이드
태스크 실행에 필요한 MCP 도구를 mcpTools에 지정합니다:
- filesystem: 파일 읽기/쓰기 작업
- github: GitHub 저장소 작업
- database: 데이터베이스 쿼리 실행
- browser: 웹 브라우저 자동화
- search: 웹 검색

응답은 반드시 다음 JSON 형식으로 반환하세요:
{
  "title": "프로젝트의 핵심을 담은 제목",
  "summary": "프로젝트의 핵심 가치와 목표를 설명 (사용자 아이디어의 독창성 강조)",
  "detailedRequirements": ["사용자가 언급한 구체적 요구사항"],
  "technicalSpecification": {
    "stack": ["사용자가 선호/언급한 기술 또는 추천 기술"],
    "architecture": "프로젝트에 맞는 아키텍처 설명",
    "integrations": ["필요한 외부 서비스나 API"]
  },
  "constraints": ["사용자가 언급한 제약사항"],
  "deliverables": ["구체적인 산출물"],
  "estimatedComplexity": "simple|moderate|complex|enterprise",
  "suggestedTasks": [
    {
      "title": "구체적인 기능명을 포함한 태스크 제목",
      "description": "구현 세부사항, 사용할 기술, 예상 결과물을 포함한 상세 설명",
      "category": "core|feature|integration|infrastructure|enhancement|documentation|analysis|design",
      "taskType": "output|input|script",
      "autoExecute": boolean,
      "dependencies": ["의존하는 태스크 제목들"],
      "estimatedMinutes": 시간,
      "complexity": "low|medium|high",
      "outputFormats": ["code", "markdown"],
      "primaryOutputFormat": "code",
      "outputDescription": "이 태스크가 완료되면 생성될 결과물에 대한 상세 설명",
      "codeLanguage": "typescript",
      "mcpTools": [
            {"server": "filesystem", "tools": ["read_file", "write_file"], "required": true}
      ],
      "promptTemplate": "이 태스크를 AI에게 요청할 때 사용할 상세 프롬프트 (결과물 형식 지시 포함)"
    }
  ]
}

## 중요 지침

### 1. promptTemplate 작성 규칙 (매우 중요! - 실행 품질 결정)
promptTemplate은 AI가 이 태스크를 실행할 때 사용하는 프롬프트입니다. 고품질 결과물을 위해 다음을 반드시 포함하세요:

**필수 포함 요소:**
- **명확한 목표**: "무엇을 만들어야 하는지" 구체적으로 명시
- **HighFlow 기능 활용**: Script 실행, Input 요청 등 기능에 맞는 지시
- **기술적 요구사항**: 사용할 기술, 라이브러리, 패턴 명시
- **상세 스펙**: 기능의 세부 동작, 입출력 형식, 에러 처리 방식
- **컨텍스트 정보/파일 위치**: 생성할 파일 경로, 참고할 기존 파일

**좋은 promptTemplate 예시:**
\`\`\`
Vue 3 Composition API를 사용하여 \`src/components/board/TaskCard.vue\`를 구현하세요.

## 요구사항
- 태스크 제목, 설명, 상태, 우선순위를 표시
- 드래그 앤 드롭을 위한 draggable 속성 지원
- 상태별 색상 배지 적용
- 클릭 시 상세 모달 이벤트 emit

## 기술 스택
- Vue 3 + TypeScript
- Tailwind CSS

## 결과물
TypeScript 코드로 작성하고, 파일 시스템을 통해 저장하세요.
\`\`\`

**나쁜 promptTemplate 예시 (이렇게 작성하지 마세요):**
- "태스크 카드 컴포넌트를 만들어주세요" (너무 추상적)
- "구현해주세요" (아무 정보 없음)

### 2. outputFormats 선택 기준
- 코드 작성: ["code"] + codeLanguage 지정
- 문서 작성: ["markdown"] 또는 ["html"]
- 데이터 처리: ["json"], ["csv"], ["sql"] 등
- 설계/분석: ["mermaid", "markdown"] (다이어그램 + 설명)
- 이미지 생성: ["png"] 또는 ["svg"]
- 스크립트 작성: ["shell"]

### 3. mcpTools 필수 여부
- 파일 생성/수정 필요: filesystem (required: true)
- GitHub 작업 필요: github (required: true)
- 웹 정보 필요: search 또는 browser`;

        // 인터뷰 컨텍스트를 상세하게 정리
        const prioritiesText =
            context.priorities.length > 0
                ? context.priorities.map((p) => `- [${p.level.toUpperCase()}] ${p.item}`).join('\n')
                : '명시되지 않음';

        const timelineText = context.timeline
            ? `마감: ${context.timeline.deadline || '미정'}, 마일스톤: ${context.timeline.milestones?.join(', ') || '없음'}`
            : '미정';

        const attachmentsText =
            context.attachments.length > 0
                ? context.attachments
                      .map((a) => `- ${a.name}: ${a.summary || '요약 없음'}`)
                      .join('\n')
                : '없음';

        // 위임된 결정사항 정리 (AI가 구체화해야 할 부분)
        const delegatedDecisionsText =
            context.delegatedDecisions.length > 0
                ? context.delegatedDecisions.map((d, _i) => `${_i + 1}. ${d}`).join('\n')
                : '없음';

        // 프리셋 답변 요약 (AI에게 힌트 제공)
        const presetSummary =
            context.presetAnswers.length > 0
                ? context.presetAnswers
                      .map((p) => {
                          const presetLabels: Record<string, string> = {
                              'ai-decide': '→ AI가 최적의 방법 선택',
                              'best-practice': '→ 업계 표준/베스트 프랙티스 적용',
                              skip: '→ 나중에 결정 (현재는 일반적인 방식)',
                              minimal: '→ 최소 기능으로 구현 (MVP)',
                          };
                          return `- ${p.questionType}: ${presetLabels[p.presetType] || p.presetType}`;
                      })
                      .join('\n')
                : '없음';

        const prompt = `## 사용자 원본 아이디어
"${context.originalIdea}"

## 인터뷰에서 수집된 상세 정보

### 구체화된 요구사항 (사용자가 직접 설명한 구체적 내용)
${
    context.clarifiedRequirements.length > 0
        ? context.clarifiedRequirements.map((r, i) => `${i + 1}. ${r}`).join('\n')
        : '(사용자가 구체적인 요구사항을 제시하지 않음 - 아이디어 기반으로 AI가 도출해야 함)'
}

### ⚠️ AI가 결정해야 할 사항 (중요!)
사용자가 다음 항목들에 대해 "AI 판단에 맡기기", "업계 표준으로" 등의 답변을 했습니다.
**이 항목들에 대해서는 AI가 아이디어에 가장 적합한 구체적인 결정을 내려주세요:**
${delegatedDecisionsText}

### 사용자가 위임한 결정 유형 요약
${presetSummary}

### 우선순위
${prioritiesText}

### 기술 스택 (사용자 선호 또는 언급)
${context.technicalStack.length > 0 ? context.technicalStack.join(', ') : '특별히 언급 없음 - 아이디어에 적합한 기술 추천 필요'}

### 제약 조건
${context.constraints.length > 0 ? context.constraints.join('\n') : '없음'}

### 필요한 외부 연동
${context.integrations.length > 0 ? context.integrations.join(', ') : '없음'}

### 결과물 형태
${context.outputFormats.length > 0 ? context.outputFormats.join(', ') : '미정'}

### 일정
${timelineText}

### 첨부된 참고 자료
${attachmentsText}

## 요청사항
위 정보를 바탕으로 사용자의 아이디어를 **구체화**하고, 핵심 기능을 구현하기 위한 태스크 목록을 생성해주세요.

### 핵심 지침:
1. **태스크 제목과 설명은 실제 구현 내용으로**: "업계 표준으로 진행", "AI 판단에 맡김" 같은 문구가 태스크 제목/설명에 들어가면 안 됩니다.
2. **AI가 위임받은 결정사항 구체화**: 사용자가 AI에게 맡긴 부분은 아이디어에 맞는 구체적인 기술/방법으로 결정하세요.
3. **아이디어 특성 반영**: 일반적인 개발 템플릿이 아닌, 이 아이디어만의 고유한 기능을 중심으로 태스크 구성
4. **promptTemplate 상세화**: 각 태스크가 실제로 실행될 때 AI가 사용할 구체적인 프롬프트 작성`;

        this.logPromptRequest('concretize-idea', null, prompt, {
            systemPrompt,
            temperature: 0.5,
            maxTokens: 8000,
        });
        const response = await aiClient.complete(prompt, {
            systemPrompt,
            temperature: 0.5,
            maxTokens: 8000, // 15개 이상의 태스크와 상세 promptTemplate 생성을 위해 증가
        });

        try {
            const jsonString = this.extractJsonPayload(response);
            if (jsonString) {
                const parsed = JSON.parse(jsonString);

                // 필수 필드 검증 및 기본값 설정
                const concretized: ConcretizedIdea = {
                    title: parsed.title || this.generateTitle(context),
                    summary: parsed.summary || this.generateSummary(context),
                    detailedRequirements:
                        parsed.detailedRequirements || context.clarifiedRequirements,
                    technicalSpecification: {
                        stack: parsed.technicalSpecification?.stack || context.technicalStack,
                        architecture:
                            parsed.technicalSpecification?.architecture ||
                            this.suggestArchitecture(context),
                        integrations:
                            parsed.technicalSpecification?.integrations || context.integrations,
                    },
                    constraints: parsed.constraints || context.constraints,
                    deliverables: parsed.deliverables || context.outputFormats,
                    estimatedComplexity:
                        parsed.estimatedComplexity || this.estimateComplexity(context),
                    suggestedTasks: (parsed.suggestedTasks || []).map((task: any) => {
                        // 결과물 형식 기본값 결정
                        const defaultOutputFormat = this.inferOutputFormat(task);
                        const outputFormats = task.outputFormats || [defaultOutputFormat];
                        const primaryOutputFormat = task.primaryOutputFormat || defaultOutputFormat;

                        const recommendedProviders = this.resolveRecommendedProviders(task);
                        const suggestedProvider =
                            recommendedProviders[0] ||
                            this.selectBestProvider(task.description || task.title || '');

                        return {
                            title: task.title || '',
                            description: task.description || '',
                            category: task.category || 'feature',
                            estimatedMinutes: task.estimatedMinutes || 60,
                            dependencies: task.dependencies || [],
                            suggestedAIProvider: suggestedProvider,
                            suggestedModel: this.selectBestModel(task.description || task.title),
                            complexity: task.complexity || 'medium',
                            // 결과물 관련 필드
                            outputFormats,
                            primaryOutputFormat,
                            outputDescription:
                                task.outputDescription ||
                                this.generateOutputDescription(task, primaryOutputFormat),
                            // MCP 도구
                            mcpTools:
                                task.mcpTools || this.inferMCPTools(task, primaryOutputFormat),
                            // 코드 관련
                            codeLanguage:
                                task.codeLanguage ||
                                (primaryOutputFormat === 'code'
                                    ? this.inferCodeLanguage(task, context)
                                    : undefined),
                            codeContext: task.codeContext,
                            taskType: task.taskType,
                            autoExecute: task.autoExecute,
                            // 프롬프트 (결과물 형식 포함)
                            promptTemplate:
                                task.promptTemplate ||
                                this.generateTaskPromptWithOutput(
                                    task,
                                    context,
                                    primaryOutputFormat,
                                    outputFormats
                                ),
                        };
                    }),
                };

                // 태스크가 없으면 기본 태스크 생성
                if (concretized.suggestedTasks.length === 0) {
                    concretized.suggestedTasks = this.generateSuggestedTasks(context);
                }

                // 구체화된 아이디어 저장 (프로젝트 생성 시 사용 - session 객체 없음, context는 참조로 전달됨)
                if (concretized.suggestedTasks && concretized.suggestedTasks.length > 0) {
                    (context as any).completedData = concretized;
                }

                eventBus.emit(
                    'system.notification' as any,
                    {
                        type: 'success',
                        title: 'AI 아이디어 구체화 완료',
                        message: `${concretized.suggestedTasks.length}개의 태스크가 생성되었습니다.`,
                    },
                    'AIInterviewService'
                );

                return concretized;
            } else {
                throw new Error('AI response did not contain a JSON payload');
            }
        } catch (parseError) {
            console.error('AI 응답 파싱 실패:', parseError);
        }

        // 파싱 실패시 기본 로직 사용
        return {
            title: this.generateTitle(context),
            summary: this.generateSummary(context),
            detailedRequirements: context.clarifiedRequirements,
            technicalSpecification: {
                stack: context.technicalStack,
                architecture: this.suggestArchitecture(context),
                integrations: context.integrations,
            },
            constraints: context.constraints,
            deliverables: context.outputFormats,
            estimatedComplexity: this.estimateComplexity(context),
            suggestedTasks: this.generateSuggestedTasks(context),
        };
    }

    /**
     * 태스크 결과물 형식 추론
     */
    private inferOutputFormat(task: any): TaskOutputFormat {
        const title = (task.title || '').toLowerCase();
        const desc = (task.description || '').toLowerCase();
        const combined = `${title} ${desc}`;

        // 코드 관련
        if (/구현|개발|코딩|함수|클래스|컴포넌트|api|엔드포인트|모듈/i.test(combined)) {
            return 'code';
        }
        // 문서 관련
        if (/문서|readme|가이드|매뉴얼|설명서/i.test(combined)) {
            return 'markdown';
        }
        // 다이어그램 관련
        if (/다이어그램|플로우|시퀀스|erd|아키텍처.*설계|구조.*설계/i.test(combined)) {
            return 'mermaid';
        }
        // 데이터 관련
        if (/json|api.*응답|데이터.*구조|스키마/i.test(combined)) {
            return 'json';
        }
        if (/yaml|설정|config|docker/i.test(combined)) {
            return 'yaml';
        }
        if (/sql|데이터베이스|쿼리|테이블/i.test(combined)) {
            return 'sql';
        }
        if (/csv|엑셀|스프레드시트|데이터.*내보내기/i.test(combined)) {
            return 'csv';
        }
        // 스크립트 관련
        if (/스크립트|배포|자동화|bash|shell/i.test(combined)) {
            return 'shell';
        }
        // 이미지 관련
        if (/이미지|아이콘|로고|그래픽|일러스트/i.test(combined)) {
            return 'png';
        }
        if (/svg|벡터/i.test(combined)) {
            return 'svg';
        }
        // HTML
        if (/html|웹.*페이지|이메일.*템플릿/i.test(combined)) {
            return 'html';
        }
        // 분석/리포트
        if (/분석|리포트|보고서/i.test(combined)) {
            return 'markdown';
        }

        return 'text'; // 기본값
    }

    /**
     * Extract JSON payload from AI responses that may include markdown headers.
     */
    private extractJsonPayload(content: string | null | undefined): string | null {
        if (!content) {
            return null;
        }
        const trimmed = content.trim();
        const fencedJson = trimmed.match(/```json\s*([\s\S]*?)```/i);
        if (fencedJson?.[1]) {
            return fencedJson[1].trim();
        }
        const fencedBlock = trimmed.match(/```\s*([\s\S]*?)```/);
        if (fencedBlock?.[1]) {
            const candidate = fencedBlock[1].trim();
            if (candidate.startsWith('{')) {
                return candidate;
            }
        }
        const firstBrace = trimmed.indexOf('{');
        const lastBrace = trimmed.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
            return trimmed.slice(firstBrace, lastBrace + 1).trim();
        }
        return null;
    }

    /**
     * 결과물 설명 생성
     */
    private generateOutputDescription(task: any, format: TaskOutputFormat): string {
        const formatDescriptions: Record<TaskOutputFormat, string> = {
            text: '텍스트 형식의 결과물',
            markdown: '마크다운 형식의 문서',
            html: 'HTML 코드',
            pdf: 'PDF 문서 생성을 위한 콘텐츠',
            json: 'JSON 형식의 데이터',
            yaml: 'YAML 설정 파일',
            csv: 'CSV 형식의 데이터',
            sql: 'SQL 쿼리 또는 스키마',
            shell: '셸 스크립트',
            mermaid: 'Mermaid 다이어그램 코드',
            svg: 'SVG 이미지 코드',
            png: '이미지 파일 생성 지시',
            mp4: '비디오 생성 지시',
            mp3: '오디오 생성 지시',
            diff: '코드 변경사항 (diff 형식)',
            log: '로그 형식 출력',
            code: '실행 가능한 소스 코드',
        };

        return `${task.title}의 결과물: ${formatDescriptions[format]}`;
    }

    /**
     * MCP 도구 추론
     */
    private inferMCPTools(task: any, format: TaskOutputFormat): MCPToolHint[] {
        const tools: MCPToolHint[] = [];
        const combined = `${task.title} ${task.description}`.toLowerCase();

        // 파일 작업이 필요한 경우
        if (format === 'code' || /파일|저장|생성|수정/i.test(combined)) {
            tools.push({
                server: 'filesystem',
                tools: ['read_file', 'write_file', 'list_directory'],
                required: true,
            });
        }

        // GitHub 작업이 필요한 경우
        if (/github|레포|커밋|pr|pull.*request/i.test(combined)) {
            tools.push({
                server: 'github',
                tools: ['create_repository', 'create_pull_request', 'push_files'],
                required: false,
            });
        }

        // 데이터베이스 작업이 필요한 경우
        if (format === 'sql' || /데이터베이스|db|쿼리/i.test(combined)) {
            tools.push({
                server: 'database',
                tools: ['query', 'execute'],
                required: false,
            });
        }

        // 웹 검색이 필요한 경우
        if (/검색|조사|리서치|최신/i.test(combined)) {
            tools.push({
                server: 'search',
                tools: ['web_search'],
                required: false,
            });
        }

        // 브라우저 자동화가 필요한 경우
        if (/브라우저|스크래핑|크롤링|웹.*자동화/i.test(combined)) {
            tools.push({
                server: 'browser',
                tools: ['navigate', 'screenshot', 'click'],
                required: false,
            });
        }

        return tools;
    }

    /**
     * 코드 언어 추론
     */
    private inferCodeLanguage(task: any, context: InterviewContext): string {
        const combined =
            `${task.title} ${task.description} ${context.technicalStack.join(' ')}`.toLowerCase();

        if (/typescript|ts|vue|react|angular/i.test(combined)) return 'typescript';
        if (/javascript|js|node/i.test(combined)) return 'javascript';
        if (/python|py|django|flask|fastapi/i.test(combined)) return 'python';
        if (/java(?!script)|spring|kotlin/i.test(combined)) return 'java';
        if (/go(?:lang)?/i.test(combined)) return 'go';
        if (/rust/i.test(combined)) return 'rust';
        if (/c\+\+|cpp/i.test(combined)) return 'cpp';
        if (/c#|csharp|\.net/i.test(combined)) return 'csharp';
        if (/ruby|rails/i.test(combined)) return 'ruby';
        if (/php|laravel/i.test(combined)) return 'php';
        if (/swift|ios/i.test(combined)) return 'swift';
        if (/sql/i.test(combined)) return 'sql';
        if (/bash|shell|sh/i.test(combined)) return 'bash';

        // 기본값: TypeScript
        return 'typescript';
    }

    /**
     * 결과물 형식을 포함한 태스크 프롬프트 생성
     */
    private generateTaskPromptWithOutput(
        task: any,
        context: InterviewContext,
        primaryFormat: TaskOutputFormat,
        outputFormats: TaskOutputFormat[],
        projectGuidelines?: string
    ): string {
        const codeLanguage = task.codeLanguage || 'typescript';
        const techStack =
            context.technicalStack.length > 0
                ? context.technicalStack.join(', ')
                : '적절한 기술 선택';
        const guidelinesSection = projectGuidelines
            ? `## 프로젝트 지침\n${projectGuidelines}\n\n`
            : '';

        // 결과물 형식별 지시사항
        const formatInstructions = this.getFormatInstructions(primaryFormat, task);

        // 관련 요구사항 필터링 (태스크와 관련된 요구사항만 포함)
        const relevantRequirements = context.clarifiedRequirements.filter((req) => {
            const taskText = `${task.title} ${task.description}`.toLowerCase();
            const reqLower = req.toLowerCase();
            // 키워드 매칭으로 관련성 체크
            return reqLower.split(/\s+/).some((word) => word.length > 2 && taskText.includes(word));
        });

        const requirementsSection =
            relevantRequirements.length > 0
                ? `## 관련 프로젝트 요구사항\n${relevantRequirements.map((r) => `- ${r}`).join('\n')}`
                : '';

        const persona = this.deriveTaskPersona(task, primaryFormat);
        const stepBlueprint = this.formatStepBlueprint(
            this.buildStepBlueprint(task, primaryFormat)
        );
        const artifactSection = this.buildArtifactSection(task, primaryFormat, outputFormats);
        const toolSection =
            (task.mcpTools?.length ?? 0) > 0
                ? `## 사용 가능한 MCP/도구\n${task.mcpTools
                      .map(
                          (t: any) =>
                              `- ${t.server}: ${Array.isArray(t.tools) ? t.tools.join(', ') : t.tools}${
                                  t.required ? ' (필수)' : ''
                              }`
                      )
                      .join('\n')}\n\n`
                : '';
        const goalBullets = this.extractStructuredBullets(task.description)
            .map((line) => `- ${line}`)
            .join('\n');
        const constraints =
            context.constraints.length > 0 ? context.constraints.join(', ') : '없음';

        return `# ${task.title}

당신은 **${persona}** 역할의 시니어 전문가입니다. 아래 맥락을 정확히 반영하여 태스크를 완료하세요.

${guidelinesSection}## 프로젝트 컨텍스트
- **프로젝트 목적**: ${context.originalIdea}
- **태스크 범위**: ${task.description}
- **산출물 설명**: ${task.outputDescription || '태스크 완료 시 생성될 구체 결과물을 명시하세요.'}
- **기술 스택**: ${techStack}
- **제약사항**: ${constraints}
${requirementsSection ? `\n${requirementsSection}\n` : ''}

## 구현 목표
${goalBullets || `- ${task.description}`}

## 단계별 실행 계획
${stepBlueprint}

${artifactSection}

${toolSection}## 결과물 형식 지침
- **주 형식**: ${primaryFormat}
${outputFormats.length > 1 ? `- **추가 형식**: ${outputFormats.filter((f) => f !== primaryFormat).join(', ')}` : ''}
- **언어/플랫폼**: ${codeLanguage}
${formatInstructions}

## 품질 및 검증 기준
1. 단계별 로그 또는 결정 사항을 요약하고 핵심 근거를 남길 것
2. 코드/문서는 재사용 가능하고 테스트 가능한 구조로 작성할 것
3. 린트/타입 오류가 없도록 확인하고, 주요 경계 조건 테스트나 시나리오를 제시할 것
4. 최종 응답에는 **산출물 요약, 테스트/검증 방법, 차기 작업 제안** 섹션을 포함할 것

### 제출 시 포함해야 할 내용
1. 생성된 아티팩트 전체 코드/문서
2. \`단계별 진행 로그\` (각 단계별 핵심 결정/이슈/결과 요약)
3. \`검증 결과\` (수동 테스트 또는 설명)

위 지침을 따라 즉시 사용 가능한 수준의 결과물을 제공합니다.`.trim();
    }

    /**
     * 결과물 형식별 상세 지시사항
     */
    private getFormatInstructions(format: TaskOutputFormat, task: any): string {
        const codeLanguage = task.codeLanguage || 'typescript';

        const instructions: Record<TaskOutputFormat, string> = {
            code: `
- \`\`\`${codeLanguage} 코드블록으로 소스 코드를 작성해주세요.
- 코드에 적절한 주석을 포함해주세요.
- 타입 정의가 필요한 경우 포함해주세요.
- 에러 처리를 포함해주세요.`,
            markdown: `
- 마크다운 형식으로 문서를 작성해주세요.
- 적절한 제목(#, ##)과 목록을 사용해주세요.
- 코드 예시가 필요한 경우 코드블록을 사용해주세요.`,
            html: `
- 유효한 HTML5 코드를 작성해주세요.
- 스타일이 필요한 경우 <style> 태그 또는 인라인 스타일을 사용해주세요.
- 시맨틱 태그를 적절히 사용해주세요.`,
            json: `
- 유효한 JSON 형식으로 작성해주세요.
- 가독성을 위해 적절히 들여쓰기해주세요.
- 필요한 경우 스키마 설명을 주석으로 추가해주세요.`,
            yaml: `
- 유효한 YAML 형식으로 작성해주세요.
- 적절한 주석(#)을 포함해주세요.
- 들여쓰기는 2칸을 사용해주세요.`,
            csv: `
- CSV 형식으로 데이터를 작성해주세요.
- 첫 번째 행은 헤더로 사용해주세요.
- 쉼표가 포함된 값은 따옴표로 감싸주세요.`,
            sql: `
- 표준 SQL 문법을 사용해주세요.
- 테이블명과 컬럼명에 적절한 명명 규칙을 적용해주세요.
- 필요한 경우 인덱스와 제약조건을 포함해주세요.`,
            shell: `
- Bash 스크립트 형식으로 작성해주세요.
- 스크립트 시작에 #!/bin/bash를 포함해주세요.
- 각 명령어에 주석으로 설명을 추가해주세요.
- 에러 처리를 포함해주세요.`,
            mermaid: `
- Mermaid 다이어그램 문법으로 작성해주세요.
- \`\`\`mermaid 코드블록을 사용해주세요.
- 다이어그램 유형(flowchart, sequenceDiagram, classDiagram 등)을 명시해주세요.`,
            svg: `
- 유효한 SVG 코드를 작성해주세요.
- viewBox 속성을 포함해주세요.
- 가독성을 위해 적절히 들여쓰기해주세요.`,
            png: `
- 이미지 생성에 필요한 상세 프롬프트를 제공해주세요.
- 이미지의 스타일, 색상, 구도 등을 명시해주세요.`,
            mp4: `
- 비디오 생성에 필요한 상세 스크립트를 제공해주세요.
- 장면별 설명, 전환 효과, 오디오 지시사항을 포함해주세요.`,
            mp3: `
- 오디오 생성에 필요한 상세 지시사항을 제공해주세요.
- TTS의 경우 읽을 텍스트와 톤/속도를 명시해주세요.
- 음악의 경우 장르, 분위기, BPM 등을 명시해주세요.`,
            diff: `
- Git diff 형식으로 변경사항을 표시해주세요.
- 파일 경로를 포함해주세요.
- 변경 이유를 주석으로 설명해주세요.`,
            log: `
- 로그 형식으로 출력해주세요.
- 타임스탬프, 로그 레벨, 메시지를 포함해주세요.`,
            text: `
- 일반 텍스트 형식으로 작성해주세요.
- 구조화가 필요한 경우 적절히 구분해주세요.`,
            pdf: `
- PDF로 변환하기 적합한 구조화된 콘텐츠를 제공해주세요.
- 제목, 본문, 표 등의 구조를 명확히 해주세요.`,
            // 기본 fallback
        };

        return instructions[format] || instructions.text;
    }

    private deriveTaskPersona(task: any, format: TaskOutputFormat): string {
        const categoryPersonaMap: Record<string, string> = {
            core: '풀스택 아키텍트',
            feature: '제품 중심 프론트엔드/백엔드 엔지니어',
            integration: '플랫폼 통합 엔지니어',
            infrastructure: 'DevOps/인프라 엔지니어',
            enhancement: '리팩토링 전문가',
            documentation: '테크니컬 라이터',
            analysis: '시니어 비즈니스 애널리스트',
            design: '프로덕트 디자이너',
            research: '리서처',
        };
        const fallback =
            format === 'code' ? '시니어 소프트웨어 엔지니어' : '전문 컨텐츠 크리에이터';
        return categoryPersonaMap[task.category] || fallback;
    }

    private extractStructuredBullets(text: string): string[] {
        if (!text) return [];
        const lines = text
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean);
        const bulletLines = lines.filter((line) => /^[-*•\d.]/.test(line));
        if (bulletLines.length > 0) {
            return bulletLines.map((line) => line.replace(/^[-*•\d.\s]+/, '').trim());
        }
        const sentences = text.split(/[\n.]+/).map((s) => s.trim());
        return sentences.filter((s) => s.length > 0);
    }

    private formatStepBlueprint(steps: { title: string; details: string }[]): string {
        if (!steps.length) return '- 세부 단계 정보를 파악하여 순차적으로 진행하세요.';
        return steps
            .map((step, index) => `${index + 1}단계 — ${step.title}\n${step.details.trim()}`)
            .join('\n\n');
    }

    private buildStepBlueprint(
        task: any,
        format: TaskOutputFormat
    ): {
        title: string;
        details: string;
    }[] {
        return this.buildDefaultStepBlueprint(task, format);
    }

    private buildDefaultStepBlueprint(
        _task: any,
        format: TaskOutputFormat
    ): { title: string; details: string }[] {
        const isCode = format === 'code';
        return [
            {
                title: '요구사항 정제 및 설계',
                details:
                    '- 프로젝트 컨텍스트와 관련 요구사항을 재정리하고 누락된 전제 조건을 추론하세요.\n' +
                    '- 필요한 의존성, 폴더 구조, 데이터 흐름을 결정하고 설계 결정을 요약하세요.',
            },
            {
                title: isCode ? '핵심 로직/컴포넌트 구현' : '핵심 콘텐츠 작성',
                details: isCode
                    ? '- 모듈화/재사용성을 고려하여 코드를 작성하고, 예외/경계 케이스를 처리하세요.\n- 필요 시 mock 데이터나 helper를 정의하고, 각 함수/컴포넌트에 책임을 명확히 하세요.'
                    : '- 요구된 문서/콘텐츠를 구조화하여 작성하고, 독자가 바로 활용할 수 있도록 구체적인 지침·예시를 포함하세요.',
            },
            {
                title: '검증 및 품질 보증',
                details:
                    '- 최소 한 개 이상의 수동 또는 자동 테스트 시나리오를 실행/기술하세요.\n' +
                    '- 린트/타입 체크 혹은 리뷰 관점의 셀프 체크리스트를 통해 품질을 보증하세요.',
            },
            {
                title: '출력 정리 및 인도',
                details:
                    '- 산출물 파일/코드/문서를 구조화하여 제시하고, 중요한 의사결정과 TODO를 요약하세요.\n' +
                    '- 추후 작업자나 사용자에게 필요한 실행/설치/확장 가이드를 포함하세요.',
            },
        ];
    }

    private buildArtifactSection(
        task: any,
        primaryFormat: TaskOutputFormat,
        outputFormats: TaskOutputFormat[]
    ): string {
        const artifactCandidates = this.extractArtifactCandidates(
            `${task.description || ''}\n${task.outputDescription || ''}`
        );
        const lines: string[] = [];
        lines.push('## 산출물 및 파일 구조');
        lines.push(
            `- **주 산출물 형식**: ${primaryFormat}${
                outputFormats.length > 1
                    ? ` (추가: ${outputFormats.filter((f) => f !== primaryFormat).join(', ')})`
                    : ''
            }`
        );
        if (task.outputDescription) {
            lines.push(`- **산출물 설명**: ${task.outputDescription}`);
        }
        if (artifactCandidates.length) {
            lines.push('- **우선 생성/갱신할 아티팩트**:');
            artifactCandidates.forEach((artifact) => lines.push(`  - ${artifact}`));
        } else {
            lines.push(
                '- **우선 생성/갱신할 아티팩트**: 요구사항을 분석해 파일/모듈 단위로 명시하세요.'
            );
        }
        lines.push(
            '- 필요 시 파일별 역할, 주요 함수, 노출 API를 정리하고 제출 시 파일 트리를 함께 제공하세요.'
        );
        return `${lines.join('\n')}\n`;
    }

    private extractArtifactCandidates(text: string): string[] {
        if (!text) return [];
        const candidates = new Set<string>();
        const fileRegex = /[\w-/]+(?:\.[a-z0-9]+)+/gi;
        let match: RegExpExecArray | null;
        while ((match = fileRegex.exec(text))) {
            const value = match[0]
                .replace(/^[./]+/, '')
                .replace(/[`"'']/g, '')
                .trim();
            if (value) {
                candidates.add(value);
            }
        }
        return Array.from(candidates).slice(0, 10);
    }

    /**
     * 제목 생성
     */
    private generateTitle(context: InterviewContext): string {
        const idea = context.originalIdea;
        // 첫 문장 또는 50자 제한
        const title = (idea.split(/[.!?]/)[0] || '').trim();
        return title.length > 50 ? title.substring(0, 47) + '...' : title;
    }

    /**
     * 요약 생성
     */
    private generateSummary(context: InterviewContext): string {
        let summary = context.originalIdea;

        if (context.clarifiedRequirements.length > 0) {
            summary += '\n\n주요 요구사항:\n';
            summary += context.clarifiedRequirements
                .slice(0, 5)
                .map((r) => `- ${r}`)
                .join('\n');
        }

        return summary;
    }

    /**
     * 아키텍처 제안
     */
    private suggestArchitecture(_context: InterviewContext): string {
        return 'Microservices Architecture';
    }

    /**
     * 복잡도 추정
     */
    private estimateComplexity(context: InterviewContext): ConcretizedIdea['estimatedComplexity'] {
        const factors = {
            requirements: context.clarifiedRequirements.length,
            integrations: context.integrations.length,
            techStack: context.technicalStack.length,
            constraints: context.constraints.length,
        };

        const score =
            factors.requirements * 2 +
            factors.integrations * 3 +
            factors.techStack +
            factors.constraints * 2;

        if (score >= 20) return 'enterprise';
        if (score >= 12) return 'complex';
        if (score >= 6) return 'moderate';
        return 'simple';
    }

    /**
     * 태스크 제안 생성 (기본값 - AI 응답 실패 시 폴백용)
     */
    private generateSuggestedTasks(context: InterviewContext): SuggestedTask[] {
        const tasks: SuggestedTask[] = [];
        const { technicalStack, clarifiedRequirements } = context;

        // 코드 언어 기본값 추론
        const defaultCodeLang = this.inferCodeLanguage({ title: '', description: '' }, context);

        // 기본 태스크: 아키텍처 설계
        tasks.push({
            title: '프로젝트 아키텍처 설계',
            description: '프로젝트의 전체 구조와 아키텍처를 설계하고 다이어그램으로 시각화합니다.',
            category: 'design',
            estimatedMinutes: 30,
            dependencies: [],
            suggestedAIProvider: 'anthropic',
            suggestedModel: 'claude-3-sonnet',
            complexity: 'medium',
            outputFormats: ['mermaid', 'markdown'],
            primaryOutputFormat: 'mermaid',
            outputDescription: '프로젝트 아키텍처 다이어그램 (Mermaid)과 설명 문서',
            mcpTools: [],
            promptTemplate: this.generateTaskPromptWithOutput(
                {
                    title: '프로젝트 아키텍처 설계',
                    description: '프로젝트의 전체 구조와 아키텍처를 설계',
                },
                context,
                'mermaid',
                ['mermaid', 'markdown']
            ),
        });

        // 기술 스택 기반 태스크
        if (technicalStack.includes('react') || technicalStack.includes('vue')) {
            const framework = technicalStack.includes('react') ? 'React' : 'Vue';
            tasks.push({
                title: `${framework} 컴포넌트 구현`,
                description: `${framework} 프레임워크를 사용하여 UI 컴포넌트를 설계하고 구현합니다.`,
                category: 'feature',
                estimatedMinutes: 120,
                dependencies: ['프로젝트 아키텍처 설계'],
                suggestedAIProvider: 'anthropic',
                suggestedModel: 'claude-3-opus',
                complexity: 'high',
                outputFormats: ['code'],
                primaryOutputFormat: 'code',
                outputDescription: `${framework} 컴포넌트 소스 코드 (TypeScript)`,
                codeLanguage: 'typescript',
                mcpTools: [{ server: 'filesystem', tools: ['write_file'], required: true }],
                promptTemplate: this.generateTaskPromptWithOutput(
                    {
                        title: `${framework} 컴포넌트 구현`,
                        description: 'UI 컴포넌트 설계 및 구현',
                        codeLanguage: 'typescript',
                    },
                    context,
                    'code',
                    ['code']
                ),
            });
        }

        if (technicalStack.some((t) => ['node', 'python', 'java'].includes(t))) {
            const backendLang = technicalStack.includes('python')
                ? 'python'
                : technicalStack.includes('java')
                  ? 'java'
                  : 'typescript';
            tasks.push({
                title: 'REST API 엔드포인트 구현',
                description:
                    'RESTful API 엔드포인트를 설계하고 구현합니다. OpenAPI 스펙을 포함합니다.',
                category: 'feature',
                estimatedMinutes: 90,
                dependencies: ['프로젝트 아키텍처 설계'],
                suggestedAIProvider: this.selectBestProvider('api backend'),
                suggestedModel: this.selectBestModel('api backend'),
                complexity: 'high',
                outputFormats: ['code', 'yaml'],
                primaryOutputFormat: 'code',
                outputDescription: 'API 소스 코드와 OpenAPI 스펙 (YAML)',
                codeLanguage: backendLang,
                mcpTools: [{ server: 'filesystem', tools: ['write_file'], required: true }],
                promptTemplate: this.generateTaskPromptWithOutput(
                    {
                        title: 'REST API 엔드포인트 구현',
                        description: 'RESTful API 설계 및 구현',
                        codeLanguage: backendLang,
                    },
                    context,
                    'code',
                    ['code', 'yaml']
                ),
            });
        }

        // 요구사항 기반 태스크
        for (let i = 0; i < Math.min(clarifiedRequirements.length, 5); i++) {
            const req = clarifiedRequirements[i];
            if (!req) continue;

            const taskInfo = { title: req.substring(0, 30), description: req };
            const inferredFormat = this.inferOutputFormat(taskInfo);

            tasks.push({
                title: `요구사항 구현: ${req.substring(0, 30)}...`,
                description: req,
                category: 'feature',
                estimatedMinutes: 60,
                dependencies: ['프로젝트 아키텍처 설계'],
                suggestedAIProvider: this.selectBestProvider(req),
                suggestedModel: this.selectBestModel(req),
                complexity: 'medium',
                outputFormats: (taskInfo as any).outputFormats || [],
                primaryOutputFormat: (taskInfo as any).primaryOutputFormat || 'text',
                outputDescription: `요구사항 구현 결과물`,
                codeLanguage: inferredFormat === 'code' ? defaultCodeLang : undefined,
                mcpTools: this.inferMCPTools(taskInfo, inferredFormat),
                promptTemplate: this.generateTaskPromptWithOutput(
                    { ...taskInfo, codeLanguage: defaultCodeLang },
                    context,
                    inferredFormat,
                    [inferredFormat]
                ),
            });
        }

        // 테스트 태스크
        tasks.push({
            title: '테스트 코드 작성',
            description: '단위 테스트와 통합 테스트를 작성합니다.',
            category: 'enhancement',
            estimatedMinutes: 60,
            dependencies: tasks.filter((t) => t.category === 'feature').map((t) => t.title),
            suggestedAIProvider: 'anthropic',
            suggestedModel: 'claude-3-sonnet',
            complexity: 'medium',
            outputFormats: ['code'],
            primaryOutputFormat: 'code',
            outputDescription: '테스트 코드 (단위 테스트, 통합 테스트)',
            codeLanguage: defaultCodeLang,
            mcpTools: [{ server: 'filesystem', tools: ['write_file'], required: true }],
            promptTemplate: this.generateTaskPromptWithOutput(
                {
                    title: '테스트 코드 작성',
                    description: '단위 테스트와 통합 테스트 작성',
                    codeLanguage: defaultCodeLang,
                },
                context,
                'code',
                ['code']
            ),
        });

        // 문서화 태스크
        tasks.push({
            title: 'README 및 API 문서 작성',
            description: 'README 파일과 API 문서를 작성합니다.',
            category: 'documentation',
            estimatedMinutes: 45,
            dependencies: tasks.filter((t) => t.category === 'feature').map((t) => t.title),
            suggestedAIProvider: 'anthropic',
            suggestedModel: 'claude-3-haiku',
            complexity: 'low',
            outputFormats: ['markdown'],
            primaryOutputFormat: 'markdown',
            outputDescription: 'README.md 및 API 문서 (마크다운)',
            mcpTools: [{ server: 'filesystem', tools: ['write_file'], required: true }],
            promptTemplate: this.generateTaskPromptWithOutput(
                { title: 'README 및 API 문서 작성', description: '프로젝트 문서 작성' },
                context,
                'markdown',
                ['markdown']
            ),
        });

        return tasks;
    }

    /**
     * 최적 AI 제공자 선택 (연동된 Provider 기반)
     */
    private selectBestProvider(content: string): AIProvider {
        // 품질 우선: 연동 여부와 무관하게 최적 모델 제안
        if (!this.preferBestOverall && this.enabledProviders.length > 0) {
            return this.selectBestProviderFromEnabled(content);
        }

        // 기본 로직 사용 (연동 여부 무관)
        if (/코드|구현|개발|function|class|api/i.test(content)) {
            return 'anthropic';
        }
        if (/분석|리서치|조사|research|analyze/i.test(content)) {
            return 'anthropic';
        }
        if (/데이터|data|처리|transform/i.test(content)) {
            return 'openai';
        }
        if (content.length > 1000) {
            return 'google';
        }
        return 'anthropic';
    }

    /**
     * Provider의 모델 성능 점수 가져오기
     */
    private getModelPerformanceScore(providerId: string, modelId?: string): number {
        // 특정 모델 점수가 있으면 사용
        if (modelId && MODEL_PERFORMANCE_SCORES[modelId]) {
            return MODEL_PERFORMANCE_SCORES[modelId];
        }

        // Provider 기본 점수 사용
        const providerKey = providerId as AIProviderType;
        return PROVIDER_DEFAULT_SCORES[providerKey] || 50;
    }

    /**
     * 연동된 Provider 중에서 최적 선택
     * 모델 성능 점수를 기본으로 하고, 태그 기반 가산점 적용
     */
    private selectBestProviderFromEnabled(content: string): AIProvider {
        const providers = this.enabledProviders;

        // 태그 기반 점수 계산 + 모델 성능 점수
        const providerScores = providers.map((p) => {
            // 모델 성능 점수를 기본 점수로 사용 (0-100 스케일)
            const performanceScore = this.getModelPerformanceScore(p.id, p.defaultModel);

            // 태그 기반 가산점 (최대 50점)
            let tagBonus = 0;
            const tags = p.tags || [];

            // 코드 관련 작업
            if (/코드|구현|개발|function|class|api/i.test(content)) {
                if (tags.includes('code')) tagBonus += 20;
                if (tags.includes('chat')) tagBonus += 5;
            }
            // 분석/리서치
            if (/분석|리서치|조사|research|analyze/i.test(content)) {
                if (tags.includes('reasoning')) tagBonus += 20;
                if (tags.includes('chat')) tagBonus += 5;
            }
            // 이미지 관련
            if (/이미지|image|디자인|design|그림/i.test(content)) {
                if (tags.includes('image')) tagBonus += 30;
                if (tags.includes('multi-modal')) tagBonus += 15;
            }
            // 비디오 관련
            if (/비디오|video|영상|동영상/i.test(content)) {
                if (tags.includes('video')) tagBonus += 30;
            }
            // 오디오/음악 관련
            if (/오디오|audio|음악|music|소리|sound/i.test(content)) {
                if (tags.includes('audio') || tags.includes('music')) tagBonus += 30;
                if (tags.includes('tts')) tagBonus += 15;
            }
            // TTS 관련
            if (/tts|음성\s*합성|text\s*to\s*speech|읽어/i.test(content)) {
                if (tags.includes('tts')) tagBonus += 30;
            }
            // 긴 컨텍스트
            if (content.length > 1000) {
                if (tags.includes('long-context')) tagBonus += 10;
            }
            // 빠른 응답 필요
            if (/빠른|fast|quick|즉시/i.test(content)) {
                if (tags.includes('fast')) tagBonus += 10;
            }

            // 최종 점수 = 모델 성능 점수 + 태그 가산점
            const totalScore = performanceScore + tagBonus;

            return { provider: p, score: totalScore, performanceScore, tagBonus };
        });

        // 점수 순으로 정렬 (높은 점수 우선)
        providerScores.sort((a, b) => b.score - a.score);

        // 디버깅용 로그
        console.log(
            '[AIInterviewService] Provider scores (sorted by performance):',
            providerScores.map((s) => ({
                id: s.provider.id,
                model: s.provider.defaultModel,
                performance: s.performanceScore,
                tagBonus: s.tagBonus,
                total: s.score,
            }))
        );

        // 최고 점수 Provider 반환 (없으면 첫 번째)
        const best = providerScores[0]?.provider;
        return (best?.id || 'anthropic') as AIProvider;
    }

    /**
     * 최적 AI 모델 선택 (연동된 Provider 기반)
     */
    private selectBestModel(content: string): string {
        const provider = this.selectBestProvider(content);

        // 연동된 Provider에서 모델 정보 찾기
        const enabledProvider = this.enabledProviders.find((p) => p.id === provider);
        if (enabledProvider) {
            // defaultModel이 있으면 사용
            if (enabledProvider.defaultModel) {
                return enabledProvider.defaultModel;
            }
            // models 배열이 있으면 첫 번째 사용
            if (enabledProvider.models && enabledProvider.models.length > 0) {
                const complexity =
                    content.length > 500 || /복잡|complex|architecture|설계/i.test(content);
                return complexity
                    ? enabledProvider.models[0] || 'default-model'
                    : enabledProvider.models[1] || enabledProvider.models[0] || 'default-model';
            }
        }

        // fallback: 기본 모델 맵
        const defaultModels: Record<string, string[]> = {
            anthropic: ['claude-3-5-sonnet', 'claude-3-haiku'],
            openai: ['gpt-4-turbo', 'gpt-3.5-turbo'],
            google: ['gemini-pro'],
            groq: ['llama-3-70b'],
            mistral: ['mistral-large'],
            cohere: ['command-r-plus'],
            deepseek: ['deepseek-coder'],
        };

        const complexity = content.length > 500 || /복잡|complex|architecture|설계/i.test(content);
        const models = defaultModels[provider] || ['default-model'];
        return complexity
            ? models[0] || 'default-model'
            : models[1] || models[0] || 'default-model';
    }

    /**
     * 세션 조회
     */
    getSession(sessionId: string): InterviewSession | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * 세션 상태 확인
     */
    isSessionComplete(sessionId: string): boolean {
        const session = this.sessions.get(sessionId);
        return (
            session?.status === 'completed' ||
            (session?.context.confidence ?? 0) >= this.CONFIDENCE_THRESHOLD
        );
    }

    /**
     * 세션 강제 완료
     */
    forceComplete(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.status = 'completed';
            session.context.confidence = 100;
        }
    }

    /**
     * 단일 태스크용 간이 실행 계획 생성 (프로젝트 뷰 개별 태스크 추가 시 사용)
     */
    async generateDetailedExecutionPlanForTask(input: {
        title: string;
        description: string;
        priority?: 'low' | 'medium' | 'high' | 'urgent';
        tags?: string[];
        estimatedMinutes?: number;
    }): Promise<DetailedTaskPlan> {
        // 간소 컨텍스트 생성 (필수 필드 채우기)
        const context: InterviewContext = {
            originalIdea: input.title,
            clarifiedRequirements: [input.description],
            technicalStack: [],
            constraints: [],
            priorities: [],
            timeline: undefined,
            resources: undefined,
            integrations: [],
            outputFormats: [],
            presetAnswers: [],
            delegatedDecisions: [],
            attachments: [],
            confidence: 80,
            coveredAreas: new Set<QuestionType>(),
            missingAreas: [],
            ideaSpecificityLevel: 'moderate',
        };

        const expectedOutputFormat = this.inferOutputFormat(input);
        const aiOptimizedPrompt = this.optimizePromptForAI(input, context);
        const recommendedProvider = this.selectBestProvider(input.description);
        const requiredMCPs = this.identifyRequiredMCPs(
            { description: input.description, aiOptimizedPrompt },
            context
        );
        const codeLanguage =
            expectedOutputFormat === 'code' ? this.inferCodeLanguage(input, context) : undefined;

        return {
            title: input.title,
            description: input.description,
            aiOptimizedPrompt,
            executionOrder: 1,
            dependencies: [],
            expectedOutputFormat,
            recommendedProviders: [recommendedProvider],
            requiredMCPs,
            estimatedMinutes: input.estimatedMinutes || this.estimateTaskDuration(input),
            priority: input.priority || 'medium',
            tags: input.tags || [],
            codeLanguage,
            category: 'feature',
            complexity: 'medium',
        };
    }

    /**
     * 상세 실행 계획 생성
     * 인터뷰 컨텍스트를 기반으로 AI 실행에 최적화된 태스크 계획 생성
     */
    async generateDetailedExecutionPlan(sessionId: string): Promise<EnhancedExecutionPlan> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error('Session not found');
        }

        if (session.status !== 'completed') {
            throw new Error('Interview must be completed before generating execution plan');
        }

        const { context } = session;

        // 인터뷰 답변 추출
        const interviewAnswers = session.messages
            .filter((m) => m.role === 'user')
            .map((m) => {
                const msgIndex = session.messages.indexOf(m);
                const questionMsg = session.messages[msgIndex - 1];
                return {
                    question: questionMsg?.content || '초기 아이디어',
                    answer: m.content,
                };
            })
            .filter((qa) => qa.question !== '초기 아이디어'); // 초기 아이디어는 제외 (별도 필드 있음)

        // AI를 사용하여 상세 실행 계획 생성
        const systemPrompt = `당신은 세계 최고의 IT 프로젝트 기획자이자 AI 솔루션 아키텍트입니다.
사용자의 아이디어와 인터뷰 내용을 바탕으로, 실제 개발 가능한 수준의 상세 실행 계획을 수립해야 합니다.

## 핵심 목표
사용자의 아이디어는 아직 "원석" 상태입니다. 당신의 전문성을 발휘하여 이를 "보석"으로 다듬어주세요.
단순히 사용자의 말을 요약하거나 반복하지 말고, **전문가적 관점에서 필요한 기능, 기술, 아키텍처를 제안**하고 구체화하세요.

## 상세 지침
1. **프로젝트 제목 및 요약**:
   - 제목은 프로젝트의 핵심 가치를 담은 매력적이고 전문적인 이름으로 지어주세요. (예: "영어 교육 앱" -> "LinguaKids: AI 기반 인터랙티브 영어 동화")
   - 요약은 투자자나 개발팀에게 설명하듯 명확하고 임팩트 있게 작성하세요. 핵심 기능과 가치를 포함해야 합니다.

2. **태스크 도출 (가장 중요)**:
   - 사용자가 언급한 기능 외에도, **완성도 높은 제품을 위해 반드시 필요한 기능(인증, 설정, 데이터 관리, 에러 처리, UI/UX 등)을 스스로 판단하여 추가**하세요.
   - 사용자의 답변을 그대로 태스크로 만들지 마세요. 답변을 분석하여 "구현해야 할 기능"으로 변환하세요.
   - 각 태스크는 AI가 1~2시간 내에 수행 가능한 단위로 잘게 쪼개세요.
   - "사용자가 ~라고 함" 같은 표현을 쓰지 말고, "로그인 페이지 구현", "API 스키마 설계" 등 명확한 작업 지시로 작성하세요.

3. **AI 최적화**:
   - 각 태스크의 \`aiOptimizedPrompt\`는 AI 개발자에게 주는 **구체적인 작업 지시서**여야 합니다.
   - 입출력 형식, 고려사항, 제약조건, 사용할 라이브러리 등을 명시하세요.

4. **기술적 완성도**:
   - 적절한 아키텍처와 기술 스택을 선정하고, 이를 태스크에 반영하세요.
   - 필요한 MCP 도구(파일시스템, 검색, 깃 등)를 정확히 명시하세요.

## 응답 형식 (JSON)
\`\`\`json
{
  "projectTitle": "프로젝트 제목",
  "projectSummary": "프로젝트 요약 (2-3문장)",
  "architecture": "아키텍처 제안 (간단한 설명)",
  "tasks": [
    {
      "title": "태스크 제목",
      "description": "태스크 상세 설명",
      "aiOptimizedPrompt": "AI 실행용 구체적 프롬프트 (명확한 지시사항, 예상 출력 형식 포함)",
      "executionOrder": 1,
      "dependencies": [],
      "expectedOutputFormat": "markdown|code|json|text 등",
      "recommendedProviders": ["anthropic", "openai"],
      "requiredMCPs": ["filesystem", "git"],
      "estimatedMinutes": 60,
      "priority": "high|medium|low|urgent",
      "tags": ["backend", "api"],
      "codeLanguage": "typescript"
    }
  ],
  "totalEstimatedHours": 10,
  "suggestedMilestones": [
    {
      "name": "마일스톤 이름",
      "taskIndices": [0, 1, 2],
      "estimatedCompletion": "1주차"
    }
  ]
}
\`\`\``;

        const userPrompt = this.buildExecutionPlanPrompt(context);

        try {
            this.logPromptRequest('execution-plan', session.aiProvider, userPrompt, {
                systemPrompt,
                temperature: 0.4,
                maxTokens: 4000,
            });
            const response = await aiClient.completeWithInfo(userPrompt, {
                systemPrompt,
                temperature: 0.4, // 창의성을 위해 약간 높임
                maxTokens: 4000,
                preferredProvider: session.aiProvider as any,
            });

            // JSON 파싱
            const jsonMatch =
                response.content.match(/```json\n([\s\S]*?)\n```/) ||
                response.content.match(/```\n([\s\S]*?)\n```/);

            let planData: any;
            if (jsonMatch) {
                planData = JSON.parse(jsonMatch[1] || '{}');
            } else {
                // JSON 블록 없이 직접 JSON인 경우
                planData = JSON.parse(response.content);
            }

            // 데이터 검증 및 보완
            const projectGuidelines =
                planData.projectGuidelines || this.buildProjectGuidelines(context);

            const plan: EnhancedExecutionPlan = {
                projectTitle: planData.projectTitle || this.generateTitle(context),
                projectSummary: planData.projectSummary || this.generateSummary(context),
                projectGuidelines,
                architecture: planData.architecture || this.suggestArchitecture(context),
                tasks: planData.tasks.map((task: any, index: number) => {
                    const optimized =
                        task.aiOptimizedPrompt || this.optimizePromptForAI(task, context);
                    const recommendedProviders = this.resolveRecommendedProviders(task);
                    return {
                        title: task.title,
                        description: task.description,
                        aiOptimizedPrompt: `${this.buildProjectGuidelines(context)}\n\n${optimized}`,
                        executionOrder: task.executionOrder || index + 1,
                        dependencies: task.dependencies || [],
                        expectedOutputFormat: task.expectedOutputFormat || 'markdown',
                        recommendedProviders,
                        requiredMCPs: task.requiredMCPs || this.identifyRequiredMCPs(task, context),
                        estimatedMinutes: task.estimatedMinutes || this.estimateTaskDuration(task),
                        priority: task.priority || 'medium',
                        tags: task.tags || [],
                        category: task.category,
                        complexity: task.complexity,
                        codeLanguage: task.codeLanguage,
                    };
                }),
                totalEstimatedHours:
                    planData.totalEstimatedHours || this.calculateTotalHours(planData.tasks),
                suggestedMilestones:
                    planData.suggestedMilestones || this.generateMilestones(planData.tasks),
                // 원본 데이터 보존
                originalIdea: context.originalIdea,
                interviewAnswers,
            };

            return plan;
        } catch (error) {
            console.error('Failed to generate detailed execution plan:', error);
            // 폴백: 기존 suggestedTasks 기반으로 생성
            return this.generateFallbackExecutionPlan(context);
        }
    }

    /**
     * 실행 계획 생성용 프롬프트 구성
     */
    private buildExecutionPlanPrompt(context: InterviewContext): string {
        const guidelines = this.buildProjectGuidelines(context);

        let prompt = `# 프로젝트 정보\n\n`;
        prompt += `**원래 아이디어:** ${context.originalIdea}\n\n`;

        if (context.clarifiedRequirements.length > 0) {
            prompt += `## 구체화된 요구사항\n`;
            context.clarifiedRequirements.forEach((req, i) => {
                prompt += `${i + 1}. ${req}\n`;
            });
            prompt += `\n`;
        }

        if (context.technicalStack.length > 0) {
            prompt += `## 기술 스택\n${context.technicalStack.join(', ')}\n\n`;
        }

        if (context.constraints.length > 0) {
            prompt += `## 제약 조건\n`;
            context.constraints.forEach((c) => (prompt += `- ${c}\n`));
            prompt += `\n`;
        }

        if (context.priorities.length > 0) {
            prompt += `## 우선순위\n`;
            context.priorities.forEach((p) => (prompt += `- ${p.item} (${p.level})\n`));
            prompt += `\n`;
        }

        if (context.delegatedDecisions.length > 0) {
            prompt += `## AI에게 위임된 결정사항\n`;
            context.delegatedDecisions.forEach((d) => (prompt += `- ${d}\n`));
            prompt += `\n`;
        }

        if (context.outputFormats.length > 0) {
            prompt += `## 결과물 형식\n${context.outputFormats.join(', ')}\n\n`;
        }

        prompt += `## 프로젝트 지침 (AI 실행 컨텍스트로 저장)\n${guidelines}\n\n`;

        prompt += `위 정보를 바탕으로 AI가 실행하기 좋은 형태로 태스크를 생성해주세요.`;

        return prompt;
    }

    /**
     * AI 실행용 프롬프트 최적화
     */
    private optimizePromptForAI(task: any, context: InterviewContext): string {
        const guidelines = this.buildProjectGuidelines(context);
        const expectedFormat = (task.expectedOutputFormat || 'markdown').toString();
        const deps =
            Array.isArray(task.dependencies) && task.dependencies.length > 0
                ? task.dependencies.join(', ')
                : '없음';
        const providers =
            Array.isArray(task.recommendedProviders) && task.recommendedProviders.length > 0
                ? task.recommendedProviders.join(', ')
                : '미정';
        const tags =
            Array.isArray(task.tags) && task.tags.length > 0 ? task.tags.join(', ') : '없음';

        return `# 작업 개요
${task.title || '태스크'}

## 목표
${task.description || ''}

## 프로젝트 지침
${guidelines}

## 실행 컨텍스트
- 예상 결과물 형식: ${expectedFormat}
- 의존 태스크: ${deps}
- 추천 AI Provider: ${providers}
- 태그/도메인: ${tags}
- 실행 순서: ${task.executionOrder || '미정'}

## 결과물 요구사항
- 결과물만 반환 (불필요한 설명/코멘트 금지)
- ${expectedFormat} 형식에 맞춰 최종 산출물을 제공
- 코드 반환 시: 파일 전체 코드를 주석 최소화하여 제공, 설명 문장 금지

## 제약 사항
${context.constraints.length > 0 ? context.constraints.map((c) => `- ${c}`).join('\n') : '- 없음'}

## 참고
기술 스택: ${context.technicalStack.join(', ') || '미정'}

위 정보에 따라 최적화된 프롬프트를 기반으로 결과물을 생성하세요.`;
    }

    /**
     * 태스크 소요 시간 추정
     */
    private estimateTaskDuration(task: any): number {
        // 기본값
        let minutes = 60;

        // 복잡도에 따른 조정
        if (task.complexity === 'high') {
            minutes = 120;
        } else if (task.complexity === 'low') {
            minutes = 30;
        }

        // 설명 길이에 따른 조정
        if (task.description && task.description.length > 200) {
            minutes += 30;
        }

        // 의존성이 많으면 시간 추가
        if (task.dependencies && task.dependencies.length > 2) {
            minutes += 20;
        }

        return minutes;
    }

    /**
     * 필요한 MCP 서버 식별
     */
    private identifyRequiredMCPs(task: any, _context: InterviewContext): string[] {
        const mcps: string[] = [];
        const description = (task.description || '').toLowerCase();
        const prompt = (task.aiOptimizedPrompt || '').toLowerCase();
        const combined = description + ' ' + prompt;

        // 파일 시스템 작업
        if (
            /파일|file|디렉토리|directory|폴더|folder|저장|save|읽기|read|쓰기|write/.test(combined)
        ) {
            mcps.push('filesystem');
        }

        // Git 작업
        if (/git|commit|push|pull|branch|repository/.test(combined)) {
            mcps.push('git');
        }

        // 데이터베이스 작업
        if (/database|db|sql|query|테이블|table/.test(combined)) {
            mcps.push('database');
        }

        // 웹 검색
        if (/검색|search|찾기|find|조사|research/.test(combined)) {
            mcps.push('brave-search');
        }

        // 웹 스크래핑
        if (/크롤링|crawl|스크래핑|scrape|웹페이지|webpage/.test(combined)) {
            mcps.push('puppeteer');
        }

        return [...new Set(mcps)]; // 중복 제거
    }

    /**
     * AI Provider 추천
     */
    private recommendAIProviders(task: any): AIProvider[] {
        const providers: AIProvider[] = [];
        const description = (task.description || '').toLowerCase();
        const outputFormat = task.expectedOutputFormat || '';

        // 코드 생성 태스크
        if (outputFormat === 'code' || /코드|code|프로그래밍|programming/.test(description)) {
            providers.push('anthropic'); // Claude는 코드 생성에 강함
            providers.push('openai');
        }
        // 데이터 분석
        else if (/분석|analysis|데이터|data/.test(description)) {
            providers.push('google'); // Gemini는 데이터 분석에 강함
            providers.push('anthropic');
        }
        // 빠른 응답이 필요한 경우
        else if (/간단|simple|빠른|quick/.test(description)) {
            providers.push('groq'); // Groq는 빠른 응답
            providers.push('openai');
        }
        // 복잡한 추론
        else if (/복잡|complex|추론|reasoning/.test(description)) {
            providers.push('anthropic');
            providers.push('openai');
        }
        // 기본값
        else {
            providers.push('anthropic');
            providers.push('openai');
            providers.push('google');
        }

        return Array.from(new Set(providers));
    }

    /**
     * 총 예상 시간 계산
     */
    private calculateTotalHours(tasks: any[]): number {
        const totalMinutes = tasks.reduce((sum, task) => sum + (task.estimatedMinutes || 60), 0);
        return Math.ceil(totalMinutes / 60);
    }

    /**
     * 마일스톤 생성
     */
    private generateMilestones(tasks: any[]): EnhancedExecutionPlan['suggestedMilestones'] {
        const milestones: EnhancedExecutionPlan['suggestedMilestones'] = [];
        const tasksPerMilestone = Math.ceil(tasks.length / 3); // 3개 마일스톤으로 분할

        for (let i = 0; i < tasks.length; i += tasksPerMilestone) {
            const milestoneIndex = Math.floor(i / tasksPerMilestone);
            const taskIndices = tasks.slice(i, i + tasksPerMilestone).map((_, idx) => i + idx);

            milestones.push({
                name: `단계 ${milestoneIndex + 1}`,
                taskIndices,
                estimatedCompletion: `${milestoneIndex + 1}주차`,
            });
        }

        return milestones;
    }

    /**
     * 폴백 실행 계획 생성 (AI 실패 시)
     */
    private generateFallbackExecutionPlan(context: InterviewContext): EnhancedExecutionPlan {
        // 기존 concretizeIdeaWithAI의 suggestedTasks를 기반으로 생성
        const tasks: DetailedTaskPlan[] = context.clarifiedRequirements.map((req, index) => ({
            title: `태스크 ${index + 1}: ${req.substring(0, 50)}`,
            description: req,
            aiOptimizedPrompt: `${this.buildProjectGuidelines(context)}\n\n${this.optimizePromptForAI(req, context)}`,
            executionOrder: index + 1,
            dependencies: index > 0 ? [index - 1] : [],
            expectedOutputFormat: 'markdown',
            recommendedProviders: ['anthropic', 'openai'],
            requiredMCPs: this.identifyRequiredMCPs({ description: req }, context),
            estimatedMinutes: 60,
            priority: 'medium',
            tags: [],
        }));

        return {
            projectTitle: this.generateTitle(context),
            projectSummary: this.generateSummary(context),
            projectGuidelines: this.buildProjectGuidelines(context),
            architecture: this.suggestArchitecture(context),
            tasks,
            totalEstimatedHours: this.calculateTotalHours(tasks),
            suggestedMilestones: this.generateMilestones(tasks),
            originalIdea: context.originalIdea,
            interviewAnswers: [], // 폴백 시에는 메시지 기록에 접근할 수 없어 빈 배열 반환
        };
    }
}

// ========================================
// Singleton Export
// ========================================

export const aiInterviewService = new AIInterviewService();
export default aiInterviewService;
