<script setup lang="ts">
/**
 * DAG (Directed Acyclic Graph) View - Vue Flow Edition
 *
 * Modern DAG visualization using Vue Flow with automatic layout
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted, markRaw } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { VueFlow, useVueFlow, Position, MarkerType } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import type { Node, Edge } from '@vue-flow/core';
import dagre from 'dagre';
import { useTaskStore, type TaskStatus } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import { useUIStore } from '../stores/uiStore';
import type { Task } from '@core/types/database';
import TaskDetailPanel from '../../components/task/TaskDetailPanel.vue';
import OperatorPanel from '../../components/project/OperatorPanel.vue';
import TaskFlowNode from '../../components/dag/TaskFlowNode.vue';
import ProjectHeader from '../../components/project/ProjectHeader.vue';
import ProjectInfoModal from '../../components/project/ProjectInfoModal.vue';
import CustomEdge from '../../components/dag/CustomEdge.vue';
import TaskCreateModal from '../../components/task/TaskCreateModal.vue';
import InputTaskForm from '../../components/task/InputTaskForm.vue';
import EnhancedResultPreview from '../../components/task/EnhancedResultPreview.vue';
import TaskExecutionProgress from '../../components/task/TaskExecutionProgress.vue';
import { getAPI } from '../../utils/electron';

// Import Vue Flow styles
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';

const route = useRoute();
const router = useRouter();
const taskStore = useTaskStore();
const projectStore = useProjectStore();
const uiStore = useUIStore();

// Computed
const projectId = computed(() => Number(route.params.id));
const project = computed(() => projectStore.projects.find((p) => p.id === projectId.value) || null);
const tasks = computed(() => taskStore.tasks);

// UI State
// Debounce timer for buildGraph
let buildGraphTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 100; // Wait 100ms before rebuilding to batch multiple changes
const showDetailPanel = ref(false);
const selectedTaskId = ref<number | null>(null);
const selectedTask = computed(() => {
    if (!selectedTaskId.value) return null;
    return taskStore.tasks.find((t) => t.id === selectedTaskId.value) || null;
});
const showProjectInfoModal = ref(false);
const showCreateModal = ref(false);
const createInColumn = ref<TaskStatus>('todo');
const showExecutionModal = ref(false);
const executionTaskId = ref<number | null>(null);
const executionTask = computed(() => {
    if (!executionTaskId.value) return null;
    return taskStore.tasks.find((t) => t.id === executionTaskId.value) || null;
});

// Input Modal State
const showInputModal = ref(false);
const inputTask = ref<Task | null>(null);

// Result Preview State
const showResultPreview = ref(false);
const previewTaskId = ref<number | null>(null);
const resultPreviewTask = computed(() => {
    if (!previewTaskId.value) return null;
    const task = taskStore.tasks.find((t) => t.id === previewTaskId.value);
    if (!task) return null;

    // Augment with execution progress if available
    const progress = taskStore.executionProgress.get(task.id);
    const reviewProgressEntry = taskStore.reviewProgress.get(task.id);

    return {
        ...task,
        result:
            (task as any).result ||
            (task as any).executionResult?.content ||
            progress?.content ||
            reviewProgressEntry?.content ||
            '',
        outputFormat:
            (task as any).outputFormat ||
            (task as any).executionResult?.contentType ||
            (task as any).expectedOutputFormat,
    } as Task;
});

// Key to force VueFlow remount when nodes need refresh (disabled - too disruptive)
// const vueFlowKey = ref(0);

// Vue Flow setup
const { onConnect, addEdges, fitView, updateNodeData, project: projectToFlowCoords } = useVueFlow();

// Nodes and edges
const nodes = ref<Node[]>([]);
const edges = ref<Edge[]>([]);

// Register node types
const nodeTypes = {
    taskCard: TaskFlowNode,
};

// Register edge types - use markRaw to prevent Vue reactivity warning
const edgeTypes = {
    custom: markRaw(CustomEdge),
};

// Context menu state
const showContextMenu = ref(false);
const contextMenuPosition = ref({ x: 0, y: 0 }); // Screen coordinates
const contextMenuNodePosition = ref({ x: 0, y: 0 }); // Flow coordinates

/**
 * Create Dagre layout
 */
function getLayoutedElements(nodes: Node[], edges: Edge[], direction = 'LR') {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({
        rankdir: direction,
        nodesep: 100,
        ranksep: 150,
        marginx: 50,
        marginy: 50,
    });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: 320, height: 250 });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            position: {
                x: nodeWithPosition.x - 160, // center the node
                y: nodeWithPosition.y - 125,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
}

/**
 * Build graph from tasks
 */
