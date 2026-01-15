<script setup lang="ts">
/**
 * Local Agents Tab Component
 *
 * Tab for managing local AI coding agents (Claude Code, Codex)
 * Provides installation status check and terminal launch functionality
 */
import { ref, onMounted } from 'vue';
import { getAPI } from '../../utils/electron';
import { getProviderIcon } from '../../utils/iconMapping';
import IconRenderer from '../common/IconRenderer.vue';
import { useSettingsStore, type LocalAgent } from '../../renderer/stores/settingsStore';
import { useI18n } from 'vue-i18n';

const settingsStore = useSettingsStore();
const { t } = useI18n();

const selectedAgent = ref<LocalAgent | null>(null);
const showDetailModal = ref(false);
const isLaunching = ref(false);
const launchError = ref<string | null>(null);

// Check if agent is installed
async function checkAgentInstalled(agent: LocalAgent): Promise<void> {
    await settingsStore.checkLocalAgent(agent.id);
}

// Check all agents on mount
async function checkAllAgents(): Promise<void> {
    await Promise.all(settingsStore.localAgents.map((agent) => checkAgentInstalled(agent)));
}

// Launch agent in terminal
async function launchAgent(agent: LocalAgent): Promise<void> {
    isLaunching.value = true;
    launchError.value = null;

    try {
        const api = getAPI();
        await api.localAgents.launchInTerminal(agent.command);
    } catch (error) {
        console.error(`Failed to launch ${agent.name}:`, error);
        launchError.value = t('settings.agents.error_launch', { name: agent.name, error: error });
    } finally {
        isLaunching.value = false;
    }
}

// Open external URL
async function openExternal(url: string): Promise<void> {
    try {
        const api = getAPI();
        await api.shell.openExternal(url);
    } catch (error) {
        console.error('Failed to open URL:', error);
    }
}

// Copy install command to clipboard
async function copyInstallCommand(command: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(command);
    } catch (error) {
        console.error('Failed to copy command:', error);
    }
}

// Open detail modal
function openDetailModal(agent: LocalAgent): void {
    selectedAgent.value = agent;
    showDetailModal.value = true;
}

// Close detail modal
function closeDetailModal(): void {
    showDetailModal.value = false;
    selectedAgent.value = null;
}

// Lifecycle
onMounted(() => {
    checkAllAgents();
});
</script>

