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

    console.log(`Looking for migrations in: ${migrationsFolder}`);

    if (!fs.existsSync(migrationsFolder)) {
        console.warn(`Migrations folder not found: ${migrationsFolder}`);
        console.warn('Skipping migrations');
        return;
    }

    try {
        migrate(db, { migrationsFolder });
        console.log('✅ Migrations completed successfully');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}
