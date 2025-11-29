/**
 * AI Model Recommendation Service
 *
 * Recommends optimal AI models for specific tasks based on task characteristics,
 * cost efficiency, performance requirements, and historical success rates.
 *
 * 연동된 Provider 및 태그 기반 추천을 지원합니다.
 */

// ========================================
// Types
// ========================================

// Provider tags from settings store (for type compatibility)
import type { AIProviderTag } from '../../renderer/stores/settingsStore';

// Provider configuration from settings store
import type { AIProviderConfig as EnabledProviderConfig } from '../../renderer/stores/settingsStore';

import type { AIProvider } from '../../core/types/ai';

export interface AIModel {
  id: string;
  provider: AIProvider;
  name: string;
  displayName: string;
  capabilities: ModelCapability[];
  tags?: AIProviderTag[]; // Provider capability tags
  costPer1kInputTokens: number;
  costPer1kOutputTokens: number;
  maxContextLength: number;
  avgResponseTime: number; // ms
  strengths: string[];
  weaknesses: string[];
  bestFor: TaskCategory[];
  available: boolean;
}

export type ModelCapability =
  | 'code_generation'
  | 'code_review'
  | 'debugging'
  | 'documentation'
  | 'data_analysis'
  | 'creative_writing'
  | 'translation'
  | 'summarization'
  | 'conversation'
  | 'reasoning'
  | 'math'
  | 'vision'
  | 'long_context'
  | 'function_calling'
  | 'structured_output';

export type TaskCategory =
  | 'code'
  | 'design'
  | 'document'
  | 'data'
  | 'research'
  | 'planning'
  | 'testing'
  | 'review'
  | 'general';

export interface TaskAnalysis {
  category: TaskCategory;
  complexity: 'low' | 'medium' | 'high';
  requiredCapabilities: ModelCapability[];
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  priorityFactors: {
    speed: number;     // 0-1
    quality: number;   // 0-1
    cost: number;      // 0-1
  };
  contextRequirements?: {
    needsLongContext: boolean;
    needsVision: boolean;
    needsRealtime: boolean;
  };
}

export interface ModelRecommendation {
  model: AIModel;
  score: number;
  reasons: string[];
  estimatedCost: number;
  estimatedTime: number;
  alternativeModels: AIModel[];
  optimizedPrompt?: string;
}

export interface TaskPromptOptimization {
  originalPrompt: string;
  optimizedPrompt: string;
  modelSpecificInstructions: string;
  suggestedParameters: {
    temperature: number;
    maxTokens: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  };
}

// ========================================
// Model Database
// ========================================

