CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`task_id` integer,
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`changes` text,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ai_provider_configs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`team_id` integer,
	`provider` text NOT NULL,
	`api_key` text NOT NULL,
	`endpoint` text,
	`settings` text DEFAULT '{}' NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`monthly_budget` real,
	`current_spend` real DEFAULT 0 NOT NULL,
	`last_tested_at` integer,
	`last_error` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `automations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`name` text NOT NULL,
	`description` text,
	`trigger` text NOT NULL,
	`actions` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`last_run_at` integer,
	`run_count` integer DEFAULT 0 NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`content` text NOT NULL,
	`content_type` text DEFAULT 'markdown' NOT NULL,
	`mentions` text DEFAULT '[]' NOT NULL,
	`parent_comment_id` integer,
	`reactions` text DEFAULT '{}' NOT NULL,
	`edited_at` integer,
	`deleted_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_comment_id`) REFERENCES `comments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`team_id` integer,
	`type` text NOT NULL,
	`credentials` text NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`last_sync_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mcp_integrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`endpoint` text NOT NULL,
	`config_schema` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`is_official` integer DEFAULT false NOT NULL,
	`installed_by` integer NOT NULL,
	`installed_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`installed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`related_project_id` integer,
	`related_task_id` integer,
	`is_read` integer DEFAULT false NOT NULL,
	`read_at` integer,
	`action_url` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`main_prompt` text,
	`status` text DEFAULT 'active' NOT NULL,
	`ai_provider` text,
	`template_id` integer,
	`cover_image` text,
	`color` text,
	`emoji` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`estimated_hours` real,
	`actual_hours` real,
	`total_cost` real DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`owner_id` integer NOT NULL,
	`team_id` integer,
	`git_repository` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `search_indexes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`content` text NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skill_tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`skill_id` integer NOT NULL,
	`tag` text NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`prompt` text NOT NULL,
	`category` text NOT NULL,
	`ai_provider` text,
	`mcp_requirements` text DEFAULT '[]' NOT NULL,
	`input_schema` text,
	`output_schema` text,
	`is_public` integer DEFAULT false NOT NULL,
	`is_official` integer DEFAULT false NOT NULL,
	`author_id` integer NOT NULL,
	`team_id` integer,
	`fork_count` integer DEFAULT 0 NOT NULL,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`rating` real,
	`reviews` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`changelog` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_executions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`execution_number` integer DEFAULT 1 NOT NULL,
	`prompt` text NOT NULL,
	`response` text,
	`context` text,
	`ai_provider` text NOT NULL,
	`model` text NOT NULL,
	`temperature` real,
	`max_tokens` integer,
	`tokens_used` text,
	`duration` integer,
	`cost` real,
	`status` text DEFAULT 'running' NOT NULL,
	`error_message` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`user_feedback` text,
	`rating` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_suggested_skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`skill_id` integer NOT NULL,
	`relevance_score` real,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_watchers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`notify_on_update` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`generated_prompt` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`execution_type` text DEFAULT 'serial' NOT NULL,
	`ai_provider` text,
	`mcp_config` text,
	`order` integer DEFAULT 0 NOT NULL,
	`parent_task_id` integer,
	`assignee_id` integer,
	`watcher_ids` text DEFAULT '[]' NOT NULL,
	`estimated_minutes` integer,
	`actual_minutes` integer,
	`token_usage` text,
	`estimated_cost` real,
	`actual_cost` real,
	`due_date` integer,
	`started_at` integer,
	`completed_at` integer,
	`blocked_reason` text,
	`blocked_by_task_id` integer,
	`tags` text DEFAULT '[]' NOT NULL,
	`git_commits` text DEFAULT '[]' NOT NULL,
	`deleted_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`blocked_by_task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `team_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`team_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`permissions` text DEFAULT '{}' NOT NULL,
	`joined_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`plan` text DEFAULT 'free' NOT NULL,
	`billing_info` text DEFAULT '{}' NOT NULL,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `template_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_id` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`priority` text DEFAULT 'medium' NOT NULL,
	`estimated_minutes` integer,
	`order` integer DEFAULT 0 NOT NULL,
	`parent_task_order` integer,
	`suggested_skills` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`cover_image` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`project_structure` text NOT NULL,
	`ai_provider_recommendations` text,
	`is_public` integer DEFAULT false NOT NULL,
	`is_official` integer DEFAULT false NOT NULL,
	`author_id` integer NOT NULL,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`rating` real,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `time_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer,
	`duration` integer NOT NULL,
	`description` text,
	`is_manual` integer DEFAULT false NOT NULL,
	`is_billable` integer DEFAULT false NOT NULL,
	`hourly_rate` real,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`google_id` text,
	`avatar` text,
	`role` text DEFAULT 'member' NOT NULL,
	`preferences` text DEFAULT '{}' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`onboarding_completed` integer DEFAULT false NOT NULL,
	`last_active_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`events` text NOT NULL,
	`secret` text,
	`headers` text,
	`is_enabled` integer DEFAULT true NOT NULL,
	`last_triggered_at` integer,
	`failure_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_project_idx` ON `activities` (`project_id`);--> statement-breakpoint
CREATE INDEX `activity_task_idx` ON `activities` (`task_id`);--> statement-breakpoint
CREATE INDEX `activity_user_idx` ON `activities` (`user_id`);--> statement-breakpoint
CREATE INDEX `activity_type_idx` ON `activities` (`type`);--> statement-breakpoint
CREATE INDEX `activity_created_at_idx` ON `activities` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_provider_config_user_idx` ON `ai_provider_configs` (`user_id`);--> statement-breakpoint
CREATE INDEX `ai_provider_config_team_idx` ON `ai_provider_configs` (`team_id`);--> statement-breakpoint
CREATE INDEX `automation_project_idx` ON `automations` (`project_id`);--> statement-breakpoint
CREATE INDEX `automation_created_by_idx` ON `automations` (`created_by`);--> statement-breakpoint
CREATE INDEX `comment_task_idx` ON `comments` (`task_id`);--> statement-breakpoint
CREATE INDEX `comment_user_idx` ON `comments` (`user_id`);--> statement-breakpoint
CREATE INDEX `comment_parent_idx` ON `comments` (`parent_comment_id`);--> statement-breakpoint
CREATE INDEX `comment_deleted_idx` ON `comments` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `integration_user_idx` ON `integrations` (`user_id`);--> statement-breakpoint
CREATE INDEX `integration_team_idx` ON `integrations` (`team_id`);--> statement-breakpoint
CREATE INDEX `integration_type_idx` ON `integrations` (`type`);--> statement-breakpoint
CREATE INDEX `mcp_integration_installed_by_idx` ON `mcp_integrations` (`installed_by`);--> statement-breakpoint
CREATE INDEX `notification_user_idx` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE INDEX `notification_is_read_idx` ON `notifications` (`is_read`);--> statement-breakpoint
CREATE INDEX `notification_created_at_idx` ON `notifications` (`created_at`);--> statement-breakpoint
CREATE INDEX `project_member_project_user_idx` ON `project_members` (`project_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `project_owner_idx` ON `projects` (`owner_id`);--> statement-breakpoint
CREATE INDEX `project_team_idx` ON `projects` (`team_id`);--> statement-breakpoint
CREATE INDEX `project_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE INDEX `project_archived_idx` ON `projects` (`is_archived`);--> statement-breakpoint
CREATE INDEX `search_index_entity_idx` ON `search_indexes` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `skill_tag_skill_tag_idx` ON `skill_tags` (`skill_id`,`tag`);--> statement-breakpoint
CREATE INDEX `skill_author_idx` ON `skills` (`author_id`);--> statement-breakpoint
CREATE INDEX `skill_team_idx` ON `skills` (`team_id`);--> statement-breakpoint
CREATE INDEX `skill_category_idx` ON `skills` (`category`);--> statement-breakpoint
CREATE INDEX `skill_public_idx` ON `skills` (`is_public`);--> statement-breakpoint
CREATE INDEX `task_execution_task_idx` ON `task_executions` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_execution_status_idx` ON `task_executions` (`status`);--> statement-breakpoint
CREATE INDEX `task_suggested_skill_task_skill_idx` ON `task_suggested_skills` (`task_id`,`skill_id`);--> statement-breakpoint
CREATE INDEX `task_watcher_task_user_idx` ON `task_watchers` (`task_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `task_project_idx` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX `task_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `task_assignee_idx` ON `tasks` (`assignee_id`);--> statement-breakpoint
CREATE INDEX `task_due_date_idx` ON `tasks` (`due_date`);--> statement-breakpoint
CREATE INDEX `task_deleted_idx` ON `tasks` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `task_parent_idx` ON `tasks` (`parent_task_id`);--> statement-breakpoint
CREATE INDEX `team_member_team_user_idx` ON `team_members` (`team_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `teams_slug_unique` ON `teams` (`slug`);--> statement-breakpoint
CREATE INDEX `team_slug_idx` ON `teams` (`slug`);--> statement-breakpoint
CREATE INDEX `template_task_template_idx` ON `template_tasks` (`template_id`);--> statement-breakpoint
CREATE INDEX `template_author_idx` ON `templates` (`author_id`);--> statement-breakpoint
CREATE INDEX `template_category_idx` ON `templates` (`category`);--> statement-breakpoint
CREATE INDEX `template_public_idx` ON `templates` (`is_public`);--> statement-breakpoint
CREATE INDEX `time_entry_task_idx` ON `time_entries` (`task_id`);--> statement-breakpoint
CREATE INDEX `time_entry_user_idx` ON `time_entries` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);--> statement-breakpoint
CREATE INDEX `user_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `user_google_id_idx` ON `users` (`google_id`);--> statement-breakpoint
CREATE INDEX `webhook_project_idx` ON `webhooks` (`project_id`);