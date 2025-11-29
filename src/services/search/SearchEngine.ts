/**
 * Search Engine Service
 *
 * Provides global search functionality across all entities
 * using FlexSearch for fast in-memory full-text search.
 */

import FlexSearch from 'flexsearch';
import type { Document } from 'flexsearch';

// ========================================
// Types
// ========================================

export type EntityType = 'project' | 'task' | 'comment' | 'skill' | 'user' | 'template';

export type Status = 'todo' | 'in_progress' | 'needs_approval' | 'in_review' | 'done' | 'blocked' | 'active' | 'completed' | 'archived';

export interface SearchFilters {
  entityTypes?: EntityType[];
  dateRange?: { from: Date; to: Date };
  projectIds?: number[];
  userIds?: number[];
  tags?: string[];
  statuses?: Status[];
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  highlight?: boolean;
  fuzzy?: boolean;
  sortBy?: 'relevance' | 'date' | 'title';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchResult {
  entityType: EntityType;
  entityId: number;
  title: string;
  snippet: string;
  score: number;
  metadata: Record<string, unknown>;
  highlightedTitle?: string;
  highlightedSnippet?: string;
}

export interface SearchCriteria {
  query?: string;
  filters?: SearchFilters;
  mustContain?: string[];
  mustNotContain?: string[];
  exactMatch?: boolean;
}

export interface IndexedDocument {
  id: string;
  entityType: EntityType;
  entityId: number;
  title: string;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ========================================
// Search Engine Implementation
// ========================================

export class SearchEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private index: Document<any>;
  private documents: Map<string, IndexedDocument>;
  private recentSearches: string[];
  private savedSearches: Map<string, SearchCriteria>;
  private readonly maxRecentSearches = 20;

  constructor() {
    this.documents = new Map();
    this.recentSearches = [];
    this.savedSearches = new Map();

    // Initialize FlexSearch with Korean language support
    this.index = new FlexSearch.Document({
      document: {
        id: 'id',
        index: ['title', 'content', 'tags'],
        store: ['entityType', 'entityId', 'title', 'content', 'tags', 'metadata', 'createdAt', 'updatedAt'],
      },
      tokenize: 'forward',
      resolution: 9,
      cache: 100,
      context: {
        resolution: 9,
        depth: 2,
        bidirectional: true,
      },
    });
  }

  // ========================================
  // Indexing Methods
  // ========================================

  /**
   * Index a single entity
   */
  async indexEntity(
    entityType: EntityType,
    entityId: number,
    content: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    const id = `${entityType}:${entityId}`;
    const title = (metadata.title as string) || '';
    const tags = (metadata.tags as string[]) || [];

    const doc: IndexedDocument = {
      id,
      entityType,
      entityId,
      title,
      content,
      tags,
      metadata,
      createdAt: (metadata.createdAt as Date) || new Date(),
      updatedAt: new Date(),
    };

    // Remove existing document if exists
    if (this.documents.has(id)) {
      await this.removeFromIndex(entityType, entityId);
    }

    // Add to index
    this.index.add(doc);
    this.documents.set(id, doc);
  }

  /**
   * Remove an entity from the index
   */
  async removeFromIndex(entityType: EntityType, entityId: number): Promise<void> {
    const id = `${entityType}:${entityId}`;
    this.index.remove(id);
    this.documents.delete(id);
  }

  /**
   * Bulk index multiple entities
   */
  async bulkIndex(entities: Array<{
    entityType: EntityType;
    entityId: number;
    content: string;
    metadata: Record<string, unknown>;
  }>): Promise<void> {
    for (const entity of entities) {
      await this.indexEntity(
        entity.entityType,
        entity.entityId,
        entity.content,
        entity.metadata
      );
    }
  }

  /**
   * Clear all indexed data
   */
  async clearIndex(): Promise<void> {
    // Recreate index
    this.index = new FlexSearch.Document({
      document: {
        id: 'id',
        index: ['title', 'content', 'tags'],
        store: ['entityType', 'entityId', 'title', 'content', 'tags', 'metadata', 'createdAt', 'updatedAt'],
      },
      tokenize: 'forward',
      resolution: 9,
      cache: 100,
    });
    this.documents.clear();
  }

