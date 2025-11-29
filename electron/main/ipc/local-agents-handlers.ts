/**
 * Local Agents IPC Handlers
 *
 * Handles checking installation status, launching local AI coding agents,
 * and managing interactive sessions for task execution
 */

import { ipcMain, BrowserWindow } from 'electron';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import {
  sessionManager,
  SessionInfo,
  AgentResponse,
  SendMessageOptions,
} from '../services/local-agent-session';

const execAsync = promisify(exec);

interface AgentCheckResult {
  installed: boolean;
  version?: string;
}

/**
 * Check if a command is installed and get its version
 */
async function checkCommandInstalled(command: string): Promise<AgentCheckResult> {
  // Whitelist of allowed commands for security
  const allowedCommands = ['claude', 'codex', 'antigravity'];

  if (!allowedCommands.includes(command)) {
    console.warn(`Command not in whitelist: ${command}`);
    return { installed: false };
  }

  const enhancedPath = getEnhancedPath();
  console.log(`[LocalAgents] Checking ${command} with PATH:`, enhancedPath.split(':').slice(0, 10).join(':') + '...');

  try {
    // Try to get version using --version flag
    const { stdout } = await execAsync(`${command} --version`, {
      timeout: 5000,
      env: { ...process.env, PATH: enhancedPath },
    });

    console.log(`[LocalAgents] ${command} --version output:`, stdout.trim());

    // Extract version number from output
    const versionMatch = stdout.match(/(\d+\.\d+\.\d+)/);
    const version = versionMatch ? versionMatch[1] : undefined;

    return { installed: true, version };
  } catch (error) {
    console.log(`[LocalAgents] ${command} --version failed:`, (error as Error).message);
    // If --version fails, try which/where command
    try {
      const whichCmd = process.platform === 'win32' ? 'where' : 'which';
      const { stdout } = await execAsync(`${whichCmd} ${command}`, {
        timeout: 5000,
        env: { ...process.env, PATH: enhancedPath },
      });
      console.log(`[LocalAgents] ${whichCmd} ${command} found:`, stdout.trim());
      return { installed: true };
    } catch (whichError) {
      console.log(`[LocalAgents] ${command} not found:`, (whichError as Error).message);
      return { installed: false };
    }
  }
}

/**
 * Get all nvm node version bin directories
 */
function getNvmBinPaths(home: string): string[] {
  const nvmVersionsDir = join(home, '.nvm', 'versions', 'node');
  const paths: string[] = [];

  try {
    if (existsSync(nvmVersionsDir)) {
      const versions = readdirSync(nvmVersionsDir);
      for (const version of versions) {
        const binPath = join(nvmVersionsDir, version, 'bin');
        if (existsSync(binPath)) {
          paths.push(binPath);
        }
      }
    }
  } catch (error) {
    console.warn('Failed to scan nvm directories:', error);
  }

  return paths;
}

/**
 * Get enhanced PATH including common npm global directories
 */
function getEnhancedPath(): string {
  const currentPath = process.env.PATH || '';
  const additionalPaths: string[] = [];

  if (process.platform === 'darwin' || process.platform === 'linux') {
    // Common npm global paths on macOS/Linux
    const home = process.env.HOME || '';

    // Add nvm paths (all node versions)
    additionalPaths.push(...getNvmBinPaths(home));

    additionalPaths.push(
      '/usr/local/bin',
      '/opt/homebrew/bin',
      `${home}/.npm-global/bin`,
      `${home}/.local/bin`,
      `${home}/.yarn/bin`,
      `${home}/.pnpm`,
      '/usr/bin',
    );
  } else if (process.platform === 'win32') {
    // Common npm global paths on Windows
    const appData = process.env.APPDATA || '';
    const home = process.env.USERPROFILE || '';
    additionalPaths.push(
      `${appData}\\npm`,
      `${home}\\.nvm`,
      'C:\\Program Files\\nodejs',
    );
  }

  return [...additionalPaths, currentPath].join(process.platform === 'win32' ? ';' : ':');
}

/**
 * Launch agent in a new terminal window
 */
