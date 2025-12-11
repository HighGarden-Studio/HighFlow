# AI Workflow Manager

> AI-powered project and task management desktop application with real-time collaboration

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.4-brightgreen.svg)](https://vuejs.org/)
[![Electron](https://img.shields.io/badge/Electron-29-blue.svg)](https://www.electronjs.org/)

## 🌟 Features

### Core Functionality

- 🤖 **AI-Powered Project Generation**: Automatically create structured projects from natural language prompts
- 📊 **Kanban & Timeline Views**: Visual task management with drag-and-drop
- 🧠 **Multi-AI Agent Support**: Integrate GPT-4, Claude, Gemini simultaneously
- 🔌 **MCP Integration**: Extensible AI capabilities via Model Context Protocol
- 👥 **Real-time Collaboration**: Simultaneous editing with CRDT conflict resolution
- 💬 **Comments & Mentions**: Threaded discussions with @mentions
- ⏱️ **Time Tracking**: Built-in timers and time estimates
- 📈 **AI Cost Analytics**: Track and analyze API usage costs
- 🔧 **Custom Workflows**: Visual automation builder (no code required)
- 🔗 **Integrations**: Git, Slack, Discord, webhooks

### Technical Highlights

- ⚡ **Offline-First**: Local SQLite database with background sync
- 🔒 **Secure**: API keys stored in OS keychain
- 🎨 **Modern UI**: Accessible, customizable interface
- 🔍 **Powerful Search**: Full-text search with command palette
- 🧩 **Plugin System**: Extensible architecture
- 🌐 **Cross-Platform**: Windows, macOS, Linux

## 📸 Screenshots

_Coming soon_

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+ (recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/workflow-manager.git
cd workflow-manager

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Add your API keys to .env
# OPENAI_API_KEY=sk-...
# ANTHROPIC_API_KEY=sk-ant-...
```

### Development

```bash
# Start development server
pnpm dev:electron

# In another terminal, run database migrations
pnpm db:migrate

# Open Drizzle Studio (database GUI)
pnpm db:studio
```

### Build

```bash
# Build for current platform
pnpm build

# Build for specific platforms
pnpm build:mac
pnpm build:win
pnpm build:linux
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Electron App                         │
│                                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │         Vue 3 Renderer (Frontend)                │  │
│  │  • Modular feature architecture                  │  │
│  │  • Pinia state management                        │  │
│  │  • Shadcn-vue + TailwindCSS                      │  │
│  └──────────────────┬──────────────────────────────┘  │
│                     │ IPC Bridge                       │
│  ┌──────────────────┴──────────────────────────────┐  │
│  │         Main Process (Backend)                   │  │
│  │  • SQLite + Drizzle ORM                          │  │
│  │  • AI Agent Orchestrator                         │  │
│  │  • Sync Engine (Yjs CRDT)                        │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
              │                          │
              ▼                          ▼
    ┌─────────────────┐      ┌──────────────────┐
    │  External APIs  │      │ Collaboration    │
    │  • OpenAI       │      │ • Liveblocks     │
    │  • Anthropic    │      │ • Supabase       │
    │  • Google AI    │      │ • WebSocket      │
    └─────────────────┘      └──────────────────┘
```

## 📚 Documentation

- [Architecture Decision Records](./ARCHITECTURE.md)
- [Project Structure](./PROJECT_STRUCTURE.md)
- [Development Roadmap](./DEVELOPMENT_ROADMAP.md)
- [Technology Stack Rationale](./TECH_STACK_RATIONALE.md)
- [Recent Changes](./docs/RECENT_CHANGES.md) - **Latest updates and context**
- [AI Quick Reference](./docs/AI_QUICK_REF.md) - **For AI assistants (Claude, Gemini)**
- [API Documentation](./docs/API.md) _(coming soon)_
- [Plugin Development Guide](./docs/PLUGIN_GUIDE.md) _(coming soon)_

## 🛠️ Technology Stack

| Category           | Technology                | Purpose                    |
| ------------------ | ------------------------- | -------------------------- |
| Desktop Framework  | Electron 29               | Cross-platform desktop app |
| Frontend Framework | Vue 3.4 (Composition API) | Reactive UI                |
| Language           | TypeScript 5.3 (strict)   | Type safety                |
| State Management   | Pinia                     | Centralized state          |
| UI Library         | Shadcn-vue + TailwindCSS  | Component library          |
| Local Database     | SQLite + Drizzle ORM      | Offline-first storage      |
| Real-time Sync     | Liveblocks / Supabase     | Collaboration              |
| CRDT               | Yjs                       | Conflict-free editing      |
| AI Integration     | Vercel AI SDK             | Multi-model support        |
| Build Tool         | Vite 5                    | Lightning-fast HMR         |
| Testing            | Vitest + Playwright       | Unit & E2E tests           |

See [TECH_STACK_RATIONALE.md](./TECH_STACK_RATIONALE.md) for detailed explanations.

## 🧪 Testing

```bash
# Run unit tests
pnpm test

# Run unit tests with UI
pnpm test --ui

# Run E2E tests
pnpm test:e2e

# Type checking
pnpm type-check
```

## 📦 Project Structure

```
workflow_manager/
├── electron/               # Electron main process
│   ├── main/              # Main process logic
│   │   ├── index.ts       # Entry point
│   │   ├── ipc/           # IPC handlers
│   │   ├── services/      # Background services
│   │   └── database/      # Drizzle schema & migrations
│   └── preload/           # Preload scripts (bridge)
├── src/
│   ├── renderer/          # Vue application
│   │   ├── modules/       # Feature modules
│   │   │   ├── projects/
│   │   │   ├── tasks/
│   │   │   ├── ai-assistant/
│   │   │   └── collaboration/
│   │   ├── shared/        # Shared components
│   │   └── plugins/       # Plugin system
│   └── core/              # Shared business logic
│       ├── ai/            # AI agents
│       ├── sync/          # Sync engine
│       └── types/         # TypeScript types
├── scripts/               # Build & dev scripts
├── tests/                 # Test suites
└── docs/                  # Documentation
```

See [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md) for complete details.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](./docs/CONTRIBUTING.md) first.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

```bash
# Lint code
pnpm lint

# Format code
pnpm format
```

## 📝 Roadmap

See [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md) for detailed milestones.

**Phase 1: Foundation & MVP** (Weeks 1-8)

- [x] Project setup
- [ ] Basic CRUD operations
- [ ] AI project generation
- [ ] Kanban board

**Phase 2: Collaboration** (Weeks 9-14)

- [ ] User authentication
- [ ] Real-time sync
- [ ] Comments & mentions

**Phase 3: Advanced Features** (Weeks 15-20)

- [ ] Timeline view
- [ ] AI assistant chat
- [ ] Automation workflows

**Phase 4: Integrations** (Weeks 21-24)

- [ ] Git integration
- [ ] Slack/Discord bots
- [ ] Template marketplace

**Phase 5: Release** (Weeks 25-28)

- [ ] Testing & polish
- [ ] Documentation
- [ ] v1.0 launch

## 🐛 Known Issues

- [ ] Drizzle migrations not yet implemented
- [ ] Auto-updater not configured
- [ ] Code signing certificates required for distribution

See [GitHub Issues](https://github.com/your-org/workflow-manager/issues) for full list.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Electron](https://www.electronjs.org/)
- [Vue.js](https://vuejs.org/)
- [Vercel AI SDK](https://sdk.vercel.ai/)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Shadcn-vue](https://www.shadcn-vue.com/)
- [Yjs](https://yjs.dev/)

## 📧 Contact

- Website: [example.com](https://example.com)
- Email: your.email@example.com
- Twitter: [@yourhandle](https://twitter.com/yourhandle)
- Discord: [Join our community](https://discord.gg/...)

---

**Built with ❤️ using AI-powered development tools**
