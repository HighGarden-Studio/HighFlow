/**
 * Task Execution IPC Handlers
 *
 * Handles IPC communication for AI task execution with streaming support
 */

import { ipcMain, BrowserWindow } from 'electron';
import { AdvancedTaskExecutor } from '../../../src/services/workflow/AdvancedTaskExecutor';
import { PromptMacroService } from '../../../src/services/workflow/PromptMacroService';
import { DependencyEvaluator } from '../services/DependencyEvaluator';
import type { EnabledProviderInfo, MCPServerRuntimeConfig } from '@core/types/ai';
import { taskRepository } from '../database/repositories/task-repository';
import { taskHistoryRepository } from '../database/repositories/task-history-repository';
import { projectRepository } from '../database/repositories/project-repository';
import { operatorRepository } from '../database/repositories/operator-repository';
import { resolveAutoReviewProvider } from '../../../src/core/logic/ai-configuration';
import type { Task, TaskTriggerConfig } from '../../../src/core/types/database';
import { eventBus } from '../../../src/services/events/EventBus';
import type {
    CuratorStartedEvent,
    CuratorStepEvent,
    CuratorCompletedEvent,
} from '../../../src/services/events/EventBus';
import type { TaskResult } from '../../../src/services/workflow/types';
import { MCPPermissionError } from '../../../src/services/mcp/errors';
// import { InputProviderManager } from '../../../src/services/workflow/input/InputProviderManager';
import { GlobalExecutionService } from '../services/GlobalExecutionService';

/**
 * Get the main window for sending IPC messages
 * Uses BrowserWindow.getAllWindows() to ensure we always have the current window
 */
function getMainWindow(): BrowserWindow | null {
    const windows = BrowserWindow.getAllWindows();
    return windows.length > 0 ? (windows[0] ?? null) : null;
}

/**
 * Send activity log to renderer
 */
function sendActivityLog(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    details?: any
) {
    const win = getMainWindow();
    if (win) {
        win.webContents.send('activity:log', {
            level,
            message,
            details,
            timestamp: new Date(),
        });
    }
}

// Execution state tracking
interface ExecutionState {
    taskId: number;
    status: 'running' | 'paused' | 'stopped' | 'completed' | 'failed' | 'needs_approval';
    startedAt: Date;
    pausedAt?: Date;
    progress: number;
    currentPhase: string;
    streamContent: string;
    error?: string;
}

// Review state tracking
interface ReviewState {
    taskId: number;
    status: 'reviewing' | 'completed' | 'failed';
    startedAt: Date;
    progress: number;
    streamContent: string;
    error?: string;
}

// Store active execution states
const activeExecutions = new Map<number, ExecutionState>();
// Store active review states
const activeReviews = new Map<number, ReviewState>();
// Store pending execution requests for busy tasks (TargetTaskId -> SourceTriggerId)
// This implements a "Latest Request Only" (Debounce) queue for Repeat/Always tasks.
const executionQueue = new Map<number, number>();
const executor = new AdvancedTaskExecutor();

/**
 * Extract dependency task IDs and their execution results for macro substitution/context passing
 * recursively (up to depth 5) to support deep history macros like {{prev-1}}
 */
async function buildDependencyContext(
    task: Task
): Promise<{ dependencyTaskIds: number[]; previousResults: TaskResult[] }> {
    const visitedIds = new Set<number>();
    const resultsMap = new Map<number, TaskResult>();
    const queue: { id: number; depth: number }[] = [];

    // 1. Identify direct dependencies
    const triggerConfig = task.triggerConfig as any;
    const directDeps = new Set<number>();

    if (triggerConfig?.dependsOn) {
        if (
            Array.isArray(triggerConfig.dependsOn.passResultsFrom) &&
            triggerConfig.dependsOn.passResultsFrom.length > 0
        ) {
            triggerConfig.dependsOn.passResultsFrom.forEach((id: number) => directDeps.add(id));
        }
        if (
            Array.isArray(triggerConfig.dependsOn.taskIds) &&
            triggerConfig.dependsOn.taskIds.length > 0
        ) {
            triggerConfig.dependsOn.taskIds.forEach((id: number) => directDeps.add(id));
        }
    }

    if (directDeps.size === 0) {
        return { dependencyTaskIds: [], previousResults: [] };
    }

    // 2. Initialize BFS Queue
    directDeps.forEach((id) => {
        queue.push({ id, depth: 1 });
        visitedIds.add(id);
    });

    console.log(
        `[TaskExecution] Building specific dependency context starting from ${directDeps.size} direct deps`
    );

    // 3. Recursive Fetch (BFS)
    while (queue.length > 0) {
        const { id, depth } = queue.shift()!;

        try {
            const depTask = await taskRepository.findById(id);
            if (!depTask) continue;

            // Process Execution Result
            if (depTask.status === 'done' && depTask.executionResult) {
                try {
                    const execResult =
                        typeof depTask.executionResult === 'string'
                            ? JSON.parse(depTask.executionResult)
                            : depTask.executionResult;

                    const now = new Date();
                    resultsMap.set(id, {
                        taskId: depTask.id,
                        taskTitle: depTask.title,
                        status: 'success',
                        output: execResult.content || execResult,
                        startTime: depTask.startedAt || now,
                        endTime: depTask.completedAt || now, // Crucial for sorting
                        duration: execResult.duration || 0,
                        retries: 0,
                        metadata: {
                            provider: execResult.provider,
                            model: execResult.model,
                            files: execResult.files,
                        },
                    });
                } catch (parseErr) {
                    console.error(
                        `[TaskExecution] Failed to parse result for task ${id}`,
                        parseErr
                    );
                }
            }

            // Recurse if depth allows
            if (depth < 5) {
                const depConfig = depTask.triggerConfig as any;
                const parentIds = depConfig?.dependsOn?.taskIds || [];
                for (const pid of parentIds) {
                    if (typeof pid === 'number' && !visitedIds.has(pid)) {
                        visitedIds.add(pid);
                        queue.push({ id: pid, depth: depth + 1 });
                    }
                }
            }
        } catch (err) {
            console.error(`[TaskExecution] Failed to fetch dependency ${id}`, err);
        }
    }

    // 4. Sort results chronologically (Oldest -> Newest)
    // This ensures {{prev}} is the last item, {{prev-1}} is second last, etc.
    const previousResults = Array.from(resultsMap.values()).sort((a, b) => {
        const timeA = new Date(a.endTime).getTime();
        const timeB = new Date(b.endTime).getTime();
        return timeA - timeB; // Ascending
    });

    console.log(
        `[TaskExecution] Built dependency context with ${previousResults.length} tasks (Depth reached)`
    );

    return { dependencyTaskIds: Array.from(visitedIds), previousResults };
}

/**
 * Helper: Check if task dependencies are met (Robust Logic with Novelty Check)
 * @param ignoreNovelty If true, bypasses the "New Event" check (used for manual execution)
 */
function areTaskDependenciesMet(
    task: any,
    allTasks: any[],
    ignoreNovelty: boolean = false
): { met: boolean; reason?: string; details?: string } {
    const triggerConfig = task.triggerConfig;
    if (!triggerConfig?.dependsOn?.taskIds || triggerConfig.dependsOn.taskIds.length === 0) {
        return { met: true };
    }

    const dependsOn = triggerConfig.dependsOn;
    const expression = dependsOn.expression;
    const operator = dependsOn.operator || 'all';
    const dependencyTaskIds = dependsOn.taskIds as number[];

    // 1. Prepare Dependency Data for Evaluator
    const dependencyInfo = allTasks
        .filter(
            (t) =>
                dependencyTaskIds.includes(t.id) ||
                (expression && expression.includes(String(t.id)))
        )
        .map((t) => ({
            id: t.id,
            status: t.status,
            completedAt: t.completedAt,
        }));

    // 2. Identify Last Run Time for Novelty Check
    // If ignoreNovelty is true, we set lastRunAt to undefined so the evaluators act as if it's the first run.
    let lastRunAt: string | undefined = undefined;
    if (!ignoreNovelty && (task.executionPolicy === 'repeat' || task.status === 'done')) {
        // Use completedAt of the *dependent* task (task) to establish the baseline
        lastRunAt = task.completedAt;
    }

    // 3. Evaluate
    if (expression && expression.trim().length > 0) {
        // Advanced Mode: Use DependencyEvaluator
        const evaluator = new DependencyEvaluator(dependencyInfo, lastRunAt);
        const result = evaluator.evaluate(expression);

        return {
            met: result.met,
            reason: result.met ? undefined : result.reason,
            details: `Expression "${expression}" -> ${result.met}. Reason: ${result.reason || 'Met'}`,
        };
    } else if (operator === 'any') {
        // Any one dependency completed
        // Novelty Check: Has ANY dependency completed AFTER lastRunAt?
        const completedDeps = dependencyInfo.filter((d) => d.status === 'done');
        let met = false;

        if (completedDeps.length > 0) {
            if (lastRunAt) {
                const lastRunTime = new Date(lastRunAt).getTime();
                // Check if ANY completed dep is new
                const hasNew = completedDeps.some(
                    (d) => d.completedAt && new Date(d.completedAt).getTime() > lastRunTime
                );
                met = hasNew;
            } else {
                met = true; // First run, and we have completions
            }
        }

        return {
            met,
            reason: met ? undefined : 'No new dependency completion',
            details: `Operator 'any': ${completedDeps.length}/${dependencyInfo.length} done. Met=${met}`,
        };
    } else {
        // All dependencies must be completed (Default)
        // Novelty Check: Are ALL done? AND is at least ONE new?
        const incomplete = dependencyInfo.filter((d) => d.status !== 'done');
        const allDone = incomplete.length === 0;

        let met = allDone;
        if (allDone && lastRunAt) {
            const lastRunTime = new Date(lastRunAt).getTime();
            const hasNew = dependencyInfo.some(
                (d) => d.completedAt && new Date(d.completedAt).getTime() > lastRunTime
            );
            if (!hasNew) {
                met = false; // Stale
            }
        }

        let details = '';
        if (!met) {
            if (!allDone) details = `Waiting for: ${incomplete.map((t: any) => t.id).join(', ')}`;
            else details = 'All done but no new events (stale)';
        }

        return { met, reason: met ? undefined : 'Conditions not met', details };
    }
}

/**
 * Check and execute dependent tasks when a task is completed
 * Finds all tasks that have a triggerConfig.dependsOn containing the completed taskId
 * and auto-executes them if all their dependencies are satisfied
 */
