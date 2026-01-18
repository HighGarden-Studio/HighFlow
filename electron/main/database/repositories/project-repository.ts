/**
 * Project Repository
 *
 * Data access layer for projects with comprehensive query methods
 */

import { db } from '../client';
import {
    projects,
    projectMembers,
    tasks,
    operators,
    type Project,
    type NewProject,
} from '../schema';
import { eq, desc, and, sql, asc, isNull, inArray } from 'drizzle-orm';
import type {
    ProjectStatus,
    ProjectExportData,
    CleanTaskExport,
    OperatorExport,
} from '@core/types/database';

export class ProjectRepository {
    /**
     * Find all projects (not archived)
     */
    async findAll(filters?: { status?: ProjectStatus; isArchived?: boolean }): Promise<Project[]> {
        const conditions = [eq(projects.isArchived, filters?.isArchived ?? false)];

        if (filters?.status) {
            conditions.push(eq(projects.status, filters.status));
        }

        return await db
            .select()
            .from(projects)
            .where(and(...conditions))
            .orderBy(desc(projects.updatedAt));
    }

    /**
     * Find project by ID with optional relations
     */
    async findById(
        id: number,
        options?: {
            includeTasks?: boolean;
            includeMembers?: boolean;
            includeOwner?: boolean;
        }
    ): Promise<Project | undefined> {
        if (!options || Object.keys(options).length === 0) {
            // Simple query without relations
            const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
            return result[0];
        }

        // Query with relations using Drizzle's relational queries
        const result = await db.query.projects.findFirst({
            where: eq(projects.id, id),
            with: {
                tasks: options.includeTasks
                    ? {
                          where: (tasks: any, { isNull }: any) => isNull(tasks.deletedAt),
                          orderBy: (tasks: any, { asc }: any) => [asc(tasks.order)],
                      }
                    : undefined,
                members: options.includeMembers
                    ? {
                          with: {
                              user: true,
                          },
                      }
                    : undefined,
                owner: options.includeOwner ? true : undefined,
            },
        });

        return result;
    }
    // ...
    /**
     * Create new project
     */
    async create(data: NewProject): Promise<Project> {
        const result = (await db
            .insert(projects)
            .values({
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning()) as Project[];

        if (!result[0]) {
            throw new Error('Failed to create project');
        }

        return result[0];
    }

    /**
     * Update existing project
     */
    async update(id: number, data: Partial<Project>): Promise<Project> {
        const result = (await db
            .update(projects)
            .set({
                ...data,
                updatedAt: new Date(),
            })
            .where(eq(projects.id, id))
            .returning()) as Project[];

        if (!result[0]) {
            throw new Error('Project not found');
        }

        return result[0];
    }

    /**
     * Archive project (soft delete)
     */
    async archive(id: number): Promise<Project> {
        return await this.update(id, {
            isArchived: true,
            archivedAt: new Date(),
        });
    }

    /**
     * Restore archived project
     */
    async restore(id: number): Promise<Project> {
        return await this.update(id, {
            isArchived: false,
            archivedAt: null,
        });
    }

    /**
     * Toggle favorite status
     */
    async toggleFavorite(id: number): Promise<Project> {
        const project = await this.findById(id);
        if (!project) {
            throw new Error('Project not found');
        }

        return await this.update(id, {
            isFavorite: !project.isFavorite,
        });
    }

    /**
     * Delete project permanently
     */
    async delete(id: number): Promise<void> {
        await db.delete(projects).where(eq(projects.id, id));
    }

    /**
     * Add member to project
     */
    async addMember(
        projectId: number,
        userId: number,
        role: 'admin' | 'member' | 'viewer' = 'member'
    ): Promise<void> {
        await db.insert(projectMembers).values({
            projectId,
            userId,
            role,
            joinedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }

    /**
     * Remove member from project
     */
    async removeMember(projectId: number, userId: number): Promise<void> {
        await db
            .delete(projectMembers)
            .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    }

    /**
     * Get project members
     */
    async getMembers(projectId: number) {
        return await db.query.projectMembers.findMany({
            where: eq(projectMembers.projectId, projectId),
            with: {
                user: true,
            },
        });
    }

    /**
     * Check if user is project member
     */
    async isMember(projectId: number, userId: number): Promise<boolean> {
        const result = await db
            .select()
            .from(projectMembers)
            .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
            .limit(1);

        return result.length > 0;
    }

    /**
     * Get project statistics
     */
    async getStatistics(projectId: number): Promise<{
        totalTasks: number;
        completedTasks: number;
        inProgressTasks: number;
        todoTasks: number;
        totalCost: number;
        actualHours: number;
    }> {
        const result = await db.all<any>(sql`
      SELECT
        COUNT(*) as totalTasks,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completedTasks,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as inProgressTasks,
        SUM(CASE WHEN status = 'todo' THEN 1 ELSE 0 END) as todoTasks,
        COALESCE(SUM(actual_cost), 0) as totalCost,
        COALESCE(SUM(actual_minutes), 0) / 60.0 as actualHours
      FROM tasks
      WHERE project_id = ${projectId} AND deleted_at IS NULL
    `);

        const stats = result[0] as any;

        return {
            totalTasks: Number(stats.totalTasks) || 0,
            completedTasks: Number(stats.completedTasks) || 0,
            inProgressTasks: Number(stats.inProgressTasks) || 0,
            todoTasks: Number(stats.todoTasks) || 0,
            totalCost: Number(stats.totalCost) || 0,
            actualHours: Number(stats.actualHours) || 0,
        };
    }

    /**
     * Update project total cost (aggregate from tasks)
     */
    async updateTotalCost(projectId: number): Promise<void> {
        const stats = await this.getStatistics(projectId);
        await this.update(projectId, {
            totalCost: stats.totalCost,
            actualHours: stats.actualHours,
        });
    }

    /**
     * Get projects with task counts
     */
    async findAllWithCounts(userId: number) {
        const result = await db.all<any>(sql`
      SELECT
        p.*,
        COUNT(t.id) as taskCount,
        SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) as completedTaskCount
      FROM projects p
      LEFT JOIN tasks t ON t.project_id = p.id AND t.deleted_at IS NULL
      WHERE p.owner_id = ${userId} AND p.is_archived = false
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `);

        return result;
    }

    /**
     * Duplicate project (without tasks by default)
     */
    async duplicate(
        id: number,
        options?: {
            includeTasks?: boolean;
            newTitle?: string;
        }
    ): Promise<Project> {
        const original = await this.findById(id);
        if (!original) {
            throw new Error('Project not found');
        }

        // Create new project
        const newProject = await this.create({
            title: options?.newTitle || `${original.title} (Copy)`,
            description: original.description,
            mainPrompt: original.mainPrompt,
            status: 'active',
            aiProvider: original.aiProvider,
            templateId: original.templateId,
            coverImage: original.coverImage,
            color: original.color,
            emoji: original.emoji,
            estimatedHours: original.estimatedHours,
            ownerId: original.ownerId,
            teamId: original.teamId,
            gitRepository: null, // Don't copy git repo
        });

        // TODO: Copy tasks if includeTasks is true
        if (options?.includeTasks) {
            // This would be implemented by TaskRepository
        }

        return newProject;
    }

    /**
     * Export project data to JSON
     */
    /**
     * Export project data to JSON
     */
    async exportProject(id: number): Promise<ProjectExportData> {
        const project = await this.findById(id);
        if (!project) {
            throw new Error('Project not found');
        }

        // 1. Fetch all tasks
        const allTasks = await db
            .select()
            .from(tasks)
            .where(and(eq(tasks.projectId, id), isNull(tasks.deletedAt)))
            .orderBy(asc(tasks.order));

        // 2. Collect unique operator IDs
        const operatorIds = new Set<number>();
        allTasks.forEach((task) => {
            if (task.assignedOperatorId) {
                operatorIds.add(task.assignedOperatorId);
            }
        });

        // 3. Fetch operators
        let operatorData: OperatorExport[] = [];
        if (operatorIds.size > 0) {
            const ops = await db
                .select()
                .from(operators)
                .where(inArray(operators.id, Array.from(operatorIds)));

            operatorData = ops.map((op) => ({
                tempId: op.id,
                name: op.name,
                role: op.role,
                avatar: op.avatar,
                color: op.color,
                systemPrompt: op.systemPrompt,
                aiProvider: op.aiProvider,
                aiModel: op.aiModel,
                tags: (op as any).tags || [], // Cast to handle potential schema type mismatch
            }));
        }

        // 4. Clean tasks - strip execution results and force TODO status
        const cleanTasks: CleanTaskExport[] = allTasks.map((task) => ({
            tempId: task.projectSequence, // Use projectSequence as tempId (composite PK, id doesn't exist)
            title: task.title,
            description: task.description,
            taskType: task.taskType as any,
            prompt: task.prompt,
            generatedPrompt: task.generatedPrompt,
            aiProvider: task.aiProvider,
            aiModel: task.aiModel,
            scriptCode: task.scriptCode,
            scriptLanguage: task.scriptLanguage as any,
            inputConfig: task.inputConfig,
            outputFormat: task.outputFormat,
            outputConfig: task.outputConfig,
            mcpConfig: sanitizeMcpConfig(task.mcpConfig),
            requiredMCPs: task.requiredMCPs || [],
            notificationConfig: task.notificationConfig,
            assignedOperatorId: task.assignedOperatorId,
            order: task.order,
            projectSequence: task.projectSequence,
            tags: task.tags,
            triggerConfig: task.triggerConfig,
            dependsOn: task.dependencies || [],
            autoReview: task.autoReview ?? false,
            autoApprove: task.autoApprove ?? false,
            reviewAiProvider: task.reviewAiProvider,
            reviewAiModel: task.reviewAiModel,
            status: 'todo', // Always export as TODO
        }));

        const {
            id: _id,
            ownerId: _ownerId,
            teamId: _teamId,
            createdAt: _createdAt,
            updatedAt: _updatedAt,
            ...projectRest
        } = project;

        return {
            version: '0.1.0', // Fixed: Hardcoded to match package.json as app.getVersion() returns Electron version in some envs
            exportedAt: new Date().toISOString(),
            project: {
                title: projectRest.title,
                description: projectRest.description,
                status: projectRest.status as any,
                goal: projectRest.goal,
                goals: projectRest.goal, // Deprecated map
                baseDevFolder: projectRest.baseDevFolder,
                tags: projectRest.tags as string[] | null,
                mainPrompt: projectRest.mainPrompt,
                aiProvider: projectRest.aiProvider,
                aiModel: projectRest.aiModel,
                aiOptimizedPrompt: projectRest.aiOptimizedPrompt,
                outputType: projectRest.outputType,
                outputPath: projectRest.outputPath,
                mcpConfig: sanitizeMcpConfig(projectRest.mcpConfig as any),
                requiredMCPs: projectRest.requiredMCPs as string[] | null,
                notificationConfig: projectRest.notificationConfig as any,
            },
            tasks: cleanTasks,
            operators: operatorData,
        };
    }

    /**
     * Import project from JSON
     */
    /**
     * Import project from JSON
     */
    async importProject(data: ProjectExportData, ownerId: number): Promise<Project> {
        // 1. Create Project
        const newProject = await this.create({
            title: `${data.project.title} (Imported)`,
            description: data.project.description,
            status: 'active',
            goal: data.project.goal || null,
            baseDevFolder: data.project.baseDevFolder || null,
            tags: data.project.tags || [],
            ownerId,
            // Import specific fields
            mainPrompt: data.project.mainPrompt || null,
            aiProvider: data.project.aiProvider || null,
            aiModel: data.project.aiModel || null,
            aiOptimizedPrompt: data.project.aiOptimizedPrompt || null,
            outputType: data.project.outputType || null,
            outputPath: data.project.outputPath || null,
            mcpConfig: data.project.mcpConfig || null,
            notificationConfig: data.project.notificationConfig || null,

            // Defaults for other fields
            templateId: null,
            coverImage: null,
            color: null,
            emoji: null,
            estimatedHours: null,
            teamId: null,
            gitRepository: null,
        });

        // 2. Import Operators & Build ID Map
        const operatorIdMap = new Map<number, number>();
        if (data.operators && data.operators.length > 0) {
            for (const opData of data.operators) {
                const { tempId, ...rest } = opData;
                // Check if similar operator already exists (optional, keeping it simple for now by creating new ones)
                const result = (await db
                    .insert(operators)
                    .values({
                        ...rest,
                        // Ensure non-nullable fields have defaults
                        role: rest.role || 'assistant',
                        aiProvider: rest.aiProvider || 'openai', // Default to openai if missing
                        aiModel: rest.aiModel || 'gpt-4o', // Default model
                        tags: (rest.tags || []) as string[],
                        projectId: newProject.id, // Assign to new project
                        createdAt: new Date(),
                        updatedAt: new Date(),
                    })
                    .returning()) as unknown[];

                const newOp = result[0] as any; // Cast as any or Operator, simplified for now
                operatorIdMap.set(tempId, newOp.id);
            }
        }

        // 3. Create Tasks
        // Tasks use composite PK (projectId, projectSequence).
        // Dependencies are array of sequences (or IDs if legacy, but we assume sequences now).
        // Since we preserve projectSequence, we don't need to remap dependencies if they refer to sequences.

        for (const taskData of data.tasks) {
            const { tempId: _tempId, dependsOn, assignedOperatorId, ...rest } = taskData;

            // Remap operator ID
            const newOperatorId = assignedOperatorId
                ? operatorIdMap.get(assignedOperatorId) || null
                : null;

            await db.insert(tasks).values({
                ...rest,
                projectId: newProject.id,
                projectSequence: rest.projectSequence, // Keep original sequence
                assignedOperatorId: newOperatorId,
                assigneeId: null, // Reset assignee
                status: 'todo', // Ensure todo status
                dependencies: dependsOn || [], // Keep dependencies as is
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        }

        return newProject;
    }

    /**
     * Reset project results (clear statistics and memory)
     */
    async resetResults(projectId: number): Promise<void> {
        await db
            .update(projects)
            .set({
                totalCost: 0,
                totalTokens: 0,
                actualHours: 0,
                memory: null,
                updatedAt: new Date(),
            })
            .where(eq(projects.id, projectId));
    }
}

// Export singleton instance
export const projectRepository = new ProjectRepository();

/**
 * Helper to sanitize MCP configuration
 * Keep keys but strip sensitive values from env and params
 */
function sanitizeMcpConfig(config: any): any {
    if (!config || typeof config !== 'object') return null;

    // Handle Project-style config with 'servers'
    if (config.servers && typeof config.servers === 'object') {
        return {
            ...config,
            servers: sanitizeMcpMap(config.servers),
        };
    }

    // Handle Task-style config with 'tools'
    if (config.tools && typeof config.tools === 'object') {
        return {
            ...config,
            tools: sanitizeMcpMap(config.tools),
        };
    }

    // Fallback: Attempt to sanitize as a direct map
    return sanitizeMcpMap(config);
}

function sanitizeMcpMap(map: Record<string, any>): Record<string, any> {
    const sanitized: any = {};
    for (const [key, entry] of Object.entries(map)) {
        if (!entry || typeof entry !== 'object') {
            sanitized[key] = entry; // Keep primitives
            continue;
        }

        sanitized[key] = { ...(entry as any) };

        // Sanitize 'env' - keep keys, empty values
        if (sanitized[key].env && typeof sanitized[key].env === 'object') {
            const clean: Record<string, string> = {};
            for (const k of Object.keys(sanitized[key].env)) {
                clean[k] = ''; // Strip value
            }
            sanitized[key].env = clean;
        }

        // Sanitize 'params' - keep keys, empty values
        if (sanitized[key].params && typeof sanitized[key].params === 'object') {
            const clean: Record<string, string> = {};
            for (const k of Object.keys(sanitized[key].params)) {
                clean[k] = ''; // Strip value
            }
            sanitized[key].params = clean;
        }
    }
    return sanitized;
}
