/**
 * Electron Environment Utilities
 *
 * Provides safe access to Electron APIs with fallbacks for browser environment.
 */

import type { ElectronAPI } from '@core/types/electron.d';

/**
 * Check if running in Electron environment
 */
export function isElectron(): boolean {
    return typeof window !== 'undefined' && window.electron !== undefined;
}

/**
 * Get Electron API or null if not available
 */
export function getElectronAPI(): ElectronAPI | null {
    if (isElectron()) {
        return window.electron;
    }
    return null;
}

/**
 * Mock data for browser development
 */
const mockProjects = [
    {
        id: 1,
        title: '샘플 프로젝트 1',
        description: '이것은 브라우저 모드에서의 샘플 프로젝트입니다.',
        mainPrompt: 'AI를 활용한 웹 애플리케이션을 만들어주세요.',
        status: 'active',
        aiProvider: 'anthropic',
        aiModel: 'claude-3-5-sonnet',
        outputType: 'web',
        outputPath: null,
        templateId: null,
        coverImage: null,
        color: '#3b82f6',
        emoji: '🚀',
        isArchived: false,
        isFavorite: true,
        estimatedHours: 40,
        actualHours: 15,
        totalCost: 2.5,
        totalTokens: 50000,
        archivedAt: null,
        ownerId: 1,
        teamId: null,
        gitRepository: null,
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-20'),
    },
    {
        id: 2,
        title: '문서 자동화 프로젝트',
        description: 'Markdown 문서를 자동으로 생성하는 프로젝트',
        mainPrompt: '기술 문서를 자동으로 작성해주세요.',
        status: 'active',
        aiProvider: 'openai',
        aiModel: 'gpt-4-turbo',
        outputType: 'document',
        outputPath: null,
        templateId: null,
        coverImage: null,
        color: '#10b981',
        emoji: '📄',
        isArchived: false,
        isFavorite: false,
        estimatedHours: 20,
        actualHours: 8,
        totalCost: 1.2,
        totalTokens: 25000,
        archivedAt: null,
        ownerId: 1,
        teamId: null,
        gitRepository: null,
        createdAt: new Date('2024-02-01'),
        updatedAt: new Date('2024-02-10'),
    },
];

const mockTasks = [
    {
        id: 1,
        projectId: 1,
        title: '요구사항 분석',
        description: '프로젝트 요구사항을 분석합니다.',
        generatedPrompt: null,
        status: 'done',
        priority: 'high',
        executionType: 'serial',
        aiProvider: 'anthropic',
        mcpConfig: null,
        order: 0,
        parentTaskId: null,
        assigneeId: null,
        watcherIds: [],
        estimatedMinutes: 60,
        actualMinutes: 45,
        tokenUsage: null,
        estimatedCost: 0.1,
        actualCost: 0.08,
        dueDate: null,
        startedAt: new Date('2024-01-16'),
        completedAt: new Date('2024-01-16'),
        blockedReason: null,
        blockedByTaskId: null,
        tags: ['분석'],
        gitCommits: [],
        deletedAt: null,
        isPaused: false,
        autoReview: false,
        autoReviewed: false,
        triggerConfig: null,
        pausedAt: null,
        isSubdivided: false,
        subtaskCount: 0,
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-16'),
    },
    {
        id: 2,
        projectId: 1,
        title: 'UI 디자인',
        description: '사용자 인터페이스를 디자인합니다.',
        generatedPrompt: null,
        status: 'in_progress',
        priority: 'medium',
        executionType: 'serial',
        aiProvider: 'anthropic',
        mcpConfig: null,
        order: 1,
        parentTaskId: null,
        assigneeId: null,
        watcherIds: [],
        estimatedMinutes: 120,
        actualMinutes: null,
        tokenUsage: null,
        estimatedCost: 0.2,
        actualCost: null,
        dueDate: null,
        startedAt: new Date('2024-01-17'),
        completedAt: null,
        blockedReason: null,
        blockedByTaskId: null,
        tags: ['디자인', 'UI'],
        gitCommits: [],
        deletedAt: null,
        isPaused: false,
        autoReview: false,
        autoReviewed: false,
        triggerConfig: null,
        pausedAt: null,
        isSubdivided: false,
        subtaskCount: 0,
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-17'),
    },
    {
        id: 3,
        projectId: 1,
        title: '백엔드 개발',
        description: 'API와 데이터베이스를 구현합니다.',
        generatedPrompt: null,
        status: 'todo',
        priority: 'high',
        executionType: 'serial',
        aiProvider: 'anthropic',
        mcpConfig: null,
        order: 2,
        parentTaskId: null,
        assigneeId: null,
        watcherIds: [],
        estimatedMinutes: 240,
        actualMinutes: null,
        tokenUsage: null,
        estimatedCost: 0.5,
        actualCost: null,
        dueDate: null,
        startedAt: null,
        completedAt: null,
        blockedReason: null,
        blockedByTaskId: null,
        tags: ['개발', 'API'],
        gitCommits: [],
        deletedAt: null,
        isPaused: false,
        autoReview: false,
        autoReviewed: false,
        triggerConfig: null,
        pausedAt: null,
        isSubdivided: false,
        subtaskCount: 0,
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-15'),
    },
];

