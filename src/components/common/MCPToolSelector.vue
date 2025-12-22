<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useSettingsStore, type MCPServerConfig } from '../../renderer/stores/settingsStore';
import type { MCPConfig } from '@core/types/database';

interface Props {
    selectedIds: string[];
    config: MCPConfig | null; // This is the final config object (Task.mcpConfig format)
    label?: string;
    recommendedIds?: string[];
    baseConfig?: MCPConfig | null;
    disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    label: 'MCP 도구',
    recommendedIds: () => [],
    disabled: false,
    config: () => ({}),
    baseConfig: null,
});

const emit = defineEmits<{
    (e: 'update:selectedIds', value: string[]): void;
    (e: 'update:config', value: MCPConfig | null): void;
}>();

const settingsStore = useSettingsStore();

// Local state for form editing to match TaskDetailPanel logic
interface KeyValuePair {
    id: string;
    key: string;
    value: string;
}
interface MCPConfigFormEntry {
    env: KeyValuePair[];
    params: KeyValuePair[];
    notes: string;
}
const localConfigForm = ref<Record<string, MCPConfigFormEntry>>({});

// Initialize local form state from props.config
watch(
    () => props.config,
    (newConfig) => {
        // Only update if external change (not our own emit loop)
        // For simplicity, we rebuild local form if external prop changes significantly
        // But since this is a controlled component, we should be careful.
        // Let's reload only if keys differ or something.
        // Actually, following TaskDetailPanel logic:
        loadConfigToForm(newConfig);
    },
    { immediate: true, deep: true }
);

const connectedMCPServers = computed(() => {
    return settingsStore.mcpServers.filter((server) => server.enabled && server.isConnected);
});

const mcpServerMap = computed<Record<string, MCPServerConfig>>(() => {
    const map: Record<string, MCPServerConfig> = {};
    settingsStore.mcpServers.forEach((server) => {
        map[server.id] = server;
    });
    return map;
});

function getMCPServerById(serverId: string): MCPServerConfig | undefined {
    return mcpServerMap.value[serverId];
}

function getMCPIcon(serverId: string): string {
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
        'github-mcp': '🐙',
        'gitlab-mcp': '🦊',
        'slack-mcp': '💬',
        'notion-mcp': '📓',
        'google-drive': '📂',
        'sequential-thinking': '🧩',
        sentry: '🐛',
    };
    return icons[serverId] || '🔧';
}

// --- Form Helper Functions ---

function createKeyValuePair(): KeyValuePair {
    return {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        key: '',
        value: '',
    };
}

function mapToPairs(source?: Record<string, string>): KeyValuePair[] {
    if (!source) return [createKeyValuePair()];
    const entries = Object.entries(source);
    if (entries.length === 0) return [createKeyValuePair()];
    return entries.map(([key, value]) => ({
        id: `${key}-${Math.random().toString(36).slice(2, 6)}`,
        key,
        value: String(value ?? ''),
    }));
}

function pairsToRecord(pairs: KeyValuePair[]): Record<string, string> {
    return pairs.reduce<Record<string, string>>((acc, pair) => {
        if (pair.key && pair.value) {
            acc[pair.key] = pair.value;
        }
        return acc;
    }, {});
}

function ensureConfigEntry(serverId: string): MCPConfigFormEntry {
    if (!localConfigForm.value[serverId]) {
        // Default empty
        let entry: MCPConfigFormEntry = {
            env: [createKeyValuePair()],
            params: [],
            notes: '',
        };

        // Inheritance logic
        if (props.baseConfig && props.baseConfig[serverId]) {
            try {
                const base = props.baseConfig[serverId];
                entry = {
                    env: mapToPairs(base.env as Record<string, string>),
                    params: mapToPairs(base.params as Record<string, string>),
                    notes:
                        typeof base.context === 'object' && base.context
                            ? String((base.context as any).notes || '')
                            : '',
                };
                console.log(`[MCPToolSelector] Inherited config for ${serverId}`);
            } catch (e) {
                console.error(`[MCPToolSelector] Failed to inherit config for ${serverId}`, e);
            }
        }

        localConfigForm.value[serverId] = entry;
    }
    return localConfigForm.value[serverId];
}

function loadConfigToForm(sourceConfig: MCPConfig | null) {
    if (!sourceConfig) return;
    const map: Record<string, MCPConfigFormEntry> = {};
    for (const [serverId, entry] of Object.entries(sourceConfig)) {
        map[serverId] = {
            env: mapToPairs(entry?.env as Record<string, string> | undefined),
            params: mapToPairs(entry?.params as Record<string, string> | undefined),
            notes:
                typeof entry?.context === 'object' && entry?.context !== null
                    ? String((entry.context as Record<string, unknown>).notes ?? '')
                    : '',
        };
    }
    // We merge with existing to avoid blowing away ongoing edits if possible,
    // but for now let's just use what's passed in + ensure defaults for selected
    localConfigForm.value = { ...localConfigForm.value, ...map };
    props.selectedIds.forEach((id) => ensureConfigEntry(id));
}

