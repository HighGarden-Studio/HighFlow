<script setup lang="ts">
/**
 * Project Info Panel
 *
 * Displays detailed project information including:
 * - Main prompt / Initial instructions
 * - AI guidelines for task execution
 * - AI provider and model settings
 * - Output type and path
 * - Cost and token usage statistics
 */

import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { marked } from 'marked';

import type { MCPConfig, Project } from '@core/types/database';
import type { AIProvider } from '../../services/ai/AIInterviewService';
import { projectClaudeSyncService } from '../../services/integration/ProjectClaudeSyncService';
import UnifiedAISelector from '../common/UnifiedAISelector.vue';
import MCPToolSelector from '../common/MCPToolSelector.vue';
import IconRenderer from '../common/IconRenderer.vue';
import { useConfigurationInheritance } from '../../composables/useConfigurationInheritance';
import { useProjectStore } from '../../renderer/stores/projectStore';
import { FolderOpen } from 'lucide-vue-next';

const { resolveAIProvider, resolveAutoReviewProvider } = useConfigurationInheritance();
const { t } = useI18n();

// Helper to check if a provider is a local agent
function isLocalAgentProvider(provider: string | null): {
    isLocal: boolean;
    agentType: string | null;
} {
    if (!provider) return { isLocal: false, agentType: null };

    const localAgentMap: Record<string, string> = {
        'claude-code': 'claude',
        codex: 'codex',
    };

    const agentType = localAgentMap[provider];
    return {
        isLocal: !!agentType,
        agentType: agentType || null,
    };
}

// MCP 서버 타입 정의

// ========================================
// Types
// ========================================

// ========================================
// Props & Emits
// ========================================

const props = defineProps<{
    project: Project;
    compact?: boolean;
}>();

const emit = defineEmits<{
    (e: 'edit'): void;
    (e: 'open-output'): void;
    (e: 'update-guidelines', guidelines: string): void;
    (e: 'update-base-folder', folder: string): void;
    (
        e: 'update-ai-settings',
        settings: { aiProvider: string | null; aiModel: string | null }
    ): void;
    (e: 'update-output-type', type: string | null): void;
    (
        e: 'update-auto-review-settings',
        settings: { aiProvider: string | null; aiModel: string | null }
    ): void;
    (e: 'update-mcp-config', config: MCPConfig | null): void;
}>();

// ========================================
// State
// ========================================

const showGuidelines = ref(false);
const isEditingGuidelines = ref(false);
const editedGuidelines = ref('');
const editedBaseFolder = ref('');
const isEditingAI = ref(false);
const editedAIProvider = ref<AIProvider | null>(null);
const editedAIModel = ref<string | null>(null);
const editedAIMode = ref<'api' | 'local'>('api');
const editedLocalAgent = ref<string | null>(null);

// Output Type State
const isEditingOutputType = ref(false);
const editedOutputType = ref<string | null>(null);

// Goal State
const isEditingGoal = ref(false);
const editedGoal = ref('');

// Auto Review State
const isEditingAutoReview = ref(false);
const editedAutoReviewProvider = ref<AIProvider | null>(null);
const editedAutoReviewModel = ref<string | null>(null);
const editedAutoReviewMode = ref<'api' | 'local'>('api');
const editedAutoReviewLocalAgent = ref<string | null>(null);

const isEditingMCP = ref(false);
const selectedMCPServers = ref<string[]>([]);
const editedMCPConfig = ref<MCPConfig | null>(null);

// Metadata Editing State
const isEditingMetadata = ref(false);
const editedTitle = ref('');
const editedEmoji = ref('');

// ========================================
// Computed
// ========================================

const effectiveAI = computed(() => {
    return resolveAIProvider(null, props.project);
});

const aiProviderDisplay = computed(() => {
    const providers: Record<
        string,
        { name: string; color: string; icon?: string; svgPath?: string }
    > = {
        openai: { name: 'OpenAI', color: 'text-green-400', icon: '🤖' },
        anthropic: { name: 'Anthropic', color: 'text-purple-400', icon: '✨' },
        google: { name: 'Google AI', color: 'text-blue-400', icon: '🔷' },
        local: { name: t('project.info.local'), color: 'text-gray-400', icon: '💻' },
        'default-highflow': { name: 'HighFlow', color: 'text-blue-500', icon: '🚀' },
        // Legacy support for typo in ID
        'default-highfow': { name: 'HighFlow', color: 'text-blue-500', icon: '🚀' },
    };

    // Use edited value if editing, else effective resolved value
    const providerId = isEditingAI.value ? editedAIProvider.value : effectiveAI.value.provider;

    // Check if it's a local agent
    if (providerId && ['claude-code', 'codex'].includes(providerId)) {
        return {
            name: getAssistantLabel(providerId),
            color: 'text-gray-400',
            icon: getAssistantIcon(providerId),
        };
    }

    return (
        providers[providerId || ''] || {
            name: t('project.info.not_set'),
            color: 'text-gray-500',
            icon: '❓',
        }
    );
});

const aiModelDisplay = computed(() => {
    // Check if the relevant provider is local
    const providerId = isEditingAI.value
        ? editedAIProvider.value
        : effectiveAI.value.provider || props.project.aiProvider;

    if (providerId && isLocalAgentProvider(providerId).isLocal) {
        return '';
    }

    // configured model | effective model | default
    const modelId = isEditingAI.value
        ? editedAIModel.value
        : effectiveAI.value.model || props.project.aiModel;

    // Simple display fallback
    return modelId || t('project.info.not_set');
});

