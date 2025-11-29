/**
 * Auto-Updater Service for Electron
 *
 * Handles automatic update checking, downloading, and installation
 * with user notification dialogs.
 */

import { app, dialog, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater, UpdateInfo, ProgressInfo } from 'electron-updater';
import log from 'electron-log';

// ========================================
// Types
// ========================================

export interface UpdateConfig {
  checkOnStartup: boolean;
  checkInterval: number; // in milliseconds
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
}

export interface UpdateStatus {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  progress: number;
  version: string | null;
  releaseNotes: string | null;
  error: string | null;
}

// ========================================
// Default Configuration
// ========================================

const defaultConfig: UpdateConfig = {
  checkOnStartup: true,
  checkInterval: 4 * 60 * 60 * 1000, // 4 hours
  allowPrerelease: false,
  allowDowngrade: false,
  autoDownload: false,
  autoInstallOnAppQuit: true,
};

// ========================================
// Auto-Updater Service
// ========================================

export class AutoUpdaterService {
  private config: UpdateConfig;
  private mainWindow: BrowserWindow | null = null;
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private status: UpdateStatus = {
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    progress: 0,
    version: null,
    releaseNotes: null,
    error: null,
  };

  constructor(config: Partial<UpdateConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.configureAutoUpdater();
    this.setupEventListeners();
    this.setupIpcHandlers();
  }

  // ========================================
  // Public API
  // ========================================

  /**
   * Initialize the auto-updater with the main window
   */
  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;

    // Check for updates on startup
    if (this.config.checkOnStartup) {
      // Delay initial check to allow app to fully load
      setTimeout(() => {
        this.checkForUpdates(true);
      }, 5000);
    }

