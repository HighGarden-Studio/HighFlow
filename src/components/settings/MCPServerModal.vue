<script setup lang="ts">
/**
 * MCPServerModal Component
 *
 * Modal for configuring MCP server settings
 */
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    useSettingsStore,
    type MCPServerConfig,
    type MCPServerTag,
    type MCPPermissionId,
    type MCPPermissionMap,
    MCP_PERMISSION_DEFINITIONS,
} from '../../renderer/stores/settingsStore';

interface Props {
    server: MCPServerConfig | null;
    open: boolean;
}

const props = defineProps<Props>();
const settingsStore = useSettingsStore();
const { t } = useI18n();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'save', config: Partial<MCPServerConfig>): void;
}>();

// Form State
const form = ref({
    enabled: false,
    command: '',
    args: [] as string[],
    config: {} as Record<string, any>,
    permissions: {
        read: false,
        write: false,
        delete: false,
        execute: false,
        network: false,
        secrets: false,
    } as MCPPermissionMap,
    scopes: [] as string[],
});

const argsString = ref('');
const isConnecting = ref(false);
const connectionResult = ref<'success' | 'error' | null>(null);
const connectionMessage = ref('');
const isInstalling = ref(false);
const installResult = ref<'success' | 'error' | null>(null);
const installMessage = ref('');
const installLog = ref('');
const featureSelections = ref<Record<string, boolean>>({});
const permissionDefinitions = MCP_PERMISSION_DEFINITIONS;
const permissionCategoryLabels: Record<string, string> = {
    filesystem: 'settings.mcp.modal.permissions.category.filesystem',
    system: 'settings.mcp.modal.permissions.category.system',
    network: 'settings.mcp.modal.permissions.category.network',
    data: 'settings.mcp.modal.permissions.category.data',
};

const hasFeatureScopes = computed(() => (props.server?.featureScopes?.length || 0) > 0);

const permissionGroups = computed(() => {
    const groups: Record<string, typeof permissionDefinitions> = {};
    for (const definition of permissionDefinitions) {
        const category = definition.category;
        if (!groups[category]) {
            groups[category] = [];
        }
        groups[category]!.push(definition);
    }
    return Object.entries(groups).map(([category, definitions]) => ({
        category,
        definitions,
    }));
});

// Watch for server changes
watch(
    () => props.server,
    (newServer) => {
        if (newServer) {
            const config = newServer.config ? { ...newServer.config } : {};

            // Special handling for GitHub MCP token
            if (
                (newServer.id === 'github' || newServer.id === 'github-remote') &&
                config.env?.GITHUB_PERSONAL_ACCESS_TOKEN
            ) {
                config.token = config.env.GITHUB_PERSONAL_ACCESS_TOKEN;
            }

            form.value = {
                enabled: newServer.enabled,
                command: newServer.command || '',
                args: newServer.args ? [...newServer.args] : [],
                config,
                permissions: settingsStore.buildMCPPermissionsFor(newServer),
                scopes: newServer.scopes ? [...newServer.scopes] : [],
            };
            argsString.value = newServer.args?.join(' ') || '';
            connectionResult.value = null;
            connectionMessage.value = '';
            installResult.value = null;
            installMessage.value = '';
            installLog.value = '';
            initializeFeatureSelections(newServer);
        }
    },
    { immediate: true }
);

