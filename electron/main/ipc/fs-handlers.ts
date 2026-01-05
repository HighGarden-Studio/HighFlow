/**
 * File System IPC Handlers
 *
 * Handles file system operations for the renderer process.
 * Provides secure access to file system operations.
 */

import { ipcMain, dialog, shell, BrowserWindow, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { exec, execSync } from 'child_process';
import * as util from 'util';

const execAsync = util.promisify(exec);

// Types for discovered repositories
interface DiscoveredRepo {
    path: string;
    name: string;
    type: string;
    types?: string[]; // All detected types
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

    ipcMain.handle('fs:readFileBase64', async (_event, filePath: string) => {
        try {
            const content = await fs.promises.readFile(filePath);
            return content.toString('base64');
        } catch (error) {
            console.error('[fs:readFileBase64] Error:', error);
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
    // Select Multiple Files Dialog
    // ========================================

    ipcMain.handle(
        'fs:selectMultipleFiles',
        async (_event, filters?: { name: string; extensions: string[] }[]) => {
            const result = await dialog.showOpenDialog({
                properties: ['openFile', 'multiSelections'],
                filters: filters || [{ name: 'All Files', extensions: ['*'] }],
            });

            if (result.canceled || result.filePaths.length === 0) {
                return null;
            }

            return result.filePaths;
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

    ipcMain.handle(
        'fs:scanRepositories',
        async (
            _event,
            options?: {
                searchPaths?: string[];
                maxDepth?: number;
                includeGit?: boolean;
                includeClaudeCode?: boolean;
                includeCodex?: boolean;
            }
        ) => {
            const {
                searchPaths = getDefaultSearchPaths(),
                maxDepth = 3,
                includeGit = true,
                includeClaudeCode = true,
                includeCodex = true,
            } = options || {};

            const repos: DiscoveredRepo[] = [];
            const visited = new Set<string>();

            async function scanDirectory(dirPath: string, depth: number): Promise<void> {
                if (depth > maxDepth || visited.has(dirPath)) return;
                visited.add(dirPath);

                try {
                    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

                    // Check for repository indicators
                    const types: string[] = [];

                    const hasGit = entries.some((e) => e.name === '.git' && e.isDirectory());
                    if (hasGit && includeGit) types.push('git');

                    const hasClaudeCode = entries.some(
                        (e) => e.name === '.claude' || e.name === 'CLAUDE.md'
                    );
                    if (hasClaudeCode && includeClaudeCode) types.push('claude-code');

                    // Check for Codex - check root and docs/
                    let hasCodex = entries.some(
                        (e) =>
                            e.name === '.codex' ||
                            e.name === 'codex.json' ||
                            e.name === '.codex.json'
                    );
                    if (!hasCodex && entries.some((e) => e.name === 'docs' && e.isDirectory())) {
                        try {
                            const docsEntries = await fs.promises.readdir(
                                path.join(dirPath, 'docs')
                            );
                            if (
                                docsEntries.some(
                                    (e) => e.includes('CODEX_GUIDELINES') || e.includes('CODEX.md')
                                )
                            ) {
                                hasCodex = true;
                            }
                        } catch {}
                    }
                    if (hasCodex && includeCodex) types.push('codex');

                    if (hasCodex && includeCodex) types.push('codex');

                    const hasCursor = entries.some(
                        (e) => e.name === '.cursor' || e.name === '.cursorrules'
                    );
                    if (hasCursor) types.push('cursor');

                    const hasWindsurf = entries.some(
                        (e) => e.name === '.windsurf' || e.name === '.windsurfrules'
                    );
                    if (hasWindsurf) types.push('windsurf');

                    const hasAider = entries.some(
                        (e) => e.name === '.aider' || e.name === '.aider.conf.yml'
                    );
                    if (hasAider) types.push('aider');

                    // Check for copilot
                    if (entries.some((e) => e.name === '.github' && e.isDirectory())) {
                        try {
                            const githubEntries = await fs.promises.readdir(
                                path.join(dirPath, '.github')
                            );
                            if (
                                githubEntries.includes('copilot.yml') ||
                                githubEntries.includes('copilot.yaml')
                            ) {
                                types.push('copilot');
                            }
                        } catch {
                            // Ignore
                        }
                    }

                    // If any types detected, create repo entry
                    if (types.length > 0) {
                        const repo = await createRepoEntry(dirPath, types);
                        if (repo) repos.push(repo);
                        // Don't recurse into found repositories
                        return;
                    }

                    // Scan subdirectories
                    for (const entry of entries) {
                        if (
                            entry.isDirectory() &&
                            !entry.name.startsWith('.') &&
                            entry.name !== 'node_modules' &&
                            entry.name !== 'vendor' &&
                            entry.name !== 'dist' &&
                            entry.name !== 'build'
                        ) {
                            await scanDirectory(path.join(dirPath, entry.name), depth + 1);
                        }
                    }
                } catch (error) {
                    // Ignore permission errors
                }
            }

            async function createRepoEntry(
                repoPath: string,
                types: string[]
            ): Promise<DiscoveredRepo | null> {
                try {
                    const stat = await fs.promises.stat(repoPath);
                    const name = path.basename(repoPath);

                    let description: string | undefined;
                    let remoteUrl: string | undefined;

                    // Try to get git remote URL
                    if (types.includes('git')) {
                        try {
                            const { stdout } = await execAsync('git remote get-url origin', {
                                cwd: repoPath,
                                encoding: 'utf-8',
                            });
                            remoteUrl = stdout.trim();
                        } catch {
                            // No remote configured
                        }
                    }

                    // Try to read package.json description
                    try {
                        const pkgPath = path.join(repoPath, 'package.json');
                        const pkg = JSON.parse(await fs.promises.readFile(pkgPath, 'utf-8'));
                        // if (pkg.name) name = pkg.name; // name is const
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
                            const lines = readme
                                .split('\n')
                                .filter((l) => l.trim() && !l.startsWith('#'));
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
                        type: types[0] as any, // Primary type
                        types, // All detected types
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

            // Remove duplicates (same path)
            const uniqueRepos = repos.filter(
                (repo, index, arr) => arr.findIndex((r) => r.path === repo.path) === index
            );

            return uniqueRepos;
        }
    );

    // ========================================
    // Check Directory for AI Agent Config
    // ========================================

    ipcMain.handle('fs:checkRepoType', async (_event, dirPath: string) => {
        try {
            console.log('[fs:checkRepoType] Checking directory:', dirPath);
            const entries = await fs.promises.readdir(dirPath);
            console.log(
                '[fs:checkRepoType] Entries found:',
                entries.filter((e) => e.startsWith('.') || e.endsWith('.json') || e.endsWith('.md'))
            );

            const types: string[] = [];

            // Git
            if (entries.includes('.git')) types.push('git');

            // AI Coding Assistants - check for configuration directories and files
            if (entries.includes('.claude') || entries.includes('CLAUDE.md')) {
                console.log('[fs:checkRepoType] Detected claude-code');
                types.push('claude-code');
            }

            if (
                entries.includes('.codex') ||
                entries.includes('codex.json') ||
                entries.includes('.codex.json')
            ) {
                console.log('[fs:checkRepoType] Detected codex');
                types.push('codex');
            }

            if (entries.includes('.cursor') || entries.includes('.cursorrules')) {
                console.log('[fs:checkRepoType] Detected cursor');
                types.push('cursor');
            }

            if (entries.includes('.windsurf') || entries.includes('.windsurfrules')) {
                console.log('[fs:checkRepoType] Detected windsurf');
                types.push('windsurf');
            }

            if (entries.includes('.aider') || entries.includes('.aider.conf.yml')) {
                console.log('[fs:checkRepoType] Detected aider');
                types.push('aider');
            }

            // Check for copilot in .github directory
            if (entries.includes('.github')) {
                try {
                    const githubEntries = await fs.promises.readdir(path.join(dirPath, '.github'));
                    if (
                        githubEntries.includes('copilot.yml') ||
                        githubEntries.includes('copilot.yaml')
                    ) {
                        console.log('[fs:checkRepoType] Detected copilot');
                        types.push('copilot');
                    }
                } catch {
                    // Ignore errors reading .github
                }
            }

            // Log detected types for debugging
            console.log('[fs:checkRepoType] Final detected types:', types);

            // Get additional info
            let name = path.basename(dirPath);
            let description: string | undefined;
            let remoteUrl: string | undefined;

            // Try package.json
            try {
                const pkgPath = path.join(dirPath, 'package.json');
                if (fs.existsSync(pkgPath)) {
                    const pkg = JSON.parse(await fs.promises.readFile(pkgPath, 'utf-8'));
                    if (pkg.name) name = pkg.name;
                    description = pkg.description;
                }
            } catch (e) {
                // Ignore errors reading package.json
                console.warn('[fs:checkRepoType] Failed to read package.json:', e);
            }

            // Try to get git remote url - independent of type detection
            if (entries.includes('.git')) {
                try {
                    const { stdout } = await execAsync('git remote get-url origin', {
                        cwd: dirPath,
                    });
                    remoteUrl = stdout.trim();
                } catch (e) {
                    // Ignore git errors (e.g. no remote configured)
                    // console.debug('[fs:checkRepoType] No git remote found or git error');
                }
            }

            return {
                isValid: types.length > 0,
                path: dirPath,
                name,
                type: types[0] || 'git',
                types, // Return all detected types
                description,
                remoteUrl,
            };
        } catch (error) {
            console.error('Failed to check repo type:', error);
            return {
                isValid: false,
                path: dirPath,
                name: path.basename(dirPath),
                type: 'git',
                types: ['git'],
                description: undefined,
            };
        }
    });

    // ========================================
    // Read Claude Desktop Configuration
    // ========================================

    ipcMain.handle('fs:readClaudeSettings', async () => {
        try {
            // Claude Desktop config location on macOS
            const configPath = path.join(
                app.getPath('appData'),
                'Claude',
                'claude_desktop_config.json'
            );

            // Check if file exists
            try {
                await fs.promises.access(configPath);
            } catch {
                console.log('[fs:readClaudeSettings] Claude Desktop config not found');
                return null;
            }

            // Read and parse the config
            const content = await fs.promises.readFile(configPath, 'utf-8');
            const config = JSON.parse(content);

            console.log('[fs:readClaudeSettings] Successfully read Claude Desktop config');
            return config;
        } catch (error) {
            console.error('[fs:readClaudeSettings] Error reading Claude settings:', error);
            return null;
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
