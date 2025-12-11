/**
 * Task Commands - Concrete implementations for all task operations
 *
 * Each command encapsulates a reversible task operation
 */

import { BaseCommand } from './Command';
import type { Task } from '../../types/database';

// API access
const getAPI = () => (window as any).electron;

/**
 * Create Task Command
 * Execute: Create new task
 * Undo: Delete the created task
 */
export class CreateTaskCommand extends BaseCommand {
    private createdTaskId?: number;

    constructor(
        private taskData: { projectId: number; title: string } & Partial<Task>,
        private onUpdate: (task: Task) => void,
        private onDelete: (id: number) => void
    ) {
        super(`Create task "${taskData.title}"`);
    }

    async execute(): Promise<void> {
        const task = await getAPI().tasks.create(this.taskData);
        this.createdTaskId = task.id;
        this.onUpdate(task);
    }

    async undo(): Promise<void> {
        if (this.createdTaskId) {
            await getAPI().tasks.delete(this.createdTaskId);
            this.onDelete(this.createdTaskId);
        }
    }
}

/**
 * Update Task Command
 * Execute: Update task with new data
 * Undo: Restore previous task data
 */
export class UpdateTaskCommand extends BaseCommand {
    constructor(
        private taskId: number,
        private newData: Partial<Task>,
        private previousData: Partial<Task>,
        private onUpdate: (task: Task) => void,
        description?: string
    ) {
        super(description || `Update task ${taskId}: ${Object.keys(newData).join(', ')}`);
    }

    async execute(): Promise<void> {
        const task = await getAPI().tasks.update(this.taskId, this.newData);
        this.onUpdate(task);
    }

    async undo(): Promise<void> {
        const task = await getAPI().tasks.update(this.taskId, this.previousData);
        this.onUpdate(task);
    }
}

/**
 * Delete Task Command
 * Execute: Soft delete task
 * Undo: Restore deleted task
 */
export class DeleteTaskCommand extends BaseCommand {
    constructor(
        private taskId: number,
        private taskTitle: string,
        private onDelete: (id: number) => void,
        private onRestore: (task: Task) => void
    ) {
        super(`Delete task "${taskTitle}"`);
    }

    async execute(): Promise<void> {
        await getAPI().tasks.delete(this.taskId);
        this.onDelete(this.taskId);
    }

    async undo(): Promise<void> {
        // Restore by setting deletedAt to null
        const task = await getAPI().tasks.update(this.taskId, { deletedAt: null });
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
        private taskId: number,
        private taskTitle: string,
        private newStatus: string,
        private previousStatus: string,
        private onUpdate: (task: Task) => void
    ) {
        super(`Move "${taskTitle}" from ${previousStatus} to ${newStatus}`);
    }

    async execute(): Promise<void> {
        const task = await getAPI().tasks.update(this.taskId, {
            status: this.newStatus,
        });
        this.onUpdate(task);
    }

    async undo(): Promise<void> {
        const task = await getAPI().tasks.update(this.taskId, {
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
        private newTaskIds: number[],
        private previousTaskIds: number[],
        private onReorder: (taskIds: number[]) => void
    ) {
        super(`Reorder ${newTaskIds.length} tasks`);
    }

    async execute(): Promise<void> {
        await getAPI().tasks.reorder(this.newTaskIds);
        this.onReorder(this.newTaskIds);
    }

    async undo(): Promise<void> {
        await getAPI().tasks.reorder(this.previousTaskIds);
        this.onReorder(this.previousTaskIds);
    }
}

/**
 * Assign Operator Command
 * Execute: Assign operator to task
 * Undo: Restore previous operator (or null)
 */
export class AssignOperatorCommand extends BaseCommand {
    constructor(
        private taskId: number,
        private taskTitle: string,
        private operatorId: number | null,
        private previousOperatorId: number | null,
        private operatorName: string | null,
        private onUpdate: (task: Task) => void
    ) {
        super(
            operatorName
                ? `Assign "${operatorName}" to "${taskTitle}"`
                : `Unassign operator from "${taskTitle}"`
        );
    }

    async execute(): Promise<void> {
        const task = await getAPI().tasks.update(this.taskId, {
            assignedOperatorId: this.operatorId,
        });
        this.onUpdate(task);
    }

    async undo(): Promise<void> {
        const task = await getAPI().tasks.update(this.taskId, {
            assignedOperatorId: this.previousOperatorId,
        });
        this.onUpdate(task);
    }
}

/**
 * Add Dependency Command
 * Execute: Add dependency between tasks
 * Undo: Remove the dependency
 */
export class AddDependencyCommand extends BaseCommand {
    constructor(
        private sourceTaskId: number,
        private targetTaskId: number,
        private sourceTitle: string,
        private targetTitle: string,
        private onUpdate: () => void
    ) {
        super(`Add dependency: "${sourceTitle}" → "${targetTitle}"`);
    }

    async execute(): Promise<void> {
        await getAPI().dependencies.create({
            sourceTaskId: this.sourceTaskId,
            targetTaskId: this.targetTaskId,
        });
        this.onUpdate();
    }

    async undo(): Promise<void> {
        await getAPI().dependencies.delete(this.sourceTaskId, this.targetTaskId);
        this.onUpdate();
    }
}

/**
 * Remove Dependency Command
 * Execute: Remove dependency between tasks
 * Undo: Restore the dependency
 */
export class RemoveDependencyCommand extends BaseCommand {
    constructor(
        private sourceTaskId: number,
        private targetTaskId: number,
        private sourceTitle: string,
        private targetTitle: string,
        private onUpdate: () => void
    ) {
        super(`Remove dependency: "${sourceTitle}" → "${targetTitle}"`);
    }

    async execute(): Promise<void> {
        await getAPI().dependencies.delete(this.sourceTaskId, this.targetTaskId);
        this.onUpdate();
    }

    async undo(): Promise<void> {
        await getAPI().dependencies.create({
            sourceTaskId: this.sourceTaskId,
            targetTaskId: this.targetTaskId,
        });
        this.onUpdate();
    }
}
