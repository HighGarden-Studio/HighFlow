<script setup lang="ts">
/**
 * Project Creation Wizard
 *
 * AI-powered project creation flow:
 * 1. Initial idea input
 * 2. AI provider selection
 * 3. AI interview for idea refinement
 * 4. Idea concretization & task generation
 * 5. Task plan preview with AI model recommendations
 * 6. User approval/revision
 * 7. Prompt optimization for each task
 * 8. Final review & project creation
 */

import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { marked } from 'marked';
import {
    aiInterviewService,
    type InterviewSession,
    type ConcretizedIdea,
    type SuggestedTask,
    type AIProvider,
    type EnhancedExecutionPlan,
    type TaskOutputFormat,
    type QuestionType,
} from '../../services/ai/AIInterviewService';
import {
    aiModelRecommendationService,
    type ModelRecommendation,
    type AIModel,
} from '../../services/ai/AIModelRecommendationService';
import {
    promptEnhancementService,
    type EnhancementOptions,
} from '../../services/prompt/PromptEnhancementService';
import { useSettingsStore } from '../../renderer/stores/settingsStore';
import { eventBus, type BaseEvent } from '../../services/events/EventBus';
import { aiGuidelinesService } from '../../services/ai/AIGuidelinesService';
import { aiProviderSelectionService } from '../../services/ai/AIProviderSelection';
import type { TaskPriority } from '../../renderer/stores/taskStore';

// ========================================
// Props & Emits
// ========================================

interface Props {
    open: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'created', project: any): void;
}>();

// Settings Store
const settingsStore = useSettingsStore();

// Chat-capable provider IDs (providers that support conversational AI)
const CHAT_CAPABLE_PROVIDERS = [
    'openai',
    'anthropic',
    'google',
    'azure-openai',
    'mistral',
    'groq',
    'deepseek',
    'cohere',
    'openrouter',
    'together',
    'fireworks',
    'perplexity',
    'ollama',
    'lmstudio',
    'zhipu',
    'moonshot',
    'qwen',
    'baidu',
];

// Get available chat providers that are enabled and configured
const availableChatProviders = computed(() => {
    return settingsStore.aiProviders.filter((provider) => {
        // Must be a chat-capable provider
        if (!CHAT_CAPABLE_PROVIDERS.includes(provider.id)) return false;

        // Must be enabled
        if (!provider.enabled) return false;

        // Must have API key (or be a local provider with baseUrl)
        if (provider.id === 'ollama' || provider.id === 'lmstudio') {
            return !!provider.baseUrl;
        }

        return !!provider.apiKey && provider.apiKey.length > 10;
    });
});

// ========================================
// Wizard Steps
// ========================================

type WizardStep =
    | 'idea' // 1. 아이디어 입력
    | 'provider' // 2. AI 제공자 선택
    | 'interview' // 3. AI 인터뷰
    | 'concretize' // 4. 아이디어 구체화
    | 'preview' // 5. 태스크 계획 프리뷰
    | 'optimize' // 6. 프롬프트 최적화
    | 'confirm'; // 7. 최종 확인

const STEPS: { id: WizardStep; title: string; description: string }[] = [
    { id: 'idea', title: '아이디어', description: '프로젝트 아이디어를 입력하세요' },
    { id: 'provider', title: 'AI 선택', description: '인터뷰를 진행할 AI를 선택하세요' },
    { id: 'interview', title: 'AI 인터뷰', description: 'AI와 대화하며 아이디어를 구체화합니다' },
    {
        id: 'concretize',
        title: '아이디어 구체화',
        description: '수집된 정보를 기반으로 아이디어를 구체화합니다',
    },
    { id: 'preview', title: '실행 계획', description: '생성된 태스크와 AI 모델 추천을 확인하세요' },
    {
        id: 'optimize',
        title: '프롬프트 최적화',
        description: '각 태스크의 프롬프트를 최적화합니다',
    },
    { id: 'confirm', title: '최종 확인', description: '프로젝트 생성을 완료합니다' },
];

// ========================================
// State
// ========================================

const currentStep = ref<WizardStep>('idea');
const currentStepIndex = computed(() => STEPS.findIndex((s) => s.id === currentStep.value));
const currentStepInfo = computed(() => STEPS[currentStepIndex.value] ?? STEPS[0]);

// Step 1: Idea
const ideaText = ref('');

// Local Repository Selection
type CreationMode = 'ai-wizard' | 'local-repo';
const creationMode = ref<CreationMode>('ai-wizard');

interface DiscoveredRepo {
    path: string;
    name: string;
    type: 'git' | 'claude-code' | 'codex' | 'antigravity';
    types?: string[]; // All detected assistant types
    lastModified: Date;
    description?: string;
    remoteUrl?: string;
}

const discoveredRepos = ref<DiscoveredRepo[]>([]);
const isScanning = ref(false);
const selectedRepo = ref<DiscoveredRepo | null>(null);
const repoFilter = ref<'all' | 'git' | 'claude-code' | 'codex' | 'antigravity'>('all');
const repoSearchQuery = ref('');

// Step 2: Provider - will be set to first available provider
const selectedProvider = ref<AIProvider | null>(null);

// Auto-select first available provider when available
watch(
    availableChatProviders,
    (providers) => {
        if (!selectedProvider.value) {
            const firstProvider = providers[0];
            if (firstProvider) {
                selectedProvider.value = firstProvider.id as AIProvider;
            }
        }
    },
    { immediate: true }
);

// Step 3: Interview
const interviewSession = ref<InterviewSession | null>(null);
const chatInput = ref('');
const isProcessing = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const chatContainer = ref<HTMLElement | null>(null);
const hasTypingBubble = computed(
    () => !!interviewSession.value?.messages.some((m) => m.metadata?.typing)
);

// AI 위임 프리셋 답변 옵션
const AI_DELEGATE_PRESETS = [
    {
        id: 'ai-decide',
        label: 'AI 판단에 맡기기',
        description: 'AI가 최선의 선택을 하도록 위임합니다',
    },
    {
        id: 'simple',
        label: '가장 간단한 방법으로',
        description: '복잡도를 최소화하는 방향으로 진행합니다',
    },
    {
        id: 'best-practice',
        label: '업계 표준/베스트 프랙티스로',
        description: '일반적으로 권장되는 방식을 따릅니다',
    },
    {
        id: 'skip',
        label: '이 부분은 나중에 결정',
        description: '해당 질문은 건너뛰고 나중에 결정합니다',
    },
];

// Step 4: Concretization
const concretizedIdea = ref<ConcretizedIdea | null>(null);
const isConcretizing = ref(false);

// 요구사항 추가 기능
const showAddRequirement = ref(false);
const newRequirementInput = ref('');
const isAddingRequirement = ref(false);

// Step 5: Preview
const taskRecommendations = ref<Map<string, ModelRecommendation>>(new Map());
const selectedTasks = ref<Set<string>>(new Set());
const isLoadingRecommendations = ref(false);

// Step 6: Optimization
type OptimizedTask = SuggestedTask & {
    aiOptimizedPrompt?: string;
    executionOrder?: number;
    requiredMCPs?: string[];
    recommendedProviders?: string[];
    tags?: string[];
    expectedOutputFormat?: string;
    priority?: TaskPriority;
};

const optimizedTasks = ref<OptimizedTask[]>([]);
const currentOptimizingTask = ref<number>(0);
const isOptimizing = ref(false);

function mapOutputFormatToEnhancementFormat(
    format?: TaskOutputFormat
): EnhancementOptions['outputFormat'] {
    switch (format) {
        case 'code':
        case 'shell':
        case 'sql':
        case 'json':
        case 'yaml':
        case 'diff':
            return 'code';
        case 'csv':
        case 'log':
            return 'data';
        case 'markdown':
        case 'html':
        case 'pdf':
        case 'text':
            return 'document';
        case 'png':
        case 'svg':
        case 'mermaid':
        case 'mp4':
        case 'mp3':
            return 'design';
        default:
            return 'general';
    }
}

// Step 7: Confirm
const projectTitle = ref('');
const projectDescription = ref('');
const baseDevFolder = ref('');

// Execution Plan (상세 태스크 계획)
const executionPlan = ref<EnhancedExecutionPlan | null>(null);

// ========================================
// Computed
// ========================================

const canProceed = computed(() => {
    switch (currentStep.value) {
        case 'idea':
            // For local-repo mode, require a selected repo
            if (creationMode.value === 'local-repo') {
                return selectedRepo.value !== null;
            }
            return ideaText.value.trim().length >= 20;
        case 'provider':
            return selectedProvider.value !== null && availableChatProviders.value.length > 0;
        case 'interview':
            return (
                interviewSession.value?.status === 'completed' ||
                (interviewSession.value?.context.confidence ?? 0) >= 70
            );
        case 'concretize':
            return !isConcretizing.value && concretizedIdea.value !== null;
        case 'preview':
            return selectedTasks.value.size > 0;
        case 'optimize':
            return optimizedTasks.value.length > 0;
        case 'confirm':
            return projectTitle.value.trim().length > 0;
        default:
            return false;
    }
});

const interviewProgress = computed(() => {
    return interviewSession.value?.context.confidence ?? 0;
});

const filteredRepos = computed(() => {
    let repos = discoveredRepos.value;

    // Filter by type
    if (repoFilter.value !== 'all') {
        repos = repos.filter((r) => r.type === repoFilter.value);
    }

    // Filter by search query
    if (repoSearchQuery.value.trim()) {
        const query = repoSearchQuery.value.toLowerCase();
        repos = repos.filter(
            (r) =>
                r.name.toLowerCase().includes(query) ||
                r.path.toLowerCase().includes(query) ||
                (r.description && r.description.toLowerCase().includes(query))
        );
    }

    return repos;
});

// 개발 프로젝트 여부 추론 (기술 스택/코드 출력 형식 유무)
const isDevProject = computed(() => {
    const stack = executionPlan.value?.architecture ? executionPlan.value.architecture : '';
    const techStack = executionPlan.value?.tasks?.map((t) => t.codeLanguage).filter(Boolean) || [];
    const planStack = concretizedIdea.value?.technicalSpecification?.stack || [];
    const hasStack = planStack.length > 0 || techStack.length > 0 || stack.length > 0;

    const hasCodeOutput = wizardTasks.value.some((task) => {
        const format = (task.primaryOutputFormat || task.expectedOutputFormat || '')
            .toString()
            .toLowerCase();
        return ['code', 'yaml', 'json', 'shell', 'sql', 'markdown'].includes(format);
    });

    return hasStack || hasCodeOutput;
});

// 실행 계획이 존재하면 해당 태스크를 우선 사용 (아이디어 구체화 + 실행계획 반영)
const wizardTasks = computed<OptimizedTask[]>(() => {
    if (executionPlan.value) {
        return executionPlan.value.tasks.map((task, index) => {
            const provider =
                (task.recommendedProviders?.[0] as AIProvider | undefined) || 'anthropic';
            const expectedFormat =
                (task.expectedOutputFormat as TaskOutputFormat | undefined) || 'markdown';
            return {
                title: task.title,
                description: task.description,
                category: task.category || 'feature',
                estimatedMinutes: task.estimatedMinutes || 60,
                dependencies: task.dependencies?.map(String) || [],
                suggestedAIProvider: provider,
                suggestedModel: task.recommendedProviders?.[0] || provider,
                complexity: task.complexity || 'medium',
                outputFormats: [expectedFormat],
                primaryOutputFormat: expectedFormat,
                outputDescription: task.description,
                codeLanguage: task.codeLanguage,
                mcpTools: (task.requiredMCPs || []).map((server) => ({ server, required: true })),
                promptTemplate: task.aiOptimizedPrompt,
                aiOptimizedPrompt: task.aiOptimizedPrompt,
                executionOrder: task.executionOrder || index + 1,
                requiredMCPs: task.requiredMCPs || [],
                recommendedProviders: task.recommendedProviders || [],
                tags: task.tags || [],
                expectedOutputFormat: task.expectedOutputFormat || expectedFormat,
            };
        });
    }

    const suggested = concretizedIdea.value?.suggestedTasks || [];
    return suggested.map((task, index) => ({
        ...task,
        executionOrder: index + 1,
        aiOptimizedPrompt: task.promptTemplate,
        requiredMCPs: task.mcpTools?.map((hint) => hint.server) || [],
        recommendedProviders: [],
        tags: [],
        expectedOutputFormat: task.primaryOutputFormat,
    }));
});

