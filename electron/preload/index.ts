/**
 * Electron Preload Script
 *
 * Exposes a secure API to the renderer process via contextBridge.
 * This is the only way renderer can communicate with main process.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { EnabledProviderInfo, MCPServerRuntimeConfig } from '../../src/core/types/ai';

// Type definitions for the exposed API
export interface ProjectDTO {
    id?: number;
    title: string;
    description?: string;
    status?: string;
    ownerId: number;
}

export interface AppInfo {
    name: string;
    version: string;
    platform: string;
    isDev: boolean;
}

export interface AppPaths {
    userData: string;
    documents: string;
    downloads: string;
    home: string;
}

// ========================================
// Projects API
// ========================================

const projectsAPI = {
    list: (filters?: { status?: string; isArchived?: boolean }) =>
        ipcRenderer.invoke('projects:list', filters),

    get: (id: number) => ipcRenderer.invoke('projects:get', id),

    create: (data: { title: string; description?: string; ownerId: number }) =>
        ipcRenderer.invoke('projects:create', data),

    update: (id: number, data: Partial<{ title: string; description: string; status: string }>) =>
        ipcRenderer.invoke('projects:update', id, data),

    delete: (id: number) => ipcRenderer.invoke('projects:delete', id),

    export: (id: number) => ipcRenderer.invoke('projects:export', id),

    import: (data: unknown) => ipcRenderer.invoke('projects:import', data),

    resetResults: (id: number) => ipcRenderer.invoke('projects:resetResults', id),
};

// ========================================
// Tasks API
// ========================================

// ========================================
// Tasks API
// ========================================

const tasksAPI = {
    list: (projectId: number, filters?: { status?: string }) =>
        ipcRenderer.invoke('tasks:list', projectId, filters),

    get: (id: number) => ipcRenderer.invoke('tasks:get', id),

    create: (data: any) => ipcRenderer.invoke('tasks:create', data),

    update: (
        id: number,
        data: Partial<{ title: string; description: string; status: string; priority: string }>
    ) => ipcRenderer.invoke('tasks:update', id, data),

    delete: (id: number) => ipcRenderer.invoke('tasks:delete', id),

    reorder: (projectId: number, taskIds: number[]) =>
        ipcRenderer.invoke('tasks:reorder', projectId, taskIds),

    executeScript: (taskId: number) => ipcRenderer.invoke('tasks:execute-script', taskId),

    stopTask: (taskId: number) => ipcRenderer.invoke('taskExecution:stop', taskId),

    sendTestNotification: (taskId: number, config: any) =>
        ipcRenderer.invoke('tasks:send-test-notification', taskId, config),

    updateNotificationConfig: (taskId: number, config: any) =>
        ipcRenderer.invoke('tasks:update-notification-config', taskId, config),
};

// ========================================
// App API
// ========================================

const appAPI = {
    getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:getInfo'),

    onNotification: (
        callback: (data: { type: string; message: string; duration?: number }) => void
    ) => {
        const handler = (_event: any, data: any) => {
            console.log('[Preload] Received app:notification', data);
            callback(data);
        };
        ipcRenderer.on('app:notification', handler);
        return () => ipcRenderer.removeListener('app:notification', handler);
    },

    getPaths: (): Promise<AppPaths> => ipcRenderer.invoke('app:getPaths'),

    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
};

// ========================================
// Window API
// ========================================

const windowAPI = {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),

    // Event listeners for window state changes
    onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, isMaximized: boolean) =>
            callback(isMaximized);
        ipcRenderer.on('window:maximized-changed', handler);
        return () => ipcRenderer.removeListener('window:maximized-changed', handler);
    },
};

// ========================================
// Database API (for advanced queries)
// ========================================

const databaseAPI = {
    // Execute a raw query (for admin/debug purposes only)
    query: (sql: string, params?: unknown[]) => ipcRenderer.invoke('database:query', sql, params),

    // Get database stats
    stats: () => ipcRenderer.invoke('database:stats'),

    // Backup database
    backup: (path: string) => ipcRenderer.invoke('database:backup', path),
};

// ========================================
// Operators API
// ========================================

const operatorsAPI = {
    list: (projectId: number | null) => ipcRenderer.invoke('operators:list', projectId),

    get: (id: number) => ipcRenderer.invoke('operators:get', id),

    getWithMCPs: (id: number) => ipcRenderer.invoke('operators:getWithMCPs', id),

    create: (data: unknown) => ipcRenderer.invoke('operators:create', data),

    update: (id: number, data: unknown) => ipcRenderer.invoke('operators:update', id, data),

    delete: (id: number) => ipcRenderer.invoke('operators:delete', id),

    getMCPs: (operatorId: number) => ipcRenderer.invoke('operators:getMCPs', operatorId),

    updateMCPs: (operatorId: number, mcps: unknown[]) =>
        ipcRenderer.invoke('operators:updateMCPs', operatorId, mcps),

    getReviewers: (projectId: number | null) =>
        ipcRenderer.invoke('operators:getReviewers', projectId),
};

// ========================================
// Event System
// ========================================

const eventsAPI = {
    // Subscribe to events from main process
    on: (channel: string, callback: (...args: unknown[]) => void) => {
        const validChannels = [
            'project:created',
            'project:updated',
            'project:deleted',
            'task:created',
            'task:updated',
            'task:deleted',
            'task:status-changed',
            'sync:status',
            'notification:new',
            // Workflow events
            'workflow:created',
            'workflow:status-changed',
            'workflow:progress',
            'workflow:task-completed',
            'workflow:deleted',
            // Checkpoint events
            'checkpoint:created',
            'checkpoint:deleted',
            // Automation rule events
            'automationRule:created',
            'automationRule:updated',
            'automationRule:toggled',
            'automationRule:deleted',
            // Local agent session events
            'localAgents:sessionMessage',
            'localAgents:sessionResponse',
            'localAgents:sessionError',
            'localAgents:sessionClosed',
            // Task execution events
            'taskExecution:started',
            'taskExecution:progress',
            'taskExecution:completed',
            'taskExecution:failed',
            'taskExecution:paused',
            'taskExecution:resumed',
            'taskExecution:stopped',
            'taskExecution:approvalRequired',
            'taskExecution:approved',
            'taskExecution:rejected',
            'taskExecution:reviewCompleted',
            'taskExecution:changesRequested',
            'taskExecution:additionalWorkRequested',
            'taskExecution:blocked',
            'taskExecution:unblocked',
            // Auto-execution trigger events
            'task:triggerAutoExecution',
            'task:autoExecutionStarting',
            // Activity Logging
            'task:autoExecutionStarting',
            // Activity Logging
            'activity:log',
            // Curator Events
            'curator:started',
            'curator:step',
            'curator:completed',
        ];

        if (validChannels.includes(channel)) {
            const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
                callback(...args);
            ipcRenderer.on(channel, handler);
            return () => ipcRenderer.removeListener(channel, handler);
        }
        console.warn(`Invalid channel: ${channel}`);
        return () => {};
    },

    // One-time event listener
    once: (channel: string, callback: (...args: unknown[]) => void) => {
        const validChannels = ['app:ready', 'database:initialized'];

        if (validChannels.includes(channel)) {
            ipcRenderer.once(channel, (_event, ...args) => callback(...args));
        } else {
            console.warn(`Invalid channel: ${channel}`);
        }
    },
};

// ========================================
// Shell API (for external links)
// ========================================

const shellAPI = {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

    showItemInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path),

    openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
};

// ========================================
// System API (command execution)
// ========================================

const systemAPI = {
    runCommand: (payload: {
        command: string;
        args?: string[];
        cwd?: string;
        env?: Record<string, string>;
        shell?: boolean;
        timeoutMs?: number;
    }) => ipcRenderer.invoke('system:runCommand', payload),

    getPrompts: (): Promise<Record<string, string>> => ipcRenderer.invoke('system:get-prompts'),
};

// ========================================
// File System API
// ========================================

// Repository discovery types
interface DiscoveredRepo {
    path: string;
    name: string;
    type: 'git' | 'claude-code' | 'codex' | 'antigravity';
    lastModified: Date;
    description?: string;
    remoteUrl?: string;
}

interface RepoTypeCheck {
    path: string;
    name: string;
    types: string[];
    description?: string;
    remoteUrl?: string;
    isValid: boolean;
}

const fsAPI = {
    // Read directory contents
    readDir: (
        dirPath: string
    ): Promise<{ name: string; path: string; isDirectory: boolean; size: number }[]> =>
        ipcRenderer.invoke('fs:readDir', dirPath),

    // Read file contents
    readFile: (filePath: string): Promise<string> => ipcRenderer.invoke('fs:readFile', filePath),

    // Check if path exists
    exists: (path: string): Promise<boolean> => ipcRenderer.invoke('fs:exists', path),

    // Get file/directory stats
    stat: (path: string): Promise<{ size: number; isDirectory: boolean; mtime: Date }> =>
        ipcRenderer.invoke('fs:stat', path),

    // Select directory dialog
    selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('fs:selectDirectory'),

    // Select file dialog
    selectFile: (filters?: { name: string; extensions: string[] }[]): Promise<string | null> =>
        ipcRenderer.invoke('fs:selectFile', filters),

    // Scan for local repositories (git, claude-code, codex, antigravity)
    scanRepositories: (options?: {
        searchPaths?: string[];
        maxDepth?: number;
        includeGit?: boolean;
        includeClaudeCode?: boolean;
        includeCodex?: boolean;
        includeAntigravity?: boolean;
    }): Promise<DiscoveredRepo[]> => ipcRenderer.invoke('fs:scanRepositories', options),

    // Check directory for repository type
    checkRepoType: (dirPath: string): Promise<RepoTypeCheck> =>
        ipcRenderer.invoke('fs:checkRepoType', dirPath),

    // Read Claude Desktop configuration
    readClaudeSettings: (): Promise<any | null> => ipcRenderer.invoke('fs:readClaudeSettings'),
};

// ========================================
// Workflow API
// ========================================

type WorkflowStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

const workflowAPI = {
    // Workflow Executions
    create: (data: {
        workflowId: string;
        projectId: number;
        totalTasks: number;
        totalStages: number;
        startedBy: number;
        executionPlan?: unknown;
        context?: unknown;
        estimatedDuration?: number;
    }) => ipcRenderer.invoke('workflow:create', data),

    get: (workflowId: string) => ipcRenderer.invoke('workflow:get', workflowId),

    getById: (id: number) => ipcRenderer.invoke('workflow:getById', id),

    list: (projectId: number, filters?: { status?: WorkflowStatus; limit?: number }) =>
        ipcRenderer.invoke('workflow:list', projectId, filters),

    listActive: (projectId?: number) => ipcRenderer.invoke('workflow:listActive', projectId),

    updateStatus: (workflowId: string, status: WorkflowStatus, additionalData?: unknown) =>
        ipcRenderer.invoke('workflow:updateStatus', workflowId, status, additionalData),

    updateProgress: (
        workflowId: string,
        progress: {
            completedTasks?: number;
            failedTasks?: number;
            currentStage?: number;
            totalCost?: number;
            totalTokens?: number;
        }
    ) => ipcRenderer.invoke('workflow:updateProgress', workflowId, progress),

    addTaskResult: (workflowId: string, taskResult: unknown) =>
        ipcRenderer.invoke('workflow:addTaskResult', workflowId, taskResult),

    delete: (id: number) => ipcRenderer.invoke('workflow:delete', id),

    stats: (projectId: number) => ipcRenderer.invoke('workflow:stats', projectId),
};

// ========================================
// Checkpoint API
// ========================================

const checkpointAPI = {
    create: (data: {
        checkpointId: string;
        workflowExecutionId: number;
        workflowId: string;
        stageIndex: number;
        completedTaskIds: number[];
        context: unknown;
        metadata?: unknown;
    }) => ipcRenderer.invoke('checkpoint:create', data),

    get: (checkpointId: string) => ipcRenderer.invoke('checkpoint:get', checkpointId),

    getLatest: (workflowId: string) => ipcRenderer.invoke('checkpoint:getLatest', workflowId),

    list: (workflowId: string) => ipcRenderer.invoke('checkpoint:list', workflowId),

    delete: (id: number) => ipcRenderer.invoke('checkpoint:delete', id),

    cleanup: (workflowId: string, keepCount?: number) =>
        ipcRenderer.invoke('checkpoint:cleanup', workflowId, keepCount),
};

// ========================================
// Automation Rule API
// ========================================

const automationRuleAPI = {
    create: (data: {
        ruleId: string;
        name: string;
        description?: string;
        projectId?: number;
        enabled?: boolean;
        trigger: unknown;
        conditions?: unknown[];
        actions: unknown[];
        createdBy: number;
    }) => ipcRenderer.invoke('automationRule:create', data),

    get: (ruleId: string) => ipcRenderer.invoke('automationRule:get', ruleId),

    list: (filters?: { projectId?: number; enabled?: boolean }) =>
        ipcRenderer.invoke('automationRule:list', filters),

    listEnabled: (projectId?: number) =>
        ipcRenderer.invoke('automationRule:listEnabled', projectId),

    update: (ruleId: string, data: Partial<unknown>) =>
        ipcRenderer.invoke('automationRule:update', ruleId, data),

    toggle: (ruleId: string) => ipcRenderer.invoke('automationRule:toggle', ruleId),

    incrementExecution: (ruleId: string) =>
        ipcRenderer.invoke('automationRule:incrementExecution', ruleId),

    delete: (ruleId: string) => ipcRenderer.invoke('automationRule:delete', ruleId),
};

// ========================================
// Local Agents API
// ========================================

interface AgentCheckResult {
    installed: boolean;
    version?: string;
}

// Session types
type SessionStatus = 'idle' | 'running' | 'waiting' | 'error' | 'closed';

interface SessionInfo {
    id: string;
    agentType: 'claude' | 'codex' | 'antigravity';
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

const localAgentsAPI = {
    // Check if a local agent CLI is installed
    checkInstalled: (command: string): Promise<AgentCheckResult> =>
        ipcRenderer.invoke('localAgents:checkInstalled', command),

    // Launch agent in a new terminal window
    launchInTerminal: (command: string): Promise<void> =>
        ipcRenderer.invoke('localAgents:launchInTerminal', command),

    // ========================================
    // Session Management
    // ========================================

    // Create a new agent session
    createSession: (
        agentType: 'claude' | 'codex' | 'antigravity',
        workingDirectory: string,
        sessionId?: string
    ): Promise<SessionInfo> =>
        ipcRenderer.invoke('localAgents:createSession', agentType, workingDirectory, sessionId),

    // Get session info by ID
    getSession: (sessionId: string): Promise<SessionInfo | null> =>
        ipcRenderer.invoke('localAgents:getSession', sessionId),

    // Get all active sessions
    getAllSessions: (): Promise<SessionInfo[]> => ipcRenderer.invoke('localAgents:getAllSessions'),

    // Send a message to a session and get response
    sendMessage: (
        sessionId: string,
        message: string,
        options?: SendMessageOptions
    ): Promise<AgentResponse> =>
        ipcRenderer.invoke('localAgents:sendMessage', sessionId, message, options),

    // Close a specific session
    closeSession: (sessionId: string): Promise<void> =>
        ipcRenderer.invoke('localAgents:closeSession', sessionId),

    // Close all sessions
    closeAllSessions: (): Promise<void> => ipcRenderer.invoke('localAgents:closeAllSessions'),

    // Get total number of active sessions
    getSessionCount: (): Promise<number> => ipcRenderer.invoke('localAgents:getSessionCount'),

    // ========================================
    // Session Event Listeners
    // ========================================

    // Listen for session messages (streaming)
    onSessionMessage: (callback: (sessionId: string, message: unknown) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, sessionId: string, message: unknown) =>
            callback(sessionId, message);
        ipcRenderer.on('localAgents:sessionMessage', handler);
        return () => ipcRenderer.removeListener('localAgents:sessionMessage', handler);
    },

    // Listen for session responses (completed)
    onSessionResponse: (callback: (sessionId: string, response: AgentResponse) => void) => {
        const handler = (
            _event: Electron.IpcRendererEvent,
            sessionId: string,
            response: AgentResponse
        ) => callback(sessionId, response);
        ipcRenderer.on('localAgents:sessionResponse', handler);
        return () => ipcRenderer.removeListener('localAgents:sessionResponse', handler);
    },

    // Listen for session errors
    onSessionError: (callback: (sessionId: string, error: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, sessionId: string, error: string) =>
            callback(sessionId, error);
        ipcRenderer.on('localAgents:sessionError', handler);
        return () => ipcRenderer.removeListener('localAgents:sessionError', handler);
    },

    // Listen for session closed events
    onSessionClosed: (callback: (sessionId: string) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, sessionId: string) =>
            callback(sessionId);
        ipcRenderer.on('localAgents:sessionClosed', handler);
        return () => ipcRenderer.removeListener('localAgents:sessionClosed', handler);
    },
};

// ========================================
// Local Providers API
// ========================================

const localProvidersAPI = {
    fetchLmStudioModels: (baseUrl?: string) =>
        ipcRenderer.invoke('localProviders:fetchLmStudioModels', baseUrl),
};

// ========================================
// Task Execution API
// ========================================

interface ExecutionStatus {
    taskId: number;
    status: 'running' | 'paused' | 'stopped' | 'completed' | 'failed' | 'needs_approval';
    startedAt: Date;
    pausedAt?: Date;
    progress: number;
    currentPhase: string;
    streamContent: string;
    error?: string;
}

interface ExecutionOptions {
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

interface ExecutionResult {
    success: boolean;
    result?: unknown;
    error?: string;
    stopped?: boolean;
}

interface ProgressData {
    taskId: number;
    progress?: number;
    phase?: string;
    content?: string; // cumulative content
    delta?: string; // latest delta chunk
    tokensUsed?: number;
    cost?: number;
}

const taskExecutionAPI = {
    // Core execution control
    execute: (taskId: number, options?: ExecutionOptions): Promise<ExecutionResult> =>
        ipcRenderer.invoke('taskExecution:execute', taskId, options),

    pause: (taskId: number): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('taskExecution:pause', taskId),

    resume: (taskId: number): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('taskExecution:resume', taskId),

    stop: (taskId: number): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('taskExecution:stop', taskId),

    // Global Execution Control
    pauseAll: (): Promise<boolean> => ipcRenderer.invoke('taskExecution:pauseAll'),
    resumeAll: (): Promise<boolean> => ipcRenderer.invoke('taskExecution:resumeAll'),
    getGlobalPauseStatus: (): Promise<boolean> =>
        ipcRenderer.invoke('taskExecution:getGlobalPauseStatus'),

    // Status queries
    getStatus: (taskId: number): Promise<ExecutionStatus | null> =>
        ipcRenderer.invoke('taskExecution:getStatus', taskId),

    getAllActive: (): Promise<
        Array<{
            taskId: number;
            status: string;
            startedAt: Date;
            progress: number;
            currentPhase: string;
        }>
    > => ipcRenderer.invoke('taskExecution:getAllActive'),

    // NEEDS_APPROVAL state handlers
    requestApproval: (
        taskId: number,
        data: { question: string; options?: string[]; context?: unknown }
    ): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('taskExecution:requestApproval', taskId, data),

    approve: (taskId: number, response?: string): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('taskExecution:approve', taskId, response),

    reject: (taskId: number): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('taskExecution:reject', taskId),

    // Input task handlers
    submitInput: (taskId: number, payload: any): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('task:submitInput', taskId, payload),

    // IN_REVIEW state handlers
    completeReview: (taskId: number): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('taskExecution:completeReview', taskId),

    requestChanges: (taskId: number, refinementPrompt: string): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('taskExecution:requestChanges', taskId, refinementPrompt),

    // DONE state handlers
    requestAdditionalWork: (
        taskId: number,
        additionalWorkPrompt: string
    ): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('taskExecution:requestAdditionalWork', taskId, additionalWorkPrompt),

    // BLOCKED state handlers
    block: (taskId: number, reason?: string): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('taskExecution:block', taskId, reason),

    unblock: (taskId: number): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('taskExecution:unblock', taskId),

    // Progress update
    updateProgress: (
        taskId: number,
        progress: {
            percentage: number;
            phase: string;
            content?: string;
            tokensUsed?: number;
            cost?: number;
        }
    ): Promise<{ success: boolean }> =>
        ipcRenderer.invoke('taskExecution:updateProgress', taskId, progress),

    // ========================================
    // Recovery Methods
    // ========================================

    // Clear all active executions (for recovery)
    clearAll: (): Promise<{ success: boolean; cleared: number }> =>
        ipcRenderer.invoke('taskExecution:clearAll'),

    // Reset stuck tasks (tasks with in_progress status but no active execution)
    resetStuck: (): Promise<{ success: boolean; reset: number }> =>
        ipcRenderer.invoke('taskExecution:resetStuck'),

    // Force clear a specific task execution and reset to todo
    forceClear: (taskId: number): Promise<{ success: boolean; hadExecution: boolean }> =>
        ipcRenderer.invoke('taskExecution:forceClear', taskId),

    // ========================================
    // Auto AI Review Methods
    // ========================================

    // Start auto AI review for a task in IN_REVIEW status
    startAutoReview: (
        taskId: number,
        options?: ExecutionOptions
    ): Promise<{ success: boolean; result?: unknown; error?: string }> =>
        ipcRenderer.invoke('taskExecution:startAutoReview', taskId, options),

    // Get review status for a task
    getReviewStatus: (
        taskId: number
    ): Promise<{
        taskId: number;
        status: string;
        startedAt: Date;
        progress: number;
        streamContent: string;
        error?: string;
    } | null> => ipcRenderer.invoke('taskExecution:getReviewStatus', taskId),

    // Cancel ongoing AI review
    cancelReview: (taskId: number): Promise<{ success: boolean; hadReview: boolean }> =>
        ipcRenderer.invoke('taskExecution:cancelReview', taskId),

    // ========================================
    // Event Listeners
    // ========================================

    onStarted: (callback: (data: { taskId: number; startedAt: Date }) => void) => {
        const handler = (
            _event: Electron.IpcRendererEvent,
            data: { taskId: number; startedAt: Date }
        ) => {
            console.log('[Preload] taskExecution:started received:', data.taskId);
            callback(data);
        };
        ipcRenderer.on('taskExecution:started', handler);
        return () => ipcRenderer.removeListener('taskExecution:started', handler);
    },

    onProgress: (callback: (data: ProgressData) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, data: ProgressData) => {
            // Verbose logging removed - only start/completion summaries logged
            callback(data);
        };
        ipcRenderer.on('taskExecution:progress', handler);
        return () => ipcRenderer.removeListener('taskExecution:progress', handler);
    },

    onCompleted: (callback: (data: { taskId: number; result: unknown }) => void) => {
        const handler = (
            _event: Electron.IpcRendererEvent,
            data: { taskId: number; result: unknown }
        ) => {
            console.log('[Preload] taskExecution:completed received:', data.taskId);
            callback(data);
        };
        ipcRenderer.on('taskExecution:completed', handler);
        return () => ipcRenderer.removeListener('taskExecution:completed', handler);
    },

    onFailed: (callback: (data: { taskId: number; error: string }) => void) => {
        const handler = (
            _event: Electron.IpcRendererEvent,
            data: { taskId: number; error: string }
        ) => callback(data);
        ipcRenderer.on('taskExecution:failed', handler);
        return () => ipcRenderer.removeListener('taskExecution:failed', handler);
    },

    onPaused: (callback: (data: { taskId: number; pausedAt: Date }) => void) => {
        const handler = (
            _event: Electron.IpcRendererEvent,
            data: { taskId: number; pausedAt: Date }
        ) => callback(data);
        ipcRenderer.on('taskExecution:paused', handler);
        return () => ipcRenderer.removeListener('taskExecution:paused', handler);
    },

    onResumed: (callback: (data: { taskId: number }) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, data: { taskId: number }) =>
            callback(data);
        ipcRenderer.on('taskExecution:resumed', handler);
        return () => ipcRenderer.removeListener('taskExecution:resumed', handler);
    },

    onStopped: (callback: (data: { taskId: number }) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, data: { taskId: number }) =>
            callback(data);
        ipcRenderer.on('taskExecution:stopped', handler);
        return () => ipcRenderer.removeListener('taskExecution:stopped', handler);
    },

    onApprovalRequired: (
        callback: (data: {
            taskId: number;
            question: string;
            options?: string[];
            context?: unknown;
        }) => void
    ) => {
        const handler = (
            _event: Electron.IpcRendererEvent,
            data: { taskId: number; question: string; options?: string[]; context?: unknown }
        ) => callback(data);
        ipcRenderer.on('taskExecution:approvalRequired', handler);
        return () => ipcRenderer.removeListener('taskExecution:approvalRequired', handler);
    },

    onApproved: (callback: (data: { taskId: number; response?: string }) => void) => {
        const handler = (
            _event: Electron.IpcRendererEvent,
            data: { taskId: number; response?: string }
        ) => callback(data);
        ipcRenderer.on('taskExecution:approved', handler);
        return () => ipcRenderer.removeListener('taskExecution:approved', handler);
    },

    onRejected: (callback: (data: { taskId: number }) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, data: { taskId: number }) =>
            callback(data);
        ipcRenderer.on('taskExecution:rejected', handler);
        return () => ipcRenderer.removeListener('taskExecution:rejected', handler);
    },

    onReviewCompleted: (callback: (data: { taskId: number }) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, data: { taskId: number }) =>
            callback(data);
        ipcRenderer.on('taskExecution:reviewCompleted', handler);
        return () => ipcRenderer.removeListener('taskExecution:reviewCompleted', handler);
    },

    onChangesRequested: (
        callback: (data: { taskId: number; refinementPrompt: string }) => void
    ) => {
        const handler = (
            _event: Electron.IpcRendererEvent,
            data: { taskId: number; refinementPrompt: string }
        ) => callback(data);
        ipcRenderer.on('taskExecution:changesRequested', handler);
        return () => ipcRenderer.removeListener('taskExecution:changesRequested', handler);
    },

    onAdditionalWorkRequested: (
        callback: (data: { taskId: number; additionalWorkPrompt: string }) => void
    ) => {
        const handler = (
            _event: Electron.IpcRendererEvent,
            data: { taskId: number; additionalWorkPrompt: string }
        ) => callback(data);
        ipcRenderer.on('taskExecution:additionalWorkRequested', handler);
        return () => ipcRenderer.removeListener('taskExecution:additionalWorkRequested', handler);
    },

    onBlocked: (callback: (data: { taskId: number; reason?: string }) => void) => {
        const handler = (
            _event: Electron.IpcRendererEvent,
            data: { taskId: number; reason?: string }
        ) => callback(data);
        ipcRenderer.on('taskExecution:blocked', handler);
        return () => ipcRenderer.removeListener('taskExecution:blocked', handler);
    },

    onUnblocked: (callback: (data: { taskId: number }) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, data: { taskId: number }) =>
            callback(data);
        ipcRenderer.on('taskExecution:unblocked', handler);
        return () => ipcRenderer.removeListener('taskExecution:unblocked', handler);
    },

    // ========================================
    // Auto AI Review Event Listeners
    // ========================================

    onReviewStarted: (callback: (data: { taskId: number; startedAt: Date }) => void) => {
        const handler = (
            _event: Electron.IpcRendererEvent,
            data: { taskId: number; startedAt: Date }
        ) => {
            console.log('[Preload] taskReview:started received:', data.taskId);
            callback(data);
        };
        ipcRenderer.on('taskReview:started', handler);
        return () => ipcRenderer.removeListener('taskReview:started', handler);
    },

    onReviewProgress: (
        callback: (data: {
            taskId: number;
            progress: number;
            phase: string;
            content?: string;
        }) => void
    ) => {
        const handler = (
            _event: Electron.IpcRendererEvent,
            data: {
                taskId: number;
                progress: number;
                phase: string;
                content?: string;
            }
        ) => {
            console.log(
                '[Preload] taskReview:progress received:',
                data.taskId,
                data.phase,
                data.content?.slice(0, 30)
            );
            callback(data);
        };
        ipcRenderer.on('taskReview:progress', handler);
        return () => ipcRenderer.removeListener('taskReview:progress', handler);
    },

    onAutoReviewCompleted: (
        callback: (data: {
            taskId: number;
            result: unknown;
            passed: boolean;
            score: number;
        }) => void
    ) => {
        const handler = (
            _event: Electron.IpcRendererEvent,
            data: { taskId: number; result: unknown; passed: boolean; score: number }
        ) => {
            console.log(
                '[Preload] taskReview:completed received:',
                data.taskId,
                'passed:',
                data.passed,
                'score:',
                data.score
            );
            callback(data);
        };
        ipcRenderer.on('taskReview:completed', handler);
        return () => ipcRenderer.removeListener('taskReview:completed', handler);
    },

    onReviewFailed: (callback: (data: { taskId: number; error: string }) => void) => {
        const handler = (
            _event: Electron.IpcRendererEvent,
            data: { taskId: number; error: string }
        ) => callback(data);
        ipcRenderer.on('taskReview:failed', handler);
        return () => ipcRenderer.removeListener('taskReview:failed', handler);
    },

    onReviewCancelled: (callback: (data: { taskId: number }) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, data: { taskId: number }) =>
            callback(data);
        ipcRenderer.on('taskReview:cancelled', handler);
        return () => ipcRenderer.removeListener('taskReview:cancelled', handler);
    },
};

// ========================================
// Task History API
// ========================================

const taskHistoryAPI = {
    // Get all history entries for a task
    getByTask: (taskId: number) => ipcRenderer.invoke('taskHistory:getByTask', taskId),

    getByTaskId: (taskId: number, limit?: number) =>
        ipcRenderer.invoke('taskHistory:getByTaskId', taskId, limit),

    // Get history entries by event type
    getByEventType: (taskId: number, eventType: string) =>
        ipcRenderer.invoke('taskHistory:getByEventType', taskId, eventType),

    // Get the latest history entry for a task
    getLatest: (taskId: number) => ipcRenderer.invoke('taskHistory:getLatest', taskId),

    // Add a history entry
    add: (
        taskId: number,
        eventType: string,
        eventData?: Record<string, unknown>,
        metadata?: Record<string, unknown>
    ) => ipcRenderer.invoke('taskHistory:add', taskId, eventType, eventData, metadata),
};

// ========================================
// Auth API
// ========================================

const authAPI = {
    // Google OAuth login
    login: () => ipcRenderer.invoke('auth:login'),

    // Logout
    logout: () => ipcRenderer.invoke('auth:logout'),

    // Get current authenticated user
    getCurrentUser: () => ipcRenderer.invoke('auth:getCurrentUser'),

    // Get session token
    getSessionToken: () => ipcRenderer.invoke('auth:getSessionToken'),
};

// ========================================
// HTTP API (Authenticated Requests)
// ========================================

const httpAPI = {
    // Generic authenticated HTTP request
    request: (params: {
        method: 'get' | 'post' | 'put' | 'delete' | 'patch';
        url: string;
        data?: any;
        params?: Record<string, any>;
    }) => ipcRenderer.invoke('http:request', params),
};

// ========================================
// AI API
// ========================================

const aiAPI = {
    fetchModels: (providerId: string, apiKey?: string) =>
        ipcRenderer.invoke('ai:fetchModels', providerId, apiKey),
    getModelsFromCache: (providerId: string) =>
        ipcRenderer.invoke('ai:getModelsFromCache', providerId),
};

// ========================================
// Expose APIs to renderer via contextBridge
// ========================================

const electronAPI = {
    // Main APIs
    projects: projectsAPI,
    tasks: tasksAPI,
    app: appAPI,
    window: windowAPI,
    database: databaseAPI,
    events: eventsAPI,
    shell: shellAPI,
    system: systemAPI,
    fs: fsAPI,
    workflow: workflowAPI,
    checkpoint: checkpointAPI,
    automationRule: automationRuleAPI,
    localAgents: localAgentsAPI,
    localProviders: localProvidersAPI,
    taskExecution: taskExecutionAPI,
    taskHistory: taskHistoryAPI,
    operators: operatorsAPI,
    auth: authAPI,
    http: httpAPI,
    ai: aiAPI,
};

// Expose to renderer
contextBridge.exposeInMainWorld('electron', electronAPI);

// Type declaration for renderer
export type ElectronAPI = typeof electronAPI;

// Export session types for use in renderer
export type { SessionInfo, AgentResponse, SendMessageOptions, SessionStatus };

// Also expose in development for debugging
if (process.env.NODE_ENV === 'development') {
    console.log('Preload script loaded - electron API exposed');
}
