<script setup lang="ts">
import { ref, computed } from 'vue';

interface FileTreeNode {
    name: string;
    path: string;
    type: 'file' | 'folder';
    children?: FileTreeNode[];
    status?: 'created' | 'modified';
}

const props = defineProps<{
    node: FileTreeNode;
    depth?: number;
    selectedPath?: string;
}>();

const emit = defineEmits<{
    (e: 'select', path: string): void;
}>();

const isOpen = ref(true);
const currentDepth = computed(() => props.depth || 0);

function toggle() {
    if (props.node.type === 'folder') {
        isOpen.value = !isOpen.value;
    } else {
        emit('select', props.node.path);
    }
}

function handleSelect(path: string) {
    emit('select', path);
}

// Icon selection
const icon = computed(() => {
    if (props.node.type === 'folder') {
        return isOpen.value
            ? 'M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H5z' // Folder Open
            : 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z'; // Folder Closed
    }
    return 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z'; // File
});

const isSelected = computed(() => props.node.path === props.selectedPath);
</script>

<template>
    <div class="select-none">
        <div
            class="flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-sm"
            :class="[
                'min-w-fit w-max',
                isSelected
                    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
            ]"
            :style="{ paddingLeft: `${currentDepth * 12 + 8}px` }"
            @click.stop="toggle"
            :title="node.path"
        >
            <!-- Toggle Arrow for Folders -->
            <span
                v-if="node.type === 'folder'"
                class="text-gray-400 transition-transform duration-200"
                :class="{ 'rotate-90': isOpen }"
            >
                <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5l7 7-7 7"
                    />
                </svg>
            </span>
            <span v-else class="w-3" />

            <!-- Icon -->
            <svg
                class="w-4 h-4 flex-shrink-0"
                :class="node.type === 'folder' ? 'text-yellow-500' : 'text-gray-400'"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    :d="icon"
                    :fill="node.type === 'folder' ? 'currentColor' : 'none'"
                />
            </svg>

            <!-- Name -->
            <span class="whitespace-nowrap flex-1">{{ node.name }}</span>

            <!-- Status Indicator -->
            <span
                v-if="node.status"
                class="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ml-2"
                :class="{
                    'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300':
                        node.status === 'created',
                    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300':
                        node.status === 'modified',
                }"
            >
                {{ node.status === 'created' ? 'N' : 'M' }}
            </span>
        </div>

        <!-- Recursion -->
        <div v-if="node.type === 'folder' && isOpen">
            <FileTreeItem
                v-for="child in node.children"
                :key="child.path"
                :node="child"
                :depth="currentDepth + 1"
                :selected-path="selectedPath"
                @select="handleSelect"
            />
        </div>
    </div>
</template>
