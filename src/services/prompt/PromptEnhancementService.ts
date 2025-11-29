/**
 * Prompt Enhancement Service
 *
 * AI-powered service for enhancing and refining prompts.
 * Provides suggestions, improvements, and optimization for task prompts.
 */

import { eventBus } from '../events/EventBus';

// ========================================
// Types
// ========================================

export interface PromptAnalysis {
  clarity: number; // 0-100
  specificity: number; // 0-100
  completeness: number; // 0-100
  actionability: number; // 0-100
  overallScore: number; // 0-100
  issues: PromptIssue[];
  suggestions: PromptSuggestion[];
}

export interface PromptIssue {
  type: 'vague' | 'incomplete' | 'ambiguous' | 'too_long' | 'too_short' | 'missing_context' | 'missing_output_format';
  severity: 'low' | 'medium' | 'high';
  message: string;
  position?: { start: number; end: number };
}

export interface PromptSuggestion {
  type: 'add' | 'modify' | 'remove' | 'restructure';
  priority: 'low' | 'medium' | 'high';
  description: string;
  before?: string;
  after?: string;
  reason: string;
}

export interface EnhancementResult {
  originalPrompt: string;
  enhancedPrompt: string;
  analysis: PromptAnalysis;
  appliedSuggestions: PromptSuggestion[];
  improvements: string[];
}

export interface EnhancementOptions {
  targetAudience?: 'ai' | 'human' | 'technical' | 'non-technical';
  outputFormat?: 'code' | 'document' | 'design' | 'data' | 'general';
  complexity?: 'simple' | 'moderate' | 'complex';
  language?: string;
  maxLength?: number;
  preserveStyle?: boolean;
  focusAreas?: ('clarity' | 'specificity' | 'completeness' | 'actionability')[];
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: PromptCategory;
  template: string;
  variables: TemplateVariable[];
  examples: string[];
  tags: string[];
  usageCount: number;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateVariable {
  name: string;
  description: string;
  type: 'text' | 'number' | 'select' | 'multiline';
  required: boolean;
  defaultValue?: string;
  options?: string[]; // For select type
  validation?: string; // Regex pattern
}

export type PromptCategory =
  | 'coding'
  | 'writing'
  | 'analysis'
  | 'design'
  | 'data'
  | 'translation'
  | 'summarization'
  | 'brainstorming'
  | 'debugging'
  | 'review'
  | 'custom';

// ========================================
// Prompt Enhancement Service
// ========================================

class PromptEnhancementService {
  private readonly enhancementPatterns: Map<string, RegExp>;
  private readonly qualityIndicators: Map<string, (prompt: string) => number>;

  constructor() {
    this.enhancementPatterns = this.initializePatterns();
    this.qualityIndicators = this.initializeQualityIndicators();
  }

  // ========================================
  // Pattern Initialization
  // ========================================

  private initializePatterns(): Map<string, RegExp> {
    return new Map([
      ['vague_words', /\b(것|무언가|어떤|좀|약간|대충|그냥|뭔가|something|some|kind of|sort of|maybe|probably)\b/gi],
      ['action_verbs', /\b(만들어|작성|생성|분석|검토|수정|개선|구현|설계|create|write|build|analyze|review|implement|design)\b/gi],
      ['output_format', /\b(형식|포맷|JSON|XML|HTML|마크다운|format|output|return|response)\b/gi],
      ['context_markers', /\b(배경|컨텍스트|상황|목적|이유|context|background|purpose|reason|because)\b/gi],
      ['constraints', /\b(제한|조건|요구사항|필수|반드시|constraint|requirement|must|should|limit)\b/gi],
      ['examples', /\b(예시|예를 들어|예:|example|e\.g\.|for instance|such as)\b/gi],
      ['questions', /[?？]/g],
    ]);
  }

  private initializeQualityIndicators(): Map<string, (prompt: string) => number> {
    return new Map([
      ['clarity', (prompt: string) => this.measureClarity(prompt)],
      ['specificity', (prompt: string) => this.measureSpecificity(prompt)],
      ['completeness', (prompt: string) => this.measureCompleteness(prompt)],
      ['actionability', (prompt: string) => this.measureActionability(prompt)],
    ]);
  }

