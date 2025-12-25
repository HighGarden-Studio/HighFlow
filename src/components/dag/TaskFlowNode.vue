<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import TaskCard from '../board/TaskCard.vue';
import type { Task } from '@core/types/database';
import { ref, computed, onMounted, onUnmounted } from 'vue';

interface Props {
    data: {
        task: Task;
        taskKey?: string; // Optional key to force TaskCard remount
    };
}

const props = defineProps<Props>();

// Emit events to parent
const emit = defineEmits<{
    (e: 'click', task: Task): void;
    (e: 'execute', task: Task): void;
    (e: 'previewResult', task: Task): void;
    (e: 'previewStream', task: Task): void;
    (e: 'viewHistory', task: Task): void;
    (e: 'retry', task: Task): void;
    (e: 'approve', task: Task): void;
    (e: 'stop', task: Task): void;
    (e: 'delete', task: Task): void;
    (e: 'operatorDrop', taskId: number, operatorId: number): void;
    (e: 'provideInput', task: Task): void;
    // New events synced with Kanban Board
    (e: 'edit', task: Task): void;
    (e: 'subdivide', task: Task): void;
    (e: 'pause', task: Task): void;
    (e: 'resume', task: Task): void;
    (e: 'enhancePrompt', task: Task): void;
    (e: 'previewPrompt', task: Task): void;
    (e: 'viewProgress', task: Task): void;
    (e: 'openApproval', task: Task): void;
    (e: 'connectProvider', providerId: string): void;
}>();

// Operator drag state
const isOperatorDragOver = ref(false);

// Computed: Check if this is an Input task waiting for user input
const isInputTaskWaiting = computed(() => {
    return (
        props.data.task.taskType === 'input' &&
        props.data.task.status === 'in_progress' &&
        props.data.task.inputSubStatus === 'WAITING_USER'
    );
});

function handleClick() {
    emit('click', props.data.task);
}

function handleExecute() {
    emit('execute', props.data.task);
}

function handlePreviewResult() {
    emit('previewResult', props.data.task);
}

function handlePreviewStream() {
    emit('previewStream', props.data.task);
}

function handleViewHistory() {
    emit('viewHistory', props.data.task);
}

function handleRetry() {
    emit('retry', props.data.task);
}

function handleApprove() {
    emit('approve', props.data.task);
}

function handleEdit() {
    emit('edit', props.data.task);
}

function handleSubdivide() {
    emit('subdivide', props.data.task);
}

function handlePause() {
    emit('pause', props.data.task);
}

function handleResume() {
    emit('resume', props.data.task);
}

function handleEnhancePrompt() {
    emit('enhancePrompt', props.data.task);
}

function handlePreviewPrompt() {
    emit('previewPrompt', props.data.task);
}

function handleViewProgress() {
    emit('viewProgress', props.data.task);
}

function handleOpenApproval() {
    emit('openApproval', props.data.task);
}

function handleConnectProvider(providerId: string) {
    emit('connectProvider', providerId);
}

function handleOperatorDrop(taskId: number, operatorId: number) {
    emit('operatorDrop', taskId, operatorId);
}

function handleProvideInput() {
    emit('provideInput', props.data.task);
}

function handleStop() {
    emit('stop', props.data.task);
}

function handleDelete() {
    emit('delete', props.data.task);
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
    }
}

function handleWrapperDragLeave(event: DragEvent) {
    isOperatorDragOver.value = false;
}

