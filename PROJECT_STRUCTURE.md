# HighFlow - Project Structure

## Directory Layout

```
workflow_manager/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
│
├── electron/
│   ├── main/
│   │   ├── index.ts                    # Main process entry
│   │   ├── ipc/                        # IPC handlers
│   │   │   ├── ai-handlers.ts
│   │   │   ├── project-handlers.ts
│   │   │   ├── sync-handlers.ts
│   │   │   └── index.ts
│   │   ├── services/
│   │   │   ├── auto-updater.ts
│   │   │   ├── native-integration.ts   # OS-specific features
│   │   │   ├── background-sync.ts
│   │   │   └── window-manager.ts
│   │   └── database/
│   │       ├── schema.ts               # Drizzle schema
│   │       ├── migrations/
│   │       └── client.ts
│   │
│   ├── preload/
│   │   ├── index.ts                    # Preload script
│   │   └── api.ts                      # Bridge API
│   │
│   └── build/
│       ├── icon.icns                   # macOS icon
│       ├── icon.ico                    # Windows icon
│       └── icon.png                    # Linux icon
│
├── src/
│   ├── renderer/
│   │   ├── main.ts                     # Vue app entry
│   │   ├── App.vue
│   │   │
│   │   ├── modules/                    # Feature modules
│   │   │   ├── projects/
│   │   │   │   ├── components/
│   │   │   │   │   ├── KanbanBoard.vue
│   │   │   │   │   ├── TimelineView.vue
│   │   │   │   │   └── ProjectCard.vue
│   │   │   │   ├── composables/
│   │   │   │   │   ├── useProject.ts
│   │   │   │   │   └── useDragDrop.ts
│   │   │   │   ├── stores/
│   │   │   │   │   └── projectStore.ts
│   │   │   │   └── types.ts
│   │   │   │
│   │   │   ├── tasks/
│   │   │   │   ├── components/
│   │   │   │   ├── composables/
│   │   │   │   └── stores/
│   │   │   │
│   │   │   ├── ai-assistant/
│   │   │   │   ├── components/
│   │   │   │   │   ├── ChatInterface.vue
│   │   │   │   │   ├── ModelSelector.vue
│   │   │   │   │   └── PromptTemplates.vue
│   │   │   │   ├── composables/
│   │   │   │   │   ├── useAIChat.ts
│   │   │   │   │   └── useModelSwitch.ts
│   │   │   │   └── stores/
│   │   │   │       └── aiStore.ts
│   │   │   │
│   │   │   ├── collaboration/
│   │   │   │   ├── components/
│   │   │   │   │   ├── CollaboratorsList.vue
│   │   │   │   │   ├── CommentThread.vue
│   │   │   │   │   └── PresenceCursors.vue
│   │   │   │   ├── composables/
│   │   │   │   │   ├── usePresence.ts
│   │   │   │   │   └── useYjs.ts
│   │   │   │   └── stores/
│   │   │   │       └── collabStore.ts
│   │   │   │
│   │   │   ├── automation/
│   │   │   │   ├── components/
│   │   │   │   │   ├── WorkflowBuilder.vue
│   │   │   │   │   └── TriggerConfig.vue
│   │   │   │   └── engine/
│   │   │   │       ├── workflow-executor.ts
│   │   │   │       └── trigger-registry.ts
│   │   │   │
│   │   │   ├── integrations/
│   │   │   │   ├── git/
│   │   │   │   ├── slack/
│   │   │   │   ├── discord/
│   │   │   │   └── webhooks/
│   │   │   │
│   │   │   ├── templates/
│   │   │   │   ├── components/
│   │   │   │   └── marketplace/
│   │   │   │
│   │   │   ├── analytics/
│   │   │   │   ├── components/
│   │   │   │   │   ├── TimeTracker.vue
│   │   │   │   │   ├── CostAnalysis.vue
│   │   │   │   │   └── UsageCharts.vue
│   │   │   │   └── stores/
│   │   │   │
│   │   │   └── settings/
│   │   │       ├── components/
│   │   │       └── stores/
│   │   │
│   │   ├── shared/                     # Shared UI components
│   │   │   ├── components/
│   │   │   │   ├── ui/                 # Shadcn-vue components
│   │   │   │   │   ├── button.vue
│   │   │   │   │   ├── dialog.vue
│   │   │   │   │   ├── dropdown.vue
│   │   │   │   │   └── ...
│   │   │   │   ├── layout/
│   │   │   │   │   ├── AppLayout.vue
│   │   │   │   │   ├── Sidebar.vue
│   │   │   │   │   └── TopBar.vue
│   │   │   │   └── common/
│   │   │   │       ├── CommandPalette.vue
│   │   │   │       ├── SearchBar.vue
│   │   │   │       └── NotificationCenter.vue
│   │   │   │
│   │   │   ├── composables/            # Shared composables
│   │   │   │   ├── useAuth.ts
│   │   │   │   ├── useOfflineSync.ts
│   │   │   │   ├── useSearch.ts
│   │   │   │   └── useKeyboardShortcuts.ts
│   │   │   │
│   │   │   └── utils/
│   │   │       ├── date.ts
│   │   │       ├── format.ts
│   │   │       └── validation.ts
│   │   │
│   │   ├── plugins/                    # Plugin system
│   │   │   ├── plugin-manager.ts
│   │   │   ├── plugin-api.ts
│   │   │   └── built-in/
│   │   │       ├── markdown-plugin.ts
│   │   │       └── mcp-plugin.ts
│   │   │
│   │   ├── router/
│   │   │   ├── index.ts
│   │   │   └── routes.ts
│   │   │
│   │   ├── stores/
│   │   │   ├── index.ts                # Pinia setup
│   │   │   ├── user.ts
│   │   │   └── app.ts
│   │   │
│   │   └── assets/
│   │       ├── styles/
│   │       │   ├── main.css
│   │       │   └── tailwind.css
│   │       └── icons/
│   │
│   └── core/                           # Shared business logic
│       ├── ai/
│       │   ├── agents/
│       │   │   ├── base-agent.ts
│       │   │   ├── openai-agent.ts
│       │   │   ├── claude-agent.ts
│       │   │   ├── gemini-agent.ts
│       │   │   └── agent-orchestrator.ts
│       │   ├── mcp/
│       │   │   ├── mcp-client.ts
│       │   │   └── mcp-server-registry.ts
│       │   └── prompts/
│       │       ├── project-generation.ts
│       │       └── task-breakdown.ts
│       │
│       ├── sync/
│       │   ├── sync-engine.ts
│       │   ├── conflict-resolver.ts
│       │   ├── offline-queue.ts
│       │   └── crdt/
│       │       ├── yjs-provider.ts
│       │       └── awareness.ts
│       │
│       ├── database/
│       │   ├── repositories/
│       │   │   ├── project-repository.ts
│       │   │   ├── task-repository.ts
│       │   │   └── user-repository.ts
│       │   └── migrations/
│       │
│       └── types/
│           ├── project.ts
│           ├── task.ts
│           ├── user.ts
│           └── common.ts
│
├── server/                             # Optional lightweight server
│   ├── index.ts                        # Express server for webhooks
│   ├── routes/
│   │   ├── webhooks.ts
│   │   └── oauth.ts
│   └── middleware/
│
├── tests/
│   ├── unit/
│   │   └── vitest.config.ts
│   ├── e2e/
│   │   ├── playwright.config.ts
│   │   └── specs/
│   └── fixtures/
│
├── scripts/
│   ├── dev.ts                          # Development script
│   ├── build.ts                        # Build script
│   └── migrate.ts                      # DB migration script
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── PLUGIN_GUIDE.md
│   └── CONTRIBUTING.md
│
├── .vscode/
│   ├── extensions.json
│   ├── settings.json
│   └── launch.json
│
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── electron-builder.yml
├── tailwind.config.js
├── drizzle.config.ts
└── .env.example

```

