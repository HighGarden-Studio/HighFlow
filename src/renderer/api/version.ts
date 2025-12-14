/**
 * Version API
 *
 * Handles version check and update information
 */

import { BACKEND_URL } from '../../config';

export interface VersionInfo {
    currentVersion?: string;
    latestVersion: string;
    minimumVersion: string;
    needsUpdate?: boolean;
    forceUpdate: boolean;
    downloadUrl: string;
    releaseNotes: string;
    updatedAt?: string;
    platform?: string;
}

export interface UpdateVersionRequest {
    platform: string;
    latestVersion: string;
    minimumVersion: string;
    downloadUrl: string;
    releaseNotes: string;
    forceUpdate: boolean;
}

export const versionAPI = {
    /**
     * Check for updates (public endpoint, no auth required)
     */
    async checkVersion(currentVersion: string): Promise<VersionInfo> {
        try {
            const response = await fetch(
                `${BACKEND_URL}/v1/version?platform=desktop&currentVersion=${encodeURIComponent(currentVersion)}`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                }
            );

            if (!response.ok) {
                throw new Error(`Version check failed: ${response.status}`);
            }

            const data = await response.json();
            return data as VersionInfo;
        } catch (error) {
            console.error('[VersionAPI] Failed to check version:', error);
            throw error;
        }
    },

    /**
     * Update version information (admin only, requires auth)
     */
    async updateVersion(data: UpdateVersionRequest): Promise<VersionInfo> {
        try {
            // Get session token from main process
            const tokenResult = await window.electron.auth.getSessionToken();

            if (!tokenResult.success || !tokenResult.data) {
                throw new Error('Authentication required');
            }

            const response = await fetch(`${BACKEND_URL}/v1/version`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${tokenResult.data}`,
                },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // Session expired
                    await window.electron.auth.logout();
                    throw new Error('Session expired. Please login again.');
                }
                throw new Error(`Update version failed: ${response.status}`);
            }

            const result = await response.json();
            return result as VersionInfo;
        } catch (error) {
            console.error('[VersionAPI] Failed to update version:', error);
            throw error;
        }
    },
};
