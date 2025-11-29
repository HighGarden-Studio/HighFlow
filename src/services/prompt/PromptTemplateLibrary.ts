/**
 * Prompt Template Library
 *
 * Manages reusable prompt templates with variable substitution,
 * categorization, and usage tracking.
 */

import { eventBus } from '../events/EventBus';
import type { PromptTemplate, TemplateVariable, PromptCategory } from './PromptEnhancementService';

// ========================================
// Types
// ========================================

export interface TemplateSearchOptions {
  category?: PromptCategory;
  tags?: string[];
  query?: string;
  sortBy?: 'name' | 'usageCount' | 'rating' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

export interface TemplateRenderResult {
  renderedPrompt: string;
  missingVariables: string[];
  warnings: string[];
}

export interface TemplateValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// ========================================
// Built-in Templates
// ========================================

const BUILTIN_TEMPLATES: Omit<PromptTemplate, 'id' | 'usageCount' | 'rating' | 'createdAt' | 'updatedAt'>[] = [
  // Coding Templates
  {
    name: '코드 작성',
    description: '새로운 기능이나 모듈의 코드를 작성합니다',
    category: 'coding',
    template: `## 목표
{{goal}}

## 기술 스택
- 언어: {{language}}
- 프레임워크: {{framework}}

## 요구사항
{{requirements}}

## 제약조건
- 코드 스타일: {{codeStyle}}
- 성능 고려사항: {{performanceNotes}}

## 출력 형식
- 완성된 코드와 함께 주석 포함
- 필요한 import/dependency 명시
- 사용 예시 제공`,
    variables: [
      { name: 'goal', description: '구현할 기능 설명', type: 'multiline', required: true },
      { name: 'language', description: '프로그래밍 언어', type: 'select', required: true, options: ['TypeScript', 'JavaScript', 'Python', 'Java', 'Go', 'Rust'] },
      { name: 'framework', description: '사용할 프레임워크', type: 'text', required: false, defaultValue: 'None' },
      { name: 'requirements', description: '구체적인 요구사항', type: 'multiline', required: true },
      { name: 'codeStyle', description: '코드 스타일 가이드', type: 'text', required: false, defaultValue: 'Clean Code' },
      { name: 'performanceNotes', description: '성능 관련 고려사항', type: 'text', required: false, defaultValue: '해당 없음' },
    ],
    examples: [
      '사용자 인증 기능 구현',
      'REST API 엔드포인트 작성',
      '데이터 처리 유틸리티 함수 개발',
    ],
    tags: ['개발', '코드', '구현'],
  },
  {
    name: '코드 리뷰',
    description: '기존 코드를 검토하고 개선점을 제안합니다',
    category: 'review',
    template: `## 리뷰 대상 코드
\`\`\`{{language}}
{{code}}
\`\`\`

## 리뷰 관점
{{reviewFocus}}

## 검토 항목
- [ ] 코드 품질 및 가독성
- [ ] 버그 가능성
- [ ] 성능 최적화 기회
- [ ] 보안 취약점
- [ ] 베스트 프랙티스 준수

## 출력 형식
1. 전체 평가 (점수 및 요약)
2. 주요 발견사항 (심각도별 분류)
3. 구체적인 개선 제안
4. 리팩토링된 코드 예시`,
    variables: [
      { name: 'code', description: '리뷰할 코드', type: 'multiline', required: true },
      { name: 'language', description: '프로그래밍 언어', type: 'text', required: true },
      { name: 'reviewFocus', description: '특별히 집중할 부분', type: 'multiline', required: false, defaultValue: '전반적인 코드 품질' },
    ],
    examples: [
      'API 엔드포인트 보안 검토',
      '성능 최적화 관점 리뷰',
      '신규 개발자 코드 멘토링',
    ],
    tags: ['리뷰', '품질', '개선'],
  },
  {
    name: '버그 디버깅',
    description: '버그의 원인을 분석하고 해결책을 제시합니다',
    category: 'debugging',
    template: `## 문제 설명
{{problemDescription}}

## 에러 메시지/로그
\`\`\`
{{errorLog}}
\`\`\`

## 관련 코드
\`\`\`{{language}}
{{relatedCode}}
\`\`\`

## 재현 조건
{{reproductionSteps}}

## 기대 동작
{{expectedBehavior}}

## 실제 동작
{{actualBehavior}}

## 분석 요청
1. 근본 원인 분석
2. 가능한 해결책 제시 (우선순위순)
3. 수정된 코드
4. 재발 방지를 위한 제안`,
    variables: [
      { name: 'problemDescription', description: '문제 상황 설명', type: 'multiline', required: true },
      { name: 'errorLog', description: '에러 메시지 또는 로그', type: 'multiline', required: false },
      { name: 'language', description: '프로그래밍 언어', type: 'text', required: true },
      { name: 'relatedCode', description: '관련 코드 조각', type: 'multiline', required: true },
      { name: 'reproductionSteps', description: '버그 재현 단계', type: 'multiline', required: false },
      { name: 'expectedBehavior', description: '기대했던 동작', type: 'text', required: true },
      { name: 'actualBehavior', description: '실제 발생한 동작', type: 'text', required: true },
    ],
    examples: [
      'API 호출 시 500 에러 발생',
      '메모리 누수 문제 해결',
      '비동기 처리 관련 버그',
    ],
    tags: ['디버깅', '버그', '수정'],
  },

  // Writing Templates
  {
    name: '기술 문서 작성',
    description: 'API 문서, 가이드, 매뉴얼 등 기술 문서를 작성합니다',
    category: 'writing',
    template: `## 문서 유형
{{documentType}}

## 대상 독자
{{targetAudience}}

## 문서 주제
{{topic}}

## 포함할 내용
{{contentOutline}}

## 톤앤매너
{{tone}}

## 출력 형식
- 마크다운 형식
- 적절한 헤딩 구조 사용
- 코드 예시 포함 (해당되는 경우)
- 다이어그램 설명 포함 (필요시)`,
    variables: [
      { name: 'documentType', description: '문서 유형', type: 'select', required: true, options: ['API 문서', '사용자 가이드', '개발자 가이드', 'README', '아키텍처 문서', '릴리스 노트'] },
      { name: 'targetAudience', description: '대상 독자', type: 'text', required: true },
      { name: 'topic', description: '문서 주제', type: 'text', required: true },
      { name: 'contentOutline', description: '포함할 주요 내용', type: 'multiline', required: true },
      { name: 'tone', description: '문서 톤앤매너', type: 'select', required: false, options: ['공식적', '친근한', '기술적', '교육적'], defaultValue: '기술적' },
    ],
    examples: [
      'REST API 엔드포인트 문서화',
      '신규 기능 사용자 가이드',
      '시스템 아키텍처 설명',
    ],
    tags: ['문서', '기술문서', '가이드'],
  },

  // Analysis Templates
  {
    name: '요구사항 분석',
    description: '프로젝트 요구사항을 분석하고 구조화합니다',
    category: 'analysis',
    template: `## 프로젝트 개요
{{projectOverview}}

## 이해관계자
{{stakeholders}}

## 원본 요구사항
{{rawRequirements}}

## 분석 요청
1. 기능 요구사항 목록 추출
2. 비기능 요구사항 식별
3. 우선순위 제안
4. 잠재적 위험 요소 식별
5. 명확화가 필요한 항목 표시

## 출력 형식
- 구조화된 요구사항 목록 (ID, 설명, 우선순위, 의존성)
- 요구사항 간 관계도
- 위험 분석 표`,
    variables: [
      { name: 'projectOverview', description: '프로젝트 개요', type: 'multiline', required: true },
      { name: 'stakeholders', description: '이해관계자 정보', type: 'text', required: false },
      { name: 'rawRequirements', description: '원본 요구사항 (자유 형식)', type: 'multiline', required: true },
    ],
    examples: [
      '신규 e-commerce 플랫폼 요구사항',
      '레거시 시스템 마이그레이션 요건',
      '모바일 앱 기능 정의',
    ],
    tags: ['분석', '요구사항', '기획'],
  },

  // Data Templates
  {
    name: '데이터 스키마 설계',
    description: '데이터베이스 스키마나 API 스키마를 설계합니다',
    category: 'data',
    template: `## 목적
{{purpose}}

## 도메인 설명
{{domainDescription}}

## 주요 엔티티
{{entities}}

## 관계 요구사항
{{relationships}}

## 제약조건
- 데이터베이스 유형: {{databaseType}}
- 확장성 고려사항: {{scalabilityNotes}}

## 출력 형식
1. ERD (Mermaid 다이어그램)
2. 테이블/컬렉션 정의
3. 인덱스 전략
4. 마이그레이션 스크립트 (선택)`,
    variables: [
      { name: 'purpose', description: '스키마의 목적', type: 'text', required: true },
      { name: 'domainDescription', description: '도메인 설명', type: 'multiline', required: true },
      { name: 'entities', description: '주요 엔티티 나열', type: 'multiline', required: true },
      { name: 'relationships', description: '엔티티 간 관계', type: 'multiline', required: false },
      { name: 'databaseType', description: '데이터베이스 유형', type: 'select', required: true, options: ['PostgreSQL', 'MySQL', 'MongoDB', 'SQLite', 'Redis'] },
      { name: 'scalabilityNotes', description: '확장성 고려사항', type: 'text', required: false, defaultValue: '해당 없음' },
    ],
    examples: [
      '사용자 관리 시스템 스키마',
      '주문 처리 데이터 모델',
      '콘텐츠 관리 시스템 설계',
    ],
    tags: ['데이터', '스키마', '설계'],
  },

  // Design Templates
  {
    name: 'UI 컴포넌트 설계',
    description: 'UI 컴포넌트의 구조와 동작을 설계합니다',
    category: 'design',
    template: `## 컴포넌트 이름
{{componentName}}

## 목적
{{purpose}}

## 사용 컨텍스트
{{usageContext}}

## Props/속성
{{props}}

## 상태 관리
{{stateRequirements}}

## 사용자 인터랙션
{{interactions}}

## 디자인 요구사항
- 스타일 시스템: {{styleSystem}}
- 반응형 요구사항: {{responsiveRequirements}}
- 접근성: {{accessibilityNotes}}

## 출력 형식
1. 컴포넌트 구조 (JSX/Vue template)
2. Props 인터페이스 정의
3. 스타일 코드
4. 사용 예시`,
    variables: [
      { name: 'componentName', description: '컴포넌트 이름', type: 'text', required: true },
      { name: 'purpose', description: '컴포넌트 목적', type: 'text', required: true },
      { name: 'usageContext', description: '사용되는 맥락', type: 'multiline', required: true },
      { name: 'props', description: 'Props 목록', type: 'multiline', required: true },
      { name: 'stateRequirements', description: '상태 관리 요구사항', type: 'multiline', required: false },
      { name: 'interactions', description: '사용자 인터랙션', type: 'multiline', required: true },
      { name: 'styleSystem', description: '스타일 시스템', type: 'select', required: true, options: ['Tailwind CSS', 'CSS Modules', 'Styled Components', 'SCSS'] },
      { name: 'responsiveRequirements', description: '반응형 요구사항', type: 'text', required: false, defaultValue: '모바일 퍼스트' },
      { name: 'accessibilityNotes', description: '접근성 고려사항', type: 'text', required: false, defaultValue: 'WCAG 2.1 AA' },
    ],
    examples: [
      '데이터 테이블 컴포넌트',
      '모달 다이얼로그',
      '폼 인풋 컴포넌트 세트',
    ],
    tags: ['디자인', 'UI', '컴포넌트'],
  },
];

// ========================================
// Prompt Template Library Service
// ========================================

class PromptTemplateLibrary {
  private templates: Map<string, PromptTemplate> = new Map();
  private readonly storageKey = 'prompt_templates';

