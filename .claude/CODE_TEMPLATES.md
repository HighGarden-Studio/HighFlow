# Code Templates & Boilerplates

> Ready-to-use templates for consistent code generation

---

## 📦 Feature Module Template

### Complete Feature Module Structure
```bash
src/renderer/modules/{feature}/
├── components/
│   ├── {Feature}List.vue
│   ├── {Feature}Card.vue
│   ├── {Feature}Form.vue
│   └── {Feature}Detail.vue
├── composables/
│   ├── use{Feature}.ts
│   └── use{Feature}Form.ts
├── stores/
│   └── {feature}Store.ts
├── types.ts
└── index.ts
```

---

## 🎨 Vue Component Templates

### 1. List Component
```vue
<!-- components/ProjectList.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useProjectStore } from '../stores/projectStore';
import ProjectCard from './ProjectCard.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Loader2 } from 'lucide-vue-next';

const projectStore = useProjectStore();
const { projects, loading } = storeToRefs(projectStore);
const { fetchProjects } = projectStore;

const searchQuery = ref('');

const filteredProjects = computed(() => {
  if (!searchQuery.value) return projects.value;
  return projects.value.filter((p) =>
    p.title.toLowerCase().includes(searchQuery.value.toLowerCase())
  );
});

onMounted(() => {
  fetchProjects();
});
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Projects</h1>
      <Button @click="$emit('create')">
        New Project
      </Button>
    </div>

    <!-- Search -->
    <Input
      v-model="searchQuery"
      placeholder="Search projects..."
      class="max-w-md"
    />

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Empty State -->
    <div
      v-else-if="filteredProjects.length === 0"
      class="flex flex-col items-center justify-center py-12 text-center"
    >
      <p class="text-lg text-muted-foreground">No projects found</p>
      <Button variant="outline" class="mt-4" @click="$emit('create')">
        Create your first project
      </Button>
    </div>

    <!-- Project Grid -->
    <div v-else class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <ProjectCard
        v-for="project in filteredProjects"
        :key="project.id"
        :project="project"
        @click="$emit('select', project)"
        @delete="handleDelete(project.id)"
      />
    </div>
  </div>
</template>
```

### 2. Card Component
```vue
<!-- components/ProjectCard.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import type { Project } from '@core/types/project';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { MoreVertical, Trash2 } from 'lucide-vue-next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';

interface Props {
  project: Project;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  click: [];
  delete: [];
}>();

const statusColor = computed(() => {
  const colors = {
    active: 'bg-green-500',
    archived: 'bg-gray-500',
    completed: 'bg-blue-500',
  };
  return colors[props.project.status] || 'bg-gray-500';
});

const taskCount = computed(() => props.project.tasks?.length || 0);
const completedTasks = computed(() =>
  props.project.tasks?.filter((t) => t.status === 'done').length || 0
);
</script>

<template>
  <Card
    class="cursor-pointer transition-all hover:shadow-lg"
    @click="emit('click')"
  >
    <CardHeader>
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <CardTitle>{{ project.title }}</CardTitle>
          <CardDescription class="mt-1">
            {{ project.description }}
          </CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger as-child @click.stop>
            <Button variant="ghost" size="icon">
              <MoreVertical class="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click.stop="emit('delete')">
              <Trash2 class="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </CardHeader>

    <CardContent>
      <div class="flex items-center justify-between">
        <Badge :class="statusColor">
          {{ project.status }}
        </Badge>
        <span class="text-sm text-muted-foreground">
          {{ completedTasks }} / {{ taskCount }} tasks
        </span>
      </div>
    </CardContent>
  </Card>
</template>
```

### 3. Form Component
```vue
<!-- components/ProjectForm.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import { z } from 'zod';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import type { CreateProjectDTO } from '@core/types/project';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/label';

const emit = defineEmits<{
  submit: [data: CreateProjectDTO];
  cancel: [];
}>();

const formSchema = toTypedSchema(
  z.object({
    title: z.string().min(1, 'Title is required').max(255),
    description: z.string().optional(),
    dueDate: z.date().optional(),
  })
);

const { handleSubmit, errors, defineField } = useForm({
  validationSchema: formSchema,
});

const [title] = defineField('title');
const [description] = defineField('description');
const [dueDate] = defineField('dueDate');

const loading = ref(false);

const onSubmit = handleSubmit(async (values) => {
  loading.value = true;
  try {
    emit('submit', values);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <form @submit.prevent="onSubmit" class="space-y-4">
    <!-- Title -->
    <div class="space-y-2">
      <Label for="title">Title *</Label>
      <Input
        id="title"
        v-model="title"
        placeholder="Enter project title"
        :disabled="loading"
      />
      <p v-if="errors.title" class="text-sm text-destructive">
        {{ errors.title }}
      </p>
    </div>

    <!-- Description -->
    <div class="space-y-2">
      <Label for="description">Description</Label>
      <Textarea
        id="description"
        v-model="description"
        placeholder="Describe your project..."
        rows="4"
        :disabled="loading"
      />
    </div>

    <!-- Due Date -->
    <div class="space-y-2">
      <Label for="dueDate">Due Date</Label>
      <Input
        id="dueDate"
        v-model="dueDate"
        type="date"
        :disabled="loading"
      />
    </div>

    <!-- Actions -->
    <div class="flex justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        @click="emit('cancel')"
        :disabled="loading"
      >
        Cancel
      </Button>
      <Button type="submit" :disabled="loading">
        {{ loading ? 'Creating...' : 'Create Project' }}
      </Button>
    </div>
  </form>
</template>
```

