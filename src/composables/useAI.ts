/**
 * AI Service Composable
 *
 * Vue composable for AI service integration
 */

import { ref } from 'vue';
import type { TaskDecompositionResult } from '@core/types/ai';
import type { Task, Template } from '@core/types/database';
import { AdvancedAIEngine } from '../services/ai';

export function useAI() {
  const engine = new AdvancedAIEngine();

  const isAnalyzing = ref(false);
  const isDecomposing = ref(false);
  const isExecuting = ref(false);
  const error = ref<string | null>(null);

  /**
   * Analyze a project prompt
   */
  async function analyzePrompt(prompt: string, userId: number) {
    isAnalyzing.value = true;
    error.value = null;

    try {
      const analysis = await engine.analyzeMainPrompt(prompt, {
        userId,
        preferences: {},
        skillLevel: 'intermediate',
        recentProjects: [],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      return analysis;
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      isAnalyzing.value = false;
    }
  }

  /**
   * Generate follow-up questions
   */
  async function generateQuestions(sessionId: string, previousAnswers: any[]) {
    const conversation = engine.getConversation(sessionId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    return await engine.generateFollowUpQuestions(conversation, previousAnswers);
  }

  /**
   * Decompose requirements into tasks
   */
  async function decomposeTasks(
    prompt: string,
    answers: any[],
    template?: Template
  ): Promise<TaskDecompositionResult> {
    isDecomposing.value = true;
    error.value = null;

    try {
      const requirement = await engine.synthesizeRequirements(prompt, answers, template);
      const decomposition = await engine.decomposeTasks(requirement);
      return decomposition;
    } catch (err) {
      error.value = (err as Error).message;
      throw err;
    } finally {
      isDecomposing.value = false;
    }
  }

  /**
   * Recommend skills for a task
   */
  async function recommendSkills(task: Task, availableSkills: any[]) {
    return await engine.recommendSkills(task, availableSkills);
  }

  /**
   * Select optimal AI provider
   */
  async function selectProvider(task: Task, constraints: any) {
    return await engine.selectOptimalProvider(task, constraints);
  }

  /**
   * Create conversation session
   */
  function createConversation(prompt: string, userId: number) {
    return engine.createConversation(prompt, userId);
  }

  return {
    // State
    isAnalyzing,
    isDecomposing,
    isExecuting,
    error,

    // Methods
    analyzePrompt,
    generateQuestions,
    decomposeTasks,
    recommendSkills,
    selectProvider,
    createConversation,
  };
}
