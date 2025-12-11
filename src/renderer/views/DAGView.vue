<script setup lang="ts">
/**
 * DAG (Directed Acyclic Graph) View - Vue Flow Edition
 *
 * Modern DAG visualization using Vue Flow with automatic layout
 */
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { VueFlow, useVueFlow, Position, MarkerType } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import type { Node, Edge } from '@vue-flow/core';
import dagre from 'dagre';
import { useTaskStore } from '../stores/taskStore';
import { useProjectStore } from '../stores/projectStore';
import type { Task } from '@core/types/database';
import TaskDetailPanel from '../../components/task/TaskDetailPanel.vue';
import OperatorPanel from '../../components/project/OperatorPanel.vue';
import TaskFlowNode from '../../components/dag/TaskFlowNode.vue';
import ProjectHeader from '../../components/project/ProjectHeader.vue';
import ProjectInfoModal from '../../components/project/ProjectInfoModal.vue';
import CustomEdge from '../../components/dag/CustomEdge.vue';

// Import Vue Flow styles
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';

const route = useRoute();
const router = useRouter();
const taskStore = useTaskStore();
const projectStore = useProjectStore();

// Computed
const projectId = computed(() => Number(route.params.id));
const project = computed(() => projectStore.currentProject);
const tasks = computed(() => taskStore.tasks);

// Task detail panel state
const selectedTaskId = ref<number | null>(null);
const selectedTask = computed(() => {
    if (!selectedTaskId.value) return null;
    return taskStore.tasks.find((t) => t.id === selectedTaskId.value) || null;
});
const showDetailPanel = ref(false);

// Project info modal
const showProjectInfoModal = ref(false);

// Vue Flow setup
const { onConnect, addEdges, fitView } = useVueFlow();

// Nodes and edges
const nodes = ref<Node[]>([]);
const edges = ref<Edge[]>([]);

// Register node types
const nodeTypes = {
    taskCard: TaskFlowNode,
};

// Register edge types
const edgeTypes = {
    custom: CustomEdge,
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
function buildGraph() {
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
                const outputLabel = getOutputTypeLabel(sourceTask.outputType);
                console.log(
                    `📊 Edge ${depId}->${task.id}: outputType="${sourceTask.outputType}", label="${outputLabel}"`
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
                    label: outputLabel,
                    data: {
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
    });
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
 * Get formatted output type label
 */
function getOutputTypeLabel(outputType: string | null): string {
    if (!outputType) return '📄 Output';

    const typeMap: Record<string, string> = {
        text: '📄 Text',
        code: '💻 Code',
        image: '🖼️ Image',
        file: '📁 File',
        json: '📊 JSON',
        html: '🌐 HTML',
        markdown: '📝 MD',
    };

    return typeMap[outputType.toLowerCase()] || `📄 ${outputType}`;
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
 * Handle task events
 */
async function handleTaskExecute(task: Task) {
    await taskStore.executeTask(task.id);
}

async function handleTaskApprove(task: Task) {
    await taskStore.approveTask(task.id);
}

async function handleTaskRetry(task: Task) {
    await taskStore.retryTask(task.id);
}

// Watch for task changes and rebuild graph
watch(
    tasks,
    () => {
        buildGraph();
    },
    { deep: true }
);

// Initial load
onMounted(async () => {
    if (projectId.value) {
        await projectStore.setCurrentProject(projectId.value);
        await taskStore.fetchTasks(projectId.value);
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
            @project-info="showProjectInfoModal = true"
        />
        <!-- Operator Panel -->
        <OperatorPanel :project-id="projectId" />

        <!-- Vue Flow Container -->
        <div class="flow-container">
            <VueFlow
                :nodes="nodes"
                :edges="edges"
                :node-types="nodeTypes"
                :edge-types="edgeTypes"
                :default-viewport="{ zoom: 0.8 }"
                :min-zoom="0.2"
                :max-zoom="4"
                :edges-focusable="true"
                :edges-updatable="false"
                fit-view-on-init
                class="vue-flow"
                @edges-delete="handleEdgeRemove"
            >
                <Background pattern-color="#374151" :gap="16" />
                <Controls />
                <MiniMap />

                <!-- Custom node template -->
                <template #node-taskCard="{ data }">
                    <TaskFlowNode
                        :data="data"
                        @click="handleNodeClick(data.task)"
                        @execute="handleTaskExecute(data.task)"
                        @approve="handleTaskApprove(data.task)"
                        @retry="handleTaskRetry(data.task)"
                    />
                </template>
            </VueFlow>
        </div>

        <!-- Task Detail Panel -->
        <TaskDetailPanel
            v-if="showDetailPanel && selectedTask"
            :task="selectedTask"
            @close="closeDetailPanel"
            @save="closeDetailPanel"
            @execute="handleTaskExecute"
            @approve="handleTaskApprove"
            @reject="closeDetailPanel"
        />

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
