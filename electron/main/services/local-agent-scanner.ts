import path from 'path';
import fs from 'fs/promises';
import { app } from 'electron';

export interface LocalAgentContext {
    source: 'claude' | 'gemini' | 'codex';
    goal?: string;
    memory?: string;
    guidelines?: string;
}

export class LocalAgentScanner {
    async scanFolder(folderPath: string): Promise<LocalAgentContext | null> {
        if (!folderPath) return null;

        try {
            // 1. Check for Gemini (Antigravity/CLI) artifacts
            // Pattern: .gemini/antigravity/brain/*/task.md or similar
            // Or simpler: look for task.md / implementation_plan.md in the root or .gemini folder

            const geminiContext = await this.scanGemini(folderPath);
            if (geminiContext) return geminiContext;

            // 2. Check for Claude Code
            // Pattern: .claude/config.json or similar (hypothetical)
            const claudeContext = await this.scanClaude(folderPath);
            if (claudeContext) return claudeContext;

            // 3. Check for Codex (hypothetical)
            const codexContext = await this.scanCodex(folderPath);
            if (codexContext) return codexContext;
        } catch (error) {
            console.error('Error scanning folder for local agents:', error);
        }

        return null;
    }

    private async scanGemini(rootPath: string): Promise<LocalAgentContext | null> {
        // Check for task.md or implementation_plan.md
        const taskPath = path.join(rootPath, 'task.md');
        const planPath = path.join(rootPath, 'implementation_plan.md');

        let goal = '';
        let memory = '';

        try {
            const taskContent = await fs.readFile(taskPath, 'utf8');
            // Extract something useful? Maybe the first main header?
            // Simple heuristic: First few lines might be the goal
            goal += 'From task.md:\n' + taskContent.slice(0, 500) + '...\n';
            memory += taskContent;
        } catch (e) {
            /* ignore */
        }

        try {
            const planContent = await fs.readFile(planPath, 'utf8');
            memory += '\n\nFrom implementation_plan.md:\n' + planContent;
        } catch (e) {
            /* ignore */
        }

        // Also check .gemini folder
        // This is where Antigravity stores stuff usually: .gemini/antigravity/brain/...
        // We might just look for ANY md files in .gemini/antigravity/brain

        if (goal || memory) {
            return {
                source: 'gemini',
                goal: goal.trim() || 'Imported from Gemini Context',
                memory: memory.trim(),
            };
        }
        return null;
    }

    private async scanClaude(rootPath: string): Promise<LocalAgentContext | null> {
        // Claude Code usually creates a .claude hidden directory
        const claudeDir = path.join(rootPath, '.claude');
        try {
            const stats = await fs.stat(claudeDir);
            if (stats.isDirectory()) {
                // Read some config or history?
                // For now, just acknowledged it exists
                return {
                    source: 'claude',
                    goal: 'Project managed by Claude Code',
                    memory: 'Detected .claude directory. Memory import pending specific format analysis.',
                };
            }
        } catch (e) {
            /* ignore */
        }
        return null;
    }

    private async scanCodex(rootPath: string): Promise<LocalAgentContext | null> {
        // Codex... maybe .codex?
        const codexDir = path.join(rootPath, '.codex');
        try {
            const stats = await fs.stat(codexDir);
            if (stats.isDirectory()) {
                return {
                    source: 'codex',
                    goal: 'Project managed by Codex',
                    memory: 'Detected .codex directory.',
                };
            }
        } catch (e) {
            /* ignore */
        }
        return null;
    }
    async scanProjectArtifacts(folderPath: string): Promise<Record<string, string>> {
        if (!folderPath) return {};

        const artifacts: Record<string, string> = {};
        const candidates = [
            'GEMINI.md',
            'PROJECT_RULES.md',
            'README.md',
            'CONTEXT.md',
            'SESSIONS.md',
            'task.md',
            'implementation_plan.md',
            '.cursorrules',
            '.windsurfrules',
        ];

        for (const filename of candidates) {
            try {
                const filePath = path.join(folderPath, filename);
                const content = await fs.readFile(filePath, 'utf8');
                if (content && content.length > 0) {
                    artifacts[filename] = content;
                }
            } catch (e) {
                // Ignore missing files
            }
        }

        // Also check .gemini/task.md if exists (common pattern)
        try {
            const taskPath = path.join(folderPath, '.gemini', 'task.md');
            const content = await fs.readFile(taskPath, 'utf8');
            artifacts['.gemini/task.md'] = content;
        } catch (e) {}

        return artifacts;
    }
}

export const localAgentScanner = new LocalAgentScanner();
