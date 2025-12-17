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
        // Prioritize explicit parser type, then fall back to readMode
        const parserType = config?.parser?.type;
        const readMode = config?.readMode || 'text';

        const stats = await fs.stat(filePath);
        const fileName = path.basename(filePath);
        const ext = path.extname(filePath).toLowerCase();

        // 0. Explicit Document Parsing (DOCX, PDF)
        if (
            parserType === 'docx' ||
            parserType === 'pdf' ||
            (!parserType && (ext === '.docx' || ext === '.pdf'))
        ) {
            try {
                // Determine type from parserType or extension fallback
                const type = parserType === 'docx' || ext === '.docx' ? 'docx' : 'pdf';
                const { DocumentParser } = await import('../../../data/DocumentParser');
                const parsed = await DocumentParser.parse(filePath, type);

                return {
                    kind: 'text', // Treated as text (extracted content)
                    text: parsed.content,
                    mimeType:
                        type === 'docx'
                            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                            : 'application/pdf',
                    file: {
                        name: fileName,
                        path: filePath,
                        size: stats.size,
                    },
                    metadata: {
                        source: 'local_file',
                        parser: type,
                        ...parsed.metadata,
                    },
                };
            } catch (e: any) {
                return {
                    kind: 'error',
                    text: `Failed to parse document: ${e.message}`,
                    metadata: { error: e.message },
                };
            }
        }

        // 1. Text Mode (Simple read for txt, md, json, csv, etc.) - or parserType='text'/'markdown'
        if (
            parserType === 'text' ||
            parserType === 'markdown' ||
            (!parserType && readMode === 'text')
        ) {
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

        // 2. Table Mode (CSV, Excel) - or parserType='csv'/'xlsx'
        if (
            parserType === 'csv' ||
            parserType === 'xlsx' ||
            (!parserType && readMode === 'table')
        ) {
            try {
                const { TableParser } = await import('../../../data/TableParser'); // Dynamic import to avoid loading heavy libs if not needed
                const tableData = await TableParser.parseFile(filePath);

                return {
                    kind: 'table',
                    table: {
                        columns: tableData.columns,
                        rows: tableData.rows,
                    },
                    file: { name: fileName, path: filePath, size: stats.size },
                    metadata: {
                        source: 'local_file',
                        readMode: 'table',
                        ...tableData.metadata,
                    },
                };
            } catch (e: any) {
                return {
                    kind: 'error',
                    text: `Failed to parse table file: ${e.message}`,
                    metadata: { error: e.message },
                };
            }
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
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.xls': 'application/vnd.ms-excel',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        };
        return map[ext] || 'application/octet-stream';
    }
}
