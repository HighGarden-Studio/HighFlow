/**
 * Tag Service
 *
 * Manages task tags with auto-generation based on task content,
 * filtering, searching, and tag analytics.
 */

// ========================================
// Types
// ========================================

export interface Tag {
  id: string;
  name: string;
  color: string;
  category: TagCategory;
  usageCount: number;
  createdAt: Date;
}

export type TagCategory =
  | 'technology'    // 기술 스택 (React, Vue, Node, etc.)
  | 'domain'        // 도메인 (frontend, backend, database, etc.)
  | 'action'        // 액션 (구현, 수정, 테스트, 문서화, etc.)
  | 'priority'      // 우선순위 관련
  | 'custom';       // 사용자 정의

export interface TagSuggestion {
  tag: string;
  confidence: number;
  category: TagCategory;
  reason: string;
}

export interface TagAnalytics {
  totalTags: number;
  topTags: { tag: string; count: number }[];
  categoryDistribution: Record<TagCategory, number>;
  recentTags: string[];
}

// ========================================
// Tag Detection Patterns
// ========================================

const TAG_PATTERNS: Record<TagCategory, { patterns: RegExp[]; tags: string[] }> = {
  technology: {
    patterns: [
      /\b(react|vue|angular|svelte|next\.?js|nuxt)\b/gi,
      /\b(node\.?js?|express|fastify|nest\.?js|koa)\b/gi,
      /\b(python|django|flask|fastapi)\b/gi,
      /\b(typescript|javascript|ts|js)\b/gi,
      /\b(rust|go|golang|java|kotlin|swift)\b/gi,
      /\b(sql|mysql|postgresql|postgres|mongodb|redis|sqlite)\b/gi,
      /\b(docker|kubernetes|k8s|aws|gcp|azure)\b/gi,
      /\b(graphql|rest|api|grpc)\b/gi,
      /\b(tailwind|css|scss|sass|styled-components)\b/gi,
      /\b(webpack|vite|rollup|esbuild|parcel)\b/gi,
      /\b(git|github|gitlab|bitbucket)\b/gi,
      /\b(jest|vitest|cypress|playwright|mocha)\b/gi,
      /\b(openai|gpt|claude|anthropic|gemini|llm|ai|ml)\b/gi,
    ],
    tags: [],
  },
  domain: {
    patterns: [
      /\b(프론트엔드|frontend|front-?end|ui|ux|인터페이스)\b/gi,
      /\b(백엔드|backend|back-?end|서버|server)\b/gi,
      /\b(데이터베이스|database|db|스키마|schema)\b/gi,
      /\b(인프라|infra|infrastructure|devops|ci\/cd)\b/gi,
      /\b(보안|security|auth|인증|authentication|authorization)\b/gi,
      /\b(성능|performance|optimization|최적화)\b/gi,
      /\b(테스트|testing|qa|quality)\b/gi,
      /\b(배포|deployment|deploy|release)\b/gi,
      /\b(모니터링|monitoring|logging|로깅)\b/gi,
      /\b(캐싱|caching|cache)\b/gi,
    ],
    tags: [],
  },
  action: {
    patterns: [
      /\b(구현|implement|implementation|개발|develop)\b/gi,
      /\b(수정|fix|bugfix|버그|bug|patch)\b/gi,
      /\b(리팩토링|refactor|refactoring|개선)\b/gi,
      /\b(테스트|test|testing|unit-?test|e2e)\b/gi,
      /\b(문서화|documentation|docs|document|readme)\b/gi,
      /\b(설계|design|architecture|아키텍처)\b/gi,
      /\b(분석|analysis|analyze|리서치|research)\b/gi,
      /\b(리뷰|review|검토|code-?review)\b/gi,
      /\b(마이그레이션|migration|migrate|이전)\b/gi,
      /\b(통합|integration|integrate|연동)\b/gi,
      /\b(삭제|remove|delete|cleanup|정리)\b/gi,
      /\b(추가|add|create|생성|new)\b/gi,
      /\b(업데이트|update|upgrade|갱신)\b/gi,
    ],
    tags: [],
  },
  priority: {
    patterns: [
      /\b(urgent|긴급|critical|크리티컬)\b/gi,
      /\b(important|중요|핵심)\b/gi,
      /\b(optional|선택|nice-?to-?have)\b/gi,
      /\b(blocker|블로커|차단)\b/gi,
      /\b(hotfix|핫픽스)\b/gi,
    ],
    tags: [],
  },
  custom: {
    patterns: [],
    tags: [],
  },
};

// ========================================
// Tag Colors
// ========================================

