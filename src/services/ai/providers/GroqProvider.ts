/**
 * Groq Provider
 *
 * Groq AI provider implementation using OpenAI-compatible API
 */

import OpenAI from 'openai';
import { BaseAIProvider } from './BaseAIProvider';
import type {
  AIProvider,
  AIConfig,
  ExecutionContext,
  AIResponse,
  StreamChunk,
  AIFeature,
  Capability,
  ModelInfo,
  AIMessage,
  AiResult,
} from '@core/types/ai';
import { detectTextSubType } from '../utils/aiResultUtils';

export class GroqProvider extends BaseAIProvider {
  readonly name: AIProvider = 'groq' as AIProvider;
  readonly models: ModelInfo[] = [
    {
      name: 'llama-3.3-70b-versatile',
      provider: 'groq' as AIProvider,
      contextWindow: 128000,
      maxOutputTokens: 32768,
      costPerInputToken: 0.59,
      costPerOutputToken: 0.79,
      averageLatency: 300,
      features: ['streaming', 'function_calling', 'system_prompt'],
      bestFor: ['Fast responses', 'General purpose', 'Code generation'],
    },
    {
      name: 'llama-3.1-70b-versatile',
      provider: 'groq' as AIProvider,
      contextWindow: 128000,
      maxOutputTokens: 8192,
      costPerInputToken: 0.59,
      costPerOutputToken: 0.79,
      averageLatency: 300,
      features: ['streaming', 'function_calling', 'system_prompt'],
      bestFor: ['Fast responses', 'General purpose', 'Code generation'],
    },
    {
      name: 'llama-3.1-8b-instant',
      provider: 'groq' as AIProvider,
      contextWindow: 128000,
      maxOutputTokens: 8192,
      costPerInputToken: 0.05,
      costPerOutputToken: 0.08,
      averageLatency: 100,
      features: ['streaming', 'function_calling', 'system_prompt'],
      bestFor: ['Ultra-fast responses', 'Simple tasks', 'High volume'],
    },
    {
      name: 'mixtral-8x7b-32768',
      provider: 'groq' as AIProvider,
      contextWindow: 32768,
      maxOutputTokens: 8192,
      costPerInputToken: 0.24,
      costPerOutputToken: 0.24,
      averageLatency: 200,
      features: ['streaming', 'function_calling', 'system_prompt'],
      bestFor: ['Balanced performance', 'Code tasks', 'Long context'],
    },
    {
      name: 'gemma2-9b-it',
      provider: 'groq' as AIProvider,
      contextWindow: 8192,
      maxOutputTokens: 8192,
      costPerInputToken: 0.20,
      costPerOutputToken: 0.20,
      averageLatency: 150,
      features: ['streaming', 'system_prompt'],
      bestFor: ['Fast responses', 'Instruction following'],
    },
  ];

  private client: OpenAI | null = null;
  private injectedApiKey: string | null = null;

  /**
   * Set API key from external source (e.g., settings store via IPC)
   */
  setApiKey(apiKey: string): void {
    this.injectedApiKey = apiKey;
    this.client = null; // Reset client to use new key
  }

  async generateText(
    messages: AIMessage[],
    config: AIConfig,
    context?: ExecutionContext
  ): Promise<AiResult> {
    this.validateConfig(config);
    const client = this.getClient();
    const openAiMessages = this.buildChatMessages(messages, config, context);

    const response = await client.chat.completions.create({
      model: config.model,
      messages: openAiMessages,
      max_tokens: config.maxTokens || 4096,
      temperature: config.temperature,
      top_p: config.topP,
      stop: config.stopSequences,
    });

    const content = response.choices[0]?.message?.content || '';
    const detection = detectTextSubType(content);

    return {
      kind: detection.kind,
      subType: detection.subType,
      format: 'plain',
      value: content,
      mime: detection.mime,
      meta: {
        ...(detection.meta || {}),
        provider: this.name,
        model: config.model,
        finishReason: response.choices[0]?.finish_reason,
      },
      raw: response,
    };
  }

  private buildChatMessages(
    messages: AIMessage[],
    config: AIConfig,
    context?: ExecutionContext
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const systemPrompt = `${this.buildSystemPrompt(config, context)}\nYou must respond in valid JSON whenever possible. If JSON is not feasible, return a concise answer.`.trim();
    const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (systemPrompt) {
      openAiMessages.push({ role: 'system', content: systemPrompt });
    }
    for (const message of messages) {
      openAiMessages.push({
        role: message.role,
        content: message.content,
      } as OpenAI.Chat.ChatCompletionMessageParam);
    }
    return openAiMessages;
  }

