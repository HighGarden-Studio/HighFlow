/**
 * File System Permission Service
 *
 * Controls AI and workflow access to the local file system.
 * Implements a sandbox model with user-configurable permissions.
 *
 * Features:
 * - Workspace-based access control (only allowed directories)
 * - Operation-level permissions (read, write, execute, delete)
 * - User approval flow for sensitive operations
 * - Audit logging of all file system access
 * - Safe Mode toggle for extra protection
 */

// ========================================
// Types
// ========================================

export type FileOperation = 'read' | 'write' | 'create' | 'delete' | 'execute' | 'list';

export interface WorkspaceConfig {
  /** Unique identifier for the workspace */
  id: string;
  /** Human-readable name */
  name: string;
  /** Base path of the workspace */
  basePath: string;
  /** Allowed operations in this workspace */
  allowedOperations: FileOperation[];
  /** File patterns to allow (glob patterns) */
  allowedPatterns: string[];
  /** File patterns to deny (takes precedence) */
  deniedPatterns: string[];
  /** Whether this is the default project workspace */
  isDefault: boolean;
  /** Creation timestamp */
  createdAt: Date;
}

export interface PermissionRequest {
  /** Unique request ID */
  id: string;
  /** Type of operation requested */
  operation: FileOperation;
  /** Full path being accessed */
  path: string;
  /** Reason for the access */
  reason: string;
  /** Requesting task or workflow ID */
  requesterId: string;
  /** Timestamp of request */
  timestamp: Date;
  /** Current status */
  status: 'pending' | 'approved' | 'denied' | 'expired';
  /** Auto-approve if matches workspace rules */
  autoApproved: boolean;
}

export interface PermissionResult {
  /** Whether access is allowed */
  allowed: boolean;
  /** Reason for the decision */
  reason: string;
  /** Matched workspace if any */
  workspace?: WorkspaceConfig;
  /** Request ID if user approval needed */
  requestId?: string;
}

export interface AuditLogEntry {
  /** Log entry ID */
  id: string;
  /** Operation performed */
  operation: FileOperation;
  /** Path accessed */
  path: string;
  /** Requester ID */
  requesterId: string;
  /** Whether it was allowed */
  allowed: boolean;
  /** Reason for decision */
  reason: string;
  /** Timestamp */
  timestamp: Date;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface SecuritySettings {
  /** Enable Safe Mode (requires approval for all operations) */
  safeMode: boolean;
  /** Auto-approve operations within workspaces */
  autoApproveWorkspaceOps: boolean;
  /** Maximum file size for write operations (bytes) */
  maxWriteSize: number;
  /** Block executable file creation */
  blockExecutables: boolean;
  /** Block hidden file access */
  blockHiddenFiles: boolean;
  /** Require approval for delete operations */
  requireApprovalForDelete: boolean;
  /** Audit log retention days */
  auditLogRetentionDays: number;
}

// ========================================
// Default Settings
// ========================================

const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  safeMode: false,
  autoApproveWorkspaceOps: true,
  maxWriteSize: 50 * 1024 * 1024, // 50MB
  blockExecutables: true,
  blockHiddenFiles: true,
  requireApprovalForDelete: true,
  auditLogRetentionDays: 30,
};

const EXECUTABLE_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.ps1',
  '.app', '.dmg', '.pkg', '.msi', '.dll', '.so',
  '.jar', '.py', '.rb', '.pl', '.php',
];

const SENSITIVE_PATHS = [
  '/etc', '/usr', '/bin', '/sbin', '/var',
  'C:\\Windows', 'C:\\Program Files',
  '~/.ssh', '~/.gnupg', '~/.aws',
];

// ========================================
// File System Permission Service
// ========================================

class FileSystemPermissionService {
  private workspaces: Map<string, WorkspaceConfig> = new Map();
  private pendingRequests: Map<string, PermissionRequest> = new Map();
  private auditLog: AuditLogEntry[] = [];
  private settings: SecuritySettings = { ...DEFAULT_SECURITY_SETTINGS };
  private approvalCallbacks: Map<string, (approved: boolean) => void> = new Map();

  constructor() {
    this.loadSettings();
  }

  // ========================================
  // Workspace Management
  // ========================================

