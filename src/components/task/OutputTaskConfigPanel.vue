<template>
    <div class="output-config-panel space-y-4">
        <!-- Destination Selection -->
        <div class="form-group">
            <label class="text-xs font-semibold text-gray-400 uppercase">Destination</label>
            <div class="flex gap-2 mt-1">
                <button
                    v-for="dest in destinations"
                    :key="dest.value"
                    @click="updateDestination(dest.value)"
                    class="px-3 py-2 text-sm rounded border transition-colors flex items-center gap-2"
                    :class="[
                        config.destination === dest.value
                            ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600',
                    ]"
                >
                    <component :is="dest.icon" class="w-4 h-4" />
                    {{ dest.label }}
                </button>
            </div>
        </div>

        <!-- Aggregation Strategy -->
        <div class="form-group">
            <label class="text-xs font-semibold text-gray-400 uppercase">Aggregation</label>
            <select
                :value="config.aggregation"
                @change="(e) => updateAggregation((e.target as HTMLSelectElement).value)"
                class="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
            >
                <option value="single">Single (First Result)</option>
                <option value="concat">Concatenate All Dependencies</option>
                <!-- <option value="template">Template (Advanced)</option> -->
            </select>
        </div>

        <!-- Local File Config -->
        <div
            v-if="config.destination === 'local_file'"
            class="space-y-4 pt-2 border-t border-gray-800"
        >
            <div class="form-group">
                <div class="flex justify-between items-center">
                    <label class="text-xs font-semibold text-gray-400 uppercase"
                        >File Path Template</label
                    >
                    <span class="text-xs text-gray-500" v-pre
                        >Supports {{ date }}, {{ task.title }}</span
                    >
                </div>
                <input
                    type="text"
                    :value="config.localFile?.pathTemplate"
                    @input="
                        (e) => updateLocalFile('pathTemplate', (e.target as HTMLInputElement).value)
                    "
                    placeholder="e.g., reports/{{date}}_{{task.title}}.md"
                    class="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                />
                <p class="mt-1 text-xs text-gray-500">
                    Path relative to project's <strong>Base Dev Folder</strong>. Supports:
                    {{ date }}, {{ time }}, {{ taskId }}, {{ task.title }}, {{ project.name }}
                </p>
            </div>

            <div class="flex items-center gap-2">
                <input
                    type="checkbox"
                    id="overwrite"
                    :checked="config.localFile?.overwrite"
                    @change="
                        (e) => updateLocalFile('overwrite', (e.target as HTMLInputElement).checked)
                    "
                    class="rounded bg-gray-700 border-gray-600"
                />
                <label for="overwrite" class="text-sm text-gray-300">Overwrite if exists</label>
            </div>
        </div>

        <!-- Slack Config -->
        <div v-if="config.destination === 'slack'" class="space-y-4 pt-2 border-t border-gray-800">
            <div class="form-group">
                <label class="text-xs font-semibold text-gray-400 uppercase">Channel ID</label>
                <input
                    type="text"
                    :value="config.slack?.channelId"
                    @input="(e) => updateSlack('channelId', (e.target as HTMLInputElement).value)"
                    placeholder="C12345678"
                    class="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                />
            </div>
            <div class="form-group">
                <label class="text-xs font-semibold text-gray-400 uppercase"
                    >Thread Timestamp (Optional)</label
                >
                <input
                    type="text"
                    :value="config.slack?.threadTs"
                    @input="(e) => updateSlack('threadTs', (e.target as HTMLInputElement).value)"
                    placeholder="1234567890.123456"
                    class="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                />
            </div>
        </div>

        <!-- Google Docs Config -->
        <div
            v-if="config.destination === 'google_docs'"
            class="space-y-4 pt-2 border-t border-gray-800"
        >
            <div class="form-group">
                <label class="text-xs font-semibold text-gray-400 uppercase">Document Name</label>
                <input
                    type="text"
                    :value="config.googleDocs?.documentName"
                    @input="
                        (e) =>
                            updateGoogleDocs('documentName', (e.target as HTMLInputElement).value)
                    "
                    placeholder="New Document Title"
                    class="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                />
            </div>
            <div class="form-group">
                <label class="text-xs font-semibold text-gray-400 uppercase"
                    >Folder ID (Optional)</label
                >
                <input
                    type="text"
                    :value="config.googleDocs?.folderId"
                    @input="
                        (e) => updateGoogleDocs('folderId', (e.target as HTMLInputElement).value)
                    "
                    placeholder="Folder ID"
                    class="w-full mt-1 bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { LucideFileText, LucideHash, LucideFile } from 'lucide-vue-next';
import type { OutputTaskConfig, OutputDestinationType } from '@/core/types/database';

// Props & Emits
const props = defineProps<{
    modelValue: OutputTaskConfig | null | undefined;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: OutputTaskConfig): void;
}>();

// Default Helper
const getDefaultConfig = (): OutputTaskConfig => ({
    destination: 'local_file',
    aggregation: 'concat',
    localFile: {
        pathTemplate: '',
        overwrite: false,
        format: 'text',
    },
});

// Computed Config Wrapper
const config = computed({
    get: () => props.modelValue || getDefaultConfig(),
    set: (val) => emit('update:modelValue', val),
});

// Destination Options
const destinations = [
    { value: 'local_file', label: 'Local File', icon: LucideFile },
    { value: 'slack', label: 'Slack', icon: LucideHash },
    { value: 'google_docs', label: 'Google Docs', icon: LucideFileText },
];

// Methods
function updateDestination(dest: string) {
    const newConfig = { ...config.value, destination: dest as OutputDestinationType };

    // Initialize destination specific config if missing
    if (dest === 'local_file' && !newConfig.localFile) {
        newConfig.localFile = {
            pathTemplate: 'output-{{date}}.md',
            overwrite: false,
            format: 'text',
        };
    } else if (dest === 'slack' && !newConfig.slack) {
        newConfig.slack = { channelId: '' };
    } else if (dest === 'google_docs' && !newConfig.googleDocs) {
        newConfig.googleDocs = { documentName: 'New Document' };
    }

    config.value = newConfig;
}

function updateAggregation(val: string) {
    config.value = { ...config.value, aggregation: val as any };
}

function updateLocalFile(key: string, val: any) {
    config.value = {
        ...config.value,
        localFile: {
            ...config.value.localFile!,
            [key]: val,
        },
    };
}

function updateSlack(key: string, val: any) {
    config.value = {
        ...config.value,
        slack: {
            ...config.value.slack!,
            [key]: val,
        },
    };
}

function updateGoogleDocs(key: string, val: any) {
    config.value = {
        ...config.value,
        googleDocs: {
            ...config.value.googleDocs!,
            [key]: val,
        },
    };
}
</script>
