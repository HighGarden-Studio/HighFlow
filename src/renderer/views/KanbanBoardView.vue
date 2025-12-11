<script setup lang="ts">
/**
 * Kanban Board View
 *
 * Task board with drag-and-drop support featuring full TaskCard component
 * with execute, retry, pause, resume, stop, subdivide, tags, subtasks features
 */
import { onMounted, onUnmounted, computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useProjectStore } from '../stores/projectStore';
import { useTaskStore, type TaskStatus, type TaskPriority, type Task } from '../stores/taskStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useUIStore } from '../stores/uiStore';
import { getAPI } from '../../utils/electron';
import TaskDetailPanel from '../../components/task/TaskDetailPanel.vue';
import TaskCard from '../../components/board/TaskCard.vue';
import TaskEditModal from '../../components/task/TaskEditModal.vue';
import EnhancedResultPreview from '../../components/task/EnhancedResultPreview.vue';
import InlineEdit from '../../components/common/InlineEdit.vue';
import ProjectInfoModal from '../../components/project/ProjectInfoModal.vue';
import OperatorPanel from '../../components/project/OperatorPanel.vue';
import ProjectHeader from '../../components/project/ProjectHeader.vue';
import { tagService } from '../../services/task/TagService';
import { estimationService } from '../../services/task/EstimationService';
import { aiInterviewService } from '../../services/ai/AIInterviewService';
import {
    taskSubdivisionService,
    type SubdivisionSuggestion,
} from '../../services/ai/TaskSubdivisionService';

// 미연동 Provider 정보 타입
interface MissingProviderInfo {
    id: string;
    name: string;
    requiredTags?: string[];
}

const route = useRoute();
const router = useRouter();
const projectStore = useProjectStore();
const taskStore = useTaskStore();
const settingsStore = useSettingsStore();
const uiStore = useUIStore();

// Props
const projectId = computed(() => Number(route.params.id));

// Local state
const showCreateModal = ref(false);
const createInColumn = ref<TaskStatus>('todo');
const newTaskTitle = ref('');
const newTaskDescription = ref('');
const newTaskPriority = ref<TaskPriority>('medium');
const newTaskType = ref<'ai' | 'script'>('ai');
const newTaskScriptLanguage = ref<'javascript' | 'typescript' | 'python'>('javascript');
const creating = ref(false);
const draggedTask = ref<number | null>(null);
const selectedTaskId = ref<number | null>(null);
const selectedTask = computed(() => {
    if (!selectedTaskId.value) return null;
    // Directly access tasks array to get stable object reference
    return taskStore.tasks.find((t) => t.id === selectedTaskId.value) || null;
});
const showDetailPanel = ref(false);

// Subdivision modal state
const showSubdivisionModal = ref(false);
const subdivisionTask = ref<Task | null>(null);
const subdivisionSuggestion = ref<SubdivisionSuggestion | null>(null);
const subdivisionLoading = ref(false);
const subdivisionCreating = ref(false);

// Approval modal state
const showApprovalModal = ref(false);
const approvalTask = ref<Task | null>(null);
const approvalProcessing = ref(false);
const rejectionReason = ref('');

// Task edit modal state
const showEditModal = ref(false);
const editingTask = ref<Task | null>(null);

// Result preview state
const showResultPreview = ref(false);
const resultPreviewTask = ref<Task | null>(null);
const showLivePreview = ref(false);
const livePreviewTask = ref<Task | null>(null);

// Project Info Modal state
const showProjectInfoModal = ref(false);

// Connection line state
const isConnectionMode = ref(false);
const connectionLineStart = ref<{ x: number; y: number } | null>(null);
const connectionLineEnd = ref<{ x: number; y: number } | null>(null);

function toggleConnectionMode() {
    isConnectionMode.value = !isConnectionMode.value;
    if (!isConnectionMode.value) {
        connectionLineStart.value = null;
        connectionLineEnd.value = null;
        draggedTask.value = null;
    }
}

// Computed
const project = computed(() => projectStore.currentProject);
const groupedTasks = computed(() => taskStore.groupedTasks);

const columns: { id: TaskStatus; title: string; color: string; icon?: string }[] = [
    { id: 'todo', title: 'To Do', color: 'bg-gray-500' },
    { id: 'in_progress', title: 'In Progress', color: 'bg-blue-500' },
    { id: 'needs_approval', title: 'Needs Approval', color: 'bg-orange-500', icon: '🔔' },
    { id: 'in_review', title: 'In Review', color: 'bg-yellow-500' },
    { id: 'done', title: 'Done', color: 'bg-green-500' },
    { id: 'blocked', title: 'Blocked', color: 'bg-red-500', icon: '🚫' },
];

// Actions
function openCreateModal(status: TaskStatus) {
    createInColumn.value = status;
    newTaskTitle.value = '';
    newTaskDescription.value = '';
    newTaskPriority.value = 'medium';
    newTaskType.value = 'ai';
    newTaskScriptLanguage.value = 'javascript';
    showCreateModal.value = true;
}

async function handleCreateTask() {
    if (!newTaskTitle.value.trim()) return;

    creating.value = true;
    try {
        const basePrompt = `${newTaskTitle.value}\n\n${newTaskDescription.value}`;
        const autoTags = tagService.generatePromptTags(basePrompt);

        const taskData: any = {
            projectId: projectId.value,
            title: newTaskTitle.value.trim(),
            description: newTaskDescription.value.trim(),
            priority: newTaskPriority.value,
            tags: autoTags,
            taskType: newTaskType.value,
        };

        // Add script-specific fields
        if (newTaskType.value === 'script') {
            taskData.scriptLanguage = newTaskScriptLanguage.value;
            taskData.scriptCode = getScriptTemplate(newTaskScriptLanguage.value);
        }

        console.log('[KanbanBoard] Creating task:', taskData);
        const task = await taskStore.createTask(taskData);
        console.log('[KanbanBoard] Task created:', task);

        if (task) {
            // Track tag usage for better suggestions
            autoTags.forEach((tag) => tagService.incrementUsage(tag));

            // Update status to match column
            if (createInColumn.value !== 'todo') {
                await taskStore.updateTask(task.id, { status: createInColumn.value });
            }
            showCreateModal.value = false;
        }
    } finally {
        creating.value = false;
    }
}

