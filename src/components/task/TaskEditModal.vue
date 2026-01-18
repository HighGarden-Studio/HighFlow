<script setup lang="ts">
/**
 * TaskEditModal Component
 *
 * Full-featured modal for editing task properties
 */
import { ref, computed, watch } from 'vue';
import type { Task, AIProvider } from '@core/types/database';
import TagInput from '../common/TagInput.vue';
import OperatorSelector from '../common/OperatorSelector.vue';
import MacroInsertButton from '../common/MacroInsertButton.vue';
import IconRenderer from '../common/IconRenderer.vue';
import { estimationService, type EstimationResult } from '../../services/task/EstimationService';
import { useProjectStore } from '../../renderer/stores/projectStore';

const projectStore = useProjectStore();

interface Props {
    task: Task | null;
    open: boolean;
    tagSuggestions?: string[];
    dependentTaskIds?: number[]; // 의존성 태스크 ID 목록
    project?: any; // Project info for defaults
}

const props = withDefaults(defineProps<Props>(), {
    tagSuggestions: () => [],
    dependentTaskIds: () => [],
});

// Description textarea ref for macro insertion
const descriptionTextarea = ref<HTMLTextAreaElement | null>(null);

// 매크로 삽입 핸들러
function handleMacroInsert(macro: string) {
    if (!descriptionTextarea.value) return;

    const textarea = descriptionTextarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = form.value.description;

    // 커서 위치에 매크로 삽입
    form.value.description = text.substring(0, start) + macro + text.substring(end);

    // 커서를 삽입된 매크로 뒤로 이동
    setTimeout(() => {
        textarea.focus();
        const newPosition = start + macro.length;
        textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
}

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'save', task: Partial<Task>): void;
    (e: 'delete', taskId: number): void;
}>();

// Form State
const form = ref({
    title: '',
    description: '',
    status: 'todo' as Task['status'],
    priority: 'medium' as Task['priority'],
    tags: [] as string[],
    estimatedMinutes: 0,
    dueDate: '',
    assigneeId: null as number | null,
    aiProvider: null as AIProvider | null,
    aiModel: null as string | null,
    assignedOperatorId: null as number | null,
});

const errors = ref<Record<string, string>>({});
const showDeleteConfirm = ref(false);

// AI Estimation state
const aiEstimation = ref<EstimationResult | null>(null);
const isEstimating = ref(false);

// Watch for task changes
watch(
    () => props.task,
    (newTask) => {
        if (newTask) {
            // Editing existing task
            form.value = {
                title: newTask.title || '',
                description: newTask.description || '',
                status: newTask.status || 'todo',
                priority: newTask.priority || 'medium',
                tags: newTask.tags
                    ? typeof newTask.tags === 'string'
                        ? JSON.parse(newTask.tags)
                        : newTask.tags
                    : [],
                estimatedMinutes: newTask.estimatedMinutes || 0,
                dueDate: newTask.dueDate
                    ? new Date(newTask.dueDate).toISOString().slice(0, 16)
                    : '',
                assigneeId: newTask.assigneeId || null,
                aiProvider: newTask.aiProvider || null,
                aiModel: newTask.aiModel || null,
                assignedOperatorId: newTask.assignedOperatorId || null,
            };
            errors.value = {};
        } else if (props.open && !newTask) {
            // Creating new task - auto-select AI provider based on local assistants
            const currentProject = projectStore.currentProject as any;
            const localRepoTypes = currentProject?.metadata?.localRepo?.types;

            if (localRepoTypes && Array.isArray(localRepoTypes)) {
                // Priority: claude-code > codex
                let autoProvider: AIProvider | null = null;
                let autoModel: string | null = null;

                // Initialize with project defaults if available
                if (props.project) {
                    form.value.aiProvider = props.project.aiProvider || 'anthropic';
                    form.value.aiModel = props.project.aiModel || 'claude-3-5-sonnet-20250219';
                }

                if (localRepoTypes.includes('claude-code')) {
                    autoProvider = 'anthropic';
                    autoModel = currentProject.aiModel || 'claude-3-5-sonnet-20240620';

                    autoProvider = 'google';
                    autoModel = currentProject.aiModel || 'gemini-2.5-pro';
                } else if (localRepoTypes.includes('codex')) {
                    autoProvider = 'openai';
                    autoModel = currentProject.aiModel || 'gpt-4o';
                }

                if (autoProvider) {
                    form.value.aiProvider = autoProvider;
                    form.value.aiModel = autoModel;
                    console.log(
                        `[TaskEditModal] Auto-selected AI provider: ${autoProvider} based on local repos:`,
                        localRepoTypes
                    );
                }
            }
        }
    },
    { immediate: true }
);

