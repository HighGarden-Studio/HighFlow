<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useLocalAgentExecution } from '../../composables/useLocalAgentExecution';
import AIProviderSelector from './AIProviderSelector.vue';
import IconRenderer from './IconRenderer.vue';
import type { AIProvider } from '../../core/types/ai';

interface Props {
    // Mode
    mode: 'api' | 'local';

    // API Mode Props
    provider: AIProvider | null;
    model: string | null;

    // Local Agent Mode Props
    localAgent: string | null;

    // Environment
    isDevProject: boolean;

    // Label customization
    label?: string;
}

const props = withDefaults(defineProps<Props>(), {
    mode: 'api',
    provider: null,
    model: null,
    localAgent: null,
    isDevProject: false,
    label: 'AI 설정',
});

const emit = defineEmits<{
    (e: 'update:mode', value: 'api' | 'local'): void;
    (e: 'update:provider', value: AIProvider | null): void;
    (e: 'update:model', value: string | null): void;
    (e: 'update:localAgent', value: string | null): void;
}>();

// Local Agent Logic
const localAgentExecution = useLocalAgentExecution();

onMounted(async () => {
    // Check installed agents
    await localAgentExecution.checkInstalledAgents();
});

const availableLocalAgents = computed(() => {
    const agents: {
        id: string;
        name: string;
        icon: string;
        installed: boolean;
        version?: string;
    }[] = [
        { id: 'claude', name: 'Claude Code', icon: '🤖', installed: false },
        { id: 'codex', name: 'OpenAI Codex', icon: '💻', installed: false },
        { id: 'antigravity', name: 'Antigravity', icon: '🚀', installed: false },
    ];

    agents.forEach((agent) => {
        const status = localAgentExecution.installedAgents.value.get(agent.id as any);
        if (status) {
            agent.installed = status.installed;
            agent.version = status.version;
        }
    });

    return agents;
});

const hasInstalledLocalAgent = computed(() => {
    return props.isDevProject && availableLocalAgents.value.some((a) => a.installed);
});

// Handlers
function handleModeChange(newMode: 'api' | 'local') {
    emit('update:mode', newMode);
}

function handleLocalAgentSelect(agentId: string) {
    emit('update:localAgent', agentId);
}
</script>

<template>
    <div class="space-y-6">
        <!-- Execution Mode Selection -->
        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                {{ label }}
            </label>
            <div class="grid grid-cols-2 gap-3">
                <!-- API Mode -->
                <label
                    :class="[
                        'flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all',
                        mode === 'api'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
                    ]"
                >
                    <input
                        type="radio"
                        :checked="mode === 'api'"
                        @change="handleModeChange('api')"
                        class="sr-only"
                    />
                    <div
                        class="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-800 rounded-lg flex items-center justify-center"
                    >
                        <svg
                            class="w-6 h-6 text-blue-600 dark:text-blue-300"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                            />
                        </svg>
                    </div>
                    <div class="flex-1">
                        <span class="block text-sm font-medium text-gray-900 dark:text-white"
                            >AI API</span
                        >
                        <span class="text-xs text-gray-500 dark:text-gray-400"
                            >클라우드 AI 서비스 사용</span
                        >
                    </div>
                </label>

                <!-- Local Agent Mode -->
                <label
                    :class="[
                        'flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all',
                        mode === 'local'
                            ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600',
                        (!hasInstalledLocalAgent || !isDevProject) && 'opacity-50',
                    ]"
                >
                    <input
                        type="radio"
                        :checked="mode === 'local'"
                        @change="handleModeChange('local')"
                        :disabled="!hasInstalledLocalAgent || !isDevProject"
                        class="sr-only"
                    />
                    <div
                        class="flex-shrink-0 w-10 h-10 bg-green-100 dark:bg-green-800 rounded-lg flex items-center justify-center"
                    >
                        <svg
                            class="w-6 h-6 text-green-600 dark:text-green-300"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                            />
                        </svg>
                    </div>
                    <div class="flex-1">
                        <span class="block text-sm font-medium text-gray-900 dark:text-white"
                            >Local Agent</span
                        >
                        <span class="text-xs text-gray-500 dark:text-gray-400"
                            >로컬 CLI 에이전트 사용</span
                        >
                    </div>
                </label>
            </div>
        </div>

        <!-- Local Agent Settings -->
        <div
            v-if="mode === 'local' && isDevProject"
            class="space-y-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
        >
            <h4
                class="text-sm font-semibold text-green-800 dark:text-green-200 flex items-center gap-2"
            >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                </svg>
                Local Agent 설정
            </h4>

            <!-- Agent Selection -->
            <div>
                <label class="block text-sm font-medium text-green-700 dark:text-green-300 mb-2">
                    에이전트 선택
                </label>
                <div class="space-y-2">
                    <label
                        v-for="agent in availableLocalAgents"
                        :key="agent.id"
                        :class="[
                            'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                            localAgent === agent.id
                                ? 'border-green-500 bg-green-100 dark:bg-green-800/50'
                                : 'border-green-200 dark:border-green-700 hover:border-green-400',
                            !agent.installed && 'opacity-50 cursor-not-allowed',
                        ]"
                    >
                        <input
                            type="radio"
                            :checked="localAgent === agent.id"
                            @change="handleLocalAgentSelect(agent.id)"
                            :value="agent.id"
                            :disabled="!agent.installed"
                            class="sr-only"
                        />
                        <IconRenderer :emoji="agent.icon" class="w-5 h-5" />
                        <div class="flex-1">
                            <span class="text-sm font-medium text-gray-900 dark:text-white">{{
                                agent.name
                            }}</span>
                            <span
                                v-if="agent.version"
                                class="ml-2 text-xs text-green-600 dark:text-green-400"
                            >
                                v{{ agent.version }}
                            </span>
                        </div>
                        <span
                            :class="[
                                'px-2 py-1 text-xs rounded',
                                agent.installed
                                    ? 'bg-green-200 dark:bg-green-700 text-green-700 dark:text-green-200'
                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
                            ]"
                        >
                            {{ agent.installed ? '설치됨' : '미설치' }}
                        </span>
                    </label>
                </div>
            </div>
        </div>

        <!-- API Mode Settings -->
        <div v-if="mode === 'api'">
            <AIProviderSelector
                :provider="provider"
                :model="model"
                @update:provider="$emit('update:provider', $event)"
                @update:model="$emit('update:model', $event)"
                :label="label"
            />
        </div>
    </div>
</template>
