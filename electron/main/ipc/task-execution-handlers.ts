/**
 * Task Execution IPC Handlers
 *
 * Handles IPC communication for AI task execution with streaming support
 */

import { ipcMain, BrowserWindow } from 'electron';
import { AdvancedTaskExecutor } from '../../../src/services/workflow/AdvancedTaskExecutor';
import { PromptMacroService } from '../../../src/services/workflow/PromptMacroService';
import type { EnabledProviderInfo, MCPServerRuntimeConfig } from '@core/types/ai';
import { taskRepository } from '../database/repositories/task-repository';
import { taskHistoryRepository } from '../database/repositories/task-history-repository';
import { projectRepository } from '../database/repositories/project-repository';
import { operatorRepository } from '../database/repositories/operator-repository';
import { resolveAutoReviewProvider } from '../../../src/core/logic/ai-configuration';
import type { Task, TaskTriggerConfig } from '../../../src/core/types/database';
import type { TaskResult } from '../../../src/services/workflow/types';
import { MCPPermissionError } from '../../../src/services/mcp/errors';

/**
 * Get the main window for sending IPC messages
 * Uses BrowserWindow.getAllWindows() to ensure we always have the current window
 */
function getMainWindow(): BrowserWindow | null {
    const windows = BrowserWindow.getAllWindows();
    return windows.length > 0 ? (windows[0] ?? null) : null;
}

/**
 * Send activity log to renderer
 */
function sendActivityLog(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    details?: any
) {
    const win = getMainWindow();
    if (win) {
        win.webContents.send('activity:log', {
            level,
            message,
            details,
            timestamp: new Date(),
        });
    }
}

// Execution state tracking
interface ExecutionState {
    taskId: number;
    status: 'running' | 'paused' | 'stopped' | 'completed' | 'failed' | 'needs_approval';
    startedAt: Date;
    pausedAt?: Date;
    progress: number;
    currentPhase: string;
    streamContent: string;
    error?: string;
}

// Review state tracking
interface ReviewState {
    taskId: number;
    status: 'reviewing' | 'completed' | 'failed';
    startedAt: Date;
    progress: number;
    streamContent: string;
    error?: string;
}

// Active executions map
const activeExecutions: Map<number, ExecutionState> = new Map();
// Active reviews map
const activeReviews: Map<number, ReviewState> = new Map();
const executor = new AdvancedTaskExecutor();

/**
 * Extract dependency task IDs and their execution results for macro substitution/context passing
 */
async function buildDependencyContext(
    task: Task
): Promise<{ dependencyTaskIds: number[]; previousResults: TaskResult[] }> {
    const dependencyTaskIds: number[] = [];
    const triggerConfig = task.triggerConfig as TaskTriggerConfig | null;
    const dependsOn = triggerConfig?.dependsOn;

    if (dependsOn) {
        if (Array.isArray(dependsOn.passResultsFrom) && dependsOn.passResultsFrom.length > 0) {
            dependencyTaskIds.push(...dependsOn.passResultsFrom);
        } else if (Array.isArray(dependsOn.taskIds) && dependsOn.taskIds.length > 0) {
            dependencyTaskIds.push(...dependsOn.taskIds);
        }
    }

    if (dependencyTaskIds.length === 0) {
        return { dependencyTaskIds: [], previousResults: [] };
    }

    console.log(
        `[TaskExecution] Fetching results from ${dependencyTaskIds.length} dependent tasks`
    );

    const previousResults: TaskResult[] = [];

    for (const depTaskId of dependencyTaskIds) {
        const depTask = await taskRepository.findById(depTaskId);
        if (depTask && depTask.executionResult) {
            try {
                const execResult =
                    typeof depTask.executionResult === 'string'
                        ? JSON.parse(depTask.executionResult)
                        : depTask.executionResult;

                const now = new Date();
                previousResults.push({
                    taskId: depTaskId,
                    taskTitle: depTask.title,
                    status: 'success',
                    output: execResult.content || execResult,
                    startTime: depTask.startedAt || now,
                    endTime: depTask.completedAt || now,
                    duration: execResult.duration || 0,
                    retries: 0,
                    metadata: {
                        provider: execResult.provider,
                        model: execResult.model,
                        files: execResult.files, // Preserve created files
                    },
                });

                console.log(
                    `[TaskExecution] Loaded result from task ${depTaskId}: ${depTask.title}`
                );
            } catch (error) {
                console.error(
                    `[TaskExecution] Failed to parse execution result from task ${depTaskId}:`,
                    error
                );
            }
        }
    }

    return { dependencyTaskIds, previousResults };
}

/**
 * Check and execute dependent tasks when a task is completed
 * Finds all tasks that have a triggerConfig.dependsOn containing the completed taskId
 * and auto-executes them if all their dependencies are satisfied
 */
export async function checkAndExecuteDependentTasks(
    completedTaskId: number,
    completedTask: Task
): Promise<void> {
    try {
        console.log(
            `[TaskExecution] Checking dependent tasks for completed task ${completedTaskId}`
        );

        // Get all tasks in the same project
        const allTasks = await taskRepository.findByProject(completedTask.projectId);

        // Find tasks that depend on the completed task
        const dependentTasks = allTasks.filter((task) => {
            const triggerConfig = task.triggerConfig as TaskTriggerConfig | null;

            if (!triggerConfig?.dependsOn?.taskIds) return false;

            if (!triggerConfig.dependsOn.taskIds.includes(completedTaskId)) return false;

            // Check execution policy
            const policy = triggerConfig.dependsOn.executionPolicy || 'once';

            // If policy is 'once', only execute if task is in 'todo' status
            if (policy === 'once' && task.status !== 'todo') {
                return false;
            }

            // If policy is 'repeat', allowed to run again (unless currently running)
            if (policy === 'repeat' && task.status === 'in_progress') {
                return false;
            }

            // Also prevent blocked tasks from auto-running
            if (task.status === 'blocked') return false;

            return true;
        });

        if (dependentTasks.length === 0) {
            console.log(`[TaskExecution] No dependent tasks found for task ${completedTaskId}`);
            return;
        }

        console.log(
            `[TaskExecution] Found ${dependentTasks.length} dependent tasks: ${dependentTasks.map((t) => t.id).join(', ')}`
        );

        // Check each dependent task
        for (const dependentTask of dependentTasks) {
            const triggerConfig = dependentTask.triggerConfig as TaskTriggerConfig | null;

            const dependsOn = triggerConfig?.dependsOn;
            if (!dependsOn?.taskIds) continue;

            const operator = dependsOn.operator || 'all';
            const dependencyTaskIds = dependsOn.taskIds;

            // Check if dependencies are satisfied
            let shouldExecute = false;

            if (operator === 'any') {
                // Any one dependency completed is enough
                shouldExecute = true;
            } else {
                // All dependencies must be completed
                const dependencyTasks = allTasks.filter((t) => dependencyTaskIds.includes(t.id));
                const allCompleted = dependencyTasks.every((t) => t.status === 'done');
                shouldExecute = allCompleted;
            }

            if (shouldExecute) {
                console.log(
                    `[TaskExecution] Auto-executing dependent task ${dependentTask.id} (dependencies satisfied)`
                );

                // Notify frontend about auto-execution
                const win = getMainWindow();
                win?.webContents.send('task:autoExecutionStarting', {
                    taskId: dependentTask.id,
                    triggeredBy: completedTaskId,
                });

                // Execute the task (this will be handled by the frontend's execution flow)
                // We send an event so the frontend can trigger the execution with proper API keys
                win?.webContents.send('task:triggerAutoExecution', {
                    taskId: dependentTask.id,
                    triggeredBy: completedTaskId,
                });
            } else {
                console.log(
                    `[TaskExecution] Task ${dependentTask.id} dependencies not yet satisfied`
                );
            }
        }
    } catch (error) {
        console.error(`[TaskExecution] Error checking dependent tasks:`, error);
    }
}

