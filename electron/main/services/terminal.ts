import * as pty from 'node-pty';
import { ipcMain } from 'electron';
import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';

// Fallback terminal implementation for when node-pty fails (binary mismatch)
class FallbackTerminal extends EventEmitter implements pty.IPty {
    pid: number;
    cols: number;
    rows: number;
    process: string;
    handleFlowControl: boolean;
    private _proc: ChildProcessWithoutNullStreams;

    constructor(file: string, args: string[] | string, opt: any) {
        super();
        this.process = file;
        this.cols = opt.cols || 80;
        this.rows = opt.rows || 24;
        this.handleFlowControl = false;

        // Force shell option to true for basic execution
        this._proc = spawn(file, Array.isArray(args) ? args : [], {
            cwd: opt.cwd,
            env: opt.env,
            shell: false, // Don't use shell wrapper, execute directly if 'file' is shell
        });
        this.pid = this._proc.pid || 0;

        // Pipe output
        this._proc.stdout.on('data', (data) => this.emit('data', data.toString()));
        this._proc.stderr.on('data', (data) => this.emit('data', data.toString()));
        this._proc.on('exit', (code) => this.emit('exit', code ?? 0));
        this._proc.on('error', (err) => {
            console.error('[FallbackTerminal] Process error:', err);
            this.emit('data', `\r\nError spawning process: ${err.message}\r\n`);
        });
    }

    // IPty Implementation
    get onData() {
        return (listener: (data: string) => void) => {
            this.on('data', listener);
            return { dispose: () => this.off('data', listener) };
        };
    }
    get onExit() {
        return (listener: (e: { exitCode: number; signal?: number }) => void) => {
            this.on('exit', (code) => listener({ exitCode: code }));
            return { dispose: () => this.off('exit', listener) };
        };
    }

    write(data: string): void {
        if (this._proc.stdin.writable) {
            this._proc.stdin.write(data);
        }
    }

    resize(cols: number, rows: number): void {
        this.cols = cols;
        this.rows = rows;
        // Basic spawn cannot handle resize signals effectively without pty
    }

    kill(signal?: string): void {
        this._proc.kill(signal as NodeJS.Signals);
    }

    pause(): void {}
    resume(): void {}
    clear() {}
}

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

        // Sanitize environment
        const env: Record<string, string> = {};

        // Copy process.env but exclude ELECTRON_ variables
        for (const key of Object.keys(process.env)) {
            if (!key.startsWith('ELECTRON_')) {
                env[key] = process.env[key] || '';
            }
        }

        // Ensure PATH exists (critical for posix_spawnp)
        if (!env.PATH) {
            env.PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
            console.warn('[Terminal] PATH was missing, using default:', env.PATH);
        }

        // Fix encoding issues
        if (!env.LANG) env.LANG = 'en_US.UTF-8';
        if (!env.LC_ALL) env.LC_ALL = 'en_US.UTF-8';

        // Explicitly set SHELL env to match the binary we are running
        env.SHELL = shell;
        env.TERM = 'xterm-256color';

        console.log(`[Terminal] Spawning ${shell} in ${workingDirectory}`);

        let ptyProcess: pty.IPty;
        try {
            ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-256color',
                cols,
                rows,
                cwd: workingDirectory,
                env: env as any,
            });
        } catch (error: any) {
            console.error(
                `[Terminal] Failed to spawn shell '${shell}' in '${workingDirectory}'. Error: ${error.message}`
            );

            // AUTO-RETRY: Try /bin/bash or /bin/sh if primary shell failed
            const fallbackShell = os.platform() === 'win32' ? 'cmd.exe' : '/bin/bash';

            if (shell !== fallbackShell && fs.existsSync(fallbackShell)) {
                try {
                    console.log(`[Terminal] Retrying with fallback PTY shell: ${fallbackShell}`);
                    env.SHELL = fallbackShell;
                    ptyProcess = pty.spawn(fallbackShell, [], {
                        name: 'xterm-256color',
                        cols,
                        rows,
                        cwd: workingDirectory,
                        env: env as any,
                    });
                    // If successful, we update the session info
                    shell = fallbackShell;
                } catch (retryError: any) {
                    console.error(
                        `[Terminal] Fallback PTY shell also failed: ${retryError.message}`
                    );
                    return this.spawnFallback(id, shell, [], {
                        cols,
                        rows,
                        cwd: workingDirectory,
                        env,
                    });
                }
            } else {
                return this.spawnFallback(id, shell, [], {
                    cols,
                    rows,
                    cwd: workingDirectory,
                    env,
                });
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
                `[Terminal] Session ${id} exited with code ${exitCode} and signal ${signal}`
            );
            this.sessions.delete(id);
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send(`terminal:exit:${id}`, { exitCode, signal });
            }
        });

        return id;
    }

    private spawnFallback(id: string, file: string, args: string[], opt: any): string {
        try {
            console.warn('[Terminal] Using FallbackTerminal via child_process.spawn');
            const ptyProcess = new FallbackTerminal(file, args, opt);

            const session: TerminalSession = {
                pty: ptyProcess,
                id,
            };
            this.sessions.set(id, session);

            // Re-bind listeners for fallback
            ptyProcess.onData((data: string) => {
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.webContents.send(`terminal:data:${id}`, data);
                }
            });

            ptyProcess.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
                console.log(`[Terminal] Fallback Session ${id} exited.`);
                this.sessions.delete(id);
                if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                    this.mainWindow.webContents.send(`terminal:exit:${id}`, { exitCode, signal });
                }
            });

            return id;
        } catch (fallbackError) {
            console.error('[Terminal] Critical: Fallback failed completely', fallbackError);
            throw fallbackError;
        }
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