let isBuilding = false;
function buildGraph(shouldFit = false) {
    if (isBuilding) {
        console.log('⏸️ buildGraph already running, skipping...');
        return;
    }

    isBuilding = true;
    // console.log('🔄 Building graph with', tasks.value.length, 'tasks. Should fit:', shouldFit);

    const taskNodes: Node[] = [];
    const taskEdges: Edge[] = [];

    // Create nodes
    tasks.value.forEach((task) => {
        // Generate unique key that changes when critical task properties change
        // This forces TaskCard remount only when needed
        const taskKey = `${task.id}-${task.status}-${task.inputSubStatus || 'none'}`;

        taskNodes.push({
            id: String(task.id),
            type: 'taskCard',
            position: { x: 0, y: 0 }, // Will be set by layout
            data: { task, taskKey },
        });
    });

    // Create edges from dependencies
    tasks.value.forEach((task) => {
        const dependencies = new Set<number>(task.triggerConfig?.dependsOn?.taskIds || []);

        // Also parse IDs from expression if present to ensure all dependencies are visualized
        const expression = task.triggerConfig?.dependsOn?.expression;
        let isComplexDependency = false;

        if (expression && expression.trim().length > 0) {
            isComplexDependency = true;
            const idPattern = /\b\d+\b/g;
            const idsInExpression = [...new Set(expression.match(idPattern) || [])];
            idsInExpression.forEach((idStr) => {
                dependencies.add(parseInt(idStr, 10));
            });
        }

        dependencies.forEach((depId: number) => {
            // Only create edge if dependency task exists
            const sourceTask = tasks.value.find((t) => t.id === depId);
            if (sourceTask) {
                // Get output type label from SOURCE task (dependency)
                // Use expectedOutputFormat (AI-generated) if available, fallback to outputType
                const outputFormat = sourceTask.expectedOutputFormat || sourceTask.outputType;
                const formatInfo = getOutputFormatInfo(outputFormat);

                // Verbose logging disabled to reduce console noise
                // console.log(
                //     `📊 Edge ${depId}->${task.id}: expectedOutputFormat="${sourceTask.expectedOutputFormat}", outputType="${sourceTask.outputType}", formatInfo:`,
                //     formatInfo
                // );

                // Determine if this specific dependency is part of an "Active Path"
                // For direct dependencies (no expression), it's always active if it exists.
                // For complex dependencies, we check if it contributes to a satisfied condition group.
                let isActivePath = true;
                if (isComplexDependency && expression) {
                    isActivePath = isDependencyActive(expression, depId, tasks.value);
                }

                // Determine edge color based on SOURCE task status and active state
                let edgeColor = '#9CA3AF'; // Default Gray (Inactive)

                // If path is active, use status color. If inactive, keep gray.
                if (isActivePath) {
                    switch (sourceTask.status) {
                        case 'done':
                            edgeColor = '#10b981'; // Green - completed
                            break;
                        case 'in_progress':
                            edgeColor = '#3b82f6'; // Blue - in progress
                            break;
                        case 'in_review':
                            edgeColor = '#f59e0b'; // Amber - in review
                            break;
                        case 'failed':
                            edgeColor = '#ef4444'; // Red - failed
                            break;
                        default:
                            if (sourceTask.status === 'todo') {
                                edgeColor = '#9CA3AF'; // Gray for todo
                            }
                    }
                }

                taskEdges.push({
                    id: `e${depId}-${task.id}`,
                    source: String(depId),
                    target: String(task.id),
                    type: 'custom', // Use custom edge with delete button
                    animated: task.status === 'in_progress' && isActivePath, // Only animate active paths
                    style: {
                        stroke: edgeColor,
                        strokeWidth: isComplexDependency ? 3 : 2,
                        strokeDasharray: isComplexDependency ? '5,5' : undefined,
                        opacity: isActivePath ? 1 : 0.4, // Dim inactive paths slightly
                    },
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        width: 20,
                        height: 20,
                        color: edgeColor,
                    },
                    label: formatInfo ? `${formatInfo.icon} ${formatInfo.label}` : '📄 Output', // Icon + text (e.g., "🧩 JSON")
                    data: {
                        formatInfo, // Pass full formatInfo to CustomEdge for icon rendering
                        onEdgeRemove: (edgeId: string) => {
                            console.log('🗑️ Removing edge:', edgeId);
                            handleEdgeRemove([
                                {
                                    id: edgeId,
                                    source: String(depId),
                                    target: String(task.id),
                                } as Edge,
                            ]);
                        },
                    },
                });
            }
        });
    });

    // Apply layout
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        taskNodes,
        taskEdges
    );

    // Override positions for tasks that have saved positions in metadata
    const finalNodes = layoutedNodes.map((node) => {
        const task = tasks.value.find((t) => String(t.id) === node.id);
        if (task?.metadata && typeof task.metadata === 'object' && 'dagPosition' in task.metadata) {
            const savedPosition = (task.metadata as any).dagPosition;
            if (
                savedPosition &&
                typeof savedPosition.x === 'number' &&
                typeof savedPosition.y === 'number'
            ) {
                return {
                    ...node,
                    position: {
                        x: savedPosition.x,
                        y: savedPosition.y,
                    },
                };
            }
        }
        return node;
    });

    nodes.value = finalNodes;
    edges.value = layoutedEdges;

    // Fit view after layout - Only if requested
    nextTick(() => {
        if (shouldFit) {
            fitView({ padding: 0.2, duration: 200 });
        }
        isBuilding = false;
    });
}

/**
 * Rebuild graph with debouncing to avoid excessive rebuilds
 * Only fits view if we are transitioning from 0 nodes to > 0 nodes (initial load)
 */
function rebuildGraphDebounced() {
    if (buildGraphTimer) {
        clearTimeout(buildGraphTimer);
    }
    buildGraphTimer = setTimeout(() => {
        const shouldFit = nodes.value.length === 0 && tasks.value.length > 0;
        buildGraph(shouldFit);
        buildGraphTimer = null;
    }, DEBOUNCE_MS);
}

