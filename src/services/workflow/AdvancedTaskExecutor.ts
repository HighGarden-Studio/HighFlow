import type { Task, TaskAttachment } from '@core/types/database';
import type {
    ExecutionContext,
    ExecutionOptions,
    TaskResult,
    WorkflowResult,
    Progress,
    ExecutionPlan,
    RetryStrategy,
    Checkpoint,
    Condition,
    ExecutionState,
} from './types';
import type { EnabledProviderInfo, MCPServerRuntimeConfig, AiResult } from '@core/types/ai';
import { buildPlainTextResult } from '../ai/utils/aiResultUtils';
import { RetryableError, TimeoutError, BudgetExceededError } from './types';
import { AIServiceManager, type AIExecutionResult } from './AIServiceManager';
import { PromptMacroService } from './PromptMacroService';

export class AdvancedTaskExecutor {
    private aiServiceManager: AIServiceManager;
    private executionStates: Map<string, ExecutionState> = new Map();
    private checkpoints: Map<string, Checkpoint[]> = new Map();

    constructor() {
        this.aiServiceManager = new AIServiceManager();
    }

    setEnabledProviders(providers: EnabledProviderInfo[] = []): void {
        this.aiServiceManager.setEnabledProviders(providers);
    }

    setMCPServers(servers: MCPServerRuntimeConfig[] = []): void {
        this.aiServiceManager.setMCPServers(servers);
    }

    /**
     * API 키 설정 (IPC 핸들러에서 설정 스토어의 값을 전달받아 설정)
     */
    setApiKeys(keys: {
        anthropic?: string;
        openai?: string;
        google?: string;
        groq?: string;
    }): void {
        this.aiServiceManager.setApiKeys(keys);
    }

    /**
     * 단일 Task 실행 (재시도, 타임아웃, 폴백 지원)
     */
    async executeTask(
        task: Task,
        context: ExecutionContext,
        options: ExecutionOptions = {}
    ): Promise<TaskResult> {
        const startTime = new Date();
        const { onLog } = options;

        if (onLog) {
            onLog(
                'info',
                `[AdvancedTaskExecutor] Starting execution for task ${task.id}: ${task.title}`,
                {
                    taskId: task.id,
                    contextKeys: Object.keys(context),
                }
            );
        }

        // 세분화된 그룹 테스크는 실행 불가 (건너뛰기)
        if (task.isSubdivided) {
            console.warn(
                `Task ${task.id} is subdivided and cannot be executed directly. Skipping...`
            );
            return {
                taskId: task.id,
                status: 'skipped',
                output: {
                    message: 'Task is subdivided into subtasks and cannot be executed directly',
                },
                startTime,
                endTime: new Date(),
                duration: 0,
                cost: 0,
                retries: 0,
                metadata: { skipped: true, reason: 'subdivided' },
            };
        }

        let retries = 0;
        let lastError: Error | undefined;

        const retryStrategy: RetryStrategy = options.retryStrategy || {
            maxRetries: 3,
            initialDelay: 1000,
            maxDelay: 30000,
            backoffMultiplier: 2,
        };

        while (retries <= retryStrategy.maxRetries) {
            try {
                // 예산 체크
                if (context.budget) {
                    this.checkBudget(context.budget);
                }

                // 타임아웃 설정
                const timeout = options.timeout || 300000; // 기본 5분
                if (onLog) {
                    onLog('debug', `[AdvancedTaskExecutor] Delegating to AIServiceManager`, {
                        taskId: task.id,
                        provider: context.metadata?.provider,
                        model: context.metadata?.model,
                    });
                }

                const aiResult = (await this.executeWithTimeout(
                    task,
                    context,
                    timeout,
                    options
                )) as AIExecutionResult;

                const endTime = new Date();

                // 예산 업데이트
                if (context.budget && aiResult.cost) {
                    context.budget.currentCost = (context.budget.currentCost || 0) + aiResult.cost;
                    context.budget.currentTokens =
                        (context.budget.currentTokens || 0) + aiResult.tokensUsed.total;
                }

                const finalAiResult =
                    aiResult.aiResult ||
                    buildPlainTextResult(aiResult.content, {
                        provider: aiResult.provider,
                        model: aiResult.model,
                    });
                const attachments = this.buildAttachmentsFromAiResult(task.id, finalAiResult);

                return {
                    taskId: task.id,
                    status: 'success',
                    output: {
                        aiResult: finalAiResult,
                        provider: aiResult.provider,
                        model: aiResult.model,
                        finishReason: aiResult.finishReason,
                        metadata: aiResult.metadata,
                        attachments,
                    },
                    startTime,
                    endTime,
                    duration: aiResult.duration,
                    cost: aiResult.cost,
                    tokens: aiResult.tokensUsed.total,
                    retries,
                    metadata: {
                        tokensUsed: aiResult.tokensUsed,
                        provider: aiResult.provider,
                        model: aiResult.model,
                        aiResult: finalAiResult,
                        attachments,
                    },
                    attachments,
                };
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.error(
                    `Task ${task.id} failed (attempt ${retries + 1}/${retryStrategy.maxRetries + 1}):`,
                    lastError
                );

                // 재시도 불가능한 에러인 경우 즉시 실패
                if (!this.isRetryableError(lastError, retryStrategy)) {
                    break;
                }

                // 폴백 제공자 시도
                if (options.fallbackProviders && options.fallbackProviders.length > retries) {
                    console.log(`Trying fallback provider: ${options.fallbackProviders[retries]}`);
                    task = {
                        ...task,
                        aiProvider: options.fallbackProviders[retries] as Task['aiProvider'],
                    };
                }

                retries++;

                // 지수 백오프
                if (retries <= retryStrategy.maxRetries) {
                    const delay = Math.min(
                        retryStrategy.initialDelay *
                            Math.pow(retryStrategy.backoffMultiplier, retries - 1),
                        retryStrategy.maxDelay
                    );
                    console.log(`Waiting ${delay}ms before retry...`);
                    await this.sleep(delay);
                }
            }
        }

        // 모든 재시도 실패
        const endTime = new Date();
        return {
            taskId: task.id,
            status: 'failure',
            output: null,
            error: lastError,
            startTime,
            endTime,
            duration: endTime.getTime() - startTime.getTime(),
            retries,
            metadata: {},
        };
    }

