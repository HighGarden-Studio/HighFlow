/**
 * Local Agent Session Manager
 *
 * Manages interactive sessions with local AI coding agents (Claude Code, Codex, Antigravity)
 * Provides session-based communication with context preservation
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getAdapterForAgent, type LocalAgentMessageAdapter } from './local-agent-adapters';

// Session state
export type SessionStatus = 'idle' | 'running' | 'waiting' | 'error' | 'closed';

// Message types for stream-json format
export interface AgentMessage {
    type: 'user' | 'assistant' | 'system' | 'result';
    content: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}

export interface SessionInfo {
    id: string;
    agentType: 'claude' | 'codex';
    status: SessionStatus;
    workingDirectory: string;
    createdAt: Date;
    lastActivityAt: Date;
    messageCount: number;
}

export interface SendMessageOptions {
    timeout?: number; // ms, default 300000 (5 min)
    tools?: string[];
    model?: string;
    onChunk?: (chunk: string) => void;
}

export interface AgentResponse {
    success: boolean;
    content: string;
    error?: string;
    duration: number; // ms
    tokenUsage?: {
        input: number;
        output: number;
    };
    transcript?: TranscriptItem[];
}

export interface TranscriptItem {
    role: 'user' | 'assistant' | 'system';
    content?: string;
    type: 'message' | 'tool_use' | 'tool_result' | 'termination';
    timestamp: Date;
    metadata?: Record<string, unknown>;
}

/**
 * Get all nvm node version bin directories
 */
function getNvmBinPaths(home: string): string[] {
    const nvmVersionsDir = join(home, '.nvm', 'versions', 'node');
    const paths: string[] = [];

    try {
        if (existsSync(nvmVersionsDir)) {
            const versions = readdirSync(nvmVersionsDir);
            for (const version of versions) {
                const binPath = join(nvmVersionsDir, version, 'bin');
                if (existsSync(binPath)) {
                    paths.push(binPath);
                }
            }
        }
    } catch (error) {
        console.warn('Failed to scan nvm directories:', error);
    }

    return paths;
}

/**
 * Get enhanced PATH including common npm global directories
 */
function getEnhancedPath(): string {
    const currentPath = process.env.PATH || '';
    const additionalPaths: string[] = [];

    if (process.platform === 'darwin' || process.platform === 'linux') {
        const home = process.env.HOME || '';
        additionalPaths.push(...getNvmBinPaths(home));
        additionalPaths.push(
            '/usr/local/bin',
            '/opt/homebrew/bin',
            `${home}/.npm-global/bin`,
            `${home}/.local/bin`,
            `${home}/.yarn/bin`,
            `${home}/.pnpm`,
            '/usr/bin'
        );
    } else if (process.platform === 'win32') {
        const appData = process.env.APPDATA || '';
        const home = process.env.USERPROFILE || '';
        additionalPaths.push(`${appData}\\npm`, `${home}\\.nvm`, 'C:\\Program Files\\nodejs');
    }

    return [...additionalPaths, currentPath].join(process.platform === 'win32' ? ';' : ':');
}

/**
 * Local Agent Session
 * Manages a single session with an AI agent
 */
export class LocalAgentSession extends EventEmitter {
    readonly id: string;
    readonly agentType: 'claude' | 'codex';
    readonly workingDirectory: string;
    private adapter: LocalAgentMessageAdapter;

    private process: ChildProcess | null = null;
    private status: SessionStatus = 'idle';
    private createdAt: Date;
    private lastActivityAt: Date;
    private messageCount: number = 0;
    private transcript: TranscriptItem[] = [];
    private responseBuffer: string = '';
    private currentResolve: ((response: AgentResponse) => void) | null = null;
    private currentReject: ((reason?: any) => void) | null = null;
    private currentOnChunk: ((chunk: string) => void) | null = null;
    private responseTimeout: NodeJS.Timeout | null = null;
    private isClosing: boolean = false; // Track intentional shutdown
    private executionMode: 'persistent' | 'oneshot' = 'persistent';
    private remoteThreadId: string | null = null; // Captured thread ID from agent
    private fullOutput: string = ''; // Capture full stdout for fallback

