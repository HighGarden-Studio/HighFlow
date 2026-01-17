import { ipcMain } from 'electron';

interface LmStudioModelsResponse {
    models: string[];
}

function normalizeModelId(entry: any): string | null {
    if (!entry) return null;
    if (typeof entry === 'string') {
        return entry.trim();
    }
    if (typeof entry.id === 'string') {
        return entry.id.trim();
    }
    if (typeof entry.model === 'string') {
        return entry.model.trim();
    }
    if (typeof entry.name === 'string') {
        return entry.name.trim();
    }
    return null;
}

export function registerLocalProviderHandlers(): void {
    ipcMain.handle(
        'localProviders:fetchLmStudioModels',
        async (_event, baseUrl: string): Promise<LmStudioModelsResponse> => {
            const normalized =
                (baseUrl && baseUrl.trim().replace(/\/+$/, '')) || 'http://localhost:1234/v1';
            const endpoint = `${normalized}/models`;

            try {
                const response = await fetch(endpoint, { method: 'GET' });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                const payload = await response.json();
                let models: string[] = [];

                if (Array.isArray(payload?.data)) {
                    models = payload.data
                        .map((entry: any) => normalizeModelId(entry))
                        .filter((id: string | null): id is string => Boolean(id));
                } else if (Array.isArray(payload?.models)) {
                    models = payload.models
                        .map((entry: any) => normalizeModelId(entry))
                        .filter((id: string | null): id is string => Boolean(id));
                } else if (Array.isArray(payload)) {
                    models = payload
                        .map((entry: any) => normalizeModelId(entry))
                        .filter((id: string | null): id is string => Boolean(id));
                } else if (typeof payload === 'object' && payload !== null) {
                    const maybeData = Array.isArray((payload as any).data)
                        ? (payload as any).data
                        : Array.isArray((payload as any).models)
                          ? (payload as any).models
                          : [];
                    models = maybeData
                        .map((entry: any) => normalizeModelId(entry))
                        .filter((id: string | null): id is string => Boolean(id));
                }

                return { models };
            } catch (error) {
                console.error('[LocalProviders] Failed to fetch LM Studio models:', error);
                throw error;
            }
        }
    );

    // Fetch models from any AI provider
    ipcMain.handle(
        'ai:fetchModels',
        async (_event, providerId: string, apiKey?: string): Promise<any[]> => {
            try {
                // Dynamically import AIServiceManager to ensure singleton usage
                const importedManager =
                    await import('../../../src/services/workflow/AIServiceManager');
                const AIServiceManagerClass =
                    importedManager.AIServiceManager ||
                    (importedManager as any).default?.AIServiceManager;

                if (
                    !AIServiceManagerClass ||
                    typeof AIServiceManagerClass.getInstance !== 'function'
                ) {
                    throw new Error('Failed to import AIServiceManager or find getInstance method');
                }

                const manager = AIServiceManagerClass.getInstance();

                // Inject API key if provided
                if (apiKey) {
                    // We need to access the provider factory instance used by the manager.
                    // Since it's private in Manager, we have to settle for updating the config via Manager's public methods if available.
                    // Manager has setApiKeys({ [providerId]: apiKey }).

                    manager.setApiKeys({ [providerId]: apiKey });
                }

                const models = await manager.refreshProviderModels(providerId as any);
                return models;
            } catch (error) {
                console.error(`[AI] Failed to fetch models for ${providerId}:`, error);
                throw error;
            }
        }
    );

    // Get models from cache (DB)
    ipcMain.handle('ai:getModelsFromCache', async (_event, providerId: string): Promise<any[]> => {
        try {
            const { providerModelsRepository } =
                await import('../database/repositories/provider-models-repository');
            const models = await providerModelsRepository.getModels(providerId);
            return models;
        } catch (error) {
            console.error(`[AI] Failed to get cached models for ${providerId}:`, error);
            return [];
        }
    });
}
