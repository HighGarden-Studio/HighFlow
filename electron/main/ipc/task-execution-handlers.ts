import { ipcMain } from 'electron';
import { ExecutionManager } from './task-execution/execution-manager';
import { GlobalExecutionService } from '../services/GlobalExecutionService';
import { taskNotificationService } from '../services/task-notification-service';
import { taskRepository } from '../database/repositories/task-repository';

/**
 * Register Task Execution IPC Handlers
 * Delegates all logic to ExecutionManager and other services.
 */
export function registerTaskExecutionHandlers() {
    // 1. Execute Task
    ipcMain.handle(
        'task:execute',
        async (_, projectId: number, projectSequence: number, options?: any) => {
            try {
                await ExecutionManager.executeTask({ projectId, projectSequence }, options);
                return { success: true };
            } catch (error: any) {
                console.error('Task Execution Failed:', error);
                return { success: false, error: error.message };
            }
        }
    );

    // 2. Cancel Task
    ipcMain.handle(
        'taskExecution:cancel',
        async (_, projectId: number, projectSequence: number) => {
            await ExecutionManager.cancelTask({ projectId, projectSequence });
            return { success: true };
        }
    );

    // Alias for consistency if frontend uses task:cancel
    ipcMain.handle('task:cancel', async (_, projectId: number, projectSequence: number) => {
        await ExecutionManager.cancelTask({ projectId, projectSequence });
        return { success: true };
    });

    // 3. Retry Task
    ipcMain.handle('task:retry', async (_, projectId: number, projectSequence: number) => {
        await ExecutionManager.retryTask({ projectId, projectSequence });
        return { success: true };
    });

    // 4. Task Status & Active List
    ipcMain.handle('taskExecution:getAllActive', async () => {
        const executions = ExecutionManager.getAllActiveExecutions();
        // Convert to array of states
        return Array.from(executions.values());
    });

    ipcMain.handle(
        'taskExecution:getStatus',
        async (_, projectId: number, projectSequence: number) => {
            const active = ExecutionManager.getExecutionState({ projectId, projectSequence });
            if (active) return active;

            // Fallback to DB status
            const task = await taskRepository.findByKey(projectId, projectSequence);
            return task ? { status: task.status, taskKey: { projectId, projectSequence } } : null;
        }
    );

    // 5. Global/Project Pause & Resume
    ipcMain.handle('taskExecution:pauseAll', async (_, projectId: number) => {
        GlobalExecutionService.pauseProject(projectId);
        return { success: true };
    });

    ipcMain.handle('taskExecution:resumeAll', async (_, projectId: number) => {
        GlobalExecutionService.resumeProject(projectId);
        return { success: true };
    });

    ipcMain.handle('taskExecution:getGlobalPauseStatus', async (_, projectId?: number) => {
        if (projectId) {
            return GlobalExecutionService.isProjectPaused(projectId);
        }
        return false;
    });

    // 6. Review Handlers
    ipcMain.handle(
        'taskExecution:approve',
        async (_, projectId: number, projectSequence: number, feedback?: string) => {
            await ExecutionManager.approveTask({ projectId, projectSequence }, feedback);
            return { success: true };
        }
    );

    ipcMain.handle(
        'taskExecution:reject',
        async (_, projectId: number, projectSequence: number, reason?: string) => {
            await ExecutionManager.rejectTask({ projectId, projectSequence }, reason);
            return { success: true };
        }
    );

    ipcMain.handle(
        'taskExecution:getReviewStatus',
        async (_, projectId: number, projectSequence: number) => {
            return ExecutionManager.getReviewStatus({ projectId, projectSequence });
        }
    );

    // 7. Input Submission
    ipcMain.handle(
        'task:submitInput',
        async (_, projectId: number, projectSequence: number, payload: any) => {
            await ExecutionManager.processInputSubmission({ projectId, projectSequence }, payload);
            return { success: true };
        }
    );

    // 8. Management & Maintenance
    ipcMain.handle('taskExecution:clearAll', async () => {
        ExecutionManager.clearAllActiveExecutions();
        return { success: true };
    });

    ipcMain.handle('taskExecution:resetStuck', async () => {
        await ExecutionManager.resetStuckTasks();
        return { success: true };
    });

    ipcMain.handle(
        'taskExecution:forceClear',
        async (_, projectId: number, projectSequence: number) => {
            // Force clear from memory only
            // Need to expose a method in Manager or just rely on clearAll
            // For now, let's implement a specific clear method if needed, or just warn.
            console.warn(
                'Force clear specific task not fully implemented in Manager, use clearAll'
            );
            return { success: true };
        }
    );

    // 9. Block/Unblock (DB operations)
    ipcMain.handle(
        'taskExecution:block',
        async (_, projectId: number, projectSequence: number, reason?: string) => {
            // Logic to block task (status = blocked?)
            // Assuming 'blocked' status exists or we use metadata
            // For now, just update status
            // await taskRepository.updateStatus(projectId, projectSequence, 'blocked'); // If valid status
            return { success: true }; // Placeholder
        }
    );

    ipcMain.handle(
        'taskExecution:unblock',
        async (_, projectId: number, projectSequence: number) => {
            // await taskRepository.updateStatus(projectId, projectSequence, 'todo');
            return { success: true };
        }
    );
}

/**
 * Lifecycle hook for clearing executions on app start/quit
 */
export const taskExecutionLifecycle = {
    clearAll: ExecutionManager.clearAllActiveExecutions,
    resetStuck: ExecutionManager.resetStuckTasks,
};

// Legacy exports if needed by other modules
export const checkAndExecuteDependentTasks = async (projectId: number, projectSequence: number) => {
    // Delegate to dependency resolver via ExecutionManager or direct import
    // Since this file shouldn't have business logic, we redirect to the resolver.
    const { checkAndExecuteDependentTasks } = await import('./task-execution/dependency-resolver');
    return checkAndExecuteDependentTasks(
        projectId,
        projectSequence,
        ExecutionManager.executeTask.bind(ExecutionManager)
    );
};

export const clearAllActiveExecutions = ExecutionManager.clearAllActiveExecutions;
export const resetStuckTasks = ExecutionManager.resetStuckTasks;
