import { operatorRepository } from '../database/repositories/operator-repository';
import { PromptLoader } from './PromptLoader';

/**
 * Bootstrap application data
 * Ensures essential data exists on application startup
 */
export async function bootstrapAppData() {
    console.log('[Bootstrap] Checking essential data...');
    // Initialize PromptLoader
    PromptLoader.getInstance().loadAllPrompts();
    try {
        await ensureSystemCurator();
    } catch (error) {
        console.error('[Bootstrap] Failed to bootstrap data:', error);
    }
}

/**
 * Ensure System Curator exists
 * This operator is required for project memory management
 */
async function ensureSystemCurator() {
    const curator = await operatorRepository.findGlobalCurator();

    if (!curator) {
        console.log('[Bootstrap] System Curator not found. Creating...');

        await operatorRepository.create({
            name: 'System Curator',
            role: 'Curator',
            description: 'Manages project memory and context by organizing tasks and decisions.',
            projectId: null, // Global operator
            isCurator: true,
            aiProvider: 'openai',
            aiModel: 'gpt-4-turbo',
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
            systemPrompt:
                PromptLoader.getInstance().getPrompt('system/curator') || 'You are Curator...',
        });

        console.log('[Bootstrap] ✅ System Curator updated successfully');
    }
}
