import type {
  AutomationRule,
  Trigger,
  Condition,
  Action,
  Event,
  ActionResult,
  ExecutionContext,
} from '../workflow/types';
import { AdvancedTaskExecutor } from '../workflow/AdvancedTaskExecutor';
import {
  eventBus,
  type TaskStatusChangedEvent,
  type TaskAssignedEvent,
  type TaskCreatedEvent,
  type CommentCreatedEvent,
  type WebhookReceivedEvent,
  type CostExceededEvent,
} from '../events/EventBus';
import type { AIProvider } from '@core/types/database';

export class AutomationEngine {
  private rules: Map<string, AutomationRule> = new Map();
  private eventListeners: Map<string, Set<string>> = new Map(); // eventType -> ruleIds
  private executor: AdvancedTaskExecutor;
  private eventUnsubscribers: Array<() => void> = [];

  constructor() {
    this.executor = new AdvancedTaskExecutor();
    this.setupEventListeners();
  }

  /**
   * 자동화 규칙 등록
   */
  registerTrigger(
    trigger: Trigger,
    conditions: Condition[],
    actions: Action[],
    options: {
      name?: string;
      description?: string;
      projectId?: number;
      createdBy: number;
    }
  ): string {
    const ruleId = `rule-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const rule: AutomationRule = {
      id: ruleId,
      name: options.name || `Rule ${ruleId}`,
      description: options.description,
      enabled: true,
      trigger,
      conditions,
      actions,
      projectId: options.projectId,
      createdBy: options.createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
      executionCount: 0,
    };

    this.rules.set(ruleId, rule);

    // 트리거 타입별 이벤트 리스너 등록
    const eventType = this.getEventTypeFromTrigger(trigger);
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(ruleId);

    console.log(`Automation rule registered: ${ruleId} for ${eventType}`);
    return ruleId;
  }

  /**
   * 규칙 비활성화
   */
  disableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = false;
      rule.updatedAt = new Date();
      console.log(`Rule ${ruleId} disabled`);
    }
  }

  /**
   * 규칙 활성화
   */
  enableRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = true;
      rule.updatedAt = new Date();
      console.log(`Rule ${ruleId} enabled`);
    }
  }

  /**
   * 규칙 삭제
   */
  deleteRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      const eventType = this.getEventTypeFromTrigger(rule.trigger);
      this.eventListeners.get(eventType)?.delete(ruleId);
      this.rules.delete(ruleId);
      console.log(`Rule ${ruleId} deleted`);
    }
  }

  /**
   * 트리거 실행 (이벤트 발생 시 호출)
   */
  async executeTrigger(triggerId: string, event: Event): Promise<void> {
    const rule = this.rules.get(triggerId);
    if (!rule || !rule.enabled) {
      return;
    }

    try {
      // 조건 평가
      const conditionsMet = await this.evaluateConditions(rule.conditions, event);
      if (!conditionsMet) {
        console.log(`Rule ${triggerId} conditions not met`);
        return;
      }

      console.log(`Rule ${triggerId} conditions met, executing actions...`);

      // 액션 실행
      const results = await this.executeActions(rule.actions, event);

      // 통계 업데이트
      rule.executionCount++;
      rule.lastExecutedAt = new Date();

      console.log(`Rule ${triggerId} executed successfully:`, {
        successCount: results.filter(r => r.status === 'success').length,
        failureCount: results.filter(r => r.status === 'failure').length,
      });
    } catch (error) {
      console.error(`Error executing rule ${triggerId}:`, error);
    }
  }

  /**
   * 조건 평가
   */
  async evaluateConditions(conditions: Condition[], context: any): Promise<boolean> {
    if (conditions.length === 0) return true;

    // 모든 조건을 평가
    const results = await Promise.all(
      conditions.map(condition => this.evaluateSingleCondition(condition, context))
    );

    // 기본적으로 AND 로직
    return results.every(r => r === true);
  }

  /**
   * 단일 조건 평가
   */
  private async evaluateSingleCondition(condition: Condition, context: any): Promise<boolean> {
    // 중첩 조건 처리
    if (condition.children && condition.children.length > 0) {
      const childResults = await Promise.all(
        condition.children.map(c => this.evaluateSingleCondition(c, context))
      );

      if (condition.logic === 'OR') {
        return childResults.some(r => r === true);
      } else {
        return childResults.every(r => r === true);
      }
    }

    // 값 추출
    let leftValue: any;
    switch (condition.type) {
      case 'task_status':
        leftValue = context.payload?.task?.status;
        break;
      case 'variable':
        leftValue = context.payload?.[condition.field || ''];
        break;
      case 'cost':
        leftValue = context.payload?.cost || 0;
        break;
      case 'time':
        leftValue = Date.now() - new Date(context.timestamp).getTime();
        break;
      case 'custom':
        return true; // 커스텀 로직
      default:
        return false;
    }

    // 연산자 평가
    return this.evaluateOperator(leftValue, condition.operator, condition.value);
  }

  /**
   * 연산자 평가
   */
  private evaluateOperator(left: any, operator: string, right: any): boolean {
    switch (operator) {
      case '==':
        return left === right;
      case '!=':
        return left !== right;
      case '>':
        return left > right;
      case '<':
        return left < right;
      case '>=':
        return left >= right;
      case '<=':
        return left <= right;
      case 'contains':
        return String(left).includes(String(right));
      case 'matches':
        return new RegExp(String(right)).test(String(left));
      default:
        return false;
    }
  }

  /**
   * 액션 실행
   */
  async executeActions(actions: Action[], context: Event): Promise<ActionResult[]> {
    const results: ActionResult[] = [];

    for (const action of actions) {
      try {
        const result = await this.executeSingleAction(action, context);
        results.push(result);
      } catch (error) {
        results.push({
          action,
          status: 'failure',
          error: error instanceof Error ? error : new Error(String(error)),
          timestamp: new Date(),
        });
      }
    }

    return results;
  }

  /**
   * 단일 액션 실행
   */
  private async executeSingleAction(action: Action, context: Event): Promise<ActionResult> {
    const timestamp = new Date();

    try {
      let output: any;

      switch (action.type) {
        case 'task.create':
          output = await this.actionCreateTask(action, context);
          break;

        case 'task.update':
          output = await this.actionUpdateTask(action, context);
          break;

        case 'task.execute':
          output = await this.actionExecuteTask(action, context);
          break;

        case 'notification.send':
          output = await this.actionSendNotification(action, context);
          break;

        case 'webhook.call':
          output = await this.actionCallWebhook(action, context);
          break;

        case 'ai.execute':
          output = await this.actionExecuteAI(action, context);
          break;

        case 'integration.slack':
          output = await this.actionSlackIntegration(action, context);
          break;

        case 'workflow.start':
          output = await this.actionStartWorkflow(action, context);
          break;

        case 'workflow.stop':
          output = await this.actionStopWorkflow(action, context);
          break;

        case 'variable.set':
          output = await this.actionSetVariable(action, context);
          break;

        case 'delay':
          output = await this.actionDelay(action);
          break;

        default:
          throw new Error(`Unknown action type: ${(action as any).type}`);
      }

      return {
        action,
        status: 'success',
        output,
        timestamp,
      };
    } catch (error) {
      return {
        action,
        status: 'failure',
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp,
      };
    }
  }

  /**
   * Task 생성 액션
   */
  private async actionCreateTask(action: Extract<Action, { type: 'task.create' }>, _context: Event): Promise<any> {
    console.log('[AutomationEngine] Creating task:', action.template);

    const template = action.template;
    if (!template.projectId) {
      throw new Error('projectId is required for task creation');
    }

    // Electron IPC를 통한 실제 DB 작업
    if (typeof window !== 'undefined' && window.electron?.tasks) {
      const task = await window.electron.tasks.create({
        projectId: template.projectId,
        title: template.title || 'Automated Task',
        description: template.description,
        priority: template.priority || 'medium',
      });

      console.log('[AutomationEngine] Task created:', task.id);
      return { taskId: task.id, created: true, task };
    }

    // Fallback for non-electron environment
    console.warn('[AutomationEngine] Electron API not available, task creation skipped');
    return { taskId: Date.now(), created: false, simulated: true };
  }

  /**
   * Task 업데이트 액션
   */
  private async actionUpdateTask(action: Extract<Action, { type: 'task.update' }>, _context: Event): Promise<any> {
    console.log(`[AutomationEngine] Updating task ${action.taskId}:`, action.changes);

    // Electron IPC를 통한 실제 DB 작업
    if (typeof window !== 'undefined' && window.electron?.tasks) {
      const allowedChanges: Partial<{
        title: string;
        description: string;
        status: string;
        priority: string;
      }> = {};

      if (typeof action.changes.title === 'string') {
        allowedChanges.title = action.changes.title;
      }
      if (typeof action.changes.description === 'string') {
        allowedChanges.description = action.changes.description;
      }
      if (typeof action.changes.status === 'string') {
        allowedChanges.status = action.changes.status;
      }
      if (typeof action.changes.priority === 'string') {
        allowedChanges.priority = action.changes.priority;
      }

      const task = await window.electron.tasks.update(action.taskId, allowedChanges);

      console.log('[AutomationEngine] Task updated:', task.id);
      return { taskId: task.id, updated: true, task };
    }

    // Fallback for non-electron environment
    console.warn('[AutomationEngine] Electron API not available, task update skipped');
    return { taskId: action.taskId, updated: false, simulated: true };
  }

  /**
   * Task 실행 액션
   */
  private async actionExecuteTask(action: Extract<Action, { type: 'task.execute' }>, _context: Event): Promise<any> {
    console.log(`[AutomationEngine] Executing task ${action.taskId}`);

    // Get task first
    if (typeof window !== 'undefined' && window.electron?.tasks) {
      const task = await window.electron.tasks.get(action.taskId);

      if (!task) {
        throw new Error(`Task ${action.taskId} not found`);
      }

      const executionContext: ExecutionContext = {
        userId: 1,
        taskId: task.id,
        projectId: task.projectId,
        metadata: {
          source: 'automation',
          ruleId: action.type,
        },
      };

      const result = await this.executor.executeTask(
        task as any,
        executionContext,
        action.options || {}
      );

      return { taskId: action.taskId, executed: true, result };
    }

    // Fallback
    console.warn('[AutomationEngine] Electron API not available, task execution skipped');
    return { taskId: action.taskId, executed: false, simulated: true };
  }

  /**
   * 알림 전송 액션
   */
  private async actionSendNotification(action: Extract<Action, { type: 'notification.send' }>, _context: Event): Promise<any> {
    console.log(`[AutomationEngine] Sending notification to user ${action.userId} via ${action.channel}:`, action.message);

    // 알림 이벤트 발생
    eventBus.emit(
      'system.error' as any, // Using system event for now, should have dedicated notification event
      {
        error: `Notification: ${action.message}`,
        context: {
          userId: action.userId,
          channel: action.channel,
          type: 'notification',
        },
      },
      'automation-engine'
    );

    // Browser notification (if permitted)
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification('Workflow Automation', {
          body: action.message,
          icon: '/icon.png',
        });
      } else if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification('Workflow Automation', {
            body: action.message,
            icon: '/icon.png',
          });
        }
      }
    }

    return { sent: true, channel: action.channel, message: action.message };
  }

  /**
   * Webhook 호출 액션
   */
  private async actionCallWebhook(action: Extract<Action, { type: 'webhook.call' }>, _context: Event): Promise<any> {
    console.log(`[AutomationEngine] Calling webhook: ${action.method} ${action.url}`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...action.headers,
    };

    // Add secret signature if provided
    if (action.secret && action.payload) {
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(action.payload));
      // Note: Web Crypto API for HMAC signing
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(action.secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, data);
      const signatureHex = Array.from(new Uint8Array(signature))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      headers['X-Signature-256'] = `sha256=${signatureHex}`;
    }

    try {
      const response = await fetch(action.url, {
        method: action.method,
        headers,
        body: action.payload ? JSON.stringify(action.payload) : undefined,
      });

      let data: any;
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      console.log(`[AutomationEngine] Webhook response: ${response.status}`);

      return {
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        data,
      };
    } catch (error) {
      console.error('[AutomationEngine] Webhook call failed:', error);
      throw new Error(`Webhook call failed: ${error}`);
    }
  }

  /**
   * AI 실행 액션
   */
  private async actionExecuteAI(action: Extract<Action, { type: 'ai.execute' }>, _context: Event): Promise<any> {
    console.log(`[AutomationEngine] Executing AI task ${action.taskId} with provider ${action.provider || 'default'}`);

    // Get task and execute via executor
    if (typeof window !== 'undefined' && window.electron?.tasks) {
      const task = await window.electron.tasks.get(action.taskId);

      if (!task) {
        throw new Error(`Task ${action.taskId} not found`);
      }

      const executionContext: ExecutionContext = {
        userId: 1,
        taskId: task.id,
        projectId: task.projectId,
        metadata: {
          source: 'automation',
          preferredProvider: action.provider,
        },
      };

      const result = await this.executor.executeTask(task as any, executionContext, {
        fallbackProviders: action.provider
          ? ([action.provider] as AIProvider[])
          : undefined,
        streaming: false,
      });

      return {
        taskId: action.taskId,
        aiExecuted: true,
        provider: action.provider || 'default',
        result,
      };
    }

    // Fallback
    console.warn('[AutomationEngine] Electron API not available, AI execution skipped');
    return { taskId: action.taskId, aiExecuted: false, simulated: true };
  }

  /**
   * Slack 통합 액션
   */
  private async actionSlackIntegration(action: Extract<Action, { type: 'integration.slack' }>, _context: Event): Promise<any> {
    console.log(`[AutomationEngine] Sending Slack message to ${action.channel}:`, action.message);

    // Slack Incoming Webhook URL이 설정되어 있다면 사용
    const slackWebhookUrl = action.webhookUrl || process.env.SLACK_WEBHOOK_URL;

    if (slackWebhookUrl) {
      try {
        const response = await fetch(slackWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: action.channel,
            text: action.message,
            username: 'Workflow Bot',
            icon_emoji: ':robot_face:',
          }),
        });

        return {
          sent: response.ok,
          channel: action.channel,
          status: response.status,
        };
      } catch (error) {
        console.error('[AutomationEngine] Slack message failed:', error);
        throw new Error(`Slack integration failed: ${error}`);
      }
    }

    // Fallback - log only
    console.warn('[AutomationEngine] Slack webhook URL not configured');
    return { sent: false, channel: action.channel, reason: 'Webhook URL not configured' };
  }

  /**
   * 워크플로우 시작 액션
   */
  private async actionStartWorkflow(action: Extract<Action, { type: 'workflow.start' }>, _context: Event): Promise<any> {
    console.log(`[AutomationEngine] Starting workflow ${action.workflowId}`);

    // Resume from checkpoint if available, or start new
    if (typeof window !== 'undefined' && window.electron?.workflow) {
      const existingWorkflow = await window.electron.workflow.get(action.workflowId);
      const workflowStatus =
        (existingWorkflow as { status?: string } | null | undefined)?.status;

      if (workflowStatus === 'paused') {
        // Resume paused workflow
        await this.executor.resumeWorkflow(action.workflowId);
        return { workflowId: action.workflowId, started: true, resumed: true };
      }
    }

    // For new workflow, the caller should have already created the workflow execution
    return { workflowId: action.workflowId, started: true, resumed: false };
  }

  /**
   * 워크플로우 중지 액션
   */
  private async actionStopWorkflow(action: Extract<Action, { type: 'workflow.stop' }>, _context: Event): Promise<any> {
    console.log(`[AutomationEngine] Stopping workflow ${action.workflowId}`);
    await this.executor.cancelWorkflow(action.workflowId);

    // Update database status
    if (typeof window !== 'undefined' && window.electron?.workflow) {
      await window.electron.workflow.updateStatus(action.workflowId, 'cancelled');
    }

    return { workflowId: action.workflowId, stopped: true };
  }

  /**
   * 변수 설정 액션
   */
  private async actionSetVariable(action: Extract<Action, { type: 'variable.set' }>, _context: Event): Promise<any> {
    console.log(`[AutomationEngine] Setting variable ${action.name} = ${action.value}`);

    // Store in session storage for persistence across the session
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const automationVars = JSON.parse(
        window.sessionStorage.getItem('automation_variables') || '{}'
      );
      automationVars[action.name] = action.value;
      window.sessionStorage.setItem('automation_variables', JSON.stringify(automationVars));
    }

    return { name: action.name, value: action.value, set: true };
  }

  /**
   * 지연 액션
   */
  private async actionDelay(action: Extract<Action, { type: 'delay' }>): Promise<any> {
    console.log(`[AutomationEngine] Delaying for ${action.duration}ms`);
    await new Promise((resolve) => setTimeout(resolve, action.duration));
    return { delayed: action.duration };
  }

  /**
   * 이벤트 처리 (외부에서 호출)
   */
  async handleEvent(event: Event): Promise<void> {
    const eventType = event.type;
    const ruleIds = this.eventListeners.get(eventType);

    if (!ruleIds || ruleIds.size === 0) {
      return; // 해당 이벤트 타입에 대한 규칙 없음
    }

    // 모든 매칭되는 규칙 실행
    const executions = Array.from(ruleIds).map(ruleId =>
      this.executeTrigger(ruleId, event)
    );

    await Promise.all(executions);
  }

  /**
   * 트리거에서 이벤트 타입 추출
   */
  private getEventTypeFromTrigger(trigger: Trigger): string {
    return trigger.type;
  }

  /**
   * 이벤트 리스너 설정 (EventBus 연동)
   */
  private setupEventListeners(): void {
    // Task status changed
    this.eventUnsubscribers.push(
      eventBus.on<TaskStatusChangedEvent>('task.status_changed', async (event) => {
        await this.handleEventBusEvent({
          id: event.id,
          type: 'task.status_changed',
          payload: {
            ...event.payload,
            from: event.payload.previousStatus,
            to: event.payload.newStatus,
          },
          timestamp: event.timestamp,
          metadata: event.metadata || {},
        });
      })
    );

    // Task assigned
    this.eventUnsubscribers.push(
      eventBus.on<TaskAssignedEvent>('task.assigned', async (event) => {
        await this.handleEventBusEvent({
          id: event.id,
          type: 'task.assigned',
          payload: {
            ...event.payload,
            userId: String(event.payload.newAssignee),
          },
          timestamp: event.timestamp,
          metadata: event.metadata || {},
        });
      })
    );

    // Task created
    this.eventUnsubscribers.push(
      eventBus.on<TaskCreatedEvent>('task.created', async (event) => {
        await this.handleEventBusEvent({
          id: event.id,
          type: 'task.created',
          payload: event.payload,
          timestamp: event.timestamp,
          metadata: event.metadata || {},
        });
      })
    );

    // Comment created
    this.eventUnsubscribers.push(
      eventBus.on<CommentCreatedEvent>('comment.created', async (event) => {
        await this.handleEventBusEvent({
          id: event.id,
          type: 'comment.created',
          payload: {
            ...event.payload,
            mentions: event.payload.mentions.map(String),
          },
          timestamp: event.timestamp,
          metadata: event.metadata || {},
        });
      })
    );

    // Webhook received
    this.eventUnsubscribers.push(
      eventBus.on<WebhookReceivedEvent>('webhook.received', async (event) => {
        await this.handleEventBusEvent({
          id: event.id,
          type: 'webhook.received',
          payload: {
            webhookId: event.payload.webhookId,
            data: event.payload.body,
          },
          timestamp: event.timestamp,
          metadata: event.metadata || {},
        });
      })
    );

    // Cost exceeded
    this.eventUnsubscribers.push(
      eventBus.on<CostExceededEvent>('cost.exceeded', async (event) => {
        await this.handleEventBusEvent({
          id: event.id,
          type: 'cost.exceeded',
          payload: event.payload,
          timestamp: event.timestamp,
          metadata: event.metadata || {},
        });
      })
    );

    console.log('[AutomationEngine] Event listeners connected to EventBus');
  }

  /**
   * EventBus 이벤트 처리
   */
  private async handleEventBusEvent(event: Event): Promise<void> {
    const eventType = event.type;
    const ruleIds = this.eventListeners.get(eventType);

    if (!ruleIds || ruleIds.size === 0) {
      return;
    }

    console.log(`[AutomationEngine] Processing event: ${eventType} for ${ruleIds.size} rules`);

    // 모든 매칭되는 규칙 실행
    const executions = Array.from(ruleIds).map(ruleId =>
      this.executeTrigger(ruleId, event)
    );

    await Promise.all(executions);
  }

  /**
   * 이벤트 리스너 정리
   */
  destroy(): void {
    this.eventUnsubscribers.forEach(unsubscribe => unsubscribe());
    this.eventUnsubscribers = [];
    this.rules.clear();
    this.eventListeners.clear();
    console.log('[AutomationEngine] Destroyed');
  }

  /**
   * 모든 규칙 조회
   */
  getAllRules(): AutomationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 특정 규칙 조회
   */
  getRule(ruleId: string): AutomationRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * 프로젝트별 규칙 조회
   */
  getRulesByProject(projectId: number): AutomationRule[] {
    return Array.from(this.rules.values()).filter(rule =>
      rule.projectId === projectId || rule.projectId === undefined
    );
  }

  /**
   * 통계 조회
   */
  getStatistics(): {
    totalRules: number;
    enabledRules: number;
    totalExecutions: number;
    rulesByTriggerType: Record<string, number>;
  } {
    const rules = Array.from(this.rules.values());

    const rulesByTriggerType = rules.reduce((acc, rule) => {
      const triggerType = rule.trigger.type;
      acc[triggerType] = (acc[triggerType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalRules: rules.length,
      enabledRules: rules.filter(r => r.enabled).length,
      totalExecutions: rules.reduce((sum, r) => sum + r.executionCount, 0),
      rulesByTriggerType,
    };
  }
}

// 글로벌 인스턴스 (싱글톤)
export const automationEngine = new AutomationEngine();
