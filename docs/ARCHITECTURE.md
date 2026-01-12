# Architecture Decision Records (ADR)

## ADR-001: Monolithic Modular Architecture

**Status:** Accepted

**Context:**
Desktop application with rich features requiring AI integration, real-time collaboration, and offline capabilities.

**Decision:**
Adopt a monolithic modular architecture with clear module boundaries, rather than microservices.

**Rationale:**
1. **Development Speed**: Faster initial development and iteration
2. **Single Process**: Electron apps benefit from single-process efficiency
3. **Simplified Deployment**: One installer package, easier updates
4. **Shared Resources**: Direct memory sharing, no network overhead
5. **Future-Proof**: Can extract to microservices if needed

**Consequences:**
- Requires strong module boundaries
- Need disciplined code organization
- All features scale together (can't scale independently)

---

## ADR-002: Drizzle ORM over Prisma

**Status:** Accepted

**Context:**
Need type-safe ORM for SQLite in Electron environment.

**Decision:**
Use Drizzle ORM instead of Prisma.

**Rationale:**
1. **Native Binary Issues**: Prisma requires complex native binary handling in Electron
2. **Bundle Size**: Drizzle is significantly lighter (~50KB vs ~10MB)
3. **TypeScript-First**: Better type inference and autocomplete
4. **SQL-Like**: Easier migration from raw SQL if needed
5. **Performance**: No query engine overhead

**Consequences:**
- Less mature ecosystem than Prisma
- Need to write more boilerplate for relations
- Fewer built-in features (but more control)

---

## ADR-003: Shadcn-vue over Element Plus

**Status:** Accepted

**Context:**
Need modern, accessible UI component library.

**Decision:**
Use Shadcn-vue (Radix-based) instead of Element Plus.

**Rationale:**
1. **Customization**: Copy-paste components, full control
2. **Modern Design**: Aligns with current design trends
3. **Accessibility**: Built on Radix primitives (ARIA-compliant)
4. **Bundle Size**: Only includes used components
5. **TypeScript**: Better type definitions

**Consequences:**
- Need to maintain component code in project
- Less "batteries-included" than Element Plus
- Smaller community (but growing)

---

## ADR-004: Liveblocks for Real-time Collaboration

**Status:** Proposed

**Context:**
Need real-time collaboration with CRDT support.

**Decision:**
Primary: Liveblocks, Fallback: Supabase Realtime

**Rationale for Liveblocks:**
1. **Purpose-Built**: Designed specifically for collaboration features
2. **CRDT Native**: Built-in Yjs integration
3. **Developer Experience**: Excellent React/Vue hooks
4. **Presence API**: Easy cursor tracking and awareness
5. **Undo/Redo**: Built-in time travel

**Rationale for Supabase Fallback:**
1. **Cost**: Free tier is generous
2. **PostgreSQL**: If need complex queries
3. **Authentication**: Built-in auth system
4. **Storage**: Integrated file storage

**Consequences:**
- Liveblocks has usage-based pricing
- Need abstraction layer to support both
- Vendor lock-in risk (mitigated by abstraction)

---

## ADR-005: Vercel AI SDK for Multi-Model Support

**Status:** Accepted

**Context:**
Need to integrate multiple AI models (OpenAI, Anthropic, Google) with consistent API.

**Decision:**
Use Vercel AI SDK (`ai` package) as abstraction layer.

**Rationale:**
1. **Unified API**: Same interface for all models
2. **Streaming**: First-class streaming support
3. **Token Counting**: Automatic usage tracking
4. **React/Vue Hooks**: Great DX with `useChat`, `useCompletion`
5. **Tool Calling**: Standardized function calling

**Consequences:**
- Adds abstraction overhead
- Limited to features supported by SDK
- Version updates might break compatibility

---

## ADR-006: Plugin Architecture Design

**Status:** Accepted

**Context:**
Need extensibility for custom workflows, integrations, and AI skills.

**Decision:**
Implement plugin system with sandboxed execution and lifecycle hooks.

**Architecture:**
```typescript
interface Plugin {
  id: string;
  name: string;
  version: string;
  activate(context: PluginContext): void;
  deactivate(): void;
}

interface PluginContext {
  // Sandboxed API
  commands: CommandRegistry;
  storage: PluginStorage;
  ui: UIExtensions;
  ai: AIAgentRegistry;
}
```

**Rationale:**
1. **Marketplace**: Enable community extensions
2. **Custom Skills**: Users can add AI capabilities
3. **Integrations**: Third-party tool connectors
4. **Hot Reload**: Develop without restarting

**Consequences:**
- Security: Need careful API design
- Performance: Isolated execution has overhead
- Complexity: Plugin lifecycle management

---

## ADR-007: Offline-First with Sync Queue

**Status:** Accepted

**Context:**
Desktop app must work offline and sync when online.

**Decision:**
Local SQLite as source of truth, background sync with queue.

**Architecture:**
```
User Action → Local DB → Sync Queue → Remote API
                ↓            ↓
             UI Update    Background Sync
```

**Rationale:**
1. **Instant Response**: No waiting for network
2. **Reliability**: Works without internet
3. **Conflict Resolution**: CRDT for concurrent edits
4. **Battery Efficient**: Batched sync

**Consequences:**
- Complex conflict resolution logic
- Eventual consistency model
- Need clear UI indicators for sync state

---

## ADR-008: IPC Architecture Pattern

**Status:** Accepted

**Context:**
Communication between Electron main and renderer processes.

**Decision:**
Type-safe IPC with request/response pattern.

**Pattern:**
```typescript
// Preload (Bridge)
const api = {
  projects: {
    create: (data: CreateProjectDTO) =>
      ipcRenderer.invoke('projects:create', data),
    list: () =>
      ipcRenderer.invoke('projects:list'),
  }
};

// Main Process Handler
ipcMain.handle('projects:create', async (event, data) => {
  return await projectRepository.create(data);
});
```

**Rationale:**
1. **Type Safety**: Shared types between processes
2. **Error Handling**: Promise-based, catches errors
3. **Performance**: Async by default
4. **Testability**: Easy to mock IPC layer

**Consequences:**
- Boilerplate for each IPC channel
- Need to keep preload API in sync
- Serialization overhead for complex objects

---

## ADR-009: AI Cost Tracking Strategy

**Status:** Accepted

**Context:**
Users need visibility into AI API costs across multiple providers.

**Decision:**
Track tokens and costs in local database with analytics.

**Schema:**
```typescript
table('ai_usage', {
  id: serial('id').primaryKey(),
  timestamp: timestamp('timestamp').notNull(),
  provider: text('provider').notNull(), // 'openai' | 'anthropic' | 'google'
  model: text('model').notNull(),
  promptTokens: integer('prompt_tokens').notNull(),
  completionTokens: integer('completion_tokens').notNull(),
  totalCost: decimal('total_cost', { precision: 10, scale: 6 }),
  projectId: integer('project_id'),
  userId: integer('user_id'),
});
```

**Rationale:**
1. **Transparency**: Users see exact costs
2. **Budgeting**: Set alerts and limits
3. **Optimization**: Identify expensive operations
4. **Analytics**: Cost trends over time

**Consequences:**
- Need to maintain pricing tables
- Manual updates when providers change pricing
- Privacy consideration for usage data

---

## ADR-010: Build and Distribution Strategy

**Status:** Accepted

**Context:**
Need to distribute desktop app for Windows, macOS, Linux.

**Decision:**
Use electron-builder with auto-update.

**Distribution Channels:**
- **macOS**: DMG + Auto-update (Squirrel)
- **Windows**: NSIS installer + Auto-update (Squirrel.Windows)
- **Linux**: AppImage + Snap Store (optional)

**Auto-Update Strategy:**
```typescript
// Electron main
import { autoUpdater } from 'electron-updater';

autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'your-org',
  repo: 'workflow-manager',
});

autoUpdater.checkForUpdatesAndNotify();
```

**Rationale:**
1. **User Experience**: Seamless updates
2. **Security**: Code signing for all platforms
3. **Delta Updates**: Only download changes
4. **Rollback**: Can revert if update fails

**Consequences:**
- Need GitHub Releases or S3 for hosting
- Code signing certificates required ($$$)
- Beta channel management complexity

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Electron App                            │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │              Renderer Process (Vue 3)                  │ │
│  │                                                         │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐            │ │
│  │  │ Projects │  │   Tasks  │  │   AI     │            │ │
│  │  │  Module  │  │  Module  │  │Assistant │  ... more  │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘            │ │
│  │       │             │              │                   │ │
│  │       └─────────────┴──────────────┘                   │ │
│  │                     │                                   │ │
│  │       ┌─────────────┴──────────────┐                   │ │
│  │       │     Pinia Store Layer       │                   │ │
│  │       └─────────────┬──────────────┘                   │ │
│  │                     │                                   │ │
│  │       ┌─────────────┴──────────────┐                   │ │
│  │       │   IPC Bridge (Preload)      │                   │ │
│  │       └─────────────┬──────────────┘                   │ │
│  └───────────────────────┼─────────────────────────────────┘ │
│                          │                                   │
│  ┌───────────────────────┼─────────────────────────────────┐ │
│  │              Main Process                              │ │
│  │                                                         │ │
│  │  ┌─────────────────────────────────────────────┐      │ │
│  │  │         IPC Handlers                         │      │ │
│  │  └────┬──────────┬──────────┬──────────────────┘      │ │
│  │       │          │          │                          │ │
│  │  ┌────▼────┐ ┌───▼──────┐ ┌▼─────────────┐           │ │
│  │  │ SQLite  │ │ AI Core  │ │ Sync Engine  │           │ │
│  │  │Drizzle │ │ Agents   │ │ (Yjs + Queue)│           │ │
│  │  └─────────┘ └────┬─────┘ └──────┬───────┘           │ │
│  └───────────────────┼────────────────┼───────────────────┘ │
└─────────────────────┼────────────────┼─────────────────────┘
                      │                │
         ┌────────────▼────────────┐   │
         │   External AI APIs      │   │
         │  • OpenAI               │   │
         │  • Anthropic            │   │
         │  • Google AI            │   │
         └─────────────────────────┘   │
                                       │
         ┌─────────────────────────────▼────┐
         │  Real-time Collaboration         │
         │  • Liveblocks / Supabase         │
         │  • WebSocket                     │
         │  • CRDT Sync                     │
         └──────────────────────────────────┘
```

## Data Flow: AI Task Generation

```
1. User Input
   └→ "Create project plan for e-commerce site"

2. Renderer Process
   └→ aiStore.generateProject(prompt)
   └→ IPC: 'ai:generate-project'

3. Main Process
   └→ aiHandlers['ai:generate-project']
   └→ AI Agent Orchestrator
       ├→ Select Model (GPT-4 / Claude)
       ├→ Apply Prompt Template
       └→ Stream Response

4. AI Response (Streamed)
   └→ {
       project: { title, description },
       tasks: [
         { title, description, assignee: "AI" },
         ...
       ]
     }

5. Save to SQLite
   └→ projectRepository.create(project)
   └→ taskRepository.createMany(tasks)

6. Sync Queue
   └→ Add to offline queue
   └→ Background sync to Supabase

7. UI Update
   └→ Pinia store updated
   └→ Vue components re-render
   └→ Show kanban board
```

## Security Considerations

### 1. API Key Management
- Store in OS keychain (macOS Keychain, Windows Credential Manager)
- Never in localStorage or config files
- Encrypt in SQLite with machine-specific key

### 2. IPC Security
- Context isolation enabled
- No `nodeIntegration` in renderer
- Validate all IPC messages
- Rate limiting on expensive operations

### 3. Plugin Sandboxing
- Separate V8 context
- Limited API surface
- Permission system (e.g., "filesystem", "network")
- Code review for marketplace plugins

### 4. Content Security Policy
```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               script-src 'self';
               style-src 'self' 'unsafe-inline';
               connect-src 'self' https://api.openai.com https://*.supabase.co">
```

## Performance Optimization

### 1. Code Splitting
```typescript
// vite.config.ts
export default {
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'monaco-editor': ['monaco-editor'],
          'ai-core': ['openai', '@anthropic-ai/sdk'],
          'charts': ['echarts'],
        },
      },
    },
  },
};
```

### 2. Virtual Scrolling
- Use `vue-virtual-scroller` for large task lists
- Render only visible items (60fps goal)

### 3. Web Workers
```typescript
// Heavy AI processing in worker
const aiWorker = new Worker(
  new URL('./workers/ai-processor.ts', import.meta.url),
  { type: 'module' }
);
```

### 4. Database Indexing
```typescript
// Drizzle schema
export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  status: text('status').notNull(),
  // ...
}, (table) => ({
  projectIdx: index('project_idx').on(table.projectId),
  statusIdx: index('status_idx').on(table.status),
}));
```

## Scalability Path

### Phase 1: Desktop MVP (Current)
- Local SQLite
- Direct API calls
- Single-user focus

### Phase 2: Team Collaboration
- Supabase/Liveblocks integration
- Multi-user sync
- Role-based permissions

### Phase 3: Enterprise (Future)
- Optional self-hosted server
- SSO integration
- Audit logging
- Advanced analytics

### Phase 4: Platform (Vision)
- Public API
- Marketplace for plugins
- White-label options
