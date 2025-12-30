<script setup lang="ts">
import { computed } from 'vue';
import type { Task } from '@core/types/database';
import AiTaskCard from './cards/AiTaskCard.vue';
import InputTaskCard from './cards/InputTaskCard.vue';
import ScriptTaskCard from './cards/ScriptTaskCard.vue';
import OutputTaskCard from './cards/OutputTaskCard.vue';

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
    hideMetadata?: boolean; // Hide metadata section in DAG view
    hidePrompt?: boolean; // Hide prompt/script content in DAG view
    hideExtraActions?: boolean; // Hide extra action buttons in DAG view
    hidePromptActions?: boolean; // 프롬프트/세분화/스크립트 관련 버튼만 숨김 (NEW)
    showAssignee?: boolean;
    showDueDate?: boolean;
    showPriority?: boolean;
    showTags?: boolean;
    missingProvider?: MissingProviderInfo | null; // 미연동 Provider 정보
    hideConnectionHandles?: boolean; // Hide connection handles (for DAG view)
    hideTypeIndicator?: boolean; // Hide type indicator badge
}

const props = withDefaults(defineProps<Props>(), {
    subtasks: () => [],
    isDragging: false,
    showAssignee: true,
    showDueDate: true,
    showPriority: true,
    showTags: true,
    missingProvider: null,
    hidePromptActions: false,
    hideConnectionHandles: false,
    hideTypeIndicator: false,
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
    (e: 'connectionCancel'): void; // 연결 취소
    (e: 'connectProvider', providerId: string): void; // Provider 연동
    (e: 'operatorDrop', projectId: number, sequence: number, operatorId: number): void; // Operator 할당
    (e: 'provideInput', task: Task): void; // 입력 제공
    (e: 'approve', task: Task): void; // 승인
}>();

const cardComponent = computed(() => {
    switch (props.task.taskType) {
        case 'input':
            return InputTaskCard;
        case 'script':
            return ScriptTaskCard;
        case 'output':
            return OutputTaskCard;
        default:
            return AiTaskCard;
    }
});
</script>

<template>
    <div class="task-card-container relative group/card">
        <!-- Type Indicator Badge -->
        <div
            v-if="!hideTypeIndicator"
            class="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full flex items-center justify-center shadow-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
            :title="task.taskType || 'AI'"
        >
            <!-- AI Task -->
            <svg
                v-if="task.taskType === 'ai' || !task.taskType"
                class="w-3.5 h-3.5 text-purple-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                />
            </svg>
            <!-- Script Task -->
            <svg
                v-else-if="task.taskType === 'script'"
                class="w-3.5 h-3.5 text-emerald-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
            </svg>
            <!-- Input Task -->
            <svg
                v-else-if="task.taskType === 'input'"
                class="w-3.5 h-3.5 text-blue-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
            </svg>
            <!-- Output Task -->
            <svg
                v-else-if="task.taskType === 'output'"
                class="w-3.5 h-3.5 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
            </svg>
        </div>

        <component
            :is="cardComponent"
            v-bind="props"
            @click="
                (t: Task) => {
                    console.log(
                        '[TaskCard] Click event received for task:',
                        t.projectSequence,
                        t.title,
                        t.taskType
                    );
                    emit('click', t);
                }
            "
            @previewStream="(t: Task) => emit('previewStream', t)"
            @edit="(t: Task) => emit('edit', t)"
            @delete="(t: Task) => emit('delete', t)"
            @execute="(t: Task) => emit('execute', t)"
            @enhancePrompt="(t: Task) => emit('enhancePrompt', t)"
            @previewPrompt="(t: Task) => emit('previewPrompt', t)"
            @previewResult="(t: Task) => emit('previewResult', t)"
            @retry="(t: Task) => emit('retry', t)"
            @viewHistory="(t: Task) => emit('viewHistory', t)"
            @viewProgress="(t: Task) => emit('viewProgress', t)"
            @pause="(t: Task) => emit('pause', t)"
            @resume="(t: Task) => emit('resume', t)"
            @stop="(t: Task) => emit('stop', t)"
            @subdivide="(t: Task) => emit('subdivide', t)"
            @openApproval="(t: Task) => emit('openApproval', t)"
            @connectionStart="(t: Task, e: DragEvent) => emit('connectionStart', t, e)"
            @connectionEnd="(t: Task) => emit('connectionEnd', t)"
            @connectionCancel="emit('connectionCancel')"
            @connectProvider="(id: string) => emit('connectProvider', id)"
            @operatorDrop="
                (pid: number, seq: number, oid: number) => emit('operatorDrop', pid, seq, oid)
            "
            @provideInput="(t: Task) => emit('provideInput', t)"
            @approve="
                (t: Task) => {
                    emit('approve', t);
                }
            "
            :hide-connection-handles="props.hideConnectionHandles"
        />
    </div>
</template>
