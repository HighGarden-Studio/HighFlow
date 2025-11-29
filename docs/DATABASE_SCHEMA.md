# Database Schema Documentation

> Complete database schema for AI Workflow Manager

---

## Overview

The database uses **SQLite** with **Drizzle ORM** for type-safe database operations. The schema is designed to support:

- Multi-user collaboration
- AI-powered task generation
- Real-time activity tracking
- Advanced automation and integrations
- Comprehensive search capabilities

---

## Entity Relationship Diagram

```
Users ──┬── Teams (N:M via TeamMembers)
        ├── Projects (1:N, owner)
        ├── ProjectMembers (N:M)
        ├── Tasks (1:N, assignee)
        ├── TaskWatchers (N:M)
        ├── Comments (1:N)
        ├── TimeEntries (1:N)
        ├── Templates (1:N, author)
        ├── Skills (1:N, author)
        ├── Notifications (1:N)
        ├── Activities (1:N)
        └── Integrations (1:N)

Teams ──┬── Projects (1:N)
        ├── Skills (1:N)
        └── AIProviderConfigs (1:N)

Projects ──┬── Tasks (1:N)
           ├── Activities (1:N)
           ├── Automations (1:N)
           └── Webhooks (1:N)

Tasks ──┬── SubTasks (1:N, self-referential)
        ├── Comments (1:N)
        ├── TimeEntries (1:N)
        ├── TaskExecutions (1:N)
        ├── SuggestedSkills (N:M via TaskSuggestedSkills)
        └── BlockedBy (1:1, self-referential)

Templates ── TemplateTasks (1:N)

Skills ── SkillTags (1:N)
```

---

## Tables

### Core Entities

#### **users**
User accounts and authentication.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| email | TEXT | NOT NULL, UNIQUE | User email (unique identifier) |
| name | TEXT | NOT NULL | Display name |
| googleId | TEXT | UNIQUE | Google OAuth ID |
| avatar | TEXT | | Avatar URL |
| role | TEXT | NOT NULL, DEFAULT 'member' | admin\|member\|viewer |
| preferences | JSON | NOT NULL, DEFAULT '{}' | User preferences object |
| timezone | TEXT | NOT NULL, DEFAULT 'UTC' | User timezone |
| locale | TEXT | NOT NULL, DEFAULT 'en' | Language preference |
| onboardingCompleted | BOOLEAN | NOT NULL, DEFAULT false | Onboarding status |
| lastActiveAt | TIMESTAMP | | Last activity timestamp |
| createdAt | TIMESTAMP | NOT NULL | Creation timestamp |
| updatedAt | TIMESTAMP | NOT NULL | Last update timestamp |

**Indexes**: `email`, `googleId`

---

#### **teams**
Team workspaces for collaboration.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| name | TEXT | NOT NULL | Team name |
| slug | TEXT | NOT NULL, UNIQUE | URL-friendly identifier |
| description | TEXT | | Team description |
| plan | TEXT | NOT NULL, DEFAULT 'free' | free\|pro\|enterprise |
| billingInfo | JSON | NOT NULL, DEFAULT '{}' | Billing information |
| settings | JSON | NOT NULL, DEFAULT '{}' | Team settings |
| createdAt | TIMESTAMP | NOT NULL | Creation timestamp |
| updatedAt | TIMESTAMP | NOT NULL | Last update timestamp |

**Indexes**: `slug`

---

#### **projects**
Top-level project containers (Epic level).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| title | TEXT | NOT NULL | Project title |
| description | TEXT | | Project description |
| mainPrompt | TEXT | | AI generation prompt |
| status | TEXT | NOT NULL, DEFAULT 'active' | active\|completed\|archived\|on_hold |
| aiProvider | TEXT | | openai\|anthropic\|google\|local |
| templateId | INTEGER | FOREIGN KEY → templates(id) | Template used (if any) |
| coverImage | TEXT | | Cover image URL |
| color | TEXT | | Theme color (hex) |
| emoji | TEXT | | Project emoji |
| isArchived | BOOLEAN | NOT NULL, DEFAULT false | Archive status |
| isFavorite | BOOLEAN | NOT NULL, DEFAULT false | Favorite status |
| estimatedHours | REAL | | Estimated time (hours) |
| actualHours | REAL | | Actual time spent (hours) |
| totalCost | REAL | NOT NULL, DEFAULT 0 | Total AI costs |
| archivedAt | TIMESTAMP | | Archive timestamp |
| ownerId | INTEGER | NOT NULL, FOREIGN KEY → users(id) | Project owner |
| teamId | INTEGER | FOREIGN KEY → teams(id) | Team (if team project) |
| gitRepository | TEXT | | Git repository URL |
| createdAt | TIMESTAMP | NOT NULL | Creation timestamp |
| updatedAt | TIMESTAMP | NOT NULL | Last update timestamp |

