# Quick Reference Card

> **One-page cheat sheet for daily development**

---

## 🔥 Most Important Rules

```typescript
✅ ALWAYS DO:
1. Use path aliases (@/, @core/, @modules/)
2. Define TypeScript types for everything
3. Handle errors in all async operations
4. Follow templates from CODE_TEMPLATES.md
5. Use Composition API with <script setup>

❌ NEVER DO:
1. Use 'any' type
2. Skip error handling
3. Use relative imports
4. Bypass type checking
5. Use Options API
```

---

## 📁 Path Aliases

```typescript
@/              → src/renderer/
@core/          → src/core/
@modules/       → src/renderer/modules/
@shared/        → src/renderer/shared/
@electron/      → electron/
```

**Examples**:
```typescript
import { Button } from '@/shared/components/ui/button';
import { useProject } from '@modules/projects/composables/useProject';
import type { Project } from '@core/types/project';
import { projectRepository } from '@electron/main/database/repositories/project-repository';
```

---

## 🎨 Component Pattern

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Project } from '@core/types/project';

// Props (typed)
interface Props {
  project: Project;
  readonly?: boolean;
}
const props = withDefaults(defineProps<Props>(), {
  readonly: false,
});

// Emits (typed)
const emit = defineEmits<{
  update: [project: Project];
  delete: [id: number];
}>();

// State
const isEditing = ref(false);

// Computed
const displayTitle = computed(() => props.project.title.toUpperCase());

// Methods
function handleUpdate() {
  emit('update', props.project);
}
</script>

<template>
  <div>{{ displayTitle }}</div>
</template>
```

---

## 🗄️ Pinia Store Pattern

```typescript
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Project } from '@core/types/project';