---

## 🔧 Composable Templates

### 1. Basic CRUD Composable
```typescript
// composables/useProject.ts
import { ref } from 'vue';
import { useProjectStore } from '../stores/projectStore';
import type { CreateProjectDTO, Project } from '@core/types/project';

export function useProject() {
  const store = useProjectStore();
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function createProject(data: CreateProjectDTO): Promise<Project | null> {
    loading.value = true;
    error.value = null;
    try {
      const project = await store.createProject(data);
      return project;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error';
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function updateProject(id: number, data: Partial<Project>): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      await store.updateProject(id, data);
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error';
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function deleteProject(id: number): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      await store.deleteProject(id);
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error';
      return false;
    } finally {
      loading.value = false;
    }
  }

  return {
    loading,
    error,
    createProject,
    updateProject,
    deleteProject,
  };
}
```

### 2. Form Composable
```typescript
// composables/useProjectForm.ts
import { ref, computed } from 'vue';
import type { CreateProjectDTO } from '@core/types/project';

export function useProjectForm() {
  const formData = ref<CreateProjectDTO>({
    title: '',
    description: '',
  });

  const errors = ref<Record<string, string>>({});

  const isValid = computed(() => {
    return formData.value.title.length > 0 && Object.keys(errors.value).length === 0;
  });

  function validate() {
    errors.value = {};

    if (!formData.value.title) {
      errors.value.title = 'Title is required';
    } else if (formData.value.title.length > 255) {
      errors.value.title = 'Title must be less than 255 characters';
    }

    return isValid.value;
  }

  function reset() {
    formData.value = {
      title: '',
      description: '',
    };
    errors.value = {};
  }

  return {
    formData,
    errors,
    isValid,
    validate,
    reset,
  };
}
```

---

## 🗄️ Pinia Store Template

```typescript
// stores/projectStore.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Project, CreateProjectDTO } from '@core/types/project';

export const useProjectStore = defineStore('projects', () => {
  // State
  const projects = ref<Project[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const selectedProjectId = ref<number | null>(null);

  // Getters
  const selectedProject = computed(() =>
    projects.value.find((p) => p.id === selectedProjectId.value)
  );

  const activeProjects = computed(() =>
    projects.value.filter((p) => p.status !== 'archived')
  );

  const archivedProjects = computed(() =>
    projects.value.filter((p) => p.status === 'archived')
  );

  const projectCount = computed(() => projects.value.length);

  // Actions
  async function fetchProjects() {
    loading.value = true;
    error.value = null;
    try {
      projects.value = await window.electron.projects.list();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch projects';
      console.error('Failed to fetch projects:', e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchProjectById(id: number) {
    loading.value = true;
    error.value = null;
    try {
      const project = await window.electron.projects.get(id);
      // Update in local state
      const index = projects.value.findIndex((p) => p.id === id);
      if (index !== -1) {
        projects.value[index] = project;
      } else {
        projects.value.push(project);
      }
      return project;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch project';
      console.error('Failed to fetch project:', e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function createProject(data: CreateProjectDTO): Promise<Project> {
    loading.value = true;
    error.value = null;
    try {
      const newProject = await window.electron.projects.create(data);
      projects.value.push(newProject);
      return newProject;
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create project';
      console.error('Failed to create project:', e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateProject(id: number, data: Partial<Project>): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const updated = await window.electron.projects.update(id, data);
      const index = projects.value.findIndex((p) => p.id === id);
      if (index !== -1) {
        projects.value[index] = updated;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to update project';
      console.error('Failed to update project:', e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function deleteProject(id: number): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await window.electron.projects.delete(id);
      projects.value = projects.value.filter((p) => p.id !== id);
      if (selectedProjectId.value === id) {
        selectedProjectId.value = null;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to delete project';
      console.error('Failed to delete project:', e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function selectProject(id: number | null) {
    selectedProjectId.value = id;
  }

  function clearError() {
    error.value = null;
  }

  return {
    // State
    projects,
    loading,
    error,
    selectedProjectId,
    // Getters
    selectedProject,
    activeProjects,
    archivedProjects,
    projectCount,
    // Actions
    fetchProjects,
    fetchProjectById,
    createProject,
    updateProject,
    deleteProject,
    selectProject,
    clearError,
  };
});
```

