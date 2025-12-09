-- Migration: AI Operator System
-- Created: 2025-12-09
-- Description: Adds operators table and operator_mcps junction table for AI agent presets

-- Create operators table
CREATE TABLE operators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,  -- NULL for global operators
    
    -- Basic Info
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    avatar TEXT,  -- emoji or image URL
    color TEXT,   -- hex color
    description TEXT,
    
    -- AI Configuration
    ai_provider TEXT NOT NULL,
    ai_model TEXT NOT NULL,
    system_prompt TEXT,
    
    -- Review Configuration (for QA operators)
    is_reviewer INTEGER DEFAULT 0 NOT NULL,
    review_ai_provider TEXT,
    review_ai_model TEXT,
    
    -- Metadata
    specialty TEXT,  -- JSON array of specialties
    is_active INTEGER DEFAULT 1 NOT NULL,
    usage_count INTEGER DEFAULT 0 NOT NULL,
    success_rate REAL,
    
    created_at INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX operator_project_idx ON operators(project_id);
CREATE INDEX operator_active_idx ON operators(is_active);

-- Create operator_mcps junction table
CREATE TABLE operator_mcps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operator_id INTEGER NOT NULL,
    mcp_server_slug TEXT NOT NULL,
    config TEXT,  -- JSON: MCP-specific config override
    is_required INTEGER DEFAULT 1 NOT NULL,
    created_at INTEGER NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (operator_id) REFERENCES operators(id) ON DELETE CASCADE,
    UNIQUE(operator_id, mcp_server_slug)
);

CREATE INDEX operator_mcp_operator_idx ON operator_mcps(operator_id);

-- Add assigned_operator_id to tasks table
ALTER TABLE tasks ADD COLUMN assigned_operator_id INTEGER REFERENCES operators(id) ON DELETE SET NULL;

CREATE INDEX task_operator_idx ON tasks(assigned_operator_id);