    constructor(agentType: 'claude' | 'codex', workingDirectory: string, sessionId?: string) {
        super();
        this.id = sessionId || randomUUID();
        this.agentType = agentType;
        this.workingDirectory = workingDirectory;
        this.adapter = getAdapterForAgent(agentType);
        this.createdAt = new Date();
        this.lastActivityAt = new Date();
        this.executionMode = agentType === 'claude' ? 'persistent' : 'oneshot';
    }

    getStatus(): SessionStatus {
        return this.status;
    }

    /**
     * Start the agent session
     */
    async start(): Promise<void> {
        if (this.process) {
            throw new Error('Session already started');
        }

        if (this.executionMode === 'oneshot') {
            console.log(
                `[LocalAgentSession] Starting ${this.agentType} session in one-shot mode (lazy spawn)`
            );
            this.status = 'idle';
            this.emit('started', this.getInfo());
            return;
        }

        const command = this.getCommand();
        const args = this.getStartArgs();

        console.log(
            `[LocalAgentSession] Starting ${this.agentType} session: ${command} ${args.join(' ')}`
        );

        this.process = spawn(command, args, {
            cwd: this.workingDirectory,
            env: {
                ...process.env,
                PATH: getEnhancedPath(),
            },
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.setupProcessHandlers();
        this.status = 'idle';
        this.emit('started', this.getInfo());
    }

    /**
     * Send a message to the agent and wait for response
     */
    async sendMessage(message: string, options: SendMessageOptions = {}): Promise<AgentResponse> {
        if (
            (!this.process && this.executionMode === 'persistent') ||
            this.status === 'closed' ||
            this.status === 'error'
        ) {
            throw new Error('Session not active');
        }

        if (this.status === 'running') {
            throw new Error('Another message is being processed');
        }

        const timeout = options.timeout ?? 0; // 0 = unlimited

        return new Promise((resolve, reject) => {
            this.currentResolve = resolve;
            this.currentReject = reject;
            this.currentOnChunk = options.onChunk || null;
            this.responseBuffer = '';
            this.transcript = [];

            this.status = 'running';
            this.lastActivityAt = new Date();

            // Set timeout only if positive
            if (timeout > 0) {
                this.responseTimeout = setTimeout(() => {
                    this.handleTimeout();
                }, timeout);
            }

            console.log(
                `[LocalAgentSession] Sending message to ${this.agentType}:`,
                message.substring(0, 100) + '...'
            );

            if (this.executionMode === 'oneshot') {
                // Spawn new process for this message
                const command = this.getCommand();

                // Construct command args
                const args: string[] = [];

                if (this.agentType === 'codex') {
                    args.push('exec', '--json');
                    if (this.remoteThreadId) {
                        args.push('resume', this.remoteThreadId);
                    } else if (this.messageCount > 0) {
                        args.push('resume', this.id);
                    }
                    args.push('--skip-git-repo-check');
                    args.push('--dangerously-bypass-approvals-and-sandbox');
                } else {
                    // Default fallback (should vary by agent)
                    args.push('exec');
                }

                // Add prompt as argument
                args.push(message);

                console.log(`[LocalAgentSession] One-shot command: ${command} ${args.join(' ')}`);

                this.process = spawn(command, args, {
                    cwd: this.workingDirectory,
                    env: { ...process.env, PATH: getEnhancedPath() },
                    stdio: ['ignore', 'pipe', 'pipe'], // Ignore stdin as we pass prompt in args
                });

                // Handle spawn errors immediately
                this.process.on('error', (err) => {
                    console.error(`[LocalAgentSession] Process spawn error:`, err);
                    if (this.currentReject) {
                        this.currentReject(err);
                    }
                    this.status = 'error';
                });

                this.setupProcessHandlers();
                this.messageCount++;
                this.emit('messageSent', { message, options });

                return;
            }

            // Persistent mode
            const input = this.formatInput(message, options);
            this.process!.stdin!.write(input + '\n');
            this.messageCount++;

            this.emit('messageSent', { message, options });
        });
    }

    /**
     * Close the session
     */
    async close(): Promise<void> {
        this.isClosing = true; // Mark as intentional shutdown

        if (this.responseTimeout) {
            clearTimeout(this.responseTimeout);
            this.responseTimeout = null;
        }

        if (this.process) {
            this.process.stdin?.end();
            this.process.kill('SIGTERM');

            // Force kill after 5 seconds
            setTimeout(() => {
                if (this.process && !this.process.killed) {
                    // Check if process is still alive
                    this.process.kill('SIGKILL');
                }
            }, 5000);
        }

        this.status = 'closed';
        this.emit('closed', this.getInfo());
    }

    /**
     * Get session info
     */
    getInfo(): SessionInfo {
        return {
            id: this.id,
            agentType: this.agentType,
            status: this.status,
            workingDirectory: this.workingDirectory,
            createdAt: this.createdAt,
            lastActivityAt: this.lastActivityAt,
            messageCount: this.messageCount,
        };
    }

    /**
     * Get the command for the agent type
     */
    private getCommand(): string {
        switch (this.agentType) {
            case 'claude':
                return 'claude';
            case 'codex':
                return 'codex';
            default:
                throw new Error(`Unknown agent type: ${this.agentType}`);
        }
    }

    /**
     * Get start arguments for the agent
     */
    private getStartArgs(): string[] {
        switch (this.agentType) {
            case 'claude':
                return [
                    '--print',
                    '--input-format',
                    'stream-json',
                    '--output-format',
                    'stream-json',
                    '--verbose', // Required for stream-json output
                    '--session-id',
                    this.id,
                    '--permission-mode',
                    'acceptEdits', // Automatically approve file edits and creations
                ];
            default:
                // Codex use oneshot exec mode, so start args are unused/empty
                return [];
        }
    }

    /**
     * Format input message for the agent using adapter
     */
    private formatInput(message: string, options: SendMessageOptions): string {
        return this.adapter.formatMessage(message, options);
    }

    /**
     * Setup process event handlers
     */
    private setupProcessHandlers(): void {
        if (!this.process) return;

        // Handle stdout
        this.process.stdout?.on('data', (data: Buffer) => {
            const text = data.toString();
            this.responseBuffer += text;
            this.fullOutput += text;
            this.emit('data', text);

            // Try to parse complete JSON responses
            this.tryParseResponse();
        });

        // Handle stderr
        this.process.stderr?.on('data', (data: Buffer) => {
            const text = data.toString();
            console.error(`[LocalAgentSession] ${this.agentType} stderr:`, text);
            // Do NOT emit 'error' here as it crashes the app for non-fatal warnings
        });

        // Handle process exit
        this.process.on('exit', (code, signal) => {
            const wasRunning = this.status === 'running';
            console.log(
                `[LocalAgentSession] ${this.agentType} exited with code ${code}, signal ${signal}`
            );
            this.status = 'closed';
            this.process = null;

            // Handle oneshot completions (exit code 0 is success)
            if (this.executionMode === 'oneshot' && code === 0) {
                if (this.currentResolve) {
                    console.log(
                        `[LocalAgentSession] ${this.agentType} oneshot finished successfully.`
                    );
                    // If we haven't received a specific completion event, construct one
                    this.completeResponse({ type: 'turn.completed', finished: true });
                }
                return;
            }

            // Only reject if not intentionally closing
            // Exit code 143 = 128 + 15 = SIGTERM (normal termination)
            if (this.currentReject && !this.isClosing) {
                this.currentReject(new Error(`Process exited unexpectedly with code ${code}`));
                this.currentReject = null;
                this.currentResolve = null;
                this.currentOnChunk = null;
            } else if (this.executionMode === 'oneshot' && wasRunning) {
                // Should not happen if code 0 is handled above, but catch-all for non-zero exit in oneshot
                console.log(`[LocalAgentSession] Oneshot process exited with non-zero code.`);
                // This case falls through to event emission, but we might want to ensure cleanup?
                // Actually the currentReject check above handles non-zero exits (Error).
            }

            this.emit('exit', { code, signal });
        });

        // Handle process error
        this.process.on('error', (error) => {
            console.error(`[LocalAgentSession] ${this.agentType} process error:`, error);
            this.status = 'error';

            if (this.currentReject) {
                this.currentReject(error);
                this.currentReject = null;
                this.currentResolve = null;
            }

            this.emit('processError', error);
        });
    }

    /**
     * Try to parse complete JSON responses from buffer
     */
    private tryParseResponse(): void {
        // For Claude Code stream-json, each line is a complete JSON object
        const lines = this.responseBuffer.split('\n');

        for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i]?.trim();
            if (!line) continue;

            try {
                const parsed = JSON.parse(line);
                this.handleParsedMessage(parsed);
            } catch {
                // Not valid JSON, might be partial or plain text
                console.log(`[LocalAgentSession] Non-JSON output:`, line.substring(0, 100));
            }
        }

        // Keep the last incomplete line in buffer
        this.responseBuffer = lines[lines.length - 1] ?? '';
    }

