/**
 * Drizzle ORM Database Client
 *
 * Initializes SQLite database connection with Drizzle ORM
 */

import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import path from 'node:path';
import * as schema from './schema';
import * as relations from './relations';
import { runMigrations } from './migrator';
import { repairDatabaseSchema } from './repair';
import log from 'electron-log';

// Get user data directory
const getUserDataPath = (): string => {
    if (process.env.NODE_ENV === 'development' || !process.versions.electron) {
        // Development mode or running in Node.js (not Electron)
        return path.join(process.cwd(), '.dev-data');
    }

    // Running in Electron
    const { app } = require('electron');
    return app.getPath('userData');
};

// Database file path
const dbPath = path.join(getUserDataPath(), 'workflow-manager.db');

let sqlite;
try {
    log.info(`[DB] Database path: ${dbPath}`);
    // Initialize SQLite
    sqlite = new Database(dbPath);
    log.info('[DB] Database opened successfully');
} catch (error) {
    log.error('Failed to open database:', error);
    process.exit(1);
}

// Enable WAL mode for better concurrency
sqlite.pragma('journal_mode = WAL');

// Enable foreign keys
sqlite.pragma('foreign_keys = ON');

// Optimize for performance
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('cache_size = -64000'); // 64MB cache

// Run database migrations
try {
    log.info('Running database migrations...');
    runMigrations(sqlite);
    log.info('Migrations completed successfully');

    // Run manual repair to ensure schema is correct even if migrations were skipped
    repairDatabaseSchema(sqlite);
} catch (error) {
    log.error('Migration error:', error);
    throw error;
}

// Initialize Drizzle with schema and relations
export const db = drizzle(sqlite, {
    schema: {
        ...schema,
        ...relations,
    },
});

// Export schema for use in repositories
export { schema };

// Graceful shutdown
process.on('exit', () => {
    sqlite.close();
});

process.on('SIGINT', () => {
    sqlite.close();
    process.exit(0);
});
