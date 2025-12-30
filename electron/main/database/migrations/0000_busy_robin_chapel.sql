CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`task_project_id` integer,
	`task_sequence` integer,
	`user_id` integer NOT NULL,
	`type` text NOT NULL,
	`changes` text,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
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
CREATE TABLE `automation_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`rule_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`project_id` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`trigger` text NOT NULL,
	`conditions` text DEFAULT '[]' NOT NULL,
	`actions` text NOT NULL,
	`execution_count` integer DEFAULT 0 NOT NULL,
	`last_executed_at` integer,
	`created_by` integer NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
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
	`task_project_id` integer NOT NULL,
	`task_sequence` integer NOT NULL,
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
	`oauth_client_id` text,
	`oauth_client_secret` text,
	`oauth_redirect_uri` text,
	`oauth_scope` text,
	`oauth_cloud_id` text,
	`oauth_access_token` text,
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
	`related_task_project_id` integer,
	`related_task_sequence` integer,
	`is_read` integer DEFAULT false NOT NULL,
	`read_at` integer,
	`action_url` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `operator_mcps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`operator_id` integer NOT NULL,
	`mcp_server_slug` text NOT NULL,
	`config` text,
	`is_required` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`operator_id`) REFERENCES `operators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `operators` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`avatar` text,
	`color` text,
	`description` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`ai_provider` text NOT NULL,
	`ai_model` text NOT NULL,
	`system_prompt` text,
	`is_reviewer` integer DEFAULT false NOT NULL,
	`review_ai_provider` text,
	`review_ai_model` text,
	`is_curator` integer DEFAULT false NOT NULL,
	`specialty` text DEFAULT '[]' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`success_rate` real,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
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
	`ai_model` text,
	`output_type` text,
	`output_path` text,
	`template_id` integer,
	`cover_image` text,
	`color` text,
	`emoji` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`estimated_hours` real,
	`actual_hours` real,
	`total_cost` real DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`owner_id` integer NOT NULL,
	`team_id` integer,
	`git_repository` text,
	`ai_guidelines` text,
	`project_guidelines` text,
	`base_dev_folder` text,
	`technical_stack` text,
	`goal` text,
	`constraints` text,
	`phase` text,
	`memory` text,
	`mcp_config` text,
	`notification_config` text,
	`curator_operator_id` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`curator_operator_id`) REFERENCES `operators`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `provider_models` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`model_name` text,
	`display_name` text,
	`context_window` integer,
	`max_output_tokens` integer,
	`input_cost_per_1m` real,
	`output_cost_per_1m` real,
	`features` text DEFAULT '[]' NOT NULL,
	`best_for` text DEFAULT '[]' NOT NULL,
	`supported_actions` text DEFAULT '[]' NOT NULL,
	`description` text,
	`metadata` text,
	`deprecated` integer DEFAULT false NOT NULL,
	`fetched_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
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
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
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
CREATE TABLE `task_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_project_id` integer NOT NULL,
	`task_sequence` integer NOT NULL,
	`event_type` text NOT NULL,
	`event_data` text,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_suggested_skills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_project_id` integer NOT NULL,
	`task_sequence` integer NOT NULL,
	`skill_id` integer NOT NULL,
	`relevance_score` real,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `task_watchers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_project_id` integer NOT NULL,
	`task_sequence` integer NOT NULL,
	`user_id` integer NOT NULL,
	`notify_on_update` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`project_id` integer NOT NULL,
	`project_sequence` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`generated_prompt` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`priority` text DEFAULT 'medium' NOT NULL,
	`execution_type` text DEFAULT 'serial' NOT NULL,
	`ai_provider` text,
	`ai_model` text,
	`review_ai_provider` text,
	`review_ai_model` text,
	`mcp_config` text,
	`assigned_operator_id` integer,
	`order` integer DEFAULT 0 NOT NULL,
	`parent_project_id` integer,
	`parent_sequence` integer,
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
	`blocked_by_project_id` integer,
	`blocked_by_sequence` integer,
	`tags` text DEFAULT '[]' NOT NULL,
	`git_commits` text DEFAULT '[]' NOT NULL,
	`deleted_at` integer,
	`is_paused` integer DEFAULT false NOT NULL,
	`auto_review` integer DEFAULT false NOT NULL,
	`auto_reviewed` integer DEFAULT false NOT NULL,
	`auto_approve` integer DEFAULT false NOT NULL,
	`review_failed` integer DEFAULT false NOT NULL,
	`trigger_config` text,
	`paused_at` integer,
	`is_subdivided` integer DEFAULT false NOT NULL,
	`subtask_count` integer DEFAULT 0 NOT NULL,
	`execution_result` text,
	`image_config` text,
	`output_format` text DEFAULT 'markdown',
	`code_language` text,
	`execution_order` integer,
	`dependencies` text DEFAULT '[]' NOT NULL,
	`expected_output_format` text,
	`recommended_providers` text DEFAULT '[]' NOT NULL,
	`required_mcps` text DEFAULT '[]' NOT NULL,
	`ai_optimized_prompt` text,
	`task_type` text DEFAULT 'ai',
	`script_code` text,
	`script_language` text,
	`script_runtime` text,
	`input_config` text,
	`input_sub_status` text,
	`output_config` text,
	`notification_config` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`project_id`, `project_sequence`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_operator_id`) REFERENCES `operators`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
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
	`task_project_id` integer NOT NULL,
	`task_sequence` integer NOT NULL,
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
CREATE TABLE `workflow_checkpoints` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`checkpoint_id` text NOT NULL,
	`workflow_execution_id` integer NOT NULL,
	`workflow_id` text NOT NULL,
	`stage_index` integer NOT NULL,
	`completed_task_ids` text NOT NULL,
	`context` text NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`workflow_execution_id`) REFERENCES `workflow_executions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workflow_executions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workflow_id` text NOT NULL,
	`project_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_tasks` integer DEFAULT 0 NOT NULL,
	`completed_tasks` integer DEFAULT 0 NOT NULL,
	`failed_tasks` integer DEFAULT 0 NOT NULL,
	`current_stage` integer DEFAULT 0 NOT NULL,
	`total_stages` integer DEFAULT 0 NOT NULL,
	`total_cost` real DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`total_duration` integer,
	`estimated_duration` integer,
	`execution_plan` text,
	`task_results` text,
	`context` text,
	`error` text,
	`started_by` integer NOT NULL,
	`started_at` integer,
	`paused_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`started_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_project_idx` ON `activities` (`project_id`);--> statement-breakpoint
