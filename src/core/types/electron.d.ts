/**
 * Electron API Type Declarations
 *
 * Type definitions for the Electron IPC bridge exposed via preload
 */

import type { Project, Task, NewProject, NewTask } from '@core/types/database';
import type { EnabledProviderInfo, MCPServerRuntimeConfig } from './ai';

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

export interface ProjectFilters {
    status?: string;
    isArchived?: boolean;
}

export interface TaskFilters {
    status?: string;
    priority?: string;
    assigneeId?: number;
}

export interface ProjectsAPI {
    list: (filters?: ProjectFilters) => Promise<Project[]>;
    get: (id: number) => Promise<Project | null>;
    create: (data: {
        title: string;
        description?: string;
        ownerId: number;
        baseDevFolder?: string | null;
        projectGuidelines?: string | null;
    }) => Promise<Project>;
    update: (
        id: number,
        data: Partial<{
            title: string;
            description: string;
            status: string;
            emoji?: string | null;
            baseDevFolder?: string | null;
            projectGuidelines?: string | null;
        }>
    ) => Promise<Project>;
    delete: (id: number) => Promise<void>;
    export: (id: number) => Promise<unknown>;
    import: (data: unknown) => Promise<Project>;
    resetResults: (id: number) => Promise<void>;
}

export interface TasksAPI {
    list: (projectId: number, filters?: TaskFilters) => Promise<Task[]>;
    get: (id: number) => Promise<Task | null>;
    create: (data: Partial<NewTask> & { projectId: number; title: string }) => Promise<Task>;
    update: (
        id: number,
        data: Partial<{ title: string; description: string; status: string; priority: string }>
    ) => Promise<Task>;
    delete: (id: number) => Promise<void>;
    reorder: (projectId: number, taskIds: number[]) => Promise<void>;
    executeScript: (taskId: number) => Promise<{
        success: boolean;
        output: string;
        error?: string;
        logs: string[];
        duration: number;
    }>;
}

export interface AppAPI {
    getInfo: () => Promise<AppInfo>;
    getPaths: () => Promise<AppPaths>;
    getVersion: () => Promise<string>;
}

export interface WindowAPI {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
    isMaximized: () => Promise<boolean>;
    onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;
}

export interface DatabaseAPI {
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
    stats: () => Promise<unknown>;
    backup: (path: string) => Promise<void>;
}

export interface EventsAPI {
    on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
    once: (channel: string, callback: (...args: unknown[]) => void) => void;
}

export interface ShellAPI {
    openExternal: (url: string) => Promise<void>;
    showItemInFolder: (path: string) => Promise<void>;
    openPath: (path: string) => Promise<boolean>;
}

export interface TaskExecutionOptions {
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

export interface RunCommandOptions {
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    shell?: boolean;
    timeoutMs?: number;
}

export interface RunCommandResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    command: string;
}

export interface SystemAPI {
    runCommand: (options: RunCommandOptions) => Promise<RunCommandResult>;
    getPrompts: () => Promise<Record<string, string>>;
}

export interface FileInfo {
    name: string;
    path: string;
    isDirectory: boolean;
    size: number;
}

export interface FileStat {
    size: number;
    isDirectory: boolean;
    mtime: Date;
}

export interface FsAPI {
    readDir: (dirPath: string) => Promise<FileInfo[]>;
    readFile: (filePath: string) => Promise<string>;
    readFileBase64: (filePath: string) => Promise<string>;
    exists: (path: string) => Promise<boolean>;
    stat: (path: string) => Promise<FileStat>;
    selectDirectory: () => Promise<string | null>;
    selectFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>;
}

export type WorkflowStatus =
    | 'pending'
    | 'running'
    | 'paused'
    | 'completed'
    | 'failed'
    | 'cancelled';

export interface WorkflowAPI {
    create: (data: {
        workflowId: string;
        projectId: number;
        totalTasks: number;
        totalStages: number;
        startedBy: number;
        executionPlan?: unknown;
        context?: unknown;
        estimatedDuration?: number;
    }) => Promise<unknown>;
    get: (workflowId: string) => Promise<unknown>;
    getById: (id: number) => Promise<unknown>;
    list: (
        projectId: number,
        filters?: { status?: WorkflowStatus; limit?: number }
    ) => Promise<unknown[]>;
    listActive: (projectId?: number) => Promise<unknown[]>;
    updateStatus: (
        workflowId: string,
        status: WorkflowStatus,
        additionalData?: unknown
    ) => Promise<unknown>;
    updateProgress: (
        workflowId: string,
        progress: {
            completedTasks?: number;
            failedTasks?: number;
            currentStage?: number;
            totalCost?: number;
            totalTokens?: number;
        }
    ) => Promise<unknown>;
    addTaskResult: (workflowId: string, taskResult: unknown) => Promise<unknown>;
    delete: (id: number) => Promise<void>;
    stats: (projectId: number) => Promise<unknown>;
}