/**
 * Clear all active executions (called on app startup or for recovery)
 */
export async function clearAllActiveExecutions(): Promise<void> {
    console.log(`[TaskExecution] Clearing ${activeExecutions.size} active executions`);
    activeExecutions.clear();
}

/**
 * Reset stuck tasks in database (tasks with in_progress status but no active execution)
 * Should be called on app startup
 */
export async function resetStuckTasks(): Promise<number> {
    try {
        // Find all tasks with in_progress status
        const inProgressTasks = await taskRepository.findByStatus('in_progress');

        let resetCount = 0;
        for (const task of inProgressTasks) {
            // If no active execution exists for this task, reset it to todo
            if (!activeExecutions.has(task.id)) {
                console.log(
                    `[TaskExecution] Resetting stuck task ${task.id} from in_progress to todo`
                );
                await taskRepository.update(task.id, { status: 'todo' });
                resetCount++;
            }
        }

        if (resetCount > 0) {
            console.log(`[TaskExecution] Reset ${resetCount} stuck tasks to todo status`);
        }

        return resetCount;
    } catch (error) {
        console.error('[TaskExecution] Error resetting stuck tasks:', error);
        return 0;
    }
}

/**
 * Register task execution IPC handlers
 */
export function registerTaskExecutionHandlers(_mainWindow: BrowserWindow | null): void {
    // ========================================
    // Task Execution Handlers
    // ========================================

    /**
     * Execute a task - starts AI execution and streams progress
     */
    ipcMain.handle(
        'taskExecution:execute',
        async (
            _event,
            taskId: number,
            options?: {
                streaming?: boolean;
                timeout?: number;
                fallbackProviders?: string[];
                apiKeys?: {
                    anthropic?: string;
                    openai?: string;
                    google?: string;
                    groq?: string;
                    lmstudio?: string;
                };
                enabledProviders?: EnabledProviderInfo[];
                mcpServers?: MCPServerRuntimeConfig[];
            }
        ) => {
            try {
                // Set API keys if provided
                if (options?.apiKeys) {
                    executor.setApiKeys(options.apiKeys);
                }

                if (options?.enabledProviders) {
                    executor.setEnabledProviders(options.enabledProviders);
                }

                if (options?.mcpServers) {
                    executor.setMCPServers(options.mcpServers);
                }

                // Get task from database
                const task = await taskRepository.findById(taskId);
                if (!task) {
                    throw new Error(`Task ${taskId} not found`);
                }

                // Check if this is a script task - execute locally
                if (task.taskType === 'script') {
                    console.log(`[TaskExecution] Executing script task ${taskId}`);

                    // Initialize execution state
                    const executionState: ExecutionState = {
                        taskId,
                        status: 'running',
                        startedAt: new Date(),
                        progress: 0,
                        currentPhase: 'initializing',
                        streamContent: '',
                    };
                    activeExecutions.set(taskId, executionState);

                    // Update task status to in_progress
                    await taskRepository.update(taskId, { status: 'in_progress' });
                    getMainWindow()?.webContents.send('task:status-changed', {
                        id: taskId,
                        status: 'in_progress',
                    });
                    getMainWindow()?.webContents.send('taskExecution:started', {
                        taskId,
                        startedAt: executionState.startedAt,
                    });

                    try {
                        // Import script executor
                        const { scriptExecutor } = await import('../services/script-executor');

                        // Build dependency context for macro substitution
                        const { previousResults } = await buildDependencyContext(task as Task);

                        // Execute script
                        const result = await scriptExecutor.execute(task as Task, task.projectId);

                        if (result.success) {
                            executionState.status = 'completed';
                            executionState.streamContent = result.output || '';

                            const executionResult = {
                                content: result.output || '',
                                duration: result.duration || 0,
                                provider: 'script',
                                model: task.scriptLanguage || 'javascript',
                                logs: result.logs || [],
                            };

                            // Determine final status based on auto-approve setting
                            const finalStatus = task.autoApprove ? 'done' : 'in_review';
                            const updateData: any = {
                                status: finalStatus,
                                executionResult,
                            };

                            if (task.autoApprove) {
                                updateData.completedAt = new Date().toISOString();
                            }

                            await taskRepository.update(taskId, updateData);

                            getMainWindow()?.webContents.send('task:status-changed', {
                                id: taskId,
                                status: finalStatus,
                            });
                            getMainWindow()?.webContents.send('taskExecution:completed', {
                                taskId,
                                result: executionResult,
                            });

                            // Log execution completed
                            await taskHistoryRepository.logExecutionCompleted(
                                taskId,
                                result.output || '',
                                {
                                    provider: 'script',
                                    model: task.scriptLanguage || 'javascript',
                                    duration: result.duration || 0,
                                }
                            );

                            // Check and execute dependent tasks if auto-approved
                            if (finalStatus === 'done') {
                                await checkAndExecuteDependentTasks(taskId, task as Task);
                            }

                            activeExecutions.delete(taskId);
                            return { success: true, result };
                        } else {
                            throw new Error(result.error || 'Script execution failed');
                        }
                    } catch (error) {
                        executionState.status = 'failed';
                        executionState.error =
                            error instanceof Error ? error.message : String(error);

                        await taskRepository.update(taskId, { status: 'todo' });
                        getMainWindow()?.webContents.send('task:status-changed', {
                            id: taskId,
                            status: 'todo',
                        });
                        getMainWindow()?.webContents.send('taskExecution:failed', {
                            taskId,
                            error: executionState.error,
                        });

                        await taskHistoryRepository.logExecutionFailed(
                            taskId,
                            executionState.error
                        );

                        activeExecutions.delete(taskId);
                        throw error;
                    }
                }

                // Load operator configuration if assigned
                if (task.assignedOperatorId) {
                    try {
                        const operator = await operatorRepository.findById(task.assignedOperatorId);
                        if (operator) {
                            console.log(
                                `[TaskExecution] Using operator ${operator.name} for task ${taskId}`
                            );
                            // operatorConfig removed - properties are applied directly to task

                            // Override task's AI provider and model with operator's settings
                            task.aiProvider = operator.aiProvider;
                            task.aiModel = operator.aiModel;

                            // Prepend operator's system prompt to task description
                            if (operator.systemPrompt) {
                                const originalPrompt =
                                    task.description || task.generatedPrompt || '';
                                task.description = `${operator.systemPrompt}\n\n${originalPrompt}`;
                                console.log(
                                    `[TaskExecution] Prepended operator system prompt to task`
                                );
                            }
                        }
                    } catch (error) {
                        console.error(`[TaskExecution] Failed to load operator:`, error);
                    }
                }

                // Route execution based on provider type using Provider Registry
                const { isLocalAgent, getLocalAgentType } =
                    await import('../config/provider-registry');

                if (task.aiProvider && isLocalAgent(task.aiProvider)) {
                    // This is a Local Agent execution - use Local Agent Session
                    const agentType = getLocalAgentType(task.aiProvider);
                    if (!agentType) {
                        throw new Error(`Invalid local agent provider: ${task.aiProvider}`);
                    }

                    console.log(
                        `[TaskExecution] Routing task ${taskId} to Local Agent: ${agentType}`
                    );

                    // Get project for working directory
                    const project = await projectRepository.findById(task.projectId);
                    const workingDir = project?.baseDevFolder;
                    if (!workingDir) {
                        throw new Error(
                            `Task ${taskId} requires a working directory (baseDevFolder) for local agent execution`
                        );
                    }

                    // Execute using Local Agent Session with file monitoring
                    const { sessionManager } = await import('../services/local-agent-session');
                    const { FileSystemMonitor } = await import('../services/file-system-monitor');
                    // Initialize file system monitor
                    const fsMonitor = new FileSystemMonitor(workingDir);
                    fsMonitor.takeSnapshot();

                    // Fetch dependent task results for context
                    const { previousResults } = await buildDependencyContext(task as Task);

                    // Build task prompt inline
                    const buildTaskPrompt = (task: any, contextResults: any[]) => {
                        let prompt = '';
                        if (task.title) prompt += `# Task: ${task.title}\n\n`;
                        if (task.description) prompt += `${task.description}\n\n`;

                        // Add context from previous tasks
                        if (contextResults && contextResults.length > 0) {
                            prompt += `## Context from Previous Tasks:\n`;
                            contextResults.forEach((res) => {
                                prompt += `### Task: ${res.taskTitle}\n`;

                                // Check if output contains base64 image
                                let outputContent = res.output;
                                if (
                                    typeof outputContent === 'string' &&
                                    isBase64Image(outputContent)
                                ) {
                                    // Save to temp file and replace with path
                                    const imagePath = saveBase64ImageToTempFile(
                                        outputContent,
                                        res.taskId
                                    );
                                    outputContent = `[Image saved to: ${imagePath}]\n\nNote: The image file is available at the path above. You can reference it in your work.`;
                                    console.log(
                                        `[LocalAgent] Converted base64 image to file for context: ${imagePath}`
                                    );
                                }

                                prompt += `Output:\n${outputContent}\n`;

                                // Include file contents if available
                                if (res.metadata?.files && Array.isArray(res.metadata.files)) {
                                    prompt += `\nFiles created in this task:\n`;
                                    res.metadata.files.forEach((f: any) => {
                                        prompt += `- ${f.path} (${f.type}, ${f.size} bytes)\n`;
                                        // Include content for text files to aid the agent
                                        if (f.content && f.size < 50000) {
                                            // Safety limit 50KB
                                            prompt += `\nContent of ${f.path}:\n\`\`\`${f.extension || ''}\n${f.content}\n\`\`\`\n`;
                                        }
                                    });
                                }
                                prompt += `\n---\n\n`;
                            });
                        }

                        if (task.generatedPrompt)
                            prompt += `## Instructions:\n${task.generatedPrompt}\n\n`;

                        if (task.expectedOutputFormat) {
                            const format = task.expectedOutputFormat;
                            prompt += `## Expected Output Format: ${format}\n\n`;
                            const fileFormats = [
                                'html',
                                'css',
                                'javascript',
                                'js',
                                'code',
                                'json',
                                'ts',
                                'typescript',
                                'vue',
                                'py',
                                'python',
                            ];
                            if (
                                fileFormats.includes(format.toLowerCase()) ||
                                format.includes('/')
                            ) {
                                prompt += `## ⚠️ CRITICAL - CREATE ACTUAL FILES ⚠️\n`;
                                prompt += `You MUST create actual file(s) in the current directory matching the requirement.\n`;
                                prompt += `DO NOT just provide examples. USE your file system tools (Write/Create) to CREATE the files on disk.\n\n`;
                            }
                        }
                        return prompt;
                    };

                    // Create session
                    const sessionInfo = await sessionManager.createSession(agentType, workingDir);

                    // Initialize execution state
                    const executionState: ExecutionState = {
                        taskId,
                        status: 'running',
                        startedAt: new Date(),
                        progress: 0,
                        currentPhase: 'initializing',
                        streamContent: '',
                    };
                    activeExecutions.set(taskId, executionState);

                    // Update task status
                    await taskRepository.update(taskId, { status: 'in_progress' });
                    getMainWindow()?.webContents.send('task:status-changed', {
                        id: taskId,
                        status: 'in_progress',
                    });
                    getMainWindow()?.webContents.send('taskExecution:started', {
                        taskId,
                        startedAt: executionState.startedAt,
                    });

                    try {
                        // Build prompt from task with context
                        const prompt = buildTaskPrompt(task, previousResults);

                        // Send message and get response
                        const response = await sessionManager.sendMessage(sessionInfo.id, prompt, {
                            timeout: options?.timeout || 300000,
                            onChunk: (chunk) => {
                                getMainWindow()?.webContents.send('taskExecution:progress', {
                                    taskId,
                                    delta: chunk,
                                    phase: 'executing',
                                });
                            },
                        });

                        // Close session
                        await sessionManager.closeSession(sessionInfo.id);

                        // Detect file changes
                        const fileChanges = fsMonitor.getChanges({ includeContent: true });
                        console.log(`[TaskExecution] Detected ${fileChanges.length} file changes`);

                        if (response.success) {
                            // Log execution started to history
                            await taskHistoryRepository.logExecutionStarted(
                                taskId,
                                task.description || task.generatedPrompt || '',
                                task.aiProvider || 'local',
                                'local-model'
                            );

                            executionState.status = 'completed';
                            executionState.streamContent = response.content;

                            const executionResult = {
                                content: response.content,
                                duration: response.duration,
                                provider: task.aiProvider,
                                tokenUsage: response.tokenUsage,
                                files: fileChanges.map((f) => ({
                                    path: f.relativePath,
                                    absolutePath: f.path,
                                    type: f.type,
                                    content: f.content,
                                    size: f.size,
                                    extension: f.extension,
                                })),
                                transcript: response.transcript,
                            };

                            // Determine final status based on auto-approve setting
                            const finalStatus = task.autoApprove ? 'done' : 'in_review';
                            const updateData: any = {
                                status: finalStatus,
                                executionResult,
                            };

                            // Set completedAt if auto-approved
                            if (task.autoApprove) {
                                updateData.completedAt = new Date().toISOString();
                            }

                            await taskRepository.update(taskId, updateData);

                            getMainWindow()?.webContents.send('task:status-changed', {
                                id: taskId,
                                status: finalStatus,
                            });
                            getMainWindow()?.webContents.send('taskExecution:completed', {
                                taskId,
                                result: executionResult,
                            });

                            // Log execution completed
                            await taskHistoryRepository.logExecutionCompleted(
                                taskId,
                                response.content,
                                {
                                    provider: task.aiProvider || 'local',
                                    model: 'local-model',
                                    cost: 0,
                                    tokens: response.tokenUsage
                                        ? response.tokenUsage.input + response.tokenUsage.output
                                        : 0,
                                    duration: response.duration,
                                },
                                undefined,
                                executionResult
                            );

                            // Check and execute dependent tasks if this task completed successfully
                            if (finalStatus === 'done') {
                                await checkAndExecuteDependentTasks(taskId, task as Task);
                            }

                            activeExecutions.delete(taskId);
                            return { success: true, result: response };
                        } else {
                            throw new Error(response.error || 'Local agent execution failed');
                        }
                    } catch (error) {
                        executionState.status = 'failed';
                        executionState.error =
                            error instanceof Error ? error.message : String(error);

                        await taskRepository.update(taskId, { status: 'todo' });
                        getMainWindow()?.webContents.send('task:status-changed', {
                            id: taskId,
                            status: 'todo',
                        });
                        getMainWindow()?.webContents.send('taskExecution:failed', {
                            taskId,
                            error: executionState.error,
                        });

                        activeExecutions.delete(taskId);
                        throw error;
                    }
                }

                // API Provider execution (existing logic continues below)
                // Check if already executing
                if (activeExecutions.has(taskId)) {
                    const existingState = activeExecutions.get(taskId)!;
                    if (existingState.status === 'running') {
                        throw new Error(`Task ${taskId} is already executing`);
                    }
                }

                // Fetch dependent task results if configured to pass results
                const { previousResults } = await buildDependencyContext(task as Task);

                // Initialize execution state
                const executionState: ExecutionState = {
                    taskId,
                    status: 'running',
                    startedAt: new Date(),
                    progress: 0,
                    currentPhase: 'initializing',
                    streamContent: '',
                };
                activeExecutions.set(taskId, executionState);

                // Update task status to in_progress
                await taskRepository.update(taskId, { status: 'in_progress' });
                getMainWindow()?.webContents.send('task:status-changed', {
                    id: taskId,
                    status: 'in_progress',
                });
                getMainWindow()?.webContents.send('taskExecution:started', {
                    taskId,
                    startedAt: executionState.startedAt,
                });

                // Log execution started to history
                await taskHistoryRepository.logExecutionStarted(
                    taskId,
                    task.description || task.generatedPrompt || '',
                    task.aiProvider || undefined,
                    undefined // model will be determined later
                );

                // Build execution context with previous results from dependent tasks
                const context = executor.buildExecutionContext(task as Task, previousResults);

                // Streaming token callback - sends tokens to frontend via IPC
                const onToken = (token: string) => {
                    const state = activeExecutions.get(taskId);
                    if (state) {
                        state.streamContent += token;
                    }
                    // Send streaming content to frontend
                    const win = getMainWindow();
                    if (win) {
                        // Reduced logging - only log first token
                        if (state && state.streamContent.length < 10) {
                            console.log('[Main IPC] Streaming started for task:', taskId);
                        }
                        win.webContents.send('taskExecution:progress', {
                            taskId,
                            progress: state?.progress ?? 50,
                            phase: 'streaming',
                            delta: token,
                            content: state?.streamContent ?? token,
                        });
                    } else {
                        console.warn('[Main IPC] No window available to send progress');
                    }
                };

                // Progress callback - sends phase updates to frontend via IPC (NOT content - that's handled by onToken)
                const onProgress = (progress: {
                    phase: string;
                    elapsedTime: number;
                    content?: string;
                }) => {
                    const state = activeExecutions.get(taskId);
                    if (state) {
                        state.currentPhase = progress.phase;
                        // Note: Don't append content here - onToken handles streaming content
                        // This prevents duplicate content being sent
                    }
                    const win = getMainWindow();
                    if (win) {
                        // Only send phase updates, not content (content is sent via onToken)
                        // Reduced logging - only log phase changes
                        if (state && state.currentPhase !== progress.phase) {
                            console.log(
                                `[Main IPC] Phase change for task ${taskId}: ${progress.phase}`
                            );
                        }
                        win.webContents.send('taskExecution:progress', {
                            taskId,
                            progress: state?.progress ?? 50,
                            phase: progress.phase,
                            // content is intentionally NOT included here to prevent duplication
                        });
                    } else {
                        console.warn('[Main IPC] No window available to send progress');
                    }
                };

                context.metadata = {
                    streaming: options?.streaming ?? true,
                    timeout: options?.timeout ?? 300000,
                    fallbackProviders: options?.fallbackProviders?.length
                        ? options?.fallbackProviders
                        : ['openai', 'google'],
                    onToken,
                    onProgress,
                };

                // Execute task with progress tracking
                const result = await executor.executeTask(task as Task, context, {
                    timeout: options?.timeout ?? 300000,
                    fallbackProviders: options?.fallbackProviders,
                    onLog: (level, message, details) => {
                        sendActivityLog(level, message, details);
                    },
                });

                // Check execution state (might have been stopped/paused)
                const currentState = activeExecutions.get(taskId);
                if (!currentState || currentState.status === 'stopped') {
                    // Task was stopped, revert to todo
                    await taskRepository.update(taskId, { status: 'todo' });
                    getMainWindow()?.webContents.send('task:status-changed', {
                        id: taskId,
                        status: 'todo',
                    });
                    getMainWindow()?.webContents.send('taskExecution:stopped', { taskId });
                    activeExecutions.delete(taskId);
                    return { success: false, stopped: true };
                }

                if (result.status === 'success') {
                    const aiResult = result.output?.aiResult;
                    const displayContent =
                        aiResult?.value ??
                        (typeof result.output?.content === 'string'
                            ? result.output.content
                            : JSON.stringify(result.output));

                    // Update execution state
                    executionState.status = 'completed';
                    executionState.progress = 100;
                    executionState.currentPhase = 'completed';
                    executionState.streamContent = displayContent;

                    // Prepare execution result
                    const attachments =
                        (result.metadata?.attachments as any) || result.attachments || [];
                    const executionResult = {
                        content: displayContent,
                        aiResult,
                        cost: result.cost,
                        tokens: result.tokens,
                        duration: result.duration,
                        provider: aiResult?.meta?.provider || result.metadata?.provider,
                        model: aiResult?.meta?.model || result.metadata?.model,
                        attachments,
                    };

                    // Determine final status based on auto-approve setting
                    const finalStatus = task.autoApprove ? 'done' : 'in_review';
                    const updateData: any = {
                        status: finalStatus,
                        executionResult: executionResult,
                    };

                    // Set completedAt if auto-approved
                    if (task.autoApprove) {
                        updateData.completedAt = new Date().toISOString();
                    }

                    // Update task with result and status
                    await taskRepository.update(taskId, updateData);

                    console.log(
                        `[Main IPC] Task ${taskId} completed - status: ${finalStatus} ${task.autoApprove ? '(auto-approved)' : ''}`
                    );
                    const completedWin = getMainWindow();
                    completedWin?.webContents.send('task:status-changed', {
                        id: taskId,
                        status: finalStatus,
                    });
                    completedWin?.webContents.send('taskExecution:completed', {
                        taskId,
                        result: {
                            aiResult,
                            content: displayContent,
                            cost: result.cost,
                            tokens: result.tokens,
                            duration: result.duration,
                            provider: aiResult?.meta?.provider || result.metadata?.provider,
                            model: aiResult?.meta?.model || result.metadata?.model,
                            attachments,
                        },
                    });

                    // Log execution completed to history
                    await taskHistoryRepository.logExecutionCompleted(
                        taskId,
                        displayContent || '',
                        {
                            provider: aiResult?.meta?.provider || result.metadata?.provider,
                            model: aiResult?.meta?.model || result.metadata?.model,
                            cost: result.cost,
                            tokens: result.tokens,
                            duration: result.duration,
                        },
                        aiResult
                    );

                    // Check and execute dependent tasks if this task completed successfully
                    if (finalStatus === 'done') {
                        await checkAndExecuteDependentTasks(taskId, task as Task);
                    }

                    activeExecutions.delete(taskId);
                    return { success: true, result };
                } else {
                    // Execution failed
                    executionState.status = 'failed';
                    executionState.error = result.error?.message || 'Unknown error';

                    const permissionError =
                        result.error instanceof MCPPermissionError ? result.error : null;
                    if (permissionError) {
                        const failureContent = buildPermissionDeniedContent(permissionError);
                        const permissionResult = {
                            content: failureContent,
                            aiResult: null,
                            cost: 0,
                            tokens: 0,
                            duration: result.duration || 0,
                            provider: null,
                            model: null,
                            metadata: {
                                permissionDenied: true,
                                missingScopes: permissionError.details?.missingScopes,
                                requiredScopes: permissionError.details?.requiredScopes,
                            },
                        };

                        await taskRepository.update(taskId, {
                            status: 'in_review',
                            executionResult: permissionResult,
                        });

                        const permissionWin = getMainWindow();
                        permissionWin?.webContents.send('task:status-changed', {
                            id: taskId,
                            status: 'in_review',
                        });
                        permissionWin?.webContents.send('taskExecution:completed', {
                            taskId,
                            result: permissionResult,
                        });

                        await taskHistoryRepository.logExecutionFailed(
                            taskId,
                            permissionError.message
                        );

                        activeExecutions.delete(taskId);
                        return { success: false, error: permissionError.message };
                    }

                    // Revert to todo status on failure
                    await taskRepository.update(taskId, { status: 'todo' });
                    console.log('[Main IPC] Sending failed event:', taskId, executionState.error);
                    const failedWin = getMainWindow();
                    failedWin?.webContents.send('task:status-changed', {
                        id: taskId,
                        status: 'todo',
                    });
                    failedWin?.webContents.send('taskExecution:failed', {
                        taskId,
                        error: executionState.error,
                    });

                    // Log execution failed to history
                    await taskHistoryRepository.logExecutionFailed(taskId, executionState.error);

                    activeExecutions.delete(taskId);
                    return { success: false, error: executionState.error };
                }
            } catch (error) {
                console.error('Error executing task:', error);

                // Clean up on error
                activeExecutions.delete(taskId);

                // Revert status
                await taskRepository.update(taskId, { status: 'todo' }).catch(() => {});
                getMainWindow()?.webContents.send('task:status-changed', {
                    id: taskId,
                    status: 'todo',
                });
                getMainWindow()?.webContents.send('taskExecution:failed', {
                    taskId,
                    error: error instanceof Error ? error.message : String(error),
                });

                throw error;
            }
        }
    );

    /**
     * Pause task execution
     */
    ipcMain.handle('taskExecution:pause', async (_event, taskId: number) => {
        try {
            const state = activeExecutions.get(taskId);
            if (!state) {
                throw new Error(`No active execution for task ${taskId}`);
            }

            if (state.status !== 'running') {
                throw new Error(`Task ${taskId} is not running (current status: ${state.status})`);
            }

            state.status = 'paused';
            state.pausedAt = new Date();

            getMainWindow()?.webContents.send('taskExecution:paused', {
                taskId,
                pausedAt: state.pausedAt,
            });

            // Log paused to history
            await taskHistoryRepository.logPaused(taskId);

            return { success: true };
        } catch (error) {
            console.error('Error pausing task:', error);
            throw error;
        }
    });

    /**
     * Resume paused task execution
     */
    ipcMain.handle('taskExecution:resume', async (_event, taskId: number) => {
        try {
            const state = activeExecutions.get(taskId);
            if (!state) {
                throw new Error(`No active execution for task ${taskId}`);
            }

            if (state.status !== 'paused') {
                throw new Error(`Task ${taskId} is not paused (current status: ${state.status})`);
            }

            state.status = 'running';
            state.pausedAt = undefined;

            getMainWindow()?.webContents.send('taskExecution:resumed', { taskId });

            // Log resumed to history
            await taskHistoryRepository.logResumed(taskId);

            return { success: true };
        } catch (error) {
            console.error('Error resuming task:', error);
            throw error;
        }
    });

    /**
     * Stop task execution and revert to TODO
     */
    ipcMain.handle('taskExecution:stop', async (_event, taskId: number) => {
        try {
            const aiCancelled = executor.cancelTaskExecution(taskId);
            if (aiCancelled) {
                console.log(`[TaskExecution] Sent cancel signal to AI provider for task ${taskId}`);
            } else {
                console.warn(
                    `[TaskExecution] No active AI execution found to cancel for task ${taskId}`
                );
            }

            const state = activeExecutions.get(taskId);
            if (state) {
                state.status = 'stopped';
                state.currentPhase = 'stopped';
            }

            // Update task status to todo
            await taskRepository.update(taskId, { status: 'todo' });
            getMainWindow()?.webContents.send('task:status-changed', {
                id: taskId,
                status: 'todo',
            });
            getMainWindow()?.webContents.send('taskExecution:stopped', { taskId });

            // Log stopped to history
            await taskHistoryRepository.logStopped(taskId);

            activeExecutions.delete(taskId);

            return { success: true };
        } catch (error) {
            console.error('Error stopping task:', error);
            throw error;
        }
    });

    /**
     * Get execution status for a task
     */
    ipcMain.handle('taskExecution:getStatus', async (_event, taskId: number) => {
        const state = activeExecutions.get(taskId);
        if (!state) {
            return null;
        }

        return {
            taskId: state.taskId,
            status: state.status,
            startedAt: state.startedAt,
            pausedAt: state.pausedAt,
            progress: state.progress,
            currentPhase: state.currentPhase,
            streamContent: state.streamContent,
            error: state.error,
        };
    });

    /**
     * Get all active executions
     */
    ipcMain.handle('taskExecution:getAllActive', async () => {
        const executions: Array<{
            taskId: number;
            status: string;
            startedAt: Date;
            progress: number;
            currentPhase: string;
        }> = [];

        activeExecutions.forEach((state, taskId) => {
            executions.push({
                taskId,
                status: state.status,
                startedAt: state.startedAt,
                progress: state.progress,
                currentPhase: state.currentPhase,
            });
        });

        return executions;
    });

    // ========================================
    // NEEDS_APPROVAL State Handlers
    // ========================================

    /**
     * Request user approval during execution (AI requested input)
     */
    ipcMain.handle(
        'taskExecution:requestApproval',
        async (
            _event,
            taskId: number,
            data: {
                question: string;
                options?: string[];
                context?: unknown;
            }
        ) => {
            try {
                const state = activeExecutions.get(taskId);
                if (state) {
                    state.status = 'needs_approval';
                    state.currentPhase = 'waiting_for_approval';
                }

                // Update task status to needs_approval
                await taskRepository.update(taskId, {
                    status: 'needs_approval',
                    aiApprovalRequest: JSON.stringify(data),
                });

                getMainWindow()?.webContents.send('task:status-changed', {
                    id: taskId,
                    status: 'needs_approval',
                });
                getMainWindow()?.webContents.send('taskExecution:approvalRequired', {
                    taskId,
                    question: data.question,
                    options: data.options,
                    context: data.context,
                });

                // Log approval requested to history
                await taskHistoryRepository.logApprovalRequested(
                    taskId,
                    data.question,
                    data.options
                );

                return { success: true };
            } catch (error) {
                console.error('Error requesting approval:', error);
                throw error;
            }
        }
    );

    /**
     * Approve and continue execution with user response
     */
    ipcMain.handle('taskExecution:approve', async (_event, taskId: number, response?: string) => {
        try {
            const state = activeExecutions.get(taskId);
            if (state) {
                state.status = 'running';
                state.currentPhase = 'resuming_after_approval';
            }

            // Update task status back to in_progress
            await taskRepository.update(taskId, {
                status: 'in_progress',
                aiApprovalResponse: response,
            });

            getMainWindow()?.webContents.send('task:status-changed', {
                id: taskId,
                status: 'in_progress',
            });
            getMainWindow()?.webContents.send('taskExecution:approved', {
                taskId,
                response,
            });

            // Log approved to history
            await taskHistoryRepository.logApproved(taskId, response);

            return { success: true };
        } catch (error) {
            console.error('Error approving task:', error);
            throw error;
        }
    });

    /**
     * Reject and revert to TODO
     */
    ipcMain.handle('taskExecution:reject', async (_event, taskId: number) => {
        try {
            // Update task status to todo
            await taskRepository.update(taskId, {
                status: 'todo',
                aiApprovalRequest: null,
                aiApprovalResponse: null,
            });

            getMainWindow()?.webContents.send('task:status-changed', {
                id: taskId,
                status: 'todo',
            });
            getMainWindow()?.webContents.send('taskExecution:rejected', { taskId });

            // Log rejected to history
            await taskHistoryRepository.logRejected(taskId);

            activeExecutions.delete(taskId);

            return { success: true };
        } catch (error) {
            console.error('Error rejecting task:', error);
            throw error;
        }
    });

    // ========================================
    // IN_REVIEW State Handlers
    // ========================================

    /**
     * Complete review and move to DONE
     */
    ipcMain.handle('taskExecution:completeReview', async (_event, taskId: number) => {
        try {
            // Get task before updating for dependent task check
            const task = await taskRepository.findById(taskId);
            if (!task) {
                throw new Error(`Task ${taskId} not found`);
            }

            await taskRepository.update(taskId, { status: 'done', completedAt: new Date() });

            getMainWindow()?.webContents.send('task:status-changed', {
                id: taskId,
                status: 'done',
            });
            getMainWindow()?.webContents.send('taskExecution:reviewCompleted', { taskId });

            // Log review completed to history
            await taskHistoryRepository.logReviewCompleted(taskId);

            // Check and execute dependent tasks
            await checkAndExecuteDependentTasks(taskId, { ...task, status: 'done' });

            return { success: true };
        } catch (error) {
            console.error('Error completing review:', error);
            throw error;
        }
    });

    /**
     * Request changes and restart execution
     */
    ipcMain.handle(
        'taskExecution:requestChanges',
        async (_event, taskId: number, refinementPrompt: string) => {
            try {
                // Store the refinement prompt
                await taskRepository.update(taskId, {
                    status: 'in_progress',
                    refinementPrompt,
                });

                getMainWindow()?.webContents.send('task:status-changed', {
                    id: taskId,
                    status: 'in_progress',
                });
                getMainWindow()?.webContents.send('taskExecution:changesRequested', {
                    taskId,
                    refinementPrompt,
                });

                // Log changes requested to history
                await taskHistoryRepository.logChangesRequested(taskId, refinementPrompt);

                return { success: true };
            } catch (error) {
                console.error('Error requesting changes:', error);
                throw error;
            }
        }
    );

    // ========================================
    // DONE State Handlers
    // ========================================

    /**
     * Request additional work on completed task
     */
    ipcMain.handle(
        'taskExecution:requestAdditionalWork',
        async (_event, taskId: number, additionalWorkPrompt: string) => {
            try {
                await taskRepository.update(taskId, {
                    status: 'in_progress',
                    additionalWorkPrompt,
                });

                getMainWindow()?.webContents.send('task:status-changed', {
                    id: taskId,
                    status: 'in_progress',
                });
                getMainWindow()?.webContents.send('taskExecution:additionalWorkRequested', {
                    taskId,
                    additionalWorkPrompt,
                });

                return { success: true };
            } catch (error) {
                console.error('Error requesting additional work:', error);
                throw error;
            }
        }
    );

    // ========================================
    // BLOCKED State Handlers
    // ========================================

    /**
     * Block a task (cancels any active execution)
     */
    ipcMain.handle('taskExecution:block', async (_event, taskId: number, reason?: string) => {
        try {
            // Stop any active execution
            const state = activeExecutions.get(taskId);
            if (state) {
                state.status = 'stopped';
                activeExecutions.delete(taskId);
            }

            await taskRepository.update(taskId, {
                status: 'blocked',
                blockReason: reason,
            });

            getMainWindow()?.webContents.send('task:status-changed', {
                id: taskId,
                status: 'blocked',
            });
            getMainWindow()?.webContents.send('taskExecution:blocked', { taskId, reason });

            return { success: true };
        } catch (error) {
            console.error('Error blocking task:', error);
            throw error;
        }
    });

    /**
     * Unblock a task (moves to TODO)
     */
    ipcMain.handle('taskExecution:unblock', async (_event, taskId: number) => {
        try {
            await taskRepository.update(taskId, {
                status: 'todo',
                blockReason: null,
            });

            getMainWindow()?.webContents.send('task:status-changed', {
                id: taskId,
                status: 'todo',
            });
            getMainWindow()?.webContents.send('taskExecution:unblocked', { taskId });

            return { success: true };
        } catch (error) {
            console.error('Error unblocking task:', error);
            throw error;
        }
    });

    // ========================================
    // Streaming Progress Handler
    // ========================================

    /**
     * Update streaming progress (called internally during execution)
     */
    ipcMain.handle(
        'taskExecution:updateProgress',
        async (
            _event,
            taskId: number,
            progress: {
                percentage: number;
                phase: string;
                content?: string;
                delta?: string;
                tokensUsed?: number;
                cost?: number;
            }
        ) => {
            try {
                const state = activeExecutions.get(taskId);
                if (state) {
                    state.progress = progress.percentage;
                    state.currentPhase = progress.phase;
                    if (progress.content !== undefined) {
                        state.streamContent = progress.content || '';
                    } else if (progress.delta) {
                        state.streamContent += progress.delta;
                    }
                }

                getMainWindow()?.webContents.send('taskExecution:progress', {
                    taskId,
                    progress: progress.percentage,
                    phase: progress.phase,
                    delta: progress.delta,
                    content: state?.streamContent,
                    tokensUsed: progress.tokensUsed,
                    cost: progress.cost,
                });

                return { success: true };
            } catch (error) {
                console.error('Error updating progress:', error);
                throw error;
            }
        }
    );

    // ========================================
    // Recovery Handlers
    // ========================================

    /**
     * Clear all active executions (for recovery)
     */
    ipcMain.handle('taskExecution:clearAll', async () => {
        try {
            const count = activeExecutions.size;
            activeExecutions.clear();
            console.log(`[TaskExecution] Cleared ${count} active executions via IPC`);
            return { success: true, cleared: count };
        } catch (error) {
            console.error('Error clearing active executions:', error);
            throw error;
        }
    });

    /**
     * Reset stuck tasks (tasks with in_progress status but no active execution)
     */
    ipcMain.handle('taskExecution:resetStuck', async () => {
        try {
            const resetCount = await resetStuckTasks();
            return { success: true, reset: resetCount };
        } catch (error) {
            console.error('Error resetting stuck tasks:', error);
            throw error;
        }
    });

    /**
     * Force clear a specific task execution
     */
    ipcMain.handle('taskExecution:forceClear', async (_event, taskId: number) => {
        try {
            const hadExecution = activeExecutions.has(taskId);
            activeExecutions.delete(taskId);

            // Reset task status to todo
            await taskRepository.update(taskId, { status: 'todo' });
            getMainWindow()?.webContents.send('task:status-changed', {
                id: taskId,
                status: 'todo',
            });

            console.log(
                `[TaskExecution] Force cleared task ${taskId} (had execution: ${hadExecution})`
            );
            return { success: true, hadExecution };
        } catch (error) {
            console.error('Error force clearing task:', error);
            throw error;
        }
    });

    // ========================================
    // Auto AI Review Handlers
    // ========================================

    /**
     * Start AI review for a task in IN_REVIEW status
     * Called automatically when autoReview is enabled and task moves to IN_REVIEW
     */
    ipcMain.handle(
        'taskExecution:startAutoReview',
        async (
            _event,
            taskId: number,
            options?: {
                streaming?: boolean;
                apiKeys?: {
                    anthropic?: string;
                    openai?: string;
                    google?: string;
                    groq?: string;
                    lmstudio?: string;
                };
                enabledProviders?: EnabledProviderInfo[];
                mcpServers?: MCPServerRuntimeConfig[];
            }
        ) => {
            try {
                // Set API keys if provided
                if (options?.apiKeys) {
                    executor.setApiKeys(options.apiKeys);
                }

                if (options?.enabledProviders) {
                    executor.setEnabledProviders(options.enabledProviders);
                }

                if (options?.mcpServers) {
                    executor.setMCPServers(options.mcpServers);
                }

                // Get task from database
                const task = await taskRepository.findById(taskId);
                if (!task) {
                    throw new Error(`Task ${taskId} not found`);
                }

                // Verify task is in IN_REVIEW status
                if (task.status !== 'in_review') {
                    throw new Error(
                        `Task ${taskId} is not in IN_REVIEW status (current: ${task.status})`
                    );
                }

                // Check if already reviewing
                if (activeReviews.has(taskId)) {
                    throw new Error(`Task ${taskId} is already being reviewed`);
                }

                // Get execution result
                const executionResult = task.executionResult
                    ? typeof task.executionResult === 'string'
                        ? JSON.parse(task.executionResult)
                        : task.executionResult
                    : null;

                if (!executionResult?.content) {
                    throw new Error(`Task ${taskId} has no execution result to review`);
                }

                const { dependencyTaskIds, previousResults } = await buildDependencyContext(
                    task as Task
                );
                const promptSource = (task.generatedPrompt || task.description || '').trim();
                const hasMacros =
                    promptSource.length > 0 &&
                    PromptMacroService.findMacros(promptSource).length > 0;
                const shouldResolveMacros =
                    task.autoReview && dependencyTaskIds.length > 0 && hasMacros;
                let resolvedPromptForReview = promptSource;

                if (shouldResolveMacros) {
                    try {
                        resolvedPromptForReview = PromptMacroService.replaceMacros(promptSource, {
                            previousResults,
                            variables: {},
                            projectName: (task as any).projectName,
                            projectDescription: (task as any).projectDescription,
                            currentTaskId: task.id,
                        });
                        console.log('[TaskExecution] Resolved macros for auto-review prompt', {
                            taskId,
                            dependencyCount: dependencyTaskIds.length,
                        });
                    } catch (macroError) {
                        console.error(
                            '[TaskExecution] Failed to resolve macros for auto-review prompt:',
                            macroError
                        );
                    }
                }

                // Initialize review state
                const reviewState: ReviewState = {
                    taskId,
                    status: 'reviewing',
                    startedAt: new Date(),
                    progress: 0,
                    streamContent: '',
                };
                activeReviews.set(taskId, reviewState);

                // Notify frontend that review is starting
                const win = getMainWindow();
                win?.webContents.send('taskReview:started', {
                    taskId,
                    startedAt: reviewState.startedAt,
                });

                // Log AI review requested to history
                await taskHistoryRepository.logAIReviewRequested(
                    taskId,
                    resolvedPromptForReview || task.description || task.generatedPrompt || '',
                    executionResult.content
                );

                // Build review prompt
                const reviewPrompt = buildReviewPrompt(
                    task,
                    executionResult.content,
                    resolvedPromptForReview || undefined
                );

                // Fetch project to resolve inheritance
                const project = await projectRepository.findById(task.projectId);

                // Priority 1: Check for reviewer operator
                let effectiveConfig: {
                    provider: string | null;
                    model: string | null;
                    source: string;
                };
                let reviewerOperator: any = null;

                if (task.projectId) {
                    const operators = await operatorRepository.findByProject(task.projectId);
                    reviewerOperator = operators.find(
                        (op: any) => op.isReviewer === 1 || op.isReviewer === true
                    );

                    if (reviewerOperator) {
                        effectiveConfig = {
                            provider: reviewerOperator.aiProvider,
                            model: reviewerOperator.aiModel,
                            source: 'reviewer-operator',
                        };
                    } else {
                        // Priority 2-4: Use standard resolution (Task > Project > Global)
                        effectiveConfig = resolveAutoReviewProvider(task, project as any);
                    }
                } else {
                    effectiveConfig = resolveAutoReviewProvider(task, project as any);
                }

                console.log('[TaskExecution] Starting auto-review with settings:', {
                    taskId,
                    provider: effectiveConfig.provider,
                    model: effectiveConfig.model,
                    source: effectiveConfig.source,
                    streaming: options?.streaming,
                });

                // Streaming callback for review
                const onReviewToken = (token: string) => {
                    const state = activeReviews.get(taskId);
                    if (state) {
                        state.streamContent += token;
                    }
                    // Send streaming content to frontend
                    const reviewWin = getMainWindow();
                    if (reviewWin) {
                        console.log(
                            '[Main IPC] Sending review progress:',
                            taskId,
                            'streaming',
                            token.slice(0, 20)
                        );
                        reviewWin.webContents.send('taskReview:progress', {
                            taskId,
                            progress: state?.progress ?? 50,
                            phase: 'reviewing',
                            content: token,
                        });
                    }
                };

                // Extract image data if execution result contains base64 image
                let imageDataForReview: string | undefined;
                if (isBase64Image(executionResult.content)) {
                    imageDataForReview = executionResult.content;
                    console.log('[TaskExecution] Extracted base64 image for vision review');
                }

                // Execute review with the AI
                const reviewResult = await executor.executeReview(
                    task as Task,
                    reviewPrompt,
                    executionResult.content,
                    {
                        streaming: options?.streaming ?? true,
                        onToken: onReviewToken,
                        aiProvider: effectiveConfig.provider,
                        aiModel: effectiveConfig.model,
                        imageData: imageDataForReview, // Pass image for vision models
                    }
                );

                const currentState = activeReviews.get(taskId);
                if (!currentState) {
                    // Review was cancelled
                    return { success: false, cancelled: true };
                }

                if (reviewResult.success) {
                    // Review completed successfully
                    currentState.status = 'completed';
                    currentState.progress = 100;

                    // Parse review score from content
                    const reviewScore = parseReviewScore(reviewResult.content || '');
                    console.log(
                        `[TaskExecution] Review completed for task ${taskId}. Score: ${reviewScore} (Passed: ${reviewScore >= 8})`
                    );
                    const reviewPassed = reviewScore >= 8;

                    // Save review result
                    const reviewData = {
                        reviewContent: reviewResult.content,
                        reviewedAt: new Date().toISOString(),
                        reviewCost: reviewResult.cost,
                        reviewTokens: reviewResult.tokens,
                        reviewProvider: reviewResult.provider,
                        reviewModel: reviewResult.model,
                        reviewScore,
                        reviewPassed,
                    };

                    // Update task based on review result
                    if (reviewPassed) {
                        // Score 8+ : Move to DONE
                        await taskRepository.update(taskId, {
                            status: 'done',
                            aiReviewResult: JSON.stringify(reviewData),
                            reviewFailed: false,
                            completedAt: new Date(),
                        });
                        win?.webContents.send('task:status-changed', {
                            id: taskId,
                            status: 'done',
                        });

                        // Check and execute dependent tasks when review passed
                        await checkAndExecuteDependentTasks(taskId, { ...task, status: 'done' });
                    } else {
                        // Score 7- : Stay in IN_REVIEW with failed flag
                        await taskRepository.update(taskId, {
                            aiReviewResult: JSON.stringify(reviewData),
                            reviewFailed: true,
                        });
                        // No status change, stays in in_review
                    }

                    // Log AI review completed to history
                    await taskHistoryRepository.logAIReviewCompleted(
                        taskId,
                        reviewResult.content || '',
                        reviewPassed ? '리뷰 통과' : '리뷰 실패 - 재작업 필요',
                        reviewPassed,
                        {
                            provider: reviewResult.provider,
                            model: reviewResult.model,
                            cost: reviewResult.cost,
                            tokens: reviewResult.tokens,
                            score: reviewScore,
                        }
                    );

                    // Notify frontend
                    win?.webContents.send('taskReview:completed', {
                        taskId,
                        result: reviewData,
                        passed: reviewPassed,
                        score: reviewScore,
                    });

                    activeReviews.delete(taskId);
                    return {
                        success: true,
                        result: reviewData,
                        passed: reviewPassed,
                        score: reviewScore,
                    };
                } else {
                    // Review failed
                    currentState.status = 'failed';
                    currentState.error = reviewResult.error || 'Unknown error';

                    win?.webContents.send('taskReview:failed', {
                        taskId,
                        error: currentState.error,
                    });

                    activeReviews.delete(taskId);
                    return { success: false, error: currentState.error };
                }
            } catch (error) {
                console.error('Error starting AI review:', error);
                activeReviews.delete(taskId);
                getMainWindow()?.webContents.send('taskReview:failed', {
                    taskId,
                    error: error instanceof Error ? error.message : String(error),
                });
                throw error;
            }
        }
    );

    /**
     * Get review status for a task
     */
    ipcMain.handle('taskExecution:getReviewStatus', async (_event, taskId: number) => {
        const state = activeReviews.get(taskId);
        if (!state) {
            return null;
        }

        return {
            taskId: state.taskId,
            status: state.status,
            startedAt: state.startedAt,
            progress: state.progress,
            streamContent: state.streamContent,
            error: state.error,
        };
    });

    /**
     * Cancel ongoing AI review
     */
    ipcMain.handle('taskExecution:cancelReview', async (_event, taskId: number) => {
        try {
            const hadReview = activeReviews.has(taskId);
            activeReviews.delete(taskId);

            getMainWindow()?.webContents.send('taskReview:cancelled', { taskId });

            console.log(
                `[TaskExecution] Cancelled review for task ${taskId} (had review: ${hadReview})`
            );
            return { success: true, hadReview };
        } catch (error) {
            console.error('Error cancelling review:', error);
            throw error;
        }
    });

    console.log('Task execution IPC handlers registered');
}

