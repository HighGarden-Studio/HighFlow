<script setup lang="ts">
/**
 * Marketplace Item Card
 *
 * Displays a marketplace item in grid or list view
 */
import { computed } from 'vue';
import type { MarketplaceItem } from '@core/types/marketplace';
import { useMarketplaceStore } from '../../renderer/stores/marketplaceStore';

interface Props {
    item: MarketplaceItem;
    viewMode?: 'grid' | 'list';
}

const props = withDefaults(defineProps<Props>(), {
    viewMode: 'grid',
});

const emit = defineEmits<{
    click: [item: MarketplaceItem];
}>();

const marketplaceStore = useMarketplaceStore();

// Computed
const isCompatible = computed(() => marketplaceStore.checkCompatibility(props.item));
const isPurchased = computed(() => marketplaceStore.isPurchased(props.item.id));

const itemTypeIcon = computed(() => {
    return props.item.itemType === 'project' ? '📦' : '⚙️';
});

const itemTypeBadgeColor = computed(() => {
    return props.item.itemType === 'project'
        ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
        : 'bg-green-500/20 text-green-400 border-green-500/30';
});

// Format price
const formattedPrice = computed(() => {
    return props.item.price === 0 ? 'Free' : `${props.item.price} credits`;
});

// Render stars for rating
function renderStars(rating: number): string {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    return '★'.repeat(fullStars) + (hasHalfStar ? '½' : '') + '☆'.repeat(emptyStars);
}

function handleClick() {
    emit('click', props.item);
}
</script>

<template>
    <div
        @click="handleClick"
        :class="[
            'group cursor-pointer transition-all duration-200 hover:scale-[1.02]',
            viewMode === 'grid'
                ? 'bg-gray-800 border border-gray-700 rounded-xl p-5 hover:border-blue-500 hover:shadow-lg hover:shadow-blue-500/20'
                : 'bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-blue-500 flex items-center gap-4',
        ]"
    >
        <!-- Grid View -->
        <template v-if="viewMode === 'grid'">
            <!-- Header -->
            <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-2">
                    <span class="text-2xl">{{ itemTypeIcon }}</span>
                    <span
                        :class="[
                            'text-xs font-medium px-2 py-0.5 rounded-full border',
                            itemTypeBadgeColor,
                        ]"
                    >
                        {{ item.itemType }}
                    </span>
                </div>
                <div v-if="isPurchased" class="flex items-center gap-1 text-green-400 text-xs">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path
                            fill-rule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clip-rule="evenodd"
                        />
                    </svg>
                    <span>Owned</span>
                </div>
            </div>

            <!-- Title and Description -->
            <div class="mb-4">
                <h3
                    class="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors mb-1 line-clamp-1"
                >
                    {{ item.name }}
                </h3>
                <p class="text-sm text-gray-400 line-clamp-2">{{ item.description }}</p>
            </div>

            <!-- Tags -->
            <div v-if="item.tags && item.tags.length > 0" class="flex flex-wrap gap-1.5 mb-4">
                <span
                    v-for="tag in item.tags.slice(0, 3)"
                    :key="tag"
                    class="text-xs px-2 py-0.5 bg-gray-700/50 text-gray-300 rounded"
                >
                    {{ tag }}
                </span>
            </div>

            <!-- Footer -->
            <div class="flex items-center justify-between pt-3 border-t border-gray-700/50">
                <!-- Rating -->
                <div class="flex items-center gap-2">
                    <span class="text-yellow-400 text-sm">{{
                        renderStars(item.averageRating)
                    }}</span>
                    <span class="text-xs text-gray-500">({{ item.reviewCount }})</span>
                </div>

                <!-- Price -->
                <div class="flex items-center gap-2">
                    <span
                        :class="[
                            'text-sm font-bold',
                            item.price === 0 ? 'text-green-400' : 'text-yellow-400',
                        ]"
                    >
                        {{ formattedPrice }}
                    </span>
                </div>
            </div>

            <!-- Compatibility Warning -->
            <div
                v-if="!isCompatible"
                class="mt-3 flex items-center gap-1.5 text-xs text-orange-400 bg-orange-500/10 border border-orange-500/30 rounded px-2 py-1"
            >
                <svg class="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path
                        fill-rule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clip-rule="evenodd"
                    />
                </svg>
                <span>Requires v{{ item.minClientVersion }}+</span>
            </div>
        </template>

        <!-- List View -->
        <template v-else>
            <div class="flex items-center gap-2 flex-shrink-0">
                <span class="text-3xl">{{ itemTypeIcon }}</span>
            </div>

            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                    <h3
                        class="text-base font-semibold text-white group-hover:text-blue-400 transition-colors truncate"
                    >
                        {{ item.name }}
                    </h3>
                    <span
                        :class="[
                            'text-xs font-medium px-2 py-0.5 rounded-full border flex-shrink-0',
                            itemTypeBadgeColor,
                        ]"
                    >
                        {{ item.itemType }}
                    </span>
                    <div v-if="isPurchased" class="flex items-center gap-1 text-green-400 text-xs">
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                                fill-rule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clip-rule="evenodd"
                            />
                        </svg>
                        <span>Owned</span>
                    </div>
                    <div
                        v-if="!isCompatible"
                        class="flex items-center gap-1 text-xs text-orange-400 ml-auto"
                    >
                        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path
                                fill-rule="evenodd"
                                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                                clip-rule="evenodd"
                            />
                        </svg>
                        <span>v{{ item.minClientVersion }}+</span>
                    </div>
                </div>
                <p class="text-sm text-gray-400 line-clamp-1">{{ item.description }}</p>
            </div>

            <div class="flex items-center gap-4 flex-shrink-0">
                <!-- Rating -->
                <div class="flex items-center gap-2">
                    <span class="text-yellow-400 text-sm">{{
                        renderStars(item.averageRating)
                    }}</span>
                    <span class="text-xs text-gray-500">({{ item.reviewCount }})</span>
                </div>

                <!-- Price -->
                <div
                    :class="[
                        'text-sm font-bold px-3 py-1 rounded-lg',
                        item.price === 0
                            ? 'text-green-400 bg-green-500/10'
                            : 'text-yellow-400 bg-yellow-500/10',
                    ]"
                >
                    {{ formattedPrice }}
                </div>

                <!-- Arrow -->
                <svg
                    class="w-5 h-5 text-gray-500 group-hover:text-blue-400 transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5l7 7-7 7"
                    />
                </svg>
            </div>
        </template>
    </div>
</template>
