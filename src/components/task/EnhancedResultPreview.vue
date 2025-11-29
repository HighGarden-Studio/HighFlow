<script setup lang="ts">
/**
 * EnhancedResultPreview Component
 *
 * Multi-format result preview with syntax highlighting and optimal viewer per output format
 * Supports: text, markdown, html, pdf, json, yaml, csv, sql, shell, mermaid, svg, png, mp4, mp3, diff, log, code
 */
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import type { Task } from '@core/types/database';
import type { AiResult, AiSubType } from '@core/types/ai';
import { extractTaskResult } from '../../renderer/utils/aiResultHelpers';
import { marked } from 'marked';
import type { MarkedOptions } from 'marked';

// Output format type
type OutputFormat =
    | 'text'
    | 'markdown'
    | 'html'
    | 'pdf'
    | 'json'
    | 'yaml'
    | 'csv'
    | 'sql'
    | 'shell'
    | 'mermaid'
    | 'svg'
    | 'png'
    | 'mp4'
    | 'mp3'
    | 'diff'
    | 'log'
    | 'code';

const OUTPUT_FORMAT_VALUES: OutputFormat[] = [
    'text',
    'markdown',
    'html',
    'pdf',
    'json',
    'yaml',
    'csv',
    'sql',
    'shell',
    'mermaid',
    'svg',
    'png',
    'mp4',
    'mp3',
    'diff',
    'log',
    'code',
];

const SUBTYPE_TO_FORMAT: Partial<Record<AiSubType, OutputFormat>> = {
    text: 'text',
    markdown: 'markdown',
    html: 'html',
    pdf: 'pdf',
    json: 'json',
    yaml: 'yaml',
    csv: 'csv',
    sql: 'sql',
    shell: 'shell',
    mermaid: 'mermaid',
    svg: 'svg',
    png: 'png',
    mp4: 'mp4',
    mp3: 'mp3',
    diff: 'diff',
    log: 'log',
    code: 'code',
};

const SUBTYPE_MIME_MAP: Partial<Record<AiSubType, string>> = {
    text: 'text/plain',
    markdown: 'text/markdown',
    html: 'text/html',
    pdf: 'application/pdf',
    json: 'application/json',
    yaml: 'text/yaml',
    csv: 'text/csv',
    sql: 'text/sql',
    shell: 'text/x-shellscript',
    mermaid: 'text/plain',
    svg: 'image/svg+xml',
    png: 'image/png',
    mp4: 'video/mp4',
    mp3: 'audio/mpeg',
    diff: 'text/x-diff',
    log: 'text/plain',
    code: 'text/plain',
};

const SUBTYPE_EXTENSION_MAP: Partial<Record<AiSubType, string>> = {
    text: 'txt',
    markdown: 'md',
    html: 'html',
    pdf: 'pdf',
    json: 'json',
    yaml: 'yaml',
    csv: 'csv',
    sql: 'sql',
    shell: 'sh',
    mermaid: 'mmd',
    svg: 'svg',
    png: 'png',
    mp4: 'mp4',
    mp3: 'mp3',
    diff: 'diff',
    log: 'log',
    code: 'txt',
};

const markdownRenderer = new marked.Renderer();
markdownRenderer.code = (code: string, infoString: string | undefined) => {
    const language = (infoString || '').trim();
    const langClass = language ? `language-${language}` : '';
    return `<pre class="bg-gray-900 p-4 rounded-lg overflow-x-auto"><code class="${langClass} text-sm font-mono text-gray-100">${escapeHtml(code)}</code></pre>`;
};

const markedOptions: MarkedOptions = {
    renderer: markdownRenderer,
    gfm: true,
    breaks: true,
    headerIds: false,
    mangle: false,
};

interface Props {
    task: Task | null;
    open: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'retry', task: Task, feedback: string): void;
    (e: 'approve', task: Task): void;
    (e: 'download'): void;
    (e: 'rollback', versionId: string): void;
}>();

// State
const zoomLevel = ref(100);
const isFullscreen = ref(false);
const feedback = ref('');
const showVersionHistory = ref(false);
const renderedMermaid = ref('');
const copySuccess = ref(false);
const markdownHtml = ref('');

const taskResult = computed(() => extractTaskResult(props.task as any));
const aiResult = computed<AiResult | null>(() => taskResult.value.aiResult);
const aiMimeType = computed(() => guessMimeFromAiResult(aiResult.value));
const aiFileExtension = computed(() => inferExtensionFromAiResult(aiResult.value));

const aiValue = computed(() => {
    const result = aiResult.value;
    if (!result) return null;
    if (result.format === 'base64') {
        const mime = aiMimeType.value || 'application/octet-stream';
        return `data:${mime};base64,${result.value}`;
    }
    return result.value;
});

const fallbackResultContent = computed(() => taskResult.value.content || '');

// Get output format from task or AiResult subtype
const outputFormat = computed<OutputFormat>(() => {
    const subType = aiResult.value?.subType;
    if (subType) {
        const mapped = SUBTYPE_TO_FORMAT[subType];
        if (mapped) {
            return mapped;
        }
    }

    const format =
        (props.task as any)?.outputFormat ||
        (props.task as any)?.expectedOutputFormat ||
        (props.task as any)?.executionResult?.contentType ||
        'markdown';

    return coerceOutputFormat(format);
});

