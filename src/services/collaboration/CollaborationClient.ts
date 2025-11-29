import { io, Socket } from 'socket.io-client';
import { CRDTSync } from './CRDTSync';
import { PresenceManager } from './PresenceManager';
import { SyncEngine } from '../sync/SyncEngine';

// 브라우저용 간단한 JWT 생성 함수 (개발용)
function generateToken(userId: number, userEmail: string): string {
  // 실제 프로덕션에서는 서버에서 토큰을 받아야 함
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ userId, email: userEmail, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 }));
  return `${header}.${payload}.dev-signature`;
}

export interface CollaborationConfig {
  websocketUrl: string;
  userId: number;
  userEmail: string;
  projectId: number;
  autoSync?: boolean;
  syncInterval?: number;
}

export interface CollaborationStatus {
  connected: boolean;
  syncing: boolean;
  pendingChanges: number;
  activeUsers: number;
}

export class CollaborationClient {
  private socket: Socket | null = null;
  private crdt: CRDTSync | null = null;
  private presence: PresenceManager | null = null;
  private sync: SyncEngine | null = null;
  private config: CollaborationConfig;
  private connected = false;

  constructor(config: CollaborationConfig) {
    this.config = config;
  }

  // 초기화 및 연결
  public async connect(): Promise<void> {
    if (this.connected) {
      console.warn('CollaborationClient: Already connected');
      return;
    }

    try {
      // JWT 토큰 생성
      const token = generateToken(this.config.userId, this.config.userEmail);

      // Socket.IO 연결
      this.socket = io(this.config.websocketUrl, {
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      // 연결 이벤트 리스너
      this.socket.on('connect', () => {
        console.log('CollaborationClient: Connected to server');
        this.connected = true;

        // 프로젝트 참여
        this.socket!.emit('join:project', { projectId: this.config.projectId });
      });

      this.socket.on('disconnect', () => {
        console.log('CollaborationClient: Disconnected from server');
        this.connected = false;
      });

      this.socket.on('connect_error', (error) => {
        console.error('CollaborationClient: Connection error', error);
      });

      // CRDT 초기화
      this.crdt = new CRDTSync({
        websocketUrl: this.config.websocketUrl.replace('http', 'ws'),
        roomName: `project-${this.config.projectId}`,
        userId: this.config.userId,
        userEmail: this.config.userEmail,
        token,
      });
      this.crdt.connect();
      this.crdt.enableUndoRedo();

      // Presence 초기화
      this.presence = new PresenceManager(this.config.userId);
      this.presence.setSocket(this.socket);
      this.presence.setCurrentPage({
        type: 'project',
        projectId: this.config.projectId,
      });

      // Sync Engine 초기화
      this.sync = new SyncEngine(this.config.userId, this.config.projectId, {
        autoSyncInterval: this.config.syncInterval,
        enableOptimisticUpdates: true,
        onSyncComplete: (result) => {
          console.log('CollaborationClient: Sync complete', result);
        },
        onSyncError: (error) => {
          console.error('CollaborationClient: Sync error', error);
        },
        onConflict: (conflicts) => {
          console.warn('CollaborationClient: Conflicts detected', conflicts);
          // UI에 알림 표시
          window.dispatchEvent(new CustomEvent('collaboration:conflicts', { detail: conflicts }));
        },
      });
      this.sync.setSocket(this.socket);

      if (this.config.autoSync !== false) {
        this.sync.startAutoSync();
      }

      console.log('CollaborationClient: Initialization complete');
    } catch (error) {
      console.error('CollaborationClient: Initialization failed', error);
      throw error;
    }
  }

  // 연결 해제
  public disconnect(): void {
    if (!this.connected) return;

    // 프로젝트 나가기
    if (this.socket) {
      this.socket.emit('leave:project', { projectId: this.config.projectId });
      this.socket.disconnect();
      this.socket = null;
    }

    // 서비스 정리
    this.crdt?.disconnect();
    this.presence?.destroy();
    this.sync?.destroy();

    this.connected = false;
    console.log('CollaborationClient: Disconnected');
  }

  // CRDT 접근자
  public getCRDT(): CRDTSync | null {
    return this.crdt;
  }

  // Presence 접근자
  public getPresence(): PresenceManager | null {
    return this.presence;
  }

  // Sync 접근자
  public getSync(): SyncEngine | null {
    return this.sync;
  }

  // Socket 접근자
  public getSocket(): Socket | null {
    return this.socket;
  }

  // 상태 조회
  public getStatus(): CollaborationStatus {
    return {
      connected: this.connected,
      syncing: this.sync?.isSyncing() ?? false,
      pendingChanges: this.sync?.getPendingChangesCount() ?? 0,
      activeUsers: this.presence?.getRemotePresence().size ?? 0,
    };
  }

  // 연결 상태 확인
  public isConnected(): boolean {
    return this.connected;
  }
}
