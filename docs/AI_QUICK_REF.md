# Quick Reference for AI Development

> **Last Updated**: 2025-12-11
> **Target AI Models**: Claude Sonnet 3.5, Gemini 2.0 Flash (via Antigravity)

## 🎯 Current Project State

### Active Features

- ✅ AI Task execution (GPT, Claude, Gemini)
- ✅ Script Task execution (JavaScript, Python, Bash)
- ✅ Task dependencies and triggers
- ✅ Kanban board with drag & drop
- ✅ Operator-based AI settings override
- ✅ Monaco Editor integration

### Recent Updates (Dec 11, 2025)

1. **Script Task UI improvements** - Visual distinction from AI tasks
2. **Monaco Editor worker configuration** - Fixed loading errors
3. **TaskCard header restructure** - 2-row layout

## 📁 Key File Locations

### UI Components

```
src/components/
├── board/
│   ├── TaskCard.vue              # Main task card (2-row header, script UI)
│   ├── KanbanColumn.vue          # Column component
│   └── KanbanBoard.vue           # Board container
├── task/
│   ├── TaskDetailPanel.vue       # Task edit panel (prompt vs script editor)
│   └── EnhancedResultPreview.vue # AI result display
└── common/
    └── CodeEditor.vue            # Monaco wrapper (NEW)
```

### Backend Services

```
electron/main/
├── services/
│   ├── script-executor.ts        # Script execution (NEW)
│   ├── task-scheduler.ts         # Task triggers (NEW)
│   └── task-notification-service.ts (NEW)
├── database/
│   ├── schema.ts                 # Database tables
│   └── migrations/
│       └── 0013_add_script_task_type.sql
└── ipc/
    └── task-execution-handlers.ts # IPC handlers
```

### AI Integration

```
src/services/ai/
├── AIServiceManager.ts           # Main AI orchestrator
├── providers/
│   ├── GPTProvider.ts
│   ├── ClaudeProvider.ts
│   └── GeminiProvider.ts
└── AIConfig.ts                   # Provider configurations
```

## 🔄 Common Task Workflows

### Adding a New Script Language Support

1. **Update Types** (`src/core/types/database.ts`):

    ```typescript
    export type ScriptLanguage = 'javascript' | 'python' | 'bash' | 'NEW_LANG';
    ```

2. **Add Icon Mapping** (`src/utils/iconMapping.ts`):

    ```typescript
    export function getScriptLanguageIcon(language: ScriptLanguage): string {
        const icons = {
            // ... existing
            NEW_LANG: '🆕',
        };
        return icons[language] || '📝';
    }
    ```

3. **Update Executor** (`electron/main/services/script-executor.ts`):
    ```typescript
    private async executeScript(language: ScriptLanguage, code: string) {
      switch (language) {
        // ... existing cases
        case 'NEW_LANG':
          return this.executeNewLang(code);
      }
    }
    ```

### Adding a New AI Provider

1. **Create Provider** (`src/services/ai/providers/NewProvider.ts`):

    ```typescript
    export class NewProvider extends BaseAIProvider {
        async generateResponse(prompt: string): Promise<string> {
            // Implementation
        }
    }
    ```

2. **Register Provider** (`electron/main/config/provider-registry.ts`):

    ```typescript
    export const providerRegistry = {
        // ... existing
        'new-provider': {
            name: 'New Provider',
            icon: '🆕',
            models: ['model-1', 'model-2'],
        },
    };
    ```

3. **Update AIServiceManager** (`src/services/workflow/AIServiceManager.ts`):
    ```typescript
    private createProviderInstance(type: string) {
      switch (type) {
        // ... existing cases
        case 'new-provider':
          return new NewProvider(config);
      }
    }
    ```

## 🐛 Common Issues & Solutions

### Monaco Editor Worker Errors

**Error**: `You must define MonacoEnvironment.getWorkerUrl`
**Solution**: Already fixed in `vite.config.ts` + `CodeEditor.vue`