const AI_MODELS: AIModel[] = [
  // Anthropic Models
  {
    id: 'claude-3-opus',
    provider: 'anthropic',
    name: 'claude-3-opus-20240229',
    displayName: 'Claude 3 Opus',
    capabilities: [
      'code_generation', 'code_review', 'debugging', 'documentation',
      'reasoning', 'creative_writing', 'summarization', 'long_context',
      'function_calling', 'structured_output'
    ],
    tags: ['chat', 'code', 'reasoning', 'image-analysis', 'long-context', 'multi-modal', 'agent'],
    costPer1kInputTokens: 0.015,
    costPer1kOutputTokens: 0.075,
    maxContextLength: 200000,
    avgResponseTime: 3000,
    strengths: [
      '최고 수준의 추론 능력',
      '복잡한 코드 작업에 탁월',
      '긴 컨텍스트 처리',
      '정확한 지시 따르기'
    ],
    weaknesses: ['비용이 높음', '응답 속도가 느림'],
    bestFor: ['code', 'planning', 'research'],
    available: true,
  },
  {
    id: 'claude-3-5-sonnet',
    provider: 'anthropic',
    name: 'claude-3-5-sonnet-20241022',
    displayName: 'Claude 3.5 Sonnet',
    capabilities: [
      'code_generation', 'code_review', 'debugging', 'documentation',
      'reasoning', 'creative_writing', 'summarization', 'long_context',
      'function_calling', 'structured_output', 'vision'
    ],
    tags: ['chat', 'code', 'reasoning', 'image-analysis', 'long-context', 'multi-modal', 'agent'],
    costPer1kInputTokens: 0.003,
    costPer1kOutputTokens: 0.015,
    maxContextLength: 200000,
    avgResponseTime: 1500,
    strengths: [
      '코드 생성 최강',
      '비용 대비 성능 우수',
      '빠른 응답 속도',
      '비전 기능 지원'
    ],
    weaknesses: ['매우 복잡한 추론에서 Opus보다 약간 떨어짐'],
    bestFor: ['code', 'review', 'document', 'general'],
    available: true,
  },
  {
    id: 'claude-3-haiku',
    provider: 'anthropic',
    name: 'claude-3-haiku-20240307',
    displayName: 'Claude 3 Haiku',
    capabilities: [
      'code_generation', 'documentation', 'summarization',
      'conversation', 'function_calling', 'structured_output'
    ],
    tags: ['chat', 'code', 'fast', 'agent'],
    costPer1kInputTokens: 0.00025,
    costPer1kOutputTokens: 0.00125,
    maxContextLength: 200000,
    avgResponseTime: 500,
    strengths: [
      '초고속 응답',
      '매우 저렴한 비용',
      '간단한 작업에 적합'
    ],
    weaknesses: ['복잡한 추론 능력 제한', '코드 품질이 상위 모델보다 낮음'],
    bestFor: ['general', 'document'],
    available: true,
  },

  // OpenAI Models
  {
    id: 'gpt-4-turbo',
    provider: 'openai',
    name: 'gpt-4-turbo-preview',
    displayName: 'GPT-4 Turbo',
    capabilities: [
      'code_generation', 'code_review', 'debugging', 'documentation',
      'reasoning', 'creative_writing', 'summarization', 'vision',
      'function_calling', 'structured_output'
    ],
    tags: ['chat', 'code', 'reasoning', 'image', 'image-analysis', 'tts', 'stt', 'embedding', 'multi-modal', 'agent'],
    costPer1kInputTokens: 0.01,
    costPer1kOutputTokens: 0.03,
    maxContextLength: 128000,
    avgResponseTime: 2000,
    strengths: [
      '균형 잡힌 성능',
      '강력한 함수 호출',
      'JSON 모드 지원',
      '비전 기능'
    ],
    weaknesses: ['긴 컨텍스트에서 성능 저하 가능'],
    bestFor: ['code', 'data', 'general'],
    available: true,
  },
  {
    id: 'gpt-4o',
    provider: 'openai',
    name: 'gpt-4o',
    displayName: 'GPT-4o',
    capabilities: [
      'code_generation', 'code_review', 'debugging', 'documentation',
      'reasoning', 'creative_writing', 'summarization', 'vision',
      'function_calling', 'structured_output', 'conversation'
    ],
    tags: ['chat', 'code', 'reasoning', 'image', 'image-analysis', 'tts', 'stt', 'embedding', 'multi-modal', 'agent'],
    costPer1kInputTokens: 0.005,
    costPer1kOutputTokens: 0.015,
    maxContextLength: 128000,
    avgResponseTime: 1000,
    strengths: [
      '빠른 응답 속도',
      '멀티모달 통합',
      '비용 효율적'
    ],
    weaknesses: ['매우 복잡한 작업에서 GPT-4보다 약간 떨어짐'],
    bestFor: ['code', 'general', 'design'],
    available: true,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    name: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    capabilities: [
      'code_generation', 'documentation', 'summarization',
      'conversation', 'function_calling', 'structured_output'
    ],
    tags: ['chat', 'code', 'fast', 'agent'],
    costPer1kInputTokens: 0.00015,
    costPer1kOutputTokens: 0.0006,
    maxContextLength: 128000,
    avgResponseTime: 400,
    strengths: [
      '매우 저렴',
      '초고속',
      '간단한 작업에 적합'
    ],
    weaknesses: ['복잡한 추론 제한'],
    bestFor: ['general', 'document'],
    available: true,
  },

  // Google Models
  {
    id: 'gemini-pro',
    provider: 'google',
    name: 'gemini-pro',
    displayName: 'Gemini Pro',
    capabilities: [
      'code_generation', 'code_review', 'documentation',
      'reasoning', 'summarization', 'long_context',
      'function_calling'
    ],
    tags: ['chat', 'code', 'reasoning', 'image-analysis', 'long-context', 'multi-modal', 'agent', 'free-tier'],
    costPer1kInputTokens: 0.00025,
    costPer1kOutputTokens: 0.0005,
    maxContextLength: 1000000,
    avgResponseTime: 1200,
    strengths: [
      '초장문 컨텍스트 (1M 토큰)',
      '매우 저렴한 비용',
      '빠른 응답'
    ],
    weaknesses: ['코드 품질이 Claude/GPT보다 낮을 수 있음'],
    bestFor: ['research', 'document', 'data'],
    available: true,
  },
  {
    id: 'gemini-pro-vision',
    provider: 'google',
    name: 'gemini-pro-vision',
    displayName: 'Gemini Pro Vision',
    capabilities: [
      'vision', 'code_generation', 'documentation',
      'reasoning', 'summarization'
    ],
    tags: ['chat', 'image-analysis', 'multi-modal', 'free-tier'],
    costPer1kInputTokens: 0.00025,
    costPer1kOutputTokens: 0.0005,
    maxContextLength: 32000,
    avgResponseTime: 1500,
    strengths: [
      '이미지 분석',
      '저렴한 비용'
    ],
    weaknesses: ['텍스트 전용 작업에서는 일반 Gemini Pro가 나음'],
    bestFor: ['design', 'data'],
    available: true,
  },

  // Groq Models
  {
    id: 'groq-llama-70b',
    provider: 'groq',
    name: 'llama-3.3-70b-versatile',
    displayName: 'Groq Llama 3.3 70B',
    capabilities: [
      'code_generation', 'documentation', 'summarization',
      'conversation', 'reasoning'
    ],
    tags: ['chat', 'code', 'fast', 'image-analysis', 'free-tier'],
    costPer1kInputTokens: 0.0006,
    costPer1kOutputTokens: 0.0008,
    maxContextLength: 32768,
    avgResponseTime: 300,
    strengths: [
      '초고속 추론 (LPU)',
      '매우 저렴한 비용',
      '실시간 대화에 적합'
    ],
    weaknesses: ['컨텍스트 길이 제한'],
    bestFor: ['general', 'code'],
    available: true,
  },

  // DeepSeek Models
  {
    id: 'deepseek-chat',
    provider: 'deepseek',
    name: 'deepseek-chat',
    displayName: 'DeepSeek Chat',
    capabilities: [
      'code_generation', 'code_review', 'debugging',
      'documentation', 'reasoning', 'summarization'
    ],
    tags: ['chat', 'code', 'reasoning', 'long-context', 'free-tier'],
    costPer1kInputTokens: 0.00014,
    costPer1kOutputTokens: 0.00028,
    maxContextLength: 64000,
    avgResponseTime: 1500,
    strengths: [
      '뛰어난 코드 생성',
      '매우 저렴',
      '긴 컨텍스트 지원'
    ],
    weaknesses: ['영어 외 언어에서 성능 저하 가능'],
    bestFor: ['code', 'document'],
    available: true,
  },

  // Local Models
  {
    id: 'llama-3-70b',
    provider: 'local',
    name: 'llama-3-70b',
    displayName: 'Llama 3 70B',
    capabilities: [
      'code_generation', 'documentation', 'summarization',
      'conversation', 'reasoning'
    ],
    tags: ['chat', 'code', 'local', 'free-tier'],
    costPer1kInputTokens: 0,
    costPer1kOutputTokens: 0,
    maxContextLength: 8192,
    avgResponseTime: 5000,
    strengths: [
      '무료 (로컬 실행)',
      '데이터 프라이버시',
      '오프라인 사용 가능'
    ],
    weaknesses: ['높은 하드웨어 요구사항', '느린 속도', '컨텍스트 제한'],
    bestFor: ['general'],
    available: false, // 로컬 설정 필요
  },
];

