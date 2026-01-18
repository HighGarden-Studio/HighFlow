<script setup lang="ts">
/**
 * Version History Panel
 *
 * Displays version history for task results with diff viewing and rollback.
 */

import { ref, computed, onMounted } from 'vue';
import {
    resultVersioningService,
    type Version,
    type VersionDiff,
    type VersionHistory,
} from '../../services/versioning/ResultVersioningService';

// ========================================
// Props & Emits
// ========================================

const props = defineProps<{
    taskId: number;
    compact?: boolean;
}>();

const emit = defineEmits<{
    (e: 'rollback', version: Version): void;
    (e: 'view', version: Version): void;
    (e: 'close'): void;
}>();

// ========================================
// State
// ========================================

const history = ref<VersionHistory | null>(null);
const selectedVersionId = ref<string | null>(null);
const compareFromId = ref<string | null>(null);
const compareToId = ref<string | null>(null);
const currentDiff = ref<VersionDiff | null>(null);
const showDiff = ref(false);

// ========================================
// Computed
// ========================================

const versions = computed(() => history.value?.versions || []);

const selectedVersion = computed(() => {
    if (!selectedVersionId.value) return null;
    return versions.value.find((v) => v.id === selectedVersionId.value);
});

const isCurrentVersion = computed(() => {
    return selectedVersionId.value === history.value?.currentVersionId;
});

// ========================================
// Methods
// ========================================

function loadHistory(): void {
    history.value = resultVersioningService.getVersionHistory(props.taskId) || null;
    if (history.value && history.value.versions.length > 0) {
        selectedVersionId.value = history.value.currentVersionId;
    }
}

function selectVersion(version: Version): void {
    selectedVersionId.value = version.id;
    showDiff.value = false;
}

function viewVersion(version: Version): void {
    emit('view', version);
}

function startCompare(): void {
    if (!selectedVersion.value) return;
    compareToId.value = selectedVersion.value.id;
    compareFromId.value = null;
    showDiff.value = false;
}

function selectCompareFrom(version: Version): void {
    if (!compareToId.value) return;
    compareFromId.value = version.id;

    // Generate diff
    currentDiff.value = resultVersioningService.compareVersions(
        compareFromId.value,
        compareToId.value
    );
    showDiff.value = true;
}

function cancelCompare(): void {
    compareFromId.value = null;
    compareToId.value = null;
    showDiff.value = false;
    currentDiff.value = null;
}

function rollbackToVersion(version: Version): void {
    if (confirm(`v${version.versionNumber}으로 롤백하시겠습니까?\n새 버전이 생성됩니다.`)) {
        const result = resultVersioningService.rollback(
            props.taskId,
            version.versionNumber,
            '사용자 롤백'
        );

        if (result.success) {
            loadHistory();
            emit('rollback', version);
        } else {
            alert(result.error || '롤백에 실패했습니다.');
        }
    }
}

