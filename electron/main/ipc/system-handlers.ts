import { ipcMain } from 'electron';
import { spawn } from 'child_process';

interface RunCommandPayload {
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    shell?: boolean;
    timeoutMs?: number;
}

interface RunCommandResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    command: string;
}

function runCommand({
    command,
    args = [],
    cwd,
    env,
    shell = process.platform === 'win32',
    timeoutMs,
}: RunCommandPayload): Promise<RunCommandResult> {
    return new Promise((resolve, reject) => {
        if (!command) {
            reject(new Error('Command is required'));
            return;
        }

        const child = spawn(command, args, {
            cwd: cwd || process.cwd(),
            env: { ...process.env, ...env },
            shell,
        });

        let stdout = '';
        let stderr = '';
        let timeout: NodeJS.Timeout | null = null;

        if (timeoutMs && timeoutMs > 0) {
            timeout = setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error(`Command timed out after ${timeoutMs}ms`));
            }, timeoutMs);
        }

        child.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('error', (error) => {
            if (timeout) clearTimeout(timeout);
            reject(error);
        });

        child.on('close', (code) => {
            if (timeout) clearTimeout(timeout);
            resolve({
                success: code === 0,
                stdout,
                stderr,
                exitCode: code,
                command: [command, ...args].join(' '),
            });
        });
    });
}

import { PromptLoader } from '../services/PromptLoader';

export function registerSystemHandlers(): void {
    ipcMain.handle('system:get-prompts', async () => {
        const prompts = PromptLoader.getInstance().loadAllPrompts();
        return Object.fromEntries(prompts); // Convert Map to Object for serialization
    });

    ipcMain.handle(
        'system:runCommand',
        async (_event, payload: RunCommandPayload): Promise<RunCommandResult> => {
            try {
                return await runCommand(payload);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return {
                    success: false,
                    stdout: '',
                    stderr: message,
                    exitCode: null,
                    command: payload.command,
                };
            }
        }
    );

    // TEMPORARY: Debug handler to execute migration SQL
    // TODO: Remove this after migration is complete
    ipcMain.handle('debug:execute-sql', async (_event, sqlStatements: string[]) => {
        try {
            const { db } = await import('../database/client');
            const { sql } = await import('drizzle-orm');

            console.log('🔧 [DEBUG] Executing SQL statements...');

            const results = [];
            for (const statement of sqlStatements) {
                const trimmed = statement.trim();
                if (trimmed) {
                    console.log(`Executing: ${trimmed.substring(0, 50)}...`);
                    db.run(sql.raw(trimmed));
                    results.push({ success: true, sql: trimmed.substring(0, 100) });
                }
            }

            console.log('✅ [DEBUG] SQL execution completed');
            return { success: true, results };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('❌ [DEBUG] SQL execution failed:', message);
            return { success: false, error: message };
        }
    });
}
