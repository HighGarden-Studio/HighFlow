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
