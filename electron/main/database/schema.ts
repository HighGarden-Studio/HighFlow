/**
 * Drizzle ORM Database Schema
 *
 * Complete database schema for AI Workflow Manager
 * Using SQLite with better-sqlite3 driver
 */

import { sqliteTable, integer, text, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ========================================
// Users & Teams
// ========================================

export const users = sqliteTable(
    'users',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        email: text('email').notNull().unique(),
        name: text('name').notNull(),
        googleId: text('google_id').unique(),
        avatar: text('avatar'),
        role: text('role').notNull().default('member'), // admin|member|viewer
        preferences: text('preferences', { mode: 'json' }).notNull().default('{}'),
        timezone: text('timezone').notNull().default('UTC'),
        locale: text('locale').notNull().default('en'),
        onboardingCompleted: integer('onboarding_completed', { mode: 'boolean' })
            .notNull()
            .default(false),
        lastActiveAt: integer('last_active_at', { mode: 'timestamp' }),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        emailIdx: index('user_email_idx').on(table.email),
        googleIdIdx: index('user_google_id_idx').on(table.googleId),
    })
);

export const teams = sqliteTable(
    'teams',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        name: text('name').notNull(),
        slug: text('slug').notNull().unique(),
        description: text('description'),
        plan: text('plan').notNull().default('free'), // free|pro|enterprise
        billingInfo: text('billing_info', { mode: 'json' }).notNull().default('{}'),
        settings: text('settings', { mode: 'json' }).notNull().default('{}'),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        slugIdx: index('team_slug_idx').on(table.slug),
    })
);

export const teamMembers = sqliteTable(
    'team_members',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        teamId: integer('team_id')
            .notNull()
            .references(() => teams.id, { onDelete: 'cascade' }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        role: text('role').notNull().default('member'),
        permissions: text('permissions', { mode: 'json' }).notNull().default('{}'),
        joinedAt: integer('joined_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        teamUserIdx: index('team_member_team_user_idx').on(table.teamId, table.userId),
    })
);

// ========================================
// Projects
// ========================================

export const projects = sqliteTable(
    'projects',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        title: text('title').notNull(),
        description: text('description'),
        mainPrompt: text('main_prompt'),
        status: text('status').notNull().default('active'), // active|completed|archived|on_hold
        aiProvider: text('ai_provider'), // openai|anthropic|google|local
        aiModel: text('ai_model'), // claude-3-5-sonnet, gpt-4-turbo, etc.
        outputType: text('output_type'), // web|document|image|video|code|data|other
        outputPath: text('output_path'), // Path to output directory
        templateId: integer('template_id').references(() => templates.id),
        coverImage: text('cover_image'),
        color: text('color'),
        emoji: text('emoji'),
        isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
        isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
        estimatedHours: real('estimated_hours'),
        actualHours: real('actual_hours'),
        totalCost: real('total_cost').notNull().default(0),
        totalTokens: integer('total_tokens').notNull().default(0),
        archivedAt: integer('archived_at', { mode: 'timestamp' }),
        ownerId: integer('owner_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        teamId: integer('team_id').references(() => teams.id, { onDelete: 'cascade' }),
        gitRepository: text('git_repository'),
        aiGuidelines: text('ai_guidelines'), // AI 지침 문서 (마크다운 형식)
        projectGuidelines: text('project_guidelines'), // 인터뷰 기반 프로젝트 지침
        baseDevFolder: text('base_dev_folder'), // 로컬 개발 베이스 폴더
        technicalStack: text('technical_stack', { mode: 'json' }), // 기술 스택 배열
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        ownerIdx: index('project_owner_idx').on(table.ownerId),
        teamIdx: index('project_team_idx').on(table.teamId),
        statusIdx: index('project_status_idx').on(table.status),
        archivedIdx: index('project_archived_idx').on(table.isArchived),
    })
);

