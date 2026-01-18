<script setup lang="ts">
/**
 * Integrations Settings Component
 *
 * Manages external service integrations including
 * Slack, Discord, Git providers, Google Drive, and Webhooks.
 */
import { ref, reactive, computed, onMounted } from 'vue';
import IconRenderer from '../common/IconRenderer.vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

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
const webhookEvents = computed(() => [
    { value: 'project.created', label: t('settings.integrations.webhook_events.project_created') },
    { value: 'project.updated', label: t('settings.integrations.webhook_events.project_updated') },
    {
        value: 'project.completed',
        label: t('settings.integrations.webhook_events.project_completed'),
    },
    { value: 'task.created', label: t('settings.integrations.webhook_events.task_created') },
    { value: 'task.completed', label: t('settings.integrations.webhook_events.task_completed') },
    { value: 'task.failed', label: t('settings.integrations.webhook_events.task_failed') },
    { value: 'comment.created', label: t('settings.integrations.webhook_events.comment_created') },
    { value: 'user.mentioned', label: t('settings.integrations.webhook_events.user_mentioned') },
]);

// ========================================
// Computed
// ========================================

const tabs = computed(() => [
    {
        id: 'slack',
        label: 'Slack',
        icon: '💬',
        connected: integrationStatus.slack.connected,
        comingSoon: true,
    },
    {
        id: 'discord',
        label: 'Discord',
        icon: '🎮',
        connected: integrationStatus.discord.connected,
        comingSoon: true,
    },
    {
        id: 'git',
        label: 'Git',
        icon: '📚',
        connected:
            integrationStatus.github.connected ||
            integrationStatus.gitlab.connected ||
            integrationStatus.bitbucket.connected,
        comingSoon: true, // Git integration is also a simulation
    },
    {
        id: 'drive',
        label: 'Google Drive',
        icon: '☁️', // Cloud icon for Google Drive
        connected: integrationStatus.googleDrive.connected,
        comingSoon: true,
    },
    { id: 'webhooks', label: 'Webhooks', icon: '🔔', connected: webhooks.value.length > 0 },
]);

const activeWebhooksCount = computed(() => webhooks.value.filter((w) => w.active).length);

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
        integrationStatus.slack.error =
            error instanceof Error
                ? error.message
                : t('settings.integrations.slack.connection_failed');
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
        alert(t('settings.integrations.test_message_sent'));
    } finally {
        testingIntegration.value = null;
    }
}

