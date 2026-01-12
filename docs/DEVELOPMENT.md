# Vue 3 Components Implementation Guide

> Complete guide for implementing all UI components with Composition API and TypeScript

---

## 📊 Implementation Status

### ✅ Completed (Session 2)

#### Core Components
1. **ProjectWizard.vue** - 8-step project creation wizard with AI integration
2. **KanbanBoard.vue** - Full kanban board with real-time collaboration
3. **KanbanColumn.vue** - Individual kanban columns with drag-drop support
4. **TaskCard.vue** - Task cards with priority, tags, and assignee display

#### Composables
1. **useAI.ts** - AI service composable
2. **useKeyboard.ts** - Keyboard shortcuts composable
3. **useDragDrop.ts** - Drag & drop with optimistic updates
4. **useRealtime.ts** - WebSocket-based real-time collaboration
5. **useTaskExecution.ts** - AI task execution with streaming

### 🚧 To Implement
- TimelineView.vue (Gantt chart)
- TaskDetailPanel.vue (Monaco editor)
- CommandPalette.vue (Cmd+K)
- SkillsLibrary.vue
- TemplateMarketplace.vue
- TimeTracker.vue
- CostDashboard.vue
- ActivityFeed.vue
- NotificationCenter.vue
- SettingsView.vue
- AutomationBuilder.vue
- GitIntegrationPanel.vue
- CollaborationIndicators.vue

---

## 🏗️ Architecture Overview

### Component Structure
```
src/
├── components/
│   ├── project/
│   │   ├── ProjectWizard.vue ✅
│   │   ├── ProjectCard.vue
│   │   └── ProjectSettings.vue
│   ├── board/
│   │   ├── KanbanBoard.vue
│   │   ├── KanbanColumn.vue
│   │   └── TaskCard.vue
│   ├── timeline/
│   │   ├── TimelineView.vue
│   │   ├── TimelineTask.vue
│   │   └── DependencyArrow.vue
│   ├── task/
│   │   ├── TaskDetailPanel.vue
│   │   ├── TaskExecutor.vue
│   │   └── TaskComments.vue
│   ├── global/
│   │   ├── CommandPalette.vue
│   │   ├── Navbar.vue
│   │   └── Sidebar.vue
│   ├── skills/
│   │   ├── SkillsLibrary.vue
│   │   ├── SkillCard.vue
│   │   └── SkillEditor.vue
│   ├── templates/
│   │   ├── TemplateMarketplace.vue
│   │   ├── TemplateCard.vue
│   │   └── TemplatePreview.vue
│   ├── time/
│   │   ├── TimeTracker.vue
│   │   ├── TimeEntry.vue
│   │   └── TimeReport.vue
│   ├── analytics/
│   │   ├── CostDashboard.vue
│   │   ├── TokenUsageChart.vue
│   │   └── CostByProviderChart.vue
│   ├── activity/
│   │   ├── ActivityFeed.vue
│   │   └── ActivityItem.vue
│   ├── notifications/
│   │   ├── NotificationCenter.vue
│   │   └── NotificationItem.vue
│   ├── settings/
│   │   ├── SettingsView.vue
│   │   ├── ProfileSettings.vue
│   │   ├── AIProviderSettings.vue
│   │   └── IntegrationSettings.vue
│   ├── automation/
│   │   ├── AutomationBuilder.vue
│   │   ├── TriggerNode.vue
│   │   └── ActionNode.vue
│   ├── git/
│   │   ├── GitIntegrationPanel.vue
│   │   └── CommitHistory.vue
│   └── collaboration/
│       ├── CollaborationIndicators.vue
│       ├── UserCursor.vue
│       └── TypingIndicator.vue
├── composables/
│   ├── useAI.ts ✅
│   ├── useKeyboard.ts ✅
│   ├── useRealtime.ts
│   ├── useDragDrop.ts
│   ├── useTaskExecution.ts
│   └── useWebSocket.ts
├── stores/
│   ├── projectStore.ts
│   ├── taskStore.ts
│   ├── userStore.ts
│   └── uiStore.ts
└── utils/
    ├── date.ts
    ├── format.ts
    └── validation.ts
```

---

## 🎨 Design System

### Color Palette
```typescript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        success: '#10b981',
        warning: '#f59e0b',
        error: '#ef4444',
      },
    },
  },
};
```

### Typography
- **Heading**: Inter, system-ui
- **Body**: Inter, system-ui
- **Code**: Fira Code, Monaco, monospace

