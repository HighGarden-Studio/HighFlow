/**
 * Database Migration Runner
 *
 * Runs database migrations using drizzle-orm
 */

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import log from 'electron-log';

/**
 * Run database migrations
 * @param sqlite - SQLite database instance
 * @param migrationsPath - Path to migrations folder (optional, defaults to bundled migrations)
 */
export function runMigrations(sqlite: Database.Database, migrationsPath?: string): void {
    const db = drizzle(sqlite);

    // Determine migrations folder path
    let migrationsFolder: string;

    if (migrationsPath) {
        migrationsFolder = migrationsPath;
    } else {
        // In development: from project root
        // In production: from bundled files
        const isDev = process.env.NODE_ENV === 'development';

        if (isDev) {
            migrationsFolder = path.join(process.cwd(), 'electron/main/database/migrations');
        } else {
            // In production, migrations are copied to dist-electron/main/database/migrations
            migrationsFolder = path.join(__dirname, 'migrations');
        }
    }

    log.info(`[Migrator] Looking for migrations in: ${migrationsFolder}`);
    log.info(`[Migrator] Current __dirname: ${__dirname}`);
    log.info(`[Migrator] Current process.cwd: ${process.cwd()}`);

    if (!fs.existsSync(migrationsFolder)) {
        log.warn(`[Migrator] Migrations folder not found: ${migrationsFolder}`);
        log.warn(
            `[Migrator] Contents of parent dir (${path.dirname(migrationsFolder)}):`,
            fs.existsSync(path.dirname(migrationsFolder))
                ? fs.readdirSync(path.dirname(migrationsFolder))
                : 'Parent not found'
        );
        log.warn('[Migrator] Skipping migrations - detailed check required');
        return;
    }

    try {
        log.info(`[Migrator] Found migrations folder. Contents:`, fs.readdirSync(migrationsFolder));
        migrate(db, { migrationsFolder });
        log.info('[Migrator] ✅ Migrations completed successfully');
    } catch (error) {
        log.error('❌ Migration failed:', error);
        throw error;
    }
}