function getScriptTemplate(language: 'javascript' | 'typescript' | 'python'): string {
    const templates = {
        javascript: `// JavaScript Script\n// 매크로: {{task:N}}, {{task:N.output}}, {{project.name}}\n\nconsole.log('Script started');\n\n// Your code here\n\nconsole.log('Script completed');\n`,
        typescript: `// TypeScript Script\n// 매크로: {{task:N}}, {{task:N.output}}, {{project.name}}\n\nconsole.log('Script started');\n\n// Your code here\n\nconsole.log('Script completed');\n`,
        python: `# Python Script\n# 매크로: {{task:N}}, {{task:N.output}}, {{project.name}}\n\nprint('Script started')\n\n# Your code here\n\nprint('Script completed')\n`,
    };
    return templates[language];
}

function handleDragStart(taskId: number) {
    draggedTask.value = taskId;
}

function handleDragEnd() {
    draggedTask.value = null;
}

async function handleDrop(status: TaskStatus) {
    if (draggedTask.value === null) return;

    const task = taskStore.taskById(draggedTask.value);
    if (task && task.status !== status) {
        await taskStore.updateTask(draggedTask.value, { status });
    }

    draggedTask.value = null;
}

// getPriorityColor is available if needed for custom styling
// const getPriorityColor = (priority: string): string => {
//   switch (priority) {
//     case 'low': return 'border-l-green-500';
//     case 'medium': return 'border-l-yellow-500';
//     case 'high': return 'border-l-orange-500';
//     case 'urgent': return 'border-l-red-500';
//     default: return 'border-l-gray-500';
//   }
// };

function openTaskDetail(task: Task) {
    selectedTaskId.value = task.id;
    showDetailPanel.value = true;
}

function closeDetailPanel() {
    showDetailPanel.value = false;
    selectedTaskId.value = null;
}

async function handleTaskSave(task: Task) {
    await taskStore.updateTask(task.id, task);
}

async function handleTaskExecute(task: Task) {
    console.log('Execute task:', task.id);

    const result = await taskStore.executeTask(task.id);
    if (!result.success) {
        console.error('Failed to execute task:', result.error);
        // Show warning notification for validation errors
        if (result.validationError) {
            uiStore.showToast({
                type: 'warning',
                message: result.error || '태스크 실행 설정을 확인해주세요.',
                duration: 5000,
            });
        } else {
            uiStore.showToast({
                type: 'error',
                message: result.error || '태스크 실행에 실패했습니다.',
                duration: 5000,
            });
        }
    }
}

async function handleTaskApprove(task: Task) {
    const result = await taskStore.completeReview(task.id);
    if (!result.success) {
        console.error('Failed to approve task:', result.error);
        uiStore.showToast({
            type: 'error',
            message: result.error || '승인 처리에 실패했습니다.',
        });
        return;
    }
    uiStore.showToast({
        type: 'success',
        message: '테스크가 승인되었습니다.',
    });
    closeDetailPanel();
}

async function handleTaskReject(task: Task, feedback: string) {
    await taskStore.updateTask(task.id, {
        status: 'todo',
        description: task.description + '\n\n[Rejection Feedback]: ' + feedback,
    });
    closeDetailPanel();
}

async function handleTaskSubdivide(task: Task) {
    subdivisionTask.value = task;
    showSubdivisionModal.value = true;
    subdivisionLoading.value = true;
    subdivisionSuggestion.value = null;

    try {
        // Get AI subdivision suggestions
        const suggestion = await taskSubdivisionService.suggestSubdivision(task);
        subdivisionSuggestion.value = suggestion;
    } catch (error) {
        console.error('Failed to get subdivision suggestions:', error);
    } finally {
        subdivisionLoading.value = false;
    }
}

async function confirmSubdivision() {
    if (!subdivisionTask.value || !subdivisionSuggestion.value) return;

    subdivisionCreating.value = true;
    try {
        const parentTask = subdivisionTask.value;
        const subtasks = subdivisionSuggestion.value.subtasks;

        // Create subtasks
        for (const subtask of subtasks) {
            await taskStore.createTask({
                projectId: projectId.value,
                title: subtask.title,
                description: subtask.description,
                priority: subtask.priority || 'medium',
                tags: subtask.tags,
                estimatedMinutes: subtask.estimatedMinutes || undefined,
                parentTaskId: parentTask.id,
            });
        }

        // Mark parent task as subdivided
        await taskStore.updateTask(parentTask.id, {
            isSubdivided: true,
        });

        // Close modal
        closeSubdivisionModal();
    } catch (error) {
        console.error('Failed to create subtasks:', error);
    } finally {
        subdivisionCreating.value = false;
    }
}

function closeSubdivisionModal() {
    showSubdivisionModal.value = false;
    subdivisionTask.value = null;
    subdivisionSuggestion.value = null;
    subdivisionLoading.value = false;
}

// Additional TaskCard event handlers
async function handleEnhancePrompt(task: Task) {
    // TODO: Implement prompt enhancement with AI
    console.log('Enhance prompt for task:', task.id);
}

function handlePreviewPrompt(task: Task) {
    // Open task detail panel with prompt preview
    selectedTaskId.value = task.id;
    showDetailPanel.value = true;
}

