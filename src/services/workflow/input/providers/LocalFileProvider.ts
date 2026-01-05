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

    async start(task: Task, _ctx: ExecutionContext): Promise<void> {
        console.log(
            `[LocalFileProvider] Task #${task.projectSequence} is waiting for file selection.`
        );
    }

    async validate(task: Task, payload: any): Promise<{ valid: boolean; error?: string }> {
        // Payload can be { filePath: string } or { filePaths: string[] }
        const paths: string[] = [];

        if (payload?.filePaths && Array.isArray(payload.filePaths)) {
            paths.push(...payload.filePaths);
        } else if (payload?.filePath) {
            paths.push(payload.filePath);
        }

        if (paths.length === 0) {
            return { valid: false, error: 'No files selected' };
        }

        // Check extension if configured
        const config = task.inputConfig?.localFile;
        if (config?.acceptedExtensions && config.acceptedExtensions.length > 0) {
            const accepted = config.acceptedExtensions.map((e) =>
                e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`
            );

            for (const p of paths) {
                const ext = path.extname(p).toLowerCase();
                if (!accepted.includes(ext)) {
                    return {
                        valid: false,
                        error: `File type not accepted for ${path.basename(p)}. Allowed: ${accepted.join(', ')}`,
                    };
                }
            }
        }

        try {
            await Promise.all(paths.map((p) => fs.access(p)));
            return { valid: true };
        } catch {
            return { valid: false, error: 'One or more files do not exist or are not accessible' };
        }
    }

    async submit(task: Task, payload: any): Promise<TaskOutput> {
        const filePaths: string[] = [];
        if (payload.filePaths && Array.isArray(payload.filePaths)) {
            filePaths.push(...payload.filePaths);
        } else if (payload.filePath) {
            filePaths.push(payload.filePath);
        }

        const config = task.inputConfig?.localFile;
        const parserType = config?.parser?.type;
        const readMode = config?.readMode || 'text';

        const results: any[] = [];
        const attachments: any[] = [];
        const filesMetadata: any[] = [];

        for (const filePath of filePaths) {
            try {
                const result = await this.processSingleFile(filePath, parserType, readMode);
                results.push(result);

                filesMetadata.push(result.file);

                // Collect attachments
                if (result.metadata?.attachments) {
                    attachments.push(...result.metadata.attachments);
                }
            } catch (error: any) {
                console.error(`Failed to process ${filePath}:`, error);
                // Should we fail all or just report error? For now, let's fail.
                return {
                    kind: 'error',
                    text: `Failed to process ${path.basename(filePath)}: ${error.message}`,
                    metadata: { error: error.message },
                };
            }
        }

        // Aggregation logic
        // If single file, return compatible structure with 'file' property
        // If multiple, 'files' property is primary
        // 'text' property will be concatenated content of all text-readable files

        const concatenatedText = results
            .filter((r) => r.kind === 'text' || (r.kind === 'file' && r.text)) // Some file results might have text
            .map((r) => `--- File: ${r.file.name} ---\n${r.text || ''}`)
            .join('\n\n');

        const firstResult = results[0];

        // If only 1 file, return mostly compatible structure but add 'files' array too
        if (results.length === 1) {
            return {
                ...firstResult,
                files: filesMetadata, // Add files array
                metadata: {
                    ...firstResult.metadata,
                    attachments, // Ensure attachments are preserved
                },
            };
        }

        // Multiple files
        return {
            kind: 'file', // General kind
            text: concatenatedText,
            files: filesMetadata,
            mimeType: 'application/octet-stream', // Mixed
            metadata: {
                source: 'local_file',
                readMode: readMode,
                attachments: attachments,
                fileCount: results.length,
            },
        };
    }

    private async processSingleFile(
        filePath: string,
        parserType: any,
        readMode: string
    ): Promise<TaskOutput> {
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
                const type = parserType === 'docx' || ext === '.docx' ? 'docx' : 'pdf';
                const { DocumentParser } = await import('../../../data/DocumentParser');
                const parsed = await DocumentParser.parse(filePath, type);

                return {
                    kind: 'text',
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
                // Return error kind but wrapped, caller handles it?
                // Actually caller expects TaskOutput or failure.
                throw new Error(`Failed to parse document: ${e.message}`);
            }
        }

        // 3. Auto Mode (Smart detection) - REUSING LOGIC
        // We moved the logic here to support iteration.
        // Original logic checked Parser Type first, then Image, then Text, Table, Auto.
        // Let's preserve order from original file but adapted for single file processing fn.

        // ... (Re-implementing logic from original submit) ...
        // Actually, to keep it clean and minimal diff, I will paste the core logic logic here.

        // Image check
        const mimeType = this.getMimeType(ext);
        if (mimeType.startsWith('image/')) {
            const buffer = await fs.readFile(filePath);
            const base64 = buffer.toString('base64');
            return {
                kind: 'file',
                file: { name: fileName, path: filePath, size: stats.size },
                mimeType: mimeType,
                metadata: {
                    source: 'local_file',
                    readMode: readMode || 'auto',
                    attachments: [
                        {
                            type: 'image',
                            mime: mimeType,
                            value: base64,
                            data: base64,
                            name: fileName,
                        },
                    ],
                },
            };
        }

        // Text Mode
        if (
            parserType === 'text' ||
            parserType === 'markdown' ||
            (!parserType && readMode === 'text')
        ) {
            const content = await fs.readFile(filePath, 'utf-8');
            return {
                kind: 'text',
                text: content,
                mimeType: this.getMimeType(ext),
                file: { name: fileName, path: filePath, size: stats.size },
                metadata: { source: 'local_file', readMode: 'text' },
            };
        }

        // Table Mode
        if (
            parserType === 'csv' ||
            parserType === 'xlsx' ||
            (!parserType && readMode === 'table')
        ) {
            const { TableParser } = await import('../../../data/TableParser');
            const tableData = await TableParser.parseFile(filePath);
            // Convert rows from objects to arrays based on columns
            const rowsAsArrays = tableData.rows.map((row) =>
                tableData.columns.map((col) => row[col])
            );

            return {
                kind: 'table',
                table: { columns: tableData.columns, rows: rowsAsArrays },
                file: { name: fileName, path: filePath, size: stats.size },
                metadata: {
                    source: 'local_file',
                    readMode: 'table',
                    ...tableData.metadata,
                },
            };
        }

        // Auto Mode (Non-image handled above)
        if (readMode === 'auto') {
            const isTextLike =
                mimeType.startsWith('text/') ||
                mimeType === 'application/json' ||
                ['.md', '.xml', '.yml', '.yaml', '.svg'].includes(ext);

            if (isTextLike) {
                try {
                    const content = await fs.readFile(filePath, 'utf-8');
                    return {
                        kind: 'text',
                        text: content,
                        mimeType: mimeType,
                        file: { name: fileName, path: filePath, size: stats.size },
                        metadata: { source: 'local_file', readMode: 'auto' },
                    };
                } catch (e) {
                    // Fallback
                }
            }
        }

        // Binary Fallback
        return {
            kind: 'file',
            file: { name: fileName, path: filePath, size: stats.size },
            mimeType: this.getMimeType(ext),
            metadata: { source: 'local_file', readMode: 'binary' },
        };
    }

    async cancel(_task: Task): Promise<void> {
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
