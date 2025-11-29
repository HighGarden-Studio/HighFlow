/**
 * Task AI Inheritance Service
 *
 * Handles inheritance of AI settings from project to tasks.
 * When a task is created or executed, it can inherit the project's
 * AI provider and model settings as defaults.
 */

// ========================================
// Types
// ========================================

export interface ProjectAISettings {
  aiProvider?: string | null;
  aiModel?: string | null;
}

export interface TaskAISettings {
  aiProvider?: string | null;
  model?: string;
}

export interface InheritedSettings {
  aiProvider: string;
  aiModel: string;
  inherited: boolean;
  source: 'task' | 'project' | 'default';
}

// Default AI settings when nothing is configured
const DEFAULT_AI_SETTINGS = {
  aiProvider: 'anthropic',
  aiModel: 'claude-3-5-sonnet',
};

// Provider to default model mapping
const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-3-5-sonnet',
  openai: 'gpt-4-turbo',
  google: 'gemini-pro',
  local: 'llama2',
};

// ========================================
// Service Class
// ========================================

class TaskAIInheritanceService {
  /**
   * Get the effective AI settings for a task, considering inheritance
   */
  getEffectiveSettings(
    taskSettings?: TaskAISettings,
    projectSettings?: ProjectAISettings
  ): InheritedSettings {
    // 1. Task has explicit settings - use them
    if (taskSettings?.aiProvider) {
      return {
        aiProvider: taskSettings.aiProvider,
        aiModel: taskSettings.model || this.getDefaultModel(taskSettings.aiProvider),
        inherited: false,
        source: 'task',
      };
    }

    // 2. Project has settings - inherit from project
    if (projectSettings?.aiProvider) {
      return {
        aiProvider: projectSettings.aiProvider,
        aiModel: projectSettings.aiModel || this.getDefaultModel(projectSettings.aiProvider),
        inherited: true,
        source: 'project',
      };
    }

    // 3. Use global defaults
    return {
      aiProvider: DEFAULT_AI_SETTINGS.aiProvider,
      aiModel: DEFAULT_AI_SETTINGS.aiModel,
      inherited: true,
      source: 'default',
    };
  }

  /**
   * Get default model for a provider
   */
  getDefaultModel(provider: string): string {
    return PROVIDER_DEFAULT_MODELS[provider] || DEFAULT_AI_SETTINGS.aiModel;
  }

  /**
   * Prepare task data with inherited AI settings
   * Call this before creating or executing a task
   */
  async prepareTaskWithInheritance(
    taskData: {
      projectId: number;
      aiProvider?: string | null;
    },
    projectSettings?: ProjectAISettings
  ): Promise<{
    aiProvider: string;
    aiModel: string;
    inheritedFrom?: 'project' | 'default';
  }> {
    // If task has explicit provider, don't inherit
    if (taskData.aiProvider) {
      return {
        aiProvider: taskData.aiProvider,
        aiModel: this.getDefaultModel(taskData.aiProvider),
      };
    }

    // Try to get project settings if not provided
    let settings = projectSettings;
    if (!settings) {
      settings = await this.fetchProjectSettings(taskData.projectId);
    }

    const effective = this.getEffectiveSettings(undefined, settings);

    return {
      aiProvider: effective.aiProvider,
      aiModel: effective.aiModel,
      inheritedFrom: effective.source === 'task' ? undefined : effective.source as 'project' | 'default',
    };
  }

  /**
   * Fetch project AI settings from database
   */
  private async fetchProjectSettings(projectId: number): Promise<ProjectAISettings | undefined> {
    if (typeof window !== 'undefined' && window.electron?.projects) {
      try {
        const project = await window.electron.projects.get(projectId);
        if (project) {
          return {
            aiProvider: project.aiProvider,
            aiModel: project.aiModel,
          };
        }
      } catch (error) {
        console.error('[TaskAIInheritanceService] Failed to fetch project settings:', error);
      }
    }
    return undefined;
  }

  /**
   * Check if task is using inherited settings
   */
  isUsingInheritedSettings(
    taskSettings?: TaskAISettings,
    projectSettings?: ProjectAISettings
  ): boolean {
    const effective = this.getEffectiveSettings(taskSettings, projectSettings);
    return effective.inherited;
  }

  /**
   * Get available AI providers with their models
   */
  getAvailableProviders(): {
    id: string;
    name: string;
    models: { id: string; name: string }[];
  }[] {
    return [
      {
        id: 'anthropic',
        name: 'Anthropic',
        models: [
          { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
          { id: 'claude-3-opus', name: 'Claude 3 Opus' },
          { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet' },
          { id: 'claude-3-haiku', name: 'Claude 3 Haiku' },
        ],
      },
      {
        id: 'openai',
        name: 'OpenAI',
        models: [
          { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
          { id: 'gpt-4', name: 'GPT-4' },
          { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
        ],
      },
      {
        id: 'google',
        name: 'Google AI',
        models: [
          { id: 'gemini-pro', name: 'Gemini Pro' },
          { id: 'gemini-ultra', name: 'Gemini Ultra' },
        ],
      },
      {
        id: 'local',
        name: 'Local',
        models: [
          { id: 'llama2', name: 'Llama 2' },
          { id: 'mistral', name: 'Mistral' },
          { id: 'codellama', name: 'Code Llama' },
        ],
      },
    ];
  }

  /**
   * Get models for a specific provider
   */
  getModelsForProvider(providerId: string): { id: string; name: string }[] {
    const provider = this.getAvailableProviders().find(p => p.id === providerId);
    return provider?.models || [];
  }
}

// Export singleton instance
export const taskAIInheritanceService = new TaskAIInheritanceService();

// Export for composables
export function useTaskAIInheritance() {
  return {
    getEffectiveSettings: (
      taskSettings?: TaskAISettings,
      projectSettings?: ProjectAISettings
    ) => taskAIInheritanceService.getEffectiveSettings(taskSettings, projectSettings),
    prepareTaskWithInheritance: (
      taskData: { projectId: number; aiProvider?: string | null },
      projectSettings?: ProjectAISettings
    ) => taskAIInheritanceService.prepareTaskWithInheritance(taskData, projectSettings),
    isUsingInheritedSettings: (
      taskSettings?: TaskAISettings,
      projectSettings?: ProjectAISettings
    ) => taskAIInheritanceService.isUsingInheritedSettings(taskSettings, projectSettings),
    getAvailableProviders: () => taskAIInheritanceService.getAvailableProviders(),
    getModelsForProvider: (providerId: string) =>
      taskAIInheritanceService.getModelsForProvider(providerId),
    getDefaultModel: (provider: string) =>
      taskAIInheritanceService.getDefaultModel(provider),
  };
}
