<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useMarketplaceStore } from '../renderer/stores/marketplaceStore';

const store = useMarketplaceStore();
const router = useRouter();
const route = useRoute();

const categories = [
    { id: 'all', name: 'All Categories', icon: '🔍' },
    { id: 'AI Modules', name: 'AI Modules', icon: '🤖' },
    { id: 'Integrations', name: 'Integrations', icon: '🔌' },
    { id: 'Utilities', name: 'Utilities', icon: '⚒️' },
    { id: 'Productivity', name: 'Productivity', icon: '🚀' },
];

const types = [
    { id: 'all', name: 'All Types' },
    { id: 'project', name: 'Projects' },
    { id: 'operator', name: 'Operators' },
    { id: 'script_template', name: 'Scripts' },
];

function handleCategorySelect(categoryId: string) {
    store.selectedCategory = categoryId === 'all' ? null : categoryId;
}

function handleTypeSelect(typeId: string) {
    store.selectedType = typeId === 'all' ? null : (typeId as any);
}
</script>

<template>
    <div class="flex h-full bg-gray-50 dark:bg-gray-900">
        <!-- Sidebar Filters -->
        <aside
            class="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-y-auto"
        >
            <div class="p-6">
                <h2
                    class="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2"
                >
                    <span class="text-blue-600">Market</span>place
                </h2>

                <!-- Type Filter -->
                <div class="mb-8">
                    <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                        Item Type
                    </h3>
                    <div class="space-y-1">
                        <button
                            v-for="type in types"
                            :key="type.id"
                            @click="handleTypeSelect(type.id)"
                            :class="[
                                'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
                                store.selectedType === type.id ||
                                (type.id === 'all' && !store.selectedType)
                                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
                            ]"
                        >
                            {{ type.name }}
                        </button>
                    </div>
                </div>

                <!-- Category Filter -->
                <div>
                    <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                        Categories
                    </h3>
                    <div class="space-y-1">
                        <button
                            v-for="cat in categories"
                            :key="cat.id"
                            @click="handleCategorySelect(cat.id)"
                            :class="[
                                'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2',
                                store.selectedCategory === cat.id ||
                                (cat.id === 'all' && !store.selectedCategory)
                                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium'
                                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
                            ]"
                        >
                            <span>{{ cat.icon }}</span>
                            {{ cat.name }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- My Library Link -->
            <div class="p-4 border-t border-gray-200 dark:border-gray-800">
                <router-link
                    to="/marketplace/library"
                    class="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                >
                    <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                        />
                    </svg>
                    My Library
                </router-link>
            </div>
        </aside>

        <!-- Main Content -->
        <main class="flex-1 overflow-y-auto">
            <div class="max-w-7xl mx-auto">
                <router-view></router-view>
            </div>
        </main>
    </div>
</template>
