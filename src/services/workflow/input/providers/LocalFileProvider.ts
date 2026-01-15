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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const parserType = config?.parser?.type;
        const readMode = config?.readMode || 'text';

        const attachments: any[] = [];
        const filesMetadata: any[] = [];
        const failedPaths: string[] = [];

        // Helper to recursively get files
        const getAllFiles = async (dirPath: string): Promise<string[]> => {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            const files: string[] = [];
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
                        files.push(...(await getAllFiles(fullPath)));
                    }
                } else {
                    files.push(fullPath);
                }
            }
            return files;
        };

        // Expand directories to files
        const allFilePaths: string[] = [];
        for (const p of filePaths) {
            try {
                const stat = await fs.stat(p);
                if (stat.isDirectory()) {
                    allFilePaths.push(...(await getAllFiles(p)));
                } else {
                    allFilePaths.push(p);
                }
                // Cap total files to prevent crazy explosion
                if (allFilePaths.length > 50) {
                    // Warning or hard stop? For now, let's just warn in logs if it gets huge, but proceeding.
                    // A hard limit might be safer for AI context.
                    if (allFilePaths.length > 100)
                        throw new Error(
                            'Too many files selected (> 100). Please select fewer files or specific folders.'
                        );
                }
            } catch (e) {
                console.warn(`Failed to stat/read path ${p}:`, e);
                // If distinct failure, maybe just ignore or let processSingleFile fail it later?
                // But we need it for the loop below.
                allFilePaths.push(p); // Fallback, let processSingleFile handle error
            }
        }

        // Process all files
        for (const filePath of allFilePaths) {
            try {
                // Reuse existing single file processing logic (handles PDF, Tables, Images, etc.)
                const result = await this.processSingleFile(filePath, parserType, readMode);

                // 1. Collect Metadata
                if (result.file) {
                    filesMetadata.push(result.file);
                }

                // 2. Convert Result to Attachment(s)
                // This ensures content is passed to AI via attachments (bypassing text truncation)
                if (result.metadata?.attachments) {
                    // Reuse existing attachments (images, etc.)
                    attachments.push(...result.metadata.attachments);
                } else if (result.kind === 'text' && result.text) {
                    // Convert text content to attachment
                    attachments.push({
                        type: 'file',
                        mime: result.mimeType || 'text/plain',
                        value: result.text,
                        encoding: 'text',
                        name: result.file?.name || path.basename(filePath),
                        path: filePath,
                        size: result.file?.size,
                    });
                } else if (result.kind === 'table') {
                    // Handle tables - convert to JSON JSON string attachment
                    attachments.push({
                        type: 'file',
                        mime: 'application/json',
                        value: JSON.stringify(result.table),
                        encoding: 'text',
                        name: result.file?.name || path.basename(filePath),
                        path: filePath,
                        size: result.file?.size,
                    });
                }
            } catch (error: any) {
                console.error(`Failed to process ${filePath}:`, error);
                failedPaths.push(path.basename(filePath));
            }
        }

        // Raise error if ALL files failed
        if (filesMetadata.length === 0 && filePaths.length > 0) {
            throw new Error(`Failed to process input files: ${failedPaths.join(', ')}`);
        }

        // Construct Summary Text
        let summaryText =
            `Selected ${filesMetadata.length} files:\n` +
            filesMetadata.map((f) => `- ${f.name} (${this.formatSize(f.size)})`).join('\n');

        if (failedPaths.length > 0) {
            summaryText += `\n\nFailed to read: ${failedPaths.join(', ')}`;
        }

        return {
            kind: 'file',
            text: summaryText,
            files: filesMetadata,
            mimeType: 'multipart/mixed',
            metadata: {
                source: 'local_file',
                readMode: readMode,
                attachments: attachments,
                fileCount: filesMetadata.length,
            },
        };
    }

    private formatSize(bytes: number): string {
        if (bytes < 1024) return bytes + ' B';
        else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        else return (bytes / 1048576).toFixed(1) + ' MB';
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
