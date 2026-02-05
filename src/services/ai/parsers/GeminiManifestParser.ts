export interface AgentEvent {
    type: string;
    content?: string;
    tool_name?: string;
    tool_args?: any;
    tool_output?: string;
    decision?: string; // For thought/plan
}

export interface AgentStep {
    id: number;
    type: 'tool_use' | 'thought' | 'unknown';
    name?: string;
    args?: any;
    result?: string;
    status: 'running' | 'completed' | 'failed';
    error?: string;
}

export interface AgentManifest {
    steps: AgentStep[];
    finalResponse: string;
    rawEvents: AgentEvent[];
}

export class GeminiManifestParser {
    static parse(ndjson: string | null): AgentManifest {
        const manifest: AgentManifest = {
            steps: [],
            finalResponse: '',
            rawEvents: [],
        };

        if (!ndjson) return manifest;

        let contentToParse = ndjson;
        // Attempt to unwrap if input is a JSON sequence encoded as a string
        if (contentToParse.trim().startsWith('"')) {
            try {
                const parsed = JSON.parse(contentToParse);
                if (typeof parsed === 'string') {
                    contentToParse = parsed;
                }
            } catch (e) {
                // Ignore, treat as raw text
            }
        }

        const lines = contentToParse.split('\n').filter((l) => l.trim());
        let currentStep: AgentStep | null = null;
        let stepCounter = 1;

        for (const line of lines) {
            try {
                const event = JSON.parse(line);
                manifest.rawEvents.push(event);

                if (event.type === 'message') {
                    if (event.content && event.role !== 'user') {
                        // Check if we can merge into existing running thought step
                        if (
                            currentStep &&
                            currentStep.type === 'thought' &&
                            currentStep.status === 'running'
                        ) {
                            // Merge content
                            // Check for existing args, if it's a string from previous iteration maybe we keep it simple
                            // By convention thought content is in 'args' or a distinct field? AgentStep has 'args'.
                            // Let's store thought content in 'args.thought' or just 'result'?
                            // Wait, AgentViewer usually displays 'args' for tools. For thought, usually it's just text.
                            // Let's use 'args.text' for thought content.
                            if (!currentStep.args) currentStep.args = { text: '' };
                            currentStep.args.text += event.content;
                        } else {
                            // Close previous step if running
                            if (currentStep && currentStep.status === 'running') {
                                currentStep.status = 'completed';
                            }
                            // Start new thought step
                            currentStep = {
                                id: stepCounter++,
                                type: 'thought',
                                name: 'Thinking',
                                args: { text: event.content },
                                status: 'running',
                            };
                            manifest.steps.push(currentStep);
                        }

                        // Also accumulate to finalResponse just in case, but maybe we shouldn't?
                        // If we do, it duplicates the timeline.
                        // Let's stop accumulating finalResponse for every message to fix the "dense blob" issue.
                        // manifest.finalResponse += event.content;
                    }
                } else if (
                    event.type === 'tool_use' ||
                    (event.type === 'item.started' && event.item?.type === 'command_execution')
                ) {
                    // Start a new step
                    if (currentStep && currentStep.status === 'running') {
                        currentStep.status = 'completed';
                    }

                    // Handle Codex 'item.started' format
                    const isCodex = event.type === 'item.started';
                    const toolName = isCodex ? 'command_execution' : event.tool_name;
                    const toolArgs = isCodex
                        ? { command: event.item.command }
                        : event.tool_args || event.parameters;

                    currentStep = {
                        id: stepCounter++,
                        type: 'tool_use',
                        name: toolName,
                        args: toolArgs,
                        status: 'running',
                    };
                    manifest.steps.push(currentStep);
                } else if (
                    event.type === 'tool_result' ||
                    (event.type === 'item.completed' && event.item?.type === 'command_execution')
                ) {
                    // Close the current step if it matches
                    // We assume sequential execution for now
                    if (currentStep) {
                        // Handle Codex 'item.completed' format
                        const isCodex = event.type === 'item.completed';
                        const result = isCodex
                            ? event.item.aggregated_output || 'Completed'
                            : event.content || event.output || JSON.stringify(event);
                        const isError = isCodex ? event.item.exit_code !== 0 : event.is_error;

                        currentStep.result = result;
                        currentStep.status = 'completed';
                        if (isError) {
                            currentStep.status = 'failed';
                            currentStep.error = isCodex
                                ? `Exit Code: ${event.item.exit_code}`
                                : event.content || 'Unknown error';
                        }
                    }
                }
            } catch (e) {
                // Ignore parse errors for partial lines
            }
        }

        // Close last step if needed
        if (currentStep && currentStep.status === 'running') {
            // It might be truly running, or stream ended.
            // We leave it as 'running' or check if manifest is final?
            // For viewer, 'running' is fine.
        }

        return manifest;
    }
}
