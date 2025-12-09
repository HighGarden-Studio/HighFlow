<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Task } from '@core/types/database';
import { useTaskStore } from '../../renderer/stores/taskStore';
import { getProviderIcon } from '../../utils/iconMapping';
import IconRenderer from '../common/IconRenderer.vue';

// 미연동 Provider 정보 타입
interface MissingProviderInfo {
    id: string;
    name: string;
    requiredTags?: string[];
}

interface Props {
    task: Task;
    subtasks?: Task[]; // 서브테스크 목록
    isDragging?: boolean;
    showAssignee?: boolean;
    showDueDate?: boolean;
    showPriority?: boolean;
    showTags?: boolean;
    missingProvider?: MissingProviderInfo | null; // 미연동 Provider 정보
}

const props = withDefaults(defineProps<Props>(), {
    subtasks: () => [],
    isDragging: false,
    showAssignee: true,
    showDueDate: true,
    showPriority: true,
    showTags: true,
    missingProvider: null,
});

const emit = defineEmits<{
    (e: 'click', task: Task): void;
    (e: 'previewStream', task: Task): void;
    (e: 'edit', task: Task): void;
    (e: 'delete', task: Task): void;
    (e: 'execute', task: Task): void;
    (e: 'enhancePrompt', task: Task): void;
    (e: 'previewPrompt', task: Task): void;
    (e: 'previewResult', task: Task): void;
    (e: 'retry', task: Task): void;
    (e: 'viewHistory', task: Task): void;
    (e: 'viewProgress', task: Task): void;
    (e: 'pause', task: Task): void; // 일시정지
    (e: 'resume', task: Task): void; // 재개
    (e: 'stop', task: Task): void; // 중지 (TODO로 복귀)
    (e: 'subdivide', task: Task): void; // 테스크 세분화
    (e: 'openApproval', task: Task): void; // 승인 모달 열기
    (e: 'connectionStart', task: Task, event: DragEvent): void; // 연결 시작
    (e: 'connectionEnd', task: Task): void; // 연결 대상
    (e: 'connectProvider', providerId: string): void; // Provider 연동
    (e: 'operatorDrop', taskId: number, operatorId: number): void; // Operator 할당
}>();

// Task store for global execution state
const taskStore = useTaskStore();

// Get streaming content from global taskStore execution progress
const streamedContent = computed(() => {
    const progress = taskStore.executionProgress.get(props.task.id);
    return progress?.content || '';
});

// Check if this task is currently executing via taskStore
const isTaskCurrentlyExecuting = computed(() => {
    return taskStore.isTaskExecuting(props.task.id);
});

// Get review streaming content from global taskStore review progress
const reviewStreamedContent = computed(() => {
    const progress = taskStore.reviewProgress.get(props.task.id);
    return progress?.content || '';
});

// Check if this task is currently being reviewed via taskStore
const isTaskCurrentlyReviewing = computed(() => {
    return taskStore.isTaskReviewing(props.task.id);
});

// Connection point state
const isConnectionDragging = ref(false);
const isConnectionTarget = ref(false);
const isHovered = ref(false);

// Operator state
const assignedOperator = ref<any>(null);

// Load assigned operator if exists
if (props.task.assignedOperatorId) {
    window.electron.operators
        .get(props.task.assignedOperatorId)
        .then((operator) => {
            assignedOperator.value = operator;
        })
        .catch((error) => {
            console.error('Failed to load operator:', error);
        });
}

// 연결점 핸들러
function handleConnectionDragStart(event: DragEvent) {
    event.stopPropagation();
    isConnectionDragging.value = true;

    // 드래그 데이터 설정
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'link';
        event.dataTransfer.setData(
            'application/x-task-connection',
            JSON.stringify({
                sourceTaskId: props.task.id,
                sourceTaskTitle: props.task.title,
            })
        );
    }

    emit('connectionStart', props.task, event);
}

function handleConnectionDragEnd() {
    isConnectionDragging.value = false;
}

function handleDragOver(event: DragEvent) {
    // 연결 드래그인지 확인
    if (event.dataTransfer?.types.includes('application/x-task-connection')) {
        event.preventDefault();
        event.stopPropagation();

        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'link';
        }

        // 자신에게 드롭하는 것은 방지
        const data = event.dataTransfer?.getData('application/x-task-connection');
        if (data) {
            try {
                const parsed = JSON.parse(data);
                if (parsed.sourceTaskId !== props.task.id) {
                    isConnectionTarget.value = true;
                }
            } catch {
                isConnectionTarget.value = true;
            }
        } else {
            isConnectionTarget.value = true;
        }
    }
}

function handleDragLeave() {
    isConnectionTarget.value = false;
}

function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isConnectionTarget.value = false;

    const data = event.dataTransfer?.getData('application/x-task-connection');
    if (data) {
        try {
            JSON.parse(data); // Validate JSON format
            // 자기 자신이든 아니든 connectionEnd 이벤트 발생 (연결선 정리를 위해)
            // KanbanBoardView에서 자기 자신 여부를 체크하여 처리
            emit('connectionEnd', props.task);
        } catch {
            console.error('Failed to parse connection data');
        }
    }
}

// 확장/축소 상태 (그룹 테스크용)
const isExpanded = ref(false);

/**
 * Get priority color
 */
const priorityColor = computed(() => {
    switch (props.task.priority) {
        case 'urgent':
            return 'bg-red-500';
        case 'high':
            return 'bg-orange-500';
        case 'medium':
            return 'bg-yellow-500';
        case 'low':
            return 'bg-blue-500';
        default:
            return 'bg-gray-500';
    }
});

/**
 * Format due date
 */
const dueDateFormatted = computed(() => {
    if (!props.task.dueDate) return null;

    const date = new Date(props.task.dueDate);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days < 0) {
        return `Overdue by ${Math.abs(days)}d`;
    } else if (days === 0) {
        return 'Due today';
    } else if (days === 1) {
        return 'Due tomorrow';
    } else {
        return `Due in ${days}d`;
    }
});

// 필요한 MCP 목록을 안전하게 배열로 변환
const requiredMCPs = computed<string[]>(() => {
    const raw = (props.task as unknown as { requiredMCPs?: unknown }).requiredMCPs;

    // JSON 문자열로 들어온 경우
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.filter(
                    (item): item is string => typeof item === 'string' && item.trim().length > 0
                );
            }
        } catch {
            // JSON 파싱 실패 시 콤마 분리 처리
            return raw
                .split(',')
                .map((item) => item.trim())
                .filter((item) => item.length > 0);
        }
    }

    if (Array.isArray(raw)) {
        return raw.filter(
            (item): item is string => typeof item === 'string' && item.trim().length > 0
        );
    }

    return [];
});

