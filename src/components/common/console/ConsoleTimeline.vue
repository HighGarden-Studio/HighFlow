<template>
    <div
        class="console-timeline h-full flex flex-col overflow-hidden bg-white dark:bg-gray-900 font-sans"
    >
        <!-- Header / Status Bar could go here if needed -->

        <!-- Timeline Stream -->
        <div ref="scrollContainer" class="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
            <!-- Empty State -->
            <div
                v-if="!transcript || transcript.length === 0"
                class="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500"
            >
                <span class="text-4xl mb-2 opacity-50">📋</span>
                <p class="text-sm">Ready to execute. Activity will appear here.</p>
            </div>

            <template v-else>
                <div v-for="(group, index) in groupedEvents" :key="index" class="timeline-group">
                    <!-- 1. THOUGHT BLOCK (Collapsible) -->
                    <div v-if="group.type === 'thought'" class="timeline-item thought-item">
                        <div
                            class="flex items-center gap-2 py-2 px-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-100 dark:border-gray-800 transition-colors group-hover:border-gray-200 dark:group-hover:border-gray-700"
                            @click="toggleGroup(group.id)"
                        >
                            <span
                                class="text-gray-400 dark:text-gray-500 text-xs transform transition-transform duration-200"
                                :class="{ 'rotate-90': group.isExpanded }"
                                >▶</span
                            >
                            <span class="text-gray-500 dark:text-gray-400 text-sm"
                                >💭 Thinking Process</span
                            >
                            <span
                                v-if="group.duration"
                                class="ml-auto text-xs text-gray-400 font-mono"
                                >{{ group.duration }}ms</span
                            >
                        </div>

                        <div
                            v-if="group.isExpanded"
                            class="pl-4 pr-2 py-2 mt-1 border-l-2 border-gray-100 dark:border-gray-800 ml-3"
                        >
                            <div
                                class="prose prose-sm dark:prose-invert max-w-none text-gray-600 dark:text-gray-300"
                            >
                                <component :is="renderMarkdown(group.content)" />
                            </div>
                        </div>
                    </div>

                    <!-- 2. TOOL USE BLOCK -->
                    <div v-else-if="group.type === 'tool_use'" class="timeline-item tool-use-item">
                        <div
                            class="flex flex-col border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/10 rounded-lg overflow-hidden"
                        >
                            <!-- Tool Header -->
                            <div
                                class="flex items-center justify-between px-3 py-2 bg-amber-100/50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-900/50"
                            >
                                <div class="flex items-center gap-2">
                                    <span class="text-amber-600 dark:text-amber-500">🛠️</span>
                                    <span
                                        class="font-mono text-sm font-medium text-amber-800 dark:text-amber-200"
                                        >{{ group.toolName }}</span
                                    >
                                </div>
                                <span
                                    class="text-xs text-amber-600/70 dark:text-amber-400/70 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30"
                                    >Input</span
                                >
                            </div>
                            <!-- Tool Input -->
                            <div class="p-3 overflow-x-auto bg-white/50 dark:bg-gray-900/50">
                                <pre
                                    class="text-xs font-mono text-amber-900 dark:text-amber-100 whitespace-pre-wrap"
                                    >{{ group.input }}</pre
                                >
                            </div>
                        </div>
                    </div>

                    <!-- 3. TOOL RESULT BLOCK -->
                    <div
                        v-else-if="group.type === 'tool_result'"
                        class="timeline-item tool-result-item"
                    >
                        <div
                            class="flex flex-col border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/10 rounded-lg overflow-hidden"
                        >
                            <!-- Helper Header (Often implicit, but good to show linkage) -->
                            <div
                                class="flex items-center justify-between px-3 py-2 bg-green-100/50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-900/50"
                            >
                                <div class="flex items-center gap-2">
                                    <span class="text-green-600 dark:text-green-500">✅</span>
                                    <span
                                        class="font-mono text-sm font-medium text-green-800 dark:text-green-200"
                                        >{{ group.toolName }}</span
                                    >
                                </div>
                                <span
                                    class="text-xs text-green-600/70 dark:text-green-400/70 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30"
                                    >Result</span
                                >
                            </div>
                            <!-- Output -->
                            <div
                                class="p-3 overflow-x-auto bg-white/50 dark:bg-gray-900/50 max-h-60"
                            >
                                <pre
                                    class="text-xs font-mono text-green-900 dark:text-green-100 whitespace-pre-wrap"
                                    >{{ group.output }}</pre
                                >
                            </div>
                        </div>
                    </div>

                    <!-- 4. ASSISTANT MESSAGE / FINAL ANSWER -->
                    <div
                        v-else-if="group.type === 'assistant'"
                        class="timeline-item assistant-item pl-2"
                    >
                        <div class="flex gap-3">
                            <div class="flex-shrink-0 mt-1">
                                <div
                                    class="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300 text-xs font-bold"
                                >
                                    AI
                                </div>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div
                                    class="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-100"
                                >
                                    <div v-html="renderMarkdownHtml(group.content)"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 5. ERROR BLOCK -->
                    <div v-else-if="group.type === 'error'" class="timeline-item error-item">
                        <div
                            class="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg text-red-700 dark:text-red-300"
                        >
                            <span class="text-lg">⚠️</span>
                            <div class="flex-1 text-sm font-medium">
                                {{ group.content }}
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Loading Indicator (Pulse) -->
                <div
                    v-if="isActive"
                    class="loading-indicator flex items-center gap-2 pl-4 py-2 opacity-70"
                >
                    <span class="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></span>
                    <span class="w-2 h-2 bg-blue-400 rounded-full animate-pulse delay-75"></span>
                    <span class="w-2 h-2 bg-blue-400 rounded-full animate-pulse delay-150"></span>
                </div>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { ConsoleEvent } from '../../../renderer/stores/consoleStore';

