# Changelog

All notable changes to HighFlow will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-11

### Added

- **Multi-AI Provider Support**: OpenAI, Anthropic, Google AI, Groq, Mistral AI, LM Studio
- **Visual Workflow Designer**: Kanban board, DAG editor, Timeline view
- **Smart Operators**: Reusable AI personas with drag-and-drop assignment
- **Project Memory System**: Automatic context management with Curator
- **MCP Server Integration**: Filesystem, Shell, Git, HTTP Fetch, and third-party tools
- **Local Agent Support**: Antigravity and Claude-Code integrations
- **Marketplace**: Share and discover workflows, operators, and templates
- **Four Task Types**: AI tasks, Script tasks (JavaScript), Input tasks, Output tasks
- **Webhooks**: Task completion notifications
- **Auto-Review & Auto-Approve**: Quality gates for AI-generated content
- **Dependency Management**: Static and expression-based task dependencies

### Technical

- Electron 29 desktop application
- Vue 3.4 + TypeScript frontend
- SQLite database with Drizzle ORM
- MCP (Model Context Protocol) integration
- Local-first architecture

### Known Limitations

- Script tasks: JavaScript only (Python support planned for v0.2.0)
- TypeScript: Basic support without type compilation
- Local models: Via LM Studio only (Ollama support planned)

## [Unreleased]

### Planned for v0.2.0

- Python script execution
- Full TypeScript compilation support
- Ollama provider integration
- Script task template library
- Time-based triggers
- Team workspaces
- Execution replay

---

**[0.1.0]**: Initial public release
