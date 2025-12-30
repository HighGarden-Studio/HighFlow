/**
 * Task History Repository
 *
 * Data access layer for task history events
 */

import { db } from '../client';
import { taskHistory, tasks, type TaskHistory, type NewTaskHistory } from '../schema';
import { eq, desc, and, inArray } from 'drizzle-orm';
import type {
    TaskHistoryEventType,
    TaskHistoryEventData,
    TaskHistoryMetadata,
} from '../../../../src/core/types/database';

export class TaskHistoryRepository {
    /**
     * Create a new history entry
     */
    async create(
        taskId: number,
        eventType: TaskHistoryEventType,
        eventData?: TaskHistoryEventData,
        metadata?: TaskHistoryMetadata
    ): Promise<TaskHistory> {
        const now = new Date();
        const entry: NewTaskHistory = {
            taskId,
            eventType,
            eventData: eventData ? JSON.stringify(eventData) : null,
            metadata: metadata ? JSON.stringify(metadata) : null,
            createdAt: now,
        };

        const result = await db.insert(taskHistory).values(entry).returning();
        return result[0]!;
    }

    /**
     * Find all history entries for a task
     */
    async findByTaskId(taskId: number, limit?: number): Promise<TaskHistory[]> {
        let query = db
            .select()
            .from(taskHistory)
            .where(eq(taskHistory.taskId, taskId))
            .orderBy(desc(taskHistory.createdAt), desc(taskHistory.id));

        if (limit) {
            query = query.limit(limit) as typeof query;
        }

        return await query;
    }

    /**
     * Find history entries by event type for a task
     */
    async findByTaskIdAndEventType(
        taskId: number,
        eventType: TaskHistoryEventType
    ): Promise<TaskHistory[]> {
        return await db
            .select()
            .from(taskHistory)
            .where(and(eq(taskHistory.taskId, taskId), eq(taskHistory.eventType, eventType)))
            .orderBy(desc(taskHistory.createdAt), desc(taskHistory.id));
    }

    /**
     * Get the most recent history entry for a task
     */
    async getLatest(taskId: number): Promise<TaskHistory | undefined> {
        const result = await db
            .select()
            .from(taskHistory)
            .where(eq(taskHistory.taskId, taskId))
            .orderBy(desc(taskHistory.createdAt), desc(taskHistory.id))
            .limit(1);

        return result[0];
    }

    /**
     * Get the most recent entry of a specific type for a task
     */
    async getLatestByType(
        taskId: number,
        eventType: TaskHistoryEventType
    ): Promise<TaskHistory | undefined> {
        const result = await db
            .select()
            .from(taskHistory)
            .where(and(eq(taskHistory.taskId, taskId), eq(taskHistory.eventType, eventType)))
            .orderBy(desc(taskHistory.createdAt), desc(taskHistory.id))
            .limit(1);

        return result[0];
    }

    /**
     * Delete all history for a task
     */
    async deleteByTaskId(taskId: number): Promise<void> {
        await db.delete(taskHistory).where(eq(taskHistory.taskId, taskId));
    }

    /**
     * Helper: Log execution started
     */
    async logExecutionStarted(
        taskId: number,
        prompt: string,
        provider?: string,
        model?: string
    ): Promise<TaskHistory> {
        return this.create(
            taskId,
            'execution_started',
            { prompt, provider, model },
            { provider, model }
        );
    }

    /**
     * Helper: Log execution completed
     */
    async logExecutionCompleted(
        taskId: number,
        content: string,
        metadata: {
            provider?: string;
            model?: string;
            cost?: number;
            tokens?: number;
            duration?: number;
        },
        aiResult?: TaskHistoryEventData['aiResult'],
        executionResult?: TaskHistoryEventData['executionResult']
    ): Promise<TaskHistory> {
        return this.create(
            taskId,
            'execution_completed',
            { content, aiResult, executionResult, ...metadata },
            metadata
        );
    }

    /**
     * Helper: Log execution failed
     */
    async logExecutionFailed(
        taskId: number,
        error: string,
        metadata?: TaskHistoryMetadata
    ): Promise<TaskHistory> {
        return this.create(taskId, 'execution_failed', { error }, metadata);
    }

    /**
     * Helper: Log AI review requested
     */
    async logAIReviewRequested(
        taskId: number,
        reviewPrompt: string,
        originalResult: string,
        metadata?: TaskHistoryMetadata
    ): Promise<TaskHistory> {
        return this.create(
            taskId,
            'ai_review_requested',
            { reviewPrompt, originalResult },
            metadata
        );
    }

    /**
     * Helper: Log AI review completed
     */
    async logAIReviewCompleted(
        taskId: number,
        reviewResult: string,
        reviewFeedback: string,
        approved: boolean,
        metadata?: TaskHistoryMetadata
    ): Promise<TaskHistory> {
        return this.create(
            taskId,
            'ai_review_completed',
            { reviewResult, reviewFeedback, approved },
            metadata
        );
    }

    /**
     * Helper: Log prompt refinement
     */
    async logPromptRefined(
        taskId: number,
        previousPrompt: string,
        newPrompt: string,
        refinementReason?: string
    ): Promise<TaskHistory> {
        return this.create(taskId, 'prompt_refined', {
            previousPrompt,
            newPrompt,
            refinementReason,
        });
    }

    /**
     * Helper: Log status change
     */
    async logStatusChanged(
        taskId: number,
        previousStatus: string,
        newStatus: string
    ): Promise<TaskHistory> {
        return this.create(taskId, 'status_changed', {
            previousStatus: previousStatus as any,
            newStatus: newStatus as any,
        });
    }

    /**
     * Helper: Log approval requested
     */
    async logApprovalRequested(
        taskId: number,
        question: string,
        options?: string[]
    ): Promise<TaskHistory> {
        return this.create(taskId, 'approval_requested', { question, options });
    }

    /**
     * Helper: Log approved
     */
    async logApproved(taskId: number, response?: string): Promise<TaskHistory> {
        return this.create(taskId, 'approved', { response });
    }

    /**
     * Helper: Log rejected
     */
    async logRejected(taskId: number, response?: string): Promise<TaskHistory> {
        return this.create(taskId, 'rejected', { response });
    }

    /**
     * Helper: Log review completed (user review)
     */
    async logReviewCompleted(taskId: number): Promise<TaskHistory> {
        return this.create(taskId, 'review_completed');
    }

    /**
     * Helper: Log changes requested
     */
    async logChangesRequested(taskId: number, refinementPrompt: string): Promise<TaskHistory> {
        return this.create(taskId, 'changes_requested', { refinementPrompt });
    }

    /**
     * Helper: Log paused
     */
    async logPaused(taskId: number): Promise<TaskHistory> {
        return this.create(taskId, 'paused');
    }

    /**
     * Helper: Log resumed
     */
    async logResumed(taskId: number): Promise<TaskHistory> {
        return this.create(taskId, 'resumed');
    }

    /**
     * Helper: Log stopped
     */
    async logStopped(taskId: number): Promise<TaskHistory> {
        return this.create(taskId, 'stopped');
    }

    /**
     * Delete all history for a project
     */
    async deleteByProjectId(projectId: number): Promise<void> {
        // Get all task IDs for the project
        const projectTasks = await db
            .select({ id: tasks.id })
            .from(tasks)
            .where(eq(tasks.projectId, projectId));

        const taskIds = projectTasks.map((t) => t.id);

        if (taskIds.length > 0) {
            await db.delete(taskHistory).where(inArray(taskHistory.taskId, taskIds));
        }
    }
}

// Singleton instance
export const taskHistoryRepository = new TaskHistoryRepository();
