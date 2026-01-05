import { computed } from 'vue';
import type { Task } from '@core/types/database';

export function useTaskStatus(props: { task: Task; missingProvider?: any }) {
    /**
     * Get priority color
     */
    const priorityColor = computed(() => {
        switch (props.task.priority) {
            case 'urgent':
                return 'bg-red-500';
            case 'high':
                return 'bg-orange-500';
            case 'medium':
                return 'bg-yellow-500';
            case 'low':
                return 'bg-blue-500';
            default:
                return 'bg-gray-500';
        }
    });

    /**
     * Format due date
     */
    const dueDateFormatted = computed(() => {
        if (!props.task.dueDate) return null;

        const date = new Date(props.task.dueDate);
        const now = new Date();
        const diff = date.getTime() - now.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days < 0) {
            return `Overdue by ${Math.abs(days)}d`;
        } else if (days === 0) {
            return 'Due today';
        } else if (days === 1) {
            return 'Due tomorrow';
        } else {
            return `Due in ${days}d`;
        }
    });

    /**
     * Check if task is overdue
     */
    const isOverdue = computed(() => {
        if (!props.task.dueDate) return false;
        return new Date(props.task.dueDate) < new Date();
    });

    /**
     * Get AI provider badge color
     */
    const aiProviderColor = computed(() => {
        switch (props.task.aiProvider) {
            case 'anthropic':
                return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300';
            case 'openai':
                return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
            case 'google':
                return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
            case 'claude-code':
                return 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300';

                return 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300';
            case 'codex':
                return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300';
            default:
                return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
        }
    });

    /**
     * Check if a provider is missing
     */
    const hasMissingProvider = computed(() => !!props.missingProvider);

    /**
     * Check if this is an input task waiting for user
     */
    const isWaitingForInput = computed(() => {
        if (props.task.status !== 'in_progress') return false;

        // Check explicit sub-status
        if (props.task.inputSubStatus === 'WAITING_USER') return true;

        // Fallback: If it's a User Input task in progress and sub-status is missing/IDLE, assume waiting
        if (
            props.task.taskType === 'input' &&
            props.task.inputConfig?.sourceType === 'USER_INPUT' &&
            (!props.task.inputSubStatus || props.task.inputSubStatus === 'IDLE')
        ) {
            return true;
        }

        return false;
    });

    /**
     * Check if execution settings are missing (prompt or AI provider not set)
     */
    const isMissingExecutionSettings = computed(() => {
        const hasPrompt = props.task.generatedPrompt || props.task.description;
        const hasProvider = props.task.aiProvider;
        return !hasPrompt || !hasProvider;
    });

    /**
     * Get which execution settings are missing
     */
    const missingSettings = computed(() => {
        const missing: string[] = [];
        const hasPrompt = props.task.generatedPrompt || props.task.description;
        const hasProvider = props.task.aiProvider;
        const isScriptTask = props.task.taskType === 'script';
        if (!hasPrompt) missing.push(isScriptTask ? '스크립트' : '프롬프트');
        if (!hasProvider && !isScriptTask) missing.push('AI Provider');
        return missing;
    });

    /**
     * Get output format info
     */
    function getOutputFormatInfo(format: string | null | undefined) {
        if (!format) return null;

        const lowerFormat = format.toLowerCase().trim();
        // ... (Logic from DAGView) ... keeping it simple for now or copying the map

        const map: Record<
            string,
            { label: string; icon: string; bgColor: string; textColor: string }
        > = {
            text: {
                label: 'Text',
                icon: '📝',
                bgColor: 'bg-gray-100 dark:bg-gray-800',
                textColor: 'text-gray-700 dark:text-gray-200',
            },
            markdown: {
                label: 'Markdown',
                icon: '📄',
                bgColor: 'bg-emerald-100 dark:bg-emerald-900/40',
                textColor: 'text-emerald-700 dark:text-emerald-200',
            },
            html: {
                label: 'HTML',
                icon: '🌐',
                bgColor: 'bg-blue-100 dark:bg-blue-900/40',
                textColor: 'text-blue-700 dark:text-blue-200',
            },
            pdf: {
                label: 'PDF',
                icon: '📕',
                bgColor: 'bg-rose-100 dark:bg-rose-900/40',
                textColor: 'text-rose-700 dark:text-rose-200',
            },
            json: {
                label: 'JSON',
                icon: '🧩',
                bgColor: 'bg-amber-100 dark:bg-amber-900/40',
                textColor: 'text-amber-700 dark:text-amber-200',
            },
            yaml: {
                label: 'YAML',
                icon: '🗂️',
                bgColor: 'bg-amber-100 dark:bg-amber-900/40',
                textColor: 'text-amber-700 dark:text-amber-200',
            },
            csv: {
                label: 'CSV',
                icon: '📊',
                bgColor: 'bg-indigo-100 dark:bg-indigo-900/40',
                textColor: 'text-indigo-700 dark:text-indigo-200',
            },
            sql: {
                label: 'SQL',
                icon: '🗄️',
                bgColor: 'bg-purple-100 dark:bg-purple-900/40',
                textColor: 'text-purple-700 dark:text-purple-200',
            },
            shell: {
                label: 'Shell',
                icon: '💻',
                bgColor: 'bg-slate-100 dark:bg-slate-800',
                textColor: 'text-slate-700 dark:text-slate-200',
            },

            svg: {
                label: 'SVG',
                icon: '🖼️',
                bgColor: 'bg-pink-100 dark:bg-pink-900/40',
                textColor: 'text-pink-700 dark:text-pink-200',
            },
            png: {
                label: 'PNG',
                icon: '🖼️',
                bgColor: 'bg-pink-100 dark:bg-pink-900/40',
                textColor: 'text-pink-700 dark:text-pink-200',
            },
            mp4: {
                label: 'Video',
                icon: '🎬',
                bgColor: 'bg-orange-100 dark:bg-orange-900/40',
                textColor: 'text-orange-700 dark:text-orange-200',
            },
            mp3: {
                label: 'Audio',
                icon: '🎵',
                bgColor: 'bg-cyan-100 dark:bg-cyan-900/40',
                textColor: 'text-cyan-700 dark:text-cyan-200',
            },
            diff: {
                label: 'Diff',
                icon: '🔀',
                bgColor: 'bg-lime-100 dark:bg-lime-900/40',
                textColor: 'text-lime-700 dark:text-lime-200',
            },
            log: {
                label: 'Log',
                icon: '📜',
                bgColor: 'bg-gray-100 dark:bg-gray-800',
                textColor: 'text-gray-700 dark:text-gray-200',
            },
            code: {
                label: 'Code',
                icon: '💻',
                bgColor: 'bg-slate-100 dark:bg-slate-800',
                textColor: 'text-slate-700 dark:text-slate-200',
            },
            mermaid: {
                label: 'Mermaid',
                icon: '📊',
                bgColor: 'bg-indigo-100 dark:bg-indigo-900/40',
                textColor: 'text-indigo-700 dark:text-indigo-200',
            },
        };

        if (map[lowerFormat]) return map[lowerFormat];
        return {
            label: format,
            icon: '📦',
            bgColor: 'bg-gray-100 dark:bg-gray-800',
            textColor: 'text-gray-700 dark:text-gray-200',
        };
    }

    const outputFormatInfo = computed(() => {
        // 1. Check actual AI result kind first (Authoritative)
        const output = props.task.output as any;
        if (output?.aiResult) {
            const { kind, subType } = output.aiResult;
            if (kind === 'image') return getOutputFormatInfo('png'); // Or explicit image type
            if (kind === 'text' || kind === 'markdown') {
                if (subType === 'markdown') return getOutputFormatInfo('markdown');
                if (subType === 'json') return getOutputFormatInfo('json');
                if (subType === 'mermaid') return getOutputFormatInfo('mermaid');
                return getOutputFormatInfo('text');
            }
        }

        // 2. Fallback to persisted outputFormat or expectedOutputFormat
        return getOutputFormatInfo(props.task.outputFormat || props.task.expectedOutputFormat);
    });

    return {
        priorityColor,
        dueDateFormatted,
        isOverdue,
        aiProviderColor,
        hasMissingProvider,
        isWaitingForInput,
        isMissingExecutionSettings,
        missingSettings,
        outputFormatInfo,
    };
}