CREATE INDEX `activity_task_idx` ON `activities` (`task_project_id`,`task_sequence`);--> statement-breakpoint
CREATE INDEX `activity_user_idx` ON `activities` (`user_id`);--> statement-breakpoint
CREATE INDEX `activity_type_idx` ON `activities` (`type`);--> statement-breakpoint
CREATE INDEX `activity_created_at_idx` ON `activities` (`created_at`);--> statement-breakpoint
CREATE INDEX `ai_provider_config_user_idx` ON `ai_provider_configs` (`user_id`);--> statement-breakpoint
CREATE INDEX `ai_provider_config_team_idx` ON `ai_provider_configs` (`team_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `automation_rules_rule_id_unique` ON `automation_rules` (`rule_id`);--> statement-breakpoint
CREATE INDEX `automation_rule_id_idx` ON `automation_rules` (`rule_id`);--> statement-breakpoint
CREATE INDEX `automation_rule_project_idx` ON `automation_rules` (`project_id`);--> statement-breakpoint
CREATE INDEX `automation_rule_enabled_idx` ON `automation_rules` (`enabled`);--> statement-breakpoint
CREATE INDEX `automation_project_idx` ON `automations` (`project_id`);--> statement-breakpoint
CREATE INDEX `automation_created_by_idx` ON `automations` (`created_by`);--> statement-breakpoint
CREATE INDEX `comment_task_idx` ON `comments` (`task_project_id`,`task_sequence`);--> statement-breakpoint
CREATE INDEX `comment_user_idx` ON `comments` (`user_id`);--> statement-breakpoint
CREATE INDEX `comment_parent_idx` ON `comments` (`parent_comment_id`);--> statement-breakpoint
CREATE INDEX `comment_deleted_idx` ON `comments` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `integration_user_idx` ON `integrations` (`user_id`);--> statement-breakpoint
CREATE INDEX `integration_team_idx` ON `integrations` (`team_id`);--> statement-breakpoint
CREATE INDEX `integration_type_idx` ON `integrations` (`type`);--> statement-breakpoint
CREATE INDEX `mcp_integration_installed_by_idx` ON `mcp_integrations` (`installed_by`);--> statement-breakpoint
CREATE INDEX `notification_user_idx` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE INDEX `notification_type_idx` ON `notifications` (`type`);--> statement-breakpoint
CREATE INDEX `notification_read_idx` ON `notifications` (`is_read`);--> statement-breakpoint
CREATE INDEX `notification_created_at_idx` ON `notifications` (`created_at`);--> statement-breakpoint
CREATE INDEX `operator_mcp_operator_idx` ON `operator_mcps` (`operator_id`);--> statement-breakpoint
CREATE INDEX `operator_project_idx` ON `operators` (`project_id`);--> statement-breakpoint
CREATE INDEX `operator_active_idx` ON `operators` (`is_active`);--> statement-breakpoint
CREATE INDEX `project_member_project_user_idx` ON `project_members` (`project_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `project_owner_idx` ON `projects` (`owner_id`);--> statement-breakpoint
CREATE INDEX `project_team_idx` ON `projects` (`team_id`);--> statement-breakpoint
CREATE INDEX `project_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE INDEX `project_archived_idx` ON `projects` (`is_archived`);--> statement-breakpoint
CREATE INDEX `provider_model_provider_idx` ON `provider_models` (`provider`);--> statement-breakpoint
CREATE INDEX `provider_model_provider_model_idx` ON `provider_models` (`provider`,`model_id`);--> statement-breakpoint
CREATE INDEX `provider_model_fetched_at_idx` ON `provider_models` (`fetched_at`);--> statement-breakpoint
CREATE INDEX `search_index_entity_idx` ON `search_indexes` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `setting_key_idx` ON `settings` (`key`);--> statement-breakpoint
CREATE INDEX `skill_tag_skill_tag_idx` ON `skill_tags` (`skill_id`,`tag`);--> statement-breakpoint
CREATE INDEX `skill_author_idx` ON `skills` (`author_id`);--> statement-breakpoint
CREATE INDEX `skill_team_idx` ON `skills` (`team_id`);--> statement-breakpoint
CREATE INDEX `skill_category_idx` ON `skills` (`category`);--> statement-breakpoint
CREATE INDEX `skill_public_idx` ON `skills` (`is_public`);--> statement-breakpoint
CREATE INDEX `task_history_task_idx` ON `task_history` (`task_project_id`,`task_sequence`);--> statement-breakpoint
CREATE INDEX `task_history_event_type_idx` ON `task_history` (`event_type`);--> statement-breakpoint
CREATE INDEX `task_history_created_at_idx` ON `task_history` (`created_at`);--> statement-breakpoint
CREATE INDEX `task_suggested_skill_task_skill_idx` ON `task_suggested_skills` (`task_project_id`,`task_sequence`,`skill_id`);--> statement-breakpoint
CREATE INDEX `task_watcher_task_user_idx` ON `task_watchers` (`task_project_id`,`task_sequence`,`user_id`);--> statement-breakpoint
CREATE INDEX `task_project_idx` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE INDEX `task_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `task_assignee_idx` ON `tasks` (`assignee_id`);--> statement-breakpoint
CREATE INDEX `task_due_date_idx` ON `tasks` (`due_date`);--> statement-breakpoint
CREATE INDEX `task_deleted_idx` ON `tasks` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `task_parent_idx` ON `tasks` (`parent_project_id`,`parent_sequence`);--> statement-breakpoint
CREATE INDEX `task_project_sequence_idx` ON `tasks` (`project_id`,`project_sequence`);--> statement-breakpoint
CREATE INDEX `team_member_team_user_idx` ON `team_members` (`team_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `teams_slug_unique` ON `teams` (`slug`);--> statement-breakpoint
CREATE INDEX `team_slug_idx` ON `teams` (`slug`);--> statement-breakpoint
CREATE INDEX `template_task_template_idx` ON `template_tasks` (`template_id`);--> statement-breakpoint
CREATE INDEX `template_author_idx` ON `templates` (`author_id`);--> statement-breakpoint
CREATE INDEX `template_category_idx` ON `templates` (`category`);--> statement-breakpoint
CREATE INDEX `template_public_idx` ON `templates` (`is_public`);--> statement-breakpoint
CREATE INDEX `time_entry_task_idx` ON `time_entries` (`task_project_id`,`task_sequence`);--> statement-breakpoint
CREATE INDEX `time_entry_user_idx` ON `time_entries` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);--> statement-breakpoint
CREATE INDEX `user_email_idx` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `user_google_id_idx` ON `users` (`google_id`);--> statement-breakpoint
CREATE INDEX `webhook_project_idx` ON `webhooks` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_checkpoints_checkpoint_id_unique` ON `workflow_checkpoints` (`checkpoint_id`);--> statement-breakpoint
CREATE INDEX `workflow_checkpoint_id_idx` ON `workflow_checkpoints` (`checkpoint_id`);--> statement-breakpoint
CREATE INDEX `workflow_checkpoint_execution_idx` ON `workflow_checkpoints` (`workflow_execution_id`);--> statement-breakpoint
CREATE INDEX `workflow_checkpoint_workflow_id_idx` ON `workflow_checkpoints` (`workflow_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_executions_workflow_id_unique` ON `workflow_executions` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `workflow_execution_workflow_id_idx` ON `workflow_executions` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `workflow_execution_project_idx` ON `workflow_executions` (`project_id`);--> statement-breakpoint
CREATE INDEX `workflow_execution_status_idx` ON `workflow_executions` (`status`);--> statement-breakpoint
CREATE INDEX `workflow_execution_started_by_idx` ON `workflow_executions` (`started_by`);