function handleWrapperDrop(event: DragEvent) {
    const operatorData = event.dataTransfer?.getData('application/x-operator');

    if (operatorData) {
        event.preventDefault();
        // Don't stopPropagation - let parent wrapper handle it too
        isOperatorDragOver.value = false;

        try {
            const operator = JSON.parse(operatorData);
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
        // Try mouseup event instead of drop for better compatibility
        nodeRef.value.addEventListener('mouseup', (e: Event) => {
            // Check if this is the end of a drag operation
            if (isOperatorDragOver.value) {
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

        <!-- Status Icon Overlay -->
        <div class="status-icon-overlay">
            <!-- Input Task Waiting for User Input -->
            <div v-if="isInputTaskWaiting" class="status-icon waiting-input">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    ></path>
                </svg>
            </div>

            <!-- Executing (AI tasks) -->
            <div v-else-if="data.task.status === 'in_progress'" class="status-icon executing">
                <svg class="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle
                        class="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                    ></circle>
                    <path
                        class="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                </svg>
            </div>
            <div v-else-if="data.task.status === 'done'" class="status-icon done">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                    ></path>
                </svg>
            </div>
            <div v-else-if="data.task.status === 'in_review'" class="status-icon review">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    ></path>
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    ></path>
                </svg>
            </div>
            <div v-else-if="data.task.status === 'blocked'" class="status-icon blocked">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                    ></path>
                </svg>
            </div>
        </div>

        <!-- TaskCard component with max-width -->
        <div class="task-card-wrapper">
            <TaskCard
                :key="data.taskKey || data.task.id"
                :task="data.task"
                :subtasks="[]"
                :is-dragging="false"
                :hide-prompt="true"
                :hide-prompt-actions="true"
                :hide-extra-actions="false"
                :hide-connection-handles="true"
                @click="handleClick"
                @execute="handleExecute"
                @preview-result="handlePreviewResult"
                @preview-stream="handlePreviewStream"
                @view-history="handleViewHistory"
                @retry="handleRetry"
                @approve="handleApprove"
                @stop="handleStop"
                @delete="handleDelete"
                @operator-drop="handleOperatorDrop"
                @provide-input="handleProvideInput"
                @edit="handleEdit"
                @subdivide="handleSubdivide"
                @pause="handlePause"
                @resume="handleResume"
                @enhance-prompt="handleEnhancePrompt"
                @preview-prompt="handlePreviewPrompt"
                @view-progress="handleViewProgress"
                @open-approval="handleOpenApproval"
                @connect-provider="handleConnectProvider"
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
    background: #374151; /* Match task card border color (gray-700) */
    border: none; /* Remove white border */
    border-radius: 50%;
    cursor: crosshair;
    transition: all 0.3s ease;
}

:deep(.handle-left):hover,
:deep(.handle-right):hover {
    background: #3b82f6; /* Blue on hover */
    animation: handlePulse 1.5s ease-in-out infinite;
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3);
}

:deep(.handle-left):hover {
    transform: scale(1.3) translate(-5px, -5px); /* Move left and up */
}

:deep(.handle-right):hover {
    transform: scale(1.3) translate(5px, -5px); /* Move right and up */
}

@keyframes handlePulse {
    0%,
    100% {
        box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.3);
    }
    50% {
        box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.5);
    }
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

/* Status icon overlay */
.status-icon-overlay {
    position: absolute;
    top: -8px;
    right: -8px;
    z-index: 10;
    pointer-events: none;
}

.status-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid rgb(31, 41, 55);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.status-icon.executing {
    background: linear-gradient(135deg, #3b82f6, #60a5fa);
    color: white;
}

.status-icon.done {
    background: linear-gradient(135deg, #10b981, #34d399);
    color: white;
}

.status-icon.review {
    background: linear-gradient(135deg, #f59e0b, #fbbf24);
    color: white;
}

.status-icon.blocked {
    background: linear-gradient(135deg, #ef4444, #f87171);
    color: white;
}

.status-icon.waiting-input {
    background: linear-gradient(135deg, #f59e0b, #fbbf24);
    color: white;
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
    0%,
    100% {
        opacity: 1;
    }
    50% {
        opacity: 0.7;
    }
}

.animate-spin {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

/* Better rotating border animation for DAG view - using sliding gradient */
:deep(.task-pulse-border) {
    position: relative;
    border: 4px solid transparent !important;
    background-image:
        linear-gradient(rgb(31, 41, 55), rgb(31, 41, 55)),
        linear-gradient(90deg, #3b82f6, #60a5fa, #93c5fd, #60a5fa, #3b82f6, #60a5fa, #3b82f6);
    background-origin: border-box;
    background-clip: padding-box, border-box;
    background-size:
        100% 100%,
        400% 100%;
    animation: rotate-border 3s linear infinite !important;
    box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
}

@keyframes rotate-border {
    0% {
        background-position: 0% 50%;
    }
    100% {
        background-position: 400% 50%;
    }
}
</style>
