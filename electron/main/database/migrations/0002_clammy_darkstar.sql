ALTER TABLE projects ADD `ai_model` text;--> statement-breakpoint
ALTER TABLE projects ADD `output_type` text;--> statement-breakpoint
ALTER TABLE projects ADD `output_path` text;--> statement-breakpoint
ALTER TABLE projects ADD `total_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE projects ADD `ai_guidelines` text;--> statement-breakpoint
ALTER TABLE projects ADD `technical_stack` text;