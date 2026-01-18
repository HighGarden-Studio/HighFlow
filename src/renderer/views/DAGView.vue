<script setup lang="ts">
/**
 * DAG (Directed Acyclic Graph) View - Vue Flow Edition
 *
 * Modern DAG visualization using Vue Flow with automatic layout
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted, markRaw } from 'vue';
// Removed unused addEdges
import { useRoute } from 'vue-router';
import { VueFlow, useVueFlow, MarkerType } from '@vue-flow/core';
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
import TaskEditModal from '../../components/task/TaskEditModal.vue';
import InputTaskModal from '../../components/task/InputTaskModal.vue';
import EnhancedResultPreview from '../../components/task/EnhancedResultPreview.vue';
import TaskExecutionProgress from '../../components/task/TaskExecutionProgress.vue';
import {
    taskSubdivisionService,
    type SubdivisionSuggestion,
} from '../../services/ai/TaskSubdivisionService';
import SubdivisionModal from '../../components/task/SubdivisionModal.vue';

// Import Vue Flow styles
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';

const route = useRoute();
// Removed unused router
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
const selectedTaskKey = ref<string | null>(null);
const selectedTask = computed(() => {
    if (!selectedTaskKey.value) return null;
    const [pId, seq] = selectedTaskKey.value.split('_').map(Number);
    return taskStore.tasks.find((t) => t.projectId === pId && t.projectSequence === seq) || null;
});
const showProjectInfoModal = ref(false);
const showCreateModal = ref(false);
const createInColumn = ref<TaskStatus>('todo');

// Task Edit Modal State
const showEditModal = ref(false);
const editingTask = ref<Task | null>(null);

// Subdivision modal state
const showSubdivisionModal = ref(false);
const subdivisionTask = ref<Task | null>(null);
const subdivisionSuggestion = ref<SubdivisionSuggestion | null>(null);
const subdivisionLoading = ref(false);
const subdivisionCreating = ref(false);

const showExecutionModal = ref(false);
const executionTaskKey = ref<string | null>(null);
const executionTask = computed(() => {
    if (!executionTaskKey.value) return null;
    const [pId, seq] = executionTaskKey.value.split('_').map(Number);
    return taskStore.tasks.find((t) => t.projectId === pId && t.projectSequence === seq) || null;
});

// Input Modal State
const showInputModal = ref(false);
const inputTask = ref<Task | null>(null);

// Result Preview State
const showResultPreview = ref(false);
const previewTaskKey = ref<string | null>(null);
const resultPreviewTask = computed(() => {
    if (!previewTaskKey.value) return null;
    const [pId, seq] = previewTaskKey.value.split('_').map(Number);
    const task = taskStore.tasks.find((t) => t.projectId === pId && t.projectSequence === seq);
    if (!task) return null;

    console.log('[DAGView] resultPreviewTask source task:', {
        id: task.id,
        pId,
        seq,
        projectSequence: task.projectSequence,
        fullTask: task,
    });

    // Augment with execution progress if available
    // Augment with execution progress if available
    const progress = taskStore.getExecutionProgress(task.projectId, task.projectSequence);
    const reviewProgressEntry = taskStore.getReviewProgress({
        projectId: task.projectId,
        projectSequence: task.projectSequence,
    });

    return {
        ...task,
        id: task.id, // Explicitly preserve ID
        projectId: task.projectId, // Explicitly preserve Project ID
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
const { onConnect, fitView, updateNodeData, project: projectToFlowCoords } = useVueFlow();

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
        nodesep: 15, // Very tight vertical gap (15px)
        ranksep: 100, // Horizontal gap
        marginx: 50,
        marginy: 50,
    });

    nodes.forEach((node) => {
        // Heuristic Height Calculation
        // Check if task has result or is executed to estimate height
        const task = node.data?.task;
        const hasResult =
            task &&
            (task.status === 'done' ||
                task.executionResult?.content ||
                task.executionResult?.text ||
                (task as any).result);

        // Refined estimates to avoid excessive gaps
        // Base: 300px (Compact)
        // Result: 500px (Moderate expansion, 650 was too big)
        const width = 320;
        const height = hasResult ? 500 : 300;

        dagreGraph.setNode(node.id, { width, height });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        const task = node.data?.task;
        const hasResult =
            task &&
            (task.status === 'done' ||
                task.executionResult?.content ||
                task.executionResult?.text ||
                (task as any).result);
        const height = hasResult ? 500 : 300;

        return {
            ...node,
            position: {
                x: nodeWithPosition.x - 160, // center (width/2)
                y: nodeWithPosition.y - height / 2, // center (height/2)
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
        const taskKey = `${task.projectId}_${task.projectSequence}-${task.status}-${task.inputSubStatus || 'none'}`;

        taskNodes.push({
            id: `${task.projectId}_${task.projectSequence}`,
            type: 'taskCard',
            position: { x: 0, y: 0 }, // Will be set by layout
            data: { task, taskKey },
        });
    });

    // Create edges from dependencies
    // Create edges from dependencies
    tasks.value.forEach((task) => {
        const dependencySequences = new Set<number>();

        // Helper to add dependency safely (checking ID first, then Sequence)
        const addDependency = (val: number) => {
            // 1. Try treating it as a Task ID
            const taskById = tasks.value.find((t) => t.id == val);
            if (taskById) {
                dependencySequences.add(taskById.projectSequence);
                return;
            }
            // 2. Try treating it as a Project Sequence
            const taskBySeq = tasks.value.find((t) => t.projectSequence == val);
            if (taskBySeq) {
                dependencySequences.add(val);
            }
        };

        // 1. Trigger Config IDs
        if (task.triggerConfig?.dependsOn?.taskIds) {
            task.triggerConfig.dependsOn.taskIds.forEach(addDependency);
        }

        // 2. Explicit Dependencies (Task model field)
        if (task.dependencies && Array.isArray(task.dependencies)) {
            task.dependencies.forEach(addDependency);
        }

        // 3. Data Dependencies (passResultsFrom)
        if (task.triggerConfig?.dependsOn?.passResultsFrom) {
            task.triggerConfig.dependsOn.passResultsFrom.forEach(addDependency);
        }

        // 4. Parse IDs (or Sequences) from expression
        const expression = task.triggerConfig?.dependsOn?.expression;
        let isComplexDependency = false;

        if (expression && expression.trim().length > 0) {
            isComplexDependency = true;
            const idPattern = /\b\d+\b/g;
            const idsInExpression = [...new Set(expression.match(idPattern) || [])];

            idsInExpression.forEach((idStr) => {
                const val = parseInt(idStr, 10);

                // Try to find by projectSequence first (User mostly types sequences)
                const taskBySeq = tasks.value.find((t) => t.projectSequence === val);
                if (taskBySeq) {
                    dependencySequences.add(taskBySeq.projectSequence);
                } else {
                    // Fallback: Check if it's a raw Task ID
                    const taskById = tasks.value.find((t) => t.id === val);
                    if (taskById) {
                        dependencySequences.add(taskById.projectSequence);
                    }
                }
            });
        }

        dependencySequences.forEach((depSequence: number) => {
            // Only create edge if dependency task exists (by sequence)
            const sourceTask = tasks.value.find((t) => t.projectSequence === depSequence);
            if (sourceTask) {
                // Get output type label from SOURCE task (dependency)
                // Get output type label from SOURCE task (dependency)
                // Use expectedOutputFormat (AI-generated) if available, fallback to outputType
                const outputFormat =
                    sourceTask.expectedOutputFormat || (sourceTask as any).outputType;
                const formatInfo = getOutputFormatInfo(outputFormat);

                // Determine if this specific dependency is part of an "Active Path"
                // For direct dependencies (no expression), it's always active if it exists.
                // For complex dependencies, we check if it contributes to a satisfied condition group.
                let isActivePath = true;
                let branchReason = '';

                // Script Task Control Flow Logic
                const executionResult = (sourceTask as any).executionResult;
                if (sourceTask.status === 'done' && executionResult?.control) {
                    const control = executionResult.control;

                    // Check branching (next)
                    if (Array.isArray(control.next)) {
                        const targetSeq = task.projectSequence;
                        // It's an active path ONLY if the target is in the next list
                        // If empty array [], includes is false -> isActivePath = false (Explicit Stop)
                        isActivePath = control.next.includes(targetSeq);
                    }
                    // If next is undefined/null, it defaults to ALL (isActivePath = true)

                    // Get reason for this specific path
                    if (control.reasons && typeof control.reasons === 'object') {
                        branchReason = control.reasons[task.projectSequence] || '';
                    } else if (control.reason) {
                        // Fallback to global reason if available
                        branchReason = control.reason;
                    }
                } else if (isComplexDependency && expression) {
                    // Fix: Use depSequence instead of undefined depId
                    isActivePath = isDependencyActive(expression, depSequence, tasks.value);
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
                } else {
                    // Inactive path (Skipped)
                    // Keep gray, but maybe distinct?
                    edgeColor = '#E5E7EB'; // Lighter gray for skipped paths
                }

                taskEdges.push({
                    id: `e${sourceTask.projectId}_${sourceTask.projectSequence}-${task.projectId}_${task.projectSequence}`,
                    source: `${sourceTask.projectId}_${sourceTask.projectSequence}`,
                    target: `${task.projectId}_${task.projectSequence}`,
                    type: 'custom', // Use custom edge with delete button
                    animated: task.status === 'in_progress' && isActivePath, // Only animate active paths
                    style: {
                        stroke: edgeColor,
                        strokeWidth: isActivePath ? 3 : 2, // Thicker if active
                        // strokeDasharray: isComplexDependency ? '5,5' : undefined, // Removed dotted style as requested
                        opacity: isActivePath ? 1 : 0.4, // Dim inactive paths slightly
                    },
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        width: 20,
                        height: 20,
                        color: edgeColor,
                    },
                    label: branchReason
                        ? formatInfo
                            ? `${formatInfo.icon} ${formatInfo.label}\n(${branchReason})`
                            : branchReason
                        : formatInfo
                          ? `${formatInfo.icon} ${formatInfo.label}`
                          : '📄 Output',
                    data: {
                        formatInfo, // Pass full formatInfo to CustomEdge for icon rendering
                        onEdgeRemove: (edgeId: string) => {
                            // console.log('🗑️ Removing edge:', edgeId);
                            handleEdgeRemove([
                                {
                                    id: edgeId,
                                    source: `${sourceTask.projectId}_${sourceTask.projectSequence}`,
                                    target: `${task.projectId}_${task.projectSequence}`,
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
    // Override positions for tasks that have saved positions in metadata
    const finalNodes = layoutedNodes.map((node) => {
        // Fix: Node ID is composite "projectId_sequence". Match by composite key.
        const task = tasks.value.find((t) => `${t.projectId}_${t.projectSequence}` === node.id);
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
/**
 * Update a specific node by its composite key (projectId_sequence)
 * This is O(1) compared to O(N) of updateNodesDataSmooth
 */
