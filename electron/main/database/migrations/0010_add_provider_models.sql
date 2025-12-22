-- Migration: Add provider_models table for dynamic AI model caching
-- Created: 2025-12-19

CREATE TABLE IF NOT EXISTS provider_models (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    model_name TEXT,
    display_name TEXT,
    context_window INTEGER,
    max_output_tokens INTEGER,
    input_cost_per_1m REAL,
    output_cost_per_1m REAL,
    features TEXT NOT NULL DEFAULT '[]',
    best_for TEXT NOT NULL DEFAULT '[]',
    supported_actions TEXT NOT NULL DEFAULT '[]',
    description TEXT,
    metadata TEXT,
    deprecated INTEGER NOT NULL DEFAULT 0,
    fetched_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Create indices for fast lookups
CREATE INDEX IF NOT EXISTS provider_model_provider_idx ON provider_models(provider);
CREATE INDEX IF NOT EXISTS provider_model_provider_model_idx ON provider_models(provider, model_id);
CREATE INDEX IF NOT EXISTS provider_model_fetched_at_idx ON provider_models(fetched_at);

-- Create unique constraint to prevent duplicate provider/model combinations
CREATE UNIQUE INDEX IF NOT EXISTS provider_model_unique_idx ON provider_models(provider, model_id);
