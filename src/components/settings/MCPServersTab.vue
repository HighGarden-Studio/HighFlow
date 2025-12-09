<script setup lang="ts">
/**
 * MCP Servers Tab Component
 *
 * Tab for managing MCP (Model Context Protocol) servers
 * Provides easy-to-use UI similar to AI Providers
 */
import { ref, computed, onMounted } from 'vue';
import {
    useSettingsStore,
    type MCPServerConfig,
    type MCPServerTag,
} from '../../renderer/stores/settingsStore';
import { getProviderIcon } from '../../utils/iconMapping';
import IconRenderer from '../common/IconRenderer.vue';
import MCPServerModal from './MCPServerModal.vue';

const settingsStore = useSettingsStore();

// State
const selectedServer = ref<MCPServerConfig | null>(null);
const showModal = ref(false);
const selectedTags = ref<MCPServerTag[]>([]);
const searchQuery = ref('');

// Load settings on mount
onMounted(async () => {
    await settingsStore.loadSettings();
});

// Computed
const filteredServers = computed(() => {
    let servers = settingsStore.mcpServers;

    // Filter by search query
    if (searchQuery.value.trim()) {
        const query = searchQuery.value.toLowerCase();
        servers = servers.filter(
            (s) =>
                s.name.toLowerCase().includes(query) || s.description?.toLowerCase().includes(query)
        );
    }

    // Filter by tags
    if (selectedTags.value.length > 0) {
        servers = servers.filter(
            (s) => s.tags && s.tags.some((tag) => selectedTags.value.includes(tag))
        );
    }

    return servers;
});

const connectedCount = computed(() => settingsStore.mcpServers.filter((s) => s.isConnected).length);

const enabledCount = computed(() => settingsStore.mcpServers.filter((s) => s.enabled).length);

// Tag colors
const tagColors: Record<MCPServerTag, string> = {
    filesystem: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    shell: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    git: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    http: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    database: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
    cloud: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
    devops: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    productivity: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
    search: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    browser: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
    memory: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
    code: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    design: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
};

function getTagColor(tag: MCPServerTag): string {
    return tagColors[tag] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
}

// Actions
function openServerModal(server: MCPServerConfig) {
    selectedServer.value = server;
    showModal.value = true;
}

function closeModal() {
    showModal.value = false;
    selectedServer.value = null;
}

async function handleSaveServer(config: Partial<MCPServerConfig>) {
    if (selectedServer.value) {
        await settingsStore.updateMCPServer(selectedServer.value.id, config);
        closeModal();
    }
}

function toggleTag(tag: MCPServerTag) {
    const index = selectedTags.value.indexOf(tag);
    if (index === -1) {
        selectedTags.value.push(tag);
    } else {
        selectedTags.value.splice(index, 1);
    }
}

function clearFilters() {
    selectedTags.value = [];
    searchQuery.value = '';
}
</script>