  // ========================================
  // Quality Measurement
  // ========================================

  private measureClarity(prompt: string): number {
    let score = 70; // Base score

    // Penalize vague words
    const vagueMatches = prompt.match(this.enhancementPatterns.get('vague_words')!) || [];
    score -= vagueMatches.length * 5;

    // Reward clear structure (sentences, paragraphs)
    const sentences = prompt.split(/[.。!！?？]/).filter(s => s.trim().length > 0);
    if (sentences.length >= 2) score += 10;

    // Penalize very long sentences
    const avgSentenceLength = prompt.length / Math.max(sentences.length, 1);
    if (avgSentenceLength > 150) score -= 15;
    else if (avgSentenceLength > 100) score -= 5;

    // Reward proper punctuation
    const punctuationRatio = (prompt.match(/[,，.。:：;；]/g) || []).length / Math.max(prompt.length / 50, 1);
    if (punctuationRatio > 0.5) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  private measureSpecificity(prompt: string): number {
    let score = 50; // Base score

    // Reward specific numbers and quantities
    const numbers = prompt.match(/\d+/g) || [];
    score += Math.min(numbers.length * 5, 20);

    // Reward technical terms or specific entities
    const technicalPatterns = /\b(API|함수|클래스|컴포넌트|데이터베이스|function|class|component|database|module|service)\b/gi;
    const technicalMatches = prompt.match(technicalPatterns) || [];
    score += Math.min(technicalMatches.length * 5, 15);

    // Reward examples
    const exampleMatches = prompt.match(this.enhancementPatterns.get('examples')!) || [];
    score += exampleMatches.length * 10;

    // Reward constraints
    const constraintMatches = prompt.match(this.enhancementPatterns.get('constraints')!) || [];
    score += Math.min(constraintMatches.length * 5, 15);

    return Math.max(0, Math.min(100, score));
  }

  private measureCompleteness(prompt: string): number {
    let score = 40; // Base score

    // Check for context
    const contextMatches = prompt.match(this.enhancementPatterns.get('context_markers')!) || [];
    if (contextMatches.length > 0) score += 15;

    // Check for output format specification
    const formatMatches = prompt.match(this.enhancementPatterns.get('output_format')!) || [];
    if (formatMatches.length > 0) score += 15;

    // Check for constraints/requirements
    const constraintMatches = prompt.match(this.enhancementPatterns.get('constraints')!) || [];
    if (constraintMatches.length > 0) score += 10;

    // Check for examples
    const exampleMatches = prompt.match(this.enhancementPatterns.get('examples')!) || [];
    if (exampleMatches.length > 0) score += 10;

    // Minimum length check
    if (prompt.length > 100) score += 10;
    if (prompt.length > 300) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  private measureActionability(prompt: string): number {
    let score = 50; // Base score

    // Reward action verbs
    const actionMatches = prompt.match(this.enhancementPatterns.get('action_verbs')!) || [];
    score += Math.min(actionMatches.length * 10, 30);

    // Penalize too many questions (unclear what to do)
    const questionMatches = prompt.match(this.enhancementPatterns.get('questions')!) || [];
    if (questionMatches.length > 3) score -= 10;

    // Reward imperative mood (commands)
    const imperativePatterns = /^(해주세요|작성해|만들어|분석해|Please|Create|Write|Build|Analyze|Generate)/gim;
    const imperativeMatches = prompt.match(imperativePatterns) || [];
    score += Math.min(imperativeMatches.length * 10, 20);

    return Math.max(0, Math.min(100, score));
  }

  // ========================================
  // Prompt Analysis
  // ========================================

  /**
   * Analyze a prompt and provide quality metrics and suggestions
   */
  analyzePrompt(prompt: string): PromptAnalysis {
    const clarity = this.qualityIndicators.get('clarity')!(prompt);
    const specificity = this.qualityIndicators.get('specificity')!(prompt);
    const completeness = this.qualityIndicators.get('completeness')!(prompt);
    const actionability = this.qualityIndicators.get('actionability')!(prompt);

    const overallScore = Math.round(
      (clarity * 0.25 + specificity * 0.25 + completeness * 0.25 + actionability * 0.25)
    );

    const issues = this.detectIssues(prompt, { clarity, specificity, completeness, actionability });
    const suggestions = this.generateSuggestions(prompt, issues);

    return {
      clarity,
      specificity,
      completeness,
      actionability,
      overallScore,
      issues,
      suggestions,
    };
  }

  private detectIssues(
    prompt: string,
    scores: { clarity: number; specificity: number; completeness: number; actionability: number }
  ): PromptIssue[] {
    const issues: PromptIssue[] = [];

    // Check for vague language
    const vagueMatches = prompt.match(this.enhancementPatterns.get('vague_words')!);
    if (vagueMatches && vagueMatches.length > 2) {
      issues.push({
        type: 'vague',
        severity: vagueMatches.length > 5 ? 'high' : 'medium',
        message: `모호한 표현이 ${vagueMatches.length}개 발견되었습니다: ${vagueMatches.slice(0, 3).join(', ')}`,
      });
    }

    // Check for missing context
    if (scores.completeness < 50) {
      const contextMatches = prompt.match(this.enhancementPatterns.get('context_markers')!);
      if (!contextMatches) {
        issues.push({
          type: 'missing_context',
          severity: 'medium',
          message: '배경 정보나 컨텍스트가 부족합니다. 왜 이 작업이 필요한지 설명해주세요.',
        });
      }
    }

    // Check for missing output format
    const formatMatches = prompt.match(this.enhancementPatterns.get('output_format')!);
    if (!formatMatches) {
      issues.push({
        type: 'missing_output_format',
        severity: 'medium',
        message: '원하는 출력 형식이 명시되지 않았습니다.',
      });
    }

    // Check prompt length
    if (prompt.length < 50) {
      issues.push({
        type: 'too_short',
        severity: 'high',
        message: '프롬프트가 너무 짧습니다. 더 상세한 설명이 필요합니다.',
      });
    } else if (prompt.length > 2000) {
      issues.push({
        type: 'too_long',
        severity: 'low',
        message: '프롬프트가 매우 깁니다. 핵심 내용을 정리해보세요.',
      });
    }

    // Check for ambiguous instructions
    if (scores.actionability < 50) {
      issues.push({
        type: 'ambiguous',
        severity: 'medium',
        message: '구체적인 행동 지시가 부족합니다. 무엇을 해야 하는지 명확히 해주세요.',
      });
    }

    return issues;
  }

  private generateSuggestions(prompt: string, issues: PromptIssue[]): PromptSuggestion[] {
    const suggestions: PromptSuggestion[] = [];

    for (const issue of issues) {
      switch (issue.type) {
        case 'vague':
          suggestions.push({
            type: 'modify',
            priority: 'high',
            description: '모호한 표현을 구체적인 표현으로 변경하세요',
            reason: '명확한 표현은 AI가 의도를 정확히 이해하는 데 도움이 됩니다.',
          });
          break;

        case 'missing_context':
          suggestions.push({
            type: 'add',
            priority: 'medium',
            description: '배경 정보를 추가하세요',
            after: '## 배경\n이 작업은 [프로젝트명]의 일부로, [목적]을 위해 필요합니다.\n\n',
            reason: '컨텍스트는 AI가 적절한 응답을 생성하는 데 중요합니다.',
          });
          break;

        case 'missing_output_format':
          suggestions.push({
            type: 'add',
            priority: 'medium',
            description: '출력 형식을 명시하세요',
            after: '\n\n## 출력 형식\n결과를 다음 형식으로 제공해주세요:\n- [형식 설명]',
            reason: '명확한 출력 형식은 일관된 결과를 보장합니다.',
          });
          break;

        case 'too_short':
          suggestions.push({
            type: 'add',
            priority: 'high',
            description: '다음 요소들을 추가하세요: 목표, 제약조건, 예시, 출력 형식',
            reason: '상세한 프롬프트는 더 정확한 결과를 생성합니다.',
          });
          break;

        case 'ambiguous':
          suggestions.push({
            type: 'restructure',
            priority: 'high',
            description: '명령형 문장으로 시작하고, 단계별로 지시사항을 나열하세요',
            reason: '명확한 지시는 AI가 올바른 행동을 취하도록 합니다.',
          });
          break;
      }
    }

    return suggestions;
  }

  // ========================================
  // Prompt Enhancement
  // ========================================

  /**
   * Enhance a prompt with AI-powered improvements
   */
  async enhancePrompt(
    prompt: string,
    options: EnhancementOptions = {}
  ): Promise<EnhancementResult> {
    const analysis = this.analyzePrompt(prompt);
    const appliedSuggestions: PromptSuggestion[] = [];
    const improvements: string[] = [];

    let enhancedPrompt = prompt;

    // Apply automatic enhancements based on analysis
    if (analysis.overallScore < 70) {
      // Add structure if missing
      if (!this.hasStructure(prompt)) {
        enhancedPrompt = this.addStructure(enhancedPrompt, options);
        improvements.push('프롬프트 구조화');
      }

      // Add output format if missing
      if (!this.hasOutputFormat(prompt)) {
        enhancedPrompt = this.addOutputFormat(enhancedPrompt, options);
        improvements.push('출력 형식 추가');
        appliedSuggestions.push({
          type: 'add',
          priority: 'medium',
          description: '출력 형식 명시',
          reason: '명확한 출력 형식 지정',
        });
      }

      // Add constraints if applicable
      if (options.complexity && !this.hasConstraints(prompt)) {
        enhancedPrompt = this.addConstraints(enhancedPrompt, options);
        improvements.push('제약조건 추가');
      }

      // Replace vague words
      enhancedPrompt = this.replaceVagueWords(enhancedPrompt);
      if (enhancedPrompt !== prompt) {
        improvements.push('모호한 표현 개선');
      }
    }

    // Ensure action-oriented opening
    if (analysis.actionability < 60) {
      enhancedPrompt = this.ensureActionOriented(enhancedPrompt);
      improvements.push('행동 지향적 표현으로 개선');
    }

    // Emit enhancement event
    eventBus.emit('prompt:enhanced', {
      originalScore: analysis.overallScore,
      enhancedScore: this.analyzePrompt(enhancedPrompt).overallScore,
      improvements,
    });

    return {
      originalPrompt: prompt,
      enhancedPrompt,
      analysis,
      appliedSuggestions,
      improvements,
    };
  }

  private hasStructure(prompt: string): boolean {
    const structurePatterns = /^(#|##|\d+\.|•|-|\*|목표|배경|요구사항|Goal|Background|Requirements)/m;
    return structurePatterns.test(prompt);
  }

  private hasOutputFormat(prompt: string): boolean {
    const formatMatches = prompt.match(this.enhancementPatterns.get('output_format')!);
    return formatMatches !== null && formatMatches.length > 0;
  }

  private hasConstraints(prompt: string): boolean {
    const constraintMatches = prompt.match(this.enhancementPatterns.get('constraints')!);
    return constraintMatches !== null && constraintMatches.length > 0;
  }

  private addStructure(prompt: string, options: EnhancementOptions): string {
    const sections: string[] = [];

    sections.push('## 목표');
    sections.push(prompt.trim());

    if (options.outputFormat) {
      sections.push('\n## 출력 형식');
      sections.push(this.getOutputFormatDescription(options.outputFormat));
    }

    return sections.join('\n');
  }

  private addOutputFormat(prompt: string, options: EnhancementOptions): string {
    const format = options.outputFormat || 'general';
    const formatDescription = this.getOutputFormatDescription(format);

    return `${prompt}\n\n## 출력 형식\n${formatDescription}`;
  }

  private getOutputFormatDescription(format: string): string {
    const formats: Record<string, string> = {
      code: '- 코드는 적절한 언어로 작성하고 주석을 포함해주세요\n- 필요한 경우 사용 예시도 제공해주세요',
      document: '- 마크다운 형식으로 작성해주세요\n- 제목, 소제목, 목록을 적절히 활용해주세요',
      design: '- 디자인 스펙을 명확히 기술해주세요\n- 컴포넌트 구조와 스타일을 설명해주세요',
      data: '- JSON 형식으로 데이터를 반환해주세요\n- 스키마 설명을 포함해주세요',
      general: '- 명확하고 이해하기 쉬운 형식으로 응답해주세요',
    };

    return formats[format] || formats.general;
  }

  private addConstraints(prompt: string, options: EnhancementOptions): string {
    const constraints: string[] = [];

    if (options.complexity === 'simple') {
      constraints.push('- 간단하고 직관적인 해결책을 제시해주세요');
      constraints.push('- 불필요한 복잡성을 피해주세요');
    } else if (options.complexity === 'complex') {
      constraints.push('- 확장성과 유지보수성을 고려해주세요');
      constraints.push('- 엣지 케이스도 처리해주세요');
    }

    if (options.maxLength) {
      constraints.push(`- 응답은 ${options.maxLength}자 이내로 작성해주세요`);
    }

    if (constraints.length > 0) {
      return `${prompt}\n\n## 제약조건\n${constraints.join('\n')}`;
    }

    return prompt;
  }

  private replaceVagueWords(prompt: string): string {
    const replacements: [RegExp, string][] = [
      [/\b(그냥|just)\s+/gi, ''],
      [/\b(좀|약간|some|a bit)\s+/gi, ''],
      [/\b(대충|roughly)\s+/gi, '대략적으로 '],
      [/\b(뭔가|something)\s+/gi, '특정 '],
      [/\b(어떤|some kind of)\s+/gi, ''],
    ];

    let result = prompt;
    for (const [pattern, replacement] of replacements) {
      result = result.replace(pattern, replacement);
    }

    return result;
  }

  private ensureActionOriented(prompt: string): string {
    const trimmed = prompt.trim();

    // Check if already starts with action verb
    const actionStart = /^(만들어|작성|생성|분석|검토|수정|개선|구현|설계|해주세요|Please|Create|Write|Build|Analyze|Generate|Design|Implement)/i;
    if (actionStart.test(trimmed)) {
      return prompt;
    }

    // Add action-oriented prefix if not present
    const isKorean = /[가-힣]/.test(prompt);
    if (isKorean) {
      return `다음 작업을 수행해주세요:\n\n${prompt}`;
    } else {
      return `Please complete the following task:\n\n${prompt}`;
    }
  }

  // ========================================
  // Prompt Comparison
  // ========================================

  /**
   * Compare two prompts and highlight differences
   */
  comparePrompts(original: string, enhanced: string): {
    additions: string[];
    modifications: string[];
    removals: string[];
    scoreImprovement: number;
  } {
    const originalAnalysis = this.analyzePrompt(original);
    const enhancedAnalysis = this.analyzePrompt(enhanced);

    const originalWords = new Set(original.split(/\s+/));
    const enhancedWords = new Set(enhanced.split(/\s+/));

    const additions = [...enhancedWords].filter(w => !originalWords.has(w));
    const removals = [...originalWords].filter(w => !enhancedWords.has(w));

    return {
      additions,
      modifications: [], // Simplified for now
      removals,
      scoreImprovement: enhancedAnalysis.overallScore - originalAnalysis.overallScore,
    };
  }

  // ========================================
  // Quick Enhancements
  // ========================================

  /**
   * Add specific improvements to a prompt
   */
  addContext(prompt: string, context: string): string {
    return `## 배경\n${context}\n\n## 작업\n${prompt}`;
  }

  addExamples(prompt: string, examples: string[]): string {
    const exampleSection = examples.map((ex, i) => `${i + 1}. ${ex}`).join('\n');
    return `${prompt}\n\n## 예시\n${exampleSection}`;
  }

  addCustomConstraints(prompt: string, constraints: string[]): string {
    const constraintSection = constraints.map(c => `- ${c}`).join('\n');
    return `${prompt}\n\n## 제약조건\n${constraintSection}`;
  }

  specifyOutputFormat(prompt: string, format: { type: string; details: string }): string {
    return `${prompt}\n\n## 출력 형식\n**형식:** ${format.type}\n${format.details}`;
  }
}

// Export singleton instance
export const promptEnhancementService = new PromptEnhancementService();
export default promptEnhancementService;
