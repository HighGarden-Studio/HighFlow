<script setup lang="ts">
/**
 * DAG (Directed Acyclic Graph) View - Vue Flow Edition
 *
 * Modern DAG visualization using Vue Flow with automatic layout
 */
import { ref, computed, watch, nextTick, onMounted, markRaw } from 'vue';
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
import TaskEditModal from '../../components/task/TaskEditModal.vue';
import InputTaskForm from '../../components/task/InputTaskForm.vue';

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

// Input Modal State
const showInputModal = ref(false);
const inputTask = ref<Task | null>(null);

// Vue Flow setup
const { onConnect, addEdges, fitView } = useVueFlow();

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
function buildGraph() {
    if (isBuilding) {
        console.log('⏸️ buildGraph already running, skipping...');
        return;
    }

    isBuilding = true;
    console.log('🔄 Building graph with', tasks.value.length, 'tasks');

    const taskNodes: Node[] = [];
    const taskEdges: Edge[] = [];

    // Create nodes
    tasks.value.forEach((task) => {
        taskNodes.push({
            id: String(task.id),
            type: 'taskCard',
            position: { x: 0, y: 0 }, // Will be set by layout
            data: { task },
        });
    });

    // Create edges from dependencies
    tasks.value.forEach((task) => {
        const dependencies = task.triggerConfig?.dependsOn?.taskIds || [];
        dependencies.forEach((depId: number) => {
            // Only create edge if dependency task exists
            const sourceTask = tasks.value.find((t) => t.id === depId);
            if (sourceTask) {
                // Get output type label from SOURCE task (dependency)
                // Use expectedOutputFormat (AI-generated) if available, fallback to outputType
                const outputFormat = sourceTask.expectedOutputFormat || sourceTask.outputType;
                const formatInfo = getOutputFormatInfo(outputFormat);

                console.log(
                    `📊 Edge ${depId}->${task.id}: expectedOutputFormat="${sourceTask.expectedOutputFormat}", outputType="${sourceTask.outputType}", formatInfo:`,
                    formatInfo
                );

                taskEdges.push({
                    id: `e${depId}-${task.id}`,
                    source: String(depId),
                    target: String(task.id),
                    type: 'custom', // Use custom edge with delete button
                    animated: task.status === 'in_progress',
                    style: {
                        stroke: getEdgeColor(task),
                        strokeWidth: 2,
                    },
                    markerEnd: {
                        type: MarkerType.ArrowClosed,
                        width: 20,
                        height: 20,
                        color: getEdgeColor(task),
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

    nodes.value = layoutedNodes;
    edges.value = layoutedEdges;

    // Fit view after layout
    nextTick(() => {
        fitView({ padding: 0.2, duration: 200 });
        isBuilding = false;
    });
}

/**
 * Rebuild graph with debouncing to avoid excessive rebuilds
 */
function rebuildGraphDebounced() {
    if (buildGraphTimer) {
        clearTimeout(buildGraphTimer);
    }
    buildGraphTimer = setTimeout(() => {
        buildGraph();
        buildGraphTimer = null;
    }, DEBOUNCE_MS);
}

/**
 * Force immediate graph rebuild (no debounce)
 */
function rebuildGraphImmediate() {
    if (buildGraphTimer) {
        clearTimeout(buildGraphTimer);
        buildGraphTimer = null;
    }
    buildGraph();
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
        case 'needs_approval':
            return '#F59E0B'; // Orange
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
 * Handle node click
 */
function handleNodeClick(task: Task) {
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

    // Check for circular dependency
    if (wouldCreateCircularDependency(sourceId, targetId)) {
        console.warn('Cannot create circular dependency');
        return;
    }

    // Update task dependencies
    const targetTask = tasks.value.find((t) => t.id === targetId);
    if (!targetTask) return;

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
async function handleTaskCreated(task: Partial<Task>) {
    showCreateModal.value = false;
    await taskStore.fetchTasks(projectId.value);
    buildGraph();
}

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
    await taskStore.approveTask(task.id);
}

async function handleTaskRetry(task: Task) {
    await taskStore.retryTask(task.id);
}

async function handleProvideInput(task: Task) {
    // For INPUT tasks, open the input modal
    inputTask.value = task;
    showInputModal.value = true;
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
    const result = await taskStore.stopTask(task.id);
    if (!result.success && result.error) {
        uiStore.showToast({
            message: `Failed to stop task: ${result.error}`,
            type: 'error',
        });
    }
}

// Watch for task changes and rebuild graph
// Use deep watch to detect both array changes AND individual task property changes
// Use debouncing to avoid excessive rebuilds when multiple properties change
watch(
    tasks,
    () => {
        console.log('🔄 Tasks changed, scheduling graph rebuild');
        rebuildGraphDebounced();
    },
    { deep: true, flush: 'post' } // Deep watch to detect task property changes
);

/**
 * Handle task save from detail panel
 */
async function handleTaskSave(task: Task) {
    // Save the updated task to the database
    await taskStore.updateTask(task.id, task);

    // Generate graph after store update (optimistic update handles the data)
    buildGraph(); // Rebuild graph after fetching updated tasks

    // Note: Don't clear selectedTaskId here - let the user close the panel explicitly
    // This prevents the panel from closing when auto-saves occur from persistExecutionSettings()
}

/**
 * Handle operator assignment
 */
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
            >
                <!-- Custom node template -->
                <template #node-taskCard="{ data }">
                    <TaskFlowNode
                        :data="data"
                        @click="handleNodeClick(data.task)"
                        @execute="handleTaskExecute(data.task)"
                        @approve="handleTaskApprove(data.task)"
                        @retry="handleTaskRetry(data.task)"
                        @stop="handleStop(data.task)"
                        @operatorDrop="handleOperatorDrop"
                        @provideInput="handleProvideInput"
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
            @save="handleTaskSave"
        />

        <!-- Task Edit Modal (for creating new tasks) -->
        <TaskEditModal
            v-if="showCreateModal"
            :open="showCreateModal"
            :task="null"
            :defaults="{ status: createInColumn }"
            @close="showCreateModal = false"
            @save="handleTaskCreated"
        />

        <!-- Input Modal -->
        <Teleport to="body">
            <InputTaskForm
                v-if="showInputModal && inputTask"
                :task="inputTask"
                @close="closeInputModal"
                @submit="handleInputSubmit"
            />
        </Teleport>

        <!-- Project Info Modal -->
        <ProjectInfoModal
            :project="project"
            :open="showProjectInfoModal"
            @close="showProjectInfoModal = false"
            @edit="showProjectInfoModal = false"
        />
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
</style>
