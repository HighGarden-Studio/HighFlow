<script setup lang="ts">
/**
 * Initial Setup Wizard
 *
 * Guides new users through the essential setup process:
 * 1. Welcome - Introduction to the app
 * 2. Profile - User name, language, timezone
 * 3. AI Providers - Configure at least one AI provider
 * 4. Preferences - UI preferences
 * 5. Projects - Scan for local repositories (optional)
 * 6. Complete - Summary and start
 */

import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import IconRenderer from '../common/IconRenderer.vue';
import {
    useSettingsStore,
    type AIProviderConfig,
    type LocalProviderStatus,
} from '../../renderer/stores/settingsStore';

// Props & Emits
interface Props {
    open: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'complete'): void;
    (e: 'skip'): void;
}>();

// Store
const settingsStore = useSettingsStore();

// I18n
const { t } = useI18n();

// ========================================
// Wizard Steps
// ========================================

type WizardStep = 'welcome' | 'profile' | 'ai-provider' | 'preferences' | 'projects' | 'complete';

const STEPS = computed<{ id: WizardStep; title: string; description: string; required: boolean }[]>(
    () => [
        {
            id: 'welcome',
            title: t('setup.wizard.steps.welcome.title'),
            description: t('setup.wizard.steps.welcome.description'),
            required: true,
        },
        {
            id: 'profile',
            title: t('setup.wizard.steps.profile.title'),
            description: t('setup.wizard.steps.profile.description'),
            required: true,
        },
        {
            id: 'ai-provider',
            title: t('setup.wizard.steps.ai_provider.title'),
            description: t('setup.wizard.steps.ai_provider.description'),
            required: true,
        },
        {
            id: 'complete',
            title: t('setup.wizard.steps.complete.title'),
            description: t('setup.wizard.steps.complete.description'),
            required: true,
        },
    ]
);

// ========================================
// State
// ========================================

const currentStep = ref<WizardStep>('welcome');
const currentStepIndex = computed(() => STEPS.value.findIndex((s) => s.id === currentStep.value));

// Step 2: Profile
const displayName = ref('');
const language = ref('ko');
const timezone = ref(Intl.DateTimeFormat().resolvedOptions().timeZone);

// Available languages
const languages = [
    { value: 'ko', label: '한국어' },
    { value: 'en', label: 'English' },
];

// Available timezones (simplified list)

// Step 3: AI Provider
const selectedProviderId = ref<string | null>(null);
const apiKey = ref('');
const showApiKey = ref(false);
const isValidating = ref(false);
const validationResult = ref<'success' | 'error' | null>(null);
const isConnectingOAuth = ref(false);

const localProviderIds = ['ollama', 'lmstudio'];

// AI Providers available during setup (multi-modal + local providers)
const aiProviderOptions = computed(() => {
    return settingsStore.aiProviders.filter(
        (p) =>
            p.tags?.includes('multi-modal') ||
            p.tags?.includes('image-analysis') ||
            p.tags?.includes('local') ||
            localProviderIds.includes(p.id)
    );
});

const providerBaseUrl = ref('');
const isCheckingLocalProvider = ref(false);

// Provider icons and placeholders
const providerMeta: Record<string, { icon: string; gradient: string; placeholder: string }> = {
    openai: { icon: '🟢', gradient: 'from-green-400 to-teal-500', placeholder: 'sk-...' },
    anthropic: { icon: '🟣', gradient: 'from-orange-400 to-amber-500', placeholder: 'sk-ant-...' },
    google: { icon: '🔵', gradient: 'from-blue-400 to-indigo-500', placeholder: 'AIza...' },
    'azure-openai': {
        icon: '☁️',
        gradient: 'from-cyan-500 to-blue-600',
        placeholder: 'Your Azure API Key',
    },
    lmstudio: {
        icon: '🖥️',
        gradient: 'from-emerald-500 to-cyan-500',
        placeholder: 'http://localhost:1234/v1',
    },
};

// Step 4: Preferences

// ========================================
// Computed
// ========================================

const canProceed = computed(() => {
    switch (currentStep.value) {
        case 'welcome':
            return true;
        case 'profile':
            return displayName.value.trim().length >= 2;
        case 'ai-provider':
            return isAIProviderCompleted();
        case 'preferences':
            return true;
        case 'projects':
            return true;
        case 'complete':
            return true;
        default:
            return false;
    }
});

// 단계별 가중치 (총합 100). 소개 단계는 0%로 시작.
const STEP_WEIGHTS: Record<WizardStep, number> = {
    welcome: 0,
    profile: 30,
    'ai-provider': 50,
    preferences: 0, // Removed
    projects: 0, // Removed
    complete: 20,
};

