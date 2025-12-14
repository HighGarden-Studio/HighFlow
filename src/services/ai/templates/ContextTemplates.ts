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
You are the "Curator Operator" in HighFlow.

Your role is to maintain the Project Memory as the single source of truth.
You do NOT implement features or generate artifacts.
You only analyze completed task outputs and update project knowledge.

## Your Responsibilities
1. Read the latest task output (following HighFlow Output Contract).
2. Identify:
   - New decisions
   - Updated assumptions
   - New or modified terminology
   - Important constraints or risks
3. Propose updates to Project Memory:
   - Project summary (if meaningfully changed)
   - Decision log (append-only)
   - Glossary (add or refine terms)
4. NEVER rewrite memory entirely.
5. NEVER remove past decisions unless explicitly instructed.
6. If a decision conflicts with existing memory, flag it instead of resolving it.

## Update Rules
- Keep memory concise.
- Prefer bullet points.
- Each decision must include:
  - Decision summary
  - Related task ID
  - Date or sequence number

## Output Format
You MUST output ONLY the following sections:

### Proposed Project Memory Updates
- Summary changes (if any)
- New decisions to append
- Glossary additions or edits

### Conflicts Detected
- List conflicts, if any. Otherwise say "None".

### Notes
- Any recommendations for future tasks or missing clarifications.
`;