/**
 * Mock Electron API for browser development
 */
export const mockElectronAPI = {
    projects: {
        list: async () => [...mockProjects],
        get: async (id: number) => mockProjects.find((p) => p.id === id) || null,
        create: async (data: any) => {
            const newProject = {
                ...mockProjects[0],
                id: Date.now(),
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockProjects.push(newProject);
            return newProject;
        },
        update: async (id: number, data: any) => {
            const index = mockProjects.findIndex((p) => p.id === id);
            if (index >= 0) {
                mockProjects[index] = {
                    ...mockProjects[index],
                    ...data,
                    updatedAt: new Date(),
                } as (typeof mockProjects)[0];
                return mockProjects[index] as (typeof mockProjects)[0];
            }
            throw new Error('Project not found');
        },
        delete: async (id: number) => {
            const index = mockProjects.findIndex((p) => p.id === id);
            if (index >= 0) {
                mockProjects.splice(index, 1);
            }
        },
        export: async (id: number) => {
            const project = mockProjects.find((p) => p.id === id);
            if (!project) throw new Error('Project not found');
            return {
                version: 1,
                exportedAt: new Date().toISOString(),
                project: { ...project },
                tasks: mockTasks
                    .filter((t) => t.projectId === id)
                    .map((t) => ({ ...t, tempId: t.id, dependencies: [] })),
            };
        },
        import: async (data: any) => {
            const newProject = {
                ...data.project,
                id: Date.now(),
                title: `${data.project.title} (Imported)`,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockProjects.push(newProject);
            return newProject;
        },
    },
    tasks: {
        list: async (projectId: number) => mockTasks.filter((t) => t.projectId === projectId),
        get: async (id: number) => mockTasks.find((t) => t.id === id) || null,
        create: async (data: any) => {
            const newTask = {
                ...mockTasks[0],
                id: Date.now(),
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            mockTasks.push(newTask);
            return newTask;
        },
        update: async (id: number, data: any) => {
            const index = mockTasks.findIndex((t) => t.id === id);
            if (index >= 0) {
                mockTasks[index] = {
                    ...mockTasks[index],
                    ...data,
                    updatedAt: new Date(),
                } as (typeof mockTasks)[0];
                return mockTasks[index] as (typeof mockTasks)[0];
            }
            throw new Error('Task not found');
        },
        delete: async (id: number) => {
            const index = mockTasks.findIndex((t) => t.id === id);
            if (index >= 0) {
                mockTasks.splice(index, 1);
            }
        },
        reorder: async () => {},
    },
    events: {
        on: (_channel: string, _callback: Function) => {
            // No-op in browser mode
            return () => {};
        },
        once: (_channel: string, _callback: Function) => {
            // No-op in browser mode
        },
    },
    app: {
        getInfo: async () => ({
            name: 'HighAIManager',
            version: '0.1.0',
            platform: 'browser',
            isDev: true,
        }),
        getPaths: async () => ({
            userData: '/mock/userData',
            documents: '/mock/documents',
            downloads: '/mock/downloads',
            home: '/mock/home',
        }),
    },
    window: {
        minimize: async () => {},
        maximize: async () => {},
        close: async () => {},
        isMaximized: async () => false,
        onMaximizedChange: () => () => {},
    },
    shell: {
        openExternal: async (url: string) => {
            window.open(url, '_blank');
        },
        showItemInFolder: async () => {
            console.log('[Mock] showItemInFolder called');
        },
        openPath: async () => true,
    },
    fs: {
        readDir: async () => [],
        readFile: async () => '',
        exists: async () => false,
        stat: async () => ({ size: 0, isDirectory: false, mtime: new Date() }),
        selectDirectory: async () => null,
        selectFile: async () => null,
    },
    database: {
        query: async () => [],
        stats: async () => ({}),
        backup: async () => {},
    },
    workflow: {
        create: async () => ({}),
        get: async () => null,
        getById: async () => null,
        list: async () => [],
        listActive: async () => [],
        updateStatus: async () => ({}),
        updateProgress: async () => ({}),
        addTaskResult: async () => ({}),
        delete: async () => {},
        stats: async () => ({}),
    },
    checkpoint: {
        create: async () => ({}),
        get: async () => null,
        getLatest: async () => null,
        list: async () => [],
        delete: async () => {},
        cleanup: async () => 0,
    },
    automationRule: {
        create: async () => ({}),
        get: async () => null,
        list: async () => [],
        listEnabled: async () => [],
        update: async () => ({}),
        toggle: async () => ({}),
        incrementExecution: async () => ({}),
        delete: async () => {},
    },
    localAgents: {
        checkInstalled: async () => ({ installed: false, version: undefined }),
        launchInTerminal: async () => {},
        createSession: async () => ({
            id: 'mock-session',
            agentType: 'claude' as const,
            status: 'idle' as const,
            workingDirectory: '/mock',
            createdAt: new Date(),
            lastActivityAt: new Date(),
            messageCount: 0,
        }),
        getSession: async () => null,
        getAllSessions: async () => [],
        sendMessage: async () => ({
            success: true,
            content: 'Mock response',
            duration: 100,
        }),
        closeSession: async () => {},
        closeAllSessions: async () => {},
        getSessionCount: async () => 0,
        onSessionMessage: () => () => {},
        onSessionResponse: () => () => {},
        onSessionError: () => () => {},
        onSessionClosed: () => () => {},
    },
    taskExecution: {
        execute: async (
            projectId: number,
            sequence: number,
            _options?: {
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
            }
        ): Promise<{ success: boolean; result?: unknown; error?: string; stopped?: boolean }> => {
            console.log(`[Mock] Executing task ${projectId}-${sequence}`);
            // Simulate task execution in mock mode
            const task = mockTasks.find(
                (t) => t.projectId === projectId && (t as any).projectSequence === sequence
            ); // Mock doesn't fully support sequential keys yet usually, but just logging
            // Assuming mockTasks has id as number still for simplicity in mock data unless we change that too.
            // But preserving "taskId" is removed from interface properly.
            // Let's just find by some logic or strict match if we updated mockTasks.. we didn't update mockTasks schema yet in this file.
            // Just doing a best effort mock update.

            return { success: true };
        },
        pause: async (
            projectId: number,
            sequence: number
        ): Promise<{ success: boolean; error?: string }> => {
            console.log(`[Mock] Pausing task ${projectId}-${sequence}`);
            return { success: true };
        },
        resume: async (
            projectId: number,
            sequence: number
        ): Promise<{ success: boolean; error?: string }> => {
            console.log(`[Mock] Resuming task ${projectId}-${sequence}`);
            return { success: true };
        },
        stop: async (
            projectId: number,
            sequence: number
        ): Promise<{ success: boolean; error?: string }> => {
            console.log(`[Mock] Stopping task ${projectId}-${sequence}`);
            return { success: true };
        },
        submitInput: async (
            projectId: number,
            sequence: number,
            input: unknown
        ): Promise<{ success: boolean; error?: string }> => {
            console.log(`[Mock] Submitting input task ${projectId}-${sequence}`, input);
            return { success: true };
        },
        getStatus: async (projectId: number, sequence: number) => {
            console.log(`[Mock] Getting status for task ${projectId}-${sequence}`);
            return null;
        },
        getAllActive: async () => {
            console.log('[Mock] Getting all active executions');
            return [];
        },
        requestApproval: async (
            projectId: number,
            sequence: number,
            _data: { question: string; options?: string[]; context?: unknown }
        ): Promise<{ success: boolean; error?: string }> => {
            console.log(`[Mock] Requesting approval for task ${projectId}-${sequence}`);
            return { success: true };
        },
        approve: async (
            projectId: number,
            sequence: number,
            _response?: string
        ): Promise<{ success: boolean; error?: string }> => {
            console.log(`[Mock] Approving task ${projectId}-${sequence}`);
            return { success: true };
        },
        reject: async (
            projectId: number,
            sequence: number
        ): Promise<{ success: boolean; error?: string }> => {
            console.log(`[Mock] Rejecting task ${projectId}-${sequence}`);
            return { success: true };
        },
        completeReview: async (
            projectId: number,
            sequence: number
        ): Promise<{ success: boolean; error?: string }> => {
            console.log(`[Mock] Completing review for task ${projectId}-${sequence}`);
            return { success: true };
        },
        requestChanges: async (
            projectId: number,
            sequence: number,
            _refinementPrompt: string
        ): Promise<{ success: boolean; error?: string }> => {
            console.log(`[Mock] Requesting changes for task ${projectId}-${sequence}`);
            return { success: true };
        },
        requestAdditionalWork: async (
            projectId: number,
            sequence: number,
            _additionalWorkPrompt: string
        ): Promise<{ success: boolean; error?: string }> => {
            console.log(`[Mock] Requesting additional work for task ${projectId}-${sequence}`);
            return { success: true };
        },
        block: async (
            projectId: number,
            sequence: number,
            _reason?: string
        ): Promise<{ success: boolean; error?: string }> => {
            console.log(`[Mock] Blocking task ${projectId}-${sequence}`);
            return { success: true };
        },
        unblock: async (
            projectId: number,
            sequence: number
        ): Promise<{ success: boolean; error?: string }> => {
            console.log(`[Mock] Unblocking task ${projectId}-${sequence}`);
            return { success: true };
        },
        updateProgress: async (
            projectId: number,
            sequence: number,
            _progress: {
                percentage: number;
                phase: string;
                content?: string;
                delta?: string;
                tokensUsed?: number;
                cost?: number;
            }
        ): Promise<{ success: boolean; error?: string }> => {
            console.log(`[Mock] Updating progress for task ${projectId}-${sequence}`);
            return { success: true };
        },
        // Recovery methods
        clearAll: async (): Promise<{ success: boolean; cleared: number }> => {
            console.log('[Mock] Clearing all executions');
            return { success: true, cleared: 0 };
        },
        resetStuck: async (): Promise<{ success: boolean; reset: number }> => {
            console.log('[Mock] Resetting stuck tasks');
            return { success: true, reset: 0 };
        },
        forceClear: async (
            projectId: number,
            sequence: number
        ): Promise<{ success: boolean; hadExecution: boolean }> => {
            console.log(`[Mock] Force clearing task ${projectId}-${sequence}`);
            return { success: true, hadExecution: false };
        },

        // Auto AI Review methods
        startAutoReview: async (
            projectId: number,
            sequence: number,
            _options?: {
                streaming?: boolean;
                apiKeys?: {
                    anthropic?: string;
                    openai?: string;
                    google?: string;
                    groq?: string;
                    lmstudio?: string;
                };
            }
        ): Promise<{ success: boolean; result?: unknown; error?: string }> => {
            console.log(`[Mock] Starting auto review for task ${projectId}-${sequence}`);
            return { success: true };
        },
        getReviewStatus: async (
            projectId: number,
            sequence: number
        ): Promise<{
            projectId: number;
            projectSequence: number;
            status: string;
            startedAt: Date;
            progress: number;
            streamContent: string;
            error?: string;
        } | null> => {
            console.log(`[Mock] Getting review status for task ${projectId}-${sequence}`);
            return null;
        },
        cancelReview: async (
            projectId: number,
            sequence: number
        ): Promise<{ success: boolean; hadReview: boolean }> => {
            console.log(`[Mock] Cancelling review for task ${projectId}-${sequence}`);
            return { success: true, hadReview: false };
        },

        // Event listeners (no-op in mock mode)
        onStarted:
            (
                _callback: (data: {
                    projectId: number;
                    projectSequence: number;
                    startedAt: Date;
                }) => void
            ) =>
            () => {},
        onProgress:
            (
                _callback: (data: {
                    projectId: number;
                    projectSequence: number;
                    progress: number;
                    phase: string;
                    content?: string;
                    tokensUsed?: number;
                    cost?: number;
                }) => void
            ) =>
            () => {},
        onCompleted:
            (
                _callback: (data: {
                    projectId: number;
                    projectSequence: number;
                    result: unknown;
                }) => void
            ) =>
            () => {},
        onFailed:
            (
                _callback: (data: {
                    projectId: number;
                    projectSequence: number;
                    error: string;
                }) => void
            ) =>
            () => {},
        onPaused:
            (
                _callback: (data: {
                    projectId: number;
                    projectSequence: number;
                    pausedAt: Date;
                }) => void
            ) =>
            () => {},
        onResumed:
            (_callback: (data: { projectId: number; projectSequence: number }) => void) => () => {},
        onStopped:
            (_callback: (data: { projectId: number; projectSequence: number }) => void) => () => {},
        onApprovalRequired:
            (
                _callback: (data: {
                    projectId: number;
                    projectSequence: number;
                    question: string;
                    options?: string[];
                    context?: unknown;
                }) => void
            ) =>
            () => {},
        onApproved:
            (
                _callback: (data: {
                    projectId: number;
                    projectSequence: number;
                    response?: string;
                }) => void
            ) =>
            () => {},
        onRejected:
            (_callback: (data: { projectId: number; projectSequence: number }) => void) => () => {},
        onReviewCompleted:
            (_callback: (data: { projectId: number; projectSequence: number }) => void) => () => {},
        onChangesRequested:
            (
                _callback: (data: {
                    projectId: number;
                    projectSequence: number;
                    refinementPrompt: string;
                }) => void
            ) =>
            () => {},
        onAdditionalWorkRequested:
            (
                _callback: (data: {
                    projectId: number;
                    projectSequence: number;
                    additionalWorkPrompt: string;
                }) => void
            ) =>
            () => {},
        onBlocked:
            (
                _callback: (data: {
                    projectId: number;
                    projectSequence: number;
                    reason?: string;
                }) => void
            ) =>
            () => {},
        onUnblocked:
            (_callback: (data: { projectId: number; projectSequence: number }) => void) => () => {},

        // Auto AI Review event listeners (no-op in mock mode)
        onReviewStarted:
            (
                _callback: (data: {
                    projectId: number;
                    projectSequence: number;
                    startedAt: Date;
                }) => void
            ) =>
            () => {},
        onReviewProgress:
            (
                _callback: (data: {
                    projectId: number;
                    projectSequence: number;
                    progress?: number;
                    phase?: string;
                    content?: string;
                }) => void
            ) =>
            () => {},
        onAutoReviewCompleted:
            (
                _callback: (data: {
                    projectId: number;
                    projectSequence: number;
                    result: unknown;
                }) => void
            ) =>
            () => {},
        onReviewFailed:
            (
                _callback: (data: {
                    projectId: number;
                    projectSequence: number;
                    error: string;
                }) => void
            ) =>
            () => {},
        onReviewCancelled:
            (_callback: (data: { projectId: number; projectSequence: number }) => void) => () => {},
    },

    // Task History API
    taskHistory: {
        getByTaskId: async (
            projectId: number,
            sequence: number,
            limit?: number
        ): Promise<unknown[]> => {
            console.log(
                `[Mock] Getting task history for task ${projectId}-${sequence}, limit: ${limit}`
            );
            return [];
        },
        getByEventType: async (
            projectId: number,
            sequence: number,
            eventType: string
        ): Promise<unknown[]> => {
            console.log(
                `[Mock] Getting task history by event type ${eventType} for task ${projectId}-${sequence}`
            );
            return [];
        },
        getLatest: async (projectId: number, sequence: number): Promise<unknown | null> => {
            console.log(`[Mock] Getting latest task history for task ${projectId}-${sequence}`);
            return null;
        },
        add: async (
            projectId: number,
            sequence: number,
            eventType: string,
            eventData?: unknown,
            metadata?: unknown
        ): Promise<unknown> => {
            console.log(`[Mock] Adding task history for task ${projectId}-${sequence}:`, {
                eventType,
                eventData,
                metadata,
            });
            return {
                id: Date.now(),
                projectId,
                sequence,
                eventType,
                eventData,
                metadata,
                createdAt: new Date(),
            };
        },
    },
};

/**
 * Get API (real Electron API or mock for browser)
 */
export function getAPI(): ElectronAPI {
    if (isElectron()) {
        return window.electron as ElectronAPI;
    }
    console.warn('[Dev Mode] Running in browser - using mock API');
    return mockElectronAPI as unknown as ElectronAPI;
}
