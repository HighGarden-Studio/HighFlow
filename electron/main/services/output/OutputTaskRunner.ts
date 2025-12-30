import { taskRepository } from '../../database/repositories/task-repository';
import { OutputTaskConfig, TaskKey } from '@core/types/database';
import { ConnectorRegistry } from './ConnectorRegistry';
import { Task, projects } from '../../database/schema';
import { db } from '../../database/client';
import { eq } from 'drizzle-orm';
import * as fs from 'fs/promises';
import { TaskKey as DBTaskKey } from '../../database/helpers/task-key';

import { OutputResult } from './OutputConnector';

export class OutputTaskRunner {
    private registry: ConnectorRegistry;

    constructor() {
        this.registry = ConnectorRegistry.getInstance();
    }

    /**
     * Execute an Output Task
     */
    async execute(taskKey: TaskKey): Promise<OutputResult> {
        const { projectId, projectSequence } = taskKey;
        console.log(
            `[OutputTaskRunner] Starting execution for task ${projectId}:${projectSequence}`
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
            console.log(`[OutputTaskRunner] Aggregating content for task...`);
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
            return { success: false, error: 'Aggregated content is empty' };
        }

        // 5. Execute Connector
        try {
            console.log(`[OutputTaskRunner] executing connector ${connector.id}`);
            const result = await connector.execute(config, contentToOutput, {
                // Legacy ID support removed/ignored, passing 0 or sequence if needed
                taskId: 0,
                projectId: task.projectId,
                taskTitle: task.title,
                projectName: project?.title || 'Unknown Project',
                projectBaseDir: project?.baseDevFolder,
                date: new Date(),
            });

            // 5. Save Result Metadata
            if (result.success) {
                const isLocalFile = config.destination === 'local_file';

                await taskRepository.update(task.projectId, task.projectSequence, {
                    executionResult: {
                        content: isLocalFile ? undefined : contentToOutput,
                        filePath: isLocalFile ? result.metadata?.path : undefined,
                        metadata: result.metadata,
                        provider: connector.id,
                        status: 'success',
                    } as any, // Cast to avoid strict type issues with JSON
                    result: isLocalFile ? result.metadata?.path : contentToOutput,
                    status: 'done',
                    completedAt: new Date(),
                });

                console.log('[OutputTaskRunner] Task updated with result:', {
                    key: `${task.projectId}:${task.projectSequence}`,
                    resultPath: isLocalFile ? result.metadata?.path : '[content]',
                });
            } else {
                await taskRepository.updateStatus(
                    task.projectId,
                    task.projectSequence,
                    'in_progress'
                );
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
        // Check dependencies (Project Sequences)
        let dependencies: number[] = [];

        // Use triggerConfig.dependsOn.taskIds (Sequences) if available
        const taskTrigger =
            typeof task.triggerConfig === 'string'
                ? JSON.parse(task.triggerConfig)
                : task.triggerConfig;
        if (taskTrigger?.dependsOn?.taskIds) {
            dependencies = taskTrigger.dependsOn.taskIds;
        } else if (task.dependencies && Array.isArray(task.dependencies)) {
            // Deprecated: task.dependencies was Global IDs.
            // If data is migrated, this field should be empty or contain sequences?
            // Migration plan says we map this to sequences.
            // Assuming task.dependencies now holds SEQUENCES after migration?
            // Actually, schema change said we kept it?
            // Phase 3 migration updated tasks.dependencies to be array of sequences?
            // Let's assume yes or rely on triggerConfig which is safer.
            dependencies = task.dependencies;
        }

        // Deduplicate dependencies
        dependencies = [...new Set(dependencies)];

        if (dependencies.length === 0) {
            console.warn(
                '[OutputTaskRunner] No dependencies found for output task. Using empty content.'
            );
            return '';
        }

        const inputs: string[] = [];
        const isAppendMode =
            config.destination === 'local_file' && config.localFile && !config.localFile.overwrite;

        // 1. Accumulate previous results
        if (config.localFile?.accumulateResults) {
            if (isAppendMode) {
                // Skip
            } else {
                const previousResult =
                    (task as any).result || (task.executionResult as any)?.content || '';

                if (previousResult) {
                    if (config.destination === 'local_file' && typeof previousResult === 'string') {
                        try {
                            if (previousResult.includes('/') || previousResult.includes('\\\\')) {
                                const fileContent = await fs.readFile(previousResult, 'utf-8');
                                inputs.push(fileContent);
                            } else {
                                inputs.push(previousResult);
                            }
                        } catch (err) {
                            if (previousResult.length > 0) inputs.push(previousResult);
                        }
                    } else {
                        inputs.push(previousResult);
                    }
                }
            }
        }

        // 2. Fetch dependency tasks (by Sequence)
        for (const seq of dependencies) {
            const depTask = await taskRepository.findByKey(task.projectId, seq);
            if (depTask) {
                const content =
                    (depTask as any).result ||
                    (depTask.executionResult as any)?.content ||
                    depTask.generatedPrompt ||
                    '';
                if (content) {
                    inputs.push(content);
                }
            }
        }

        // Aggregation Strategy
        let finalOutput = '';
        if (config.aggregation === 'concat' || config.aggregation === 'single') {
            finalOutput = inputs.join('\n\n---\n\n');
        } else if (config.aggregation === 'template') {
            if (config.templateConfig?.template) {
                let rendered = config.templateConfig.template;

                // For macros, we need all tasks for context
                const depTasks = await taskRepository.findByProject(task.projectId);

                // Map dependencies to results
                const dependencyResults = dependencies
                    .map((seq) => {
                        const depTask = depTasks.find((t) => t.projectSequence === seq);
                        return depTask
                            ? ({
                                  taskId: depTask.projectSequence, // Use sequence as "ID" for macros
                                  taskTitle: depTask.title,
                                  status:
                                      depTask.status === 'done'
                                          ? ('success' as const)
                                          : ('failure' as const),
                                  output: (depTask as any).result || depTask.generatedPrompt || '',
                                  startTime: depTask.startedAt || new Date(),
                                  endTime: depTask.completedAt || new Date(),
                                  metadata: {},
                              } as any) // Cast to Partial<TaskResult>
                            : null;
                    })
                    .filter((r): r is NonNullable<typeof r> => r !== null);

                // Use PromptMacroService
                // Fix import path to src
                const { PromptMacroService } =
                    await import('../../../../src/services/workflow/PromptMacroService');

                const macroContext = {
                    previousResults: dependencyResults,
                    variables: { projectId: task.projectId },
                };

                rendered = PromptMacroService.replaceMacros(rendered, macroContext);

                inputs.forEach((input, idx) => {
                    rendered = rendered.replace(new RegExp(`{{input${idx + 1}}}`, 'g'), input);
                });

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

        if (isAppendMode) {
            const timestamp = new Date().toLocaleString('ko-KR');
            finalOutput = `\n\n### [${timestamp}]\n\n${finalOutput}`;
        }

        return finalOutput;
    }
}
