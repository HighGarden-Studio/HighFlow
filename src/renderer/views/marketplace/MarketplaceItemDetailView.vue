<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useMarketplaceStore } from '../../stores/marketplaceStore';
import WorkflowGraphPreview from '../../../components/marketplace/WorkflowGraphPreview.vue';
import MarkdownRenderer from '../../../components/common/MarkdownRenderer.vue'; // Assuming this exists

const store = useMarketplaceStore();
const router = useRouter();
const props = defineProps<{ id: string }>();

function goBack() {
    router.push({ name: 'marketplace-home' });
}

const activeTab = ref('overview');
const tabs = [
    { id: 'overview', name: 'Overview' },
    { id: 'preview', name: 'Preview' },
    { id: 'reviews', name: 'Reviews' },
    { id: 'versions', name: 'Versions' },
];

onMounted(async () => {
    await store.fetchItemDetails(props.id);
});

// Watch for route changes to refetch if staying on the same component
watch(
    () => props.id,
    async (newId) => {
        await store.fetchItemDetails(newId);
    }
);

const item = computed(() => store.currentItem);

const formattedDate = computed(() => {
    if (!item.value) return '';
    return new Date(item.value.lastUpdated).toLocaleDateString();
});

// Mock graph nodes for demo if previewGraph is empty
const demoNodes = [
    { id: '1', type: 'input', label: 'Start', position: { x: 250, y: 5 } },
    { id: '2', label: 'Processing', position: { x: 100, y: 100 } },
    { id: '3', label: 'AI Analysis', position: { x: 400, y: 100 } },
    { id: '4', type: 'output', label: 'Result', position: { x: 250, y: 200 } },
];

const demoEdges = [
    { id: 'e1-2', source: '1', target: '2' },
    { id: 'e1-3', source: '1', target: '3' },
    { id: 'e2-4', source: '2', target: '4' },
    { id: 'e3-4', source: '3', target: '4' },
];

const previewGraphData = computed(() => {
    if (item.value?.previewGraph && item.value.previewGraph.nodes.length > 0) {
        return item.value.previewGraph;
    }
    return { nodes: demoNodes, edges: demoEdges };
});
</script>