// Options
const statusOptions: Array<{ value: Task['status']; label: string; color: string }> = [
    { value: 'todo', label: 'To Do', color: 'bg-gray-500' },
    { value: 'in_progress', label: 'In Progress', color: 'bg-blue-500' },
    { value: 'needs_approval', label: 'Needs Approval', color: 'bg-orange-500' },
    { value: 'in_review', label: 'In Review', color: 'bg-purple-500' },
    { value: 'done', label: 'Done', color: 'bg-green-500' },
    { value: 'blocked', label: 'Blocked', color: 'bg-red-500' },
];

const priorityOptions: Array<{ value: Task['priority']; label: string; color: string }> = [
    { value: 'low', label: 'Low', color: 'bg-blue-400' },
    { value: 'medium', label: 'Medium', color: 'bg-yellow-400' },
    { value: 'high', label: 'High', color: 'bg-orange-500' },
    { value: 'urgent', label: 'Urgent', color: 'bg-red-500' },
];

const aiProviderOptions: Array<{
    value: AIProvider | null;
    label: string;
    icon: string;
    description: string;
}> = [
    { value: null, label: 'None', icon: '⚪', description: '수동 실행' },
    { value: 'anthropic', label: 'Claude', icon: '🟣', description: 'Anthropic Claude' },
    { value: 'openai', label: 'GPT', icon: '🟢', description: 'OpenAI GPT-4' },
    { value: 'google', label: 'Gemini', icon: '🔵', description: 'Google Gemini' },
    { value: 'claude-code', label: 'Claude Code', icon: '💻', description: 'Claude Code Agent' },

    { value: 'codex', label: 'Codex', icon: '⚡', description: 'Codex AI Agent' },
    { value: 'local', label: 'Local', icon: '🏠', description: 'Local LLM' },
];

// providers array removed as it was unused (duplicate of aiProviderOptions logic)

