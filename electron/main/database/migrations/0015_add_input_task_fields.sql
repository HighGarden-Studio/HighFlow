-- Add Input Task fields
-- These columns support the Input Task type functionality

ALTER TABLE tasks ADD COLUMN input_config TEXT;
ALTER TABLE tasks ADD COLUMN input_sub_status TEXT;
