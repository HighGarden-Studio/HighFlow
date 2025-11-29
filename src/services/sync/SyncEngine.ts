import type { Task, Project } from '@core/types/database';
import { ConflictResolver, type ConflictResolution } from '../collaboration/ConflictResolver';
import { Socket } from 'socket.io-client';

export interface SyncChange {
  id: string;
  type: 'task_update' | 'task_create' | 'task_delete' | 'project_update' | 'comment_add';
  entityId: number;
  entityType: 'task' | 'project' | 'comment';
  changes: Record<string, any>;
  timestamp: Date;
  userId: number;
  synced: boolean;
}

export interface SyncState {
  lastSyncTimestamp: Date | null;
  pendingChanges: SyncChange[];
  isSyncing: boolean;
  isOnline: boolean;
  syncErrors: Array<{ change: SyncChange; error: string }>;
}

export interface SyncOptions {
  autoSyncInterval?: number; // 밀리초 단위, 기본 30초
  enableOptimisticUpdates?: boolean; // 기본 true
  maxRetries?: number; // 기본 3
  onSyncComplete?: (result: SyncResult) => void;
  onSyncError?: (error: Error) => void;
  onConflict?: (conflicts: ConflictResolution[]) => void;
}

export interface SyncResult {
  pushedChanges: number;
  pulledChanges: number;
  conflicts: ConflictResolution[];
  errors: Array<{ change: SyncChange; error: string }>;
  timestamp: Date;
}

export class SyncEngine {
  private socket: Socket | null = null;
  private conflictResolver: ConflictResolver;
  private state: SyncState = {
    lastSyncTimestamp: null,
    pendingChanges: [],
    isSyncing: false,
    isOnline: navigator.onLine,
    syncErrors: [],
  };
  private options: Required<SyncOptions>;
  private syncInterval: NodeJS.Timeout | null = null;
  private userId: number;
  private projectId: number;

  constructor(userId: number, projectId: number, options: SyncOptions = {}) {
    this.userId = userId;
    this.projectId = projectId;
    this.conflictResolver = new ConflictResolver();
    this.options = {
      autoSyncInterval: options.autoSyncInterval ?? 30000, // 30초
      enableOptimisticUpdates: options.enableOptimisticUpdates ?? true,
      maxRetries: options.maxRetries ?? 3,
      onSyncComplete: options.onSyncComplete ?? (() => {}),
      onSyncError: options.onSyncError ?? (() => {}),
      onConflict: options.onConflict ?? (() => {}),
    };

    this.setupOnlineStatusMonitoring();
  }

  public setSocket(socket: Socket) {
    this.socket = socket;
    this.setupSocketListeners();
  }

  private setupSocketListeners() {
    if (!this.socket) return;

    // 서버로부터 변경사항 수신
    this.socket.on('task:updated', (data: {
      taskId: number;
      changes: Record<string, any>;
      updatedBy: { userId: number; email: string };
      timestamp: string;
    }) => {
      if (data.updatedBy.userId !== this.userId) {
        this.handleRemoteChange({
          id: `remote-${Date.now()}`,
          type: 'task_update',
          entityId: data.taskId,
          entityType: 'task',
          changes: data.changes,
          timestamp: new Date(data.timestamp),
          userId: data.updatedBy.userId,
          synced: true,
        });
      }
    });

    // Task 이동 (상태 변경)
    this.socket.on('task:moved', (data: {
      taskId: number;
      fromStatus: string;
      toStatus: string;
      movedBy: { userId: number };
      timestamp: string;
    }) => {
      if (data.movedBy.userId !== this.userId) {
        this.handleRemoteChange({
          id: `remote-${Date.now()}`,
          type: 'task_update',
          entityId: data.taskId,
          entityType: 'task',
          changes: { status: data.toStatus },
          timestamp: new Date(data.timestamp),
          userId: data.movedBy.userId,
          synced: true,
        });
      }
    });

    // Comment 추가
    this.socket.on('comment:added', (data: {
      taskId: number;
      comment: any;
      addedBy: { userId: number };
    }) => {
      if (data.addedBy.userId !== this.userId) {
        this.handleRemoteChange({
          id: `remote-${Date.now()}`,
          type: 'comment_add',
          entityId: data.taskId,
          entityType: 'comment',
          changes: { comment: data.comment },
          timestamp: new Date(),
          userId: data.addedBy.userId,
          synced: true,
        });
      }
    });

    // 재연결 시 자동 동기화
    this.socket.on('connect', () => {
      console.log('SyncEngine: Socket connected, triggering sync');
      this.state.isOnline = true;
      this.sync();
    });

    this.socket.on('disconnect', () => {
      console.log('SyncEngine: Socket disconnected');
      this.state.isOnline = false;
    });
  }

