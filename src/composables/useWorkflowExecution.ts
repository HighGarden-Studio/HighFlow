import { ref, computed, onUnmounted } from 'vue';
import type { Task } from '@core/types/database';
import { AdvancedTaskExecutor } from '../services/workflow/AdvancedTaskExecutor';
import { ExecutionPlanner } from '../services/workflow/ExecutionPlanner';
import type {
  ExecutionPlan,
  WorkflowResult,
  Progress,
  ExecutionOptions,
  Constraints,
} from '../services/workflow/types';

export function useWorkflowExecution() {
  const executor = new AdvancedTaskExecutor();
  const planner = new ExecutionPlanner();

  const isExecuting = ref(false);
  const currentProgress = ref<Progress | null>(null);
  const currentPlan = ref<ExecutionPlan | null>(null);
  const executionResult = ref<WorkflowResult | null>(null);
  const error = ref<Error | null>(null);

  // 실행 중인 워크플로우 ID
  const workflowId = computed(() => currentPlan.value?.workflowId);

  /**
   * 워크플로우 실행 계획 생성
   */
  const createExecutionPlan = async (
    tasks: Task[],
    constraints?: Constraints
  ): Promise<ExecutionPlan> => {
    try {
      error.value = null;
      let plan = await planner.createPlan(tasks);

      if (constraints) {
        plan = await planner.optimizePlan(plan, constraints);
      }

      currentPlan.value = plan;
      return plan;
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err));
      throw err;
    }
  };

  /**
   * 워크플로우 실행
   */
  const executeWorkflow = async (
    tasks: Task[],
    options: ExecutionOptions = {}
  ): Promise<WorkflowResult> => {
    try {
      isExecuting.value = true;
      error.value = null;
      executionResult.value = null;

      // 실행 계획 생성
      if (!currentPlan.value) {
        await createExecutionPlan(tasks);
      }

      if (!currentPlan.value) {
        throw new Error('Failed to create execution plan');
      }

      // 진행 상태 콜백
      const progressCallback = (progress: Progress) => {
        currentProgress.value = progress;
      };

      // 실행
      const result = await executor.executeWorkflow(
        tasks,
        currentPlan.value,
        progressCallback,
        options
      );

      executionResult.value = result;
      return result;
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err));
      throw err;
    } finally {
      isExecuting.value = false;
    }
  };

  /**
   * 워크플로우 일시정지
   */
  const pauseWorkflow = async (): Promise<void> => {
    if (workflowId.value) {
      await executor.pauseWorkflow(workflowId.value);
    }
  };

  /**
   * 워크플로우 재개
   */
  const resumeWorkflow = async (): Promise<void> => {
    if (workflowId.value) {
      await executor.resumeWorkflow(workflowId.value);
      // TODO: 재개 후 실행 계속
    }
  };

  /**
   * 워크플로우 취소
   */
  const cancelWorkflow = async (): Promise<void> => {
    if (workflowId.value) {
      await executor.cancelWorkflow(workflowId.value);
      isExecuting.value = false;
    }
  };

  /**
   * 실행 계획 시각화
   */
  const visualizePlan = () => {
    if (currentPlan.value) {
      return planner.visualizePlan(currentPlan.value);
    }
    return null;
  };

  /**
   * 진행률 (퍼센트)
   */
  const progressPercentage = computed(() => {
    return currentProgress.value?.percentage || 0;
  });

  /**
   * 예상 완료 시간 (ETA) - 포맷팅
   */
  const formattedETA = computed(() => {
    if (!currentProgress.value?.eta) return null;

    const seconds = Math.floor(currentProgress.value.eta / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}시간 ${minutes % 60}분`;
    } else if (minutes > 0) {
      return `${minutes}분 ${seconds % 60}초`;
    } else {
      return `${seconds}초`;
    }
  });

  /**
   * 경과 시간 - 포맷팅
   */
  const formattedElapsedTime = computed(() => {
    if (!currentProgress.value?.elapsedTime) return '0초';

    const seconds = Math.floor(currentProgress.value.elapsedTime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}시간 ${minutes % 60}분`;
    } else if (minutes > 0) {
      return `${minutes}분 ${seconds % 60}초`;
    } else {
      return `${seconds}초`;
    }
  });

  /**
   * 워크플로우 상태
   */
  const workflowState = computed(() => {
    if (workflowId.value) {
      return executor.getWorkflowState(workflowId.value);
    }
    return null;
  });

  /**
   * 체크포인트 목록
   */
  const checkpoints = computed(() => {
    if (workflowId.value) {
      return executor.getCheckpoints(workflowId.value);
    }
    return [];
  });

  /**
   * 정리
   */
  onUnmounted(() => {
    // 실행 중인 워크플로우가 있다면 취소
    if (isExecuting.value && workflowId.value) {
      cancelWorkflow();
    }
  });

  return {
    // 상태
    isExecuting,
    currentProgress,
    currentPlan,
    executionResult,
    error,
    workflowId,
    workflowState,
    checkpoints,

    // 계산된 값
    progressPercentage,
    formattedETA,
    formattedElapsedTime,

    // 메서드
    createExecutionPlan,
    executeWorkflow,
    pauseWorkflow,
    resumeWorkflow,
    cancelWorkflow,
    visualizePlan,
  };
}
