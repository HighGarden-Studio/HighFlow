# HighFlow - Development Guidelines

> **🎯 Multi-Assistant Project**: This codebase uses Claude Code, Antigravity, and Codex. These guidelines ensure consistency across all AI assistants while optimizing token usage.

## 📋 Quick Reference

**Project**: Electron-based AI workflow manager with Vue 3 + TypeScript  
**Stack**: Electron 28, Vue 3, TypeScript, SQLite, Tailwind CSS  
**Architecture**: Main (Node.js) + Renderer (Vue) via IPC bridge

---

## 🏗️ Architecture Overview

### Core Structure

```
workflow_manager/
├── electron/main/        # Node.js backend (DB, IPC, AI services)
├── src/
│   ├── components/       # Vue components
│   ├── services/         # Business logic (AI, workflow, integration)
│   ├── renderer/         # Stores (Pinia), views, router
│   └── core/types/       # TypeScript interfaces
└── database/migrations/  # SQL schema evolution
```

### Key Patterns

- **IPC**: Main ↔ Renderer via `electron/preload/index.ts`
- **State**: Pinia stores (`projectStore`, `taskStore`, `settingsStore`)
- **AI**: Provider abstraction → OpenAI, Anthropic, Google, Local
- **DB**: SQLite with drizzle ORM, versioned migrations

---

## 🚀 Development Principles

### 1. Token Efficiency (Critical)

- **Reference, don't repeat**: Use file paths `file:///absolute/path#L123-L145` instead of code blocks
- **Diffs over full code**: Show only changed lines
- **Imports at top**: Group and minimize
- **Focused changes**: Edit one concern at a time

### 2. Type Safety

- All new code must have explicit TypeScript types
- No `any` without `// @ts-expect-error` comment explaining why
- Shared types in `src/core/types/`

### 3. Component Design

- **Composition API**: Use `<script setup lang="ts">`
- **Props typing**: `defineProps<Interface>()`
- **Reactivity**: `ref`, `computed`, `watch` (avoid `reactive` for complex objects)
- **Emits**: Explicit `defineEmits<{ (e: 'event', payload: Type): void }>()`

### 4. State Management

- **Local state**: `ref` in component
- **Shared state**: Pinia store
- **Async**: Handle loading/error states explicitly

### 5. IPC Communication

```typescript
// Main process (electron/main/ipc/*.ts)
ipcMain.handle('namespace:action', async (_event, arg: Type) => {
    // Implementation
    return result;
});

// Renderer (via window.electron)
const result = await window.electron.namespace.action(arg);
```

---

## 📁 File Modification Guidelines

### When Adding Features

1. **Database changes**: Create migration in `electron/main/database/migrations/`
2. **IPC handlers**: Add to appropriate `electron/main/ipc/*-handlers.ts`
3. **Frontend API**: Expose in `electron/preload/index.ts`
4. **UI components**: Follow existing patterns in `src/components/`
5. **Types**: Update `src/core/types/database.ts` or create new type file

### When Fixing Bugs

1. **Identify scope**: Main process vs Renderer vs IPC
2. **Check stores**: State may be stale, watch reactivity
3. **Console logs**: Add context, remove before commit
4. **Error handling**: Use try-catch, show user-friendly messages

---

## 🎨 UI/UX Standards

### Tailwind Usage

- **Colors**: Use gray-\* for neutral, project-specific for brand
- **Dark mode**: Default, ensure all components support
- **Spacing**: Consistent `gap-*`, `space-*`, `p-*`, `m-*`

### Component Structure

```vue
<script setup lang="ts">
// 1. Imports
// 2. Props/Emits
// 3. Stores
// 4. Local state
// 5. Computed
// 6. Methods
// 7. Watches/Lifecycle
</script>

<template>
    <!-- Clean, semantic HTML -->
</template>

<style scoped>
/* Only if absolutely necessary */
</style>
```

---

## 🤖 AI Service Integration

### Provider Pattern

All AI providers implement `AIServiceProvider` interface:

- `chat(messages, options)` → streaming response
- `createCompletion(prompt, options)` → simple completion
- Error handling with provider-specific retry logic

### Adding New Provider

1. Create `src/services/ai/providers/NewProvider.ts`
2. Implement `AIServiceProvider` interface
3. Register in `src/services/ai/AIServiceFactory.ts`
4. Add to settings UI

### MCP (Model Context Protocol)

- **Configuration**: Stored in project metadata
- **Env variables**: Passed via IPC, **never** hardcoded
- **Integration**: See `src/services/integration/` for Claude Code sync

---

## 🔄 Workflow Execution

### Task Lifecycle

```
Created → In Progress → Needs Approval → In Review → Done/Blocked
```

### AI Task Execution

1. Task loaded with macro resolution (`{{prev}}`, `{{task:ID}}`)
2. AI provider selected (project default or task-specific)
3. Stream response via IPC
4. Store result in `task_results` table
5. Update task status

### Dependency Resolution

- **Macros**: Resolved at execution time from previous task results
- **Chain execution**: Tasks run sequentially based on dependencies

---

## 📊 Database Schema

**Key Tables**:

- `projects`: Core project metadata, AI settings, MCP config
- `tasks`: Individual workflow steps, AI provider per task
- `task_results`: Execution outputs (content, summary, metrics)
- `settings`: Global AI provider configs, API keys
- `activity_logs`: Audit trail

**Metadata Fields** (JSON):

- `projects.metadata`: `{ localRepo: { types: string[] }, claudeCodeIntegration: boolean }`
- `tasks.metadata`: Custom task-specific data

---

## 🛠️ Common Tasks

### Add New Vue Component

```bash
# Create file src/components/[category]/ComponentName.vue
# Import in parent, add props interface, emit events
```

### Add IPC Handler

```typescript
// 1. electron/main/ipc/your-handlers.ts
ipcMain.handle('your:action', async (_event, data) => { ... });

// 2. electron/preload/index.ts
yourAPI: {
    action: (data: Type) => ipcRenderer.invoke('your:action', data),
}

// 3. src/core/types/electron.d.ts (if new API)
declare global {
    interface Window {
        electron: {
            yourAPI: { action: (data: Type) => Promise<Result> };
        }
    }
}
```

### Database Migration

```sql
-- electron/main/database/migrations/NNNN_description.sql
ALTER TABLE projects ADD COLUMN new_field TEXT;
UPDATE schema_migrations SET version = NNNN;
```

---

## 🐛 Debugging

### Main Process

```bash
# Enable devtools
ELECTRON_ENABLE_LOGGING=1 pnpm dev
# Check console in main devtools (can be opened via View menu)
```

### Renderer

- **Vue Devtools**: Available in dev mode
- **Console**: Check browser devtools (F12)
- **Network**: IPC calls logged with prefixes

### Common Issues

- **IPC silent failures**: Check main process console
- **Reactivity not working**: Ensure using `ref`/`computed`, not plain objects
- **Store not updating**: Verify store is imported, not recreated

---

## ✅ Code Quality

### Before Committing

- [ ] TypeScript types complete (no implicit `any`)
- [ ] Error handling in place
- [ ] Console logs removed
- [ ] UI tested in dark mode
- [ ] IPC errors handled gracefully

### Performance

- **Large lists**: Use `v-for` with `:key`, consider virtual scrolling
- **Computed values**: Memoize expensive calculations
- **IPC calls**: Batch when possible, debounce user actions

---

## 🔐 Security

- **API keys**: Stored in settings DB, never in code
- **IPC**: Validate all inputs from renderer
- **SQL**: Use parameterized queries (drizzle handles this)
- **File access**: Restrict to user-selected paths

---

## 📝 Token Optimization Tips

### For Claude Code / Antigravity / Codex

1. **Context Minimization**
    - Reference existing files by path instead of pasting content
    - Use line ranges: `file:///path#L10-L20`
    - Request "show only changes" for edits

2. **Batch Operations**
    - Group related changes in single request
    - Update multiple files together if logically connected

3. **Incremental Development**
    - Build features step-by-step
    - Test intermediate states before proceeding

4. **Effective Prompts**

    ```
    ✅ "Add error handling to saveProject() in projectStore.ts"
    ❌ "Fix the bug in project saving" (too vague)

    ✅ "Update AI provider dropdown to include local assistants from project.metadata.localRepo.types"
    ❌ "Make dropdown better" (unclear scope)
    ```

5. **Use Artifacts**
    - For plans: Create implementation_plan.md
    - For tracking: Update task.md checklist
    - For documentation: Create/update relevant .md files

---

## 🔄 Multi-Assistant Workflow

### Claude Code

- **Strengths**: Large context, code understanding, refactoring
- **Use for**: Architecture changes, complex logic, DB migrations

### Antigravity (Gemini)

- **Strengths**: Fast iterations, broad knowledge, multimodal
- **Use for**: UI components, quick fixes, documentation

### Codex (GPT-4)

- **Strengths**: Code generation, API integration
- **Use for**: New features, API clients, utility functions

### Consistency Tips

- Always reference this CLAUDE.md
- Use same terminology across assistants
- Maintain type safety regardless of assistant
- Follow IPC patterns consistently

---

## 📚 Key Files Reference

| File                           | Purpose                              |
| ------------------------------ | ------------------------------------ |
| `electron/main/index.ts`       | App entry, window management         |
| `electron/main/ipc/`           | All IPC handlers (fs, db, tasks, AI) |
| `electron/preload/index.ts`    | IPC bridge, APIs exposed to renderer |
| `src/renderer/router/index.ts` | Vue Router config                    |
| `src/renderer/stores/*.ts`     | Pinia state management               |
| `src/components/`              | Reusable Vue components              |
| `src/services/ai/`             | AI provider abstraction              |
| `src/services/workflow/`       | Task execution engine                |
| `database/schema.sql`          | Current DB structure                 |
| `database/migrations/`         | Sequential schema changes            |

---

## 🎯 Guiding Principles (Final Reminder)

1. **Be Explicit**: Types, error messages, validation
2. **Stay Consistent**: Follow existing patterns
3. **Think IPC**: Main vs Renderer always
4. **Optimize Tokens**: Reference > Repeat
5. **Test Incrementally**: Don't build mountains at once

---

**Last Updated**: 2025-12-07  
**Project Status**: Active Development  
**Assistants**: Claude Code, Antigravity, Codex
