import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getAPI } from '../../utils/electron';

export interface MCPExecution {
    id: string;
    tool: string;
    status: 'running' | 'success' | 'failed';
    input?: any;
    output?: any;
    error?: string;
    duration?: string;
    timestamp: Date;
    phase: number;
}

export const useMCPStore = defineStore('mcp', () => {
    // State: Map of "projectId-sequence" -> MCPExecution[]
    const executions = ref<Record<string, MCPExecution[]>>({});

    // Track phases per task
    const phases = ref<Record<string, number>>({});

    const isSubscribed = ref(false);

    // Helpers
    function getTaskKey(projectId: number, sequence: number): string {
        return `${projectId}-${sequence}`;
    }

    function getExecutions(projectId: number, sequence: number): MCPExecution[] {
        const key = getTaskKey(projectId, sequence);
        return executions.value[key] || [];
    }

    // Actions
    function initialize() {
        if (isSubscribed.value) return;

        const api = getAPI();
        if (!api) return;

        // Listen for MCP requests
        api.events.on('ai.mcp_request', (data: any) => {
            if (!data.projectId || !data.projectSequence) return;

            const key = getTaskKey(data.projectId, data.projectSequence);

            if (!executions.value[key]) {
                executions.value[key] = [];
                phases.value[key] = 0;
            }

            // Check if this is a new iteration (phase)
            const taskExecs = executions.value[key];
            const lastExecution = taskExecs[taskExecs.length - 1];

            // Heuristic: If last tool finished successfully and we get a new request,
            // it might be a new step in the chain.
            if (lastExecution && lastExecution.status === 'success') {
                phases.value[key] = (phases.value[key] || 0) + 1;
            }

            const phase = phases.value[key] || 0;

            // Avoid duplicate request logging if ID matches
            if (data.requestId && taskExecs.find((e) => e.id === data.requestId)) return;

            taskExecs.push({
                id: data.requestId || `req-${Date.now()}-${Math.random()}`,
                tool: data.toolName || 'Unknown Tool',
                status: 'running',
                input: data.parameters,
                timestamp: new Date(),
                phase,
            });
        });

        // Listen for MCP responses
        api.events.on('ai.mcp_response', (data: any) => {
            if (!data.projectId || !data.projectSequence) return;

            const key = getTaskKey(data.projectId, data.projectSequence);
            const taskExecs = executions.value[key];
            if (!taskExecs) return;

            // Find matching request
            let execution: MCPExecution | undefined;

            if (data.requestId) {
                execution = taskExecs.find((e) => e.id === data.requestId);
            }

            // Fallback: find last running tool with matching name
            if (!execution) {
                // Search backwards
                for (let i = taskExecs.length - 1; i >= 0; i--) {
                    const exec = taskExecs[i];
                    if (exec && exec.tool === data.toolName && exec.status === 'running') {
                        execution = exec;
                        break;
                    }
                }
            }

            if (execution) {
                execution.status = data.success ? 'success' : 'failed';
                execution.output = data.result;
                execution.error = data.error;
                execution.duration =
                    typeof data.duration === 'number' ? `${data.duration}ms` : undefined;
            } else {
                // If we missed the start, add it as completed
                taskExecs.push({
                    id: data.requestId || `resp-${Date.now()}`,
                    tool: data.toolName || 'Unknown Tool',
                    status: data.success ? 'success' : 'failed',
                    output: data.result,
                    error: data.error,
                    duration: typeof data.duration === 'number' ? `${data.duration}ms` : undefined,
                    timestamp: new Date(),
                    phase: phases.value[key] || 0,
                });
            }
        });

        isSubscribed.value = true;
        console.log('[MCPStore] Initialized global MCP listeners');
    }

    // Clear logs for a task (e.g. when retrying)
    function clearTaskLogs(projectId: number, sequence: number) {
        const key = getTaskKey(projectId, sequence);
        delete executions.value[key];
        delete phases.value[key];
    }

    return {
        executions,
        getExecutions,
        initialize,
        clearTaskLogs,
    };
});
