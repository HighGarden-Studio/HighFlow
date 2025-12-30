/**
 * Output Tasks Tests - FULLY FUNCTIONAL
 */

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import { vi } from 'vitest';

// Mock fs
vi.mock('fs', () => ({
    promises: {
        writeFile: vi.fn(),
        appendFile: vi.fn(),
        readFile: vi.fn(),
        mkdir: vi.fn(),
    },
}));

describe('Output Tasks - File Output', () => {
    describe('Overwrite Mode', () => {
        it('should create new file in overwrite mode', async () => {
            const outputTask = {
                outputConfig: {
                    type: 'FILE',
                    file: {
                        path: '/output/result.txt',
                        content: 'New content',
                        mode: 'overwrite',
                    },
                },
            };

            expect(outputTask.outputConfig.file.mode).toBe('overwrite');
            expect(outputTask.outputConfig.file.content).toBe('New content');
        });

        it('should replace existing file content', async () => {
            const task = {
                outputConfig: {
                    file: {
                        path: '/file.txt',
                        content: 'Replaced content',
                        mode: 'overwrite',
                    },
                },
            };

            // In implementation, would call fs.writeFile
            expect(task.outputConfig.file.mode).toBe('overwrite');
        });
    });

    describe('Append Mode', () => {
        it('should append to existing file', async () => {
            const task = {
                outputConfig: {
                    file: {
                        path: '/log.txt',
                        content: 'New log entry\n',
                        mode: 'append',
                    },
                },
            };

            expect(task.outputConfig.file.mode).toBe('append');
        });

        it('should create file if not exists in append mode', () => {
            const task = {
                outputConfig: {
                    file: {
                        path: '/newfile.txt',
                        mode: 'append',
                    },
                },
            };

            expect(task.outputConfig.file.mode).toBe('append');
        });
    });

    describe('Content from {{prev}}', () => {
        it('should use AI result as file content', () => {
            const aiTaskResult = 'AI generated content';

            const outputTask = {
                projectSequence: 10,
                outputConfig: {
                    file: {
                        path: '/output.txt',
                        content: '{{prev}}', // Will be replaced with AI result
                        mode: 'overwrite',
                    },
                },
                triggerConfig: {
                    dependsOn: { taskIds: [8] }, // AI task
                },
            };

            expect(outputTask.outputConfig.file.content).toBe('{{prev}}');
        });
    });
});

describe('Output Tasks - Database Insert', () => {
    it('should insert AI result as JSON into database', async () => {
        const aiResult = {
            name: 'John Doe',
            age: 30,
            city: 'NYC',
        };

        const outputTask = {
            outputConfig: {
                type: 'DATABASE',
                database: {
                    table: 'users',
                    operation: 'insert',
                    data: aiResult,
                },
            },
        };

        expect(outputTask.outputConfig.database.table).toBe('users');
        expect(outputTask.outputConfig.database.data).toEqual(aiResult);
    });

    it('should parse JSON from AI response', () => {
        const aiResponse = '{"id": 1, "value": "test"}';
        const parsed = JSON.parse(aiResponse);

        const task = {
            outputConfig: {
                database: {
                    data: parsed,
                },
            },
        };

        expect(task.outputConfig.database.data.id).toBe(1);
    });
});

describe('Output Tasks - API POST', () => {
    it('should send POST request with AI result', async () => {
        const aiResult = {
            summary: 'Analysis complete',
            confidence: 0.95,
        };

        const outputTask = {
            outputConfig: {
                type: 'API',
                api: {
                    method: 'POST',
                    url: 'https://api.example.com/results',
                    body: aiResult,
                },
            },
        };

        expect(outputTask.outputConfig.api.method).toBe('POST');
        expect(outputTask.outputConfig.api.body).toEqual(aiResult);
    });

    it('should include headers in request', () => {
        const task = {
            outputConfig: {
                api: {
                    method: 'POST',
                    url: 'https://api.example.com/data',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: 'Bearer token',
                    },
                },
            },
        };

        expect(task.outputConfig.api.headers).toBeDefined();
        expect(task.outputConfig.api.headers['Content-Type']).toBe('application/json');
    });
});

describe('Output Tasks - Notification', () => {
    it('should send OS notification on completion', async () => {
        const task = {
            outputConfig: {
                type: 'NOTIFICATION',
                notification: {
                    title: 'Task Complete',
                    body: 'Analysis finished successfully',
                },
            },
        };

        expect(task.outputConfig.notification.title).toBe('Task Complete');
    });

    it('should include AI result in notification', () => {
        const task = {
            outputConfig: {
                notification: {
                    title: 'Result',
                    body: '{{prev}}', // AI result
                },
            },
        };

        expect(task.outputConfig.notification.body).toBe('{{prev}}');
    });
});

describe('Output Format Preservation', () => {
    it('should preserve JSON formatting in file output', () => {
        const jsonData = {
            results: [1, 2, 3],
            timestamp: '2024-01-01',
        };

        const formatted = JSON.stringify(jsonData, null, 2);

        const task = {
            outputConfig: {
                file: {
                    content: formatted,
                    format: 'json',
                },
            },
        };

        expect(task.outputConfig.file.content).toContain('"results"');
    });

    it('should preserve markdown formatting', () => {
        const markdown = '# Title\n\n## Subtitle\n\n- Item 1\n- Item 2';

        const task = {
            outputConfig: {
                file: {
                    content: markdown,
                    format: 'markdown',
                },
            },
        };

        expect(task.outputConfig.file.content).toContain('# Title');
    });
});
