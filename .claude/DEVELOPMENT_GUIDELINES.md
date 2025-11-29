# Development Guidelines for AI Workflow Manager

> **Critical Reference**: Claude Code must follow these guidelines for ALL code generation and modifications

---

## 🎯 Project Context

**Project Name**: AI Workflow Manager
**Type**: Desktop Application (Electron)
**Tech Stack**: Electron + Vue 3 + TypeScript + Drizzle ORM + SQLite
**Architecture**: Monolithic Modular
**Target Platforms**: Windows, macOS, Linux

---

## 📐 Architecture Principles

### 1. Module Boundaries
```
✅ DO: Keep features isolated in separate modules
✅ DO: Use shared code via @shared and @core aliases
❌ DON'T: Import directly between feature modules
❌ DON'T: Create circular dependencies
```

### 2. File Organization Pattern
```typescript
// Feature module structure (always follow this)
src/renderer/modules/{feature}/
├── components/           // UI components (Vue SFCs)
│   ├── {Feature}List.vue
│   ├── {Feature}Card.vue
│   └── {Feature}Form.vue
├── composables/          // Reusable logic
│   ├── use{Feature}.ts
│   └── use{Feature}Form.ts
├── stores/               // Pinia stores
│   └── {feature}Store.ts
├── types.ts              // Module-specific types
└── index.ts              // Public API exports
```

### 3. Import Aliases (ALWAYS USE)
```typescript
// ✅ CORRECT - Use path aliases
import { Button } from '@/shared/components/ui/button.vue';
import { useProject } from '@modules/projects/composables/useProject';
import { ProjectRepository } from '@core/database/repositories/project-repository';

// ❌ WRONG - Relative paths
import { Button } from '../../../shared/components/ui/button.vue';
import { useProject } from '../../projects/composables/useProject';
```

---

## 🔧 TypeScript Standards

### 1. Strict Type Safety (NON-NEGOTIABLE)
```typescript
// ✅ DO: Explicit types for all public APIs
export interface CreateProjectDTO {
  title: string;
  description?: string;
  dueDate?: Date;
}

export function createProject(data: CreateProjectDTO): Promise<Project> {
  // Implementation
}

// ❌ DON'T: Use 'any' or implicit types
export function createProject(data: any) { // ❌
  // Implementation
}
```

### 2. Type Inference (When Appropriate)
```typescript
// ✅ DO: Let TypeScript infer simple types
const count = ref(0); // Type inferred as Ref<number>
const name = 'John';  // Type inferred as string

// ✅ DO: Explicit types for complex objects
const user: User = {
  id: 1,
  name: 'John',
  email: 'john@example.com',
};
```

### 3. Enum vs Union Types
```typescript
// ✅ PREFER: Union types (better tree-shaking)
export type TaskStatus = 'todo' | 'in_progress' | 'done';

// ⚠️ USE SPARINGLY: Enums (only for numeric values)
export enum Priority {
  Low = 1,
  Medium = 2,
  High = 3,
}
```

### 4. Null Safety
```typescript
// ✅ DO: Use optional chaining and nullish coalescing
const userName = user?.profile?.name ?? 'Anonymous';

// ❌ DON'T: Manual null checks
const userName = user && user.profile && user.profile.name
  ? user.profile.name
  : 'Anonymous';
```

---

## 🎨 Vue 3 Conventions

### 1. Composition API (REQUIRED)
```vue
<!-- ✅ DO: Use <script setup> with Composition API -->
<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Project } from '@core/types/project';

const props = defineProps<{
  project: Project;
}>();

const emit = defineEmits<{
  update: [project: Project];
  delete: [id: number];
}>();

const isCompleted = computed(() => props.project.status === 'done');

function handleUpdate() {
  emit('update', props.project);
}
</script>

<!-- ❌ DON'T: Use Options API -->
<script lang="ts">
export default {
  props: ['project'], // ❌ No type safety
  methods: {
    handleUpdate() { }
  }
}
</script>
```

### 2. Component Naming
```typescript
// ✅ DO: PascalCase for components, descriptive names
ProjectCard.vue
TaskListItem.vue
AIPromptModal.vue

// ❌ DON'T: Generic names, kebab-case files
Card.vue           // Too generic
task-list-item.vue // Wrong case
```

