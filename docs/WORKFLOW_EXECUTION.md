# 고급 Task 실행 엔진

AI Workflow Manager의 고급 워크플로우 실행 시스템 문서입니다.

## 개요

이 시스템은 복잡한 Task 워크플로우를 자동으로 실행, 모니터링, 관리하는 기능을 제공합니다. DAG(Directed Acyclic Graph) 기반의 의존성 관리, 병렬 실행, 자동 재시도, 조건부 실행 등을 지원합니다.

## 주요 기능

### 1. ExecutionPlanner - 실행 계획 수립

Task들의 의존성을 분석하여 최적의 실행 계획을 생성합니다.

#### 기능

- **의존성 그래프 생성**: Task 간 의존성을 DAG로 표현
- **토폴로지 정렬**: 실행 순서 결정
- **병렬 그룹핑**: 동시 실행 가능한 Task를 Stage로 그룹화
- **Critical Path 계산**: 전체 실행 시간에 영향을 주는 최장 경로 식별
- **리소스 할당**: AI 제공자별 동시 실행 수 및 Rate Limit 관리
- **비용/시간 예측**: 전체 워크플로우의 예상 소요 시간 및 비용 계산

#### 사용 예시

```typescript
import { ExecutionPlanner } from '@/services/workflow/ExecutionPlanner';

const planner = new ExecutionPlanner();

// 실행 계획 생성
const plan = await planner.createPlan(tasks);

console.log('총 Stage 수:', plan.stages.length);
console.log('예상 소요 시간:', plan.estimatedDuration, 'ms');
console.log('예상 비용:', plan.estimatedCost);
console.log('Critical Path:', plan.criticalPath.map(t => t.title));

// 제약 조건을 적용한 최적화
const optimizedPlan = await planner.optimizePlan(plan, {
  maxDuration: 3600000, // 1시간
  maxCost: 10.0,
  maxParallelism: 5,
  priority: 'high',
});

// 시각화 데이터 생성
const visualization = planner.visualizePlan(plan);
```

#### Stage 구조

각 Stage는 병렬로 실행 가능한 Task들의 그룹입니다:

```typescript
interface Stage {
  id: number;
  tasks: Task[];
  canRunInParallel: boolean;
  estimatedDuration: number;
  dependencies: number[]; // 이전 Stage IDs
}
```

### 2. AdvancedTaskExecutor - Task 실행 엔진

Task 실행의 모든 측면을 관리하는 핵심 엔진입니다.

#### 주요 기능

##### 직렬/병렬 실행

```typescript
import { AdvancedTaskExecutor } from '@/services/workflow/AdvancedTaskExecutor';

const executor = new AdvancedTaskExecutor();

// 단일 Task 실행
const result = await executor.executeTask(task, context, {
  timeout: 300000, // 5분
  retryStrategy: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  },
  fallbackProviders: ['openai', 'google'], // AI 제공자 폴백
});

// 워크플로우 실행 (병렬 포함)
const workflowResult = await executor.executeWorkflow(
  tasks,
  executionPlan,
  (progress) => {
    console.log(`진행률: ${progress.percentage}%`);
    console.log(`완료: ${progress.completedTasks}/${progress.totalTasks}`);
  },
  {
    parallelism: 3, // 최대 3개 Task 동시 실행
    checkpoints: true, // 체크포인트 저장
    contextPassing: true, // 이전 결과를 다음 Task로 전달
  }
);
```

##### 에러 처리 및 재시도

자동 재시도 with 지수 백오프:

```typescript
const retryStrategy = {
  maxRetries: 3,
  initialDelay: 1000, // 1초
  maxDelay: 30000, // 최대 30초
  backoffMultiplier: 2, // 2배씩 증가
  retryableErrors: ['timeout', 'network', '429', '500'], // 재시도 가능한 에러
};
```

재시도 간격:
- 1회 실패: 1초 대기
- 2회 실패: 2초 대기
- 3회 실패: 4초 대기

##### 폴백 AI 제공자

주 제공자 실패 시 자동으로 다음 제공자로 전환:

```typescript
{
  aiProvider: 'anthropic',
  fallbackProviders: ['openai', 'google'],
}
```

##### 체크포인트 & 재개

워크플로우 중간 상태 저장 및 복원:

```typescript
// 일시정지
await executor.pauseWorkflow(workflowId);

// 체크포인트 조회
const checkpoints = executor.getCheckpoints(workflowId);

// 재개
await executor.resumeWorkflow(workflowId);
```

