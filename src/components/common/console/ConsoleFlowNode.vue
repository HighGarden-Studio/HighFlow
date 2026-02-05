<template>
    <div
        class="console-flow-node p-2 bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 min-w-[350px]"
    >
        <ConsoleTaskCard
            :task-id="data.taskId"
            :sequence="data.sequence"
            :title="data.title"
            :status="data.status"
            :start-time="data.startTime"
            :end-time="data.endTime"
            :transcript="data.transcript"
        />
        <Handle type="target" :position="Position.Top" class="custom-handle" />
        <Handle type="source" :position="Position.Bottom" class="custom-handle" />
    </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import ConsoleTaskCard from './ConsoleTaskCard.vue';
import type { ConsoleEvent } from '../../../renderer/stores/consoleStore';

defineProps<{
    data: {
        taskId: string;
        sequence: number;
        title: string;
        status: string;
        startTime: number;
        endTime?: number;
        transcript: ConsoleEvent[];
    };
}>();
</script>

<style scoped>
.custom-handle {
    background-color: #555;
    width: 8px;
    height: 8px;
}
</style>