// Server Info
const serverInfo = computed(() => {
    const info: Record<string, { color: string; iconBg: string }> = {
        filesystem: { color: 'from-blue-400 to-cyan-500', iconBg: 'bg-blue-600' },
        shell: { color: 'from-gray-600 to-gray-800', iconBg: 'bg-gray-700' },
        git: { color: 'from-orange-400 to-red-500', iconBg: 'bg-orange-600' },
        fetch: { color: 'from-green-400 to-teal-500', iconBg: 'bg-green-600' },
        jira: { color: 'from-blue-500 to-indigo-600', iconBg: 'bg-blue-700' },
        confluence: { color: 'from-blue-500 to-indigo-600', iconBg: 'bg-blue-700' },
        aws: { color: 'from-orange-500 to-yellow-600', iconBg: 'bg-orange-600' },
        kubernetes: { color: 'from-blue-400 to-blue-600', iconBg: 'bg-blue-600' },
        sqlite: { color: 'from-blue-300 to-cyan-400', iconBg: 'bg-blue-500' },
        postgres: { color: 'from-blue-400 to-indigo-500', iconBg: 'bg-blue-600' },
        'brave-search': { color: 'from-orange-400 to-red-500', iconBg: 'bg-orange-600' },
        memory: { color: 'from-purple-400 to-pink-500', iconBg: 'bg-purple-600' },
        puppeteer: { color: 'from-green-400 to-teal-500', iconBg: 'bg-green-600' },
        playwright: { color: 'from-green-500 to-emerald-600', iconBg: 'bg-green-600' },
        github: { color: 'from-gray-700 to-gray-900', iconBg: 'bg-gray-800' },
        'github-remote': { color: 'from-gray-700 to-gray-900', iconBg: 'bg-gray-800' },
        'gitlab-mcp': { color: 'from-orange-500 to-red-600', iconBg: 'bg-orange-600' },
        'slack-mcp': { color: 'from-purple-500 to-pink-600', iconBg: 'bg-purple-600' },
        'notion-mcp': { color: 'from-gray-800 to-black', iconBg: 'bg-gray-900' },
        'google-drive': { color: 'from-yellow-400 to-green-500', iconBg: 'bg-yellow-500' },
        'figma-mcp': { color: 'from-pink-400 to-purple-500', iconBg: 'bg-pink-600' },
        'framer-mcp': { color: 'from-indigo-400 to-purple-500', iconBg: 'bg-indigo-600' },
        'penpot-mcp': { color: 'from-green-400 to-emerald-500', iconBg: 'bg-emerald-600' },
        'sequential-thinking': { color: 'from-purple-400 to-indigo-500', iconBg: 'bg-purple-600' },
        sentry: { color: 'from-purple-500 to-pink-600', iconBg: 'bg-purple-600' },
    };
    return (
        info[props.server?.id || ''] || {
            color: 'from-gray-400 to-gray-500',
            iconBg: 'bg-gray-600',
        }
    );
});

// Icon for server
const serverIcon = computed(() => {
    const icons: Record<string, string> = {
        filesystem: '📁',
        shell: '💻',
        git: '🔀',
        fetch: '🌐',
        jira: '📋',
        confluence: '📝',
        aws: '☁️',
        kubernetes: '🚢',
        sqlite: '🗄️',
        postgres: '🐘',
        'brave-search': '🔍',
        memory: '✨',
        puppeteer: '🎭',
        playwright: '🎬',
        github: '🐙',
        'github-remote': '🐙',
        'gitlab-mcp': '🦊',
        'slack-mcp': '💬',
        'notion-mcp': '📓',
        'google-drive': '📂',
        'figma-mcp': '🎨',
        'framer-mcp': '🧭',
        'penpot-mcp': '✏️',
        'sequential-thinking': '🧩',
        sentry: '🐛',
    };
    return icons[props.server?.id || ''] || '🔧';
});

