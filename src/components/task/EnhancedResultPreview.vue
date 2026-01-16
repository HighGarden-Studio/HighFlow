<script setup lang="ts">
/**
 * EnhancedResultPreview Component
 *
 * Multi-format result preview with syntax highlighting and optimal viewer per output format
 * Supports: text, markdown, html, pdf, json, yaml, csv, sql, shell, mermaid, svg, png, mp4, mp3, diff, log, code
 */
import { ref, computed, onMounted, watch, nextTick, onUnmounted } from 'vue';
import type { Task, TaskHistoryEntry } from '@core/types/database';
import type { AiResult, AiSubType } from '@core/types/ai';
import { extractTaskResult } from '../../renderer/utils/aiResultHelpers';
import { detectTextSubType } from '../../services/ai/utils/aiResultUtils';
import { marked } from 'marked';
import type { MarkedOptions, Tokens } from 'marked';
import FileTreeItem from './FileTreeItem.vue';
import { useProjectStore } from '../../renderer/stores/projectStore';
import { useTaskStore } from '../../renderer/stores/taskStore';
import { useActivityLogStore } from '../../renderer/stores/activityLogStore';
import { useMCPStore } from '../../renderer/stores/mcpStore';
import { Diff } from 'vue-diff';
import 'vue-diff/dist/index.css';
import CodeEditor from '../common/CodeEditor.vue';
import MCPToolExecutionLog, { type LogEntry as MCPLogEntry } from '../ai/MCPToolExecutionLog.vue';
import { useI18n } from 'vue-i18n';

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

// Custom Markdown Renderer
// Custom Markdown Renderer
// We must use marked.use() to ensure the parser is available in the renderer context when using the function syntax.
// However, since we are using marked.parse() directly in the component, we can pass the renderer in options.
// BUT, 'this.parser' on the renderer instance is NOT automatically populated by standard instantiation.
// The default Renderer class does not have a parser property.
// It is the Parser that calls the renderer.
// When using `marked.parse()`, it creates a Parser, which has a Renderer.
// If we override the renderer methods on an instance we pass in, `this` inside those methods refers to the renderer instance.
// But that renderer instance does NOT have `this.parser`.
// The only way to access the parser recursively is to use `marked.parse(content)` again? NO, that would be inefficient and lose context.
// In marked v12+, the suggested way to extend is via `marked.use({ renderer: ... })` or extensions.
// When we pass `renderer` in options to `marked.parse`, it uses THAT instance.
// But that instance doesn't have the parser attached.
//
// SOLUTION: We should NOT rely on `this.parser`.
// Instead, we should check if `token.tokens` exists. If so, we can simply run `marked.parseInline(token.tokens)` or similar?
// No, `marked.parseInline` takes text.
// We need to use `marked.parse(token.tokens)`? No, tokens.
//
// Actually, `marked` functions (parse, parseInline) can take tokens in recent versions?
// Let's check imports. We import `marked` from 'marked'.
// The `marked` object itself has `parser` method?
//
// If we look at marked documentation for v12+:
// renderer methods receive (token).
// To parse children: `this.parser.parse(token.items)`.
// BUT `this` must be the Parser instance or have access to it.
//
// If we use:
// `const renderer = new marked.Renderer();`
// `marked.use({ renderer });`
// Then when `marked.parse()` is called, it uses the key-value pairs from `renderer`.
//
// Let's try to remove `new marked.Renderer()` and instead create a plain object or extend via `use`.
//
// Wait, the ERROR "Error rendering markdown" comes from the try-catch block in `renderMarkdown`.
// It means an exception is THROWN.
// Most likely `this.parser` is undefined.
//
// FIX: We will implement a helper `parseTokens(tokens)` that uses `marked.parser(tokens)` if available,
// or fallback to a new `marked.parse`?
// `marked.parser(tokens)` is the static method to parse tokens!
//
// So we should replace `this.parser.parse(token.items)` with `marked.parser(token.items)`.
// And `this.parser.parseInline(token.tokens)` with `marked.parser(token.tokens)` (Parser handles both? No).
// `marked.parser` processes block tokens.
// For inline tokens, we might need `marked.parser(tokens)` too?
//
// Let's try replacing `this.parser.parse(...)` with `marked.parser(...)`.

const markdownRenderer = new marked.Renderer();
// @ts-ignore
const parseTokens = (tokens: any) => marked.parser(tokens);
// @ts-ignore
const parseInline = (tokens: any) => marked.parser(tokens); // In newer marked, parser handles inline too if structured correctly?
// Actually, `marked.parser` takes `src` (tokens).

// Headings
markdownRenderer.heading = function (this: any, token: Tokens.Heading | string, level?: number) {
    const text = typeof token === 'string' ? token : this.parser.parseInline(token.tokens);
    const depth = typeof token === 'string' ? level || 1 : token.depth;

    const sizes = {
        1: 'text-2xl font-bold mb-4 mt-6 pb-2 border-b border-gray-200 dark:border-gray-700',
        2: 'text-xl font-bold mb-3 mt-5 pb-1 border-b border-gray-100 dark:border-gray-800',
        3: 'text-lg font-bold mb-2 mt-4',
        4: 'text-base font-bold mb-2 mt-3',
        5: 'text-sm font-bold mb-1 mt-2',
        6: 'text-xs font-bold mb-1 mt-1',
    };
    const className = sizes[depth as keyof typeof sizes] || sizes[6];
    return `<h${depth} class="${className} text-gray-900 dark:text-gray-100">${text}</h${depth}>`;
};

// Paragraphs
markdownRenderer.paragraph = function (this: any, token: Tokens.Paragraph | string) {
    const text = typeof token === 'string' ? token : this.parser.parseInline(token.tokens);
    return `<p class="mb-4 text-gray-700 dark:text-gray-300 leading-relaxed">${text}</p>`;
};

markdownRenderer.code = function (this: any, token: Tokens.Code | string, language?: string) {
    const rawCode = typeof token === 'string' ? token : token.text;
    const rawLang = typeof token === 'string' ? language : token.lang;

    const lang = (rawLang || '').trim();
    const langClass = lang ? `language-${lang}` : '';

    return `<div class="relative group my-4 rounded-lg overflow-hidden bg-gray-800 border border-gray-700 shadow-sm code-block-trigger" data-language="${lang}">
        <div class="flex items-center justify-between px-4 py-2 bg-gray-700 border-b border-gray-600">
            <span class="text-xs font-medium text-gray-300 uppercase">${lang || 'text'}</span>
            <span class="text-xs text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity">Click to preview</span>
        </div>
        <pre class="p-4 overflow-x-auto m-0"><code class="${langClass} text-sm font-mono text-gray-100 block">${escapeHtml(
            rawCode
        )}</code></pre>
    </div>`;
};

// Inline Code
markdownRenderer.codespan = function (this: any, token: Tokens.Codespan | string) {
    const text = typeof token === 'string' ? token : token.text;
    return `<code class="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-pink-500 font-mono text-sm border border-gray-200 dark:border-gray-700">${text}</code>`;
};

