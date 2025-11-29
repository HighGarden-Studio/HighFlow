/**
 * TaskSubdivisionService Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskSubdivisionService, taskSubdivisionService } from './TaskSubdivisionService';
import type { Task } from '@core/types/database';

// ==========================================
// Test Data
// ==========================================

const createMockTask = (overrides: Partial<Task> = {}): Task => ({
  id: 'task-1',
  projectId: 'project-1',
  title: 'Implement User Authentication',
  description: 'Create a complete user authentication system with login, registration, and password reset',
  status: 'todo',
  priority: 'high',
  estimatedMinutes: 480, // 8 hours
  tags: ['backend', 'security', 'auth'],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ==========================================
// Tests
// ==========================================

describe('TaskSubdivisionService', () => {
  let service: TaskSubdivisionService;

  beforeEach(() => {
    service = new TaskSubdivisionService();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================
  // suggestSubdivision Tests
  // ==========================================

  describe('suggestSubdivision', () => {
    it('should return subdivision suggestions for a task', async () => {
      const task = createMockTask();

      // Fast-forward through the simulated AI processing
      const resultPromise = service.suggestSubdivision(task);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      expect(result).toBeDefined();
      expect(result.subtasks).toBeInstanceOf(Array);
      expect(result.subtasks.length).toBeGreaterThan(0);
      expect(result.reasoning).toBeTruthy();
      expect(result.totalEstimatedMinutes).toBeGreaterThan(0);
    });

    it('should generate more subtasks for complex tasks', async () => {
      const complexTask = createMockTask({
        title: 'Build Complete E-commerce Platform with Payment Integration and Inventory Management',
        description: 'Develop a full-featured e-commerce platform including user management, product catalog, shopping cart, checkout process, payment gateway integration, and inventory management system',
        estimatedMinutes: 2400, // 40 hours
      });

      const resultPromise = service.suggestSubdivision(complexTask);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      expect(result.subtasks.length).toBeGreaterThanOrEqual(4);
    });

    it('should generate fewer subtasks for simple tasks', async () => {
      const simpleTask = createMockTask({
        title: 'Fix button',
        description: 'Update button color',
        estimatedMinutes: 30,
        tags: ['ui'],
      });

      const resultPromise = service.suggestSubdivision(simpleTask);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      expect(result.subtasks.length).toBeLessThanOrEqual(3);
    });

    it('should include tags from the original task', async () => {
      const task = createMockTask({
        tags: ['frontend', 'react', 'testing'],
      });

      const resultPromise = service.suggestSubdivision(task);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      // Each subtask should include at least some of the original tags
      result.subtasks.forEach(subtask => {
        expect(subtask.tags).toBeDefined();
      });
    });

    it('should distribute estimated time across subtasks', async () => {
      const task = createMockTask({
        estimatedMinutes: 600, // 10 hours
      });

      const resultPromise = service.suggestSubdivision(task);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      // Total time should be roughly equal to original estimate
      const totalSubtaskTime = result.subtasks.reduce(
        (sum, st) => sum + (st.estimatedMinutes || 0),
        0
      );

      // Allow some variance due to weighting
      expect(totalSubtaskTime).toBeGreaterThan(task.estimatedMinutes! * 0.8);
      expect(totalSubtaskTime).toBeLessThan(task.estimatedMinutes! * 1.2);
    });
  });

  // ==========================================
  // Pattern-based Subdivision Tests
  // ==========================================

  describe('Pattern-based Subdivision', () => {
    it('should use test patterns for test-related tasks', async () => {
      const testTask = createMockTask({
        title: '테스트 코드 작성',
        description: 'Unit tests for authentication module',
        tags: ['testing'],
      });

      const resultPromise = service.suggestSubdivision(testTask);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      // Should include test-specific subtasks
      const titles = result.subtasks.map(st => st.title.toLowerCase());
      expect(titles.some(t => t.includes('테스트') || t.includes('test'))).toBe(true);
    });

    it('should use API patterns for API-related tasks', async () => {
      const apiTask = createMockTask({
        title: 'API 엔드포인트 개발',
        description: 'REST API for user management',
        tags: ['api', 'backend'],
      });

      const resultPromise = service.suggestSubdivision(apiTask);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      // Should include API-specific subtasks
      const titles = result.subtasks.map(st => st.title.toLowerCase());
      expect(titles.some(t => t.includes('api') || t.includes('endpoint') || t.includes('엔드포인트'))).toBe(true);
    });

    it('should use UI patterns for UI-related tasks', async () => {
      const uiTask = createMockTask({
        title: 'UI 컴포넌트 개발',
        description: 'Dashboard components with charts',
        tags: ['ui', 'frontend'],
      });

      const resultPromise = service.suggestSubdivision(uiTask);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      // Should include UI-specific subtasks
      const titles = result.subtasks.map(st => st.title.toLowerCase());
      expect(titles.some(t =>
        t.includes('컴포넌트') ||
        t.includes('component') ||
        t.includes('ui') ||
        t.includes('레이아웃')
      )).toBe(true);
    });
  });

  // ==========================================
  // Reasoning Generation Tests
  // ==========================================

  describe('Reasoning Generation', () => {
    it('should generate Korean reasoning text', async () => {
      const task = createMockTask();

      const resultPromise = service.suggestSubdivision(task);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      // Reasoning should contain Korean text
      expect(result.reasoning).toContain('작업');
      expect(result.reasoning).toContain('세분화');
    });

    it('should include time estimate in reasoning', async () => {
      const task = createMockTask({
        estimatedMinutes: 480, // 8 hours
      });

      const resultPromise = service.suggestSubdivision(task);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      expect(result.reasoning).toContain('시간');
    });

    it('should mention complexity in reasoning', async () => {
      const task = createMockTask({
        estimatedMinutes: 2400, // 40 hours - high complexity
      });

      const resultPromise = service.suggestSubdivision(task);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      expect(result.reasoning).toContain('복잡도');
    });
  });

  // ==========================================
  // Edge Cases
  // ==========================================

  describe('Edge Cases', () => {
    it('should handle task with no description', async () => {
      const task = createMockTask({
        description: undefined,
      });

      const resultPromise = service.suggestSubdivision(task);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      expect(result.subtasks.length).toBeGreaterThan(0);
    });

    it('should handle task with no estimated time', async () => {
      const task = createMockTask({
        estimatedMinutes: undefined,
      });

      const resultPromise = service.suggestSubdivision(task);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      // Should use default time (480 minutes / 8 hours)
      expect(result.totalEstimatedMinutes).toBeGreaterThan(0);
    });

    it('should handle task with no tags', async () => {
      const task = createMockTask({
        tags: undefined,
      });

      const resultPromise = service.suggestSubdivision(task);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      // Should still generate subtasks with default category tags
      expect(result.subtasks.length).toBeGreaterThan(0);
      result.subtasks.forEach(st => {
        expect(st.tags).toBeDefined();
      });
    });

    it('should handle very short task title', async () => {
      const task = createMockTask({
        title: 'Fix',
        description: '',
        estimatedMinutes: 30,
      });

      const resultPromise = service.suggestSubdivision(task);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      expect(result.subtasks.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // Subtask Quality Tests
  // ==========================================

  describe('Subtask Quality', () => {
    it('should have unique titles for each subtask', async () => {
      const task = createMockTask();

      const resultPromise = service.suggestSubdivision(task);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      const titles = result.subtasks.map(st => st.title);
      const uniqueTitles = new Set(titles);
      expect(uniqueTitles.size).toBe(titles.length);
    });

    it('should have descriptions for all subtasks', async () => {
      const task = createMockTask();

      const resultPromise = service.suggestSubdivision(task);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      result.subtasks.forEach(subtask => {
        expect(subtask.description).toBeTruthy();
        expect(subtask.description.length).toBeGreaterThan(10);
      });
    });

    it('should set first subtask as high priority', async () => {
      const task = createMockTask();

      const resultPromise = service.suggestSubdivision(task);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      expect(result.subtasks[0].priority).toBe('high');
    });

    it('should have positive estimated minutes for all subtasks', async () => {
      const task = createMockTask();

      const resultPromise = service.suggestSubdivision(task);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      result.subtasks.forEach(subtask => {
        expect(subtask.estimatedMinutes).toBeGreaterThan(0);
      });
    });
  });

  // ==========================================
  // Singleton Instance Tests
  // ==========================================

  describe('Singleton Instance', () => {
    it('should export a singleton instance', () => {
      expect(taskSubdivisionService).toBeInstanceOf(TaskSubdivisionService);
    });

    it('should work with singleton instance', async () => {
      const task = createMockTask();

      const resultPromise = taskSubdivisionService.suggestSubdivision(task);
      await vi.advanceTimersByTimeAsync(3000);
      const result = await resultPromise;

      expect(result.subtasks.length).toBeGreaterThan(0);
    });
  });
});
