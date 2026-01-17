import { Socket } from 'socket.io-client';

export interface UserPresence {
    userId: number;
    email: string;
    status: 'online' | 'offline' | 'away';
    currentPage: {
        type: 'project' | 'task' | 'dashboard';
        projectId?: number;
        taskId?: number;
    };
    editingField?: {
        type: 'prompt' | 'comment' | 'description' | 'title';
        taskId?: number;
        projectId?: number;
    };
    cursor?: {
        x: number;
        y: number;
        taskId?: number;
    };
    lastActivity: Date;
    color?: string; // 사용자 식별용 색상
}

export interface PresenceChangeCallback {
    (presence: Map<number, UserPresence>): void;
}

export class PresenceManager {
    private socket: Socket | null = null;
    private localPresence: Partial<UserPresence> = {};
    private remotePresence: Map<number, UserPresence> = new Map();
    private changeCallbacks: Set<PresenceChangeCallback> = new Set();
    private activityTimeout: NodeJS.Timeout | null = null;
    private readonly ACTIVITY_TIMEOUT_MS = 60000; // 1분
    private readonly UPDATE_THROTTLE_MS = 1000; // 1초
    private lastUpdate = 0;
    private pendingUpdate: Partial<UserPresence> | null = null;
    private userId: number;

    constructor(userId: number) {
        this.userId = userId;
        this.setupActivityMonitoring();
    }

    public setSocket(socket: Socket) {
        this.socket = socket;
        this.setupSocketListeners();
    }

    private setupSocketListeners() {
        if (!this.socket) return;

        // 다른 사용자의 presence 업데이트
        this.socket.on('presence:update', (data: UserPresence) => {
            this.remotePresence.set(data.userId, data);
            this.notifyChange();
        });

        // 사용자가 프로젝트에 참여
        this.socket.on('user:joined', (data: { userId: number; email: string }) => {
            // 요청하여 presence 가져오기
            this.socket?.emit('presence:request', { userId: data.userId });
        });

        // 사용자가 프로젝트에서 나감
        this.socket.on('user:left', (data: { userId: number }) => {
            this.remotePresence.delete(data.userId);
            this.notifyChange();
        });

        // 사용자 연결 해제
        this.socket.on('user:disconnected', (data: { userId: number }) => {
            const presence = this.remotePresence.get(data.userId);
            if (presence) {
                presence.status = 'offline';
                this.remotePresence.set(data.userId, presence);
                this.notifyChange();
            }
        });

        // Cursor 이동
        this.socket.on(
            'cursor:moved',
            (data: {
                userId: number;
                email: string;
                taskId?: number;
                position: { x: number; y: number };
            }) => {
                const presence =
                    this.remotePresence.get(data.userId) ||
                    this.createDefaultPresence(data.userId, data.email);
                presence.cursor = {
                    x: data.position.x,
                    y: data.position.y,
                    taskId: data.taskId,
                };
                presence.lastActivity = new Date();
                this.remotePresence.set(data.userId, presence);
                this.notifyChange();
            }
        );

        // Typing 시작
        this.socket.on(
            'typing:started',
            (data: { userId: number; email: string; taskId?: number; field: string }) => {
                const presence =
                    this.remotePresence.get(data.userId) ||
                    this.createDefaultPresence(data.userId, data.email);
                presence.editingField = {
                    type: data.field as any,
                    taskId: data.taskId,
                };
                presence.lastActivity = new Date();
                this.remotePresence.set(data.userId, presence);
                this.notifyChange();
            }
        );

        // Typing 종료
        this.socket.on('typing:stopped', (data: { userId: number; email: string }) => {
            const presence = this.remotePresence.get(data.userId);
            if (presence) {
                presence.editingField = undefined;
                this.remotePresence.set(data.userId, presence);
                this.notifyChange();
            }
        });
    }

    private createDefaultPresence(userId: number, email: string): UserPresence {
        return {
            userId,
            email,
            status: 'online',
            currentPage: { type: 'dashboard' },
            lastActivity: new Date(),
            color: this.generateUserColor(userId),
        };
    }

    private generateUserColor(userId: number): string {
        const colors = [
            '#3B82F6', // blue
            '#10B981', // green
            '#F59E0B', // yellow
            '#EF4444', // red
            '#8B5CF6', // purple
            '#EC4899', // pink
            '#06B6D4', // cyan
            '#F97316', // orange
        ];
        return colors[userId % colors.length]!;
    }

