<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { marked } from 'marked';
import type { Tokens } from 'marked';
import mermaid from 'mermaid';

const props = defineProps<{
    content: string;
    class?: string;
}>();

const container = ref<HTMLElement | null>(null);

// Initialize mermaid
mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    securityLevel: 'loose',
    themeVariables: {
        darkMode: true,
        background: '#1f2937', // gray-800
        primaryColor: '#3b82f6', // blue-500
        lineColor: '#9ca3af', // gray-400
        secondaryColor: '#111827', // gray-900
        tertiaryColor: '#374151', // gray-700
    },
});

// Custom renderer
const renderer = new marked.Renderer();

// Custom link renderer
renderer.link = ({ href, title, text }: Tokens.Link) => {
    return `<a href="${href}" title="${title || ''}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline cursor-pointer">${text}</a>`;
};

// Custom code block renderer to handle mermaid
renderer.code = ({ text, lang }: Tokens.Code) => {
    const language = (lang || '').trim();
    if (language === 'mermaid') {
        return `<div class="mermaid-diagram bg-white dark:bg-gray-800 p-4 rounded-lg my-4 overflow-x-auto flex justify-center border border-gray-200 dark:border-gray-700">${text}</div>`;
    }
    const langClass = language ? `language-${language}` : '';
    return `<pre class="bg-gray-800 text-gray-100 p-3 rounded-md overflow-x-auto my-2 text-sm"><code class="${langClass}">${text}</code></pre>`;
};

// Render markdown
const renderedContent = computed(() => {
    if (!props.content) return '';
    try {
        return marked(props.content, {
            renderer,
            gfm: true,
            breaks: true,
        });
    } catch (e) {
        console.error('Markdown rendering error:', e);
        return props.content;
    }
});

// Render diagrams
const renderDiagrams = async () => {
    await nextTick();
    if (!container.value) return;

    const diagrams = container.value.querySelectorAll('.mermaid-diagram');

    // We process sequentially to avoid generating conflicting IDs if necessary,
    // although mermaid.run handles selector processing nicely.
    // Instead of manual render per block, we can use run()

    try {
        await mermaid.run({
            nodes: diagrams as NodeListOf<HTMLElement>,
        });
    } catch (e) {
        console.error('Mermaid rendering error:', e);
    }
};

watch(
    () => props.content,
    () => {
        renderDiagrams();
    },
    { immediate: false } // We'll trigger manually on mount too
);

onMounted(() => {
    renderDiagrams();
});
</script>

<template>
    <div
        ref="container"
        class="prose dark:prose-invert max-w-none text-sm leading-relaxed help-content"
        :class="props.class"
        v-html="renderedContent"
    ></div>
</template>

<style>
.help-content h1 {
    @apply text-3xl font-bold text-gray-900 dark:text-white mb-6 pb-2 border-b border-gray-200 dark:border-gray-700;
}
.help-content h2 {
    @apply text-2xl font-bold text-gray-900 dark:text-white mt-10 mb-4 pb-2 border-b border-gray-100 dark:border-gray-800;
}
.help-content h3 {
    @apply text-xl font-bold text-gray-900 dark:text-white mt-8 mb-3;
}
.help-content p {
    @apply mb-4 text-gray-700 dark:text-gray-300 leading-relaxed;
}
.help-content ul {
    @apply list-disc list-inside mb-4 ml-2 space-y-1 text-gray-700 dark:text-gray-300;
}
.help-content ol {
    @apply list-decimal list-inside mb-4 ml-2 space-y-1 text-gray-700 dark:text-gray-300;
}
.help-content li {
    @apply mb-1;
}
.help-content blockquote {
    @apply border-l-4 border-blue-500 pl-4 py-2 my-4 bg-blue-50 dark:bg-blue-900/10 dark:text-gray-300 rounded-r-lg;
}
.help-content table {
    @apply w-full border-collapse mb-6 text-sm;
}
.help-content th {
    @apply bg-gray-100 dark:bg-gray-800 text-left px-4 py-2 border border-gray-200 dark:border-gray-700 font-bold text-gray-900 dark:text-white;
}
.help-content td {
    @apply px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300;
}
</style>
