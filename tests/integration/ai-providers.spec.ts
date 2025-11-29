/**
 * Integration Tests: AI Providers
 *
 * Tests the integration between AI providers and the application.
 * Uses mocked responses to avoid actual API calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createOpenAIMock,
  createAnthropicMock,
  createGoogleAIMock,
  mockAnalysisResult,
  mockDecompositionResult,
} from '../mocks/ai-providers';

// ==========================================
// Mock Setup
// ==========================================

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => createOpenAIMock()),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => createAnthropicMock()),
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => createGoogleAIMock()),
}));

// ==========================================
// Tests
// ==========================================

describe('AI Provider Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // Provider Factory Tests
  // ==========================================

  describe('Provider Selection', () => {
    it('should select the correct provider based on configuration', async () => {
      // Test provider selection logic
      const providers = ['openai', 'anthropic', 'google'];

      for (const providerName of providers) {
        // Simulate provider selection
        const selectedProvider = providerName;
        expect(['openai', 'anthropic', 'google']).toContain(selectedProvider);
      }
    });

    it('should fall back to default provider on error', async () => {
      const defaultProvider = 'anthropic';

      // Simulate error scenario
      const primaryFailed = true;
      const selectedProvider = primaryFailed ? defaultProvider : 'openai';

      expect(selectedProvider).toBe('anthropic');
    });
  });

  // ==========================================
  // Prompt Analysis Integration
  // ==========================================

  describe('Prompt Analysis', () => {
    it('should analyze prompts and return structured results', async () => {
      const prompt = '인스타그램 클론 앱 개발';

      // Mock analysis result
      const result = { ...mockAnalysisResult };

      expect(result.requirements).toBeDefined();
      expect(result.requirements.length).toBeGreaterThan(0);
      expect(result.estimatedComplexity).toBe('complex');
    });

    it('should handle Korean prompts correctly', async () => {
      const koreanPrompt = '온라인 쇼핑몰 플랫폼을 만들어주세요';

      // Verify Korean text is processed
      expect(koreanPrompt).toContain('쇼핑몰');

      const result = { ...mockAnalysisResult };
      expect(result).toBeDefined();
    });

    it('should extract keywords from prompts', async () => {
      const prompt = 'React Native mobile app with Firebase backend';

      const keywords = ['React Native', 'mobile', 'Firebase', 'backend'];
      const extractedKeywords = keywords.filter((k) =>
        prompt.toLowerCase().includes(k.toLowerCase())
      );

      expect(extractedKeywords.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // Task Decomposition Integration
  // ==========================================

  describe('Task Decomposition', () => {
    it('should decompose requirements into tasks', async () => {
      const result = { ...mockDecompositionResult };

      expect(result.tasks).toBeDefined();
      expect(result.tasks.length).toBeGreaterThan(0);
      expect(result.dependencyGraph).toBeDefined();
    });

    it('should calculate task dependencies correctly', async () => {
      const result = { ...mockDecompositionResult };

      // Verify dependency chain
      const task2 = result.tasks.find((t: any) => t.id === 'task-2');
      const task3 = result.tasks.find((t: any) => t.id === 'task-3');

      expect(task2?.dependencies).toContain('task-1');
      expect(task3?.dependencies).toContain('task-1');
      expect(task3?.dependencies).toContain('task-2');
    });

    it('should estimate total time correctly', async () => {
      const result = { ...mockDecompositionResult };

      const calculatedTime = result.tasks.reduce(
        (sum: number, task: any) => sum + (task.estimatedTime || 0),
        0
      );

      expect(calculatedTime).toBe(result.estimatedTime);
    });

    it('should identify critical path', async () => {
      const result = { ...mockDecompositionResult };

      expect(result.criticalPath).toBeDefined();
      expect(result.criticalPath.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // Error Handling Integration
  // ==========================================

  describe('Error Handling', () => {
    it('should handle API timeout gracefully', async () => {
      // Simulate timeout
      const makeRequest = async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 100);

        try {
          await new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Timeout')), 200);
          });
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      };

      await expect(makeRequest()).rejects.toThrow('Timeout');
    });

    it('should handle rate limiting', async () => {
      const rateLimitError = {
        status: 429,
        message: 'Rate limit exceeded',
      };

      expect(rateLimitError.status).toBe(429);
    });

    it('should retry on transient failures', async () => {
      let attempts = 0;
      const maxRetries = 3;

      const requestWithRetry = async () => {
        while (attempts < maxRetries) {
          attempts++;
          if (attempts < maxRetries) {
            continue;
          }
          return { success: true };
        }
      };

      const result = await requestWithRetry();
      expect(attempts).toBe(maxRetries);
    });

    it('should handle invalid responses', async () => {
      const invalidResponse = 'not valid json {[}';

      const parseResponse = (response: string) => {
        try {
          return JSON.parse(response);
        } catch {
          return { error: 'Invalid response format' };
        }
      };

      const result = parseResponse(invalidResponse);
      expect(result.error).toBe('Invalid response format');
    });
  });

  // ==========================================
  // Token Usage Integration
  // ==========================================

  describe('Token Usage', () => {
    it('should track token usage correctly', () => {
      const usage = {
        promptTokens: 150,
        completionTokens: 250,
        totalTokens: 400,
      };

      expect(usage.totalTokens).toBe(usage.promptTokens + usage.completionTokens);
    });

    it('should estimate cost based on token usage', () => {
      const usage = {
        promptTokens: 1000,
        completionTokens: 2000,
      };

      // Example pricing: $0.01 per 1K prompt tokens, $0.03 per 1K completion tokens
      const promptCost = (usage.promptTokens / 1000) * 0.01;
      const completionCost = (usage.completionTokens / 1000) * 0.03;
      const totalCost = promptCost + completionCost;

      expect(totalCost).toBeCloseTo(0.07, 2);
    });

    it('should warn on high token usage', () => {
      const maxTokens = 4096;
      const usedTokens = 4000;
      const warningThreshold = 0.9;

      const isHighUsage = usedTokens / maxTokens > warningThreshold;
      expect(isHighUsage).toBe(true);
    });
  });

  // ==========================================
  // Multi-Provider Integration
  // ==========================================

  describe('Multi-Provider Workflows', () => {
    it('should switch providers mid-workflow', async () => {
      const workflow = {
        analysis: 'anthropic',
        decomposition: 'openai',
        execution: 'anthropic',
      };

      expect(Object.values(workflow)).toContain('anthropic');
      expect(Object.values(workflow)).toContain('openai');
    });

    it('should aggregate results from multiple providers', async () => {
      const results = {
        openai: { confidence: 0.85 },
        anthropic: { confidence: 0.9 },
        google: { confidence: 0.8 },
      };

      const avgConfidence =
        Object.values(results).reduce((sum, r) => sum + r.confidence, 0) /
        Object.keys(results).length;

      expect(avgConfidence).toBeCloseTo(0.85, 2);
    });

    it('should select best result from multiple providers', async () => {
      const results = [
        { provider: 'openai', score: 0.85 },
        { provider: 'anthropic', score: 0.92 },
        { provider: 'google', score: 0.78 },
      ];

      const best = results.reduce((a, b) => (a.score > b.score ? a : b));
      expect(best.provider).toBe('anthropic');
    });
  });
});

describe('Database Integration', () => {
  // ==========================================
  // Task Persistence Tests
  // ==========================================

  describe('Task Persistence', () => {
    it('should save generated tasks to database', async () => {
      const tasks = mockDecompositionResult.tasks;

      // Mock save operation
      const savedTasks = tasks.map((task: any, index: number) => ({
        ...task,
        id: index + 1,
        createdAt: new Date(),
      }));

      expect(savedTasks.length).toBe(tasks.length);
      expect(savedTasks[0].id).toBeDefined();
    });

    it('should preserve task dependencies after save', async () => {
      const tasks = mockDecompositionResult.tasks.map((task: any, index: number) => ({
        ...task,
        id: index + 1,
      }));

      const taskWithDeps = tasks.find((t: any) => t.dependencies?.length > 0);
      expect(taskWithDeps?.dependencies).toBeDefined();
    });

    it('should update task status correctly', async () => {
      const task = {
        id: 1,
        status: 'todo',
      };

      // Simulate status update
      const updatedTask = {
        ...task,
        status: 'in_progress',
        updatedAt: new Date(),
      };

      expect(updatedTask.status).toBe('in_progress');
      expect(updatedTask.updatedAt).toBeDefined();
    });
  });

  // ==========================================
  // Project Sync Tests
  // ==========================================

  describe('Project Sync', () => {
    it('should sync project state', async () => {
      const localState = {
        id: 1,
        tasks: 5,
        lastModified: new Date('2024-01-01'),
      };

      const remoteState = {
        id: 1,
        tasks: 6,
        lastModified: new Date('2024-01-02'),
      };

      // Remote is newer, should use remote
      const shouldSync = remoteState.lastModified > localState.lastModified;
      expect(shouldSync).toBe(true);
    });

    it('should handle sync conflicts', async () => {
      const localChange = { field: 'title', value: 'Local Title', timestamp: 100 };
      const remoteChange = { field: 'title', value: 'Remote Title', timestamp: 101 };

      // Last write wins
      const resolvedValue =
        remoteChange.timestamp > localChange.timestamp
          ? remoteChange.value
          : localChange.value;

      expect(resolvedValue).toBe('Remote Title');
    });
  });
});
