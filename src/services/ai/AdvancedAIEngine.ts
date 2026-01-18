/**
 * Advanced AI Engine
 *
 * Core AI engine for intelligent project and task management
 */

import type {
    UserContext,
    PromptAnalysisResult,
    ConversationContext,
    Question,
    Answer,
    StructuredRequirement,
    TaskDecompositionResult,
    SkillRecommendation,
    MCPMatch,
    ProviderSelectionConstraints,
    ProviderSelectionResult,
    TaskComplexity,
    RequirementGap,
} from '@core/types/ai';
import type { Task, Skill, MCPIntegration, Template } from '@core/types/database';
import { ProviderFactory } from './providers/ProviderFactory';
import { nanoid } from 'nanoid';

export class AdvancedAIEngine {
    private providerFactory: ProviderFactory;
    private conversationContexts: Map<string, ConversationContext>;

    constructor() {
        this.providerFactory = new ProviderFactory();
        this.conversationContexts = new Map();
    }

    /**
     * Analyze main prompt to extract requirements and suggest templates
     */
    async analyzeMainPrompt(
        prompt: string,
        userContext: UserContext
    ): Promise<PromptAnalysisResult> {
        const provider = await this.providerFactory.getProvider('anthropic');

        const systemPrompt = `You are an expert project analyzer. Analyze the user's project description and:
1. Identify missing requirements and critical questions
2. Suggest relevant templates
3. Estimate project complexity
4. Recommend the best AI provider for execution

User context:
- Skill level: ${userContext.skillLevel}
- Recent projects: ${userContext.recentProjects.map((p) => p.title).join(', ')}
- Preferred AI: ${userContext.preferences.preferredAI || 'none'}

Respond in JSON format.`;

        const analysisPrompt = `Analyze this project request:

"${prompt}"

Provide:
1. Critical questions to clarify requirements (category, question, importance)
2. Suggested template categories that match this project
3. Estimated complexity (simple/medium/complex)
4. Recommended AI provider (openai/anthropic/google) with reasoning
5. Detected keywords and domain
6. Confidence score (0-1)`;

        const response = await provider.execute(
            analysisPrompt,
            {
                model: 'claude-3-5-sonnet-20250219',
                temperature: 0.3,
                maxTokens: 2000,
                systemPrompt,
                responseFormat: 'json',
            },
            {
                userId: userContext.userId,
                metadata: { operation: 'prompt_analysis' },
            }
        );

        // Parse AI response
        const analysis = this.parseAnalysisResponse(response.content);

        // Fetch matching templates from database (mock for now)
        const suggestedTemplates = await this.fetchMatchingTemplates(
            analysis.detectedDomain,
            analysis.detectedKeywords
        );

        return {
            ...analysis,
            suggestedTemplates,
        };
    }

    /**
     * Generate follow-up questions based on conversation context
     */
    async generateFollowUpQuestions(
        context: ConversationContext,
        previousAnswers: Answer[]
    ): Promise<Question[]> {
        const provider = await this.providerFactory.getProvider('anthropic');

        const systemPrompt = `You are a requirements gathering specialist. Generate targeted follow-up questions based on:
- Main prompt: ${context.mainPrompt}
- Current phase: ${context.currentPhase}
- Information collected: ${JSON.stringify(context.collectedInfo)}
- Previous answers: ${JSON.stringify(previousAnswers)}

Generate 1-3 questions that will fill critical gaps. Respond in JSON array format.`;

        const questionsPrompt = `Generate follow-up questions to clarify requirements.
Focus on:
- Technical specifications
- Success criteria
- Timeline and resources
- Constraints and dependencies

Each question should have:
- id: unique identifier
- text: question text
- type: text|choice|multiChoice|range|boolean
- options: array of options (if applicable)
- validation: { required, minLength, maxLength, pattern }`;

        const response = await provider.execute(
            questionsPrompt,
            {
                model: 'claude-3-5-sonnet-20250219',
                temperature: 0.5,
                maxTokens: 1500,
                systemPrompt,
                responseFormat: 'json',
            },
            {
                userId: context.messages[0]?.metadata?.userId || 0,
                metadata: { operation: 'generate_questions', sessionId: context.sessionId },
            }
        );

        const questions = this.parseQuestionsResponse(response.content);

        return questions;
    }

