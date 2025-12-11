<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import TaskCard from '../board/TaskCard.vue';
import type { Task } from '@core/types/database';
import { ref, onMounted, onUnmounted } from 'vue';

interface Props {
    data: {
        task: Task;
    };
}

const props = defineProps<Props>();

// Emit events to parent
const emit = defineEmits<{
    (e: 'click', task: Task): void;
    (e: 'execute', task: Task): void;
    (e: 'previewResult', task: Task): void;
    (e: 'retry', task: Task): void;
    (e: 'approve', task: Task): void;
    (e: 'operatorDrop', taskId: number, operatorId: number): void;
}>();

// Operator drag state
const isOperatorDragOver = ref(false);

function handleClick() {
    emit('click', props.data.task);
}

function handleExecute() {
    emit('execute', props.data.task);
}

function handlePreviewResult() {
    emit('previewResult', props.data.task);
}

function handleRetry() {
    emit('retry', props.data.task);
}

function handleApprove() {
    emit('approve', props.data.task);
}

function handleOperatorDrop(taskId: number, operatorId: number) {
    console.log('🔵 TaskFlowNode handleOperatorDrop:', taskId, operatorId);
    emit('operatorDrop', taskId, operatorId);
    console.log('🔵 TaskFlowNode emitted operatorDrop');
}

// Direct drag/drop handlers for wrapper
function handleWrapperDragOver(event: DragEvent) {
    const types = event.dataTransfer?.types || [];
    if (types.includes('application/x-operator')) {
        event.preventDefault(); // CRITICAL: Required for drop to work!
        // Don't stopPropagation - let it bubble to parent
        isOperatorDragOver.value = true;
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
        }
        console.log('🟡 TaskFlowNode wrapper dragover');
    }
}

function handleWrapperDragLeave(event: DragEvent) {
    isOperatorDragOver.value = false;
    console.log('🟡 TaskFlowNode wrapper dragleave');
}

function handleWrapperDrop(event: DragEvent) {
    console.log('🟡 TaskFlowNode wrapper drop fired!');
    const operatorData = event.dataTransfer?.getData('application/x-operator');
    console.log('🟡 Operator data:', operatorData);

    if (operatorData) {
        event.preventDefault();
        // Don't stopPropagation - let parent wrapper handle it too
        isOperatorDragOver.value = false;

        try {
            const operator = JSON.parse(operatorData);
            console.log('🟡 Emitting from wrapper:', props.data.task.id, operator.id);
            emit('operatorDrop', props.data.task.id, operator.id);
        } catch (error) {
            console.error('Failed to parse operator data:', error);
        }
    }
}

// Use native event listeners to bypass Vue event system
const nodeRef = ref<HTMLElement | null>(null);

onMounted(() => {
    if (nodeRef.value) {
        console.log('🟣 Setting up native listeners for task:', props.data.task.id);

        // Try mouseup event instead of drop for better compatibility
        nodeRef.value.addEventListener('mouseup', (e: Event) => {
            const event = e as MouseEvent;
            // Check if this is the end of a drag operation
            if (isOperatorDragOver.value) {
                console.log('🟣 NATIVE mouseup during drag!');
                // Create a synthetic DragEvent
                const dataTransfer = (window as any).__operatorDragData;
                if (dataTransfer) {
                    const syntheticEvent = {
                        dataTransfer: {
                            getData: (type: string) => dataTransfer[type] || '',
                        },
                        preventDefault: () => {},
                        stopPropagation: () => {},
                    } as unknown as DragEvent;
                    handleWrapperDrop(syntheticEvent);
                }
                isOperatorDragOver.value = false;
            }
        });

        nodeRef.value.addEventListener('drop', (e: Event) => {
            const event = e as DragEvent;
            console.log('🟣 NATIVE drop event fired!');
            handleWrapperDrop(event);
        });

        nodeRef.value.addEventListener('dragover', (e: Event) => {
            const event = e as DragEvent;
            handleWrapperDragOver(event);
        });

        nodeRef.value.addEventListener('dragleave', (e: Event) => {
            const event = e as DragEvent;
            handleWrapperDragLeave(event);
        });
    }
});

onUnmounted(() => {
    // Cleanup is automatic when element is removed
});
</script>

<template>
    <div ref="nodeRef" class="task-flow-node" :class="{ 'operator-drag-over': isOperatorDragOver }">
        <!-- Connection handles -->
        <Handle type="target" :position="Position.Left" class="handle-left" />

        <!-- TaskCard component with max-width -->
        <div class="task-card-wrapper">
            <TaskCard
                :task="data.task"
                :subtasks="[]"
                :is-dragging="false"
                :hide-metadata="true"
                :hide-prompt="true"
                :hide-extra-actions="true"
                @click="handleClick"
                @execute="handleExecute"
                @previewResult="handlePreviewResult"
                @retry="handleRetry"
                @approve="handleApprove"
                @operatorDrop="handleOperatorDrop"
            />
        </div>

        <Handle type="source" :position="Position.Right" class="handle-right" />
    </div>
</template>

<style scoped>
.task-flow-node {
    position: relative;
    min-width: 280px;
    max-width: 280px;
    pointer-events: auto !important; /* Force pointer events */
}

.task-card-wrapper {
    max-width: 280px;
    pointer-events: auto !important; /* Force pointer events */
}

/* Connection handles */
:deep(.handle-left),
:deep(.handle-right) {
    width: 12px;
    height: 12px;
    background: #3b82f6;
    border: 2px solid white;
    border-radius: 50%;
    cursor: crosshair;
}

:deep(.handle-left):hover,
:deep(.handle-right):hover {
    background: #2563eb;
    transform: scale(1.2);
}

:deep(.handle-left) {
    left: -6px;
}

:deep(.handle-right) {
    right: -6px;
}

.operator-drag-over {
    transform: scale(1.02);
    transition: transform 0.2s;
}
</style>
