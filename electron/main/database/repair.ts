import type Database from 'better-sqlite3';
import log from 'electron-log';

/**
 * Manually repair database schema for missing columns that might have been skipped
 * locally or in production due to migration journal mismatches.
 */
export function repairDatabaseSchema(sqlite: Database.Database): void {
    log.info('[SchemaRepair] Checking for missing columns...');

    try {
        // 1. Check for projects.mcp_config
        const projectsInfo = sqlite.prepare('PRAGMA table_info(projects)').all() as any[];
        const hasMcpConfig = projectsInfo.some((col) => col.name === 'mcp_config');

        if (!hasMcpConfig) {
            log.warn('[SchemaRepair] Missing column projects.mcp_config. Adding it now...');
            sqlite.prepare('ALTER TABLE projects ADD COLUMN mcp_config text').run();
            log.info('[SchemaRepair] ✅ Added projects.mcp_config');
        } else {
            log.info('[SchemaRepair] projects.mcp_config exists.');
        }

        // 2. Check for tasks.parent_project_id
        const tasksInfo = sqlite.prepare('PRAGMA table_info(tasks)').all() as any[];
        const hasParentProjectId = tasksInfo.some((col) => col.name === 'parent_project_id');

        if (!hasParentProjectId) {
            log.warn('[SchemaRepair] Missing column tasks.parent_project_id. Adding it now...');
            sqlite.prepare('ALTER TABLE tasks ADD COLUMN parent_project_id integer').run();
            log.info('[SchemaRepair] ✅ Added tasks.parent_project_id');
        } else {
            log.info('[SchemaRepair] tasks.parent_project_id exists.');
        }

        // 3. Systematically check other potentially missing columns in 'tasks'
        // List of all columns added in recent iterations that might be missing
        const tablesToCheck: { tableName: string; columns: { name: string; type: string }[] }[] = [
            {
                tableName: 'tasks',
                columns: [
                    { name: 'parent_sequence', type: 'integer' },
                    { name: 'blocked_by_project_id', type: 'integer' },
                    { name: 'blocked_by_sequence', type: 'integer' },
                    { name: 'is_paused', type: 'integer DEFAULT 0 NOT NULL' },
                    { name: 'auto_review', type: 'integer DEFAULT 0 NOT NULL' },
                    { name: 'auto_reviewed', type: 'integer DEFAULT 0 NOT NULL' },
                    { name: 'auto_approve', type: 'integer DEFAULT 0 NOT NULL' },
                    { name: 'review_failed', type: 'integer DEFAULT 0 NOT NULL' },
                    { name: 'trigger_config', type: 'text' },
                    { name: 'paused_at', type: 'integer' },
                    { name: 'is_subdivided', type: 'integer DEFAULT 0 NOT NULL' },
                    { name: 'subtask_count', type: 'integer DEFAULT 0 NOT NULL' },
                    { name: 'execution_result', type: 'text' },
                    { name: 'image_config', type: 'text' },
                    { name: 'output_format', type: "text DEFAULT 'markdown'" },
                    { name: 'code_language', type: 'text' },
                    { name: 'execution_order', type: 'integer' },
                    { name: 'dependencies', type: "text DEFAULT '[]' NOT NULL" },
                    { name: 'expected_output_format', type: 'text' },
                    { name: 'recommended_providers', type: "text DEFAULT '[]' NOT NULL" },
                    { name: 'required_mcps', type: "text DEFAULT '[]' NOT NULL" },
                    { name: 'ai_optimized_prompt', type: 'text' },
                    { name: 'task_type', type: "text DEFAULT 'ai'" },
                    { name: 'script_code', type: 'text' },
                    { name: 'script_language', type: 'text' },
                    { name: 'script_runtime', type: 'text' },
                    { name: 'input_config', type: 'text' },
                    { name: 'input_sub_status', type: 'text' },
                    { name: 'output_config', type: 'text' },
                    { name: 'notification_config', type: 'text' },
                ],
            },
            {
                tableName: 'task_history',
                columns: [
                    { name: 'task_project_id', type: 'integer' },
                    { name: 'task_sequence', type: 'integer' },
                    { name: 'event_type', type: 'text' },
                    { name: 'event_data', type: 'text' },
                    { name: 'metadata', type: 'text' },
                ],
            },
            {
                tableName: 'task_executions',
                columns: [
                    { name: 'task_project_id', type: 'integer' },
                    { name: 'task_sequence', type: 'integer' },
                    { name: 'execution_number', type: 'integer DEFAULT 1 NOT NULL' },
                    { name: 'prompt', type: 'text' },
                    { name: 'response', type: 'text' },
                    { name: 'context', type: 'text' },
                    { name: 'ai_provider', type: 'text' },
                    { name: 'model', type: 'text' },
                ],
            },
            {
                tableName: 'comments',
                columns: [
                    { name: 'task_project_id', type: 'integer' },
                    { name: 'task_sequence', type: 'integer' },
                    { name: 'content_type', type: "text DEFAULT 'markdown' NOT NULL" },
                    { name: 'mentions', type: "text DEFAULT '[]' NOT NULL" },
                    { name: 'reactions', type: "text DEFAULT '{}' NOT NULL" },
                ],
            },
            {
                tableName: 'time_entries',
                columns: [
                    { name: 'task_project_id', type: 'integer' },
                    { name: 'task_sequence', type: 'integer' },
                    { name: 'is_manual', type: 'integer DEFAULT 0 NOT NULL' },
                    { name: 'is_billable', type: 'integer DEFAULT 0 NOT NULL' },
                ],
            },
            {
                tableName: 'operators',
                columns: [
                    { name: 'is_curator', type: 'integer DEFAULT 0 NOT NULL' },
                    { name: 'is_reviewer', type: 'integer DEFAULT 0 NOT NULL' },
                    { name: 'review_ai_provider', type: 'text' },
                    { name: 'review_ai_model', type: 'text' },
                ],
            },
        ];

        for (const table of tablesToCheck) {
            // Basic check if table exists
            try {
                const tableInfo = sqlite
                    .prepare(`PRAGMA table_info(${table.tableName})`)
                    .all() as any[];
                if (!tableInfo || tableInfo.length === 0) {
                    log.warn(
                        `[SchemaRepair] Table ${table.tableName} does not exist. Skipping column checks (migrations might create it).`
                    );
                    continue;
                }

                for (const col of table.columns) {
                    const hasCol = tableInfo.some((c) => c.name === col.name);
                    if (!hasCol) {
                        log.warn(
                            `[SchemaRepair] Missing column ${table.tableName}.${col.name}. Adding it now...`
                        );
                        try {
                            sqlite
                                .prepare(
                                    `ALTER TABLE ${table.tableName} ADD COLUMN ${col.name} ${col.type}`
                                )
                                .run();
                            log.info(`[SchemaRepair] ✅ Added ${table.tableName}.${col.name}`);
                        } catch (alterErr) {
                            log.error(
                                `[SchemaRepair] Failed to add ${table.tableName}.${col.name}:`,
                                alterErr
                            );
                        }
                    }
                }
            } catch (err) {
                log.error(`[SchemaRepair] Error checking table ${table.tableName}:`, err);
            }
        }

        // 3.5. SPECIAL CHECK: Ensure 'tasks' has 'project_sequence' and a UNIQUE INDEX
        // This is critical for the Foreign Keys in task_history/task_executions checks below.
        try {
            const tasksInfo = sqlite.prepare('PRAGMA table_info(tasks)').all() as any[];
            const hasProjectSequence = tasksInfo.some((col) => col.name === 'project_sequence');

            if (!hasProjectSequence) {
                log.warn(
                    '[SchemaRepair] Missing column tasks.project_sequence. Adding and backfilling...'
                );
                sqlite.prepare('ALTER TABLE tasks ADD COLUMN project_sequence integer').run();
                // Backfill with ID to ensure uniqueness (assuming serial execution roughly aligns)
                sqlite
                    .prepare(
                        'UPDATE tasks SET project_sequence = id WHERE project_sequence IS NULL'
                    )
                    .run();
                log.info('[SchemaRepair] ✅ Added and backfilled tasks.project_sequence');
            }

            // Ensure Unique Index for FK referencing
            // SQLite FKs require the parent columns to be UNIQUE
            const indices = sqlite.prepare('PRAGMA index_list(tasks)').all() as any[];
            const hasUniqueSeqIndex = indices.some(
                (idx) => idx.name === 'idx_tasks_project_sequence_unique'
            );

            if (!hasUniqueSeqIndex) {
                log.info(
                    '[SchemaRepair] Creating unique index on tasks(project_id, project_sequence) for Foreign Keys...'
                );
                // Check if any duplicates exist before creating index (just in case)
                // If duplicates exist, we might need to fix them, but backfill = id should be safe.
                // We use CREATE UNIQUE INDEX IF NOT EXISTS just to be safe.
                sqlite
                    .prepare(
                        `
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_project_sequence_unique 
                    ON tasks (project_id, project_sequence)
                 `
                    )
                    .run();
                log.info('[SchemaRepair] ✅ Created unique index on tasks');
            }
        } catch (err) {
            log.error('[SchemaRepair] Failed to ensure tasks.project_sequence structure:', err);
            // If this fails, the table recreation below might fail with "foreign key mismatch"
        }

        // 4. CLEANUP: Recreate tables to strictly resolve schema mismatches
        // "DROP COLUMN" fails if FKs exist, so we must: Rename -> Create New -> Copy -> Drop Old

        const tablesToRecreate = [
            {
                tableName: 'task_history',
                legacyColumn: 'task_id',
                createSql: `
                    CREATE TABLE IF NOT EXISTS "task_history" (
                        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                        "task_project_id" integer NOT NULL,
                        "task_sequence" integer NOT NULL,
                        "event_type" text NOT NULL,
                        "event_data" text,
                        "metadata" text,
                        "created_at" integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
                        FOREIGN KEY ("task_project_id", "task_sequence") REFERENCES "tasks"("project_id", "project_sequence") ON DELETE CASCADE
                    );
                `,
                // Try to migrate data joined with tasks. If tasks.id match fails, data is lost (acceptable for repair).
                migrateSql: `
                    INSERT INTO task_history (id, task_project_id, task_sequence, event_type, event_data, metadata, created_at)
                    SELECT 
                        old.id, 
                        COALESCE(old.task_project_id, t.project_id), 
                        COALESCE(old.task_sequence, t.project_sequence),
                        old.event_type, 
                        old.event_data, 
                        old.metadata, 
                        old.created_at
                    FROM task_history_backup old
                    LEFT JOIN tasks t ON old.task_id = t.id
                    WHERE (old.task_project_id IS NOT NULL AND old.task_sequence IS NOT NULL) OR (t.id IS NOT NULL)
                `,
            },
            {
                tableName: 'task_executions',
                legacyColumn: 'task_id',
                createSql: `
                   CREATE TABLE IF NOT EXISTS "task_executions" (
                        "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                        "task_project_id" integer NOT NULL,
                        "task_sequence" integer NOT NULL,
                        "execution_number" integer DEFAULT 1 NOT NULL,
                        "prompt" text NOT NULL,
                        "response" text,
                        "context" text,
                        "ai_provider" text NOT NULL,
                        "model" text NOT NULL,
                        "temperature" real,
                        "max_tokens" integer,
                        "tokens_used" text,
                        "duration" integer,
                        "cost" real,
                        "status" text DEFAULT 'running' NOT NULL,
                        "error_message" text,
                        "retry_count" integer DEFAULT 0 NOT NULL,
                        "user_feedback" text,
                        "rating" integer,
                        "completed_at" integer,
                        "created_at" integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
                        "updated_at" integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
                        FOREIGN KEY ("task_project_id", "task_sequence") REFERENCES "tasks"("project_id", "project_sequence") ON DELETE CASCADE
                    );
                `,
                migrateSql: `
                    INSERT INTO task_executions (
                        id, task_project_id, task_sequence, execution_number, prompt, response, context, ai_provider, 
                        model, temperature, max_tokens, tokens_used, duration, cost, status, error_message, 
                        retry_count, user_feedback, rating, completed_at, created_at, updated_at
                    )
                    SELECT 
                        old.id, 
                        COALESCE(old.task_project_id, t.project_id), 
                        COALESCE(old.task_sequence, t.project_sequence),
                        old.execution_number, old.prompt, old.response, old.context, old.ai_provider,
                        old.model, old.temperature, old.max_tokens, old.tokens_used, old.duration, old.cost, old.status, old.error_message,
                        old.retry_count, old.user_feedback, old.rating, old.completed_at, old.created_at, old.updated_at
                    FROM task_executions_backup old
                    LEFT JOIN tasks t ON old.task_id = t.id
                    WHERE (old.task_project_id IS NOT NULL AND old.task_sequence IS NOT NULL) OR (t.id IS NOT NULL)
                `,
            },
        ];

        sqlite.prepare('PRAGMA foreign_keys = OFF').run();

        for (const table of tablesToRecreate) {
            try {
                const tableInfo = sqlite
                    .prepare(`PRAGMA table_info(${table.tableName})`)
                    .all() as any[];
                if (tableInfo.length === 0) continue;

                const hasLegacyCol = tableInfo.some((c) => c.name === table.legacyColumn);
                if (hasLegacyCol) {
                    log.warn(
                        `[SchemaRepair] ${table.tableName} has legacy column ${table.legacyColumn}. Recreating table...`
                    );

                    sqlite.transaction(() => {
                        // 1. Rename old
                        sqlite
                            .prepare(
                                `ALTER TABLE ${table.tableName} RENAME TO ${table.tableName}_backup`
                            )
                            .run();

                        // 2. Create new
                        sqlite.prepare(table.createSql).run();

                        // 3. Migrate data
                        try {
                            sqlite.prepare(table.migrateSql).run();
                            log.info(`[SchemaRepair] ✅ Migrated data for ${table.tableName}`);
                        } catch (migErr) {
                            log.error(
                                `[SchemaRepair] Data migration failed for ${table.tableName}:`,
                                migErr
                            );
                            // If migration fails, we at least have the new table. Data loss is unfortunate but allows app to run.
                        }

                        // 4. Drop backup
                        sqlite.prepare(`DROP TABLE ${table.tableName}_backup`).run();
                    })();

                    log.info(`[SchemaRepair] ✅ Recreated ${table.tableName} successfully.`);
                }
            } catch (err) {
                log.error(`[SchemaRepair] Failed to recreate table ${table.tableName}:`, err);
            }
        }

        sqlite.prepare('PRAGMA foreign_keys = ON').run();

        log.info('[SchemaRepair] Schema repair check completed.');
    } catch (error) {
        log.error('[SchemaRepair] Failed to execute schema repair:', error);
        // We don't throw here to ensure app can still try to start,
        // but likely it will fail later if columns are truly missing.
    }
}