export async function checkAndExecuteDependentTasks(
    completedTaskId: number,
    completedTask: Task
): Promise<void> {
    try {
        console.log(
            `[TaskExecution] Checking dependent tasks for completed task ${completedTaskId}`
        );

        // Global Pause Check
        if (GlobalExecutionService.getInstance().isGlobalPaused()) {
            console.log(
                `[TaskExecution] Global execution is PAUSED. Skipping auto-execution for task ${completedTaskId}'s dependents.`
            );
            // We do NOT queue them here for MVP. They just don't run.
            // User must manually resume or re-run tasks.
            // To make it better, we could perhaps Log a warning.
            return;
        }

        // Get all tasks in the same project
        const allTasks = await taskRepository.findByProject(completedTask.projectId);

        // Find tasks that depend on the completed task
        const dependentTasks = allTasks.filter((task) => {
            const triggerConfig = task.triggerConfig as TaskTriggerConfig | null;

            if (!triggerConfig?.dependsOn?.taskIds) return false;

            // Check if completed task is in taskIds OR in expression
            const hasIdInList =
                triggerConfig.dependsOn.taskIds &&
                triggerConfig.dependsOn.taskIds.includes(completedTaskId);
            const hasIdInExpr = triggerConfig.dependsOn.expression
                ? new RegExp(`\\b${completedTaskId}\\b`).test(triggerConfig.dependsOn.expression)
                : false;

            if (!hasIdInList && !hasIdInExpr) return false;

            // Execution Policy Logic
            const policy = triggerConfig.dependsOn.executionPolicy || 'once';

            // 1. REPEAT/ALWAYS Policy Handling
            if (policy === 'repeat' || (policy as string) === 'always') {
                if (task.status === 'in_progress' || task.status === 'getting_input') {
                    // Task is busy. Queue this request (Debounce: overwrite with latest trigger)
                    console.log(
                        `[TaskExecution] Task ${task.id} is busy. Queueing re-execution request from ${completedTaskId}`
                    );
                    executionQueue.set(task.id, completedTaskId);
                    return false; // Do not execute immediately
                }
                return true; // Allowed to run
            }

            // 2. ONCE Policy Handling (Strict Novelty Check)
            if (policy === 'once') {
                // strict check: If it's done, ONLY allow if novelty is guaranteed.
                if (task.status === 'done' || task.status === 'in_progress') {
                    // Check if we have already run for this specific update??
                    // Actually, 'areTaskDependenciesMet' does the broad check.
                    // Here we just need to ensure we don't loop.
                    // If the task has a lastRunAt, and the Triggering Task completed BEFORE that,
                    // then this trigger is STALE and should be ignored.

                    if (task.lastRunAt && completedTask.completedAt) {
                        const lastRun = new Date(task.lastRunAt).getTime();
                        const triggerTime = new Date(completedTask.completedAt).getTime();

                        if (triggerTime <= lastRun) {
                            // This update is older than our last run. Ignore it.
                            // This prevents infinite loops where A -> B -> A and A sees B's old completion.
                            return false;
                        }
                    }
                }
                // If it's 'todo', always allow.
                // If it's 'done' but the trigger is NEW, allow (Reactive).
                return true;
            }

            // Also prevent blocked tasks from auto-running
            if (task.status === 'blocked') return false;

            return true;
        });

        if (dependentTasks.length === 0) {
            console.log(`[TaskExecution] No dependent tasks found for task ${completedTaskId}`);
            return;
        }

        console.log(
            `[TaskExecution] Found ${dependentTasks.length} dependent tasks: ${dependentTasks.map((t) => t.id).join(', ')}`
        );

        // Check each dependent task
        for (const dependentTask of dependentTasks) {
            const triggerConfig = dependentTask.triggerConfig as TaskTriggerConfig | null;

            const dependsOn = triggerConfig?.dependsOn;
            if (!dependsOn?.taskIds) continue;

            // Use shared helper - unused vars removed
            const checkResult = areTaskDependenciesMet(dependentTask, allTasks);
            const shouldExecute = checkResult.met;

            if (shouldExecute) {
                console.log(
                    `[TaskExecution] Auto-executing dependent task ${dependentTask.id} (dependencies satisfied)`
                );

                // Notify frontend about auto-execution
                const win = getMainWindow();
                win?.webContents.send('task:autoExecutionStarting', {
                    taskId: dependentTask.id,
                    triggeredBy: completedTaskId,
                });

                // Execute the task (this will be handled by the frontend's execution flow)
                // We send an event so the frontend can trigger the execution with proper API keys
                win?.webContents.send('task:triggerAutoExecution', {
                    taskId: dependentTask.id,
                    triggeredBy: completedTaskId,
                });
            } else {
                console.log(
                    `[TaskExecution] Task ${dependentTask.id} dependencies not yet satisfied`
                );
            }
        }
    } catch (error) {
        console.error(`[TaskExecution] Error checking dependent tasks:`, error);
    }
}

/**
 * Clear all active executions (called on app startup or for recovery)
 */
export async function clearAllActiveExecutions(): Promise<void> {
    console.log(`[TaskExecution] Clearing ${activeExecutions.size} active executions`);
    activeExecutions.clear();
}

/**
 * Reset stuck tasks in database (tasks with in_progress status but no active execution)
 * Should be called on app startup
 */
export async function resetStuckTasks(): Promise<number> {
    try {
        // Find all tasks with in_progress status
        const inProgressTasks = await taskRepository.findByStatus('in_progress');

        let resetCount = 0;
        for (const task of inProgressTasks) {
            // If no active execution exists for this task, reset it to todo
            if (!activeExecutions.has(task.id)) {
                console.log(
                    `[TaskExecution] Resetting stuck task ${task.id} from in_progress to todo`
                );
                await taskRepository.update(task.id, { status: 'todo' });
                resetCount++;
            }
        }

        if (resetCount > 0) {
            console.log(`[TaskExecution] Reset ${resetCount} stuck tasks to todo status`);
        }

        return resetCount;
    } catch (error) {
        console.error('[TaskExecution] Error resetting stuck tasks:', error);
        return 0;
    }
}

/**
 * Register task execution IPC handlers
 */
