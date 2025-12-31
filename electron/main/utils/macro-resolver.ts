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

    // 2. Get dependency chain tasks (only tasks this task depends on)
    let dependencyTaskIds: number[] = [];

    // Parse dependencies from triggerConfig (where UI stores them)
    if (task.triggerConfig) {
        try {
            const config =
                typeof task.triggerConfig === 'string'
                    ? JSON.parse(task.triggerConfig)
                    : task.triggerConfig;
            // Check dependsOn.taskIds (actual structure from UI)
            if (config.dependsOn?.taskIds && Array.isArray(config.dependsOn.taskIds)) {
                dependencyTaskIds = config.dependsOn.taskIds;
            }
        } catch (e) {
            console.warn('[MacroResolver] Failed to parse triggerConfig:', e);
        }
    }

    // Fallback: also check task.dependencies field (legacy)
    if (dependencyTaskIds.length === 0 && task.dependencies) {
        try {
            const deps =
                typeof task.dependencies === 'string'
                    ? JSON.parse(task.dependencies)
                    : task.dependencies;
            dependencyTaskIds = Array.isArray(deps) ? deps : [];
        } catch (e) {
            console.warn('[MacroResolver] Failed to parse dependencies:', e);
        }
    }

    // Build readable dependency list with projectSequence
    const dependencySeqList =
        dependencyTaskIds.length > 0
            ? await (async () => {
                  const depTasks = await db
                      .select()
                      .from(tasks)
                      .where(
                          sql`${tasks.projectId} = ${projectId} AND ${tasks.projectSequence} IN (${sql.join(
                              dependencyTaskIds.map((seqId) => sql`${seqId}`),
                              sql`, `
                          )})`
                      );
                  return depTasks.map((t) => `#${t.projectSequence}`).join(', ');
              })()
            : '';

    console.log(`[MacroResolver] Task #${task.projectSequence} depends on: [${dependencySeqList}]`);

    // Fetch only dependency tasks that are completed
    let previousTasks: any[] = [];

    if (dependencyTaskIds.length > 0) {
        const dependencyTasks = await db
            .select()
            .from(tasks)
            .where(
                sql`${tasks.projectId} = ${projectId} AND ${tasks.projectSequence} IN (${sql.join(
                    dependencyTaskIds.map((seqId) => sql`${seqId}`),
                    sql`, `
                )}) AND ${tasks.status} = 'done'`
            );

        // Sort by projectSequence to maintain consistent ordering
        previousTasks = dependencyTasks.sort((a, b) => a.projectSequence - b.projectSequence);

        console.log(
            `[MacroResolver] Found ${previousTasks.length} completed dependency tasks for Task #${task.projectSequence}`
        );
    } else {
        console.log(
            `[MacroResolver] Task #${task.projectSequence} has no dependencies, {{prev}} will be null`
        );
    }

    // Helper to extract result
    const getTaskResult = (task: any): string | null => {
        if (task.executionResult) {
            let result = task.executionResult;
            // If executionResult is a JSON string, parse it
            if (typeof result === 'string') {
                try {
                    result = JSON.parse(result);
                } catch {
                    // If parsing fails, treat as plain text result
                    return result;
                }
            }
            // Check for various output formats
            if (typeof result === 'object') {
                // AI Task format: { content: '...' }
                if (result.content) {
                    return result.content;
                }
                // Input Task format: { kind: 'text', text: '...' }
                if (result.text) {
                    return result.text;
                }
                // Table format: convert to string representation
                if (result.kind === 'table' && result.table) {
                    // Simple CSV-like representation
                    const { columns, rows } = result.table;
                    const header = columns.join(',');
                    const dataRows = rows.map((row: any) =>
                        columns.map((col: string) => row[col] || '').join(',')
                    );
                    return [header, ...dataRows].join('\n');
                }
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

        // For string values, always escape special characters to ensure JavaScript safety
        if (typeof value === 'string') {
            // Escape backslashes first, then other special characters
            const escaped = value
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"')
                .replace(/'/g, "\\'")
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r')
                .replace(/\t/g, '\\t');

            if (insideQuotes) {
                // Already inside quotes: return escaped value as-is
                return escaped;
            } else {
                // Outside quotes: wrap in quotes for JavaScript string literal
                return `"${escaped}"`;
            }
        }

        // For non-string values
        if (insideQuotes) {
            return String(value);
        } else {
            return JSON.stringify(value);
        }
    };

    // 3. Resolve {{prev}} and {{prev.N}} macros using simple string replacement
    if (previousTasks.length > 0) {
        // {{prev}} = last completed task
        const lastTask = previousTasks[previousTasks.length - 1];
        const lastResult = getTaskResult(lastTask);
        console.log(`[MacroResolver] {{prev}} = Task #${lastTask.projectSequence}:`, lastResult);

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

                console.log(
                    `[MacroResolver] ${macroPattern} = Task #${prevTask.projectSequence}:`,
                    prevResult
                );

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

    // Get dependency chain tasks (only tasks this task depends on)
    let dependencyTaskIds: number[] = [];

    // Parse dependencies from triggerConfig (where UI stores them)
    if (task.triggerConfig) {
        try {
            const config =
                typeof task.triggerConfig === 'string'
                    ? JSON.parse(task.triggerConfig)
                    : task.triggerConfig;
            if (config.dependencyTaskIds && Array.isArray(config.dependencyTaskIds)) {
                dependencyTaskIds = config.dependencyTaskIds;
            }
        } catch (e) {
            console.warn('[MacroResolver] prepareMacroData: Failed to parse triggerConfig:', e);
        }
    }

    // Fallback: also check task.dependencies field (legacy)
    if (dependencyTaskIds.length === 0 && task.dependencies) {
        try {
            const deps =
                typeof task.dependencies === 'string'
                    ? JSON.parse(task.dependencies)
                    : task.dependencies;
            dependencyTaskIds = Array.isArray(deps) ? deps : [];
        } catch (e) {
            console.warn('[MacroResolver] prepareMacroData: Failed to parse dependencies:', e);
        }
    }

    let previousTasks: any[] = [];

    if (dependencyTaskIds.length > 0) {
        const dependencyTasks = await db
            .select()
            .from(tasks)
            .where(
                sql`${tasks.projectId} = ${projectId} AND ${tasks.projectSequence} IN (${sql.join(
                    dependencyTaskIds.map((seqId) => sql`${seqId}`),
                    sql`, `
                )}) AND ${tasks.status} = 'done'`
            );

        previousTasks = dependencyTasks.sort((a, b) => a.projectSequence - b.projectSequence);
    }

    const getResult = (t: any) => {
        if (t.executionResult) {
            let result = t.executionResult;
            // If executionResult is a JSON string, parse it
            if (typeof result === 'string') {
                try {
                    result = JSON.parse(result);
                } catch {
                    return result;
                }
            }
            // Check for various output formats
            if (typeof result === 'object') {
                // AI Task format: { content: '...' }
                if (result.content) {
                    return result.content;
                }
                // Input Task format: { kind: 'text', text: '...' }
                if (result.text) {
                    return result.text;
                }
                // Table format: convert to string
                if (result.kind === 'table' && result.table) {
                    const { columns, rows } = result.table;
                    const header = columns.join(',');
                    const dataRows = rows.map((row: any) =>
                        columns.map((col: string) => row[col] || '').join(',')
                    );
                    return [header, ...dataRows].join('\n');
                }
            }
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
                    `[MacroResolver] prepareMacroData: prev_${i} = Task #${previousTasks[index].projectSequence}:`,
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
