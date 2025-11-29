/**
 * LangChain Orchestrator
 *
 * Orchestrates complex AI workflows using LangChain-inspired patterns
 */

import type {
  ChainConfig,
  ChainStep,
  MemoryConfig,
  AgentConfig,
  AgentResult,
  AgentStep,
  AIConfig,
} from '@core/types/ai';
import { ProviderFactory } from './providers/ProviderFactory';

interface ChainContext {
  variables: Record<string, any>;
  history: Array<{ step: string; input: any; output: any }>;
  metadata: Record<string, any>;
}

export class LangChainOrchestrator {
  private providerFactory: ProviderFactory;
  private memory: Map<string, any[]>;

  constructor() {
    this.providerFactory = new ProviderFactory();
    this.memory = new Map();
  }

  /**
   * Execute a chain of AI operations
   */
  async executeChain(
    config: ChainConfig,
    initialInput: Record<string, any>
  ): Promise<any> {
    const context: ChainContext = {
      variables: { ...initialInput },
      history: [],
      metadata: {},
    };

    // Notify start
    config.callbacks?.onStart?.(context);

    try {
      // Execute steps sequentially or based on dependencies
      for (const step of config.steps) {
        await this.executeStep(step, context, config);

        // Notify progress
        config.callbacks?.onProgress?.({
          step: step.name,
          context,
        });
      }

      // Notify completion
      config.callbacks?.onComplete?.(context);

      return context.variables;
    } catch (error) {
      // Notify error
      config.callbacks?.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Execute a single chain step
   */
  private async executeStep(
    step: ChainStep,
    context: ChainContext,
    config: ChainConfig
  ): Promise<void> {
    // Check condition if present
    if (step.condition && !step.condition(context.variables)) {
      console.log(`Skipping step ${step.name} - condition not met`);
      return;
    }

    let result: any;

    switch (step.type) {
      case 'llm':
        result = await this.executeLLMStep(step, context, config.memory);
        break;

      case 'tool':
        result = await this.executeToolStep(step, context);
        break;

      case 'transform':
        result = await this.executeTransformStep(step, context);
        break;

      case 'conditional':
        result = await this.executeConditionalStep(step, context, config);
        break;

      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }

    // Store result in context
    context.variables[step.name] = result;

    // Add to history
    context.history.push({
      step: step.name,
      input: step.config,
      output: result,
    });

    // Update memory if configured
    if (config.memory) {
      this.updateMemory(config.name, step, result, config.memory);
    }
  }

  /**
   * Execute LLM step
   */
  private async executeLLMStep(
    step: ChainStep,
    context: ChainContext,
    memoryConfig?: MemoryConfig
  ): Promise<string> {
    const provider = await this.providerFactory.getProvider(
      step.config.provider || 'anthropic'
    );

    // Build prompt with variables substitution
    const prompt = this.substituteVariables(step.config.prompt, context.variables);

    // Build system prompt with memory
    let systemPrompt = step.config.systemPrompt || '';
    if (memoryConfig) {
      const memoryContext = this.buildMemoryContext(step.name, memoryConfig);
      systemPrompt += memoryContext;
    }

    const aiConfig: AIConfig = {
      model: step.config.model,
      temperature: step.config.temperature || 0.7,
      maxTokens: step.config.maxTokens || 2000,
      systemPrompt,
    };

    const response = await provider.execute(prompt, aiConfig, {
      userId: 0,
      metadata: {
        chainStep: step.name,
      },
    });

    return response.content;
  }

  /**
   * Execute tool step
   */
  private async executeToolStep(step: ChainStep, context: ChainContext): Promise<any> {
    const toolFn = step.config.tool;
    if (typeof toolFn !== 'function') {
      throw new Error(`Tool ${step.name} is not a function`);
    }

    const params = this.substituteVariables(step.config.params, context.variables);
    return await toolFn(params);
  }

  /**
   * Execute transform step
   */
  private async executeTransformStep(step: ChainStep, context: ChainContext): Promise<any> {
    const transformFn = step.config.transform;
    if (typeof transformFn !== 'function') {
      throw new Error(`Transform ${step.name} is not a function`);
    }

    return await transformFn(context.variables);
  }

  /**
   * Execute conditional step
   */
  private async executeConditionalStep(
    step: ChainStep,
    context: ChainContext,
    config: ChainConfig
  ): Promise<any> {
    const conditionResult = step.config.condition(context.variables);

    if (conditionResult && step.config.thenStep) {
      const thenStep = config.steps.find((s) => s.name === step.config.thenStep);
      if (thenStep) {
        await this.executeStep(thenStep, context, config);
      }
    } else if (!conditionResult && step.config.elseStep) {
      const elseStep = config.steps.find((s) => s.name === step.config.elseStep);
      if (elseStep) {
        await this.executeStep(elseStep, context, config);
      }
    }

    return conditionResult;
  }

  /**
   * Execute an agent with autonomous tool selection
   */
  async executeAgent(agentConfig: AgentConfig, initialInput: string): Promise<AgentResult> {
    const steps: AgentStep[] = [];
    let totalTokens = 0;
    let totalCost = 0;
    const startTime = Date.now();

    let currentInput = initialInput;
    let iteration = 0;

    const provider = await this.providerFactory.getProvider('anthropic');

    while (iteration < agentConfig.maxIterations) {
      iteration++;

      // Build agent prompt based on thinking mode
      const agentPrompt = this.buildAgentPrompt(
        agentConfig,
        currentInput,
        steps,
        iteration
      );

      // Get AI response
      const response = await provider.execute(
        agentPrompt,
        {
          model: 'claude-3-5-sonnet-20250219',
          temperature: 0.7,
          maxTokens: 2000,
          systemPrompt: this.buildAgentSystemPrompt(agentConfig),
        },
        {
          userId: 0,
          metadata: {
            agent: agentConfig.name,
            iteration,
          },
        }
      );

      totalTokens += response.tokensUsed.total;
      totalCost += response.cost;

      // Parse agent response
      const agentStep = this.parseAgentResponse(response.content, iteration);
      steps.push(agentStep);

      // Check if agent wants to finish
      if (agentStep.action === 'FINISH' || agentStep.action === 'Final Answer') {
        return {
          success: true,
          finalAnswer: agentStep.observation || agentStep.thought,
          steps,
          tokensUsed: totalTokens,
          cost: totalCost,
          duration: Date.now() - startTime,
        };
      }

      // Execute the selected tool
      try {
        const tool = agentConfig.tools.find((t) => t.name === agentStep.action);
        if (!tool) {
          agentStep.observation = `Error: Tool ${agentStep.action} not found`;
        } else {
          const toolResult = await tool.execute(agentStep.actionInput);
          agentStep.observation = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2);
        }
      } catch (error) {
        agentStep.observation = `Error executing tool: ${(error as Error).message}`;
      }

      // Update current input for next iteration
      currentInput = agentStep.observation;
    }

    // Max iterations reached
    return {
      success: false,
      finalAnswer: `Failed to complete task within ${agentConfig.maxIterations} iterations`,
      steps,
      tokensUsed: totalTokens,
      cost: totalCost,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Build agent system prompt
   */
  private buildAgentSystemPrompt(config: AgentConfig): string {
    let prompt = `You are an autonomous AI agent with the objective: "${config.objective}"\n\n`;

    prompt += '## Available Tools\n\n';
    config.tools.forEach((tool) => {
      prompt += `### ${tool.name}\n`;
      prompt += `${tool.description}\n\n`;
    });

    prompt += '\n## Response Format\n\n';

    switch (config.thinkingMode) {
      case 'react':
        prompt += `Use the ReAct format:

Thought: [Your reasoning about what to do next]
Action: [Tool name or FINISH]
Action Input: {json parameters}
Observation: [Will be filled automatically with tool result]

When you have the final answer, use:
Action: FINISH
Action Input: {"answer": "your final answer"}`;
        break;

      case 'plan-and-execute':
        prompt += `First create a plan, then execute it step by step.

1. Thought: Create a plan with numbered steps
2. For each step, use:
   Action: [Tool name]
   Action Input: {json parameters}
   Observation: [Tool result]
3. When done:
   Action: FINISH
   Action Input: {"answer": "your final answer"}`;
        break;

      case 'reflection':
        prompt += `Think, act, then reflect on the result.

Thought: [What you'll do]
Action: [Tool name]
Action Input: {json parameters}
Observation: [Tool result]
Reflection: [Evaluate if this helped and what to do next]

When satisfied with the answer:
Action: FINISH
Action Input: {"answer": "your final answer"}`;
        break;
    }

    return prompt;
  }

  /**
   * Build agent prompt for current iteration
   */
  private buildAgentPrompt(
    config: AgentConfig,
    input: string,
    previousSteps: AgentStep[],
    iteration: number
  ): string {
    let prompt = `Objective: ${config.objective}\n\n`;
    prompt += `Current Input: ${input}\n\n`;

    if (previousSteps.length > 0) {
      prompt += '## Previous Steps\n\n';
      previousSteps.forEach((step) => {
        prompt += `Thought: ${step.thought}\n`;
        prompt += `Action: ${step.action}\n`;
        prompt += `Action Input: ${JSON.stringify(step.actionInput)}\n`;
        prompt += `Observation: ${step.observation}\n\n`;
      });
    }

    prompt += `\n## Iteration ${iteration}/${config.maxIterations}\n\n`;
    prompt += 'What should you do next?\n';

    return prompt;
  }

  /**
   * Parse agent response into structured step
   */
  private parseAgentResponse(content: string, iteration: number): AgentStep {
    const step: AgentStep = {
      thought: '',
      action: '',
      actionInput: {},
      observation: '',
      iteration,
    };

    // Extract Thought
    const thoughtMatch = content.match(/Thought:\s*(.+?)(?=\n|Action:|$)/s);
    if (thoughtMatch?.[1]) {
      step.thought = thoughtMatch[1].trim();
    }

    // Extract Action
    const actionMatch = content.match(/Action:\s*(.+?)(?=\n|Action Input:|$)/s);
    if (actionMatch?.[1]) {
      step.action = actionMatch[1].trim();
    }

    // Extract Action Input
    const actionInputMatch = content.match(/Action Input:\s*(\{[\s\S]*?\})/);
    if (actionInputMatch?.[1]) {
      try {
        step.actionInput = JSON.parse(actionInputMatch[1]);
      } catch {
        step.actionInput = { raw: actionInputMatch[1] };
      }
    }

    return step;
  }

  /**
   * Substitute variables in template string
   */
  private substituteVariables(template: any, variables: Record<string, any>): any {
    if (typeof template === 'string') {
      return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        return variables[key] !== undefined ? variables[key] : `{{${key}}}`;
      });
    }

    if (typeof template === 'object' && template !== null) {
      const result: any = Array.isArray(template) ? [] : {};
      for (const key in template) {
        result[key] = this.substituteVariables(template[key], variables);
      }
      return result;
    }

    return template;
  }

  /**
   * Build memory context
   */
  private buildMemoryContext(chainName: string, config: MemoryConfig): string {
    const memories = this.memory.get(chainName) || [];
    if (memories.length === 0) return '';

    let context = '\n\n## Conversation History\n\n';

    if (config.type === 'buffer') {
      // Simple buffer: show last N messages
      const recent = memories.slice(-5);
      recent.forEach((mem, i) => {
        context += `${i + 1}. ${JSON.stringify(mem)}\n`;
      });
    } else if (config.type === 'summary') {
      // Summary: show summarized history
      context += 'Previous conversation summary:\n';
      context += memories[memories.length - 1]?.summary || 'No summary yet';
    }

    return context;
  }

  /**
   * Update memory
   */
  private updateMemory(
    chainName: string,
    step: ChainStep,
    result: any,
    config: MemoryConfig
  ): void {
    if (!this.memory.has(chainName)) {
      this.memory.set(chainName, []);
    }

    const memories = this.memory.get(chainName)!;
    memories.push({
      step: step.name,
      result,
      timestamp: new Date(),
    });

    // Apply memory limits
    if (config.maxTokens && memories.length > 10) {
      memories.shift();
    }
  }

  /**
   * Clear memory for a chain
   */
  clearMemory(chainName: string): void {
    this.memory.delete(chainName);
  }

  /**
   * Get memory for a chain
   */
  getMemory(chainName: string): any[] {
    return this.memory.get(chainName) || [];
  }
}
