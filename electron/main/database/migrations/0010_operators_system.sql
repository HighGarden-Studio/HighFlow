-- Migration: Create operators and operator_mcps tables
-- Date: 2025-12-09

-- Create operators table
CREATE TABLE IF NOT EXISTS operators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    avatar TEXT,
    color TEXT DEFAULT '#667eea',
    ai_provider TEXT NOT NULL,
    ai_model TEXT NOT NULL,
    system_prompt TEXT,
    is_reviewer INTEGER DEFAULT 0,
    specialty TEXT, -- JSON array of specialties
    usage_count INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    project_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Create operator_mcps junction table
CREATE TABLE IF NOT EXISTS operator_mcps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id INTEGER NOT NULL,
    mcp_server_name TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE CASCADE,
    UNIQUE(operator_id, mcp_server_name)
);

-- Add assigned_operator_id to tasks table (if not exists)
ALTER TABLE tasks ADD COLUMN assigned_operator_id INTEGER REFERENCES operators(id) ON DELETE SET NULL;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_operators_project_id ON operators(project_id);
CREATE INDEX IF NOT EXISTS idx_operators_is_active ON operators(is_active);
CREATE INDEX IF NOT EXISTS idx_operator_mcps_operator_id ON operator_mcps(operator_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_operator ON tasks(assigned_operator_id);