function isStepCompleted(step: WizardStep): boolean {
    switch (step) {
        case 'welcome':
            return currentStepIndex.value > STEPS.value.findIndex((s) => s.id === 'welcome');
        case 'profile':
            return displayName.value.trim().length >= 2;
        case 'ai-provider':
            return isAIProviderCompleted();
        case 'complete':
            return currentStep.value === 'complete';
        default:
            return false;
    }
}

function isAIProviderCompleted(): boolean {
    const alreadyConnected = aiProviderOptions.value.some((provider) => providerIsReady(provider));
    if (alreadyConnected) {
        return true;
    }
    const provider = selectedProvider.value;
    if (!provider) return false;
    if (isProviderLocal(provider)) {
        return selectedProviderStatus.value.status === 'available';
    }
    return apiKey.value.length >= 10 || (isOAuthConnected.value ?? false);
}

const progressPercent = computed(() => {
    const total = Object.values(STEP_WEIGHTS).reduce((acc, v) => acc + v, 0);
    const earned = STEPS.value
        .filter((_, idx) => idx <= currentStepIndex.value)
        .map((s) => s.id)
        .filter((step) => isStepCompleted(step))
        .reduce((acc, step) => acc + STEP_WEIGHTS[step], 0);
    return Math.min(100, Math.round((earned / total) * 100));
});

const selectedProvider = computed<AIProviderConfig | null>(() => {
    return aiProviderOptions.value.find((p) => p.id === selectedProviderId.value) || null;
});

const selectedProviderStatus = computed<LocalProviderStatus>(() => {
    return selectedProviderId.value
        ? settingsStore.getLocalProviderStatus(selectedProviderId.value)
        : { status: 'unknown' };
});

const isSelectedProviderLocal = computed(() => isProviderLocal(selectedProvider.value));

const requiresApiKey = computed(() => {
    const provider = selectedProvider.value;
    if (!provider) return false;
    if (isProviderLocal(provider)) return false;
    const methods = provider.authMethods || [];
    return methods.includes('apiKey') || methods.includes('both');
});

const providerStatusMap = computed<
    Record<string, { label: string; tone: 'success' | 'warning' | 'muted' }>
>(() => {
    const result: Record<string, { label: string; tone: 'success' | 'warning' | 'muted' }> = {};
    for (const provider of aiProviderOptions.value) {
        const badge = computeProviderStatusBadge(provider);
        if (badge) {
            result[provider.id] = badge;
        }
    }
    return result;
});

// Check if selected provider supports OAuth
const supportsOAuth = computed(() => {
    const provider = selectedProvider.value;
    return provider?.authMethods?.includes('oauth') || provider?.authMethods?.includes('both');
});

// Check if provider is already connected via OAuth
const isOAuthConnected = computed(() => {
    return selectedProvider.value?.isConnected;
});

// Get provider meta info (icon, gradient, placeholder)
function getProviderMeta(providerId: string) {
    return (
        providerMeta[providerId] || {
            icon: '🤖',
            gradient: 'from-gray-400 to-gray-500',
            placeholder: 'API Key...',
        }
    );
}

function isProviderLocal(provider?: AIProviderConfig | null): boolean {
    if (!provider) return false;
    return provider.tags?.includes('local') || localProviderIds.includes(provider.id);
}

function providerIsReady(provider?: AIProviderConfig | null): boolean {
    if (!provider) return false;
    if (provider.isConnected) return true;
    if (provider.apiKey && provider.apiKey.length >= 10) return true;
    const status = settingsStore.getLocalProviderStatus(provider.id);
    return status.status === 'available';
}

function getDefaultBaseUrl(provider?: AIProviderConfig | null): string {
    if (!provider) return '';
    if (provider.baseUrl) return provider.baseUrl;
    if (provider.id === 'lmstudio') return 'http://localhost:1234/v1';
    if (provider.id === 'ollama') return 'http://localhost:11434';
    return '';
}

function computeProviderStatusBadge(
    provider: AIProviderConfig
): { label: string; tone: 'success' | 'warning' | 'muted' } | null {
    if (provider.isConnected || (provider.apiKey && provider.apiKey.length >= 10)) {
        return { label: t('setup.wizard.ai_provider.status.connected'), tone: 'success' };
    }
    const status = settingsStore.getLocalProviderStatus(provider.id);
    if (status.status === 'available') {
        return { label: t('setup.wizard.ai_provider.status.local_detected'), tone: 'success' };
    }
    if (status.status === 'checking') {
        return { label: t('setup.wizard.ai_provider.status.checking'), tone: 'warning' };
    }
    if (status.status === 'unavailable' && isProviderLocal(provider)) {
        return { label: t('setup.wizard.ai_provider.status.not_running'), tone: 'muted' };
    }
    return null;
}

function getStatusBadgeClass(tone: 'success' | 'warning' | 'muted'): string {
    switch (tone) {
        case 'success':
            return 'bg-emerald-600/80 text-white';
        case 'warning':
            return 'bg-amber-500/80 text-gray-900';
        default:
            return 'bg-gray-600/80 text-gray-200';
    }
}