// ========================================
// Methods - Local Repository Selection
// ========================================

async function scanLocalRepositories() {
    if (isScanning.value) return;

    isScanning.value = true;
    discoveredRepos.value = [];

    try {
        // electron API is injected via preload
        const repos = await (window as any).electron.fs.scanRepositories({
            includeGit: true,
            includeClaudeCode: true,
            includeCodex: true,
            includeAntigravity: true,
            maxDepth: 4,
        });

        discoveredRepos.value = repos;
    } catch (error) {
        console.error('Failed to scan repositories:', error);
    } finally {
        isScanning.value = false;
    }
}

async function selectCustomDirectory() {
    try {
        // electron API is injected via preload
        const dirPath = await (window as any).electron.fs.selectDirectory();
        if (!dirPath) return;

        // Check repo type
        const repoInfo = await (window as any).electron.fs.checkRepoType(dirPath);

        if (repoInfo.isValid) {
            const repo: DiscoveredRepo = {
                path: repoInfo.path,
                name: repoInfo.name,
                type: repoInfo.types[0] as DiscoveredRepo['type'],
                types: repoInfo.types, // Store all detected types
                lastModified: new Date(),
                description: repoInfo.description,
                remoteUrl: repoInfo.remoteUrl,
            };

            console.log(
                '[ProjectCreationWizard] Selected repo:',
                repo.name,
                'with types:',
                repo.types
            );

            // Add to list if not already there
            if (!discoveredRepos.value.find((r) => r.path === repo.path)) {
                discoveredRepos.value.unshift(repo);
            }

            selectRepo(repo);
        } else {
            // Even if not a recognized repo type, allow selection
            const repo: DiscoveredRepo = {
                path: dirPath,
                name: repoInfo.name,
                type: 'git', // default type
                types: repoInfo.types.length > 0 ? repoInfo.types : ['git'], // Store types or default to git
                lastModified: new Date(),
                description: repoInfo.description,
            };

            if (!discoveredRepos.value.find((r) => r.path === repo.path)) {
                discoveredRepos.value.unshift(repo);
            }

            selectRepo(repo);
        }
    } catch (error) {
        console.error('Failed to select directory:', error);
    }
}

async function selectBaseDevFolder() {
    try {
        const dirPath = await (window as any).electron?.fs?.selectDirectory();
        if (dirPath) {
            baseDevFolder.value = dirPath;
        }
    } catch (error) {
        console.error('Failed to select base dev folder:', error);
    }
}

function selectRepo(repo: DiscoveredRepo) {
    selectedRepo.value = repo;
    projectTitle.value = repo.name;
    if (repo.description) {
        projectDescription.value = repo.description;
    }
    ideaText.value = `기존 로컬 저장소를 기반으로 프로젝트를 생성합니다.\n\n경로: ${repo.path}\n타입: ${repo.type}${repo.description ? `\n설명: ${repo.description}` : ''}`;
}

function getRepoTypeIcon(type: DiscoveredRepo['type']): string {
    switch (type) {
        case 'git':
            return '📂';
        case 'claude-code':
            return '🤖';
        case 'codex':
            return '⚡';
        case 'antigravity':
            return '🚀';
        default:
            return '📁';
    }
}

const getRepoTypeColor = (type: string) => {
    const t = type.toLowerCase();
    if (t === 'git') return 'bg-gray-600 text-white';
    if (t === 'claude-code') return 'bg-violet-500 text-white';
    if (t === 'codex') return 'bg-cyan-500 text-white';
    if (t.includes('antigravity')) return 'bg-fuchsia-500 text-white'; // Handle Antigravity (Gemini)
    if (t === 'cursor') return 'bg-blue-500 text-white';
    if (t === 'windsurf') return 'bg-teal-500 text-white';
    if (t === 'aider') return 'bg-green-500 text-white';
    if (t === 'copilot') return 'bg-slate-700 text-white';
    return 'bg-gray-500 text-white';
};

function formatRelativeTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return '오늘';
    if (days === 1) return '어제';
    if (days < 7) return `${days}일 전`;
    if (days < 30) return `${Math.floor(days / 7)}주 전`;
    if (days < 365) return `${Math.floor(days / 30)}개월 전`;
    return `${Math.floor(days / 365)}년 전`;
}

// ========================================
// Methods - Navigation
// ========================================

function nextStep() {
    const idx = currentStepIndex.value;
    if (idx < STEPS.length - 1) {
        // 단계별 액션
        if (currentStep.value === 'provider') {
            startInterview();
        } else if (currentStep.value === 'interview') {
            concretizeIdea();
        } else if (currentStep.value === 'concretize') {
            loadRecommendations();
        } else if (currentStep.value === 'preview') {
            optimizeTasks();
        }

        const nextStepDef = STEPS[idx + 1];
        if (nextStepDef) {
            currentStep.value = nextStepDef.id;
        }
    }
}

function prevStep() {
    const idx = currentStepIndex.value;
    if (idx > 0) {
        const prevStepDef = STEPS[idx - 1];
        if (prevStepDef) {
            currentStep.value = prevStepDef.id;
        }
    }
}

function goToStep(step: WizardStep) {
    const targetIdx = STEPS.findIndex((s) => s.id === step);
    if (targetIdx <= currentStepIndex.value) {
        currentStep.value = step;
    }
}

// ========================================
// Methods - Step 3: Interview
// ========================================

function startInterview() {
    if (!selectedProvider.value) return;

    console.info('[ProjectCreationWizard] Starting AI interview', {
        provider: selectedProvider.value,
        availableProviders: availableChatProviders.value.map((p) => p.id),
    });

    // 연동된 Provider 목록을 aiInterviewService에 설정
    const enabledProviders = settingsStore.getEnabledProvidersForRecommendation();
    aiInterviewService.setEnabledProviders(enabledProviders);
    aiInterviewService.setPreferBestOverall(true);

    const session = aiInterviewService.startSession(ideaText.value, selectedProvider.value);
    interviewSession.value = session;

    // 세션의 AI provider 변경을 감시 (폴백 발생 시)
    const checkFallback = setInterval(() => {
        const updatedSession = aiInterviewService.getSession(session.id);
        if (updatedSession) {
            // Vue 반응성을 위해 깊은 복사
            const cloned = JSON.parse(JSON.stringify(updatedSession));
            cloned.context.coveredAreas = new Set(updatedSession.context.coveredAreas);
            interviewSession.value = cloned;

            // 폴백 발생 시 selectedProvider 업데이트
            if (
                updatedSession.fallbackOccurred &&
                updatedSession.aiProvider !== selectedProvider.value
            ) {
                console.warn('[ProjectCreationWizard] Interview provider fallback detected', {
                    previousProvider: selectedProvider.value,
                    newProvider: updatedSession.aiProvider,
                });
                selectedProvider.value = updatedSession.aiProvider;
            }

            // AI 분석 완료 후 체크 중단
            if (updatedSession.messages.length > 1) {
                clearInterval(checkFallback);
            }
        }
    }, 500);

    // 10초 후 체크 중단 (안전장치)
    setTimeout(() => clearInterval(checkFallback), 10000);
}

/**
 * 세션 새로고침 헬퍼 - Vue 반응성을 위해 깊은 복사 수행
 */
function refreshSession() {
    if (!interviewSession.value) return;

    const updatedSession = aiInterviewService.getSession(interviewSession.value.id);
    if (updatedSession) {
        // 깊은 복사를 통해 Vue가 변경을 감지할 수 있도록 함
        const cloned = JSON.parse(JSON.stringify(updatedSession));
        // Set 객체 복원
        cloned.context.coveredAreas = new Set(updatedSession.context.coveredAreas);
        interviewSession.value = cloned;
    }
}

/**
 * 채팅 영역을 최하단으로 자동 스크롤
 */
function scrollToBottom() {
    nextTick(() => {
        if (chatContainer.value) {
            chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
        }
    });
}

function removeMessageById(id: string) {
    if (!interviewSession.value) return;
    const updated = { ...interviewSession.value };
    updated.messages = updated.messages.filter((m) => m.id !== id);
    interviewSession.value = updated as any;
}

function addTypingFallbackBubble() {
    if (!interviewSession.value) return;
    const updated = { ...interviewSession.value };
    updated.messages = [
        ...updated.messages,
        {
            id: `fallback-typing-${Date.now()}`,
            role: 'assistant' as const,
            content: 'AI가 답변을 준비 중입니다...',
            timestamp: new Date(),
            metadata: { typing: true },
        },
    ];
    interviewSession.value = updated as any;
    scrollToBottom();
}

function getLastAskedQuestionType(): QuestionType | null {
    const lastAssistant = interviewSession.value?.messages
        .slice()
        .reverse()
        .find((m) => m.role === 'assistant' && m.metadata?.questionType);
    return (lastAssistant?.metadata?.questionType as QuestionType | undefined) ?? null;
}

function chooseOption(option: string) {
    if (isProcessing.value) return;
    chatInput.value = option;
    sendMessage();
}

// AI 응답 스트리밍 애니메이션 (타자 효과)
let streamingTimer: number | null = null;
function animateStreamingResponse(messageId: string, fullContent: string) {
    if (streamingTimer) {
        clearInterval(streamingTimer);
        streamingTimer = null;
    }
    if (!interviewSession.value) return;

    const sessionClone = { ...interviewSession.value };
    sessionClone.messages = [...sessionClone.messages];
    const idx = sessionClone.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;

    const baseMessage = sessionClone.messages[idx];
    if (!baseMessage) {
        return;
    }
    const baseMeta = baseMessage.metadata || {};
    sessionClone.messages[idx] = {
        ...baseMessage,
        content: '',
        metadata: { ...baseMeta, streaming: true },
    };
    interviewSession.value = sessionClone as any;

    let cursor = 0;
    streamingTimer = window.setInterval(() => {
        if (!interviewSession.value) return;
        const updated = { ...interviewSession.value };
        updated.messages = [...updated.messages];
        const index = updated.messages.findIndex((m) => m.id === messageId);
        if (index === -1) {
            clearInterval(streamingTimer!);
            streamingTimer = null;
            return;
        }
        const currentMessage = updated.messages[index];
        if (!currentMessage) {
            clearInterval(streamingTimer!);
            streamingTimer = null;
            return;
        }

        cursor += Math.max(1, Math.floor(fullContent.length / 40)); // 속도 조절
        if (cursor >= fullContent.length) {
            updated.messages[index] = {
                ...currentMessage,
                content: fullContent,
                metadata: { ...(currentMessage.metadata || {}), streaming: false },
            };
            interviewSession.value = updated as any;
            clearInterval(streamingTimer!);
            streamingTimer = null;
            return;
        }

        updated.messages[index] = {
            ...currentMessage,
            content: fullContent.slice(0, cursor),
            metadata: { ...(currentMessage.metadata || {}), streaming: true },
        };
        interviewSession.value = updated as any;
    }, 40);
}

/**
 * 세션 업데이트 이벤트 핸들러 (fallback 등)
 */
function handleSessionUpdated(event: BaseEvent) {
    const payload = (event.payload || {}) as { sessionId?: string };
    if (interviewSession.value && payload.sessionId === interviewSession.value.id) {
        // 세션 새로고침
        refreshSession();
        // 스크롤
        scrollToBottom();
    }
}

