<script setup lang="ts">
/**
 * Main Application Component
 *
 * Root component with layout and navigation
 */
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useUIStore } from './stores/uiStore';
import { useSettingsStore } from './stores/settingsStore';
import { useHistoryStore } from './stores/historyStore';
import { useUserStore } from './stores/userStore';
import { useI18n } from 'vue-i18n';
import GlobalSearch from '../components/search/GlobalSearch.vue';
import AssistantChat from '../components/assistant/AssistantChat.vue';
import InitialSetupWizard from '../components/setup/InitialSetupWizard.vue';
import ActivityConsole from '../components/common/ActivityConsole.vue';
import UpdateModal from '../components/common/UpdateModal.vue';
import IconRenderer from '../components/common/IconRenderer.vue';
import { indexManager } from '../services/search/IndexManager';
import { useActivityLogStore } from './stores/activityLogStore';
import { versionAPI } from './api/version';
import type { VersionInfo } from './api/version';
import { eventBus } from '../services/events/EventBus';
import type { MCPErrorEvent } from '../services/events/EventBus';

const router = useRouter();
const route = useRoute();
const uiStore = useUIStore();
const settingsStore = useSettingsStore();
const historyStore = useHistoryStore();
const activityLogStore = useActivityLogStore();
const userStore = useUserStore();
const { t, locale } = useI18n();

const currentLocaleLabel = computed(() => {
    return locale.value === 'ko' ? '한국어' : 'English';
});

async function toggleLanguage() {
    const newLocale = locale.value === 'ko' ? 'en' : 'ko';
    locale.value = newLocale;

    // Persist to userProfile
    settingsStore.updateProfile({
        language: newLocale,
    });
}

// State
const sidebarOpen = ref(true);
const showSearch = ref(false);
const showAssistant = ref(false);
const showSetupWizard = ref(false);
const isInitialized = ref(false);

// Update modal state
const showUpdateModal = ref(false);
const versionInfo = ref<VersionInfo | null>(null);

// Computed
const activeRoute = computed(() => route.name);

// User profile computed values (Cloud + Local fallback)
const displayName = computed(() => {
    // Cloud user takes priority
    if (userStore.user) {
        return userStore.user.displayName || 'User';
    }
    // Fallback to local profile
    const name = settingsStore.userProfile.displayName;
    return name && name.trim() ? name : 'User';
});

const userEmail = computed(() => {
    // Cloud user takes priority
    if (userStore.user) {
        return userStore.user.email;
    }
    // Fallback to local profile
    const email = settingsStore.userProfile.email;
    return email && email.trim() ? email : 'Development';
});

