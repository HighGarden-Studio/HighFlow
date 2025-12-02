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
}