// Fallback models if API fetch fails
const providerModelOptions: Record<string, { value: string; label: string }[]> = {
    openai: [
        { value: 'gpt-4o', label: 'GPT-4o' },
        { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
        { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    ],
    anthropic: [
        { value: 'claude-3-5-sonnet-20250219', label: 'Claude 3.5 Sonnet' },
        { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
        { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
        { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
    ],
    google: [
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    ],
    groq: [
        { value: 'llama3-70b-8192', label: 'Llama 3 70B' },
        { value: 'llama3-8b-8192', label: 'Llama 3 8B' },
    ],
    'claude-code': [{ value: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet' }],

    codex: [{ value: 'gpt-4o', label: 'GPT-4o (Codex)' }],
    local: [
        { value: 'llama3', label: 'Llama 3' },
        { value: 'mistral', label: 'Mistral' },
    ],
};

const availableModels = computed(() => {
    if (!form.value.aiProvider) return [];
    return providerModelOptions[form.value.aiProvider] || [];
});

// Watch for provider changes to reset or default model
watch(
    () => form.value.aiProvider,
    (newProvider) => {
        if (
            newProvider &&
            providerModelOptions[newProvider] &&
            providerModelOptions[newProvider].length > 0
        ) {
            // If current model is not valid for new provider, select first available
            const models = providerModelOptions[newProvider];
            if (
                models &&
                (!form.value.aiModel || !models.some((m) => m.value === form.value.aiModel))
            ) {
                const firstModel = models[0];
                if (firstModel) {
                    form.value.aiModel = firstModel.value;
                }
            }
        } else {
            form.value.aiModel = null;
        }
    }
);

const defaultTagSuggestions = [
    'frontend',
    'backend',
    'api',
    'database',
    'ui',
    'ux',
    'bug',
    'feature',
    'refactor',
    'test',
    'docs',
    'design',
    'performance',
    'security',
    'mobile',
    'web',
    'auth',
];

// Combine prop suggestions with defaults
const allTagSuggestions = computed(() => {
    const combined = [...new Set([...props.tagSuggestions, ...defaultTagSuggestions])];
    return combined;
});

// Computed
const formattedEstimatedTime = computed(() => {
    const mins = form.value.estimatedMinutes;
    if (mins === 0) return 'Not set';
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
});

const isValid = computed(() => {
    return form.value.title.trim().length > 0;
});

// Actions
function validate(): boolean {
    errors.value = {};

    if (!form.value.title.trim()) {
        errors.value.title = 'Title is required';
    }

    if (form.value.estimatedMinutes < 0) {
        errors.value.estimatedMinutes = 'Time cannot be negative';
    }

    return Object.keys(errors.value).length === 0;
}

function handleSave() {
    if (!validate()) return;

    const updates: Partial<Task> = {
        title: form.value.title.trim(),
        description: form.value.description.trim(),
        status: form.value.status,
        priority: form.value.priority,
        tags: form.value.tags,
        estimatedMinutes: form.value.estimatedMinutes || null,
        dueDate: form.value.dueDate ? new Date(form.value.dueDate) : null,
        assigneeId: form.value.assigneeId,
        aiProvider: form.value.aiProvider,
        aiModel: form.value.aiModel,
    };

    emit('save', updates);
}

function handleDelete() {
    if (!props.task?.id) return;
    emit('delete', props.task.id);
}

function handleClose() {
    showDeleteConfirm.value = false;
    aiEstimation.value = null;
    emit('close');
}

// AI 기반 시간 추정
async function estimateTimeWithAI() {
    if (!form.value.title.trim()) {
        errors.value.estimation = '제목을 입력하면 AI가 시간을 추정합니다';
        return;
    }

    isEstimating.value = true;
    errors.value.estimation = '';

    try {
        // AI 추정 실행
        const result = await estimationService.estimateTask(
            form.value.title,
            form.value.description,
            form.value.aiProvider || undefined,
            form.value.aiModel || undefined // Pass selected model
        );

        aiEstimation.value = result;
        form.value.estimatedMinutes = result.time.estimatedMinutes;
    } catch (e) {
        console.error('Failed to estimate time:', e);
        errors.value.estimation = '추정에 실패했습니다';
    } finally {
        isEstimating.value = false;
    }
}
</script>

<template>
    <Teleport to="body">
        <div v-if="open" class="fixed inset-0 z-50 overflow-y-auto" @click.self="handleClose">
            <!-- Backdrop -->
            <div
                class="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                @click="handleClose"
            />

            <!-- Modal -->
            <div class="flex min-h-full items-center justify-center p-4">
                <div
                    class="relative w-full max-w-2xl transform transition-all"
                    :class="open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'"
                >
                    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl">
                        <!-- Header -->
                        <div
                            class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700"
                        >
                            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
                                Edit Task
                            </h2>
                            <button
                                type="button"
                                class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
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

                        <!-- Body -->
                        <div class="px-6 py-4 space-y-6 max-h-[70vh] overflow-y-auto">
                            <!-- Title -->
                            <div>
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >
                                    Title <span class="text-red-500">*</span>
                                </label>
                                <input
                                    v-model="form.title"
                                    type="text"
                                    class="w-full px-4 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    :class="
                                        errors.title
                                            ? 'border-red-500'
                                            : 'border-gray-300 dark:border-gray-600'
                                    "
                                    placeholder="Enter task title..."
                                />
                                <p v-if="errors.title" class="mt-1 text-sm text-red-500">
                                    {{ errors.title }}
                                </p>
                            </div>

                            <!-- Description / Prompt with Macro Support -->
                            <div>
                                <div class="flex items-center justify-between mb-2">
                                    <label
                                        class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Description / Prompt
                                    </label>
                                    <MacroInsertButton
                                        :dependent-task-ids="props.dependentTaskIds"
                                        @insert="handleMacroInsert"
                                    />
                                </div>
                                <textarea
                                    ref="descriptionTextarea"
                                    v-model="form.description"
                                    rows="6"
                                    class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none font-mono text-sm"
                                    placeholder="태스크 설명 또는 AI 프롬프트를 입력하세요..."
                                />
                                <!-- 매크로 미리보기 힌트 -->
                                <div v-if="form.description && form.description.includes('{{')">
                                    <p class="mt-2 text-xs text-indigo-600 dark:text-indigo-400">
                                        ✨ 매크로가 포함되어 있습니다. 실행 시 실제 값으로
                                        치환됩니다.
                                    </p>
                                </div>

                                <!-- 매크로 가이드 -->
                                <details class="mt-3">
                                    <summary
                                        class="cursor-pointer text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                    >
                                        📖 매크로 사용 가이드
                                    </summary>
                                    <div
                                        class="mt-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 text-xs"
                                    >
                                        <!-- 의존성 태스크 결과 -->
                                        <div class="mb-3">
                                            <h4
                                                class="font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1"
                                            >
                                                <span class="text-indigo-500">📋</span> 의존성
                                                태스크 결과
                                            </h4>
                                            <div class="space-y-1.5 pl-4">
                                                <div class="flex items-start gap-2">
                                                    <code
                                                        v-pre
                                                        class="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded font-mono shrink-0"
                                                        >{{task.23}}</code
                                                    >
                                                    <span class="text-gray-600 dark:text-gray-400"
                                                        >특정 태스크(ID)의 결과 content</span
                                                    >
                                                </div>
                                                <div class="flex items-start gap-2">
                                                    <code
                                                        v-pre
                                                        class="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded font-mono shrink-0"
                                                        >{{task.23.output}}</code
                                                    >
                                                    <span class="text-gray-600 dark:text-gray-400"
                                                        >전체 output 객체 (JSON)</span
                                                    >
                                                </div>
                                                <div class="flex items-start gap-2">
                                                    <code
                                                        v-pre
                                                        class="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded font-mono shrink-0"
                                                        >{{task.23.status}}</code
                                                    >
                                                    <span class="text-gray-600 dark:text-gray-400"
                                                        >태스크 상태</span
                                                    >
                                                </div>
                                                <div class="flex items-start gap-2">
                                                    <code
                                                        v-pre
                                                        class="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded font-mono shrink-0"
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
                                                <span class="text-blue-500">⬆️</span> 이전 태스크
                                                참조
                                            </h4>
                                            <div class="space-y-1.5 pl-4">
                                                <div class="flex items-start gap-2">
                                                    <code
                                                        v-pre
                                                        class="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-mono shrink-0"
                                                        >{{ prev }}</code
                                                    >
                                                    <span class="text-gray-600 dark:text-gray-400"
                                                        >바로 이전 태스크(마지막 dependency)</span
                                                    >
                                                </div>
                                                <div class="flex items-start gap-2">
                                                    <code
                                                        v-pre
                                                        class="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-mono shrink-0"
                                                        >{{prev.0}}</code
                                                    >
                                                    <span class="text-gray-600 dark:text-gray-400"
                                                        >마지막 dependency (prev와 동일)</span
                                                    >
                                                </div>
                                                <div class="flex items-start gap-2">
                                                    <code
                                                        v-pre
                                                        class="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-mono shrink-0"
                                                        >{{prev.1}}</code
                                                    >
                                                    <span class="text-gray-600 dark:text-gray-400"
                                                        >두 번째 최근 dependency</span
                                                    >
                                                </div>
                                                <div class="flex items-start gap-2">
                                                    <code
                                                        v-pre
                                                        class="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-mono shrink-0"
                                                        >{{ prev.summary }}</code
                                                    >
                                                    <span class="text-gray-600 dark:text-gray-400"
                                                        >이전 결과 요약</span
                                                    >
                                                </div>
                                                <div class="flex items-start gap-2">
                                                    <code
                                                        v-pre
                                                        class="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-mono shrink-0"
                                                        >{{ all_results }}</code
                                                    >
                                                    <span class="text-gray-600 dark:text-gray-400"
                                                        >모든 이전 결과 (JSON 배열)</span
                                                    >
                                                </div>
                                                <div class="flex items-start gap-2">
                                                    <code
                                                        v-pre
                                                        class="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-mono shrink-0"
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
                                                        v-pre
                                                        class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded font-mono shrink-0"
                                                        >{{ date }}</code
                                                    >
                                                    <span class="text-gray-600 dark:text-gray-400"
                                                        >오늘 날짜 (YYYY-MM-DD)</span
                                                    >
                                                </div>
                                                <div class="flex items-start gap-2">
                                                    <code
                                                        v-pre
                                                        class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded font-mono shrink-0"
                                                        >{{ datetime }}</code
                                                    >
                                                    <span class="text-gray-600 dark:text-gray-400"
                                                        >현재 날짜/시간 (ISO 형식)</span
                                                    >
                                                </div>
                                                <div class="flex items-start gap-2">
                                                    <code
                                                        v-pre
                                                        class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded font-mono shrink-0"
                                                        >{{ project.name }}</code
                                                    >
                                                    <span class="text-gray-600 dark:text-gray-400"
                                                        >현재 프로젝트 이름</span
                                                    >
                                                </div>
                                                <div class="flex items-start gap-2">
                                                    <code
                                                        v-pre
                                                        class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded font-mono shrink-0"
                                                        >{{ project.description }}</code
                                                    >
                                                    <span class="text-gray-600 dark:text-gray-400"
                                                        >프로젝트 설명</span
                                                    >
                                                </div>
                                            </div>
                                        </div>

                                        <!-- 컨텍스트 변수 -->
                                        <div>
                                            <h4
                                                class="font-semibold text-gray-700 dark:text-gray-300 mb-1.5 flex items-center gap-1"
                                            >
                                                <span class="text-green-500">🔤</span> 컨텍스트 변수
                                            </h4>
                                            <div class="space-y-1.5 pl-4">
                                                <div class="flex items-start gap-2">
                                                    <code
                                                        v-pre
                                                        class="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded font-mono shrink-0"
                                                        >{{var:변수명}}</code
                                                    >
                                                    <span class="text-gray-600 dark:text-gray-400"
                                                        >사용자 정의 변수 참조</span
                                                    >
                                                </div>
                                            </div>
                                        </div>

                                        <!-- 사용 예시 -->
                                        <div
                                            class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600"
                                        >
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
                                                <div v-pre class="text-indigo-400">{{ prev }}</div>
                                                <div class="mt-2 text-gray-400">
                                                    # 여러 태스크 결과 종합
                                                </div>
                                                <div v-pre>Task #1 결과: {{task.1.summary}}</div>
                                                <div v-pre>Task #2 결과: {{task.2.summary}}</div>
                                                <div class="mt-2 text-gray-400"># 날짜 포함</div>
                                                <div v-pre>
                                                    {{ date }} 기준 보고서를 작성해주세요.
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </details>
                            </div>

                            <!-- Status & Priority Row -->
                            <div class="grid grid-cols-2 gap-4">
                                <!-- Status -->
                                <div>
                                    <label
                                        class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                    >
                                        Status
                                    </label>
                                    <div class="grid grid-cols-2 gap-2">
                                        <button
                                            v-for="option in statusOptions"
                                            :key="option.value"
                                            type="button"
                                            :class="[
                                                'px-3 py-2 rounded-lg text-sm font-medium transition-all border-2',
                                                form.status === option.value
                                                    ? `${option.color} text-white border-transparent`
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-transparent hover:border-gray-300 dark:hover:border-gray-600',
                                            ]"
                                            @click="form.status = option.value"
                                        >
                                            {{ option.label }}
                                        </button>
                                    </div>
                                </div>

                                <!-- Priority -->
                                <div>
                                    <label
                                        class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                    >
                                        Priority
                                    </label>
                                    <div class="grid grid-cols-2 gap-2">
                                        <button
                                            v-for="option in priorityOptions"
                                            :key="option.value"
                                            type="button"
                                            :class="[
                                                'px-3 py-2 rounded-lg text-sm font-medium transition-all border-2',
                                                form.priority === option.value
                                                    ? `${option.color} text-white border-transparent`
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-transparent hover:border-gray-300 dark:hover:border-gray-600',
                                            ]"
                                            @click="form.priority = option.value"
                                        >
                                            {{ option.label }}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <!-- Tags -->
                            <div>
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >
                                    Tags
                                </label>
                                <TagInput
                                    v-model="form.tags"
                                    :suggestions="allTagSuggestions"
                                    placeholder="Add tags..."
                                />
                            </div>

                            <!-- AI Agent Selection -->
                            <div>
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >
                                    실행 AI 에이전트
                                </label>
                                <div class="grid grid-cols-4 gap-2">
                                    <button
                                        v-for="option in aiProviderOptions"
                                        :key="option.value ?? 'none'"
                                        type="button"
                                        :class="[
                                            'p-2 rounded-lg text-xs font-medium transition-all border-2 flex flex-col items-center gap-1',
                                            form.aiProvider === option.value
                                                ? 'bg-indigo-500 text-white border-indigo-600'
                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-transparent hover:border-gray-300 dark:hover:border-gray-600',
                                        ]"
                                        :title="option.description"
                                        @click="form.aiProvider = option.value"
                                    >
                                        <IconRenderer :emoji="option.icon" class="w-4 h-4" />
                                        <span>{{ option.label }}</span>
                                    </button>
                                </div>
                                <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                                    {{
                                        aiProviderOptions.find((o) => o.value === form.aiProvider)
                                            ?.description || '에이전트를 선택하세요'
                                    }}
                                </p>

                                <!-- Model Selection (Conditional) -->
                                <div
                                    v-if="form.aiProvider && availableModels.length > 0"
                                    class="mt-3"
                                >
                                    <label
                                        class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5"
                                    >
                                        AI 모델 선택
                                    </label>
                                    <select
                                        v-model="form.aiModel"
                                        class="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    >
                                        <option
                                            v-for="model in availableModels"
                                            :key="model.value"
                                            :value="model.value"
                                        >
                                            {{ model.label }}
                                        </option>
                                    </select>
                                </div>
                            </div>

                            <!-- Operator Assignment -->
                            <div>
                                <OperatorSelector
                                    v-model="form.assignedOperatorId"
                                    :project-id="task?.projectId || null"
                                />
                            </div>

                            <!-- AI Estimated Time -->
                            <div>
                                <div class="flex items-center justify-between mb-2">
                                    <label
                                        class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        예상 소요 시간 (AI 추정)
                                    </label>
                                    <button
                                        type="button"
                                        class="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500 text-white hover:bg-purple-600 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                        :disabled="isEstimating || !form.title.trim()"
                                        @click="estimateTimeWithAI"
                                    >
                                        <svg
                                            v-if="isEstimating"
                                            class="w-3.5 h-3.5 animate-spin"
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
                                            class="w-3.5 h-3.5"
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
                                        {{ isEstimating ? '추정 중...' : 'AI 추정' }}
                                    </button>
                                </div>

                                <!-- Current Estimation Display -->
                                <div
                                    class="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
                                >
                                    <div class="flex items-center justify-between mb-2">
                                        <span
                                            class="text-lg font-semibold text-gray-900 dark:text-white"
                                        >
                                            {{ formattedEstimatedTime }}
                                        </span>
                                        <span
                                            v-if="aiEstimation"
                                            class="px-2 py-0.5 text-xs rounded-full"
                                            :class="{
                                                'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300':
                                                    aiEstimation.complexity.level === 'simple',
                                                'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300':
                                                    aiEstimation.complexity.level === 'moderate',
                                                'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300':
                                                    aiEstimation.complexity.level === 'complex',
                                                'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300':
                                                    aiEstimation.complexity.level ===
                                                    'very_complex',
                                            }"
                                        >
                                            {{
                                                aiEstimation.complexity.level === 'simple'
                                                    ? '단순'
                                                    : aiEstimation.complexity.level === 'moderate'
                                                      ? '보통'
                                                      : aiEstimation.complexity.level === 'complex'
                                                        ? '복잡'
                                                        : '매우 복잡'
                                            }}
                                        </span>
                                    </div>

                                    <!-- AI Estimation Details -->
                                    <div v-if="aiEstimation" class="space-y-2">
                                        <p class="text-xs text-gray-600 dark:text-gray-400">
                                            {{ aiEstimation.time.reasoning }}
                                        </p>

                                        <!-- Time Breakdown -->
                                        <div class="mt-2 space-y-1">
                                            <div
                                                v-for="phase in aiEstimation.time.breakdown"
                                                :key="phase.phase"
                                                class="flex items-center justify-between text-xs"
                                            >
                                                <span class="text-gray-500 dark:text-gray-400">{{
                                                    phase.phase
                                                }}</span>
                                                <span class="text-gray-700 dark:text-gray-300">
                                                    {{
                                                        Math.floor(phase.minutes / 60) > 0
                                                            ? `${Math.floor(phase.minutes / 60)}h `
                                                            : ''
                                                    }}{{ phase.minutes % 60 }}m
                                                </span>
                                            </div>
                                        </div>

                                        <!-- Confidence -->
                                        <div
                                            class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600"
                                        >
                                            <div class="flex items-center justify-between text-xs">
                                                <span class="text-gray-500 dark:text-gray-400"
                                                    >신뢰도</span
                                                >
                                                <span class="text-gray-700 dark:text-gray-300"
                                                    >{{
                                                        Math.round(
                                                            aiEstimation.time.confidence * 100
                                                        )
                                                    }}%</span
                                                >
                                            </div>
                                            <div
                                                class="mt-1 w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5"
                                            >
                                                <div
                                                    class="h-1.5 rounded-full transition-all"
                                                    :class="{
                                                        'bg-green-500':
                                                            aiEstimation.time.confidence >= 0.8,
                                                        'bg-yellow-500':
                                                            aiEstimation.time.confidence >= 0.6 &&
                                                            aiEstimation.time.confidence < 0.8,
                                                        'bg-orange-500':
                                                            aiEstimation.time.confidence < 0.6,
                                                    }"
                                                    :style="{
                                                        width: `${aiEstimation.time.confidence * 100}%`,
                                                    }"
                                                />
                                            </div>
                                        </div>

                                        <!-- Suggestions -->
                                        <div
                                            v-if="aiEstimation.suggestions.length > 0"
                                            class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600"
                                        >
                                            <p
                                                class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
                                            >
                                                제안사항
                                            </p>
                                            <ul
                                                class="text-xs text-gray-500 dark:text-gray-400 space-y-0.5"
                                            >
                                                <li
                                                    v-for="suggestion in aiEstimation.suggestions"
                                                    :key="suggestion"
                                                    class="flex items-start gap-1"
                                                >
                                                    <span class="text-purple-500">•</span>
                                                    {{ suggestion }}
                                                </li>
                                            </ul>
                                        </div>
                                    </div>

                                    <!-- Placeholder when no estimation -->
                                    <p v-else class="text-xs text-gray-500 dark:text-gray-400">
                                        'AI 추정' 버튼을 클릭하면 태스크 내용을 기반으로 소요 시간을
                                        자동으로 추정합니다.
                                    </p>
                                </div>

                                <p v-if="errors.estimation" class="mt-1 text-sm text-red-500">
                                    {{ errors.estimation }}
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
                                    v-model="form.dueDate"
                                    type="datetime-local"
                                    class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>

                            <!-- Delete Confirmation -->
                            <div
                                v-if="showDeleteConfirm"
                                class="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800"
                            >
                                <p class="text-sm text-red-700 dark:text-red-300 mb-3">
                                    Are you sure you want to delete this task? This action cannot be
                                    undone.
                                </p>
                                <div class="flex gap-2">
                                    <button
                                        type="button"
                                        class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
                                        @click="handleDelete"
                                    >
                                        Yes, Delete
                                    </button>
                                    <button
                                        type="button"
                                        class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
                                        @click="showDeleteConfirm = false"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Footer -->
                        <div
                            class="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700"
                        >
                            <button
                                v-if="!showDeleteConfirm"
                                type="button"
                                class="px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-sm"
                                @click="showDeleteConfirm = true"
                            >
                                Delete Task
                            </button>
                            <div v-else />

                            <div class="flex gap-3">
                                <button
                                    type="button"
                                    class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    @click="handleClose"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                    :disabled="!isValid"
                                    @click="handleSave"
                                >
                                    Save Changes
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
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
