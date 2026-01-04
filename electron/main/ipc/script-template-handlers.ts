import { ipcMain } from 'electron';
import { scriptTemplateRepository } from '../database/repositories/script-template-repository';

export function registerScriptTemplateHandlers() {
    // List script templates
    ipcMain.handle('script-templates:list', async () => {
        try {
            return await scriptTemplateRepository.findAll();
        } catch (error) {
            console.error('Failed to list script templates:', error);
            throw error;
        }
    });

    // Get script template
    ipcMain.handle('script-templates:get', async (_, id: number) => {
        try {
            return await scriptTemplateRepository.findById(id);
        } catch (error) {
            console.error('Failed to get script template:', error);
            throw error;
        }
    });

    // Create script template
    ipcMain.handle('script-templates:create', async (_, data: any) => {
        try {
            return await scriptTemplateRepository.create(data);
        } catch (error) {
            console.error('Failed to create script template:', error);
            throw error;
        }
    });

    // Update script template
    ipcMain.handle('script-templates:update', async (_, id: number, data: any) => {
        try {
            return await scriptTemplateRepository.update(id, data);
        } catch (error) {
            console.error('Failed to update script template:', error);
            throw error;
        }
    });

    // Delete script template
    ipcMain.handle('script-templates:delete', async (_, id: number) => {
        try {
            await scriptTemplateRepository.delete(id);
        } catch (error) {
            console.error('Failed to delete script template:', error);
            throw error;
        }
    });
}
