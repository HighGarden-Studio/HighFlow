<template>
    <div class="console-flow-view h-full w-full bg-slate-50 dark:bg-slate-950">
        <VueFlow
            v-if="nodes.length > 0"
            v-model:nodes="nodes"
            v-model:edges="edges"
            :node-types="nodeTypes"
            :default-viewport="{ zoom: 1 }"
            :min-zoom="0.2"
            :max-zoom="4"
            fit-view-on-init
        >
            <Background pattern-color="#aaa" gap="16" />
            <Controls />
            <MiniMap />
        </VueFlow>

        <div v-else class="h-full flex flex-col items-center justify-center text-gray-400 gap-4">
            <div class="text-6xl opacity-30">🚀</div>
            <p class="text-lg font-medium">Ready to execute tasks.</p>
            <p class="text-sm opacity-70">Start a workflow to see the execution diagram here.</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, markRaw } from 'vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import type { Node, Edge } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import dagre from 'dagre';
import { useConsoleStore } from '../../../renderer/stores/consoleStore';
import ConsoleFlowNode from './ConsoleFlowNode.vue';

// Import Vue Flow styles
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';

const store = useConsoleStore();
const { fitView } = useVueFlow();

const nodeTypes: any = {
    consoleNode: markRaw(ConsoleFlowNode),
};

const nodes = ref<Node[]>([]);
const edges = ref<Edge[]>([]);

// Layout Graph
const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));

    dagreGraph.setGraph({ rankdir: direction });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: 400, height: 300 }); // Estimated size
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    return nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            position: {
                x: nodeWithPosition.x - 200,
                y: nodeWithPosition.y - 150,
            },
        };
    });
};

function buildGraph() {
    const executions = store.activeExecutions;
    console.debug('[ConsoleFlowView] Rebuilding graph. Active executions:', executions.length);
    if (executions.length === 0) {
        nodes.value = [];
        edges.value = [];
        return;
    }

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Map executions to nodes
    executions.forEach((exec) => {
        newNodes.push({
            id: exec.taskId.toString(),
            type: 'consoleNode',
            data: {
                taskId: exec.taskId,
                title: exec.title,
                status: exec.status,
                startTime: exec.startTime,
                endTime: exec.endTime,
                transcript: exec.transcript,
            },
            position: { x: 0, y: 0 }, // Set by layout
        });
    });

    // Auto-layout logic handles positioning
    const layoutedNodes = getLayoutedElements(newNodes, newEdges);
    nodes.value = layoutedNodes as Node[];
    edges.value = newEdges as Edge[];

    // Auto fit view on update
    fitView();
}

// Reactivity optimization: Watch the executions map directly or active IDs?
// Watching activeExecutions (computed) is fine, but we should be careful about redrawing everything.
// Vue Flow handles node updates efficiently if we update the nodes ref, but replacing the array is also okay for small graphs.

watch(
    () => store.activeTaskIds,
    () => {
        // Structural change (add/remove nodes)
        buildGraph();
    },
    { deep: true, immediate: true }
);

watch(
    () => store.executions, // Watch the map itself for status/content updates
    () => {
        // Update existing node data without rebuilding graph structure if possible
        // But for simplicity, rebuilding is safer to ensure sync.
        // We can optimize to only update data property of matching nodes.

        nodes.value.forEach((node) => {
            const exec = store.executions.get(Number(node.id));
            if (exec) {
                node.data = {
                    ...node.data,
                    status: exec.status,
                    transcript: [...exec.transcript], // Force reactivity
                    endTime: exec.endTime,
                };
            }
        });
    },
    { deep: true }
);
</script>

<style>
/* Global overrides if needed */
</style>
