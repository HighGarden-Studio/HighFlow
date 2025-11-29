/**
 * Workflow Repository
 *
 * Data access layer for workflow executions and checkpoints
 */

import { db } from '../client';
import {
  workflowExecutions,
  workflowCheckpoints,
  automationRules,
  type WorkflowExecution,
  type NewWorkflowExecution,
  type WorkflowCheckpoint,
  type NewWorkflowCheckpoint,
  type AutomationRule,
  type NewAutomationRule,
} from '../schema';
import { eq, desc, and, asc, sql, isNull, or } from 'drizzle-orm';

export type WorkflowStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

// ========================================
// Workflow Execution Repository
// ========================================

export class WorkflowExecutionRepository {
  /**
   * Create a new workflow execution
   */
  async create(data: NewWorkflowExecution): Promise<WorkflowExecution> {
    const result = await db
      .insert(workflowExecutions)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!result[0]) {
      throw new Error('Failed to create workflow execution');
    }

    return result[0];
  }

  /**
   * Find workflow execution by ID
   */
  async findById(id: number): Promise<WorkflowExecution | undefined> {
    const result = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.id, id))
      .limit(1);

    return result[0];
  }

  /**
   * Find workflow execution by workflow ID
   */
  async findByWorkflowId(workflowId: string): Promise<WorkflowExecution | undefined> {
    const result = await db
      .select()
      .from(workflowExecutions)
      .where(eq(workflowExecutions.workflowId, workflowId))
      .limit(1);

    return result[0];
  }

  /**
   * Find all workflow executions for a project
   */
  async findByProject(
    projectId: number,
    filters?: {
      status?: WorkflowStatus;
      limit?: number;
    }
  ): Promise<WorkflowExecution[]> {
    const conditions = [eq(workflowExecutions.projectId, projectId)];

    if (filters?.status) {
      conditions.push(eq(workflowExecutions.status, filters.status));
    }

    let query = db
      .select()
      .from(workflowExecutions)
      .where(and(...conditions))
      .orderBy(desc(workflowExecutions.createdAt));

    if (filters?.limit) {
      query = query.limit(filters.limit) as typeof query;
    }

    return await query;
  }

  /**
   * Find active (running or paused) workflow executions
   */
  async findActive(projectId?: number): Promise<WorkflowExecution[]> {
    const conditions = [
      or(
        eq(workflowExecutions.status, 'running'),
        eq(workflowExecutions.status, 'paused'),
        eq(workflowExecutions.status, 'pending')
      ),
    ];

    if (projectId) {
      conditions.push(eq(workflowExecutions.projectId, projectId));
    }

    return await db
      .select()
      .from(workflowExecutions)
      .where(and(...conditions))
      .orderBy(desc(workflowExecutions.startedAt));
  }

  /**
   * Update workflow execution
   */
  async update(id: number, data: Partial<WorkflowExecution>): Promise<WorkflowExecution> {
    const result = await db
      .update(workflowExecutions)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(workflowExecutions.id, id))
      .returning();

    if (!result[0]) {
      throw new Error('Workflow execution not found');
    }

    return result[0];
  }

  /**
   * Update workflow execution by workflow ID
   */
  async updateByWorkflowId(
    workflowId: string,
    data: Partial<WorkflowExecution>
  ): Promise<WorkflowExecution> {
    const result = await db
      .update(workflowExecutions)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(workflowExecutions.workflowId, workflowId))
      .returning();

    if (!result[0]) {
      throw new Error('Workflow execution not found');
    }

    return result[0];
  }

  /**
   * Update workflow status
   */
  async updateStatus(
    workflowId: string,
    status: WorkflowStatus,
    additionalData?: Partial<WorkflowExecution>
  ): Promise<WorkflowExecution> {
    const updateData: Partial<WorkflowExecution> = { status, ...additionalData };

    if (status === 'running' && !additionalData?.startedAt) {
      updateData.startedAt = new Date();
    } else if (status === 'paused') {
      updateData.pausedAt = new Date();
    } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      updateData.completedAt = new Date();
    }

    return await this.updateByWorkflowId(workflowId, updateData);
  }

  /**
   * Update workflow progress
   */
  async updateProgress(
    workflowId: string,
    progress: {
      completedTasks?: number;
      failedTasks?: number;
      currentStage?: number;
      totalCost?: number;
      totalTokens?: number;
    }
  ): Promise<WorkflowExecution> {
    return await this.updateByWorkflowId(workflowId, progress);
  }

  /**
   * Add task result to workflow execution
   */
  async addTaskResult(workflowId: string, taskResult: any): Promise<WorkflowExecution> {
    const execution = await this.findByWorkflowId(workflowId);
    if (!execution) {
      throw new Error('Workflow execution not found');
    }

    const existingResults = (execution.taskResults as any[]) || [];
    const updatedResults = [...existingResults, taskResult];

    return await this.updateByWorkflowId(workflowId, {
      taskResults: updatedResults as any,
    });
  }

  /**
   * Delete workflow execution
   */
  async delete(id: number): Promise<void> {
    await db.delete(workflowExecutions).where(eq(workflowExecutions.id, id));
  }

  /**
   * Get workflow statistics for a project
   */
  async getProjectStats(projectId: number): Promise<{
    total: number;
    completed: number;
    failed: number;
    running: number;
    totalCost: number;
    totalTokens: number;
  }> {
    const result = await db.all<{
      total: number;
      completed: number;
      failed: number;
      running: number;
      totalCost: number;
      totalTokens: number;
    }>(sql`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        COALESCE(SUM(total_cost), 0) as totalCost,
        COALESCE(SUM(total_tokens), 0) as totalTokens
      FROM workflow_executions
      WHERE project_id = ${projectId}
    `);

    return {
      total: Number(result[0]?.total) || 0,
      completed: Number(result[0]?.completed) || 0,
      failed: Number(result[0]?.failed) || 0,
      running: Number(result[0]?.running) || 0,
      totalCost: Number(result[0]?.totalCost) || 0,
      totalTokens: Number(result[0]?.totalTokens) || 0,
    };
  }
}

