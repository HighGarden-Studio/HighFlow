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
     * Find task by ID
     */
    async findById(id: number): Promise<Task | undefined> {
        const [result] = await db
            .select()
            .from(tasks)
            .where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
            .limit(1);

        return result;
    }

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
    async findWithSubtasks(id: number): Promise<(Task & { subtasks: Task[] }) | undefined> {
        const task = await this.findById(id);
        if (!task) return undefined;

        const subtasks = await db
            .select()
            .from(tasks)
            .where(and(eq(tasks.parentTaskId, id), isNull(tasks.deletedAt)))
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

        const inserted = await db
            .insert(tasks)
            .values({
                ...data,
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

    /**
     * Update existing task
     */
    async update(id: number, data: Partial<Task>): Promise<Task> {
        // Ensure date fields are Date objects (fix for value.getTime error)
        const safeData = { ...data };
        const dateFields = ['dueDate', 'startedAt', 'completedAt', 'pausedAt', 'deletedAt'];

        for (const field of dateFields) {
            if (typeof (safeData as any)[field] === 'string') {
                (safeData as any)[field] = new Date((safeData as any)[field]);
            }
        }

        const updatedResult = await db
            .update(tasks)
            .set({
                ...safeData,
                updatedAt: new Date(),
            })
            .where(eq(tasks.id, id))
            .returning();

        const updated = firstRow(updatedResult);
        if (!updated) {
            throw new Error('Task not found');
        }

        return updated;
    }

    /**
     * Update task status
     */
    async updateStatus(id: number, status: TaskStatus): Promise<Task> {
        const updateData: Partial<Task> = { status };

        if (status === 'in_progress') {
            updateData.startedAt = new Date();
        } else if (status === 'done') {
            updateData.completedAt = new Date();
        }

        return await this.update(id, updateData);
    }

    /**
     * Soft delete task
     */
    async delete(id: number): Promise<void> {
        await db
            .update(tasks)
            .set({
                deletedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(tasks.id, id));
    }

    /**
     * Permanently delete task
     */
    async hardDelete(id: number): Promise<void> {
        await db.delete(tasks).where(eq(tasks.id, id));
    }

    /**
     * Restore deleted task
     */
    async restore(id: number): Promise<Task> {
        return await this.update(id, {
            deletedAt: null,
        });
    }

    /**
     * Reorder tasks within a project
     */
    async reorder(projectId: number, taskIds: number[]): Promise<void> {
        // Update each task with its new order
        await Promise.all(
            taskIds.map((taskId, index) =>
                db
                    .update(tasks)
                    .set({
                        order: index,
                        updatedAt: new Date(),
                    })
                    .where(and(eq(tasks.id, taskId), eq(tasks.projectId, projectId)))
            )
        );
    }

    /**
     * Move task to different status column (for kanban)
     */
    async moveToColumn(taskId: number, status: TaskStatus, newOrder: number): Promise<Task> {
        return await this.update(taskId, {
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
    async getSubtaskCount(taskId: number): Promise<{ total: number; completed: number }> {
        const result = await db.all<{ total: number; completed: number }>(sql`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as completed
      FROM tasks
      WHERE parent_task_id = ${taskId} AND deleted_at IS NULL
    `);

        return {
            total: Number(result[0]?.total) || 0,
            completed: Number(result[0]?.completed) || 0,
        };
    }

    /**
     * Assign task to user
     */
    async assign(taskId: number, userId: number | null): Promise<Task> {
        return await this.update(taskId, {
            assigneeId: userId,
        });
    }

    /**
     * Set task as blocked
     */
    async setBlocked(
        taskId: number,
        blockedByTaskId: number | null,
        reason?: string
    ): Promise<Task> {
        return await this.update(taskId, {
            status: 'blocked',
            blockedByTaskId,
            blockedReason: reason || null,
        });
    }

    /**
     * Unblock task
     */
    async unblock(taskId: number): Promise<Task> {
        return await this.update(taskId, {
            status: 'todo',
            blockedByTaskId: null,
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
    async duplicate(taskId: number, newTitle?: string): Promise<Task> {
        const original = await this.findById(taskId);
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
            parentTaskId: original.parentTaskId,
        });
    }
}

// Export singleton instance
export const taskRepository = new TaskRepository();
