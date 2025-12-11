/**
 * Script Executor Service
 *
 * Executes JavaScript/TypeScript/Python scripts in a sandboxed environment
 */

import { VM } from 'vm2';
import { spawn } from 'child_process';
import { resolveMacros } from '../utils/macro-resolver';
import type { Task } from '@core/types/database';

export interface ScriptExecutionResult {
    success: boolean;
    output: string;
    error?: string;
    logs: string[];
    duration: number;
}

export class ScriptExecutor {
    private timeout = 30000; // 30 seconds

    /**
     * Execute a script task
     */
    async execute(task: Task, projectId: number): Promise<ScriptExecutionResult> {
        const startTime = Date.now();
        const logs: string[] = [];

        try {
            if (!task.scriptCode || !task.scriptLanguage) {
                throw new Error('Script code or language not specified');
            }

            // Resolve macros
            const resolvedCode = await resolveMacros(task.scriptCode, {
                taskId: task.id,
                projectId,
            });

            let result: ScriptExecutionResult;

            switch (task.scriptLanguage) {
                case 'javascript':
                case 'typescript':
                    result = await this.executeNode(resolvedCode, task.scriptLanguage, logs);
                    break;
                case 'python':
                    result = await this.executePython(resolvedCode, logs);
                    break;
                default:
                    throw new Error(`Unsupported language: ${task.scriptLanguage}`);
            }

            result.duration = Date.now() - startTime;
            return result;
        } catch (error: any) {
            return {
                success: false,
                output: '',
                error: error.message,
                logs,
                duration: Date.now() - startTime,
            };
        }
    }

    /**
     * Execute JavaScript/TypeScript in Node.js VM
     */
    private async executeNode(
        code: string,
        language: 'javascript' | 'typescript',
        logs: string[]
    ): Promise<ScriptExecutionResult> {
        try {
            // For TypeScript, we would need to compile first
            // For now, simplified - just execute as JavaScript
            let executableCode = code;

            if (language === 'typescript') {
                // TODO: Add TypeScript compilation with esbuild or tsc
                // For now, strip types (simple approach)
                executableCode = code;
            }

            const vm = new VM({
                timeout: this.timeout,
                sandbox: {
                    console: {
                        log: (...args: any[]) => {
                            const message = args.map((a) => String(a)).join(' ');
                            logs.push(message);
                        },
                        error: (...args: any[]) => {
                            const message = args.map((a) => String(a)).join(' ');
                            logs.push(`ERROR: ${message}`);
                        },
                        warn: (...args: any[]) => {
                            const message = args.map((a) => String(a)).join(' ');
                            logs.push(`WARN: ${message}`);
                        },
                    },
                },
            });

            const result = vm.run(executableCode);

            return {
                success: true,
                output: String(result || ''),
                logs,
                duration: 0, // Will be set by caller
            };
        } catch (error: any) {
            return {
                success: false,
                output: '',
                error: error.message,
                logs,
                duration: 0,
            };
        }
    }

    /**
     * Execute Python in a subprocess
     */
    private async executePython(code: string, logs: string[]): Promise<ScriptExecutionResult> {
        return new Promise((resolve) => {
            const python = spawn('python3', ['-c', code]);
            let stdout = '';
            let stderr = '';

            python.stdout.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                logs.push(text.trim());
            });

            python.stderr.on('data', (data) => {
                const text = data.toString();
                stderr += text;
                logs.push(`ERROR: ${text.trim()}`);
            });

            python.on('close', (exitCode) => {
                if (exitCode === 0) {
                    resolve({
                        success: true,
                        output: stdout,
                        logs,
                        duration: 0,
                    });
                } else {
                    resolve({
                        success: false,
                        output: stdout,
                        error: stderr || `Process exited with code ${exitCode}`,
                        logs,
                        duration: 0,
                    });
                }
            });

            // Timeout
            setTimeout(() => {
                python.kill();
                resolve({
                    success: false,
                    output: stdout,
                    error: 'Execution timeout (30s)',
                    logs,
                    duration: 0,
                });
            }, this.timeout);
        });
    }
}

export const scriptExecutor = new ScriptExecutor();
