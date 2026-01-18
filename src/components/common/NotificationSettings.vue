<script setup lang="ts">
/**
 * Notification Settings Component (Redesigned)
 *
 * Slack과 Webhook 공통 설정 UI
 */

import { ref, computed, watch } from 'vue';
import type { NotificationConfig } from '@core/types/notifications';

interface Emit {
    (e: 'update', config: NotificationConfig | null): void;
    (e: 'test', config: NotificationConfig): void;
}

const props = defineProps<{
    config: NotificationConfig | null;
    level: 'global' | 'project' | 'task';
    hasAutoReview?: boolean; // 자동 리뷰 설정 여부
}>();

const emit = defineEmits<Emit>();

// State
const enabled = ref(false);
const slackWebhookUrl = ref('');
const webhookUrl = ref('');
const webhookSecret = ref('');

// Events
const eventExecutionStart = ref(false);
const eventExecutionComplete = ref(false);
const eventExecutionCompleteIncludeResult = ref(true);
const eventReviewStart = ref(false);
const eventReviewComplete = ref(false);
const eventReviewCompleteIncludeResult = ref(true);
const eventReviewFailed = ref(false);
const eventReviewFailedIncludeResult = ref(true);

// Track internal updates to prevent feedback loops
const isUpdatingFromProps = ref(false);

// Initialize from props
watch(
    () => props.config,
    (newConfig) => {
        isUpdatingFromProps.value = true;
        try {
            if (newConfig) {
                // Slack
                if (newConfig.slack?.enabled) {
                    enabled.value = true;
                    slackWebhookUrl.value = newConfig.slack.webhookUrl || '';
                }

                // Webhook
                if (newConfig.webhook?.enabled) {
                    enabled.value = true;
                    webhookUrl.value = newConfig.webhook.url || '';
                    webhookSecret.value = newConfig.webhook.secret || '';
                }

                // Events
                const events = [
                    ...(newConfig.slack?.events || []),
                    ...(newConfig.webhook?.events || []),
                ];

                eventExecutionStart.value = events.includes('task.execution-start' as any);
                eventExecutionComplete.value = events.includes('task.execution-complete' as any);
                eventReviewStart.value = events.includes('task.review-start' as any);
                eventReviewComplete.value = events.includes('task.review-complete' as any);
                eventReviewFailed.value = events.includes('task.review-failed' as any);

                // Options
                eventExecutionCompleteIncludeResult.value =
                    newConfig.slack?.includeResults !== false;
                eventReviewCompleteIncludeResult.value = true;
                eventReviewFailedIncludeResult.value = true;
            }
        } finally {
            // Use nextTick to ensure watchers have fired before releasing lock
            setTimeout(() => {
                isUpdatingFromProps.value = false;
            }, 0);
        }
    },
    { immediate: true, deep: true }
);

// Computed
const hasAnyUrl = computed(() => slackWebhookUrl.value || webhookUrl.value);

// Track if initial props loading is complete
const isInitialized = ref(false);

// Auto-save on change
watch(
    [
        enabled,
        slackWebhookUrl,
        webhookUrl,
        webhookSecret,
        eventExecutionStart,
        eventExecutionComplete,
        eventExecutionCompleteIncludeResult,
        eventReviewStart,
        eventReviewComplete,
        eventReviewCompleteIncludeResult,
        eventReviewFailed,
        eventReviewFailedIncludeResult,
    ],
    () => {
        // Skip initial watch execution
        if (!isInitialized.value) {
            isInitialized.value = true;
            return;
        }

        // Skip if updating from props
        if (isUpdatingFromProps.value) {
            return;
        }

        // If no URL provided, clear config
        if (!hasAnyUrl.value) {
            // Only clear if we actually have initialized and user cleared inputs
            // Don't mistakenly clear on load
            if (isInitialized.value) {
                console.log('[NotificationSettings] No URL provided, clearing config');
                emit('update', null);
            }
            return;
        }

        const selectedEvents: any[] = [];
        if (eventExecutionStart.value) selectedEvents.push('task.execution-start');
        if (eventExecutionComplete.value) selectedEvents.push('task.execution-complete');
        if (eventReviewStart.value) selectedEvents.push('task.review-start');
        if (eventReviewComplete.value) selectedEvents.push('task.review-complete');
        if (eventReviewFailed.value) selectedEvents.push('task.review-failed');

        const config: NotificationConfig = {};

        // Slack
        if (slackWebhookUrl.value) {
            config.slack = {
                enabled: enabled.value,
                webhookUrl: slackWebhookUrl.value,
                events: selectedEvents,
                includeResults: eventExecutionCompleteIncludeResult.value,
            };
        }

        // Webhook
        if (webhookUrl.value) {
            config.webhook = {
                enabled: enabled.value,
                url: webhookUrl.value,
                secret: webhookSecret.value,
                events: selectedEvents,
            };
        }

        console.log('[NotificationSettings] Auto-saving config:', config);
        emit('update', config);
    }
);

