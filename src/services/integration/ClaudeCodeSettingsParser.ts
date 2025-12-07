/**
 * Claude Code Settings Parser
 *
 * Parses Claude Desktop configuration and converts it to
 * workflow manager project settings format.
 */

import type { AIProvider } from '@core/types/ai';
import type { MCPConfig } from '@core/types/database';

export interface ClaudeCodeSettings {
    model?: string; // "sonnet", "opus", "haiku"
    alwaysThinkingEnabled?: boolean;
    mcpServers?: Record<
        string,
        {
            command: string;
            args: string[];
            env?: Record<string, string>;
        }
    >;
}

export interface ParsedClaudeSettings {
    aiProvider: AIProvider;
    aiModel: string;
    mcpConfig: MCPConfig | null;
}

export class ClaudeCodeSettingsParser {
    /**
     * Parse Claude Desktop config and convert to workflow manager format
     */
    parseSettings(claudeSettings: ClaudeCodeSettings | null): ParsedClaudeSettings | null {
        if (!claudeSettings) return null;

        const aiProvider: AIProvider = 'anthropic'; // Claude Code always uses Anthropic
        const aiModel = this.mapClaudeModelToFullName(claudeSettings.model);
        const mcpConfig = this.convertMCPServers(claudeSettings.mcpServers);

        return { aiProvider, aiModel, mcpConfig };
    }

    /**
     * Map Claude's short model names to full model IDs
     */
    private mapClaudeModelToFullName(model?: string): string {
        const modelMap: Record<string, string> = {
            sonnet: 'claude-3-5-sonnet-20250219',
            opus: 'claude-3-opus-20240229',
            haiku: 'claude-3-haiku-20240307',
            // Legacy mappings
            'claude-3-5-sonnet': 'claude-3-5-sonnet-20250219',
            'claude-3-opus': 'claude-3-opus-20240229',
            'claude-3-haiku': 'claude-3-haiku-20240307',
        };

        const normalizedModel = model?.toLowerCase() || 'sonnet';
        return modelMap[normalizedModel] || 'claude-3-5-sonnet-20250219';
    }

    /**
     * Convert Claude Desktop MCP server config to workflow manager format
     */
    private convertMCPServers(
        servers?: Record<
            string,
            {
                command: string;
                args: string[];
                env?: Record<string, string>;
            }
        >
    ): MCPConfig | null {
        if (!servers || Object.keys(servers).length === 0) {
            return null;
        }

        const mcpConfig: MCPConfig = {};

        for (const [serverId, config] of Object.entries(servers)) {
            mcpConfig[serverId] = {
                env: config.env || {},
                params: {}, // Claude doesn't use params in the same way
                context: {
                    command: config.command,
                    args: config.args,
                },
            };
        }

        return Object.keys(mcpConfig).length > 0 ? mcpConfig : null;
    }

    /**
     * Check if settings indicate Claude Code integration
     */
    hasClaudeCodeSettings(settings: ClaudeCodeSettings | null): boolean {
        return !!(settings && (settings.model || settings.mcpServers));
    }
}

// Export singleton instance
export const claudeCodeSettingsParser = new ClaudeCodeSettingsParser();
