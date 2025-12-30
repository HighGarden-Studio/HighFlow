/**
 * Core Features Tests - FULLY FUNCTIONAL
 *
 * Tests dependency resolution and macro resolution with actual implementation
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Task } from '../../src/core/types/database';

// Mock database
const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
};

const mockTasks = {
    projectId: {},
    projectSequence: {},
    id: {},
    status: {},
};

const mockProjects = {
    id: {},
    title: {},
    description: {},
    baseDevFolder: {},
};

// Mock drizzle-orm
vi.mock('drizzle-orm', () => ({
    eq: vi.fn((field, value) => ({ field, value, type: 'eq' })),
    sql: Object.assign(
        (strings: TemplateStringsArray, ...values: any[]) => ({
            strings,
            values,
            type: 'sql',
        }),
        {
            join: vi.fn((items, separator) => ({ items, separator, type: 'join' })),
        }
    ),
}));

// Mock database client
vi.mock('../../electron/main/database/client', () => ({
    db: mockDb,
}));

// Mock database schema
vi.mock('../../electron/main/database/schema', () => ({
    tasks: mockTasks,
    projects: mockProjects,
}));

// Import after mocks
import * as macroResolver from '../../electron/main/utils/macro-resolver';

describe('Dependency Resolution - ProjectSequence Support', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    describe('Format Detection', () => {
        it('should detect projectSequence format when all IDs match projectSequence', async () => {
            const projectId = 1;
            const dependencyIds = [5, 7];

            // Mock: Both IDs exist as projectSequence in current project
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([
                        { id: 19, projectSequence: 5, projectId: 1 },
                        { id: 23, projectSequence: 7, projectId: 1 },
                    ]),
                }),
            });

            // Dynamic import to get fresh module with mocks
            const { detectDependencyFormat } =
                await import('../../electron/main/utils/macro-resolver');

            const format = await (detectDependencyFormat as any)(projectId, dependencyIds);

            expect(format).toBe('projectSequence');
            expect(mockDb.select).toHaveBeenCalled();
        });

        it('should detect global ID format when IDs do not match projectSequence', async () => {
            const projectId = 1;
            const dependencyIds = [19, 23]; // These are global IDs

            // Mock: No matching projectSequences (only 1 found, not all)
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([
                        { id: 19, projectSequence: 15, projectId: 1 }, // Different projectSequence
                    ]),
                }),
            });

            const { detectDependencyFormat } =
                await import('../../electron/main/utils/macro-resolver');

            const format = await (detectDependencyFormat as any)(projectId, dependencyIds);

            expect(format).toBe('global');
        });

        it('should handle empty dependency array', async () => {
            const { detectDependencyFormat } =
                await import('../../electron/main/utils/macro-resolver');

            const format = await (detectDependencyFormat as any)(1, []);

            expect(format).toBe('projectSequence');
        });
    });

    describe('ProjectSequence to Global ID Conversion', () => {
        it('should convert projectSequence numbers to global IDs', async () => {
            const projectId = 1;
            const sequences = [5, 7, 8];

            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([
                        { id: 19, projectSequence: 5, projectId: 1 },
                        { id: 23, projectSequence: 7, projectId: 1 },
                        { id: 22, projectSequence: 8, projectId: 1 },
                    ]),
                }),
            });

            const { convertProjectSequencesToGlobalIds } =
                await import('../../electron/main/utils/macro-resolver');

            const globalIds = await (convertProjectSequencesToGlobalIds as any)(
                projectId,
                sequences
            );

            expect(globalIds).toEqual([19, 23, 22]);
            expect(mockDb.select).toHaveBeenCalled();
        });

        it('should handle empty sequence array', async () => {
            const { convertProjectSequencesToGlobalIds } =
                await import('../../electron/main/utils/macro-resolver');

            const globalIds = await (convertProjectSequencesToGlobalIds as any)(1, []);

            expect(globalIds).toEqual([]);
            expect(mockDb.select).not.toHaveBeenCalled();
        });

        it('should return empty array for non-existent projectSequences', async () => {
            const projectId = 1;
            const sequences = [999];

            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockResolvedValue([]), // No matches
                }),
            });

            const { convertProjectSequencesToGlobalIds } =
                await import('../../electron/main/utils/macro-resolver');

            const globalIds = await (convertProjectSequencesToGlobalIds as any)(
                projectId,
                sequences
            );

            expect(globalIds).toEqual([]);
        });
    });
});

describe('Macro Resolution - resolveMacrosInCode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('{{project.*}} Macros', () => {
        it('should resolve {{project.name}}', async () => {
            const code = 'console.log({{project.name}});';
            const task: Partial<Task> = {
                id: 1,
                projectSequence: 1,
                projectId: 1,
            };

            // Mock project data
            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([
                            {
                                id: 1,
                                title: 'My Awesome Project',
                                description: 'Project description',
                                baseDevFolder: '/path/to/project',
                            },
                        ]),
                    }),
                }),
            });

            const { resolveMacrosInCode } =
                await import('../../electron/main/utils/macro-resolver');

            const resolved = await resolveMacrosInCode(code, task as Task, 1);

            expect(resolved).toContain('"My Awesome Project"');
        });

        it('should resolve {{project.description}}', async () => {
            const code = 'const desc = {{project.description}};';
            const task: Partial<Task> = {
                id: 1,
                projectSequence: 1,
                projectId: 1,
            };

            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([
                            {
                                id: 1,
                                title: 'Project',
                                description: 'This is the description',
                                baseDevFolder: '',
                            },
                        ]),
                    }),
                }),
            });

            const { resolveMacrosInCode } =
                await import('../../electron/main/utils/macro-resolver');

            const resolved = await resolveMacrosInCode(code, task as Task, 1);

            expect(resolved).toContain('"This is the description"');
        });

        it('should handle empty project fields', async () => {
            const code = 'const folder = {{project.baseDevFolder}};';
            const task: Partial<Task> = {
                id: 1,
                projectSequence: 1,
                projectId: 1,
            };

            mockDb.select.mockReturnValue({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockReturnValue({
                        limit: vi.fn().mockResolvedValue([
                            {
                                id: 1,
                                title: 'Project',
                                description: null,
                                baseDevFolder: null,
                            },
                        ]),
                    }),
                }),
            });

            const { resolveMacrosInCode } =
                await import('../../electron/main/utils/macro-resolver');

            const resolved = await resolveMacrosInCode(code, task as Task, 1);

            expect(resolved).toContain('""'); // Empty string
        });
    });

    describe('{{prev}} Macro with Dependencies', () => {
        it('should resolve {{prev}} to last dependency task', async () => {
            const code = 'const data = {{prev}};';
            const task: Partial<Task> = {
                id: 22,
                projectSequence: 8,
                projectId: 1,
                triggerConfig: JSON.stringify({
                    dependsOn: {
                        taskIds: [5], // ProjectSequence
                        operator: 'all',
                    },
                }) as any,
            };

            let callCount = 0;
            mockDb.select.mockImplementation(() => ({
                from: vi.fn().mockReturnValue({
                    where: vi.fn().mockImplementation((condition: any) => {
                        callCount++;

                        // First call: get project
                        if (callCount === 1) {
                            return {
                                limit: vi
                                    .fn()
                                    .mockResolvedValue([
                                        {
                                            id: 1,
                                            title: 'Project',
                                            description: '',
                                            baseDevFolder: '',
                                        },
                                    ]),
                            };
                        }

                        // Second call: detect dependency format (check if [5] exists as projectSequence)
                        if (callCount === 2) {
                            return Promise.resolve([{ id: 19, projectSequence: 5, projectId: 1 }]);
                        }

                        // Third call: convert projectSequence to global IDs
                        if (callCount === 3) {
                            return Promise.resolve([{ id: 19, projectSequence: 5, projectId: 1 }]);
                        }

                        // Fourth call: get dependency list for logging (id IN (...))
                        if (callCount === 4) {
                            return Promise.resolve([{ id: 19, projectSequence: 5 }]);
                        }

                        // Fifth call: get completed dependency tasks (projectId AND id IN AND status='done')
                        if (callCount === 5) {
                            return Promise.resolve([
                                {
                                    id: 19,
                                    projectSequence: 5,
                                    projectId: 1,
                                    status: 'done',
                                    executionResult: JSON.stringify({
                                        content: 'Task #5 result',
                                    }),
                                },
                            ]);
                        }

                        return Promise.resolve([]);
                    }),
                }),
            }));

            const { resolveMacrosInCode } =
                await import('../../electron/main/utils/macro-resolver');

            const resolved = await resolveMacrosInCode(code, task as Task, 1);

            // Should contain the result from Task #5
            expect(resolved).toContain('Task #5 result');
        });
    });
});