export const projectMembers = sqliteTable(
    'project_members',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        projectId: integer('project_id')
            .notNull()
            .references(() => projects.id, { onDelete: 'cascade' }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        role: text('role').notNull().default('member'),
        joinedAt: integer('joined_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        projectUserIdx: index('project_member_project_user_idx').on(table.projectId, table.userId),
    })
);

// ========================================
// Tasks
// ========================================

export const tasks: ReturnType<typeof sqliteTable> = sqliteTable(
    'tasks',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        projectId: integer('project_id')
            .notNull()
            .references(() => projects.id, { onDelete: 'cascade' }),
        title: text('title').notNull(),
        description: text('description'),
        generatedPrompt: text('generated_prompt'),
        status: text('status').notNull().default('todo'), // todo|in_progress|needs_approval|in_review|done|blocked
        priority: text('priority').notNull().default('medium'), // low|medium|high|urgent
        executionType: text('execution_type').notNull().default('serial'), // serial|parallel
        aiProvider: text('ai_provider'), // openai|anthropic|google|local
        aiModel: text('ai_model'), // claude-3-5-sonnet, gpt-4-turbo, etc.
        reviewAiProvider: text('review_ai_provider'),
        reviewAiModel: text('review_ai_model'),
        mcpConfig: text('mcp_config', { mode: 'json' }),
        order: integer('order').notNull().default(0),
        parentTaskId: integer('parent_task_id').references((): any => tasks.id),
        assigneeId: integer('assignee_id').references(() => users.id, { onDelete: 'set null' }),
        watcherIds: text('watcher_ids', { mode: 'json' }).notNull().default('[]'), // Array of user IDs
        estimatedMinutes: integer('estimated_minutes'),
        actualMinutes: integer('actual_minutes'),
        tokenUsage: text('token_usage', { mode: 'json' }),
        estimatedCost: real('estimated_cost'),
        actualCost: real('actual_cost'),
        dueDate: integer('due_date', { mode: 'timestamp' }),
        startedAt: integer('started_at', { mode: 'timestamp' }),
        completedAt: integer('completed_at', { mode: 'timestamp' }),
        blockedReason: text('blocked_reason'),
        blockedByTaskId: integer('blocked_by_task_id').references((): any => tasks.id),
        tags: text('tags', { mode: 'json' }).notNull().default('[]'), // Array of strings
        gitCommits: text('git_commits', { mode: 'json' }).notNull().default('[]'), // Array of GitCommit
        deletedAt: integer('deleted_at', { mode: 'timestamp' }),
        // 새로운 필드들
        isPaused: integer('is_paused', { mode: 'boolean' }).notNull().default(false), // IN_PROGRESS 일시정지
        autoReview: integer('auto_review', { mode: 'boolean' }).notNull().default(false), // 자동 REVIEW 수행
        autoReviewed: integer('auto_reviewed', { mode: 'boolean' }).notNull().default(false), // AI 자동 검토 완료
        reviewFailed: integer('review_failed', { mode: 'boolean' }).notNull().default(false), // 리뷰 실패 여부 (점수 7점 이하)
        triggerConfig: text('trigger_config', { mode: 'json' }), // 트리거 설정 (의존성, 시간)
        pausedAt: integer('paused_at', { mode: 'timestamp' }), // 일시정지 시간
        isSubdivided: integer('is_subdivided', { mode: 'boolean' }).notNull().default(false), // 서브태스크로 세분화 여부
        subtaskCount: integer('subtask_count').notNull().default(0), // 직접 자식 태스크 수
        executionResult: text('execution_result', { mode: 'json' }), // AI 실행 결과 (content, cost, tokens, duration, provider, model)
        imageConfig: text('image_config', { mode: 'json' }),
        outputFormat: text('output_format').default('markdown'), // 결과물 형식: text|markdown|html|pdf|json|yaml|csv|sql|shell|mermaid|svg|png|mp4|mp3|diff|log|code
        codeLanguage: text('code_language'), // outputFormat이 'code'일 때 사용할 언어 (typescript, python, java 등)
        // AI 실행 최적화 필드 (인터뷰 기반 자동 생성)
        executionOrder: integer('execution_order'), // 작업 순서 (1부터 시작)
        dependencies: text('dependencies', { mode: 'json' }).notNull().default('[]'), // 의존하는 태스크 ID 배열
        expectedOutputFormat: text('expected_output_format'), // 예상 결과 형식 (markdown, code, json, text 등)
        recommendedProviders: text('recommended_providers', { mode: 'json' })
            .notNull()
            .default('[]'), // 추천 AI Provider 목록
        requiredMCPs: text('required_mcps', { mode: 'json' }).notNull().default('[]'), // 필요한 MCP 서버 목록
        aiOptimizedPrompt: text('ai_optimized_prompt'), // AI 실행용 최적화된 프롬프트
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        projectIdx: index('task_project_idx').on(table.projectId),
        statusIdx: index('task_status_idx').on(table.status),
        assigneeIdx: index('task_assignee_idx').on(table.assigneeId),
        dueDateIdx: index('task_due_date_idx').on(table.dueDate),
        deletedIdx: index('task_deleted_idx').on(table.deletedAt),
        parentIdx: index('task_parent_idx').on(table.parentTaskId),
    })
);

