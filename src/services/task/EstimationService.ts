/**
 * Estimation Service
 *
 * Provides AI-powered time and cost estimation for tasks
 * based on task content, complexity, and historical data.
 */

// ========================================
// Types
// ========================================

export interface TimeEstimation {
    estimatedMinutes: number;
    confidence: number; // 0-1
    breakdown: {
        phase: string;
        minutes: number;
        description: string;
    }[];
    reasoning: string;
}

export interface CostEstimation {
    estimatedCost: number;
    currency: string;
    breakdown: {
        component: string;
        cost: number;
        description: string;
    }[];
    reasoning: string;
}

export interface TaskComplexity {
    level: 'simple' | 'moderate' | 'complex' | 'very_complex';
    score: number; // 1-10
    factors: string[];
}

export interface EstimationResult {
    time: TimeEstimation;
    cost: CostEstimation;
    complexity: TaskComplexity;
    suggestions: string[];
}

// ========================================
// AI Provider Cost Data
// ========================================

const AI_PROVIDER_COSTS = {
    anthropic: {
        'claude-opus-4': { input: 15.0, output: 75.0 }, // per million tokens
        'claude-sonnet-4': { input: 3.0, output: 15.0 },
        'claude-3.5-sonnet': { input: 3.0, output: 15.0 },
        'claude-3-haiku': { input: 0.25, output: 1.25 },
    },
    openai: {
        'gpt-4o': { input: 2.5, output: 10.0 },
        'gpt-4-turbo': { input: 10.0, output: 30.0 },
        'gpt-4': { input: 30.0, output: 60.0 },
        'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
        o1: { input: 15.0, output: 60.0 },
        'o1-mini': { input: 3.0, output: 12.0 },
    },
    google: {
        'gemini-2.5-pro': { input: 1.25, output: 5.0 },
        'gemini-2.5-flash': { input: 0.075, output: 0.3 },
        'gemini-2.0-flash': { input: 0.1, output: 0.4 },
    },
} as const;

// Task complexity factors
const COMPLEXITY_INDICATORS = {
    high: [
        'integration',
        'architecture',
        'security',
        'migration',
        'authentication',
        'oauth',
        'database',
        'real-time',
        'websocket',
        'performance',
        'optimization',
        'scale',
        'distributed',
        'microservice',
        'api',
        'graphql',
        '통합',
        '아키텍처',
        '보안',
        '마이그레이션',
        '인증',
        '최적화',
    ],
    medium: [
        'component',
        'feature',
        'refactor',
        'test',
        'ui',
        'form',
        'validation',
        'crud',
        'styling',
        'responsive',
        '컴포넌트',
        '기능',
        '리팩토링',
        '테스트',
        '화면',
    ],
    low: [
        'fix',
        'bug',
        'typo',
        'update',
        'docs',
        'readme',
        'comment',
        'cleanup',
        'style',
        'format',
        '수정',
        '버그',
        '문서',
        '정리',
        '스타일',
    ],
};

// ========================================
// Estimation Service
// ========================================

export class EstimationService {
    /**
     * Estimate time and cost for a task
     */
    estimateTask(
        title: string,
        description: string,
        aiProvider?: string,
        aiModel?: string
    ): EstimationResult {
        const complexity = this.analyzeComplexity(title, description);
        const time = this.estimateTime(title, description, complexity);
        const cost = this.estimateCost(title, description, complexity, aiProvider, aiModel);
        const suggestions = this.generateSuggestions(complexity, time, cost);

        return { time, cost, complexity, suggestions };
    }

    /**
     * Analyze task complexity
     */
    analyzeComplexity(title: string, description: string): TaskComplexity {
        const text = `${title} ${description || ''}`.toLowerCase();
        const factors: string[] = [];
        let score = 5; // Base score

        // Check high complexity indicators
        for (const indicator of COMPLEXITY_INDICATORS.high) {
            if (text.includes(indicator.toLowerCase())) {
                score += 1.5;
                factors.push(`고복잡도 키워드: "${indicator}"`);
            }
        }

        // Check medium complexity indicators
        for (const indicator of COMPLEXITY_INDICATORS.medium) {
            if (text.includes(indicator.toLowerCase())) {
                score += 0.5;
                factors.push(`중복잡도 키워드: "${indicator}"`);
            }
        }

        // Check low complexity indicators
        for (const indicator of COMPLEXITY_INDICATORS.low) {
            if (text.includes(indicator.toLowerCase())) {
                score -= 0.5;
                factors.push(`저복잡도 키워드: "${indicator}"`);
            }
        }

        // Text length factor
        const wordCount = text.split(/\s+/).length;
        if (wordCount > 50) {
            score += 1;
            factors.push('상세한 설명 (50+ 단어)');
        }

        // Clamp score
        score = Math.max(1, Math.min(10, score));

        // Determine level
        let level: TaskComplexity['level'];
        if (score >= 8) level = 'very_complex';
        else if (score >= 6) level = 'complex';
        else if (score >= 4) level = 'moderate';
        else level = 'simple';

        return { level, score, factors };
    }

