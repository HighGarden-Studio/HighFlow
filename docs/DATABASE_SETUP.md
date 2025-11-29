# Database Setup Guide

> Complete guide to setting up and using the database

---

## 📋 Quick Start

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Generate Initial Migration
```bash
pnpm db:generate
```

This will create SQL migration files in `electron/main/database/migrations/`.

### 3. Apply Migrations
```bash
pnpm db:push
```

This applies the schema to your SQLite database.

### 4. Seed Demo Data (Optional)
```bash
pnpm db:seed
```

This populates the database with sample data for development.

### 5. Open Database GUI (Optional)
```bash
pnpm db:studio
```

This opens Drizzle Studio at `https://local.drizzle.studio`.

---

## 📁 File Structure

```
electron/main/database/
├── schema.ts              # Drizzle schema definition (ALL tables)
├── relations.ts           # Table relationships for queries
├── client.ts              # Database client initialization
├── migrations/            # Generated SQL migration files
│   ├── 0000_initial.sql
│   └── meta/
└── repositories/          # Data access layer
    ├── project-repository.ts
    ├── task-repository.ts
    └── ...

src/core/types/
└── database.ts            # TypeScript type definitions

scripts/
├── migrate.ts             # Migration runner script
└── seed.ts                # Database seeding script
```

---

## 🗂️ Schema Overview

### 17 Core Tables

1. **users** - User accounts
2. **teams** - Team workspaces
3. **team_members** - Team membership (N:M)
4. **projects** - Top-level projects
5. **project_members** - Project membership (N:M)
6. **tasks** - Individual tasks
7. **task_watchers** - Task watchers (N:M)
8. **task_executions** - AI execution history
9. **task_suggested_skills** - Task-skill links (N:M)
10. **comments** - Task comments
11. **time_entries** - Time tracking
12. **templates** - Project templates
13. **template_tasks** - Template task definitions
14. **skills** - Reusable AI prompts
15. **skill_tags** - Skill tags (N:M)
16. **ai_provider_configs** - AI API configurations
17. **mcp_integrations** - MCP server integrations

### 7 System Tables

18. **activities** - Activity feed
19. **notifications** - User notifications
20. **automations** - Custom workflows
21. **webhooks** - Webhook configurations
22. **integrations** - External integrations
23. **search_indexes** - Search index

---

## 🔄 Migration Workflow

### Making Schema Changes

1. **Edit Schema**
   ```typescript
   // electron/main/database/schema.ts
   export const newTable = sqliteTable('new_table', {
     id: integer('id').primaryKey({ autoIncrement: true }),
     name: text('name').notNull(),
     // ...
   });
   ```

2. **Generate Migration**
   ```bash
   pnpm db:generate
   ```
   This creates a new migration file with timestamp.

3. **Review Migration**
   Check `electron/main/database/migrations/XXXX_name.sql`

4. **Apply Migration**
   ```bash
   pnpm db:push
   ```

5. **Update Types** (if needed)
   ```typescript
   // src/core/types/database.ts
   export interface NewTable {
     id: number;
     name: string;
   }
   ```

### Rolling Back

Drizzle doesn't have built-in rollback. To rollback:

1. **Delete the migration file**
2. **Manually revert the database** (or restore from backup)
3. **Regenerate from schema**

---

## 💾 Database Location

### Development
```
.dev-data/workflow-manager.db
```

### Production
- **macOS**: `~/Library/Application Support/workflow-manager/workflow-manager.db`
- **Windows**: `%APPDATA%/workflow-manager/workflow-manager.db`
- **Linux**: `~/.config/workflow-manager/workflow-manager.db`

---

## 🔍 Using Repositories

### Project Repository Example

```typescript
import { projectRepository } from '@electron/main/database/repositories/project-repository';

// Create project
const project = await projectRepository.create({
  title: 'My Project',
  description: 'Project description',
  ownerId: userId,
  status: 'active',
});

// Find with relations
const projectWithTasks = await projectRepository.findById(project.id, {
  includeTasks: true,
  includeMembers: true,
  includeOwner: true,
});

// Search projects
const results = await projectRepository.search('keyword', userId);

// Get statistics
const stats = await projectRepository.getStatistics(project.id);
console.log(stats.totalTasks, stats.completedTasks);

// Archive project
await projectRepository.archive(project.id);

// Add member
await projectRepository.addMember(project.id, memberId, 'member');
```

### Direct Drizzle Queries

```typescript
import { db, schema } from '@electron/main/database/client';
import { eq, desc, and } from 'drizzle-orm';

// Simple select
const users = await db.select().from(schema.users);

// With where clause
const user = await db
  .select()
  .from(schema.users)
  .where(eq(schema.users.email, 'user@example.com'))
  .limit(1);

// With relations (relational query)
const projectWithEverything = await db.query.projects.findFirst({
  where: eq(schema.projects.id, projectId),
  with: {
    owner: true,
    team: true,
    tasks: {
      where: (tasks, { isNull }) => isNull(tasks.deletedAt),
      with: {
        assignee: true,
        comments: {
          with: { user: true },
        },
      },
    },
    members: {
      with: { user: true },
    },
  },
});

// Complex query with SQL
const result = await db.execute(sql`
  SELECT
    p.id,
    p.title,
    COUNT(t.id) as task_count
  FROM projects p
  LEFT JOIN tasks t ON t.project_id = p.id
  WHERE p.owner_id = ${userId}
  GROUP BY p.id