    /**
     * Synthesize all collected information into structured requirements
     */
    async synthesizeRequirements(
        mainPrompt: string,
        answers: Answer[],
        template?: Template
    ): Promise<StructuredRequirement> {
        const provider = await this.providerFactory.getProvider('anthropic');

        const systemPrompt = `You are a requirements analyst. Synthesize all information into a comprehensive structured requirement document.`;

        const synthesisPrompt = `Create a structured requirement document from:

Main Prompt: "${mainPrompt}"

Collected Answers:
${answers.map((a) => `- ${a.questionId}: ${a.value}`).join('\n')}

${template ? `Template Context: ${template.name} - ${template.description}` : ''}

Generate:
1. Clear title and description
2. Specific goals (measurable)
3. Constraints (budget, deadline, resources, technical)
4. Context (domain, existing assets, stakeholders)
5. Acceptance criteria (testable conditions)
6. Metadata (tags, category, priority)

Respond in JSON format.`;

        const response = await provider.execute(
            synthesisPrompt,
            {
                model: 'claude-3-5-sonnet-20250219',
                temperature: 0.2,
                maxTokens: 2500,
                systemPrompt,
                responseFormat: 'json',
            },
            {
                userId: 0,
                metadata: { operation: 'synthesize_requirements' },
            }
        );

        return this.parseSynthesisResponse(response.content);
    }

    /**
     * Decompose requirements into actionable tasks with dependencies
     */
    async decomposeTasks(requirement: StructuredRequirement): Promise<TaskDecompositionResult> {
        const provider = await this.providerFactory.getProvider('anthropic');

        const systemPrompt = `You are a project planning expert. Break down complex requirements into:
1. Granular, actionable tasks
2. Task dependencies and relationships
3. Execution plan with phases
4. Time and cost estimates
5. Risk analysis`;

        const decompositionPrompt = `Decompose this requirement into tasks:

Title: ${requirement.title}
Description: ${requirement.description}

Goals:
${requirement.goals.map((g, i) => `${i + 1}. ${g}`).join('\n')}

Constraints:
${JSON.stringify(requirement.constraints, null, 2)}

Acceptance Criteria:
${requirement.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Generate:
1. Tasks array with: title, description, priority, estimatedMinutes, status=todo, dependencies
2. Dependency graph (nodes and edges)
3. Execution plan with phases
4. Total estimated time and cost
5. Risk assessment

Respond in JSON format.`;

        const response = await provider.execute(
            decompositionPrompt,
            {
                model: 'claude-3-5-sonnet-20250219',
                temperature: 0.3,
                maxTokens: 4000,
                systemPrompt,
                responseFormat: 'json',
            },
            {
                userId: 0,
                metadata: { operation: 'decompose_tasks' },
            }
        );

        return this.parseDecompositionResponse(response.content);
    }

    /**
     * Recommend relevant skills for a specific task
     */
    async recommendSkills(task: Task, availableSkills: Skill[]): Promise<SkillRecommendation[]> {
        const provider = await this.providerFactory.getProvider('openai');

        const systemPrompt = `You are a skills matching expert. Analyze the task and recommend the most relevant skills.`;

        const skillsPrompt = `Task: ${task.title}
Description: ${task.description || 'No description'}
Priority: ${task.priority}
Tags: ${task.tags?.join(', ') || 'none'}

Available Skills:
${availableSkills
    .map(
        (s, i) =>
            `${i + 1}. ${s.name} (${s.category}): ${s.description}
   MCP Requirements: ${s.mcpRequirements?.join(', ') || 'none'}`
    )
    .join('\n\n')}

For each relevant skill, provide:
- Relevance score (0-1)
- Reason for recommendation
- Estimated impact (time reduction %, quality improvement %, cost saving %)
- Required MCPs

Return top 5 skills in JSON array format.`;

        const response = await provider.execute(
            skillsPrompt,
            {
                model: 'gpt-4-turbo',
                temperature: 0.4,
                maxTokens: 2000,
                systemPrompt,
                responseFormat: 'json',
            },
            {
                userId: 0,
                taskId: (task as any).id,
                metadata: { operation: 'recommend_skills' },
            }
        );

        return this.parseSkillsResponse(response.content, availableSkills);
    }

    /**
     * Match MCP tools to task requirements
     */
    async matchMCPTools(task: Task, availableMCPs: MCPIntegration[]): Promise<MCPMatch[]> {
        const provider = await this.providerFactory.getProvider('openai');

        const systemPrompt = `You are an MCP (Model Context Protocol) tools expert. Match tasks with the most appropriate MCP tools.`;

        const matchPrompt = `Task: ${task.title}
Description: ${task.description || 'No description'}
AI Provider: ${task.aiProvider || 'not specified'}
Tags: ${task.tags?.join(', ') || 'none'}

Available MCP Integrations:
${availableMCPs
    .map(
        (mcp, i) =>
            `${i + 1}. ${mcp.name}: ${mcp.description}
   Endpoint: ${mcp.endpoint}
   Official: ${mcp.isOfficial ? 'Yes' : 'No'}`
    )
    .join('\n\n')}

For each relevant MCP, provide:
- Confidence score (0-1)
- Reason for matching
- Suggested tools from this MCP (with parameters)

Return matches in JSON array format.`;

        const response = await provider.execute(
            matchPrompt,
            {
                model: 'gpt-4-turbo',
                temperature: 0.3,
                maxTokens: 2000,
                systemPrompt,
                responseFormat: 'json',
            },
            {
                userId: 0,
                taskId: (task as any).id,
                metadata: { operation: 'match_mcps' },
            }
        );

        return this.parseMCPMatchResponse(response.content, availableMCPs);
    }

