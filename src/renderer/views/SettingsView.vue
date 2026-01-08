<script setup lang="ts">
/**
 * Settings View
 *
 * Comprehensive application settings page
 */
import { ref, computed, onMounted } from 'vue';
import { useUIStore, type Theme } from '../stores/uiStore';
import { useSettingsStore, type AIProviderTag } from '../stores/settingsStore';
import { getProviderIcon } from '../../utils/iconMapping';
import AIProviderModal from '../../components/settings/AIProviderModal.vue';
import UserProfileSettings from '../../components/settings/UserProfileSettings.vue';
import IntegrationsSettings from '../../components/settings/IntegrationsSettings.vue';
import OperatorsTab from '../../components/settings/OperatorsTab.vue';
import MCPServersTab from '../../components/settings/MCPServersTab.vue';
import LocalAgentsTab from '../../components/settings/LocalAgentsTab.vue';
import CreditsTab from '../../components/settings/CreditsTab.vue';
import HelpTab from '../../components/settings/HelpTab.vue'; // Import HelpTab
import IconRenderer from '../../components/common/IconRenderer.vue';
import InitialSetupWizard from '../../components/setup/InitialSetupWizard.vue';
import { useI18n } from 'vue-i18n';

const { locale } = useI18n();
const currentLocale = computed({
    get: () => locale.value,
    set: (value) => {
        locale.value = value;
    },
});

const uiStore = useUIStore();
const settingsStore = useSettingsStore();

// Local state
const activeTab = ref<
    | 'general'
    | 'ai'
    | 'mcp'
    | 'agents'
    | 'operators'
    | 'integrations'
    | 'shortcuts'
    | 'profile'
    | 'credits'
    | 'data'
    | 'help' // Add help type
>('general');
const appInfo = ref<{ name: string; version: string; platform: string; isDev: boolean } | null>(
    null
);
const selectedProviderId = ref<string | null>(null);
const selectedProvider = computed(() => {
    if (!selectedProviderId.value) return null;
    return settingsStore.aiProviders.find((p) => p.id === selectedProviderId.value) || null;
});
const showProviderModal = ref(false);
const _showExportModal = ref(false);
const showImportModal = ref(false);
const importData = ref('');
const showSetupWizardFromSettings = ref(false);

// Tag filtering state
const selectedTags = ref<AIProviderTag[]>([]);

// Model refreshing state
const refreshingProviders = ref<Set<string>>(new Set());

// Filtered providers based on selected tags
const filteredProviders = computed(() => {
    if (selectedTags.value.length === 0) {
        return settingsStore.aiProviders;
    }
    return settingsStore.getProvidersByTags(selectedTags.value);
});

// Toggle tag selection
function toggleTag(tag: AIProviderTag) {
    const index = selectedTags.value.indexOf(tag);
    if (index === -1) {
        selectedTags.value.push(tag);
    } else {
        selectedTags.value.splice(index, 1);
    }
}

// Clear all selected tags
function clearTagFilter() {
    selectedTags.value = [];
}

// Get color for tag
function getTagColor(tag: AIProviderTag): string {
    const colors: Record<string, string> = {
        chat: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        code: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
        reasoning: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
        image: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
        'image-analysis':
            'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
        video: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
        audio: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
        tts: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
        stt: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300',
        music: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
        embedding: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
        search: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
        'long-context': 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
        fast: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        local: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
        'multi-modal': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
        agent: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
        'free-tier': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    };
    return colors[tag] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
}

// Computed
const currentTheme = computed(() => uiStore.theme);

// Actions
function setTheme(theme: Theme) {
    uiStore.setTheme(theme);
}

function openProviderModal(providerId: string) {
    selectedProviderId.value = providerId;
    showProviderModal.value = true;
}

function closeProviderModal() {
    showProviderModal.value = false;
    selectedProviderId.value = null;
}

async function handleProviderSave(config: any) {
    if (selectedProvider.value) {
        await settingsStore.updateAIProvider(selectedProvider.value.id, config);
        closeProviderModal();
    }
}