// Get config fields based on server type
const configFields = computed(() => {
    if (!props.server) return [];

    const fields: Record<
        string,
        Array<{
            key: string;
            label: string;
            type: 'text' | 'password' | 'url';
            placeholder: string;
            required?: boolean;
        }>
    > = {
        filesystem: [
            {
                key: 'allowedPaths',
                label: t('settings.mcp.modal.config.filesystem.allowedPaths'),
                type: 'text',
                placeholder: '/path/to/dir1, /path/to/dir2',
            },
        ],
        git: [
            {
                key: 'repository',
                label: t('settings.mcp.modal.config.git.repository'),
                type: 'text',
                placeholder: '/path/to/repository',
                required: true,
            },
        ],
        jira: [
            {
                key: 'baseUrl',
                label: t('settings.mcp.modal.config.jira.baseUrl'),
                type: 'url',
                placeholder: 'https://your-domain.atlassian.net',
                required: true,
            },
            {
                key: 'username',
                label: t('settings.mcp.modal.config.jira.username'),
                type: 'text',
                placeholder: 'your@email.com',
                required: true,
            },
            {
                key: 'token',
                label: t('settings.mcp.modal.config.jira.token'),
                type: 'password',
                placeholder: 'Your Jira API token',
                required: true,
            },
        ],
        confluence: [
            {
                key: 'baseUrl',
                label: t('settings.mcp.modal.config.confluence.baseUrl'),
                type: 'url',
                placeholder: 'https://your-domain.atlassian.net',
                required: true,
            },
            {
                key: 'username',
                label: t('settings.mcp.modal.config.confluence.username'),
                type: 'text',
                placeholder: 'your@email.com',
                required: true,
            },
            {
                key: 'token',
                label: t('settings.mcp.modal.config.confluence.token'),
                type: 'password',
                placeholder: 'Your Confluence API token',
                required: true,
            },
        ],
        aws: [
            {
                key: 'region',
                label: t('settings.mcp.modal.config.aws.region'),
                type: 'text',
                placeholder: 'us-east-1',
                required: true,
            },
            {
                key: 'accessKeyId',
                label: t('settings.mcp.modal.config.aws.accessKeyId'),
                type: 'text',
                placeholder: 'AKIA...',
                required: true,
            },
            {
                key: 'secretAccessKey',
                label: t('settings.mcp.modal.config.aws.secretAccessKey'),
                type: 'password',
                placeholder: 'Your secret key',
                required: true,
            },
        ],
        kubernetes: [
            {
                key: 'kubeconfig',
                label: t('settings.mcp.modal.config.kubernetes.kubeconfig'),
                type: 'text',
                placeholder: '~/.kube/config',
            },
            {
                key: 'context',
                label: t('settings.mcp.modal.config.kubernetes.context'),
                type: 'text',
                placeholder: 'default',
            },
        ],
        sqlite: [
            {
                key: 'dbPath',
                label: t('settings.mcp.modal.config.sqlite.dbPath'),
                type: 'text',
                placeholder: '/path/to/database.db',
                required: true,
            },
        ],
        postgres: [
            {
                key: 'connectionString',
                label: t('settings.mcp.modal.config.postgres.connectionString'),
                type: 'password',
                placeholder: 'postgresql://user:pass@host:5432/db',
                required: true,
            },
        ],
        'brave-search': [
            {
                key: 'apiKey',
                label: t('settings.mcp.modal.config.brave_search.apiKey'),
                type: 'password',
                placeholder: 'Your Brave Search API key',
                required: true,
            },
        ],
        github: [
            {
                key: 'token',
                label: t('settings.mcp.modal.config.github_mcp.token'),
                type: 'password',
                placeholder: 'ghp_...',
                required: true,
            },
        ],
        'github-remote': [
            {
                key: 'token',
                label: t('settings.mcp.modal.config.github_mcp.token'),
                type: 'password',
                placeholder: 'ghp_...',
                required: true,
            },
        ],
        'gitlab-mcp': [
            {
                key: 'baseUrl',
                label: t('settings.mcp.modal.config.gitlab_mcp.baseUrl'),
                type: 'url',
                placeholder: 'https://gitlab.com',
            },
            {
                key: 'token',
                label: t('settings.mcp.modal.config.gitlab_mcp.token'),
                type: 'password',
                placeholder: 'glpat-...',
                required: true,
            },
        ],
        'slack-mcp': [
            {
                key: 'token',
                label: t('settings.mcp.modal.config.slack_mcp.token'),
                type: 'password',
                placeholder: 'xoxb-...',
                required: true,
            },
        ],
        'notion-mcp': [
            {
                key: 'token',
                label: t('settings.mcp.modal.config.notion_mcp.token'),
                type: 'password',
                placeholder: 'secret_...',
                required: true,
            },
        ],
        'google-drive': [
            {
                key: 'clientId',
                label: t('settings.mcp.modal.config.google_drive.clientId'),
                type: 'text',
                placeholder: 'Your Google OAuth Client ID',
                required: true,
            },
            {
                key: 'clientSecret',
                label: t('settings.mcp.modal.config.google_drive.clientSecret'),
                type: 'password',
                placeholder: 'Your Google OAuth Client Secret',
                required: true,
            },
        ],
        sentry: [
            {
                key: 'authToken',
                label: t('settings.mcp.modal.config.sentry.authToken'),
                type: 'password',
                placeholder: 'Your Sentry auth token',
                required: true,
            },
            {
                key: 'organization',
                label: t('settings.mcp.modal.config.sentry.organization'),
                type: 'text',
                placeholder: 'your-org',
                required: true,
            },
        ],
    };

    return fields[props.server.id] || [];
});