function getLocalStatusLabel(status: LocalProviderStatus): string {
    switch (status.status) {
        case 'available':
            return t('setup.wizard.ai_provider.status.running');
        case 'checking':
            return t('setup.wizard.ai_provider.status.checking');
        case 'unavailable':
            return t('setup.wizard.ai_provider.status.not_running');
        default:
            return t('setup.wizard.ai_provider.status.unknown');
    }
}

function getLocalStatusTone(status: LocalProviderStatus): 'success' | 'warning' | 'muted' {
    switch (status.status) {
        case 'available':
            return 'success';
        case 'checking':
            return 'warning';
        default:
            return 'muted';
    }
}

function getLocalStatusDescription(status: LocalProviderStatus): string {
    if (status.status === 'available') {
        const source = status.baseUrl ? `(${status.baseUrl})` : '';
        return t('setup.wizard.ai_provider.status.local_response', { source }).trim();
    }
    if (status.status === 'unavailable') {
        return status.details
            ? t('setup.wizard.ai_provider.status.connection_failed', { details: status.details })
            : t('setup.wizard.ai_provider.status.check_running');
    }
    if (status.status === 'checking') {
        return t('setup.wizard.ai_provider.status.checking_status');
    }
    return t('setup.wizard.ai_provider.status.not_checked');
}

function selectProvider(provider: AIProviderConfig): void {
    selectedProviderId.value = provider.id;
    apiKey.value = '';
    validationResult.value = null;
    providerBaseUrl.value = getDefaultBaseUrl(provider);
    if (isProviderLocal(provider)) {
        refreshLocalStatus(provider.id, providerBaseUrl.value);
    }
}

async function refreshLocalStatus(providerId: string, baseUrl?: string): Promise<void> {
    isCheckingLocalProvider.value = true;
    try {
        await settingsStore.detectLocalProvider(providerId, baseUrl);
    } finally {
        isCheckingLocalProvider.value = false;
    }
}

async function handleLocalStatusCheck(): Promise<void> {
    if (!selectedProvider.value || !isProviderLocal(selectedProvider.value)) return;
    await refreshLocalStatus(selectedProvider.value.id, providerBaseUrl.value);
}

// Open external URL
async function openExternal(url: string) {
    try {
        if (window.electron?.shell) {
            await window.electron.shell.openExternal(url);
        } else {
            window.open(url, '_blank');
        }
    } catch (error) {
        console.error('Failed to open URL:', error);
    }
}

// Connect via OAuth
async function connectOAuth() {
    if (!selectedProviderId.value) return;

    isConnectingOAuth.value = true;
    try {
        await settingsStore.connectOAuth(selectedProviderId.value);
        validationResult.value = 'success';
    } catch (error) {
        console.error('OAuth connection failed:', error);
        validationResult.value = 'error';
    } finally {
        isConnectingOAuth.value = false;
    }
}

watch(
    () => aiProviderOptions.value,
    (providers) => {
        if (!providers || providers.length === 0) {
            selectedProviderId.value = null;
            return;
        }
        if (selectedProviderId.value && providers.some((p) => p.id === selectedProviderId.value)) {
            return;
        }
        const readyProvider = providers.find((p) => providerIsReady(p));
        selectedProviderId.value = (readyProvider || providers[0]!).id;
    },
    { immediate: true }
);

watch(
    () => selectedProviderId.value,
    (providerId, previousId) => {
        if (!providerId || providerId === previousId) return;
        const provider = aiProviderOptions.value.find((p) => p.id === providerId);
        if (!provider) return;
        providerBaseUrl.value = getDefaultBaseUrl(provider);
        if (isProviderLocal(provider)) {
            refreshLocalStatus(provider.id, providerBaseUrl.value);
        }
    }
);

watch(
    () => props.open,
    (open) => {
        if (!open) return;
        aiProviderOptions.value
            .filter((provider) => isProviderLocal(provider))
            .forEach((provider) => {
                settingsStore.detectLocalProvider(provider.id, provider.baseUrl).catch(() => {});
            });
    },
    { immediate: true }
);

// ========================================
// Methods - Navigation
// ========================================

function nextStep() {
    const idx = currentStepIndex.value;
    if (idx < STEPS.value.length - 1) {
        // Save step data
        saveStepData();
        currentStep.value = STEPS.value[idx + 1]!.id;
    }
}

function prevStep() {
    const idx = currentStepIndex.value;
    if (idx > 0) {
        currentStep.value = STEPS.value[idx - 1]!.id;
    }
}

function goToStep(step: WizardStep) {
    const targetIdx = STEPS.value.findIndex((s) => s.id === step);
    if (targetIdx <= currentStepIndex.value) {
        currentStep.value = step;
    }
}

