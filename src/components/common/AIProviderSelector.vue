<script setup lang="ts">
import { computed } from 'vue';
import type { AIProvider } from '../../services/ai/AIInterviewService';
import { useSettingsStore } from '../../renderer/stores/settingsStore';
import {
    getModelCharacteristics,
    formatContextWindow,
    getSpeedEmoji,
    getCostTierEmoji,
} from '../../utils/modelCharacteristics';

interface Props {
    provider: AIProvider | null;
    model: string | null;
    label?: string;
    showModel?: boolean;
    recommendedProvider?: AIProvider | null;
    disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    label: 'AI 제공자',
    showModel: true,
    recommendedProvider: null,
    disabled: false,
});

const emit = defineEmits<{
    (e: 'update:provider', value: AIProvider | null): void;
    (e: 'update:model', value: string | null): void;
}>();

const settingsStore = useSettingsStore();

const allAIProviders = computed(() => {
    return settingsStore.aiProviders.map((provider) => ({
        ...provider,
        isConnected: provider.enabled && (!!provider.apiKey || provider.isConnected),
    }));
});

const currentProvider = computed(() =>
    props.provider ? settingsStore.aiProviders.find((p) => p.id === props.provider) : undefined
);

const isSelectedProviderConnected = computed(() => {
    if (!props.provider) return false;
    const provider = allAIProviders.value.find((p) => p.id === props.provider);
    return provider?.isConnected ?? false;
});

const providerModelOptions = computed(() => {
    const provider = currentProvider.value;
    if (!provider) {
        return [];
    }
    const models = provider.models && provider.models.length > 0 ? provider.models : [];
    return models.map((modelId) => {
        const characteristics = getModelCharacteristics(modelId);
        return {
            id: modelId,
            label: modelId === provider.defaultModel ? `${modelId} (기본)` : modelId,
            characteristics,
        };
    });
});

function handleProviderChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    emit('update:provider', value === 'null' ? null : (value as AIProvider));
    // Reset model when provider changes
    emit('update:model', null);
}

function handleModelChange(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    emit('update:model', value);
}
</script>

<template>
    <div class="space-y-4">
        <!-- Provider Selection -->
        <div>
            <div class="flex items-center justify-between mb-2">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {{ label }}
                </label>
                <!-- Recommendation Badge -->
                <span
                    v-if="recommendedProvider && recommendedProvider !== provider"
                    class="text-xs px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full border border-blue-100 dark:border-blue-800 animate-pulse"
                >
                    Recommended: {{ recommendedProvider }}
                </span>
            </div>

            <div class="relative">
                <select
                    :value="provider ?? 'null'"
                    :disabled="disabled"
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed appearance-none pr-8"
                    @change="handleProviderChange"
                >
                    <option value="null">선택하세요</option>
                    <option
                        v-for="p in allAIProviders"
                        :key="p.id"
                        :value="p.id"
                        class="flex items-center"
                    >
                        {{ p.name }}
                        {{ p.isConnected ? '' : ' (연동 안됨)' }}
                        {{ recommendedProvider === p.id ? ' ⭐' : '' }}
                    </option>
                </select>
                <!-- Custom Arrow Icon for better styling consistency -->
                <div class="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                    <svg
                        class="w-4 h-4 text-gray-500 dark:text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </div>
            </div>
        </div>

        <!-- Model Selection -->
        <div v-if="showModel && providerModelOptions.length > 0">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                AI 모델
            </label>
            <div class="relative">
                <select
                    :value="model"
                    :disabled="disabled"
                    class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed appearance-none pr-8"
                    @change="handleModelChange"
                >
                    <option v-for="m in providerModelOptions" :key="m.id" :value="m.id">
                        {{ m.label }}
                        <template v-if="m.characteristics">
                            {{ getSpeedEmoji(m.characteristics.speed) }}
                            {{ getCostTierEmoji(m.characteristics.costTier) }}
                            <template v-if="m.characteristics.contextWindow">
                                {{ formatContextWindow(m.characteristics.contextWindow) }}
                            </template>
                        </template>
                    </option>
                </select>
                <div class="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
                    <svg
                        class="w-4 h-4 text-gray-500 dark:text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </div>
            </div>
        </div>

        <!-- Connection Warning -->
        <div
            v-if="provider && !isSelectedProviderConnected"
            class="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800"
        >
            <div class="flex items-start gap-2">
                <svg
                    class="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                </svg>
                <div class="flex-1">
                    <p class="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                        Provider 연동 필요
                    </p>
                    <p class="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                        이 AI 제공자를 사용하려면 설정에서 API 키를 등록해야 합니다.
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>