// Links
markdownRenderer.link = function (
    this: any,
    token: Tokens.Link | string,
    title?: string | null,
    text?: string
) {
    let href = '';
    let linkTitle = '';
    let linkText = '';

    if (typeof token === 'string') {
        href = token;
        linkTitle = title || '';
        linkText = text || '';
    } else {
        href = token.href;
        linkTitle = token.title || '';
        linkText = this.parser.parseInline(token.tokens);
    }

    return `<a href="${href}" title="${linkTitle}" class="text-blue-500 hover:underline" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
};

// HR
markdownRenderer.hr = () => {
    return `<hr class="my-6 border-gray-200 dark:border-gray-700" />`;
};

const markedOptions: MarkedOptions = {
    renderer: markdownRenderer,
    gfm: true,
    breaks: true,
};

interface Props {
    task: Task | null;
    open: boolean;
    taskId?: number; // Explicit ID prop
}

const props = defineProps<Props>();
const { t } = useI18n();

// MCP Tool Execution Logs
const projectStore = useProjectStore();
const taskStore = useTaskStore();
const activityLogStore = useActivityLogStore();
const mcpStore = useMCPStore();

// MCP Tool Execution Logs
const mcpLogs = computed<MCPLogEntry[]>(() => {
    // Determine ID reliably
    const pid = props.task?.projectId;
    const seq = props.task?.projectSequence;

    // Fallback if unavailable (should verify where taskId prop comes from)
    if (!pid || !seq) return [];

    // Map store executions to LogEntry format (checking compatibility)
    // MCPExecution and LogEntry interfaces are identical in structure so casting/mapping is trivial
    return mcpStore.getExecutions(pid, seq).map((e) => ({
        ...e,
        // duration in store is string "123ms" or undefined, component expects string
    }));
});

// Resolve Task ID reliably
const resolvedTaskId = computed(() => {
    if (props.taskId) return props.taskId;
    return props.task?.id;
});

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'retry', task: Task, feedback: string): void;
    (e: 'approve', task: Task): void;
    (e: 'download'): void;
    (e: 'rollback', versionId: string): void;
}>();

const bottomOffset = computed(() => {
    const headerHeight = 40;
    if (activityLogStore.isConsoleOpen) {
        return `${headerHeight + activityLogStore.consoleHeight}px`;
    }
    return `${headerHeight}px`;
});

// State
const zoomLevel = ref(100);
const isFullscreen = ref(false);
const feedback = ref('');
const showVersionHistory = ref(false);
const renderedMermaid = ref('');
const copySuccess = ref(false);
const markdownHtml = ref('');
const isAutoScrollActive = ref(false);
const contentContainer = ref<HTMLElement | null>(null);

const scrollToBottom = () => {
    if (!isAutoScrollActive.value || !contentContainer.value) return;
    const el = contentContainer.value;
    nextTick(() => {
        el.scrollTop = el.scrollHeight;
    });
};

const toggleAutoScroll = () => {
    isAutoScrollActive.value = !isAutoScrollActive.value;
    if (isAutoScrollActive.value) {
        scrollToBottom();
    }
};

watch(
    () => props.task?.outputConfig?.localFile?.accumulateResults,
    (val) => {
        if (val) isAutoScrollActive.value = true;
    },
    { immediate: true }
);

// History state
const history = ref<TaskHistoryEntry[]>([]);
const selectedVersionId = ref<number | null>(null);
const selectedFile = ref<ResultFile | null>(null);

// Resize & Layout State
const panelWidth = ref(70); // Default 70%
const isResizing = ref(false);
const isPreviewMaximized = ref(false);

const startResize = (e: MouseEvent) => {
    e.preventDefault(); // Prevent text selection
    isResizing.value = true;
    window.addEventListener('mousemove', doResize);
    window.addEventListener('mouseup', stopResize);
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
};

const doResize = (e: MouseEvent) => {
    if (!isResizing.value) return;
    const windowWidth = window.innerWidth;
    // Calculate width as percentage from RIGHT edge
    const newWidth = ((windowWidth - e.clientX) / windowWidth) * 100;
    panelWidth.value = Math.max(30, Math.min(100, newWidth));
};

const stopResize = () => {
    isResizing.value = false;
    window.removeEventListener('mousemove', doResize);
    window.removeEventListener('mouseup', stopResize);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
};

const toggleMaximize = () => {
    isPreviewMaximized.value = !isPreviewMaximized.value;
};

const currentProject = computed(() => projectStore.currentProject);

// Tree View State
const isTreeView = ref(true);

// Feedback Comment State
interface FeedbackComment {
    id: string;
    type: 'code' | 'text';
    file?: string;
    range?: any;
    selection: string;
    comment: string;
}
const feedbackItems = ref<FeedbackComment[]>([]);
const isCommentModalOpen = ref(false);
const pendingComment = ref<Partial<FeedbackComment> | null>(null);
const newCommentText = ref('');

function handleAddCodeComment(payload: { range: any; text: string }) {
    pendingComment.value = {
        type: 'code',
        file: selectedFile.value?.path,
        range: payload.range,
        selection: payload.text,
    };
    newCommentText.value = '';
    isCommentModalOpen.value = true;
}

function handleMarkdownMouseUp() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    // Check if selection is within markdown content (simple check using active element or just assume scoped if triggered inside component)
    // Ideally check if anchorNode is inside .markdown-content, but here we can just capture text
    const text = selection.toString().trim();
    if (!text) return;

    pendingComment.value = {
        type: 'text',
        file: selectedFile.value?.path,
        selection: text,
    };
    newCommentText.value = '';
    isCommentModalOpen.value = true;
}

function saveComment() {
    if (!pendingComment.value || !newCommentText.value.trim()) return;

    feedbackItems.value.push({
        id: Date.now().toString(),
        type: pendingComment.value.type as 'code' | 'text',
        file: pendingComment.value.file,
        range: pendingComment.value.range,
        selection: pendingComment.value.selection || '',
        comment: newCommentText.value,
    });

    closeCommentModal();
}

function closeCommentModal() {
    isCommentModalOpen.value = false;
    pendingComment.value = null;
    document.getSelection()?.removeAllRanges(); // Clear selection
}

function removeComment(id: string) {
    const index = feedbackItems.value.findIndex((c) => c.id === id);
    if (index !== -1) feedbackItems.value.splice(index, 1);
}

interface FileTreeNode {
    name: string;
    path: string; // Full path for files, current folder path for folders
    type: 'file' | 'folder';
    status?: 'created' | 'modified'; // Only for files
    children?: FileTreeNode[]; // Only for folders
}

// Build File Tree
const fileTree = computed(() => {
    const files = resultFiles.value;
    const rootNodes: FileTreeNode[] = [];

    if (files.length === 0) return rootNodes;

    // Helper to find or create a folder node
    const findOrCreateFolder = (
        parentChildren: FileTreeNode[],
        name: string,
        fullPath: string
    ): FileTreeNode => {
        let node = parentChildren.find((n) => n.name === name && n.type === 'folder');
        if (!node) {
            node = {
                name,
                path: fullPath,
                type: 'folder',
                children: [],
            };
            parentChildren.push(node);
        }
        return node;
    };

    // Sort nodes helper
    const sortNodes = (nodes: FileTreeNode[]) => {
        nodes.sort((a, b) => {
            if (a.type === b.type) {
                // Reverse sort by name (descending) to show newest files first if named by date/seq
                return b.name.localeCompare(a.name);
            }
            return a.type === 'folder' ? -1 : 1;
        });
        nodes.forEach((node) => {
            if (node.children) {
                sortNodes(node.children);
            }
        });
    };

    // Determine Root Path for Project Files
    let rootPath = (currentProject.value?.baseDevFolder || '').replace(/[/\\]$/, '');

    // Separate files
    const projectRootChildren: FileTreeNode[] = [];
    const externalFiles: { path: string; file: any }[] = [];

    files.forEach((file) => {
        // Check if file is inside project root
        if (rootPath && file.path.startsWith(rootPath)) {
            const relativePath = file.path.substring(rootPath.length).replace(/^[/\\]/, '');
            const parts = relativePath.split(/[/\\]/);

            let currentLevel = projectRootChildren;
            let currentPath = rootPath;

            parts.forEach((part, index) => {
                if (!part) return;
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                const isLast = index === parts.length - 1;

                if (isLast) {
                    currentLevel.push({
                        name: part,
                        path: file.path,
                        type: 'file',
                        status: file.type,
                        children: [],
                    });
                } else {
                    const folder = findOrCreateFolder(currentLevel, part, currentPath);
                    currentLevel = folder.children!;
                }
            });
        } else {
            // Outside project root
            externalFiles.push({ path: file.path, file });
        }
    });

    sortNodes(projectRootChildren);

    // Build Project Root Node
    if (projectRootChildren.length > 0) {
        const pathParts = rootPath.split(/[/\\]/).filter((p) => p);
        const rootName =
            pathParts.length > 0
                ? pathParts[pathParts.length - 1]
                : currentProject.value?.title || 'Project Root';

        const projectNode: FileTreeNode = {
            name: rootName,
            path: rootPath,
            type: 'folder',
            children: projectRootChildren,
            status: undefined,
        };
        rootNodes.push(projectNode);
    }

    // Process External Files (Group by common prefix)
    if (externalFiles.length > 0) {
        // Simple common prefix detection
        const paths = externalFiles.map((f) => f.path);
        const splitPaths = paths.map((p) => p.split(/[/\\]/));
        let commonPrefixParts: string[] = splitPaths[0] || [];

        for (let i = 1; i < splitPaths.length; i++) {
            const current = splitPaths[i];
            let j = 0;
            while (
                j < commonPrefixParts.length &&
                j < current.length &&
                commonPrefixParts[j] === current[j]
            ) {
                j++;
            }
            commonPrefixParts = commonPrefixParts.slice(0, j);
        }

        const commonPrefix = commonPrefixParts.join('/');
        const externalRootChildren: FileTreeNode[] = [];

        externalFiles.forEach(({ path: filePath, file }) => {
            let relativePath = filePath;
            let effectiveRoot = '';

            // If we have a common prefix, strip it to avoid showing empty top folders
            if (commonPrefix && filePath.startsWith(commonPrefix)) {
                relativePath = filePath.substring(commonPrefix.length).replace(/^[/\\]/, '');
                effectiveRoot = commonPrefix;
            } else {
                relativePath = filePath.replace(/^[/\\]/, '');
                effectiveRoot = '';
            }

            const parts = relativePath.split(/[/\\]/).filter((p) => p);
            let currentLevel = externalRootChildren;
            let currentPath = effectiveRoot;

            parts.forEach((part, index) => {
                if (currentPath) {
                    currentPath =
                        currentPath.endsWith('/') || currentPath.endsWith('\\')
                            ? `${currentPath}${part}`
                            : `${currentPath}/${part}`;
                } else {
                    currentPath = part;
                }

                const isLast = index === parts.length - 1;

                if (isLast) {
                    currentLevel.push({
                        name: part,
                        path: filePath,
                        type: 'file',
                        status: file.type,
                        children: [],
                    });
                } else {
                    const folder = findOrCreateFolder(currentLevel, part, currentPath);
                    currentLevel = folder.children!;
                }
            });
        });

        sortNodes(externalRootChildren);

        if (externalRootChildren.length > 0) {
            if (commonPrefix) {
                const prefixParts = commonPrefixParts.filter((p) => p);
                const folderName =
                    prefixParts.length > 0
                        ? prefixParts[prefixParts.length - 1]
                        : 'External Output';

                rootNodes.push({
                    name: folderName,
                    path: commonPrefix,
                    type: 'folder',
                    children: externalRootChildren,
                    status: undefined,
                });
            } else {
                externalRootChildren.forEach((n) => rootNodes.push(n));
            }
        }
    }

    sortNodes(rootNodes);

    return rootNodes;
});

const onTreeSelect = (path: string) => {
    const file = resultFiles.value.find((f) => f.path === path);
    if (file) {
        selectedFile.value = file;
    }
};

const fetchHistory = async () => {
    // Use composite key check
    if (!props.task?.projectId || !props.task?.projectSequence) return;
    try {
        console.log('[EnhancedResultPreview] Fetching history entries for task (composite):', {
            pid: props.task.projectId,
            seq: props.task.projectSequence,
        });
        const entries = await (window as any).electron.taskHistory.getByTask(
            props.task.projectId,
            props.task.projectSequence
        );
        console.log('[EnhancedResultPreview] Received history entries:', {
            totalEntries: entries?.length || 0,
            entries: entries?.map((e: any) => ({
                id: e.id,
                eventType: e.eventType,
                createdAt: e.createdAt,
            })),
        });
        // Filter for execution completions
        // Filter for execution completions or failures
        history.value = entries
            .filter(
                (e: TaskHistoryEntry) =>
                    e.eventType === 'execution_completed' || e.eventType === 'execution_failed'
            )
            .sort(
                (a: any, b: any) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
        console.log(
            '[EnhancedResultPreview] Filtered execution_completed entries:',
            history.value.length
        );

        // For Output tasks, log the first entry details
        if (props.task.taskType === 'output' && history.value.length > 0) {
            const firstEntry = history.value[0];
            let eventData = firstEntry.eventData;
            if (typeof eventData === 'string') {
                try {
                    eventData = JSON.parse(eventData);
                } catch (e) {}
            }
            console.log('[EnhancedResultPreview] First history entry for Output task:', {
                eventData: eventData,
                hasExecutionResult: !!eventData?.executionResult,
                hasFilePath: !!eventData?.executionResult?.filePath,
                hasResult: !!eventData?.result,
            });
        }
    } catch (error: any) {
        console.error('Failed to fetch task history:', error);
    }
};

// Mark as read when opening preview if unread
watch(
    () => props.task,
    (newTask) => {
        if (newTask && newTask.hasUnreadResult && newTask.projectId && newTask.projectSequence) {
            console.log(`[EnhancedResultPreview] Marking task ${newTask.projectSequence} as read`);
            taskStore.markResultAsRead(newTask.projectId, newTask.projectSequence);
        }
    },
    { immediate: true, deep: true }
);

const handleViewVersion = (version: TaskHistoryEntry) => {
    selectedVersionId.value = version.id;
};

const handleResetVersion = () => {
    selectedVersionId.value = null;
};

const taskResult = computed(() => {
    const result = extractTaskResult(props.task as any);
    console.log('[EnhancedResultPreview] taskResult extracted:', {
        hasAiResult: !!result.aiResult,
        aiResultKind: result.aiResult?.kind,
        aiResultSubType: result.aiResult?.subType,
        aiResultFormat: result.aiResult?.format,
        contentLength: result.content?.length,
        contentPreview: result.content?.substring(0, 100),
        provider: result.provider,
        model: result.model,
    });
    return result;
});
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

const fallbackResultContent = computed(() => {
    // If task has content, use it
    if (taskResult.value.content) {
        return taskResult.value.content;
    }

    // Otherwise, try to get from latest history
    if (history.value.length > 0) {
        // history is already sorted in fetchHistory
        const lastEntry = history.value[0];
        if (lastEntry.eventData) {
            // Handle parsing if string
            let data = lastEntry.eventData;
            if (typeof data === 'string') {
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    console.error('Failed to parse history eventData:', e);
                }
            }

            if (data.content) return data.content;
            if (data.error) return `Error: ${data.error}`;
        }
    }

    return '';
});

watch(
    () => [fallbackResultContent.value, markdownHtml.value],
    () => {
        if (isAutoScrollActive.value) {
            scrollToBottom();
        }
    }
);

// State for Code Preview Drawer
const selectedCodeBlock = ref<{
    code: string;
    language: string;
} | null>(null);

// Tab state for drawer
const drawerTab = ref<'code' | 'preview'>('code');
const drawerMermaidSvg = ref<string>('');

// Watch selectedCodeBlock to reset tab or default to preview for HTML/Mermaid
watch(
    () => selectedCodeBlock.value,
    (newValue) => {
        if (newValue && (newValue.language === 'html' || newValue.language === 'mermaid')) {
            drawerTab.value = 'preview';
        } else {
            drawerTab.value = 'code';
        }
    }
);

// Watch for Drawer Mermaid Rendering
watch([() => selectedCodeBlock.value, drawerTab], async ([block, tab]) => {
    if (block?.language === 'mermaid' && tab === 'preview') {
        await renderDrawerMermaid();
    }
});

// Get output format from selected file or task
const outputFormat = computed<OutputFormat>(() => {
    if (selectedFile.value) {
        return getFormatFromExtension(selectedFile.value.extension);
    }

    // Always use markdown for AI Result view (when no file selected)
    // BUT check for image content first
    // Use AI Metadata if available
    // Use AI Metadata if available
    if (
        aiResult.value?.subType &&
        (OUTPUT_FORMAT_VALUES as ReadonlyArray<string>).includes(aiResult.value.subType)
    ) {
        let format = aiResult.value.subType as OutputFormat;
        const contentVal = fallbackResultContent.value;
        // Always treat 'text' as markdown for better rendering
        if (format === 'text') {
            format = 'markdown';
        }
        // Check for mixed content (code blocks) in html to force markdown
        else if (format === 'html' && contentVal) {
            if (/```[\s\S]+```/.test(contentVal)) {
                format = 'markdown';
            }
        }
        return format;
    }

    // Default heuristics based on content
    const content = fallbackResultContent.value;
    if (content) {
        if (/```[\s\S]+```/.test(content)) return 'markdown';

        // Auto-detect format from content
        const detection = detectTextSubType(content);
        if (
            detection.subType === 'mermaid' ||
            detection.subType === 'html' ||
            detection.subType === 'svg'
        ) {
            return detection.subType as OutputFormat;
        }
    }

    return 'markdown';
});

// Get code language if output format is 'code'
const codeLanguage = computed(() => {
    if (selectedFile.value) {
        const ext = selectedFile.value.extension?.toLowerCase().replace(/^\./, '');
        const langMap: Record<string, string> = {
            js: 'javascript',
            ts: 'typescript',
            py: 'python',
            vue: 'vue',
            jsx: 'javascript',
            tsx: 'typescript',
            html: 'html',
            css: 'css',
            scss: 'scss',
            json: 'json',
            yaml: 'yaml',
            xml: 'xml',
            sh: 'bash',
            sql: 'sql',
        };
        return langMap[ext || ''] || ext || 'plaintext';
    }

    if (aiResult.value?.meta?.language) {
        return aiResult.value.meta.language;
    }
    return taskResult.value.language || 'plaintext';
});

// File handling
interface ResultFile {
    path: string;
    absolutePath: string;
    type: 'created' | 'modified';
    content?: string;
    size: number;
    extension: string;
}

const safeExecutionResult = computed(() => {
    // If a specific version is selected, try to load its result
    if (selectedVersionId.value) {
        const versionEntry = history.value.find((h) => h.id === selectedVersionId.value);
        if (versionEntry?.eventData) {
            let data = versionEntry.eventData;
            // Parse if string
            if (typeof data === 'string') {
                try {
                    data = JSON.parse(data);
                } catch (e) {
                    console.error('Failed to parse history eventData:', e);
                }
            }

            // Check for executionResult in the event data (new format)
            if (data.executionResult) {
                let execRes = data.executionResult;
                if (typeof execRes === 'string') {
                    try {
                        execRes = JSON.parse(execRes);
                    } catch (e) {
                        return null;
                    }
                }
                return execRes;
            }

            // Fallback for older entries or partial data
            // Construct minimal execution result from event data
            return {
                content: data.content,
                transcript: [], // Old history might not have transcript
                files: [],
            };
        }
    }

    // Default to current task result
    const raw = (props.task as any)?.executionResult;
    if (!raw) return null;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        } catch (e) {
            console.error('Failed to parse executionResult:', e);
            return null;
        }
    }
    return raw;
});

const resultFiles = ref<ResultFile[]>([]);
const isResultFilesLoading = ref(false);

const updateResultFiles = async () => {
    isResultFilesLoading.value = true;
    try {
        const existingFiles = safeExecutionResult.value?.files || [];
        const metadataFiles = safeExecutionResult.value?.metadata?.resultFiles || [];
        const transcriptData = safeExecutionResult.value?.transcript || [];

        // Map existing files
        const filesMap = new Map<string, ResultFile>();
        existingFiles.forEach((f: any) => {
            filesMap.set(f.absolutePath || f.path, f);
        });

        // Add metadata files (from Gemini multi-image generation)
        for (const f of metadataFiles) {
            const filePath = f.path;
            if (filePath && !filesMap.has(filePath)) {
                let size = 0;
                try {
                    const stats = await window.electron.fs.stat(filePath);
                    size = stats.size;
                } catch (e) {
                    console.warn(`Failed to stat file: ${filePath}`, e);
                }

                filesMap.set(filePath, {
                    path: filePath,
                    absolutePath: filePath,
                    type: f.type || 'created',
                    size,
                    extension: filePath.split('.').pop() || '',
                });
            }
        }

        // --- NEW: Add generated files from Task Metadata (Persistent History) ---
        const generatedFiles = (props.task as any)?.metadata?.generatedFiles || [];
        for (const f of generatedFiles) {
            if (f.path && !filesMap.has(f.path)) {
                let size = f.size || 0;
                try {
                    const stats = await window.electron.fs.stat(f.path);
                    size = stats.size;

                    filesMap.set(f.path, {
                        path: f.path,
                        absolutePath: f.path,
                        type: 'created',
                        size: size,
                        extension: f.path.split('.').pop() || '',
                    });
                } catch (e) {
                    // File might be missing/deleted, skipping implies user only sees existing files
                    // which matches "File Tree" expectation.
                }
            }
        }
        // -----------------------------------------------------------------------

        // Extract files from transcript tool results
        transcriptData.forEach((item: any) => {
            if (item.role === 'user' && item.type === 'tool_result' && item.metadata?.result) {
                const result = item.metadata.result;
                // Check for file object in result (Claude Code style)
                if (result.file && result.file.filePath) {
                    const path = result.file.filePath;
                    if (!filesMap.has(path)) {
                        filesMap.set(path, {
                            path: path, // standardized in map
                            absolutePath: path,
                            type: 'created',
                            content: result.file.content,
                            size: result.file.content?.length || 0,
                            extension: path.split('.').pop() || 'txt',
                        } as ResultFile);
                    } else {
                        // Update content if empty
                        const existing = filesMap.get(path)!;
                        if (!existing.content && result.file.content) {
                            existing.content = result.file.content;
                        }
                    }
                }
            }
        });

        // Add Output task local file if exists
        let taskResultPath = (props.task as any)?.result;

        // Fallback: If result is null/empty but this is an Output task, check history
        if (
            (!taskResultPath || taskResultPath === '') &&
            props.task?.taskType === 'output' &&
            history.value.length > 0
        ) {
            // Get the most recent history entry
            const sortedHistory = [...history.value].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
            const lastEntry = sortedHistory[0];

            if (lastEntry?.eventData) {
                let data = lastEntry.eventData;
                if (typeof data === 'string') {
                    try {
                        data = JSON.parse(data);
                    } catch (e) {
                        // Ignore parse errors
                    }
                }

                // Try to get file path from executionResult.filePath or result
                if (data.executionResult?.filePath) {
                    taskResultPath = data.executionResult.filePath;
                    console.log(
                        `[EnhancedResultPreview] Using file path from history for tree: ${taskResultPath}`
                    );
                } else if (
                    (data as any).result &&
                    typeof (data as any).result === 'string' &&
                    (data as any).result.startsWith('/')
                ) {
                    taskResultPath = (data as any).result;
                    console.log(
                        `[EnhancedResultPreview] Using result path from history for tree: ${taskResultPath}`
                    );
                }
            }
        }

        // --- NEW: Directory Scanning for Output Tasks (Local File) ---
        // Scans for all files matching the output template to show history/versions
        if (
            props.task?.taskType === 'output' &&
            (props.task.outputConfig as any)?.destination === 'local_file'
        ) {
            try {
                const config = (props.task.outputConfig as any).localFile;
                if (config?.pathTemplate) {
                    const template = config.pathTemplate; // e.g., "TRPG-{{date}}.md"

                    // Construct regex from template: replace {{...}} with .*
                    const escapedTemplate = template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const patternStr = escapedTemplate.replace(/\\\{\\\{[^}]+\\\}\\\}/g, '.*');
                    const fileRegex = new RegExp(`^${patternStr}$`);

                    // Determine directory to scan
                    // Logic must match LocalFileConnector as closely as possible
                    let scanDir = '';

                    // Validate taskResultPath is actually a path and not content
                    const isValidPath = (p: string) => {
                        if (!p || typeof p !== 'string') return false;
                        if (p.length > 500) return false; // Sanity check for length
                        // Check for absolute path indicators
                        return p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p);
                    };

                    if (isValidPath(taskResultPath)) {
                        // If we have a hint from result, use its directory
                        // Handle windows/unix separators
                        const parts = taskResultPath.split(/[/\\]/);
                        parts.pop(); // remove filename
                        scanDir = parts.join('/');
                    } else if (
                        template &&
                        (template.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(template))
                    ) {
                        // Use template directory if absolute path is configured
                        // Remove filename part (everything after last slash)
                        const parts = template.split(/[/\\]/);
                        parts.pop();
                        scanDir = parts.join('/');
                        console.log(
                            '[EnhancedResultPreview] Derived scanDir from pathTemplate:',
                            scanDir
                        );
                    } else if (currentProject.value?.baseDevFolder) {
                        scanDir = currentProject.value.baseDevFolder;
                    } else {
                        // Fallback to downloads: Downloads/AI_Workflow_Output/ProjectName
                        // This matches LocalFileConnector's default behavior
                        try {
                            const paths = await window.electron.app.getPaths();
                            const downloadsPath = paths.downloads;
                            const projectName =
                                currentProject.value?.title ||
                                (props.task as any)?.projectName ||
                                'default';
                            // Sanitize project name (simple version)
                            const sanitizedProjectName = projectName
                                .replace(/[^a-z0-9]/gi, '_')
                                .toLowerCase();

                            // Try multiple variants if exact match unknown, but default connector uses simple sanitization
                            // Connector: this.sanitizeFilename(context?.projectName || 'default')
                            // We need to match that logic or scan parent.
                            // Let's assume standard folder structure.

                            scanDir = `${downloadsPath}/AI_Workflow_Output/${sanitizedProjectName}`;
                            console.log(
                                '[EnhancedResultPreview] Using fallback Downloads path:',
                                scanDir
                            );
                        } catch (err) {
                            console.warn(
                                '[EnhancedResultPreview] Failed to get downloads path:',
                                err
                            );
                        }
                    }

                    if (scanDir) {
                        console.log(
                            `[EnhancedResultPreview] Scanning directory for output files: ${scanDir} with pattern ${patternStr}`
                        );
                        try {
                            const dirFiles = await window.electron.fs.readDir(scanDir);
                            console.log(
                                `[EnhancedResultPreview] Found ${dirFiles.length} files in ${scanDir}. Checking against regex:`,
                                fileRegex
                            );

                            let matchedCount = 0;
                            for (const fileItem of dirFiles) {
                                if (fileItem.isDirectory) continue;
                                if (fileRegex.test(fileItem.name)) {
                                    matchedCount++;
                                    const fullPath = `${scanDir}/${fileItem.name}`;

                                    // Add to map if not exists
                                    if (!filesMap.has(fullPath)) {
                                        filesMap.set(fullPath, {
                                            path: fullPath,
                                            absolutePath: fullPath,
                                            type: 'created',
                                            size: fileItem.size,
                                            mtime: fileItem.mtimeMs || 0, // Assuming list_dir returns mtimeMs or similar? Need to verify or just use filename logic if unavailable
                                            extension: fileItem.name.split('.').pop() || '',
                                        });
                                    }
                                }
                            }
                            console.log(`[EnhancedResultPreview] Matched ${matchedCount} files.`);
                        } catch (scanErr) {
                            console.warn('[EnhancedResultPreview] Directory scan failed:', scanErr);
                        }
                    } else {
                        console.warn(
                            '[EnhancedResultPreview] No scanDir determined. taskResultPath:',
                            taskResultPath,
                            'baseDevFolder:',
                            currentProject.value?.baseDevFolder
                        );
                    }
                }
            } catch (e) {
                console.error('[EnhancedResultPreview] Error in directory scanning:', e);
            }
        }
        // -------------------------------------------------------------

        if (
            typeof taskResultPath === 'string' &&
            taskResultPath.startsWith('/') &&
            !filesMap.has(taskResultPath)
        ) {
            // This is an Output Local File task
            try {
                const exists = await window.electron.fs.exists(taskResultPath);
                if (exists) {
                    const stats = await window.electron.fs.stat(taskResultPath);
                    filesMap.set(taskResultPath, {
                        path: taskResultPath,
                        absolutePath: taskResultPath,
                        type: 'created',
                        size: stats.size,
                        mtime: stats.mtimeMs || 0,
                        extension: taskResultPath.split('.').pop() || 'txt',
                    });
                    console.log(
                        `[EnhancedResultPreview] Added Output Local File to tree: ${taskResultPath}`
                    );
                }
            } catch (e) {
                console.error('[EnhancedResultPreview] Failed to add Output file to tree:', e);
            }
        }

        // --- Merge files from taskResult (Unified Extraction) ---
        if (taskResult.value.files && taskResult.value.files.length > 0) {
            taskResult.value.files.forEach((f) => {
                if (!f.path) return;
                const key = f.absolutePath || f.path;
                if (!filesMap.has(key)) {
                    filesMap.set(key, {
                        path: f.path,
                        absolutePath: key,
                        type: f.type || 'created',
                        size: f.size || 0,
                        extension: f.extension || f.path.split('.').pop() || '',
                        content: f.content,
                    } as ResultFile);
                }
            });
        }

        // --- Merge files from taskResult (Unified Extraction) ---
        if (taskResult.value.files && taskResult.value.files.length > 0) {
            taskResult.value.files.forEach((f) => {
                if (!f.path) return;
                const key = f.absolutePath || f.path;
                if (!filesMap.has(key)) {
                    let type: 'created' | 'modified' = 'created';
                    if (f.type === 'modify') type = 'modified';

                    filesMap.set(key, {
                        path: f.path,
                        absolutePath: key,
                        type: type,
                        size: f.size || 0,
                        extension: f.extension || f.path.split('.').pop() || '',
                        content: f.content,
                    } as ResultFile);
                }
            });
        }

        // Handle Input Task Output (Local File)
        const taskOutput = (props.task as any)?.output;
        if (taskOutput && taskOutput.kind === 'file' && taskOutput.file?.path) {
            const inputFilePath = taskOutput.file.path;
            if (!filesMap.has(inputFilePath)) {
                filesMap.set(inputFilePath, {
                    path: inputFilePath,
                    absolutePath: inputFilePath,
                    type: 'created', // or 'status' as 'existing'? Type 'created'/'modified' is used for color. Maybe 'created' is fine.
                    size: taskOutput.file.size || 0,
                    extension: inputFilePath.split('.').pop() || 'txt',
                });
                console.log(
                    `[EnhancedResultPreview] Added Input Local File to tree: ${inputFilePath}`
                );
            }
        }

        const files = Array.from(filesMap.values());

        // Sort files by mtime descending (newest first), then by path descending
        files.sort((a: any, b: any) => {
            const timeA = a.mtime || 0;
            const timeB = b.mtime || 0;
            if (timeA !== timeB) return timeB - timeA;
            return b.path.localeCompare(a.path);
        });

        console.log('[EnhancedResultPreview] resultFiles computed & sorted:', {
            count: files.length,
            top: files[0]?.path,
        });

        resultFiles.value = files;

        // Auto-select first file for Output/Input tasks if nothing selected
        if (
            !selectedFile.value &&
            files.length > 0 &&
            (props.task?.taskType === 'output' || props.task?.taskType === 'input')
        ) {
            selectedFile.value = files[0]!;
        }
    } finally {
        isResultFilesLoading.value = false;
    }
};

// --- Generated Tasks Suggestion ---
const suggestedTasks = computed(() => {
    const content = taskResult.value.content || '';
    if (!content) return [];

    const lines = content.split('\n');
    const tasks: string[] = [];
    let processingSuggestions = false;

    // Simple state machine
    for (const line of lines) {
        const trimmed = line.trim();
        // Check for header
        if (
            /^#+\s*(Next Steps|Suggestions|Recommendations|Upcoming Tasks)/i.test(trimmed) ||
            /^\*{2,}(Next Steps|Suggestions|Recommendations)\*{2,}/i.test(trimmed)
        ) {
            processingSuggestions = true;
            continue;
        }

        // Output tasks
        if (processingSuggestions) {
            // Stop if next header
            if (/^#+\s/.test(trimmed) && !tasks.includes(trimmed)) {
                processingSuggestions = false;
                continue;
            }

            // Check for list item
            const match = trimmed.match(/^[-*]\s+(.*)|^\d+\.\s+(.*)/);
            if (match) {
                let taskText = (match[1] || match[2]).trim();
                // Remove bolding if strictly wrapping the whole line, e.g. **Task**
                taskText = taskText.replace(/^\*\*(.*)\*\*$/, '$1');
                if (taskText && taskText.length > 5 && !tasks.includes(taskText)) {
                    tasks.push(taskText);
                }
            }
        }
    }
    return tasks.slice(0, 5); // Limit to 5
});

const createTaskFromSuggestion = async (text: string) => {
    if (!props.task?.projectId) return;

    try {
        await taskStore.createTask({
            projectId: props.task.projectId,
            title: text,
            status: 'todo',
            description: `Auto-created from suggestion in Task #${props.task.projectSequence}`,
            priority: 'medium',
            taskType: 'ai',
        });

        // Optional: Show toast or feedback
        console.log('[EnhancedResultPreview] Created task from suggestion:', text);
    } catch (error) {
        console.error('[EnhancedResultPreview] Failed to create task:', error);
    }
};