<template>
    <div class="mcp-servers-tab">
        <!-- Header -->
        <div class="mb-6">
            <h2 class="text-xl font-bold text-white mb-2">MCP Servers</h2>
            <p class="text-gray-400 text-sm">
                Model Context Protocol 서버를 연동하여 AI가 다양한 도구를 사용할 수 있도록
                설정합니다.
                <a
                    href="https://modelcontextprotocol.io"
                    target="_blank"
                    class="text-blue-400 hover:underline ml-1"
                >
                    MCP 문서 보기
                </a>
            </p>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-3 gap-4 mb-6">
            <div class="bg-gray-800 rounded-lg p-4">
                <div class="text-2xl font-bold text-white">
                    {{ settingsStore.mcpServers.length }}
                </div>
                <div class="text-gray-400 text-sm">전체 서버</div>
            </div>
            <div class="bg-gray-800 rounded-lg p-4">
                <div class="text-2xl font-bold text-green-400">{{ connectedCount }}</div>
                <div class="text-gray-400 text-sm">연결됨</div>
            </div>
            <div class="bg-gray-800 rounded-lg p-4">
                <div class="text-2xl font-bold text-blue-400">{{ enabledCount }}</div>
                <div class="text-gray-400 text-sm">활성화</div>
            </div>
        </div>

        <!-- Search and Filter -->
        <div class="mb-6 space-y-4">
            <!-- Search -->
            <div class="relative">
                <svg
                    class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                </svg>
                <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="MCP 서버 검색..."
                    class="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
            </div>

            <!-- Tag Filter -->
            <div class="flex flex-wrap gap-2">
                <button
                    v-for="tag in settingsStore.allMCPTags"
                    :key="tag"
                    @click="toggleTag(tag)"
                    :class="[
                        'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                        selectedTags.includes(tag) ? 'bg-blue-600 text-white' : getTagColor(tag),
                    ]"
                >
                    {{ settingsStore.getMCPTagDisplayName(tag) }}
                </button>
                <button
                    v-if="selectedTags.length > 0 || searchQuery"
                    @click="clearFilters"
                    class="px-3 py-1 rounded-full text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
                >
                    필터 초기화
                </button>
            </div>
        </div>

        <!-- Server Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
                v-for="server in filteredServers"
                :key="server.id"
                @click="openServerModal(server)"
                :class="[
                    'rounded-xl p-4 border-2 cursor-pointer transition-all hover:shadow-lg group',
                    server.isConnected && server.enabled
                        ? 'bg-green-900/20 border-green-700 hover:border-green-600'
                        : server.isConnected
                          ? 'bg-yellow-900/20 border-yellow-700 hover:border-yellow-600'
                          : 'bg-gray-800 border-gray-700 hover:border-gray-600',
                ]"
            >
                <!-- Header -->
                <div class="flex items-start gap-3 mb-3">
                    <div
                        class="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform"
                    >
                        <IconRenderer :icon="getProviderIcon(server.id)" class="w-5 h-5" />
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <h3 class="text-white font-medium truncate">{{ server.name }}</h3>
                            <span
                                v-if="server.isConnected"
                                class="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"
                                title="연결됨"
                            />
                        </div>
                        <p class="text-gray-400 text-xs line-clamp-2">{{ server.description }}</p>
                    </div>
                </div>

                <!-- Tags -->
                <div class="flex flex-wrap gap-1 mb-3">
                    <span
                        v-for="tag in server.tags?.slice(0, 3)"
                        :key="tag"
                        :class="['px-2 py-0.5 rounded text-xs', getTagColor(tag)]"
                    >
                        {{ settingsStore.getMCPTagDisplayName(tag) }}
                    </span>
                    <span
                        v-if="server.tags && server.tags.length > 3"
                        class="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-400"
                    >
                        +{{ server.tags.length - 3 }}
                    </span>
                </div>

                <!-- Status -->
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span
                            :class="[
                                'px-2 py-0.5 rounded text-xs',
                                server.isConnected
                                    ? 'bg-green-900/30 text-green-400'
                                    : 'bg-gray-700 text-gray-400',
                            ]"
                        >
                            {{ server.isConnected ? '연결됨' : '미연결' }}
                        </span>
                        <span
                            v-if="server.enabled && server.isConnected"
                            class="px-2 py-0.5 rounded text-xs bg-blue-900/30 text-blue-400"
                        >
                            활성
                        </span>
                        <span
                            v-if="server.installed"
                            class="px-2 py-0.5 rounded text-xs bg-purple-900/30 text-purple-300"
                        >
                            설치됨
                        </span>
                    </div>

                    <!-- Links -->
                    <div
                        class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <a
                            v-if="server.website"
                            :href="server.website"
                            target="_blank"
                            @click.stop
                            class="p-1 text-gray-400 hover:text-white transition-colors"
                            title="문서"
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
                                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                />
                            </svg>
                        </a>
                        <a
                            v-if="server.repository"
                            :href="server.repository"
                            target="_blank"
                            @click.stop
                            class="p-1 text-gray-400 hover:text-white transition-colors"
                            title="GitHub"
                        >
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path
                                    fill-rule="evenodd"
                                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                                    clip-rule="evenodd"
                                />
                            </svg>
                        </a>
                    </div>
                </div>
            </div>
        </div>

        <!-- Empty State -->
        <div v-if="filteredServers.length === 0" class="text-center py-12 text-gray-500">
            <svg
                class="w-16 h-16 mx-auto mb-4 opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
            </svg>
            <p class="text-lg">검색 결과가 없습니다</p>
            <p class="text-sm mt-1">다른 검색어나 필터를 시도해보세요</p>
        </div>

        <!-- Modal -->
        <MCPServerModal
            :server="selectedServer"
            :open="showModal"
            @close="closeModal"
            @save="handleSaveServer"
        />
    </div>
</template>

<style scoped>
.mcp-servers-tab {
    @apply max-w-6xl;
}

.line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
</style>