---

## 🔌 Electron IPC Templates

### 1. Preload API
```typescript
// electron/preload/api/{feature}.ts
import { ipcRenderer } from 'electron';
import type { Project, CreateProjectDTO } from '@core/types/project';

export const projectsAPI = {
  list: () => ipcRenderer.invoke('projects:list') as Promise<Project[]>,

  get: (id: number) =>
    ipcRenderer.invoke('projects:get', id) as Promise<Project>,

  create: (data: CreateProjectDTO) =>
    ipcRenderer.invoke('projects:create', data) as Promise<Project>,

  update: (id: number, data: Partial<Project>) =>
    ipcRenderer.invoke('projects:update', id, data) as Promise<Project>,

  delete: (id: number) =>
    ipcRenderer.invoke('projects:delete', id) as Promise<void>,

  // Event listeners
  onProjectCreated: (callback: (project: Project) => void) => {
    ipcRenderer.on('project:created', (_, project) => callback(project));
    return () => ipcRenderer.removeAllListeners('project:created');
  },
};
```

### 2. Main Process Handlers
```typescript
// electron/main/ipc/project-handlers.ts
import { ipcMain } from 'electron';
import { projectRepository } from '../database/repositories/project-repository';
import type { CreateProjectDTO } from '@core/types/project';
import { z } from 'zod';

const CreateProjectSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  dueDate: z.date().optional(),
});

export function registerProjectHandlers() {
  ipcMain.handle('projects:list', async () => {
    try {
      return await projectRepository.findAll();
    } catch (error) {
      console.error('Failed to list projects:', error);
      throw new Error('Failed to retrieve projects');
    }
  });

  ipcMain.handle('projects:get', async (event, id: number) => {
    try {
      const project = await projectRepository.findById(id);
      if (!project) {
        throw new Error('Project not found');
      }
      return project;
    } catch (error) {
      console.error('Failed to get project:', error);
      throw error;
    }
  });

  ipcMain.handle('projects:create', async (event, data: CreateProjectDTO) => {
    try {
      // Validate input
      const validated = CreateProjectSchema.parse(data);

      // Create project
      const project = await projectRepository.create(validated);

      // Broadcast to all windows
      event.sender.send('project:created', project);

      return project;
    } catch (error) {
      console.error('Failed to create project:', error);
      throw error instanceof z.ZodError
        ? new Error('Invalid project data')
        : error;
    }
  });

  ipcMain.handle('projects:update', async (event, id: number, data: Partial<CreateProjectDTO>) => {
    try {
      const project = await projectRepository.update(id, data);
      event.sender.send('project:updated', project);
      return project;
    } catch (error) {
      console.error('Failed to update project:', error);
      throw error;
    }
  });

  ipcMain.handle('projects:delete', async (event, id: number) => {
    try {
      await projectRepository.delete(id);
      event.sender.send('project:deleted', id);
    } catch (error) {
      console.error('Failed to delete project:', error);
      throw error;
    }
  });
}
```

---

## 🗃️ Drizzle Repository Template