// Watch for changes that affect file list
watch(
    () => [safeExecutionResult.value, (props.task as any)?.result, history.value.length],
    () => {
        updateResultFiles();
    },
    { immediate: true }
);

const transcript = computed(() => {
    return safeExecutionResult.value?.transcript || [];
});

const aiResponseContent = computed(() => {
    return (props.task as any)?.executionResult?.content || (props.task as any)?.result || '';
});

const parsedAiResponse = computed(() => {
    if (!aiResponseContent.value) return '';
    return marked.parse(aiResponseContent.value);
});

const sortedTranscript = computed(() => {
    return [...transcript.value].sort((a, b) => {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
});

const viewMode = ref<'preview' | 'log' | 'split' | 'diff'>('preview');

watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            // Debug logging
            const rawExecResult = (props.task as any)?.executionResult;
            console.log('[EnhancedResultPreview] Task opened:', {
                taskId: props.task?.id,
                taskType: props.task?.taskType,
                hasExecutionResult: !!rawExecResult,
                executionResultType: typeof rawExecResult,
                executionResultKeys:
                    rawExecResult && typeof rawExecResult === 'object'
                        ? Object.keys(rawExecResult)
                        : [],
                transcriptLength:
                    typeof transcript.value === 'string'
                        ? 'string'
                        : (transcript.value as any[])?.length,
                taskResult: (props.task as any)?.result,
            });

            // Load history
            console.log('[EnhancedResultPreview] Fetching history for task:', props.task?.id);
            fetchHistory();

            // Default to preview (safely access content which may not be initialized yet)
            try {
                if (content?.value && outputFormat?.value === 'html') {
                    viewMode.value = 'split';
                } else {
                    viewMode.value = 'preview';
                }
            } catch (e) {
                // content not yet initialized, default to preview
                viewMode.value = 'preview';
            }
        } else {
            selectedVersionId.value = null; // Reset version when closing
        }
    },
    { immediate: true } // Load history immediately on mount if panel is already open
);

