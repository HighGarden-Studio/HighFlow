<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { Task, TaskHistoryEntry, InputTaskConfig } from '@core/types/database';
import type { AIProvider } from '../../services/ai/AIInterviewService';
import PromptEnhancerPanel from '../prompt/PromptEnhancerPanel.vue';
import PromptTemplatePicker from '../prompt/PromptTemplatePicker.vue';
import TaskExecutionProgress from './TaskExecutionProgress.vue';
import MacroInsertButton from '../common/MacroInsertButton.vue';

import AIProviderSelector from '../common/AIProviderSelector.vue';
import MCPToolSelector from '../common/MCPToolSelector.vue';
import IconRenderer from '../common/IconRenderer.vue';
import TagInput from '../common/TagInput.vue';
import OperatorSelector from '../common/OperatorSelector.vue';
import { useSettingsStore } from '../../renderer/stores/settingsStore';
import { useTaskStore } from '../../renderer/stores/taskStore';
import { useProjectStore } from '../../renderer/stores/projectStore';
import { useLocalAgentExecution } from '../../composables/useLocalAgentExecution';
import CodeEditor from '../common/CodeEditor.vue';
import OutputTaskConfigPanel from './OutputTaskConfigPanel.vue';
import MarkdownRenderer from '../common/MarkdownRenderer.vue';
import TaskExecutionLog from './TaskExecutionLog.vue';
import type { ScriptLanguage } from '@core/types/database';
import NotificationSettings from '../common/NotificationSettings.vue';
import { getAPI } from '../../utils/electron';

// Helper to check if a provider is a local agent
function isLocalAgentProvider(provider: string | null): {
    isLocal: boolean;
    agentType: LocalAgentType | null;
} {
    if (!provider) return { isLocal: false, agentType: null };

    const localAgentMap: Record<string, LocalAgentType> = {
        'claude-code': 'claude',
        codex: 'codex',
        antigravity: 'antigravity',
    };

    const agentType = localAgentMap[provider];
    return {
        isLocal: !!agentType,
        agentType: agentType || null,
    };
}

// Local Agent types
type LocalAgentType = 'claude' | 'codex' | 'antigravity';

interface Props {
    task: Task | null;
    open: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'save', task: Task): void;
    (e: 'execute', task: Task): void;
    (e: 'approve', task: Task): void;
    (e: 'reject', task: Task, feedback: string): void;
    (e: 'subdivide', task: Task): void;
}>();

// Settings store for AI providers
const settingsStore = useSettingsStore();
const projectStore = useProjectStore();

// Task store for global execution state
const taskStore = useTaskStore();

// Local Agent execution
const localAgentExecution = useLocalAgentExecution();

// Load settings on mount
onMounted(async () => {
    await settingsStore.loadSettings();
    // Check installed local agents
    await localAgentExecution.checkInstalledAgents();

    // Register curator event listeners
    const api = getAPI();
    const cleanupCuratorStarted = api.events.on('curator:started', (data: any) => {
        if (localTask.value?.id === data.taskId) {
            curatorEvents.value.push({ type: 'curator', ...data, timestamp: new Date() });
        }
    });

    const cleanupCuratorStep = api.events.on('curator:step', (data: any) => {
        if (localTask.value?.id === data.taskId) {
            curatorEvents.value.push({ type: 'curator', ...data, timestamp: new Date() });
        }
    });

    const cleanupCuratorCompleted = api.events.on('curator:completed', (data: any) => {
        if (localTask.value?.id === data.taskId) {
            curatorEvents.value.push({ type: 'curator', ...data, timestamp: new Date() });
        }
    });

    curatorListeners.push(cleanupCuratorStarted, cleanupCuratorStep, cleanupCuratorCompleted);
});

// Cleanup on unmount
onUnmounted(() => {
    localAgentExecution.closeSession();
    curatorListeners.forEach((cleanup) => cleanup());
});

// Local state
const curatorEvents = ref<any[]>([]);
const curatorListeners: (() => void)[] = [];
const localTask = ref<Task | null>(null);

// SAFELY access transcript to avoid TS errors during development
const localAgentTranscript = computed(() => {
    return (localAgentExecution as any).transcript?.value || [];
});
const activeTab = ref<'prompt' | 'settings' | 'details' | 'notifications' | 'comments' | 'history'>(
    'prompt'
);
const promptText = ref('');
const scriptCode = ref('');
const showScriptGuide = ref(false);
const scriptLanguage = ref<ScriptLanguage>('javascript');
const aiProvider = ref<AIProvider | null>(null);
const aiModel = ref<string | null>(null);
const reviewAiProvider = ref<AIProvider | null>(null);
const reviewAiModel = ref<string | null>(null);
const currentProvider = computed(() =>
    aiProvider.value ? settingsStore.aiProviders.find((p) => p.id === aiProvider.value) : undefined
);
const providerModelOptions = computed(() => {
    const provider = currentProvider.value;
    if (!provider) {
        return [];
    }
    const models = provider.models && provider.models.length > 0 ? provider.models : [];
    return models.map((modelId) => ({
        id: modelId,
        label: modelId === provider.defaultModel ? `${modelId} (기본)` : modelId,
    }));
});
const currentReviewProvider = computed(() =>
    reviewAiProvider.value
        ? settingsStore.aiProviders.find((p) => p.id === reviewAiProvider.value)
        : undefined
);
const reviewProviderModelOptions = computed(() => {
    const provider = currentReviewProvider.value;
    if (!provider) {
        return [];
    }
    const models = provider.models && provider.models.length > 0 ? provider.models : [];
    return models.map((modelId) => ({
        id: modelId,
        label: modelId === provider.defaultModel ? `${modelId} (기본)` : modelId,
    }));
});
function getDefaultModelForProvider(providerId: string | null): string | null {
    if (!providerId) return null;
    const provider = settingsStore.aiProviders.find((p) => p.id === providerId);
    if (!provider) return null;
    if (provider.defaultModel && provider.models?.includes(provider.defaultModel)) {
        return provider.defaultModel;
    }
    if (provider.models && provider.models.length > 0) {
        return provider.models[0] ?? null;
    }
    const fallbackDefaults: Record<string, string> = {
        anthropic: 'claude-3-5-sonnet-20250219',
        openai: 'gpt-4o-mini',
        google: 'gemini-2.5-pro',
        groq: 'llama-3.3-70b-versatile',
        mistral: 'mistral-large-latest',
        lmstudio: 'local-model',
    };
    return fallbackDefaults[providerId] ?? null;
}
const temperature = ref(0.7);
const maxTokens = ref(2000);
const isExecuting = ref(false);
const executionProgress = ref(0);
const streamingResult = ref('');
const comments = ref<Array<{ id: number; author: string; text: string; timestamp: Date }>>([]);
const newComment = ref('');

// Task Title Editing
const isEditingTitle = ref(false);
const editedTitle = ref('');

function startEditTitle() {
    if (!props.task) return;
    editedTitle.value = props.task.title;
    isEditingTitle.value = true;
}

function cancelEditTitle() {
    isEditingTitle.value = false;
    editedTitle.value = '';
}

async function saveTitle() {
    if (!props.task || !editedTitle.value.trim()) return;
    try {
        await taskStore.updateTask(props.task.projectId, props.task.projectSequence, {
            title: editedTitle.value,
        });
        isEditingTitle.value = false;
    } catch (error) {
        console.error('Failed to update task title:', error);
    }
}

// Details tab state
const priority = ref<'low' | 'medium' | 'high' | 'urgent' | 'critical'>('medium');
const tags = ref<string[]>([]);
const assignedOperatorId = ref<number | null>(null);
const estimatedMinutes = ref<number>(0);
const dueDate = ref<string>(''); // ISO format date-time string

// Task history state
const taskHistoryEntries = ref<TaskHistoryEntry[]>([]);
const isLoadingHistory = ref(false);
const expandedHistoryItems = ref<Set<number>>(new Set());

function toggleHistoryExpansion(id: number) {
    if (expandedHistoryItems.value.has(id)) {
        expandedHistoryItems.value.delete(id);
    } else {
        expandedHistoryItems.value.add(id);
    }
}

// Output format options
const outputFormatOptions = [
    { value: 'text', label: '텍스트 (Text)' },
    { value: 'markdown', label: '마크다운 (Markdown)' },
    { value: 'json', label: 'JSON' },
    { value: 'code', label: '코드 (Code)' },
    { value: 'html', label: 'HTML' },
    { value: 'pdf', label: 'PDF' },
    { value: 'csv', label: 'CSV' },
    { value: 'yaml', label: 'YAML' },
    { value: 'sql', label: 'SQL' },
    { value: 'shell', label: 'Shell Script' },
    { value: 'mermaid', label: 'Mermaid 다이어그램' },
    { value: 'svg', label: 'SVG 이미지' },
    { value: 'png', label: 'PNG 이미지' },
    { value: 'mp4', label: 'MP4 비디오' },
    { value: 'mp3', label: 'MP3 오디오' },
    { value: 'diff', label: 'Diff (코드 변경사항)' },
    { value: 'log', label: 'Log 파일' },
];

// 프롬프트 도구 상태
const showPromptEnhancer = ref(false);
const showTemplatePicker = ref(false);

// 프롬프트 textarea ref for macro insertion
const promptTextarea = ref<HTMLTextAreaElement | null>(null);

const baseDevFolder = computed(() => {
    const project = projectStore.currentProject as any;
    return project?.baseDevFolder || null;
});
const isDevProject = computed(() => !!baseDevFolder.value);

