/**
 * AI Model Analyzer
 *
 * Analyzes AI models using multimodal AI (Gemini) to generate characteristic tags.
 * Results are cached to minimize API costs.
 */

import type { ModelInfo, ModelCharacteristic, AIProvider } from '@core/types/ai';

// Cache for analyzed characteristics (in-memory) - permanent cache, no TTL
const characteristicsCache = new Map<
    string,
    {
        characteristics: ModelCharacteristic[];
        timestamp: number;
    }
>();

/**
 * Rule-based fallback when AI analysis fails or is unavailable
 */
function getRuleBasedCharacteristics(model: ModelInfo): ModelCharacteristic[] {
    const characteristics: ModelCharacteristic[] = [];

    // Cost-based tags
    const totalCost = model.costPerInputToken + model.costPerOutputToken;
    if (totalCost === 0) {
        characteristics.push('무료');
    } else if (totalCost < 0.5) {
        characteristics.push('저렴');
    } else if (totalCost > 5.0) {
        characteristics.push('비쌈');
    }

    // Speed-based tags
    if (model.averageLatency < 200) {
        characteristics.push('빠름');
    }

    // Feature-based tags
    if (model.features.includes('function_calling')) {
        characteristics.push('코딩');
    }

    // Context window based
    if (model.contextWindow < 16000) {
        characteristics.push('가벼움');
    }

    // Model name heuristics
    const nameLower = model.name.toLowerCase();
    if (
        nameLower.includes('turbo') ||
        nameLower.includes('fast') ||
        nameLower.includes('instant')
    ) {
        if (!characteristics.includes('빠름')) characteristics.push('빠름');
    }
    if (nameLower.includes('code') || nameLower.includes('coding')) {
        if (!characteristics.includes('코딩')) characteristics.push('코딩');
    }
    if (nameLower.includes('balance') || nameLower.includes('medium')) {
        characteristics.push('균형형');
    }
    if (nameLower.includes('creative') || nameLower.includes('opus')) {
        characteristics.push('창의적');
    }

    // Output type detection
    if (
        model.features.includes('vision') ||
        nameLower.includes('image') ||
        nameLower.includes('vision')
    ) {
        if (model.features.includes('vision') && !nameLower.includes('image')) {
            characteristics.push('멀티모달');
        } else {
            characteristics.push('이미지');
        }
    } else if (nameLower.includes('video')) {
        characteristics.push('비디오');
    } else if (
        nameLower.includes('audio') ||
        nameLower.includes('voice') ||
        nameLower.includes('speech')
    ) {
        characteristics.push('오디오');
    } else {
        // Default to text for standard LLMs
        characteristics.push('텍스트');
    }

    // Limit to 4 tags
    return characteristics.slice(0, 4);
}

/**
 * Analyze model using AI (Gemini 2.0 or other available provider) to generate characteristic tags
 */
