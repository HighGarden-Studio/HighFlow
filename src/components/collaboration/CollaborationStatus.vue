<script setup lang="ts">
import { computed } from 'vue';
import type { CollaborationStatus } from '../../services/collaboration/CollaborationClient';

interface Props {
  status: CollaborationStatus;
  showDetails?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  showDetails: false,
});

const emit = defineEmits<{
  (e: 'sync'): void;
}>();

const statusColor = computed(() => {
  if (!props.status.connected) return 'text-red-500';
  if (props.status.syncing) return 'text-yellow-500';
  if (props.status.pendingChanges > 0) return 'text-blue-500';
  return 'text-green-500';
});

const statusText = computed(() => {
  if (!props.status.connected) return '연결 끊김';
  if (props.status.syncing) return '동기화 중...';
  if (props.status.pendingChanges > 0) return `${props.status.pendingChanges}개 변경사항 대기 중`;
  return '동기화됨';
});

const statusIcon = computed(() => {
  if (!props.status.connected) return 'offline';
  if (props.status.syncing) return 'syncing';
  if (props.status.pendingChanges > 0) return 'pending';
  return 'online';
});

const handleSync = () => {
  if (!props.status.syncing && props.status.connected) {
    emit('sync');
  }
};
</script>

<template>
  <div class="flex items-center gap-3">
    <!-- Status Indicator -->
    <div class="flex items-center gap-2">
      <!-- Icon -->
      <div class="relative">
        <!-- Online -->
        <svg
          v-if="statusIcon === 'online'"
          class="w-5 h-5"
          :class="statusColor"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fill-rule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clip-rule="evenodd"
          />
        </svg>

        <!-- Syncing -->
        <svg
          v-else-if="statusIcon === 'syncing'"
          class="w-5 h-5 animate-spin"
          :class="statusColor"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>

        <!-- Pending -->
        <svg
          v-else-if="statusIcon === 'pending'"
          class="w-5 h-5"
          :class="statusColor"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>

        <!-- Offline -->
        <svg
          v-else
          class="w-5 h-5"
          :class="statusColor"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
          />
        </svg>
      </div>

      <!-- Status Text -->
      <span class="text-sm font-medium" :class="statusColor">
        {{ statusText }}
      </span>
    </div>

    <!-- Details (Optional) -->
    <div v-if="showDetails" class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
      <!-- Active Users -->
      <div class="flex items-center gap-1">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
        </svg>
        <span>{{ status.activeUsers }}</span>
      </div>

      <!-- Sync Button -->
      <button
        class="px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        :class="status.connected && !status.syncing
          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed'"
        :disabled="!status.connected || status.syncing"
        @click="handleSync"
      >
        <span v-if="status.syncing">동기화 중...</span>
        <span v-else>수동 동기화</span>
      </button>
    </div>
  </div>
</template>