/**
 * Force immediate graph rebuild (no debounce)
 */
function rebuildGraphImmediate(shouldFit = false) {
    if (buildGraphTimer) {
        clearTimeout(buildGraphTimer);
        buildGraphTimer = null;
    }
    buildGraph(shouldFit);
}

/**
 * Update only node data without full graph rebuild
 * Uses VueFlow's updateNodeData for smooth updates
 */
function updateNodesDataSmooth() {
    console.log('[DAGView] Updating nodes data smoothly...');

    // Update each node's data using VueFlow's API
    taskStore.tasks.forEach((task) => {
        const nodeId = String(task.id);
        updateNodeData(nodeId, { task: { ...task } });
    });

    console.log('[DAGView] Nodes data updated');
}

/**
 * Get edge color based on task status
 */
function getEdgeColor(task: Task): string {
    switch (task.status) {
        case 'done':
            return '#10B981'; // Green
        case 'in_progress':
            return '#3B82F6'; // Blue
        case 'blocked':
            return '#EF4444'; // Red
        default:
            return '#6B7280'; // Gray
    }
}

/**
 * Get output format info - matching TaskCard logic
 */
function getOutputFormatInfo(
    outputFormat: string | null
): { label: string; icon: string; bgColor: string; textColor: string } | null {
    if (!outputFormat || typeof outputFormat !== 'string') return null;

    const format = outputFormat.toLowerCase().trim();
    const codeFormats = [
        'js',
        'jsx',
        'ts',
        'tsx',
        'javascript',
        'typescript',
        'python',
        'go',
        'java',
        'c',
        'cpp',
        'c++',
        'c#',
        'csharp',
        'rust',
        'ruby',
        'php',
        'swift',
        'kotlin',
        'solidity',
        'scala',
        'perl',
        'lua',
        'elixir',
        'haskell',
        'dart',
        'r',
    ];

    const map: Record<string, { label: string; icon: string; bgColor: string; textColor: string }> =
        {
            text: {
                label: 'Text',
                icon: '📝',
                bgColor: 'bg-gray-100 dark:bg-gray-800',
                textColor: 'text-gray-700 dark:text-gray-200',
            },
            markdown: {
                label: 'Markdown',
                icon: '📄',
                bgColor: 'bg-emerald-100 dark:bg-emerald-900/40',
                textColor: 'text-emerald-700 dark:text-emerald-200',
            },
            html: {
                label: 'HTML',
                icon: '🌐',
                bgColor: 'bg-blue-100 dark:bg-blue-900/40',
                textColor: 'text-blue-700 dark:text-blue-200',
            },
            pdf: {
                label: 'PDF',
                icon: '📕',
                bgColor: 'bg-rose-100 dark:bg-rose-900/40',
                textColor: 'text-rose-700 dark:text-rose-200',
            },
            json: {
                label: 'JSON',
                icon: '🧩',
                bgColor: 'bg-amber-100 dark:bg-amber-900/40',
                textColor: 'text-amber-700 dark:text-amber-200',
            },
            yaml: {
                label: 'YAML',
                icon: '🗂️',
                bgColor: 'bg-amber-100 dark:bg-amber-900/40',
                textColor: 'text-amber-700 dark:text-amber-200',
            },
            csv: {
                label: 'CSV',
                icon: '📊',
                bgColor: 'bg-indigo-100 dark:bg-indigo-900/40',
                textColor: 'text-indigo-700 dark:text-indigo-200',
            },
            sql: {
                label: 'SQL',
                icon: '🗄️',
                bgColor: 'bg-purple-100 dark:bg-purple-900/40',
                textColor: 'text-purple-700 dark:text-purple-200',
            },
            shell: {
                label: 'Shell',
                icon: '💻',
                bgColor: 'bg-slate-100 dark:bg-slate-800',
                textColor: 'text-slate-700 dark:text-slate-200',
            },
            mermaid: {
                label: 'Mermaid',
                icon: '📈',
                bgColor: 'bg-teal-100 dark:bg-teal-900/40',
                textColor: 'text-teal-700 dark:text-teal-200',
            },
            svg: {
                label: 'SVG',
                icon: '🖼️',
                bgColor: 'bg-pink-100 dark:bg-pink-900/40',
                textColor: 'text-pink-700 dark:text-pink-200',
            },
            png: {
                label: 'PNG',
                icon: '🖼️',
                bgColor: 'bg-pink-100 dark:bg-pink-900/40',
                textColor: 'text-pink-700 dark:text-pink-200',
            },
            mp4: {
                label: 'Video',
                icon: '🎬',
                bgColor: 'bg-orange-100 dark:bg-orange-900/40',
                textColor: 'text-orange-700 dark:text-orange-200',
            },
            mp3: {
                label: 'Audio',
                icon: '🎵',
                bgColor: 'bg-cyan-100 dark:bg-cyan-900/40',
                textColor: 'text-cyan-700 dark:text-cyan-200',
            },
            diff: {
                label: 'Diff',
                icon: '🔀',
                bgColor: 'bg-lime-100 dark:bg-lime-900/40',
                textColor: 'text-lime-700 dark:text-lime-200',
            },
            log: {
                label: 'Log',
                icon: '📜',
                bgColor: 'bg-gray-100 dark:bg-gray-800',
                textColor: 'text-gray-700 dark:text-gray-200',
            },
            code: {
                label: 'Code',
                icon: '💻',
                bgColor: 'bg-slate-100 dark:bg-slate-800',
                textColor: 'text-slate-700 dark:text-slate-200',
            },
        };

    if (map[format]) return map[format];
    if (codeFormats.includes(format))
        return {
            label: outputFormat,
            icon: '💻',
            bgColor: 'bg-slate-100 dark:bg-slate-800',
            textColor: 'text-slate-700 dark:text-slate-200',
        };

    return {
        label: outputFormat,
        icon: '📦',
        bgColor: 'bg-gray-100 dark:bg-gray-800',
        textColor: 'text-gray-700 dark:text-gray-200',
    };
}