<template>
    <div v-if="store.loading" class="flex justify-center py-20">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
    </div>

    <div v-else-if="!item" class="p-8 text-center text-gray-500">Item not found.</div>

    <div v-else class="flex flex-col lg:flex-row min-h-full">
        <!-- Main Content -->
        <div class="flex-1 p-8 overflow-y-auto">
            <!-- Back Button -->
            <button
                @click="goBack"
                class="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-300 mb-6 transition-colors"
                title="Back to Marketplace"
            >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10 19l-7-7m0 0l7-7m-7 7h18"
                    />
                </svg>
                Back to List
            </button>

            <!-- Header -->
            <div class="flex items-start gap-6 mb-8">
                <div
                    class="w-24 h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-5xl shadow-sm border border-gray-200 dark:border-gray-700"
                >
                    {{ item.iconUrl || '📦' }}
                </div>

                <div class="flex-1">
                    <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                        {{ item.name }}
                    </h1>
                    <div class="flex items-center gap-2 text-gray-600 dark:text-gray-400 mb-4">
                        <span class="font-medium text-gray-900 dark:text-gray-200">{{
                            item.author.name
                        }}</span>
                        <svg
                            v-if="item.author.isVerified"
                            class="w-5 h-5 text-blue-500"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clip-rule="evenodd"
                            />
                        </svg>
                        <span class="mx-2">•</span>
                        <span class="flex items-center gap-1 text-amber-500 font-medium">
                            <svg class="w-4 h-4 fill-current" viewBox="0 0 20 20">
                                <path
                                    d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                                />
                            </svg>
                            {{ item.stats.rating.toFixed(1) }}
                        </span>
                        <span class="text-xs">({{ item.stats.reviewCount }} reviews)</span>
                        <span class="mx-2">•</span>
                        <span class="text-gray-500">{{ item.version }}</span>
                    </div>
                </div>

                <div class="flex flex-col items-end gap-3 min-w-[150px]">
                    <div class="text-2xl font-bold text-gray-900 dark:text-white">
                        {{ item.price === 0 ? 'Free' : `${item.price} Credits` }}
                    </div>
                    <button
                        class="w-full px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow transition-colors flex items-center justify-center gap-2"
                    >
                        <span>Get It</span>
                    </button>
                </div>
            </div>

            <!-- Tabs -->
            <div class="border-b border-gray-200 dark:border-gray-700 mb-6">
                <nav class="flex gap-8" aria-label="Tabs">
                    <button
                        v-for="tab in tabs"
                        :key="tab.id"
                        @click="activeTab = tab.id"
                        :class="[
                            'py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                            activeTab === tab.id
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                        ]"
                    >
                        {{ tab.name }}
                    </button>
                </nav>
            </div>

            <!-- Content Area -->
            <div class="min-h-[400px]">
                <div v-if="activeTab === 'overview'" class="prose dark:prose-invert max-w-none">
                    <MarkdownRenderer :content="item.description" />
                </div>

                <div v-else-if="activeTab === 'preview'" class="h-[500px]">
                    <!-- Workflow Graph for Projects -->
                    <div
                        v-if="item.type === 'project'"
                        class="h-full border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                    >
                        <WorkflowGraphPreview
                            :nodes="previewGraphData.nodes"
                            :edges="previewGraphData.edges"
                        />
                    </div>

                    <!-- Code Snippet for Scripts (Placeholder) -->
                    <div
                        v-else-if="item.type === 'script_template'"
                        class="h-full p-4 bg-gray-900 rounded-lg overflow-auto font-mono text-sm text-gray-300"
                    >
                        // Script Preview Placeholder console.log('Hello World');
                    </div>

                    <div v-else class="h-full flex items-center justify-center text-gray-500">
                        No preview available for this item type.
                    </div>
                </div>

                <div v-else-if="activeTab === 'reviews'" class="space-y-6">
                    <!-- Review Placeholder -->
                    <div
                        class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-6 text-center text-gray-500"
                    >
                        Reviews coming soon...
                    </div>
                </div>

                <div v-else-if="activeTab === 'versions'" class="space-y-6">
                    <!-- Versions Placeholder -->
                    <div
                        class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-6 text-center text-gray-500"
                    >
                        Version history coming soon...
                    </div>
                </div>
            </div>
        </div>

        <!-- Sidebar Metadata -->
        <div
            class="w-full lg:w-80 border-l border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 p-6 space-y-8"
        >
            <div>
                <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Information
                </h3>
                <dl class="space-y-3 text-sm">
                    <div class="flex justify-between">
                        <dt class="text-gray-500">Last Updated</dt>
                        <dd class="text-gray-900 dark:text-gray-300 font-medium">
                            {{ formattedDate }}
                        </dd>
                    </div>
                    <div class="flex justify-between">
                        <dt class="text-gray-500">Installs</dt>
                        <dd class="text-gray-900 dark:text-gray-300 font-medium">
                            {{ item.stats.installCount.toLocaleString() }}
                        </dd>
                    </div>
                    <div class="flex justify-between">
                        <dt class="text-gray-500">License</dt>
                        <dd class="text-gray-900 dark:text-gray-300 font-medium">MIT</dd>
                    </div>
                </dl>
            </div>

            <div>
                <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Categories
                </h3>
                <div class="flex flex-wrap gap-2">
                    <span
                        v-for="cat in item.categories"
                        :key="cat"
                        class="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                        {{ cat }}
                    </span>
                </div>
            </div>

            <div>
                <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Tags</h3>
                <div class="flex flex-wrap gap-2">
                    <span
                        v-for="tag in item.tags"
                        :key="tag"
                        class="px-2 py-1 rounded text-xs text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                    >
                        #{{ tag }}
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>