##### 컨텍스트 전달

이전 Task의 결과를 다음 Task의 입력으로 사용:

```typescript
// Task 설명에서 변수 치환
const task = {
  title: 'Summary Task',
  description: '다음 내용을 요약해주세요: {{previous_result}}',
};

// 실행 시 자동으로 이전 Task 결과가 치환됨
```

지원하는 변수:
- `{{previous_result}}`: 직전 Task 결과
- `{{task_id}}`: 현재 Task ID
- `{{task_title}}`: 현재 Task 제목
- 커스텀 변수: `context.variables`에 추가 가능

##### 조건부 실행

조건에 따라 Task 실행 여부 결정:

```typescript
const condition = {
  type: 'task_status',
  field: '123', // Task ID
  operator: '==',
  value: 'success',
};

const shouldExecute = await executor.evaluateCondition(condition, context);
```

조건 타입:
- `task_status`: Task 상태 확인
- `variable`: 변수 값 확인
- `cost`: 누적 비용 확인
- `time`: 경과 시간 확인
- `custom`: 커스텀 로직

연산자:
- `==`, `!=`: 같음/다름
- `>`, `<`, `>=`, `<=`: 크기 비교
- `contains`: 포함
- `matches`: 정규식 매칭

##### 리소스 관리

```typescript
// 예산 제한
const context = {
  budget: {
    maxCost: 10.0,
    currentCost: 0,
    maxTokens: 100000,
    currentTokens: 0,
  },
};

// 실행 중 예산 초과 시 자동으로 BudgetExceededError 발생
```

### 3. AutomationEngine - 자동화 규칙 엔진

이벤트 기반의 자동화 규칙을 관리하고 실행합니다.

#### 트리거 타입

```typescript
type Trigger =
  // Task 상태 변경 시
  | { type: 'task.status_changed'; from: string; to: string; taskId?: number }
  // Task 할당 시
  | { type: 'task.assigned'; userId: number; taskId?: number }
  // Task 생성 시
  | { type: 'task.created'; projectId: number }
  // Comment 생성 시 (멘션 포함)
  | { type: 'comment.created'; taskId: number; mentions?: number[] }
  // 시간 경과 시
  | { type: 'time.elapsed'; duration: number; since: Date }
  // 예약 시간 시
  | { type: 'time.scheduled'; datetime: string; cron?: string }
  // Webhook 수신 시
  | { type: 'webhook.received'; webhookId: string; payload: any }
  // 비용 초과 시
  | { type: 'cost.exceeded'; threshold: number; currentCost: number }
  // 수동 실행
  | { type: 'manual'; userId: number };
```

#### 액션 타입

```typescript
type Action =
  // Task 생성
  | { type: 'task.create'; template: TaskTemplate; projectId: number }
  // Task 업데이트
  | { type: 'task.update'; taskId: number; changes: Partial<Task> }
  // Task 실행
  | { type: 'task.execute'; taskId: number; options?: ExecutionOptions }
  // 알림 전송
  | { type: 'notification.send'; userId: number; message: string; channel: 'email' | 'push' | 'slack' }
  // Webhook 호출
  | { type: 'webhook.call'; url: string; method: 'GET' | 'POST' | 'PUT'; payload?: any }
  // AI 실행
  | { type: 'ai.execute'; taskId: number; provider?: string }
  // Slack 통합
  | { type: 'integration.slack'; channel: string; message: string }
  // 워크플로우 제어
  | { type: 'workflow.start' | 'workflow.stop'; workflowId: string }
  // 변수 설정
  | { type: 'variable.set'; name: string; value: any }
  // 지연
  | { type: 'delay'; duration: number };
```

#### 사용 예시

