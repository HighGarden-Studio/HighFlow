import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';

interface UserPayload {
  userId: number;
  email: string;
}

interface ClientData {
  userId: number;
  email: string;
  projectId?: number;
  taskId?: number;
}

interface JoinProjectData {
  projectId: number;
}

interface TaskUpdateData {
  taskId: number;
  projectId: number;
  changes: Record<string, any>;
}

interface TaskMoveData {
  taskId: number;
  projectId: number;
  fromStatus: string;
  toStatus: string;
}

interface CommentAddData {
  taskId: number;
  projectId: number;
  comment: {
    id: number;
    content: string;
    userId: number;
    createdAt: string;
  };
}

interface CursorMoveData {
  projectId: number;
  taskId?: number;
  position: {
    x: number;
    y: number;
  };
}

interface TypingData {
  projectId: number;
  taskId?: number;
  field: string;
}

export class WebSocketServer {
  private io: SocketIOServer;
  private jwtSecret: string;

  constructor(httpServer: HTTPServer, jwtSecret = 'your-secret-key-change-in-production') {
    this.jwtSecret = jwtSecret;

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: '*', // 프로덕션에서는 특정 도메인으로 제한
        methods: ['GET', 'POST'],
      },
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    // JWT 인증 미들웨어
    this.io.use((socket: Socket, next) => {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      try {
        const decoded = jwt.verify(token, this.jwtSecret) as UserPayload;
        (socket.data as ClientData).userId = decoded.userId;
        (socket.data as ClientData).email = decoded.email;
        next();
      } catch (err) {
        next(new Error('Authentication error: Invalid token'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Client connected: ${socket.id}, User: ${socket.data.userId}`);

      // 프로젝트 참여
      socket.on('join:project', (data: JoinProjectData) => {
        this.handleJoinProject(socket, data);
      });

      // 프로젝트 나가기
      socket.on('leave:project', (data: JoinProjectData) => {
        this.handleLeaveProject(socket, data);
      });

      // Task 업데이트
      socket.on('task:update', (data: TaskUpdateData) => {
        this.handleTaskUpdate(socket, data);
      });

      // Task 이동 (상태 변경)
      socket.on('task:move', (data: TaskMoveData) => {
        this.handleTaskMove(socket, data);
      });

      // Comment 추가
      socket.on('comment:add', (data: CommentAddData) => {
        this.handleCommentAdd(socket, data);
      });

      // Cursor 이동
      socket.on('cursor:move', (data: CursorMoveData) => {
        this.handleCursorMove(socket, data);
      });

      // Typing 시작
      socket.on('typing:start', (data: TypingData) => {
        this.handleTypingStart(socket, data);
      });

      // Typing 종료
      socket.on('typing:stop', (data: TypingData) => {
        this.handleTypingStop(socket, data);
      });

      // 연결 해제
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  private handleJoinProject(socket: Socket, data: JoinProjectData) {
    const roomName = `project:${data.projectId}`;
    socket.join(roomName);
    (socket.data as ClientData).projectId = data.projectId;

    // 프로젝트의 다른 사용자들에게 알림
    socket.to(roomName).emit('user:joined', {
      userId: socket.data.userId,
      email: socket.data.email,
      socketId: socket.id,
    });

    console.log(`User ${socket.data.userId} joined project ${data.projectId}`);
  }

  private handleLeaveProject(socket: Socket, data: JoinProjectData) {
    const roomName = `project:${data.projectId}`;
    socket.leave(roomName);

    // 프로젝트의 다른 사용자들에게 알림
    socket.to(roomName).emit('user:left', {
      userId: socket.data.userId,
      email: socket.data.email,
      socketId: socket.id,
    });

    if ((socket.data as ClientData).projectId === data.projectId) {
      (socket.data as ClientData).projectId = undefined;
    }

    console.log(`User ${socket.data.userId} left project ${data.projectId}`);
  }

  private handleTaskUpdate(socket: Socket, data: TaskUpdateData) {
    const roomName = `project:${data.projectId}`;

    // 같은 프로젝트의 다른 사용자들에게 브로드캐스트 (자신 제외)
    socket.to(roomName).emit('task:updated', {
      taskId: data.taskId,
      changes: data.changes,
      updatedBy: {
        userId: socket.data.userId,
        email: socket.data.email,
      },
      timestamp: new Date().toISOString(),
    });
  }

  private handleTaskMove(socket: Socket, data: TaskMoveData) {
    const roomName = `project:${data.projectId}`;

    // 같은 프로젝트의 다른 사용자들에게 브로드캐스트
    socket.to(roomName).emit('task:moved', {
      taskId: data.taskId,
      fromStatus: data.fromStatus,
      toStatus: data.toStatus,
      movedBy: {
        userId: socket.data.userId,
        email: socket.data.email,
      },
      timestamp: new Date().toISOString(),
    });
  }

  private handleCommentAdd(socket: Socket, data: CommentAddData) {
    const roomName = `project:${data.projectId}`;

    // 같은 프로젝트의 다른 사용자들에게 브로드캐스트
    socket.to(roomName).emit('comment:added', {
      taskId: data.taskId,
      comment: data.comment,
      addedBy: {
        userId: socket.data.userId,
        email: socket.data.email,
      },
    });
  }

  private handleCursorMove(socket: Socket, data: CursorMoveData) {
    const roomName = `project:${data.projectId}`;

    // 같은 프로젝트의 다른 사용자들에게 커서 위치 브로드캐스트
    socket.to(roomName).emit('cursor:moved', {
      userId: socket.data.userId,
      email: socket.data.email,
      taskId: data.taskId,
      position: data.position,
    });
  }

  private handleTypingStart(socket: Socket, data: TypingData) {
    const roomName = `project:${data.projectId}`;

    // 같은 프로젝트의 다른 사용자들에게 타이핑 시작 알림
    socket.to(roomName).emit('typing:started', {
      userId: socket.data.userId,
      email: socket.data.email,
      taskId: data.taskId,
      field: data.field,
    });
  }

  private handleTypingStop(socket: Socket, data: TypingData) {
    const roomName = `project:${data.projectId}`;

    // 같은 프로젝트의 다른 사용자들에게 타이핑 종료 알림
    socket.to(roomName).emit('typing:stopped', {
      userId: socket.data.userId,
      email: socket.data.email,
      taskId: data.taskId,
      field: data.field,
    });
  }

  private handleDisconnect(socket: Socket) {
    const clientData = socket.data as ClientData;

    if (clientData.projectId) {
      const roomName = `project:${clientData.projectId}`;

      // 프로젝트의 다른 사용자들에게 알림
      socket.to(roomName).emit('user:disconnected', {
        userId: clientData.userId,
        email: clientData.email,
        socketId: socket.id,
      });
    }

    console.log(`Client disconnected: ${socket.id}, User: ${clientData.userId}`);
  }

  // 특정 프로젝트의 모든 클라이언트에게 메시지 브로드캐스트
  public broadcastToProject(projectId: number, event: string, data: any) {
    const roomName = `project:${projectId}`;
    this.io.to(roomName).emit(event, data);
  }

  // 특정 사용자에게 메시지 전송
  public sendToUser(userId: number, event: string, data: any) {
    // 모든 소켓을 순회하며 해당 사용자 찾기
    this.io.sockets.sockets.forEach((socket) => {
      if ((socket.data as ClientData).userId === userId) {
        socket.emit(event, data);
      }
    });
  }

  // 서버 종료
  public close() {
    this.io.close();
  }

  // 현재 연결된 사용자 수 조회
  public getConnectedUsersCount(): number {
    return this.io.sockets.sockets.size;
  }

  // 특정 프로젝트의 연결된 사용자 조회
  public async getProjectUsers(projectId: number): Promise<Array<{ userId: number; email: string; socketId: string }>> {
    const roomName = `project:${projectId}`;
    const sockets = await this.io.in(roomName).fetchSockets();

    return sockets.map(socket => ({
      userId: (socket.data as ClientData).userId,
      email: (socket.data as ClientData).email,
      socketId: socket.id,
    }));
  }
}

// JWT 토큰 생성 헬퍼 함수
export function generateToken(userId: number, email: string, secret = 'your-secret-key-change-in-production'): string {
  return jwt.sign({ userId, email }, secret, { expiresIn: '7d' });
}