**Indexes**: `ownerId`, `teamId`, `status`, `isArchived`

---

#### **tasks**
Individual tasks (Story level).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| projectId | INTEGER | NOT NULL, FOREIGN KEY → projects(id) CASCADE | Parent project |
| title | TEXT | NOT NULL | Task title |
| description | TEXT | | Task description |
| generatedPrompt | TEXT | | AI generation prompt |
| status | TEXT | NOT NULL, DEFAULT 'todo' | todo\|in_progress\|in_review\|done\|blocked |
| priority | TEXT | NOT NULL, DEFAULT 'medium' | low\|medium\|high\|urgent |
| executionType | TEXT | NOT NULL, DEFAULT 'serial' | serial\|parallel |
| aiProvider | TEXT | | Preferred AI provider |
| mcpConfig | JSON | | MCP configuration |
| order | INTEGER | NOT NULL, DEFAULT 0 | Display order |
| parentTaskId | INTEGER | FOREIGN KEY → tasks(id) | Parent task (for subtasks) |
| assigneeId | INTEGER | FOREIGN KEY → users(id) SET NULL | Assigned user |
| watcherIds | JSON | NOT NULL, DEFAULT '[]' | Array of user IDs watching |
| estimatedMinutes | INTEGER | | Estimated time (minutes) |
| actualMinutes | INTEGER | | Actual time spent (minutes) |
| tokenUsage | JSON | | AI token usage stats |
| estimatedCost | REAL | | Estimated AI cost |
| actualCost | REAL | | Actual AI cost |
| dueDate | TIMESTAMP | | Due date |
| startedAt | TIMESTAMP | | Start timestamp |
| completedAt | TIMESTAMP | | Completion timestamp |
| blockedReason | TEXT | | Reason for being blocked |
| blockedByTaskId | INTEGER | FOREIGN KEY → tasks(id) | Blocking task |
| tags | JSON | NOT NULL, DEFAULT '[]' | Array of tag strings |
| gitCommits | JSON | NOT NULL, DEFAULT '[]' | Array of GitCommit objects |
| deletedAt | TIMESTAMP | | Soft delete timestamp |
| createdAt | TIMESTAMP | NOT NULL | Creation timestamp |
| updatedAt | TIMESTAMP | NOT NULL | Last update timestamp |

**Indexes**: `projectId`, `status`, `assigneeId`, `dueDate`, `deletedAt`, `parentTaskId`

---

### AI & Execution

#### **task_executions**
History of AI task executions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| taskId | INTEGER | NOT NULL, FOREIGN KEY → tasks(id) CASCADE | Associated task |
| executionNumber | INTEGER | NOT NULL, DEFAULT 1 | Retry counter |
| prompt | TEXT | NOT NULL | AI prompt used |
| response | TEXT | | AI response |
| context | TEXT | | Additional context |
| aiProvider | TEXT | NOT NULL | AI provider used |
| model | TEXT | NOT NULL | Model name |
| temperature | REAL | | Temperature setting |
| maxTokens | INTEGER | | Max tokens limit |
| tokensUsed | JSON | | Token usage breakdown |
| duration | INTEGER | | Execution time (ms) |
| cost | REAL | | Execution cost |
| status | TEXT | NOT NULL, DEFAULT 'running' | running\|success\|failed\|cancelled |
| errorMessage | TEXT | | Error message (if failed) |
| retryCount | INTEGER | NOT NULL, DEFAULT 0 | Retry attempts |
| userFeedback | TEXT | | User feedback on result |
| rating | INTEGER | | User rating (1-5) |
| completedAt | TIMESTAMP | | Completion timestamp |
| createdAt | TIMESTAMP | NOT NULL | Creation timestamp |
| updatedAt | TIMESTAMP | NOT NULL | Last update timestamp |

**Indexes**: `taskId`, `status`

---

