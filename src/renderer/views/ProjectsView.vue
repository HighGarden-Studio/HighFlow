<script setup lang="ts">
/**
 * Projects View
 *
 * Main projects listing page with task summary
 */
import { onMounted, onUnmounted, computed, ref, reactive, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useProjectStore } from '../stores/projectStore';
import { useTaskStore } from '../stores/taskStore';
import { useSettingsStore } from '../stores/settingsStore';
import { getAPI } from '../../utils/electron';
import type { Task } from '@core/types/database';
import ProjectCreationWizard from '../../components/project/ProjectCreationWizard.vue';
import ProjectInfoModal from '../../components/project/ProjectInfoModal.vue';
import IconRenderer from '../../components/common/IconRenderer.vue';
import { getProviderIcon } from '../../utils/iconMapping';

const router = useRouter();
const projectStore = useProjectStore();
const taskStore = useTaskStore();
const settingsStore = useSettingsStore();

// Local state
const searchQuery = ref('');
const showCreateModal = ref(false);
const showAIWizard = ref(false);
const newProjectTitle = ref('');
const newProjectDescription = ref('');
const creating = ref(false);
const deletingProjectId = ref<number | null>(null);
const showDeleteConfirm = ref(false);
const projectToDelete = ref<any>(null);

// Project Info Modal state
const showProjectInfoModal = ref(false);
const selectedProjectForInfo = ref<any>(null);

// Task summaries per project
interface TaskSummary {
    total: number;
    todo: number;
    inProgress: number;
    inConfirm: number;
    inReview: number;
    needsApproval: number;
    done: number;
    blocked: number;
    unreadResults: number;
    progressPercent: number;
}

const taskSummaries = reactive<Record<number, TaskSummary>>({});
const loadingSummaries = ref(false);

// Computed
const projects = computed(() => {
    if (!searchQuery.value) return projectStore.activeProjects;
    const query = searchQuery.value.toLowerCase();
    return projectStore.activeProjects.filter(
        (p) => p.title.toLowerCase().includes(query) || p.description?.toLowerCase().includes(query)
    );
});

// Helper to fetch summary for a single project
async function fetchProjectSummary(project: any) {
    if (!project?.id) return;
    const api = getAPI();
    try {
        const tasks: Task[] = await api.tasks.list(project.id);
        const summary: TaskSummary = {
            total: tasks.length,
            todo: tasks.filter((t) => t.status === 'todo').length,
            inProgress: tasks.filter((t) => t.status === 'in_progress').length,
            inConfirm: tasks.filter((t) => t.status === 'in_progress' && t.isPaused).length,
            needsApproval: tasks.filter((t) => t.status === 'needs_approval').length,
            inReview: tasks.filter((t) => t.status === 'in_review').length,
            done: tasks.filter((t) => t.status === 'done').length,
            blocked: tasks.filter((t) => t.status === 'blocked' || t.status === 'failed').length,
            unreadResults: tasks.filter((t) => {
                if (t.hasUnreadResult)
                    console.log(
                        '[ProjectsView] Unread task detected:',
                        t.id,
                        t.title,
                        t.hasUnreadResult
                    );
                return t.hasUnreadResult;
            }).length,
            progressPercent:
                tasks.length > 0
                    ? Math.round(
                          (tasks.filter((t) => t.status === 'done').length / tasks.length) * 100
                      )
                    : 0,
        };
        taskSummaries[project.id] = summary;
    } catch (e) {
        console.error(`Failed to fetch task summary for project ${project.id}:`, e);
    }
}

// Fetch task summaries for all projects
async function fetchTaskSummaries() {
    loadingSummaries.value = true;
    try {
        await Promise.all(projectStore.activeProjects.map((p) => fetchProjectSummary(p)));
    } catch (e) {
        console.error('Failed to fetch task summaries:', e);
    } finally {
        loadingSummaries.value = false;
    }
}

// Watch for project changes and refetch summaries
watch(
    () => projectStore.activeProjects,
    () => {
        fetchTaskSummaries();
    },
    { deep: true }
);

// Helper to get provider display name
function getProviderDisplayName(providerId: string | null): string {
    if (!providerId) return '';
    // Special handling for legacy/migration
    if (providerId === 'default-highflow') return 'HighFlow';

    const provider = settingsStore.aiProviders.find((p) => p.id === providerId);
    return provider ? provider.name : providerId;
}

