const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), '.dev-data/workflow-manager.db');
console.log('Opening DB at:', dbPath);

try {
    const db = new Database(dbPath, { readonly: true });
    const tableInfo = db.prepare('PRAGMA table_info(tasks)').all();
    console.log('Tasks Table Columns:', JSON.stringify(tableInfo, null, 2));
} catch (e) {
    console.error(e);
}
