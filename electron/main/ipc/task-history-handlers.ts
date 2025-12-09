/**
 * Task History IPC Handlers
 *
 * Handles IPC communication for task history operations
 */

import { ipcMain } from 'electron';
import { taskHistoryRepository } from '../database/repositories/task-history-repository';
import type {
    TaskHistoryEventType,
    TaskHistoryEventData,
    TaskHistoryMetadata,
    TaskHistoryEntry,
} from '../../../src/core/types/database';

/**
 * Transform database record to TaskHistoryEntry
 */
function transformHistoryEntry(record: any): TaskHistoryEntry {
    return {
        id: record.id,
        taskId: record.taskId,
        eventType: record.eventType as TaskHistoryEventType,
        eventData: record.eventData
            ? typeof record.eventData === 'string'
                ? JSON.parse(record.eventData)
                : record.eventData
            : null,
        metadata: record.metadata
            ? typeof record.metadata === 'string'
                ? JSON.parse(record.metadata)
                : record.metadata
            : null,
        createdAt: record.createdAt instanceof Date ? record.createdAt : new Date(record.createdAt),
    };
}

/**
 * Register task history IPC handlers
 */
export function registerTaskHistoryHandlers(): void {
    /**
     * Get all history entries for a task
     */
    ipcMain.handle('taskHistory:getByTaskId', async (_event, taskId: number, limit?: number) => {
        try {
            const entries = await taskHistoryRepository.findByTaskId(taskId, limit);
            return entries.map(transformHistoryEntry);
        } catch (error) {
            console.error('Error getting task history:', error);
            throw error;
        }
    });

    /**
     * Alias for getByTaskId to match preload
     */
    ipcMain.handle('taskHistory:getByTask', async (_event, taskId: number, limit?: number) => {
        try {
            const entries = await taskHistoryRepository.findByTaskId(taskId, limit);
            return entries.map(transformHistoryEntry);
        } catch (error) {
            console.error('Error getting task history:', error);
            throw error;
        }
    });

    /**
     * Get history entries by event type
     */
    ipcMain.handle(
        'taskHistory:getByEventType',
        async (_event, taskId: number, eventType: TaskHistoryEventType) => {
            try {
                const entries = await taskHistoryRepository.findByTaskIdAndEventType(
                    taskId,
                    eventType
                );
                return entries.map(transformHistoryEntry);
            } catch (error) {
                console.error('Error getting task history by event type:', error);
                throw error;
            }
        }
    );

    /**
     * Get the latest history entry for a task
     */
    ipcMain.handle('taskHistory:getLatest', async (_event, taskId: number) => {
        try {
            const entry = await taskHistoryRepository.getLatest(taskId);
            return entry ? transformHistoryEntry(entry) : null;
        } catch (error) {
            console.error('Error getting latest task history:', error);
            throw error;
        }
    });

    /**
     * Add a history entry
     */
    ipcMain.handle(
        'taskHistory:add',
        async (
            _event,
            taskId: number,
            eventType: TaskHistoryEventType,
            eventData?: TaskHistoryEventData,
            metadata?: TaskHistoryMetadata
        ) => {
            try {
                const entry = await taskHistoryRepository.create(
                    taskId,
                    eventType,
                    eventData,
                    metadata
                );
                const transformedEntry = transformHistoryEntry(entry);

                // Broadcast event to renderer
                const { BrowserWindow } = require('electron');
                const wins = BrowserWindow.getAllWindows();
                if (wins.length > 0) {
                    wins[0].webContents.send('task-history:created', transformedEntry);
                }

                return transformedEntry;
            } catch (error) {
                console.error('Error adding task history:', error);
                throw error;
            }
        }
    );

    console.log('Task history IPC handlers registered');
}
