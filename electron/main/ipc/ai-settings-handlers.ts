import { ipcMain } from 'electron';
import { settingsRepository } from '../database/repositories/settings-repository';

export function registerAiSettingsHandlers(): void {
    /**
     * Save AI Provider Configuration
     *
     * @param providerId - The ID of the AI provider (e.g., 'openai', 'highflow')
     * @param config - The configuration object (apiKey, etc.)
     */
    ipcMain.handle('ai:saveProviderConfig', async (_event, providerId: string, config: any) => {
        try {
            console.log(`[IPC] Saving config for AI provider: ${providerId}`);

            // Validate minimal requirements if needed
            if (!providerId) {
                throw new Error('Provider ID is required');
            }

            // Save to settings table with a structured key
            // Key format: ai_provider_{providerId}
            const key = `ai_provider_${providerId}`;
            await settingsRepository.setJSON(key, config);

            // Successfully saved config for provider
            return { success: true };
        } catch (error) {
            console.error(`[IPC] Failed to save config for ${providerId}:`, error);
            throw error;
        }
    });

    /**
     * Get AI Provider Configuration
     */
    ipcMain.handle('ai:getProviderConfig', async (_event, providerId: string) => {
        try {
            const key = `ai_provider_${providerId}`;
            const config = await settingsRepository.getJSON(key);
            return config;
        } catch (error) {
            console.error(`[IPC] Failed to get config for ${providerId}:`, error);
            return null;
        }
    });
}
