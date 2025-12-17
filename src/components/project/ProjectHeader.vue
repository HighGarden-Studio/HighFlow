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
}

const props = withDefaults(defineProps<Props>(), {
    showProjectInfo: true,
    showConnectionMode: false,
    showNewTask: false,
    isConnectionMode: false,
});

const emit = defineEmits<{
    (e: 'projectInfo'): void;
    (e: 'newTask'): void;
    (e: 'toggleConnection'): void;
}>();

const router = useRouter();
const isGlobalPaused = ref(false);

const viewLabel = computed(() => {
    switch (props.currentView) {
        case 'overview':
            return 'Overview';
        case 'board':
            return 'Kanban Board';
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
            await api.taskExecution.resumeAll();
            isGlobalPaused.value = false;
        } else {
            await api.taskExecution.pauseAll();
            isGlobalPaused.value = true;
        }
    } catch (err) {
        console.error('Failed to toggle pause:', err);
    }
}

onMounted(async () => {
    try {
        const api = (window as any).electron;
        isGlobalPaused.value = await api.taskExecution.getGlobalPauseStatus();
    } catch (err) {
        console.warn('Failed to get global pause status:', err);
    }
});
</script>

<template>
    <header class="border-b border-gray-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-4">
            <button
                @click="router.push('/projects')"
                class="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
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
                        @click="emit('projectInfo')"
                        class="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                        title="Project Info"
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
                </div>
                <p class="text-gray-400 text-sm">{{ viewLabel }}</p>
            </div>
        </div>

        <div class="flex items-center gap-4">
            <!-- Global Pause Toggle -->
            <button
                @click="togglePause"
                class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shadow-sm"
                :class="
                    isGlobalPaused
                        ? 'bg-amber-600 text-white hover:bg-amber-700'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                "
                :title="isGlobalPaused ? 'Resume All Tasks' : 'Pause All Tasks'"
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

            <!-- View Switcher -->
            <div class="flex bg-gray-800 rounded-lg p-1">
                <button
                    @click="router.push(`/projects/${projectId}`)"
                    :class="[
                        'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                        currentView === 'overview'
                            ? 'bg-gray-700 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white',
                    ]"
                >
                    Overview
                </button>
                <button
                    @click="router.push(`/projects/${projectId}/board`)"
                    :class="[
                        'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                        currentView === 'board'
                            ? 'bg-gray-700 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white',
                    ]"
                >
                    Board
                </button>
                <button
                    @click="router.push(`/projects/${projectId}/timeline`)"
                    :class="[
                        'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                        currentView === 'timeline'
                            ? 'bg-gray-700 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white',
                    ]"
                >
                    Timeline
                </button>
                <button
                    @click="router.push(`/projects/${projectId}/dag`)"
                    :class="[
                        'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                        currentView === 'dag'
                            ? 'bg-gray-700 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white',
                    ]"
                >
                    DAG
                </button>
            </div>

            <!-- Connection Mode Toggle (Board only) -->
            <button
                v-if="showConnectionMode"
                @click="emit('toggleConnection')"
                class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                :class="
                    isConnectionMode
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                "
            >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                    />
                </svg>
                {{ isConnectionMode ? 'Connecting...' : 'Connect Tasks' }}
            </button>

            <!-- New Task Button (Board only) -->
            <button
                v-if="showNewTask"
                @click="emit('newTask')"
                class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
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
        </div>
    </header>
</template>

<style scoped>
/* Styles are inline with Tailwind */
</style>
