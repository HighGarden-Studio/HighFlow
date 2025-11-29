/**
 * Keyboard Shortcuts Composable
 *
 * Global keyboard shortcut handler
 */

import { onMounted, onUnmounted } from 'vue';

type KeyHandler = (event: KeyboardEvent) => void;

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: KeyHandler;
  description?: string;
}

export function useKeyboard() {
  const shortcuts = new Map<string, ShortcutConfig>();

  /**
   * Register a keyboard shortcut
   */
  function register(config: ShortcutConfig) {
    const id = getShortcutId(config);
    shortcuts.set(id, config);
  }

  /**
   * Unregister a keyboard shortcut
   */
  function unregister(config: Omit<ShortcutConfig, 'handler'>) {
    const id = getShortcutId(config);
    shortcuts.delete(id);
  }

  /**
   * Get shortcut ID
   */
  function getShortcutId(config: Partial<ShortcutConfig>): string {
    const parts: string[] = [];
    if (config.ctrl) parts.push('ctrl');
    if (config.meta) parts.push('meta');
    if (config.shift) parts.push('shift');
    if (config.alt) parts.push('alt');
    parts.push(config.key?.toLowerCase() || '');
    return parts.join('+');
  }

  /**
   * Handle keydown event
   */
  function handleKeyDown(event: KeyboardEvent) {
    const id = getShortcutId({
      key: event.key,
      ctrl: event.ctrlKey,
      meta: event.metaKey,
      shift: event.shiftKey,
      alt: event.altKey,
    });

    const shortcut = shortcuts.get(id);
    if (shortcut) {
      event.preventDefault();
      shortcut.handler(event);
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeyDown);
  });

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown);
    shortcuts.clear();
  });

  return {
    register,
    unregister,
    shortcuts,
  };
}
