/**
 * File System Monitor
 *
 * Monitors a directory for file changes during local agent execution
 * Returns list of created/modified files
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, relative, extname } from 'path';

export interface FileChange {
    path: string;
    relativePath: string;
    type: 'created' | 'modified';
    content?: string;
    size: number;
    mtime: Date;
    extension: string;
}

export class FileSystemMonitor {
    private baseDir: string;
    private beforeSnapshot: Map<string, { size: number; mtime: number }> = new Map();

    constructor(baseDir: string) {
        this.baseDir = baseDir;
    }

    /**
     * Take a snapshot of the current file system state
     */
    takeSnapshot(): void {
        this.beforeSnapshot.clear();
        this.scanDirectory(this.baseDir);
    }

    private scanDirectory(dir: string): void {
        try {
            if (!existsSync(dir)) return;

            const entries = readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = join(dir, entry.name);

                // Skip hidden files and common directories
                if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                    continue;
                }

                if (entry.isDirectory()) {
                    this.scanDirectory(fullPath);
                } else if (entry.isFile()) {
                    const stats = statSync(fullPath);
                    const relativePath = relative(this.baseDir, fullPath);
                    this.beforeSnapshot.set(relativePath, {
                        size: stats.size,
                        mtime: stats.mtimeMs,
                    });
                }
            }
        } catch (error) {
            console.warn(`Failed to scan directory ${dir}:`, error);
        }
    }

    /**
     * Get files that have been created or modified since snapshot
     */
    getChanges(options?: { includeContent?: boolean; maxFileSize?: number }): FileChange[] {
        const changes: FileChange[] = [];
        const maxSize = options?.maxFileSize || 1024 * 1024; // 1MB default
        const includeContent = options?.includeContent ?? true;

        // Scan current state and compare
        const afterSnapshot = new Map<string, { size: number; mtime: number }>();
        this.scanDirectoryForChanges(this.baseDir, afterSnapshot);

        // Find new or modified files
        for (const [relativePath, afterStats] of afterSnapshot.entries()) {
            const beforeStats = this.beforeSnapshot.get(relativePath);
            const fullPath = join(this.baseDir, relativePath);

            let changeType: 'created' | 'modified';

            if (!beforeStats) {
                changeType = 'created';
            } else if (
                afterStats.mtime > beforeStats.mtime ||
                afterStats.size !== beforeStats.size
            ) {
                changeType = 'modified';
            } else {
                continue; // No change
            }

            const ext = extname(relativePath);
            let content: string | undefined;

            // Read content for text files if requested and not too large
            if (includeContent && afterStats.size <= maxSize) {
                const textExtensions = [
                    '.html',
                    '.css',
                    '.js',
                    '.ts',
                    '.json',
                    '.md',
                    '.txt',
                    '.xml',
                    '.svg',
                    '.yaml',
                    '.yml',
                ];
                if (textExtensions.includes(ext.toLowerCase())) {
                    try {
                        content = readFileSync(fullPath, 'utf-8');
                    } catch (error) {
                        console.warn(`Failed to read file ${fullPath}:`, error);
                    }
                }
            }

            changes.push({
                path: fullPath,
                relativePath,
                type: changeType,
                content,
                size: afterStats.size,
                mtime: new Date(afterStats.mtime),
                extension: ext,
            });
        }

        return changes;
    }

    private scanDirectoryForChanges(
        dir: string,
        snapshot: Map<string, { size: number; mtime: number }>
    ): void {
        try {
            if (!existsSync(dir)) return;

            const entries = readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = join(dir, entry.name);

                // Skip hidden files and common directories
                if (entry.name.startsWith('.') || entry.name === 'node_modules') {
                    continue;
                }

                if (entry.isDirectory()) {
                    this.scanDirectoryForChanges(fullPath, snapshot);
                } else if (entry.isFile()) {
                    const stats = statSync(fullPath);
                    const relativePath = relative(this.baseDir, fullPath);
                    snapshot.set(relativePath, {
                        size: stats.size,
                        mtime: stats.mtimeMs,
                    });
                }
            }
        } catch (error) {
            console.warn(`Failed to scan directory ${dir}:`, error);
        }
    }
}