function updateNodeByKey(compositeKey: string) {
    // compositeKey from store is "projectId-sequence" (e.g. "6-3")
    // BUT Node ID is "projectId_sequence" (e.g. "6_3")
    // We need to convert if they differ.
    // Store uses taskKeyToString: `${projectId}-${projectSequence}`
    // Node ID uses `${projectId}_${projectSequence}`
    // So "6-3" -> "6_3".

    // Safe conversion: split and rejoin
    const parts = compositeKey.split('-');
    if (parts.length === 2) {
        const nodeId = `${parts[0]}_${parts[1]}`;
        // Find the task object to pass fresh data
        const [pId, seq] = parts.map(Number);
        const task = taskStore.tasks.find((t) => t.projectId === pId && t.projectSequence === seq);

        if (task) {
            updateNodeData(nodeId, { task: { ...task } });
        }
    }
}

/**
 * Update only node data without full graph rebuild
 * Uses VueFlow's updateNodeData for smooth updates
 */
function updateNodesDataSmooth() {
    // console.log('[DAGView] Nodes data updated');

    // Update each node's data using VueFlow's API
    taskStore.tasks.forEach((task) => {
        // Fix: Use composite key to match node creation ID
        const nodeId = `${task.projectId}_${task.projectSequence}`;
        updateNodeData(nodeId, { task: { ...task } });
    });

    // console.log('[DAGView] Nodes data updated');
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
        'diff',
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
    if (!winningGroup) return false; // Fix: Ensure winningGroup is not undefined
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
        const val = parseInt(idStr, 10);
        // Fix: Use projectSequence lookup first, fallback to id
        const task =
            allTasks.find((t) => t.projectSequence === val) || allTasks.find((t) => t.id === val);

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

async function handleProjectInfoUpdate() {
    if (!projectId.value) return;
    await projectStore.fetchProject(projectId.value);
    await taskStore.fetchTasks(projectId.value);
    rebuildGraphImmediate();
}

function handleNodeClick(task: Task) {
    console.log('🖱️ [DAGView] handleNodeClick called', task.projectId, task.projectSequence);
    selectedTaskKey.value = `${task.projectId}_${task.projectSequence}`;
    showDetailPanel.value = true;
}

/**
 * Handle connection between nodes
 */
onConnect(async (params) => {
    // Parse composite keys: "projectId_sequence"
    const sourceParts = params.source.split('_').map(Number);
    const targetParts = params.target.split('_').map(Number);

    if (sourceParts.length !== 2 || targetParts.length !== 2) {
        console.warn('Invalid node IDs:', params.source, params.target);
        return;
    }

    const sourceProjectId = sourceParts[0]!;
    const sourceSequence = sourceParts[1]!;
    const targetProjectId = targetParts[0]!;
    const targetSequence = targetParts[1]!;

    if (sourceProjectId === targetProjectId && sourceSequence === targetSequence) {
        console.warn('Cannot connect a task to itself');
        return;
    }

    // Update task dependencies
    // Find tasks by composite key
    const targetTask = tasks.value.find(
        (t) => t.projectId === targetProjectId && t.projectSequence === targetSequence
    );
    const sourceTask = tasks.value.find(
        (t) => t.projectId === sourceProjectId && t.projectSequence === sourceSequence
    );

    if (!targetTask || !sourceTask) return;

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
    // Check using sequence
    if (existingDeps.includes(sourceSequence)) {
        console.warn('Dependency already exists');
        return;
    }

    const updatedTriggerConfig = {
        ...targetTask.triggerConfig,
        dependsOn: {
            ...targetTask.triggerConfig?.dependsOn,
            taskIds: [...existingDeps, sourceSequence], // Store SEQUENCE
            operator: targetTask.triggerConfig?.dependsOn?.operator || 'all',
        },
    };

    await taskStore.updateTask(targetProjectId, targetSequence, {
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
        // Parse composite keys: "projectId_sequence"
        const sourceParts = edge.source.split('_').map(Number);
        const targetParts = edge.target.split('_').map(Number);

        if (sourceParts.length !== 2 || targetParts.length !== 2) continue;

        const sourceSequence = sourceParts[1]!;
        const targetProjectId = targetParts[0]!;
        const targetSequence = targetParts[1]!;

        const targetTask = tasks.value.find(
            (t) => t.projectId === targetProjectId && t.projectSequence === targetSequence
        );

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
        const updatedDeps = existingDeps.filter((depSeq: number) => depSeq !== sourceSequence);

        const updatedTriggerConfig = {
            ...targetTask.triggerConfig,
            dependsOn: {
                ...targetTask.triggerConfig?.dependsOn,
                taskIds: updatedDeps,
                operator: targetTask.triggerConfig?.dependsOn?.operator || 'all',
            },
        };

        await taskStore.updateTask(targetProjectId, targetSequence, {
            triggerConfig: updatedTriggerConfig,
        });
    }

    // Rebuild graph after deletion
    buildGraph();
}

/**
 * Check for circular dependencies
 */

/**
 * Close detail panel
 */
function closeDetailPanel() {
    showDetailPanel.value = false;
    selectedTaskKey.value = null;
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
/**
 * Handle task execution result
 */
async function handleTaskExecute(task: Task) {
    const result = await taskStore.executeTask(task.projectId, task.projectSequence);
    if (!result.success) {
        console.error('Failed to execute task:', result.error);
        if (result.validationError) {
            uiStore.showToast({
                message: result.error || '태스크 실행 설정을 확인해주세요.',
                type: 'warning',
            });
        } else {
            uiStore.showToast({
                message: result.error || '태스크 실행에 실패했습니다.',
                type: 'error',
            });
        }
    }
    // Force immediate rebuild after execution to show updated state
    await nextTick();
    rebuildGraphImmediate();
}

/**
 * Handle Task Edit
 */
function handleEditTask(task: Task) {
    editingTask.value = task;
    showEditModal.value = true;
}

function closeEditModal() {
    showEditModal.value = false;
    editingTask.value = null;
}

async function handleEditModalSave(updates: Partial<Task>) {
    if (!editingTask.value) return;
    await taskStore.updateTask(
        editingTask.value.projectId,
        editingTask.value.projectSequence,
        updates
    );
    closeEditModal();
}

async function handleEditModalDelete() {
    // payload might be Task object OR taskId number depending on Modal implementation
    // But we use editingTask.value which is reliable
    if (editingTask.value) {
        await taskStore.deleteTask(editingTask.value.projectId, editingTask.value.projectSequence);
    }
    closeEditModal();
}

/**
 * Handle Task Subdivision
 */
async function handleTaskSubdivide(task: Task) {
    subdivisionTask.value = task;
    showSubdivisionModal.value = true;
    subdivisionLoading.value = true;
    subdivisionSuggestion.value = null;

    try {
        const suggestion = await taskSubdivisionService.suggestSubdivision(task);
        subdivisionSuggestion.value = suggestion;
    } catch (error) {
        console.error('Failed to get subdivision suggestions:', error);
    } finally {
        subdivisionLoading.value = false;
    }
}

async function confirmSubdivision() {
    if (!subdivisionTask.value || !subdivisionSuggestion.value) return;

    subdivisionCreating.value = true;
    try {
        const parentTask = subdivisionTask.value;
        const subtasks = subdivisionSuggestion.value.subtasks;

        for (const subtask of subtasks) {
            await taskStore.createTask({
                projectId: projectId.value,
                title: subtask.title,
                description: subtask.description || '',
                priority: subtask.priority || 'medium',
                tags: subtask.tags,
                estimatedMinutes: subtask.estimatedMinutes || undefined,
                // parentTaskId is likely deprecated unless backend handles mapping.
                // Assuming backend update included parentTaskSequence support or mapping.
                // If not, this might fail. But we focus on replacing ID usage where possible.
                // If NewTask interface still has parentTaskId, we might have an issue.
                // Let's skip updating parentTaskId logic for now as it requires schema check.
                // But update parent task status:
                parentTaskId: parentTask.id,
            });
        }

        await taskStore.updateTask(parentTask.projectId, parentTask.projectSequence, {
            isSubdivided: true,
        });

        closeSubdivisionModal();
        rebuildGraphDebounced();
    } catch (error) {
        console.error('Failed to create subtasks:', error);
    } finally {
        subdivisionCreating.value = false;
    }
}

function closeSubdivisionModal() {
    showSubdivisionModal.value = false;
    subdivisionTask.value = null;
    subdivisionSuggestion.value = null;
    subdivisionLoading.value = false;
}

/**
 * Handle Task Pause/Resume/Stop
 */
async function handlePause(task: Task) {
    const result = await taskStore.pauseTask(task.projectId, task.projectSequence);
    if (!result.success) {
        uiStore.showToast({
            message: `Failed to pause task: ${result.error}`,
            type: 'error',
        });
    }
}

async function handleResume(task: Task) {
    const result = await taskStore.resumeTask(task.projectId, task.projectSequence);
    if (!result.success) {
        uiStore.showToast({
            message: `Failed to resume task: ${result.error}`,
            type: 'error',
        });
    }
}

async function handleStop(task: Task) {
    const result = await taskStore.stopTask(task.projectId, task.projectSequence);
    if (!result.success) {
        uiStore.showToast({
            message: `Failed to stop task: ${result.error}`,
            type: 'error',
        });
    }
}

async function handleTaskRetry(task: Task, feedback?: string) {
    console.log(
        '[DAGView] Retrying task:',
        task.projectId,
        task.projectSequence,
        'Feedback:',
        feedback
    );
    await taskStore.retryTask(task.projectId, task.projectSequence, feedback);
}

/**
 * Handle Task Approval/Rejection (from Detail Panel or Card)
 */
async function handleTaskApprove(task: Task) {
    const result = await taskStore.approveTask(task.projectId, task.projectSequence); // completeReview -> approveTask ?
    // Check TaskStore.ts: completeReview? No, usually approveTask. Or completeReview.
    // The previous code used completeReview.
    // I should check if completeReview was updated or exists.
    // I updated approveTask.
    // I will use approveTask(projectId, sequence).
    if (!result.success) {
        uiStore.showToast({
            type: 'error',
            message: result.error || '승인 처리에 실패했습니다.',
        });
        return;
    }
    uiStore.showToast({
        type: 'success',
        message: '테스크가 승인되었습니다.',
    });
    closeDetailPanel();
}

async function handleTaskReject(task: Task, feedback: string) {
    await taskStore.updateTask(task.projectId, task.projectSequence, {
        status: 'todo',
        description: task.description + '\n\n[Rejection Feedback]: ' + feedback,
    });
    closeDetailPanel();
}

async function handleTaskSave(task: Task) {
    // This is called from Detail Panel for saving edits
    await taskStore.updateTask(task.projectId, task.projectSequence, task);
    // Detail panel stays open, but graph might need update if structural generic props changed
    // updateNodesDataSmooth(); // Optional
}

function handlePreviewResult(task: Task) {
    previewTaskKey.value = `${task.projectId}_${task.projectSequence}`;
    showResultPreview.value = true;
}

function handlePreviewStream(task: Task) {
    console.log('🎥 [DAGView] handlePreviewStream called', task.id);
    executionTaskKey.value = `${task.projectId}_${task.projectSequence}`;
    showExecutionModal.value = true;
    console.log('🎥 [DAGView] Opening execution modal for task:', executionTaskKey.value);
}

function handleViewHistory(task: Task) {
    selectedTaskKey.value = `${task.projectId}_${task.projectSequence}`;
    showDetailPanel.value = true;
}

function handleProvideInput(task: Task) {
    inputTask.value = task;
    showInputModal.value = true;
}

// Fixed: Implement Input Submission Handler
async function handleInputSubmit(data: any) {
    if (!inputTask.value) return;

    try {
        const result = await taskStore.submitInput(
            inputTask.value.projectId,
            inputTask.value.projectSequence,
            data
        );
        if (result.success) {
            uiStore.showToast({
                type: 'success',
                message: '입력이 제출되었습니다.',
            });
            showInputModal.value = false;
            rebuildGraphImmediate(); // Update graph to reflect new status
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

/**
 * Handle preview result - open result preview modal
 */

/**
 * Handle view history
 */

/**
 * Handle task deletion from delete button
 */
async function handleTaskDelete(task: Task) {
    if (!confirm(`Are you sure you want to delete "${task.title}"?`)) {
        return;
    }

    try {
        await taskStore.deleteTask(task.projectId, task.projectSequence);
        console.log('Task deleted successfully:', task.projectId, task.projectSequence);

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

async function handleOperatorDrop(projectId: number, sequence: number, operatorId: number) {
    console.log('🟢 DAGView handleOperatorDrop:', projectId, sequence, operatorId);
    try {
        const task = taskStore.tasks.find(
            (t) => t.projectId === projectId && t.projectSequence === sequence
        );
        const taskTitle = task?.title || `Task ${projectId}-${sequence}`;

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
            projectId,
            sequence,
            { assignedOperatorId: operatorId },
            `Assign "${operatorName}" to "${taskTitle}"`
        );
        console.log('🟢 Task updated successfully with history');

        // Fetch fresh data to ensure UI updates
        await taskStore.fetchTasks(projectId);

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
    // console.log('🔴 Wrapper div drop event!', event);
    const operatorData = event.dataTransfer?.getData('application/x-operator');
    const templateData = event.dataTransfer?.getData('application/x-script-template');

    // console.log('🔴 Drop data:', { operatorData: !!operatorData, templateData: !!templateData });

    // Handle Script Template Drop (Create New Task)
    if (templateData) {
        event.preventDefault();
        try {
            const template = JSON.parse(templateData);

            // Calculate position using VueFlow's projection
            let position = { x: 0, y: 0 };
            if (projectToFlowCoords) {
                position = projectToFlowCoords({ x: event.clientX, y: event.clientY });
            }

            // Create new Script Task
            taskStore
                .createTask({
                    projectId: projectId.value,
                    title: template.name,
                    description: template.description || '',
                    taskType: 'script',
                    status: 'todo',
                    priority: 'medium',
                    scriptCode: template.scriptCode,
                    scriptLanguage: template.scriptLanguage || 'javascript',
                    scriptRuntime: template.scriptRuntime || 'browser',
                    tags: template.tags,
                    metadata: {
                        dagPosition: position, // Save position for DAG layout
                    },
                })
                .then(() => {
                    rebuildGraphDebounced();
                    uiStore.showToast({
                        type: 'success',
                        message: `Created script task from template: ${template.name}`,
                    });
                });
        } catch (error) {
            console.error('Failed to create task from template:', error);
            uiStore.showToast({
                type: 'error',
                message: 'Failed to create task from template',
            });
        }
        return;
    }

    // Handle Operator Drop (Assign to Task)
    if (operatorData) {
        event.preventDefault();

        // Find which node is under the cursor
        const target = event.target as HTMLElement;
        const nodeElement = target.closest('.vue-flow__node');
        if (nodeElement) {
            const nodeId = nodeElement.getAttribute('data-id');
            // console.log('🔴 Node ID:', nodeId);

            if (nodeId) {
                try {
                    const operator = JSON.parse(operatorData);
                    // console.log('🔴 Calling handleOperatorDrop:', nodeId, operator.id);
                    // Parse composite key "projectId_sequence"
                    const [pId, seq] = nodeId.split('_').map(Number);
                    if (
                        pId !== undefined &&
                        seq !== undefined &&
                        Number.isFinite(pId) &&
                        Number.isFinite(seq)
                    ) {
                        handleOperatorDrop(pId, seq, operator.id);
                    } else {
                        console.error('Invalid Node ID format:', nodeId);
                    }
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
    if (
        types.includes('application/x-operator') ||
        types.includes('application/x-script-template')
    ) {
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

let cleanupListeners: (() => void) | undefined;

// Initial load
onMounted(async () => {
    if (projectId.value) {
        console.log('🔵 DAGView mounting, projectId:', projectId.value);

        // Load projects list and tasks in parallel
        await Promise.all([projectStore.fetchProjects(), taskStore.fetchTasks(projectId.value)]);

        // Initialize task store listeners (IMPORTANT: needed for receiving execution events)
        cleanupListeners = taskStore.initEventListeners();

        // Debug: check if project loaded
        console.log('🔵 After loading, project:', project.value);

        // Wait a tick to ensure data is set, then build graph
        await nextTick();
        buildGraph();

        // Subscribe to taskStore state changes for reliable updates
        // This ensures INPUT task status updates (including inputSubStatus) are reflected immediately
        const unsubscribe = taskStore.$subscribe(
            async (mutation, _state) => {
                // Check if mutation is related to streaming progress or task updates
                // If it's just a ref update for progress, we use smooth update
                if (
                    mutation.events &&
                    typeof mutation.events === 'object' &&
                    'key' in mutation.events &&
                    (mutation.events.key === 'executionProgress' ||
                        mutation.events.key === 'reviewProgress' ||
                        mutation.events.key === 'executingTaskIds')
                ) {
                    // Optimized: Only update the specific node that changed

                    // For Maps (executionProgress, reviewProgress), the 'key' property of the event is the map Key (composite string)
                    // But wait, Pinia Map mutations might be tricky.
                    // If it's a Map.set(key, value), mutation.events.key is just 'executionProgress' (the field name)?
                    // No, for Maps/Sets, Pinia deep subscription often gives events for the collection itself.
                    // Let's check mutation.events structure.
                    // For Map.set: type = 'set', key = map key, target = map object.
                    // BUT in Pinia $subscribe, deeply reactive objects work differently.
                    // Actually, let's look at how we keyed it.
                    // executionProgress is a Ref<Map>. updating it usually means .value.set().
                    // This triggers a 'set' operation on the Map.
                    // Pinia's subscription state is the whole state tree.
                    // mutation.events will vary.
                    // Robust approach: If we can get the key, update specific. If not, fallback to smooth update.

                    // Try to extract key from event loop if possible, or just optimize updateNodesDataSmooth to be smarter?
                    // "Targeted Node Updates" requires knowing WHICH task changed.
                    // For streaming, we are doing executionProgress.value.get(key).content += ...
                    // Wait, we are NOT Mutating the map value in place if it's a primitive string. We are probably doing map.set(key, newObj).
                    // In `AIServiceManager.ts` / `taskStore.ts`:
                    // executionProgress.value.set(key, { ...old, content: ... })
                    // This triggers a Map SET operation.
                    // mutation.events.key should be the Map KEY (composite string) if we subscribe deeply?
                    // Pinia $subscribe(callback, { detached: true }) is state subscription.
                    // It returns { type, storeId, events }. "events" is the Vue reactivity event.
                    // If we modify a Map, events.key is the Map Key.

                    const mapKey = (mutation.events as any).key;
                    // Store keys formatted as "projectId-sequence" (e.g., "6-3")
                    if (
                        typeof mapKey === 'string' &&
                        (mapKey.includes('-') || mapKey.includes('_'))
                    ) {
                        updateNodeByKey(mapKey);
                    } else {
                        // Fallback for bulk updates or if key detection fails
                        updateNodesDataSmooth();
                    }
                    return;
                }

                // For structure changes (add/remove task) or status changes that might affect edges
                // We typically rebuild, but maybe we can optimize further.
                // For now, let's debounce normal rebuilds and avoid immediate rebuild on everything.
                await nextTick();
                rebuildGraphDebounced();
            },
            { detached: true }
        );

        // Listen for custom INPUT task status change events
        const handleInputStatusChange = async (event: Event) => {
            const detail = (event as CustomEvent).detail;
            console.log('[DAGView] INPUT task status changed event:', detail);

            if (detail.projectId && detail.projectSequence) {
                // Construct key expected by updateNodeByKey (format: "projectId-sequence")
                const key = `${detail.projectId}-${detail.projectSequence}`;
                updateNodeByKey(key);
            }
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
            if (cleanupListeners) {
                cleanupListeners();
            }
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
                :node-types="nodeTypes as any"
                :edge-types="edgeTypes as any"
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
                        @edit="handleEditTask(data.task)"
                        @subdivide="handleTaskSubdivide(data.task)"
                        @pause="handlePause(data.task)"
                        @resume="handleResume(data.task)"
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

        <!-- Task Edit Modal -->
        <TaskEditModal
            v-if="showEditModal"
            :open="showEditModal"
            :task="editingTask"
            @close="closeEditModal"
            @save="handleEditModalSave"
            @delete="handleEditModalDelete"
        />

        <!-- Input Task Modal -->
        <InputTaskModal
            v-if="showInputModal"
            :show="showInputModal"
            :task="inputTask"
            @close="showInputModal = false"
            @submit="handleInputSubmit"
        />

        <!-- Create Task Modal -->
        <TaskCreateModal
            v-if="showCreateModal"
            :open="showCreateModal"
            :initial-status="createInColumn"
            :project-id="projectId"
            @close="showCreateModal = false"
            @created="rebuildGraphDebounced"
        />

        <!-- Subdivision Modal -->
        <SubdivisionModal
            v-if="showSubdivisionModal && subdivisionTask"
            :is-open="showSubdivisionModal"
            :task="subdivisionTask"
            :loading="subdivisionLoading"
            :suggestion="subdivisionSuggestion"
            @close="showSubdivisionModal = false"
            @confirm="confirmSubdivision"
        />

        <!-- Task Detail Panel -->
        <TaskDetailPanel
            v-if="showDetailPanel && selectedTask"
            :open="showDetailPanel"
            :task="selectedTask"
            @close="closeDetailPanel"
            @save="handleTaskSave"
            @execute="handleTaskExecute"
            @approve="handleTaskApprove"
            @reject="handleTaskReject"
        />

        <!-- Result Preview Modal -->
        <EnhancedResultPreview
            v-if="showResultPreview && resultPreviewTask"
            :open="showResultPreview"
            :task="resultPreviewTask"
            :task-id="resultPreviewTask.id"
            @close="showResultPreview = false"
            @retry="handleTaskRetry"
        />

        <!-- Execution Progress Modal -->
        <div
            v-if="showExecutionModal && executionTask"
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        >
            <div
                class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-[600px] max-h-[80vh] overflow-hidden flex flex-col"
            >
                <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                    Task Execution
                </h3>
                <div class="flex-1 overflow-y-auto min-h-0">
                    <TaskExecutionProgress :task="executionTask" />
                </div>
                <div class="mt-4 flex justify-end">
                    <button
                        class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        @click="showExecutionModal = false"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>

        <!-- Project Info Modal -->
        <ProjectInfoModal
            :project="project"
            :open="showProjectInfoModal"
            @close="showProjectInfoModal = false"
            @edit="showProjectInfoModal = false"
            @update="handleProjectInfoUpdate"
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
                <button class="context-menu-item" @click="handleNewTaskFromContextMenu">
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
