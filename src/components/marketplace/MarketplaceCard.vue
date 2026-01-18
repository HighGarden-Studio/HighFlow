<script setup lang="ts">
import { computed } from 'vue';
import type { MarketplaceItem } from '../../core/types/marketplace';
import { useSettingsStore } from '../../renderer/stores/settingsStore';

const props = defineProps<{
    item: MarketplaceItem;
    showDelete?: boolean;
}>();

const emit = defineEmits<{
    (e: 'click', item: MarketplaceItem): void;
    (e: 'action', id: string): void; // For the button action
    (e: 'delete', id: string): void; // For delete action
}>();

const settingsStore = useSettingsStore();

const missingRequirements = computed(() => {
    if (!props.item.requirements?.length) return [];
    return props.item.requirements.filter((req) => !settingsStore.checkRequirement(req));
});

const typeColors: Record<string, string> = {
    project: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    operator: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    'script-template': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

const typeLabels: Record<string, string> = {
    project: 'PROJECT',
    operator: 'OPERATOR',
    'script-template': 'SCRIPT',
};

const displayIcon = computed(() => props.item.iconUrl || '📦');

// Safe type lookup
const normalizedType = computed(() => {
    const type = props.item.itemType || (props.item as any).type;
    return type?.toLowerCase() || 'project';
});

const typeColor = computed(() => {
    return typeColors[normalizedType.value] || typeColors['project'];
});

const typeLabel = computed(() => {
    return typeLabels[normalizedType.value] || 'UNKNOWN';
});

const actionLabel = computed(() => {
    // Check if item has isOwned (it might be extended type in runtime)
    if ((props.item as any).isOwned) return 'Import';
    if (props.item.price === 0) return 'Get';
    return 'Purchase';
});

const isOwnedOrFree = computed(() => (props.item as any).isOwned || props.item.price === 0);

async function handleAction(e: Event) {
    e.stopPropagation(); // Prevent card click

    // If owned, we import directly from card?
    // Or we just let the parent handle it via 'action' event?
    // The current design emits 'action'. The parent view (MarketplaceHome) needs to handle this.
    // However, looking at the code, it seems simpler to call store directly here OR ensure parent handles it.
    // BUT checking the requested objective: "Wire up 'Import' button in UI".
    // Let's look at how purchase is handled. It seems purchase is handled by parent usually or details view.
    // Wait, the emit('action') is generic.
    // Let's update `MarketplaceHome` or wherever this is used to handle 'import'.
    // actually, let's just make the card smart enough or check where it is used.
    // Since I can't easily see all usages, I will check MarketplaceHome or similar.
    // BUT, for now, I will modify this to emit 'import' if it's an import action, or generic 'action'

    // Better approach:
    // If actionLabel is 'Import', emit 'import'.
    // If 'Get' or 'Purchase', emit 'purchase' or keep 'action'.

    // Let's check `MarketplaceItemDetailView` handles purchase directly.
    // `MarketplaceHome` probably listens to `action`.

    // Let's stick to emitting 'action' but updating the parent to handle it?
    // No, I should probably handle it here if I want to be consistent, OR update the parent.
    // Let's checks MarketplaceHome first to be safe.
    emit('action', props.item.id);
}
</script>

<template>
    <div
        class="group relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden flex flex-col h-full pt-12"
        @click="emit('click', item)"
    >
        <!-- Top Left: Type Badge -->
        <div class="absolute top-4 left-4 z-10">
            <span
                :class="[
                    'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm',
                    typeColor,
                ]"
            >
                {{ typeLabel }}
            </span>
        </div>

        <!-- Top Right: Status & Requirements -->
        <div class="absolute top-4 right-4 z-10 flex flex-col gap-1 items-end pointer-events-none">
            <!-- Status Badge -->
            <span
                v-if="item.status"
                :class="[
                    'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm',
                    item.status === 'approved'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        : item.status === 'rejected'
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                          : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
                ]"
            >
                {{ item.status }}
            </span>
            <!-- Requirement Badge -->
            <div v-if="missingRequirements.length > 0">
                <div
                    class="px-2 py-1 bg-red-500/90 text-white text-[10px] font-bold rounded shadow-sm backdrop-blur-sm"
                >
                    연동 필요
                </div>
            </div>
        </div>

        <!-- Card Body -->
        <div class="px-5 pb-5 flex flex-col flex-1 relative">
            <!-- Icon -->
            <div class="flex items-start gap-3 mb-3">
                <div
                    class="w-12 h-12 flex-shrink-0 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-2xl shadow-sm border border-gray-200 dark:border-gray-600 group-hover:scale-105 transition-transform"
                >
                    {{ displayIcon }}
                </div>
                <div class="min-w-0 pt-1">
                    <h3
                        class="font-bold text-gray-900 dark:text-gray-100 line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
                    >
                        {{ item.name }}
                    </h3>
                    <div
                        class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                    >
                        <span class="font-medium truncate">{{
                            item.author?.name || item.authorName || 'Unknown Author'
                        }}</span>
                    </div>
                </div>
            </div>

            <!-- Description -->
            <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-3 flex-1">
                {{ item.description }}
            </p>

            <!-- Tags -->
            <div v-if="item.tags && item.tags.length > 0" class="flex flex-wrap gap-1 mb-3">
                <span
                    v-for="tag in item.tags.slice(0, 3)"
                    :key="tag"
                    class="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded border border-gray-200 dark:border-gray-600"
                >
                    #{{ tag }}
                </span>
                <span v-if="item.tags.length > 3" class="text-[10px] text-gray-400"
                    >+{{ item.tags.length - 3 }}</span
                >
            </div>

            <!-- Requirements List -->
            <div
                v-if="item.requirements && item.requirements.length > 0"
                class="flex flex-wrap gap-2 mb-3 text-[10px] text-gray-500"
            >
                <span class="flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                    </svg>
                    Requires:
                </span>
                <span
                    v-for="(req, idx) in item.requirements.slice(0, 2)"
                    :key="idx"
                    class="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded"
                >
                    {{ req.model }}
                </span>
            </div>

            <div class="w-full h-px bg-gray-100 dark:bg-gray-700 mb-3"></div>

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
                        (item.averageRating || 0).toFixed(1)
                    }}</span>
                    <span class="text-gray-400">({{ item.reviewCount || 0 }})</span>
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
                    <span>{{ item.downloadCount || 0 }}</span>
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
                        {{ Number(item.price) === 0 ? 'Free' : Number(item.price) }}
                        <span
                            v-if="Number(item.price) > 0"
                            class="text-xs font-normal text-gray-500"
                            >Credits</span
                        >
                    </div>
                </div>

                <div class="flex items-center gap-2">
                    <button
                        v-if="showDelete"
                        class="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        title="Delete Item"
                        @click.stop="emit('delete', item.id)"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                        </svg>
                    </button>
                    <button
                        :class="[
                            'px-4 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm',
                            isOwnedOrFree
                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                : 'bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600',
                        ]"
                        @click="handleAction"
                    >
                        {{ actionLabel }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
