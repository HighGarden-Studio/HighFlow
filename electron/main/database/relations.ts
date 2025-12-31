/**
 * Drizzle ORM Relations
 *
 * Defines relationships between tables for easier querying
 */

import { relations } from 'drizzle-orm';
import * as schema from './schema';

// ========================================
// User Relations
// ========================================

export const usersRelations = relations(schema.users, ({ many }) => ({
    ownedProjects: many(schema.projects),
    projectMemberships: many(schema.projectMembers),
    teamMemberships: many(schema.teamMembers),
    assignedTasks: many(schema.tasks),
    watchedTasks: many(schema.taskWatchers),
    comments: many(schema.comments),
    timeEntries: many(schema.timeEntries),
    activities: many(schema.activities),
    notifications: many(schema.notifications),
    aiProviderConfigs: many(schema.aiProviderConfigs),
    createdTemplates: many(schema.templates),
    createdSkills: many(schema.skills),
    createdAutomations: many(schema.automations),
    mcpIntegrations: many(schema.mcpIntegrations),
    integrations: many(schema.integrations),
}));

// ========================================
// Team Relations
// ========================================

export const teamsRelations = relations(schema.teams, ({ many }) => ({
    members: many(schema.teamMembers),
    projects: many(schema.projects),
    skills: many(schema.skills),
    aiProviderConfigs: many(schema.aiProviderConfigs),
    integrations: many(schema.integrations),
}));

export const teamMembersRelations = relations(schema.teamMembers, ({ one }) => ({
    team: one(schema.teams, {
        fields: [schema.teamMembers.teamId],
        references: [schema.teams.id],
    }),
    user: one(schema.users, {
        fields: [schema.teamMembers.userId],
        references: [schema.users.id],
    }),
}));

// ========================================
// Project Relations
// ========================================

export const projectsRelations = relations(schema.projects, ({ one, many }) => ({
    owner: one(schema.users, {
        fields: [schema.projects.ownerId],
        references: [schema.users.id],
    }),
    team: one(schema.teams, {
        fields: [schema.projects.teamId],
        references: [schema.teams.id],
    }),
    template: one(schema.templates, {
        fields: [schema.projects.templateId],
        references: [schema.templates.id],
    }),
    members: many(schema.projectMembers),
    tasks: many(schema.tasks),
    activities: many(schema.activities),
    automations: many(schema.automations),
    webhooks: many(schema.webhooks),
}));

export const projectMembersRelations = relations(schema.projectMembers, ({ one }) => ({
    project: one(schema.projects, {
        fields: [schema.projectMembers.projectId],
        references: [schema.projects.id],
    }),
    user: one(schema.users, {
        fields: [schema.projectMembers.userId],
        references: [schema.users.id],
    }),
}));

// ========================================
// Task Relations
// ========================================

export const tasksRelations = relations(schema.tasks, ({ one, many }) => ({
    project: one(schema.projects, {
        fields: [schema.tasks.projectId],
        references: [schema.projects.id],
    }),
    assignee: one(schema.users, {
        fields: [schema.tasks.assigneeId],
        references: [schema.users.id],
    }),
    parentTask: one(schema.tasks, {
        fields: [schema.tasks.parentProjectId, schema.tasks.parentSequence],
        references: [schema.tasks.projectId, schema.tasks.projectSequence],
        relationName: 'subtasks',
    }),
    blockedByTask: one(schema.tasks, {
        fields: [schema.tasks.blockedByProjectId, schema.tasks.blockedBySequence],
        references: [schema.tasks.projectId, schema.tasks.projectSequence],
        relationName: 'blocking',
    }),
    subTasks: many(schema.tasks, { relationName: 'subtasks' }),
    blockingTasks: many(schema.tasks, { relationName: 'blocking' }),
    watchers: many(schema.taskWatchers),
    comments: many(schema.comments),
    timeEntries: many(schema.timeEntries),
    executions: many(schema.taskExecutions),
    suggestedSkills: many(schema.taskSuggestedSkills),
    activities: many(schema.activities),
}));

export const taskWatchersRelations = relations(schema.taskWatchers, ({ one }) => ({
    task: one(schema.tasks, {
        fields: [schema.taskWatchers.taskProjectId, schema.taskWatchers.taskSequence],
        references: [schema.tasks.projectId, schema.tasks.projectSequence],
    }),
    user: one(schema.users, {
        fields: [schema.taskWatchers.userId],
        references: [schema.users.id],
    }),
}));

export const taskExecutionsRelations = relations(schema.taskExecutions, ({ one }) => ({
    task: one(schema.tasks, {
        fields: [schema.taskExecutions.taskProjectId, schema.taskExecutions.taskSequence],
        references: [schema.tasks.projectId, schema.tasks.projectSequence],
    }),
}));

export const taskSuggestedSkillsRelations = relations(schema.taskSuggestedSkills, ({ one }) => ({
    task: one(schema.tasks, {
        fields: [schema.taskSuggestedSkills.taskProjectId, schema.taskSuggestedSkills.taskSequence],
        references: [schema.tasks.projectId, schema.tasks.projectSequence],
    }),
    skill: one(schema.skills, {
        fields: [schema.taskSuggestedSkills.skillId],
        references: [schema.skills.id],
    }),
}));