// Discord
async function saveDiscordWebhook() {
    if (!discordConfig.webhookUrl) {
        alert(t('settings.integrations.discord.alert_url_needed'));
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
        integrationStatus.discord.error =
            error instanceof Error ? error.message : 'Invalid webhook';
        alert(t('settings.integrations.discord.alert_invalid_url'));
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
        alert(t('settings.integrations.test_message_sent'));
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
            status.error =
                error instanceof Error
                    ? error.message
                    : t('settings.integrations.git.connection_failed');
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
        alert(t('settings.integrations.git.alert_repo_url_needed'));
        return;
    }

    loading.value = true;
    try {
        // Parse and validate repository URL
        const match = newRepoUrl.value.match(
            /(?:github|gitlab|bitbucket)\.(?:com|org)[/:](.+?)\/(.+?)(?:\.git)?$/
        );
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
        alert(t('settings.integrations.git.alert_invalid_repo_url'));
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
        integrationStatus.googleDrive.error =
            error instanceof Error
                ? error.message
                : t('settings.integrations.drive.connection_failed');
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
    const folderId = prompt(t('settings.integrations.drive.prompt_folder_id'));
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
        alert(t('settings.integrations.drive.alert_sync_complete'));
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
        alert(t('settings.integrations.webhooks.alert_fields_needed'));
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
    if (confirm(t('settings.integrations.webhooks.confirm_delete'))) {
        webhooks.value = webhooks.value.filter((w) => w.id !== webhookId);
    }
}

async function testWebhook(webhookId: string) {
    testingIntegration.value = webhookId;
    try {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        alert(t('settings.integrations.webhooks.alert_test_sent'));
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
            <h2 class="text-xl font-bold text-white mb-2">
                {{ t('settings.integrations.header') }}
            </h2>
            <p class="text-gray-400 text-sm">
                {{ t('settings.integrations.description') }}
            </p>
        </div>

        <!-- Tabs -->
        <div class="flex gap-2 mb-6 border-b border-gray-700 pb-2 overflow-x-auto">
            <button
                v-for="tab in tabs"
                :key="tab.id"
                :class="[
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                    activeTab === tab.id
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-400 hover:bg-gray-700 hover:text-white',
                ]"
                @click="activeTab = tab.id as typeof activeTab"
            >
                <IconRenderer :emoji="tab.icon" class="w-5 h-5" />
                <span>{{ tab.label }}</span>
                <span
                    v-if="tab.comingSoon"
                    class="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-blue-900/50 text-blue-200 rounded border border-blue-700/50"
                >
                    {{ t('settings.integrations.coming_soon') }}
                </span>
                <span v-if="tab.connected" class="w-2 h-2 bg-green-500 rounded-full" />
            </button>
        </div>

        <!-- Tab Content -->
        <div class="bg-gray-800 rounded-xl p-6">
            <!-- Slack Tab -->
            <div v-if="activeTab === 'slack'" class="space-y-6">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div
                            class="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center text-2xl"
                        >
                            <IconRenderer emoji="💬" class="w-6 h-6" />
                        </div>
                        <div>
                            <h3 class="text-lg font-semibold text-white">Slack</h3>
                            <p class="text-gray-400 text-sm">
                                {{
                                    integrationStatus.slack.connected
                                        ? t('settings.integrations.status.connected_as', {
                                              name: slackConfig.teamName,
                                          })
                                        : t('settings.integrations.status.not_connected')
                                }}
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <template v-if="integrationStatus.slack.connected">
                            <button
                                :disabled="testingIntegration === 'slack'"
                                class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                                @click="testSlack"
                            >
                                {{
                                    testingIntegration === 'slack'
                                        ? t('settings.integrations.actions.testing')
                                        : t('settings.integrations.actions.test')
                                }}
                            </button>
                            <button
                                :disabled="loading"
                                class="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg transition-colors disabled:opacity-50"
                                @click="disconnectSlack"
                            >
                                연결 해제
                            </button>
                        </template>
                        <button
                            v-else
                            :disabled="loading"
                            class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
                            @click="connectSlack"
                        >
                            {{
                                loading
                                    ? t('settings.integrations.actions.connecting')
                                    : t('settings.integrations.slack.connect_btn')
                            }}
                        </button>
                    </div>
                </div>

                <template v-if="integrationStatus.slack.connected">
                    <div class="border-t border-gray-700 pt-6">
                        <h4 class="text-sm font-medium text-gray-300 mb-4">
                            {{ t('settings.integrations.settings.notification_header') }}
                        </h4>
                        <div class="space-y-3">
                            <label class="flex items-center gap-3 cursor-pointer">
                                <input
                                    v-model="slackConfig.notifyOnTaskComplete"
                                    type="checkbox"
                                    class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                                />
                                <span class="text-gray-300">{{
                                    t('settings.integrations.settings.notify_task_complete')
                                }}</span>
                            </label>
                            <label class="flex items-center gap-3 cursor-pointer">
                                <input
                                    v-model="slackConfig.notifyOnMention"
                                    type="checkbox"
                                    class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                                />
                                <span class="text-gray-300">{{
                                    t('settings.integrations.settings.notify_mention')
                                }}</span>
                            </label>
                            <label class="flex items-center gap-3 cursor-pointer">
                                <input
                                    v-model="slackConfig.notifyOnError"
                                    type="checkbox"
                                    class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                                />
                                <span class="text-gray-300">{{
                                    t('settings.integrations.settings.notify_error')
                                }}</span>
                            </label>
                        </div>
                    </div>

                    <div class="border-t border-gray-700 pt-6">
                        <h4 class="text-sm font-medium text-gray-300 mb-4">
                            {{ t('settings.integrations.stats.header') }}
                        </h4>
                        <div class="grid grid-cols-3 gap-4">
                            <div class="bg-gray-700/50 rounded-lg p-3">
                                <div class="text-2xl font-bold text-white">
                                    {{ integrationStatus.slack.stats?.messagesSent || 0 }}
                                </div>
                                <div class="text-gray-400 text-sm">
                                    {{ t('settings.integrations.stats.messages_sent') }}
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
            </div>

            <!-- Discord Tab -->
            <div v-if="activeTab === 'discord'" class="space-y-6">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div
                            class="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-2xl"
                        >
                            <IconRenderer emoji="🎮" class="w-6 h-6" />
                        </div>
                        <div>
                            <h3 class="text-lg font-semibold text-white">Discord</h3>
                            <p class="text-gray-400 text-sm">
                                {{
                                    integrationStatus.discord.connected
                                        ? t('settings.integrations.status.connected_as', {
                                              name: discordConfig.webhookName,
                                          })
                                        : t('settings.integrations.discord.connect_via_webhook')
                                }}
                            </p>
                        </div>
                    </div>
                    <div v-if="integrationStatus.discord.connected" class="flex items-center gap-2">
                        <button
                            :disabled="testingIntegration === 'discord'"
                            class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                            @click="testDiscord"
                        >
                            {{
                                testingIntegration === 'discord'
                                    ? t('settings.integrations.actions.testing')
                                    : t('settings.integrations.actions.test')
                            }}
                        </button>
                        <button
                            class="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg transition-colors"
                            @click="disconnectDiscord"
                        >
                            {{ t('settings.integrations.actions.disconnect') }}
                        </button>
                    </div>
                </div>

                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-300 mb-2">{{
                            t('settings.integrations.discord.webhook_url_label')
                        }}</label>
                        <div class="flex gap-2">
                            <input
                                v-model="discordConfig.webhookUrl"
                                type="url"
                                placeholder="https://discord.com/api/webhooks/..."
                                class="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            />
                            <button
                                :disabled="loading || !discordConfig.webhookUrl"
                                class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
                                @click="saveDiscordWebhook"
                            >
                                {{
                                    loading
                                        ? t('settings.integrations.actions.checking')
                                        : t('settings.integrations.actions.save')
                                }}
                            </button>
                        </div>
                    </div>

                    <template v-if="integrationStatus.discord.connected">
                        <div class="border-t border-gray-700 pt-4">
                            <h4 class="text-sm font-medium text-gray-300 mb-4">
                                {{ t('settings.integrations.settings.notification_header') }}
                            </h4>
                            <div class="space-y-3">
                                <label class="flex items-center gap-3 cursor-pointer">
                                    <input
                                        v-model="discordConfig.notifyOnTaskComplete"
                                        type="checkbox"
                                        class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span class="text-gray-300">{{
                                        t('settings.integrations.settings.notify_task_complete')
                                    }}</span>
                                </label>
                                <label class="flex items-center gap-3 cursor-pointer">
                                    <input
                                        v-model="discordConfig.notifyOnProjectUpdate"
                                        type="checkbox"
                                        class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span class="text-gray-300">{{
                                        t('settings.integrations.settings.notify_project_update')
                                    }}</span>
                                </label>
                                <label class="flex items-center gap-3 cursor-pointer">
                                    <input
                                        v-model="discordConfig.notifyOnError"
                                        type="checkbox"
                                        class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span class="text-gray-300">{{
                                        t('settings.integrations.settings.notify_error')
                                    }}</span>
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
                        :class="[
                            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                            selectedGitProvider === provider
                                ? 'bg-gray-600 text-white'
                                : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700',
                        ]"
                        @click="selectedGitProvider = provider"
                    >
                        <IconRenderer
                            :emoji="
                                provider === 'github' ? '🐙' : provider === 'gitlab' ? '🦊' : '🪣'
                            "
                            class="w-5 h-5"
                        />
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
                            <div
                                class="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center text-xl"
                            >
                                <IconRenderer
                                    :emoji="
                                        selectedGitProvider === 'github'
                                            ? '🐙'
                                            : selectedGitProvider === 'gitlab'
                                              ? '🦊'
                                              : '🪣'
                                    "
                                    class="w-5 h-5"
                                />
                            </div>
                            <div>
                                <h4 class="text-white font-medium capitalize">
                                    {{ selectedGitProvider }}
                                </h4>
                                <p class="text-gray-400 text-sm">
                                    {{
                                        selectedGitStatus.connected
                                            ? `@${selectedGitConfig.username}`
                                            : t('settings.integrations.status.not_connected')
                                    }}
                                </p>
                            </div>
                        </div>
                        <template v-if="selectedGitStatus.connected">
                            <button
                                :disabled="loading"
                                class="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg transition-colors disabled:opacity-50"
                                @click="disconnectGitProvider(selectedGitProvider)"
                            >
                                {{ t('settings.integrations.actions.disconnect') }}
                            </button>
                        </template>
                        <button
                            v-else
                            :disabled="loading"
                            class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
                            @click="connectGitProvider(selectedGitProvider)"
                        >
                            {{
                                loading
                                    ? t('settings.integrations.actions.connecting')
                                    : t('settings.integrations.actions.connect')
                            }}
                        </button>
                    </div>

                    <template v-if="selectedGitStatus.connected">
                        <!-- Connected Repositories -->
                        <div class="border-t border-gray-700 pt-4">
                            <h5 class="text-sm font-medium text-gray-300 mb-3">
                                {{ t('settings.integrations.git.connected_repos') }}
                            </h5>

                            <div class="space-y-2 mb-4">
                                <div
                                    v-for="repo in selectedGitConfig.repositories"
                                    :key="repo.id"
                                    class="flex items-center justify-between bg-gray-700/50 rounded-lg px-3 py-2"
                                >
                                    <div class="flex items-center gap-2">
                                        <IconRenderer emoji="📁" class="w-4 h-4" />
                                        <span class="text-white text-sm">{{ repo.fullName }}</span>
                                    </div>
                                    <button
                                        class="text-gray-400 hover:text-red-400 transition-colors"
                                        @click="removeRepository(selectedGitProvider, repo.id)"
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

                                <div
                                    v-if="selectedGitConfig.repositories.length === 0"
                                    class="text-gray-500 text-sm text-center py-4"
                                >
                                    {{ t('settings.integrations.git.no_repos') }}
                                </div>
                            </div>

                            <!-- Add Repository -->
                            <div class="flex gap-2">
                                <input
                                    v-model="newRepoUrl"
                                    type="url"
                                    :placeholder="
                                        t('settings.integrations.git.placeholder_repo_url')
                                    "
                                    class="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                />
                                <button
                                    :disabled="!newRepoUrl"
                                    class="px-3 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                                    @click="addRepository"
                                >
                                    {{ t('settings.integrations.actions.add') }}
                                </button>
                            </div>
                        </div>

                        <!-- Settings -->
                        <div class="border-t border-gray-700 pt-4 mt-4">
                            <h5 class="text-sm font-medium text-gray-300 mb-3">
                                {{ t('settings.integrations.settings.header') }}
                            </h5>
                            <div class="space-y-3">
                                <label class="flex items-center gap-3 cursor-pointer">
                                    <input
                                        v-model="selectedGitConfig.autoLinkCommits"
                                        type="checkbox"
                                        class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span class="text-gray-300 text-sm">{{
                                        t('settings.integrations.git.auto_link_commits')
                                    }}</span>
                                </label>
                                <label class="flex items-center gap-3 cursor-pointer">
                                    <input
                                        v-model="selectedGitConfig.autoLinkPRs"
                                        type="checkbox"
                                        class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span class="text-gray-300 text-sm">{{
                                        t('settings.integrations.git.auto_link_prs')
                                    }}</span>
                                </label>
                                <div class="flex items-center gap-3">
                                    <span class="text-gray-300 text-sm">{{
                                        t('settings.integrations.git.branch_prefix')
                                    }}</span>
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
                        <div
                            class="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center text-2xl"
                        >
                            📁
                        </div>
                        <div>
                            <h3 class="text-lg font-semibold text-white">Google Drive</h3>
                            <p class="text-gray-400 text-sm">
                                {{
                                    integrationStatus.googleDrive.connected
                                        ? t('settings.integrations.drive.status_connected')
                                        : t('settings.integrations.drive.status_not_connected')
                                }}
                            </p>
                        </div>
                    </div>
                    <div
                        v-if="integrationStatus.googleDrive.connected"
                        class="flex items-center gap-2"
                    >
                        <button
                            :disabled="loading"
                            class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                            @click="syncSkills"
                        >
                            {{
                                loading
                                    ? t('settings.integrations.actions.syncing')
                                    : t('settings.integrations.actions.sync_now')
                            }}
                        </button>
                        <button
                            :disabled="loading"
                            class="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg transition-colors disabled:opacity-50"
                            @click="disconnectGoogleDrive"
                        >
                            {{ t('settings.integrations.actions.disconnect') }}
                        </button>
                    </div>
                    <button
                        v-else
                        :disabled="loading"
                        class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
                        @click="connectGoogleDrive"
                    >
                        {{
                            loading
                                ? t('settings.integrations.actions.connecting')
                                : t('settings.integrations.drive.connect_btn')
                        }}
                    </button>
                </div>

                <template v-if="integrationStatus.googleDrive.connected">
                    <!-- Folder Selection -->
                    <div class="border-t border-gray-700 pt-6">
                        <h4 class="text-sm font-medium text-gray-300 mb-4">
                            {{ t('settings.integrations.drive.skills_folder') }}
                        </h4>
                        <div class="flex items-center gap-4">
                            <div class="flex-1 bg-gray-700/50 rounded-lg px-4 py-3">
                                <div
                                    v-if="googleDriveConfig.folderName"
                                    class="flex items-center gap-2"
                                >
                                    <span class="text-yellow-500">📁</span>
                                    <span class="text-white">{{
                                        googleDriveConfig.folderName
                                    }}</span>
                                    <span class="text-gray-500 text-sm"
                                        >({{ googleDriveConfig.folderId }})</span
                                    >
                                </div>
                                <div v-else class="text-gray-400">
                                    {{ t('settings.integrations.drive.no_folder_selected') }}
                                </div>
                            </div>
                            <button
                                class="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
                                @click="selectSkillsFolder"
                            >
                                {{ t('settings.integrations.actions.select_folder') }}
                            </button>
                        </div>
                    </div>

                    <!-- Sync Settings -->
                    <div class="border-t border-gray-700 pt-6">
                        <h4 class="text-sm font-medium text-gray-300 mb-4">
                            {{ t('settings.integrations.drive.sync_settings') }}
                        </h4>
                        <div class="space-y-4">
                            <label class="flex items-center gap-3 cursor-pointer">
                                <input
                                    v-model="googleDriveConfig.autoSync"
                                    type="checkbox"
                                    class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                                />
                                <span class="text-gray-300">{{
                                    t('settings.integrations.drive.auto_sync')
                                }}</span>
                            </label>
                            <div
                                v-if="googleDriveConfig.autoSync"
                                class="flex items-center gap-3 ml-7"
                            >
                                <span class="text-gray-400 text-sm">{{
                                    t('settings.integrations.drive.sync_interval')
                                }}</span>
                                <select
                                    v-model="googleDriveConfig.syncIntervalMinutes"
                                    class="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                >
                                    <option :value="15">
                                        {{ t('settings.integrations.drive.interval_15m') }}
                                    </option>
                                    <option :value="30">
                                        {{ t('settings.integrations.drive.interval_30m') }}
                                    </option>
                                    <option :value="60">
                                        {{ t('settings.integrations.drive.interval_1h') }}
                                    </option>
                                    <option :value="120">
                                        {{ t('settings.integrations.drive.interval_2h') }}
                                    </option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Stats -->
                    <div class="border-t border-gray-700 pt-6">
                        <h4 class="text-sm font-medium text-gray-300 mb-4">
                            {{ t('settings.integrations.stats.header') }}
                        </h4>
                        <div class="grid grid-cols-2 gap-4">
                            <div class="bg-gray-700/50 rounded-lg p-3">
                                <div class="text-2xl font-bold text-white">
                                    {{ integrationStatus.googleDrive.stats?.skillsSynced || 0 }}
                                </div>
                                <div class="text-gray-400 text-sm">
                                    {{ t('settings.integrations.stats.skills_synced') }}
                                </div>
                            </div>
                            <div class="bg-gray-700/50 rounded-lg p-3">
                                <div class="text-lg font-medium text-white">
                                    {{
                                        integrationStatus.googleDrive.lastSync?.toLocaleString() ||
                                        '-'
                                    }}
                                </div>
                                <div class="text-gray-400 text-sm">
                                    {{ t('settings.integrations.stats.last_sync') }}
                                </div>
                            </div>
                        </div>
                    </div>
                </template>
            </div>

            <!-- Webhooks Tab -->
            <div v-if="activeTab === 'webhooks'" class="space-y-6">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="text-lg font-semibold text-white">
                            {{ t('settings.integrations.webhooks.header') }}
                        </h3>
                        <p class="text-gray-400 text-sm">
                            {{
                                t('settings.integrations.webhooks.active_count', {
                                    count: activeWebhooksCount,
                                })
                            }}
                        </p>
                    </div>
                    <button
                        class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                        @click="openNewWebhookModal"
                    >
                        + {{ t('settings.integrations.webhooks.add_btn') }}
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
                                    :class="[
                                        'relative w-10 h-6 rounded-full transition-colors',
                                        webhook.active ? 'bg-green-600' : 'bg-gray-600',
                                    ]"
                                    @click="toggleWebhook(webhook.id)"
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
                                    <div class="text-gray-400 text-sm truncate max-w-md">
                                        {{ webhook.url }}
                                    </div>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <button
                                    :disabled="testingIntegration === webhook.id"
                                    class="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded transition-colors disabled:opacity-50"
                                    @click="testWebhook(webhook.id)"
                                >
                                    {{
                                        testingIntegration === webhook.id
                                            ? '...'
                                            : t('settings.integrations.actions.test')
                                    }}
                                </button>
                                <button
                                    class="p-1 text-gray-400 hover:text-red-400 transition-colors"
                                    @click="deleteWebhook(webhook.id)"
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
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                        />
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
                                {{ webhookEvents.find((e) => e.value === event)?.label || event }}
                            </span>
                        </div>
                        <div v-if="webhook.failureCount > 0" class="mt-2">
                            <span class="text-red-400 text-sm"
                                >⚠️
                                {{
                                    t('settings.integrations.webhooks.failure_count', {
                                        count: webhook.failureCount,
                                    })
                                }}</span
                            >
                        </div>
                    </div>

                    <div v-if="webhooks.length === 0" class="text-center py-8 text-gray-500">
                        {{ t('settings.integrations.webhooks.no_webhooks') }}
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
                    <h3 class="text-lg font-semibold text-white mb-4">
                        {{ t('settings.integrations.webhooks.modal.title') }}
                    </h3>

                    <div class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-300 mb-1">{{
                                t('settings.integrations.webhooks.modal.name_label')
                            }}</label>
                            <input
                                v-model="newWebhookForm.name"
                                type="text"
                                :placeholder="
                                    t('settings.integrations.webhooks.modal.placeholder_name')
                                "
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
                            <label class="block text-sm font-medium text-gray-300 mb-1">{{
                                t('settings.integrations.webhooks.modal.events_label')
                            }}</label>
                            <div class="grid grid-cols-2 gap-2 mt-2">
                                <label
                                    v-for="event in webhookEvents"
                                    :key="event.value"
                                    class="flex items-center gap-2 cursor-pointer"
                                >
                                    <input
                                        type="checkbox"
                                        :checked="newWebhookForm.events.includes(event.value)"
                                        class="w-4 h-4 rounded bg-gray-700 border-gray-600 text-blue-600 focus:ring-blue-500"
                                        @change="toggleWebhookEvent(event.value)"
                                    />
                                    <span class="text-gray-300 text-sm">{{ event.label }}</span>
                                </label>
                            </div>
                        </div>

                        <div>
                            <label class="block text-sm font-medium text-gray-300 mb-1">{{
                                t('settings.integrations.webhooks.modal.secret_label')
                            }}</label>
                            <input
                                v-model="newWebhookForm.secret"
                                type="password"
                                :placeholder="
                                    t('settings.integrations.webhooks.modal.placeholder_secret')
                                "
                                class="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    <div class="flex justify-end gap-2 mt-6">
                        <button
                            class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                            @click="showNewWebhookModal = false"
                        >
                            {{ t('settings.integrations.actions.cancel') }}
                        </button>
                        <button
                            :disabled="
                                loading ||
                                !newWebhookForm.name ||
                                !newWebhookForm.url ||
                                newWebhookForm.events.length === 0
                            "
                            class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
                            @click="createWebhook"
                        >
                            {{
                                loading
                                    ? t('settings.integrations.actions.creating')
                                    : t('settings.integrations.actions.create')
                            }}
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
