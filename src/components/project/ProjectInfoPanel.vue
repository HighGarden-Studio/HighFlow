<script setup lang="ts">
/**
 * Project Info Panel
 *
 * Displays detailed project information including:
 * - Main prompt / Initial instructions
 * - AI guidelines for task execution
 * - AI provider and model settings
 * - Output type and path
 * - Cost and token usage statistics
 */

import { computed, ref, watch } from 'vue';
import { marked } from 'marked';
import { useSettingsStore } from '../../renderer/stores/settingsStore';
import type { MCPConfig } from '@core/types/database';
import { getAPI } from '../../utils/electron';

const settingsStore = useSettingsStore();

// MCP 서버 타입 정의
type MCPServerInfo = {
    id: string;
    name: string;
    description?: string;
};

// ========================================
// Types
// ========================================

interface Project {
    id: number;
    title: string;
    description?: string | null;
    mainPrompt?: string | null;
    aiGuidelines?: string | null; // 레거시 지침서 필드
    projectGuidelines?: string | null; // 최신 프로젝트 지침
    technicalStack?: string[] | null; // 기술 스택
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
    project: Project;
    compact?: boolean;
}>();

const emit = defineEmits<{
    (e: 'edit'): void;
    (e: 'open-output'): void;
    (e: 'update-guidelines', guidelines: string): void;
    (e: 'update-base-folder', folder: string): void;
    (
        e: 'update-ai-settings',
        settings: { aiProvider: string | null; aiModel: string | null }
    ): void;
    (e: 'update-mcp-config', config: MCPConfig | null): void;
}>();

// ========================================
// State
// ========================================

const showGuidelines = ref(false);
const isEditingGuidelines = ref(false);
const editedGuidelines = ref('');
const editedBaseFolder = ref('');
const isEditingAI = ref(false);
const editedAIProvider = ref<string | null>(null);
const editedAIModel = ref<string | null>(null);
const isEditingMCP = ref(false);
const selectedMCPServers = ref<string[]>([]);
const mcpConfig = ref<
    Record<
        string,
        {
            env: Array<{ id: string; key: string; value: string }>;
            params: Array<{ id: string; key: string; value: string }>;
            notes: string;
        }
    >
>({});

// ========================================
// Computed
// ========================================

const aiProviderDisplay = computed(() => {
    const providers: Record<string, { name: string; color: string; icon: string }> = {
        openai: { name: 'OpenAI', color: 'text-green-400', icon: '🤖' },
        anthropic: { name: 'Anthropic', color: 'text-purple-400', icon: '🧠' },
        google: { name: 'Google AI', color: 'text-blue-400', icon: '🔷' },
        local: { name: 'Local', color: 'text-gray-400', icon: '💻' },
    };
    return (
        providers[props.project.aiProvider || ''] || {
            name: '미설정',
            color: 'text-gray-500',
            icon: '❓',
        }
    );
});

const aiModelDisplay = computed(() => {
    const models: Record<string, string> = {
        'gpt-4-turbo': 'GPT-4 Turbo',
        'gpt-4': 'GPT-4',
        'gpt-3.5-turbo': 'GPT-3.5 Turbo',
        'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
        'claude-3-opus': 'Claude 3 Opus',
        'claude-3-sonnet': 'Claude 3 Sonnet',
        'claude-3-haiku': 'Claude 3 Haiku',
        'gemini-pro': 'Gemini Pro',
        'gemini-ultra': 'Gemini Ultra',
    };
    return models[props.project.aiModel || ''] || props.project.aiModel || '미설정';
});

const outputTypeDisplay = computed(() => {
    const types: Record<string, { name: string; icon: string; description: string }> = {
        web: { name: '웹 프로젝트', icon: '🌐', description: 'HTML/CSS/JS 웹 애플리케이션' },
        document: { name: '문서', icon: '📄', description: 'Markdown, PDF 등 문서 파일' },
        image: { name: '이미지', icon: '🖼️', description: '이미지 생성/편집 결과물' },
        video: { name: '비디오', icon: '🎬', description: '비디오 컨텐츠' },
        code: { name: '코드', icon: '💻', description: '소스 코드 및 스크립트' },
        data: { name: '데이터', icon: '📊', description: 'JSON, CSV 등 데이터 파일' },
        other: { name: '기타', icon: '📦', description: '기타 형식의 결과물' },
    };
    return (
        types[props.project.outputType || ''] || {
            name: '미지정',
            icon: '❓',
            description: '결과물 타입이 지정되지 않음',
        }
    );
});

