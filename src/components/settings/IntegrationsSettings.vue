<script setup lang="ts">
/**
 * Integrations Settings Component
 *
 * Manages external service integrations including
 * Slack, Discord, Git providers, Google Drive, and Webhooks.
 */
import { ref, reactive, computed, onMounted } from 'vue';

// ========================================
// Types
// ========================================

interface IntegrationStatus {
  connected: boolean;
  lastSync?: Date;
  error?: string;
  stats?: {
    messagesSent?: number;
    filesUploaded?: number;
    commitsLinked?: number;
    skillsSynced?: number;
    webhooksTriggered?: number;
  };
}

interface SlackConfig {
  teamName?: string;
  channelId?: string;
  channelName?: string;
  notifyOnTaskComplete: boolean;
  notifyOnMention: boolean;
  notifyOnError: boolean;
}

interface DiscordConfig {
  webhookUrl: string;
  webhookName?: string;
  notifyOnTaskComplete: boolean;
  notifyOnProjectUpdate: boolean;
  notifyOnError: boolean;
}

interface GitConfig {
  provider: 'github' | 'gitlab' | 'bitbucket';
  username?: string;
  repositories: Array<{
    id: string;
    name: string;
    fullName: string;
    url: string;
  }>;
  autoLinkCommits: boolean;
  autoLinkPRs: boolean;
  branchPrefix: string;
}

interface GoogleDriveConfig {
  folderId?: string;
  folderName?: string;
  autoSync: boolean;
  syncIntervalMinutes: number;
}

interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  lastTriggered?: Date;
  failureCount: number;
}

// ========================================
// State
// ========================================

const activeTab = ref<'slack' | 'discord' | 'git' | 'drive' | 'webhooks'>('slack');
const loading = ref(false);
const testingIntegration = ref<string | null>(null);

// Integration statuses
const integrationStatus = reactive<{
  slack: IntegrationStatus;
  discord: IntegrationStatus;
  github: IntegrationStatus;
  gitlab: IntegrationStatus;
  bitbucket: IntegrationStatus;
  googleDrive: IntegrationStatus;
}>({
  slack: { connected: false },
  discord: { connected: false },
  github: { connected: false },
  gitlab: { connected: false },
  bitbucket: { connected: false },
  googleDrive: { connected: false },
});

// Configurations
const slackConfig = reactive<SlackConfig>({
  notifyOnTaskComplete: true,
  notifyOnMention: true,
  notifyOnError: true,
});

const discordConfig = reactive<DiscordConfig>({
  webhookUrl: '',
  notifyOnTaskComplete: true,
  notifyOnProjectUpdate: true,
  notifyOnError: true,
});

const gitConfigs = reactive<Record<string, GitConfig>>({
  github: {
    provider: 'github',
    repositories: [],
    autoLinkCommits: true,
    autoLinkPRs: true,
    branchPrefix: 'task',
  },
  gitlab: {
    provider: 'gitlab',
    repositories: [],
    autoLinkCommits: true,
    autoLinkPRs: true,
    branchPrefix: 'task',
  },
  bitbucket: {
    provider: 'bitbucket',
    repositories: [],
    autoLinkCommits: true,
    autoLinkPRs: true,
    branchPrefix: 'task',
  },
});

const googleDriveConfig = reactive<GoogleDriveConfig>({
  autoSync: true,
  syncIntervalMinutes: 30,
});

const webhooks = ref<WebhookConfig[]>([]);

// Forms
const newWebhookForm = reactive({
  name: '',
  url: '',
  events: [] as string[],
  secret: '',
});

const showNewWebhookModal = ref(false);
const selectedGitProvider = ref<'github' | 'gitlab' | 'bitbucket'>('github');
const newRepoUrl = ref('');

// Available webhook events
const webhookEvents = [
  { value: 'project.created', label: '프로젝트 생성' },
  { value: 'project.updated', label: '프로젝트 업데이트' },
  { value: 'project.completed', label: '프로젝트 완료' },
  { value: 'task.created', label: '태스크 생성' },
  { value: 'task.completed', label: '태스크 완료' },
  { value: 'task.failed', label: '태스크 실패' },
  { value: 'comment.created', label: '댓글 작성' },
  { value: 'user.mentioned', label: '사용자 멘션' },
];

