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
ALTER TABLE tasks ADD `is_paused` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE tasks ADD `auto_review` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE tasks ADD `auto_reviewed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE tasks ADD `trigger_config` text;--> statement-breakpoint
ALTER TABLE tasks ADD `paused_at` integer;--> statement-breakpoint
ALTER TABLE tasks ADD `is_subdivided` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE tasks ADD `subtask_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `automation_rules_rule_id_unique` ON `automation_rules` (`rule_id`);--> statement-breakpoint
CREATE INDEX `automation_rule_id_idx` ON `automation_rules` (`rule_id`);--> statement-breakpoint
CREATE INDEX `automation_rule_project_idx` ON `automation_rules` (`project_id`);--> statement-breakpoint
CREATE INDEX `automation_rule_enabled_idx` ON `automation_rules` (`enabled`);--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_checkpoints_checkpoint_id_unique` ON `workflow_checkpoints` (`checkpoint_id`);--> statement-breakpoint
CREATE INDEX `workflow_checkpoint_id_idx` ON `workflow_checkpoints` (`checkpoint_id`);--> statement-breakpoint
CREATE INDEX `workflow_checkpoint_execution_idx` ON `workflow_checkpoints` (`workflow_execution_id`);--> statement-breakpoint
CREATE INDEX `workflow_checkpoint_workflow_id_idx` ON `workflow_checkpoints` (`workflow_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_executions_workflow_id_unique` ON `workflow_executions` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `workflow_execution_workflow_id_idx` ON `workflow_executions` (`workflow_id`);--> statement-breakpoint
CREATE INDEX `workflow_execution_project_idx` ON `workflow_executions` (`project_id`);--> statement-breakpoint
CREATE INDEX `workflow_execution_status_idx` ON `workflow_executions` (`status`);--> statement-breakpoint
CREATE INDEX `workflow_execution_started_by_idx` ON `workflow_executions` (`started_by`);