// 의존성 목록을 안전하게 배열로 변환
const dependencies = computed<number[]>(() => {
    const raw = (props.task as unknown as { dependencies?: unknown }).dependencies;

    if (typeof raw === 'string') {
        // JSON 문자열 가능성 우선 처리
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed
                    .map((item) => Number(item))
                    .filter((num) => Number.isFinite(num) && num > 0);
            }
        } catch {
            // 계속 진행
        }

        return raw
            .split(',')
            .map((item) => Number(item.trim()))
            .filter((num) => Number.isFinite(num) && num > 0);
    }

    if (Array.isArray(raw)) {
        return raw.map((item) => Number(item)).filter((num) => Number.isFinite(num) && num > 0);
    }

    return [];
});

// 태그를 안전하게 배열로 변환
const tags = computed<string[]>(() => {
    const raw = (props.task as unknown as { tags?: unknown }).tags;

    if (typeof raw === 'string') {
        // JSON 문자열 처리
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.filter(
                    (tag): tag is string => typeof tag === 'string' && tag.trim().length > 0
                );
            }
        } catch {
            // 콤마 분리 처리
            return raw
                .split(',')
                .map((tag) => tag.trim())
                .filter((tag) => tag.length > 0);
        }
    }

    if (Array.isArray(raw)) {
        return raw.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0);
    }

    return [];
});

/**
 * Check if task is overdue
 */
const isOverdue = computed(() => {
    if (!props.task.dueDate) return false;
    return new Date(props.task.dueDate) < new Date();
});

/**
 * Check if execution settings are missing (prompt or AI provider not set)
 */
const isMissingExecutionSettings = computed(() => {
    const hasPrompt = props.task.generatedPrompt || props.task.description;
    const hasProvider = props.task.aiProvider;
    return !hasPrompt || !hasProvider;
});

/**
 * Get which execution settings are missing
 */
const missingSettings = computed(() => {
    const missing: string[] = [];
    const hasPrompt = props.task.generatedPrompt || props.task.description;
    const hasProvider = props.task.aiProvider;
    if (!hasPrompt) missing.push('프롬프트');
    if (!hasProvider) missing.push('AI Provider');
    return missing;
});

/**
 * Get AI provider badge color
 */
const aiProviderColor = computed(() => {
    switch (props.task.aiProvider) {
        case 'anthropic':
            return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300';
        case 'openai':
            return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
        case 'google':
            return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
        case 'claude-code':
            return 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300';
        case 'antigravity':
            return 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300';
        case 'codex':
            return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300';
        default:
            return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
});

/**
 * 미연동 Provider 체크
 */
const hasMissingProvider = computed(() => !!props.missingProvider);

/**
 * Show action buttons based on task status
 */
// 세분화된 테스크는 실행 불가, 미연동 Provider가 있으면 실행 불가
const canExecute = computed(() => !props.task.isSubdivided && !hasMissingProvider.value);
const showExecuteButton = computed(() => props.task.status === 'todo' && canExecute.value);
const showEnhancePromptButton = computed(() => props.task.status === 'todo' && canExecute.value);
const showPreviewResultButton = computed(
    () => props.task.status === 'in_review' || props.task.status === 'done'
);
const showRetryButton = computed(() => props.task.status === 'in_review' && canExecute.value);
const showHistoryButton = computed(() => props.task.status === 'done');
const showProgressButton = computed(() => props.task.status === 'in_progress' && canExecute.value);
// 세분화 버튼은 1뎁스(parentTaskId === null)이고 TODO 상태이며 아직 세분화되지 않은 경우만 표시
const showSubdivideButton = computed(
    () =>
        props.task.parentTaskId === null && props.task.status === 'todo' && !props.task.isSubdivided
);
// NEEDS_APPROVAL 상태: 사용자 승인 필요
const showApprovalButton = computed(() => props.task.status === 'needs_approval');
const isNeedsApprovalStatus = computed(() => props.task.status === 'needs_approval');

// 승인 요청 정보 (confirmationRequest 필드에서 가져옴)
const confirmationInfo = computed(() => {
    // task에 confirmationRequest 필드가 있다고 가정
    const request = (props.task as any).confirmationRequest;
    if (!request) {
        return {
            title: '승인 요청',
            summary: '이 작업에 대한 사용자 승인이 필요합니다.',
            details: null,
        };
    }
    return {
        title: request.title || '승인 요청',
        summary: request.summary || '이 작업에 대한 사용자 승인이 필요합니다.',
        details: request.details || null,
    };
});

/**
 * Handle action button clicks
 */
function handleExecute(event: Event) {
    event.stopPropagation();
    emit('execute', props.task);
}

function handleEnhancePrompt(event: Event) {
    event.stopPropagation();
    emit('enhancePrompt', props.task);
}

function handlePreviewPrompt(event: Event) {
    event.stopPropagation();
    emit('previewPrompt', props.task);
}

function handlePreviewResult(event: Event) {
    event.stopPropagation();
    emit('previewResult', props.task);
}

function handleRetry(event: Event) {
    event.stopPropagation();
    emit('retry', props.task);
}

function handleViewHistory(event: Event) {
    event.stopPropagation();
    emit('viewHistory', props.task);
}

function handleViewProgress(event: Event) {
    event.stopPropagation();
    emit('viewProgress', props.task);
}

async function handlePause(event: Event) {
    event.stopPropagation();
    // Check if there's an active execution before emitting
    if (isTaskCurrentlyExecuting.value) {
        emit('pause', props.task);
    } else {
        // No active execution - offer to reset status
        console.warn(`Task ${props.task.id} has no active execution, cannot pause`);
        // Directly emit stop to reset to TODO
        emit('stop', props.task);
    }
}

function handleResume(event: Event) {
    event.stopPropagation();
    emit('resume', props.task);
}

async function handleStop(event: Event) {
    event.stopPropagation();
    emit('stop', props.task);
}

function handleSubdivide(event: Event) {
    event.stopPropagation();
    emit('subdivide', props.task);
}

function handleOpenApproval(event: Event) {
    event.stopPropagation();
    emit('openApproval', props.task);
}

// 미연동 Provider 연동 핸들러
function handleConnectProviderClick() {
    if (props.missingProvider) {
        emit('connectProvider', props.missingProvider.id);
    }
}

// Operator drop handlers
const isOperatorDragOver = ref(false);

function handleOperatorDragOver(event: DragEvent) {
    event.preventDefault();
    const operatorData = event.dataTransfer?.getData('application/x-operator');
    if (operatorData) {
        isOperatorDragOver.value = true;
        event.dataTransfer!.dropEffect = 'copy';
    }
}

function handleOperatorDragLeave() {
    isOperatorDragOver.value = false;
}

function handleOperatorDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isOperatorDragOver.value = false;

    const operatorData = event.dataTransfer?.getData('application/x-operator');
    if (operatorData) {
        try {
            const operator = JSON.parse(operatorData);
            emit('operatorDrop', props.task.id, operator.id);
        } catch (error) {
            console.error('Failed to parse operator data:', error);
        }
    }
}