const outputTypes = computed(() => ({
    web: {
        name: t('project.output_type.web.name'),
        icon: 'ph:globe',
        svgPath:
            'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm88,104a87.61,87.61,0,0,1-3.33,24H174.16a157.44,157.44,0,0,0,0-48h38.51A87.61,87.61,0,0,1,216,128ZM96.22,176h63.56a145.91,145.91,0,0,1-31.78,43.82A145.91,145.91,0,0,1,96.22,176Zm-3.06-16a140.07,140.07,0,0,1,0-64h69.68a140.07,140.07,0,0,1,0,64Zm66.62-80H96.22a145.91,145.91,0,0,1,31.78-43.82A145.91,145.91,0,0,1,159.78,80ZM40,128a87.61,87.61,0,0,1,3.33-24H81.84a157.44,157.44,0,0,0,0,48H43.33A87.61,87.61,0,0,1,40,128Zm114.51,27.36a161.79,161.79,0,0,0,0-54.72,88.32,88.32,0,0,1,46.6,54.72Zm46.6-79.08a88.32,88.32,0,0,1-46.6,54.72,161.79,161.79,0,0,0,0-54.72ZM55,100.64a88.32,88.32,0,0,1,46.6-54.72,161.79,161.79,0,0,0,0,54.72Zm0,54.72a161.79,161.79,0,0,0,0,54.72,88.32,88.32,0,0,1-46.6-54.72Z',
        description: t('project.output_type.web.desc'),
    },
    document: {
        name: t('project.output_type.document.name'),
        icon: 'ph:file-text',
        svgPath:
            'M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-40-64a8,8,0,0,1-8,8H104a8,8,0,0,1,0-16h48A8,8,0,0,1,160,152Zm0-32a8,8,0,0,1-8,8H104a8,8,0,0,1,0-16h48A8,8,0,0,1,160,120Z',
        description: t('project.output_type.document.desc'),
    },
    image: {
        name: t('project.output_type.image.name'),
        icon: 'ph:image',
        svgPath:
            'M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM40,56H216v77.38l-24.69-24.7a16,16,0,0,0-22.62,0L144,133.37,100.69,90.07a16,16,0,0,0-22.62,0L40,128.69Zm0,144V154.35L89.66,104.69l53.65,53.65a8,8,0,0,0,11.32,0l34.05-34L216,151.63V200ZM144,100a12,12,0,1,1,12,12A12,12,0,0,1,144,100Z',
        description: t('project.output_type.image.desc'),
    },
    video: {
        name: t('project.output_type.video.name'),
        icon: 'ph:film-strip',
        svgPath:
            'M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM40,72H80V96H40ZM40,112H80v32H40Zm0,88V160H80v40Zm176,0H96V72H216V200ZM96,56h64V40H96Zm80,0h40V40H176Z',
        description: t('project.output_type.video.desc'),
    },
    code: {
        name: t('project.output_type.code.name'),
        icon: 'logos:visual-studio-code',
        svgPath:
            'M69.12,94.15,28.5,128l40.62,33.85a8,8,0,1,1-10.24,12.29l-48-40a8,8,0,0,1,0-12.29l48-40a8,8,0,0,1,10.24,12.3Zm176,27.7-48-40a8,8,0,1,0-10.24,12.3L227.5,128l-40.62,33.85a8,8,0,1,0,10.24,12.29l48-40a8,8,0,0,0,0-12.29ZM162.73,32.48a8,8,0,0,0-10.25,4.79l-64,176a8,8,0,0,0,4.79,10.26A8.14,8.14,0,0,0,96,224a8,8,0,0,0,7.52-5.27l64-176A8,8,0,0,0,162.73,32.48Z',
        description: t('project.output_type.code.desc'),
    },
    data: {
        name: t('project.output_type.data.name'),
        icon: 'ph:database',
        svgPath:
            'M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48ZM40,112H80v32H40Zm56,0H216v32H96ZM216,64V96H40V64ZM40,160H80v32H40Zm176,32H96V160H216v32Z',
        description: t('project.output_type.data.desc'),
    },
    other: {
        name: t('project.output_type.other.name'),
        icon: 'ph:question',
        svgPath:
            'M223.68,66.15,135.68,18a15.88,15.88,0,0,0-15.36,0l-88,48.17a16,16,0,0,0-8.32,14v95.64a16,16,0,0,0,8.32,14l88,48.17a15.88,15.88,0,0,0,15.36,0l88-48.17a16,16,0,0,0,8.32-14V80.18A16,16,0,0,0,223.68,66.15ZM128,32l80.34,44-29.77,16.3-80.35-44ZM128,120,47.66,76l33.9-18.56,80.34,44ZM40,90l80,43.78v85.79L40,175.82Zm176,85.78h0l-80,43.79V133.82l32-17.51V152a8,8,0,0,0,16,0V107.55L216,90v85.77Z',
        description: t('project.output_type.other.desc'),
    },
}));

const outputTypeDisplay = computed(() => {
    return (
        outputTypes.value[props.project.outputType as keyof typeof outputTypes.value] || {
            name: t('project.output_type.not_set'),
            svgPath:
                'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Z', // Question mark icon path if needed, or keeping it empty if handled by IconRenderer differently
            description: t('project.output_type.not_set_desc'),
        }
    );
});

const statusDisplay = computed(() => {
    const statuses: Record<string, { name: string; color: string }> = {
        active: { name: t('task.status.active'), color: 'bg-green-500' },
        completed: { name: t('task.status.completed'), color: 'bg-blue-500' },
        archived: { name: t('task.status.archived'), color: 'bg-gray-500' },
        on_hold: { name: t('task.status.on_hold'), color: 'bg-yellow-500' },
    };
    return statuses[props.project.status] || { name: props.project.status, color: 'bg-gray-500' };
});

const formattedCost = computed(() => {
    return `$${props.project.totalCost.toFixed(4)}`;
});

const formattedTokens = computed(() => {
    if (props.project.totalTokens >= 1000000) {
        return `${(props.project.totalTokens / 1000000).toFixed(2)}M`;
    }
    if (props.project.totalTokens >= 1000) {
        return `${(props.project.totalTokens / 1000).toFixed(1)}K`;
    }
    return props.project.totalTokens.toString();
});

const truncatedPrompt = computed(() => {
    const prompt = props.project.mainPrompt || '';
    if (props.compact && prompt.length > 150) {
        return prompt.slice(0, 150) + '...';
    }
    return prompt;
});

const effectiveGuidelines = computed(
    () => props.project.projectGuidelines || props.project.aiGuidelines || ''
);
const renderedGuidelines = computed(() => {
    if (!effectiveGuidelines.value) return '';
    return marked(effectiveGuidelines.value);
});

const hasGuidelines = computed(() => {
    return !!effectiveGuidelines.value && effectiveGuidelines.value.trim().length > 0;
});

// Claude Code sync status
const claudeSyncStatus = computed(() => {
    return projectClaudeSyncService.getSyncStatusText(props.project as any);
});

const claudeSyncColor = computed(() => {
    return projectClaudeSyncService.getSyncStatusColor(props.project as any);
});

// Auto Review Display
const effectiveAutoReview = computed(() => {
    return resolveAutoReviewProvider(null, props.project);
});

