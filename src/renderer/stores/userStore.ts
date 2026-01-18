/**
 * User Store - Cloud Authentication
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export interface CloudUser {
    id: string;
    email: string;
    displayName: string;
    photoUrl: string;
    creditBalance: number;
    createdAt: string;
    updatedAt?: string;
}

interface AuthResult {
    success: boolean;
    data?: {
        sessionToken: string;
        expiresAt: string;
        user: CloudUser;
    };
    error?: string;
}

interface GetUserResult {
    success: boolean;
    data?: CloudUser | null;
    error?: string;
}

export const useUserStore = defineStore('user', () => {
    // State
    const user = ref<CloudUser | null>(null);
    const isAuthenticated = computed(() => !!user.value);
    const creditBalance = computed(() => user.value?.creditBalance || 0);
    const isLoading = ref(false);
    const error = ref<string | null>(null);

    // Actions
    function setUser(userData: CloudUser) {
        user.value = userData;
        error.value = null;
    }

    function clearUser() {
        user.value = null;
        error.value = null;
    }

    /**
     * Login with Google OAuth
     */
    async function login(): Promise<boolean> {
        isLoading.value = true;
        error.value = null;

        try {
            const result: AuthResult = await window.electron.auth.login();

            if (result.success && result.data) {
                setUser(result.data.user);
                console.debug('✅ User logged in:', user.value?.email);
                return true;
            } else {
                error.value = result.error || 'Login failed';
                console.error('❌ Login failed:', error.value);
                return false;
            }
        } catch (err: any) {
            error.value = err?.message || 'Login failed';
            console.error('❌ Login error:', err);
            return false;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Logout
     */
    async function logout(): Promise<void> {
        isLoading.value = true;
        error.value = null;

        try {
            await window.electron.auth.logout();
            clearUser();
            console.debug('✅ User logged out');
        } catch (err: any) {
            error.value = err?.message || 'Logout failed';
            console.error('❌ Logout error:', err);
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Refresh user data from backend
     */
    async function refreshUser(): Promise<boolean> {
        isLoading.value = true;
        error.value = null;

        try {
            const result: GetUserResult = await window.electron.auth.getCurrentUser();

            if (result.success && result.data) {
                setUser(result.data);
                console.debug('✅ User refreshed:', user.value?.email);
                return true;
            } else if (result.data === null) {
                // No session - not an error
                clearUser();
                return false;
            } else {
                error.value = result.error || 'Failed to refresh user';
                console.error('❌ Refresh failed:', error.value);
                return false;
            }
        } catch (err: any) {
            error.value = err?.message || 'Failed to refresh user';
            console.error('❌ Refresh error:', err);
            return false;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Auto-login on app start
     */
    async function autoLogin(): Promise<boolean> {
        console.debug('🔄 Attempting auto-login...');
        return await refreshUser();
    }

    return {
        // State
        user,
        isAuthenticated,
        creditBalance,
        isLoading,
        error,

        // Actions
        setUser,
        clearUser,
        login,
        logout,
        refreshUser,
        autoLogin,
    };
});
