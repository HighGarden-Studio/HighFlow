/**
 * Local Agent Message Adapters
 *
 * Converts internal message format to agent-specific formats
 * Each local agent may have different message format requirements
 */

export interface LocalAgentMessageAdapter {
    /**
     * Format a message for the specific agent
     */
    formatMessage(content: string, options?: { model?: string; tools?: string[] }): string;

    /**
     * Parse response from the agent
     */
    parseResponse(output: string): { type: string; content: string; done?: boolean };
}

/**
 * Claude Code Adapter
 * Formats messages for Claude Code CLI stream-json format
 */
export class ClaudeCodeAdapter implements LocalAgentMessageAdapter {
    formatMessage(content: string, options?: { model?: string }): string {
        // Claude Code stream-json format expects:
        // { type: 'user', message: { role: 'user', content: [...] } }
        return JSON.stringify({
            type: 'user',
            message: {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: content,
                    },
                ],
            },
            ...(options?.model && { model: options.model }),
        });
    }

    parseResponse(output: string): { type: string; content: string; done?: boolean } {
        try {
            const parsed = JSON.parse(output);

            // Handle different message types from Claude Code
            if (parsed.type === 'result' || parsed.type === 'assistant') {
                const contentBlocks = parsed.message?.content || parsed.content || [];
                const textContent = contentBlocks
                    .filter((block: any) => block.type === 'text')
                    .map((block: any) => block.text)
                    .join('');

                return {
                    type: parsed.type,
                    content: textContent,
                    done: parsed.type === 'result',
                };
            }

            return {
                type: parsed.type || 'unknown',
                content: String(parsed.content || parsed.text || ''),
                done: false,
            };
        } catch {
            return {
                type: 'text',
                content: output,
                done: false,
            };
        }
    }
}

/**
 * Codex Adapter
 * Formats messages for OpenAI Codex CLI
 */
export class CodexAdapter implements LocalAgentMessageAdapter {
    formatMessage(content: string, _options?: { model?: string }): string {
        // Return raw text prompt for CLI argument
        return content;
    }

    parseResponse(output: string): { type: string; content: string; done?: boolean } {
        // Unused in new logic (handled in handleParsedMessage for events),
        // but kept for compatibility or fallback.
        try {
            const parsed = JSON.parse(output);
            if (parsed.type === 'turn.completed') {
                return { type: 'response', content: '', done: true };
            }
            if (parsed.type === 'item.completed' && parsed.item?.text) {
                return { type: 'text', content: parsed.item.text, done: false };
            }
            // Fallback for standard JSONL line
            return {
                type: 'response',
                content: parsed.completion || parsed.output || String(parsed),
                done: parsed.done || false,
            };
        } catch {
            return {
                type: 'text',
                content: output,
                done: false,
            };
        }
    }
}

/**
 * Gemini CLI Adapter
 * Formats messages for Gemini CLI
 */
export class GeminiCLIAdapter implements LocalAgentMessageAdapter {
    formatMessage(content: string, _options?: { model?: string }): string {
        // Return raw text prompt for CLI argument
        return content;
    }

    parseResponse(output: string): { type: string; content: string; done?: boolean } {
        try {
            const parsed = JSON.parse(output);
            // Gemini CLI JSON output structure
            return {
                type: parsed.type || 'response',
                content: parsed.text || parsed.content || String(parsed),
                done: parsed.done || parsed.finished || false,
            };
        } catch {
            // Fallback to plain text
            return {
                type: 'text',
                content: output,
                done: false,
            };
        }
    }
}

/**
 * Get adapter for agent type
 */
export function getAdapterForAgent(
    agentType: 'claude' | 'codex' | 'gemini-cli'
): LocalAgentMessageAdapter {
    switch (agentType) {
        case 'claude':
            return new ClaudeCodeAdapter();
        case 'codex':
            return new CodexAdapter();
        case 'gemini-cli':
            return new GeminiCLIAdapter();
        default:
            throw new Error(`Unknown agent type: ${agentType}`);
    }
}
