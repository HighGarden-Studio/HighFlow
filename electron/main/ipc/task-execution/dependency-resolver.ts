import { taskRepository } from '../../database/repositories/task-repository';
import type { Task, TaskTriggerConfig } from '../../../../src/core/types/database';
import type { TaskResult } from '../../../../src/services/workflow/types';
import { DependencyEvaluator } from '../../services/DependencyEvaluator';
import { GlobalExecutionService } from '../../services/GlobalExecutionService';

// We need to import the executor to trigger tasks.
// Since we are refactoring, we might need to inject the executor or use a callback to avoid circular imports.
// For now, let's define a type for the execution callback.
type ExecuteTaskCallback = (
    projectId: number,
    projectSequence: number,
    source: string
) => Promise<void>;

/**
 * Extract dependency task IDs and their execution results for macro substitution/context passing
 * recursively (up to depth 5)
 */
export async function buildDependencyContext(
    task: Task
): Promise<{ dependencyTaskIds: number[]; previousResults: TaskResult[] }> {
    const visitedKeys = new Set<string>();
    const dependencyTaskIds: number[] = [];
    const previousResults: TaskResult[] = [];
    const maxDepth = 5;

    async function traverse(currentTask: Task, depth: number) {
        if (depth > maxDepth) return;

        const taskKeyStr = `${currentTask.projectId}:${currentTask.projectSequence}`;
        if (visitedKeys.has(taskKeyStr)) return;
        visitedKeys.add(taskKeyStr);

        // Get dependency IDs from triggerConfig
        const triggerConfig: TaskTriggerConfig | undefined =
            typeof currentTask.triggerConfig === 'string'
                ? JSON.parse(currentTask.triggerConfig)
                : currentTask.triggerConfig;

        if (triggerConfig?.dependsOn?.taskKeys) {
            for (const key of triggerConfig.dependsOn.taskKeys) {
                // If dependency is in same project, track sequence for backward compat return
                if (
                    key.projectId === task.projectId &&
                    !dependencyTaskIds.includes(key.projectSequence)
                ) {
                    dependencyTaskIds.push(key.projectSequence);
                }

                const depTask = await taskRepository.findByKey(key.projectId, key.projectSequence);
                if (depTask && depTask.executionResult) {
                    const result =
                        typeof depTask.executionResult === 'string'
                            ? JSON.parse(depTask.executionResult)
                            : depTask.executionResult;
                    previousResults.push(result);
                    await traverse(depTask, depth + 1);
                }
            }
        }
    }

    await traverse(task, 0);
    return { dependencyTaskIds, previousResults };
}

/**
 * Check if task dependencies are met
 */
/**
 * Helper: Resolve expression containing Project Sequences
 * Returns the resolved expression and the set of Sequences found.
 */
function resolveExpressionToSequences(
    expression: string,
    allTasks: Task[]
): { resolvedExpression: string; referencedSequences: Set<number> } {
    if (!expression || !expression.trim()) {
        return { resolvedExpression: '', referencedSequences: new Set() };
    }

    const referencedSequences = new Set<number>();

    // Replace all numbers in the expression with themselves, but verify existence
    const resolvedExpression = expression.replace(/\b\d+\b/g, (match) => {
        const val = parseInt(match, 10);
        const taskExists = allTasks.some((t) => t.projectSequence === val);

        if (taskExists) {
            referencedSequences.add(val);
            return val.toString();
        }
        return match;
    });

    return { resolvedExpression, referencedSequences };
}

/**
 * Check if task dependencies are met
 */
