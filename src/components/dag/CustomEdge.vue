<script setup lang="ts">
import { computed } from 'vue';
import { getBezierPath } from '@vue-flow/core';
import IconRenderer from '../common/IconRenderer.vue';

interface Props {
    id: string;
    sourceX: number;
    sourceY: number;
    targetX: number;
    targetY: number;
    sourcePosition: string;
    targetPosition: string;
    label?: string;
    markerEnd?: any;
    style?: any;
    data?: {
        onEdgeRemove?: (edgeId: string) => void;
        formatInfo?: {
            label: string;
            icon: string;
            bgColor?: string;
            textColor?: string;
        } | null;
    };
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'edgeClick', edgeId: string): void;
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
    console.log('🔴 Delete button clicked for edge:', props.id);
    if (props.data?.onEdgeRemove) {
        props.data.onEdgeRemove(props.id);
    }
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
                <div
                    v-if="data?.formatInfo"
                    :class="[
                        'edge-label-badge',
                        data.formatInfo.bgColor || 'bg-gray-700',
                        data.formatInfo.textColor || 'text-gray-200',
                    ]"
                >
                    <IconRenderer :emoji="data.formatInfo.icon" class="w-3.5 h-3.5" />
                    <span class="label-text">{{ data.formatInfo.label }}</span>
                    <button class="delete-button" title="의존성 제거" @click="handleRemove">
                        ×
                    </button>
                </div>
                <div v-else class="edge-label">
                    <span class="label-text">{{ label || 'Output' }}</span>
                    <button class="delete-button" title="의존성 제거" @click="handleRemove">
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
    /* stroke-width: 3px; // Removed to prevent shift */
    stroke: #60a5fa; /* Make sure it highlights with color */
    filter: drop-shadow(0 0 2px rgba(96, 165, 250, 0.5));
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
    z-index: 100; /* Ensure label stays on top */
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

/* Badge style for formatted labels */
.edge-label-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 11px;
    font-weight: 600;
    opacity: 0.95;
    transition: all 0.2s;
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.custom-edge:hover .edge-label-badge {
    opacity: 1;
    transform: scale(1.05);
}
</style>