async function handleConnectOAuth() {
    if (selectedProvider.value) {
        await settingsStore.connectOAuth(selectedProvider.value.id);
    }
}

async function handleDisconnectOAuth() {
    if (selectedProvider.value) {
        await settingsStore.disconnectOAuth(selectedProvider.value.id);
    }
}

async function handleExportSettings() {
    const data = await settingsStore.exportSettings();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'workflow-settings.json';
    a.click();
    URL.revokeObjectURL(url);
}

async function handleImportSettings() {
    if (importData.value) {
        const success = await settingsStore.importSettings(importData.value);
        if (success) {
            showImportModal.value = false;
            importData.value = '';
        }
    }
}

async function handleResetSettings() {
    if (
        confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')
    ) {
        await settingsStore.resetToDefaults();
    }
}

async function handleRunSetupWizard() {
    await settingsStore.resetSetupWizard();
    showSetupWizardFromSettings.value = true;
}

async function handleSetupWizardComplete() {
    await settingsStore.completeSetupWizard();
    showSetupWizardFromSettings.value = false;
}

async function handleSetupWizardSkip() {
    await settingsStore.skipSetupWizard(false);
    showSetupWizardFromSettings.value = false;
}

// Model management functions
function getModelCount(providerId: string): number {
    return settingsStore.getProviderModels(providerId).length;
}

function getLastFetchTime(providerId: string): string {
    const fetchTime = settingsStore.getProviderModelsFetchTime(providerId);
    if (!fetchTime) return '미조회';

    const now = Date.now();
    const diff = now - fetchTime.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    return `${days}일 전`;
}

async function refreshProviderModels(providerId: string) {
    console.log(`[SettingsView] Refreshing models for provider: ${providerId}`);
    refreshingProviders.value.add(providerId);
    try {
        await settingsStore.refreshProviderModels(providerId);
        console.log(`[SettingsView] Models refreshed successfully for ${providerId}`);
    } catch (error) {
        console.error(`[SettingsView] Failed to refresh models:`, error);
    } finally {
        refreshingProviders.value.delete(providerId);
    }
}

// Helper to get provider gradient color
function getProviderGradient(providerId: string): string {
    const gradients: Record<string, string> = {
        // Major providers
        openai: 'bg-gradient-to-br from-green-400 to-teal-500',
        anthropic: 'bg-gradient-to-br from-orange-400 to-amber-500',
        google: 'bg-gradient-to-br from-blue-400 to-indigo-500',
        'azure-openai': 'bg-gradient-to-br from-cyan-500 to-blue-600',
        // Alternative providers
        mistral: 'bg-gradient-to-br from-purple-500 to-indigo-600',
        cohere: 'bg-gradient-to-br from-rose-500 to-pink-600',
        groq: 'bg-gradient-to-br from-amber-500 to-orange-600',
        perplexity: 'bg-gradient-to-br from-teal-500 to-cyan-600',
        together: 'bg-gradient-to-br from-violet-500 to-purple-600',
        fireworks: 'bg-gradient-to-br from-red-500 to-orange-600',
        deepseek: 'bg-gradient-to-br from-blue-600 to-indigo-700',
        // Local providers
        ollama: 'bg-gradient-to-br from-gray-600 to-gray-800',
        lmstudio: 'bg-gradient-to-br from-emerald-500 to-green-600',
        // Specialized providers
        openrouter: 'bg-gradient-to-br from-fuchsia-500 to-pink-600',
        huggingface: 'bg-gradient-to-br from-yellow-500 to-amber-600',
        replicate: 'bg-gradient-to-br from-slate-500 to-gray-600',
        // Image/Video providers
        stability: 'bg-gradient-to-br from-purple-600 to-pink-600',
        runway: 'bg-gradient-to-br from-blue-500 to-purple-600',
        pika: 'bg-gradient-to-br from-pink-500 to-rose-600',
        // Audio/TTS/Music providers
        'google-tts': 'bg-gradient-to-br from-blue-500 to-green-500',
        elevenlabs: 'bg-gradient-to-br from-black to-gray-700',
        suno: 'bg-gradient-to-br from-orange-600 to-red-600',
        // Chinese providers
        zhipu: 'bg-gradient-to-br from-blue-500 to-cyan-600',
        moonshot: 'bg-gradient-to-br from-indigo-600 to-purple-700',
        qwen: 'bg-gradient-to-br from-orange-500 to-red-600',
        baidu: 'bg-gradient-to-br from-blue-600 to-blue-800',
    };
    return gradients[providerId] || 'bg-gradient-to-br from-gray-400 to-gray-500';
}

