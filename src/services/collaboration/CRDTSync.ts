import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export interface CRDTSyncOptions {
  websocketUrl: string;
  roomName: string;
  userId: number;
  userEmail: string;
  token: string;
}

export interface ChangeEvent {
  changes: Y.YEvent<any>[];
  origin: any;
}

export class CRDTSync {
  private doc: Y.Doc;
  private provider: WebsocketProvider | null = null;
  private options: CRDTSyncOptions;
  private isConnected = false;
  private offlineChanges: Array<() => void> = [];

  // Shared types for collaborative editing
  private taskPrompts: Y.Map<Y.Text> | null = null;
  private comments: Y.Map<Y.Array<any>> | null = null;
  private projectDescriptions: Y.Map<Y.Text> | null = null;

  constructor(options: CRDTSyncOptions) {
    this.options = options;
    this.doc = new Y.Doc();
    this.initializeSharedTypes();
  }

  private initializeSharedTypes() {
    // Task prompts: Map<taskId, Y.Text>
    this.taskPrompts = this.doc.getMap('taskPrompts');

    // Comments: Map<taskId, Y.Array<comment>>
    this.comments = this.doc.getMap('comments');

    // Project descriptions: Map<projectId, Y.Text>
    this.projectDescriptions = this.doc.getMap('projectDescriptions');
  }

  public connect() {
    if (this.isConnected) {
      console.warn('CRDT: Already connected');
      return;
    }

    try {
      this.provider = new WebsocketProvider(
        this.options.websocketUrl,
        this.options.roomName,
        this.doc,
        {
          params: {
            userId: this.options.userId.toString(),
            email: this.options.userEmail,
            token: this.options.token,
          },
        }
      );

      this.provider.on('status', (event: { status: string }) => {
        console.log('CRDT WebSocket status:', event.status);
        this.isConnected = event.status === 'connected';

        if (this.isConnected) {
          this.syncOfflineChanges();
        }
      });

      this.provider.on('sync', (isSynced: boolean) => {
        if (isSynced) {
          console.log('CRDT: Document synced');
        }
      });

      console.log('CRDT: Connection initiated');
    } catch (error) {
      console.error('CRDT: Connection failed', error);
    }
  }

  public disconnect() {
    if (this.provider) {
      this.provider.disconnect();
      this.provider = null;
      this.isConnected = false;
      console.log('CRDT: Disconnected');
    }
  }

  private syncOfflineChanges() {
    if (this.offlineChanges.length === 0) return;

    console.log(`CRDT: Syncing ${this.offlineChanges.length} offline changes`);

    this.offlineChanges.forEach(applyChange => {
      try {
        applyChange();
      } catch (error) {
        console.error('CRDT: Error applying offline change', error);
      }
    });

    this.offlineChanges = [];
  }

  private queueOfflineChange(applyChange: () => void) {
    if (this.isConnected) {
      applyChange();
    } else {
      this.offlineChanges.push(applyChange);
      console.log('CRDT: Change queued for offline sync');
    }
  }

  // Task Prompt 관련 메서드
  public getTaskPrompt(taskId: number): Y.Text | undefined {
    if (!this.taskPrompts) return undefined;

    let ytext = this.taskPrompts.get(taskId.toString()) as Y.Text | undefined;

    if (!ytext) {
      ytext = new Y.Text();
      this.taskPrompts.set(taskId.toString(), ytext);
    }

    return ytext;
  }

  public setTaskPrompt(taskId: number, content: string) {
    this.queueOfflineChange(() => {
      const ytext = this.getTaskPrompt(taskId);
      if (ytext) {
        this.doc.transact(() => {
          ytext.delete(0, ytext.length);
          ytext.insert(0, content);
        });
      }
    });
  }

  public updateTaskPrompt(taskId: number, index: number, deleteLength: number, insertText: string) {
    this.queueOfflineChange(() => {
      const ytext = this.getTaskPrompt(taskId);
      if (ytext) {
        this.doc.transact(() => {
          if (deleteLength > 0) {
            ytext.delete(index, deleteLength);
          }
          if (insertText) {
            ytext.insert(index, insertText);
          }
        });
      }
    });
  }

  public observeTaskPrompt(taskId: number, callback: (event: Y.YTextEvent) => void) {
    const ytext = this.getTaskPrompt(taskId);
    if (ytext) {
      ytext.observe(callback);
    }
  }

  public unobserveTaskPrompt(taskId: number, callback: (event: Y.YTextEvent) => void) {
    const ytext = this.getTaskPrompt(taskId);
    if (ytext) {
      ytext.unobserve(callback);
    }
  }

