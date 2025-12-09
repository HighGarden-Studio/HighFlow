<script setup lang="ts">
/**
 * AIProviderModal Component
 *
 * Modal for configuring AI provider settings
 */
import { ref, computed, watch } from 'vue';
import { getProviderIcon } from '../../utils/iconMapping';
import IconRenderer from '../common/IconRenderer.vue';
import type { AIProviderConfig, LocalProviderStatus } from '../../renderer/stores/settingsStore';
import { useSettingsStore } from '../../renderer/stores/settingsStore';
import { eventBus } from '../../services/events/EventBus';

interface Props {
    provider: AIProviderConfig | null;
    open: boolean;
}

const props = defineProps<Props>();
const settingsStore = useSettingsStore();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'save', config: Partial<AIProviderConfig>): void;
    (e: 'validate'): void;
    (e: 'connectOAuth'): void;
    (e: 'disconnectOAuth'): void;
}>();

// Form State
const form = ref({
    apiKey: '',
    baseUrl: '',
    enabled: false,
    defaultModel: '',
    activeAuthMethod: 'apiKey' as 'apiKey' | 'oauth',
});

const showApiKey = ref(false);
const isValidating = ref(false);
const validationResult = ref<'success' | 'error' | null>(null);
const validationMessage = ref('');
const isConnectingOAuth = ref(false);
const isSyncingLocalModels = ref(false);

// Watch for provider changes
watch(
    () => props.provider,
    (newProvider) => {
        if (newProvider) {
            form.value = {
                apiKey: newProvider.apiKey || '',
                baseUrl: newProvider.baseUrl || '',
                enabled: newProvider.enabled,
                defaultModel: newProvider.defaultModel || '',
                activeAuthMethod: newProvider.activeAuthMethod || 'apiKey',
            };
            validationResult.value = null;
            validationMessage.value = '';
        }
    },
    { immediate: true, deep: true }
);

