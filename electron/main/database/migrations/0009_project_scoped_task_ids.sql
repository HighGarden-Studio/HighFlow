-- Migration: Add project-scoped task sequence numbers
-- Created: 2025-12-09
-- Description: Adds projectSequence column to tasks table for project-specific sequential task IDs

-- Add projectSequence column to tasks table
ALTER TABLE tasks ADD COLUMN project_sequence INTEGER;

-- Create unique index for project-scoped sequence
CREATE UNIQUE INDEX task_project_sequence_idx ON tasks(project_id, project_sequence);

-- Backfill existing tasks with sequential numbers per project
-- SQLite supports UPDATE with subquery, but we need to do this carefully
UPDATE tasks
SET project_sequence = (
  SELECT COUNT(*)
  FROM tasks t2
  WHERE t2.project_id = tasks.project_id
    AND t2.created_at <= tasks.created_at
    AND t2.deleted_at IS NULL
)
WHERE deleted_at IS NULL;