export function registerTaskExecutionHandlers(_mainWindow: BrowserWindow | null): void {
    // ========================================
    // Task Execution Handlers
    // ========================================

    /**
     * Execute a task - starts AI execution and streams progress
     */
    ipcMain.handle(
        'taskExecution:execute',
        async (
            _event,
            taskId: number,
            options?: {
                streaming?: boolean;
                timeout?: number;
                fallbackProviders?: string[];
                apiKeys?: {
                    anthropic?: string;
                    openai?: string;
                    google?: string;
                    groq?: string;
                    lmstudio?: string;
                };
                enabledProviders?: EnabledProviderInfo[];
                mcpServers?: MCPServerRuntimeConfig[];
            }
        ) => {
            // Global Pause Check for manual execution
            if (GlobalExecutionService.getInstance().isGlobalPaused()) {
                const errorMsg = 'Global execution is currently PAUSED. Resume to execute tasks.';
                console.warn(`[TaskExecution] Blocked execution of task ${taskId}: ${errorMsg}`);

                // Notify frontend
                getMainWindow()?.webContents.send('taskExecution:failed', {
                    taskId,
                    error: errorMsg,
                });

                // Return failure or throw
                throw new Error(errorMsg);
            }

            try {
                // Set API keys if provided
                if (options?.apiKeys) {
                    executor.setApiKeys(options.apiKeys);
                }

                if (options?.enabledProviders) {
                    executor.setEnabledProviders(options.enabledProviders);
                }

                if (options?.mcpServers) {
                    executor.setMCPServers(options.mcpServers);
                }

                // Get task from database
                const task = await taskRepository.findById(taskId);
                if (!task) {
                    throw new Error(`Task ${taskId} not found`);
                }

                // Validate dependencies (Robust Check)
                const triggerConfig = task.triggerConfig as any;
                if (
                    triggerConfig?.dependsOn?.taskIds &&
                    triggerConfig.dependsOn.taskIds.length > 0
                ) {
                    // Fetch all project tasks for context
                    const allProjectTasks = await taskRepository.findByProject(task.projectId);

                    // 2. Validate Dependencies
                    // For Manual Run (direct execute call), we generally want to IGNORE strict novelty checks
                    // The user is saying "Run this now!". As long as dependencies are met (status=done), we should run.
                    const dependencyCheck = areTaskDependenciesMet(task, allProjectTasks, true); // ignoreNovelty = true
                    if (!dependencyCheck.met) {
                        const errorMsg = `Cannot execute task: ${dependencyCheck.reason || 'Conditions not met'}`;
                        const details = dependencyCheck.details || 'Dependencies not satisfied';

                        console.error(`[TaskExecution] ${errorMsg}`);
                        console.error(details);

                        // Log failure to history
                        await taskHistoryRepository.logExecutionFailed(taskId, errorMsg, {
                            reason: 'dependency_validation_failed',
                            details: dependencyCheck.details,
                        });

                        throw new Error(`${errorMsg}\n${details}`);
                    }
                }

                // Check if this is a script or input task - execute locally/handle input
                if (task.taskType === 'script' || task.taskType === 'input') {
                    console.log(`[TaskExecution] Executing script task ${taskId}`);

                    // Initialize execution state
                    const executionState: ExecutionState = {
                        taskId,
                        status: 'running',
                        startedAt: new Date(),
                        progress: 0,
                        currentPhase: 'initializing',
                        streamContent: '',
                    };
                    activeExecutions.set(taskId, executionState);

                    const initialStatus = 'in_progress';

                    // Update task status
                    // For Input Task, we set sub-status to WAITING_USER
                    const updateData: Partial<Task> = {
                        status: initialStatus,
                        startedAt: new Date(),
                    };

                    if (task.taskType === 'input') {
                        updateData.inputSubStatus = 'WAITING_USER';
                    }

                    await taskRepository.update(taskId, updateData);
                    getMainWindow()?.webContents.send('task:status-changed', {
                        id: taskId,
                        status: initialStatus,
                    });
                    getMainWindow()?.webContents.send('taskExecution:started', {
                        taskId,
                        startedAt: executionState.startedAt,
                    });

                    // 1. Handle Input Tasks
                    if (task.taskType === 'input') {
                        try {
                            const { InputProviderManager } =
                                await import('../../../src/services/workflow/input/InputProviderManager');
                            const providerManager = InputProviderManager.getInstance();

                            console.log('[TaskExecution] Handling Input Task:', task.id);
                            console.log('[TaskExecution] Raw inputConfig:', task.inputConfig);
                            console.log(
                                '[TaskExecution] inputConfig type:',
                                typeof task.inputConfig
                            );

                            const inputProvider = providerManager.getProviderForTask(task as Task);

                            if (!inputProvider) {
                                throw new Error('No input provider available for this task config');
                            }

                            await inputProvider.start(task as Task, {
                                taskId: task.id,
                                projectId: task.projectId,
                                userId: (task as any).userId || 0,
                            });

                            // Input task stays in 'in_progress' waiting for user input
                            return { success: true, waitingForInput: true };
                        } catch (error) {
                            executionState.status = 'failed';
                            executionState.error =
                                error instanceof Error ? error.message : String(error);
                            await taskRepository.update(taskId, { status: 'todo' });
                            getMainWindow()?.webContents.send('taskExecution:failed', {
                                taskId,
                                error: executionState.error,
                            });
                            throw error;
                        }
                    }

                    // Variable to store execution result
                    let result: any;

                    // 2. Handle Script Tasks
                    if (task.taskType === 'script') {
                        try {
                            const { scriptExecutor } = await import('../services/script-executor');
                            // Build dependency context
                            await buildDependencyContext(task as Task);

                            result = await scriptExecutor.execute(task as Task, task.projectId);

                            if (result.success) {
                                executionState.status = 'completed';
                                executionState.streamContent = result.output || '';

                                const executionResult = {
                                    content: result.output || '',
                                    duration: result.duration || 0,
                                    provider: 'script',
                                    model: task.scriptLanguage || 'javascript',
                                    logs: result.logs || [],
                                };

                                const finalStatus = task.autoApprove ? 'done' : 'in_review';
                                const updateData: any = {
                                    status: finalStatus,
                                    executionResult,
                                };

                                if (task.autoApprove) {
                                    updateData.completedAt = new Date().toISOString();
                                }

                                await taskRepository.update(taskId, updateData);

                                getMainWindow()?.webContents.send('task:status-changed', {
                                    id: taskId,
                                    status: finalStatus,
                                });
                                getMainWindow()?.webContents.send('taskExecution:completed', {
                                    taskId,
                                    result: executionResult,
                                });

                                await taskHistoryRepository.logExecutionCompleted(
                                    taskId,
                                    result.output || '',
                                    {
                                        provider: 'script',
                                        model: task.scriptLanguage || 'javascript',
                                        duration: result.duration || 0,
                                    }
                                );

                                if (finalStatus === 'done') {
                                    await checkAndExecuteDependentTasks(taskId, task as Task);
                                }

                                activeExecutions.delete(taskId);
                                return { success: true, result };
                            } else {
                                throw new Error(result.error || 'Script execution failed');
                            }
                        } catch (error) {
                            executionState.status = 'failed';
                            executionState.error =
                                error instanceof Error ? error.message : String(error);

                            await taskRepository.update(taskId, { status: 'todo' });
                            getMainWindow()?.webContents.send('taskExecution:failed', {
                                taskId,
                                error: executionState.error,
                            });
                            throw error;
                        }
                    }

                    // If not script and not input, we proceed to AI execution flow below.
                    // This return statement ensures script/input tasks exit here.
                    return; // Or throw an error if it's an unexpected task type
                }

                // 3. Handle Output Tasks
                if (task.taskType === 'output') {
                    console.log(`[TaskExecution] Executing output task ${taskId}`);

                    // Initialize execution state for Output Tasks to track status/errors locally
                    const executionState: ExecutionState = {
                        taskId,
                        status: 'running',
                        startedAt: new Date(),
                        progress: 0,
                        currentPhase: 'executing',
                        streamContent: '',
                    };
                    activeExecutions.set(taskId, executionState);

                    try {
                        const { OutputTaskRunner } = await import('../services/output'); // Ensure this imports correctly or use full path
                        const runner = new OutputTaskRunner();

                        // Execute output logic
                        const result = await runner.execute(taskId);

                        if (result.success) {
                            executionState.status = 'completed';

                            // Task status update is handled inside runner, but we ensure notification
                            getMainWindow()?.webContents.send('taskExecution:completed', {
                                taskId,
                                result: {
                                    content: 'Output execution completed',
                                    provider: 'output',
                                    model: 'connector',
                                    metadata: result.data || result.metadata || {},
                                },
                            });

                            // Trigger dependent tasks
                            const updatedTask = await taskRepository.findById(taskId);
                            if (updatedTask && updatedTask.status === 'done') {
                                await checkAndExecuteDependentTasks(taskId, updatedTask);
                            }

                            activeExecutions.delete(taskId);
                            return; // Exit here
                        } else {
                            throw new Error(result.error || 'Output execution failed');
                        }
                    } catch (error) {
                        executionState.status = 'failed';
                        executionState.error =
                            error instanceof Error ? error.message : String(error);

                        await taskRepository.update(taskId, { status: 'todo' });

                        getMainWindow()?.webContents.send('task:status-changed', {
                            id: taskId,
                            status: 'todo',
                        });

                        getMainWindow()?.webContents.send('taskExecution:failed', {
                            taskId,
                            error: executionState.error,
                        });
                        activeExecutions.delete(taskId); // Clean up
                        throw error;
                    }
                } // End Output Task block

                // 4. AI Task Execution (Default)
                // Initialize execution state for AI tasks
                let executionState: ExecutionState = {
                    taskId,
                    status: 'running',
                    startedAt: new Date(),
                    progress: 0,
                    currentPhase: 'initializing',
                    streamContent: '',
                };
                activeExecutions.set(taskId, executionState);

                // Update task status to in_progress
                await taskRepository.update(taskId, {
                    status: 'in_progress',
                    startedAt: new Date(),
                });
                getMainWindow()?.webContents.send('task:status-changed', {
                    id: taskId,
                    status: 'in_progress',
                });
                getMainWindow()?.webContents.send('taskExecution:started', {
                    taskId,
                    startedAt: executionState.startedAt,
                });

                try {
                    // Load operator configuration if assigned
                    if (task.assignedOperatorId) {
                        try {
                            const operator = await operatorRepository.findById(
                                task.assignedOperatorId
                            );
                            if (operator) {
                                console.log(
                                    `[TaskExecution] Using operator ${operator.name} for task ${taskId}`
                                );
                                task.aiProvider = operator.aiProvider;
                                task.aiModel = operator.aiModel;

                                if (operator.systemPrompt) {
                                    const originalPrompt =
                                        task.description || task.generatedPrompt || '';
                                    task.description = `${operator.systemPrompt}\n\n${originalPrompt}`;
                                    console.log(
                                        `[TaskExecution] Prepended operator system prompt to task`
                                    );
                                }
                            }
                        } catch (error) {
                            console.error(`[TaskExecution] Failed to load operator:`, error);
                        }
                    }

                    // Load Project for Context Management (Required for both Local and Default agents)
                    const project = await projectRepository.findById(task.projectId);

                    // Helper functions for Context Management
                    const buildContextPackage = (project: any, task: any) => {
                        if (!project) return '';
                        const memory = project.memory || {};
                        const recentDecisions =
                            (memory.recentDecisions || [])
                                .map((d: any) => `- ${d.date}: ${d.summary}`)
                                .join('\n') || 'None';
                        const glossary =
                            Object.entries(memory.glossary || {})
                                .map(([k, v]) => `- **${k}**: ${v}`)
                                .join('\n') || 'None';

                        let pkg = `[HighFlow Context Package]\n\n`;
                        pkg += `## Project Overview\n`;
                        pkg += `Project Name: ${project.title}\n`;
                        pkg += `Project Goal:\n${project.goal || 'Not specified'}\n\n`;
                        pkg += `Non-Goals / Constraints:\n${project.constraints || 'None'}\n\n`;
                        pkg += `Current Phase:\n${project.phase || 'Not specified'}\n\n`;
                        pkg += `---\n\n`;
                        pkg += `## Project Memory (Authoritative)\n`;
                        pkg += `The following is the current shared project memory.\n`;
                        pkg += `All decisions and terminology below are considered authoritative.\n`;
                        pkg += `Do NOT contradict unless explicitly instructed.\n\n`;
                        pkg += `${memory.summary || 'None'}\n\n`;
                        pkg += `Recent Decisions:\n${recentDecisions}\n\n`;
                        pkg += `Glossary:\n${glossary}\n\n`;
                        pkg += `---\n\n`;
                        pkg += `## Task Contract\n`;
                        pkg += `Task ID: ${task.id}\n`;
                        pkg += `Task Name: ${task.title}\n`;
                        pkg += `Task Type: ${task.taskType || 'ai'}\n`;
                        pkg += `Task Objective:\n${task.description || 'See below'}\n\n`;
                        pkg += `---\n\n`;
                        return pkg;
                    };

                    // getOutputContract removed to prevent pollution of task results with summary headers
                    // The CuratorService extracts this information independently.

                    const { CuratorService } =
                        await import('../../../src/services/ai/CuratorService');

                    const triggerCurator = async (
                        taskId: number,
                        task: any,
                        output: string,
                        project: any
                    ) => {
                        // Only trigger if task is marked as done (fully completed)
                        // If it goes to in_review, we wait until review is approved
                        if (task.status === 'done' || task.autoApprove) {
                            try {
                                // Fetch API keys from renderer localStorage to inject into Curator
                                const win = getMainWindow();
                                let apiKeys: any = {};

                                if (win) {
                                    try {
                                        // Read settings from localStorage in renderer context
                                        const storedProviders =
                                            await win.webContents.executeJavaScript(
                                                'localStorage.getItem("workflow_settings_aiProviders")'
                                            );

                                        if (storedProviders) {
                                            const providers = JSON.parse(storedProviders);
                                            apiKeys = {
                                                anthropic: providers.find(
                                                    (p: any) => p.id === 'anthropic' && p.apiKey
                                                )?.apiKey,
                                                openai: providers.find(
                                                    (p: any) => p.id === 'openai' && p.apiKey
                                                )?.apiKey,
                                                google: providers.find(
                                                    (p: any) => p.id === 'google' && p.apiKey
                                                )?.apiKey,
                                                groq: providers.find(
                                                    (p: any) => p.id === 'groq' && p.apiKey
                                                )?.apiKey,
                                                lmstudio: providers.find(
                                                    (p: any) => p.id === 'lmstudio' && p.apiKey
                                                )?.apiKey,
                                            };
                                            console.log(
                                                '[CuratorTrigger] Injected API keys for providers:',
                                                Object.keys(apiKeys).filter((k) => !!apiKeys[k])
                                            );
                                        }
                                    } catch (e) {
                                        console.warn(
                                            '[CuratorTrigger] Failed to fetch API keys from renderer:',
                                            e
                                        );
                                    }
                                }

                                const curator = CuratorService.getInstance();
                                curator.setApiKeys(apiKeys);

                                await curator.runCurator(
                                    taskId,
                                    task.title,
                                    output,
                                    project,
                                    null,
                                    projectRepository
                                );
                            } catch (err: any) {
                                console.error('[CuratorTrigger] Failed:', err);
                            }
                        }
                    };

                    // Route execution based on provider type using Provider Registry
                    const { isLocalAgent, getLocalAgentType } =
                        await import('../config/provider-registry');

                    // ==================================================================================
                    // PATH A: Local Agent Execution
                    // ==================================================================================
                    if (task.aiProvider && isLocalAgent(task.aiProvider)) {
                        const agentType = getLocalAgentType(task.aiProvider);
                        if (!agentType) {
                            throw new Error(`Invalid local agent provider: ${task.aiProvider}`);
                        }

                        console.log(
                            `[TaskExecution] Routing task ${taskId} to Local Agent: ${agentType}`
                        );

                        const workingDir = project?.baseDevFolder;
                        if (!workingDir) {
                            throw new Error(
                                `Task ${taskId} requires a working directory (baseDevFolder) for local agent execution`
                            );
                        }

                        const { sessionManager } = await import('../services/local-agent-session');

                        const { FileSystemMonitor } =
                            await import('../services/file-system-monitor');
                        const fsMonitor = new FileSystemMonitor(workingDir);
                        fsMonitor.takeSnapshot();

                        const { previousResults } = await buildDependencyContext(task as Task);

                        // Build task prompt inline

                        // Build prompt with Macro Resolution
                        const buildTaskPrompt = (
                            task: any,
                            contextResults: any[],
                            project: any
                        ) => {
                            // Resolve macros in description and generatedPrompt
                            const macroContext = {
                                previousResults: contextResults,
                                variables: {},
                                projectName: project?.title,
                                projectDescription: project?.description || undefined,
                                currentTaskId: task.id,
                            };

                            const resolvedDescription = PromptMacroService.replaceMacros(
                                task.description || '',
                                macroContext
                            );
                            const resolvedGeneratedPrompt = PromptMacroService.replaceMacros(
                                task.generatedPrompt || '',
                                macroContext
                            );

                            let prompt = '';

                            // 1. Context Package Injection
                            prompt += buildContextPackage(project, task);

                            if (task.title) prompt += `# Task: ${task.title}\n\n`;
                            // Use resolved description
                            if (resolvedDescription) prompt += `${resolvedDescription}\n\n`;

                            if (contextResults && contextResults.length > 0) {
                                prompt += `## Context from Previous Tasks:\n`;
                                contextResults.forEach((res) => {
                                    prompt += `### Task: ${res.taskTitle}\n`;
                                    let outputContent = res.output;
                                    if (
                                        typeof outputContent === 'string' &&
                                        isBase64Image(outputContent)
                                    ) {
                                        const imagePath = saveBase64ImageToTempFile(
                                            outputContent,
                                            res.taskId
                                        );
                                        outputContent = `[Image saved to: ${imagePath}]\n\nNote: The image file is available at the path above. You can reference it in your work.`;
                                    }
                                    prompt += `Output:\n${outputContent}\n`;
                                    if (res.metadata?.files && Array.isArray(res.metadata.files)) {
                                        prompt += `\nFiles created in this task:\n`;
                                        res.metadata.files.forEach((f: any) => {
                                            prompt += `- ${f.path} (${f.type}, ${f.size} bytes)\n`;
                                            if (f.content && f.size < 50000) {
                                                prompt += `\nContent of ${f.path}:\n\`\`\`${f.extension || ''}\n${f.content}\n\`\`\`\n`;
                                            }
                                        });
                                    }
                                    prompt += `\n---\n\n`;
                                });
                            }

                            // Use resolved Generated Prompt
                            if (resolvedGeneratedPrompt)
                                prompt += `## Instructions:\n${resolvedGeneratedPrompt}\n\n`;

                            if (task.expectedOutputFormat) {
                                const format = task.expectedOutputFormat;
                                prompt += `## Expected Output Format: ${format}\n\n`;
                                const fileFormats = [
                                    'html',
                                    'css',
                                    'javascript',
                                    'js',
                                    'code',
                                    'json',
                                    'ts',
                                    'typescript',
                                    'vue',
                                    'py',
                                    'python',
                                ];
                                if (
                                    fileFormats.includes(format.toLowerCase()) ||
                                    format.includes('/')
                                ) {
                                    prompt += `## ⚠️ CRITICAL - CREATE ACTUAL FILES ⚠️\n`;
                                    prompt += `You MUST create actual file(s) in the current directory matching the requirement.\n`;
                                    prompt += `DO NOT just provide examples. USE your file system tools (Write/Create) to CREATE the files on disk.\n\n`;
                                }
                            }

                            // Output Contract Injection Removed (Curator handles memory updates)
                            // prompt += getOutputContract();

                            return prompt;
                        };

                        const sessionInfo = await sessionManager.createSession(
                            agentType,
                            workingDir,
                            undefined,
                            taskId // Pass taskId for session tracking
                        );

                        // Re-fetch execution state safely
                        const tempState = activeExecutions.get(taskId);
                        if (!tempState) {
                            console.error(
                                `[TaskExecution] Execution state was deleted for task ${taskId}`
                            );
                            throw new Error('Execution state was cleared before completion');
                        }
                        executionState = tempState;

                        const prompt = buildTaskPrompt(task, previousResults, project);
                        const response = await sessionManager.sendMessage(sessionInfo.id, prompt, {
                            timeout: options?.timeout || 300000,
                            onChunk: (chunk) => {
                                const state = activeExecutions.get(taskId);
                                if (state) state.streamContent += chunk;

                                getMainWindow()?.webContents.send('taskExecution:progress', {
                                    taskId,
                                    progress: state?.progress || 0,
                                    phase: 'generating',
                                    delta: chunk,
                                    content: state?.streamContent || '',
                                });
                            },
                        });

                        // Close session
                        await sessionManager.closeSession(sessionInfo.id);

                        const fileChanges = fsMonitor.getChanges({ includeContent: true });
                        console.log(`[TaskExecution] Detected ${fileChanges.length} file changes`);

                        if (response.success) {
                            await taskHistoryRepository.logExecutionStarted(
                                taskId,
                                prompt, // Log the Resolved Prompt
                                task.aiProvider || 'local',
                                'local-model'
                            );

                            // Re-check execution state before updating
                            const tempState = activeExecutions.get(taskId);
                            if (!tempState) {
                                console.error(
                                    `[TaskExecution] Execution state was deleted for task ${taskId} during execution`
                                );
                                throw new Error('Execution state was cleared during execution');
                            }
                            executionState = tempState;

                            // Update execution state
                            executionState.status = 'completed';
                            executionState.streamContent = response.content;

                            const executionResult = {
                                content: response.content,
                                duration: response.duration,
                                provider: task.aiProvider,
                                tokenUsage: response.tokenUsage,
                                files: fileChanges.map((f) => ({
                                    path: f.relativePath,
                                    absolutePath: f.path,
                                    type: f.type,
                                    content: f.content,
                                    size: f.size,
                                    extension: f.extension,
                                })),
                                transcript: response.transcript,
                            };

                            const finalStatus = task.autoApprove ? 'done' : 'in_review';
                            const updateData: any = { status: finalStatus, executionResult };
                            if (task.autoApprove) updateData.completedAt = new Date().toISOString();

                            await taskRepository.update(taskId, updateData);

                            console.log(
                                `[LocalAgent] ✅ Task ${taskId} completed - status: ${finalStatus}`
                            );

                            getMainWindow()?.webContents.send('task:status-changed', {
                                id: taskId,
                                status: finalStatus,
                            });
                            getMainWindow()?.webContents.send('taskExecution:completed', {
                                taskId,
                                result: executionResult,
                            });

                            await taskHistoryRepository.logExecutionCompleted(
                                taskId,
                                response.content,
                                {
                                    provider: task.aiProvider || 'local',
                                    model: 'local-model',
                                    cost: 0,
                                    tokens: response.tokenUsage
                                        ? response.tokenUsage.input + response.tokenUsage.output
                                        : 0,
                                    duration: response.duration,
                                },
                                undefined,
                                executionResult
                            );

                            if (finalStatus === 'done') {
                                triggerCurator(taskId, task, response.content, project); // Trigger Curator
                                await checkAndExecuteDependentTasks(taskId, task as Task);
                            }

                            activeExecutions.delete(taskId);
                            return { success: true, result: response };
                        } else {
                            throw new Error(response.error || 'Local agent execution failed');
                        }
                    }

                    // ==================================================================================
                    // PATH B: Default AI Provider Execution
                    // ==================================================================================

                    // Fetch dependent task results
                    const { previousResults } = await buildDependencyContext(task as Task);

                    // Context Injection & Prompt Construction (Consolidated)
                    const contextPackage = buildContextPackage(project, task);
                    let basePrompt = task.generatedPrompt || task.description || '';
                    task.description = `${contextPackage}\n${basePrompt}`;

                    // Ensure generatedPrompt matches description for consistency, though Executor uses description
                    task.generatedPrompt = task.description;

                    // Build Execution Context
                    const context = executor.buildExecutionContext(task as Task, previousResults);

                    // Resolve Macros via PromptMacroService
                    // (Note: Executor execution logic also calls substituteVariables, but we do it here to log the resolved version)
                    const macroContext = {
                        previousResults: context.previousResults || [],
                        variables: context.variables || {},
                        projectName: project?.title,
                        projectDescription: project?.description || undefined,
                        currentTaskId: taskId,
                    };

                    const resolvedDescription = PromptMacroService.replaceMacros(
                        task.description,
                        macroContext
                    );

                    // Update task description with resolved version so Executor uses it without needing to resolve again
                    task.description = resolvedDescription;
                    task.generatedPrompt = resolvedDescription;

                    // Log Execution Started with RESOLVED Prompt
                    await taskHistoryRepository.logExecutionStarted(
                        taskId,
                        resolvedDescription,
                        task.aiProvider || undefined,
                        undefined
                    );

                    // Safe Execution State
                    const tempState = activeExecutions.get(taskId);
                    if (!tempState) {
                        console.error(
                            `[TaskExecution] Execution state was deleted for task ${taskId}`
                        );
                        throw new Error('Execution state was cleared before AI execution');
                    }
                    executionState = tempState;

                    const onToken = (token: string) => {
                        const state = activeExecutions.get(taskId);
                        if (state) state.streamContent += token;
                        getMainWindow()?.webContents.send('taskExecution:progress', {
                            taskId,
                            progress: state?.progress ?? 50,
                            phase: 'streaming',
                            delta: token,
                            content: state?.streamContent ?? token,
                        });
                    };

                    const onProgress = (progress: {
                        phase: string;
                        elapsedTime: number;
                        content?: string;
                    }) => {
                        const state = activeExecutions.get(taskId);
                        if (state) state.currentPhase = progress.phase;
                        getMainWindow()?.webContents.send('taskExecution:progress', {
                            taskId,
                            progress: state?.progress ?? 50,
                            phase: progress.phase,
                        });
                    };

                    context.metadata = {
                        streaming: options?.streaming ?? true,
                        timeout: options?.timeout ?? 300000,
                        fallbackProviders: options?.fallbackProviders || ['openai', 'google'],
                        onToken,
                        onProgress,
                    };

                    const result = await executor.executeTask(task as Task, context, {
                        timeout: options?.timeout ?? 300000,
                        fallbackProviders: options?.fallbackProviders,
                        onLog: (level, message, details) =>
                            sendActivityLog(level, message, details),
                    });

                    // Check stopped state
                    const currentState = activeExecutions.get(taskId);
                    if (!currentState || currentState.status === 'stopped') {
                        await taskRepository.update(taskId, { status: 'todo' });
                        getMainWindow()?.webContents.send('task:status-changed', {
                            id: taskId,
                            status: 'todo',
                        });
                        getMainWindow()?.webContents.send('taskExecution:stopped', { taskId });
                        activeExecutions.delete(taskId);
                        return { success: false, stopped: true };
                    }

                    if (result.status === 'success') {
                        const aiResult = result.output?.aiResult;
                        const displayContent =
                            aiResult?.value ??
                            (typeof result.output?.content === 'string'
                                ? result.output.content
                                : JSON.stringify(result.output));

                        // Re-check execution state before updating
                        const tempState = activeExecutions.get(taskId);
                        if (!tempState) {
                            console.error(
                                `[TaskExecution] Execution state was deleted for task ${taskId} after execution`
                            );
                            throw new Error('Execution state was cleared after execution');
                        }
                        executionState = tempState;

                        executionState.status = 'completed';
                        executionState.progress = 100;
                        executionState.currentPhase = 'completed';
                        executionState.streamContent = displayContent;

                        const executionResult = {
                            content: displayContent,
                            aiResult,
                            cost: result.cost,
                            tokens: result.tokens,
                            duration: result.duration,
                            provider: aiResult?.meta?.provider || result.metadata?.provider,
                            model: aiResult?.meta?.model || result.metadata?.model,
                            attachments:
                                (result.metadata?.attachments as any) || result.attachments || [],
                        };

                        const finalStatus = task.autoApprove ? 'done' : 'in_review';
                        const updateData: any = { status: finalStatus, executionResult };
                        if (task.autoApprove) updateData.completedAt = new Date().toISOString();

                        await taskRepository.update(taskId, updateData);

                        console.log(
                            `[Main IPC] ✅ Task ${taskId} completed - status: ${finalStatus}`
                        );

                        getMainWindow()?.webContents.send('task:status-changed', {
                            id: taskId,
                            status: finalStatus,
                        });
                        getMainWindow()?.webContents.send('taskExecution:completed', {
                            taskId,
                            result: executionResult,
                        });

                        await taskHistoryRepository.logExecutionCompleted(
                            taskId,
                            displayContent || '',
                            {
                                provider: aiResult?.meta?.provider || result.metadata?.provider,
                                model: aiResult?.meta?.model || result.metadata?.model,
                                cost: result.cost,
                                tokens: result.tokens,
                                duration: result.duration,
                            },
                            aiResult
                        );

                        if (finalStatus === 'done') {
                            triggerCurator(taskId, task, displayContent || '', project); // Trigger Curator
                            await checkAndExecuteDependentTasks(taskId, task as Task);
                        }

                        activeExecutions.delete(taskId);

                        // CHECK QUEUE: If there's a pending request for this task, execute it now.
                        if (executionQueue.has(taskId)) {
                            const triggerId = executionQueue.get(taskId)!;
                            executionQueue.delete(taskId);
                            console.log(
                                `[TaskExecution] 🔄 Processing queued execution for task ${taskId} (Triggered by ${triggerId})`
                            );

                            // Small delay to ensure DB writes settle?
                            setTimeout(() => {
                                // We strictly re-trigger the dependency check or just execute?
                                // Since we queued it, we know it WAS requested.
                                // But we still need to check validty?
                                // Easier to just "simulate" a trigger from the source.

                                // Actually better: Calling checkAndExecuteDependentTasks is for DOWNSTREAM.
                                // We need to execute THIS task.
                                // We can emit the auto-execution event to frontend just like checkResult would.

                                const win = getMainWindow();
                                win?.webContents.send('task:autoExecutionStarting', {
                                    taskId: taskId,
                                    triggeredBy: triggerId,
                                });
                                win?.webContents.send('task:triggerAutoExecution', {
                                    taskId: taskId,
                                    triggeredBy: triggerId,
                                });
                            }, 500);
                        }

                        return { success: true, result };
                    } else {
                        // Failed
                        // Re-check execution state before updating
                        const tempState = activeExecutions.get(taskId);
                        if (!tempState) {
                            console.error(
                                `[TaskExecution] Execution state was deleted for task ${taskId} during failure handling`
                            );
                            throw new Error('Execution state was cleared during failure handling');
                        }
                        executionState = tempState;

                        executionState.status = 'failed';
                        executionState.error = result.error?.message || 'Unknown error';

                        const permissionError =
                            result.error instanceof MCPPermissionError ? result.error : null;
                        if (permissionError) {
                            // Handle permission error (abbreviated for compactness, logic same as before)
                            const permissionResult = {
                                content: buildPermissionDeniedContent(permissionError),
                                metadata: { permissionDenied: true, ...permissionError.details },
                            };
                            await taskRepository.update(taskId, {
                                status: 'in_review',
                                executionResult: permissionResult,
                            });
                            getMainWindow()?.webContents.send('task:status-changed', {
                                id: taskId,
                                status: 'in_review',
                            });
                            getMainWindow()?.webContents.send('taskExecution:completed', {
                                taskId,
                                result: permissionResult,
                            });
                            activeExecutions.delete(taskId);
                            return { success: false, error: permissionError.message };
                        }

                        throw new Error(executionState.error);
                    }
                } catch (error) {
                    console.error('Error executing AI task:', error);
                    activeExecutions.delete(taskId);

                    // Don't revert to todo if it was a permission error handled above, but here we catch threw errors
                    await taskRepository.update(taskId, { status: 'todo' }).catch(() => {});
                    getMainWindow()?.webContents.send('task:status-changed', {
                        id: taskId,
                        status: 'todo',
                    });
                    getMainWindow()?.webContents.send('taskExecution:failed', {
                        taskId,
                        error: error instanceof Error ? error.message : String(error),
                    });
                    throw error;
                }
            } catch (error) {
                console.error('Error executing task:', error);

                // Clean up on error
                activeExecutions.delete(taskId);

                // Revert status
                await taskRepository.update(taskId, { status: 'todo' }).catch(() => {});
                getMainWindow()?.webContents.send('task:status-changed', {
                    id: taskId,
                    status: 'todo',
                });
                getMainWindow()?.webContents.send('taskExecution:failed', {
                    taskId,
                    error: error instanceof Error ? error.message : String(error),
                });

                throw error;
            }
        }
    );

    /**
     * Pause task execution
     */
    ipcMain.handle('taskExecution:pause', async (_event, taskId: number) => {
        try {
            const state = activeExecutions.get(taskId);
            if (!state) {
                throw new Error(`No active execution for task ${taskId}`);
            }

            if (state.status !== 'running') {
                throw new Error(`Task ${taskId} is not running (current status: ${state.status})`);
            }

            state.status = 'paused';
            state.pausedAt = new Date();

            getMainWindow()?.webContents.send('taskExecution:paused', {
                taskId,
                pausedAt: state.pausedAt,
            });

            // Log paused to history
            await taskHistoryRepository.logPaused(taskId);

            return { success: true };
        } catch (error) {
            console.error('Error pausing task:', error);
            throw error;
        }
    });

    /**
     * Resume paused task execution
     */
    ipcMain.handle('taskExecution:resume', async (_event, taskId: number) => {
        try {
            const state = activeExecutions.get(taskId);
            if (!state) {
                throw new Error(`No active execution for task ${taskId}`);
            }

            if (state.status !== 'paused') {
                throw new Error(`Task ${taskId} is not paused (current status: ${state.status})`);
            }

            state.status = 'running';
            state.pausedAt = undefined;

            getMainWindow()?.webContents.send('taskExecution:resumed', { taskId });

            // Log resumed to history
            await taskHistoryRepository.logResumed(taskId);

            return { success: true };
        } catch (error) {
            console.error('Error resuming task:', error);
            throw error;
        }
    });

    /**
     * Stop task execution and revert to TODO
     */
    ipcMain.handle('taskExecution:stop', async (_event, taskId: number) => {
        try {
            const aiCancelled = executor.cancelTaskExecution(taskId);
            if (aiCancelled) {
                console.log(`[TaskExecution] Sent cancel signal to AI provider for task ${taskId}`);
            } else {
                console.warn(
                    `[TaskExecution] No active AI execution found to cancel for task ${taskId}`
                );
            }

            // Terminate Local Agent session if exists
            try {
                const { sessionManager } = await import('../services/local-agent-session');
                const sessionTerminated = await sessionManager.terminateTaskSession(taskId);
                if (sessionTerminated) {
                    console.log(
                        `[TaskExecution] Terminated Local Agent session for task ${taskId}`
                    );
                }
            } catch (error) {
                // Session manager might not be available or session doesn't exist
                console.debug(
                    `[TaskExecution] No Local Agent session to terminate for task ${taskId}`
                );
            }

            const state = activeExecutions.get(taskId);
            if (state) {
                state.status = 'stopped';
                state.currentPhase = 'stopped';
            }

            // Update task status to todo and clear inputSubStatus
            await taskRepository.update(taskId, {
                status: 'todo',
                inputSubStatus: null,
            });
            getMainWindow()?.webContents.send('task:status-changed', {
                id: taskId,
                status: 'todo',
            });
            getMainWindow()?.webContents.send('taskExecution:stopped', { taskId });

            // Log stopped to history
            await taskHistoryRepository.logStopped(taskId);

            activeExecutions.delete(taskId);

            return { success: true };
        } catch (error) {
            console.error('Error stopping task:', error);
            throw error;
        }
    });

    /**
     * Get execution status for a task
     */
    ipcMain.handle('taskExecution:getStatus', async (_event, taskId: number) => {
        const state = activeExecutions.get(taskId);
        if (!state) {
            return null;
        }

        return {
            taskId: state.taskId,
            status: state.status,
            startedAt: state.startedAt,
            pausedAt: state.pausedAt,
            progress: state.progress,
            currentPhase: state.currentPhase,
            streamContent: state.streamContent,
            error: state.error,
        };
    });

    /**
     * Get all active executions
     */
    ipcMain.handle('taskExecution:getAllActive', async () => {
        const executions: Array<{
            taskId: number;
            status: string;
            startedAt: Date;
            progress: number;
            currentPhase: string;
        }> = [];

        activeExecutions.forEach((state, taskId) => {
            executions.push({
                taskId,
                status: state.status,
                startedAt: state.startedAt,
                progress: state.progress,
                currentPhase: state.currentPhase,
            });
        });

        return executions;
    });

    /**
     * Pause All Executions (Global)
     */
    ipcMain.handle('taskExecution:pauseAll', async () => {
        GlobalExecutionService.getInstance().setGlobalPause(true);
        // Note: This prevents NEW executions.
        // It does NOT pause currently running tasks (existing behavior).
        // If we wanted to pause running tasks, we would need to iterate activeExecutions and pause them.
        // For now, "Pause" means "Stop processing the queue/prevent new runs".
        return true;
    });

    /**
     * Resume All Executions (Global)
     */
    ipcMain.handle('taskExecution:resumeAll', async () => {
        GlobalExecutionService.getInstance().setGlobalPause(false);
        return true;
    });

    /**
     * Get Global Pause Status
     */
    ipcMain.handle('taskExecution:getGlobalPauseStatus', async () => {
        return GlobalExecutionService.getInstance().isGlobalPaused();
    });

    // ========================================
    // NEEDS_APPROVAL State Handlers
    // ========================================

    /**
     * Request user approval during execution (AI requested input)
     */
    ipcMain.handle(
        'taskExecution:requestApproval',
        async (
            _event,
            taskId: number,
            data: {
                question: string;
                options?: string[];
                context?: unknown;
            }
        ) => {
            try {
                const state = activeExecutions.get(taskId);
                if (state) {
                    state.status = 'needs_approval';
                    state.currentPhase = 'waiting_for_approval';
                }

                // Update task status to needs_approval
                await taskRepository.update(taskId, {
                    status: 'needs_approval',
                    aiApprovalRequest: JSON.stringify(data),
                });

                getMainWindow()?.webContents.send('task:status-changed', {
                    id: taskId,
                    status: 'needs_approval',
                });
                getMainWindow()?.webContents.send('taskExecution:approvalRequired', {
                    taskId,
                    question: data.question,
                    options: data.options,
                    context: data.context,
                });

                // Log approval requested to history
                await taskHistoryRepository.logApprovalRequested(
                    taskId,
                    data.question,
                    data.options
                );

                return { success: true };
            } catch (error) {
                console.error('Error requesting approval:', error);
                throw error;
            }
        }
    );

    /**
     * Approve and continue execution with user response
     */
    ipcMain.handle('taskExecution:approve', async (_event, taskId: number, response?: string) => {
        try {
            const state = activeExecutions.get(taskId);
            if (state) {
                state.status = 'running';
                state.currentPhase = 'resuming_after_approval';
            }

            // Update task status back to in_progress
            await taskRepository.update(taskId, {
                status: 'in_progress',
                aiApprovalResponse: response,
            });

            getMainWindow()?.webContents.send('task:status-changed', {
                id: taskId,
                status: 'in_progress',
            });
            getMainWindow()?.webContents.send('taskExecution:approved', {
                taskId,
                response,
            });

            // Log approved to history
            await taskHistoryRepository.logApproved(taskId, response);

            return { success: true };
        } catch (error) {
            console.error('Error approving task:', error);
            throw error;
        }
    });

    /**
     * Reject and revert to TODO
     */
    ipcMain.handle('taskExecution:reject', async (_event, taskId: number) => {
        try {
            // Update task status to todo
            await taskRepository.update(taskId, {
                status: 'todo',
                aiApprovalRequest: null,
                aiApprovalResponse: null,
            });

            getMainWindow()?.webContents.send('task:status-changed', {
                id: taskId,
                status: 'todo',
            });
            getMainWindow()?.webContents.send('taskExecution:rejected', { taskId });

            // Log rejected to history
            await taskHistoryRepository.logRejected(taskId);

            activeExecutions.delete(taskId);

            return { success: true };
        } catch (error) {
            console.error('Error rejecting task:', error);
            throw error;
        }
    });

    // ========================================
    // IN_REVIEW State Handlers
    // ========================================

    /**
     * Complete review and move to DONE
     */
    ipcMain.handle('taskExecution:completeReview', async (_event, taskId: number) => {
        try {
            // Get task before updating for dependent task check
            const task = await taskRepository.findById(taskId);
            if (!task) {
                throw new Error(`Task ${taskId} not found`);
            }

            await taskRepository.update(taskId, { status: 'done', completedAt: new Date() });

            getMainWindow()?.webContents.send('task:status-changed', {
                id: taskId,
                status: 'done',
            });
            getMainWindow()?.webContents.send('taskExecution:reviewCompleted', { taskId });

            // Log review completed to history
            await taskHistoryRepository.logReviewCompleted(taskId);

            // Check and execute dependent tasks
            await checkAndExecuteDependentTasks(taskId, { ...task, status: 'done' });

            return { success: true };
        } catch (error) {
            console.error('Error completing review:', error);
            throw error;
        }
    });

    /**
     * Request changes and restart execution
     */
    ipcMain.handle(
        'taskExecution:requestChanges',
        async (_event, taskId: number, refinementPrompt: string) => {
            try {
                // Store the refinement prompt
                await taskRepository.update(taskId, {
                    status: 'in_progress',
                    refinementPrompt,
                });

                getMainWindow()?.webContents.send('task:status-changed', {
                    id: taskId,
                    status: 'in_progress',
                });
                getMainWindow()?.webContents.send('taskExecution:changesRequested', {
                    taskId,
                    refinementPrompt,
                });

                // Log changes requested to history
                await taskHistoryRepository.logChangesRequested(taskId, refinementPrompt);

                return { success: true };
            } catch (error) {
                console.error('Error requesting changes:', error);
                throw error;
            }
        }
    );

    // ========================================
    // DONE State Handlers
    // ========================================

    /**
     * Request additional work on completed task
     */
    ipcMain.handle(
        'taskExecution:requestAdditionalWork',
        async (_event, taskId: number, additionalWorkPrompt: string) => {
            try {
                await taskRepository.update(taskId, {
                    status: 'in_progress',
                    additionalWorkPrompt,
                });

                getMainWindow()?.webContents.send('task:status-changed', {
                    id: taskId,
                    status: 'in_progress',
                });
                getMainWindow()?.webContents.send('taskExecution:additionalWorkRequested', {
                    taskId,
                    additionalWorkPrompt,
                });

                return { success: true };
            } catch (error) {
                console.error('Error requesting additional work:', error);
                throw error;
            }
        }
    );

    // ========================================
    // BLOCKED State Handlers
    // ========================================

    /**
     * Block a task (cancels any active execution)
     */
    ipcMain.handle('taskExecution:block', async (_event, taskId: number, reason?: string) => {
        try {
            // Stop any active execution
            const state = activeExecutions.get(taskId);
            if (state) {
                state.status = 'stopped';
                activeExecutions.delete(taskId);
            }

            await taskRepository.update(taskId, {
                status: 'blocked',
                blockReason: reason,
            });

            getMainWindow()?.webContents.send('task:status-changed', {
                id: taskId,
                status: 'blocked',
            });
            getMainWindow()?.webContents.send('taskExecution:blocked', { taskId, reason });

            return { success: true };
        } catch (error) {
            console.error('Error blocking task:', error);
            throw error;
        }
    });

    /**
     * Unblock a task (moves to TODO)
     */
    ipcMain.handle('taskExecution:unblock', async (_event, taskId: number) => {
        try {
            await taskRepository.update(taskId, {
                status: 'todo',
                blockReason: null,
            });

            getMainWindow()?.webContents.send('task:status-changed', {
                id: taskId,
                status: 'todo',
            });
            getMainWindow()?.webContents.send('taskExecution:unblocked', { taskId });

            return { success: true };
        } catch (error) {
            console.error('Error unblocking task:', error);
            throw error;
        }
    });

    // ========================================
    // Streaming Progress Handler
    // ========================================

    /**
     * Update streaming progress (called internally during execution)
     */
    ipcMain.handle(
        'taskExecution:updateProgress',
        async (
            _event,
            taskId: number,
            progress: {
                percentage: number;
                phase: string;
                content?: string;
                delta?: string;
                tokensUsed?: number;
                cost?: number;
            }
        ) => {
            try {
                const state = activeExecutions.get(taskId);
                if (state) {
                    state.progress = progress.percentage;
                    state.currentPhase = progress.phase;
                    if (progress.content !== undefined) {
                        state.streamContent = progress.content || '';
                    } else if (progress.delta) {
                        state.streamContent += progress.delta;
                    }
                }

                getMainWindow()?.webContents.send('taskExecution:progress', {
                    taskId,
                    progress: progress.percentage,
                    phase: progress.phase,
                    delta: progress.delta,
                    content: state?.streamContent,
                    tokensUsed: progress.tokensUsed,
                    cost: progress.cost,
                });

                return { success: true };
            } catch (error) {
                console.error('Error updating progress:', error);
                throw error;
            }
        }
    );

    // ========================================
    // Recovery Handlers
    // ========================================

    /**
     * Clear all active executions (for recovery)
     */
    ipcMain.handle('taskExecution:clearAll', async () => {
        try {
            const count = activeExecutions.size;
            activeExecutions.clear();
            console.log(`[TaskExecution] Cleared ${count} active executions via IPC`);
            return { success: true, cleared: count };
        } catch (error) {
            console.error('Error clearing active executions:', error);
            throw error;
        }
    });

    /**
     * Reset stuck tasks (tasks with in_progress status but no active execution)
     */
    ipcMain.handle('taskExecution:resetStuck', async () => {
        try {
            const resetCount = await resetStuckTasks();
            return { success: true, reset: resetCount };
        } catch (error) {
            console.error('Error resetting stuck tasks:', error);
            throw error;
        }
    });

    /**
     * Force clear a specific task execution
     */
    ipcMain.handle('taskExecution:forceClear', async (_event, taskId: number) => {
        try {
            const hadExecution = activeExecutions.has(taskId);
            activeExecutions.delete(taskId);

            // Reset task status to todo
            await taskRepository.update(taskId, { status: 'todo' });
            getMainWindow()?.webContents.send('task:status-changed', {
                id: taskId,
                status: 'todo',
            });

            console.log(
                `[TaskExecution] Force cleared task ${taskId} (had execution: ${hadExecution})`
            );
            return { success: true, hadExecution };
        } catch (error) {
            console.error('Error force clearing task:', error);
            throw error;
        }
    });

    // ========================================
    // Auto AI Review Handlers
    // ========================================

    /**
     * Start AI review for a task in IN_REVIEW status
     * Called automatically when autoReview is enabled and task moves to IN_REVIEW
     */
    ipcMain.handle(
        'taskExecution:startAutoReview',
        async (
            _event,
            taskId: number,
            options?: {
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
            }
        ) => {
            try {
                // Set API keys if provided
                if (options?.apiKeys) {
                    executor.setApiKeys(options.apiKeys);
                }

                if (options?.enabledProviders) {
                    executor.setEnabledProviders(options.enabledProviders);
                }

                if (options?.mcpServers) {
                    executor.setMCPServers(options.mcpServers);
                }

                // Get task from database
                const task = await taskRepository.findById(taskId);
                if (!task) {
                    throw new Error(`Task ${taskId} not found`);
                }

                // Verify task is in IN_REVIEW status
                if (task.status !== 'in_review') {
                    throw new Error(
                        `Task ${taskId} is not in IN_REVIEW status (current: ${task.status})`
                    );
                }

                // Check if already reviewing
                if (activeReviews.has(taskId)) {
                    throw new Error(`Task ${taskId} is already being reviewed`);
                }

                // Get execution result
                const executionResult = task.executionResult
                    ? typeof task.executionResult === 'string'
                        ? JSON.parse(task.executionResult)
                        : task.executionResult
                    : null;

                if (!executionResult?.content) {
                    throw new Error(`Task ${taskId} has no execution result to review`);
                }

                const { dependencyTaskIds, previousResults } = await buildDependencyContext(
                    task as Task
                );
                const promptSource = (task.generatedPrompt || task.description || '').trim();
                const hasMacros =
                    promptSource.length > 0 &&
                    PromptMacroService.findMacros(promptSource).length > 0;
                const shouldResolveMacros =
                    task.autoReview && dependencyTaskIds.length > 0 && hasMacros;
                let resolvedPromptForReview = promptSource;

                if (shouldResolveMacros) {
                    try {
                        resolvedPromptForReview = PromptMacroService.replaceMacros(promptSource, {
                            previousResults,
                            variables: {},
                            projectName: (task as any).projectName,
                            projectDescription: (task as any).projectDescription,
                            currentTaskId: task.id,
                        });
                        console.log('[TaskExecution] Resolved macros for auto-review prompt', {
                            taskId,
                            dependencyCount: dependencyTaskIds.length,
                        });
                    } catch (macroError) {
                        console.error(
                            '[TaskExecution] Failed to resolve macros for auto-review prompt:',
                            macroError
                        );
                    }
                }

                // Initialize review state
                const reviewState: ReviewState = {
                    taskId,
                    status: 'reviewing',
                    startedAt: new Date(),
                    progress: 0,
                    streamContent: '',
                };
                activeReviews.set(taskId, reviewState);

                // Notify frontend that review is starting
                const win = getMainWindow();
                win?.webContents.send('taskReview:started', {
                    taskId,
                    startedAt: reviewState.startedAt,
                });

                // Log AI review requested to history
                await taskHistoryRepository.logAIReviewRequested(
                    taskId,
                    resolvedPromptForReview || task.description || task.generatedPrompt || '',
                    executionResult.content
                );

                // Build review prompt
                const reviewPrompt = buildReviewPrompt(
                    task,
                    executionResult.content,
                    resolvedPromptForReview || undefined
                );

                // Fetch project to resolve inheritance
                const project = await projectRepository.findById(task.projectId);

                // Priority 1: Check for reviewer operator
                let effectiveConfig: {
                    provider: string | null;
                    model: string | null;
                    source: string;
                };
                let reviewerOperator: any = null;

                if (task.projectId) {
                    const operators = await operatorRepository.findByProject(task.projectId);
                    reviewerOperator = operators.find(
                        (op: any) => op.isReviewer === 1 || op.isReviewer === true
                    );

                    if (reviewerOperator) {
                        effectiveConfig = {
                            provider: reviewerOperator.aiProvider,
                            model: reviewerOperator.aiModel,
                            source: 'reviewer-operator',
                        };
                    } else {
                        // Priority 2-4: Use standard resolution (Task > Project > Global)
                        effectiveConfig = resolveAutoReviewProvider(task, project as any);
                    }
                } else {
                    effectiveConfig = resolveAutoReviewProvider(task, project as any);
                }

                console.log('[TaskExecution] Starting auto-review with settings:', {
                    taskId,
                    provider: effectiveConfig.provider,
                    model: effectiveConfig.model,
                    source: effectiveConfig.source,
                    streaming: options?.streaming,
                });

                // Streaming callback for review
                const onReviewToken = (token: string) => {
                    const state = activeReviews.get(taskId);
                    if (state) {
                        state.streamContent += token;
                    }
                    // Send streaming content to frontend
                    const reviewWin = getMainWindow();
                    if (reviewWin) {
                        console.log(
                            '[Main IPC] Sending review progress:',
                            taskId,
                            'streaming',
                            token.slice(0, 20)
                        );
                        reviewWin.webContents.send('taskReview:progress', {
                            taskId,
                            progress: state?.progress ?? 50,
                            phase: 'reviewing',
                            content: token,
                        });
                    }
                };

                // Extract image data if execution result contains base64 image
                let imageDataForReview: string | undefined;
                if (isBase64Image(executionResult.content)) {
                    imageDataForReview = executionResult.content;
                    console.log('[TaskExecution] Extracted base64 image for vision review');
                }

                // Execute review with the AI
                const reviewResult = await executor.executeReview(
                    task as Task,
                    reviewPrompt,
                    executionResult.content,
                    {
                        streaming: options?.streaming ?? true,
                        onToken: onReviewToken,
                        aiProvider: effectiveConfig.provider,
                        aiModel: effectiveConfig.model,
                        imageData: imageDataForReview, // Pass image for vision models
                    }
                );

                const currentState = activeReviews.get(taskId);
                if (!currentState) {
                    // Review was cancelled
                    return { success: false, cancelled: true };
                }

                if (reviewResult.success) {
                    // Review completed successfully
                    currentState.status = 'completed';
                    currentState.progress = 100;

                    // Parse review score from content
                    const reviewScore = parseReviewScore(reviewResult.content || '');
                    console.log(
                        `[TaskExecution] Review completed for task ${taskId}. Score: ${reviewScore} (Passed: ${reviewScore >= 8})`
                    );
                    const reviewPassed = reviewScore >= 8;

                    // Save review result
                    const reviewData = {
                        reviewContent: reviewResult.content,
                        reviewedAt: new Date().toISOString(),
                        reviewCost: reviewResult.cost,
                        reviewTokens: reviewResult.tokens,
                        reviewProvider: reviewResult.provider,
                        reviewModel: reviewResult.model,
                        reviewScore,
                        reviewPassed,
                    };

                    // Update task based on review result
                    if (reviewPassed) {
                        // Score 8+ : Move to DONE
                        await taskRepository.update(taskId, {
                            status: 'done',
                            aiReviewResult: JSON.stringify(reviewData),
                            reviewFailed: false,
                            completedAt: new Date(),
                        });
                        win?.webContents.send('task:status-changed', {
                            id: taskId,
                            status: 'done',
                        });

                        // Check and execute dependent tasks when review passed
                        await checkAndExecuteDependentTasks(taskId, { ...task, status: 'done' });
                    } else {
                        // Score 7- : Stay in IN_REVIEW with failed flag
                        await taskRepository.update(taskId, {
                            aiReviewResult: JSON.stringify(reviewData),
                            reviewFailed: true,
                        });
                        // No status change, stays in in_review
                    }

                    // Log AI review completed to history
                    await taskHistoryRepository.logAIReviewCompleted(
                        taskId,
                        reviewResult.content || '',
                        reviewPassed ? '리뷰 통과' : '리뷰 실패 - 재작업 필요',
                        reviewPassed,
                        {
                            provider: reviewResult.provider,
                            model: reviewResult.model,
                            cost: reviewResult.cost,
                            tokens: reviewResult.tokens,
                            score: reviewScore,
                        }
                    );

                    // Notify frontend
                    win?.webContents.send('taskReview:completed', {
                        taskId,
                        result: reviewData,
                        passed: reviewPassed,
                        score: reviewScore,
                    });

                    activeReviews.delete(taskId);
                    return {
                        success: true,
                        result: reviewData,
                        passed: reviewPassed,
                        score: reviewScore,
                    };
                } else {
                    // Review failed
                    currentState.status = 'failed';
                    currentState.error = reviewResult.error || 'Unknown error';

                    win?.webContents.send('taskReview:failed', {
                        taskId,
                        error: currentState.error,
                    });

                    activeReviews.delete(taskId);
                    return { success: false, error: currentState.error };
                }
            } catch (error) {
                console.error('Error starting AI review:', error);
                activeReviews.delete(taskId);
                getMainWindow()?.webContents.send('taskReview:failed', {
                    taskId,
                    error: error instanceof Error ? error.message : String(error),
                });
                throw error;
            }
        }
    );

    /**
     * Get review status for a task
     */
    ipcMain.handle('taskExecution:getReviewStatus', async (_event, taskId: number) => {
        const state = activeReviews.get(taskId);
        if (!state) {
            return null;
        }

        return {
            taskId: state.taskId,
            status: state.status,
            startedAt: state.startedAt,
            progress: state.progress,
            streamContent: state.streamContent,
            error: state.error,
        };
    });

    /**
     * Cancel ongoing AI review
     */
    ipcMain.handle('taskExecution:cancelReview', async (_event, taskId: number) => {
        try {
            const hadReview = activeReviews.has(taskId);
            activeReviews.delete(taskId);

            getMainWindow()?.webContents.send('taskReview:cancelled', { taskId });

            console.log(
                `[TaskExecution] Cancelled review for task ${taskId} (had review: ${hadReview})`
            );
            return { success: true, hadReview };
        } catch (error) {
            console.error('Error cancelling review:', error);
            throw error;
        }
    });

    /**
     * Submit input for an Input Task
     */
    ipcMain.handle('task:submitInput', async (_event, taskId: number, payload: any) => {
        try {
            const task = await taskRepository.findById(taskId);
            if (!task) {
                throw new Error(`Task not found: ${taskId}`);
            }

            if (task.taskType !== 'input') {
                throw new Error(`Task ${taskId} is not an input task`);
            }

            const { InputProviderManager } =
                await import('../../../src/services/workflow/input/InputProviderManager');
            const providerManager = InputProviderManager.getInstance();
            const inputProvider = providerManager.getProviderForTask(task as Task);

            if (!inputProvider) {
                throw new Error('No input provider available for this task');
            }

            // Validate input
            const validation = await inputProvider.validate(task as Task, payload);
            if (!validation.valid) {
                throw new Error(validation.error || 'Invalid input');
            }

            // Process submission
            const output = await inputProvider.submit(task as Task, payload);

            // Input tasks always go directly to 'done' - they don't need review since they're user-provided data
            const finalStatus = 'done';

            const updateData: any = {
                status: finalStatus,
                executionResult: JSON.stringify(output), // Store as executionResult for consistency
                completedAt: new Date(),
                inputSubStatus: null, // Clear input waiting status
            };

            await taskRepository.update(taskId, updateData);

            // Log completion to history
            await taskHistoryRepository.logExecutionCompleted(
                taskId,
                output.text || JSON.stringify(output.json) || 'Input submitted',
                {
                    provider: 'input',
                    model: 'user',
                    cost: 0,
                    tokens: 0,
                    duration: 0,
                },
                undefined,
                output
            );

            // Log completion
            console.log(`[Input] ✅ Task ${taskId} input submitted - status: ${finalStatus}`);

            getMainWindow()?.webContents.send('task:status-changed', {
                id: taskId,
                status: finalStatus,
            });

            // We can also send a completed event if needed for UI to refresh
            getMainWindow()?.webContents.send('taskExecution:completed', {
                taskId,
                result: {
                    content: output.text || JSON.stringify(output.json) || 'Input submitted',
                    provider: 'input',
                    model: 'user',
                },
            });

            // Check dependents
            if (finalStatus === 'done') {
                await checkAndExecuteDependentTasks(taskId, task as Task);
            }

            return { success: true, output };
        } catch (error) {
            console.error(`Error submitting input for task ${taskId}:`, error);
            // Don't mark task as failed, just return error to UI so user can retry
            throw error;
        }
    });

    console.log('Task execution IPC handlers registered');

    // ========================================
    // Event Forwarding
    // ========================================

    // Forward Curator events to renderer
    eventBus.on<CuratorStartedEvent>('ai.curator_started', (event) => {
        getMainWindow()?.webContents.send('curator:started', event.payload);
    });

    eventBus.on<CuratorStepEvent>('ai.curator_step', (event) => {
        getMainWindow()?.webContents.send('curator:step', event.payload);
    });

    eventBus.on<CuratorCompletedEvent>('ai.curator_completed', (event) => {
        getMainWindow()?.webContents.send('curator:completed', event.payload);
    });
}

