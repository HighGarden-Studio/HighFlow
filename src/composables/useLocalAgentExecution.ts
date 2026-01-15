/**
 * Local Agent Execution Composable
 *
 * Handles task execution via local AI coding agents (Claude Code, Codex)
 * with session-based communication and context preservation
 */

import { ref, computed, onUnmounted } from 'vue';
import type { Task } from '@core/types/database';

// Type definitions matching preload API
type LocalAgentType = 'claude' | 'codex';
type SessionStatus = 'idle' | 'running' | 'waiting' | 'error' | 'closed';

interface SessionInfo {
    id: string;
    agentType: LocalAgentType;
    status: SessionStatus;
    workingDirectory: string;
    createdAt: Date;
    lastActivityAt: Date;
    messageCount: number;
}

interface AgentResponse {
    success: boolean;
    content: string;
    error?: string;
    duration: number;
    tokenUsage?: {
        input: number;
        output: number;
    };
}

interface SendMessageOptions {
    timeout?: number;
    tools?: string[];
    model?: string;
}

interface LocalAgentExecutionStats {
    startTime: number;
    endTime?: number;
    duration?: number;
    sessionId: string;
    agentType: LocalAgentType;
    messageCount: number;
    tokenUsage?: {
        input: number;
        output: number;
    };
}

interface LocalAgentExecutionResult {
    content: string;
    stats: LocalAgentExecutionStats;
    error?: string;
}

