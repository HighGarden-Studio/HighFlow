/**
 * TaskKey - Composite Key for Task Identification
 *
 * Used instead of global auto-increment ID to support:
 * - Marketplace: Tasks can be shared without ID conflicts
 * - Export/Import: Projects are fully portable across systems
 * - Multi-project: Each project has independent task sequences
 */

export interface TaskKey {
    projectId: number;
    projectSequence: number;
}

/**
 * Convert TaskKey to string for use as Map key
 * @example taskKeyToString({ projectId: 1, projectSequence: 5 }) => "1-5"
 */
export function taskKeyToString(key: TaskKey): string {
    return `${key.projectId}-${key.projectSequence}`;
}

/**
 * Parse string back to TaskKey
 * @example stringToTaskKey("1-5") => { projectId: 1, projectSequence: 5 }
 */
export function stringToTaskKey(str: string): TaskKey {
    const parts = str.split('-');
    if (parts.length < 2) {
        throw new Error(`Invalid TaskKey string format: ${str}`);
    }
    const projectId = parseInt(parts[0]!, 10);
    const projectSequence = parseInt(parts[1]!, 10);

    if (isNaN(projectId) || isNaN(projectSequence)) {
        throw new Error(`Invalid TaskKey string format: ${str}`);
    }
    return { projectId, projectSequence };
}

/**
 * Check if two TaskKeys are equal
 */
export function taskKeyEquals(a: TaskKey, b: TaskKey): boolean {
    return a.projectId === b.projectId && a.projectSequence === b.projectSequence;
}
