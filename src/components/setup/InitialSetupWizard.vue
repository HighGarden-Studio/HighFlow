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
import { useSettingsStore, type AIProviderConfig, type LocalProviderStatus } from '../../renderer/stores/settingsStore';

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

// ========================================
// Wizard Steps
// ========================================

type WizardStep = 'welcome' | 'profile' | 'ai-provider' | 'preferences' | 'projects' | 'complete';

const STEPS: { id: WizardStep; title: string; description: string; required: boolean }[] = [
  { id: 'welcome', title: '환영합니다', description: 'AI Workflow Manager 시작하기', required: true },
  { id: 'profile', title: '프로필 설정', description: '기본 사용자 정보를 설정합니다', required: true },
  { id: 'ai-provider', title: 'AI 연동', description: 'AI 서비스를 연결합니다', required: true },
  { id: 'preferences', title: '환경 설정', description: '작업 환경을 맞춤 설정합니다', required: false },
  { id: 'projects', title: '프로젝트 탐색', description: '로컬 저장소를 검색합니다', required: false },
  { id: 'complete', title: '완료', description: '설정이 완료되었습니다', required: true },
];

// ========================================
// State
// ========================================

const currentStep = ref<WizardStep>('welcome');
const currentStepIndex = computed(() => STEPS.findIndex(s => s.id === currentStep.value));

// Step 2: Profile
const displayName = ref('');
const language = ref('ko');
const timezone = ref(Intl.DateTimeFormat().resolvedOptions().timeZone);

// Available languages
const languages = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'zh', label: '中文' },
];

// Available timezones (simplified list)
const timezones = [
  { value: 'Asia/Seoul', label: '서울 (GMT+9)' },
  { value: 'Asia/Tokyo', label: '도쿄 (GMT+9)' },
  { value: 'Asia/Shanghai', label: '상하이 (GMT+8)' },
  { value: 'America/New_York', label: '뉴욕 (GMT-5)' },
  { value: 'America/Los_Angeles', label: '로스앤젤레스 (GMT-8)' },
  { value: 'Europe/London', label: '런던 (GMT+0)' },
  { value: 'Europe/Paris', label: '파리 (GMT+1)' },
  { value: 'UTC', label: 'UTC' },
];

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
  'azure-openai': { icon: '☁️', gradient: 'from-cyan-500 to-blue-600', placeholder: 'Your Azure API Key' },
  lmstudio: { icon: '🖥️', gradient: 'from-emerald-500 to-cyan-500', placeholder: 'http://localhost:1234/v1' },
};

// Step 4: Preferences
const defaultView = ref<'kanban' | 'list' | 'timeline' | 'calendar'>('kanban');
const enableAnimations = ref(true);
const compactMode = ref(false);
const autoSave = ref(true);

const viewOptions = [
  { value: 'kanban', label: '칸반 보드', icon: '📋', description: '드래그 앤 드롭으로 태스크 관리' },
  { value: 'list', label: '리스트', icon: '📝', description: '간결한 목록 형태' },
  { value: 'timeline', label: '타임라인', icon: '📅', description: '일정 기반 뷰' },
  { value: 'calendar', label: '캘린더', icon: '🗓️', description: '월간 캘린더 뷰' },
];

// Step 5: Projects
const isScanning = ref(false);
const discoveredRepos = ref<{ path: string; name: string; type: string }[]>([]);
const scanCompleted = ref(false);

// Don't show again option
const dontShowAgain = ref(false);

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
  profile: 25,
  'ai-provider': 35,
  preferences: 20,
  projects: 10,
  complete: 10,
};

