/**
 * Database Migration Script
 *
 * Run this script to apply database migrations
 * Usage: pnpm db:migrate
 */

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';

// Get database path
const getUserDataPath = (): string => {
  if (process.env.NODE_ENV === 'production') {
    // In production, use app data directory
    // This will need to be adjusted based on platform
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(homeDir, '.workflow-manager');
  }
  return path.join(process.cwd(), '.dev-data');
};

const dbDir = getUserDataPath();
const dbPath = path.join(dbDir, 'workflow-manager.db');

// Ensure directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`Created directory: ${dbDir}`);
}

console.log(`Migrating database at: ${dbPath}`);

// Initialize SQLite
const sqlite = new Database(dbPath);

// Enable WAL mode
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

// Initialize Drizzle
const db = drizzle(sqlite);

// Run migrations
const migrationsFolder = path.join(process.cwd(), 'electron/main/database/migrations');

console.log(`Looking for migrations in: ${migrationsFolder}`);

try {
  migrate(db, { migrationsFolder });
  console.log('✅ Migrations completed successfully');
} catch (error) {
  console.error('❌ Migration failed:', error);
  process.exit(1);
} finally {
  sqlite.close();
}
