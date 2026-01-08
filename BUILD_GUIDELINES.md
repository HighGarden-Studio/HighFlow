# Build & Troubleshooting Guidelines

## Critical Build Rules

### 1. Electron Main Process Build

**Rule:** NEVER rely solely on `vite build`.
**Reason:** `vite build` only compiles the Renderer process. The Main process (`electron/main`) and Preload scripts (`electron/preload`) must be built separately.
**Solution:** Always use the dedicated build script:

```bash
pnpm build:electron  # Runs scripts/build.ts
```

**Why:** The `scripts/build.ts` script handles:

- Building `electron/main/index.ts` -> `dist-electron/main/index.cjs`
- Building `electron/preload/index.ts` -> `dist-electron/preload/index.cjs`
- **Copying Database Migrations** (`electron/main/database/migrations` -> `dist-electron/main/database/migrations`)

### 2. Dependency Management (pnpm + Electron)

**Rule:** Explicitly add native/critical dependencies to `package.json`.
**Reason:** `pnpm` uses a strict symlinked structure. `electron-builder` often fails to traverse this structure to find transitive dependencies (like `p-queue` required by `@slack/web-api` or `is-stream`).
**Solution:** If you encounter `Cannot find module 'X'` in the packaged app:

1.  **Do NOT** rely on `shamefully-hoist=true` (it's a workaround, not a fix).
2.  **Explicitly install** the missing module as a direct dependency:
    ```bash
    pnpm add <module-name>
    ```
    _Example:_ We verified this with `p-queue@6.6.2` and `is-stream@1.1.0`.

### 3. Database Migrations (Drizzle + SQLite)

**Rule:** STRICTLY validate SQL migration files.
**Reason:** The SQLite runner in production is extremely sensitive to syntax that `drizzle-kit` might generate but SQLite doesn't support in batch execution.
**Guidelines:**

- **No Trailing Breakpoints:** Ensure files do NOT end with `--> statement-breakpoint`.
- **Separator Required:** MUST use `--> statement-breakpoint` between _every_ SQL statement.
- **No Comments in Queries:** Remove auto-generated comment blocks (like "SQLite does not support...") that might be misinterpreted as queries.
- **Validation:** If a migration fails with `Failed to run the query ''` or syntax errors, inspect the `.sql` file immediately.

## Build Commands

| Workflow          | Command               | Description                                                         |
| ----------------- | --------------------- | ------------------------------------------------------------------- |
| **macOS**         | `pnpm build:mac`      | Full build: Renderer -> Main (w/ migrations) -> Package (Universal) |
| **Electron Only** | `pnpm build:electron` | Rebuilds Main process & copies migrations to `dist-electron`        |
| **Renderer Only** | `pnpm build`          | Rebuilds Renderer to `dist`                                         |

## Troubleshooting Checklist

- [ ] **Missing Module?** Check if it's in `dependencies` (not `devDependencies`). If transitive, add it explicitly.
- [ ] **Database Error?** Check `dist-electron/main/migrations` in the unpacked app. Are the SQL files correct?
- [ ] **White Screen?** Check if `dist-electron/main/index.cjs` exists. If not, `pnpm build:electron` failed or wasn't run.