/**
 * Determine if a specific dependency ID is part of an active path in a complex expression
 * Logic:
 * 1. Split by '||' (OR groups).
 * 2. Find ALL valid groups (where all tasks are DONE).
 * 3. Among valid groups, find the "Winning Group": the one that completed MOST RECENTLY.
 *    - Logic: Max(completionTime of tasks in group).
 * 4. Only highlight IDs in the Winning Group.
 */
function isDependencyActive(expression: string, targetId: number, allTasks: Task[]): boolean {
    if (!expression) return true;

    const segments = expression.split('||');
    let validGroups: { segment: string; completionTime: number }[] = [];

    // 1. Identify all valid groups and their completion times
    for (const segment of segments) {
        const stats = getSegmentStats(segment, allTasks);
        if (stats.isValid) {
            validGroups.push({ segment, completionTime: stats.completionTime });
        }
    }

    if (validGroups.length === 0) return false;

    // 2. Find the "Winning Group" (Latest completion time)
    // Sort descending by completion time
    validGroups.sort((a, b) => b.completionTime - a.completionTime);
    const winningGroup = validGroups[0];

    // 3. Is our targetId in the winning group?
    return winningGroup.segment.includes(String(targetId));
}

function getSegmentStats(
    segment: string,
    allTasks: Task[]
): { isValid: boolean; completionTime: number } {
    const idPattern = /\b\d+\b/g;
    const matches = segment.match(idPattern) || [];
    let maxTime = 0;

    for (const idStr of matches) {
        const id = parseInt(idStr, 10);
        const task = allTasks.find((t) => t.id === id);

        // If any task in an AND group is NOT done, the group is False.
        // (Ignoring !NOT logic for visualization simplicity for now)
        if (!task || task.status !== 'done') {
            return { isValid: false, completionTime: 0 };
        }

        // Track max completion time
        if (task.completedAt) {
            const time = new Date(task.completedAt).getTime();
            if (time > maxTime) maxTime = time;
        }
    }

    return { isValid: true, completionTime: maxTime };
}

function handleNodeClick(task: Task) {
    console.log('🖱️ [DAGView] handleNodeClick called', task.id);
    selectedTaskId.value = task.id;
    showDetailPanel.value = true;
}

/**
 * Handle connection between nodes
 */
onConnect(async (params) => {
    const sourceId = Number(params.source);
    const targetId = Number(params.target);

    if (sourceId === targetId) {
        console.warn('Cannot connect a task to itself');
        return;
    }

    // Check for circular dependency - DISABLED to allow circular dependencies
    // if (wouldCreateCircularDependency(sourceId, targetId)) {
    //     console.warn('Cannot create circular dependency');
    //     return;
    // }

    // Update task dependencies
    const targetTask = tasks.value.find((t) => t.id === targetId);
    if (!targetTask) return;

    // SAFEGUARD: Block DnD if expression logic is used
    if (targetTask.triggerConfig?.dependsOn?.expression) {
        uiStore.showToast({
            message:
                '복잡한 조건식이 설정된 태스크는 드래그로 의존성을 수정할 수 없습니다. 상세 패널을 이용해주세요.',
            type: 'warning',
        });
        return;
    }

    const existingDeps = targetTask.triggerConfig?.dependsOn?.taskIds || [];
    if (existingDeps.includes(sourceId)) {
        console.warn('Dependency already exists');
        return;
    }

    const updatedTriggerConfig = {
        ...targetTask.triggerConfig,
        dependsOn: {
            ...targetTask.triggerConfig?.dependsOn,
            taskIds: [...existingDeps, sourceId],
        },
    };

    await taskStore.updateTask(targetId, {
        triggerConfig: updatedTriggerConfig,
    });

    // Rebuild graph to show new edge
    buildGraph();
});

/**
 * Handle edge deletion (remove dependency)
 */
async function handleEdgeRemove(edgesToRemove: Edge[]) {
    for (const edge of edgesToRemove) {
        const sourceId = Number(edge.source);
        const targetId = Number(edge.target);

        const targetTask = tasks.value.find((t) => t.id === targetId);
        if (!targetTask) continue;

        // SAFEGUARD: Block removal if expression logic is used
        if (targetTask.triggerConfig?.dependsOn?.expression) {
            uiStore.showToast({
                message:
                    '복잡한 조건식이 설정된 태스크는 의존성을 삭제할 수 없습니다. 상세 패널을 이용해주세요.',
                type: 'warning',
            });
            continue; // Skip this edge
        }

        const existingDeps = targetTask.triggerConfig?.dependsOn?.taskIds || [];
        const updatedDeps = existingDeps.filter((depId: number) => depId !== sourceId);

        const updatedTriggerConfig = {
            ...targetTask.triggerConfig,
            dependsOn: {
                ...targetTask.triggerConfig?.dependsOn,
                taskIds: updatedDeps,
            },
        };

        await taskStore.updateTask(targetId, {
            triggerConfig: updatedTriggerConfig,
        });
    }

    // Rebuild graph after deletion
    buildGraph();
}