const statusDisplay = computed(() => {
    const statuses: Record<string, { name: string; color: string }> = {
        active: { name: '진행중', color: 'bg-green-500' },
        completed: { name: '완료', color: 'bg-blue-500' },
        archived: { name: '보관됨', color: 'bg-gray-500' },
        on_hold: { name: '보류', color: 'bg-yellow-500' },
    };
    return statuses[props.project.status] || { name: props.project.status, color: 'bg-gray-500' };
});

const formattedCost = computed(() => {
    return `$${props.project.totalCost.toFixed(4)}`;
});

const formattedTokens = computed(() => {
    if (props.project.totalTokens >= 1000000) {
        return `${(props.project.totalTokens / 1000000).toFixed(2)}M`;
    }
    if (props.project.totalTokens >= 1000) {
        return `${(props.project.totalTokens / 1000).toFixed(1)}K`;
    }
    return props.project.totalTokens.toString();
});

const truncatedPrompt = computed(() => {
    const prompt = props.project.mainPrompt || '';
    if (props.compact && prompt.length > 150) {
        return prompt.slice(0, 150) + '...';
    }
    return prompt;
});

const effectiveGuidelines = computed(
    () => props.project.projectGuidelines || props.project.aiGuidelines || ''
);
const renderedGuidelines = computed(() => {
    if (!effectiveGuidelines.value) return '';
    return marked(effectiveGuidelines.value);
});

const hasGuidelines = computed(() => {
    return !!effectiveGuidelines.value && effectiveGuidelines.value.trim().length > 0;
});

// MCP 서버 목록
const connectedMCPServers = computed<MCPServerInfo[]>(() => {
    // Renderer process에서는 electron API를 통해 MCP 서버 정보를 가져옴
    // 실제 MCP 서버 정보는 main process의 MCPManager가 관리
    // 여기서는 설정에서 연결된 MCP 서버 기본 정보만 표시
    const api = (window as any)?.electron;
    if (!api?.mcp?.listServers) {
        // Fallback: 기본 MCP 목록
        return [
            { id: 'filesystem', name: 'Filesystem', description: 'Local file operations' },
            { id: 'git', name: 'Git', description: 'Git repository operations' },
            { id: 'slack', name: 'Slack', description: 'Slack messaging' },
        ];
    }
    try {
        // API 호출 시도 (동기적으로 가능한 경우)
        return [];
    } catch {
        return [];
    }
});

// AI Provider 목록
const availableProviders = computed(() => {
    return settingsStore.aiProviders.filter((p) => p.enabled && p.apiKey);
});

// 선택된 provider의 사용 가능한 모델 목록
const availableModels = computed(() => {
    const providerId = isEditingAI.value ? editedAIProvider.value : props.project.aiProvider;
    if (!providerId) return [];

    // 기본 모델 목록 (실제로는 settingsStore에서 가져와야 함)
    const modelsByProvider: Record<string, string[]> = {
        google: [
            'gemini-1.5-flash',
            'gemini-1.5-flash-latest',
            'gemini-1.5-pro',
            'gemini-pro-vision',
        ],
        anthropic: [
            'claude-3-5-sonnet-20241022',
            'claude-3-5-sonnet-latest',
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307',
        ],
        openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
    };

    return modelsByProvider[providerId] || [];
});

// Init base folder display
watch(
    () => props.project,
    (project) => {
        editedBaseFolder.value = project?.baseDevFolder || '';
    },
    { immediate: true }
);

// ========================================
// Methods
// ========================================

function handleEdit(): void {
    emit('edit');
}

function handleOpenOutput(): void {
    emit('open-output');
}

