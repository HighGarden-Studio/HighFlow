/**
 * UI Store
 *
 * Pinia store for managing UI state (sidebar, modals, themes, etc.)
 */

import { defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';

export type Theme = 'light' | 'dark' | 'system';
export type SidebarState = 'expanded' | 'collapsed' | 'hidden';
export type ViewMode = 'kanban' | 'list' | 'timeline' | 'calendar';

export interface ModalState {
  name: string;
  props?: Record<string, unknown>;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export const useUIStore = defineStore('ui', () => {
  // ========================================
  // State
  // ========================================

  // Theme
  const theme = ref<Theme>('system');
  const resolvedTheme = ref<'light' | 'dark'>('dark');

  // Sidebar
  const sidebarState = ref<SidebarState>('expanded');
  const sidebarWidth = ref(280);

  // View
  const viewMode = ref<ViewMode>('kanban');

  // Modals
  const activeModals = ref<ModalState[]>([]);

  // Toasts
  const toasts = ref<Toast[]>([]);

  // Loading states
  const globalLoading = ref(false);
  const loadingMessage = ref<string | null>(null);

  // Command palette
  const commandPaletteOpen = ref(false);

  // Window
  const isMaximized = ref(false);

  // ========================================
  // Getters
  // ========================================

  const isDarkMode = computed(() => resolvedTheme.value === 'dark');

  const isSidebarExpanded = computed(() => sidebarState.value === 'expanded');

  const isSidebarVisible = computed(() => sidebarState.value !== 'hidden');

  const hasActiveModals = computed(() => activeModals.value.length > 0);

  const topModal = computed(() =>
    activeModals.value.length > 0
      ? activeModals.value[activeModals.value.length - 1]
      : null
  );

  // ========================================
  // Actions
  // ========================================

  /**
   * Set theme
   */
  function setTheme(newTheme: Theme): void {
    theme.value = newTheme;
    updateResolvedTheme();
    localStorage.setItem('theme', newTheme);
  }

  /**
   * Update resolved theme based on system preference
   */
  function updateResolvedTheme(): void {
    if (theme.value === 'system') {
      resolvedTheme.value = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    } else {
      resolvedTheme.value = theme.value;
    }

    // Update document class
    document.documentElement.classList.toggle('dark', resolvedTheme.value === 'dark');
  }

  /**
   * Toggle sidebar state
   */
  function toggleSidebar(): void {
    if (sidebarState.value === 'expanded') {
      sidebarState.value = 'collapsed';
    } else if (sidebarState.value === 'collapsed') {
      sidebarState.value = 'expanded';
    }
  }

  /**
   * Set sidebar state
   */
  function setSidebarState(state: SidebarState): void {
    sidebarState.value = state;
  }

  /**
   * Set sidebar width
   */
  function setSidebarWidth(width: number): void {
    sidebarWidth.value = Math.max(200, Math.min(400, width));
  }

  /**
   * Set view mode
   */
  function setViewMode(mode: ViewMode): void {
    viewMode.value = mode;
    localStorage.setItem('viewMode', mode);
  }

  /**
   * Open modal
   */
  function openModal(name: string, props?: Record<string, unknown>): void {
    // Close any modal with the same name first
    closeModal(name);
    activeModals.value.push({ name, props });
  }

  /**
   * Close modal by name
   */
  function closeModal(name: string): void {
    activeModals.value = activeModals.value.filter((m) => m.name !== name);
  }

  /**
   * Close top modal
   */
  function closeTopModal(): void {
    if (activeModals.value.length > 0) {
      activeModals.value.pop();
    }
  }

  /**
   * Close all modals
   */
  function closeAllModals(): void {
    activeModals.value = [];
  }

  /**
   * Show toast notification
   */
  function showToast(toast: Omit<Toast, 'id'>): void {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const duration = toast.duration ?? 5000;

    toasts.value.push({ ...toast, id });

    if (duration > 0) {
      setTimeout(() => {
        dismissToast(id);
      }, duration);
    }
  }

  /**
   * Dismiss toast by ID
   */
  function dismissToast(id: string): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  /**
   * Clear all toasts
   */
  function clearToasts(): void {
    toasts.value = [];
  }

  /**
   * Set global loading state
   */
  function setLoading(loading: boolean, message?: string): void {
    globalLoading.value = loading;
    loadingMessage.value = message ?? null;
  }

  /**
   * Toggle command palette
   */
  function toggleCommandPalette(): void {
    commandPaletteOpen.value = !commandPaletteOpen.value;
  }

  /**
   * Open command palette
   */
  function openCommandPalette(): void {
    commandPaletteOpen.value = true;
  }

  /**
   * Close command palette
   */
  function closeCommandPalette(): void {
    commandPaletteOpen.value = false;
  }

  /**
   * Update window maximized state
   */
  function setMaximized(maximized: boolean): void {
    isMaximized.value = maximized;
  }

  /**
   * Initialize UI store
   */
  async function initialize(): Promise<void> {
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    if (savedTheme) {
      theme.value = savedTheme;
    }
    updateResolvedTheme();

    // Load saved view mode
    const savedViewMode = localStorage.getItem('viewMode') as ViewMode | null;
    if (savedViewMode) {
      viewMode.value = savedViewMode;
    }

    // Listen for system theme changes
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', updateResolvedTheme);

    // Listen for window maximize changes
    if (window.electron?.window) {
      const cleanup = window.electron.window.onMaximizedChange((maximized) => {
        isMaximized.value = maximized;
      });

      // Get initial state
      isMaximized.value = await window.electron.window.isMaximized();

      return cleanup;
    }
  }

  // Watch for theme changes
  watch(theme, updateResolvedTheme);

  return {
    // State
    theme,
    resolvedTheme,
    sidebarState,
    sidebarWidth,
    viewMode,
    activeModals,
    toasts,
    globalLoading,
    loadingMessage,
    commandPaletteOpen,
    isMaximized,

    // Getters
    isDarkMode,
    isSidebarExpanded,
    isSidebarVisible,
    hasActiveModals,
    topModal,

    // Actions
    setTheme,
    toggleSidebar,
    setSidebarState,
    setSidebarWidth,
    setViewMode,
    openModal,
    closeModal,
    closeTopModal,
    closeAllModals,
    showToast,
    dismissToast,
    clearToasts,
    setLoading,
    toggleCommandPalette,
    openCommandPalette,
    closeCommandPalette,
    setMaximized,
    initialize,
  };
});