function skipWizard() {
    emit('skip');
}

// ========================================
// Methods - Step Actions
// ========================================

async function saveStepData() {
    switch (currentStep.value) {
        case 'profile':
            await settingsStore.updateProfile({
                displayName: displayName.value,
                language: language.value,
                timezone: timezone.value,
            });
            break;
        case 'ai-provider':
            if (!selectedProviderId.value || !selectedProvider.value) break;
            if (isProviderLocal(selectedProvider.value)) {
                await settingsStore.updateAIProvider(selectedProvider.value.id, {
                    enabled: true,
                    isConnected: true,
                    baseUrl: providerBaseUrl.value || getDefaultBaseUrl(selectedProvider.value),
                });
            } else if (apiKey.value) {
                await settingsStore.updateAIProvider(selectedProviderId.value, {
                    apiKey: apiKey.value,
                    enabled: true,
                });
            }
            break;
    }
}

async function validateApiKey() {
    if (!selectedProviderId.value || !apiKey.value) return;

    isValidating.value = true;
    validationResult.value = null;

    try {
        // Basic validation for now
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check minimum length
        if (apiKey.value.length >= 10) {
            validationResult.value = 'success';
        } else {
            validationResult.value = 'error';
        }
    } catch {
        validationResult.value = 'error';
    } finally {
        isValidating.value = false;
    }
}

async function completeSetup() {
    // Save all settings
    await saveStepData();

    // Mark setup as completed
    saveSetupCompleted();

    emit('complete');
}

function saveSetupCompleted() {
    localStorage.setItem('workflow_settings_setupCompleted', 'true');
    localStorage.setItem('workflow_settings_setupCompletedAt', new Date().toISOString());
}

// ========================================
// Lifecycle
// ========================================