const autoReviewProviderDisplay = computed(() => {
    // SVG paths for provider icons (Phosphor style)
    const providers: Record<
        string,
        { name: string; color: string; svgPath?: string; icon?: string }
    > = {
        openai: {
            name: 'OpenAI',
            color: 'text-green-400',
            svgPath:
                'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm88,104a87.62,87.62,0,0,1-6.4,32.94l-44.7-27.49a15.92,15.92,0,0,0-6.24-2.23l-22.82-3.08a16.11,16.11,0,0,0-16,7.86h-8.72l-3.8-7.86a15.91,15.91,0,0,0-11.89-8.42l-22.26-3a16.09,16.09,0,0,0-13.38,4.93L40,132.19A88,88,0,0,1,128,40a87.53,87.53,0,0,1,15.87,1.46L159.3,56a16,16,0,0,0,12.26,5.61h19.41A88.22,88.22,0,0,1,216,128Z',
        },
        anthropic: {
            name: 'Anthropic',
            color: 'text-purple-400',
            svgPath:
                'M224,128a96,96,0,1,1-96-96A96.11,96.11,0,0,1,224,128ZM208,128a80,80,0,1,0-80,80A80.09,80.09,0,0,0,208,128ZM140,80.28V160a12,12,0,0,1-24,0V80.28a12,12,0,0,1,24,0Zm32,20V160a12,12,0,0,1-24,0V100.28a12,12,0,0,1,24,0Zm-64,0V160a12,12,0,0,1-24,0V100.28a12,12,0,0,1,24,0Z',
        },
        google: {
            name: 'Google AI',
            color: 'text-blue-400',
            svgPath:
                'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Z',
        },
        local: {
            name: 'Local',
            color: 'text-gray-400',
            svgPath:
                'M240,128a16,16,0,0,1-16,16H205.43a80.09,80.09,0,0,1-79.24,64,80,80,0,0,1,0-160,80.09,80.09,0,0,1,79.24,64H224A16,16,0,0,1,240,128Z',
        },
        'default-highflow': {
            name: 'HighFlow',
            color: 'text-blue-500',
            icon: '🚀',
        },
        // Legacy support for typo in ID
        'default-highfow': {
            name: 'HighFlow',
            color: 'text-blue-500',
            icon: '🚀',
        },
    };

    // Use edited value if editing
    // If NOT editing, use metadata (if set) OR effective value (inheritance)
    // But effectiveAutoReview handles both metadata and fallback.
    // However, we want to know if it is inherited to show "(Default)" text.

    // Logic:
    // If props.project.metadata?.autoReviewProvider is set -> Explicit
    // Else -> Inherited (from Project AI)

    const isExplicit = !!props.project.metadata?.autoReviewProvider;
    const providerId = isEditingAutoReview.value
        ? editedAutoReviewProvider.value
        : // If not editing, use existing metadata OR effective value
          effectiveAutoReview.value.provider;

    // Check if it's a local agent
    if (providerId && ['claude-code', 'codex'].includes(providerId)) {
        return {
            name: getAssistantLabel(providerId),
            color: 'text-gray-400',
            svgPath: getAssistantIcon(providerId),
            isInherited: !isExplicit && !isEditingAutoReview.value,
        };
    }

    const display = providers[providerId || ''] || {
        name: t('project.info.not_set'),
        color: 'text-gray-500',
        icon: '❓',
    };

    return {
        ...display,
        isInherited: !isExplicit && !isEditingAutoReview.value && !!providerId,
    };
});

const autoReviewModelDisplay = computed(() => {
    // Check if the relevant provider is local
    const providerId = isEditingAutoReview.value
        ? editedAutoReviewProvider.value
        : effectiveAutoReview.value.provider || props.project.metadata?.autoReviewProvider;

    if (providerId && isLocalAgentProvider(providerId).isLocal) {
        return '';
    }

    // If editing, show edited value
    if (isEditingAutoReview.value) {
        return editedAutoReviewModel.value || t('project.info.not_set');
    }

    // Normal display: use effective model
    return effectiveAutoReview.value.model || t('project.info.not_set');
});

// Init base folder display
watch(
    () => props.project,
    (project) => {
        editedBaseFolder.value = project?.baseDevFolder || '';
    },
    { immediate: true }
);

// ========================================
// Methods
// ========================================

function startEditMetadata(): void {
    editedTitle.value = props.project.title;
    // Assuming project has emoji field, cast to any if TS complains or update Project type if possible
    editedEmoji.value = (props.project as any).emoji || '';
    isEditingMetadata.value = true;
}

function cancelEditMetadata(): void {
    isEditingMetadata.value = false;
    editedTitle.value = '';
    editedEmoji.value = '';
}

async function saveMetadata(): Promise<void> {
    if (!editedTitle.value.trim()) return;

    try {
        const projectStore = useProjectStore();
        await projectStore.updateProject(props.project.id, {
            title: editedTitle.value,
            emoji: editedEmoji.value || null,
        });
        isEditingMetadata.value = false;
    } catch (error) {
        console.error('Failed to update project metadata:', error);
    }
}

function handleOpenOutput(): void {
    emit('open-output');
}

function copyPrompt(): void {
    if (props.project.mainPrompt) {
        navigator.clipboard.writeText(props.project.mainPrompt);
    }
}

function toggleGuidelines(): void {
    showGuidelines.value = !showGuidelines.value;
}

function startEditGuidelines(): void {
    editedGuidelines.value = effectiveGuidelines.value || '';
    isEditingGuidelines.value = true;
}

function cancelEditGuidelines(): void {
    isEditingGuidelines.value = false;
    editedGuidelines.value = '';
}

function saveGuidelines(): void {
    emit('update-guidelines', editedGuidelines.value);
    isEditingGuidelines.value = false;
}

function copyGuidelines(): void {
    if (effectiveGuidelines.value) {
        navigator.clipboard.writeText(effectiveGuidelines.value);
    }
}

function saveBaseFolder(): void {
    emit('update-base-folder', editedBaseFolder.value);
}

async function pickBaseFolder(): Promise<void> {
    const dir = await (window as any)?.electron?.fs?.selectDirectory?.();
    if (dir) {
        editedBaseFolder.value = dir;
        saveBaseFolder();
    }
}

function startEditAI(): void {
    // Use effective values (including inherited) to show current active settings
    const effectiveProvider = props.project.aiProvider || effectiveAI.value.provider;
    editedAIProvider.value = effectiveProvider;
    editedAIModel.value = props.project.aiModel || effectiveAI.value.model;

    // Check if the effective provider is a local agent
    const localAgentInfo = isLocalAgentProvider(effectiveProvider);
    if (localAgentInfo.isLocal) {
        editedAIMode.value = 'local';
        editedLocalAgent.value = localAgentInfo.agentType;
        // Clear API provider when in local mode
        editedAIProvider.value = null;
    } else {
        editedAIMode.value = 'api';
        editedLocalAgent.value = null;
    }
    isEditingAI.value = true;
}

