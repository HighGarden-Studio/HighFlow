<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTaskStore, type TaskStatus, type TaskPriority } from '@/stores/taskStore';
import { tagService } from '../../services/task/TagService';

const props = defineProps<{
    open: boolean;
    projectId: number;
    initialStatus?: TaskStatus;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'saved'): void;
}>();

const taskStore = useTaskStore();

// Local state
const newTaskTitle = ref('');
const newTaskDescription = ref('');
const newTaskPriority = ref<TaskPriority>('medium');
const newTaskType = ref<'ai' | 'script' | 'input' | 'output'>('ai');
const newTaskScriptLanguage = ref<'javascript' | 'typescript' | 'python'>('javascript');
const creating = ref(false);

// Reset form when opening
function resetForm() {
    newTaskTitle.value = '';
    newTaskDescription.value = '';
    newTaskPriority.value = 'medium';
    newTaskType.value = 'ai';
    newTaskScriptLanguage.value = 'javascript';
}

// Initial setup
if (props.open) {
    resetForm();
}

async function handleCreateTask() {
    if (!newTaskTitle.value.trim()) return;

    creating.value = true;
    try {
        const basePrompt = `${newTaskTitle.value}\n\n${newTaskDescription.value}`;
        const autoTags = tagService.generatePromptTags(basePrompt);

        const taskData: any = {
            projectId: props.projectId,
            title: newTaskTitle.value.trim(),
            description: newTaskDescription.value.trim(),
            priority: newTaskPriority.value,
            tags: autoTags,
            taskType: newTaskType.value,
        };

        // Add script-specific fields
        if (newTaskType.value === 'script') {
            taskData.scriptLanguage = newTaskScriptLanguage.value;
            taskData.scriptCode = getScriptTemplate(newTaskScriptLanguage.value);
        } else if (newTaskType.value === 'input') {
            // Set default input config
            taskData.inputConfig = JSON.stringify({
                sourceType: 'USER_INPUT',
                userInput: {
                    message: '필요한 정보를 입력해주세요',
                    required: true,
                    mode: 'short',
                },
            });
        } else if (newTaskType.value === 'output') {
            // Set default output config
            taskData.outputConfig = {
                destination: 'local_file',
                aggregation: 'concat',
                localFile: {
                    pathTemplate: 'output-{{date}}.md',
                    overwrite: false,
                    format: 'text',
                },
            };
        }

        console.log('[TaskCreateModal] Creating task:', taskData);
        const task = await taskStore.createTask(taskData);
        console.log('[TaskCreateModal] Task created:', task);

        if (task) {
            // Track tag usage for better suggestions
            autoTags.forEach((tag) => tagService.incrementUsage(tag));

            // Update status if needed (default from store is usually 'todo')
            if (props.initialStatus && props.initialStatus !== 'todo') {
                await taskStore.updateTask(task.projectId, task.projectSequence, {
                    status: props.initialStatus,
                });
            }

            emit('saved');
            emit('close');
            resetForm();
        }
    } finally {
        creating.value = false;
    }
}

function getScriptTemplate(language: 'javascript' | 'typescript' | 'python'): string {
    const templates = {
        javascript: `// Script Task - JavaScript
// Must return: { result: any, control?: ControlFlow }
//
// Available Variables:
// - prev: Result of last dependency
// - prev_0, prev_1: Previous results (0=latest)
// - task_N: Result of task #N
// - project: { name, description, baseDevFolder }
//
// Macros: {{prev}}, {{task.N}}

console.log('Script started');

const myResult = "Hello from JavaScript";

// REQUIRED: Return object with 'result' property
return {
    result: myResult,
    // control: { next: [5] }  // Optional: control flow (next must be array)
};`,
        typescript: `// Script Task - TypeScript
// Must return: { result: any, control?: ControlFlow }
//
// Available Variables: prev, prev_0, task_N, project
// Macros: {{prev}}, {{task.N}}

console.log('Script started');

interface ScriptTaskReturn {
    result: any;
    control?: {
        next?: number[];  // Execute task #N next (must be array)
        skip?: number;    // Skip N tasks in sequence
    };
}

const myResult: string = "Hello from TypeScript";

// REQUIRED: Return ScriptTaskReturn format
return {
    result: myResult,
} as ScriptTaskReturn;`,
        python: `# Script Task - Python
# Must return: { "result": any, "control": ControlFlow }
#
# Available Variables:
# - prev: Result of last dependency
# - prev_0, prev_1: Previous results
# - task_N: Result of task #N
# - project: {"name", "description", "baseDevFolder"}
#
# Macros: {{prev}}, {{task.N}}

print('Script started')

my_result = "Hello from Python"

# REQUIRED: Return dict with 'result' key
return {
    "result": my_result,
    # "control": {"next": [5]}  # Optional: control flow (next must be list)
}`,
    };
    return templates[language];
}
</script>

