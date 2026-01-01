/**
 * Project Store
 *
 * Pinia store for managing projects state
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Project } from '@core/types/database';
import { getAPI } from '../../utils/electron';

export interface ProjectFilters {
    status?: string;
    isArchived?: boolean;
    search?: string;
}

export const useProjectStore = defineStore('projects', () => {
    // ========================================
    // State
    // ========================================

    const projects = ref<Project[]>([]);
    const currentProject = ref<Project | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const filters = ref<ProjectFilters>({});

    // ========================================
    // Getters
    // ========================================

    const activeProjects = computed(() =>
        projects.value.filter((p) => !p.isArchived && p.status === 'active')
    );

    const archivedProjects = computed(() => projects.value.filter((p) => p.isArchived));

    const favoriteProjects = computed(() =>
        projects.value.filter((p) => p.isFavorite && !p.isArchived)
    );

    const filteredProjects = computed(() => {
        let result = projects.value;

        if (filters.value.status) {
            result = result.filter((p) => p.status === filters.value.status);
        }

        if (filters.value.isArchived !== undefined) {
            result = result.filter((p) => p.isArchived === filters.value.isArchived);
        }

        if (filters.value.search) {
            const search = filters.value.search.toLowerCase();
            result = result.filter(
                (p) =>
                    p.title.toLowerCase().includes(search) ||
                    p.description?.toLowerCase().includes(search)
            );
        }

        return result;
    });

    const projectById = computed(() => (id: number) => projects.value.find((p) => p.id === id));

    // ========================================
    // Actions
    // ========================================

    /**
     * Fetch all projects from database
     */
    async function fetchProjects(projectFilters?: ProjectFilters): Promise<void> {
        loading.value = true;
        error.value = null;

        try {
            const api = getAPI();
            const data = await api.projects.list(projectFilters);
            projects.value = data;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to fetch projects';
            console.error('Failed to fetch projects:', e);
        } finally {
            loading.value = false;
        }
    }

    /**
     * Fetch a single project by ID
     */
    async function fetchProject(id: number): Promise<Project | null> {
        loading.value = true;
        error.value = null;

        try {
            const api = getAPI();
            const project = await api.projects.get(id);
            if (project) {
                currentProject.value = project;
                // Update in list if exists
                const index = projects.value.findIndex((p) => p.id === id);
                if (index >= 0) {
                    projects.value[index] = project;
                }
            }
            return project;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to fetch project';
            console.error('Failed to fetch project:', e);
            return null;
        } finally {
            loading.value = false;
        }
    }

    /**
     * Create a new project
     */
    async function createProject(data: {
        title: string;
        description?: string;
        ownerId: number;
        baseDevFolder?: string | null;
        projectGuidelines?: string | null;
        aiProvider?: string | null;
        aiModel?: string | null;
        mcpConfig?: any;
        technicalStack?: string[];
        aiGuidelines?: string | null;
        executionPlan?: any;
        metadata?: any;
    }): Promise<Project | null> {
        loading.value = true;
        error.value = null;

        try {
            const api = getAPI();
            // Deep clone to remove Vue Proxies
            const plainData = JSON.parse(JSON.stringify(data));
            const project = await api.projects.create(plainData);
            projects.value.unshift(project);
            return project;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to create project';
            console.error('Failed to create project:', e);
            return null;
        } finally {
            loading.value = false;
        }
    }

    /**
     * Update an existing project
     */
    async function updateProject(
        id: number,
        data: Partial<{
            title: string;
            description: string;
            status: string;
            aiGuidelines: string;
            aiProvider: string | null;
            aiModel: string | null;
        }>
    ): Promise<Project | null> {
        loading.value = true;
        error.value = null;

        try {
            const api = getAPI();
            const project = await api.projects.update(id, data);
            const index = projects.value.findIndex((p) => p.id === id);
            if (index >= 0) {
                projects.value[index] = project;
            }
            if (currentProject.value?.id === id) {
                currentProject.value = project;
            }
            return project;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to update project';
            console.error('Failed to update project:', e);
            return null;
        } finally {
            loading.value = false;
        }
    }

    /**
     * Delete a project
     */
    async function deleteProject(id: number): Promise<boolean> {
        loading.value = true;
        error.value = null;

        try {
            const api = getAPI();
            await api.projects.delete(id);
            projects.value = projects.value.filter((p) => p.id !== id);
            if (currentProject.value?.id === id) {
                currentProject.value = null;
            }
            return true;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to delete project';
            console.error('Failed to delete project:', e);
            return false;
        } finally {
            loading.value = false;
        }
    }

    /**
     * Export a project
     */
    async function exportProject(id: number): Promise<unknown | null> {
        loading.value = true;
        error.value = null;

        try {
            const api = getAPI();
            return await api.projects.export(id);
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to export project';
            console.error('Failed to export project:', e);
            return null;
        } finally {
            loading.value = false;
        }
    }

    /**
     * Import a project
     */
    async function importProject(data: unknown): Promise<Project | null> {
        loading.value = true;
        error.value = null;

        try {
            const api = getAPI();
            const project = await api.projects.import(data);
            projects.value.unshift(project);
            return project;
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to import project';
            console.error('Failed to import project:', e);
            return null;
        } finally {
            loading.value = false;
        }
    }

    /**
     * Set current project
     */
    function setCurrentProject(project: Project | null): void {
        currentProject.value = project;
    }

    /**
     * Update filters
     */
    function setFilters(newFilters: ProjectFilters): void {
        filters.value = newFilters;
    }

    /**
     * Clear error
     */
    function clearError(): void {
        error.value = null;
    }

    /**
     * Initialize event listeners for real-time updates
     */
    function initEventListeners(): () => void {
        const api = getAPI();
        const unsubscribeCreated = api.events.on('project:created', (project: unknown) => {
            const proj = project as Project;
            if (!projects.value.find((p) => p.id === proj.id)) {
                projects.value.unshift(proj);
            }
        });

        const unsubscribeUpdated = api.events.on('project:updated', (project: unknown) => {
            const proj = project as Project;
            const index = projects.value.findIndex((p) => p.id === proj.id);
            if (index >= 0) {
                projects.value[index] = proj;
            }
            if (currentProject.value?.id === proj.id) {
                currentProject.value = proj;
            }
        });

        const unsubscribeDeleted = api.events.on('project:deleted', (id: unknown) => {
            const projectId = id as number;
            projects.value = projects.value.filter((p) => p.id !== projectId);
            if (currentProject.value?.id === projectId) {
                currentProject.value = null;
            }
        });

        return () => {
            unsubscribeCreated();
            unsubscribeUpdated();
            unsubscribeDeleted();
        };
    }

    return {
        // State
        projects,
        currentProject,
        loading,
        error,
        filters,

        // Getters
        activeProjects,
        archivedProjects,
        favoriteProjects,
        filteredProjects,
        projectById,

        // Actions
        fetchProjects,
        fetchProject,
        createProject,
        updateProject,
        deleteProject,
        exportProject,
        importProject,
        setCurrentProject,
        setFilters,
        clearError,
        initEventListeners,
    };
});
