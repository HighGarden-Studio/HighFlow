import type { EnabledProviderInfo, MCPServerRuntimeConfig } from '@core/types/ai';
import type { MCPServerConfig } from '../stores/settingsStore';

interface ProviderRecommendation {
    id: string;
    name: string;
    tags?: string[];
    models?: string[];
    defaultModel?: string;
    baseUrl?: string;
    apiKey?: string;
}

export function buildEnabledProvidersPayload(
    providers: ProviderRecommendation[]
): EnabledProviderInfo[] {
    if (!providers || providers.length === 0) {
        return [];
    }

    return providers.map((provider) => {
        const info: EnabledProviderInfo = {
            id: provider.id ?? '',
            name: provider.name ?? '',
            tags: provider.tags ? provider.tags.filter((t) => typeof t === 'string') : undefined,
            models: provider.models
                ? provider.models.filter((m) => typeof m === 'string')
                : undefined,
            defaultModel: provider.defaultModel ?? undefined,
            baseUrl: provider.baseUrl ?? undefined,
            apiKey: provider.apiKey ?? undefined,
        };

        // Remove undefined values for cleaner payload
        return Object.fromEntries(
            Object.entries(info).filter(([_, v]) => v !== undefined)
        ) as EnabledProviderInfo;
    });
}

export function buildRuntimeMCPServers(servers: MCPServerConfig[]): MCPServerRuntimeConfig[] {
    if (!servers || servers.length === 0) {
        return [];
    }

    return servers
        .filter((server) => server.enabled && (server.isConnected ?? false))
        .map((server) => {
            // Ensure all values are serializable for IPC/structured clone
            const serializable: MCPServerRuntimeConfig = {
                id: server.id ?? '',
                name: server.name ?? '',
                description: server.description ?? undefined,
                endpoint:
                    server.config?.baseUrl ||
                    (server.command ? `stdio://${server.id}` : server.repository || ''),
                command: server.command ?? undefined,
                args: server.args ? server.args.filter((a) => typeof a === 'string') : undefined,
                // Deep clone env to ensure no references
                env: server.env
                    ? Object.fromEntries(
                          Object.entries(server.env).filter(
                              ([k, v]) => typeof k === 'string' && typeof v === 'string'
                          )
                      )
                    : undefined,
                installCommand: server.installCommand ?? undefined,
                installArgs: server.installArgs ?? undefined,
                enabled: Boolean(server.enabled),
                isConnected: Boolean(server.isConnected),
                installed: Boolean(server.installed),
                // Deep clone config to ensure no references or non-serializable values
                config: server.config ? JSON.parse(JSON.stringify(server.config)) : undefined,
                tags: server.tags ? server.tags.filter((t) => typeof t === 'string') : undefined,
                permissions: server.permissions
                    ? Object.fromEntries(
                          Object.entries(server.permissions).map(([key, value]) => [key, Boolean(value)])
                      )
                    : undefined,
                featureScopes: server.featureScopes
                    ? server.featureScopes.map((feature) => ({
                          id: feature.id,
                          scopes: feature.requiredScopes?.filter((scope) => typeof scope === 'string') || [],
                          toolPatterns: feature.toolPatterns?.filter((pattern) => typeof pattern === 'string'),
                      }))
                    : undefined,
                scopes: server.scopes ? server.scopes.filter((scope) => typeof scope === 'string') : undefined,
            };

            // Remove undefined values to reduce payload size
            return Object.fromEntries(
                Object.entries(serializable).filter(([_, v]) => v !== undefined)
            ) as MCPServerRuntimeConfig;
        });
}
