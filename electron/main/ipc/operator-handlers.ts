/**
 * IPC Handlers for Operators
 */

import { ipcMain } from 'electron';
import { operatorRepository } from '../database/repositories/operator-repository';
import type { NewOperator, NewOperatorMCP } from '../database/repositories/operator-repository';

export function registerOperatorHandlers() {
    // List operators for a project
    ipcMain.handle('operators:list', async (_, projectId: number | null) => {
        try {
            return await operatorRepository.findByProject(projectId);
        } catch (error) {
            console.error('Error listing operators:', error);
            throw error;
        }
    });

    // Get single operator
    ipcMain.handle('operators:get', async (_, id: number) => {
        try {
            return await operatorRepository.findById(id);
        } catch (error) {
            console.error('Error getting operator:', error);
            throw error;
        }
    });

    // Get operator with MCPs
    ipcMain.handle('operators:getWithMCPs', async (_, id: number) => {
        try {
            return await operatorRepository.findWithMCPs(id);
        } catch (error) {
            console.error('Error getting operator with MCPs:', error);
            throw error;
        }
    });

    // Create operator
    ipcMain.handle('operators:create', async (_, data: NewOperator) => {
        try {
            return await operatorRepository.create(data);
        } catch (error) {
            console.error('Error creating operator:', error);
            throw error;
        }
    });

    // Update operator
    ipcMain.handle('operators:update', async (_, id: number, data: Partial<NewOperator>) => {
        try {
            return await operatorRepository.update(id, data);
        } catch (error) {
            console.error('Error updating operator:', error);
            throw error;
        }
    });

    // Delete operator
    ipcMain.handle('operators:delete', async (_, id: number) => {
        try {
            await operatorRepository.delete(id);
            return { success: true };
        } catch (error) {
            console.error('Error deleting operator:', error);
            throw error;
        }
    });

    // Get operator MCPs
    ipcMain.handle('operators:getMCPs', async (_, operatorId: number) => {
        try {
            return await operatorRepository.getMCPs(operatorId);
        } catch (error) {
            console.error('Error getting operator MCPs:', error);
            throw error;
        }
    });

    // Update operator MCPs
    ipcMain.handle(
        'operators:updateMCPs',
        async (_, operatorId: number, mcps: NewOperatorMCP[]) => {
            try {
                await operatorRepository.updateMCPs(operatorId, mcps);
                return { success: true };
            } catch (error) {
                console.error('Error updating operator MCPs:', error);
                throw error;
            }
        }
    );

    // Get reviewers for a project
    ipcMain.handle('operators:getReviewers', async (_, projectId: number | null) => {
        try {
            return await operatorRepository.findReviewers(projectId);
        } catch (error) {
            console.error('Error getting reviewers:', error);
            throw error;
        }
    });
}
