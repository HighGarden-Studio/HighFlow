<script setup lang="ts">
import { computed } from 'vue';
import type { MarketplaceItem } from '../../renderer/stores/marketplaceStore';

const props = defineProps<{
    item: MarketplaceItem;
}>();

const emit = defineEmits<{
    (e: 'click', id: string): void;
    (e: 'action', id: string): void; // For the button action
}>();

const typeColors = {
    project: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    operator: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    script_template: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

const typeLabels = {
    project: 'PROJECT',
    operator: 'OPERATOR',
    script_template: 'SCRIPT',
};

const actionLabel = computed(() => {
    if (props.item.isOwned) return 'Install';
    if (props.item.price === 0) return 'Get';
    return 'Purchase';
});

const isOwnedOrFree = computed(() => props.item.isOwned || props.item.price === 0);

function handleAction(e: Event) {
    e.stopPropagation(); // Prevent card click
    emit('action', props.item.id);
}
</script>

<template>
    <div
        class="group relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden flex flex-col h-full pt-10"
        @click="emit('click', item.id)"
    >
        <!-- Type Badge (Top Left Absolute) -->
        <div class="absolute top-4 left-4">
            <span
                :class="[
                    'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
                    typeColors[item.type],
                ]"
            >
                {{ typeLabels[item.type] }}
            </span>
        </div>

        <!-- Card Body -->
        <div class="px-5 pb-5 flex flex-col flex-1">
            <!-- Header -->
            <div class="flex items-start gap-3 mb-3">
                <div
                    class="w-12 h-12 flex-shrink-0 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-2xl shadow-sm border border-gray-200 dark:border-gray-600 group-hover:scale-105 transition-transform"
                >
                    {{ item.iconUrl || '📦' }}
                </div>
                <div class="min-w-0">
                    <h3
                        class="font-bold text-gray-900 dark:text-gray-100 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
                    >
                        {{ item.name }}
                    </h3>
                    <div
                        class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                    >
                        <span class="font-medium truncate">{{ item.author.name }}</span>
                        <svg
                            v-if="item.author.isVerified"
                            class="w-3.5 h-3.5 text-blue-500 flex-shrink-0"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clip-rule="evenodd"
                            />
                        </svg>
                    </div>
                </div>
            </div>

            <!-- Description -->
            <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 mb-4 flex-1">
                {{ item.summary }}
            </p>

            <div class="w-full h-px bg-gray-100 dark:bg-gray-700 mb-4"></div>

            <!-- Metadata Row -->
            <div class="flex items-center gap-4 text-xs text-gray-500 font-medium mb-4">
                <!-- Rating -->
                <div class="flex items-center gap-1 text-amber-500">
                    <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                        <path
                            d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                        />
                    </svg>
                    <span class="text-gray-700 dark:text-gray-300">{{
                        item.stats.rating.toFixed(1)
                    }}</span>
                    <span class="text-gray-400">({{ item.stats.reviewCount }})</span>
                </div>

                <!-- Downloads -->
                <div class="flex items-center gap-1 text-gray-400" title="Installs">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                        />
                    </svg>
                    <span>{{ item.stats.installCount }}</span>
                </div>
            </div>

            <!-- Footer: Price & Action -->
            <div class="flex items-end justify-between mt-auto">
                <div class="flex flex-col">
                    <span
                        class="text-[10px] text-gray-400 font-medium uppercase tracking-wide mb-0.5"
                        >Price</span
                    >
                    <div class="text-lg font-bold text-gray-900 dark:text-white leading-none">
                        {{ item.price === 0 ? 'Free' : item.price }}
                        <span v-if="item.price > 0" class="text-xs font-normal text-gray-500"
                            >Credits</span
                        >
                    </div>
                </div>

                <button
                    @click="handleAction"
                    :class="[
                        'px-4 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm',
                        isOwnedOrFree
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600',
                    ]"
                >
                    {{ actionLabel }}
                </button>
            </div>
        </div>
    </div>
</template>
