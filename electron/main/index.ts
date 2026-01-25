/* eslint-disable @typescript-eslint/no-explicit-any, no-console, vue/one-component-per-file */
/**
 * Electron Main Process Entry Point
 *
 * Handles window creation, IPC communication, and native integrations
 */

import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'node:path';
import { release } from 'os'; // Added for Electron app setup
import { ProjectRepository } from './database/repositories/project-repository';
import { TaskRepository } from './database/repositories/task-repository';
import { userRepository } from './database/repositories/user-repository';
import { registerWorkflowHandlers } from './ipc/workflow-handlers';
import { registerFsHandlers } from './ipc/fs-handlers';
import { registerLocalAgentsHandlers } from './ipc/local-agents-handlers';
import { registerOperatorHandlers } from './ipc/operator-handlers';
import {
    registerTaskExecutionHandlers,
    resetStuckTasks,
    checkAndExecuteDependentTasks,
} from './ipc/task-execution-handlers';
import { registerTaskHistoryHandlers } from './ipc/task-history-handlers';
import { registerSystemHandlers } from './ipc/system-handlers';
import { registerLocalProviderHandlers } from './ipc/local-providers-handlers';
import { registerAuthHandlers } from './ipc/auth-handlers';
import { registerAiSettingsHandlers } from './ipc/ai-settings-handlers';
import { registerScriptTemplateHandlers } from './ipc/script-template-handlers';
import { registerTerminalHandlers } from './services/terminal';
// import { registerHttpHandlers } from './ipc/http-handlers';
import { seedDatabase } from './database/seed';
import type { NewTask, Task } from './database/schema';
import type { ProjectStatus, ProjectExportData } from '@core/types/database';
import log from 'electron-log'; // Added for logging
import { taskScheduler } from './services/task-scheduler';
import { taskNotificationService } from './services/task-notification-service';
import { initializeOutputSystem } from './services/output';
import { createMenu } from './menu';

// Configure logging
log.initialize();
// Log to file by default - location:
// on Linux: ~/.config/{app name}/logs/main.log
// on macOS: ~/Library/Logs/{app name}/main.log
// on Windows: %USERPROFILE%\AppData\Roaming\{app name}\logs\main.log
log.transports.file.level = 'info';
log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
log.transports.file.fileName = 'main.log';
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// Hook console logging to electron-log
Object.assign(console, log.functions);

// Handle unhandled errors automatically
log.errorHandler.startCatching();

console.info('Application starting...');
console.info(`Log file path: ${log.transports.file.getFile().path}`);

// Disable GPU Acceleration for Windows 7
if (release().startsWith('6.1')) app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName());

// Explicitly set app name for macOS Dock in dev mode
app.setName('HighFlow');

// Environment configuration
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';

// Paths configuration - using __dirname for correct path resolution
// __dirname in built code will be dist-electron/main
const getRendererDist = () => {
    // From dist-electron/main, go up two levels to project root, then dist
    return path.join(__dirname, '../../dist');
};

const getPreloadPath = () => {
    // From dist-electron/main, go up one level to dist-electron, then preload
    return path.join(__dirname, '../preload/index.cjs');
};

// Main window reference
let mainWindow: BrowserWindow | null = null;

export function getMainWindow() {
    return mainWindow;
}

/**
 * Initialize the database before window creation
 */
async function initializeDatabase(): Promise<void> {
    console.log('=== INITIALIZING DATABASE ===');
    console.log('isDev:', isDev);
    try {
        // Database is imported at the top level
        console.log('Database initialized successfully');

        // Seed database in development
        if (isDev) {
            console.log('Calling seedDatabase...');
            await seedDatabase();
            console.log('seedDatabase completed');
        }

        // Bootstrap essential app data (System Curator, etc.)
        const { bootstrapAppData } = await import('./services/bootstrap');
        await bootstrapAppData();

        return;
    } catch (error) {
        console.error('Failed to initialize database:', error);
        throw error;
    }
}

/**
 * Create the main application window
 */
function createWindow(): void {
    const preloadPath = getPreloadPath();

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        show: false,
        title: 'HighAIManager',
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        trafficLightPosition: { x: 16, y: 16 },
        webPreferences: {
            preload: preloadPath,
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false, // Required for better-sqlite3
            webSecurity: true,
        },
        backgroundColor: '#0f0f0f', // Dark background to prevent flash
    });

    // Create application menu
    createMenu(mainWindow);

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
        if (isDev) {
            mainWindow?.webContents.openDevTools();
        }
    });

    // Load the app
    if (isDev && VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(VITE_DEV_SERVER_URL);
    } else {
        const rendererDist = getRendererDist();
        mainWindow.loadFile(path.join(rendererDist, 'index.html'));
    }

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('http://') || url.startsWith('https://')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    // Handle window close
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

