/* eslint-disable @typescript-eslint/no-explicit-any, no-console, vue/one-component-per-file */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefaultHighFlowProvider } from '../../src/services/ai/providers/DefaultHighFlowProvider';

// Mock dependencies
vi.mock('../../electron/main/config', () => ({
    config: { BACKEND_URL: 'https://mock-backend.com' },
}));

// Mock database repository
vi.mock('../../electron/main/database/repositories/provider-models-repository', () => ({
    providerModelsRepository: {
        getModels: vi.fn().mockResolvedValue([]),
        saveModels: vi.fn().mockResolvedValue(true),
    },
}));

describe('DefaultHighFlowProvider Integration', () => {
    let provider: DefaultHighFlowProvider;
    let proxySpy: any;

    beforeEach(() => {
        vi.restoreAllMocks();
        provider = new DefaultHighFlowProvider();

        // Mock authentication to bypass dynamic import and check
        vi.spyOn(provider as any, 'checkAuthentication').mockResolvedValue({
            authenticated: true,
            token: 'mock-token',
        });

        // Mock callBackendProxy to avoid actual network call and inspect config
        proxySpy = vi.spyOn(provider as any, 'callBackendProxy').mockResolvedValue({
            candidates: [
                {
                    content: { parts: [{ text: 'Mock response' }] },
                    finishReason: 'STOP',
                },
            ],
            usageMetadata: { totalTokenCount: 10 },
        });

        // Mock validateConfig to bypass model existence check
        vi.spyOn(provider as any, 'validateConfig').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should fallback from gemini-2.0-flash-exp to gemini-2.5-flash', async () => {
        const config = {
            model: 'gemini-2.0-flash-exp',
            temperature: 0.7,
        };

        await provider.execute('test prompt', config);

        // Verify config was mutated (or used with mutation)
        expect(proxySpy).toHaveBeenCalled();
        const callArgs = proxySpy.mock.calls[0];
        const requestPayload = callArgs[0];

        expect(requestPayload.model).toBe('gemini-2.5-flash');
    });

    it('should use requested model if fully supported', async () => {
        const config = {
            model: 'gemini-1.5-pro',
            temperature: 0.7,
        };

        await provider.execute('test prompt', config);

        const requestPayload = proxySpy.mock.calls[0][0];

        expect(requestPayload.model).toBe('gemini-1.5-pro');
    });

    it('should fetch models from API and transform them', async () => {
        // Mock global fetch
        const mockFetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                models: [
                    {
                        name: 'models/gemini-pro',
                        displayName: 'Gemini Pro',
                        inputTokenLimit: 32000,
                    },
                ],
            }),
        });
        vi.stubGlobal('fetch', mockFetch);

        const models = await provider.fetchModels();

        expect(models).toHaveLength(1);
        expect(models[0].name).toBe('gemini-pro');
        expect(models[0].provider).toBe('default-highflow');

        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/v1/ai/models'),
            expect.objectContaining({ method: 'GET' })
        );
    });
});
