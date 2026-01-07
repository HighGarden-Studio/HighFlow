/**
 * Task Scheduler Service
 *
 * Handles time-based automatic task execution using cron schedules
 */

import * as cron from 'node-cron';
import { db } from '../database/client';
import { tasks } from '../database/schema';
import { and, isNotNull, sql } from 'drizzle-orm';
import type { Task, TaskTriggerConfig } from '@core/types/database';
import { BrowserWindow } from 'electron';
import { GlobalExecutionService } from './GlobalExecutionService';

interface ScheduledTask {
    projectId: number;
    sequence: number;
    cronJob: cron.ScheduledTask;
    config: TaskTriggerConfig;
}

class TaskScheduler {
    // Key: `${projectId}-${sequence}`
    private scheduledTasks: Map<string, ScheduledTask> = new Map();
    private mainWindow: BrowserWindow | null = null;
    private isInitialized = false;

    /**
     * Initialize the scheduler with the main window reference
     */
    async initialize(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;

        // Load all tasks with time-based triggers
        await this.loadScheduledTasks();

        this.isInitialized = true;
        console.log(
            '[TaskScheduler] Initialized with',
            this.scheduledTasks.size,
            'scheduled tasks'
        );

        // Periodic health check - log scheduled tasks every 5 minutes
        setInterval(
            () => {
                console.log(
                    '[TaskScheduler] Health check - Active scheduled tasks:',
                    this.scheduledTasks.size
                );
                if (this.scheduledTasks.size > 0) {
                    console.log(
                        '[TaskScheduler] Registered task Keys:',
                        Array.from(this.scheduledTasks.keys())
                    );
                }
            },
            5 * 60 * 1000
        ); // Every 5 minutes
    }

    /**
     * Load all tasks with time-based triggers from database
     */
    private async loadScheduledTasks() {
        try {
            // Query tasks with time-based triggers
            const tasksWithSchedules = await db
                .select()
                .from(tasks)
                .where(
                    and(
                        isNotNull(tasks.triggerConfig),
                        sql`JSON_EXTRACT(${tasks.triggerConfig}, '$.scheduledAt') IS NOT NULL`
                    )
                );

            // Register each task
            for (const task of tasksWithSchedules) {
                if (task.triggerConfig?.scheduledAt) {
                    this.registerTask(task as Task);
                }
            }
        } catch (error) {
            console.error('[TaskScheduler] Failed to load scheduled tasks:', error);
        }
    }

    private getTaskKey(projectId: number, sequence: number): string {
        return `${projectId}-${sequence}`;
    }

    /**
     * Register a task for scheduled execution
     */
    registerTask(task: Task) {
        if (!task.triggerConfig?.scheduledAt) {
            console.warn(
                `[TaskScheduler] Task ${task.projectId}-${task.projectSequence} has no scheduledAt config`
            );
            return;
        }

        // Unregister existing schedule if any
        this.unregisterTask(task.projectId, task.projectSequence);

        const { type, datetime, cron: cronExpr, timezone } = task.triggerConfig.scheduledAt;
        const taskKey = this.getTaskKey(task.projectId, task.projectSequence);

        try {
            let cronJob: cron.ScheduledTask;

            if (type === 'once' && datetime) {
                // One-time execution
                const scheduledDate = new Date(datetime);
                const now = new Date();

                if (scheduledDate <= now) {
                    console.log(
                        `[TaskScheduler] Task ${taskKey} scheduled time is in the past, skipping`
                    );
                    return;
                }

                // Calculate delay in milliseconds
                const delay = scheduledDate.getTime() - now.getTime();

                // Use setTimeout for one-time execution
                const timeoutId = setTimeout(() => {
                    this.executeTask(task.projectId, task.projectSequence);
                    this.unregisterTask(task.projectId, task.projectSequence);
                }, delay);

                // Wrap timeout in a cron-like interface for consistency
                cronJob = {
                    start: () => {},
                    stop: () => clearTimeout(timeoutId),
                } as any;

                console.log(
                    `[TaskScheduler] Registered one-time task ${taskKey} for ${scheduledDate.toISOString()}`
                );
            } else if (type === 'recurring' && cronExpr) {
                // Recurring execution using cron expression
                if (!cron.validate(cronExpr)) {
                    console.error(
                        `[TaskScheduler] Invalid cron expression for task ${taskKey}: ${cronExpr}`
                    );
                    return;
                }

                console.log(`[TaskScheduler] Creating recurring schedule for task ${taskKey}`);
                console.log('[TaskScheduler] Cron expression:', cronExpr);
                console.log('[TaskScheduler] Timezone:', timezone || 'Asia/Seoul');

                cronJob = cron.schedule(
                    cronExpr,
                    () => {
                        console.log(
                            `[TaskScheduler] CRON TRIGGERED for task ${taskKey} at ${new Date().toISOString()}`
                        );
                        this.executeTask(task.projectId, task.projectSequence);
                    },
                    {
                        timezone: timezone || 'Asia/Seoul',
                    }
                );

                cronJob.start();
                console.log(
                    `[TaskScheduler] Registered recurring task ${taskKey} with cron: ${cronExpr}`
                );
            } else {
                console.error(`[TaskScheduler] Invalid schedule type for task ${taskKey}`);
                return;
            }

            this.scheduledTasks.set(taskKey, {
                projectId: task.projectId,
                sequence: task.projectSequence,
                cronJob,
                config: task.triggerConfig,
            });
        } catch (error) {
            console.error(`[TaskScheduler] Failed to register task ${taskKey}:`, error);
        }
    }

