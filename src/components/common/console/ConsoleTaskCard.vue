<template>
    <div
        class="console-task-card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded shadow-sm overflow-hidden mb-2 transition-all duration-200"
        :class="{ 'ring-1 ring-primary-500 ring-opacity-50': execution.status === 'running' }"
    >
        <!-- Header -->
        <div
            class="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between"
        >
            <div class="flex items-center gap-2">
                <div
                    class="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0"
                    :class="statusColorClass"
                >
                    {{ execution.projectSequence }}
                </div>
                <h3
                    class="font-medium text-xs text-slate-700 dark:text-slate-200 truncate max-w-[200px]"
                >
                    {{ execution.title }}
                </h3>
            </div>

            <div class="flex items-center gap-3 text-[10px]">
                <!-- Status Badge -->
                <span
                    :class="statusTextClass"
                    class="font-semibold uppercase flex items-center gap-1"
                >
                    <span v-if="execution.status === 'running'" class="animate-spin text-[10px]"
                        >⟳</span
                    >
                    {{ execution.status }}
                </span>

                <!-- Timer / Duration -->
                <span class="text-slate-400 dark:text-slate-500 font-mono">
                    {{ durationDisplay }}
                </span>
            </div>
        </div>

        <!-- Body / Transcript -->
        <div class="p-2 space-y-2 overflow-y-auto custom-scrollbar">
            <!-- Show task result fallback if no meaningful transcript events -->
            <template v-if="filteredEvents.length > 0">
                <div v-for="event in filteredEvents" :key="event.id" class="transcript-item">
                    <!-- User / Input Value -->
                    <div
                        v-if="event.type === 'user'"
                        class="bg-blue-50 dark:bg-blue-900/20 p-2.5 rounded-lg text-xs border border-blue-200 dark:border-blue-800"
                    >
                        <span
                            class="text-[10px] font-bold text-blue-600 dark:text-blue-400 block mb-1 uppercase tracking-wide"
                            >📥 Input</span
                        >
                        <div
                            class="text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed select-text font-mono text-[11px]"
                        >
                            {{ event.content }}
                        </div>
                    </div>

                    <!-- Assistant / AI Response -->
                    <div
                        v-else-if="event.type === 'assistant'"
                        class="bg-purple-50 dark:bg-purple-900/10 p-2.5 rounded-lg border border-purple-200 dark:border-purple-800"
                    >
                        <span
                            class="text-[10px] font-bold text-purple-600 dark:text-purple-400 block mb-1 uppercase tracking-wide"
                            >🤖 AI Response</span
                        >
                        <div
                            class="prose prose-sm dark:prose-invert max-w-none text-slate-800 dark:text-slate-100 select-text markdown-content"
                        >
                            <MarkdownRenderer :content="event.content" />
                        </div>
                    </div>

                    <!-- Tool Use -->
                    <div
                        v-else-if="event.type === 'tool_use'"
                        class="bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden"
                    >
                        <div
                            class="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-[10px] font-mono flex items-center gap-2 text-slate-500 dark:text-slate-400"
                        >
                            <span>🔧 {{ event.toolName || event.metadata?.tool || 'Tool' }}</span>
                        </div>
                        <div
                            class="p-2 font-mono text-[10px] overflow-x-auto text-slate-600 dark:text-slate-300 whitespace-pre max-h-24 overflow-y-auto"
                        >
                            {{ event.input || event.content }}
                        </div>
                    </div>

                    <!-- Tool / Script Result -->
                    <div
                        v-else-if="event.type === 'tool_result'"
                        class="bg-emerald-50 dark:bg-emerald-900/10 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800"
                    >
                        <span
                            class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block mb-1 uppercase tracking-wide"
                            >📤 Script Result</span
                        >
                        <div
                            class="text-[11px] font-mono text-emerald-700 dark:text-emerald-200 max-h-40 overflow-y-auto whitespace-pre-wrap leading-tight"
                        >
                            {{ event.output || event.content }}
                        </div>
                    </div>

                    <!-- Thought / Reasoning -->
                    <div
                        v-else-if="event.type === 'thought'"
                        class="bg-amber-50 dark:bg-amber-900/10 p-2 rounded border border-amber-200 dark:border-amber-800 text-[10px] italic text-amber-700 dark:text-amber-300"
                    >
                        💭 {{ event.content }}
                    </div>

                    <!-- Errors -->
                    <div
                        v-else-if="event.type === 'error'"
                        class="bg-red-50 dark:bg-red-900/20 p-2.5 rounded-lg text-red-700 dark:text-red-300 text-xs border border-red-200 dark:border-red-800"
                    >
                        <strong class="block text-[10px] mb-1 uppercase">❌ Error</strong>
                        {{ event.content }}
                    </div>
                </div>
            </template>

            <!-- Fallback: Display taskResult directly if no transcript events -->
            <template v-else-if="execution.taskResult">
                <!-- Input Task -->
                <div
                    v-if="execution.taskType === 'input' && execution.taskResult.inputValue"
                    class="bg-blue-50 dark:bg-blue-900/20 p-2.5 rounded-lg border border-blue-200 dark:border-blue-800"
                >
                    <span
                        class="text-[10px] font-bold text-blue-600 dark:text-blue-400 block mb-1 uppercase tracking-wide"
                        >📥 Input Value</span
                    >
                    <div
                        class="text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed select-text font-mono text-[11px]"
                    >
                        {{ execution.taskResult.inputValue }}
                    </div>
                </div>

                <!-- Output Task -->
                <div
                    v-else-if="execution.taskType === 'output'"
                    class="bg-green-50 dark:bg-green-900/20 p-2.5 rounded-lg border border-green-200 dark:border-green-800"
                >
                    <span
                        class="text-[10px] font-bold text-green-600 dark:text-green-400 block mb-1 uppercase tracking-wide"
                        >✅ Output Saved</span
                    >
                    <div class="text-slate-700 dark:text-slate-200 text-xs">
                        {{ execution.taskResult.outputSummary || 'Output saved successfully' }}
                    </div>
                    <!-- Show the saved content preview if available -->
                    <div
                        v-if="execution.taskResult.savedContent"
                        class="mt-2 p-2 bg-green-100/50 dark:bg-green-900/30 rounded text-[11px] font-mono text-slate-600 dark:text-slate-300 whitespace-pre-wrap max-h-32 overflow-y-auto"
                    >
                        {{ execution.taskResult.savedContent }}
                    </div>
                </div>

                <!-- Script Task -->
                <div
                    v-else-if="execution.taskType === 'script' && execution.taskResult.returnValue"
                    class="bg-emerald-50 dark:bg-emerald-900/10 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800"
                >
                    <span
                        class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 block mb-1 uppercase tracking-wide"
                        >📤 Return Value</span
                    >
                    <div
                        class="text-[11px] font-mono text-emerald-700 dark:text-emerald-200 max-h-40 overflow-y-auto whitespace-pre-wrap leading-tight"
                    >
                        {{ execution.taskResult.returnValue }}
                    </div>
                </div>

                <!-- AI Task -->
                <div
                    v-else-if="execution.taskResult.content"
                    class="bg-purple-50 dark:bg-purple-900/10 p-2.5 rounded-lg border border-purple-200 dark:border-purple-800"
                >
                    <span
                        class="text-[10px] font-bold text-purple-600 dark:text-purple-400 block mb-1 uppercase tracking-wide"
                        >🤖 AI Response</span
                    >
                    <div
                        class="prose prose-sm dark:prose-invert max-w-none text-slate-800 dark:text-slate-100 select-text markdown-content"
                    >
                        <MarkdownRenderer :content="execution.taskResult.content" />
                    </div>
                </div>
            </template>

            <!-- Loading/Processing state -->
            <div v-else class="text-center py-4 text-slate-400 text-xs italic opacity-60">
                {{ execution.status === 'running' ? 'Processing...' : 'No output' }}
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { ExecutionContext } from '../../../renderer/stores/consoleStore';
import MarkdownRenderer from '../../common/MarkdownRenderer.vue'; // Assuming we have one, or generic html