// ========================================
// Task Category Detection Patterns
// ========================================

const CATEGORY_PATTERNS: Record<TaskCategory, RegExp[]> = {
  code: [
    /코드|code|구현|implement|개발|develop|function|class|api|알고리즘|algorithm/i,
    /프로그램|program|스크립트|script|모듈|module|컴포넌트|component/i,
  ],
  design: [
    /디자인|design|ui|ux|레이아웃|layout|스타일|style|css|figma/i,
    /와이어프레임|wireframe|프로토타입|prototype|목업|mockup/i,
  ],
  document: [
    /문서|document|작성|write|readme|가이드|guide|설명|explain/i,
    /주석|comment|docstring|jsdoc|타입|type/i,
  ],
  data: [
    /데이터|data|분석|analysis|csv|json|변환|transform|파싱|parse/i,
    /sql|쿼리|query|데이터베이스|database|집계|aggregate/i,
  ],
  research: [
    /조사|research|분석|analyze|비교|compare|리뷰|review/i,
    /평가|evaluate|검토|examine|탐색|explore/i,
  ],
  planning: [
    /계획|plan|설계|design|아키텍처|architecture|구조|structure/i,
    /전략|strategy|로드맵|roadmap|일정|schedule/i,
  ],
  testing: [
    /테스트|test|검증|verify|유닛|unit|통합|integration/i,
    /qa|품질|quality|버그|bug|디버그|debug/i,
  ],
  review: [
    /리뷰|review|검토|check|피드백|feedback|개선|improve/i,
    /리팩토링|refactor|최적화|optimize/i,
  ],
  general: [],
};