    /**
     * Estimate time based on complexity
     */
    estimateTime(_title: string, description: string, complexity: TaskComplexity): TimeEstimation {
        // Base time by complexity (in minutes)
        const baseTimeMap = {
            simple: 60, // 1 hour
            moderate: 240, // 4 hours
            complex: 480, // 8 hours
            very_complex: 960, // 16 hours
        };

        const baseMinutes = baseTimeMap[complexity.level];
        const breakdown: TimeEstimation['breakdown'] = [];

        // Calculate phase breakdown
        if (complexity.level === 'simple') {
            breakdown.push(
                {
                    phase: '분석',
                    minutes: Math.round(baseMinutes * 0.1),
                    description: '요구사항 확인',
                },
                { phase: '구현', minutes: Math.round(baseMinutes * 0.7), description: '기능 구현' },
                {
                    phase: '테스트',
                    minutes: Math.round(baseMinutes * 0.2),
                    description: '기본 테스트',
                }
            );
        } else if (complexity.level === 'moderate') {
            breakdown.push(
                {
                    phase: '분석',
                    minutes: Math.round(baseMinutes * 0.15),
                    description: '요구사항 분석 및 설계',
                },
                { phase: '구현', minutes: Math.round(baseMinutes * 0.6), description: '기능 구현' },
                {
                    phase: '테스트',
                    minutes: Math.round(baseMinutes * 0.15),
                    description: '테스트 및 검증',
                },
                { phase: '리뷰', minutes: Math.round(baseMinutes * 0.1), description: '코드 리뷰' }
            );
        } else if (complexity.level === 'complex') {
            breakdown.push(
                {
                    phase: '분석/설계',
                    minutes: Math.round(baseMinutes * 0.2),
                    description: '상세 요구사항 분석 및 설계',
                },
                { phase: '구현', minutes: Math.round(baseMinutes * 0.5), description: '기능 구현' },
                {
                    phase: '테스트',
                    minutes: Math.round(baseMinutes * 0.2),
                    description: '테스트 작성 및 실행',
                },
                {
                    phase: '리뷰/QA',
                    minutes: Math.round(baseMinutes * 0.1),
                    description: '코드 리뷰 및 QA',
                }
            );
        } else {
            breakdown.push(
                {
                    phase: '분석/설계',
                    minutes: Math.round(baseMinutes * 0.25),
                    description: '상세 분석, 아키텍처 설계',
                },
                {
                    phase: '프로토타입',
                    minutes: Math.round(baseMinutes * 0.15),
                    description: '프로토타입 개발',
                },
                { phase: '구현', minutes: Math.round(baseMinutes * 0.4), description: '본격 구현' },
                {
                    phase: '테스트',
                    minutes: Math.round(baseMinutes * 0.15),
                    description: '테스트 및 검증',
                },
                { phase: '문서화', minutes: Math.round(baseMinutes * 0.05), description: '문서화' }
            );
        }

        // Calculate confidence based on description quality
        const descLength = (description || '').length;
        let confidence = 0.6;
        if (descLength > 200) confidence = 0.8;
        if (descLength > 500) confidence = 0.9;

        const estimatedMinutes = breakdown.reduce((sum, b) => sum + b.minutes, 0);

        return {
            estimatedMinutes,
            confidence,
            breakdown,
            reasoning: this.generateTimeReasoning(complexity, estimatedMinutes, confidence),
        };
    }