  // ========================================
  // Search Methods
  // ========================================

  /**
   * Basic search
   */
  async search(
    query: string,
    filters?: SearchFilters,
    options?: SearchOptions
  ): Promise<SearchResult[]> {
    if (!query.trim()) {
      return [];
    }

    // Track recent search
    this.addToRecentSearches(query);

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    // Search across all indexed fields
    const searchResults = this.index.search(query, {
      limit: limit + offset,
      enrich: true,
    });

    // Combine results from different fields
    const resultMap = new Map<string, { doc: IndexedDocument; score: number }>();

    for (const fieldResult of searchResults) {
      if (fieldResult.result) {
        for (let i = 0; i < fieldResult.result.length; i++) {
          const item = fieldResult.result[i];
          const id = typeof item === 'object' ? (item as any).id : item;
          const doc = this.documents.get(id as string);

          if (doc) {
            const existing = resultMap.get(id as string);
            const score = (fieldResult.result.length - i) / fieldResult.result.length;

            if (!existing || existing.score < score) {
              resultMap.set(id as string, { doc, score });
            }
          }
        }
      }
    }

    // Convert to array and apply filters
    let results = Array.from(resultMap.values());

    // Apply filters
    if (filters) {
      results = this.applyFilters(results, filters);
    }

    // Sort results
    results = this.sortResults(results, options);

    // Apply pagination
    results = results.slice(offset, offset + limit);

    // Format results
    return results.map(({ doc, score }) => this.formatResult(doc, query, score, options?.highlight));
  }