// 이벤트 구독/해제
onMounted(() => {
    eventBus.on('interview.sessionUpdated', handleSessionUpdated);
});

onUnmounted(() => {
    eventBus.off('interview.sessionUpdated', handleSessionUpdated);
});

/**
 * AI 위임 프리셋 답변 선택
 */
function selectPresetAnswer(preset: (typeof AI_DELEGATE_PRESETS)[number]) {
    const messages: Record<string, string> = {
        'ai-decide':
            'AI가 최선이라고 판단하는 방식으로 진행해주세요. 전문적인 판단에 맡기겠습니다.',
        simple: '가장 간단하고 단순한 방식으로 진행해주세요. 복잡한 기능은 필요 없습니다.',
        'best-practice': '업계에서 일반적으로 사용하는 표준적인 방법으로 진행해주세요.',
        skip: '이 부분은 아직 결정하기 어렵습니다. 나중에 다시 검토하겠습니다.',
    };

    chatInput.value = messages[preset.id] || preset.label;
    sendMessage();
}

async function sendMessage() {
    if (!chatInput.value.trim() || !interviewSession.value || isProcessing.value) return;

    const message = chatInput.value.trim();
    chatInput.value = '';
    isProcessing.value = true;
    const sessionId = interviewSession.value.id;

    // UI 즉시 반영: 사용자 메시지 및 타이핑 플레이스홀더 추가
    let typingId: string | null = null;
    if (interviewSession.value) {
        const localSession = { ...interviewSession.value };
        localSession.messages = [...localSession.messages];

        const userMessage = {
            id: `local-user-${Date.now()}`,
            role: 'user' as const,
            content: message,
            timestamp: new Date(),
        };
        typingId = `local-typing-${Date.now()}`;
        const typingMessage = {
            id: typingId,
            role: 'assistant' as const,
            content: 'AI가 답변을 준비 중입니다...',
            timestamp: new Date(),
            metadata: { typing: true },
        };

        localSession.messages.push(userMessage, typingMessage);
        interviewSession.value = localSession as any;
    }

    // 사용자 메시지 전송 후 스크롤
    scrollToBottom();

    try {
        const lastQuestionType = getLastAskedQuestionType();
        // 다음 질문 타입 가져오기 (AI 기반)
        const nextQuestion = await aiInterviewService.getNextQuestionAsync(sessionId);
        const inferredQuestionType: QuestionType | undefined =
            lastQuestionType ?? nextQuestion?.type ?? undefined;

        const assistantMsg = await aiInterviewService.processResponse(
            sessionId,
            message,
            inferredQuestionType
        );

        // 세션 새로고침 (Vue 반응성을 위해 깊은 복사)
        refreshSession();

        // 타이핑 플레이스홀더 제거
        if (typingId && interviewSession.value) {
            removeMessageById(typingId);
        }

        // 스트리밍처럼 보이도록 메시지 컨텐츠를 점진적으로 채움
        if (assistantMsg?.id && assistantMsg.content) {
            animateStreamingResponse(assistantMsg.id, assistantMsg.content);
        } else if (typingId && interviewSession.value) {
            // 스트리밍이 불가한 경우 준비중 버블 유지
            addTypingFallbackBubble();
        }

        // AI 응답 후 스크롤
        scrollToBottom();
    } catch (error) {
        console.error('Failed to process message:', error);
    } finally {
        isProcessing.value = false;
    }
}

function forceCompleteInterview() {
    if (interviewSession.value) {
        aiInterviewService.forceComplete(interviewSession.value.id);
        // Vue 반응성을 위해 깊은 복사로 세션 새로고침
        refreshSession();
    }
}

async function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length || !interviewSession.value) return;

    for (const file of Array.from(input.files)) {
        const content = await readFileContent(file);
        await aiInterviewService.attachDocument(interviewSession.value.id, {
            name: file.name,
            type: file.type,
            content,
            size: file.size,
        });

        // Vue 반응성을 위해 깊은 복사로 세션 새로고침
        refreshSession();
    }

    input.value = '';
}

async function readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// ========================================
// Methods - Step 4: Concretization
// ========================================

async function concretizeIdea() {
    if (!interviewSession.value) return;

    isConcretizing.value = true;
    concretizedIdea.value = null;
    executionPlan.value = null;
    selectedTasks.value.clear();
    try {
        const result = await aiInterviewService.concretizeIdea(interviewSession.value.id);
        concretizedIdea.value = result;

        // 기본 제목 설정
        projectTitle.value = result.title;
        projectDescription.value = result.summary;

        // 실행 계획 생성 (상세 태스크 포함)
        await generateExecutionPlan();

        // 모든 태스크 선택
        wizardTasks.value.forEach((_, idx) => {
            selectedTasks.value.add(idx.toString());
        });
    } catch (error) {
        console.error('Failed to concretize idea:', error);
    } finally {
        isConcretizing.value = false;
    }
}

async function generateExecutionPlan() {
    if (!interviewSession.value) return;

    try {
        executionPlan.value = await aiInterviewService.generateDetailedExecutionPlan(
            interviewSession.value.id
        );

        // 실행 계획 기반으로 기본 프로젝트 정보 업데이트
        if (executionPlan.value) {
            projectTitle.value = executionPlan.value.projectTitle;
            projectDescription.value = executionPlan.value.projectSummary;

            // 필수 필드 보강 (태그, 추천 모델, 결과물 형식, MCP 등)
            executionPlan.value = {
                ...executionPlan.value,
                tasks: executionPlan.value.tasks.map((task, index) => ({
                    ...task,
                    recommendedProviders: task.recommendedProviders?.length
                        ? task.recommendedProviders
                        : selectedProvider.value
                          ? [selectedProvider.value]
                          : ['anthropic'],
                    requiredMCPs: task.requiredMCPs || [],
                    estimatedMinutes: task.estimatedMinutes || 60,
                    expectedOutputFormat: task.expectedOutputFormat || 'markdown',
                    aiOptimizedPrompt: task.aiOptimizedPrompt || task.description,
                    tags:
                        task.tags && task.tags.length > 0
                            ? task.tags
                            : task.category
                              ? [task.category]
                              : [],
                    executionOrder: task.executionOrder || index + 1,
                })),
            };
        }
    } catch (error) {
        console.error('Failed to generate execution plan:', error);
    }
}

/**
 * 요구사항 추가 및 태스크 생성
 */
async function addRequirementAndGenerateTasks() {
    if (!newRequirementInput.value.trim() || !concretizedIdea.value || !interviewSession.value)
        return;

    isAddingRequirement.value = true;

    try {
        // 인터뷰 세션에 요구사항 추가
        await aiInterviewService.processResponse(
            interviewSession.value.id,
            newRequirementInput.value.trim(),
            'scope'
        );

        // 기존 태스크 수 저장
        const previousTaskCount = concretizedIdea.value.suggestedTasks.length;

        // 아이디어 재구체화
        const result = await aiInterviewService.concretizeIdea(interviewSession.value.id);
        concretizedIdea.value = result;

        // 새로 추가된 태스크만 선택 목록에 추가
        result.suggestedTasks.forEach((_, idx) => {
            if (idx >= previousTaskCount) {
                selectedTasks.value.add(idx.toString());
            }
        });

        // 새로 추가된 태스크에 대한 AI 모델 추천 로드 (preview 단계일 경우)
        if (currentStep.value === 'preview') {
            const enabledProviders = settingsStore.getEnabledProvidersForRecommendation();
            for (const task of result.suggestedTasks.slice(previousTaskCount)) {
                const recommendation = aiModelRecommendationService.recommendModel(
                    task.title,
                    task.description,
                    { enabledProviders }
                );
                taskRecommendations.value.set(task.title, recommendation);
            }
        }

        // 입력 초기화
        newRequirementInput.value = '';
        showAddRequirement.value = false;

        // 실행 계획 갱신
        await generateExecutionPlan();

        // 선택 목록을 최신 태스크로 동기화
        selectedTasks.value = new Set(wizardTasks.value.map((_, idx) => idx.toString()));
    } catch (error) {
        console.error('Failed to add requirement:', error);
    } finally {
        isAddingRequirement.value = false;
    }
}

// ========================================
// Methods - Step 5: Preview & Recommendations
// ========================================

async function loadRecommendations() {
    if (wizardTasks.value.length === 0) return;

    isLoadingRecommendations.value = true;
    taskRecommendations.value.clear();

    try {
        for (const task of wizardTasks.value) {
            const recommendation = aiModelRecommendationService.recommendModel(
                task.title,
                task.description,
                { enabledProviders: undefined } // 품질 우선 추천
            );
            taskRecommendations.value.set(task.title, recommendation);
        }
    } catch (error) {
        console.error('Failed to load recommendations:', error);
    } finally {
        isLoadingRecommendations.value = false;
    }
}

function toggleTaskSelection(taskIdx: string) {
    if (selectedTasks.value.has(taskIdx)) {
        selectedTasks.value.delete(taskIdx);
    } else {
        selectedTasks.value.add(taskIdx);
    }
}

function selectAllTasks() {
    wizardTasks.value.forEach((_, idx) => {
        selectedTasks.value.add(idx.toString());
    });
}

function deselectAllTasks() {
    selectedTasks.value.clear();
}

// ========================================
// Methods - Step 6: Optimization
// ========================================

function buildFallbackRecommendation(task: OptimizedTask): ModelRecommendation | null {
    const providerId =
        (task.recommendedProviders?.[0] as AIProvider | undefined) || task.suggestedAIProvider;
    if (!providerId) {
        return null;
    }

    const fallbackModelId = task.suggestedModel || `${providerId}-default`;
    const placeholderModel: AIModel = {
        id: fallbackModelId,
        provider: providerId,
        name: fallbackModelId,
        displayName: fallbackModelId,
        capabilities: ['conversation', 'structured_output'],
        costPer1kInputTokens: 0,
        costPer1kOutputTokens: 0,
        maxContextLength: 128000,
        avgResponseTime: 1000,
        strengths: ['기본 Provider 사용'],
        weaknesses: ['세부 모델 정보 부족'],
        bestFor: ['general'],
        available: true,
    };

    return {
        model: placeholderModel,
        score: 0,
        reasons: ['세부 추천 정보가 없어 기본 Provider 설정을 사용합니다.'],
        estimatedCost: 0,
        estimatedTime: placeholderModel.avgResponseTime,
        alternativeModels: [],
    };
}