function handlePreviewResult(task: Task) {
    // Open enhanced result preview panel
    openResultPreview(task);
}

async function handleRetry(task: Task) {
    // Retry task execution
    await taskStore.updateTask(task.id, { status: 'todo' });
    // TODO: Re-run with modifications
    console.log('Retry task:', task.id);
}

function handleViewHistory(task: Task) {
    // Open task detail panel with history view
    selectedTaskId.value = task.id;
    showDetailPanel.value = true;
}

function handleViewProgress(task: Task) {
    // Open task detail panel with progress view
    selectedTaskId.value = task.id;
    showDetailPanel.value = true;
}

function handleViewStepHistory(task: Task) {
    // Open task detail panel with step history view
    selectedTaskId.value = task.id;
    showDetailPanel.value = true;
}

async function handlePause(task: Task) {
    const result = await taskStore.pauseTask(task.id);
    if (!result.success) {
        console.error('Failed to pause task:', result.error);
    }
}

async function handleResume(task: Task) {
    const result = await taskStore.resumeTask(task.id);
    if (!result.success) {
        console.error('Failed to resume task:', result.error);
    }
}

async function handleStop(task: Task) {
    const result = await taskStore.stopTask(task.id);
    if (!result.success) {
        console.error('Failed to stop task:', result.error);
    }
}

async function handleEditTask(task: Task) {
    // Open the edit modal instead of just the detail panel
    editingTask.value = task;
    showEditModal.value = true;
}

function closeEditModal() {
    showEditModal.value = false;
    editingTask.value = null;
}

async function handleEditModalSave(updates: Partial<Task>) {
    if (!editingTask.value) return;
    await taskStore.updateTask(editingTask.value.id, updates);
    closeEditModal();
}

async function handleEditModalDelete(taskId: number) {
    await taskStore.deleteTask(taskId);
    closeEditModal();
}

// Result Preview handlers
async function openResultPreview(task: Task) {
    // 최신 상세 데이터를 가져와 결과가 사라지지 않도록 보강
    let fullTask: any = task;
    try {
        const fetched = await getAPI().tasks.get(task.id);
        if (fetched) {
            fullTask = { ...task, ...fetched };
        }
    } catch (error) {
        console.error('Failed to fetch task for preview:', error);
    }

    const progress = taskStore.executionProgress.get(task.id);
    const reviewProgressEntry = taskStore.reviewProgress.get(task.id);
    const enriched = {
        ...fullTask,
        result:
            (fullTask as any).result ||
            (fullTask as any).executionResult?.content ||
            progress?.content ||
            reviewProgressEntry?.content ||
            '',
        outputFormat:
            (fullTask as any).outputFormat ||
            (fullTask as any).executionResult?.contentType ||
            (fullTask as any).expectedOutputFormat,
    } as Task;
    resultPreviewTask.value = enriched;
    showResultPreview.value = true;
}

function closeResultPreview() {
    showResultPreview.value = false;
    resultPreviewTask.value = null;
}

// Live Streaming Preview handlers
function openLivePreview(task: Task) {
    livePreviewTask.value = task;
    showLivePreview.value = true;
}

function closeLivePreview() {
    showLivePreview.value = false;
    livePreviewTask.value = null;
}

async function handleResultApprove(task: Task) {
    const result = await taskStore.completeReview(task.id);
    if (!result.success) {
        console.error('Failed to approve task:', result.error);
    }
    // Approve 후 결과 프리뷰 닫기
    closeResultPreview();
}

async function handleVersionRestore(versionId: string) {
    // In production, this would restore the task result to a previous version
    console.log('Restoring version:', versionId);
}

// Project name update handler
async function handleProjectNameUpdate(newName: string) {
    if (!project.value || !newName.trim()) return;
    await projectStore.updateProject(project.value.id, { title: newName.trim() });
}

async function handleDeleteTask(task: Task) {
    const dependentTasks = taskStore.tasks.filter(
        (t) => t.id !== task.id && Array.isArray(t.dependencies) && t.dependencies.includes(task.id)
    );

    if (dependentTasks.length > 0) {
        const dependentList = dependentTasks.map((t) => `• ${t.title}`).join('\n');
        const message = `다음 ${dependentTasks.length}개의 테스크가 "${task.title}"에 의존하고 있습니다:\n${dependentList}\n\n삭제하면 이 테스크와의 의존성이 제거됩니다. 계속하시겠습니까?`;
        if (!confirm(message)) {
            return;
        }

        for (const dependent of dependentTasks) {
            const updatedDependencies = (dependent.dependencies || []).filter(
                (depId) => depId !== task.id
            );
            await taskStore.updateTask(dependent.id, {
                dependencies: updatedDependencies,
            });
        }
    } else if (!confirm(`정말 "${task.title}" 테스크를 삭제하시겠습니까?`)) {
        return;
    }

    await taskStore.deleteTask(task.id);
}

// Subtask helper - get subtasks for a parent task
function getSubtasks(parentTaskId: number): Task[] {
    return taskStore.tasks.filter((t) => t.parentTaskId === parentTaskId);
}

const liveStreamingContent = computed(() => {
    if (!livePreviewTask.value) return '';
    const progress = taskStore.executionProgress.get(livePreviewTask.value.id);
    return progress?.content || '';
});

const liveReviewContent = computed(() => {
    if (!livePreviewTask.value) return '';
    const progress = taskStore.reviewProgress.get(livePreviewTask.value.id);
    return progress?.content || '';
});

/**
 * Task에 필요한 Provider가 연동되어 있는지 확인
 * 미연동된 Provider가 있으면 해당 정보 반환, 모두 연동되어 있으면 null 반환
 */