export const taskWatchers = sqliteTable(
    'task_watchers',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        taskId: integer('task_id')
            .notNull()
            .references(() => tasks.id, { onDelete: 'cascade' }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        notifyOnUpdate: integer('notify_on_update', { mode: 'boolean' }).notNull().default(true),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        taskUserIdx: index('task_watcher_task_user_idx').on(table.taskId, table.userId),
    })
);

export const taskExecutions = sqliteTable(
    'task_executions',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        taskId: integer('task_id')
            .notNull()
            .references(() => tasks.id, { onDelete: 'cascade' }),
        executionNumber: integer('execution_number').notNull().default(1),
        prompt: text('prompt').notNull(),
        response: text('response'),
        context: text('context'),
        aiProvider: text('ai_provider').notNull(),
        model: text('model').notNull(),
        temperature: real('temperature'),
        maxTokens: integer('max_tokens'),
        tokensUsed: text('tokens_used', { mode: 'json' }),
        duration: integer('duration'), // milliseconds
        cost: real('cost'),
        status: text('status').notNull().default('running'), // running|success|failed|cancelled
        errorMessage: text('error_message'),
        retryCount: integer('retry_count').notNull().default(0),
        userFeedback: text('user_feedback'),
        rating: integer('rating'), // 1-5
        completedAt: integer('completed_at', { mode: 'timestamp' }),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        taskIdx: index('task_execution_task_idx').on(table.taskId),
        statusIdx: index('task_execution_status_idx').on(table.status),
    })
);

export const taskSuggestedSkills = sqliteTable(
    'task_suggested_skills',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        taskId: integer('task_id')
            .notNull()
            .references(() => tasks.id, { onDelete: 'cascade' }),
        skillId: integer('skill_id')
            .notNull()
            .references(() => skills.id, { onDelete: 'cascade' }),
        relevanceScore: real('relevance_score'),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        taskSkillIdx: index('task_suggested_skill_task_skill_idx').on(table.taskId, table.skillId),
    })
);

// ========================================
// Task History
// ========================================

export const taskHistory = sqliteTable(
    'task_history',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        taskId: integer('task_id')
            .notNull()
            .references(() => tasks.id, { onDelete: 'cascade' }),
        eventType: text('event_type').notNull(), // execution_started|execution_completed|execution_failed|ai_review_requested|ai_review_completed|prompt_refined|status_changed|paused|resumed|stopped
        eventData: text('event_data', { mode: 'json' }), // Event-specific data (prompt, result, etc.)
        metadata: text('metadata', { mode: 'json' }), // Additional context (provider, model, cost, tokens, duration)
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        taskIdx: index('task_history_task_idx').on(table.taskId),
        eventTypeIdx: index('task_history_event_type_idx').on(table.eventType),
        createdAtIdx: index('task_history_created_at_idx').on(table.createdAt),
    })
);

