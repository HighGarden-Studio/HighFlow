<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Dialog, DialogPanel, TransitionChild, TransitionRoot } from '@headlessui/vue';
import { useProjectStore } from '@/stores/projectStore';
import FileTreeItem from '../task/FileTreeItem.vue';
import CodeEditor from '../common/CodeEditor.vue';
// import TerminalComponent from '../common/TerminalComponent.vue';

interface FileTreeNode {
    name: string;
    path: string;
    type: 'file' | 'folder';
    children?: FileTreeNode[];
    status?: 'created' | 'modified'; // Optional matching the FileTreeItem interface
}

const props = defineProps<{
    open: boolean;
    projectId: number;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
}>();

const projectStore = useProjectStore();
const selectedFile = ref<string | null>(null);
const fileContent = ref<string>('');
const isImage = ref(false);
const fileTree = ref<FileTreeNode[]>([]);
const isLoading = ref(false);
const loadingFile = ref(false);
const error = ref<string | null>(null);

const currentProject = computed(() => {
    return projectStore.currentProject?.id === props.projectId
        ? projectStore.currentProject
        : projectStore.projectById(props.projectId);
});

// Watch for open to load tree
watch(
    () => props.open,
    async (isOpen) => {
        if (isOpen && currentProject.value?.baseDevFolder) {
            await loadFileTree(currentProject.value.baseDevFolder);
        } else if (isOpen) {
            error.value = 'No base development folder configured for this project.';
        }
    }
);

async function loadFileTree(basePath: string) {
    isLoading.value = true;
    error.value = null;
    try {
        // Recursive function to build tree
        // Note: For deep trees, lazy loading might be better, but we'll start with full load for simplicity
        // as per the plan, relying on the fact that fs:readDir is shallow usually, so we'll implement a recursive loader
        // or just load top level. Let's try to load a reasonable depth or just top level and support expanding?
        // FileTreeItem supports children.
        // We'll implement a recursive loader that limits depth or just loads everything if not too huge.
        // Actually, FileTreeItem assumes we pass the full tree structure.

        fileTree.value = await buildTree(basePath);
    } catch (e: any) {
        console.error('Failed to load file tree:', e);
        error.value = `Failed to load file tree: ${e.message}`;
    } finally {
        isLoading.value = false;
    }
}

async function buildTree(dirPath: string, depth = 0): Promise<FileTreeNode[]> {
    if (depth > 5) return []; // Safety limit

    try {
        const entries = await window.electron.fs.readDir(dirPath);
        const nodes: FileTreeNode[] = [];

        // Sort: Directories first, then files
        entries.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) {
                return a.name.localeCompare(b.name);
            }
            return a.isDirectory ? -1 : 1;
        });

        for (const entry of entries) {
            const node: FileTreeNode = {
                name: entry.name,
                path: entry.path,
                type: entry.isDirectory ? 'folder' : 'file',
            };

            if (entry.isDirectory && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                node.children = await buildTree(entry.path, depth + 1);
            }

            nodes.push(node);
        }
        return nodes;
    } catch (e) {
        console.warn(`Failed to read dir ${dirPath}:`, e);
        return [];
    }
}

async function handleFileSelect(path: string) {
    selectedFile.value = path;
    loadingFile.value = true;
    error.value = null;
    isImage.value = false;
    fileContent.value = '';

    try {
        await window.electron.fs.stat(path);
        // Simple extension check
        const ext = path.split('.').pop()?.toLowerCase();

        if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')) {
            isImage.value = true;
            fileContent.value = `file://${path}`; // Electron should facilitate local file access or we use base64
            // For safety and compatibility, let's use base64 if needed, but file:// might work in some electron setups
            // Let's rely on base64 from backend to be safe if direct access is blocked.
            const b64 = await window.electron.fs.readFileBase64(path);
            fileContent.value = `data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${b64}`;
        } else {
            // Text file
            const content = await window.electron.fs.readFile(path);
            fileContent.value = content;
        }
    } catch (e: any) {
        console.error('Failed to read file:', e);
        error.value = `Failed to read file: ${e.message}`;
    } finally {
        loadingFile.value = false;
    }
}

function getLanguage(path: string): string {
    if (!path) return 'text';
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'js':
            return 'javascript';
        case 'ts':
            return 'typescript';
        case 'py':
            return 'python';
        case 'vue':
            return 'html'; // Monaco doesn't fully support vue out of box, html is close
        case 'html':
            return 'html';
        case 'css':
            return 'css';
        case 'json':
            return 'json';
        case 'md':
            return 'markdown';
        case 'sql':
            return 'sql';
        case 'sh':
            return 'shell';
        case 'dart':
            return 'dart';
        default:
            return 'text';
    }
}
</script>

