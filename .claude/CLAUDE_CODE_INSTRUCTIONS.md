# Claude Code Instructions

> **Project-Specific Instructions for AI Assistant**

---

## 🎯 Project Overview

**Name**: AI Workflow Manager
**Purpose**: Desktop application for AI-powered project and task management with real-time collaboration
**Tech Stack**: Electron + Vue 3 + TypeScript + Drizzle ORM + SQLite

---

## 📖 Required Reading Order

When starting any task, ALWAYS read these files in order:

1. **DEVELOPMENT_GUIDELINES.md** (this directory)
    - Architecture principles
    - TypeScript standards
    - Vue 3 conventions
    - Critical rules

2. **CODE_TEMPLATES.md** (this directory)
    - Ready-to-use boilerplates
    - Component patterns
    - Store patterns

3. **PROJECT_STRUCTURE.md** (root)
    - Directory layout
    - Module organization

4. **ARCHITECTURE.md** (root)
    - ADR decisions
    - System design
    - Data flows

---

## 🤖 Code Generation Workflow

### Step 1: Understand Requirements

```
✅ DO:
- Ask clarifying questions if requirements are vague
- Confirm which module the feature belongs to
- Identify dependencies and affected areas
- Check if similar code exists

❌ DON'T:
- Assume requirements
- Start coding immediately
- Skip planning step
```

### Step 2: Reference Documentation

```
Before writing ANY code:
1. Check DEVELOPMENT_GUIDELINES.md for patterns
2. Look for templates in CODE_TEMPLATES.md
3. Review existing code in similar modules
4. Verify no duplicate functionality exists
```

### Step 3: Generate Code

```
✅ Follow these rules:
- Use exact patterns from templates
- Use path aliases (@/, @core/, @modules/)
- Include TypeScript types for everything
- Add error handling to all async operations
- Follow naming conventions exactly
- Include JSDoc comments for public APIs

❌ Never:
- Use 'any' type
- Skip error handling
- Use relative imports
- Violate module boundaries
- Add console.log in production code
```

### Step 4: Verify & Test

```
After generating code:
1. Verify no TypeScript errors
2. Check all imports use path aliases
3. Ensure error handling exists
4. Confirm naming follows conventions
5. Add unit tests for critical logic
6. Update related documentation
```

---

## 🏗️ Feature Development Process

### 1. Creating a New Feature Module

**Example: Adding a "Tags" feature**

```bash
# 1. Create directory structure
src/renderer/modules/tags/
├── components/
│   ├── TagList.vue
│   ├── TagCard.vue
│   └── TagForm.vue
├── composables/
│   └── useTag.ts
├── stores/
│   └── tagStore.ts
├── types.ts
└── index.ts

# 2. Add database schema
electron/main/database/schema.ts
  - Add tags table

# 3. Create repository
electron/main/database/repositories/tag-repository.ts

# 4. Add IPC handlers
electron/main/ipc/tag-handlers.ts

# 5. Add to preload API
electron/preload/api/tags.ts

# 6. Create types
src/core/types/tag.ts

# 7. Write tests
tests/unit/tagStore.test.ts
```

**Steps to follow**:

1. ✅ Copy templates from CODE_TEMPLATES.md
2. ✅ Replace `{feature}` with `tag`
3. ✅ Implement database schema using Drizzle
4. ✅ Create repository with CRUD methods
5. ✅ Add IPC handlers with validation
6. ✅ Create Pinia store
7. ✅ Build Vue components
8. ✅ Write unit tests
9. ✅ Update module index.ts exports

### 2. Adding a Component

**Example: Creating a TaskPrioritySelector component**

```typescript
// 1. Decide location
src/renderer/modules/tasks/components/TaskPrioritySelector.vue

// 2. Check if similar component exists
// Search: grep -r "PrioritySelector" src/

// 3. Use template from CODE_TEMPLATES.md
// Copy "Form Component" template

// 4. Customize for priority selection
<script setup lang="ts">
import { computed } from 'vue';
import type { TaskPriority } from '@core/types/task';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/shared/components/ui/select';

interface Props {
  modelValue: TaskPriority;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: TaskPriority];
}>();

const priorities: { value: TaskPriority; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'text-green-600' },
  { value: 'medium', label: 'Medium', color: 'text-yellow-600' },
  { value: 'high', label: 'High', color: 'text-red-600' },
];
</script>

<template>
  <Select :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <SelectTrigger>
      <SelectValue placeholder="Select priority" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem
        v-for="priority in priorities"
        :key="priority.value"
        :value="priority.value"
      >
        <span :class="priority.color">{{ priority.label }}</span>
      </SelectItem>
    </SelectContent>
  </Select>
</template>
```

