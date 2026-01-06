<script setup lang="ts">
import { VueFlow, useVueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { ref, onMounted } from 'vue';

// Import VueFlow styles
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';

const props = defineProps<{
    nodes: any[];
    edges: any[];
}>();

const { fitView } = useVueFlow();

// Custom node styles (optional, can be expanded)
const defaultNodeStyle = {
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '10px',
    width: '150px',
    textAlign: 'center' as const,
    fontSize: '12px',
};

// Ensure nodes have styles if missing
const processedNodes = props.nodes.map((node) => ({
    ...node,
    style: { ...defaultNodeStyle, ...node.style },
}));

onMounted(() => {
    setTimeout(() => {
        fitView();
    }, 100);
});
</script>

<template>
    <div
        class="h-full w-full bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-800"
    >
        <VueFlow
            :nodes="processedNodes"
            :edges="edges"
            :default-viewport="{ zoom: 1 }"
            :min-zoom="0.5"
            :max-zoom="1.5"
            :nodes-draggable="false"
            :nodes-connectable="false"
            :elements-selectable="false"
            fit-view-on-init
        >
            <Background pattern-color="#aaa" :gap="16" />
            <Controls :show-interactive="false" />

            <!-- Custom Node Templates could go here -->
        </VueFlow>
    </div>
</template>

<style scoped>
/* Scoped styles for the graph container if needed */
</style>