    /**
     * Select optimal AI provider based on task characteristics and constraints
     */
    async selectOptimalProvider(
        task: Task,
        constraints: ProviderSelectionConstraints
    ): Promise<ProviderSelectionResult> {
        // Get available provider capabilities
        const providers = await this.providerFactory.getAllProviders();
        const capabilities = await Promise.all(
            providers.map(async (p) => ({
                provider: p.name,
                models: p.models,
                features: p.getSupportedFeatures(),
                capabilities: p.getCapabilities(),
            }))
        );

        // Use AI to analyze and select best provider
        const provider = await this.providerFactory.getProvider('anthropic');

        const systemPrompt = `You are an AI provider selection expert. Choose the optimal AI provider and model based on task requirements and constraints.`;

        const selectionPrompt = `Task Analysis:
- Title: ${task.title}
- Description: ${task.description || 'No description'}
- Priority: ${task.priority}
- Estimated minutes: ${task.estimatedMinutes || 'unknown'}
- Complexity: ${this.estimateComplexity(task)}

Constraints:
- Max cost: ${constraints.maxCost ? `$${constraints.maxCost}` : 'none'}
- Max latency: ${constraints.maxLatency ? `${constraints.maxLatency}ms` : 'none'}
- Required features: ${constraints.requiredFeatures?.join(', ') || 'none'}
- Exclude: ${constraints.excludeProviders?.join(', ') || 'none'}

Available Providers:
${JSON.stringify(capabilities, null, 2)}

Select:
1. Best provider and model
2. Estimated cost and time
3. Reasoning for selection
4. 2 alternative options with tradeoffs

Respond in JSON format.`;

        const response = await provider.execute(
            selectionPrompt,
            {
                model: 'claude-3-5-sonnet-20250219',
                temperature: 0.2,
                maxTokens: 1500,
                systemPrompt,
                responseFormat: 'json',
            },
            {
                userId: 0,
                taskId: (task as any).id,
                metadata: { operation: 'select_provider' },
            }
        );

        return this.parseProviderSelectionResponse(response.content);
    }

    // ========================================
    // Helper Methods
    // ========================================

    private parseAnalysisResponse(
        content: string
    ): Omit<PromptAnalysisResult, 'suggestedTemplates'> {
        try {
            const data = JSON.parse(content);
            return {
                requirements: data.requirements || [],
                estimatedComplexity: data.complexity || 'medium',
                recommendedAI: data.recommendedAI || 'anthropic',
                confidence: data.confidence || 0.7,
                detectedKeywords: data.keywords || [],
                detectedDomain: data.domain || 'general',
            };
        } catch {
            // Fallback parsing
            return {
                requirements: this.extractRequirements(content),
                estimatedComplexity: 'medium',
                recommendedAI: 'anthropic',
                confidence: 0.5,
                detectedKeywords: [],
                detectedDomain: 'general',
            };
        }
    }

    private parseQuestionsResponse(content: string): Question[] {
        try {
            const data = JSON.parse(content);
            return (data.questions || data || []).map((q: any) => ({
                id: q.id || nanoid(),
                text: q.text || q.question,
                type: q.type || 'text',
                options: q.options,
                defaultValue: q.defaultValue,
                validation: q.validation || { required: true },
            }));
        } catch {
            return [];
        }
    }

    private parseSynthesisResponse(content: string): StructuredRequirement {
        try {
            const data = JSON.parse(content);
            return {
                title: data.title || 'Untitled Project',
                description: data.description || '',
                goals: data.goals || [],
                constraints: data.constraints || {},
                context: data.context || { domain: 'general' },
                acceptanceCriteria: data.acceptanceCriteria || [],
                metadata: data.metadata || {},
            };
        } catch {
            return {
                title: 'Parsing Error',
                description: content.substring(0, 500),
                goals: [],
                constraints: {},
                context: { domain: 'general' },
                acceptanceCriteria: [],
                metadata: {},
            };
        }
    }

