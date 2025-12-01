import type { AIProvider } from '@core/types/database';
import type { AIProviderConfig } from '../../renderer/stores/settingsStore';

/**
 * 멀티모달 지원, 성능, 가성비를 고려한 최적의 AI provider/model 선택 서비스
 */
export class AIProviderSelectionService {
    /**
     * 멀티모달 지원 provider 목록 (우선순위 순)
     */
    private readonly MULTIMODAL_PROVIDERS: Array<{
        provider: AIProvider;
        models: string[];
        priority: number; // 낮을수록 우선순위 높음
        costTier: 'budget' | 'mid' | 'premium';
    }> = [
        {
            provider: 'google',
            models: ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-pro-vision'],
            priority: 1,
            costTier: 'budget', // 가성비 최고
        },
        {
            provider: 'anthropic',
            models: [
                'claude-3-5-sonnet-20241022',
                'claude-3-5-sonnet-latest',
                'claude-3-sonnet-20240229',
            ],
            priority: 2,
            costTier: 'premium', // 성능 최고
        },
        {
            provider: 'openai',
            models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-4-vision-preview'],
            priority: 3,
            costTier: 'mid', // 중간 가성비
        },
    ];

    /**
     * 연결된 provider 중에서 최적의 provider와 model 선택
     *
     * @param connectedProviders 현재 연결된 AI provider 목록
     * @returns 선택된 provider와 model, 없으면 null
     */
    selectBestProviderAndModel(
        connectedProviders: AIProviderConfig[]
    ): { provider: AIProvider; model: string } | null {
        if (!connectedProviders || connectedProviders.length === 0) {
            return null;
        }

        // 연결된 provider ID 목록
        const connectedProviderIds = new Set(connectedProviders.map((p) => p.id as AIProvider));

        // 우선순위 순으로 멀티모달 provider 검색
        for (const multimodalProvider of this.MULTIMODAL_PROVIDERS) {
            if (connectedProviderIds.has(multimodalProvider.provider)) {
                // 연결된 provider의 설정 가져오기
                const providerConfig = connectedProviders.find(
                    (p) => p.id === multimodalProvider.provider
                );

                // Provider의 기본 모델 또는 추천 모델 선택
                const selectedModel =
                    providerConfig?.defaultModel ||
                    multimodalProvider.models[0] ||
                    `${multimodalProvider.provider}-default`;

                return {
                    provider: multimodalProvider.provider,
                    model: selectedModel,
                };
            }
        }

        // 멀티모달 provider가 없으면 첫 번째 연결된 provider 사용
        const fallbackProvider = connectedProviders[0];
        if (!fallbackProvider) {
            return null;
        }
        return {
            provider: fallbackProvider.id as AIProvider,
            model: fallbackProvider.defaultModel || `${fallbackProvider.id}-default`,
        };
    }

    /**
     * Provider의 멀티모달 지원 여부 확인
     */
    supportsMultimodal(provider: AIProvider): boolean {
        return this.MULTIMODAL_PROVIDERS.some((p) => p.provider === provider);
    }

    /**
     * Provider의 가성비 등급 가져오기
     */
    getCostTier(provider: AIProvider): 'budget' | 'mid' | 'premium' | 'unknown' {
        const found = this.MULTIMODAL_PROVIDERS.find((p) => p.provider === provider);
        return found?.costTier || 'unknown';
    }
}

// 싱글톤 인스턴스 export
export const aiProviderSelectionService = new AIProviderSelectionService();