```typescript
// electron/main/database/repositories/project-repository.ts
import { db } from '../client';
import { projects, type Project, type NewProject } from '../schema';
import { eq, desc, and, like } from 'drizzle-orm';

export class ProjectRepository {
  /**
   * Find all projects
   */
  async findAll(): Promise<Project[]> {
    return await db
      .select()
      .from(projects)
      .orderBy(desc(projects.updatedAt));
  }

  /**
   * Find project by ID
   */
  async findById(id: number): Promise<Project | undefined> {
    const result = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    return result[0];
  }

  /**
   * Find projects by status
   */
  async findByStatus(status: string): Promise<Project[]> {
    return await db
      .select()
      .from(projects)
      .where(eq(projects.status, status))
      .orderBy(desc(projects.updatedAt));
  }

  /**
   * Search projects by title
   */
  async search(query: string): Promise<Project[]> {
    return await db
      .select()
      .from(projects)
      .where(like(projects.title, `%${query}%`))
      .orderBy(desc(projects.updatedAt));
  }

  /**
   * Create new project
   */
  async create(data: NewProject): Promise<Project> {
    const result = await db
      .insert(projects)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    return result[0]!;
  }

  /**
   * Update existing project
   */
  async update(id: number, data: Partial<Project>): Promise<Project> {
    const result = await db
      .update(projects)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, id))
      .returning();

    if (!result[0]) {
      throw new Error('Project not found');
    }

    return result[0];
  }

  /**
   * Delete project
   */
  async delete(id: number): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }

  /**
   * Archive project
   */
  async archive(id: number): Promise<Project> {
    return await this.update(id, { status: 'archived' });
  }

  /**
   * Count projects by status
   */
  async countByStatus(status: string): Promise<number> {
    const result = await db
      .select({ count: sql`count(*)` })
      .from(projects)
      .where(eq(projects.status, status));
    return Number(result[0]?.count || 0);
  }
}

export const projectRepository = new ProjectRepository();
```

---

## 📝 Type Definition Template

```typescript
// src/core/types/project.ts

// Base project type (from Drizzle schema)
export interface Project {
  id: number;
  title: string;
  description?: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
  dueDate?: Date;
}

// Status enum
export type ProjectStatus = 'active' | 'archived' | 'completed';

// DTOs (Data Transfer Objects)
export interface CreateProjectDTO {
  title: string;
  description?: string;
  dueDate?: Date;
}

export interface UpdateProjectDTO extends Partial<CreateProjectDTO> {
  status?: ProjectStatus;
}

// View models (with computed properties)
export interface ProjectViewModel extends Project {
  taskCount: number;
  completedTaskCount: number;
  progress: number; // 0-100
  isOverdue: boolean;
}

// Filters
export interface ProjectFilters {
  status?: ProjectStatus[];
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

// Sort options
export type ProjectSortField = 'title' | 'createdAt' | 'updatedAt' | 'dueDate';
export type SortOrder = 'asc' | 'desc';

export interface ProjectSortOptions {
  field: ProjectSortField;
  order: SortOrder;
}
```

---

## 🧪 Test Template

```typescript
// __tests__/projectStore.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useProjectStore } from '../stores/projectStore';
import type { Project } from '@core/types/project';

// Mock Electron API
const mockProjects: Project[] = [
  {
    id: 1,
    title: 'Test Project',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

vi.stubGlobal('window', {
  electron: {
    projects: {
      list: vi.fn().mockResolvedValue(mockProjects),
      create: vi.fn().mockImplementation((data) =>
        Promise.resolve({
          id: Date.now(),
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      ),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
});

describe('Project Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('fetchProjects', () => {
    it('should fetch and store projects', async () => {
      const store = useProjectStore();
      await store.fetchProjects();

      expect(store.projects).toHaveLength(1);
      expect(store.projects[0].title).toBe('Test Project');
    });

    it('should handle errors', async () => {
      const store = useProjectStore();
      window.electron.projects.list = vi.fn().mockRejectedValue(new Error('Network error'));

      await store.fetchProjects();

      expect(store.error).toBeTruthy();
      expect(store.projects).toHaveLength(0);
    });
  });

  describe('createProject', () => {
    it('should create and add project', async () => {
      const store = useProjectStore();
      const newProject = await store.createProject({
        title: 'New Project',
        description: 'Test',
      });

      expect(newProject.title).toBe('New Project');
      expect(store.projects).toHaveLength(1);
    });
  });

  describe('getters', () => {
    it('should filter active projects', async () => {
      const store = useProjectStore();
      store.projects = [
        { id: 1, title: 'Active', status: 'active' } as Project,
        { id: 2, title: 'Archived', status: 'archived' } as Project,
      ];

      expect(store.activeProjects).toHaveLength(1);
      expect(store.activeProjects[0].title).toBe('Active');
    });
  });
});
```

---

## 📋 Quick Reference

### When to use each template:

| Need | Template | Section |
|------|----------|---------|
| New feature module | Feature Module Template | Top |
| Display list of items | List Component | Vue Components #1 |
| Show item card | Card Component | Vue Components #2 |
| Create/edit form | Form Component | Vue Components #3 |
| Reusable logic | CRUD Composable | Composables #1 |
| State management | Pinia Store | Pinia Store |
| IPC communication | IPC Templates | Electron IPC |
| Database access | Repository | Drizzle Repository |
| Type definitions | Type Template | Type Definition |
| Unit tests | Test Template | Test Template |

---

**Usage**: Copy template → Replace `{feature}` with your feature name → Customize as needed
