/**
 * Electron Main Process Entry Point
 *
 * Handles window creation, IPC communication, and native integrations
 */

import { app, BrowserWindow, shell, ipcMain } from 'electron';
import path from 'node:path';
import { ProjectRepository } from './database/repositories/project-repository';
import { TaskRepository } from './database/repositories/task-repository';
import { registerWorkflowHandlers } from './ipc/workflow-handlers';
import { registerFsHandlers } from './ipc/fs-handlers';
import { registerLocalAgentsHandlers } from './ipc/local-agents-handlers';
import {
    registerTaskExecutionHandlers,
    resetStuckTasks,
    checkAndExecuteDependentTasks,
} from './ipc/task-execution-handlers';
import { registerTaskHistoryHandlers } from './ipc/task-history-handlers';
import { registerSystemHandlers } from './ipc/system-handlers';
import { registerLocalProviderHandlers } from './ipc/local-providers-handlers';
import { seedDatabase } from './database/seed';
import type { NewTask, Task } from './database/schema';
import type { ProjectStatus, ProjectExportData } from '@core/types/database';

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
                return await projectRepo.findAll(filters);
            } catch (error) {
                console.error('Error listing projects:', error);
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
            }
        ) => {
            try {
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

    ipcMain.handle('projects:import', async (_event, data: ProjectExportData) => {
        try {
            // Default ownerId to 1 for now
            const ownerId = 1;
            const project = await projectRepo.importProject(data, ownerId);
            mainWindow?.webContents.send('project:created', project);
            return project;
        } catch (error) {
            console.error('Error importing project:', error);
            throw error;
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

    ipcMain.handle('tasks:get', async (_event, id: number) => {
        try {
            return await taskRepo.findById(id);
        } catch (error) {
            console.error('Error getting task:', error);
            throw error;
        }
    });

    ipcMain.handle(
        'tasks:create',
        async (_event, data: Partial<NewTask> & { projectId: number; title: string }) => {
            try {
                const task = await taskRepo.create(data as any);
                mainWindow?.webContents.send('task:created', task);
                return task;
            } catch (error) {
                console.error('Error creating task:', error);
                throw error;
            }
        }
    );

    ipcMain.handle('tasks:update', async (_event, id: number, data: Partial<Task>) => {
        try {
            const task = await taskRepo.update(id, data);
            mainWindow?.webContents.send('task:updated', task);
            if (data.status) {
                mainWindow?.webContents.send('task:status-changed', { id, status: data.status });

                // Check for dependent tasks if status changed to 'done'
                if (data.status === 'done') {
                    await checkAndExecuteDependentTasks(id, task);
                }
            }
            return task;
        } catch (error) {
            console.error('Error updating task:', error);
            throw error;
        }
    });

    ipcMain.handle('tasks:delete', async (_event, id: number) => {
        try {
            await taskRepo.delete(id);
            mainWindow?.webContents.send('task:deleted', id);
        } catch (error) {
            console.error('Error deleting task:', error);
            throw error;
        }
    });

    ipcMain.handle('tasks:reorder', async (_event, projectId: number, taskIds: number[]) => {
        try {
            await taskRepo.reorder(projectId, taskIds);
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

    // ========================================
    // App Info IPC Handlers
    // ========================================

    ipcMain.handle('app:getInfo', () => {
        return {
            name: app.getName(),
            version: app.getVersion(),
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

        // Register IPC handlers
        await registerIpcHandlers();

        // Reset any stuck tasks from previous session
        // (tasks with in_progress status but no active execution)
        await resetStuckTasks();

        // Create main window
        createWindow();

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
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