function getMissingProviderForTask(task: Task): MissingProviderInfo | null {
    // Task에 명시적으로 지정된 aiProvider가 있는 경우
    if (task.aiProvider) {
        // Check if it's a local agent
        const localAgentMap: Record<string, string> = {
            'claude-code': 'claude',
            codex: 'codex',
            antigravity: 'antigravity',
        };

        const localAgentType = localAgentMap[task.aiProvider];
        if (localAgentType) {
            // For local agents, check if they are installed
            // We don't have access to useLocalAgentExecution here, so we assume
            // local agents with baseDevFolder are connected
            const project = projectStore.currentProject;
            if (project?.baseDevFolder) {
                // Local agent is available if project has baseDevFolder
                return null;
            }
            // If no baseDevFolder, local agent is not available
            const providerInfo = settingsStore.aiProviders.find((p) => p.id === task.aiProvider);
            return {
                id: task.aiProvider as string,
                name: providerInfo?.name || (task.aiProvider as string),
            };
        }

        // For API providers, check if enabled
        const enabledProviders = settingsStore.enabledProviders;
        const isProviderEnabled = enabledProviders.some(
            (p) => p.id === task.aiProvider && p.enabled
        );

        if (!isProviderEnabled) {
            // Provider 정보를 AI_PROVIDERS에서 가져옴
            const providerInfo = settingsStore.aiProviders.find((p) => p.id === task.aiProvider);
            return {
                id: task.aiProvider as string,
                name: providerInfo?.name || (task.aiProvider as string),
            };
        }
    }

    return null;
}

/**
 * Provider 연동하기 핸들러 - 설정 페이지로 이동
 */
function handleConnectProvider(providerId: string) {
    // Settings 페이지로 이동하면서 provider 정보 전달
    router.push({
        path: '/settings',
        query: { tab: 'ai-providers', highlight: providerId },
    });
}

// Connection handlers for task dependency
const connectionSourceTask = ref<Task | null>(null);
let connectionProcessing = false; // Flag to prevent cancel during save

function handleConnectionStart(task: Task, event: DragEvent) {
    connectionSourceTask.value = task;
    isConnectionMode.value = true;

    // 시작점 설정
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    connectionLineStart.value = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
    };
    connectionLineEnd.value = { ...connectionLineStart.value };

    // 드래그 이미지를 투명하게 설정
    if (event.dataTransfer) {
        const img = new Image();
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        event.dataTransfer.setDragImage(img, 0, 0);
    }

    // 전역 마우스 이동 추적
    document.addEventListener('dragover', handleGlobalDragOver);

    console.log('Connection started from task:', task.id, task.title);
}

function handleGlobalDragOver(event: DragEvent) {
    if (isConnectionMode.value) {
        connectionLineEnd.value = {
            x: event.clientX,
            y: event.clientY,
        };
    }
}

function handleConnectionDragEnd() {
    isConnectionMode.value = false;
    connectionLineStart.value = null;
    connectionLineEnd.value = null;
    connectionSourceTask.value = null;
    connectionProcessing = false; // Reset processing flag
    document.removeEventListener('dragover', handleGlobalDragOver);
}

function handleConnectionCancel() {
    // Don't cancel if we're in the middle of processing a connection
    if (connectionProcessing) {
        return;
    }
    isConnectionMode.value = false;
    connectionLineStart.value = null;
    connectionLineEnd.value = null;
    connectionSourceTask.value = null;
}

async function handleConnectionEnd(targetTask: Task) {
    connectionProcessing = true; // Mark as processing

    if (!connectionSourceTask.value) {
        connectionProcessing = false;
        handleConnectionDragEnd();
        return;
    }

    const sourceTask = connectionSourceTask.value;

    // 자기 자신에게 연결 불가
    if (sourceTask.id === targetTask.id) {
        connectionProcessing = false;
        handleConnectionDragEnd();
        return;
    }

    // 이미 연결되어 있으면 무시
    const existingDependsOn = sourceTask.triggerConfig?.dependsOn;
    const existingTaskIds = existingDependsOn?.taskIds || [];
    if (existingTaskIds.includes(targetTask.id)) {
        connectionProcessing = false;
        handleConnectionDragEnd();
        return;
    }

    console.log('Connection created:', sourceTask.title, '→', targetTask.title);
    console.log(
        'Source task #' + sourceTask.projectSequence + ' (ID:',
        sourceTask.id + '), Target task #' + targetTask.projectSequence + ' (ID:',
        targetTask.id + ')'
    );
    console.log('Existing taskIds:', existingTaskIds);

    const existingPassResultsFrom = existingDependsOn?.passResultsFrom || [];

    const newTriggerConfig = {
        ...sourceTask.triggerConfig,
        dependsOn: {
            taskIds: [...existingTaskIds, targetTask.id],
            operator: existingDependsOn?.operator || ('all' as const),
            passResultsFrom: Array.from(new Set([...existingPassResultsFrom, targetTask.id])),
        },
    };

    console.log('New trigger config:', JSON.stringify(newTriggerConfig, null, 2));

    await taskStore.updateTask(sourceTask.id, {
        triggerConfig: newTriggerConfig,
    });

    console.log('✅ Dependency saved successfully');
    connectionProcessing = false;
    handleConnectionDragEnd();
}

// Approval handlers for NEEDS_APPROVAL status
function openApprovalModal(task: Task) {
    approvalTask.value = task;
    showApprovalModal.value = true;
    rejectionReason.value = '';
}

function closeApprovalModal() {
    showApprovalModal.value = false;
    approvalTask.value = null;
    rejectionReason.value = '';
}

async function handleApproveTask() {
    if (!approvalTask.value) return;

    approvalProcessing.value = true;
    try {
        // Approve: move back to IN_PROGRESS to continue execution
        const result = await taskStore.approveTask(approvalTask.value.id);
        if (!result.success) {
            console.error('Failed to approve task:', result.error);
        }
        closeApprovalModal();
    } catch (error) {
        console.error('Failed to approve task:', error);
    } finally {
        approvalProcessing.value = false;
    }
}

