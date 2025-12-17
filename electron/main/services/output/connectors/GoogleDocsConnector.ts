import axios from 'axios';
import type { OutputConnector, OutputResult } from '../OutputConnector';
import type { OutputTaskConfig } from '@core/types/database';

export class GoogleDocsConnector implements OutputConnector {
    readonly id = 'google_docs';

    async validate(config: OutputTaskConfig): Promise<boolean> {
        return config.destination === 'google_docs';
    }

    async execute(
        config: OutputTaskConfig,
        content: string,
        context: { basePath: string; taskId?: string; project?: any }
    ): Promise<OutputResult> {
        try {
            if (config.destination !== 'google_docs' || !config.googleDocs) {
                return { success: false, error: 'Misconfigured Google Docs connector' };
            }

            // TODO: Integrate with Auth Service to get Access Token
            // For now, assume process.env.GOOGLE_ACCESS_TOKEN or failing gracefully
            const accessToken = process.env.GOOGLE_ACCESS_TOKEN;

            if (!accessToken) {
                return {
                    success: false,
                    error: 'Google Access Token not available. Auth integration required.',
                };
            }

            // 1. Create Document
            const createRes = await axios.post(
                'https://docs.googleapis.com/v1/documents',
                {
                    title: config.googleDocs.documentName || `Output Task ${context.taskId || ''}`,
                },
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            const documentId = createRes.data.documentId;

            // 2. Insert Content (Basic text insertion)
            // Note: Google Docs API requires commands (requests)
            if (content) {
                await axios.post(
                    `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
                    {
                        requests: [
                            {
                                insertText: {
                                    text: content,
                                    endOfSegmentLocation: {
                                        segmentId: '', // Body
                                    },
                                },
                            },
                        ],
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                        },
                    }
                );
            }

            return {
                success: true,
                data: {
                    documentId,
                    url: `https://docs.google.com/document/d/${documentId}/edit`,
                },
            };
        } catch (error: any) {
            console.error('Google Docs Connector Error:', error);
            // Enhanced error info
            const msg = error.response?.data?.error?.message || error.message;
            return { success: false, error: msg };
        }
    }
}
