/**
 * Pinia Stores Index
 *
 * Export all stores from a single entry point
 */

export { useProjectStore } from './projectStore';
export type { ProjectFilters } from './projectStore';

export { useTaskStore } from './taskStore';
export type { TaskFilters, GroupedTasks, TaskStatus, TaskPriority } from './taskStore';

export { useUIStore } from './uiStore';
export type { Theme, SidebarState, ViewMode, ModalState, Toast } from './uiStore';
