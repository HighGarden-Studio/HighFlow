import type { InputProvider, ExecutionContext } from '../InputProvider';
import type { Task, TaskOutput } from '../../../../core/types/database';

export class UserInputProvider implements InputProvider {
    canHandle(task: Task): boolean {
        // If task type is not input, we definitely don't handle it
        if (task.taskType !== 'input') return false;

        let config = task.inputConfig;

        // Handle stringified config
        if (typeof config === 'string') {
            try {
                config = JSON.parse(config);
            } catch {
                return false;
            }
        }

        // If config is missing/null, treat as USER_INPUT by default
        if (!config) return true;

        // If sourceType is missing, treat as USER_INPUT by default
        if (!(config as any).sourceType) return true;

        // Otherwise check explicit sourceType
        return (config as any)?.sourceType === 'USER_INPUT';
    }

    async start(task: Task, _ctx: ExecutionContext): Promise<void> {
        // In a real implementation, this might emit a socket event to the UI
        // or update a specific 'waitingForInput' state in the DB.
        // For MVP, the task status 'in_progress' combined with taskType 'input'
        // is enough for the UI to render the input form.
        console.log(`[UserInputProvider] Task ${task.id} is waiting for user input.`);
    }

    async validate(task: Task, payload: any): Promise<{ valid: boolean; error?: string }> {
        const config = task.inputConfig?.userInput;

        // If no config, accept any non-empty input
        if (!config) {
            const value = payload?.value || payload;
            if (!value || value === '') {
                return { valid: false, error: 'Input is required' };
            }
            return { valid: true };
        }

        if (config.mode === 'confirm') {
            // For confirm mode, check if confirmed property exists
            if (config.required && !payload?.confirmed) {
                return { valid: false, error: 'Confirmation is required' };
            }
            return { valid: true };
        }

        // For text input modes, check the value property
        const value = payload?.value || payload;
        if (config.required && (value === undefined || value === null || value === '')) {
            return { valid: false, error: 'Input is required' };
        }

        return { valid: true };
    }

    async submit(task: Task, payload: any): Promise<TaskOutput> {
        const config = task.inputConfig?.userInput;
        const mode = config?.mode || 'short';

        if (mode === 'confirm') {
            const confirmed = payload?.confirmed || false;
            return {
                kind: 'text',
                text: confirmed ? '확인됨 ✓' : '확인 안됨',
                mimeType: 'text/plain',
                metadata: { source: 'user_input', mode: 'confirm', confirmed },
            };
        }

        // Extract value from payload object
        const inputValue = payload?.value || payload;
        return {
            kind: 'text',
            text: String(inputValue),
            mimeType: 'text/plain',
            metadata: { source: 'user_input', mode },
        };
    }

    async cancel(task: Task): Promise<void> {
        console.log(`[UserInputProvider] Input cancelled for task ${task.id}`);
    }
}
