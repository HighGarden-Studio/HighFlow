import type { InputProvider, ExecutionContext } from '../InputProvider';
import type { Task, TaskOutput } from '../../../../core/types/database';

// Helper to fetch text content
// Helper to fetch content with headers
async function fetchResource(
    url: string,
    authType: string,
    accountId?: string,
    fetchOptions?: { method?: string; headers?: Record<string, string>; timeoutMs?: number }
): Promise<{ content: string | Blob; contentType: string; headers: Headers }> {
    const headers: Record<string, string> = {
        'User-Agent': 'HighFlow-Workflow-Manager/1.0',
        ...fetchOptions?.headers,
    };

    if (authType === 'google_oauth') {
        try {
            const token = await window.electron.ipcRenderer.invoke(
                'auth:get-google-token',
                accountId
            );
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            } else {
                throw new Error('Google OAuth token not found.');
            }
        } catch (e: any) {
            console.warn('[RemoteResource] Failed to get Google Token:', e);
            throw new Error(`Auth failed: ${e.message}`);
        }
    }

    const controller = new AbortController();
    if (fetchOptions?.timeoutMs) {
        setTimeout(() => controller.abort(), fetchOptions.timeoutMs);
    }

    const method = fetchOptions?.method || 'GET';

    const res = await fetch(url, { headers, method, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const contentType = res.headers.get('content-type') || '';

    // For images or videos, we might want blob
    // Also if parser type is explicitly file, we might want blob.
    if (contentType.startsWith('image/') || contentType.startsWith('video/')) {
        const blob = await res.blob();
        return { content: blob, contentType, headers: res.headers };
    }

    const text = await res.text();
    return { content: text, contentType, headers: res.headers };
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
        console.log(
            `[RemoteResourceProvider] Task #${task.projectSequence} is waiting for remote resource.`
        );
    }

    async validate(task: Task, payload: any): Promise<{ valid: boolean; error?: string }> {
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
        const accountId = config?.accountId;
        const fetchOptions = config?.fetch;
        const parserConfig = config?.parser;

        try {
            const { content, contentType } = await fetchResource(
                url,
                authType,
                accountId,
                fetchOptions
            );
            const lowerType = contentType.toLowerCase();
            const explicitParser = parserConfig?.type;

            // 1. Images
            if (explicitParser === 'file' || lowerType.startsWith('image/')) {
                // If explicitly file or image detected
                if (lowerType.startsWith('image/')) {
                    const fileName = url.split('/').pop()?.split('?')[0] || 'downloaded_image';
                    return {
                        kind: 'file',
                        file: {
                            name: fileName,
                            url: url,
                            size: (content as Blob).size,
                        },
                        mimeType: contentType,
                        metadata: { source: 'remote_resource', url, authType, type: 'image' },
                    };
                }
            }

            // 2. Videos
            if (lowerType.startsWith('video/')) {
                const fileName = url.split('/').pop()?.split('?')[0] || 'downloaded_video';
                return {
                    kind: 'file',
                    file: {
                        name: fileName,
                        url: url,
                        size: (content as Blob).size,
                    },
                    mimeType: contentType,
                    metadata: { source: 'remote_resource', url, authType, type: 'video' },
                };
            }

            // 3. Google Docs/Sheets/Slides (Placeholder)
            if (['google_doc', 'google_sheet', 'google_slide'].includes(explicitParser || '')) {
                // In MVP, we might treat this as a link or basic text.
                // ideally this would use the Google Drive API to export/download content.
                // For now, we return as text/link but with specific metadata.
                return {
                    kind: 'text',
                    text: `[Google Resource Link] ${url}`, // Placeholder content
                    mimeType: 'text/html', // or text/plain
                    file: { name: 'google_resource', url },
                    metadata: { source: 'remote_resource', url, authType, type: explicitParser },
                };
            }

            // 4. XML / RSS
            if (lowerType.includes('xml') || lowerType.includes('rss')) {
                return {
                    kind: 'text',
                    text: content as string,
                    mimeType: 'application/xml',
                    file: { name: 'feed.xml', url },
                    metadata: { source: 'remote_resource', url, authType, type: 'xml' },
                };
            }

            // 5. Explicit HTML or Fallback
            if (explicitParser === 'html' || lowerType.includes('text/html')) {
                const { WebContentExtractor } = await import('../../../data/WebContentExtractor');
                const extracted = WebContentExtractor.extract(content as string, url);
                return {
                    kind: 'text',
                    text: extracted.content,
                    mimeType: 'text/html',
                    file: { name: extracted.title, url },
                    metadata: {
                        source: 'remote_resource',
                        url,
                        authType,
                        extractedAt: extracted.metadata.extractedAt,
                        author: extracted.metadata.author,
                        type: 'html',
                    },
                };
            }

            // 6. JSON
            if (lowerType.includes('json')) {
                return {
                    kind: 'text',
                    text: content as string,
                    mimeType: 'application/json',
                    file: { name: 'data.json', url },
                    metadata: { source: 'remote_resource', url, authType, type: 'json' },
                };
            }

            // 7. Plain Text (Fallback)
            return {
                kind: 'text',
                text: content as string,
                mimeType: 'text/plain',
                file: { name: 'content.txt', url },
                metadata: { source: 'remote_resource', url, authType, type: 'text' },
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
