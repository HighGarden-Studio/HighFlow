/**
 * AI Provider Mocks
 *
 * Mock implementations for AI providers used in testing.
 */

import { vi } from 'vitest';

// ==========================================
// OpenAI Mock
// ==========================================

export const mockOpenAIResponse = {
  id: 'chatcmpl-test-id',
  object: 'chat.completion',
  created: Date.now(),
  model: 'gpt-4',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'This is a mock AI response',
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30,
  },
};

export const mockOpenAIStreamResponse = {
  async *[Symbol.asyncIterator]() {
    yield {
      choices: [
        {
          delta: { content: 'This ' },
          index: 0,
          finish_reason: null,
        },
      ],
    };
    yield {
      choices: [
        {
          delta: { content: 'is ' },
          index: 0,
          finish_reason: null,
        },
      ],
    };
    yield {
      choices: [
        {
          delta: { content: 'streamed' },
          index: 0,
          finish_reason: 'stop',
        },
      ],
    };
  },
};

export const createOpenAIMock = () => ({
  chat: {
    completions: {
      create: vi.fn().mockResolvedValue(mockOpenAIResponse),
    },
  },
});

// ==========================================
// Anthropic Mock
// ==========================================

export const mockAnthropicResponse = {
  id: 'msg-test-id',
  type: 'message',
  role: 'assistant',
  content: [
    {
      type: 'text',
      text: 'This is a mock Claude response',
    },
  ],
  model: 'claude-3-sonnet-20240229',
  stop_reason: 'end_turn',
  usage: {
    input_tokens: 10,
    output_tokens: 20,
  },
};

export const mockAnthropicStreamResponse = {
  async *[Symbol.asyncIterator]() {
    yield {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    };
    yield {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'This ' },
    };
    yield {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'is ' },
    };
    yield {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'streamed' },
    };
    yield {
      type: 'message_stop',
    };
  },
};

export const createAnthropicMock = () => ({
  messages: {
    create: vi.fn().mockResolvedValue(mockAnthropicResponse),
  },
});

// ==========================================
// Google AI Mock
// ==========================================

export const mockGoogleAIResponse = {
  response: {
    text: () => 'This is a mock Gemini response',
    candidates: [
      {
        content: {
          parts: [{ text: 'This is a mock Gemini response' }],
          role: 'model',
        },
        finishReason: 'STOP',
      },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      totalTokenCount: 30,
    },
  },
};

export const createGoogleAIMock = () => ({
  getGenerativeModel: vi.fn().mockReturnValue({
    generateContent: vi.fn().mockResolvedValue(mockGoogleAIResponse),
    startChat: vi.fn().mockReturnValue({
      sendMessage: vi.fn().mockResolvedValue(mockGoogleAIResponse),
    }),
  }),
});

// ==========================================
// Unified AI Mock Factory
// ==========================================

export interface MockAIOptions {
  provider: 'openai' | 'anthropic' | 'google';
  responseContent?: string;
  shouldFail?: boolean;
  errorMessage?: string;
  delay?: number;
}

export const createAIMock = (options: MockAIOptions) => {
  const { provider, responseContent, shouldFail, errorMessage, delay = 0 } = options;

  const mockResponse = (content: string) => {
    switch (provider) {
      case 'openai':
        return {
          ...mockOpenAIResponse,
          choices: [
            {
              ...mockOpenAIResponse.choices[0],
              message: { role: 'assistant', content },
            },
          ],
        };
      case 'anthropic':
        return {
          ...mockAnthropicResponse,
          content: [{ type: 'text', text: content }],
        };
      case 'google':
        return {
          response: {
            text: () => content,
            candidates: [
              {
                content: { parts: [{ text: content }], role: 'model' },
                finishReason: 'STOP',
              },
            ],
          },
        };
    }
  };

  const createMock = () => {
    if (shouldFail) {
      return vi.fn().mockRejectedValue(new Error(errorMessage || 'AI request failed'));
    }

    const response = mockResponse(responseContent || 'Mock AI response');

    if (delay > 0) {
      return vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(response), delay))
      );
    }

    return vi.fn().mockResolvedValue(response);
  };

  return createMock();
};

// ==========================================
// AI Analysis Response Mocks
// ==========================================

export const mockAnalysisResult = {
  requirements: [
    {
      id: 'req-1',
      title: '사용자 인증',
      description: '이메일/비밀번호 및 소셜 로그인 지원',
      priority: 'high',
      complexity: 'medium',
    },
    {
      id: 'req-2',
      title: '콘텐츠 관리',
      description: '사진/동영상 업로드 및 피드 표시',
      priority: 'high',
      complexity: 'high',
    },
  ],
  estimatedComplexity: 'complex' as const,
  suggestedTemplates: ['social-media', 'mobile-first'],
  followUpQuestions: [
    '어떤 종류의 콘텐츠를 주로 공유하나요?',
    '실시간 알림이 필요한가요?',
  ],
};

export const mockDecompositionResult = {
  tasks: [
    {
      id: 'task-1',
      title: '프로젝트 초기 설정',
      description: '개발 환경 및 기본 구조 설정',
      estimatedTime: 4,
      dependencies: [],
      priority: 'high',
    },
    {
      id: 'task-2',
      title: '인증 시스템 구현',
      description: '사용자 인증 및 세션 관리',
      estimatedTime: 8,
      dependencies: ['task-1'],
      priority: 'high',
    },
    {
      id: 'task-3',
      title: 'API 엔드포인트 개발',
      description: 'RESTful API 설계 및 구현',
      estimatedTime: 12,
      dependencies: ['task-1', 'task-2'],
      priority: 'medium',
    },
  ],
  dependencyGraph: {
    'task-1': [],
    'task-2': ['task-1'],
    'task-3': ['task-1', 'task-2'],
  },
  estimatedTime: 24,
  criticalPath: ['task-1', 'task-2', 'task-3'],
};

export const mockExecutionResult = {
  success: true,
  output: {
    code: `// Generated code
export function authenticate(email: string, password: string) {
  // Implementation
}`,
    files: [
      { path: 'src/auth/authenticate.ts', content: '...' },
      { path: 'src/auth/types.ts', content: '...' },
    ],
    summary: '인증 기능이 성공적으로 구현되었습니다.',
  },
  metrics: {
    tokensUsed: 1500,
    executionTime: 3500,
    iterationsCount: 2,
  },
};