// ========================================
// Comments & Time Tracking
// ========================================

export const comments: ReturnType<typeof sqliteTable> = sqliteTable(
    'comments',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        taskId: integer('task_id')
            .notNull()
            .references(() => tasks.id, { onDelete: 'cascade' }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        content: text('content').notNull(),
        contentType: text('content_type').notNull().default('markdown'), // text|markdown
        mentions: text('mentions', { mode: 'json' }).notNull().default('[]'), // Array of user IDs
        parentCommentId: integer('parent_comment_id').references((): any => comments.id),
        reactions: text('reactions', { mode: 'json' }).notNull().default('{}'), // {emoji: [userIds]}
        editedAt: integer('edited_at', { mode: 'timestamp' }),
        deletedAt: integer('deleted_at', { mode: 'timestamp' }),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        taskIdx: index('comment_task_idx').on(table.taskId),
        userIdx: index('comment_user_idx').on(table.userId),
        parentIdx: index('comment_parent_idx').on(table.parentCommentId),
        deletedIdx: index('comment_deleted_idx').on(table.deletedAt),
    })
);

export const timeEntries = sqliteTable(
    'time_entries',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        taskId: integer('task_id')
            .notNull()
            .references(() => tasks.id, { onDelete: 'cascade' }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        startTime: integer('start_time', { mode: 'timestamp' }).notNull(),
        endTime: integer('end_time', { mode: 'timestamp' }),
        duration: integer('duration').notNull(), // seconds
        description: text('description'),
        isManual: integer('is_manual', { mode: 'boolean' }).notNull().default(false),
        isBillable: integer('is_billable', { mode: 'boolean' }).notNull().default(false),
        hourlyRate: real('hourly_rate'),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        taskIdx: index('time_entry_task_idx').on(table.taskId),
        userIdx: index('time_entry_user_idx').on(table.userId),
    })
);

// ========================================
// Templates & Skills
// ========================================

export const templates = sqliteTable(
    'templates',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        name: text('name').notNull(),
        description: text('description').notNull(),
        category: text('category').notNull(),
        coverImage: text('cover_image'),
        tags: text('tags', { mode: 'json' }).notNull().default('[]'),
        projectStructure: text('project_structure', { mode: 'json' }).notNull(),
        aiProviderRecommendations: text('ai_provider_recommendations', { mode: 'json' }),
        isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
        isOfficial: integer('is_official', { mode: 'boolean' }).notNull().default(false),
        authorId: integer('author_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        usageCount: integer('usage_count').notNull().default(0),
        rating: real('rating'),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        authorIdx: index('template_author_idx').on(table.authorId),
        categoryIdx: index('template_category_idx').on(table.category),
        publicIdx: index('template_public_idx').on(table.isPublic),
    })
);

export const templateTasks = sqliteTable(
    'template_tasks',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        templateId: integer('template_id')
            .notNull()
            .references(() => templates.id, { onDelete: 'cascade' }),
        title: text('title').notNull(),
        description: text('description'),
        priority: text('priority').notNull().default('medium'),
        estimatedMinutes: integer('estimated_minutes'),
        order: integer('order').notNull().default(0),
        parentTaskOrder: integer('parent_task_order'),
        suggestedSkills: text('suggested_skills', { mode: 'json' }).notNull().default('[]'),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        templateIdx: index('template_task_template_idx').on(table.templateId),
    })
);