### 3. Adding an IPC Handler

**Example: Adding a "duplicate project" endpoint**

```typescript
// 1. Add to preload API
// electron/preload/api/projects.ts
export const projectsAPI = {
  // ... existing methods
  duplicate: (id: number) =>
    ipcRenderer.invoke('projects:duplicate', id) as Promise<Project>,
};

// 2. Add handler in main process
// electron/main/ipc/project-handlers.ts
ipcMain.handle('projects:duplicate', async (event, id: number) => {
  try {
    // Validate ID
    if (!id || id <= 0) {
      throw new Error('Invalid project ID');
    }

    // Get original project
    const original = await projectRepository.findById(id);
    if (!original) {
      throw new Error('Project not found');
    }

    // Create duplicate
    const duplicate = await projectRepository.create({
      title: `${original.title} (Copy)`,
      description: original.description,
      status: 'active',
    });

    // Broadcast event
    event.sender.send('project:created', duplicate);

    return duplicate;
  } catch (error) {
    console.error('Failed to duplicate project:', error);
    throw error;
  }
});

// 3. Add to repository (if needed)
// electron/main/database/repositories/project-repository.ts
async duplicateWithTasks(id: number): Promise<Project> {
  const original = await this.findById(id);
  if (!original) throw new Error('Project not found');

  // Create project
  const duplicate = await this.create({
    title: `${original.title} (Copy)`,
    description: original.description,
  });

  // Copy tasks (if exists)
  // ...

  return duplicate;
}

// 4. Add to store
// stores/projectStore.ts
async function duplicateProject(id: number): Promise<Project> {
  loading.value = true;
  error.value = null;
  try {
    const duplicate = await window.electron.projects.duplicate(id);
    projects.value.push(duplicate);
    return duplicate;
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to duplicate';
    throw e;
  } finally {
    loading.value = false;
  }
}

// 5. Update types if needed
// src/core/types/project.ts
// (usually not needed for duplicates)
```

---

## 🔍 Common Tasks Quick Reference

### Task: Add New Database Table

```typescript
// 1. Define schema
// electron/main/database/schema.ts
export const tags = sqliteTable('tags', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .default(sql`CURRENT_TIMESTAMP`),
});

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

// 2. Generate migration
// Terminal: pnpm db:generate

// 3. Apply migration
// Terminal: pnpm db:push

// 4. Create repository
// electron/main/database/repositories/tag-repository.ts
// (Use repository template from CODE_TEMPLATES.md)
```

### Task: Add API Integration

```typescript
// 1. Create API client
// src/core/api/slack-client.ts
import { WebClient } from '@slack/web-api';

export class SlackClient {
    private client: WebClient;

    constructor(token: string) {
        this.client = new WebClient(token);
    }

    async postMessage(channel: string, text: string) {
        try {
            const result = await this.client.chat.postMessage({
                channel,
                text,
            });
            return result;
        } catch (error) {
            console.error('Failed to post Slack message:', error);
            throw error;
        }
    }
}

// 2. Add to IPC if needed
// electron/main/ipc/slack-handlers.ts
ipcMain.handle('slack:post-message', async (event, channel, text) => {
    const token = await getSlackToken(); // From secure storage
    const client = new SlackClient(token);
    return await client.postMessage(channel, text);
});

// 3. Add to preload
// electron/preload/api/slack.ts
export const slackAPI = {
    postMessage: (channel: string, text: string) =>
        ipcRenderer.invoke('slack:post-message', channel, text),
};
```

### Task: Add Composable for Shared Logic