// ========================================
// Workflow Checkpoint Repository
// ========================================

export class WorkflowCheckpointRepository {
  /**
   * Create a new checkpoint
   */
  async create(data: NewWorkflowCheckpoint): Promise<WorkflowCheckpoint> {
    const result = await db
      .insert(workflowCheckpoints)
      .values({
        ...data,
        createdAt: new Date(),
      })
      .returning();

    if (!result[0]) {
      throw new Error('Failed to create checkpoint');
    }

    return result[0];
  }

  /**
   * Find checkpoint by ID
   */
  async findById(id: number): Promise<WorkflowCheckpoint | undefined> {
    const result = await db
      .select()
      .from(workflowCheckpoints)
      .where(eq(workflowCheckpoints.id, id))
      .limit(1);

    return result[0];
  }

  /**
   * Find checkpoint by checkpoint ID
   */
  async findByCheckpointId(checkpointId: string): Promise<WorkflowCheckpoint | undefined> {
    const result = await db
      .select()
      .from(workflowCheckpoints)
      .where(eq(workflowCheckpoints.checkpointId, checkpointId))
      .limit(1);

    return result[0];
  }

  /**
   * Find all checkpoints for a workflow execution
   */
  async findByWorkflowExecutionId(workflowExecutionId: number): Promise<WorkflowCheckpoint[]> {
    return await db
      .select()
      .from(workflowCheckpoints)
      .where(eq(workflowCheckpoints.workflowExecutionId, workflowExecutionId))
      .orderBy(asc(workflowCheckpoints.stageIndex));
  }

  /**
   * Find all checkpoints for a workflow ID
   */
  async findByWorkflowId(workflowId: string): Promise<WorkflowCheckpoint[]> {
    return await db
      .select()
      .from(workflowCheckpoints)
      .where(eq(workflowCheckpoints.workflowId, workflowId))
      .orderBy(asc(workflowCheckpoints.stageIndex));
  }

  /**
   * Get the latest checkpoint for a workflow
   */
  async getLatest(workflowId: string): Promise<WorkflowCheckpoint | undefined> {
    const result = await db
      .select()
      .from(workflowCheckpoints)
      .where(eq(workflowCheckpoints.workflowId, workflowId))
      .orderBy(desc(workflowCheckpoints.createdAt))
      .limit(1);

    return result[0];
  }

  /**
   * Delete checkpoint
   */
  async delete(id: number): Promise<void> {
    await db.delete(workflowCheckpoints).where(eq(workflowCheckpoints.id, id));
  }

  /**
   * Delete all checkpoints for a workflow
   */
  async deleteByWorkflowId(workflowId: string): Promise<void> {
    await db.delete(workflowCheckpoints).where(eq(workflowCheckpoints.workflowId, workflowId));
  }

