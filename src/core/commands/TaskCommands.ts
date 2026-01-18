/**
 * Task Commands - Concrete implementations for all task operations
 *
 * Each command encapsulates a reversible task operation
 */

import { BaseCommand } from './Command';

// Import Task from the database schema
import type { Task } from '../../../electron/main/database/schema';

// API access
const getAPI = () => (window as any).electron;

/**
 * Create Task Command
 * Execute: Create new task
 * Undo: Delete the created task
 */
export class CreateTaskCommand extends BaseCommand {
    private createdProjectId?: number;
    private createdSequence?: number;

    constructor(
        private taskData: { projectId: number; title: string } & Partial<Task>,
        private onUpdate: (task: Task) => void,
        private onDelete: (projectId: number, sequence: number) => void
    ) {
        super(`Create task "${taskData.title}"`);
    }

    async execute(): Promise<void> {
        const task = await getAPI().tasks.create(this.taskData);
        this.createdProjectId = task.projectId;
        this.createdSequence = task.projectSequence;
        this.onUpdate(task);
    }

    async undo(): Promise<void> {
        if (this.createdProjectId !== undefined && this.createdSequence !== undefined) {
            await getAPI().tasks.delete(this.createdProjectId, this.createdSequence);
            this.onDelete(this.createdProjectId, this.createdSequence);
        }
    }
}

/**
 * Update Task Command
 *
 * NOTE: This command uses direct store updates to avoid structuredClone
 * issues with Electron IPC. The undo/redo operations bypass IPC entirely.
 */
export class UpdateTaskCommand extends BaseCommand {
    constructor(
        private projectId: number,
        private sequence: number,
        private newData: Partial<Task>,
        private previousData: Partial<Task>,
        description?: string
    ) {
        super(description || `Update task ${projectId}-${sequence}`);
    }

    async execute(): Promise<void> {
        // Import taskStore dynamically to avoid circular dependencies
        const { useTaskStore } = await import('../../../src/renderer/stores/taskStore');
        const taskStore = useTaskStore();

        console.log('📝 UpdateTaskCommand.execute - before updateTask');
        // Use the store's updateTask method directly (bypasses IPC)
        await taskStore.updateTask(this.projectId, this.sequence, this.newData);

        // Refresh tasks to ensure UI updates (especially DAG view)
        await taskStore.fetchTasks(this.projectId);
    }

    async undo(): Promise<void> {
        // Import taskStore dynamically to avoid circular dependencies
        const { useTaskStore } = await import('../../../src/renderer/stores/taskStore');
        const taskStore = useTaskStore();

        console.log('↩️ UpdateTaskCommand.undo - before updateTask');
        // Use the store's updateTask method directly (bypasses IPC)
        await taskStore.updateTask(this.projectId, this.sequence, this.previousData);

        // Refresh tasks to ensure UI updates (especially DAG view)
        await taskStore.fetchTasks(this.projectId);
    }
}

/**
 * Delete Task Command
 * Execute: Soft delete task
 * Undo: Restore deleted task
 */
export class DeleteTaskCommand extends BaseCommand {
    constructor(
        private projectId: number,
        private sequence: number,
        taskTitle: string,
        private onDelete: (projectId: number, sequence: number) => void,
        private onRestore: (task: Task) => void
    ) {
        super(`Delete task "${taskTitle}"`);
    }

    async execute(): Promise<void> {
        await getAPI().tasks.delete(this.projectId, this.sequence);
        this.onDelete(this.projectId, this.sequence);
    }

    async undo(): Promise<void> {
        // Restore by setting deletedAt to null via Update
        // Note: 'delete' might be hard delete or soft delete.
        // If soft delete (deletedAt), we can update.
        // Warning: tasks.update might not work on deleted tasks depending on API.
        // Assuming soft delete for now.
        const task = await getAPI().tasks.update(this.projectId, this.sequence, {
            deletedAt: null,
            status: 'todo', // Reset status if needed
        } as any);
        this.onRestore(task);
    }
}

/**
 * Move Task Command (Change Status/Column)
 * Execute: Move task to new status
 * Undo: Restore previous status
 */
export class MoveTaskCommand extends BaseCommand {
    constructor(
        private projectId: number,
        private sequence: number,
        taskTitle: string,
        private newStatus: string,
        private previousStatus: string,
        private onUpdate: (task: Task) => void
    ) {
        super(`Move "${taskTitle}" from ${previousStatus} to ${newStatus}`);
    }

    async execute(): Promise<void> {
        const task = await getAPI().tasks.update(this.projectId, this.sequence, {
            status: this.newStatus,
        });
        this.onUpdate(task);
    }

    async undo(): Promise<void> {
        const task = await getAPI().tasks.update(this.projectId, this.sequence, {
            status: this.previousStatus,
        });
        this.onUpdate(task);
    }
}

/**
 * Reorder Tasks Command
 * Execute: Apply new task order
 * Undo: Restore previous order
 */
export class ReorderTasksCommand extends BaseCommand {
    constructor(
        private projectId: number,
        private newSequences: number[],
        private previousSequences: number[],
        private onReorder: (sequences: number[]) => void
    ) {
        super(`Reorder ${newSequences.length} tasks`);
    }

    async execute(): Promise<void> {
        await getAPI().tasks.reorder(this.projectId, this.newSequences);
        this.onReorder(this.newSequences);
    }

    async undo(): Promise<void> {
        await getAPI().tasks.reorder(this.projectId, this.previousSequences);
        this.onReorder(this.previousSequences);
    }
}

/**
 * Assign Operator Command
 * Execute: Assign operator to task
 * Undo: Restore previous operator (or null)
 */
export class AssignOperatorCommand extends BaseCommand {
    constructor(
        private projectId: number,
        private sequence: number,
        taskTitle: string,
        private operatorId: number | null,
        private previousOperatorId: number | null,
        operatorName: string | null,
        private onUpdate: (task: Task) => void
    ) {
        super(
            operatorName
                ? `Assign "${operatorName}" to "${taskTitle}"`
                : `Unassign operator from "${taskTitle}"`
        );
    }

    async execute(): Promise<void> {
        const task = await getAPI().tasks.update(this.projectId, this.sequence, {
            assignedOperatorId: this.operatorId,
        });
        this.onUpdate(task);
    }

    async undo(): Promise<void> {
        const task = await getAPI().tasks.update(this.projectId, this.sequence, {
            assignedOperatorId: this.previousOperatorId,
        });
        this.onUpdate(task);
    }
}

// NOTE: DependencyCommands disabled - API dependencies not exposed in current ElectronAPI type
/*
export class AddDependencyCommand extends BaseCommand { ... }
export class RemoveDependencyCommand extends BaseCommand { ... }
*/
