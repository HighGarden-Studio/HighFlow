/**
 * Provider Factory
 *
 * Factory for creating and managing AI providers
 */

import type { AIProvider } from '@core/types/ai';
import { BaseAIProvider } from './BaseAIProvider';
import { ClaudeProvider } from './ClaudeProvider';
import { GPTProvider } from './GPTProvider';
import { GeminiProvider } from './GeminiProvider';
import { GroqProvider } from './GroqProvider';

export interface ProviderApiKeys {
  anthropic?: string;
  openai?: string;
  google?: string;
  groq?: string;
}

export class ProviderFactory {
  private providers: Map<AIProvider, BaseAIProvider>;

  constructor() {
    this.providers = new Map();
    this.initializeProviders();
  }

  /**
   * Initialize all providers
   */
  private initializeProviders(): void {
    this.providers.set('anthropic', new ClaudeProvider());
    this.providers.set('openai', new GPTProvider());
    this.providers.set('google', new GeminiProvider());
    this.providers.set('groq' as AIProvider, new GroqProvider());
  }

  /**
   * Set API keys for providers (called from IPC handler with settings)
   */
  setApiKeys(keys: ProviderApiKeys): void {
    if (keys.anthropic) {
      const claudeProvider = this.providers.get('anthropic') as ClaudeProvider;
      claudeProvider?.setApiKey(keys.anthropic);
    }
    if (keys.openai) {
      const gptProvider = this.providers.get('openai') as GPTProvider;
      gptProvider?.setApiKey(keys.openai);
    }
    if (keys.google) {
      const geminiProvider = this.providers.get('google') as GeminiProvider;
      geminiProvider?.setApiKey(keys.google);
    }
    if (keys.groq) {
      const groqProvider = this.providers.get('groq' as AIProvider) as GroqProvider;
      groqProvider?.setApiKey(keys.groq);
    }
  }

  /**
   * Get provider by name
   */
  async getProvider(name: AIProvider): Promise<BaseAIProvider> {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    return provider;
  }

  /**
   * Get all providers
   */
  async getAllProviders(): Promise<BaseAIProvider[]> {
    return Array.from(this.providers.values());
  }

  /**
   * Check if provider is available
   */
  isProviderAvailable(name: AIProvider): boolean {
    return this.providers.has(name);
  }

  /**
   * Get provider names
   */
  getAvailableProviders(): AIProvider[] {
    return Array.from(this.providers.keys());
  }
}
