import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useProjectStore } from './projectStore';
import { useUserStore } from './userStore';
import { useSettingsStore } from './settingsStore';
import { marketplaceAPI } from '../api/marketplace';
import type {
    LibraryItem,
    MarketplaceItem,
    MarketplaceCategory,
} from '../../core/types/marketplace';

export const useMarketplaceStore = defineStore('marketplace', () => {
    // State
    const items = ref<MarketplaceItem[]>([]);
    const currentItem = ref<MarketplaceItem | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);

    // Filters
    const searchQuery = ref('');
    const selectedCategory = ref<MarketplaceCategory | null>(null);
    const selectedType = ref<'project' | 'operator' | 'script-template' | 'other' | null>(null);

    // Actions
    const libraryItems = ref<{
        purchased: LibraryItem[];
        published: LibraryItem[];
    }>({ purchased: [], published: [] });

    async function fetchItems() {
        loading.value = true;
        error.value = null;
        try {
            const response = await marketplaceAPI.getItems({
                search: searchQuery.value,
                category: selectedCategory.value as any,
                itemType: selectedType.value as any,
            });
            items.value = response.items;
        } catch (e: any) {
            error.value = e.message;
        } finally {
            loading.value = false;
        }
    }

    async function fetchItemDetails(id: string) {
        loading.value = true;
        error.value = null;
        try {
            const details = await marketplaceAPI.getItemDetails(id);
            currentItem.value = details;
        } catch (e: any) {
            error.value = e.message;
        } finally {
            loading.value = false;
        }
    }

    async function fetchLibrary() {
        loading.value = true;
        try {
            const response = await marketplaceAPI.getLibrary();
            // Split items into purchased and published based on associationType
            const all = response?.items || [];
            libraryItems.value = {
                purchased: all.filter((i: LibraryItem) => i.associationType === 'purchased'),
                published: all.filter((i: LibraryItem) => i.associationType === 'published'),
            };
        } catch (e: any) {
            console.error('Failed to fetch library', e);
        } finally {
            loading.value = false;
        }
    }

    async function purchaseItem(itemId: string) {
        loading.value = true;
        error.value = null;
        try {
            const response = await marketplaceAPI.purchaseItem(itemId);
            // After purchase, refresh item details to update ownership status
            await fetchItemDetails(itemId);
            // Also refresh library
            await fetchLibrary();
            return response;
        } catch (e: any) {
            error.value = e.message;
            throw e;
        } finally {
            loading.value = false;
        }
    }

    async function deleteItem(itemId: string) {
        loading.value = true;
        error.value = null;
        try {
            await marketplaceAPI.deleteItem(itemId);
            // Refresh library to remove the deleted item
            await fetchLibrary();
        } finally {
            loading.value = false;
        }
    }

    async function importItem(itemId: string) {
        loading.value = true;
        error.value = null;
        try {
            const content = await marketplaceAPI.importItem(itemId);

            // Handle specific item types
            if (content.type === 'project' && content.projectDefinition) {
                const projectStore = useProjectStore();
                // Ensure definition is an object if stringified
                const definition =
                    typeof content.projectDefinition === 'string'
                        ? JSON.parse(content.projectDefinition)
                        : content.projectDefinition;

                // Import project definition with user data
                const userStore = useUserStore();
                const user = userStore.user;

                const userData = user
                    ? {
                          email: user.email,
                          name: user.displayName,
                          googleId: user.id, // CloudUser id is the Google ID or generic ID
                          photoUrl: user.photoUrl,
                      }
                    : undefined;

                const importedProject = await projectStore.importProject(definition, userData);

                if (!importedProject) {
                    throw new Error('Failed to import project. Please check the logs.');
                }

                // Force refresh projects list to ensure correct ordering and visibility
                await projectStore.fetchProjects();
            } else if (content.type === 'operator' && content.operatorDefinition) {
                // Use Electron API directly for operators
                const definition =
                    typeof content.operatorDefinition === 'string'
                        ? JSON.parse(content.operatorDefinition)
                        : content.operatorDefinition;

                await window.electron.operators.create(definition);
            } else if (content.type === 'script-template') {
                // TODO: Implement script template import
                console.warn('Script template import not yet implemented');
            }

            // Refresh library
            await fetchLibrary();
            return content;
        } catch (e: any) {
            error.value = e.message;
            throw e;
        } finally {
            loading.value = false;
        }
    }

    function isPurchased(itemId: string): boolean {
        return libraryItems.value.purchased.some((i) => i.id === itemId);
    }

    function getMissingRequirements(item: MarketplaceItem) {
        const issues: { type: 'version' | 'provider'; detail: string }[] = [];

        // 1. Version Check (Placeholder logic - implement actual version comparison if needed)
        // For now, we assume simple string comparison or we can add semver later.
        // if (item.minClientVersion > currentVersion) ...

        // 2. AI Provider Check
        if (item.requirements && item.requirements.length > 0) {
            const settingsStore = useSettingsStore();

            item.requirements.forEach((req) => {
                const providerConfig = settingsStore.aiProviders.find((p) => p.id === req.provider);

                // Check if provider exists and is enabled
                if (!providerConfig || !providerConfig.enabled) {
                    issues.push({
                        type: 'provider',
                        detail: `Requires ${req.provider} (Not Enabled)`,
                    });
                }
            });
        }

        return issues;
    }

    function checkCompatibility(item: MarketplaceItem): boolean {
        const issues = getMissingRequirements(item);
        return issues.length === 0;
    }

    return {
        // State
        items,
        currentItem,
        libraryItems,
        loading,
        error,

        // Filters
        searchQuery,
        selectedCategory,
        selectedType,

        // Actions
        fetchItems,
        fetchItemDetails,
        fetchLibrary,
        purchaseItem,
        importItem,
        deleteItem,
        checkCompatibility,
        getMissingRequirements,
        isPurchased,
    };
});
