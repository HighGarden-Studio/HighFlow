<script setup lang="ts">
import { computed } from 'vue';
import { getBezierPath } from '@vue-flow/core';

interface Props {
    id: string;
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    sourcePosition: string;
    targetPosition: string;
    label?: string;
    markerEnd?: any; // Allow optional for compatibility
    style?: any;
    data?: any;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'edgeClick', edgeId: string): void;
    (e: 'edgeRemove', edgeId: string): void;
}>();

// Calculate bezier path
const edgePath = computed(() => {
    const [path] = getBezierPath({
        sourceX: props.sourceX,
        sourceY: props.sourceY,
        sourcePosition: props.sourcePosition as any,
        targetX: props.targetX,
        targetY: props.targetY,
        targetPosition: props.targetPosition as any,
    });
    return path;
});

// Calculate label position (center of edge)
const labelX = computed(() => (props.sourceX + props.targetX) / 2);
const labelY = computed(() => (props.sourceY + props.targetY) / 2);

function handleRemove(event: MouseEvent) {
    event.stopPropagation();
    emit('edgeRemove', props.id);
}
</script>

<template>
    <g class="custom-edge" @click="emit('edgeClick', id)">
        <!-- Main edge path -->
        <path :d="edgePath" :style="style" class="edge-path" fill="none" :marker-end="markerEnd" />

        <!-- Invisible wider path for better hover detection -->
        <path
            :d="edgePath"
            class="edge-hover-area"
            fill="none"
            stroke="transparent"
            stroke-width="20"
        />

        <!-- Label with delete button -->
        <foreignObject
            :x="labelX - 60"
            :y="labelY - 15"
            width="120"
            height="30"
            class="edge-label-container"
        >
            <div class="edge-label-wrapper">
                <div class="edge-label">
                    <span class="label-text">{{ label || 'Output' }}</span>
                    <button class="delete-button" @click="handleRemove" title="의존성 제거">
                        ×
                    </button>
                </div>
            </div>
        </foreignObject>
    </g>
</template>

<style scoped>
.custom-edge {
    cursor: pointer;
}

.edge-path {
    stroke-width: 2px;
    transition: stroke-width 0.2s;
}

.custom-edge:hover .edge-path {
    stroke-width: 3px;
}

.edge-hover-area {
    pointer-events: stroke;
}

.edge-label-container {
    pointer-events: none;
}

.edge-label-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    pointer-events: all;
}

.edge-label {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #1f2937;
    border: 1px solid #374151;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    color: #9ca3af;
    opacity: 0.95;
    transition: all 0.2s;
}

.custom-edge:hover .edge-label {
    background: #374151;
    border-color: #4b5563;
    opacity: 1;
}

.label-text {
    white-space: nowrap;
}

.delete-button {
    display: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: none;
    background: #ef4444;
    color: white;
    font-size: 14px;
    font-weight: bold;
    line-height: 1;
    cursor: pointer;
    padding: 0;
    transition: all 0.2s;
    flex-shrink: 0;
}

.custom-edge:hover .delete-button {
    display: flex;
    align-items: center;
    justify-content: center;
}

.delete-button:hover {
    background: #dc2626;
    transform: scale(1.1);
}

.delete-button:active {
    transform: scale(0.95);
}
</style>
