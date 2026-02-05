<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

interface Props {
    projectId: number;
    projectTitle?: string;
    currentView: 'overview' | 'board' | 'timeline' | 'dag';
    showProjectInfo?: boolean;
    showConnectionMode?: boolean;
    showNewTask?: boolean;
    isConnectionMode?: boolean;
    baseDevFolder?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
    projectTitle: '',
    showProjectInfo: true,
    showConnectionMode: false,
    showNewTask: false,
    isConnectionMode: false,
    baseDevFolder: null,
});

const emit = defineEmits<{
    (e: 'projectInfo'): void;
    (e: 'newTask'): void;
    (e: 'toggleConnection'): void;
    (e: 'openWorkspace'): void;
}>();

const router = useRouter();
const isGlobalPaused = ref(false);

const viewLabel = computed(() => {
    switch (props.currentView) {
        case 'overview':
            return 'Overview';
        case 'board':
            return 'Kanban';
        case 'timeline':
            return 'Timeline';
        case 'dag':
            return 'DAG View';
        default:
            return 'Project';
    }
});

async function togglePause() {
    try {
        const api = (window as any).electron;
        if (isGlobalPaused.value) {
            await api.taskExecution.resumeAll(props.projectId);
            isGlobalPaused.value = false;
        } else {
            await api.taskExecution.pauseAll(props.projectId);
            isGlobalPaused.value = true;
        }
    } catch (err) {
        console.error('Failed to toggle pause:', err);
    }
}

onMounted(async () => {
    try {
        const api = (window as any).electron;
        isGlobalPaused.value = await api.taskExecution.getGlobalPauseStatus(props.projectId);
    } catch (err) {
        console.warn('Failed to get global pause status:', err);
    }
});
</script>

<template>
    <header class="border-b border-gray-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-4">
            <button
                class="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                @click="router.push('/projects')"
            >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10 19l-7-7m0 0l7-7m-7 7h18"
                    />
                </svg>
            </button>
            <div class="flex flex-col">
                <div class="flex items-center gap-2">
                    <h1 class="text-xl font-bold text-white">{{ projectTitle }}</h1>
                    <button
                        v-if="showProjectInfo"
                        class="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                        title="Project Info"
                        @click="emit('projectInfo')"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                    </button>
                    <!-- Project Workspace Button -->
                    <button
                        v-if="baseDevFolder"
                        class="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                        title="Project Workspace"
                        @click="emit('openWorkspace')"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                            />
                        </svg>
                    </button>
                </div>
                <p class="text-gray-400 text-sm">{{ viewLabel }}</p>
            </div>
        </div>

        <div class="flex items-center gap-4">
            <!-- Global Pause Toggle -->
            <button
                class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
                :class="
                    isGlobalPaused
                        ? 'bg-amber-600 text-white hover:bg-amber-700'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                "
                :title="isGlobalPaused ? 'Resume All Tasks' : 'Pause All Tasks'"
                @click="togglePause"
            >
                <svg
                    v-if="!isGlobalPaused"
                    class="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
                <svg v-else class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                </svg>
                {{ isGlobalPaused ? 'Resume All' : 'Pause All' }}
            </button>

            <!-- New Task Button (Board only) -->
            <button
                v-if="showNewTask"
                class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                @click="emit('newTask')"
            >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 4v16m8-8H4"
                    />
                </svg>
                New Task
            </button>

            <!-- View Switcher -->
            <div class="bg-gray-800 rounded-lg p-1">
                <button
                    :class="[
                        'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                        currentView === 'overview'
                            ? 'bg-gray-700 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white',
                    ]"
                    @click="router.push(`/projects/${projectId}`)"
                >
                    Overview
                </button>
                <button
                    :class="[
                        'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                        currentView === 'board'
                            ? 'bg-gray-700 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white',
                    ]"
                    @click="router.push(`/projects/${projectId}/board`)"
                >
                    Kanban
                </button>
                <button
                    :class="[
                        'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                        currentView === 'dag'
                            ? 'bg-gray-700 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white',
                    ]"
                    @click="router.push(`/projects/${projectId}/dag`)"
                >
                    DAG
                </button>
                <button
                    :class="[
                        'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                        currentView === 'timeline'
                            ? 'bg-gray-700 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white',
                    ]"
                    @click="router.push(`/projects/${projectId}/timeline`)"
                >
                    Timeline
                </button>
            </div>
        </div>
    </header>
</template>

<style scoped>
/* Styles are inline with Tailwind */
</style>
