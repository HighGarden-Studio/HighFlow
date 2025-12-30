import type { Task, TaskAttachment } from '@core/types/database';
import type { EnabledProviderInfo, MCPServerRuntimeConfig } from '@core/types/ai';

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

// ========== Execution Context ==========
export interface ExecutionContext {
    workflowId?: string;
    taskId?: number;
    userId: number;
    projectId?: number;
    variables?: Record<string, any>;
    previousResults?: TaskResult[];
    startTime?: Date;
    budget?: BudgetConstraints;
    metadata?: Record<string, any>;
    onLog?: (level: LogLevel, message: string, details?: any) => void;
}

export interface BudgetConstraints {
    maxCost: number;
    currentCost: number;
    maxTokens?: number;
    currentTokens?: number;
}

// ========== Execution Options ==========
export interface ExecutionOptions {
    timeout?: number; // 밀리초
    retryStrategy?: RetryStrategy;
    fallbackProviders?: string[]; // AI 제공자 폴백 순서
    checkpoints?: boolean; // 체크포인트 저장 여부
    contextPassing?: boolean; // 이전 결과 전달 여부
    parallelism?: number; // 최대 병렬 실행 수
    costLimit?: number; // 최대 비용
    priority?: 'low' | 'normal' | 'high';
    streaming?: boolean;
    apiKeys?: {
        anthropic?: string;
        openai?: string;
        google?: string;
        groq?: string;
        lmstudio?: string;
    };
    enabledProviders?: EnabledProviderInfo[];
    mcpServers?: MCPServerRuntimeConfig[];
    onLog?: (level: LogLevel, message: string, details?: any) => void;
    signal?: AbortSignal;
}

export interface RetryStrategy {
    maxRetries: number;
    initialDelay: number; // 밀리초
    maxDelay: number;
    backoffMultiplier: number; // 지수 백오프 승수
    retryableErrors?: string[]; // 재시도 가능한 에러 타입
}

// ========== Task Result ==========
export interface TaskResult {
    taskId: number;
    projectSequence?: number; // Added to support sequence-based macros
    taskTitle?: string; // Optional task title for display in dependency results
    status: 'success' | 'failure' | 'partial' | 'skipped';
    output: any;
    error?: Error;
    startTime: Date;
    endTime: Date;
    duration: number;
    cost?: number;
    tokens?: number;
    retries: number;
    checkpointId?: string;
    metadata: Record<string, any>;
    attachments?: TaskAttachment[];
}

// ========== Workflow Result ==========
export interface WorkflowResult {
    workflowId: string;
    status: 'completed' | 'failed' | 'partial' | 'cancelled';
    taskResults: TaskResult[];
    totalDuration: number;
    totalCost: number;
    totalTokens: number;
    successCount: number;
    failureCount: number;
    startTime: Date;
    endTime: Date;
    error?: Error;
}

// ========== Progress Tracking ==========
export interface Progress {
    workflowId: string;
    currentStage: number;
    totalStages: number;
    currentTask: number;
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    percentage: number;
    eta?: number; // 예상 완료 시간 (밀리초)
    currentTaskName?: string;
    elapsedTime: number;
    estimatedTotalTime?: number;
}

// ========== Execution Plan ==========
export interface ExecutionPlan {
    workflowId: string;
    stages: Stage[]; // 병렬 실행 그룹
    criticalPath: Task[];
    estimatedDuration: number; // 밀리초
    estimatedCost: number;
    resourceAllocation: ResourceMap;
    dependencyGraph: DependencyGraph;
    metadata: Record<string, any>;
}

export interface Stage {
    id: number;
    tasks: Task[];
    canRunInParallel: boolean;
    estimatedDuration: number;
    dependencies: number[]; // Stage IDs
}

export interface ResourceMap {
    [providerId: string]: {
        maxConcurrency: number;
        rateLimit: number; // requests per minute
        estimatedUsage: number;
    };
}