    /**
     * Unregister a task from scheduled execution
     */
    unregisterTask(projectId: number, sequence: number) {
        const key = this.getTaskKey(projectId, sequence);
        const scheduled = this.scheduledTasks.get(key);
        if (scheduled) {
            try {
                scheduled.cronJob.stop();
                this.scheduledTasks.delete(key);
                console.log(`[TaskScheduler] Unregistered task ${key}`);
            } catch (error) {
                console.error(`[TaskScheduler] Failed to unregister task ${key}:`, error);
            }
        }
    }

    /**
     * Update a task's schedule
     */
    async updateTask(task: Task) {
        if (task.triggerConfig?.scheduledAt) {
            this.registerTask(task);
        } else {
            this.unregisterTask(task.projectId, task.projectSequence);
        }
    }

    /**
     * Execute a task by sending IPC event to renderer
     */
    private executeTask(projectId: number, sequence: number) {
        if (!this.mainWindow) {
            console.error(
                `[TaskScheduler] Cannot execute task ${projectId}-${sequence} - no main window`
            );
            return;
        }

        const key = this.getTaskKey(projectId, sequence);
        const scheduled = this.scheduledTasks.get(key);
        if (scheduled) {
            // Check if Project is Paused
            if (GlobalExecutionService.getInstance().isProjectPaused(scheduled.projectId)) {
                console.log(
                    `[TaskScheduler] Execution skipped for task ${key}: Project ${scheduled.projectId} is PAUSED`
                );
                return;
            }
        }

        console.log(`[TaskScheduler] Triggering auto-execution for task ${key}`);

        // Send event to renderer to trigger execution
        // Sending object payload for Composite Key support
        this.mainWindow.webContents.send('task:triggerAutoExecution', {
            projectId,
            projectSequence: sequence,
        });
    }

    /**
     * Clean up all scheduled tasks
     */
    shutdown() {
        console.log('[TaskScheduler] Shutting down scheduler...');

        for (const [key, scheduled] of this.scheduledTasks.entries()) {
            try {
                scheduled.cronJob.stop();
            } catch (error) {
                console.error(`[TaskScheduler] Error stopping task ${key}:`, error);
            }
        }

        this.scheduledTasks.clear();
        this.isInitialized = false;
        console.log('[TaskScheduler] Shutdown complete');
    }

    /**
     * Get status of scheduled tasks
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            scheduledTaskCount: this.scheduledTasks.size,
            taskKeys: Array.from(this.scheduledTasks.keys()),
        };
    }
}

// Singleton instance
export const taskScheduler = new TaskScheduler();
