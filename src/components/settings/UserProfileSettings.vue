<script setup lang="ts">
/**
 * UserProfileSettings Component
 *
 * User profile and account settings
 */
import { ref, computed, onMounted } from 'vue';
import type { UserProfile } from '../../renderer/stores/settingsStore';

interface Props {
  profile: UserProfile;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update', updates: Partial<UserProfile>): void;
  (e: 'uploadAvatar', file: File): void;
  (e: 'logout'): void;
}>();

// Form State
const form = ref({
  displayName: '',
  email: '',
  timezone: '',
  language: '',
  notificationsEnabled: true,
});

const avatarFile = ref<File | null>(null);
const avatarPreview = ref<string | null>(null);
const isEditing = ref(false);
const isSaving = ref(false);

// Initialize form
onMounted(() => {
  resetForm();
});

// Options
const timezones = [
  'Asia/Seoul',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Australia/Sydney',
  'UTC',
];

const languages = [
  { code: 'ko', name: '한국어' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'zh', name: '中文' },
];

// Computed
const hasChanges = computed(() => {
  return (
    form.value.displayName !== props.profile.displayName ||
    form.value.email !== props.profile.email ||
    form.value.timezone !== props.profile.timezone ||
    form.value.language !== props.profile.language ||
    form.value.notificationsEnabled !== props.profile.notificationsEnabled ||
    avatarFile.value !== null
  );
});

const initials = computed(() => {
  const name = form.value.displayName || form.value.email || 'U';
  return name.slice(0, 2).toUpperCase();
});

// Actions
function resetForm() {
  form.value = {
    displayName: props.profile.displayName || '',
    email: props.profile.email || '',
    timezone: props.profile.timezone || 'Asia/Seoul',
    language: props.profile.language || 'ko',
    notificationsEnabled: props.profile.notificationsEnabled ?? true,
  };
  avatarFile.value = null;
  avatarPreview.value = null;
  isEditing.value = false;
}

function handleAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  if (file) {
    avatarFile.value = file;

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      avatarPreview.value = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
}

async function handleSave() {
  if (!hasChanges.value) return;

  isSaving.value = true;

  try {
    // Upload avatar if changed
    if (avatarFile.value) {
      emit('uploadAvatar', avatarFile.value);
    }

    // Save profile updates
    emit('update', {
      displayName: form.value.displayName,
      email: form.value.email,
      timezone: form.value.timezone,
      language: form.value.language,
      notificationsEnabled: form.value.notificationsEnabled,
    });

    isEditing.value = false;
  } finally {
    isSaving.value = false;
  }
}

function handleCancel() {
  resetForm();
}

function handleLogout() {
  if (confirm('Are you sure you want to log out?')) {
    emit('logout');
  }
}

function formatTimezone(tz: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(now);
    const tzName = parts.find(p => p.type === 'timeZoneName')?.value || '';
    return `${tz.replace('_', ' ')} (${tzName})`;
  } catch {
    return tz;
  }
}
</script>

<template>
  <div class="user-profile-settings">
    <!-- Avatar Section -->
    <div class="flex items-start gap-6 mb-8">
      <div class="relative group">
        <div class="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          <img
            v-if="avatarPreview || profile.avatar"
            :src="avatarPreview || profile.avatar"
            alt="Avatar"
            class="w-full h-full object-cover"
          />
          <span v-else class="text-white text-2xl font-bold">
            {{ initials }}
          </span>
        </div>

        <label
          v-if="isEditing"
          class="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <input
            type="file"
            accept="image/*"
            class="hidden"
            @change="handleAvatarChange"
          />
        </label>
      </div>

      <div class="flex-1">
        <div v-if="!isEditing">
          <h3 class="text-xl font-semibold text-gray-900 dark:text-white">
            {{ profile.displayName || 'Set your name' }}
          </h3>
          <p class="text-gray-500 dark:text-gray-400">
            {{ profile.email || 'No email set' }}
          </p>
          <button
            class="mt-3 px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
            @click="isEditing = true"
          >
            Edit Profile
          </button>
        </div>

        <div v-else class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Display Name
            </label>
            <input
              v-model="form.displayName"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              placeholder="Your name"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              v-model="form.email"
              type="email"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              placeholder="your@email.com"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Settings Sections -->
    <div v-if="isEditing" class="space-y-6">
      <!-- Regional Settings -->
      <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-4">
          Regional Settings
        </h4>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Language
            </label>
            <select
              v-model="form.language"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option
                v-for="lang in languages"
                :key="lang.code"
                :value="lang.code"
              >
                {{ lang.name }}
              </option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Timezone
            </label>
            <select
              v-model="form.timezone"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option
                v-for="tz in timezones"
                :key="tz"
                :value="tz"
              >
                {{ formatTimezone(tz) }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- Notifications -->
      <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-4">
          Notifications
        </h4>

        <label class="flex items-center justify-between cursor-pointer">
          <div>
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
              Enable Notifications
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Receive notifications about task updates and mentions
            </p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input
              v-model="form.notificationsEnabled"
              type="checkbox"
              class="sr-only peer"
            />
            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600"></div>
          </label>
        </label>
      </div>

      <!-- Actions -->
      <div class="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          class="px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors text-sm"
          @click="handleLogout"
        >
          Log Out
        </button>

        <div class="flex gap-3">
          <button
            class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            @click="handleCancel"
          >
            Cancel
          </button>
          <button
            class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!hasChanges || isSaving"
            @click="handleSave"
          >
            {{ isSaving ? 'Saving...' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Read-only view -->
    <div v-else class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Language</p>
          <p class="text-sm font-medium text-gray-900 dark:text-white">
            {{ languages.find(l => l.code === profile.language)?.name || profile.language }}
          </p>
        </div>

        <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Timezone</p>
          <p class="text-sm font-medium text-gray-900 dark:text-white">
            {{ formatTimezone(profile.timezone) }}
          </p>
        </div>

        <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg col-span-2">
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-1">Notifications</p>
          <p class="text-sm font-medium text-gray-900 dark:text-white">
            {{ profile.notificationsEnabled ? 'Enabled' : 'Disabled' }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