```typescript
import { automationEngine } from '@/services/automation/AutomationEngine';

// 규칙 등록: Task가 DONE이 되면 다음 Task 자동 실행
const ruleId = automationEngine.registerTrigger(
  {
    type: 'task.status_changed',
    from: 'in_progress',
    to: 'done',
    taskId: 123,
  },
  [
    // 조건: 특정 프로젝트의 Task만
    {
      type: 'variable',
      field: 'projectId',
      operator: '==',
      value: 1,
    },
  ],
  [
    // 액션 1: 다음 Task 실행
    {
      type: 'task.execute',
      taskId: 124,
    },
    // 액션 2: 알림 전송
    {
      type: 'notification.send',
      userId: 1,
      message: 'Task 123 완료! Task 124가 자동으로 시작되었습니다.',
      channel: 'push',
    },
  ],
  {
    name: '연쇄 Task 실행',
    description: 'Task 완료 시 다음 Task를 자동으로 실행',
    createdBy: 1,
    projectId: 1,
  }
);

// 이벤트 발생 시 규칙 실행
await automationEngine.handleEvent({
  id: 'event-123',
  type: 'task.status_changed',
  payload: {
    task: { id: 123, status: 'done', projectId: 1 },
    from: 'in_progress',
    to: 'done',
  },
  timestamp: new Date(),
  projectId: 1,
});

// 규칙 관리
automationEngine.disableRule(ruleId);
automationEngine.enableRule(ruleId);
automationEngine.deleteRule(ruleId);

// 통계 조회
const stats = automationEngine.getStatistics();
console.log('총 규칙 수:', stats.totalRules);
console.log('실행 횟수:', stats.totalExecutions);
```

#### 자동화 예시 시나리오

##### 1. Task 체인 실행

```typescript
// Task A 완료 → Task B 자동 실행
automationEngine.registerTrigger(
  { type: 'task.status_changed', from: 'in_progress', to: 'done', taskId: A },
  [],
  [{ type: 'task.execute', taskId: B }],
  { name: 'Task Chain' }
);
```

##### 2. 일일 리포트 생성

```typescript
// 매일 오전 9시에 리포트 Task 생성
automationEngine.registerTrigger(
  { type: 'time.scheduled', cron: '0 9 * * *' },
  [],
  [{
    type: 'task.create',
    template: {
      title: '일일 리포트',
      description: '어제의 진행 상황을 요약해주세요',
      priority: 'high',
      aiProvider: 'anthropic',
    },
    projectId: 1,
  }],
  { name: 'Daily Report' }
);
```

##### 3. 비용 경고

```typescript
// 누적 비용이 $5 초과 시 알림
automationEngine.registerTrigger(
  { type: 'cost.exceeded', threshold: 5.0, currentCost: 0 },
  [],
  [{
    type: 'notification.send',
    userId: 1,
    message: '워크플로우 비용이 $5를 초과했습니다!',
    channel: 'email',
  }],
  { name: 'Cost Alert' }
);
```

##### 4. Webhook 통합

```typescript
// Task 완료 시 외부 시스템에 알림
automationEngine.registerTrigger(
  { type: 'task.status_changed', to: 'done' },
  [],
  [{
    type: 'webhook.call',
    url: 'https://example.com/webhook',
    method: 'POST',
    payload: { taskId: '{{task_id}}', status: 'completed' },
  }],
  { name: 'External Webhook' }
);
```

## Vue Composable 사용법

### useWorkflowExecution

워크플로우 실행을 위한 Vue Composable:

```vue
<script setup lang="ts">
import { useWorkflowExecution } from '@/composables/useWorkflowExecution';

const {
  isExecuting,
  currentProgress,
  currentPlan,
  executionResult,
  error,
  progressPercentage,
  formattedETA,
  formattedElapsedTime,
  createExecutionPlan,
  executeWorkflow,
  pauseWorkflow,
  resumeWorkflow,
  cancelWorkflow,
  visualizePlan,
} = useWorkflowExecution();

// 실행 계획 생성
const plan = await createExecutionPlan(tasks, {
  maxDuration: 3600000,
  maxCost: 10.0,
  maxParallelism: 3,
});

// 워크플로우 실행
const result = await executeWorkflow(tasks, {
  parallelism: 3,
  checkpoints: true,
  retryStrategy: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  },
});

// 제어
await pauseWorkflow();
await resumeWorkflow();
await cancelWorkflow();
</script>

<template>
  <div>
    <!-- 진행률 표시 -->
    <p>진행률: {{ progressPercentage }}%</p>
    <p>예상 완료 시간: {{ formattedETA }}</p>
    <p>경과 시간: {{ formattedElapsedTime }}</p>

    <!-- 진행 상태 -->
    <div v-if="currentProgress">
      Stage {{ currentProgress.currentStage }}/{{ currentProgress.totalStages }}
      ({{ currentProgress.completedTasks }}/{{ currentProgress.totalTasks }} 완료)
    </div>

    <!-- 에러 표시 -->
    <div v-if="error" class="error">
      {{ error.message }}
    </div>

    <!-- 결과 표시 -->
    <div v-if="executionResult">
      <p>상태: {{ executionResult.status }}</p>
      <p>성공: {{ executionResult.successCount }}</p>
      <p>실패: {{ executionResult.failureCount }}</p>
      <p>총 비용: ${{ executionResult.totalCost.toFixed(2) }}</p>
      <p>총 소요 시간: {{ executionResult.totalDuration }}ms</p>
    </div>
  </div>
</template>
```

