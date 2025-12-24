/**
 * Macro Resolver for Script Tasks
 *
 * Resolves macro placeholders in script code before execution
 * Supports: {{task.N}}, {{prev}}, {{prev.N}}, {{project.name}}, etc.
 */

import { db } from '../database/client';
import { tasks, projects } from '../database/schema';
import { eq, sql } from 'drizzle-orm';
import type { Task } from '@core/types/database';

/**
 * Resolve macro patterns like {{prev}}, {{prev.N}}, {{task.N}} in code
 */
export async function resolveMacrosInCode(
    code: string,
    task: Task,
    projectId: number
): Promise<string> {
    let resolved = code;

    // Get project data
    const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const projectData = project[0];

    // 1. Resolve {{project.field}} macros
    if (projectData) {
        resolved = resolved.replace(/\{\{project\.name\}\}/g, JSON.stringify(projectData.title));
        resolved = resolved.replace(
            /\{\{project\.description\}\}/g,
            JSON.stringify(projectData.description || '')
        );
        resolved = resolved.replace(
            /\{\{project\.baseDevFolder\}\}/g,
            JSON.stringify(projectData.baseDevFolder || '')
        );
    }

    // 2. Get all previously completed tasks (in execution order)
    const allPreviousTasks = await db
        .select()
        .from(tasks)
        .where(
            sql`${tasks.projectId} = ${projectId} AND ${tasks.id} < ${task.id} AND ${tasks.status} = 'done'`
        );

    const previousTasks = allPreviousTasks.sort((a, b) => a.id - b.id);

    console.log(
        `[MacroResolver] Found ${previousTasks.length} previously completed tasks for task ${task.id}`
    );

    // Helper to extract result
    const getTaskResult = (task: any): string | null => {
        if (task.executionResult && typeof task.executionResult === 'object') {
            if (task.executionResult.content) {
                return task.executionResult.content;
            }
        }
        return task.result || null;
    };

    // Helper to check if position is inside quotes
    const isInsideQuotes = (text: string, position: number): boolean => {
        const before = text.substring(0, position);
        const doubleQuotes = (before.match(/"/g) || []).length;
        return doubleQuotes % 2 === 1;
    };

    // Helper to format value based on context
    const formatValue = (value: any, insideQuotes: boolean): string => {
        if (value === null || value === undefined) {
            return 'null';
        }
        if (insideQuotes) {
            if (typeof value === 'string') {
                return value
                    .replace(/\\/g, '\\\\')
                    .replace(/"/g, '\\"')
                    .replace(/'/g, "\\'")
                    .replace(/\n/g, '\\n')
                    .replace(/\r/g, '\\r')
                    .replace(/\t/g, '\\t');
            }
            return String(value);
        } else {
            // Outside quotes: for code injection, return raw string
            if (typeof value === 'string') {
                return value; // Insert code as-is
            }
            return JSON.stringify(value); // For numbers, objects, etc.
        }
    };

    // 3. Resolve {{prev}} and {{prev.N}} macros using simple string replacement
    if (previousTasks.length > 0) {
        // {{prev}} = last completed task
        const lastTask = previousTasks[previousTasks.length - 1];
        const lastResult = getTaskResult(lastTask);
        console.log(`[MacroResolver] {{prev}} = task ${lastTask.id}:`, lastResult);

        // Simple string replacement - find all {{prev}} in the code
        const prevMatches = Array.from(code.matchAll(/\{\{prev\}\}/g));
        for (const match of prevMatches) {
            const matchPos = match.index!;
            const insideQuotes = isInsideQuotes(code, matchPos);
            const replacement = formatValue(lastResult, insideQuotes);
            resolved = resolved.replace('{{prev}}', replacement);
        }

        // {{prev.N}} where N is 0, 1, 2, etc.
        // prev.0 = last (same as prev), prev.1 = 2nd last, prev.2 = 3rd last
        for (let i = 0; i < previousTasks.length; i++) {
            const index = previousTasks.length - 1 - i;
            if (index >= 0) {
                const prevTask = previousTasks[index];
                const prevResult = getTaskResult(prevTask);
                const macroPattern = `{{prev.${i}}}`;

                console.log(`[MacroResolver] ${macroPattern} = task ${prevTask.id}:`, prevResult);

                // Find all occurrences of this macro
                const matches = Array.from(
                    code.matchAll(
                        new RegExp(macroPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
                    )
                );
                for (const match of matches) {
                    const matchPos = match.index!;
                    const insideQuotes = isInsideQuotes(code, matchPos);
                    const replacement = formatValue(prevResult, insideQuotes);
                    resolved = resolved.replace(macroPattern, replacement);
                }
            }
        }
    }

    // 4. Resolve {{task.N}} macros (N = projectSequence within project)
    const taskMacroPattern = /\{\{task\.(\d+)(?:\.(\w+))?\}\}/g;
    const taskMatches = Array.from(code.matchAll(taskMacroPattern));

    for (const match of taskMatches) {
        const [fullMatch, sequenceStr, field] = match;
        const sequenceNum = Number(sequenceStr);
        const matchPos = match.index!;

        try {
            // Use projectSequence directly (1-based)
            // {{task.1}} = first task (projectSequence=1), {{task.2}} = second task (projectSequence=2)
            const targetTask = await db
                .select()
                .from(tasks)
                .where(
                    sql`${tasks.projectId} = ${projectId} AND ${tasks.projectSequence} = ${sequenceNum}`
                )
                .limit(1);

            console.log(
                `[MacroResolver] Looking for {{task.${sequenceNum}}} (projectSequence=${sequenceNum}):`,
                targetTask[0] ? `found id=${targetTask[0].id}` : 'NOT FOUND'
            );

            if (targetTask[0]) {
                let value;
                if (field) {
                    value = (targetTask[0] as any)[field];
                } else {
                    value = getTaskResult(targetTask[0]);
                }

                console.log(`[MacroResolver] Replacing ${fullMatch} with:`, value);

                const insideQuotes = isInsideQuotes(code, matchPos);
                const replacement = formatValue(value, insideQuotes);
                resolved = resolved.replace(fullMatch, replacement);
            } else {
                resolved = resolved.replace(fullMatch, 'null');
            }
        } catch (error) {
            console.error(`Failed to resolve macro ${fullMatch}:`, error);
            resolved = resolved.replace(fullMatch, 'null');
        }
    }

    return resolved;
}

/**
 * Prepare macro data for VM context injection
 */
export async function prepareMacroData(
    task: Task,
    projectId: number
): Promise<Record<string, any>> {
    const macroData: Record<string, any> = {};

    // Get project data
    const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    const projectData = project[0];

    if (projectData) {
        macroData.project = {
            name: projectData.title,
            description: projectData.description || '',
            baseDevFolder: projectData.baseDevFolder || '',
        };
    }

    // Get all previously completed tasks
    const allPreviousTasks = await db
        .select()
        .from(tasks)
        .where(
            sql`${tasks.projectId} = ${projectId} AND ${tasks.id} < ${task.id} AND ${tasks.status} = 'done'`
        );

    const previousTasks = allPreviousTasks.sort((a, b) => a.id - b.id);

    const getResult = (t: any) => {
        if (
            t.executionResult &&
            typeof t.executionResult === 'object' &&
            t.executionResult.content
        ) {
            return t.executionResult.content;
        }
        return t.result || null;
    };

    console.log(`[MacroResolver] prepareMacroData: Found ${previousTasks.length} previous tasks`);

    if (previousTasks.length > 0) {
        const lastTask = previousTasks[previousTasks.length - 1];
        macroData.prev = getResult(lastTask);

        // prev_0, prev_1, prev_2, etc.
        for (let i = 0; i < previousTasks.length; i++) {
            const index = previousTasks.length - 1 - i;
            if (index >= 0) {
                macroData[`prev_${i}`] = getResult(previousTasks[index]);
                console.log(
                    `[MacroResolver] prepareMacroData: prev_${i} = task ${previousTasks[index].id}:`,
                    macroData[`prev_${i}`]
                );
            }
        }
    }

    // Support task_N (projectSequence-based)
    if (task.scriptCode) {
        const taskSequencePattern = /\btask_(\d+)\b/g;
        const taskSequenceMatches = Array.from(task.scriptCode.matchAll(taskSequencePattern));
        const uniqueSequences = [...new Set(taskSequenceMatches.map((m) => Number(m[1])))];

        for (const sequenceNum of uniqueSequences) {
            const targetTask = await db
                .select()
                .from(tasks)
                .where(
                    sql`${tasks.projectId} = ${projectId} AND ${tasks.projectSequence} = ${sequenceNum}`
                )
                .limit(1);

            if (targetTask[0]) {
                macroData[`task_${sequenceNum}`] = getResult(targetTask[0]);
            }
        }
    }

    return macroData;
}
