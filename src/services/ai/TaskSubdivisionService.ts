import type { Task } from '@core/types/database';

export interface SubtaskSuggestion {
  title: string;
  description: string;
  estimatedMinutes: number | null;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  tags?: string[];
}

export interface SubdivisionSuggestion {
  subtasks: SubtaskSuggestion[];
  reasoning: string;
  totalEstimatedMinutes: number;
}

/**
 * AI 기반 태스크 세분화 제안 서비스
 */
export class TaskSubdivisionService {
  /**
   * 태스크를 AI가 분석하여 서브태스크로 세분화 제안
   */
  async suggestSubdivision(task: Task): Promise<SubdivisionSuggestion> {
    // TODO: 실제 AI API 호출 (Claude, GPT 등)
    // 현재는 데모 시뮬레이션

    // 시뮬레이션: 1-2초 대기
    await this.simulateAIProcessing();

    // 태스크 내용 분석
    const analysis = this.analyzeTask(task);

    // AI 제안 생성 (시뮬레이션)
    const suggestions = this.generateSuggestions(task, analysis);

    return suggestions;
  }

  /**
   * AI 처리 시뮬레이션
   */
  private async simulateAIProcessing(): Promise<void> {
    const delay = 1500 + Math.random() * 1000; // 1.5-2.5초
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * 태스크 분석
   */
  private analyzeTask(task: Task): {
    complexity: 'low' | 'medium' | 'high';
    suggestedCount: number;
    categories: string[];
  } {
    const titleWords = task.title.split(' ').length;
    const descWords = task.description?.split(' ').length || 0;
    const estimatedHours = (task.estimatedMinutes || 0) / 60;

    // 복잡도 판단
    let complexity: 'low' | 'medium' | 'high' = 'medium';
    if (estimatedHours > 10 || (titleWords + descWords) > 20) {
      complexity = 'high';
    } else if (estimatedHours < 4 && (titleWords + descWords) < 10) {
      complexity = 'low';
    }

    // 제안할 서브태스크 수
    const suggestedCount =
      complexity === 'high' ? 5 :
      complexity === 'medium' ? 3 :
      2;

    // 카테고리 추출 (태그 기반)
    const categories = task.tags?.slice(0, 3) || ['development'];

    return { complexity, suggestedCount, categories };
  }

  /**
   * 세분화 제안 생성
   */
  private generateSuggestions(
    task: Task,
    analysis: { complexity: string; suggestedCount: number; categories: string[] }
  ): SubdivisionSuggestion {
    const subtasks: SubtaskSuggestion[] = [];
    const totalMinutes = task.estimatedMinutes || 480; // 기본 8시간
    const avgMinutes = Math.floor(totalMinutes / analysis.suggestedCount);

    // 태스크 유형에 따른 세분화 패턴
    const patterns = this.getSubdivisionPatterns(task, analysis);

    for (let i = 0; i < analysis.suggestedCount; i++) {
      const pattern = patterns[i] || patterns[patterns.length - 1];
      subtasks.push({
        title: pattern.title,
        description: pattern.description,
        estimatedMinutes: Math.floor(avgMinutes * (pattern.weight || 1)),
        priority: i === 0 ? 'high' : i === analysis.suggestedCount - 1 ? 'medium' : 'medium',
        tags: [...(analysis.categories || []), ...(pattern.tags || [])],
      });
    }

    return {
      subtasks,
      reasoning: this.generateReasoning(task, analysis, subtasks.length),
      totalEstimatedMinutes: subtasks.reduce((sum, st) => sum + (st.estimatedMinutes || 0), 0),
    };
  }

  /**
   * 태스크 유형에 따른 세분화 패턴
   */
  private getSubdivisionPatterns(
    task: Task,
    analysis: { categories: string[] }
  ): Array<{ title: string; description: string; weight?: number; tags?: string[] }> {
    const title = task.title.toLowerCase();
    const desc = task.description?.toLowerCase() || '';

    // 테스트 관련
    if (title.includes('테스트') || title.includes('test')) {
      return [
        {
          title: '테스트 환경 설정 및 구성',
          description: '테스트 프레임워크 설치, 설정 파일 구성, 필요한 도구 설정',
          weight: 0.8,
          tags: ['setup'],
        },
        {
          title: '기본 기능 테스트 케이스 작성',
          description: '핵심 기능에 대한 테스트 케이스 구현',
          weight: 1.2,
          tags: ['test-cases'],
        },
        {
          title: '엣지 케이스 및 에러 처리 테스트',
          description: '예외 상황과 에러 처리에 대한 테스트 추가',
          weight: 1.0,
          tags: ['edge-cases'],
        },
        {
          title: 'CI/CD 파이프라인 통합',
          description: '자동화된 테스트 실행 환경 구축',
          weight: 1.0,
          tags: ['ci-cd'],
        },
      ];
    }

    // API 관련
    if (title.includes('api') || title.includes('서버') || title.includes('백엔드')) {
      return [
        {
          title: 'API 스펙 설계 및 문서화',
          description: 'Endpoint, Request/Response 구조 정의, Swagger/OpenAPI 문서 작성',
          weight: 0.8,
          tags: ['design', 'docs'],
        },
        {
          title: 'Core API 엔드포인트 구현',
          description: '주요 기능의 API 엔드포인트 개발',
          weight: 1.3,
          tags: ['implementation'],
        },
        {
          title: '인증 및 권한 처리',
          description: 'JWT, OAuth 등 인증 시스템 구현',
          weight: 1.0,
          tags: ['auth', 'security'],
        },
        {
          title: 'API 테스트 및 검증',
          description: '통합 테스트, E2E 테스트 작성',
          weight: 0.9,
          tags: ['testing'],
        },
      ];
    }

    // UI/Frontend 관련
    if (title.includes('ui') || title.includes('컴포넌트') || title.includes('화면')) {
      return [
        {
          title: 'UI 디자인 및 레이아웃 구성',
          description: 'Figma 디자인 기반 레이아웃 구조 개발',
          weight: 1.0,
          tags: ['design', 'layout'],
        },
        {
          title: 'Core 컴포넌트 구현',
          description: '재사용 가능한 기본 컴포넌트 개발',
          weight: 1.2,
          tags: ['components'],
        },
        {
          title: '상태 관리 및 데이터 흐름',
          description: 'Vuex/Pinia, Props/Events 구조 설계',
          weight: 1.0,
          tags: ['state-management'],
        },
        {
          title: '반응형 및 접근성 개선',
          description: '다양한 화면 크기 대응, ARIA 속성 추가',
          weight: 0.8,
          tags: ['responsive', 'a11y'],
        },
      ];
    }

    // 기본 패턴
    return [
      {
        title: `${task.title} - 요구사항 분석 및 설계`,
        description: '기능 요구사항 정리, 기술 스택 선정, 아키텍처 설계',
        weight: 0.8,
        tags: ['planning'],
      },
      {
        title: `${task.title} - Core 기능 구현`,
        description: '핵심 기능 개발 및 비즈니스 로직 구현',
        weight: 1.4,
        tags: ['implementation'],
      },
      {
        title: `${task.title} - 테스트 및 품질 검증`,
        description: '단위 테스트, 통합 테스트 작성 및 코드 리뷰',
        weight: 0.8,
        tags: ['testing', 'qa'],
      },
    ];
  }

  /**
   * AI 제안 이유 생성
   */
  private generateReasoning(task: Task, analysis: any, subtaskCount: number): string {
    const complexityText =
      analysis.complexity === 'high' ? '높음' :
      analysis.complexity === 'medium' ? '중간' :
      '낮음';

    const estimatedHours = Math.floor((task.estimatedMinutes || 0) / 60);

    return `이 작업은 예상 소요 시간이 ${estimatedHours}시간이고 복잡도가 "${complexityText}"로 평가됩니다. ` +
      `효율적인 관리를 위해 ${subtaskCount}개의 서브태스크로 세분화하는 것을 추천합니다. ` +
      `각 서브태스크는 명확한 목표와 산출물을 가지며, 독립적으로 진행 가능하도록 설계되었습니다.`;
  }

  /**
   * 실제 AI API 호출 (구현 예정)
   */
  private async callAIAPI(task: Task): Promise<SubdivisionSuggestion> {
    // TODO: Anthropic Claude API, OpenAI GPT API 호출
    // const prompt = `다음 작업을 효율적인 서브태스크로 세분화해주세요:\n\n제목: ${task.title}\n설명: ${task.description}\n예상 시간: ${task.estimatedMinutes}분`;

    throw new Error('AI API integration not yet implemented');
  }
}

// 싱글톤 인스턴스
export const taskSubdivisionService = new TaskSubdivisionService();
