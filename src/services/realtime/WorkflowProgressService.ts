/**
 * Workflow Progress Service
 *
 * Provides real-time progress updates for workflow execution.
 * Uses EventBus for internal communication and IPC for Electron integration.
 */

import { eventBus, type WorkflowProgressEvent, type WorkflowCompletedEvent } from '../events/EventBus';

// ========================================
// Types
// ========================================

export interface WorkflowProgressState {
  workflowId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  currentStage: number;
  totalStages: number;
  percentage: number;
  eta?: number;
  currentTask?: {
    id: number;
    title: string;
    status: 'preparing' | 'executing' | 'streaming' | 'completed' | 'failed';
  };
  totalCost: number;
  totalTokens: number;
  elapsedTime: number;
  startedAt?: Date;
  updatedAt: Date;
}

export interface ProgressSubscription {
  unsubscribe: () => void;
}

export type ProgressCallback = (progress: WorkflowProgressState) => void;
export type CompletionCallback = (result: {
  workflowId: string;
  status: 'completed' | 'failed' | 'cancelled' | 'partial';
  duration: number;
  totalCost: number;
  successCount: number;
  failureCount: number;
}) => void;

// ========================================
// WorkflowProgressService Class
// ========================================

class WorkflowProgressService {
  private progressStates: Map<string, WorkflowProgressState> = new Map();
  private subscribers: Map<string, Set<ProgressCallback>> = new Map();
  private completionSubscribers: Map<string, Set<CompletionCallback>> = new Map();
  private globalSubscribers: Set<ProgressCallback> = new Set();
  private globalCompletionSubscribers: Set<CompletionCallback> = new Set();
  private initialized = false;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize event listeners
   */
  private initialize(): void {
    if (this.initialized) return;

    // Listen to workflow progress events
    eventBus.on<WorkflowProgressEvent>('workflow.progress', (event) => {
      this.handleProgressUpdate(event);
    });

    // Listen to workflow completion events
    eventBus.on<WorkflowCompletedEvent>('workflow.completed', (event) => {
      this.handleCompletion(event);
    });

    // Listen to IPC events from Electron main process
    this.setupIPCListeners();

    this.initialized = true;
    console.log('[WorkflowProgressService] Initialized');
  }

  /**
   * Setup IPC listeners for Electron environment
   */
  private setupIPCListeners(): void {
    if (typeof window !== 'undefined' && window.electron?.events) {
      // Workflow progress from main process
      window.electron.events.on('workflow:progress', (data: any) => {
        if (data.workflowId && data.progress) {
          const state = this.progressStates.get(data.workflowId);
          if (state) {
            this.updateProgress(data.workflowId, data.progress);
          }
        }
      });

      // Workflow status changed from main process
      window.electron.events.on('workflow:status-changed', (data: any) => {
        if (data.workflowId && data.status) {
          const state = this.progressStates.get(data.workflowId);
          if (state) {
            state.status = data.status;
            state.updatedAt = new Date();
            this.notifySubscribers(data.workflowId, state);
          }
        }
      });

      // Task completed in workflow
      window.electron.events.on('workflow:task-completed', (data: any) => {
        if (data.workflowId && data.taskResult) {
          const state = this.progressStates.get(data.workflowId);
          if (state) {
            if (data.taskResult.status === 'success') {
              state.completedTasks++;
            } else {
              state.failedTasks++;
            }
            state.percentage = Math.round(
              ((state.completedTasks + state.failedTasks) / state.totalTasks) * 100
            );
            state.updatedAt = new Date();
            this.notifySubscribers(data.workflowId, state);
          }
        }
      });
    }
  }

  /**
   * Handle progress update from EventBus
   */
  private handleProgressUpdate(event: WorkflowProgressEvent): void {
    const { workflowId, currentStage, totalStages, completedTasks, totalTasks, percentage, eta } =
      event.payload;

    let state = this.progressStates.get(workflowId);
    if (!state) {
      state = this.createInitialState(workflowId);
      this.progressStates.set(workflowId, state);
    }

    state.currentStage = currentStage;
    state.totalStages = totalStages;
    state.completedTasks = completedTasks;
    state.totalTasks = totalTasks;
    state.percentage = percentage;
    state.eta = eta;
    state.status = 'running';
    state.updatedAt = new Date();

    if (state.startedAt) {
      state.elapsedTime = Date.now() - state.startedAt.getTime();
    }

    this.notifySubscribers(workflowId, state);
  }

  /**
   * Handle workflow completion
   */
  private handleCompletion(event: WorkflowCompletedEvent): void {
    const { workflowId, status, duration, totalCost, successCount, failureCount } = event.payload;

    const state = this.progressStates.get(workflowId);
    if (state) {
      state.status = status === 'partial' ? 'completed' : status;
      state.percentage = 100;
      state.elapsedTime = duration;
      state.totalCost = totalCost;
      state.updatedAt = new Date();
      this.notifySubscribers(workflowId, state);
    }

    // Notify completion subscribers
    const completionResult = {
      workflowId,
      status,
      duration,
      totalCost,
      successCount,
      failureCount,
    };

    // Workflow-specific subscribers
    const workflowSubscribers = this.completionSubscribers.get(workflowId);
    if (workflowSubscribers) {
      workflowSubscribers.forEach((callback) => {
        try {
          callback(completionResult);
        } catch (error) {
          console.error('[WorkflowProgressService] Error in completion callback:', error);
        }
      });
    }

    // Global completion subscribers
    this.globalCompletionSubscribers.forEach((callback) => {
      try {
        callback(completionResult);
      } catch (error) {
        console.error('[WorkflowProgressService] Error in global completion callback:', error);
      }
    });
  }