export interface CheckpointAPI {
    create: (data: {
        checkpointId: string;
        workflowExecutionId: number;
        workflowId: string;
        stageIndex: number;
        completedTaskIds: number[];
        context: unknown;
        metadata?: unknown;
    }) => Promise<unknown>;
    get: (checkpointId: string) => Promise<unknown>;
    getLatest: (workflowId: string) => Promise<unknown>;
    list: (workflowId: string) => Promise<unknown[]>;
    delete: (id: number) => Promise<void>;
    cleanup: (workflowId: string, keepCount?: number) => Promise<number>;
}

export interface AutomationRuleAPI {
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
    }) => Promise<unknown>;
    get: (ruleId: string) => Promise<unknown>;
    list: (filters?: { projectId?: number; enabled?: boolean }) => Promise<unknown[]>;
    listEnabled: (projectId?: number) => Promise<unknown[]>;
    update: (ruleId: string, data: Partial<unknown>) => Promise<unknown>;
    toggle: (ruleId: string) => Promise<unknown>;
    incrementExecution: (ruleId: string) => Promise<unknown>;
    delete: (ruleId: string) => Promise<void>;
}

export interface StoreAPI {
    get: <T = unknown>(key: string) => Promise<T | null>;
    set: <T = unknown>(key: string, value: T) => Promise<void>;
    delete: (key: string) => Promise<void>;
    has: (key: string) => Promise<boolean>;
}

// Local Agents Types
export type LocalAgentType = 'claude' | 'codex' | 'antigravity';
export type SessionStatus = 'idle' | 'running' | 'waiting' | 'error' | 'closed';

export interface AgentCheckResult {
    installed: boolean;
    version?: string;
}

export interface SessionInfo {
    id: string;
    agentType: LocalAgentType;
    status: SessionStatus;
    workingDirectory: string;
    createdAt: Date;
    lastActivityAt: Date;
    messageCount: number;
}

export interface AgentResponse {
    success: boolean;
    content: string;
    error?: string;
    duration: number;
    tokenUsage?: {
        input: number;
        output: number;
    };
}

export interface SendMessageOptions {
    timeout?: number;
    tools?: string[];
    model?: string;
}

export interface LocalAgentsAPI {
    // Check if agent CLI is installed
    checkInstalled: (command: string) => Promise<AgentCheckResult>;

    // Launch agent in terminal
    launchInTerminal: (command: string) => Promise<void>;

    // Session management
    createSession: (
        agentType: LocalAgentType,
        workingDirectory: string,
        sessionId?: string
    ) => Promise<SessionInfo>;

    getSession: (sessionId: string) => Promise<SessionInfo | null>;
    getAllSessions: () => Promise<SessionInfo[]>;

    sendMessage: (
        sessionId: string,
        message: string,
        options?: SendMessageOptions
    ) => Promise<AgentResponse>;

    closeSession: (sessionId: string) => Promise<void>;
    closeAllSessions: () => Promise<void>;
    getSessionCount: () => Promise<number>;

    // Event listeners
    onSessionMessage: (callback: (sessionId: string, message: unknown) => void) => () => void;
    onSessionResponse: (
        callback: (sessionId: string, response: AgentResponse) => void
    ) => () => void;
    onSessionError: (callback: (sessionId: string, error: string) => void) => () => void;
    onSessionClosed: (callback: (sessionId: string) => void) => () => void;
}

export interface LocalProvidersAPI {
    fetchLmStudioModels: (baseUrl?: string) => Promise<{ models: string[] }>;
}

// Task Execution Types
export type TaskExecutionStatus = 'running' | 'paused' | 'stopped' | 'completed' | 'failed';

export interface ExecutionProgress {
    percentage: number;
    phase: string;
    content?: string;
    delta?: string;
    tokensUsed?: number;
    cost?: number;
}