const isRemoteServer = computed(() => {
    return props.server?.id === 'github-remote';
});

// Check if all required fields are filled
const isConfigValid = computed(() => {
    for (const field of configFields.value) {
        if (field.required && !form.value.config[field.key]) {
            return false;
        }
    }
    return true;
});

const supportsInstall = computed(() => !!props.server?.installCommand);
const installLogText = computed(() => installLog.value || props.server?.installLog || '');
const lastInstalledAt = computed(() =>
    props.server?.lastInstalledAt ? new Date(props.server.lastInstalledAt).toLocaleString() : null
);

// Actions
function handleSave() {
    // Parse args from string
    const args = argsString.value.trim()
        ? argsString.value.trim().split(/\s+/)
        : props.server?.args || [];

    const config = { ...form.value.config };

    emit('save', {
        enabled: form.value.enabled,
        command: form.value.command || props.server?.command,
        args,
        config,
        permissions: { ...form.value.permissions },
        scopes: [...form.value.scopes],
    });
}

async function handleConnect() {
    if (!props.server) return;

    isConnecting.value = true;
    connectionResult.value = null;
    connectionMessage.value = '';

    try {
        // First save the configuration
        const args = argsString.value.trim()
            ? argsString.value.trim().split(/\s+/)
            : props.server?.args || [];

        await settingsStore.updateMCPServer(props.server.id, {
            command: form.value.command || props.server.command,
            args,
            config: form.value.config,
            permissions: { ...form.value.permissions },
            scopes: [...form.value.scopes],
        });

        // Try to connect
        await settingsStore.connectMCPServer(props.server.id);
        connectionResult.value = 'success';
        connectionMessage.value = t('settings.mcp.modal.status.connection_success');
        form.value.enabled = true;
    } catch (error) {
        connectionResult.value = 'error';
        connectionMessage.value =
            error instanceof Error
                ? error.message
                : t('settings.mcp.modal.status.connection_failed');
    } finally {
        isConnecting.value = false;
    }
}

async function handleDisconnect() {
    if (!props.server) return;

    await settingsStore.disconnectMCPServer(props.server.id);
    form.value.enabled = false;
    connectionResult.value = null;
    connectionMessage.value = '';
}

async function handleInstall() {
    if (!props.server || !props.server.installCommand) return;

    isInstalling.value = true;
    installResult.value = null;
    installMessage.value = '';
    installLog.value = '';

    try {
        const result = await settingsStore.installMCPServer(props.server.id);
        installResult.value = 'success';
        installMessage.value = t('settings.mcp.modal.status.install_success');
        installLog.value = result.stdout || result.stderr || '';
    } catch (error) {
        installResult.value = 'error';
        installMessage.value =
            error instanceof Error ? error.message : t('settings.mcp.modal.status.install_failed');
        installLog.value = '';
    } finally {
        isInstalling.value = false;
    }
}

