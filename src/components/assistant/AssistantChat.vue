<script setup lang="ts">
/**
 * AI Assistant Chat Component
 *
 * Floating chat interface for AI assistant
 * - Chat-style conversation
 * - Streaming responses
 * - Action buttons
 * - Context awareness
 */

import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
    aiAssistant,
    type AssistantAction,
    type ConversationMessage,
    type Suggestion,
} from '../../services/assistant/AIAssistant';
import { type EnhancedExecutionPlan } from '../../services/ai/AIInterviewService';
import { useTaskStore } from '../../renderer/stores/taskStore';
import ExecutionPlanPreview from './ExecutionPlanPreview.vue';

// ========================================
// Props & Emits
// ========================================

const props = defineProps<{
    open: boolean;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'action', action: AssistantAction): void;
    (e: 'navigate', path: string): void;
}>();

const router = useRouter();
const route = useRoute();
const taskStore = useTaskStore();
const { t } = useI18n();

// ========================================
// State
// ========================================

const inputMessage = ref('');
const messages = ref<ConversationMessage[]>([]);
const suggestions = ref<Suggestion[]>([]);
const loading = ref(false);
const streaming = ref(false);
const currentResponse = ref('');
const chatContainerRef = ref<HTMLDivElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const showSuggestions = ref(true);

// Interview session tracking
// const currentInterviewSessionId = ref<string | null>(null);
// const interviewCompleted = ref(false);
// const generatingPlan = ref(false);
const executionPlan = ref<EnhancedExecutionPlan | null>(null);
const showPlanPreview = ref(false);
const creatingTasks = ref(false);

// ========================================
// Computed
// ========================================

const currentContext = computed(() => {
    const path = route.path;
    let currentView: 'projects' | 'board' | 'task' | 'settings' | 'dashboard' = 'projects';
    let currentProjectId: number | undefined;
    let currentTaskId: number | undefined;

    if (path.includes('/projects/') && path.includes('/board')) {
        currentView = 'board';
        const match = path.match(/\/projects\/(\d+)/);
        if (match && match[1]) currentProjectId = parseInt(match[1]);
    } else if (path.includes('/task/')) {
        currentView = 'task';
        const taskMatch = path.match(/\/task\/(\d+)/);
        if (taskMatch && taskMatch[1]) currentTaskId = parseInt(taskMatch[1]);
    } else if (path.includes('/dashboard')) {
        currentView = 'dashboard';
    } else if (path.includes('/settings')) {
        currentView = 'settings';
    }

    return {
        currentView,
        currentProjectId,
        currentTaskId,
    };
});

// Quick action buttons
const quickActions = computed(() => [
    { id: 'summary', label: t('assistant.quick_actions.summary'), icon: '📊' },
    { id: 'recommend', label: t('assistant.quick_actions.recommend'), icon: '🎯' },
    { id: 'deadline', label: t('assistant.quick_actions.deadline'), icon: '⏰' },
    { id: 'help', label: t('assistant.quick_actions.help'), icon: '❓' },
]);

// ========================================
// Methods
// ========================================

async function sendMessage() {
    const message = inputMessage.value.trim();
    if (!message || loading.value) return;

    inputMessage.value = '';
    showSuggestions.value = false;

    // Add user message
    messages.value.push({
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: new Date(),
    });

    await scrollToBottom();
    loading.value = true;

    try {
        // Simulate streaming effect
        streaming.value = true;
        currentResponse.value = '';

        const response = await aiAssistant.handleQuery(message, currentContext.value);

        // Simulate character-by-character streaming
        const chars = response.content.split('');
        for (let i = 0; i < chars.length; i++) {
            currentResponse.value += chars[i];
            if (i % 5 === 0) {
                await new Promise((r) => setTimeout(r, 10));
                await scrollToBottom();
            }
        }

        streaming.value = false;
        currentResponse.value = '';

        // Add assistant message
        messages.value.push({
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: response.content,
            timestamp: new Date(),
            actions: response.actions,
        });

        // Update suggestions
        if (response.suggestions) {
            suggestions.value = response.suggestions;
        }
    } catch (error) {
        console.error('Failed to get assistant response:', error);
        messages.value.push({
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: '죄송합니다. 응답을 생성하는 중 오류가 발생했습니다.',
            timestamp: new Date(),
        });
    } finally {
        loading.value = false;
        streaming.value = false;
        await scrollToBottom();
    }
}