    private setupActivityMonitoring() {
        // 자동으로 away 상태로 변경
        const resetActivityTimer = () => {
            if (this.activityTimeout) {
                clearTimeout(this.activityTimeout);
            }

            this.activityTimeout = setTimeout(() => {
                this.updatePresence({ status: 'away' });
            }, this.ACTIVITY_TIMEOUT_MS);
        };

        // 브라우저 활동 감지
        if (typeof window !== 'undefined') {
            ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach((event) => {
                document.addEventListener(
                    event,
                    () => {
                        if (this.localPresence.status === 'away') {
                            this.updatePresence({ status: 'online' });
                        }
                        resetActivityTimer();
                    },
                    true
                );
            });

            // Visibility API로 탭 전환 감지
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    this.updatePresence({ status: 'away' });
                } else {
                    this.updatePresence({ status: 'online' });
                    resetActivityTimer();
                }
            });
        }

        resetActivityTimer();
    }

    // Presence 업데이트 (throttled)
    public updatePresence(updates: Partial<UserPresence>) {
        this.localPresence = {
            ...this.localPresence,
            ...updates,
            lastActivity: new Date(),
        };

        this.pendingUpdate = { ...this.pendingUpdate, ...updates };

        const now = Date.now();
        if (now - this.lastUpdate >= this.UPDATE_THROTTLE_MS) {
            this.flushPendingUpdate();
        } else {
            // 다음 업데이트까지 대기
            setTimeout(
                () => {
                    if (this.pendingUpdate) {
                        this.flushPendingUpdate();
                    }
                },
                this.UPDATE_THROTTLE_MS - (now - this.lastUpdate)
            );
        }
    }

    private flushPendingUpdate() {
        if (!this.pendingUpdate || !this.socket) return;

        this.socket.emit('presence:update', {
            userId: this.userId,
            ...this.pendingUpdate,
        });

        this.lastUpdate = Date.now();
        this.pendingUpdate = null;
    }

    // 현재 페이지 변경
    public setCurrentPage(page: UserPresence['currentPage']) {
        this.updatePresence({ currentPage: page });
    }

    // 편집 필드 설정
    public setEditingField(field: UserPresence['editingField']) {
        this.updatePresence({ editingField: field });

        if (field && this.socket) {
            this.socket.emit('typing:start', {
                projectId: field.projectId,
                taskId: field.taskId,
                field: field.type,
            });
        }
    }

    // 편집 종료
    public clearEditingField() {
        const previousField = this.localPresence.editingField;
        this.updatePresence({ editingField: undefined });

        if (previousField && this.socket) {
            this.socket.emit('typing:stop', {
                projectId: previousField.projectId,
                taskId: previousField.taskId,
                field: previousField.type,
            });
        }
    }

    // Cursor 위치 업데이트
    public updateCursor(position: { x: number; y: number }, taskId?: number) {
        const cursor = { ...position, taskId };
        this.updatePresence({ cursor });

        if (this.socket && this.localPresence.currentPage?.projectId) {
            this.socket.emit('cursor:move', {
                projectId: this.localPresence.currentPage.projectId,
                taskId,
                position,
            });
        }
    }

    // 원격 사용자 presence 조회
    public getRemotePresence(): Map<number, UserPresence> {
        return new Map(this.remotePresence);
    }

    // 특정 사용자 presence 조회
    public getUserPresence(userId: number): UserPresence | undefined {
        return this.remotePresence.get(userId);
    }

    // 현재 Task를 편집 중인 사용자 목록
    public getUsersEditingTask(taskId: number): UserPresence[] {
        return Array.from(this.remotePresence.values()).filter(
            (presence) => presence.editingField?.taskId === taskId
        );
    }

    // 현재 Project를 보고 있는 사용자 목록
    public getUsersInProject(projectId: number): UserPresence[] {
        return Array.from(this.remotePresence.values()).filter(
            (presence) => presence.currentPage.projectId === projectId
        );
    }

    // 변경 알림 구독
    public onChange(callback: PresenceChangeCallback) {
        this.changeCallbacks.add(callback);
        return () => this.changeCallbacks.delete(callback);
    }

    private notifyChange() {
        this.changeCallbacks.forEach((callback) => {
            callback(new Map(this.remotePresence));
        });
    }

    // 정리
    public destroy() {
        if (this.activityTimeout) {
            clearTimeout(this.activityTimeout);
        }
        this.changeCallbacks.clear();
        this.remotePresence.clear();
    }
}