```typescript
// src/renderer/shared/composables/useDebounce.ts
import { ref, watch } from 'vue';

export function useDebounce<T>(value: Ref<T>, delay: number = 300): Ref<T> {
    const debouncedValue = ref<T>(value.value) as Ref<T>;
    let timeout: NodeJS.Timeout;

    watch(value, (newValue) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            debouncedValue.value = newValue;
        }, delay);
    });

    return debouncedValue;
}

// Usage in component
const searchQuery = ref('');
const debouncedQuery = useDebounce(searchQuery, 500);

watch(debouncedQuery, (query) => {
    performSearch(query);
});
```

---

## 🚫 Common Mistakes to Avoid

### ❌ Mistake 1: Using Relative Imports

```typescript
// ❌ WRONG
import { Button } from '../../../shared/components/ui/button';

// ✅ CORRECT
import { Button } from '@/shared/components/ui/button';
```

### ❌ Mistake 2: Missing Error Handling

```typescript
// ❌ WRONG
async function createProject(data: CreateProjectDTO) {
    const project = await window.electron.projects.create(data);
    return project;
}

// ✅ CORRECT
async function createProject(data: CreateProjectDTO) {
    try {
        const project = await window.electron.projects.create(data);
        return project;
    } catch (error) {
        console.error('Failed to create project:', error);
        throw new Error('Could not create project. Please try again.');
    }
}
```

### ❌ Mistake 3: Not Using TypeScript Types

```typescript
// ❌ WRONG
const props = defineProps({
    project: Object,
});

// ✅ CORRECT
interface Props {
    project: Project;
}
const props = defineProps<Props>();
```

### ❌ Mistake 4: Direct State Mutation

```typescript
// ❌ WRONG (in Pinia store)
function addProject(project: Project) {
    projects.push(project); // Direct mutation
}

// ✅ CORRECT
function addProject(project: Project) {
    projects.value.push(project); // Use .value
}
```

### ❌ Mistake 5: Not Tracking AI Costs

```typescript
// ❌ WRONG
const result = await generateProject(prompt);
return result;

// ✅ CORRECT
const result = await generateProject(prompt);

// Track usage
await trackAIUsage({
    provider: 'openai',
    model: 'gpt-4-turbo',
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    projectId: currentProjectId,
});

return result;
```

---

## 🧪 Testing Guidelines

### When to Write Tests

**ALWAYS test**:

- Store actions (CRUD operations)
- Composables with complex logic
- Utility functions
- IPC handlers (mock Electron API)

**Optional tests**:

- Simple UI components (< 20 lines)
- Type definitions
- Getters/computed properties

### Test Structure

```typescript
describe('Feature Name', () => {
    beforeEach(() => {
        // Setup
    });

    describe('specific functionality', () => {
        it('should do something specific', () => {
            // Arrange
            const input = {
                /* ... */
            };

            // Act
            const result = doSomething(input);

            // Assert
            expect(result).toBe(expected);
        });

        it('should handle errors gracefully', () => {
            // Test error cases
        });
    });
});
```

---

## 📝 Documentation Standards

### When to Update Documentation

**Update immediately when**:

- Adding new feature module → Update PROJECT_STRUCTURE.md
- Making architectural decision → Add ADR to ARCHITECTURE.md
- Adding new pattern → Update DEVELOPMENT_GUIDELINES.md or CODE_TEMPLATES.md
- Changing API → Update API.md (when created)

### Documentation Format

```markdown
## Feature Name

### Overview

Brief description of what it does

### Usage

Code examples showing common use cases

### API Reference

- Function signatures
- Parameters
- Return types
- Exceptions

### Examples

Real-world usage examples

### Notes

Important considerations, gotchas, limitations
```

---

## 🎯 Response Format Template

When responding to a coding request, structure your response like this:

```markdown
## Task Summary

[Brief description of what you're implementing]

## Approach

[Explain your approach, referencing guidelines]

- Following [Pattern Name] from CODE_TEMPLATES.md
- Using [Architecture Decision] from ARCHITECTURE.md
- Implementing [Design Pattern]

## Implementation

### 1. [Component/File Name]

[Brief explanation]

[Code block]

### 2. [Next Component/File]

[Explanation]

[Code block]

## Testing

[How to test the new code]

## Next Steps

[What else might be needed]
```

