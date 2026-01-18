<template>
    <div class="script-template-list h-full flex flex-col">
        <!-- Filter Tags -->
        <div v-if="uniqueTags.length > 0" class="filter-bar">
            <button
                class="filter-chip"
                :class="{ active: selectedTag === null }"
                @click="selectTag(null)"
            >
                All
            </button>
            <button
                v-for="tag in uniqueTags"
                :key="tag"
                class="filter-chip"
                :class="{ active: selectedTag === tag }"
                @click="selectTag(tag)"
            >
                {{ tag }}
            </button>
        </div>

        <!-- List (Horizontal Scroll) -->
        <div class="flex-1 overflow-x-auto overflow-y-hidden p-4 custom-scrollbar">
            <div v-if="loading" class="text-center py-8 text-gray-500 text-sm">
                Loading templates...
            </div>
            <div
                v-else-if="filteredTemplates.length === 0"
                class="text-center py-8 text-gray-500 text-sm"
            >
                No templates found
            </div>
            <div v-else class="flex flex-row gap-3 min-w-max">
                <div
                    v-for="template in filteredTemplates"
                    :key="template.id"
                    class="template-card group"
                    draggable="true"
                    @dragstart="handleDragStart($event, template)"
                    @dragend="handleDragEnd"
                >
                    <div class="flex items-start justify-between mb-2">
                        <div class="flex items-center gap-2">
                            <div
                                class="w-8 h-8 rounded bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center text-blue-400 border border-blue-500/30"
                            >
                                📜
                            </div>
                            <div>
                                <div class="font-medium text-gray-200 text-sm">
                                    {{ template.name }}
                                </div>
                                <div class="text-xs text-gray-500 truncate max-w-[120px]">
                                    {{ template.description }}
                                </div>
                            </div>
                        </div>
                        <!-- Actions -->
                        <div
                            class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <button
                                class="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded"
                                title="Edit"
                                @click.stop="openModal(template)"
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
                                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                    />
                                </svg>
                            </button>
                            <button
                                class="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded"
                                title="Delete"
                                @click.stop="deleteTemplate(template.id)"
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
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                    <!-- Tags -->
                    <div class="flex flex-wrap gap-1">
                        <span
                            v-for="tag in template.tags"
                            :key="tag"
                            class="px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded text-[10px] border border-gray-700"
                        >
                            {{ tag }}
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Modal -->
        <ScriptTemplateModal
            :open="isModalOpen"
            :template="selectedTemplate"
            @close="closeModal"
            @save="handleSave"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ScriptTemplate } from '@core/types/database';
import ScriptTemplateModal from './ScriptTemplateModal.vue';

const props = defineProps<{
    templates?: ScriptTemplate[];
    loading?: boolean;
}>();

const emit = defineEmits<{
    (e: 'refresh'): void;
}>();

const searchQuery = ref('');
const selectedTag = ref<string | null>(null);

const isModalOpen = ref(false);
const selectedTemplate = ref<ScriptTemplate | null>(null);

// Computed properties
const uniqueTags = computed(() => {
    const tags = new Set<string>();
    (props.templates || []).forEach((t) => {
        if (t.tags && Array.isArray(t.tags)) {
            t.tags.forEach((tag: string) => tags.add(tag));
        }
    });
    return Array.from(tags).sort();
});

const filteredTemplates = computed(() => {
    let result = props.templates || [];

    if (selectedTag.value) {
        result = result.filter((t) => t.tags && t.tags.includes(selectedTag.value!));
    }

    if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase();
        result = result.filter(
            (t) =>
                t.name.toLowerCase().includes(query) ||
                (t.description && t.description.toLowerCase().includes(query))
        );
    }

    return result;
});

function selectTag(tag: string | null) {
    selectedTag.value = selectedTag.value === tag ? null : tag;
}

// Modal handling
function openModal(template: ScriptTemplate | null) {
    selectedTemplate.value = template;
    isModalOpen.value = true;
}

function closeModal() {
    isModalOpen.value = false;
    selectedTemplate.value = null;
}

async function handleSave(data: any) {
    try {
        if (selectedTemplate.value) {
            // Update
            await window.electron.scriptTemplates.update(selectedTemplate.value.id, data);
        } else {
            // Create
            await window.electron.scriptTemplates.create(data);
        }
        emit('refresh');
        closeModal();
    } catch (e) {
        console.error('Failed to save template:', e);
        alert('Failed to save template');
    }
}

async function deleteTemplate(id: number) {
    if (!confirm('Are you sure you want to delete this template?')) return;
    try {
        await window.electron.scriptTemplates.delete(id);
        emit('refresh');
    } catch (e) {
        console.error('Failed to delete template:', e);
    }
}

// Drag functionality
function handleDragStart(event: DragEvent, template: ScriptTemplate) {
    if (!event.dataTransfer) return;

    event.dataTransfer.effectAllowed = 'copy';
    const dragData = JSON.stringify({
        type: 'script-template',
        templateId: template.id,
        name: template.name,
        // Provide basic data for optimistic UI
        scriptCode: template.scriptCode,
        defaultOptions: template.defaultOptions,
    });
    event.dataTransfer.setData('application/x-script-template', dragData);

    const target = event.target as HTMLElement;
    target.classList.add('dragging');
}

function handleDragEnd(event: DragEvent) {
    const target = event.target as HTMLElement;
    target.classList.remove('dragging');
}
</script>

<style scoped>
.filter-bar {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    overflow-x: auto;
    scrollbar-width: none;
}

.filter-bar::-webkit-scrollbar {
    display: none;
}

.filter-chip {
    padding: 0.125rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 9999px;
    color: #aaa;
    font-size: 0.7rem;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.2s;
}

.filter-chip:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
}

.filter-chip.active {
    background: rgba(59, 130, 246, 0.2);
    border-color: rgba(59, 130, 246, 0.5);
    color: #60a5fa;
}

.custom-scrollbar::-webkit-scrollbar {
    width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
}

.custom-scrollbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.2);
}

.template-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 0.5rem;
    padding: 0.75rem;
    cursor: grab;
    transition: all 0.2s;
}

.template-card:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.1);
    transform: translateY(-1px);
    box-shadow:
        0 4px 6px -1px rgba(0, 0, 0, 0.1),
        0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.template-card.dragging {
    opacity: 0.5;
    border-style: dashed;
}
</style>