### 3. Props Definition (Type-Safe)
```typescript
// ✅ DO: TypeScript interface for props
interface Props {
  project: Project;
  readonly?: boolean;
  onUpdate?: (project: Project) => void;
}

const props = withDefaults(defineProps<Props>(), {
  readonly: false,
});

// ❌ DON'T: Runtime-only props
const props = defineProps({
  project: Object, // No type safety!
});
```

### 4. Emits Definition (Type-Safe)
```typescript
// ✅ DO: Typed emits
const emit = defineEmits<{
  update: [project: Project];
  'status-change': [status: TaskStatus, id: number];
}>();

// Usage
emit('update', updatedProject);
emit('status-change', 'done', 123);

// ❌ DON'T: Untyped emits
const emit = defineEmits(['update', 'statusChange']); // No type checking
```

### 5. Template Refs
```typescript
// ✅ DO: Typed refs
const inputRef = ref<HTMLInputElement | null>(null);
const modalRef = ref<InstanceType<typeof Modal> | null>(null);

onMounted(() => {
  inputRef.value?.focus(); // Type-safe
});

// ❌ DON'T: Untyped refs
const inputRef = ref(null); // Type unknown
```

---

## 🗄️ Pinia Store Patterns

### 1. Store Structure (Standard Template)
```typescript
// stores/{feature}Store.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Project } from '@core/types/project';

export const useProjectStore = defineStore('projects', () => {
  // State
  const projects = ref<Project[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Getters
  const activeProjects = computed(() =>
    projects.value.filter((p) => p.status !== 'archived')
  );

  // Actions
  async function fetchProjects() {
    loading.value = true;
    error.value = null;
    try {
      // IPC call or API call
      projects.value = await window.electron.projects.list();
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      loading.value = false;
    }
  }

  async function createProject(data: CreateProjectDTO): Promise<Project> {
    const newProject = await window.electron.projects.create(data);
    projects.value.push(newProject);
    return newProject;
  }

  // Return public API
  return {
    // State
    projects,
    loading,
    error,
    // Getters
    activeProjects,
    // Actions
    fetchProjects,
    createProject,
  };
});
```

### 2. Store Usage in Components
```typescript
// ✅ DO: Destructure with storeToRefs
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@modules/projects/stores/projectStore';

const projectStore = useProjectStore();
const { projects, loading } = storeToRefs(projectStore); // Reactive
const { fetchProjects } = projectStore; // Actions (no storeToRefs)

// ❌ DON'T: Direct destructure (loses reactivity)
const { projects, loading } = useProjectStore(); // ❌ Not reactive!
```

---

## 🔌 Electron IPC Patterns

### 1. Preload API Definition
```typescript
// electron/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { CreateProjectDTO, Project } from '@core/types/project';

const api = {
  projects: {
    list: () => ipcRenderer.invoke('projects:list') as Promise<Project[]>,
    get: (id: number) => ipcRenderer.invoke('projects:get', id) as Promise<Project>,
    create: (data: CreateProjectDTO) =>
      ipcRenderer.invoke('projects:create', data) as Promise<Project>,
    update: (id: number, data: Partial<Project>) =>
      ipcRenderer.invoke('projects:update', id, data) as Promise<Project>,
    delete: (id: number) => ipcRenderer.invoke('projects:delete', id) as Promise<void>,
  },
};

contextBridge.exposeInMainWorld('electron', api);

// Type declaration
declare global {
  interface Window {
    electron: typeof api;
  }
}
```

### 2. Main Process Handlers
```typescript
// electron/main/ipc/project-handlers.ts
import { ipcMain } from 'electron';
import { projectRepository } from '../database/repositories/project-repository';
import type { CreateProjectDTO } from '@core/types/project';

export function registerProjectHandlers() {
  ipcMain.handle('projects:list', async () => {
    return await projectRepository.findAll();
  });

  ipcMain.handle('projects:create', async (event, data: CreateProjectDTO) => {
    // Validate input
    if (!data.title) {
      throw new Error('Project title is required');
    }
    return await projectRepository.create(data);
  });

  // More handlers...
}
```

### 3. Error Handling (IPC)
```typescript
// ✅ DO: Proper error handling
async function createProject(data: CreateProjectDTO) {
  try {
    return await window.electron.projects.create(data);
  } catch (error) {
    // Log to console (will appear in DevTools)
    console.error('Failed to create project:', error);
    // Show user-friendly error
    throw new Error('Could not create project. Please try again.');
  }
}

// ❌ DON'T: Silent failures
async function createProject(data: CreateProjectDTO) {
  const result = await window.electron.projects.create(data);
  return result; // No error handling!
}
```

