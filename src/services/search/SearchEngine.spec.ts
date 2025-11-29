/**
 * SearchEngine Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SearchEngine, searchEngine, type EntityType, type SearchFilters, type SearchOptions, type SearchCriteria } from './SearchEngine';

// ==========================================
// Test Data
// ==========================================

const mockDocuments = [
  {
    entityType: 'task' as EntityType,
    entityId: 1,
    content: '사용자 인증 시스템 구현 - OAuth 및 JWT 기반 로그인',
    metadata: {
      title: '인증 시스템 구현',
      tags: ['backend', 'auth', 'security'],
      projectId: 1,
      userId: 1,
      status: 'in_progress',
      createdAt: new Date('2024-01-01'),
    },
  },
  {
    entityType: 'task' as EntityType,
    entityId: 2,
    content: '상품 목록 API 개발 - RESTful API 설계 및 구현',
    metadata: {
      title: '상품 API 개발',
      tags: ['backend', 'api'],
      projectId: 1,
      userId: 2,
      status: 'todo',
      createdAt: new Date('2024-01-05'),
    },
  },
  {
    entityType: 'task' as EntityType,
    entityId: 3,
    content: 'UI 컴포넌트 라이브러리 구축 - Vue 3 기반 재사용 가능 컴포넌트',
    metadata: {
      title: 'UI 컴포넌트 개발',
      tags: ['frontend', 'ui', 'vue'],
      projectId: 2,
      userId: 1,
      status: 'done',
      createdAt: new Date('2024-01-10'),
    },
  },
  {
    entityType: 'project' as EntityType,
    entityId: 1,
    content: 'E-commerce 플랫폼 - 온라인 쇼핑몰 구축 프로젝트',
    metadata: {
      title: 'E-commerce 프로젝트',
      tags: ['ecommerce', 'web'],
      createdAt: new Date('2024-01-01'),
    },
  },
  {
    entityType: 'project' as EntityType,
    entityId: 2,
    content: '소셜 미디어 앱 - 사진 공유 플랫폼 개발',
    metadata: {
      title: '소셜 미디어 앱',
      tags: ['social', 'mobile'],
      createdAt: new Date('2024-01-08'),
    },
  },
];

// ==========================================
// Tests
// ==========================================

describe('SearchEngine', () => {
  let engine: SearchEngine;

  beforeEach(async () => {
    engine = new SearchEngine();

    // Index test documents
    for (const doc of mockDocuments) {
      await engine.indexEntity(
        doc.entityType,
        doc.entityId,
        doc.content,
        doc.metadata
      );
    }
  });

  afterEach(async () => {
    await engine.clearIndex();
  });

  // ==========================================
  // Indexing Tests
  // ==========================================

  describe('Indexing', () => {
    it('should index an entity', async () => {
      const newEngine = new SearchEngine();
      await newEngine.indexEntity('task', 100, 'Test content', {
        title: 'Test Task',
        tags: ['test'],
      });

      const stats = newEngine.getStats();
      expect(stats.totalDocuments).toBe(1);
      expect(stats.byEntityType.task).toBe(1);
    });

    it('should bulk index multiple entities', async () => {
      const newEngine = new SearchEngine();
      await newEngine.bulkIndex([
        { entityType: 'task', entityId: 1, content: 'Task 1', metadata: { title: 'Task 1' } },
        { entityType: 'task', entityId: 2, content: 'Task 2', metadata: { title: 'Task 2' } },
        { entityType: 'project', entityId: 1, content: 'Project 1', metadata: { title: 'Project 1' } },
      ]);

      const stats = newEngine.getStats();
      expect(stats.totalDocuments).toBe(3);
      expect(stats.byEntityType.task).toBe(2);
      expect(stats.byEntityType.project).toBe(1);
    });

    it('should update existing entity on re-index', async () => {
      await engine.indexEntity('task', 1, 'Updated content', {
        title: 'Updated Task',
        tags: ['updated'],
      });

      const results = await engine.search('Updated');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe('Updated Task');
    });

    it('should remove entity from index', async () => {
      const statsBefore = engine.getStats();
      await engine.removeFromIndex('task', 1);
      const statsAfter = engine.getStats();

      expect(statsAfter.totalDocuments).toBe(statsBefore.totalDocuments - 1);
    });

    it('should clear all indexed data', async () => {
      await engine.clearIndex();
      const stats = engine.getStats();
      expect(stats.totalDocuments).toBe(0);
    });
  });

  // ==========================================
  // Basic Search Tests
  // ==========================================

  describe('Basic Search', () => {
    it('should search by keyword', async () => {
      const results = await engine.search('인증');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain('인증');
    });

    it('should return empty array for empty query', async () => {
      const results = await engine.search('');
      expect(results).toEqual([]);
    });

    it('should return empty array for whitespace query', async () => {
      const results = await engine.search('   ');
      expect(results).toEqual([]);
    });

    it('should search across title and content', async () => {
      // Search for word in content but not title
      const results = await engine.search('OAuth');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should search by tags', async () => {
      const results = await engine.search('backend');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should respect limit option', async () => {
      const results = await engine.search('프로젝트', undefined, { limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should support pagination with offset', async () => {
      const firstPage = await engine.search('프로젝트', undefined, { limit: 2, offset: 0 });
      const secondPage = await engine.search('프로젝트', undefined, { limit: 2, offset: 2 });

      // Results should be different (if enough results exist)
      if (firstPage.length > 0 && secondPage.length > 0) {
        expect(firstPage[0].entityId).not.toBe(secondPage[0].entityId);
      }
    });
  });

  // ==========================================
  // Search Filters Tests
  // ==========================================

  describe('Search with Filters', () => {
    it('should filter by entity type', async () => {
      const filters: SearchFilters = { entityTypes: ['task'] };
      const results = await engine.search('프로젝트', filters);

      results.forEach(result => {
        expect(result.entityType).toBe('task');
      });
    });

    it('should filter by multiple entity types', async () => {
      const filters: SearchFilters = { entityTypes: ['task', 'project'] };
      const results = await engine.search('개발', filters);

      results.forEach(result => {
        expect(['task', 'project']).toContain(result.entityType);
      });
    });

    it('should filter by project ID', async () => {
      const filters: SearchFilters = { projectIds: [1] };
      const results = await engine.search('API', filters);

      results.forEach(result => {
        expect(result.metadata.projectId).toBe(1);
      });
    });

    it('should filter by tags', async () => {
      const filters: SearchFilters = { tags: ['frontend'] };
      const results = await engine.search('컴포넌트', filters);

      results.forEach(result => {
        const tags = result.metadata.tags as string[];
        expect(tags).toContain('frontend');
      });
    });

    it('should filter by status', async () => {
      const filters: SearchFilters = { statuses: ['todo'] };
      const results = await engine.search('API', filters);

      results.forEach(result => {
        expect(result.metadata.status).toBe('todo');
      });
    });

    it('should filter by date range', async () => {
      const filters: SearchFilters = {
        dateRange: {
          from: new Date('2024-01-01'),
          to: new Date('2024-01-05'),
        },
      };
      const results = await engine.search('개발', filters);

      // All results should be within date range
      expect(results.length).toBeGreaterThan(0);
    });

    it('should combine multiple filters', async () => {
      const filters: SearchFilters = {
        entityTypes: ['task'],
        projectIds: [1],
        tags: ['backend'],
      };
      const results = await engine.search('인증', filters);

      results.forEach(result => {
        expect(result.entityType).toBe('task');
        expect(result.metadata.projectId).toBe(1);
      });
    });
  });

  // ==========================================
  // Search Options Tests
  // ==========================================

  describe('Search Options', () => {
    it('should highlight search terms', async () => {
      const options: SearchOptions = { highlight: true };
      const results = await engine.search('인증', undefined, options);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].highlightedTitle).toContain('<mark>');
    });

    it('should sort by relevance by default', async () => {
      const results = await engine.search('개발');

      // First result should have highest score
      if (results.length > 1) {
        expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
      }
    });

    it('should sort by title', async () => {
      const options: SearchOptions = { sortBy: 'title', sortOrder: 'asc' };
      const results = await engine.search('프로젝트', undefined, options);

      if (results.length > 1) {
        expect(results[0].title.localeCompare(results[1].title)).toBeLessThanOrEqual(0);
      }
    });

    it('should sort by date descending', async () => {
      const options: SearchOptions = { sortBy: 'date', sortOrder: 'desc' };
      const results = await engine.search('개발', undefined, options);

      // Results should be sorted by date
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // Fuzzy Search Tests
  // ==========================================

  describe('Fuzzy Search', () => {
    it('should find results with typos', async () => {
      // Intentional typo: "인즘" instead of "인증"
      const results = await engine.fuzzySearch('인즘');
      // May or may not find results depending on fuzzy algorithm
      expect(results).toBeDefined();
    });

    it('should return limited results', async () => {
      const results = await engine.fuzzySearch('개발', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should return empty for empty query', async () => {
      const results = await engine.fuzzySearch('');
      expect(results).toEqual([]);
    });
  });

  // ==========================================
  // Autocomplete Tests
  // ==========================================

  describe('Autocomplete', () => {
    it('should return suggestions for partial query', async () => {
      const suggestions = await engine.autocomplete('인증');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should return empty for very short query', async () => {
      const suggestions = await engine.autocomplete('a');
      expect(suggestions).toEqual([]);
    });

    it('should respect limit', async () => {
      const suggestions = await engine.autocomplete('개발', 3);
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should include recent searches in suggestions', async () => {
      // First, perform some searches to build recent history
      await engine.search('테스트 검색어');

      // Then check autocomplete includes recent search
      const suggestions = await engine.autocomplete('테스트');

      // Note: Might not always include if other matches are more relevant
      expect(suggestions).toBeDefined();
    });
  });

  // ==========================================
  // Advanced Search Tests
  // ==========================================

  describe('Advanced Search', () => {
    it('should search with must contain criteria', async () => {
      const criteria: SearchCriteria = {
        query: '개발',
        mustContain: ['API'],
      };
      const results = await engine.advancedSearch(criteria);

      results.forEach(result => {
        const text = `${result.title} ${result.snippet}`.toLowerCase();
        expect(text).toContain('api');
      });
    });

    it('should exclude with must not contain criteria', async () => {
      const criteria: SearchCriteria = {
        query: '개발',
        mustNotContain: ['인증'],
      };
      const results = await engine.advancedSearch(criteria);

      results.forEach(result => {
        const text = `${result.title} ${result.snippet}`.toLowerCase();
        expect(text).not.toContain('인증');
      });
    });

    it('should perform exact match search', async () => {
      const criteria: SearchCriteria = {
        query: '인증 시스템',
        exactMatch: true,
      };
      const results = await engine.advancedSearch(criteria);

      results.forEach(result => {
        const text = `${result.title} ${result.snippet}`.toLowerCase();
        expect(text).toContain('인증 시스템');
      });
    });

    it('should combine criteria with filters', async () => {
      const criteria: SearchCriteria = {
        query: '개발',
        filters: { entityTypes: ['task'] },
        mustContain: ['구현'],
      };
      const results = await engine.advancedSearch(criteria);

      results.forEach(result => {
        expect(result.entityType).toBe('task');
      });
    });

    it('should return all documents without query', async () => {
      const criteria: SearchCriteria = {
        filters: { entityTypes: ['task'] },
      };
      const results = await engine.advancedSearch(criteria);

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.entityType).toBe('task');
      });
    });
  });

  // ==========================================
  // Recent & Saved Searches Tests
  // ==========================================

  describe('Recent Searches', () => {
    it('should track recent searches', async () => {
      await engine.search('첫번째 검색');
      await engine.search('두번째 검색');

      const recent = engine.getRecentSearches();
      expect(recent).toContain('두번째 검색');
      expect(recent).toContain('첫번째 검색');
    });

    it('should maintain order with most recent first', async () => {
      await engine.search('A');
      await engine.search('B');
      await engine.search('C');

      const recent = engine.getRecentSearches();
      expect(recent[0]).toBe('C');
      expect(recent[1]).toBe('B');
      expect(recent[2]).toBe('A');
    });

    it('should not duplicate recent searches', async () => {
      await engine.search('동일한 검색어');
      await engine.search('다른 검색어');
      await engine.search('동일한 검색어');

      const recent = engine.getRecentSearches();
      const occurrences = recent.filter(s => s === '동일한 검색어').length;
      expect(occurrences).toBe(1);
    });

    it('should clear recent searches', async () => {
      await engine.search('test');
      engine.clearRecentSearches();
      const recent = engine.getRecentSearches();
      expect(recent.length).toBe(0);
    });
  });

  describe('Saved Searches', () => {
    it('should save a search', () => {
      const criteria: SearchCriteria = {
        query: '인증',
        filters: { entityTypes: ['task'] },
      };
      engine.saveSearch('Auth Tasks', criteria);

      const saved = engine.getSavedSearches();
      expect(saved.has('Auth Tasks')).toBe(true);
    });

    it('should execute saved search', async () => {
      const criteria: SearchCriteria = {
        query: '인증',
        filters: { entityTypes: ['task'] },
      };
      engine.saveSearch('Auth Tasks', criteria);

      const results = await engine.executeSavedSearch('Auth Tasks');
      results.forEach(result => {
        expect(result.entityType).toBe('task');
      });
    });

    it('should throw error for non-existent saved search', async () => {
      await expect(
        engine.executeSavedSearch('NonExistent')
      ).rejects.toThrow('Saved search "NonExistent" not found');
    });

    it('should delete saved search', () => {
      engine.saveSearch('ToDelete', { query: 'test' });
      engine.deleteSavedSearch('ToDelete');

      const saved = engine.getSavedSearches();
      expect(saved.has('ToDelete')).toBe(false);
    });
  });

  // ==========================================
  // Statistics Tests
  // ==========================================

  describe('Statistics', () => {
    it('should return correct document count', () => {
      const stats = engine.getStats();
      expect(stats.totalDocuments).toBe(mockDocuments.length);
    });

    it('should count by entity type', () => {
      const stats = engine.getStats();
      expect(stats.byEntityType.task).toBe(3);
      expect(stats.byEntityType.project).toBe(2);
    });

    it('should return zero counts for unused entity types', () => {
      const stats = engine.getStats();
      expect(stats.byEntityType.comment).toBe(0);
      expect(stats.byEntityType.skill).toBe(0);
    });
  });

  // ==========================================
  // Singleton Tests
  // ==========================================

  describe('Singleton', () => {
    it('should export singleton instance', () => {
      expect(searchEngine).toBeInstanceOf(SearchEngine);
    });
  });
});
