import { Project, ProjectMemory, DecisionLog } from '../../core/types/database';
import { CURATOR_SYSTEM_PROMPT } from './templates/ContextTemplates';

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

        // Prevent unused variable compilation errors
        void executionService;

        try {
            // Skip if output is too short to contain meaningful information
            if (!taskOutput || taskOutput.length < 50) {
                console.log(`[Curator] Skipping - task output too short`);
                return;
            }

            // 1. Construct Prompt
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

            // 2. Execute AI using cost-effective model
            let aiResponse: string | null = null;

            try {
                // Try to use GPT-4o-mini via dynamic import
                const { GPTProvider } = await import('./providers/GPTProvider');
                const gptProvider = new GPTProvider();

                const response = await gptProvider.execute(prompt, {
                    model: 'gpt-4o-mini',
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
            await repo.update(project.id, { memory: updatedMemory });
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
}