// Load history on mount as well (in case panel is already open)
onMounted(async () => {
    // Ensure project is loaded for baseDevFolder
    if (props.task?.projectId && !currentProject.value) {
        console.log(
            '[EnhancedResultPreview] Fetching project for baseDevFolder context:',
            props.task.projectId
        );
        await projectStore.fetchProjects();
    }

    if (props.open && props.task?.projectId && props.task?.projectSequence) {
        console.log(
            '[EnhancedResultPreview] Component mounted, loading history for task (Composite):',
            { pid: props.task.projectId, seq: props.task.projectSequence }
        );
        fetchHistory();
    }
});

// Watch for task identity changes to load history
watch(
    () => [props.task?.projectId, props.task?.projectSequence],
    async ([newPid, newSeq]) => {
        if (newPid && newSeq) {
            console.log('[EnhancedResultPreview] Task Identity changed, fetching history:', {
                newPid,
                newSeq,
            });
            fetchHistory();
        }
    }
);

// Watch history changes to trigger file selection for Output tasks
watch(
    () => history.value.length,
    (newLength, oldLength) => {
        if (newLength > 0 && oldLength === 0 && props.task?.taskType === 'output') {
            console.log(
                '[EnhancedResultPreview] History loaded for Output task, triggering file refresh'
            );
            // Force re-computation by updating a trigger
            nextTick(() => {
                // Check if we now have files
                if (resultFiles.value.length > 0 && !selectedFile.value) {
                    selectedFile.value = resultFiles.value[0];
                    console.log(
                        '[EnhancedResultPreview] Auto-selected file after history load:',
                        resultFiles.value[0].path
                    );
                }
            });
        }
    }
);

// Watch resultFiles to ensure auto-selection happens when files are actually loaded (async)
watch(
    () => resultFiles.value.length,
    (count) => {
        if (count > 0 && !selectedFile.value) {
            selectedFile.value = resultFiles.value[0];
            console.log(
                '[EnhancedResultPreview] Auto-selected first file from resultFiles:',
                resultFiles.value[0].path
            );
        }
    }
);

// Get task result content
const contentRefreshTrigger = ref(0);
let pollInterval: NodeJS.Timeout | null = null;

// Clean up polling
onUnmounted(() => {
    if (pollInterval) clearInterval(pollInterval);
});

// Content ref for loading file content asynchronously
const content = ref('');
const isContentLoading = ref(false);

const loadContent = async () => {
    if (!selectedFile.value) {
        content.value = fallbackResultContent.value;
        return;
    }

    const { absolutePath, content: staticContent, extension } = selectedFile.value;

    // Use static content if available and no absolute path (e.g. from transcript tool result)
    if (!absolutePath && staticContent) {
        content.value = staticContent;
        return;
    }

    if (absolutePath) {
        // Do not set loading true for polling updates to prevent flickering?
        if (!content.value) isContentLoading.value = true;
        console.log('[EnhancedResultPreview] Loading content from:', absolutePath);

        try {
            const exists = await window.electron.fs.exists(absolutePath);
            if (!exists) {
                console.warn('[EnhancedResultPreview] File does not exist:', absolutePath);
                if (staticContent) {
                    content.value = staticContent;
                } else {
                    content.value = ''; // Waiting for creation
                }
                return;
            }

            const ext = extension?.toLowerCase() || '';
            let loadedContent = '';
            // Check if image
            if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
                const base64 = await window.electron.fs.readFileBase64(absolutePath);
                const mime = `image/${ext === 'svg' ? 'svg+xml' : ext === 'jpg' ? 'jpeg' : ext}`;
                loadedContent = `data:${mime};base64,${base64}`;
            } else {
                loadedContent = await window.electron.fs.readFile(absolutePath);
            }

            console.log('[EnhancedResultPreview] Content loaded, length:', loadedContent?.length);
            content.value = loadedContent;

            // Force verify format
            console.log('[EnhancedResultPreview] Current outputFormat:', outputFormat.value);
        } catch (e: any) {
            console.error('[EnhancedResultPreview] Failed to load content:', e);
            content.value = `Error loading file: ${e.message}`;
        } finally {
            isContentLoading.value = false;
        }
    }
};

// Watch for file selection to start/stop polling (legacy polling, kept for safety but reduced)
watch(
    () => [selectedFile.value, props.task?.status],
    async (file) => {
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
        // Polling logic is largely replaced by explicit loadContent calls on triggers,
        // but we keep minimal polling for active tasks if needed.
        // For now, removing polling to rely on IPC and manual refreshes/IO events if we had them.
    },
    { immediate: true }
);

// Update watch for selectedFile and refresh trigger
watch(
    () => [selectedFile.value, contentRefreshTrigger.value, fallbackResultContent.value],
    () => {
        loadContent();
    },
    { immediate: true }
);

// Helper to determine if we should look for a file path in the result
function getOutputFilePath(): string | null {
    let taskResultPath = props.task?.result;

    if (
        (!taskResultPath || taskResultPath === '') &&
        props.task?.taskType === 'output' &&
        history.value.length > 0
    ) {
        // ... (existing history fallback logic if needed, but resultFiles usually handles this)
        // For content loading, we mostly rely on selectedFile.
        // But if no file is selected, we might want to default to something.
    }

    return typeof taskResultPath === 'string' && taskResultPath.startsWith('/')
        ? taskResultPath
        : null;
}

// Get previous result for diff comparison
const previousResult = computed(() => {
    // Get sorted history (newest first)
    const sortedHistory = [...history.value].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    if (sortedHistory.length < 2) {
        return null; // Need at least 2 executions to compare
    }

    // If a specific version is selected, find the one before it
    let targetIndex = 0;
    if (selectedVersionId.value) {
        targetIndex = sortedHistory.findIndex((h) => h.id === selectedVersionId.value);
        if (targetIndex < sortedHistory.length - 1) {
            targetIndex++; // Get the one before selected
        } else {
            return null; // No previous version
        }
    } else {
        // Use the second most recent (index 1)
        targetIndex = 1;
    }

    const previousEntry = sortedHistory[targetIndex];
    if (!previousEntry?.eventData) return null;

    let data = previousEntry.eventData;
    if (typeof data === 'string') {
        try {
            data = JSON.parse(data);
        } catch (e) {
            console.error('[EnhancedResultPreview] Failed to parse previous result:', e);
            return null;
        }
    }

    // Extract content from executionResult
    if (data.executionResult) {
        let execRes = data.executionResult;
        if (typeof execRes === 'string') {
            try {
                execRes = JSON.parse(execRes);
            } catch (e) {
                return null;
            }
        }
        return execRes.content || '';
    }

    return data.content || '';
});

const hasPreviousResult = computed(() => {
    return !!previousResult.value && previousResult.value.length > 0;
});

// Auto-select first file if available and main content is short/empty
watch(
    () => resultFiles.value,
    (files) => {
        if (files && files.length > 0 && !selectedFile.value) {
            // For Output tasks, auto-select the file to show content immediately
            if (props.task?.taskType === 'output') {
                selectedFile.value = files[0];
                console.log(
                    '[EnhancedResultPreview] Auto-selected Output task file:',
                    files[0].path
                );
            }
            // Optional: Auto-select criteria for other task types
        }
    },
    { immediate: true }
);

const imageMimeType = computed(() => {
    return aiResult.value?.meta?.mime || 'image/png';
});

const pngImageSrc = computed(() => {
    if (outputFormat.value !== 'png') {
        return '';
    }
    const value = content.value || '';
    if (!value) {
        return '';
    }
    if (value.startsWith('data:') || /^https?:\/\//i.test(value)) {
        return value;
    }
    return `data:${imageMimeType.value};base64,${value}`;
});

// Script execution logs
const scriptLogs = computed(() => {
    const execResult = safeExecutionResult.value;
    if (!execResult) return [];

    // For script tasks, logs are stored in executionResult.logs
    const logs = execResult.logs || [];
    return Array.isArray(logs) ? logs : [];
});

// Format display name
const formatDisplayName = computed(() => {
    const names: Record<OutputFormat, string> = {
        text: t('result.preview.format_text'),
        markdown: t('result.preview.format_markdown'),
        html: t('result.preview.format_html'),
        pdf: t('result.preview.format_pdf'),
        json: t('result.preview.format_json'),
        yaml: t('result.preview.format_yaml'),
        csv: t('result.preview.format_csv'),
        sql: t('result.preview.format_sql'),
        shell: t('result.preview.format_shell'),
        mermaid: t('result.preview.format_mermaid'),
        svg: t('result.preview.format_svg'),
        png: t('result.preview.format_png'),
        mp4: t('result.preview.format_mp4'),
        mp3: t('result.preview.format_mp3'),
        diff: t('result.preview.format_diff'),
        log: t('result.preview.format_log'),
        code: codeLanguage.value.charAt(0).toUpperCase() + codeLanguage.value.slice(1),
    };
    return names[outputFormat.value] || t('result.preview.format_text');
});

// Dynamic Label for "AI Response" button
const resultLabel = computed(() => {
    // Check both taskType (DB) and type (legacy/runtime)
    const type = (props.task as any)?.taskType || (props.task as any)?.type;

    if (type === 'output') {
        const config = props.task?.outputConfig;
        if (config?.destination === 'local_file') {
            // Try to extract filename from pathTemplate
            const path = config.localFile?.pathTemplate;
            if (path) {
                // Get filename part
                return path.split(/[/\\]/).pop() || t('result.preview.local_file');
            }
            return t('result.preview.local_file');
        }
        return t('result.preview.output_result');
    }
    return t('result.preview.ai_response');
});

const resultSubLabel = computed(() => {
    const type = (props.task as any)?.taskType || (props.task as any)?.type;
    if (type === 'output') {
        return props.task?.outputConfig?.destination || '';
    }
    if (taskResult.value.provider) {
        return `${taskResult.value.provider}${
            taskResult.value.model ? ' · ' + taskResult.value.model : ''
        }`;
    }
    return '';
});