## UI 컴포넌트

### WorkflowProgress

진행 상황을 시각적으로 표시하는 컴포넌트:

```vue
<template>
  <WorkflowProgress
    :progress="currentProgress"
    :show-details="true"
  />
</template>
```

기능:
- 진행률 바 (색상 변화)
- Stage/Task 진행 상황
- 경과 시간 및 ETA
- 실패한 Task 수

### ExecutionControls

실행 제어 버튼 컴포넌트:

```vue
<template>
  <ExecutionControls
    :is-executing="isExecuting"
    :is-paused="isPaused"
    @execute="handleExecute"
    @pause="handlePause"
    @resume="handleResume"
    @cancel="handleCancel"
  />
</template>
```

버튼:
- 실행: 워크플로우 시작
- 일시정지: 실행 중지 (재개 가능)
- 재개: 일시정지된 워크플로우 계속
- 취소: 워크플로우 종료

## 실행 흐름

```
1. Task 수집
   ↓
2. ExecutionPlanner로 계획 생성
   - 의존성 분석
   - 토폴로지 정렬
   - Stage 그룹핑
   - 리소스 할당
   ↓
3. AdvancedTaskExecutor로 실행
   - Stage별 순차 실행
   - Stage 내 Task 병렬 실행
   - 진행 상태 알림
   ↓
4. Task 실행
   - 컨텍스트 변수 치환
   - AI 서비스 호출
   - 재시도 (실패 시)
   - 폴백 제공자 전환
   ↓
5. 결과 수집
   - TaskResult 생성
   - 체크포인트 저장
   - 다음 Task로 컨텍스트 전달
   ↓
6. WorkflowResult 반환
```

## 에러 처리

### 에러 타입

```typescript
// 재시도 가능한 에러
class RetryableError extends WorkflowError {
  constructor(message: string, retryAfter?: number);
}

// 예산 초과 에러
class BudgetExceededError extends WorkflowError {
  constructor(currentCost: number, maxCost: number);
}

// 타임아웃 에러
class TimeoutError extends WorkflowError {
  constructor(taskId: number, timeout: number);
}
```

### 에러 처리 전략

1. **재시도 가능한 에러**: 자동으로 지수 백오프로 재시도
2. **폴백 가능한 에러**: 다음 AI 제공자로 전환
3. **치명적 에러**: 즉시 실패, 워크플로우 중단
4. **부분 실패**: 일부 Task만 실패해도 워크플로우 계속 (옵션)

## 성능 최적화

### 병렬 실행

- 의존성이 없는 Task는 자동으로 병렬 실행
- `maxParallelism` 옵션으로 동시 실행 수 제한
- AI 제공자별 Rate Limit 준수

### 체크포인트

- 긴 워크플로우는 중간 상태를 저장
- 실패 시 처음부터 다시 시작할 필요 없음
- 메모리 효율적 (완료된 Task 결과만 저장)

### 리소스 관리

- AI 제공자별 동시 요청 수 제한
- Rate Limit 초과 시 자동 대기
- 비용/토큰 예산 실시간 추적

## 제한사항

1. **순환 의존성**: 지원하지 않음 (토폴로지 정렬 시 에러)
2. **동적 워크플로우**: 실행 중 Task 추가/제거 불가
3. **분산 실행**: 현재는 단일 프로세스에서만 실행
4. **영구 저장소**: 체크포인트는 메모리에만 저장 (DB 통합 필요)

## 향후 개선 사항

1. **분산 실행**: 여러 워커 노드에서 Task 실행
2. **ML 기반 예측**: 실행 시간 및 비용을 머신러닝으로 예측
3. **동적 최적화**: 실행 중 계획을 재조정
4. **고급 시각화**: 실시간 Gantt 차트, DAG 그래프
5. **데이터베이스 통합**: 체크포인트 및 실행 이력 영구 저장
6. **Webhook 트리거**: 외부 이벤트로 워크플로우 시작
7. **조건부 브랜칭**: IF-THEN-ELSE 워크플로우 지원

## 예시 프로젝트

전체 예시는 `examples/workflow-execution.md`를 참조하세요.