/**
 * Check if a string is a base64-encoded image
 */
function isBase64Image(str: string): boolean {
    // Data URL 형식
    if (str.startsWith('data:image/')) {
        return true;
    }

    // 순수 base64: 길이가 충분히 길고 (50KB 이상), base64 문자만 포함
    if (str.length > 50000 && /^[A-Za-z0-9+/=\s]+$/.test(str)) {
        return true;
    }

    return false;
}

/**
 * Save base64 image to temp file and return file path
 */
function saveBase64ImageToTempFile(base64Data: string, taskId?: number): string {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');

    try {
        // Base64 데이터 형식 감지
        let imageData = base64Data;
        let extension = 'png';

        const dataUrlMatch = base64Data.match(/^data:image\/(\w+);base64,(.+)$/);
        if (dataUrlMatch) {
            extension = dataUrlMatch[1] ?? 'png';
            imageData = dataUrlMatch[2] ?? base64Data;
        }

        // 임시 디렉토리 생성
        const tempDir = path.join(os.tmpdir(), 'workflow-manager-images');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // 파일명 생성
        const timestamp = Date.now();
        const filename = taskId
            ? `task-${taskId}-review-${timestamp}.${extension}`
            : `review-${timestamp}.${extension}`;
        const filePath = path.join(tempDir, filename);

        // Base64 디코딩 후 파일로 저장
        const buffer = Buffer.from(imageData, 'base64');
        fs.writeFileSync(filePath, buffer);

        console.log(`✨ Saved review image to temp file: ${filePath}`);
        return filePath;
    } catch (error) {
        console.error('Failed to save base64 image for review:', error);
        return '[Image save failed]';
    }
}

