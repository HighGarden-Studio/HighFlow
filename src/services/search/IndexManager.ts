/**
 * Index Manager Service
 *
 * Manages search index lifecycle including:
 * - Automatic indexing on entity changes
 * - Background re-indexing
 * - Index optimization and compression
 */

import { searchEngine, type EntityType } from './SearchEngine';
import type { Project, Task, Comment, Skill, User, Template } from '@core/types/database';

// ========================================
// Types
// ========================================

export interface IndexingStats {
    lastFullIndex: Date | null;
    lastIncrementalIndex: Date | null;
    totalIndexed: number;
    indexingInProgress: boolean;
    errors: string[];
}

export interface EntityChangeEvent {
    type: 'created' | 'updated' | 'deleted';
    entityType: EntityType;
    entityId: number;
    data?: unknown;
}

// ========================================
// Index Manager Implementation
// ========================================

export class IndexManager {
    private stats: IndexingStats;
    private changeQueue: EntityChangeEvent[];
    private processingQueue: boolean;
    private reindexInterval: ReturnType<typeof setInterval> | null;
    private readonly batchSize = 50;
    private readonly queueProcessInterval = 1000; // 1 second

    constructor() {
        this.stats = {
            lastFullIndex: null,
            lastIncrementalIndex: null,
            totalIndexed: 0,
            indexingInProgress: false,
            errors: [],
        };
        this.changeQueue = [];
        this.processingQueue = false;
        this.reindexInterval = null;
    }

    // ========================================
    // Initialization
    // ========================================

    /**
     * Initialize the index manager
     */
    async initialize(): Promise<void> {
        // Start queue processor
        this.startQueueProcessor();

        // Schedule periodic re-indexing
        this.scheduleReindexing();

        console.log('[IndexManager] Initialized');
    }

    /**
     * Shutdown the index manager
     */
    shutdown(): void {
        if (this.reindexInterval) {
            clearInterval(this.reindexInterval);
            this.reindexInterval = null;
        }
        console.log('[IndexManager] Shutdown');
    }

    // ========================================
    // Entity Indexing
    // ========================================

    /**
     * Index a project
     */
    async indexProject(project: Project): Promise<void> {
        const content = [project.title, project.description || '', project.mainPrompt || ''].join(
            ' '
        );

        await searchEngine.indexEntity('project', project.id, content, {
            title: project.title,
            status: project.status,
            aiProvider: project.aiProvider,
            ownerId: project.ownerId,
            teamId: project.teamId,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            emoji: project.emoji,
            color: project.color,
        });
    }

    /**
     * Index a task
     */
    async indexTask(task: Task): Promise<void> {
        const content = [
            task.title,
            task.description || '',
            task.generatedPrompt || '',
            (task.tags || []).join(' '),
        ].join(' ');

        await searchEngine.indexEntity('task', (task as any).id, content, {
            title: task.title,
            status: task.status,
            priority: task.priority,
            projectId: task.projectId,
            assigneeId: task.assigneeId,
            parentTaskId: task.parentTaskId,
            tags: task.tags || [],
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
            dueDate: task.dueDate,
            estimatedMinutes: task.estimatedMinutes,
        });
    }

    /**
     * Index a comment
     */
    async indexComment(comment: Comment): Promise<void> {
        await searchEngine.indexEntity('comment', comment.id, comment.content, {
            title: `Comment on task #${comment.taskId}`,
            taskId: comment.taskId,
            userId: comment.userId,
            contentType: comment.contentType,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt,
        });
    }

    /**
     * Index a skill
     */
    async indexSkill(skill: Skill): Promise<void> {
        const content = [skill.name, skill.description, skill.prompt, skill.category].join(' ');

        await searchEngine.indexEntity('skill', skill.id, content, {
            title: skill.name,
            category: skill.category,
            aiProvider: skill.aiProvider,
            authorId: skill.authorId,
            teamId: skill.teamId,
            isPublic: skill.isPublic,
            isOfficial: skill.isOfficial,
            rating: skill.rating,
            usageCount: skill.usageCount,
            createdAt: skill.createdAt,
            updatedAt: skill.updatedAt,
        });
    }

    /**
     * Index a user
     */
    async indexUser(user: User): Promise<void> {
        const content = [user.name, user.email].join(' ');

        await searchEngine.indexEntity('user', user.id, content, {
            title: user.name,
            email: user.email,
            role: user.role,
            avatar: user.avatar,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        });
    }

    /**
     * Index a template
     */
    async indexTemplate(template: Template): Promise<void> {
        const content = [
            template.name,
            template.description,
            template.category,
            (template.tags || []).join(' '),
        ].join(' ');

        await searchEngine.indexEntity('template', template.id, content, {
            title: template.name,
            category: template.category,
            tags: template.tags || [],
            authorId: template.authorId,
            isPublic: template.isPublic,
            isOfficial: template.isOfficial,
            rating: template.rating,
            usageCount: template.usageCount,
            createdAt: template.createdAt,
            updatedAt: template.updatedAt,
        });
    }

    // ========================================
    // Change Queue Management
    // ========================================

    /**
     * Queue an entity change for indexing
     */
    queueChange(event: EntityChangeEvent): void {
        this.changeQueue.push(event);
    }

    /**
     * Handle entity created
     */
    onEntityCreated(entityType: EntityType, entityId: number, data: unknown): void {
        this.queueChange({
            type: 'created',
            entityType,
            entityId,
            data,
        });
    }

