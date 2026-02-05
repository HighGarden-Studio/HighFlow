<template>
    <div class="console-timeline-view h-full w-full bg-slate-50 dark:bg-slate-950 flex flex-col">
        <!-- Toolbar / Header -->
        <div
            class="h-10 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center px-4 justify-between shrink-0"
        >
            <div class="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Execution Flow
            </div>
            <div class="flex items-center gap-2">
                <button
                    v-if="store.hasActiveExecutions"
                    class="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    @click="clearCompleted"
                >
                    Clear Completed
                </button>
            </div>
        </div>

        <!-- Scrollable Content -->
        <div class="flex-1 overflow-y-auto p-4 custom-scrollbar scroll-smooth">
            <template v-if="executions.length > 0">
                <div class="max-w-3xl mx-auto">
                    <!-- Timeline Line -->
                    <div class="relative">
                        <!-- Vertical Line (Optional decoration) -->
                        <div
                            class="absolute left-[1.65rem] top-4 bottom-4 w-0.5 bg-slate-200 dark:bg-slate-800 z-0 hidden lg:block"
                        ></div>

                        <ConsoleTaskCard
                            v-for="exec in executions"
                            :key="exec.taskId"
                            :execution="exec"
                            class="relative z-10"
                        />
                    </div>
                </div>

                <!-- Spacer for auto-scroll visibility -->
                <div ref="bottomRef" class="h-4"></div>
            </template>

            <!-- Empty State -->
            <div
                v-else
                class="h-full flex flex-col items-center justify-center text-gray-400 gap-4 opacity-60"
            >
                <div class="text-5xl opacity-20">📊</div>
                <p class="text-sm font-medium">No active executions</p>
                <p class="text-xs opacity-70">Run a task to see the timeline</p>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useConsoleStore } from '../../../renderer/stores/consoleStore';
import ConsoleTaskCard from './ConsoleTaskCard.vue';

const store = useConsoleStore();

const bottomRef = ref<HTMLElement | null>(null);

// Get executions in the order defined by activeTaskIds
const executions = computed(() => store.activeExecutions);

// Auto-scroll logic
// We watch for changes in the executions or their content (if possible)
// Deep watching executions might be expensive, so we watch activeTaskIds length and potentially a timestamp if available
// Or simply watch the computed `executions`.

watch(
    () => executions.value,
    async () => {
        await nextTick();
        scrollToBottom();
    },
    { deep: true }
);

function scrollToBottom() {
    if (bottomRef.value) {
        bottomRef.value.scrollIntoView({ behavior: 'smooth' });
    }
}

function clearCompleted() {
    // We would need an action in store to clear only completed, or just rely on clearAll
    // For now, let's just clear all if user wants cleanup
    store.clearAll();
}
</script>

<style scoped>
.console-timeline-view {
    /* Ensure it takes full height of parent pane */
    height: 100%;
}
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
