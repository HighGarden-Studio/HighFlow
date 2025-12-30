/**
 * Task Repository - 복합 키 버전
 *
 * ✅ 전역 ID 제거 완료
 * 모든 태스크는 (projectId, projectSequence) 복합 키로만 식별됩니다.
 */

import { db } from '../client';
import { tasks, type Task, type NewTask } from '../schema';
import { eq, desc, and, asc, isNull, sql } from 'drizzle-orm';
import type { RunResult } from 'better-sqlite3';
import type { TaskKey } from '../helpers/task-key';

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
    | 'blocked'
    | 'failed';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export class TaskRepository {
    /**
     * Find task by composite key (projectId, projectSequence)
     * ✅ 복합 키 기반 조회
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

    /**
     * Find all tasks for a project
     */
    async findByProject(
        projectId: number,
        filters?: {
            status?: TaskStatus;
            priority?: TaskPriority;
            assigneeId?: number;
            parentTaskKey?: TaskKey | null;
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

        if (filters?.parentTaskKey !== undefined) {
            if (filters.parentTaskKey === null) {
                conditions.push(isNull(tasks.parentProjectId));
            } else {
                conditions.push(eq(tasks.parentProjectId, filters.parentTaskKey.projectId));
                conditions.push(eq(tasks.parentSequence, filters.parentTaskKey.projectSequence));
            }
        }

        return await db
            .select()
            .from(tasks)
            .where(and(...conditions))
            .orderBy(asc(tasks.order), desc(tasks.createdAt));
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
                projectSequence: nextSequence,
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
    async update(projectId: number, projectSequence: number, data: Partial<Task>): Promise<Task> {
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
            .where(and(eq(tasks.projectId, projectId), eq(tasks.projectSequence, projectSequence)))
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
    async updateStatus(
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

        return await this.update(projectId, projectSequence, updateData);
    }

    /**
     * Soft delete task
     */
    async delete(projectId: number, projectSequence: number): Promise<void> {
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
        return await this.update(projectId, projectSequence, {
            deletedAt: null,
        });
    }

    /**
     * Reorder tasks within a project
     * ✅ taskSequences는 projectSequence 배열입니다
     */
    async reorder(projectId: number, taskSequences: number[]): Promise<void> {
        await Promise.all(
            taskSequences.map((sequence, index) =>
                db
                    .update(tasks)
                    .set({
                        order: index,
                        updatedAt: new Date(),
                    })
                    .where(and(eq(tasks.projectId, projectId), eq(tasks.projectSequence, sequence)))
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
        return await this.update(projectId, projectSequence, {
            status,
            order: newOrder,
        });
    }

    /**
     * Get tasks grouped by status (for kanban view)
     */
    async getGroupedByStatus(projectId: number): Promise<Record<TaskStatus, Task[]>> {
        const allTasks = await this.findByProject(projectId, { parentTaskKey: null });

        const grouped: Record<TaskStatus, Task[]> = {
            todo: [],
            in_progress: [],
            needs_approval: [],
            in_review: [],
            done: [],
            blocked: [],
            failed: [],
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
      WHERE parent_project_id = ${projectId} 
        AND parent_sequence = ${projectSequence} 
        AND deleted_at IS NULL
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
        return await this.update(projectId, projectSequence, {
            assigneeId: userId,
        });
    }

    /**
     * Set task as blocked
     * ✅ blockedByTaskKey는 TaskKey 타입입니다
     */
    async setBlocked(
        projectId: number,
        projectSequence: number,
        blockedByTaskKey: TaskKey | null,
        reason?: string
    ): Promise<Task> {
        return await this.update(projectId, projectSequence, {
            status: 'blocked',
            blockedByTaskKey,
            blockedReason: reason || null,
        });
    }

    /**
     * Unblock task
     */
    async unblock(projectId: number, projectSequence: number): Promise<Task> {
        return await this.update(projectId, projectSequence, {
            status: 'todo',
            blockedByTaskKey: null,
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
}

// Export singleton instance
export const taskRepository = new TaskRepository();
