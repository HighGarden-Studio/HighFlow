<script setup lang="ts">
/**
 * Update Modal Component
 *
 * Shows update notification when a new version is available
 */
import { computed } from 'vue';
import type { VersionInfo } from '../../renderer/api/version';

interface Props {
    open: boolean;
    versionInfo: VersionInfo | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'download'): void;
}>();

const isForceUpdate = computed(() => props.versionInfo?.forceUpdate || false);
const showCloseButton = computed(() => !isForceUpdate.value);

function handleClose() {
    if (!isForceUpdate.value) {
        emit('close');
    }
}

function handleDownload() {
    emit('download');
}

// Prevent closing force update modal
function preventClose(event: Event) {
    if (isForceUpdate.value) {
        event.stopPropagation();
    }
}
</script>

<template>
    <Teleport to="body">
        <div
            v-if="open && versionInfo"
            class="fixed inset-0 z-[9999] overflow-y-auto"
            @click.self="handleClose"
        >
            <!-- Backdrop -->
            <div
                class="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                :class="{ 'cursor-not-allowed': isForceUpdate }"
                @click="preventClose"
            />

            <!-- Modal -->
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div class="relative w-full max-w-md max-h-[90vh] flex flex-col" @click.stop>
                    <div
                        class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-full"
                    >
                        <!-- Header -->
                        <div
                            class="relative flex-shrink-0 px-6 py-6 border-b border-gray-200 dark:border-gray-700"
                        >
                            <!-- Gradient Background -->
                            <div
                                class="absolute inset-0 opacity-10 bg-gradient-to-r from-blue-500 to-purple-600"
                            />

                            <div class="relative">
                                <div class="flex items-center gap-4 mb-2">
                                    <!-- Icon -->
                                    <div
                                        :class="[
                                            'w-12 h-12 rounded-xl flex items-center justify-center',
                                            isForceUpdate
                                                ? 'bg-red-100 dark:bg-red-900/30'
                                                : 'bg-blue-100 dark:bg-blue-900/30',
                                        ]"
                                    >
                                        <svg
                                            v-if="isForceUpdate"
                                            class="w-6 h-6 text-red-600 dark:text-red-400"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                            />
                                        </svg>
                                        <svg
                                            v-else
                                            class="w-6 h-6 text-blue-600 dark:text-blue-400"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                                            />
                                        </svg>
                                    </div>

                                    <!-- Title -->
                                    <div class="flex-1">
                                        <h2
                                            class="text-xl font-semibold text-gray-900 dark:text-white"
                                        >
                                            {{
                                                isForceUpdate
                                                    ? '업데이트 필요'
                                                    : '새로운 버전이 있습니다!'
                                            }}
                                        </h2>
                                        <p
                                            v-if="isForceUpdate"
                                            class="text-sm text-red-600 dark:text-red-400"
                                        >
                                            이 업데이트는 필수입니다
                                        </p>
                                        <p v-else class="text-sm text-gray-500 dark:text-gray-400">
                                            최신 기능을 사용해보세요
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <!-- Close button (only for optional updates) -->
                            <button
                                v-if="showCloseButton"
                                class="absolute top-4 right-4 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                                @click="handleClose"
                            >
                                <svg
                                    class="h-6 w-6"
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

                        <!-- Body -->
                        <div class="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                            <!-- Version Information -->
                            <div
                                class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                            >
                                <div>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">
                                        현재 버전
                                    </p>
                                    <p class="text-lg font-semibold text-gray-900 dark:text-white">
                                        v{{ versionInfo.currentVersion }}
                                    </p>
                                </div>
                                <svg
                                    class="w-5 h-5 text-gray-400"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                                    />
                                </svg>
                                <div>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">
                                        최신 버전
                                    </p>
                                    <p
                                        class="text-lg font-semibold text-blue-600 dark:text-blue-400"
                                    >
                                        v{{ versionInfo.latestVersion }}
                                    </p>
                                </div>
                            </div>

                            <!-- Release Notes -->
                            <div v-if="versionInfo.releaseNotes">
                                <h3
                                    class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                                >
                                    업데이트 내용
                                </h3>
                                <div
                                    class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap"
                                >
                                    {{ versionInfo.releaseNotes }}
                                </div>
                            </div>

                            <!-- Force Update Warning -->
                            <div
                                v-if="isForceUpdate"
                                class="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800"
                            >
                                <svg
                                    class="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                    />
                                </svg>
                                <div class="flex-1">
                                    <p class="text-sm font-medium text-red-800 dark:text-red-200">
                                        필수 업데이트
                                    </p>
                                    <p class="text-sm text-red-700 dark:text-red-300 mt-1">
                                        이 버전은 보안 및 안정성을 위해 필수 업데이트가 필요합니다.
                                        업데이트하지 않으면 앱을 사용할 수 없습니다.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Footer -->
                        <div
                            class="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
                        >
                            <button
                                v-if="showCloseButton"
                                type="button"
                                class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                @click="handleClose"
                            >
                                나중에
                            </button>
                            <button
                                type="button"
                                :class="[
                                    'px-6 py-2 rounded-lg font-medium transition-colors',
                                    isForceUpdate
                                        ? 'bg-red-600 text-white hover:bg-red-700'
                                        : 'bg-blue-600 text-white hover:bg-blue-700',
                                ]"
                                @click="handleDownload"
                            >
                                <span class="flex items-center gap-2">
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
                                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                        />
                                    </svg>
                                    지금 다운로드
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>