  private setupOnlineStatusMonitoring() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('SyncEngine: Network online');
        this.state.isOnline = true;
        this.sync();
      });

      window.addEventListener('offline', () => {
        console.log('SyncEngine: Network offline');
        this.state.isOnline = false;
      });
    }
  }

  // 로컬 변경사항을 서버로 푸시
  public async pushChanges(changes: SyncChange[]): Promise<{ success: number; failed: number }> {
    if (!this.socket || !this.state.isOnline) {
      console.warn('SyncEngine: Cannot push - offline or no socket');
      return { success: 0, failed: changes.length };
    }

    let success = 0;
    let failed = 0;

    for (const change of changes) {
      try {
        await this.pushSingleChange(change);
        change.synced = true;
        success++;
      } catch (error) {
        console.error('SyncEngine: Push failed', error);
        this.state.syncErrors.push({
          change,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        failed++;
      }
    }

    // 성공한 변경사항은 대기열에서 제거
    this.state.pendingChanges = this.state.pendingChanges.filter(c => !c.synced);

    return { success, failed };
  }

  private async pushSingleChange(change: SyncChange): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('No socket connection'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Push timeout'));
      }, 5000);

      switch (change.type) {
        case 'task_update':
          this.socket.emit('task:update', {
            taskId: change.entityId,
            projectId: this.projectId,
            changes: change.changes,
          }, (response: { success: boolean; error?: string }) => {
            clearTimeout(timeout);
            if (response.success) {
              resolve();
            } else {
              reject(new Error(response.error || 'Unknown error'));
            }
          });
          break;

        case 'comment_add':
          this.socket.emit('comment:add', {
            taskId: change.entityId,
            projectId: this.projectId,
            comment: change.changes.comment,
          }, (response: { success: boolean; error?: string }) => {
            clearTimeout(timeout);
            if (response.success) {
              resolve();
            } else {
              reject(new Error(response.error || 'Unknown error'));
            }
          });
          break;

        default:
          clearTimeout(timeout);
          reject(new Error(`Unknown change type: ${change.type}`));
      }
    });
  }

  // 서버로부터 변경사항 가져오기
  public async pullChanges(lastSyncTimestamp?: Date): Promise<SyncChange[]> {
    if (!this.socket || !this.state.isOnline) {
      console.warn('SyncEngine: Cannot pull - offline or no socket');
      return [];
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Pull timeout'));
      }, 10000);

      this.socket!.emit('sync:pull', {
        projectId: this.projectId,
        since: lastSyncTimestamp?.toISOString(),
      }, (response: { success: boolean; changes?: SyncChange[]; error?: string }) => {
        clearTimeout(timeout);
        if (response.success && response.changes) {
          resolve(response.changes);
        } else {
          reject(new Error(response.error || 'Pull failed'));
        }
      });
    });
  }

  // 양방향 동기화
  public async sync(): Promise<SyncResult> {
    if (this.state.isSyncing) {
      console.warn('SyncEngine: Already syncing');
      return {
        pushedChanges: 0,
        pulledChanges: 0,
        conflicts: [],
        errors: [],
        timestamp: new Date(),
      };
    }

    this.state.isSyncing = true;

    try {
      // 1. 로컬 변경사항 푸시
      const pushResult = await this.pushChanges(this.state.pendingChanges);

      // 2. 서버 변경사항 가져오기
      const remoteChanges = await this.pullChanges(this.state.lastSyncTimestamp || undefined);

      // 3. 충돌 해결
      const conflicts = this.resolveConflicts(remoteChanges);

      // 4. 동기화 완료 타임스탬프 업데이트
      this.state.lastSyncTimestamp = new Date();

      const result: SyncResult = {
        pushedChanges: pushResult.success,
        pulledChanges: remoteChanges.length,
        conflicts,
        errors: this.state.syncErrors,
        timestamp: this.state.lastSyncTimestamp,
      };

      this.state.syncErrors = [];

      if (conflicts.length > 0) {
        this.options.onConflict(conflicts);
      }

      this.options.onSyncComplete(result);

      console.log('SyncEngine: Sync complete', result);
      return result;
    } catch (error) {
      console.error('SyncEngine: Sync failed', error);
      this.options.onSyncError(error instanceof Error ? error : new Error('Unknown sync error'));
      throw error;
    } finally {
      this.state.isSyncing = false;
    }
  }

  // 충돌 해결
  private resolveConflicts(remoteChanges: SyncChange[]): ConflictResolution[] {
    const serverState = new Map<string, { value: any; timestamp: Date; userId: number }>();

    remoteChanges.forEach(change => {
      Object.entries(change.changes).forEach(([field, value]) => {
        const key = `${change.type}:${change.entityId}:${field}`;
        serverState.set(key, {
          value,
          timestamp: change.timestamp,
          userId: change.userId,
        });
      });
    });

    const localChanges = this.state.pendingChanges.map(change => ({
      type: change.type,
      entityId: change.entityId,
      field: Object.keys(change.changes)[0], // 간단히 첫 번째 필드만
      value: Object.values(change.changes)[0],
      timestamp: change.timestamp,
      userId: this.userId,
    }));

    return this.conflictResolver.resolveOfflineConflicts(localChanges, serverState);
  }

  // 원격 변경사항 처리 (실시간 수신)
  private handleRemoteChange(change: SyncChange) {
    // Optimistic update가 활성화되어 있으면 즉시 적용
    if (this.options.enableOptimisticUpdates) {
      // UI 업데이트를 위한 이벤트 발생
      window.dispatchEvent(new CustomEvent('sync:remote-change', { detail: change }));
    }
  }

  // 오프라인 변경사항 대기열에 추가
  public queueOfflineChange(change: Omit<SyncChange, 'id' | 'timestamp' | 'userId' | 'synced'>): string {
    const fullChange: SyncChange = {
      ...change,
      id: `local-${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      userId: this.userId,
      synced: false,
    };

    this.state.pendingChanges.push(fullChange);

    // Optimistic update
    if (this.options.enableOptimisticUpdates) {
      window.dispatchEvent(new CustomEvent('sync:optimistic-update', { detail: fullChange }));
    }

    // 온라인이면 즉시 동기화 시도
    if (this.state.isOnline) {
      setTimeout(() => this.sync(), 100);
    }

    return fullChange.id;
  }

  // 자동 동기화 시작
  public startAutoSync() {
    if (this.syncInterval) {
      console.warn('SyncEngine: Auto-sync already started');
      return;
    }

    this.syncInterval = setInterval(() => {
      if (this.state.isOnline && !this.state.isSyncing) {
        this.sync().catch(err => console.error('SyncEngine: Auto-sync failed', err));
      }
    }, this.options.autoSyncInterval);

    console.log(`SyncEngine: Auto-sync started (interval: ${this.options.autoSyncInterval}ms)`);
  }

  // 자동 동기화 중지
  public stopAutoSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('SyncEngine: Auto-sync stopped');
    }
  }

  // 상태 조회
  public getState(): Readonly<SyncState> {
    return { ...this.state };
  }

  // 대기 중인 변경사항 수
  public getPendingChangesCount(): number {
    return this.state.pendingChanges.length;
  }

  // 동기화 상태 확인
  public isSyncing(): boolean {
    return this.state.isSyncing;
  }

  public isOnline(): boolean {
    return this.state.isOnline;
  }

  // 정리
  public destroy() {
    this.stopAutoSync();
    this.state.pendingChanges = [];
    this.state.syncErrors = [];
    this.conflictResolver.clear();
  }
}