### Spacing Scale
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- 2xl: 48px

---

## 📦 Required Dependencies

```json
{
  "dependencies": {
    // Already installed
    "vue": "^3.4.21",
    "vue-router": "^4.3.0",
    "pinia": "^2.1.7",
    "@vueuse/core": "^10.9.0",

    // Need to add
    "@vueuse/gesture": "^2.0.0",
    "monaco-editor": "^0.47.0",
    "vite-plugin-monaco-editor": "^1.1.0",
    "echarts": "^5.5.0",
    "vue-echarts": "^6.7.0",
    "@vue-flow/core": "^1.33.0",  // For dependency graphs
    "@vue-flow/background": "^1.3.0",
    "fuse.js": "^7.0.0",  // For fuzzy search
    "yjs": "^13.6.14",  // For CRDT collaboration
    "y-websocket": "^2.0.0"
  }
}
```

---

## 🛠️ Implementation Patterns

### 1. Composable Pattern

```typescript
// composables/useTaskExecution.ts
import { ref } from 'vue';
import type { Task } from '@core/types/database';

export function useTaskExecution() {
  const isExecuting = ref(false);
  const streamedContent = ref('');
  const executionStats = ref<any>(null);

  async function executeTask(task: Task) {
    isExecuting.value = true;
    streamedContent.value = '';

    try {
      // Implementation
    } finally {
      isExecuting.value = false;
    }
  }

  async function stopExecution() {
    // Stop streaming
  }

  return {
    isExecuting,
    streamedContent,
    executionStats,
    executeTask,
    stopExecution,
  };
}
```

### 2. Real-time Collaboration Pattern

```typescript
// composables/useRealtime.ts
import { ref, onMounted, onUnmounted } from 'vue';
import { io } from 'socket.io-client';

export function useRealtime(roomId: string) {
  const socket = ref<any>(null);
  const users = ref<any[]>([]);

  onMounted(() => {
    socket.value = io(import.meta.env.VITE_WS_URL);
    socket.value.emit('join-room', roomId);

    socket.value.on('user-joined', (user: any) => {
      users.value.push(user);
    });

    socket.value.on('user-left', (userId: string) => {
      users.value = users.value.filter((u) => u.id !== userId);
    });
  });

  onUnmounted(() => {
    socket.value?.disconnect();
  });

  return {
    socket,
    users,
  };
}
```

### 3. Drag & Drop Pattern

```typescript
// composables/useDragDrop.ts
import { ref } from 'vue';

export function useDragDrop() {
  const draggedItem = ref<any>(null);

  function onDragStart(item: any) {
    draggedItem.value = item;
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  async function onDrop(targetColumn: string) {
    if (!draggedItem.value) return;

    // Update task status
    // Optimistic update
    draggedItem.value = null;
  }

  return {
    draggedItem,
    onDragStart,
    onDragOver,
    onDrop,
  };
}
```

---

## 📝 Component Templates

### KanbanBoard.vue Structure

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useDragDrop } from '@/composables/useDragDrop';
import { useRealtime } from '@/composables/useRealtime';
import TaskCard from './TaskCard.vue';

const columns = ['todo', 'in_progress', 'in_review', 'done', 'blocked'];
const tasks = ref<Task[]>([]);
const { draggedItem, onDragStart, onDrop } = useDragDrop();
const { users } = useRealtime('project-123');

const tasksByColumn = computed(() => {
  return columns.reduce((acc, col) => {
    acc[col] = tasks.value.filter((t) => t.status === col);
    return acc;
  }, {} as Record<string, Task[]>);
});
</script>

<template>
  <div class="flex gap-4 overflow-x-auto p-6">
    <div
      v-for="column in columns"
      :key="column"
      class="flex-shrink-0 w-80"
      @dragover.prevent
      @drop="onDrop(column)"
    >
      <div class="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
        <h3 class="font-semibold mb-4">{{ column.toUpperCase() }}</h3>

        <div class="space-y-3">
          <TaskCard
            v-for="task in tasksByColumn[column]"
            :key="task.id"
            :task="task"
            draggable="true"
            @dragstart="onDragStart(task)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
