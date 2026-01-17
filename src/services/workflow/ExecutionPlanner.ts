import type { Task } from '@core/types/database';
import type {
    ExecutionPlan,
    Stage,
    DependencyGraph,
    GraphNode,
    GraphEdge,
    ResourceMap,
    Constraints,
    PlanVisualization,
    VisualizationStage,
} from './types';

export class ExecutionPlanner {
    /**
     * Task 의존성 그래프 생성 및 실행 계획 수립
     */
    async createPlan(tasks: Task[]): Promise<ExecutionPlan> {
        // 1. 의존성 그래프 생성
        const dependencyGraph = this.buildDependencyGraph(tasks);

        // 2. 토폴로지 정렬 수행
        const sortedNodes = this.topologicalSort(dependencyGraph);

        // 3. 병렬 실행 가능한 Stage 그룹핑
        const stages = this.groupIntoStages(sortedNodes);

        // 4. Critical Path 계산
        const criticalPath = this.calculateCriticalPath(dependencyGraph, tasks);

        // 5. 리소스 할당
        const resourceAllocation = this.allocateResources(tasks);

        // 6. 예상 소요 시간 및 비용 계산
        const estimatedDuration = this.estimateDuration(stages);
        const estimatedCost = this.estimateCost(tasks);

        const workflowId = `wf-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        return {
            workflowId,
            stages,
            criticalPath,
            estimatedDuration,
            estimatedCost,
            resourceAllocation,
            dependencyGraph,
            metadata: {
                createdAt: new Date(),
                taskCount: tasks.length,
                stageCount: stages.length,
            },
        };
    }

    /**
     * 의존성 그래프 생성
     */
    private buildDependencyGraph(tasks: Task[]): DependencyGraph {
        const nodes: GraphNode[] = [];
        const edges: GraphEdge[] = [];
        const taskMap = new Map(tasks.map((t) => [t.projectSequence, t]));

        // 노드 생성
        for (const task of tasks) {
            nodes.push({
                taskId: task.projectSequence,
                task,
                level: 0, // 나중에 계산
                estimatedDuration: task.estimatedMinutes
                    ? task.estimatedMinutes * 60 * 1000
                    : 300000, // 기본 5분
            });
        }

        // 엣지 생성 (의존성 기반)
        for (const task of tasks) {
            // parentTaskId 의존성
            if (task.parentTaskId) {
                edges.push({
                    from: task.parentTaskId,
                    to: task.projectSequence,
                    type: 'dependency',
                });
            }

            // blockedByTaskId 의존성
            if (task.blockedByTaskId) {
                edges.push({
                    from: task.blockedByTaskId,
                    to: task.projectSequence,
                    type: 'dependency',
                });
            }

            // triggerConfig 의존성
            if (task.triggerConfig?.dependsOn) {
                for (const depId of task.triggerConfig.dependsOn.taskIds) {
                    if (taskMap.has(depId)) {
                        edges.push({
                            from: depId,
                            to: task.projectSequence,
                            type: 'dependency',
                        });
                    }
                }
            }
        }

        // 레벨 계산 (토폴로지 레벨)
        this.calculateLevels(nodes, edges);

        return { nodes, edges };
    }

    /**
     * 토폴로지 정렬 (Kahn's Algorithm)
     */
    private topologicalSort(graph: DependencyGraph): GraphNode[] {
        const sorted: GraphNode[] = [];
        const inDegree = new Map<number, number>();
        const adjacencyList = new Map<number, number[]>();

        // 초기화
        for (const node of graph.nodes) {
            inDegree.set(node.taskId, 0);
            adjacencyList.set(node.taskId, []);
        }

        // 진입 차수 계산
        for (const edge of graph.edges) {
            inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
            adjacencyList.get(edge.from)?.push(edge.to);
        }

        // 진입 차수가 0인 노드로 시작
        const queue: number[] = [];
        for (const [taskId, degree] of inDegree.entries()) {
            if (degree === 0) {
                queue.push(taskId);
            }
        }

        // 토폴로지 정렬
        while (queue.length > 0) {
            const taskId = queue.shift()!;
            const node = graph.nodes.find((n) => n.taskId === taskId);
            if (node) {
                sorted.push(node);
            }

            const neighbors = adjacencyList.get(taskId) || [];
            for (const neighbor of neighbors) {
                const newDegree = (inDegree.get(neighbor) || 0) - 1;
                inDegree.set(neighbor, newDegree);

                if (newDegree === 0) {
                    queue.push(neighbor);
                }
            }
        }

        // 순환 의존성 체크
        if (sorted.length !== graph.nodes.length) {
            throw new Error('Circular dependency detected in task graph');
        }

        return sorted;
    }

    /**
     * 레벨 계산 (BFS)
     */
    private calculateLevels(nodes: GraphNode[], edges: GraphEdge[]): void {
        const levelMap = new Map<number, number>();
        const adjacencyList = new Map<number, number[]>();

        // 인접 리스트 구성
        for (const node of nodes) {
            adjacencyList.set(node.taskId, []);
            levelMap.set(node.taskId, 0);
        }

        for (const edge of edges) {
            adjacencyList.get(edge.from)?.push(edge.to);
        }

        // 진입 차수가 0인 노드부터 시작
        const queue: Array<{ taskId: number; level: number }> = [];
        const inDegree = new Map<number, number>();

        for (const node of nodes) {
            const degree = edges.filter((e) => e.to === node.taskId).length;
            inDegree.set(node.taskId, degree);
            if (degree === 0) {
                queue.push({ taskId: node.taskId, level: 0 });
            }
        }

        // BFS로 레벨 계산
        while (queue.length > 0) {
            const { taskId, level } = queue.shift()!;
            levelMap.set(taskId, level);

            const neighbors = adjacencyList.get(taskId) || [];
            for (const neighbor of neighbors) {
                const newDegree = (inDegree.get(neighbor) || 0) - 1;
                inDegree.set(neighbor, newDegree);

                if (newDegree === 0) {
                    queue.push({ taskId: neighbor, level: level + 1 });
                }
            }
        }

        // 노드에 레벨 적용
        for (const node of nodes) {
            node.level = levelMap.get(node.taskId) || 0;
        }
    }

    /**
     * Stage로 그룹핑 (같은 레벨 = 병렬 실행 가능)
     */
    private groupIntoStages(sortedNodes: GraphNode[]): Stage[] {
        const stages: Stage[] = [];
        const levelGroups = new Map<number, GraphNode[]>();

        // 레벨별로 노드 그룹핑
        for (const node of sortedNodes) {
            const group = levelGroups.get(node.level) || [];
            group.push(node);
            levelGroups.set(node.level, group);
        }

        // Stage 생성
        const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);
        for (let i = 0; i < sortedLevels.length; i++) {
            const level = sortedLevels[i]!;
            const nodes = levelGroups.get(level)!;
            const tasks = nodes.map((n) => n.task);

            // 의존성 계산 (이전 Stage들)
            const dependencies: number[] = [];
            if (i > 0) {
                dependencies.push(i - 1); // 직전 Stage 의존
            }

            // 예상 시간 (병렬 실행이므로 가장 긴 Task 기준)
            const estimatedDuration = Math.max(...nodes.map((n) => n.estimatedDuration));

            stages.push({
                id: i,
                tasks,
                canRunInParallel: nodes.length > 1,
                estimatedDuration,
                dependencies,
            });
        }

        return stages;
    }

    /**
     * Critical Path 계산 (가장 긴 의존성 체인)
     */
    private calculateCriticalPath(graph: DependencyGraph, tasks: Task[]): Task[] {
        const { nodes, edges } = graph;
        const taskMap = new Map(tasks.map((t) => [t.projectSequence, t]));

        // 각 노드의 최장 경로 계산
        const longestPath = new Map<number, number>();
        const predecessor = new Map<number, number | null>();

        // 초기화
        for (const node of nodes) {
            longestPath.set(node.taskId, node.estimatedDuration);
            predecessor.set(node.taskId, null);
        }

        // 토폴로지 순서로 최장 경로 계산
        const sorted = this.topologicalSort(graph);
        for (const node of sorted) {
            const currentPath = longestPath.get(node.taskId) || 0;

            // 후속 노드들의 경로 업데이트
            const outgoingEdges = edges.filter((e) => e.from === node.taskId);
            for (const edge of outgoingEdges) {
                const nextNode = nodes.find((n) => n.taskId === edge.to);
                if (nextNode) {
                    const newPath = currentPath + nextNode.estimatedDuration;
                    const existingPath = longestPath.get(edge.to) || 0;

                    if (newPath > existingPath) {
                        longestPath.set(edge.to, newPath);
                        predecessor.set(edge.to, node.taskId);
                    }
                }
            }
        }

        // 최장 경로 찾기 (끝 노드부터 역추적)
        if (nodes.length === 0) return [];

        let maxPath = 0;
        let endTaskId = nodes[0]!.taskId;
        for (const [taskId, pathLength] of longestPath.entries()) {
            if (pathLength > maxPath) {
                maxPath = pathLength;
                endTaskId = taskId;
            }
        }

        // Critical Path 재구성
        const criticalPathIds: number[] = [];
        let currentId: number | null = endTaskId;
        while (currentId !== null) {
            criticalPathIds.unshift(currentId);
            currentId = predecessor.get(currentId) || null;
        }

        return criticalPathIds
            .map((id) => taskMap.get(id))
            .filter((t): t is Task => t !== undefined);
    }

    /**
     * 리소스 할당
     */
    private allocateResources(tasks: Task[]): ResourceMap {
        const resourceMap: ResourceMap = {};

        // AI 제공자별 사용량 계산
        const providerUsage = new Map<string, number>();
        for (const task of tasks) {
            const provider = task.aiProvider || 'anthropic';
            providerUsage.set(provider, (providerUsage.get(provider) || 0) + 1);
        }

        // 리소스 맵 생성
        for (const [provider, usage] of providerUsage.entries()) {
            resourceMap[provider] = {
                maxConcurrency: this.getProviderMaxConcurrency(provider),
                rateLimit: this.getProviderRateLimit(provider),
                estimatedUsage: usage,
            };
        }

        return resourceMap;
    }

    /**
     * 제공자별 최대 동시 실행 수
     */
    private getProviderMaxConcurrency(provider: string): number {
        const limits: Record<string, number> = {
            anthropic: 5,
            openai: 10,
            google: 5,
            default: 3,
        };
        return limits[provider] ?? limits.default ?? 3;
    }

    /**
     * 제공자별 Rate Limit (RPM)
     */
    private getProviderRateLimit(provider: string): number {
        const limits: Record<string, number> = {
            anthropic: 50,
            openai: 60,
            google: 60,
            default: 30,
        };
        return limits[provider] ?? limits.default ?? 30;
    }

    /**
     * 전체 예상 시간 계산
     */
    private estimateDuration(stages: Stage[]): number {
        return stages.reduce((total, stage) => total + stage.estimatedDuration, 0);
    }

    /**
     * 전체 예상 비용 계산
     */
    private estimateCost(tasks: Task[]): number {
        return tasks.reduce((total, task) => {
            return total + (task.estimatedCost || 0);
        }, 0);
    }

    /**
     * 실행 계획 최적화
     */
    async optimizePlan(plan: ExecutionPlan, constraints: Constraints): Promise<ExecutionPlan> {
        let optimizedPlan = { ...plan };

        // 1. 병렬성 제한 적용
        if (constraints.maxParallelism) {
            optimizedPlan = this.applyParallelismConstraint(
                optimizedPlan,
                constraints.maxParallelism
            );
        }

        // 2. 비용 제한 적용
        if (constraints.maxCost && plan.estimatedCost > constraints.maxCost) {
            throw new Error(
                `Estimated cost ${plan.estimatedCost} exceeds budget ${constraints.maxCost}`
            );
        }

        // 3. 시간 제한 적용
        if (constraints.maxDuration && plan.estimatedDuration > constraints.maxDuration) {
            optimizedPlan = this.optimizeForTime(optimizedPlan, constraints.maxDuration);
        }

        // 4. 우선순위 재정렬
        if (constraints.priority) {
            optimizedPlan = this.reorderByPriority(optimizedPlan, constraints.priority);
        }

        return optimizedPlan;
    }

    /**
     * 병렬성 제한 적용
     */
    private applyParallelismConstraint(plan: ExecutionPlan, maxParallelism: number): ExecutionPlan {
        const newStages: Stage[] = [];

        for (const stage of plan.stages) {
            if (stage.tasks.length <= maxParallelism) {
                newStages.push(stage);
            } else {
                // Stage를 작은 chunk로 분할
                const chunks = this.chunkArray(stage.tasks, maxParallelism);
                for (let i = 0; i < chunks.length; i++) {
                    newStages.push({
                        id: newStages.length,
                        tasks: chunks[i]!,
                        canRunInParallel: true,
                        estimatedDuration: stage.estimatedDuration,
                        dependencies: i === 0 ? stage.dependencies : [newStages.length - 1],
                    });
                }
            }
        }

        return {
            ...plan,
            stages: newStages,
            estimatedDuration: this.estimateDuration(newStages),
        };
    }

    /**
     * 시간 최적화
     */
    private optimizeForTime(plan: ExecutionPlan, _maxDuration: number): ExecutionPlan {
        // Critical Path 상의 Task들을 우선 처리
        const criticalTaskIds = new Set(plan.criticalPath.map((t) => t.projectSequence));

        const reorderedStages = plan.stages.map((stage) => {
            const sortedTasks = stage.tasks.sort((a, b) => {
                const aIsCritical = criticalTaskIds.has(a.projectSequence);
                const bIsCritical = criticalTaskIds.has(b.projectSequence);

                if (aIsCritical && !bIsCritical) return -1;
                if (!aIsCritical && bIsCritical) return 1;

                // 우선순위로 정렬
                const priorityOrder: Record<string, number> = {
                    urgent: 0,
                    high: 1,
                    medium: 2,
                    low: 3,
                };
                const pA = priorityOrder[a.priority as string] ?? 2; // Default to medium
                const pB = priorityOrder[b.priority as string] ?? 2;
                return pA - pB;
            });

            return { ...stage, tasks: sortedTasks };
        });

        return { ...plan, stages: reorderedStages };
    }

    /**
     * 우선순위 재정렬
     */
    private reorderByPriority(plan: ExecutionPlan, _priority: string): ExecutionPlan {
        // 높은 우선순위 Task들을 앞으로
        const reorderedStages = plan.stages.map((stage) => {
            const sortedTasks = [...stage.tasks].sort((a, b) => {
                const priorityOrder: Record<string, number> = {
                    urgent: 0,
                    high: 1,
                    medium: 2,
                    low: 3,
                };
                const pA = priorityOrder[a.priority as string] ?? 2;
                const pB = priorityOrder[b.priority as string] ?? 2;
                return pA - pB;
            });
            return { ...stage, tasks: sortedTasks };
        });

        return { ...plan, stages: reorderedStages };
    }

    /**
     * 시각화 데이터 생성
     */
    visualizePlan(plan: ExecutionPlan): PlanVisualization {
        const stages: VisualizationStage[] = [];
        let cumulativeTime = 0;

        for (const stage of plan.stages) {
            const visualStage: VisualizationStage = {
                id: stage.id,
                name: `Stage ${stage.id + 1}`,
                tasks: stage.tasks.map((task) => ({
                    id: task.projectSequence,
                    name: task.title,
                    duration: task.estimatedMinutes ? task.estimatedMinutes * 60 * 1000 : 300000,
                    dependencies: this.getTaskDependencies(task),
                })),
                startTime: cumulativeTime,
                endTime: cumulativeTime + stage.estimatedDuration,
            };

            stages.push(visualStage);
            cumulativeTime += stage.estimatedDuration;
        }

        const criticalPathIds = plan.criticalPath.map((t) => t.projectSequence);

        return {
            type: 'gantt',
            data: {
                stages,
                totalDuration: plan.estimatedDuration,
                criticalPath: criticalPathIds,
            },
            stages,
            criticalPath: criticalPathIds,
        };
    }

    /**
     * Task의 의존성 ID 목록 가져오기
     */
    private getTaskDependencies(task: Task): number[] {
        const deps: number[] = [];

        if (task.parentTaskId) deps.push(task.parentTaskId);
        if (task.blockedByTaskId) deps.push(task.blockedByTaskId);
        if (task.triggerConfig?.dependsOn) {
            deps.push(...task.triggerConfig.dependsOn.taskIds);
        }

        return deps;
    }

    /**
     * 배열을 chunk로 분할
     */
    private chunkArray<T>(array: T[], chunkSize: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }
}
