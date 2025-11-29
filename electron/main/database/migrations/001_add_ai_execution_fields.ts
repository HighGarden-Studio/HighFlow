/**
 * Database Migration: Add AI Execution Optimization Fields to Tasks
 *
 * This migration adds new fields to the tasks table to support
 * AI interview-based detailed task generation with execution metadata.
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import { app } from 'electron';

export function migrateAddAIExecutionFields(db: Database.Database): void {
    console.log('[Migration] Adding AI execution optimization fields to tasks table...');

    try {
        // Add new columns to tasks table
        const migrations = [
            `ALTER TABLE tasks ADD COLUMN execution_order INTEGER`,
            `ALTER TABLE tasks ADD COLUMN dependencies TEXT NOT NULL DEFAULT '[]'`,
            `ALTER TABLE tasks ADD COLUMN expected_output_format TEXT`,
            `ALTER TABLE tasks ADD COLUMN recommended_providers TEXT NOT NULL DEFAULT '[]'`,
            `ALTER TABLE tasks ADD COLUMN required_mcps TEXT NOT NULL DEFAULT '[]'`,
            `ALTER TABLE tasks ADD COLUMN ai_optimized_prompt TEXT`,
        ];

        // Execute each migration
        for (const migration of migrations) {
            try {
                db.exec(migration);
                console.log(`[Migration] ✓ ${migration.substring(0, 50)}...`);
            } catch (error: any) {
                // Ignore "duplicate column" errors (column already exists)
                if (!error.message.includes('duplicate column')) {
                    throw error;
                }
                console.log(`[Migration] ⊘ Column already exists, skipping...`);
            }
        }

        console.log('[Migration] ✓ AI execution optimization fields added successfully');
    } catch (error) {
        console.error('[Migration] ✗ Failed to add AI execution optimization fields:', error);
        throw error;
    }
}

/**
 * Run migration if this file is executed directly
 */
if (require.main === module) {
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    const dbPath = isDev
        ? path.join(process.cwd(), '.dev-data', 'workflow-manager.db')
        : path.join(app.getPath('userData'), 'workflow-manager.db');

    console.log(`[Migration] Database path: ${dbPath}`);

    const db = new Database(dbPath);
    migrateAddAIExecutionFields(db);
    db.close();

    console.log('[Migration] Migration completed successfully');
}
