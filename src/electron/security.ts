/**
 * Electron Security Module
 *
 * Implements security best practices for Electron applications:
 * - Content Security Policy (CSP)
 * - Navigation protection
 * - New window handling
 * - Permission handling
 * - Web preferences hardening
 */

import { app, BrowserWindow, session, shell, WebContents, HandlerDetails } from 'electron';
import log from 'electron-log';

// ========================================
// Types
// ========================================

export interface SecurityConfig {
  csp: ContentSecurityPolicy;
  allowedNavigationHosts: string[];
  allowedExternalHosts: string[];
  enableDevTools: boolean;
  enableRemoteModule: boolean;
}

export interface ContentSecurityPolicy {
  'default-src': string[];
  'script-src': string[];
  'style-src': string[];
  'img-src': string[];
  'font-src': string[];
  'connect-src': string[];
  'media-src': string[];
  'object-src': string[];
  'frame-src': string[];
  'worker-src': string[];
  'child-src': string[];
  'form-action': string[];
  'frame-ancestors': string[];
  'base-uri': string[];
  'upgrade-insecure-requests'?: boolean;
}

// ========================================
// Default Configuration
// ========================================

const defaultCSP: ContentSecurityPolicy = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Required for Vue in dev mode
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'img-src': ["'self'", 'data:', 'https:', 'blob:'],
  'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
  'connect-src': [
    "'self'",
    'https://api.openai.com',
    'https://api.anthropic.com',
    'https://generativelanguage.googleapis.com',
    'https://api.github.com',
    'https://gitlab.com',
    'https://api.bitbucket.org',
    'https://slack.com',
    'https://discord.com',
    'https://www.googleapis.com',
    'https://oauth2.googleapis.com',
    'https://accounts.google.com',
    'wss://*.slack.com',
    'wss://*.discord.gg',
    'ws://localhost:*', // Development HMR
    'http://localhost:*', // Development server
  ],
  'media-src': ["'self'", 'blob:'],
  'object-src': ["'none'"],
  'frame-src': ["'self'", 'https://accounts.google.com'],
  'worker-src': ["'self'", 'blob:'],
  'child-src': ["'self'", 'blob:'],
  'form-action': ["'self'"],
  'frame-ancestors': ["'self'"],
  'base-uri': ["'self'"],
  'upgrade-insecure-requests': true,
};

const defaultConfig: SecurityConfig = {
  csp: defaultCSP,
  allowedNavigationHosts: [
    'localhost',
    '127.0.0.1',
    'accounts.google.com',
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'slack.com',
    'discord.com',
  ],
  allowedExternalHosts: [
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'slack.com',
    'discord.com',
    'accounts.google.com',
    'docs.google.com',
    'drive.google.com',
  ],
  enableDevTools: process.env.NODE_ENV === 'development',
  enableRemoteModule: false,
};

// ========================================
// Security Service
// ========================================

