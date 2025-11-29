import { ref, onMounted, onUnmounted, computed } from 'vue';
import { CollaborationClient, type CollaborationStatus } from '../services/collaboration/CollaborationClient';
import type { UserPresence } from '../services/collaboration/PresenceManager';
import type { ConflictResolution } from '../services/collaboration/ConflictResolver';

// 전역 collaboration client 인스턴스
let globalClient: CollaborationClient | null = null;

export interface UseCollaborationOptions {
  websocketUrl?: string;
  userId: number;
  userEmail: string;
  projectId: number;
  autoConnect?: boolean;
  autoSync?: boolean;
  syncInterval?: number;
}

export function useCollaboration(options: UseCollaborationOptions) {
  const status = ref<CollaborationStatus>({
    connected: false,
    syncing: false,
    pendingChanges: 0,
    activeUsers: 0,
  });

  const activeUsers = ref<Map<number, UserPresence>>(new Map());
  const conflicts = ref<ConflictResolution[]>([]);
  const isConnecting = ref(false);

  // 기본 WebSocket URL (개발 환경)
  const defaultWebsocketUrl = options.websocketUrl || 'http://localhost:3000';

  // Collaboration client 초기화
  const initClient = () => {
    if (globalClient) {
      console.log('useCollaboration: Reusing existing client');
      return globalClient;
    }

    globalClient = new CollaborationClient({
      websocketUrl: defaultWebsocketUrl,
      userId: options.userId,
      userEmail: options.userEmail,
      projectId: options.projectId,
      autoSync: options.autoSync !== false,
      syncInterval: options.syncInterval || 30000,
    });

    return globalClient;
  };

  // 연결
  const connect = async () => {
    if (isConnecting.value) {
      console.warn('useCollaboration: Already connecting');
      return;
    }

    isConnecting.value = true;

    try {
      const client = initClient();
      await client.connect();
      updateStatus();
      setupPresenceListeners();
      setupConflictListeners();
    } catch (error) {
      console.error('useCollaboration: Connection failed', error);
      throw error;
    } finally {
      isConnecting.value = false;
    }
  };

  // 연결 해제
  const disconnect = () => {
    if (globalClient) {
      globalClient.disconnect();
      globalClient = null;
    }
  };

  // 상태 업데이트
  const updateStatus = () => {
    if (globalClient) {
      status.value = globalClient.getStatus();
    }
  };

  // Presence 리스너 설정
  const setupPresenceListeners = () => {
    const presence = globalClient?.getPresence();
    if (!presence) return;

    const unsubscribe = presence.onChange((updatedPresence) => {
      activeUsers.value = new Map(updatedPresence);
      updateStatus();
    });

    // 컴포넌트 언마운트 시 정리
    onUnmounted(() => {
      unsubscribe();
    });
  };

  // Conflict 리스너 설정
  const setupConflictListeners = () => {
    const handleConflicts = (event: CustomEvent<ConflictResolution[]>) => {
      conflicts.value = event.detail;
    };

    window.addEventListener('collaboration:conflicts', handleConflicts as EventListener);

    onUnmounted(() => {
      window.removeEventListener('collaboration:conflicts', handleConflicts as EventListener);
    });
  };

  // Task Prompt 편집
  const editTaskPrompt = (taskId: number) => {
    const crdt = globalClient?.getCRDT();
    if (!crdt) return null;

    return {
      getText: () => crdt.getTaskPrompt(taskId),
      setText: (content: string) => crdt.setTaskPrompt(taskId, content),
      update: (index: number, deleteLength: number, insertText: string) =>
        crdt.updateTaskPrompt(taskId, index, deleteLength, insertText),
      observe: (callback: any) => crdt.observeTaskPrompt(taskId, callback),
      unobserve: (callback: any) => crdt.unobserveTaskPrompt(taskId, callback),
    };
  };

  // Comment 관리
  const manageComments = (taskId: number) => {
    const crdt = globalClient?.getCRDT();
    if (!crdt) return null;

    return {
      getComments: () => crdt.getComments(taskId),
      addComment: (comment: any) => crdt.addComment(taskId, comment),
      updateComment: (commentId: number, content: string) =>
        crdt.updateComment(taskId, commentId, content),
      deleteComment: (commentId: number) => crdt.deleteComment(taskId, commentId),
      observe: (callback: any) => crdt.observeComments(taskId, callback),
      unobserve: (callback: any) => crdt.unobserveComments(taskId, callback),
    };
  };

  // Presence 업데이트
  const updatePresence = (updates: Partial<UserPresence>) => {
    const presence = globalClient?.getPresence();
    presence?.updatePresence(updates);
  };

  const setCurrentPage = (page: UserPresence['currentPage']) => {
    const presence = globalClient?.getPresence();
    presence?.setCurrentPage(page);
  };

  const setEditingField = (field: UserPresence['editingField']) => {
    const presence = globalClient?.getPresence();
    presence?.setEditingField(field);
  };

  const clearEditingField = () => {
    const presence = globalClient?.getPresence();
    presence?.clearEditingField();
  };

  const updateCursor = (position: { x: number; y: number }, taskId?: number) => {
    const presence = globalClient?.getPresence();
    presence?.updateCursor(position, taskId);
  };

  // Task 업데이트 큐잉
  const queueTaskUpdate = (taskId: number, changes: Record<string, any>) => {
    const sync = globalClient?.getSync();
    if (!sync) return;

    sync.queueOfflineChange({
      type: 'task_update',
      entityId: taskId,
      entityType: 'task',
      changes,
    });
  };

  // 수동 동기화
  const manualSync = async () => {
    const sync = globalClient?.getSync();
    if (!sync) throw new Error('Sync engine not initialized');

    return await sync.sync();
  };

  // Undo/Redo
  const undo = () => {
    const crdt = globalClient?.getCRDT();
    crdt?.undo();
  };

  const redo = () => {
    const crdt = globalClient?.getCRDT();
    crdt?.redo();
  };

  const canUndo = computed(() => {
    const crdt = globalClient?.getCRDT();
    return crdt?.canUndo() ?? false;
  });

  const canRedo = computed(() => {
    const crdt = globalClient?.getCRDT();
    return crdt?.canRedo() ?? false;
  });

  // Task를 편집 중인 사용자
  const getUsersEditingTask = (taskId: number): UserPresence[] => {
    const presence = globalClient?.getPresence();
    return presence?.getUsersEditingTask(taskId) ?? [];
  };

  // Project를 보고 있는 사용자
  const getUsersInProject = (projectId: number): UserPresence[] => {
    const presence = globalClient?.getPresence();
    return presence?.getUsersInProject(projectId) ?? [];
  };

  // 자동 연결
  if (options.autoConnect !== false) {
    onMounted(() => {
      connect().catch(err => console.error('useCollaboration: Auto-connect failed', err));
    });
  }

  // 상태 업데이트 인터벌
  onMounted(() => {
    const interval = setInterval(updateStatus, 1000);
    onUnmounted(() => clearInterval(interval));
  });

  // 정리
  onUnmounted(() => {
    // 마지막 컴포넌트가 언마운트될 때만 연결 해제
    // 실제로는 애플리케이션 전체가 종료될 때까지 유지하는 것이 좋음
  });

  return {
    // 상태
    status,
    activeUsers,
    conflicts,
    isConnecting,

    // 연결 관리
    connect,
    disconnect,

    // CRDT 편집
    editTaskPrompt,
    manageComments,
    undo,
    redo,
    canUndo,
    canRedo,

    // Presence
    updatePresence,
    setCurrentPage,
    setEditingField,
    clearEditingField,
    updateCursor,
    getUsersEditingTask,
    getUsersInProject,

    // Sync
    queueTaskUpdate,
    manualSync,
  };
}

// 전역 클라이언트 접근 (고급 사용)
export function getGlobalCollaborationClient(): CollaborationClient | null {
  return globalClient;
}
