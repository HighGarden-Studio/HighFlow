-- Migration: Add AI execution optimization fields to tasks table
-- Created: 2025-11-27

ALTER TABLE tasks ADD `execution_order` integer;--> statement-breakpoint
ALTER TABLE tasks ADD `dependencies` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE tasks ADD `expected_output_format` text;--> statement-breakpoint
ALTER TABLE tasks ADD `recommended_providers` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE tasks ADD `required_mcps` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE tasks ADD `ai_optimized_prompt` text;