    /**
     * Handle a parsed message from the agent
     */
    private handleParsedMessage(message: Record<string, unknown>): void {
        console.log(`[LocalAgentSession] Received message type:`, message.type);
        if (message.type === 'item.completed' || message.type === 'item.started') {
            // Log content for debugging loop
            const item = message.item as any;
            if (item) {
                console.log(
                    `[LocalAgentSession] Item (${message.type}):`,
                    JSON.stringify(item).substring(0, 300)
                );
            }
        }

        // Codex event handling
        if (this.agentType === 'codex') {
            if (message.type === 'thread.started') {
                // If we didn't specify an ID (initial run), we might want to capture this.
                // But we are using our own ID for resumption.
                // Just log it.
                console.log(`[LocalAgentSession] Thread started: ${message.thread_id}`);
                if (message.thread_id) {
                    this.remoteThreadId = message.thread_id as string;
                }
            } else if (message.type === 'item.completed' || message.type === 'item.started') {
                const item = message.item as any;
                if (item?.type === 'agent_message' && item.text) {
                    // This is the content!
                    // For streaming, we might get partials? Docs say "agent_message".
                    // Assuming 'item.completed' has the full text.
                    if (message.type === 'item.completed') {
                        // Synthesize an 'assistant' message for compatibility
                        const compatibleMsg = {
                            type: 'assistant',
                            message: {
                                content: [{ type: 'text', text: item.text }],
                            },
                        };
                        this.captureTranscript(compatibleMsg);
                        this.emit('message', compatibleMsg);

                        if (this.currentOnChunk) {
                            this.currentOnChunk(item.text);
                        }
                    }
                }
            } else if (message.type === 'turn.completed') {
                // This indicates completion
                this.completeResponse({ ...message, finished: true });
            } else if (message.type === 'error') {
                console.error('[LocalAgentSession] Codex Error Event:', message);
            }
            return;
        }

        // Claude handling
        // Capture transcript
        this.captureTranscript(message);

        // Emit for real-time streaming
        this.emit('message', message);

        // Check if this is a final response
        if (this.isCompletionMessage(message)) {
            this.completeResponse(message);
        } else if (this.currentOnChunk && message.type === 'assistant') {
            const msgBody = message.message as any;
            if (msgBody?.content && Array.isArray(msgBody.content)) {
                const text = msgBody.content
                    .filter((c: any) => c.type === 'text')
                    .map((c: any) => c.text)
                    .join('');
                if (text) {
                    this.currentOnChunk(text);
                }
            }
        }
    }

