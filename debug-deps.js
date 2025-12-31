const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(process.cwd(), '.dev-data', 'workflow-manager.db');
console.log('Opening DB:', dbPath);
const db = new Database(dbPath);
const rows = db
    .prepare('SELECT project_sequence, task_type, trigger_config FROM tasks WHERE project_id = 2')
    .all();
rows.forEach((r) => {
    try {
        const config = JSON.parse(r.trigger_config || '{}');
        console.log(`Task ${r.project_sequence} (${r.task_type}):`, config.dependsOn?.taskIds);
    } catch (e) {
        console.log(`Task ${r.project_sequence}: Error parsing config:`, e.message);
    }
});
