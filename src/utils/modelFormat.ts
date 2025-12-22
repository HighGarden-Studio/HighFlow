/**
 * Model Formatting Utilities
 *
 * Helper functions for displaying model information with characteristics in UI
 */

import type { ModelInfo } from '@core/types/ai';

/**
 * Format model name with characteristics for display in select options
 * Limit: 15 characters for tags to fit in dropdowns
 *
 * @param model - Model information including characteristics
 * @returns Formatted string: "model-name (tag1, tag2)" or just "model-name"
 */
export function formatModelOption(model: ModelInfo): string {
    if (!model.characteristics || model.characteristics.length === 0) {
        return model.name;
    }

    // Limit to 4 tags and join
    const tags = model.characteristics.slice(0, 4).join(', ');

    // Check if combined length exceeds reasonable limit (tags should be ~25 chars)
    if (tags.length > 25) {
        // Truncate to first 3 tags if too long
        const shortenedTags = model.characteristics.slice(0, 3).join(', ');
        return `${model.name} (${shortenedTags})`;
    }

    return `${model.name} (${tags})`;
}

/**
 * Get just the characteristic tags as a string
 */
export function getCharacteristicTags(model: ModelInfo): string {
    if (!model.characteristics || model.characteristics.length === 0) {
        return '';
    }
    return model.characteristics.slice(0, 4).join(', ');
}

/**
 * Get model display name (uses displayName if available, otherwise name)
 */
export function getModelDisplayName(model: ModelInfo): string {
    return model.displayName || model.name;
}