// Format icon
const formatIcon = computed(() => {
    const icons: Record<OutputFormat, string> = {
        // Text - File-Text (Phosphor regular weight)
        text: 'M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-40-64a8,8,0,0,1-8,8H104a8,8,0,0,1,0-16h48A8,8,0,0,1,160,152Zm0-32a8,8,0,0,1-8,8H104a8,8,0,0,1,0-16h48A8,8,0,0,1,160,120Z',

        // Markdown - Article (Phosphor)
        markdown:
            'M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM40,56H216V96H40ZM40,112H216v88H40Zm32,28a8,8,0,0,1,8-8h40a8,8,0,0,1,0,16H80A8,8,0,0,1,72,140Zm96,36a8,8,0,0,1-8,8H80a8,8,0,0,1,0-16h80A8,8,0,0,1,168,176Z',

        // HTML - Code (Phosphor)
        html: 'M69.12,94.15,28.5,128l40.62,33.85a8,8,0,1,1-10.24,12.29l-48-40a8,8,0,0,1,0-12.29l48-40a8,8,0,0,1,10.24,12.3Zm176,27.7-48-40a8,8,0,1,0-10.24,12.3L227.5,128l-40.62,33.85a8,8,0,1,0,10.24,12.29l48-40a8,8,0,0,0,0-12.29ZM162.73,32.48a8,8,0,0,0-10.25,4.79l-64,176a8,8,0,0,0,4.79,10.26A8.14,8.14,0,0,0,96,224a8,8,0,0,0,7.52-5.27l64-176A8,8,0,0,0,162.73,32.48Z',

        // PDF - File-Pdf (Phosphor)
        pdf: 'M224,152a8,8,0,0,1-8,8H192v16h16a8,8,0,0,1,0,16H192v16a8,8,0,0,1-16,0V152a8,8,0,0,1,8-8h32A8,8,0,0,1,224,152ZM92,172a28,28,0,0,1-28,28H56v8a8,8,0,0,1-16,0V152a8,8,0,0,1,8-8H64A28,28,0,0,1,92,172Zm-16,0a12,12,0,0,0-12-12H56v24h8A12,12,0,0,0,76,172Zm88,8a36,36,0,0,1-36,36H112a8,8,0,0,1-8-8V152a8,8,0,0,1,8-8h16A36,36,0,0,1,164,180Zm-16,0a20,20,0,0,0-20-20h-8v40h8A20,20,0,0,0,148,180ZM40,112V40A16,16,0,0,1,56,24h96a8,8,0,0,1,5.66,2.34l56,56A8,8,0,0,1,216,88v24a8,8,0,0,1-16,0V96H152a8,8,0,0,1-8-8V40H56v72a8,8,0,0,1-16,0ZM160,80h28.69L160,51.31Z',

        // JSON - Brackets-Curly (Phosphor)
        json: 'M48,48V88a32,32,0,0,1-32,32,8,8,0,0,0,0,16,32,32,0,0,1,32,32v40a16,16,0,0,0,16,16H68a8,8,0,0,0,0-16H64a.78.78,0,0,1,0-.13V168a48.07,48.07,0,0,0-20.58-39.68A47.87,47.87,0,0,0,64,88.13V48a.78.78,0,0,1,0-.13H68a8,8,0,0,0,0-16H64A16,16,0,0,0,48,48Zm196,72a8,8,0,0,0,0-16,32,32,0,0,1-32-32V48a16,16,0,0,0-16-16h-4a8,8,0,0,0,0,16h4a.78.78,0,0,1,0,.13V88a48.07,48.07,0,0,0,20.58,39.68A47.87,47.87,0,0,0,196,167.87v40.26s0,.09,0,.13h-4a8,8,0,0,0,0,16h4a16,16,0,0,0,16-16V168A32,32,0,0,1,244,136Z',

        // YAML - Database (Phosphor)
        yaml: 'M128,24C74.17,24,32,48.6,32,80v96c0,31.4,42.17,56,96,56s96-24.6,96-56V80C224,48.6,181.83,24,128,24Zm80,104c0,9.62-7.88,19.43-21.61,26.92C170.93,163.35,150.19,168,128,168s-42.93-4.65-58.39-13.08C55.88,147.43,48,137.62,48,128V111.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64ZM69.61,53.08C85.07,44.65,105.81,40,128,40s42.93,4.65,58.39,13.08C200.12,60.57,208,70.38,208,80s-7.88,19.43-21.61,26.92C170.93,115.35,150.19,120,128,120s-42.93-4.65-58.39-13.08C55.88,99.43,48,89.62,48,80S55.88,60.57,69.61,53.08ZM186.39,202.92C170.93,211.35,150.19,216,128,216s-42.93-4.65-58.39-13.08C55.88,195.43,48,185.62,48,176V159.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64V176C208,185.62,200.12,195.43,186.39,202.92Z',

        // CSV - Table (Phosphor)
        csv: 'M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48ZM40,112H80v32H40Zm56,0H216v32H96ZM216,64V96H40V64ZM40,160H80v32H40Zm176,32H96V160H216v32Z',

        // SQL - Database (Phosphor - same as YAML but represents SQL databases)
        sql: 'M128,24C74.17,24,32,48.6,32,80v96c0,31.4,42.17,56,96,56s96-24.6,96-56V80C224,48.6,181.83,24,128,24Zm80,104c0,9.62-7.88,19.43-21.61,26.92C170.93,163.35,150.19,168,128,168s-42.93-4.65-58.39-13.08C55.88,147.43,48,137.62,48,128V111.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64ZM69.61,53.08C85.07,44.65,105.81,40,128,40s42.93,4.65,58.39,13.08C200.12,60.57,208,70.38,208,80s-7.88,19.43-21.61,26.92C170.93,115.35,150.19,120,128,120s-42.93-4.65-58.39-13.08C55.88,99.43,48,89.62,48,80S55.88,60.57,69.61,53.08ZM186.39,202.92C170.93,211.35,150.19,216,128,216s-42.93-4.65-58.39-13.08C55.88,195.43,48,185.62,48,176V159.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64V176C208,185.62,200.12,195.43,186.39,202.92Z',

        // Shell - Terminal (Phosphor)
        shell: 'M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM40,56H216V88H40ZM40,200V104H216v96Zm37.66-61.66a8,8,0,0,1,.34-11.23l28.6-30.58-28.6-26.65a8,8,0,0,1,11.12-11.56l32,29.91a8,8,0,0,1-.4,12l-32,34.09a8,8,0,0,1-11.06.02ZM144,176a8,8,0,0,1-8,8H120a8,8,0,0,1,0-16h16A8,8,0,0,1,144,176Z',

        // Mermaid - Chart-Bar (Phosphor)
        mermaid:
            'M224,200h-8V40a8,8,0,0,0-8-8H152a8,8,0,0,0-8,8V80H96a8,8,0,0,0-8,8v40H48a8,8,0,0,0-8,8v64H32a8,8,0,0,0,0,16H224a8,8,0,0,0,0-16ZM160,48h40V200H160ZM104,96h40V200H104ZM56,144H88v56H56Z',

        // SVG - Vector-Three (Phosphor - represents vector graphics)
        svg: 'M229.66,90.34l-64-64a8,8,0,0,0-11.32,0l-64,64a8,8,0,0,0,11.32,11.32L152,51.31V96a8,8,0,0,0,16,0V51.31l50.34,50.35a8,8,0,0,0,11.32-11.32ZM208,144a40,40,0,1,0-40,40A40,40,0,0,0,208,144Zm-64,0a24,24,0,1,1,24,24A24,24,0,0,1,144,144ZM88,104A40,40,0,1,0,48,144,40,40,0,0,0,88,104ZM64,144a24,24,0,1,1,24-24A24,24,0,0,1,64,144Zm176,72a40,40,0,1,0-40,40A40,40,0,0,0,240,216Zm-64,0a24,24,0,1,1,24,24A24,24,0,0,1,176,216Z',

        // PNG - Image (Phosphor)
        png: 'M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM40,56H216v77.38l-24.69-24.7a16,16,0,0,0-22.62,0L144,133.37,100.69,90.07a16,16,0,0,0-22.62,0L40,128.69Zm0,144V154.35L89.66,104.69l53.65,53.65a8,8,0,0,0,11.32,0l34.05-34L216,151.63V200ZM144,100a12,12,0,1,1,12,12A12,12,0,0,1,144,100Z',

        // MP4 - Film-Strip (Phosphor)
        mp4: 'M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM40,72H80V96H40ZM40,112H80v32H40Zm0,88V160H80v40Zm176,0H96V72H216V200ZM96,56h64V40H96Zm80,0h40V40H176Z',

        // MP3 - Music-Note (Phosphor)
        mp3: 'M210.35,41.93A8,8,0,0,0,200,32H80a8,8,0,0,0,0,16h98.74L112,87.09V180a36,36,0,1,0,16,29.92V104.7l74.35-42.77A8,8,0,0,0,210.35,41.93ZM112,228a20,20,0,1,1,20-20A20,20,0,0,1,112,228Z',

        // Diff - Git-Diff (Phosphor)
        diff: 'M112,152v56a8,8,0,0,1-16,0V168H88a64,64,0,0,1-64-64V64a8,8,0,0,1,8-8H88a8,8,0,0,1,0,16H40v32a48,48,0,0,0,48,48h8V136a8,8,0,0,1,16,0ZM216,56H168a8,8,0,0,0,0,16h48v32a48,48,0,0,1-48,48h-8V136a8,8,0,0,0-16,0v56a8,8,0,0,0,16,0V168h8a64,64,0,0,0,64-64V64A8,8,0,0,0,216,56ZM80,96h8a8,8,0,0,0,0-16H80a8,8,0,0,0,0,16Zm96,64h-8a8,8,0,0,0,0,16h8a8,8,0,0,0,0-16Z',

        // Log - List-Bullets (Phosphor)
        log: 'M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128ZM40,72H216a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16ZM216,184H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z',

        // Code - Code (Phosphor)
        code: 'M69.12,94.15,28.5,128l40.62,33.85a8,8,0,1,1-10.24,12.29l-48-40a8,8,0,0,1,0-12.29l48-40a8,8,0,0,1,10.24,12.3Zm176,27.7-48-40a8,8,0,1,0-10.24,12.3L227.5,128l-40.62,33.85a8,8,0,1,0,10.24,12.29l48-40a8,8,0,0,0,0-12.29ZM162.73,32.48a8,8,0,0,0-10.25,4.79l-64,176a8,8,0,0,0,4.79,10.26A8.14,8.14,0,0,0,96,224a8,8,0,0,0,7.52-5.27l64-176A8,8,0,0,0,162.73,32.48Z',
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

        const rawContent = content.value.trim();

        // Try to extract content from ```mermaid code fence first
        const mermaidFenceMatch = rawContent.match(/```mermaid\s*\n([\s\S]*?)```/i);
        let cleanContent: string;

        if (mermaidFenceMatch && mermaidFenceMatch[1]) {
            // Found mermaid code fence, use only the content inside
            cleanContent = mermaidFenceMatch[1].trim();
        } else {
            // Fallback: remove generic code fences
            cleanContent = rawContent.replace(/^```(?:mermaid)?\s*\n?/i, '');
            cleanContent = cleanContent.replace(/\s*```\s*$/, '');
        }

        const { svg } = await mermaid.default.render('mermaid-diagram', cleanContent.trim());
        renderedMermaid.value = svg;
    } catch (err) {
        // console.error('Mermaid render error:', err);
        renderedMermaid.value = `<div class="text-red-500">${t('result.preview.mermaid_error')}: ${err}</div>`;
    }
}

async function renderDrawerMermaid() {
    if (!selectedCodeBlock.value || selectedCodeBlock.value.language !== 'mermaid') return;

    try {
        const mermaid = await import('mermaid');
        mermaid.default.initialize({
            startOnLoad: false,
            theme: 'dark',
            securityLevel: 'loose',
        });

        const code = selectedCodeBlock.value.code.trim();
        // Generate unique ID for drawer render
        const id = `drawer-mermaid-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const { svg } = await mermaid.default.render(id, code);
        drawerMermaidSvg.value = svg;
    } catch (err) {
        console.error('Drawer Mermaid render error:', err);
        drawerMermaidSvg.value = `<div class="p-4 text-red-500 bg-red-50 dark:bg-red-900/20 rounded">
            <p class="font-bold">${t('result.preview.mermaid_error')}:</p>
        </div>`;
    }
}

// Reset selection on open
watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            selectedFile.value = null;
        }
    }
);

function renderMarkdownContent(rawText: string): string {
    if (!rawText) return '';

    // Simple heuristic to linkify absolute file paths in text
    // Matches strings starting with / that look like paths, avoiding obvious code tokens
    const textWithLinks = rawText.replace(
        /(?<!\]\()(?<!=["'])(\/(?:Users|home|usr|var|tmp|etc|opt)[^\s`'"<>,;:()[\]]+)/g,
        (match) => {
            return `<a href="#" data-file-path="${match}" class="text-blue-400 hover:underline cursor-pointer file-link">${match}</a>`;
        }
    );

    const rendered = marked.parse(textWithLinks, { ...markedOptions, async: false });
    return typeof rendered === 'string' ? rendered : '';
}

function hasCodeFence(rawText: string): boolean {
    return /```[\s\S]+```/.test(rawText);
}

function extractJsonPayload(rawText: string): string | null {
    if (!rawText) return null;
    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch && fenceMatch[1]) {
        return fenceMatch[1];
    }
    return rawText || null;
}