function copyPrompt(): void {
    if (props.project.mainPrompt) {
        navigator.clipboard.writeText(props.project.mainPrompt);
    }
}

function toggleGuidelines(): void {
    showGuidelines.value = !showGuidelines.value;
}

function startEditGuidelines(): void {
    editedGuidelines.value = effectiveGuidelines.value || '';
    isEditingGuidelines.value = true;
}

function cancelEditGuidelines(): void {
    isEditingGuidelines.value = false;
    editedGuidelines.value = '';
}

function saveGuidelines(): void {
    emit('update-guidelines', editedGuidelines.value);
    isEditingGuidelines.value = false;
}

function copyGuidelines(): void {
    if (effectiveGuidelines.value) {
        navigator.clipboard.writeText(effectiveGuidelines.value);
    }
}

function saveBaseFolder(): void {
    emit('update-base-folder', editedBaseFolder.value);
}

async function pickBaseFolder(): Promise<void> {
    const dir = await (window as any)?.electron?.fs?.selectDirectory?.();
    if (dir) {
        editedBaseFolder.value = dir;
        saveBaseFolder();
    }
}

function startEditAI(): void {
    editedAIProvider.value = props.project.aiProvider || null;
    editedAIModel.value = props.project.aiModel || null;
    isEditingAI.value = true;
}

function cancelEditAI(): void {
    isEditingAI.value = false;
    editedAIProvider.value = null;
    editedAIModel.value = null;
}

function saveAISettings(): void {
    emit('update-ai-settings', {
        aiProvider: editedAIProvider.value,
        aiModel: editedAIModel.value,
    });
    isEditingAI.value = false;
}

// MCP 관련 함수
function startEditMCP(): void {
    // 프로젝트의 기존 MCP 설정 로드
    const projectMCP = props.project.mcpConfig || {};
    selectedMCPServers.value = Object.keys(projectMCP);

    // 기존 설정을 UI 형식으로 변환
    mcpConfig.value = {};
    for (const [serverId, config] of Object.entries(projectMCP)) {
        const envPairs: Array<{ id: string; key: string; value: string }> = [];
        const paramPairs: Array<{ id: string; key: string; value: string }> = [];

        if (config.env) {
            for (const [k, v] of Object.entries(config.env)) {
                envPairs.push({ id: `${Date.now()}-${Math.random()}`, key: k, value: String(v) });
            }
        }
        if (config.params) {
            for (const [k, v] of Object.entries(config.params)) {
                paramPairs.push({ id: `${Date.now()}-${Math.random()}`, key: k, value: String(v) });
            }
        }

        mcpConfig.value[serverId] = {
            env: envPairs,
            params: paramPairs,
            notes: (config.context as any)?.notes || '',
        };
    }

    isEditingMCP.value = true;
}

function cancelEditMCP(): void {
    isEditingMCP.value = false;
    selectedMCPServers.value = [];
    mcpConfig.value = {};
}

function toggleMCPServer(serverId: string): void {
    const idx = selectedMCPServers.value.indexOf(serverId);
    if (idx >= 0) {
        selectedMCPServers.value.splice(idx, 1);
        delete mcpConfig.value[serverId];
    } else {
        selectedMCPServers.value.push(serverId);
        ensureMCPConfigEntry(serverId);
    }
}

function ensureMCPConfigEntry(serverId: string) {
    if (!mcpConfig.value[serverId]) {
        mcpConfig.value[serverId] = {
            env: [],
            params: [],
            notes: '',
        };
    }
    return mcpConfig.value[serverId];
}

function addEnvRow(serverId: string): void {
    const entry = ensureMCPConfigEntry(serverId);
    entry.env.push({ id: `${Date.now()}-${Math.random()}`, key: '', value: '' });
}

function removeEnvRow(serverId: string, rowId: string): void {
    const entry = mcpConfig.value[serverId];
    if (entry) {
        entry.env = entry.env.filter((row) => row.id !== rowId);
    }
}

function addParamRow(serverId: string): void {
    const entry = ensureMCPConfigEntry(serverId);
    entry.params.push({ id: `${Date.now()}-${Math.random()}`, key: '', value: '' });
}

