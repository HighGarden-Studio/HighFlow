import { OutputConnector, OutputResult } from '../OutputConnector';
import { OutputTaskConfig } from '@core/types/database';
import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';

export class LocalFileConnector implements OutputConnector {
    readonly id = 'local_file';

    async validate(config: OutputTaskConfig): Promise<boolean> {
        if (config.destination !== 'local_file') return false;
        if (!config.localFile?.pathTemplate) return false;
        return true;
    }

    async execute(config: OutputTaskConfig, content: string, context?: any): Promise<OutputResult> {
        if (!config.localFile) {
            return { success: false, error: 'Missing localFile configuration' };
        }

        try {
            // 1. Resolve Path Template
            let filePath = config.localFile.pathTemplate;

            // Basic template replacement
            // Basic template replacement
            const isoString = new Date().toISOString();
            const replacements: Record<string, string> = {
                '{{date}}': isoString.split('T')[0] || '',
                '{{time}}': (isoString.split('T')[1] || '').replace(/:/g, '-').split('.')[0] || '',
                '{{taskId}}': context?.taskId ? String(context.taskId) : 'unknown-task',
                '{{projectId}}': context?.projectId ? String(context.projectId) : 'unknown-project',
                '{{project.name}}': context?.projectName
                    ? String(context.projectName)
                    : 'unknown-project',
                '{{task.title}}': context?.taskTitle ? String(context.taskTitle) : 'unknown-task',
            };

            console.log(`[LocalFileConnector] Resolving path template: "${filePath}"`);
            for (const [key, value] of Object.entries(replacements)) {
                // Use split/join or replaceAll to avoid Regex special char issues
                if (filePath.includes(key)) {
                    const cleanValue = this.sanitizeFilename(value);
                    console.log(`[LocalFileConnector] Replacing "${key}" with "${cleanValue}"`);
                    filePath = filePath.split(key).join(cleanValue);
                }
            }
            console.log(`[LocalFileConnector] Resolved path: "${filePath}"`);

            // Handle relative paths
            if (!path.isAbsolute(filePath)) {
                // Priority: Context projectBaseDir -> Downloads/AI_Workflow_Output/ProjectName
                if (context?.projectBaseDir) {
                    filePath = path.join(context.projectBaseDir, filePath);
                } else {
                    const baseDir = path.join(
                        app.getPath('downloads'),
                        'AI_Workflow_Output',
                        this.sanitizeFilename(context?.projectName || 'default')
                    );
                    filePath = path.join(baseDir, filePath);
                }
            }

            console.log(`[LocalFileConnector] Resolved output file path: ${filePath}`);

            // 2. Ensure directory exists
            const dirPath = path.dirname(filePath);
            await fs.mkdir(dirPath, { recursive: true });
            console.log(`[LocalFileConnector] Created directory: ${dirPath}`);

            // 3. Image Extraction (Markdown only)
            // If file extension is .md, check for base64 images
            let finalContent = content;
            console.log(`[LocalFileConnector] Content length before write: ${content.length}`);
            if (content.length === 0) {
                console.warn('[LocalFileConnector] Warning: Writing empty content to file.');
            }

            const isMarkdown = path.extname(filePath).toLowerCase() === '.md';

            if (isMarkdown) {
                console.log(
                    '[LocalFileConnector] Markdown detected, checking for embedded images...'
                );
                const imageExtraction = await this.extractImages(content, dirPath);
                finalContent = imageExtraction.content;
                if (imageExtraction.count > 0) {
                    console.log(
                        `[LocalFileConnector] Extracted ${imageExtraction.count} images to assets folder.`
                    );
                }
            }

            // 4. Write File (Overwrite or Append)
            if (config.localFile.overwrite) {
                // Overwrite mode: replace file completely
                await fs.writeFile(filePath, finalContent, 'utf-8');
                console.log(`[LocalFileConnector] File overwritten: ${filePath}`);
            } else {
                // Append mode: add to existing file or create if new
                await fs.appendFile(filePath, finalContent, 'utf-8');
                console.log(`[LocalFileConnector] Content appended to: ${filePath}`);
            }
            console.log(`[LocalFileConnector] File successfully written to: ${filePath}`);

            return {
                success: true,
                metadata: {
                    path: filePath,
                    size: finalContent.length,
                    timestamp: new Date().toISOString(),
                },
            };
        } catch (err: any) {
            console.error(`[LocalFileConnector] Error writing file:`, err);
            return { success: false, error: err.message };
        }
    }

    private async extractImages(
        content: string,
        outputDir: string
    ): Promise<{ content: string; count: number }> {
        const assetsDir = path.join(outputDir, 'assets');
        let hasCreatedAssetsDir = false;
        let imageCount = 0;
        let updatedContent = content;

        // Regex to find ![alt](data:image/...)
        const regex = /!\[([^\]]*)\]\((data:image\/([a-zA-Z]*);base64,([^\"]*))\)/g;

        let match;
        // Reset lastIndex because we're using global flag
        regex.lastIndex = 0;

        // We need to collect replacements first to avoid modifying string while iterating regex (though replace method handles this, standard iteration loop is safer for async operations like file writing)
        const replacements: { original: string; alt: string; ext: string; data: string }[] = [];

        while ((match = regex.exec(content)) !== null) {
            replacements.push({
                original: match[0],
                alt: match[1] || '',
                ext: match[3] || 'png',
                data: match[4] || '',
            });
        }

        if (replacements.length > 0) {
            if (!hasCreatedAssetsDir) {
                await fs.mkdir(assetsDir, { recursive: true });
                hasCreatedAssetsDir = true;
            }

            for (const item of replacements) {
                imageCount++;
                const timestamp = Date.now();
                const filename = `image_${timestamp}_${imageCount}.${item.ext}`;
                const filePath = path.join(assetsDir, filename);

                // Write image file
                const buffer = Buffer.from(item.data, 'base64');
                await fs.writeFile(filePath, buffer);

                // Replace in content: ![alt](./assets/filename)
                // Use relative path from the output file location
                const relativePath = `./assets/${filename}`;
                updatedContent = updatedContent.replace(
                    item.original,
                    `![${item.alt}](${relativePath})`
                );
            }
        }

        return { content: updatedContent, count: imageCount };
    }

    private sanitizeFilename(name: string): string {
        return name.replace(/[^a-z0-9_\-\.]/gi, '_');
    }
}
