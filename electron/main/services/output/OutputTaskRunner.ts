import { taskRepository } from '../../database/repositories/task-repository';
import { OutputTaskConfig } from '@core/types/database';
import { ConnectorRegistry } from './ConnectorRegistry';
import { Task, projects } from '../../database/schema';
import { db } from '../../database/client';
import { eq } from 'drizzle-orm';

import { OutputResult } from './OutputConnector';

export class OutputTaskRunner {
    private registry: ConnectorRegistry;

    constructor() {
        this.registry = ConnectorRegistry.getInstance();
    }

    /**
     * Execute an Output Task
     */
    async execute(taskId: number): Promise<OutputResult> {
        console.log(`[OutputTaskRunner] Starting execution for task ${taskId}`);

        // 1. Load Task
        const task = await taskRepository.findById(taskId);
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
            contentToOutput = await this.aggregateContent(task, config);
        } catch (err) {
            return { success: false, error: `Aggregation failed: ${err}` };
        }

        if (!contentToOutput) {
            return { success: false, error: 'Aggregated content is empty' };
        }

        // 5. Execute Connector
        try {
            console.log(`[OutputTaskRunner] executing connector ${connector.id}`);
            const result = await connector.execute(config, contentToOutput, {
                taskId: task.id,
                projectId: task.projectId,
                taskTitle: task.title,
                projectName: project?.title || 'Unknown Project',
                projectBaseDir: project?.baseDevFolder,
                date: new Date(),
            });

            // 5. Save Result Metadata
            if (result.success) {
                await taskRepository.update(task.id, {
                    executionResult: {
                        // Save the actual content that was written/sent
                        content: contentToOutput,
                        metadata: result.metadata,
                        provider: connector.id,
                        status: 'success',
                    },
                    result: contentToOutput, // Also save to result column for consistency
                    status: 'done',
                    completedAt: new Date(),
                });
            } else {
                await taskRepository.update(task.id, {
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
            dependencies = task.dependencies;
        }

        if (dependencies.length === 0) {
            console.warn(
                '[OutputTaskRunner] No dependencies found for output task. Using empty content.'
            );
            return '';
        }

        // Fetch dependency tasks
        const inputs: string[] = [];
        for (const depId of dependencies) {
            const depTask = await taskRepository.findById(depId);
            if (depTask) {
                // Determine what content to use
                // 1. Result field
                // 2. ExecutionResult.content
                // 3. Output field (future)
                const content =
                    (depTask as any).result ||
                    (depTask.executionResult as any)?.content ||
                    depTask.generatedPrompt || // Fallback?
                    '';

                if (content) {
                    inputs.push(content);
                }
            }
        }

        // Aggregation Strategy
        if (config.aggregation === 'concat' || config.aggregation === 'single') {
            return inputs.join('\n\n---\n\n');
        } else if (config.aggregation === 'template') {
            // TODO: V2 Template implementation
            if (config.templateConfig?.template) {
                // Minimal placeholder replacement MVP
                let rendered = config.templateConfig.template;
                // Very naive replacement for MVP
                // In real impl, use Handlebars or similar
                inputs.forEach((input, idx) => {
                    rendered = rendered.replace(new RegExp(`{{input${idx + 1}}}`, 'g'), input);
                });
                // Also support joining all
                rendered = rendered.replace('{{all_results}}', inputs.join('\n\n'));
                return rendered;
            }
            return inputs.join('\n\n');
        }

        return inputs.join('\n\n');
    }
}