function cancelEditAI(): void {
    isEditingAI.value = false;
    editedAIProvider.value = null;
    editedAIModel.value = null;
    editedAIMode.value = 'api';
    editedLocalAgent.value = null;
}

async function saveAISettings(): Promise<void> {
    // Check if this is a Claude Code synced project
    const metadata = (props.project as any).metadata || {};
    const wasClaudeCodeSynced = metadata.claudeCodeIntegration && !metadata.settingsOverridden;

    // Determine provider and model based on mode
    let providerToSave = editedAIProvider.value;
    let modelToSave = editedAIModel.value;

    if (editedAIMode.value === 'local' && editedLocalAgent.value) {
        // Map local agent type back to provider ID
        const agentMap: Record<string, string> = {
            claude: 'claude-code',
            codex: 'codex',
        };
        providerToSave = (agentMap[editedLocalAgent.value] || editedLocalAgent.value) as AIProvider;
        // For local agents, the model might be redundant or same as provider ID, but let's keep it clean
        modelToSave = null;
    }

    // Emit settings update
    emit('update-ai-settings', {
        aiProvider: providerToSave,
        aiModel: modelToSave,
    });

    // If project was synced with Claude, mark as manually overridden
    if (wasClaudeCodeSynced) {
        try {
            const projectStore = useProjectStore();
            const overrideUpdate = projectClaudeSyncService.markAsOverridden(props.project as any);
            await projectStore.updateProject(props.project.id, overrideUpdate as any);
            console.log('[ProjectInfoPanel] Marked project settings as manually overridden');
        } catch (error) {
            console.error('[ProjectInfoPanel] Failed to mark as overridden:', error);
        }
    }

    isEditingAI.value = false;
}

// MCP 관련 함수
function startEditMCP(): void {
    const projectMCP = props.project.mcpConfig || {};
    selectedMCPServers.value = Object.keys(projectMCP);
    editedMCPConfig.value = projectMCP;
    isEditingMCP.value = true;
}

function cancelEditMCP(): void {
    isEditingMCP.value = false;
    selectedMCPServers.value = [];
    editedMCPConfig.value = null;
}

function saveMCPSettings(): void {
    emit('update-mcp-config', editedMCPConfig.value);
    isEditingMCP.value = false;
}

// Output Type Methods
function startEditOutputType(): void {
    editedOutputType.value = props.project.outputType || null;
    isEditingOutputType.value = true;
}

function cancelEditOutputType(): void {
    isEditingOutputType.value = false;
    editedOutputType.value = null;
}

function saveOutputType(): void {
    emit('update-output-type', editedOutputType.value);
    isEditingOutputType.value = false;
}

// Goal Methods
function startEditGoal(): void {
    editedGoal.value = props.project.goal || '';
    isEditingGoal.value = true;
}

function cancelEditGoal(): void {
    isEditingGoal.value = false;
    editedGoal.value = '';
}

async function saveGoal(): Promise<void> {
    try {
        const projectStore = useProjectStore();
        await projectStore.updateProject(props.project.id, {
            goal: editedGoal.value || null,
        });
        isEditingGoal.value = false;
    } catch (error) {
        console.error('Failed to update project goal:', error);
    }
}

// Auto Review Methods
function startEditAutoReview(): void {
    // Use effective values (including inherited) to show current active settings
    const effectiveProvider =
        props.project.metadata?.autoReviewProvider || effectiveAutoReview.value.provider;
    editedAutoReviewProvider.value = effectiveProvider;
    editedAutoReviewModel.value =
        props.project.metadata?.autoReviewModel || effectiveAutoReview.value.model;

    // Check if the effective provider is a local agent
    const localAgentInfo = isLocalAgentProvider(effectiveProvider);
    if (localAgentInfo.isLocal) {
        editedAutoReviewMode.value = 'local';
        editedAutoReviewLocalAgent.value = localAgentInfo.agentType;
        // Clear API provider when in local mode
        editedAutoReviewProvider.value = null;
    } else {
        editedAutoReviewMode.value = 'api';
        editedAutoReviewLocalAgent.value = null;
    }
    isEditingAutoReview.value = true;
}

function cancelEditAutoReview(): void {
    isEditingAutoReview.value = false;
    editedAutoReviewProvider.value = null;
    editedAutoReviewModel.value = null;
    editedAutoReviewMode.value = 'api';
    editedAutoReviewLocalAgent.value = null;
}

function saveAutoReviewSettings(): void {
    emit('update-auto-review-settings', {
        aiProvider: editedAutoReviewProvider.value,
        aiModel: editedAutoReviewModel.value,
    });
    isEditingAutoReview.value = false;
}

// Helper functions for displaying assistant types
function getAssistantIcon(type: string): string {
    // Return Phosphor SVG paths for local agents
    const icons: Record<string, string> = {
        git: 'M216,104v104a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V104A16,16,0,0,1,56,88h49.15a4,4,0,0,1,4,4.14,33.31,33.31,0,0,1-3.63,12.94A7.68,7.68,0,0,1,98.94,109l-8,8a16,16,0,0,0,0,22.63l18.43,18.43a16,16,0,0,0,22.63,0l10-10a7.72,7.72,0,0,1,3.92-2.21,27.32,27.32,0,0,1,10.41-1.71,3.94,3.94,0,0,1,4.3,3.54,37.6,37.6,0,0,1,.37,5.32H152a8,8,0,0,0,0,16h8.66V184a8,8,0,0,0,16,0V168H184a8,8,0,0,0,0-16h-47.35a53.71,53.71,0,0,0-1.51-12.16,20,20,0,0,0-21.59-14.88,47.68,47.68,0,0,0-18.93,5.12l-6-6,5.47-5.47a22.79,22.79,0,0,0,8.51-15.18A49.13,49.13,0,0,0,103.69,88H56l.14.17L56,48a16,16,0,0,1,16-16h65.61a8.07,8.07,0,0,1,7.2,4.47L165.4,69.54A7.92,7.92,0,0,1,192,76.55V56a8,8,0,0,1,8-8h8a8,8,0,0,1,0,16h-8L168,104H200A16,16,0,0,1,216,104Z',
        'claude-code':
            'M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm88,104a87.62,87.62,0,0,1-6.4,32.94l-44.7-27.49a15.92,15.92,0,0,0-6.24-2.23l-22.82-3.08a16.11,16.11,0,0,0-16,7.86h-8.72l-3.8-7.86a15.91,15.91,0,0,0-11.89-8.42l-22.26-3a16.09,16.09,0,0,0-13.38,4.93L40,132.19A88,88,0,0,1,128,40a87.53,87.53,0,0,1,15.87,1.46L159.3,56a16,16,0,0,0,12.26,5.61h19.41A88.22,88.22,0,0,1,216,128Z',
        codex: 'M229.66,90.34l-64-64a8,8,0,0,0-11.32,0l-64,64a8,8,0,0,0,11.32,11.32L152,51.31V96a8,8,0,0,0,16,0V51.31l50.34,50.35a8,8,0,0,0,11.32-11.32ZM208,144a40,40,0,1,0-40,40A40,40,0,0,0,208,144Zm-64,0a24,24,0,1,1,24,24A24,24,0,0,1,144,144ZM88,104A40,40,0,1,0,48,144,40,40,0,0,0,88,104ZM64,144a24,24,0,1,1,24-24A24,24,0,0,1,64,144Zm176,72a40,40,0,1,0-40,40A40,40,0,0,0,240,216Zm-64,0a24,24,0,1,1,24,24A24,24,0,0,1,176,216Z',
    };
    return (icons[type] || icons.git) as string;
}

