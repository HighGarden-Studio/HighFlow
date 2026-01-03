<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import type { Task } from '@core/types/database';
import BaseTaskCard from './BaseTaskCard.vue';
import IconRenderer from '../../common/IconRenderer.vue';
import { useTaskStatus } from '../../../composables/task/useTaskStatus';
import { useTaskStore } from '../../../renderer/stores/taskStore';
import { getScriptLanguageIcon } from '../../../utils/iconMapping';

interface Props {
    task: Task;
    isDragging?: boolean;
    missingProvider?: any;
    hideConnectionHandles?: boolean;
    hidePrompt?: boolean;
    showTags?: boolean;
    hideExtraActions?: boolean;
    hidePromptActions?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    isDragging: false,
    missingProvider: null,
    hideConnectionHandles: false,
    hidePrompt: false,
    showTags: true,
    hideExtraActions: false,
    hidePromptActions: false,
});

const emit = defineEmits<{
    (e: 'click', task: Task): void;
    (e: 'connectionStart', task: Task, event: DragEvent): void;
    (e: 'connectionEnd', task: Task): void;
    (e: 'connectionCancel'): void;
    (e: 'operatorDrop', projectId: number, sequence: number, operatorId: number): void;
    (e: 'execute', task: Task): void;
    (e: 'stop', task: Task): void;
    (e: 'delete', task: Task): void;
    (e: 'previewPrompt', task: Task): void; // 스크립트 내용 보기
    (e: 'previewResult', task: Task): void; // 결과 보기
    (e: 'retry', task: Task): void; // 재실행
    (e: 'approve', task: Task): void; // 승인
    (e: 'viewHistory', task: Task): void;
}>();

const taskStore = useTaskStore();
const { isMissingExecutionSettings, outputFormatInfo } = useTaskStatus(props);

// Operator state
const assignedOperator = ref<any>(null);

// Fetch operator details
const fetchOperator = async () => {
    if (props.task.assignedOperatorId) {
        try {
            const op = await window.electron.operators.get(props.task.assignedOperatorId);
            assignedOperator.value = op;
        } catch (error) {
            console.error('Failed to fetch operator:', error);
            assignedOperator.value = null;
        }
    } else {
        assignedOperator.value = null;
    }
};

onMounted(fetchOperator);

watch(
    () => props.task.assignedOperatorId,
    () => {
        fetchOperator();
    }
);

// Script language icon
const scriptIcon = computed(() => {
    if (props.task.scriptLanguage) {
        return getScriptLanguageIcon(props.task.scriptLanguage);
    }
    return null;
});

// Dependency display helper
const dependencySequences = computed(() => {
    const taskIds = props.task.triggerConfig?.dependsOn?.taskIds;
    if (!taskIds || taskIds.length === 0) return '';
    // Find sequences for these IDs
    return taskIds
        .map((id) => {
            const t = taskStore.tasks.find((task) => task.projectSequence === id);
            return t ? `#${t.projectSequence}` : '';
        })
        .filter(Boolean)
        .join(', ');
});

function handleExecute(event: Event) {
    event.stopPropagation();
    emit('execute', props.task);
}

function handleStop(event: Event) {
    event.stopPropagation();
    emit('stop', props.task);
}

function handleViewScript(event: Event) {
    event.stopPropagation();
    emit('previewPrompt', props.task); // reuse previewPrompt event for viewing script code
}
</script>

