<script setup lang="ts">
/**
 * Project Results Viewer
 *
 * Displays aggregated results from all tasks in a project with type-specific previews:
 * - Web: iframe preview or open in browser
 * - Image/Video: media preview
 * - Document: text/markdown preview
 * - Code: syntax highlighted preview
 * - Data: JSON/table view
 */

import { ref, computed, onMounted, watch } from 'vue';

// ========================================
// Types
// ========================================

interface TaskExecution {
    id: number;
    taskId: number;
    taskTitle?: string;
    response?: string;
    status: string;
    cost?: number;
    completedAt?: Date;
    aiProvider: string;
    model: string;
}

interface OutputFile {
    name: string;
    path: string;
    type: string;
    size: number;
    preview?: string;
}

interface Project {
    id: number;
    title: string;
    outputType?: string | null;
    outputPath?: string | null;
    status: string;
}

// ========================================
// Props & Emits
// ========================================

const props = defineProps<{
    project: Project;
    taskExecutions?: TaskExecution[];
    isWorkflowRunning?: boolean;
}>();

const emit = defineEmits<{
    (e: 'pause-workflow'): void;
    (e: 'resume-workflow'): void;
    (e: 'open-in-browser', path: string): void;
    (e: 'open-in-finder', path: string): void;
    (e: 'refresh'): void;
}>();

// ========================================
// State
// ========================================

const activeTab = ref<'results' | 'preview' | 'files'>('results');
const selectedExecution = ref<TaskExecution | null>(null);
const isLoading = ref(false);
const previewError = ref<string | null>(null);
const outputFiles = ref<OutputFile[]>([]);

// ========================================
// Computed
// ========================================

const outputType = computed(() => props.project.outputType || 'other');

const canPreview = computed(() => {
    const previewableTypes = ['web', 'image', 'video', 'document', 'code'];
    return previewableTypes.includes(outputType.value) && props.project.outputPath;
});

const previewUnavailableReason = computed(() => {
    if (!props.project.outputPath) {
        return {
            title: '결과물 경로 미설정',
            message: '프로젝트의 결과물 경로가 설정되지 않았습니다.',
            action: '프로젝트 설정에서 결과물 경로를 지정해주세요.',
        };
    }

    if (props.isWorkflowRunning) {
        return {
            title: '워크플로우 실행 중',
            message: '현재 태스크들이 실행 중입니다. 완료 후 미리보기가 가능합니다.',
            action: '일시정지 후 현재까지의 결과물을 확인할 수 있습니다.',
        };
    }

    if (outputFiles.value.length === 0) {
        return {
            title: '결과물 없음',
            message: '아직 생성된 결과물이 없습니다.',
            action: '태스크를 실행하여 결과물을 생성해주세요.',
        };
    }

    return null;
});

const completedExecutions = computed(() => {
    return (props.taskExecutions || []).filter((e) => e.status === 'success');
});

const totalResults = computed(() => completedExecutions.value.length);

const latestExecution = computed(() => {
    const sorted = [...completedExecutions.value].sort((a, b) => {
        const dateA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const dateB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return dateB - dateA;
    });
    return sorted[0] || null;
});

const aggregatedCost = computed(() => {
    return completedExecutions.value.reduce((sum, e) => sum + (e.cost || 0), 0);
});

// ========================================
// Methods
// ========================================

function selectExecution(execution: TaskExecution): void {
    selectedExecution.value = execution;
}

function handlePause(): void {
    emit('pause-workflow');
}

function handleOpenInBrowser(): void {
    if (props.project.outputPath) {
        emit('open-in-browser', props.project.outputPath);
    }
}

function handleOpenInFinder(): void {
    if (props.project.outputPath) {
        emit('open-in-finder', props.project.outputPath);
    }
}

function handleRefresh(): void {
    isLoading.value = true;
    emit('refresh');
    setTimeout(() => {
        isLoading.value = false;
    }, 1000);
}