/**
 * Register IPC handlers for database operations
 */
async function registerIpcHandlers(): Promise<void> {
    // Repositories are imported at the top level
    const projectRepo = new ProjectRepository();
    const taskRepo = new TaskRepository();

    // ========================================
    // Project IPC Handlers
    // ========================================

    ipcMain.handle(
        'projects:list',
        async (_event, filters?: { status?: ProjectStatus; isArchived?: boolean }) => {
            try {
                const results = await projectRepo.findAll(filters);
                console.log(`[IPC] projects:list found ${results.length} projects`);
                return results;
            } catch (error) {
                console.error('[IPC] Error listing projects:', error);
                throw error;
            }
        }
    );

    ipcMain.handle('projects:get', async (_event, id: number) => {
        try {
            return await projectRepo.findById(id);
        } catch (error) {
            console.error('Error getting project:', error);
            throw error;
        }
    });

    ipcMain.handle(
        'projects:create',
        async (
            _event,
            data: {
                title: string;
                description?: string;
                ownerId: number;
                baseDevFolder?: string | null;
                projectGuidelines?: string | null;
                // Scanner overrides
                goal?: string;
                memory?: any;
            }
        ) => {
            try {
                // If baseDevFolder is provided, try to scan for local agent context
                if (data.baseDevFolder) {
                    try {
                        const { localAgentScanner } =
                            await import('./services/local-agent-scanner');
                        console.log(
                            `[ProjectCreate] Scanning folder for local agents: ${data.baseDevFolder}`
                        );
                        const context = await localAgentScanner.scanFolder(data.baseDevFolder);

                        if (context) {
                            console.log(`[ProjectCreate] Found context from ${context.source}`);
                            // Auto-populate goal if empty
                            if (!data.goal && context.goal) {
                                data.goal = context.goal;
                            }

                            // Auto-populate memory if empty
                            // Convert string memory to required JSON structure or just store as is if schema allowed text
                            // Schema says memory is json: { summary: string, ... }
                            if (!data.memory && context.memory) {
                                data.memory = {
                                    summary: context.memory,
                                    importedFrom: context.source,
                                    scannedAt: new Date().toISOString(),
                                    // Use gathered context as 'long term memory' or just append to summary
                                };
                            }

                            // Append to description if sensible
                            if (context.guidelines) {
                                data.description =
                                    (data.description || '') +
                                    `\n\n[Imported Guidelines]\n${context.guidelines}`;
                            }
                        }
                    } catch (scanErr) {
                        console.warn(
                            '[ProjectCreate] Failed to scan local agent context:',
                            scanErr
                        );
                        // Continue creation even if scan fails
                    }
                }

                const project = await projectRepo.create(data as any);
                mainWindow?.webContents.send('project:created', project);
                return project;
            } catch (error) {
                console.error('Error creating project:', error);
                throw error;
            }
        }
    );

    ipcMain.handle(
        'projects:update',
        async (
            _event,
            id: number,
            data: Partial<{
                title: string;
                description: string;
                status: string;
                goal?: string | null;
                emoji?: string | null;
                baseDevFolder?: string | null;
                projectGuidelines?: string | null;
            }>
        ) => {
            try {
                const project = await projectRepo.update(id, data as any);
                mainWindow?.webContents.send('project:updated', project);
                return project;
            } catch (error) {
                console.error('Error updating project:', error);
                throw error;
            }
        }
    );

    ipcMain.handle('projects:resetResults', async (_event, id: number) => {
        try {
            // 1. Clear project memory
            await projectRepo.resetResults(id);
            // 2. Reset all tasks
            await taskRepo.resetResultsForProject(id);
            // 3. Delete all task history
            const historyRepo = new (
                await import('./database/repositories/task-history-repository')
            ).TaskHistoryRepository();
            await historyRepo.deleteByProjectId(id);

            const project = await projectRepo.findById(id);
            mainWindow?.webContents.send('project:updated', project);
            // Also notify tasks updated to refresh board
            mainWindow?.webContents.send('tasks:refreshed', id); // Custom event to trigger re-fetch? Or just let frontend handle it?
            // Sending 'task:updated' for each task might be too heavy.
            // Better to likely re-fetch everything.
            return { success: true };
        } catch (error) {
            console.error('Error resetting project results:', error);
            throw error;
        }
    });

    // Update project notification config
    ipcMain.handle(
        'projects:update-notification-config',
        async (_event, projectId: number, config: any) => {
            try {
                const project = await projectRepo.update(projectId, {
                    notificationConfig: config ? JSON.stringify(config) : null,
                });
                mainWindow?.webContents.send('project:updated', project);
                return project;
            } catch (error) {
                console.error('Error updating project notification config:', error);
                throw error;
            }
        }
    );

    ipcMain.handle('projects:delete', async (_event, id: number) => {
        try {
            await projectRepo.delete(id);
            mainWindow?.webContents.send('project:deleted', id);
        } catch (error) {
            console.error('Error deleting project:', error);
            throw error;
        }
    });

    ipcMain.handle('projects:export', async (_event, id: number) => {
        try {
            return await projectRepo.exportProject(id);
        } catch (error) {
            console.error('Error exporting project:', error);
            throw error;
        }
    });

    ipcMain.handle(
        'projects:import',
        async (
            _event,
            data: ProjectExportData,
            userData?: { email: string; name: string; googleId?: string; photoUrl?: string }
        ) => {
            console.log('[Import] Received request. userData:', userData);
            try {
                // Resolve ownerId using userData or default to 1 (System)
                let ownerId = 1;
                if (userData && userData.email) {
                    try {
                        // Fallback name to email username if missing
                        const name = userData.name || userData.email.split('@')[0] || 'User';

                        const user = await userRepository.ensureUser({
                            email: userData.email,
                            name: name,
                            googleId: userData.googleId,
                            avatar: userData.photoUrl,
                        });
                        ownerId = user.id;
                        console.log(`[Import] Resolved user: ${user.email} (ID: ${user.id})`);
                    } catch (err) {
                        console.error('Failed to resolve user for import:', err);
                        // Fallback to default user (ID 1) will happen, but we should make sure ID 1 exists
                        // Note: System Curator is an Operator, not a User.
                        // Ideally we should have a "System" user.
                    }
                }

                console.log('[Import] Using ownerId:', ownerId);

                // Verify user exists to prevent FK error
                const owner = await userRepository.findById(ownerId);
                if (!owner) {
                    console.warn(
                        `[Import] Owner ID ${ownerId} not found using fallback. Using first available user.`
                    );
                    const firstUser = await userRepository.findFirst();
                    if (firstUser) {
                        ownerId = firstUser.id;
                        console.log(
                            `[Import] Fallback to first user: ${firstUser.email} (ID: ${ownerId})`
                        );
                    } else {
                        // If essentially no users exist, we create a default one
                        console.warn('[Import] No users found. Creating default local user.');
                        const defaultUser = await userRepository.ensureUser({
                            email: 'local@user.com',
                            name: 'Local User',
                        });
                        ownerId = defaultUser.id;
                    }
                }

                const project = await projectRepo.importProject(data, ownerId);
                mainWindow?.webContents.send('project:created', project);
                return project;
            } catch (error) {
                console.error('Error importing project:', error);
                throw error;
            }
        }
    );

    ipcMain.handle('projects:sync-local-context', async (_event, projectId: number) => {
        try {
            const project = await projectRepo.findById(projectId);
            if (!project) throw new Error('Project not found');
            if (!project.baseDevFolder) {
                console.warn('[SyncContext] Project has no baseDevFolder');
                return { success: false, message: 'No base folder set' };
            }

            const { localAgentScanner } = await import('./services/local-agent-scanner');
            console.log(`[SyncContext] Scanning folder for local agents: ${project.baseDevFolder}`);
            const context = await localAgentScanner.scanFolder(project.baseDevFolder);

            if (context) {
                console.log(`[SyncContext] Found context from ${context.source}`);
                const updateData: any = {};

                // Update goal if present
                if (context.goal) {
                    updateData.goal = context.goal;
                }

                // Update memory if present
                if (context.memory) {
                    updateData.memory = {
                        summary: context.memory,
                        importedFrom: context.source,
                        scannedAt: new Date().toISOString(),
                    };
                }

                // Append guidelines to description if present
                if (context.guidelines) {
                    // Check if guidelines are not already in description to avoid duplication
                    if (!project.description?.includes('[Imported Guidelines]')) {
                        updateData.description =
                            (project.description || '') +
                            `\n\n[Imported Guidelines]\n${context.guidelines}`;
                    }
                }

                if (Object.keys(updateData).length > 0) {
                    const updatedProject = await projectRepo.update(projectId, updateData);
                    mainWindow?.webContents.send('project:updated', updatedProject);
                    return { success: true, context, project: updatedProject };
                }
            }

            return { success: false, message: 'No local agent context found' };
        } catch (error) {
            console.error('Error syncing local context:', error);
            throw error;
        }
    });

    ipcMain.handle('projects:scan-artifacts', async (_event, projectId: number) => {
        try {
            const project = await projectRepo.findById(projectId);
            if (!project || !project.baseDevFolder) {
                return { success: false, message: 'Project or base folder not found' };
            }

            const { localAgentScanner } = await import('./services/local-agent-scanner');
            const artifacts = await localAgentScanner.scanProjectArtifacts(project.baseDevFolder);

            return { success: true, artifacts };
        } catch (error) {
            console.error('Error scanning artifacts:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    });

    // ========================================
    // Task IPC Handlers
    // ========================================

    ipcMain.handle(
        'tasks:list',
        async (
            _event,
            projectId: number,
            filters?: { status?: string; priority?: string; assigneeId?: number }
        ) => {
            try {
                return await taskRepo.findByProject(projectId, filters as any);
            } catch (error) {
                console.error('Error listing tasks:', error);
                throw error;
            }
        }
    );

    ipcMain.handle('tasks:get', async (_event, projectId: number, sequence: number) => {
        try {
            return await taskRepo.findByKey(projectId, sequence);
        } catch (error) {
            console.error('Error getting task:', error);
            throw error;
        }
    });

    ipcMain.handle(
        'tasks:create',
        async (_event, data: Partial<NewTask> & { projectId: number; title: string }) => {
            try {
                // Set autoApprove to true by default for Input Tasks
                const taskData = {
                    ...data,
                    autoApprove:
                        data.taskType === 'input' && data.autoApprove === undefined
                            ? true
                            : data.autoApprove,
                };
                const task = await taskRepo.create(taskData as any);
                mainWindow?.webContents.send('task:created', task);
                return task;
            } catch (error) {
                console.error('Error creating task:', error);
                throw error;
            }
        }
    );

    ipcMain.handle(
        'tasks:update',
        async (_event, projectId: number, sequence: number, data: Partial<Task>) => {
            try {
                // Get previous task state to check for status changes
                const previousTask = await taskRepo.findByKey(projectId, sequence);
                const previousStatus = previousTask?.status;

                // Sanitize data to prevent overwriting identity fields
                const updateData = { ...data };
                delete (updateData as any).id;
                delete (updateData as any).projectId;
                delete (updateData as any).projectSequence;
                delete (updateData as any).sequence; // This was likely the culprit

                const task = await taskRepo.updateByKey(projectId, sequence, updateData);
                mainWindow?.webContents.send('task:updated', task);

                // Update scheduler if trigger config changed
                if (data.triggerConfig !== undefined) {
                    await taskScheduler.updateTask(task);
                }

                // Check if status actually changed
                const statusChanged = data.status && data.status !== previousStatus;

                console.log(`[TaskStore] Update task ${projectId}-${sequence}:`, {
                    newStatus: data.status,
                    prevStatus: previousStatus,
                    statusChanged,
                });

                if (statusChanged) {
                    mainWindow?.webContents.send('task:status-changed', {
                        projectId,
                        sequence,
                        status: data.status,
                    });

                    // Send notification for status change
                    if (
                        data.status === 'done' ||
                        data.status === 'in_review' ||
                        data.status === 'blocked'
                    ) {
                        await taskNotificationService.notifyStatusChange(
                            projectId,
                            sequence,
                            task.status,
                            data.status
                        );
                    }

                    // Check for dependent tasks ONLY if status changed to 'done'
                    if (data.status === 'done') {
                        await checkAndExecuteDependentTasks(projectId, sequence, task);
                    }
                }
                return task;
            } catch (error) {
                console.error('Error updating task:', error);
                throw error;
            }
        }
    );

    // Update task notification config
    ipcMain.handle(
        'tasks:update-notification-config',
        async (_event, projectId: number, sequence: number, config: any) => {
            try {
                const task = await taskRepo.updateByKey(projectId, sequence, {
                    notificationConfig: config ? JSON.stringify(config) : null,
                });
                mainWindow?.webContents.send('task:updated', task);
                return task;
            } catch (error) {
                console.error('Error updating task notification config:', error);
                throw error;
            }
        }
    );

    // Send test notification
    ipcMain.handle(
        'tasks:send-test-notification',
        async (_event, projectId: number, sequence: number, config: any) => {
            try {
                const { taskNotificationService } =
                    await import('./services/task-notification-service');

                // Get task info for display
                const task = await taskRepo.findByKey(projectId, sequence);
                if (!task) {
                    throw new Error(`Task ${projectId}-${sequence} not found`);
                }

                // Send test notification
                await taskNotificationService.sendTestNotification(projectId, sequence, config, {
                    taskName: task.title, // Fixed: task.name might be wrong? schema says title
                    taskDescription: task.description,
                });

                return { success: true };
            } catch (error) {
                console.error('Error sending test notification:', error);
                throw error;
            }
        }
    );

    ipcMain.handle('tasks:delete', async (_event, projectId: number, sequence: number) => {
        try {
            await taskRepo.deleteByKey(projectId, sequence);
            mainWindow?.webContents.send('task:deleted', { projectId, sequence });
        } catch (error) {
            console.error('Error deleting task:', error);
            throw error;
        }
    });

    ipcMain.handle('tasks:reorder', async (_event, projectId: number, taskSequences: number[]) => {
        try {
            await taskRepo.reorder(projectId, taskSequences);
        } catch (error) {
            console.error('Error reordering tasks:', error);
            throw error;
        }
    });

    ipcMain.handle('tasks:grouped', async (_event, projectId: number) => {
        try {
            return await taskRepo.getGroupedByStatus(projectId);
        } catch (error) {
            console.error('Error getting grouped tasks:', error);
            throw error;
        }
    });

    // Script task execution is handled by task-execution-handlers.ts
    // via the 'taskExecution:execute' handler to avoid duplication
    // The old 'tasks:execute-script' handler has been removed

    // ========================================
    // App Info IPC Handlers
    // ========================================

    ipcMain.handle('app:getInfo', () => {
        return {
            name: app.getName(),
            version: '0.1.0', // Fixed: Hardcoded to match package.json
            platform: process.platform,
            isDev,
        };
    });

    ipcMain.handle('app:getPaths', () => {
        return {
            userData: app.getPath('userData'),
            documents: app.getPath('documents'),
            downloads: app.getPath('downloads'),
            home: app.getPath('home'),
        };
    });

    ipcMain.handle('app:getVersion', () => {
        return '0.1.0'; // Fixed: Hardcoded to match package.json
    });

    // ========================================
    // Window IPC Handlers
    // ========================================

    ipcMain.handle('window:minimize', () => {
        mainWindow?.minimize();
    });

    ipcMain.handle('window:maximize', () => {
        if (mainWindow?.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow?.maximize();
        }
    });

    ipcMain.handle('window:close', () => {
        mainWindow?.close();
    });

    ipcMain.handle('window:isMaximized', () => {
        return mainWindow?.isMaximized() ?? false;
    });

    // Register workflow handlers
    registerWorkflowHandlers(mainWindow);

    // Register file system handlers
    registerFsHandlers(mainWindow);

    // Register system command handlers
    registerSystemHandlers();

    // Register local agents handlers
    registerLocalAgentsHandlers(mainWindow);

    // Register local provider handlers
    registerLocalProviderHandlers();

    // Register task execution handlers
    registerTaskExecutionHandlers(mainWindow);

    // Register task history handlers
    registerTaskHistoryHandlers();

    // Register auth handlers
    registerAuthHandlers();

    // Register AI settings handlers
    registerAiSettingsHandlers();

    // Register operator handlers
    registerOperatorHandlers();

    // Register script template handlers
    registerScriptTemplateHandlers();

    // Register terminal handlers
    registerTerminalHandlers(mainWindow);

    console.log('IPC handlers registered');
}

/**
 * Application lifecycle handlers
 */

// App ready
app.whenReady().then(async () => {
    try {
        // Initialize database
        await initializeDatabase();

        // Initialize Output System
        initializeOutputSystem();

        // Register IPC handlers
        await registerIpcHandlers();

        // Reset any stuck tasks from previous session
        // (tasks with in_progress status but no active execution)
        await resetStuckTasks();

        // Create main window
        createWindow();

        // Initialize task scheduler (after window is created)
        if (mainWindow) {
            await taskScheduler.initialize(mainWindow);
            taskNotificationService.initialize(mainWindow);
        }

        // macOS: Re-create window when dock icon clicked
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    } catch (error) {
        console.error('Failed to start application:', error);
        app.quit();
    }
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    // Clean up scheduler
    taskScheduler.shutdown();

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Handle second instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

// Security: Prevent navigation to external URLs
app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        if (isDev && parsedUrl.origin === 'http://localhost:5173') {
            return; // Allow dev server navigation
        }
        if (parsedUrl.origin !== 'file://') {
            event.preventDefault();
        }
    });
});

// Error handling