/**
 * Check for circular dependencies
 */
function wouldCreateCircularDependency(sourceId: number, targetId: number): boolean {
    const visited = new Set<number>();
    const queue = [sourceId];

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (current === targetId) return true;
        if (visited.has(current)) continue;

        visited.add(current);
        const task = tasks.value.find((t) => t.id === current);
        const deps = task?.triggerConfig?.dependsOn?.taskIds || [];
        queue.push(...deps);
    }

    return false;
}

/**
 * Close detail panel
 */
function closeDetailPanel() {
    showDetailPanel.value = false;
    selectedTaskId.value = null;
}

/**
 * Open create task modal
 */
function openCreateModal(status: TaskStatus = 'todo') {
    createInColumn.value = status;
    showCreateModal.value = true;
}

/**
 * Handle task created
 */
/**
 * Handle task events
 */
async function handleTaskExecute(task: Task) {
    const result = await taskStore.executeTask(task.id);
    if (!result.success && result.error) {
        uiStore.showToast({
            message: `Failed to execute task: ${result.error}`,
            type: 'error',
        });
    }
    // Force immediate rebuild after execution to show updated state
    // This is especially important for Input tasks that transition to WAITING_USER
    await nextTick();
    rebuildGraphImmediate();
}

async function handleTaskApprove(task: Task) {
    console.log('🟣 [DAGView] handleTaskApprove called', task.id);

    // IMPORTANT: Fetch latest task from store to avoid stale data from node
    const latestTask = taskStore.tasks.find((t) => t.id === task.id);
    if (!latestTask) {
        console.error('❌ [DAGView] Task not found in store:', task.id);
        return;
    }

    console.log('🟣 [DAGView] Latest task status:', latestTask.status);
    const result = await taskStore.approveTask(latestTask.id);
    console.log('🟣 [DAGView] Approve result:', result);
    if (!result.success && result.error) {
        console.error('❌ [DAGView] Approve failed:', result.error);
    }
}

async function handleTaskRetry(task: Task) {
    // Retry: reset to TODO first, then execute
    if (task.status === 'done') {
        await taskStore.updateTask(task.id, { status: 'todo' });
    }
    await taskStore.executeTask(task.id);
}

/**
 * Handle preview result - open result preview modal
 */
function handlePreviewResult(task: Task) {
    console.log('📊 [DAGView] handlePreviewResult called', task.id);
    openResultPreview(task);
}

/**
 * Open result preview modal
 */
async function openResultPreview(task: Task) {
    // Fetch latest task data to ensure result is up-to-date
    let fullTask: any = task;
    try {
        const fetched = await getAPI().tasks.get(task.id);
        if (fetched) {
            fullTask = { ...task, ...fetched };
        }
    } catch (error) {
        console.error('Failed to fetch task for preview:', error);
    }

    // Try to get result from task current state
    let result = (fullTask as any).result || (fullTask as any).executionResult?.content;

    const progress = taskStore.executionProgress.get(task.id);
    const reviewProgressEntry = taskStore.reviewProgress.get(task.id);

    // If result is empty and task is in TODO, try to fetch from history
    if (!result && !progress && !reviewProgressEntry && fullTask.status === 'todo') {
        try {
            console.log('📜 [DAGView] No current result, fetching history for:', task.id);
            // Fetch execution history
            const history = await window.electron.taskHistory.getByEventType(
                task.id,
                'execution_completed'
            );
            if (history && history.length > 0) {
                // Get latest entry
                const latest = history[0]; // Assuming sorted by desc (repo default) or need to sort?
                // Repo usually returns sorted desc? Let's assume standard sort or sort it manually
                // The handler logic: findByTaskIdAndEventType calls repo.findByTaskIdAndEventType
                // Repo implementation usually sorts by created_at desc.

                if (latest.eventData && latest.eventData.response) {
                    result = latest.eventData.response;
                    console.log('📜 [DAGView] Found result from history');
                }
            }
        } catch (err) {
            console.error('Failed to fetch task history:', err);
        }
    }

    // Set preview ID to enable reactive updates
    previewTaskId.value = task.id;
    showResultPreview.value = true;

    // Attempt to fetch latest details to ensure we have the result
    try {
        await taskStore.fetchTasks(projectId.value);
    } catch (e) {
        console.error('Failed to refresh task for preview:', e);
    }
}

/**
 * Close result preview modal
 */
function closeResultPreview() {
    showResultPreview.value = false;
    previewTaskId.value = null;
}

/**
 * Handle preview stream (live preview) - open task detail panel with live execution stream
 */
function handlePreviewStream(task: Task) {
    console.log('🎥 [DAGView] handlePreviewStream called', task.id);
    executionTaskId.value = task.id;
    showExecutionModal.value = true;
    console.log('🎥 [DAGView] Opening execution modal for task:', executionTaskId.value);
}

/**
 * Handle view history
 */