## Key Design Principles

### 1. Module Isolation
- Each feature module is self-contained
- Clear boundaries between modules
- Shared code only in `shared/` and `core/`

### 2. Type Safety
- Strict TypeScript across the board
- Shared types in `core/types/`
- API contracts defined upfront

### 3. Plugin Architecture
- Plugin API with lifecycle hooks
- Sandboxed execution environment
- Hot reloading support

### 4. Offline-First
- Local SQLite as source of truth
- Background sync with retry logic
- Conflict resolution with CRDT

### 5. Performance
- Code splitting by module
- Lazy loading for heavy features
- Virtual scrolling for large lists
- Web Workers for heavy computation

## Technology Stack Mapping

| Layer | Technology | Location |
|-------|-----------|----------|
| Desktop Shell | Electron 28+ | `electron/` |
| Frontend Framework | Vue 3.4+ | `src/renderer/` |
| State Management | Pinia + Pinia Persistedstate | `src/renderer/stores/` |
| UI Components | Shadcn-vue + TailwindCSS v4 | `src/renderer/shared/components/ui/` |
| Local Database | SQLite + Drizzle ORM | `electron/main/database/` |
| Realtime Sync | Supabase Realtime | `src/core/sync/` |
| CRDT | Yjs | `src/core/sync/crdt/` |
| AI Integration | Vercel AI SDK | `src/core/ai/` |
| Build Tool | Vite 5+ | `vite.config.ts` |
| Testing | Vitest + Playwright | `tests/` |
| Package Manager | pnpm | `pnpm-lock.yaml` |
