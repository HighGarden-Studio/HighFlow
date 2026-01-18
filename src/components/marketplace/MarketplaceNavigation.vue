<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useMarketplaceStore } from '../../renderer/stores/marketplaceStore';

const props = defineProps<{
    activeTab: 'all' | 'purchased' | 'uploads';
}>();

const emit = defineEmits<{
    (e: 'navigate', tab: 'all' | 'purchased' | 'uploads'): void;
}>();

const router = useRouter();
const store = useMarketplaceStore();

const purchasedCount = computed(() => store.libraryItems?.purchased?.length || 0);
const uploadsCount = computed(() => store.libraryItems?.published?.length || 0);

function handleTabClick(tab: 'all' | 'purchased' | 'uploads') {
    emit('navigate', tab);

    if (tab === 'all') {
        router.push('/marketplace');
    } else {
        // Navigate to library with query param
        router.push({ path: '/marketplace/library', query: { tab } });
    }
}
</script>

<template>
    <div class="flex border-b border-gray-200 dark:border-gray-700 mb-8 font-sans">
        <button
            class="px-6 py-3 text-sm font-medium border-b-2 transition-colors duration-200"
            :class="
                activeTab === 'all'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            "
            @click="handleTabClick('all')"
        >
            All Items
        </button>
        <button
            class="px-6 py-3 text-sm font-medium border-b-2 transition-colors duration-200"
            :class="
                activeTab === 'purchased'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            "
            @click="handleTabClick('purchased')"
        >
            Purchased ({{ purchasedCount }})
        </button>
        <button
            class="px-6 py-3 text-sm font-medium border-b-2 transition-colors duration-200"
            :class="
                activeTab === 'uploads'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            "
            @click="handleTabClick('uploads')"
        >
            My Uploads ({{ uploadsCount }})
        </button>
    </div>
</template>