function handleQuickAction(actionId: string) {
    const actionMessages: Record<string, string> = {
        summary: t('assistant.action_messages.summary'),
        recommend: t('assistant.action_messages.recommend'),
        deadline: t('assistant.action_messages.deadline'),
        help: t('assistant.action_messages.help'),
    };

    inputMessage.value = actionMessages[actionId] || '';
    sendMessage();
}

function handleActionClick(action: AssistantAction) {
    emit('action', action);

    if (action.type === 'navigate' && action.payload.view) {
        const view = action.payload.view as string;
        const entityId = action.payload.entityId as number;

        switch (view) {
            case 'project':
            case 'board':
                router.push(`/projects/${entityId || action.payload.projectId}/board`);
                break;
            case 'task': {
                const projectId = action.payload.projectId;
                if (projectId) {
                    router.push(`/projects/${projectId}/board?task=${entityId}`);
                }
                break;
            }
            case 'dashboard':
                router.push('/dashboard');
                break;
        }
    } else if (action.type === 'create') {
        if (action.payload.entityType === 'project') {
            router.push('/projects?create=true');
        } else if (action.payload.entityType === 'task') {
            // Handle task creation
            emit('action', action);
        }
    }
}

function handleSuggestionClick(suggestion: Suggestion) {
    if (suggestion.action) {
        handleActionClick(suggestion.action);
    }
}

async function scrollToBottom() {
    await nextTick();
    if (chatContainerRef.value) {
        chatContainerRef.value.scrollTop = chatContainerRef.value.scrollHeight;
    }
}

function clearChat() {
    messages.value = [];
    aiAssistant.clearConversationHistory();
    showSuggestions.value = true;
}

