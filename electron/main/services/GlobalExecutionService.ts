/**
 * Global Execution Service
 *
 * Manages global execution state (e.g., Pause All).
 * This service is a singleton to ensure state consistency across IPC handlers.
 */
export class GlobalExecutionService {
    private static instance: GlobalExecutionService;
    private isPaused: boolean = false;

    private constructor() {}

    public static getInstance(): GlobalExecutionService {
        if (!GlobalExecutionService.instance) {
            GlobalExecutionService.instance = new GlobalExecutionService();
        }
        return GlobalExecutionService.instance;
    }

    /**
     * Check if global execution is paused
     */
    public isGlobalPaused(): boolean {
        return this.isPaused;
    }

    /**
     * Set global pause state
     */
    public setGlobalPause(paused: boolean): void {
        this.isPaused = paused;
        console.log(`[GlobalExecutionService] Global Execution Paused: ${this.isPaused}`);
    }

    /**
     * Toggle global pause state
     */
    public toggleGlobalPause(): boolean {
        this.isPaused = !this.isPaused;
        console.log(`[GlobalExecutionService] Global Execution Paused: ${this.isPaused}`);
        return this.isPaused;
    }
}
