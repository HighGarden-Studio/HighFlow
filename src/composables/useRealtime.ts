/**
 * Real-time Collaboration Composable
 *
 * WebSocket-based real-time updates for collaborative features
 */

import { ref, onMounted, onUnmounted, computed } from 'vue';
import { io, Socket } from 'socket.io-client';

interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string;
  color: string;
  cursor?: {
    x: number;
    y: number;
    element?: string;
  };
}

interface RealtimeOptions {
  url?: string;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
}

export function useRealtime(roomId: string, userId: number, options: RealtimeOptions = {}) {
  const socket = ref<Socket | null>(null);
  const users = ref<User[]>([]);
  const isConnected = ref(false);
  const isReconnecting = ref(false);
  const error = ref<string | null>(null);

  // Default options
  const config = {
    url: options.url || import.meta.env.VITE_WS_URL || 'http://localhost:3000',
    reconnection: options.reconnection !== false,
    reconnectionAttempts: options.reconnectionAttempts || 5,
    reconnectionDelay: options.reconnectionDelay || 1000,
  };

  /**
   * Get current user from users list
   */
  const currentUser = computed(() => {
    return users.value.find((u) => u.id === userId);
  });

  /**
   * Get other users (excluding current user)
   */
  const otherUsers = computed(() => {
    return users.value.filter((u) => u.id !== userId);
  });

  /**
   * Connect to WebSocket server
   */
  function connect() {
    try {
      socket.value = io(config.url, {
        reconnection: config.reconnection,
        reconnectionAttempts: config.reconnectionAttempts,
        reconnectionDelay: config.reconnectionDelay,
      });

      setupEventHandlers();
    } catch (err) {
      error.value = (err as Error).message;
      console.error('Failed to connect to WebSocket:', err);
    }
  }

  /**
   * Setup socket event handlers
   */
  function setupEventHandlers() {
    if (!socket.value) return;

    // Connection events
    socket.value.on('connect', () => {
      isConnected.value = true;
      isReconnecting.value = false;
      error.value = null;
      console.log('[Realtime] Connected to server');

      // Join room
      socket.value?.emit('join-room', { roomId, userId });
    });

    socket.value.on('disconnect', (reason) => {
      isConnected.value = false;
      console.log('[Realtime] Disconnected:', reason);
    });

    socket.value.on('reconnect_attempt', () => {
      isReconnecting.value = true;
      console.log('[Realtime] Reconnecting...');
    });

    socket.value.on('reconnect_failed', () => {
      isReconnecting.value = false;
      error.value = 'Failed to reconnect to server';
      console.error('[Realtime] Reconnection failed');
    });

    socket.value.on('error', (err) => {
      error.value = err.message;
      console.error('[Realtime] Socket error:', err);
    });

    // Room events
    socket.value.on('user-joined', (user: User) => {
      console.log('[Realtime] User joined:', user.name);
      users.value.push(user);
    });

    socket.value.on('user-left', (leftUserId: number) => {
      console.log('[Realtime] User left:', leftUserId);
      users.value = users.value.filter((u) => u.id !== leftUserId);
    });

    socket.value.on('users-list', (usersList: User[]) => {
      console.log('[Realtime] Users list received:', usersList.length);
      users.value = usersList;
    });

    // Cursor events
    socket.value.on('cursor-moved', ({ userId: cursorUserId, cursor }) => {
      const user = users.value.find((u) => u.id === cursorUserId);
      if (user) {
        user.cursor = cursor;
      }
    });

    // Typing events
    socket.value.on('user-typing', ({ userId: typingUserId, element }) => {
      // Handle typing indicator
      console.log('[Realtime] User typing:', typingUserId, element);
    });
  }

  /**
   * Disconnect from server
   */
  function disconnect() {
    if (socket.value) {
      socket.value.emit('leave-room', { roomId, userId });
      socket.value.disconnect();
      socket.value = null;
    }

    users.value = [];
    isConnected.value = false;
  }

  /**
   * Emit cursor movement
   */
  function emitCursorMove(x: number, y: number, element?: string) {
    if (!socket.value || !isConnected.value) return;

    socket.value.emit('cursor-move', {
      roomId,
      userId,
      cursor: { x, y, element },
    });
  }

  /**
   * Emit typing indicator
   */
  function emitTyping(element: string, isTyping: boolean) {
    if (!socket.value || !isConnected.value) return;

    socket.value.emit('typing', {
      roomId,
      userId,
      element,
      isTyping,
    });
  }

  /**
   * Emit custom event
   */
  function emit(event: string, data: any) {
    if (!socket.value || !isConnected.value) {
      console.warn('[Realtime] Cannot emit - not connected');
      return;
    }

    socket.value.emit(event, { roomId, userId, ...data });
  }

  /**
   * Listen to custom event
   */
  function on(event: string, callback: (data: any) => void) {
    if (!socket.value) {
      console.warn('[Realtime] Cannot listen - socket not initialized');
      return;
    }

    socket.value.on(event, callback);
  }

  /**
   * Remove event listener
   */
  function off(event: string, callback?: (data: any) => void) {
    if (!socket.value) return;

    if (callback) {
      socket.value.off(event, callback);
    } else {
      socket.value.off(event);
    }
  }

  // Lifecycle hooks
  onMounted(() => {
    connect();
  });

  onUnmounted(() => {
    disconnect();
  });

  return {
    // State
    socket,
    users,
    currentUser,
    otherUsers,
    isConnected,
    isReconnecting,
    error,

    // Methods
    connect,
    disconnect,
    emit,
    on,
    off,
    emitCursorMove,
    emitTyping,
  };
}