function getFileIcon(type: string): string {
    const icons: Record<string, string> = {
        html: '🌐',
        css: '🎨',
        js: '⚡',
        ts: '📘',
        json: '📋',
        md: '📝',
        png: '🖼️',
        jpg: '🖼️',
        jpeg: '🖼️',
        gif: '🎞️',
        svg: '🎯',
        mp4: '🎬',
        pdf: '📑',
        txt: '📄',
    };
    const ext = type.toLowerCase().split('.').pop() || '';
    return icons[ext] || '📦';
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatResponse(response: string | undefined): string {
    if (!response) return '';
    // Truncate long responses for display
    if (response.length > 500) {
        return response.slice(0, 500) + '...';
    }
    return response;
}

// ========================================
// Lifecycle
// ========================================

async function loadOutputFiles(): Promise<void> {
    if (!props.project.outputPath) return;

    // In real implementation, this would call IPC to read directory
    // For now, using mock data structure
    isLoading.value = true;
    try {
        if (typeof window !== 'undefined' && window.electron?.fs) {
            const files = await window.electron.fs.readDir(props.project.outputPath);
            outputFiles.value = files.map((f: any) => ({
                name: f.name,
                path: f.path,
                type: f.name.split('.').pop() || 'unknown',
                size: f.size || 0,
            }));
        }
    } catch (error) {
        console.error('Failed to load output files:', error);
        previewError.value = '파일 목록을 불러올 수 없습니다';
    } finally {
        isLoading.value = false;
    }
}

onMounted(() => {
    loadOutputFiles();
});

watch(
    () => props.project.outputPath,
    () => {
        loadOutputFiles();
    }
);
</script>

<template>
    <div class="project-results-viewer bg-gray-800/50 rounded-lg border border-gray-700">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-gray-700">
            <div class="flex items-center space-x-3">
                <h3 class="text-lg font-semibold text-gray-200">프로젝트 결과물</h3>
                <span class="text-sm text-gray-500"> {{ totalResults }}개 완료 </span>
            </div>

            <div class="flex items-center space-x-2">
                <!-- Workflow Control -->
                <button
                    v-if="isWorkflowRunning"
                    class="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-sm flex items-center space-x-1"
                    @click="handlePause"
                >
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            fill-rule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                            clip-rule="evenodd"
                        />
                    </svg>
                    <span>일시정지</span>
                </button>

                <button
                    class="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-gray-200"
                    :class="{ 'animate-spin': isLoading }"
                    title="새로고침"
                    @click="handleRefresh"
                >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                    </svg>
                </button>
            </div>
        </div>

        <!-- Tabs -->
        <div class="flex border-b border-gray-700">
            <button
                class="px-4 py-2 text-sm font-medium transition-colors"
                :class="
                    activeTab === 'results'
                        ? 'text-blue-400 border-b-2 border-blue-400'
                        : 'text-gray-400 hover:text-gray-200'
                "
                @click="activeTab = 'results'"
            >
                실행 결과
            </button>
            <button
                class="px-4 py-2 text-sm font-medium transition-colors"
                :class="
                    activeTab === 'preview'
                        ? 'text-blue-400 border-b-2 border-blue-400'
                        : 'text-gray-400 hover:text-gray-200'
                "
                @click="activeTab = 'preview'"
            >
                미리보기
            </button>
            <button
                class="px-4 py-2 text-sm font-medium transition-colors"
                :class="
                    activeTab === 'files'
                        ? 'text-blue-400 border-b-2 border-blue-400'
                        : 'text-gray-400 hover:text-gray-200'
                "
                @click="activeTab = 'files'"
            >
                파일
            </button>
        </div>

        <!-- Content -->
        <div class="p-4">
            <!-- Results Tab -->
            <div v-if="activeTab === 'results'" class="space-y-4">
                <!-- Summary -->
                <div class="grid grid-cols-3 gap-3">
                    <div class="bg-gray-900/30 rounded-lg p-3 text-center">
                        <div class="text-2xl font-bold text-green-400">{{ totalResults }}</div>
                        <div class="text-xs text-gray-500">완료된 태스크</div>
                    </div>
                    <div class="bg-gray-900/30 rounded-lg p-3 text-center">
                        <div class="text-2xl font-bold text-blue-400">
                            ${{ aggregatedCost.toFixed(4) }}
                        </div>
                        <div class="text-xs text-gray-500">총 비용</div>
                    </div>
                    <div class="bg-gray-900/30 rounded-lg p-3 text-center">
                        <div class="text-2xl font-bold text-purple-400">
                            {{ outputFiles.length }}
                        </div>
                        <div class="text-xs text-gray-500">생성된 파일</div>
                    </div>
                </div>

                <!-- Execution List -->
                <div class="space-y-2 max-h-64 overflow-y-auto">
                    <div
                        v-for="execution in completedExecutions"
                        :key="execution.id"
                        class="p-3 bg-gray-900/30 rounded-lg cursor-pointer hover:bg-gray-900/50 transition-colors"
                        :class="{ 'ring-1 ring-blue-500': selectedExecution?.id === execution.id }"
                        @click="selectExecution(execution)"
                    >
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-2">
                                <span class="w-2 h-2 bg-green-400 rounded-full"></span>
                                <span class="text-sm text-gray-200">{{
                                    execution.taskTitle || `태스크 #${execution.taskId}`
                                }}</span>
                            </div>
                            <span class="text-xs text-gray-500">{{ execution.model }}</span>
                        </div>
                        <div
                            v-if="execution.response"
                            class="mt-2 text-xs text-gray-400 line-clamp-2"
                        >
                            {{ formatResponse(execution.response) }}
                        </div>
                    </div>
                </div>

                <!-- Empty State -->
                <div v-if="completedExecutions.length === 0" class="text-center py-8 text-gray-500">
                    <svg
                        class="mx-auto h-12 w-12 text-gray-600"
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
                    <p class="mt-2 text-sm">아직 완료된 실행 결과가 없습니다</p>
                </div>
            </div>

            <!-- Preview Tab -->
            <div v-else-if="activeTab === 'preview'" class="space-y-4">
                <!-- Preview Available -->
                <div v-if="canPreview && !previewUnavailableReason">
                    <!-- Web Preview -->
                    <div v-if="outputType === 'web'" class="space-y-3">
                        <div class="flex items-center justify-between">
                            <span class="text-sm text-gray-400">웹 프로젝트 미리보기</span>
                            <button
                                class="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm"
                                @click="handleOpenInBrowser"
                            >
                                브라우저에서 열기
                            </button>
                        </div>
                        <div
                            class="aspect-video bg-gray-900 rounded-lg overflow-hidden border border-gray-600"
                        >
                            <iframe
                                v-if="project.outputPath"
                                :src="`file://${project.outputPath}/index.html`"
                                class="w-full h-full"
                                sandbox="allow-scripts allow-same-origin"
                            />
                        </div>
                    </div>

                    <!-- Image Preview -->
                    <div v-else-if="outputType === 'image'" class="space-y-3">
                        <span class="text-sm text-gray-400">이미지 미리보기</span>
                        <div class="grid grid-cols-3 gap-2">
                            <div
                                v-for="file in outputFiles.filter((f) =>
                                    ['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(f.type)
                                )"
                                :key="file.path"
                                class="aspect-square bg-gray-900 rounded-lg overflow-hidden"
                            >
                                <img
                                    :src="`file://${file.path}`"
                                    :alt="file.name"
                                    class="w-full h-full object-cover"
                                />
                            </div>
                        </div>
                    </div>

                    <!-- Video Preview -->
                    <div v-else-if="outputType === 'video'" class="space-y-3">
                        <span class="text-sm text-gray-400">비디오 미리보기</span>
                        <div
                            v-for="file in outputFiles.filter((f) =>
                                ['mp4', 'webm', 'mov'].includes(f.type)
                            )"
                            :key="file.path"
                            class="aspect-video bg-gray-900 rounded-lg overflow-hidden"
                        >
                            <video :src="`file://${file.path}`" controls class="w-full h-full" />
                        </div>
                    </div>

                    <!-- Document/Code Preview -->
                    <div
                        v-else-if="outputType === 'document' || outputType === 'code'"
                        class="space-y-3"
                    >
                        <span class="text-sm text-gray-400">문서/코드 미리보기</span>
                        <div class="bg-gray-900 rounded-lg p-4 max-h-96 overflow-auto">
                            <pre class="text-sm text-gray-300 whitespace-pre-wrap font-mono">
                {{ latestExecution?.response || '미리보기 내용이 없습니다' }}
              </pre
                            >
                        </div>
                    </div>
                </div>

                <!-- Preview Unavailable -->
                <div v-else class="text-center py-12">
                    <div class="bg-gray-900/50 rounded-lg p-6 max-w-md mx-auto">
                        <svg
                            class="mx-auto h-16 w-16 text-gray-600 mb-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="1.5"
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="1.5"
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                        </svg>

                        <h4 class="text-lg font-medium text-gray-300 mb-2">
                            {{ previewUnavailableReason?.title || '미리보기 불가' }}
                        </h4>
                        <p class="text-sm text-gray-500 mb-4">
                            {{
                                previewUnavailableReason?.message || '미리보기를 표시할 수 없습니다'
                            }}
                        </p>
                        <p class="text-xs text-blue-400">
                            {{ previewUnavailableReason?.action }}
                        </p>

                        <button
                            v-if="isWorkflowRunning"
                            class="mt-4 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-sm"
                            @click="handlePause"
                        >
                            일시정지하고 확인하기
                        </button>
                    </div>
                </div>
            </div>

            <!-- Files Tab -->
            <div v-else-if="activeTab === 'files'" class="space-y-2">
                <!-- Actions -->
                <div class="flex justify-end mb-3">
                    <button
                        class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm flex items-center space-x-1"
                        @click="handleOpenInFinder"
                    >
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
                            />
                        </svg>
                        <span>폴더 열기</span>
                    </button>
                </div>

                <!-- File List -->
                <div
                    v-for="file in outputFiles"
                    :key="file.path"
                    class="flex items-center justify-between p-3 bg-gray-900/30 rounded-lg hover:bg-gray-900/50"
                >
                    <div class="flex items-center space-x-3">
                        <span class="text-xl">{{ getFileIcon(file.type) }}</span>
                        <div>
                            <div class="text-sm text-gray-200">{{ file.name }}</div>
                            <div class="text-xs text-gray-500">{{ formatFileSize(file.size) }}</div>
                        </div>
                    </div>
                </div>

                <!-- Empty State -->
                <div v-if="outputFiles.length === 0" class="text-center py-8 text-gray-500">
                    <svg
                        class="mx-auto h-12 w-12 text-gray-600"
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
                    <p class="mt-2 text-sm">생성된 파일이 없습니다</p>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.project-results-viewer {
    @apply w-full;
}

.line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

/* Custom scrollbar */
.max-h-64::-webkit-scrollbar,
.max-h-96::-webkit-scrollbar {
    width: 6px;
}

.max-h-64::-webkit-scrollbar-track,
.max-h-96::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}

.max-h-64::-webkit-scrollbar-thumb,
.max-h-96::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
}

.max-h-64::-webkit-scrollbar-thumb:hover,
.max-h-96::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}
</style>