#### **skills**
Reusable AI prompts and workflows.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| name | TEXT | NOT NULL | Skill name |
| description | TEXT | NOT NULL | Skill description |
| prompt | TEXT | NOT NULL | AI prompt template |
| category | TEXT | NOT NULL | Category (e.g., "development") |
| aiProvider | TEXT | | Recommended AI provider |
| mcpRequirements | JSON | NOT NULL, DEFAULT '[]' | Required MCP servers |
| inputSchema | JSON | | JSON Schema for inputs |
| outputSchema | JSON | | JSON Schema for outputs |
| isPublic | BOOLEAN | NOT NULL, DEFAULT false | Public visibility |
| isOfficial | BOOLEAN | NOT NULL, DEFAULT false | Official skill |
| authorId | INTEGER | NOT NULL, FOREIGN KEY → users(id) CASCADE | Skill author |
| teamId | INTEGER | FOREIGN KEY → teams(id) CASCADE | Team (if team skill) |
| forkCount | INTEGER | NOT NULL, DEFAULT 0 | Number of forks |
| usageCount | INTEGER | NOT NULL, DEFAULT 0 | Usage counter |
| rating | REAL | | Average rating |
| reviews | JSON | NOT NULL, DEFAULT '[]' | Array of SkillReview objects |
| version | INTEGER | NOT NULL, DEFAULT 1 | Version number |
| changelog | TEXT | | Version changelog |
| createdAt | TIMESTAMP | NOT NULL | Creation timestamp |
| updatedAt | TIMESTAMP | NOT NULL | Last update timestamp |

**Indexes**: `authorId`, `teamId`, `category`, `isPublic`

---

### Collaboration

#### **comments**
Task comments and discussions.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| taskId | INTEGER | NOT NULL, FOREIGN KEY → tasks(id) CASCADE | Associated task |
| userId | INTEGER | NOT NULL, FOREIGN KEY → users(id) CASCADE | Comment author |
| content | TEXT | NOT NULL | Comment content |
| contentType | TEXT | NOT NULL, DEFAULT 'markdown' | text\|markdown |
| mentions | JSON | NOT NULL, DEFAULT '[]' | Mentioned user IDs |
| parentCommentId | INTEGER | FOREIGN KEY → comments(id) | Parent comment (for replies) |
| reactions | JSON | NOT NULL, DEFAULT '{}' | Emoji reactions {emoji: [userIds]} |
| editedAt | TIMESTAMP | | Edit timestamp |
| deletedAt | TIMESTAMP | | Soft delete timestamp |
| createdAt | TIMESTAMP | NOT NULL | Creation timestamp |
| updatedAt | TIMESTAMP | NOT NULL | Last update timestamp |

**Indexes**: `taskId`, `userId`, `parentCommentId`, `deletedAt`

---

#### **time_entries**
Time tracking entries.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| taskId | INTEGER | NOT NULL, FOREIGN KEY → tasks(id) CASCADE | Associated task |
| userId | INTEGER | NOT NULL, FOREIGN KEY → users(id) CASCADE | User who tracked time |
| startTime | TIMESTAMP | NOT NULL | Start time |
| endTime | TIMESTAMP | | End time |
| duration | INTEGER | NOT NULL | Duration (seconds) |
| description | TEXT | | Entry description |
| isManual | BOOLEAN | NOT NULL, DEFAULT false | Manual entry |
| isBillable | BOOLEAN | NOT NULL, DEFAULT false | Billable time |
| hourlyRate | REAL | | Hourly rate (if billable) |
| createdAt | TIMESTAMP | NOT NULL | Creation timestamp |
| updatedAt | TIMESTAMP | NOT NULL | Last update timestamp |

**Indexes**: `taskId`, `userId`

---

### Templates & Marketplace

#### **templates**
Project templates for quick starts.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| name | TEXT | NOT NULL | Template name |
| description | TEXT | NOT NULL | Template description |
| category | TEXT | NOT NULL | Category |
| coverImage | TEXT | | Cover image URL |
| tags | JSON | NOT NULL, DEFAULT '[]' | Array of tag strings |
| projectStructure | JSON | NOT NULL | ProjectStructure object |
| aiProviderRecommendations | JSON | | AI settings per provider |
| isPublic | BOOLEAN | NOT NULL, DEFAULT false | Public visibility |
| isOfficial | BOOLEAN | NOT NULL, DEFAULT false | Official template |
| authorId | INTEGER | NOT NULL, FOREIGN KEY → users(id) CASCADE | Template author |
| usageCount | INTEGER | NOT NULL, DEFAULT 0 | Usage counter |
| rating | REAL | | Average rating |
| createdAt | TIMESTAMP | NOT NULL | Creation timestamp |
| updatedAt | TIMESTAMP | NOT NULL | Last update timestamp |

**Indexes**: `authorId`, `category`, `isPublic`

---

### System & Infrastructure

