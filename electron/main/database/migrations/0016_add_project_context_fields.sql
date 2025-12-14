-- Add project context management fields
ALTER TABLE projects ADD COLUMN goal TEXT;
ALTER TABLE projects ADD COLUMN constraints TEXT;
ALTER TABLE projects ADD COLUMN phase TEXT;
ALTER TABLE projects ADD COLUMN memory TEXT;
ALTER TABLE projects ADD COLUMN notification_config TEXT;