function formatTime(date: Date): string {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function renderMarkdown(content: string): string {
    // Simple markdown rendering
    return content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-gray-700 rounded text-sm">$1</code>')
        .replace(/\n/g, '<br>')
        .replace(/• /g, '<span class="text-blue-400 mr-1">•</span>');
}

// ========================================
// Lifecycle
// ========================================

watch(
    () => props.open,
    async (isOpen) => {
        if (isOpen) {
            await nextTick();
            inputRef.value?.focus();

            // Load initial suggestions
            suggestions.value = await aiAssistant.getSuggestions(currentContext.value);
        }
    }
);

onMounted(async () => {
    // Load conversation history
    messages.value = aiAssistant.getConversationHistory();
});

// ========================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars
/*
async function generateExecutionPlan() {
    if (!currentInterviewSessionId.value) {
        console.error('No active interview session');
        return;
    }

    try {
        generatingPlan.value = true;

        // Generate detailed execution plan from interview
        const plan = await aiInterviewService.generateDetailedExecutionPlan(
            currentInterviewSessionId.value
        );

        executionPlan.value = plan;
        showPlanPreview.value = true;
    } catch (error) {
        console.error('Failed to generate execution plan:', error);
        messages.value.push({
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: '실행 계획 생성 중 오류가 발생했습니다. 다시 시도해주세요.',
            timestamp: new Date(),
        });
    } finally {
        generatingPlan.value = false;
    }
}
*/

async function createTasksFromPlan() {
    if (!executionPlan.value || !currentContext.value.currentProjectId) {
        return;
    }

    try {
        creatingTasks.value = true;

        const result = await taskStore.createTasksFromExecutionPlan(
            currentContext.value.currentProjectId,
            executionPlan.value
        );

        if (result.success) {
            showPlanPreview.value = false;
            executionPlan.value = null;

            // Show success message
            messages.value.push({
                id: `success-${Date.now()}`,
                role: 'assistant',
                content: `✅ ${result.tasks?.length}개의 태스크가 성공적으로 생성되었습니다! Kanban 보드에서 확인하세요.`,
                timestamp: new Date(),
            });

            // Navigate to board
            if (currentContext.value.currentProjectId) {
                router.push(`/projects/${currentContext.value.currentProjectId}/board`);
            }
        } else {
            throw new Error(result.error || 'Failed to create tasks');
        }
    } catch (error) {
        console.error('Failed to create tasks:', error);
        messages.value.push({
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: '태스크 생성 중 오류가 발생했습니다. 다시 시도해주세요.',
            timestamp: new Date(),
        });
    } finally {
        creatingTasks.value = false;
    }
}

function cancelPlanPreview() {
    showPlanPreview.value = false;
    executionPlan.value = null;
}
</script>

<template>
    <Teleport to="body">
        <Transition name="slide">
            <div
                v-if="open"
                class="fixed bottom-20 right-4 z-50 w-96 max-h-[600px] flex flex-col bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden"
            >
                <!-- Header -->
                <div
                    class="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600/20 to-blue-600/20 border-b border-gray-700"
                >
                    <div class="flex items-center gap-3">
                        <div
                            class="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center"
                        >
                            <span class="text-lg">🤖</span>
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h3 class="text-white font-semibold text-sm">
                                    {{ t('assistant.title') }}
                                </h3>
                                <span
                                    class="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] uppercase font-bold rounded border border-blue-500/30"
                                >
                                    {{ t('assistant.coming_soon') }}
                                </span>
                            </div>
                            <p class="text-gray-400 text-xs">{{ t('assistant.subtitle') }}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button
                            class="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                            :title="t('assistant.clear_chat')"
                            @click="clearChat"
                        >
                            <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                            </svg>
                        </button>
                        <button
                            class="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                            @click="emit('close')"
                        >
                            <svg
                                class="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M6 18L18 6M6 6l12 12"
                                />
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Context Indicator -->
                <div
                    v-if="currentContext.currentProjectId"
                    class="px-4 py-2 bg-gray-750 border-b border-gray-700"
                >
                    <div class="flex items-center gap-2 text-xs text-gray-400">
                        <svg
                            class="w-3.5 h-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                        <span>{{
                            t('assistant.current_context', { id: currentContext.currentProjectId })
                        }}</span>
                    </div>
                </div>

                <!-- Chat Messages -->
                <div ref="chatContainerRef" class="flex-1 overflow-y-auto p-4 space-y-4">
                    <!-- Welcome Message & Quick Actions (if no messages) -->
                    <div v-if="messages.length === 0 && showSuggestions" class="space-y-4">
                        <div class="text-center py-4">
                            <div
                                class="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-r from-purple-500/20 to-blue-500/20 flex items-center justify-center"
                            >
                                <span class="text-3xl">👋</span>
                            </div>
                            <h4 class="text-white font-medium mb-1">
                                {{ t('assistant.welcome_title') }}
                            </h4>
                            <p class="text-gray-400 text-sm">
                                {{ t('assistant.welcome_message') }}
                            </p>
                        </div>

                        <!-- Quick Actions -->
                        <div class="grid grid-cols-2 gap-2">
                            <button
                                v-for="action in quickActions"
                                :key="action.id"
                                class="flex items-center gap-2 px-3 py-2.5 bg-gray-700/50 hover:bg-gray-700 rounded-lg text-left transition-colors group"
                                @click="handleQuickAction(action.id)"
                            >
                                <span class="text-lg">{{ action.icon }}</span>
                                <span class="text-sm text-gray-300 group-hover:text-white">{{
                                    action.label
                                }}</span>
                            </button>
                        </div>
                    </div>

                    <!-- Messages -->
                    <div
                        v-for="message in messages"
                        :key="message.id"
                        class="flex gap-3"
                        :class="message.role === 'user' ? 'flex-row-reverse' : ''"
                    >
                        <!-- Avatar -->
                        <div
                            class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                            :class="
                                message.role === 'user'
                                    ? 'bg-blue-500'
                                    : 'bg-gradient-to-r from-purple-500 to-blue-500'
                            "
                        >
                            <span
                                v-if="message.role === 'user'"
                                class="text-white text-xs font-medium"
                                >{{ t('assistant.user_me') }}</span
                            >
                            <span v-else class="text-sm">🤖</span>
                        </div>

                        <!-- Content -->
                        <div
                            class="max-w-[80%] rounded-2xl px-4 py-2.5"
                            :class="
                                message.role === 'user'
                                    ? 'bg-blue-500 text-white rounded-tr-sm'
                                    : 'bg-gray-700 text-gray-100 rounded-tl-sm'
                            "
                        >
                            <div
                                class="text-sm leading-relaxed"
                                v-html="renderMarkdown(message.content)"
                            />

                            <!-- Actions -->
                            <div v-if="message.actions?.length" class="mt-3 flex flex-wrap gap-2">
                                <button
                                    v-for="action in message.actions"
                                    :key="action.id"
                                    class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                                    :class="[
                                        action.variant === 'primary'
                                            ? 'bg-blue-500 hover:bg-blue-600 text-white'
                                            : action.variant === 'secondary'
                                              ? 'bg-gray-600 hover:bg-gray-500 text-white'
                                              : action.variant === 'danger'
                                                ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                                                : 'bg-gray-600 hover:bg-gray-500 text-white',
                                    ]"
                                    @click="handleActionClick(action)"
                                >
                                    {{ action.label }}
                                </button>
                            </div>

                            <!-- Timestamp -->
                            <div
                                class="mt-1 text-[10px] opacity-60"
                                :class="message.role === 'user' ? 'text-right' : ''"
                            >
                                {{ formatTime(message.timestamp) }}
                            </div>
                        </div>
                    </div>

                    <!-- Streaming Response -->
                    <div v-if="streaming" class="flex gap-3">
                        <div
                            class="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0"
                        >
                            <span class="text-sm">🤖</span>
                        </div>
                        <div class="max-w-[80%] rounded-2xl rounded-tl-sm bg-gray-700 px-4 py-2.5">
                            <div
                                class="text-sm text-gray-100 leading-relaxed"
                                v-html="renderMarkdown(currentResponse)"
                            />
                            <span class="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-0.5" />
                        </div>
                    </div>

                    <!-- Loading Indicator -->
                    <div v-if="loading && !streaming" class="flex gap-3">
                        <div
                            class="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center flex-shrink-0"
                        >
                            <span class="text-sm">🤖</span>
                        </div>
                        <div class="bg-gray-700 rounded-2xl rounded-tl-sm px-4 py-3">
                            <div class="flex gap-1">
                                <span
                                    class="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                                    style="animation-delay: 0ms"
                                />
                                <span
                                    class="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                                    style="animation-delay: 150ms"
                                />
                                <span
                                    class="w-2 h-2 bg-gray-500 rounded-full animate-bounce"
                                    style="animation-delay: 300ms"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Suggestions (after conversation started) -->
                <div
                    v-if="suggestions.length > 0 && messages.length > 0"
                    class="px-4 py-2 border-t border-gray-700 bg-gray-750"
                >
                    <div class="text-xs text-gray-500 mb-2">
                        {{ t('assistant.suggestions_label') }}
                    </div>
                    <div class="flex gap-2 overflow-x-auto pb-1">
                        <button
                            v-for="suggestion in suggestions.slice(0, 3)"
                            :key="suggestion.id"
                            class="flex-shrink-0 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-full text-xs text-gray-300 hover:text-white transition-colors"
                            @click="handleSuggestionClick(suggestion)"
                        >
                            {{ suggestion.title }}
                        </button>
                    </div>
                </div>

                <!-- Input Area -->
                <div class="px-4 py-3 border-t border-gray-700 bg-gray-800/50">
                    <form class="flex gap-2" @submit.prevent="sendMessage">
                        <input
                            ref="inputRef"
                            v-model="inputMessage"
                            type="text"
                            :placeholder="t('assistant.input_placeholder')"
                            class="flex-1 px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                            :disabled="loading"
                        />
                        <button
                            type="submit"
                            :disabled="!inputMessage.trim() || loading"
                            class="px-4 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-xl text-white transition-colors"
                        >
                            <svg
                                class="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                                />
                            </svg>
                        </button>
                    </form>
                </div>
            </div>
        </Transition>
    </Teleport>

    <!-- Execution Plan Preview Modal -->
    <ExecutionPlanPreview
        v-if="showPlanPreview && executionPlan"
        :plan="executionPlan"
        :loading="creatingTasks"
        @create="createTasksFromPlan"
        @cancel="cancelPlanPreview"
    />
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
    transition: all 0.3s ease;
}

.slide-enter-from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
}

.slide-leave-to {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
}

.bg-gray-750 {
    background-color: rgb(38, 42, 51);
}
</style>
