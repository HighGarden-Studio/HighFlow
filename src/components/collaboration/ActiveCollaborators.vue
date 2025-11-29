<script setup lang="ts">
import { computed } from 'vue';
import type { UserPresence } from '../../services/collaboration/PresenceManager';

interface Props {
  users: Map<number, UserPresence>;
  maxDisplay?: number;
}

const props = withDefaults(defineProps<Props>(), {
  maxDisplay: 5,
});

const userArray = computed(() => Array.from(props.users.values()));

const displayedUsers = computed(() => userArray.value.slice(0, props.maxDisplay));

const remainingCount = computed(() => Math.max(0, userArray.value.length - props.maxDisplay));

const getInitials = (email: string) => {
  const parts = email.split('@')[0].split('.');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'online':
      return 'bg-green-500';
    case 'away':
      return 'bg-yellow-500';
    case 'offline':
      return 'bg-gray-400';
    default:
      return 'bg-gray-400';
  }
};

const getActivityText = (presence: UserPresence) => {
  if (presence.editingField) {
    return `${presence.editingField.type} 편집 중`;
  }
  if (presence.currentPage.type === 'task') {
    return `Task #${presence.currentPage.taskId} 보는 중`;
  }
  if (presence.currentPage.type === 'project') {
    return '프로젝트 보는 중';
  }
  return '대시보드';
};
</script>

<template>
  <div class="flex items-center gap-2">
    <!-- Active User Avatars -->
    <div class="flex -space-x-2">
      <div
        v-for="user in displayedUsers"
        :key="user.userId"
        class="relative group"
      >
        <!-- Avatar -->
        <div
          class="w-8 h-8 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center text-xs font-semibold text-white transition-transform hover:scale-110 hover:z-10"
          :style="{ backgroundColor: user.color }"
          :title="user.email"
        >
          {{ getInitials(user.email) }}
        </div>

        <!-- Status Indicator -->
        <div
          class="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-800"
          :class="getStatusColor(user.status)"
        />

        <!-- Tooltip -->
        <div
          class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50"
        >
          <div class="font-semibold">{{ user.email }}</div>
          <div class="text-gray-300 mt-1">{{ getActivityText(user) }}</div>
          <div
            class="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700"
          />
        </div>
      </div>

      <!-- Remaining Count -->
      <div
        v-if="remainingCount > 0"
        class="w-8 h-8 rounded-full border-2 border-white dark:border-gray-800 bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300"
        :title="`${remainingCount}명 더`"
      >
        +{{ remainingCount }}
      </div>
    </div>

    <!-- User Count -->
    <div class="text-sm text-gray-600 dark:text-gray-400">
      {{ userArray.length > 0 ? `${userArray.length}명 활동 중` : '활동 중인 사용자 없음' }}
    </div>
  </div>
</template>

<style scoped>
/* Smooth transitions for avatars */
.group:hover .absolute {
  z-index: 100;
}
</style>
