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
import GlobalSearch from '../components/search/GlobalSearch.vue';
import AssistantChat from '../components/assistant/AssistantChat.vue';
import InitialSetupWizard from '../components/setup/InitialSetupWizard.vue';
import ActivityConsole from '../components/common/ActivityConsole.vue';
import { indexManager } from '../services/search/IndexManager';
import { useActivityLogStore } from './stores/activityLogStore';

const router = useRouter();
const route = useRoute();
const uiStore = useUIStore();
const settingsStore = useSettingsStore();
const historyStore = useHistoryStore();
const activityLogStore = useActivityLogStore();

// State
const sidebarOpen = ref(true);
const showSearch = ref(false);
const showAssistant = ref(false);
const showSetupWizard = ref(false);
const isInitialized = ref(false);

// Computed
const activeRoute = computed(() => route.name);

// User profile computed values
const displayName = computed(() => {
    const name = settingsStore.userProfile.displayName;
    return name && name.trim() ? name : 'User';
});

const userEmail = computed(() => {
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

// Navigation items
const navItems = [
    {
        name: 'projects',
        label: 'Projects',
        icon: 'folder',
        path: '/projects',
    },
    {
        name: 'settings',
        label: 'Settings',
        icon: 'settings',
        path: '/settings',
    },
];

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
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifier = isMac ? event.metaKey : event.ctrlKey;

    // Skip if typing in input elements
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
    }

    // Undo: Cmd+Z (Mac) or Ctrl+Z (Windows/Linux)
    if (modifier && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        if (historyStore.canUndo) {
            historyStore.undo();
            console.log('⌨️ Undo triggered');
        }
        return;
    }

    // Redo: Cmd+Shift+Z (Mac) or Ctrl+Shift+Z (Windows/Linux)
    if (modifier && event.key === 'z' && event.shiftKey) {
        event.preventDefault();
        if (historyStore.canRedo) {
            historyStore.redo();
            console.log('⌨️ Redo triggered');
        }
        return;
    }

    // Assistant Panel: Cmd+K or Ctrl+K
    if (modifier && event.key === 'k') {
        event.preventDefault();
        toggleAssistant();
    }
    // Cmd+` or Ctrl+` to toggle activity console
    if ((event.metaKey || event.ctrlKey) && event.key === '`') {
        event.preventDefault();
        activityLogStore.toggleConsole();
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
const contentPaddingBottom = computed(() => {
    const basePadding = 40; // Approx height of toggle bar
    if (activityLogStore.isConsoleOpen) {
        return `${basePadding + activityLogStore.consoleHeight}px`;
    }
    return `${basePadding}px`;
});

// Lifecycle
onMounted(async () => {
    // Initialize UI store
    await uiStore.initialize();

    // Load settings
    await settingsStore.loadSettings();

    // Initialize search index manager
    indexManager.initialize();

    // Apply dark mode by default
    document.documentElement.classList.add('dark');

    // Add global keyboard listener
    window.addEventListener('keydown', handleGlobalKeyDown);

    // Listen for activity logs from main process
    if (window.electron?.events) {
        window.electron.events.on('activity:log', (data: any) => {
            const { level, message, details } = data;

            activityLogStore.addLog({
                level: level as any,
                category: 'ipc',
                type: 'activity.log',
                message,
                details,
                source: 'main',
                taskId: details?.taskId,
                projectId: details?.projectId,
            });

            console.log(`[Main Process] [${level.toUpperCase()}] ${message}`, details || '');
        });
    }

    // Check if we should show setup wizard
    isInitialized.value = true;
    if (settingsStore.shouldShowSetupWizard) {
        showSetupWizard.value = true;
    }
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
                'flex-shrink-0 bg-gray-950 border-r border-gray-800 transition-all duration-300 flex flex-col pt-12',
                sidebarOpen ? 'w-64' : 'w-16',
            ]"
        >
            <!-- Logo -->
            <div class="h-14 flex items-center justify-between px-4 border-b border-gray-800">
                <div v-if="sidebarOpen" class="flex items-center gap-2">
                    <span class="text-xl">🤖</span>
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

            <!-- User/App Info -->
            <div class="p-4 border-t border-gray-800">
                <div v-if="sidebarOpen" class="flex items-center gap-3">
                    <div
                        class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold"
                    >
                        {{ userInitials }}
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium truncate">{{ displayName }}</p>
                        <p class="text-xs text-gray-500 truncate">{{ userEmail }}</p>
                    </div>
                </div>
                <div v-else class="flex justify-center">
                    <div
                        class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold"
                    >
                        {{ userInitials }}
                    </div>
                </div>
                <!-- HighGarden Credit -->
                <div v-if="sidebarOpen" class="mt-3 pt-3 border-t border-gray-800/50">
                    <p class="text-[10px] text-gray-600 text-center">© HighGarden</p>
                </div>
            </div>
        </aside>

        <!-- Main Content -->
        <main
            class="flex-1 flex flex-col overflow-hidden transition-all duration-300"
            :style="{ paddingBottom: contentPaddingBottom }"
        >
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
                    <span class="font-bold text-sm text-gray-400">HighAIFlow</span>
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
                        <span class="text-xs text-gray-500">검색...</span>
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
            <div class="flex-1 overflow-hidden">
                <router-view />
            </div>
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
            title="AI 비서 (⌘J)"
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

        <!-- Activity Console -->
        <ActivityConsole />
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