// Lifecycle
let cleanupListeners: (() => void) | undefined;
let cleanupTaskCompletionListener: (() => void) | undefined;
let cleanupTaskListeners: (() => void)[] = [];

onMounted(async () => {
    await projectStore.fetchProjects();
    cleanupListeners = projectStore.initEventListeners();
    await fetchTaskSummaries();

    // Listen for task completion to update summaries
    const api = getAPI();

    // Register task update listeners
    if (api.events && api.events.on) {
        // Task Updated
        const unlistenUpdate = api.events.on('task:updated', (task: any) => {
            if (task && task.projectId) {
                // Find project to verify it exists in active projects
                const project = projectStore.activeProjects.find((p) => p.id === task.projectId);
                if (project) {
                    fetchProjectSummary(project);
                }
            }
        });
        cleanupTaskListeners.push(unlistenUpdate);

        // Task Created
        const unlistenCreate = api.events.on('task:created', (task: any) => {
            if (task && task.projectId) {
                const project = projectStore.activeProjects.find((p) => p.id === task.projectId);
                if (project) {
                    fetchProjectSummary(project);
                }
            }
        });
        cleanupTaskListeners.push(unlistenCreate);

        // Task Deleted
        const unlistenDelete = api.events.on('task:deleted', (data: any) => {
            const projectId = data.projectId || data.taskProjectId;
            if (projectId) {
                const project = projectStore.activeProjects.find((p) => p.id === projectId);
                if (project) {
                    fetchProjectSummary(project);
                }
            }
        });
        cleanupTaskListeners.push(unlistenDelete);

        // Task Status Changed
        const unlistenStatus = api.events.on('task:status-changed', (data: any) => {
            if (data && data.projectId) {
                const project = projectStore.activeProjects.find((p) => p.id === data.projectId);
                if (project) {
                    fetchProjectSummary(project);
                }
            }
        });
        cleanupTaskListeners.push(unlistenStatus);

        // Task Execution Failed
        const unlistenFailed = api.events.on('taskExecution:failed', (data: any) => {
            if (data && data.projectId) {
                const project = projectStore.activeProjects.find((p) => p.id === data.projectId);
                if (project) {
                    fetchProjectSummary(project);
                }
            }
        });
        cleanupTaskListeners.push(unlistenFailed);
    }

    if (api.taskExecution) {
        cleanupTaskCompletionListener = api.taskExecution.onCompleted(
            async (data: { projectId: number; projectSequence: number; result: any }) => {
                console.log('[ProjectsView] Task completed, refreshing summaries:', data);
                // Also refresh summary for this project
                const project = projectStore.activeProjects.find((p) => p.id === data.projectId);
                if (project) {
                    await fetchProjectSummary(project);
                }
            }
        );
    }
});

onUnmounted(() => {
    if (cleanupListeners) {
        cleanupListeners();
    }
    if (cleanupTaskCompletionListener) {
        cleanupTaskCompletionListener();
    }
    // Cleanup task listeners
    cleanupTaskListeners.forEach((cleanup) => cleanup());
    cleanupTaskListeners = [];
});

// Actions
async function handleCreateProject() {
    if (!newProjectTitle.value.trim()) return;

    creating.value = true;
    try {
        const project = await projectStore.createProject({
            title: newProjectTitle.value.trim(),
            description: newProjectDescription.value.trim() || undefined,
            ownerId: 1, // Default user for now
            baseDevFolder: undefined,
        });

        if (project) {
            showCreateModal.value = false;
            newProjectTitle.value = '';
            newProjectDescription.value = '';
            router.push(`/projects/${project.id}/board`);
        }
    } finally {
        creating.value = false;
    }
}

function openProject(projectId: number) {
    router.push(`/projects/${projectId}/board`);
}

function openProjectInfo(project: any, event: Event) {
    event.stopPropagation();
    selectedProjectForInfo.value = project;
    showProjectInfoModal.value = true;
}

async function handleDeleteProject(project: any, event: Event) {
    event.stopPropagation();
    if (deletingProjectId.value !== null) return;
    projectToDelete.value = project;
    showDeleteConfirm.value = true;
}