  /**
   * Add a workspace (allowed directory)
   */
  addWorkspace(config: Omit<WorkspaceConfig, 'id' | 'createdAt'>): WorkspaceConfig {
    const workspace: WorkspaceConfig = {
      ...config,
      id: this.generateId(),
      createdAt: new Date(),
    };

    this.workspaces.set(workspace.id, workspace);
    this.saveWorkspaces();

    console.log(`[FileSystemPermission] Added workspace: ${workspace.name} (${workspace.basePath})`);
    return workspace;
  }

  /**
   * Remove a workspace
   */
  removeWorkspace(id: string): boolean {
    const removed = this.workspaces.delete(id);
    if (removed) {
      this.saveWorkspaces();
    }
    return removed;
  }

  /**
   * Get all workspaces
   */
  getWorkspaces(): WorkspaceConfig[] {
    return Array.from(this.workspaces.values());
  }

  /**
   * Get workspace by ID
   */
  getWorkspace(id: string): WorkspaceConfig | undefined {
    return this.workspaces.get(id);
  }

  /**
   * Update workspace configuration
   */
  updateWorkspace(id: string, updates: Partial<WorkspaceConfig>): WorkspaceConfig | null {
    const workspace = this.workspaces.get(id);
    if (!workspace) return null;

    const updated = { ...workspace, ...updates, id }; // Prevent ID change
    this.workspaces.set(id, updated);
    this.saveWorkspaces();

    return updated;
  }

  // ========================================
  // Permission Checking
  // ========================================

  /**
   * Check if an operation is allowed
   */
  async checkPermission(
    operation: FileOperation,
    path: string,
    requesterId: string,
    reason?: string
  ): Promise<PermissionResult> {
    // Normalize path
    const normalizedPath = this.normalizePath(path);

    // Check for sensitive paths
    if (this.isSensitivePath(normalizedPath)) {
      this.logAudit(operation, normalizedPath, requesterId, false, 'Sensitive system path');
      return {
        allowed: false,
        reason: '시스템 보안 경로에 대한 접근이 차단되었습니다.',
      };
    }

    // Check for hidden files
    if (this.settings.blockHiddenFiles && this.isHiddenFile(normalizedPath)) {
      this.logAudit(operation, normalizedPath, requesterId, false, 'Hidden file blocked');
      return {
        allowed: false,
        reason: '숨김 파일에 대한 접근이 차단되었습니다.',
      };
    }

    // Check for executables on write/create
    if ((operation === 'write' || operation === 'create') && this.settings.blockExecutables) {
      if (this.isExecutable(normalizedPath)) {
        this.logAudit(operation, normalizedPath, requesterId, false, 'Executable blocked');
        return {
          allowed: false,
          reason: '실행 파일 생성이 차단되었습니다. 보안 설정을 확인하세요.',
        };
      }
    }

    // Find matching workspace
    const workspace = this.findMatchingWorkspace(normalizedPath);

    // Safe Mode: Always require approval
    if (this.settings.safeMode) {
      return this.requestApproval(operation, normalizedPath, requesterId, reason || 'Safe Mode enabled');
    }

    // No workspace match
    if (!workspace) {
      // Require approval for operations outside workspaces
      return this.requestApproval(
        operation,
        normalizedPath,
        requesterId,
        reason || '작업 공간 외부 경로에 대한 접근'
      );
    }

    // Check if operation is allowed in workspace
    if (!workspace.allowedOperations.includes(operation)) {
      this.logAudit(operation, normalizedPath, requesterId, false, 'Operation not allowed in workspace');
      return {
        allowed: false,
        reason: `이 작업 공간에서 '${operation}' 작업이 허용되지 않습니다.`,
        workspace,
      };
    }

    // Check against denied patterns
    if (this.matchesPatterns(normalizedPath, workspace.deniedPatterns)) {
      this.logAudit(operation, normalizedPath, requesterId, false, 'Denied by pattern');
      return {
        allowed: false,
        reason: '이 파일 패턴에 대한 접근이 거부되었습니다.',
        workspace,
      };
    }

    // Check against allowed patterns
    if (workspace.allowedPatterns.length > 0 && !this.matchesPatterns(normalizedPath, workspace.allowedPatterns)) {
      this.logAudit(operation, normalizedPath, requesterId, false, 'Not matching allowed patterns');
      return {
        allowed: false,
        reason: '허용된 파일 패턴과 일치하지 않습니다.',
        workspace,
      };
    }

    // Delete operations may require approval
    if (operation === 'delete' && this.settings.requireApprovalForDelete) {
      return this.requestApproval(
        operation,
        normalizedPath,
        requesterId,
        reason || '파일 삭제 승인 요청'
      );
    }

    // Auto-approve if enabled
    if (this.settings.autoApproveWorkspaceOps) {
      this.logAudit(operation, normalizedPath, requesterId, true, 'Auto-approved (workspace)');
      return {
        allowed: true,
        reason: '작업 공간 내에서 자동 승인됨',
        workspace,
      };
    }

    // Request approval
    return this.requestApproval(operation, normalizedPath, requesterId, reason || '사용자 승인 필요');
  }