```typescript
// vite.config.ts
monacoEditorPlugin({
    languageWorkers: ['editorWorkerService', 'typescript', 'json', 'html'],
});
```

### Task Card Display Issues

**Problem**: UI not updating for script tasks
**Check**:

1. `task.taskType === 'script'` condition
2. `scriptIcon` computed property
3. `getScriptLanguageIcon()` function

### Database Migration Errors

**Error**: `better-sqlite3` version mismatch
**Solution**:

```bash
pnpm rebuild better-sqlite3
# or
rm -rf node_modules/.pnpm/*better-sqlite3*
pnpm install
```

## 📊 Task Type Comparison

| Feature               | AI Task                         | Script Task                       |
| --------------------- | ------------------------------- | --------------------------------- |
| **Execution**         | AI Provider API                 | Local script executor             |
| **Required Fields**   | `aiProvider`, `generatedPrompt` | `scriptLanguage`, `scriptContent` |
| **Header Badge**      | Provider icon (blue/purple)     | Language icon (green)             |
| **Edit View**         | Prompt editor                   | Monaco code editor                |
| **Available Actions** | Run, Subdivide, Enhance         | Run only                          |
| **Result Format**     | Markdown/structured             | Raw output                        |

## 🎨 UI Component Patterns

### TaskCard Header Structure (Current)

```vue
<div class="flex flex-col gap-2 mb-2">
  <!-- Row 1: Provider/Script Language -->
  <div class="flex items-start justify-between gap-2">
    <div v-if="task.taskType === 'script'">
      <!-- Script Language Badge (Green) -->
    </div>
    <div v-else-if="aiProviderInfo">
      <!-- AI Provider Badge (Blue/Purple) -->
    </div>
  </div>

  <!-- Row 2: Output Format & Task ID -->
  <div class="flex items-center justify-between gap-2">
    <div><!-- Output Format --></div>
    <div><!-- Task ID + Order --></div>
  </div>
</div>
```

### Conditional Button Display

```vue
<!-- Script tasks: Hide subdivide/enhance -->
<button v-if="showSubdivideButton && task.taskType !== 'script'">
  세분화
</button>

<button v-if="showEnhancePromptButton && task.taskType !== 'script'">
  고도화
</button>
```

## 🔐 Database Schema Quick Ref

### tasks Table (Key Fields)

```sql
id INTEGER PRIMARY KEY
projectId INTEGER NOT NULL
title TEXT NOT NULL
taskType TEXT CHECK(taskType IN ('ai', 'script')) DEFAULT 'ai'
scriptLanguage TEXT CHECK(scriptLanguage IN ('javascript', 'python', 'bash'))
scriptContent TEXT
aiProvider TEXT
generatedPrompt TEXT
status TEXT DEFAULT 'todo'
```

## 🚀 Development Commands

```bash
# Development
pnpm dev:electron          # Start dev server

# Database
pnpm db:migrate           # Run migrations
pnpm db:reset             # Reset database

# Build
pnpm build               # Build for production
pnpm build:electron      # Build electron app

# Lint
pnpm lint                # Run ESLint
```

## 📝 Commit Message Convention

```
feat(scope): description
fix(scope): description
docs(scope): description
refactor(scope): description
```

Examples:

- `feat(ui): Add script task UI improvements`
- `fix(monaco): Configure web workers properly`
- `refactor(task-card): Restructure header layout`

## 💡 Tips for AI Assistants

1. **Always check `task.taskType`** before applying AI-specific logic
2. **Use `getScriptLanguageIcon()`** for script language icons
3. **Monitor lint warnings** - they indicate unused code that can be cleaned
4. **Test both AI and Script tasks** when modifying TaskCard.vue
5. **Check database migrations** before schema changes

---

**For detailed changes**: See [RECENT_CHANGES.md](./RECENT_CHANGES.md)
**For architecture**: See [ARCHITECTURE.md](../ARCHITECTURE.md)