/**
 * Check if a string is a base64-encoded image
 */
function isBase64Image(str: string): boolean {
    // Data URL 형식
    if (str.startsWith('data:image/')) {
        return true;
    }

    // 순수 base64: 길이가 충분히 길고 (50KB 이상), base64 문자만 포함
    if (str.length > 50000 && /^[A-Za-z0-9+/=\s]+$/.test(str)) {
        return true;
    }

    return false;
}

/**
 * Save base64 image to temp file and return file path
 */
function saveBase64ImageToTempFile(base64Data: string, taskId?: number): string {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    try {
        // Base64 데이터 형식 감지
        let imageData = base64Data;
        let extension = 'png';

        const dataUrlMatch = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
        if (dataUrlMatch) {
            extension = dataUrlMatch[1] ?? 'png';
            imageData = dataUrlMatch[2] ?? base64Data;
        }

        // 임시 디렉토리 생성
        const tempDir = path.join(os.tmpdir(), 'workflow-manager-images');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // 파일명 생성
        const timestamp = Date.now();
        const filename = taskId
            ? `task-${taskId}-review-${timestamp}.${extension}`
            : `review-${timestamp}.${extension}`;
        const filePath = path.join(tempDir, filename);

        // Base64 디코딩 후 파일로 저장
        const buffer = Buffer.from(imageData, 'base64');
        fs.writeFileSync(filePath, buffer);

        console.log(`✨ Saved review image to temp file: ${filePath}`);
        return filePath;
    } catch (error) {
        console.error('Failed to save base64 image for review:', error);
        return '[Image save failed]';
    }
}