export function useLocalAgentExecution() {
    // State
    const isExecuting = ref(false);
    const currentSession = ref<SessionInfo | null>(null);
    const streamedContent = ref('');
    const executionStats = ref<LocalAgentExecutionStats | null>(null);
    const executionError = ref<string | null>(null);
    const progress = ref(0);
    const messages = ref<{ role: 'user' | 'assistant'; content: string; timestamp: Date }[]>([]);

    const transcript = ref<any[]>([]);

    // Agent availability check
    const installedAgents = ref<Map<LocalAgentType, { installed: boolean; version?: string }>>(
        new Map()
    );

    // Cleanup functions for event listeners
    const cleanupFunctions: (() => void)[] = [];

    /**
     * Check which local agents are installed
     */
    async function checkInstalledAgents(): Promise<
        Map<LocalAgentType, { installed: boolean; version?: string }>
    > {
        const agents: LocalAgentType[] = ['claude', 'codex'];
        const results = new Map<LocalAgentType, { installed: boolean; version?: string }>();

        for (const agent of agents) {
            try {
                const result = await window.electron.localAgents.checkInstalled(agent);
                results.set(agent, result);
            } catch (error) {
                console.error(`Failed to check ${agent} installation:`, error);
                results.set(agent, { installed: false });
            }
        }

        installedAgents.value = results;
        return results;
    }

    /**
     * Create a new agent session
     */
    async function createSession(
        agentType: LocalAgentType,
        workingDirectory: string
    ): Promise<SessionInfo | null> {
        try {
            const session = await window.electron.localAgents.createSession(
                agentType,
                workingDirectory
            );
            currentSession.value = session;
            transcript.value = []; // Reset transcript on new session

            // Set up event listeners
            setupEventListeners();

            return session;
        } catch (error) {
            console.error('Failed to create agent session:', error);
            executionError.value = (error as Error).message;
            return null;
        }
    }

    /**
     * Set up event listeners for session events
     */
    function setupEventListeners() {
        // Session message listener (streaming)
        const cleanupMessage = window.electron.localAgents.onSessionMessage(
            (sessionId, message) => {
                if (currentSession.value?.id === sessionId) {
                    console.log('[LocalAgentExecution] Message received:', message);

                    // Add to transcript
                    if (typeof message === 'object' && message !== null) {
                        transcript.value.push({
                            timestamp: new Date(),
                            ...(message as Record<string, unknown>),
                        });
                    }

                    // Handle streaming message content for legacy support
                    if (typeof message === 'object' && message !== null) {
                        const msg = message as Record<string, unknown>;
                        if (msg.type === 'assistant' && msg.message) {
                            const msgBody = msg.message as any;
                            if (msgBody?.content && Array.isArray(msgBody.content)) {
                                const text = msgBody.content
                                    .filter((c: any) => c.type === 'text')
                                    .map((c: any) => c.text)
                                    .join('');
                                if (text) {
                                    streamedContent.value += text;
                                }
                            }
                        } else if (msg.content && typeof msg.content === 'string') {
                            streamedContent.value += msg.content;
                        }
                    }
                }
            }
        );
        cleanupFunctions.push(cleanupMessage);

        // Session response listener (completed)
        const cleanupResponse = window.electron.localAgents.onSessionResponse(
            (sessionId, response) => {
                if (currentSession.value?.id === sessionId) {
                    console.log('[LocalAgentExecution] Response received:', response);
                    if (response.success) {
                        streamedContent.value = response.content;
                    }
                }
            }
        );
        cleanupFunctions.push(cleanupResponse);

        // Session error listener
        const cleanupError = window.electron.localAgents.onSessionError((sessionId, error) => {
            if (currentSession.value?.id === sessionId) {
                console.error('[LocalAgentExecution] Session error:', error);
                executionError.value = error;
            }
        });
        cleanupFunctions.push(cleanupError);

        // Session closed listener
        const cleanupClosed = window.electron.localAgents.onSessionClosed((sessionId) => {
            if (currentSession.value?.id === sessionId) {
                console.log('[LocalAgentExecution] Session closed');
                currentSession.value = null;
                isExecuting.value = false;
            }
        });
        cleanupFunctions.push(cleanupClosed);
    }

    /**
     * Send a message to the current session
     */
    async function sendMessage(
        message: string,
        options?: SendMessageOptions
    ): Promise<AgentResponse | null> {
        if (!currentSession.value) {
            executionError.value = 'No active session';
            return null;
        }

        if (isExecuting.value) {
            console.warn('Execution already in progress');
            return null;
        }

        isExecuting.value = true;
        streamedContent.value = '';
        executionError.value = null;
        progress.value = 0;

        // Add user message to history
        messages.value.push({
            role: 'user',
            content: message,
            timestamp: new Date(),
        });

        // Initialize stats
        const startTime = Date.now();

        try {
            const response = await window.electron.localAgents.sendMessage(
                currentSession.value.id,
                message,
                options
            );

            // Update stats
            executionStats.value = {
                startTime,
                endTime: Date.now(),
                duration: Date.now() - startTime,
                sessionId: currentSession.value.id,
                agentType: currentSession.value.agentType,
                messageCount: currentSession.value.messageCount + 1,
                tokenUsage: response.tokenUsage,
            };

            // Add assistant message to history
            messages.value.push({
                role: 'assistant',
                content: response.content,
                timestamp: new Date(),
            });

            progress.value = 100;

            return response;
        } catch (error) {
            console.error('Failed to send message:', error);
            executionError.value = (error as Error).message;
            return null;
        } finally {
            isExecuting.value = false;
        }
    }

    /**
     * Execute a task with local agent
     */
    async function executeTaskWithLocalAgent(
        task: Task,
        agentType: LocalAgentType,
        workingDirectory: string,
        options?: SendMessageOptions
    ): Promise<LocalAgentExecutionResult | null> {
        // Create session if not exists or different agent type
        if (!currentSession.value || currentSession.value.agentType !== agentType) {
            await closeSession();
            const session = await createSession(agentType, workingDirectory);
            if (!session) {
                return null;
            }
        }

        // Build prompt from task
        const prompt = buildTaskPrompt(task);

        // Execute
        const response = await sendMessage(prompt, options);

        if (!response) {
            return null;
        }

        return {
            content: response.content,
            stats: executionStats.value!,
            error: response.error,
        };
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

        // Add output format instructions if specified
        if (task.expectedOutputFormat) {
            const outputFormat = task.expectedOutputFormat;
            prompt += `## Expected Output Format: ${outputFormat}\n\n`;

            // For file-based outputs, add VERY explicit file creation instruction
            const fileFormats = [
                'html',
                'css',
                'javascript',
                'js',
                'typescript',
                'ts',
                'code',
                'json',
                'yaml',
                'yml',
                'xml',
                'svg',
                'markdown',
                'md',
                'text',
                'txt',
                'python',
                'py',
            ];
            if (fileFormats.includes(outputFormat.toLowerCase())) {
                prompt += `## ⚠️ CRITICAL REQUIREMENT - FILE CREATION MANDATORY ⚠️\n\n`;
                prompt += `You MUST create actual ${outputFormat.toUpperCase()} file(s) in the current working directory.\n\n`;
                prompt += `**DO NOT:**\n`;
                prompt += `- ❌ Provide code examples or snippets for the user to copy\n`;
                prompt += `- ❌ Explain how to create files\n`;
                prompt += `- ❌ Show what the code should look like\n`;
                prompt += `- ❌ Give instructions for manual file creation\n\n`;
                prompt += `**YOU MUST:**\n`;
                prompt += `- ✅ Use your file system tools to CREATE the actual file(s)\n`;
                prompt += `- ✅ Write the complete code directly to the file(s)\n`;
                prompt += `- ✅ Save the file(s) in the current working directory\n`;
                prompt += `- ✅ Confirm that the file(s) have been created successfully\n\n`;
                prompt += `This is a DEVELOPMENT ENVIRONMENT. You have write access to the file system. The user expects REAL FILES to be created, not explanations.\n\n`;
            }
        }

        return prompt;
    }

    /**
     * Close current session
     */
    async function closeSession(): Promise<void> {
        if (currentSession.value) {
            try {
                await window.electron.localAgents.closeSession(currentSession.value.id);
            } catch (error) {
                console.error('Failed to close session:', error);
            }
            currentSession.value = null;
        }

        // Clean up event listeners
        cleanupFunctions.forEach((cleanup) => cleanup());
        cleanupFunctions.length = 0;
    }

    /**
     * Clear results
     */
    function clearResults() {
        streamedContent.value = '';
        executionStats.value = null;
        executionError.value = null;
        progress.value = 0;
        messages.value = [];
        transcript.value = [];
    }

    /**
     * Get session info
     */
    async function refreshSessionInfo(): Promise<void> {
        if (currentSession.value) {
            try {
                const info = await window.electron.localAgents.getSession(currentSession.value.id);
                if (info) {
                    currentSession.value = info;
                }
            } catch (error) {
                console.error('Failed to refresh session info:', error);
            }
        }
    }

    // Computed properties
    const hasActiveSession = computed(() => currentSession.value !== null);

    const sessionStatus = computed(() => currentSession.value?.status ?? 'closed');

    const durationFormatted = computed(() => {
        if (!executionStats.value?.duration) return null;
        const seconds = Math.floor(executionStats.value.duration / 1000);
        const minutes = Math.floor(seconds / 60);
        if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        }
        return `${seconds}s`;
    });

    const hasResults = computed(() => streamedContent.value.length > 0);

    const isSuccess = computed(() => hasResults.value && !executionError.value);

    // Cleanup on unmount
    onUnmounted(() => {
        closeSession();
    });

    return {
        // State
        isExecuting,
        currentSession,
        streamedContent,
        executionStats,
        executionError,
        progress,
        messages,
        installedAgents,

        // Computed
        hasActiveSession,
        sessionStatus,
        durationFormatted,
        hasResults,
        isSuccess,

        // Methods
        checkInstalledAgents,
        createSession,
        sendMessage,
        executeTaskWithLocalAgent,
        closeSession,
        clearResults,
        refreshSessionInfo,
    };
}
