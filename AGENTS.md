# Repository Guidelines

## Project Structure & Module Organization
Root logic sits in `src/renderer` (Vue renderer modules, shared UI, Pinia stores) and `src/core` (AI agents, sync engine, shared types). Electron-specific code lives in `electron/` (main process, preload, native assets) with `tests/` covering vitest/playwright suites and `server/` hosting optional webhook helpers. Keep docs and guides in `docs/`, scripts in `scripts/`, and config like `vite.config.ts`, `drizzle.config.ts`, and `electron-builder.json` at the root. Assets (styles, icons) reside under `src/renderer/assets/`.

## Build, Test, and Development Commands
- `pnpm dev:electron`: Launches the renderer dev build alongside Electron for local UI iteration.
- `pnpm dev`: Runs the Vite dev server for renderer-only troubleshooting.
- `pnpm db:migrate` / `pnpm db:seed`: Apply or seed the local SQLite schema defined by Drizzle.
- `pnpm build` / `pnpm build:<platform>`: Type-checks (`vue-tsc`) then bundles with Vite; platform variants call `electron-builder`.
- `pnpm lint` / `pnpm format`: Runs ESLint and Prettier across `.vue`, `.ts`, `.tsx`, `.json`, and `.md`.
- `pnpm test:*`: Use `test`, `test:unit`, `test:integration`, `test:components`, `test:e2e`, `test:coverage`, and `test:watch` to run relevant Vitest or Playwright suites.
- `pnpm release`: Builds and publishes via `electron-builder` after `pnpm build`.

## Coding Style & Naming Conventions
Follow TypeScript strict mode and Vue 3 Composition API patterns. Prefer 2-space indentation and `pascalCase` for components, `camelCase` for stores/composables, and `kebab-case` for Vue filenames (`MyComponent.vue`). Shared utilities live in `src/core` with descriptive names (e.g., `sync-engine.ts`, `ai-agent-orchestrator.ts`). Run `pnpm lint` before commits to catch formatting or rule violations, and use `pnpm format` for bulk fixes. Keep long-lived hooks or stores in `src/renderer/stores` and reuse shared UI tokens defined under `shared/components/ui/`.

## Testing Guidelines
Unit and integration tests run via Vitest (configured in `vitest.config.ts`) and follow `<subject>.spec.ts` naming under `src/` or `tests/`. Use `pnpm test:unit` for local logic checks, `pnpm test:integration` for multi-module flows, and `pnpm test:e2e` (Playwright) for UI coverage. `pnpm test:coverage` verifies coverage targets before release. Keep fixtures in `tests/fixtures` and playwright specs under `tests/e2e/specs`.

## Commit & Pull Request Guidelines
Commits should describe a single change in imperative form (e.g., “Add Kanban drag-and-drop helpers”) and reference GitHub issue IDs if relevant. Pull requests require a clear description, linked issue or task reference, and mention any manual steps (migrations, secrets) needed to test. For UI changes, include before/after screenshots or screen recordings in the PR description. Tag reviewers and mention blocking areas.

## Security & Configuration Tips
Use `.env.example` as a template—never commit real API keys. Secrets (OpenAI, Anthropic, Slack) are injected via OS keychain or `.env`. Run `pnpm db:studio` for safe Drizzle inspection before editing migrations. Routine builds rely on Node 20.9.0 and pnpm 8+ per `package.json`.