    /**
     * Estimate cost based on AI provider usage
     */
    estimateCost(
        _title: string,
        _description: string,
        complexity: TaskComplexity,
        aiProvider?: string,
        aiModel?: string
    ): CostEstimation {
        const breakdown: CostEstimation['breakdown'] = [];

        // Estimate token usage based on complexity
        const tokenMultiplier = {
            simple: 1,
            moderate: 2,
            complex: 4,
            very_complex: 8,
        };

        const baseInputTokens = 2000; // Base tokens for prompt
        const baseOutputTokens = 4000; // Base tokens for response
        const multiplier = tokenMultiplier[complexity.level];

        const estimatedInputTokens = baseInputTokens * multiplier;
        const estimatedOutputTokens = baseOutputTokens * multiplier;

        // Get cost rates
        let inputCost = 0;
        let outputCost = 0;
        const modelName = aiModel || 'claude-sonnet-4';
        const providerName = aiProvider || 'anthropic';

        const providerCosts = AI_PROVIDER_COSTS[providerName as keyof typeof AI_PROVIDER_COSTS];
        if (providerCosts) {
            const modelCosts = (providerCosts as any)[modelName] || Object.values(providerCosts)[0];
            if (modelCosts) {
                inputCost = (estimatedInputTokens / 1_000_000) * (modelCosts as any).input;
                outputCost = (estimatedOutputTokens / 1_000_000) * (modelCosts as any).output;
            }
        }

        breakdown.push({
            component: 'AI 입력 토큰',
            cost: inputCost,
            description: `약 ${estimatedInputTokens.toLocaleString()} 토큰 (프롬프트)`,
        });
        breakdown.push({
            component: 'AI 출력 토큰',
            cost: outputCost,
            description: `약 ${estimatedOutputTokens.toLocaleString()} 토큰 (응답)`,
        });

        // Add buffer for retries/iterations
        const retryBuffer = (inputCost + outputCost) * 0.2;
        breakdown.push({
            component: '재시도/반복 버퍼',
            cost: retryBuffer,
            description: '예상 재시도 비용 (20%)',
        });

        const totalCost = inputCost + outputCost + retryBuffer;

        return {
            estimatedCost: Math.round(totalCost * 100) / 100,
            currency: 'USD',
            breakdown,
            reasoning: this.generateCostReasoning(complexity, totalCost, providerName, modelName),
        };
    }

    /**
     * Generate time reasoning text
     */
    private generateTimeReasoning(
        complexity: TaskComplexity,
        minutes: number,
        confidence: number
    ): string {
        const hours = Math.round((minutes / 60) * 10) / 10;
        const levelText = {
            simple: '단순',
            moderate: '보통',
            complex: '복잡',
            very_complex: '매우 복잡',
        }[complexity.level];

        return (
            `이 작업은 "${levelText}" 수준으로 평가되어 약 ${hours}시간이 소요될 것으로 예상됩니다. ` +
            `신뢰도는 ${Math.round(confidence * 100)}%입니다. ` +
            (complexity.factors.length > 0
                ? `주요 요인: ${complexity.factors.slice(0, 3).join(', ')}`
                : '')
        );
    }

    /**
     * Generate cost reasoning text
     */
    private generateCostReasoning(
        complexity: TaskComplexity,
        totalCost: number,
        provider: string,
        model: string
    ): string {
        return (
            `${provider}의 ${model} 모델 사용 시 예상 비용은 약 $${totalCost.toFixed(2)}입니다. ` +
            `복잡도가 "${complexity.level}"으로 평가되어 토큰 사용량이 조정되었습니다.`
        );
    }

    /**
     * Generate suggestions based on estimation
     */
    private generateSuggestions(
        complexity: TaskComplexity,
        time: TimeEstimation,
        cost: CostEstimation
    ): string[] {
        const suggestions: string[] = [];

        if (complexity.level === 'very_complex') {
            suggestions.push('복잡한 작업입니다. 서브태스크로 세분화하는 것을 권장합니다.');
        }

        if (time.confidence < 0.7) {
            suggestions.push('설명을 더 상세하게 작성하면 정확한 추정이 가능합니다.');
        }

        if (cost.estimatedCost > 1) {
            suggestions.push(
                '비용 절감을 위해 더 저렴한 모델 (Claude Haiku, GPT-3.5) 고려해보세요.'
            );
        }

        if (time.estimatedMinutes > 480) {
            suggestions.push('8시간 이상 소요 예상됩니다. 마일스톤을 설정하세요.');
        }

        return suggestions;
    }

    /**
     * Quick estimate for display
     */
    quickEstimate(title: string): { minutes: number; cost: number } {
        const complexity = this.analyzeComplexity(title, '');
        const baseMinutes = {
            simple: 60,
            moderate: 240,
            complex: 480,
            very_complex: 960,
        }[complexity.level];

        const baseCost = {
            simple: 0.05,
            moderate: 0.15,
            complex: 0.5,
            very_complex: 1.5,
        }[complexity.level];

        return { minutes: baseMinutes, cost: baseCost };
    }
}

// ========================================
// Singleton Export
// ========================================

export const estimationService = new EstimationService();
export default estimationService;
