<script setup lang="ts">
/**
 * Timeline View
 *
 * Visualizes tasks on a timeline (Gantt Chart)
 */
import { onMounted, computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useProjectStore } from '../stores/projectStore';
import { useTaskStore } from '../stores/taskStore';
import ProjectInfoModal from '../../components/project/ProjectInfoModal.vue';
import TaskDetailPanel from '../../components/task/TaskDetailPanel.vue';
import EnhancedResultPreview from '../../components/task/EnhancedResultPreview.vue';
import GanttChart from '../../components/timeline/GanttChart.vue';
import type { Task } from '@core/types/database';
import { getAPI } from '../../utils/electron';

const route = useRoute();
const router = useRouter();
const projectStore = useProjectStore();
const taskStore = useTaskStore();

// Props
const projectId = computed(() => Number(route.params.id));

// Local state
const showInfoPanel = ref(false);
const viewMode = ref<'standard' | 'swimlane'>('standard');
const zoomLevel = ref<'hour' | 'day' | 'week' | 'month'>('hour');
const selectedTask = ref<Task | null>(null);
const showTaskDetail = ref(false);
const showResultPreview = ref(false);
const firstStartedAtMap = ref<Record<string, string>>({});

// Computed
const project = computed(() => projectStore.currentProject);
const tasks = computed(() => taskStore.tasks);
const loading = computed(() => projectStore.loading || taskStore.loading);

// Actions
function goToBoard() {
    router.push(`/projects/${projectId.value}/board`);
}

function goToOverview() {
    router.push(`/projects/${projectId.value}`);
}

function handleTaskClick(task: Task) {
    selectedTask.value = task;
    showTaskDetail.value = true;
}

function closeTaskDetail() {
    showTaskDetail.value = false;
    selectedTask.value = null;
}

async function handleExecuteTask(task: Task) {
    try {
        await taskStore.executeTask(task.projectId, task.projectSequence);
    } catch (error) {
        console.error('Failed to execute task:', error);
    }
}

async function handleRetry(task: Task, feedback?: string) {
    try {
        console.log(
            '[TimelineView] Retrying task:',
            task.projectId,
            task.projectSequence,
            'Feedback:',
            feedback
        );
        await taskStore.retryTask(task.projectId, task.projectSequence, feedback);
    } catch (error) {
        console.error('Failed to retry task:', error);
    }
}

async function handleApproveTask(task: Task) {
    try {
        await taskStore.approveTask(task.projectId, task.projectSequence);
    } catch (error) {
        console.error('Failed to approve task:', error);
    }
}

function handleViewResults(task: Task) {
    selectedTask.value = task;
    showResultPreview.value = true;
}

function closeResultPreview() {
    showResultPreview.value = false;
}

async function handleProjectInfoUpdate() {
    if (!projectId.value) return;
    await projectStore.fetchProject(projectId.value);
    await taskStore.fetchTasks(projectId.value);
}

// Lifecycle
onMounted(async () => {
    await projectStore.fetchProject(projectId.value);
    await taskStore.fetchTasks(projectId.value);

    // Fetch first started dates
    const api = getAPI();
    if (api.taskHistory?.getFirstStartedAt) {
        try {
            firstStartedAtMap.value = await api.taskHistory.getFirstStartedAt(projectId.value);
        } catch (e) {
            console.error('Failed to fetch first started dates:', e);
        }
    }
});
</script>

<template>
    <div class="flex-1 flex flex-col h-full bg-gray-900 overflow-hidden">
        <!-- Header -->
        <header
            class="border-b border-gray-800 px-6 py-4 flex items-center justify-between shrink-0"
        >
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
                        <h1 class="text-xl font-bold text-white">{{ project?.title }}</h1>
                        <button
                            v-if="project"
                            @click="showInfoPanel = true"
                            class="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                            title="Project Info"
                        >
                            <svg
                                class="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </button>
                    </div>
                    <p class="text-gray-400 text-sm">Timeline View</p>
                </div>
            </div>

            <div class="flex items-center gap-4">
                <!-- Controls -->
                <div class="flex items-center gap-2 border-l border-gray-700 pl-4">
                    <select
                        v-model="viewMode"
                        class="bg-gray-800 text-gray-300 text-sm border border-gray-700 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
                    >
                        <option value="standard">Standard View</option>
                        <option value="swimlane">MCP Swimlanes</option>
                    </select>

                    <select
                        v-model="zoomLevel"
                        class="bg-gray-800 text-gray-300 text-sm border border-gray-700 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500"
                    >
                        <option value="hour">Hour</option>
                        <option value="day">Day</option>
                        <option value="week">Week</option>
                        <option value="month">Month</option>
                    </select>
                </div>

                <!-- View Switcher -->
                <div class="flex bg-gray-800 rounded-lg p-1">
                    <button
                        @click="goToOverview"
                        class="px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white rounded-md transition-colors"
                    >
                        Overview
                    </button>
                    <button
                        @click="goToBoard"
                        class="px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white rounded-md transition-colors"
                    >
                        Kanban
                    </button>
                    <button
                        @click="router.push(`/projects/${projectId}/dag`)"
                        class="px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-white rounded-md transition-colors"
                    >
                        DAG
                    </button>
                    <button
                        class="px-3 py-1.5 text-sm font-medium bg-gray-700 text-white rounded-md shadow-sm transition-colors"
                    >
                        Timeline
                    </button>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main class="flex-1 overflow-hidden relative">
            <div v-if="loading" class="absolute inset-0 flex items-center justify-center">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
            <GanttChart
                v-else
                :tasks="tasks"
                :view-mode="viewMode"
                :zoom-level="zoomLevel"
                :first-started-at-map="firstStartedAtMap"
                class="w-full h-full"
                @task-click="handleTaskClick"
                @execute-task="handleExecuteTask"
                @approve-task="handleApproveTask"
                @view-results="handleViewResults"
            />
            <!-- ... -->
        </main>

        <!-- Project Info Modal -->
        <ProjectInfoModal
            v-if="project"
            :project="project"
            :open="showInfoPanel"
            @close="showInfoPanel = false"
            @update="handleProjectInfoUpdate"
        />

        <!-- Task Detail Panel -->
        <TaskDetailPanel
            v-if="selectedTask"
            :task="selectedTask"
            :open="showTaskDetail"
            @close="closeTaskDetail"
        />

        <!-- Result Preview Panel (Like Kanban) -->
        <EnhancedResultPreview
            v-if="selectedTask"
            :task="selectedTask"
            :open="showResultPreview"
            @close="closeResultPreview"
            @retry="handleRetry"
        />
    </div>
</template>