<template>
    <TransitionRoot as="template" :show="open">
        <Dialog as="div" class="relative z-50" @close="emit('close')">
            <TransitionChild
                as="template"
                enter="ease-out duration-300"
                enter-from="opacity-0"
                enter-to="opacity-100"
                leave="ease-in duration-200"
                leave-from="opacity-100"
                leave-to="opacity-0"
            >
                <div class="fixed inset-0 bg-gray-900/75 transition-opacity" />
            </TransitionChild>

            <div class="fixed inset-0 z-10 overflow-y-auto">
                <div
                    class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0"
                >
                    <TransitionChild
                        as="template"
                        enter="ease-out duration-300"
                        enter-from="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        enter-to="opacity-100 translate-y-0 sm:scale-100"
                        leave="ease-in duration-200"
                        leave-from="opacity-100 translate-y-0 sm:scale-100"
                        leave-to="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                    >
                        <DialogPanel
                            class="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-7xl h-[85vh] flex flex-col"
                        >
                            <!-- Header -->
                            <div
                                class="border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex justify-between items-center bg-gray-50 dark:bg-gray-900"
                            >
                                <h3
                                    class="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2"
                                >
                                    <svg
                                        class="w-5 h-5 text-gray-500 dark:text-gray-400"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                        />
                                    </svg>
                                    Project Workspace
                                    <span
                                        class="text-xs font-normal text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded-full"
                                    >
                                        {{ currentProject?.baseDevFolder }}
                                    </span>
                                </h3>
                                <button
                                    class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none"
                                    @click="emit('close')"
                                >
                                    <svg
                                        class="h-6 w-6"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke-width="1.5"
                                        stroke="currentColor"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            d="M6 18L18 6M6 6l12 12"
                                        />
                                    </svg>
                                </button>
                            </div>

                            <!-- Body -->
                            <div class="flex-1 flex overflow-hidden">
                                <!-- Sidebar: File Tree -->
                                <div
                                    class="w-1/4 border-r border-gray-200 dark:border-gray-700 overflow-y-auto bg-gray-50 dark:bg-gray-800/50 p-2"
                                >
                                    <div v-if="isLoading" class="flex justify-center p-4">
                                        <svg
                                            class="animate-spin h-5 w-5 text-gray-500"
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                        >
                                            <circle
                                                class="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                stroke-width="4"
                                            ></circle>
                                            <path
                                                class="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            ></path>
                                        </svg>
                                    </div>
                                    <div
                                        v-else-if="error && !fileTree.length"
                                        class="text-red-500 text-sm p-2"
                                    >
                                        {{ error }}
                                    </div>
                                    <template v-else>
                                        <FileTreeItem
                                            v-for="node in fileTree"
                                            :key="node.path"
                                            :node="node"
                                            :selected-path="selectedFile || undefined"
                                            @select="handleFileSelect"
                                        />
                                        <div
                                            v-if="fileTree.length === 0"
                                            class="text-gray-500 text-sm text-center mt-4"
                                        >
                                            No files found in {{ currentProject?.baseDevFolder }}
                                        </div>
                                    </template>
                                </div>

                                <!-- Main: Content Viewer -->
                                <div
                                    class="flex-1 flex flex-col bg-white dark:bg-gray-800 overflow-hidden relative"
                                >
                                    <div
                                        v-if="!selectedFile"
                                        class="flex-1 flex flex-col items-center justify-center text-gray-400"
                                    >
                                        <svg
                                            class="w-16 h-16 mb-4 opacity-20"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                            />
                                        </svg>
                                        <p>Select a file to preview</p>
                                    </div>
                                    <div v-else class="flex-1 flex flex-col h-full overflow-hidden">
                                        <!-- File Path Breadcrumb/Header -->
                                        <div
                                            class="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 truncate font-mono"
                                        >
                                            {{ selectedFile }}
                                        </div>

                                        <!-- Content -->
                                        <div class="flex-1 relative overflow-hidden">
                                            <div
                                                v-if="loadingFile"
                                                class="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-800/50 z-10"
                                            >
                                                <svg
                                                    class="animate-spin h-8 w-8 text-blue-500"
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <circle
                                                        class="opacity-25"
                                                        cx="12"
                                                        cy="12"
                                                        r="10"
                                                        stroke="currentColor"
                                                        stroke-width="4"
                                                    ></circle>
                                                    <path
                                                        class="opacity-75"
                                                        fill="currentColor"
                                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                    ></path>
                                                </svg>
                                            </div>

                                            <div
                                                v-if="isImage"
                                                class="h-full flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4"
                                            >
                                                <img
                                                    :src="fileContent"
                                                    class="max-w-full max-h-full object-contain shadow-lg rounded-md"
                                                />
                                            </div>

                                            <div v-else class="h-full">
                                                <CodeEditor
                                                    :model-value="fileContent"
                                                    :language="getLanguage(selectedFile) as any"
                                                    :readonly="true"
                                                    height="100%"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Terminal Pane (Bottom) -->
                            <div
                                class="h-64 border-t border-gray-200 dark:border-gray-700 flex flex-col bg-black"
                            >
                                <div
                                    class="flex items-center justify-between px-4 py-1 bg-gray-800 border-b border-gray-700"
                                >
                                    <span class="text-xs text-gray-400 font-mono"
                                        >Terminal &mdash; {{ currentProject?.baseDevFolder }}</span
                                    >
                                    <div class="flex items-center gap-2">
                                        <!-- Add resize handle or toggle here later -->
                                    </div>
                                </div>
                                <div class="flex-1 overflow-hidden relative">
                                    <!-- Terminal removed in favor of integrated bottom panel -->
                                    <div
                                        class="h-full flex items-center justify-center text-gray-500 bg-gray-900/50 text-xs"
                                    >
                                        Use the Terminal tab in the bottom console
                                    </div>
                                </div>
                            </div>
                        </DialogPanel>
                    </TransitionChild>
                </div>
            </div>
        </Dialog>
    </TransitionRoot>
</template>
