/**
 * Manual Migration Execution Script
 * Applies the 0013_add_script_templates migration manually
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(process.cwd(), '.dev-data', 'workflow-manager.db');
const migrationPath = path.join(
    process.cwd(),
    'electron/main/database/migrations/0013_add_script_templates.sql'
);

console.log(`Database: ${dbPath}`);
console.log(`Migration: ${migrationPath}`);

const db = new Database(dbPath);

try {
    // Read the migration SQL
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    console.log('\n📝 Executing migration SQL...\n');

    // Split by statement breakpoint and execute each
    const statements = sql
        .split('-->')
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith('statement-breakpoint'));

    db.exec('BEGIN TRANSACTION');

    for (const statement of statements) {
        if (statement) {
            console.log(`Executing: ${statement.substring(0, 50)}...`);
            db.exec(statement);
        }
    }

    db.exec('COMMIT');

    console.log('\n✅ Migration executed successfully!');

    // Verify table exists
    const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='script_templates'")
        .all();
    if (tables.length > 0) {
        console.log('✅ script_templates table verified');
    } else {
        console.log('❌ Table creation failed');
    }
} catch (error) {
    console.error('❌ Migration failed:', error.message);
    db.exec('ROLLBACK');
    process.exit(1);
} finally {
    db.close();
}
