# Recent Changes & Development Context

## 최근 작업 내역 (2025-12-11)

### 1. Script Task UI 개선

**목적**: 스크립트 타입 태스크와 AI 태스크의 UI를 명확하게 구분하여 사용자 경험 향상

**변경된 파일**:

- `src/components/board/TaskCard.vue`

**주요 변경사항**:

#### 태스크 카드 헤더 재구성

- **2개 행으로 분리**:
    - **첫 번째 행**: AI Provider (AI 태스크) 또는 Script Language (스크립트 태스크)
    - **두 번째 행**: 결과물 타입 + 태스크 ID + 실행 순서

#### 스크립트 태스크 전용 UI

1. **헤더 아이콘**: AI Provider 대신 스크립트 언어 표시 (JavaScript, Python, Bash 등)
    - 녹색 배지 (`bg-green-100`)로 AI 태스크와 시각적 구분
    - `scriptIcon` computed property 사용

2. **버튼 레이블 변경**: "프롬프트" → "스크립트"

    ```typescript
    task.taskType === 'script' ? '스크립트' : '프롬프트';
    ```

3. **불필요한 버튼 제거**:
    - **세분화 버튼**: `v-if="showSubdivideButton && task.taskType !== 'script'"`
    - **고도화 버튼**: `v-if="showEnhancePromptButton && task.taskType !== 'script'"`

4. **설정 검증 로직 업데이트**:
    ```typescript
    const isScriptTask = props.task.taskType === 'script';
    if (!hasPrompt) missing.push(isScriptTask ? '스크립트' : '프롬프트');
    if (!hasProvider && !isScriptTask) missing.push('AI Provider');
    ```

### 2. Monaco Editor 설정 수정

**목적**: Monaco Editor의 web worker 로딩 에러 해결

**변경된 파일**:

- `vite.config.ts`
- `src/components/common/CodeEditor.vue`

**주요 변경사항**:

#### Vite 설정

- `vite-plugin-monaco-editor` 플러그인 추가

    ```typescript
    import monacoEditorPlugin from 'vite-plugin-monaco-editor';

    plugins: [
        vue(),
        monacoEditorPlugin({
            languageWorkers: ['editorWorkerService', 'typescript', 'json', 'html'],
        }),
    ];
    ```

#### CodeEditor 컴포넌트

- `MonacoEnvironment.getWorkerUrl` 설정 추가
- TypeScript, JavaScript, JSON, HTML, CSS 언어별 worker URL 매핑
- 매크로 삽입 기능 지원 (`{{task:N}}`, `{{project.name}}` 등)

## 아키텍처 개요

### Task 타입 시스템

프로젝트는 두 가지 태스크 타입을 지원합니다:

1. **AI Task** (`taskType: 'ai'` 또는 undefined)
    - AI Provider 기반 실행
    - 프롬프트 고도화 지원
    - 세분화 기능 지원
    - 필수: `aiProvider`, `generatedPrompt`

2. **Script Task** (`taskType: 'script'`)
    - 로컬 스크립트 실행
    - 언어: JavaScript, Python, Bash
    - 필수: `scriptLanguage`, `scriptContent`
    - AI Provider 불필요

### 주요 컴포넌트

#### TaskCard.vue

- 위치: `src/components/board/TaskCard.vue`
- 역할: 칸반 보드에서 개별 태스크 카드 표시
- Props:
    - `task`: Task 객체
    - `subtasks`: 서브태스크 배열
    - `missingProvider`: 미연동 Provider 정보

#### CodeEditor.vue

- 위치: `src/components/common/CodeEditor.vue`
- 역할: 스크립트 편집을 위한 Monaco Editor 래퍼
- Props:
    - `modelValue`: 스크립트 내용
    - `language`: 스크립트 언어 ('javascript' | 'python' | 'bash')
    - `height`: 에디터 높이
    - `readonly`: 읽기 전용 모드

### 데이터베이스 스키마

**Task 테이블** (일부 필드):

```sql
taskType TEXT CHECK(taskType IN ('ai', 'script')) DEFAULT 'ai',
scriptLanguage TEXT CHECK(scriptLanguage IN ('javascript', 'python', 'bash')),
scriptContent TEXT,
aiProvider TEXT,
generatedPrompt TEXT,
```

## 개발 가이드

### 스크립트 태스크 추가 시 체크리스트

1. **TaskDetailPanel.vue**: 스크립트 타입 선택 시 CodeEditor 표시
2. **TaskCard.vue**: 스크립트 언어 아이콘 및 버튼 레이블 확인
3. **script-executor.ts**: 스크립트 실행 로직
4. **iconMapping.ts**: `getScriptLanguageIcon()` 함수로 언어별 아이콘 매핑

### AI 태스크 추가 시 체크리스트

1. **provider-registry.ts**: 새 Provider 등록
2. **AIServiceManager.ts**: Provider 인스턴스 생성 로직
3. **TaskCard.vue**: Provider 아이콘 및 정보 표시

## 다음 작업 예정

### 현재 알려진 이슈

- Lint warnings (사용하지 않는 변수들):
    - `aiProviderColor`
    - `handlePause`, `handleResume`
    - `handleConnectProviderClick`

### 개선 가능한 영역

1. **Script Task 실행 로직 강화**
    - 에러 핸들링 개선
    - 실행 로그 표시
    - 중단/재시작 기능

2. **Monaco Editor 기능 확장**
    - 코드 자동완성 개선
    - Linting 지원
    - 디버깅 기능

3. **태스크 카드 성능 최적화**
    - 대량 태스크 렌더링 최적화
    - Virtual scrolling 고려

## 참고 문서

- [Component Implementation Guide](./COMPONENT_IMPLEMENTATION_GUIDE.md)
- [Architecture Overview](../ARCHITECTURE.md)
- [Database Schema](../electron/main/database/schema.ts)