---

## 🗃️ Drizzle ORM Conventions

### 1. Schema Definition
```typescript
// electron/main/database/schema.ts
import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// Type inference
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
```

### 2. Repository Pattern (REQUIRED)
```typescript
// electron/main/database/repositories/project-repository.ts
import { db } from '../client';
import { projects, type Project, type NewProject } from '../schema';
import { eq, desc } from 'drizzle-orm';

export class ProjectRepository {
  async findAll(): Promise<Project[]> {
    return await db
      .select()
      .from(projects)
      .orderBy(desc(projects.updatedAt));
  }

  async findById(id: number): Promise<Project | undefined> {
    const result = await db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    return result[0];
  }

  async create(data: NewProject): Promise<Project> {
    const result = await db.insert(projects).values(data).returning();
    return result[0]!;
  }

  async update(id: number, data: Partial<Project>): Promise<Project> {
    const result = await db
      .update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return result[0]!;
  }

  async delete(id: number): Promise<void> {
    await db.delete(projects).where(eq(projects.id, id));
  }
}

export const projectRepository = new ProjectRepository();
```

### 3. Database Client
```typescript
// electron/main/database/client.ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';
import * as schema from './schema';

const dbPath = path.join(
  app.getPath('userData'),
  'workflow-manager.db'
);

const sqlite = new Database(dbPath);
// Enable WAL mode for better concurrency
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });
```

---

## 🎨 UI Component Patterns

### 1. Shadcn-vue Component Usage
```vue
<!-- ✅ DO: Import from @/shared/components/ui -->
<script setup lang="ts">
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogContent, DialogHeader } from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
</script>

<template>
  <Dialog>
    <DialogContent>
      <DialogHeader>Create Project</DialogHeader>
      <Input v-model="title" placeholder="Project title" />
      <Button @click="handleCreate">Create</Button>
    </DialogContent>
  </Dialog>
</template>
```

### 2. TailwindCSS Class Ordering
```vue
<!-- ✅ DO: Follow this order (use Prettier Tailwind plugin) -->
<div
  class="
    flex flex-col items-center justify-center
    w-full max-w-md h-screen
    p-4 m-auto
    bg-white dark:bg-gray-900
    rounded-lg shadow-lg
    border border-gray-200
    hover:shadow-xl
    transition-all duration-200
  "
>
  <!-- Content -->
</div>

<!-- ⚠️ BETTER: Use cn() helper for conditional classes -->
<script setup lang="ts">
import { cn } from '@/shared/utils/cn';

const isActive = ref(false);
</script>

<template>
  <div :class="cn('base-class', isActive && 'active-class')">
    Content
  </div>
</template>
```

### 3. Composables for Logic Reuse
```typescript
// composables/useProject.ts
import { ref, computed } from 'vue';
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

  return {
    loading,
    error,
    createProject,
  };
}
```

---

## 🤖 AI Integration Patterns

### 1. AI Agent Usage (Vercel AI SDK)
```typescript
// src/core/ai/agents/openai-agent.ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import type { ProjectGenerationPrompt } from '../types';

export async function generateProject(prompt: ProjectGenerationPrompt) {
  const result = await streamText({
    model: openai('gpt-4-turbo'),
    system: 'You are a project management AI assistant...',
    prompt: prompt.description,
    temperature: 0.7,
    maxTokens: 2000,
  });

  // Stream handling
  let fullText = '';
  for await (const chunk of result.textStream) {
    fullText += chunk;
    // Emit progress event
  }

  // Parse structured output
  return parseProjectResponse(fullText);
}
```

### 2. Cost Tracking (MANDATORY)
```typescript
// src/core/ai/cost-tracker.ts
import { db } from '@electron/main/database/client';
import { aiUsage } from '@electron/main/database/schema';

export async function trackAIUsage(data: {
  provider: 'openai' | 'anthropic' | 'google';
  model: string;
  promptTokens: number;
  completionTokens: number;
  projectId?: number;
}) {
  const cost = calculateCost(data.provider, data.model, data.promptTokens, data.completionTokens);

  await db.insert(aiUsage).values({
    ...data,
    totalCost: cost,
    timestamp: new Date(),
  });
}

function calculateCost(
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  // Pricing as of 2025
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4-turbo': { input: 0.01 / 1000, output: 0.03 / 1000 },
    'claude-3-5-sonnet': { input: 0.003 / 1000, output: 0.015 / 1000 },
  };

  const rates = pricing[model] || { input: 0, output: 0 };
  return promptTokens * rates.input + completionTokens * rates.output;
}
```