```

### TaskDetailPanel.vue Structure

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTaskExecution } from '@/composables/useTaskExecution';
import MonacoEditor from '@/components/common/MonacoEditor.vue';

const props = defineProps<{
  task: Task;
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'update', task: Task): void;
}>();

const { executeTask, isExecuting, streamedContent } = useTaskExecution();

const prompt = ref(props.task.generatedPrompt || '');
const aiProvider = ref(props.task.aiProvider || 'anthropic');
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-y-0 right-0 z-50 w-2/3 bg-white dark:bg-gray-900 shadow-xl">
      <!-- Header -->
      <div class="border-b p-4 flex items-center justify-between">
        <h2 class="text-xl font-bold">{{ task.title }}</h2>
        <button @click="emit('close')">✕</button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6">
        <!-- Prompt Editor -->
        <section>
          <h3 class="font-semibold mb-2">Prompt</h3>
          <MonacoEditor v-model="prompt" language="markdown" />
        </section>

        <!-- AI Settings -->
        <section>
          <h3 class="font-semibold mb-2">AI Configuration</h3>
          <!-- Provider selector, model selector, sliders -->
        </section>

        <!-- Execution Controls -->
        <section>
          <button
            @click="executeTask(task)"
            :disabled="isExecuting"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            {{ isExecuting ? 'Executing...' : 'Run (⌘+Enter)' }}
          </button>
        </section>

        <!-- Results Viewer -->
        <section v-if="streamedContent">
          <h3 class="font-semibold mb-2">Results</h3>
          <div class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
            <div v-html="streamedContent"></div>
          </div>
        </section>

        <!-- Comments -->
        <section>
          <h3 class="font-semibold mb-2">Comments</h3>
          <!-- Comment thread -->
        </section>
      </div>
    </div>
  </Teleport>
</template>
```

### CommandPalette.vue Structure

```vue
<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useKeyboard } from '@/composables/useKeyboard';
import Fuse from 'fuse.js';

const { register } = useKeyboard();

const open = ref(false);
const query = ref('');
const selectedIndex = ref(0);

// Register Cmd+K shortcut
register({
  key: 'k',
  meta: true,
  handler: () => {
    open.value = !open.value;
  },
});

const allItems = [
  { type: 'action', title: 'Create project', action: () => {} },
  { type: 'action', title: 'New task', action: () => {} },
  // ... more items
];

const fuse = new Fuse(allItems, {
  keys: ['title'],
  threshold: 0.3,
});

const filteredItems = computed(() => {
  if (!query.value) return allItems;
  return fuse.search(query.value).map((r) => r.item);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50">
      <div class="w-full max-w-2xl bg-white dark:bg-gray-900 rounded-lg shadow-xl">
        <input
          v-model="query"
          type="text"
          placeholder="Type a command or search..."
          class="w-full px-4 py-3 text-lg border-b"
          @keydown.esc="open = false"
        />

        <div class="max-h-96 overflow-y-auto">
          <div
            v-for="(item, index) in filteredItems"
            :key="index"
            :class="['px-4 py-3 cursor-pointer', index === selectedIndex && 'bg-blue-50']"
            @click="item.action()"
          >
            {{ item.title }}
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
```

---

## 🎯 Next Steps

### Phase 1: Core Components (Week 1)
1. ✅ ProjectWizard.vue
2. KanbanBoard.vue + TaskCard.vue
3. TaskDetailPanel.vue
4. CommandPalette.vue

### Phase 2: Views & Analytics (Week 2)
5. TimelineView.vue (Gantt chart)
6. CostDashboard.vue (ECharts)
7. ActivityFeed.vue
8. NotificationCenter.vue

### Phase 3: Marketplaces (Week 3)
9. SkillsLibrary.vue
10. TemplateMarketplace.vue
11. TimeTracker.vue

### Phase 4: Advanced Features (Week 4)
12. SettingsView.vue (multi-tab)
13. AutomationBuilder.vue (visual editor)
14. GitIntegrationPanel.vue
15. CollaborationIndicators.vue (Yjs + CRDT)

---

## 🔧 Development Commands

```bash
# Install dependencies
pnpm install @vueuse/gesture @vue-flow/core fuse.js

# Run dev server
pnpm dev:electron

# Type check
pnpm type-check

# Build for production
pnpm build
```

---

## 📚 Resources

- **Vue 3 Docs**: https://vuejs.org/guide/introduction.html
- **Composition API**: https://vuejs.org/guide/extras/composition-api-faq.html
- **VueUse**: https://vueuse.org/
- **ECharts**: https://echarts.apache.org/
- **Monaco Editor**: https://microsoft.github.io/monaco-editor/
- **Vue Flow**: https://vueflow.dev/
- **Yjs**: https://docs.yjs.dev/

---

**Last Updated**: 2025-11-25