    // Schedule periodic update checks
    if (this.config.checkInterval > 0) {
      this.checkTimer = setInterval(() => {
        this.checkForUpdates(true);
      }, this.config.checkInterval);
    }
  }

  /**
   * Manually check for updates
   */
  async checkForUpdates(silent = false): Promise<void> {
    if (this.status.checking) {
      return;
    }

    this.updateStatus({ checking: true, error: null });
    this.sendStatusToRenderer();

    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result) {
        if (!silent) {
          await this.showNoUpdateDialog();
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error('Update check failed:', errorMessage);
      this.updateStatus({ checking: false, error: errorMessage });

      if (!silent) {
        await this.showErrorDialog(errorMessage);
      }
    }
  }

  /**
   * Download the available update
   */
  async downloadUpdate(): Promise<void> {
    if (!this.status.available || this.status.downloading) {
      return;
    }

    this.updateStatus({ downloading: true, progress: 0 });
    this.sendStatusToRenderer();

    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      log.error('Update download failed:', errorMessage);
      this.updateStatus({ downloading: false, error: errorMessage });
      this.sendStatusToRenderer();
    }
  }

  /**
   * Install the downloaded update and restart
   */
  quitAndInstall(): void {
    if (!this.status.downloaded) {
      return;
    }

    // Set flag to prevent any additional actions
    app.isQuitting = true;

    autoUpdater.quitAndInstall(false, true);
  }

  /**
   * Get current update status
   */
  getStatus(): UpdateStatus {
    return { ...this.status };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<UpdateConfig>): void {
    this.config = { ...this.config, ...config };
    this.configureAutoUpdater();
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  // ========================================
  // Private Methods
  // ========================================

  private configureAutoUpdater(): void {
    // Configure logging
    autoUpdater.logger = log;
    log.transports.file.level = 'info';

    // Configure update settings
    autoUpdater.autoDownload = this.config.autoDownload;
    autoUpdater.autoInstallOnAppQuit = this.config.autoInstallOnAppQuit;
    autoUpdater.allowPrerelease = this.config.allowPrerelease;
    autoUpdater.allowDowngrade = this.config.allowDowngrade;

    // For development testing
    if (process.env.NODE_ENV === 'development') {
      autoUpdater.forceDevUpdateConfig = true;
    }
  }

  private setupEventListeners(): void {
    autoUpdater.on('checking-for-update', () => {
      log.info('Checking for update...');
      this.updateStatus({ checking: true });
      this.sendStatusToRenderer();
    });

    autoUpdater.on('update-available', async (info: UpdateInfo) => {
      log.info('Update available:', info.version);
      this.updateStatus({
        checking: false,
        available: true,
        version: info.version,
        releaseNotes: this.formatReleaseNotes(info.releaseNotes),
      });
      this.sendStatusToRenderer();

      // Show update available dialog
      await this.showUpdateAvailableDialog(info);
    });

    autoUpdater.on('update-not-available', () => {
      log.info('Update not available');
      this.updateStatus({
        checking: false,
        available: false,
      });
      this.sendStatusToRenderer();
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      log.info(`Download progress: ${progress.percent.toFixed(1)}%`);
      this.updateStatus({
        downloading: true,
        progress: progress.percent,
      });
      this.sendStatusToRenderer();

      // Update progress in dock (macOS) or taskbar (Windows)
      this.updateDownloadProgress(progress.percent);
    });

    autoUpdater.on('update-downloaded', async (info: UpdateInfo) => {
      log.info('Update downloaded:', info.version);
      this.updateStatus({
        downloading: false,
        downloaded: true,
        progress: 100,
      });
      this.sendStatusToRenderer();

      // Clear progress indicator
      this.updateDownloadProgress(-1);

      // Show update ready dialog
      await this.showUpdateReadyDialog(info);
    });

    autoUpdater.on('error', (error: Error) => {
      log.error('Auto-updater error:', error);
      this.updateStatus({
        checking: false,
        downloading: false,
        error: error.message,
      });
      this.sendStatusToRenderer();
    });
  }

  private setupIpcHandlers(): void {
    ipcMain.handle('updater:check', async () => {
      await this.checkForUpdates(false);
      return this.status;
    });

    ipcMain.handle('updater:download', async () => {
      await this.downloadUpdate();
      return this.status;
    });

    ipcMain.handle('updater:install', () => {
      this.quitAndInstall();
    });

    ipcMain.handle('updater:status', () => {
      return this.status;
    });

    ipcMain.handle('updater:config', (_event, config: Partial<UpdateConfig>) => {
      this.setConfig(config);
      return this.config;
    });
  }

  private updateStatus(updates: Partial<UpdateStatus>): void {
    this.status = { ...this.status, ...updates };
  }

  private sendStatusToRenderer(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('updater:status-changed', this.status);
    }
  }

  private updateDownloadProgress(percent: number): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      // -1 means remove progress indicator
      this.mainWindow.setProgressBar(percent >= 0 ? percent / 100 : -1);
    }
  }

  private formatReleaseNotes(notes: string | ReleaseNoteInfo[] | null | undefined): string | null {
    if (!notes) return null;

    if (typeof notes === 'string') {
      return notes;
    }

    // Handle array of release notes
    return notes
      .map((note) => {
        if (typeof note === 'string') return note;
        return `${note.version}:\n${note.note}`;
      })
      .join('\n\n');
  }

  // ========================================
  // Dialog Methods
  // ========================================

  private async showUpdateAvailableDialog(info: UpdateInfo): Promise<void> {
    const releaseNotes = this.formatReleaseNotes(info.releaseNotes);

    const result = await dialog.showMessageBox(this.mainWindow!, {
      type: 'info',
      title: '업데이트 가능',
      message: `새 버전 ${info.version}이(가) 사용 가능합니다.`,
      detail: releaseNotes
        ? `릴리스 노트:\n${releaseNotes.substring(0, 500)}${releaseNotes.length > 500 ? '...' : ''}`
        : '지금 다운로드하시겠습니까?',
      buttons: ['지금 다운로드', '나중에'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      await this.downloadUpdate();
    }
  }

  private async showUpdateReadyDialog(info: UpdateInfo): Promise<void> {
    const result = await dialog.showMessageBox(this.mainWindow!, {
      type: 'info',
      title: '업데이트 준비 완료',
      message: `버전 ${info.version} 설치 준비가 완료되었습니다.`,
      detail: '지금 재시작하여 업데이트를 적용하시겠습니까?',
      buttons: ['지금 재시작', '나중에'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      this.quitAndInstall();
    }
  }

  private async showNoUpdateDialog(): Promise<void> {
    await dialog.showMessageBox(this.mainWindow!, {
      type: 'info',
      title: '업데이트 없음',
      message: '현재 최신 버전을 사용 중입니다.',
      buttons: ['확인'],
    });
  }

  private async showErrorDialog(errorMessage: string): Promise<void> {
    await dialog.showMessageBox(this.mainWindow!, {
      type: 'error',
      title: '업데이트 오류',
      message: '업데이트 확인 중 오류가 발생했습니다.',
      detail: errorMessage,
      buttons: ['확인'],
    });
  }
}

// ========================================
// Type Augmentation
// ========================================

interface ReleaseNoteInfo {
  version: string;
  note: string;
}

declare module 'electron' {
  interface App {
    isQuitting?: boolean;
  }
}

// ========================================
// Singleton Instance
// ========================================

let updaterInstance: AutoUpdaterService | null = null;

export function initializeAutoUpdater(config?: Partial<UpdateConfig>): AutoUpdaterService {
  if (!updaterInstance) {
    updaterInstance = new AutoUpdaterService(config);
  }
  return updaterInstance;
}

export function getAutoUpdater(): AutoUpdaterService | null {
  return updaterInstance;
}

export default AutoUpdaterService;