// ========================================
// AI Model Recommendation Service Class
// ========================================

export class AIModelRecommendationService {
  private models: AIModel[] = AI_MODELS;
  private usageHistory: Map<string, { model: string; success: boolean; duration: number }[]> = new Map();

  /**
   * 태스크에 대한 최적 AI 모델 추천
   *
   * @param taskTitle 태스크 제목
   * @param taskDescription 태스크 설명
   * @param options 추천 옵션
   * @param options.enabledProviders 연동된 Provider 목록 (제공시 이 목록에서만 추천)
   * @param options.requiredTags 필요한 태그 목록
   * @param options.preferredProvider 선호 Provider
   * @param options.maxCost 최대 비용
   * @param options.prioritizeSpeed 속도 우선
   * @param options.prioritizeQuality 품질 우선
   */
  recommendModel(
    taskTitle: string,
    taskDescription: string,
    options?: {
      enabledProviders?: EnabledProviderConfig[];
      requiredTags?: AIProviderTag[];
      preferredProvider?: AIProvider;
      maxCost?: number;
      prioritizeSpeed?: boolean;
      prioritizeQuality?: boolean;
    }
  ): ModelRecommendation {
    // 태스크 분석
    const analysis = this.analyzeTask(taskTitle, taskDescription);

    // 모델 점수 계산 (연동된 Provider와 태그 필터링 포함)
    const scoredModels = this.scoreModels(analysis, options);

    // 점수가 있는 모델이 없으면 기본 모델 반환
    if (scoredModels.length === 0) {
      const defaultModel =
        this.models.find(m => m.id === 'claude-3-5-sonnet') ?? this.models[0];
      if (!defaultModel) {
        throw new Error('No AI models available for recommendation');
      }
      return {
        model: defaultModel,
        score: 0,
        reasons: ['연동된 Provider가 없어 기본 모델을 추천합니다.'],
        estimatedCost: 0,
        estimatedTime: defaultModel.avgResponseTime,
        alternativeModels: [],
      };
    }

    // 최고 점수 모델 선택
    const topModel = scoredModels[0];
    if (!topModel) {
      throw new Error('Unable to determine top model from scored list');
    }
    const alternatives = scoredModels.slice(1, 4).map(s => s.model);

    // 비용 및 시간 추정
    const estimatedCost = this.estimateCost(
      topModel.model,
      analysis.estimatedInputTokens,
      analysis.estimatedOutputTokens
    );
    const estimatedTime = topModel.model.avgResponseTime;

    // 추천 이유 생성
    const reasons = this.generateReasons(topModel.model, analysis, options?.requiredTags);

    return {
      model: topModel.model,
      score: topModel.score,
      reasons,
      estimatedCost,
      estimatedTime,
      alternativeModels: alternatives,
    };
  }

  /**
   * 연동된 Provider 목록에서 특정 태그를 가진 Provider들 추천
   */
  recommendProvidersByTags(
    enabledProviders: EnabledProviderConfig[],
    requiredTags: AIProviderTag[]
  ): EnabledProviderConfig[] {
    if (requiredTags.length === 0) {
      return enabledProviders;
    }

    // 태그 매칭 점수 기반 정렬
    return enabledProviders
      .map(provider => {
        const matchedTags = (provider.tags || []).filter(tag => requiredTags.includes(tag));
        return {
          provider,
          score: matchedTags.length / requiredTags.length,
          matchedCount: matchedTags.length,
        };
      })
      .filter(item => item.matchedCount > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.provider);
  }

  /**
   * 태스크 카테고리에 맞는 최적 태그 추천
   */
  getRecommendedTagsForCategory(category: TaskCategory): AIProviderTag[] {
    const tagMapping: Record<TaskCategory, AIProviderTag[]> = {
      code: ['code', 'chat', 'reasoning'],
      design: ['image', 'image-analysis', 'multi-modal'],
      document: ['chat', 'long-context'],
      data: ['reasoning', 'embedding', 'chat'],
      research: ['search', 'reasoning', 'chat'],
      planning: ['reasoning', 'agent', 'chat'],
      testing: ['code', 'agent'],
      review: ['code', 'reasoning'],
      general: ['chat'],
    };
    return tagMapping[category] || ['chat'];
  }

