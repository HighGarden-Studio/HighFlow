CREATE TABLE IF NOT EXISTS `task_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`event_data` text,
	`metadata` text,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE projects ADD `project_guidelines` text;--> statement-breakpoint
ALTER TABLE projects ADD `base_dev_folder` text;--> statement-breakpoint
ALTER TABLE tasks ADD `review_failed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE tasks ADD `output_format` text DEFAULT 'markdown';--> statement-breakpoint
ALTER TABLE tasks ADD `code_language` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `task_history_task_idx` ON `task_history` (`task_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `task_history_event_type_idx` ON `task_history` (`event_type`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `task_history_created_at_idx` ON `task_history` (`created_at`);
