/**
 * Task Repository
 *
 * Data access layer for tasks with comprehensive query methods
 */

import { db } from '../client';
import { tasks, type Task, type NewTask } from '../schema';
import { eq, desc, and, asc, isNull, sql } from 'drizzle-orm';
import type { RunResult } from 'better-sqlite3';

function firstRow<T>(result: T[] | RunResult): T | undefined {
    if (Array.isArray(result)) {
        return result[0];
    }
    return undefined;
}

export type TaskStatus =
    | 'todo'
    | 'in_progress'
    | 'needs_approval'
    | 'in_review'
    | 'done'
    | 'blocked';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export class TaskRepository {
    /**
     * Find all tasks for a project
     */
    async findByProject(
        projectId: number,
        filters?: {
            status?: TaskStatus;
            priority?: TaskPriority;
            assigneeId?: number;
            parentTaskId?: number | null;
        }
    ): Promise<Task[]> {
        const conditions = [eq(tasks.projectId, projectId), isNull(tasks.deletedAt)];

        if (filters?.status) {
            conditions.push(eq(tasks.status, filters.status));
        }

        if (filters?.priority) {
            conditions.push(eq(tasks.priority, filters.priority));
        }

        if (filters?.assigneeId) {
            conditions.push(eq(tasks.assigneeId, filters.assigneeId));
        }

        if (filters?.parentTaskId !== undefined) {
            if (filters.parentTaskId === null) {
                conditions.push(isNull(tasks.parentTaskId));
            } else {
                conditions.push(eq(tasks.parentTaskId, filters.parentTaskId));
            }
        }

        return await db
            .select()
            .from(tasks)
            .where(and(...conditions))
            .orderBy(asc(tasks.order), desc(tasks.createdAt));
    }

    /**
     * Find task by ID (DEPRECATED - use findByKey instead)
     * @deprecated Global IDs will be removed. Use findByKey(projectId, projectSequence) instead.
     */
    /**
     * Find task by composite key (projectId, projectSequence)
     */
    async findByKey(projectId: number, projectSequence: number): Promise<Task | undefined> {
        const [result] = await db
            .select()
            .from(tasks)
            .where(
                and(
                    eq(tasks.projectId, projectId),
                    eq(tasks.projectSequence, projectSequence),
                    isNull(tasks.deletedAt)
                )
            )
            .limit(1);

        return result;
    }

    // findByKey already exists and matches the implementation above.
    // I will remove the duplicated findByKey since I replaced findById with it.
    // Wait, the file ALREADY had findByKey at line 88?
    // Step 3650 shows findByKey at line 88.
    // If I replaced findById with findByKey, I now have duplicate findByKey.
    // I should just REMOVE findById and keep the existing findByKey.
    // I'll adjust the chunk to just DELETE findById.

    /**
     * Find all tasks by status (across all projects)
     */
    async findByStatus(status: TaskStatus): Promise<Task[]> {
        return await db
            .select()
            .from(tasks)
            .where(and(eq(tasks.status, status), isNull(tasks.deletedAt)))
            .orderBy(desc(tasks.updatedAt));
    }

    /**
     * Find task with subtasks
     */
    async findWithSubtasks(
        projectId: number,
        projectSequence: number
    ): Promise<(Task & { subtasks: Task[] }) | undefined> {
        const task = await this.findByKey(projectId, projectSequence);
        if (!task) return undefined;

        const subtasks = await db
            .select()
            .from(tasks)
            .where(
                and(
                    eq(tasks.parentProjectId, projectId),
                    eq(tasks.parentSequence, projectSequence),
                    isNull(tasks.deletedAt)
                )
            )
            .orderBy(asc(tasks.order));

        return { ...task, subtasks };
    }

    /**
     * Create new task
     */
    async create(data: NewTask): Promise<Task> {
        // Get max order for the project
        const [maxOrderResult] = await db
            .select({ maxOrder: sql<number>`MAX(${tasks.order})` })
            .from(tasks)
            .where(and(eq(tasks.projectId, data.projectId), isNull(tasks.deletedAt)));

        const maxOrder = maxOrderResult?.maxOrder ?? -1;

        // Get next project sequence number
        const [maxSeqResult] = await db
            .select({ maxSequence: sql<number>`MAX(${tasks.projectSequence})` })
            .from(tasks)
            .where(eq(tasks.projectId, data.projectId));

        const nextSequence = (maxSeqResult?.maxSequence ?? 0) + 1;

        const inserted = await db
            .insert(tasks)
            .values({
                ...data,
                projectSequence: nextSequence, // Auto-assign project-scoped sequence
                // Ensure date fields are Date objects
                dueDate: typeof data.dueDate === 'string' ? new Date(data.dueDate) : data.dueDate,
                order: maxOrder + 1,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        const created = firstRow(inserted);
        if (!created) {
            throw new Error('Failed to create task');
        }

        return created;
    }

    // Removed update(id). Use updateByKey.

    /**
     * Update existing task by composite key
     */
    async updateByKey(
        projectId: number,
        projectSequence: number,
        data: Partial<Task>
    ): Promise<Task> {
        // Ensure date fields are Date objects
        const safeData = { ...data };
        const dateFields = ['dueDate', 'startedAt', 'completedAt', 'pausedAt', 'deletedAt'];

        for (const field of dateFields) {
            if (typeof (safeData as any)[field] === 'string') {
                (safeData as any)[field] = new Date((safeData as any)[field]);
            }
        }

        // Remove ID fields to prevent unique constraint violations
        delete (safeData as any).id;
        delete (safeData as any).projectId;
        delete (safeData as any).projectSequence;

        const updatedResult = await db
            .update(tasks)
            .set({
                ...safeData,
                updatedAt: new Date(),
            })
            .where(and(eq(tasks.projectId, projectId), eq(tasks.projectSequence, projectSequence)))
            .returning();

        const updated = firstRow(updatedResult);
        if (!updated) {
            throw new Error('Task not found');
        }

        return updated;
    }

    // Removed updateStatus(id). Use updateStatusByKey.

    /**
     * Update task status by composite key
     */
    async updateStatusByKey(
        projectId: number,
        projectSequence: number,
        status: TaskStatus
    ): Promise<Task> {
        const updateData: Partial<Task> = { status };

        if (status === 'in_progress') {
            updateData.startedAt = new Date();
        } else if (status === 'done') {
            updateData.completedAt = new Date();
        }

        return await this.updateByKey(projectId, projectSequence, updateData);
    }

    // Removed delete(id). Use deleteByKey.

    /**
     * Soft delete task by composite key
     */
    async deleteByKey(projectId: number, projectSequence: number): Promise<void> {
        await db
            .update(tasks)
            .set({
                deletedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(and(eq(tasks.projectId, projectId), eq(tasks.projectSequence, projectSequence)));
    }

    /**
     * Permanently delete task
     */
    async hardDelete(projectId: number, projectSequence: number): Promise<void> {
        await db
            .delete(tasks)
            .where(and(eq(tasks.projectId, projectId), eq(tasks.projectSequence, projectSequence)));
    }

    /**
     * Restore deleted task
     */
    async restore(projectId: number, projectSequence: number): Promise<Task> {
        return await this.updateByKey(projectId, projectSequence, {
            deletedAt: null,
        });
    }

    /**
     * Reorder tasks within a project
     */
    async reorder(projectId: number, taskSequences: number[]): Promise<void> {
        // Update each task with its new order
        await Promise.all(
            taskSequences.map((seq, index) =>
                db
                    .update(tasks)
                    .set({
                        order: index,
                        updatedAt: new Date(),
                    })
                    .where(and(eq(tasks.projectSequence, seq), eq(tasks.projectId, projectId)))
            )
        );
    }

    /**
     * Move task to different status column (for kanban)
     */
    async moveToColumn(
        projectId: number,
        projectSequence: number,
        status: TaskStatus,
        newOrder: number
    ): Promise<Task> {
        return await this.updateByKey(projectId, projectSequence, {
            status,
            order: newOrder,
        });
    }

    /**
     * Get tasks grouped by status (for kanban view)
     */
    async getGroupedByStatus(projectId: number): Promise<Record<TaskStatus, Task[]>> {
        const allTasks = await this.findByProject(projectId, { parentTaskId: null });

        const grouped: Record<TaskStatus, Task[]> = {
            todo: [],
            in_progress: [],
            needs_approval: [],
            in_review: [],
            done: [],
            blocked: [],
        };

        for (const task of allTasks) {
            const status = task.status as TaskStatus;
            if (grouped[status]) {
                grouped[status].push(task);
            }
        }

        return grouped;
    }

    /**
     * Get subtask count for a task
     */
    async getSubtaskCount(
        projectId: number,
        projectSequence: number
    ): Promise<{ total: number; completed: number }> {
        const result = await db.all<{ total: number; completed: number }>(sql`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed
      FROM tasks
      WHERE parent_project_id = ${projectId} AND parent_sequence = ${projectSequence} AND deleted_at IS NULL
    `);

        return {
            total: Number(result[0]?.total) || 0,
            completed: Number(result[0]?.completed) || 0,
        };
    }

    /**
     * Assign task to user
     */
    async assign(projectId: number, projectSequence: number, userId: number | null): Promise<Task> {
        return await this.updateByKey(projectId, projectSequence, {
            assigneeId: userId,
        });
    }

    /**
     * Set task as blocked
     */
    async setBlocked(
        projectId: number,
        projectSequence: number,
        blockedByProjectId: number | null,
        blockedBySequence: number | null,
        reason?: string
    ): Promise<Task> {
        return await this.updateByKey(projectId, projectSequence, {
            status: 'blocked',
            blockedByProjectId,
            blockedBySequence,
            blockedReason: reason || null,
        });
    }

    /**
     * Unblock task
     */
    async unblock(projectId: number, projectSequence: number): Promise<Task> {
        return await this.updateByKey(projectId, projectSequence, {
            status: 'todo',
            blockedByProjectId: null,
            blockedBySequence: null,
            blockedReason: null,
        });
    }

    /**
     * Get overdue tasks
     */
    async getOverdue(projectId: number): Promise<Task[]> {
        const now = new Date();

        return await db
            .select()
            .from(tasks)
            .where(
                and(
                    eq(tasks.projectId, projectId),
                    isNull(tasks.deletedAt),
                    sql`${tasks.dueDate} < ${now.getTime()}`,
                    sql`${tasks.status} != 'done'`
                )
            )
            .orderBy(asc(tasks.dueDate));
    }

    /**
     * Search tasks by title or description
     */
    async search(projectId: number, query: string): Promise<Task[]> {
        const searchPattern = `%${query}%`;

        return await db
            .select()
            .from(tasks)
            .where(
                and(
                    eq(tasks.projectId, projectId),
                    isNull(tasks.deletedAt),
                    sql`(${tasks.title} LIKE ${searchPattern} OR ${tasks.description} LIKE ${searchPattern})`
                )
            )
            .orderBy(desc(tasks.updatedAt));
    }

    /**
     * Duplicate task
     */
    async duplicate(projectId: number, projectSequence: number, newTitle?: string): Promise<Task> {
        const original = await this.findByKey(projectId, projectSequence);
        if (!original) {
            throw new Error('Task not found');
        }

        return await this.create({
            projectId: original.projectId,
            title: newTitle || `${original.title} (Copy)`,
            description: original.description,
            priority: original.priority,
            estimatedMinutes: original.estimatedMinutes,
            tags: original.tags,
            parentProjectId: original.parentProjectId,
            parentSequence: original.parentSequence,
        });
    }

    /**
     * Reset results for all tasks in a project
     */
    async resetResultsForProject(projectId: number): Promise<void> {
        await db
            .update(tasks)
            .set({
                status: 'todo',
                executionResult: null,
                startedAt: null,
                completedAt: null,
                pausedAt: null,
                actualMinutes: null,
                actualCost: null,
                tokenUsage: null,
                isPaused: false,
                autoReviewed: false,
                reviewFailed: false,
                updatedAt: new Date(),
            })
            .where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt)));
    }
    /**
     * Check if a task has dependents (is a dependency for other tasks)
     * Performs an in-memory check for safety and simplicity given reasonable project sizes.
     */
    async hasDependents(projectId: number, projectSequence: number): Promise<boolean> {
        // Optimization: We only need the dependencies column, but findByProject returns full objects.
        // For now, this is acceptable. If performance becomes an issue, we can create a specific query.
        const projectTasks = await this.findByProject(projectId);

        return projectTasks.some(
            (task) =>
                Array.isArray(task.dependencies) && task.dependencies.includes(projectSequence)
        );
    }
}

// Export singleton instance
export const taskRepository = new TaskRepository();