// Provider Info - Extended with all providers
const providerInfo = computed(() => {
    const info: Record<string, { color: string; docsUrl: string; apiKeyPlaceholder: string }> = {
        // Major providers
        openai: {
            color: 'from-green-400 to-teal-500',
            docsUrl: 'https://platform.openai.com/api-keys',
            apiKeyPlaceholder: 'sk-...',
        },
        anthropic: {
            color: 'from-orange-400 to-amber-500',
            docsUrl: 'https://console.anthropic.com/settings/keys',
            apiKeyPlaceholder: 'sk-ant-...',
        },
        google: {
            color: 'from-blue-400 to-indigo-500',
            docsUrl: 'https://aistudio.google.com/apikey',
            apiKeyPlaceholder: 'AIza...',
        },
        'azure-openai': {
            color: 'from-cyan-500 to-blue-600',
            docsUrl: 'https://portal.azure.com',
            apiKeyPlaceholder: 'Your Azure API key',
        },
        // Alternative providers
        mistral: {
            color: 'from-purple-500 to-indigo-600',
            docsUrl: 'https://console.mistral.ai/api-keys',
            apiKeyPlaceholder: 'Your Mistral API key',
        },
        cohere: {
            color: 'from-rose-500 to-pink-600',
            docsUrl: 'https://dashboard.cohere.com/api-keys',
            apiKeyPlaceholder: 'Your Cohere API key',
        },
        groq: {
            color: 'from-amber-500 to-orange-600',
            docsUrl: 'https://console.groq.com/keys',
            apiKeyPlaceholder: 'gsk_...',
        },
        perplexity: {
            color: 'from-teal-500 to-cyan-600',
            docsUrl: 'https://www.perplexity.ai/settings/api',
            apiKeyPlaceholder: 'pplx-...',
        },
        together: {
            color: 'from-violet-500 to-purple-600',
            docsUrl: 'https://api.together.xyz/settings/api-keys',
            apiKeyPlaceholder: 'Your Together AI API key',
        },
        fireworks: {
            color: 'from-red-500 to-orange-600',
            docsUrl: 'https://fireworks.ai/account/api-keys',
            apiKeyPlaceholder: 'fw_...',
        },
        deepseek: {
            color: 'from-blue-600 to-indigo-700',
            docsUrl: 'https://platform.deepseek.com/api_keys',
            apiKeyPlaceholder: 'sk-...',
        },
        // Local providers
        ollama: {
            color: 'from-gray-600 to-gray-800',
            docsUrl: 'https://ollama.ai',
            apiKeyPlaceholder: 'No API key required',
        },
        lmstudio: {
            color: 'from-emerald-500 to-green-600',
            docsUrl: 'https://lmstudio.ai',
            apiKeyPlaceholder: 'No API key required',
        },
        // Specialized providers
        openrouter: {
            color: 'from-fuchsia-500 to-pink-600',
            docsUrl: 'https://openrouter.ai/keys',
            apiKeyPlaceholder: 'sk-or-...',
        },
        huggingface: {
            color: 'from-yellow-500 to-amber-600',
            docsUrl: 'https://huggingface.co/settings/tokens',
            apiKeyPlaceholder: 'hf_...',
        },
        replicate: {
            color: 'from-slate-500 to-gray-600',
            docsUrl: 'https://replicate.com/account/api-tokens',
            apiKeyPlaceholder: 'r8_...',
        },
        // Chinese providers
        zhipu: {
            color: 'from-blue-500 to-cyan-600',
            docsUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
            apiKeyPlaceholder: 'Your Zhipu API key',
        },
        moonshot: {
            color: 'from-indigo-600 to-purple-700',
            docsUrl: 'https://platform.moonshot.cn/console/api-keys',
            apiKeyPlaceholder: 'sk-...',
        },
        qwen: {
            color: 'from-orange-500 to-red-600',
            docsUrl: 'https://dashscope.aliyun.com',
            apiKeyPlaceholder: 'sk-...',
        },
        baidu: {
            color: 'from-blue-600 to-blue-800',
            docsUrl: 'https://cloud.baidu.com/product/wenxinworkshop',
            apiKeyPlaceholder: 'Your Baidu API key',
        },
    };
    return (
        info[props.provider?.id || ''] || {
            color: 'from-gray-400 to-gray-500',
            docsUrl: '#',
            apiKeyPlaceholder: 'API Key',
        }
    );
});

// Check if provider supports OAuth
const supportsOAuth = computed(() => {
    if (!props.provider?.authMethods) return false;
    return (
        props.provider.authMethods.includes('oauth') || props.provider.authMethods.includes('both')
    );
});

// Check if provider supports API Key
const supportsApiKey = computed(() => {
    if (!props.provider?.authMethods) return true; // Default to API key support
    return (
        props.provider.authMethods.includes('apiKey') || props.provider.authMethods.includes('both')
    );
});

// Check if provider is local (Ollama, LM Studio)
const isLocalProvider = computed(() => {
    return props.provider?.id === 'ollama' || props.provider?.id === 'lmstudio';
});

const localStatus = computed<LocalProviderStatus>(() => {
    if (!props.provider) {
        return { status: 'unknown' };
    }
    return settingsStore.localProviderStatus[props.provider.id] || { status: 'unknown' };
});

// Check if provider needs base URL configuration
const requiresBaseUrl = computed(() => {
    return (
        props.provider?.id === 'azure-openai' ||
        props.provider?.id === 'ollama' ||
        props.provider?.id === 'lmstudio'
    );
});

// Actions
function handleSave() {
    emit('save', {
        apiKey: form.value.apiKey,
        baseUrl: form.value.baseUrl || undefined,
        enabled: form.value.enabled,
        defaultModel: form.value.defaultModel,
        activeAuthMethod: form.value.activeAuthMethod,
    });
}

