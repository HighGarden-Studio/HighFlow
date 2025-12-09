#!/usr/bin/env python3
import sqlite3

# Connect to database
conn = sqlite3.connect('.dev-data/workflow-manager.db')
cursor = conn.cursor()

# Get all tasks grouped by project
cursor.execute("""
    SELECT id, project_id 
    FROM tasks 
    WHERE deleted_at IS NULL 
    ORDER BY project_id, created_at ASC
""")

tasks = cursor.fetchall()

# Group by project and assign sequence numbers
project_sequences = {}
for task_id, project_id in tasks:
    if project_id not in project_sequences:
        project_sequences[project_id] = 1
    else:
        project_sequences[project_id] += 1
    
    sequence = project_sequences[project_id]
    cursor.execute("UPDATE tasks SET project_sequence = ? WHERE id = ?", (sequence, task_id))
    print(f"Task {task_id} (Project {project_id}): #{sequence}")

# Commit changes
conn.commit()

# Create unique index
try:
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS task_project_sequence_idx ON tasks(project_id, project_sequence)")
    conn.commit()
    print("\n✅ Unique index created successfully")
except Exception as e:
    print(f"\n⚠️  Index creation: {e}")

# Verify
cursor.execute("SELECT COUNT(*) FROM tasks WHERE project_sequence IS NOT NULL")
count = cursor.fetchone()[0]
print(f"\n✅ {count} tasks updated with project_sequence")

conn.close()
