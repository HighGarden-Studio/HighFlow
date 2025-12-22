<script setup lang="ts">
import { computed } from 'vue';
import { marked } from 'marked';
import type { Tokens } from 'marked';

const props = defineProps<{
    content: string;
    class?: string;
}>();

// Custom renderer to support Tailwind prose classes or custom styling
const renderer = new marked.Renderer();

// Optimize link rendering to open in new tab
renderer.link = ({ href, title, text }: Tokens.Link) => {
    return `<a href="${href}" title="${title || ''}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:underline">${text}</a>`;
};

// Basic code block styling
renderer.code = ({ text, lang }: Tokens.Code) => {
    const language = (lang || '').trim();
    const langClass = language ? `language-${language}` : '';
    return `<pre class="bg-gray-800 text-gray-100 p-3 rounded-md overflow-x-auto my-2 text-sm"><code class="${langClass}">${text}</code></pre>`;
};

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
</script>

<template>
    <div
        class="prose dark:prose-invert max-w-none text-sm leading-relaxed"
        :class="props.class"
        v-html="renderedContent"
    ></div>
</template>

<style scoped>
/* Scoped styles if needed, but Tailwind 'prose' plugin usually handles this nicely */
:deep(p) {
    margin-bottom: 0.5em;
}
:deep(ul),
:deep(ol) {
    margin-left: 1.2em;
    margin-bottom: 0.5em;
}
:deep(li) {
    margin-bottom: 0.25em;
}
:deep(h1),
:deep(h2),
:deep(h3),
:deep(h4) {
    margin-top: 1em;
    margin-bottom: 0.5em;
    font-weight: 600;
}
</style>
