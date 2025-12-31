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
        projectId: number,
        projectSequence: number,
        eventType: TaskHistoryEventType,
        eventData?: TaskHistoryEventData,
        metadata?: TaskHistoryMetadata
    ): Promise<TaskHistory> {
        const now = new Date();
        const entry: NewTaskHistory = {
            taskProjectId: projectId,
            taskSequence: projectSequence,
            eventType,
            eventData: eventData ?? null,
            metadata: metadata ?? null,
            createdAt: now,
        };

        const result = await db.insert(taskHistory).values(entry).returning();
        return result[0]!;
    }

    /**
     * Find all history entries for a task
     */
    async findByTask(
        projectId: number,
        projectSequence: number,
        limit?: number
    ): Promise<TaskHistory[]> {
        let query = db
            .select()
            .from(taskHistory)
            .where(
                and(
                    eq(taskHistory.taskProjectId, projectId),
                    eq(taskHistory.taskSequence, projectSequence)
                )
            )
            .orderBy(desc(taskHistory.createdAt), desc(taskHistory.id));

        if (limit) {
            query = query.limit(limit) as typeof query;
        }

        return await query;
    }

    /**
     * Find history entries by event type for a task
     */
    async findByTaskAndEventType(
        projectId: number,
        projectSequence: number,
        eventType: TaskHistoryEventType
    ): Promise<TaskHistory[]> {
        return await db
            .select()
            .from(taskHistory)
            .where(
                and(
                    eq(taskHistory.taskProjectId, projectId),
                    eq(taskHistory.taskSequence, projectSequence),
                    eq(taskHistory.eventType, eventType)
                )
            )
            .orderBy(desc(taskHistory.createdAt), desc(taskHistory.id));
    }

    /**
     * Get the most recent history entry for a task
     */
    async getLatest(projectId: number, projectSequence: number): Promise<TaskHistory | undefined> {
        const result = await db
            .select()
            .from(taskHistory)
            .where(
                and(
                    eq(taskHistory.taskProjectId, projectId),
                    eq(taskHistory.taskSequence, projectSequence)
                )
            )
            .orderBy(desc(taskHistory.createdAt), desc(taskHistory.id))
            .limit(1);

        return result[0];
    }

    /**
     * Get the most recent entry of a specific type for a task
     */
    async getLatestByType(
        projectId: number,
        projectSequence: number,
        eventType: TaskHistoryEventType
    ): Promise<TaskHistory | undefined> {
        const result = await db
            .select()
            .from(taskHistory)
            .where(
                and(
                    eq(taskHistory.taskProjectId, projectId),
                    eq(taskHistory.taskSequence, projectSequence),
                    eq(taskHistory.eventType, eventType)
                )
            )
            .orderBy(desc(taskHistory.createdAt), desc(taskHistory.id))
            .limit(1);

        return result[0];
    }

    /**
     * Delete all history for a task
     */
    async deleteByTask(projectId: number, projectSequence: number): Promise<void> {
        await db
            .delete(taskHistory)
            .where(
                and(
                    eq(taskHistory.taskProjectId, projectId),
                    eq(taskHistory.taskSequence, projectSequence)
                )
            );
    }

    /**
     * Helper: Log execution started
     */
    async logExecutionStarted(
        projectId: number,
        projectSequence: number,
        prompt: string,
        provider?: string,
        model?: string
    ): Promise<TaskHistory> {
        return this.create(
            projectId,
            projectSequence,
            'execution_started',
            { prompt, provider, model },
            { provider, model }
        );
    }

    /**
     * Helper: Log execution completed
     */
    async logExecutionCompleted(
        projectId: number,
        projectSequence: number,
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
            projectId,
            projectSequence,
            'execution_completed',
            { content, aiResult, executionResult, ...metadata },
            metadata
        );
    }

    /**
     * Helper: Log execution failed
     */
    async logExecutionFailed(
        projectId: number,
        projectSequence: number,
        error: string,
        metadata?: TaskHistoryMetadata
    ): Promise<TaskHistory> {
        return this.create(projectId, projectSequence, 'execution_failed', { error }, metadata);
    }

    /**
     * Helper: Log AI review requested
     */
    async logAIReviewRequested(
        projectId: number,
        projectSequence: number,
        reviewPrompt: string,
        originalResult: string,
        metadata?: TaskHistoryMetadata
    ): Promise<TaskHistory> {
        return this.create(
            projectId,
            projectSequence,
            'ai_review_requested',
            { reviewPrompt, originalResult },
            metadata
        );
    }

    /**
     * Helper: Log AI review completed
     */
    async logAIReviewCompleted(
        projectId: number,
        projectSequence: number,
        reviewResult: string,
        reviewFeedback: string,
        approved: boolean,
        metadata?: TaskHistoryMetadata
    ): Promise<TaskHistory> {
        return this.create(
            projectId,
            projectSequence,
            'ai_review_completed',
            { reviewResult, reviewFeedback, approved },
            metadata
        );
    }

    /**
     * Helper: Log prompt refinement
     */
    async logPromptRefined(
        projectId: number,
        projectSequence: number,
        previousPrompt: string,
        newPrompt: string,
        refinementReason?: string
    ): Promise<TaskHistory> {
        return this.create(projectId, projectSequence, 'prompt_refined', {
            previousPrompt,
            newPrompt,
            refinementReason,
        });
    }

    /**
     * Helper: Log status change
     */
    async logStatusChanged(
        projectId: number,
        projectSequence: number,
        previousStatus: string,
        newStatus: string
    ): Promise<TaskHistory> {
        return this.create(projectId, projectSequence, 'status_changed', {
            previousStatus: previousStatus as any,
            newStatus: newStatus as any,
        });
    }

    /**
     * Helper: Log approval requested
     */
    async logApprovalRequested(
        projectId: number,
        projectSequence: number,
        question: string,
        options?: string[]
    ): Promise<TaskHistory> {
        return this.create(projectId, projectSequence, 'approval_requested', { question, options });
    }

    /**
     * Helper: Log approved
     */
    async logApproved(
        projectId: number,
        projectSequence: number,
        response?: string
    ): Promise<TaskHistory> {
        return this.create(projectId, projectSequence, 'approved', { response });
    }

    /**
     * Helper: Log rejected
     */
    async logRejected(
        projectId: number,
        projectSequence: number,
        response?: string
    ): Promise<TaskHistory> {
        return this.create(projectId, projectSequence, 'rejected', { response });
    }

    /**
     * Helper: Log review completed (user review)
     */
    async logReviewCompleted(projectId: number, projectSequence: number): Promise<TaskHistory> {
        return this.create(projectId, projectSequence, 'review_completed');
    }

    /**
     * Helper: Log changes requested
     */
    async logChangesRequested(
        projectId: number,
        projectSequence: number,
        refinementPrompt: string
    ): Promise<TaskHistory> {
        return this.create(projectId, projectSequence, 'changes_requested', { refinementPrompt });
    }

    /**
     * Helper: Log paused
     */
    async logPaused(projectId: number, projectSequence: number): Promise<TaskHistory> {
        return this.create(projectId, projectSequence, 'paused');
    }

    /**
     * Helper: Log resumed
     */
    async logResumed(projectId: number, projectSequence: number): Promise<TaskHistory> {
        return this.create(projectId, projectSequence, 'resumed');
    }

    /**
     * Helper: Log stopped
     */
    async logStopped(projectId: number, projectSequence: number): Promise<TaskHistory> {
        return this.create(projectId, projectSequence, 'stopped');
    }

    /**
     * Delete all history for a project
     */
    async deleteByProjectId(projectId: number): Promise<void> {
        await db.delete(taskHistory).where(eq(taskHistory.taskProjectId, projectId));
    }
}

// Singleton instance
export const taskHistoryRepository = new TaskHistoryRepository();