// Get code language if output format is 'code'
const codeLanguage = computed(() => {
    if (aiResult.value?.meta?.language) {
        return aiResult.value.meta.language;
    }
    return taskResult.value.language || 'plaintext';
});

// Get task result content
const content = computed(() => {
    return aiValue.value || fallbackResultContent.value || '';
});

// Format display name
const formatDisplayName = computed(() => {
    const names: Record<OutputFormat, string> = {
        text: 'Text',
        markdown: 'Markdown',
        html: 'HTML',
        pdf: 'PDF',
        json: 'JSON',
        yaml: 'YAML',
        csv: 'CSV',
        sql: 'SQL',
        shell: 'Shell Script',
        mermaid: 'Mermaid Diagram',
        svg: 'SVG Image',
        png: 'PNG Image',
        mp4: 'MP4 Video',
        mp3: 'MP3 Audio',
        diff: 'Diff',
        log: 'Log',
        code: codeLanguage.value.charAt(0).toUpperCase() + codeLanguage.value.slice(1),
    };
    return names[outputFormat.value] || 'Text';
});

// Format icon
const formatIcon = computed(() => {
    const icons: Record<OutputFormat, string> = {
        text: 'M4 6h16M4 12h16m-7 6h7',
        markdown: 'M4 5h16M4 10h16M4 15h8',
        html: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
        pdf: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z',
        json: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4',
        yaml: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4',
        csv: 'M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
        sql: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4',
        shell: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
        mermaid:
            'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2',
        svg: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
        png: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
        mp4: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
        mp3: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
        diff: 'M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2',
        log: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
        code: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
    };
    return icons[outputFormat.value] || icons.text;
});

// Syntax highlight class for code
const syntaxHighlightClass = computed(() => {
    const format = outputFormat.value;
    if (format === 'code') {
        const langMap: Record<string, string> = {
            typescript: 'language-typescript',
            javascript: 'language-javascript',
            python: 'language-python',
            java: 'language-java',
            go: 'language-go',
            rust: 'language-rust',
            cpp: 'language-cpp',
            c: 'language-c',
            csharp: 'language-csharp',
            ruby: 'language-ruby',
            php: 'language-php',
            swift: 'language-swift',
            kotlin: 'language-kotlin',
            scala: 'language-scala',
            html: 'language-html',
            css: 'language-css',
            scss: 'language-scss',
            vue: 'language-vue',
            react: 'language-jsx',
        };
        return langMap[codeLanguage.value.toLowerCase()] || 'language-plaintext';
    }

    const formatMap: Record<string, string> = {
        sql: 'language-sql',
        shell: 'language-bash',
        json: 'language-json',
        yaml: 'language-yaml',
    };
    return formatMap[format] || '';
});

// Parse CSV data
const parsedCsvData = computed(() => {
    if (outputFormat.value !== 'csv' || !content.value) return null;

    const lines = content.value.trim().split('\n');
    const firstLine = lines[0];
    if (!firstLine) return null;

    const headers = firstLine.split(',').map((h: string) => h.trim().replace(/^"|"$/g, ''));
    const rows = lines
        .slice(1)
        .map((line: string) =>
            line.split(',').map((cell: string) => cell.trim().replace(/^"|"$/g, ''))
        );

    return { headers, rows };
});

// Parse JSON for tree view
const jsonMarkdownHtml = computed(() => {
    if (outputFormat.value !== 'json' || !content.value) return '';
    return hasCodeFence(content.value) ? renderMarkdownContent(content.value) : '';
});

const parsedJsonData = computed(() => {
    if (outputFormat.value !== 'json' || !content.value) return null;

    const normalized = extractJsonPayload(content.value);
    if (!normalized) return null;

    try {
        return JSON.parse(normalized);
    } catch {
        return null;
    }
});

// Parse diff for colored view
const parsedDiffLines = computed(() => {
    if (outputFormat.value !== 'diff' || !content.value) return [];

    return content.value.split('\n').map((line: string) => {
        let type: 'added' | 'removed' | 'header' | 'normal' = 'normal';
        if (line.startsWith('+') && !line.startsWith('+++')) {
            type = 'added';
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            type = 'removed';
        } else if (
            line.startsWith('@@') ||
            line.startsWith('diff') ||
            line.startsWith('---') ||
            line.startsWith('+++')
        ) {
            type = 'header';
        }
        return { text: line, type };
    });
});

// Parse log for colored view
const parsedLogLines = computed(() => {
    if (outputFormat.value !== 'log' || !content.value) return [];

    return content.value.split('\n').map((line: string) => {
        let level: 'error' | 'warn' | 'info' | 'debug' | 'normal' = 'normal';
        const lowerLine = line.toLowerCase();
        if (
            lowerLine.includes('error') ||
            lowerLine.includes('fatal') ||
            lowerLine.includes('exception')
        ) {
            level = 'error';
        } else if (lowerLine.includes('warn') || lowerLine.includes('warning')) {
            level = 'warn';
        } else if (lowerLine.includes('info')) {
            level = 'info';
        } else if (lowerLine.includes('debug') || lowerLine.includes('trace')) {
            level = 'debug';
        }
        return { text: line, level };
    });
});