/**
 * Build a review prompt for AI review
 * Focuses on whether the USER'S ORIGINAL INTENT was fulfilled, not just whether AI responded appropriately
 */
function buildReviewPrompt(
    task: Task,
    executionContent: string,
    executedPromptOverride?: string
): string {
    // 사용자의 원래 입력 프롬프트 (템플릿 치환 전)
    const userOriginalPrompt = task.description || '';
    // 실제 실행된 프롬프트 (템플릿 치환 후)
    const executedPrompt = executedPromptOverride ?? (task.generatedPrompt || userOriginalPrompt);

    // 이미지 결과일 경우 base64를 파일로 저장하고 경로로 대체
    let processedContent = executionContent;
    if (isBase64Image(executionContent)) {
        const imagePath = saveBase64ImageToTempFile(executionContent, task.id);
        // 프롬프트에는 로컬 경로 대신 이미지가 첨부되었다는 사실만 명시 (AI가 로컬 경로를 읽으려 시도하는 것 방지)
        processedContent = `[이미지가 결과물로 생성되었습니다. 첨부된 이미지를 확인하세요.]\n(참고: 내부 저장 경로 ${imagePath})`;
        console.log(`[buildReviewPrompt] Converted base64 image to file: ${imagePath}`);
    }

    return `작업 결과를 검토하세요. **간결하게** 답변하세요.

## 원래 요청
${userOriginalPrompt}

## 실행된 프롬프트
${executedPrompt}

## 실행 결과
${processedContent}

**중요: 만약 실행 결과가 이미지라면, 이 메시지에 첨부된 이미지를 직접 확인하여 평가하세요.**

---

## 판정 기준

**실패 (5점 이하):**
- 프롬프트에 "이전 결과없음", "{{", "}}", "undefined", "null" 포함
- "계산/처리할 수 없다", "정보 부족" 등의 답변
- 구체적 결과물 없음

**통과 (8점 이상):**
- 사용자 의도대로 작업 완료
- 구체적 결과물 존재

---

## 답변 형식 (이 형식만 따르세요)

**의도:** [한 줄 요약]
**결과:** [통과/실패 + 이유 한 줄]
**점수: X/10**`;
}

