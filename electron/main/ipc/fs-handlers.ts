/**
 * File System IPC Handlers
 *
 * Handles file system operations for the renderer process.
 * Provides secure access to file system operations.
 */

import { ipcMain, dialog, shell, BrowserWindow, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Types for discovered repositories
interface DiscoveredRepo {
  path: string;
  name: string;
  type: 'git' | 'claude-code' | 'codex' | 'antigravity';
  lastModified: Date;
  description?: string;
  remoteUrl?: string;
}

/**
 * Register all file system related IPC handlers
 */
export function registerFsHandlers(_mainWindow: BrowserWindow | null): void {
  // ========================================
  // Read Directory
  // ========================================

  ipcMain.handle('fs:readDir', async (_event, dirPath: string) => {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const results = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(dirPath, entry.name);
          let size = 0;

          try {
            if (!entry.isDirectory()) {
              const stat = await fs.promises.stat(fullPath);
              size = stat.size;
            }
          } catch {
            // Ignore stat errors
          }

          return {
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            size,
          };
        })
      );

      return results;
    } catch (error) {
      console.error('[fs:readDir] Error:', error);
      throw error;
    }
  });

  // ========================================
  // Read File
  // ========================================

  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      console.error('[fs:readFile] Error:', error);
      throw error;
    }
  });

  // ========================================
  // Check Path Exists
  // ========================================

  ipcMain.handle('fs:exists', async (_event, targetPath: string) => {
    try {
      await fs.promises.access(targetPath);
      return true;
    } catch {
      return false;
    }
  });

  // ========================================
  // Get Stats
  // ========================================

  ipcMain.handle('fs:stat', async (_event, targetPath: string) => {
    try {
      const stat = await fs.promises.stat(targetPath);
      return {
        size: stat.size,
        isDirectory: stat.isDirectory(),
        mtime: stat.mtime,
      };
    } catch (error) {
      console.error('[fs:stat] Error:', error);
      throw error;
    }
  });

  // ========================================
  // Select Directory Dialog
  // ========================================

  ipcMain.handle('fs:selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  // ========================================
  // Select File Dialog
  // ========================================

  ipcMain.handle(
    'fs:selectFile',
    async (_event, filters?: { name: string; extensions: string[] }[]) => {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: filters || [{ name: 'All Files', extensions: ['*'] }],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return result.filePaths[0];
    }
  );

  // ========================================
  // Shell: Open Path
  // ========================================

  ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
    try {
      await shell.openPath(targetPath);
      return true;
    } catch (error) {
      console.error('[shell:openPath] Error:', error);
      throw error;
    }
  });

  // ========================================
  // Scan for Local Repositories
  // ========================================

  ipcMain.handle('fs:scanRepositories', async (_event, options?: {
    searchPaths?: string[];
    maxDepth?: number;
    includeGit?: boolean;
    includeClaudeCode?: boolean;
    includeCodex?: boolean;
    includeAntigravity?: boolean;
  }) => {
    const {
      searchPaths = getDefaultSearchPaths(),
      maxDepth = 3,
      includeGit = true,
      includeClaudeCode = true,
      includeCodex = true,
      includeAntigravity = true,
    } = options || {};

    const repos: DiscoveredRepo[] = [];
    const visited = new Set<string>();

    async function scanDirectory(dirPath: string, depth: number): Promise<void> {
      if (depth > maxDepth || visited.has(dirPath)) return;
      visited.add(dirPath);

      try {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

        // Check for repository indicators
        const hasGit = entries.some(e => e.name === '.git' && e.isDirectory());
        const hasClaudeCode = entries.some(e => e.name === '.claude' || e.name === 'CLAUDE.md');
        const hasCodex = entries.some(e => e.name === '.codex' || e.name === 'codex.json');
        const hasAntigravity = entries.some(e => e.name === '.antigravity' || e.name === 'antigravity.config.json');

        if (hasGit && includeGit) {
          const repo = await createRepoEntry(dirPath, 'git');
          if (repo) repos.push(repo);
        }
        if (hasClaudeCode && includeClaudeCode) {
          const repo = await createRepoEntry(dirPath, 'claude-code');
          if (repo) repos.push(repo);
        }
        if (hasCodex && includeCodex) {
          const repo = await createRepoEntry(dirPath, 'codex');
          if (repo) repos.push(repo);
        }
        if (hasAntigravity && includeAntigravity) {
          const repo = await createRepoEntry(dirPath, 'antigravity');
          if (repo) repos.push(repo);
        }

        // Don't recurse into found repositories or node_modules
        if (hasGit || hasClaudeCode || hasCodex || hasAntigravity) return;

        // Scan subdirectories
        for (const entry of entries) {
          if (entry.isDirectory() &&
              !entry.name.startsWith('.') &&
              entry.name !== 'node_modules' &&
              entry.name !== 'vendor' &&
              entry.name !== 'dist' &&
              entry.name !== 'build') {
            await scanDirectory(path.join(dirPath, entry.name), depth + 1);
          }
        }
      } catch (error) {
        // Ignore permission errors
      }
    }

    async function createRepoEntry(repoPath: string, type: DiscoveredRepo['type']): Promise<DiscoveredRepo | null> {
      try {
        const stat = await fs.promises.stat(repoPath);
        const name = path.basename(repoPath);

        let description: string | undefined;
        let remoteUrl: string | undefined;

        // Try to get git remote URL
        if (type === 'git') {
          try {
            remoteUrl = execSync('git remote get-url origin', {
              cwd: repoPath,
              encoding: 'utf-8',
              timeout: 5000
            }).trim();
          } catch {
            // No remote configured
          }
        }

        // Try to read package.json description
        try {
          const pkgPath = path.join(repoPath, 'package.json');
          const pkg = JSON.parse(await fs.promises.readFile(pkgPath, 'utf-8'));
          description = pkg.description;
        } catch {
          // No package.json
        }

        // Try to read README for description
        if (!description) {
          try {
            const readmePath = path.join(repoPath, 'README.md');
            const readme = await fs.promises.readFile(readmePath, 'utf-8');
            // Get first non-empty line after title
            const lines = readme.split('\n').filter(l => l.trim() && !l.startsWith('#'));
            if (lines[0]) {
              description = lines[0].substring(0, 200);
            }
          } catch {
            // No README
          }
        }

        return {
          path: repoPath,
          name,
          type,
          lastModified: stat.mtime,
          description,
          remoteUrl,
        };
      } catch {
        return null;
      }
    }

    // Scan all search paths
    for (const searchPath of searchPaths) {
      try {
        await fs.promises.access(searchPath);
        await scanDirectory(searchPath, 0);
      } catch {
        // Path doesn't exist or no access
      }
    }

    // Sort by last modified (most recent first)
    repos.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());

    // Remove duplicates (same path with different types)
    const uniqueRepos = repos.filter((repo, index, arr) =>
      arr.findIndex(r => r.path === repo.path) === index
    );

    return uniqueRepos;
  });

  // ========================================
  // Check Directory for AI Agent Config
  // ========================================

  ipcMain.handle('fs:checkRepoType', async (_event, dirPath: string) => {
    try {
      const entries = await fs.promises.readdir(dirPath);

      const types: string[] = [];

      if (entries.includes('.git')) types.push('git');
      if (entries.includes('.claude') || entries.includes('CLAUDE.md')) types.push('claude-code');
      if (entries.includes('.codex') || entries.includes('codex.json')) types.push('codex');
      if (entries.includes('.antigravity') || entries.includes('antigravity.config.json')) types.push('antigravity');

      // Get additional info
      let name = path.basename(dirPath);
      let description: string | undefined;
      let remoteUrl: string | undefined;

      // Try package.json
      try {
        const pkgPath = path.join(dirPath, 'package.json');
        const pkg = JSON.parse(await fs.promises.readFile(pkgPath, 'utf-8'));
        if (pkg.name) name = pkg.name;
        description = pkg.description;
      } catch {
        // No package.json
      }

      // Try git remote
      if (types.includes('git')) {
        try {
          remoteUrl = execSync('git remote get-url origin', {
            cwd: dirPath,
            encoding: 'utf-8',
            timeout: 5000
          }).trim();
        } catch {
          // No remote
        }
      }

      return {
        path: dirPath,
        name,
        types,
        description,
        remoteUrl,
        isValid: types.length > 0,
      };
    } catch (error) {
      console.error('[fs:checkRepoType] Error:', error);
      return {
        path: dirPath,
        name: path.basename(dirPath),
        types: [],
        isValid: false,
      };
    }
  });

  console.log('[IPC] File system handlers registered');
}

// Helper function to get default search paths
function getDefaultSearchPaths(): string[] {
  const home = app.getPath('home');
  const paths: string[] = [];

  // Common development directories
  const devDirs = [
    'Development',
    'Developments',
    'Developer',
    'Projects',
    'repos',
    'git',
    'workspace',
    'src',
    'code',
    'Code',
    'GitHub',
    'GitLab',
    'Bitbucket',
  ];

  for (const dir of devDirs) {
    paths.push(path.join(home, dir));
  }

  // Also check Documents
  paths.push(path.join(home, 'Documents', 'Projects'));
  paths.push(path.join(home, 'Documents', 'Development'));

  // Desktop (some people put projects there)
  paths.push(path.join(home, 'Desktop'));

  return paths;
}