// Render Markdown
function renderMarkdown() {
    if (outputFormat.value !== 'markdown' || !content.value) {
        markdownHtml.value = '';
        return;
    }

    try {
        markdownHtml.value = renderMarkdownContent(content.value);
        console.log(
            '[EnhancedResultPreview] renderMarkdown success. HTML length:',
            markdownHtml.value.length
        );
    } catch (e: any) {
        console.error('[EnhancedResultPreview] renderMarkdown failed:', e);
        markdownHtml.value = `<div class="p-4 text-red-500 border border-red-200 rounded bg-red-50">
            <h3 class="font-bold mb-2">${t('result.preview.error_rendering_markdown')}</h3>
            <pre class="whitespace-pre-wrap text-xs font-mono">${e.message}\n${e.stack || ''}</pre>
        </div>`;
    }
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

function handleMarkdownClick(event: MouseEvent) {
    const target = event.target as HTMLElement;

    // Handle File Links
    if (target.tagName === 'A' && target.dataset.filePath) {
        event.preventDefault();
        const path = target.dataset.filePath;
        const file = resultFiles.value.find(
            (f) => f.absolutePath === path || path.endsWith(f.path)
        );

        if (file) {
            selectedFile.value = file;
        }
        return;
    }

    // Handle Code Block Preview Clicks (Delegation)
    const trigger = target.closest('.code-block-trigger') as HTMLElement;
    if (trigger) {
        const language = trigger.getAttribute('data-language') || 'plaintext';
        const codeElement = trigger.querySelector('code');
        const code = codeElement?.innerText || '';

        selectedCodeBlock.value = {
            code,
            language,
        };
        event.stopPropagation();
    }
}

function handleRetry() {
    if (!props.task || (!feedback.value.trim() && feedbackItems.value.length === 0)) return;

    let finalFeedback = feedback.value;

    if (feedbackItems.value.length > 0) {
        finalFeedback += '\n\n# Attached Comments:\n';
        feedbackItems.value.forEach((item, index) => {
            // finalFeedback += `\n--- Comment ${index + 1} ---\n`;
            if (item.file && item.range) {
                finalFeedback += `@${item.file}:${item.range.startLineNumber} ${item.comment}\n`;
            } else if (item.range) {
                finalFeedback += `@Line ${item.range.startLineNumber} ${item.comment}\n`;
            } else {
                finalFeedback += `${item.comment}\n`;
            }
        });
    }

    emit('retry', props.task, finalFeedback);
    feedback.value = '';
    feedbackItems.value = [];
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

// Helper to determine format from extension
function getFormatFromExtension(ext?: string): OutputFormat {
    if (!ext) return 'text';
    const normalized = ext.toLowerCase().replace(/^\./, '');
    const map: Record<string, OutputFormat> = {
        md: 'markdown',
        markdown: 'markdown',
        html: 'html',
        htm: 'html',
        json: 'json',
        yaml: 'yaml',
        yml: 'yaml',
        csv: 'csv',
        sql: 'sql',
        sh: 'shell',
        bash: 'shell',
        zsh: 'shell',
        mmd: 'mermaid',
        mermaid: 'mermaid',
        svg: 'svg',
        png: 'png',
        jpg: 'png',
        jpeg: 'png',
        gif: 'png',
        mp4: 'mp4',
        mp3: 'mp3',
        diff: 'diff',
        patch: 'diff',
        log: 'log',
        js: 'code',
        ts: 'code',
        jsx: 'code',
        tsx: 'code',
        vue: 'code',
        py: 'code',
        java: 'code',
        c: 'code',
        cpp: 'code',
        cs: 'code',
        go: 'code',
        rs: 'code',
        php: 'code',
        rb: 'code',
        swift: 'code',
        kt: 'code',
        css: 'code',
        scss: 'code',
        less: 'code',
        xml: 'code',
    };
    return map[normalized] || 'text';
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
                class="absolute top-0 right-0 flex shadow-2xl transition-all duration-300 ease-in-out"
                :class="isFullscreen ? 'inset-x-0 w-full' : ''"
                :style="{
                    width: !isFullscreen ? `${panelWidth}%` : undefined,
                    bottom: bottomOffset,
                }"
            >
                <!-- Resize Handle -->
                <div
                    v-if="!isFullscreen"
                    class="absolute left-0 inset-y-0 w-1 cursor-ew-resize hover:bg-blue-500/50 z-50 transition-colors flex flex-col justify-center items-center group -ml-0.5"
                    @mousedown="startResize"
                >
                    <!-- Visual indicator on hover -->
                    <div class="h-8 w-1 bg-gray-400/50 rounded-full group-hover:bg-blue-500"></div>
                </div>

                <div class="flex h-full flex-col bg-white dark:bg-gray-900 w-full overflow-hidden">
                    <!-- Header -->
                    <div
                        class="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 px-4 py-3"
                    >
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                                    {{ t('result.preview.title') }}
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
                                    :title="t('result.preview.full_screen')"
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
                                    :title="t('result.preview.version_history')"
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
                                    :title="t('result.preview.close')"
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

                    <!-- Layout Container -->
                    <div class="flex-1 flex overflow-hidden">
                        <!-- Sidebar (File List) -->
                        <div
                            class="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-col"
                        >
                            <div
                                class="p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider flex justify-between items-center"
                            >
                                <span>{{
                                    t('result.preview.file_list', { count: resultFiles.length + 1 })
                                }}</span>
                                <button
                                    class="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                    @click="isTreeView = !isTreeView"
                                    :title="t('result.preview.toggle_view')"
                                >
                                    <svg
                                        v-if="isTreeView"
                                        class="w-4 h-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M4 6h16M4 10h16M4 14h16M4 18h16"
                                        />
                                    </svg>
                                    <svg
                                        v-else
                                        class="w-4 h-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                                        />
                                    </svg>
                                </button>
                            </div>
                            <div class="flex-1 overflow-auto px-2 pb-2">
                                <!-- Suggestions Section -->
                                <div v-if="suggestedTasks.length > 0" class="mb-4 space-y-2">
                                    <div
                                        class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-1"
                                    >
                                        {{ t('result.preview.suggested_tasks') }}
                                    </div>
                                    <div class="space-y-1">
                                        <div
                                            v-for="(task, index) in suggestedTasks"
                                            :key="index"
                                            class="p-2 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600 shadow-sm hover:border-blue-300 dark:hover:border-blue-500 transition-colors group"
                                        >
                                            <div
                                                class="text-xs text-gray-800 dark:text-gray-200 mb-1.5 line-clamp-2 leading-relaxed"
                                            >
                                                {{ task }}
                                            </div>
                                            <button
                                                @click="createTaskFromSuggestion(task)"
                                                class="w-full px-2 py-1 text-[10px] font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100"
                                            >
                                                <svg
                                                    class="w-3 h-3"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        stroke-width="2"
                                                        d="M12 4v16m8-8H4"
                                                    />
                                                </svg>
                                                {{ t('result.preview.create_task') }}
                                            </button>
                                        </div>
                                    </div>
                                    <div class="h-px bg-gray-200 dark:bg-gray-700 my-2"></div>
                                </div>

                                <!-- Tree View -->
                                <div v-if="isTreeView" class="space-y-0.5">
                                    <!-- AI Response / Output Result Button -->
                                    <button
                                        class="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2.5 transition-all mb-2 border border-transparent"
                                        :class="
                                            !selectedFile
                                                ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 shadow-sm'
                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                                        "
                                        @click="selectedFile = null"
                                    >
                                        <!-- Icon -->
                                        <svg
                                            class="w-5 h-5 flex-shrink-0"
                                            :class="
                                                !selectedFile
                                                    ? 'text-blue-600 dark:text-blue-400'
                                                    : ''
                                            "
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                v-if="(props.task as any)?.type === 'output'"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                            />
                                            <path
                                                v-else
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                                            />
                                        </svg>
                                        <div class="flex-1 min-w-0">
                                            <div class="font-medium truncate">
                                                {{ resultLabel }}
                                            </div>
                                            <div
                                                class="text-xs opacity-70 truncate"
                                                v-if="resultSubLabel"
                                            >
                                                {{ resultSubLabel }}
                                            </div>
                                        </div>
                                        <!-- Selected Indicator -->
                                        <div
                                            v-if="!selectedFile"
                                            class="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400"
                                        ></div>
                                    </button>

                                    <!-- File Tree -->
                                    <FileTreeItem
                                        v-for="node in fileTree"
                                        :key="node.path"
                                        :node="node"
                                        :selected-path="selectedFile?.path"
                                        @select="onTreeSelect"
                                    />
                                </div>

                                <!-- List View -->
                                <div v-else class="space-y-1">
                                    <!-- AI Response / Output Result Button -->
                                    <button
                                        class="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2.5 transition-all mb-2 border border-transparent"
                                        :class="
                                            !selectedFile
                                                ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 shadow-sm'
                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                                        "
                                        @click="selectedFile = null"
                                    >
                                        <!-- Icon -->
                                        <svg
                                            class="w-5 h-5 flex-shrink-0"
                                            :class="
                                                !selectedFile
                                                    ? 'text-blue-600 dark:text-blue-400'
                                                    : ''
                                            "
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                v-if="(props.task as any)?.type === 'output'"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                            />
                                            <path
                                                v-else
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                                            />
                                        </svg>
                                        <div class="flex-1 min-w-0">
                                            <div class="font-medium truncate">
                                                {{ resultLabel }}
                                            </div>
                                            <div
                                                class="text-xs opacity-70 truncate"
                                                v-if="resultSubLabel"
                                            >
                                                {{ resultSubLabel }}
                                            </div>
                                        </div>
                                        <!-- Selected Indicator -->
                                        <div
                                            v-if="!selectedFile"
                                            class="w-2 h-2 rounded-full bg-blue-600 dark:bg-blue-400"
                                        ></div>
                                    </button>

                                    <!-- File Items -->
                                    <button
                                        v-for="file in resultFiles"
                                        :key="file.path"
                                        class="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors group"
                                        :class="
                                            selectedFile === file
                                                ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                        "
                                        @click="selectedFile = file"
                                        :title="file.path"
                                    >
                                        <!-- File Icon based on extension -->
                                        <svg
                                            class="w-4 h-4 flex-shrink-0"
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
                                        <div class="flex-1 min-w-0">
                                            <div class="truncate">{{ file.path }}</div>
                                            <div
                                                class="text-[10px] text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                {{
                                                    file.type === 'created'
                                                        ? t('result.preview.created')
                                                        : t('result.preview.modified')
                                                }}
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Main Content -->
                        <div class="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
                            <!-- Upper Area: Preview + Version History -->
                            <div class="flex-1 flex overflow-hidden relative min-h-0">
                                <!-- Preview Area -->
                                <div class="flex-1 flex flex-col overflow-hidden min-w-0">
                                    <!-- View Mode Tabs -->
                                    <div
                                        v-if="transcript.length > 0"
                                        class="flex-shrink-0 flex items-center border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                                    >
                                        <button
                                            @click="viewMode = 'preview'"
                                            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
                                            :class="[
                                                viewMode === 'preview'
                                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                                            ]"
                                        >
                                            {{ t('result.preview.result_preview') }}
                                        </button>
                                        <button
                                            v-if="outputFormat === 'html'"
                                            @click="viewMode = 'split'"
                                            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
                                            :class="[
                                                viewMode === 'split'
                                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                                            ]"
                                        >
                                            {{ t('result.preview.split_view') }}
                                        </button>
                                        <button
                                            v-if="scriptLogs.length > 0"
                                            @click="viewMode = 'log'"
                                            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
                                            :class="[
                                                viewMode === 'log'
                                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                                            ]"
                                            :title="t('result.preview.view_script_logs')"
                                        >
                                            <div class="flex items-center gap-2">
                                                <svg
                                                    class="w-4 h-4"
                                                    fill="currentColor"
                                                    viewBox="0 0 20 20"
                                                >
                                                    <path
                                                        fill-rule="evenodd"
                                                        d="M3 3a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V3zm2 2v8h10V5H5z"
                                                        clip-rule="evenodd"
                                                    />
                                                    <path d="M7 10h6M7 12h3" />
                                                </svg>
                                                <span>{{
                                                    t('result.preview.logs', {
                                                        count: scriptLogs.length,
                                                    })
                                                }}</span>
                                            </div>
                                        </button>
                                        <!-- Diff View Button -->
                                        <button
                                            @click="viewMode = 'diff'"
                                            class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
                                            :class="[
                                                viewMode === 'diff'
                                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                                                !hasPreviousResult
                                                    ? 'opacity-50 cursor-not-allowed'
                                                    : '',
                                            ]"
                                            :disabled="!hasPreviousResult"
                                            :title="
                                                hasPreviousResult
                                                    ? t('result.preview.compare_previous_result')
                                                    : t('result.preview.no_previous_result_compare')
                                            "
                                        >
                                            <div class="flex items-center gap-2">
                                                <svg
                                                    class="w-4 h-4"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        stroke-width="2"
                                                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                                                    />
                                                </svg>
                                                <span>{{ t('result.preview.diff_view') }}</span>
                                            </div>
                                        </button>
                                    </div>

                                    <!-- Logs View -->
                                    <div
                                        v-if="viewMode === 'log'"
                                        class="flex-1 overflow-auto bg-gray-900 p-4"
                                    >
                                        <div class="space-y-1 font-mono text-sm">
                                            <div
                                                v-for="(log, index) in scriptLogs"
                                                :key="index"
                                                class="py-1 px-2 border-l-2 hover:bg-gray-800"
                                                :class="[
                                                    log.startsWith('ERROR:')
                                                        ? 'border-red-500 text-red-400'
                                                        : log.startsWith('WARN:')
                                                          ? 'border-yellow-500 text-yellow-400'
                                                          : 'border-green-500 text-gray-300',
                                                ]"
                                            >
                                                {{ log }}
                                            </div>
                                            <div
                                                v-if="scriptLogs.length === 0"
                                                class="text-gray-500 italic text-center py-8"
                                            >
                                                {{ t('result.preview.no_script_logs') }}
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Diff View -->
                                    <div
                                        v-if="viewMode === 'diff'"
                                        class="flex-1 overflow-hidden flex flex-col bg-white dark:bg-gray-900"
                                    >
                                        <div v-if="hasPreviousResult" class="flex-1 overflow-auto">
                                            <Diff
                                                :prev="previousResult || ''"
                                                :current="content"
                                                mode="split"
                                                theme="dark"
                                                language="markdown"
                                            />
                                        </div>
                                        <div
                                            v-else
                                            class="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400"
                                        >
                                            <div class="text-center">
                                                <svg
                                                    class="mx-auto h-16 w-16 mb-4 text-gray-400 dark:text-gray-600"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        stroke-width="1.5"
                                                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                                                    />
                                                </svg>
                                                <p
                                                    class="text-lg font-medium text-gray-700 dark:text-gray-300"
                                                >
                                                    {{ t('result.preview.no_previous_result') }}
                                                </p>
                                                <p
                                                    class="text-sm mt-2 text-gray-500 dark:text-gray-400"
                                                >
                                                    {{ t('result.preview.execute_twice_for_diff') }}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- Preview Content -->
                                    <div
                                        class="flex-1 flex flex-col overflow-hidden"
                                        v-if="viewMode === 'preview' || viewMode === 'split'"
                                    >
                                        <!-- AI Response Header (Visible when file is selected) -->
                                        <div
                                            v-if="selectedFile && aiResponseContent"
                                            class="flex-shrink-0 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-900/50 p-4 max-h-[200px] overflow-y-auto"
                                        >
                                            <div
                                                class="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1 uppercase tracking-wider flex items-center gap-2"
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
                                                        d="M13 10V3L4 14h7v7l9-11h-7z"
                                                    ></path>
                                                </svg>
                                                {{ t('result.preview.ai_response') }}
                                            </div>
                                            <div
                                                class="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed"
                                                v-html="parsedAiResponse"
                                            ></div>
                                        </div>

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
                                                <span
                                                    class="font-medium text-gray-900 dark:text-white"
                                                >
                                                    {{ formatDisplayName }}
                                                    {{ t('result.preview.format_type') }}
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
                                                    {{
                                                        copySuccess
                                                            ? t('result.preview.copied')
                                                            : t('result.preview.copy')
                                                    }}
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
                                                    {{ t('result.preview.download') }}
                                                </button>
                                            </div>
                                        </div>

                                        <!-- Content Viewer -->
                                        <div
                                            class="flex-1 overflow-auto"
                                            :style="{ fontSize: `${zoomLevel}%` }"
                                        >
                                            <!-- No Content -->
                                            <div
                                                v-if="!content"
                                                class="h-full flex items-center justify-center"
                                            >
                                                <div
                                                    class="text-center text-gray-500 dark:text-gray-400"
                                                >
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
                                                    <p class="text-lg font-medium">
                                                        {{ t('result.preview.no_result') }}
                                                    </p>
                                                    <p class="text-sm mt-1">
                                                        {{ t('result.preview.waiting_for_result') }}
                                                    </p>
                                                </div>
                                            </div>

                                            <!-- Unified Split View -->
                                            <div
                                                v-else-if="
                                                    [
                                                        'code',
                                                        'text',
                                                        'markdown',
                                                        'html',
                                                        'json',
                                                    ].includes(outputFormat) ||
                                                    task?.taskType === 'output'
                                                "
                                                class="h-full flex border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden relative group"
                                            >
                                                <!-- Left Panel: Source / Raw View -->
                                                <div
                                                    class="flex-1 flex flex-col min-w-0 border-r border-gray-200 dark:border-gray-700"
                                                >
                                                    <div
                                                        class="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
                                                    >
                                                        <span
                                                            class="text-xs font-medium text-gray-500 uppercase"
                                                            >{{
                                                                t('result.preview.input_source')
                                                            }}</span
                                                        >
                                                        <div class="flex items-center gap-2">
                                                            <span class="text-xs text-gray-400">{{
                                                                t(
                                                                    'result.preview.right_click_feedback'
                                                                )
                                                            }}</span>
                                                        </div>
                                                    </div>
                                                    <div class="flex-1 relative">
                                                        <CodeEditor
                                                            :model-value="content || ''"
                                                            :language="
                                                                outputFormat === 'markdown'
                                                                    ? 'markdown'
                                                                    : outputFormat === 'json'
                                                                      ? 'json'
                                                                      : outputFormat === 'html'
                                                                        ? 'html'
                                                                        : codeLanguage ===
                                                                            'plaintext'
                                                                          ? 'markdown'
                                                                          : codeLanguage
                                                            "
                                                            :readonly="true"
                                                            :show-line-numbers="true"
                                                            height="100%"
                                                            class="h-full"
                                                            @add-comment="handleAddCodeComment"
                                                        />
                                                    </div>
                                                </div>

                                                <!-- Right Panel: Preview / Rendered View -->
                                                <div
                                                    class="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-900 relative"
                                                >
                                                    <div
                                                        class="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
                                                    >
                                                        <span
                                                            class="text-xs font-medium text-gray-500 uppercase"
                                                            >{{ t('result.preview.preview') }}</span
                                                        >
                                                    </div>

                                                    <!-- HTML Preview (Iframe) -->
                                                    <div
                                                        v-if="outputFormat === 'html'"
                                                        class="flex-1 w-full h-full relative"
                                                    >
                                                        <iframe
                                                            :srcdoc="content"
                                                            class="w-full h-full border-0 bg-white"
                                                            sandbox="allow-scripts"
                                                        />
                                                    </div>

                                                    <!-- Markdown Preview -->
                                                    <div
                                                        v-else-if="outputFormat === 'markdown'"
                                                        ref="contentContainer"
                                                        class="flex-1 w-full h-full overflow-y-auto p-6 scroll-smooth"
                                                    >
                                                        <!-- MCP Logs interleaved -->
                                                        <div v-if="mcpLogs.length > 0" class="mb-6">
                                                            <MCPToolExecutionLog :logs="mcpLogs" />
                                                        </div>

                                                        <div
                                                            class="prose dark:prose-invert max-w-none"
                                                            v-html="markdownHtml"
                                                            @click="handleMarkdownClick"
                                                        ></div>
                                                    </div>

                                                    <!-- JSON Preview (Tree) -->
                                                    <div
                                                        v-else-if="outputFormat === 'json'"
                                                        ref="contentContainer"
                                                        class="flex-1 w-full h-full overflow-y-auto p-4 scroll-smooth"
                                                    >
                                                        <!-- MCP Logs interleaved -->
                                                        <div
                                                            v-if="mcpLogs.length > 0"
                                                            class="mb-6 mb-4 border-b border-gray-100 dark:border-gray-800 pb-4"
                                                        >
                                                            <MCPToolExecutionLog :logs="mcpLogs" />
                                                        </div>

                                                        <div
                                                            v-if="jsonMarkdownHtml"
                                                            class="prose dark:prose-invert max-w-none"
                                                        >
                                                            <div v-html="jsonMarkdownHtml"></div>
                                                        </div>
                                                        <pre
                                                            v-else-if="parsedJsonData"
                                                            class="text-sm font-mono"
                                                            v-html="renderJsonTree(parsedJsonData)"
                                                        />
                                                        <pre v-else class="text-sm text-gray-500">{{
                                                            t('result.preview.invalid_json')
                                                        }}</pre>
                                                    </div>

                                                    <!-- Default/Text Preview -->
                                                    <div
                                                        v-else
                                                        class="flex-1 w-full h-full overflow-y-auto p-6 scroll-smooth"
                                                    >
                                                        <!-- MCP Logs interleaved -->
                                                        <div
                                                            v-if="mcpLogs.length > 0"
                                                            class="mb-6 mb-4 border-b border-gray-100 dark:border-gray-800 pb-4"
                                                        >
                                                            <MCPToolExecutionLog :logs="mcpLogs" />
                                                        </div>

                                                        <pre
                                                            class="font-mono text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-200 leading-relaxed font-sans"
                                                            >{{ content }}</pre
                                                        >
                                                    </div>

                                                    <!-- Auto-scroll Info -->
                                                    <!-- Auto-scroll Info -->
                                                    <div
                                                        v-if="
                                                            task?.outputConfig?.localFile
                                                                ?.accumulateResults
                                                        "
                                                        class="absolute bottom-4 right-6 z-10 flex gap-2"
                                                    >
                                                        <button
                                                            @click="toggleAutoScroll"
                                                            class="px-2 py-1 text-xs rounded-full shadow-lg border font-medium transition-colors flex items-center gap-1 cursor-pointer hover:opacity-90 active:scale-95"
                                                            :class="
                                                                isAutoScrollActive
                                                                    ? 'bg-blue-100 dark:bg-blue-900/80 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700'
                                                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                                                            "
                                                        >
                                                            <span
                                                                class="w-1.5 h-1.5 rounded-full"
                                                                :class="
                                                                    isAutoScrollActive
                                                                        ? 'bg-blue-500 animate-pulse'
                                                                        : 'bg-gray-400'
                                                                "
                                                            ></span>
                                                            {{ t('result.preview.auto_scroll') }}:
                                                            {{
                                                                isAutoScrollActive
                                                                    ? t('result.preview.on')
                                                                    : t('result.preview.off')
                                                            }}
                                                        </button>
                                                    </div>

                                                    <!-- Code Preview Drawer -->
                                                    <div
                                                        v-if="selectedCodeBlock"
                                                        class="absolute top-0 right-0 bottom-0 w-full bg-white dark:bg-gray-900 z-20 flex flex-col transition-transform duration-300"
                                                    >
                                                        <div
                                                            class="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                                                        >
                                                            <div class="flex items-center gap-4">
                                                                <span
                                                                    class="font-medium text-sm text-gray-700 dark:text-gray-300"
                                                                >
                                                                    {{
                                                                        selectedCodeBlock.language ===
                                                                        'html'
                                                                            ? t(
                                                                                  'result.preview.html_preview'
                                                                              )
                                                                            : selectedCodeBlock.language ===
                                                                                'mermaid'
                                                                              ? t(
                                                                                    'result.preview.mermaid_preview'
                                                                                )
                                                                              : t(
                                                                                    'result.preview.code_preview',
                                                                                    {
                                                                                        lang: selectedCodeBlock.language,
                                                                                    }
                                                                                )
                                                                    }}
                                                                </span>

                                                                <!-- View Toggle for HTML/Mermaid -->
                                                                <div
                                                                    v-if="
                                                                        selectedCodeBlock.language ===
                                                                            'html' ||
                                                                        selectedCodeBlock.language ===
                                                                            'mermaid'
                                                                    "
                                                                    class="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-0.5"
                                                                >
                                                                    <button
                                                                        @click="
                                                                            drawerTab = 'preview'
                                                                        "
                                                                        class="px-3 py-1 text-xs font-medium rounded-md transition-all"
                                                                        :class="
                                                                            drawerTab === 'preview'
                                                                                ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                                                                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                                                        "
                                                                    >
                                                                        {{
                                                                            t(
                                                                                'result.preview.preview'
                                                                            )
                                                                        }}
                                                                    </button>
                                                                    <button
                                                                        @click="drawerTab = 'code'"
                                                                        class="px-3 py-1 text-xs font-medium rounded-md transition-all"
                                                                        :class="
                                                                            drawerTab === 'code'
                                                                                ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                                                                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                                                        "
                                                                    >
                                                                        {{
                                                                            t('result.preview.code')
                                                                        }}
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <button
                                                                @click="selectedCodeBlock = null"
                                                                class="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                                                            >
                                                                <svg
                                                                    class="w-4 h-4"
                                                                    fill="none"
                                                                    viewBox="0 0 24 24"
                                                                    stroke="currentColor"
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

                                                        <div
                                                            class="flex-1 overflow-hidden relative"
                                                        >
                                                            <!-- Iframe Preview -->
                                                            <div
                                                                v-if="
                                                                    selectedCodeBlock.language ===
                                                                        'html' &&
                                                                    drawerTab === 'preview'
                                                                "
                                                                class="w-full h-full bg-white"
                                                            >
                                                                <iframe
                                                                    :srcdoc="selectedCodeBlock.code"
                                                                    class="w-full h-full border-0"
                                                                    sandbox="allow-scripts"
                                                                />
                                                            </div>

                                                            <!-- Mermaid Preview -->
                                                            <div
                                                                v-else-if="
                                                                    selectedCodeBlock.language ===
                                                                        'mermaid' &&
                                                                    drawerTab === 'preview'
                                                                "
                                                                class="w-full h-full bg-white dark:bg-gray-800 p-4 overflow-auto flex items-center justify-center"
                                                            >
                                                                <div
                                                                    v-html="drawerMermaidSvg"
                                                                    class="w-full h-full flex items-center justify-center p-4 bg-white dark:bg-gray-800"
                                                                ></div>
                                                            </div>

                                                            <!-- Code Editor -->
                                                            <CodeEditor
                                                                v-else
                                                                :model-value="
                                                                    selectedCodeBlock.code
                                                                "
                                                                :language="
                                                                    selectedCodeBlock.language
                                                                "
                                                                :readonly="true"
                                                                :show-line-numbers="true"
                                                                height="100%"
                                                                class="h-full"
                                                            />
                                                        </div>
                                                    </div>
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
                                                                v-for="(_, index) in content.split(
                                                                    '\n'
                                                                )"
                                                                :key="index"
                                                                class="text-gray-500 text-sm font-mono leading-6"
                                                            >
                                                                {{ index + 1 }}
                                                            </div>
                                                        </div>
                                                        <div
                                                            class="flex-1 px-4 py-4 overflow-x-auto"
                                                        >
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
                                                    <thead
                                                        class="bg-gray-100 dark:bg-gray-800 sticky top-0"
                                                    >
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
                                                            v-for="(
                                                                row, rowIndex
                                                            ) in parsedCsvData.rows"
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
                                            <div
                                                v-else-if="outputFormat === 'sql'"
                                                ref="contentContainer"
                                                class="h-full overflow-y-auto scroll-smooth"
                                            >
                                                <div class="bg-gray-900 rounded-lg overflow-hidden">
                                                    <div class="flex">
                                                        <div
                                                            class="flex-shrink-0 px-4 py-4 text-right select-none bg-gray-800"
                                                        >
                                                            <div
                                                                v-for="(_, index) in content.split(
                                                                    '\n'
                                                                )"
                                                                :key="index"
                                                                class="text-gray-500 text-sm font-mono leading-6"
                                                            >
                                                                {{ index + 1 }}
                                                            </div>
                                                        </div>
                                                        <div
                                                            class="flex-1 px-4 py-4 overflow-x-auto"
                                                        >
                                                            <pre
                                                                class="text-sm font-mono leading-6"
                                                            ><code class="text-blue-300">{{ content }}</code></pre>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <!-- Shell Script View -->
                                            <div
                                                v-else-if="outputFormat === 'shell'"
                                                ref="contentContainer"
                                                class="h-full overflow-y-auto scroll-smooth"
                                            >
                                                <div class="bg-gray-900 rounded-lg overflow-hidden">
                                                    <div
                                                        class="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700"
                                                    >
                                                        <div class="flex gap-1.5">
                                                            <div
                                                                class="w-3 h-3 rounded-full bg-red-500"
                                                            />
                                                            <div
                                                                class="w-3 h-3 rounded-full bg-yellow-500"
                                                            />
                                                            <div
                                                                class="w-3 h-3 rounded-full bg-green-500"
                                                            />
                                                        </div>
                                                        <span
                                                            class="text-xs text-gray-400 font-mono"
                                                            >terminal</span
                                                        >
                                                    </div>
                                                    <div class="flex">
                                                        <div
                                                            class="flex-shrink-0 px-4 py-4 text-right select-none bg-gray-800/50"
                                                        >
                                                            <div
                                                                v-for="(_, index) in content.split(
                                                                    '\n'
                                                                )"
                                                                :key="index"
                                                                class="text-gray-500 text-sm font-mono leading-6"
                                                            >
                                                                {{ index + 1 }}
                                                            </div>
                                                        </div>
                                                        <div
                                                            class="flex-1 px-4 py-4 overflow-x-auto"
                                                        >
                                                            <pre
                                                                class="text-sm font-mono leading-6"
                                                            ><code class="text-green-400">{{ content }}</code></pre>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <!-- Mermaid Diagram View (Split) -->
                                            <div
                                                v-else-if="outputFormat === 'mermaid'"
                                                class="h-full grid gap-4"
                                                :class="
                                                    isPreviewMaximized
                                                        ? 'grid-cols-1'
                                                        : 'grid-cols-2'
                                                "
                                            >
                                                <!-- Left: Code -->
                                                <div
                                                    v-if="!isPreviewMaximized"
                                                    class="bg-gray-900 rounded-lg p-4 overflow-auto border border-gray-700"
                                                >
                                                    <div class="text-xs text-gray-500 mb-2">
                                                        {{ t('result.preview.mermaid_source') }}
                                                    </div>
                                                    <pre
                                                        class="font-mono text-sm text-gray-300 h-full"
                                                        >{{ content }}</pre
                                                    >
                                                </div>

                                                <!-- Right: Diagram -->
                                                <div
                                                    class="bg-gray-800 rounded-lg p-6 overflow-auto border border-gray-700 flex flex-col"
                                                >
                                                    <div
                                                        class="text-xs text-gray-500 mb-2 flex justify-between items-center"
                                                    >
                                                        <span>{{
                                                            t('result.preview.preview')
                                                        }}</span>
                                                        <button
                                                            @click="toggleMaximize"
                                                            class="text-blue-500 hover:text-blue-400 text-xs px-2 py-1 rounded hover:bg-white/5 transition-colors"
                                                            :title="
                                                                t(
                                                                    'result.preview.toggle_full_width'
                                                                )
                                                            "
                                                        >
                                                            {{
                                                                isPreviewMaximized
                                                                    ? t('result.preview.minimize')
                                                                    : t(
                                                                          'result.preview.full_screen'
                                                                      )
                                                            }}
                                                        </button>
                                                    </div>
                                                    <div
                                                        class="flex-1 flex items-center justify-center min-h-0"
                                                    >
                                                        <div
                                                            v-if="renderedMermaid"
                                                            v-html="renderedMermaid"
                                                            class="mermaid-container w-full h-full flex items-center justify-center p-4 bg-white/5 rounded"
                                                        />
                                                        <div
                                                            v-else
                                                            class="flex items-center justify-center"
                                                        >
                                                            <div
                                                                class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"
                                                            />
                                                        </div>
                                                    </div>
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
                                                        <span class="text-xs">{{
                                                            t('result.preview.view_svg_source')
                                                        }}</span>
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
                                                class="h-full flex flex-col items-center justify-center bg-gray-900/50 rounded-lg p-4"
                                            >
                                                <img
                                                    :src="
                                                        aiValue ||
                                                        (content.startsWith('data:')
                                                            ? content
                                                            : `data:image/png;base64,${content}`)
                                                    "
                                                    class="max-w-full max-h-full object-contain rounded shadow-lg"
                                                    alt="Generated Image"
                                                />
                                                <div class="mt-4 text-sm text-gray-500 font-mono">
                                                    {{ (content?.length || 0).toLocaleString() }}
                                                    {{ t('result.preview.bytes') }}
                                                </div>
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
                                                    {{ t('result.preview.video_not_supported') }}
                                                </video>
                                            </div>

                                            <!-- MP3 Audio View -->
                                            <div
                                                v-else-if="outputFormat === 'mp3'"
                                                class="h-full flex items-center justify-center"
                                            >
                                                <div
                                                    class="bg-gray-800 rounded-xl p-8 w-full max-w-md"
                                                >
                                                    <div
                                                        class="flex items-center justify-center mb-6"
                                                    >
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
                                                        {{
                                                            t('result.preview.audio_not_supported')
                                                        }}
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
                                                                v-for="(
                                                                    _, index
                                                                ) in parsedDiffLines"
                                                                :key="index"
                                                                class="text-gray-500 text-sm font-mono leading-6"
                                                            >
                                                                {{ index + 1 }}
                                                            </div>
                                                        </div>
                                                        <div class="flex-1 py-4 overflow-x-auto">
                                                            <div
                                                                v-for="(
                                                                    line, index
                                                                ) in parsedDiffLines"
                                                                :key="index"
                                                                class="px-4 text-sm font-mono leading-6"
                                                                :class="{
                                                                    'bg-green-900/50 text-green-300':
                                                                        line.type === 'added',
                                                                    'bg-red-900/50 text-red-300':
                                                                        line.type === 'removed',
                                                                    'bg-blue-900/30 text-blue-300':
                                                                        line.type === 'header',
                                                                    'text-gray-300':
                                                                        line.type === 'normal',
                                                                }"
                                                            >
                                                                {{ line.text }}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <!-- Log View -->
                                            <div
                                                v-else-if="outputFormat === 'log'"
                                                ref="contentContainer"
                                                class="h-full overflow-y-auto scroll-smooth"
                                            >
                                                <div class="bg-gray-900 rounded-lg overflow-hidden">
                                                    <div
                                                        class="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700"
                                                    >
                                                        <span class="text-sm text-gray-400">{{
                                                            t('result.preview.log_viewer')
                                                        }}</span>
                                                        <div
                                                            class="flex items-center gap-2 text-xs"
                                                        >
                                                            <span class="flex items-center gap-1"
                                                                ><span
                                                                    class="w-2 h-2 rounded-full bg-red-500"
                                                                />
                                                                {{
                                                                    t('result.preview.log_error')
                                                                }}</span
                                                            >
                                                            <span class="flex items-center gap-1"
                                                                ><span
                                                                    class="w-2 h-2 rounded-full bg-yellow-500"
                                                                />
                                                                {{
                                                                    t('result.preview.log_warn')
                                                                }}</span
                                                            >
                                                            <span class="flex items-center gap-1"
                                                                ><span
                                                                    class="w-2 h-2 rounded-full bg-blue-500"
                                                                />
                                                                {{
                                                                    t('result.preview.log_info')
                                                                }}</span
                                                            >
                                                            <span class="flex items-center gap-1"
                                                                ><span
                                                                    class="w-2 h-2 rounded-full bg-gray-500"
                                                                />
                                                                {{
                                                                    t('result.preview.log_debug')
                                                                }}</span
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
                                                                v-for="(
                                                                    line, index
                                                                ) in parsedLogLines"
                                                                :key="index"
                                                                class="px-4 text-sm font-mono leading-6"
                                                                :class="{
                                                                    'text-red-400':
                                                                        line.level === 'error',
                                                                    'text-yellow-400':
                                                                        line.level === 'warn',
                                                                    'text-blue-400':
                                                                        line.level === 'info',
                                                                    'text-gray-500':
                                                                        line.level === 'debug',
                                                                    'text-gray-300':
                                                                        line.level === 'normal',
                                                                }"
                                                            >
                                                                {{ line.text }}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <!-- Code View -->
                                            <div
                                                v-else-if="outputFormat === 'code'"
                                                ref="contentContainer"
                                                class="h-full overflow-y-auto scroll-smooth"
                                            >
                                                <div class="bg-gray-900 rounded-lg overflow-hidden">
                                                    <div
                                                        class="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700"
                                                    >
                                                        <span
                                                            class="text-sm text-gray-400 font-mono"
                                                            >{{ codeLanguage }}</span
                                                        >
                                                    </div>
                                                    <div class="flex">
                                                        <div
                                                            class="flex-shrink-0 px-4 py-4 text-right select-none bg-gray-800"
                                                        >
                                                            <div
                                                                v-for="(_, index) in content.split(
                                                                    '\n'
                                                                )"
                                                                :key="index"
                                                                class="text-gray-500 text-sm font-mono leading-6"
                                                            >
                                                                {{ index + 1 }}
                                                            </div>
                                                        </div>
                                                        <div
                                                            class="flex-1 px-4 py-4 overflow-x-auto"
                                                        >
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
                                                <div
                                                    class="text-center text-gray-500 dark:text-gray-400"
                                                >
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
                                                    <p class="text-lg font-medium">
                                                        {{ t('result.preview.pdf_file') }}
                                                    </p>
                                                    <p class="text-sm mt-1 mb-4">
                                                        {{ t('result.preview.download_pdf_desc') }}
                                                    </p>
                                                    <button
                                                        class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                                                        @click="handleDownload"
                                                    >
                                                        {{ t('result.preview.download_pdf') }}
                                                    </button>
                                                </div>
                                            </div>

                                            <!-- Default/Unknown View -->
                                            <div
                                                v-else
                                                ref="contentContainer"
                                                class="h-full overflow-y-auto scroll-smooth"
                                            >
                                                <div
                                                    class="bg-gray-50 dark:bg-gray-800 rounded-lg p-6"
                                                >
                                                    <pre
                                                        class="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap font-mono"
                                                        >{{ content }}</pre
                                                    >
                                                </div>
                                            </div>

                                            <!-- Integrated Interaction Log -->
                                            <div
                                                v-if="!selectedFile && sortedTranscript.length > 0"
                                                class="mt-8 pt-8 border-t border-gray-200 dark:border-gray-700"
                                            >
                                                <h3
                                                    class="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 px-2"
                                                >
                                                    {{ t('result.preview.interaction_log') }}
                                                </h3>
                                                <div class="space-y-4">
                                                    <div
                                                        v-for="(item, index) in sortedTranscript"
                                                        :key="index"
                                                        class="flex flex-col gap-2"
                                                    >
                                                        <div
                                                            class="flex items-center gap-2 text-xs text-gray-500"
                                                        >
                                                            <span
                                                                class="font-bold uppercase"
                                                                :class="{
                                                                    'text-blue-600':
                                                                        item.role === 'assistant',
                                                                    'text-green-600':
                                                                        item.role === 'user',
                                                                    'text-gray-600':
                                                                        item.role === 'system',
                                                                }"
                                                                >{{ item.role }}</span
                                                            >
                                                            <span>{{
                                                                new Date(
                                                                    item.timestamp
                                                                ).toLocaleTimeString()
                                                            }}</span>
                                                        </div>

                                                        <div
                                                            v-if="
                                                                item.role === 'assistant' &&
                                                                item.type === 'message'
                                                            "
                                                            class="prose dark:prose-invert max-w-none bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm text-sm"
                                                        >
                                                            <div
                                                                v-if="
                                                                    Array.isArray(
                                                                        (item.metadata?.raw as any)
                                                                            ?.content
                                                                    )
                                                                "
                                                            >
                                                                <div
                                                                    v-for="(block, bIdx) in (
                                                                        item.metadata?.raw as any
                                                                    ).content"
                                                                    :key="bIdx"
                                                                >
                                                                    <div
                                                                        v-if="block.type === 'text'"
                                                                        v-html="
                                                                            renderMarkdownContent(
                                                                                block.text
                                                                            )
                                                                        "
                                                                    ></div>
                                                                    <div
                                                                        v-else-if="
                                                                            block.type ===
                                                                            'tool_use'
                                                                        "
                                                                        class="text-xs text-gray-500 italic mt-2"
                                                                    >
                                                                        {{
                                                                            t(
                                                                                'result.preview.tool_call'
                                                                            )
                                                                        }}: {{ block.name }}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div v-else>
                                                                {{ t('result.preview.no_content') }}
                                                            </div>
                                                        </div>

                                                        <div
                                                            v-else-if="
                                                                item.role === 'user' &&
                                                                item.type === 'tool_result'
                                                            "
                                                            class="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-mono overflow-x-auto"
                                                        >
                                                            <div
                                                                v-if="
                                                                    (item.metadata?.result as any)
                                                                        ?.file
                                                                "
                                                                class="text-green-600 font-bold mb-1"
                                                            >
                                                                {{ t('result.preview.file_op') }}:
                                                                {{
                                                                    (item.metadata?.result as any)
                                                                        .file.filePath
                                                                }}
                                                            </div>
                                                            <pre>{{
                                                                (item.metadata?.result as any)?.file
                                                                    ?.content ||
                                                                JSON.stringify(
                                                                    item.metadata?.result,
                                                                    null,
                                                                    2
                                                                )
                                                            }}</pre>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <!-- Close Content Container (Preview) -->
                                </div>
                                <!-- Close Preview Area -->

                                <!-- Version History Sidebar -->
                                <div
                                    v-if="showVersionHistory"
                                    class="w-64 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-y-auto"
                                >
                                    <div class="p-4 space-y-4">
                                        <div class="space-y-2">
                                            <div
                                                class="text-xs font-semibold text-gray-500 uppercase"
                                            >
                                                {{ t('result.preview.version_history') }}
                                            </div>
                                            <div class="space-y-2">
                                                <!-- Current Version -->
                                                <div
                                                    class="flex flex-col p-3 rounded-lg text-sm border cursor-pointer transition-colors"
                                                    :class="
                                                        !selectedVersionId
                                                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                                                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300'
                                                    "
                                                    @click="handleResetVersion"
                                                >
                                                    <div
                                                        class="flex items-center justify-between mb-1"
                                                    >
                                                        <span
                                                            class="font-medium text-gray-900 dark:text-gray-100"
                                                        >
                                                            {{ t('result.preview.latest_version') }}
                                                        </span>
                                                        <span
                                                            v-if="!selectedVersionId"
                                                            class="text-xs text-blue-600 dark:text-blue-400 font-bold"
                                                        >
                                                            {{ t('result.preview.viewing') }}
                                                        </span>
                                                    </div>
                                                    <div class="text-xs text-gray-500">
                                                        {{
                                                            task?.completedAt
                                                                ? new Date(
                                                                      task.completedAt
                                                                  ).toLocaleString()
                                                                : t('result.preview.working')
                                                        }}
                                                    </div>
                                                </div>

                                                <!-- History Items -->
                                                <div
                                                    v-for="(item, index) in history"
                                                    :key="item.id"
                                                    class="flex flex-col p-3 rounded-lg text-sm border cursor-pointer transition-colors"
                                                    :class="
                                                        selectedVersionId === item.id
                                                            ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                                                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-blue-300'
                                                    "
                                                    @click="handleViewVersion(item)"
                                                >
                                                    <div
                                                        class="flex items-center justify-between mb-1"
                                                    >
                                                        <span
                                                            class="font-medium text-gray-900 dark:text-gray-100"
                                                        >
                                                            {{
                                                                t('result.preview.version_n', {
                                                                    n: history.length - index,
                                                                })
                                                            }}
                                                        </span>
                                                        <span class="text-xs text-gray-500">
                                                            {{
                                                                new Date(
                                                                    item.createdAt
                                                                ).toLocaleTimeString()
                                                            }}
                                                        </span>
                                                    </div>
                                                    <div class="text-xs text-gray-500 mt-1">
                                                        {{
                                                            new Date(
                                                                item.createdAt
                                                            ).toLocaleDateString()
                                                        }}
                                                    </div>
                                                </div>

                                                <div
                                                    v-if="history.length === 0"
                                                    class="text-center text-gray-500 text-xs py-4"
                                                >
                                                    {{ t('result.preview.no_version_history') }}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <!-- Close Upper Area -->
                        </div>
                    </div>

                    <!-- Global Footer Area (For Feedback) -->
                    <div
                        class="flex-shrink-0 flex flex-col border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 z-10"
                    >
                        <!-- Feedback Items List -->
                        <div v-if="feedbackItems.length > 0" class="px-4 pt-2 flex flex-wrap gap-2">
                            <div
                                v-for="item in feedbackItems"
                                :key="item.id"
                                class="flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs max-w-full overflow-hidden"
                            >
                                <span class="font-bold shrink-0"
                                    >[{{
                                        item.file
                                            ? item.file +
                                              ':' +
                                              (item.type === 'code'
                                                  ? t('result.preview.line') +
                                                    ' ' +
                                                    item.range?.startLineNumber
                                                  : t('result.preview.text'))
                                            : item.type === 'code'
                                              ? t('result.preview.line') +
                                                ' ' +
                                                item.range?.startLineNumber
                                              : t('result.preview.text')
                                    }}]</span
                                >
                                <span class="truncate max-w-[150px]">{{ item.comment }}</span>
                                <button
                                    @click="removeComment(item.id)"
                                    class="ml-1 text-blue-500 hover:text-blue-700 dark:hover:text-blue-200"
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        <!-- Feedback Section -->
                        <div class="p-4 border-b border-gray-200 dark:border-gray-700">
                            <label
                                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                            >
                                {{ t('result.preview.request_feedback') }}
                            </label>
                            <textarea
                                v-model="feedback"
                                rows="2"
                                class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none"
                                :placeholder="t('result.preview.feedback_placeholder')"
                            />
                        </div>

                        <!-- Actions -->
                        <div class="px-4 py-3">
                            <div class="flex items-center justify-between">
                                <button
                                    class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                                    @click="handleClose"
                                >
                                    {{ t('result.preview.close') }}
                                </button>
                                <div class="flex gap-2">
                                    <button
                                        class="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                        :disabled="!feedback.trim()"
                                        @click="handleRetry"
                                    >
                                        {{ t('result.preview.request_feedback') }}
                                    </button>
                                    <button
                                        v-if="task?.status === 'in_review'"
                                        class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                                        @click="handleApprove"
                                    >
                                        {{ t('result.preview.approve') }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>

    <!-- Comment Input Modal -->
    <Teleport to="body">
        <div
            v-if="isCommentModalOpen"
            class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
            <div
                class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6 border border-gray-200 dark:border-gray-700"
            >
                <h3 class="text-lg font-bold mb-4 text-gray-900 dark:text-gray-100">Add Comment</h3>

                <div
                    class="mb-4 max-h-32 overflow-y-auto bg-gray-100 dark:bg-gray-900 p-2 rounded text-xs font-mono text-gray-600 dark:text-gray-400"
                >
                    {{ pendingComment?.selection }}
                </div>

                <textarea
                    v-model="newCommentText"
                    class="w-full h-24 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none text-sm"
                    placeholder="Enter your comment or instruction here..."
                    autofocus
                    @keydown.enter.ctrl="saveComment"
                ></textarea>

                <div class="flex justify-end gap-2 mt-4">
                    <button
                        @click="closeCommentModal"
                        class="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                    >
                        Cancel
                    </button>
                    <button
                        @click="saveComment"
                        class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded font-medium disabled:opacity-50"
                        :disabled="!newCommentText.trim()"
                    >
                        Add Comment
                    </button>
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
