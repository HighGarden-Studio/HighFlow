import { OutputTaskConfig } from '@core/types/database';

export interface OutputResult {
    success: boolean;
    data?: any; // e.g. { url: string, fileId: string }
    error?: string;
    metadata?: any;
}

export interface OutputConnector {
    readonly id: string;

    /**
     * Validate the configuration for this connector
     */
    validate(config: OutputTaskConfig): Promise<boolean>;

    /**
     * Execute the output operation
     * @param config The output task configuration
     * @param content The content to output (aggregated result)
     * @param context Additional context (projectId, taskId, etc.)
     */
    execute(config: OutputTaskConfig, content: string, context?: any): Promise<OutputResult>;
}