export const useProjectStore = defineStore('projects', () => {
  // State
  const projects = ref<Project[]>([]);
  const loading = ref(false);

  // Getters
  const count = computed(() => projects.value.length);

  // Actions
  async function fetchProjects() {
    loading.value = true;
    try {
      projects.value = await window.electron.projects.list();
    } catch (e) {
      console.error(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return { projects, loading, count, fetchProjects };
});
```

---

## 🔌 IPC Pattern

### Preload
```typescript
// electron/preload/api/projects.ts
export const projectsAPI = {
  list: () => ipcRenderer.invoke('projects:list') as Promise<Project[]>,
  create: (data: CreateProjectDTO) =>
    ipcRenderer.invoke('projects:create', data) as Promise<Project>,
};
```

### Main Handler
```typescript
// electron/main/ipc/project-handlers.ts
ipcMain.handle('projects:list', async () => {
  try {
    return await projectRepository.findAll();
  } catch (error) {
    console.error('Failed:', error);
    throw new Error('User-friendly message');
  }
});
```

### Usage in Component
```typescript
// In Vue component or store
const projects = await window.electron.projects.list();
```

---

## 🗃️ Database Pattern

### Schema
```typescript
// electron/main/database/schema.ts
export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
```

### Repository
```typescript
// electron/main/database/repositories/project-repository.ts
export class ProjectRepository {
  async findAll(): Promise<Project[]> {
    return await db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async create(data: NewProject): Promise<Project> {
    const result = await db.insert(projects).values(data).returning();
    return result[0]!;
  }
}

export const projectRepository = new ProjectRepository();
```

---

## 🧪 Test Pattern

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useProjectStore } from '../stores/projectStore';

describe('Project Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('should fetch projects', async () => {
    const store = useProjectStore();
    await store.fetchProjects();

    expect(store.projects).toBeDefined();
    expect(store.loading).toBe(false);
  });
});
```

---

## 📝 Type Definition Pattern

```typescript
// src/core/types/project.ts

// Main type
export interface Project {
  id: number;
  title: string;
  description?: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
}

// Union type (preferred over enum)
export type ProjectStatus = 'active' | 'archived' | 'completed';

// DTO for creation
export interface CreateProjectDTO {
  title: string;
  description?: string;
}

// Partial for updates
export type UpdateProjectDTO = Partial<CreateProjectDTO>;
```

---

## 🎯 Common Commands

```bash
# Development
pnpm dev:electron          # Start app in dev mode
pnpm dev                   # Start Vite only

# Build
pnpm build                 # Build for current platform
pnpm build:mac             # Build for macOS
pnpm build:win             # Build for Windows
pnpm build:linux           # Build for Linux

# Database
pnpm db:generate           # Generate migration
pnpm db:push              # Apply migration
pnpm db:studio            # Open Drizzle Studio

# Code Quality
pnpm type-check           # Check TypeScript
pnpm lint                 # Run ESLint
pnpm format               # Format with Prettier

# Testing
pnpm test                 # Run unit tests
pnpm test --watch         # Watch mode
pnpm test:e2e            # E2E tests
```

---

## 🚨 Error Handling

```typescript
// ✅ CORRECT: Try-catch with user-friendly message
async function createProject(data: CreateProjectDTO) {
  try {
    return await window.electron.projects.create(data);
  } catch (error) {
    console.error('Failed to create project:', error);
    throw new Error('Could not create project. Please try again.');
  }
}

// ❌ WRONG: No error handling
async function createProject(data: CreateProjectDTO) {
  return await window.electron.projects.create(data);
}
```

---

## 🎨 UI Component Usage

```vue
<script setup lang="ts">
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Dialog, DialogContent } from '@/shared/components/ui/dialog';
import { Card, CardHeader, CardContent } from '@/shared/components/ui/card';
</script>

<template>
  <Card>
    <CardHeader>Title</CardHeader>
    <CardContent>
      <Input v-model="text" placeholder="Enter text" />
      <Button @click="handleClick">Submit</Button>
    </CardContent>
  </Card>
</template>
```

---

## 🔄 State Management in Components

```typescript
// ✅ CORRECT: Use storeToRefs
import { storeToRefs } from 'pinia';
import { useProjectStore } from '@modules/projects/stores/projectStore';

const store = useProjectStore();
const { projects, loading } = storeToRefs(store); // Reactive
const { fetchProjects } = store; // Actions (no storeToRefs)

// ❌ WRONG: Direct destructure
const { projects, loading } = useProjectStore(); // Not reactive!
```

---

## 📋 Pre-Commit Checklist

```
Before committing:
□ No TypeScript errors (pnpm type-check)
□ No ESLint errors (pnpm lint)
□ Formatted (pnpm format)
□ All imports use path aliases
□ Error handling in all async operations
□ No 'any' types
□ No console.log
□ Tests pass (pnpm test)
□ Follows templates from CODE_TEMPLATES.md
```

---

## 🎯 Where to Find

| Need | File | Section |
|------|------|---------|
| Vue component template | CODE_TEMPLATES.md | Vue Component Templates |
| Store template | CODE_TEMPLATES.md | Pinia Store Template |
| IPC template | CODE_TEMPLATES.md | Electron IPC Templates |
| Repository template | CODE_TEMPLATES.md | Drizzle Repository |
| TypeScript rules | DEVELOPMENT_GUIDELINES.md | TypeScript Standards |
| Vue conventions | DEVELOPMENT_GUIDELINES.md | Vue 3 Conventions |
| Architecture decisions | ARCHITECTURE.md | ADR sections |
| Project structure | PROJECT_STRUCTURE.md | Directory Layout |

---

## 🔗 Quick Links

**Guidelines**: `.claude/DEVELOPMENT_GUIDELINES.md`
**Templates**: `.claude/CODE_TEMPLATES.md`
**Instructions**: `.claude/CLAUDE_CODE_INSTRUCTIONS.md`
**Architecture**: `ARCHITECTURE.md`
**Roadmap**: `DEVELOPMENT_ROADMAP.md`

---

## 💡 Common Mistakes

1. **Using relative imports**
   - ❌ `import X from '../../../shared/X'`
   - ✅ `import X from '@/shared/X'`

2. **Missing error handling**
   - ❌ `const data = await fetch()`
   - ✅ `try { const data = await fetch() } catch (e) { }`

3. **Using 'any' type**
   - ❌ `const data: any = {}`
   - ✅ `const data: Project = {}`

4. **Options API**
   - ❌ `export default { data() {} }`
   - ✅ `<script setup lang="ts">`

5. **Direct state destructure**
   - ❌ `const { x } = useStore()`
   - ✅ `const { x } = storeToRefs(useStore())`

---

## 🎓 Learning Order

1. Read GETTING_STARTED.md (this tells you what to read)
2. Read DEVELOPMENT_GUIDELINES.md (coding standards)
3. Browse CODE_TEMPLATES.md (copy-paste templates)
4. Start coding with templates
5. Reference QUICK_REFERENCE.md (this file) as needed

---

**Print this page and keep it on your desk! 📄**

**Last Updated**: 2025-11-24