  /**
   * Request user approval for an operation
   */
  private async requestApproval(
    operation: FileOperation,
    path: string,
    requesterId: string,
    reason: string
  ): Promise<PermissionResult> {
    const request: PermissionRequest = {
      id: this.generateId(),
      operation,
      path,
      reason,
      requesterId,
      timestamp: new Date(),
      status: 'pending',
      autoApproved: false,
    };

    this.pendingRequests.set(request.id, request);

    // Emit event for UI to show approval dialog
    this.emitApprovalRequest(request);

    return {
      allowed: false,
      reason: '사용자 승인을 기다리는 중입니다...',
      requestId: request.id,
    };
  }

  /**
   * Wait for user approval (with timeout)
   */
  async waitForApproval(requestId: string, timeoutMs: number = 60000): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        const request = this.pendingRequests.get(requestId);
        if (request && request.status === 'pending') {
          request.status = 'expired';
          this.pendingRequests.set(requestId, request);
        }
        this.approvalCallbacks.delete(requestId);
        resolve(false);
      }, timeoutMs);

      this.approvalCallbacks.set(requestId, (approved) => {
        clearTimeout(timeout);
        resolve(approved);
      });
    });
  }

  /**
   * Approve a pending request
   */
  approveRequest(requestId: string): boolean {
    const request = this.pendingRequests.get(requestId);
    if (!request || request.status !== 'pending') {
      return false;
    }

    request.status = 'approved';
    this.pendingRequests.set(requestId, request);
    this.logAudit(request.operation, request.path, request.requesterId, true, 'User approved');

    const callback = this.approvalCallbacks.get(requestId);
    if (callback) {
      callback(true);
      this.approvalCallbacks.delete(requestId);
    }

    return true;
  }

  /**
   * Deny a pending request
   */
  denyRequest(requestId: string): boolean {
    const request = this.pendingRequests.get(requestId);
    if (!request || request.status !== 'pending') {
      return false;
    }

    request.status = 'denied';
    this.pendingRequests.set(requestId, request);
    this.logAudit(request.operation, request.path, request.requesterId, false, 'User denied');

    const callback = this.approvalCallbacks.get(requestId);
    if (callback) {
      callback(false);
      this.approvalCallbacks.delete(requestId);
    }

    return true;
  }

  /**
   * Get pending requests
   */
  getPendingRequests(): PermissionRequest[] {
    return Array.from(this.pendingRequests.values()).filter(r => r.status === 'pending');
  }

  // ========================================
  // Settings Management
  // ========================================

  /**
   * Get current settings
   */
  getSettings(): SecuritySettings {
    return { ...this.settings };
  }

  /**
   * Update settings
   */
  updateSettings(updates: Partial<SecuritySettings>): void {
    this.settings = { ...this.settings, ...updates };
    this.saveSettings();
  }

  /**
   * Toggle Safe Mode
   */
  toggleSafeMode(): boolean {
    this.settings.safeMode = !this.settings.safeMode;
    this.saveSettings();
    return this.settings.safeMode;
  }

  // ========================================
  // Audit Log
  // ========================================

  /**
   * Get audit log entries
   */
  getAuditLog(limit?: number): AuditLogEntry[] {
    const sorted = [...this.auditLog].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return limit ? sorted.slice(0, limit) : sorted;
  }

  /**
   * Clear old audit logs
   */
  cleanupAuditLog(): number {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.settings.auditLogRetentionDays);

    const before = this.auditLog.length;
    this.auditLog = this.auditLog.filter(entry => entry.timestamp > cutoff);

    return before - this.auditLog.length;
  }

  // ========================================
  // Private Helpers
  // ========================================

  private normalizePath(path: string): string {
    // Handle home directory
    if (path.startsWith('~')) {
      // In Electron, this would use app.getPath('home')
      const home = process.env.HOME || process.env.USERPROFILE || '';
      path = path.replace('~', home);
    }

    // Normalize separators
    return path.replace(/\\/g, '/');
  }

  private findMatchingWorkspace(path: string): WorkspaceConfig | undefined {
    for (const workspace of this.workspaces.values()) {
      const basePath = this.normalizePath(workspace.basePath);
      if (path.startsWith(basePath)) {
        return workspace;
      }
    }
    return undefined;
  }

  private isSensitivePath(path: string): boolean {
    const normalizedPath = path.toLowerCase();
    return SENSITIVE_PATHS.some(sensitive => {
      const normalizedSensitive = this.normalizePath(sensitive).toLowerCase();
      return normalizedPath.startsWith(normalizedSensitive);
    });
  }

  private isHiddenFile(path: string): boolean {
    const parts = path.split('/');
    return parts.some(part => part.startsWith('.') && part !== '.' && part !== '..');
  }

  private isExecutable(path: string): boolean {
    const lower = path.toLowerCase();
    return EXECUTABLE_EXTENSIONS.some(ext => lower.endsWith(ext));
  }

  private matchesPatterns(path: string, patterns: string[]): boolean {
    if (patterns.length === 0) return false;

    return patterns.some(pattern => {
      // Simple glob matching
      const regex = this.globToRegex(pattern);
      return regex.test(path);
    });
  }

  private globToRegex(glob: string): RegExp {
    const escaped = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, 'i');
  }

  private logAudit(
    operation: FileOperation,
    path: string,
    requesterId: string,
    allowed: boolean,
    reason: string
  ): void {
    const entry: AuditLogEntry = {
      id: this.generateId(),
      operation,
      path,
      requesterId,
      allowed,
      reason,
      timestamp: new Date(),
    };

    this.auditLog.push(entry);

    // Cleanup old entries periodically
    if (this.auditLog.length > 10000) {
      this.cleanupAuditLog();
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private emitApprovalRequest(request: PermissionRequest): void {
    // In Electron, this would send to renderer via IPC
    if (typeof window !== 'undefined' && window.electron?.events) {
      // Emit custom event for UI
      console.log('[FileSystemPermission] Approval request:', request);
    }
  }

  private loadSettings(): void {
    // In production, load from persistent storage
    // For now, use defaults
  }

  private saveSettings(): void {
    // In production, save to persistent storage
    console.log('[FileSystemPermission] Settings updated:', this.settings);
  }

  private saveWorkspaces(): void {
    // In production, save to persistent storage
    console.log('[FileSystemPermission] Workspaces saved:', this.workspaces.size);
  }
}

// Export singleton
export const fileSystemPermissionService = new FileSystemPermissionService();

// Export composable
export function useFileSystemPermission() {
  return {
    // Workspace management
    addWorkspace: (config: Omit<WorkspaceConfig, 'id' | 'createdAt'>) =>
      fileSystemPermissionService.addWorkspace(config),
    removeWorkspace: (id: string) =>
      fileSystemPermissionService.removeWorkspace(id),
    getWorkspaces: () =>
      fileSystemPermissionService.getWorkspaces(),
    updateWorkspace: (id: string, updates: Partial<WorkspaceConfig>) =>
      fileSystemPermissionService.updateWorkspace(id, updates),

    // Permission checking
    checkPermission: (operation: FileOperation, path: string, requesterId: string, reason?: string) =>
      fileSystemPermissionService.checkPermission(operation, path, requesterId, reason),
    waitForApproval: (requestId: string, timeoutMs?: number) =>
      fileSystemPermissionService.waitForApproval(requestId, timeoutMs),
    approveRequest: (requestId: string) =>
      fileSystemPermissionService.approveRequest(requestId),
    denyRequest: (requestId: string) =>
      fileSystemPermissionService.denyRequest(requestId),
    getPendingRequests: () =>
      fileSystemPermissionService.getPendingRequests(),

    // Settings
    getSettings: () =>
      fileSystemPermissionService.getSettings(),
    updateSettings: (updates: Partial<SecuritySettings>) =>
      fileSystemPermissionService.updateSettings(updates),
    toggleSafeMode: () =>
      fileSystemPermissionService.toggleSafeMode(),

    // Audit
    getAuditLog: (limit?: number) =>
      fileSystemPermissionService.getAuditLog(limit),
    cleanupAuditLog: () =>
      fileSystemPermissionService.cleanupAuditLog(),
  };
}
