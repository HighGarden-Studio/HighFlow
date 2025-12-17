import { Project, ProjectMemory, DecisionLog } from '../../core/types/database';
import { CURATOR_SYSTEM_PROMPT } from './templates/ContextTemplates';
import { eventBus } from '../events/EventBus';
import type { ProviderApiKeys } from './providers/ProviderFactory';
import type {
    CuratorStartedEvent,
    CuratorStepEvent,
    CuratorCompletedEvent,
} from '../events/EventBus';

/**
 * Curator Service
 *
 * Responsible for maintaining the Project Memory by analyzing task outputs.
 * It identifies new decisions, glossary terms, and summary updates.
 * Uses a cost-effective AI model (GPT-4o-mini) for analysis.
 */
export class CuratorService {
    private static instance: CuratorService;

    private constructor() {
        // Initialize dependencies
    }

    private apiKeys: ProviderApiKeys = {};

    setApiKeys(keys: ProviderApiKeys): void {
        this.apiKeys = keys;
    }

    static getInstance(): CuratorService {
        if (!CuratorService.instance) {
            CuratorService.instance = new CuratorService();
        }
        return CuratorService.instance;
    }

    /**
     * Run the Curator on a completed task to update Project Memory.
     * This should be called asynchronously after task completion.
     */
    async runCurator(
        taskId: number,
        taskTitle: string,
        taskOutput: string,
        project: Project,
        executionService: any, // Not used directly but kept for interface compatibility
        repo: any // Pass repository
    ): Promise<void> {
        console.log(`[Curator] Starting memory update for task ${taskId}...`);

        eventBus.emit<CuratorStartedEvent>(
            'ai.curator_started',
            {
                taskId,
                projectId: project.id,
                taskTitle,
            },
            'curator-service'
        );

        // Prevent unused variable compilation errors
        void executionService;

        try {
            // Skip if output is too short to contain meaningful information
            if (!taskOutput || taskOutput.length < 50) {
                console.log(`[Curator] Skipping - task output too short`);
                return;
            }

            // 1. Construct Prompt
            eventBus.emit<CuratorStepEvent>(
                'ai.curator_step',
                { taskId, step: 'analyzing', detail: 'Constructing context from project memory' },
                'curator-service'
            );
            const currentMemory = project.memory || {
                summary: '',
                recentDecisions: [],
                glossary: {},
            };

            const memoryContext = `
Current Project Memory:
Summary: ${currentMemory.summary || 'None'}
Recent Decisions: ${JSON.stringify(currentMemory.recentDecisions?.slice(-10) || [], null, 2)}
Glossary: ${JSON.stringify(currentMemory.glossary || {}, null, 2)}
`;

            const taskContext = `
Task ID: ${taskId}
Task Title: ${taskTitle}
Task Output:
${taskOutput.substring(0, 3000)}${taskOutput.length > 3000 ? '\n[... truncated ...]' : ''}
`;

            const prompt = `${CURATOR_SYSTEM_PROMPT}

${memoryContext}

${taskContext}

IMPORTANT: Respond ONLY in valid JSON format with this exact structure:
{
  "summaryUpdate": "string or null if no update needed",
  "newDecisions": [{"date": "YYYY-MM-DD", "summary": "decision text", "taskId": number}],
  "glossaryUpdates": {"term": "definition"},
  "conflicts": ["list of conflicts if any"]
}
`;

            // 2. Execute AI using cost-effective model from configured providers
            eventBus.emit<CuratorStepEvent>(
                'ai.curator_step',
                { taskId, step: 'extracting', detail: 'Running AI analysis on task output' },
                'curator-service'
            );
            let aiResponse: string | null = null;

            try {
                // ===============================
                // CURATOR OPERATOR HIERARCHY
                // ===============================
                // 1. Check project curator setting
                // 2. Fallback to global curator
                // 3. Fallback to cost-effective provider

                const { operatorRepository } =
                    await import('../../../electron/main/database/repositories/operator-repository');
                let curatorOperator = null;

                // Priority 1: Project curator
                if (project.curatorOperatorId) {
                    curatorOperator = await operatorRepository.findById(project.curatorOperatorId);
                    if (curatorOperator) {
                        console.log(`[Curator] Using project curator: ${curatorOperator.name}`);
                    }
                }

                // Priority 2: Global curator
                if (!curatorOperator) {
                    curatorOperator = await operatorRepository.findGlobalCurator();
                    if (curatorOperator) {
                        console.log(`[Curator] Using global curator: ${curatorOperator.name}`);
                    }
                }

                // Use ProviderFactory to get a configured provider
                const { ProviderFactory } = await import('./providers/ProviderFactory');
                const providerFactory = new ProviderFactory();

                let providerResult = null;

                // Priority 3: Use curator operator's AI settings if found
                if (curatorOperator) {
                    providerFactory.setApiKeys(this.apiKeys);
                    const provider = await providerFactory.getProvider(curatorOperator.aiProvider);
                    providerResult = {
                        provider,
                        model: curatorOperator.aiModel,
                    };
                } else {
                    // Priority 4: Fallback to cost-effective provider
                    console.log(
                        '[Curator] No curator operator found, using cost-effective provider'
                    );
                    providerResult = await this.selectCostEffectiveProvider(providerFactory);
                }

                if (!providerResult) {
                    throw new Error(
                        'No configured AI provider available. Please configure at least one AI provider in Settings.'
                    );
                }

                const { provider, model } = providerResult;
                console.log(`[Curator] Using provider: ${provider.name}, model: ${model}`);

                const response = await provider.execute(prompt, {
                    model: model,
                    temperature: 0.3,
                    maxTokens: 1000,
                });

                aiResponse = response.content;
                console.log(`[Curator] AI response received (${aiResponse?.length || 0} chars)`);
            } catch (aiError) {
                console.warn('[Curator] AI execution failed, using fallback:', aiError);
                // Fallback: Simple extraction without AI
                aiResponse = this.extractDecisionsSimple(taskTitle, taskOutput);
            }

            if (!aiResponse) {
                console.log('[Curator] No AI response, skipping update');
                return;
            }

            // 3. Parse Output
            let parsed: any;
            try {
                // Extract JSON from response (may include markdown code blocks)
                const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    parsed = JSON.parse(jsonMatch[0]);
                } else {
                    console.error('[Curator] No valid JSON found in response');
                    return;
                }
            } catch (parseError) {
                console.error('[Curator] Failed to parse AI response:', parseError);
                return;
            }

            // 4. Update Project Memory
            eventBus.emit<CuratorStepEvent>(
                'ai.curator_step',
                { taskId, step: 'updating', detail: 'Merging new insights into project memory' },
                'curator-service'
            );
            const newDecisions: DecisionLog[] = (parsed.newDecisions || []).map((d: any) => ({
                date: d.date || new Date().toISOString().split('T')[0],
                summary: d.summary,
                taskId: d.taskId || taskId,
            }));

            const updatedMemory: ProjectMemory = {
                summary: parsed.summaryUpdate || currentMemory.summary,
                recentDecisions: [
                    ...(currentMemory.recentDecisions || []).slice(-20), // Keep last 20
                    ...newDecisions,
                ],
                glossary: { ...(currentMemory.glossary || {}), ...(parsed.glossaryUpdates || {}) },
                lastUpdatedTask: taskId,
                lastUpdatedAt: new Date().toISOString(),
            };

            // Log conflicts if any
            if (parsed.conflicts && parsed.conflicts.length > 0) {
                console.warn(`[Curator] Conflicts detected:`, parsed.conflicts);
            }

            // 5. Save to DB
            eventBus.emit<CuratorStepEvent>(
                'ai.curator_step',
                { taskId, step: 'saving', detail: 'Persisting updates to database' },
                'curator-service'
            );
            await repo.update(project.id, { memory: updatedMemory });

            eventBus.emit<CuratorCompletedEvent>(
                'ai.curator_completed',
                {
                    taskId,
                    summaryUpdate: parsed.summaryUpdate,
                    newDecisionsCount: newDecisions.length,
                    glossaryUpdatesCount: Object.keys(parsed.glossaryUpdates || {}).length,
                    success: true,
                },
                'curator-service'
            );
            console.log(
                `[Curator] Memory updated for project ${project.id} - ${newDecisions.length} new decisions`
            );
        } catch (error) {
            console.error('[Curator] Failed to update memory:', error);
            // Non-blocking error
        }
    }

    /**
     * Simple fallback extraction without AI
     */
    private extractDecisionsSimple(taskTitle: string, taskOutput: string): string {
        // Extract decisions from common patterns
        const decisionPatterns = [
            /decision[s]?:?\s*([^.]+\.)/gi,
            /decided\s+to\s+([^.]+\.)/gi,
            /we\s+will\s+([^.]+\.)/gi,
        ];

        const decisions: string[] = [];
        for (const pattern of decisionPatterns) {
            const matches = taskOutput.matchAll(pattern);
            for (const match of matches) {
                if (match[1] && match[1].length < 200) {
                    decisions.push(match[1].trim());
                }
            }
        }

        const result = {
            summaryUpdate: null,
            newDecisions: decisions.slice(0, 3).map((d) => ({
                date: new Date().toISOString().split('T')[0],
                summary: `[From ${taskTitle}] ${d}`,
                taskId: 0,
            })),
            glossaryUpdates: {},
            conflicts: [],
        };

        return JSON.stringify(result);
    }

    /**
     * Select a cost-effective AI provider for text summarization
     * Priority: gemini-flash (cheap, multimodal) > gpt-4o-mini > claude-haiku > default-highflow > any available
     */
    private async selectCostEffectiveProvider(
        providerFactory: any
    ): Promise<{ provider: any; model: string } | null> {
        // Cost-effective models in priority order (prioritize multimodal support)
        const preferredModels = [
            { provider: 'google', model: 'gemini-2.0-flash' },
            { provider: 'google', model: 'gemini-1.5-flash' },
            { provider: 'default-highflow', model: 'gemini-2.5-flash' },
            { provider: 'openai', model: 'gpt-4o-mini' },
            { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
            { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
        ];

        // Try preferred models first
        for (const { provider: providerId, model } of preferredModels) {
            try {
                const provider = await providerFactory.getProvider(providerId);
                // Inject API keys if available
                if (this.apiKeys) {
                    providerFactory.setApiKeys(this.apiKeys);
                }

                if (provider) {
                    // Check if the model is available
                    const modelInfo = provider.models.find(
                        (m: any) => m.name === model || m.name.includes(model.replace(/-/g, ''))
                    );
                    if (modelInfo) {
                        console.log(
                            `[Curator] Selected cost-effective provider: ${providerId} with model: ${model}`
                        );
                        return { provider, model };
                    }
                    // If specific model not found, use the provider's first available model
                    if (provider.models.length > 0) {
                        const firstModel = provider.models[0].name;
                        console.log(`[Curator] Model ${model} not found, using: ${firstModel}`);
                        return { provider, model: firstModel };
                    }
                }
            } catch (error) {
                // Provider not configured or error, try next
                console.debug(`[Curator] Provider ${providerId} not available:`, error);
            }
        }

        // Fallback: Try any available provider
        const fallbackProviders = ['google', 'openai', 'anthropic', 'default-highflow'];
        for (const providerId of fallbackProviders) {
            try {
                const provider = await providerFactory.getProvider(providerId);
                if (provider && provider.models.length > 0) {
                    const model = provider.models[0].name;
                    console.log(
                        `[Curator] Using fallback provider: ${providerId} with model: ${model}`
                    );
                    return { provider, model };
                }
            } catch {
                // Continue to next provider
            }
        }

        return null;
    }
}
