/**
 * ExecutionStateManager
 *
 * Manages task execution and review state using TaskKey (composite keys).
 * All state is keyed by "projectId-projectSequence" string format.
 */

import { taskKeyToString, type TaskKey } from '../../../src/utils/taskKey';

// ========================================
// State Types
// ========================================

export type ExecutionStatus =
    | 'running'
    | 'paused'
    | 'stopped'
    | 'completed'
    | 'failed'
    | 'needs_approval';
export type ReviewStatus = 'reviewing' | 'completed' | 'failed';

export interface ExecutionState {
    taskKey: TaskKey;
    status: ExecutionStatus;
    startedAt: Date;
    pausedAt?: Date;
    progress: number;
    currentPhase: string;
    streamContent: string;
    error?: string;
}

export interface ReviewState {
    taskKey: TaskKey;
    status: ReviewStatus;
    startedAt: Date;
    progress: number;
    streamContent: string;
    error?: string;
}

// ========================================
// State Storage
// ========================================

const activeExecutions = new Map<string, ExecutionState>();
const activeReviews = new Map<string, ReviewState>();
const executionQueue = new Map<string, string>(); // targetTaskKey -> sourceTaskKey

// ========================================
// ExecutionStateManager Class
// ========================================

export class ExecutionStateManager {
    // ==================== Execution State ====================

    /**
     * Get execution state for a task
     */
    static getExecutionState(key: TaskKey): ExecutionState | undefined {
        return activeExecutions.get(taskKeyToString(key));
    }

    /**
     * Set execution state for a task
     */
    static setExecutionState(key: TaskKey, state: ExecutionState): void {
        activeExecutions.set(taskKeyToString(key), state);
    }

    /**
     * Delete execution state for a task
     */
    static deleteExecutionState(key: TaskKey): boolean {
        return activeExecutions.delete(taskKeyToString(key));
    }

    /**
     * Check if task is currently executing
     */
    static isExecuting(key: TaskKey): boolean {
        return activeExecutions.has(taskKeyToString(key));
    }

    /**
     * Get all active execution states
     */
    static getAllActiveExecutions(): ExecutionState[] {
        return Array.from(activeExecutions.values());
    }

    /**
     * Clear all execution states
     */
    static clearAllExecutions(): number {
        const count = activeExecutions.size;
        activeExecutions.clear();
        return count;
    }

    // ==================== Review State ====================

    /**
     * Get review state for a task
     */
    static getReviewState(key: TaskKey): ReviewState | undefined {
        return activeReviews.get(taskKeyToString(key));
    }

    /**
     * Set review state for a task
     */
    static setReviewState(key: TaskKey, state: ReviewState): void {
        activeReviews.set(taskKeyToString(key), state);
    }

    /**
     * Delete review state for a task
     */
    static deleteReviewState(key: TaskKey): boolean {
        return activeReviews.delete(taskKeyToString(key));
    }

    /**
     * Check if task is currently in review
     */
    static isReviewing(key: TaskKey): boolean {
        return activeReviews.has(taskKeyToString(key));
    }

    /**
     * Get all active review states
     */
    static getAllActiveReviews(): ReviewState[] {
        return Array.from(activeReviews.values());
    }

    /**
     * Clear all review states
     */
    static clearAllReviews(): number {
        const count = activeReviews.size;
        activeReviews.clear();
        return count;
    }

    // ==================== Execution Queue ====================

    /**
     * Queue an execution request for a busy task
     */
    static queueExecution(targetKey: TaskKey, sourceKey: TaskKey): void {
        executionQueue.set(taskKeyToString(targetKey), taskKeyToString(sourceKey));
    }

    /**
     * Get queued source for a target task
     */
    static getQueuedSource(targetKey: TaskKey): string | undefined {
        return executionQueue.get(taskKeyToString(targetKey));
    }

    /**
     * Remove from queue
     */
    static dequeue(targetKey: TaskKey): boolean {
        return executionQueue.delete(taskKeyToString(targetKey));
    }

    /**
     * Check if task has queued execution
     */
    static hasQueuedExecution(targetKey: TaskKey): boolean {
        return executionQueue.has(taskKeyToString(targetKey));
    }

    /**
     * Clear execution queue
     */
    static clearQueue(): number {
        const count = executionQueue.size;
        executionQueue.clear();
        return count;
    }

    // ==================== Utility ====================

    /**
     * Reset all stuck tasks (those in 'running' state)
     */
    static resetStuckExecutions(): number {
        let count = 0;
        for (const [key, state] of activeExecutions.entries()) {
            if (state.status === 'running') {
                activeExecutions.delete(key);
                count++;
            }
        }
        return count;
    }

    /**
     * Get execution statistics
     */
    static getStats(): {
        activeExecutionsCount: number;
        activeReviewsCount: number;
        queuedExecutionsCount: number;
    } {
        return {
            activeExecutionsCount: activeExecutions.size,
            activeReviewsCount: activeReviews.size,
            queuedExecutionsCount: executionQueue.size,
        };
    }
}
