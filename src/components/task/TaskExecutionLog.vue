<template>
    <div class="task-execution-log">
        <div class="log-header">
            <h3>{{ title }}</h3>
            <div class="actions">
                <button v-if="isExecuting" @click="$emit('stop')" class="stop-btn">
                    <i class="icon-stop"></i> Stop
                </button>
            </div>
        </div>

        <div class="log-stream" ref="streamContainer">
            <!-- Empty State -->
            <div v-if="processedEvents.length === 0 && !isExecuting" class="empty-state">
                <div class="icon">🚀</div>
                <p>Ready to launch agent...</p>
            </div>

            <!-- Event Stream -->
            <div
                v-for="(event, index) in processedEvents"
                :key="index"
                class="log-item"
                :class="event.type"
            >
                <!-- User Message -->
                <div v-if="event.type === 'user'" class="message user-message">
                    <div class="avatar">👤</div>
                    <div class="content">{{ event.content }}</div>
                </div>

                <!-- System/Status Message -->
                <div v-else-if="event.type === 'system'" class="message system-message">
                    <div class="icon">⚙️</div>
                    <div class="content">{{ event.content }}</div>
                </div>

                <!-- Assistant Thought (Expandable) -->
                <div v-else-if="event.type === 'thought'" class="message thought-message">
                    <div class="thought-header" @click="toggleExpand(index)">
                        <span class="icon">💭</span>
                        <span class="summary">Thinking Process</span>
                        <span class="toggle-icon">{{ event.expanded ? '▼' : '▶' }}</span>
                    </div>
                    <div
                        v-if="event.expanded"
                        class="thought-content markdown-body"
                        v-html="renderMarkdown(event.content)"
                    ></div>
                </div>

                <!-- Tool Use -->
                <div v-else-if="event.type === 'tool_use'" class="message tool-use-message">
                    <div class="tool-header">
                        <span class="icon">🛠️</span>
                        <span class="tool-name">{{ event.toolName }}</span>
                    </div>
                    <div class="tool-input code-block">
                        <pre>{{ event.input }}</pre>
                    </div>
                </div>

                <!-- Tool Result -->
                <div v-else-if="event.type === 'tool_result'" class="message tool-result-message">
                    <div class="tool-header">
                        <span class="icon">✅</span>
                        <span class="tool-name">Result: {{ event.toolName }}</span>
                    </div>
                    <div class="tool-output code-block">
                        <pre>{{ event.output }}</pre>
                    </div>
                </div>

                <!-- Curator Update -->
                <div v-else-if="event.type === 'curator'" class="message curator-message">
                    <div class="curator-header">
                        <span class="icon">✨</span>
                        <span class="title">Curator Update</span>
                    </div>
                    <div class="curator-content">
                        <div class="step">{{ event.step }}</div>
                        <div class="detail">{{ event.detail }}</div>
                    </div>
                </div>

                <!-- Assistant Message (Final Answer) -->
                <div v-else-if="event.type === 'assistant'" class="message assistant-message">
                    <div class="avatar">🤖</div>
                    <div class="content markdown-body" v-html="renderMarkdown(event.content)"></div>
                </div>
            </div>

            <!-- Loading Indicator -->
            <div v-if="isExecuting" class="log-item loading">
                <div class="spinner"></div>
                <span>Agent is working...</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { marked } from 'marked';

const props = defineProps<{
    transcript: any[];
    curatorEvents: any[];
    isExecuting: boolean;
    title?: string;
}>();

const emit = defineEmits(['stop']);

const expandedThoughts = ref<Set<number>>(new Set());
const streamContainer = ref<HTMLElement | null>(null);

// Process transcript and curator events into a single timeline
const processedEvents = computed(() => {
    const events: any[] = [];

    // Add transcript items
    props.transcript.forEach((item) => {
        // Determine type based on item structure (Claude Code specific mapping)
        if (item.type === 'user') {
            events.push({ type: 'user', content: item.message, timestamp: item.timestamp });
        } else if (item.type === 'assistant') {
            const msg = item.message;
            // Check for thoughts/chain of thought
            // This logic needs to be adapted to the actual JSON structure of Claude/Agents
            if (msg.content) {
                if (Array.isArray(msg.content)) {
                    msg.content.forEach((block: any) => {
                        if (block.type === 'text') {
                            events.push({
                                type: 'assistant',
                                content: block.text,
                                timestamp: item.timestamp,
                            });
                        } else if (block.type === 'tool_use') {
                            events.push({
                                type: 'tool_use',
                                toolName: block.name,
                                input: JSON.stringify(block.input, null, 2),
                                timestamp: item.timestamp,
                            });
                        }
                    });
                } else if (typeof msg.content === 'string') {
                    events.push({
                        type: 'assistant',
                        content: msg.content,
                        timestamp: item.timestamp,
                    });
                }
            }
        } else if (item.type === 'tool_result') {
            // item might be generic message wrapper
            // We need to parse this better based on actual data
        }
    });

    // Merge curator events
    props.curatorEvents.forEach((evt) => {
        events.push({
            type: 'curator',
            step: evt.step,
            detail: evt.detail,
            timestamp: new Date(), // Curator events might need timestamp in payload
        });
    });

    // Sort by timestamp
    return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
});

function toggleExpand(index: number) {
    if (expandedThoughts.value.has(index)) {
        expandedThoughts.value.delete(index);
    } else {
        expandedThoughts.value.add(index);
    }
}

function renderMarkdown(text: string) {
    // Note: For production use, we should sanitize this HTML
    return marked.parse(text || '') as string;
}

// Auto-scroll logic
watch(
    () => processedEvents.value.length,
    () => {
        nextTick(() => {
            if (streamContainer.value) {
                streamContainer.value.scrollTop = streamContainer.value.scrollHeight;
            }
        });
    }
);
</script>

<style scoped>
.task-execution-log {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-secondary);
    border-radius: 8px;
    overflow: hidden;
}

.log-header {
    padding: 12px 16px;
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.log-stream {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.message {
    padding: 10px;
    border-radius: 8px;
    font-size: 0.9em;
    line-height: 1.5;
    max-width: 90%;
}

.user-message {
    align-self: flex-end;
    background: var(--primary-color-dim);
    color: var(--text-primary);
    display: flex;
    gap: 8px;
}

.assistant-message {
    align-self: flex-start;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    width: 100%;
}

.thought-message {
    background: var(--bg-tertiary);
    border-left: 3px solid var(--text-muted);
    font-style: italic;
    color: var(--text-secondary);
}

.thought-header {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    opacity: 0.8;
}

.tool-use-message {
    background: #1e1e1e;
    border: 1px solid #333;
    font-family: monospace;
    width: 100%;
}

.tool-header {
    color: var(--accent-color);
    margin-bottom: 4px;
}

.curator-message {
    align-self: center;
    background: rgba(100, 255, 218, 0.1);
    border: 1px solid var(--secondary-color);
    text-align: center;
    width: 80%;
}

.curator-header {
    color: var(--secondary-color);
    font-weight: bold;
    margin-bottom: 4px;
}

.code-block {
    background: #111;
    padding: 8px;
    border-radius: 4px;
    overflow-x: auto;
}

.spinner {
    height: 16px;
    width: 16px;
    border: 2px solid var(--primary-color);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}
</style>
