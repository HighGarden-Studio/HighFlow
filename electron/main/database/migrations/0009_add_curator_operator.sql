ALTER TABLE operators ADD `is_curator` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE projects ADD `curator_operator_id` integer REFERENCES operators(id);