<template>
    <BaseTaskCard
        :task="task"
        :is-dragging="isDragging"
        :missing-provider="missingProvider"
        :hide-connection-handles="hideConnectionHandles"
        @click="emit('click', task)"
        @connection-start="(t, e) => emit('connectionStart', t, e)"
        @connection-end="(t) => emit('connectionEnd', t)"
        @connection-cancel="emit('connectionCancel')"
        @operator-drop="(pid, seq, oid) => emit('operatorDrop', pid, seq, oid)"
        @delete="(t) => emit('delete', t)"
    >
        <template #header>
            <div class="flex flex-col gap-2">
                <!-- Row 1: Operator Info (If Assigned) -->
                <div
                    v-if="assignedOperator"
                    class="flex items-center gap-2 p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800"
                >
                    <!-- Avatar/Emoji -->
                    <img
                        v-if="
                            assignedOperator.avatar?.startsWith('http') ||
                            assignedOperator.avatar?.startsWith('/')
                        "
                        :src="assignedOperator.avatar"
                        class="w-6 h-6 rounded-full object-cover border border-emerald-200 dark:border-emerald-700"
                    />
                    <div
                        v-else
                        class="w-6 h-6 rounded-full bg-white dark:bg-emerald-800 border border-emerald-200 dark:border-emerald-700 flex items-center justify-center text-sm"
                    >
                        {{ assignedOperator.avatar || '👨‍💻' }}
                    </div>

                    <div class="flex flex-col min-w-0">
                        <span
                            class="text-xs font-semibold text-emerald-900 dark:text-emerald-100 truncate"
                        >
                            {{ assignedOperator.name }}
                        </span>
                        <span class="text-[10px] text-emerald-600 dark:text-emerald-300 truncate">
                            {{ assignedOperator.role || 'Script Runner' }}
                        </span>
                    </div>
                </div>

                <!-- Row 2: Script Configuration -->
                <div class="flex items-center gap-2 px-0.5">
                    <div
                        class="flex items-center justify-center w-5 h-5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                        :title="task.scriptLanguage || 'Script'"
                    >
                        <IconRenderer
                            v-if="scriptIcon"
                            :icon="scriptIcon"
                            class="w-4 h-4 text-gray-700 dark:text-gray-300"
                        />
                        <span v-else class="text-xs">⌨️</span>
                    </div>
                    <div class="flex flex-col leading-none">
                        <span
                            class="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide"
                        >
                            {{ task.scriptLanguage || 'SCRIPT' }}
                        </span>
                        <span class="text-xs font-medium text-gray-700 dark:text-gray-200">
                            {{ task.scriptRuntime || 'Default Runtime' }}
                        </span>
                    </div>
                </div>

                <!-- Row 3: Task Title & ID -->
                <div class="flex items-start justify-between gap-2 mt-1">
                    <h3
                        class="text-sm font-bold text-gray-900 dark:text-gray-100 leading-snug break-words line-clamp-2"
                    >
                        {{ task.title }}
                    </h3>
                    <div class="flex items-center gap-1">
                        <span class="text-[10px] text-gray-400 font-mono mt-0.5 whitespace-nowrap">
                            #{{ task.projectSequence }}
                        </span>
                    </div>
                </div>

                <!-- Row 4: Output Type & Tags -->
                <div class="flex items-center justify-between gap-2">
                    <!-- Output Format Badge -->
                    <div
                        v-if="outputFormatInfo"
                        class="flex items-center gap-1.5 px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                        :title="outputFormatInfo.label"
                    >
                        <span class="text-xs">{{ outputFormatInfo.icon }}</span>
                        <span class="text-[10px] font-medium text-gray-600 dark:text-gray-300">{{
                            outputFormatInfo.label
                        }}</span>
                    </div>
                    <div
                        v-else
                        class="flex items-center gap-1.5 px-2 py-1 rounded bg-gray-50 dark:bg-gray-800/50 border border-transparent"
                    >
                        <span class="text-xs">📄</span>
                        <span class="text-[10px] text-gray-400">Text</span>
                    </div>

                    <!-- Tags -->
                    <div
                        v-if="showTags && task.tags && task.tags.length > 0"
                        class="flex items-center gap-1 overflow-hidden justify-end"
                    >
                        <span
                            v-for="tag in task.tags.slice(0, 2)"
                            :key="tag"
                            class="px-1.5 py-0.5 rounded text-[10px] bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 truncate max-w-[60px]"
                        >
                            #{{ tag }}
                        </span>
                        <span v-if="task.tags.length > 2" class="text-[10px] text-gray-400 px-1">
                            +{{ task.tags.length - 2 }}
                        </span>
                    </div>
                </div>
            </div>
        </template>

        <template #default>
            <!-- Row 5: Content (Description) -->
            <div class="mt-3 mb-2">
                <p
                    v-if="!hidePrompt && task.description"
                    class="text-xs text-gray-600 dark:text-gray-300 line-clamp-2"
                >
                    {{ task.description }}
                </p>
                <p v-else class="text-xs text-gray-400 dark:text-gray-500 italic">
                    스크립트 태스크
                </p>
            </div>

            <!-- Row 6: Trigger Information -->
            <div
                v-if="task.triggerConfig"
                class="mb-3 p-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded text-xs"
            >
                <!-- Dependency Trigger -->
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
                        <p class="font-medium text-indigo-700 dark:text-indigo-300 mb-0.5">
                            자동 실행
                        </p>
                        <p class="text-[10px] text-indigo-600 dark:text-indigo-400 leading-tight">
                            {{
                                dependencySequences ? `Task ${dependencySequences}` : '이전 태스크'
                            }}
                            {{
                                task.triggerConfig.dependsOn.operator === 'all'
                                    ? '모두'
                                    : '하나라도'
                            }}
                            완료 시
                        </p>
                    </div>
                </div>

                <!-- Schedule Trigger -->
                <div v-if="task.triggerConfig.scheduledAt" class="flex items-start gap-2 mt-1.5">
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
                        <p class="font-medium text-indigo-700 dark:text-indigo-300 mb-0.5">
                            예약 실행
                        </p>
                        <p class="text-[10px] text-indigo-600 dark:text-indigo-400 leading-tight">
                            {{ task.triggerConfig.scheduledAt.type === 'once' ? '1회' : '반복' }}:
                            {{
                                task.triggerConfig.scheduledAt.datetime
                                    ? new Date(
                                          task.triggerConfig.scheduledAt.datetime
                                      ).toLocaleString('ko-KR', {
                                          month: 'numeric',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                      })
                                    : task.triggerConfig.scheduledAt.cron
                            }}
                        </p>
                    </div>
                </div>
            </div>

            <!-- Control Flow Info (If present) -->
            <div
                v-if="(task as any).executionResult?.control && task.status === 'done'"
                class="mb-3 p-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded text-xs"
            >
                <div class="flex items-start gap-2">
                    <svg
                        class="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    <div class="flex-1">
                        <p class="font-medium text-emerald-700 dark:text-emerald-300 mb-0.5">
                            제어 흐름
                        </p>
                        <p
                            v-if="
                                (task as any).executionResult.control.next &&
                                (task as any).executionResult.control.next.length > 0
                            "
                            class="text-[10px] text-emerald-600 dark:text-emerald-400 leading-tight"
                        >
                            → Task #{{ (task as any).executionResult.control.next.join(', #') }}
                            <span
                                v-if="(task as any).executionResult.control.reason"
                                class="block mt-0.5 text-emerald-500 dark:text-emerald-300"
                            >
                                {{ (task as any).executionResult.control.reason }}
                            </span>
                        </p>
                        <p
                            v-else
                            class="text-[10px] text-emerald-600 dark:text-emerald-400 leading-tight"
                        >
                            🛑 워크플로우 종료
                            <span
                                v-if="(task as any).executionResult.control.reason"
                                class="block mt-0.5 text-emerald-500 dark:text-emerald-300"
                            >
                                {{ (task as any).executionResult.control.reason }}
                            </span>
                        </p>
                    </div>
                </div>
            </div>
        </template>

        <template #footer>
            <!-- Row 7: Actions -->
            <div
                v-if="!hideExtraActions"
                class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-1.5"
            >
                <!-- TODO: View Script / Execute -->
                <template v-if="task.status === 'todo'">
                    <button
                        v-if="!props.hidePromptActions"
                        class="flex-1 px-2 py-1.5 text-xs font-medium rounded transition-colors flex items-center justify-center gap-1 border"
                        :class="
                            isMissingExecutionSettings
                                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                        "
                        @click="handleViewScript"
                    >
                        {{ isMissingExecutionSettings ? '스크립트 없음' : '스크립트' }}
                    </button>
                    <button
                        v-if="!task.triggerConfig?.dependsOn"
                        class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center gap-1 shadow-sm"
                        @click="handleExecute"
                    >
                        실행
                    </button>
                </template>

                <!-- IN_PROGRESS: Logging / Stop -->
                <template v-if="task.status === 'in_progress'">
                    <button
                        class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center gap-1 animate-pulse shadow-sm"
                    >
                        실행중...
                    </button>
                    <button
                        class="px-3 py-1.5 text-xs font-medium rounded bg-white dark:bg-gray-800 text-red-600 border border-red-200 dark:border-red-900 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center"
                        @click="handleStop"
                    >
                        중지
                    </button>
                </template>

                <!-- IN_REVIEW: Result / Retry / Approve -->
                <template v-if="task.status === 'in_review'">
                    <div class="w-full flex gap-1.5">
                        <button
                            class="flex-1 px-2 py-1.5 text-xs font-medium rounded flex items-center justify-center gap-1 border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700"
                            @click="
                                (e) => {
                                    e.stopPropagation();
                                    emit('previewResult', task);
                                }
                            "
                        >
                            결과 확인
                        </button>
                        <button
                            class="px-2 py-1.5 text-xs font-medium rounded bg-white dark:bg-gray-800 text-orange-600 border border-orange-200 hover:bg-orange-50"
                            @click="
                                (e) => {
                                    e.stopPropagation();
                                    emit('retry', task);
                                }
                            "
                            title="다시 실행"
                        >
                            재시도
                        </button>
                        <button
                            class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 flex items-center justify-center gap-1 shadow-sm"
                            @click.stop="
                                () => {
                                    console.log(
                                        '🟢 [ScriptTaskCard] Approve button clicked',
                                        task.id
                                    );
                                    emit('approve', task);
                                }
                            "
                        >
                            승인
                        </button>
                    </div>
                </template>

                <!-- DONE: History -->
                <template v-if="task.status === 'done' || task.status === 'blocked'">
                    <button
                        v-if="task.status === 'done'"
                        class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-slate-600 text-white hover:bg-slate-700 flex items-center justify-center gap-1 shadow-sm"
                        @click="
                            (e) => {
                                e.stopPropagation();
                                emit('previewResult', task);
                            }
                        "
                    >
                        결과보기
                    </button>
                    <!-- Show retry button if task has no auto-execute dependencies -->
                    <button
                        v-if="task.status === 'done' && !task.triggerConfig?.dependsOn"
                        class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center justify-center gap-1 shadow-sm"
                        @click="
                            (e) => {
                                e.stopPropagation();
                                emit('retry', task);
                            }
                        "
                    >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                        </svg>
                        재실행
                    </button>
                    <button
                        class="flex-1 px-2 py-1.5 text-xs font-medium rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50"
                        @click="
                            (e) => {
                                e.stopPropagation();
                                emit('viewHistory', task);
                            }
                        "
                    >
                        히스토리
                    </button>
                </template>
            </div>
        </template>
    </BaseTaskCard>
</template>
