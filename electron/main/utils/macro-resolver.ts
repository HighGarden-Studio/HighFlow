/**
 * Macro Resolver for Script Tasks
 *
 * Resolves macro placeholders in script code before execution
 * Supports: {{task:N}}, {{task:N.output}}, {{project.*}}, etc.
 */

import { db } from '../database/client';
import { tasks, projects } from '../database/schema';
import { eq } from 'drizzle-orm';

interface MacroContext {
    taskId: number;
    projectId: number;
}

/**
 * Resolve all macros in the given code
 */
export async function resolveMacros(code: string, context: MacroContext): Promise<string> {
    let resolved = code;

    // Get project data
    const project = await db
        .select()
        .from(projects)
        .where(eq(projects.id, context.projectId))
        .limit(1);

    const projectData = project[0];

    // Resolve project macros
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

    // Resolve task result macros: {{task:N}} or {{task:N.property}}
    const taskPattern = /\{\{task:(\d+)(?:\.(\w+))?\}\}/g;
    const matches = [...code.matchAll(taskPattern)];

    for (const match of matches) {
        const [fullMatch, targetTaskIdStr, property] = match;
        const targetTaskId = Number(targetTaskIdStr);

        try {
            const targetTask = await db
                .select()
                .from(tasks)
                .where(eq(tasks.id, targetTaskId))
                .limit(1);

            if (targetTask[0]) {
                const task = targetTask[0];
                let value: any;

                if (property) {
                    // Specific property: {{task:N.output}}, {{task:N.status}}, etc.
                    value = (task as any)[property];
                } else {
                    // Whole result: {{task:N}}
                    value = task.result || task.generatedPrompt || '';
                }

                // Replace with JSON-encoded value
                resolved = resolved.replace(fullMatch, JSON.stringify(value));
            } else {
                // Task not found - replace with null
                resolved = resolved.replace(fullMatch, 'null');
            }
        } catch (error) {
            console.error(`Failed to resolve macro ${fullMatch}:`, error);
            resolved = resolved.replace(fullMatch, 'null');
        }
    }

    return resolved;
}