export const skills = sqliteTable(
    'skills',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        name: text('name').notNull(),
        description: text('description').notNull(),
        prompt: text('prompt').notNull(),
        category: text('category').notNull(),
        aiProvider: text('ai_provider'),
        mcpRequirements: text('mcp_requirements', { mode: 'json' }).notNull().default('[]'),
        inputSchema: text('input_schema', { mode: 'json' }),
        outputSchema: text('output_schema', { mode: 'json' }),
        isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
        isOfficial: integer('is_official', { mode: 'boolean' }).notNull().default(false),
        authorId: integer('author_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        teamId: integer('team_id').references(() => teams.id, { onDelete: 'cascade' }),
        forkCount: integer('fork_count').notNull().default(0),
        usageCount: integer('usage_count').notNull().default(0),
        rating: real('rating'),
        reviews: text('reviews', { mode: 'json' }).notNull().default('[]'),
        version: integer('version').notNull().default(1),
        changelog: text('changelog'),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        authorIdx: index('skill_author_idx').on(table.authorId),
        teamIdx: index('skill_team_idx').on(table.teamId),
        categoryIdx: index('skill_category_idx').on(table.category),
        publicIdx: index('skill_public_idx').on(table.isPublic),
    })
);

export const skillTags = sqliteTable(
    'skill_tags',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        skillId: integer('skill_id')
            .notNull()
            .references(() => skills.id, { onDelete: 'cascade' }),
        tag: text('tag').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        skillTagIdx: index('skill_tag_skill_tag_idx').on(table.skillId, table.tag),
    })
);

// ========================================
// AI Provider & MCP
// ========================================

export const aiProviderConfigs = sqliteTable(
    'ai_provider_configs',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
        teamId: integer('team_id').references(() => teams.id, { onDelete: 'cascade' }),
        provider: text('provider').notNull(),
        apiKey: text('api_key').notNull(), // Encrypted
        endpoint: text('endpoint'),
        settings: text('settings', { mode: 'json' }).notNull().default('{}'),
        isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
        monthlyBudget: real('monthly_budget'),
        currentSpend: real('current_spend').notNull().default(0),
        lastTestedAt: integer('last_tested_at', { mode: 'timestamp' }),
        lastError: text('last_error'),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        userIdx: index('ai_provider_config_user_idx').on(table.userId),
        teamIdx: index('ai_provider_config_team_idx').on(table.teamId),
    })
);

export const mcpIntegrations = sqliteTable(
    'mcp_integrations',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        name: text('name').notNull(),
        description: text('description').notNull(),
        endpoint: text('endpoint').notNull(),
        configSchema: text('config_schema', { mode: 'json' }).notNull(),
        isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
        isOfficial: integer('is_official', { mode: 'boolean' }).notNull().default(false),
        installedBy: integer('installed_by')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        installedAt: integer('installed_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        settings: text('settings', { mode: 'json' }).notNull().default('{}'),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        installedByIdx: index('mcp_integration_installed_by_idx').on(table.installedBy),
    })
);

// ========================================
// Activity & Notifications
// ========================================

export const activities = sqliteTable(
    'activities',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
        taskId: integer('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        type: text('type').notNull(),
        changes: text('changes', { mode: 'json' }),
        metadata: text('metadata', { mode: 'json' }),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        projectIdx: index('activity_project_idx').on(table.projectId),
        taskIdx: index('activity_task_idx').on(table.taskId),
        userIdx: index('activity_user_idx').on(table.userId),
        typeIdx: index('activity_type_idx').on(table.type),
        createdAtIdx: index('activity_created_at_idx').on(table.createdAt),
    })
);

export const notifications = sqliteTable(
    'notifications',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        type: text('type').notNull(),
        title: text('title').notNull(),
        content: text('content').notNull(),
        relatedProjectId: integer('related_project_id').references(() => projects.id, {
            onDelete: 'cascade',
        }),
        relatedTaskId: integer('related_task_id').references(() => tasks.id, {
            onDelete: 'cascade',
        }),
        isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
        readAt: integer('read_at', { mode: 'timestamp' }),
        actionUrl: text('action_url'),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        userIdx: index('notification_user_idx').on(table.userId),
        isReadIdx: index('notification_is_read_idx').on(table.isRead),
        createdAtIdx: index('notification_created_at_idx').on(table.createdAt),
    })
);

// ========================================
// Automation & Webhooks
// ========================================

