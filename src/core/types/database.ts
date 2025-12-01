/**
 * Core Database Type Definitions
 *
 * All types used across the database schema.
 * These types are shared between frontend and backend.
 */

import type { AiResult, AIProvider } from './ai';

// ========================================
// Enum Types
// ========================================

export type ProjectStatus = 'active' | 'completed' | 'archived' | 'on_hold';

export type TaskStatus =
    | 'todo'
    | 'in_progress'
    | 'needs_approval'
    | 'in_review'
    | 'done'
    | 'blocked';

/**
 * Task Status Transition Rules
 *
 * TODO:
 *   - Can move to: IN_PROGRESS, DONE, BLOCKED
 *   - Execute button starts AI task and moves to IN_PROGRESS
 *   - Can request task subdivision and prompt refinement
 *
 * IN_PROGRESS:
 *   - AI is actively working on the task
 *   - Progress can be streamed in real-time
 *   - Has pause functionality
 *   - Stop cancels AI work and stays in IN_PROGRESS
 *   - Can move to: NEEDS_APPROVAL (AI requests user input), IN_REVIEW (work completed), BLOCKED
 *
 * NEEDS_APPROVAL:
 *   - AI requested user input (question, permission, etc.)
 *   - Approve: moves back to IN_PROGRESS
 *   - Reject: moves to TODO
 *   - Can move to: IN_PROGRESS, TODO
 *
 * IN_REVIEW:
 *   - AI work completed, awaiting user review
 *   - User can view results
 *   - Approve: moves to DONE
 *   - Request changes: adds refinement prompt and moves to IN_PROGRESS
 *   - Auto-review: AI reviews its own work
 *   - Can move to: DONE, IN_PROGRESS
 *
 * DONE:
 *   - Review completed
 *   - Results can be previewed
 *   - Can request additional work with refinement prompt (moves to IN_PROGRESS)
 *   - Can move to: IN_PROGRESS, BLOCKED
 *
 * BLOCKED:
 *   - User manually blocked the task
 *   - All states can move here
 *   - Moving here cancels any running AI work
 *   - Removes dependencies from other tasks
 *   - Can move to: TODO
 */

// Allowed status transitions
export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
    todo: ['in_progress', 'done', 'blocked'],
    in_progress: ['needs_approval', 'in_review', 'blocked', 'todo'],
    needs_approval: ['in_progress', 'todo'],
    in_review: ['done', 'in_progress', 'blocked'],
    done: ['in_progress', 'blocked'],
    blocked: ['todo'],
};