  /**
   * Fuzzy search with typo tolerance
   */
  async fuzzySearch(query: string, limit = 20): Promise<SearchResult[]> {
    if (!query.trim()) {
      return [];
    }

    // Generate fuzzy variations
    const variations = this.generateFuzzyVariations(query);
    const allResults = new Map<string, { doc: IndexedDocument; score: number }>();

    for (const variation of variations) {
      const searchResults = this.index.search(variation, {
        limit: Math.ceil(limit / variations.length),
        enrich: true,
      });

      for (const fieldResult of searchResults) {
        if (fieldResult.result) {
          for (let i = 0; i < fieldResult.result.length; i++) {
            const item = fieldResult.result[i];
            const id = typeof item === 'object' ? (item as any).id : item;
            const doc = this.documents.get(id as string);

            if (doc && !allResults.has(id as string)) {
              const score = (fieldResult.result.length - i) / fieldResult.result.length * 0.8; // Reduced score for fuzzy
              allResults.set(id as string, { doc, score });
            }
          }
        }
      }
    }

    return Array.from(allResults.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ doc, score }) => this.formatResult(doc, query, score, true));
  }

  /**
   * Autocomplete suggestions
   */
  async autocomplete(query: string, limit = 10): Promise<string[]> {
    if (!query.trim() || query.length < 2) {
      return [];
    }

    const suggestions = new Set<string>();

    // Search for matching titles
    const results = this.index.search(query, {
      limit: limit * 3,
      enrich: true,
    });

    for (const fieldResult of results) {
      if (fieldResult.result) {
        for (const item of fieldResult.result) {
          const id = typeof item === 'object' ? (item as any).id : item;
          const doc = this.documents.get(id as string);

          if (doc) {
            // Add title if it matches
            if (doc.title.toLowerCase().includes(query.toLowerCase())) {
              suggestions.add(doc.title);
            }

            // Add matching tags
            for (const tag of doc.tags) {
              if (tag.toLowerCase().includes(query.toLowerCase())) {
                suggestions.add(tag);
              }
            }
          }

          if (suggestions.size >= limit) break;
        }
      }
      if (suggestions.size >= limit) break;
    }

    // Add from recent searches
    for (const recent of this.recentSearches) {
      if (recent.toLowerCase().includes(query.toLowerCase())) {
        suggestions.add(recent);
      }
      if (suggestions.size >= limit) break;
    }

    return Array.from(suggestions).slice(0, limit);
  }

  /**
   * Advanced search with complex criteria
   */
  async advancedSearch(criteria: SearchCriteria): Promise<SearchResult[]> {
    let results: Array<{ doc: IndexedDocument; score: number }> = [];

    // Start with query search or all documents
    if (criteria.query) {
      const searchResults = this.index.search(criteria.query, {
        limit: 1000,
        enrich: true,
      });

      for (const fieldResult of searchResults) {
        if (fieldResult.result) {
          for (let i = 0; i < fieldResult.result.length; i++) {
            const item = fieldResult.result[i];
            const id = typeof item === 'object' ? (item as any).id : item;
            const doc = this.documents.get(id as string);

            if (doc) {
              const score = (fieldResult.result.length - i) / fieldResult.result.length;
              results.push({ doc, score });
            }
          }
        }
      }
    } else {
      // No query, use all documents
      results = Array.from(this.documents.values()).map(doc => ({ doc, score: 1 }));
    }

    // Apply must contain filter
    if (criteria.mustContain?.length) {
      results = results.filter(({ doc }) => {
        const text = `${doc.title} ${doc.content}`.toLowerCase();
        return criteria.mustContain!.every(term => text.includes(term.toLowerCase()));
      });
    }

    // Apply must not contain filter
    if (criteria.mustNotContain?.length) {
      results = results.filter(({ doc }) => {
        const text = `${doc.title} ${doc.content}`.toLowerCase();
        return !criteria.mustNotContain!.some(term => text.includes(term.toLowerCase()));
      });
    }

    // Apply exact match filter
    if (criteria.exactMatch && criteria.query) {
      const exactQuery = criteria.query.toLowerCase();
      results = results.filter(({ doc }) => {
        const text = `${doc.title} ${doc.content}`.toLowerCase();
        return text.includes(exactQuery);
      });
    }

    // Apply regular filters
    if (criteria.filters) {
      results = this.applyFilters(results, criteria.filters);
    }

    return results
      .sort((a, b) => b.score - a.score)
      .map(({ doc, score }) => this.formatResult(doc, criteria.query || '', score, true));
  }

  // ========================================
  // Recent & Saved Searches
  // ========================================

  /**
   * Get recent searches
   */
  getRecentSearches(): string[] {
    return [...this.recentSearches];
  }

  /**
   * Clear recent searches
   */
  clearRecentSearches(): void {
    this.recentSearches = [];
  }

  /**
   * Save a search
   */
  saveSearch(name: string, criteria: SearchCriteria): void {
    this.savedSearches.set(name, criteria);
  }

  /**
   * Get saved searches
   */
  getSavedSearches(): Map<string, SearchCriteria> {
    return new Map(this.savedSearches);
  }

  /**
   * Delete a saved search
   */
  deleteSavedSearch(name: string): void {
    this.savedSearches.delete(name);
  }

  /**
   * Execute a saved search
   */
  async executeSavedSearch(name: string): Promise<SearchResult[]> {
    const criteria = this.savedSearches.get(name);
    if (!criteria) {
      throw new Error(`Saved search "${name}" not found`);
    }
    return this.advancedSearch(criteria);
  }

  // ========================================
  // Statistics
  // ========================================

  /**
   * Get index statistics
   */
  getStats(): {
    totalDocuments: number;
    byEntityType: Record<EntityType, number>;
  } {
    const byEntityType: Record<EntityType, number> = {
      project: 0,
      task: 0,
      comment: 0,
      skill: 0,
      user: 0,
      template: 0,
    };

    for (const doc of this.documents.values()) {
      byEntityType[doc.entityType]++;
    }

    return {
      totalDocuments: this.documents.size,
      byEntityType,
    };
  }

  // ========================================
  // Private Helper Methods
  // ========================================

  private addToRecentSearches(query: string): void {
    // Remove if already exists
    const index = this.recentSearches.indexOf(query);
    if (index > -1) {
      this.recentSearches.splice(index, 1);
    }

    // Add to front
    this.recentSearches.unshift(query);

    // Trim to max size
    if (this.recentSearches.length > this.maxRecentSearches) {
      this.recentSearches = this.recentSearches.slice(0, this.maxRecentSearches);
    }
  }

  private applyFilters(
    results: Array<{ doc: IndexedDocument; score: number }>,
    filters: SearchFilters
  ): Array<{ doc: IndexedDocument; score: number }> {
    return results.filter(({ doc }) => {
      // Filter by entity type
      if (filters.entityTypes?.length && !filters.entityTypes.includes(doc.entityType)) {
        return false;
      }

      // Filter by date range
      if (filters.dateRange) {
        const docDate = doc.createdAt;
        if (docDate < filters.dateRange.from || docDate > filters.dateRange.to) {
          return false;
        }
      }

      // Filter by project IDs
      if (filters.projectIds?.length) {
        const projectId = doc.metadata.projectId as number;
        if (!projectId || !filters.projectIds.includes(projectId)) {
          return false;
        }
      }

      // Filter by user IDs
      if (filters.userIds?.length) {
        const userId = doc.metadata.userId as number;
        if (!userId || !filters.userIds.includes(userId)) {
          return false;
        }
      }

      // Filter by tags
      if (filters.tags?.length) {
        if (!doc.tags.some(tag => filters.tags!.includes(tag))) {
          return false;
        }
      }

      // Filter by status
      if (filters.statuses?.length) {
        const status = doc.metadata.status as Status;
        if (!status || !filters.statuses.includes(status)) {
          return false;
        }
      }

      return true;
    });
  }

  private sortResults(
    results: Array<{ doc: IndexedDocument; score: number }>,
    options?: SearchOptions
  ): Array<{ doc: IndexedDocument; score: number }> {
    const sortBy = options?.sortBy || 'relevance';
    const sortOrder = options?.sortOrder || 'desc';
    const multiplier = sortOrder === 'desc' ? -1 : 1;

    return results.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return multiplier * (a.doc.updatedAt.getTime() - b.doc.updatedAt.getTime());
        case 'title':
          return multiplier * a.doc.title.localeCompare(b.doc.title);
        case 'relevance':
        default:
          return b.score - a.score;
      }
    });
  }

  private formatResult(
    doc: IndexedDocument,
    query: string,
    score: number,
    highlight = false
  ): SearchResult {
    let snippet = doc.content.slice(0, 200);
    let highlightedTitle = doc.title;
    let highlightedSnippet = snippet;

    if (highlight && query) {
      const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
      highlightedTitle = doc.title.replace(regex, '<mark>$1</mark>');
      highlightedSnippet = snippet.replace(regex, '<mark>$1</mark>');

      // Find snippet around match
      const lowerContent = doc.content.toLowerCase();
      const lowerQuery = query.toLowerCase();
      const matchIndex = lowerContent.indexOf(lowerQuery);

      if (matchIndex > -1) {
        const start = Math.max(0, matchIndex - 50);
        const end = Math.min(doc.content.length, matchIndex + query.length + 150);
        snippet = (start > 0 ? '...' : '') + doc.content.slice(start, end) + (end < doc.content.length ? '...' : '');
        highlightedSnippet = snippet.replace(regex, '<mark>$1</mark>');
      }
    }

    return {
      entityType: doc.entityType,
      entityId: doc.entityId,
      title: doc.title,
      snippet,
      score,
      metadata: doc.metadata,
      highlightedTitle,
      highlightedSnippet,
    };
  }

  private generateFuzzyVariations(query: string): string[] {
    const variations = [query];
    const chars = query.split('');

    // Single character deletion
    for (let i = 0; i < chars.length; i++) {
      const variation = [...chars];
      variation.splice(i, 1);
      variations.push(variation.join(''));
    }

    // Single character substitution (nearby keys)
    const nearbyKeys: Record<string, string[]> = {
      'a': ['s', 'q', 'z'],
      's': ['a', 'd', 'w', 'x'],
      'd': ['s', 'f', 'e', 'c'],
      // ... more can be added
    };

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      if (!char) continue;
      const nearby = nearbyKeys[char.toLowerCase()];
      if (nearby) {
        for (const sub of nearby.slice(0, 2)) {
          const variation = [...chars];
          variation[i] = sub;
          variations.push(variation.join(''));
        }
      }
    }

    return variations.slice(0, 5); // Limit variations
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// ========================================
// Singleton Export
// ========================================

export const searchEngine = new SearchEngine();
export default searchEngine;