export interface TranscriptItem {
    role: 'user' | 'assistant' | 'system';
    content?: string;
    type: 'message' | 'tool_use' | 'tool_result' | 'termination';
    timestamp: Date;
    metadata?: Record<string, unknown>;
}

export interface ExecutionResult {
    content?: unknown;
    cost?: number;
    tokens?: number;
    tokenUsage?: { input: number; output: number };
    duration?: number;
    provider?: string;
    model?: string;
    files?: Array<{
        path: string;
        absolutePath: string;
        type: 'file' | 'directory';
        content?: string;
        size?: number;
        extension?: string;
    }>;
    transcript?: TranscriptItem[];
}

export interface ApprovalRequest {
    question: string;
    options?: string[];
    context?: unknown;
}

export interface TaskExecutionAPI {
    // Execution control
    execute: (
        projectId: number,
        projectSequence: number,
        options?: TaskExecutionOptions
    ) => Promise<{ success: boolean; error?: string }>;
    pause: (
        projectId: number,
        projectSequence: number
    ) => Promise<{ success: boolean; error?: string }>;
    resume: (
        projectId: number,
        projectSequence: number
    ) => Promise<{ success: boolean; error?: string }>;
    stop: (
        projectId: number,
        projectSequence: number
    ) => Promise<{ success: boolean; error?: string }>;
    submitInput: (taskId: number, input: unknown) => Promise<{ success: boolean; error?: string }>;

    // Status queries
    getStatus: (taskId: number) => Promise<{
        taskId: number;
        status: TaskExecutionStatus;
        startedAt: Date;
        pausedAt?: Date;
        progress: number;
        currentPhase: string;
        streamContent: string;
        error?: string;
    } | null>;
    getAllActive: () => Promise<
        Array<{
            taskId: number;
            status: string;
            startedAt: Date;
            progress: number;
            currentPhase: string;
        }>
    >;

    // Approval flow
    requestApproval: (
        taskId: number,
        data: ApprovalRequest
    ) => Promise<{ success: boolean; error?: string }>;
    approve: (taskId: number, response?: string) => Promise<{ success: boolean; error?: string }>;
    reject: (taskId: number) => Promise<{ success: boolean; error?: string }>;

    // Review flow
    completeReview: (taskId: number) => Promise<{ success: boolean; error?: string }>;
    requestChanges: (
        taskId: number,
        refinementPrompt: string
    ) => Promise<{ success: boolean; error?: string }>;
    requestAdditionalWork: (
        taskId: number,
        additionalWorkPrompt: string
    ) => Promise<{ success: boolean; error?: string }>;

    // Block flow
    block: (taskId: number, reason?: string) => Promise<{ success: boolean; error?: string }>;
    unblock: (taskId: number) => Promise<{ success: boolean; error?: string }>;

    // Progress updates
    updateProgress: (
        taskId: number,
        progress: ExecutionProgress
    ) => Promise<{ success: boolean; error?: string }>;

    // Recovery methods
    clearAll: () => Promise<{ success: boolean; cleared: number }>;
    resetStuck: () => Promise<{ success: boolean; reset: number }>;
    forceClear: (taskId: number) => Promise<{ success: boolean; hadExecution: boolean }>;

    // Auto AI Review methods
    startAutoReview: (
        taskId: number,
        options?: TaskExecutionOptions
    ) => Promise<{ success: boolean; result?: unknown; error?: string }>;
    getReviewStatus: (taskId: number) => Promise<{
        taskId: number;
        status: string;
        startedAt: Date;
        progress: number;
        streamContent: string;
        error?: string;
    } | null>;
    cancelReview: (taskId: number) => Promise<{ success: boolean; hadReview: boolean }>;

