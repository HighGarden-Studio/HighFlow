# Quick Start Guide for AI Assistants

## 🎯 Mission

You're working on the **AI Workflow Manager** - an Electron desktop app for managing AI-powered task workflows.

## 📖 Read First

**CRITICAL**: Read `/TYPESCRIPT_ENFORCEMENT.md` for MANDATORY type safety rules.
**ALWAYS** reference `/CLAUDE.md` for comprehensive guidelines.

## 🔑 Key Concepts

### Architecture

- **Main Process** (Node.js): Database, IPC handlers, AI services
- **Renderer Process** (Vue 3): UI components, stores, frontend logic
- **Bridge**: `electron/preload/index.ts` exposes APIs via IPC

### Data Flow

```
User Action → Vue Component → Pinia Store → IPC Call → Main Handler → Database/AI Service → Response → Store Update → UI Reactivity
```

### Critical Files

- `electron/main/ipc/*.ts` - All backend handlers
- `src/renderer/stores/*.ts` - Frontend state management
- `src/components/` - Reusable Vue components
- `src/services/` - Business logic (AI, workflow, integration)

## 🚫 Never Do This

1. Use `any` without `@ts-expect-error` comment
2. Hardcode API keys (use settings DB)
3. Ignore IPC errors (always handle)
4. Break existing IPC contracts
5. Copy-paste large code blocks in responses

## ✅ Always Do This

1. **Reference files** instead of repeating code: `file:///path#L10-L20`
2. **Show diffs** not full files
3. **Type everything** explicitly
4. **Test incrementally** - small changes, verify, repeat
5. **Follow existing patterns** - check similar implementations first

## 🎨 Vue Component Template

```vue
<script setup lang="ts">
// 1. Imports
import { ref, computed } from 'vue';

// 2. Props
interface Props {
    item: ItemType;
}
const props = defineProps<Props>();

// 3. Emits
const emit = defineEmits<{
    (e: 'update', value: Type): void;
}>();

// 4. State
const localState = ref<Type>(initialValue);

// 5. Computed
const derivedValue = computed(() => transform(localState.value));

// 6. Methods
function handleAction() {
    emit('update', derivedValue.value);
}
</script>

<template>
    <!-- Semantic, accessible HTML -->
</template>
```

## 🔧 Adding New Features

### 1. Database Change

```bash
# Create migration
echo "ALTER TABLE projects ADD COLUMN new_field TEXT;" > electron/main/database/migrations/NNNN_description.sql
```

### 2. IPC Handler

```typescript
// electron/main/ipc/your-handlers.ts
ipcMain.handle('your:action', async (_event, data: Type) => {
    // Implementation
    return result;
});

// electron/preload/index.ts
yourAPI: {
    action: (data: Type) => ipcRenderer.invoke('your:action', data);
}
```

### 3. Frontend Integration

```typescript
// In Vue component or store
const result = await window.electron.yourAPI.action(data);
```

## 🐛 Debugging Checklist

- [ ] Check browser console (F12) for renderer errors
- [ ] Check main process console for backend errors
- [ ] Verify IPC handler is registered
- [ ] Confirm types match between main and renderer
- [ ] Test with minimal input first

## 💡 Token Optimization

- Use file references: `See projectStore.ts:L123-145`
- Request incremental changes: "Add error handling to X"
- Avoid explaining what code does (types are self-documenting)
- Group related changes in one request

## 🤝 Multi-Assistant Note

This project uses Claude Code and Codex interchangeably. Always:

- Reference `CLAUDE.md` for consistency
- Use same terminology
- Follow same IPC patterns
- Maintain type safety

## 📚 Learn More

- Full guidelines: `/CLAUDE.md`
- Architecture: `/ARCHITECTURE.md`
- Project structure: `/PROJECT_STRUCTURE.md`
- Database schema: `database/schema.sql`

---

**When in doubt, ask the user for clarification rather than guessing!**