<template>
    <div class="local-agents-tab">
        <!-- Header -->
        <div class="mb-6">
            <h2 class="text-xl font-bold text-white mb-2">{{ t('settings.agents.header') }}</h2>
            <p class="text-gray-400 text-sm">
                {{ t('settings.agents.description') }}
            </p>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="bg-gray-800 rounded-lg p-4">
                <div class="text-2xl font-bold text-white">
                    {{ settingsStore.localAgents.length }}
                </div>
                <div class="text-gray-400 text-sm">{{ t('settings.agents.stats.supported') }}</div>
            </div>
            <div class="bg-gray-800 rounded-lg p-4">
                <div class="text-2xl font-bold text-green-400">
                    {{ settingsStore.localAgents.filter((a) => a.isInstalled).length }}
                </div>
                <div class="text-gray-400 text-sm">{{ t('settings.agents.stats.installed') }}</div>
            </div>
            <div class="bg-gray-800 rounded-lg p-4">
                <div class="text-2xl font-bold text-yellow-400">
                    {{
                        settingsStore.localAgents.filter((a) => !a.isInstalled && !a.isChecking)
                            .length
                    }}
                </div>
                <div class="text-gray-400 text-sm">
                    {{ t('settings.agents.stats.not_installed') }}
                </div>
            </div>
        </div>

        <!-- Refresh Button -->
        <div class="mb-4 flex justify-end">
            <button
                @click="checkAllAgents"
                class="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm transition-colors"
                :disabled="settingsStore.localAgents.some((a) => a.isChecking)"
            >
                <svg
                    class="w-4 h-4"
                    :class="{ 'animate-spin': settingsStore.localAgents.some((a) => a.isChecking) }"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
                </svg>
                {{ t('settings.agents.refresh_status') }}
            </button>
        </div>

        <!-- Agent Cards -->
        <div class="space-y-4">
            <div
                v-for="agent in settingsStore.localAgents"
                :key="agent.id"
                :class="[
                    'rounded-xl p-5 border-2 transition-all',
                    agent.isChecking
                        ? 'bg-gray-800 border-gray-600'
                        : agent.isInstalled
                          ? 'bg-green-900/20 border-green-700 hover:border-green-600'
                          : 'bg-gray-800 border-gray-700 hover:border-gray-600',
                ]"
            >
                <div class="flex items-start justify-between">
                    <!-- Agent Info -->
                    <div class="flex items-start gap-4">
                        <div
                            :class="[
                                'w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0',
                                agent.gradient,
                            ]"
                        >
                            <IconRenderer :icon="getProviderIcon(agent.id)" class="w-7 h-7" />
                        </div>
                        <div>
                            <div class="flex items-center gap-3">
                                <h3 class="text-lg font-semibold text-white">{{ agent.name }}</h3>
                                <!-- Installation Status -->
                                <span
                                    v-if="agent.isChecking"
                                    class="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-gray-700 text-gray-400"
                                >
                                    <svg
                                        class="w-3 h-3 animate-spin"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                        />
                                    </svg>
                                    {{ t('settings.agents.status.checking') }}
                                </span>
                                <span
                                    v-else-if="agent.isInstalled"
                                    class="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-green-900/30 text-green-400"
                                >
                                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path
                                            fill-rule="evenodd"
                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                            clip-rule="evenodd"
                                        />
                                    </svg>
                                    {{ t('settings.agents.status.installed') }}
                                    {{ agent.version ? `(v${agent.version})` : '' }}
                                </span>
                                <span
                                    v-else
                                    class="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-yellow-900/30 text-yellow-400"
                                >
                                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path
                                            fill-rule="evenodd"
                                            d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                            clip-rule="evenodd"
                                        />
                                    </svg>
                                    {{ t('settings.agents.status.not_installed') }}
                                </span>
                            </div>
                            <p class="text-gray-400 text-sm mt-1 max-w-md">
                                {{ t(agent.description) }}
                            </p>

                            <!-- API Key Requirement -->
                            <div
                                v-if="agent.requiresApiKey"
                                class="flex items-center gap-2 mt-2 text-xs text-gray-500"
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
                                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                                    />
                                </svg>
                                <span>{{
                                    t('settings.agents.status.env_var_needed', {
                                        env: agent.apiKeyEnvVar,
                                    })
                                }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <button
                            @click="openDetailModal(agent)"
                            class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                            :title="t('settings.agents.actions.details')"
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
                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </button>
                        <button
                            v-if="agent.isInstalled"
                            @click="launchAgent(agent)"
                            :disabled="isLaunching"
                            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            {{ t('settings.agents.actions.launch_terminal') }}
                        </button>
                        <button
                            v-else
                            @click="openExternal(agent.website)"
                            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            {{ t('settings.agents.actions.install_guide') }}
                        </button>
                    </div>
                </div>

                <!-- Installation Command (if not installed) -->
                <div
                    v-if="!agent.isInstalled && !agent.isChecking"
                    class="mt-4 pt-4 border-t border-gray-700"
                >
                    <div class="flex items-center justify-between">
                        <div class="flex-1">
                            <p class="text-xs text-gray-500 mb-2">
                                {{ t('settings.agents.actions.install_command') }}
                            </p>
                            <code
                                class="block px-3 py-2 bg-gray-900 rounded-lg text-sm text-green-400 font-mono"
                            >
                                {{ agent.installCommand }}
                            </code>
                        </div>
                        <button
                            @click="copyInstallCommand(agent.installCommand)"
                            class="ml-3 p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                            :title="t('settings.agents.actions.copy')"
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
                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Error Toast -->
        <Transition
            enter-active-class="transition-all duration-300"
            enter-from-class="opacity-0 translate-y-4"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-300"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 translate-y-4"
        >
            <div
                v-if="launchError"
                class="fixed bottom-4 right-4 px-4 py-3 bg-red-900/90 border border-red-700 rounded-lg shadow-lg max-w-md"
            >
                <div class="flex items-center gap-3">
                    <svg
                        class="w-5 h-5 text-red-400 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                    >
                        <path
                            fill-rule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                            clip-rule="evenodd"
                        />
                    </svg>
                    <p class="text-sm text-red-200">{{ launchError }}</p>
                    <button
                        @click="launchError = null"
                        class="ml-auto p-1 text-red-400 hover:text-red-300"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        </Transition>

        <!-- Detail Modal -->
        <Teleport to="body">
            <Transition
                enter-active-class="transition-opacity duration-200"
                enter-from-class="opacity-0"
                enter-to-class="opacity-100"
                leave-active-class="transition-opacity duration-200"
                leave-from-class="opacity-100"
                leave-to-class="opacity-0"
            >
                <div
                    v-if="showDetailModal && selectedAgent"
                    class="fixed inset-0 z-50 flex items-center justify-center p-4"
                >
                    <!-- Backdrop -->
                    <div
                        class="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        @click="closeDetailModal"
                    />

                    <!-- Modal -->
                    <div
                        class="relative w-full max-w-lg bg-gray-900 rounded-xl shadow-2xl border border-gray-700 overflow-hidden"
                    >
                        <!-- Header -->
                        <div
                            class="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800/50"
                        >
                            <div class="flex items-center gap-3">
                                <div
                                    :class="[
                                        'w-10 h-10 rounded-lg flex items-center justify-center text-xl',
                                        selectedAgent.gradient,
                                    ]"
                                >
                                    {{ selectedAgent.icon }}
                                </div>
                                <div>
                                    <h2 class="text-lg font-semibold text-white">
                                        {{ selectedAgent.name }}
                                    </h2>
                                    <p class="text-sm text-gray-400">
                                        {{ t('settings.agents.actions.details') }}
                                    </p>
                                </div>
                            </div>
                            <button
                                @click="closeDetailModal"
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

                        <!-- Content -->
                        <div class="p-6 space-y-4">
                            <p class="text-gray-300">{{ t(selectedAgent.description) }}</p>

                            <!-- Status -->
                            <div class="p-4 bg-gray-800 rounded-lg space-y-3">
                                <div class="flex items-center justify-between">
                                    <span class="text-gray-400 text-sm">{{
                                        t('settings.agents.refresh_status')
                                    }}</span>
                                    <span
                                        :class="[
                                            'px-2 py-1 rounded text-xs font-medium',
                                            selectedAgent.isInstalled
                                                ? 'bg-green-900/30 text-green-400'
                                                : 'bg-yellow-900/30 text-yellow-400',
                                        ]"
                                    >
                                        {{
                                            selectedAgent.isInstalled
                                                ? t('settings.agents.status.installed')
                                                : t('settings.agents.status.not_installed')
                                        }}
                                    </span>
                                </div>
                                <div
                                    v-if="selectedAgent.version"
                                    class="flex items-center justify-between"
                                >
                                    <span class="text-gray-400 text-sm">Version</span>
                                    <span class="text-white text-sm">{{
                                        selectedAgent.version
                                    }}</span>
                                </div>
                                <div class="flex items-center justify-between">
                                    <span class="text-gray-400 text-sm">Launcher Command</span>
                                    <code
                                        class="px-2 py-1 bg-gray-900 rounded text-sm text-green-400 font-mono"
                                    >
                                        {{ selectedAgent.command }}
                                    </code>
                                </div>
                                <div
                                    v-if="selectedAgent.requiresApiKey"
                                    class="flex items-center justify-between"
                                >
                                    <span class="text-gray-400 text-sm">Environment Variable</span>
                                    <code
                                        class="px-2 py-1 bg-gray-900 rounded text-sm text-amber-400 font-mono"
                                    >
                                        {{ selectedAgent.apiKeyEnvVar }}
                                    </code>
                                </div>
                            </div>

                            <!-- Install Command -->
                            <div>
                                <p class="text-sm text-gray-400 mb-2">
                                    {{ t('settings.agents.actions.install_command') }}
                                </p>
                                <div class="flex items-center gap-2">
                                    <code
                                        class="flex-1 px-3 py-2 bg-gray-800 rounded-lg text-sm text-green-400 font-mono"
                                    >
                                        {{ selectedAgent.installCommand }}
                                    </code>
                                    <button
                                        @click="copyInstallCommand(selectedAgent.installCommand)"
                                        class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                                        :title="t('settings.agents.actions.copy')"
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
                                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <!-- Links -->
                            <div class="flex gap-3 pt-2">
                                <button
                                    @click="openExternal(selectedAgent.website)"
                                    class="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
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
                                            d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                                        />
                                    </svg>
                                    {{ t('settings.agents.actions.website') }}
                                </button>
                                <button
                                    @click="openExternal(selectedAgent.docsUrl)"
                                    class="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
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
                                            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                                        />
                                    </svg>
                                    {{ t('settings.agents.actions.docs') }}
                                </button>
                            </div>
                        </div>

                        <!-- Footer -->
                        <div
                            class="px-6 py-4 border-t border-gray-700 bg-gray-800/50 flex justify-end gap-3"
                        >
                            <button
                                @click="closeDetailModal"
                                class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                                {{ t('settings.agents.actions.close') }}
                            </button>
                            <button
                                v-if="selectedAgent.isInstalled"
                                @click="
                                    launchAgent(selectedAgent);
                                    closeDetailModal();
                                "
                                :disabled="isLaunching"
                                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                {{ t('settings.agents.actions.launch_terminal') }}
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style scoped>
.local-agents-tab {
    @apply max-w-4xl;
}
</style>
