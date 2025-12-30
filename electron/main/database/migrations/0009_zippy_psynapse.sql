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
CREATE INDEX `provider_model_provider_idx` ON `provider_models` (`provider`);--> statement-breakpoint
CREATE INDEX `provider_model_provider_model_idx` ON `provider_models` (`provider`,`model_id`);--> statement-breakpoint
CREATE INDEX `provider_model_fetched_at_idx` ON `provider_models` (`fetched_at`);