// ========================================
// Computed
// ========================================

const tabs = computed(() => [
  { id: 'slack', label: 'Slack', icon: '💬', connected: integrationStatus.slack.connected },
  { id: 'discord', label: 'Discord', icon: '🎮', connected: integrationStatus.discord.connected },
  { id: 'git', label: 'Git', icon: '📚', connected: integrationStatus.github.connected || integrationStatus.gitlab.connected || integrationStatus.bitbucket.connected },
  { id: 'drive', label: 'Google Drive', icon: '📁', connected: integrationStatus.googleDrive.connected },
  { id: 'webhooks', label: 'Webhooks', icon: '🔗', connected: webhooks.value.length > 0 },
]);

const activeWebhooksCount = computed(() =>
  webhooks.value.filter((w) => w.active).length
);

// Computed for selected git provider config (for template type safety)
const selectedGitConfig = computed(() => {
  const config = gitConfigs[selectedGitProvider.value];
  if (config) return config;
  // Create default config if missing (shouldn't happen)
  const defaultConfig: GitConfig = {
    provider: selectedGitProvider.value,
    repositories: [],
    autoLinkCommits: true,
    autoLinkPRs: true,
    branchPrefix: 'task',
  };
  gitConfigs[selectedGitProvider.value] = defaultConfig;
  return defaultConfig;
});

const selectedGitStatus = computed(() => {
  return integrationStatus[selectedGitProvider.value] ?? { connected: false };
});

// ========================================
// Methods
// ========================================

// Slack
async function connectSlack() {
  loading.value = true;
  try {
    // In real implementation, this would open OAuth flow
    // For now, simulate connection
    await new Promise((resolve) => setTimeout(resolve, 1500));

    integrationStatus.slack = {
      connected: true,
      lastSync: new Date(),
      stats: { messagesSent: 0 },
    };

    slackConfig.teamName = 'My Workspace';
    slackConfig.channelName = '#general';
  } catch (error) {
    integrationStatus.slack.error = error instanceof Error ? error.message : 'Connection failed';
  } finally {
    loading.value = false;
  }
}

async function disconnectSlack() {
  loading.value = true;
  try {
    await new Promise((resolve) => setTimeout(resolve, 500));
    integrationStatus.slack = { connected: false };
    slackConfig.teamName = undefined;
    slackConfig.channelName = undefined;
    slackConfig.channelId = undefined;
  } finally {
    loading.value = false;
  }
}

async function testSlack() {
  testingIntegration.value = 'slack';
  try {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    alert('테스트 메시지가 전송되었습니다.');
  } finally {
    testingIntegration.value = null;
  }
}

// Discord
async function saveDiscordWebhook() {
  if (!discordConfig.webhookUrl) {
    alert('웹훅 URL을 입력해주세요.');
    return;
  }

  loading.value = true;
  try {
    // Validate webhook URL
    const response = await fetch(discordConfig.webhookUrl);
    if (!response.ok) {
      throw new Error('Invalid webhook URL');
    }

    const data = await response.json();
    discordConfig.webhookName = data.name;

    integrationStatus.discord = {
      connected: true,
      lastSync: new Date(),
      stats: { messagesSent: 0 },
    };
  } catch (error) {
    integrationStatus.discord.error = error instanceof Error ? error.message : 'Invalid webhook';
    alert('유효하지 않은 웹훅 URL입니다.');
  } finally {
    loading.value = false;
  }
}

async function disconnectDiscord() {
  discordConfig.webhookUrl = '';
  discordConfig.webhookName = undefined;
  integrationStatus.discord = { connected: false };
}

async function testDiscord() {
  testingIntegration.value = 'discord';
  try {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    alert('테스트 메시지가 전송되었습니다.');
  } finally {
    testingIntegration.value = null;
  }
}

// Git
async function connectGitProvider(provider: 'github' | 'gitlab' | 'bitbucket') {
  loading.value = true;
  try {
    // In real implementation, this would open OAuth flow
    await new Promise((resolve) => setTimeout(resolve, 1500));

    integrationStatus[provider] = {
      connected: true,
      lastSync: new Date(),
      stats: { commitsLinked: 0 },
    };

    const config = gitConfigs[provider];
    if (config) {
      config.username = 'user';
    }
  } catch (error) {
    const status = integrationStatus[provider];
    if (status) {
      status.error = error instanceof Error ? error.message : 'Connection failed';
    }
  } finally {
    loading.value = false;
  }
}

