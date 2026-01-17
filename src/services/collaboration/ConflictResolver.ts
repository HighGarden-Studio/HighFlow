import type { Task } from '@core/types/database';

export interface ConflictType {
    type: 'status_change' | 'comment' | 'prompt_edit' | 'field_update';
    entityId: number; // taskId or commentId
    field?: string;
}

export interface Conflict {
    type: ConflictType['type'];
    entityId: number;
    field?: string;
    localValue: any;
    remoteValue: any;
    localTimestamp: Date;
    remoteTimestamp: Date;
    localUserId: number;
    remoteUserId: number;
}

export interface ConflictResolution {
    type: ConflictType['type'];
    entityId: number;
    field?: string;
    resolvedValue: any;
    resolution: 'local' | 'remote' | 'merged' | 'manual';
    timestamp: Date;
}

export type ConflictResolutionStrategy = 'last_write_wins' | 'manual' | 'merge';

export class ConflictResolver {
    private pendingConflicts: Map<string, Conflict> = new Map();
    private resolutionHistory: ConflictResolution[] = [];

    // Task 상태 변경 충돌 해결 - Last Write Wins
    public resolveTaskStatusConflict(conflict: Conflict): ConflictResolution {
        const resolution: ConflictResolution = {
            type: 'status_change',
            entityId: conflict.entityId,
            field: 'status',
            resolvedValue:
                conflict.remoteTimestamp > conflict.localTimestamp
                    ? conflict.remoteValue
                    : conflict.localValue,
            resolution: conflict.remoteTimestamp > conflict.localTimestamp ? 'remote' : 'local',
            timestamp: new Date(),
        };

        this.resolutionHistory.push(resolution);
        return resolution;
    }

    // Comment 충돌 해결 - Timestamp 기반 병합
    public resolveCommentConflict(
        localComments: Array<{ id: number; content: string; createdAt: string }>,
        remoteComments: Array<{ id: number; content: string; createdAt: string }>
    ): ConflictResolution {
        // 모든 댓글을 timestamp 순으로 정렬하여 병합
        const allComments = [...localComments, ...remoteComments];
        const uniqueComments = new Map<number, (typeof allComments)[0]>();

        allComments.forEach((comment) => {
            const existing = uniqueComments.get(comment.id);
            if (!existing || new Date(comment.createdAt) > new Date(existing.createdAt)) {
                uniqueComments.set(comment.id, comment);
            }
        });

        const mergedComments = Array.from(uniqueComments.values()).sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );

        const resolution: ConflictResolution = {
            type: 'comment',
            entityId: 0, // taskId will be set by caller
            resolvedValue: mergedComments,
            resolution: 'merged',
            timestamp: new Date(),
        };