function handleDelete() {
    emit('delete', props.task);
}

/**
 * 서브테스크 확장/축소 토글
 */
function toggleExpand(event: Event) {
    event.stopPropagation();
    isExpanded.value = !isExpanded.value;
}

/**
 * AI Provider 정보
 */
const aiProviderInfo = computed(() => {
    const provider = props.task.aiProvider;
    if (!provider) return null;

    const providerMap: Record<
        string,
        { name: string; icon: string; color: string; bgColor: string }
    > = {
        anthropic: {
            name: 'Claude',
            icon: 'anthropic', // Use provider ID for getProviderIcon
            color: 'text-orange-700 dark:text-orange-300',
            bgColor: 'bg-orange-100 dark:bg-orange-900/50',
        },
        openai: {
            name: 'OpenAI',
            icon: 'openai', // Use provider ID
            color: 'text-emerald-700 dark:text-emerald-300',
            bgColor: 'bg-emerald-100 dark:bg-emerald-900/50',
        },
        google: {
            name: 'Gemini',
            icon: 'google', // Use provider ID
            color: 'text-blue-700 dark:text-blue-300',
            bgColor: 'bg-blue-100 dark:bg-blue-900/50',
        },
        groq: {
            name: 'Groq',
            icon: 'groq', // Use provider ID
            color: 'text-purple-700 dark:text-purple-300',
            bgColor: 'bg-purple-100 dark:bg-purple-900/50',
        },
        'claude-code': {
            name: 'Claude Code',
            icon: 'claude-code', // Use provider ID
            color: 'text-amber-700 dark:text-amber-300',
            bgColor: 'bg-amber-100 dark:bg-amber-900/50',
        },
        antigravity: {
            name: 'Antigravity',
            icon: 'antigravity', // Use provider ID
            color: 'text-indigo-700 dark:text-indigo-300',
            bgColor: 'bg-indigo-100 dark:bg-indigo-900/50',
        },
        codex: {
            name: 'Codex',
            icon: 'codex', // Use provider ID
            color: 'text-cyan-700 dark:text-cyan-300',
            bgColor: 'bg-cyan-100 dark:bg-cyan-900/50',
        },
        local: {
            name: 'Local',
            icon: 'local', // Use provider ID (will fallback to ph:cube)
            color: 'text-gray-700 dark:text-gray-300',
            bgColor: 'bg-gray-100 dark:bg-gray-700',
        },
        'azure-openai': {
            name: 'Azure',
            icon: 'azure-openai', // Use provider ID
            color: 'text-sky-700 dark:text-sky-300',
            bgColor: 'bg-sky-100 dark:bg-sky-900/50',
        },
        mistral: {
            name: 'Mistral',
            icon: 'mistral', // Use provider ID
            color: 'text-rose-700 dark:text-rose-300',
            bgColor: 'bg-rose-100 dark:bg-rose-900/50',
        },
        cohere: {
            name: 'Cohere',
            icon: 'cohere', // Use provider ID
            color: 'text-teal-700 dark:text-teal-300',
            bgColor: 'bg-teal-100 dark:bg-teal-900/50',
        },
        perplexity: {
            name: 'Perplexity',
            icon: 'perplexity', // Use provider ID
            color: 'text-violet-700 dark:text-violet-300',
            bgColor: 'bg-violet-100 dark:bg-violet-900/50',
        },
        deepseek: {
            name: 'DeepSeek',
            icon: 'deepseek', // Use provider ID
            color: 'text-blue-700 dark:text-blue-300',
            bgColor: 'bg-blue-100 dark:bg-blue-900/50',
        },
    };

    return (
        providerMap[provider] || {
            name: provider,
            icon: provider, // Use provider as fallback for getProviderIcon
            color: 'text-gray-700 dark:text-gray-300',
            bgColor: 'bg-gray-100 dark:bg-gray-700',
        }
    );
});

/**
 * 예상 결과물 형식 아이콘/라벨 매핑
 */
const outputFormatInfo = computed(() => {
    const taskData = props.task as unknown as {
        expectedOutputFormat?: unknown;
        outputFormat?: unknown;
        codeLanguage?: unknown;
    };

    const rawFormat =
        taskData.expectedOutputFormat || taskData.outputFormat || taskData.codeLanguage || null;

    if (!rawFormat || typeof rawFormat !== 'string') return null;

    const format = rawFormat.toLowerCase().trim();
    const codeFormats = [
        'js',
        'jsx',
        'ts',
        'tsx',
        'javascript',
        'typescript',
        'python',
        'go',
        'java',
        'c',
        'cpp',
        'c++',
        'c#',
        'csharp',
        'rust',
        'ruby',
        'php',
        'swift',
        'kotlin',
        'solidity',
        'scala',
        'perl',
        'lua',
        'elixir',
        'haskell',
        'dart',
        'r',
    ];

    const map: Record<string, { label: string; icon: string; bgColor: string; textColor: string }> =
        {
            text: {
                label: 'Text',
                icon: '📝',
                bgColor: 'bg-gray-100 dark:bg-gray-800',
                textColor: 'text-gray-700 dark:text-gray-200',
            },
            markdown: {
                label: 'Markdown',
                icon: '📄',
                bgColor: 'bg-emerald-100 dark:bg-emerald-900/40',
                textColor: 'text-emerald-700 dark:text-emerald-200',
            },
            html: {
                label: 'HTML',
                icon: '🌐',
                bgColor: 'bg-blue-100 dark:bg-blue-900/40',
                textColor: 'text-blue-700 dark:text-blue-200',
            },
            pdf: {
                label: 'PDF',
                icon: '📕',
                bgColor: 'bg-rose-100 dark:bg-rose-900/40',
                textColor: 'text-rose-700 dark:text-rose-200',
            },
            json: {
                label: 'JSON',
                icon: '🧩',
                bgColor: 'bg-amber-100 dark:bg-amber-900/40',
                textColor: 'text-amber-700 dark:text-amber-200',
            },
            yaml: {
                label: 'YAML',
                icon: '🗂️',
                bgColor: 'bg-amber-100 dark:bg-amber-900/40',
                textColor: 'text-amber-700 dark:text-amber-200',
            },
            csv: {
                label: 'CSV',
                icon: '📊',
                bgColor: 'bg-indigo-100 dark:bg-indigo-900/40',
                textColor: 'text-indigo-700 dark:text-indigo-200',
            },
            sql: {
                label: 'SQL',
                icon: '🗄️',
                bgColor: 'bg-purple-100 dark:bg-purple-900/40',
                textColor: 'text-purple-700 dark:text-purple-200',
            },
            shell: {
                label: 'Shell',
                icon: '💻',
                bgColor: 'bg-slate-100 dark:bg-slate-800',
                textColor: 'text-slate-700 dark:text-slate-200',
            },
            mermaid: {
                label: 'Mermaid',
                icon: '📈',
                bgColor: 'bg-teal-100 dark:bg-teal-900/40',
                textColor: 'text-teal-700 dark:text-teal-200',
            },
            svg: {
                label: 'SVG',
                icon: '🖼️',
                bgColor: 'bg-pink-100 dark:bg-pink-900/40',
                textColor: 'text-pink-700 dark:text-pink-200',
            },
            png: {
                label: 'PNG',
                icon: '🖼️',
                bgColor: 'bg-pink-100 dark:bg-pink-900/40',
                textColor: 'text-pink-700 dark:text-pink-200',
            },
            mp4: {
                label: 'Video',
                icon: '🎬',
                bgColor: 'bg-orange-100 dark:bg-orange-900/40',
                textColor: 'text-orange-700 dark:text-orange-200',
            },
            mp3: {
                label: 'Audio',
                icon: '🎵',
                bgColor: 'bg-cyan-100 dark:bg-cyan-900/40',
                textColor: 'text-cyan-700 dark:text-cyan-200',
            },
            diff: {
                label: 'Diff',
                icon: '🔀',
                bgColor: 'bg-lime-100 dark:bg-lime-900/40',
                textColor: 'text-lime-700 dark:text-lime-200',
            },
            log: {
                label: 'Log',
                icon: '📜',
                bgColor: 'bg-gray-100 dark:bg-gray-800',
                textColor: 'text-gray-700 dark:text-gray-200',
            },
            code: {
                label: 'Code',
                icon: '💻',
                bgColor: 'bg-slate-100 dark:bg-slate-800',
                textColor: 'text-slate-700 dark:text-slate-200',
            },
        };

    if (map[format]) return map[format];
    if (codeFormats.includes(format)) return { ...map.code, label: rawFormat };

    return {
        label: rawFormat,
        icon: '📦',
        bgColor: 'bg-gray-100 dark:bg-gray-800',
        textColor: 'text-gray-700 dark:text-gray-200',
    };
});