    /**
     * Handle entity updated
     */
    onEntityUpdated(entityType: EntityType, entityId: number, data: unknown): void {
        this.queueChange({
            type: 'updated',
            entityType,
            entityId,
            data,
        });
    }

    /**
     * Handle entity deleted
     */
    onEntityDeleted(entityType: EntityType, entityId: number): void {
        this.queueChange({
            type: 'deleted',
            entityType,
            entityId,
        });
    }

    /**
     * Process queued changes
     */
    private async processQueue(): Promise<void> {
        if (this.processingQueue || this.changeQueue.length === 0) {
            return;
        }

        this.processingQueue = true;

        try {
            // Take a batch from the queue
            const batch = this.changeQueue.splice(0, this.batchSize);

            for (const event of batch) {
                try {
                    if (event.type === 'deleted') {
                        await searchEngine.removeFromIndex(event.entityType, event.entityId);
                    } else if (event.data) {
                        await this.indexEntityByType(event.entityType, event.data);
                    }
                } catch (error) {
                    const errorMsg = `Failed to index ${event.entityType}:${event.entityId} - ${error}`;
                    this.stats.errors.push(errorMsg);
                    console.error(`[IndexManager] ${errorMsg}`);

                    // Keep only last 100 errors
                    if (this.stats.errors.length > 100) {
                        this.stats.errors = this.stats.errors.slice(-100);
                    }
                }
            }

            this.stats.lastIncrementalIndex = new Date();
            this.stats.totalIndexed = searchEngine.getStats().totalDocuments;
        } finally {
            this.processingQueue = false;
        }
    }

    /**
     * Start the queue processor
     */
    private startQueueProcessor(): void {
        setInterval(() => {
            this.processQueue();
        }, this.queueProcessInterval);
    }

    // ========================================
    // Full Re-indexing
    // ========================================

    /**
     * Perform full re-indexing of all entities
     */
    async fullReindex(dataProvider: {
        getProjects: () => Promise<Project[]>;
        getTasks: () => Promise<Task[]>;
        getComments: () => Promise<Comment[]>;
        getSkills: () => Promise<Skill[]>;
        getUsers: () => Promise<User[]>;
        getTemplates: () => Promise<Template[]>;
    }): Promise<void> {
        if (this.stats.indexingInProgress) {
            console.warn('[IndexManager] Indexing already in progress');
            return;
        }

        this.stats.indexingInProgress = true;
        console.log('[IndexManager] Starting full re-index...');

        try {
            // Clear existing index
            await searchEngine.clearIndex();

            // Index projects
            const projects = await dataProvider.getProjects();
            for (const project of projects) {
                await this.indexProject(project);
            }
            console.log(`[IndexManager] Indexed ${projects.length} projects`);

            // Index tasks
            const tasks = await dataProvider.getTasks();
            for (const task of tasks) {
                await this.indexTask(task);
            }
            console.log(`[IndexManager] Indexed ${tasks.length} tasks`);

            // Index comments
            const comments = await dataProvider.getComments();
            for (const comment of comments) {
                await this.indexComment(comment);
            }
            console.log(`[IndexManager] Indexed ${comments.length} comments`);

            // Index skills
            const skills = await dataProvider.getSkills();
            for (const skill of skills) {
                await this.indexSkill(skill);
            }
            console.log(`[IndexManager] Indexed ${skills.length} skills`);

            // Index users
            const users = await dataProvider.getUsers();
            for (const user of users) {
                await this.indexUser(user);
            }
            console.log(`[IndexManager] Indexed ${users.length} users`);

            // Index templates
            const templates = await dataProvider.getTemplates();
            for (const template of templates) {
                await this.indexTemplate(template);
            }
            console.log(`[IndexManager] Indexed ${templates.length} templates`);

            this.stats.lastFullIndex = new Date();
            this.stats.totalIndexed = searchEngine.getStats().totalDocuments;
            console.log(
                `[IndexManager] Full re-index complete. Total: ${this.stats.totalIndexed} documents`
            );
        } catch (error) {
            const errorMsg = `Full re-index failed: ${error}`;
            this.stats.errors.push(errorMsg);
            console.error(`[IndexManager] ${errorMsg}`);
        } finally {
            this.stats.indexingInProgress = false;
        }
    }

    /**
     * Schedule periodic re-indexing
     */
    private scheduleReindexing(): void {
        // Note: Full re-indexing should be triggered by the application
        // when data provider is available. This is just a placeholder.
        console.log('[IndexManager] Periodic re-indexing scheduled (requires data provider)');
    }

    // ========================================
    // Helper Methods
    // ========================================

    /**
     * Index entity by type
     */
    private async indexEntityByType(entityType: EntityType, data: unknown): Promise<void> {
        switch (entityType) {
            case 'project':
                await this.indexProject(data as Project);
                break;
            case 'task':
                await this.indexTask(data as Task);
                break;
            case 'comment':
                await this.indexComment(data as Comment);
                break;
            case 'skill':
                await this.indexSkill(data as Skill);
                break;
            case 'user':
                await this.indexUser(data as User);
                break;
            case 'template':
                await this.indexTemplate(data as Template);
                break;
        }
    }

    /**
     * Get indexing statistics
     */
    getStats(): IndexingStats {
        return { ...this.stats };
    }

    /**
     * Get queue size
     */
    getQueueSize(): number {
        return this.changeQueue.length;
    }

    /**
     * Clear errors
     */
    clearErrors(): void {
        this.stats.errors = [];
    }
}

// ========================================
// Singleton Export
// ========================================

export const indexManager = new IndexManager();
export default indexManager;