async function optimizeTasks() {
    if (wizardTasks.value.length === 0) return;

    isOptimizing.value = true;
    optimizedTasks.value = [];
    currentOptimizingTask.value = 0;

    try {
        const tasksToOptimize = wizardTasks.value.filter((_, idx) =>
            selectedTasks.value.has(idx.toString())
        );

        for (const [i, task] of tasksToOptimize.entries()) {
            currentOptimizingTask.value = i;
            const recommendation =
                taskRecommendations.value.get(task.title) || buildFallbackRecommendation(task);

            // 프롬프트 분석 및 최적화 (계획에 이미 aiOptimizedPrompt가 있으면 그대로 사용)
            const basePrompt = task.aiOptimizedPrompt || task.description;
            const analysis = promptEnhancementService.analyzePrompt(basePrompt);

            let optimizedDescription = basePrompt;
            if (!task.aiOptimizedPrompt && analysis.overallScore < 70) {
                const enhancementFormat = mapOutputFormatToEnhancementFormat(
                    task.primaryOutputFormat
                );
                const enhanced = await promptEnhancementService.enhancePrompt(basePrompt, {
                    outputFormat: enhancementFormat,
                    complexity: task.complexity === 'high' ? 'complex' : 'moderate',
                });
                optimizedDescription = enhanced.enhancedPrompt;
            }

            // 모델별 최적화
            if (recommendation) {
                const modelOptimization = aiModelRecommendationService.optimizePromptForModel(
                    recommendation.model,
                    task.title,
                    optimizedDescription
                );
                optimizedDescription = modelOptimization.optimizedPrompt;
            }

            optimizedTasks.value.push({
                ...task,
                description: optimizedDescription,
                aiOptimizedPrompt: optimizedDescription,
                suggestedAIProvider: recommendation?.model.provider || task.suggestedAIProvider,
                suggestedModel: recommendation?.model.id || task.suggestedModel,
            });

            // 약간의 딜레이로 진행 상황 표시
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    } catch (error) {
        console.error('Failed to optimize tasks:', error);
    } finally {
        isOptimizing.value = false;
    }
}

// ========================================
// Methods - Step 7: Confirm & Create
// ========================================

async function createProject() {
    // AI 지침서 생성
    let aiGuidelines = '';
    let technicalStack: string[] = [];

    if (concretizedIdea.value) {
        aiGuidelines = aiGuidelinesService.generateGuidelines(
            concretizedIdea.value,
            optimizedTasks.value
        );
        technicalStack = concretizedIdea.value.technicalSpecification?.stack || [];
    }

    // Read Claude Code settings if this is a Claude Code repo
    let claudeSettings: any = null;

    if (creationMode.value === 'local-repo' && selectedRepo.value?.type === 'claude-code') {
        try {
            const claudeConfig = await (window as any).electron.fs.readClaudeSettings();
            if (claudeConfig) {
                const { claudeCodeSettingsParser } =
                    await import('../../services/integration/ClaudeCodeSettingsParser');
                claudeSettings = claudeCodeSettingsParser.parseSettings(claudeConfig);
                console.log('[ProjectCreationWizard] Loaded Claude Code settings:', claudeSettings);
            }
        } catch (error) {
            console.warn('[ProjectCreationWizard] Failed to read Claude settings:', error);
        }
    }

    // 스마트 AI 제공자/모델 선택 (Claude 설정 우선)
    const connectedProviders = settingsStore.getEnabledProvidersForRecommendation();
    const aiDefaults =
        claudeSettings || aiProviderSelectionService.selectBestProviderAndModel(connectedProviders);

    const project = {
        title: projectTitle.value,
        description: projectDescription.value,
        aiProvider: aiDefaults?.aiProvider || selectedProvider.value || 'anthropic',
        aiModel: aiDefaults?.aiModel || null,
        mcpConfig: aiDefaults?.mcpConfig || null, // Claude MCP 설정 적용
        aiGuidelines, // AI 지침서 포함
        technicalStack, // 기술 스택 포함
        executionPlan: executionPlan.value,
        baseDevFolder: baseDevFolder.value || undefined,
        tasks: optimizedTasks.value.map((task) => ({
            title: task.title,
            description: task.description,
            category: task.category,
            estimatedMinutes: task.estimatedMinutes,
            aiProvider: task.suggestedAIProvider,
            aiModel: task.suggestedModel,
            dependencies: task.dependencies,
            promptTemplate: task.promptTemplate,
            aiOptimizedPrompt: task.aiOptimizedPrompt || task.description,
            executionOrder: task.executionOrder,
            expectedOutputFormat:
                task.expectedOutputFormat || task.primaryOutputFormat || 'markdown',
            outputFormat: task.primaryOutputFormat || 'markdown',
            recommendedProviders:
                task.recommendedProviders ||
                (task.suggestedAIProvider ? [task.suggestedAIProvider] : []),
            requiredMCPs: task.requiredMCPs || [],
            codeLanguage: task.codeLanguage,
            tags:
                task.tags && task.tags.length > 0
                    ? task.tags
                    : task.category
                      ? [task.category]
                      : [],
            priority: task.priority || (task.complexity === 'high' ? 'high' : 'medium'),
        })),
        metadata: {
            createdVia: creationMode.value === 'local-repo' ? 'local-repo' : 'ai-wizard',
            claudeCodeIntegration: !!claudeSettings, // Track Claude sync
            settingsOverridden: false, // Not manually overridden yet
            lastSyncedAt: claudeSettings ? new Date().toISOString() : undefined,
            interviewSessionId: interviewSession.value?.id,
            concretizedIdea: concretizedIdea.value,
            localRepo: selectedRepo.value
                ? {
                      path: selectedRepo.value.path,
                      type: selectedRepo.value.type,
                      types: selectedRepo.value.types || [selectedRepo.value.type],
                      remoteUrl: selectedRepo.value.remoteUrl,
                  }
                : undefined,
            baseDevFolder: baseDevFolder.value || undefined,
        },
    };

    console.log('[createProject] Saving metadata with types:', project.metadata.localRepo?.types);

    emit('created', project);
    emit('close');
}

async function createProjectFromLocalRepo() {
    // Direct creation from local repo without AI interview

    // Read Claude Code settings if this is a Claude Code repo
    let claudeSettings: any = null;

    if (selectedRepo.value?.type === 'claude-code') {
        try {
            const claudeConfig = await (window as any).electron.fs.readClaudeSettings();
            if (claudeConfig) {
                const { claudeCodeSettingsParser } =
                    await import('../../services/integration/ClaudeCodeSettingsParser');
                claudeSettings = claudeCodeSettingsParser.parseSettings(claudeConfig);
                console.log('[ProjectCreationWizard] Loaded Claude Code settings:', claudeSettings);
            }
        } catch (error) {
            console.warn('[ProjectCreationWizard] Failed to read Claude settings:', error);
        }
    }

    // 스마트 AI 제공자/모델 선택 (Claude 설정 우선, 없으면 기본 선택)
    const connectedProviders = settingsStore.getEnabledProvidersForRecommendation();
    const aiDefaults =
        claudeSettings || aiProviderSelectionService.selectBestProviderAndModel(connectedProviders);

    // Determine AI Provider:
    // 1. If it's a known local agent type (checking types array), use that.
    // 2. Otherwise use the default selection logic.
    let aiProvider = aiDefaults?.aiProvider || selectedProvider.value || 'anthropic';

    if (selectedRepo.value) {
        const repoTypes = selectedRepo.value.types || [selectedRepo.value.type];

        // Priority: Antigravity > Codex > Claude Code
        if (repoTypes.includes('antigravity')) {
            aiProvider = 'antigravity';
        } else if (repoTypes.includes('codex')) {
            aiProvider = 'codex';
        } else if (repoTypes.includes('claude-code')) {
            aiProvider = 'claude-code';
        }
    }

    const project = {
        title: projectTitle.value,
        description: projectDescription.value,
        aiProvider: aiProvider,
        aiModel: aiDefaults?.aiModel || null,
        mcpConfig: aiDefaults?.mcpConfig || null, // Claude MCP 설정 적용
        baseDevFolder: selectedRepo.value?.path || null, // 로컬 저장소 경로를 baseDevFolder로 설정
        projectGuidelines: await readLocalGuidelinesIfExists(selectedRepo.value?.path), // 로컬 저장소의 AI 지침서 읽기
        tasks: [], // No pre-generated tasks
        metadata: {
            createdVia: 'local-repo',
            claudeCodeIntegration: !!claudeSettings, // Track Claude sync
            settingsOverridden: false, // Not manually overridden yet
            lastSyncedAt: claudeSettings ? new Date().toISOString() : undefined,
            localRepo: selectedRepo.value
                ? {
                      path: selectedRepo.value.path,
                      type: selectedRepo.value.type,
                      types: selectedRepo.value.types || [selectedRepo.value.type],
                      remoteUrl: selectedRepo.value.remoteUrl,
                  }
                : undefined,
        },
    };

    console.log(
        '[createProjectFromLocalRepo] Saving metadata with types:',
        project.metadata.localRepo?.types
    );

    emit('created', project);
    emit('close');
}

// Helper function to read AI guidelines from local repo
async function readLocalGuidelinesIfExists(repoPath?: string): Promise<string | null> {
    if (!repoPath) return null;

    try {
        // Try to read CLAUDE.md first
        try {
            const claudeMdPath = `${repoPath}/CLAUDE.md`;
            const exists = await (window as any)?.electron?.fs?.exists(claudeMdPath);
            if (exists) {
                const content = await (window as any)?.electron?.fs?.readFile(claudeMdPath);
                console.log('[ProjectCreationWizard] Read CLAUDE.md guidelines');
                return content;
            }
        } catch (e) {
            // Ignore and try next
        }

        // Try .claude/guidelines.md
        try {
            const guidelinesPath = `${repoPath}/.claude/guidelines.md`;
            const exists = await (window as any)?.electron?.fs?.exists(guidelinesPath);
            if (exists) {
                const content = await (window as any)?.electron?.fs?.readFile(guidelinesPath);
                console.log('[ProjectCreationWizard] Read .claude/guidelines.md');
                return content;
            }
        } catch (e) {
            // Ignore
        }

        return null;
    } catch (error) {
        console.warn('[ProjectCreationWizard] Failed to read guidelines:', error);
        return null;
    }
}

// ========================================
// Methods - Utility
// ========================================

function getRepoIcon(type: string): string {
    const icons: Record<string, string> = {
        git: '📁',
        'claude-code': '🤖',
        codex: '🔮',
        antigravity: '🚀',
    };
    return icons[type] || '📁';
}

function getRepoTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        git: 'Git',
        'claude-code': 'Claude Code',
        codex: 'Codex',
        antigravity: 'Antigravity',
        cursor: 'Cursor',
        windsurf: 'Windsurf',
        aider: 'Aider',
        copilot: 'Copilot',
    };
    return labels[type] || type;
}

function getProviderIcon(provider: AIProvider): string {
    const icons: Record<string, string> = {
        anthropic: 'A',
        openai: 'O',
        google: 'G',
        local: 'L',
        'claude-code': 'C',
        antigravity: '🚀',
        codex: '⚡',
        'azure-openai': 'Az',
        mistral: 'M',
        cohere: 'Co',
        groq: 'Gr',
        deepseek: 'D',
        together: 'T',
        fireworks: 'F',
        perplexity: 'P',
        stability: 'S',
        runway: 'R',
        pika: 'Pi',
        'google-tts': 'GT',
        elevenlabs: 'E',
        suno: 'Su',
        huggingface: 'HF',
        replicate: 'Re',
        openrouter: 'OR',
        ollama: 'Ol',
        lmstudio: 'LM',
        zhipu: 'Z',
        moonshot: 'Mo',
        qwen: 'Q',
        baidu: 'B',
    };
    return icons[provider] || '?';
}

function getProviderColor(provider: AIProvider): string {
    const colors: Record<string, string> = {
        anthropic: 'bg-orange-500',
        openai: 'bg-green-500',
        google: 'bg-blue-500',
        local: 'bg-gray-500',
        'claude-code': 'bg-violet-500',
        antigravity: 'bg-rose-500',
        codex: 'bg-cyan-500',
        'azure-openai': 'bg-cyan-600',
        mistral: 'bg-indigo-500',
        cohere: 'bg-purple-500',
        groq: 'bg-yellow-500',
        deepseek: 'bg-blue-600',
        together: 'bg-emerald-500',
        fireworks: 'bg-red-500',
        perplexity: 'bg-teal-500',
        stability: 'bg-violet-600',
        runway: 'bg-fuchsia-500',
        pika: 'bg-pink-500',
        'google-tts': 'bg-blue-400',
        elevenlabs: 'bg-amber-500',
        suno: 'bg-rose-400',
        huggingface: 'bg-yellow-600',
        replicate: 'bg-slate-500',
        openrouter: 'bg-lime-500',
        ollama: 'bg-zinc-500',
        lmstudio: 'bg-stone-500',
        zhipu: 'bg-sky-500',
        moonshot: 'bg-indigo-400',
        qwen: 'bg-blue-700',
        baidu: 'bg-red-600',
    };
    return colors[provider] || 'bg-gray-500';
}