function buildConfigPayload(): MCPConfig | null {
    const payload: MCPConfig = {};
    for (const serverId of props.selectedIds) {
        const entry = localConfigForm.value[serverId];
        if (!entry) continue;
        const env = pairsToRecord(entry.env);
        const params = pairsToRecord(entry.params);
        const notes = entry.notes?.trim();
        const configEntry: Record<string, unknown> = {};
        if (Object.keys(env).length > 0) configEntry.env = env;
        if (Object.keys(params).length > 0) configEntry.params = params;
        if (notes) configEntry.context = { notes };

        if (Object.keys(configEntry).length > 0) {
            payload[serverId] = configEntry;
        }
    }
    return Object.keys(payload).length > 0 ? payload : null;
}

// Helper for stable JSON stringify to avoid infinite loops
function stableStringify(obj: any): string {
    if (obj === null || typeof obj !== 'object') {
        return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
        return '[' + obj.map(stableStringify).join(',') + ']';
    }
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]));
    return '{' + parts.join(',') + '}';
}

function emitChanges() {
    const newConfig = buildConfigPayload();
    // Prevent infinite loop by checking deeply if the config actually changed
    // We compare with the prop value using stable stringify (handling key order)
    if (stableStringify(newConfig || {}) === stableStringify(props.config || {})) {
        return;
    }
    emit('update:config', newConfig);
}

// --- Interaction Handlers ---

function toggleTool(serverId: string) {
    if (props.disabled) return;

    const newSelected = [...props.selectedIds];
    const index = newSelected.indexOf(serverId);
    if (index === -1) {
        newSelected.push(serverId);
        ensureConfigEntry(serverId);
    } else {
        newSelected.splice(index, 1);
    }
    emit('update:selectedIds', newSelected);
    // Also emit config update because selected keys changed
    // We need to wait for parent to update prop or just emit now using new list?
    // Let's emit config based on the NEW list locally
    // Actually buildConfigPayload relies on props.selectedIds...
    // ideally we shouldn't rely on prop content for the 'next' state calculation inside a single tick
    // but Vue handles this.
    // Better: emit 'update:selectedIds' and let parent update.
    // The watcher on props.selectedIds (inherited via template usage) will triger or we should watch specifically?
    // Let's just emit config update in next tick or imply it?
    // Actually creating a payload from *current ref* + *new list* is safer.

    // Quick hack: update config after short delay or let parent handle?
    // Realistically, the parent just stores the ID list. The config object only cleans up keys if we enforce it.
    // Let's just emit config update whenever local form changes or selection changes.
    // For selection change, we might want to keep the config in state even if deselected (for re-selection convenience),
    // but `buildConfigPayload` explicitly filters by `selectedIds`.
    // So if I deselect, I should probably emit a config that excludes it?
    // Or just let the consumer decide.
    // TaskDetailPanel logic: `updatedTask` reconstructs `mcpConfig` from `selectedMCPTools`.
    // so we should probably emit 'update:config' whenever we emit 'update:selectedIds'?
    // But `buildConfigPayload` reads `props.selectedIds`.
    // So we can't emit correct config until props update.
    // Solution: Just emit selectedIds. The parent should probably re-eval config OR we accept that config might have stale keys (usually fine).
    // BUT checking TaskDetailPanel l.638: it updates `localTask.value.requiredMCPs` then `syncLocalMCPConfig` runs via watch.
    // We should implement similar watch here or rely on parent.
    // Since this component owns the "form state", it should emit the config.
    // We will watch `props.selectedIds` to trigger config emit.
}

watch(
    () => props.selectedIds,
    () => {
        props.selectedIds.forEach((id) => ensureConfigEntry(id));
        emitChanges();
    }
);

// Watch deep changes in form to emit config
watch(
    localConfigForm,
    () => {
        emitChanges();
    },
    { deep: true }
);

function addEnvRow(serverId: string) {
    const entry = ensureConfigEntry(serverId);
    entry.env.push(createKeyValuePair());
}
function removeEnvRow(serverId: string, rowId: string) {
    const entry = ensureConfigEntry(serverId);
    entry.env = entry.env.filter((row) => row.id !== rowId);
    if (entry.env.length === 0) entry.env.push(createKeyValuePair());
}
function addParamRow(serverId: string) {
    const entry = ensureConfigEntry(serverId);
    entry.params.push(createKeyValuePair());
}
function removeParamRow(serverId: string, rowId: string) {
    const entry = ensureConfigEntry(serverId);
    entry.params = entry.params.filter((row) => row.id !== rowId);
}
</script>

