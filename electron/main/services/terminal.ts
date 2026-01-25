import * as pty from 'node-pty';
import { ipcMain } from 'electron';
import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';

interface TerminalSession {
    pty: pty.IPty;
    id: string;
}

export class TerminalService {
    private sessions: Map<string, TerminalSession> = new Map();
    private mainWindow: BrowserWindow | null = null;

    constructor(mainWindow: BrowserWindow | null) {
        this.mainWindow = mainWindow;
    }

    /**
     * Create a new terminal session
     */
    public createSession(id: string, cwd?: string, cols: number = 80, rows: number = 24): string {
        let shell = '';

        if (os.platform() === 'win32') {
            shell = process.env.COMSPEC || 'powershell.exe';
        } else {
            // MacOS / Linux
            // 1. Try process.env.SHELL
            if (process.env.SHELL && fs.existsSync(process.env.SHELL)) {
                shell = process.env.SHELL;
            }
            // 2. Try standard paths
            else if (fs.existsSync('/bin/zsh')) {
                shell = '/bin/zsh';
            } else if (fs.existsSync('/usr/bin/zsh')) {
                shell = '/usr/bin/zsh';
            } else if (fs.existsSync('/bin/bash')) {
                shell = '/bin/bash';
            } else if (fs.existsSync('/usr/bin/bash')) {
                shell = '/usr/bin/bash';
            } else {
                // Fallback to simple 'sh' or 'zsh' if not found
                shell = 'zsh';
            }
        }

        // Validate CWD
        let workingDirectory = cwd || os.homedir();
        try {
            if (cwd && !fs.existsSync(cwd)) {
                console.warn(
                    `[Terminal] Requested CWD does not exist: ${cwd}, falling back to homedir`
                );
                workingDirectory = os.homedir();
            }
        } catch (err) {
            console.error('[Terminal] Failed to validate CWD:', err);
            workingDirectory = os.homedir();
        }

        console.log(`[Terminal] Spawning ${shell} in ${workingDirectory}`);

        let ptyProcess;
        try {
            ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-256color',
                cols,
                rows,
                cwd: workingDirectory,
                env: process.env as any,
            });
        } catch (error) {
            console.error(
                `[Terminal] Failed to spawn shell '${shell}' in '${workingDirectory}':`,
                error
            );
            console.warn('[Terminal] Attempting fallback to /bin/bash in home directory...');

            try {
                // Fallback to simpler configuration
                const fallbackShell = os.platform() === 'win32' ? 'powershell.exe' : '/bin/bash';
                workingDirectory = os.homedir();

                ptyProcess = pty.spawn(fallbackShell, [], {
                    name: 'xterm-256color',
                    cols,
                    rows,
                    cwd: workingDirectory,
                    env: process.env as any,
                });
                console.log(`[Terminal] Fallback successful: spawned ${fallbackShell}`);
            } catch (fallbackError) {
                console.error('[Terminal] Fallback spawn failed:', fallbackError);
                throw new Error(`Failed to create terminal session: ${error}`);
            }
        }

        const session: TerminalSession = {
            pty: ptyProcess,
            id,
        };

        this.sessions.set(id, session);

        // Setup event listener for data
        ptyProcess.onData((data) => {
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send(`terminal:data:${id}`, data);
            }
        });

        ptyProcess.onExit(({ exitCode, signal }) => {
            console.log(
                `Using Terminal ID ${id} exited with code ${exitCode} and signal ${signal}`
            );
            this.sessions.delete(id);
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send(`terminal:exit:${id}`, { exitCode, signal });
            }
        });

        return id;
    }

    /**
     * Write data to a terminal session
     */
    public write(id: string, data: string): void {
        const session = this.sessions.get(id);
        if (session) {
            session.pty.write(data);
        }
    }

    /**
     * Resize a terminal session
     */
    public resize(id: string, cols: number, rows: number): void {
        const session = this.sessions.get(id);
        if (session) {
            session.pty.resize(cols, rows);
        }
    }

    /**
     * Kill a terminal session
     */
    public kill(id: string): void {
        const session = this.sessions.get(id);
        if (session) {
            session.pty.kill();
            this.sessions.delete(id);
        }
    }

    /**
     * Kill all sessions
     */
    public killAll(): void {
        for (const id of this.sessions.keys()) {
            this.kill(id);
        }
    }
}

export function registerTerminalHandlers(mainWindow: BrowserWindow | null): TerminalService {
    const terminalService = new TerminalService(mainWindow);

    ipcMain.handle(
        'terminal:create',
        (_event, id: string, cwd?: string, cols?: number, rows?: number) => {
            return terminalService.createSession(id, cwd, cols, rows);
        }
    );

    ipcMain.handle('terminal:write', (_event, id: string, data: string) => {
        terminalService.write(id, data);
    });

    ipcMain.handle('terminal:resize', (_event, id: string, cols: number, rows: number) => {
        terminalService.resize(id, cols, rows);
    });

    ipcMain.handle('terminal:kill', (_event, id: string) => {
        terminalService.kill(id);
    });

    return terminalService;
}
