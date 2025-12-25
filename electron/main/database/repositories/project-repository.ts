/**
 * Project Repository
 *
 * Data access layer for projects with comprehensive query methods
 */

import { db } from '../client';
import { projects, projectMembers, tasks, type Project, type NewProject } from '../schema';
import { eq, desc, and, sql, or, like, asc, isNull } from 'drizzle-orm';
import type { ProjectStatus, ProjectExportData } from '@core/types/database';

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
                          where: (tasks, { isNull }) => isNull(tasks.deletedAt),
                          orderBy: (tasks, { asc }) => [asc(tasks.order)],
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

    /**
     * Find projects by owner
     */
    async findByOwner(ownerId: number): Promise<Project[]> {
        return await db
            .select()
            .from(projects)
            .where(and(eq(projects.ownerId, ownerId), eq(projects.isArchived, false)))
            .orderBy(desc(projects.updatedAt));
    }

    /**
     * Find projects by team
     */
    async findByTeam(teamId: number): Promise<Project[]> {
        return await db
            .select()
            .from(projects)
            .where(and(eq(projects.teamId, teamId), eq(projects.isArchived, false)))
            .orderBy(desc(projects.updatedAt));
    }

    /**
     * Find projects by status
     */
    async findByStatus(status: ProjectStatus): Promise<Project[]> {
        return await db
            .select()
            .from(projects)
            .where(and(eq(projects.status, status), eq(projects.isArchived, false)))
            .orderBy(desc(projects.updatedAt));
    }

    /**
     * Find favorite projects for a user
     */
    async findFavorites(userId: number): Promise<Project[]> {
        return await db
            .select()
            .from(projects)
            .where(and(eq(projects.ownerId, userId), eq(projects.isFavorite, true)))
            .orderBy(desc(projects.updatedAt));
    }

    /**
     * Find archived projects
     */
    async findArchived(userId: number): Promise<Project[]> {
        return await db
            .select()
            .from(projects)
            .where(and(eq(projects.ownerId, userId), eq(projects.isArchived, true)))
            .orderBy(desc(projects.archivedAt));
    }

    /**
     * Search projects by title or description
     */
    async search(query: string, userId: number): Promise<Project[]> {
        const searchPattern = `%${query}%`;
        return await db
            .select()
            .from(projects)
            .where(
                and(
                    eq(projects.ownerId, userId),
                    eq(projects.isArchived, false),
                    or(
                        like(projects.title, searchPattern),
                        like(projects.description, searchPattern)
                    )
                )
            )
            .orderBy(desc(projects.updatedAt));
    }

    /**
     * Create new project
     */
    async create(data: NewProject): Promise<Project> {
        const result = await db
            .insert(projects)
            .values({
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        if (!result[0]) {
            throw new Error('Failed to create project');
        }

        return result[0];
    }

    /**
     * Update existing project
     */
    async update(id: number, data: Partial<Project>): Promise<Project> {
        const result = await db
            .update(projects)
            .set({
                ...data,
                updatedAt: new Date(),
            })
            .where(eq(projects.id, id))
            .returning();

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
    async exportProject(id: number): Promise<ProjectExportData> {
        const project = await this.findById(id);
        if (!project) {
            throw new Error('Project not found');
        }

        // Fetch all tasks
        const allTasks = await db
            .select()
            .from(tasks)
            .where(and(eq(tasks.projectId, id), isNull(tasks.deletedAt)))
            .orderBy(asc(tasks.order));

        // Map tasks to export format
        const exportTasks = allTasks.map((task) => {
            const { id, projectId, assigneeId, createdAt, updatedAt, dependencies, ...rest } = task;
            return {
                ...rest,
                tempId: id, // Keep original ID as tempId for dependency mapping
                dependencies: dependencies || [], // Use existing dependencies array
            };
        });

        const {
            id: _id,
            ownerId: _ownerId,
            teamId: _teamId,
            createdAt: _createdAt,
            updatedAt: _updatedAt,
            ...projectRest
        } = project;

        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            project: projectRest,
            tasks: exportTasks,
        };
    }

    /**
     * Import project from JSON
     */
    async importProject(data: ProjectExportData, ownerId: number): Promise<Project> {
        // 1. Create Project
        const newProject = await this.create({
            ...data.project,
            ownerId,
            title: `${data.project.title} (Imported)`, // Avoid name collision
        });

        // 2. Create Tasks and Build ID Map
        const idMap = new Map<number, number>(); // tempId -> newId

        // First pass: Create tasks without dependencies
        for (const taskData of data.tasks) {
            const { tempId, dependencies, ...rest } = taskData;

            const [newTask] = await db
                .insert(tasks)
                .values({
                    ...rest,
                    projectId: newProject.id,
                    assigneeId: null, // Reset assignee
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    dependencies: [], // Set empty first
                })
                .returning();

            idMap.set(tempId, newTask.id);
        }

        // Second pass: Update dependencies
        for (const taskData of data.tasks) {
            const newId = idMap.get(taskData.tempId);
            if (!newId) continue;

            const newDependencies = taskData.dependencies
                .map((oldId) => idMap.get(oldId))
                .filter((id): id is number => id !== undefined);

            if (newDependencies.length > 0) {
                await db
                    .update(tasks)
                    .set({ dependencies: newDependencies })
                    .where(eq(tasks.id, newId));
            }
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