function testNotification() {
    // Build current config from form values
    if (!hasAnyUrl.value) {
        alert('웹훅 URL을 먼저 입력해주세요.');
        return;
    }

    const selectedEvents: any[] = [];
    if (eventExecutionStart.value) selectedEvents.push('task.execution-start');
    if (eventExecutionComplete.value) selectedEvents.push('task.execution-complete');
    if (eventReviewStart.value) selectedEvents.push('task.review-start');
    if (eventReviewComplete.value) selectedEvents.push('task.review-complete');
    if (eventReviewFailed.value) selectedEvents.push('task.review-failed');

    const config: NotificationConfig = {};

    // Slack
    if (slackWebhookUrl.value) {
        config.slack = {
            enabled: enabled.value,
            webhookUrl: slackWebhookUrl.value,
            events: selectedEvents,
            includeResults: eventExecutionCompleteIncludeResult.value,
        };
    }

    // Webhook
    if (webhookUrl.value) {
        config.webhook = {
            enabled: enabled.value,
            url: webhookUrl.value,
            secret: webhookSecret.value,
            events: selectedEvents,
        };
    }

    console.log('[NotificationSettings] Sending test with config:', config);
    emit('test', config);
}
</script>

<template>
    <div class="notification-settings space-y-4">
        <!-- Enable Toggle -->
        <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <span class="text-sm font-medium text-gray-900 dark:text-gray-100">알림 활성화</span>
            <button
                class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                :class="enabled ? 'bg-purple-600' : 'bg-gray-300 dark:bg-gray-600'"
                @click="enabled = !enabled"
            >
                <span
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                    :class="enabled ? 'translate-x-6' : 'translate-x-1'"
                />
            </button>
        </div>

        <div v-if="enabled" class="space-y-4">
            <!-- Slack Webhook URL -->
            <div>
                <div class="flex items-center gap-2 mb-2">
                    <svg class="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                        <path
                            d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"
                        />
                    </svg>
                    <label class="text-sm font-medium text-gray-700 dark:text-gray-300"
                        >Slack Webhook URL</label
                    >
                </div>
                <input
                    v-model="slackWebhookUrl"
                    type="text"
                    placeholder="https://hooks.slack.com/services/..."
                    class="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
            </div>

            <!-- Custom Webhook URL -->
            <div>
                <div class="flex items-center gap-2 mb-2">
                    <svg
                        class="w-4 h-4 text-blue-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                        />
                    </svg>
                    <label class="text-sm font-medium text-gray-700 dark:text-gray-300"
                        >Custom Webhook URL</label
                    >
                </div>
                <input
                    v-model="webhookUrl"
                    type="text"
                    placeholder="https://your-server.com/webhook"
                    class="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                <!-- Webhook Secret -->
                <input
                    v-if="webhookUrl"
                    v-model="webhookSecret"
                    type="password"
                    placeholder="Webhook Secret (선택사항)"
                    class="w-full mt-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            <!-- Events Section -->
            <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
                <h5 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    알림 이벤트 선택
                </h5>

                <div class="space-y-3">
                    <!-- Execution Start -->
                    <label class="flex items-start space-x-3 cursor-pointer">
                        <input
                            v-model="eventExecutionStart"
                            type="checkbox"
                            class="mt-1 rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500"
                        />
                        <div class="flex-1">
                            <div class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                테스크 실행 시작
                            </div>
                            <div class="text-xs text-gray-500 dark:text-gray-400">
                                태스크 실행이 시작될 때
                            </div>
                        </div>
                    </label>

                    <!-- Execution Complete -->
                    <div class="space-y-2">
                        <label class="flex items-start space-x-3 cursor-pointer">
                            <input
                                v-model="eventExecutionComplete"
                                type="checkbox"
                                class="mt-1 rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500"
                            />
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    테스크 실행 완료
                                </div>
                                <div class="text-xs text-gray-500 dark:text-gray-400">
                                    태스크 실행이 완료될 때
                                </div>
                            </div>
                        </label>

                        <!-- Sub-option -->
                        <div
                            v-if="eventExecutionComplete"
                            class="ml-9 pl-3 border-l-2 border-gray-200 dark:border-gray-700"
                        >
                            <label class="flex items-center space-x-2 cursor-pointer">
                                <input
                                    v-model="eventExecutionCompleteIncludeResult"
                                    type="checkbox"
                                    class="rounded border-gray-300 dark:border-gray-600 text-purple-600 focus:ring-purple-500"
                                />
                                <span class="text-xs text-gray-600 dark:text-gray-400"
                                    >실행 결과 포함</span
                                >
                            </label>
                        </div>
                    </div>

                    <!-- Review Events (only if autoReview enabled) -->
                    <div
                        v-if="hasAutoReview"
                        class="pt-2 border-t border-gray-200 dark:border-gray-700"
                    >
                        <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            자동 리뷰 이벤트
                        </div>

                        <!-- Review Start -->
                        <label class="flex items-start space-x-3 cursor-pointer mb-3">
                            <input
                                v-model="eventReviewStart"
                                type="checkbox"
                                class="mt-1 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                            />
                            <div class="flex-1">
                                <div class="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    리뷰 시작
                                </div>
                                <div class="text-xs text-gray-500 dark:text-gray-400">
                                    자동 리뷰가 시작될 때
                                </div>
                            </div>
                        </label>

                        <!-- Review Complete -->
                        <div class="space-y-2 mb-3">
                            <label class="flex items-start space-x-3 cursor-pointer">
                                <input
                                    v-model="eventReviewComplete"
                                    type="checkbox"
                                    class="mt-1 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                />
                                <div class="flex-1">
                                    <div
                                        class="text-sm font-medium text-gray-900 dark:text-gray-100"
                                    >
                                        리뷰 완료
                                    </div>
                                    <div class="text-xs text-gray-500 dark:text-gray-400">
                                        자동 리뷰가 완료될 때
                                    </div>
                                </div>
                            </label>

                            <div
                                v-if="eventReviewComplete"
                                class="ml-9 pl-3 border-l-2 border-gray-200 dark:border-gray-700"
                            >
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        v-model="eventReviewCompleteIncludeResult"
                                        type="checkbox"
                                        class="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span class="text-xs text-gray-600 dark:text-gray-400"
                                        >리뷰 내용 포함</span
                                    >
                                </label>
                            </div>
                        </div>

                        <!-- Review Failed -->
                        <div class="space-y-2">
                            <label class="flex items-start space-x-3 cursor-pointer">
                                <input
                                    v-model="eventReviewFailed"
                                    type="checkbox"
                                    class="mt-1 rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500"
                                />
                                <div class="flex-1">
                                    <div
                                        class="text-sm font-medium text-gray-900 dark:text-gray-100"
                                    >
                                        리뷰 실패
                                    </div>
                                    <div class="text-xs text-gray-500 dark:text-gray-400">
                                        자동 리뷰가 실패할 때
                                    </div>
                                </div>
                            </label>

                            <div
                                v-if="eventReviewFailed"
                                class="ml-9 pl-3 border-l-2 border-gray-200 dark:border-gray-700"
                            >
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input
                                        v-model="eventReviewFailedIncludeResult"
                                        type="checkbox"
                                        class="rounded border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500"
                                    />
                                    <span class="text-xs text-gray-600 dark:text-gray-400"
                                        >리뷰 내용 포함</span
                                    >
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Actions -->
            <div
                class="flex items-center justify-end pt-3 border-t border-gray-200 dark:border-gray-700"
            >
                <button
                    class="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded transition-colors"
                    @click="testNotification"
                >
                    테스트 전송
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
/* Component styles */
</style>
