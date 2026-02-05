import { Project, ProjectMemory, DecisionLog } from '../../core/types/database';
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
    /**
     * Run the Curator on a completed task to update Project Memory.
     * This should be called asynchronously after task completion.
     */
    async runCurator(
        projectId: number,
        projectSequence: number,
        taskTitle: string,
        taskOutput: string,
        project: Project,
        executionService: any, // Not used directly but kept for interface compatibility
        repo: any, // Pass repository
        preComputedContext?: any, // Optional pre-computed context from agent
        defaultAiConfig?: { providerId: string; modelId: string } | null,
        isLoggedIn: boolean = false
    ): Promise<void> {
        console.log(`[Curator] Starting memory update for task ${projectId}-${projectSequence}...`);

        eventBus.emit<CuratorStartedEvent>(
            'ai.curator_started',
            {
                projectId,
                projectSequence,
                taskTitle,
            },
            'curator-service'
        );

        // Prevent unused variable compilation errors
        void executionService;

        try {
            // Skip check if output is too short - user requested always update
            // if (!taskOutput || taskOutput.length < 50) {
            //     console.log(`[Curator] Skipping - task output too short`);
            //     return;
            // }

            if (!taskOutput) {
                console.log(`[Curator] Skipping - no task output`);
                return;
            }

            // 1. Construct Prompt
            eventBus.emit<CuratorStepEvent>(
                'ai.curator_step',
                {
                    projectId,
                    projectSequence,
                    step: 'analyzing',
                    detail: 'Constructing context from project memory',
                },
                'curator-service'
            );

            // Use a dynamic system prompt optimized for JSON output and context preservation
            // We ignore the file-loaded generic prompt because it conflicts (asks for Markdown)
            // while we strictly require JSON.
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const timeStr = now.toTimeString().split(' ')[0];
            const currentDateTime = `${dateStr} ${timeStr}`;
            const currentYear = now.getFullYear().toString();

            const systemPrompt = `You are the **Project Memory Curator**.

Your role is to maintain the **authoritative Project Memory** shared across
all tasks and AI providers.

You do NOT execute tasks or generate content.
You only curate durable, shared context.

---

## What to Store

Store only:
- Stable facts
- Confirmed decisions
- Current system state
- Active constraints
- Open intents that affect future tasks

Do NOT store:
- Narratives or storytelling
- Step-by-step logs
- Emotions or tone
- Temporary reasoning
- Repeated action history

If it reads like a story, exclude it.

---

## Update Rules

- Compress repeated actions into facts
- Normalize prose into neutral statements
- Replace outdated state instead of appending
- Remove anything no longer relevant

When uncertain, **omit rather than include**.

---

## Required Structure

Always output the full Project Memory using this structure:

\`\`\`md
## Project Memory (Authoritative)

### Project Goal
### Current Focus
### System State
### Active Constraints
### Key Decisions
### Open Intents
### Known Risks / Issues
### Glossary
\`\`\`

Current Date & Time: ${currentDateTime}

Principles:
1. **Preserve Context**: Do not discard existing Summary info unless it is outdated. Merge new info into it.
2. **Extract Decisions**: detailed decisions made in this task. Use '${currentDateTime}' for the date if not explicit.
3. **Update Glossary**: Add new technical terms or project-specific jargon.
4. **JSON Output**: You MUST output valid JSON.
5. **No Hallucinated Dates**: DO NOT generate dates in 2024 or 2025 unless explicitly stated in the text. Default to ${currentDateTime}.

Input Data:
- Current Summary: The high-level state of the project.
- Recent Decisions: The last few decisions made.
- Glossary: Known terms.
`;

            console.log('[Curator] Context memory checks:', {
                memoryExists: !!project.memory,
                summaryLen: project.memory?.summary?.length || 0,
            });

            const currentMemory = project.memory || {
                summary: '',
                recentDecisions: [],
                glossary: {},
            };

            const memoryContext = `
Current Project Memory:
Summary: "${currentMemory.summary || 'None'}"
Recent Decisions: ${JSON.stringify(currentMemory.recentDecisions?.slice(-10) || [], null, 2)}
Glossary: ${JSON.stringify(currentMemory.glossary || {}, null, 2)}
`;

            const taskContext = `
Task: ${projectId}-${projectSequence}
Task Title: ${taskTitle}
Task Output:
${taskOutput.substring(0, 5000)}${taskOutput.length > 5000 ? '\n[... truncated ...]' : ''}
`;

            const prompt = `${systemPrompt}

${memoryContext}

${taskContext}

IMPORTANT: Respond ONLY in valid JSON format with this exact structure:
{
  "summaryUpdate": "string (the NEW updated summary. If no change, return null. If changing, provide the FULL new summary text merging old + new)",
  "newDecisions": [{"date": "YYYY-MM-DD HH:mm", "summary": "decision text"}],
  "glossaryUpdates": {"term": "definition"},
  "conflicts": ["string"]
}
`;

            console.log('[Curator] Prompt constructed. Length:', prompt.length);

            // 2. Execute AI using cost-effective model from configured providers
            eventBus.emit<CuratorStepEvent>(
                'ai.curator_step',
                {
                    projectId,
                    projectSequence,
                    step: 'extracting',
                    detail: 'Running AI analysis on task output',
                },
                'curator-service'
            );

            // Check API Keys provided
            console.log(
                '[Curator] Checking API keys:',
                Object.keys(this.apiKeys).length > 0 ? Object.keys(this.apiKeys) : 'NONE'
            );

            let aiResponse: string | null = null;

            try {
                if (preComputedContext) {
                    console.log('[Curator] Using pre-computed context, skipping AI execution');
                    // We can just use the pre-computed context as theAI response if it matches the format,
                    // or better, handle it directly.
                    // If preComputedContext IS the decision structure, we can verify it.

                    // Let's assume preComputedContext is the PARSED object structure we want.
                    // But the code below expects `aiResponse` string and parses it.
                    // To minimize changes, we can serialize it back to JSON string if needed,
                    // or split the logic. Serializing is safest to reuse parsing/cleaning logic below
                    // if we are unsure of format, but if we trust it, we can skip.

                    // Actually, let's allow `aiResponse` to be null if `preComputedContext` is present
                    // and handle it in step 3.
                } else {
                    // ===============================
                    // CURATOR OPERATOR HIERARCHY
                    // ===============================
                    // 1. Check project curator setting (Specific Override)
                    // 2. Check User's Default AI (Preferred User Setting)
                    // 3. Fallback to global curator (System Default)
                    // 4. Fallback to cost-effective provider (Automated Fallback)

                    const { operatorRepository } =
                        await import('../../../electron/main/database/repositories/operator-repository');
                    let curatorOperator = null;
                    let selectedStrategy = 'fallback'; // 'project' | 'user-default' | 'global' | 'fallback'

                    // Priority 1: Project curator
                    if (project.curatorOperatorId) {
                        curatorOperator = await operatorRepository.findById(
                            project.curatorOperatorId
                        );
                        if (curatorOperator) {
                            selectedStrategy = 'project';
                            console.log(
                                `[Curator] Strategy: Projectator - ${curatorOperator.name}`
                            );
                        }
                    }

                    // Priority 2: User Default AI (if provided and valid)
                    // This respects the "Initial Setup Wizard" choice.
                    const { ProviderFactory } = await import('./providers/ProviderFactory');
                    const providerFactory = new ProviderFactory();
                    let providerResult = null;

                    if (!curatorOperator && defaultAiConfig && defaultAiConfig.providerId) {
                        const isHighFlow = defaultAiConfig.providerId === 'default-highflow';

                        // Safety Check: Don't use HighFlow if not logged in
                        if (isHighFlow && !isLoggedIn) {
                            console.warn(
                                `[Curator] Default AI is HighFlow but user is not logged in. Skipping user default.`
                            );
                        } else {
                            // Attempt to use user default
                            try {
                                providerFactory.setApiKeys(this.apiKeys);
                                const provider = await providerFactory.getProvider(
                                    defaultAiConfig.providerId
                                );
                                if (provider) {
                                    // Verify model exists or use default
                                    const model =
                                        defaultAiConfig.modelId || provider.models[0]?.name;
                                    providerResult = { provider, model };
                                    selectedStrategy = 'user-default';
                                    console.log(
                                        `[Curator] Strategy: User Default - ${provider.name} (${model})`
                                    );
                                }
                            } catch (err) {
                                console.warn(`[Curator] Failed to load User Default AI:`, err);
                            }
                        }
                    }

                    // Priority 3: Global curator (if no project curator and no user default used)
                    if (!curatorOperator && !providerResult) {
                        curatorOperator = await operatorRepository.findGlobalCurator();
                        if (curatorOperator) {
                            // Check if Global Curator uses HighFlow and valid login
                            const isGlobalHighFlow =
                                curatorOperator.aiProvider === 'default-highflow';
                            if (isGlobalHighFlow && !isLoggedIn) {
                                console.warn(
                                    '[Curator] Global Curator uses HighFlow but user is not logged in. Skipping global curator.'
                                );
                                curatorOperator = null; // Skip it
                            } else {
                                selectedStrategy = 'global';
                                console.log(
                                    `[Curator] Strategy: Global Curator - ${curatorOperator.name}`
                                );
                            }
                        }
                    }

                    // Execution based on selected strategy
                    // If we have a providerResult from Priority 2, use it.
                    // If we have a curatorOperator (Priority 1 or 3), use it.

                    if (curatorOperator && !providerResult) {
                        providerFactory.setApiKeys(this.apiKeys);
                        try {
                            // Cast to any to avoid strict union type errors
                            const providerId = curatorOperator.aiProvider as any;
                            const provider = await providerFactory.getProvider(providerId);
                            providerResult = {
                                provider,
                                model: curatorOperator.aiModel,
                            };
                        } catch (e) {
                            console.error(
                                `[Curator] Failed to load operator provider ${curatorOperator.aiProvider}:`,
                                e
                            );
                        }
                    }

                    // Priority 4: Fallback to cost-effective provider
                    if (!providerResult) {
                        console.log(
                            '[Curator] No confirmed curator strategy found, using cost-effective fallback'
                        );
                        // Explicitly tell fallback to avoid HighFlow if not logged in
                        // (Logic inside selectCostEffectiveProvider currently prefers Flash/Mini/Haiku which are usually Key-based.
                        // It doesn't default to HighFlow. So this is safe.)
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
                    console.log(
                        `[Curator] AI response received (${aiResponse?.length || 0} chars)`
                    );
                }
            } catch (aiError) {
                console.warn('[Curator] AI execution failed, using fallback:', aiError);
                // Fallback: Simple extraction without AI
                aiResponse = this.extractDecisionsSimple(taskTitle, taskOutput);
            }

            if (!aiResponse && !preComputedContext) {
                console.log(
                    '[Curator] No AI response and no pre-computed context, skipping update'
                );
                return;
            }

            // 3. Parse Output
            let parsed: any;
            if (preComputedContext) {
                parsed = preComputedContext;
            } else {
                try {
                    // Clean cleanup function
                    const cleanJson = (str: string) => {
                        // Remove markdown code blocks with optional language identifier
                        // Matches ```json, ```markdown, ```, etc.
                        str = str.replace(/```[a-zA-Z]*\s*|\s*```/g, '');

                        // Find the outer-most JSON object
                        const firstBrace = str.indexOf('{');
                        const lastBrace = str.lastIndexOf('}');

                        if (firstBrace !== -1 && lastBrace !== -1) {
                            return str.substring(firstBrace, lastBrace + 1);
                        }

                        return str;
                    };

                    const cleaned = cleanJson(aiResponse || '{}');
                    // Ensure we have something effectively JSON-like before parsing to avoid "unexpected token" on plain text
                    if (!cleaned || cleaned.trim().length === 0 || cleaned.indexOf('{') === -1) {
                        throw new Error('No JSON object found in response');
                    }
                    parsed = JSON.parse(cleaned);
                } catch (parseError) {
                    console.error('[Curator] Failed to parse AI response:', parseError);
                    console.debug('[Curator] Raw response:', aiResponse);
                    return;
                }
            }

            // 4. Update Project Memory
            eventBus.emit<CuratorStepEvent>(
                'ai.curator_step',
                {
                    projectId,
                    projectSequence,
                    step: 'updating',
                    detail: 'Merging new insights into project memory',
                },
                'curator-service'
            );
            // newDecisions might not have taskId anymore in prompt response, but we can assign current one if needed.
            // However, DB DecisionsLog might not strictly require taskId to be 'id', or maybe it's fine.
            // Let's assume parsed.newDecisions items don't have taskId, or we ignore it.
            // Wait, DecisionsLog interface has `taskId`. We should probably store projectSequence instead?
            // Or just store 0 for now if taskId is deprecated. But the DecisionLog interface in database types might need check.
            // Variables now, dateStr, timeStr, currentDateTime, currentYear are declared at the top of the function

            const newDecisions: DecisionLog[] = (parsed.newDecisions || []).map((d: any) => {
                let decisionDate = d.date || currentDateTime;

                // Sanitize Date: If year is 2024 (or significantly in past/future), force it to today
                // Logic: If date doesn't start with currentYear (e.g. "2026"), fix it.
                if (!decisionDate.startsWith(currentYear)) {
                    console.warn(
                        `[Curator] Detected invalid date year in decision: ${decisionDate}. Forcing to ${currentDateTime}.`
                    );
                    decisionDate = currentDateTime;
                }

                return {
                    date: decisionDate,
                    summary: d.summary,
                    taskId: 0, // Deprecated taskId
                };
            });

            const updatedMemory: ProjectMemory = {
                summary: parsed.summaryUpdate || currentMemory.summary || '',
                recentDecisions: [
                    ...(currentMemory.recentDecisions || []).slice(-20), // Keep last 20
                    ...newDecisions,
                ],
                glossary: { ...(currentMemory.glossary || {}), ...(parsed.glossaryUpdates || {}) },
                lastUpdatedTask: projectSequence, // Use sequence instead of taskId
                lastUpdatedAt: new Date().toISOString(),
            };

            // Log conflicts if any
            if (parsed.conflicts && parsed.conflicts.length > 0) {
                console.warn(`[Curator] Conflicts detected:`, parsed.conflicts);
            }

            // 5. Save to DB
            eventBus.emit<CuratorStepEvent>(
                'ai.curator_step',
                {
                    projectId,
                    projectSequence,
                    step: 'saving',
                    detail: 'Persisting updates to database',
                },
                'curator-service'
            );
            await repo.update(project.id, { memory: updatedMemory });

            eventBus.emit<CuratorCompletedEvent>(
                'ai.curator_completed',
                {
                    projectId,
                    projectSequence,
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

        const now = new Date();
        // date + time string (YYYY-MM-DD HH:mm:ss)
        const dateTimeStr = now.toISOString().replace('T', ' ').substring(0, 19);

        const result = {
            summaryUpdate: null,
            newDecisions: decisions.slice(0, 3).map((d) => ({
                date: dateTimeStr,
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
    /**
     * Select a cost-effective AI provider for text summarization
     * Priority: Explicit preferred models > Any Flash/Mini/Haiku model > First available model
     */
    private async selectCostEffectiveProvider(
        providerFactory: any
    ): Promise<{ provider: any; model: string } | null> {
        // 1. Explicit Preferred Models
        const preferredModels = [
            { provider: 'google', model: 'gemini-2.0-flash-exp' },
            { provider: 'google', model: 'gemini-2.0-flash' },
            { provider: 'google', model: 'gemini-2.5-flash' }, // Corrected provider ID
            { provider: 'google', model: 'gemini-1.5-flash' },
            { provider: 'openai', model: 'gpt-4o-mini' },
            { provider: 'anthropic', model: 'claude-3-haiku-20240307' },
            { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
        ];

        // Try preferred models first
        for (const { provider: providerId, model } of preferredModels) {
            try {
                if (!providerFactory.isProviderEnabled(providerId)) continue;

                const provider = await providerFactory.getProvider(providerId);
                // Inject API keys if available
                if (this.apiKeys) {
                    providerFactory.setApiKeys(this.apiKeys);
                }

                if (provider) {
                    // Check if the model is available
                    const modelInfo = provider.models.find(
                        (m: any) => m.name === model || m.name.includes(model)
                    );
                    if (modelInfo) {
                        console.log(
                            `[Curator] Selected cost-effective provider: ${providerId} with model: ${modelInfo.name}`
                        );
                        return { provider, model: modelInfo.name };
                    }
                }
            } catch (error) {
                // Continue to next
            }
        }

        // 2. Wildcard Fallback: Any "flash", "mini", or "haiku" model
        console.log(
            '[Curator] Exact preferred models not found, searching for any efficient model...'
        );
        const efficientKeywords = ['flash', 'mini', 'haiku', 'sammll'];
        const providers = ['google', 'openai', 'anthropic', 'ollama'];

        for (const providerId of providers) {
            try {
                if (!providerFactory.isProviderEnabled(providerId)) continue;
                const provider = await providerFactory.getProvider(providerId);
                if (this.apiKeys) providerFactory.setApiKeys(this.apiKeys);

                if (provider && provider.models) {
                    const efficientModel = provider.models.find((m: any) =>
                        efficientKeywords.some((kw) => m.name.toLowerCase().includes(kw))
                    );

                    if (efficientModel) {
                        console.log(
                            `[Curator] Selected efficient fallback: ${providerId} - ${efficientModel.name}`
                        );
                        return { provider, model: efficientModel.name };
                    }
                }
            } catch (e) {
                continue;
            }
        }

        // 3. Last Resort: Any available model
        console.warn('[Curator] No efficient model found. Fallback to first available model.');
        for (const providerId of providers) {
            try {
                if (!providerFactory.isProviderEnabled(providerId)) continue;
                const provider = await providerFactory.getProvider(providerId);
                if (this.apiKeys) providerFactory.setApiKeys(this.apiKeys);

                if (provider && provider.models && provider.models.length > 0) {
                    const fallbackModel = provider.models[0];
                    console.log(
                        `[Curator] Selected fallback: ${providerId} - ${fallbackModel.name}`
                    );
                    return { provider, model: fallbackModel.name };
                }
            } catch (e) {
                continue;
            }
        }

        return null;
    }
}
