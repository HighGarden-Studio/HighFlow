import type { Task, TaskOutput } from '../../../core/types/database';

export interface ExecutionContext {
    taskId: number;
    projectId: number;
    userId: number;
    // Add other context properties as needed
}

export interface InputProvider {
    /**
     * Check if this provider can handle the given task based on its configuration
     */
    canHandle(task: Task): boolean;

    /**
     * Prepare the task for input (e.g., set status to IN_PROGRESS, send UI events)
     * This is called when the task execution starts.
     */
    start(task: Task, ctx: ExecutionContext): Promise<void>;

    /**
     * Process the submitted input and return the standardized output
     */
    submit(task: Task, payload: any): Promise<TaskOutput>;

    /**
     * Validate the input payload before processing
     */
    validate(task: Task, payload: any): Promise<{ valid: boolean; error?: string }>;

    /**
     * Cancel the input request
     */
    cancel(task: Task): Promise<void>;
}