    private parseDecompositionResponse(content: string): TaskDecompositionResult {
        try {
            const data = JSON.parse(content);
            return {
                tasks: data.tasks || [],
                dependencyGraph: data.dependencyGraph || { nodes: [], edges: [] },
                executionPlan: data.executionPlan || {
                    phases: [],
                    criticalPath: [],
                    parallelizableGroups: [],
                    estimatedTotalTime: 0,
                    bottlenecks: [],
                },
                estimatedTime: data.estimatedTime || 0,
                estimatedCost: data.estimatedCost || 0,
                risks: data.risks || [],
            };
        } catch {
            return {
                tasks: [],
                dependencyGraph: { nodes: [], edges: [] },
                executionPlan: {
                    phases: [],
                    criticalPath: [],
                    parallelizableGroups: [],
                    estimatedTotalTime: 0,
                    bottlenecks: [],
                },
                estimatedTime: 0,
                estimatedCost: 0,
                risks: [],
            };
        }
    }

    private parseSkillsResponse(content: string, availableSkills: Skill[]): SkillRecommendation[] {
        try {
            const data = JSON.parse(content);
            return (data.recommendations || data || []).map((rec: any) => {
                const skill = availableSkills.find(
                    (s) => s.id === rec.skillId || s.name === rec.skillName
                );
                return {
                    skill: skill || availableSkills[0],
                    relevanceScore: rec.relevanceScore || 0.5,
                    reason: rec.reason || 'Recommended by AI',
                    estimatedImpact: rec.estimatedImpact || {},
                    requiredMCPs: rec.requiredMCPs || [],
                };
            });
        } catch {
            return [];
        }
    }

    private parseMCPMatchResponse(content: string, availableMCPs: MCPIntegration[]): MCPMatch[] {
        try {
            const data = JSON.parse(content);
            return (data.matches || data || []).map((match: any) => {
                const mcp = availableMCPs.find(
                    (m) => m.id === match.mcpId || m.name === match.mcpName
                );
                return {
                    mcp: mcp || availableMCPs[0],
                    confidence: match.confidence || 0.5,
                    reason: match.reason || 'Matched by AI',
                    suggestedTools: match.suggestedTools || [],
                };
            });
        } catch {
            return [];
        }
    }

    private parseProviderSelectionResponse(content: string): ProviderSelectionResult {
        try {
            const data = JSON.parse(content);
            return {
                provider: data.provider || 'anthropic',
                model: data.model || 'claude-3-5-sonnet-20250219',
                estimatedCost: data.estimatedCost || 0,
                estimatedTime: data.estimatedTime || 0,
                reasoning: data.reasoning || 'Selected by AI',
                alternatives: data.alternatives || [],
            };
        } catch {
            return {
                provider: 'anthropic',
                model: 'claude-3-5-sonnet-20250219',
                estimatedCost: 0,
                estimatedTime: 0,
                reasoning: 'Default selection',
                alternatives: [],
            };
        }
    }

    private extractRequirements(content: string): RequirementGap[] {
        // Simple keyword-based extraction as fallback
        const requirements: RequirementGap[] = [];
        if (content.toLowerCase().includes('budget') || content.toLowerCase().includes('cost')) {
            requirements.push({
                category: 'constraints',
                question: 'What is your budget for this project?',
                importance: 'high',
            });
        }
        if (
            content.toLowerCase().includes('deadline') ||
            content.toLowerCase().includes('timeline')
        ) {
            requirements.push({
                category: 'timeline',
                question: 'What is your target completion date?',
                importance: 'high',
            });
        }
        return requirements;
    }

    private async fetchMatchingTemplates(
        _domain: string,
        _keywords: string[]
    ): Promise<Template[]> {
        // TODO: Implement actual database query
        // For now, return empty array
        return [];
    }

    private estimateComplexity(task: Task): TaskComplexity {
        const minutes = task.estimatedMinutes || 0;
        if (minutes < 60) return 'simple';
        if (minutes < 240) return 'medium';
        return 'complex';
    }

    /**
     * Create a new conversation context
     */
    createConversation(mainPrompt: string, userId: number): ConversationContext {
        const sessionId = nanoid();
        const context: ConversationContext = {
            sessionId,
            mainPrompt,
            messages: [
                {
                    role: 'user',
                    content: mainPrompt,
                    timestamp: new Date(),
                    metadata: { userId },
                },
            ],
            collectedInfo: {},
            currentPhase: 'initial',
        };
        this.conversationContexts.set(sessionId, context);
        return context;
    }

    /**
     * Update conversation context
     */
    updateConversation(sessionId: string, message: string, role: 'user' | 'assistant'): void {
        const context = this.conversationContexts.get(sessionId);
        if (context) {
            context.messages.push({
                role,
                content: message,
                timestamp: new Date(),
            });
        }
    }

    /**
     * Get conversation context
     */
    getConversation(sessionId: string): ConversationContext | undefined {
        return this.conversationContexts.get(sessionId);
    }
}
