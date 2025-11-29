/**
 * MCP Manager
 *
 * Manager for Model Context Protocol integrations
 */

import type { Task, MCPIntegration, MCPConfig } from '@core/types/database';
import type {
    MCPResult,
    MCPHealth,
    MCPToolDefinition,
    MCPServerRuntimeConfig,
} from '@core/types/ai';
import { WebClient } from '@slack/web-api';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

import axios from 'axios';
import { eventBus } from '../events/EventBus';
import type { MCPRequestEvent, MCPResponseEvent } from '../events/EventBus';
import { MCPPermissionError, isMCPPermissionError } from './errors';

interface MCPRecommendation {
    mcp: MCPIntegration;
    confidence: number;
    reason: string;
}

const MCP_SUFFIX_PATTERN = /-(?:mcp|server)$/i;
const RUNTIME_ID_OFFSET = 1000;

type MCPRuntimePermission = 'read' | 'write' | 'delete' | 'execute' | 'network' | 'secrets';

const TOOL_PERMISSION_REGEX: Record<MCPRuntimePermission, RegExp[]> = {
    read: [/read/i, /list/i, /get/i, /describe/i, /show/i],
    write: [/write/i, /create/i, /update/i, /append/i, /commit/i, /push/i],
    delete: [/delete/i, /remove/i, /drop/i, /destroy/i],
    execute: [/exec/i, /run/i, /command/i, /shell/i, /script/i],
    network: [/fetch/i, /http/i, /request/i, /download/i, /upload/i, /search/i, /web/i],
    secrets: [/secret/i, /token/i, /credential/i, /auth/i, /login/i],
};

const PERMISSION_LABELS: Record<MCPRuntimePermission, string> = {
    read: '읽기',
    write: '쓰기',
    delete: '삭제',
    execute: '명령 실행',
    network: '네트워크',
    secrets: '자격증명 사용',
};

interface RuntimeServerEntry {
    integration: MCPIntegration;
    config: MCPServerRuntimeConfig;
    slug: string;
}

interface TaskMCPOverrideEntry {
    env?: Record<string, string>;
    config?: Record<string, unknown>;
    params?: Record<string, unknown>;
}

export class MCPManager {
    private activeClients: Map<string, Client>;
    private healthCache: Map<number, MCPHealth>;
    private runtimeServers: MCPServerRuntimeConfig[] = [];
    private runtimeIntegrationMap: Map<number, RuntimeServerEntry> = new Map();
    private readonly HEALTH_CACHE_TTL = 60000; // 1 minute
    private slackClients: Map<number, WebClient> = new Map();
    private taskOverrides: Map<number, Record<string, TaskMCPOverrideEntry>> = new Map();

    constructor() {
        this.activeClients = new Map();
        this.healthCache = new Map();
    }

    setRuntimeServers(servers: MCPServerRuntimeConfig[]): void {
        this.runtimeServers = servers?.slice() || [];
        this.runtimeIntegrationMap.clear();
        this.activeClients.forEach((client) => {
            try {
                client.close();
            } catch (error) {
                console.warn(
                    '[MCPManager] Failed to close MCP client during reconfiguration:',
                    error
                );
            }
        });
        this.activeClients.clear();
        this.healthCache.clear();

        let index = 0;
        for (const server of this.runtimeServers) {
            const slug = this.normalizeIdentifier(server.id || server.name || `mcp-${index + 1}`);
            const integration: MCPIntegration = {
                id: RUNTIME_ID_OFFSET + index,
                name: slug || server.name || `mcp-${index + 1}`,
                description: server.description || server.name || 'Custom MCP server',
                endpoint: server.endpoint || (server.command ? `stdio://${slug}` : ''),
                configSchema: {},
                isEnabled: Boolean(
                    server.enabled && ((server.isConnected ?? false) || server.command)
                ),
                isOfficial: false,
                installedBy: 0,
                installedAt: new Date(),
                settings: server.config || {},
                createdAt: new Date(),
                updatedAt: new Date(),
                slug: server.id || slug,
            };

            this.runtimeIntegrationMap.set(integration.id, {
                integration,
                config: server,
                slug: integration.slug || integration.name,
            });
            index++;
        }
    }

