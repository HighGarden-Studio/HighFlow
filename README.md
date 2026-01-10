# HighFlow

> AI-powered project and task management desktop application with real-time collaboration.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.4-brightgreen.svg)](https://vuejs.org/)
[![Electron](https://img.shields.io/badge/Electron-29-blue.svg)](https://www.electronjs.org/)

## 🌟 Overview

HighFlow is a next-generation workflow manager designed to orchestrate complex tasks using multiple AI agents. It combines traditional project management tools (Kanban, DAG) with an intelligent execution engine that can automate tasks, generate content, and interact with your local environment.

## 🚀 Key Features

### 1. Advanced Task Capabilities

Tasks in HighFlow are powerful execution units with extensive automation features:

- **⚡️ Parallel Execution**: Run multiple independent tasks simultaneously to drastically reduce workflow completion time.
- **👀 Auto-Review**: Automatically assign a secondary "Reviewer AI" to critique the work of the primary "Executor AI". The task only proceeds if it passes this automated quality gate.
- **✅ Auto-Approve**: For trusted workflows, bypass manual checks and let the AI mark tasks as "Done" immediately upon successful generation.
- **🔗 Webhooks**: Trigger external APIs automatically when a task is completed, allowing integration with CI/CD pipelines, Slack notifications, or custom backends.
- **� Result Verification**: All task outputs are strictly validated against defined expected formats (JSON, Markdown, Code) before being accepted.
- **�️ Result Preview**: Instantly preview generated artifacts (Code, Diagrams, Markdown, Data Tables) directly within the task card without leaving the view.

### 2. Intelligent Operators

Operators are more than just chatbots—they are specialized, reusable AI personas designed for specific jobs.

- **Role-Based Definition**: Combines a robust **Rule-based System Prompt** with specific behavioral constraints.
- **Reusable Presets**: Save specific combinations of **AI Provider** (e.g., Anthropic) and **Model** (e.g., Claude 3.5 Sonnet) as a preset attached to an operator.
- **Drag-and-Drop Assignment**: Simply drag an Operator from your library and drop it onto any task to instantly assign that persona and its configuration to the task.
- **Tool Binding**: Equip operators with specific MCP tools (e.g., "Give 'Database Admin' operator access to PostgreSQL MCP").

### 3. Hierarchical Configuration

HighFlow applies settings in a strict priority order, allowing for both global consistency and granular control:

1.  **Global Settings 🌍**:
    - Set the default AI Provider and Model for the entire application.
    - Define global API keys and MCP server connections.
2.  **Project Settings 📂**:
    - Override defaults for a specific project (e.g., "Use GPT-4o for this coding project").
    - Define project-wide context and memory (Glossary, Constraints).
3.  **Task Settings 📝**:
    - The highest priority. Override everything for a single task.
    - Example: "Use 'Claude 3 Haiku' for this specific translation task to save costs," even if the project defaults to GPT-4.

### 4. Marketplace

A built-in hub to share and expand capabilities.

- **Explore**: Browse Projects, Operators, and Script Templates created by the community.
- **Import**: One-click import of complex workflows and operators directly into your library.
- **Compatibility Checks**: Automatically verifies if you have the required AI providers and MCP servers installed before importing.

### 5. Connectivity (Model Context Protocol - MCP)

HighFlow fully implements the **Model Context Protocol (MCP)**, enabling AI agents to safely interact with external systems and data.

- **Universal Connection**: Connect to any MCP-compliant server (Filesystem, Git, Postgres, Brave Search, etc.).
- **Local & Remote**: Run MCP servers locally on your machine or connect to remote instances.
- **Secure Access**: Granularly control which tools an AI agent can access.
- **Visual Management**: specific settings panel to install, configure, and debug MCP servers without touching config files.

---

## 🤖 Supported AI Providers

HighFlow integrates with a vast array of AI providers.

### ✅ Supported Now

- **OpenAI**: GPT-4, GPT-4o, GPT-3.5
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus/Haiku
- **Google AI**: Gemini 1.5 Pro/Flash, Gemini 2.0 (Preview), PaLM
- **Groq**: Llama 3, Mixtral (Ultra-fast inference)
- **Mistral AI**: Mistral Large, Medium, Small
- **LM Studio**: Local LLM server integration
- **HighFlow Default**: Built-in cloud credit system

### 🏠 Local Agents (First-Class Support)

Run completely private, offline AI agents directly within HighFlow:

- **Ollama**: Run Llama 3, Mistral, Gemma locally.
- **Local AI**: Connect to any OpenAI-compatible local endpoint.

### 🚧 Coming Soon

- **Azure OpenAI**: Enterprise-grade Azure integration
- **Perplexity**: Real-time web search LLMs
- **Cohere**: Command R+, R models
- **Together AI**: Open-source models (Llama, Mixtral)
- **Fireworks AI**: Fast inference platform
- **DeepSeek**: Specialized Coding models
- **OpenRouter**: Aggregated AI access
- **Hugging Face**: Access to thousands of open models
- **Replicate**: Cloud inference for open-source models
- **Design AI**: Figma AI, Galileo AI, Uizard (UI/UX generation)
- **Media AI**: Stability AI, Runway, Pika (Image/Video), ElevenLabs, Suno (Audio)
- **Regional**: Zhipu AI, Moonshot, Baidu ERNIE, Alibaba Qwen

---

## 🛠 Project Structure

The codebase is organized as a standard Electron + Vue application:

```
workflow_manager/
├── electron/                   # Main Process (Backend)
│   ├── main/
│   │   ├── database/           # SQLite schema (Drizzle ORM) & migrations
│   │   ├── services/           # Core logic (AI Execution, Local Agents)
│   │   ├── ipc/                # IPC Handlers (Communication bridge)
│   │   └── index.ts            # App Entry point
│   └── preload/                # Preload scripts (Context Isolation)
├── src/                        # Renderer Process (Frontend)
│   ├── renderer/
│   │   ├── api/                # IPC client mapping
│   │   ├── components/         # Vue Components
│   │   │   ├── marketplace/    # Marketplace UI Cards & Modals
│   │   │   ├── project/        # Kanban, DAG, Project Settings
│   │   │   ├── settings/       # App Settings (AI Providers, MCP)
│   │   │   └── task/           # Task Detail, Result Views
│   │   ├── stores/             # Pinia State Stores (Task, Project, Settings)
│   │   ├── views/              # Main Route Views (Home, Project, Marketplace)
│   │   └── App.vue             # Root Component
│   ├── core/
│   │   └── types/              # Shared TypeScript Interfaces (DB, API)
└── scripts/                    # Build & Dev utilities
```

## 💻 Technical Stack

- **Runtime**: Electron 29 (Node.js)
- **Frontend**: Vue 3.4, TypeScript, TailwindCSS, Shadcn-vue
- **State Management**: Pinia
- **Database**: SQLite (local) with Drizzle ORM
- **AI Orchestration**: Vercel AI SDK + Custom Execution Engine
- **Graphing**: Vue Flow (DAG visualization)

## 🏃 Quick Start

### Prerequisites

- Node.js 18+
- pnpm

### Installation

```bash
# Install dependencies
pnpm install

# Setup environment
cp .env.example .env

# Run development mode
pnpm dev:electron
```

### Database Management

```bash
# Push schema changes to local DB
pnpm db:migrate

# Open Database GUI
pnpm db:studio
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for details on our code of conduct and development process.

## 📄 License

MIT License. See [LICENSE](./LICENSE) for details.