  /**
   * Initialize Groq client (OpenAI-compatible)
   */
  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.injectedApiKey || process.env.GROQ_API_KEY;
      if (!apiKey) {
        throw new Error('GROQ_API_KEY not configured. Please set your API key in Settings > AI Providers.');
      }
      this.client = new OpenAI({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });
    }
    return this.client;
  }

  /**
   * Execute prompt with Groq
   */
  async execute(
    prompt: string,
    config: AIConfig,
    context?: ExecutionContext
  ): Promise<AIResponse> {
    this.validateConfig(config);

    const startTime = Date.now();
    const client = this.getClient();

    return this.executeWithRetry(async () => {
      const systemPrompt = this.buildSystemPrompt(config, context);

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

      if (systemPrompt) {
        messages.push({
          role: 'system',
          content: systemPrompt,
        });
      }

      messages.push({
        role: 'user',
        content: prompt,
      });

      const response = await client.chat.completions.create({
        model: config.model,
        messages,
        max_tokens: config.maxTokens || 4096,
        temperature: config.temperature,
        top_p: config.topP,
        stop: config.stopSequences,
      });

      const duration = Date.now() - startTime;
      const tokensUsed = {
        prompt: response.usage?.prompt_tokens || 0,
        completion: response.usage?.completion_tokens || 0,
        total: response.usage?.total_tokens || 0,
      };

      const cost = this.calculateCost(
        { prompt: tokensUsed.prompt, completion: tokensUsed.completion },
        config.model
      );

      const content = response.choices[0]?.message?.content || '';

      this.logMetrics('execute', {
        tokensUsed: tokensUsed.total,
        cost,
        duration,
        model: config.model,
      });

      return {
        content,
        tokensUsed,
        cost,
        duration,
        model: config.model,
        finishReason: this.mapFinishReason(response.choices[0]?.finish_reason),
        metadata: {
          id: response.id,
          model: response.model,
          finishReason: response.choices[0]?.finish_reason,
        },
      };
    });
  }

  /**
   * Execute with streaming
   */
  async *streamExecute(
    prompt: string,
    config: AIConfig,
    onToken: (token: string) => void,
    context?: ExecutionContext
  ): AsyncGenerator<StreamChunk> {
    this.validateConfig(config);

    const client = this.getClient();
    const systemPrompt = this.buildSystemPrompt(config, context);

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    messages.push({
      role: 'user',
      content: prompt,
    });

    const stream = await client.chat.completions.create({
      model: config.model,
      messages,
      max_tokens: config.maxTokens || 4096,
      temperature: config.temperature,
      top_p: config.topP,
      stream: true,
    });

    let accumulated = '';

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        accumulated += delta;
        onToken(delta);

        yield {
          delta,
          accumulated,
          done: false,
        };
      }

      if (chunk.choices[0]?.finish_reason) {
        yield {
          delta: '',
          accumulated,
          done: true,
          metadata: {
            finishReason: chunk.choices[0].finish_reason,
          },
        };
      }
    }
  }

  /**
   * Get supported features
   */
  getSupportedFeatures(): AIFeature[] {
    return ['streaming', 'function_calling', 'system_prompt'];
  }

  /**
   * Get capabilities
   */
  getCapabilities(): Capability[] {
    return [
      {
        name: 'Ultra-Fast Inference',
        description: 'Industry-leading inference speed with LPU technology',
        supported: true,
      },
      {
        name: 'Large Context',
        description: 'Supports up to 128K token context window',
        supported: true,
      },
      {
        name: 'Function Calling',
        description: 'Tool use and function calling support',
        supported: true,
      },
      {
        name: 'Streaming',
        description: 'Real-time token streaming',
        supported: true,
      },
      {
        name: 'Vision',
        description: 'Image analysis capabilities',
        supported: false,
        limitations: ['Not yet supported'],
      },
      {
        name: 'JSON Mode',
        description: 'Structured JSON output',
        supported: false,
        limitations: ['Requires prompt engineering'],
      },
    ];
  }

  /**
   * Map finish reason to standard finish reason
   */
  private mapFinishReason(finishReason: string | null | undefined): AIResponse['finishReason'] {
    switch (finishReason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'stop';
    }
  }
}
