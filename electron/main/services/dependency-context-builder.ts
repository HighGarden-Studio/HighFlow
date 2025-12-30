/**
 * DependencyContextBuilder
 *
 * Builds dependency context for task execution by analyzing dependencies
 * and collecting results from completed tasks.
 *
 * CRITICAL: This logic is PRESERVED EXACTLY from the original implementation.
 * Image attachment extraction, macro scanning, and result formatting remain unchanged.
 */

import type { Task } from '../../../src/core/types/database';
import type { TaskResult } from '../../../src/services/workflow/types';
import { taskRepository } from '../database/repositories/task-repository';
import { DependencyEvaluator } from './DependencyEvaluator';

/**
 * Extract dependency task IDs and their execution results for macro substitution/context passing
 * recursively (up to depth 5) to support deep history macros like {{prev-1}}
 *
 * THIS FUNCTION Logic IS PRESERVED EXACTLY - NO MODIFICATIONS TO:
 * - Image attachment extraction (lines 199-211 in original)
 * - Macro scanning and resolution
 * - Result formatting and sorting
 */
export async function buildDependencyContext(
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

    // 1.5 Scan Prompt for Macros ({{task.N}}) and add them to dependencies
    // This allows ad-hoc references even if not in explicit dependsOn
    const promptText = (task.description || '') + (task.generatedPrompt || '');
    const macroRegex = /\{\{task\.(\d+)\}\}/g;
    let match;
    // We need to resolve Sequence -> ID if needed, so we might need all tasks
    // To be efficient, we'll collect potential IDs/Sequences first
    const potentialRefs = new Set<number>();
    while ((match = macroRegex.exec(promptText)) !== null) {
        const val = parseInt(match[1], 10);
        if (!isNaN(val)) potentialRefs.add(val);
    }

    if (potentialRefs.size > 0) {
        // Fetch all project tasks to resolve sequences
        const allTasks = await taskRepository.findByProject(task.projectId);
        potentialRefs.forEach((ref) => {
            // Try Sequence
            const seqMatch = allTasks.find((t) => t.projectSequence === ref);
            if (seqMatch) {
                directDeps.add(seqMatch.id);
                console.log(
                    `[DependencyContext] Found macro {{task.${ref}}} -> Resolved to Task ID ${seqMatch.id}`
                );
            } else {
                // Try ID
                const idMatch = allTasks.find((t) => t.id === ref);
                if (idMatch) {
                    directDeps.add(idMatch.id);
                    console.log(
                        `[DependencyContext] Found macro {{task.${ref}}} -> Resolved to Task ID ${idMatch.id}`
                    );
                }
            }
        });
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
            console.log(
                `[DependencyContext] Checking Task ${id}: status=${depTask.status}, hasResult=${!!depTask.executionResult}`
            );

            // Allow results if task is done OR has a result (e.g., in_progress re-run in loop)
            if (depTask.executionResult) {
                try {
                    const execResult =
                        typeof depTask.executionResult === 'string'
                            ? JSON.parse(depTask.executionResult)
                            : depTask.executionResult;

                    const now = new Date();
                    resultsMap.set(id, {
                        taskId: depTask.id,
                        projectSequence: depTask.projectSequence,
                        taskTitle: depTask.title,
                        status: 'success',
                        output: execResult.content || execResult,
                        startTime: depTask.startedAt || now,
                        endTime: depTask.completedAt || now, // Crucial for sorting
                        duration: execResult.duration || 0,
                        retries: 0,
                        // Fix for Image Input Injection: Explicitly extract attachments
                        // Input Tasks store attachments in metadata.attachments
                        // AI Tasks store attachments in top-level attachments (sometimes) or we need to normalize
                        attachments:
                            execResult.attachments || execResult.metadata?.attachments || [],
                        metadata: {
                            provider: execResult.provider,
                            model: execResult.model,
                            files: execResult.files,
                            // Preserve original attachments in metadata too just in case
                            attachments:
                                execResult.attachments || execResult.metadata?.attachments || [],
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
 * Helper: Resolve expression containing Project Sequences or Task IDs to strictly Task IDs
 * Returns the resolved expression and the set of Task IDs found.
 */
export function resolveExpressionToIds(
    expression: string,
    allTasks: any[]
): { resolvedExpression: string; referencedIds: Set<number> } {
    if (!expression || !expression.trim()) {
        return { resolvedExpression: '', referencedIds: new Set() };
    }

    const referencedIds = new Set<number>();

    // Replace all numbers in the expression
    // We assume numbers are Project Sequences first, then Task IDs
    const resolvedExpression = expression.replace(/\b\d+\b/g, (match) => {
        const val = parseInt(match, 10);

        // 1. Try to find by Project Sequence
        const taskBySeq = allTasks.find((t) => t.projectSequence === val);
        if (taskBySeq) {
            referencedIds.add(taskBySeq.id);
            return taskBySeq.id.toString();
        }

        // 2. Fallback: Check if it matches a Task ID directly
        const taskById = allTasks.find((t) => t.id === val);
        if (taskById) {
            referencedIds.add(taskById.id);
            return val.toString();
        }

        // 3. No match found - keep original (will likely fail evaluation but preserves intent)
        return match;
    });

    return { resolvedExpression, referencedIds };
}

/**
 * Helper: Check if task dependencies are met (Robust Logic with Novelty Check)
 * @param ignoreNovelty If true, bypasses the "New Event" check (used for manual execution)
 */
export function areTaskDependenciesMet(
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
    let dependencyTaskIds = (dependsOn.taskIds as number[]) || [];

    // Resolve Expression if present
    let resolvedExpression = '';
    if (originalExpression && originalExpression.trim().length > 0) {
        const resolution = resolveExpressionToIds(originalExpression, allTasks);
        resolvedExpression = resolution.resolvedExpression;
        // Merge referenced IDs from expression into dependencyTaskIds for info gathering
        resolution.referencedIds.forEach((id) => {
            if (!dependencyTaskIds.includes(id)) {
                dependencyTaskIds.push(id);
            }
        });
    }

    // 1. Prepare Dependency Data for Evaluator
    const dependencyInfo = allTasks
        .filter((t) => dependencyTaskIds.includes(t.id))
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
            if (!allDone) details = `Waiting for: ${incomplete.map((t: any) => t.id).join(', ')}`;
            else details = 'All done but no new events (stale)';
        }

        return { met, reason: met ? undefined : 'Conditions not met', details };
    }
}
