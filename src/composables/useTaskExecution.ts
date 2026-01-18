/**
 * Task Execution Composable
 *
 * Handles AI-powered task execution with streaming and real-time updates
 * Supports both direct provider calls and IPC-based execution via Electron
 */

import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { Task } from '@core/types/database';
import type { AIProvider, AIModel, AIConfig } from '@core/types/ai';
import type {
    ExecutionResult as IPCExecutionResult,
    ExecutionProgress as IPCExecutionProgress,
} from '@core/types/electron.d';
import { ProviderFactory } from '../services/ai/providers/ProviderFactory';
import { getAPI } from '../utils/electron';
import { useSettingsStore } from '../renderer/stores/settingsStore';
import { useUserStore } from '../renderer/stores/userStore';
import {
    buildEnabledProvidersPayload,
    buildRuntimeMCPServers,
} from '../renderer/utils/runtimeConfig';

interface ExecutionStats {
    startTime: number;
    endTime?: number;
    duration?: number;
    tokensUsed?: {
        prompt: number;
        completion: number;
        total: number;
    };
    cost?: number;
    model?: string;
    provider?: AIProvider;
}

interface ExecutionResult {
    content: string;
    stats: ExecutionStats;
    error?: string;
}

export function useTaskExecution() {
    const providerFactory = new ProviderFactory();

    const isExecuting = ref(false);
    const isPaused = ref(false);
    const streamedContent = ref('');
    const executionStats = ref<ExecutionStats | null>(null);
    const executionError = ref<string | null>(null);
    const progress = ref(0);

    // Abort controller for cancellation
    let abortController: AbortController | null = null;

    /**
     * Execute a task with AI
     */
    async function executeTask(task: Task): Promise<ExecutionResult | null> {
        if (isExecuting.value) {
            console.warn('Task execution already in progress');
            return null;
        }

        // Reset state
        isExecuting.value = true;
        isPaused.value = false;
        streamedContent.value = '';
        executionError.value = null;
        progress.value = 0;

        // Initialize stats
        executionStats.value = {
            startTime: Date.now(),
            provider: task.aiProvider as AIProvider,
        };

        // Create abort controller
        abortController = new AbortController();

        try {
            // Check if using default-highflow provider
            if ((task.aiProvider as string) === 'default-highflow') {
                const userStore = useUserStore();
                // TODO: Check if using default-highflow provider when task is loadedUserStore();
                if (!userStore.isAuthenticated) {
                    throw new Error(
                        'Default Gemini를 사용하려면 로그인이 필요합니다. Settings에서 로그인해주세요.'
                    );
                }
            }

            // Get AI provider
            const provider = await providerFactory.getProvider(task.aiProvider as AIProvider);

            // Build prompt
            const prompt = buildTaskPrompt(task);

            // Build AI config from task
            const config: AIConfig = {
                model: (task.aiProvider === 'anthropic'
                    ? 'claude-3-5-sonnet-20250219'
                    : task.aiProvider === 'openai'
                      ? 'gpt-4-turbo'
                      : 'gemini-2.5-pro') as AIModel,
                temperature: 0.7,
                maxTokens: 4096,
            };

            // Stream execution
            const chunks: string[] = [];
            let tokenCount = 0;

            for await (const chunk of provider.streamExecute(
                prompt,
                config,
                (delta: string) => {
                    // Real-time token callback
                    streamedContent.value += delta;
                    tokenCount++;

                    // Update progress (rough estimate)
                    progress.value = Math.min((tokenCount / 4096) * 100, 95);
                },
                {
                    userId: 1, // TODO: Get from user context
                    taskId: task.id,
                }
            )) {
                if (abortController?.signal.aborted) {
                    throw new Error('Execution cancelled by user');
                }

                if (!chunk.done) {
                    chunks.push(chunk.delta);
                } else {
                    // Execution complete
                    streamedContent.value = chunk.accumulated;

                    // Update stats (cost/tokens would come from metadata if available)
                    executionStats.value = {
                        ...executionStats.value,
                        endTime: Date.now(),
                        duration: Date.now() - executionStats.value.startTime,
                        tokensUsed: chunk.metadata?.tokensUsed,
                        cost: chunk.metadata?.cost,
                        model: chunk.metadata?.model,
                    };

                    progress.value = 100;

                    return {
                        content: chunk.accumulated,
                        stats: executionStats.value,
                    };
                }
            }

            return null;
        } catch (error) {
            console.error('Task execution failed:', error);
            executionError.value = (error as Error).message;

            return {
                content: streamedContent.value,
                stats: executionStats.value!,
                error: executionError.value,
            };
        } finally {
            isExecuting.value = false;
            abortController = null;
        }
    }

    /**
     * Stop execution
     */
    function stopExecution() {
        if (abortController) {
            abortController.abort();
            isExecuting.value = false;
            executionError.value = 'Execution stopped by user';
        }
    }

    /**
     * Pause execution (not fully supported by all providers)
     */
    function pauseExecution() {
        isPaused.value = true;
        // TODO: Implement pause logic if provider supports it
    }

    /**
     * Resume execution
     */
    function resumeExecution() {
        isPaused.value = false;
        // TODO: Implement resume logic
    }

    /**
     * Clear results
     */
    function clearResults() {
        streamedContent.value = '';
        executionStats.value = null;
        executionError.value = null;
        progress.value = 0;
    }

    /**
     * Build prompt from task
     */
    function buildTaskPrompt(task: Task): string {
        let prompt = '';

        // Add title and description
        if (task.title) {
            prompt += `# Task: ${task.title}\n\n`;
        }

        if (task.description) {
            prompt += `${task.description}\n\n`;
        }

        // Add generated prompt if available
        if (task.generatedPrompt) {
            prompt += `## Instructions:\n${task.generatedPrompt}\n\n`;
        }

        // Additional context can be added from task relationships
        // For example, parent task or dependency information

        return prompt;
    }

    /**
     * Compute execution duration in human-readable format
     */
    const durationFormatted = computed(() => {
        if (!executionStats.value?.duration) return null;

        const seconds = Math.floor(executionStats.value.duration / 1000);
        const minutes = Math.floor(seconds / 60);

        if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        }
        return `${seconds}s`;
    });

    /**
     * Compute cost in formatted string
     */
    const costFormatted = computed(() => {
        if (!executionStats.value?.cost) return null;
        return `$${executionStats.value.cost.toFixed(4)}`;
    });

    /**
     * Check if execution has results
     */
    const hasResults = computed(() => {
        return streamedContent.value.length > 0;
    });

    /**
     * Check if execution was successful
     */
    const isSuccess = computed(() => {
        return hasResults.value && !executionError.value;
    });

    // IPC-based execution via Electron
    const currentTaskRef = ref<{ projectId: number; sequence: number; id: number } | null>(null);
    const approvalRequest = ref<{ question: string; options?: string[]; context?: unknown } | null>(
        null
    );
    const cleanupFns = ref<(() => void)[]>([]);

    /**
     * Execute a task via IPC (for Electron main process execution)
     */
    async function executeTaskViaIPC(
        task: { projectId: number; projectSequence: number; id: number },
        options?: { streaming?: boolean; timeout?: number }
    ) {
        const api = getAPI();
        if (!api?.taskExecution) {
            console.warn('[TaskExecution] IPC API not available, falling back to direct execution');
            return null;
        }

        // Reset state
        isExecuting.value = true;
        isPaused.value = false;
        streamedContent.value = '';
        executionError.value = null;
        progress.value = 0;
        currentTaskRef.value = {
            projectId: task.projectId,
            sequence: task.projectSequence,
            id: task.id,
        };
        approvalRequest.value = null;

        executionStats.value = {
            startTime: Date.now(),
        };

        try {
            // Get API keys from settings store
            const settingsStore = useSettingsStore();
            const apiKeys: {
                anthropic?: string;
                openai?: string;
                google?: string;
                groq?: string;
                lmstudio?: string;
            } = {};

            // Extract API keys from enabled providers
            for (const provider of settingsStore.aiProviders) {
                if (provider.apiKey) {
                    if (provider.id === 'anthropic') {
                        apiKeys.anthropic = provider.apiKey;
                    } else if (provider.id === 'openai') {
                        apiKeys.openai = provider.apiKey;
                    } else if (provider.id === 'google') {
                        apiKeys.google = provider.apiKey;
                    } else if (provider.id === 'groq') {
                        apiKeys.groq = provider.apiKey;
                    } else if (provider.id === 'lmstudio') {
                        apiKeys.lmstudio = provider.apiKey;
                    }
                }
            }

            const enabledProviderPayload = buildEnabledProvidersPayload(
                settingsStore.getEnabledProvidersForRecommendation()
            );
            const runtimeMCPServers = buildRuntimeMCPServers(settingsStore.mcpServers);

            const fallbackProviders =
                enabledProviderPayload.length > 0
                    ? enabledProviderPayload.map((provider) => provider.id)
                    : settingsStore.aiProviders
                          .filter((provider) => !!provider.apiKey)
                          .map((provider) => provider.id);

            const payload = JSON.parse(
                JSON.stringify({
                    ...options,
                    apiKeys,
                    enabledProviders: enabledProviderPayload,
                    mcpServers: runtimeMCPServers,
                    fallbackProviders,
                })
            );

            const result = await api.taskExecution.execute(
                task.projectId,
                task.projectSequence,
                payload
            );
            if (!result.success) {
                executionError.value = result.error || 'Execution failed';
            }
            return result;
        } catch (error) {
            executionError.value = (error as Error).message;
            return { success: false, error: executionError.value };
        }
    }

    /**
     * Pause execution via IPC
     */
    async function pauseExecutionViaIPC(task?: { projectId: number; projectSequence: number }) {
        const api = getAPI();
        const target = task
            ? { projectId: task.projectId, sequence: task.projectSequence }
            : currentTaskRef.value;

        if (!api?.taskExecution || !target)
            return { success: false, error: 'API not available or no task ID' };
        return await api.taskExecution.pause(target.projectId, target.sequence);
    }

    /**
     * Resume execution via IPC
     */
    async function resumeExecutionViaIPC(task?: { projectId: number; projectSequence: number }) {
        const api = getAPI();
        const target = task
            ? { projectId: task.projectId, sequence: task.projectSequence }
            : currentTaskRef.value;

        if (!api?.taskExecution || !target)
            return { success: false, error: 'API not available or no task ID' };
        return await api.taskExecution.resume(target.projectId, target.sequence);
    }

    /**
     * Stop execution via IPC
     */
    async function stopExecutionViaIPC(task?: { projectId: number; projectSequence: number }) {
        const api = getAPI();
        const target = task
            ? { projectId: task.projectId, sequence: task.projectSequence }
            : currentTaskRef.value;

        if (!api?.taskExecution || !target)
            return { success: false, error: 'API not available or no task ID' };

        const result = await api.taskExecution.stop(target.projectId, target.sequence);
        if (result.success) {
            isExecuting.value = false;
            // Only clear current task if it matches target
            if (
                currentTaskRef.value &&
                currentTaskRef.value.projectId === target.projectId &&
                currentTaskRef.value.sequence === target.sequence
            ) {
                currentTaskRef.value = null;
            }
        }
        return result;
    }

    /**
     * Approve task (for NEEDS_APPROVAL state)
     */
    async function approveTask(
        task: { projectId: number; projectSequence: number },
        response?: string
    ) {
        const api = getAPI();
        if (!api?.taskExecution) return { success: false, error: 'API not available' };

        const result = await api.taskExecution.approve(
            task.projectId,
            task.projectSequence,
            response
        );
        if (result.success) {
            approvalRequest.value = null;
        }
        return result;
    }

    /**
     * Reject task (for NEEDS_APPROVAL state)
     */
    async function rejectTask(task: { projectId: number; projectSequence: number }) {
        const api = getAPI();
        if (!api?.taskExecution) return { success: false, error: 'API not available' };

        const result = await api.taskExecution.reject(task.projectId, task.projectSequence);
        if (result.success) {
            isExecuting.value = false;
            approvalRequest.value = null;
            if (
                currentTaskRef.value &&
                currentTaskRef.value.projectId === task.projectId &&
                currentTaskRef.value.sequence === task.projectSequence
            ) {
                currentTaskRef.value = null;
            }
        }
        return result;
    }

    /**
     * Setup IPC event listeners for real-time updates
     */
    function setupIPCListeners() {
        const api = getAPI();
        if (!api?.taskExecution) return;

        const isCurrentTask = (data: { projectId: number; projectSequence: number }) => {
            return (
                currentTaskRef.value &&
                currentTaskRef.value.projectId === data.projectId &&
                currentTaskRef.value.sequence === data.projectSequence
            );
        };

        // Progress updates
        const cleanupProgress = api.taskExecution.onProgress(
            (data: { projectId: number; projectSequence: number } & IPCExecutionProgress) => {
                if (isCurrentTask(data)) {
                    const progressValue = data.percentage ?? 0;
                    progress.value = progressValue;
                    if (typeof data.content === 'string') {
                        streamedContent.value = data.content;
                    } else if (data.delta) {
                        streamedContent.value += data.delta;
                    }
                    if (data.tokensUsed && executionStats.value) {
                        executionStats.value.tokensUsed = {
                            prompt: 0,
                            completion: data.tokensUsed,
                            total: data.tokensUsed,
                        };
                    }
                    if (data.cost && executionStats.value) {
                        executionStats.value.cost = data.cost;
                    }
                }
            }
        );
        cleanupFns.value.push(cleanupProgress);

        // Execution completed
        const cleanupCompleted = api.taskExecution.onCompleted(
            (data: {
                projectId: number;
                projectSequence: number;
                result: { cost?: number; model?: string };
            }) => {
                if (isCurrentTask(data)) {
                    isExecuting.value = false;
                    progress.value = 100;
                    if (executionStats.value) {
                        executionStats.value.endTime = Date.now();
                        executionStats.value.duration =
                            executionStats.value.endTime - executionStats.value.startTime;
                        const result = data.result as IPCExecutionResult | undefined;
                        if (result) {
                            executionStats.value.cost = result.cost;
                            executionStats.value.model = result.model;
                        }
                    }
                    // Keep currentTaskRef to display final results
                }
            }
        );
        cleanupFns.value.push(cleanupCompleted);

        // Execution failed
        const cleanupFailed = api.taskExecution.onFailed((data) => {
            if (isCurrentTask(data)) {
                isExecuting.value = false;
                executionError.value = data.error;
            }
        });
        cleanupFns.value.push(cleanupFailed);

        // Paused
        const cleanupPaused = api.taskExecution.onPaused((data) => {
            if (isCurrentTask(data)) {
                isPaused.value = true;
            }
        });
        cleanupFns.value.push(cleanupPaused);

        // Resumed
        const cleanupResumed = api.taskExecution.onResumed((data) => {
            if (isCurrentTask(data)) {
                isPaused.value = false;
            }
        });
        cleanupFns.value.push(cleanupResumed);

        // Stopped
        const cleanupStopped = api.taskExecution.onStopped((data) => {
            if (isCurrentTask(data)) {
                isExecuting.value = false;
                currentTaskRef.value = null;
            }
        });
        cleanupFns.value.push(cleanupStopped);

        // Approval required
        const cleanupApproval = api.taskExecution.onApprovalRequired((data) => {
            if (isCurrentTask(data)) {
                approvalRequest.value = {
                    question: data.question,
                    options: data.options,
                    context: data.context,
                };
            }
        });
        cleanupFns.value.push(cleanupApproval);
    }

    /**
     * Cleanup IPC listeners
     */
    function cleanupIPCListeners() {
        cleanupFns.value.forEach((fn) => fn());
        cleanupFns.value = [];
    }

    // Auto-setup listeners if in component context
    onMounted(() => {
        setupIPCListeners();
    });

    onUnmounted(() => {
        cleanupIPCListeners();
    });

    return {
        // State
        isExecuting,
        isPaused,
        streamedContent,
        executionStats,
        executionError,
        progress,
        currentTaskRef,
        approvalRequest,

        // Computed
        durationFormatted,
        costFormatted,
        hasResults,
        isSuccess,

        // Direct execution methods (for renderer-side AI calls)
        executeTask,
        stopExecution,
        pauseExecution,
        resumeExecution,
        clearResults,

        // IPC-based execution methods (for main process AI calls)
        executeTaskViaIPC,
        pauseExecutionViaIPC,
        resumeExecutionViaIPC,
        stopExecutionViaIPC,
        approveTask,
        rejectTask,
        setupIPCListeners,
        cleanupIPCListeners,
    };
}