---

## 🧪 Testing Standards

### 1. Unit Tests (Vitest)
```typescript
// __tests__/projectStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useProjectStore } from '../stores/projectStore';

describe('Project Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should create a project', async () => {
    const store = useProjectStore();
    const project = await store.createProject({
      title: 'Test Project',
      description: 'Test description',
    });

    expect(project).toBeDefined();
    expect(project.title).toBe('Test Project');
    expect(store.projects).toHaveLength(1);
  });

  it('should handle errors gracefully', async () => {
    const store = useProjectStore();
    // Mock IPC to throw error
    window.electron.projects.create = async () => {
      throw new Error('Network error');
    };

    await expect(store.createProject({ title: '' })).rejects.toThrow();
  });
});
```

### 2. Component Tests
```typescript
// __tests__/ProjectCard.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ProjectCard from '../components/ProjectCard.vue';

describe('ProjectCard', () => {
  it('should render project title', () => {
    const wrapper = mount(ProjectCard, {
      props: {
        project: {
          id: 1,
          title: 'Test Project',
          status: 'active',
        },
      },
    });

    expect(wrapper.text()).toContain('Test Project');
  });

  it('should emit delete event', async () => {
    const wrapper = mount(ProjectCard, {
      props: { project: { id: 1, title: 'Test' } },
    });

    await wrapper.find('[data-testid="delete-btn"]').trigger('click');
    expect(wrapper.emitted('delete')).toBeTruthy();
  });
});
```

---

## 🔒 Security Best Practices

### 1. API Key Storage (CRITICAL)
```typescript
// ✅ DO: Use OS keychain (via electron-store or keytar)
import Store from 'electron-store';

const store = new Store({
  encryptionKey: 'your-encryption-key', // Derive from machine ID
});

// Store API key
store.set('openai.apiKey', userInput);

// Retrieve API key
const apiKey = store.get('openai.apiKey');

// ❌ DON'T: Store in plain text files or localStorage
localStorage.setItem('apiKey', key); // ❌ NEVER DO THIS
```

### 2. IPC Validation
```typescript
// ✅ DO: Validate all IPC inputs
import { z } from 'zod';

const CreateProjectSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  dueDate: z.date().optional(),
});

ipcMain.handle('projects:create', async (event, data) => {
  // Validate
  const validated = CreateProjectSchema.parse(data);
  return await projectRepository.create(validated);
});

// ❌ DON'T: Trust IPC input blindly
ipcMain.handle('projects:create', async (event, data) => {
  return await projectRepository.create(data); // ❌ No validation!
});
```

---

## 📝 Code Comments Guidelines

### 1. When to Comment
```typescript
// ✅ DO: Comment "why", not "what"
// Use exponential backoff to avoid rate limiting from AI providers
const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
await sleep(delay);

// ❌ DON'T: State the obvious
// Set count to 0
const count = 0;
```

### 2. TSDoc for Public APIs
```typescript
/**
 * Creates a new project with AI-generated tasks
 *
 * @param prompt - Natural language description of the project
 * @param options - Generation options (model, temperature, etc.)
 * @returns The created project with generated tasks
 * @throws {ValidationError} If prompt is empty or invalid
 * @throws {AIProviderError} If AI API call fails
 *
 * @example
 * ```ts
 * const project = await generateProject({
 *   description: 'Build a blog with Next.js',
 *   model: 'gpt-4-turbo'
 * });
 * ```
 */
export async function generateProject(
  prompt: ProjectGenerationPrompt,
  options?: GenerationOptions
): Promise<Project> {
  // Implementation
}
```

---

## 🚀 Performance Optimization

### 1. Lazy Loading (Components)
```typescript
// ✅ DO: Lazy load heavy components
const MonacoEditor = defineAsyncComponent(() =>
  import('@/shared/components/MonacoEditor.vue')
);

// ✅ DO: Lazy load entire modules
const routes = [
  {
    path: '/projects',
    component: () => import('@modules/projects/views/ProjectsView.vue'),
  },
];
```