async function launchInTerminal(command: string): Promise<void> {
  // Whitelist of allowed commands for security
  const allowedCommands = ['claude', 'codex', 'antigravity'];

  if (!allowedCommands.includes(command)) {
    throw new Error(`Command not allowed: ${command}`);
  }

  const platform = process.platform;

  if (platform === 'darwin') {
    // macOS: Use osascript to open Terminal
    const script = `
      tell application "Terminal"
        activate
        do script "${command}"
      end tell
    `;
    spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' }).unref();
  } else if (platform === 'win32') {
    // Windows: Use cmd /c start
    spawn('cmd', ['/c', 'start', 'cmd', '/k', command], {
      detached: true,
      stdio: 'ignore',
      shell: true
    }).unref();
  } else {
    // Linux: Try common terminal emulators
    const terminals = [
      { cmd: 'gnome-terminal', args: ['--', command] },
      { cmd: 'konsole', args: ['-e', command] },
      { cmd: 'xterm', args: ['-e', command] },
      { cmd: 'xfce4-terminal', args: ['-e', command] },
    ];

    for (const terminal of terminals) {
      try {
        await execAsync(`which ${terminal.cmd}`);
        spawn(terminal.cmd, terminal.args, { detached: true, stdio: 'ignore' }).unref();
        return;
      } catch {
        continue;
      }
    }

    throw new Error('No supported terminal emulator found');
  }
}

/**
 * Register Local Agents IPC handlers
 */
export function registerLocalAgentsHandlers(mainWindow?: BrowserWindow | null): void {
  // Check if agent CLI is installed
  ipcMain.handle('localAgents:checkInstalled', async (_event, command: string): Promise<AgentCheckResult> => {
    try {
      return await checkCommandInstalled(command);
    } catch (error) {
      console.error(`Error checking ${command} installation:`, error);
      return { installed: false };
    }
  });

  // Launch agent in terminal
  ipcMain.handle('localAgents:launchInTerminal', async (_event, command: string): Promise<void> => {
    try {
      await launchInTerminal(command);
    } catch (error) {
      console.error(`Error launching ${command}:`, error);
      throw error;
    }
  });

  // ========================================
  // Session Management Handlers
  // ========================================

  // Create a new agent session
  ipcMain.handle('localAgents:createSession', async (
    _event,
    agentType: 'claude' | 'codex' | 'antigravity',
    workingDirectory: string,
    sessionId?: string
  ): Promise<SessionInfo> => {
    try {
      console.log(`[LocalAgents] Creating ${agentType} session in ${workingDirectory}`);
      const session = await sessionManager.createSession(agentType, workingDirectory, sessionId);

      // Setup event forwarding to renderer
      const agentSession = sessionManager.getSession(session.id);
      if (agentSession && mainWindow) {
        agentSession.on('message', (message) => {
          mainWindow.webContents.send('localAgents:sessionMessage', session.id, message);
        });

        agentSession.on('response', (response) => {
          mainWindow.webContents.send('localAgents:sessionResponse', session.id, response);
        });

        agentSession.on('error', (error) => {
          mainWindow.webContents.send('localAgents:sessionError', session.id, error);
        });

        agentSession.on('closed', () => {
          mainWindow.webContents.send('localAgents:sessionClosed', session.id);
        });
      }

      return session;
    } catch (error) {
      console.error(`Error creating ${agentType} session:`, error);
      throw error;
    }
  });

  // Get session info
  ipcMain.handle('localAgents:getSession', async (_event, sessionId: string): Promise<SessionInfo | null> => {
    const session = sessionManager.getSession(sessionId);
    return session ? session.getInfo() : null;
  });

  // Get all sessions
  ipcMain.handle('localAgents:getAllSessions', async (): Promise<SessionInfo[]> => {
    return sessionManager.getAllSessions();
  });

  // Send message to session
  ipcMain.handle('localAgents:sendMessage', async (
    _event,
    sessionId: string,
    message: string,
    options?: SendMessageOptions
  ): Promise<AgentResponse> => {
    try {
      console.log(`[LocalAgents] Sending message to session ${sessionId}`);
      return await sessionManager.sendMessage(sessionId, message, options);
    } catch (error) {
      console.error(`Error sending message to session ${sessionId}:`, error);
      throw error;
    }
  });

  // Close session
  ipcMain.handle('localAgents:closeSession', async (_event, sessionId: string): Promise<void> => {
    try {
      console.log(`[LocalAgents] Closing session ${sessionId}`);
      await sessionManager.closeSession(sessionId);
    } catch (error) {
      console.error(`Error closing session ${sessionId}:`, error);
      throw error;
    }
  });

  // Close all sessions
  ipcMain.handle('localAgents:closeAllSessions', async (): Promise<void> => {
    try {
      console.log('[LocalAgents] Closing all sessions');
      await sessionManager.closeAllSessions();
    } catch (error) {
      console.error('Error closing all sessions:', error);
      throw error;
    }
  });

  // Get session count
  ipcMain.handle('localAgents:getSessionCount', async (): Promise<number> => {
    return sessionManager.getSessionCount();
  });

  console.log('Local Agents IPC handlers registered');
}