function handleViewHistory(task: Task) {
    console.log('📜 [DAGView] handleViewHistory called', task.id);
    selectedTaskId.value = task.id;
    showDetailPanel.value = true;
    console.log(
        '📜 [DAGView] Set selectedTaskId:',
        selectedTaskId.value,
        'showDetailPanel:',
        showDetailPanel.value
    );
}

async function handleProvideInput(task: Task) {
    console.log('[DAGView] handleProvideInput called:', task?.id, task?.title);
    console.log('[DAGView] Setting inputTask and opening modal...');
    // For INPUT tasks, open the input modal
    inputTask.value = task;
    showInputModal.value = true;
    console.log('[DAGView] Modal state:', {
        showInputModal: showInputModal.value,
        inputTask: inputTask.value?.id,
    });
}

function closeInputModal() {
    showInputModal.value = false;
    inputTask.value = null;
}

async function handleInputSubmit(data: any) {
    if (!inputTask.value) return;

    try {
        const result = await taskStore.submitInput(inputTask.value.id, data);
        if (result.success) {
            uiStore.showToast({
                type: 'success',
                message: '입력이 제출되었습니다.',
            });
            closeInputModal();
            // Force refresh tasks and rebuild graph to show state change
            await taskStore.fetchTasks(projectId.value);
            rebuildGraphImmediate();
        } else {
            uiStore.showToast({
                type: 'error',
                message: result.error || '입력 제출 실패',
            });
        }
    } catch (error) {
        console.error('Failed to submit input:', error);
        uiStore.showToast({
            type: 'error',
            message: '입력 제출 중 오류가 발생했습니다.',
        });
    }
}

async function handleStop(task: Task) {
    try {
        const api = (window as any).electron;
        await api.tasks.stopTask(task.id);
        console.log('Task stopped successfully:', task.id);
    } catch (error: any) {
        console.error('Failed to stop task:', error);
        if (error.name === 'TaskNotStoppableError') {
            alert(error.message || 'Task cannot be stopped in its current state');
        } else {
            alert('Failed to stop task');
        }
    }
}

/**
 * Handle task deletion from delete button
 */
async function handleTaskDelete(task: Task) {
    if (!confirm(`Are you sure you want to delete "${task.title}"?`)) {
        return;
    }

    try {
        const api = (window as any).electron;
        await api.tasks.deleteTask(task.id);
        console.log('Task deleted successfully:', task.id);

        // Rebuild graph to remove deleted task node
        await nextTick();
        rebuildGraphImmediate();
    } catch (error: any) {
        console.error('Failed to delete task:', error);
        alert('Failed to delete task');
    }
}

// Generate unique structure key to detect layout changes
const structureKey = computed(() => {
    return tasks.value
        .map((t) => {
            const deps = (t.triggerConfig?.dependsOn?.taskIds || []).slice().sort().join(',');
            return `${t.id}:${deps}`;
        })
        .sort()
        .join('|');
});

// Watch for structure changes -> Rebuild Graph
watch(structureKey, () => {
    console.log('📐 Graph structure changed, rebuilding...');
    rebuildGraphDebounced();
});

// Watch for data changes -> Update Nodes (no layout)
watch(
    tasks,
    () => {
        // If structure didn't change, just update data
        // This prevents layout thrashing/zooming during execution
        updateNodesDataSmooth();

        // Note: Don't clear selectedTaskId here - let the user close the panel explicitly
        // This prevents the panel from closing when auto-saves occur from persistExecutionSettings()
    },
    { deep: true }
);

/**
 * Handle task save from detail panel
 */
async function handleTaskSaved() {
    // Close modal
    showCreateModal.value = false;

    // Fetch latest tasks to include the newly created one
    await taskStore.fetchTasks(projectId.value);

    // If task was created from context menu, apply position
    if (contextMenuNodePosition.value.x !== 0 || contextMenuNodePosition.value.y !== 0) {
        // Find the most recently created task (highest ID)
        const newTask = [...taskStore.tasks].sort((a, b) => b.id - a.id)[0];

        if (newTask) {
            // Update task metadata with position
            const updatedMetadata = {
                ...(newTask.metadata || {}),
                dagPosition: {
                    x: contextMenuNodePosition.value.x,
                    y: contextMenuNodePosition.value.y,
                },
            };

            await taskStore.updateTask(newTask.id, {
                ...newTask,
                metadata: updatedMetadata,
            });
        }

        // Reset context menu position
        contextMenuNodePosition.value = { x: 0, y: 0 };
    }

    // Rebuild graph
    await nextTick();
    buildGraph();
}
async function handleOperatorDrop(taskId: number, operatorId: number) {
    console.log('🟢 DAGView handleOperatorDrop:', taskId, operatorId);
    try {
        const task = taskStore.tasks.find((t) => t.id === taskId);
        const taskTitle = task?.title || `Task ${taskId}`;

        // Fetch operator name from API
        let operatorName = 'Operator';
        try {
            const api = (window as any).electron;
            const operator = await api.operators.getById(operatorId);
            operatorName = operator?.name || `Operator ${operatorId}`;
        } catch (err) {
            console.warn('Could not fetch operator name:', err);
        }

        // Use updateTaskWithHistory for undo/redo support
        await taskStore.updateTaskWithHistory(
            taskId,
            { assignedOperatorId: operatorId },
            `Assign "${operatorName}" to "${taskTitle}"`
        );
        console.log('🟢 Task updated successfully with history');

        // Fetch fresh data to ensure UI updates
        await taskStore.fetchTasks(projectId.value);

        // Log the updated task
        const updatedTask = taskStore.tasks.find((t) => t.id === taskId);
        console.log('🟢 Updated task from store:', updatedTask);
        console.log('🟢 Assigned Operator ID in task:', updatedTask?.assignedOperatorId);

        // Rebuild graph to reflect changes
        buildGraph();
    } catch (error) {
        console.error('Failed to assign operator:', error);
    }
}