async function disconnectGitProvider(provider: 'github' | 'gitlab' | 'bitbucket') {
  loading.value = true;
  try {
    await new Promise((resolve) => setTimeout(resolve, 500));
    integrationStatus[provider] = { connected: false };
    const config = gitConfigs[provider];
    if (config) {
      config.username = undefined;
      config.repositories = [];
    }
  } finally {
    loading.value = false;
  }
}

async function addRepository() {
  if (!newRepoUrl.value) {
    alert('저장소 URL을 입력해주세요.');
    return;
  }

  loading.value = true;
  try {
    // Parse and validate repository URL
    const match = newRepoUrl.value.match(/(?:github|gitlab|bitbucket)\.(?:com|org)[/:](.+?)\/(.+?)(?:\.git)?$/);
    if (!match) {
      throw new Error('Invalid repository URL');
    }

    const [, owner, repo] = match;
    if (!owner || !repo) {
      throw new Error('Invalid repository URL');
    }
    const config = gitConfigs[selectedGitProvider.value];

    if (config) {
      config.repositories.push({
        id: `${owner}/${repo}`,
        name: repo,
        fullName: `${owner}/${repo}`,
        url: newRepoUrl.value,
      });
    }

    newRepoUrl.value = '';
  } catch (error) {
    alert('유효하지 않은 저장소 URL입니다.');
  } finally {
    loading.value = false;
  }
}

function removeRepository(provider: 'github' | 'gitlab' | 'bitbucket', repoId: string) {
  const config = gitConfigs[provider];
  if (config) {
    config.repositories = config.repositories.filter((r) => r.id !== repoId);
  }
}

// Google Drive
async function connectGoogleDrive() {
  loading.value = true;
  try {
    // In real implementation, this would open OAuth flow
    await new Promise((resolve) => setTimeout(resolve, 1500));

    integrationStatus.googleDrive = {
      connected: true,
      lastSync: new Date(),
      stats: { skillsSynced: 0 },
    };
  } catch (error) {
    integrationStatus.googleDrive.error = error instanceof Error ? error.message : 'Connection failed';
  } finally {
    loading.value = false;
  }
}

async function disconnectGoogleDrive() {
  loading.value = true;
  try {
    await new Promise((resolve) => setTimeout(resolve, 500));
    integrationStatus.googleDrive = { connected: false };
    googleDriveConfig.folderId = undefined;
    googleDriveConfig.folderName = undefined;
  } finally {
    loading.value = false;
  }
}

async function selectSkillsFolder() {
  // In real implementation, this would open Google Drive picker
  const folderId = prompt('Skills 폴더 ID를 입력해주세요:');
  if (folderId) {
    googleDriveConfig.folderId = folderId;
    googleDriveConfig.folderName = 'AI Workflow Skills';
  }
}

async function syncSkills() {
  loading.value = true;
  try {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    integrationStatus.googleDrive.lastSync = new Date();
    alert('Skills 동기화가 완료되었습니다.');
  } finally {
    loading.value = false;
  }
}

// Webhooks
function openNewWebhookModal() {
  newWebhookForm.name = '';
  newWebhookForm.url = '';
  newWebhookForm.events = [];
  newWebhookForm.secret = '';
  showNewWebhookModal.value = true;
}

async function createWebhook() {
  if (!newWebhookForm.name || !newWebhookForm.url || newWebhookForm.events.length === 0) {
    alert('모든 필수 필드를 입력해주세요.');
    return;
  }

  loading.value = true;
  try {
    const webhook: WebhookConfig = {
      id: `webhook-${Date.now()}`,
      name: newWebhookForm.name,
      url: newWebhookForm.url,
      events: newWebhookForm.events,
      active: true,
      failureCount: 0,
    };

    webhooks.value.push(webhook);
    showNewWebhookModal.value = false;
  } finally {
    loading.value = false;
  }
}

function toggleWebhook(webhookId: string) {
  const webhook = webhooks.value.find((w) => w.id === webhookId);
  if (webhook) {
    webhook.active = !webhook.active;
  }
}

