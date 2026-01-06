/**
 * Task Execution IPC Handlers
 *
 * Handles IPC communication for AI task execution with streaming support
 */

import { ipcMain, BrowserWindow } from 'electron';
import { getMainWindow } from '../index';
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
import { buildDependencyContext } from '../services/dependency-context-builder';
// import { MCPPermissionError } from '../../../src/services/mcp/errors';
// import { InputProviderManager } from '../../../src/services/workflow/input/InputProviderManager';
import { GlobalExecutionService } from '../services/GlobalExecutionService';
import { taskNotificationService } from '../services/task-notification-service';

/**
 * Get the main window for sending IPC messages
 * Uses BrowserWindow.getAllWindows() to ensure we always have the current window
 */

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
    projectId: number;
    projectSequence: number;
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
    projectId: number;
    projectSequence: number;
    status: 'reviewing' | 'completed' | 'failed';
    startedAt: Date;
    progress: number;
    streamContent: string;
    error?: string;
}

// Store active execution states (Key: `${projectId}-${projectSequence}`)
const activeExecutions = new Map<string, ExecutionState>();
// Store active review states (Key: `${projectId}-${projectSequence}`)
const activeReviews = new Map<string, ReviewState>();
// Store pending execution requests for busy tasks (TargetKey -> SourceKey)
// This implements a "Latest Request Only" (Debounce) queue for Repeat/Always tasks.
const executionQueue = new Map<string, string>();
const executor = new AdvancedTaskExecutor();

/**
 * Helper to generate task key
 */
function getTaskKey(projectId: number, projectSequence: number): string {
    return `${projectId}-${projectSequence}`;
}

/**
 * Extract dependency task IDs and their execution results for macro substitution/context passing
 * recursively (up to depth 5) to support deep history macros like {{prev-1}}
 */

/**
 * Helper: Check if task dependencies are met (Robust Logic with Novelty Check)
 * @param ignoreNovelty If true, bypasses the "New Event" check (used for manual execution)
 */
/**
 * Helper: Resolve expression containing Project Sequences or Task IDs to strictly Task IDs
 * Returns the resolved expression and the set of Task IDs found.
 */
/**
 * Helper: Resolve expression containing Project Sequences
 * Returns the resolved expression and the set of Sequences found.
 */
