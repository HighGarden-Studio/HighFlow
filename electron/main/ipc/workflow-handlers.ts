/**
 * Workflow IPC Handlers
 *
 * Handles IPC communication for workflow execution, checkpoints, and automation rules
 */

import { ipcMain, BrowserWindow } from 'electron';
import {
  workflowExecutionRepository,
  workflowCheckpointRepository,
  automationRuleRepository,
  type WorkflowStatus,
} from '../database/repositories/workflow-repository';
import type { WorkflowExecution, AutomationRule } from '../database/schema';

/**
 * Register workflow-related IPC handlers
 */
export function registerWorkflowHandlers(mainWindow: BrowserWindow | null): void {
  // ========================================
  // Workflow Execution Handlers
  // ========================================

  ipcMain.handle(
    'workflow:create',
    async (
      _event,
      data: {
        workflowId: string;
        projectId: number;
        totalTasks: number;
        totalStages: number;
        startedBy: number;
        executionPlan?: any;
        context?: any;
        estimatedDuration?: number;
      }
    ) => {
      try {
        const execution = await workflowExecutionRepository.create({
          workflowId: data.workflowId,
          projectId: data.projectId,
          totalTasks: data.totalTasks,
          totalStages: data.totalStages,
          startedBy: data.startedBy,
          executionPlan: data.executionPlan,
          context: data.context,
          estimatedDuration: data.estimatedDuration,
          status: 'pending',
        });
        mainWindow?.webContents.send('workflow:created', execution);
        return execution;
      } catch (error) {
        console.error('Error creating workflow execution:', error);
        throw error;
      }
    }
  );

  ipcMain.handle('workflow:get', async (_event, workflowId: string) => {
    try {
      return await workflowExecutionRepository.findByWorkflowId(workflowId);
    } catch (error) {
      console.error('Error getting workflow execution:', error);
      throw error;
    }
  });

  ipcMain.handle('workflow:getById', async (_event, id: number) => {
    try {
      return await workflowExecutionRepository.findById(id);
    } catch (error) {
      console.error('Error getting workflow execution by ID:', error);
      throw error;
    }
  });

  ipcMain.handle(
    'workflow:list',
    async (
      _event,
      projectId: number,
      filters?: {
        status?: WorkflowStatus;
        limit?: number;
      }
    ) => {
      try {
        return await workflowExecutionRepository.findByProject(projectId, filters);
      } catch (error) {
        console.error('Error listing workflow executions:', error);
        throw error;
      }
    }
  );

  ipcMain.handle('workflow:listActive', async (_event, projectId?: number) => {
    try {
      return await workflowExecutionRepository.findActive(projectId);
    } catch (error) {
      console.error('Error listing active workflows:', error);
      throw error;
    }
  });

  ipcMain.handle(
    'workflow:updateStatus',
    async (
      _event,
      workflowId: string,
      status: WorkflowStatus,
      additionalData?: Partial<WorkflowExecution>
    ) => {
      try {
        const execution = await workflowExecutionRepository.updateStatus(
          workflowId,
          status,
          additionalData
        );
        mainWindow?.webContents.send('workflow:status-changed', {
          workflowId,
          status,
          execution,
        });
        return execution;
      } catch (error) {
        console.error('Error updating workflow status:', error);
        throw error;
      }
    }
  );

  ipcMain.handle(
    'workflow:updateProgress',
    async (
      _event,
      workflowId: string,
      progress: {
        completedTasks?: number;
        failedTasks?: number;
        currentStage?: number;
        totalCost?: number;
        totalTokens?: number;
      }
    ) => {
      try {
        const execution = await workflowExecutionRepository.updateProgress(workflowId, progress);
        mainWindow?.webContents.send('workflow:progress', {
          workflowId,
          progress,
          execution,
        });
        return execution;
      } catch (error) {
        console.error('Error updating workflow progress:', error);
        throw error;
      }
    }
  );

  ipcMain.handle('workflow:addTaskResult', async (_event, workflowId: string, taskResult: any) => {
    try {
      const execution = await workflowExecutionRepository.addTaskResult(workflowId, taskResult);
      mainWindow?.webContents.send('workflow:task-completed', {
        workflowId,
        taskResult,
      });
      return execution;
    } catch (error) {
      console.error('Error adding task result:', error);
      throw error;
    }
  });

  ipcMain.handle('workflow:delete', async (_event, id: number) => {
    try {
      await workflowExecutionRepository.delete(id);
      mainWindow?.webContents.send('workflow:deleted', id);
    } catch (error) {
      console.error('Error deleting workflow execution:', error);
      throw error;
    }
  });

  ipcMain.handle('workflow:stats', async (_event, projectId: number) => {
    try {
      return await workflowExecutionRepository.getProjectStats(projectId);
    } catch (error) {
      console.error('Error getting workflow stats:', error);
      throw error;
    }
  });

  // ========================================
  // Checkpoint Handlers
  // ========================================

  ipcMain.handle(
    'checkpoint:create',
    async (
      _event,
      data: {
        checkpointId: string;
        workflowExecutionId: number;
        workflowId: string;
        stageIndex: number;
        completedTaskIds: number[];
        context: any;
        metadata?: any;
      }
    ) => {
      try {
        const checkpoint = await workflowCheckpointRepository.create({
          checkpointId: data.checkpointId,
          workflowExecutionId: data.workflowExecutionId,
          workflowId: data.workflowId,
          stageIndex: data.stageIndex,
          completedTaskIds: data.completedTaskIds,
          context: data.context,
          metadata: data.metadata,
        });
        mainWindow?.webContents.send('checkpoint:created', checkpoint);
        return checkpoint;
      } catch (error) {
        console.error('Error creating checkpoint:', error);
        throw error;
      }
    }
  );

  ipcMain.handle('checkpoint:get', async (_event, checkpointId: string) => {
    try {
      return await workflowCheckpointRepository.findByCheckpointId(checkpointId);
    } catch (error) {
      console.error('Error getting checkpoint:', error);
      throw error;
    }
  });

  ipcMain.handle('checkpoint:getLatest', async (_event, workflowId: string) => {
    try {
      return await workflowCheckpointRepository.getLatest(workflowId);
    } catch (error) {
      console.error('Error getting latest checkpoint:', error);
      throw error;
    }
  });

  ipcMain.handle('checkpoint:list', async (_event, workflowId: string) => {
    try {
      return await workflowCheckpointRepository.findByWorkflowId(workflowId);
    } catch (error) {
      console.error('Error listing checkpoints:', error);
      throw error;
    }
  });

  ipcMain.handle('checkpoint:delete', async (_event, id: number) => {
    try {
      await workflowCheckpointRepository.delete(id);
      mainWindow?.webContents.send('checkpoint:deleted', id);
    } catch (error) {
      console.error('Error deleting checkpoint:', error);
      throw error;
    }
  });

  ipcMain.handle('checkpoint:cleanup', async (_event, workflowId: string, keepCount?: number) => {
    try {
      await workflowCheckpointRepository.cleanup(workflowId, keepCount);
    } catch (error) {
      console.error('Error cleaning up checkpoints:', error);
      throw error;
    }
  });

  // ========================================
  // Automation Rule Handlers
  // ========================================

  ipcMain.handle(
    'automationRule:create',
    async (
      _event,
      data: {
        ruleId: string;
        name: string;
        description?: string;
        projectId?: number;
        enabled?: boolean;
        trigger: any;
        conditions?: any[];
        actions: any[];
        createdBy: number;
      }
    ) => {
      try {
        const rule = await automationRuleRepository.create({
          ruleId: data.ruleId,
          name: data.name,
          description: data.description,
          projectId: data.projectId,
          enabled: data.enabled ?? true,
          trigger: data.trigger,
          conditions: data.conditions || [],
          actions: data.actions,
          createdBy: data.createdBy,
        });
        mainWindow?.webContents.send('automationRule:created', rule);
        return rule;
      } catch (error) {
        console.error('Error creating automation rule:', error);
        throw error;
      }
    }
  );

  ipcMain.handle('automationRule:get', async (_event, ruleId: string) => {
    try {
      return await automationRuleRepository.findByRuleId(ruleId);
    } catch (error) {
      console.error('Error getting automation rule:', error);
      throw error;
    }
  });

  ipcMain.handle(
    'automationRule:list',
    async (
      _event,
      filters?: {
        projectId?: number;
        enabled?: boolean;
      }
    ) => {
      try {
        return await automationRuleRepository.findAll(filters);
      } catch (error) {
        console.error('Error listing automation rules:', error);
        throw error;
      }
    }
  );

  ipcMain.handle('automationRule:listEnabled', async (_event, projectId?: number) => {
    try {
      return await automationRuleRepository.findEnabledRules(projectId);
    } catch (error) {
      console.error('Error listing enabled automation rules:', error);
      throw error;
    }
  });

  ipcMain.handle(
    'automationRule:update',
    async (_event, ruleId: string, data: Partial<AutomationRule>) => {
      try {
        const rule = await automationRuleRepository.updateByRuleId(ruleId, data);
        mainWindow?.webContents.send('automationRule:updated', rule);
        return rule;
      } catch (error) {
        console.error('Error updating automation rule:', error);
        throw error;
      }
    }
  );

  ipcMain.handle('automationRule:toggle', async (_event, ruleId: string) => {
    try {
      const rule = await automationRuleRepository.toggle(ruleId);
      mainWindow?.webContents.send('automationRule:toggled', rule);
      return rule;
    } catch (error) {
      console.error('Error toggling automation rule:', error);
      throw error;
    }
  });

  ipcMain.handle('automationRule:incrementExecution', async (_event, ruleId: string) => {
    try {
      return await automationRuleRepository.incrementExecutionCount(ruleId);
    } catch (error) {
      console.error('Error incrementing automation rule execution count:', error);
      throw error;
    }
  });

  ipcMain.handle('automationRule:delete', async (_event, ruleId: string) => {
    try {
      await automationRuleRepository.deleteByRuleId(ruleId);
      mainWindow?.webContents.send('automationRule:deleted', ruleId);
    } catch (error) {
      console.error('Error deleting automation rule:', error);
      throw error;
    }
  });

  console.log('Workflow IPC handlers registered');
}
