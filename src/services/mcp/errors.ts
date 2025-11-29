export interface MCPPermissionErrorDetails {
    serverId?: string;
    serverName?: string;
    toolName?: string;
    requiredScopes?: string[];
    missingScopes?: string[];
    permissionType?: 'scope' | 'capability';
}

export class MCPPermissionError extends Error {
    public readonly code = 'MCP_PERMISSION_DENIED';
    public readonly details?: MCPPermissionErrorDetails;

    constructor(message: string, details?: MCPPermissionErrorDetails) {
        super(message);
        this.name = 'MCPPermissionError';
        this.details = details;
    }
}

export function isMCPPermissionError(error: unknown): error is MCPPermissionError {
    return error instanceof MCPPermissionError;
}