export function areTaskDependenciesMet(
    task: Task,
    allTasks: Task[],
    ignoreNovelty: boolean = false
): { met: boolean; reason?: string; details?: string } {
    const triggerConfig =
        typeof task.triggerConfig === 'string'
            ? JSON.parse(task.triggerConfig)
            : task.triggerConfig;

    if (!triggerConfig?.dependsOn?.taskKeys && !triggerConfig?.dependsOn?.expression) {
        return { met: true };
    }

    const dependsOn = triggerConfig.dependsOn;
    const operator = dependsOn.operator || 'all';
    const originalExpression = dependsOn.expression;

    // Collect all dependency keys
    let dependencyKeys: { projectId: number; projectSequence: number }[] = [
        ...(dependsOn.taskKeys || []),
    ];

    // Resolve Expression if present
    let resolvedExpression = '';
    if (originalExpression && originalExpression.trim().length > 0) {
        const resolution = resolveExpressionToSequences(originalExpression, allTasks);
        resolvedExpression = resolution.resolvedExpression;
        // Merge referenced sequences from expression (ASSUMING SAME PROJECT)
        resolution.referencedSequences.forEach((seq) => {
            const exists = dependencyKeys.some(
                (k) => k.projectId === task.projectId && k.projectSequence === seq
            );
            if (!exists) {
                dependencyKeys.push({ projectId: task.projectId, projectSequence: seq });
            }
        });
    }

    // 1. Prepare Dependency Data for Evaluator
    const dependencyInfo = allTasks
        .filter((t) =>
            dependencyKeys.some(
                (k) => k.projectId === t.projectId && k.projectSequence === t.projectSequence
            )
        )
        .map((t) => ({
            id: t.projectSequence, // Use sequence as ID for evaluator (Evaluator might expect string/number matching expression)
            // Note: Evaluator expression (e.g. "1 && 2") uses numbers which match sequences.
            // If we had cross-project expression, we'd need mapped IDs.
            // For now assuming expression only references same-project tasks.
            status: t.status,
            completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : undefined,
        }));

    // 2. Identify Last Run Time for Novelty Check
    let lastRunAt: string | undefined = undefined;

    // executionPolicy is inside triggerConfig
    const executionPolicy = triggerConfig?.dependsOn?.executionPolicy || 'repeat';

    if (
        !ignoreNovelty &&
        (executionPolicy === 'repeat' ||
            executionPolicy === 'once' ||
            task.status === 'done' ||
            executionPolicy === 'always')
    ) {
        lastRunAt = task.completedAt ? new Date(task.completedAt).toISOString() : undefined;
    }

    // 3. Evaluate
    if (resolvedExpression && resolvedExpression.trim().length > 0) {
        // Advanced Mode: Use DependencyEvaluator with RESOLVED expression (Sequences)
        const evaluator = new DependencyEvaluator(dependencyInfo as any, lastRunAt);
        const result = evaluator.evaluate(resolvedExpression);

        return {
            met: result.met,
            reason: result.met ? undefined : result.reason,
            details: `Expression "${originalExpression}" -> ${result.met}. Reason: ${result.reason || 'Met'}`,
        };
    } else if (operator === 'any') {
        const completedDeps = dependencyInfo.filter((d) => d.status === 'done');
        let met = false;

        if (completedDeps.length > 0) {
            if (lastRunAt) {
                const lastRunTime = new Date(lastRunAt).getTime();
                const hasNew = completedDeps.some(
                    (d) => d.completedAt && new Date(d.completedAt).getTime() > lastRunTime
                );
                met = hasNew;
            } else {
                met = true;
            }
        }

        return {
            met,
            reason: met ? undefined : 'No new dependency completion',
            details: `Operator 'any': ${completedDeps.length}/${dependencyInfo.length} done. Met=${met}`,
        };
    } else {
        // all
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

        return {
            met,
            reason: met ? undefined : 'Conditions not met',
            details: !met
                ? incomplete.length > 0
                    ? `Waiting for: ${incomplete.map((t) => t.id).join(', ')}`
                    : 'All done but no new events (stale)'
                : '',
        };
    }
}

/**
 * Check and execute dependent tasks
 * This is the trigger propagator.
 */
export async function checkAndExecuteDependentTasks(
    completedTaskProjectId: number,
    completedTaskSequence: number,
    executeCallback: ExecuteTaskCallback
): Promise<void> {
    try {
        console.log(
            `[TaskExecution] Checking dependent tasks for completed task ${completedTaskProjectId}:${completedTaskSequence}`
        );

        if (GlobalExecutionService.getInstance().isProjectPaused(completedTaskProjectId)) {
            console.log(`[TaskExecution] Project ${completedTaskProjectId} is PAUSED. Skipping.`);
            return;
        }

        // Get all tasks in project to verify dependencies
        // TODO: For cross-project dependencies, we might need to search generically or cache?
        // Current optim: Only check within same project.
        // If we want cross-project execution triggering, we need a query to "Find tasks depending on X".
        // For now, let's keep it scoped to project unless we have an index.
        const allTasks = await taskRepository.findByProject(completedTaskProjectId);

        // Find tasks that depend on the completed task
        const dependentTasks = allTasks.filter((task) => {
            // Prevent self-dependency
            if (task.projectSequence === completedTaskSequence) return false;

            const triggerConfig =
                typeof task.triggerConfig === 'string'
                    ? JSON.parse(task.triggerConfig)
                    : task.triggerConfig;

            if (!triggerConfig?.dependsOn) return false;

            // Check taskKeys
            if (
                triggerConfig.dependsOn.taskKeys?.some(
                    (k) =>
                        k.projectId === completedTaskProjectId &&
                        k.projectSequence === completedTaskSequence
                )
            ) {
                return true;
            }

            // Check expression (regex match for sequence)
            if (triggerConfig.dependsOn.expression) {
                const expr = triggerConfig.dependsOn.expression;
                // Simple regex check for number boundary
                return new RegExp(`\\b${completedTaskSequence}\\b`).test(expr);
            }

            return false;
        });

        console.log(`[TaskExecution] Found ${dependentTasks.length} dependent tasks`);

        for (const task of dependentTasks) {
            console.log(`[TaskExecution] Evaluating Task ${task.projectSequence}...`);

            const check = areTaskDependenciesMet(task, allTasks);
            console.log(`[TaskExecution] Dependency Check Result:`, check);

            if (check.met) {
                console.log(`[TaskExecution] Triggering Task ${task.projectSequence}`);
                // Execute!
                await executeCallback(
                    task.projectId,
                    task.projectSequence,
                    `dependency-completion:${completedTaskSequence}`
                );
            }
        }
    } catch (error) {
        console.error('[TaskExecution] Error checking dependent tasks:', error);
    }
}
