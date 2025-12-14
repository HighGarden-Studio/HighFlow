import type { InputProvider, ExecutionContext } from '../InputProvider';
import type { Task, TaskOutput } from '../../../../core/types/database';

// Helper to fetch text content (Mock for now, or basic fetch)
async function fetchContent(url: string, authType: string): Promise<string> {
    // In a real implementation with 'google_oauth', this would use the stored credentials
    // to fetch from Google Drive API.
    // For 'none', it just does a fetch.

    // Safety check for localhost/internal IPs if needed (omitted for MVP)
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.text();
}

export class RemoteResourceProvider implements InputProvider {
    canHandle(task: Task): boolean {
        let config = task.inputConfig;
        if (typeof config === 'string') {
            try {
                config = JSON.parse(config);
            } catch {
                return false;
            }
        }
        return (config as any)?.sourceType === 'REMOTE_RESOURCE';
    }

    async start(task: Task, ctx: ExecutionContext): Promise<void> {
        console.log(`[RemoteResourceProvider] Task ${task.id} is waiting for remote resource.`);
    }

    async validate(task: Task, payload: any): Promise<{ valid: boolean; error?: string }> {
        // Payload expected: { url: string }
        if (!payload || !payload.url) {
            return { valid: false, error: 'URL is required' };
        }
        try {
            new URL(payload.url);
            return { valid: true };
        } catch {
            return { valid: false, error: 'Invalid URL format' };
        }
    }

    async submit(task: Task, payload: any): Promise<TaskOutput> {
        const url = payload.url;
        const config = task.inputConfig?.remoteResource;
        const authType = config?.authType || 'none';

        try {
            const content = await fetchContent(url, authType);

            // Detect title or metadata if possible (HTML parser)
            let title = 'Remote Resource';
            // Simple regex to grab title
            const titleMatch = content.match(/<title>(.*?)<\/title>/i);
            if (titleMatch) title = titleMatch[1];

            return {
                kind: 'text',
                text: content,
                mimeType: 'text/html', // Assumption for generic web URL
                file: {
                    name: title,
                    url: url,
                },
                metadata: { source: 'remote_resource', url, authType },
            };
        } catch (e: any) {
            return {
                kind: 'error',
                text: `Failed to fetch remote resource: ${e.message}`,
                metadata: { error: e.message, url },
            };
        }
    }

    async cancel(task: Task): Promise<void> {}
}
