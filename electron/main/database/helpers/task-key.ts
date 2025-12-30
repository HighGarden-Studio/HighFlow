/**
 * Task Composite Key Utilities
 *
 * 태스크는 이제 (projectId, projectSequence) 복합 키로만 식별됩니다.
 * 전역 ID(task.id)는 더 이상 존재하지 않습니다.
 */

export interface TaskKey {
    projectId: number;
    projectSequence: number;
}

/**
 * 두 TaskKey가 동일한지 비교
 */
export function taskKeyEquals(a: TaskKey, b: TaskKey): boolean {
    return a.projectId === b.projectId && a.projectSequence === b.projectSequence;
}

/**
 * TaskKey를 문자열로 변환 (Map key 등으로 사용)
 * Format: "projectId:sequence"
 */
export function taskKeyToString(key: TaskKey): string {
    return `${key.projectId}:${key.projectSequence}`;
}

/**
 * 문자열을 TaskKey로 파싱
 */
export function taskKeyFromString(str: string): TaskKey {
    const [projectId, projectSequence] = str.split(':').map(Number);
    if (isNaN(projectId) || isNaN(projectSequence)) {
        throw new Error(`Invalid TaskKey string: ${str}`);
    }
    return { projectId, projectSequence };
}

/**
 * TaskKey 배열을 문자열 배열로 변환
 */
export function taskKeysToStrings(keys: TaskKey[]): string[] {
    return keys.map(taskKeyToString);
}

/**
 * 문자열 배열을 TaskKey 배열로 변환
 */
export function taskKeysFromStrings(strs: string[]): TaskKey[] {
    return strs.map(taskKeyFromString);
}

/**
 * TaskKey가 유효한지 검증
 */
export function isValidTaskKey(key: any): key is TaskKey {
    return (
        typeof key === 'object' &&
        key !== null &&
        typeof key.projectId === 'number' &&
        typeof key.projectSequence === 'number' &&
        key.projectId > 0 &&
        key.projectSequence > 0
    );
}
