import fs from 'fs';
import path from 'path';
import { app } from 'electron';

/**
 * Service to load external markdown prompts
 */
export class PromptLoader {
    private static instance: PromptLoader;
    private prompts: Map<string, string> = new Map();
    private promptsDir: string;

    private constructor() {
        // In production (bundled), resources are in process.resourcesPath
        // In development, they are in the project root
        if (app.isPackaged) {
            this.promptsDir = path.join(process.resourcesPath, 'prompts');
        } else {
            this.promptsDir = path.join(process.cwd(), 'electron', 'resources', 'prompts');
        }
    }

    public static getInstance(): PromptLoader {
        if (!PromptLoader.instance) {
            PromptLoader.instance = new PromptLoader();
        }
        return PromptLoader.instance;
    }

    /**
     * Load all prompts from the resources directory recursively
     */
    public loadAllPrompts(): Map<string, string> {
        this.prompts.clear();
        console.log(`[PromptLoader] Loading prompts from: ${this.promptsDir}`);

        try {
            if (!fs.existsSync(this.promptsDir)) {
                console.warn(`[PromptLoader] Prompts directory not found: ${this.promptsDir}`);
                return this.prompts;
            }

            this.readDirRecursive(this.promptsDir);
            console.log(`[PromptLoader] Loaded ${this.prompts.size} prompts`);
        } catch (error) {
            console.error('[PromptLoader] Failed to load prompts:', error);
        }

        return this.prompts;
    }

    /**
     * Get a specific prompt by ID (relative path without extension)
     * e.g., 'roles/senior-developer', 'system/curator'
     */
    public getPrompt(id: string): string | undefined {
        return this.prompts.get(id);
    }

    private readDirRecursive(dir: string, baseDir: string = '') {
        const files = fs.readdirSync(dir);

        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                this.readDirRecursive(fullPath, path.join(baseDir, file));
            } else if (file.endsWith('.md')) {
                const content = fs.readFileSync(fullPath, 'utf-8');
                // ID is relative path without extension, e.g., 'roles/senior-developer'
                const id = path.join(baseDir, path.parse(file).name).replace(/\\/g, '/');
                this.prompts.set(id, content);
            }
        }
    }
}
