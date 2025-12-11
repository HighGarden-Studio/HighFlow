-- Add notification configuration columns to projects and tasks tables
-- Migration: 0012_add_notification_config

-- Add notification columns to projects
ALTER TABLE projects ADD COLUMN slackChannelId TEXT;
ALTER TABLE projects ADD COLUMN slackWebhookUrl TEXT;
ALTER TABLE projects ADD COLUMN webhookUrl TEXT;
ALTER TABLE projects ADD COLUMN webhookSecret TEXT;
ALTER TABLE projects ADD COLUMN notificationConfig TEXT;

-- Add notification columns to tasks  
ALTER TABLE tasks ADD COLUMN slackChannelId TEXT;
ALTER TABLE tasks ADD COLUMN slackWebhookUrl TEXT;
ALTER TABLE tasks ADD COLUMN webhookUrl TEXT;
ALTER TABLE tasks ADD COLUMN webhookSecret TEXT;
ALTER TABLE tasks ADD COLUMN notificationConfig TEXT;
