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
import { useConsoleStore } from '../renderer/stores/consoleStore';
import { useTaskStore } from '../renderer/stores/taskStore';
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
    const consoleStore = useConsoleStore();
    const taskStore = useTaskStore();

    const isExecuting = ref(false);
    const isPaused = ref(false);
    const streamedContent = ref('');
    const executionStats = ref<ExecutionStats | null>(null);
    const executionError = ref<string | null>(null);
    const progress = ref(0);
    const ndjsonBuffer = ref(''); // Buffer for parsing NDJSON streams

    // Abort controller for cancellation
    let abortController: AbortController | null = null;

    // Cache for project-sequence -> id mapping to avoid repeated fetches
    const taskMappingCache = ref<Map<string, number>>(new Map());

    /**
     * Helper to get task ID from composite key
     */
    function getTaskIdFromComposite(projectId: number, sequence: number): number | undefined {
        const cacheKey = `${projectId}-${sequence}`;
        if (taskMappingCache.value.has(cacheKey)) {
            return taskMappingCache.value.get(cacheKey);
        }

        const task = taskStore.tasks.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );

        if (task?.id) {
            taskMappingCache.value.set(cacheKey, task.id);
            return task.id;
        }
        return undefined;
    }

    /**
     * Execute a task with AI
     */
    async function executeTask(task: Task): Promise<ExecutionResult | null> {
        if (isExecuting.value) {
            console.warn('Task execution already in progress');
            return null;
        }

        if (!task.id) {
            console.error('Task ID is missing');
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

        // Register with Console
        consoleStore.registerExecution(task, task.aiProvider || 'ai');

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

            // Log prompt to console
            consoleStore.appendEvent(task.id, {
                type: 'user',
                content: prompt, // Or just "Executing task..." if prompt is huge? Default to prompt for now.
            });

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

                    // Update Console
                    consoleStore.streamToLatestEvent(task.id!, delta, { type: 'assistant' });

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

                    // Update Console
                    consoleStore.updateStatus(task.id, 'success');

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

            // Update Console
            consoleStore.updateStatus(task.id, 'failed');
            consoleStore.appendEvent(task.id, {
                type: 'error',
                content: executionError.value,
            });

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
    function stopExecution(task?: Task) {
        if (abortController) {
            abortController.abort();
            isExecuting.value = false;
            executionError.value = 'Execution stopped by user';

            if (task && task.id) {
                consoleStore.updateStatus(task.id, 'failed');
                consoleStore.appendEvent(task.id, {
                    type: 'error',
                    content: 'Execution stopped by user',
                });
            }
        }
    }

    /**
     * Pause execution (not fully supported by all providers)
     */
    function pauseExecution(task?: Task) {
        isPaused.value = true;
        // TODO: Implement pause logic if provider supports it
        if (task && task.id) {
            consoleStore.updateStatus(task.id, 'paused');
        }
    }

    /**
     * Resume execution
     */
    function resumeExecution(task?: Task) {
        isPaused.value = false;
        // TODO: Implement resume logic
        if (task && task.id) {
            consoleStore.updateStatus(task.id, 'running');
        }
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
        ndjsonBuffer.value = ''; // Reset buffer

        // Console Store Registration
        // IPC doesn't give us the full task object here easily
        // But we have the ID, so we can try to find it in store
        const taskInfo = taskStore.tasks.find((t) => t.id === task.id);
        if (taskInfo) {
            consoleStore.registerExecution(taskInfo, taskInfo.aiProvider || 'ipc-agent');
        }

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

        const updateConsole = async (
            data: { projectId: number; projectSequence: number; [key: string]: any },
            updateFn: (taskId: number) => void
        ) => {
            let taskId = getTaskIdFromComposite(data.projectId, data.projectSequence);
            let fetchedTask: any = null;

            // If not found in cache, try to fetch/find it
            if (!taskId) {
                console.debug(
                    `[TaskExecution] Task ${data.projectId}-${data.projectSequence} not in cache, fetching...`
                );
                try {
                    console.debug(
                        `[TaskExecution] Calling taskStore.fetchTask(${data.projectId}, ${data.projectSequence})`
                    );
                    const task = await taskStore.fetchTask(data.projectId, data.projectSequence);
                    fetchedTask = task;
                    console.debug(`[TaskExecution] fetchTask returned:`, task);

                    if (task && typeof task === 'object') {
                        // FIX: If ID is missing (backend issue), generate synthetic ID from composite key
                        // This ensures the console can still function even if finding by key doesn't return the global ID
                        if ('id' in task) {
                            taskId = (task as any).id;
                        } else {
                            // Synthetic ID: projectId * 1000000 + sequence
                            // Assumes < 1,000,000 tasks per project, which is safe
                            taskId = data.projectId * 1000000 + data.projectSequence;
                            console.warn(
                                `[TaskExecution] Task ${data.projectId}-${data.projectSequence} missing ID. Using synthetic ID: ${taskId}`
                            );
                            // Attach the synthetic ID to the task object so we can use it
                            (fetchedTask as any).id = taskId;
                        }

                        if (taskId) {
                            taskMappingCache.value.set(
                                `${data.projectId}-${data.projectSequence}`,
                                taskId
                            );
                        }
                        console.debug(`[TaskExecution] Resolved Task ID: ${taskId}`);
                    } else {
                        console.error(
                            `[TaskExecution] Failed to resolve Task ID. Task object is invalid:`,
                            task
                        );
                    }
                } catch (err) {
                    console.error(
                        `[TaskExecution] Error fetching background task ${data.projectId}-${data.projectSequence}:`,
                        err
                    );
                }
            }

            if (taskId) {
                // Ensure execution is registered in console
                if (!consoleStore.getExecutionByTaskId(taskId)) {
                    console.debug(
                        `[TaskExecution] Registering execution for task ${taskId} in ConsoleStore`
                    );

                    // Use the fetched task if we have it, otherwise try to find it in the store
                    let taskToRegister =
                        fetchedTask || taskStore.tasks.find((t) => t.id === taskId);

                    if (!taskToRegister && taskId > 1000000) {
                        console.warn(
                            `[TaskExecution] Valid task object still undefined for synthetic ID ${taskId}. Creating synthetic logic object.`
                        );
                        // Create a minimal synthetic task object for registration
                        taskToRegister = {
                            id: taskId,
                            projectId: data.projectId,
                            projectSequence: data.projectSequence,
                            title: `Task #${data.projectSequence}`,
                            status: 'running',
                            aiProvider: 'ipc-agent',
                        };
                    }

                    if (taskToRegister) {
                        consoleStore.registerExecution(
                            taskToRegister,
                            taskToRegister.aiProvider || 'ipc-agent'
                        );
                    } else {
                        console.warn(
                            `[TaskExecution] Task object not found in store for ID ${taskId} despite resolving ID.`
                        );
                    }
                }
                updateFn(taskId);
            } else {
                console.warn(
                    `[TaskExecution] Skipping console update - Task ID unresolved for ${data.projectId}-${data.projectSequence}`
                );
            }
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

                // Update Console
                updateConsole(data, (taskId) => {
                    // If content/delta is present, stream it
                    // We try to parse as NDJSON if it looks like it
                    if (data.delta) {
                        // Check if we are in NDJSON mode (heuristic: starts with { or buffer has content)
                        // But gemini-cli output might be mixed? No, usually strict NDJSON.
                        // We accumulate buffer and try to parse lines.
                        ndjsonBuffer.value += data.delta;

                        let newlineIndex;
                        while ((newlineIndex = ndjsonBuffer.value.indexOf('\n')) !== -1) {
                            const line = ndjsonBuffer.value.slice(0, newlineIndex).trim();
                            ndjsonBuffer.value = ndjsonBuffer.value.slice(newlineIndex + 1);

                            if (!line) continue;

                            try {
                                const json = JSON.parse(line);
                                // If valid JSON, check for event types
                                if (
                                    json.type === 'thought' ||
                                    json.type === 'tool_use' ||
                                    json.type === 'tool_result' ||
                                    json.type === 'assistant' ||
                                    json.type === 'user' ||
                                    json.type === 'error'
                                ) {
                                    // It is a valid typed event
                                    // Extract known fields
                                    const { type, content, toolName, input, output, ...rest } =
                                        json;

                                    if (type === 'assistant' && content) {
                                        // Stream to latest assistant event
                                        consoleStore.streamToLatestEvent(taskId, content, {
                                            type: 'assistant',
                                        });
                                    } else {
                                        // Append as new discrete event
                                        consoleStore.appendEvent(taskId, {
                                            type,
                                            content: content || '',
                                            toolName,
                                            input:
                                                typeof input === 'object'
                                                    ? JSON.stringify(input)
                                                    : input,
                                            output:
                                                typeof output === 'object'
                                                    ? JSON.stringify(output)
                                                    : output,
                                            metadata: rest,
                                        });
                                    }
                                } else if (json.content) {
                                    // Unknown JSON but has content, treat as assistant text
                                    consoleStore.streamToLatestEvent(taskId, json.content, {
                                        type: 'assistant',
                                    });
                                } else {
                                    // JSON but no clear content, maybe log it or ignore?
                                    // dump as text if unsure?
                                    consoleStore.streamToLatestEvent(taskId, line + '\n', {
                                        type: 'assistant',
                                    });
                                }
                            } catch (e) {
                                // Not JSON, treat as raw text line
                                // However, if we are in the middle of a stream that IS JSON, we might have split it wrong?
                                // No, we split by newline.
                                // If it fails to parse, it's likely raw text.
                                consoleStore.streamToLatestEvent(taskId, line + '\n', {
                                    type: 'assistant',
                                });
                            }
                        }
                    } else if (data.content && !data.delta) {
                        // Full content update (rare in streaming, but handled)
                        consoleStore.updateLatestEventContent(taskId, data.content, {
                            type: 'assistant',
                        });
                    }
                });
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

                // Update Console
                updateConsole(data, (taskId) => {
                    consoleStore.updateStatus(taskId, 'success');

                    // Get task from store to determine type
                    const task = taskStore.tasks.find(
                        (t) =>
                            t.projectId === data.projectId &&
                            t.projectSequence === data.projectSequence
                    );

                    const taskType = task?.taskType || 'ai';
                    const result = data.result as Record<string, unknown> | undefined;

                    // Debug: Log what we received
                    console.log('[Console] onCompleted - taskType:', taskType, 'result:', result);

                    // Extract content from result (backend sends result.content)
                    const resultContent =
                        (result?.content as string) || (result?.output as string) || '';

                    // Extract and set task result based on type
                    if (taskType === 'input') {
                        // For Input tasks: show the input value
                        const inputValue =
                            resultContent ||
                            task?.output?.text ||
                            task?.executionResult?.content ||
                            '';
                        console.log('[Console] Input task - inputValue:', inputValue);
                        consoleStore.updateTaskResult(taskId, 'input', {
                            inputValue: String(inputValue),
                        });
                        if (inputValue) {
                            consoleStore.appendEvent(taskId, {
                                type: 'user',
                                content: String(inputValue),
                            });
                        }
                    } else if (taskType === 'output') {
                        // For Output tasks: show "#X Result Saved" format
                        const outputPath = task?.outputConfig?.localFile?.pathTemplate || 'file';
                        // Get the content that was saved (from result or executionResult)
                        const savedContent = resultContent || task?.executionResult?.content || '';

                        // Get source task info from dependencies
                        const triggerConfig = task?.triggerConfig as {
                            dependsOn?: { taskIds?: number[] };
                        } | null;
                        const sourceTaskIds = triggerConfig?.dependsOn?.taskIds || [];

                        // Format: "#X Result Saved" or "#X, #Y Result Saved"
                        let resultSavedText = 'Result Saved';
                        if (sourceTaskIds.length > 0) {
                            const sourceRefs = sourceTaskIds.map((seq: number) => `#${seq}`);
                            resultSavedText = `${sourceRefs.join(', ')} Result Saved`;
                        }

                        console.log(
                            '[Console] Output task - savedContent:',
                            savedContent?.substring?.(0, 100) || savedContent
                        );

                        consoleStore.updateTaskResult(taskId, 'output', {
                            outputSummary: resultSavedText,
                            savedContent:
                                String(savedContent).substring(0, 500) +
                                (savedContent.length > 500 ? '...' : ''), // Limit preview
                        });
                        consoleStore.appendEvent(taskId, {
                            type: 'system',
                            content: `✓ ${resultSavedText} → ${outputPath}`,
                        });
                    } else if (taskType === 'script') {
                        // For Script tasks: show return value
                        const returnValue = resultContent || task?.executionResult?.content || '';
                        console.log('[Console] Script task - returnValue:', returnValue);
                        consoleStore.updateTaskResult(taskId, 'script', {
                            returnValue: returnValue,
                        });
                        if (returnValue) {
                            consoleStore.appendEvent(taskId, {
                                type: 'tool_result',
                                content: String(returnValue),
                            });
                        }
                    } else {
                        // For AI tasks: show full response with markdown
                        const ctx = consoleStore.getExecutionByTaskId(taskId);
                        const existingAssistantEvent = ctx?.transcript.find(
                            (e) => e.type === 'assistant'
                        );

                        const aiContent =
                            resultContent ||
                            task?.executionResult?.content ||
                            task?.executionResult?.aiResult?.value ||
                            '';
                        console.log(
                            '[Console] AI task - aiContent:',
                            aiContent?.substring?.(0, 100) || aiContent
                        );

                        consoleStore.updateTaskResult(taskId, 'ai', {
                            content: String(aiContent),
                        });

                        // If there's already an assistant event from streaming, UPDATE it with complete content
                        // This fixes truncation when streaming didn't capture all content
                        if (existingAssistantEvent && aiContent) {
                            console.log(
                                '[Console] Updating existing assistant event with complete content'
                            );
                            existingAssistantEvent.content = String(aiContent);
                            existingAssistantEvent.metadata = {
                                ...existingAssistantEvent.metadata,
                                finalized: true,
                            };
                        } else if (aiContent) {
                            // No existing event, append new one
                            consoleStore.appendEvent(taskId, {
                                type: 'assistant',
                                content: String(aiContent),
                                metadata: { finalized: true },
                            });
                        }
                    }
                });
            }
        );
        cleanupFns.value.push(cleanupCompleted);

        // Execution failed
        const cleanupFailed = api.taskExecution.onFailed((data) => {
            if (isCurrentTask(data)) {
                isExecuting.value = false;
                executionError.value = data.error;
            }

            // Update Console
            updateConsole(data, (taskId) => {
                consoleStore.updateStatus(taskId, 'failed');
                consoleStore.appendEvent(taskId, {
                    type: 'error',
                    content: data.error,
                });
            });
        });
        cleanupFns.value.push(cleanupFailed);

        // Paused
        const cleanupPaused = api.taskExecution.onPaused((data) => {
            if (isCurrentTask(data)) {
                isPaused.value = true;
            }
            // Update Console
            updateConsole(data, (taskId) => {
                consoleStore.updateStatus(taskId, 'paused');
            });
        });
        cleanupFns.value.push(cleanupPaused);

        // Resumed
        const cleanupResumed = api.taskExecution.onResumed((data) => {
            if (isCurrentTask(data)) {
                isPaused.value = false;
            }
            // Update Console
            updateConsole(data, (taskId) => {
                consoleStore.updateStatus(taskId, 'running');
            });
        });
        cleanupFns.value.push(cleanupResumed);

        // Stopped
        const cleanupStopped = api.taskExecution.onStopped((data) => {
            if (isCurrentTask(data)) {
                isExecuting.value = false;
                currentTaskRef.value = null;
            }
            // Update Console
            updateConsole(data, (taskId) => {
                consoleStore.updateStatus(taskId, 'failed'); // Stopped considered failed/cancelled
                consoleStore.appendEvent(taskId, {
                    type: 'error',
                    content: 'Execution stopped externally',
                });
            });
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
            // Update Console? Maybe log a system event needing approval?
            updateConsole(data, (taskId) => {
                consoleStore.updateStatus(taskId, 'waiting');
                consoleStore.appendEvent(taskId, {
                    type: 'system',
                    content: `Approval Required: ${data.question}`,
                });
            });
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

    /**
     * Load recent executions for a project (Hydration)
     */
    async function loadRecentExecutions(projectId: number) {
        const api = getAPI();
        if (!api?.taskExecution?.getRecent) return;

        console.debug(`[TaskExecution] Loading recent executions for project ${projectId}`);
        const result = await api.taskExecution.getRecent(projectId, 50);

        if (result.success && Array.isArray(result.history)) {
            // History is DESC (newest first). Reverse to replay chronologically.
            const history = (result.history as any[]).reverse();

            // Track which tasks we've already registered in this batch to avoid overwriting running state
            // actually registerExecution handles "already running" check.

            for (const event of history) {
                // Resolve Task ID
                let taskId = getTaskIdFromComposite(event.taskProjectId, event.taskSequence);

                // If not found in cache, try task store or generate synthetic
                if (!taskId) {
                    const task = taskStore.tasks.find(
                        (t) =>
                            t.projectId === event.taskProjectId &&
                            t.projectSequence === event.taskSequence
                    );
                    if (task?.id) {
                        taskId = task.id;
                        taskMappingCache.value.set(
                            `${event.taskProjectId}-${event.taskSequence}`,
                            task.id
                        );
                    } else {
                        // Synthetic ID if task not loaded in frontend (e.g. background task)
                        // We must ensure this synthetic ID matches what updateConsole uses
                        taskId = event.taskProjectId * 1000000 + event.taskSequence;
                    }
                }

                // Register if execution started (or if we see an event for it)
                if (
                    event.eventType === 'execution_started' ||
                    !consoleStore.getExecutionByTaskId(taskId)
                ) {
                    // Try to get title from task store, else placeholder
                    const task = taskStore.tasks.find((t) => t.id === taskId) || {
                        id: taskId,
                        projectId: event.taskProjectId,
                        projectSequence: event.taskSequence,
                        title: `Task #${event.taskSequence}`,
                        aiProvider: event.metadata?.provider || 'unknown',
                    };

                    // Only register if not already there (preserve running state if any)
                    // consoleStore.registerExecution creates new if not running.
                    // If it's already "in memory" as running, we shouldn't overwrite it with old history?
                    // But this is "load history".
                    // Ideally we only load history for tasks that are NOT currently active in store?
                    // Or just replay everything. registerExecution checks if "running".
                    consoleStore.registerExecution(task as any, event.metadata?.provider || 'ai');
                }

                // Replay Event
                const mapToConsoleType = (evtType: string): any => {
                    switch (evtType) {
                        case 'execution_started':
                            return 'system';
                        case 'execution_completed':
                            return 'system';
                        case 'execution_failed':
                            return 'error';
                        case 'ai_thought':
                            return 'thought';
                        case 'ai_tool_use':
                            return 'tool_use';
                        case 'ai_tool_result':
                            return 'tool_result';
                        case 'ai_response':
                            return 'assistant';
                        case 'user_input':
                            return 'user';
                        case 'script_output':
                            return 'tool_result';
                        default:
                            return 'system';
                    }
                };

                const type = mapToConsoleType(event.eventType);

                // Extract content
                let content = '';
                let metadata: any = event.metadata || {};

                if (event.eventData) {
                    if (typeof event.eventData === 'string') {
                        content = event.eventData;
                    } else {
                        content = event.eventData.content || event.eventData.error || '';
                        metadata = { ...metadata, ...event.eventData };
                    }
                }

                // Specific handling
                if (event.eventType === 'execution_started') {
                    content = `Execution started. Model: ${event.metadata?.model || 'unknown'}`;
                    // Set status? consoleStore defaults to running.
                } else if (event.eventType === 'execution_completed') {
                    consoleStore.updateStatus(taskId, 'success');
                    content = `Execution completed. Duration: ${event.metadata?.duration}ms`;

                    // Get actual task info to determine taskType and get executionResult
                    const task = taskStore.tasks.find(
                        (t) =>
                            t.projectId === event.taskProjectId &&
                            t.projectSequence === event.taskSequence
                    );

                    const taskType = task?.taskType || 'ai';

                    // Populate taskResult based on task type
                    if (taskType === 'input') {
                        const inputValue =
                            task?.output?.text || task?.executionResult?.content || '';
                        consoleStore.updateTaskResult(taskId, 'input', {
                            inputValue: String(inputValue),
                        });
                        if (inputValue) {
                            consoleStore.appendEvent(taskId, {
                                type: 'user',
                                content: String(inputValue),
                            });
                        }
                    } else if (taskType === 'output') {
                        const outputPath = task?.outputConfig?.localFile?.pathTemplate || 'file';
                        consoleStore.updateTaskResult(taskId, 'output', {
                            outputSummary: `Output saved to ${outputPath}`,
                        });
                    } else if (taskType === 'script') {
                        const returnValue = task?.executionResult?.content || '';
                        consoleStore.updateTaskResult(taskId, 'script', { returnValue });
                        if (returnValue) {
                            consoleStore.appendEvent(taskId, {
                                type: 'tool_result',
                                content: String(returnValue),
                            });
                        }
                    } else {
                        // AI task
                        const aiContent =
                            task?.executionResult?.content ||
                            task?.executionResult?.aiResult?.value ||
                            '';
                        consoleStore.updateTaskResult(taskId, 'ai', { content: String(aiContent) });
                        // Check if transcript already has assistant content
                        const ctx = consoleStore.getExecutionByTaskId(taskId);
                        const hasAssistant = ctx?.transcript.some((e) => e.type === 'assistant');
                        if (!hasAssistant && aiContent) {
                            consoleStore.appendEvent(taskId, {
                                type: 'assistant',
                                content: String(aiContent),
                            });
                        }
                    }
                } else if (event.eventType === 'execution_failed') {
                    consoleStore.updateStatus(taskId, 'failed');
                }

                // Append regular content
                if (content || type === 'tool_use') {
                    // tool_use might have content in metadata
                    console.debug(`[TaskExecution] Replaying event for task ${taskId}:`, {
                        type,
                        content,
                        metadata,
                    });
                    consoleStore.appendEvent(taskId, {
                        type,
                        content,
                        metadata,
                    });
                }
            }
            console.debug(`[TaskExecution] Loaded ${history.length} events from history`);
        } else {
            console.debug('[TaskExecution] No history found or invalid format', result);
        }
    }

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
        loadRecentExecutions,

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