// 매크로 삽입 핸들러
function handleMacroInsert(macro: string) {
    if (!promptTextarea.value) return;

    const textarea = promptTextarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = promptText.value;

    // 커서 위치에 매크로 삽입
    promptText.value = text.substring(0, start) + macro + text.substring(end);

    // 커서를 삽입된 매크로 뒤로 이동
    setTimeout(() => {
        textarea.focus();
        const newPosition = start + macro.length;
        textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
}

// 의존성 태스크 ID 목록 (트리거 설정에서 가져옴)
const dependentTaskIdList = computed(() => {
    if (!dependencyTaskIds.value.trim()) return [];
    return dependencyTaskIds.value
        .split(',')
        .map((id) => parseInt(id.trim()))
        .filter((id) => !isNaN(id));
});

// MCP 도구 선택 상태
const selectedMCPTools = ref<string[]>([]);
// interfaces KeyValuePair, MCPConfigFormEntry and ref taskMCPConfig removed

// Local Agent 실행 옵션
const executionMode = ref<'api' | 'local'>('api');
const selectedLocalAgent = ref<LocalAgentType | null>(null);
const localAgentWorkingDir = ref('');

// 자동 실행 트리거 설정
const autoReview = ref(false);
const triggerType = ref<'none' | 'dependency' | 'time'>('none');
const dependencyTaskIds = ref<string>(''); // Comma-separated task IDs
const dependencyOperator = ref<'all' | 'any'>('all');
const dependencyExpression = ref<string>(''); // Complex boolean expression
const dependencyExecutionPolicy = ref<'once' | 'repeat'>('repeat'); // 자동 실행 정책 (디폴트: 매번 자동 실행)
const scheduleType = ref<'once' | 'recurring'>('once');
const scheduledDatetime = ref('');
const cronExpression = ref('');
const timezone = ref('Asia/Seoul');

// Helper: Convert task IDs (sequences) to string for display
const taskIdsToSequences = (taskIds: number[] | undefined): string => {
    if (!taskIds || !Array.isArray(taskIds)) return '';
    return taskIds.join(', ');
};

// Helper: Convert string sequences to task IDs (sequences) for saving
const sequencesToTaskIds = (sequences: string): number[] => {
    if (!sequences) return [];
    return sequences
        .split(',')
        .map((seq) => parseInt(seq.trim()))
        .filter((seq) => !isNaN(seq));
};

// Watch for task changes
const isInitializing = ref(false);
const previousTaskId = ref<string | null>(null);
const isSavingInternally = ref(false); // Track internal saves to prevent re-initialization

// Watch for task changes
watch(
    () => props.task,
    async (newTask) => {
        if (!props.open) return;
        if (newTask) {
            // Skip re-initialization if this update is from our own save
            if (isSavingInternally.value) {
                console.log('[TaskDetailPanel] Skipping re-initialization (internal save)');
                // Just update localTask to keep in sync
                localTask.value = { ...newTask };
                return;
            }

            // Only re-initialize if this is a different task
            // For the same task, Vue's reactivity will handle updates
            const newTaskKey = `${newTask.projectId}_${newTask.projectSequence}`;
            if (previousTaskId.value === newTaskKey) {
                // Same task - skip re-initialization to prevent loops
                return;
            }

            previousTaskId.value = newTaskKey;
            isInitializing.value = true;
            try {
                localTask.value = { ...newTask };
                promptText.value = newTask.description || '';

                // Initialize script fields for script tasks
                console.log('[TaskDetailPanel] Task loaded:', {
                    id: newTask.id,
                    title: newTask.title,
                    taskType: newTask.taskType,
                    scriptLanguage: newTask.scriptLanguage,
                    hasScriptCode: !!newTask.scriptCode,
                });
                if (newTask.taskType === 'script') {
                    scriptCode.value = newTask.scriptCode || '';
                    scriptLanguage.value =
                        (newTask.scriptLanguage as ScriptLanguage) || 'javascript';
                }

                // Inherit from project if task doesn't have explicit settings
                const project = projectStore.currentProject;
                const effectiveProvider = (newTask.aiProvider ||
                    project?.aiProvider ||
                    null) as AIProvider | null;
                const effectiveModel = newTask.aiModel || project?.aiModel || null;

                aiProvider.value = effectiveProvider;
                aiModel.value = effectiveModel;

                // For review settings, also inherit from project if not set
                reviewAiProvider.value = (newTask.reviewAiProvider ||
                    effectiveProvider) as AIProvider | null;
                reviewAiModel.value =
                    newTask.reviewAiModel ||
                    effectiveModel ||
                    getDefaultModelForProvider(reviewAiProvider.value);
                autoReview.value = newTask.autoReview || false;
                selectedMCPTools.value = Array.isArray(newTask.requiredMCPs)
                    ? [...newTask.requiredMCPs]
                    : [];

                if (!localAgentWorkingDir.value && baseDevFolder.value) {
                    localAgentWorkingDir.value = baseDevFolder.value;
                }

                // Check if aiProvider is a local agent and set execution mode accordingly
                const aiProviderInfo = isLocalAgentProvider(effectiveProvider);
                if (aiProviderInfo.isLocal) {
                    executionMode.value = 'local';
                    selectedLocalAgent.value = aiProviderInfo.agentType;
                } else {
                    executionMode.value = 'api';
                    selectedLocalAgent.value = null;
                }

                // 트리거 설정 로드
                if (newTask.triggerConfig) {
                    if (newTask.triggerConfig.dependsOn) {
                        triggerType.value = 'dependency';
                        // Convert task IDs to project sequences for display
                        dependencyTaskIds.value = taskIdsToSequences(
                            newTask.triggerConfig.dependsOn.taskIds
                        );
                        dependencyOperator.value = newTask.triggerConfig.dependsOn.operator;
                        dependencyExpression.value =
                            newTask.triggerConfig.dependsOn.expression || '';
                        dependencyExecutionPolicy.value =
                            newTask.triggerConfig.dependsOn.executionPolicy || 'once';
                    } else if (newTask.triggerConfig.scheduledAt) {
                        triggerType.value = 'time';
                        scheduleType.value = newTask.triggerConfig.scheduledAt.type;
                        scheduledDatetime.value = newTask.triggerConfig.scheduledAt.datetime || '';
                        cronExpression.value = newTask.triggerConfig.scheduledAt.cron || '';
                        timezone.value = newTask.triggerConfig.scheduledAt.timezone || 'Asia/Seoul';
                    }
                } else {
                    triggerType.value = 'none';
                }

                // Details tab 필드 초기화
                priority.value = newTask.priority || 'medium';
                tags.value = newTask.tags
                    ? typeof newTask.tags === 'string'
                        ? JSON.parse(newTask.tags)
                        : newTask.tags
                    : [];
                assignedOperatorId.value = newTask.assignedOperatorId || null;
                estimatedMinutes.value = newTask.estimatedMinutes || 0;
                dueDate.value = newTask.dueDate
                    ? typeof newTask.dueDate === 'string'
                        ? newTask.dueDate
                        : new Date(newTask.dueDate).toISOString()
                    : '';

                // Load History
                await loadTaskHistory();
            } catch (error) {
                console.error('Failed to initialize task detail panel:', error);
            } finally {
                isInitializing.value = false;
            }
        } else {
            previousTaskId.value = null;
            localTask.value = null;
            selectedMCPTools.value = [];
            aiModel.value = null;
            reviewAiProvider.value = null;
            reviewAiProvider.value = null;
            reviewAiModel.value = null;
            curatorEvents.value = []; // Reset events
        }
    },
    { immediate: true }
);

// Dev 프로젝트가 아니면 로컬 모드 제한
watch(isDevProject, (isDev) => {
    if (!isDev && executionMode.value === 'local') {
        executionMode.value = 'api';
    }
});

// Persist execution-related changes
watch([aiProvider, executionMode, selectedLocalAgent, localAgentWorkingDir], () => {
    if (isInitializing.value) return;
    persistExecutionSettings();
});

// Sync aiProvider when Local Agent is selected
watch(selectedLocalAgent, (newAgent) => {
    if (isInitializing.value) return;
    if (executionMode.value === 'local' && newAgent) {
        const agentTypeToProviderId: Record<LocalAgentType, string> = {
            claude: 'claude-code',
            codex: 'codex',
            antigravity: 'antigravity',
        };
        const newProvider = agentTypeToProviderId[newAgent] as AIProvider;
        if (aiProvider.value !== newProvider) {
            console.log('[TaskDetailPanel] Syncing aiProvider to local agent:', newProvider);
            aiProvider.value = newProvider;
        }
    }
});

// Sync aiProvider when Execution Mode changes
watch(executionMode, (newMode) => {
    if (isInitializing.value) return;

    if (newMode === 'local') {
        if (selectedLocalAgent.value) {
            const agentTypeToProviderId: Record<LocalAgentType, string> = {
                claude: 'claude-code',
                codex: 'codex',
                antigravity: 'antigravity',
            };
            const newProvider = agentTypeToProviderId[selectedLocalAgent.value] as AIProvider;
            if (aiProvider.value !== newProvider) {
                console.log('[TaskDetailPanel] Mode -> Local: Syncing aiProvider:', newProvider);
                aiProvider.value = newProvider;
            }
            // Clear API model for local agent
            aiModel.value = null;
        }
    } else if (newMode === 'api') {
        // Safe check for local provider
        const currentProvider = aiProvider.value;
        const currentIsLocal = currentProvider && isLocalAgentProvider(currentProvider).isLocal;

        if (currentIsLocal) {
            console.log('[TaskDetailPanel] Mode -> API: Resetting local provider');
            aiProvider.value = null;
            aiModel.value = null;
        }
    }
});

watch(
    () => aiProvider.value,
    (provider) => {
        // If provider is null or local agent, don't set default model from API providers
        if (!provider || isLocalAgentProvider(provider).isLocal) return;

        const defaultModel = getDefaultModelForProvider(provider);
        if (!providerModelOptions.value.some((opt) => opt.id === aiModel.value) || !aiModel.value) {
            aiModel.value = defaultModel;
        }
    }
);

watch(
    () => providerModelOptions.value,
    () => {
        if (!providerModelOptions.value.some((opt) => opt.id === aiModel.value)) {
            aiModel.value = getDefaultModelForProvider(aiProvider.value);
        }
    },
    { deep: true }
);

watch(aiModel, () => {
    if (isInitializing.value) return;
    persistExecutionSettings();
});

watch(
    () => reviewAiProvider.value,
    (provider) => {
        const defaultModel = getDefaultModelForProvider(provider);
        if (
            !reviewProviderModelOptions.value.some((opt) => opt.id === reviewAiModel.value) ||
            !reviewAiModel.value
        ) {
            reviewAiModel.value = defaultModel;
        }
        if (isInitializing.value) return;
        persistExecutionSettings();
    }
);

watch(
    () => reviewProviderModelOptions.value,
    () => {
        if (!reviewProviderModelOptions.value.some((opt) => opt.id === reviewAiModel.value)) {
            reviewAiModel.value = getDefaultModelForProvider(reviewAiProvider.value);
        }
    },
    { deep: true }
);

watch(reviewAiModel, () => {
    if (isInitializing.value) return;
    persistExecutionSettings();
});

// Enforce mutual exclusivity between autoReview and autoApprove
watch(autoReview, (newValue) => {
    if (isInitializing.value) return;
    if (newValue && localTask.value?.autoApprove) {
        // Disable autoApprove when autoReview is enabled
        localTask.value.autoApprove = false;
    }
});

watch(
    () => localTask.value?.autoApprove,
    (newValue) => {
        if (isInitializing.value) return;
        if (newValue && autoReview.value) {
            // Disable autoReview when autoApprove is enabled
            autoReview.value = false;
        }
    }
);

// Watch for tab changes to load history
watch(activeTab, (newTab) => {
    if (newTab === 'history' && localTask.value?.id) {
        loadTaskHistory();
    }
});

// Listen for new history events to refresh list
onMounted(() => {
    if (window.electron.events) {
        window.electron.events.on('task-history:created', (data: any) => {
            console.log('📜 [TaskDetailPanel] Received task-history:created event:', data);

            // Handle both schema property names (taskProjectId) and potential standard names (projectId)
            const pId = data.taskProjectId || data.projectId;
            const seq = data.taskSequence || data.projectSequence;

            if (
                localTask.value &&
                pId === localTask.value.projectId &&
                seq === localTask.value.projectSequence
            ) {
                console.log('📜 [TaskDetailPanel] Refreshing history for task');
                // Always reload if it matches current task, regardless of tab (so it's ready when switched)
                // Or only if active? If we don't reload now, `watch(activeTab)` will reload when we switch.
                // But if we ARE on history tab, we must reload.
                if (activeTab.value === 'history') {
                    loadTaskHistory();
                }
            }
        });
    }
});

watch(
    () => [...selectedMCPTools.value],
    () => {
        // If MCPToolSelector updates localTask.mcpConfig directly, we might not need to do much here
        // other than ensure persistence happens if this list changes.
        // Also if we remove a tool, we might want to cleanup mcpConfig, but retaining it is also fine.
        if (isInitializing.value || isSavingInternally.value) return;
        persistExecutionSettings();
    },
    { immediate: true }
);

watch(
    () => localTask.value?.mcpConfig,
    () => {
        if (isInitializing.value || isSavingInternally.value) return;
        persistExecutionSettings();
    },
    { deep: true }
);

// Watch for trigger setting changes
watch(
    [
        triggerType,
        dependencyTaskIds,
        dependencyOperator,
        dependencyExpression,
        dependencyExecutionPolicy,
        scheduleType,
        scheduledDatetime,
        cronExpression,
        timezone,
    ],
    () => {
        if (isInitializing.value) return;
        persistExecutionSettings();
    }
);

/**
 * Build trigger config from local state
 */
function buildTriggerConfig(): any {
    if (triggerType.value === 'dependency') {
        // Convert project sequences to task IDs
        // Even if empty, we might return config if expression is present?
        // But usually we need taskIds as reference.
        // Assuming user enters something.
        const taskIds = sequencesToTaskIds(dependencyTaskIds.value);
        if (taskIds.length > 0 || dependencyExpression.value.trim()) {
            return {
                dependsOn: {
                    taskIds,
                    operator: dependencyOperator.value,
                    expression: dependencyExpression.value.trim() || undefined,
                    executionPolicy: dependencyExecutionPolicy.value,
                },
            };
        }
    } else if (triggerType.value === 'time') {
        if (scheduleType.value === 'once' && scheduledDatetime.value) {
            return {
                scheduledAt: {
                    type: 'once' as const,
                    datetime: scheduledDatetime.value,
                    timezone: timezone.value,
                },
            };
        } else if (scheduleType.value === 'recurring' && cronExpression.value) {
            return {
                scheduledAt: {
                    type: 'recurring' as const,
                    cron: cronExpression.value,
                    timezone: timezone.value,
                },
            };
        }
    }
    return null;
}

/**
 * Get estimated cost based on tokens
 */
const estimatedCost = computed(() => {
    if (!aiProvider.value) return 0;

    const costPerToken: Record<string, number> = {
        anthropic: 0.000015, // Claude 3.5 Sonnet
        openai: 0.00001, // GPT-4
        google: 0.000005, // Gemini Pro
    };

    return (maxTokens.value * (costPerToken[aiProvider.value] || 0)).toFixed(4);
});

/**
 * Get priority color
 */
const priorityColor = computed(() => {
    switch (localTask.value?.priority) {
        case 'urgent':
            return 'bg-red-500 text-white';
        case 'high':
            return 'bg-orange-500 text-white';
        case 'medium':
            return 'bg-yellow-500 text-white';
        case 'low':
            return 'bg-blue-500 text-white';
        default:
            return 'bg-gray-500 text-white';
    }
});

/**
 * Get status badge color
 */
const statusColor = computed(() => {
    switch (localTask.value?.status) {
        case 'todo':
            return 'bg-gray-500 text-white';
        case 'in_progress':
            return 'bg-blue-500 text-white';
        case 'in_review':
            return 'bg-purple-500 text-white';
        case 'done':
            return 'bg-green-500 text-white';
        case 'blocked':
            return 'bg-red-500 text-white';
        default:
            return 'bg-gray-500 text-white';
    }
});

/**
 * Check if task can be subdivided (1뎁스, TODO 상태, 아직 세분화되지 않음)
 */
const canSubdivide = computed(() => {
    return (
        localTask.value?.parentTaskId === null &&
        localTask.value?.status === 'todo' &&
        !localTask.value?.isSubdivided
    );
});

/**
 * Get all AI providers with connection status
 */
const allAIProviders = computed(() => {
    return settingsStore.aiProviders.map((provider) => ({
        ...provider,
        // Check if provider is connected (has API key or OAuth and is enabled)
        isConnected: provider.enabled && (!!provider.apiKey || provider.isConnected),
    }));
});

/**
 * Check if selected provider is connected
 */
const isSelectedProviderConnected = computed(() => {
    // For local agent mode, check if the agent is installed
    if (executionMode.value === 'local') {
        if (!selectedLocalAgent.value) return false;
        const agentStatus = localAgentExecution.installedAgents.value.get(selectedLocalAgent.value);
        return agentStatus?.installed ?? false;
    }

    // For API mode, check provider connection
    if (!aiProvider.value) return false;
    const provider = allAIProviders.value.find((p) => p.id === aiProvider.value);
    return provider?.isConnected ?? false;
});

/**
 * Check if task is currently executing (from global state)
 */
const isGloballyExecuting = computed(() => {
    if (!localTask.value) return false;
    return taskStore.isTaskExecuting({
        projectId: localTask.value.projectId,
        projectSequence: localTask.value.projectSequence,
    });
});

/**
 * Check if execution is allowed (provider is selected and connected)
 */
const canExecute = computed(() => {
    // Don't allow execution if task is already executing
    if (isGloballyExecuting.value || isExecuting.value) return false;

    if (executionMode.value === 'local') {
        return (
            selectedLocalAgent.value &&
            localAgentExecution.installedAgents.value.get(selectedLocalAgent.value)?.installed &&
            localAgentWorkingDir.value &&
            !localAgentExecution.isExecuting.value
        );
    }
    return aiProvider.value && isSelectedProviderConnected.value;
});

/**
 * Get available local agents with their install status
 */
const availableLocalAgents = computed(() => {
    const agents: {
        id: LocalAgentType;
        name: string;
        icon: string;
        installed: boolean;
        version?: string;
    }[] = [
        { id: 'claude', name: 'Claude Code', icon: '🤖', installed: false },
        { id: 'codex', name: 'OpenAI Codex', icon: '💻', installed: false },
        { id: 'antigravity', name: 'Antigravity', icon: '🚀', installed: false },
    ];

    agents.forEach((agent) => {
        const status = localAgentExecution.installedAgents.value.get(agent.id);
        if (status) {
            agent.installed = status.installed;
            agent.version = status.version;
        }
    });

    return agents;
});

/**
 * Check if any local agent is installed
 */
const hasInstalledLocalAgent = computed(() => {
    return isDevProject.value && availableLocalAgents.value.some((a) => a.installed);
});

/**
 * Check if task is in read-only mode (executing and not paused)
 */
const isReadOnly = computed(() => {
    return localTask.value?.status === 'in_progress' && !localTask.value?.isPaused;
});

const baseWorkingDirPlaceholder = computed(() => baseDevFolder.value || '/path/to/project');

function persistExecutionSettings() {
    if (!localTask.value) return;

    // Set flag to prevent re-initialization from our own save
    isSavingInternally.value = true;

    emit('save', {
        ...localTask.value,
        aiProvider: aiProvider.value,
        aiModel: executionMode.value === 'local' ? null : aiModel.value,
        reviewAiProvider: reviewAiProvider.value,
        reviewAiModel: reviewAiModel.value,
        executionType: executionMode.value === 'local' ? 'serial' : localTask.value.executionType,
        localAgent: selectedLocalAgent.value as any,
        localAgentWorkingDir: localAgentWorkingDir.value,
        requiredMCPs: [...selectedMCPTools.value],
        mcpConfig: localTask.value.mcpConfig,
        expectedOutputFormat: localTask.value.expectedOutputFormat,
        triggerConfig: buildTriggerConfig(),
        notificationConfig: localTask.value.notificationConfig,
    } as Task);

    // Reset flag after save completes (use timeout to ensure task prop update happens first)
    setTimeout(() => {
        isSavingInternally.value = false;
    }, 100);
}

// function createKeyValuePair removed
// function ensureMCPConfigEntry removed (if present)

// function ensureMCPConfigEntry, mapToPairs, pairsToRecord, loadTaskMCPConfig, buildMCPConfigPayload removed
// because MCPToolSelector now handles form state and inheritance internally.

// function syncLocalMCPConfig removed

/**
 * Input Task Config Helpers
 */
function getInputConfig(): InputTaskConfig {
    if (!localTask.value?.inputConfig) {
        return {
            sourceType: 'USER_INPUT',
            userInput: { message: '', required: true, mode: 'short' },
        };
    }
    if (typeof localTask.value.inputConfig === 'string') {
        try {
            return JSON.parse(localTask.value.inputConfig);
        } catch {
            return {
                sourceType: 'USER_INPUT',
                userInput: { message: '', required: true, mode: 'short' },
            };
        }
    }
    return localTask.value.inputConfig as InputTaskConfig;
}

function updateTaskProperty(key: string, value: any) {
    if (!localTask.value) return;
    // @ts-ignore
    localTask.value[key] = value;
}

function updateInputConfig(key: keyof InputTaskConfig, value: any) {
    if (!localTask.value) return;
    const current = getInputConfig();
    const updated = { ...current, [key]: value };
    // Keep as object - taskStore will handle JSON serialization
    (localTask.value as any).inputConfig = updated;
    emit('save', localTask.value);
}

function toggleFileExtension(ext: string, checked: boolean) {
    if (!localTask.value) return;
    const config = getInputConfig();
    const localFile = config.localFile || { acceptedExtensions: [], readMode: 'text' };
    let extensions = localFile.acceptedExtensions || [];

    if (checked) {
        if (!extensions.includes(ext)) extensions.push(ext);
    } else {
        extensions = extensions.filter((e) => e !== ext);
    }

    updateInputConfig('localFile', { ...localFile, acceptedExtensions: extensions });
}

async function handleSelectLocalFile() {
    if (!localTask.value) return;

    try {
        const config = getInputConfig();
        const extensions = config.localFile?.acceptedExtensions || [];

        // Prepare filters based on accepted extensions
        // IMPORTANT: Must copy to plain array to avoid sending Vue Proxy to IPC (causes Clone Error)
        const filters =
            extensions.length > 0
                ? [{ name: 'Allowed Files', extensions: [...extensions] }]
                : undefined;

        console.log('[TaskDetailPanel] Opening file dialog with filters:', filters);
        const filePath = await getAPI().fs.selectFile(filters);

        if (filePath) {
            updateInputConfig('localFile', {
                ...config.localFile,
                filePath,
                acceptedExtensions: config.localFile?.acceptedExtensions || [],
                readMode: config.localFile?.readMode || 'text',
            });
        }
    } catch (error) {
        console.error('Failed to select file:', error);
    }
}

/**
 * Handle save
 */
function handleSave() {
    if (!localTask.value) return;

    const updatedTask = {
        ...localTask.value,
        description: promptText.value,
        aiProvider: aiProvider.value,
        aiModel: aiModel.value,
        reviewAiProvider: reviewAiProvider.value,
        reviewAiModel: reviewAiModel.value,
        autoReview: autoReview.value,
        triggerConfig: buildTriggerConfig(), // Use the shared helper
        requiredMCPs: [...selectedMCPTools.value],
        mcpConfig: localTask.value.mcpConfig,
        expectedOutputFormat: localTask.value.expectedOutputFormat,
        assignedOperatorId: assignedOperatorId.value,
        // Script task fields
        scriptCode: scriptCode.value,
        scriptLanguage: scriptLanguage.value,
    };

    emit('save', updatedTask as Task);
}

// Handle details tab update
async function handleDetailsUpdate() {
    if (!localTask.value) return;

    const updatedTask = {
        ...(localTask.value as any), // Cast to any to allow overriding properties safely
        priority: priority.value,
        tags: tags.value, // Use array directly, backend/drizzle handles JSON serialization
        assignedOperatorId: assignedOperatorId.value,
        estimatedMinutes: estimatedMinutes.value,
        dueDate: dueDate.value ? new Date(dueDate.value).toISOString() : null,
    };

    // Optimistic update
    localTask.value = updatedTask as Task;

    // Delegate API call to parent's handler (taskStore)
    emit('save', updatedTask as Task);
}

/**
 * Handle Local Agent execution
 */
async function handleLocalAgentExecute() {
    if (!localTask.value || !selectedLocalAgent.value || !localAgentWorkingDir.value) return;

    isExecuting.value = true;
    executionProgress.value = 0;
    const startTime = Date.now();

    try {
        // Update task status to in_progress
        localTask.value.status = 'in_progress';
        localTask.value.startedAt = new Date();

        // Execute task with local agent
        const result = await localAgentExecution.executeTaskWithLocalAgent(
            localTask.value,
            selectedLocalAgent.value,
            localAgentWorkingDir.value
        );

        if (result) {
            streamingResult.value = result.content;
            executionProgress.value = 100;

            // Update task with execution results
            const duration = Date.now() - startTime;

            // Convert token usage from agent format to database format
            const tokenUsage = result.stats.tokenUsage
                ? {
                      promptTokens: result.stats.tokenUsage.input,
                      completionTokens: result.stats.tokenUsage.output,
                      totalTokens: result.stats.tokenUsage.input + result.stats.tokenUsage.output,
                  }
                : null;

            const updatedTask: Task = {
                ...localTask.value,
                status: result.error ? 'blocked' : 'in_review',
                generatedPrompt: result.content,
                actualMinutes: Math.ceil(duration / 60000),
                tokenUsage,
                blockedReason: result.error || null,
            };

            if (!result.error) {
                updatedTask.completedAt = new Date();
            }

            // Emit save to persist changes
            emit('save', updatedTask);
            localTask.value = updatedTask;

            console.log('Local Agent execution completed:', {
                agentType: selectedLocalAgent.value,
                duration: result.stats.duration,
                sessionId: result.stats.sessionId,
                messageCount: result.stats.messageCount,
            });
        }
    } catch (error) {
        console.error('Local Agent execution failed:', error);
        streamingResult.value = `실행 오류: ${(error as Error).message}`;

        // Update task status to blocked
        if (localTask.value) {
            localTask.value.status = 'blocked';
            localTask.value.blockedReason = (error as Error).message;
            emit('save', localTask.value);
        }
    } finally {
        isExecuting.value = false;
    }
}

/**
 * Select working directory for local agent
 */
async function selectWorkingDirectory() {
    try {
        const dir = await window.electron.fs.selectDirectory();
        if (dir) {
            localAgentWorkingDir.value = dir;
        }
    } catch (error) {
        console.error('Failed to select directory:', error);
    }
}

/**
 * Handle approve (move to done)
 */

/**
 * Handle execution completed from TaskExecutionProgress
 */
function handleExecutionCompleted(result: { content: string; stats: unknown }) {
    if (!localTask.value) return;
    console.log('Execution completed:', result);
    streamingResult.value = result.content;
    // Task status will be updated via IPC events
}

/**
 * Handle execution failed from TaskExecutionProgress
 */
function handleExecutionFailed(error: string) {
    console.error('Execution failed:', error);
    streamingResult.value = `Error: ${error}`;
}

/**
 * Handle execution stopped from TaskExecutionProgress
 */
function handleExecutionStopped() {
    console.log('Execution stopped');
    isExecuting.value = false;
}

/**
 * Handle approval required from TaskExecutionProgress
 */
function handleApprovalRequired(data: { question: string; options?: string[] }) {
    console.log('Approval required:', data);
    // UI is handled by TaskExecutionProgress component
}

/**
 * Handle request changes (for in_review status)
 */

/**
 * Handle unblock task
 */

/**
 * Handle close
 */
function handleClose() {
    emit('close');
}

/**
 * Handle subdivide
 */
function handleSubdivide() {
    if (!localTask.value) return;
    emit('subdivide', localTask.value);
}

/**
 * Handle execute
 */
async function handleExecute() {
    if (!localTask.value) return;

    try {
        // Check if it's a script task or AI task
        if (localTask.value.taskType === 'script') {
            // Execute script task via taskExecution API (unified handler)
            console.log(`Executing script task ${localTask.value.id}`);

            if (!localTask.value.scriptCode) {
                alert('스크립트 코드가 없습니다.');
                return;
            }

            // Use the unified taskExecution API instead of tasks.executeScript
            const api = window.electron?.taskExecution;
            if (!api) {
                alert('Task execution API not available');
                return;
            }

            if (localTask.value.projectId && localTask.value.projectSequence) {
                const result = await api.execute(
                    localTask.value.projectId,
                    localTask.value.projectSequence
                );
                if (result.success) {
                    console.log('Script execution completed:', result);
                } else {
                    console.error('Script execution failed:', result.error);
                }
            } else {
                alert('Task execution failed: Missing project ID or sequence.');
            }
        } else {
            // Execute AI task (existing logic)
            console.log(`Executing AI task ${localTask.value.id}`);
            // Local Agent 실행 모드
            if (
                executionMode.value === 'local' &&
                selectedLocalAgent.value &&
                localAgentWorkingDir.value
            ) {
                await handleLocalAgentExecute();
                return;
            }
            emit('execute', localTask.value);
        }
    } catch (error) {
        console.error('Task execution error:', error);
        alert(`실행 오류: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Notification config helpers
function parseNotificationConfig(config: any): any {
    if (!config) return null;
    try {
        return typeof config === 'string' ? JSON.parse(config) : config;
    } catch (error) {
        console.error('Failed to parse notification config:', error);
        return null;
    }
}

async function handleUpdateNotificationConfig(config: any) {
    if (!localTask.value) return;

    try {
        const api = getAPI();
        if (!api) {
            console.warn(
                '[TaskDetailPanel] Electron API not available, skipping notification config update'
            );
            return;
        }

        // Update task notification config via API
        console.log('[TaskDetailPanel] Saving notification config:', config);

        // @ts-ignore - API method exists
        const updatedTask = await api.tasks.updateNotificationConfig(
            localTask.value.projectId,
            localTask.value.projectSequence,
            config
        );

        // 업데이트된 태스크로 localTask 갱신
        if (updatedTask) {
            localTask.value = updatedTask;
            console.log('[TaskDetailPanel] Notification config saved successfully');
        }
    } catch (error) {
        console.error('[TaskDetailPanel] Failed to update notification config:', error);
        alert(`알림 설정 저장 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function handleTestNotification(config: any) {
    if (!localTask.value) return;

    console.log('Test notification requested with config:', config);

    try {
        const api = getAPI();
        if (!api) {
            alert('Electron API를 사용할 수 없습니다.');
            return;
        }

        if (!config || (!config.slack?.webhookUrl && !config.webhook?.url)) {
            alert('알림 설정을 먼저 입력해주세요. (Slack Webhook URL 또는 Custom Webhook URL)');
            return;
        }

        // Send test notification via API
        // @ts-ignore - API method exists
        await api.tasks.sendTestNotification(
            localTask.value.projectId,
            localTask.value.projectSequence,
            config
        );

        alert('테스트 알림이 전송되었습니다. 웹훅 URL을 확인해주세요.');
    } catch (error) {
        console.error('Failed to send test notification:', error);
        alert(`테스트 알림 전송 실패: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Add comment
 */
function addComment() {
    if (!newComment.value.trim()) return;

    comments.value.push({
        id: Date.now(),
        author: '현재 사용자', // TODO: Get from auth
        text: newComment.value,
        timestamp: new Date(),
    });

    newComment.value = '';
}

/**
 * Apply enhanced prompt from enhancer panel
 */
function applyEnhancedPrompt(enhancedPrompt: string) {
    promptText.value = enhancedPrompt;
    showPromptEnhancer.value = false;
}

/**
 * Apply template prompt
 */
function applyTemplatePrompt(templatePrompt: string) {
    promptText.value = templatePrompt;
    showTemplatePicker.value = false;
}

/**
 * Format date
 */
function formatDate(date: Date | string | null | undefined): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    return d.toLocaleString('ko-KR');
}

// Load task history
// Load task history
async function loadTaskHistory() {
    // if (!localTask.value?.id) return; // Removed ID check because usage is inconsistent with composite keys

    isLoadingHistory.value = true;
    try {
        if (localTask.value?.projectId && localTask.value?.projectSequence) {
            const history = await window.electron.taskHistory.getByTask(
                localTask.value.projectId,
                localTask.value.projectSequence
            );
            taskHistoryEntries.value = history as TaskHistoryEntry[];
        } else {
            // console.warn('📜 [TaskDetailPanel] Missing projectId or sequence');
        }
    } catch (error) {
        console.error('Failed to load task history:', error);
        taskHistoryEntries.value = [];
    } finally {
        isLoadingHistory.value = false;
    }
}

// Get history event icon
function getHistoryEventIcon(eventType: string): string {
    const icons: Record<string, string> = {
        execution_started: '🚀',
        execution_completed: '✅',
        execution_failed: '❌',
        ai_review_requested: '🔍',
        ai_review_completed: '📋',
        prompt_refined: '✏️',
        status_changed: '🔄',
        paused: '⏸️',
        resumed: '▶️',
        stopped: '⏹️',
        approval_requested: '❓',
        approved: '👍',
        rejected: '👎',
        review_completed: '✔️',
        changes_requested: '📝',
    };
    return icons[eventType] || '📌';
}

// Get history event color
function getHistoryEventColor(eventType: string): string {
    const colors: Record<string, string> = {
        execution_started: 'bg-blue-500',
        execution_completed: 'bg-green-500',
        execution_failed: 'bg-red-500',
        ai_review_requested: 'bg-purple-500',
        ai_review_completed: 'bg-purple-400',
        prompt_refined: 'bg-yellow-500',
        status_changed: 'bg-gray-500',
        paused: 'bg-orange-500',
        resumed: 'bg-blue-400',
        stopped: 'bg-red-400',
        approval_requested: 'bg-amber-500',
        approved: 'bg-green-400',
        rejected: 'bg-red-400',
        review_completed: 'bg-green-500',
        changes_requested: 'bg-yellow-500',
    };
    return colors[eventType] || 'bg-gray-500';
}

// Get history event title
function getHistoryEventTitle(eventType: string): string {
    const titles: Record<string, string> = {
        execution_started: '실행 시작',
        execution_completed: '실행 완료',
        execution_failed: '실행 실패',
        ai_review_requested: 'AI 검토 요청',
        ai_review_completed: 'AI 검토 완료',
        prompt_refined: '프롬프트 수정',
        status_changed: '상태 변경',
        paused: '일시정지',
        resumed: '재개',
        stopped: '중지',
        approval_requested: '승인 요청',
        approved: '승인됨',
        rejected: '거절됨',
        review_completed: '리뷰 완료',
        changes_requested: '수정 요청',
    };
    return titles[eventType] || eventType;
}

// Format history event data for display
function formatHistoryEventData(entry: TaskHistoryEntry, skipContent: boolean = false): string {
    if (!entry.eventData) return '';

    const data = entry.eventData;
    const parts: string[] = [];

    // Helper to check if content is base64 image
    const isBase64Image = (content: string): boolean => {
        if (!content || content.length < 100) return false;
        const base64Regex = /^[A-Za-z0-9+/=]+$/;
        return base64Regex.test(content.trim());
    };

    // Common fields
    if (!skipContent && data.content && typeof data.content === 'string') {
        // Check if it's an image (base64)
        if (isBase64Image(data.content)) {
            parts.push(`결과: [이미지 생성됨]`);
        } else if (data.content.length > 1200) {
            // Truncate long text
            parts.push(`결과: ${data.content.substring(0, 1200)}...`);
        } else {
            parts.push(`결과: ${data.content}`);
        }
    }
    if (data.error) {
        parts.push(`오류: ${data.error}`);
    }
    if (data.prompt) {
        parts.push(`프롬프트: ${data.prompt}`);
    }
    if (data.reviewPrompt) {
        parts.push(`검토 요청: ${data.reviewPrompt}`);
    }
    if (data.reviewResult) {
        parts.push(`검토 결과: ${data.reviewResult}`);
    }
    if (data.reviewFeedback) {
        parts.push(`피드백: ${data.reviewFeedback}`);
    }
    if (data.refinementPrompt) {
        parts.push(`수정 요청: ${data.refinementPrompt}`);
    }
    if (data.question) {
        parts.push(`질문: ${data.question}`);
    }
    if (data.response) {
        parts.push(`응답: ${data.response}`);
    }

    return parts.join('\n');
}

// Helper to check if entry contains image data
function isHistoryImageEntry(entry: TaskHistoryEntry): boolean {
    if (!entry.eventData || !entry.eventData.content) return false;
    const content = entry.eventData.content;
    if (typeof content !== 'string' || content.length < 100) return false;
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    return base64Regex.test(content.trim());
}

// Get image data URL from history entry
function getHistoryImageUrl(entry: TaskHistoryEntry): string {
    if (!isHistoryImageEntry(entry) || !entry.eventData) return '';
    const content = entry.eventData.content || '';
    const metadata = (entry.eventData as any).metadata || entry.metadata;
    const mime = metadata?.mime || metadata?.mimeType || 'image/png';

    if (content.startsWith('data:')) {
        return content;
    }
    return `data:${mime};base64,${content}`;
}

// Format history metadata
function formatHistoryMetadata(entry: TaskHistoryEntry): string {
    if (!entry.metadata) return '';

    const meta = entry.metadata;
    const parts: string[] = [];

    if (meta.provider) parts.push(`Provider: ${meta.provider}`);
    if (meta.model) parts.push(`Model: ${meta.model}`);
    if (meta.cost != null) parts.push(`Cost: $${meta.cost.toFixed(4)}`);
    if (meta.tokens != null) parts.push(`Tokens: ${meta.tokens.toLocaleString()}`);
    if (meta.duration != null) parts.push(`Duration: ${(meta.duration / 1000).toFixed(1)}s`);

    return parts.join(' | ');
}

// Open file using Electron shell
async function handleOpenFile(filePath: string) {
    if (!filePath) return;

    try {
        const api = getAPI();
        // If path is relative, try to resolve it against project path if available
        // For now, we assume the path is either absolute or relative to CWD
        // functionality depends on how the path is stored in outputConfig
        await api.shell.openPath(filePath);
    } catch (error) {
        console.error('Failed to open file:', error);
    }
}

// Format file size
function formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
</script>

<template>
    <!-- Center Modal -->
    <div v-if="open" class="fixed inset-0 z-50 overflow-y-auto" @click.self="handleClose">
        <!-- Backdrop -->
        <div
            class="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
            @click="handleClose"
        ></div>

        <!-- Modal Container -->
        <div class="flex min-h-full items-center justify-center p-4">
            <div
                class="relative w-full max-w-4xl transform transition-all"
                :class="open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'"
            >
                <div
                    class="flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-h-[90vh]"
                    style="min-height: 900px"
                >
                    <!-- Header -->
                    <div
                        class="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 px-6 py-4"
                    >
                        <div class="flex items-start justify-between">
                            <div class="flex-1">
                                <!-- Title -->
                                <div class="flex items-center gap-2 mb-2">
                                    <div v-if="isEditingTitle" class="flex-1 flex gap-2">
                                        <input
                                            v-model="editedTitle"
                                            class="flex-1 px-2 py-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded text-xl font-semibold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            @keyup.enter="saveTitle"
                                            @keyup.esc="cancelEditTitle"
                                            autoFocus
                                        />
                                        <button
                                            class="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 whitespace-nowrap"
                                            @click="saveTitle"
                                        >
                                            저장
                                        </button>
                                        <button
                                            class="px-3 py-1 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-300 dark:hover:bg-gray-600 whitespace-nowrap"
                                            @click="cancelEditTitle"
                                        >
                                            취소
                                        </button>
                                    </div>
                                    <div v-else class="flex-1 flex items-center gap-2 group">
                                        <h2
                                            class="text-xl font-semibold text-gray-900 dark:text-white cursor-pointer hover:underline decoration-dashed decoration-gray-400 decoration-1 underline-offset-4"
                                            @click="startEditTitle"
                                        >
                                            {{ localTask?.title || '태스크 상세' }}
                                        </h2>
                                        <button
                                            class="p-1 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-blue-500"
                                            @click="startEditTitle"
                                            title="제목 편집"
                                        >
                                            <svg
                                                class="w-4 h-4"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                                />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                <!-- Badges -->
                                <div class="flex items-center gap-2">
                                    <span
                                        :class="[
                                            'px-2 py-1 text-xs font-medium rounded',
                                            statusColor,
                                        ]"
                                    >
                                        {{ localTask?.status }}
                                    </span>
                                    <span
                                        :class="[
                                            'px-2 py-1 text-xs font-medium rounded',
                                            priorityColor,
                                        ]"
                                    >
                                        {{ localTask?.priority }}
                                    </span>
                                    <span
                                        v-if="localTask?.aiProvider"
                                        class="px-2 py-1 text-xs font-medium rounded bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300"
                                    >
                                        {{ localTask.aiProvider }}
                                    </span>
                                    <span
                                        v-if="localTask?.executionOrder"
                                        class="px-2 py-1 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                                    >
                                        순서: {{ localTask.executionOrder }}
                                    </span>
                                </div>
                            </div>

                            <!-- Close button -->
                            <button
                                class="ml-4 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                                @click="handleClose"
                            >
                                <svg
                                    class="h-6 w-6"
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

                        <!-- Tabs -->
                        <div class="mt-4 flex gap-4 border-b border-gray-200 dark:border-gray-700">
                            <button
                                v-for="tab in [
                                    'prompt',
                                    'settings',
                                    'details',
                                    'notifications',
                                    'comments',
                                    'history',
                                ] as const"
                                :key="tab"
                                v-show="
                                    tab !== 'settings' ||
                                    !localTask?.taskType ||
                                    localTask?.taskType === 'ai'
                                "
                                :class="[
                                    'pb-2 px-1 text-sm font-medium transition-colors',
                                    activeTab === tab
                                        ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
                                ]"
                                @click="activeTab = tab"
                            >
                                {{
                                    tab === 'prompt'
                                        ? '실행 설정'
                                        : tab === 'settings'
                                          ? 'AI 설정'
                                          : tab === 'details'
                                            ? '상세 정보'
                                            : tab === 'notifications'
                                              ? '알림'
                                              : tab === 'comments'
                                                ? '댓글'
                                                : '히스토리'
                                }}
                            </button>
                        </div>
                    </div>

                    <!-- Execution Progress (Standard) -->
                    <div
                        v-if="
                            localTask &&
                            localTask.status === 'in_progress' &&
                            executionMode !== 'local' &&
                            (isExecuting || streamingResult)
                        "
                        class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50"
                    >
                        <TaskExecutionProgress
                            :task="localTask"
                            @completed="handleExecutionCompleted"
                            @failed="handleExecutionFailed"
                            @stopped="handleExecutionStopped"
                            @approval-required="handleApprovalRequired"
                        />
                    </div>

                    <!-- Local Agent Execution Log (Antigravity Style) -->
                    <div
                        v-if="
                            executionMode === 'local' &&
                            (isExecuting || localAgentExecution.hasResults.value)
                        "
                        class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 h-[600px]"
                    >
                        <TaskExecutionLog
                            :transcript="localAgentTranscript"
                            :curator-events="curatorEvents"
                            :is-executing="isExecuting"
                            :title="
                                selectedLocalAgent
                                    ? `${selectedLocalAgent} Execution`
                                    : 'Agent Execution'
                            "
                            @stop="handleExecutionStopped"
                        />
                    </div>

                    <!-- Content -->
                    <div class="flex-1 overflow-y-auto px-6 py-4">
                        <!-- Read-Only Mode Warning -->
                        <div
                            v-if="isReadOnly"
                            class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-3 mb-4"
                        >
                            <div class="flex items-center gap-2">
                                <svg
                                    class="w-5 h-5 text-yellow-600 flex-shrink-0"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    <path
                                        fill-rule="evenodd"
                                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                        clip-rule="evenodd"
                                    />
                                </svg>
                                <div class="flex-1">
                                    <span
                                        class="text-sm font-medium text-yellow-800 dark:text-yellow-200"
                                    >
                                        실행 중에는 설정을 변경할 수 없습니다
                                    </span>
                                    <p class="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                                        설정을 변경하려면 먼저 태스크를 중지(STOP)하세요
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- 실행 설정 Tab -->
                        <div v-if="activeTab === 'prompt'" class="space-y-6">
                            <!-- AI Task: Prompt Section -->
                            <div v-if="!localTask?.taskType || localTask?.taskType === 'ai'">
                                <div class="space-y-4">
                                    <div>
                                        <div class="flex items-center justify-between mb-2">
                                            <label
                                                class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                            >
                                                프롬프트 (작업 설명)
                                            </label>
                                            <div class="flex items-center gap-2">
                                                <MacroInsertButton
                                                    :dependent-task-ids="dependentTaskIdList"
                                                    :disabled="isReadOnly"
                                                    @insert="handleMacroInsert"
                                                />
                                                <button
                                                    :disabled="isReadOnly"
                                                    @click="showTemplatePicker = true"
                                                    :class="[
                                                        'inline-flex items-center px-3 py-1.5 text-sm rounded-lg transition-colors',
                                                        isReadOnly
                                                            ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                                            : 'bg-gray-600 hover:bg-gray-500 text-white',
                                                    ]"
                                                >
                                                    <svg
                                                        class="w-4 h-4 mr-1.5"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path
                                                            stroke-linecap="round"
                                                            stroke-linejoin="round"
                                                            stroke-width="2"
                                                            d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z"
                                                        />
                                                    </svg>
                                                    템플릿
                                                </button>
                                                <button
                                                    :disabled="isReadOnly"
                                                    @click="showPromptEnhancer = true"
                                                    :class="[
                                                        'inline-flex items-center px-3 py-1.5 text-sm rounded-lg transition-colors',
                                                        isReadOnly
                                                            ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                                            : 'bg-purple-600 hover:bg-purple-500 text-white',
                                                    ]"
                                                >
                                                    <svg
                                                        class="w-4 h-4 mr-1.5"
                                                        fill="none"
                                                        viewBox="0 0 24 24"
                                                        stroke="currentColor"
                                                    >
                                                        <path
                                                            stroke-linecap="round"
                                                            stroke-linejoin="round"
                                                            stroke-width="2"
                                                            d="M13 10V3L4 14h7v7l9-11h-7z"
                                                        />
                                                    </svg>
                                                    AI 고도화
                                                </button>
                                            </div>
                                        </div>
                                        <CodeEditor
                                            v-model="promptText"
                                            :language="'markdown'"
                                            height="400px"
                                            :readonly="isReadOnly"
                                            :show-line-numbers="false"
                                        />
                                        <div
                                            class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-2"
                                        >
                                            <MacroInsertButton
                                                :dependent-task-ids="dependentTaskIdList"
                                                :disabled="isReadOnly"
                                                @insert="handleMacroInsert"
                                            />
                                            <span v-pre
                                                >💡 <strong>Tip:</strong> {{ prev }}, {{ task.N }},
                                                {{ project.name }} 등 매크로 자동완성 지원
                                                (Ctrl+Space 또는 {{ 입력)</span
                                            >
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Script Task: Code Editor -->
                            <div v-else-if="localTask?.taskType === 'script'" class="space-y-3">
                                <div class="flex items-center justify-between">
                                    <label
                                        class="text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        스크립트 코드
                                    </label>
                                    <select
                                        v-model="scriptLanguage"
                                        class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="javascript">JavaScript</option>
                                        <option value="typescript">TypeScript</option>
                                        <option value="python">Python</option>
                                    </select>
                                </div>

                                <CodeEditor
                                    v-model="scriptCode"
                                    :language="scriptLanguage"
                                    height="450px"
                                />

                                <div
                                    class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-2"
                                >
                                    <MacroInsertButton
                                        :dependent-task-ids="dependentTaskIdList"
                                        :disabled="isReadOnly"
                                        @insert="handleMacroInsert"
                                    />
                                    <span v-pre
                                        >💡 <strong>Tip:</strong> {{ prev }}, {{ task.N }},
                                        {{ project.name }} 등 매크로 자동완성 지원 (Ctrl+Space 또는
                                        {{ 입력)</span
                                    >
                                </div>
                            </div>

                            <!-- Input Task Settings (Moved to Execution Settings tab) -->
                            <div
                                v-else-if="localTask?.taskType === 'input'"
                                class="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-700 space-y-4 mb-6"
                            >
                                <div
                                    class="flex items-center gap-2 text-sm text-yellow-800 dark:text-yellow-200 font-semibold"
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
                                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                        />
                                    </svg>
                                    Input Task 설정
                                </div>

                                <!-- Source Type Selection -->
                                <div>
                                    <label
                                        class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                    >
                                        입력 소스 유형
                                    </label>
                                    <div class="grid grid-cols-3 gap-2">
                                        <button
                                            v-for="type in [
                                                {
                                                    id: 'USER_INPUT',
                                                    label: 'User Input',
                                                    icon: '👤',
                                                },
                                                {
                                                    id: 'LOCAL_FILE',
                                                    label: 'Local File',
                                                    icon: '📂',
                                                },
                                                {
                                                    id: 'REMOTE_RESOURCE',
                                                    label: 'Remote URL',
                                                    icon: '🌐',
                                                },
                                            ]"
                                            :key="type.id"
                                            @click="updateInputConfig('sourceType', type.id)"
                                            :class="[
                                                'px-3 py-2 rounded-lg text-sm font-medium border transition-colors flex items-center justify-center gap-2',
                                                getInputConfig().sourceType === type.id
                                                    ? 'bg-yellow-100 dark:bg-yellow-800 border-yellow-500 text-yellow-900 dark:text-yellow-100'
                                                    : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
                                            ]"
                                        >
                                            <span>{{ type.icon }}</span>
                                            <span>{{ type.label }}</span>
                                        </button>
                                    </div>
                                </div>

                                <!-- USER_INPUT Configuration -->
                                <div
                                    v-if="getInputConfig().sourceType === 'USER_INPUT'"
                                    class="space-y-3 pt-2 border-t border-yellow-200 dark:border-yellow-700"
                                >
                                    <div>
                                        <label
                                            class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
                                        >
                                            입력 모드
                                        </label>
                                        <div class="flex gap-2">
                                            <button
                                                v-for="mode in ['short', 'long', 'confirm']"
                                                :key="mode"
                                                @click="
                                                    updateInputConfig('userInput', {
                                                        ...getInputConfig().userInput,
                                                        mode,
                                                    })
                                                "
                                                :class="[
                                                    'px-2 py-1 rounded text-xs border capitalize',
                                                    getInputConfig().userInput?.mode === mode
                                                        ? 'bg-yellow-500 text-white border-yellow-500'
                                                        : 'bg-transparent border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400',
                                                ]"
                                            >
                                                {{ mode }}
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label
                                            class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
                                        >
                                            요청 메시지
                                        </label>
                                        <input
                                            :value="getInputConfig().userInput?.message || ''"
                                            @input="
                                                updateInputConfig('userInput', {
                                                    ...getInputConfig().userInput,
                                                    message: ($event.target as HTMLInputElement)
                                                        .value,
                                                })
                                            "
                                            type="text"
                                            class="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-1 focus:ring-yellow-500 focus:border-yellow-500"
                                            placeholder="사용자에게 보여질 메시지"
                                        />
                                    </div>

                                    <div v-if="getInputConfig().userInput?.mode !== 'confirm'">
                                        <label
                                            class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
                                        >
                                            Placeholder (선택)
                                        </label>
                                        <input
                                            :value="getInputConfig().userInput?.placeholder || ''"
                                            @input="
                                                updateInputConfig('userInput', {
                                                    ...getInputConfig().userInput,
                                                    placeholder: ($event.target as HTMLInputElement)
                                                        .value,
                                                })
                                            "
                                            type="text"
                                            class="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                            placeholder="입력 예시"
                                        />
                                    </div>

                                    <!-- Options Configuration (Selection Mode) -->
                                    <div v-if="getInputConfig().userInput?.mode !== 'confirm'">
                                        <label
                                            class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
                                        >
                                            선택 옵션 목록 (콤마 분리)
                                        </label>
                                        <input
                                            :value="
                                                getInputConfig().userInput?.options?.join(', ') ||
                                                ''
                                            "
                                            @input="
                                                updateInputConfig('userInput', {
                                                    ...getInputConfig().userInput,
                                                    options: ($event.target as HTMLInputElement)
                                                        .value
                                                        ? ($event.target as HTMLInputElement).value
                                                              .split(',')
                                                              .map((s) => s.trim())
                                                              .filter((s) => s.length > 0)
                                                        : undefined,
                                                })
                                            "
                                            type="text"
                                            class="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                            placeholder="예: 옵션A, 옵션B, 옵션C"
                                        />
                                    </div>

                                    <div
                                        v-if="
                                            getInputConfig().userInput?.mode !== 'confirm' &&
                                            (getInputConfig().userInput?.options?.length ?? 0) > 0
                                        "
                                        class="flex items-center gap-2"
                                    >
                                        <label class="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                :checked="
                                                    getInputConfig().userInput?.allowCustom || false
                                                "
                                                @change="
                                                    updateInputConfig('userInput', {
                                                        ...getInputConfig().userInput,
                                                        allowCustom: (
                                                            $event.target as HTMLInputElement
                                                        ).checked,
                                                    })
                                                "
                                                class="w-4 h-4 text-yellow-600 rounded border-gray-300 focus:ring-yellow-500"
                                            />
                                            <span class="text-sm text-gray-700 dark:text-gray-300"
                                                >사용자 직접 입력 허용</span
                                            >
                                        </label>
                                    </div>

                                    <label class="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            :checked="
                                                getInputConfig().userInput?.required !== false
                                            "
                                            @change="
                                                updateInputConfig('userInput', {
                                                    ...getInputConfig().userInput,
                                                    required: ($event.target as HTMLInputElement)
                                                        .checked,
                                                })
                                            "
                                            class="w-4 h-4 text-yellow-600 rounded border-gray-300 focus:ring-yellow-500"
                                        />
                                        <span class="text-sm text-gray-700 dark:text-gray-300"
                                            >필수 입력</span
                                        >
                                    </label>
                                </div>

                                <!-- LOCAL_FILE Configuration -->
                                <div
                                    v-if="getInputConfig().sourceType === 'LOCAL_FILE'"
                                    class="space-y-3 pt-2 border-t border-yellow-200 dark:border-yellow-700"
                                >
                                    <div>
                                        <label
                                            class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
                                        >
                                            허용 확장자
                                        </label>
                                        <div class="flex flex-wrap gap-2">
                                            <label
                                                v-for="ext in [
                                                    'txt',
                                                    'md',
                                                    'csv',
                                                    'xlsx',
                                                    'json',
                                                    'png',
                                                    'jpg',
                                                    'jpeg',
                                                    'webp',
                                                    'gif',
                                                    'svg',
                                                ]"
                                                :key="ext"
                                                class="flex items-center gap-1.5 text-sm cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    :checked="
                                                        getInputConfig().localFile?.acceptedExtensions?.includes(
                                                            ext
                                                        )
                                                    "
                                                    @change="
                                                        toggleFileExtension(
                                                            ext,
                                                            ($event.target as HTMLInputElement)
                                                                .checked
                                                        )
                                                    "
                                                    class="w-4 h-4 text-yellow-600 rounded border-gray-300 focus:ring-yellow-500"
                                                />
                                                <span class="text-gray-700 dark:text-gray-300">{{
                                                    ext
                                                }}</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div>
                                        <label
                                            class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
                                        >
                                            읽기 모드
                                        </label>
                                        <select
                                            :value="getInputConfig().localFile?.readMode || 'text'"
                                            @change="
                                                updateInputConfig('localFile', {
                                                    ...getInputConfig().localFile,
                                                    readMode: ($event.target as HTMLSelectElement)
                                                        .value,
                                                })
                                            "
                                            class="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                        >
                                            <option value="auto">
                                                자동 (형식 감지 - 이미지 등)
                                            </option>
                                            <option value="text">텍스트 (기본)</option>
                                            <option value="table">테이블 (CSV/Excel)</option>
                                            <option value="binary">바이너리</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label
                                            class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
                                        >
                                            대상 파일
                                        </label>
                                        <div class="flex items-center gap-2">
                                            <input
                                                type="text"
                                                readonly
                                                :value="getInputConfig().localFile?.filePath || ''"
                                                class="flex-1 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                                                placeholder="파일을 선택하세요"
                                            />
                                            <button
                                                @click="handleSelectLocalFile"
                                                class="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                                            >
                                                파일 선택
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <!-- REMOTE_RESOURCE Configuration -->
                                <div
                                    v-if="getInputConfig().sourceType === 'REMOTE_RESOURCE'"
                                    class="space-y-3 pt-2 border-t border-yellow-200 dark:border-yellow-700"
                                >
                                    <div>
                                        <label
                                            class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
                                        >
                                            리소스 유형
                                        </label>
                                        <select
                                            class="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                        >
                                            <option value="general">일반 웹페이지 URL</option>
                                            <option value="google_drive" disabled>
                                                Google Drive (준비 중)
                                            </option>
                                        </select>
                                    </div>

                                    <div>
                                        <label
                                            class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
                                        >
                                            기본 URL (선택)
                                        </label>
                                        <input
                                            :value="getInputConfig().remoteResource?.url || ''"
                                            @input="
                                                updateInputConfig('remoteResource', {
                                                    ...getInputConfig().remoteResource,
                                                    url: ($event.target as HTMLInputElement).value,
                                                })
                                            "
                                            type="text"
                                            class="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                            placeholder="https://example.com"
                                        />
                                    </div>
                                </div>
                            </div>

                            <!-- Output Task Config -->
                            <div v-else-if="localTask?.taskType === 'output'" class="space-y-3">
                                <OutputTaskConfigPanel
                                    :model-value="localTask.outputConfig"
                                    @update:model-value="
                                        (val) => updateTaskProperty('outputConfig', val)
                                    "
                                />
                            </div>

                            <!-- 매크로 가이드 -->
                            <details
                                class="bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                            >
                                <summary
                                    class="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                >
                                    📖 매크로 사용 가이드
                                </summary>
                                <div class="px-4 pb-4 text-xs">
                                    <!-- 의존성 태스크 결과 -->
                                    <div class="mb-3">
                                        <h4
                                            class="font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1"
                                        >
                                            <span class="text-indigo-500">📋</span> 의존성 태스크
                                            결과
                                        </h4>
                                        <div class="space-y-1.5 pl-4">
                                            <div class="flex items-start gap-2">
                                                <code
                                                    class="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded font-mono shrink-0"
                                                    v-pre
                                                    >{{task.23}}</code
                                                >
                                                <span class="text-gray-600 dark:text-gray-400"
                                                    >특정 태스크(ID)의 결과 content</span
                                                >
                                            </div>
                                            <div class="flex items-start gap-2">
                                                <code
                                                    class="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded font-mono shrink-0"
                                                    v-pre
                                                    >{{task.23.output}}</code
                                                >
                                                <span class="text-gray-600 dark:text-gray-400"
                                                    >전체 output 객체 (JSON)</span
                                                >
                                            </div>
                                            <div class="flex items-start gap-2">
                                                <code
                                                    class="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded font-mono shrink-0"
                                                    v-pre
                                                    >{{task.23.status}}</code
                                                >
                                                <span class="text-gray-600 dark:text-gray-400"
                                                    >태스크 상태</span
                                                >
                                            </div>
                                            <div class="flex items-start gap-2">
                                                <code
                                                    class="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded font-mono shrink-0"
                                                    v-pre
                                                    >{{task.23.summary}}</code
                                                >
                                                <span class="text-gray-600 dark:text-gray-400"
                                                    >결과 요약 (500자)</span
                                                >
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 이전 태스크 -->
                                    <div class="mb-3">
                                        <h4
                                            class="font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1"
                                        >
                                            <span class="text-blue-500">⬆️</span> 이전 태스크 참조
                                        </h4>
                                        <div class="space-y-1.5 pl-4">
                                            <div class="flex items-start gap-2">
                                                <code
                                                    class="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-mono shrink-0"
                                                    v-pre
                                                    >{{ prev }}</code
                                                >
                                                <span class="text-gray-600 dark:text-gray-400"
                                                    >바로 이전 태스크(마지막 dependency)</span
                                                >
                                            </div>
                                            <div class="flex items-start gap-2">
                                                <code
                                                    class="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-mono shrink-0"
                                                    v-pre
                                                    >{{prev.0}}</code
                                                >
                                                <span class="text-gray-600 dark:text-gray-400"
                                                    >마지막 dependency (prev와 동일)</span
                                                >
                                            </div>
                                            <div class="flex items-start gap-2">
                                                <code
                                                    class="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-mono shrink-0"
                                                    v-pre
                                                    >{{prev.1}}</code
                                                >
                                                <span class="text-gray-600 dark:text-gray-400"
                                                    >두 번째 최근 dependency</span
                                                >
                                            </div>
                                            <div class="flex items-start gap-2">
                                                <code
                                                    class="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-mono shrink-0"
                                                    v-pre
                                                    >{{ prev.summary }}</code
                                                >
                                                <span class="text-gray-600 dark:text-gray-400"
                                                    >이전 결과 요약</span
                                                >
                                            </div>
                                            <div class="flex items-start gap-2">
                                                <code
                                                    class="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-mono shrink-0"
                                                    v-pre
                                                    >{{ all_results }}</code
                                                >
                                                <span class="text-gray-600 dark:text-gray-400"
                                                    >모든 이전 결과 (JSON 배열)</span
                                                >
                                            </div>
                                            <div class="flex items-start gap-2">
                                                <code
                                                    class="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-mono shrink-0"
                                                    v-pre
                                                    >{{ all_results.summary }}</code
                                                >
                                                <span class="text-gray-600 dark:text-gray-400"
                                                    >모든 결과 요약</span
                                                >
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 시스템 매크로 -->
                                    <div class="mb-3">
                                        <h4
                                            class="font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1"
                                        >
                                            <span class="text-gray-500">⚙️</span> 시스템 매크로
                                        </h4>
                                        <div class="space-y-1.5 pl-4">
                                            <div class="flex items-start gap-2">
                                                <code
                                                    class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded font-mono shrink-0"
                                                    v-pre
                                                    >{{ date }}</code
                                                >
                                                <span class="text-gray-600 dark:text-gray-400"
                                                    >오늘 날짜 (YYYY-MM-DD)</span
                                                >
                                            </div>
                                            <div class="flex items-start gap-2">
                                                <code
                                                    class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded font-mono shrink-0"
                                                    v-pre
                                                    >{{ datetime }}</code
                                                >
                                                <span class="text-gray-600 dark:text-gray-400"
                                                    >현재 날짜/시간 (ISO 형식)</span
                                                >
                                            </div>
                                            <div class="flex items-start gap-2">
                                                <code
                                                    class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded font-mono shrink-0"
                                                    v-pre
                                                    >{{ project.name }}</code
                                                >
                                                <span class="text-gray-600 dark:text-gray-400"
                                                    >현재 프로젝트 이름</span
                                                >
                                            </div>
                                            <div class="flex items-start gap-2">
                                                <code
                                                    class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded font-mono shrink-0"
                                                    v-pre
                                                    >{{ project.description }}</code
                                                >
                                                <span class="text-gray-600 dark:text-gray-400"
                                                    >프로젝트 설명</span
                                                >
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 컨텍스트 변수 -->
                                    <div class="mb-3">
                                        <h4
                                            class="font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1"
                                        >
                                            <span class="text-green-500">🔤</span> 컨텍스트 변수
                                        </h4>
                                        <div class="space-y-1.5 pl-4">
                                            <div class="flex items-start gap-2">
                                                <code
                                                    class="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded font-mono shrink-0"
                                                    v-pre
                                                    >{{var:변수명}}</code
                                                >
                                                <span class="text-gray-600 dark:text-gray-400"
                                                    >사용자 정의 변수 참조</span
                                                >
                                            </div>
                                        </div>
                                    </div>

                                    <!-- 사용 예시 -->
                                    <div class="pt-3 border-t border-gray-200 dark:border-gray-600">
                                        <h4
                                            class="font-semibold text-gray-700 dark:text-gray-300 mb-2"
                                        >
                                            💡 사용 예시
                                        </h4>
                                        <div
                                            class="bg-gray-900 dark:bg-gray-800 rounded p-2 text-gray-100 font-mono text-[11px] leading-relaxed overflow-x-auto"
                                        >
                                            <div class="text-gray-400">
                                                # 이전 태스크 결과를 기반으로 분석
                                            </div>
                                            <div>다음 데이터를 분석해주세요:</div>
                                            <div class="text-indigo-400" v-pre>{{ prev }}</div>
                                            <div class="mt-2 text-gray-400">
                                                # 여러 태스크 결과 종합
                                            </div>
                                            <div v-pre>Task #1 결과: {{task.1.summary}}</div>
                                            <div v-pre>Task #2 결과: {{task.2.summary}}</div>
                                            <div class="mt-2 text-gray-400"># 날짜 포함</div>
                                            <div v-pre>{{ date }} 기준 보고서를 작성해주세요.</div>
                                        </div>
                                    </div>
                                </div>
                            </details>

                            <div
                                class="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg"
                            >
                                <div class="flex items-center gap-2">
                                    <svg
                                        class="w-5 h-5 text-blue-500"
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
                                    <span class="text-sm text-blue-700 dark:text-blue-300">
                                        AI 비서가 프롬프트를 개선할 수 있습니다
                                    </span>
                                </div>
                                <button
                                    class="px-3 py-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                    @click="showPromptEnhancer = true"
                                >
                                    개선 제안 받기
                                </button>
                            </div>
                        </div>

                        <!-- Settings Tab -->
                        <div v-if="activeTab === 'settings'" class="space-y-6">
                            <!-- Script Task Notice -->
                            <div
                                v-if="localTask?.taskType === 'script'"
                                class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700"
                            >
                                <div
                                    class="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300"
                                >
                                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path
                                            fill-rule="evenodd"
                                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                            clip-rule="evenodd"
                                        />
                                    </svg>
                                    <div>
                                        <div class="font-medium">스크립트 태스크</div>
                                        <div class="text-xs mt-0.5">
                                            작성한 코드를 직접 실행합니다. AI 실행 설정이 필요하지
                                            않습니다.
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- AI Execution Info Section (AI Tasks Only) -->
                            <div
                                v-if="!localTask?.taskType || localTask?.taskType === 'ai'"
                                class="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600 space-y-3"
                            >
                                <h4
                                    class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"
                                >
                                    <svg
                                        class="w-4 h-4 text-indigo-500"
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
                                    AI 실행 정보
                                </h4>

                                <div class="grid grid-cols-2 gap-4 text-sm">
                                    <!-- Execution Order -->
                                    <div v-if="localTask?.executionOrder">
                                        <span class="text-gray-500 dark:text-gray-400 block text-xs"
                                            >실행 순서</span
                                        >
                                        <span
                                            class="font-mono font-medium text-gray-900 dark:text-white"
                                            >#{{ localTask.executionOrder }}</span
                                        >
                                    </div>

                                    <!-- Estimated Duration -->
                                    <div v-if="localTask?.estimatedMinutes">
                                        <span class="text-gray-500 dark:text-gray-400 block text-xs"
                                            >예상 소요 시간</span
                                        >
                                        <span class="font-medium text-gray-900 dark:text-white">
                                            {{ Math.floor(localTask.estimatedMinutes / 60) }}h
                                            {{ localTask.estimatedMinutes % 60 }}m
                                        </span>
                                    </div>

                                    <!-- Expected Output (Editable) -->
                                    <div class="col-span-2">
                                        <label
                                            class="text-gray-500 dark:text-gray-400 block text-xs mb-1"
                                        >
                                            결과물 형식 (예상)
                                        </label>
                                        <select
                                            v-if="localTask"
                                            v-model="localTask.expectedOutputFormat"
                                            class="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-blue-500"
                                            @change="persistExecutionSettings"
                                        >
                                            <option :value="undefined">자동 감지</option>
                                            <option
                                                v-for="opt in outputFormatOptions"
                                                :key="opt.value"
                                                :value="opt.value"
                                            >
                                                {{ opt.label }}
                                            </option>
                                        </select>
                                    </div>

                                    <!-- Dependencies -->
                                    <div
                                        v-if="
                                            localTask?.dependencies &&
                                            localTask.dependencies.length > 0
                                        "
                                        class="col-span-2"
                                    >
                                        <span class="text-gray-500 dark:text-gray-400 block text-xs"
                                            >의존성 태스크</span
                                        >
                                        <div class="flex flex-wrap gap-1 mt-1">
                                            <span
                                                v-for="depId in localTask.dependencies"
                                                :key="depId"
                                                class="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded text-xs font-mono"
                                            >
                                                #{{ depId }}
                                            </span>
                                        </div>
                                    </div>

                                    <!-- Required MCPs -->
                                    <div
                                        v-if="
                                            localTask?.requiredMCPs &&
                                            localTask.requiredMCPs.length > 0
                                        "
                                        class="col-span-2"
                                    >
                                        <span class="text-gray-500 dark:text-gray-400 block text-xs"
                                            >필요 MCP 도구</span
                                        >
                                        <div class="flex flex-wrap gap-1 mt-1">
                                            <span
                                                v-for="mcp in localTask.requiredMCPs"
                                                :key="mcp"
                                                class="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs"
                                            >
                                                {{ mcp }}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Assigned Operator -->
                            <div>
                                <OperatorSelector
                                    v-model="assignedOperatorId"
                                    :project-id="localTask?.projectId || null"
                                />
                                <p
                                    v-if="assignedOperatorId"
                                    class="mt-2 text-xs text-amber-600 dark:text-amber-400"
                                >
                                    ⚠️ Operator가 할당되어 있어 하단 AI 설정이 비활성화되었습니다.
                                </p>
                            </div>

                            <!-- Execution Mode Selection (AI tasks only) -->
                            <div
                                v-if="!localTask?.taskType || localTask?.taskType === 'ai'"
                                class="mb-6"
                            >
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3"
                                >
                                    실행 방식
                                </label>
                                <div class="grid grid-cols-2 gap-3">
                                    <!-- AI API Mode -->
                                    <label
                                        :class="[
                                            'flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all',
                                            executionMode === 'api'
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
                                        ]"
                                    >
                                        <input
                                            v-model="executionMode"
                                            type="radio"
                                            value="api"
                                            :disabled="!!assignedOperatorId"
                                            class="sr-only"
                                        />
                                        <div
                                            class="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-800 rounded-lg flex items-center justify-center"
                                        >
                                            <svg
                                                class="w-6 h-6 text-blue-600 dark:text-blue-300"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                                                />
                                            </svg>
                                        </div>
                                        <div class="flex-1">
                                            <span
                                                class="block text-sm font-medium text-gray-900 dark:text-white"
                                                >AI API</span
                                            >
                                            <span class="text-xs text-gray-500 dark:text-gray-400"
                                                >클라우드 AI 서비스</span
                                            >
                                        </div>
                                    </label>

                                    <!-- Local Agent Mode -->
                                    <label
                                        :class="[
                                            'flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all',
                                            executionMode === 'local'
                                                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
                                            (!hasInstalledLocalAgent || !isDevProject) &&
                                                'opacity-50',
                                        ]"
                                    >
                                        <input
                                            v-model="executionMode"
                                            type="radio"
                                            value="local"
                                            :disabled="!hasInstalledLocalAgent || !isDevProject"
                                            class="sr-only"
                                        />
                                        <div
                                            class="flex-shrink-0 w-10 h-10 bg-green-100 dark:bg-green-800 rounded-lg flex items-center justify-center"
                                        >
                                            <svg
                                                class="w-6 h-6 text-green-600 dark:text-green-300"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                                />
                                            </svg>
                                        </div>
                                        <div class="flex-1">
                                            <span
                                                class="block text-sm font-medium text-gray-900 dark:text-white"
                                                >Local Agent</span
                                            >
                                            <span class="text-xs text-gray-500 dark:text-gray-400"
                                                >로컬 CLI 에이전트</span
                                            >
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <!-- Local Agent Settings (when local mode selected) -->
                            <div
                                v-if="
                                    (!localTask?.taskType || localTask?.taskType === 'ai') &&
                                    executionMode === 'local' &&
                                    isDevProject
                                "
                                class="space-y-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800 mb-6"
                            >
                                <h4
                                    class="text-sm font-semibold text-green-800 dark:text-green-200 flex items-center gap-2"
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
                                            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                        />
                                    </svg>
                                    Local Agent 설정
                                </h4>

                                <!-- Agent Selection -->
                                <div>
                                    <label
                                        class="block text-sm font-medium text-green-700 dark:text-green-300 mb-2"
                                    >
                                        에이전트 선택
                                    </label>

                                    <div class="space-y-2">
                                        <label
                                            v-for="agent in availableLocalAgents"
                                            :key="agent.id"
                                            :class="[
                                                'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                                                selectedLocalAgent === agent.id
                                                    ? 'border-green-500 bg-green-100 dark:bg-green-800/50'
                                                    : 'border-green-200 dark:border-green-700 hover:border-green-400',
                                                !agent.installed && 'opacity-50 cursor-not-allowed',
                                            ]"
                                        >
                                            <input
                                                v-model="selectedLocalAgent"
                                                type="radio"
                                                :value="agent.id"
                                                :disabled="!agent.installed"
                                                class="sr-only"
                                            />
                                            <IconRenderer :emoji="agent.icon" class="w-5 h-5" />
                                            <div class="flex-1 flex items-center justify-between">
                                                <div>
                                                    <span
                                                        class="text-sm font-medium text-green-900 dark:text-green-100"
                                                        >{{ agent.name }}</span
                                                    >
                                                    <span
                                                        v-if="agent.version"
                                                        class="ml-2 text-xs text-green-600 dark:text-green-400"
                                                    >
                                                        v{{ agent.version }}
                                                    </span>
                                                </div>
                                                <span
                                                    :class="[
                                                        'px-2 py-1 text-xs rounded',
                                                        agent.installed
                                                            ? 'bg-green-200 dark:bg-green-700 text-green-700 dark:text-green-200'
                                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
                                                    ]"
                                                >
                                                    {{ agent.installed ? '설치됨' : '미설치' }}
                                                </span>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                <!-- Working Directory -->
                                <div>
                                    <label
                                        class="block text-sm font-medium text-green-700 dark:text-green-300 mb-2"
                                    >
                                        작업 디렉토리
                                    </label>
                                    <div class="flex gap-2">
                                        <input
                                            v-model="localAgentWorkingDir"
                                            type="text"
                                            :placeholder="baseWorkingDirPlaceholder"
                                            class="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-green-300 dark:border-green-700 rounded-lg"
                                        />
                                        <button
                                            type="button"
                                            @click="selectWorkingDirectory"
                                            class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                                        >
                                            찾아보기
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <!-- AI Provider Selection (when API mode selected, AI tasks only) -->
                            <div
                                v-if="
                                    (!localTask?.taskType || localTask?.taskType === 'ai') &&
                                    executionMode === 'api'
                                "
                            >
                                <AIProviderSelector
                                    v-model:provider="aiProvider"
                                    v-model:model="aiModel"
                                    label="AI 제공자"
                                    :disabled="!!assignedOperatorId"
                                />

                                <!-- Review AI Settings -->
                            </div>

                            <!-- Temperature Slider -->
                            <div>
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >
                                    Temperature: {{ temperature }}
                                </label>
                                <input
                                    v-model.number="temperature"
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    class="w-full"
                                />
                                <div class="flex justify-between text-xs text-gray-500 mt-1">
                                    <span>정확함</span>
                                    <span>창의적</span>
                                </div>
                            </div>

                            <!-- Max Tokens Slider -->
                            <div>
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >
                                    최대 토큰: {{ maxTokens }}
                                </label>
                                <input
                                    v-model.number="maxTokens"
                                    type="range"
                                    min="100"
                                    max="4000"
                                    step="100"
                                    class="w-full"
                                />
                            </div>

                            <!-- Cost Estimate -->
                            <div class="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                <div class="flex items-center justify-between">
                                    <span
                                        class="text-sm font-medium text-green-700 dark:text-green-300"
                                    >
                                        예상 비용
                                    </span>
                                    <span
                                        class="text-lg font-bold text-green-700 dark:text-green-300"
                                    >
                                        ${{ estimatedCost }}
                                    </span>
                                </div>
                            </div>

                            <!-- MCP Tools -->
                            <div>
                                <MCPToolSelector
                                    v-model:selectedIds="selectedMCPTools"
                                    v-model:config="localTask!.mcpConfig"
                                    :base-config="projectStore.currentProject?.mcpConfig"
                                />
                            </div>

                            <!-- 테스크 세분화 옵션 (1뎀스 테스크만) -->
                            <div
                                v-if="canSubdivide"
                                class="border-t border-gray-200 dark:border-gray-700 pt-6"
                            >
                                <div
                                    class="p-4 bg-teal-50 dark:bg-teal-900/20 rounded-lg border border-teal-200 dark:border-teal-800"
                                >
                                    <div class="flex items-start gap-3 mb-4">
                                        <div
                                            class="flex-shrink-0 w-10 h-10 bg-teal-100 dark:bg-teal-800 rounded-lg flex items-center justify-center"
                                        >
                                            <svg
                                                class="w-6 h-6 text-teal-600 dark:text-teal-300"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                                                />
                                            </svg>
                                        </div>
                                        <div class="flex-1">
                                            <h4
                                                class="text-sm font-semibold text-teal-900 dark:text-teal-100 mb-1"
                                            >
                                                테스크 세분화
                                            </h4>
                                            <p
                                                class="text-xs text-teal-700 dark:text-teal-300 mb-3"
                                            >
                                                이 테스크의 작업 범위가 크다면 서브테스크로 나눌 수
                                                있습니다. 세분화 후 상위 테스크는 그룹핑 용도로만
                                                사용되며, 실행 기능이 비활성화됩니다.
                                            </p>
                                            <button
                                                class="w-full px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                                                @click="handleSubdivide"
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
                                                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                                                    />
                                                </svg>
                                                테스크 세분화 하기
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- 세분화된 그룹 테스크 정보 표시 -->
                            <div
                                v-if="localTask?.isSubdivided"
                                class="border-t border-gray-200 dark:border-gray-700 pt-6"
                            >
                                <div
                                    class="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                                >
                                    <div class="flex items-center gap-3">
                                        <svg
                                            class="w-6 h-6 text-gray-500 dark:text-gray-400"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"
                                            />
                                        </svg>
                                        <div class="flex-1">
                                            <h4
                                                class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1"
                                            >
                                                그룹 테스크
                                            </h4>
                                            <p class="text-xs text-gray-600 dark:text-gray-400">
                                                이 테스크는 {{ localTask.subtaskCount }}개의
                                                서브테스크로 세분화되어 있습니다. 그룹핑 용도로만
                                                사용되며 직접 실행할 수 없습니다.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Details Tab -->
                        <div v-if="activeTab === 'details'" class="space-y-6">
                            <!-- Priority -->
                            <div>
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >
                                    Priority
                                </label>
                                <select
                                    v-model="priority"
                                    class="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                    <option value="urgent">Urgent</option>
                                    <option value="critical">Critical</option>
                                </select>
                            </div>

                            <!-- Tags -->
                            <div>
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >
                                    Tags
                                </label>
                                <TagInput v-model="tags" placeholder="Add tags..." />
                            </div>

                            <!-- Estimated Duration -->
                            <div>
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >
                                    Estimated Duration (minutes)
                                </label>
                                <input
                                    v-model.number="estimatedMinutes"
                                    type="number"
                                    min="0"
                                    class="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Enter estimated minutes"
                                />
                                <p
                                    v-if="estimatedMinutes > 0"
                                    class="mt-1 text-xs text-gray-500 dark:text-gray-400"
                                >
                                    Approximately {{ Math.floor(estimatedMinutes / 60) }}h
                                    {{ estimatedMinutes % 60 }}m
                                </p>
                            </div>

                            <!-- Due Date -->
                            <div>
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >
                                    Due Date
                                </label>
                                <input
                                    v-model="dueDate"
                                    type="datetime-local"
                                    class="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>

                            <!-- 자동 실행 트리거 설정 -->
                            <div
                                class="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-4"
                            >
                                <h4
                                    class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2"
                                >
                                    <svg
                                        class="w-5 h-5 text-indigo-600"
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
                                    자동 실행 트리거
                                </h4>

                                <!-- 트리거 유형 선택 -->
                                <div>
                                    <label
                                        class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                    >
                                        트리거 유형
                                    </label>
                                    <select
                                        v-model="triggerType"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="none">없음 (수동 실행)</option>
                                        <option value="dependency">태스크 의존성</option>
                                        <option value="time">시간 기반</option>
                                    </select>
                                </div>

                                <!-- 의존성 트리거 설정 -->
                                <div
                                    v-if="triggerType === 'dependency'"
                                    class="space-y-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800"
                                >
                                    <div>
                                        <label
                                            class="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-2"
                                        >
                                            의존하는 태스크 ID (쉼표로 구분)
                                        </label>
                                        <input
                                            v-model="dependencyTaskIds"
                                            type="text"
                                            class="w-full px-3 py-2 border border-indigo-300 dark:border-indigo-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                            placeholder="예: 1, 2, 3"
                                        />
                                        <p
                                            class="text-xs text-indigo-600 dark:text-indigo-400 mt-1"
                                        >
                                            지정한 태스크들이 완료되면 자동으로 실행됩니다
                                        </p>
                                    </div>

                                    <!-- Advanced Condition -->
                                    <div>
                                        <label
                                            class="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-2"
                                        >
                                            고급 조건 설정 (선택사항)
                                        </label>
                                        <input
                                            v-model="dependencyExpression"
                                            type="text"
                                            class="w-full px-3 py-2 border border-indigo-300 dark:border-indigo-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                                            placeholder="예: (!2 && !3) || 6"
                                        />
                                        <p
                                            class="text-xs text-indigo-600 dark:text-indigo-400 mt-1"
                                        >
                                            복잡한 논리 조건을 설정합니다. ! (Not) 연산자를 사용하여
                                            '완료되지 않음' 조건을 설정할 수 있습니다.
                                        </p>
                                    </div>

                                    <div
                                        :class="{
                                            'opacity-50 pointer-events-none':
                                                !!dependencyExpression,
                                        }"
                                    >
                                        <label
                                            class="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-2"
                                        >
                                            실행 조건
                                        </label>
                                        <div class="space-y-2">
                                            <label class="flex items-center gap-2">
                                                <input
                                                    v-model="dependencyOperator"
                                                    type="radio"
                                                    value="all"
                                                    class="text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <span
                                                    class="text-sm text-indigo-700 dark:text-indigo-300"
                                                    >모든 태스크가 완료되어야 함</span
                                                >
                                            </label>
                                            <label class="flex items-center gap-2">
                                                <input
                                                    v-model="dependencyOperator"
                                                    type="radio"
                                                    value="any"
                                                    class="text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <span
                                                    class="text-sm text-indigo-700 dark:text-indigo-300"
                                                    >하나라도 완료되면 실행</span
                                                >
                                            </label>
                                        </div>
                                    </div>

                                    <div>
                                        <label
                                            class="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-2"
                                        >
                                            자동 실행 정책
                                        </label>
                                        <div class="space-y-2">
                                            <label class="flex items-center gap-2">
                                                <input
                                                    v-model="dependencyExecutionPolicy"
                                                    type="radio"
                                                    value="once"
                                                    class="text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <div class="flex flex-col">
                                                    <span
                                                        class="text-sm text-indigo-700 dark:text-indigo-300 font-medium"
                                                        >1회만 실행</span
                                                    >
                                                    <span
                                                        class="text-xs text-indigo-500 dark:text-indigo-400"
                                                        >TODO 상태일 때만 자동 실행</span
                                                    >
                                                </div>
                                            </label>
                                            <label class="flex items-center gap-2">
                                                <input
                                                    v-model="dependencyExecutionPolicy"
                                                    type="radio"
                                                    value="repeat"
                                                    class="text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <div class="flex flex-col">
                                                    <span
                                                        class="text-sm text-indigo-700 dark:text-indigo-300 font-medium"
                                                        >매번 자동 실행 (권장)</span
                                                    >
                                                    <span
                                                        class="text-xs text-indigo-500 dark:text-indigo-400"
                                                        >조건 충족 시 현재 상태와 무관하게
                                                        실행</span
                                                    >
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <!-- 시간 트리거 설정 -->
                                <div
                                    v-if="triggerType === 'time'"
                                    class="space-y-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800"
                                >
                                    <div>
                                        <label
                                            class="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-2"
                                        >
                                            스케줄 유형
                                        </label>
                                        <select
                                            v-model="scheduleType"
                                            class="w-full px-3 py-2 border border-indigo-300 dark:border-indigo-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="once">1회 실행</option>
                                            <option value="recurring">반복 실행</option>
                                        </select>
                                    </div>

                                    <div v-if="scheduleType === 'once'">
                                        <label
                                            class="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-2"
                                        >
                                            실행 날짜/시간
                                        </label>
                                        <input
                                            v-model="scheduledDatetime"
                                            type="datetime-local"
                                            class="w-full px-3 py-2 border border-indigo-300 dark:border-indigo-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>

                                    <div v-if="scheduleType === 'recurring'">
                                        <label
                                            class="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-2"
                                        >
                                            Cron 표현식
                                        </label>
                                        <input
                                            v-model="cronExpression"
                                            type="text"
                                            class="w-full px-3 py-2 border border-indigo-300 dark:border-indigo-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-500"
                                            placeholder="0 9 * * 1-5"
                                        />
                                        <p
                                            class="text-xs text-indigo-600 dark:text-indigo-400 mt-1"
                                        >
                                            예: "0 9 * * 1-5" = 평일 오전 9시
                                        </p>
                                    </div>

                                    <div>
                                        <label
                                            class="block text-sm font-medium text-indigo-700 dark:text-indigo-300 mb-2"
                                        >
                                            타임존
                                        </label>
                                        <select
                                            v-model="timezone"
                                            class="w-full px-3 py-2 border border-indigo-300 dark:border-indigo-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="Asia/Seoul">Asia/Seoul (KST)</option>
                                            <option value="America/New_York">
                                                America/New_York (EST)
                                            </option>
                                            <option value="Europe/London">
                                                Europe/London (GMT)
                                            </option>
                                            <option value="UTC">UTC</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <!-- 자동 REVIEW 옵션 (AI Only) -->
                            <div
                                v-if="!localTask?.taskType || localTask?.taskType === 'ai'"
                                class="border-t border-gray-200 dark:border-gray-700 pt-6"
                            >
                                <label class="flex items-center gap-3 cursor-pointer">
                                    <input
                                        v-model="autoReview"
                                        type="checkbox"
                                        class="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <div class="flex-1">
                                        <span
                                            class="text-sm font-medium text-gray-700 dark:text-gray-300"
                                        >
                                            자동 REVIEW 활성화
                                        </span>
                                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            AI가 프롬프트 결과물이 의도대로 나왔는지 자동으로
                                            검토합니다
                                        </p>
                                    </div>
                                </label>

                                <!-- 리뷰용 AI 설정 - 자동 REVIEW 활성화 시에만 표시 -->
                                <div
                                    v-if="autoReview"
                                    class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
                                >
                                    <div class="mb-3">
                                        <p
                                            class="text-sm font-semibold text-blue-900 dark:text-blue-100"
                                        >
                                            리뷰용 AI 설정
                                        </p>
                                        <p class="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                                            자동 리뷰 실행 시 사용할 Provider와 모델을 지정하세요
                                        </p>
                                    </div>
                                    <div>
                                        <AIProviderSelector
                                            v-model:provider="reviewAiProvider"
                                            v-model:model="reviewAiModel"
                                            label="리뷰 AI (제공자/모델)"
                                        />
                                    </div>
                                </div>
                            </div>

                            <!-- 자동 승인 옵션 -->
                            <div class="border-t border-gray-200 dark:border-gray-700 pt-6">
                                <label
                                    v-if="localTask"
                                    class="flex items-center gap-3 cursor-pointer"
                                >
                                    <input
                                        v-model="localTask.autoApprove"
                                        type="checkbox"
                                        class="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                    />
                                    <div class="flex-1">
                                        <span
                                            class="text-sm font-medium text-gray-700 dark:text-gray-300"
                                        >
                                            자동 승인
                                        </span>
                                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            실행 성공 시 검토 없이 바로 완료(DONE) 처리
                                        </p>
                                    </div>
                                </label>

                                <!-- Warning if project has auto-review enabled -->
                                <div
                                    v-if="
                                        localTask?.autoApprove &&
                                        projectStore.currentProject?.autoReview
                                    "
                                    class="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
                                >
                                    <div class="flex items-start gap-2">
                                        <svg
                                            class="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                        <p class="text-xs text-amber-700 dark:text-amber-300">
                                            이 태스크는 프로젝트 자동 검토 대신 자동 승인을
                                            사용합니다
                                        </p>
                                    </div>
                                </div>

                                <!-- Info if neither is enabled -->
                                <div
                                    v-if="
                                        localTask &&
                                        !localTask.autoApprove &&
                                        !projectStore.currentProject?.autoReview
                                    "
                                    class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
                                >
                                    <div class="flex items-start gap-2">
                                        <svg
                                            class="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                        <p class="text-xs text-blue-700 dark:text-blue-300">
                                            실행 완료 후 수동 검토가 필요합니다
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <!-- Save Button -->
                            <div
                                class="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700"
                            >
                                <button
                                    @click="handleDetailsUpdate"
                                    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                                >
                                    Update Details
                                </button>
                            </div>
                        </div>

                        <!-- Notifications Tab -->
                        <div v-if="activeTab === 'notifications'" class="space-y-4">
                            <div class="flex items-center gap-2 mb-4">
                                <svg
                                    class="w-5 h-5 text-purple-500"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    <path
                                        d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"
                                    />
                                </svg>
                                <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                    알림 설정
                                </h3>
                            </div>

                            <p class="text-sm text-gray-600 dark:text-gray-400">
                                태스크 실행, 리뷰 이벤트 발생 시 Slack 또는 Webhook으로 알림을 받을
                                수 있습니다. 태스크별 설정이 프로젝트 설정보다 우선합니다.
                            </p>

                            <NotificationSettings
                                v-if="localTask"
                                :config="parseNotificationConfig(localTask.notificationConfig)"
                                :has-auto-review="localTask.autoReview || false"
                                level="task"
                                @update="handleUpdateNotificationConfig"
                                @test="handleTestNotification"
                            />
                        </div>

                        <!-- Comments Tab -->
                        <div v-if="activeTab === 'comments'" class="space-y-4">
                            <!-- Comment List -->
                            <div class="space-y-3">
                                <div
                                    v-for="comment in comments"
                                    :key="comment.id"
                                    class="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
                                >
                                    <div class="flex items-center justify-between mb-2">
                                        <span
                                            class="text-sm font-medium text-gray-900 dark:text-white"
                                        >
                                            {{ comment.author }}
                                        </span>
                                        <span class="text-xs text-gray-500">
                                            {{ formatDate(comment.timestamp) }}
                                        </span>
                                    </div>
                                    <p class="text-sm text-gray-700 dark:text-gray-300">
                                        {{ comment.text }}
                                    </p>
                                </div>

                                <div
                                    v-if="comments.length === 0"
                                    class="text-center py-8 text-gray-500"
                                >
                                    아직 댓글이 없습니다
                                </div>
                            </div>

                            <!-- Add Comment -->
                            <div class="space-y-2">
                                <textarea
                                    v-model="newComment"
                                    rows="3"
                                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    placeholder="댓글을 입력하세요..."
                                />
                                <button
                                    class="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                                    @click="addComment"
                                >
                                    댓글 추가
                                </button>
                            </div>
                        </div>

                        <!-- History Tab -->
                        <div v-if="activeTab === 'history'" class="space-y-3">
                            <!-- Loading State -->
                            <div
                                v-if="isLoadingHistory"
                                class="flex items-center justify-center py-8"
                            >
                                <div
                                    class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"
                                ></div>
                                <span class="ml-2 text-gray-500 dark:text-gray-400"
                                    >히스토리 로딩 중...</span
                                >
                            </div>

                            <!-- Empty State -->
                            <div
                                v-else-if="taskHistoryEntries.length === 0"
                                class="text-center py-8"
                            >
                                <div class="text-4xl mb-2">📜</div>
                                <p class="text-gray-500 dark:text-gray-400">
                                    아직 기록된 히스토리가 없습니다.
                                </p>
                            </div>

                            <!-- History Timeline -->
                            <div v-else class="relative">
                                <!-- Timeline line -->
                                <div
                                    class="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700"
                                ></div>

                                <!-- History entries -->
                                <div
                                    v-for="entry in taskHistoryEntries"
                                    :key="entry.id"
                                    class="relative pl-10 pb-4"
                                >
                                    <!-- Timeline dot -->
                                    <div
                                        class="absolute left-2.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800"
                                        :class="getHistoryEventColor(entry.eventType)"
                                    ></div>

                                    <!-- Entry card -->
                                    <div class="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                        <div class="flex items-start gap-3">
                                            <!-- Event icon -->
                                            <span class="text-lg flex-shrink-0">
                                                {{ getHistoryEventIcon(entry.eventType) }}
                                            </span>

                                            <div class="flex-1 min-w-0">
                                                <!-- Event title and timestamp -->
                                                <div
                                                    class="flex items-center justify-between gap-2 mb-1"
                                                >
                                                    <p
                                                        class="text-sm font-medium text-gray-900 dark:text-white"
                                                    >
                                                        {{ getHistoryEventTitle(entry.eventType) }}
                                                    </p>
                                                    <p class="text-xs text-gray-500 flex-shrink-0">
                                                        {{ formatDate(entry.createdAt) }}
                                                    </p>
                                                </div>

                                                <!-- Event data (if any) -->
                                                <div
                                                    v-if="
                                                        formatHistoryEventData(entry) ||
                                                        isHistoryImageEntry(entry)
                                                    "
                                                    class="mt-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 p-2 rounded relative group"
                                                >
                                                    <!-- Image Display -->
                                                    <template v-if="isHistoryImageEntry(entry)">
                                                        <div class="space-y-2">
                                                            <p
                                                                class="text-sm text-gray-600 dark:text-gray-400"
                                                            >
                                                                결과: [이미지 생성됨]
                                                            </p>
                                                            <div
                                                                class="flex items-center justify-center bg-gray-900 rounded p-2"
                                                                :class="{
                                                                    'max-h-48':
                                                                        !expandedHistoryItems.has(
                                                                            entry.id
                                                                        ),
                                                                    'max-h-none':
                                                                        expandedHistoryItems.has(
                                                                            entry.id
                                                                        ),
                                                                }"
                                                            >
                                                                <img
                                                                    :src="getHistoryImageUrl(entry)"
                                                                    alt="Generated Image"
                                                                    class="max-w-full object-contain rounded"
                                                                    :class="{
                                                                        'max-h-44':
                                                                            !expandedHistoryItems.has(
                                                                                entry.id
                                                                            ),
                                                                        'cursor-pointer':
                                                                            !expandedHistoryItems.has(
                                                                                entry.id
                                                                            ),
                                                                    }"
                                                                    @click="
                                                                        !expandedHistoryItems.has(
                                                                            entry.id
                                                                        )
                                                                            ? toggleHistoryExpansion(
                                                                                  entry.id
                                                                              )
                                                                            : null
                                                                    "
                                                                />
                                                            </div>
                                                            <div class="flex justify-end">
                                                                <button
                                                                    @click.stop="
                                                                        toggleHistoryExpansion(
                                                                            entry.id
                                                                        )
                                                                    "
                                                                    class="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1 bg-white dark:bg-gray-700 px-2 py-0.5 rounded shadow-sm"
                                                                >
                                                                    {{
                                                                        expandedHistoryItems.has(
                                                                            entry.id
                                                                        )
                                                                            ? '이미지 접기'
                                                                            : '이미지 확대'
                                                                    }}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </template>

                                                    <!-- Output Result Display (Code view with Auto-scroll) -->
                                                    <template
                                                        v-else-if="
                                                            localTask?.taskType === 'output' &&
                                                            entry.eventData
                                                        "
                                                    >
                                                        <div class="space-y-1 relative group">
                                                            <div
                                                                class="flex items-center justify-between"
                                                            >
                                                                <span
                                                                    class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                                                                >
                                                                    Output Content
                                                                </span>
                                                                <div class="flex gap-2">
                                                                    <!-- Auto-scroll control (only for accumulated results) -->
                                                                    <button
                                                                        v-if="
                                                                            localTask?.outputConfig
                                                                                ?.localFile
                                                                                ?.accumulateResults
                                                                        "
                                                                        class="text-xs px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
                                                                        @click="
                                                                            (
                                                                                $refs[
                                                                                    `outputCodeEditor_${entry.id}`
                                                                                ] as any
                                                                            )?.[0]?.scrollToBottom()
                                                                        "
                                                                        title="Scroll to bottom"
                                                                    >
                                                                        ⬇ Bottom
                                                                    </button>
                                                                    <button
                                                                        class="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
                                                                        @click="
                                                                            handleOpenFile(
                                                                                localTask
                                                                                    ?.outputConfig
                                                                                    ?.localFile
                                                                                    ?.pathTemplate ||
                                                                                    'output.txt'
                                                                            )
                                                                        "
                                                                    >
                                                                        <svg
                                                                            class="w-3 h-3"
                                                                            fill="none"
                                                                            stroke="currentColor"
                                                                            viewBox="0 0 24 24"
                                                                        >
                                                                            <path
                                                                                stroke-linecap="round"
                                                                                stroke-linejoin="round"
                                                                                stroke-width="2"
                                                                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                                                            />
                                                                        </svg>
                                                                        Open File
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <div class="relative">
                                                                <CodeEditor
                                                                    :ref="`outputCodeEditor_${entry.id}`"
                                                                    :model-value="
                                                                        typeof entry.eventData
                                                                            .content === 'string'
                                                                            ? entry.eventData
                                                                                  .content
                                                                            : JSON.stringify(
                                                                                  entry.eventData
                                                                                      .content,
                                                                                  null,
                                                                                  2
                                                                              )
                                                                    "
                                                                    :language="'markdown'"
                                                                    :readonly="true"
                                                                    height="300px"
                                                                    :show-line-numbers="true"
                                                                    :auto-scroll-when-at-bottom="
                                                                        !!localTask?.outputConfig
                                                                            ?.localFile
                                                                            ?.accumulateResults
                                                                    "
                                                                />
                                                            </div>
                                                        </div>
                                                    </template>

                                                    <!-- Markdown Content Display (Default for others) -->
                                                    <template
                                                        v-else-if="
                                                            entry.eventData?.content &&
                                                            typeof entry.eventData.content ===
                                                                'string'
                                                        "
                                                    >
                                                        <div class="space-y-1">
                                                            <span
                                                                class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                                                            >
                                                                Result
                                                            </span>
                                                            <MarkdownRenderer
                                                                :content="entry.eventData.content"
                                                                class="text-sm text-gray-800 dark:text-gray-200"
                                                            />
                                                        </div>
                                                        <div
                                                            v-if="
                                                                formatHistoryEventData(entry, true)
                                                                    .length > 0
                                                            "
                                                            class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 whitespace-pre-wrap font-mono text-xs text-gray-600 dark:text-gray-400"
                                                        >
                                                            {{
                                                                formatHistoryEventData(entry, true)
                                                            }}
                                                        </div>
                                                    </template>

                                                    <!-- Text Display -->
                                                    <template v-else>
                                                        <div
                                                            class="whitespace-pre-wrap break-words transition-all duration-200"
                                                            :class="{
                                                                'line-clamp-2':
                                                                    !expandedHistoryItems.has(
                                                                        entry.id
                                                                    ),
                                                                'max-h-24 overflow-hidden':
                                                                    !expandedHistoryItems.has(
                                                                        entry.id
                                                                    ) &&
                                                                    !formatHistoryEventData(
                                                                        entry
                                                                    ).includes('\n'),
                                                            }"
                                                        >
                                                            {{ formatHistoryEventData(entry) }}
                                                        </div>

                                                        <!-- Expand toggle if content is long -->
                                                        <div
                                                            v-if="
                                                                formatHistoryEventData(entry)
                                                                    .length > 100 ||
                                                                formatHistoryEventData(
                                                                    entry
                                                                ).includes('\n')
                                                            "
                                                            class="mt-1 flex justify-end"
                                                        >
                                                            <button
                                                                @click.stop="
                                                                    toggleHistoryExpansion(entry.id)
                                                                "
                                                                class="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1 bg-white dark:bg-gray-700 px-2 py-0.5 rounded shadow-sm"
                                                            >
                                                                {{
                                                                    expandedHistoryItems.has(
                                                                        entry.id
                                                                    )
                                                                        ? '접기'
                                                                        : '더 보기'
                                                                }}
                                                            </button>
                                                        </div>
                                                    </template>
                                                </div>

                                                <!-- Metadata (if any) -->
                                                <div
                                                    v-if="formatHistoryMetadata(entry)"
                                                    class="mt-2 text-xs text-gray-500 dark:text-gray-500"
                                                >
                                                    {{ formatHistoryMetadata(entry) }}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Static task info (always shown at the bottom) -->
                            <div class="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                                <p
                                    class="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium"
                                >
                                    기본 정보
                                </p>

                                <div class="grid grid-cols-2 gap-2 text-xs">
                                    <div class="p-2 bg-gray-50 dark:bg-gray-900 rounded">
                                        <span class="text-gray-500">생성일:</span>
                                        <span class="ml-1 text-gray-700 dark:text-gray-300">
                                            {{ formatDate(localTask?.createdAt) }}
                                        </span>
                                    </div>
                                    <div
                                        v-if="localTask?.updatedAt"
                                        class="p-2 bg-gray-50 dark:bg-gray-900 rounded"
                                    >
                                        <span class="text-gray-500">수정일:</span>
                                        <span class="ml-1 text-gray-700 dark:text-gray-300">
                                            {{ formatDate(localTask.updatedAt) }}
                                        </span>
                                    </div>
                                    <div
                                        v-if="localTask?.startedAt"
                                        class="p-2 bg-gray-50 dark:bg-gray-900 rounded"
                                    >
                                        <span class="text-gray-500">시작일:</span>
                                        <span class="ml-1 text-gray-700 dark:text-gray-300">
                                            {{ formatDate(localTask.startedAt) }}
                                        </span>
                                    </div>
                                    <div
                                        v-if="localTask?.completedAt"
                                        class="p-2 bg-gray-50 dark:bg-gray-900 rounded"
                                    >
                                        <span class="text-gray-500">완료일:</span>
                                        <span class="ml-1 text-gray-700 dark:text-gray-300">
                                            {{ formatDate(localTask.completedAt) }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Footer Actions -->
                        <div
                            class="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 px-6 py-4"
                        >
                            <div class="flex items-center justify-between gap-4">
                                <div class="flex gap-2 items-center">
                                    <!-- Execute button or Provider connection required message -->
                                    <template v-if="aiProvider && !isSelectedProviderConnected">
                                        <div
                                            class="flex items-center gap-2 px-4 py-2 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-lg font-medium"
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
                                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                                />
                                            </svg>
                                            Provider 연동 필요
                                        </div>
                                    </template>
                                    <template v-else>
                                        <button
                                            class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                            :disabled="!canExecute"
                                            @click="handleExecute"
                                        >
                                            <template
                                                v-if="
                                                    isGloballyExecuting ||
                                                    localTask?.status === 'in_progress'
                                                "
                                            >
                                                <svg
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
                                                    ></circle>
                                                    <path
                                                        class="opacity-75"
                                                        fill="currentColor"
                                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                    ></path>
                                                </svg>
                                                <span>실행 중...</span>
                                            </template>
                                            <template v-else>
                                                <svg
                                                    class="w-4 h-4"
                                                    fill="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path d="M8 5v14l11-7z" />
                                                </svg>
                                                <span>실행</span>
                                            </template>
                                        </button>
                                    </template>

                                    <button
                                        class="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
                                        @click="handleSave"
                                    >
                                        저장
                                    </button>
                                </div>

                                <button
                                    class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    @click="handleClose"
                                >
                                    닫기
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Prompt Enhancer Modal -->
    <Teleport to="body">
        <div
            v-if="showPromptEnhancer"
            class="fixed inset-0 z-[60] flex items-center justify-center p-4"
        >
            <div class="fixed inset-0 bg-black/60" @click="showPromptEnhancer = false" />
            <div class="relative w-full max-w-3xl max-h-[85vh] overflow-hidden">
                <PromptEnhancerPanel
                    :initial-prompt="promptText"
                    :task-id="localTask?.id"
                    @apply="applyEnhancedPrompt"
                    @close="showPromptEnhancer = false"
                />
            </div>
        </div>
    </Teleport>

    <!-- Template Picker Modal -->
    <Teleport to="body">
        <div
            v-if="showTemplatePicker"
            class="fixed inset-0 z-[60] flex items-center justify-center p-4"
        >
            <div class="fixed inset-0 bg-black/60" @click="showTemplatePicker = false" />
            <div class="relative w-full max-w-5xl max-h-[85vh] overflow-hidden">
                <PromptTemplatePicker
                    @apply="applyTemplatePrompt"
                    @close="showTemplatePicker = false"
                />
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
/* Smooth transitions */
.transform {
    transition: transform 0.3s ease-in-out;
}

/* Custom scrollbar */
.overflow-y-auto::-webkit-scrollbar {
    width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
}

.dark .overflow-y-auto::-webkit-scrollbar-thumb {
    background: #475569;
}
</style>
