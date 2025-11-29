/**
 * AI Guidelines Service
 *
 * AI 인터뷰 결과를 기반으로 프로젝트 지침 문서를 생성합니다.
 * 이 지침은 AI가 태스크를 수행할 때 참조하는 기본 컨텍스트로 활용됩니다.
 */

import type { ConcretizedIdea, SuggestedTask } from './AIInterviewService';

export interface ProjectGuidelines {
  overview: string;
  technicalStack: string[];
  architecture: string;
  codingConventions: string;
  taskGuidelines: string;
  constraints: string[];
  generatedAt: Date;
}

/**
 * AI 지침 생성 서비스
 */
class AIGuidelinesService {
  /**
   * 구체화된 아이디어와 태스크를 기반으로 AI 지침 문서 생성
   */
  generateGuidelines(
    concretizedIdea: ConcretizedIdea,
    tasks: SuggestedTask[]
  ): string {
    const guidelines = this.buildGuidelines(concretizedIdea, tasks);
    return this.formatAsMarkdown(guidelines);
  }

  /**
   * 지침 데이터 구조 생성
   */
  private buildGuidelines(
    idea: ConcretizedIdea,
    tasks: SuggestedTask[]
  ): ProjectGuidelines {
    // 기술 스택 추출
    const technicalStack = idea.technicalSpecification?.stack || [];

    // 아키텍처 설명 생성
    const architecture = this.generateArchitectureDescription(idea, technicalStack);

    // 코딩 컨벤션 생성
    const codingConventions = this.generateCodingConventions(technicalStack);

    // 태스크 가이드라인 생성
    const taskGuidelines = this.generateTaskGuidelines(tasks);

    // 제약 조건 추출
    const constraints = idea.technicalSpecification?.constraints || [];

    return {
      overview: idea.summary,
      technicalStack,
      architecture,
      codingConventions,
      taskGuidelines,
      constraints,
      generatedAt: new Date(),
    };
  }

  /**
   * 아키텍처 설명 생성
   */
  private generateArchitectureDescription(
    idea: ConcretizedIdea,
    stack: string[]
  ): string {
    const parts: string[] = [];

    // 프레임워크 기반 아키텍처 추론
    const hasReact = stack.some(s => s.toLowerCase().includes('react'));
    const hasVue = stack.some(s => s.toLowerCase().includes('vue'));
    const hasNext = stack.some(s => s.toLowerCase().includes('next'));
    const hasNuxt = stack.some(s => s.toLowerCase().includes('nuxt'));
    const hasNode = stack.some(s => s.toLowerCase().includes('node'));
    const hasExpress = stack.some(s => s.toLowerCase().includes('express'));
    const hasFastAPI = stack.some(s => s.toLowerCase().includes('fastapi'));
    const hasDjango = stack.some(s => s.toLowerCase().includes('django'));
    const hasElectron = stack.some(s => s.toLowerCase().includes('electron'));
    const hasTypeScript = stack.some(s => s.toLowerCase().includes('typescript'));

    if (hasElectron) {
      parts.push('- **애플리케이션 타입**: Electron 데스크톱 애플리케이션');
      parts.push('- **프로세스 구조**: Main Process (Node.js) + Renderer Process (Chromium)');
    }

    if (hasNext) {
      parts.push('- **프레임워크**: Next.js (React 기반 풀스택 프레임워크)');
      parts.push('- **렌더링**: SSR/SSG/ISR 지원');
      parts.push('- **라우팅**: 파일 시스템 기반 라우팅');
    } else if (hasNuxt) {
      parts.push('- **프레임워크**: Nuxt.js (Vue 기반 풀스택 프레임워크)');
      parts.push('- **렌더링**: SSR/SSG 지원');
    } else if (hasReact) {
      parts.push('- **프론트엔드**: React SPA');
      parts.push('- **상태관리**: Redux/Zustand/Jotai 등 권장');
    } else if (hasVue) {
      parts.push('- **프론트엔드**: Vue.js SPA');
      parts.push('- **상태관리**: Pinia 권장');
    }

    if (hasNode || hasExpress) {
      parts.push('- **백엔드**: Node.js + Express');
      parts.push('- **API 스타일**: RESTful API');
    }

    if (hasFastAPI) {
      parts.push('- **백엔드**: Python FastAPI');
      parts.push('- **API 스타일**: RESTful API with automatic OpenAPI docs');
    }

    if (hasDjango) {
      parts.push('- **백엔드**: Python Django');
      parts.push('- **패턴**: MVT (Model-View-Template)');
    }

    if (hasTypeScript) {
      parts.push('- **타입 시스템**: TypeScript 사용');
      parts.push('- **타입 안전성**: 엄격한 타입 체크 적용 권장');
    }

    // 데이터베이스 추론
    const hasPostgres = stack.some(s => s.toLowerCase().includes('postgres'));
    const hasMongoDB = stack.some(s => s.toLowerCase().includes('mongo'));
    const hasSQLite = stack.some(s => s.toLowerCase().includes('sqlite'));
    const hasMySQL = stack.some(s => s.toLowerCase().includes('mysql'));

    if (hasPostgres) {
      parts.push('- **데이터베이스**: PostgreSQL');
    } else if (hasMongoDB) {
      parts.push('- **데이터베이스**: MongoDB (NoSQL)');
    } else if (hasSQLite) {
      parts.push('- **데이터베이스**: SQLite (로컬 저장)');
    } else if (hasMySQL) {
      parts.push('- **데이터베이스**: MySQL');
    }

    if (parts.length === 0) {
      parts.push('- 구체적인 아키텍처는 태스크 수행 중 결정됩니다.');
    }

    return parts.join('\n');
  }