/**
 * Handle drop on wrapper div (VueFlow pattern)
 */
function onDrop(event: DragEvent) {
    console.log('🔴 Wrapper div drop event!', event);
    const operatorData = event.dataTransfer?.getData('application/x-operator');
    console.log('🔴 Operator data:', operatorData);

    if (operatorData) {
        event.preventDefault();

        // Find which node is under the cursor
        const target = event.target as HTMLElement;
        const nodeElement = target.closest('.vue-flow__node');
        if (nodeElement) {
            const nodeId = nodeElement.getAttribute('data-id');
            console.log('🔴 Node ID:', nodeId);

            if (nodeId) {
                try {
                    const operator = JSON.parse(operatorData);
                    console.log('🔴 Calling handleOperatorDrop:', nodeId, operator.id);
                    handleOperatorDrop(Number(nodeId), operator.id);
                } catch (error) {
                    console.error('Failed to parse operator:', error);
                }
            }
        }
    }
}

/**
 * Handle dragover on VueFlow (required for drop to work)
 */
function onDragOver(event: DragEvent) {
    const types = event.dataTransfer?.types || [];
    if (types.includes('application/x-operator')) {
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
        }
    }
}

/**
 * Handle context menu on VueFlow pane (right-click on empty space)
 */
function handlePaneContextMenu(event: MouseEvent) {
    event.preventDefault();

    // Store screen coordinates for menu position
    contextMenuPosition.value = {
        x: event.clientX,
        y: event.clientY,
    };

    // Convert screen coordinates to flow coordinates using VueFlow's project method
    if (projectToFlowCoords) {
        const flowCoords = projectToFlowCoords({ x: event.clientX, y: event.clientY });
        contextMenuNodePosition.value = flowCoords;
    }

    showContextMenu.value = true;
}

/**
 * Handle "New Task" from context menu
 */
function handleNewTaskFromContextMenu() {
    showContextMenu.value = false;
    // Open task creation modal (will create task at stored position)
    openCreateModal('todo');
}

/**
 * Close context menu
 */
function closeContextMenu() {
    showContextMenu.value = false;
}

// Initial load
onMounted(async () => {
    if (projectId.value) {
        console.log('🔵 DAGView mounting, projectId:', projectId.value);

        // Load projects list and tasks in parallel
        await Promise.all([projectStore.fetchProjects(), taskStore.fetchTasks(projectId.value)]);

        // Debug: check if project loaded
        console.log('🔵 After loading, project:', project.value);

        // Wait a tick to ensure data is set, then build graph
        await nextTick();
        buildGraph();

        // Subscribe to taskStore state changes for reliable updates
        // This ensures INPUT task status updates (including inputSubStatus) are reflected immediately
        const unsubscribe = taskStore.$subscribe(
            async (mutation, state) => {
                // console.log('[DAGView] TaskStore mutation detected:', mutation.type);

                // Trigger rebuild on any store mutation
                await nextTick();
                rebuildGraphImmediate();
            },
            { detached: true }
        );

        // Listen for custom INPUT task status change events
        const handleInputStatusChange = async (event: Event) => {
            const detail = (event as CustomEvent).detail;
            console.log('[DAGView] INPUT task status changed event:', detail);
            await nextTick();
        };
        window.addEventListener('task:input-status-changed', handleInputStatusChange);

        // Handle context menu close on outside click
        const handleWindowClick = (event: MouseEvent) => {
            if (showContextMenu.value) {
                const target = event.target as HTMLElement;
                if (!target.closest('.context-menu')) {
                    closeContextMenu();
                }
            }
        };
        window.addEventListener('click', handleWindowClick);

        // Cleanup on unmount
        onUnmounted(() => {
            unsubscribe();
            window.removeEventListener('task:input-status-changed', handleInputStatusChange);
            window.removeEventListener('click', handleWindowClick);
        });
    }
});
</script>