  /**
   * Create initial progress state
   */
  private createInitialState(workflowId: string): WorkflowProgressState {
    return {
      workflowId,
      status: 'pending',
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      currentStage: 0,
      totalStages: 0,
      percentage: 0,
      totalCost: 0,
      totalTokens: 0,
      elapsedTime: 0,
      updatedAt: new Date(),
    };
  }

  /**
   * Notify all subscribers of a workflow
   */
  private notifySubscribers(workflowId: string, state: WorkflowProgressState): void {
    // Workflow-specific subscribers
    const workflowSubscribers = this.subscribers.get(workflowId);
    if (workflowSubscribers) {
      workflowSubscribers.forEach((callback) => {
        try {
          callback(state);
        } catch (error) {
          console.error('[WorkflowProgressService] Error in subscriber callback:', error);
        }
      });
    }

    // Global subscribers
    this.globalSubscribers.forEach((callback) => {
      try {
        callback(state);
      } catch (error) {
        console.error('[WorkflowProgressService] Error in global subscriber callback:', error);
      }
    });
  }

  // ========================================
  // Public API
  // ========================================

  /**
   * Start tracking a workflow
   */
  startTracking(
    workflowId: string,
    initialData?: Partial<WorkflowProgressState>
  ): void {
    const state: WorkflowProgressState = {
      ...this.createInitialState(workflowId),
      ...initialData,
      startedAt: new Date(),
      status: 'running',
    };
    this.progressStates.set(workflowId, state);
    this.notifySubscribers(workflowId, state);
    console.log(`[WorkflowProgressService] Started tracking workflow: ${workflowId}`);
  }

  /**
   * Update progress for a workflow
   */
  updateProgress(
    workflowId: string,
    update: Partial<WorkflowProgressState>
  ): void {
    let state = this.progressStates.get(workflowId);
    if (!state) {
      state = this.createInitialState(workflowId);
      this.progressStates.set(workflowId, state);
    }

    Object.assign(state, update, { updatedAt: new Date() });

    if (state.startedAt) {
      state.elapsedTime = Date.now() - state.startedAt.getTime();
    }

    this.notifySubscribers(workflowId, state);
  }

  /**
   * Update current task being executed
   */
  updateCurrentTask(
    workflowId: string,
    task: WorkflowProgressState['currentTask']
  ): void {
    const state = this.progressStates.get(workflowId);
    if (state) {
      state.currentTask = task;
      state.updatedAt = new Date();
      this.notifySubscribers(workflowId, state);
    }
  }

  /**
   * Stop tracking a workflow
   */
  stopTracking(workflowId: string): void {
    this.progressStates.delete(workflowId);
    this.subscribers.delete(workflowId);
    this.completionSubscribers.delete(workflowId);
    console.log(`[WorkflowProgressService] Stopped tracking workflow: ${workflowId}`);
  }

  /**
   * Get current progress state for a workflow
   */
  getProgress(workflowId: string): WorkflowProgressState | undefined {
    return this.progressStates.get(workflowId);
  }

  /**
   * Get all active workflow progresses
   */
  getAllProgress(): WorkflowProgressState[] {
    return Array.from(this.progressStates.values()).filter(
      (state) => state.status === 'running' || state.status === 'paused'
    );
  }

  /**
   * Subscribe to progress updates for a specific workflow
   */
  subscribe(workflowId: string, callback: ProgressCallback): ProgressSubscription {
    if (!this.subscribers.has(workflowId)) {
      this.subscribers.set(workflowId, new Set());
    }
    this.subscribers.get(workflowId)!.add(callback);

    // Immediately call with current state if available
    const currentState = this.progressStates.get(workflowId);
    if (currentState) {
      callback(currentState);
    }

    return {
      unsubscribe: () => {
        this.subscribers.get(workflowId)?.delete(callback);
      },
    };
  }

  /**
   * Subscribe to all workflow progress updates
   */
  subscribeAll(callback: ProgressCallback): ProgressSubscription {
    this.globalSubscribers.add(callback);

    return {
      unsubscribe: () => {
        this.globalSubscribers.delete(callback);
      },
    };
  }

  /**
   * Subscribe to workflow completion
   */
  onComplete(
    workflowId: string,
    callback: CompletionCallback
  ): ProgressSubscription {
    if (!this.completionSubscribers.has(workflowId)) {
      this.completionSubscribers.set(workflowId, new Set());
    }
    this.completionSubscribers.get(workflowId)!.add(callback);

    return {
      unsubscribe: () => {
        this.completionSubscribers.get(workflowId)?.delete(callback);
      },
    };
  }

  /**
   * Subscribe to all workflow completions
   */
  onAnyComplete(callback: CompletionCallback): ProgressSubscription {
    this.globalCompletionSubscribers.add(callback);

    return {
      unsubscribe: () => {
        this.globalCompletionSubscribers.delete(callback);
      },
    };
  }
}

// Export singleton instance
export const workflowProgressService = new WorkflowProgressService();

// Export for composables
export function useWorkflowProgress(workflowId: string) {
  return {
    getProgress: () => workflowProgressService.getProgress(workflowId),
    subscribe: (callback: ProgressCallback) =>
      workflowProgressService.subscribe(workflowId, callback),
    onComplete: (callback: CompletionCallback) =>
      workflowProgressService.onComplete(workflowId, callback),
  };
}

export function useAllWorkflowProgress() {
  return {
    getAllProgress: () => workflowProgressService.getAllProgress(),
    subscribeAll: (callback: ProgressCallback) =>
      workflowProgressService.subscribeAll(callback),
    onAnyComplete: (callback: CompletionCallback) =>
      workflowProgressService.onAnyComplete(callback),
  };
}