async function analyzeModelWithAI(
    model: ModelInfo,
    primaryApiKey?: string,
    fallbackProviders?: { provider: string; apiKey: string; model: string }[]
): Promise<ModelCharacteristic[]> {
    try {
        // Build analysis prompt
        const costPer1M = (model.costPerInputToken + model.costPerOutputToken) * 1000000;
        const prompt = `다음 AI 모델의 특성을 분석하여 최대 3-4개의 태그로 요약해주세요.

모델명: ${model.name}
Provider: ${model.provider}
Context Window: ${model.contextWindow.toLocaleString()} tokens
비용 (입력+출력): $${costPer1M.toFixed(2)} per 1M tokens
응답 속도: ${model.averageLatency}ms
기능: ${model.features.join(', ')}

다음 태그 중에서만 선택하세요:
1. 일반 특성: 안정적, 균형형, 창의적, 글 잘씀, 논리적, 구조중심, 비판적, 검증용
2. 성능/비용: 빠름, 비용절약, 실험용, 가벼움, 비쌈, 저렴, 무료
3. 용도: 코딩, 설계강함
4. 결과물 타입 (중요!): 텍스트, 이미지, 비디오, 오디오, 멀티모달

반드시 결과물 타입 태그를 1개 이상 포함해주세요.
응답 형식: JSON 배열만 반환 (설명 없이)
예시: ["빠름", "코딩", "저렴", "텍스트"]`;

        // Try Gemini 2.0 Flash first (recommended)
        if (primaryApiKey) {
            try {
                const { GoogleGenAI } = await import('@google/genai');
                const client = new GoogleGenAI({ apiKey: primaryApiKey });

                const result = await client.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                });

                const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
                const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
                const tags = JSON.parse(cleaned) as string[];

                const validTags: ModelCharacteristic[] = [
                    '안정적',
                    '균형형',
                    '창의적',
                    '글 잘씀',
                    '논리적',
                    '구조중심',
                    '비판적',
                    '검증용',
                    '빠름',
                    '비용절약',
                    '코딩',
                    '설계강함',
                    '실험용',
                    '가벼움',
                    '비쌈',
                    '저렴',
                    '무료',
                    '텍스트',
                    '이미지',
                    '비디오',
                    '오디오',
                    '멀티모달',
                ];

                const validated = tags.filter((tag) =>
                    validTags.includes(tag as ModelCharacteristic)
                ) as ModelCharacteristic[];

                return validated.slice(0, 4);
            } catch (geminiError) {
                console.warn(
                    '[AIModelAnalyzer] Gemini failed, trying fallback providers:',
                    geminiError
                );
            }
        }

        // Try fallback providers (Groq, Claude, GPT)
        if (fallbackProviders && fallbackProviders.length > 0) {
            for (const fallback of fallbackProviders) {
                try {
                    console.log(`[AIModelAnalyzer] Trying ${fallback.provider} as fallback...`);

                    if (fallback.provider === 'groq') {
                        const Groq = (await import('groq-sdk')).default;
                        const groq = new Groq({
                            apiKey: fallback.apiKey,
                            dangerouslyAllowBrowser: true,
                        });

                        const completion = await groq.chat.completions.create({
                            messages: [{ role: 'user', content: prompt }],
                            model: fallback.model,
                            temperature: 0.3,
                        });

                        const text = completion.choices[0]?.message?.content || '';
                        const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
                        const tags = JSON.parse(cleaned) as string[];

                        const validTags: ModelCharacteristic[] = [
                            '안정적',
                            '균형형',
                            '창의적',
                            '글 잘씀',
                            '논리적',
                            '구조중심',
                            '비판적',
                            '검증용',
                            '빠름',
                            '비용절약',
                            '코딩',
                            '설계강함',
                            '실험용',
                            '가벼움',
                            '비쌈',
                            '저렴',
                            '무료',
                            '텍스트',
                            '이미지',
                            '비디오',
                            '오디오',
                            '멀티모달',
                        ];

                        const validated = tags.filter((tag) =>
                            validTags.includes(tag as ModelCharacteristic)
                        ) as ModelCharacteristic[];

                        return validated.slice(0, 4);
                    }
                    // Add more providers as needed (Claude, GPT, etc.)
                } catch (fallbackError) {
                    console.warn(`[AIModelAnalyzer] ${fallback.provider} failed:`, fallbackError);
                    continue;
                }
            }
        }

        // If all AI attempts fail, use rule-based fallback
        console.warn('[AIModelAnalyzer] All AI providers failed, using rule-based fallback');
        return getRuleBasedCharacteristics(model);
    } catch (error) {
        console.error('[AIModelAnalyzer] AI analysis failed:', error);
        return getRuleBasedCharacteristics(model);
    }
}

/**
 * Analyze a single model and return with characteristics
 */
export async function analyzeModel(
    model: ModelInfo,
    primaryApiKey?: string,
    fallbackProviders?: { provider: string; apiKey: string; model: string }[]
): Promise<ModelInfo> {
    const cacheKey = `${model.provider}:${model.name}`;

    // Check cache (permanent - no TTL)
    const cached = characteristicsCache.get(cacheKey);
    if (cached) {
        return {
            ...model,
            characteristics: cached.characteristics,
            characteristicsUpdatedAt: cached.timestamp,
        };
    }

    // Analyze with AI
    const characteristics = await analyzeModelWithAI(model, primaryApiKey, fallbackProviders);

    // Cache result
    characteristicsCache.set(cacheKey, {
        characteristics,
        timestamp: Date.now(),
    });

    return {
        ...model,
        characteristics,
        characteristicsUpdatedAt: Date.now(),
    };
}

/**
 * Analyze multiple models in a SINGLE API call (optimized)
 */