    private captureTranscript(message: Record<string, unknown>): void {
        const timestamp = new Date();

        if (message.type === 'assistant') {
            const msgBody = message.message as Record<string, unknown>;
            if (msgBody?.content) {
                // Determine if text or tool use
                // msgBody.content is usually array of blocks
                this.transcript.push({
                    role: 'assistant',
                    type: 'message',
                    timestamp,
                    metadata: { raw: msgBody },
                });
            }
        } else if (message.type === 'user') {
            // Check for tool_use_result
            if (message.tool_use_result) {
                this.transcript.push({
                    role: 'user',
                    type: 'tool_result',
                    timestamp,
                    metadata: { result: message.tool_use_result },
                });
            }
        }
    }

    /**
     * Check if message indicates completion
     */
    private isCompletionMessage(message: Record<string, unknown>): boolean {
        // For Codex, handled in handleParsedMessage (turn.completed)
        // But for completeness:
        if (message.type === 'turn.completed') return true;

        // For Claude Code
        if (message.type === 'result') {
            return true;
        }

        if (message.type === 'assistant') {
            const msgBody = message.message as Record<string, unknown>;
            return msgBody?.stop_reason === 'end_turn';
        }

        // Check for completion flags
        if (message.done === true || message.finished === true) {
            return true;
        }

        return false;
    }