onMounted(() => {
    // Load existing profile data if available
    if (settingsStore.userProfile) {
        displayName.value = settingsStore.userProfile.displayName || '';
        language.value = settingsStore.userProfile.language || 'ko';
        timezone.value =
            settingsStore.userProfile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
});

watch(
    () => props.open,
    (isOpen) => {
        if (!isOpen) {
            // Reset state
            currentStep.value = 'welcome';
            selectedProviderId.value = null;
            apiKey.value = '';
            validationResult.value = null;
        }
    }
);
</script>

<template>
    <Teleport to="body">
        <div
            v-if="open"
            class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
        >
            <div
                class="w-full max-w-3xl max-h-[90vh] bg-gradient-to-br from-gray-900 to-gray-950 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-700/50"
            >
                <!-- Header -->
                <div class="px-8 py-6 border-b border-gray-700/50">
                    <div class="flex items-center justify-between">
                        <div>
                            <h2 class="text-2xl font-bold text-white flex items-center gap-3">
                                <IconRenderer emoji="🚀" class="w-8 h-8" />
                                {{ STEPS[currentStepIndex]?.title }}
                            </h2>
                            <p class="text-sm text-gray-400 mt-1">
                                {{ STEPS[currentStepIndex]?.description }}
                            </p>
                        </div>
                        <button
                            class="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
                            :title="t('setup.wizard.common.skip')"
                            @click="skipWizard"
                        >
                            <svg
                                class="w-6 h-6"
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

                    <!-- Progress Bar -->
                    <div class="mt-6">
                        <div class="flex items-center justify-between text-xs text-gray-500 mb-2">
                            <span>{{
                                t('setup.wizard.common.step', {
                                    current: currentStepIndex + 1,
                                    total: STEPS.length,
                                })
                            }}</span>
                            <span>{{
                                t('setup.wizard.common.percent_complete', {
                                    percent: progressPercent,
                                })
                            }}</span>
                        </div>
                        <div class="h-2 bg-gray-800 rounded-full overflow-hidden">
                            <div
                                class="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                                :style="{ width: `${progressPercent}%` }"
                            ></div>
                        </div>
                    </div>

                    <!-- Step Indicators -->
                    <div class="mt-4 flex items-center gap-2">
                        <template v-for="(step, idx) in STEPS" :key="step.id">
                            <button
                                :disabled="idx > currentStepIndex"
                                :class="[
                                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all',
                                    idx === currentStepIndex
                                        ? 'bg-blue-500 text-white ring-4 ring-blue-500/30'
                                        : idx < currentStepIndex
                                          ? 'bg-green-500 text-white cursor-pointer'
                                          : 'bg-gray-700 text-gray-500 cursor-not-allowed',
                                ]"
                                @click="goToStep(step.id)"
                            >
                                <svg
                                    v-if="idx < currentStepIndex"
                                    class="w-4 h-4"
                                    fill="currentColor"
                                    viewBox="0 0 20 20"
                                >
                                    <path
                                        fill-rule="evenodd"
                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                        clip-rule="evenodd"
                                    />
                                </svg>
                                <span v-else>{{ idx + 1 }}</span>
                            </button>
                            <div
                                v-if="idx < STEPS.length - 1"
                                :class="[
                                    'flex-1 h-0.5 transition-colors',
                                    idx < currentStepIndex ? 'bg-green-500' : 'bg-gray-700',
                                ]"
                            ></div>
                        </template>
                    </div>
                </div>

                <!-- Content -->
                <div class="flex-1 overflow-y-auto p-8">
                    <!-- Step 1: Welcome -->
                    <div v-if="currentStep === 'welcome'" class="text-center space-y-8">
                        <div>
                            <h3 class="text-3xl font-bold text-white mb-3">
                                {{ t('setup.wizard.welcome.title') }}
                            </h3>
                            <p class="text-gray-400 max-w-lg mx-auto">
                                {{ t('setup.wizard.welcome.subtitle') }}
                            </p>
                        </div>

                        <div class="grid grid-cols-3 gap-4 max-w-xl mx-auto">
                            <div class="bg-gray-800/50 rounded-xl p-4 text-center">
                                <IconRenderer emoji="🎯" class="w-8 h-8 mx-auto mb-2" />
                                <div class="text-sm font-medium text-white">
                                    {{ t('setup.wizard.welcome.features.project_management') }}
                                </div>
                                <div class="text-xs text-gray-500 mt-1">
                                    {{ t('setup.wizard.welcome.features.project_management_desc') }}
                                </div>
                            </div>
                            <div class="bg-gray-800/50 rounded-xl p-4 text-center">
                                <IconRenderer emoji="🤖" class="w-8 h-8 mx-auto mb-2" />
                                <div class="text-sm font-medium text-white">
                                    {{ t('setup.wizard.welcome.features.ai_automation') }}
                                </div>
                                <div class="text-xs text-gray-500 mt-1">
                                    {{ t('setup.wizard.welcome.features.ai_automation_desc') }}
                                </div>
                            </div>
                            <div class="bg-gray-800/50 rounded-xl p-4 text-center">
                                <IconRenderer emoji="🔗" class="w-8 h-8 mx-auto mb-2" />
                                <div class="text-sm font-medium text-white">
                                    {{ t('setup.wizard.welcome.features.multi_ai') }}
                                </div>
                                <div class="text-xs text-gray-500 mt-1">
                                    {{ t('setup.wizard.welcome.features.multi_ai_desc') }}
                                </div>
                            </div>
                        </div>

                        <p class="text-sm text-gray-500">
                            {{ t('setup.wizard.welcome.note') }}
                        </p>
                    </div>

                    <!-- Step 2: Profile -->
                    <div v-if="currentStep === 'profile'" class="space-y-6 max-w-md mx-auto">
                        <div class="text-center mb-8">
                            <div
                                class="w-20 h-20 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-4"
                            >
                                <IconRenderer emoji="👤" class="w-10 h-10" />
                            </div>
                            <p class="text-gray-400">{{ t('setup.wizard.profile.intro') }}</p>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-300 mb-2">
                                {{ t('setup.wizard.profile.display_name') }}
                                <span class="text-red-400">*</span>
                            </label>
                            <input
                                v-model="displayName"
                                type="text"
                                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                :placeholder="t('setup.wizard.profile.display_name_placeholder')"
                            />
                            <p class="text-xs text-gray-500 mt-1">
                                {{ t('setup.wizard.profile.min_length') }}
                            </p>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-300 mb-2">
                                {{ t('setup.wizard.profile.language') }}
                            </label>
                            <select
                                v-model="language"
                                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option
                                    v-for="lang in languages"
                                    :key="lang.value"
                                    :value="lang.value"
                                >
                                    {{ lang.label }}
                                </option>
                            </select>
                        </div>
                    </div>

                    <!-- Step 3: AI Provider -->
                    <div v-if="currentStep === 'ai-provider'" class="space-y-6">
                        <div class="text-center mb-6">
                            <p class="text-gray-400">
                                {{ t('setup.wizard.ai_provider.intro') }}
                            </p>
                        </div>

                        <div
                            v-if="aiProviderOptions.length === 0"
                            class="p-4 bg-gray-900/40 border border-gray-700 rounded-xl text-center text-sm text-gray-400"
                        >
                            {{ t('setup.wizard.ai_provider.no_providers') }}
                        </div>
                        <div v-else class="grid grid-cols-2 gap-3">
                            <button
                                v-for="provider in aiProviderOptions"
                                :key="provider.id"
                                :class="[
                                    'p-4 border-2 rounded-xl text-left transition-all relative group',
                                    selectedProviderId === provider.id
                                        ? 'border-blue-500 bg-blue-900/20'
                                        : providerIsReady(provider)
                                          ? 'border-green-600 bg-green-900/20 hover:border-green-500'
                                          : 'border-gray-700 hover:border-gray-600 bg-gray-800/30',
                                ]"
                                @click="selectProvider(provider)"
                            >
                                <div
                                    v-if="providerStatusMap[provider.id]"
                                    class="absolute top-2 right-2"
                                >
                                    <span
                                        :class="[
                                            'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide',
                                            getStatusBadgeClass(
                                                providerStatusMap[provider.id]?.tone || 'muted'
                                            ),
                                        ]"
                                    >
                                        {{ providerStatusMap[provider.id]?.label }}
                                    </span>
                                </div>
                                <div class="flex items-center gap-2 mb-1">
                                    <div class="flex items-center gap-2">
                                        <IconRenderer
                                            :emoji="getProviderMeta(provider.id).icon"
                                            class="w-5 h-5"
                                        />
                                        <span>{{ provider.name }}</span>
                                        <span
                                            v-if="provider.isComingSoon"
                                            class="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-700/50 text-gray-400 border border-gray-600/50"
                                        >
                                            {{ t('setup.wizard.common.coming_soon') }}
                                        </span>
                                    </div>
                                </div>
                                <p class="text-xs text-gray-500 line-clamp-2">
                                    {{ provider.description }}
                                </p>
                                <div class="flex flex-wrap gap-1 mt-2">
                                    <span
                                        v-for="tag in provider.tags?.slice(0, 2)"
                                        :key="tag"
                                        class="px-1.5 py-0.5 text-xs rounded bg-gray-700/50 text-gray-400"
                                    >
                                        {{ tag }}
                                    </span>
                                </div>
                            </button>
                        </div>

                        <div
                            v-if="selectedProviderId && selectedProvider"
                            class="bg-gray-800/50 rounded-xl p-6 space-y-4"
                        >
                            <div class="flex items-center justify-between mb-2">
                                <div class="flex items-center gap-2">
                                    <IconRenderer
                                        :emoji="getProviderMeta(selectedProviderId).icon"
                                        class="w-5 h-5"
                                    />
                                    <span>{{ selectedProviderId }}</span>
                                    <span class="font-medium text-white">{{
                                        selectedProvider.name
                                    }}</span>
                                </div>
                                <div class="flex items-center gap-2">
                                    <button
                                        v-if="selectedProvider.website"
                                        class="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors flex items-center gap-1"
                                        @click="openExternal(selectedProvider.website!)"
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
                                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                            />
                                        </svg>
                                        {{ t('setup.wizard.ai_provider.open_website') }}
                                    </button>
                                </div>
                            </div>

                            <div v-if="isSelectedProviderLocal" class="space-y-4">
                                <div
                                    class="p-4 border border-emerald-700/40 bg-emerald-900/10 rounded-xl"
                                >
                                    <h4 class="text-sm font-semibold text-emerald-300 mb-2">
                                        {{ t('setup.wizard.ai_provider.local_guide.title') }}
                                    </h4>
                                    <ol
                                        class="text-xs text-emerald-100 list-decimal list-inside space-y-1"
                                    >
                                        <li>
                                            {{ t('setup.wizard.ai_provider.local_guide.step1') }}
                                        </li>
                                        <li>
                                            {{ t('setup.wizard.ai_provider.local_guide.step2') }}
                                        </li>
                                        <li>
                                            {{ t('setup.wizard.ai_provider.local_guide.step3') }}
                                        </li>
                                        <li>
                                            {{ t('setup.wizard.ai_provider.local_guide.step4') }}
                                        </li>
                                    </ol>
                                    <div class="mt-3 flex flex-wrap gap-2">
                                        <button
                                            class="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-700/70 hover:bg-emerald-600 text-white transition-colors"
                                            @click="openExternal('https://lmstudio.ai')"
                                        >
                                            {{ t('setup.wizard.ai_provider.download_lm_studio') }}
                                        </button>
                                        <button
                                            class="px-4 py-2 text-xs font-medium rounded-lg border border-emerald-500/60 text-emerald-200 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
                                            :disabled="isCheckingLocalProvider"
                                            @click="handleLocalStatusCheck"
                                        >
                                            <svg
                                                v-if="isCheckingLocalProvider"
                                                class="w-4 h-4 inline-block mr-1 animate-spin"
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
                                                />
                                                <path
                                                    class="opacity-75"
                                                    fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                />
                                            </svg>
                                            {{
                                                isCheckingLocalProvider
                                                    ? t('setup.wizard.ai_provider.checking')
                                                    : t('setup.wizard.ai_provider.check_status')
                                            }}
                                        </button>
                                    </div>
                                </div>

                                <div class="grid gap-4 md:grid-cols-2">
                                    <div
                                        class="p-4 bg-gray-900/40 border border-gray-700 rounded-xl space-y-2"
                                    >
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <p class="text-sm font-medium text-white">
                                                    {{ t('setup.wizard.ai_provider.local_status') }}
                                                </p>
                                                <p class="text-xs text-gray-500">
                                                    {{
                                                        getLocalStatusDescription(
                                                            selectedProviderStatus
                                                        )
                                                    }}
                                                </p>
                                            </div>
                                            <span
                                                :class="[
                                                    'px-2 py-0.5 text-xs rounded-full font-semibold',
                                                    getStatusBadgeClass(
                                                        getLocalStatusTone(selectedProviderStatus)
                                                    ),
                                                ]"
                                            >
                                                {{ getLocalStatusLabel(selectedProviderStatus) }}
                                            </span>
                                        </div>
                                        <p class="text-xs text-gray-500">
                                            {{
                                                selectedProviderStatus.lastChecked
                                                    ? t(
                                                          'setup.wizard.ai_provider.status.last_checked',
                                                          {
                                                              time: new Date(
                                                                  selectedProviderStatus.lastChecked
                                                              ).toLocaleTimeString(),
                                                          }
                                                      )
                                                    : t(
                                                          'setup.wizard.ai_provider.status.never_checked'
                                                      )
                                            }}
                                        </p>
                                    </div>
                                    <div
                                        class="p-4 bg-gray-900/40 border border-gray-700 rounded-xl space-y-2"
                                    >
                                        <label class="block text-sm font-medium text-gray-300">
                                            {{ t('setup.wizard.ai_provider.base_url') }}
                                        </label>
                                        <input
                                            v-model="providerBaseUrl"
                                            type="text"
                                            class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-600 focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono text-sm"
                                            placeholder="http://localhost:1234/v1"
                                        />
                                        <p class="text-xs text-gray-500">
                                            {{ t('setup.wizard.ai_provider.base_url_desc') }}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div v-else>
                                <div v-if="supportsOAuth" class="space-y-3">
                                    <div
                                        class="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-gray-700"
                                    >
                                        <div class="flex items-center gap-3">
                                            <div
                                                :class="[
                                                    'w-8 h-8 rounded-lg flex items-center justify-center',
                                                    isOAuthConnected
                                                        ? 'bg-green-900/30'
                                                        : 'bg-gray-700',
                                                ]"
                                            >
                                                <svg
                                                    v-if="isOAuthConnected"
                                                    class="w-5 h-5 text-green-400"
                                                    fill="currentColor"
                                                    viewBox="0 0 20 20"
                                                >
                                                    <path
                                                        fill-rule="evenodd"
                                                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                                        clip-rule="evenodd"
                                                    />
                                                </svg>
                                                <svg
                                                    v-else
                                                    class="w-5 h-5 text-gray-400"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                >
                                                    <path
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                        stroke-width="2"
                                                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                                                    />
                                                </svg>
                                            </div>
                                            <div>
                                                <div class="text-sm font-medium text-white">
                                                    {{
                                                        t('setup.wizard.ai_provider.oauth.connect')
                                                    }}
                                                </div>
                                                <div class="text-xs text-gray-500">
                                                    {{
                                                        isOAuthConnected
                                                            ? t(
                                                                  'setup.wizard.ai_provider.oauth.hint_connected'
                                                              )
                                                            : t(
                                                                  'setup.wizard.ai_provider.oauth.hint_connect'
                                                              )
                                                    }}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            v-if="!isOAuthConnected"
                                            :disabled="isConnectingOAuth"
                                            class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                                            @click="connectOAuth"
                                        >
                                            <svg
                                                v-if="isConnectingOAuth"
                                                class="w-4 h-4 animate-spin"
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
                                                />
                                                <path
                                                    class="opacity-75"
                                                    fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                />
                                            </svg>
                                            {{
                                                isConnectingOAuth
                                                    ? t('setup.wizard.ai_provider.oauth.connecting')
                                                    : t('setup.wizard.ai_provider.oauth.connect')
                                            }}
                                        </button>
                                        <span v-else class="text-green-400 text-sm font-medium">{{
                                            t('setup.wizard.ai_provider.status.connected')
                                        }}</span>
                                    </div>

                                    <div class="text-center text-gray-500 text-xs">
                                        {{ t('setup.wizard.common.or') }}
                                    </div>
                                </div>

                                <div v-if="requiresApiKey" class="space-y-3">
                                    <label class="text-sm text-gray-400">{{
                                        t('setup.wizard.ai_provider.api_key.label')
                                    }}</label>
                                    <div class="relative">
                                        <input
                                            v-model="apiKey"
                                            :type="showApiKey ? 'text' : 'password'"
                                            class="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 pr-24 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                            :placeholder="
                                                getProviderMeta(selectedProviderId).placeholder
                                            "
                                        />
                                        <button
                                            class="absolute right-12 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-white"
                                            @click="showApiKey = !showApiKey"
                                        >
                                            <svg
                                                v-if="showApiKey"
                                                class="w-5 h-5"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268-2.943 9.542-7z"
                                                />
                                            </svg>
                                            <svg
                                                v-else
                                                class="w-5 h-5"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                                />
                                                <path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                                />
                                            </svg>
                                        </button>
                                        <button
                                            :disabled="!apiKey || isValidating"
                                            class="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
                                            @click="validateApiKey"
                                        >
                                            {{
                                                isValidating
                                                    ? t(
                                                          'setup.wizard.ai_provider.api_key.verifying'
                                                      )
                                                    : t('setup.wizard.ai_provider.api_key.verify')
                                            }}
                                        </button>
                                    </div>

                                    <div
                                        v-if="validationResult === 'success'"
                                        class="flex items-center gap-2 text-green-400 text-sm"
                                    >
                                        <svg
                                            class="w-5 h-5"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                        <span>{{
                                            isOAuthConnected
                                                ? t('setup.wizard.ai_provider.oauth.hint_connected')
                                                : t('setup.wizard.ai_provider.api_key.verified')
                                        }}</span>
                                    </div>
                                    <div
                                        v-else-if="validationResult === 'error'"
                                        class="flex items-center gap-2 text-red-400 text-sm"
                                    >
                                        <svg
                                            class="w-5 h-5"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                        <span>{{
                                            t('setup.wizard.ai_provider.api_key.failed')
                                        }}</span>
                                    </div>

                                    <p class="text-xs text-gray-500">
                                        {{ t('setup.wizard.ai_provider.api_key.note') }}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Step 6: Complete -->
                    <div v-if="currentStep === 'complete'" class="text-center space-y-8">
                        <div
                            class="w-32 h-32 mx-auto bg-gradient-to-br from-green-400 to-green-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-green-500/30"
                        >
                            <svg
                                class="w-16 h-16 text-white"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                            >
                                <path
                                    fill-rule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                        </div>

                        <div>
                            <h3 class="text-3xl font-bold text-white mb-3">
                                {{ t('setup.wizard.complete.title') }}
                            </h3>
                            <p class="text-gray-400 max-w-lg mx-auto">
                                {{ t('setup.wizard.complete.subtitle') }}
                            </p>
                        </div>

                        <!-- Summary -->
                        <div
                            class="bg-gray-800/50 rounded-xl p-6 max-w-md mx-auto text-left space-y-4"
                        >
                            <h4 class="font-medium text-white text-center mb-4">
                                {{ t('setup.wizard.complete.summary') }}
                            </h4>

                            <div
                                class="flex items-center justify-between py-2 border-b border-gray-700"
                            >
                                <span class="text-gray-400 text-sm">{{
                                    t('setup.wizard.complete.user')
                                }}</span>
                                <span class="text-white text-sm">{{
                                    displayName || '미설정'
                                }}</span>
                            </div>
                            <div
                                class="flex items-center justify-between py-2 border-b border-gray-700"
                            >
                                <span class="text-gray-400 text-sm">{{
                                    t('setup.wizard.complete.provider')
                                }}</span>
                                <span class="text-white text-sm">{{
                                    selectedProvider?.name || '미설정'
                                }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div
                    class="px-8 py-5 border-t border-gray-700/50 bg-gray-900/50 flex items-center justify-between"
                >
                    <button
                        v-if="currentStepIndex > 0 && currentStep !== 'complete'"
                        class="px-5 py-2.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
                        @click="prevStep"
                    >
                        ← {{ t('setup.wizard.common.prev') }}
                    </button>
                    <div v-else></div>

                    <div class="flex items-center gap-3">
                        <button
                            v-if="currentStep !== 'welcome' && currentStep !== 'complete'"
                            class="px-5 py-2.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
                            @click="skipWizard"
                        >
                            {{ t('setup.wizard.common.skip') }}
                        </button>

                        <button
                            v-if="currentStep !== 'complete'"
                            :disabled="!canProceed && STEPS[currentStepIndex]?.required"
                            :class="[
                                'px-6 py-2.5 rounded-lg font-medium transition-colors',
                                canProceed || !STEPS[currentStepIndex]?.required
                                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                                    : 'bg-gray-700 text-gray-500 cursor-not-allowed',
                            ]"
                            @click="nextStep"
                        >
                            >
                            {{
                                currentStepIndex === STEPS.length - 2
                                    ? t('setup.wizard.common.complete')
                                    : t('setup.wizard.common.next') + ' →'
                            }}
                        </button>

                        <button
                            v-else
                            class="px-8 py-2.5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 text-white rounded-lg font-medium transition-all"
                            @click="completeSetup"
                        >
                            {{ t('setup.wizard.common.start') }} 🚀
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>