  constructor() {
    this.initializeBuiltinTemplates();
    this.loadFromStorage();
  }

  // ========================================
  // Initialization
  // ========================================

  private initializeBuiltinTemplates(): void {
    const now = new Date();
    for (const template of BUILTIN_TEMPLATES) {
      const id = `builtin_${template.name.replace(/\s+/g, '_').toLowerCase()}`;
      this.templates.set(id, {
        ...template,
        id,
        usageCount: 0,
        rating: 4.5,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const customTemplates = JSON.parse(stored) as PromptTemplate[];
        for (const template of customTemplates) {
          // Convert date strings back to Date objects
          template.createdAt = new Date(template.createdAt);
          template.updatedAt = new Date(template.updatedAt);
          this.templates.set(template.id, template);
        }
      }
    } catch (error) {
      console.warn('Failed to load templates from storage:', error);
    }
  }

  private saveToStorage(): void {
    try {
      const customTemplates = [...this.templates.values()].filter(t => !t.id.startsWith('builtin_'));
      localStorage.setItem(this.storageKey, JSON.stringify(customTemplates));
    } catch (error) {
      console.warn('Failed to save templates to storage:', error);
    }
  }

  // ========================================
  // Template CRUD
  // ========================================

  /**
   * Create a new template
   */
  createTemplate(template: Omit<PromptTemplate, 'id' | 'usageCount' | 'rating' | 'createdAt' | 'updatedAt'>): PromptTemplate {
    const id = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    const newTemplate: PromptTemplate = {
      ...template,
      id,
      usageCount: 0,
      rating: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.templates.set(id, newTemplate);
    this.saveToStorage();

    eventBus.emit('template:created', { templateId: id, name: template.name });

    return newTemplate;
  }

  /**
   * Get a template by ID
   */
  getTemplate(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Update an existing template
   */
  updateTemplate(id: string, updates: Partial<Omit<PromptTemplate, 'id' | 'createdAt'>>): PromptTemplate | undefined {
    const existing = this.templates.get(id);
    if (!existing) return undefined;

    // Don't allow updating builtin templates
    if (id.startsWith('builtin_')) {
      console.warn('Cannot update builtin templates');
      return existing;
    }

    const updated: PromptTemplate = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };

    this.templates.set(id, updated);
    this.saveToStorage();

    eventBus.emit('template:updated', { templateId: id });

    return updated;
  }

  /**
   * Delete a template
   */
  deleteTemplate(id: string): boolean {
    if (id.startsWith('builtin_')) {
      console.warn('Cannot delete builtin templates');
      return false;
    }

    const deleted = this.templates.delete(id);
    if (deleted) {
      this.saveToStorage();
      eventBus.emit('template:deleted', { templateId: id });
    }

    return deleted;
  }

  /**
   * Duplicate a template
   */
  duplicateTemplate(id: string, newName?: string): PromptTemplate | undefined {
    const original = this.templates.get(id);
    if (!original) return undefined;

    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, usageCount: _usageCount, rating: _rating, ...templateData } = original;

    return this.createTemplate({
      ...templateData,
      name: newName || `${original.name} (복사본)`,
    });
  }

  // ========================================
  // Template Search & Filter
  // ========================================

  /**
   * Search templates with various filters
   */
  searchTemplates(options: TemplateSearchOptions = {}): PromptTemplate[] {
    let results = [...this.templates.values()];

    // Filter by category
    if (options.category) {
      results = results.filter(t => t.category === options.category);
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      results = results.filter(t =>
        options.tags!.some(tag => t.tags.includes(tag))
      );
    }

    // Search by query
    if (options.query) {
      const query = options.query.toLowerCase();
      results = results.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Sort results
    const sortBy = options.sortBy || 'name';
    const sortOrder = options.sortOrder || 'asc';
    const multiplier = sortOrder === 'asc' ? 1 : -1;

    results.sort((a, b) => {
      switch (sortBy) {
        case 'usageCount':
          return (a.usageCount - b.usageCount) * multiplier;
        case 'rating':
          return (a.rating - b.rating) * multiplier;
        case 'createdAt':
          return (a.createdAt.getTime() - b.createdAt.getTime()) * multiplier;
        case 'updatedAt':
          return (a.updatedAt.getTime() - b.updatedAt.getTime()) * multiplier;
        default:
          return a.name.localeCompare(b.name) * multiplier;
      }
    });

    // Apply limit
    if (options.limit && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Get all categories with template counts
   */
  getCategories(): { category: PromptCategory; count: number }[] {
    const categoryMap = new Map<PromptCategory, number>();

    for (const template of this.templates.values()) {
      const current = categoryMap.get(template.category) || 0;
      categoryMap.set(template.category, current + 1);
    }

    return [...categoryMap.entries()].map(([category, count]) => ({ category, count }));
  }

  /**
   * Get all unique tags with template counts
   */
  getTags(): { tag: string; count: number }[] {
    const tagMap = new Map<string, number>();

    for (const template of this.templates.values()) {
      for (const tag of template.tags) {
        const current = tagMap.get(tag) || 0;
        tagMap.set(tag, current + 1);
      }
    }

    return [...tagMap.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  // ========================================
  // Template Rendering
  // ========================================

  /**
   * Render a template with variable values
   */
  renderTemplate(
    templateId: string,
    variables: Record<string, string>
  ): TemplateRenderResult {
    const template = this.templates.get(templateId);
    if (!template) {
      return {
        renderedPrompt: '',
        missingVariables: [],
        warnings: ['Template not found'],
      };
    }

    let renderedPrompt = template.template;
    const missingVariables: string[] = [];
    const warnings: string[] = [];

    // Replace variables
    for (const variable of template.variables) {
      const pattern = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g');
      const value = variables[variable.name];

      if (value !== undefined && value !== '') {
        renderedPrompt = renderedPrompt.replace(pattern, value);
      } else if (variable.defaultValue !== undefined) {
        renderedPrompt = renderedPrompt.replace(pattern, variable.defaultValue);
        warnings.push(`"${variable.name}"에 기본값 사용: ${variable.defaultValue}`);
      } else if (variable.required) {
        missingVariables.push(variable.name);
        renderedPrompt = renderedPrompt.replace(pattern, `[${variable.name} 필요]`);
      } else {
        renderedPrompt = renderedPrompt.replace(pattern, '');
      }
    }

    // Increment usage count
    if (missingVariables.length === 0) {
      template.usageCount++;
      this.saveToStorage();
    }

    return {
      renderedPrompt: renderedPrompt.trim(),
      missingVariables,
      warnings,
    };
  }

  /**
   * Validate template syntax
   */
  validateTemplate(template: string, variables: TemplateVariable[]): TemplateValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for undefined variables in template
    const variablePattern = /\{\{(\w+)\}\}/g;
    const definedVarNames = new Set(variables.map(v => v.name));
    let match;

    while ((match = variablePattern.exec(template)) !== null) {
      if (!definedVarNames.has(match[1])) {
        errors.push(`정의되지 않은 변수: {{${match[1]}}}`);
      }
    }

    // Check for unused variables
    for (const variable of variables) {
      if (!template.includes(`{{${variable.name}}}`)) {
        warnings.push(`사용되지 않는 변수: ${variable.name}`);
      }
    }

    // Check for unclosed variable tags
    const openTags = (template.match(/\{\{/g) || []).length;
    const closeTags = (template.match(/\}\}/g) || []).length;
    if (openTags !== closeTags) {
      errors.push('변수 태그가 올바르게 닫히지 않았습니다');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ========================================
  // Template Rating
  // ========================================

  /**
   * Rate a template
   */
  rateTemplate(id: string, rating: number): void {
    const template = this.templates.get(id);
    if (!template) return;

    // Simple average for now (could be improved with weighted averages)
    const currentTotal = template.rating * template.usageCount;
    const newTotal = currentTotal + rating;
    template.rating = newTotal / (template.usageCount + 1);

    this.saveToStorage();
  }

  // ========================================
  // Import/Export
  // ========================================

  /**
   * Export templates as JSON
   */
  exportTemplates(templateIds?: string[]): string {
    let templatesToExport: PromptTemplate[];

    if (templateIds) {
      templatesToExport = templateIds
        .map(id => this.templates.get(id))
        .filter((t): t is PromptTemplate => t !== undefined);
    } else {
      templatesToExport = [...this.templates.values()];
    }

    return JSON.stringify(templatesToExport, null, 2);
  }

  /**
   * Import templates from JSON
   */
  importTemplates(json: string): { imported: number; errors: string[] } {
    const errors: string[] = [];
    let imported = 0;

    try {
      const templates = JSON.parse(json) as PromptTemplate[];

      for (const template of templates) {
        try {
          // Skip if ID already exists
          if (this.templates.has(template.id)) {
            errors.push(`템플릿 ID 중복: ${template.id}`);
            continue;
          }

          this.templates.set(template.id, {
            ...template,
            createdAt: new Date(template.createdAt),
            updatedAt: new Date(template.updatedAt),
          });
          imported++;
        } catch (e) {
          errors.push(`템플릿 가져오기 실패: ${template.name}`);
        }
      }

      if (imported > 0) {
        this.saveToStorage();
      }
    } catch (e) {
      errors.push('JSON 파싱 실패');
    }

    return { imported, errors };
  }
}

// Export singleton instance
export const promptTemplateLibrary = new PromptTemplateLibrary();
export default promptTemplateLibrary;
