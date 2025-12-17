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
	`ai_provider` text NOT NULL,
	`ai_model` text NOT NULL,
	`system_prompt` text,
	`is_reviewer` integer DEFAULT false NOT NULL,
	`review_ai_provider` text,
	`review_ai_model` text,
	`specialty` text DEFAULT '[]' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`success_rate` real,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE projects ADD `goal` text;--> statement-breakpoint
ALTER TABLE projects ADD `constraints` text;--> statement-breakpoint
ALTER TABLE projects ADD `phase` text;--> statement-breakpoint
ALTER TABLE projects ADD `memory` text;--> statement-breakpoint
ALTER TABLE projects ADD `notification_config` text;--> statement-breakpoint
ALTER TABLE tasks ADD `project_sequence` integer NOT NULL;--> statement-breakpoint
ALTER TABLE tasks ADD `ai_model` text;--> statement-breakpoint
ALTER TABLE tasks ADD `review_ai_provider` text;--> statement-breakpoint
ALTER TABLE tasks ADD `review_ai_model` text;--> statement-breakpoint
ALTER TABLE tasks ADD `assigned_operator_id` integer REFERENCES operators(id);--> statement-breakpoint
ALTER TABLE tasks ADD `auto_approve` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE tasks ADD `image_config` text;--> statement-breakpoint
ALTER TABLE tasks ADD `task_type` text DEFAULT 'ai';--> statement-breakpoint
ALTER TABLE tasks ADD `script_code` text;--> statement-breakpoint
ALTER TABLE tasks ADD `script_language` text;--> statement-breakpoint
ALTER TABLE tasks ADD `script_runtime` text;--> statement-breakpoint
ALTER TABLE tasks ADD `input_config` text;--> statement-breakpoint
ALTER TABLE tasks ADD `input_sub_status` text;--> statement-breakpoint
ALTER TABLE tasks ADD `output_config` text;--> statement-breakpoint
CREATE INDEX `operator_mcp_operator_idx` ON `operator_mcps` (`operator_id`);--> statement-breakpoint
CREATE INDEX `operator_project_idx` ON `operators` (`project_id`);--> statement-breakpoint
CREATE INDEX `operator_active_idx` ON `operators` (`is_active`);--> statement-breakpoint
CREATE INDEX `task_project_sequence_idx` ON `tasks` (`project_id`,`project_sequence`);--> statement-breakpoint
/*
 SQLite does not support "Creating foreign key on existing column" out of the box, we do not generate automatic migration for that, so it has to be done manually
 Please refer to: https://www.techonthenet.com/sqlite/tables/alter_table.php
                  https://www.sqlite.org/lang_altertable.html

 Due to that we don't generate migration automatically and it has to be done manually
*/