    // Event listeners
    onStarted: (
        callback: (data: { projectId: number; projectSequence: number; startedAt: Date }) => void
    ) => () => void;
    onProgress: (
        callback: (data: { projectId: number; projectSequence: number } & ExecutionProgress) => void
    ) => () => void;
    onCompleted: (
        callback: (data: {
            projectId: number;
            projectSequence: number;
            result: ExecutionResult;
        }) => void
    ) => () => void;
    onFailed: (
        callback: (data: { projectId: number; projectSequence: number; error: string }) => void
    ) => () => void;
    onPaused: (
        callback: (data: { projectId: number; projectSequence: number; pausedAt: Date }) => void
    ) => () => void;
    onResumed: (
        callback: (data: { projectId: number; projectSequence: number }) => void
    ) => () => void;
    onStopped: (
        callback: (data: { projectId: number; projectSequence: number }) => void
    ) => () => void;
    onApprovalRequired: (
        callback: (data: { projectId: number; projectSequence: number } & ApprovalRequest) => void
    ) => () => void;
    onApproved: (
        callback: (data: { projectId: number; projectSequence: number; response?: string }) => void
    ) => () => void;
    onRejected: (
        callback: (data: { projectId: number; projectSequence: number }) => void
    ) => () => void;
    onReviewCompleted: (
        callback: (data: { projectId: number; projectSequence: number }) => void
    ) => () => void;
    onChangesRequested: (
        callback: (data: {
            projectId: number;
            projectSequence: number;
            refinementPrompt: string;
        }) => void
    ) => () => void;
    onAdditionalWorkRequested: (
        callback: (data: {
            projectId: number;
            projectSequence: number;
            additionalWorkPrompt: string;
        }) => void
    ) => () => void;
    onBlocked: (
        callback: (data: { projectId: number; projectSequence: number; reason?: string }) => void
    ) => () => void;
    onUnblocked: (
        callback: (data: { projectId: number; projectSequence: number }) => void
    ) => () => void;

    // Auto AI Review event listeners
    onReviewStarted: (
        callback: (data: { projectId: number; projectSequence: number; startedAt: Date }) => void
    ) => () => void;
    onReviewProgress: (
        callback: (data: {
            projectId: number;
            projectSequence: number;
            progress?: number;
            phase?: string;
            content?: string;
        }) => void
    ) => () => void;
    onAutoReviewCompleted: (
        callback: (data: {
            projectId: number;
            projectSequence: number;
            result: unknown;
            passed: boolean;
            score: number;
        }) => void
    ) => () => void;
    onReviewFailed: (
        callback: (data: { projectId: number; projectSequence: number; error: string }) => void
    ) => () => void;
    onReviewCancelled: (
        callback: (data: { projectId: number; projectSequence: number }) => void
    ) => () => void;
}

export interface TaskHistoryAPI {
    getByTaskId: (taskId: number, limit?: number) => Promise<unknown[]>;
    getByEventType: (taskId: number, eventType: string) => Promise<unknown[]>;
    getLatest: (taskId: number) => Promise<unknown | null>;
    add: (
        taskId: number,
        eventType: string,
        eventData?: unknown,
        metadata?: unknown
    ) => Promise<unknown>;
}

export interface OperatorsAPI {
    list: (projectId?: number) => Promise<any[]>;
    get: (id: number) => Promise<any | null>;
    create: (data: any) => Promise<any>;
    update: (id: number, data: any) => Promise<any>;
    delete: (id: number) => Promise<void>;
}

// Cloud User Authentication
export interface CloudUser {
    id: string;
    email: string;
    displayName: string;
    photoUrl: string;
    creditBalance: number;
    createdAt: string;
    updatedAt?: string;
}

export interface AuthAPI {
    login: () => Promise<{
        success: boolean;
        data?: {
            sessionToken: string;
            expiresAt: string;
            user: CloudUser;
        };
        error?: string;
    }>;
    logout: () => Promise<{ success: boolean; error?: string }>;
    getCurrentUser: () => Promise<{
        success: boolean;
        data?: CloudUser | null;
        error?: string;
    }>;
    getSessionToken: () => Promise<{
        success: boolean;
        data?: string | null;
        error?: string;
    }>;
}

export interface AiAPI {
    fetchModels: (providerId: string, apiKey?: string) => Promise<any[]>;
}

export interface ElectronAPI {
    projects: ProjectsAPI;
    tasks: TasksAPI;
    app: AppAPI;
    window: WindowAPI;
    database: DatabaseAPI;
    events: EventsAPI;
    shell: ShellAPI;
    system: SystemAPI;
    fs: FsAPI;
    workflow: WorkflowAPI;
    checkpoint: CheckpointAPI;
    automationRule: AutomationRuleAPI;
    localAgents: LocalAgentsAPI;
    localProviders: LocalProvidersAPI;
    taskExecution: TaskExecutionAPI;
    taskHistory: TaskHistoryAPI;
    operators: OperatorsAPI;
    auth: AuthAPI;
    ai: AiAPI;
    store?: StoreAPI;
    http?: any;
}

// Extend Window interface
declare global {
    interface Window {
        electron: ElectronAPI;
    }
}

export {};