  /**
   * Clean up old checkpoints (keep only N latest)
   */
  async cleanup(workflowId: string, keepCount: number = 5): Promise<void> {
    const checkpoints = await this.findByWorkflowId(workflowId);

    if (checkpoints.length > keepCount) {
      const toDelete = checkpoints.slice(0, checkpoints.length - keepCount);
      await Promise.all(toDelete.map((cp) => this.delete(cp.id)));
    }
  }
}

// ========================================
// Automation Rule Repository
// ========================================

export class AutomationRuleRepository {
  /**
   * Create a new automation rule
   */
  async create(data: NewAutomationRule): Promise<AutomationRule> {
    const result = await db
      .insert(automationRules)
      .values({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!result[0]) {
      throw new Error('Failed to create automation rule');
    }

    return result[0];
  }

  /**
   * Find automation rule by ID
   */
  async findById(id: number): Promise<AutomationRule | undefined> {
    const result = await db
      .select()
      .from(automationRules)
      .where(eq(automationRules.id, id))
      .limit(1);

    return result[0];
  }

  /**
   * Find automation rule by rule ID
   */
  async findByRuleId(ruleId: string): Promise<AutomationRule | undefined> {
    const result = await db
      .select()
      .from(automationRules)
      .where(eq(automationRules.ruleId, ruleId))
      .limit(1);

    return result[0];
  }

  /**
   * Find all automation rules
   */
  async findAll(filters?: {
    projectId?: number;
    enabled?: boolean;
  }): Promise<AutomationRule[]> {
    const conditions: any[] = [];

    if (filters?.projectId !== undefined) {
      conditions.push(eq(automationRules.projectId, filters.projectId));
    }

    if (filters?.enabled !== undefined) {
      conditions.push(eq(automationRules.enabled, filters.enabled));
    }

    if (conditions.length === 0) {
      return await db.select().from(automationRules).orderBy(desc(automationRules.createdAt));
    }

    return await db
      .select()
      .from(automationRules)
      .where(and(...conditions))
      .orderBy(desc(automationRules.createdAt));
  }

  /**
   * Find enabled rules for a project (or global rules)
   */
  async findEnabledRules(projectId?: number): Promise<AutomationRule[]> {
    const conditions = [eq(automationRules.enabled, true)];

    if (projectId) {
      conditions.push(
        or(eq(automationRules.projectId, projectId), isNull(automationRules.projectId))!
      );
    }

    return await db
      .select()
      .from(automationRules)
      .where(and(...conditions))
      .orderBy(desc(automationRules.createdAt));
  }

  /**
   * Update automation rule
   */
  async update(id: number, data: Partial<AutomationRule>): Promise<AutomationRule> {
    const result = await db
      .update(automationRules)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(automationRules.id, id))
      .returning();

    if (!result[0]) {
      throw new Error('Automation rule not found');
    }

    return result[0];
  }

  /**
   * Update automation rule by rule ID
   */
  async updateByRuleId(ruleId: string, data: Partial<AutomationRule>): Promise<AutomationRule> {
    const result = await db
      .update(automationRules)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(automationRules.ruleId, ruleId))
      .returning();

    if (!result[0]) {
      throw new Error('Automation rule not found');
    }

    return result[0];
  }

  /**
   * Toggle rule enabled status
   */
  async toggle(ruleId: string): Promise<AutomationRule> {
    const rule = await this.findByRuleId(ruleId);
    if (!rule) {
      throw new Error('Automation rule not found');
    }

    return await this.updateByRuleId(ruleId, { enabled: !rule.enabled });
  }

  /**
   * Increment execution count
   */
  async incrementExecutionCount(ruleId: string): Promise<AutomationRule> {
    const rule = await this.findByRuleId(ruleId);
    if (!rule) {
      throw new Error('Automation rule not found');
    }

    return await this.updateByRuleId(ruleId, {
      executionCount: rule.executionCount + 1,
      lastExecutedAt: new Date(),
    });
  }

  /**
   * Delete automation rule
   */
  async delete(id: number): Promise<void> {
    await db.delete(automationRules).where(eq(automationRules.id, id));
  }

  /**
   * Delete automation rule by rule ID
   */
  async deleteByRuleId(ruleId: string): Promise<void> {
    await db.delete(automationRules).where(eq(automationRules.ruleId, ruleId));
  }
}

// Export singleton instances
export const workflowExecutionRepository = new WorkflowExecutionRepository();
export const workflowCheckpointRepository = new WorkflowCheckpointRepository();
export const automationRuleRepository = new AutomationRuleRepository();