export class SecurityService {
  private config: SecurityConfig;

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = {
      ...defaultConfig,
      ...config,
      csp: { ...defaultCSP, ...config.csp },
    };
  }

  /**
   * Initialize security measures for the application
   */
  initialize(): void {
    this.setupAppSecurity();
    this.setupSessionSecurity();
    log.info('Security module initialized');
  }

  /**
   * Apply security settings to a BrowserWindow
   */
  applyToWindow(window: BrowserWindow): void {
    this.setupNavigationProtection(window);
    this.setupNewWindowHandler(window);
    this.setupPermissionHandlers(window);

    // Disable devtools in production
    if (!this.config.enableDevTools) {
      window.webContents.on('devtools-opened', () => {
        window.webContents.closeDevTools();
      });
    }
  }

  /**
   * Get secure web preferences for BrowserWindow
   */
  getSecureWebPreferences(): Electron.WebPreferences {
    return {
      // Disable Node.js integration in renderer
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,

      // Enable context isolation
      contextIsolation: true,

      // Disable remote module
      enableRemoteModule: this.config.enableRemoteModule,

      // Sandbox renderer process
      sandbox: true,

      // Disable webview tag
      webviewTag: false,

      // Disable spell checker to prevent potential leaks
      spellcheck: false,

      // Use safe dialogs
      safeDialogs: true,

      // Disable navigation to data URLs
      navigateOnDragDrop: false,

      // Enable web security
      webSecurity: true,

      // Allow running insecure content only in development
      allowRunningInsecureContent: false,

      // Disable experimental features
      experimentalFeatures: false,

      // Enable v8 cache for performance
      v8CacheOptions: 'bypassHeatCheck',

      // Preload script path will be set by the main process
    };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<SecurityConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      csp: { ...this.config.csp, ...config.csp },
    };
  }

  // ========================================
  // Private Methods
  // ========================================

  private setupAppSecurity(): void {
    // Disable navigation to file:// URLs
    app.on('web-contents-created', (_event, contents) => {
      this.setupWebContentsProtection(contents);
    });

    // Handle certificate errors
    app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
      // In development, you might want to ignore certificate errors
      if (process.env.NODE_ENV === 'development') {
        event.preventDefault();
        callback(true);
      } else {
        callback(false);
      }
    });

    // Prevent renderer from changing webPreferences
    app.on('web-contents-created', (_event, contents) => {
      contents.on('will-attach-webview', (event, webPreferences) => {
        // Strip away preload scripts if any
        delete webPreferences.preload;

        // Disable Node.js integration
        webPreferences.nodeIntegration = false;
        webPreferences.nodeIntegrationInWorker = false;

        // Enable context isolation
        webPreferences.contextIsolation = true;

        // Prevent webview
        event.preventDefault();
        log.warn('Prevented webview attachment');
      });
    });
  }

  private setupSessionSecurity(): void {
    // Set CSP headers for all responses
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const cspHeader = this.buildCSPHeader();

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [cspHeader],
          'X-Content-Type-Options': ['nosniff'],
          'X-Frame-Options': ['DENY'],
          'X-XSS-Protection': ['1; mode=block'],
          'Referrer-Policy': ['strict-origin-when-cross-origin'],
          'Permissions-Policy': [
            'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
          ],
        },
      });
    });

    // Handle permission requests
    session.defaultSession.setPermissionRequestHandler(
      (webContents, permission, callback, details) => {
        const allowedPermissions = ['clipboard-read', 'clipboard-write', 'notifications'];

        if (allowedPermissions.includes(permission)) {
          callback(true);
        } else {
          log.warn(`Denied permission request: ${permission}`, details);
          callback(false);
        }
      }
    );

    // Handle permission checks
    session.defaultSession.setPermissionCheckHandler(
      (_webContents, permission, _requestingOrigin, _details) => {
        const allowedPermissions = ['clipboard-read', 'clipboard-write', 'notifications'];
        return allowedPermissions.includes(permission);
      }
    );
  }

  private setupWebContentsProtection(contents: WebContents): void {
    // Block navigation to unwanted URLs
    contents.on('will-navigate', (event, url) => {
      if (!this.isAllowedNavigation(url)) {
        event.preventDefault();
        log.warn(`Blocked navigation to: ${url}`);
      }
    });

    // Handle new window requests
    contents.setWindowOpenHandler((details: HandlerDetails) => {
      const url = details.url;

      if (this.isAllowedExternalURL(url)) {
        // Open in external browser
        shell.openExternal(url);
      } else {
        log.warn(`Blocked new window for: ${url}`);
      }

      return { action: 'deny' };
    });
  }

  private setupNavigationProtection(window: BrowserWindow): void {
    const contents = window.webContents;

    contents.on('will-navigate', (event, url) => {
      if (!this.isAllowedNavigation(url)) {
        event.preventDefault();
        log.warn(`Blocked window navigation to: ${url}`);
      }
    });

    // Prevent redirects to unwanted URLs
    contents.on('will-redirect', (event, url) => {
      if (!this.isAllowedNavigation(url)) {
        event.preventDefault();
        log.warn(`Blocked redirect to: ${url}`);
      }
    });
  }

  private setupNewWindowHandler(window: BrowserWindow): void {
    window.webContents.setWindowOpenHandler((details: HandlerDetails) => {
      const url = details.url;

      if (this.isAllowedExternalURL(url)) {
        shell.openExternal(url);
      } else {
        log.warn(`Blocked new window request: ${url}`);
      }

      return { action: 'deny' };
    });
  }

  private setupPermissionHandlers(_window: BrowserWindow): void {
    // Window-specific permission handling can be added here
  }

  private buildCSPHeader(): string {
    const directives: string[] = [];

    for (const [directive, values] of Object.entries(this.config.csp)) {
      if (directive === 'upgrade-insecure-requests') {
        if (values === true) {
          directives.push('upgrade-insecure-requests');
        }
      } else if (Array.isArray(values)) {
        directives.push(`${directive} ${values.join(' ')}`);
      }
    }

    return directives.join('; ');
  }

  private isAllowedNavigation(url: string): boolean {
    try {
      const parsed = new URL(url);

      // Always allow app URLs
      if (parsed.protocol === 'file:' || parsed.protocol === 'app:') {
        return true;
      }

      // Allow localhost in development
      if (
        process.env.NODE_ENV === 'development' &&
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
      ) {
        return true;
      }

      // Check against allowed hosts
      return this.config.allowedNavigationHosts.some(
        (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
      );
    } catch {
      return false;
    }
  }

  private isAllowedExternalURL(url: string): boolean {
    try {
      const parsed = new URL(url);

      // Only allow http(s) URLs
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
      }

      // Check against allowed external hosts
      return this.config.allowedExternalHosts.some(
        (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
      );
    } catch {
      return false;
    }
  }
}

// ========================================
// Utility Functions
// ========================================

/**
 * Check if running in a secure context
 */
export function isSecureContext(): boolean {
  return (
    !app.commandLine.hasSwitch('ignore-certificate-errors') &&
    !app.commandLine.hasSwitch('disable-web-security')
  );
}

/**
 * Get security report for debugging
 */
export function getSecurityReport(): Record<string, unknown> {
  return {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
    isSecureContext: isSecureContext(),
    environment: process.env.NODE_ENV,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
  };
}

// ========================================
// Singleton Instance
// ========================================

let securityInstance: SecurityService | null = null;

export function initializeSecurity(config?: Partial<SecurityConfig>): SecurityService {
  if (!securityInstance) {
    securityInstance = new SecurityService(config);
    securityInstance.initialize();
  }
  return securityInstance;
}

export function getSecurity(): SecurityService | null {
  return securityInstance;
}

export default SecurityService;