#### **notifications**
User notifications.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| userId | INTEGER | NOT NULL, FOREIGN KEY → users(id) CASCADE | Recipient user |
| type | TEXT | NOT NULL | Notification type |
| title | TEXT | NOT NULL | Notification title |
| content | TEXT | NOT NULL | Notification content |
| relatedProjectId | INTEGER | FOREIGN KEY → projects(id) CASCADE | Related project |
| relatedTaskId | INTEGER | FOREIGN KEY → tasks(id) CASCADE | Related task |
| isRead | BOOLEAN | NOT NULL, DEFAULT false | Read status |
| readAt | TIMESTAMP | | Read timestamp |
| actionUrl | TEXT | | Action link URL |
| createdAt | TIMESTAMP | NOT NULL | Creation timestamp |
| updatedAt | TIMESTAMP | NOT NULL | Last update timestamp |

**Indexes**: `userId`, `isRead`, `createdAt`

---

#### **activities**
Activity feed/audit log.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| projectId | INTEGER | FOREIGN KEY → projects(id) CASCADE | Related project |
| taskId | INTEGER | FOREIGN KEY → tasks(id) CASCADE | Related task |
| userId | INTEGER | NOT NULL, FOREIGN KEY → users(id) CASCADE | User who performed action |
| type | TEXT | NOT NULL | Activity type |
| changes | JSON | | Before/after changes |
| metadata | JSON | | Additional metadata |
| createdAt | TIMESTAMP | NOT NULL | Creation timestamp |
| updatedAt | TIMESTAMP | NOT NULL | Last update timestamp |

**Indexes**: `projectId`, `taskId`, `userId`, `type`, `createdAt`

---

#### **automations**
Custom workflow automations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| projectId | INTEGER | FOREIGN KEY → projects(id) CASCADE | Associated project (null for global) |
| name | TEXT | NOT NULL | Automation name |
| description | TEXT | | Automation description |
| trigger | JSON | NOT NULL | AutomationTrigger object |
| actions | JSON | NOT NULL | Array of AutomationAction objects |
| isEnabled | BOOLEAN | NOT NULL, DEFAULT true | Enabled status |
| lastRunAt | TIMESTAMP | | Last execution timestamp |
| runCount | INTEGER | NOT NULL, DEFAULT 0 | Execution counter |
| createdBy | INTEGER | NOT NULL, FOREIGN KEY → users(id) CASCADE | Creator user |
| createdAt | TIMESTAMP | NOT NULL | Creation timestamp |
| updatedAt | TIMESTAMP | NOT NULL | Last update timestamp |

**Indexes**: `projectId`, `createdBy`

---

#### **webhooks**
Webhook configurations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| projectId | INTEGER | FOREIGN KEY → projects(id) CASCADE | Associated project (null for global) |
| name | TEXT | NOT NULL | Webhook name |
| url | TEXT | NOT NULL | Webhook URL |
| events | JSON | NOT NULL | Array of event types |
| secret | TEXT | | Webhook secret |
| headers | JSON | | Custom headers |
| isEnabled | BOOLEAN | NOT NULL, DEFAULT true | Enabled status |
| lastTriggeredAt | TIMESTAMP | | Last trigger timestamp |
| failureCount | INTEGER | NOT NULL, DEFAULT 0 | Failure counter |
| createdAt | TIMESTAMP | NOT NULL | Creation timestamp |
| updatedAt | TIMESTAMP | NOT NULL | Last update timestamp |

**Indexes**: `projectId`

---

#### **integrations**
External service integrations.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| userId | INTEGER | FOREIGN KEY → users(id) CASCADE | User-level integration |
| teamId | INTEGER | FOREIGN KEY → teams(id) CASCADE | Team-level integration |
| type | TEXT | NOT NULL | Integration type |
| credentials | JSON | NOT NULL | Encrypted credentials |
| settings | JSON | NOT NULL, DEFAULT '{}' | Integration settings |
| isEnabled | BOOLEAN | NOT NULL, DEFAULT true | Enabled status |
| lastSyncAt | TIMESTAMP | | Last sync timestamp |
| createdAt | TIMESTAMP | NOT NULL | Creation timestamp |
| updatedAt | TIMESTAMP | NOT NULL | Last update timestamp |

**Indexes**: `userId`, `teamId`, `type`

---

#### **search_indexes**
Global search index.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY | Auto-increment ID |
| entityType | TEXT | NOT NULL | Entity type (project\|task\|etc) |
| entityId | INTEGER | NOT NULL | Entity ID |
| content | TEXT | NOT NULL | Searchable content |
| metadata | JSON | | Search metadata |
| createdAt | TIMESTAMP | NOT NULL | Creation timestamp |
| updatedAt | TIMESTAMP | NOT NULL | Last update timestamp |

**Indexes**: `(entityType, entityId)`