function resolveExpressionToSequences(
    expression: string,
    allTasks: any[]
): { resolvedExpression: string; referencedSequences: Set<number> } {
    if (!expression || !expression.trim()) {
        return { resolvedExpression: '', referencedSequences: new Set() };
    }

    const referencedSequences = new Set<number>();

    // Replace all numbers in the expression
    // We assume numbers are Project Sequences
    const resolvedExpression = expression.replace(/\b\d+\b/g, (match) => {
        const val = parseInt(match, 10);

        // 1. Try to find by Project Sequence
        const taskBySeq = allTasks.find((t) => t.projectSequence === val);
        if (taskBySeq) {
            referencedSequences.add(taskBySeq.projectSequence);
            return taskBySeq.projectSequence.toString();
        }

        // 2. No match found - keep original
        return match;
    });

    return { resolvedExpression, referencedSequences };
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
    if (!triggerConfig?.dependsOn?.taskIds && !triggerConfig?.dependsOn?.expression) {
        // No dependencies defined
        if (
            triggerConfig?.dependsOn &&
            !triggerConfig.dependsOn.taskIds &&
            !triggerConfig.dependsOn.expression
        ) {
            return { met: true };
        }
        // If dependsOn object is missing entirely, usually implies no deps
        return { met: true };
    }

    const dependsOn = triggerConfig.dependsOn;
    const originalExpression = dependsOn.expression;
    const operator = dependsOn.operator || 'all';
    let dependencySequences = (dependsOn.taskIds as number[]) || [];

    // Resolve Expression if present
    let resolvedExpression = '';
    if (originalExpression && originalExpression.trim().length > 0) {
        const resolution = resolveExpressionToSequences(originalExpression, allTasks);
        resolvedExpression = resolution.resolvedExpression;
        // Merge referenced Sequences from expression into dependencySequences for info gathering
        resolution.referencedSequences.forEach((seq) => {
            if (!dependencySequences.includes(seq)) {
                dependencySequences.push(seq);
            }
        });
    }

    // 1. Prepare Dependency Data for Evaluator
    const dependencyInfo = allTasks
        .filter((t) => dependencySequences.includes(t.projectSequence))
        .map((t) => ({
            id: t.projectSequence, // Use sequence as "ID" for evaluator
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
    if (resolvedExpression && resolvedExpression.trim().length > 0) {
        // Advanced Mode: Use DependencyEvaluator with RESOLVED expression (IDs)
        const evaluator = new DependencyEvaluator(dependencyInfo, lastRunAt);
        const result = evaluator.evaluate(resolvedExpression);

        return {
            met: result.met,
            reason: result.met ? undefined : result.reason,
            details: `Expression "${originalExpression}" (Resolved: "${resolvedExpression}") -> ${result.met}. Reason: ${result.reason || 'Met'}`,
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
            if (!allDone)
                details = `Waiting for: ${incomplete.map((t: any) => t.projectSequence).join(', ')}`;
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
// Check and execute dependent tasks
export async function checkAndExecuteDependentTasks(
    projectId: number,
    sequence: number,
    completedTask: Task,
    options?: { triggerChain?: string[]; control?: { next: number[]; reason?: string } }
): Promise<void> {
    try {
        console.log(
            `[TaskExecution] Checking dependent tasks for completed task ${projectId}-${sequence}}`
        );

        // Project Pause Check
        if (GlobalExecutionService.getInstance().isProjectPaused(completedTask.projectId)) {
            console.log(
                `[TaskExecution] Project ${completedTask.projectId} execution is PAUSED. Skipping auto-execution for task ${projectId}-${sequence}'s dependents.`
            );
            return;
        }

        // ===== PRIORITY 1: Check for explicit control flow =====
        const executionResult = completedTask.executionResult as any;
        if (executionResult?.control) {
            const control = executionResult.control;
            console.log(
                `[ControlFlow] Task ${projectId}-${sequence} has control flow: next=${JSON.stringify(control.next)}, reason="${control.reason || ''}"`
            );

            // Terminal node: empty or null next means STOP
            if (
                control.next === null ||
                (Array.isArray(control.next) && control.next.length === 0)
            ) {
                console.log(
                    `[ControlFlow] Terminal node detected. Workflow stopped. Reason: "${control.reason || 'none'}"`
                );
                return; // Explicit STOP - no further execution
            }

            // Explicit next tasks defined
            if (Array.isArray(control.next) && control.next.length > 0) {
                console.log(
                    `[ControlFlow] Explicit branching to tasks: [${control.next.join(', ')}]`
                );

                // Get all tasks in project
                const allTasks = await taskRepository.findByProject(completedTask.projectId);

                // Execute only the tasks specified in control.next
                for (const nextSequence of control.next) {
                    const nextTask = allTasks.find((t) => t.projectSequence === nextSequence);

                    if (!nextTask) {
                        console.warn(
                            `[ControlFlow] Task ${nextSequence} not found in control.next, skipping`
                        );
                        continue;
                    }

                    console.log(
                        `[ControlFlow] Triggering task ${nextTask.projectId}-${nextTask.projectSequence} (reason: "${control.reason || ''}")`
                    );

                    // Notify frontend about auto-execution
                    const win = getMainWindow();
                    win?.webContents.send('task:autoExecutionStarting', {
                        projectId: nextTask.projectId,
                        projectSequence: nextTask.projectSequence,
                        triggeredBy: { projectId, sequence },
                    });

                    // Execute via frontend event
                    win?.webContents.send('task:triggerAutoExecution', {
                        projectId: nextTask.projectId,
                        projectSequence: nextTask.projectSequence,
                        triggeredBy: { projectId, sequence },
                        triggerChain: options?.triggerChain || [],
                        controlFlowReason: control.reason,
                    });
                }

                return; // Control flow handled, skip static dependencies
            }
        }

        // ===== PRIORITY 2: Fall back to static dependencies =====
        console.log(
            `[TaskExecution] No control flow defined, checking static dependencies for ${projectId}-${sequence}`
        );

        // Get all tasks in the same project
        const allTasks = await taskRepository.findByProject(completedTask.projectId);

        // Find tasks that depend on the completed task
        const dependentTasks = allTasks.filter((task) => {
            const triggerConfig = task.triggerConfig as TaskTriggerConfig | null;

            if (!triggerConfig?.dependsOn) return false;

            // Check if this task depends on the completed task
            const taskSequences = triggerConfig.dependsOn.taskIds || [];
            const hasSeqInTaskIds = taskSequences.includes(sequence);

            // Check expression for BOTH Task ID and Project Sequence
            // We use word boundaries ensuring we match "6" but not "16"
            let hasMatchInExpr = false;
            if (triggerConfig.dependsOn.expression) {
                const expr = triggerConfig.dependsOn.expression;
                // Check if expression references this sequence
                const matchesSeq = new RegExp(`\\b${sequence}\\b`).test(expr);
                hasMatchInExpr = matchesSeq;
            }

            // If the completed task is not a dependency, skip
            if (!hasSeqInTaskIds && !hasMatchInExpr) return false;

            // Prevent self-dependency (task triggering itself)
            if (task.projectSequence === sequence) {
                console.warn(
                    `[TaskExecution] Task ${task.projectSequence} depends on itself (via Sequence). Ignoring self-trigger to prevent infinite loop.`
                );
                return false;
            }

            // Get execution policy (default: 'repeat' for backwards compatibility and user preference)
            const policy = triggerConfig.dependsOn.executionPolicy || 'repeat';

            // If policy is 'once', only execute if task is in 'todo' status
            if (policy === 'once') {
                const isInTodoStatus = task.status === 'todo';
                if (!isInTodoStatus) {
                    console.log(
                        `[TaskExecution] Task ${task.projectId}-${task.projectSequence} has executionPolicy='once' and is not in TODO status (current: ${task.status}). Skipping auto-execution.`
                    );
                    return false;
                }
            }

            // 1. REPEAT/ALWAYS Policy Handling
            if (policy === 'repeat' || (policy as string) === 'always') {
                if (task.status === 'in_progress' || task.status === 'getting_input') {
                    // Task is busy. Queue this request (Debounce: overwrite with latest trigger)
                    console.log(
                        `[TaskExecution] Task ${task.projectId}-${task.projectSequence} is busy. Queueing re-execution request from ${projectId}-${sequence}`
                    );
                    executionQueue.set(
                        getTaskKey(task.projectId, task.projectSequence),
                        getTaskKey(projectId, sequence)
                    );
                    return false; // Do not execute immediately
                }

                // SAFETY: Prevent Infinite Loops using triggerChain
                // We allow cyclic workflows (e.g. Turn-Based Games: A -> B -> A -> B...)
                // But we must prevent infinite INSTANT recursion stack overflows.
                // We allow a specific task to appear in the chain up to 10 times.
                const depKey = `${task.projectId}-${task.projectSequence}`;
                if (options?.triggerChain) {
                    const loopCount = options.triggerChain.filter((id) => id === depKey).length;
                    if (loopCount >= 10) {
                        console.warn(
                            `[TaskExecution] Cycle detected for task ${depKey} in chain: ${options.triggerChain.join(' -> ')} -> ${depKey}. Loop count ${loopCount} exceeds limit (10). Stopping loop.`
                        );
                        return false;
                    }
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
            console.log(
                `[TaskExecution] No dependent tasks found for task ${projectId}-${sequence}`
            );
            return;
        }

        console.log(
            `[TaskExecution] Found ${dependentTasks.length} dependent tasks: ${dependentTasks.map((t) => t.projectSequence).join(', ')}`
        );

        // Check each dependent task
        for (const dependentTask of dependentTasks) {
            // 0. Control Flow Check
            // Logic Update:
            // - If control.next is UNDEFINED or NULL -> Execute all (Default)
            // - If control.next is EMPTY ARRAY [] -> Execute none (Stop)
            // - If control.next is populated -> Execute specific tasks in list

            const controlNext = options?.control?.next;

            // Only apply filtering if 'next' is explicitly an array
            if (Array.isArray(controlNext)) {
                // Case A: Empty array means "Stop execution / No next steps"
                if (controlNext.length === 0) {
                    console.log(
                        `[TaskExecution] Skipping task ${dependentTask.projectId}-${dependentTask.projectSequence} (control.next is empty - explicit stop)`
                    );
                    continue;
                }

                // Case B: Array has values, check if current task is in it
                if (!controlNext.includes(dependentTask.projectSequence)) {
                    console.log(
                        `[TaskExecution] Skipping task ${dependentTask.projectId}-${dependentTask.projectSequence} (not in control.next list: [${controlNext.join(', ')}])`
                    );
                    continue;
                }
            }
            // Case C: control.next is undefined/null -> Execute normally (Fall through)

            // Use revised helper that handles sequence-to-ID resolution
            const checkResult = areTaskDependenciesMet(dependentTask, allTasks);
            const shouldExecute = checkResult.met;

            if (shouldExecute) {
                // Auto-executing dependent task

                // Build new chain
                const currentChain = options?.triggerChain || [];
                // Add current Triggerer (Execution that just finished)
                const nextChain = [...currentChain, `${projectId}-${sequence}`];

                console.log(
                    `[TaskExecution] Auto-executing dependent task ${dependentTask.projectId}-${dependentTask.projectSequence} (dependencies satisfied). Chain: ${nextChain.join(' -> ')}`
                );

                // Notify frontend about auto-execution
                const win = getMainWindow();
                win?.webContents.send('task:autoExecutionStarting', {
                    projectId: dependentTask.projectId,
                    projectSequence: dependentTask.projectSequence,
                    triggeredBy: { projectId, sequence },
                });

                // Execute the task (this will be handled by the frontend's execution flow)
                // We send an event so the frontend can trigger the execution with proper API keys
                win?.webContents.send('task:triggerAutoExecution', {
                    projectId: dependentTask.projectId,
                    projectSequence: dependentTask.projectSequence,
                    triggeredBy: { projectId, sequence },
                    triggerChain: nextChain,
                });
            } else {
                console.log(
                    `[TaskExecution] Task ${dependentTask.projectId}-${dependentTask.projectSequence} dependencies not yet satisfied. Reason: ${checkResult.details}`
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
            if (!activeExecutions.has(getTaskKey(task.projectId, task.projectSequence))) {
                console.log(
                    `[TaskExecution] Resetting stuck task ${task.projectId}-${task.projectSequence} from in_progress to todo`
                );
                await taskRepository.updateByKey(task.projectId, task.projectSequence, {
                    status: 'todo',
                });
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
 * Trigger Curator for a completed task
 */
const triggerCurator = async (
    projectId: number,
    sequence: number,
    task: any,
    output: string,
    project: any,
    apiKeysOverrides?: Record<string, string>,
    preComputedContext?: any
) => {
    // Only trigger if task is marked as done (fully completed)
    // If it goes to in_review, we wait until review is approved
    if (task.status === 'done' || task.autoApprove) {
        try {
            const { CuratorService } = await import('../../../src/services/ai/CuratorService');

            // Fetch API keys from renderer localStorage to inject into Curator
            const win = getMainWindow();
            let apiKeys: any = {};

            if (win) {
                try {
                    // Read settings from localStorage in renderer context
                    const storedProviders = await win.webContents.executeJavaScript(
                        'localStorage.getItem("workflow_settings_aiProviders")'
                    );

                    if (storedProviders) {
                        const providers = JSON.parse(storedProviders);
                        const fetchedKeys = {
                            anthropic: providers.find((p: any) => p.id === 'anthropic' && p.apiKey)
                                ?.apiKey,
                            openai: providers.find((p: any) => p.id === 'openai' && p.apiKey)
                                ?.apiKey,
                            google: providers.find((p: any) => p.id === 'google' && p.apiKey)
                                ?.apiKey,
                            groq: providers.find((p: any) => p.id === 'groq' && p.apiKey)?.apiKey,
                            lmstudio: providers.find((p: any) => p.id === 'lmstudio' && p.apiKey)
                                ?.apiKey,
                        };
                        // Merge keys: Overrides take precedence
                        apiKeys = { ...fetchedKeys, ...(apiKeysOverrides || {}) };

                        console.log(
                            '[CuratorTrigger] Injected API keys (merged):',
                            Object.keys(apiKeys).filter((k) => !!apiKeys[k])
                        );
                    }
                } catch (e) {
                    console.warn('[CuratorTrigger] Failed to fetch API keys from renderer:', e);
                }
            }

            const curator = CuratorService.getInstance();
            curator.setApiKeys(apiKeys);

            curator.setApiKeys(apiKeys);

            await curator.runCurator(
                projectId,
                sequence,
                task.title,
                output,
                project,
                null,
                projectRepository,
                preComputedContext
            );
        } catch (err: any) {
            console.error('[CuratorTrigger] Failed:', err);
        }
    }
};

/**
 * Process input task submission (shared logic for IPC and auto-execution)
 */
async function processInputSubmission(
    projectId: number,
    sequence: number,
    payload: any,
    options?: { triggerChain?: string[]; apiKeys?: Record<string, string> }
): Promise<any> {
    const task = await taskRepository.findByKey(projectId, sequence);
    if (!task) {
        throw new Error(`Task ${projectId}-${sequence} not found`);
    }

    if (task.taskType !== 'input') {
        throw new Error(`Task ${projectId}-${sequence} is not an input task`);
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

    // Input tasks always go directly to 'done'
    const finalStatus = 'done';

    const updateData: any = {
        status: finalStatus,
        executionResult: output, // Drizzle handles JSON stringification
        completedAt: new Date(),
        inputSubStatus: null, // Clear input waiting status
    };

    await taskRepository.updateByKey(projectId, sequence, updateData);

    // Log completion to history
    const historyEntry = await taskHistoryRepository.logExecutionCompleted(
        projectId,
        sequence,
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

    getMainWindow()?.webContents.send('task-history:created', historyEntry);

    // Log completion
    console.log(
        `[Input] ✅ Task ${projectId}-${sequence} input submitted - status: ${finalStatus}`
    );

    getMainWindow()?.webContents.send('task:status-changed', {
        projectId,
        projectSequence: sequence,
        status: finalStatus,
    });

    // We can also send a completed event if needed for UI to refresh
    getMainWindow()?.webContents.send('taskExecution:completed', {
        projectId,
        projectSequence: sequence,
        result: {
            content: output.text || JSON.stringify(output.json) || 'Input submitted',
            provider: 'input',
            model: 'user',
            // Input metadata
        },
    });

    // Explicitly notify Curator for Input Tasks (similar to standard tasks) if needed
    // MUST be done BEFORE checking dependents so they have fresh context
    const project = await projectRepository.findById(task.projectId);
    if (project) {
        await triggerCurator(
            projectId,
            sequence,
            task,
            output.text || 'Input submitted',
            project,
            options?.apiKeys
        );
    }

    // Trigger dependents
    await checkAndExecuteDependentTasks(projectId, sequence, task as Task, options);

    return output;
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
            projectId: number,
            projectSequence: number,
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
                triggerChain?: string[];
                force?: boolean;
                source?: string;
                recursive?: boolean;
                control?: { next: number[]; reason?: string };
                language?: string;
            }
        ) => {
            // Get task from database using composite key
            const task = await taskRepository.findByKey(projectId, projectSequence);
            if (!task) {
                throw new Error(`Task ${projectId}-${projectSequence} not found`);
            }
            // For internal usage in this function scope only - will be removed
            // const taskKey = getTaskKey(projectId, projectSequence);

            // Project Pause Check for manual execution
            if (GlobalExecutionService.getInstance().isProjectPaused(task.projectId)) {
                const errorMsg = 'Project execution is currently PAUSED. Resume to execute tasks.';
                console.warn(
                    `[TaskExecution] Blocked execution of task ${projectId}-${projectSequence}: ${errorMsg}`
                );

                // Notify frontend
                getMainWindow()?.webContents.send('taskExecution:failed', {
                    projectId: task.projectId,
                    projectSequence: task.projectSequence,
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

                // Task is already fetched above

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
                        await taskHistoryRepository.logExecutionFailed(
                            task.projectId,
                            task.projectSequence,
                            errorMsg,
                            {
                                reason: 'dependency_validation_failed',
                                details: dependencyCheck.details,
                            }
                        );

                        throw new Error(`${errorMsg}\n${details}`);
                    }
                }

                // Check if this is a script or input task - execute locally/handle input
                if (task.taskType === 'script' || task.taskType === 'input') {
                    console.log(
                        `[TaskExecution] Executing script task ${projectId}-${projectSequence}`
                    );

                    // Initialize execution state
                    const executionState: ExecutionState = {
                        projectId,
                        projectSequence,
                        status: 'running',
                        startedAt: new Date(),
                        progress: 0,
                        currentPhase: 'initializing',
                        streamContent: '',
                    };
                    activeExecutions.set(getTaskKey(projectId, projectSequence), executionState);

                    const initialStatus = 'in_progress';

                    // Check if this is an auto-submit input task (e.g. Local File) BEFORE updating status
                    // to avoid flickering "Waiting for User" state in UI
                    let isAutoSubmitInput = false;
                    if (task.taskType === 'input') {
                        let cfg = task.inputConfig;
                        if (typeof cfg === 'string') {
                            try {
                                cfg = JSON.parse(cfg);
                            } catch {}
                        }
                        const sType = (cfg as any)?.sourceType;
                        if (
                            sType &&
                            (sType === 'localFile' || sType === 'LOCAL_FILE') &&
                            (cfg as any)?.localFile?.filePath
                        ) {
                            isAutoSubmitInput = true;
                        }
                    }

                    // Update task status
                    // For Input Task, we set sub-status to WAITING_USER only if NOT auto-submit
                    const updateData: Partial<Task> = {
                        status: initialStatus,
                        startedAt: new Date(),
                    };

                    if (task.taskType === 'input' && !isAutoSubmitInput) {
                        updateData.inputSubStatus = 'WAITING_USER';
                    }

                    await taskRepository.updateByKey(projectId, projectSequence, updateData);
                    getMainWindow()?.webContents.send('task:status-changed', {
                        projectId,
                        projectSequence,
                        status: initialStatus,
                    });
                    getMainWindow()?.webContents.send('taskExecution:started', {
                        projectId: task.projectId,
                        projectSequence: task.projectSequence,
                        startedAt: executionState.startedAt,
                    });

                    // 1. Handle Input Tasks
                    if (task.taskType === 'input') {
                        try {
                            const { InputProviderManager } =
                                await import('../../../src/services/workflow/input/InputProviderManager');
                            const providerManager = InputProviderManager.getInstance();

                            console.log('[TaskExecution] Handling Input Task:', task.id);
                            // console.log('[TaskExecution] Raw inputConfig:', task.inputConfig);

                            const inputProvider = providerManager.getProviderForTask(task as Task);

                            if (!inputProvider) {
                                throw new Error('No input provider available for this task config');
                            }

                            await inputProvider.start(task as Task, {
                                taskId: task.id,
                                projectId: task.projectId,
                                userId: (task as any).userId || 0,
                            });

                            // AUTO-SUBMISSION LOGIC
                            // Parse inputConfig if string
                            let inputConfig = task.inputConfig;
                            if (typeof inputConfig === 'string') {
                                try {
                                    inputConfig = JSON.parse(inputConfig);
                                } catch (e) {
                                    console.error(
                                        '[TaskExecution] Failed to parse inputConfig:',
                                        e
                                    );
                                }
                            }

                            console.log(
                                '[TaskExecution] Checked inputConfig for auto-submit:',
                                inputConfig
                            );
                            const sourceType = (inputConfig as any)?.sourceType;

                            // Check if this is a non-interactive input task (e.g. Local File with path)
                            // Handle both 'localFile' and 'LOCAL_FILE' cases
                            if (
                                sourceType &&
                                (sourceType === 'localFile' || sourceType === 'LOCAL_FILE') &&
                                (inputConfig as any)?.localFile?.filePath
                            ) {
                                const filePath = (inputConfig as any).localFile.filePath;
                                console.log(
                                    `[TaskExecution] Auto-submitting Local File Input Task ${projectId}-${projectSequence} with path: ${filePath}`
                                );
                                try {
                                    // Verify file exists
                                    const fs = await import('fs/promises');
                                    await fs.access(filePath);

                                    // Submit automatically
                                    await processInputSubmission(
                                        projectId,
                                        projectSequence,
                                        {
                                            filePath: filePath,
                                        },
                                        options
                                    );

                                    // Remove execution state and return success (already marked done by processInputSubmission)
                                    activeExecutions.delete(getTaskKey(projectId, projectSequence));
                                    return { success: true, autoSubmitted: true };
                                } catch (fileErr) {
                                    console.error(
                                        '[TaskExecution] Failed to auto-submit local file:',
                                        fileErr
                                    );
                                    // Continue to wait for user input if auto-submit fails?
                                    // Or fail? Probably better to fail if explicitly configured but invalid.
                                    throw new Error(
                                        `Failed to read configured local file: ${fileErr}`
                                    );
                                }
                            }

                            // Input task stays in 'in_progress' waiting for user input
                            return { success: true, waitingForInput: true };
                        } catch (error) {
                            executionState.status = 'failed';
                            executionState.error =
                                error instanceof Error ? error.message : String(error);

                            // Log failure to history
                            await taskHistoryRepository.logExecutionFailed(
                                projectId,
                                projectSequence,
                                executionState.error
                            );
                            await taskRepository.updateByKey(projectId, projectSequence, {
                                status: 'todo',
                            });

                            // Create explicit logger for this execution
                            console.log(
                                '[TaskExecution] Handling Input Task:',
                                task.projectId,
                                task.projectSequence
                            );
                            getMainWindow()?.webContents.send('task:inputRequired', {
                                projectId: task.projectId,
                                projectSequence: task.projectSequence,
                                config: task.inputConfig,
                                subStatus: task.inputSubStatus,
                            });
                            return { success: true, status: 'needs_approval', inputRequired: true };
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

                            // Send all script logs to Activity Console
                            console.log(
                                `[TaskExecution] Sending ${result.logs.length} logs to Activity Console`
                            );
                            result.logs.forEach((log: string) => {
                                const level = log.startsWith('ERROR:')
                                    ? 'error'
                                    : log.startsWith('WARN:')
                                      ? 'warning' // Changed from 'warn' to 'warning'
                                      : 'info';
                                const message = log.replace(/^(ERROR:|WARN:)\s*/, '');

                                console.log(`[ActivityConsole] ${level}: ${message}`);
                                try {
                                    getMainWindow()?.webContents.send('activity:log', {
                                        level,
                                        message,
                                        details: { projectId, projectSequence, source: 'script' },
                                    });
                                } catch (err) {
                                    console.error(
                                        '[TaskExecution] Failed to send activity log:',
                                        err
                                    );
                                }
                            });

                            if (result.success) {
                                executionState.status = 'completed';
                                executionState.streamContent = result.output || '';

                                const executionResult: any = {
                                    content: result.output || '',
                                    duration: result.duration || 0,
                                    provider: 'script',
                                    model: task.scriptLanguage || 'javascript',
                                    logs: result.logs || [],
                                };

                                // Store control flow if present
                                if (result.control) {
                                    executionResult.control = result.control;
                                    console.log(
                                        `[ScriptTask] Control flow detected: next=${JSON.stringify(result.control.next)}, reason="${result.control.reason || ''}"`
                                    );
                                }

                                const finalStatus = task.autoApprove ? 'done' : 'in_review';
                                const updateData: any = {
                                    status: finalStatus,
                                    executionResult,
                                };

                                if (task.autoApprove) {
                                    updateData.completedAt = new Date().toISOString();
                                }

                                const completionPayload = {
                                    projectId: task.projectId,
                                    projectSequence: task.projectSequence,
                                    result: executionResult,
                                };

                                console.log(
                                    `[TaskExecution] Updating task ${projectId}-${projectSequence} status to ${finalStatus}`
                                );

                                // Log success to history
                                const historyEntry =
                                    await taskHistoryRepository.logExecutionCompleted(
                                        projectId,
                                        projectSequence,
                                        executionResult.content,
                                        {
                                            provider: executionResult.provider,
                                            model: executionResult.model,
                                            duration: executionResult.duration,
                                        },
                                        undefined, // AI Result
                                        executionResult // Execution Result
                                    );

                                getMainWindow()?.webContents.send(
                                    'task-history:created',
                                    historyEntry
                                );

                                await taskRepository.updateByKey(
                                    projectId,
                                    projectSequence,
                                    updateData
                                );

                                try {
                                    getMainWindow()?.webContents.send('task:status-changed', {
                                        projectId,
                                        projectSequence,
                                        status: finalStatus,
                                    });

                                    // Safe serialization for IPC
                                    try {
                                        // Deep clone via JSON to strip non-serializable properties (proxies, etc)
                                        const safePayload = JSON.parse(
                                            JSON.stringify(completionPayload)
                                        );

                                        getMainWindow()?.webContents.send(
                                            'taskExecution:completed',
                                            safePayload
                                        );
                                    } catch (err) {
                                        console.error(
                                            `[TaskExecution] Serialization prevented IPC send for ${projectId}-${projectSequence}:`,
                                            err
                                        );
                                        // Fallback: send minimal success info
                                        const minimalPayload = {
                                            projectId: task.projectId,
                                            projectSequence: task.projectSequence,
                                            result: {
                                                success: true,
                                                output:
                                                    typeof executionResult.output === 'string'
                                                        ? executionResult.output
                                                        : 'Output not serializable',
                                            },
                                        };
                                        getMainWindow()?.webContents.send(
                                            'taskExecution:completed',
                                            minimalPayload
                                        );
                                    }
                                } catch (err) {
                                    console.error(
                                        '[TaskExecution] Failed to send completion events:',
                                        err
                                    );
                                }

                                if (finalStatus === 'done') {
                                    // 1. Trigger Curator to update memory (AWAIT THIS)
                                    // Re-fetch project to ensure we pass correct object
                                    const freshProject = await projectRepository.findById(
                                        task.projectId
                                    );
                                    if (freshProject) {
                                        await triggerCurator(
                                            projectId,
                                            projectSequence,
                                            task,
                                            executionResult.content, // Pass content
                                            freshProject
                                        );
                                    }

                                    // 2. Trigger Dependents
                                    await checkAndExecuteDependentTasks(
                                        projectId,
                                        projectSequence,
                                        task as Task,
                                        options
                                    );
                                }

                                activeExecutions.delete(getTaskKey(projectId, projectSequence));

                                // Safe serialization for IPC return value
                                const safeResult = JSON.parse(JSON.stringify(result));
                                return { success: true, result: safeResult };
                            } else {
                                throw new Error(result.error || 'Script execution failed');
                            }
                        } catch (error) {
                            executionState.status = 'failed';
                            executionState.error =
                                error instanceof Error ? error.message : String(error);

                            // Keep status as failed to show red border
                            await taskRepository.updateByKey(projectId, projectSequence, {
                                status: 'failed',
                            });

                            // Log failure to history
                            const historyEntry = await taskHistoryRepository.logExecutionFailed(
                                projectId,
                                projectSequence,
                                executionState.error,
                                {
                                    provider: 'script',
                                    model: task.scriptLanguage || 'javascript',
                                }
                            );

                            getMainWindow()?.webContents.send('task-history:created', historyEntry);

                            getMainWindow()?.webContents.send('taskExecution:failed', {
                                projectId: task.projectId,
                                projectSequence: task.projectSequence,
                                error: executionState.error,
                            });

                            // Return failure instead of throwing to prevent outer catch block from resetting status to in_review
                            activeExecutions.delete(getTaskKey(projectId, projectSequence));
                            return {
                                success: false,
                                statusHandled: true,
                                error: executionState.error || 'Check logs for details',
                            };
                        }
                    }

                    // If not script and not input, we proceed to AI execution flow below.
                    // This return statement ensures script/input tasks exit here.
                    return; // Or throw an error if it's an unexpected task type
                }

                // 3. Handle Output Tasks
                if (task.taskType === 'output') {
                    console.log(
                        `[TaskExecution] Executing output task ${projectId}-${projectSequence}`
                    );

                    // Initialize execution state for Output Tasks to track status/errors locally
                    const executionState: ExecutionState = {
                        projectId,
                        projectSequence,
                        status: 'running',
                        startedAt: new Date(),
                        progress: 0,
                        currentPhase: 'executing',
                        streamContent: '',
                    };
                    activeExecutions.set(getTaskKey(projectId, projectSequence), executionState);

                    try {
                        const { OutputTaskRunner } = await import('../services/output'); // Ensure this imports correctly or use full path
                        const runner = new OutputTaskRunner();

                        // Execute output logic
                        // Assuming runner.execute is updated to accept projectId, sequence
                        const result = await runner.execute(projectId, projectSequence);

                        if (result.success) {
                            executionState.status = 'completed';

                            // Get the updated task to access result data
                            const updatedTask = await taskRepository.findByKey(
                                projectId,
                                projectSequence
                            );

                            // Log execution completion to history for Output tasks
                            if (updatedTask) {
                                const historyEntry =
                                    await taskHistoryRepository.logExecutionCompleted(
                                        projectId,
                                        projectSequence,
                                        'Output task completed',
                                        {
                                            provider: 'output',
                                            model: 'connector',
                                            cost: 0,
                                            tokens: 0,
                                            duration:
                                                Date.now() - executionState.startedAt.getTime(),
                                        },
                                        undefined,
                                        updatedTask.executionResult as any
                                    );
                                getMainWindow()?.webContents.send(
                                    'task-history:created',
                                    historyEntry
                                );
                                console.log(
                                    `[TaskExecution] Output task ${projectId}-${projectSequence} history logged`
                                );
                            }

                            // Task status update is handled inside runner, but we ensure notification
                            getMainWindow()?.webContents.send('taskExecution:completed', {
                                projectId: task.projectId,
                                projectSequence: task.projectSequence,
                                result: {
                                    content: 'Output execution completed',
                                    provider: 'output',
                                    model: 'connector',
                                    metadata: result.data || result.metadata || {},
                                },
                            });

                            // Trigger dependent tasks
                            if (updatedTask && updatedTask.status === 'done') {
                                await checkAndExecuteDependentTasks(
                                    projectId,
                                    projectSequence,
                                    updatedTask,
                                    options
                                );
                            }

                            activeExecutions.delete(getTaskKey(projectId, projectSequence));
                            return { success: true }; // Exit here
                        } else {
                            throw new Error(result.error || 'Output execution failed');
                        }
                    } catch (error) {
                        executionState.status = 'failed';
                        executionState.error =
                            error instanceof Error ? error.message : String(error);

                        await taskRepository.updateByKey(projectId, projectSequence, {
                            status: 'todo',
                        });

                        getMainWindow()?.webContents.send('task:status-changed', {
                            projectId,
                            projectSequence,
                            status: 'todo',
                        });

                        getMainWindow()?.webContents.send('taskExecution:failed', {
                            projectId: task.projectId,
                            projectSequence: task.projectSequence,
                            error: executionState.error,
                        });

                        // Send failure notification
                        await taskNotificationService.notifyFailure(
                            projectId,
                            projectSequence,
                            executionState.error
                        );

                        activeExecutions.delete(getTaskKey(projectId, projectSequence)); // Clean up
                        throw error;
                    }
                } // End Output Task block

                // 4. AI Task Execution (Default)
                // Initialize execution state for AI tasks
                let executionState: ExecutionState = {
                    projectId,
                    projectSequence,
                    status: 'running',
                    startedAt: new Date(),
                    progress: 0,
                    currentPhase: 'initializing',
                    streamContent: '',
                };
                activeExecutions.set(getTaskKey(projectId, projectSequence), executionState);

                // Update task status to in_progress
                await taskRepository.updateByKey(projectId, projectSequence, {
                    status: 'in_progress',
                    startedAt: new Date(),
                });
                getMainWindow()?.webContents.send('task:status-changed', {
                    projectId,
                    projectSequence,
                    status: 'in_progress',
                });
                getMainWindow()?.webContents.send('taskExecution:started', {
                    projectId: task.projectId,
                    projectSequence: task.projectSequence,
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
                                    `[TaskExecution] Using operator ${operator.name} for task ${projectId}-${projectSequence}`
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
                        pkg += `Task Sequence: ${task.projectSequence}\n`;
                        pkg += `Task Name: ${task.title}\n`;
                        // Task Objective removed from Context Package to prevent duplication
                        // The description/prompt is already provided as the main user prompt.
                        pkg += `Task Type: ${task.taskType || 'ai'}\n`;
                        pkg += `---\n\n`;
                        return pkg;
                    };

                    // getOutputContract removed to prevent pollution of task results with summary headers
                    // The CuratorService extracts this information independently.

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
                            `[TaskExecution] Routing task ${projectId}-${projectSequence} to Local Agent: ${agentType}`
                        );

                        const workingDir = project?.baseDevFolder;
                        if (!workingDir) {
                            throw new Error(
                                `Task ${projectId}-${projectSequence} requires a working directory (baseDevFolder) for local agent execution`
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
                                currentTaskId: task.projectSequence,
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
                                            // Ensure this uses a valid ID if res.taskId is deprecated
                                            res.taskId || `prev-task-${res.taskTitle}`
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

                            // Language Instruction (Local Agent)
                            if (options?.language && options.language !== 'auto') {
                                const lang =
                                    options.language === 'ko' ? 'Korean' : options.language;
                                prompt += `\n## Language Instruction\nIMPORTANT: You MUST complete this task and provide all responses, code comments, and explanations in **${lang}**.\n\n`;
                            }

                            // Inject instructions for Project Memory Update (Local Agent)
                            prompt += `\n## Project Memory Update\n`;
                            prompt += `You are working in a persistent session. Your work is part of a larger project.\n`;
                            prompt += `At the END of your response, you MUST provide a structured update for the Project Memory using the following XML format:\n`;
                            prompt += `\`\`\`xml
<project_memory_update>
  <summary_update>
    Provide a concise summary of what you accomplished in this task and how it affects the overall project state. 
    Merge this with the existing summary if provided previously.
  </summary_update>
  <new_decisions>
    <decision date="YYYY-MM-DD">Describe any key technical or design decisions made.</decision>
  </new_decisions>
</project_memory_update>
\`\`\`\n`;
                            prompt += `This XML block is CRITICAL for maintaining context across sessions. Do not omit it.\n\n`;

                            return prompt;
                        };

                        const sessionInfo = await sessionManager.createSession(
                            agentType,
                            workingDir,
                            undefined,
                            projectId,
                            projectSequence
                        );

                        // Re-fetch execution state safely
                        const tempState = activeExecutions.get(
                            getTaskKey(projectId, projectSequence)
                        );
                        if (!tempState) {
                            console.error(
                                `[TaskExecution] Execution state was deleted for task ${projectId}-${projectSequence}`
                            );
                            throw new Error('Execution state was cleared before completion');
                        }
                        executionState = tempState;

                        const prompt = buildTaskPrompt(task, previousResults, project);
                        const response = await sessionManager.sendMessage(sessionInfo.id, prompt, {
                            timeout: options?.timeout ?? 0,
                            onChunk: (chunk) => {
                                const state = activeExecutions.get(
                                    getTaskKey(projectId, projectSequence)
                                );
                                if (state) state.streamContent += chunk;

                                getMainWindow()?.webContents.send('taskExecution:progress', {
                                    projectId: task.projectId,
                                    projectSequence: task.projectSequence,
                                    progress: state?.progress || 0,
                                    phase: 'generating',
                                    delta: chunk,
                                    content: state?.streamContent || '',
                                });
                            },
                        });

                        // Session is now persistent for local agents.
                        // Do NOT close here. Process cleanup is handled by application exit or manual termination.
                        // await sessionManager.closeSession(sessionInfo.id);

                        const fileChanges = fsMonitor.getChanges({ includeContent: true });
                        console.log(`[TaskExecution] Detected ${fileChanges.length} file changes`);

                        if (response.success) {
                            await taskHistoryRepository.logExecutionStarted(
                                projectId,
                                projectSequence,
                                prompt, // Log the Resolved Prompt
                                task.aiProvider || 'local',
                                'local-model'
                            );

                            // Re-check execution state before updating
                            const tempState = activeExecutions.get(
                                getTaskKey(projectId, projectSequence)
                            );
                            if (!tempState) {
                                console.error(
                                    `[TaskExecution] Execution state was deleted for task ${projectId}-${projectSequence} during execution`
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

                            await taskRepository.updateByKey(
                                projectId,
                                projectSequence,
                                updateData
                            );

                            console.log(
                                `[LocalAgent] ✅ Task ${projectId}-${projectSequence} completed - status: ${finalStatus}`
                            );

                            getMainWindow()?.webContents.send('task:status-changed', {
                                projectId,
                                projectSequence,
                                status: finalStatus,
                            });
                            getMainWindow()?.webContents.send('taskExecution:completed', {
                                projectId: task.projectId,
                                projectSequence: task.projectSequence,
                                result: executionResult,
                            });

                            const historyEntry = await taskHistoryRepository.logExecutionCompleted(
                                projectId,
                                projectSequence,
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

                            getMainWindow()?.webContents.send('task-history:created', historyEntry);

                            // Send notifications
                            if (finalStatus === 'done') {
                                await taskNotificationService.notifyCompletion(
                                    projectId,
                                    projectSequence,
                                    response.content,
                                    {
                                        duration: response.duration,
                                        cost: 0, // Local agent has no cost
                                        tokenUsage: response.tokenUsage
                                            ? {
                                                  input: response.tokenUsage.input,
                                                  output: response.tokenUsage.output,
                                                  total:
                                                      response.tokenUsage.input +
                                                      response.tokenUsage.output,
                                              }
                                            : undefined,
                                    }
                                );

                                // Extract Project Memory Update from response
                                const memoryRegex =
                                    /<project_memory_update>([\s\S]*?)<\/project_memory_update>/;
                                const match = response.content.match(memoryRegex);
                                let preComputedContext = undefined;

                                if (match && match[1]) {
                                    try {
                                        const innerXml = match[1];
                                        const summaryMatch =
                                            /<summary_update>([\s\S]*?)<\/summary_update>/;
                                        const decisionsRegex =
                                            /<decision date="([^"]+)">([\s\S]*?)<\/decision>/g;

                                        const summaryUpdate =
                                            innerXml.match(summaryMatch)?.[1]?.trim() || null;
                                        const newDecisions = [];

                                        let decisionMatch;
                                        while (
                                            (decisionMatch = decisionsRegex.exec(innerXml)) !== null
                                        ) {
                                            newDecisions.push({
                                                date: decisionMatch[1],
                                                summary: decisionMatch[2].trim(),
                                            });
                                        }

                                        if (summaryUpdate || newDecisions.length > 0) {
                                            preComputedContext = {
                                                summaryUpdate,
                                                newDecisions,
                                                glossaryUpdates: {}, // XML doesn't support glossary yet to keep it simple
                                                conflicts: [],
                                            };
                                            console.log(
                                                `[LocalAgent] Extracted pre-computed memory update:`,
                                                preComputedContext
                                            );
                                        }
                                    } catch (e) {
                                        console.warn(
                                            `[LocalAgent] Failed to parse project_memory_update XML:`,
                                            e
                                        );
                                    }
                                }

                                // Re-fetch Project to get LATEST memory before triggering curator
                                const freshProject = await projectRepository.findById(
                                    task.projectId
                                );

                                await triggerCurator(
                                    projectId,
                                    projectSequence,
                                    task,
                                    response.content,
                                    freshProject || project, // Use fresh project if available
                                    undefined,
                                    preComputedContext
                                ); // Trigger Curator
                                await checkAndExecuteDependentTasks(
                                    projectId,
                                    projectSequence,
                                    task as Task
                                );
                            } else if (finalStatus === 'in_review') {
                                await taskNotificationService.notifyReviewReady(
                                    projectId,
                                    projectSequence,
                                    response.content
                                );
                            }

                            activeExecutions.delete(getTaskKey(projectId, projectSequence));
                            return { success: true, result: response };
                        } else {
                            throw new Error(response.error || 'Local agent execution failed');
                        }
                    }

                    // ==================================================================================
                    // PATH B: Default AI Provider Execution
                    // ==================================================================================

                    // Fetch dependent task results
                    // Fetch dependent task results using Centralized Builder
                    const { previousResults } = await buildDependencyContext(task as Task);

                    // Re-fetch Project to get LATEST memory (updated by Curator from previous tasks)
                    const freshProject = await projectRepository.findById(task.projectId);

                    // Context Injection & Prompt Construction (Consolidated)
                    const contextPackage = buildContextPackage(freshProject || project, task);
                    let basePrompt = task.generatedPrompt || task.description || '';

                    // Language Instruction (Standard AI)
                    let languageInstruction = '';
                    if (options?.language && options.language !== 'auto') {
                        const lang = options.language === 'ko' ? 'Korean' : options.language;
                        languageInstruction = `\n\n## Language Instruction\nIMPORTANT: You MUST complete this task and provide all responses, code comments, and explanations in **${lang}**.\n`;
                    }

                    task.description = `${contextPackage}\n${basePrompt}${languageInstruction}`;

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
                        currentTaskId: task.projectSequence,
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
                        projectId,
                        projectSequence,
                        resolvedDescription,
                        task.aiProvider || undefined,
                        undefined
                    );

                    // Safe Execution State
                    const tempState = activeExecutions.get(getTaskKey(projectId, projectSequence));
                    if (!tempState) {
                        console.error(
                            `[TaskExecution] Execution state was deleted for task ${projectId}-${projectSequence}`
                        );
                        throw new Error('Execution state was cleared before AI execution');
                    }
                    executionState = tempState;

                    const onToken = (token: string) => {
                        const state = activeExecutions.get(getTaskKey(projectId, projectSequence));
                        if (state) state.streamContent += token;
                        getMainWindow()?.webContents.send('taskExecution:progress', {
                            projectId: task.projectId,
                            projectSequence: task.projectSequence,
                            progress: state?.progress || 0,
                            phase: 'processing',
                            delta: token,
                            content: state?.streamContent ?? token,
                        });
                    };

                    const onProgress = (progress: {
                        phase: string;
                        elapsedTime: number;
                        content?: string;
                    }) => {
                        const state = activeExecutions.get(getTaskKey(projectId, projectSequence));
                        if (state) state.currentPhase = progress.phase;
                        getMainWindow()?.webContents.send('taskExecution:progress', {
                            projectId: task.projectId,
                            projectSequence: task.projectSequence,
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
                        projectMcpConfig: project?.mcpConfig || null,
                        project: project || null,
                    };

                    const result = await executor.executeTask(task as Task, context, {
                        timeout: options?.timeout ?? 300000,
                        fallbackProviders: options?.fallbackProviders,
                        onLog: (level, message, details) =>
                            sendActivityLog(level, message, details),
                    });

                    // Check stopped state
                    const currentState = activeExecutions.get(
                        getTaskKey(projectId, projectSequence)
                    );
                    if (!currentState || currentState.status === 'stopped') {
                        await taskRepository.updateByKey(projectId, projectSequence, {
                            status: 'todo',
                        });
                        getMainWindow()?.webContents.send('task:status-changed', {
                            projectId,
                            projectSequence,
                            status: 'todo',
                        });
                        getMainWindow()?.webContents.send('taskExecution:stopped', {
                            projectId: task.projectId,
                            projectSequence: task.projectSequence,
                        });
                        activeExecutions.delete(getTaskKey(projectId, projectSequence));
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
                        const tempState = activeExecutions.get(
                            getTaskKey(projectId, projectSequence)
                        );
                        if (!tempState) {
                            console.error(
                                `[TaskExecution] Execution state was deleted for task ${projectId}-${projectSequence} after execution`
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

                        console.log(
                            `[TaskExecution] 📝 Updating task ${projectId}-${projectSequence} status to ${finalStatus} (autoApprove: ${task.autoApprove})`
                        );
                        await taskRepository.updateByKey(projectId, projectSequence, updateData);

                        console.log(
                            `[Main IPC] ✅ Task ${projectId}-${projectSequence} completed - status: ${finalStatus}`
                        );

                        getMainWindow()?.webContents.send('task:status-changed', {
                            projectId,
                            projectSequence,
                            status: finalStatus,
                        });
                        getMainWindow()?.webContents.send('taskExecution:completed', {
                            projectId: task.projectId,
                            projectSequence: task.projectSequence,
                            result: executionResult,
                        });

                        const historyEntry = await taskHistoryRepository.logExecutionCompleted(
                            projectId,
                            projectSequence,
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

                        getMainWindow()?.webContents.send('task-history:created', historyEntry);

                        if (finalStatus === 'done') {
                            await taskNotificationService.notifyCompletion(
                                projectId,
                                projectSequence,
                                displayContent || '',
                                {
                                    duration: result.duration,
                                    cost: result.cost,
                                    tokenUsage: {
                                        total: result.tokens || 0,
                                        input: 0,
                                        output: 0,
                                    },
                                }
                            );
                            await triggerCurator(
                                projectId,
                                projectSequence,
                                task,
                                displayContent || '',
                                project
                            ); // Trigger Curator
                            await checkAndExecuteDependentTasks(
                                projectId,
                                projectSequence,
                                task as Task,
                                options
                            );
                        } else if (finalStatus === 'in_review') {
                            await taskNotificationService.notifyReviewReady(
                                projectId,
                                projectSequence,
                                displayContent || ''
                            );
                        }

                        activeExecutions.delete(getTaskKey(projectId, projectSequence));
                        const taskKey = getTaskKey(projectId, projectSequence);

                        // CHECK QUEUE: If there's a pending request for this task, execute it now.
                        // CHECK QUEUE: If there's a pending request for this task, execute it now.
                        if (executionQueue.has(taskKey)) {
                            const triggerId = executionQueue.get(taskKey)!;
                            executionQueue.delete(taskKey);

                            // SAFETY: Prevent Rapid Loops (Recursion)
                            // Even for queued tasks, we should check for tight loops
                            let isLoop = false;
                            if (task.startedAt) {
                                const now = new Date().getTime();
                                const lastRunTime = new Date(task.startedAt).getTime();
                                const timeSinceUnknown = now - lastRunTime;
                                if (timeSinceUnknown < 3000) {
                                    console.warn(
                                        `[TaskExecution] QUEUE: Task ${projectId}-${projectSequence} executed too recently (${timeSinceUnknown}ms ago). Ignoring queued request to prevent infinite loop.`
                                    );
                                    isLoop = true;
                                }
                            }

                            if (!isLoop) {
                                console.log(
                                    `[TaskExecution] 🔄 Processing queued execution for task ${taskKey} (Triggered by ${triggerId})`
                                );

                                // Small delay to ensure DB writes settle?
                                setTimeout(() => {
                                    const win = getMainWindow();
                                    win?.webContents.send('task:autoExecutionStarting', {
                                        projectId,
                                        projectSequence,
                                        triggeredBy: triggerId,
                                    });
                                    win?.webContents.send('task:triggerAutoExecution', {
                                        projectId,
                                        projectSequence,
                                        triggeredBy: triggerId,
                                    });
                                }, 500);
                            }
                        }

                        return { success: true, result };
                        return { success: true, result };
                    } else {
                        // Failed
                        const rawError =
                            result.error instanceof Error
                                ? result.error.message
                                : String(result.error || 'Unknown error');

                        let shortError = rawError;
                        try {
                            // Try to parse JSON error (common with Google/Gemini)
                            const jsonMatch = rawError.match(/\{.*\"error\".*\}/s);
                            if (jsonMatch) {
                                const parsed = JSON.parse(jsonMatch[0]);
                                if (parsed.error && parsed.error.message) {
                                    shortError = parsed.error.message.split('\n')[0]; // Take first line (e.g. "Quota exceeded...")
                                }
                            }
                        } catch (e) {
                            // Keep raw error if parsing fails
                        }

                        // Truncate if still too long
                        if (shortError.length > 300) {
                            shortError = shortError.substring(0, 300) + '...';
                        }

                        console.error(
                            `[TaskExecution] Task ${projectId}-${projectSequence} failed: ${shortError}`
                        );

                        // Log failure to history
                        await taskHistoryRepository.logExecutionFailed(
                            projectId,
                            projectSequence,
                            shortError
                        );

                        // Set to failed/blocked on failure so user can clearly see error state
                        // If this task has dependents, mark as blocked to indicate upstream failure
                        const hasDependents = await taskRepository.hasDependents(
                            projectId,
                            projectSequence
                        );

                        // Check for 429/Quota errors to force BLOCKED status
                        const isRateLimit =
                            shortError.includes('429') ||
                            shortError.includes('Quota') ||
                            shortError.includes('limit') ||
                            shortError.includes('한도');

                        const failureStatus = isRateLimit
                            ? 'blocked'
                            : hasDependents
                              ? 'blocked'
                              : 'failed';

                        await taskRepository.updateByKey(projectId, projectSequence, {
                            status: failureStatus,
                        });

                        const win = getMainWindow();
                        if (win) {
                            win.webContents.send('task:status-changed', {
                                projectId,
                                projectSequence,
                                status: failureStatus,
                            });
                            win.webContents.send('taskExecution:failed', {
                                projectId: task.projectId,
                                projectSequence: task.projectSequence,
                                error: shortError,
                            });
                            console.log(
                                `[TaskExecution] Sending notification for failure: ${shortError}`
                            );
                            win.webContents.send('app:notification', {
                                type: 'error',
                                message: `Task Failed: ${shortError}`,
                                duration: 7000,
                            });
                        }

                        activeExecutions.delete(getTaskKey(projectId, projectSequence));
                        return { success: false, error: shortError };
                    }
                } catch (error) {
                    console.error('Error executing AI task:', error);
                    activeExecutions.delete(getTaskKey(projectId, projectSequence));

                    // Set to failed/blocked on error
                    const hasDependents = await taskRepository.hasDependents(
                        projectId,
                        projectSequence
                    );

                    const errorMsgForStatus =
                        error instanceof Error ? error.message : String(error);
                    const isRateLimit =
                        errorMsgForStatus.includes('429') ||
                        errorMsgForStatus.includes('Quota') ||
                        errorMsgForStatus.includes('limit') ||
                        errorMsgForStatus.includes('한도');

                    const failureStatus = isRateLimit
                        ? 'blocked'
                        : hasDependents
                          ? 'blocked'
                          : 'failed';

                    await taskRepository
                        .updateByKey(projectId, projectSequence, {
                            status: failureStatus,
                        })
                        .catch(() => {});
                    getMainWindow()?.webContents.send('task:status-changed', {
                        projectId,
                        projectSequence,
                        status: failureStatus,
                    });
                    getMainWindow()?.webContents.send('taskExecution:failed', {
                        projectId: task.projectId,
                        projectSequence: task.projectSequence,
                        error: error instanceof Error ? error.message : String(error),
                    });

                    const errorMsg = error instanceof Error ? error.message : String(error);
                    console.log(
                        `[TaskExecution] Sending notification for exception (inner): ${errorMsg}`
                    );
                    getMainWindow()?.webContents.send('app:notification', {
                        type: 'error',
                        message: `Task Execution Error: ${errorMsg}`,
                        duration: 7000,
                    });

                    throw error;
                }
            } catch (error) {
                console.error('Error executing task:', error);

                // Clean up on error
                activeExecutions.delete(getTaskKey(projectId, projectSequence));

                // Set to failed/blocked on error
                const hasDependents = await taskRepository.hasDependents(
                    projectId,
                    projectSequence
                );

                const errorMsgForStatus = error instanceof Error ? error.message : String(error);
                const isRateLimit =
                    errorMsgForStatus.includes('429') ||
                    errorMsgForStatus.includes('Quota') ||
                    errorMsgForStatus.includes('limit') ||
                    errorMsgForStatus.includes('한도');

                const failureStatus = isRateLimit
                    ? 'blocked'
                    : hasDependents
                      ? 'blocked'
                      : 'failed';

                await taskRepository
                    .updateByKey(projectId, projectSequence, {
                        status: failureStatus,
                    })
                    .catch(() => {});
                getMainWindow()?.webContents.send('task:status-changed', {
                    projectId,
                    projectSequence,
                    status: failureStatus,
                });
                getMainWindow()?.webContents.send('taskExecution:failed', {
                    projectId: task.projectId,
                    projectSequence: task.projectSequence,
                    error: error instanceof Error ? error.message : String(error),
                });

                const errorMsg = error instanceof Error ? error.message : String(error);
                console.log(
                    `[TaskExecution] Sending notification for exception (outer): ${errorMsg}`
                );
                getMainWindow()?.webContents.send('app:notification', {
                    type: 'error',
                    message: `Task Error: ${errorMsg}`,
                    duration: 7000,
                });

                throw error;
            }
        }
    );

    /**
     * Pause a running task
     */
    ipcMain.handle(
        'taskExecution:pause',
        async (_event, projectId: number, projectSequence: number) => {
            const task = await taskRepository.findByKey(projectId, projectSequence);
            if (!task) {
                throw new Error(`Task ${projectId}-${projectSequence} not found`);
            }
            const taskKey = getTaskKey(projectId, projectSequence); // Use composite key
            try {
                const state = activeExecutions.get(taskKey);
                if (!state) {
                    throw new Error(`No active execution for task ${taskKey}`);
                }

                if (state.status !== 'running') {
                    throw new Error(
                        `Task ${taskKey} is not running (current status: ${state.status})`
                    );
                }

                state.status = 'paused';
                state.pausedAt = new Date();

                getMainWindow()?.webContents.send('taskExecution:paused', {
                    projectId,
                    projectSequence,
                    pausedAt: state.pausedAt,
                });

                // Log paused to history
                await taskHistoryRepository.logPaused(projectId, projectSequence);

                return { success: true };
            } catch (error) {
                console.error('Error pausing task:', error);
                throw error;
            }
        }
    );

    /**
     * Resume a paused task
     */
    ipcMain.handle(
        'taskExecution:resume',
        async (_event, projectId: number, projectSequence: number) => {
            const task = await taskRepository.findByKey(projectId, projectSequence);
            if (!task) {
                throw new Error(`Task ${projectId}-${projectSequence} not found`);
            }
            const taskKey = getTaskKey(projectId, projectSequence); // Use composite key
            try {
                const state = activeExecutions.get(taskKey);
                if (!state) {
                    throw new Error(`No active execution for task ${taskKey}`);
                }

                if (state.status !== 'paused') {
                    throw new Error(
                        `Task ${taskKey} is not paused (current status: ${state.status})`
                    );
                }

                state.status = 'running';
                state.pausedAt = undefined;

                getMainWindow()?.webContents.send('taskExecution:resumed', {
                    projectId: task.projectId,
                    projectSequence: task.projectSequence,
                });

                // Log resumed to history
                await taskHistoryRepository.logResumed(projectId, projectSequence);

                return { success: true };
            } catch (error) {
                console.error('Error resuming task:', error);
                throw error;
            }
        }
    );

    /**
     * Stop a running task
     */
    ipcMain.handle(
        'taskExecution:stop',
        async (_event, projectId: number, projectSequence: number) => {
            const task = await taskRepository.findByKey(projectId, projectSequence);
            if (!task) {
                throw new Error(`Task ${projectId}-${projectSequence} not found`);
            }
            const taskKey = getTaskKey(projectId, projectSequence);
            try {
                const aiCancelled = await executor.cancelTask(projectId, projectSequence);
                if (aiCancelled) {
                    console.log(
                        `[TaskExecution] Sent cancel signal to AI provider for task ${taskKey}`
                    );
                } else {
                    console.warn(
                        `[TaskExecution] No active AI execution found to cancel for task ${taskKey}`
                    );
                }

                // Terminate Local Agent session if exists
                try {
                    const { sessionManager } = await import('../services/local-agent-session');
                    const sessionTerminated = await sessionManager.terminateTaskSession(
                        projectId,
                        projectSequence
                    );
                    if (sessionTerminated) {
                        console.log(
                            `[TaskExecution] Terminated Local Agent session for task ${taskKey}`
                        );
                    }
                } catch (error) {
                    // Session manager might not be available or session doesn't exist
                    console.debug(
                        `[TaskExecution] No Local Agent session to terminate for task ${taskKey}`
                    );
                }

                const state = activeExecutions.get(taskKey);
                if (state) {
                    state.status = 'stopped';
                    state.currentPhase = 'stopped';
                }

                // Update task status to todo and clear inputSubStatus
                await taskRepository.updateByKey(projectId, projectSequence, {
                    status: 'todo',
                    inputSubStatus: null,
                });
                getMainWindow()?.webContents.send('task:status-changed', {
                    projectId,
                    projectSequence,
                    status: 'todo',
                });
                getMainWindow()?.webContents.send('taskExecution:stopped', {
                    projectId,
                    projectSequence,
                });

                // Log stopped to history
                await taskHistoryRepository.logStopped(projectId, projectSequence);

                activeExecutions.delete(taskKey);

                return { success: true };
            } catch (error) {
                console.error('Error stopping task:', error);
                throw error;
            }
        }
    );

    /**
     * Get execution status for a task
     */
    /**
     * Get execution status for a task
     */
    ipcMain.handle(
        'taskExecution:getStatus',
        async (_event, projectId: number, projectSequence: number) => {
            const state = activeExecutions.get(getTaskKey(projectId, projectSequence));
            if (!state) {
                return null;
            }

            return {
                projectId: state.projectId,
                projectSequence: state.projectSequence,
                status: state.status,
                startedAt: state.startedAt,
                pausedAt: state.pausedAt,
                progress: state.progress,
                currentPhase: state.currentPhase,
                streamContent: state.streamContent,
                error: state.error,
            };
        }
    );

    /**
     * Get all active executions
     */
    ipcMain.handle('taskExecution:getAllActive', async () => {
        const executions: Array<{
            projectId: number;
            projectSequence: number;
            status: string;
            startedAt: Date;
            progress: number;
            currentPhase: string;
        }> = [];

        activeExecutions.forEach((state) => {
            executions.push({
                projectId: state.projectId,
                projectSequence: state.projectSequence,
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
     * Cancel task execution
     */
    ipcMain.handle(
        'taskExecution:cancel',
        async (_event, projectId: number, projectSequence: number) => {
            await executor.cancelTask(projectId, projectSequence);
        }
    );

    /**
     * Pause execution for a project
     */
    ipcMain.handle('taskExecution:pauseAll', async (_event, projectId: number) => {
        if (typeof projectId !== 'number') {
            console.error('[TaskExecution] pauseAll called without projectId');
            return;
        }
        GlobalExecutionService.getInstance().setProjectPause(projectId, true);
    });

    /**
     * Resume execution for a project
     */
    ipcMain.handle('taskExecution:resumeAll', async (_event, projectId: number) => {
        if (typeof projectId !== 'number') {
            console.error('[TaskExecution] resumeAll called without projectId');
            return;
        }
        GlobalExecutionService.getInstance().setProjectPause(projectId, false);

        // When resuming, we should check if any tasks are ready to run?
        // Ideally, we'd check "stuck" pending tasks, but for now we just allow new executions.
    });

    /**
     * Get pause status for a project
     */
    ipcMain.handle('taskExecution:getGlobalPauseStatus', async (_event, projectId?: number) => {
        if (!projectId) return false;
        return GlobalExecutionService.getInstance().isProjectPaused(projectId);
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
            projectId: number,
            projectSequence: number,
            data: {
                question: string;
                options?: string[];
                context?: unknown;
            }
        ) => {
            try {
                const state = activeExecutions.get(getTaskKey(projectId, projectSequence));
                if (state) {
                    state.status = 'needs_approval';
                    state.currentPhase = 'waiting_for_approval';
                }

                // Update task status to needs_approval
                await taskRepository.updateByKey(projectId, projectSequence, {
                    status: 'needs_approval',
                    aiApprovalRequest: JSON.stringify(data),
                });

                getMainWindow()?.webContents.send('task:status-changed', {
                    projectId,
                    projectSequence,
                    status: 'needs_approval',
                });
                getMainWindow()?.webContents.send('taskExecution:approvalRequired', {
                    projectId,
                    projectSequence,
                    question: data.question,
                    options: data.options,
                    context: data.context,
                });

                // Log approval requested to history
                await taskHistoryRepository.logApprovalRequested(
                    projectId,
                    projectSequence,
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
    ipcMain.handle(
        'taskExecution:approve',
        async (
            _event,
            projectId: number,
            projectSequence: number,
            response?: string,
            options?: { apiKeys?: Record<string, string> }
        ) => {
            console.log(`[TaskExecution] Approve task ${projectId}-${projectSequence}`);

            try {
                const task = await taskRepository.findByKey(projectId, projectSequence);
                if (!task) {
                    return { success: false, error: 'Task not found' };
                }

                // Support both needs_approval (AI tasks) and in_review (Script tasks)
                if (task.status !== 'needs_approval' && task.status !== 'in_review') {
                    return {
                        success: false,
                        error: 'Task must be in NEEDS_APPROVAL or IN_REVIEW status to approve',
                    };
                }

                // Determine new status based on current status
                // Script tasks (in_review) go to done, AI tasks (needs_approval) go back to in_progress
                let newStatus: 'done' | 'in_progress' = 'in_progress';
                if (task.status === 'in_review') {
                    newStatus = 'done';
                    console.log('[TaskExecution] Script task approved, moving to DONE');
                } else {
                    newStatus = 'in_progress';
                    console.log('[TaskExecution] AI task approved, moving back to IN_PROGRESS');
                }

                // Update task status
                await taskRepository.updateByKey(projectId, projectSequence, {
                    status: newStatus,
                    approvalResponse: response || null,
                    updatedAt: new Date(),
                });

                // Broadcast update
                const updatedTask = await taskRepository.findByKey(projectId, projectSequence);
                if (updatedTask) {
                    getMainWindow()?.webContents.send('task:status-changed', {
                        projectId,
                        projectSequence,
                        status: updatedTask.status,
                    });
                    // broadcastTaskUpdate(updatedTask as Task);
                }

                // Trigger dependent tasks if moving to DONE (Script tasks)
                if (newStatus === 'done' && updatedTask) {
                    // Trigger Curator
                    const project = await projectRepository.findById(projectId);
                    const content = (updatedTask.executionResult as any)?.content || '';
                    if (project && content) {
                        await triggerCurator(
                            projectId,
                            projectSequence,
                            updatedTask as Task,
                            content,
                            project,
                            options?.apiKeys
                        );
                    }

                    await checkAndExecuteDependentTasks(
                        projectId,
                        projectSequence,
                        updatedTask as Task
                    );
                }

                return { success: true };
            } catch (error) {
                console.error('[TaskExecution] Approve failed:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        }
    );

    /**
     * Reject and revert to TODO
     */
    ipcMain.handle(
        'taskExecution:reject',
        async (_event, projectId: number, projectSequence: number) => {
            try {
                // Update task status to todo
                await taskRepository.updateByKey(projectId, projectSequence, {
                    status: 'todo',
                    aiApprovalRequest: null,
                    aiApprovalResponse: null,
                });

                getMainWindow()?.webContents.send('task:status-changed', {
                    projectId,
                    projectSequence,
                    status: 'todo',
                });
                getMainWindow()?.webContents.send('taskExecution:rejected', {
                    projectId,
                    projectSequence,
                });

                // Log rejected to history
                await taskHistoryRepository.logRejected(projectId, projectSequence);

                activeExecutions.delete(getTaskKey(projectId, projectSequence));

                return { success: true };
            } catch (error) {
                console.error('Error rejecting task:', error);
                throw error;
            }
        }
    );

    // ========================================
    // IN_REVIEW State Handlers
    // ========================================

    /**
     * Complete review and move to DONE
     */
    ipcMain.handle(
        'taskExecution:completeReview',
        async (
            _event,
            projectId: number,
            projectSequence: number,
            options?: { apiKeys?: Record<string, string> }
        ) => {
            try {
                // Get task before updating for dependent task check
                const task = await taskRepository.findByKey(projectId, projectSequence);
                if (!task) {
                    throw new Error(`Task ${projectId}-${projectSequence} not found`);
                }

                await taskRepository.updateByKey(projectId, projectSequence, {
                    status: 'done',
                    completedAt: new Date(),
                });

                getMainWindow()?.webContents.send('task:status-changed', {
                    projectId,
                    projectSequence,
                    status: 'done',
                });
                getMainWindow()?.webContents.send('taskExecution:reviewCompleted', {
                    projectId,
                    projectSequence,
                });

                // Log review completed to history
                await taskHistoryRepository.logReviewCompleted(projectId, projectSequence);

                // Trigger Curator
                const project = await projectRepository.findById(projectId);
                const content = (task.executionResult as any)?.content || '';
                if (project && content) {
                    await triggerCurator(
                        projectId,
                        projectSequence,
                        task,
                        content,
                        project,
                        options?.apiKeys
                    );
                }

                // Check and execute dependent tasks
                await checkAndExecuteDependentTasks(projectId, projectSequence, {
                    ...task,
                    status: 'done',
                });

                return { success: true };
            } catch (error) {
                console.error('Error completing review:', error);
                throw error;
            }
        }
    );

    /**
     * Request changes and restart execution
     */
    ipcMain.handle(
        'taskExecution:requestChanges',
        async (_event, projectId: number, projectSequence: number, refinementPrompt: string) => {
            try {
                // Store the refinement prompt
                await taskRepository.updateByKey(projectId, projectSequence, {
                    status: 'in_progress',
                    refinementPrompt,
                });

                getMainWindow()?.webContents.send('task:status-changed', {
                    projectId,
                    projectSequence,
                    status: 'in_progress',
                });
                getMainWindow()?.webContents.send('taskExecution:changesRequested', {
                    projectId,
                    projectSequence,
                    refinementPrompt,
                });

                // Log changes requested to history
                await taskHistoryRepository.logChangesRequested(
                    projectId,
                    projectSequence,
                    refinementPrompt
                );

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
        async (
            _event,
            projectId: number,
            projectSequence: number,
            additionalWorkPrompt: string
        ) => {
            try {
                await taskRepository.updateByKey(projectId, projectSequence, {
                    status: 'in_progress',
                    additionalWorkPrompt,
                });

                getMainWindow()?.webContents.send('task:status-changed', {
                    projectId,
                    projectSequence,
                    status: 'in_progress',
                });
                getMainWindow()?.webContents.send('taskExecution:additionalWorkRequested', {
                    projectId,
                    projectSequence,
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
    ipcMain.handle(
        'taskExecution:block',
        async (_event, projectId: number, projectSequence: number, reason?: string) => {
            try {
                // Stop any active execution
                const taskKey = getTaskKey(projectId, projectSequence);
                const state = activeExecutions.get(taskKey);
                if (state) {
                    state.status = 'stopped';
                    activeExecutions.delete(taskKey);
                }

                await taskRepository.updateByKey(projectId, projectSequence, {
                    status: 'blocked',
                    blockReason: reason,
                });

                getMainWindow()?.webContents.send('task:status-changed', {
                    projectId,
                    projectSequence,
                    status: 'blocked',
                });
                getMainWindow()?.webContents.send('taskExecution:blocked', {
                    projectId,
                    projectSequence,
                    reason,
                });

                return { success: true };
            } catch (error) {
                console.error('Error blocking task:', error);
                throw error;
            }
        }
    );

    /**
     * Unblock a task (moves to TODO)
     */
    ipcMain.handle(
        'taskExecution:unblock',
        async (_event, projectId: number, projectSequence: number) => {
            try {
                await taskRepository.updateByKey(projectId, projectSequence, {
                    status: 'todo',
                    blockReason: null,
                });

                getMainWindow()?.webContents.send('task:status-changed', {
                    projectId,
                    projectSequence,
                    status: 'todo',
                });
                getMainWindow()?.webContents.send('taskExecution:unblocked', {
                    projectId,
                    projectSequence,
                });

                return { success: true };
            } catch (error) {
                console.error('Error unblocking task:', error);
                throw error;
            }
        }
    );

    // ========================================
    // Streaming Progress Handler
    // ========================================

    /**
     * Update streaming progress (called internally during execution)
     */
    /**
     * Update streaming progress (called internally during execution)
     */
    ipcMain.handle(
        'taskExecution:updateProgress',
        async (
            _event,
            projectId: number,
            projectSequence: number,
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
                const state = activeExecutions.get(getTaskKey(projectId, projectSequence));
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
                    projectId,
                    projectSequence,
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
    /**
     * Force clear a specific task execution
     */
    ipcMain.handle(
        'taskExecution:forceClear',
        async (_event, projectId: number, projectSequence: number) => {
            try {
                const taskKey = getTaskKey(projectId, projectSequence);
                const hadExecution = activeExecutions.has(taskKey);
                activeExecutions.delete(taskKey);

                // Reset task status to todo
                await taskRepository.updateByKey(projectId, projectSequence, { status: 'todo' });
                getMainWindow()?.webContents.send('task:status-changed', {
                    projectId,
                    projectSequence,
                    status: 'todo',
                });

                console.log(
                    `[TaskExecution] Force cleared task ${taskKey} (had execution: ${hadExecution})`
                );
                return { success: true, hadExecution };
            } catch (error) {
                console.error('Error force clearing task:', error);
                throw error;
            }
        }
    );

    // ========================================
    // Auto AI Review Handlers
    // ========================================

    ipcMain.handle(
        'taskExecution:startAutoReview',
        async (
            _event,
            projectId: number,
            projectSequence: number,
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
                const task = await taskRepository.findByKey(projectId, projectSequence);
                if (!task) {
                    throw new Error(`Task ${projectId}-${projectSequence} not found`);
                }

                console.log(
                    `[TaskExecution] Starting execution for task ${projectId}-${projectSequence} (Type: ${task.taskType}, Status: ${task.status})`
                );

                const taskKey = getTaskKey(projectId, projectSequence); // Defined taskKey

                // Check dependencies (unless forced)
                // Verify task is in IN_REVIEW status
                if (task.status !== 'in_review') {
                    throw new Error(
                        `Task ${taskKey} is not in IN_REVIEW status (current: ${task.status})`
                    );
                }

                // Check if already reviewing
                if (activeReviews.has(taskKey)) {
                    throw new Error(`Task ${taskKey} is already being reviewed`);
                }

                // Get execution result
                const executionResult = task.executionResult
                    ? typeof task.executionResult === 'string'
                        ? JSON.parse(task.executionResult)
                        : task.executionResult
                    : null;

                if (!executionResult?.content) {
                    throw new Error(`Task ${taskKey} has no execution result to review`);
                }

                const { dependencySequences, previousResults } = await buildDependencyContext(
                    task as Task
                );
                const promptSource = (task.generatedPrompt || task.description || '').trim();
                const hasMacros =
                    promptSource.length > 0 &&
                    PromptMacroService.findMacros(promptSource).length > 0;
                const shouldResolveMacros =
                    task.autoReview && dependencySequences.length > 0 && hasMacros;
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
                            taskKey,
                            dependencyCount: dependencySequences.length,
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
                    projectId,
                    projectSequence,
                    status: 'reviewing',
                    startedAt: new Date(),
                    progress: 0,
                    streamContent: '',
                };
                activeReviews.set(taskKey, reviewState);

                // Notify frontend that review is starting
                const win = getMainWindow();
                win?.webContents.send('taskReview:started', {
                    projectId,
                    projectSequence,
                    startedAt: reviewState.startedAt,
                });

                // Log AI review requested to history
                await taskHistoryRepository.logAIReviewRequested(
                    projectId,
                    projectSequence,
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
                    projectId,
                    projectSequence,
                    provider: effectiveConfig.provider,
                    model: effectiveConfig.model,
                    source: effectiveConfig.source,
                    streaming: options?.streaming,
                });

                // Streaming callback for review
                const onReviewToken = (token: string) => {
                    const state = activeReviews.get(getTaskKey(projectId, projectSequence));
                    if (state) {
                        state.streamContent += token;
                    }
                    // Send streaming content to frontend
                    const reviewWin = getMainWindow();
                    if (reviewWin) {
                        /* console.log(
                            '[Main IPC] Sending review progress:',
                            projectId,
                            projectSequence,
                            'streaming',
                            token.slice(0, 20)
                        ); */
                        reviewWin.webContents.send('taskReview:progress', {
                            projectId,
                            projectSequence,
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

                const currentState = activeReviews.get(getTaskKey(projectId, projectSequence));
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
                        `[TaskExecution] Review completed for task ${projectId}-${projectSequence}. Score: ${reviewScore} (Passed: ${reviewScore >= 8})`
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
                        await taskRepository.updateByKey(projectId, projectSequence, {
                            status: 'done',
                            aiReviewResult: JSON.stringify(reviewData),
                            reviewFailed: false,
                            completedAt: new Date(),
                        });
                        win?.webContents.send('task:status-changed', {
                            projectId,
                            projectSequence,
                            status: 'done',
                        });

                        // Check and execute dependent tasks when review passed
                        await checkAndExecuteDependentTasks(projectId, projectSequence, {
                            ...task,
                            status: 'done',
                        });
                    } else {
                        // Score 7- : Stay in IN_REVIEW with failed flag
                        await taskRepository.updateByKey(projectId, projectSequence, {
                            aiReviewResult: JSON.stringify(reviewData),
                            reviewFailed: true,
                        });
                        // No status change, stays in in_review
                    }

                    // Log AI review completed to history
                    await taskHistoryRepository.logAIReviewCompleted(
                        projectId,
                        projectSequence,
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
                        projectId,
                        projectSequence,
                        result: reviewData,
                        passed: reviewPassed,
                        score: reviewScore,
                    });

                    activeReviews.delete(getTaskKey(projectId, projectSequence));
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

                    getMainWindow()?.webContents.send('taskExecution:failed', {
                        projectId: task.projectId,
                        projectSequence: task.projectSequence,
                        error: currentState.error,
                    });

                    activeReviews.delete(getTaskKey(projectId, projectSequence));
                    return { success: false, error: currentState.error };
                }
            } catch (error) {
                console.error('Error starting AI review:', error);
                activeReviews.delete(getTaskKey(projectId, projectSequence));
                getMainWindow()?.webContents.send('taskReview:failed', {
                    projectId,
                    projectSequence,
                    error: error instanceof Error ? error.message : String(error),
                });
                throw error;
            }
        }
    );

    /**
     * Get review status for a task
     */
    ipcMain.handle(
        'taskExecution:getReviewStatus',
        async (_event, projectId: number, projectSequence: number) => {
            const state = activeReviews.get(getTaskKey(projectId, projectSequence));
            if (!state) {
                return null;
            }

            return {
                projectId: state.projectId,
                projectSequence: state.projectSequence,
                status: state.status,
                startedAt: state.startedAt,
                progress: state.progress,
                streamContent: state.streamContent,
                error: state.error,
            };
        }
    );

    /**
     * Cancel ongoing AI review
     */
    ipcMain.handle(
        'taskExecution:cancelReview',
        async (_event, projectId: number, projectSequence: number) => {
            try {
                const taskKey = getTaskKey(projectId, projectSequence);
                const hadReview = activeReviews.has(taskKey);
                activeReviews.delete(taskKey);

                getMainWindow()?.webContents.send('taskReview:cancelled', {
                    projectId,
                    projectSequence,
                });

                console.log(
                    `[TaskExecution] Cancelled review for task ${taskKey} (had review: ${hadReview})`
                );
                return { success: true, hadReview };
            } catch (error) {
                console.error('Error cancelling review:', error);
                throw error;
            }
        }
    );

    /**
     * Submit input for an Input Task
     */
    ipcMain.handle(
        'taskExecution:submitInput',
        async (
            _event,
            projectId: number,
            sequence: number,
            payload: any,
            options?: { apiKeys?: Record<string, string> }
        ) => {
            try {
                const result = await processInputSubmission(projectId, sequence, payload, options);
                return { success: true, result };
            } catch (error) {
                console.error('[TaskExecution] Failed to submit input:', error);
                // Log failure to history
                await taskHistoryRepository.logExecutionFailed(
                    projectId,
                    sequence,
                    error instanceof Error ? error.message : String(error),
                    {
                        reason: 'input_submission_failed',
                    }
                );
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        }
    );

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
function saveBase64ImageToTempFile(base64Data: string, taskIdOrKey?: number | string): string {
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
        const filename = taskIdOrKey
            ? `task-${taskIdOrKey}-review-${timestamp}.${extension}`
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
        const imagePath = saveBase64ImageToTempFile(
            executionContent,
            getTaskKey(task.projectId, task.projectSequence)
        );
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
