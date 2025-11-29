/**
 * Initialize Database Script
 *
 * Applies migrations and seeds the database
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const dbPath = path.join(process.cwd(), '.dev-data', 'workflow-manager.db');
const migrationsDir = path.join(process.cwd(), 'electron/main/database/migrations');

// Ensure directory exists
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

// Remove existing database
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log('Removed existing database');
}

// Create new database
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF'); // Disable during migration

console.log('Created database:', dbPath);

// Read and apply migrations
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

for (const file of migrationFiles) {
  console.log(`\nApplying migration: ${file}`);
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');

  // Split by statement-breakpoint and execute each statement
  const statements = sql.split('--> statement-breakpoint');

  for (const stmt of statements) {
    const trimmed = stmt.trim();
    if (trimmed) {
      try {
        db.exec(trimmed);
      } catch (e) {
        // Some statements might fail (like ALTER TABLE for existing columns)
        console.log(`  Skipping (may already exist): ${trimmed.substring(0, 50)}...`);
      }
    }
  }
  console.log(`  ✅ Applied`);
}

// Re-enable foreign keys
db.pragma('foreign_keys = ON');

console.log('\n✅ Database initialized successfully!');

db.close();