export interface DependencyGraph {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface GraphNode {
    taskId: number;
    task: Task;
    level: number; // 토폴로지 레벨
    estimatedDuration: number;
}

export interface GraphEdge {
    from: number;
    to: number;
    type: 'dependency' | 'context' | 'conditional';
}

// ========== Checkpointing ==========
export interface Checkpoint {
    id: string;
    workflowId: string;
    timestamp: Date;
    completedTasks: number[];
    context: ExecutionContext;
    nextTaskId?: number;
    metadata: Record<string, any>;
}

// ========== Conditions ==========
export interface Condition {
    type: 'task_status' | 'variable' | 'cost' | 'time' | 'custom';
    operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'matches';
    field?: string;
    value: any;
    logic?: 'AND' | 'OR';
    children?: Condition[];
}

// ========== Triggers ==========
export type Trigger =
    | { type: 'task.status_changed'; from: string; to: string; taskId?: number }
    | { type: 'task.assigned'; userId: number; taskId?: number }
    | { type: 'task.created'; projectId: number }
    | { type: 'comment.created'; taskId: number; mentions?: number[] }
    | { type: 'time.elapsed'; duration: number; since: Date }
    | { type: 'time.scheduled'; datetime: string; cron?: string }
    | { type: 'webhook.received'; webhookId: string; payload: any }
    | { type: 'cost.exceeded'; threshold: number; currentCost: number }
    | { type: 'manual'; userId: number };

// ========== Actions ==========
export type Action =
    | { type: 'task.create'; template: TaskTemplate }
    | { type: 'task.update'; taskId: number; changes: Partial<Task> }
    | {
          type: 'task.execute';
          taskId: number;
          skipBudgetCheck?: boolean;
          options?: ExecutionOptions;
      }
    | {
          type: 'notification.send';
          userId: number;
          message: string;
          channel: 'email' | 'push' | 'slack';
      }
    | {
          type: 'webhook.call';
          url: string;
          method: 'GET' | 'POST' | 'PUT' | 'DELETE';
          payload?: any;
          headers?: Record<string, string>;
          secret?: string;
      }
    | { type: 'ai.execute'; taskId: number; provider?: string }
    | { type: 'integration.slack'; channel: string; message: string; webhookUrl?: string }
    | { type: 'workflow.start'; workflowId: string }
    | { type: 'workflow.stop'; workflowId: string }
    | { type: 'variable.set'; name: string; value: any }
    | { type: 'delay'; duration: number };

export interface TaskTemplate {
    projectId?: number;
    title?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high';
    aiProvider?: string;
    status?: string;
    assigneeId?: number;
    estimatedMinutes?: number;
    tags?: string[];
}

export interface ActionResult {
    action: Action;
    status: 'success' | 'failure';
    output?: any;
    error?: Error;
    timestamp: Date;
}

// ========== Automation Rule ==========
export interface AutomationRule {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    trigger: Trigger;
    conditions: Condition[];
    actions: Action[];
    projectId?: number; // null = global
    createdBy: number;
    createdAt: Date;
    updatedAt: Date;
    executionCount: number;
    lastExecutedAt?: Date;
}

// ========== Event ==========
export interface Event {
    id: string;
    type: string;
    payload: any;
    timestamp: Date;
    userId?: number;
    projectId?: number;
    metadata: Record<string, any>;
}

// ========== Context Variables ==========
export interface ContextVariables {
    task: Task;
    previous_result?: any;
    previous_tasks?: TaskResult[];
    user_id: number;
    project_id: number;
    workflow_id: string;
    current_time: Date;
    environment: Record<string, any>;
    [key: string]: any;
}

// ========== Plan Visualization ==========
export interface PlanVisualization {
    type: 'gantt' | 'dag' | 'timeline';
    data: any;
    stages: VisualizationStage[];
    criticalPath: number[];
}

export interface VisualizationStage {
    id: number;
    name: string;
    tasks: {
        id: number;
        name: string;
        duration: number;
        dependencies: number[];
    }[];
    startTime: number;
    endTime: number;
}

// ========== Constraints ==========
export interface Constraints {
    maxDuration?: number; // 최대 실행 시간 (밀리초)
    maxCost?: number; // 최대 비용
    maxParallelism?: number; // 최대 병렬 실행 수
    requiredProviders?: string[]; // 필수 AI 제공자
    excludedProviders?: string[]; // 제외할 제공자
    maxRetries?: number; // 최대 재시도 횟수
    deadlineAt?: Date; // 마감 시간
    priority?: 'low' | 'normal' | 'high' | 'critical';
}

// ========== Error Types ==========
export class WorkflowError extends Error {
    constructor(
        message: string,
        public code: string,
        public taskId?: number,
        public recoverable: boolean = false
    ) {
        super(message);
        this.name = 'WorkflowError';
    }
}

export class RetryableError extends WorkflowError {
    constructor(
        message: string,
        public retryAfter?: number
    ) {
        super(message, 'RETRYABLE_ERROR', undefined, true);
        this.name = 'RetryableError';
    }
}

export class BudgetExceededError extends WorkflowError {
    constructor(
        public currentCost: number,
        public maxCost: number
    ) {
        super(`Budget exceeded: ${currentCost} > ${maxCost}`, 'BUDGET_EXCEEDED', undefined, false);
        this.name = 'BudgetExceededError';
    }
}

export class TimeoutError extends WorkflowError {
    constructor(
        public taskId: number,
        public timeout: number
    ) {
        super(`Task ${taskId} timed out after ${timeout}ms`, 'TIMEOUT', taskId, true);
        this.name = 'TimeoutError';
    }
}

// ========== Worker Pool ==========
export interface WorkerPool {
    maxWorkers: number;
    activeWorkers: number;
    queue: Task[];
    processing: Map<number, Task>;
}

// ========== Execution State ==========
export interface ExecutionState {
    workflowId: string;
    status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'partial';
    currentStage: number;
    completedTasks: Set<number>;
    failedTasks: Set<number>;
    context: ExecutionContext;
    checkpoints: Checkpoint[];
    startTime?: Date;
    endTime?: Date;
    pausedAt?: Date;
}
