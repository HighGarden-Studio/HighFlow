# HighFlow - Advanced Project Specification

## 1. Project Vision & Core Philosophy

**HighFlow** is an **Agentic Workflow Manager** designed for power users who want to orchestrate complex projects by combining the intelligence of AI with the deterministic reliability of codified scripts.

The core philosophy separates the "Thinking" (AI) from the "Doing" (Scripts/MCP), unified by a robust **Task Execution Engine** that runs primarily on the user's local machine for maximum privacy and performance.

---

## 2. Advanced Task System

The fundamental unit of work is the **Task**. Unlike traditional systems, tasks in HighFlow are executable units with polymorphic behaviors.

### 2.1. Task Types

#### 🤖 AI Task (The Brain)

- **Role**: Creative content generation, decision making, analysis, coding assistance.
- **Capabilities**:
    - **Multi-Model**: Switch instantly between GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro, or Local LLMs (via LM Studio, Ollama).
    - **Prompt Engineering**: Support for system prompts, user prompts, and interpolated context (see Macros).
    - **Auto-Review**: Chain a second AI pass to evaluate the quality (0-10 score) and providing feedback loops (Retry/Approve).
    - **Streaming**: Real-time token streaming for immediate feedback.

#### 📜 Script Task (The Muscle)

- **Role**: Deterministic execution, file manipulation, system operations.
- **Languages**:
    - **TypeScript/JavaScript**: Executed in a secure sandbox (vm2) or Node.js environment.
    - **Python**: For data processing or script integration.
    - **Bash/Shell**: Direct system commands.
- **Editor**: Monaco Editor integration tailored for each language.
- **Access**: Full access to `fs` (file system), `http`, and custom injected project context.

#### 📥 Input Task (The Trigger)

- **Role**: Pause execution to gather human input or external data.
- **Modes**:
    - **User Input**: Prompt the user with a form (Text, Select, Confirmation) during execution.
    - **Local File**: Wait for or read a specific file from disk.
    - **Remote Resource**: Fetch and validate data from a URL or API endpoint.
- **Blocking**: Acts as a gatekeeper in the DAG execution flow.

#### 📤 Output Task (The Artifact)

- **Role**: Formalize and export the results of a workflow.
- **Destinations**:
    - **Local File**: Save content to `.md`, `.json`, `.csv`, etc.
    - **Slack/Discord**: Send notifications or reports to channels.
    - **Google Docs**: Append to cloud documents.
- **Preview**: Integrated preview modal to visualize results (Markdown rendering, Code highlighting).

### 2.2. Automated Triggers & Logic

HighFlow supports sophisticated execution logic beyond simple linear dependencies.

- **Time-Based Triggers**:
    - **Cron**: Schedule tasks to run periodically (e.g., "Every Monday at 9 AM").
    - **Interval**: Run every X minutes/hours.
- **Logic-Based Dependencies**:
    - **Complex Expressions**: `(TaskA AND TaskB) OR (TaskC)`
    - **Novelty Detection**: "Run only if TaskA output has CHANGED since last run."
    - **Output Parsing**: Trigger based on specific values in previous task's JSON result.

---

## 3. AI Operators & Specialized Roles

**AI Operators** are the "Personnel" of your digital agency. They allow you to encapsulate specific expertise and personality into reusable entities.

### 3.1. Operator Configuration

- **Role Persona**: Define "Senior Backend Engineer", "Creative Copywriter", "QA Specialist".
- **System Prompt Override**: Enforce specific coding standards, tone of voice, or methodologies (e.g., TDD, Clean Architecture).
- **Model Preference**: Assign "Claude 3.5 Sonnet" for Coding Operators, "GPT-4" for Creative Writing Operators.
- **Assignment**: Drag-and-drop Operators onto Tasks to override the default project AI settings.

---

## 4. MCP (Model Context Protocol) Integration

HighFlow implements the **Model Context Protocol (MCP)** to extend AI capabilities safely and structurally.

- **Tools & Resources**: AI Agents can define and call tools exposed by MCP Servers.
- **Standard Servers**:
    - **Filesystem MCP**: Safe, scoped access to read/write project files.
    - **Git MCP**: Read commits, diffs, branches.
    - **Slack/Discord MCP**: Read messages, send alerts.
    - **Browser MCP**: Scrape web pages or automate browser actions.
- **Custom Connectivity**: Connect to any MCP-compliant server (local or remote) via SSE or Stdio.

---

## 5. Project Memory & Context Sharing

To solve the "Amalgsia" of stateless AI interactions, HighFlow maintains a persistent **Project Memory**.

### 5.1. Context Layers

- **Project Context**: High-level goals, technical stack, architectural constraints defined in Project Settings.
- **Glossary**: Shared definitions of domain terms to ensure consistency across tasks.
- **Decision Log**: Record of architectural decisions (ADRs) made by AI or User.
- **Result Output Sharing**:
    - **Macros**: Use `{{TaskName.result}}` to inject the output of a previous task into the prompt of the next.
    - **Recursive Context**: `{{prev}}` or `{{prev - 1}}` allows specialized chaining logic for iterative refinement.

### 5.2. Curator System

- A background process that analyzes task outputs to automatically update the Project Memory.
- Extracts "Key Decisions" and "New Terminology" to keep the context fresh without manual user updates.

---

## 6. The Marketplace

A collaborative hub to share and acquire **Intellectual Property** in the form of workflows.

### 6.1. Shareable Units

- **Project Templates**: Full DAG structures (e.g., "SaaS Launch Protocol", "YouTube Video Production Pipeline").
- **AI Operators**: Expert personas (e.g., "Refactoring Specialist Operator").
- **Skills**: Atomic capabilities combining a specific Prompt + Required MCP Tools (e.g., "SEO Audit Skill").

### 6.2. Ecosystem

- **Import/Export**: JSON/YAML based standard for portability.
- **Community Driven**: Rate, fork, and improve workflows.

---

## 7. Technical Architecture

### 7.1. Technology Stack

- **Frontend**: Vue 3, Pinia, TailwindCSS, Vue Flow (DAG visualization).
- **Backend (Main Process)**: Electron, Node.js v22.
- **Database**: SQLite (better-sqlite3) with Drizzle ORM. Strictly local & offline-first.
- **Sandbox**: `vm2` for secure script execution.
- **IPC**: Type-safe IPC bridge for high-performance communication between UI and Engine.

### 7.2. Execution Engine

1.  **Orchestrator**: Resolves the DAG dependency graph.
2.  **Context Builder**: Hydrates prompts with Project Memory, Operator Persona, and Macro substitutions.
3.  **Runner**:
    - **AI**: Streams request to Multi-Vendor Client (OpenAI/Anthropic/Google SDKs).
    - **Script**: Spawns isolated process/sandbox.
4.  **Result Handler**: Parses output, runs Auto-Review (if configured), and triggers downstream tasks.

### 7.3. Global State Management

- **Global Pause**: Design pattern allowing immediate suspension of the entire execution graph.
- **Reactive Updates**: Real-time state propagation via Pinia stores to UI components (Kanban/DAG).

---

## 8. Development Roadmap & Status

_(As of Phase 29)_

- [x] **Core Task Engine** (AI, Script, Input)
- [x] **DAG & Kanban Views**
- [x] **Local File Output & Preview**
- [x] **Global Pause & Abort Logic**
- [ ] **Marketplace Backend Integration** (Next Phase)
- [ ] **Collaboration Server** (P2P Sync)

---

**HighFlow** is an integrated development environment for _Work_, bridging the gap between human intent and autonomous execution.
