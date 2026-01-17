/**
 * Script Executor
 *
 * Executes JavaScript/TypeScript/Python scripts in a secure sandbox environment
 */

import { VM } from 'vm2';
import type { Task } from '@core/types/database';
import { prepareMacroData, resolveMacrosInCode } from '../utils/macro-resolver';

export interface ScriptExecutionResult {
    success: boolean;
    output: string;
    error?: string;
    logs: string[];
    duration: number;
    control?: {
        next?: number[] | null;
        reason?: string;
    };
}

export class ScriptExecutor {
    private timeout: number = 30000; // 30 seconds

    /**
     * Execute script with macro resolution
     */
    async execute(task: Task, projectId: number): Promise<ScriptExecutionResult> {
        const startTime = Date.now();
        const logs: string[] = [];

        try {
            if (!task.scriptCode) {
                throw new Error('No script code provided');
            }

            // Step 1: Prepare macro data for VM context
            const macroData = await prepareMacroData(task, projectId);
            console.log(
                '[ScriptExecutor] Macro data prepared:',
                JSON.stringify(macroData, null, 2)
            );

            // Step 2: Resolve macros in the code (for code injection)
            const resolvedCode = await resolveMacrosInCode(task.scriptCode, task, projectId);

            console.log('[ScriptExecutor] Original code:', task.scriptCode);
            console.log('[ScriptExecutor] Resolved code:', resolvedCode);

            // Step 3: Execute the resolved code
            let result: ScriptExecutionResult;
            const language = task.scriptLanguage || 'javascript';

            switch (language) {
                case 'javascript':
                case 'typescript':
                    result = await this.executeJavaScript(resolvedCode, macroData, logs, language);
                    break;
                case 'python':
                    result = await this.executePython(resolvedCode, logs); // Use resolved code
                    break;
                default:
                    throw new Error(`Unsupported language: ${task.scriptLanguage}`);
            }

            result.duration = Date.now() - startTime;

            // Debug: log the collected logs
            console.log(`[ScriptExecutor] Collected ${result.logs.length} logs:`, result.logs);

            return result;
        } catch (error: any) {
            console.error('[ScriptExecutor] Error executing script:', error);
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
    private async executeJavaScript(
        _code: string,
        macroData: Record<string, any>,
        logs: string[],
        language: 'javascript' | 'typescript'
    ): Promise<ScriptExecutionResult> {
        try {
            // For now, simplified - just execute as JavaScript
            // Use _code to avoid unused variable error if we aren't using compilation yet
            let executableCode = _code;

            if (language === 'typescript') {
                // TODO: Add TypeScript compilation with esbuild or tsc
                // For now, strip types (simple approach)
                executableCode = _code;
            }

            // Auto-return last expression if no explicit return
            // This allows "executeTask();" to return its value
            const lines = executableCode.trim().split('\n');
            const lastLine = lines.length > 0 ? (lines[lines.length - 1] || '').trim() : '';

            // Check if last line is an expression statement (not return, declaration, etc.)
            if (
                lastLine &&
                !lastLine.startsWith('return') &&
                !lastLine.startsWith('let ') &&
                !lastLine.startsWith('const ') &&
                !lastLine.startsWith('var ') &&
                !lastLine.startsWith('function ') &&
                !lastLine.startsWith('//') &&
                !lastLine.startsWith('}')
            ) {
                // Replace last line with return statement
                lines[lines.length - 1] = `return ${lastLine}`;
                executableCode = lines.join('\n');
                console.log(`[ScriptExecutor] Auto-added return to last line: ${lastLine}`);
            }

            // Wrap code in IIFE to allow return statements
            const wrappedCode = `(function() {\n${executableCode}\n})()`;

            const vm = new VM({
                timeout: this.timeout,
                sandbox: {
                    // Inject macro data as variables
                    ...macroData,
                    console: {
                        log: (...args: any[]) => {
                            const message = args.map((a) => String(a)).join(' ');
                            logs.push(message);
                            // Don't re-log to console to avoid duplication
                        },
                        error: (...args: any[]) => {
                            const message = args.map((a) => String(a)).join(' ');
                            logs.push(`ERROR: ${message}`);
                            // Don't re-log to console to avoid duplication
                        },
                        warn: (...args: any[]) => {
                            const message = args.map((a) => String(a)).join(' ');
                            logs.push(`WARN: ${message}`);
                            // Don't re-log to console to avoid duplication
                        },
                    },
                },
            });

            const result = vm.run(wrappedCode);

            // Parse ScriptTaskReturn format
            let output: string;
            let control: { next?: number[] | null; reason?: string } | undefined;

            try {
                // Check if result is ScriptTaskReturn format
                if (result && typeof result === 'object' && 'result' in result) {
                    // ScriptTaskReturn format
                    output = String(result.result || '');

                    if (result.control) {
                        // Validate control flow
                        const ctrl = result.control;
                        if (ctrl.next !== undefined && ctrl.next !== null) {
                            if (!Array.isArray(ctrl.next)) {
                                logs.push(
                                    'WARN: control.next must be an array, ignoring control flow'
                                );
                            } else if (!ctrl.next.every((id: any) => typeof id === 'number')) {
                                logs.push(
                                    'WARN: control.next must contain only numbers, ignoring control flow'
                                );
                            } else {
                                control = {
                                    next: ctrl.next,
                                    reason: ctrl.reason ? String(ctrl.reason) : undefined,
                                };
                                logs.push(
                                    `Control flow: next=[${ctrl.next.join(', ')}], reason="${ctrl.reason || ''}"`
                                );
                            }
                        } else {
                            // Explicit terminal node
                            control = {
                                next: ctrl.next,
                                reason: ctrl.reason ? String(ctrl.reason) : undefined,
                            };
                            logs.push(`Control flow: STOP (reason: "${ctrl.reason || 'none'}")`);
                        }
                    }
                } else {
                    // Invalid format - we enforce ScriptTaskReturn now
                    const type = typeof result;
                    const valStr = type === 'object' ? JSON.stringify(result) : String(result);

                    throw new Error(
                        `Invalid script return format. Expected object with 'result' property.\n` +
                            `Received (${type}): ${valStr}\n\n` +
                            `Required format:\n` +
                            `return {\n` +
                            `  result: "your output",\n` +
                            `  // control: { ... } // Optional\n` +
                            `};`
                    );
                }
            } catch (e: any) {
                logs.push(`ERROR: Script return value verification failed: ${e.message}`);
                throw new Error(`Script return value verification failed: ${e.message}`);
            }

            return {
                success: true,
                output,
                logs,
                control,
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
     * Execute Python script
     * Currently returns a placeholder - Python execution needs separate runtime
     */
    private async executePython(_code: string, logs: string[]): Promise<ScriptExecutionResult> {
        // Python execution needs separate runtime (e.g., child_process with python3)
        // For now, return error
        logs.push('Python execution not yet implemented');
        return {
            success: false,
            output: '',
            error: 'Python execution not yet implemented',
            logs,
            duration: 0,
        };
    }

    /**
     * Validate script before execution
     */
    validateScript(code: string): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!code || code.trim().length === 0) {
            errors.push('Script code is empty');
        }

        // Basic syntax validation (can be enhanced)
        try {
            new Function(code);
        } catch (e: any) {
            errors.push(`Syntax error: ${e.message}`);
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    /**
     * Execute script with timeout
     */
    async executeWithTimeout(
        _code: string,
        timeout: number = this.timeout
    ): Promise<ScriptExecutionResult> {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    success: false,
                    output: '',
                    error: `Execution timeout after ${timeout}ms`,
                    logs: [],
                    duration: timeout,
                });
            }, timeout);
        });
    }
}

export const scriptExecutor = new ScriptExecutor();