export async function analyzeModels(
    models: ModelInfo[],
    primaryApiKey?: string,
    fallbackProviders?: { provider: string; apiKey: string; model: string }[]
): Promise<ModelInfo[]> {
    // Check cache first for all models
    const results: ModelInfo[] = [];
    const uncachedModels: ModelInfo[] = [];

    for (const model of models) {
        const cacheKey = `${model.provider}:${model.name}`;
        const cached = characteristicsCache.get(cacheKey);

        if (cached) {
            results.push({
                ...model,
                characteristics: cached.characteristics,
                characteristicsUpdatedAt: cached.timestamp,
            });
        } else {
            uncachedModels.push(model);
        }
    }

    // If all cached, return immediately
    if (uncachedModels.length === 0) {
        console.log('[AIModelAnalyzer] All models already cached');
        return results;
    }

    console.log(
        `[AIModelAnalyzer] Analyzing ${uncachedModels.length} uncached models in single request`
    );

    // Build single prompt with all models
    const modelsData = uncachedModels
        .map((m, idx) => {
            const costPer1M = (m.costPerInputToken + m.costPerOutputToken) * 1000000;
            return `${idx + 1}. ${m.name} (${m.provider}) - Context: ${m.contextWindow.toLocaleString()} tokens, Cost: $${costPer1M.toFixed(2)}/1M, Speed: ${m.averageLatency}ms, Features: ${m.features.join(', ')}`;
        })
        .join('\n');

    const prompt = `다음 AI 모델들의 특성을 분석하여 각각 최대 3-4개의 태그로 요약해주세요.

모델 리스트:
${modelsData}

다음 태그 중에서만 선택하세요:
1. 일반 특성: 안정적, 균형형, 창의적, 글 잘씀, 논리적, 구조중심, 비판적, 검증용
2. 성능/비용: 빠름, 비용절약, 실험용, 가벼움, 비쌈, 저렴, 무료
3. 용도: 코딩, 설계강함
4. 결과물 타입 (중요!): 텍스트, 이미지, 비디오, 오디오, 멀티모달

반드시 결과물 타입 태그를 1개 이상 포함해주세요.
응답 형식: JSON 객체 배열만 반환 (설명 없이)
예시:
[
  {"model": "gpt-4-turbo", "tags": ["빠름", "코딩", "비쌈", "텍스트"]},
  {"model": "claude-3-opus", "tags": ["안정적", "글 잘씀", "텍스트"]},
  ...
]`;

    let analysisResults: { model: string; tags: string[] }[] = [];

    // Try Gemini first
    if (primaryApiKey) {
        try {
            const { GoogleGenAI } = await import('@google/genai');
            const client = new GoogleGenAI({ apiKey: primaryApiKey });

            const result = await client.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
            });

            const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
            analysisResults = JSON.parse(cleaned);
            console.log(
                `[AIModelAnalyzer] Gemini successfully analyzed ${analysisResults.length} models`
            );
        } catch (geminiError) {
            console.warn('[AIModelAnalyzer] Gemini failed, trying fallback:', geminiError);
        }
    }

    // Try fallback providers if Gemini failed
    if (analysisResults.length === 0 && fallbackProviders && fallbackProviders.length > 0) {
        for (const fallback of fallbackProviders) {
            try {
                console.log(`[AIModelAnalyzer] Trying ${fallback.provider} for bulk analysis...`);

                if (fallback.provider === 'groq') {
                    const Groq = (await import('groq-sdk')).default;
                    const groq = new Groq({
                        apiKey: fallback.apiKey,
                        dangerouslyAllowBrowser: true,
                    });

                    const completion = await groq.chat.completions.create({
                        messages: [{ role: 'user', content: prompt }],
                        model: fallback.model,
                        temperature: 0.3,
                    });

                    const text = completion.choices[0]?.message?.content || '';
                    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
                    analysisResults = JSON.parse(cleaned);
                    console.log(
                        `[AIModelAnalyzer] ${fallback.provider} analyzed ${analysisResults.length} models`
                    );
                    break;
                }
            } catch (fallbackError) {
                console.warn(`[AIModelAnalyzer] ${fallback.provider} failed:`, fallbackError);
                continue;
            }
        }
    }

    // Process results
    const validTags: ModelCharacteristic[] = [
        '안정적',
        '균형형',
        '창의적',
        '글 잘씀',
        '논리적',
        '구조중심',
        '비판적',
        '검증용',
        '빠름',
        '비용절약',
        '코딩',
        '설계강함',
        '실험용',
        '가벼움',
        '비쌈',
        '저렴',
        '무료',
        '텍스트',
        '이미지',
        '비디오',
        '오디오',
        '멀티모달',
    ];

    for (const uncached of uncachedModels) {
        let characteristics: ModelCharacteristic[] = [];

        // Find matching result
        const analysisResult = analysisResults.find(
            (r) =>
                r.model === uncached.name ||
                r.model.toLowerCase().includes(uncached.name.toLowerCase()) ||
                uncached.name.toLowerCase().includes(r.model.toLowerCase())
        );

        if (analysisResult) {
            // Use AI-generated tags
            characteristics = analysisResult.tags
                .filter((tag) => validTags.includes(tag as ModelCharacteristic))
                .slice(0, 4) as ModelCharacteristic[];
        }

        // Fallback to rule-based if no AI result
        if (characteristics.length === 0) {
            characteristics = getRuleBasedCharacteristics(uncached);
        }

        // Cache result
        const cacheKey = `${uncached.provider}:${uncached.name}`;
        characteristicsCache.set(cacheKey, {
            characteristics,
            timestamp: Date.now(),
        });

        results.push({
            ...uncached,
            characteristics,
            characteristicsUpdatedAt: Date.now(),
        });
    }

    return results;
}

/**
 * Get cached characteristics for a model (if available)
 */
export function getCachedCharacteristics(
    provider: AIProvider,
    modelName: string
): ModelCharacteristic[] | null {
    const cacheKey = `${provider}:${modelName}`;
    const cached = characteristicsCache.get(cacheKey);

    return cached ? cached.characteristics : null;
}

/**
 * Clear characteristics cache
 */
export function clearCharacteristicsCache(): void {
    characteristicsCache.clear();
}