        this.resolutionHistory.push(resolution);
        return resolution;
    }

    // Prompt 편집 충돌 해결 - CRDT 자동 병합 (이미 Yjs가 처리)
    public resolvePromptEditConflict(conflict: Conflict): ConflictResolution {
        // CRDT (Yjs)가 이미 자동으로 병합하므로, 여기서는 기록만 남김
        const resolution: ConflictResolution = {
            type: 'prompt_edit',
            entityId: conflict.entityId,
            field: 'prompt',
            resolvedValue: conflict.remoteValue, // CRDT가 이미 병합한 값
            resolution: 'merged',
            timestamp: new Date(),
        };

        this.resolutionHistory.push(resolution);
        return resolution;
    }

    // Task 필드 업데이트 충돌 해결 (title, description 등)
    public resolveFieldUpdateConflict(conflict: Conflict): ConflictResolution {
        // Last Write Wins 전략
        const resolution: ConflictResolution = {
            type: 'field_update',
            entityId: conflict.entityId,
            field: conflict.field,
            resolvedValue:
                conflict.remoteTimestamp > conflict.localTimestamp
                    ? conflict.remoteValue
                    : conflict.localValue,
            resolution: conflict.remoteTimestamp > conflict.localTimestamp ? 'remote' : 'local',
            timestamp: new Date(),
        };

        this.resolutionHistory.push(resolution);
        return resolution;
    }

    // 오프라인 변경사항 동기화 시 충돌 해결
    public resolveOfflineConflicts(
        localChanges: Array<{
            type: string;
            entityId: number;
            field?: string;
            value: any;
            timestamp: Date;
            userId: number;
        }>,
        serverState: Map<string, { value: any; timestamp: Date; userId: number }>
    ): ConflictResolution[] {
        const resolutions: ConflictResolution[] = [];

        localChanges.forEach((localChange) => {
            const key = this.generateConflictKey(
                localChange.type,
                localChange.entityId,
                localChange.field
            );
            const serverData = serverState.get(key);

            if (serverData) {
                // 충돌 감지
                if (serverData.timestamp > localChange.timestamp) {
                    // 서버가 더 최신
                    const conflict: Conflict = {
                        type: localChange.type as ConflictType['type'],
                        entityId: localChange.entityId,
                        field: localChange.field,
                        localValue: localChange.value,
                        remoteValue: serverData.value,
                        localTimestamp: localChange.timestamp,
                        remoteTimestamp: serverData.timestamp,
                        localUserId: localChange.userId,
                        remoteUserId: serverData.userId,
                    };

                    // 타입별 해결 전략 적용
                    let resolution: ConflictResolution;
                    switch (conflict.type) {
                        case 'status_change':
                            resolution = this.resolveTaskStatusConflict(conflict);
                            break;
                        case 'prompt_edit':
                            resolution = this.resolvePromptEditConflict(conflict);
                            break;
                        case 'field_update':
                            resolution = this.resolveFieldUpdateConflict(conflict);
                            break;
                        default:
                            resolution = this.resolveFieldUpdateConflict(conflict);
                    }

                    resolutions.push(resolution);
                } else {
                    // 로컬이 더 최신 - Optimistic Update 유지
                    resolutions.push({
                        type: localChange.type as ConflictType['type'],
                        entityId: localChange.entityId,
                        field: localChange.field,
                        resolvedValue: localChange.value,
                        resolution: 'local',
                        timestamp: new Date(),
                    });
                }
            } else {
                // 충돌 없음 - 로컬 변경사항 그대로 적용
                resolutions.push({
                    type: localChange.type as ConflictType['type'],
                    entityId: localChange.entityId,
                    field: localChange.field,
                    resolvedValue: localChange.value,
                    resolution: 'local',
                    timestamp: new Date(),
                });
            }
        });

        return resolutions;
    }

    // Task 전체 병합
    public mergeTasks(localTask: Partial<Task>, remoteTask: Partial<Task>): Task {
        // 각 필드별로 타임스탬프 비교하여 병합
        const merged: any = { ...localTask };

        Object.keys(remoteTask).forEach((key) => {
            const remoteValue = (remoteTask as any)[key];
            // const localValue = (localTask as any)[key];

            // updatedAt 필드로 최신성 판단
            if (remoteTask.updatedAt && localTask.updatedAt) {
                if (new Date(remoteTask.updatedAt) > new Date(localTask.updatedAt)) {
                    merged[key] = remoteValue;
                }
            } else {
                // timestamp가 없으면 remote 우선
                merged[key] = remoteValue;
            }
        });

        return merged as Task;
    }

    // 충돌 등록
    public registerConflict(conflict: Conflict): void {
        const key = this.generateConflictKey(conflict.type, conflict.entityId, conflict.field);
        this.pendingConflicts.set(key, conflict);
    }

    // 충돌 해결
    public resolveConflict(
        type: ConflictType['type'],
        entityId: number,
        field?: string
    ): ConflictResolution | null {
        const key = this.generateConflictKey(type, entityId, field);
        const conflict = this.pendingConflicts.get(key);

        if (!conflict) return null;

        let resolution: ConflictResolution;
        switch (type) {
            case 'status_change':
                resolution = this.resolveTaskStatusConflict(conflict);
                break;
            case 'prompt_edit':
                resolution = this.resolvePromptEditConflict(conflict);
                break;
            case 'field_update':
                resolution = this.resolveFieldUpdateConflict(conflict);
                break;
            default:
                resolution = this.resolveFieldUpdateConflict(conflict);
        }

        this.pendingConflicts.delete(key);
        return resolution;
    }

    // 모든 대기 중인 충돌 조회
    public getPendingConflicts(): Conflict[] {
        return Array.from(this.pendingConflicts.values());
    }

    // 해결 이력 조회
    public getResolutionHistory(): ConflictResolution[] {
        return [...this.resolutionHistory];
    }

    // 충돌 키 생성
    private generateConflictKey(type: string, entityId: number, field?: string): string {
        return field ? `${type}:${entityId}:${field}` : `${type}:${entityId}`;
    }

    // 통계
    public getStatistics() {
        return {
            pendingConflicts: this.pendingConflicts.size,
            totalResolved: this.resolutionHistory.length,
            resolutionsByType: this.resolutionHistory.reduce(
                (acc, res) => {
                    acc[res.resolution] = (acc[res.resolution] || 0) + 1;
                    return acc;
                },
                {} as Record<string, number>
            ),
        };
    }

    // 정리
    public clear() {
        this.pendingConflicts.clear();
    }

    public clearHistory() {
        this.resolutionHistory = [];
    }
}