function getProviderColorById(providerId: string): string {
    const colors: Record<string, string> = {
        // Major providers
        openai: 'bg-green-500',
        anthropic: 'bg-orange-500',
        google: 'bg-blue-500',
        'azure-openai': 'bg-cyan-600',
        // Alternative providers
        mistral: 'bg-purple-500',
        cohere: 'bg-rose-500',
        groq: 'bg-amber-500',
        perplexity: 'bg-teal-500',
        together: 'bg-violet-500',
        fireworks: 'bg-red-500',
        deepseek: 'bg-blue-600',
        // Local providers
        ollama: 'bg-gray-600',
        lmstudio: 'bg-emerald-500',
        // Specialized providers
        openrouter: 'bg-fuchsia-500',
        // Chinese providers
        zhipu: 'bg-blue-500',
        moonshot: 'bg-indigo-600',
        qwen: 'bg-orange-500',
        baidu: 'bg-blue-600',
    };
    return colors[providerId] || 'bg-gray-500';
}

function getComplexityColor(complexity: string): string {
    switch (complexity) {
        case 'low':
            return 'text-green-400';
        case 'medium':
            return 'text-yellow-400';
        case 'high':
            return 'text-red-400';
        default:
            return 'text-gray-400';
    }
}

function formatCost(cost: number): string {
    return cost < 0.01 ? '<$0.01' : `$${cost.toFixed(2)}`;
}

// Configure marked for safe rendering
marked.setOptions({
    breaks: true,
    gfm: true,
});

function renderMarkdown(content: string): string {
    if (!content) return '';
    return marked.parse(content) as string;
}

// ========================================
// Lifecycle
// ========================================

watch(
    () => props.open,
    (isOpen) => {
        if (!isOpen) {
            // Reset state when closed
            currentStep.value = 'idea';
            ideaText.value = '';
            interviewSession.value = null;
            concretizedIdea.value = null;
            optimizedTasks.value = [];
            selectedTasks.value.clear();
            taskRecommendations.value.clear();
            projectTitle.value = '';
            projectDescription.value = '';
            // Reset local repo state
            creationMode.value = 'ai-wizard';
            discoveredRepos.value = [];
            selectedRepo.value = null;
            repoFilter.value = 'all';
            repoSearchQuery.value = '';
        }
    }
);
</script>