function formatDate(date: Date): string {
    return new Date(date).toLocaleString('ko-KR', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDiffClass(line: string): string {
    if (line.startsWith('+ ')) return 'bg-green-900/30 text-green-300';
    if (line.startsWith('- ')) return 'bg-red-900/30 text-red-300';
    return 'text-gray-400';
}

function isImageContent(content: string): boolean {
    // Check if content is base64 encoded image data
    // Base64 strings are typically long and don't contain newlines or special characters
    if (!content || content.length < 100) return false;

    // Check if it's pure base64 (alphanumeric + / + = only)
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    return base64Regex.test(content.trim());
}

function getImageDataUrl(content: string, metadata: Record<string, any>): string {
    // Get mime type from metadata or default to png
    const mime = metadata?.mime || metadata?.mimeType || 'image/png';

    // If content already starts with data:, return as-is
    if (content.startsWith('data:')) {
        return content;
    }

    // Convert base64 to data URL
    return `data:${mime};base64,${content}`;
}

// ========================================
// Lifecycle
// ========================================

onMounted(() => {
    loadHistory();
});
</script>

<template>
    <div class="version-history-panel bg-gray-800/50 rounded-lg border border-gray-700">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-gray-700">
            <div class="flex items-center space-x-2">
                <svg
                    class="w-5 h-5 text-purple-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                </svg>
                <h3 class="text-lg font-semibold text-gray-200">버전 기록</h3>
                <span class="text-sm text-gray-500">{{ versions.length }}개 버전</span>
            </div>
            <button
                class="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-gray-200"
                @click="emit('close')"
            >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                    />
                </svg>
            </button>
        </div>

        <div class="flex" :class="compact ? 'flex-col' : ''">
            <!-- Version List -->
            <div class="w-full md:w-1/3 border-r border-gray-700 p-4">
                <div class="space-y-2 max-h-96 overflow-y-auto">
                    <div
                        v-for="version in versions"
                        :key="version.id"
                        class="p-3 rounded-lg cursor-pointer transition-colors"
                        :class="{
                            'bg-blue-600/20 border border-blue-500':
                                selectedVersionId === version.id,
                            'bg-gray-900/30 hover:bg-gray-900/50': selectedVersionId !== version.id,
                            'ring-2 ring-green-500': version.id === history?.currentVersionId,
                        }"
                        @click="selectVersion(version)"
                    >
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-2">
                                <span class="font-medium text-gray-200"
                                    >v{{ version.versionNumber }}</span
                                >
                                <span
                                    v-if="version.id === history?.currentVersionId"
                                    class="text-xs px-1.5 py-0.5 bg-green-600/20 text-green-400 rounded"
                                >
                                    현재
                                </span>
                            </div>
                            <span class="text-xs text-gray-500">{{
                                formatSize(version.size)
                            }}</span>
                        </div>
                        <div class="mt-1 text-xs text-gray-500">
                            {{ formatDate(version.createdAt) }}
                        </div>
                        <div
                            v-if="version.metadata.reason"
                            class="mt-1 text-xs text-gray-400 truncate"
                        >
                            {{ version.metadata.reason }}
                        </div>
                        <div
                            v-if="version.metadata.labels?.length"
                            class="mt-1 flex flex-wrap gap-1"
                        >
                            <span
                                v-for="label in version.metadata.labels"
                                :key="label"
                                class="text-xs px-1.5 py-0.5 bg-purple-600/20 text-purple-400 rounded"
                            >
                                {{ label }}
                            </span>
                        </div>

                        <!-- Compare mode selection -->
                        <button
                            v-if="compareToId && !compareFromId && version.id !== compareToId"
                            class="mt-2 text-xs text-blue-400 hover:text-blue-300"
                            @click.stop="selectCompareFrom(version)"
                        >
                            이 버전과 비교
                        </button>
                    </div>
                </div>

                <!-- Empty State -->
                <div v-if="versions.length === 0" class="text-center py-8 text-gray-500">
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
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    <p class="mt-2 text-sm">버전 기록이 없습니다</p>
                </div>
            </div>

            <!-- Version Detail / Diff View -->
            <div class="flex-1 p-4">
                <!-- Diff View -->
                <div v-if="showDiff && currentDiff">
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center space-x-2">
                            <span class="text-sm text-gray-400">
                                v{{ currentDiff.fromVersionNumber }} → v{{
                                    currentDiff.toVersionNumber
                                }}
                            </span>
                            <span class="text-xs px-2 py-0.5 bg-gray-700 rounded text-gray-300">
                                +{{ currentDiff.stats.additions }} -{{
                                    currentDiff.stats.deletions
                                }}
                                ~{{ currentDiff.stats.changes }}
                            </span>
                        </div>
                        <button
                            class="text-sm text-gray-400 hover:text-gray-200"
                            @click="cancelCompare"
                        >
                            비교 닫기
                        </button>
                    </div>

                    <div
                        class="bg-gray-900 rounded-lg p-4 max-h-80 overflow-auto font-mono text-sm"
                    >
                        <div
                            v-for="(line, index) in currentDiff.diff.split('\n')"
                            :key="index"
                            class="px-2"
                            :class="getDiffClass(line)"
                        >
                            {{ line || ' ' }}
                        </div>
                    </div>
                </div>

                <!-- Version Detail -->
                <div v-else-if="selectedVersion">
                    <div class="flex items-center justify-between mb-4">
                        <h4 class="text-lg font-medium text-gray-200">
                            버전 {{ selectedVersion.versionNumber }}
                        </h4>
                        <div class="flex items-center space-x-2">
                            <button
                                class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm"
                                @click="startCompare"
                            >
                                비교
                            </button>
                            <button
                                v-if="!isCurrentVersion"
                                class="px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded text-sm"
                                @click="rollbackToVersion(selectedVersion)"
                            >
                                롤백
                            </button>
                            <button
                                class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm"
                                @click="viewVersion(selectedVersion)"
                            >
                                전체 보기
                            </button>
                        </div>
                    </div>

                    <!-- Metadata -->
                    <div class="grid grid-cols-2 gap-4 mb-4 text-sm">
                        <div>
                            <span class="text-gray-500">생성 시간</span>
                            <div class="text-gray-300">
                                {{ formatDate(selectedVersion.createdAt) }}
                            </div>
                        </div>
                        <div>
                            <span class="text-gray-500">크기</span>
                            <div class="text-gray-300">{{ formatSize(selectedVersion.size) }}</div>
                        </div>
                        <div v-if="selectedVersion.metadata.author">
                            <span class="text-gray-500">생성자</span>
                            <div class="text-gray-300">{{ selectedVersion.metadata.author }}</div>
                        </div>
                        <div v-if="selectedVersion.metadata.aiModel">
                            <span class="text-gray-500">AI 모델</span>
                            <div class="text-gray-300">{{ selectedVersion.metadata.aiModel }}</div>
                        </div>
                        <div v-if="selectedVersion.metadata.cost">
                            <span class="text-gray-500">비용</span>
                            <div class="text-gray-300">
                                ${{ selectedVersion.metadata.cost.toFixed(4) }}
                            </div>
                        </div>
                        <div v-if="selectedVersion.metadata.tokens">
                            <span class="text-gray-500">토큰</span>
                            <div class="text-gray-300">
                                {{ selectedVersion.metadata.tokens.toLocaleString() }}
                            </div>
                        </div>
                    </div>

                    <!-- Preview -->
                    <div>
                        <span class="text-sm text-gray-500">미리보기</span>
                        <div class="mt-2 bg-gray-900 rounded-lg p-4 max-h-64 overflow-auto">
                            <!-- Image Preview -->
                            <template v-if="isImageContent(selectedVersion.content)">
                                <img
                                    :src="
                                        getImageDataUrl(
                                            selectedVersion.content,
                                            selectedVersion.metadata
                                        )
                                    "
                                    alt="Result Image"
                                    class="max-w-full max-h-full object-contain rounded-lg"
                                />
                            </template>
                            <!-- Text Preview -->
                            <template v-else>
                                <pre class="text-sm text-gray-300 whitespace-pre-wrap font-mono"
                                    >{{ selectedVersion.content.slice(0, 1000)
                                    }}{{ selectedVersion.content.length > 1000 ? '...' : '' }}</pre
                                >
                            </template>
                        </div>
                    </div>
                </div>

                <!-- No Selection -->
                <div v-else class="text-center py-12 text-gray-500">
                    <p>버전을 선택하여 상세 정보를 확인하세요</p>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.version-history-panel {
    @apply w-full;
}

.max-h-96::-webkit-scrollbar,
.max-h-80::-webkit-scrollbar,
.max-h-64::-webkit-scrollbar {
    width: 6px;
}

.max-h-96::-webkit-scrollbar-track,
.max-h-80::-webkit-scrollbar-track,
.max-h-64::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}

.max-h-96::-webkit-scrollbar-thumb,
.max-h-80::-webkit-scrollbar-thumb,
.max-h-64::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
}

.max-h-96::-webkit-scrollbar-thumb:hover,
.max-h-80::-webkit-scrollbar-thumb:hover,
.max-h-64::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}
</style>