**Example Response**:

````markdown
## Task Summary

Adding a TaskPrioritySelector component for the tasks module.

## Approach

- Following Vue Component Template from CODE_TEMPLATES.md
- Using Shadcn-vue Select component (section "UI Component Patterns")
- Implementing v-model pattern for two-way binding
- Type-safe with TypeScript

## Implementation

### 1. TaskPrioritySelector.vue

A reusable selector component for task priority with visual indicators.

[Code block with full component]

### 2. Update task types

Adding TaskPriority type if it doesn't exist.

[Code block with type definition]

## Testing

```typescript
import { mount } from '@vue/test-utils';
import TaskPrioritySelector from './TaskPrioritySelector.vue';

it('should emit priority change', async () => {
    const wrapper = mount(TaskPrioritySelector, {
        props: { modelValue: 'low' },
    });

    // Test interaction
});
```
````

## Next Steps

- Integrate into TaskForm.vue
- Add to task creation workflow
- Update task update logic to handle priority

````

---

## ⚙️ Debugging Tips

### TypeScript Errors
```bash
# Check types
pnpm type-check

# Common fixes:
# 1. Missing .value for refs
# 2. Wrong import path (use aliases!)
# 3. Missing type definition
````

### IPC Not Working

```typescript
// 1. Check preload registered
console.log(window.electron); // Should show API

// 2. Check handler registered
// In electron/main/index.ts
registerProjectHandlers();

// 3. Check typing in preload
declare global {
    interface Window {
        electron: typeof api;
    }
}
```

### Store Not Updating

```typescript
// 1. Use storeToRefs for reactive state
const { projects } = storeToRefs(useProjectStore());

// 2. Don't destructure directly
const { projects } = useProjectStore(); // ❌ Not reactive

// 3. Check if .value is needed
projects.value.push(newProject); // In store
```

---

## 🎓 Learning Resources

### Internal Documentation

1. **DEVELOPMENT_GUIDELINES.md** - Core patterns and rules
2. **CODE_TEMPLATES.md** - Copy-paste boilerplates
3. **ARCHITECTURE.md** - Design decisions
4. **TECH_STACK_RATIONALE.md** - Why we chose each technology

### External Resources

- Vue 3 Docs: https://vuejs.org/
- Drizzle ORM: https://orm.drizzle.team/
- Electron: https://www.electronjs.org/
- Shadcn-vue: https://www.shadcn-vue.com/
- Pinia: https://pinia.vuejs.org/

---

## 🆘 When Stuck

1. **Read the guidelines** - Answer is probably there
2. **Check templates** - Use existing patterns
3. **Search codebase** - Look for similar code
4. **Ask clarifying questions** - Better than assuming
5. **Break down the task** - Smaller steps are easier
6. **Test incrementally** - Don't wait until the end

---

## ✅ Pre-Commit Checklist

**🚨 CRITICAL**: Review `.claude/TYPESCRIPT_ENFORCEMENT.md` before EVERY commit!

Before finishing any task, verify:

- [ ] **MANDATORY**: `pnpm type-check` passes (0 errors)
- [ ] **MANDATORY**: `pnpm lint` passes (0 errors, warnings OK)
- [ ] Code follows patterns from DEVELOPMENT_GUIDELINES.md
- [ ] Used templates from CODE_TEMPLATES.md where applicable
- [ ] All imports use path aliases (@/, @core/, @modules/)
- [ ] TypeScript types defined for all data structures
- [ ] Error handling added to all async operations
- [ ] No `any` types used (or properly disabled with comment)
- [ ] No `{}` types (use `Record<string, unknown>`)
- [ ] No `Function` types (use proper signatures)
- [ ] No `@ts-ignore` (use `@ts-expect-error` with comment)
- [ ] No `console.log` statements (use proper logging or disable)
- [ ] JSDoc comments added for public APIs
- [ ] Tests written for critical logic
- [ ] Code formatted (`pnpm format`)
- [ ] Documentation updated if needed
- [ ] Commit message follows convention

---

**Remember**: Consistency is more important than cleverness. Follow the patterns, and the code will be maintainable.

**Version**: 1.0.0
**Last Updated**: 2025-11-24