async function confirmDeleteProject() {
    if (!projectToDelete.value) return;
    deletingProjectId.value = projectToDelete.value.id;
    try {
        const success = await projectStore.deleteProject(projectToDelete.value.id);
        if (success) {
            await fetchTaskSummaries();
        }
    } catch (e) {
        console.error('Failed to delete project:', e);
    } finally {
        deletingProjectId.value = null;
        showDeleteConfirm.value = false;
        projectToDelete.value = null;
    }
}

function cancelDeleteProject() {
    showDeleteConfirm.value = false;
    projectToDelete.value = null;
}

function closeProjectInfoModal() {
    showProjectInfoModal.value = false;
    selectedProjectForInfo.value = null;
}

async function handleProjectInfoUpdate() {
    if (selectedProjectForInfo.value) {
        await fetchProjectSummary(selectedProjectForInfo.value);
        await projectStore.fetchProjects();
    }
}

// Import Project
const fileInput = ref<HTMLInputElement | null>(null);

function triggerImport() {
    fileInput.value?.click();
}

async function handleImportProject(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Basic validation
        if (!data.version || !data.project || !data.tasks) {
            throw new Error('Invalid project file format');
        }

        const project = await projectStore.importProject(data);
        if (project) {
            await fetchTaskSummaries();
        }
    } catch (error) {
        console.error('Failed to import project:', error);
        alert(
            'Failed to import project: ' +
                (error instanceof Error ? error.message : 'Unknown error')
        );
    } finally {
        // Reset input
        if (fileInput.value) {
            fileInput.value.value = '';
        }
    }
}

async function handleAIWizardCreated(projectData: any) {
    creating.value = true;
    try {
        console.log('[ProjectsView] Creating project with data:', projectData);

        // Create the project with ALL fields from projectData
        const project = await projectStore.createProject({
            title: projectData.title,
            description: projectData.description,
            ownerId: 1, // Default user for now
            baseDevFolder: projectData.baseDevFolder,
            projectGuidelines: projectData.projectGuidelines || projectData.aiGuidelines,
            aiProvider: projectData.aiProvider,
            aiModel: projectData.aiModel,
            mcpConfig: projectData.mcpConfig,
            technicalStack: projectData.technicalStack,
            aiGuidelines: projectData.aiGuidelines,
            executionPlan: projectData.executionPlan,
            metadata: projectData.metadata,
        });

        if (project) {
            // Create all tasks for the project with "todo" status
            if (projectData.executionPlan) {
                await taskStore.createTasksFromExecutionPlan(project.id, projectData.executionPlan);
            } else if (projectData.tasks && projectData.tasks.length > 0) {
                // 1. First Pass: Create all tasks
                const titleToIdMap = new Map<string, number>();
                const createdTasks: any[] = []; // Store created tasks for second pass

                for (const task of projectData.tasks) {
                    const createdTask = await taskStore.createTask({
                        projectId: project.id,
                        title: task.title,
                        description: task.description || '',
                        status: 'todo',
                        priority: task.priority || 'medium',
                        aiProvider: task.aiProvider,
                        estimatedMinutes: task.estimatedMinutes,
                        outputFormat: task.outputFormat || 'markdown',
                        codeLanguage: task.codeLanguage,
                        generatedPrompt: task.promptTemplate,
                        aiOptimizedPrompt: task.aiOptimizedPrompt,
                        tags: task.tags,
                        taskType: task.taskType,
                        // Don't set triggerConfig yet, as we need dependencies resolved
                    });

                    if (createdTask) {
                        titleToIdMap.set(task.title, createdTask.projectSequence);
                        createdTasks.push(createdTask);
                    } else {
                        createdTasks.push(null); // Keep index alignment
                    }
                }

                // 2. Second Pass: Resolve dependencies and set trigger/auto-execute
                for (let i = 0; i < projectData.tasks.length; i++) {
                    const taskData = projectData.tasks[i];
                    const createdTask = createdTasks[i];

                    if (!createdTask) continue;

                    const updates: any = {};
                    const dependencyTitles = taskData.dependencies || [];
                    const dependencyIds: number[] = [];

                    // Resolve string titles to IDs
                    for (const title of dependencyTitles) {
                        const id = titleToIdMap.get(title);
                        if (id) dependencyIds.push(id);
                    }

                    if (dependencyIds.length > 0) {
                        updates.dependencies = dependencyIds;
                    }

                    // Set Auto-Execute / Trigger Config
                    if (taskData.autoExecute) {
                        updates.triggerConfig = {
                            type: 'dependency',
                            dependsOn: {
                                operator: 'all',
                                executionPolicy: 'repeat',
                                taskIds: dependencyIds,
                            },
                        };
                    } else if (dependencyIds.length > 0) {
                        // Even if not auto-execute, but has dependencies, we might want to link them?
                        // But triggerConfig implies automation. Explicit dependencies list is enough for visual graph.
                        // However, if we want strict blocking, we might use triggerConfig without repeat?
                        // For now, only set triggerConfig if autoExecute is requested.
                    }

                    if (Object.keys(updates).length > 0) {
                        await taskStore.updateTask(
                            project.id,
                            createdTask.projectSequence,
                            updates
                        );
                    }
                }
            }

            showAIWizard.value = false;
            router.push(`/projects/${project.id}/board`);
        }
    } catch (error) {
        console.error('Failed to create project:', error);
    } finally {
        creating.value = false;
    }
}

