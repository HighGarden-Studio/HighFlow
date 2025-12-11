<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import TaskCard from '../board/TaskCard.vue';
import type { Task } from '@core/types/database';

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
}>();

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
</script>

<template>
    <div class="task-flow-node">
        <!-- Connection handles -->
        <Handle type="target" :position="Position.Left" class="handle-left" />

        <!-- TaskCard component with max-width -->
        <div class="task-card-wrapper" @click="handleClick">
            <TaskCard
                :task="data.task"
                :subtasks="[]"
                :is-dragging="false"
                :hide-metadata="true"
                :hide-prompt="true"
                :hide-extra-actions="true"
                @execute="handleExecute"
                @previewResult="handlePreviewResult"
                @retry="handleRetry"
                @approve="handleApprove"
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
}

.task-card-wrapper {
    max-width: 280px;
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
</style>
