<script setup lang="ts">
/**
 * Project Info Modal
 *
 * Modal wrapper for ProjectInfoPanel to display project information
 * including main prompt, AI guidelines, and project stats
 */

import { computed, watch } from 'vue';
import ProjectInfoPanel from './ProjectInfoPanel.vue';
import { getAPI } from '../../utils/electron';

// ========================================
// Types
// ========================================

interface Project {
    id: number;
    title: string;
    description?: string | null;
    mainPrompt?: string | null;
    aiGuidelines?: string | null;
    projectGuidelines?: string | null;
    technicalStack?: string[] | null;
    status: string;
    aiProvider?: string | null;
    aiModel?: string | null;
    outputType?: string | null;
    outputPath?: string | null;
    baseDevFolder?: string | null;
    totalCost: number;
    totalTokens: number;
    estimatedHours?: number | null;
    actualHours?: number | null;
    createdAt: Date;
    updatedAt: Date;
}

// ========================================
// Props & Emits
// ========================================

const props = defineProps<{
    project: Project | any | null;
    open: boolean;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'edit'): void;
}>();

// ========================================
// Computed
// ========================================

const isOpen = computed(() => props.open && props.project !== null);

// ========================================
// Methods
// ========================================

function handleClose() {
    emit('close');
}

function handleEdit() {
    emit('edit');
}

async function handleOpenOutput() {
    if (!props.project?.outputPath) return;

    try {
        const api = getAPI();
        await api.shell.openPath(props.project.outputPath);
    } catch (error) {
        console.error('Failed to open output path:', error);
    }
}

async function handleUpdateGuidelines(guidelines: string) {
    if (!props.project) return;

    try {
        const api = getAPI();
        await api.projects.update(props.project.id, {
            projectGuidelines: guidelines,
        } as any);
        (props.project as any).projectGuidelines = guidelines;
    } catch (error) {
        console.error('Failed to update guidelines:', error);
    }
}

async function handleUpdateBaseFolder(folder: string) {
    if (!props.project) return;
    try {
        const api = getAPI();
        await api.projects.update(props.project.id, {
            baseDevFolder: folder || null,
        } as any);
        (props.project as any).baseDevFolder = folder || null;
    } catch (error) {
        console.error('Failed to update base folder:', error);
    }
}

async function handleUpdateAISettings(settings: {
    aiProvider: string | null;
    aiModel: string | null;
}) {
    if (!props.project) return;
    try {
        const api = getAPI();
        await api.projects.update(props.project.id, {
            aiProvider: settings.aiProvider,
            aiModel: settings.aiModel,
        } as any);
        (props.project as any).aiProvider = settings.aiProvider;
        (props.project as any).aiModel = settings.aiModel;
    } catch (error) {
        console.error('Failed to update AI settings:', error);
    }
}

async function handleUpdateMCPConfig(config: any) {
    if (!props.project) return;
    try {
        const api = getAPI();
        await api.projects.update(props.project.id, {
            mcpConfig: config,
        } as any);
        (props.project as any).mcpConfig = config;
    } catch (error) {
        console.error('Failed to update MCP config:', error);
    }
}

// Handle escape key
watch(
    () => props.open,
    (open, _oldVal, onCleanup) => {
        if (open) {
            const handleEscape = (e: KeyboardEvent) => {
                if (e.key === 'Escape') {
                    handleClose();
                }
            };
            window.addEventListener('keydown', handleEscape);
            onCleanup(() => window.removeEventListener('keydown', handleEscape));
        }
    }
);
</script>

<template>
    <Teleport to="body">
        <Transition
            enter-active-class="transition-opacity duration-200"
            enter-from-class="opacity-0"
            enter-to-class="opacity-100"
            leave-active-class="transition-opacity duration-200"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0"
        >
            <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
                <!-- Backdrop -->
                <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="handleClose" />

                <!-- Modal Container -->
                <Transition
                    enter-active-class="transition-all duration-200"
                    enter-from-class="opacity-0 scale-95"
                    enter-to-class="opacity-100 scale-100"
                    leave-active-class="transition-all duration-200"
                    leave-from-class="opacity-100 scale-100"
                    leave-to-class="opacity-0 scale-95"
                >
                    <div
                        v-if="isOpen && project"
                        class="relative w-full max-w-2xl max-h-[85vh] bg-gray-900 rounded-xl shadow-2xl border border-gray-700 overflow-hidden flex flex-col"
                    >
                        <!-- Modal Header -->
                        <div
                            class="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800/50"
                        >
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                                    :style="{
                                        backgroundColor: (project as any).color || '#3B82F6',
                                    }"
                                >
                                    {{ (project as any).emoji || '📁' }}
                                </div>
                                <div>
                                    <h2 class="text-lg font-semibold text-white">
                                        {{ project.title }}
                                    </h2>
                                    <p class="text-sm text-gray-400">프로젝트 정보</p>
                                </div>
                            </div>
                            <button
                                @click="handleClose"
                                class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <svg
                                    class="w-5 h-5"
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

                        <!-- Modal Content -->
                        <div class="flex-1 overflow-y-auto p-6">
                            <ProjectInfoPanel
                                :project="project"
                                @edit="handleEdit"
                                @open-output="handleOpenOutput"
                                @update-guidelines="handleUpdateGuidelines"
                                @update-base-folder="handleUpdateBaseFolder"
                                @update-ai-settings="handleUpdateAISettings"
                                @update-mcp-config="handleUpdateMCPConfig"
                            />
                        </div>

                        <!-- Modal Footer -->
                        <div class="px-6 py-4 border-t border-gray-700 bg-gray-800/50">
                            <div class="flex items-center justify-between">
                                <div class="text-sm text-gray-500">
                                    생성일:
                                    {{ new Date(project.createdAt).toLocaleDateString('ko-KR') }}
                                    <span class="mx-2">|</span>
                                    마지막 업데이트:
                                    {{ new Date(project.updatedAt).toLocaleDateString('ko-KR') }}
                                </div>
                                <button
                                    @click="handleClose"
                                    class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                                >
                                    닫기
                                </button>
                            </div>
                        </div>
                    </div>
                </Transition>
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
/* Custom scrollbar for modal content */
.overflow-y-auto::-webkit-scrollbar {
    width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}
</style>