  /**
   * 코딩 컨벤션 생성
   */
  private generateCodingConventions(stack: string[]): string {
    const conventions: string[] = [];

    const hasTypeScript = stack.some(s => s.toLowerCase().includes('typescript'));
    const hasReact = stack.some(s => s.toLowerCase().includes('react'));
    const hasVue = stack.some(s => s.toLowerCase().includes('vue'));
    const hasPython = stack.some(s => s.toLowerCase().includes('python') ||
                                     s.toLowerCase().includes('django') ||
                                     s.toLowerCase().includes('fastapi'));

    // 공통 컨벤션
    conventions.push('### 공통');
    conventions.push('- 의미 있는 변수/함수명 사용 (영어)');
    conventions.push('- 주석은 한글로 작성 가능');
    conventions.push('- 함수는 단일 책임 원칙 준수');
    conventions.push('- 에러 처리 철저히 수행');

    if (hasTypeScript) {
      conventions.push('\n### TypeScript');
      conventions.push('- `any` 타입 사용 최소화');
      conventions.push('- 인터페이스와 타입 적극 활용');
      conventions.push('- 옵셔널 체이닝(`?.`) 사용');
      conventions.push('- null 병합 연산자(`??`) 활용');
    }

    if (hasReact) {
      conventions.push('\n### React');
      conventions.push('- 함수형 컴포넌트 사용');
      conventions.push('- Hooks 활용 (useState, useEffect, useMemo, useCallback)');
      conventions.push('- 컴포넌트 파일은 PascalCase');
      conventions.push('- Props 타입 명시');
    }

    if (hasVue) {
      conventions.push('\n### Vue');
      conventions.push('- Composition API 사용 (`<script setup>`)');
      conventions.push('- 컴포넌트 파일은 PascalCase');
      conventions.push('- Props/Emits 타입 명시');
      conventions.push('- `ref`, `computed`, `watch` 적극 활용');
    }

    if (hasPython) {
      conventions.push('\n### Python');
      conventions.push('- PEP 8 스타일 가이드 준수');
      conventions.push('- 타입 힌트 사용');
      conventions.push('- docstring 작성');
      conventions.push('- snake_case 네이밍');
    }

    return conventions.join('\n');
  }

  /**
   * 태스크 가이드라인 생성
   */
  private generateTaskGuidelines(tasks: SuggestedTask[]): string {
    const guidelines: string[] = [];

    // 태스크 카테고리별 분류
    const categories = new Map<string, SuggestedTask[]>();
    tasks.forEach(task => {
      const category = task.category || 'general';
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(task);
    });

    // 카테고리별 가이드라인
    categories.forEach((categoryTasks, category) => {
      guidelines.push(`### ${this.formatCategoryName(category)} (${categoryTasks.length}개 태스크)`);

      categoryTasks.slice(0, 5).forEach((task, idx) => {
        guidelines.push(`${idx + 1}. **${task.title}**`);
        if (task.description) {
          const shortDesc = task.description.length > 100
            ? task.description.substring(0, 100) + '...'
            : task.description;
          guidelines.push(`   - ${shortDesc}`);
        }
      });

      if (categoryTasks.length > 5) {
        guidelines.push(`   - ... 외 ${categoryTasks.length - 5}개 태스크`);
      }
      guidelines.push('');
    });

    // 실행 순서 권장사항
    guidelines.push('### 실행 순서 권장사항');
    guidelines.push('1. 설정 및 환경 구축 태스크 먼저 수행');
    guidelines.push('2. 데이터 모델/스키마 정의');
    guidelines.push('3. 핵심 기능 구현');
    guidelines.push('4. UI/UX 구현');
    guidelines.push('5. 테스트 및 검증');
    guidelines.push('6. 최적화 및 마무리');

    return guidelines.join('\n');
  }

