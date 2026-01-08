-- Add OAuth 2.0 fields to mcp_integrations table for Atlassian Cloud and other OAuth-based MCPs
ALTER TABLE mcp_integrations ADD COLUMN oauth_client_id TEXT;--> statement-breakpoint
ALTER TABLE mcp_integrations ADD COLUMN oauth_client_secret TEXT;--> statement-breakpoint
ALTER TABLE mcp_integrations ADD COLUMN oauth_redirect_uri TEXT;--> statement-breakpoint
ALTER TABLE mcp_integrations ADD COLUMN oauth_scope TEXT;--> statement-breakpoint
ALTER TABLE mcp_integrations ADD COLUMN oauth_cloud_id TEXT;--> statement-breakpoint
ALTER TABLE mcp_integrations ADD COLUMN oauth_access_token TEXT;