/**
 * Build a review prompt for AI review
 * Focuses on whether the USER'S ORIGINAL INTENT was fulfilled, not just whether AI responded appropriately
 */
function buildReviewPrompt(
    task: Task,
    executionContent: string,
    executedPromptOverride?: string
): string {
    // 사용자의 원래 입력 프롬프트 (템플릿 치환 전)
    const userOriginalPrompt = task.description || '';
    // 실제 실행된 프롬프트 (템플릿 치환 후)
    const executedPrompt = executedPromptOverride ?? (task.generatedPrompt || userOriginalPrompt);

    // 이미지 결과일 경우 base64를 파일로 저장하고 경로로 대체
    let processedContent = executionContent;
    if (isBase64Image(executionContent)) {
        const imagePath = saveBase64ImageToTempFile(executionContent, task.id);
        // 프롬프트에는 로컬 경로 대신 이미지가 첨부되었다는 사실만 명시 (AI가 로컬 경로를 읽으려 시도하는 것 방지)
        processedContent = `[이미지가 결과물로 생성되었습니다. 첨부된 이미지를 확인하세요.]\n(참고: 내부 저장 경로 ${imagePath})`;
        console.log(`[buildReviewPrompt] Converted base64 image to file: ${imagePath}`);
    }

    return `작업 결과를 검토하세요. **간결하게** 답변하세요.

## 원래 요청
${userOriginalPrompt}

## 실행된 프롬프트
${executedPrompt}

## 실행 결과
${processedContent}

**중요: 만약 실행 결과가 이미지라면, 이 메시지에 첨부된 이미지를 직접 확인하여 평가하세요.**

---

## 판정 기준

**실패 (5점 이하):**
- 프롬프트에 "이전 결과없음", "{{", "}}", "undefined", "null" 포함
- "계산/처리할 수 없다", "정보 부족" 등의 답변
- 구체적 결과물 없음

**통과 (8점 이상):**
- 사용자 의도대로 작업 완료
- 구체적 결과물 존재

---

## 답변 형식 (이 형식만 따르세요)

**의도:** [한 줄 요약]
**결과:** [통과/실패 + 이유 한 줄]
**점수: X/10**`;
}

