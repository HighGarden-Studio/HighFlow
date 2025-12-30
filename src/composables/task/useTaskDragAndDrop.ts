import { ref } from 'vue';
import type { Task } from '@core/types/database';

export function useTaskDragAndDrop(
    props: { task: Task },
    emit: (event: string, ...args: any[]) => void
) {
    const isConnectionDragging = ref(false);
    const isConnectionTarget = ref(false);
    const isOperatorDragOver = ref(false);
    const isHovered = ref(false);
    const connectionDropSuccessful = ref(false);

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
                    sourceProjectId: props.task.projectId,
                    sourceTaskSequence: props.task.projectSequence,
                    sourceTaskTitle: props.task.title,
                })
            );
        }

        connectionDropSuccessful.value = false; // Reset flag
        emit('connectionStart', props.task, event);
    }

    function handleConnectionDragEnd() {
        isConnectionDragging.value = false;
        // Only emit cancel if drop didn't succeed
        if (!connectionDropSuccessful.value) {
            emit('connectionCancel');
        }
        connectionDropSuccessful.value = false; // Reset for next drag
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
                    if (
                        parsed.sourceProjectId === props.task.projectId &&
                        parsed.sourceTaskSequence === props.task.projectSequence
                    ) {
                        // Same task, do not allow drop
                    } else {
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
                connectionDropSuccessful.value = true; // Mark as successful
                emit('connectionEnd', props.task);
            } catch {
                console.error('Failed to parse connection data');
            }
        }
    }

    function handleOperatorDragOver(event: DragEvent) {
        // Check if this is an operator drag
        const types = event.dataTransfer?.types || [];

        // Prevent operator assignment for input and script tasks
        if (props.task.taskType === 'input' || props.task.taskType === 'script') {
            return;
        }

        if (types.includes('application/x-operator')) {
            event.preventDefault();
            isOperatorDragOver.value = true;
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'copy';
            }
        }
    }

    function handleOperatorDragLeave(event: DragEvent) {
        // Only clear operator drag state if we're leaving the card entirely
        const relatedTarget = event.relatedTarget as HTMLElement;
        if (!relatedTarget || !(event.currentTarget as HTMLElement)?.contains(relatedTarget)) {
            isOperatorDragOver.value = false;
        }
    }

    function handleOperatorDrop(event: DragEvent) {
        const operatorData = event.dataTransfer?.getData('application/x-operator');

        // Prevent operator assignment for input and script tasks
        if (props.task.taskType === 'input' || props.task.taskType === 'script') {
            return;
        }

        if (operatorData) {
            try {
                const operator = JSON.parse(operatorData);
                emit('operatorDrop', props.task.projectId, props.task.projectSequence, operator.id);
            } catch (error) {
                console.error('Failed to parse operator data:', error);
            }
        }

        isOperatorDragOver.value = false;
        event.stopPropagation();
        event.preventDefault();
    }

    return {
        isConnectionDragging,
        isConnectionTarget,
        isOperatorDragOver,
        isHovered,
        handleConnectionDragStart,
        handleConnectionDragEnd,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        handleOperatorDragOver,
        handleOperatorDragLeave,
        handleOperatorDrop,
    };
}