function handleClose() {
    emit('close');
}

function updateConfigField(key: string, value: string) {
    form.value.config = {
        ...form.value.config,
        [key]: value,
    };
}

function togglePermission(permissionId: MCPPermissionId, value: boolean) {
    form.value.permissions = {
        ...form.value.permissions,
        [permissionId]: value,
    };
}

function isPermissionEnabled(permissionId: MCPPermissionId): boolean {
    return Boolean(form.value.permissions?.[permissionId]);
}

function resetPermissions() {
    if (!props.server) return;
    form.value.permissions = settingsStore.buildMCPPermissionsFor(props.server);
}

function initializeFeatureSelections(server: MCPServerConfig) {
    if (!server.featureScopes || server.featureScopes.length === 0) {
        featureSelections.value = {};
        form.value.scopes = server.scopes ? [...server.scopes] : [];
        return;
    }
    const currentScopes = new Set(server.scopes || []);
    const selections: Record<string, boolean> = {};
    for (const feature of server.featureScopes) {
        const enabled = feature.requiredScopes.every((scope) => currentScopes.has(scope));
        selections[feature.id] = enabled;
    }
    featureSelections.value = selections;
    syncScopesWithSelections();
}

function syncScopesWithSelections() {
    if (!props.server?.featureScopes || props.server.featureScopes.length === 0) {
        return;
    }
    const selected = new Set<string>();
    for (const feature of props.server.featureScopes) {
        if (featureSelections.value[feature.id]) {
            feature.requiredScopes.forEach((scope) => {
                if (scope) {
                    selected.add(scope);
                }
            });
        }
    }
    form.value.scopes = Array.from(selected);
}

function toggleFeatureScope(featureId: string, value: boolean) {
    featureSelections.value = {
        ...featureSelections.value,
        [featureId]: value,
    };
    syncScopesWithSelections();
}

function isFeatureScopeEnabled(featureId: string): boolean {
    return Boolean(featureSelections.value[featureId]);
}

function resetFeatureScopes() {
    if (!props.server) return;
    const defaults: Record<string, boolean> = {};
    if (props.server.featureScopes) {
        for (const feature of props.server.featureScopes) {
            defaults[feature.id] = Boolean(feature.defaultEnabled);
        }
    }
    featureSelections.value = defaults;
    syncScopesWithSelections();
}

// Helper to get tag display
function getTagLabel(tag: MCPServerTag): string {
    return t(settingsStore.getMCPTagDisplayName(tag));
}
</script>