  // Comment 관련 메서드
  public getComments(taskId: number): Y.Array<any> | undefined {
    if (!this.comments) return undefined;

    let yarray = this.comments.get(taskId.toString()) as Y.Array<any> | undefined;

    if (!yarray) {
      yarray = new Y.Array();
      this.comments.set(taskId.toString(), yarray);
    }

    return yarray;
  }

  public addComment(taskId: number, comment: {
    id: number;
    content: string;
    userId: number;
    createdAt: string;
  }) {
    this.queueOfflineChange(() => {
      const yarray = this.getComments(taskId);
      if (yarray) {
        this.doc.transact(() => {
          yarray.push([comment]);
        });
      }
    });
  }

  public updateComment(taskId: number, commentId: number, newContent: string) {
    this.queueOfflineChange(() => {
      const yarray = this.getComments(taskId);
      if (yarray) {
        this.doc.transact(() => {
          const comments = yarray.toArray();
          const index = comments.findIndex(c => c.id === commentId);
          if (index !== -1) {
            const comment = { ...comments[index], content: newContent };
            yarray.delete(index, 1);
            yarray.insert(index, [comment]);
          }
        });
      }
    });
  }

  public deleteComment(taskId: number, commentId: number) {
    this.queueOfflineChange(() => {
      const yarray = this.getComments(taskId);
      if (yarray) {
        this.doc.transact(() => {
          const comments = yarray.toArray();
          const index = comments.findIndex(c => c.id === commentId);
          if (index !== -1) {
            yarray.delete(index, 1);
          }
        });
      }
    });
  }

  public observeComments(taskId: number, callback: (event: Y.YArrayEvent<any>) => void) {
    const yarray = this.getComments(taskId);
    if (yarray) {
      yarray.observe(callback);
    }
  }

  public unobserveComments(taskId: number, callback: (event: Y.YArrayEvent<any>) => void) {
    const yarray = this.getComments(taskId);
    if (yarray) {
      yarray.unobserve(callback);
    }
  }

  // Project Description 관련 메서드
  public getProjectDescription(projectId: number): Y.Text | undefined {
    if (!this.projectDescriptions) return undefined;

    let ytext = this.projectDescriptions.get(projectId.toString()) as Y.Text | undefined;

    if (!ytext) {
      ytext = new Y.Text();
      this.projectDescriptions.set(projectId.toString(), ytext);
    }

    return ytext;
  }

  public setProjectDescription(projectId: number, content: string) {
    this.queueOfflineChange(() => {
      const ytext = this.getProjectDescription(projectId);
      if (ytext) {
        this.doc.transact(() => {
          ytext.delete(0, ytext.length);
          ytext.insert(0, content);
        });
      }
    });
  }

  public observeProjectDescription(projectId: number, callback: (event: Y.YTextEvent) => void) {
    const ytext = this.getProjectDescription(projectId);
    if (ytext) {
      ytext.observe(callback);
    }
  }

  public unobserveProjectDescription(projectId: number, callback: (event: Y.YTextEvent) => void) {
    const ytext = this.getProjectDescription(projectId);
    if (ytext) {
      ytext.unobserve(callback);
    }
  }

  // Undo/Redo 지원
  private undoManager: Y.UndoManager | null = null;

  public enableUndoRedo(scope?: Y.AbstractType<any> | Y.AbstractType<any>[]) {
    if (this.undoManager) {
      console.warn('CRDT: Undo/Redo already enabled');
      return;
    }

    const trackedTypes = scope || [this.taskPrompts!, this.comments!, this.projectDescriptions!];
    this.undoManager = new Y.UndoManager(trackedTypes);

    console.log('CRDT: Undo/Redo enabled');
  }

  public undo() {
    if (this.undoManager && this.undoManager.canUndo()) {
      this.undoManager.undo();
    }
  }

  public redo() {
    if (this.undoManager && this.undoManager.canRedo()) {
      this.undoManager.redo();
    }
  }

  public canUndo(): boolean {
    return this.undoManager?.canUndo() ?? false;
  }

  public canRedo(): boolean {
    return this.undoManager?.canRedo() ?? false;
  }

  // 유틸리티 메서드
  public getConnectionStatus(): 'connected' | 'disconnected' | 'connecting' {
    if (!this.provider) return 'disconnected';
    if (this.isConnected) return 'connected';
    return 'connecting';
  }

  public getDoc(): Y.Doc {
    return this.doc;
  }

  public destroy() {
    this.disconnect();
    this.doc.destroy();
    console.log('CRDT: Destroyed');
  }
}