async function handleValidate() {
    if (!props.provider) return;

    isValidating.value = true;
    validationResult.value = null;
    validationMessage.value = '';

    try {
        // For local providers, just check if baseUrl is accessible
        if (isLocalProvider.value) {
            const response = await fetch(`${form.value.baseUrl}/api/tags`).catch(() => null);
            if (response?.ok) {
                validationResult.value = 'success';
                validationMessage.value = 'Local server is accessible!';
                form.value.enabled = true;

                eventBus.emit(
                    'system.test',
                    {
                        message: `Test Connection: ${props.provider.name} local server is accessible`,
                        provider: props.provider.name,
                        status: 'success',
                    },
                    'AIProviderModal'
                );
            } else {
                validationResult.value = 'error';
                validationMessage.value =
                    'Cannot connect to local server. Make sure it is running.';

                eventBus.emit(
                    'system.test',
                    {
                        message: `Test Connection: Failed to connect to ${props.provider.name} local server`,
                        provider: props.provider.name,
                        status: 'error',
                    },
                    'AIProviderModal'
                );
            }
            return;
        }

        // For API key validation, use the store's validateApiKey function
        // First update the provider with the current API key
        await settingsStore.updateAIProvider(props.provider.id, {
            apiKey: form.value.apiKey,
            baseUrl: form.value.baseUrl || undefined,
        });

        const isValid = await settingsStore.validateApiKey(props.provider.id);

        if (isValid) {
            validationResult.value = 'success';
            validationMessage.value = 'API key is valid!';
            form.value.enabled = true;

            eventBus.emit(
                'system.test',
                {
                    message: `Test Connection: ${props.provider.name} API key validation success`,
                    provider: props.provider.name,
                    status: 'success',
                },
                'AIProviderModal'
            );
        } else {
            validationResult.value = 'error';
            validationMessage.value = 'Invalid API key. Please check and try again.';

            eventBus.emit(
                'system.test',
                {
                    message: `Test Connection: ${props.provider.name} API key validation failed`,
                    provider: props.provider.name,
                    status: 'error',
                },
                'AIProviderModal'
            );
        }
    } catch (error) {
        validationResult.value = 'error';
        validationMessage.value = error instanceof Error ? error.message : 'Validation failed';

        eventBus.emit(
            'system.test',
            {
                message: `Test Connection: ${props.provider.name} validation error`,
                error: error instanceof Error ? error.message : String(error),
                provider: props.provider.name,
                status: 'error',
            },
            'AIProviderModal'
        );
    } finally {
        isValidating.value = false;
    }
}

async function handleConnectOAuth() {
    if (!props.provider) return;

    isConnectingOAuth.value = true;

    try {
        const success = await settingsStore.connectOAuth(props.provider.id);
        if (success) {
            form.value.enabled = true;
            form.value.activeAuthMethod = 'oauth';

            eventBus.emit(
                'system.test',
                {
                    message: `Test Connection: ${props.provider.name} OAuth connection success`,
                    provider: props.provider.name,
                    status: 'success',
                },
                'AIProviderModal'
            );
        } else {
            eventBus.emit(
                'system.test',
                {
                    message: `Test Connection: ${props.provider.name} OAuth connection failed`,
                    provider: props.provider.name,
                    status: 'error',
                },
                'AIProviderModal'
            );
        }
    } finally {
        isConnectingOAuth.value = false;
    }
}

async function handleDisconnectOAuth() {
    if (!props.provider) return;

    await settingsStore.disconnectOAuth(props.provider.id);
    form.value.activeAuthMethod = 'apiKey';
}

async function refreshLocalModels(): Promise<void> {
    if (!props.provider || !isLocalProvider.value) return;
    isSyncingLocalModels.value = true;
    try {
        await settingsStore.detectLocalProvider(
            props.provider.id,
            form.value.baseUrl || props.provider.baseUrl
        );
        eventBus.emit(
            'system.test',
            {
                message: `Model Sync: ${props.provider.name} models synchronized`,
                provider: props.provider.name,
                status: 'success',
            },
            'AIProviderModal'
        );
    } catch (error) {
        console.error('Failed to refresh local provider status:', error);
        eventBus.emit(
            'system.test',
            {
                message: `Model Sync: Failed to sync ${props.provider.name} models`,
                error: error instanceof Error ? error.message : String(error),
                provider: props.provider.name,
                status: 'error',
            },
            'AIProviderModal'
        );
    } finally {
        isSyncingLocalModels.value = false;
    }
}