<template>
    <div class="space-y-4">
        <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {{ label }}
            </label>

            <!-- Connected MCP Servers List -->
            <div v-if="connectedMCPServers.length > 0" class="space-y-2">
                <label
                    v-for="server in connectedMCPServers"
                    :key="server.id"
                    class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors border border-transparent"
                    :class="{
                        'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10':
                            selectedIds.includes(server.id),
                    }"
                >
                    <input
                        type="checkbox"
                        :checked="selectedIds.includes(server.id)"
                        :disabled="disabled"
                        @change="toggleTool(server.id)"
                        class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span class="text-lg">{{ getMCPIcon(server.id) }}</span>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="text-sm text-gray-700 dark:text-gray-300 font-medium">
                                {{ server.name }}
                            </span>
                            <span
                                v-if="recommendedIds.includes(server.id)"
                                class="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full animate-pulse"
                            >
                                Recommended
                            </span>
                        </div>
                        <p
                            v-if="server.description"
                            class="text-xs text-gray-500 dark:text-gray-400 truncate"
                        >
                            {{ server.description }}
                        </p>
                    </div>
                </label>
            </div>

            <!-- Empty State -->
            <div
                v-else
                class="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
            >
                <div class="flex items-start gap-3">
                    <svg
                        class="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5"
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
                    <div class="flex-1">
                        <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
                            연동된 MCP 서버가 없습니다
                        </p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            설정 > MCP Servers에서 MCP 서버를 연동하세요.
                        </p>
                    </div>
                </div>
            </div>

            <!-- Selected Count -->
            <div
                v-if="selectedIds.length > 0"
                class="mt-2 text-xs text-blue-600 dark:text-blue-400"
            >
                {{ selectedIds.length }}개 도구 선택됨
            </div>
        </div>

        <!-- Configuration Forms for Selected Tools -->
        <div v-if="selectedIds.length > 0" class="space-y-4 pt-2">
            <div
                v-for="serverId in selectedIds"
                :key="`mcp-config-${serverId}`"
                class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50"
            >
                <div class="flex items-start justify-between mb-3">
                    <div>
                        <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">
                            {{ getMCPServerById(serverId)?.name || serverId }}
                        </p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {{ getMCPServerById(serverId)?.description || 'MCP 실행 설정' }}
                        </p>
                    </div>
                    <span class="text-xs text-gray-400">{{ serverId }}</span>
                </div>

                <!-- Env Vars -->
                <div class="space-y-2">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-medium text-gray-600 dark:text-gray-300"
                            >환경변수</span
                        >
                        <button
                            type="button"
                            @click="addEnvRow(serverId)"
                            class="text-xs text-blue-500 hover:text-blue-400"
                            :disabled="disabled"
                        >
                            + 추가
                        </button>
                    </div>
                    <div
                        v-for="row in localConfigForm[serverId]?.env"
                        :key="row.id"
                        class="flex items-center gap-2"
                    >
                        <input
                            v-model="row.key"
                            :disabled="disabled"
                            type="text"
                            placeholder="KEY"
                            class="flex-1 px-2 py-1 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <input
                            v-model="row.value"
                            :disabled="disabled"
                            type="text"
                            placeholder="VALUE"
                            class="flex-1 px-2 py-1 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                            type="button"
                            @click="removeEnvRow(serverId, row.id)"
                            :disabled="disabled"
                            class="text-gray-400 hover:text-red-400"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <!-- Params -->
                <div class="space-y-2 mt-4">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-medium text-gray-600 dark:text-gray-300"
                            >기본 파라미터</span
                        >
                        <button
                            type="button"
                            @click="addParamRow(serverId)"
                            class="text-xs text-blue-500 hover:text-blue-400"
                            :disabled="disabled"
                        >
                            + 추가
                        </button>
                    </div>
                    <div
                        v-for="row in localConfigForm[serverId]?.params"
                        :key="row.id"
                        class="flex items-center gap-2"
                    >
                        <input
                            v-model="row.key"
                            :disabled="disabled"
                            type="text"
                            placeholder="필드명"
                            class="flex-1 px-2 py-1 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <input
                            v-model="row.value"
                            :disabled="disabled"
                            type="text"
                            placeholder="기본값"
                            class="flex-1 px-2 py-1 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                            type="button"
                            @click="removeParamRow(serverId, row.id)"
                            :disabled="disabled"
                            class="text-gray-400 hover:text-red-400"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                <!-- Notes -->
                <div class="mt-4">
                    <label class="text-xs font-medium text-gray-600 dark:text-gray-300"
                        >추가 메모 / 컨텍스트</label
                    >
                    <textarea
                        v-if="localConfigForm[serverId]"
                        v-model="localConfigForm[serverId].notes"
                        :disabled="disabled"
                        rows="2"
                        placeholder="예: Slack 채널 C03CJT0KZPT의 최근 일주일 히스토리를 요약"
                        class="w-full mt-1 px-2 py-1 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                    ></textarea>
                </div>
            </div>
        </div>
    </div>
</template>