export const automations = sqliteTable(
    'automations',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        description: text('description'),
        trigger: text('trigger', { mode: 'json' }).notNull(),
        actions: text('actions', { mode: 'json' }).notNull(),
        isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
        lastRunAt: integer('last_run_at', { mode: 'timestamp' }),
        runCount: integer('run_count').notNull().default(0),
        createdBy: integer('created_by')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        projectIdx: index('automation_project_idx').on(table.projectId),
        createdByIdx: index('automation_created_by_idx').on(table.createdBy),
    })
);

export const webhooks = sqliteTable(
    'webhooks',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        url: text('url').notNull(),
        events: text('events', { mode: 'json' }).notNull(),
        secret: text('secret'),
        headers: text('headers', { mode: 'json' }),
        isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
        lastTriggeredAt: integer('last_triggered_at', { mode: 'timestamp' }),
        failureCount: integer('failure_count').notNull().default(0),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        projectIdx: index('webhook_project_idx').on(table.projectId),
    })
);

// ========================================
// Integrations & Search
// ========================================

export const integrations = sqliteTable(
    'integrations',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
        teamId: integer('team_id').references(() => teams.id, { onDelete: 'cascade' }),
        type: text('type').notNull(),
        credentials: text('credentials', { mode: 'json' }).notNull(), // Encrypted
        settings: text('settings', { mode: 'json' }).notNull().default('{}'),
        isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(true),
        lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        userIdx: index('integration_user_idx').on(table.userId),
        teamIdx: index('integration_team_idx').on(table.teamId),
        typeIdx: index('integration_type_idx').on(table.type),
    })
);

export const searchIndexes = sqliteTable(
    'search_indexes',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        entityType: text('entity_type').notNull(),
        entityId: integer('entity_id').notNull(),
        content: text('content').notNull(),
        metadata: text('metadata', { mode: 'json' }),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        entityIdx: index('search_index_entity_idx').on(table.entityType, table.entityId),
        // SQLite FTS5 will be used for full-text search on content field
    })
);

// ========================================
// Workflow Execution & Checkpoints
// ========================================

export const workflowExecutions = sqliteTable(
    'workflow_executions',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        workflowId: text('workflow_id').notNull().unique(),
        projectId: integer('project_id')
            .notNull()
            .references(() => projects.id, { onDelete: 'cascade' }),
        status: text('status').notNull().default('pending'), // pending|running|paused|completed|failed|cancelled
        totalTasks: integer('total_tasks').notNull().default(0),
        completedTasks: integer('completed_tasks').notNull().default(0),
        failedTasks: integer('failed_tasks').notNull().default(0),
        currentStage: integer('current_stage').notNull().default(0),
        totalStages: integer('total_stages').notNull().default(0),
        totalCost: real('total_cost').notNull().default(0),
        totalTokens: integer('total_tokens').notNull().default(0),
        totalDuration: integer('total_duration'), // milliseconds
        estimatedDuration: integer('estimated_duration'), // milliseconds
        executionPlan: text('execution_plan', { mode: 'json' }), // Serialized ExecutionPlan
        taskResults: text('task_results', { mode: 'json' }), // Array of TaskResult
        context: text('context', { mode: 'json' }), // ExecutionContext
        error: text('error'),
        startedBy: integer('started_by')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        startedAt: integer('started_at', { mode: 'timestamp' }),
        pausedAt: integer('paused_at', { mode: 'timestamp' }),
        completedAt: integer('completed_at', { mode: 'timestamp' }),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        workflowIdIdx: index('workflow_execution_workflow_id_idx').on(table.workflowId),
        projectIdx: index('workflow_execution_project_idx').on(table.projectId),
        statusIdx: index('workflow_execution_status_idx').on(table.status),
        startedByIdx: index('workflow_execution_started_by_idx').on(table.startedBy),
    })
);