const TAG_COLORS: Record<TagCategory, string[]> = {
  technology: [
    'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
    'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  ],
  domain: [
    'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300',
  ],
  action: [
    'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
    'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  ],
  priority: [
    'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
    'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
    'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  ],
  custom: [
    'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  ],
};

// ========================================
// Tag Service Class
// ========================================

export class TagService {
  private tags: Map<string, Tag> = new Map();
  private tagUsage: Map<string, number> = new Map();

  /**
   * 태스크 제목과 설명에서 태그 자동 추출
   */
  extractTags(title: string, description?: string): TagSuggestion[] {
    const text = `${title} ${description || ''}`.toLowerCase();
    const suggestions: TagSuggestion[] = [];
    const foundTags = new Set<string>();

    // 각 카테고리별로 패턴 매칭
    for (const [category, config] of Object.entries(TAG_PATTERNS)) {
      for (const pattern of config.patterns) {
        const matches = text.matchAll(pattern);
        for (const match of matches) {
          const tagName = this.normalizeTagName(match[1] || match[0]);

          if (!foundTags.has(tagName)) {
            foundTags.add(tagName);
            suggestions.push({
              tag: tagName,
              confidence: this.calculateConfidence(tagName, text),
              category: category as TagCategory,
              reason: `"${match[0]}" 패턴 감지`,
            });
          }
        }
      }
    }

    // 신뢰도 순으로 정렬
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * 태그 이름 정규화
   */
  private normalizeTagName(tag: string): string {
    // 특수 매핑
    const mappings: Record<string, string> = {
      'ts': 'typescript',
      'js': 'javascript',
      'nodejs': 'node.js',
      'node': 'node.js',
      'postgres': 'postgresql',
      'k8s': 'kubernetes',
      'frontend': '프론트엔드',
      'backend': '백엔드',
      'database': '데이터베이스',
      'nextjs': 'next.js',
      'nuxt': 'nuxt.js',
      'nestjs': 'nest.js',
    };

    const normalized = tag.toLowerCase().trim();
    return mappings[normalized] || normalized;
  }

  /**
   * 신뢰도 계산
   */
  private calculateConfidence(tag: string, text: string): number {
    const tagLower = tag.toLowerCase();
    const textLower = text.toLowerCase();

    // 기본 신뢰도
    let confidence = 0.5;

    // 정확한 매칭
    if (new RegExp(`\\b${tagLower}\\b`).test(textLower)) {
      confidence += 0.3;
    }

    // 제목에 있으면 가중치
    const titlePart = text.split(' ').slice(0, 10).join(' ').toLowerCase();
    if (titlePart.includes(tagLower)) {
      confidence += 0.2;
    }

    // 자주 사용되는 태그면 가중치
    const usage = this.tagUsage.get(tag) || 0;
    if (usage > 5) confidence += 0.1;

    return Math.min(confidence, 1);
  }

  /**
   * AI 프롬프트 기반 태그 생성
   */
  generatePromptTags(prompt: string): string[] {
    const suggestions = this.extractTags('', prompt);
    return suggestions
      .filter(s => s.confidence >= 0.5)
      .slice(0, 5)
      .map(s => s.tag);
  }

  /**
   * 태그 색상 가져오기
   */
  getTagColor(tag: string, category?: TagCategory): string {
    const cat = category || this.detectCategory(tag);
    const colors = TAG_COLORS[cat];
    // 태그 이름 해시로 색상 선택 (일관된 색상)
    const hash = tag.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }

  /**
   * 태그 카테고리 감지
   */
  private detectCategory(tag: string): TagCategory {
    const tagLower = tag.toLowerCase();

    for (const [category, config] of Object.entries(TAG_PATTERNS)) {
      for (const pattern of config.patterns) {
        if (pattern.test(tagLower)) {
          return category as TagCategory;
        }
      }
    }

    return 'custom';
  }

  /**
   * 태그 사용 횟수 증가
   */
  incrementUsage(tag: string): void {
    const current = this.tagUsage.get(tag) || 0;
    this.tagUsage.set(tag, current + 1);
  }

  /**
   * 인기 태그 목록
   */
  getPopularTags(limit: number = 10): { tag: string; count: number }[] {
    return Array.from(this.tagUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag, count]) => ({ tag, count }));
  }

  /**
   * 태그로 검색 필터
   */
  filterByTags<T extends { tags?: string[] }>(items: T[], tags: string[]): T[] {
    if (tags.length === 0) return items;

    return items.filter(item => {
      if (!item.tags) return false;
      return tags.some(tag =>
        item.tags!.some(t => t.toLowerCase() === tag.toLowerCase())
      );
    });
  }

  /**
   * 태그 자동완성 추천
   */
  getAutocomplete(input: string, limit: number = 5): string[] {
    const inputLower = input.toLowerCase();
    const popular = this.getPopularTags(50);

    return popular
      .filter(({ tag }) => tag.toLowerCase().includes(inputLower))
      .slice(0, limit)
      .map(({ tag }) => tag);
  }

  /**
   * 태그 분석 통계
   */
  getAnalytics(): TagAnalytics {
    const topTags = this.getPopularTags(10);

    const categoryDistribution: Record<TagCategory, number> = {
      technology: 0,
      domain: 0,
      action: 0,
      priority: 0,
      custom: 0,
    };

    for (const [tag, count] of this.tagUsage.entries()) {
      const category = this.detectCategory(tag);
      categoryDistribution[category] += count;
    }

    // 최근 태그 (임시로 인기 태그에서 가져옴)
    const recentTags = topTags.slice(0, 5).map(t => t.tag);

    return {
      totalTags: this.tagUsage.size,
      topTags,
      categoryDistribution,
      recentTags,
    };
  }

  /**
   * 관련 태그 추천
   */
  getRelatedTags(tag: string, limit: number = 5): string[] {
    const category = this.detectCategory(tag);
    const sameCategoryTags: string[] = [];

    for (const [t] of this.tagUsage.entries()) {
      if (t !== tag && this.detectCategory(t) === category) {
        sameCategoryTags.push(t);
      }
    }

    return sameCategoryTags.slice(0, limit);
  }

  /**
   * 태그 병합 (중복 제거 및 정규화)
   */
  mergeTags(existingTags: string[], newTags: string[]): string[] {
    const merged = new Set(existingTags.map(t => this.normalizeTagName(t)));
    for (const tag of newTags) {
      merged.add(this.normalizeTagName(tag));
    }
    return Array.from(merged);
  }

  /**
   * 프로젝트의 모든 태그 수집
   */
  collectProjectTags(tasks: { tags?: string[] }[]): string[] {
    const allTags = new Set<string>();
    for (const task of tasks) {
      if (task.tags) {
        task.tags.forEach(tag => allTags.add(tag));
      }
    }
    return Array.from(allTags).sort();
  }
}

// ========================================
// Singleton Export
// ========================================

export const tagService = new TagService();
export default tagService;