function removeParamRow(serverId: string, rowId: string): void {
    const entry = mcpConfig.value[serverId];
    if (entry) {
        entry.params = entry.params.filter((row) => row.id !== rowId);
    }
}

function saveMCPSettings(): void {
    // UI 형식을 MCP Config 형식으로 변환
    const payload: MCPConfig = {};

    for (const serverId of selectedMCPServers.value) {
        const entry = mcpConfig.value[serverId];
        if (!entry) continue;

        const env: Record<string, string> = {};
        for (const row of entry.env) {
            if (row.key.trim()) {
                env[row.key.trim()] = row.value;
            }
        }

        const params: Record<string, string> = {};
        for (const row of entry.params) {
            if (row.key.trim()) {
                params[row.key.trim()] = row.value;
            }
        }

        const configEntry: Record<string, unknown> = {};
        if (Object.keys(env).length > 0) {
            configEntry.env = env;
        }
        if (Object.keys(params).length > 0) {
            configEntry.params = params;
        }
        if (entry.notes?.trim()) {
            configEntry.context = { notes: entry.notes.trim() };
        }

        if (Object.keys(configEntry).length > 0) {
            payload[serverId] = configEntry;
        }
    }

    emit('update-mcp-config', Object.keys(payload).length > 0 ? payload : null);
    isEditingMCP.value = false;
}
</script>

