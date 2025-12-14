import type { InputProvider, ExecutionContext } from '../InputProvider';
import type { Task, TaskOutput } from '../../../../core/types/database';
import * as fs from 'fs/promises';
import * as path from 'path';

export class LocalFileProvider implements InputProvider {
    canHandle(task: Task): boolean {
        let config = task.inputConfig;
        if (typeof config === 'string') {
            try {
                config = JSON.parse(config);
            } catch {
                return false;
            }
        }
        return (config as any)?.sourceType === 'LOCAL_FILE';
    }

    async start(task: Task, ctx: ExecutionContext): Promise<void> {
        console.log(`[LocalFileProvider] Task ${task.id} is waiting for file selection.`);
    }

    async validate(task: Task, payload: any): Promise<{ valid: boolean; error?: string }> {
        // Payload is expected to be { filePath: string }
        if (!payload || !payload.filePath) {
            return { valid: false, error: 'No file path provided' };
        }

        // Check extension if configured
        const config = task.inputConfig?.localFile;
        if (config?.acceptedExtensions && config.acceptedExtensions.length > 0) {
            const ext = path.extname(payload.filePath).toLowerCase();
            // Normalize extensions (ensure they start with .)
            const accepted = config.acceptedExtensions.map((e) =>
                e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`
            );
            if (!accepted.includes(ext)) {
                return {
                    valid: false,
                    error: `File type not accepted. Allowed: ${accepted.join(', ')}`,
                };
            }
        }

        try {
            await fs.access(payload.filePath);
            return { valid: true };
        } catch {
            return { valid: false, error: 'File does not exist or is not accessible' };
        }
    }

    async submit(task: Task, payload: any): Promise<TaskOutput> {
        const filePath = payload.filePath;
        const config = task.inputConfig?.localFile;
        const readMode = config?.readMode || 'text';

        const stats = await fs.stat(filePath);
        const fileName = path.basename(filePath);
        const ext = path.extname(filePath).toLowerCase();

        // 1. Text Mode (Simple read for txt, md, json, csv, etc.)
        if (readMode === 'text') {
            try {
                const content = await fs.readFile(filePath, 'utf-8');
                return {
                    kind: 'text',
                    text: content,
                    mimeType: this.getMimeType(ext),
                    file: {
                        name: fileName,
                        path: filePath,
                        size: stats.size,
                    },
                    metadata: { source: 'local_file', readMode: 'text' },
                };
            } catch (e: any) {
                return {
                    kind: 'error',
                    text: `Failed to read text file: ${e.message}`,
                    metadata: { error: e.message },
                };
            }
        }

        // 2. Table Mode (CSV parsing for MVP)
        if (readMode === 'table') {
            // TODO: Integrate a CSV parser library. For now, basic fallback or error.
            // Assuming CSV for MVP
            if (ext === '.csv') {
                const content = await fs.readFile(filePath, 'utf-8');
                // Very basic CSV parser (MVP)
                const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
                const columns = lines[0].split(',');
                const rows = lines.slice(1).map((line) => line.split(','));

                return {
                    kind: 'table',
                    table: { columns, rows },
                    file: { name: fileName, path: filePath, size: stats.size },
                    metadata: { source: 'local_file', readMode: 'table' },
                };
            }
            // Fallback to text if not supported
            const content = await fs.readFile(filePath, 'utf-8');
            return {
                kind: 'text',
                text: content,
                metadata: {
                    warning:
                        'Table parsing not supported for this file type yet, fell back to text.',
                },
            };
        }

        // 3. Binary (Just return file metadata)
        return {
            kind: 'file',
            file: {
                name: fileName,
                path: filePath,
                size: stats.size,
            },
            mimeType: this.getMimeType(ext),
            metadata: { source: 'local_file', readMode: 'binary' },
        };
    }

    async cancel(task: Task): Promise<void> {
        // Cleanup if needed
    }

    private getMimeType(ext: string): string {
        const map: Record<string, string> = {
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.json': 'application/json',
            '.csv': 'text/csv',
            '.js': 'text/javascript',
            '.ts': 'text/typescript',
            '.html': 'text/html',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.pdf': 'application/pdf',
        };
        return map[ext] || 'application/octet-stream';
    }
}
