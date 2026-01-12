export const helpDocs = {
    ko: `
# HighFlow 도움말 가이드

HighFlow는 AI 기반의 지능형 워크플로우 관리자입니다. 복잡한 개발 작업을 구조화된 태스크로 나누고, 다양한 AI 모델과 도구를 활용하여 효율적으로 실행할 수 있습니다.

이 가이드는 HighFlow의 모든 기능을 100% 활용하기 위한 상세한 설명을 제공합니다.

---

## 📚 목차

1. [시작하기](#getting-started)
2. [핵심 개념](#core-concepts)
3. [프로젝트 설정 가이드](#project-settings)
4. [태스크 관리 및 설정](#task-settings)
5. [AI Provider 설정](#ai-provider-settings)
6. [MCP (Model Context Protocol) 설정](#mcp-settings)
7. [로컬 에이전트 활용](#local-agents)
8. [자주 묻는 질문](#faq)

---

## 🚀 1. 시작하기 <a id="getting-started"></a>

HighFlow를 처음 사용하시나요? 간단한 단계로 프로젝트를 시작해보세요.

### 1단계: 프로젝트 생성
1. 메인 화면 오른쪽 상단의 **"+ 새 프로젝트"** 버튼을 클릭합니다.
2. **프로젝트 이름**과 **초기 프롬프트**를 입력합니다.
3. 사용할 **AI 모델**을 선택합니다 (기본값: Google Gemini).
4. **"생성"** 버튼을 눌러 프로젝트를 시작합니다.

### 2단계: 태스크 추가
1. 프로젝트 보드에서 **"+ 태스크 추가"** 버튼을 클릭합니다.
2. 태스크의 **제목**과 **설명**을 입력합니다.
3. 필요한 경우 **AI 모델**이나 **도구**를 설정합니다.

### 3단계: 실행 및 결과 확인
1. 태스크 카드의 **"▶ 실행"** 버튼을 누릅니다.
2. AI가 작업을 수행하는 과정을 실시간으로 확인합니다.
3. 완료된 태스크의 결과를 검토하고 수정하거나 다음 단계로 진행합니다.

---

## 💡 2. 핵심 개념 <a id="core-concepts"></a>

HighFlow의 작동 방식을 이해하기 위한 핵심 용어들입니다.

| 개념 | 설명 |
|---|---|
| **Project** | 하나의 목표를 달성하기 위한 작업 공간입니다. 여러 태스크와 설정, 파일을 포함합니다. |
| **Task** | 실행 가능한 최소 작업 단위입니다. 프롬프트, AI 설정, 도구 등을 개별적으로 가질 수 있습니다. |
| **Workflow** | 태스크 간의 의존성(순서)을 연결하여 구성된 작업 흐름입니다. (예: 기획 -> 개발 -> 테스트) |
| **MCP** | AI가 외부 데이터나 도구(Git, DB, 파일시스템 등)와 상호작용하기 위한 표준 프로토콜입니다. |
| **Local Agent** | 사용자의 터미널 환경에서 직접 실행되는 AI 코딩 도구입니다 (예: Claude Code, Codex). |

\`\`\`mermaid
graph LR
    P[Project] --> T1[Task 1: 기획]
    T1 --> T2[Task 2: 개발]
    T2 --> T3[Task 3: 테스트]
    T2 -.-> MCP[MCP Tools]
    T2 -.-> AI[AI Model]
\`\`\`

---

## ⚙️ 3. 프로젝트 설정 가이드 <a id="project-settings"></a>

프로젝트 대시보드의 **"Project Info"** 패널에서 프로젝트 전반에 적용되는 설정을 관리합니다.

### 1. 기본 정보 (Metadata)
*   **제목 및 이모지**: 프로젝트를 식별하기 위한 이름과 아이콘을 설정합니다. 제목 옆의 연필 아이콘을 눌러 수정할 수 있습니다.
*   **Main Prompt**: 프로젝트의 전체적인 맥락이나 공통적인 지침을 입력합니다. 모든 태스크가 이 내용을 참고합니다.
*   **Goal**: 프로젝트의 최종 목표를 명시합니다. 진행 상황을 파악하는 기준이 됩니다.

### 2. 가이드라인 (Guidelines)
*   **AI Guidelines**: 프로젝트 내 모든 AI 에이전트가 따라야 할 규칙을 작성합니다.
    *   *예시: "모든 코드는 TypeScript로 작성하세요.", "함수형 프로그래밍 스타일을 따르세요."*
*   **Base Folder**: 프로젝트가 파일을 읽고 쓸 기본 디렉토리를 설정합니다. **필수 설정** 항목입니다.

### 3. AI 설정 (AI Settings)
*   **Default Provider**: 프로젝트의 기본 AI 모델을 선택합니다. 태스크에서 별도로 지정하지 않으면 이 설정을 따릅니다.
    *   *API Mode*: 클라우드 API (OpenAI, Anthropic, Gemini 등)를 사용합니다.
    *   *Local Mode*: 로컬 에이전트 (Claude Code 등)를 기본으로 사용합니다.

### 4. 자동 검토 (Auto Review)
*   **Review Provider**: 태스크 완료 후 결과를 자동으로 검토할 AI 모델을 설정합니다.
*   **설정 방법**: "Auto Review" 섹션의 편집 버튼을 눌러 검토자를 지정합니다.

### 5. 결과물 설정 (Output Configuration)
*   **Output Type**: 프로젝트의 예상 결과물 형식을 지정합니다 (Web, Document, Code, Data 등).
*   **Open Output**: 지정된 결과물 폴더를 탐색기로 엽니다.

---

## ✅ 4. 태스크 관리 및 설정 <a id="task-settings"></a>

태스크를 클릭하면 나타나는 **상세 패널(Task Detail Panel)**에서 개별 작업의 모든 것을 제어합니다.

### 1. 프롬프트 및 실행 (Prompt & Execution)
*   **Prompt Editor**: AI에게 지시할 내용을 작성합니다. 매크로(\`{}\`) 기능을 통해 반복되는 문구를 쉽게 삽입할 수 있습니다.
*   **AI Provider Override**: 프로젝트 기본 설정을 무시하고, 이 태스크에만 사용할 특정 AI 모델을 선택할 수 있습니다.
    *   *예: 일반 코딩은 GPT-4o, 창의적 글쓰기는 Claude 3.5 Sonnet*
*   **Execution Mode**: API 모드와 Local 모드 중 선택합니다.

### 2. 트리거 설정 (Triggers & Dependencies)
태스크의 자동 실행 조건을 설정합니다.
*   **Dependency (의존성)**: 다른 태스크가 완료되면 자동으로 시작합니다.
    *   *Depends On*: 선행되어야 할 태스크 ID를 입력합니다.
    *   *Operator*: \`ALL\`(모두 완료 시), \`ANY\`(하나라도 완료 시) 조건을 설정합니다.
*   **Scheduled (스케줄)**: 특정 시간에 실행합니다.
    *   *Once*: 지정된 날짜/시간에 1회 실행.
    *   *Recurring (Cron)*: 주기적으로 반복 실행 (예: \`0 9 * * *\` 매일 오전 9시).

### 3. 도구 및 데이터 (Tools & Context)
*   **MCP Tools**: 이 태스크에서 사용할 도구를 선택합니다 (예: \`filesystem\`, \`git\`, \`brave-search\`).
*   **Context Files**: 태스크 실행 시 참고할 파일을 첨부합니다.

### 4. 고급 설정 (Details Tab)
*   **Priority**: 작업의 우선순위를 설정합니다 (Low ~ Critical).
*   **Tags**: 태스크를 분류하기 위한 태그를 추가합니다.
*   **Output Format**: 예상되는 결과물 형식을 지정합니다 (Markdown, JSON, Code 등).

### 5. 결과 및 히스토리 (History)
*   **Execution Log**: 태스크 실행 기록과 AI와의 대화 내용을 확인합니다.
*   **Versions**: 이전 실행 결과들을 비교하고 복원할 수 있습니다.

---

## 🤖 5. AI Provider 설정 <a id="ai-provider-settings"></a>

**Settings > AI** 메뉴에서 사용할 AI 모델들을 연결하고 관리합니다.

### 지원하는 Provider
*   **Major**: OpenAI, Anthropic, Google Gemini (Vertex AI), Azure OpenAI
*   **Local**: Ollama, LM Studio
*   **Others**: Mistral, Cohere, Groq, Perplexity, OpenRouter, HuggingFace 등

### 설정 방법
1. **API Key 방식**:
    *   해당 서비스의 API Key 발급 페이지 링크를 클릭하여 키를 발급받습니다.
    *   "API Key" 입력창에 키를 붙여넣고 **"Validate"**를 눌러 검증합니다.
2. **OAuth 방식** (지원하는 경우):
    *   **"Connect with OAuth"** 버튼을 클릭하여 안전하게 로그인하고 연동합니다.
3. **Local AI (Ollama/LM Studio)**:
    *   로컬 서버가 실행 중인지 확인합니다.
    *   Base URL (예: \`http://localhost:11434\`)을 입력하고 연결을 테스트합니다.

---

## 🔌 6. MCP (Model Context Protocol) 설정 <a id="mcp-settings"></a>

**Settings > MCP Servers** 메뉴에서 AI의 능력을 확장하는 서버들을 설정합니다.

### 주요 MCP 서버와 기능
*   **Filesystem**: 로컬 파일 읽기/쓰기/생성/수정 (보안을 위해 허용된 경로만 접근 가능).
*   **Git**: 저장소 상태 확인, 커밋, 브랜치 관리.
*   **Brave Search**: 실시간 웹 검색 및 정보 수집.
*   **Database**: SQLite, PostgreSQL 데이터베이스 쿼리 실행.
*   **External Apps**: Jira, Confluence, Slack, GitHub, Google Drive 연동.

### 서버 설정 방법
1. 사용할 서버 카드의 **"Configure"** 버튼을 클릭합니다.
2. **필수 정보**를 입력합니다 (예: API Token, 파일 경로, DB 접속 정보).
3. **"Connect"** 버튼을 눌러 연결 상태를 확인합니다.
4. **Local Install**: 일부 서버(Brave Search 등)는 **"설치"** 버튼을 통해 필요한 도구를 자동으로 설치할 수 있습니다.

---

## 💻 7. 로컬 에이전트 활용 <a id="local-agents"></a>

**Settings > Local Agents** 메뉴에서 터미널 기반의 AI 코딩 도구를 관리합니다.

### 특징
*   사용자의 터미널 환경을 그대로 사용하므로 개발 환경 설정이 완벽하게 반영됩니다.
*   복잡한 리팩토링이나 프로젝트 전반에 걸친 수정에 강력합니다.

### 지원하는 에이전트
*   **Claude Code**: Anthropic의 강력한 코딩 에이전트.
*   **Codex**: OpenAI에서 GPT-5.x-codex를 활용하는 코딩 에이전트.

### 사용 방법
1. 프로젝트 또는 태스크의 **AI Settings**를 엽니다.
2. Provider를 **"Local Mode"**로 변경합니다.
3. 사용할 로컬 에이전트를 선택합니다.
4. 태스크 실행 시, 터미널이 열리고 해당 에이전트가 작업을 수행합니다.

---

## ❓ 8. 자주 묻는 질문 (FAQ) <a id="faq"></a>

**Q. API Key는 어디서 발급받나요?**
A. 각 AI Provider 설정 화면에 있는 "Get your API key" 링크를 통해 공식 사이트로 이동할 수 있습니다.

**Q. 로컬 모델을 사용하려면 어떻게 하나요?**
A. Ollama나 LM Studio를 설치하고 실행한 뒤, 설정 메뉴에서 Local Provider를 활성화하세요. 그 후 프로젝트 설정에서 Local Mode를 선택하면 됩니다.

**Q. MCP가 무엇인가요?**
A. MCP는 AI가 여러분의 컴퓨터나 외부 서비스와 대화할 수 있게 해주는 통역사입니다. 예를 들어, AI가 인터넷 검색을 하거나 파일을 수정하려면 해당 기능을 가진 MCP 서버가 켜져 있어야 합니다.

**Q. 태스크가 자동으로 실행되지 않아요.**
A. 트리거 설정(Dependency 또는 Schedule)이 올바른지 확인하세요. 의존성 태스크가 '완료(Completed)' 상태여야 다음 태스크가 실행됩니다.
`,
    en: `
# HighFlow Help Guide

HighFlow is an AI-based intelligent workflow manager. It allows you to break down complex development tasks into structured units and execute them efficiently using various AI models and tools.

This guide provides detailed instructions to fully utilize HighFlow's features.

---

## 📚 Table of Contents

1. [Getting Started](#getting-started)
2. [Core Concepts](#core-concepts)
3. [Project Settings](#project-settings)
4. [Task Management & Settings](#task-settings)
5. [AI Provider Settings](#ai-provider-settings)
6. [MCP Settings](#mcp-settings)
7. [Local Agents](#local-agents)
8. [FAQ](#faq)

---

## 🚀 1. Getting Started <a id="getting-started"></a>

New to HighFlow? Start your project in a few simple steps.

### Step 1: Create a Project
1. Click the **"+ New Project"** button at the top right of the main screen.
2. Enter the **Project Name** and **Initial Prompt**.
3. Select the **AI Model** to use (Default: Google Gemini).
4. Click the **"Create"** button to start.

### Step 2: Add Tasks
1. Click the **"+ Add Task"** button on the project board.
2. Enter the **Title** and **Description** for the task.
3. Configure the **AI Model** or **Tools** if necessary.

### Step 3: Execute and Review
1. Click the **"▶ Run"** button on the task card.
2. Watch the AI execute the task in real-time.
3. Review the results, make edits, or proceed to the next step.

---

## 💡 2. Core Concepts <a id="core-concepts"></a>

Key terms to help you understand how HighFlow works.

| Concept | Description |
|---|---|
| **Project** | A workspace to achieve a specific goal. Contains multiple tasks, settings, and files. |
| **Task** | The smallest executable unit. Can have individual prompts, AI settings, and tools. |
| **Workflow** | A structured sequence of tasks connected by dependencies (e.g., Plan -> Dev -> Test). |
| **MCP** | Standard protocol for AI to interact with external data/tools (Git, DB, filesystem, etc.). |
| **Local Agent** | AI coding tools running directly in your terminal environment (e.g., Claude Code). |

\`\`\`mermaid
graph LR
    P[Project] --> T1[Task 1: Plan]
    T1 --> T2[Task 2: Develop]
    T2 --> T3[Task 3: Test]
    T2 -.-> MCP[MCP Tools]
    T2 -.-> AI[AI Model]
\`\`\`

---

## ⚙️ 3. Project Settings <a id="project-settings"></a>

Manage project-wide settings in the **"Project Info"** panel on the dashboard.

### 1. Basic Info (Metadata)
*   **Title & Emoji**: Set a name and icon to identify the project. Click the pencil icon to edit.
*   **Main Prompt**: Enter the overall context or common instructions for the project. All tasks reference this context.
*   **Goal**: Specify the final objective of the project. Useful for tracking progress.

### 2. Guidelines
*   **AI Guidelines**: Define rules that all AI agents in the project must follow.
    *   *Example: "Write all code in TypeScript.", "Follow functional programming style."*
*   **Base Folder**: Set the root directory where the project reads/writes files. **Required**.

### 3. AI Settings
*   **Default Provider**: Select the default AI model for the project. Tasks use this unless overridden.
    *   *API Mode*: Use cloud APIs (OpenAI, Anthropic, Gemini, etc.).
    *   *Local Mode*: Use local agents (Claude Code, etc.) as default.

### 4. Auto Review
*   **Review Provider**: Set the AI model to automatically review results after task completion.
*   **How to Set**: Click the edit button in the "Auto Review" section.

### 5. Output Configuration
*   **Output Type**: Specify the expected output format of the project (Web, Document, Code, etc.).
*   **Open Output**: Open the specified output folder in the file explorer.

---

## ✅ 4. Task Management & Settings <a id="task-settings"></a>

Control everything about a specific task in the **Task Detail Panel** that appears when you click a task.

### 1. Prompt & Execution
*   **Prompt Editor**: Write instructions for the AI. Use macros (\`{}\`) to insert reusable text.
*   **AI Provider Override**: Select a specific AI model for this task, overriding project defaults.
    *   *Example: GPT-4o for coding, Claude 3 sonnet for creative writing.*
*   **Execution Mode**: Choose between API Mode and Local Mode.

### 2. Triggers & Dependencies
Set conditions for automatic task execution.
*   **Dependency**: Automatically start when other tasks complete.
    *   *Depends On*: Enter the ID of the prerequisite task.
    *   *Operator*: \`ALL\` (when all complete), \`ANY\` (when any completes).
*   **Scheduled**: Execute at a specific time.
    *   *Once*: Run once at a specific date/time.
    *   *Recurring (Cron)*: Run periodically (e.g., \`0 9 * * *\` every day at 9 AM).

### 3. Tools & Context
*   **MCP Tools**: Select tools to use in this task (e.g., \`filesystem\`, \`git\`, \`brave-search\`).
*   **Context Files**: Attach files for the AI to reference during execution.

### 4. Details Tab
*   **Priority**: Set task priority (Low ~ Critical).
*   **Tags**: Add tags to categorize the task.
*   **Output Format**: Specify the expected output format (Markdown, JSON, Code, etc.).

### 5. History
*   **Execution Log**: View execution history and conversation with the AI.
*   **Versions**: Compare and restore previous execution results.

---

## 🤖 5. AI Provider Settings <a id="ai-provider-settings"></a>

Connect and manage AI models in **Settings > AI**.

### Supported Providers
*   **Major**: OpenAI, Anthropic, Google Gemini (Vertex AI), Azure OpenAI
*   **Local**: Ollama, LM Studio
*   **Others**: Mistral, Cohere, Groq, Perplexity, OpenRouter, HuggingFace, etc.

### How to Configure
1. **API Key**:
    *   Click the link to get the API key for the service.
    *   Paste the key into the "API Key" field and click **"Validate"**.
2. **OAuth** (if supported):
    *   Click **"Connect with OAuth"** to login and connect securely.
3. **Local AI**:
    *   Ensure your local server is running.
    *   Enter the Base URL (e.g., \`http://localhost:11434\`) and test the connection.

---

## 🔌 6. MCP (Model Context Protocol) Settings <a id="mcp-settings"></a>

Configure servers that extend AI capabilities in **Settings > MCP Servers**.

### Key MCP Servers and Features
*   **Filesystem**: Read/write/create/modify local files (restricted paths only).
*   **Git**: Check repo status, commit, manage branches.
*   **Brave Search**: Real-time web search and information gathering.
*   **Database**: Execute queries on SQLite, PostgreSQL databases.
*   **External Apps**: Integration with Jira, Confluence, Slack, GitHub, Google Drive.

### How to Configure
1. Click **"Configure"** on the server card.
2. Enter **Required Info** (e.g., API Token, file path, DB connection).
3. Click **"Connect"** to verify status.
4. **Local Install**: Some servers (like Brave Search) allow auto-installation via the **"Install"** button.

---

## 💻 7. Local Agents <a id="local-agents"></a>

Manage terminal-based AI coding tools in **Settings > Local Agents**.

### Features
*   Uses your terminal environment directly, reflecting your development setup perfectly.
*   Powerful for complex refactoring or project-wide changes.

### Supported Agents
*   **Claude Code**: Anthropic’s powerful coding agent.
*   **Codex**: OpenAI coding agent leveraging GPT-5.x-codex.

### How to Use
1. Open **AI Settings** for a project or task.
2. Change Provider to **"Local Mode"**.
3. Select the local agent to use.
4. When executed, a terminal opens and the agent performs the task.

---

## ❓ 8. FAQ <a id="faq"></a>

**Q. Where do I get an API Key?**
A. You can go to the official site via the "Get your API key" link in each AI Provider settings screen.

**Q. How do I use local models?**
A. Install and run Ollama or LM Studio, then enable Local Provider in the settings menu. Then select Local Mode in your project settings.

**Q. What is MCP?**
A. MCP is an interpreter that allows AI to talk to your computer or external services. For example, for AI to search the internet or modify files, the corresponding MCP server must be running.

**Q. Task does not start automatically.**
A. Check your trigger settings (Dependency or Schedule). The prerequisite task must be 'Completed' for the next task to start.
`,
};
