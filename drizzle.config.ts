import type { Config } from 'drizzle-kit';
import path from 'node:path';

// Use development data directory for drizzle-kit commands
const dbPath = path.join(process.cwd(), '.dev-data', 'workflow-manager.db');

export default {
  schema: './electron/main/database/schema.ts',
  out: './electron/main/database/migrations',
  driver: 'better-sqlite',
  dbCredentials: {
    url: dbPath,
  },
  verbose: true,
  strict: true,
} satisfies Config;
