/**
 * AI Service Configuration
 *
 * Central configuration for AI services
 */

import type { AIProvider, AIModel } from '@core/types/ai';

export class AIServiceConfig {
  /**
   * Default AI provider
   */
  static readonly DEFAULT_PROVIDER: AIProvider = 'anthropic';

  /**
   * Default models per provider
   */
  static readonly DEFAULT_MODELS: Record<AIProvider, AIModel> = {
    anthropic: 'claude-3-5-sonnet-20250219',
    openai: 'gpt-4-turbo',
    google: 'gemini-1.5-pro',
    'claude-code': 'claude-3-5-sonnet-20250219',
    antigravity: 'antigravity-pro',
    codex: 'codex-latest',
    local: 'gpt-3.5-turbo', // Placeholder
  };

  /**
   * Model pricing (cost per 1M tokens)
   */
  static readonly MODEL_PRICING: Record<AIModel, { input: number; output: number }> = {
    // Anthropic Claude
    'claude-3-5-sonnet-20250219': { input: 3.0, output: 15.0 },
    'claude-3-opus-20240229': { input: 15.0, output: 75.0 },
    'claude-3-sonnet-20240229': { input: 3.0, output: 15.0 },
    'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },

    // OpenAI GPT
    'gpt-4-turbo': { input: 10.0, output: 30.0 },
    'gpt-4': { input: 30.0, output: 60.0 },
    'gpt-3.5-turbo': { input: 0.5, output: 1.5 },

    // Google Gemini
    'gemini-1.5-pro': { input: 3.5, output: 10.5 },
    'gemini-1.5-flash': { input: 0.075, output: 0.3 },
    'gemini-pro': { input: 0.5, output: 1.5 },

    // Antigravity
    'antigravity-pro': { input: 5.0, output: 20.0 },
    'antigravity-standard': { input: 2.0, output: 8.0 },

    // Codex
    'codex-latest': { input: 4.0, output: 16.0 },
    'codex-standard': { input: 1.5, output: 6.0 },
  };

  /**
   * Max retries for failed requests
   */
  static readonly MAX_RETRIES = 3;

  /**
   * Retry delay in milliseconds
   */
  static readonly RETRY_DELAY_MS = 1000;

  /**
   * Request timeout in milliseconds
   */
  static readonly REQUEST_TIMEOUT_MS = 120000; // 2 minutes

  /**
   * Maximum tokens for different operation types
   */
  static readonly MAX_TOKENS_BY_OPERATION = {
    analysis: 4000,
    generation: 2000,
    decomposition: 4000,
    synthesis: 2500,
    recommendation: 1500,
    quick: 1000,
  };

  /**
   * Temperature settings by task type
   */
  static readonly TEMPERATURE_BY_TASK = {
    creative: 0.9,
    balanced: 0.7,
    factual: 0.3,
    precise: 0.1,
  };

  /**
   * Provider selection weights
   */
  static readonly PROVIDER_WEIGHTS = {
    cost: 0.4,
    speed: 0.3,
    quality: 0.3,
  };

  /**
   * Check if API key is configured for provider
   */
  static isProviderConfigured(provider: AIProvider): boolean {
    switch (provider) {
      case 'anthropic':
        return !!process.env.ANTHROPIC_API_KEY;
      case 'openai':
        return !!process.env.OPENAI_API_KEY;
      case 'google':
        return !!process.env.GOOGLE_API_KEY;
      default:
        return false;
    }
  }

  /**
   * Get available providers
   */
  static getAvailableProviders(): AIProvider[] {
    return (['anthropic', 'openai', 'google'] as AIProvider[]).filter((provider) =>
      this.isProviderConfigured(provider)
    );
  }

  /**
   * Get fallback provider if primary is unavailable
   */
  static getFallbackProvider(primary: AIProvider): AIProvider | null {
    const available = this.getAvailableProviders();
    return available.find((p) => p !== primary) || null;
  }

  /**
   * Estimate cost for operation
   */
  static estimateCost(
    model: AIModel,
    estimatedInputTokens: number,
    estimatedOutputTokens: number
  ): number {
    const pricing = this.MODEL_PRICING[model];
    if (!pricing) return 0;

    const inputCost = (estimatedInputTokens / 1000000) * pricing.input;
    const outputCost = (estimatedOutputTokens / 1000000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Select best model for budget constraint
   */
  static selectModelForBudget(
    provider: AIProvider,
    maxCost: number,
    estimatedTokens: number
  ): AIModel {
    const models = Object.entries(this.MODEL_PRICING)
      .filter(([model]) => model.includes(provider === 'anthropic' ? 'claude' : provider === 'openai' ? 'gpt' : 'gemini'))
      .map(([model, pricing]) => ({
        model: model as AIModel,
        cost: ((estimatedTokens / 1000000) * (pricing.input + pricing.output)) / 2,
      }))
      .filter((m) => m.cost <= maxCost)
      .sort((a, b) => b.cost - a.cost); // Prefer more expensive (better) models within budget

    return models[0]?.model || this.DEFAULT_MODELS[provider];
  }
}