// Lifecycle
onMounted(async () => {
    console.log('========================================');
    console.log('[SettingsView] Component MOUNTED');
    console.log('[SettingsView] AI Providers:', settingsStore.aiProviders.length);
    console.log('========================================');
    if (window.electron?.app) {
        appInfo.value = await window.electron.app.getInfo();
    }
    await settingsStore.loadSettings();
});

// Tab definitions
type TabId =
    | 'general'
    | 'ai'
    | 'mcp'
    | 'agents'
    | 'integrations'
    | 'shortcuts'
    | 'profile'
    | 'credits'
    | 'operators'
    | 'operators'
    | 'data'
    | 'help'; // Add help type

const tabs: { id: TabId; label: string; icon: string; description?: string }[] = [
    {
        id: 'general',
        label: 'General',
        icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
    },
    {
        id: 'ai',
        label: 'AI Providers',
        icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    },
    {
        id: 'mcp',
        label: 'MCP Servers',
        icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
    },
    {
        id: 'agents',
        label: 'Local Agents',
        icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    },
    {
        id: 'integrations',
        label: 'Integrations',
        icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
    },
    {
        id: 'shortcuts',
        label: 'Shortcuts',
        icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
    },
    {
        id: 'profile',
        label: 'Profile',
        icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    },
    {
        id: 'credits',
        label: 'Credits',
        icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
    },
    {
        id: 'operators',
        label: 'AI Operators',
        icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
        description: 'Manage AI agent presets',
    },
    {
        id: 'data',
        label: 'Data',
        icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4',
    },
    {
        id: 'help',
        label: 'Help',
        icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    },
];
</script>