<template>
    <div class="project-info-panel bg-gray-800/50 rounded-lg border border-gray-700">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-gray-700">
            <div class="flex items-center space-x-3">
                <h3 class="text-lg font-semibold text-gray-200">프로젝트 정보</h3>
                <span
                    class="px-2 py-0.5 text-xs rounded-full text-white"
                    :class="statusDisplay.color"
                >
                    {{ statusDisplay.name }}
                </span>
            </div>
            <button
                @click="handleEdit"
                class="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-gray-200"
                title="편집"
            >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                </svg>
            </button>
        </div>

        <div class="p-4 space-y-4">
            <!-- Main Prompt Section -->
            <div v-if="project.mainPrompt" class="space-y-2">
                <div class="flex items-center justify-between">
                    <label class="text-sm font-medium text-gray-400">초기 프롬프트</label>
                    <button
                        @click="copyPrompt"
                        class="text-xs text-gray-500 hover:text-gray-300 flex items-center space-x-1"
                        title="복사"
                    >
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                        </svg>
                        <span>복사</span>
                    </button>
                </div>
                <div
                    class="bg-gray-900/50 rounded-lg p-3 text-sm text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto"
                >
                    {{ truncatedPrompt }}
                </div>
                <button
                    v-if="compact && project.mainPrompt && project.mainPrompt.length > 150"
                    class="text-xs text-blue-400 hover:text-blue-300"
                >
                    전체 보기
                </button>
            </div>

            <div v-else class="text-center py-4 text-gray-500 text-sm">
                초기 프롬프트가 설정되지 않았습니다
            </div>

            <!-- AI Guidelines Section -->
            <div class="space-y-2 border-t border-gray-700 pt-4">
                <div class="flex items-center justify-between">
                    <button
                        @click="toggleGuidelines"
                        class="flex items-center space-x-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
                    >
                        <svg
                            class="w-4 h-4 transition-transform"
                            :class="{ 'rotate-90': showGuidelines }"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M9 5l7 7-7 7"
                            />
                        </svg>
                        <span>AI 지침서</span>
                        <span
                            v-if="hasGuidelines"
                            class="px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-300 rounded"
                        >
                            설정됨
                        </span>
                        <span
                            v-else
                            class="px-1.5 py-0.5 text-xs bg-gray-600/50 text-gray-400 rounded"
                        >
                            미설정
                        </span>
                    </button>
                    <div v-if="hasGuidelines" class="flex items-center space-x-1">
                        <button
                            @click="copyGuidelines"
                            class="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-gray-200"
                            title="복사"
                        >
                            <svg
                                class="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                            </svg>
                        </button>
                        <button
                            @click="startEditGuidelines"
                            class="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-gray-200"
                            title="편집"
                        >
                            <svg
                                class="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Guidelines Content -->
                <div v-if="showGuidelines" class="space-y-3">
                    <!-- View Mode -->
                    <div
                        v-if="!isEditingGuidelines && hasGuidelines"
                        class="bg-gray-900/50 rounded-lg p-4 max-h-96 overflow-y-auto"
                    >
                        <div
                            class="guidelines-content prose prose-invert prose-sm max-w-none"
                            v-html="renderedGuidelines"
                        ></div>
                    </div>

                    <!-- Empty State -->
                    <div
                        v-else-if="!isEditingGuidelines && !hasGuidelines"
                        class="bg-gray-900/30 rounded-lg p-6 text-center"
                    >
                        <div class="text-gray-500 text-sm mb-3">
                            AI 지침서가 아직 생성되지 않았습니다.
                        </div>
                        <button
                            @click="startEditGuidelines"
                            class="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
                        >
                            지침서 작성하기
                        </button>
                    </div>

                    <!-- Edit Mode -->
                    <div v-if="isEditingGuidelines" class="space-y-3">
                        <textarea
                            v-model="editedGuidelines"
                            class="w-full h-64 bg-gray-900 border border-gray-600 rounded-lg p-3 text-sm text-gray-300 resize-y focus:outline-none focus:border-purple-500"
                            placeholder="AI 지침서를 마크다운 형식으로 작성하세요..."
                        ></textarea>
                        <div class="flex justify-end space-x-2">
                            <button
                                @click="cancelEditGuidelines"
                                class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
                            >
                                취소
                            </button>
                            <button
                                @click="saveGuidelines"
                                class="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
                            >
                                저장
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Base Dev Folder -->
            <div class="space-y-2 border-t border-gray-700 pt-4">
                <div class="flex items-center justify-between">
                    <label class="text-sm font-medium text-gray-400">개발 베이스 폴더</label>
                    <button
                        class="text-xs text-blue-400 hover:text-blue-300"
                        @click="pickBaseFolder"
                    >
                        폴더 선택
                    </button>
                </div>
                <div class="flex gap-2">
                    <input
                        v-model="editedBaseFolder"
                        type="text"
                        class="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
                        placeholder="/path/to/project"
                    />
                    <button
                        class="px-3 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
                        @click="saveBaseFolder"
                    >
                        저장
                    </button>
                </div>
                <p class="text-xs text-gray-500">
                    Local agent 실행 시 기본 작업 디렉토리로 사용됩니다.
                </p>
            </div>

            <!-- AI Settings -->
            <div class="space-y-3 border-t border-gray-700 pt-4">
                <div class="flex items-center justify-between">
                    <label class="text-sm font-medium text-gray-300">AI 설정</label>
                    <button
                        v-if="!isEditingAI"
                        @click="startEditAI"
                        class="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                    >
                        <svg
                            class="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                        </svg>
                        <span>편집</span>
                    </button>
                </div>

                <!-- View Mode -->
                <div v-if="!isEditingAI" class="grid grid-cols-2 gap-4">
                    <!-- AI Provider -->
                    <div class="space-y-1">
                        <label class="text-xs text-gray-500">AI 제공자</label>
                        <div class="flex items-center space-x-2">
                            <span>{{ aiProviderDisplay.icon }}</span>
                            <span :class="aiProviderDisplay.color" class="text-sm font-medium">
                                {{ aiProviderDisplay.name }}
                            </span>
                        </div>
                    </div>

                    <!-- AI Model -->
                    <div class="space-y-1">
                        <label class="text-xs text-gray-500">AI 모델</label>
                        <div class="text-sm font-medium text-gray-300">
                            {{ aiModelDisplay }}
                        </div>
                    </div>
                </div>

                <!-- Edit Mode -->
                <div v-else class="space-y-3">
                    <!-- AI Provider Select -->
                    <div class="space-y-1">
                        <label class="text-xs text-gray-400">AI 제공자</label>
                        <select
                            v-model="editedAIProvider"
                            class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                        >
                            <option :value="null">선택 안 함</option>
                            <option
                                v-for="provider in availableProviders"
                                :key="provider.id"
                                :value="provider.id"
                            >
                                {{ provider.name || provider.id }}
                            </option>
                        </select>
                    </div>

                    <!-- AI Model Select -->
                    <div v-if="editedAIProvider" class="space-y-1">
                        <label class="text-xs text-gray-400">AI 모델</label>
                        <select
                            v-model="editedAIModel"
                            class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                        >
                            <option :value="null">기본 모델 사용</option>
                            <option v-for="model in availableModels" :key="model" :value="model">
                                {{ model }}
                            </option>
                        </select>
                    </div>

                    <!-- Info Banner -->
                    <div class="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3">
                        <div class="flex items-start space-x-2">
                            <svg
                                class="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <div class="text-xs text-blue-300">
                                프로젝트의 기본 AI 설정입니다. 개별 태스크에서 다른 AI를 선택하지
                                않으면 이 설정을 사용합니다.
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex justify-end space-x-2">
                        <button
                            @click="cancelEditAI"
                            class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
                        >
                            취소
                        </button>
                        <button
                            @click="saveAISettings"
                            class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                        >
                            저장
                        </button>
                    </div>
                </div>
            </div>

            <!-- MCP 설정 -->
            <div class="space-y-3 border-t border-gray-700 pt-4">
                <div class="flex items-center justify-between">
                    <label class="text-sm font-medium text-gray-300">MCP 설정</label>
                    <button
                        v-if="!isEditingMCP"
                        @click="startEditMCP"
                        class="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                    >
                        <svg
                            class="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                        </svg>
                        <span>편집</span>
                    </button>
                </div>

                <!-- View Mode -->
                <div v-if="!isEditingMCP">
                    <div
                        v-if="project.mcpConfig && Object.keys(project.mcpConfig).length > 0"
                        class="space-y-2"
                    >
                        <div
                            v-for="(config, serverId) in project.mcpConfig"
                            :key="serverId"
                            class="bg-gray-900/30 rounded-lg p-3"
                        >
                            <div class="text-sm font-medium text-gray-300">{{ serverId }}</div>
                            <div class="text-xs text-gray-500 mt-1">
                                {{ Object.keys(config.env || {}).length }} 환경변수,
                                {{ Object.keys(config.params || {}).length }} 파라미터
                            </div>
                        </div>
                    </div>
                    <div v-else class="bg-gray-900/30 rounded-lg p-3">
                        <p class="text-xs text-gray-500">설정된 MCP 서버가 없습니다.</p>
                    </div>
                </div>

                <!-- Edit Mode -->
                <div v-else class="space-y-4">
                    <!-- MCP 서버 선택 -->
                    <div class="space-y-2">
                        <div v-if="connectedMCPServers.length === 0" class="text-sm text-gray-500">
                            연결된 MCP 서버가 없습니다. 설정에서 MCP 서버를 연결하세요.
                        </div>
                        <div v-else class="space-y-2">
                            <div
                                v-for="server in connectedMCPServers"
                                :key="server.id"
                                class="flex items-start space-x-2"
                            >
                                <input
                                    type="checkbox"
                                    :id="`mcp-${server.id}`"
                                    :checked="selectedMCPServers.includes(server.id)"
                                    @change="toggleMCPServer(server.id)"
                                    class="mt-1"
                                />
                                <label :for="`mcp-${server.id}`" class="flex-1 cursor-pointer">
                                    <div class="text-sm font-medium text-gray-300">
                                        {{ server.name }}
                                    </div>
                                    <div v-if="server.description" class="text-xs text-gray-500">
                                        {{ server.description }}
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- 선택된 MCP 서버 설정 -->
                    <div v-if="selectedMCPServers.length > 0" class="space-y-4">
                        <div
                            v-for="serverId in selectedMCPServers"
                            :key="`config-${serverId}`"
                            class="border border-gray-700 rounded-lg p-3 bg-gray-900/50"
                        >
                            <div class="text-sm font-semibold text-gray-200 mb-3">
                                {{ serverId }}
                            </div>

                            <!-- 환경변수 -->
                            <div class="space-y-2">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-medium text-gray-400">환경변수</span>
                                    <button
                                        type="button"
                                        @click="addEnvRow(serverId)"
                                        class="text-xs text-blue-400 hover:text-blue-300"
                                    >
                                        + 추가
                                    </button>
                                </div>
                                <div
                                    v-for="row in mcpConfig[serverId]?.env || []"
                                    :key="row.id"
                                    class="flex items-center gap-2"
                                >
                                    <input
                                        v-model="row.key"
                                        type="text"
                                        placeholder="KEY"
                                        class="flex-1 px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-white"
                                    />
                                    <input
                                        v-model="row.value"
                                        type="text"
                                        placeholder="VALUE"
                                        class="flex-1 px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-white"
                                    />
                                    <button
                                        type="button"
                                        @click="removeEnvRow(serverId, row.id)"
                                        class="text-gray-400 hover:text-red-400"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            <!-- 기본 파라미터 -->
                            <div class="space-y-2 mt-4">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-medium text-gray-400"
                                        >기본 파라미터</span
                                    >
                                    <button
                                        type="button"
                                        @click="addParamRow(serverId)"
                                        class="text-xs text-blue-400 hover:text-blue-300"
                                    >
                                        + 추가
                                    </button>
                                </div>
                                <div
                                    v-for="row in mcpConfig[serverId]?.params || []"
                                    :key="row.id"
                                    class="flex items-center gap-2"
                                >
                                    <input
                                        v-model="row.key"
                                        type="text"
                                        placeholder="필드명"
                                        class="flex-1 px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-white"
                                    />
                                    <input
                                        v-model="row.value"
                                        type="text"
                                        placeholder="기본값"
                                        class="flex-1 px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-white"
                                    />
                                    <button
                                        type="button"
                                        @click="removeParamRow(serverId, row.id)"
                                        class="text-gray-400 hover:text-red-400"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            <!-- 노트 -->
                            <div class="mt-4">
                                <label class="text-xs font-medium text-gray-400 block mb-1"
                                    >노트</label
                                >
                                <textarea
                                    v-model="mcpConfig[serverId].notes"
                                    rows="2"
                                    placeholder="이 MCP 서버 사용 시 참고사항..."
                                    class="w-full px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded text-white resize-none"
                                ></textarea>
                            </div>
                        </div>
                    </div>

                    <!-- Info Banner -->
                    <div class="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3">
                        <div class="flex items-start space-x-2">
                            <svg
                                class="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <div class="text-xs text-blue-300">
                                설정된 MCP는 프로젝트의 모든 태스크에서 기본으로 사용됩니다. 개별
                                태스크에서 다른 설정을 원하면 태스크 상세에서 변경할 수 있습니다.
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex justify-end space-x-2">
                        <button
                            @click="cancelEditMCP"
                            class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
                        >
                            취소
                        </button>
                        <button
                            @click="saveMCPSettings"
                            class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                        >
                            저장
                        </button>
                    </div>
                </div>
            </div>

            <!-- Output Settings -->
            <div class="space-y-2 border-t border-gray-700 pt-4">
                <!-- AI Provider -->
                <div class="space-y-1">
                    <label class="text-xs text-gray-500">AI 제공자</label>
                    <div class="flex items-center space-x-2">
                        <span>{{ aiProviderDisplay.icon }}</span>
                        <span :class="aiProviderDisplay.color" class="text-sm font-medium">
                            {{ aiProviderDisplay.name }}
                        </span>
                    </div>
                </div>

                <!-- AI Model -->
                <div class="space-y-1">
                    <label class="text-xs text-gray-500">AI 모델</label>
                    <div class="text-sm font-medium text-gray-300">
                        {{ aiModelDisplay }}
                    </div>
                </div>
            </div>

            <div class="space-y-2">
                <label class="text-xs text-gray-500">결과물 타입</label>
                <div class="flex items-center space-x-3 bg-gray-900/30 rounded-lg p-3">
                    <span class="text-2xl">{{ outputTypeDisplay.icon }}</span>
                    <div>
                        <div class="text-sm font-medium text-gray-200">
                            {{ outputTypeDisplay.name }}
                        </div>
                        <div class="text-xs text-gray-500">{{ outputTypeDisplay.description }}</div>
                    </div>
                </div>
            </div>

            <!-- Output Path -->
            <div v-if="project.outputPath" class="space-y-1">
                <label class="text-xs text-gray-500">결과물 경로</label>
                <div class="flex items-center space-x-2">
                    <div
                        class="flex-1 bg-gray-900/50 rounded px-3 py-2 text-sm text-gray-400 font-mono truncate"
                    >
                        {{ project.outputPath }}
                    </div>
                    <button
                        @click="handleOpenOutput"
                        class="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors text-gray-300"
                        title="폴더 열기"
                    >
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                        </svg>
                    </button>
                </div>
            </div>

            <!-- Statistics -->
            <div class="grid grid-cols-2 gap-3 pt-3 border-t border-gray-700">
                <div class="bg-gray-900/30 rounded-lg p-3">
                    <div class="text-xs text-gray-500">총 비용</div>
                    <div class="text-lg font-semibold text-green-400">{{ formattedCost }}</div>
                </div>
                <div class="bg-gray-900/30 rounded-lg p-3">
                    <div class="text-xs text-gray-500">총 토큰</div>
                    <div class="text-lg font-semibold text-blue-400">{{ formattedTokens }}</div>
                </div>
            </div>

            <!-- Time Estimates -->
            <div
                v-if="project.estimatedHours || project.actualHours"
                class="grid grid-cols-2 gap-3"
            >
                <div v-if="project.estimatedHours" class="text-center">
                    <div class="text-xs text-gray-500">예상 시간</div>
                    <div class="text-sm text-gray-300">{{ project.estimatedHours }}시간</div>
                </div>
                <div v-if="project.actualHours" class="text-center">
                    <div class="text-xs text-gray-500">실제 시간</div>
                    <div class="text-sm text-gray-300">{{ project.actualHours }}시간</div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.project-info-panel {
    @apply w-full;
}

