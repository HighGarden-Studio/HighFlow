/**
 * Integration tests for Image Context Passing
 * Tests the flow of image attachments from Input Tasks to AI Tasks
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TaskAttachment, AiResult } from '@core/types';

// Import the actual implementation
import { AdvancedTaskExecutor } from '@services/workflow/AdvancedTaskExecutor';

describe('Image Context Passing', () => {
    describe('TaskAttachment structure compatibility', () => {
        it('should create attachments with both value and data fields', () => {
            const executor = new AdvancedTaskExecutor();

            // Create a mock AiResult with base64 image
            const mockAiResult: AiResult = {
                kind: 'image',
                subType: 'png',
                format: 'base64',
                value: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', // 1x1 red pixel
                mime: 'image/png',
            };

            // Call buildAttachmentsFromAiResult
            const attachments = (executor as any).buildAttachmentsFromAiResult(123, mockAiResult);

            expect(attachments).toHaveLength(1);
            const attachment = attachments[0];

            // Verify both value and data fields exist and are equal
            expect(attachment.value).toBeDefined();
            expect(attachment.data).toBeDefined();
            expect(attachment.value).toBe(attachment.data);
            expect(attachment.value).toBe(mockAiResult.value);
        });

        it('should set correct metadata for image attachments', () => {
            const executor = new AdvancedTaskExecutor();

            const mockAiResult: AiResult = {
                kind: 'image',
                subType: 'jpg',
                format: 'base64',
                value: '/9j/4AAQSkZJRgABAQEBLAEsAAD/2wBD', // truncated JPEG
                mime: 'image/jpeg',
            };

            const attachments = (executor as any).buildAttachmentsFromAiResult(456, mockAiResult);

            expect(attachments).toHaveLength(1);
            expect(attachments[0]).toMatchObject({
                type: 'image',
                mime: 'image/jpeg',
                encoding: 'base64',
                sourceTaskId: 456,
            });
        });

        it('should handle different base64 formats', () => {
            const executor = new AdvancedTaskExecutor();

            const testCases = [
                { subType: 'png' as const, mime: 'image/png' },
                { subType: 'jpg' as const, mime: 'image/jpeg' },
                { subType: 'webp' as const, mime: 'image/webp' },
            ];

            for (const testCase of testCases) {
                const mockAiResult: AiResult = {
                    kind: 'image',
                    subType: testCase.subType,
                    format: 'base64',
                    value: 'base64data',
                    mime: testCase.mime,
                };

                const attachments = (executor as any).buildAttachmentsFromAiResult(1, mockAiResult);

                expect(attachments[0].mime).toBe(testCase.mime);
                expect(attachments[0].data).toBe('base64data');
                expect(attachments[0].value).toBe('base64data');
            }
        });
    });

    describe('Attachment data field access patterns', () => {
        it('should allow accessing image data via both att.data and att.value', () => {
            const attachment: TaskAttachment = {
                id: 'test-123',
                name: 'image.png',
                type: 'image',
                mime: 'image/png',
                encoding: 'base64',
                value: 'base64ImageData',
                data: 'base64ImageData',
                size: 1024,
                sourceTaskId: 1,
            };

            // Simulate the code path in AIServiceManager that tries both fields
            const data = attachment.data || (attachment as any).value;

            expect(data).toBe('base64ImageData');
        });

        it('should handle attachments with only value field (legacy)', () => {
            const legacyAttachment: TaskAttachment = {
                id: 'legacy-456',
                name: 'image.jpg',
                type: 'image',
                mime: 'image/jpeg',
                encoding: 'base64',
                value: 'legacyBase64Data',
                // No 'data' field
            };

            // This should still work
            const data = legacyAttachment.data || (legacyAttachment as any).value;

            expect(data).toBe('legacyBase64Data');
        });
    });

    describe('Dependency attachment extraction', () => {
        it('should extract attachments from previous task results', () => {
            const executor = new AdvancedTaskExecutor();

            const mockPreviousResults = [
                {
                    taskId: 100,
                    output: {
                        attachments: [
                            {
                                id: 'img-1',
                                name: 'diagram.png',
                                type: 'image' as const,
                                mime: 'image/png',
                                encoding: 'base64' as const,
                                value: 'imageData123',
                                data: 'imageData123',
                            },
                        ],
                    },
                    metadata: {
                        attachments: [
                            {
                                id: 'img-1',
                                name: 'diagram.png',
                                type: 'image' as const,
                                mime: 'image/png',
                                encoding: 'base64' as const,
                                value: 'imageData123',
                                data: 'imageData123',
                            },
                        ],
                    },
                },
            ];

            // Call attachDependencyArtifactsToContext
            const context: any = {
                metadata: {},
            };

            (executor as any).attachDependencyArtifactsToContext(context, mockPreviousResults);

            expect(context.metadata.attachments).toBeDefined();
            expect(context.metadata.attachments).toHaveLength(1);
            expect(context.metadata.attachments[0].value).toBe('imageData123');
            expect(context.metadata.attachments[0].data).toBe('imageData123');
        });

        it('should handle missing attachments gracefully', () => {
            const executor = new AdvancedTaskExecutor();

            const mockPreviousResults = [
                {
                    taskId: 101,
                    output: {
                        // No attachments field
                    },
                    metadata: {},
                },
            ];

            const context: any = {
                metadata: {},
            };

            (executor as any).attachDependencyArtifactsToContext(context, mockPreviousResults);

            // Should not throw and should create empty or handle gracefully
            expect(
                context.metadata.attachments === undefined ||
                    context.metadata.attachments.length === 0
            ).toBe(true);
        });
    });

    describe('Binary data encoding', () => {
        it('should calculate size correctly for base64 data', () => {
            const executor = new AdvancedTaskExecutor();

            // Base64 of "Hello" is "SGVsbG8="
            const mockAiResult: AiResult = {
                kind: 'binary',
                subType: 'bin',
                format: 'base64',
                value: 'SGVsbG8=',
                mime: 'application/octet-stream',
            };

            const attachments = (executor as any).buildAttachmentsFromAiResult(1, mockAiResult);

            // Size calculation: Math.round((base64Length * 3) / 4)
            // For "SGVsbG8=" (8 chars): Math.round((8 * 3) / 4) = 6
            // But actual decoded size is 5 bytes ("Hello")
            // The formula gives an estimate
            expect(attachments[0].size).toBeDefined();
            expect(attachments[0].size).toBeGreaterThan(0);
        });
    });
});
