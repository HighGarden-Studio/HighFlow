/**
 * Drag & Drop Composable
 *
 * Handles drag-drop operations for tasks with optimistic updates
 */

import { ref } from 'vue';
import type { Task } from '@core/types/database';

interface DragDropOptions {
  onDrop?: (item: Task, targetStatus: string) => Promise<void>;
  onDragStart?: (item: Task) => void;
  onDragEnd?: () => void;
}

export function useDragDrop(options: DragDropOptions = {}) {
  const draggedItem = ref<Task | null>(null);
  const isDragging = ref(false);
  const dragOverColumn = ref<string | null>(null);

  /**
   * Handle drag start
   */
  function onDragStart(item: Task, event?: DragEvent) {
    draggedItem.value = item;
    isDragging.value = true;

    // Set drag data for native drag-drop
    if (event?.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/json', JSON.stringify(item));

      // Prevent default drag image ghost from causing scroll
      const dragImage = document.createElement('div');
      dragImage.style.position = 'absolute';
      dragImage.style.top = '-9999px';
      dragImage.textContent = item.title;
      dragImage.style.padding = '8px 12px';
      dragImage.style.background = '#3b82f6';
      dragImage.style.color = 'white';
      dragImage.style.borderRadius = '6px';
      dragImage.style.fontSize = '14px';
      dragImage.style.fontWeight = '500';
      document.body.appendChild(dragImage);
      event.dataTransfer.setDragImage(dragImage, 0, 0);

      // Clean up drag image after drag starts
      setTimeout(() => dragImage.remove(), 0);
    }

    // Disable pointer events on scrollable containers during drag
    document.body.style.userSelect = 'none';

    // Call optional callback
    options.onDragStart?.(item);
  }

  /**
   * Handle drag over (for drop zones)
   */
  function onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  /**
   * Handle drag enter (for visual feedback)
   */
  function onDragEnter(columnStatus: string) {
    dragOverColumn.value = columnStatus;
  }

  /**
   * Handle drag leave
   */
  function onDragLeave() {
    dragOverColumn.value = null;
  }

  /**
   * Handle drop
   */
  async function onDrop(targetStatus: string, event?: DragEvent) {
    event?.preventDefault();

    if (!draggedItem.value) return;

    const item = draggedItem.value;
    const oldStatus = item.status;

    try {
      // Optimistic update
      item.status = targetStatus as any;

      // Call optional callback (should handle API call)
      if (options.onDrop) {
        await options.onDrop(item, targetStatus);
      }
    } catch (error) {
      // Rollback on error
      console.error('Drop failed:', error);
      item.status = oldStatus as any;
      throw error;
    } finally {
      // Cleanup
      draggedItem.value = null;
      isDragging.value = false;
      dragOverColumn.value = null;

      options.onDragEnd?.();
    }
  }

  /**
   * Handle drag end (cleanup)
   */
  function onDragEndHandler() {
    draggedItem.value = null;
    isDragging.value = false;
    dragOverColumn.value = null;

    // Re-enable user selection
    document.body.style.userSelect = '';

    options.onDragEnd?.();
  }

  /**
   * Check if a column is being dragged over
   */
  function isColumnDragOver(columnStatus: string): boolean {
    return dragOverColumn.value === columnStatus && isDragging.value;
  }

  /**
   * Check if an item is currently being dragged
   */
  function isItemDragging(item: Task): boolean {
    return draggedItem.value?.id === item.id;
  }

  return {
    // State
    draggedItem,
    isDragging,
    dragOverColumn,

    // Methods
    onDragStart,
    onDragOver,
    onDragEnter,
    onDragLeave,
    onDrop,
    onDragEnd: onDragEndHandler,

    // Helpers
    isColumnDragOver,
    isItemDragging,
  };
}