<template>
    <Teleport to="body">
        <div
            v-if="open && server"
            class="fixed inset-0 z-50 overflow-y-auto"
            @click.self="handleClose"
        >
            <!-- Backdrop -->
            <div
                class="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
                @click="handleClose"
            />

            <!-- Modal -->
            <div class="flex min-h-full items-center justify-center p-4">
                <div
                    class="relative w-full max-w-lg transform transition-all flex flex-col max-h-[85vh]"
                >
                    <div
                        class="bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden flex flex-col h-full"
                    >
                        <!-- Header -->
                        <div
                            class="relative px-6 py-5 border-b border-gray-200 dark:border-gray-700"
                        >
                            <div
                                :class="[
                                    'absolute inset-0 opacity-10 bg-gradient-to-r',
                                    serverInfo.color,
                                ]"
                            />
                            <div class="relative flex items-center gap-4">
                                <div
                                    :class="[
                                        'w-12 h-12 rounded-xl flex items-center justify-center text-2xl',
                                        serverInfo.iconBg,
                                    ]"
                                >
                                    {{ serverIcon }}
                                </div>
                                <div class="flex-1">
                                    <h2 class="text-xl font-semibold text-gray-900 dark:text-white">
                                        {{ server.name }}
                                    </h2>
                                    <p class="text-sm text-gray-500 dark:text-gray-400">
                                        {{ server.description ? t(server.description) : '' }}
                                    </p>
                                </div>
                                <!-- Server Links -->
                                <div class="flex items-center gap-2">
                                    <a
                                        v-if="server.website"
                                        :href="server.website"
                                        target="_blank"
                                        class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                        :title="t('settings.agents.actions.docs')"
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
                                                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                                            />
                                        </svg>
                                    </a>
                                    <a
                                        v-if="server.repository"
                                        :href="server.repository"
                                        target="_blank"
                                        class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                        title="GitHub"
                                    >
                                        <svg
                                            class="w-5 h-5"
                                            fill="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                    </a>
                                </div>
                            </div>

                            <!-- Close button -->
                            <button
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
                        <div class="px-6 py-4 space-y-6 flex-1 overflow-y-auto min-h-0">
                            <!-- Tags -->
                            <div class="flex flex-wrap gap-2">
                                <span
                                    v-for="tag in server.tags"
                                    :key="tag"
                                    class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                >
                                    {{ getTagLabel(tag) }}
                                </span>
                            </div>

                            <!-- Connection Status -->
                            <div
                                v-if="server.isConnected"
                                class="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg"
                            >
                                <div
                                    class="flex items-center gap-2 text-green-700 dark:text-green-300"
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
                                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                        />
                                    </svg>
                                    <span class="font-medium">{{
                                        t('settings.mcp.modal.status.connected')
                                    }}</span>
                                    <span
                                        v-if="server.lastValidated"
                                        class="text-sm text-green-600 dark:text-green-400 ml-auto"
                                    >
                                        {{ new Date(server.lastValidated).toLocaleDateString() }}
                                    </span>
                                </div>
                            </div>

                            <!-- Installation helper -->
                            <div
                                v-if="supportsInstall"
                                class="p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg space-y-3"
                            >
                                <div class="flex items-start justify-between gap-3">
                                    <div>
                                        <p
                                            class="text-sm font-medium text-gray-900 dark:text-white"
                                        >
                                            {{ t('settings.mcp.modal.install.local_install') }}
                                        </p>
                                        <p class="text-xs text-gray-500 dark:text-gray-400">
                                            {{ t('settings.mcp.modal.install.description') }}
                                        </p>
                                        <p
                                            v-if="lastInstalledAt"
                                            class="text-xs text-gray-500 dark:text-gray-400 mt-1"
                                        >
                                            {{
                                                t('settings.mcp.modal.install.last_installed', {
                                                    date: lastInstalledAt,
                                                })
                                            }}
                                        </p>
                                        <p
                                            v-else
                                            class="text-xs text-amber-600 dark:text-amber-400 mt-1"
                                        >
                                            {{ t('settings.mcp.modal.install.warning_connect') }}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        class="px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
                                        :disabled="isInstalling"
                                        @click.stop="handleInstall"
                                    >
                                        {{
                                            isInstalling
                                                ? t('settings.mcp.modal.install.button_installing')
                                                : server.installed
                                                  ? t('settings.mcp.modal.install.button_reinstall')
                                                  : t('settings.mcp.modal.install.button_install')
                                        }}
                                    </button>
                                </div>
                                <div
                                    v-if="installMessage"
                                    :class="[
                                        'text-xs',
                                        installResult === 'success'
                                            ? 'text-green-600 dark:text-green-400'
                                            : 'text-red-500',
                                    ]"
                                >
                                    {{ installMessage }}
                                </div>
                                <pre
                                    v-if="installLogText"
                                    class="text-xs bg-black/10 dark:bg-black/30 text-gray-800 dark:text-gray-200 rounded-lg p-2 overflow-x-auto max-h-32"
                                    >{{ installLogText }}</pre
                                >
                            </div>

                            <!-- Command & Args (advanced) -->
                            <div
                                v-if="!isRemoteServer"
                                class="space-y-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                            >
                                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {{ t('settings.mcp.modal.execution.title') }}
                                </h4>

                                <div>
                                    <label
                                        class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
                                        >{{ t('settings.mcp.modal.execution.command') }}</label
                                    >
                                    <input
                                        v-model="form.command"
                                        type="text"
                                        :placeholder="server.command || 'npx'"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>

                                <div>
                                    <label
                                        class="block text-sm text-gray-600 dark:text-gray-400 mb-1"
                                        >{{ t('settings.mcp.modal.execution.args') }}</label
                                    >
                                    <input
                                        v-model="argsString"
                                        type="text"
                                        :placeholder="server.args?.join(' ') || '-y @mcp/server'"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                            </div>

                            <!-- Configuration Fields -->
                            <div v-if="configFields.length > 0" class="space-y-4">
                                <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {{ t('settings.mcp.modal.config.title') }}
                                </h4>

                                <div
                                    v-for="field in configFields"
                                    :key="field.key"
                                    class="space-y-1"
                                >
                                    <label class="block text-sm text-gray-600 dark:text-gray-400">
                                        {{ field.label }}
                                        <span v-if="field.required" class="text-red-500">*</span>
                                    </label>
                                    <input
                                        :type="field.type"
                                        :value="form.config[field.key] || ''"
                                        :placeholder="field.placeholder"
                                        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        @input="
                                            updateConfigField(
                                                field.key,
                                                ($event.target as HTMLInputElement).value
                                            )
                                        "
                                    />
                                </div>
                            </div>

                            <!-- Permission Controls -->
                            <div class="space-y-4">
                                <div class="flex items-center justify-between">
                                    <h4
                                        class="text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        {{ t('settings.mcp.modal.permissions.title') }}
                                    </h4>
                                    <button
                                        type="button"
                                        class="text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                        @click="resetPermissions"
                                    >
                                        {{ t('settings.mcp.filter_reset') }}
                                    </button>
                                </div>
                                <div class="space-y-3">
                                    <div
                                        v-for="group in permissionGroups"
                                        :key="group.category"
                                        class="space-y-2"
                                    >
                                        <p
                                            class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide"
                                        >
                                            {{
                                                t(
                                                    permissionCategoryLabels[group.category] ||
                                                        group.category
                                                )
                                            }}
                                        </p>
                                        <div class="grid grid-cols-1 gap-2">
                                            <label
                                                v-for="permission in group.definitions"
                                                :key="permission.id"
                                                class="flex items-start justify-between gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-400 dark:hover:border-blue-400"
                                            >
                                                <div>
                                                    <div class="flex items-center gap-2">
                                                        <span class="text-lg">{{
                                                            permission.icon
                                                        }}</span>
                                                        <span
                                                            class="text-sm font-medium text-gray-900 dark:text-white"
                                                        >
                                                            {{ permission.label }}
                                                        </span>
                                                    </div>
                                                    <p
                                                        class="text-xs text-gray-500 dark:text-gray-400 mt-1"
                                                    >
                                                        {{ permission.description }}
                                                    </p>
                                                </div>
                                                <label
                                                    class="relative inline-flex items-center cursor-pointer"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        class="sr-only peer"
                                                        :checked="
                                                            isPermissionEnabled(
                                                                permission.id as MCPPermissionId
                                                            )
                                                        "
                                                        @change="
                                                            togglePermission(
                                                                permission.id as MCPPermissionId,
                                                                ($event.target as HTMLInputElement)
                                                                    .checked
                                                            )
                                                        "
                                                    />
                                                    <div
                                                        class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600"
                                                    ></div>
                                                </label>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <!-- Feature Scope Controls -->
                            <div v-if="hasFeatureScopes" class="space-y-4">
                                <div class="flex items-center justify-between">
                                    <h4
                                        class="text-sm font-medium text-gray-700 dark:text-gray-300"
                                    >
                                        Slack 기능별 권한
                                    </h4>
                                    <button
                                        type="button"
                                        class="text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                        @click="resetFeatureScopes"
                                    >
                                        기본값 복원
                                    </button>
                                </div>
                                <div class="space-y-3">
                                    <div
                                        v-for="feature in server.featureScopes"
                                        :key="feature.id"
                                        class="p-3 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg flex flex-col gap-2"
                                    >
                                        <div class="flex items-start justify-between gap-4">
                                            <div>
                                                <p
                                                    class="text-sm font-medium text-gray-900 dark:text-white"
                                                >
                                                    {{ feature.label }}
                                                </p>
                                                <p
                                                    class="text-xs text-gray-500 dark:text-gray-400 mt-1"
                                                >
                                                    {{ feature.description }}
                                                </p>
                                            </div>
                                            <label
                                                class="relative inline-flex items-center cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    class="sr-only peer"
                                                    :checked="isFeatureScopeEnabled(feature.id)"
                                                    @change="
                                                        toggleFeatureScope(
                                                            feature.id,
                                                            ($event.target as HTMLInputElement)
                                                                .checked
                                                        )
                                                    "
                                                />
                                                <div
                                                    class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600"
                                                ></div>
                                            </label>
                                        </div>
                                        <div class="flex flex-wrap gap-2">
                                            <span
                                                v-for="scope in feature.requiredScopes"
                                                :key="scope"
                                                class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-200"
                                            >
                                                {{ scope }}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Connection Result -->
                            <div
                                v-if="connectionResult"
                                :class="[
                                    'p-3 rounded-lg text-sm',
                                    connectionResult === 'success'
                                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300',
                                ]"
                            >
                                <div class="flex items-center gap-2">
                                    <svg
                                        v-if="connectionResult === 'success'"
                                        class="w-5 h-5 flex-shrink-0"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                        />
                                    </svg>
                                    <svg
                                        v-else
                                        class="w-5 h-5 flex-shrink-0"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                        />
                                    </svg>
                                    <span>{{ connectionMessage }}</span>
                                </div>
                            </div>

                            <!-- Enable Toggle -->
                            <div
                                class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                            >
                                <div>
                                    <p class="text-sm font-medium text-gray-900 dark:text-white">
                                        {{
                                            t('settings.mcp.modal.enable_toggle.label', {
                                                name: server.name,
                                            })
                                        }}
                                    </p>
                                    <p class="text-xs text-gray-500 dark:text-gray-400">
                                        {{ t('settings.mcp.modal.enable_toggle.description') }}
                                    </p>
                                </div>
                                <label class="relative inline-flex items-center cursor-pointer">
                                    <input
                                        v-model="form.enabled"
                                        type="checkbox"
                                        class="sr-only peer"
                                        :disabled="!server.isConnected && !isConfigValid"
                                    />
                                    <div
                                        class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-500 peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
                                    ></div>
                                </label>
                            </div>
                        </div>

                        <!-- Footer -->
                        <div
                            class="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
                        >
                            <div>
                                <button
                                    v-if="server.isConnected"
                                    type="button"
                                    class="px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors text-sm"
                                    @click="handleDisconnect"
                                >
                                    {{ t('settings.mcp.modal.buttons.disconnect') }}
                                </button>
                                <button
                                    v-else
                                    type="button"
                                    class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50"
                                    :disabled="
                                        isConnecting ||
                                        !isConfigValid ||
                                        (supportsInstall && !server.installed)
                                    "
                                    @click="handleConnect"
                                >
                                    {{
                                        isConnecting
                                            ? t('settings.mcp.modal.status.connecting')
                                            : t('settings.mcp.modal.buttons.test_connection')
                                    }}
                                </button>
                            </div>
                            <div class="flex gap-2">
                                <button
                                    type="button"
                                    class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    @click="handleClose"
                                >
                                    {{ t('settings.mcp.modal.buttons.cancel') }}
                                </button>
                                <button
                                    type="button"
                                    class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                                    @click="handleSave"
                                >
                                    {{ t('settings.mcp.modal.buttons.save') }}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>