    /**
     * Complete the response and resolve promise
     */
    private completeResponse(message: Record<string, unknown>): void {
        if (this.responseTimeout) {
            clearTimeout(this.responseTimeout);
            this.responseTimeout = null;
        }

        // Check for error conditions
        const subtype = String(message.subtype || '');
        const isError =
            subtype === 'error_during_execution' ||
            subtype === 'error' ||
            message.is_error === true ||
            (Array.isArray(message.errors) && message.errors.length > 0);

        const response: AgentResponse = {
            success: !isError,
            // For Codex, turn.completed doesn't have content.
            // We should use the accumulated content from item.completed events or responseBuffer?
            // Since we synthesized 'message' events for item.completed, the frontend might have it.
            // But we need to return it here.
            // Let's use the transcript to verify content.
            content: String(
                message.content ||
                    message.text ||
                    message.result ||
                    (this.executionMode === 'oneshot' && this.fullOutput ? this.fullOutput : '') ||
                    (this.transcript.length > 0 ? 'See transcript' : '')
            ),
            duration: Date.now() - this.lastActivityAt.getTime(),
            tokenUsage: message.usage as AgentResponse['tokenUsage'],
            transcript: this.transcript,
        };

        // Add error information if present
        if (isError) {
            const errors = Array.isArray(message.errors) ? message.errors : [];
            const errorMessages = errors.map((e: any) => e.message || String(e)).join('; ');
            response.error = errorMessages || `Execution error: ${subtype}`;
        }

        this.status = 'idle';
        this.lastActivityAt = new Date();

        if (this.currentResolve) {
            this.currentResolve(response);
            this.currentResolve = null;
            this.currentReject = null;
            this.currentOnChunk = null;
        }

        this.emit('response', response);
    }

    /**
     * Handle timeout
     */
    private handleTimeout(): void {
        console.error(`[LocalAgentSession] Message timeout for ${this.agentType}`);

        const response: AgentResponse = {
            success: false,
            content: '',
            error: 'Request timed out',
            duration: Date.now() - this.lastActivityAt.getTime(),
        };

        this.status = 'error';

        if (this.currentReject) {
            this.currentReject(new Error('Request timed out'));
            this.currentReject = null;
            this.currentResolve = null;
        }

        this.emit('timeout', response);
    }
}

/**
 * Session Manager
 * Manages multiple agent sessions
 */
export class LocalAgentSessionManager {
    private sessions: Map<string, LocalAgentSession> = new Map();
    private taskSessions: Map<string, string> = new Map(); // taskKey (projectId-sequence) → sessionId
    private projectSessions: Map<number, string> = new Map(); // projectId -> sessionId (Persistent session)
    private static instance: LocalAgentSessionManager;