// Lifecycle
</script>

<style scoped>
@keyframes pulse-border {
    0%,
    100% {
        border-color: rgba(234, 179, 8, 0.5);
        box-shadow: 0 0 0 0 rgba(234, 179, 8, 0);
    }
    50% {
        border-color: rgba(234, 179, 8, 1);
        box-shadow: 0 0 16px 2px rgba(234, 179, 8, 0.4);
    }
}

.unread-results-pulse {
    animation: pulse-border 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>

<template>
    <div class="flex-1 flex flex-col h-full bg-gray-900">
        <!-- Header -->
        <header class="border-b border-gray-800 px-6 py-4">
            <div class="flex items-center justify-between">
                <div>
                    <h1 class="text-2xl font-bold text-white">{{ $t('nav.projects') }}</h1>
                    <p class="text-gray-400 text-sm mt-1">Manage your AI-powered projects</p>
                </div>
                <div class="flex items-center gap-2">
                    <button
                        @click="showAIWizard = true"
                        class="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-all shadow-lg shadow-purple-500/20"
                    >
                        <span class="text-lg">✨</span>
                        {{ $t('project.create.button') }}
                    </button>
                    <button
                        @click="triggerImport"
                        class="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                            />
                        </svg>
                        {{ $t('project.create.import') }}
                    </button>
                    <input
                        ref="fileInput"
                        type="file"
                        accept=".json"
                        class="hidden"
                        @change="handleImportProject"
                    />
                    <button
                        @click="showCreateModal = true"
                        class="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M12 4v16m8-8H4"
                            />
                        </svg>
                        {{ $t('project.create.empty') }}
                    </button>
                </div>
            </div>

            <!-- Search -->
            <div class="mt-4">
                <div class="relative">
                    <svg
                        class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                    </svg>
                    <input
                        v-model="searchQuery"
                        type="text"
                        :placeholder="$t('project.list.search_placeholder')"
                        class="w-full max-w-md pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
            </div>
        </header>

        <!-- Content -->
        <main class="flex-1 overflow-y-auto p-6">
            <!-- Loading -->
            <div v-if="projectStore.loading" class="flex items-center justify-center h-64">
                <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>

            <!-- Empty State -->
            <div
                v-else-if="projects.length === 0"
                class="flex flex-col items-center justify-center h-64 text-center"
            >
                <svg
                    class="w-16 h-16 text-gray-600 mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                    />
                </svg>
                <h3 class="text-lg font-medium text-gray-300 mb-2">
                    {{ $t('project.list.empty_title') }}
                </h3>
                <p class="text-gray-500 mb-4">{{ $t('project.list.empty_desc') }}</p>
                <div class="flex items-center gap-3">
                    <button
                        @click="showAIWizard = true"
                        class="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-all"
                    >
                        <span>✨</span>
                        {{ $t('project.list.ai_start') }}
                    </button>
                    <button
                        @click="showCreateModal = true"
                        class="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                    >
                        {{ $t('project.create.empty') }}
                    </button>
                </div>
            </div>

            <!-- Project List (Row Layout) -->
            <div v-else class="space-y-3">
                <div
                    v-for="project in projects"
                    :key="project.id"
                    @click="openProject(project.id)"
                    class="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-blue-500 cursor-pointer transition-all group"
                    :class="{
                        'unread-results-pulse': (taskSummaries[project.id]?.unreadResults || 0) > 0,
                    }"
                >
                    <div class="flex items-center gap-4">
                        <!-- Project Icon & Info -->
                        <div class="flex items-center gap-4 flex-1 min-w-0">
                            <div
                                class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                                :style="{ backgroundColor: project.color || '#3B82F6' }"
                            >
                                {{ project.emoji || '📁' }}
                            </div>

                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-3">
                                    <h3
                                        class="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors truncate"
                                    >
                                        {{ project.title }}
                                    </h3>
                                    <!-- AI Provider Badge -->
                                    <span
                                        v-if="project.aiProvider"
                                        class="flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300 border border-purple-500/20 border-opacity-50"
                                        :title="$t('project.card.ai_model_title')"
                                    >
                                        <IconRenderer
                                            :icon="getProviderIcon(project.aiProvider)"
                                            class="w-3.5 h-3.5"
                                        />
                                        {{ getProviderDisplayName(project.aiProvider) }}
                                    </span>
                                    <span
                                        class="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                                        :class="{
                                            'bg-green-500/20 text-green-400':
                                                project.status === 'active',
                                            'bg-yellow-500/20 text-yellow-400':
                                                project.status === 'on_hold',
                                            'bg-blue-500/20 text-blue-400':
                                                project.status === 'completed',
                                        }"
                                    >
                                        {{ project.status }}
                                    </span>
                                </div>
                                <p class="text-gray-400 text-sm mt-0.5 truncate">
                                    {{ project.description || 'No description' }}
                                </p>
                                <!-- Base Dev Folder -->
                                <div
                                    v-if="project.baseDevFolder"
                                    class="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500 font-mono group-hover:text-gray-400 transition-colors"
                                >
                                    <svg
                                        class="w-3.5 h-3.5 flex-shrink-0"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                        />
                                    </svg>
                                    <span class="truncate" :title="project.baseDevFolder">
                                        {{ project.baseDevFolder }}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- Task Summary Stats -->
                        <div class="flex items-center gap-6 flex-shrink-0">
                            <!-- Progress Bar -->
                            <div class="w-32 flex-shrink-0">
                                <div class="flex items-center justify-between text-xs mb-1">
                                    <span class="text-gray-400">{{
                                        $t('project.status.progress')
                                    }}</span>
                                    <span class="text-white font-medium">
                                        {{ taskSummaries[project.id]?.progressPercent || 0 }}%
                                    </span>
                                </div>
                                <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                        class="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-500"
                                        :style="{
                                            width: `${taskSummaries[project.id]?.progressPercent || 0}%`,
                                        }"
                                    />
                                </div>
                            </div>

                            <!-- Status Counts -->
                            <div class="flex items-center gap-2 flex-shrink-0">
                                <!-- Needs Approval (IN_CONFIRM) - Highlighted -->
                                <div
                                    v-if="(taskSummaries[project.id]?.inConfirm ?? 0) > 0"
                                    class="flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-500/20 border border-orange-500/30 rounded-lg animate-pulse"
                                    :title="$t('project.status.confirm')"
                                >
                                    <span class="text-orange-400">🔔</span>
                                    <span class="text-orange-400 font-bold text-sm">
                                        {{ taskSummaries[project.id]?.inConfirm ?? 0 }}
                                    </span>
                                </div>

                                <!-- In Progress -->
                                <div
                                    class="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 rounded-lg"
                                    :title="$t('project.status.in_progress')"
                                >
                                    <div class="w-2 h-2 rounded-full bg-blue-500" />
                                    <span class="text-blue-400 text-sm font-medium">
                                        {{ taskSummaries[project.id]?.inProgress || 0 }}
                                    </span>
                                </div>

                                <!-- In Review / Unread Results -->
                                <div
                                    v-if="(taskSummaries[project.id]?.unreadResults || 0) > 0"
                                    class="flex items-center gap-1.5 px-2 py-1 bg-indigo-500/20 border border-indigo-500/30 rounded-lg"
                                    :title="$t('project.status.unread_results')"
                                >
                                    <span class="text-indigo-400">✨</span>
                                    <span class="text-indigo-400 font-bold text-sm">
                                        {{ taskSummaries[project.id]?.unreadResults || 0 }}
                                    </span>
                                </div>

                                <div
                                    class="flex items-center gap-1.5 px-2 py-1 bg-yellow-500/10 rounded-lg"
                                    :title="$t('project.status.in_review')"
                                >
                                    <div class="w-2 h-2 rounded-full bg-yellow-500" />
                                    <span class="text-yellow-400 text-sm font-medium">
                                        {{ taskSummaries[project.id]?.inReview || 0 }}
                                    </span>
                                </div>

                                <!-- Done -->
                                <div
                                    class="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 rounded-lg"
                                    :title="$t('project.status.done')"
                                >
                                    <div class="w-2 h-2 rounded-full bg-green-500" />
                                    <span class="text-green-400 text-sm font-medium">
                                        {{ taskSummaries[project.id]?.done || 0 }}
                                    </span>
                                </div>

                                <!-- Total Tasks -->
                                <div
                                    class="flex items-center gap-1.5 px-2 py-1 bg-gray-700/50 rounded-lg"
                                    :title="$t('project.status.total')"
                                >
                                    <svg
                                        class="w-4 h-4 text-gray-400"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                        />
                                    </svg>
                                    <span class="text-gray-300 text-sm font-medium">
                                        {{ taskSummaries[project.id]?.total || 0 }}
                                    </span>
                                </div>
                            </div>

                            <!-- Blocked Warning -->
                            <div
                                v-if="(taskSummaries[project.id]?.blocked ?? 0) > 0"
                                class="flex items-center gap-2 px-3 py-1.5 bg-red-600 border border-red-500 rounded-lg shadow-[0_0_10px_rgba(220,38,38,0.5)] animate-pulse"
                                :title="$t('project.status.blocked')"
                            >
                                <svg
                                    class="w-4 h-4 text-white"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2.5"
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                    />
                                </svg>
                                <span
                                    class="text-white text-sm font-extrabold uppercase tracking-wide"
                                >
                                    {{ taskSummaries[project.id]?.blocked ?? 0 }} BLOCKED
                                </span>
                            </div>

                            <!-- Project Info Button -->
                            <button
                                @click="openProjectInfo(project, $event)"
                                class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                :title="$t('project.actions.info')"
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
                            <button
                                @click="handleDeleteProject(project, $event)"
                                class="p-2 text-red-400 hover:text-white hover:bg-red-700/40 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                :title="
                                    deletingProjectId === project.id
                                        ? $t('project.actions.deleting')
                                        : $t('project.actions.delete')
                                "
                            >
                                <svg
                                    v-if="deletingProjectId === project.id"
                                    class="w-5 h-5 animate-spin text-red-300"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <circle
                                        class="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke-width="4"
                                    ></circle>
                                    <path
                                        class="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V2C5.373 2 0 7.373 0 14h4zm2 5.291A7.962 7.962 0 014 14H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                </svg>
                                <svg
                                    v-else
                                    class="w-5 h-5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M6 7h12M9 7V5a3 3 0 013-3h0a3 3 0 013 3v2m-7 0h8l-1 12H8L7 7z"
                                    />
                                </svg>
                            </button>

                            <!-- Arrow Icon -->
                            <svg
                                class="w-5 h-5 text-gray-500 group-hover:text-blue-400 transition-colors"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M9 5l7 7-7 7"
                                />
                            </svg>
                        </div>
                    </div>

                    <!-- Additional Info Row (Time, Last Updated) -->
                    <div
                        class="flex items-center gap-6 mt-3 pt-3 border-t border-gray-700/50 text-xs text-gray-500"
                    >
                        <span class="flex items-center gap-1.5">
                            <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            {{ project.actualHours?.toFixed(1) || 0 }}
                            {{ $t('project.card.hours') }}
                        </span>
                        <span class="flex items-center gap-1.5">
                            <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                            </svg>
                            {{ new Date(project.updatedAt).toLocaleDateString() }}
                            {{ $t('project.card.updated') }}
                        </span>
                    </div>
                </div>
            </div>
        </main>

        <!-- Create Project Modal -->
        <Teleport to="body">
            <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center">
                <div class="absolute inset-0 bg-black/60" @click="showCreateModal = false"></div>
                <div
                    class="relative bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-xl"
                >
                    <h2 class="text-xl font-bold text-white mb-4">
                        {{ $t('project.modal.create_title') }}
                    </h2>

                    <form @submit.prevent="handleCreateProject" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-300 mb-1">
                                {{ $t('project.modal.name_label') }}
                            </label>
                            <input
                                v-model="newProjectTitle"
                                type="text"
                                :placeholder="$t('project.modal.name_placeholder')"
                                class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                autofocus
                            />
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-300 mb-1">
                                Description (optional)
                            </label>
                            <textarea
                                v-model="newProjectDescription"
                                rows="3"
                                placeholder="Describe your project..."
                                class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                            ></textarea>
                        </div>

                        <div class="flex gap-3 pt-2">
                            <button
                                type="button"
                                @click="showCreateModal = false"
                                class="flex-1 px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                :disabled="!newProjectTitle.trim() || creating"
                                class="flex-1 px-4 py-2 bg-blue-600 rounded-lg text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {{ creating ? 'Creating...' : 'Create' }}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Teleport>

        <!-- AI Project Creation Wizard -->
        <ProjectCreationWizard
            :open="showAIWizard"
            @close="showAIWizard = false"
            @created="handleAIWizardCreated"
        />

        <!-- Project Info Modal -->
        <ProjectInfoModal
            :project="selectedProjectForInfo"
            :open="showProjectInfoModal"
            @close="closeProjectInfoModal"
            @update="handleProjectInfoUpdate"
            @edit="
                () => {
                    closeProjectInfoModal(); /* TODO: open project edit modal */
                }
            "
        />

        <!-- Delete Project Confirm Modal -->
        <Teleport to="body">
            <div
                v-if="showDeleteConfirm && projectToDelete"
                class="fixed inset-0 z-50 flex items-center justify-center px-4"
            >
                <div
                    class="absolute inset-0 bg-black/70 backdrop-blur-sm"
                    @click="cancelDeleteProject"
                ></div>
                <div
                    class="relative w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden"
                >
                    <div
                        class="px-5 py-4 border-b border-gray-800 bg-gradient-to-r from-red-600/20 to-pink-500/10"
                    >
                        <div class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center"
                            >
                                <svg
                                    class="w-6 h-6 text-red-400"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M12 9v4m0 4h.01M4.93 4.93a10 10 0 0114.14 0M4.93 19.07a10 10 0 010-14.14M9 12h6"
                                    />
                                </svg>
                            </div>
                            <div>
                                <h3 class="text-lg font-semibold text-white">프로젝트 삭제</h3>
                                <p class="text-sm text-gray-400">
                                    복구할 수 없습니다. 정말 삭제하시겠습니까?
                                </p>
                            </div>
                        </div>
                    </div>
                    <div class="px-5 py-4 space-y-3">
                        <div class="p-3 rounded-lg bg-gray-800 border border-gray-700">
                            <div class="text-sm text-gray-300">
                                "{{ projectToDelete.title }}" 프로젝트와 모든 태스크, 데이터가 영구
                                삭제됩니다.
                            </div>
                        </div>
                        <div class="text-xs text-gray-500">
                            삭제하려면 아래 확인 버튼을 눌러주세요.
                        </div>
                    </div>
                    <div
                        class="px-5 py-3 border-t border-gray-800 bg-gray-900 flex items-center justify-end gap-2"
                    >
                        <button
                            class="px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 transition-colors"
                            @click="cancelDeleteProject"
                        >
                            취소
                        </button>
                        <button
                            class="px-4 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            :disabled="deletingProjectId === projectToDelete.id"
                            @click="confirmDeleteProject"
                        >
                            {{
                                deletingProjectId === projectToDelete.id
                                    ? '삭제 중...'
                                    : '확인하고 삭제'
                            }}
                        </button>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>
