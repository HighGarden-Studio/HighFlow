/**
 * Performance Tests: Load Performance
 *
 * Tests the performance of loading and rendering large datasets.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { performance } from 'perf_hooks';

// ==========================================
// Test Data Generators
// ==========================================

const generateTasks = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        projectId: 1,
        title: `Task ${i + 1}`,
        description: `Description for task ${i + 1} with some additional text to simulate real data`,
        status: ['todo', 'in_progress', 'in_review', 'done', 'blocked'][i % 5],
        priority: ['low', 'medium', 'high', 'urgent'][i % 4],
        tags: [`tag-${i % 10}`, `category-${i % 5}`],
        estimatedTime: Math.floor(Math.random() * 480) + 30,
        createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
    }));
};

const generateProjects = (count: number, tasksPerProject: number) => {
    return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        name: `Project ${i + 1}`,
        description: `Description for project ${i + 1}`,
        color: `#${Math.floor(Math.random() * 16777215)
            .toString(16)
            .padStart(6, '0')}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        tasks: generateTasks(tasksPerProject),
    }));
};

// ==========================================
// Performance Measurement Utility
// ==========================================

class PerformanceTracker {
    private measurements: Map<string, number[]> = new Map();

    measure<T>(name: string, fn: () => T): T {
        const start = performance.now();
        const result = fn();
        const end = performance.now();
        const duration = end - start;

        if (!this.measurements.has(name)) {
            this.measurements.set(name, []);
        }
        this.measurements.get(name)!.push(duration);

        return result;
    }

    async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
        const start = performance.now();
        const result = await fn();
        const end = performance.now();
        const duration = end - start;

        if (!this.measurements.has(name)) {
            this.measurements.set(name, []);
        }
        this.measurements.get(name)!.push(duration);

        return result;
    }

    getStats(name: string) {
        const times = this.measurements.get(name) || [];
        if (times.length === 0) {
            return { avg: 0, min: 0, max: 0, p95: 0 };
        }

        const sorted = [...times].sort((a, b) => a - b);
        const sum = sorted.reduce((a, b) => a + b, 0);

        return {
            avg: sum / sorted.length,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            p95: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
        };
    }

    clear() {
        this.measurements.clear();
    }
}

// ==========================================
// Performance Tests
// ==========================================

describe('Load Performance', () => {
    let tracker: PerformanceTracker;

    beforeEach(() => {
        tracker = new PerformanceTracker();
    });

    afterEach(() => {
        tracker.clear();
    });

    // ==========================================
    // Data Generation Performance
    // ==========================================

    describe('Data Generation', () => {
        it('should generate 100 tasks in under 50ms', () => {
            const duration = tracker.measure('generate-100', () => {
                generateTasks(100);
            });

            expect(duration).toBeLessThan(50);
        });

        it('should generate 1000 tasks in under 100ms', () => {
            const duration = tracker.measure('generate-1000', () => {
                generateTasks(1000);
            });

            expect(duration).toBeLessThan(100);
        });

        it('should generate 10000 tasks in under 500ms', () => {
            const duration = tracker.measure('generate-10000', () => {
                generateTasks(10000);
            });

            expect(duration).toBeLessThan(500);
        });

        it('should generate 10 projects with 100 tasks each in under 200ms', () => {
            const duration = tracker.measure('generate-projects', () => {
                generateProjects(10, 100);
            });

            expect(duration).toBeLessThan(200);
        });
    });

    // ==========================================
    // Task Filtering Performance
    // ==========================================

    describe('Task Filtering', () => {
        const tasks = generateTasks(10000);

        it('should filter by status in under 10ms', () => {
            const duration = tracker.measure('filter-status', () => {
                tasks.filter((t) => t.status === 'in_progress');
            });

            expect(duration).toBeLessThan(10);
        });

        it('should filter by multiple criteria in under 20ms', () => {
            const duration = tracker.measure('filter-multi', () => {
                tasks.filter(
                    (t) => t.status === 'todo' && t.priority === 'high' && t.tags.includes('tag-1')
                );
            });

            expect(duration).toBeLessThan(20);
        });

        it('should search by title in under 30ms', () => {
            const searchTerm = 'Task 500';

            const duration = tracker.measure('search-title', () => {
                tasks.filter((t) => t.title.toLowerCase().includes(searchTerm.toLowerCase()));
            });

            expect(duration).toBeLessThan(30);
        });

        it('should sort tasks by date in under 50ms', () => {
            const duration = tracker.measure('sort-date', () => {
                [...tasks].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            });

            expect(duration).toBeLessThan(50);
        });

        it('should group tasks by status in under 20ms', () => {
            const duration = tracker.measure('group-status', () => {
                tasks.reduce(
                    (groups, task) => {
                        const status = task.status;
                        if (!groups[status]) {
                            groups[status] = [];
                        }
                        groups[status].push(task);
                        return groups;
                    },
                    {} as Record<string, typeof tasks>
                );
            });

            expect(duration).toBeLessThan(20);
        });
    });

    // ==========================================
    // Large Dataset Processing
    // ==========================================

    describe('Large Dataset Processing', () => {
        it('should process 50,000 tasks without memory issues', () => {
            const initialMemory = process.memoryUsage().heapUsed;

            const tasks = tracker.measure('process-50k', () => generateTasks(50000));

            const afterGeneration = process.memoryUsage().heapUsed;
            const memoryIncrease = (afterGeneration - initialMemory) / 1024 / 1024;

            // Should use less than 100MB for 50k tasks
            expect(memoryIncrease).toBeLessThan(100);
            expect(tasks.length).toBe(50000);
        });

        it('should aggregate statistics over 10,000 tasks in under 50ms', () => {
            const tasks = generateTasks(10000);

            const duration = tracker.measure('aggregate-stats', () => {
                const stats = {
                    total: tasks.length,
                    byStatus: {} as Record<string, number>,
                    byPriority: {} as Record<string, number>,
                    avgEstimatedTime: 0,
                    totalEstimatedTime: 0,
                };

                for (const task of tasks) {
                    stats.byStatus[task.status] = (stats.byStatus[task.status] || 0) + 1;
                    stats.byPriority[task.priority] = (stats.byPriority[task.priority] || 0) + 1;
                    stats.totalEstimatedTime += task.estimatedTime;
                }

                stats.avgEstimatedTime = stats.totalEstimatedTime / tasks.length;

                return stats;
            });

            expect(duration).toBeLessThan(50);
        });
    });

    // ==========================================
    // Dependency Graph Performance
    // ==========================================

    describe('Dependency Graph', () => {
        const createTasksWithDependencies = (count: number) => {
            const tasks = generateTasks(count);

            // Add dependencies (each task depends on previous 1-3 tasks)
            return tasks.map((task, index) => ({
                ...task,
                dependencies:
                    index > 0
                        ? Array.from(
                              { length: Math.min(3, index) },
                              (_, i) => tasks[index - i - 1].id
                          )
                        : [],
            }));
        };

        it('should build dependency graph for 1000 tasks in under 100ms', () => {
            const tasks = createTasksWithDependencies(1000);

            const duration = tracker.measure('build-graph', () => {
                const graph = new Map<number, number[]>();
                const reverseGraph = new Map<number, number[]>();

                for (const task of tasks) {
                    graph.set(task.id, task.dependencies);

                    for (const dep of task.dependencies) {
                        if (!reverseGraph.has(dep)) {
                            reverseGraph.set(dep, []);
                        }
                        reverseGraph.get(dep)!.push(task.id);
                    }
                }

                return { graph, reverseGraph };
            });

            expect(duration).toBeLessThan(100);
        });

        it('should find critical path in under 200ms', () => {
            const tasks = createTasksWithDependencies(500);
            const taskMap = new Map(tasks.map((t) => [t.id, t]));

            const duration = tracker.measure('critical-path', () => {
                const visited = new Set<number>();

                const findLongestPath = (taskId: number): number => {
                    if (visited.has(taskId)) return 0;
                    visited.add(taskId);

                    const task = taskMap.get(taskId);
                    if (!task) return 0;

                    let maxDepPath = 0;
                    for (const depId of task.dependencies) {
                        maxDepPath = Math.max(maxDepPath, findLongestPath(depId));
                    }

                    return maxDepPath + (task.estimatedTime || 0);
                };

                // Find task with longest path
                let maxPath = 0;
                for (const task of tasks) {
                    visited.clear();
                    const pathLength = findLongestPath(task.id);
                    maxPath = Math.max(maxPath, pathLength);
                }

                return maxPath;
            });

            expect(duration).toBeLessThan(200);
        });

        it('should detect cycles in dependency graph', () => {
            const tasks = createTasksWithDependencies(100);

            const duration = tracker.measure('detect-cycles', () => {
                const visited = new Set<number>();
                const recursionStack = new Set<number>();
                const adjacency = new Map<number, number[]>();

                // Build adjacency list
                for (const task of tasks) {
                    adjacency.set(task.id, task.dependencies);
                }

                const hasCycle = (taskId: number): boolean => {
                    visited.add(taskId);
                    recursionStack.add(taskId);

                    const deps = adjacency.get(taskId) || [];
                    for (const dep of deps) {
                        if (!visited.has(dep)) {
                            if (hasCycle(dep)) return true;
                        } else if (recursionStack.has(dep)) {
                            return true;
                        }
                    }

                    recursionStack.delete(taskId);
                    return false;
                };

                for (const task of tasks) {
                    if (!visited.has(task.id)) {
                        if (hasCycle(task.id)) return true;
                    }
                }

                return false;
            });

            expect(duration).toBeLessThan(50);
        });
    });

    // ==========================================
    // JSON Serialization Performance
    // ==========================================

    describe('JSON Serialization', () => {
        it('should serialize 1000 tasks in under 50ms', () => {
            const tasks = generateTasks(1000);

            const duration = tracker.measure('serialize', () => {
                JSON.stringify(tasks);
            });

            expect(duration).toBeLessThan(50);
        });

        it('should deserialize 1000 tasks in under 50ms', () => {
            const tasks = generateTasks(1000);
            const json = JSON.stringify(tasks);

            const duration = tracker.measure('deserialize', () => {
                JSON.parse(json);
            });

            expect(duration).toBeLessThan(50);
        });

        it('should handle nested project data serialization', () => {
            const projects = generateProjects(10, 100);

            const serializeDuration = tracker.measure('serialize-nested', () => {
                JSON.stringify(projects);
            });

            expect(serializeDuration).toBeLessThan(100);

            const json = JSON.stringify(projects);

            const deserializeDuration = tracker.measure('deserialize-nested', () => {
                JSON.parse(json);
            });

            expect(deserializeDuration).toBeLessThan(100);
        });
    });

    // ==========================================
    // Concurrent Operations
    // ==========================================

    describe('Concurrent Operations', () => {
        it('should handle 100 concurrent filter operations', async () => {
            const tasks = generateTasks(1000);
            const statuses = ['todo', 'in_progress', 'in_review', 'done', 'blocked'];

            const duration = await tracker.measureAsync('concurrent-filters', async () => {
                const operations = Array.from({ length: 100 }, (_, i) =>
                    Promise.resolve(tasks.filter((t) => t.status === statuses[i % statuses.length]))
                );

                await Promise.all(operations);
            });

            expect(duration).toBeLessThan(100);
        });

        it('should handle concurrent sort and filter', async () => {
            const tasks = generateTasks(5000);

            const duration = await tracker.measureAsync('concurrent-sort-filter', async () => {
                const filterOp = Promise.resolve(tasks.filter((t) => t.priority === 'high'));

                const sortOp = Promise.resolve(
                    [...tasks].sort((a, b) => a.estimatedTime - b.estimatedTime)
                );

                const groupOp = Promise.resolve(
                    tasks.reduce(
                        (g, t) => {
                            g[t.status] = (g[t.status] || []).concat(t);
                            return g;
                        },
                        {} as Record<string, typeof tasks>
                    )
                );

                await Promise.all([filterOp, sortOp, groupOp]);
            });

            expect(duration).toBeLessThan(100);
        });
    });

    // ==========================================
    // Memory Efficiency
    // ==========================================

    describe('Memory Efficiency', () => {
        it('should release memory after processing', () => {
            // Force GC if available
            if (global.gc) {
                global.gc();
            }

            const initialMemory = process.memoryUsage().heapUsed;

            // Create and process large dataset
            (() => {
                const tasks = generateTasks(100000);
                const filtered = tasks.filter((t) => t.status === 'done');
                const sorted = [...filtered].sort((a, b) => a.id - b.id);
                // Use sorted to prevent optimization
                expect(sorted.length).toBeGreaterThan(0);
            })();

            // Force GC if available
            if (global.gc) {
                global.gc();
            }

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryDiff = (finalMemory - initialMemory) / 1024 / 1024;

            // Memory should not have grown significantly
            // (allowing 50MB margin for any retained references)
            expect(memoryDiff).toBeLessThan(50);
        });
    });

    // ==========================================
    // Repeated Operations Performance
    // ==========================================

    describe('Repeated Operations', () => {
        it('should maintain consistent performance over 100 iterations', () => {
            const tasks = generateTasks(1000);
            const times: number[] = [];

            for (let i = 0; i < 100; i++) {
                const start = performance.now();
                tasks.filter((t) => t.status === 'todo');
                times.push(performance.now() - start);
            }

            const avg = times.reduce((a, b) => a + b, 0) / times.length;
            const max = Math.max(...times);
            const variance = times.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / times.length;
            const stdDev = Math.sqrt(variance);

            // Average should be under 5ms
            expect(avg).toBeLessThan(5);

            // No single operation should be more than 3x average
            expect(max).toBeLessThan(avg * 3);

            // Standard deviation should be low (consistent performance)
            expect(stdDev).toBeLessThan(avg);
        });
    });
});