---

## JSON Field Schemas

### UserPreferences
```typescript
{
  defaultAI?: 'openai' | 'anthropic' | 'google' | 'local',
  theme?: 'light' | 'dark' | 'system',
  notifications?: {
    email?: boolean,
    desktop?: boolean,
    mentions?: boolean,
    assignments?: boolean
  },
  editor?: {
    autoSave?: boolean,
    fontSize?: number,
    keyBindings?: 'default' | 'vim' | 'emacs'
  }
}
```

### TokenUsage
```typescript
{
  promptTokens: number,
  completionTokens: number,
  totalTokens: number
}
```

### GitCommit
```typescript
{
  sha: string,
  message: string,
  author: string,
  timestamp: string,
  url?: string
}
```

### ProjectStructure
```typescript
{
  tasks: Array<{
    title: string,
    description?: string,
    priority?: 'low' | 'medium' | 'high' | 'urgent',
    estimatedMinutes?: number,
    skills?: string[]
  }>,
  skills?: string[],
  automations?: Array<{
    name: string,
    trigger: AutomationTrigger,
    actions: AutomationAction[]
  }>
}
```

---

## Relationships

### Many-to-Many
- **Users ↔ Teams** via `team_members`
- **Users ↔ Projects** via `project_members`
- **Users ↔ Tasks (watchers)** via `task_watchers`
- **Tasks ↔ Skills** via `task_suggested_skills`

### One-to-Many
- **Users → Projects** (owner)
- **Teams → Projects**
- **Projects → Tasks**
- **Tasks → SubTasks** (self-referential)
- **Tasks → Comments**
- **Users → Comments**
- **Tasks → TimeEntries**
- **Tasks → TaskExecutions**

### One-to-One
- **Tasks → Tasks** (blockedByTaskId, self-referential)

---

## Cascade Policies

| Parent | Child | On Delete |
|--------|-------|-----------|
| users | projects (owner) | CASCADE |
| users | comments | CASCADE |
| users | activities | CASCADE |
| teams | projects | CASCADE |
| projects | tasks | CASCADE |
| tasks | comments | CASCADE |
| tasks | time_entries | CASCADE |
| tasks | task_executions | CASCADE |

---

## Migration Commands

```bash
# Generate migration from schema changes
pnpm db:generate

# Apply migrations to database
pnpm db:push

# Run custom migration script
pnpm db:migrate

# Seed database with demo data
pnpm db:seed

# Open Drizzle Studio (database GUI)
pnpm db:studio
```

---

## Performance Considerations

### Indexes
All foreign keys are indexed. Additional indexes on:
- Frequently filtered columns (status, isArchived, isRead)
- Timestamp columns for sorting (createdAt, dueDate)
- Unique constraints (email, slug)

### Query Optimization
- Use `with` clause for eager loading relations
- Paginate large result sets
- Consider virtual scrolling for 1000+ items in UI
- Use search_indexes table for full-text search

### SQLite WAL Mode
- Enabled for better concurrency
- Allows simultaneous reads during writes
- Better performance than default journal mode

---

## Security

### Encrypted Fields
- `api_key` in `ai_provider_configs`
- `credentials` in `integrations`
- `secret` in `webhooks`

**Encryption should be handled at application level before storage.**

### Soft Deletes
Tasks and comments support soft deletion via `deletedAt` timestamp. This allows:
- Data recovery
- Audit trails
- Maintaining referential integrity

---

## Example Queries

### Get project with tasks and members
```typescript
const project = await db.query.projects.findFirst({
  where: eq(projects.id, projectId),
  with: {
    tasks: {
      where: isNull(tasks.deletedAt),
      orderBy: asc(tasks.order),
    },
    members: {
      with: {
        user: true,
      },
    },
    owner: true,
  },
});
```

### Get user's notifications (unread first)
```typescript
const notifications = await db.query.notifications.findMany({
  where: eq(notifications.userId, userId),
  orderBy: [asc(notifications.isRead), desc(notifications.createdAt)],
  limit: 50,
});
```

### Get task with full context
```typescript
const task = await db.query.tasks.findFirst({
  where: eq(tasks.id, taskId),
  with: {
    project: true,
    assignee: true,
    comments: {
      where: isNull(comments.deletedAt),
      with: { user: true },
      orderBy: asc(comments.createdAt),
    },
    timeEntries: {
      with: { user: true },
    },
    executions: {
      orderBy: desc(taskExecutions.createdAt),
      limit: 10,
    },
  },
});
```

---

**Schema Version**: 1.0.0
**Last Updated**: 2025-11-24
