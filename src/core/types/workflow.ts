/**
 * Script Task Control Flow Types
 *
 * Defines the contract for Script Task return values and control flow.
 * Enables explicit DAG branching and conditional execution.
 */

/**
 * Control flow directive for Script Tasks
 */
export interface ControlFlow {
    /**
     * Array of task projectSequence IDs to execute next.
     * - null or [] = terminal node (workflow stops)
     * - [1, 2] = execute tasks 1 and 2
     */
    next?: number[] | null;

    /**
     * Human-readable explanation for this control flow decision.
     * Displayed in DAG edges and Kanban cards.
     */
    reason?: string;
}

/**
 * Authoritative return type for Script Tasks
 *
 * Every Script Task MUST return this structure.
 *
 * @example
 * // Conditional branching
 * if (isValid) {
 *   return {
 *     result: validatedData,
 *     control: { next: [5], reason: 'validation passed' }
 *   };
 * }
 *
 * return {
 *   result: errors,
 *   control: { next: [7], reason: 'validation failed' }
 * };
 *
 * @example
 * // Terminal node (stop workflow)
 * return {
 *   result: { message: 'no action required' },
 *   control: { next: [], reason: 'condition not met' }
 * };
 */
export interface ScriptTaskReturn {
    /**
     * The actual output of this task (mandatory).
     * Always stored as the task's result.
     */
    result: any;

    /**
     * Control flow directive (optional).
     * If omitted, default dependency resolution is used.
     */
    control?: ControlFlow;
}

/**
 * Parse script output into ScriptTaskReturn format
 * Handles legacy formats for backward compatibility
 *
 * @param output Raw script output (string or JSON)
 * @returns Normalized ScriptTaskReturn
 */
export function parseScriptReturn(output: string | any): ScriptTaskReturn {
    // Already parsed object
    if (typeof output === 'object' && output !== null) {
        if (output.hasOwnProperty('result')) {
            return output as ScriptTaskReturn;
        }
        // Legacy object format - wrap it
        return { result: output };
    }

    // Try parsing as JSON
    if (typeof output === 'string') {
        try {
            const parsed = JSON.parse(output);

            // Check if it's ScriptTaskReturn format
            if (parsed.hasOwnProperty('result')) {
                return parsed as ScriptTaskReturn;
            }

            // Legacy JSON format - wrap it
            return { result: parsed };
        } catch {
            // Non-JSON string - wrap as-is
            return { result: output };
        }
    }

    // Fallback for other types
    return { result: output };
}

/**
 * Validate control flow structure
 *
 * @param control Control flow to validate
 * @returns Validation result with error message
 */
export function validateControlFlow(control: ControlFlow): { valid: boolean; error?: string } {
    if (!control) {
        return { valid: true }; // Optional field
    }

    // next can be undefined, null, or array
    if (control.next !== undefined && control.next !== null) {
        if (!Array.isArray(control.next)) {
            return { valid: false, error: 'control.next must be an array, null, or undefined' };
        }

        // Validate array elements are numbers
        if (!control.next.every((id) => typeof id === 'number')) {
            return {
                valid: false,
                error: 'control.next must contain only numbers (projectSequence IDs)',
            };
        }
    }

    // reason is optional string
    if (control.reason !== undefined && typeof control.reason !== 'string') {
        return { valid: false, error: 'control.reason must be a string' };
    }

    return { valid: true };
}
