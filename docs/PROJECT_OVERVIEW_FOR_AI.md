# AI Workflow Manager - Complete Project Overview

> **Version**: 0.1.0  
> **Last Updated**: 2025-12-11  
> **For**: AI Assistants (Claude, Gemini, GPT) and New Developers

---

## 📋 Table of Contents

1. [What is This Project?](#what-is-this-project)
2. [Core Vision & Goals](#core-vision--goals)
3. [Key Features](#key-features)
4. [Architecture Overview](#architecture-overview)
5. [Technology Stack](#technology-stack)
6. [Data Model](#data-model)
7. [User Workflows](#user-workflows)
8. [Component Structure](#component-structure)
9. [Services & Business Logic](#services--business-logic)
10. [AI Integration](#ai-integration)
11. [Project Structure](#project-structure)
12. [Key Concepts](#key-concepts)
13. [Development Workflow](#development-workflow)

---

## What is This Project?

### Project Name

**AI Workflow Manager** (also known as "HighAIManager")

### Purpose

An **offline-first, AI-powered desktop application** for project and task management that enables:

- Automated project planning using multiple AI providers
- Intelligent task execution with AI agents
- Local script execution (JavaScript, Python, Bash)
- Real-time collaboration with CRDT-based conflict resolution
- Extensible AI capabilities through MCP (Model Context Protocol)

### Target Users

1. **Developers**: Managing software projects with AI assistance
2. **Product Managers**: AI-powered project planning and tracking
3. **Teams**: Collaborative task management with AI agents
4. **Power Users**: Automation enthusiasts wanting local + AI hybrid workflows

### Unique Value Proposition

Unlike traditional task managers or pure AI tools:

- ✅ **Hybrid Execution**: Both AI providers AND local scripts
- ✅ **Offline-First**: Local SQLite database, works without internet
- ✅ **Multi-AI**: Switch between GPT-4, Claude, Gemini, local models
- ✅ **Operator System**: Template-based AI personalities for different roles
- ✅ **MCP Integration**: Extensible AI with tools and resources
- ✅ **Desktop Native**: Electron app with full system access

---

## Core Vision & Goals

### Vision Statement

"Empower users to manage complex projects by combining the intelligence of AI with the reliability of local automation, all in a privacy-focused desktop environment."

### Primary Goals

1. **AI-Augmented Productivity**: Let AI handle routine planning and execution
2. **Flexibility**: Support both cloud AI and local scripts/models
3. **Privacy**: Keep sensitive data local, optional cloud sync
4. **Extensibility**: Plugin system for custom integrations
5. **Collaboration**: Real-time multi-user editing with conflict resolution

### Non-Goals

- ❌ Web-based SaaS platform
- ❌ Mobile-first experience
- ❌ Simple todo list (too basic)
- ❌ Full project management suite (too complex)

---

## Key Features

### 1. Project Management

- 📁 **Project Creation**: Manual or AI-generated from prompts
- 🔗 **Local Repository Detection**: Auto-detect Git projects
- 📊 **Multiple Views**: Kanban, Timeline (Gantt), List
- 🎯 **Goal Tracking**: Link tasks to project objectives

### 2. Task Management

#### AI Tasks

- 🤖 **Multi-Provider Support**: GPT-4, Claude 3.5, Gemini 2.0
- 💬 **Prompt Engineering**: Generate and enhance prompts
- 🎭 **Operator Override**: Use predefined AI personalities
- 📊 **Result Tracking**: Store and version AI outputs
- ⚡ **Streaming Responses**: Real-time AI output display

#### Script Tasks

- 💻 **Local Execution**: Run JavaScript, Python, Bash scripts
- 🔧 **Monaco Editor**: Full-featured code editor
- 📝 **Macro Support**: Template variables (project.name, task:N)
- 🔐 **Sandboxed**: Isolated execution environment (vm2)

#### Task Features

- 🔄 **Dependencies**: Task chains and triggers
- ⏰ **Scheduling**: Cron-based automation
- 🔔 **Notifications**: Custom notification rules
- 🏷️ **Tagging**: Flexible categorization
- 👥 **Assignment**: User and operator assignment
- ⏱️ **Time Tracking**: Estimate and actual time
- 📋 **Subtasks**: Hierarchical task breakdown
- 🎨 **Priorities**: Urgent, High, Medium, Low

### 3. AI Integration

#### Supported Providers

- **OpenAI**: GPT-4, GPT-3.5 Turbo
- **Anthropic**: Claude 3.5 Sonnet, Claude 3 Opus/Haiku
- **Google**: Gemini 2.0 Flash, Gemini 1.5 Pro
- **Local Agents**: Antigravity, Codex, Claude Code (via MCP)
- **LM Studio**: Local model inference

#### Provider Features

- 🔑 **API Key Management**: Secure storage in OS keychain
- 💰 **Cost Tracking**: Monitor API usage and costs
- 🎯 **Model Selection**: Choose optimal model per task
- 🔧 **Custom Parameters**: Temperature, max tokens, etc.
- 🔄 **Fallback Support**: Auto-switch on provider failure

#### MCP (Model Context Protocol)

- 🔌 **Plugin Architecture**: External tools and resources
- 📂 **Filesystem Access**: Read/write files
- 💬 **Slack Integration**: Post messages, read channels
- 🌐 **HTTP Requests**: Make API calls
- 🗄️ **Database Access**: Query databases
- ⚙️ **Custom Servers**: Write your own MCP servers

### 4. Operator System

**Operators** are reusable AI configurations with:

- 🎭 **Role Definitions**: Software Engineer, Product Manager, etc.
- 📜 **System Prompts**: Pre-configured instructions
- 🤖 **AI Settings**: Provider, model, parameters
- 📊 **Presets**: Ready-to-use templates

When assigned to a task, operator settings **override** task-level AI settings.

### 5. Collaboration (Planned)

- 👥 **Multi-User**: Real-time editing
- 🔄 **CRDT Sync**: Yjs-based conflict resolution
- 🔌 **Backends**: Liveblocks, Supabase, self-hosted
- 💬 **Comments**: Threaded discussions
- 🏷️ **Mentions**: @user notifications

### 6. Automation

- 🔗 **Task Dependencies**: Trigger on completion
- ⏰ **Scheduled Tasks**: Cron expressions
- 🔔 **Notifications**: Desktop, Slack, Discord
- 🔄 **Auto-Review**: AI quality checks
- 🎯 **Conditional Logic**: If/then workflows

### 7. Integrations

- 🐙 **Git**: Repository detection, commit tracking
- 💬 **Slack**: Send messages, webhooks
- 🎮 **Discord**: Bot integration
- 🌐 **Webhooks**: Generic HTTP callbacks
- 📊 **Export**: JSON, CSV, Markdown

---

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Desktop App                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Vue 3 Frontend (Renderer Process)          │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  UI Components (Vue SFC)                        │  │  │
│  │  │  • Kanban boards, Task cards                   │  │  │
│  │  │  • Monaco editor, Settings                     │  │  │
│  │  │  • Charts, Timeline                            │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  State Management (Pinia)                       │  │  │
│  │  │  • taskStore, projectStore                     │  │  │
│  │  │  • settingsStore, authStore                    │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  Client Services                                │  │  │
│  │  │  • AI providers, Workflow engine               │  │  │
│  │  │  • File upload, Search                         │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                         │ IPC Bridge (contextBridge)        │
│  ┌──────────────────────┴───────────────────────────────┐  │
│  │           Main Process (Node.js Backend)             │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  IPC Handlers                                   │  │  │
│  │  │  • task-handlers, project-handlers             │  │  │
│  │  │  • operator-handlers, mcp-handlers             │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  Services                                       │  │  │
│  │  │  • script-executor, task-scheduler             │  │  │
│  │  │  • notification-service, local-agent-session   │  │  │
│  │  │  • file-system-monitor                         │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  Database Layer                                 │  │  │
│  │  │  • SQLite (better-sqlite3)                     │  │  │
│  │  │  • Drizzle ORM                                 │  │  │
│  │  │  • Repositories (task, project, operator)      │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────┬──────────────────────┬───────────────────┘
                  │                      │
                  ▼                      ▼
        ┌─────────────────┐    ┌─────────────────┐
        │  External APIs  │    │  MCP Servers    │
        │  • OpenAI       │    │  • Filesystem   │
        │  • Anthropic    │    │  • Slack        │
        │  • Google AI    │    │  • Custom       │
        │  • LM Studio    │    └─────────────────┘
        └─────────────────┘
```

### Data Flow

#### Task Creation Flow

```
User Input (UI)
  ↓
Pinia Store (taskStore.createTask)
  ↓
IPC Call (window.electron.task.create)
  ↓
Main Process Handler (task-handlers.ts)
  ↓
Repository (task-repository.ts)
  ↓
SQLite Database
  ↓
Return Task Object
  ↓
Update Pinia Store
  ↓
UI Re-renders
```

#### AI Execution Flow

```
User Clicks "Run"
  ↓
taskStore.executeTask(taskId)
  ↓
IPC: window.electron.task.execute(taskId)
  ↓
Main: task-execution-handlers.ts
  ↓
Load Task + Project + Operator
  ↓
Determine Provider (task → operator → project)
  ↓
Create Provider Instance (AIServiceManager)
  ↓
Generate Prompt (with macros resolved)
  ↓
Stream to Provider API
  ↓
IPC Updates (streaming chunks)
  ↓
taskStore.executionProgress Map
  ↓
UI Shows Real-time Output
  ↓
Save Result to DB
  ↓
Update Task Status
```

#### Script Execution Flow

```
User Clicks "Run" (Script Task)
  ↓
IPC: window.electron.task.execute(taskId)
  ↓
Main: task-execution-handlers.ts
  ↓
Detect taskType === 'script'
  ↓
ScriptExecutor Service
  ↓
Load Script Content + Language
  ↓
Resolve Macros ({{project.name}}, etc.)
  ↓
Execute in Sandbox (vm2 or child_process)
  ↓
Return stdout/stderr
  ↓
Save Output to DB
  ↓
Update Task Status
```

---

## Technology Stack

### Frontend (Renderer Process)

| Technology        | Version | Purpose                                 |
| ----------------- | ------- | --------------------------------------- |
| **Vue 3**         | 3.4.21  | Reactive UI framework (Composition API) |
| **TypeScript**    | 5.3.3   | Type-safe development                   |
| **Pinia**         | 2.1.7   | State management                        |
| **Vue Router**    | 4.3.0   | Client-side routing                     |
| **TailwindCSS**   | 3.4.1   | Utility-first CSS                       |
| **Radix Vue**     | 1.5.3   | Headless UI components                  |
| **Monaco Editor** | 0.47.0  | Code editor (VS Code engine)            |
| **ECharts**       | 5.5.0   | Data visualization                      |
| **VueUse**        | 10.9.0  | Vue composition utilities               |

### Backend (Main Process)

| Technology         | Version | Purpose                        |
| ------------------ | ------- | ------------------------------ |
| **Electron**       | 29.0.1  | Desktop framework              |
| **Node.js**        | 22.0.0  | JavaScript runtime             |
| **TypeScript**     | 5.3.3   | Type-safe backend              |
| **SQLite**         | -       | Local database                 |
| **better-sqlite3** | 12.5.0  | Synchronous SQLite bindings    |
| **Drizzle ORM**    | 0.30.0  | Type-safe SQL ORM              |
| **vm2**            | 3.10.0  | Sandboxed JavaScript execution |
| **node-cron**      | 4.2.1   | Task scheduling                |

### AI & Services

| Technology        | Version | Purpose                    |
| ----------------- | ------- | -------------------------- |
| **OpenAI SDK**    | 4.28.4  | GPT integration            |
| **Anthropic SDK** | 0.18.0  | Claude integration         |
| **Google GenAI**  | 1.31.0  | Gemini integration         |
| **MCP SDK**       | 0.5.0   | Model Context Protocol     |
| **Vercel AI SDK** | 3.0.0   | Multi-provider abstraction |

### Collaboration (Planned)

| Technology      | Version | Purpose                     |
| --------------- | ------- | --------------------------- |
| **Yjs**         | 13.6.27 | CRDT for conflict-free sync |
| **y-websocket** | 2.1.0   | WebSocket sync provider     |
| **Supabase**    | 2.39.8  | Real-time backend           |
| **Socket.io**   | 4.8.1   | WebSocket server/client     |

### Build & Dev Tools

| Technology               | Version | Purpose                   |
| ------------------------ | ------- | ------------------------- |
| **Vite**                 | 5.1.4   | Lightning-fast build tool |
| **vite-plugin-electron** | 0.28.4  | Electron integration      |
| **ESLint**               | 8.57.0  | Code linting              |
| **Prettier**             | 3.2.5   | Code formatting           |
| **Vitest**               | 1.3.1   | Unit testing              |
| **Playwright**           | 1.42.0  | E2E testing               |

---

## Data Model

### Core Entities

#### 1. Projects

```typescript
interface Project {
    id: number; // Primary key
    name: string; // Project name
    description: string; // Project description
    status: 'active' | 'archived'; // Project status
    baseDevFolder: string | null; // Local repository path
    aiProvider: string | null; // Default AI provider
    aiModel: string | null; // Default AI model
    autoReview: boolean; // Enable AI auto-review
    autoReviewProvider: string | null;
    createdAt: string; // ISO timestamp
    updatedAt: string; // ISO timestamp
}
```

#### 2. Tasks

```typescript
type TaskType = 'ai' | 'script';
type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'needs_approval' | 'done';
type ScriptLanguage = 'javascript' | 'python' | 'bash';

interface Task {
    id: number;
    projectId: number; // Foreign key → projects
    parentTaskId: number | null; // For subtasks
    projectSequence: number; // #1, #2, #3 per project
    executionOrder: number | null; // Global execution order

    // Basic Info
    title: string;
    description: string;
    status: TaskStatus;
    priority: 'urgent' | 'high' | 'medium' | 'low';
    tags: string[]; // JSON array

    // Task Type
    taskType: TaskType; // 'ai' or 'script'

    // AI Task Fields
    generatedPrompt: string | null;
    enhancedPrompt: string | null;
    aiProvider: string | null;
    aiModel: string | null;
    temperature: number | null;
    maxTokens: number | null;
    expectedOutputFormat: string | null; // 'text', 'markdown', 'json', etc.

    // Script Task Fields
    scriptLanguage: ScriptLanguage | null;
    scriptContent: string | null;

    // Execution
    requiredMCPs: string[]; // JSON array of MCP server names
    outputContent: string | null; // AI/script output
    inputTokens: number | null; // AI token usage
    outputTokens: number | null;
    estimatedCost: number | null; // In USD
    errorMessage: string | null;

    // Operator Override
    assignedOperatorId: number | null; // Foreign key → operators

    // Dependencies & Triggers
    dependencies: number[]; // JSON array of task IDs
    triggerConfig: TriggerConfig | null;

    // Review
    autoReviewed: boolean;
    reviewScore: number | null; // 1-10
    reviewFeedback: string | null;
    reviewFailed: boolean;

    // Approval Flow
    confirmationRequest: ConfirmationRequest | null;

    // Notifications
    notificationConfig: NotificationConfig | null;

    // Subdivision
    isSubdivided: boolean; // If split into subtasks
    subtaskCount: number; // Number of children

    // Scheduling
    dueDate: string | null; // ISO timestamp
    estimatedMinutes: number | null;
    actualMinutes: number | null;

    // User Assignment
    assigneeId: number | null;

    // Metadata
    isPaused: boolean;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
}
```

#### 3. Operators

```typescript
interface Operator {
    id: number;
    name: string; // e.g., "Senior Software Engineer"
    avatar: string; // Emoji or icon
    role: string; // Job role classification
    description: string;
    systemPrompt: string; // Pre-configured instructions

    // AI Configuration
    aiProvider: string;
    aiModel: string;
    temperature: number;
    maxTokens: number;
    expectedOutputFormat: string;

    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}
```

#### 4. MCP Servers

```typescript
interface MCPServer {
    id: number;
    name: string; // Unique name
    type: 'stdio' | 'sse'; // Communication protocol
    command: string; // Executable path
    args: string[]; // Command arguments (JSON)
    env: Record<string, string>; // Environment variables (JSON)
    isActive: boolean;
    installed: boolean; // Auto-installed flag
    createdAt: string;
    updatedAt: string;
}
```

#### 5. Providers

```typescript
interface Provider {
    id: number;
    name: string; // 'openai', 'anthropic', etc.
    displayName: string; // 'OpenAI'
    apiKey: string; // Stored in keychain, not DB
    baseUrl: string | null; // For custom endpoints
    isActive: boolean;
    models: string[]; // JSON array of available models
    settings: Record<string, any>; // JSON provider-specific settings
    createdAt: string;
    updatedAt: string;
}
```

### Relationships

```
Projects (1) ──< (M) Tasks
Tasks (1) ──< (M) Tasks (parent-child)
Operators (1) ──< (M) Tasks
Projects (1) → (1?) Provider (default)
Tasks (1) → (1?) Provider (override)
Tasks (M) ──< (M) MCPServers (via requiredMCPs JSON)
```

---

## User Workflows

### 1. Create a Project

```
User clicks "New Project"
  ↓
Chooses: Manual or AI-Generated
  ↓
[Manual Path]
  → Enter project name and description
  → Optionally link local folder
  → Select default AI provider
  ↓
[AI Path]
  → Enter project description/requirements
  → AI generates:
    • Project name
    • Task breakdown
    • Timeline estimate
  → User reviews and confirms
  ↓
Project created
```

### 2. Create an AI Task

```
User clicks "Add Task" in Kanban
  ↓
Enter task title
  ↓
Click "Generate Prompt" (optional)
  → AI creates structured prompt
  ↓
Select AI provider & model
  ↓
Configure settings:
  • Temperature
  • Max tokens
  • Expected output format
  • Required MCPs
  ↓
Save task (status: TODO)
  ↓
Click "Run"
  ↓
AI executes, streams output
  ↓
[Auto-Review Enabled?]
  → Review AI evaluates output
  → Score < 7 → Status: IN_REVIEW
  → Score >= 7 → Status: DONE
  ↓
User reviews output
  ↓
Approve or retry
```

### 3. Create a Script Task

```
User clicks "Add Task"
  ↓
Select "Script Task" type
  ↓
Choose language (JavaScript/Python/Bash)
  ↓
Write script in Monaco editor
  ↓
Use macros:
  • {{project.name}}
  • {{task:1.output}}
  ↓
Save task
  ↓
Click "Run"
  ↓
Script executes locally
  ↓
Output saved to task
  ↓
Status → DONE
```

### 4. Use Operators

```
User navigates to Settings → Operators
  ↓
Click "Add Operator"
  ↓
Fill in:
  • Name: "Senior Software Engineer"
  • Role: "Developer"
  • System Prompt: "You are an expert..."
  • AI Provider: Claude 3.5 Sonnet
  ↓
Save operator
  ↓
Go to task card
  ↓
Drag operator icon onto task
  ↓
Task now uses operator's AI settings
```

### 5. Set Up MCP Servers

```
User navigates to Settings → MCP Servers
  ↓
Click "Add MCP Server"
  ↓
Select preset (Filesystem, Slack) or Custom
  ↓
Configure:
  • Command path
  • Arguments
  • Environment vars (API keys)
  ↓
Save and activate
  ↓
When creating task:
  → Select required MCPs
  → AI has access to those tools
```

---

## Component Structure

### Frontend Components

```
src/components/
├── assistant/              # AI Assistant features
│   ├── AIAssistant.vue
│   └── TaskPlanCard.vue
├── board/                  # Kanban board
│   ├── KanbanBoard.vue
│   ├── KanbanColumn.vue
│   ├── TaskCard.vue        # Main task card (2-row header)
│   └── DragAndDropContext.vue
├── collaboration/          # Real-time collab (planned)
│   ├── UserCursor.vue
│   └── PresenceIndicator.vue
├── common/                 # Reusable components
│   ├── CodeEditor.vue      # Monaco wrapper
│   ├── IconRenderer.vue    # Icon display
│   ├── MarkdownViewer.vue
│   ├── MacroInsertButton.vue
│   └── NotificationSettings.vue
├── project/                # Project management
│   ├── ProjectCreationWizard.vue
│   ├── ProjectInfoModal.vue
│   ├── ProjectInfoPanel.vue
│   └── OperatorPanel.vue
├── prompt/                 # Prompt engineering
│   ├── PromptEditor.vue
│   └── PromptEnhancer.vue
├── search/                 # Search & filtering
│   └── GlobalSearch.vue
├── settings/               # App settings
│   ├── SettingsView.vue
│   ├── ProvidersTab.vue
│   ├── MCPServersTab.vue
│   ├── OperatorsTab.vue
│   └── LocalAgentsTab.vue
├── setup/                  # Initial setup wizard
│   └── InitialSetupWizard.vue
├── task/                   # Task detail views
│   ├── TaskDetailPanel.vue # Main edit panel
│   ├── EnhancedResultPreview.vue
│   ├── VersionHistoryPanel.vue
│   ├── SubdivisionModal.vue
│   └── FileTreeItem.vue
├── timeline/               # Timeline/Gantt view
│   └── GanttChart.vue
└── workflow/               # Automation workflows
    ├── WorkflowBuilder.vue
    └── WorkflowNode.vue
```

### Views (Pages)

```
src/renderer/views/
├── HomeView.vue           # Dashboard
├── ProjectsView.vue       # Project list
├── ProjectDetailView.vue  # Project overview
├── KanbanBoardView.vue    # Kanban board
├── TimelineView.vue       # Timeline/Gantt
├── SettingsView.vue       # Settings
└── SetupView.vue          # Initial setup
```

---

## Services & Business Logic

### Main Process Services

#### 1. ScriptExecutor

**File**: `electron/main/services/script-executor.ts`

**Purpose**: Execute JavaScript, Python, Bash scripts locally

**Key Methods**:

```typescript
class ScriptExecutor {
    async executeScript(
        language: ScriptLanguage,
        code: string,
        context: Record<string, any>
    ): Promise<{ stdout: string; stderr: string }>;

    private executeJavaScript(code: string): Promise<any>;
    private executePython(code: string): Promise<any>;
    private executeBash(code: string): Promise<any>;
}
```

#### 2. TaskScheduler

**File**: `electron/main/services/task-scheduler.ts`

**Purpose**: Handle scheduled and triggered tasks

**Key Methods**:

```typescript
class TaskScheduler {
    scheduleCronTask(taskId: number, cronExpression: string): void;
    scheduleOneShotTask(taskId: number, datetime: Date): void;
    setupDependencyTrigger(taskId: number, dependencies: number[]): void;
    cancelSchedule(taskId: number): void;
}
```

#### 3. TaskNotificationService

**File**: `electron/main/services/task-notification-service.ts`

**Purpose**: Send notifications via multiple channels

**Channels**:

- Desktop notifications (Electron)
- Slack (via webhook or bot)
- Discord (via webhook)
- Email (planned)

#### 4. LocalAgentSession

**File**: `electron/main/services/local-agent-session.ts`

**Purpose**: Manage MCP servers and local AI agent connections

**Key Methods**:

```typescript
class LocalAgentSession {
    async startServer(config: MCPServerConfig): Promise<void>;
    async stopServer(serverId: number): Promise<void>;
    async sendRequest(serverId: number, request: any): Promise<any>;
    listAvailableTools(serverId: number): Promise<Tool[]>;
}
```

### Renderer Services

#### 1. AIServiceManager

**File**: `src/services/workflow/AIServiceManager.ts`

**Purpose**: Orchestrate AI provider instances

**Key Methods**:

```typescript
class AIServiceManager {
    async executeTask(task: Task, project: Project): Promise<string>;
    async streamResponse(task: Task, onChunk: (chunk: string) => void): Promise<void>;
    private createProviderInstance(type: string): BaseAIProvider;
}
```

#### 2. AI Providers

**Files**:

- `src/services/ai/providers/GPTProvider.ts`
- `src/services/ai/providers/ClaudeProvider.ts`
- `src/services/ai/providers/GeminiProvider.ts`

**Interface**:

```typescript
abstract class BaseAIProvider {
    abstract async generateResponse(prompt: string): Promise<string>;
    abstract async streamResponse(prompt: string, onChunk: (chunk: string) => void): Promise<void>;
    abstract estimateCost(inputTokens: number, outputTokens: number): number;
}
```

---

## AI Integration

### Provider Architecture

```
AIServiceManager
  ├─→ GPTProvider (OpenAI API)
  ├─→ ClaudeProvider (Anthropic API)
  ├─→ GeminiProvider (Google GenAI API)
  ├─→ LocalAgentProvider (via MCP)
  └─→ LMStudioProvider (Local inference)
```

### Provider Selection Logic

```typescript
function determineProvider(task, operator, project) {
    if (operator && operator.aiProvider) {
        return operator.aiProvider; // Operator override
    } else if (task.aiProvider) {
        return task.aiProvider; // Task-level
    } else if (project.aiProvider) {
        return project.aiProvider; // Project default
    } else {
        return 'gpt-4'; // Global default
    }
}
```

### MCP Integration

**Supported MCP Servers**:

1. **Filesystem**: Read/write files
2. **Slack**: Post messages, read channels
3. **Custom**: User-defined servers

**Example MCP Flow**:

```
User creates task
  ↓
Selects "requiredMCPs: ['filesystem', 'slack']"
  ↓
Task executes
  ↓
AIServiceManager detects MCP requirements
  ↓
Loads MCP tools from servers
  ↓
Includes tools in AI context
  ↓
AI can call tool functions:
  • filesystem.read('/path/to/file')
  • slack.postMessage({ channel, text })
  ↓
MCP server executes tool
  ↓
Returns result to AI
  ↓
AI continues with result
```

---

## Project Structure

```
workflow_manager/
├── electron/                    # Electron main process
│   ├── main/
│   │   ├── index.ts            # Main entry point
│   │   ├── database/
│   │   │   ├── client.ts       # SQLite connection
│   │   │   ├── schema.ts       # Drizzle schema
│   │   │   ├── migrator.ts     # Migration runner
│   │   │   ├── migrations/     # SQL migrations
│   │   │   └── repositories/   # Database repositories
│   │   ├── ipc/                # IPC handlers
│   │   │   ├── task-handlers.ts
│   │   │   ├── project-handlers.ts
│   │   │   ├── operator-handlers.ts
│   │   │   └── mcp-handlers.ts
│   │   └── services/           # Background services
│   │       ├── script-executor.ts
│   │       ├── task-scheduler.ts
│   │       ├── local-agent-session.ts
│   │       └── task-notification-service.ts
│   └── preload/
│       └── index.ts            # Context bridge
├── src/
│   ├── core/                   # Shared types & logic
│   │   └── types/
│   │       ├── database.ts     # Type definitions
│   │       ├── ai.ts
│   │       └── electron.d.ts
│   ├── renderer/               # Vue frontend
│   │   ├── main.ts            # Vue entry point
│   │   ├── App.vue
│   │   ├── router/            # Vue Router
│   │   ├── stores/            # Pinia stores
│   │   │   ├── taskStore.ts
│   │   │   ├── projectStore.ts
│   │   │   └── settingsStore.ts
│   │   └── views/             # Page components
│   ├── components/            # Vue components
│   ├── services/              # Client services
│   │   ├── ai/               # AI provider implementations
│   │   └── workflow/         # Workflow engine
│   └── utils/                # Utilities
│       ├── iconMapping.ts
│       └── macroResolver.ts
├── scripts/                   # Build & utility scripts
│   ├── dev.ts                # Development server
│   ├── migrate.ts            # Database migration
│   └── seed.ts               # Seed data
├── tests/                    # Test suites
├── docs/                     # Documentation
│   ├── AI_QUICK_REF.md
│   ├── RECENT_CHANGES.md
│   └── PROJECT_OVERVIEW_FOR_AI.md (this file)
├── vite.config.ts            # Vite configuration
├── package.json
└── README.md
```

---

## Key Concepts

### 1. Task Types

**AI Task**:

- Executed by AI provider (GPT, Claude, Gemini)
- Requires `aiProvider` and `generatedPrompt`
- Supports prompt enhancement, auto-review
- Can use Operators for predefined settings
- Can require MCP tools

**Script Task**:

- Executed locally (JavaScript, Python, Bash)
- Requires `scriptLanguage` and `scriptContent`
- Runs in sandboxed environment
- No AI Provider needed
- Supports macro variables

### 2. Operators

Think of Operators as **AI personality templates**:

- Pre-configured system prompts
- Specific provider & model
- Reusable across tasks
- Override task-level settings when assigned

Example Operators:

- "Senior Software Engineer" → Claude 3.5, detailed code reviews
- "Product Manager" → GPT-4, concise business analysis
- "Technical Writer" → Gemini, documentation generation

### 3. Macros

Template variables that get resolved at runtime:

**Task Macros**:

- `{{task:1}}` → Full output of task #1
- `{{task:1.output}}` → Just the output content
- `{{task:1.title}}` → Title of task #1

**Project Macros**:

- `{{project.name}}` → Project name
- `{{project.description}}` → Project description
- `{{project.baseDevFolder}}` → Repository path

**Usage**:

```javascript
// In script task:
const projectName = "{{project.name}}";
const previousResult = {{task:1.output}};
console.log(`Processing ${projectName}...`);
```

### 4. Dependencies & Triggers

**Dependencies**: Tasks that must complete before this task can run

- Listed as array of task IDs: `[1, 2, 3]`
- Status badge shows dependency count

**Triggers**: Automatic execution based on events

- **Dependency Trigger**: Run when all/any dependencies complete
- **Scheduled Trigger**: Cron expression or one-time datetime

### 5. Auto-Review

AI automatically evaluates another AI's output:

1. Task completes execution
2. If `autoReview` enabled, review AI analyzes output
3. Assigns score (1-10) and feedback
4. Score < 7 → Task status = `IN_REVIEW`, user must review
5. Score >= 7 → Task status = `DONE`, auto-approved

### 6. Subdivison

Break a large task into subtasks:

1. User clicks "Subdivide" on task
2. AI analyzes task and suggests subtasks
3. User reviews and confirms
4. Parent task becomes "group task" (not executable)
5. Subtasks are created as children
6. Parent shows progress bar based on subtask completion

---

## Development Workflow

### Getting Started

```bash
# Clone repository
git clone <repo-url>
cd workflow-manager

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env
# Add your API keys to .env

# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev:electron
```

### Development Commands

```bash
# Frontend dev server only
pnpm dev

# Electron app with hot reload
pnpm dev:electron

# Database management
pnpm db:migrate    # Run migrations
pnpm db:studio     # Open Drizzle Studio GUI
pnpm db:seed       # Seed test data

# Testing
pnpm test          # Unit tests
pnpm test:e2e      # E2E tests
pnpm test:coverage # Coverage report

# Linting & Formatting
pnpm lint          # ESLint
pnpm format        # Prettier

# Building
pnpm build         # Production build
pnpm build:mac     # macOS .dmg
pnpm build:win     # Windows installer
pnpm build:linux   # Linux AppImage
```

### Adding a New Feature

**Example: Add a new script language (Ruby)**

1. **Update Types**:

```typescript
// src/core/types/database.ts
export type ScriptLanguage = 'javascript' | 'python' | 'bash' | 'ruby';
```

2. **Add Icon**:

```typescript
// src/utils/iconMapping.ts
export function getScriptLanguageIcon(language: ScriptLanguage): string {
    const icons = {
        // ... existing
        ruby: '💎',
    };
    return icons[language] || '📝';
}
```

3. **Update Executor**:

```typescript
// electron/main/services/script-executor.ts
private async executeScript(language: ScriptLanguage, code: string) {
  switch (language) {
    // ... existing cases
    case 'ruby':
      return this.executeRuby(code);
  }
}

private async executeRuby(code: string): Promise<any> {
  // Implementation
}
```

4. **Update UI**:

```vue
<!-- src/components/task/TaskDetailPanel.vue -->
<select v-model="task.scriptLanguage">
  <option value="javascript">JavaScript</option>
  <option value="python">Python</option>
  <option value="bash">Bash</option>
  <option value="ruby">Ruby</option>
</select>
```

---

## Summary for AI Assistants

When working on this project, keep in mind:

### Project Identity

✅ **Offline-first** desktop app (Electron)  
✅ **Hybrid AI + Script** execution  
✅ **Multi-provider** AI support (GPT, Claude, Gemini, local)  
✅ **MCP-enabled** for extensibility  
✅ **Type-safe** throughout (TypeScript strict mode)

### Core Patterns

- **IPC Communication**: Renderer ↔ Main via `window.electron.*`
- **State Management**: Pinia stores for UI state
- **Database**: SQLite + Drizzle ORM with migrations
- **Task Types**: Always check `taskType` ('ai' vs 'script')
- **Provider Selection**: Operator → Task → Project → Default

### Common Tasks

- **Add script language**: Update types, icons, executor
- **Add AI provider**: Create provider class, register, update UI
- **Modify task schema**: Write migration, update types, update UI

### Documentation

- **Quick Start**: `docs/AI_QUICK_REF.md`
- **Recent Changes**: `docs/RECENT_CHANGES.md`
- **This File**: Comprehensive overview

---

**Built with ❤️ using AI-powered development**