  /**
   * 카테고리 이름 포맷팅
   */
  private formatCategoryName(category: string): string {
    const names: Record<string, string> = {
      'setup': '환경 설정',
      'backend': '백엔드',
      'frontend': '프론트엔드',
      'database': '데이터베이스',
      'api': 'API',
      'ui': 'UI/UX',
      'testing': '테스트',
      'deployment': '배포',
      'documentation': '문서화',
      'general': '일반',
    };
    return names[category.toLowerCase()] || category;
  }

  /**
   * 마크다운 형식으로 포맷팅
   */
  private formatAsMarkdown(guidelines: ProjectGuidelines): string {
    const sections: string[] = [];

    // 헤더
    sections.push('# 프로젝트 AI 지침서');
    sections.push('');
    sections.push(`> 이 문서는 AI 인터뷰 결과를 기반으로 자동 생성되었습니다.`);
    sections.push(`> 생성일: ${guidelines.generatedAt.toLocaleDateString('ko-KR')}`);
    sections.push('');

    // 개요
    sections.push('## 📋 프로젝트 개요');
    sections.push('');
    sections.push(guidelines.overview);
    sections.push('');

    // 기술 스택
    sections.push('## 🛠️ 기술 스택');
    sections.push('');
    if (guidelines.technicalStack.length > 0) {
      guidelines.technicalStack.forEach(tech => {
        sections.push(`- ${tech}`);
      });
    } else {
      sections.push('- 태스크 수행 중 결정 예정');
    }
    sections.push('');

    // 아키텍처
    sections.push('## 🏗️ 아키텍처');
    sections.push('');
    sections.push(guidelines.architecture);
    sections.push('');

    // 코딩 컨벤션
    sections.push('## 📝 코딩 컨벤션');
    sections.push('');
    sections.push(guidelines.codingConventions);
    sections.push('');

    // 태스크 가이드라인
    sections.push('## 📌 태스크 가이드라인');
    sections.push('');
    sections.push(guidelines.taskGuidelines);
    sections.push('');

    // 제약 조건
    if (guidelines.constraints.length > 0) {
      sections.push('## ⚠️ 제약 조건');
      sections.push('');
      guidelines.constraints.forEach(constraint => {
        sections.push(`- ${constraint}`);
      });
      sections.push('');
    }

    // AI 참조 안내
    sections.push('## 🤖 AI 참조 안내');
    sections.push('');
    sections.push('이 지침서는 AI가 태스크를 수행할 때 컨텍스트로 제공됩니다.');
    sections.push('');
    sections.push('- 각 태스크 수행 시 이 문서를 참조하여 일관성 유지');
    sections.push('- 기술 스택과 컨벤션을 준수하여 코드 작성');
    sections.push('- 제약 조건을 고려한 구현');
    sections.push('- 불명확한 부분은 사용자에게 확인 요청');
    sections.push('');

    return sections.join('\n');
  }

  /**
   * 기존 지침서 업데이트 (태스크 추가 시)
   */
  updateGuidelinesWithNewTasks(
    existingGuidelines: string,
    newTasks: SuggestedTask[]
  ): string {
    // 새 태스크 섹션 생성
    const newTasksSection = this.generateNewTasksSection(newTasks);

    // 기존 지침서에 추가
    const updateNote = `\n\n---\n\n## 📥 추가된 태스크 (${new Date().toLocaleDateString('ko-KR')})\n\n${newTasksSection}`;

    return existingGuidelines + updateNote;
  }

  /**
   * 새 태스크 섹션 생성
   */
  private generateNewTasksSection(tasks: SuggestedTask[]): string {
    const lines: string[] = [];

    tasks.forEach((task, idx) => {
      lines.push(`### ${idx + 1}. ${task.title}`);
      if (task.description) {
        lines.push(`- ${task.description}`);
      }
      if (task.category) {
        lines.push(`- 카테고리: ${this.formatCategoryName(task.category)}`);
      }
      if (task.estimatedMinutes) {
        lines.push(`- 예상 시간: ${task.estimatedMinutes}분`);
      }
      lines.push('');
    });

    return lines.join('\n');
  }
}

export const aiGuidelinesService = new AIGuidelinesService();