function buildPermissionDeniedContent(error: MCPPermissionError): string {
    const serverName = error.details?.serverName || error.details?.serverId || 'MCP 서버';
    const missingScopes = error.details?.missingScopes || [];
    const scopeLine =
        missingScopes.length > 0
            ? `\n\n필요 Scope: ${missingScopes.map((scope) => `\`${scope}\``).join(', ')}`
            : '';
    const toolLine = error.details?.toolName ? `\n요청 도구: ${error.details.toolName}` : '';
    return `⚠️ ${serverName} 권한 부족으로 작업을 완료하지 못했습니다.${toolLine}${scopeLine}\n\n설정 > MCP Servers에서 필요한 기능을 활성화한 뒤 다시 실행해 주세요.`;
}

/**
 * Parse review score from AI review content
 * Looks for patterns like "점수: 8/10", "평가 점수: 8점", "8/10점" etc.
 * Returns 5 as default if no score found
 */
function parseReviewScore(content: string): number {
    if (!content) return 5;

    console.log(
        `[ReviewScore] Parsing content (len: ${content.length}): ${content.slice(0, 100).replace(/\n/g, ' ')}...`
    );

    // Various patterns to match score
    const patterns = [
        /평가\s*점수[:\s]*(\d+)\s*[\/점]/i,
        /점수[:\s]*(\d+)\s*[\/점]/i,
        /(\d+)\s*[\/]\s*10\s*점?/i,
        /(\d+)\s*점\s*[\/]\s*10/i,
        /score[:\s]*(\d+)/i,
        /(\d+)\s*out\s*of\s*10/i,
        /총점[:\s]*(\d+)/i,
        /최종\s*점수[:\s]*(\d+)/i,
        /종합\s*점수[:\s]*(\d+)/i,
        /\*\*(\d+)[/점]/i,
        /:\s*(\d+)\s*점/i,
        // Enhanced patterns
        /\[(\d+)\/10\]/i, // [10/10]
        /(\d+)\s*\/\s*10/i, // 10/10 (simple)
        /점수\s*:\s*(\d+)/i, // 점수 : 10
        /Rating\s*:\s*(\d+)/i, // Rating: 10
    ];

    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
            const score = parseInt(match[1], 10);
            if (!isNaN(score) && score >= 0 && score <= 10) {
                console.log(`[ReviewScore] Parsed score: ${score} from pattern: ${pattern}`);
                return score;
            }
        }
    }

    // If no explicit score found, try to infer from keywords
    const lowerContent = content.toLowerCase();
    if (
        lowerContent.includes('훌륭') ||
        lowerContent.includes('완벽') ||
        lowerContent.includes('excellent') ||
        lowerContent.includes('perfect')
    ) {
        console.log('[ReviewScore] Inferred score 9 from keywords');
        return 9;
    }
    if (
        lowerContent.includes('좋음') ||
        lowerContent.includes('good') ||
        lowerContent.includes('잘 수행') ||
        lowerContent.includes('passed')
    ) {
        console.log('[ReviewScore] Inferred score 8 from keywords');
        return 8;
    }
    if (
        lowerContent.includes('개선 필요') ||
        lowerContent.includes('부족') ||
        lowerContent.includes('미흡') ||
        lowerContent.includes('failed')
    ) {
        console.log('[ReviewScore] Inferred score 6 from keywords');
        return 6;
    }
    if (
        lowerContent.includes('실패') ||
        lowerContent.includes('잘못') ||
        lowerContent.includes('오류') ||
        lowerContent.includes('error')
    ) {
        console.log('[ReviewScore] Inferred score 4 from keywords');
        return 4;
    }

    console.log('[ReviewScore] No score pattern found, using default: 5');
    return 5; // Default score if not found
}