function buildPermissionDeniedContent(error: MCPPermissionError): string {
    const serverName = error.details?.serverName || error.details?.serverId || 'MCP 서버';
    const missingScopes = error.details?.missingScopes || [];
    const scopeLine =
        missingScopes.length > 0
            ? `\n\n필요 Scope: ${missingScopes.map((scope) => `\`${scope}\``).join(', ')}`
            : '';
    const toolLine = error.details?.toolName ? `\n요청 도구: ${error.details.toolName}` : '';
    return `⚠️ ${serverName} 권한 부족으로 작업을 완료하지 못했습니다.${toolLine}${scopeLine}\n\n설정 > MCP Servers에서 필요한 기능을 활성화한 뒤 다시 실행해 주세요.`;
}

/**
 * Parse review score from AI review content
 * Looks for patterns like "점수: 8/10", "평가 점수: 8점", "8/10점" etc.
 * Returns 5 as default if no score found
 */
function parseReviewScore(content: string): number {
    if (!content) return 5;

    console.log(
        `[ReviewScore] Parsing content (len: ${content.length}): ${content.slice(0, 100).replace(/\n/g, ' ')}...`
    );

    // Various patterns to match score
    const patterns = [
        /평가\s*점수[:\s]*(\d+)\s*[\/점]/i,
        /점수[:\s]*(\d+)\s*[\/점]/i,
        /(\d+)\s*[\/]\s*10\s*점?/i,
        /(\d+)\s*점\s*[\/]\s*10/i,
        /score[:\s]*(\d+)/i,
        /(\d+)\s*out\s*of\s*10/i,
        /총점[:\s]*(\d+)/i,
        /최종\s*점수[:\s]*(\d+)/i,
        /종합\s*점수[:\s]*(\d+)/i,
        /\*\*(\d+)[/점]/i,
        /:\s*(\d+)\s*점/i,
        // Enhanced patterns
        /\[(\d+)\/10\]/i, // [10/10]
        /(\d+)\s*\/\s*10/i, // 10/10 (simple)
        /점수\s*:\s*(\d+)/i, // 점수 : 10
        /Rating\s*:\s*(\d+)/i, // Rating: 10
    ];

    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
            const score = parseInt(match[1], 10);
            if (!isNaN(score) && score >= 0 && score <= 10) {
                console.log(`[ReviewScore] Parsed score: ${score} from pattern: ${pattern}`);
                return score;
            }
        }
    }

    // If no explicit score found, try to infer from keywords
    const lowerContent = content.toLowerCase();
    if (
        lowerContent.includes('훌륭') ||
        lowerContent.includes('완벽') ||
        lowerContent.includes('excellent') ||
        lowerContent.includes('perfect')
    ) {
        console.log('[ReviewScore] Inferred score 9 from keywords');
        return 9;
    }
    if (
        lowerContent.includes('좋음') ||
        lowerContent.includes('good') ||
        lowerContent.includes('잘 수행') ||
        lowerContent.includes('passed')
    ) {
        console.log('[ReviewScore] Inferred score 8 from keywords');
        return 8;
    }
    if (
        lowerContent.includes('개선 필요') ||
        lowerContent.includes('부족') ||
        lowerContent.includes('미흡') ||
        lowerContent.includes('failed')
    ) {
        console.log('[ReviewScore] Inferred score 6 from keywords');
        return 6;
    }
    if (
        lowerContent.includes('실패') ||
        lowerContent.includes('잘못') ||
        lowerContent.includes('오류') ||
        lowerContent.includes('error')
    ) {
        console.log('[ReviewScore] Inferred score 4 from keywords');
        return 4;
    }

    console.log('[ReviewScore] No score pattern found, using default: 5');
    return 5; // Default score if not found
}
