-- Migration: Add autoApprove field to tasks table
-- This allows individual tasks to skip review and go directly to DONE status

ALTER TABLE tasks ADD COLUMN auto_approve INTEGER DEFAULT 0;