    /**
     * 타임아웃과 함께 Task 실행
     */
    private async executeWithTimeout(
        task: Task,
        context: ExecutionContext,
        timeout: number,
        options: ExecutionOptions
    ): Promise<any> {
        return Promise.race([
            this.executeTaskLogic(task, context, options),
            new Promise((_, reject) =>
                setTimeout(() => reject(new TimeoutError(task.id, timeout)), timeout)
            ),
        ]);
    }

    /**
     * 실제 Task 실행 로직 (AI 서비스 호출)
     */
    private async executeTaskLogic(
        task: Task,
        context: ExecutionContext,
        options: ExecutionOptions
    ): Promise<AIExecutionResult> {
        const { onLog } = options;
        // 컨텍스트 변수 치환
        let processedDescription = this.substituteVariables(task.description || '', context);
        console.log(`[AdvancedTaskExecutor] ExecuteTaskLogic ${processedDescription}`);

        // 의존 작업의 결과가 있으면 프롬프트에 자동으로 추가
        const dependencyResults = this.getRelevantDependencyResults(
            task,
            context.previousResults || []
        );
        if (dependencyResults.length > 0) {
            const resultsSection = this.buildDependencyResultsSection(dependencyResults);
            processedDescription = `${resultsSection}\n\n---\n\n${processedDescription}`;
            this.attachDependencyArtifactsToContext(context, dependencyResults);
            console.log(
                `[AdvancedTaskExecutor] Injected ${dependencyResults.length} dependency results into prompt`
            );
        }

        // 결과물 형식 지시사항 추가
        // expectedOutputFormat을 우선적으로 사용 (사용자가 UI에서 설정한 값)
        const outputFormat = task.expectedOutputFormat || (task as any).outputFormat || 'markdown';
        const codeLanguage = (task as any).codeLanguage;
        const outputFormatInstruction = this.buildOutputFormatInstruction(
            outputFormat,
            codeLanguage
        );

        if (outputFormatInstruction) {
            processedDescription = `${processedDescription}\n\n---\n\n${outputFormatInstruction}`;
            console.log(
                `[AdvancedTaskExecutor] Added output format instruction: ${outputFormat}${codeLanguage ? ` (${codeLanguage})` : ''}`
            );
        }

        // 치환된 프롬프트로 태스크 복사
        const taskWithProcessedPrompt: Task = {
            ...task,
            description: processedDescription,
        };

        console.log(
            `[AdvancedTaskExecutor] Executing task ${task.id} with provider ${task.aiProvider || 'anthropic'}`
        );

        // 스트리밍 여부 결정 (기본적으로 비활성화, 옵션으로 활성화 가능)
        const useStreaming = context.metadata?.streaming === true;

        // 외부에서 전달된 콜백 사용 (IPC 스트리밍용)
        const externalOnToken = context.metadata?.onToken as ((token: string) => void) | undefined;
        const externalOnProgress = context.metadata?.onProgress as
            | ((progress: { phase: string; elapsedTime: number; content?: string }) => void)
            | undefined;

        // AI 서비스 실행
        const result = await this.aiServiceManager.executeTask(taskWithProcessedPrompt, context, {
            streaming: useStreaming,
            onToken: useStreaming
                ? (token) => {
                      // 외부 콜백이 있으면 호출 (IPC로 스트리밍)
                      if (externalOnToken) {
                          externalOnToken(token);
                      }
                      // Verbose logging removed - only start/completion summaries logged
                  }
                : undefined,
            onProgress: (progress) => {
                // 외부 콜백이 있으면 호출 (IPC로 진행상황 전달)
                if (externalOnProgress) {
                    externalOnProgress({
                        phase: progress.phase,
                        elapsedTime: progress.elapsedTime,
                        content: progress.currentContent,
                    });
                }
                // Verbose logging removed - only start/completion summaries logged
                if (progress.phase === 'completed') {
                    onLog?.('info', `[AdvancedTaskExecutor] Task execution completed`, {
                        taskId: task.id,
                        provider: progress.provider,
                        model: progress.model,
                        tokensGenerated: progress.tokensGenerated,
                        elapsedTime: progress.elapsedTime,
                    });
                }
            },
            fallbackProviders: (context.metadata?.fallbackProviders as any[]) || [
                'openai',
                'google',
            ],
            timeout: (context.metadata?.timeout as number) || 300000,
        });

        if (!result.success) {
            throw result.error || new Error(`Task ${task.id} execution failed`);
        }

        // Add generated prompt to metadata
        result.metadata = {
            ...result.metadata,
            generatedPrompt: processedDescription,
        };

        return result;
    }