<template>
    <div class="flex-1 flex flex-col h-full bg-gray-900">
        <!-- Header -->
        <ProjectHeader
            :project-id="projectId"
            :project-title="project?.title"
            current-view="dag"
            :show-project-info="true"
            :show-new-task="true"
            @project-info="showProjectInfoModal = true"
            @new-task="openCreateModal('todo')"
        />
        <!-- Operator Panel -->
        <OperatorPanel :project-id="projectId" />

        <!-- Vue Flow Canvas with Drag & Drop wrapper -->
        <div class="flex-1 bg-gray-900" @drop="onDrop">
            <VueFlow
                v-model:nodes="nodes"
                v-model:edges="edges"
                :node-types="nodeTypes"
                :edge-types="edgeTypes"
                :default-viewport="{ zoom: 0.8 }"
                :min-zoom="0.2"
                :max-zoom="2"
                :fit-view-on-init="true"
                :edges-focusable="false"
                :edges-updatable="false"
                :nodes-draggable="true"
                @dragover="onDragOver"
                @pane-context-menu="handlePaneContextMenu"
            >
                <!-- Custom node template -->
                <template #node-taskCard="{ data }">
                    <TaskFlowNode
                        :data="data"
                        @click="handleNodeClick(data.task)"
                        @execute="handleTaskExecute(data.task)"
                        @approve="handleTaskApprove(data.task)"
                        @preview-result="handlePreviewResult"
                        @preview-stream="handlePreviewStream"
                        @view-history="handleViewHistory"
                        @retry="handleTaskRetry(data.task)"
                        @stop="handleStop(data.task)"
                        @delete="handleTaskDelete(data.task)"
                        @operator-drop="handleOperatorDrop"
                        @provide-input="handleProvideInput"
                    />
                </template>
            </VueFlow>
        </div>

        <!-- Task Detail Panel -->
        <TaskDetailPanel
            :open="!!selectedTask"
            :task="selectedTask"
            @close="closeDetailPanel"
            @execute="handleTaskExecute"
            @approve="handleTaskApprove"
            @save="handleTaskSaved"
        />

        <!-- Task Create Modal -->
        <TaskCreateModal
            v-if="showCreateModal"
            :open="showCreateModal"
            :project-id="projectId"
            :initial-status="createInColumn"
            @close="showCreateModal = false"
            @saved="handleTaskSaved"
        />

        <!-- Input Modal -->
        <Teleport to="body">
            <div
                v-if="showInputModal && inputTask"
                class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
                @click.self="closeInputModal"
            >
                <div class="max-w-2xl w-full mx-4" @click.stop>
                    <InputTaskForm
                        :task="inputTask"
                        @close="closeInputModal"
                        @submit="handleInputSubmit"
                    />
                </div>
            </div>
        </Teleport>

        <!-- Enhanced Result Preview Modal -->
        <EnhancedResultPreview
            v-if="resultPreviewTask"
            :open="showResultPreview"
            :task="resultPreviewTask"
            @close="closeResultPreview"
        />

        <!-- Project Info Modal -->
        <ProjectInfoModal
            :project="project"
            :open="showProjectInfoModal"
            @close="showProjectInfoModal = false"
            @edit="showProjectInfoModal = false"
        />

        <!-- Context Menu -->
        <Teleport to="body">
            <div
                v-if="showContextMenu"
                :style="{
                    position: 'fixed',
                    top: contextMenuPosition.y + 'px',
                    left: contextMenuPosition.x + 'px',
                    zIndex: 9999,
                }"
                class="context-menu"
                @keydown.esc="closeContextMenu"
            >
                <button @click="handleNewTaskFromContextMenu" class="context-menu-item">
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                    <span>New Task</span>
                </button>
            </div>
        </Teleport>

        <!-- Execution Progress Modal -->
        <Teleport to="body">
            <div
                v-if="showExecutionModal && executionTask"
                class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999]"
                @click.self="showExecutionModal = false"
            >
                <div
                    class="bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4"
                    @click.stop
                >
                    <div
                        class="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10"
                    >
                        <div>
                            <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                                Live Execution
                            </h2>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {{ executionTask.title }}
                            </p>
                        </div>
                        <button
                            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                            @click="showExecutionModal = false"
                        >
                            <svg
                                class="w-6 h-6"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>
                    <div class="p-6">
                        <TaskExecutionProgress :task="executionTask" />
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
.flow-container {
    flex: 1;
    position: relative;
    overflow: hidden;
}

.vue-flow {
    background: #111827;
}

/* Vue Flow overrides */
:deep(.vue-flow__edge-path) {
    stroke-width: 2px;
    cursor: pointer;
}

:deep(.vue-flow__edge:hover .vue-flow__edge-path) {
    stroke-width: 3px;
}

:deep(.vue-flow__edge.selected .vue-flow__edge-path) {
    stroke: #60a5fa;
    stroke-width: 4px;
}

:deep(.vue-flow__edge.animated) {
    animation: dashdraw 0.5s linear infinite;
}

:deep(.vue-flow__edge-textwrapper) {
    pointer-events: all;
    cursor: pointer;
}

:deep(.vue-flow__edge-textwrapper):hover {
    opacity: 0.9;
}

/* Edge selection ring */
:deep(.vue-flow__edge.selected) {
    z-index: 1001 !important;
}

@keyframes dashdraw {
    to {
        stroke-dashoffset: -10;
    }
}

:deep(.vue-flow__controls) {
    background: #1f2937;
    border: 1px solid #374151;
}

:deep(.vue-flow__controls-button) {
    background: #374151;
    border-bottom: 1px solid #4b5563;
    color: white;
}

:deep(.vue-flow__controls-button):hover {
    background: #4b5563;
}

:deep(.vue-flow__minimap) {
    background: #1f2937;
    border: 1px solid #374151;
}

/* Context Menu Styles */
.context-menu {
    background: #1f2937;
    border: 1px solid #374151;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    padding: 4px;
    min-width: 150px;
}

.context-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: #d1d5db;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
}

.context-menu-item:hover {
    background: #374151;
    color: #ffffff;
}

.context-menu-item svg {
    flex-shrink: 0;
}
</style>
