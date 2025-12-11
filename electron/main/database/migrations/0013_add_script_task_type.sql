-- Add script task type support
-- Migration: 0013_add_script_task_type

-- Add taskType column with default 'ai'
ALTER TABLE tasks ADD COLUMN taskType TEXT DEFAULT 'ai' CHECK(taskType IN ('ai', 'script'));

-- Add script-specific columns
ALTER TABLE tasks ADD COLUMN scriptCode TEXT;
ALTER TABLE tasks ADD COLUMN scriptLanguage TEXT CHECK(scriptLanguage IN ('javascript', 'typescript', 'python'));
ALTER TABLE tasks ADD COLUMN scriptRuntime TEXT;

-- Set existing tasks to 'ai' type
UPDATE tasks SET taskType = 'ai' WHERE taskType IS NULL;