async function handleRejectTask() {
    if (!approvalTask.value) return;

    approvalProcessing.value = true;
    try {
        // Reject: cancel the task and move to TODO
        const result = await taskStore.rejectTask(approvalTask.value.id);
        if (!result.success) {
            console.error('Failed to reject task:', result.error);
        }
        closeApprovalModal();
    } catch (error) {
        console.error('Failed to reject task:', error);
    } finally {
        approvalProcessing.value = false;
    }
}

// Operator assignment handler
async function handleOperatorDrop(taskId: number, operatorId: number) {
    try {
        await taskStore.updateTask(taskId, { assignedOperatorId: operatorId });
        uiStore.showToast({
            type: 'success',
            message: 'Operator assigned successfully',
        });
    } catch (error) {
        console.error('Failed to assign operator:', error);
        uiStore.showToast({
            type: 'error',
            message: 'Failed to assign operator',
        });
    }
}

// Lifecycle
onMounted(async () => {
    await projectStore.fetchProject(projectId.value);
    await taskStore.fetchTasks(projectId.value);
    const cleanup = taskStore.initEventListeners();
    onUnmounted(() => {
        cleanup();
    });
});
</script>

<template>
    <div class="flex-1 flex flex-col h-full bg-gray-900 relative">
        <!-- Connection Line Overlay -->
        <svg
            v-if="isConnectionMode && connectionLineStart && connectionLineEnd"
            class="fixed inset-0 w-full h-full pointer-events-none z-50"
            style="overflow: visible"
        >
            <defs>
                <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
                </marker>
                <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color: #6366f1; stop-opacity: 1" />
                    <stop offset="100%" style="stop-color: #22c55e; stop-opacity: 1" />
                </linearGradient>
            </defs>
            <!-- Connection Line -->
            <line
                :x1="connectionLineStart.x"
                :y1="connectionLineStart.y"
                :x2="connectionLineEnd.x"
                :y2="connectionLineEnd.y"
                stroke="url(#lineGradient)"
                stroke-width="3"
                stroke-dasharray="8,4"
                marker-end="url(#arrowhead)"
            >
                <animate
                    attributeName="stroke-dashoffset"
                    from="0"
                    to="-12"
                    dur="0.5s"
                    repeatCount="indefinite"
                />
            </line>
            <!-- Start Point -->
            <circle
                :cx="connectionLineStart.x"
                :cy="connectionLineStart.y"
                r="8"
                fill="#6366f1"
                stroke="white"
                stroke-width="2"
            />
            <!-- End Point Cursor -->
            <circle
                :cx="connectionLineEnd.x"
                :cy="connectionLineEnd.y"
                r="6"
                fill="#22c55e"
                stroke="white"
                stroke-width="2"
                opacity="0.8"
            />
        </svg>

        <!-- Connection Mode Instruction Banner -->
        <div
            v-if="isConnectionMode && connectionSourceTask"
            class="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-full shadow-lg flex items-center gap-2"
        >
            <svg
                class="w-4 h-4 animate-pulse"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                />
            </svg>
            "{{ connectionSourceTask.title }}"를 다른 태스크에 드롭하세요
        </div>

        <!-- Header -->
        <ProjectHeader
            :project-id="projectId"
            :project-title="project?.title"
            current-view="board"
            :show-connection-mode="true"
            :show-new-task="true"
            :is-connection-mode="isConnectionMode"
            @project-info="showProjectInfoModal = true"
            @new-task="openCreateModal('todo')"
            @toggle-connection="toggleConnectionMode"
        />

        <!-- Operator Panel -->
        <OperatorPanel :project-id="projectId" />

        <!-- Board -->
        <main class="flex-1 overflow-x-auto p-6">
            <div class="flex gap-4 h-full min-w-max">
                <div
                    v-for="column in columns"
                    :key="column.id"
                    class="w-80 flex-shrink-0 flex flex-col bg-gray-800/50 rounded-xl"
                    @dragover.prevent
                    @drop="handleDrop(column.id)"
                >
                    <!-- Column Header -->
                    <div class="p-4 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <div :class="['w-3 h-3 rounded-full', column.color]"></div>
                            <span v-if="column.icon" class="text-lg">{{ column.icon }}</span>
                            <h3 class="font-semibold text-white">{{ column.title }}</h3>
                            <span
                                class="text-sm px-2 rounded-full"
                                :class="
                                    column.id === 'needs_approval' &&
                                    groupedTasks[column.id]?.length > 0
                                        ? 'bg-orange-500 text-white animate-pulse'
                                        : 'text-gray-500 bg-gray-700'
                                "
                            >
                                {{ groupedTasks[column.id]?.length || 0 }}
                            </span>
                        </div>
                        <button
                            @click="openCreateModal(column.id)"
                            class="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
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
                                    d="M12 4v16m8-8H4"
                                />
                            </svg>
                        </button>
                    </div>

                    <!-- Tasks List -->
                    <div class="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
                        <!-- Use full-featured TaskCard component -->
                        <div
                            v-for="task in groupedTasks[column.id]"
                            :key="task.id"
                            draggable="true"
                            @dragstart="handleDragStart(task.id)"
                            @dragend="handleDragEnd"
                            :class="[
                                'transition-all',
                                draggedTask === task.id ? 'opacity-50 scale-95' : '',
                            ]"
                        >
                            <TaskCard
                                :task="task"
                                :subtasks="getSubtasks(task.id)"
                                :show-assignee="true"
                                :show-due-date="true"
                                :show-priority="true"
                                :show-tags="true"
                                :is-dragging="draggedTask === task.id"
                                :missing-provider="getMissingProviderForTask(task)"
                                @click="openTaskDetail"
                                @edit="handleEditTask"
                                @delete="handleDeleteTask"
                                @execute="handleTaskExecute"
                                @enhance-prompt="handleEnhancePrompt"
                                @preview-prompt="handlePreviewPrompt"
                                @preview-result="handlePreviewResult"
                                @preview-stream="openLivePreview"
                                @approve="handleTaskApprove"
                                @retry="handleRetry"
                                @view-history="handleViewHistory"
                                @view-progress="handleViewProgress"
                                @view-step-history="handleViewStepHistory"
                                @pause="handlePause"
                                @resume="handleResume"
                                @stop="handleStop"
                                @subdivide="handleTaskSubdivide"
                                @open-approval="openApprovalModal"
                                @connection-start="handleConnectionStart"
                                @connection-end="handleConnectionEnd"
                                @connection-cancel="handleConnectionCancel"
                                @connect-provider="handleConnectProvider"
                                @operator-drop="handleOperatorDrop"
                            />
                        </div>

                        <!-- Empty state -->
                        <div
                            v-if="!groupedTasks[column.id]?.length"
                            class="flex flex-col items-center justify-center py-8 text-gray-500"
                        >
                            <svg
                                class="w-8 h-8 mb-2"
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
                            <span class="text-sm">No tasks</span>
                        </div>
                    </div>
                </div>
            </div>
        </main>

        <!-- Create Task Modal -->
        <Teleport to="body">
            <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center">
                <div class="absolute inset-0 bg-black/60" @click="showCreateModal = false"></div>
                <div
                    class="relative bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-xl"
                >
                    <h2 class="text-xl font-bold text-white mb-4">Create New Task</h2>

                    <form @submit.prevent="handleCreateTask" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-300 mb-1">
                                Task Title
                            </label>
                            <input
                                v-model="newTaskTitle"
                                type="text"
                                placeholder="What needs to be done?"
                                class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                autofocus
                            />
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-300 mb-1">
                                Description (optional)
                            </label>
                            <textarea
                                v-model="newTaskDescription"
                                rows="3"
                                placeholder="Add more details..."
                                class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                            ></textarea>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-300 mb-1">
                                Priority
                            </label>
                            <div class="flex gap-2">
                                <button
                                    v-for="priority in [
                                        'low',
                                        'medium',
                                        'high',
                                        'urgent',
                                    ] as TaskPriority[]"
                                    :key="priority"
                                    type="button"
                                    @click="newTaskPriority = priority"
                                    :class="[
                                        'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors capitalize',
                                        newTaskPriority === priority
                                            ? priority === 'low'
                                                ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500'
                                                : priority === 'medium'
                                                  ? 'bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500'
                                                  : priority === 'high'
                                                    ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500'
                                                    : 'bg-red-500/20 text-red-400 ring-1 ring-red-500'
                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
                                    ]"
                                >
                                    {{ priority }}
                                </button>
                            </div>
                        </div>

                        <!-- Task Type Selection -->
                        <div>
                            <label class="block text-sm font-medium text-gray-300 mb-2">
                                Task Type
                            </label>
                            <div class="flex gap-2">
                                <button
                                    type="button"
                                    @click="newTaskType = 'ai'"
                                    :class="[
                                        'flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                        newTaskType === 'ai'
                                            ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500'
                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
                                    ]"
                                >
                                    🤖 AI Task
                                </button>
                                <button
                                    type="button"
                                    @click="newTaskType = 'script'"
                                    :class="[
                                        'flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                        newTaskType === 'script'
                                            ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500'
                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
                                    ]"
                                >
                                    ⚡ Script Task
                                </button>
                            </div>
                        </div>

                        <!-- Script Language Selection (shown only for script tasks) -->
                        <div v-if="newTaskType === 'script'">
                            <label class="block text-sm font-medium text-gray-300 mb-2">
                                Script Language
                            </label>
                            <div class="flex gap-2">
                                <button
                                    v-for="lang in ['javascript', 'typescript', 'python']"
                                    :key="lang"
                                    type="button"
                                    @click="newTaskScriptLanguage = lang as any"
                                    :class="[
                                        'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors capitalize',
                                        newTaskScriptLanguage === lang
                                            ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500'
                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
                                    ]"
                                >
                                    {{
                                        lang === 'javascript'
                                            ? '🟨 JS'
                                            : lang === 'typescript'
                                              ? '🔷 TS'
                                              : '🐍 PY'
                                    }}
                                </button>
                            </div>
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
                                :disabled="!newTaskTitle.trim() || creating"
                                class="flex-1 px-4 py-2 bg-blue-600 rounded-lg text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {{ creating ? 'Creating...' : 'Create Task' }}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Teleport>

        <!-- Task Detail Panel -->
        <Teleport to="body">
            <div v-if="showDetailPanel && selectedTask" class="fixed inset-0 z-50 flex">
                <div class="absolute inset-0 bg-black/60" @click="closeDetailPanel"></div>
                <div
                    class="relative ml-auto w-full max-w-2xl h-full bg-gray-800 border-l border-gray-700 shadow-2xl overflow-hidden"
                >
                    <TaskDetailPanel
                        :task="selectedTask"
                        :open="showDetailPanel"
                        @close="closeDetailPanel"
                        @save="handleTaskSave"
                        @execute="handleTaskExecute"
                        @approve="handleTaskApprove"
                        @reject="handleTaskReject"
                        @subdivide="handleTaskSubdivide"
                    />
                </div>
            </div>
        </Teleport>

        <!-- Task Subdivision Modal -->
        <Teleport to="body">
            <div
                v-if="showSubdivisionModal"
                class="fixed inset-0 z-50 flex items-center justify-center"
            >
                <div class="absolute inset-0 bg-black/60" @click="closeSubdivisionModal"></div>
                <div
                    class="relative bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-2xl shadow-xl max-h-[80vh] overflow-y-auto"
                >
                    <div class="flex items-center justify-between mb-6">
                        <div>
                            <h2 class="text-xl font-bold text-white">AI 테스크 세분화</h2>
                            <p v-if="subdivisionTask" class="text-gray-400 text-sm mt-1">
                                "{{ subdivisionTask.title }}" 세분화 제안
                            </p>
                        </div>
                        <button
                            @click="closeSubdivisionModal"
                            class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
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
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>

                    <!-- Loading State -->
                    <div
                        v-if="subdivisionLoading"
                        class="flex flex-col items-center justify-center py-12"
                    >
                        <div
                            class="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-500 mb-4"
                        ></div>
                        <p class="text-gray-400">AI가 서브테스크를 분석하고 있습니다...</p>
                    </div>

                    <!-- Suggestion Content -->
                    <div v-else-if="subdivisionSuggestion" class="space-y-6">
                        <!-- Reasoning -->
                        <div class="bg-teal-500/10 border border-teal-500/30 rounded-lg p-4">
                            <h3
                                class="text-sm font-medium text-teal-400 mb-2 flex items-center gap-2"
                            >
                                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path
                                        fill-rule="evenodd"
                                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                        clip-rule="evenodd"
                                    />
                                </svg>
                                AI 분석 결과
                            </h3>
                            <p class="text-gray-300 text-sm">
                                {{ subdivisionSuggestion.reasoning }}
                            </p>
                        </div>

                        <!-- Subtask List -->
                        <div>
                            <div class="flex items-center justify-between mb-3">
                                <h3 class="text-white font-medium">
                                    제안된 서브테스크 ({{
                                        subdivisionSuggestion.subtasks.length
                                    }}개)
                                </h3>
                                <span class="text-sm text-gray-400">
                                    총 예상 시간:
                                    {{
                                        Math.floor(
                                            subdivisionSuggestion.totalEstimatedMinutes / 60
                                        )
                                    }}시간 {{ subdivisionSuggestion.totalEstimatedMinutes % 60 }}분
                                </span>
                            </div>
                            <div class="space-y-3">
                                <div
                                    v-for="(subtask, index) in subdivisionSuggestion.subtasks"
                                    :key="index"
                                    class="bg-gray-700/50 border border-gray-600 rounded-lg p-4"
                                >
                                    <div class="flex items-start justify-between mb-2">
                                        <div class="flex items-center gap-2">
                                            <span
                                                class="flex items-center justify-center w-6 h-6 bg-teal-500/20 text-teal-400 rounded-full text-xs font-bold"
                                            >
                                                {{ index + 1 }}
                                            </span>
                                            <h4 class="text-white font-medium">
                                                {{ subtask.title }}
                                            </h4>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <span
                                                v-if="subtask.priority"
                                                class="px-2 py-0.5 rounded-full text-xs"
                                                :class="{
                                                    'bg-red-500/20 text-red-400':
                                                        subtask.priority === 'urgent',
                                                    'bg-orange-500/20 text-orange-400':
                                                        subtask.priority === 'high',
                                                    'bg-yellow-500/20 text-yellow-400':
                                                        subtask.priority === 'medium',
                                                    'bg-green-500/20 text-green-400':
                                                        subtask.priority === 'low',
                                                }"
                                            >
                                                {{ subtask.priority }}
                                            </span>
                                            <span
                                                v-if="subtask.estimatedMinutes"
                                                class="text-xs text-gray-400"
                                            >
                                                {{
                                                    Math.floor(
                                                        (subtask.estimatedMinutes || 0) / 60
                                                    )
                                                }}h {{ (subtask.estimatedMinutes || 0) % 60 }}m
                                            </span>
                                        </div>
                                    </div>
                                    <p class="text-gray-400 text-sm mb-2">
                                        {{ subtask.description }}
                                    </p>
                                    <div
                                        v-if="subtask.tags && subtask.tags.length > 0"
                                        class="flex flex-wrap gap-1"
                                    >
                                        <span
                                            v-for="tag in subtask.tags"
                                            :key="tag"
                                            class="px-2 py-0.5 bg-gray-600 text-gray-300 rounded text-xs"
                                        >
                                            {{ tag }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Actions -->
                        <div class="flex gap-3 pt-4 border-t border-gray-700">
                            <button
                                @click="closeSubdivisionModal"
                                class="flex-1 px-4 py-2 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-700 transition-colors"
                            >
                                취소
                            </button>
                            <button
                                @click="confirmSubdivision"
                                :disabled="subdivisionCreating"
                                class="flex-1 px-4 py-2 bg-teal-600 rounded-lg text-white font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                            >
                                <svg
                                    v-if="subdivisionCreating"
                                    class="w-4 h-4 animate-spin"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        class="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        stroke-width="4"
                                    />
                                    <path
                                        class="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                </svg>
                                {{ subdivisionCreating ? '생성 중...' : '서브테스크 생성' }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Teleport>

        <!-- Approval Modal -->
        <Teleport to="body">
            <div
                v-if="showApprovalModal && approvalTask"
                class="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
                <!-- Backdrop -->
                <div
                    class="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    @click="closeApprovalModal"
                />

                <!-- Modal -->
                <div
                    class="relative w-full max-w-lg bg-gray-800 rounded-xl shadow-2xl border border-gray-700 overflow-hidden"
                >
                    <!-- Header -->
                    <div class="px-6 py-4 border-b border-gray-700 bg-orange-500/10">
                        <div class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center"
                            >
                                <svg
                                    class="w-5 h-5 text-orange-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                </svg>
                            </div>
                            <div>
                                <h3 class="text-lg font-semibold text-white">승인 요청</h3>
                                <p class="text-sm text-gray-400">
                                    작업 진행을 위해 사용자 승인이 필요합니다
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- Content -->
                    <div class="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
                        <!-- Task Info -->
                        <div class="p-4 bg-gray-700/50 rounded-lg">
                            <h4 class="text-sm font-medium text-gray-400 mb-1">작업</h4>
                            <p class="text-white font-medium">{{ approvalTask.title }}</p>
                            <p
                                v-if="approvalTask.description"
                                class="mt-2 text-sm text-gray-400 line-clamp-3"
                            >
                                {{ approvalTask.description }}
                            </p>
                        </div>

                        <!-- Approval Request Details -->
                        <div class="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                            <div class="flex items-start gap-3">
                                <svg
                                    class="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0"
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
                                <div>
                                    <h4 class="text-sm font-medium text-orange-300 mb-1">
                                        {{
                                            (approvalTask as any).confirmationRequest?.title ||
                                            '승인이 필요합니다'
                                        }}
                                    </h4>
                                    <p class="text-sm text-gray-300">
                                        {{
                                            (approvalTask as any).confirmationRequest?.summary ||
                                            'AI 에이전트가 이 작업을 계속 진행하기 위해 사용자의 승인을 기다리고 있습니다.'
                                        }}
                                    </p>
                                    <div
                                        v-if="(approvalTask as any).confirmationRequest?.details"
                                        class="mt-3 p-3 bg-gray-800/50 rounded text-sm text-gray-400 whitespace-pre-wrap"
                                    >
                                        {{ (approvalTask as any).confirmationRequest?.details }}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Rejection Reason (shown when rejecting) -->
                        <div class="space-y-2">
                            <label class="text-sm font-medium text-gray-300">
                                거절 사유 (선택사항)
                            </label>
                            <textarea
                                v-model="rejectionReason"
                                rows="3"
                                placeholder="거절하는 경우 이유를 입력하면 다음 실행 시 참고됩니다..."
                                class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                            />
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="px-6 py-4 border-t border-gray-700 bg-gray-800/50">
                        <div class="flex gap-3">
                            <button
                                @click="closeApprovalModal"
                                :disabled="approvalProcessing"
                                class="px-4 py-2 border border-gray-600 rounded-lg text-gray-300 hover:bg-gray-700 transition-colors disabled:opacity-50"
                            >
                                취소
                            </button>
                            <button
                                @click="handleRejectTask"
                                :disabled="approvalProcessing"
                                class="flex-1 px-4 py-2 bg-red-600 rounded-lg text-white font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                            >
                                <svg
                                    v-if="approvalProcessing"
                                    class="w-4 h-4 animate-spin"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        class="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        stroke-width="4"
                                    />
                                    <path
                                        class="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                </svg>
                                <svg
                                    v-else
                                    class="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                                거절
                            </button>
                            <button
                                @click="handleApproveTask"
                                :disabled="approvalProcessing"
                                class="flex-1 px-4 py-2 bg-green-600 rounded-lg text-white font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                            >
                                <svg
                                    v-if="approvalProcessing"
                                    class="w-4 h-4 animate-spin"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        class="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        stroke-width="4"
                                    />
                                    <path
                                        class="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                </svg>
                                <svg
                                    v-else
                                    class="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M5 13l4 4L19 7"
                                    />
                                </svg>
                                승인
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Teleport>

        <!-- Task Edit Modal -->
        <TaskEditModal
            :task="editingTask"
            :open="showEditModal"
            :tag-suggestions="tagService.getPopularTags(10).map((t) => t.tag)"
            @close="closeEditModal"
            @save="handleEditModalSave"
            @delete="handleEditModalDelete"
        />

        <!-- Live Streaming Preview Modal -->
        <Teleport to="body">
            <div
                v-if="showLivePreview && livePreviewTask"
                class="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
                <div
                    class="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    @click="closeLivePreview"
                ></div>
                <div
                    class="relative w-full max-w-4xl h-[70vh] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col"
                >
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-700"
                    >
                        <div class="flex items-center gap-3">
                            <div
                                class="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center"
                            >
                                <span class="text-lg">⚡️</span>
                            </div>
                            <div>
                                <h3 class="text-white font-semibold leading-tight">
                                    {{ livePreviewTask.title }}
                                </h3>
                                <p class="text-xs text-gray-400">실시간 AI 응답 스트리밍</p>
                            </div>
                        </div>
                        <button class="text-gray-400 hover:text-white" @click="closeLivePreview">
                            ✕
                        </button>
                    </div>

                    <div class="flex-1 overflow-y-auto bg-gray-950 p-4">
                        <pre
                            class="text-sm text-blue-100 whitespace-pre-wrap font-mono leading-snug"
                            >{{
                                liveStreamingContent ||
                                liveReviewContent ||
                                '스트리밍된 응답이 없습니다.'
                            }}
            </pre
                        >
                    </div>

                    <div
                        class="px-4 py-3 border-t border-gray-800 flex items-center justify-between"
                    >
                        <div class="text-xs text-gray-500">업데이트 중...</div>
                        <button
                            class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
                            @click="closeLivePreview"
                        >
                            닫기
                        </button>
                    </div>
                </div>
            </div>
        </Teleport>

        <!-- Enhanced Result Preview -->
        <EnhancedResultPreview
            :task="resultPreviewTask"
            :open="showResultPreview"
            @close="closeResultPreview"
            @approve="handleResultApprove"
            @rollback="handleVersionRestore"
        />

        <!-- Project Info Modal -->
        <ProjectInfoModal
            :project="project"
            :open="showProjectInfoModal"
            @close="showProjectInfoModal = false"
            @edit="showProjectInfoModal = false"
        />
    </div>
</template>