<template>
    <Teleport to="body">
        <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
            <div
                class="w-full max-w-5xl max-h-[90vh] bg-gray-900 rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-700"
            >
                <!-- Header -->
                <div class="px-6 py-4 border-b border-gray-700 bg-gray-800/50">
                    <div class="flex items-center justify-between">
                        <div>
                            <h2 class="text-xl font-bold text-white flex items-center gap-2">
                                <span class="text-2xl">✨</span>
                                AI 프로젝트 생성 위자드
                            </h2>
                            <p class="text-sm text-gray-400 mt-1">
                                {{ currentStepInfo?.description }}
                            </p>
                        </div>
                        <button
                            @click="emit('close')"
                            class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            <svg
                                class="w-6 h-6"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
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

                    <!-- Progress Steps -->
                    <div class="mt-4 flex items-center gap-1">
                        <template v-for="(step, idx) in STEPS" :key="step.id">
                            <button
                                @click="goToStep(step.id)"
                                :disabled="idx > currentStepIndex"
                                :class="[
                                    'flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-all',
                                    idx === currentStepIndex
                                        ? 'bg-blue-600 text-white'
                                        : idx < currentStepIndex
                                          ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 cursor-pointer'
                                          : 'bg-gray-800 text-gray-500 cursor-not-allowed',
                                ]"
                            >
                                <span
                                    class="w-5 h-5 flex items-center justify-center rounded-full text-xs"
                                    :class="
                                        idx < currentStepIndex
                                            ? 'bg-green-500 text-white'
                                            : 'bg-gray-600'
                                    "
                                >
                                    {{ idx < currentStepIndex ? '✓' : idx + 1 }}
                                </span>
                                <span class="hidden sm:inline">{{ step.title }}</span>
                            </button>
                            <div v-if="idx < STEPS.length - 1" class="w-4 h-0.5 bg-gray-700"></div>
                        </template>
                    </div>
                </div>

                <!-- Content -->
                <div class="flex-1 overflow-y-auto p-6">
                    <!-- Step 1: Idea Input -->
                    <div v-if="currentStep === 'idea'" class="space-y-6">
                        <!-- Creation Mode Selector -->
                        <div class="grid grid-cols-2 gap-4">
                            <button
                                @click="creationMode = 'ai-wizard'"
                                :class="[
                                    'p-4 border-2 rounded-xl text-left transition-all',
                                    creationMode === 'ai-wizard'
                                        ? 'border-blue-500 bg-blue-900/20'
                                        : 'border-gray-700 hover:border-gray-600 bg-gray-800/50',
                                ]"
                            >
                                <div class="flex items-center gap-3 mb-2">
                                    <span class="text-2xl">✨</span>
                                    <div class="font-semibold text-white">AI 위자드로 생성</div>
                                </div>
                                <p class="text-sm text-gray-400">
                                    AI와 대화하며 아이디어를 구체화하고 태스크를 자동 생성합니다.
                                </p>
                            </button>

                            <button
                                @click="
                                    creationMode = 'local-repo';
                                    scanLocalRepositories();
                                "
                                :class="[
                                    'p-4 border-2 rounded-xl text-left transition-all',
                                    creationMode === 'local-repo'
                                        ? 'border-violet-500 bg-violet-900/20'
                                        : 'border-gray-700 hover:border-gray-600 bg-gray-800/50',
                                ]"
                            >
                                <div class="flex items-center gap-3 mb-2">
                                    <span class="text-2xl">📂</span>
                                    <div class="font-semibold text-white">로컬 저장소로 생성</div>
                                </div>
                                <p class="text-sm text-gray-400">
                                    기존 Git 저장소 또는 AI 에이전트 설정 폴더를 선택합니다.
                                </p>
                            </button>
                        </div>

                        <!-- AI Wizard Mode -->
                        <div v-if="creationMode === 'ai-wizard'" class="space-y-6">
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2">
                                    프로젝트 아이디어를 자유롭게 설명해주세요
                                </label>
                                <textarea
                                    v-model="ideaText"
                                    rows="8"
                                    class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                    placeholder="예: 실시간 협업이 가능한 칸반 보드 애플리케이션을 만들고 싶어요. Vue 3를 사용하고, 드래그 앤 드롭으로 태스크를 이동할 수 있어야 해요. 팀원들과 함께 사용할 수 있도록 멀티 유저 기능도 필요합니다..."
                                ></textarea>
                                <div class="flex justify-between text-xs text-gray-500 mt-1">
                                    <span>최소 20자 이상 입력해주세요</span>
                                    <span>{{ ideaText.length }}자</span>
                                </div>
                            </div>

                            <div class="bg-blue-900/20 border border-blue-800/30 rounded-lg p-4">
                                <div class="flex items-start gap-3">
                                    <span class="text-2xl">💡</span>
                                    <div>
                                        <h4 class="font-medium text-blue-300">
                                            팁: 좋은 아이디어 설명이란?
                                        </h4>
                                        <ul class="text-sm text-gray-400 mt-2 space-y-1">
                                            <li>
                                                • 해결하고자 하는 문제나 목표를 명확히 설명하세요
                                            </li>
                                            <li>• 사용 기술이나 플랫폼이 있다면 언급해주세요</li>
                                            <li>• 대상 사용자나 비즈니스 맥락을 설명해주세요</li>
                                            <li>• 참고하고 싶은 기존 제품이 있다면 알려주세요</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Local Repository Mode -->
                        <div v-if="creationMode === 'local-repo'" class="space-y-4">
                            <!-- Action buttons -->
                            <div class="flex items-center gap-3">
                                <button
                                    @click="scanLocalRepositories"
                                    :disabled="isScanning"
                                    class="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <svg
                                        v-if="isScanning"
                                        class="animate-spin w-4 h-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                    >
                                        <circle
                                            class="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            stroke-width="4"
                                        ></circle>
                                        <path
                                            class="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        ></path>
                                    </svg>
                                    <span>{{
                                        isScanning ? '검색 중...' : '저장소 다시 검색'
                                    }}</span>
                                </button>

                                <button
                                    @click="selectCustomDirectory"
                                    class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
                                >
                                    <svg
                                        class="w-4 h-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                        />
                                    </svg>
                                    <span>폴더 직접 선택</span>
                                </button>
                            </div>

                            <!-- Filters -->
                            <div class="flex items-center gap-3">
                                <div class="flex-1">
                                    <input
                                        v-model="repoSearchQuery"
                                        type="text"
                                        class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        placeholder="저장소 검색..."
                                    />
                                </div>
                                <select
                                    v-model="repoFilter"
                                    class="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                >
                                    <option value="all">모든 타입</option>
                                    <option value="git">Git 저장소</option>
                                    <option value="claude-code">Claude Code</option>
                                    <option value="codex">Codex</option>
                                    <option value="antigravity">Antigravity</option>
                                </select>
                            </div>

                            <!-- Repository List -->
                            <div v-if="isScanning" class="text-center py-12">
                                <div
                                    class="animate-spin w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full mx-auto mb-3"
                                ></div>
                                <p class="text-gray-400">로컬 저장소를 검색하고 있습니다...</p>
                                <p class="text-xs text-gray-500 mt-1">
                                    Development, Projects, GitHub 폴더 등을 확인합니다
                                </p>
                            </div>

                            <div
                                v-else-if="filteredRepos.length === 0"
                                class="text-center py-12 bg-gray-800/50 rounded-lg"
                            >
                                <span class="text-4xl mb-3 block">📭</span>
                                <p class="text-gray-400">발견된 저장소가 없습니다</p>
                                <p class="text-xs text-gray-500 mt-1">
                                    폴더 직접 선택 버튼을 사용하여 저장소를 추가하세요
                                </p>
                            </div>

                            <div v-else class="space-y-2 max-h-[400px] overflow-y-auto">
                                <div
                                    v-for="repo in filteredRepos"
                                    :key="repo.path"
                                    @click="selectRepo(repo)"
                                    :class="[
                                        'p-4 border rounded-lg cursor-pointer transition-all',
                                        selectedRepo?.path === repo.path
                                            ? 'border-violet-500 bg-violet-900/20'
                                            : 'border-gray-700 bg-gray-800/50 hover:border-gray-600',
                                    ]"
                                >
                                    <div class="flex items-start gap-3">
                                        <!-- Selection indicator -->
                                        <div
                                            :class="[
                                                'w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5 flex-shrink-0',
                                                selectedRepo?.path === repo.path
                                                    ? 'border-violet-500 bg-violet-500'
                                                    : 'border-gray-600',
                                            ]"
                                        >
                                            <svg
                                                v-if="selectedRepo?.path === repo.path"
                                                class="w-3 h-3 text-white"
                                                fill="currentColor"
                                                viewBox="0 0 20 20"
                                            >
                                                <path
                                                    fill-rule="evenodd"
                                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                    clip-rule="evenodd"
                                                />
                                                ```
                                            </svg>
                                        </div>

                                        <!-- Repo info -->
                                        <div class="flex-1 min-w-0">
                                            <div class="flex items-center gap-2 mb-1 flex-wrap">
                                                <h4 class="font-medium text-white truncate">
                                                    {{ repo.name }}
                                                </h4>
                                                <!-- Multiple Assistant Type Tags -->
                                                <div class="flex items-center gap-1 flex-wrap">
                                                    <!-- Debug: Show types array -->
                                                    <template
                                                        v-if="repo.types && repo.types.length > 0"
                                                    >
                                                        <span
                                                            v-for="type in repo.types"
                                                            :key="type"
                                                            :class="[
                                                                'px-2 py-0.5 text-xs rounded',
                                                                getRepoTypeColor(type),
                                                            ]"
                                                            :title="type"
                                                        >
                                                            {{ type }}
                                                        </span>
                                                    </template>
                                                    <!-- Fallback to single type -->
                                                    <template v-else>
                                                        <span
                                                            :class="[
                                                                'px-2 py-0.5 text-xs rounded',
                                                                getRepoTypeColor(repo.type),
                                                            ]"
                                                            :title="getRepoTypeLabel(repo.type)"
                                                        >
                                                            {{ getRepoTypeLabel(repo.type) }}
                                                        </span>
                                                    </template>
                                                </div>
                                            </div>
                                            <p class="text-xs text-gray-500 truncate mb-1">
                                                {{ repo.path }}
                                            </p>
                                            <div
                                                class="flex items-center gap-3 text-xs text-gray-500"
                                            >
                                                <span>{{
                                                    formatRelativeTime(repo.lastModified)
                                                }}</span>
                                                <span
                                                    v-if="repo.remoteUrl"
                                                    class="flex items-center gap-1"
                                                >
                                                    <svg
                                                        class="w-3 h-3"
                                                        fill="currentColor"
                                                        viewBox="0 0 20 20"
                                                    >
                                                        <path
                                                            fill-rule="evenodd"
                                                            d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z"
                                                            clip-rule="evenodd"
                                                        />
                                                    </svg>
                                                    <span class="truncate max-w-[200px]">{{
                                                        repo.remoteUrl
                                                    }}</span>
                                                </span>
                                            </div>
                                            <p
                                                v-if="repo.description"
                                                class="text-sm text-gray-400 mt-2 line-clamp-2"
                                            >
                                                {{ repo.description }}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Selected repo info -->
                            <div
                                v-if="selectedRepo"
                                class="bg-violet-900/20 border border-violet-800/30 rounded-lg p-4"
                            >
                                <div class="flex items-start gap-3">
                                    <span class="text-xl">✅</span>
                                    <div class="flex-1">
                                        <h4 class="font-medium text-violet-300">선택된 저장소</h4>
                                        <p class="text-sm text-gray-400 mt-1">
                                            {{ selectedRepo.name }} ({{ selectedRepo.type }})
                                        </p>
                                        <p class="text-xs text-gray-500 mt-1">
                                            {{ selectedRepo.path }}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Step 2: Provider Selection -->
                    <div v-if="currentStep === 'provider'" class="space-y-6">
                        <p class="text-gray-400">
                            아이디어 구체화를 위한 인터뷰를 진행할 AI 모델을 선택하세요.
                        </p>

                        <!-- No providers available warning -->
                        <div
                            v-if="availableChatProviders.length === 0"
                            class="bg-yellow-900/20 border border-yellow-800/30 rounded-lg p-4"
                        >
                            <div class="flex items-start gap-3">
                                <span class="text-2xl">⚠️</span>
                                <div>
                                    <h4 class="font-medium text-yellow-300">
                                        활성화된 AI 프로바이더가 없습니다
                                    </h4>
                                    <p class="text-sm text-gray-400 mt-1">
                                        AI 인터뷰를 진행하려면 Settings > AI Providers에서 최소
                                        하나의 AI 프로바이더를 설정하고 활성화해야 합니다.
                                    </p>
                                    <button
                                        @click="emit('close')"
                                        class="mt-3 px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-sm transition-colors"
                                    >
                                        설정으로 이동
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div v-else class="grid grid-cols-2 gap-4">
                            <button
                                v-for="provider in availableChatProviders"
                                :key="provider.id"
                                @click="selectedProvider = provider.id as AIProvider"
                                :class="[
                                    'p-6 border-2 rounded-xl text-left transition-all',
                                    selectedProvider === provider.id
                                        ? 'border-blue-500 bg-blue-900/20'
                                        : 'border-gray-700 hover:border-gray-600 bg-gray-800/50',
                                ]"
                            >
                                <div class="flex items-center gap-3 mb-3">
                                    <div
                                        :class="[
                                            'w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold',
                                            getProviderColorById(provider.id),
                                        ]"
                                    >
                                        {{ provider.name.charAt(0) }}
                                    </div>
                                    <div>
                                        <div class="font-semibold text-white">
                                            {{ provider.name }}
                                        </div>
                                        <div class="text-xs text-gray-500">
                                            {{ provider.defaultModel }}
                                        </div>
                                    </div>
                                </div>
                                <div class="text-sm text-gray-400">
                                    <p class="line-clamp-2">{{ provider.description }}</p>
                                </div>
                                <!-- Provider capabilities badges -->
                                <div class="flex flex-wrap gap-1 mt-2">
                                    <span
                                        v-if="provider.supportsStreaming"
                                        class="text-xs px-2 py-0.5 bg-green-900/30 text-green-400 rounded"
                                        >Streaming</span
                                    >
                                    <span
                                        v-if="provider.supportsVision"
                                        class="text-xs px-2 py-0.5 bg-purple-900/30 text-purple-400 rounded"
                                        >Vision</span
                                    >
                                    <span
                                        v-if="provider.supportsTools"
                                        class="text-xs px-2 py-0.5 bg-blue-900/30 text-blue-400 rounded"
                                        >Tools</span
                                    >
                                </div>
                            </button>
                        </div>
                    </div>

                    <!-- Step 3: AI Interview -->
                    <div v-if="currentStep === 'interview'" class="flex flex-col h-full">
                        <!-- Interview Progress -->
                        <div class="mb-4 bg-gray-800 rounded-lg p-3">
                            <div class="flex items-center justify-between text-sm mb-2">
                                <span class="text-gray-400">인터뷰 진행률</span>
                                <span
                                    :class="
                                        interviewProgress >= 70
                                            ? 'text-green-400'
                                            : 'text-yellow-400'
                                    "
                                >
                                    {{ interviewProgress }}%
                                </span>
                            </div>
                            <div class="h-2 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    class="h-full transition-all duration-300"
                                    :class="
                                        interviewProgress >= 70 ? 'bg-green-500' : 'bg-yellow-500'
                                    "
                                    :style="{ width: `${interviewProgress}%` }"
                                ></div>
                            </div>
                            <p class="text-xs text-gray-500 mt-2">
                                {{
                                    interviewProgress >= 70
                                        ? '충분한 정보가 수집되었습니다. 다음 단계로 진행할 수 있습니다.'
                                        : 'AI의 질문에 답변하여 아이디어를 구체화하세요.'
                                }}
                            </p>
                        </div>

                        <!-- Chat Messages -->
                        <div
                            ref="chatContainer"
                            class="flex-1 bg-gray-800/50 rounded-lg p-4 overflow-y-auto min-h-[300px] max-h-[400px] space-y-3"
                        >
                            <div
                                v-for="message in interviewSession?.messages"
                                :key="message.id"
                                :class="[
                                    'p-3 rounded-lg max-w-[85%]',
                                    message.role === 'user'
                                        ? 'bg-blue-600 ml-auto'
                                        : message.role === 'system'
                                          ? 'bg-gray-700 border border-gray-600'
                                          : 'bg-gray-700',
                                ]"
                            >
                                <!-- User messages: plain text -->
                                <div
                                    v-if="message.role === 'user'"
                                    class="text-sm text-white whitespace-pre-wrap"
                                >
                                    {{ message.content }}
                                </div>
                                <!-- AI/System messages: streaming 표시 -->
                                <div v-else>
                                    <div
                                        v-if="message.metadata?.typing"
                                        class="flex items-center gap-3"
                                    >
                                        <div class="relative w-8 h-8">
                                            <div
                                                class="absolute inset-0 flex items-center justify-center"
                                            >
                                                <svg
                                                    class="w-6 h-6 text-blue-400"
                                                    viewBox="0 0 24 24"
                                                    fill="currentColor"
                                                >
                                                    <circle
                                                        cx="12"
                                                        cy="12"
                                                        r="10"
                                                        class="opacity-20"
                                                    />
                                                    <path
                                                        d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8z"
                                                    />
                                                </svg>
                                            </div>
                                            <div class="absolute inset-0">
                                                <svg
                                                    class="w-8 h-8 animate-spin-slow"
                                                    viewBox="0 0 32 32"
                                                >
                                                    <circle
                                                        cx="16"
                                                        cy="16"
                                                        r="14"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        stroke-width="2"
                                                        class="text-gray-600"
                                                    />
                                                    <path
                                                        d="M16 2 A14 14 0 0 1 30 16"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        stroke-width="2"
                                                        stroke-linecap="round"
                                                        class="text-blue-400"
                                                    />
                                                </svg>
                                            </div>
                                        </div>
                                        <div class="flex-1 text-sm text-white">
                                            AI가 답변을 준비 중입니다...
                                        </div>
                                    </div>
                                    <div v-else>
                                        <div
                                            class="text-sm text-white markdown-content"
                                            v-html="renderMarkdown(message.content)"
                                        ></div>
                                        <div
                                            v-if="message.metadata?.options?.length"
                                            class="flex flex-wrap gap-2 mt-2"
                                        >
                                            <button
                                                v-for="(opt, optIdx) in message.metadata.options"
                                                :key="optIdx"
                                                class="px-3 py-1 text-xs rounded border border-blue-500/60 text-blue-100 bg-blue-500/10 hover:bg-blue-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                :disabled="isProcessing"
                                                @click="chooseOption(opt)"
                                            >
                                                {{ optIdx + 1 }}. {{ opt }}
                                            </button>
                                        </div>
                                        <div
                                            class="text-xs text-gray-400 mt-1 flex items-center gap-2"
                                        >
                                            {{ new Date(message.timestamp).toLocaleTimeString() }}
                                            <span
                                                v-if="message.metadata?.streaming"
                                                class="inline-flex items-center gap-1 text-blue-300"
                                            >
                                                <span
                                                    class="inline-block w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                                                    style="animation-delay: 0ms"
                                                ></span>
                                                <span
                                                    class="inline-block w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                                                    style="animation-delay: 150ms"
                                                ></span>
                                                <span
                                                    class="inline-block w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                                                    style="animation-delay: 300ms"
                                                ></span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 글로벌 대기 버블 (스트리밍 불가 시) -->
                        <div
                            v-if="isProcessing && !hasTypingBubble"
                            class="bg-gray-700 p-4 rounded-lg max-w-[85%]"
                        >
                            <div class="flex items-center gap-3">
                                <div class="relative w-8 h-8">
                                    <div class="absolute inset-0 flex items-center justify-center">
                                        <svg
                                            class="w-6 h-6 text-blue-400"
                                            viewBox="0 0 24 24"
                                            fill="currentColor"
                                        >
                                            <circle cx="12" cy="12" r="10" class="opacity-20" />
                                            <path
                                                d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8z"
                                            />
                                        </svg>
                                    </div>
                                    <div class="absolute inset-0">
                                        <svg class="w-8 h-8 animate-spin-slow" viewBox="0 0 32 32">
                                            <circle
                                                cx="16"
                                                cy="16"
                                                r="14"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                class="text-gray-600"
                                            />
                                            <path
                                                d="M16 2 A14 14 0 0 1 30 16"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                class="text-blue-400"
                                            />
                                        </svg>
                                    </div>
                                </div>
                                <div class="flex-1">
                                    <div class="text-sm text-white font-medium mb-1">
                                        AI가 답변을 준비 중입니다...
                                    </div>
                                    <div class="flex items-center gap-1">
                                        <span
                                            class="inline-block w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                                            style="animation-delay: 0ms"
                                        ></span>
                                        <span
                                            class="inline-block w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                                            style="animation-delay: 150ms"
                                        ></span>
                                        <span
                                            class="inline-block w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                                            style="animation-delay: 300ms"
                                        ></span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- AI 위임 프리셋 답변 옵션 -->
                        <div class="mt-4 bg-gray-800/30 rounded-lg p-3">
                            <p class="text-xs text-gray-500 mb-2">
                                💡 답변이 어려우시면 아래 옵션을 선택하세요:
                            </p>
                            <div class="flex flex-wrap gap-2">
                                <button
                                    v-for="preset in AI_DELEGATE_PRESETS"
                                    :key="preset.id"
                                    @click="selectPresetAnswer(preset)"
                                    :disabled="isProcessing"
                                    class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 hover:text-white text-xs rounded-lg transition-colors"
                                    :title="preset.description"
                                >
                                    {{ preset.label }}
                                </button>
                            </div>
                        </div>

                        <!-- Chat Input -->
                        <div class="mt-3 flex gap-2">
                            <input
                                ref="fileInput"
                                type="file"
                                multiple
                                accept=".txt,.md,.json,.js,.ts,.py,.java,.html,.css,.xml,.yaml,.yml,.csv"
                                class="hidden"
                                @change="handleFileUpload"
                            />
                            <button
                                @click="fileInput?.click()"
                                class="p-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-400 hover:text-white transition-colors"
                                title="파일 첨부"
                            >
                                <svg
                                    class="w-5 h-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                                    />
                                </svg>
                            </button>
                            <input
                                v-model="chatInput"
                                @keyup.enter="sendMessage"
                                type="text"
                                class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="답변을 입력하거나 위 옵션을 선택하세요..."
                                :disabled="isProcessing"
                            />
                            <button
                                @click="sendMessage"
                                :disabled="!chatInput.trim() || isProcessing"
                                class="px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                            >
                                전송
                            </button>
                        </div>

                        <!-- Force Complete -->
                        <div
                            v-if="interviewProgress >= 50 && interviewProgress < 70"
                            class="mt-3 text-center"
                        >
                            <button
                                @click="forceCompleteInterview"
                                class="text-sm text-gray-400 hover:text-white underline"
                            >
                                인터뷰 조기 종료하기
                            </button>
                        </div>
                    </div>

                    <!-- Step 4: Concretization -->
                    <div v-if="currentStep === 'concretize'" class="space-y-6">
                        <div v-if="isConcretizing" class="text-center py-12">
                            <div
                                class="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"
                            ></div>
                            <p class="text-gray-400">아이디어를 구체화하고 있습니다...</p>
                        </div>

                        <div v-else-if="concretizedIdea" class="space-y-6">
                            <div class="bg-gray-800 rounded-lg p-4">
                                <h3 class="font-semibold text-white mb-2">
                                    {{ concretizedIdea.title }}
                                </h3>
                                <p class="text-gray-400 text-sm whitespace-pre-wrap">
                                    {{ concretizedIdea.summary }}
                                </p>
                            </div>

                            <div class="grid grid-cols-2 gap-4">
                                <div class="bg-gray-800 rounded-lg p-4">
                                    <h4 class="text-sm font-medium text-gray-400 mb-2">
                                        기술 스택
                                    </h4>
                                    <div class="flex flex-wrap gap-2">
                                        <span
                                            v-for="tech in concretizedIdea.technicalSpecification
                                                .stack"
                                            :key="tech"
                                            class="px-2 py-1 bg-blue-900/30 text-blue-400 rounded text-xs"
                                        >
                                            {{ tech }}
                                        </span>
                                    </div>
                                </div>

                                <div class="bg-gray-800 rounded-lg p-4">
                                    <h4 class="text-sm font-medium text-gray-400 mb-2">복잡도</h4>
                                    <div class="flex items-center gap-2">
                                        <span
                                            :class="[
                                                'px-3 py-1 rounded-lg text-sm font-medium',
                                                concretizedIdea.estimatedComplexity === 'simple'
                                                    ? 'bg-green-900/30 text-green-400'
                                                    : concretizedIdea.estimatedComplexity ===
                                                        'moderate'
                                                      ? 'bg-yellow-900/30 text-yellow-400'
                                                      : concretizedIdea.estimatedComplexity ===
                                                          'complex'
                                                        ? 'bg-orange-900/30 text-orange-400'
                                                        : 'bg-red-900/30 text-red-400',
                                            ]"
                                        >
                                            {{ concretizedIdea.estimatedComplexity }}
                                        </span>
                                        <span class="text-gray-500 text-sm">
                                            {{ wizardTasks.length }}개 태스크 생성됨
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div class="bg-gray-800 rounded-lg p-4">
                                <div class="flex items-center justify-between mb-3">
                                    <h4 class="text-sm font-medium text-gray-400">
                                        생성된 태스크 미리보기
                                    </h4>
                                    <button
                                        @click="showAddRequirement = !showAddRequirement"
                                        class="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                    >
                                        <svg
                                            class="w-4 h-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M12 4v16m8-8H4"
                                            />
                                        </svg>
                                        요구사항 추가
                                    </button>
                                </div>

                                <!-- 요구사항 추가 입력 영역 -->
                                <div
                                    v-if="showAddRequirement"
                                    class="mb-4 p-3 bg-blue-900/20 border border-blue-800/30 rounded-lg"
                                >
                                    <p class="text-xs text-blue-300 mb-2">
                                        추가하고 싶은 요구사항이나 기능을 설명해주세요:
                                    </p>
                                    <textarea
                                        v-model="newRequirementInput"
                                        rows="3"
                                        class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                        placeholder="예: 사용자 인증 기능 추가, 다크모드 지원, 데이터 내보내기 기능..."
                                        :disabled="isAddingRequirement"
                                    ></textarea>
                                    <div class="flex justify-end gap-2 mt-2">
                                        <button
                                            @click="
                                                showAddRequirement = false;
                                                newRequirementInput = '';
                                            "
                                            class="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                                            :disabled="isAddingRequirement"
                                        >
                                            취소
                                        </button>
                                        <button
                                            @click="addRequirementAndGenerateTasks"
                                            :disabled="
                                                !newRequirementInput.trim() || isAddingRequirement
                                            "
                                            class="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-1.5"
                                        >
                                            <svg
                                                v-if="isAddingRequirement"
                                                class="animate-spin w-3 h-3"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                            >
                                                <circle
                                                    class="opacity-25"
                                                    cx="12"
                                                    cy="12"
                                                    r="10"
                                                    stroke="currentColor"
                                                    stroke-width="4"
                                                ></circle>
                                                <path
                                                    class="opacity-75"
                                                    fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                ></path>
                                            </svg>
                                            {{
                                                isAddingRequirement
                                                    ? '태스크 생성 중...'
                                                    : '태스크 추가 생성'
                                            }}
                                        </button>
                                    </div>
                                </div>

                                <div class="space-y-2 max-h-60 overflow-y-auto">
                                    <div
                                        v-for="(task, idx) in wizardTasks"
                                        :key="idx"
                                        class="flex items-center justify-between p-3 bg-gray-700/50 rounded-lg"
                                    >
                                        <div class="flex-1">
                                            <div class="font-medium text-white text-sm">
                                                {{ task.title }}
                                            </div>
                                            <div class="text-xs text-gray-500">
                                                {{ task.category }} • {{ task.estimatedMinutes }}분
                                                예상
                                            </div>
                                        </div>
                                        <div
                                            :class="[
                                                'w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs',
                                                getProviderColor(task.suggestedAIProvider),
                                            ]"
                                        >
                                            {{ getProviderIcon(task.suggestedAIProvider) }}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Step 5: Task Preview with Recommendations -->
                    <div v-if="currentStep === 'preview'" class="flex flex-col h-full">
                        <div class="flex items-center justify-between mb-3">
                            <div class="flex items-center gap-4">
                                <button
                                    @click="selectAllTasks"
                                    class="text-sm text-blue-400 hover:text-blue-300"
                                >
                                    전체 선택
                                </button>
                                <button
                                    @click="deselectAllTasks"
                                    class="text-sm text-gray-400 hover:text-gray-300"
                                >
                                    전체 해제
                                </button>
                            </div>
                            <span class="text-sm text-gray-500">
                                {{ selectedTasks.size }}/{{ wizardTasks.length }} 선택됨
                            </span>
                        </div>

                        <div v-if="isLoadingRecommendations" class="text-center py-8">
                            <div
                                class="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"
                            ></div>
                            <p class="text-gray-400 text-sm">AI 모델 추천을 로드하는 중...</p>
                        </div>

                        <div v-else class="flex-1 space-y-3 max-h-[320px] overflow-y-auto mb-4">
                            <div
                                v-for="(task, idx) in wizardTasks"
                                :key="idx"
                                :class="[
                                    'border rounded-lg p-4 transition-all cursor-pointer',
                                    selectedTasks.has(idx.toString())
                                        ? 'border-blue-500 bg-blue-900/10'
                                        : 'border-gray-700 bg-gray-800/50 hover:border-gray-600',
                                ]"
                                @click="toggleTaskSelection(idx.toString())"
                            >
                                <div class="flex items-start gap-3">
                                    <div
                                        :class="[
                                            'w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5',
                                            selectedTasks.has(idx.toString())
                                                ? 'border-blue-500 bg-blue-500'
                                                : 'border-gray-600',
                                        ]"
                                    >
                                        <svg
                                            v-if="selectedTasks.has(idx.toString())"
                                            class="w-3 h-3 text-white"
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path
                                                fill-rule="evenodd"
                                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                clip-rule="evenodd"
                                            />
                                        </svg>
                                    </div>

                                    <div class="flex-1">
                                        <div class="flex items-center justify-between mb-1">
                                            <h4 class="font-medium text-white">{{ task.title }}</h4>
                                            <span
                                                :class="[
                                                    'text-xs',
                                                    getComplexityColor(task.complexity),
                                                ]"
                                            >
                                                {{ task.complexity }}
                                            </span>
                                        </div>
                                        <p class="text-sm text-gray-400 mb-2 line-clamp-2">
                                            {{ task.description }}
                                        </p>

                                        <div class="flex flex-wrap items-center gap-2 mb-2 text-xs">
                                            <span
                                                class="px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/40"
                                            >
                                                {{
                                                    task.primaryOutputFormat ||
                                                    task.expectedOutputFormat ||
                                                    'markdown'
                                                }}
                                            </span>
                                            <span
                                                class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40"
                                                v-if="task.estimatedMinutes"
                                            >
                                                {{ task.estimatedMinutes }}분 예상
                                            </span>
                                        </div>

                                        <!-- AI Model Recommendation -->
                                        <div
                                            v-if="taskRecommendations.get(task.title)"
                                            class="bg-gray-700/50 rounded-lg p-3"
                                        >
                                            <div class="flex items-center justify-between mb-2">
                                                <div class="flex items-center gap-2">
                                                    <div
                                                        :class="[
                                                            'w-6 h-6 rounded flex items-center justify-center text-white text-xs',
                                                            getProviderColor(
                                                                taskRecommendations.get(task.title)!
                                                                    .model.provider
                                                            ),
                                                        ]"
                                                    >
                                                        {{
                                                            getProviderIcon(
                                                                taskRecommendations.get(task.title)!
                                                                    .model.provider
                                                            )
                                                        }}
                                                    </div>
                                                    <span class="text-sm font-medium text-white">
                                                        {{
                                                            taskRecommendations.get(task.title)!
                                                                .model.displayName
                                                        }}
                                                    </span>
                                                </div>
                                                <div class="text-xs text-gray-500">
                                                    {{
                                                        formatCost(
                                                            taskRecommendations.get(task.title)!
                                                                .estimatedCost
                                                        )
                                                    }}
                                                    예상
                                                </div>
                                            </div>
                                            <div class="flex flex-wrap gap-1">
                                                <span
                                                    v-for="reason in taskRecommendations
                                                        .get(task.title)!
                                                        .reasons.slice(0, 2)"
                                                    :key="reason"
                                                    class="text-xs px-2 py-0.5 bg-gray-600 text-gray-300 rounded"
                                                >
                                                    {{ reason }}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 하단 요구사항 추가 채팅창 -->
                        <div class="border-t border-gray-700 pt-4">
                            <div class="bg-gray-800/50 rounded-lg p-3">
                                <div class="flex items-center gap-2 mb-2">
                                    <svg
                                        class="w-4 h-4 text-blue-400"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                                        />
                                    </svg>
                                    <span class="text-sm text-gray-400"
                                        >추가적으로 원하는 기능이 있으신가요?</span
                                    >
                                </div>
                                <div class="flex gap-2">
                                    <input
                                        v-model="newRequirementInput"
                                        @keyup.enter="addRequirementAndGenerateTasks"
                                        type="text"
                                        class="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="예: 사용자 인증 기능 추가, 다크모드 지원, 데이터 내보내기..."
                                        :disabled="isAddingRequirement"
                                    />
                                    <button
                                        @click="addRequirementAndGenerateTasks"
                                        :disabled="
                                            !newRequirementInput.trim() || isAddingRequirement
                                        "
                                        class="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors flex items-center gap-2"
                                    >
                                        <svg
                                            v-if="isAddingRequirement"
                                            class="animate-spin w-4 h-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                        >
                                            <circle
                                                class="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                stroke-width="4"
                                            ></circle>
                                            <path
                                                class="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            ></path>
                                        </svg>
                                        <svg
                                            v-else
                                            class="w-4 h-4"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M12 4v16m8-8H4"
                                            />
                                        </svg>
                                        <span>{{
                                            isAddingRequirement ? '생성 중...' : '태스크 추가'
                                        }}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Step 6: Optimization -->
                    <div v-if="currentStep === 'optimize'" class="space-y-6">
                        <div v-if="isOptimizing" class="text-center py-8">
                            <div
                                class="animate-spin w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"
                            ></div>
                            <p class="text-white mb-2">프롬프트 최적화 중...</p>
                            <p class="text-gray-400 text-sm">
                                {{ currentOptimizingTask + 1 }} / {{ selectedTasks.size }} 태스크
                            </p>
                            <div
                                class="w-64 h-2 bg-gray-700 rounded-full mx-auto mt-3 overflow-hidden"
                            >
                                <div
                                    class="h-full bg-purple-500 transition-all"
                                    :style="{
                                        width: `${((currentOptimizingTask + 1) / selectedTasks.size) * 100}%`,
                                    }"
                                ></div>
                            </div>
                        </div>

                        <div v-else class="space-y-4">
                            <div class="bg-green-900/20 border border-green-800/30 rounded-lg p-4">
                                <div class="flex items-center gap-2 text-green-400">
                                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                        <path
                                            fill-rule="evenodd"
                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                            clip-rule="evenodd"
                                        />
                                    </svg>
                                    <span class="font-medium"
                                        >{{ optimizedTasks.length }}개 태스크 프롬프트 최적화
                                        완료!</span
                                    >
                                </div>
                            </div>

                            <div class="space-y-3 max-h-[350px] overflow-y-auto">
                                <div
                                    v-for="(task, idx) in optimizedTasks"
                                    :key="idx"
                                    class="bg-gray-800 rounded-lg p-4"
                                >
                                    <div class="flex items-center justify-between mb-2">
                                        <h4 class="font-medium text-white">{{ task.title }}</h4>
                                        <div class="flex items-center gap-2">
                                            <div
                                                :class="[
                                                    'w-6 h-6 rounded flex items-center justify-center text-white text-xs',
                                                    getProviderColor(task.suggestedAIProvider),
                                                ]"
                                            >
                                                {{ getProviderIcon(task.suggestedAIProvider) }}
                                            </div>
                                            <span class="text-xs text-gray-500">{{
                                                task.suggestedModel
                                            }}</span>
                                        </div>
                                    </div>
                                    <div class="flex flex-wrap items-center gap-2 mb-2 text-xs">
                                        <span
                                            class="px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-500/40"
                                        >
                                            {{
                                                task.primaryOutputFormat ||
                                                task.expectedOutputFormat ||
                                                'markdown'
                                            }}
                                        </span>
                                        <span
                                            class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40"
                                            v-if="task.estimatedMinutes"
                                        >
                                            {{ task.estimatedMinutes }}분 예상
                                        </span>
                                        <span
                                            class="px-2 py-0.5 rounded bg-gray-500/20 text-gray-200 border border-gray-500/40"
                                            v-if="task.executionOrder"
                                        >
                                            #{{ task.executionOrder }}
                                        </span>
                                    </div>
                                    <div class="bg-gray-900 rounded p-3 max-h-32 overflow-y-auto">
                                        <pre class="text-xs text-gray-400 whitespace-pre-wrap"
                                            >{{ task.description.substring(0, 300)
                                            }}{{ task.description.length > 300 ? '...' : '' }}</pre
                                        >
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Step 7: Confirm -->
                    <div v-if="currentStep === 'confirm'" class="space-y-6">
                        <div class="space-y-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >프로젝트 제목</label
                                >
                                <input
                                    v-model="projectTitle"
                                    type="text"
                                    class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="프로젝트 제목을 입력하세요"
                                />
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >프로젝트 설명</label
                                >
                                <textarea
                                    v-model="projectDescription"
                                    rows="3"
                                    class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                    placeholder="프로젝트 설명을 입력하세요"
                                ></textarea>
                            </div>

                            <div v-if="isDevProject" class="space-y-2">
                                <div class="flex items-center justify-between">
                                    <label class="block text-sm font-medium text-gray-300"
                                        >개발 베이스 폴더</label
                                    >
                                    <span class="text-xs text-gray-400"
                                        >로컬 개발을 시작할 기본 경로</span
                                    >
                                </div>
                                <div class="flex gap-2">
                                    <input
                                        v-model="baseDevFolder"
                                        type="text"
                                        class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="/Users/you/Projects/my-app"
                                    />
                                    <button
                                        type="button"
                                        class="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
                                        @click="selectBaseDevFolder"
                                    >
                                        폴더 선택
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="bg-gray-800 rounded-lg p-4 space-y-3">
                            <h4 class="font-medium text-white">프로젝트 요약</h4>
                            <div class="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                    <div class="text-gray-500">태스크</div>
                                    <div class="text-white font-medium">
                                        {{ optimizedTasks.length }}개
                                    </div>
                                </div>
                                <div>
                                    <div class="text-gray-500">예상 시간</div>
                                    <div class="text-white font-medium">
                                        {{
                                            Math.round(
                                                optimizedTasks.reduce(
                                                    (sum, t) => sum + t.estimatedMinutes,
                                                    0
                                                ) / 60
                                            )
                                        }}시간
                                    </div>
                                </div>
                                <div>
                                    <div class="text-gray-500">AI 모델</div>
                                    <div class="text-white font-medium">
                                        {{
                                            new Set(
                                                optimizedTasks.map((t) => t.suggestedAIProvider)
                                            ).size
                                        }}개 사용
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="bg-blue-900/20 border border-blue-800/30 rounded-lg p-4">
                            <div class="flex items-start gap-3">
                                <span class="text-xl">🚀</span>
                                <div>
                                    <h4 class="font-medium text-blue-300">
                                        프로젝트 생성 준비 완료!
                                    </h4>
                                    <p class="text-sm text-gray-400 mt-1">
                                        "프로젝트 생성" 버튼을 클릭하면 설정된 태스크들이 프로젝트에
                                        등록됩니다. 각 태스크는 추천된 AI 모델과 최적화된 프롬프트로
                                        실행될 준비가 됩니다.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div
                    class="px-6 py-4 border-t border-gray-700 bg-gray-800/50 flex items-center justify-between"
                >
                    <button
                        v-if="currentStepIndex > 0"
                        @click="prevStep"
                        class="px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        ← 이전
                    </button>
                    <div v-else></div>

                    <div class="flex items-center gap-3">
                        <button
                            @click="emit('close')"
                            class="px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            취소
                        </button>

                        <!-- Local Repo Mode: Direct creation option at idea step -->
                        <button
                            v-if="
                                currentStep === 'idea' &&
                                creationMode === 'local-repo' &&
                                selectedRepo
                            "
                            @click="createProjectFromLocalRepo"
                            class="px-6 py-2 rounded-lg font-medium transition-colors bg-violet-600 text-white hover:bg-violet-500"
                        >
                            바로 프로젝트 생성
                        </button>

                        <button
                            v-if="currentStep !== 'confirm'"
                            @click="nextStep"
                            :disabled="!canProceed"
                            :class="[
                                'px-6 py-2 rounded-lg font-medium transition-colors',
                                canProceed
                                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                                    : 'bg-gray-700 text-gray-500 cursor-not-allowed',
                            ]"
                        >
                            {{
                                creationMode === 'local-repo' && currentStep === 'idea'
                                    ? 'AI로 태스크 생성 →'
                                    : '다음 →'
                            }}
                        </button>

                        <button
                            v-else
                            @click="createProject"
                            :disabled="!canProceed"
                            :class="[
                                'px-6 py-2 rounded-lg font-medium transition-colors',
                                canProceed
                                    ? 'bg-green-600 text-white hover:bg-green-500'
                                    : 'bg-gray-700 text-gray-500 cursor-not-allowed',
                            ]"
                        >
                            프로젝트 생성
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
/* AI Thinking Animation */
@keyframes spin-slow {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

.animate-spin-slow {
    animation: spin-slow 2s linear infinite;
}

/* Markdown styles for AI messages */
:deep(.markdown-content) {
    line-height: 1.6;
}

:deep(.markdown-content p) {
    margin-bottom: 0.5rem;
}

:deep(.markdown-content p:last-child) {
    margin-bottom: 0;
}

:deep(.markdown-content strong) {
    font-weight: 600;
    color: #fff;
}

:deep(.markdown-content em) {
    font-style: italic;
}

:deep(.markdown-content ul),
:deep(.markdown-content ol) {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
}

:deep(.markdown-content li) {
    margin-bottom: 0.25rem;
}

:deep(.markdown-content code) {
    background-color: rgba(0, 0, 0, 0.3);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.875em;
    font-family: ui-monospace, monospace;
    color: #e5e7eb;
}

:deep(.markdown-content pre) {
    background-color: rgba(0, 0, 0, 0.4);
    padding: 0.75rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin: 0.5rem 0;
}

:deep(.markdown-content pre code) {
    background: none;
    padding: 0;
    font-size: 0.8125rem;
}

:deep(.markdown-content h1),
:deep(.markdown-content h2),
:deep(.markdown-content h3),
:deep(.markdown-content h4) {
    font-weight: 600;
    margin-top: 0.75rem;
    margin-bottom: 0.5rem;
    color: #fff;
}

:deep(.markdown-content h1) {
    font-size: 1.25rem;
}

:deep(.markdown-content h2) {
    font-size: 1.125rem;
}

:deep(.markdown-content h3) {
    font-size: 1rem;
}

:deep(.markdown-content blockquote) {
    border-left: 3px solid #4b5563;
    padding-left: 0.75rem;
    margin: 0.5rem 0;
    color: #9ca3af;
    font-style: italic;
}

:deep(.markdown-content a) {
    color: #60a5fa;
    text-decoration: underline;
}

:deep(.markdown-content a:hover) {
    color: #93c5fd;
}

:deep(.markdown-content hr) {
    border: none;
    border-top: 1px solid #374151;
    margin: 0.75rem 0;
}

:deep(.markdown-content table) {
    width: 100%;
    border-collapse: collapse;
    margin: 0.5rem 0;
}

:deep(.markdown-content th),
:deep(.markdown-content td) {
    border: 1px solid #374151;
    padding: 0.375rem 0.5rem;
    text-align: left;
}

:deep(.markdown-content th) {
    background-color: rgba(55, 65, 81, 0.5);
    font-weight: 600;
}
</style>