function isStepCompleted(step: WizardStep): boolean {
  switch (step) {
    case 'welcome':
      return currentStepIndex.value > STEPS.findIndex((s) => s.id === 'welcome');
    case 'profile':
      return displayName.value.trim().length >= 2;
    case 'ai-provider':
      return isAIProviderCompleted();
    case 'preferences':
      return currentStepIndex.value > STEPS.findIndex((s) => s.id === 'preferences');
    case 'projects':
      return currentStepIndex.value > STEPS.findIndex((s) => s.id === 'projects');
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
  return apiKey.value.length >= 10 || isOAuthConnected.value;
}

const progressPercent = computed(() => {
  const total = Object.values(STEP_WEIGHTS).reduce((acc, v) => acc + v, 0);
  const earned = STEPS.filter((_, idx) => idx <= currentStepIndex.value)
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

const selectedProviderReady = computed(() => providerIsReady(selectedProvider.value));

const isSelectedProviderLocal = computed(() => isProviderLocal(selectedProvider.value));

const requiresApiKey = computed(() => {
  const provider = selectedProvider.value;
  if (!provider) return false;
  if (isProviderLocal(provider)) return false;
  const methods = provider.authMethods || [];
  return methods.includes('apiKey') || methods.includes('both');
});

const providerStatusMap = computed<Record<string, { label: string; tone: 'success' | 'warning' | 'muted' }>>(() => {
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
  return providerMeta[providerId] || { icon: '🤖', gradient: 'from-gray-400 to-gray-500', placeholder: 'API Key...' };
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
    return { label: '연결됨', tone: 'success' };
  }
  const status = settingsStore.getLocalProviderStatus(provider.id);
  if (status.status === 'available') {
    return { label: '로컬 감지', tone: 'success' };
  }
  if (status.status === 'checking') {
    return { label: '확인 중', tone: 'warning' };
  }
  if (status.status === 'unavailable' && isProviderLocal(provider)) {
    return { label: '미실행', tone: 'muted' };
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
      return '실행 중';
    case 'checking':
      return '확인 중';
    case 'unavailable':
      return '미실행';
    default:
      return '미확인';
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
    return `LM Studio 서버가 응답 중입니다 ${source}`.trim();
  }
  if (status.status === 'unavailable') {
    return status.details
      ? `연결 실패: ${status.details}`
      : 'LM Studio가 실행 중인지 확인해주세요';
  }
  if (status.status === 'checking') {
    return '로컬 서버 상태를 확인 중입니다...';
  }
  return '아직 상태를 확인하지 않았습니다';
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
    selectedProviderId.value = (readyProvider || providers[0]).id;
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
  if (idx < STEPS.length - 1) {
    // Save step data
    saveStepData();
    currentStep.value = STEPS[idx + 1].id;
  }
}

function prevStep() {
  const idx = currentStepIndex.value;
  if (idx > 0) {
    currentStep.value = STEPS[idx - 1].id;
  }
}

function goToStep(step: WizardStep) {
  const targetIdx = STEPS.findIndex(s => s.id === step);
  if (targetIdx <= currentStepIndex.value) {
    currentStep.value = step;
  }
}

function skipWizard() {
  if (dontShowAgain.value) {
    saveSetupCompleted();
  }
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
    case 'preferences':
      await settingsStore.updateGeneralSettings({
        defaultProjectView: defaultView.value,
        enableAnimations: enableAnimations.value,
        compactMode: compactMode.value,
        autoSave: autoSave.value,
      });
      break;
  }
}

async function validateApiKey() {
  if (!selectedProviderId.value || !apiKey.value) return;

  isValidating.value = true;
  validationResult.value = null;

  try {
    // Basic validation for now
    await new Promise(resolve => setTimeout(resolve, 1000));

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

async function scanLocalRepositories() {
  isScanning.value = true;
  discoveredRepos.value = [];

  try {
    const repos = await (window as any).electron?.fs?.scanRepositories?.({
      includeGit: true,
      includeClaudeCode: true,
      includeCodex: true,
      includeAntigravity: true,
      maxDepth: 3,
    });

    if (repos) {
      discoveredRepos.value = repos.slice(0, 10); // Limit to 10 repos for display
    }
    scanCompleted.value = true;
  } catch (error) {
    console.error('Failed to scan repositories:', error);
    scanCompleted.value = true;
  } finally {
    isScanning.value = false;
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
    timezone.value = settingsStore.userProfile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  if (settingsStore.generalSettings) {
    defaultView.value = settingsStore.generalSettings.defaultProjectView || 'kanban';
    enableAnimations.value = settingsStore.generalSettings.enableAnimations ?? true;
    compactMode.value = settingsStore.generalSettings.compactMode ?? false;
    autoSave.value = settingsStore.generalSettings.autoSave ?? true;
  }
});

watch(() => props.open, (isOpen) => {
  if (!isOpen) {
    // Reset state
    currentStep.value = 'welcome';
    selectedProviderId.value = null;
    apiKey.value = '';
    validationResult.value = null;
    discoveredRepos.value = [];
    scanCompleted.value = false;
  }
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
    >
      <div class="w-full max-w-3xl max-h-[90vh] bg-gradient-to-br from-gray-900 to-gray-950 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-700/50">
        <!-- Header -->
        <div class="px-8 py-6 border-b border-gray-700/50">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-2xl font-bold text-white flex items-center gap-3">
                <span class="text-3xl">🚀</span>
                {{ STEPS[currentStepIndex].title }}
              </h2>
              <p class="text-sm text-gray-400 mt-1">
                {{ STEPS[currentStepIndex].description }}
              </p>
            </div>
            <button
              @click="skipWizard"
              class="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
              title="건너뛰기"
            >
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Progress Bar -->
          <div class="mt-6">
            <div class="flex items-center justify-between text-xs text-gray-500 mb-2">
              <span>단계 {{ currentStepIndex + 1 }} / {{ STEPS.length }}</span>
              <span>{{ progressPercent }}% 완료</span>
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
                @click="goToStep(step.id)"
                :disabled="idx > currentStepIndex"
                :class="[
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all',
                  idx === currentStepIndex
                    ? 'bg-blue-500 text-white ring-4 ring-blue-500/30'
                    : idx < currentStepIndex
                    ? 'bg-green-500 text-white cursor-pointer'
                    : 'bg-gray-700 text-gray-500 cursor-not-allowed',
                ]"
              >
                <svg v-if="idx < currentStepIndex" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
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
            <div class="w-32 h-32 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-purple-500/30">
              <span class="text-6xl">🤖</span>
            </div>

            <div>
              <h3 class="text-3xl font-bold text-white mb-3">AI Workflow Manager에 오신 것을 환영합니다!</h3>
              <p class="text-gray-400 max-w-lg mx-auto">
                AI를 활용하여 프로젝트를 효율적으로 관리하고,
                태스크를 자동화하며, 생산성을 극대화하세요.
              </p>
            </div>

            <div class="grid grid-cols-3 gap-4 max-w-xl mx-auto">
              <div class="bg-gray-800/50 rounded-xl p-4 text-center">
                <span class="text-3xl mb-2 block">🎯</span>
                <div class="text-sm font-medium text-white">프로젝트 관리</div>
                <div class="text-xs text-gray-500 mt-1">칸반, 타임라인 뷰</div>
              </div>
              <div class="bg-gray-800/50 rounded-xl p-4 text-center">
                <span class="text-3xl mb-2 block">🤖</span>
                <div class="text-sm font-medium text-white">AI 자동화</div>
                <div class="text-xs text-gray-500 mt-1">태스크 자동 실행</div>
              </div>
              <div class="bg-gray-800/50 rounded-xl p-4 text-center">
                <span class="text-3xl mb-2 block">🔗</span>
                <div class="text-sm font-medium text-white">다중 AI 연동</div>
                <div class="text-xs text-gray-500 mt-1">Claude, GPT, Gemini</div>
              </div>
            </div>

            <p class="text-sm text-gray-500">
              몇 가지 간단한 설정을 완료하면 바로 사용할 수 있습니다.
            </p>
          </div>

          <!-- Step 2: Profile -->
          <div v-if="currentStep === 'profile'" class="space-y-6 max-w-md mx-auto">
            <div class="text-center mb-8">
              <div class="w-20 h-20 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-4">
                <span class="text-4xl">👤</span>
              </div>
              <p class="text-gray-400">기본 사용자 정보를 설정해주세요</p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                표시 이름 <span class="text-red-400">*</span>
              </label>
              <input
                v-model="displayName"
                type="text"
                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="이름을 입력하세요"
              />
              <p class="text-xs text-gray-500 mt-1">최소 2자 이상</p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                언어
              </label>
              <select
                v-model="language"
                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option v-for="lang in languages" :key="lang.value" :value="lang.value">
                  {{ lang.label }}
                </option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                시간대
              </label>
              <select
                v-model="timezone"
                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option v-for="tz in timezones" :key="tz.value" :value="tz.value">
                  {{ tz.label }}
                </option>
              </select>
            </div>
          </div>

          <!-- Step 3: AI Provider -->
          <div v-if="currentStep === 'ai-provider'" class="space-y-6">
            <div class="text-center mb-6">
              <p class="text-gray-400">
                멀티모달 AI 또는 로컬 LM Studio/Ollama를 연결하여 이미지 분석과 자동화를 사용하세요.
                로컬 서버가 실행 중이면 자동으로 감지됩니다.
              </p>
            </div>

            <div
              v-if="aiProviderOptions.length === 0"
              class="p-4 bg-gray-900/40 border border-gray-700 rounded-xl text-center text-sm text-gray-400"
            >
              사용할 수 있는 AI 프로바이더가 없습니다. Settings에서 새 프로바이더를 추가하세요.
            </div>
            <div v-else class="grid grid-cols-2 gap-3">
              <button
                v-for="provider in aiProviderOptions"
                :key="provider.id"
                @click="selectProvider(provider)"
                :class="[
                  'p-4 border-2 rounded-xl text-left transition-all relative group',
                  selectedProviderId === provider.id
                    ? 'border-blue-500 bg-blue-900/20'
                    : providerIsReady(provider)
                      ? 'border-green-600 bg-green-900/20 hover:border-green-500'
                      : 'border-gray-700 hover:border-gray-600 bg-gray-800/30',
                ]"
              >
                <div
                  v-if="providerStatusMap[provider.id]"
                  class="absolute top-2 right-2"
                >
                  <span
                    :class="[
                      'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide',
                      getStatusBadgeClass(providerStatusMap[provider.id].tone)
                    ]"
                  >
                    {{ providerStatusMap[provider.id].label }}
                  </span>
                </div>
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-xl">{{ getProviderMeta(provider.id).icon }}</span>
                  <span class="font-medium text-white text-sm">{{ provider.name }}</span>
                </div>
                <p class="text-xs text-gray-500 line-clamp-2">{{ provider.description }}</p>
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

            <div v-if="selectedProviderId && selectedProvider" class="bg-gray-800/50 rounded-xl p-6 space-y-4">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <span class="text-xl">{{ getProviderMeta(selectedProviderId).icon }}</span>
                  <span class="font-medium text-white">{{ selectedProvider.name }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    v-if="selectedProvider.website"
                    @click="openExternal(selectedProvider.website!)"
                    class="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors flex items-center gap-1"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    공식 페이지 열기
                  </button>
                </div>
              </div>

              <div v-if="isSelectedProviderLocal" class="space-y-4">
                <div class="p-4 border border-emerald-700/40 bg-emerald-900/10 rounded-xl">
                  <h4 class="text-sm font-semibold text-emerald-300 mb-2">LM Studio 설치 &amp; 연동 가이드</h4>
                  <ol class="text-xs text-emerald-100 list-decimal list-inside space-y-1">
                    <li>lmstudio.ai에서 최신 버전을 다운로드하고 설치합니다.</li>
                    <li>LM Studio를 실행해 <span class="font-semibold">Server &gt; OpenAI Compatible Server</span>를 시작합니다.</li>
                    <li>사용할 모델을 로드하고 <span class="font-semibold">Start Server</span>로 API 서버를 실행합니다.</li>
                    <li>아래 Base URL이 LM Studio에서 표시되는 주소(기본 <code class="font-mono text-emerald-200">http://localhost:1234/v1</code>)인지 확인하세요.</li>
                  </ol>
                  <div class="mt-3 flex flex-wrap gap-2">
                    <button
                      class="px-4 py-2 text-xs font-medium rounded-lg bg-emerald-700/70 hover:bg-emerald-600 text-white transition-colors"
                      @click="openExternal('https://lmstudio.ai')"
                    >
                      LM Studio 다운로드
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
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {{ isCheckingLocalProvider ? '상태 확인 중...' : '상태 재확인' }}
                    </button>
                  </div>
                </div>

                <div class="grid gap-4 md:grid-cols-2">
                  <div class="p-4 bg-gray-900/40 border border-gray-700 rounded-xl space-y-2">
                    <div class="flex items-center justify-between">
                      <div>
                        <p class="text-sm font-medium text-white">로컬 상태</p>
                        <p class="text-xs text-gray-500">
                          {{ getLocalStatusDescription(selectedProviderStatus) }}
                        </p>
                      </div>
                      <span
                        :class="[
                          'px-2 py-0.5 text-xs rounded-full font-semibold',
                          getStatusBadgeClass(getLocalStatusTone(selectedProviderStatus))
                        ]"
                      >
                        {{ getLocalStatusLabel(selectedProviderStatus) }}
                      </span>
                    </div>
                    <p class="text-xs text-gray-500">
                      {{
                        selectedProviderStatus.lastChecked
                          ? `최근 확인: ${new Date(selectedProviderStatus.lastChecked).toLocaleTimeString()}`
                          : '최근 확인 기록 없음'
                      }}
                    </p>
                  </div>
                  <div class="p-4 bg-gray-900/40 border border-gray-700 rounded-xl space-y-2">
                    <label class="block text-sm font-medium text-gray-300">
                      Base URL
                    </label>
                    <input
                      v-model="providerBaseUrl"
                      type="text"
                      class="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-600 focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono text-sm"
                      placeholder="http://localhost:1234/v1"
                    />
                    <p class="text-xs text-gray-500">LM Studio 서버에서 표시되는 주소와 동일해야 합니다.</p>
                  </div>
                </div>
              </div>

              <div v-else>
                <div v-if="supportsOAuth" class="space-y-3">
                  <div class="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                    <div class="flex items-center gap-3">
                      <div
                        :class="[
                          'w-8 h-8 rounded-lg flex items-center justify-center',
                          isOAuthConnected ? 'bg-green-900/30' : 'bg-gray-700'
                        ]"
                      >
                        <svg v-if="isOAuthConnected" class="w-5 h-5 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                        </svg>
                        <svg v-else class="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                        </svg>
                      </div>
                      <div>
                        <div class="text-sm font-medium text-white">OAuth 연결</div>
                        <div class="text-xs text-gray-500">
                          {{ isOAuthConnected ? '계정이 연결되었습니다' : 'OAuth로 간편하게 연결하세요' }}
                        </div>
                      </div>
                    </div>
                    <button
                      v-if="!isOAuthConnected"
                      @click="connectOAuth"
                      :disabled="isConnectingOAuth"
                      class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                    >
                      <svg v-if="isConnectingOAuth" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {{ isConnectingOAuth ? '연결 중...' : 'OAuth 연결' }}
                    </button>
                    <span v-else class="text-green-400 text-sm font-medium">연결됨</span>
                  </div>

                  <div class="text-center text-gray-500 text-xs">또는</div>
                </div>

                <div v-if="requiresApiKey" class="space-y-3">
                  <label class="text-sm text-gray-400">API 키로 연결</label>
                  <div class="relative">
                    <input
                      v-model="apiKey"
                      :type="showApiKey ? 'text' : 'password'"
                      class="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 pr-24 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                      :placeholder="getProviderMeta(selectedProviderId).placeholder"
                    />
                    <button
                      @click="showApiKey = !showApiKey"
                      class="absolute right-12 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-white"
                    >
                      <svg v-if="showApiKey" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268-2.943 9.542-7z" />
                      </svg>
                      <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268-2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                    <button
                      @click="validateApiKey"
                      :disabled="!apiKey || isValidating"
                      class="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
                    >
                      {{ isValidating ? '확인중...' : '확인' }}
                    </button>
                  </div>

                  <div v-if="validationResult === 'success'" class="flex items-center gap-2 text-green-400 text-sm">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                    </svg>
                    <span>{{ isOAuthConnected ? 'OAuth 연결이 완료되었습니다' : 'API 키가 확인되었습니다' }}</span>
                  </div>
                  <div v-else-if="validationResult === 'error'" class="flex items-center gap-2 text-red-400 text-sm">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                    </svg>
                    <span>연결에 실패했습니다. 다시 시도해주세요.</span>
                  </div>

                  <p class="text-xs text-gray-500">
                    API 키는 안전하게 로컬에 저장되며 외부로 전송되지 않습니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <!-- Step 4: Preferences -->
          <div v-if="currentStep === 'preferences'" class="space-y-6 max-w-md mx-auto">
            <div class="text-center mb-6">
              <p class="text-gray-400">작업 스타일에 맞게 환경을 설정하세요</p>
            </div>

            <!-- Default View -->
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-3">
                기본 프로젝트 뷰
              </label>
              <div class="grid grid-cols-2 gap-3">
                <button
                  v-for="view in viewOptions"
                  :key="view.value"
                  @click="defaultView = view.value as any"
                  :class="[
                    'p-4 border-2 rounded-xl text-left transition-all',
                    defaultView === view.value
                      ? 'border-blue-500 bg-blue-900/20'
                      : 'border-gray-700 hover:border-gray-600 bg-gray-800/30',
                  ]"
                >
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xl">{{ view.icon }}</span>
                    <span class="font-medium text-white text-sm">{{ view.label }}</span>
                  </div>
                  <p class="text-xs text-gray-500">{{ view.description }}</p>
                </button>
              </div>
            </div>

            <!-- Toggle Options -->
            <div class="space-y-4">
              <label
                class="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800/70 transition-colors"
              >
                <div>
                  <div class="font-medium text-white text-sm">애니메이션 효과</div>
                  <div class="text-xs text-gray-500">부드러운 전환 효과 사용</div>
                </div>
                <input
                  type="checkbox"
                  v-model="enableAnimations"
                  class="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                />
              </label>

              <label
                class="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800/70 transition-colors"
              >
                <div>
                  <div class="font-medium text-white text-sm">컴팩트 모드</div>
                  <div class="text-xs text-gray-500">더 많은 정보를 한 화면에 표시</div>
                </div>
                <input
                  type="checkbox"
                  v-model="compactMode"
                  class="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                />
              </label>

              <label
                class="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg cursor-pointer hover:bg-gray-800/70 transition-colors"
              >
                <div>
                  <div class="font-medium text-white text-sm">자동 저장</div>
                  <div class="text-xs text-gray-500">변경사항 자동 저장</div>
                </div>
                <input
                  type="checkbox"
                  v-model="autoSave"
                  class="w-5 h-5 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
                />
              </label>
            </div>
          </div>

          <!-- Step 5: Projects -->
          <div v-if="currentStep === 'projects'" class="space-y-6">
            <div class="text-center mb-6">
              <p class="text-gray-400">로컬 개발 저장소를 자동으로 탐색합니다</p>
            </div>

            <div class="text-center">
              <button
                v-if="!scanCompleted && !isScanning"
                @click="scanLocalRepositories"
                class="px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition-colors inline-flex items-center gap-2"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span>로컬 저장소 검색</span>
              </button>

              <div v-if="isScanning" class="py-8">
                <div class="animate-spin w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p class="text-gray-400">로컬 저장소를 검색하고 있습니다...</p>
                <p class="text-xs text-gray-500 mt-1">Development, Projects, GitHub 폴더 등을 확인합니다</p>
              </div>
            </div>

            <div v-if="scanCompleted && !isScanning" class="space-y-4">
              <div v-if="discoveredRepos.length > 0">
                <h4 class="text-sm font-medium text-gray-300 mb-3">
                  발견된 저장소 ({{ discoveredRepos.length }}개)
                </h4>
                <div class="space-y-2 max-h-[300px] overflow-y-auto">
                  <div
                    v-for="repo in discoveredRepos"
                    :key="repo.path"
                    class="p-3 bg-gray-800/50 rounded-lg flex items-center gap-3"
                  >
                    <span class="text-xl">
                      {{ repo.type === 'claude-code' ? '🤖' : repo.type === 'codex' ? '⚡' : repo.type === 'antigravity' ? '🚀' : '📂' }}
                    </span>
                    <div class="flex-1 min-w-0">
                      <div class="font-medium text-white text-sm truncate">{{ repo.name }}</div>
                      <div class="text-xs text-gray-500 truncate">{{ repo.path }}</div>
                    </div>
                    <span class="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded">{{ repo.type }}</span>
                  </div>
                </div>
                <p class="text-xs text-gray-500 mt-3">
                  이 저장소들은 프로젝트 생성 시 바로 선택할 수 있습니다.
                </p>
              </div>

              <div v-else class="text-center py-8 bg-gray-800/30 rounded-xl">
                <span class="text-4xl mb-3 block">📭</span>
                <p class="text-gray-400">발견된 저장소가 없습니다</p>
                <p class="text-xs text-gray-500 mt-1">나중에 프로젝트 생성 시 직접 선택할 수 있습니다</p>
              </div>
            </div>

            <div class="bg-gray-800/30 rounded-lg p-4 text-center">
              <p class="text-sm text-gray-400">
                이 단계는 선택 사항입니다. 건너뛰고 나중에 설정할 수 있습니다.
              </p>
            </div>
          </div>

          <!-- Step 6: Complete -->
          <div v-if="currentStep === 'complete'" class="text-center space-y-8">
            <div class="w-32 h-32 mx-auto bg-gradient-to-br from-green-400 to-green-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-green-500/30">
              <svg class="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
            </div>

            <div>
              <h3 class="text-3xl font-bold text-white mb-3">설정이 완료되었습니다!</h3>
              <p class="text-gray-400 max-w-lg mx-auto">
                이제 AI Workflow Manager를 사용할 준비가 되었습니다.
                새 프로젝트를 생성하거나 기존 저장소를 가져와 시작하세요.
              </p>
            </div>

            <!-- Summary -->
            <div class="bg-gray-800/50 rounded-xl p-6 max-w-md mx-auto text-left space-y-4">
              <h4 class="font-medium text-white text-center mb-4">설정 요약</h4>

              <div class="flex items-center justify-between py-2 border-b border-gray-700">
                <span class="text-gray-400 text-sm">사용자</span>
                <span class="text-white text-sm">{{ displayName || '미설정' }}</span>
              </div>
              <div class="flex items-center justify-between py-2 border-b border-gray-700">
                <span class="text-gray-400 text-sm">AI 제공자</span>
                <span class="text-white text-sm">{{ selectedProvider?.name || '미설정' }}</span>
              </div>
              <div class="flex items-center justify-between py-2 border-b border-gray-700">
                <span class="text-gray-400 text-sm">기본 뷰</span>
                <span class="text-white text-sm">{{ viewOptions.find(v => v.value === defaultView)?.label }}</span>
              </div>
              <div class="flex items-center justify-between py-2">
                <span class="text-gray-400 text-sm">발견된 저장소</span>
                <span class="text-white text-sm">{{ discoveredRepos.length }}개</span>
              </div>
            </div>

            <!-- Don't show again -->
            <label class="inline-flex items-center gap-2 cursor-pointer text-gray-400 hover:text-gray-300">
              <input
                type="checkbox"
                v-model="dontShowAgain"
                class="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
              />
              <span class="text-sm">다음에 이 위자드 표시 안 함</span>
            </label>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-8 py-5 border-t border-gray-700/50 bg-gray-900/50 flex items-center justify-between">
          <button
            v-if="currentStepIndex > 0 && currentStep !== 'complete'"
            @click="prevStep"
            class="px-5 py-2.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
          >
            ← 이전
          </button>
          <div v-else></div>

          <div class="flex items-center gap-3">
            <button
              v-if="currentStep !== 'welcome' && currentStep !== 'complete'"
              @click="skipWizard"
              class="px-5 py-2.5 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
            >
              건너뛰기
            </button>

            <button
              v-if="currentStep !== 'complete'"
              @click="nextStep"
              :disabled="!canProceed && STEPS[currentStepIndex].required"
              :class="[
                'px-6 py-2.5 rounded-lg font-medium transition-colors',
                canProceed || !STEPS[currentStepIndex].required
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed',
              ]"
            >
              {{ currentStepIndex === STEPS.length - 2 ? '완료' : '다음 →' }}
            </button>

            <button
              v-else
              @click="completeSetup"
              class="px-8 py-2.5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 text-white rounded-lg font-medium transition-all"
            >
              시작하기 🚀
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