function getAssistantLabel(type: string): string {
    const labels: Record<string, string> = {
        git: 'Git',
        'claude-code': 'Claude Code',
        codex: 'Codex',

        cursor: 'Cursor',
        windsurf: 'Windsurf',
        aider: 'Aider',
        copilot: 'Copilot',
    };
    return labels[type] || type;
}
</script>

<template>
    <div class="project-info-panel bg-gray-800/50 rounded-lg border border-gray-700">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-gray-700">
            <div class="flex items-center space-x-3">
                <div v-if="isEditingMetadata" class="flex items-center space-x-2">
                    <!-- Color Picker (simplified as preset colors for now or just text input? let's stick to title for MVP inline edit as per plan) -->
                    <!-- Actually plan said "Transform the Header section (Title, Emoji, Color) into inputs".
                         Let's Start with Title and Emoji.
                    -->
                    <input
                        v-model="editedEmoji"
                        class="w-8 h-8 text-center bg-gray-700 border border-gray-600 rounded text-lg focus:outline-none focus:border-blue-500"
                        placeholder="📝"
                    />
                    <input
                        v-model="editedTitle"
                        class="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-200 focus:outline-none focus:border-blue-500"
                        :placeholder="t('project.modal.name_label')"
                        @keyup.enter="saveMetadata"
                    />
                </div>
                <h3 v-else class="text-lg font-semibold text-gray-200">
                    <span v-if="project.emoji" class="mr-2">{{ project.emoji }}</span>
                    {{ project.title }}
                </h3>

                <span
                    v-if="!isEditingMetadata"
                    class="px-2 py-0.5 text-xs rounded-full text-white"
                    :class="statusDisplay.color"
                >
                    {{ statusDisplay.name }}
                </span>
            </div>

            <div class="flex items-center space-x-2">
                <template v-if="isEditingMetadata">
                    <button
                        class="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-gray-200 text-xs"
                        @click="cancelEditMetadata"
                    >
                        {{ t('common.cancel') }}
                    </button>
                    <button
                        class="p-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors text-white text-xs"
                        @click="saveMetadata"
                    >
                        {{ t('common.save') }}
                    </button>
                </template>
                <button
                    v-else
                    class="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-gray-200"
                    :title="t('common.edit')"
                    @click="startEditMetadata"
                >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                    </svg>
                </button>
            </div>
        </div>

        <div class="p-4 space-y-4">
            <!-- Main Prompt Section -->
            <div v-if="project.mainPrompt" class="space-y-2">
                <div class="flex items-center justify-between">
                    <label class="text-sm font-medium text-gray-400">{{
                        t('project.info.initial_prompt')
                    }}</label>
                    <button
                        class="text-xs text-gray-500 hover:text-gray-300 flex items-center space-x-1"
                        :title="t('common.copy')"
                        @click="copyPrompt"
                    >
                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                        </svg>
                        <span>{{ t('common.copy') }}</span>
                    </button>
                </div>
                <div
                    class="bg-gray-900/50 rounded-lg p-3 text-sm text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto"
                >
                    {{ truncatedPrompt }}
                </div>
                <button
                    v-if="compact && project.mainPrompt && project.mainPrompt.length > 150"
                    class="text-xs text-blue-400 hover:text-blue-300"
                >
                    {{ t('common.view_all') }}
                </button>
            </div>

            <div v-else class="text-center py-4 text-gray-500 text-sm">
                {{ t('project.info.no_initial_prompt') }}
            </div>

            <!-- Project Goal Section -->
            <div class="space-y-2 border-t border-gray-700 pt-4">
                <div class="flex items-center justify-between">
                    <label class="text-sm font-medium text-gray-400">{{
                        t('project.info.goal')
                    }}</label>
                    <button
                        v-if="!isEditingGoal"
                        class="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                        @click="startEditGoal"
                    >
                        <svg
                            class="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                        </svg>
                        <span>{{ project.goal ? t('common.edit') : t('common.add') }}</span>
                    </button>
                </div>

                <!-- View Mode -->
                <div
                    v-if="!isEditingGoal && project.goal"
                    class="bg-gray-900/50 rounded-lg p-3 text-sm text-gray-300 whitespace-pre-wrap"
                >
                    {{ project.goal }}
                </div>

                <!-- Empty State -->
                <div
                    v-else-if="!isEditingGoal && !project.goal"
                    class="bg-gray-900/30 rounded-lg p-4 text-center"
                >
                    <div class="text-gray-500 text-sm mb-2">
                        {{ t('project.info.goal_help') }}
                    </div>
                    <button
                        class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                        @click="startEditGoal"
                    >
                        {{ t('project.info.add_goal') }}
                    </button>
                </div>

                <!-- Edit Mode -->
                <div v-if="isEditingGoal" class="space-y-3">
                    <textarea
                        v-model="editedGoal"
                        class="w-full h-32 bg-gray-900 border border-gray-600 rounded-lg p-3 text-sm text-gray-300 resize-y focus:outline-none focus:border-blue-500"
                        :placeholder="t('project.info.goal_placeholder')"
                    ></textarea>
                    <div class="flex justify-end space-x-2">
                        <button
                            class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
                            @click="cancelEditGoal"
                        >
                            {{ t('common.cancel') }}
                        </button>
                        <button
                            class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                            @click="saveGoal"
                        >
                            {{ t('common.save') }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- AI Guidelines Section -->
            <div class="space-y-2 border-t border-gray-700 pt-4">
                <div class="flex items-center justify-between">
                    <button
                        class="flex items-center space-x-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
                        @click="toggleGuidelines"
                    >
                        <svg
                            class="w-4 h-4 transition-transform"
                            :class="{ 'rotate-90': showGuidelines }"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M9 5l7 7-7 7"
                            />
                        </svg>
                        <span>{{ t('project.info.ai_guidelines') }}</span>
                        <span
                            v-if="hasGuidelines"
                            class="px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-300 rounded"
                        >
                            {{ t('project.info.guidelines_set') }}
                        </span>
                        <span
                            v-else
                            class="px-1.5 py-0.5 text-xs bg-gray-600/50 text-gray-400 rounded"
                        >
                            {{ t('project.info.guidelines_not_set') }}
                        </span>
                    </button>
                    <div v-if="hasGuidelines" class="flex items-center space-x-1">
                        <button
                            class="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-gray-200"
                            :title="t('common.copy')"
                            @click="copyGuidelines"
                        >
                            <svg
                                class="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                />
                            </svg>
                        </button>
                        <button
                            class="p-1.5 hover:bg-gray-700 rounded transition-colors text-gray-400 hover:text-gray-200"
                            :title="t('common.edit')"
                            @click="startEditGuidelines"
                        >
                            <svg
                                class="w-3.5 h-3.5"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Guidelines Content -->
                <div v-if="showGuidelines" class="space-y-3">
                    <!-- View Mode -->
                    <div
                        v-if="!isEditingGuidelines && hasGuidelines"
                        class="bg-gray-900/50 rounded-lg p-4 max-h-96 overflow-y-auto"
                    >
                        <div
                            class="guidelines-content prose prose-invert prose-sm max-w-none"
                            v-html="renderedGuidelines"
                        ></div>
                    </div>

                    <!-- Empty State -->
                    <div
                        v-else-if="!isEditingGuidelines && !hasGuidelines"
                        class="bg-gray-900/30 rounded-lg p-6 text-center"
                    >
                        <div class="text-gray-500 text-sm mb-3">
                            {{ t('project.info.guidelines_empty') }}
                        </div>
                        <button
                            class="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
                            @click="startEditGuidelines"
                        >
                            {{ t('project.info.add_guidelines') }}
                        </button>
                    </div>

                    <!-- Edit Mode -->
                    <div v-if="isEditingGuidelines" class="space-y-3">
                        <textarea
                            v-model="editedGuidelines"
                            class="w-full h-64 bg-gray-900 border border-gray-600 rounded-lg p-3 text-sm text-gray-300 resize-y focus:outline-none focus:border-purple-500"
                            :placeholder="t('project.info.guidelines_placeholder')"
                        ></textarea>
                        <div class="flex justify-end space-x-2">
                            <button
                                class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
                                @click="cancelEditGuidelines"
                            >
                                {{ t('common.cancel') }}
                            </button>
                            <button
                                class="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
                                @click="saveGuidelines"
                            >
                                {{ t('common.save') }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Output Type -->
            <div class="space-y-2 border-t border-gray-700 pt-4">
                <div class="flex items-center justify-between">
                    <label class="text-sm font-medium text-gray-400">{{
                        t('project.info.output_type')
                    }}</label>
                    <button
                        v-if="!isEditingOutputType"
                        class="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                        @click="startEditOutputType"
                    >
                        <svg
                            class="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                        </svg>
                        <span>{{ t('common.edit') }}</span>
                    </button>
                </div>

                <!-- View Mode -->
                <div v-if="!isEditingOutputType" class="flex items-center space-x-2">
                    <IconRenderer :emoji="outputTypeDisplay.icon" class="w-5 h-5" />
                    <div>
                        <div class="text-sm font-medium text-gray-300">
                            {{ outputTypeDisplay.name }}
                        </div>
                        <div class="text-xs text-gray-500">
                            {{ outputTypeDisplay.description }}
                        </div>
                    </div>
                </div>

                <!-- Edit Mode -->
                <div v-else class="space-y-2">
                    <select
                        v-model="editedOutputType"
                        class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                    >
                        <option :value="null">{{ t('common.not_selected') }}</option>
                        <option v-for="(info, type) in outputTypes" :key="type" :value="type">
                            {{ info.icon }} {{ info.name }}
                        </option>
                    </select>
                    <div class="flex justify-end space-x-2">
                        <button
                            class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
                            @click="cancelEditOutputType"
                        >
                            {{ t('common.cancel') }}
                        </button>
                        <button
                            class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                            @click="saveOutputType"
                        >
                            {{ t('common.save') }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- AI Settings (Project Default) -->
            <div class="space-y-3 border-t border-gray-700 pt-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <label class="text-sm font-medium text-gray-300">{{
                            t('project.info.project_default_ai')
                        }}</label>
                        <!-- Claude Code Sync Status Badge -->
                        <span
                            v-if="claudeSyncStatus"
                            class="px-2 py-0.5 text-xs rounded-full flex items-center gap-1"
                            :class="
                                claudeSyncColor === 'green'
                                    ? 'bg-green-900/30 text-green-300 border border-green-700/50'
                                    : 'bg-gray-700/50 text-gray-400 border border-gray-600/50'
                            "
                        >
                            <svg
                                v-if="claudeSyncColor === 'green'"
                                class="w-3 h-3"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <span>{{ claudeSyncStatus }}</span>
                        </span>
                    </div>
                    <button
                        v-if="!isEditingAI"
                        class="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1 cursor-pointer z-10"
                        @click.stop="startEditAI"
                    >
                        <svg
                            class="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                        </svg>
                        <span>{{ t('common.edit') }}</span>
                    </button>
                </div>

                <!-- View Mode -->
                <div v-if="!isEditingAI" class="grid grid-cols-2 gap-4">
                    <!-- AI Provider -->
                    <div class="space-y-1">
                        <label class="text-xs text-gray-500">{{
                            t('project.info.ai_provider')
                        }}</label>
                        <div class="flex items-center space-x-2">
                            <IconRenderer :emoji="aiProviderDisplay.icon" class="w-4 h-4" />
                            <span :class="aiProviderDisplay.color" class="text-sm font-medium">
                                {{ aiProviderDisplay.name }}
                            </span>
                        </div>
                    </div>

                    <!-- AI Model -->
                    <div class="space-y-1">
                        <label class="text-xs text-gray-500">{{
                            t('project.info.ai_model')
                        }}</label>
                        <div class="text-sm font-medium text-gray-300">
                            {{ aiModelDisplay }}
                            <span
                                v-if="effectiveAI.source === 'global' && !props.project.aiModel"
                                class="text-xs text-gray-500 ml-1"
                            >
                                ({{ t('project.info.settings_default') }})
                            </span>
                            <span
                                v-if="effectiveAI.source === 'project' && props.project.aiProvider"
                                class="text-xs text-blue-400 ml-1"
                            >
                                ({{ t('project.info.project_value') }})
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Edit Mode -->
                <div v-else class="space-y-3">
                    <!-- Unified AI Selector -->
                    <UnifiedAISelector
                        v-model:mode="editedAIMode"
                        v-model:provider="editedAIProvider"
                        v-model:model="editedAIModel"
                        v-model:local-agent="editedLocalAgent"
                        :is-dev-project="true"
                        :label="t('project.info.project_default_ai')"
                    />

                    <!-- Info Banner -->
                    <div class="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3">
                        <div class="flex items-start space-x-2">
                            <svg
                                class="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <div class="text-xs text-blue-300">
                                {{ t('project.info.project_default_ai_info') }}
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex justify-end space-x-2">
                        <button
                            class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
                            @click="cancelEditAI"
                        >
                            {{ t('common.cancel') }}
                        </button>
                        <button
                            class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                            @click="saveAISettings"
                        >
                            {{ t('common.save') }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Base Dev Folder -->
            <div class="space-y-2 border-t border-gray-700 pt-4">
                <label class="text-sm font-medium text-gray-300">{{
                    t('project.info.base_folder')
                }}</label>
                <div class="flex items-center space-x-2">
                    <div
                        class="flex-1 bg-gray-900/50 rounded px-3 py-2 text-sm text-gray-400 font-mono truncate"
                    >
                        {{ project.baseDevFolder || t('project.info.base_folder_not_set') }}
                    </div>
                    <button
                        class="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors text-gray-300"
                        :title="t('project.info.base_folder_change')"
                        @click="pickBaseFolder"
                    >
                        <FolderOpen class="w-4 h-4" />
                    </button>
                </div>
            </div>

            <!-- MCP 설정 -->
            <div class="space-y-3 border-t border-gray-700 pt-4">
                <div class="flex items-center justify-between">
                    <label class="text-sm font-medium text-gray-300">{{
                        t('project.info.mcp_settings')
                    }}</label>
                    <button
                        v-if="!isEditingMCP"
                        class="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                        @click="startEditMCP"
                    >
                        <svg
                            class="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                        </svg>
                        <span>{{ t('common.edit') }}</span>
                    </button>
                </div>

                <!-- View Mode -->
                <div v-if="!isEditingMCP">
                    <div
                        v-if="project.mcpConfig && Object.keys(project.mcpConfig).length > 0"
                        class="space-y-2"
                    >
                        <div
                            v-for="(config, serverId) in project.mcpConfig"
                            :key="serverId"
                            class="bg-gray-900/30 rounded-lg p-3"
                        >
                            <div class="text-sm font-medium text-gray-300">{{ serverId }}</div>
                            <div class="text-xs text-gray-500 mt-1">
                                {{
                                    t('project.info.mcp_env_count', {
                                        count: Object.keys(config.env || {}).length,
                                    })
                                }},
                                {{
                                    t('project.info.mcp_params_count', {
                                        count: Object.keys(config.params || {}).length,
                                    })
                                }}
                            </div>
                        </div>
                    </div>
                    <div v-else class="bg-gray-900/30 rounded-lg p-3">
                        <p class="text-xs text-gray-500">{{ t('project.info.mcp_no_servers') }}</p>
                    </div>
                </div>

                <!-- Edit Mode -->
                <div v-else class="space-y-4">
                    <MCPToolSelector
                        v-model:selected-ids="selectedMCPServers"
                        v-model:config="editedMCPConfig"
                    />

                    <!-- Info Banner -->
                    <div class="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3">
                        <div class="flex items-start space-x-2">
                            <svg
                                class="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                            <div class="text-xs text-blue-300">
                                {{ t('project.info.mcp_default_info') }}
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex justify-end space-x-2">
                        <button
                            class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
                            @click="cancelEditMCP"
                        >
                            {{ t('common.cancel') }}
                        </button>
                        <button
                            class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                            @click="saveMCPSettings"
                        >
                            {{ t('common.save') }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Auto Review Settings -->
            <div class="space-y-3 border-t border-gray-700 pt-4">
                <div class="flex items-center justify-between">
                    <label class="text-sm font-medium text-gray-300">{{
                        t('project.info.auto_review_settings')
                    }}</label>
                    <button
                        v-if="!isEditingAutoReview"
                        class="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
                        @click="startEditAutoReview"
                    >
                        <svg
                            class="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                        </svg>
                        <span>{{ t('common.edit') }}</span>
                    </button>
                </div>

                <!-- View Mode -->
                <div v-if="!isEditingAutoReview" class="grid grid-cols-2 gap-4">
                    <!-- AI Provider -->
                    <div class="space-y-1">
                        <label class="text-xs text-gray-500">{{
                            t('project.info.ai_provider')
                        }}</label>
                        <div class="flex items-center space-x-2">
                            <template v-if="autoReviewProviderDisplay.svgPath">
                                <svg
                                    class="w-4 h-4 text-gray-400"
                                    viewBox="0 0 256 256"
                                    fill="currentColor"
                                >
                                    <path :d="autoReviewProviderDisplay.svgPath" />
                                </svg>
                            </template>
                            <IconRenderer
                                v-else
                                :emoji="autoReviewProviderDisplay.icon || '❓'"
                                class="w-4 h-4"
                            />
                            <span
                                :class="autoReviewProviderDisplay.color"
                                class="text-sm font-medium"
                            >
                                {{ autoReviewProviderDisplay.name }}
                            </span>
                        </div>
                    </div>

                    <!-- AI Model -->
                    <div class="space-y-1">
                        <label class="text-xs text-gray-500">{{
                            t('project.info.ai_model')
                        }}</label>
                        <div class="text-sm font-medium text-gray-300">
                            {{ autoReviewModelDisplay }}
                        </div>
                    </div>
                </div>

                <!-- Edit Mode -->
                <div v-else class="space-y-3">
                    <!-- Unified AI Selector -->
                    <UnifiedAISelector
                        v-model:mode="editedAutoReviewMode"
                        v-model:provider="editedAutoReviewProvider"
                        v-model:model="editedAutoReviewModel"
                        v-model:local-agent="editedAutoReviewLocalAgent"
                        :is-dev-project="!!project.baseDevFolder"
                        :label="t('project.info.auto_review_ai_settings')"
                    />

                    <!-- Action Buttons -->
                    <div class="flex justify-end space-x-2">
                        <button
                            class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
                            @click="cancelEditAutoReview"
                        >
                            {{ t('common.cancel') }}
                        </button>
                        <button
                            class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors"
                            @click="saveAutoReviewSettings"
                        >
                            {{ t('common.save') }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- Local Repository Info -->
            <div v-if="project.metadata?.localRepo" class="space-y-2 border-t border-gray-700 pt-4">
                <label class="text-sm font-medium text-gray-400">{{
                    t('project.info.local_repo_info')
                }}</label>

                <div class="bg-gray-900/50 rounded-lg p-3 space-y-2">
                    <div class="text-sm text-gray-300 font-mono truncate">
                        {{ project.metadata.localRepo.path }}
                    </div>

                    <!-- Multiple Assistant Icons -->
                    <div v-if="project.metadata.localRepo.types" class="flex items-center gap-2">
                        <span class="text-xs text-gray-500"
                            >{{ t('project.info.assistant_in_use') }}:</span
                        >
                        <div class="flex items-center gap-1.5">
                            <span
                                v-for="type in project.metadata.localRepo.types.filter(
                                    (t: string) => t !== 'git'
                                )"
                                :key="type"
                                class="px-2 py-1 bg-gray-800 rounded-md text-xs flex items-center gap-1.5"
                            >
                                <span>{{ getAssistantIcon(type) }}</span>
                                <span>{{ getAssistantLabel(type) }}</span>
                            </span>
                            <span
                                v-if="
                                    project.metadata.localRepo.types.length === 1 &&
                                    project.metadata.localRepo.types[0] === 'git'
                                "
                                class="text-xs text-gray-500"
                                >{{ t('project.info.git_only') }}</span
                            >
                        </div>
                    </div>
                </div>
            </div>
            <!-- Output Path -->
            <div v-if="project.outputPath" class="space-y-1">
                <label class="text-xs text-gray-500">{{ t('project.info.output_path') }}</label>
                <div class="flex items-center space-x-2">
                    <div
                        class="flex-1 bg-gray-900/50 rounded px-3 py-2 text-sm text-gray-400 font-mono truncate"
                    >
                        {{ project.outputPath }}
                    </div>
                    <button
                        class="p-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors text-gray-300"
                        :title="t('project.info.open_folder')"
                        @click="handleOpenOutput"
                    >
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                            />
                        </svg>
                    </button>
                </div>
            </div>

            <!-- Statistics -->
            <div class="grid grid-cols-2 gap-3 pt-3 border-t border-gray-700">
                <div class="bg-gray-900/30 rounded-lg p-3">
                    <div class="text-xs text-gray-500">{{ t('project.info.total_cost') }}</div>
                    <div class="text-lg font-semibold text-green-400">{{ formattedCost }}</div>
                </div>
                <div class="bg-gray-900/30 rounded-lg p-3">
                    <div class="text-xs text-gray-500">{{ t('project.info.total_tokens') }}</div>
                    <div class="text-lg font-semibold text-blue-400">{{ formattedTokens }}</div>
                </div>
            </div>

            <!-- Time Estimates -->
            <div
                v-if="project.estimatedHours || project.actualHours"
                class="grid grid-cols-2 gap-3"
            >
                <div v-if="project.estimatedHours" class="text-center">
                    <div class="text-xs text-gray-500">{{ t('project.info.estimated_hours') }}</div>
                    <div class="text-sm text-gray-300">
                        {{ project.estimatedHours }}{{ t('project.info.hours_unit') }}
                    </div>
                </div>
                <div v-if="project.actualHours" class="text-center">
                    <div class="text-xs text-gray-500">{{ t('project.info.actual_hours') }}</div>
                    <div class="text-sm text-gray-300">
                        {{ project.actualHours }}{{ t('project.info.hours_unit') }}
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.project-info-panel {
    @apply w-full;
}

/* Custom scrollbar for prompt area */
.max-h-48::-webkit-scrollbar {
    width: 6px;
}

.max-h-48::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}

.max-h-48::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
}

.max-h-48::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}

/* Guidelines content scrollbar */
.max-h-96::-webkit-scrollbar {
    width: 6px;
}

.max-h-96::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}

