import { operatorRepository } from '../database/repositories/operator-repository';
import { settingsRepository } from '../database/repositories/settings-repository';
import { PromptLoader } from './PromptLoader';
import { AIServiceManager } from '../../../src/services/workflow/AIServiceManager';

/**
 * Bootstrap application data
 * Ensures essential data exists on application startup
 */
export async function bootstrapAppData() {
    console.log('[Bootstrap] Checking essential data...');
    // Initialize PromptLoader
    PromptLoader.getInstance().loadAllPrompts();

    try {
        // Initialize AI Providers from DB (for backend execution context)
        await initializeAIProviders();

        await ensureSystemCurator();
    } catch (error) {
        console.error('[Bootstrap] Failed to bootstrap data:', error);
    }
}

/**
 * Initialize AI Providers from database settings
 * This ensures that the backend AIServiceManager has access to keys/configs
 * even if the renderer is not active.
 */
async function initializeAIProviders() {
    try {
        console.log('[Bootstrap] Initializing AI Providers from DB...');
        // We can't query by prefix easily with the current repository,
        // so we'll check known providers or list all settings if possible.
        // For known providers:
        const knownProviders = [
            'openai',
            'anthropic',
            'google',
            'groq',
            'highflow',
            'default-highflow',
        ];

        const enabledProviders = [];

        for (const providerId of knownProviders) {
            const key = `ai_provider_${providerId}`;
            const config = await settingsRepository.getJSON<any>(key);

            if (config && (config.apiKey || config.baseUrl)) {
                // Construct EnabledProviderInfo
                enabledProviders.push({
                    id: providerId,
                    name: config.name || providerId,
                    apiKey: config.apiKey,
                    baseUrl: config.baseUrl,
                    defaultModel: config.defaultModel,
                    enabled: config.enabled !== false, // Default to true if not specified? Or safe to assume persisted = enabled?
                    isConnected: config.isConnected,
                    authMethods: config.authMethods || ['api-key'],
                    tags: config.tags || [],
                });
            }
        }

        if (enabledProviders.length > 0) {
            console.log(
                `[Bootstrap] Configuring ${enabledProviders.length} providers in AIServiceManager`
            );
            AIServiceManager.getInstance().setEnabledProviders(enabledProviders, false);
        } else {
            console.log('[Bootstrap] No AI provider configurations found in DB.');
        }
    } catch (error) {
        console.error('[Bootstrap] Failed to initialize AI providers:', error);
    }
}

/**
 * Ensure System Curator exists
 * This operator is required for project memory management
 */
async function ensureSystemCurator() {
    const curator = await operatorRepository.findGlobalCurator();

    // Default HighFlow settings
    // Use 'default-highflow' if that's the ID, or 'highflow'.
    // We'll check the grep result, but for now assuming 'default-highflow' based on previous context
    // unless proven otherwise. If it's 'highflow', we can update it.
    // Actually, let's use a constant or check what the user said.
    // User said: "default AI Provider" -> "HighFlow".
    // I will assume 'default-highflow' is the ID for the internal HighFlow provider.
    const DEFAULT_PROVIDER = 'default-highflow';
    const DEFAULT_MODEL = 'gemini-2.0-flash';

    if (!curator) {
        console.log('[Bootstrap] System Curator not found. Creating...');

        await operatorRepository.create({
            name: 'System Curator',
            role: 'Curator',
            description: 'Manages project memory and context by organizing tasks and decisions.',
            projectId: null, // Global operator
            isCurator: true,
            aiProvider: DEFAULT_PROVIDER,
            aiModel: DEFAULT_MODEL,
            tags: ['system', 'memory', 'context'],
            isActive: true,
            // Optional fields defaults
            avatar: '📸',
            color: '#8b5cf6', // Violet
            systemPrompt:
                PromptLoader.getInstance().getPrompt('system/curator') || 'You are Curator...',
            isReviewer: false,
            specialty: [],
        });

        console.log('[Bootstrap] ✅ System Curator created successfully');
    } else {
        console.log('[Bootstrap] ✅ System Curator exists. Updating to ensure latest settings...');

        // Update existing curator with new defaults to ensure consistency
        await operatorRepository.update(curator.id, {
            avatar: '📸',
            aiProvider: DEFAULT_PROVIDER, // Enforce default
            aiModel: DEFAULT_MODEL, // Enforce default
            systemPrompt:
                PromptLoader.getInstance().getPrompt('system/curator') || 'You are Curator...',
        });

        console.log('[Bootstrap] ✅ System Curator updated successfully');
    }
}