### 2. Virtual Scrolling (Large Lists)
```vue
<!-- ✅ DO: Use virtual scroller for 100+ items -->
<script setup lang="ts">
import { RecycleScroller } from 'vue-virtual-scroller';
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css';
</script>

<template>
  <RecycleScroller
    :items="tasks"
    :item-size="80"
    key-field="id"
  >
    <template #default="{ item }">
      <TaskCard :task="item" />
    </template>
  </RecycleScroller>
</template>
```

### 3. Debounce/Throttle (User Input)
```typescript
// ✅ DO: Debounce search input
import { useDebounceFn } from '@vueuse/core';

const searchQuery = ref('');
const debouncedSearch = useDebounceFn((query: string) => {
  // Perform search
  performSearch(query);
}, 300);

watch(searchQuery, (newQuery) => {
  debouncedSearch(newQuery);
});
```

---

## 📋 Git Commit Conventions

### 1. Commit Message Format
```
type(scope): subject

body (optional)

footer (optional)
```

### 2. Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `test`: Add or update tests
- `chore`: Build, dependencies, tooling

### 3. Examples
```bash
feat(projects): add AI project generation

Integrate OpenAI API to generate project structure from natural language prompts.
Includes cost tracking and error handling.

Closes #123

---

fix(kanban): resolve drag-and-drop z-index issue

Tasks were appearing behind columns during drag. Updated z-index hierarchy.

---

refactor(stores): migrate to Composition API pattern

Convert all stores to use setup() syntax for better type inference.
```

---

## 🎯 CRITICAL RULES (NEVER VIOLATE)

### ❌ NEVER DO THIS
1. **Don't use `any` type** - Always provide explicit types
2. **Don't bypass type checks** - No `@ts-ignore` or `as any`
3. **Don't store secrets in code** - Use OS keychain or .env
4. **Don't create circular dependencies** - Keep module boundaries clear
5. **Don't skip error handling** - Always try/catch IPC and API calls
6. **Don't use Options API** - Always use Composition API
7. **Don't hardcode strings** - Use constants or i18n
8. **Don't commit console.log** - Use proper logging utility
9. **Don't mutate props** - Always emit events
10. **Don't forget accessibility** - Use semantic HTML and ARIA

### ✅ ALWAYS DO THIS
1. **Always use TypeScript strict mode**
2. **Always validate user input**
3. **Always handle errors gracefully**
4. **Always use path aliases** (@/, @core/, etc.)
5. **Always follow repository pattern** for data access
6. **Always track AI costs** in database
7. **Always write tests** for critical logic
8. **Always use Composition API** with `<script setup>`
9. **Always document public APIs** with TSDoc
10. **Always check performance** for large lists (use virtual scrolling)

---

## 🤖 AI Assistant Instructions (For Claude Code)

When generating code for this project:

1. **Check this file FIRST** before writing any code
2. **Follow all patterns** exactly as shown
3. **Use path aliases** instead of relative imports
4. **Generate types** for all data structures
5. **Include error handling** in all async operations
6. **Add comments** for complex logic only
7. **Write tests** for new features
8. **Update relevant documentation** if adding new patterns
9. **Ask for clarification** if requirements are ambiguous
10. **Reference specific sections** of this guide in responses

### Example Response Format
```
I'll create a new project form component following the Vue 3 Composition API
pattern (see section "Vue 3 Conventions" → "Composition API").

The component will:
- Use TypeScript with strict typing
- Follow the module structure pattern
- Include proper error handling
- Use Shadcn-vue UI components

[Code generation]
```

---

## 📚 Reference Checklist

Before committing code, verify:

- [ ] No TypeScript errors (`pnpm type-check`)
- [ ] No ESLint errors (`pnpm lint`)
- [ ] Formatted with Prettier (`pnpm format`)
- [ ] All imports use path aliases
- [ ] All async operations have error handling
- [ ] All public functions have JSDoc comments
- [ ] All IPC calls are validated
- [ ] AI costs are tracked (if applicable)
- [ ] Tests pass (`pnpm test`)
- [ ] No `console.log` statements
- [ ] No `any` types
- [ ] Commit message follows convention

---

**Last Updated**: 2025-11-24
**Version**: 1.0.0