.max-h-96::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
}

.max-h-96::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}

/* Guidelines markdown styling */
.guidelines-content :deep(h1) {
    @apply text-lg font-bold text-gray-200 mb-3 mt-4 first:mt-0;
}

.guidelines-content :deep(h2) {
    @apply text-base font-semibold text-gray-300 mb-2 mt-4 first:mt-0;
}

.guidelines-content :deep(h3) {
    @apply text-sm font-medium text-gray-300 mb-2 mt-3;
}

.guidelines-content :deep(p) {
    @apply text-sm text-gray-400 mb-2;
}

.guidelines-content :deep(ul) {
    @apply list-disc list-inside text-sm text-gray-400 mb-2 space-y-1;
}

.guidelines-content :deep(ol) {
    @apply list-decimal list-inside text-sm text-gray-400 mb-2 space-y-1;
}

.guidelines-content :deep(li) {
    @apply text-gray-400;
}

.guidelines-content :deep(code) {
    @apply bg-gray-800 px-1.5 py-0.5 rounded text-xs text-purple-300;
}

.guidelines-content :deep(pre) {
    @apply bg-gray-800 p-3 rounded-lg mb-2 overflow-x-auto;
}

.guidelines-content :deep(pre code) {
    @apply bg-transparent p-0;
}

.guidelines-content :deep(blockquote) {
    @apply border-l-2 border-purple-500 pl-3 italic text-gray-500 mb-2;
}

.guidelines-content :deep(hr) {
    @apply border-gray-700 my-4;
}

.guidelines-content :deep(strong) {
    @apply font-semibold text-gray-200;
}

.guidelines-content :deep(a) {
    @apply text-purple-400 hover:text-purple-300 underline;
}
</style>
