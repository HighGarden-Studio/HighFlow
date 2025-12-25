/**
 * Global Execution Service
 *
 * Manages global execution state (e.g., Pause All).
 * This service is a singleton to ensure state consistency across IPC handlers.
 */
export class GlobalExecutionService {
    private static instance: GlobalExecutionService;
    private pausedProjects: Set<number> = new Set();

    private constructor() {}

    public static getInstance(): GlobalExecutionService {
        if (!GlobalExecutionService.instance) {
            GlobalExecutionService.instance = new GlobalExecutionService();
        }
        return GlobalExecutionService.instance;
    }

    /**
     * Check if execution is paused for a specific project
     */
    public isProjectPaused(projectId: number): boolean {
        return this.pausedProjects.has(projectId);
    }

    /**
     * Set pause state for a specific project
     */
    public setProjectPause(projectId: number, paused: boolean): void {
        if (paused) {
            this.pausedProjects.add(projectId);
        } else {
            this.pausedProjects.delete(projectId);
        }
        console.log(
            `[GlobalExecutionService] Project ${projectId} Execution Paused: ${this.isProjectPaused(projectId)}`
        );
    }

    /**
     * Toggle pause state for a specific project
     */
    public toggleProjectPause(projectId: number): boolean {
        const isPaused = this.isProjectPaused(projectId);
        this.setProjectPause(projectId, !isPaused);
        return !isPaused;
    }
}