/* Custom scrollbar for prompt area */
.max-h-48::-webkit-scrollbar {
    width: 6px;
}

.max-h-48::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}

.max-h-48::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
}

.max-h-48::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}

/* Guidelines content scrollbar */
.max-h-96::-webkit-scrollbar {
    width: 6px;
}

.max-h-96::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}

.max-h-96::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
}

.max-h-96::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}

/* Guidelines markdown styling */
.guidelines-content :deep(h1) {
    @apply text-lg font-bold text-gray-200 mb-3 mt-4 first:mt-0;
}

.guidelines-content :deep(h2) {
    @apply text-base font-semibold text-gray-300 mb-2 mt-4 first:mt-0;
}

.guidelines-content :deep(h3) {
    @apply text-sm font-medium text-gray-300 mb-2 mt-3;
}

.guidelines-content :deep(p) {
    @apply text-sm text-gray-400 mb-2;
}

.guidelines-content :deep(ul) {
    @apply list-disc list-inside text-sm text-gray-400 mb-2 space-y-1;
}

.guidelines-content :deep(ol) {
    @apply list-decimal list-inside text-sm text-gray-400 mb-2 space-y-1;
}

.guidelines-content :deep(li) {
    @apply text-gray-400;
}

.guidelines-content :deep(code) {
    @apply bg-gray-800 px-1.5 py-0.5 rounded text-xs text-purple-300;
}

.guidelines-content :deep(pre) {
    @apply bg-gray-800 p-3 rounded-lg mb-2 overflow-x-auto;
}

.guidelines-content :deep(pre code) {
    @apply bg-transparent p-0;
}

.guidelines-content :deep(blockquote) {
    @apply border-l-2 border-purple-500 pl-3 italic text-gray-500 mb-2;
}

.guidelines-content :deep(hr) {
    @apply border-gray-700 my-4;
}

.guidelines-content :deep(strong) {
    @apply font-semibold text-gray-200;
}

.guidelines-content :deep(a) {
    @apply text-purple-400 hover:text-purple-300 underline;
}
</style>