// Render Mermaid diagram
async function renderMermaid() {
    if (outputFormat.value !== 'mermaid' || !content.value) return;

    try {
        // Dynamic import mermaid
        const mermaid = await import('mermaid');
        mermaid.default.initialize({
            startOnLoad: false,
            theme: 'dark',
            securityLevel: 'loose',
        });

        const { svg } = await mermaid.default.render('mermaid-diagram', content.value);
        renderedMermaid.value = svg;
    } catch (err) {
        console.error('Mermaid render error:', err);
        renderedMermaid.value = `<div class="text-red-500">Mermaid 다이어그램 렌더링 오류: ${err}</div>`;
    }
}

function renderMarkdownContent(rawText: string): string {
    if (!rawText) return '';

    const rendered = marked.parse(rawText, { ...markedOptions, async: false });
    return typeof rendered === 'string' ? rendered : '';
}

function hasCodeFence(rawText: string): boolean {
    return /```[\s\S]+```/.test(rawText);
}

function extractJsonPayload(rawText: string): string | null {
    if (!rawText) return null;
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch && fenceMatch[1]) {
        return fenceMatch[1].trim();
    }
    return rawText.trim() || null;
}

// Render Markdown
function renderMarkdown() {
    if (outputFormat.value !== 'markdown' || !content.value) {
        markdownHtml.value = '';
        return;
    }

    markdownHtml.value = renderMarkdownContent(content.value);
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Actions
function handleZoomIn() {
    if (zoomLevel.value < 200) {
        zoomLevel.value += 25;
    }
}

function handleZoomOut() {
    if (zoomLevel.value > 50) {
        zoomLevel.value -= 25;
    }
}

function toggleFullscreen() {
    isFullscreen.value = !isFullscreen.value;
}

function handleDownload() {
    if (!content.value && !aiResult.value) return;

    const mimeTypes: Record<OutputFormat, string> = {
        text: 'text/plain',
        markdown: 'text/markdown',
        html: 'text/html',
        pdf: 'application/pdf',
        json: 'application/json',
        yaml: 'text/yaml',
        csv: 'text/csv',
        sql: 'text/plain',
        shell: 'text/x-shellscript',
        mermaid: 'text/plain',
        svg: 'image/svg+xml',
        png: 'image/png',
        mp4: 'video/mp4',
        mp3: 'audio/mpeg',
        diff: 'text/plain',
        log: 'text/plain',
        code: 'text/plain',
    };

    const extensions: Record<OutputFormat, string> = {
        text: 'txt',
        markdown: 'md',
        html: 'html',
        pdf: 'pdf',
        json: 'json',
        yaml: 'yaml',
        csv: 'csv',
        sql: 'sql',
        shell: 'sh',
        mermaid: 'mmd',
        svg: 'svg',
        png: 'png',
        mp4: 'mp4',
        mp3: 'mp3',
        diff: 'diff',
        log: 'log',
        code:
            codeLanguage.value === 'typescript'
                ? 'ts'
                : codeLanguage.value === 'javascript'
                  ? 'js'
                  : codeLanguage.value,
    };

    const fallbackMime = mimeTypes[outputFormat.value] || 'text/plain';
    const fallbackExtension = extensions[outputFormat.value] || 'txt';
    const targetMime = aiMimeType.value || fallbackMime;
    const targetExtension = aiFileExtension.value || fallbackExtension;

    if (aiResult.value && aiResult.value.format === 'url') {
        const anchor = document.createElement('a');
        anchor.href = aiResult.value.value;
        anchor.download = `${props.task?.title || 'result'}.${targetExtension}`;
        anchor.target = '_blank';
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        emit('download');
        return;
    }

    let blob: Blob;
    if (aiResult.value && aiResult.value.format === 'base64') {
        blob = base64ToBlob(aiResult.value.value, targetMime);
    } else {
        blob = new Blob([content.value], { type: targetMime });
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${props.task?.title || 'result'}.${targetExtension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    emit('download');
}

function handleRetry() {
    if (!props.task || !feedback.value.trim()) return;
    emit('retry', props.task, feedback.value);
    feedback.value = '';
}

function handleApprove() {
    if (!props.task) return;
    emit('approve', props.task);
}

function handleClose() {
    emit('close');
}

async function copyToClipboard() {
    if (!content.value) return;
    try {
        await navigator.clipboard.writeText(content.value);
        copySuccess.value = true;
        setTimeout(() => {
            copySuccess.value = false;
        }, 2000);
    } catch (err) {
        console.error('Copy failed:', err);
    }
}

// Watch for content/format changes
watch(
    [() => props.open, outputFormat, content],
    async ([isOpen]) => {
        if (isOpen) {
            await nextTick();
            if (outputFormat.value === 'mermaid') {
                await renderMermaid();
            } else if (outputFormat.value === 'markdown') {
                renderMarkdown();
            }
        }
    },
    { immediate: true }
);

// Render JSON tree recursively
function renderJsonTree(value: unknown, depth: number = 0): string {
    const indent = '  '.repeat(depth);

    if (value === null) {
        return `<span class="text-gray-500">null</span>`;
    }
    if (typeof value === 'boolean') {
        return `<span class="text-purple-400">${value}</span>`;
    }
    if (typeof value === 'number') {
        return `<span class="text-blue-400">${value}</span>`;
    }
    if (typeof value === 'string') {
        return `<span class="text-green-400">"${escapeHtml(value)}"</span>`;
    }
    if (Array.isArray(value)) {
        if (value.length === 0) return `<span class="text-gray-400">[]</span>`;
        const items = value
            .map((item) => `${indent}  ${renderJsonTree(item, depth + 1)}`)
            .join(',\n');
        return `<span class="text-gray-400">[</span>\n${items}\n${indent}<span class="text-gray-400">]</span>`;
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length === 0) return `<span class="text-gray-400">{}</span>`;
        const items = entries
            .map(
                ([k, v]) =>
                    `${indent}  <span class="text-yellow-400">"${escapeHtml(k)}"</span>: ${renderJsonTree(v, depth + 1)}`
            )
            .join(',\n');
        return `<span class="text-gray-400">{</span>\n${items}\n${indent}<span class="text-gray-400">}</span>`;
    }
    return String(value);
}

function guessMimeFromAiResult(result: AiResult | null): string | undefined {
    if (!result) return undefined;
    return result.mime || guessMimeFromSubType(result.subType);
}

function guessMimeFromSubType(subType?: AiSubType): string | undefined {
    if (!subType) return undefined;
    return SUBTYPE_MIME_MAP[subType];
}

function inferExtensionFromAiResult(result: AiResult | null): string | undefined {
    if (!result?.subType) return undefined;
    return inferExtensionFromSubType(result.subType);
}

function inferExtensionFromSubType(subType?: AiSubType): string | undefined {
    if (!subType) return undefined;
    return SUBTYPE_EXTENSION_MAP[subType];
}

function coerceOutputFormat(format: unknown, fallback: OutputFormat = 'markdown'): OutputFormat {
    if (typeof format !== 'string') {
        return fallback;
    }
    return (OUTPUT_FORMAT_VALUES as ReadonlyArray<string>).includes(format)
        ? (format as OutputFormat)
        : fallback;
}

function base64ToBlob(data: string, mime: string): Blob {
    const binary = atob(data);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
}

onMounted(() => {
    if (props.open) {
        if (outputFormat.value === 'mermaid') {
            renderMermaid();
        } else if (outputFormat.value === 'markdown') {
            renderMarkdown();
        }
    }
});
</script>

<template>
    <Teleport to="body">
        <div
            v-if="open"
            class="fixed inset-0 z-50 overflow-hidden"
            :class="{ 'pointer-events-none': !open }"
        >
            <!-- Backdrop -->
            <div
                class="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                @click="handleClose"
            />

            <!-- Panel -->
            <div
                class="absolute inset-y-0 right-0 flex"
                :class="isFullscreen ? 'inset-x-0' : 'max-w-5xl w-full'"
            >
                <div class="flex h-full flex-col bg-white dark:bg-gray-900 shadow-2xl w-full">
                    <!-- Header -->
                    <div
                        class="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 px-4 py-3"
                    >
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                                    결과 미리보기
                                </h2>
                                <span class="text-sm text-gray-500 dark:text-gray-400">
                                    {{ task?.title }}
                                </span>
                                <!-- Format Badge -->
                                <span
                                    class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300"
                                >
                                    <svg
                                        class="w-3 h-3"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            :d="formatIcon"
                                        />
                                    </svg>
                                    {{ formatDisplayName }}
                                </span>
                            </div>

                            <div class="flex items-center gap-2">
                                <!-- Zoom Controls -->
                                <div
                                    class="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg"
                                >
                                    <button
                                        class="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                                        @click="handleZoomOut"
                                    >
                                        <svg
                                            class="w-4 h-4 text-gray-600 dark:text-gray-400"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M20 12H4"
                                            />
                                        </svg>
                                    </button>
                                    <span
                                        class="text-xs text-gray-600 dark:text-gray-400 w-10 text-center"
                                        >{{ zoomLevel }}%</span
                                    >
                                    <button
                                        class="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                                        @click="handleZoomIn"
                                    >
                                        <svg
                                            class="w-4 h-4 text-gray-600 dark:text-gray-400"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M12 4v16m8-8H4"
                                            />
                                        </svg>
                                    </button>
                                </div>

                                <!-- Fullscreen Toggle -->
                                <button
                                    class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                                    @click="toggleFullscreen"
                                    title="전체화면"
                                >
                                    <svg
                                        class="w-5 h-5 text-gray-600 dark:text-gray-400"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            v-if="!isFullscreen"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                                        />
                                        <path
                                            v-else
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M9 9L4 4m0 0v4m0-4h4m11 5l-5 5m5-5v4m0-4h-4M9 20l-5-5m5 5v-4m0 4H5m14-4l5 5m-5-5v4m0-4h4"
                                        />
                                    </svg>
                                </button>

                                <!-- Version History -->
                                <button
                                    class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                                    @click="showVersionHistory = !showVersionHistory"
                                    title="버전 기록"
                                >
                                    <svg
                                        class="w-5 h-5 text-gray-600 dark:text-gray-400"
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
                                </button>

                                <!-- Close -->
                                <button
                                    class="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                                    @click="handleClose"
                                    title="닫기"
                                >
                                    <svg
                                        class="w-5 h-5 text-gray-600 dark:text-gray-400"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M6 18L18 6M6 6l12 12"
                                        />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Main Content -->
                    <div class="flex-1 flex overflow-hidden pb-10">
                        <!-- Preview Area -->
                        <div class="flex-1 flex flex-col overflow-hidden">
                            <!-- File Info Bar -->
                            <div
                                class="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
                            >
                                <div class="flex items-center gap-3">
                                    <svg
                                        class="w-5 h-5 text-gray-500"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            :d="formatIcon"
                                        />
                                    </svg>
                                    <span class="font-medium text-gray-900 dark:text-white">
                                        {{ formatDisplayName }} 형식
                                    </span>
                                    <span
                                        v-if="outputFormat === 'code'"
                                        class="text-sm text-gray-500 dark:text-gray-400"
                                    >
                                        ({{ codeLanguage }})
                                    </span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button
                                        class="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                        :class="{
                                            'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300':
                                                copySuccess,
                                        }"
                                        @click="copyToClipboard"
                                    >
                                        <svg
                                            v-if="!copySuccess"
                                            class="w-4 h-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                                            />
                                        </svg>
                                        <svg
                                            v-else
                                            class="w-4 h-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M5 13l4 4L19 7"
                                            />
                                        </svg>
                                        {{ copySuccess ? '복사됨!' : '복사' }}
                                    </button>
                                    <button
                                        class="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                                        @click="handleDownload"
                                    >
                                        <svg
                                            class="w-4 h-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                            />
                                        </svg>
                                        다운로드
                                    </button>
                                </div>
                            </div>

                            <!-- Content Viewer -->
                            <div
                                class="flex-1 overflow-auto p-4"
                                :style="{ fontSize: `${zoomLevel}%` }"
                            >
                                <!-- No Content -->
                                <div
                                    v-if="!content"
                                    class="h-full flex items-center justify-center"
                                >
                                    <div class="text-center text-gray-500 dark:text-gray-400">
                                        <svg
                                            class="w-16 h-16 mx-auto mb-4 opacity-50"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                            />
                                        </svg>
                                        <p class="text-lg font-medium">결과물이 없습니다</p>
                                        <p class="text-sm mt-1">
                                            태스크가 실행되면 결과가 여기에 표시됩니다.
                                        </p>
                                    </div>
                                </div>

                                <!-- Text View -->
                                <div v-else-if="outputFormat === 'text'" class="h-full">
                                    <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
                                        <pre
                                            class="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap font-mono"
                                            >{{ content }}</pre
                                        >
                                    </div>
                                </div>

                                <!-- Markdown View -->
                                <div v-else-if="outputFormat === 'markdown'" class="h-full">
                                    <div
                                        class="prose dark:prose-invert max-w-none bg-gray-800 rounded-lg p-6"
                                    >
                                        <div v-html="markdownHtml" class="markdown-content" />
                                    </div>
                                </div>

                                <!-- HTML View -->
                                <div v-else-if="outputFormat === 'html'" class="h-full">
                                    <div
                                        class="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
                                    >
                                        <div
                                            class="mb-4 text-xs text-gray-500 dark:text-gray-400 pb-2 border-b border-gray-200 dark:border-gray-700"
                                        >
                                            HTML 미리보기
                                        </div>
                                        <iframe
                                            :srcdoc="content"
                                            class="w-full h-[calc(100%-2rem)] min-h-[400px] bg-white rounded border border-gray-200"
                                            sandbox="allow-scripts"
                                        />
                                    </div>
                                </div>

                                <!-- JSON View -->
                                <div v-else-if="outputFormat === 'json'" class="h-full">
                                    <div class="bg-gray-900 rounded-lg p-4 overflow-auto space-y-4">
                                        <div
                                            v-if="jsonMarkdownHtml"
                                            class="prose dark:prose-invert max-w-none"
                                        >
                                            <div
                                                v-html="jsonMarkdownHtml"
                                                class="markdown-content"
                                            />
                                        </div>
                                        <div v-else-if="parsedJsonData">
                                            <pre
                                                class="text-sm font-mono"
                                                v-html="renderJsonTree(parsedJsonData)"
                                            />
                                        </div>
                                        <pre
                                            v-else
                                            class="text-sm font-mono text-gray-100 whitespace-pre-wrap"
                                            >{{ content }}</pre
                                        >
                                    </div>
                                </div>

                                <!-- YAML View -->
                                <div v-else-if="outputFormat === 'yaml'" class="h-full">
                                    <div class="bg-gray-900 rounded-lg overflow-hidden">
                                        <div class="flex">
                                            <div
                                                class="flex-shrink-0 px-4 py-4 text-right select-none bg-gray-800"
                                            >
                                                <div
                                                    v-for="(_, index) in content.split('\n')"
                                                    :key="index"
                                                    class="text-gray-500 text-sm font-mono leading-6"
                                                >
                                                    {{ index + 1 }}
                                                </div>
                                            </div>
                                            <div class="flex-1 px-4 py-4 overflow-x-auto">
                                                <pre
                                                    class="text-sm font-mono leading-6 language-yaml"
                                                ><code class="text-gray-100">{{ content }}</code></pre>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- CSV View -->
                                <div
                                    v-else-if="outputFormat === 'csv' && parsedCsvData"
                                    class="h-full overflow-auto"
                                >
                                    <table class="min-w-full border-collapse">
                                        <thead class="bg-gray-100 dark:bg-gray-800 sticky top-0">
                                            <tr>
                                                <th
                                                    v-for="header in parsedCsvData.headers"
                                                    :key="header"
                                                    class="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700"
                                                >
                                                    {{ header }}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody
                                            class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700"
                                        >
                                            <tr
                                                v-for="(row, rowIndex) in parsedCsvData.rows"
                                                :key="rowIndex"
                                                class="hover:bg-gray-50 dark:hover:bg-gray-800"
                                            >
                                                <td
                                                    v-for="(cell, cellIndex) in row"
                                                    :key="cellIndex"
                                                    class="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 whitespace-nowrap"
                                                >
                                                    {{ cell }}
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                <!-- SQL View -->
                                <div v-else-if="outputFormat === 'sql'" class="h-full">
                                    <div class="bg-gray-900 rounded-lg overflow-hidden">
                                        <div class="flex">
                                            <div
                                                class="flex-shrink-0 px-4 py-4 text-right select-none bg-gray-800"
                                            >
                                                <div
                                                    v-for="(_, index) in content.split('\n')"
                                                    :key="index"
                                                    class="text-gray-500 text-sm font-mono leading-6"
                                                >
                                                    {{ index + 1 }}
                                                </div>
                                            </div>
                                            <div class="flex-1 px-4 py-4 overflow-x-auto">
                                                <pre
                                                    class="text-sm font-mono leading-6"
                                                ><code class="text-blue-300">{{ content }}</code></pre>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Shell Script View -->
                                <div v-else-if="outputFormat === 'shell'" class="h-full">
                                    <div class="bg-gray-900 rounded-lg overflow-hidden">
                                        <div
                                            class="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700"
                                        >
                                            <div class="flex gap-1.5">
                                                <div class="w-3 h-3 rounded-full bg-red-500" />
                                                <div class="w-3 h-3 rounded-full bg-yellow-500" />
                                                <div class="w-3 h-3 rounded-full bg-green-500" />
                                            </div>
                                            <span class="text-xs text-gray-400 font-mono"
                                                >terminal</span
                                            >
                                        </div>
                                        <div class="flex">
                                            <div
                                                class="flex-shrink-0 px-4 py-4 text-right select-none bg-gray-800/50"
                                            >
                                                <div
                                                    v-for="(_, index) in content.split('\n')"
                                                    :key="index"
                                                    class="text-gray-500 text-sm font-mono leading-6"
                                                >
                                                    {{ index + 1 }}
                                                </div>
                                            </div>
                                            <div class="flex-1 px-4 py-4 overflow-x-auto">
                                                <pre
                                                    class="text-sm font-mono leading-6"
                                                ><code class="text-green-400">{{ content }}</code></pre>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Mermaid Diagram View -->
                                <div v-else-if="outputFormat === 'mermaid'" class="h-full">
                                    <div class="bg-gray-800 rounded-lg p-6 overflow-auto">
                                        <div
                                            v-if="renderedMermaid"
                                            v-html="renderedMermaid"
                                            class="flex justify-center mermaid-container"
                                        />
                                        <div v-else class="flex items-center justify-center h-64">
                                            <div
                                                class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"
                                            />
                                        </div>
                                        <details class="mt-4">
                                            <summary
                                                class="text-sm text-gray-400 cursor-pointer hover:text-gray-300"
                                            >
                                                소스 코드 보기
                                            </summary>
                                            <pre
                                                class="mt-2 text-sm font-mono text-gray-300 bg-gray-900 p-4 rounded overflow-x-auto"
                                                >{{ content }}</pre
                                            >
                                        </details>
                                    </div>
                                </div>

                                <!-- SVG View -->
                                <div
                                    v-else-if="outputFormat === 'svg'"
                                    class="h-full flex flex-col"
                                >
                                    <div
                                        class="flex-1 bg-gray-800 rounded-lg p-6 flex items-center justify-center overflow-auto"
                                    >
                                        <div
                                            v-html="content"
                                            class="max-w-full max-h-full svg-container"
                                        />
                                    </div>
                                    <details class="mt-4">
                                        <summary
                                            class="text-sm text-gray-400 cursor-pointer hover:text-gray-300"
                                        >
                                            SVG 소스 보기
                                        </summary>
                                        <pre
                                            class="mt-2 text-sm font-mono text-gray-300 bg-gray-900 p-4 rounded overflow-x-auto max-h-48"
                                            >{{ content }}</pre
                                        >
                                    </details>
                                </div>

                                <!-- PNG/Image View -->
                                <div
                                    v-else-if="outputFormat === 'png'"
                                    class="h-full flex items-center justify-center"
                                >
                                    <img
                                        :src="
                                            content.startsWith('data:')
                                                ? content
                                                : `data:image/png;base64,${content}`
                                        "
                                        alt="Result Image"
                                        class="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                                    />
                                </div>

                                <!-- MP4 Video View -->
                                <div
                                    v-else-if="outputFormat === 'mp4'"
                                    class="h-full flex items-center justify-center"
                                >
                                    <video
                                        controls
                                        class="max-w-full max-h-full rounded-lg shadow-lg"
                                    >
                                        <source
                                            :src="
                                                content.startsWith('data:')
                                                    ? content
                                                    : `data:video/mp4;base64,${content}`
                                            "
                                            type="video/mp4"
                                        />
                                        브라우저가 비디오 재생을 지원하지 않습니다.
                                    </video>
                                </div>

                                <!-- MP3 Audio View -->
                                <div
                                    v-else-if="outputFormat === 'mp3'"
                                    class="h-full flex items-center justify-center"
                                >
                                    <div class="bg-gray-800 rounded-xl p-8 w-full max-w-md">
                                        <div class="flex items-center justify-center mb-6">
                                            <div
                                                class="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center"
                                            >
                                                <svg
                                                    class="w-12 h-12 text-white"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        stroke-width="2"
                                                        d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                                                    />
                                                </svg>
                                            </div>
                                        </div>
                                        <audio controls class="w-full">
                                            <source
                                                :src="
                                                    content.startsWith('data:')
                                                        ? content
                                                        : `data:audio/mpeg;base64,${content}`
                                                "
                                                type="audio/mpeg"
                                            />
                                            브라우저가 오디오 재생을 지원하지 않습니다.
                                        </audio>
                                    </div>
                                </div>

                                <!-- Diff View -->
                                <div v-else-if="outputFormat === 'diff'" class="h-full">
                                    <div class="bg-gray-900 rounded-lg overflow-hidden">
                                        <div class="flex">
                                            <div
                                                class="flex-shrink-0 px-4 py-4 text-right select-none bg-gray-800"
                                            >
                                                <div
                                                    v-for="(_, index) in parsedDiffLines"
                                                    :key="index"
                                                    class="text-gray-500 text-sm font-mono leading-6"
                                                >
                                                    {{ index + 1 }}
                                                </div>
                                            </div>
                                            <div class="flex-1 py-4 overflow-x-auto">
                                                <div
                                                    v-for="(line, index) in parsedDiffLines"
                                                    :key="index"
                                                    class="px-4 text-sm font-mono leading-6"
                                                    :class="{
                                                        'bg-green-900/50 text-green-300':
                                                            line.type === 'added',
                                                        'bg-red-900/50 text-red-300':
                                                            line.type === 'removed',
                                                        'bg-blue-900/30 text-blue-300':
                                                            line.type === 'header',
                                                        'text-gray-300': line.type === 'normal',
                                                    }"
                                                >
                                                    {{ line.text }}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Log View -->
                                <div v-else-if="outputFormat === 'log'" class="h-full">
                                    <div class="bg-gray-900 rounded-lg overflow-hidden">
                                        <div
                                            class="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700"
                                        >
                                            <span class="text-sm text-gray-400">로그 뷰어</span>
                                            <div class="flex items-center gap-2 text-xs">
                                                <span class="flex items-center gap-1"
                                                    ><span
                                                        class="w-2 h-2 rounded-full bg-red-500"
                                                    />
                                                    Error</span
                                                >
                                                <span class="flex items-center gap-1"
                                                    ><span
                                                        class="w-2 h-2 rounded-full bg-yellow-500"
                                                    />
                                                    Warn</span
                                                >
                                                <span class="flex items-center gap-1"
                                                    ><span
                                                        class="w-2 h-2 rounded-full bg-blue-500"
                                                    />
                                                    Info</span
                                                >
                                                <span class="flex items-center gap-1"
                                                    ><span
                                                        class="w-2 h-2 rounded-full bg-gray-500"
                                                    />
                                                    Debug</span
                                                >
                                            </div>
                                        </div>
                                        <div class="flex">
                                            <div
                                                class="flex-shrink-0 px-4 py-4 text-right select-none bg-gray-800/50"
                                            >
                                                <div
                                                    v-for="(_, index) in parsedLogLines"
                                                    :key="index"
                                                    class="text-gray-500 text-sm font-mono leading-6"
                                                >
                                                    {{ index + 1 }}
                                                </div>
                                            </div>
                                            <div class="flex-1 py-4 overflow-x-auto">
                                                <div
                                                    v-for="(line, index) in parsedLogLines"
                                                    :key="index"
                                                    class="px-4 text-sm font-mono leading-6"
                                                    :class="{
                                                        'text-red-400': line.level === 'error',
                                                        'text-yellow-400': line.level === 'warn',
                                                        'text-blue-400': line.level === 'info',
                                                        'text-gray-500': line.level === 'debug',
                                                        'text-gray-300': line.level === 'normal',
                                                    }"
                                                >
                                                    {{ line.text }}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Code View -->
                                <div v-else-if="outputFormat === 'code'" class="h-full">
                                    <div class="bg-gray-900 rounded-lg overflow-hidden">
                                        <div
                                            class="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700"
                                        >
                                            <span class="text-sm text-gray-400 font-mono">{{
                                                codeLanguage
                                            }}</span>
                                        </div>
                                        <div class="flex">
                                            <div
                                                class="flex-shrink-0 px-4 py-4 text-right select-none bg-gray-800"
                                            >
                                                <div
                                                    v-for="(_, index) in content.split('\n')"
                                                    :key="index"
                                                    class="text-gray-500 text-sm font-mono leading-6"
                                                >
                                                    {{ index + 1 }}
                                                </div>
                                            </div>
                                            <div class="flex-1 px-4 py-4 overflow-x-auto">
                                                <pre
                                                    class="text-sm font-mono leading-6"
                                                    :class="syntaxHighlightClass"
                                                ><code class="text-gray-100">{{ content }}</code></pre>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- PDF View (placeholder - actual PDF rendering would need a library) -->
                                <div
                                    v-else-if="outputFormat === 'pdf'"
                                    class="h-full flex items-center justify-center"
                                >
                                    <div class="text-center text-gray-500 dark:text-gray-400">
                                        <svg
                                            class="w-16 h-16 mx-auto mb-4 text-red-500"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                                            />
                                        </svg>
                                        <p class="text-lg font-medium">PDF 파일</p>
                                        <p class="text-sm mt-1 mb-4">
                                            다운로드하여 PDF 뷰어에서 확인하세요.
                                        </p>
                                        <button
                                            class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                                            @click="handleDownload"
                                        >
                                            PDF 다운로드
                                        </button>
                                    </div>
                                </div>

                                <!-- Default/Unknown View -->
                                <div v-else class="h-full">
                                    <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
                                        <pre
                                            class="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap font-mono"
                                            >{{ content }}</pre
                                        >
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Version History Sidebar -->
                        <div
                            v-if="showVersionHistory"
                            class="w-64 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-y-auto"
                        >
                            <div class="p-4">
                                <h3
                                    class="text-sm font-semibold text-gray-900 dark:text-white mb-3"
                                >
                                    버전 기록
                                </h3>
                                <div class="space-y-2">
                                    <div
                                        v-for="i in 5"
                                        :key="i"
                                        class="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:border-blue-500 transition-colors"
                                    >
                                        <div class="flex items-center justify-between mb-1">
                                            <span
                                                class="text-sm font-medium text-gray-900 dark:text-white"
                                            >
                                                v{{ 6 - i }}.0
                                            </span>
                                            <span class="text-xs text-gray-500">
                                                {{ i === 1 ? '현재' : `${i * 2}시간 전` }}
                                            </span>
                                        </div>
                                        <p class="text-xs text-gray-500 dark:text-gray-400">
                                            {{ i === 1 ? '최신 버전' : `자동 저장 버전` }}
                                        </p>
                                        <div v-if="i > 1" class="mt-2">
                                            <button
                                                class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                                @click="emit('rollback', `v${6 - i}`)"
                                            >
                                                이 버전으로 복원
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Feedback Section -->
                    <div
                        class="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800 relative"
                        style="bottom: 30px"
                    >
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                        >
                            수정 요청
                        </label>
                        <textarea
                            v-model="feedback"
                            rows="2"
                            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                            placeholder="수정이 필요한 내용을 입력하세요..."
                        />
                    </div>

                    <!-- Actions -->
                    <div
                        class="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 px-4 py-3 sticky bg-gray-50 dark:bg-gray-800 z-10"
                        style="bottom: 30px"
                    >
                        <div class="flex items-center justify-between">
                            <button
                                class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                                @click="handleClose"
                            >
                                닫기
                            </button>
                            <div class="flex gap-2">
                                <button
                                    class="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                    :disabled="!feedback.trim()"
                                    @click="handleRetry"
                                >
                                    피드백과 함께 재시도
                                </button>
                                <button
                                    v-if="task?.status === 'in_review'"
                                    class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                                    @click="handleApprove"
                                >
                                    승인
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
/* Code syntax highlighting placeholders */
.language-typescript .keyword {
    color: #c586c0;
}
.language-typescript .string {
    color: #ce9178;
}
.language-typescript .comment {
    color: #6a9955;
}

/* Custom scrollbar */
.overflow-auto::-webkit-scrollbar,
.overflow-y-auto::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

.overflow-auto::-webkit-scrollbar-track,
.overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
}

.overflow-auto::-webkit-scrollbar-thumb,
.overflow-y-auto::-webkit-scrollbar-thumb {
    background: #4b5563;
    border-radius: 4px;
}

.overflow-auto::-webkit-scrollbar-thumb:hover,
.overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: #6b7280;
}

/* Mermaid container */
.mermaid-container :deep(svg) {
    max-width: 100%;
    height: auto;
}

/* SVG container */
.svg-container :deep(svg) {
    max-width: 100%;
    height: auto;
}

/* Markdown content styling */
.markdown-content :deep(h1),
.markdown-content :deep(h2),
.markdown-content :deep(h3) {
    color: white;
    margin-top: 1.5rem;
    margin-bottom: 0.75rem;
}

.markdown-content :deep(pre) {
    margin: 1rem 0;
}

.markdown-content :deep(code) {
    font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
    margin-left: 1.5rem;
    margin-bottom: 1rem;
}

.markdown-content :deep(li) {
    margin-bottom: 0.25rem;
}
</style>