function handleClose() {
    emit('close');
}

// Switch between API Key and OAuth
function setAuthMethod(method: 'apiKey' | 'oauth') {
    form.value.activeAuthMethod = method;
}
</script>

<template>
    <Teleport to="body">
        <div
            v-if="open && provider"
            class="fixed inset-0 z-50 overflow-y-auto"
            @click.self="handleClose"
        >
            <!-- Backdrop -->
            <div
                class="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                @click="handleClose"
            />

            <!-- Modal -->
            <div class="flex min-h-full items-center justify-center p-4">
                <div class="relative w-full max-w-lg transform transition-all">
                    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden">
                        <!-- Header -->
                        <div
                            class="relative px-6 py-5 border-b border-gray-200 dark:border-gray-700"
                        >
                            <div
                                :class="[
                                    'absolute inset-0 opacity-10 bg-gradient-to-r',
                                    providerInfo.color,
                                ]"
                            />
                            <div class="relative flex items-center gap-4">
                                <div
                                    :class="[
                                        'w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white',
                                        providerInfo.color,
                                    ]"
                                >
                                    <IconRenderer
                                        :icon="getProviderIcon(provider.id)"
                                        class="w-7 h-7"
                                    />
                                </div>
                                <div class="flex-1">
                                    <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
                                        {{ provider.name }}
                                    </h2>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">
                                        {{ provider.description }}
                                    </p>
                                </div>
                                <!-- Provider Website Link -->
                                <a
                                    v-if="provider.website"
                                    :href="provider.website"
                                    target="_blank"
                                    class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    title="Visit provider website"
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
                                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                        />
                                    </svg>
                                </a>
                            </div>

                            <!-- Close button -->
                            <button
                                class="absolute top-4 right-4 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                                @click="handleClose"
                            >
                                <svg
                                    class="h-6 w-6"
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

                        <!-- Body -->
                        <div class="px-6 py-4 space-y-6 max-h-[calc(100vh-280px)] overflow-y-auto">
                            <!-- Provider Features -->
                            <div class="flex flex-wrap gap-2">
                                <span
                                    v-if="provider.supportsStreaming"
                                    class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                                >
                                    Streaming
                                </span>
                                <span
                                    v-if="provider.supportsVision"
                                    class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                                >
                                    Vision
                                </span>
                                <span
                                    v-if="provider.supportsTools"
                                    class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                                >
                                    Tools/Functions
                                </span>
                                <span
                                    v-if="provider.maxTokens"
                                    class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                >
                                    {{ (provider.maxTokens / 1000).toFixed(0) }}K context
                                </span>
                            </div>

                            <!-- Auth Method Selection (if both supported) -->
                            <div v-if="supportsOAuth && supportsApiKey" class="space-y-3">
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                >
                                    Authentication Method
                                </label>
                                <div class="flex gap-2">
                                    <button
                                        type="button"
                                        :class="[
                                            'flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                            form.activeAuthMethod === 'apiKey'
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
                                        ]"
                                        @click="setAuthMethod('apiKey')"
                                    >
                                        API Key
                                    </button>
                                    <button
                                        type="button"
                                        :class="[
                                            'flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                            form.activeAuthMethod === 'oauth'
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600',
                                        ]"
                                        @click="setAuthMethod('oauth')"
                                    >
                                        OAuth
                                    </button>
                                </div>
                            </div>

                            <!-- OAuth Connection Section -->
                            <div
                                v-if="
                                    supportsOAuth &&
                                    (form.activeAuthMethod === 'oauth' || !supportsApiKey)
                                "
                                class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg"
                            >
                                <div class="flex items-center justify-between">
                                    <div class="flex items-center gap-3">
                                        <div
                                            class="w-10 h-10 bg-blue-100 dark:bg-blue-800 rounded-lg flex items-center justify-center"
                                        >
                                            <svg
                                                class="w-5 h-5 text-blue-600 dark:text-blue-300"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                                                />
                                            </svg>
                                        </div>
                                        <div>
                                            <p
                                                class="text-sm font-medium text-blue-900 dark:text-blue-100"
                                            >
                                                {{
                                                    provider.isConnected
                                                        ? 'Connected via OAuth'
                                                        : 'Connect with OAuth'
                                                }}
                                            </p>
                                            <p class="text-xs text-blue-700 dark:text-blue-300">
                                                {{
                                                    provider.isConnected
                                                        ? 'Your account is linked'
                                                        : 'Securely connect your account'
                                                }}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        v-if="provider.isConnected"
                                        class="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                        @click="handleDisconnectOAuth"
                                    >
                                        Disconnect
                                    </button>
                                    <button
                                        v-else
                                        :disabled="isConnectingOAuth"
                                        class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                                        @click="handleConnectOAuth"
                                    >
                                        {{ isConnectingOAuth ? 'Connecting...' : 'Connect' }}
                                    </button>
                                </div>
                            </div>

                            <!-- API Key Section -->
                            <div
                                v-if="
                                    supportsApiKey &&
                                    (form.activeAuthMethod === 'apiKey' || !supportsOAuth)
                                "
                            >
                                <!-- Local Provider Notice -->
                                <div
                                    v-if="isLocalProvider"
                                    class="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg mb-4 space-y-1.5"
                                >
                                    <p class="text-sm text-yellow-700 dark:text-yellow-300">
                                        This is a local provider. Make sure {{ provider.name }} is
                                        running on your machine.
                                    </p>
                                    <p class="text-xs text-yellow-800 dark:text-yellow-200">
                                        <template v-if="localStatus.status === 'available'">
                                            Connected to
                                            {{
                                                localStatus.baseUrl ||
                                                provider.baseUrl ||
                                                form.baseUrl ||
                                                'local server'
                                            }}.
                                            <span v-if="localStatus.models?.length">
                                                {{ localStatus.models.length }} model(s) detected
                                                <span v-if="localStatus.preferredModel">
                                                    (recommended: {{ localStatus.preferredModel }})
                                                </span>
                                            </span>
                                            <span v-else>
                                                No installed models were reported by LM Studio.
                                            </span>
                                        </template>
                                        <template v-else-if="localStatus.status === 'checking'">
                                            Checking LM Studio status...
                                        </template>
                                        <template v-else-if="localStatus.status === 'unavailable'">
                                            {{
                                                localStatus.details ||
                                                'LM Studio가 실행 중인지 확인해주세요.'
                                            }}
                                        </template>
                                        <template v-else>
                                            Status has not been checked yet.
                                        </template>
                                    </p>
                                </div>

                                <!-- API Key Input -->
                                <div v-if="!isLocalProvider">
                                    <label
                                        class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                    >
                                        API Key
                                    </label>
                                    <div class="relative">
                                        <input
                                            v-model="form.apiKey"
                                            :type="showApiKey ? 'text' : 'password'"
                                            class="w-full px-4 py-2 pr-20 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            :placeholder="providerInfo.apiKeyPlaceholder"
                                        />
                                        <button
                                            type="button"
                                            class="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                            @click="showApiKey = !showApiKey"
                                        >
                                            {{ showApiKey ? 'Hide' : 'Show' }}
                                        </button>
                                    </div>
                                    <div class="flex items-center justify-between mt-2">
                                        <a
                                            :href="providerInfo.docsUrl"
                                            target="_blank"
                                            class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            Get your API key
                                        </a>
                                        <button
                                            type="button"
                                            class="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                                            :disabled="!form.apiKey || isValidating"
                                            @click="handleValidate"
                                        >
                                            {{ isValidating ? 'Validating...' : 'Validate Key' }}
                                        </button>
                                    </div>
                                </div>

                                <!-- Validation Result -->
                                <div
                                    v-if="validationResult"
                                    :class="[
                                        'mt-2 p-3 rounded-lg text-sm',
                                        validationResult === 'success'
                                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                                            : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
                                    ]"
                                >
                                    <div class="flex items-center gap-2">
                                        <svg
                                            v-if="validationResult === 'success'"
                                            class="w-5 h-5 flex-shrink-0"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                        </svg>
                                        <svg
                                            v-else
                                            class="w-5 h-5 flex-shrink-0"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                            />
                                        </svg>
                                        <span>{{ validationMessage }}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Base URL -->
                            <div v-if="requiresBaseUrl || provider.baseUrl">
                                <label
                                    class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >
                                    Base URL
                                    <span v-if="!requiresBaseUrl" class="text-gray-400"
                                        >(optional)</span
                                    >
                                    <span v-else class="text-red-500">*</span>
                                </label>
                                <input
                                    v-model="form.baseUrl"
                                    type="url"
                                    class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    :placeholder="
                                        isLocalProvider
                                            ? 'http://localhost:11434'
                                            : 'https://api.example.com'
                                    "
                                />
                                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    <template v-if="provider.id === 'azure-openai'">
                                        Your Azure OpenAI resource endpoint (e.g.,
                                        https://your-resource.openai.azure.com)
                                    </template>
                                    <template v-else-if="isLocalProvider">
                                        Local server URL (default:
                                        {{
                                            provider.id === 'ollama'
                                                ? 'http://localhost:11434'
                                                : 'http://localhost:1234/v1'
                                        }})
                                    </template>
                                    <template v-else>
                                        Use a custom API endpoint (e.g., for proxy or self-hosted)
                                    </template>
                                </p>
                                <!-- Test Connection for local providers -->
                                <button
                                    v-if="isLocalProvider"
                                    type="button"
                                    class="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                                    :disabled="!form.baseUrl || isValidating"
                                    @click="handleValidate"
                                >
                                    {{ isValidating ? 'Testing...' : 'Test Connection' }}
                                </button>
                            </div>

                            <!-- Default Model -->
                            <div>
                                <div class="flex items-center justify-between mb-2">
                                    <label
                                        class="block text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Default Model
                                    </label>
                                    <button
                                        v-if="isLocalProvider"
                                        type="button"
                                        class="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                                        :disabled="isSyncingLocalModels"
                                        @click="refreshLocalModels"
                                    >
                                        {{
                                            isSyncingLocalModels
                                                ? 'Syncing...'
                                                : 'Sync from LM Studio'
                                        }}
                                    </button>
                                </div>
                                <select
                                    v-model="form.defaultModel"
                                    class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500"
                                    :disabled="
                                        isLocalProvider &&
                                        (!provider.models || provider.models.length === 0)
                                    "
                                >
                                    <option
                                        v-for="model in provider.models || []"
                                        :key="model"
                                        :value="model"
                                    >
                                        {{ model }}
                                    </option>
                                </select>
                                <p
                                    v-if="
                                        isLocalProvider &&
                                        (!provider.models || provider.models.length === 0)
                                    "
                                    class="mt-2 text-xs text-yellow-600 dark:text-yellow-400"
                                >
                                    LM Studio에서 설치된 모델을 찾지 못했습니다. LM Studio 앱에서
                                    모델을 다운로드한 뒤 &quot;Sync from LM Studio&quot; 버튼을 눌러
                                    목록을 새로고침하세요.
                                </p>
                            </div>

                            <!-- Enable Toggle -->
                            <div
                                class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                            >
                                <div>
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">
                                        Enable {{ provider.name }}
                                    </p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">
                                        Allow this provider to be used for AI features
                                    </p>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input
                                        v-model="form.enabled"
                                        type="checkbox"
                                        class="sr-only peer"
                                        :disabled="
                                            !form.apiKey &&
                                            !provider.isConnected &&
                                            !isLocalProvider
                                        "
                                    />
                                    <div
                                        class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
                                    ></div>
                                </label>
                            </div>

                            <!-- Last Validated -->
                            <div
                                v-if="provider.lastValidated"
                                class="text-xs text-gray-500 dark:text-gray-400 text-center"
                            >
                                Last validated:
                                {{ new Date(provider.lastValidated).toLocaleString() }}
                            </div>
                        </div>

                        <!-- Footer -->
                        <div
                            class="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
                        >
                            <button
                                type="button"
                                class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                @click="handleClose"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                                @click="handleSave"
                            >
                                Save Configuration
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>