const userInitials = computed(() => {
    const name = displayName.value;
    if (!name || name === 'User') return 'U';
    const parts = name.split(' ').filter((p) => p.length > 0);
    if (parts.length >= 2) {
        return (parts[0]![0] + parts[1]![0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
});

const userPhotoUrl = computed(() => userStore.user?.photoUrl || null);

// Navigation items
const navItems = computed(() => [
    {
        name: 'projects',
        label: t('nav.projects'),
        icon: 'folder',
        path: '/projects',
    },
    {
        name: 'marketplace',
        label: t('nav.marketplace'),
        icon: 'store',
        path: '/marketplace',
    },
    {
        name: 'settings',
        label: t('nav.settings'),
        icon: 'settings',
        path: '/settings',
    },
]);

// Actions
function navigateTo(path: string) {
    router.push(path);
}

function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value;
}

// Window controls (for custom title bar)
function minimizeWindow() {
    window.electron?.window.minimize();
}

function maximizeWindow() {
    window.electron?.window.maximize();
}

function closeWindow() {
    window.electron?.window.close();
}

/**
 * Global keyboard shortcuts
 */
function handleGlobalKeyDown(event: KeyboardEvent) {
    const isMac = navigator.userAgent.includes('Mac');
    const modifier = isMac ? event.metaKey : event.ctrlKey;
    const key = event.key.toLowerCase();

    // Skip if typing in input elements
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
    }

    // Undo: Cmd+Z (Mac) or Ctrl+Z (Windows/Linux)
    if (modifier && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (historyStore.canUndo) {
            historyStore.undo();
            console.log('⌨️ Undo triggered');
        }
        return;
    }

    // Redo: Cmd+Shift+Z (Mac) or Ctrl+Shift+Z (Windows/Linux)
    if (modifier && key === 'z' && event.shiftKey) {
        event.preventDefault();
        if (historyStore.canRedo) {
            historyStore.redo();
            console.log('⌨️ Redo triggered');
        }
        return;
    }

    // Assistant Panel: Cmd+J or Ctrl+J
    if (modifier && key === 'j') {
        event.preventDefault();
        toggleAssistant();
        return;
    }

    // Search: Cmd+K or Ctrl+K
    if (modifier && key === 'k') {
        event.preventDefault();
        showSearch.value = !showSearch.value;
        return;
    }

    // Cmd+` or Ctrl+` to toggle activity console
    if (modifier && key === '`') {
        event.preventDefault();
        activityLogStore.toggleConsole();
        return;
    }
}

// Toggle assistant from floating button
function toggleAssistant() {
    showAssistant.value = !showAssistant.value;
}

// Setup Wizard handlers
async function handleSetupComplete() {
    await settingsStore.completeSetupWizard();
    showSetupWizard.value = false;
}

async function handleSetupSkip() {
    await settingsStore.skipSetupWizard(false);
    showSetupWizard.value = false;
}

// Computed for layout

// Auth actions
async function handleLogin() {
    const success = await userStore.login();
    if (success) {
        uiStore.showToast({ message: 'Login successful!', type: 'success' });
    } else {
        uiStore.showToast({ message: userStore.error || 'Login failed', type: 'error' });
    }
}

async function handleLogout() {
    if (confirm(t('auth.logout_confirm'))) {
        await userStore.logout();
        uiStore.showToast({ message: t('auth.logout'), type: 'info' });
    }
}

// Version check and update handlers
async function checkForUpdates() {
    try {
        const currentVersion = await window.electron.app.getVersion();
        console.log('[VersionCheck] Current version:', currentVersion);

        const info = await versionAPI.checkVersion(currentVersion);
        console.log('[VersionCheck] Version info:', info);

        if (info.needsUpdate) {
            versionInfo.value = info;
            showUpdateModal.value = true;

            if (info.forceUpdate) {
                console.log('[VersionCheck] Force update required');
            }
        }
    } catch (error) {
        console.error('[VersionCheck] Failed to check version:', error);
        // Silently fail - don't block app usage
    }
}

function handleDownloadUpdate() {
    if (versionInfo.value?.downloadUrl) {
        window.electron.shell.openExternal(versionInfo.value.downloadUrl);
    }
}

function handleCloseUpdateModal() {
    if (!versionInfo.value?.forceUpdate) {
        showUpdateModal.value = false;
    }
}

// Lifecycle
onMounted(async () => {
    // Initialize UI store
    await uiStore.initialize();

    // Load settings (includes loading models from DB cache)
    await settingsStore.loadSettings();

    // Set locale from settings
    if (settingsStore.userProfile.language) {
        locale.value = settingsStore.userProfile.language;
    } else {
        // Initialize if not set
        settingsStore.updateProfile({
            language: locale.value,
        });
    }

    // Auto-login attempt
    await userStore.autoLogin();

    // Initialize search index manager
    indexManager.initialize();

    // Apply dark mode by default
    document.documentElement.classList.add('dark');

    // Add global keyboard listener
    window.addEventListener('keydown', handleGlobalKeyDown);

    // Note: activity:log events are handled in activityLogStore.ts
    // to avoid duplication. See subscribeToIPCEvents() in that file.

    // Check if we should show setup wizard
    isInitialized.value = true;
    if (settingsStore.shouldShowSetupWizard) {
        showSetupWizard.value = true;
    }

    // Check for updates
    await checkForUpdates();

    // Listen for global notifications from main process
    if (window.electron?.app?.onNotification) {
        const cleanup = window.electron.app.onNotification((data: any) => {
            console.log('[App] Received notification:', data);
            uiStore.showToast({ message: data.message, type: data.type || 'info' });
        });

        // Clean up on unmount
        onUnmounted(() => {
            cleanup();
        });
    }

    // Listen for MCP errors
    eventBus.on<MCPErrorEvent>('ai.mcp_error', (event) => {
        uiStore.showToast({
            message: `MCP Error: ${event.payload.error}`,
            type: 'error',
            duration: 7000,
        });
    });
});

onUnmounted(() => {
    window.removeEventListener('keydown', handleGlobalKeyDown);
    indexManager.shutdown();
});
</script>

<template>
    <div class="flex h-screen bg-gray-900 text-white overflow-hidden">
        <!-- Sidebar -->
        <aside
            :class="[
                'flex-shrink-0 bg-gray-950 border-r border-gray-800 transition-all duration-300 flex flex-col pt-12 pb-14',
                sidebarOpen ? 'w-64' : 'w-16',
            ]"
        >
            <!-- Logo -->
            <div class="h-14 flex items-center justify-between px-4 border-b border-gray-800">
                <div v-if="sidebarOpen" class="flex items-center gap-2">
                    <IconRenderer icon="custom:highflow-logo" class="w-8 h-8" />
                    <!-- App name removed as per user request (duplicated in header) -->
                </div>
                <button
                    @click="toggleSidebar"
                    class="p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
                >
                    <svg
                        :class="[
                            'w-5 h-5 text-gray-400 transition-transform',
                            sidebarOpen ? '' : 'rotate-180',
                        ]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
                        />
                    </svg>
                </button>
            </div>

            <!-- Navigation -->
            <nav class="flex-1 py-4 px-2 space-y-1">
                <button
                    v-for="item in navItems"
                    :key="item.name"
                    @click="navigateTo(item.path)"
                    :class="[
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left',
                        activeRoute?.toString().includes(item.name)
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-400 hover:bg-gray-800 hover:text-white',
                    ]"
                >
                    <!-- Folder icon -->
                    <svg
                        v-if="item.icon === 'folder'"
                        class="w-5 h-5 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                        />
                    </svg>
                    <!-- Marketplace/Store icon -->
                    <svg
                        v-if="item.icon === 'store'"
                        class="w-5 h-5 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                    </svg>
                    <!-- Settings icon -->
                    <svg
                        v-if="item.icon === 'settings'"
                        class="w-5 h-5 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                    </svg>
                    <span v-if="sidebarOpen" class="truncate">{{ item.label }}</span>
                </button>
            </nav>

            <!-- User/App Info & Cloud Auth -->
            <div class="p-4 border-t border-gray-800">
                <!-- Cloud User Authenticated -->
                <template v-if="userStore.isAuthenticated">
                    <div v-if="sidebarOpen" class="space-y-3">
                        <div class="flex items-center gap-3">
                            <img
                                v-if="userPhotoUrl"
                                :src="userPhotoUrl"
                                alt="Profile"
                                class="w-8 h-8 rounded-full"
                            />
                            <div
                                v-else
                                class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold"
                            >
                                {{ userInitials }}
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-medium truncate">{{ displayName }}</p>
                                <p class="text-xs text-gray-500 truncate">{{ userEmail }}</p>
                            </div>
                            <button
                                @click="handleLogout"
                                class="p-1 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded transition-colors"
                                :title="$t('auth.logout')"
                            >
                                <svg
                                    class="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                    />
                                </svg>
                            </button>
                        </div>
                        <!-- Credit Balance -->
                        <div
                            class="flex items-center justify-between px-2 py-1.5 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 rounded-lg border border-yellow-500/20"
                        >
                            <div class="flex items-center gap-1.5">
                                <span class="text-xs">💰</span>
                                <span class="text-xs text-gray-400">{{ $t('auth.credits') }}</span>
                            </div>
                            <span class="text-sm font-bold text-yellow-400">{{
                                userStore.creditBalance
                            }}</span>
                        </div>
                    </div>
                    <div v-else class="flex justify-center relative group">
                        <img
                            v-if="userPhotoUrl"
                            :src="userPhotoUrl"
                            alt="Profile"
                            class="w-8 h-8 rounded-full cursor-pointer"
                            @click="handleLogout"
                        />
                        <div
                            v-else
                            class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold cursor-pointer"
                            @click="handleLogout"
                        >
                            {{ userInitials }}
                        </div>
                        <!-- Logout tooltip on hover -->
                        <div
                            class="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-700 text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap"
                        >
                            {{ $t('auth.logout') }}
                        </div>
                    </div>
                </template>

                <!-- Not Authenticated - Login Button -->
                <template v-else>
                    <button
                        v-if="sidebarOpen"
                        @click="handleLogin"
                        :disabled="userStore.isLoading"
                        class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-gray-100 text-gray-900 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                        <svg class="w-5 h-5" viewBox="0 0 24 24">
                            <path
                                fill="#4285F4"
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                                fill="#34A853"
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                                fill="#FBBC05"
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            />
                            <path
                                fill="#EA4335"
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                        </svg>

                        <span v-if="!userStore.isLoading">{{ $t('auth.login') }}</span>
                        <span v-else>{{ $t('auth.login_loading') }}</span>
                    </button>
                    <button
                        v-else
                        @click="handleLogin"
                        :disabled="userStore.isLoading"
                        class="w-8 h-8 flex items-center justify-center bg-white hover:bg-gray-100 rounded-full transition-all disabled:opacity-50"
                        title="Google Login"
                    >
                        <svg class="w-5 h-5" viewBox="0 0 24 24">
                            <path
                                fill="#4285F4"
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                                fill="#34A853"
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                                fill="#FBBC05"
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            />
                            <path
                                fill="#EA4335"
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                        </svg>
                    </button>
                </template>

                <!-- HighGarden Credit & Lang Switch -->
                <div v-if="sidebarOpen" class="mt-3 pt-3 border-t border-gray-800/50">
                    <div class="flex items-center justify-between mb-2">
                        <button
                            @click="toggleLanguage"
                            class="text-xs text-gray-500 hover:text-white transition-colors flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-800/50"
                        >
                            <span class="text-sm">{{ locale === 'ko' ? '🇰🇷' : '🇺🇸' }}</span>
                            <span>{{ currentLocaleLabel }}</span>
                        </button>
                        <p class="text-[10px] text-gray-600">© HighGarden</p>
                    </div>
                </div>
            </div>
        </aside>

        <!-- Main Content -->
        <main class="flex-1 flex flex-col overflow-hidden transition-all duration-300">
            <!-- Custom Title Bar (for frameless window on macOS) -->
            <div
                v-if="$route.meta.showTitleBar !== false"
                class="h-12 bg-gray-950 grid grid-cols-3 items-center px-4 select-none border-b border-gray-800/50"
                style="-webkit-app-region: drag"
            >
                <!-- Left: macOS traffic lights space -->
                <div class="flex items-center justify-start">
                    <div class="w-20"></div>
                </div>

                <!-- Center: App Title -->
                <div class="flex items-center justify-center">
                    <span class="font-bold text-sm text-gray-400">HighFlow</span>
                </div>

                <!-- Right: Search Bar & Window Controls -->
                <div
                    class="flex items-center justify-end gap-2"
                    style="-webkit-app-region: no-drag"
                >
                    <!-- Undo/Redo Buttons -->
                    <div class="flex items-center gap-1 mr-2">
                        <!-- Undo Button -->
                        <button
                            @click="historyStore.undo()"
                            :disabled="!historyStore.canUndo"
                            :title="
                                historyStore.canUndo
                                    ? `실행 취소: ${historyStore.undoDescription}`
                                    : '실행 취소'
                            "
                            :class="[
                                'p-1.5 rounded-lg transition-colors',
                                historyStore.canUndo
                                    ? 'hover:bg-gray-800 text-gray-400 hover:text-white'
                                    : 'text-gray-600 cursor-not-allowed',
                            ]"
                        >
                            <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                                />
                            </svg>
                        </button>

                        <!-- Redo Button -->
                        <button
                            @click="historyStore.redo()"
                            :disabled="!historyStore.canRedo"
                            :title="
                                historyStore.canRedo
                                    ? `다시 실행: ${historyStore.redoDescription}`
                                    : '다시 실행'
                            "
                            :class="[
                                'p-1.5 rounded-lg transition-colors',
                                historyStore.canRedo
                                    ? 'hover:bg-gray-800 text-gray-400 hover:text-white'
                                    : 'text-gray-600 cursor-not-allowed',
                            ]"
                        >
                            <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6"
                                />
                            </svg>
                        </button>
                    </div>

                    <!-- Search Bar (clickable) -->
                    <button
                        @click="showSearch = true"
                        class="flex items-center gap-2 px-3 py-1.5 bg-gray-800/50 hover:bg-gray-800 border border-gray-700 rounded-lg transition-colors"
                    >
                        <svg
                            class="w-4 h-4 text-gray-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                            />
                        </svg>
                        <span class="text-xs text-gray-500">{{ $t('common.search') }}</span>
                        <kbd
                            class="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 bg-gray-700/50 rounded"
                        >
                            <span>⌘</span><span>K</span>
                        </kbd>
                    </button>

                    <!-- Windows controls (hidden on macOS via v-if="false" in original code) -->
                    <div class="flex items-center gap-1">
                        <template v-if="false">
                            <button @click="minimizeWindow" class="p-1.5 hover:bg-gray-800 rounded">
                                <svg
                                    class="w-4 h-4 text-gray-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M20 12H4"
                                    />
                                </svg>
                            </button>
                            <button @click="maximizeWindow" class="p-1.5 hover:bg-gray-800 rounded">
                                <svg
                                    class="w-4 h-4 text-gray-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                                    />
                                </svg>
                            </button>
                            <button @click="closeWindow" class="p-1.5 hover:bg-red-600 rounded">
                                <svg
                                    class="w-4 h-4 text-gray-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </template>
                    </div>
                </div>
            </div>

            <!-- Router View -->
            <div class="flex-1 overflow-hidden relative">
                <router-view />
            </div>

            <!-- Activity Console (Flow layout) -->
            <ActivityConsole />
        </main>

        <!-- Toast Container -->
        <div class="fixed bottom-4 right-4 z-50 space-y-2">
            <TransitionGroup name="toast">
                <div
                    v-for="toast in uiStore.toasts"
                    :key="toast.id"
                    :class="[
                        'px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] max-w-md',
                        {
                            'bg-green-600': toast.type === 'success',
                            'bg-red-600': toast.type === 'error',
                            'bg-yellow-600': toast.type === 'warning',
                            'bg-blue-600': toast.type === 'info',
                        },
                    ]"
                >
                    <span class="flex-1">{{ toast.message }}</span>
                    <button
                        @click="uiStore.dismissToast(toast.id)"
                        class="p-1 hover:bg-white/20 rounded"
                    >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    </button>
                </div>
            </TransitionGroup>
        </div>

        <!-- Global Loading Overlay -->
        <Transition name="fade">
            <div
                v-if="uiStore.globalLoading"
                class="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
            >
                <div class="bg-gray-800 rounded-xl p-6 flex flex-col items-center gap-4">
                    <div
                        class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"
                    ></div>
                    <p v-if="uiStore.loadingMessage" class="text-gray-300">
                        {{ uiStore.loadingMessage }}
                    </p>
                </div>
            </div>
        </Transition>

        <!-- Global Search (Cmd+K) -->
        <GlobalSearch :open="showSearch" @close="showSearch = false" />

        <!-- AI Assistant Chat -->
        <AssistantChat :open="showAssistant" @close="showAssistant = false" />

        <!-- AI Assistant Floating Button -->
        <button
            v-if="!showAssistant"
            @click="toggleAssistant"
            class="fixed bottom-12 right-4 z-40 w-14 h-14 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-full shadow-lg shadow-purple-500/25 flex items-center justify-center transition-all hover:scale-105 group"
            :title="$t('common.ai_assistant')"
        >
            <span class="text-2xl group-hover:scale-110 transition-transform">🤖</span>
        </button>

        <!-- Initial Setup Wizard -->
        <InitialSetupWizard
            :open="showSetupWizard && isInitialized"
            @complete="handleSetupComplete"
            @skip="handleSetupSkip"
            @close="handleSetupSkip"
        />

        <!-- Update Modal -->
        <UpdateModal
            :open="showUpdateModal"
            :version-info="versionInfo"
            @close="handleCloseUpdateModal"
            @download="handleDownloadUpdate"
        />
    </div>
</template>

<style>
/* Toast animations */
.toast-enter-active,
.toast-leave-active {
    transition: all 0.3s ease;
}

.toast-enter-from {
    opacity: 0;
    transform: translateX(100%);
}

.toast-leave-to {
    opacity: 0;
    transform: translateX(100%);
}

/* Fade animation */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

/* Scrollbar styling */
::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}

::-webkit-scrollbar-track {
    background: transparent;
}

::-webkit-scrollbar-thumb {
    background: #374151;
    border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
    background: #4b5563;
}
</style>