<template>
    <Teleport to="body">
        <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
            <div class="absolute inset-0 bg-black/60" @click="emit('close')"></div>
            <div
                class="relative bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-xl"
            >
                <h2 class="text-xl font-bold text-white mb-4">Create New Task</h2>

                <form @submit.prevent="handleCreateTask" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-300 mb-1">
                            Task Title
                        </label>
                        <input
                            v-model="newTaskTitle"
                            type="text"
                            placeholder="What needs to be done?"
                            class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            autofocus
                        />
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-300 mb-1">
                            Description (optional)
                        </label>
                        <textarea
                            v-model="newTaskDescription"
                            rows="3"
                            placeholder="Add more details..."
                            class="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                        ></textarea>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-300 mb-1">
                            Priority
                        </label>
                        <div class="flex gap-2">
                            <button
                                v-for="priority in [
                                    'low',
                                    'medium',
                                    'high',
                                    'urgent',
                                ] as TaskPriority[]"
                                :key="priority"
                                type="button"
                                @click="newTaskPriority = priority"
                                :class="[
                                    'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors capitalize',
                                    newTaskPriority === priority
                                        ? priority === 'low'
                                            ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500'
                                            : priority === 'medium'
                                              ? 'bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500'
                                              : priority === 'high'
                                                ? 'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500'
                                                : 'bg-red-500/20 text-red-400 ring-1 ring-red-500'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
                                ]"
                            >
                                {{ priority }}
                            </button>
                        </div>
                    </div>

                    <!-- Task Type Selection -->
                    <div>
                        <label class="block text-sm font-medium text-gray-300 mb-2">
                            Task Type
                        </label>
                        <div class="flex gap-2">
                            <button
                                type="button"
                                @click="newTaskType = 'ai'"
                                :class="[
                                    'flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                    newTaskType === 'ai'
                                        ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
                                ]"
                            >
                                🤖 AI Task
                            </button>
                            <button
                                type="button"
                                @click="newTaskType = 'script'"
                                :class="[
                                    'flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                    newTaskType === 'script'
                                        ? 'bg-purple-500/20 text-purple-400 ring-1 ring-purple-500'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
                                ]"
                            >
                                ⚡ Script
                            </button>
                            <button
                                type="button"
                                @click="newTaskType = 'input'"
                                :class="[
                                    'flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                    newTaskType === 'input'
                                        ? 'bg-yellow-500/20 text-yellow-400 ring-1 ring-yellow-500'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
                                ]"
                            >
                                ⌨️ Input
                            </button>
                            <button
                                type="button"
                                @click="newTaskType = 'output'"
                                :class="[
                                    'flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                    newTaskType === 'output'
                                        ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
                                ]"
                            >
                                💾 Output
                            </button>
                        </div>
                    </div>

                    <!-- Script Language Selection (shown only for script tasks) -->
                    <div v-if="newTaskType === 'script'">
                        <label class="block text-sm font-medium text-gray-300 mb-2">
                            Script Language
                        </label>
                        <div class="flex gap-2">
                            <button
                                v-for="lang in ['javascript', 'typescript', 'python']"
                                :key="lang"
                                type="button"
                                @click="newTaskScriptLanguage = lang as any"
                                :class="[
                                    'flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors capitalize',
                                    newTaskScriptLanguage === lang
                                        ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500'
                                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
                                ]"
                            >
                                {{
                                    lang === 'javascript'
                                        ? '🟨 JS'
                                        : lang === 'typescript'
                                          ? '🔷 TS'
                                          : '🐍 PY'
                                }}
                            </button>
                        </div>
                    </div>

                    <div class="flex gap-3 pt-2">
                        <button
                            type="button"
                            @click="emit('close')"
                            class="flex-1 px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-700 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            :disabled="!newTaskTitle.trim() || creating"
                            class="flex-1 px-4 py-2 bg-blue-600 rounded-lg text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {{ creating ? 'Creating...' : 'Create Task' }}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </Teleport>
</template>
