/**
 * Temporary IPC handler to execute migration SQL
 * Add this to electron/main/index.ts temporarily
 */

import { ipcMain } from 'electron';
import { db } from './database/client';
import fs from 'node:fs';
import path from 'node:path';

// Temporary handler - remove after migration
ipcMain.handle('debug:execute-migration', async () => {
    try {
        const migrationPath = path.join(
            __dirname,
            '../electron/main/database/migrations/0013_add_script_templates.sql'
        );
        const sql = fs.readFileSync(migrationPath, 'utf-8');

        console.log('Executing migration SQL manually...');

        // Execute the SQL
        const statements = sql
            .split('-->')
            .map((s) => s.trim())
            .filter((s) => s && !s.startsWith('statement-breakpoint'));

        for (const statement of statements) {
            if (statement) {
                db.run(sql(statement));
            }
        }

        console.log('✅ Migration SQL executed');

        // Verify table exists
        const result = db
            .prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='script_templates'"
            )
            .all();

        return { success: true, tableExists: result.length > 0 };
    } catch (error) {
        console.error('Migration execution failed:', error);
        return { success: false, error: error.message };
    }
});