// ========================================
// Comment Relations
// ========================================

export const commentsRelations = relations(schema.comments, ({ one, many }) => ({
    task: one(schema.tasks, {
        fields: [schema.comments.taskProjectId, schema.comments.taskSequence],
        references: [schema.tasks.projectId, schema.tasks.projectSequence],
    }),
    user: one(schema.users, {
        fields: [schema.comments.userId],
        references: [schema.users.id],
    }),
    parentComment: one(schema.comments, {
        fields: [schema.comments.parentCommentId],
        references: [schema.comments.id],
        relationName: 'replies',
    }),
    replies: many(schema.comments, { relationName: 'replies' }),
}));

// ========================================
// Time Entry Relations
// ========================================

export const timeEntriesRelations = relations(schema.timeEntries, ({ one }) => ({
    task: one(schema.tasks, {
        fields: [schema.timeEntries.taskProjectId, schema.timeEntries.taskSequence],
        references: [schema.tasks.projectId, schema.tasks.projectSequence],
    }),
    user: one(schema.users, {
        fields: [schema.timeEntries.userId],
        references: [schema.users.id],
    }),
}));

// ========================================
// Template Relations
// ========================================

export const templatesRelations = relations(schema.templates, ({ one, many }) => ({
    author: one(schema.users, {
        fields: [schema.templates.authorId],
        references: [schema.users.id],
    }),
    tasks: many(schema.templateTasks),
    projects: many(schema.projects),
}));

export const templateTasksRelations = relations(schema.templateTasks, ({ one }) => ({
    template: one(schema.templates, {
        fields: [schema.templateTasks.templateId],
        references: [schema.templates.id],
    }),
}));

// ========================================
// Skill Relations
// ========================================

export const skillsRelations = relations(schema.skills, ({ one, many }) => ({
    author: one(schema.users, {
        fields: [schema.skills.authorId],
        references: [schema.users.id],
    }),
    team: one(schema.teams, {
        fields: [schema.skills.teamId],
        references: [schema.teams.id],
    }),
    tags: many(schema.skillTags),
    suggestedForTasks: many(schema.taskSuggestedSkills),
}));

export const skillTagsRelations = relations(schema.skillTags, ({ one }) => ({
    skill: one(schema.skills, {
        fields: [schema.skillTags.skillId],
        references: [schema.skills.id],
    }),
}));

// ========================================
// AI Provider & MCP Relations
// ========================================

export const aiProviderConfigsRelations = relations(schema.aiProviderConfigs, ({ one }) => ({
    user: one(schema.users, {
        fields: [schema.aiProviderConfigs.userId],
        references: [schema.users.id],
    }),
    team: one(schema.teams, {
        fields: [schema.aiProviderConfigs.teamId],
        references: [schema.teams.id],
    }),
}));

export const mcpIntegrationsRelations = relations(schema.mcpIntegrations, ({ one }) => ({
    installer: one(schema.users, {
        fields: [schema.mcpIntegrations.installedBy],
        references: [schema.users.id],
    }),
}));

// ========================================
// Activity & Notification Relations
// ========================================

export const activitiesRelations = relations(schema.activities, ({ one }) => ({
    project: one(schema.projects, {
        fields: [schema.activities.projectId],
        references: [schema.projects.id],
    }),
    task: one(schema.tasks, {
        fields: [schema.activities.taskProjectId, schema.activities.taskSequence],
        references: [schema.tasks.projectId, schema.tasks.projectSequence],
    }),
    user: one(schema.users, {
        fields: [schema.activities.userId],
        references: [schema.users.id],
    }),
}));

export const notificationsRelations = relations(schema.notifications, ({ one }) => ({
    user: one(schema.users, {
        fields: [schema.notifications.userId],
        references: [schema.users.id],
    }),
    relatedProject: one(schema.projects, {
        fields: [schema.notifications.relatedProjectId],
        references: [schema.projects.id],
    }),
    relatedTask: one(schema.tasks, {
        fields: [
            schema.notifications.relatedTaskProjectId,
            schema.notifications.relatedTaskSequence,
        ],
        references: [schema.tasks.projectId, schema.tasks.projectSequence],
    }),
}));

// ========================================
// Automation & Webhook Relations
// ========================================

export const automationsRelations = relations(schema.automations, ({ one }) => ({
    project: one(schema.projects, {
        fields: [schema.automations.projectId],
        references: [schema.projects.id],
    }),
    creator: one(schema.users, {
        fields: [schema.automations.createdBy],
        references: [schema.users.id],
    }),
}));

export const webhooksRelations = relations(schema.webhooks, ({ one }) => ({
    project: one(schema.projects, {
        fields: [schema.webhooks.projectId],
        references: [schema.projects.id],
    }),
}));

// ========================================
// Integration Relations
// ========================================

export const integrationsRelations = relations(schema.integrations, ({ one }) => ({
    user: one(schema.users, {
        fields: [schema.integrations.userId],
        references: [schema.users.id],
    }),
    team: one(schema.teams, {
        fields: [schema.integrations.teamId],
        references: [schema.teams.id],
    }),
}));
