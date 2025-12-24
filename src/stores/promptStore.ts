import { defineStore } from 'pinia';
import { ref } from 'vue';

export const usePromptStore = defineStore('prompts', () => {
    const prompts = ref<Record<string, string>>({});
    const isLoaded = ref(false);

    /**
     * Initialize the store by fetching all prompts from the main process
     */
    async function init() {
        if (isLoaded.value) return;

        try {
            console.log('[PromptStore] Fetching prompts...');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const loadedPrompts = await window.electron.system.getPrompts();
            prompts.value = loadedPrompts;
            isLoaded.value = true;
            console.log(`[PromptStore] Loaded ${Object.keys(loadedPrompts).length} prompts`);
        } catch (error) {
            console.error('[PromptStore] Failed to load prompts:', error);
        }
    }

    /**
     * Get a specific prompt by ID
     * @param id The prompt ID (e.g., 'roles/senior-developer')
     * @returns The prompt content or empty string if not found
     */
    function getPrompt(id: string): string {
        return prompts.value[id] || '';
    }

    return {
        prompts,
        isLoaded,
        init,
        getPrompt,
    };
});
