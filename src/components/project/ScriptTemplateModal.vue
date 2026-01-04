<template>
    <Teleport to="body">
        <Transition
            enter-active-class="transition-opacity duration-200"
            enter-from-class="opacity-0"
            enter-to-class="opacity-100"
            leave-active-class="transition-opacity duration-200"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0"
        >
            <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4">
                <!-- Backdrop -->
                <div
                    class="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    @click="$emit('close')"
                />

                <!-- Modal Container -->
                <Transition
                    enter-active-class="transition-all duration-200"
                    enter-from-class="opacity-0 scale-95"
                    enter-to-class="opacity-100 scale-100"
                    leave-active-class="transition-all duration-200"
                    leave-from-class="opacity-100 scale-100"
                    leave-to-class="opacity-0 scale-95"
                >
                    <div
                        v-if="open"
                        class="relative w-full max-w-4xl max-h-[85vh] bg-gray-900 rounded-xl shadow-2xl border border-gray-700 overflow-hidden flex flex-col"
                    >
                        <!-- Modal Header -->
                        <div
                            class="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800/50"
                        >
                            <div class="flex items-center gap-3">
                                <div
                                    class="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-2xl"
                                >
                                    📜
                                </div>
                                <div>
                                    <h2 class="text-lg font-semibold text-white">
                                        {{ template?.id ? 'Edit Template' : 'Create Template' }}
                                    </h2>
                                    <p class="text-sm text-gray-400">Script task logic preset</p>
                                </div>
                            </div>
                            <button
                                @click="$emit('close')"
                                class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
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
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>

                        <!-- Modal Body -->
                        <div class="flex-1 overflow-y-auto p-6 space-y-5">
                            <!-- Name -->
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >Name</label
                                >
                                <input
                                    v-model="form.name"
                                    type="text"
                                    placeholder="e.g. Data Parser"
                                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                />
                            </div>

                            <!-- Description -->
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >Description</label
                                >
                                <textarea
                                    v-model="form.description"
                                    placeholder="Describe what this script does..."
                                    rows="2"
                                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-vertical"
                                ></textarea>
                            </div>

                            <!-- Script Code -->
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >Script Code</label
                                >
                                <div class="border border-gray-700 rounded-lg overflow-hidden">
                                    <CodeEditor
                                        v-model="form.scriptCode"
                                        language="javascript"
                                        height="300px"
                                    />
                                </div>
                            </div>

                            <!-- Default Options (JSON) -->
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >Default Options (JSON)</label
                                >
                                <div class="border border-gray-700 rounded-lg overflow-hidden">
                                    <CodeEditor
                                        v-model="form.defaultOptions"
                                        language="javascript"
                                        height="150px"
                                        @blur="formatJson"
                                    />
                                </div>
                            </div>

                            <!-- Tags -->
                            <div>
                                <label class="block text-sm font-medium text-gray-300 mb-2"
                                    >Tags</label
                                >
                                <div class="flex flex-wrap gap-2 mb-2">
                                    <div
                                        v-for="tag in form.tags"
                                        :key="tag"
                                        class="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full text-xs"
                                    >
                                        <span>{{ tag }}</span>
                                        <button
                                            @click="removeTag(tag)"
                                            class="hover:text-white focus:outline-none"
                                        >
                                            <svg
                                                class="w-3 h-3"
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
                                    <input
                                        v-model="tagInput"
                                        @keydown.enter.prevent="addTag"
                                        @keydown.comma.prevent="addTag"
                                        @blur="addTag"
                                        type="text"
                                        placeholder="Add tag..."
                                        class="flex-1 min-w-[100px] bg-transparent border-none text-white placeholder-gray-500 focus:outline-none focus:ring-0 text-sm"
                                    />
                                </div>
                                <div class="h-px bg-gray-700 w-full"></div>
                            </div>
                        </div>

                        <!-- Modal Footer -->
                        <div class="px-6 py-4 border-t border-gray-700 bg-gray-800/50">
                            <div class="flex items-center justify-end gap-3">
                                <button
                                    @click="$emit('close')"
                                    class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    @click="save"
                                    class="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-lg transition-all shadow-lg shadow-blue-900/30"
                                >
                                    {{ template ? 'Update' : 'Create' }}
                                </button>
                            </div>
                        </div>
                    </div>
                </Transition>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import CodeEditor from '../common/CodeEditor.vue';

const props = defineProps<{
    template?: any | null; // ScriptTemplate type
    open: boolean;
}>();

const emit = defineEmits<{
    close: [];
    save: [data: any];
}>();

const form = ref({
    name: '',
    description: '',
    scriptCode: '',
    defaultOptions: '{}',
    tags: [] as string[],
});

// Tag management
const tagInput = ref('');

function addTag() {
    const tag = tagInput.value.trim();
    if (tag && !form.value.tags.includes(tag)) {
        form.value.tags.push(tag);
    }
    tagInput.value = '';
}

function removeTag(tag: string) {
    form.value.tags = form.value.tags.filter((t) => t !== tag);
}

function formatJson() {
    try {
        const parsed = JSON.parse(form.value.defaultOptions);
        form.value.defaultOptions = JSON.stringify(parsed, null, 2);
    } catch (e) {
        // Ignore invalid JSON while editing
    }
}

watch(
    () => props.template,
    (template) => {
        if (template) {
            form.value = {
                name: template.name,
                description: template.description,
                scriptCode: template.scriptCode,
                defaultOptions:
                    typeof template.defaultOptions === 'string'
                        ? template.defaultOptions
                        : JSON.stringify(template.defaultOptions, null, 2),
                tags: [...(template.tags || [])],
            };
        } else {
            // Reset
            form.value = {
                name: '',
                description: '',
                scriptCode: '',
                defaultOptions: '{}',
                tags: [],
            };
        }
    },
    { immediate: true }
);

function save() {
    // Validate JSON
    try {
        JSON.parse(form.value.defaultOptions);
    } catch (e) {
        alert('Invalid JSON in Default Options');
        return;
    }

    // Create a plain serializable object
    const data = {
        name: String(form.value.name || ''),
        description: String(form.value.description || ''),
        scriptCode: String(form.value.scriptCode || ''),
        defaultOptions: String(form.value.defaultOptions || '{}'),
        tags: [...(form.value.tags || [])], // Create new array
    };

    emit('save', data);
}
</script>

<style scoped>
/* Custom scrollbar for modal content */
.overflow-y-auto::-webkit-scrollbar {
    width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
}

.overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}
</style>
