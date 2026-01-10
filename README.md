# HighFlow

> AI-powered project and task management desktop application with real-time collaboration.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.4-brightgreen.svg)](https://vuejs.org/)
[![Electron](https://img.shields.io/badge/Electron-29-blue.svg)](https://www.electronjs.org/)

## 🌟 Overview

HighFlow is a next-generation workflow manager designed to orchestrate complex tasks using multiple AI agents. It combines traditional project management tools (Kanban, DAG) with an intelligent execution engine that can automate tasks, generate content, and interact with your local environment.

## 🚀 Key Features

### 1. Project Management

HighFlow organizes your work into **Projects**.

- **AI-Generated Projects**: Create entire project structures from a single prompt.
- **Templates**: Use built-in or marketplace templates to kickstart standard workflows.
- **Project Structure**:
    - **Goal & Constraints**: Define high-level objectives that guide AI execution.
    - **Context Memory**: Persistent project-level memory (Glossary, Decision Log) shared across tasks.

### 2. Task Architecture

Tasks are the building blocks of HighFlow. They are not just static to-do items but executable units of work.

#### Task Types

| Type            | Icon | Description                                                                                             |
| :-------------- | :--- | :------------------------------------------------------------------------------------------------------ |
| **AI Task**     | 🤖   | Executed by an LLM (OpenAI, Anthropic, Gemini, Local). Generates text, code, or data based on a prompt. |
| **Script Task** | 📜   | Executes code (`TypeScript`, `Python`, `JavaScript`) securely. Can control workflow flow (branching).   |
| **Input Task**  | 📥   | Pauses execution to request user input (Text, File, Confirmation) or fetch external data (URL).         |
| **Output Task** | 📤   | Aggregates results from previous tasks and saves them (File, Slack, Google Docs).                       |

#### Task Dependencies & Control Flow

HighFlow supports complex dependency graphs:

- **Sequential**: Task B starts only after Task A completes.
- **DAG (Directed Acyclic Graph)**: Visualize and manage dependencies in a node graph view.
- **Triggers**:
    - **Dependency-based**: Run when specific parent tasks finish (All/Any logic).
    - **Time-based**: Scheduled execution (Cron or specific datetime).
    - **Conditional**: Script tasks can dynamically decide which next path to take.

#### Task Settings

Each task can be granularly configured:

- **AI Configuration**: Select specific Provider (e.g., Anthropic) and Model (e.g., Claude 3.5 Sonnet) per task.
- **Retries**: Configure auto-retry attempts on failure.
- **Context Handling**: Choose which previous task results included in the context.
- **Review Policy**:
    - **Auto-Review**: Have a second AI model review the primary AI's work before marking as Done.
    - **Human-in-the-loop**: Force manual approval before proceeding.

### 3. Intelligence & Operators

Operators are specialized AI personas tailored for specific roles.

- **Library**: Manage your collection of Operators (e.g., "Senior Dev", "QA Engineer", "Technical Writer").
- **Customization**:
    - **System Prompt**: Define the persona, tone, and strict rules.
    - **Model Preference**: Bind an operator to a specific capable model (e.g., GPT-4 for logic, Haiku for speed).
    - **Capabilities**: Assign specific tools (MCP servers) to operators.
- **Assignment**: Drag-and-drop Operators onto tasks to assign them as the executor.

### 4. Marketplace

A built-in hub to share and expand capabilities.

- **Explore**: Browse Projects, Operators, and Script Templates created by the community.
- **Categories**: Filter by Data Processing, Automation, Content Creation, and more.
- **Detailed Views**:
    - **Preview Graphs**: See the workflow structure before importing.
    - **Reviews**: Read user ratings and comments.
    - **Version History**: Track updates and compatibility.
- **Import/Export**: detailed flow to package your local projects as shareable templates.
- **Monetization**: (Coming Soon) Buy and sell premium workflows using Credits.

### 5. Connectivity (MCP)

HighFlow fully supports the **Model Context Protocol (MCP)**.

- **Server Management**: Connect to local or remote MCP servers.
- **Tool Access**: Give AI tasks access to real-time data and tools (Filesystem, Git, Browsing, Database).
- **Visual Config**: Managing MCP server connections and capabilities directly from Settings.

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
