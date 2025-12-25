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
    (e: 'operatorDrop', taskId: number, operatorId: number): void; // Operator 할당
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
    <component
        :is="cardComponent"
        v-bind="props"
        @click="
            (t: Task) => {
                console.log('[TaskCard] Click event received for task:', t.id, t.title, t.taskType);
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
        @operatorDrop="(tid: number, oid: number) => emit('operatorDrop', tid, oid)"
        @provideInput="(t: Task) => emit('provideInput', t)"
        @approve="
            (t: Task) => {
                emit('approve', t);
            }
        "
        :hide-connection-handles="props.hideConnectionHandles"
    />
</template>
