/**
 * Logging and Error Tracking Service
 *
 * Provides structured logging with multiple transports,
 * error tracking integration, and crash reporting.
 */

import path from 'path';
import fs from 'fs';
import { app } from 'electron';

// ========================================
// Types
// ========================================

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'verbose';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  enableSentry: boolean;
  sentryDsn?: string;
  maxFileSize: number; // in bytes
  maxFiles: number;
  logPath?: string;
  appName: string;
  appVersion: string;
}

export interface TransportOptions {
  level: LogLevel;
  format?: (entry: LogEntry) => string;
}

// ========================================
// Constants
// ========================================

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4,
};

const DEFAULT_CONFIG: LoggerConfig = {
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  enableConsole: true,
  enableFile: true,
  enableSentry: process.env.NODE_ENV === 'production',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  appName: 'FlowMind',
  appVersion: '1.0.0',
};

// ========================================
// Log Formatter
// ========================================

function formatLogEntry(entry: LogEntry): string {
  const parts = [
    entry.timestamp,
    `[${entry.level.toUpperCase()}]`,
    entry.context ? `[${entry.context}]` : '',
    entry.message,
  ].filter(Boolean);

  let formatted = parts.join(' ');

  if (entry.data && Object.keys(entry.data).length > 0) {
    formatted += ` ${JSON.stringify(entry.data)}`;
  }

  if (entry.error) {
    formatted += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
    if (entry.error.stack) {
      formatted += `\n  Stack: ${entry.error.stack}`;
    }
  }

  return formatted;
}

function formatJsonEntry(entry: LogEntry): string {
  return JSON.stringify(entry);
}

// ========================================
// Transport Classes
// ========================================

abstract class Transport {
  protected options: TransportOptions;

  constructor(options: TransportOptions) {
    this.options = options;
  }

  abstract write(entry: LogEntry): void;

  shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.options.level];
  }
}

class ConsoleTransport extends Transport {
  write(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    const formatted = formatLogEntry(entry);
    const consoleFn = this.getConsoleMethod(entry.level);
    consoleFn(formatted);
  }

  private getConsoleMethod(level: LogLevel): (...args: unknown[]) => void {
    switch (level) {
      case 'error':
        return console.error;
      case 'warn':
        return console.warn;
      case 'debug':
      case 'verbose':
        return console.debug;
      default:
        return console.log;
    }
  }
}

class FileTransport extends Transport {
  private logPath: string;
  private currentFile: string;
  private maxFileSize: number;
  private maxFiles: number;
  private writeStream: fs.WriteStream | null = null;

  constructor(
    options: TransportOptions,
    logPath: string,
    maxFileSize: number,
    maxFiles: number
  ) {
    super(options);
    this.logPath = logPath;
    this.maxFileSize = maxFileSize;
    this.maxFiles = maxFiles;
    this.currentFile = this.getLogFilePath();
    this.ensureLogDirectory();
  }

  write(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    this.rotateIfNeeded();

    const formatted = formatJsonEntry(entry) + '\n';

    if (!this.writeStream) {
      this.writeStream = fs.createWriteStream(this.currentFile, { flags: 'a' });
    }

    this.writeStream.write(formatted);
  }

  close(): void {
    if (this.writeStream) {
      this.writeStream.end();
      this.writeStream = null;
    }
  }

