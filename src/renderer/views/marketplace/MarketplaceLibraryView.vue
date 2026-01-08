<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useMarketplaceStore } from '../../stores/marketplaceStore';
import { useUserStore } from '../../stores/userStore'; // Import userStore
import type { LibraryItem } from '../../../core/types/marketplace';
import MarketplaceCard from '../../../components/marketplace/MarketplaceCard.vue';
import RegistrationWizard from '../../components/marketplace/RegistrationWizard.vue';
import MarketplaceNavigation from '../../../components/marketplace/MarketplaceNavigation.vue'; // Import
import { useToast } from 'vue-toastification';

const store = useMarketplaceStore();
const userStore = useUserStore(); // Initialize userStore
const router = useRouter();
const route = useRoute(); // Add useRoute
const toast = useToast();

const isLoggedIn = computed(() => userStore.isAuthenticated); // Use userStore.isAuthenticated

onMounted(() => {
    if (isLoggedIn.value) {
        store.fetchLibrary();
    }
});

// Tabs
type Tab = 'purchased' | 'uploads';
const currentTab = ref<Tab>('purchased');

// Initialize tab from route
onMounted(() => {
    if (route.query.tab === 'uploads') {
        currentTab.value = 'uploads';
    } else if (route.query.tab === 'purchased') {
        currentTab.value = 'purchased';
    }
});

// Watch for route updates
watch(
    () => route.query.tab,
    (newTab) => {
        if (newTab === 'uploads') {
            currentTab.value = 'uploads';
        } else if (newTab === 'purchased') {
            currentTab.value = 'purchased';
        }
    }
);

// State
// Wizard State
const showWizard = ref(false);
const wizardProps = ref<{
    initialType?: any;
    initialLocalId?: string;
    initialSubmissionId?: string;
}>({});

// Computed
const purchasedItems = computed(() => store.libraryItems.purchased);

const myUploads = computed(() => store.libraryItems.published);

// Computed maps
const currentItems = computed(() => {
    const rawItems = currentTab.value === 'purchased' ? purchasedItems.value : myUploads.value;

    // Map LibraryItem to MarketplaceItem format for the card
    return rawItems.map((item: LibraryItem) => ({
        id: item.id || '', // Use empty string if id is null
        name: item.name,
        description: item.summary || item.description || '', // Map summary to description
        itemType: item.type, // Map type -> itemType
        type: item.type, // Backwards compat just in case
        price: 0, // Owned items don't show price
        currency: 'credit',
        authorId: item.author.id,
        authorName: item.author.name,
        author: item.author,
        averageRating: item.stats?.rating || 0,
        reviewCount: 0,
        downloadCount: 0,
        iconUrl: item.iconUrl || undefined,
        isOwned: true, // Always true for library items
        previewImages: [],
        tags: [],
        category: 'other' as any, // Placeholder as LibraryItem doesn't have it
        clientVersion: item.version,
        minClientVersion: '0.0.0', // Placeholder
        createdAt: item.publishedAt || item.purchasedAt || new Date().toISOString(),
        updatedAt: item.publishedAt || item.purchasedAt || new Date().toISOString(),
        submissionId: item.submissionId || (item.status === 'pending' ? item.id : undefined), // Capture submission ID
        status: item.status,
        localId: item.localId,
    }));
});

function handleCardClick(item: any) {
    // Check if it's a pending/rejected item that we want to edit
    if (
        currentTab.value === 'uploads' &&
        (item.status === 'pending' || item.status === 'rejected' || !item.id)
    ) {
        if (item.localId) {
            // Open Wizard in Edit Mode
            wizardProps.value = {
                initialType: item.itemType,
                initialLocalId: item.localId,
                initialSubmissionId:
                    item.submissionId ||
                    (item.id && item.status === 'pending' ? item.id : undefined),
            };
            showWizard.value = true;
            return;
        }
    }

    if (!item.id) {
        toast.info('This item is currently pending or does not have a public page yet.');
        return;
    }

    // For both tabs, if it has an ID, we can view it
    router.push({ name: 'marketplace-item-detail', params: { id: item.id } });
}

async function handleDelete(itemId: string) {
    if (!confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
        return;
    }

    try {
        await store.deleteItem(itemId);
        toast.success('Item deleted successfully');
    } catch (e: any) {
        toast.error(e.message || 'Failed to delete item');
    }
}

function handleWizardClose() {
    showWizard.value = false;
    wizardProps.value = {}; // Reset props
}
</script>

<template>
    <div class="p-8 h-full flex flex-col">
        <!-- Navigation Tabs -->
        <MarketplaceNavigation
            :active-tab="currentTab"
            @navigate="
                (tab) => {
                    if (tab !== 'all') currentTab = tab;
                }
            "
        />

        <!-- Header -->
        <div class="flex justify-between items-start mb-8">
            <div>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">My Library</h1>
                <p class="text-gray-500 dark:text-gray-400 text-sm mt-1">
                    Manage your purchased items and marketplace submissions.
                </p>
            </div>
            <button
                v-if="isLoggedIn"
                @click="
                    wizardProps = {};
                    showWizard = true;
                "
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 4v16m8-8H4"
                    />
                </svg>
                Register New Item
            </button>
        </div>

        <!-- Not Logged In State -->
        <div
            v-if="!isLoggedIn"
            class="flex-1 flex flex-col items-center justify-center text-center p-12 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700"
        >
            <div
                class="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6"
            >
                <svg
                    class="w-10 h-10 text-blue-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                </svg>
            </div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">Login Required</h3>
            <p class="text-gray-500 dark:text-gray-400 max-w-md mb-8">
                You need to be logged in to access your library, view purchased items, and manage
                your submissions.
            </p>
            <div
                class="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm"
            >
                Please login via the User Menu in the sidebar.
            </div>
        </div>

        <!-- Logged In Content -->
        <div v-else class="flex-1 flex flex-col min-h-0">
            <!-- Content -->
            <div class="flex-1 overflow-y-auto">
                <div v-if="store.loading" class="flex justify-center py-20">
                    <div
                        class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"
                    ></div>
                </div>

                <div
                    v-else-if="currentItems.length === 0"
                    class="text-center py-20 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700"
                >
                    <div
                        class="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400"
                    >
                        <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                            />
                        </svg>
                    </div>
                    <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
                        {{ currentTab === 'purchased' ? 'No purchased items' : 'No uploads yet' }}
                    </h3>
                    <p class="text-gray-500 mb-6">
                        {{
                            currentTab === 'purchased'
                                ? "You haven't purchased or installed any items yet."
                                : "You haven't submitted any items to the marketplace."
                        }}
                    </p>
                    <button
                        v-if="currentTab === 'purchased'"
                        @click="router.push('/marketplace')"
                        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors inline-block"
                    >
                        Browse Marketplace
                    </button>
                    <button
                        v-else
                        @click="
                            wizardProps = {};
                            showWizard = true;
                        "
                        class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors inline-block"
                    >
                        Register Your First Item
                    </button>
                </div>

                <div
                    v-else
                    class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                >
                    <MarketplaceCard
                        v-for="item in currentItems"
                        :key="item.id"
                        :item="item"
                        :show-delete="currentTab === 'uploads'"
                        @click="handleCardClick"
                        @delete="handleDelete"
                    />
                </div>
            </div>
        </div>

        <!-- Wizard -->
        <RegistrationWizard
            v-if="showWizard"
            v-bind="wizardProps"
            @close="handleWizardClose"
            @submitted="handleWizardClose"
        />
    </div>
</template>