const props = defineProps<{
    transcript: ConsoleEvent[];
    isActive?: boolean;
}>();

const scrollContainer = ref<HTMLElement | null>(null);

// Group state (for expansion)
const expandedGroups = ref<Record<string, boolean>>({});

// Group events logically?
// Actually, ConsoleEvent stream is already flat. Collapsing "Thought" might require grouping consecutive thought events if they were split?
// But typically 'thought' event comes as one block or stream updates the same block.
// `useTaskExecution.ts` streams to LATEST event if type matches. So thought event will just grow.
// We map transcript to view model.

interface TimelineGroup extends ConsoleEvent {
    id: string; // Ensure unique ID for v-for key
    isExpanded?: boolean;
    duration?: number;
}

const groupedEvents = computed(() => {
    return props.transcript.map((event, idx) => {
        // Generate a stable ID if not present
        const id = (event as any).id || `evt-${idx}`;
        return {
            ...event,
            id,
            isExpanded: expandedGroups.value[id] ?? true, // Default expanded? or collapsed? "Thoughts" usually default collapsed in some UIs, but here meaningful. Let's default expanded for now.
        } as TimelineGroup;
    });
});

function toggleGroup(id: string) {
    if (expandedGroups.value[id] === undefined) {
        expandedGroups.value[id] = false; // Toggle to false (collapse) if previously undefined (default true)
    } else {
        expandedGroups.value[id] = !expandedGroups.value[id];
    }
}

// Markdown Rendering
function renderMarkdownHtml(content: string) {
    if (!content) return '';
    const raw = marked.parse(content);
    return DOMPurify.sanitize(raw as string);
}

// Render component for specialized markdown (if needed later)
function renderMarkdown(content: string) {
    // For now simple render, can extend
    return {
        template: `<div>${renderMarkdownHtml(content)}</div>`,
    };
}

// Auto-scroll logic
watch(
    () => props.transcript.length,
    () => {
        nextTick(() => {
            if (scrollContainer.value) {
                // Smooth scroll to bottom
                scrollContainer.value.scrollTo({
                    top: scrollContainer.value.scrollHeight,
                    behavior: 'smooth',
                });
            }
        });
    },
    { deep: true }
);
</script>

<style scoped>
/* Custom Scrollbar for sleek look */
.overflow-y-auto::-webkit-scrollbar {
    width: 6px;
}
.overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
}
.overflow-y-auto::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.3);
    border-radius: 3px;
}
.overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background-color: rgba(156, 163, 175, 0.5);
}

.prose pre {
    background-color: transparent !important;
    margin: 0;
    padding: 0;
}
</style>