  /**
   * 태스크 분석
   */
  analyzeTask(title: string, description: string): TaskAnalysis {
    const fullText = `${title} ${description}`;

    // 카테고리 감지
    const category = this.detectCategory(fullText);

    // 복잡도 추정
    const complexity = this.estimateComplexity(fullText);

    // 필요한 기능 감지
    const requiredCapabilities = this.detectRequiredCapabilities(fullText, category);

    // 토큰 추정
    const estimatedInputTokens = Math.ceil(fullText.length / 4) + 500; // 프롬프트 오버헤드
    const estimatedOutputTokens = this.estimateOutputTokens(category, complexity);

    // 우선순위 기본값
    const priorityFactors = {
      speed: 0.3,
      quality: 0.5,
      cost: 0.2,
    };

    // 컨텍스트 요구사항
    const contextRequirements = {
      needsLongContext: fullText.length > 10000,
      needsVision: /이미지|image|사진|photo|스크린샷|screenshot|디자인|design/i.test(fullText),
      needsRealtime: /실시간|realtime|스트리밍|streaming/i.test(fullText),
    };

    return {
      category,
      complexity,
      requiredCapabilities,
      estimatedInputTokens,
      estimatedOutputTokens,
      priorityFactors,
      contextRequirements,
    };
  }