const props = defineProps<{
    execution: ExecutionContext;
}>();

// Timer
const now = ref(new Date());
let interval: ReturnType<typeof setInterval>;

onMounted(() => {
    if (props.execution.status === 'running') {
        interval = setInterval(() => {
            now.value = new Date();
        }, 1000);
    }
});

onUnmounted(() => {
    if (interval) clearInterval(interval);
});

// Filter out system events (Execution started/completed messages)
const filteredEvents = computed(() => {
    return props.execution.transcript.filter((event) => {
        // Keep all non-system events
        if (event.type !== 'system') return true;
        // Filter out generic execution messages
        const content = event.content || '';
        if (content.includes('Execution started') || content.includes('Execution completed')) {
            return false;
        }
        return true;
    });
});

const durationDisplay = computed(() => {
    const start = new Date(props.execution.startTime).getTime();
    const end = props.execution.endTime
        ? new Date(props.execution.endTime).getTime()
        : now.value.getTime();

    // If not started yet?
    if (!props.execution.startTime) return '0s';

    const diff = Math.max(0, Math.floor((end - start) / 1000));

    if (diff < 60) return `${diff}s`;
    const mins = Math.floor(diff / 60);
    const secs = diff % 60;
    return `${mins}m ${secs}s`;
});

const statusColorClass = computed(() => {
    switch (props.execution.status) {
        case 'running':
            return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
        case 'success':
            return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
        case 'failed':
            return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
        default:
            return 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400';
    }
});

const statusTextClass = computed(() => {
    switch (props.execution.status) {
        case 'running':
            return 'text-blue-600 dark:text-blue-400';
        case 'success':
            return 'text-green-600 dark:text-green-400';
        case 'failed':
            return 'text-red-600 dark:text-red-400';
        default:
            return 'text-slate-500 dark:text-slate-400';
    }
});
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.3);
    border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background-color: rgba(156, 163, 175, 0.5);
}
</style>
