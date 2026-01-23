<script setup lang="ts">
import { computed, watch, ref } from 'vue';
import {
    GeminiManifestParser,
    type AgentManifest,
} from '../../../services/ai/parsers/GeminiManifestParser';
import MarkdownRenderer from '../../common/MarkdownRenderer.vue'; // Assuming we have or use a generic one

const props = defineProps<{
    content: string;
    final?: boolean;
}>();

const manifest = computed<AgentManifest>(() => {
    return GeminiManifestParser.parse(props.content);
});

const activeStepId = ref<number | null>(null);

const toggleStep = (id: number) => {
    activeStepId.value = activeStepId.value === id ? null : id;
};

// Auto-expand the running step
watch(
    () => manifest.value.steps,
    (steps) => {
        const running = steps.find((s) => s.status === 'running');
        if (running) {
            activeStepId.value = running.id;
        }
    },
    { deep: true, immediate: true }
);

const formattedFallbackContent = computed(() => {
    const raw = props.content?.trim();
    if (!raw) return '';

    // If it looks like NDJSON (multiple lines starting with {), wrap in json block
    const lines = raw.split('\n');
    if (lines.length > 1 && lines[0]?.trim().startsWith('{') && lines[1]?.trim().startsWith('{')) {
        return '```json\n' + raw + '\n```';
    }

    // Otherwise return as is (MarkdownRenderer will handle it)
    return raw;
});
</script>

<template>
    <div class="agent-viewer flex flex-col gap-4 p-4">
        <!-- Steps List -->
        <div v-if="manifest.steps.length > 0" class="steps-container flex flex-col gap-3">
            <h3 class="text-xs font-bold uppercase text-gray-400 tracking-wider mb-1">
                Execution Plan
            </h3>

            <div
                v-for="step in manifest.steps"
                :key="step.id"
                class="step-card bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-200 hover:border-gray-300 dark:hover:border-gray-600"
            >
                <!-- Step Header -->
                <div
                    class="step-header px-4 py-3 flex items-center justify-between cursor-pointer bg-gray-100/50 dark:bg-gray-800/50"
                    @click="toggleStep(step.id)"
                >
                    <div class="flex items-center gap-3">
                        <!-- Status Icon -->
                        <div class="status-icon shrink-0">
                            <span v-if="step.status === 'completed'" class="text-green-500 text-lg"
                                >✓</span
                            >
                            <span v-else-if="step.status === 'failed'" class="text-red-500 text-lg"
                                >✕</span
                            >
                            <span v-else class="flex h-4 w-4 relative">
                                <span
                                    class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"
                                ></span>
                                <span
                                    class="relative inline-flex rounded-full h-4 w-4 bg-blue-500"
                                ></span>
                            </span>
                        </div>

                        <div class="flex flex-col">
                            <span
                                class="text-sm font-semibold text-gray-800 dark:text-gray-200 font-mono"
                            >
                                {{ step.name || 'Action' }}
                            </span>
                            <span v-if="step.status === 'failed'" class="text-xs text-red-500"
                                >Failed</span
                            >
                        </div>
                    </div>

                    <!-- Chevron -->
                    <svg
                        class="w-4 h-4 text-gray-400 transition-transform duration-200"
                        :class="{ 'rotate-180': activeStepId === step.id }"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </div>

                <!-- Step Details (Collapsible) -->
                <div
                    v-show="activeStepId === step.id"
                    class="step-body border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                >
                    <!-- Args -->
                    <div v-if="step.args" class="p-3">
                        <div class="text-xs font-mono text-gray-500 mb-1 uppercase">
                            {{ step.type === 'thought' ? 'Thought Process' : 'Input' }}
                        </div>

                        <!-- Thought Step: Render as Markdown -->
                        <div
                            v-if="step.type === 'thought'"
                            class="text-sm text-gray-700 dark:text-gray-300"
                        >
                            <MarkdownRenderer :content="step.args.text || ''" />
                        </div>

                        <!-- Tool Step: Render as JSON -->
                        <pre
                            v-else
                            class="text-xs bg-gray-50 dark:bg-gray-950 p-2 rounded text-gray-700 dark:text-gray-300 overflow-x-auto border border-gray-100 dark:border-gray-800"
                            >{{ JSON.stringify(step.args, null, 2) }}</pre
                        >
                    </div>

                    <!-- Result -->
                    <div v-if="step.result" class="p-3 pt-0">
                        <div class="text-xs font-mono text-gray-500 mb-1 uppercase">Output</div>
                        <div
                            class="text-xs bg-gray-50 dark:bg-gray-950 p-2 rounded text-gray-700 dark:text-gray-300 overflow-x-auto max-h-60 border border-gray-100 dark:border-gray-800 whitespace-pre-wrap font-mono"
                        >
                            {{ step.result }}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Final Response -->
        <div v-if="manifest.finalResponse" class="final-response mt-4">
            <h3 class="text-xs font-bold uppercase text-gray-400 tracking-wider mb-2">Response</h3>
            <div
                class="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm"
            >
                <MarkdownRenderer :content="manifest.finalResponse" />
            </div>
        </div>

        <!-- Fallback Raw Content (if no structured data found) -->
        <div
            v-if="manifest.steps.length === 0 && !manifest.finalResponse && content"
            class="raw-fallback mt-4"
        >
            <div
                class="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm"
            >
                <!-- Try to render as Markdown, or Pre text if parsing failed -->
                <MarkdownRenderer :content="formattedFallbackContent" />
            </div>
        </div>
    </div>
</template>

<style scoped>
.prose {
    font-size: 0.95rem;
    line-height: 1.6;
}

/* Force wrapping for code blocks in agent viewer to avoid horizontal scroll on long XML/JSON */
:deep(.prose pre) {
    white-space: pre-wrap;
    word-break: break-word;
}
</style>
