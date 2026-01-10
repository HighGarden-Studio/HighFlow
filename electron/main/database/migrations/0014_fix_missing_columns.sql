-- Fix missing columns from previous failed/squashed migrations

-- Add mcp_config to projects table
ALTER TABLE projects ADD COLUMN mcp_config text;

-- Add parent fields to tasks table
ALTER TABLE tasks ADD COLUMN parent_project_id integer;
ALTER TABLE tasks ADD COLUMN parent_sequence integer;
