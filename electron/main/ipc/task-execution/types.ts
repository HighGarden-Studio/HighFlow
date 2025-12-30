import type { TaskKey } from '../../database/helpers/task-key';

// Execution state tracking
export interface ExecutionState {
    taskKey: TaskKey; // (projectId, projectSequence)
    status: 'running' | 'paused' | 'stopped' | 'completed' | 'failed' | 'needs_approval';
    startedAt: Date;
    pausedAt?: Date;
    progress: number;
    currentPhase: string;
    streamContent: string;
    error?: string;
}

// Review state tracking
export interface ReviewState {
    taskKey: TaskKey; // (projectId, projectSequence)
    status: 'reviewing' | 'completed' | 'failed';
    startedAt: Date;
    progress: number;
    streamContent: string;
    error?: string;
}