// Check if a status transition is valid
export function isValidStatusTransition(from: TaskStatus, to: TaskStatus): boolean {
    return TASK_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type ExecutionType = 'serial' | 'parallel';

export type AIProvider =
    | 'openai'
    | 'anthropic'
    | 'google'
    | 'groq'
    | 'claude-code'
    | 'antigravity'
    | 'codex'
    | 'local';

export type UserRole = 'admin' | 'member' | 'viewer';

export type TeamPlan = 'free' | 'pro' | 'enterprise';

export type TaskExecutionStatus = 'running' | 'success' | 'failed' | 'cancelled';

export type CommentContentType = 'text' | 'markdown';

export type ActivityType =
    | 'project_created'
    | 'project_updated'
    | 'project_completed'
    | 'task_created'
    | 'task_updated'
    | 'task_completed'
    | 'task_assigned'
    | 'comment_created'
    | 'mentioned';

// Task History Event Types
export type TaskHistoryEventType =
    | 'execution_started' // 실행 시작
    | 'execution_completed' // 실행 완료
    | 'execution_failed' // 실행 실패
    | 'ai_review_requested' // AI 검토 요청
    | 'ai_review_completed' // AI 검토 완료
    | 'prompt_refined' // 프롬프트 수정/추가
    | 'status_changed' // 상태 변경
    | 'paused' // 일시정지
    | 'resumed' // 재개
    | 'stopped' // 중지
    | 'approval_requested' // 승인 요청 (NEEDS_APPROVAL)
    | 'approved' // 승인됨
    | 'rejected' // 거절됨
    | 'review_completed' // 사용자 리뷰 완료 (IN_REVIEW -> DONE)
    | 'changes_requested'; // 수정 요청 (IN_REVIEW -> IN_PROGRESS)

// Task History Event Data Types
export interface TaskHistoryEventData {
    // execution_started
    prompt?: string;
    provider?: string;
    model?: string;

    // execution_completed
    content?: string;
    cost?: number;
    tokens?: number;
    duration?: number;
    aiResult?: AiResult | null;

    // execution_failed
    error?: string;

    // ai_review_requested
    reviewPrompt?: string;
    originalResult?: string;

    // ai_review_completed
    reviewResult?: string;
    reviewFeedback?: string;
    approved?: boolean;

    // prompt_refined
    previousPrompt?: string;
    newPrompt?: string;
    refinementReason?: string;

    // status_changed
    previousStatus?: TaskStatus;
    newStatus?: TaskStatus;

    // approval_requested
    question?: string;
    options?: string[];

    // approved/rejected
    response?: string;

    // changes_requested
    refinementPrompt?: string;
}

export interface TaskHistoryMetadata {
    provider?: string;
    model?: string;
    cost?: number;
    tokens?: number;
    duration?: number;
    userId?: number;
    userName?: string;
    score?: number; // AI 검토 점수 (1-10)
}

export type NotificationType =
    | 'task_assigned'
    | 'task_completed'
    | 'mentioned'
    | 'comment_reply'
    | 'due_date_reminder'
    | 'project_invite';

export type IntegrationType = 'slack' | 'discord' | 'github' | 'gitlab' | 'google_drive';

export type EntityType = 'project' | 'task' | 'comment' | 'skill' | 'template';

export type WebhookEvent =
    | 'task_created'
    | 'task_completed'
    | 'task_updated'
    | 'project_created'
    | 'project_completed'
    | 'comment_created';

export type AutomationTriggerType =
    | 'task_status_changed'
    | 'task_created'
    | 'task_assigned'
    | 'due_date_approaching'
    | 'project_completed';

export type AutomationActionType =
    | 'send_notification'
    | 'assign_task'
    | 'update_status'
    | 'create_task'
    | 'webhook'
    | 'ai_generate';

// ========================================
// JSON Field Types
// ========================================

export interface MCPTaskConfigEntry {
    /**
     * Environment variables to expose when launching the MCP server
     */
    env?: Record<string, string>;
    /**
     * Default parameters that should be merged into every MCP tool call
     */
    params?: Record<string, string>;
    /**
     * Additional configuration fields that should be merged into the server config
     */
    config?: Record<string, unknown>;
    /**
     * Arbitrary context/instructions for this MCP (referenced in prompts)
     */
    context?: Record<string, unknown>;
}

export type MCPConfig = Record<string, MCPTaskConfigEntry>;

export interface AIProviderSettings {
    model: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
}

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export interface UserPreferences {
    defaultAI?: AIProvider;
    theme?: 'light' | 'dark' | 'system';
    notifications?: {
        email?: boolean;
        desktop?: boolean;
        mentions?: boolean;
        assignments?: boolean;
    };
    editor?: {
        autoSave?: boolean;
        fontSize?: number;
        keyBindings?: 'default' | 'vim' | 'emacs';
    };
}

export interface TeamSettings {
    permissions?: {
        canCreateProject?: UserRole[];
        canDeleteProject?: UserRole[];
        canInviteMembers?: UserRole[];
    };
    integrations?: {
        slack?: boolean;
        github?: boolean;
        discord?: boolean;
    };
    aiDefaults?: {
        provider?: AIProvider;
        model?: string;
        maxCostPerTask?: number;
    };
}

export interface BillingInfo {
    customerId?: string;
    subscriptionId?: string;
    paymentMethod?: string;
    billingEmail?: string;
    nextBillingDate?: string;
    monthlyBudget?: number;
}

export interface ProjectStructure {
    tasks: Array<{
        title: string;
        description?: string;
        priority?: TaskPriority;
        estimatedMinutes?: number;
        skills?: string[];
    }>;
    skills?: string[];
    automations?: Array<{
        name: string;
        trigger: AutomationTrigger;
        actions: AutomationAction[];
    }>;
}

export interface AutomationTrigger {
    type: AutomationTriggerType;
    conditions?: Array<{
        field: string;
        operator: 'equals' | 'contains' | 'greater_than' | 'less_than';
        value: unknown;
    }>;
}

export interface AutomationAction {
    type: AutomationActionType;
    config: Record<string, unknown>;
}

export interface CommentReactions {
    [emoji: string]: number[]; // emoji: array of user IDs
}

export interface ActivityChanges {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
}

export interface GitCommit {
    sha: string;
    message: string;
    author: string;
    timestamp: string;
    url?: string;
}

export interface TaskTriggerConfig {
    // 의존성 기반 트리거
    dependsOn?: {
        taskIds: number[]; // 이 태스크들이 모두 DONE일 때 트리거
        operator: 'all' | 'any'; // all: 모두 완료, any: 하나라도 완료
        executionPolicy?: 'once' | 'repeat'; // 실행 정책 (기본값: 'once')
        // once: TODO 상태일 때만 1회 자동 실행 (기본 동작)
        // repeat: 조건 충족 시 매번 자동 실행 (상태 무관)
    };
    // 시간 기반 트리거
    scheduledAt?: {
        type: 'once' | 'recurring'; // 한번 또는 반복
        datetime?: string; // ISO 8601 format for 'once'
        cron?: string; // Cron expression for 'recurring'
        timezone?: string;
    };
}

export interface IntegrationCredentials {
    accessToken?: string;
    refreshToken?: string;
    apiKey?: string;
    webhookUrl?: string;
    channelId?: string;
    [key: string]: unknown;
}

export interface WebhookHeaders {
    [key: string]: string;
}

export interface SkillReview {
    userId: number;
    rating: number;
    comment?: string;
    createdAt: string;
}

export interface SearchMetadata {
    title?: string;
    description?: string;
    tags?: string[];
    authorName?: string;
    projectName?: string;
    [key: string]: unknown;
}

// ========================================
// Base Entity Interfaces
// ========================================

export interface BaseEntity {
    id: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface SoftDeletable {
    deletedAt: Date | null;
}

export interface Versioned {
    version: number;
}

// ========================================
// Entity Interfaces
// ========================================

export interface Project extends BaseEntity {
    title: string;
    description: string | null;
    mainPrompt: string | null;
    projectGuidelines?: string | null;
    baseDevFolder?: string | null;
    status: ProjectStatus;
    aiProvider: AIProvider | null;
    aiModel: string | null; // 프로젝트 기본 AI 모델
    mcpConfig: MCPConfig | null; // 프로젝트 레벨 MCP 설정
    templateId: number | null;
    coverImage: string | null;
    color: string | null;
    emoji: string | null;
    isArchived: boolean;
    isFavorite: boolean;
    estimatedHours: number | null;
    actualHours: number | null;
    totalCost: number;
    archivedAt: Date | null;
    ownerId: number;
    teamId: number | null;
    gitRepository: string | null;
}

export interface ImageGenerationConfig {
    provider?: AIProvider | null;
    model?: string | null;
    size?: string | null;
    quality?: 'standard' | 'hd';
    style?: 'vivid' | 'natural';
    background?: 'transparent' | 'white' | 'black';
    format?: 'png' | 'webp' | 'jpg' | 'jpeg';
    negativePrompt?: string;
    promptTemplate?: string;
    count?: number;
    extra?: Record<string, any>;
}

export interface Task extends BaseEntity {
    projectId: number;
    title: string;
    description: string | null;
    generatedPrompt: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    executionType: ExecutionType;
    aiProvider: AIProvider | null;
    aiModel: string | null;
    reviewAiProvider: AIProvider | null;
    reviewAiModel: string | null;
    mcpConfig: MCPConfig | null;
    order: number;
    parentTaskId: number | null;
    assigneeId: number | null;
    watcherIds: number[];
    estimatedMinutes: number | null;
    actualMinutes: number | null;
    tokenUsage: TokenUsage | null;
    estimatedCost: number | null;
    actualCost: number | null;
    dueDate: Date | null;
    startedAt: Date | null;
    completedAt: Date | null;
    blockedReason: string | null;
    blockedByTaskId: number | null;
    tags: string[];
    gitCommits: GitCommit[];
    deletedAt: Date | null;
    // 새로운 필드들
    isPaused: boolean; // IN_PROGRESS 상태에서 일시정지 여부
    autoReview: boolean; // 자동 REVIEW 수행 여부
    autoReviewed: boolean; // AI 자동 검토 완료 여부 (DONE 상태에 배지 표시용)
    reviewFailed: boolean; // 리뷰 실패 여부 (점수 7점 이하)
    triggerConfig: TaskTriggerConfig | null; // 트리거 설정 (의존성, 시간)
    pausedAt: Date | null; // 일시정지된 시간
    isSubdivided: boolean; // 서브태스크로 세분화된 상태 (세분화시 실행 기능 비활성화)
    subtaskCount: number; // 직접 자식 태스크 수

    // AI 실행 최적화 필드 (인터뷰 기반 자동 생성)
    executionOrder: number | null; // 작업 순서 (1부터 시작)
    dependencies: number[]; // 의존하는 태스크 ID 배열 (triggerConfig와 별도로 명시적 의존성 표시용)
    expectedOutputFormat: string | null; // 예상 결과 형식 (markdown, code, json, text 등)
    recommendedProviders: string[]; // 추천 AI Provider 목록 (우선순위 순)
    requiredMCPs: string[]; // 필요한 MCP 서버 목록 (filesystem, git, brave-search 등)
    aiOptimizedPrompt: string | null; // AI 실행용 최적화된 프롬프트 (generatedPrompt와 별도)
    executionResult: TaskExecutionResult | null; // AI 실행 결과
    outputFormat?: string | null;
    codeLanguage?: string | null;
    imageConfig?: ImageGenerationConfig | null;
}

export interface TaskExecutionResult {
    content?: string;
    cost?: number;
    tokens?: number;
    duration?: number;
    provider?: string;
    model?: string;
    aiResult?: AiResult | null;
    attachments?: TaskAttachment[];
    [key: string]: any;
}

export interface TaskAttachment {
    id: string;
    name: string;
    type: 'image' | 'audio' | 'video' | 'document' | 'data' | 'binary';
    mime: string;
    encoding: 'base64' | 'url' | 'text';
    value: string;
    size?: number;
    description?: string;
    sourceTaskId?: number;
}

export interface TaskExecution extends BaseEntity {
    taskId: number;
    executionNumber: number;
    prompt: string;
    response: string | null;
    context: string | null;
    aiProvider: AIProvider;
    model: string;
    temperature: number | null;
    maxTokens: number | null;
    tokensUsed: TokenUsage | null;
    duration: number | null; // milliseconds
    cost: number | null;
    status: TaskExecutionStatus;
    errorMessage: string | null;
    retryCount: number;
    userFeedback: string | null;
    rating: number | null; // 1-5
    completedAt: Date | null;
}

export interface Comment extends BaseEntity {
    taskId: number;
    userId: number;
    content: string;
    contentType: CommentContentType;
    mentions: number[];
    parentCommentId: number | null;
    reactions: CommentReactions;
    editedAt: Date | null;
    deletedAt: Date | null;
}

export interface TimeEntry extends BaseEntity {
    taskId: number;
    userId: number;
    startTime: Date;
    endTime: Date | null;
    duration: number; // seconds
    description: string | null;
    isManual: boolean;
    isBillable: boolean;
    hourlyRate: number | null;
}

export interface Template extends BaseEntity {
    name: string;
    description: string;
    category: string;
    coverImage: string | null;
    tags: string[];
    projectStructure: ProjectStructure;
    aiProviderRecommendations: Record<AIProvider, AIProviderSettings> | null;
    isPublic: boolean;
    isOfficial: boolean;
    authorId: number;
    usageCount: number;
    rating: number | null;
}

export interface Skill extends BaseEntity, Versioned {
    name: string;
    description: string;
    prompt: string;
    category: string;
    aiProvider: AIProvider | null;
    mcpRequirements: string[];
    inputSchema: Record<string, unknown> | null; // JSON Schema
    outputSchema: Record<string, unknown> | null; // JSON Schema
    isPublic: boolean;
    isOfficial: boolean;
    authorId: number;
    teamId: number | null;
    forkCount: number;
    usageCount: number;
    rating: number | null;
    reviews: SkillReview[];
    changelog: string | null;
}

export interface User extends BaseEntity {
    email: string;
    name: string;
    googleId: string | null;
    avatar: string | null;
    role: UserRole;
    preferences: UserPreferences;
    timezone: string;
    locale: string;
    onboardingCompleted: boolean;
    lastActiveAt: Date | null;
}

export interface Team extends BaseEntity {
    name: string;
    slug: string;
    description: string | null;
    plan: TeamPlan;
    billingInfo: BillingInfo;
    settings: TeamSettings;
}

export interface AIProviderConfig extends BaseEntity {
    userId: number | null;
    teamId: number | null;
    provider: AIProvider;
    apiKey: string; // Encrypted
    endpoint: string | null;
    settings: AIProviderSettings;
    isEnabled: boolean;
    monthlyBudget: number | null;
    currentSpend: number;
    lastTestedAt: Date | null;
    lastError: string | null;
}

export interface MCPIntegration extends BaseEntity {
    name: string;
    description: string;
    endpoint: string;
    configSchema: Record<string, unknown>; // JSON Schema
    isEnabled: boolean;
    isOfficial: boolean;
    installedBy: number;
    installedAt: Date;
    settings: Record<string, unknown>;
    slug?: string;
}

export interface Activity extends BaseEntity {
    projectId: number | null;
    taskId: number | null;
    userId: number;
    type: ActivityType;
    changes: ActivityChanges | null;
    metadata: Record<string, unknown> | null;
}

export interface TaskHistoryEntry {
    id: number;
    taskId: number;
    eventType: TaskHistoryEventType;
    eventData: TaskHistoryEventData | null;
    metadata: TaskHistoryMetadata | null;
    createdAt: Date;
}

export interface Notification extends BaseEntity {
    userId: number;
    type: NotificationType;
    title: string;
    content: string;
    relatedProjectId: number | null;
    relatedTaskId: number | null;
    isRead: boolean;
    readAt: Date | null;
    actionUrl: string | null;
}

export interface Automation extends BaseEntity {
    projectId: number | null;
    name: string;
    description: string | null;
    trigger: AutomationTrigger;
    actions: AutomationAction[];
    isEnabled: boolean;
    lastRunAt: Date | null;
    runCount: number;
    createdBy: number;
}

export interface Webhook extends BaseEntity {
    projectId: number | null;
    name: string;
    url: string;
    events: WebhookEvent[];
    secret: string | null;
    headers: WebhookHeaders | null;
    isEnabled: boolean;
    lastTriggeredAt: Date | null;
    failureCount: number;
}

export interface Integration extends BaseEntity {
    userId: number | null;
    teamId: number | null;
    type: IntegrationType;
    credentials: IntegrationCredentials; // Encrypted
    settings: Record<string, unknown>;
    isEnabled: boolean;
    lastSyncAt: Date | null;
}

export interface SearchIndex extends BaseEntity {
    entityType: EntityType;
    entityId: number;
    content: string;
    metadata: SearchMetadata | null;
}

// ========================================
// Relation Tables
// ========================================

export interface ProjectMember extends BaseEntity {
    projectId: number;
    userId: number;
    role: UserRole;
    joinedAt: Date;
}

export interface TaskWatcher extends BaseEntity {
    taskId: number;
    userId: number;
    notifyOnUpdate: boolean;
}

export interface TeamMember extends BaseEntity {
    teamId: number;
    userId: number;
    role: UserRole;
    permissions: Record<string, boolean>;
    joinedAt: Date;
}

export interface SkillTag extends BaseEntity {
    skillId: number;
    tag: string;
}

export interface TaskSuggestedSkill extends BaseEntity {
    taskId: number;
    skillId: number;
    relevanceScore: number | null;
}

export interface TemplateTask extends BaseEntity {
    templateId: number;
    title: string;
    description: string | null;
    priority: TaskPriority;
    estimatedMinutes: number | null;
    order: number;
    parentTaskOrder: number | null;
    suggestedSkills: string[];
}

// ========================================
// DTOs (Data Transfer Objects)
// ========================================

export interface CreateProjectDTO {
    title: string;
    description?: string;
    mainPrompt?: string;
    status?: ProjectStatus;
    aiProvider?: AIProvider;
    aiModel?: string; // 프로젝트 기본 AI 모델
    mcpConfig?: MCPConfig; // 프로젝트 레벨 MCP 설정
    templateId?: number;
    coverImage?: string;
    color?: string;
    emoji?: string;
    estimatedHours?: number;
    teamId?: number;
    gitRepository?: string;
}

export interface UpdateProjectDTO extends Partial<CreateProjectDTO> {
    isArchived?: boolean;
    isFavorite?: boolean;
    actualHours?: number;
}

export interface CreateTaskDTO {
    projectId: number;
    title: string;
    description?: string;
    generatedPrompt?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    executionType?: ExecutionType;
    aiProvider?: AIProvider;
    aiModel?: string;
    mcpConfig?: MCPConfig;
    parentTaskId?: number;
    assigneeId?: number;
    estimatedMinutes?: number;
    dueDate?: Date;
    tags?: string[];
}

export interface UpdateTaskDTO extends Partial<CreateTaskDTO> {
    order?: number;
    watcherIds?: number[];
    actualMinutes?: number;
    tokenUsage?: TokenUsage;
    actualCost?: number;
    startedAt?: Date;
    completedAt?: Date;
    blockedReason?: string;
    blockedByTaskId?: number;
    gitCommits?: GitCommit[];
}

export interface CreateCommentDTO {
    taskId: number;
    content: string;
    contentType?: CommentContentType;
    mentions?: number[];
    parentCommentId?: number;
}

export interface CreateTimeEntryDTO {
    taskId: number;
    startTime: Date;
    endTime?: Date;
    duration?: number;
    description?: string;
    isManual: boolean;
    isBillable?: boolean;
    hourlyRate?: number;
}

export interface CreateTemplateDTO {
    name: string;
    description: string;
    category: string;
    coverImage?: string;
    tags?: string[];
    projectStructure: ProjectStructure;
    aiProviderRecommendations?: Record<AIProvider, AIProviderSettings>;
    isPublic?: boolean;
}

export interface CreateSkillDTO {
    name: string;
    description: string;
    prompt: string;
    category: string;
    aiProvider?: AIProvider;
    mcpRequirements?: string[];
    inputSchema?: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    isPublic?: boolean;
    teamId?: number;
}