<template>
    <div class="flex-1 flex flex-col h-full bg-gray-50 dark:bg-gray-900">
        <!-- Header -->
        <header
            class="border-b border-gray-200 dark:border-gray-800 px-6 py-4 bg-white dark:bg-gray-900"
        >
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
            <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">
                Configure your preferences and manage your account
            </p>
        </header>

        <!-- Content -->
        <div class="flex-1 flex overflow-hidden">
            <!-- Sidebar Navigation -->
            <nav
                class="w-56 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"
            >
                <ul class="space-y-1">
                    <li v-for="tab in tabs" :key="tab.id">
                        <button
                            :class="[
                                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                                activeTab === tab.id
                                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
                            ]"
                            @click="activeTab = tab.id"
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
                                    :d="tab.icon"
                                />
                            </svg>
                            <span class="text-sm font-medium">{{ tab.label }}</span>
                        </button>
                    </li>
                </ul>

                <!-- App Info -->
                <div class="mt-8 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                        Version {{ appInfo?.version || '0.1.0' }}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                        {{ appInfo?.isDev ? 'Development' : 'Production' }}
                    </p>
                </div>
            </nav>

            <!-- Main Content -->
            <main class="flex-1 overflow-y-auto p-6">
                <div class="max-w-3xl">
                    <!-- General Settings -->
                    <div v-if="activeTab === 'general'" class="space-y-6">
                        <section>
                            <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Appearance
                            </h2>
                            <div class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <h3 class="font-medium text-gray-900 dark:text-white">
                                            Theme
                                        </h3>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">
                                            Choose your preferred color theme
                                        </p>
                                    </div>
                                    <div class="flex gap-2">
                                        <button
                                            v-for="theme in ['light', 'dark', 'system'] as Theme[]"
                                            :key="theme"
                                            @click="setTheme(theme)"
                                            :class="[
                                                'px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize',
                                                currentTheme === theme
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
                                            ]"
                                        >
                                            {{ theme }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Language
                            </h2>
                            <div class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
                                <div class="flex items-center justify-between">
                                    <div>
                                        <h3 class="font-medium text-gray-900 dark:text-white">
                                            Interface Language
                                        </h3>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">
                                            Select your preferred language
                                        </p>
                                    </div>
                                    <div class="flex gap-2">
                                        <button
                                            v-for="lang in [
                                                { code: 'en', label: 'English' },
                                                { code: 'ko', label: '한국어' },
                                            ]"
                                            :key="lang.code"
                                            @click="currentLocale = lang.code"
                                            :class="[
                                                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                                currentLocale === lang.code
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
                                            ]"
                                        >
                                            {{ lang.label }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Behavior
                            </h2>
                            <div
                                class="bg-white dark:bg-gray-800 rounded-lg shadow-sm divide-y divide-gray-200 dark:divide-gray-700"
                            >
                                <div class="flex items-center justify-between p-4">
                                    <div>
                                        <h3 class="font-medium text-gray-900 dark:text-white">
                                            Auto-save
                                        </h3>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">
                                            Automatically save changes
                                        </p>
                                    </div>
                                    <label class="relative inline-flex items-center cursor-pointer">
                                        <input
                                            v-model="settingsStore.generalSettings.autoSave"
                                            type="checkbox"
                                            class="sr-only peer"
                                            @change="settingsStore.saveSettings()"
                                        />
                                        <div
                                            class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600"
                                        ></div>
                                    </label>
                                </div>

                                <div class="flex items-center justify-between p-4">
                                    <div>
                                        <h3 class="font-medium text-gray-900 dark:text-white">
                                            Show Task IDs
                                        </h3>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">
                                            Display task IDs in the interface
                                        </p>
                                    </div>
                                    <label class="relative inline-flex items-center cursor-pointer">
                                        <input
                                            v-model="settingsStore.generalSettings.showTaskIds"
                                            type="checkbox"
                                            class="sr-only peer"
                                            @change="settingsStore.saveSettings()"
                                        />
                                        <div
                                            class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600"
                                        ></div>
                                    </label>
                                </div>

                                <div class="flex items-center justify-between p-4">
                                    <div>
                                        <h3 class="font-medium text-gray-900 dark:text-white">
                                            Enable Animations
                                        </h3>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">
                                            Use animations and transitions
                                        </p>
                                    </div>
                                    <label class="relative inline-flex items-center cursor-pointer">
                                        <input
                                            v-model="settingsStore.generalSettings.enableAnimations"
                                            type="checkbox"
                                            class="sr-only peer"
                                            @change="settingsStore.saveSettings()"
                                        />
                                        <div
                                            class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600"
                                        ></div>
                                    </label>
                                </div>

                                <div class="flex items-center justify-between p-4">
                                    <div>
                                        <h3 class="font-medium text-gray-900 dark:text-white">
                                            Compact Mode
                                        </h3>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">
                                            Reduce spacing for more content
                                        </p>
                                    </div>
                                    <label class="relative inline-flex items-center cursor-pointer">
                                        <input
                                            v-model="settingsStore.generalSettings.compactMode"
                                            type="checkbox"
                                            class="sr-only peer"
                                            @change="settingsStore.saveSettings()"
                                        />
                                        <div
                                            class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600"
                                        ></div>
                                    </label>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Default View
                            </h2>
                            <div class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
                                <div class="grid grid-cols-4 gap-2">
                                    <button
                                        v-for="view in ['kanban', 'list', 'timeline', 'calendar']"
                                        :key="view"
                                        :class="[
                                            'px-4 py-3 rounded-lg text-sm font-medium transition-colors capitalize',
                                            settingsStore.generalSettings.defaultProjectView ===
                                            view
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
                                        ]"
                                        @click="
                                            settingsStore.updateGeneralSettings({
                                                defaultProjectView: view as any,
                                            })
                                        "
                                    >
                                        {{ view }}
                                    </button>
                                </div>
                            </div>
                        </section>
                    </div>

                    <!-- Help Tab -->
                    <div v-if="activeTab === 'help'">
                        <HelpTab />
                    </div>

                    <!-- AI Providers -->
                    <div v-if="activeTab === 'ai'" class="space-y-6">
                        <section>
                            <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                AI Providers
                            </h2>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                Configure your AI provider credentials to enable AI-powered
                                features. Multiple providers can be enabled - the system will
                                fallback to the next available provider if one fails.
                            </p>

                            <!-- Enabled Providers Summary -->
                            <div
                                v-if="settingsStore.enabledProviders.length > 0"
                                class="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg"
                            >
                                <p class="text-sm text-green-700 dark:text-green-300">
                                    <span class="font-medium">{{
                                        settingsStore.enabledProviders.length
                                    }}</span>
                                    provider(s) enabled:
                                    {{
                                        settingsStore.enabledProviders.map((p) => p.name).join(', ')
                                    }}
                                </p>
                            </div>

                            <!-- Tag Filter Section -->
                            <div class="mb-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
                                <div class="flex items-center justify-between mb-3">
                                    <h3
                                        class="text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        기능별 필터
                                    </h3>
                                    <button
                                        v-if="selectedTags.length > 0"
                                        class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                        @click="clearTagFilter"
                                    >
                                        필터 초기화
                                    </button>
                                </div>
                                <div class="flex flex-wrap gap-2">
                                    <button
                                        v-for="tag in settingsStore.allTags"
                                        :key="tag"
                                        :class="[
                                            'px-3 py-1 rounded-full text-xs font-medium transition-all',
                                            selectedTags.includes(tag)
                                                ? getTagColor(tag) +
                                                  ' ring-2 ring-offset-1 ring-blue-500'
                                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600',
                                        ]"
                                        @click="toggleTag(tag)"
                                    >
                                        {{ settingsStore.getTagDisplayName(tag) }}
                                    </button>
                                </div>
                                <p
                                    v-if="selectedTags.length > 0"
                                    class="mt-2 text-xs text-gray-500 dark:text-gray-400"
                                >
                                    {{ filteredProviders.length }}개의 Provider가 선택된 태그와
                                    일치합니다
                                </p>
                            </div>

                            <div class="space-y-3">
                                <div
                                    v-for="provider in filteredProviders"
                                    :key="provider.id"
                                    :class="[
                                        'rounded-lg shadow-sm p-4 hover:shadow-md transition-all border-2',
                                        provider.enabled &&
                                        (provider.apiKey || provider.isConnected)
                                            ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
                                            : provider.apiKey || provider.isConnected
                                              ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700'
                                              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
                                    ]"
                                >
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-4">
                                            <div
                                                :class="[
                                                    'w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0',
                                                    getProviderGradient(provider.id),
                                                ]"
                                            >
                                                <IconRenderer
                                                    :icon="getProviderIcon(provider.id)"
                                                    class="w-7 h-7"
                                                />
                                            </div>
                                            <div class="min-w-0">
                                                <h3
                                                    class="font-medium text-gray-900 dark:text-white"
                                                >
                                                    {{ provider.name }}
                                                </h3>
                                                <p
                                                    class="text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate"
                                                >
                                                    {{ provider.description }}
                                                </p>
                                                <!-- Tags -->
                                                <div class="flex flex-wrap gap-1 mt-2">
                                                    <span
                                                        v-for="tag in (provider.tags || []).slice(
                                                            0,
                                                            5
                                                        )"
                                                        :key="tag"
                                                        :class="[
                                                            'px-1.5 py-0.5 rounded text-[10px] font-medium',
                                                            getTagColor(tag),
                                                        ]"
                                                    >
                                                        {{ settingsStore.getTagDisplayName(tag) }}
                                                    </span>
                                                    <span
                                                        v-if="(provider.tags || []).length > 5"
                                                        class="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                                                    >
                                                        +{{ (provider.tags || []).length - 5 }}
                                                    </span>
                                                </div>
                                                <div class="flex items-center gap-2 mt-1">
                                                    <span
                                                        v-if="
                                                            provider.enabled &&
                                                            (provider.apiKey ||
                                                                provider.isConnected)
                                                        "
                                                        class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                                    >
                                                        <svg
                                                            class="w-3 h-3 mr-1"
                                                            fill="currentColor"
                                                            viewBox="0 0 20 20"
                                                        >
                                                            <path
                                                                fill-rule="evenodd"
                                                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                                                clip-rule="evenodd"
                                                            />
                                                        </svg>
                                                        Enabled
                                                    </span>
                                                    <span
                                                        v-else-if="
                                                            provider.apiKey || provider.isConnected
                                                        "
                                                        class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300"
                                                    >
                                                        Configured (disabled)
                                                    </span>
                                                    <span
                                                        v-else
                                                        class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                                                    >
                                                        Not configured
                                                    </span>
                                                    <!-- Auth Method Badge -->
                                                    <span
                                                        v-if="
                                                            provider.authMethods?.includes(
                                                                'oauth'
                                                            ) ||
                                                            provider.authMethods?.includes('both')
                                                        "
                                                        class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                                    >
                                                        OAuth
                                                    </span>
                                                    <span
                                                        v-if="provider.defaultModel"
                                                        class="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[120px]"
                                                    >
                                                        {{ provider.defaultModel }}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="flex items-center gap-2">
                                            <!-- Model Refresh Button -->
                                            <button
                                                v-if="provider.enabled"
                                                @click.stop="
                                                    () => {
                                                        console.log(
                                                            '[SettingsView] Button clicked for:',
                                                            provider.id,
                                                            'enabled:',
                                                            provider.enabled
                                                        );
                                                        refreshProviderModels(provider.id);
                                                    }
                                                "
                                                :disabled="refreshingProviders.has(provider.id)"
                                                class="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                                                :title="`${provider.name} 모델 갱신`"
                                            >
                                                <svg
                                                    v-if="!refreshingProviders.has(provider.id)"
                                                    class="w-3.5 h-3.5"
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
                                                <svg
                                                    v-else
                                                    class="w-3.5 h-3.5 animate-spin"
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
                                                {{
                                                    refreshingProviders.has(provider.id)
                                                        ? '갱신 중'
                                                        : '모델 갱신'
                                                }}
                                            </button>
                                            <button
                                                class="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex-shrink-0"
                                                @click="openProviderModal(provider.id)"
                                            >
                                                Configure
                                            </button>
                                        </div>
                                    </div>
                                    <!-- Model Information -->
                                    <div
                                        v-if="provider.enabled && getModelCount(provider.id) > 0"
                                        class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700"
                                    >
                                        <div
                                            class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2"
                                        >
                                            <span>모델: {{ getModelCount(provider.id) }}개</span>
                                            <span
                                                >마지막 갱신:
                                                {{ getLastFetchTime(provider.id) }}</span
                                            >
                                        </div>
                                        <div class="flex flex-wrap gap-1">
                                            <span
                                                v-for="(model, idx) in settingsStore
                                                    .getProviderModels(provider.id)
                                                    .slice(0, 4)"
                                                :key="idx"
                                                class="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px] text-gray-600 dark:text-gray-400 font-mono"
                                            >
                                                {{ model }}
                                            </span>
                                            <span
                                                v-if="getModelCount(provider.id) > 4"
                                                class="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded text-[10px] text-blue-600 dark:text-blue-400 font-medium"
                                            >
                                                +{{ getModelCount(provider.id) - 4 }} more
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    <!-- MCP Servers -->
                    <div v-if="activeTab === 'mcp'" class="max-w-6xl">
                        <MCPServersTab />
                    </div>

                    <!-- Local Agents -->
                    <div v-if="activeTab === 'agents'" class="max-w-4xl">
                        <LocalAgentsTab />
                    </div>

                    <!-- Integrations -->
                    <div v-if="activeTab === 'integrations'">
                        <IntegrationsSettings />
                    </div>

                    <!-- AI Operators -->
                    <div v-if="activeTab === 'operators'">
                        <OperatorsTab />
                    </div>

                    <!-- Data -->
                    <div v-if="activeTab === 'data'">
                        <h2 class="text-2xl font-bold mb-4 text-text-primary">Data Management</h2>
                        <div class="text-text-secondary">
                            Data settings will be implemented here.
                        </div>
                    </div>

                    <!-- Keyboard Shortcuts -->
                    <div v-if="activeTab === 'shortcuts'" class="space-y-6">
                        <section>
                            <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Keyboard Shortcuts
                            </h2>
                            <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                Customize keyboard shortcuts for common actions
                            </p>

                            <div class="space-y-4">
                                <div
                                    v-for="(
                                        shortcuts, category
                                    ) in settingsStore.shortcutsByCategory"
                                    :key="category"
                                    class="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden"
                                >
                                    <div
                                        class="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700"
                                    >
                                        <h3
                                            class="text-sm font-medium text-gray-700 dark:text-gray-300"
                                        >
                                            {{ category }}
                                        </h3>
                                    </div>
                                    <div class="divide-y divide-gray-200 dark:divide-gray-700">
                                        <div
                                            v-for="shortcut in shortcuts"
                                            :key="shortcut.id"
                                            class="flex items-center justify-between px-4 py-3"
                                        >
                                            <span
                                                class="text-sm text-gray-700 dark:text-gray-300"
                                                >{{ shortcut.label }}</span
                                            >
                                            <div class="flex items-center gap-1">
                                                <kbd
                                                    v-for="(key, index) in shortcut.customKeys ||
                                                    shortcut.keys"
                                                    :key="index"
                                                    class="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-700 dark:text-gray-300 font-mono"
                                                >
                                                    {{ key }}
                                                </kbd>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    <!-- Profile -->
                    <div v-if="activeTab === 'profile'">
                        <section>
                            <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                User Profile
                            </h2>
                            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
                                <UserProfileSettings
                                    :profile="settingsStore.userProfile"
                                    @update="settingsStore.updateProfile"
                                    @logout="() => {}"
                                />
                            </div>
                        </section>
                    </div>

                    <!-- Credits -->
                    <div v-if="activeTab === 'credits'">
                        <CreditsTab />
                    </div>

                    <!-- Data Management -->
                    <div v-if="activeTab === 'data'" class="space-y-6">
                        <section>
                            <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Data Management
                            </h2>
                            <div
                                class="bg-white dark:bg-gray-800 rounded-lg shadow-sm divide-y divide-gray-200 dark:divide-gray-700"
                            >
                                <div class="flex items-center justify-between p-4">
                                    <div>
                                        <h3 class="font-medium text-gray-900 dark:text-white">
                                            Export Settings
                                        </h3>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">
                                            Download your settings as a JSON file
                                        </p>
                                    </div>
                                    <button
                                        class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                                        @click="handleExportSettings"
                                    >
                                        Export
                                    </button>
                                </div>

                                <div class="flex items-center justify-between p-4">
                                    <div>
                                        <h3 class="font-medium text-gray-900 dark:text-white">
                                            Import Settings
                                        </h3>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">
                                            Load settings from a JSON file
                                        </p>
                                    </div>
                                    <button
                                        class="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                        @click="showImportModal = true"
                                    >
                                        Import
                                    </button>
                                </div>

                                <div class="flex items-center justify-between p-4">
                                    <div>
                                        <h3 class="font-medium text-gray-900 dark:text-white">
                                            Reset to Defaults
                                        </h3>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">
                                            Reset all settings to their default values
                                        </p>
                                    </div>
                                    <button
                                        class="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                                        @click="handleResetSettings"
                                    >
                                        Reset
                                    </button>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Setup Wizard
                            </h2>
                            <div
                                class="bg-white dark:bg-gray-800 rounded-lg shadow-sm divide-y divide-gray-200 dark:divide-gray-700"
                            >
                                <div class="flex items-center justify-between p-4">
                                    <div>
                                        <h3 class="font-medium text-gray-900 dark:text-white">
                                            Run Setup Wizard Again
                                        </h3>
                                        <p class="text-sm text-gray-500 dark:text-gray-400">
                                            {{
                                                settingsStore.setupWizard.completed
                                                    ? '초기 설정 위자드를 다시 실행합니다'
                                                    : '초기 설정 위자드가 아직 완료되지 않았습니다'
                                            }}
                                        </p>
                                    </div>
                                    <button
                                        class="px-4 py-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                                        @click="handleRunSetupWizard"
                                    >
                                        Run Wizard
                                    </button>
                                </div>

                                <div
                                    v-if="
                                        settingsStore.setupWizard.completed ||
                                        settingsStore.setupWizard.skipped
                                    "
                                    class="p-4"
                                >
                                    <div
                                        class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
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
                                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                        </svg>
                                        <span v-if="settingsStore.setupWizard.completed">
                                            Setup completed on
                                            {{
                                                new Date(
                                                    settingsStore.setupWizard.completedAt || ''
                                                ).toLocaleDateString()
                                            }}
                                        </span>
                                        <span v-else-if="settingsStore.setupWizard.skipped">
                                            Setup skipped on
                                            {{
                                                new Date(
                                                    settingsStore.setupWizard.skippedAt || ''
                                                ).toLocaleDateString()
                                            }}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                About
                            </h2>
                            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">
                                <div class="space-y-3 text-sm">
                                    <div class="flex justify-between">
                                        <span class="text-gray-500 dark:text-gray-400"
                                            >Application</span
                                        >
                                        <span class="text-gray-900 dark:text-white font-medium"
                                            >HighFlow</span
                                        >
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-gray-500 dark:text-gray-400"
                                            >Version</span
                                        >
                                        <span class="text-gray-900 dark:text-white">{{
                                            appInfo?.version || '0.1.0'
                                        }}</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-gray-500 dark:text-gray-400"
                                            >Platform</span
                                        >
                                        <span class="text-gray-900 dark:text-white capitalize">{{
                                            appInfo?.platform || 'unknown'
                                        }}</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-gray-500 dark:text-gray-400"
                                            >Environment</span
                                        >
                                        <span class="text-gray-900 dark:text-white">{{
                                            appInfo?.isDev ? 'Development' : 'Production'
                                        }}</span>
                                    </div>
                                    <div class="flex justify-between">
                                        <span class="text-gray-500 dark:text-gray-400"
                                            >Created by</span
                                        >
                                        <span class="text-gray-900 dark:text-white font-medium"
                                            >HighGarden</span
                                        >
                                    </div>
                                </div>
                                <div
                                    class="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700"
                                >
                                    <p class="text-xs text-gray-500 dark:text-gray-400">
                                        HighFlow is an AI Workflow management tool that helps you
                                        automate and streamline your AI-powered workflows.
                                    </p>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </div>

        <!-- AI Provider Modal -->
        <AIProviderModal
            :provider="selectedProvider"
            :open="showProviderModal"
            @close="closeProviderModal"
            @save="handleProviderSave"
            @connectOAuth="handleConnectOAuth"
            @disconnectOAuth="handleDisconnectOAuth"
        />

        <!-- Import Modal -->
        <Teleport to="body">
            <div
                v-if="showImportModal"
                class="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
                <div class="fixed inset-0 bg-black/50" @click="showImportModal = false" />
                <div
                    class="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl"
                >
                    <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
                            Import Settings
                        </h3>
                    </div>
                    <div class="p-6">
                        <textarea
                            v-model="importData"
                            rows="10"
                            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                            placeholder="Paste your settings JSON here..."
                        />
                    </div>
                    <div
                        class="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700"
                    >
                        <button
                            class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            @click="showImportModal = false"
                        >
                            Cancel
                        </button>
                        <button
                            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                            @click="handleImportSettings"
                        >
                            Import
                        </button>
                    </div>
                </div>
            </div>
        </Teleport>

        <!-- Setup Wizard from Settings -->
        <InitialSetupWizard
            :open="showSetupWizardFromSettings"
            @complete="handleSetupWizardComplete"
            @skip="handleSetupWizardSkip"
            @close="handleSetupWizardSkip"
        />
    </div>
</template>
