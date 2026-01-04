import Database from 'better-sqlite3';
import path from 'node:path';

const dbPath = path.join(process.cwd(), '.dev-data', 'workflow-manager.db');
console.log(`Checking database at: ${dbPath}`);

const db = new Database(dbPath);

try {
    // Check if table exists
    const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='script_templates'")
        .all();
    console.log('Table exists:', tables.length > 0);

    if (tables.length > 0) {
        console.log('✅ script_templates table found');
        const count = db.prepare('SELECT COUNT(*) as count FROM script_templates').get();
        console.log(`Table has ${count.count} rows`);
    } else {
        console.log('❌ script_templates table NOT found');
        console.log('\nAll tables in database:');
        const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        allTables.forEach((t) => console.log(` - ${t.name}`));
    }
} catch (error) {
    console.error('Error:', error);
} finally {
    db.close();
}