    setTaskOverrides(taskId: number, overrides: MCPConfig | null): void {
        if (!overrides || Object.keys(overrides).length === 0) {
            this.clearTaskOverrides(taskId);
            return;
        }

        const normalized: Record<string, TaskMCPOverrideEntry> = {};
        for (const [key, entry] of Object.entries(overrides)) {
            if (!entry) continue;
            const overrideEntry: TaskMCPOverrideEntry = {};
            if (entry.env) {
                overrideEntry.env = Object.entries(entry.env).reduce<Record<string, string>>(
                    (acc, [envKey, envValue]) => {
                        if (envKey && envValue !== undefined && envValue !== null) {
                            acc[envKey] = String(envValue);
                        }
                        return acc;
                    },
                    {}
                );
            }
            if (entry.config) {
                overrideEntry.config = { ...entry.config };
            }
            if ((entry as any).params) {
                overrideEntry.params = { ...(entry as any).params };
            }

            const variants = this.buildOverrideKeys(key);
            variants.forEach((variant) => {
                normalized[variant] = overrideEntry;
            });
        }

        this.taskOverrides.set(taskId, normalized);
    }

    clearTaskOverrides(taskId: number): void {
        this.taskOverrides.delete(taskId);
        const keysToRemove: string[] = [];
        for (const [key, client] of this.activeClients.entries()) {
            if (key.endsWith(`:${taskId}`)) {
                try {
                    client.close();
                } catch (error) {
                    console.warn(
                        '[MCPManager] Failed to close MCP client during override cleanup:',
                        error
                    );
                }
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach((key) => this.activeClients.delete(key));
    }

    /**
     * Discover available MCP servers
     */
    async discoverMCPs(): Promise<MCPIntegration[]> {
        if (this.runtimeIntegrationMap.size > 0) {
            return Array.from(this.runtimeIntegrationMap.values()).map(
                (entry) => entry.integration
            );
        }

        return this.buildDefaultCatalog();
    }

    private buildDefaultCatalog(): MCPIntegration[] {
        const commonMCPs: Partial<MCPIntegration>[] = [
            {
                name: 'filesystem',
                description: 'Access and manipulate local filesystem',
                endpoint: 'stdio://mcp-server-filesystem',
                isOfficial: true,
                settings: {},
            },
            {
                name: 'github',
                description: 'Interact with GitHub repositories',
                endpoint: 'https://mcp.github.com',
                isOfficial: true,
                settings: {},
            },
            {
                name: 'postgres',
                description: 'Query and manage PostgreSQL databases',
                endpoint: 'stdio://mcp-server-postgres',
                isOfficial: true,
                settings: {},
            },
            {
                name: 'slack',
                description: 'Send messages and interact with Slack',
                endpoint: 'https://mcp.slack.com',
                isOfficial: true,
                settings: {},
            },
            {
                name: 'puppeteer',
                description: 'Browser automation and web scraping',
                endpoint: 'stdio://mcp-server-puppeteer',
                isOfficial: true,
                settings: {},
            },
            {
                name: 'figma-design',
                description: 'Read/write Figma files and components for UI design tasks',
                endpoint: 'https://mcp.figma.com',
                isOfficial: false,
                settings: { token: '', teamId: '' },
            },
            {
                name: 'framer',
                description: 'Generate and publish Framer prototypes via MCP',
                endpoint: 'https://mcp.framer.com',
                isOfficial: false,
                settings: { apiKey: '', projectId: '' },
            },
            {
                name: 'penpot',
                description: 'Connect to self-hosted Penpot design workspaces',
                endpoint: 'stdio://mcp-server-penpot',
                isOfficial: false,
                settings: { baseUrl: 'https://design.penpot.app' },
            },
        ];

        return commonMCPs.map((mcp, index) => ({
            id: index + 1,
            name: mcp.name!,
            description: mcp.description!,
            endpoint: mcp.endpoint!,
            configSchema: {},
            isEnabled: false,
            isOfficial: mcp.isOfficial || false,
            installedBy: 0,
            installedAt: new Date(),
            settings: mcp.settings || {},
            createdAt: new Date(),
            updatedAt: new Date(),
            slug: mcp.name,
        }));
    }

    /**
     * Install an MCP integration
     */
    async installMCP(mcp: MCPIntegration): Promise<void> {
        try {
            // Validate MCP endpoint
            await this.validateMCPEndpoint(mcp.endpoint);

            // For stdio servers, check if executable exists
            if (mcp.endpoint.startsWith('stdio://')) {
                const command = mcp.endpoint.replace('stdio://', '');
                // In production, check if command is available
                console.log(`Installing stdio MCP: ${command}`);
            }

            // For HTTP servers, test connection
            if (mcp.endpoint.startsWith('http')) {
                await this.testHTTPConnection(mcp.endpoint);
            }

            // Save to database (would use repository in production)
            console.log(`MCP ${mcp.name} installed successfully`);
        } catch (error) {
            throw new Error(`Failed to install MCP ${mcp.name}: ${(error as Error).message}`);
        }
    }

    /**
     * Uninstall an MCP integration
     */
    async uninstallMCP(mcpId: number): Promise<void> {
        // Close any active clients
        for (const [key, client] of this.activeClients.entries()) {
            if (key.startsWith(`${mcpId}:`)) {
                await client.close();
                this.activeClients.delete(key);
            }
        }

        // Remove from health cache
        this.healthCache.delete(mcpId);

        // Remove from database (would use repository in production)
        console.log(`MCP ${mcpId} uninstalled successfully`);
    }

    /**
     * Suggest MCPs for a task
     */
    async suggestMCPsForTask(task: Task): Promise<MCPRecommendation[]> {
        const availableMCPs = await this.discoverMCPs();
        const recommendations: MCPRecommendation[] = [];

        // Analyze task to determine relevant MCPs
        const taskText = `${task.title} ${task.description || ''}`.toLowerCase();
        const tags = task.tags || [];

        for (const mcp of availableMCPs) {
            let confidence = 0;
            let reason = '';

            // Filesystem MCP
            if (
                mcp.name === 'filesystem' &&
                (taskText.includes('file') ||
                    taskText.includes('directory') ||
                    taskText.includes('folder') ||
                    tags.includes('filesystem'))
            ) {
                confidence = 0.8;
                reason = 'Task involves file system operations';
            }

            // GitHub MCP
            if (
                mcp.name === 'github' &&
                (taskText.includes('github') ||
                    taskText.includes('repository') ||
                    taskText.includes('git') ||
                    tags.includes('github'))
            ) {
                confidence = 0.9;
                reason = 'Task involves GitHub operations';
            }

            // Postgres MCP
            if (
                mcp.name === 'postgres' &&
                (taskText.includes('database') ||
                    taskText.includes('sql') ||
                    taskText.includes('postgres') ||
                    tags.includes('database'))
            ) {
                confidence = 0.85;
                reason = 'Task involves database operations';
            }

            // Slack MCP
            if (
                mcp.name === 'slack' &&
                (taskText.includes('slack') ||
                    taskText.includes('notification') ||
                    taskText.includes('message') ||
                    tags.includes('slack'))
            ) {
                confidence = 0.75;
                reason = 'Task involves Slack communication';
            }

            // Puppeteer MCP
            if (
                mcp.name === 'puppeteer' &&
                (taskText.includes('browser') ||
                    taskText.includes('scrape') ||
                    taskText.includes('web') ||
                    tags.includes('automation'))
            ) {
                confidence = 0.7;
                reason = 'Task involves browser automation';
            }

            if (confidence > 0.5) {
                recommendations.push({
                    mcp,
                    confidence,
                    reason,
                });
            }
        }

        // Sort by confidence
        return recommendations.sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * List all enabled MCP integrations
     */
    async listMCPs(): Promise<MCPIntegration[]> {
        const catalog =
            this.runtimeIntegrationMap.size > 0
                ? Array.from(this.runtimeIntegrationMap.values()).map((entry) => entry.integration)
                : await this.buildDefaultCatalog();
        return catalog.filter((mcp) => mcp.isEnabled);
    }

    /**
     * Execute an MCP tool
     */
    async executeMCPTool(
        mcpId: number,
        toolName: string,
        params: Record<string, any>,
        options: { taskId?: number; projectId?: number; source?: string } = {}
    ): Promise<MCPResult> {
        const startTime = Date.now();
        const logSource = options.source || 'mcp-manager';
        const mcpInfo = await this.getMCPById(mcpId);
        const runtimeEntry = mcpInfo ? this.runtimeIntegrationMap.get(mcpInfo.id) : null;

        try {
            this.enforcePermissions(mcpId, toolName);
            this.enforceFeatureScopes(mcpId, toolName);

            const override = this.getTaskOverride(options.taskId, {
                id: runtimeEntry?.config.id || mcpInfo?.slug || mcpInfo?.name,
                name: mcpInfo?.name,
                slug: runtimeEntry?.slug || mcpInfo?.slug,
            });
            const mergedParams =
                override?.params && Object.keys(override.params).length > 0
                    ? { ...override.params, ...params }
                    : params;
            const sanitizedParams = this.sanitizeParameters(mergedParams);

            console.log(
                `[MCP] Executing tool "${toolName}" on MCP #${mcpId} (${mcpInfo?.name || 'unknown'})`
            );
            console.log(`[MCP] Tool parameters:`, sanitizedParams);

            eventBus.emit<MCPRequestEvent>(
                'ai.mcp_request',
                {
                    taskId: options.taskId,
                    projectId: options.projectId,
                    mcpId,
                    mcpName: mcpInfo?.name,
                    endpoint: mcpInfo?.endpoint,
                    toolName,
                    parameters: sanitizedParams,
                },
                logSource
            );

            // Get or create client
            console.log(`[MCP] Getting/creating client for MCP #${mcpId}...`);
            const client = await this.getOrCreateClient(mcpId, options.taskId);
            console.log(`[MCP] Client ready, calling tool "${toolName}"...`);

            // Execute tool
            const result = await client.callTool({
                name: toolName,
                arguments: mergedParams,
            });

            const executionTime = Date.now() - startTime;
            console.log(`[MCP] Tool "${toolName}" completed successfully in ${executionTime}ms`);
            console.log(`[MCP] Result preview:`, this.buildDataPreview(result));

            this.emitMCPResponse(
                {
                    taskId: options.taskId,
                    projectId: options.projectId,
                    mcpId,
                    mcpName: mcpInfo?.name,
                    toolName,
                    success: true,
                    duration: executionTime,
                    dataPreview: this.buildDataPreview(result),
                },
                logSource
            );

            return {
                success: true,
                data: result,
                executionTime,
                metadata: {
                    toolName,
                    mcpId,
                },
            };
        } catch (error) {
            if (isMCPPermissionError(error)) {
                throw error;
            }
            const executionTime = Date.now() - startTime;
            console.error(
                `[MCP] Tool "${toolName}" failed after ${executionTime}ms:`,
                (error as Error).message
            );

            // Attempt Slack fallback if applicable
            console.log(`[MCP] Attempting Slack fallback for tool "${toolName}"...`);
            const slackFallback = await this.trySlackFallback(
                runtimeEntry ?? undefined,
                toolName,
                mergedParams,
                options.taskId
            );
            if (slackFallback) {
                console.log(
                    `[MCP] Slack fallback ${slackFallback.success ? 'succeeded' : 'failed'}`
                );
                this.emitMCPResponse(
                    {
                        taskId: options.taskId,
                        projectId: options.projectId,
                        mcpId,
                        mcpName: mcpInfo?.name,
                        toolName,
                        success: slackFallback.success,
                        duration: executionTime,
                        dataPreview: this.buildDataPreview(slackFallback.data),
                        error: slackFallback.error?.message,
                    },
                    logSource
                );
                return slackFallback;
            }

            this.emitMCPResponse(
                {
                    taskId: options.taskId,
                    projectId: options.projectId,
                    mcpId,
                    mcpName: mcpInfo?.name,
                    toolName,
                    success: false,
                    duration: executionTime,
                    error: (error as Error).message,
                },
                logSource
            );

            return {
                success: false,
                error: {
                    code: 'EXECUTION_FAILED',
                    message: (error as Error).message,
                    details: {
                        toolName,
                        params,
                    },
                },
                executionTime,
            };
        }
    }

    private enforcePermissions(mcpId: number, toolName: string): void {
        const runtimeEntry = this.runtimeIntegrationMap.get(mcpId);
        const permissions = runtimeEntry?.config?.permissions;
        if (!permissions) {
            return;
        }

        const hasAnyPermission = Object.values(permissions).some((value) => Boolean(value));
        if (!hasAnyPermission) {
            const serverName = runtimeEntry?.integration.name || 'MCP';
            throw new MCPPermissionError(
                `MCP 권한 거부: "${serverName}"에 허용된 기능이 없어 도구를 실행할 수 없습니다.`,
                {
                    serverId: runtimeEntry?.integration.slug || runtimeEntry?.integration.name,
                    serverName,
                    toolName,
                    permissionType: 'capability',
                }
            );
        }

        const required = this.inferPermissionFromTool(toolName);
        if (!required) {
            return;
        }

        const allowed = permissions[required];
        if (allowed === false) {
            const serverName = runtimeEntry?.integration.name || 'MCP';
            const label = PERMISSION_LABELS[required];
            throw new MCPPermissionError(
                `MCP 권한 거부: "${serverName}"에서 ${label} 권한이 비활성화되어 "${toolName}" 도구를 실행할 수 없습니다.`,
                {
                    serverId: runtimeEntry?.integration.slug || runtimeEntry?.integration.name,
                    serverName,
                    toolName,
                    permissionType: 'capability',
                }
            );
        }
    }

    private enforceFeatureScopes(mcpId: number, toolName: string): void {
        const runtimeEntry = this.runtimeIntegrationMap.get(mcpId);
        const featureScopes = runtimeEntry?.config?.featureScopes;
        if (!featureScopes || featureScopes.length === 0) {
            return;
        }

        const activeScopes = new Set(
            runtimeEntry?.config?.scopes?.filter((scope) => typeof scope === 'string') || []
        );

        const matchedFeature = featureScopes.find((feature) => {
            if (!feature.toolPatterns || feature.toolPatterns.length === 0) {
                return false;
            }
            return feature.toolPatterns.some((pattern) => {
                try {
                    const regex = new RegExp(pattern, 'i');
                    return regex.test(toolName);
                } catch {
                    return pattern.toLowerCase() === toolName.toLowerCase();
                }
            });
        });

        if (!matchedFeature) {
            return;
        }

        const missingScopes = matchedFeature.scopes.filter((scope) => !activeScopes.has(scope));
        if (missingScopes.length > 0) {
            const serverName = runtimeEntry?.integration.name || 'MCP';
            throw new MCPPermissionError(
                `MCP 권한 거부: "${serverName}"에서 "${toolName}" 도구를 실행하려면 ${missingScopes.join(', ')} scope가 필요합니다.`,
                {
                    serverId: runtimeEntry?.integration.slug || runtimeEntry?.integration.name,
                    serverName,
                    toolName,
                    requiredScopes: matchedFeature.scopes,
                    missingScopes,
                    permissionType: 'scope',
                }
            );
        }
    }

    private inferPermissionFromTool(toolName: string): MCPRuntimePermission | null {
        if (!toolName) return null;
        for (const [permission, patterns] of Object.entries(TOOL_PERMISSION_REGEX)) {
            if (patterns.some((pattern) => pattern.test(toolName))) {
                return permission as MCPRuntimePermission;
            }
        }
        return null;
    }

    /**
     * Health check for MCP
     */
    async healthCheck(mcpId: number): Promise<MCPHealth> {
        // Check cache
        const cached = this.healthCache.get(mcpId);
        if (cached && Date.now() - cached.lastChecked.getTime() < this.HEALTH_CACHE_TTL) {
            return cached;
        }

        const startTime = Date.now();

        try {
            // Try to get or create client
            const client = await this.getOrCreateClient(mcpId);

            // Try to list tools as a health check
            await client.listTools();

            const latency = Date.now() - startTime;

            const health: MCPHealth = {
                status: 'healthy',
                latency,
                lastChecked: new Date(),
                errors: [],
                uptime: 100, // Would track actual uptime in production
            };

            this.healthCache.set(mcpId, health);
            return health;
        } catch (error) {
            const latency = Date.now() - startTime;

            const health: MCPHealth = {
                status: 'down',
                latency,
                lastChecked: new Date(),
                errors: [
                    {
                        timestamp: new Date(),
                        error: (error as Error).message,
                    },
                ],
                uptime: 0,
            };

            this.healthCache.set(mcpId, health);
            return health;
        }
    }

    /**
     * List available tools for an MCP
     */
    async listTools(mcpId: number, options?: { taskId?: number }): Promise<MCPToolDefinition[]> {
        try {
            const client = await this.getOrCreateClient(mcpId, options?.taskId);
            const result = await client.listTools();

            return (result.tools || []).map((tool: any) => ({
                name: tool.name,
                description: tool.description || '',
                parameters: tool.inputSchema || {
                    type: 'object',
                    properties: {},
                    required: [],
                },
            }));
        } catch (error) {
            console.error(`Failed to list tools for MCP ${mcpId}:`, error);
            return [];
        }
    }

    /**
     * Get or create MCP client
     */
    private async getOrCreateClient(mcpId: number, taskId?: number): Promise<Client> {
        // Check if client already exists
        const clientKey = this.buildClientKey(mcpId, taskId);
        let client = this.activeClients.get(clientKey);
        if (client) {
            return client;
        }

        // Create new client
        const mcp = await this.getMCPById(mcpId);
        if (!mcp) {
            throw new Error(`MCP ${mcpId} not found`);
        }

        const runtimeEntry = this.runtimeIntegrationMap.get(mcpId);
        const runtimeConfig = runtimeEntry?.config;

        // Dynamic import for ESM SDK
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

        client = new Client(
            {
                name: 'workflow-manager-client',
                version: '1.0.0',
            },
            {
                capabilities: {},
            }
        );

        // Connect based on runtime config or endpoint type
        const override = this.getTaskOverride(taskId, {
            id: runtimeConfig?.id || mcp.slug || mcp.name,
            name: mcp.name,
            slug: runtimeEntry?.slug || mcp.slug,
        });

        const mergedRuntimeConfig = {
            ...(runtimeConfig?.config || {}),
            ...(override?.config || {}),
        };

        const env = {
            ...this.sanitizeEnv(process.env),
            ...this.sanitizeEnv(runtimeConfig?.env),
        };
        const envFromRuntimeConfig = runtimeConfig
            ? this.buildEnvFromConfig(runtimeConfig)
            : {};
        const envFromOverrideConfig =
            Object.keys(mergedRuntimeConfig).length > 0
                ? this.buildEnvFromConfig({
                      ...(runtimeConfig || {
                          id: mcp.slug || mcp.name || '',
                          name: mcp.name || '',
                      }),
                      config: mergedRuntimeConfig,
                  })
                : {};
        const overrideEnv = override?.env
            ? this.sanitizeEnv(override.env as Record<string, string>)
            : {};
        const transportEnv = {
            ...env,
            ...envFromRuntimeConfig,
            ...overrideEnv,
            ...envFromOverrideConfig,
        };

        if (runtimeConfig?.command) {
            const transport = new StdioClientTransport({
                command: runtimeConfig.command,
                args: runtimeConfig.args || [],
                env: transportEnv,
            });
            await client.connect(transport);
        } else if (runtimeConfig?.endpoint?.startsWith('stdio://')) {
            const command = runtimeConfig.endpoint.replace('stdio://', '');
            const transport = new StdioClientTransport({
                command,
                args: runtimeConfig.args || [],
                env: transportEnv,
            });
            await client.connect(transport);
        } else if (mcp.endpoint.startsWith('stdio://')) {
            const command = mcp.endpoint.replace('stdio://', '');
            const transport = new StdioClientTransport({
                command,
                args: [],
                env: transportEnv,
            });
            await client.connect(transport);
        } else if (mcp.endpoint.startsWith('http')) {
            throw new Error('HTTP transport not yet implemented');
        } else {
            throw new Error('Unsupported MCP endpoint. Configure a stdio endpoint or command.');
        }

        this.activeClients.set(clientKey, client);
        return client;
    }

    /**
     * Get MCP by ID (mock implementation)
     */
    private async getMCPById(mcpId: number): Promise<MCPIntegration | null> {
        const mcps = await this.discoverMCPs();
        return mcps.find((m) => m.id === mcpId) || null;
    }

    /**
     * Find MCP by name or ID string (case-insensitive)
     */
    async findMCPByName(identifier: string): Promise<MCPIntegration | null> {
        if (!identifier) return null;
        const variants = this.buildIdentifierVariants(identifier);

        const numericId = Number(identifier);
        if (!Number.isNaN(numericId)) {
            const runtimeById = this.runtimeIntegrationMap.get(numericId);
            if (runtimeById) {
                return runtimeById.integration;
            }
        }

        const runtimeMatch = this.findRuntimeMatch(variants);
        if (runtimeMatch) {
            return runtimeMatch;
        }

        const mcps = await this.buildDefaultCatalog();
        return (
            mcps.find((m) => {
                const name = m.name?.toLowerCase();
                const endpoint = m.endpoint?.toLowerCase() || '';
                const slug = (m as any).slug?.toLowerCase?.();
                for (const variant of variants) {
                    if (!variant) continue;
                    if (name === variant) return true;
                    if (slug && slug === variant) return true;
                    if (endpoint.includes(variant)) return true;
                }
                return false;
            }) || null
        );
    }

    /**
     * Validate MCP endpoint
     */
    private async validateMCPEndpoint(endpoint: string): Promise<void> {
        if (!endpoint.startsWith('stdio://') && !endpoint.startsWith('http')) {
            throw new Error('Invalid endpoint format. Must start with stdio:// or http(s)://');
        }
    }

    private emitMCPResponse(event: MCPResponseEvent['payload'], source: string): void {
        eventBus.emit<MCPResponseEvent>('ai.mcp_response', event, source);
    }

    private buildIdentifierVariants(identifier: string): Set<string> {
        const normalized = identifier.toLowerCase();
        const variants = new Set<string>([normalized, this.normalizeIdentifier(identifier)]);
        if (normalized.endsWith('-mcp')) {
            variants.add(normalized.replace(/-mcp$/, ''));
        }
        if (normalized.endsWith('-server')) {
            variants.add(normalized.replace(/-server$/, ''));
        }
        return variants;
    }

    private findRuntimeMatch(variants: Set<string>): MCPIntegration | null {
        for (const entry of this.runtimeIntegrationMap.values()) {
            const { integration, slug } = entry;
            const name = integration.name?.toLowerCase();
            const endpoint = integration.endpoint?.toLowerCase() || '';
            const slugLower = slug?.toLowerCase();
            for (const variant of variants) {
                if (!variant) continue;
                if (name === variant) return integration;
                if (slugLower && slugLower === variant) return integration;
                if (endpoint.includes(variant)) return integration;
            }
        }
        return null;
    }

    private normalizeIdentifier(identifier?: string): string {
        if (!identifier) {
            return '';
        }
        return identifier.replace(MCP_SUFFIX_PATTERN, '').trim().toLowerCase();
    }

    private sanitizeEnv(
        source?: NodeJS.ProcessEnv | Record<string, string | undefined>
    ): Record<string, string> {
        if (!source) {
            return {};
        }
        const env: Record<string, string> = {};
        for (const [key, value] of Object.entries(source)) {
            if (typeof value === 'string') {
                env[key] = value;
            }
        }
        return env;
    }

    private buildOverrideKeys(rawKey: string): string[] {
        const keys = new Set<string>();
        if (rawKey) {
            keys.add(rawKey.trim().toLowerCase());
            const normalized = this.normalizeIdentifier(rawKey);
            if (normalized) {
                keys.add(normalized);
            }
        }
        return Array.from(keys).filter((key) => key.length > 0);
    }

    private buildClientKey(mcpId: number, taskId?: number): string {
        return `${mcpId}:${taskId ?? 'base'}`;
    }

    private getTaskOverride(
        taskId: number | undefined,
        meta?: { id?: string; name?: string; slug?: string }
    ): TaskMCPOverrideEntry | undefined {
        if (!taskId) return undefined;
        const overrides = this.taskOverrides.get(taskId);
        if (!overrides) return undefined;
        const candidates = [meta?.id, meta?.slug, meta?.name];
        for (const candidate of candidates) {
            if (!candidate) continue;
            const trimmed = candidate.trim().toLowerCase();
            if (overrides[trimmed]) {
                return overrides[trimmed];
            }
            const normalized = this.normalizeIdentifier(candidate);
            if (normalized && overrides[normalized]) {
                return overrides[normalized];
            }
        }
        return undefined;
    }

    private buildEnvFromConfig(
        server: Partial<MCPServerRuntimeConfig> & { id?: string }
    ): Record<string, string> {
        const env: Record<string, string> = {};
        if (server.env) {
            Object.assign(env, server.env);
        }
        if (server.config) {
            for (const [key, value] of Object.entries(server.config)) {
                if (value === undefined || value === null || value === '') continue;
                const normalizedKey = key.replace(/[^a-z0-9]/gi, '_').toUpperCase();
                env[`MCP_${normalizedKey}`] =
                    typeof value === 'string' ? value : JSON.stringify(value);
            }
            const serverId = (server.id || '').toLowerCase();
            if (serverId.includes('slack')) {
                if (server.config.token) {
                    env.SLACK_BOT_TOKEN = String(server.config.token);
                }
                if (server.config.teamId) {
                    env.SLACK_TEAM_ID = String(server.config.teamId);
                }
            }
        }
        return env;
    }

    private async trySlackFallback(
        entry: RuntimeServerEntry | undefined,
        toolName: string,
        params: Record<string, any>,
        taskId?: number
    ): Promise<MCPResult | null> {
        if (!entry || !entry.slug?.includes('slack')) {
            return null;
        }

        const override = this.getTaskOverride(taskId, {
            id: entry.config.id,
            name: entry.integration.name,
            slug: entry.slug,
        });

        const overrideToken =
            (override?.env && (override.env as Record<string, string>).SLACK_BOT_TOKEN) ||
            (typeof override?.config === 'object' &&
            override?.config !== null &&
            (override.config as Record<string, unknown>).token
                ? (override.config as Record<string, unknown>).token
                : undefined);

        const token =
            (typeof overrideToken === 'string' && overrideToken) ||
            (entry.config.config?.token as string | undefined) ||
            process.env.SLACK_BOT_TOKEN;
        if (!token) {
            return null;
        }

        const client = this.getSlackClient(entry.integration.id, token);
        try {
            let data: any;
            if (/list_channels/i.test(toolName)) {
                data = await client.conversations.list({ limit: params.limit || 200 });
            } else if (/history|messages|conversation/i.test(toolName)) {
                const channel = params.channelId || params.channel || params.channel_name;
                if (!channel) {
                    throw new Error('channel parameter is required for Slack history tool');
                }
                data = await client.conversations.history({
                    channel,
                    oldest: params.oldest,
                    latest: params.latest,
                    inclusive: params.inclusive,
                    limit: params.limit || 200,
                });
            } else if (/post_message|send/i.test(toolName)) {
                const channel = params.channel || params.channelId;
                const text = params.text || params.message;
                if (!channel || !text) {
                    throw new Error('channel and text are required for Slack post message tool');
                }
                data = await client.chat.postMessage({ channel, text });
            } else {
                return null;
            }

            return {
                success: true,
                data,
                executionTime: 0,
                metadata: {
                    toolName,
                    mcpId: entry.integration.id,
                    fallback: 'slack-web-api',
                },
            };
        } catch (error) {
            return {
                success: false,
                error: {
                    code: 'SLACK_FALLBACK_FAILED',
                    message: (error as Error).message,
                    details: { toolName, params },
                },
                executionTime: 0,
            };
        }
    }

    private getSlackClient(entryId: number, token: string): WebClient {
        let client = this.slackClients.get(entryId);
        if (!client) {
            client = new WebClient(token);
            this.slackClients.set(entryId, client);
        }
        return client;
    }

    /**
     * Test HTTP connection
     */
    private async testHTTPConnection(endpoint: string): Promise<void> {
        try {
            await axios.get(endpoint, { timeout: 5000 });
        } catch (error) {
            throw new Error(`Failed to connect to ${endpoint}`);
        }
    }

    /**
     * Close all active clients
     */
    async closeAll(): Promise<void> {
        for (const [mcpId, client] of this.activeClients.entries()) {
            try {
                await client.close();
                this.activeClients.delete(mcpId);
            } catch (error) {
                console.error(`Failed to close MCP client ${mcpId}:`, error);
            }
        }
    }
    private sanitizeParameters(value: any, key?: string): any {
        if (value === null || value === undefined) return value;
        const sensitiveKeys = [
            'token',
            'secret',
            'key',
            'password',
            'credential',
            'auth',
            'signature',
        ];

        if (typeof value === 'string') {
            if (key && sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
                return '[REDACTED]';
            }
            return value;
        }

        if (Array.isArray(value)) {
            return value.map((item) => this.sanitizeParameters(item));
        }

        if (typeof value === 'object') {
            const sanitized: Record<string, any> = {};
            for (const [childKey, childValue] of Object.entries(value)) {
                sanitized[childKey] = this.sanitizeParameters(childValue, childKey);
            }
            return sanitized;
        }

        return value;
    }

    private buildDataPreview(data: any, limit = 2000): string | undefined {
        if (data === undefined || data === null) return undefined;
        const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        if (!text) return undefined;
        return text.length > limit ? `${text.slice(0, limit)}…` : text;
    }
}
