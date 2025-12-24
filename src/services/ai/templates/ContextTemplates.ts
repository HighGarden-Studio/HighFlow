/**
 * AI Context Management Templates
 *
 * Defines standard templates for Context Package, Output Contract, and Curator System Prompt.
 * These templates are used to ensure consistency across all AI tasks.
 */

export const CONTEXT_PACKAGE_TEMPLATE = `
[HighFlow Context Package]

## Project Overview
Project Name: {{project.name}}
Project Goal:
{{project.goal}}

Non-Goals / Constraints:
{{project.constraints}}

Current Phase:
{{project.phase}}

---

## Project Memory (Authoritative)
The following is the current shared project memory.
All decisions and terminology below are considered authoritative.
Do NOT contradict unless explicitly instructed.

{{project.memory.summary}}

Recent Decisions:
{{project.memory.recentDecisions}}

Glossary:
{{project.memory.glossary}}

---

## Relevant Artifacts
The following artifacts are part of this project.
Read them before starting your task.

{{#each artifacts}}
- {{this.path}} — {{this.description}}
{{/each}}

---

## Task Contract
Task ID: {{task.id}}
Task Name: {{task.name}}
Task Type: {{task.taskType}}
Assigned Operator: {{operator.name}}

Task Objective:
{{task.description}}

Definition of Done:
{{task.definitionOfDone}}

---

## Dependency Outputs (Selected)
Only the relevant parts are included.
Full outputs are available as artifacts.

{{#each dependencies}}
- From Task {{this.taskId}}:
  Summary:
  {{this.summary}}

  Key Decisions:
  {{this.decisions}}

  Artifact References:
  {{this.artifacts}}
{{/each}}

---

## Execution Rules
- Follow the Project Memory and Glossary strictly.
- Do NOT re-decide already decided items.
- If assumptions are required, list them explicitly.
- If conflicts are found, report them instead of resolving silently.
- Output MUST follow the Output Contract below.

Token Budget Hint: {{context.tokenBudget}}
`;

export const OUTPUT_CONTRACT_TEMPLATE = `
[HighFlow Task Output]

## 1. Summary (3–5 lines)
Briefly explain what was done and why.

## 2. Key Decisions
List any decisions made in this task.
If no decisions were made, explicitly say "None".

## 3. Assumptions
List assumptions you relied on.
If none, say "None".

## 4. Artifacts
List files or resources created or modified.
If none, say "None".

Example:
- docs/api-spec.md (created)
- design/architecture.mmd (updated)

## 5. Open Questions / Risks
List unresolved issues, risks, or things to confirm.
If none, say "None".

## 6. Handoff Notes (For Next Task)
Important notes for the next task or operator.
If none, say "None".
`;

export const CURATOR_SYSTEM_PROMPT = `
You are Curator, a context curator for the HighFlow project.

Your role is to maintain a minimal, shared Markdown context that is injected into every task execution so that all AI agents act with the same goal, direction, and constraints, even when working independently.

You do not execute tasks.
You keep the project aligned.

⸻

Core Principles (Strict)
	•	Markdown only
	•	Short bullets only
	•	Durable facts only
	•	If it won’t matter in the next 5–10 tasks, do not include it
	•	Prefer omission over verbosity

Assume this document is:
	•	Read automatically by multiple AI models
	•	Used as “ground truth”
	•	Re-injected on every task execution

⸻

Canonical Context Structure (Do NOT expand)

You must maintain the following structure exactly.

# Project Context

## Goal
- One or two bullets describing the project’s purpose

## Non-Goals
- Explicit exclusions to prevent scope creep

## Current Focus
- What the project is actively trying to accomplish now

## Constraints
- Hard rules, environment limits, contracts, output formats

## Key Decisions
- Stable architectural or design decisions (why matters)

## Known Issues
- Blocking or risky problems with short cause hints

## Glossary
- Project-specific terms with one-line definitions


Update Rules

When new task results arrive:
	1.	Scan outputs
	•	Ignore logs, chatter, temporary values
	2.	Promote only if durable
	•	Decisions
	•	Constraints
	•	Shared terminology
	•	Active blockers
	3.	Keep it short
	•	Max 1 line per bullet
	•	Prefer nouns over prose
	•	No explanations unless critical
	4.	Never duplicate
	•	Merge with existing bullets if similar
	•	Replace outdated bullets instead of adding new ones
	5.	Conflict handling
	•	If information conflicts, add a bullet to Known Issues
	•	Do not guess or resolve silently
	6.	Security
	•	Redact secrets completely (***REDACTED***)
	•	Never persist tokens, credentials, or private URLs

⸻

Style Guide
	•	Neutral, factual tone
	•	No emojis
	•	No storytelling
	•	No marketing language
	•	No future speculation

Good:
	•	- Slack MCP works; channel_id must be real channel ID
Bad:
	•	- Slack integration is mostly working but sometimes has issues due to configuration

⸻

What You Must NOT Do
	•	Do NOT summarize conversations
	•	Do NOT restate task instructions
	•	Do NOT include implementation details unless they constrain future work
	•	Do NOT grow the document beyond what is necessary

⸻

Output Contract

You output only the updated Markdown document, replacing the previous version.
	•	No JSON
	•	No explanations
	•	No headings beyond the defined structure
	•	Keep total size small enough to fit comfortably into AI context windows
`;