`);
```

---

## 🔐 Security Best Practices

### 1. Encrypt Sensitive Data

```typescript
import { encrypt, decrypt } from '../utils/encryption';

// Before saving
const encryptedKey = encrypt(apiKey);
await db.insert(schema.aiProviderConfigs).values({
  apiKey: encryptedKey,
  // ...
});

// After reading
const config = await db.query.aiProviderConfigs.findFirst({
  where: eq(schema.aiProviderConfigs.id, id),
});
const apiKey = decrypt(config.apiKey);
```

### 2. Validate Input

```typescript
import { z } from 'zod';

const CreateProjectSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  ownerId: z.number().int().positive(),
});

// In IPC handler
const validated = CreateProjectSchema.parse(data);
await projectRepository.create(validated);
```

### 3. Use Transactions

```typescript
import { db } from '../client';

await db.transaction(async (tx) => {
  // Create project
  const [project] = await tx.insert(schema.projects).values(projectData).returning();

  // Create initial task
  await tx.insert(schema.tasks).values({
    projectId: project.id,
    title: 'Setup project',
    // ...
  });

  // Add activity
  await tx.insert(schema.activities).values({
    projectId: project.id,
    userId: project.ownerId,
    type: 'project_created',
  });
});
```

---

## 📊 Indexing Strategy

### Existing Indexes

All foreign keys are automatically indexed. Additional indexes:

- **users**: `email`, `googleId`
- **teams**: `slug`
- **projects**: `ownerId`, `teamId`, `status`, `isArchived`
- **tasks**: `projectId`, `status`, `assigneeId`, `dueDate`, `deletedAt`, `parentTaskId`
- **comments**: `taskId`, `userId`, `parentCommentId`, `deletedAt`
- **activities**: `projectId`, `taskId`, `userId`, `type`, `createdAt`
- **notifications**: `userId`, `isRead`, `createdAt`

### Adding Custom Indexes

```typescript
// In schema.ts
export const customTable = sqliteTable('custom_table', {
  // columns...
}, (table) => ({
  // Composite index
  customIdx: index('custom_idx').on(table.field1, table.field2),
  // Single field index
  fieldIdx: index('field_idx').on(table.field),
}));
```

---

## 🧪 Testing with Database

### Test Setup

```typescript
// tests/setup.ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

let testDb: ReturnType<typeof drizzle>;

export function setupTestDb() {
  const sqlite = new Database(':memory:');
  testDb = drizzle(sqlite);

  // Run migrations
  migrate(testDb, {
    migrationsFolder: './electron/main/database/migrations',
  });

  return testDb;
}

export function cleanupTestDb() {
  // Test DB is in memory, automatically cleaned up
}
```

### Test Example

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb } from './setup';

describe('Project Repository', () => {
  let db: ReturnType<typeof setupTestDb>;

  beforeEach(() => {
    db = setupTestDb();
  });

  it('should create project', async () => {
    const project = await projectRepository.create({
      title: 'Test Project',
      ownerId: 1,
    });

    expect(project.id).toBeDefined();
    expect(project.title).toBe('Test Project');
  });
});
```

---

## 🔧 Troubleshooting

### Issue: "Database is locked"

**Cause**: Multiple processes trying to write simultaneously.

**Solution**:
```typescript
// WAL mode is already enabled in client.ts
sqlite.pragma('journal_mode = WAL');
```

### Issue: "Foreign key constraint failed"

**Cause**: Trying to insert/update with invalid foreign key.

**Solution**:
```typescript
// Enable foreign key constraints (already enabled in client.ts)
sqlite.pragma('foreign_keys = ON');

// Check foreign key exists before inserting
const user = await db.select().from(schema.users).where(eq(schema.users.id, userId));
if (!user[0]) {
  throw new Error('User not found');
}
```

### Issue: "Migration already applied"

**Cause**: Drizzle Kit detects schema is already up-to-date.

**Solution**: No action needed if schema matches database.

### Issue: "Cannot find module '@core/types/database'"

**Cause**: Path alias not configured in tsconfig.json.

**Solution**: Already configured in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@core/*": ["src/core/*"]
    }
  }
}
```

---

## 📚 Further Reading

- **Drizzle ORM Docs**: https://orm.drizzle.team/
- **SQLite Docs**: https://www.sqlite.org/docs.html
- **Better SQLite3**: https://github.com/WiseLibs/better-sqlite3
- **DATABASE_SCHEMA.md**: Complete schema documentation
- **DEVELOPMENT_GUIDELINES.md**: Database patterns and best practices

---

## 🎯 Next Steps

1. **Generate migration**: `pnpm db:generate`
2. **Apply schema**: `pnpm db:push`
3. **Seed demo data**: `pnpm db:seed`
4. **Open GUI**: `pnpm db:studio`
5. **Start developing**: Create repositories for other entities following `project-repository.ts` pattern

---

**Last Updated**: 2025-11-24