function deleteWebhook(webhookId: string) {
  if (confirm('이 웹훅을 삭제하시겠습니까?')) {
    webhooks.value = webhooks.value.filter((w) => w.id !== webhookId);
  }
}

async function testWebhook(webhookId: string) {
  testingIntegration.value = webhookId;
  try {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    alert('테스트 웹훅이 전송되었습니다.');
  } finally {
    testingIntegration.value = null;
  }
}

// Toggle event in webhook form
function toggleWebhookEvent(event: string) {
  const index = newWebhookForm.events.indexOf(event);
  if (index === -1) {
    newWebhookForm.events.push(event);
  } else {
    newWebhookForm.events.splice(index, 1);
  }
}

// Lifecycle
onMounted(() => {
  // Load saved configurations from storage
  // This would be replaced with actual storage loading
});
</script>

<template>
  <div class="integrations-settings">
    <!-- Header -->
    <div class="mb-6">
      <h2 class="text-xl font-bold text-white mb-2">외부 서비스 연동</h2>
      <p class="text-gray-400 text-sm">
        Slack, Discord, Git 서비스 등과 연동하여 알림을 받고 작업을 자동화할 수 있습니다.
      </p>
    </div>

    <!-- Tabs -->
    <div class="flex gap-2 mb-6 border-b border-gray-700 pb-2 overflow-x-auto">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id as typeof activeTab"
        :class="[
          'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
          activeTab === tab.id
            ? 'bg-blue-600 text-white'
            : 'text-gray-400 hover:bg-gray-700 hover:text-white',
        ]"
      >
        <span>{{ tab.icon }}</span>
        <span>{{ tab.label }}</span>
        <span
          v-if="tab.connected"
          class="w-2 h-2 bg-green-500 rounded-full"
        />
      </button>
    </div>

    <!-- Tab Content -->
    <div class="bg-gray-800 rounded-xl p-6">
      <!-- Slack Tab -->
      <div v-if="activeTab === 'slack'" class="space-y-6">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center text-2xl">
              💬
            </div>
            <div>
              <h3 class="text-lg font-semibold text-white">Slack</h3>
              <p class="text-gray-400 text-sm">
                {{ integrationStatus.slack.connected ? `연결됨: ${slackConfig.teamName}` : '연결되지 않음' }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <template v-if="integrationStatus.slack.connected">
              <button
                @click="testSlack"
                :disabled="testingIntegration === 'slack'"
                class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {{ testingIntegration === 'slack' ? '테스트 중...' : '테스트' }}
              </button>
              <button
                @click="disconnectSlack"
                :disabled="loading"
                class="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                연결 해제
              </button>
            </template>
            <button
              v-else
              @click="connectSlack"
              :disabled="loading"
              class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {{ loading ? '연결 중...' : 'Slack 연결' }}
            </button>
          </div>
        </div>

        <template v-if="integrationStatus.slack.connected">
          <div class="border-t border-gray-700 pt-6">
            <h4 class="text-sm font-medium text-gray-300 mb-4">알림 설정</h4>
            <div class="space-y-3">
              <label class="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  v-model="slackConfig.notifyOnTaskComplete"
                  class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span class="text-gray-300">태스크 완료 시 알림</span>
              </label>
              <label class="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  v-model="slackConfig.notifyOnMention"
                  class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span class="text-gray-300">멘션 시 DM 전송</span>
              </label>
              <label class="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  v-model="slackConfig.notifyOnError"
                  class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span class="text-gray-300">오류 발생 시 알림</span>
              </label>
            </div>
          </div>

          <div class="border-t border-gray-700 pt-6">
            <h4 class="text-sm font-medium text-gray-300 mb-4">사용 통계</h4>
            <div class="grid grid-cols-3 gap-4">
              <div class="bg-gray-700/50 rounded-lg p-3">
                <div class="text-2xl font-bold text-white">{{ integrationStatus.slack.stats?.messagesSent || 0 }}</div>
                <div class="text-gray-400 text-sm">전송된 메시지</div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Discord Tab -->
      <div v-if="activeTab === 'discord'" class="space-y-6">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-2xl">
              🎮
            </div>
            <div>
              <h3 class="text-lg font-semibold text-white">Discord</h3>
              <p class="text-gray-400 text-sm">
                {{ integrationStatus.discord.connected ? `연결됨: ${discordConfig.webhookName}` : '웹훅으로 연결' }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2" v-if="integrationStatus.discord.connected">
            <button
              @click="testDiscord"
              :disabled="testingIntegration === 'discord'"
              class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {{ testingIntegration === 'discord' ? '테스트 중...' : '테스트' }}
            </button>
            <button
              @click="disconnectDiscord"
              class="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg transition-colors"
            >
              연결 해제
            </button>
          </div>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">웹훅 URL</label>
            <div class="flex gap-2">
              <input
                v-model="discordConfig.webhookUrl"
                type="url"
                placeholder="https://discord.com/api/webhooks/..."
                class="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <button
                @click="saveDiscordWebhook"
                :disabled="loading || !discordConfig.webhookUrl"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {{ loading ? '확인 중...' : '저장' }}
              </button>
            </div>
          </div>

          <template v-if="integrationStatus.discord.connected">
            <div class="border-t border-gray-700 pt-4">
              <h4 class="text-sm font-medium text-gray-300 mb-4">알림 설정</h4>
              <div class="space-y-3">
                <label class="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    v-model="discordConfig.notifyOnTaskComplete"
                    class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span class="text-gray-300">태스크 완료 시 알림</span>
                </label>
                <label class="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    v-model="discordConfig.notifyOnProjectUpdate"
                    class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span class="text-gray-300">프로젝트 업데이트 알림</span>
                </label>
                <label class="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    v-model="discordConfig.notifyOnError"
                    class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span class="text-gray-300">오류 발생 시 알림</span>
                </label>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- Git Tab -->
      <div v-if="activeTab === 'git'" class="space-y-6">
        <!-- Provider Selector -->
        <div class="flex gap-2 mb-4">
          <button
            v-for="provider in ['github', 'gitlab', 'bitbucket'] as const"
            :key="provider"
            @click="selectedGitProvider = provider"
            :class="[
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              selectedGitProvider === provider
                ? 'bg-gray-600 text-white'
                : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700',
            ]"
          >
            <span>{{ provider === 'github' ? '🐙' : provider === 'gitlab' ? '🦊' : '🪣' }}</span>
            <span class="capitalize">{{ provider }}</span>
            <span
              v-if="integrationStatus[provider].connected"
              class="w-2 h-2 bg-green-500 rounded-full"
            />
          </button>
        </div>

        <!-- Selected Provider Config -->
        <div class="border border-gray-700 rounded-lg p-4">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center text-xl">
                {{ selectedGitProvider === 'github' ? '🐙' : selectedGitProvider === 'gitlab' ? '🦊' : '🪣' }}
              </div>
              <div>
                <h4 class="text-white font-medium capitalize">{{ selectedGitProvider }}</h4>
                <p class="text-gray-400 text-sm">
                  {{ selectedGitStatus.connected
                    ? `@${selectedGitConfig.username}`
                    : '연결되지 않음' }}
                </p>
              </div>
            </div>
            <template v-if="selectedGitStatus.connected">
              <button
                @click="disconnectGitProvider(selectedGitProvider)"
                :disabled="loading"
                class="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                연결 해제
              </button>
            </template>
            <button
              v-else
              @click="connectGitProvider(selectedGitProvider)"
              :disabled="loading"
              class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {{ loading ? '연결 중...' : '연결하기' }}
            </button>
          </div>

          <template v-if="selectedGitStatus.connected">
            <!-- Connected Repositories -->
            <div class="border-t border-gray-700 pt-4">
              <h5 class="text-sm font-medium text-gray-300 mb-3">연결된 저장소</h5>

              <div class="space-y-2 mb-4">
                <div
                  v-for="repo in selectedGitConfig.repositories"
                  :key="repo.id"
                  class="flex items-center justify-between bg-gray-700/50 rounded-lg px-3 py-2"
                >
                  <div class="flex items-center gap-2">
                    <span class="text-gray-400">📁</span>
                    <span class="text-white text-sm">{{ repo.fullName }}</span>
                  </div>
                  <button
                    @click="removeRepository(selectedGitProvider, repo.id)"
                    class="text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <div v-if="selectedGitConfig.repositories.length === 0" class="text-gray-500 text-sm text-center py-4">
                  연결된 저장소가 없습니다
                </div>
              </div>

              <!-- Add Repository -->
              <div class="flex gap-2">
                <input
                  v-model="newRepoUrl"
                  type="url"
                  placeholder="저장소 URL (예: https://github.com/user/repo)"
                  class="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <button
                  @click="addRepository"
                  :disabled="!newRepoUrl"
                  class="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                >
                  추가
                </button>
              </div>
            </div>

            <!-- Settings -->
            <div class="border-t border-gray-700 pt-4 mt-4">
              <h5 class="text-sm font-medium text-gray-300 mb-3">설정</h5>
              <div class="space-y-3">
                <label class="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    v-model="selectedGitConfig.autoLinkCommits"
                    class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span class="text-gray-300 text-sm">커밋 메시지에서 태스크 자동 연결</span>
                </label>
                <label class="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    v-model="selectedGitConfig.autoLinkPRs"
                    class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span class="text-gray-300 text-sm">PR과 태스크 자동 연결</span>
                </label>
                <div class="flex items-center gap-3">
                  <span class="text-gray-300 text-sm">브랜치 접두사:</span>
                  <input
                    v-model="selectedGitConfig.branchPrefix"
                    type="text"
                    class="w-32 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- Google Drive Tab -->
      <div v-if="activeTab === 'drive'" class="space-y-6">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center text-2xl">
              📁
            </div>
            <div>
              <h3 class="text-lg font-semibold text-white">Google Drive</h3>
              <p class="text-gray-400 text-sm">
                {{ integrationStatus.googleDrive.connected ? 'Skills 폴더와 동기화' : 'Skills를 Google Drive와 동기화' }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2" v-if="integrationStatus.googleDrive.connected">
            <button
              @click="syncSkills"
              :disabled="loading"
              class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {{ loading ? '동기화 중...' : '지금 동기화' }}
            </button>
            <button
              @click="disconnectGoogleDrive"
              :disabled="loading"
              class="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              연결 해제
            </button>
          </div>
          <button
            v-else
            @click="connectGoogleDrive"
            :disabled="loading"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {{ loading ? '연결 중...' : 'Google Drive 연결' }}
          </button>
        </div>

        <template v-if="integrationStatus.googleDrive.connected">
          <!-- Folder Selection -->
          <div class="border-t border-gray-700 pt-6">
            <h4 class="text-sm font-medium text-gray-300 mb-4">Skills 폴더</h4>
            <div class="flex items-center gap-4">
              <div class="flex-1 bg-gray-700/50 rounded-lg px-4 py-3">
                <div v-if="googleDriveConfig.folderName" class="flex items-center gap-2">
                  <span class="text-yellow-500">📁</span>
                  <span class="text-white">{{ googleDriveConfig.folderName }}</span>
                  <span class="text-gray-500 text-sm">({{ googleDriveConfig.folderId }})</span>
                </div>
                <div v-else class="text-gray-400">폴더가 선택되지 않았습니다</div>
              </div>
              <button
                @click="selectSkillsFolder"
                class="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
              >
                폴더 선택
              </button>
            </div>
          </div>

          <!-- Sync Settings -->
          <div class="border-t border-gray-700 pt-6">
            <h4 class="text-sm font-medium text-gray-300 mb-4">동기화 설정</h4>
            <div class="space-y-4">
              <label class="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  v-model="googleDriveConfig.autoSync"
                  class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span class="text-gray-300">자동 동기화</span>
              </label>
              <div v-if="googleDriveConfig.autoSync" class="flex items-center gap-3 ml-7">
                <span class="text-gray-400 text-sm">동기화 간격:</span>
                <select
                  v-model="googleDriveConfig.syncIntervalMinutes"
                  class="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option :value="15">15분</option>
                  <option :value="30">30분</option>
                  <option :value="60">1시간</option>
                  <option :value="120">2시간</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Stats -->
          <div class="border-t border-gray-700 pt-6">
            <h4 class="text-sm font-medium text-gray-300 mb-4">통계</h4>
            <div class="grid grid-cols-2 gap-4">
              <div class="bg-gray-700/50 rounded-lg p-3">
                <div class="text-2xl font-bold text-white">{{ integrationStatus.googleDrive.stats?.skillsSynced || 0 }}</div>
                <div class="text-gray-400 text-sm">동기화된 Skills</div>
              </div>
              <div class="bg-gray-700/50 rounded-lg p-3">
                <div class="text-lg font-medium text-white">
                  {{ integrationStatus.googleDrive.lastSync?.toLocaleString() || '-' }}
                </div>
                <div class="text-gray-400 text-sm">마지막 동기화</div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Webhooks Tab -->
      <div v-if="activeTab === 'webhooks'" class="space-y-6">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-white">웹훅</h3>
            <p class="text-gray-400 text-sm">
              {{ activeWebhooksCount }}개의 활성 웹훅
            </p>
          </div>
          <button
            @click="openNewWebhookModal"
            class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
          >
            + 웹훅 추가
          </button>
        </div>

        <!-- Webhooks List -->
        <div class="space-y-3">
          <div
            v-for="webhook in webhooks"
            :key="webhook.id"
            class="border border-gray-700 rounded-lg p-4"
          >
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-3">
                <button
                  @click="toggleWebhook(webhook.id)"
                  :class="[
                    'relative w-10 h-6 rounded-full transition-colors',
                    webhook.active ? 'bg-green-600' : 'bg-gray-600',
                  ]"
                >
                  <span
                    :class="[
                      'absolute top-1 w-4 h-4 bg-white rounded-full transition-transform',
                      webhook.active ? 'left-5' : 'left-1',
                    ]"
                  />
                </button>
                <div>
                  <div class="text-white font-medium">{{ webhook.name }}</div>
                  <div class="text-gray-400 text-sm truncate max-w-md">{{ webhook.url }}</div>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <button
                  @click="testWebhook(webhook.id)"
                  :disabled="testingIntegration === webhook.id"
                  class="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors disabled:opacity-50"
                >
                  {{ testingIntegration === webhook.id ? '...' : '테스트' }}
                </button>
                <button
                  @click="deleteWebhook(webhook.id)"
                  class="p-1 text-gray-400 hover:text-red-400 transition-colors"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
            <div class="mt-3 flex flex-wrap gap-1">
              <span
                v-for="event in webhook.events"
                :key="event"
                class="px-2 py-0.5 bg-gray-700 text-gray-300 text-xs rounded"
              >
                {{ webhookEvents.find(e => e.value === event)?.label || event }}
              </span>
            </div>
            <div v-if="webhook.failureCount > 0" class="mt-2">
              <span class="text-red-400 text-sm">⚠️ {{ webhook.failureCount }}회 실패</span>
            </div>
          </div>

          <div v-if="webhooks.length === 0" class="text-center py-8 text-gray-500">
            등록된 웹훅이 없습니다
          </div>
        </div>
      </div>
    </div>

    <!-- New Webhook Modal -->
    <Teleport to="body">
      <div
        v-if="showNewWebhookModal"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
        @click.self="showNewWebhookModal = false"
      >
        <div class="bg-gray-800 rounded-xl w-full max-w-md p-6 shadow-xl">
          <h3 class="text-lg font-semibold text-white mb-4">새 웹훅 추가</h3>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">이름</label>
              <input
                v-model="newWebhookForm.name"
                type="text"
                placeholder="웹훅 이름"
                class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">URL</label>
              <input
                v-model="newWebhookForm.url"
                type="url"
                placeholder="https://your-server.com/webhook"
                class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">이벤트</label>
              <div class="grid grid-cols-2 gap-2 mt-2">
                <label
                  v-for="event in webhookEvents"
                  :key="event.value"
                  class="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    :checked="newWebhookForm.events.includes(event.value)"
                    @change="toggleWebhookEvent(event.value)"
                    class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span class="text-gray-300 text-sm">{{ event.label }}</span>
                </label>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">시크릿 (선택사항)</label>
              <input
                v-model="newWebhookForm.secret"
                type="password"
                placeholder="HMAC 서명용 시크릿"
                class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div class="flex justify-end gap-2 mt-6">
            <button
              @click="showNewWebhookModal = false"
              class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              @click="createWebhook"
              :disabled="loading || !newWebhookForm.name || !newWebhookForm.url || newWebhookForm.events.length === 0"
              class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {{ loading ? '생성 중...' : '생성' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.integrations-settings {
  @apply max-w-4xl;
}
</style>
