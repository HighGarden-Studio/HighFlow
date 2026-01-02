import { taskRepository } from '../../database/repositories/task-repository';
import { OutputTaskConfig } from '@core/types/database';
import { ConnectorRegistry } from './ConnectorRegistry';
import { Task, projects } from '../../database/schema';
import { db } from '../../database/client';
import { eq } from 'drizzle-orm';
import * as fs from 'fs/promises';

import { OutputResult } from './OutputConnector';

export class OutputTaskRunner {
    private registry: ConnectorRegistry;

    constructor() {
        this.registry = ConnectorRegistry.getInstance();
    }

    /**
     * Execute an Output Task
     */
    async execute(projectId: number, projectSequence: number): Promise<OutputResult> {
        console.log(
            `[OutputTaskRunner] Starting execution for task ${projectId}-${projectSequence}`
        );

        // 1. Load Task
        const task = await taskRepository.findByKey(projectId, projectSequence);
        if (!task) {
            return { success: false, error: 'Task not found' };
        }

        if (task.status !== 'todo' && task.status !== 'in_progress') {
            // Basic guard, though caller usually handles this
        }

        const config = task.outputConfig as OutputTaskConfig;
        if (!config) {
            return { success: false, error: 'No output configuration found' };
        }

        // 2. Load Project (for context)
        const project = await db.query.projects.findFirst({
            where: eq(projects.id, task.projectId),
        });

        // 3. Get Connector
        const connector = this.registry.getForConfig(config);
        if (!connector) {
            return {
                success: false,
                error: `No connector found for destination: ${config.destination}`,
            };
        }

        // 4. Aggregate Content
        let contentToOutput = '';
        try {
            console.log(
                `[OutputTaskRunner] Aggregating content for task ${projectId}-${projectSequence}...`
            );
            contentToOutput = await this.aggregateContent(task, config);
            console.log(
                `[OutputTaskRunner] Aggregation complete. Content length: ${contentToOutput.length}`
            );
        } catch (err) {
            console.error(`[OutputTaskRunner] Aggregation failed:`, err);
            return { success: false, error: `Aggregation failed: ${err}` };
        }

        if (!contentToOutput) {
            console.error('[OutputTaskRunner] ERROR: Aggregated content is empty!');
            console.error(`[OutputTaskRunner] Config:`, JSON.stringify(config, null, 2));
            // console.error(`[OutputTaskRunner] Task dependencies:`, task.dependencies);
            console.error(
                `[OutputTaskRunner] Task triggerConfig:`,
                JSON.stringify(task.triggerConfig, null, 2)
            );
            return { success: false, error: 'Aggregated content is empty' };
        }

        // 5. Execute Connector
        try {
            console.log(`[OutputTaskRunner] executing connector ${connector.id}`);
            const result = await connector.execute(config, contentToOutput, {
                taskId: task.id, // Keep legacy ID if interface requires it
                projectId: task.projectId,
                projectSequence: task.projectSequence,
                taskTitle: task.title,
                projectName: project?.title || 'Unknown Project',
                projectBaseDir: project?.baseDevFolder,
                date: new Date(),
            });

            // 5. Save Result Metadata
            if (result.success) {
                // For local files, store the path...
                const isLocalFile = config.destination === 'local_file';
                let uiContent = contentToOutput;

                // If local file and append mode, we want to show the FULL content in UI, not just the delta
                if (isLocalFile && result?.metadata?.path) {
                    try {
                        const { promises: fs } = await import('fs');
                        // Read the full file content to show in UI
                        const fullContent = await fs.readFile(result.metadata.path, 'utf-8');
                        uiContent = fullContent;
                    } catch (readErr) {
                        console.warn(
                            `[OutputTaskRunner] Failed to read back file content for UI: ${readErr}`
                        );
                    }
                }

                // Manage generated files history
                const existingMetadata = (task.metadata as any) || {};
                const previousFiles = Array.isArray(existingMetadata.generatedFiles)
                    ? existingMetadata.generatedFiles
                    : [];

                let newFiles = [...previousFiles];
                if (isLocalFile && result?.metadata?.path) {
                    // Remove duplicate entry for same path to update timestamp
                    newFiles = newFiles.filter((f: any) => f.path !== result.metadata.path);
                    newFiles.push({
                        path: result.metadata.path,
                        timestamp: new Date().toISOString(),
                        size: result.metadata.size || 0,
                    });
                }

                // Update task with new metadata containing the file history
                const updatedMetadata = {
                    ...existingMetadata,
                    generatedFiles: newFiles,
                };

                await taskRepository.updateByKey(projectId, projectSequence, {
                    metadata: updatedMetadata,
                    executionResult: {
                        // For local files, we NOW store the content as well to ensure UI display
                        content: uiContent,
                        filePath: isLocalFile ? result.metadata?.path : undefined,
                        // Include generatedFiles in executionResult metadata too for easy access
                        metadata: { ...result.metadata, generatedFiles: newFiles },
                        provider: connector.id,
                        status: 'success',
                    },
                    // For local files, store path in result for preview to read file
                    result: isLocalFile ? result.metadata?.path : contentToOutput,
                    status: 'done',
                    completedAt: new Date(),
                });

                console.log('[OutputTaskRunner] Task updated with result:', {
                    taskId: task.id,
                    projectSequence: task.projectSequence,
                    resultPath: isLocalFile ? result.metadata?.path : '[content]',
                    filePathInExecutionResult: isLocalFile ? result.metadata?.path : undefined,
                    totalGeneratedFiles: newFiles.length,
                });
            } else {
                await taskRepository.updateByKey(projectId, projectSequence, {
                    status: 'in_progress', // Or fail?
                    // Ideally we might want 'failed' status but 'todo' is safe fallback or 'in_progress' with error
                });
            }

            return result;
        } catch (err) {
            console.error(`[OutputTaskRunner] Execution failed:`, err);
            return { success: false, error: `Connector execution failed: ${err}` };
        }
    }

