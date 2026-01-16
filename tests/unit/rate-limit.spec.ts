import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdvancedTaskExecutor } from '../../src/services/workflow/AdvancedTaskExecutor';
import { AIServiceManager } from '../../src/services/ai/AIServiceManager';

// Mock AIServiceManager class
const mockExecuteTask = vi.fn();

vi.mock('../../src/services/ai/AIServiceManager', () => {
    return {
        AIServiceManager: vi.fn().mockImplementation(() => ({
            executeTask: mockExecuteTask,
            setEnabledProviders: vi.fn(),
            setMCPServers: vi.fn(),
            setApiKeys: vi.fn(),
        })),
    };
});

describe('AdvancedTaskExecutor Rate Limit Handling', () => {
    let executor: AdvancedTaskExecutor;

    beforeEach(() => {
        vi.clearAllMocks();
        mockExecuteTask.mockReset();
        executor = new AdvancedTaskExecutor();
    });

    it('should fail immediately on 429 error without retrying', async () => {
        // Setup mock to return 429 error
        const error429 = new Error('429 Rate limit exceeded');
        (error429 as any).status = 429;

        mockExecuteTask.mockResolvedValue({
            success: false,
            error: error429,
        });

        const task: any = {
            projectId: 1,
            projectSequence: 1,
            title: 'Test Task',
            description: 'Test Description',
            aiProvider: 'openai',
        };

        const context: any = {
            workflowId: 'wf-1',
            metadata: {},
        };

        const result = await executor.executeTask(task, context);

        expect(result.status).toBe('failure');
        expect(result.retries).toBe(0); // Should be 0 retries
        expect(mockExecuteTask).toHaveBeenCalledTimes(1); // Called only once
    });

    it('should retry on timeout errors', async () => {
        // Setup mock to fail with timeout once, then success
        const timeoutError = new Error('Timeout');
        mockExecuteTask
            .mockResolvedValueOnce({
                success: false,
                error: timeoutError,
            })
            .mockResolvedValueOnce({
                success: true,
                content: 'Success',
                tokensUsed: { total: 10 },
                cost: 0.01,
                provider: 'openai',
                model: 'gpt-4',
            });

        const task: any = {
            projectId: 1,
            projectSequence: 1,
            title: 'Test Task',
            description: 'Test Description',
        };

        const context: any = {
            workflowId: 'wf-1',
            metadata: {},
        };

        const result = await executor.executeTask(task, context, {
            retryStrategy: {
                maxRetries: 1,
                initialDelay: 10, // fast retry for test
                maxDelay: 100,
                backoffMultiplier: 1,
            },
        });

        expect(result.status).toBe('success');
        expect(result.retries).toBe(1);
        expect(mockExecuteTask).toHaveBeenCalledTimes(2);
    });
});