    static getInstance(): LocalAgentSessionManager {
        if (!LocalAgentSessionManager.instance) {
            LocalAgentSessionManager.instance = new LocalAgentSessionManager();
        }
        return LocalAgentSessionManager.instance;
    }

    /**
     * Create a new session
     */
    async createSession(
        agentType: 'claude' | 'codex',
        workingDirectory: string,
        sessionId?: string,
        projectId?: number,
        projectSequence?: number
    ): Promise<SessionInfo> {
        // Reuse existing session for project if available (Persistence)
        if (projectId !== undefined) {
            const existingSessionId = this.projectSessions.get(projectId);
            if (existingSessionId) {
                const existingSession = this.sessions.get(existingSessionId);
                if (
                    existingSession &&
                    existingSession.getStatus() !== 'closed' &&
                    existingSession.getStatus() !== 'error'
                ) {
                    console.log(
                        `[SessionManager] Reusing session ${existingSession.id} for project ${projectId}`
                    );
                    return existingSession.getInfo();
                }
                // Clean up stale mapping
                this.projectSessions.delete(projectId);
            }
        }

        const session = new LocalAgentSession(agentType, workingDirectory, sessionId);

        // Setup event forwarding
        session.on('message', (message) => {
            console.log(`[SessionManager] Session ${session.id} message:`, message);
        });

        session.on('closed', () => {
            this.sessions.delete(session.id);
            // Clean up task mapping if exists
            if (projectId !== undefined && projectSequence !== undefined) {
                const taskKey = `${projectId}-${projectSequence}`;
                this.taskSessions.delete(taskKey);
            }
            // Clean up project mapping if exists
            if (projectId !== undefined && this.projectSessions.get(projectId) === session.id) {
                this.projectSessions.delete(projectId);
            }
        });

        await session.start();
        this.sessions.set(session.id, session);

        // Register mappings
        if (projectId !== undefined) {
            this.projectSessions.set(projectId, session.id);
        }

        if (projectId !== undefined && projectSequence !== undefined) {
            const taskKey = `${projectId}-${projectSequence}`;
            this.taskSessions.set(taskKey, session.id);
            console.log(`[SessionManager] Registered session ${session.id} for task ${taskKey}`);
        }

        return session.getInfo();
    }

    /**
     * Get a session by ID
     */
    getSession(sessionId: string): LocalAgentSession | undefined {
        return this.sessions.get(sessionId);
    }

    /**
     * Get all sessions
     */
    getAllSessions(): SessionInfo[] {
        return Array.from(this.sessions.values()).map((s) => s.getInfo());
    }

    /**
     * Send a message to a session
     */
    async sendMessage(
        sessionId: string,
        message: string,
        options?: SendMessageOptions
    ): Promise<AgentResponse> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        return session.sendMessage(message, options);
    }

    /**
     * Close a session
     */
    async closeSession(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (session) {
            await session.close();
            this.sessions.delete(sessionId);
        }
    }

    /**
     * Terminate session for a specific task
     * Used when task is stopped/cancelled
     */
    async terminateTaskSession(projectId: number, projectSequence: number): Promise<boolean> {
        const taskKey = `${projectId}-${projectSequence}`;
        const sessionId = this.taskSessions.get(taskKey);
        if (sessionId) {
            console.log(`[SessionManager] Terminating session ${sessionId} for task ${taskKey}`);
            await this.closeSession(sessionId);
            this.taskSessions.delete(taskKey);
            return true;
        }
        return false;
    }

    /**
     * Close all sessions
     */
    async closeAllSessions(): Promise<void> {
        const closePromises = Array.from(this.sessions.values()).map((s) => s.close());
        await Promise.all(closePromises);
        this.sessions.clear();
    }

    /**
     * Get session count
     */
    getSessionCount(): number {
        return this.sessions.size;
    }
}

// Export singleton instance
export const sessionManager = LocalAgentSessionManager.getInstance();