  /**
   * 카테고리 감지
   */
  private detectCategory(text: string): TaskCategory {
    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
      if (patterns.some(p => p.test(text))) {
        return category as TaskCategory;
      }
    }
    return 'general';
  }

  /**
   * 복잡도 추정
   */
  private estimateComplexity(text: string): 'low' | 'medium' | 'high' {
    const complexityIndicators = {
      high: [
        /복잡|complex|아키텍처|architecture|시스템|system|전체|entire/i,
        /최적화|optimize|성능|performance|확장|scale|보안|security/i,
        /통합|integrate|마이그레이션|migration|리팩토링|refactor/i,
      ],
      medium: [
        /기능|feature|모듈|module|컴포넌트|component|api/i,
        /수정|modify|업데이트|update|추가|add|개선|improve/i,
      ],
      low: [
        /간단|simple|작은|small|빠른|quick|수정|fix/i,
        /오타|typo|문서|document|주석|comment/i,
      ],
    };

    for (const [level, patterns] of Object.entries(complexityIndicators)) {
      if (patterns.some(p => p.test(text))) {
        return level as 'low' | 'medium' | 'high';
      }
    }

    return 'medium';
  }

  /**
   * 필요한 기능 감지
   */
  private detectRequiredCapabilities(text: string, category: TaskCategory): ModelCapability[] {
    const capabilities: Set<ModelCapability> = new Set();

    // 카테고리 기반 기본 기능
    const categoryCapabilities: Record<TaskCategory, ModelCapability[]> = {
      code: ['code_generation', 'debugging'],
      design: ['creative_writing', 'vision'],
      document: ['documentation', 'summarization'],
      data: ['data_analysis', 'structured_output'],
      research: ['reasoning', 'summarization'],
      planning: ['reasoning', 'structured_output'],
      testing: ['code_generation', 'debugging'],
      review: ['code_review', 'reasoning'],
      general: ['conversation'],
    };

    categoryCapabilities[category].forEach(c => capabilities.add(c));

    // 텍스트 기반 추가 기능 감지
    if (/json|xml|구조화|structured/i.test(text)) {
      capabilities.add('structured_output');
    }
    if (/함수|function|tool|호출|call/i.test(text)) {
      capabilities.add('function_calling');
    }
    if (/이미지|image|비전|vision|시각/i.test(text)) {
      capabilities.add('vision');
    }
    if (/긴|long|대용량|large|많은|많은 양/i.test(text)) {
      capabilities.add('long_context');
    }
    if (/수학|math|계산|calculate|통계|statistics/i.test(text)) {
      capabilities.add('math');
    }

    return Array.from(capabilities);
  }

  /**
   * 출력 토큰 추정
   */
  private estimateOutputTokens(category: TaskCategory, complexity: string): number {
    const baseTokens: Record<TaskCategory, number> = {
      code: 2000,
      design: 1000,
      document: 1500,
      data: 1000,
      research: 2000,
      planning: 1500,
      testing: 1500,
      review: 1000,
      general: 500,
    };

    const multiplier = complexity === 'high' ? 2 : complexity === 'medium' ? 1.5 : 1;
    return Math.ceil(baseTokens[category] * multiplier);
  }

  /**
   * 모델 점수 계산
   */
  private scoreModels(
    analysis: TaskAnalysis,
    options?: {
      enabledProviders?: EnabledProviderConfig[];
      requiredTags?: AIProviderTag[];
      preferredProvider?: AIProvider;
      maxCost?: number;
      prioritizeSpeed?: boolean;
      prioritizeQuality?: boolean;
    }
  ): { model: AIModel; score: number }[] {
    // 연동된 Provider ID 목록
    const enabledProviderIds = options?.enabledProviders?.map(p => p.id) || [];
    const hasEnabledProviders = enabledProviderIds.length > 0;

    // 연동된 Provider의 태그 정보를 맵으로 변환
    const providerTagsMap = new Map<string, AIProviderTag[]>();
    options?.enabledProviders?.forEach(p => {
      providerTagsMap.set(p.id, p.tags || []);
    });

    const scoredModels = this.models
      .filter(m => {
        // 1. available 체크
        if (!m.available) return false;

        // 2. 연동된 Provider가 있으면 해당 Provider의 모델만 필터링
        if (hasEnabledProviders) {
          // provider ID가 연동된 Provider 목록에 있는지 확인
          const providerMatch = enabledProviderIds.includes(m.provider);
          if (!providerMatch) return false;
        }

        return true;
      })
      .map(model => {
        let score = 0;

        // 1. 기능 매칭 (40%)
        const capabilityScore = this.calculateCapabilityScore(model, analysis.requiredCapabilities);
        score += capabilityScore * 40;

        // 2. 카테고리 적합성 (20%)
        if (model.bestFor.includes(analysis.category)) {
          score += 20;
        } else if (model.bestFor.includes('general')) {
          score += 10;
        }

        // 3. 비용 효율성 (15%)
        const cost = this.estimateCost(model, analysis.estimatedInputTokens, analysis.estimatedOutputTokens);
        const costScore = Math.max(0, 15 - cost * 10); // 비용이 낮을수록 높은 점수
        score += costScore * analysis.priorityFactors.cost;

        // 4. 속도 (15%)
        const speedScore = Math.max(0, 15 - model.avgResponseTime / 500);
        score += speedScore * analysis.priorityFactors.speed;

        // 5. 품질/복잡도 매칭 (10%)
        if (analysis.complexity === 'high') {
          // 복잡한 작업에는 고성능 모델
          if (['claude-3-opus', 'claude-3-5-sonnet', 'gpt-4-turbo'].includes(model.id)) {
            score += 10;
          }
        } else if (analysis.complexity === 'low') {
          // 간단한 작업에는 빠른 모델
          if (['claude-3-haiku', 'gpt-4o-mini', 'gemini-pro', 'groq-llama-70b'].includes(model.id)) {
            score += 10;
          }
        } else {
          score += 5; // 중간 복잡도는 모든 모델에 적합
        }

        // 6. 태그 매칭 점수 (신규 - 15%)
        if (options?.requiredTags && options.requiredTags.length > 0) {
          // 모델 자체의 태그와 Provider의 태그 모두 고려
          const modelTags = model.tags || [];
          const providerTags = providerTagsMap.get(model.provider) || [];
          const allTags = [...new Set([...modelTags, ...providerTags])];

          const matchedTags = options.requiredTags.filter(tag => allTags.includes(tag));
          const tagScore = (matchedTags.length / options.requiredTags.length) * 15;
          score += tagScore;
        }

        // 옵션 적용
        if (options?.preferredProvider && model.provider === options.preferredProvider) {
          score += 10;
        }
        if (options?.maxCost && cost > options.maxCost) {
          score -= 30; // 예산 초과 시 큰 페널티
        }
        if (options?.prioritizeSpeed) {
          score += speedScore * 0.5;
        }
        if (options?.prioritizeQuality) {
          score += capabilityScore * 10;
        }

        // 컨텍스트 요구사항
        if (analysis.contextRequirements?.needsLongContext) {
          if (model.maxContextLength >= 100000) score += 10;
          else score -= 10;
        }
        if (analysis.contextRequirements?.needsVision) {
          if (model.capabilities.includes('vision')) score += 15;
          else score -= 20;
        }

        return { model, score };
      })
      .sort((a, b) => b.score - a.score);

    return scoredModels;
  }

  /**
   * 기능 매칭 점수 계산
   */
  private calculateCapabilityScore(model: AIModel, required: ModelCapability[]): number {
    if (required.length === 0) return 0.5;

    const matched = required.filter(cap => model.capabilities.includes(cap)).length;
    return matched / required.length;
  }

  /**
   * 비용 추정
   */
  estimateCost(model: AIModel, inputTokens: number, outputTokens: number): number {
    return (
      (inputTokens / 1000) * model.costPer1kInputTokens +
      (outputTokens / 1000) * model.costPer1kOutputTokens
    );
  }

  /**
   * 추천 이유 생성
   */
  private generateReasons(model: AIModel, analysis: TaskAnalysis, requiredTags?: AIProviderTag[]): string[] {
    const reasons: string[] = [];

    // 강점 기반 이유
    if (model.bestFor.includes(analysis.category)) {
      reasons.push(`${analysis.category} 작업에 최적화된 모델입니다.`);
    }

    // 태그 매칭 이유
    if (requiredTags && requiredTags.length > 0) {
      const modelTags = model.tags || [];
      const matchedTags = requiredTags.filter(tag => modelTags.includes(tag));
      if (matchedTags.length > 0) {
        const tagNames = matchedTags.map(this.getTagDisplayName).join(', ');
        reasons.push(`요청된 기능(${tagNames})을 지원합니다.`);
      }
    }

    // 기능 매칭 이유
    const matchedCaps = analysis.requiredCapabilities.filter(c => model.capabilities.includes(c));
    if (matchedCaps.length > 0) {
      reasons.push(`필요한 기능(${matchedCaps.join(', ')})을 모두 지원합니다.`);
    }

    // 성능 이유
    if (model.avgResponseTime < 1500) {
      reasons.push('빠른 응답 속도를 제공합니다.');
    }

    // 비용 이유
    if (model.costPer1kInputTokens < 0.001) {
      reasons.push('비용 효율적인 모델입니다.');
    }

    // 컨텍스트 이유
    if (model.maxContextLength >= 100000) {
      reasons.push('대용량 컨텍스트를 처리할 수 있습니다.');
    }

    // 모델 강점 추가
    reasons.push(...model.strengths.slice(0, 2));

    return reasons.slice(0, 5);
  }

  /**
   * 태그 표시 이름 반환
   */
  private getTagDisplayName(tag: AIProviderTag): string {
    const names: Record<AIProviderTag, string> = {
      'chat': '채팅',
      'code': '코드',
      'reasoning': '추론',
      'image': '이미지 생성',
      'image-analysis': '이미지 분석',
      'video': '비디오',
      'audio': '오디오',
      'tts': 'TTS',
      'stt': 'STT',
      'music': '음악',
      'embedding': '임베딩',
      'search': '검색',
      'long-context': '긴 컨텍스트',
      'fast': '빠른 응답',
      'local': '로컬',
      'multi-modal': '멀티모달',
      'agent': '에이전트',
      'free-tier': '무료 티어',
    };
    return names[tag] || tag;
  }

  /**
   * 프롬프트 최적화
   */
  optimizePromptForModel(
    model: AIModel,
    taskTitle: string,
    taskDescription: string
  ): TaskPromptOptimization {
    const originalPrompt = `# ${taskTitle}\n\n${taskDescription}`;

    let optimizedPrompt = originalPrompt;
    let modelSpecificInstructions = '';

    // 모델별 최적화
    switch (model.provider) {
      case 'anthropic':
        modelSpecificInstructions = this.getAnthropicInstructions(model);
        optimizedPrompt = this.optimizeForAnthropic(originalPrompt, model);
        break;
      case 'openai':
        modelSpecificInstructions = this.getOpenAIInstructions(model);
        optimizedPrompt = this.optimizeForOpenAI(originalPrompt, model);
        break;
      case 'google':
        modelSpecificInstructions = this.getGoogleInstructions(model);
        optimizedPrompt = this.optimizeForGoogle(originalPrompt, model);
        break;
      default:
        modelSpecificInstructions = '일반적인 프롬프트 형식을 사용합니다.';
    }

    // 파라미터 제안
    const suggestedParameters = this.getSuggestedParameters(model, taskDescription);

    return {
      originalPrompt,
      optimizedPrompt,
      modelSpecificInstructions,
      suggestedParameters,
    };
  }

  /**
   * Anthropic 모델 최적화
   */
  private optimizeForAnthropic(prompt: string, _model: AIModel): string {
    // Claude는 XML 태그와 명확한 구조를 선호
    return `<task>
${prompt}
</task>

<instructions>
위 작업을 수행해주세요. 응답은 구조화된 형식으로 제공해주세요.
</instructions>`;
  }

  /**
   * OpenAI 모델 최적화
   */
  private optimizeForOpenAI(prompt: string, _model: AIModel): string {
    // GPT는 시스템 메시지와 명확한 지시를 선호
    return `## Task
${prompt}

## Instructions
Please complete the task above. Provide a structured response.`;
  }

  /**
   * Google 모델 최적화
   */
  private optimizeForGoogle(prompt: string, _model: AIModel): string {
    // Gemini는 간결하고 직접적인 프롬프트를 선호
    return `Task: ${prompt}

Please provide a detailed and structured response.`;
  }

  /**
   * Anthropic 지시사항
   */
  private getAnthropicInstructions(_model: AIModel): string {
    return `Claude 모델 최적화:
- XML 태그를 사용하여 섹션을 구분합니다.
- 명확하고 구체적인 지시를 제공합니다.
- 단계별 사고 과정을 요청하면 더 좋은 결과를 얻을 수 있습니다.`;
  }

  /**
   * OpenAI 지시사항
   */
  private getOpenAIInstructions(_model: AIModel): string {
    return `GPT 모델 최적화:
- 마크다운 형식을 사용하여 구조화합니다.
- 역할과 목표를 명확히 정의합니다.
- 필요한 경우 JSON 모드를 활용합니다.`;
  }

  /**
   * Google 지시사항
   */
  private getGoogleInstructions(_model: AIModel): string {
    return `Gemini 모델 최적화:
- 간결하고 직접적인 프롬프트를 사용합니다.
- 멀티모달 기능을 활용할 수 있습니다.
- 긴 컨텍스트를 효과적으로 활용합니다.`;
  }

  /**
   * 파라미터 제안
   */
  private getSuggestedParameters(
    model: AIModel,
    taskDescription: string
  ): TaskPromptOptimization['suggestedParameters'] {
    // 기본 파라미터
    const params: TaskPromptOptimization['suggestedParameters'] = {
      temperature: 0.7,
      maxTokens: 2000,
    };

    // 코드 생성 작업
    if (/코드|code|구현|function|class/i.test(taskDescription)) {
      params.temperature = 0.3;
      params.maxTokens = 4000;
    }

    // 창의적 작업
    if (/창의|creative|아이디어|brainstorm/i.test(taskDescription)) {
      params.temperature = 0.9;
    }

    // 분석 작업
    if (/분석|analyze|검토|review/i.test(taskDescription)) {
      params.temperature = 0.5;
    }

    // 모델별 조정
    if (model.provider === 'openai') {
      params.frequencyPenalty = 0.1;
      params.presencePenalty = 0.1;
    }

    return params;
  }

  /**
   * 사용 가능한 모델 목록
   */
  getAvailableModels(provider?: AIProvider): AIModel[] {
    let models = this.models.filter(m => m.available);
    if (provider) {
      models = models.filter(m => m.provider === provider);
    }
    return models;
  }

  /**
   * 모델 정보 조회
   */
  getModelById(id: string): AIModel | undefined {
    return this.models.find(m => m.id === id);
  }

  /**
   * 제공자별 최고 모델
   */
  getBestModelByProvider(provider: AIProvider): AIModel | undefined {
    const providerModels = this.models.filter(m => m.provider === provider && m.available);
    return providerModels.sort((a, b) => b.maxContextLength - a.maxContextLength)[0];
  }

  /**
   * 비용 비교
   */
  compareCosts(
    modelIds: string[],
    inputTokens: number,
    outputTokens: number
  ): { modelId: string; cost: number }[] {
    return modelIds
      .map(id => {
        const model = this.getModelById(id);
        if (!model) return null;
        return {
          modelId: id,
          cost: this.estimateCost(model, inputTokens, outputTokens),
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => a.cost - b.cost);
  }
}

// ========================================
// Singleton Export
// ========================================

export const aiModelRecommendationService = new AIModelRecommendationService();
export default aiModelRecommendationService;