export const workflowCheckpoints = sqliteTable(
    'workflow_checkpoints',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        checkpointId: text('checkpoint_id').notNull().unique(),
        workflowExecutionId: integer('workflow_execution_id')
            .notNull()
            .references(() => workflowExecutions.id, { onDelete: 'cascade' }),
        workflowId: text('workflow_id').notNull(),
        stageIndex: integer('stage_index').notNull(),
        completedTaskIds: text('completed_task_ids', { mode: 'json' }).notNull(), // Array of task IDs
        context: text('context', { mode: 'json' }).notNull(), // ExecutionContext snapshot
        metadata: text('metadata', { mode: 'json' }),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        checkpointIdIdx: index('workflow_checkpoint_id_idx').on(table.checkpointId),
        executionIdx: index('workflow_checkpoint_execution_idx').on(table.workflowExecutionId),
        workflowIdIdx: index('workflow_checkpoint_workflow_id_idx').on(table.workflowId),
    })
);

export const automationRules = sqliteTable(
    'automation_rules',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        ruleId: text('rule_id').notNull().unique(),
        name: text('name').notNull(),
        description: text('description'),
        projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
        enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
        trigger: text('trigger', { mode: 'json' }).notNull(), // Trigger configuration
        conditions: text('conditions', { mode: 'json' }).notNull().default('[]'), // Array of Condition
        actions: text('actions', { mode: 'json' }).notNull(), // Array of Action
        executionCount: integer('execution_count').notNull().default(0),
        lastExecutedAt: integer('last_executed_at', { mode: 'timestamp' }),
        createdBy: integer('created_by')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`CURRENT_TIMESTAMP`),
    },
    (table) => ({
        ruleIdIdx: index('automation_rule_id_idx').on(table.ruleId),
        projectIdx: index('automation_rule_project_idx').on(table.projectId),
        enabledIdx: index('automation_rule_enabled_idx').on(table.enabled),
    })
);

// ========================================
// Type Exports
// ========================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type TaskExecution = typeof taskExecutions.$inferSelect;
export type NewTaskExecution = typeof taskExecutions.$inferInsert;

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;

export type TimeEntry = typeof timeEntries.$inferSelect;
export type NewTimeEntry = typeof timeEntries.$inferInsert;

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;

export type Skill = typeof skills.$inferSelect;
export type NewSkill = typeof skills.$inferInsert;

export type AIProviderConfig = typeof aiProviderConfigs.$inferSelect;
export type NewAIProviderConfig = typeof aiProviderConfigs.$inferInsert;

export type MCPIntegration = typeof mcpIntegrations.$inferSelect;
export type NewMCPIntegration = typeof mcpIntegrations.$inferInsert;

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export type Automation = typeof automations.$inferSelect;
export type NewAutomation = typeof automations.$inferInsert;

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;

export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;

export type SearchIndex = typeof searchIndexes.$inferSelect;
export type NewSearchIndex = typeof searchIndexes.$inferInsert;

export type ProjectMember = typeof projectMembers.$inferSelect;
export type NewProjectMember = typeof projectMembers.$inferInsert;

export type TeamMember = typeof teamMembers.$inferSelect;
export type NewTeamMember = typeof teamMembers.$inferInsert;

export type TaskWatcher = typeof taskWatchers.$inferSelect;
export type NewTaskWatcher = typeof taskWatchers.$inferInsert;

export type TemplateTask = typeof templateTasks.$inferSelect;
export type NewTemplateTask = typeof templateTasks.$inferInsert;

export type SkillTag = typeof skillTags.$inferSelect;
export type NewSkillTag = typeof skillTags.$inferInsert;

export type TaskSuggestedSkill = typeof taskSuggestedSkills.$inferSelect;
export type NewTaskSuggestedSkill = typeof taskSuggestedSkills.$inferInsert;

export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type NewWorkflowExecution = typeof workflowExecutions.$inferInsert;

export type WorkflowCheckpoint = typeof workflowCheckpoints.$inferSelect;
export type NewWorkflowCheckpoint = typeof workflowCheckpoints.$inferInsert;

export type AutomationRule = typeof automationRules.$inferSelect;
export type NewAutomationRule = typeof automationRules.$inferInsert;

export type TaskHistory = typeof taskHistory.$inferSelect;
export type NewTaskHistory = typeof taskHistory.$inferInsert;