    /**
     * Aggregate content from dependencies
     */
    private async aggregateContent(task: Task, config: OutputTaskConfig): Promise<string> {
        // MVP: Only support 'concat' strategy or simple 'single' (implicitly concat)
        // Check dependencies
        let dependencies: number[] = [];

        // Use triggerConfig.dependsOn.taskIds if available, otherwise explicit dependencies
        const taskTrigger = task.triggerConfig as any;
        if (taskTrigger?.dependsOn?.taskIds) {
            dependencies = taskTrigger.dependsOn.taskIds;
        } else if (task.dependencies && Array.isArray(task.dependencies)) {
            // Deprecated usage potentially?
            // dependencies = task.dependencies;
        }

        // Deduplicate dependencies to prevent content duplication
        dependencies = [...new Set(dependencies)];

        if (dependencies.length === 0) {
            console.warn(
                '[OutputTaskRunner] No dependencies found for output task. Using empty content.'
            );
            return '';
        }

        // Fetch previous results first if accumulate mode is enabled
        const inputs: string[] = [];

        // 1. Include previous output task result (for accumulation)
        const isAppendMode =
            config.destination === 'local_file' && config.localFile && !config.localFile.overwrite;

        if (config.localFile?.accumulateResults) {
            if (isAppendMode) {
                console.log(
                    '[OutputTaskRunner] Append mode detected: Skipping aggregation of previous content to prevent duplication.'
                );
            } else {
                console.log(
                    '[OutputTaskRunner] Accumulate mode enabled, reading previous results...'
                );
                const previousResult =
                    (task as any).result || (task.executionResult as any)?.content || '';

                if (previousResult) {
                    // If destination is local_file and result is a file path, read the file
                    if (config.destination === 'local_file' && typeof previousResult === 'string') {
                        try {
                            // Check if it's a file path (not actual content)
                            if (previousResult.includes('/') || previousResult.includes('\\\\')) {
                                const fileContent = await fs.readFile(previousResult, 'utf-8');
                                console.log(
                                    `[OutputTaskRunner] Read previous result from file: ${previousResult} (${fileContent.length} bytes)`
                                );
                                inputs.push(fileContent);
                            } else {
                                // It's actual content, not a path
                                console.log(
                                    `[OutputTaskRunner] Using previous result as content (${previousResult.length} bytes)`
                                );
                                inputs.push(previousResult);
                            }
                        } catch (err) {
                            console.warn(
                                '[OutputTaskRunner] Could not read previous result file:',
                                err
                            );
                            // If file read fails, still try to use the raw value
                            if (previousResult.length > 0) {
                                inputs.push(previousResult);
                            }
                        }
                    } else {
                        // For non-file destinations, use content directly
                        console.log(
                            `[OutputTaskRunner] Using previous result content (${previousResult.length} bytes)`
                        );
                        inputs.push(previousResult);
                    }
                }
            }
        }

        // 2. Fetch dependency tasks and add new results
        console.log(`[OutputTaskRunner] Fetching ${dependencies.length} dependency task(s)...`);
        for (const depSequence of dependencies) {
            const depTask = await taskRepository.findByKey(task.projectId, depSequence);
            if (depTask) {
                // Check for Freshness (Exclude stale inputs/tasks from previous runs)
                // Threshold: 60 seconds. If task completed > 60s ago, it's old history.
                const completedAt = depTask.completedAt
                    ? new Date(depTask.completedAt).getTime()
                    : 0;
                const now = Date.now();
                const isFresh = now - completedAt < 60 * 1000; // 60s

                console.log(
                    `[OutputTaskRunner] Dependency task ${depSequence}: status=${depTask.status}, fresh=${isFresh} (${Math.round((now - completedAt) / 1000)}s ago)`
                );

                if (!isFresh) {
                    console.log(`[OutputTaskRunner] Skipping stale dependency ${depSequence}`);
                    continue;
                }

                // Determine what content to use
                // 1. Result field
                // 2. ExecutionResult.content
                // 3. Output field (future)
                const content =
                    (depTask as any).result ||
                    (depTask.executionResult as any)?.content ||
                    (depTask.executionResult as any)?.text || // Input Task support
                    depTask.generatedPrompt || // Fallback?
                    '';

                console.log(
                    `[OutputTaskRunner] Dependency ${depSequence} content length: ${content?.length || 0}`
                );
                if (content) {
                    inputs.push(content);
                }
            }
        }

        console.log(
            `[OutputTaskRunner] Aggregated ${inputs.length} content items (accumulate: ${config.localFile?.accumulateResults || false})`
        );

        // Aggregation Strategy
        let finalOutput = '';
        if (config.aggregation === 'concat' || config.aggregation === 'single') {
            finalOutput = inputs.join('\n\n---\n\n');
        } else if (config.aggregation === 'template') {
            // Template with unified macro support
            if (config.templateConfig?.template) {
                let rendered = config.templateConfig.template;

                // Build macro context for template
                const depTasks = await taskRepository.findByProject(task.projectId);
                const dependencyResults = dependencies
                    .map((depId) => {
                        const depTask = depTasks.find((t) => t.id === depId);
                        return depTask
                            ? {
                                  taskId: depTask.id,
                                  taskTitle: depTask.title,
                                  status:
                                      depTask.status === 'done'
                                          ? ('success' as const)
                                          : ('failure' as const),
                                  output: (depTask as any).result || depTask.generatedPrompt || '',
                                  startTime: depTask.startedAt || new Date(),
                                  endTime: depTask.completedAt || new Date(),
                                  duration: 0,
                                  retries: 0,
                                  metadata: {},
                              }
                            : null;
                    })
                    .filter((r): r is NonNullable<typeof r> => r !== null);

                const { PromptMacroService } =
                    await import('../../../../src/services/workflow/PromptMacroService');

                const macroContext = {
                    previousResults: dependencyResults,
                    variables: {},
                };

                // Replace unified macros: {{prev}}, {{prev.1}}, {{task.23}}, etc.
                rendered = PromptMacroService.replaceMacros(rendered, macroContext);

                // Legacy support: {{inputN}} macros
                inputs.forEach((input, idx) => {
                    rendered = rendered.replace(new RegExp(`{{input${idx + 1}}}`, 'g'), input);
                });

                // Legacy support: {{all_results}} is already handled by PromptMacroService
                // But also support direct replacement for compatibility
                if (rendered.includes('{{all_results}}')) {
                    rendered = rendered.replace(/\{\{all_results\}\}/g, inputs.join('\n\n'));
                }

                finalOutput = rendered;
            } else {
                finalOutput = inputs.join('\n\n');
            }
        } else {
            finalOutput = inputs.join('\n\n');
        }

        // Add Timestamp Header if in Append Mode
        if (isAppendMode) {
            const timestamp = new Date().toLocaleString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
            });
            finalOutput = `\n\n### [${timestamp}]\n\n${finalOutput}`;
        }

        return finalOutput;
    }
}
