/**
 * Version Compatibility Utilities
 */

/**
 * Check if current version is compatible with minimum required version
 * Based on semantic versioning (major.minor.patch)
 *
 * @param currentVersion - Current client version (e.g., "1.2.3")
 * @param minVersion - Minimum required version (e.g., "1.0.0")
 * @returns true if current version meets minimum requirement
 */
export function isCompatible(currentVersion: string, minVersion: string): boolean {
    if (!minVersion) return true; // No version requirement

    try {
        const [maj1, min1, patch1] = currentVersion.split('.').map(Number);
        const [maj2, min2, patch2] = minVersion.split('.').map(Number);

        // Check for undefined values
        if (maj1 === undefined || maj2 === undefined) return false;

        // Major version must match (breaking changes)
        if (maj1 !== maj2) return maj1 > maj2;

        // Minor version comparison (backwards compatible)
        if (min1 !== undefined && min2 !== undefined && min1 !== min2) return min1 > min2;

        // Patch version comparison
        return (patch1 || 0) >= (patch2 || 0);
    } catch (error) {
        console.error('Invalid version format:', error);
        return false;
    }
}

/**
 * Get compatibility status with descriptive message
 */
export function getCompatibilityStatus(
    currentVersion: string,
    minVersion: string
): {
    compatible: boolean;
    message: string;
} {
    if (!minVersion) {
        return {
            compatible: true,
            message: 'Compatible with all versions',
        };
    }

    const compatible = isCompatible(currentVersion, minVersion);

    if (compatible) {
        return {
            compatible: true,
            message: `Compatible (requires ${minVersion}+)`,
        };
    } else {
        return {
            compatible: false,
            message: `Requires version ${minVersion} or higher. You have ${currentVersion}`,
        };
    }
}

/**
 * Compare two version strings
 * @returns -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const num1 = parts1[i] || 0;
        const num2 = parts2[i] || 0;

        if (num1 < num2) return -1;
        if (num1 > num2) return 1;
    }

    return 0;
}