  private getLogFilePath(): string {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logPath, `flowmind-${date}.log`);
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logPath)) {
      fs.mkdirSync(this.logPath, { recursive: true });
    }
  }

  private rotateIfNeeded(): void {
    const newFile = this.getLogFilePath();

    // Check if we need a new file due to date change
    if (newFile !== this.currentFile) {
      this.close();
      this.currentFile = newFile;
      this.cleanOldFiles();
      return;
    }

    // Check if current file exceeds max size
    try {
      if (fs.existsSync(this.currentFile)) {
        const stats = fs.statSync(this.currentFile);
        if (stats.size >= this.maxFileSize) {
          this.close();
          const rotatedFile = this.currentFile.replace('.log', `-${Date.now()}.log`);
          fs.renameSync(this.currentFile, rotatedFile);
          this.cleanOldFiles();
        }
      }
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  private cleanOldFiles(): void {
    try {
      const files = fs
        .readdirSync(this.logPath)
        .filter((f) => f.startsWith('flowmind-') && f.endsWith('.log'))
        .map((f) => ({
          name: f,
          path: path.join(this.logPath, f),
          mtime: fs.statSync(path.join(this.logPath, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.mtime - a.mtime);

      // Remove files beyond max count
      while (files.length > this.maxFiles) {
        const oldest = files.pop();
        if (oldest) {
          fs.unlinkSync(oldest.path);
        }
      }
    } catch (error) {
      console.error('Failed to clean old log files:', error);
    }
  }
}

class SentryTransport extends Transport {
  private dsn: string;
  private appName: string;
  private appVersion: string;
  private initialized = false;

  constructor(
    options: TransportOptions,
    dsn: string,
    appName: string,
    appVersion: string
  ) {
    super(options);
    this.dsn = dsn;
    this.appName = appName;
    this.appVersion = appVersion;
  }

  async initialize(): Promise<void> {
    if (this.initialized || !this.dsn) return;

    try {
      // Dynamic import to avoid bundling Sentry in development
      const Sentry = await import('@sentry/electron');

      Sentry.init({
        dsn: this.dsn,
        release: `${this.appName}@${this.appVersion}`,
        environment: process.env.NODE_ENV || 'production',
        tracesSampleRate: 0.1,
        beforeSend(event) {
          // Sanitize sensitive data
          if (event.user) {
            delete event.user.ip_address;
          }
          return event;
        },
      });

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Sentry:', error);
    }
  }

  write(entry: LogEntry): void {
    if (!this.shouldLog(entry.level) || !this.initialized) return;

    // Only send errors and warnings to Sentry
    if (entry.level !== 'error' && entry.level !== 'warn') return;

    this.sendToSentry(entry).catch(console.error);
  }

  private async sendToSentry(entry: LogEntry): Promise<void> {
    try {
      const Sentry = await import('@sentry/electron');

      if (entry.error) {
        const error = new Error(entry.error.message);
        error.name = entry.error.name;
        if (entry.error.stack) {
          error.stack = entry.error.stack;
        }

        Sentry.captureException(error, {
          level: entry.level as Sentry.SeverityLevel,
          tags: {
            context: entry.context,
          },
          extra: entry.data,
        });
      } else {
        Sentry.captureMessage(entry.message, {
          level: entry.level as Sentry.SeverityLevel,
          tags: {
            context: entry.context,
          },
          extra: entry.data,
        });
      }
    } catch (error) {
      console.error('Failed to send to Sentry:', error);
    }
  }
}

// ========================================
// Logger Class
// ========================================

export class Logger {
  private config: LoggerConfig;
  private transports: Transport[] = [];
  private context?: string;

  constructor(config: Partial<LoggerConfig> = {}, context?: string) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.context = context;
    this.initializeTransports();
  }

  // ========================================
  // Logging Methods
  // ========================================

  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    this.log('error', message, data, error);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  verbose(message: string, data?: Record<string, unknown>): void {
    this.log('verbose', message, data);
  }

  // ========================================
  // Public API
  // ========================================

  /**
   * Create a child logger with a specific context
   */
  child(context: string): Logger {
    const childLogger = new Logger(this.config, context);
    childLogger.transports = this.transports;
    return childLogger;
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
    this.transports.forEach((transport) => {
      transport['options'].level = level;
    });
  }

  /**
   * Get the log file path
   */
  getLogPath(): string {
    return this.config.logPath || this.getDefaultLogPath();
  }

  /**
   * Flush and close all transports
   */
  async close(): Promise<void> {
    for (const transport of this.transports) {
      if (transport instanceof FileTransport) {
        transport.close();
      }
    }
  }

  // ========================================
  // Private Methods
  // ========================================

  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: Error | unknown
  ): void {
    if (LOG_LEVELS[level] > LOG_LEVELS[this.config.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: this.context,
      data,
    };

    if (error) {
      if (error instanceof Error) {
        entry.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      } else {
        entry.error = {
          name: 'UnknownError',
          message: String(error),
        };
      }
    }

    this.transports.forEach((transport) => {
      try {
        transport.write(entry);
      } catch (err) {
        console.error('Transport write failed:', err);
      }
    });
  }

  private initializeTransports(): void {
    const baseOptions: TransportOptions = {
      level: this.config.level,
    };

    if (this.config.enableConsole) {
      this.transports.push(new ConsoleTransport(baseOptions));
    }

    if (this.config.enableFile) {
      const logPath = this.config.logPath || this.getDefaultLogPath();
      this.transports.push(
        new FileTransport(
          baseOptions,
          logPath,
          this.config.maxFileSize,
          this.config.maxFiles
        )
      );
    }

    if (this.config.enableSentry && this.config.sentryDsn) {
      const sentryTransport = new SentryTransport(
        { level: 'warn' }, // Only send warnings and errors to Sentry
        this.config.sentryDsn,
        this.config.appName,
        this.config.appVersion
      );
      sentryTransport.initialize();
      this.transports.push(sentryTransport);
    }
  }

  private getDefaultLogPath(): string {
    try {
      return path.join(app.getPath('userData'), 'logs');
    } catch {
      // Fallback for when app is not ready
      return path.join(process.cwd(), 'logs');
    }
  }
}

// ========================================
// Performance Monitoring
// ========================================

export class PerformanceMonitor {
  private logger: Logger;
  private metrics: Map<string, number[]> = new Map();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Start a performance measurement
   */
  startMeasure(name: string): () => void {
    const start = performance.now();

    return () => {
      const duration = performance.now() - start;
      this.recordMetric(name, duration);
    };
  }

  /**
   * Record a metric value
   */
  recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const values = this.metrics.get(name)!;
    values.push(value);

    // Keep only last 100 measurements
    if (values.length > 100) {
      values.shift();
    }

    // Log if threshold exceeded
    if (value > 1000) {
      this.logger.warn(`Performance warning: ${name} took ${value.toFixed(2)}ms`);
    }
  }

  /**
   * Get metrics summary
   */
  getMetrics(name: string): { avg: number; min: number; max: number; count: number } | null {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return null;

    return {
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    };
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
  }
}

// ========================================
// Singleton Instance
// ========================================

let loggerInstance: Logger | null = null;
let performanceMonitor: PerformanceMonitor | null = null;

export function initializeLogger(config?: Partial<LoggerConfig>): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger(config);
  }
  return loggerInstance;
}

export function getLogger(context?: string): Logger {
  if (!loggerInstance) {
    loggerInstance = new Logger();
  }
  return context ? loggerInstance.child(context) : loggerInstance;
}

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!performanceMonitor) {
    performanceMonitor = new PerformanceMonitor(getLogger('performance'));
  }
  return performanceMonitor;
}

export default Logger;