    /**
     * AI 리뷰 실행 (자동 검토 기능)
     */
    async executeReview(
        task: Task,
        reviewPrompt: string,
        _executionContent: string,
        options: {
            streaming?: boolean;
            onToken?: (token: string) => void;
            timeout?: number;
            aiProvider?: string | null;
            aiModel?: string | null;
            imageData?: string; // Base64 image data for vision models
        } = {}
    ): Promise<{
        success: boolean;
        content?: string;
        error?: string;
        cost?: number;
        tokens?: number;
        provider?: string;
        model?: string;
        duration?: number;
    }> {
        const startTime = Date.now();

        try {
            // AI 서비스 매니저를 통해 리뷰 실행
            const context: ExecutionContext = {
                workflowId: `review-${task.id}`,
                taskId: task.id,
                projectId: task.projectId,
                userId: 1, // 시스템 사용자
                variables: {},
                previousResults: [],
                metadata: {
                    streaming: options.streaming ?? true,
                    onToken: options.onToken,
                },
            };

            // 리뷰용 가상 태스크 생성
            // Use provided overrides, or fall back to task settings
            const reviewProvider =
                options.aiProvider ?? task.reviewAiProvider ?? task.aiProvider ?? null;
            const reviewModel = options.aiModel ?? task.reviewAiModel ?? task.aiModel ?? null;

            const reviewTask: Task = {
                ...task,
                description: reviewPrompt,
                aiProvider: reviewProvider as any,
                aiModel: reviewModel,
                // Force text output for reviews, regardless of original task format
                expectedOutputFormat: 'text',
                outputFormat: 'text' as any,
                // Attach image data for vision models
                ...(options.imageData ? { imageData: options.imageData } : {}),
            } as Task;

            const result = await this.aiServiceManager.executeTask(reviewTask, context, {
                streaming: options.streaming ?? true,
                onToken: options.onToken,
                timeout: options.timeout ?? 180000, // 3분 타임아웃
            });

            const duration = Date.now() - startTime;

            if (result.success) {
                return {
                    success: true,
                    content: result.content,
                    cost: result.cost,
                    tokens: result.tokensUsed?.total,
                    provider: result.provider,
                    model: result.model,
                    duration,
                };
            } else {
                return {
                    success: false,
                    error: result.error?.message || 'Review failed',
                    duration,
                };
            }
        } catch (error) {
            const duration = Date.now() - startTime;
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                duration,
            };
        }
    }

    /**
     * 전체 워크플로우 실행
     */
    async executeWorkflow(
        tasks: Task[],
        executionPlan: ExecutionPlan,
        progressCallback: (progress: Progress) => void,
        options: ExecutionOptions = {}
    ): Promise<WorkflowResult> {
        const workflowId = executionPlan.workflowId;
        const startTime = new Date();
        const primaryProjectId = tasks[0]?.projectId ?? 0;

        // 실행 상태 초기화
        const state: ExecutionState = {
            workflowId,
            status: 'running',
            currentStage: 0,
            completedTasks: new Set(),
            failedTasks: new Set(),
            context: this.createInitialContext(workflowId, primaryProjectId, 1), // TODO: 실제 userId
            checkpoints: [],
            startTime,
        };
        this.executionStates.set(workflowId, state);

        const taskResults: TaskResult[] = [];
        let totalCost = 0;
        let totalTokens = 0;

        try {
            // Stage별로 실행
            for (let i = 0; i < executionPlan.stages.length; i++) {
                const stage = executionPlan.stages[i];
                if (!stage) {
                    continue;
                }
                state.currentStage = i;

                // 일시정지 체크
                if (state.status === 'paused') {
                    console.log(`Workflow ${workflowId} paused at stage ${i}`);
                    break;
                }

                // 취소 체크
                if (state.status === 'cancelled') {
                    console.log(`Workflow ${workflowId} cancelled at stage ${i}`);
                    break;
                }

                // Stage 실행 (병렬 가능)
                const stageResults = await this.executeStage(
                    stage.tasks,
                    state.context,
                    options,
                    stage.canRunInParallel ? options.parallelism || 3 : 1
                );

                taskResults.push(...stageResults);

                // 결과 처리
                for (const result of stageResults) {
                    if (result.status === 'success') {
                        state.completedTasks.add(result.taskId);
                        if (result.cost) totalCost += result.cost;
                        if (result.tokens) totalTokens += result.tokens;

                        // 컨텍스트에 결과 추가
                        (state.context.previousResults ??= []).push(result);
                    } else {
                        state.failedTasks.add(result.taskId);
                    }
                }

                // 체크포인트 저장
                if (options.checkpoints) {
                    const checkpoint = this.createCheckpoint(workflowId, state);
                    state.checkpoints.push(checkpoint);
                    this.saveCheckpoint(workflowId, checkpoint);
                }

                // 진행 상태 알림
                const progress: Progress = {
                    workflowId,
                    currentStage: i + 1,
                    totalStages: executionPlan.stages.length,
                    currentTask: taskResults.length,
                    totalTasks: tasks.length,
                    completedTasks: state.completedTasks.size,
                    failedTasks: state.failedTasks.size,
                    percentage: ((i + 1) / executionPlan.stages.length) * 100,
                    eta: this.calculateETA(startTime, i + 1, executionPlan.stages.length),
                    elapsedTime: Date.now() - startTime.getTime(),
                    estimatedTotalTime: executionPlan.estimatedDuration,
                };
                progressCallback(progress);
            }

            const endTime = new Date();
            state.endTime = endTime;

            // 최종 상태 결정
            const finalStatus = this.determineFinalStatus(state);
            state.status = finalStatus;

            return {
                workflowId,
                status: finalStatus,
                taskResults,
                totalDuration: endTime.getTime() - startTime.getTime(),
                totalCost,
                totalTokens,
                successCount: state.completedTasks.size,
                failureCount: state.failedTasks.size,
                startTime,
                endTime,
            };
        } catch (error) {
            state.status = 'failed';
            state.endTime = new Date();

            return {
                workflowId,
                status: 'failed',
                taskResults,
                totalDuration: state.endTime.getTime() - startTime.getTime(),
                totalCost,
                totalTokens,
                successCount: state.completedTasks.size,
                failureCount: state.failedTasks.size,
                startTime,
                endTime: state.endTime,
                error: error instanceof Error ? error : new Error(String(error)),
            };
        } finally {
            // 정리
            this.executionStates.delete(workflowId);
        }
    }

    /**
     * Stage 실행 (병렬 또는 직렬)
     */
    private async executeStage(
        tasks: Task[],
        context: ExecutionContext,
        options: ExecutionOptions,
        maxParallel: number
    ): Promise<TaskResult[]> {
        const results: TaskResult[] = [];

        if (maxParallel === 1) {
            // 직렬 실행
            for (const task of tasks) {
                const result = await this.executeTask(task, context, options);
                results.push(result);
            }
        } else {
            // 병렬 실행 (워커 풀 사용)
            const chunks = this.chunkArray(tasks, maxParallel);
            for (const chunk of chunks) {
                const chunkResults = await Promise.all(
                    chunk.map((task) => this.executeTask(task, context, options))
                );
                results.push(...chunkResults);
            }
        }

        return results;
    }

    /**
     * Task 재시도 (사용자 피드백 포함)
     */
    async retryTask(
        _taskId: number,
        userFeedback: string,
        retryStrategy: RetryStrategy,
        task: Task,
        context: ExecutionContext
    ): Promise<TaskResult> {
        // 피드백을 컨텍스트에 추가
        const enhancedContext: ExecutionContext = {
            ...context,
            variables: {
                ...context.variables,
                user_feedback: userFeedback,
            },
        };

        return this.executeTask(task, enhancedContext, { retryStrategy });
    }

    /**
     * 워크플로우 일시정지
     */
    async pauseWorkflow(workflowId: string): Promise<void> {
        const state = this.executionStates.get(workflowId);
        if (state && state.status === 'running') {
            state.status = 'paused';
            state.pausedAt = new Date();
            console.log(`Workflow ${workflowId} paused`);
        }
    }

    /**
     * 워크플로우 재개
     */
    async resumeWorkflow(workflowId: string): Promise<void> {
        const state = this.executionStates.get(workflowId);
        if (state && state.status === 'paused') {
            state.status = 'running';
            state.pausedAt = undefined;
            console.log(`Workflow ${workflowId} resumed`);
        }
    }

    /**
     * 워크플로우 취소
     */
    async cancelWorkflow(workflowId: string): Promise<void> {
        const state = this.executionStates.get(workflowId);
        if (state) {
            state.status = 'cancelled';
            state.endTime = new Date();
            console.log(`Workflow ${workflowId} cancelled`);
        }
    }

    /**
     * 조건 평가
     */
    async evaluateCondition(condition: Condition, context: ExecutionContext): Promise<boolean> {
        switch (condition.type) {
            case 'task_status': {
                const task = context.previousResults?.find(
                    (r) => r.taskId === Number(condition.field)
                );
                if (!task) return false;
                return this.evaluateOperator(task.status, condition.operator, condition.value);
            }

            case 'variable': {
                const value = context.variables?.[condition.field || ''];
                return this.evaluateOperator(value, condition.operator, condition.value);
            }

            case 'cost': {
                const currentCost = context.budget?.currentCost || 0;
                return this.evaluateOperator(currentCost, condition.operator, condition.value);
            }

            case 'time': {
                const startTime = context.startTime?.getTime() ?? Date.now();
                const elapsed = Date.now() - startTime;
                return this.evaluateOperator(elapsed, condition.operator, condition.value);
            }

            case 'custom': {
                // 커스텀 로직 (사용자 정의 함수 실행 등)
                return true;
            }

            default:
                return false;
        }
    }

    /**
     * 연산자 평가
     */
    private evaluateOperator(left: any, operator: string, right: any): boolean {
        switch (operator) {
            case '==':
                return left === right;
            case '!=':
                return left !== right;
            case '>':
                return left > right;
            case '<':
                return left < right;
            case '>=':
                return left >= right;
            case '<=':
                return left <= right;
            case 'contains':
                return String(left).includes(String(right));
            case 'matches':
                return new RegExp(String(right)).test(String(left));
            default:
                return false;
        }
    }

    /**
     * 실행 컨텍스트 빌드
     */
    buildExecutionContext(task: Task, previousResults: TaskResult[]): ExecutionContext {
        return {
            workflowId: `wf-${Date.now()}`,
            taskId: task.id,
            userId: task.assigneeId || 1,
            projectId: task.projectId,
            variables: {
                task_id: task.id,
                task_title: task.title,
                task_priority: task.priority,
            },
            previousResults,
            startTime: new Date(),
            metadata: {},
        };
    }

    /**
     * 변수 및 매크로 치환
     * PromptMacroService를 사용하여 다양한 매크로 지원
     */
    private substituteVariables(text: string, context: ExecutionContext): string {
        // PromptMacroService를 사용하여 매크로 치환
        const macroContext = {
            previousResults: context.previousResults ?? [],
            variables: context.variables ?? {},
            projectName: context.metadata?.projectName as string | undefined,
            projectDescription: context.metadata?.projectDescription as string | undefined,
            currentTaskId: context.taskId,
        };

        return PromptMacroService.replaceMacros(text, macroContext);
    }

    /**
     * 예산 체크
     */
    private checkBudget(budget: ExecutionContext['budget']): void {
        if (!budget) return;

        if (budget.currentCost >= budget.maxCost) {
            throw new BudgetExceededError(budget.currentCost, budget.maxCost);
        }

        if (budget.maxTokens && budget.currentTokens && budget.currentTokens >= budget.maxTokens) {
            throw new Error(`Token limit exceeded: ${budget.currentTokens} >= ${budget.maxTokens}`);
        }
    }

    /**
     * 재시도 가능한 에러인지 확인
     */
    private isRetryableError(error: Error, strategy: RetryStrategy): boolean {
        if (error instanceof RetryableError) return true;
        if (error instanceof TimeoutError) return true;

        if (strategy.retryableErrors) {
            return strategy.retryableErrors.some((errType) => error.message.includes(errType));
        }

        // 기본적으로 네트워크 에러, 타임아웃은 재시도 가능
        const retryablePatterns = [
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENOTFOUND',
            'network',
            'timeout',
            '429',
            '500',
            '502',
            '503',
        ];
        return retryablePatterns.some((pattern) =>
            error.message.toLowerCase().includes(pattern.toLowerCase())
        );
    }

    /**
     * 체크포인트 생성
     */
    private createCheckpoint(workflowId: string, state: ExecutionState): Checkpoint {
        return {
            id: `cp-${Date.now()}-${Math.random().toString(36).substring(7)}`,
            workflowId,
            timestamp: new Date(),
            completedTasks: Array.from(state.completedTasks),
            context: state.context,
            metadata: {},
        };
    }

    /**
     * 체크포인트 저장
     */
    private saveCheckpoint(workflowId: string, checkpoint: Checkpoint): void {
        const checkpoints = this.checkpoints.get(workflowId) || [];
        checkpoints.push(checkpoint);
        this.checkpoints.set(workflowId, checkpoints);
        console.log(`Checkpoint saved: ${checkpoint.id}`);
    }

    /**
     * ETA 계산
     */
    private calculateETA(startTime: Date, currentStage: number, totalStages: number): number {
        const elapsed = Date.now() - startTime.getTime();
        const averageTimePerStage = elapsed / currentStage;
        const remainingStages = totalStages - currentStage;
        return remainingStages * averageTimePerStage;
    }

    /**
     * 최종 상태 결정
     */
    private determineFinalStatus(state: ExecutionState): WorkflowResult['status'] {
        if (state.status === 'cancelled') return 'cancelled';
        if (state.failedTasks.size > 0 && state.completedTasks.size === 0) return 'failed';
        if (state.failedTasks.size > 0) return 'partial';
        return 'completed';
    }

    /**
     * 초기 컨텍스트 생성
     */
    private createInitialContext(
        workflowId: string,
        projectId: number,
        userId: number
    ): ExecutionContext {
        return {
            workflowId,
            taskId: 0,
            userId,
            projectId,
            variables: {},
            previousResults: [],
            startTime: new Date(),
            metadata: {},
        };
    }

    /**
     * 배열을 chunk로 분할
     */
    private chunkArray<T>(array: T[], chunkSize: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * 결과물 형식에 따른 지시사항 생성
     */
    private buildOutputFormatInstruction(outputFormat: string, codeLanguage?: string): string {
        const formatInstructions: Record<string, string> = {
            text: `## 결과물 형식
일반 텍스트 형식으로 결과를 작성해주세요.`,

            markdown: `## 결과물 형식
Markdown 형식으로 결과를 작성해주세요. 제목, 목록, 강조 등 Markdown 문법을 활용해주세요.`,

            html: `## 결과물 형식
HTML 코드로 결과를 작성해주세요. 완전한 HTML 문서 또는 HTML 스니펫을 제공해주세요.
\`\`\`html 코드블록으로 감싸주세요.`,

            pdf: `## 결과물 형식
PDF 문서 생성에 적합한 형식으로 결과를 작성해주세요.
Markdown 형식으로 작성하되, 인쇄에 적합한 구조를 갖추어주세요.`,

            json: `## 결과물 형식
JSON 형식으로 결과를 작성해주세요.
Markdown 코드 블록 없이 순수한 JSON 문자열만 반환해주세요.`,

            yaml: `## 결과물 형식
YAML 형식으로 결과를 작성해주세요.
\`\`\`yaml 코드블록으로 감싸주세요.`,

            csv: `## 결과물 형식
CSV 형식으로 결과를 작성해주세요.
\`\`\`csv 코드블록으로 감싸주세요. 첫 줄은 헤더로 사용해주세요.`,

            sql: `## 결과물 형식
SQL 쿼리 또는 스키마 정의로 결과를 작성해주세요.
\`\`\`sql 코드블록으로 감싸주세요.`,

            shell: `## 결과물 형식
셸 스크립트로 결과를 작성해주세요.
\`\`\`bash 또는 \`\`\`shell 코드블록으로 감싸주세요.`,

            mermaid: `## 결과물 형식
Mermaid 다이어그램으로 결과를 작성해주세요.
\`\`\`mermaid 코드블록으로 감싸주세요.
flowchart, sequenceDiagram, classDiagram 등 적절한 유형을 선택해주세요.`,

            svg: `## 결과물 형식
SVG 이미지 코드로 결과를 작성해주세요.
\`\`\`svg 코드블록으로 감싸서 유효한 SVG를 제공해주세요.`,

            png: `## 결과물 형식
이미지 생성에 적합한 상세한 설명을 제공해주세요.
이미지 생성 AI가 이해할 수 있는 프롬프트 형식으로 작성해주세요.`,

            mp4: `## 결과물 형식
비디오 제작에 적합한 스크립트, 스토리보드, 또는 상세 설명을 제공해주세요.`,

            mp3: `## 결과물 형식
오디오 제작에 적합한 스크립트, 대본, 또는 상세 설명을 제공해주세요.`,

            diff: `## 결과물 형식
코드 변경사항을 diff 형식으로 작성해주세요.
\`\`\`diff 코드블록으로 감싸서 +/- 표기를 사용해주세요.`,

            log: `## 결과물 형식
로그 형식으로 결과를 작성해주세요.
타임스탬프와 로그 레벨을 포함한 표준 로그 포맷을 사용해주세요.`,

            code: `## 결과물 형식
${codeLanguage || '프로그래밍 언어'} 코드로 결과를 작성해주세요.
\`\`\`${codeLanguage || 'code'} 코드블록으로 감싸주세요.
완전하고 실행 가능한 코드를 제공하고, 필요한 경우 주석을 추가해주세요.`,
        };

        const isSupportedFormat = (format: string): format is keyof typeof formatInstructions =>
            format in formatInstructions;
        if (isSupportedFormat(outputFormat)) {
            const instruction = formatInstructions[outputFormat];
            if (instruction) {
                return instruction;
            }
        }
        return formatInstructions.markdown ?? 'Markdown 형식으로 결과를 작성해주세요.';
    }

    private buildAttachmentsFromAiResult(
        taskId: number,
        aiResult: AiResult | null
    ): TaskAttachment[] {
        if (!aiResult) return [];
        const attachments: TaskAttachment[] = [];
        const mime = aiResult.mime || this.guessMimeFromSubType(aiResult.subType);
        const extension = this.getExtensionFromSubType(aiResult.subType);
        const baseName = `task-${taskId}-output`;

        if (aiResult.format === 'base64' || aiResult.format === 'binary') {
            attachments.push({
                id: `${taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                name: `${baseName}.${extension}`,
                type: this.mapAiKindToAttachmentType(aiResult.kind),
                mime: mime || 'application/octet-stream',
                encoding: 'base64',
                value: aiResult.value,
                size: Math.round((aiResult.value.length * 3) / 4),
                sourceTaskId: taskId,
            });
        } else if (aiResult.format === 'url') {
            attachments.push({
                id: `${taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                name: `${baseName}.${extension}`,
                type: this.mapAiKindToAttachmentType(aiResult.kind),
                mime: mime || 'application/octet-stream',
                encoding: 'url',
                value: aiResult.value,
                sourceTaskId: taskId,
            });
        } else if (aiResult.kind !== 'text' && aiResult.value) {
            attachments.push({
                id: `${taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                name: `${baseName}.${extension}`,
                type: this.mapAiKindToAttachmentType(aiResult.kind),
                mime: mime || 'text/plain',
                encoding: 'text',
                value: aiResult.value,
                sourceTaskId: taskId,
            });
        }

        return attachments;
    }

    private mapAiKindToAttachmentType(kind: AiResult['kind']): TaskAttachment['type'] {
        switch (kind) {
            case 'image':
                return 'image';
            case 'audio':
                return 'audio';
            case 'video':
                return 'video';
            case 'document':
                return 'document';
            case 'data':
                return 'data';
            default:
                return 'binary';
        }
    }

    private getExtensionFromSubType(subType?: string): string {
        if (!subType) return 'txt';
        const map: Record<string, string> = {
            png: 'png',
            jpg: 'jpg',
            jpeg: 'jpeg',
            webp: 'webp',
            svg: 'svg',
            mp4: 'mp4',
            mp3: 'mp3',
            pdf: 'pdf',
            json: 'json',
            yaml: 'yaml',
            csv: 'csv',
            sql: 'sql',
            diff: 'diff',
            log: 'log',
            html: 'html',
            markdown: 'md',
            code: 'txt',
        };
        return map[subType] || 'txt';
    }

    private guessMimeFromSubType(subType?: string): string | undefined {
        if (!subType) return undefined;
        const map: Record<string, string> = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            webp: 'image/webp',
            svg: 'image/svg+xml',
            mp4: 'video/mp4',
            mp3: 'audio/mpeg',
            pdf: 'application/pdf',
            json: 'application/json',
            yaml: 'text/yaml',
            csv: 'text/csv',
            sql: 'text/sql',
            diff: 'text/x-diff',
            log: 'text/plain',
            html: 'text/html',
            markdown: 'text/markdown',
            code: 'text/plain',
        };
        return map[subType];
    }

    private getRelevantDependencyResults(task: Task, previousResults: TaskResult[]): TaskResult[] {
        if (!previousResults || previousResults.length === 0) {
            return [];
        }
        // Ensure dependencies is an array (handle both JSON string and already-parsed array)
        const dependenciesArray = Array.isArray(task.dependencies) ? task.dependencies : [];
        const dependencyIds = new Set<number>(
            dependenciesArray.map((id) => Number(id)).filter((id) => !Number.isNaN(id))
        );
        const triggerTaskIds =
            task.triggerConfig?.dependsOn?.taskIds
                ?.map((id) => Number(id))
                .filter((id) => !Number.isNaN(id)) || [];
        triggerTaskIds.forEach((id) => dependencyIds.add(id));

        if (dependencyIds.size === 0) {
            return previousResults;
        }

        return previousResults.filter((result) => dependencyIds.has(result.taskId));
    }

    private buildDependencyResultsSection(results: TaskResult[]): string {
        const sections = results.map((result, index) => {
            const header = `### 의존 작업 ${index + 1}: ${
                result.taskTitle || `Task #${result.taskId}`
            }`;
            const output = this.stringifyResultOutput(result);
            const attachments = (result.attachments ||
                result.metadata.attachments ||
                []) as TaskAttachment[];
            const attachmentBlock = attachments
                .map((attachment, attachmentIndex) =>
                    this.formatAttachmentForPrompt(attachment, attachmentIndex)
                )
                .filter(Boolean)
                .join('\n\n');

            return [header, output, attachmentBlock].filter(Boolean).join('\n\n');
        });

        return `## 참고: 의존 작업 결과\n\n${sections.join('\n\n---\n\n')}`;
    }

    private stringifyResultOutput(result: TaskResult): string {
        if (typeof result.output === 'string') {
            return this.truncateContent(result.output);
        }
        if (result.output?.aiResult?.value) {
            const value = result.output.aiResult.value;
            return this.truncateContent(
                typeof value === 'string' ? value : JSON.stringify(value, null, 2)
            );
        }
        try {
            return this.truncateContent(JSON.stringify(result.output, null, 2));
        } catch {
            return this.truncateContent(String(result.output ?? ''));
        }
    }

    private truncateContent(value: string, limit = 2000): string {
        if (!value) return '';
        if (value.length <= limit) return value;
        return `${value.slice(0, limit)}\n... (truncated ${value.length - limit} characters)`;
    }

    private formatAttachmentForPrompt(attachment: TaskAttachment, index: number): string {
        if (!attachment) return '';
        const preview =
            attachment.encoding === 'base64'
                ? this.truncateContent(attachment.value, 800)
                : attachment.value;
        return [
            `BEGIN ATTACHMENT ${index + 1}`,
            `Name: ${attachment.name}`,
            `Type: ${attachment.type}`,
            `MIME: ${attachment.mime}`,
            `Encoding: ${attachment.encoding}`,
            attachment.size ? `Size(bytes): ${attachment.size}` : '',
            `Content Preview:\n${preview}`,
            'END ATTACHMENT',
        ]
            .filter(Boolean)
            .join('\n');
    }

    private attachDependencyArtifactsToContext(
        context: ExecutionContext,
        results: TaskResult[]
    ): void {
        const aggregated =
            results.flatMap(
                (result) =>
                    result.attachments || (result.metadata.attachments as TaskAttachment[]) || []
            ) || [];
        if (aggregated.length === 0) return;

        context.metadata = context.metadata || {};
        const existing = Array.isArray(context.metadata.attachments)
            ? (context.metadata.attachments as TaskAttachment[])
            : [];
        context.metadata.attachments = [...existing, ...aggregated];
    }

    /**
     * Sleep 유틸리티
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Cancel currently running AI execution for a task
     */
    cancelTaskExecution(taskId: number): boolean {
        return this.aiServiceManager.cancelExecution(taskId);
    }

    /**
     * Check if a task is actively executing via AI
     */
    isTaskExecutionActive(taskId: number): boolean {
        return this.aiServiceManager.isExecutionActive(taskId);
    }

    /**
     * 워크플로우 상태 조회
     */
    getWorkflowState(workflowId: string): ExecutionState | undefined {
        return this.executionStates.get(workflowId);
    }

    /**
     * 체크포인트 조회
     */
    getCheckpoints(workflowId: string): Checkpoint[] {
        return this.checkpoints.get(workflowId) || [];
    }
}