/**
 * 서브테스크 상태별 개수
 */
const subtaskStats = computed(() => {
    if (!props.subtasks || props.subtasks.length === 0) {
        return { total: 0, done: 0, inProgress: 0, todo: 0 };
    }

    return {
        total: props.subtasks.length,
        done: props.subtasks.filter((st) => st.status === 'done').length,
        inProgress: props.subtasks.filter((st) => st.status === 'in_progress').length,
        todo: props.subtasks.filter((st) => st.status === 'todo').length,
    };
});

/**
 * 서브테스크 진행률
 */
const subtaskProgress = computed(() => {
    if (subtaskStats.value.total === 0) return 0;
    return Math.round((subtaskStats.value.done / subtaskStats.value.total) * 100);
});
</script>

<template>
    <div
        class="task-card"
        :class="[
            { dragging: isDragging },
            { 'connection-dragging': isConnectionDragging },
            { 'connection-target': isConnectionTarget },
            { hovered: isHovered },
            { 'operator-drag-over': isOperatorDragOver },
        ]"
        @click="emit('click', task)"
        @mouseenter="isHovered = true"
        @mouseleave="isHovered = false"
        @dragover="handleOperatorDragOver"
        @dragleave="handleOperatorDragLeave"
        @drop="handleOperatorDrop"
    >
        <!-- Connection Points - 마우스 호버시 또는 드래그 중 표시 -->
        <div
            v-show="(isHovered || isConnectionDragging) && task.status === 'todo'"
            class="absolute -right-3 top-1/2 -translate-y-1/2 z-20"
        >
            <div
                draggable="true"
                :class="[
                    'w-6 h-6 rounded-full flex items-center justify-center cursor-grab transition-all shadow-lg border-2 border-white dark:border-gray-800',
                    isConnectionDragging
                        ? 'bg-indigo-600 scale-125 ring-4 ring-indigo-300 dark:ring-indigo-700'
                        : 'bg-indigo-500 hover:bg-indigo-600 hover:scale-110',
                ]"
                title="드래그하여 의존성 연결"
                @dragstart="handleConnectionDragStart"
                @dragend="handleConnectionDragEnd"
            >
                <svg
                    class="w-3.5 h-3.5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 5l7 7-7 7M5 5l7 7-7 7"
                    />
                </svg>
            </div>
        </div>

        <!-- Left Connection Point (입력점 - 우측과 동일하게 드래그 가능) -->
        <div
            v-show="(isHovered || isConnectionDragging) && task.status === 'todo'"
            class="absolute -left-3 top-1/2 -translate-y-1/2 z-20"
        >
            <div
                draggable="true"
                :class="[
                    'w-6 h-6 rounded-full flex items-center justify-center cursor-grab transition-all shadow-lg border-2 border-white dark:border-gray-800',
                    isConnectionDragging
                        ? 'bg-indigo-600 scale-125 ring-4 ring-indigo-300 dark:ring-indigo-700'
                        : 'bg-indigo-500 hover:bg-indigo-600 hover:scale-110',
                ]"
                title="드래그하여 의존성 연결"
                @dragstart="handleConnectionDragStart"
                @dragend="handleConnectionDragEnd"
            >
                <svg
                    class="w-3.5 h-3.5 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                    />
                </svg>
            </div>
        </div>

        <!-- Connection Target Indicator -->
        <div
            v-if="isConnectionTarget"
            class="absolute inset-0 rounded-lg bg-indigo-500/10 border-2 border-dashed border-indigo-500 flex items-center justify-center z-10 pointer-events-none"
        >
            <div
                class="bg-indigo-500 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg"
            >
                이 태스크 완료 시 실행
            </div>
        </div>
        <!-- Priority Indicator -->
        <div
            v-if="showPriority && task.priority"
            :class="['absolute top-0 left-0 w-1 h-full rounded-l-lg', priorityColor]"
        />

        <!-- Header - Full Width -->
        <div class="flex flex-col gap-2 mb-2">
            <!-- Provider & ID Row -->
            <div class="flex items-center justify-between w-full">
                <!-- AI Provider Badge (Large, Prominent) -->
                <div
                    v-if="aiProviderInfo"
                    :class="[
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium',
                        aiProviderInfo.bgColor,
                        aiProviderInfo.color,
                    ]"
                    :title="`AI Provider: ${aiProviderInfo.name}`"
                >
                    <IconRenderer :icon="getProviderIcon(aiProviderInfo.icon)" class="w-5 h-5" />
                    <span class="text-sm font-semibold">{{ aiProviderInfo.name }}</span>
                </div>
                <!-- No Provider Badge -->
                <div
                    v-else
                    class="flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                    title="AI Provider 미설정"
                >
                    <span class="text-lg">❓</span>
                    <span class="text-sm">미설정</span>
                </div>

                <!-- Operator Badge -->
                <div
                    v-if="assignedOperator"
                    class="flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border-2 border-purple-300 dark:border-purple-700"
                    :title="`Operator: ${assignedOperator.name} (${assignedOperator.role})`"
                >
                    <span class="text-base">{{ assignedOperator.avatar || '🤖' }}</span>
                    <span class="text-sm font-semibold">{{ assignedOperator.name }}</span>
                </div>

                <div class="flex items-center gap-2">
                    <!-- Expected Output Icon -->
                    <span
                        v-if="outputFormatInfo"
                        :class="[
                            'flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium',
                            outputFormatInfo.bgColor,
                            outputFormatInfo.textColor,
                        ]"
                        :title="`예상 결과물: ${outputFormatInfo.label}`"
                    >
                        <IconRenderer :emoji="outputFormatInfo.icon" class="w-4 h-4" />
                        <span class="font-semibold">{{ outputFormatInfo.label }}</span>
                    </span>

                    <!-- Task ID -->
                    <span
                        class="text-xs text-gray-500 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded"
                    >
                        #{{ task.projectSequence }}
                    </span>
                    <!-- Execution Order -->
                    <span
                        v-if="task.executionOrder"
                        class="text-xs text-blue-600 dark:text-blue-400 font-mono bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded"
                        title="실행 순서"
                    >
                        {{ task.executionOrder }}
                    </span>
                </div>
            </div>

            <!-- Title -->
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">
                {{ task.title }}
            </h3>

            <!-- Badges Row -->
            <div class="flex flex-wrap gap-1">
                <!-- AI 자동 검토 완료 배지 (DONE 상태) -->
                <span
                    v-if="task.status === 'done' && task.autoReviewed"
                    class="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 flex items-center gap-1"
                    title="AI 자동 검토 완료"
                >
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            fill-rule="evenodd"
                            d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clip-rule="evenodd"
                        />
                    </svg>
                    AI 검토완료
                </span>

                <!-- 실행중 스피너 배지 (IN_PROGRESS 실행중) -->
                <span
                    v-if="task.status === 'in_progress' && !task.isPaused"
                    class="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center gap-1"
                    title="실행중"
                >
                    <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
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
                    실행중
                </span>

                <!-- 일시정지 배지 (IN_PROGRESS 일시정지) -->
                <span
                    v-if="task.status === 'in_progress' && task.isPaused"
                    class="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 flex items-center gap-1"
                    title="일시정지됨"
                >
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            fill-rule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                            clip-rule="evenodd"
                        />
                    </svg>
                    일시정지
                </span>

                <!-- 자동 실행 예정 배지 (triggerConfig 있음) -->
                <span
                    v-if="task.status === 'todo' && task.triggerConfig"
                    class="px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 flex items-center gap-1"
                    title="자동 실행 트리거 설정됨"
                >
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            fill-rule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                            clip-rule="evenodd"
                        />
                    </svg>
                    자동실행
                </span>

                <!-- 세분화된 그룹 테스크 배지 -->
                <span
                    v-if="task.isSubdivided"
                    class="px-2 py-0.5 text-xs font-medium rounded-full bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 flex items-center gap-1"
                    title="세분화된 그룹 테스크 (실행 불가)"
                >
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"
                        />
                    </svg>
                    그룹 ({{ task.subtaskCount }}개)
                </span>

                <!-- 승인 대기 배지 (IN_CONFIRM 상태) -->
                <span
                    v-if="isNeedsApprovalStatus"
                    class="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 flex items-center gap-1 animate-pulse"
                    title="사용자 승인 대기중"
                >
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            fill-rule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                            clip-rule="evenodd"
                        />
                    </svg>
                    승인 대기
                </span>

                <!-- 미연동 Provider 배지 -->
                <span
                    v-if="hasMissingProvider"
                    class="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 flex items-center gap-1"
                    :title="`${missingProvider?.name} Provider 연동 필요`"
                >
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            fill-rule="evenodd"
                            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                            clip-rule="evenodd"
                        />
                    </svg>
                    연동 필요
                </span>

                <!-- AI 검토 실패 배지 (IN_REVIEW 상태에서 reviewFailed가 true인 경우) -->
                <span
                    v-if="task.status === 'in_review' && task.reviewFailed"
                    class="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 flex items-center gap-1"
                    title="AI 검토 실패 (7점 이하)"
                >
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            fill-rule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                            clip-rule="evenodd"
                        />
                    </svg>
                    검토 실패
                </span>
            </div>

            <!-- AI Execution Metadata Badges -->
            <div class="flex flex-wrap gap-1 mt-1">
                <!-- Expected Output Format badge removed - already shown in header -->

                <!-- Required MCPs -->
                <span
                    v-if="requiredMCPs.length > 0"
                    class="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 flex items-center gap-1"
                    :title="`필요 도구: ${requiredMCPs.join(', ')}`"
                >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                    </svg>
                    {{ requiredMCPs.length }}
                </span>

                <!-- Dependencies -->
                <span
                    v-if="dependencies.length > 0"
                    class="px-2 py-0.5 text-xs font-medium rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 flex items-center gap-1"
                    :title="`의존성: #${dependencies.join(', #')}`"
                >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                        />
                    </svg>
                    {{ dependencies.length }}
                </span>
            </div>
        </div>

        <!-- IN_CONFIRM Status: Approval Request Banner -->
        <div
            v-if="isNeedsApprovalStatus"
            class="mb-3 p-3 bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg"
        >
            <div class="flex items-start gap-2">
                <svg
                    class="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                >
                    <path
                        fill-rule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clip-rule="evenodd"
                    />
                </svg>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-orange-800 dark:text-orange-200">
                        {{ confirmationInfo.title }}
                    </p>
                    <p class="text-xs text-orange-600 dark:text-orange-300 mt-1">
                        {{ confirmationInfo.summary }}
                    </p>
                </div>
            </div>
        </div>

        <!-- Missing Provider Banner -->
        <div
            v-if="hasMissingProvider && !isNeedsApprovalStatus"
            class="mb-3 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg"
        >
            <div class="flex items-start gap-2">
                <svg
                    class="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                >
                    <path
                        fill-rule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clip-rule="evenodd"
                    />
                </svg>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-amber-800 dark:text-amber-200">
                        Provider 연동 필요
                    </p>
                    <p class="text-xs text-amber-600 dark:text-amber-300 mt-1">
                        이 태스크를 실행하려면 <strong>{{ missingProvider?.name }}</strong> 연동이
                        필요합니다.
                    </p>
                </div>
            </div>
        </div>

        <!-- Description -->
        <p
            v-if="task.description && !isNeedsApprovalStatus && !hasMissingProvider"
            class="text-xs text-gray-600 dark:text-gray-300 line-clamp-2 mb-3"
        >
            {{ task.description }}
        </p>

        <!-- Tags -->
        <div v-if="showTags && tags.length > 0" class="flex flex-wrap gap-1 mb-3">
            <span
                v-for="(tag, index) in tags.slice(0, 3)"
                :key="index"
                class="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
            >
                {{ tag }}
            </span>
            <span
                v-if="tags.length > 3"
                class="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
            >
                +{{ tags.length - 3 }}
            </span>
        </div>

        <!-- Streaming Preview - 실시간 AI 응답 미리보기 -->
        <div
            v-if="task.status === 'in_progress' && !task.isPaused"
            class="mb-3 p-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg border border-blue-200 dark:border-blue-800 cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 transition-all shadow-sm"
            @click.stop="emit('previewStream', task)"
            title="클릭하여 실시간 응답 크게 보기"
        >
            <!-- Header with live indicator -->
            <div class="flex items-center justify-between mb-1.5">
                <div class="flex items-center gap-1.5">
                    <span class="relative flex h-2 w-2">
                        <span
                            class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"
                        ></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                    <span
                        class="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide"
                        >LIVE</span
                    >
                </div>
                <span class="text-[10px] text-gray-500 dark:text-gray-400">AI 응답 생성중</span>
            </div>

            <!-- Streaming content - 6pt text, 3 lines max -->
            <div class="relative overflow-hidden" style="min-height: 36px; max-height: 48px">
                <p
                    v-if="streamedContent"
                    class="text-gray-700 dark:text-gray-200 font-mono leading-tight overflow-hidden"
                    style="
                        font-size: 9px;
                        line-height: 12px;
                        display: -webkit-box;
                        -webkit-line-clamp: 3;
                        -webkit-box-orient: vertical;
                    "
                >
                    {{ streamedContent.slice(-300) }}
                </p>
                <p
                    v-else
                    class="text-gray-400 dark:text-gray-500 italic animate-pulse"
                    style="font-size: 9px"
                >
                    ⏳ 응답 대기중...
                </p>
                <!-- Fade out gradient for overflow indication -->
                <div
                    v-if="streamedContent && streamedContent.length > 100"
                    class="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-t from-blue-50 dark:from-blue-900/20 to-transparent pointer-events-none"
                ></div>
            </div>
        </div>

        <!-- Review Streaming Preview - AI 검토중 미리보기 -->
        <div
            v-if="task.status === 'in_review' && isTaskCurrentlyReviewing"
            class="mb-3 p-2 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200 dark:border-purple-800 cursor-pointer hover:border-purple-400 dark:hover:border-purple-600 transition-all shadow-sm"
            @click.stop="emit('click', task)"
            title="클릭하여 상세 보기"
        >
            <!-- Header with live indicator -->
            <div class="flex items-center justify-between mb-1.5">
                <div class="flex items-center gap-1.5">
                    <span class="relative flex h-2 w-2">
                        <span
                            class="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"
                        ></span>
                        <span
                            class="relative inline-flex rounded-full h-2 w-2 bg-purple-500"
                        ></span>
                    </span>
                    <span
                        class="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wide"
                        >REVIEWING</span
                    >
                </div>
                <span class="text-[10px] text-gray-500 dark:text-gray-400">AI 검토중</span>
            </div>

            <!-- Review streaming content - 6pt text, 3 lines max -->
            <div class="relative overflow-hidden" style="min-height: 36px; max-height: 48px">
                <p
                    v-if="reviewStreamedContent"
                    class="text-gray-700 dark:text-gray-200 font-mono leading-tight overflow-hidden"
                    style="
                        font-size: 9px;
                        line-height: 12px;
                        display: -webkit-box;
                        -webkit-line-clamp: 3;
                        -webkit-box-orient: vertical;
                    "
                >
                    {{ reviewStreamedContent.slice(-300) }}
                </p>
                <p
                    v-else
                    class="text-gray-400 dark:text-gray-500 italic animate-pulse"
                    style="font-size: 9px"
                >
                    🔍 검토 시작중...
                </p>
                <!-- Fade out gradient for overflow indication -->
                <div
                    v-if="reviewStreamedContent && reviewStreamedContent.length > 100"
                    class="absolute bottom-0 left-0 right-0 h-3 bg-gradient-to-t from-purple-50 dark:from-purple-900/20 to-transparent pointer-events-none"
                ></div>
            </div>
        </div>

        <!-- Trigger Information (의존성 또는 시간 트리거) -->
        <div
            v-if="task.triggerConfig"
            class="mb-3 p-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded text-xs"
        >
            <!-- 의존성 트리거 -->
            <div v-if="task.triggerConfig.dependsOn" class="flex items-start gap-2">
                <svg
                    class="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5"
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
                <div class="flex-1">
                    <p class="font-medium text-indigo-700 dark:text-indigo-300 mb-1">
                        자동 실행 조건
                    </p>
                    <p class="text-indigo-600 dark:text-indigo-400">
                        Task #{{ task.triggerConfig.dependsOn.taskIds.join(', #') }}
                        {{ task.triggerConfig.dependsOn.operator === 'all' ? '모두' : '하나라도' }}
                        완료 시
                    </p>
                </div>
            </div>

            <!-- 시간 트리거 -->
            <div v-if="task.triggerConfig.scheduledAt" class="flex items-start gap-2">
                <svg
                    class="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5"
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
                <div class="flex-1">
                    <p class="font-medium text-indigo-700 dark:text-indigo-300 mb-1">예약 실행</p>
                    <p class="text-indigo-600 dark:text-indigo-400">
                        {{ task.triggerConfig.scheduledAt.type === 'once' ? '1회' : '반복' }}:
                        {{
                            task.triggerConfig.scheduledAt.datetime
                                ? new Date(task.triggerConfig.scheduledAt.datetime).toLocaleString(
                                      'ko-KR'
                                  )
                                : task.triggerConfig.scheduledAt.cron
                        }}
                    </p>
                </div>
            </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-between text-xs">
            <!-- Left side: Assignee, AI Provider -->
            <div class="flex items-center gap-2">
                <!-- Assignee Avatar -->
                <div
                    v-if="showAssignee && task.assigneeId"
                    class="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold"
                    :title="`Assigned to user ${task.assigneeId}`"
                >
                    {{ task.assigneeId }}
                </div>

                <!-- AI Provider Badge -->
                <span
                    v-if="task.aiProvider"
                    :class="['px-2 py-0.5 rounded text-xs font-medium', aiProviderColor]"
                >
                    {{ task.aiProvider }}
                </span>
            </div>

            <!-- Estimated Duration -->
            <div
                v-if="task.estimatedMinutes"
                class="flex items-center gap-1 text-gray-500 dark:text-gray-400 mr-auto ml-2"
                title="예상 소요 시간"
            >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
                {{ Math.floor(task.estimatedMinutes / 60) }}h {{ task.estimatedMinutes % 60 }}m
            </div>

            <!-- Right side: Due Date -->
            <div v-if="showDueDate && task.dueDate" class="flex items-center gap-1">
                <svg
                    class="w-3 h-3"
                    :class="isOverdue ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'"
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
                <span
                    :class="
                        isOverdue
                            ? 'text-red-500 font-semibold'
                            : 'text-gray-500 dark:text-gray-400'
                    "
                >
                    {{ dueDateFormatted }}
                </span>
            </div>
        </div>

        <!-- Action Buttons - Status specific -->
        <div class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-2">
            <!-- Preview Prompt Button - Shows warning if execution settings missing for TODO tasks -->
            <button
                :class="[
                    'flex-1 min-w-[80px] px-2 py-1.5 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1',
                    task.status === 'todo' && isMissingExecutionSettings
                        ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800/50 border border-amber-400 dark:border-amber-600'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
                ]"
                @click="handlePreviewPrompt"
                :title="
                    task.status === 'todo' && isMissingExecutionSettings
                        ? `설정 필요: ${missingSettings.join(', ')}`
                        : '프롬프트 미리보기'
                "
            >
                <svg
                    v-if="task.status === 'todo' && isMissingExecutionSettings"
                    class="w-3.5 h-3.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                >
                    <path
                        fill-rule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clip-rule="evenodd"
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
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                    />
                </svg>
                {{
                    task.status === 'todo' && isMissingExecutionSettings ? '설정 필요' : '프롬프트'
                }}
            </button>

            <!-- Subdivide Button - Available for 1st level tasks only -->
            <button
                v-if="showSubdivideButton"
                class="flex-1 min-w-[80px] px-2 py-1.5 text-xs font-medium rounded bg-teal-500 text-white hover:bg-teal-600 transition-colors flex items-center justify-center gap-1"
                @click="handleSubdivide"
                title="테스크를 서브테스크로 세분화"
            >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                    />
                </svg>
                세분화
            </button>

            <!-- Missing Provider Connect Button - 실행 버튼 대신 표시 -->
            <template v-if="hasMissingProvider && task.status === 'todo'">
                <button
                    class="flex-1 min-w-[80px] px-2 py-1.5 text-xs font-medium rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors flex items-center justify-center gap-1"
                    @click="handleConnectProvider"
                    :title="`${missingProvider?.name} 연동하기`"
                >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                        />
                    </svg>
                    {{ missingProvider?.name }} 연동하기
                </button>
            </template>

            <!-- TODO Status Buttons -->
            <template v-if="showExecuteButton">
                <button
                    class="flex-1 min-w-[80px] px-2 py-1.5 text-xs font-medium rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors flex items-center justify-center gap-1"
                    @click="handleExecute"
                    title="태스크 실행"
                >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                        />
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    실행
                </button>
            </template>

            <template v-if="showEnhancePromptButton">
                <button
                    class="flex-1 min-w-[80px] px-2 py-1.5 text-xs font-medium rounded bg-purple-500 text-white hover:bg-purple-600 transition-colors flex items-center justify-center gap-1"
                    @click="handleEnhancePrompt"
                    title="AI로 프롬프트 고도화"
                >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                    </svg>
                    고도화
                </button>
            </template>

            <!-- IN_CONFIRM Status Buttons - 승인 대기 -->
            <template v-if="showApprovalButton">
                <button
                    class="flex-1 min-w-[80px] px-2 py-1.5 text-xs font-medium rounded bg-orange-500 text-white hover:bg-orange-600 transition-colors flex items-center justify-center gap-1 animate-pulse"
                    @click="handleOpenApproval"
                    title="승인 요청 확인"
                >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    승인하기
                </button>
            </template>

            <!-- IN_REVIEW Status Buttons -->
            <template v-if="showPreviewResultButton">
                <button
                    :class="[
                        'flex-1 min-w-[80px] px-2 py-1.5 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1',
                        task.reviewFailed
                            ? 'bg-amber-600 text-white hover:bg-amber-700'
                            : 'bg-slate-600 text-white hover:bg-slate-700',
                    ]"
                    @click="handlePreviewResult"
                    :title="task.reviewFailed ? '검토 실패 - 결과물 확인' : '결과물 미리보기'"
                >
                    <svg
                        v-if="task.reviewFailed"
                        class="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
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
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                    </svg>
                    {{ task.reviewFailed ? '결과보기(실패)' : '결과보기' }}
                </button>
            </template>

            <template v-if="showRetryButton">
                <div class="flex gap-2 w-full">
                    <button
                        class="flex-1 min-w-[80px] px-2 py-1.5 text-xs font-medium rounded bg-orange-500 text-white hover:bg-orange-600 transition-colors flex items-center justify-center gap-1"
                        @click="handleRetry"
                        title="수정사항 반영하여 재실행"
                    >
                        <svg
                            class="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                        재시도
                    </button>
                    <button
                        class="flex-1 min-w-[80px] px-2 py-1.5 text-xs font-medium rounded bg-green-500 text-white hover:bg-green-600 transition-colors flex items-center justify-center gap-1"
                        @click="emit('approve', task)"
                        title="검토 승인"
                    >
                        <svg
                            class="w-3.5 h-3.5"
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
            </template>

            <!-- IN_PROGRESS Status Buttons -->
            <template v-if="showProgressButton">
                <button
                    class="flex-1 min-w-[80px] px-2 py-1.5 text-xs font-medium rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors flex items-center justify-center gap-1"
                    :class="{ 'animate-pulse': !task.isPaused }"
                    @click="handleViewProgress"
                    title="실시간 진행상황 보기"
                >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                    </svg>
                    {{ task.isPaused ? '일시정지됨' : '진행중' }}
                </button>

                <!-- 중지 버튼 (TODO로 복귀) -->
                <button
                    class="flex-1 min-w-[80px] px-2 py-1.5 text-xs font-medium rounded bg-red-500 text-white hover:bg-red-600 transition-colors flex items-center justify-center gap-1"
                    @click="handleStop"
                    title="작업 중지 (TODO로 복귀)"
                >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                        />
                    </svg>
                    중지
                </button>
            </template>

            <!-- DONE Status Buttons -->
            <template v-if="showHistoryButton">
                <button
                    class="flex-1 min-w-[80px] px-2 py-1.5 text-xs font-medium rounded bg-indigo-500 text-white hover:bg-indigo-600 transition-colors flex items-center justify-center gap-1"
                    @click="handleViewHistory"
                    title="완료 히스토리 보기"
                >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    히스토리
                </button>
            </template>
        </div>

        <!-- Subtask Section (그룹 테스크인 경우만 표시) -->
        <div
            v-if="task.isSubdivided && subtasks.length > 0"
            class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700"
        >
            <!-- Subtask Progress Bar -->
            <div class="mb-3">
                <div
                    class="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1"
                >
                    <span class="font-medium">서브테스크 진행률</span>
                    <span
                        >{{ subtaskStats.done }}/{{ subtaskStats.total }} ({{
                            subtaskProgress
                        }}%)</span
                    >
                </div>
                <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                        class="h-full bg-gradient-to-r from-blue-500 to-teal-500 transition-all duration-300"
                        :style="{ width: `${subtaskProgress}%` }"
                    />
                </div>
                <div
                    class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-500 mt-1"
                >
                    <span>진행중: {{ subtaskStats.inProgress }}</span>
                    <span>대기: {{ subtaskStats.todo }}</span>
                </div>
            </div>

            <!-- Expand/Collapse Button -->
            <button
                class="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                @click="toggleExpand"
            >
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    서브테스크 {{ isExpanded ? '숨기기' : '보기' }}
                </span>
                <svg
                    class="w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform"
                    :class="{ 'rotate-180': isExpanded }"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 9l-7 7-7-7"
                    />
                </svg>
            </button>

            <!-- Collapsed State: Subtask Titles Preview -->
            <div v-if="!isExpanded" class="mt-2 space-y-1">
                <div
                    v-for="subtask in subtasks.slice(0, 3)"
                    :key="subtask.id"
                    class="flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-700/30 rounded text-xs"
                >
                    <!-- Status Icon -->
                    <div class="flex-shrink-0">
                        <svg
                            v-if="subtask.status === 'done'"
                            class="w-4 h-4 text-green-500"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clip-rule="evenodd"
                            />
                        </svg>
                        <svg
                            v-else-if="subtask.status === 'in_progress'"
                            class="w-4 h-4 text-blue-500 animate-spin"
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
                            class="w-4 h-4 text-gray-400"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z"
                                clip-rule="evenodd"
                            />
                        </svg>
                    </div>

                    <!-- Subtask Title -->
                    <span class="flex-1 truncate text-gray-700 dark:text-gray-300">
                        {{ subtask.title }}
                    </span>

                    <!-- Subtask ID -->
                    <span class="text-gray-500 dark:text-gray-500">#{{ subtask.id }}</span>
                </div>

                <!-- Show More Indicator -->
                <div
                    v-if="subtasks.length > 3"
                    class="text-xs text-center text-gray-500 dark:text-gray-400 py-1"
                >
                    +{{ subtasks.length - 3 }}개 더보기
                </div>
            </div>

            <!-- Expanded State: Full Subtask Details -->
            <div v-else class="mt-2 space-y-2">
                <div
                    v-for="subtask in subtasks"
                    :key="subtask.id"
                    class="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 transition-colors cursor-pointer"
                    @click="emit('click', subtask)"
                >
                    <!-- Subtask Header -->
                    <div class="flex items-start justify-between gap-2 mb-2">
                        <div class="flex items-start gap-2 flex-1">
                            <!-- Status Icon -->
                            <div class="flex-shrink-0 mt-0.5">
                                <svg
                                    v-if="subtask.status === 'done'"
                                    class="w-5 h-5 text-green-500"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    <path
                                        fill-rule="evenodd"
                                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                        clip-rule="evenodd"
                                    />
                                </svg>
                                <svg
                                    v-else-if="subtask.status === 'in_progress'"
                                    class="w-5 h-5 text-blue-500 animate-spin"
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
                                    v-else-if="subtask.status === 'in_review'"
                                    class="w-5 h-5 text-yellow-500"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    <path
                                        fill-rule="evenodd"
                                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                        clip-rule="evenodd"
                                    />
                                </svg>
                                <svg
                                    v-else
                                    class="w-5 h-5 text-gray-400"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    <path
                                        fill-rule="evenodd"
                                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z"
                                        clip-rule="evenodd"
                                    />
                                </svg>
                            </div>

                            <!-- Title and Description -->
                            <div class="flex-1 min-w-0">
                                <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-1">
                                    {{ subtask.title }}
                                </h4>
                                <p
                                    v-if="subtask.description"
                                    class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2"
                                >
                                    {{ subtask.description }}
                                </p>
                            </div>
                        </div>

                        <!-- Subtask ID -->
                        <span class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                            #{{ subtask.id }}
                        </span>
                    </div>

                    <!-- Subtask Footer -->
                    <div class="flex items-center justify-between text-xs">
                        <div class="flex items-center gap-2">
                            <!-- Priority Badge -->
                            <span
                                v-if="subtask.priority"
                                :class="[
                                    'px-2 py-0.5 rounded-full text-xs font-medium',
                                    subtask.priority === 'urgent'
                                        ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                        : subtask.priority === 'high'
                                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                                          : subtask.priority === 'medium'
                                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
                                ]"
                            >
                                {{ subtask.priority }}
                            </span>

                            <!-- Estimated Time -->
                            <span
                                v-if="subtask.estimatedMinutes"
                                class="text-gray-600 dark:text-gray-400"
                            >
                                {{ Math.floor(subtask.estimatedMinutes / 60) }}h
                                {{ subtask.estimatedMinutes % 60 }}m
                            </span>
                        </div>

                        <!-- Status Badge -->
                        <span
                            :class="[
                                'px-2 py-0.5 rounded-full text-xs font-medium',
                                subtask.status === 'done'
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                    : subtask.status === 'in_progress'
                                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                                      : subtask.status === 'in_review'
                                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                                        : subtask.status === 'blocked'
                                          ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                          : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
                            ]"
                        >
                            {{
                                subtask.status === 'todo'
                                    ? '대기'
                                    : subtask.status === 'in_progress'
                                      ? '진행중'
                                      : subtask.status === 'in_review'
                                        ? '검토중'
                                        : subtask.status === 'done'
                                          ? '완료'
                                          : subtask.status === 'blocked'
                                            ? '차단됨'
                                            : subtask.status
                            }}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Action Buttons -->
        <div
            class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1"
        >
            <!-- Edit Button -->
            <button
                class="w-7 h-7 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 flex items-center justify-center transition-colors"
                @click.stop="emit('edit', task)"
                title="Edit Task"
            >
                <svg
                    class="w-4 h-4 text-blue-600 dark:text-blue-400"
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
            </button>
            <!-- Delete Button -->
            <button
                class="w-7 h-7 rounded hover:bg-red-100 dark:hover:bg-red-900/50 flex items-center justify-center transition-colors"
                @click.stop="handleDelete"
                title="Delete Task"
            >
                <svg
                    class="w-4 h-4 text-red-600 dark:text-red-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                </svg>
            </button>
        </div>
    </div>
</template>

<style scoped>
.line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.group:hover .group-hover\:opacity-100 {
    opacity: 1;
}
</style>
