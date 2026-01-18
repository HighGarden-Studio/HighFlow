<script setup lang="ts">
/**
 * Registration Wizard
 * Multi-step wizard for registering new items to the Marketplace.
 */
import { ref, computed, onMounted } from 'vue';
import { useProjectStore } from '../../stores/projectStore';
import { marketplaceAPI } from '../../api/marketplace';
import type {
    MarketplaceCategory,
    ItemType,
    MarketplaceSubmission,
} from '../../../core/types/marketplace';
import type { Project } from '../../../core/types/database';
import { useToast } from 'vue-toastification';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
    initialType?: ItemType;
    initialLocalId?: string;
    initialSubmissionId?: string;
}>();

const emit = defineEmits(['close', 'submitted']);
const toast = useToast();
const projectStore = useProjectStore();

// Steps
type Step = 'type-selection' | 'item-selection' | 'details';
const currentStep = ref<Step>('type-selection');

// Selection State
const selectedType = ref<ItemType | null>(null);
const selectedItem = ref<Project | any | null>(null);

// Form Data
const category = ref<MarketplaceCategory>('other');
const price = ref(0);
const version = ref('1.0.0');
const notes = ref('');
const tagsInput = ref('');
const selectedFiles = ref<File[]>([]);
const previewUrls = ref<string[]>([]);
const searchQuery = ref('');

// Access Control
const visibility = ref<'public' | 'restricted'>('public');
const allowedEmails = ref('');
const allowedDomains = ref('');

const loading = ref(false);
const error = ref<string | null>(null);

// Drag state
const isDragging = ref(false);

// Categories
const categories: { label: string; value: MarketplaceCategory }[] = [
    { label: 'Automated Agents', value: 'automated-agents' },
    { label: 'Content Creation', value: 'content-creation' },
    { label: 'Development', value: 'development' },
    { label: 'Productivity', value: 'productivity' },
    { label: 'Data Analysis', value: 'data-analysis' },
    { label: 'Business Ops', value: 'business-ops' },
    { label: 'Education', value: 'education' },
    { label: 'Personal', value: 'personal' },
    { label: 'Other', value: 'other' },
];

// State for other items
const operators = ref<any[]>([]);
const scriptTemplates = ref<any[]>([]);

onMounted(async () => {
    // 1. Fetch data
    try {
        const electron = (window as any).electron;
        if (electron) {
            // Set default version from app
            try {
                if (electron.app) {
                    const appVersion = await electron.app.getVersion();
                    version.value = appVersion;
                }
            } catch (e) {
                console.warn('Failed to get app version:', e);
            }

            operators.value = await electron.operators.list(null);
            scriptTemplates.value = await electron.scriptTemplates.list();
        }
        if (projectStore.projects.length === 0) {
            await projectStore.fetchProjects();
        }
    } catch (e) {
        console.error('Failed to fetch local items:', e);
    }

    // 2. Handle Edit Mode / Pre-selection
    if (props.initialType && props.initialLocalId) {
        selectedType.value = props.initialType;

        // Find the item
        let foundItem = null;
        const idStr = props.initialLocalId.toString();

        if (props.initialType === 'project') {
            foundItem = projectStore.projects.find((p) => p.id.toString() === idStr);
        } else if (props.initialType === 'operator') {
            foundItem = operators.value.find((o) => o.id.toString() === idStr);
        } else if (props.initialType === 'script-template') {
            foundItem = scriptTemplates.value.find((s) => s.id.toString() === idStr);
        }

        if (foundItem) {
            selectItem(foundItem);
            currentStep.value = 'details';

            // 3. Fetch Submission Details if ID provided
            if (props.initialSubmissionId) {
                try {
                    loading.value = true;
                    const submission = await marketplaceAPI.getSubmission(
                        props.initialSubmissionId
                    );

                    // Pre-fill form from submission
                    if (submission) {
                        category.value = submission.category;
                        price.value = submission.suggestedPrice;
                        version.value = submission.clientVersion;
                        notes.value = submission.submissionNote || '';

                        if (submission.tags && Array.isArray(submission.tags)) {
                            tagsInput.value = submission.tags.join(', ');
                        }

                        // Handle images (URLs from backend)
                        // Note: submission.previewImages from API response should be string[] URLs
                        const images = (submission as any).previewImages || [];
                        if (Array.isArray(images)) {
                            previewUrls.value = images.filter((img) => typeof img === 'string');
                        }

                        // Handle Access Control
                        if (submission.accessControl) {
                            visibility.value = submission.accessControl.type;
                            if (submission.accessControl.allowedEmails) {
                                allowedEmails.value =
                                    submission.accessControl.allowedEmails.join(', ');
                            }
                            if (submission.accessControl.allowedDomains) {
                                allowedDomains.value =
                                    submission.accessControl.allowedDomains.join(', ');
                            }
                        }
                    }
                } catch (e) {
                    console.error('Failed to load submission details:', e);
                    toast.error('Failed to load previous submission details');
                } finally {
                    loading.value = false;
                }
            }
        } else {
            toast.warning(`Could not find local item with ID: ${props.initialLocalId}`);
        }
    }
});

// Computed
const isEditMode = computed(() => !!props.initialLocalId);

const projectsWithDetails = computed(() => projectStore.projects);

// Image helper
const isImageUrl = (avatar: any) => {
    if (!avatar || typeof avatar !== 'string') return false;
    return (
        avatar.startsWith('http') ||
        avatar.startsWith('data:') ||
        avatar.startsWith('file:') ||
        avatar.startsWith('/') ||
        avatar.includes('/')
    );
};

const availableItems = computed(() => {
    let list: any[] = [];
    // ... (rest of availableItems logic is unchanged, just ensuring context)
    if (selectedType.value === 'project') {
        list = projectsWithDetails.value;
    } else if (selectedType.value === 'operator') {
        list = operators.value;
    } else if (selectedType.value === 'script-template') {
        list = scriptTemplates.value;
    }

    // Filter out items already downloaded from marketplace
    // Assuming marketplaceItemId exists on Operator/ScriptTemplate as well (added in Phase 16)
    return list
        .filter((item) =>
            searchQuery.value
                ? (item.title || item.name).toLowerCase().includes(searchQuery.value.toLowerCase())
                : true
        )
        .filter((item) => !item.marketplaceItemId);
});
// ...
// Update template usages:
// Around line 493 and 531

const isFormValid = computed(() => {
    // In edit mode, we might already have previewUrls without new selectedFiles
    const hasImages =
        selectedFiles.value.length > 0 || (isEditMode.value && previewUrls.value.length > 0);
    return category.value && version.value && price.value >= 0 && hasImages;
});

// Methods
function selectType(type: ItemType) {
    selectedType.value = type;
    currentStep.value = 'item-selection';
    // Ensure we have projects loaded
    if (type === 'project' && projectStore.projects.length === 0) {
        projectStore.fetchProjects();
    }
}

function selectItem(item: any) {
    selectedItem.value = item;
    // Pre-fill only if NOT loading from submission (edit mode checks handles overwrites)
    if (!props.initialSubmissionId) {
        if (item.title) {
            // Project
            notes.value = item.description || '';
        } else if (item.name) {
            // Operator
            notes.value = item.description || '';
        }
    }
}

function handleDrop(event: DragEvent) {
    isDragging.value = false;
    const files = event.dataTransfer?.files;
    if (files) {
        processFiles(Array.from(files));
    }
}

function processFiles(files: File[]) {
    const validFiles = files.filter(
        (f) => f.type.startsWith('image/') && f.size <= 5 * 1024 * 1024
    );

    if (validFiles.length + selectedFiles.value.length > 5) {
        toast.error('Maximum 5 images allowed');
        return;
    }

    selectedFiles.value.push(...validFiles);

    validFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (e.target?.result) {
                previewUrls.value.push(e.target.result as string);
            }
        };
        reader.readAsDataURL(file);
    });
}

function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
        processFiles(Array.from(input.files));
    }
}

function removeFile(index: number) {
    selectedFiles.value.splice(index, 1);
    previewUrls.value.splice(index, 1);
}

async function submit() {
    if (!selectedItem.value || !selectedType.value) return;

    loading.value = true;
    error.value = null;

    try {
        // Prepare definition data
        let definitionData: any = {};

        if (selectedType.value === 'project') {
            // Export clean project data
            definitionData = await projectStore.exportProject(selectedItem.value.id);
            if (!definitionData) throw new Error('Failed to export project data');
        } else {
            // For Operators and Templates, usage selectedItem as the definition source
            // Ideally we should sanitize this or have a specific export method
            definitionData = { ...selectedItem.value };
        }

        // Helper to convert data URL to File
        const dataURLtoFile = (dataurl: string, filename: string) => {
            const arr = dataurl.split(',');
            const match = arr[0]?.match(/:(.*?);/);
            const mime = match ? match[1] : 'image/png';
            const bstr = atob(arr[1] || ''); // Handle undefined arr[1] case
            let n = bstr.length;
            const u8arr = new Uint8Array(n);
            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }
            return new File([u8arr], filename, { type: mime });
        };

        // Prepare icon file if avatar is available as data URI
        let iconFile: File | undefined;
        // Cast to any to access properties safely since checks are done above
        const item = selectedItem.value as any;
        const avatar = item?.avatar;

        if (avatar && typeof avatar === 'string' && avatar.startsWith('data:')) {
            try {
                iconFile = dataURLtoFile(avatar, 'icon.png');
            } catch (err) {
                console.warn('Failed to convert avatar to file:', err);
            }
        }

        const itemIdStr = item?.id ? item.id.toString() : '';

        let submissionPayload: MarketplaceSubmission = {
            itemId: itemIdStr,
            name: item.title || item.name,
            description: item.description || '',
            itemType: selectedType.value,
            category: category.value,
            suggestedPrice: price.value,
            clientVersion: version.value,
            submissionNote: notes.value,
            tags: tagsInput.value
                .split(',')
                .map((t) => t.trim())
                .filter((t) => t),
            definition: JSON.stringify(definitionData),
            previewImages: selectedFiles.value, // Only sends NEW files
            previewGraph: selectedType.value === 'project' ? definitionData : undefined,
            icon: iconFile,
            accessControl: {
                type: visibility.value,
                allowedEmails:
                    visibility.value === 'restricted'
                        ? allowedEmails.value
                              .split(',')
                              .map((e) => e.trim())
                              .filter((e) => e)
                        : [],
                allowedDomains:
                    visibility.value === 'restricted'
                        ? allowedDomains.value
                              .split(',')
                              .map((d) => d.trim())
                              .filter((d) => d)
                        : [],
            },
        };

        if (props.initialSubmissionId) {
            // Update existing submission
            await marketplaceAPI.updateSubmission(props.initialSubmissionId, submissionPayload);
            toast.success('Submission updated successfully!');
        } else {
            // Create new submission
            await marketplaceAPI.submitToMarketplace(submissionPayload);
            toast.success('Registration submitted successfully!');
        }

        emit('submitted');
    } catch (e: any) {
        console.error('Submission error:', e);
        error.value = e.response?.data?.message || e.message || 'Failed to submit';
        toast.error(error.value);
    } finally {
        loading.value = false;
    }
}

function nextStep() {
    if (currentStep.value === 'type-selection' && selectedType.value) {
        currentStep.value = 'item-selection';
    } else if (currentStep.value === 'item-selection' && selectedItem.value) {
        currentStep.value = 'details';
    }
}

function prevStep() {
    if (currentStep.value === 'details') {
        currentStep.value = 'item-selection';
    } else if (currentStep.value === 'item-selection') {
        currentStep.value = 'type-selection';
        selectedItem.value = null;
    }
}
</script>

<template>
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="emit('close')"></div>
        <div
            class="relative bg-gray-900 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl border border-gray-700"
        >
            <!-- Header -->
            <div class="p-6 border-b border-gray-800 flex justify-between items-center">
                <div>
                    <h2 class="text-xl font-bold text-white">Register to Marketplace</h2>
                    <div class="flex items-center gap-2 mt-2 text-sm">
                        <span
                            :class="
                                currentStep === 'type-selection'
                                    ? 'text-blue-400 font-bold'
                                    : 'text-gray-500'
                            "
                            >1. Type</span
                        >
                        <span class="text-gray-700">&rarr;</span>
                        <span
                            :class="
                                currentStep === 'item-selection'
                                    ? 'text-blue-400 font-bold'
                                    : 'text-gray-500'
                            "
                            >2. Select Item</span
                        >
                        <span class="text-gray-700">&rarr;</span>
                        <span
                            :class="
                                currentStep === 'details'
                                    ? 'text-blue-400 font-bold'
                                    : 'text-gray-500'
                            "
                            >3. Details</span
                        >
                    </div>
                </div>
                <button class="text-gray-400 hover:text-white" @click="emit('close')">
                    <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            <div class="flex-1 overflow-y-auto p-8">
                <!-- STEP 1: Type Selection -->
                <div
                    v-if="currentStep === 'type-selection'"
                    class="grid grid-cols-1 md:grid-cols-3 gap-6"
                >
                    <button
                        class="p-6 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-blue-500 rounded-xl text-left transition-all group"
                        @click="selectType('project')"
                    >
                        <div
                            class="p-3 bg-blue-500/20 text-blue-400 rounded-lg w-fit mb-4 group-hover:bg-blue-500 group-hover:text-white transition-colors"
                        >
                            <svg
                                class="w-8 h-8"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                />
                            </svg>
                        </div>
                        <h3 class="text-lg font-bold text-white mb-2">Project</h3>
                        <p class="text-sm text-gray-400">
                            Share complete workflows, tasks, and configurations.
                        </p>
                    </button>

                    <!-- Operator (AI Agent) -->
                    <button
                        class="relative p-4 rounded-xl border-2 transition-all duration-300 text-left group overflow-hidden"
                        :class="[
                            selectedType === 'operator'
                                ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/20'
                                : 'bg-gray-800 border-gray-700 hover:border-gray-600 hover:bg-gray-750',
                        ]"
                        @click="selectType('operator')"
                    >
                        <div
                            class="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                        ></div>
                        <div class="relative z-10">
                            <div class="flex items-center justify-between mb-3">
                                <span class="p-2 rounded-lg bg-blue-500/20 text-blue-400">
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
                                            d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                                        />
                                    </svg>
                                </span>
                                <div
                                    v-if="selectedType === 'operator'"
                                    class="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]"
                                ></div>
                            </div>
                            <h3 class="text-lg font-bold text-white mb-1">AI Operator</h3>
                            <p class="text-sm text-gray-400">
                                Share specialized AI agents and tools.
                            </p>
                        </div>
                    </button>

                    <!-- Script Template -->
                    <button
                        class="relative p-4 rounded-xl border-2 transition-all duration-300 text-left group overflow-hidden"
                        :class="[
                            selectedType === 'script-template'
                                ? 'bg-purple-600/20 border-purple-500 shadow-lg shadow-purple-500/20'
                                : 'bg-gray-800 border-gray-700 hover:border-gray-600 hover:bg-gray-750',
                        ]"
                        @click="selectType('script-template')"
                    >
                        <div
                            class="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                        ></div>
                        <div class="relative z-10">
                            <div class="flex items-center justify-between mb-3">
                                <span class="p-2 rounded-lg bg-purple-500/20 text-purple-400">
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
                                            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                                        />
                                    </svg>
                                </span>
                                <div
                                    v-if="selectedType === 'script-template'"
                                    class="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.6)]"
                                ></div>
                            </div>
                            <h3 class="text-lg font-bold text-white mb-1">Script Template</h3>
                            <p class="text-sm text-gray-400">
                                Share reusable script blocks and logic.
                            </p>
                        </div>
                    </button>
                </div>

                <!-- STEP 2: Item Selection -->
                <div v-else-if="currentStep === 'item-selection'" class="space-y-4">
                    <h3 class="text-lg font-medium text-white mb-4">
                        Select {{ selectedType === 'project' ? 'Project' : 'Item' }} to Register
                    </h3>

                    <div
                        v-if="availableItems.length === 0"
                        class="text-center py-12 bg-gray-800 rounded-xl"
                    >
                        <p class="text-gray-400">No eligible {{ selectedType }}s found.</p>
                        <p class="text-sm text-gray-500 mt-2">
                            Only items created by you (not downloaded) can be registered.
                        </p>
                    </div>

                    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div
                            v-for="item in availableItems"
                            :key="item.id"
                            class="p-4 rounded-lg border cursor-pointer transition-all flex items-start gap-3"
                            :class="
                                selectedItem?.id === item.id
                                    ? 'bg-blue-600/20 border-blue-500 ring-1 ring-blue-500'
                                    : 'bg-gray-800 border-gray-700 hover:bg-gray-750'
                            "
                            @click="selectItem(item)"
                        >
                            <div
                                class="w-10 h-10 rounded-lg flex items-center justify-center text-lg overflow-hidden shrink-0"
                                :style="{
                                    backgroundColor: item.color ? `${item.color}20` : '#374151',
                                    color: item.color || '#9CA3AF',
                                }"
                            >
                                <img
                                    v-if="isImageUrl(item.avatar)"
                                    :src="item.avatar"
                                    class="w-full h-full object-cover"
                                />
                                <span v-else>{{
                                    (item as any).emoji || (item as any).avatar || '📁'
                                }}</span>
                            </div>
                            <div>
                                <h4 class="text-white font-medium">
                                    {{ (item as any).title || (item as any).name }}
                                </h4>
                                <p class="text-sm text-gray-400 line-clamp-2">
                                    {{ item.description || 'No description' }}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- STEP 3: Details -->
                <div v-else-if="currentStep === 'details'" class="space-y-6">
                    <!-- Read Only Info -->
                    <div class="bg-gray-800 rounded-lg p-4 flex gap-4 items-center">
                        <div
                            class="w-12 h-12 rounded-lg flex items-center justify-center text-2xl overflow-hidden shrink-0"
                            :style="{
                                backgroundColor: selectedItem?.color
                                    ? `${selectedItem.color}20`
                                    : '#374151',
                                color: selectedItem?.color || '#9CA3AF',
                            }"
                        >
                            <img
                                v-if="isImageUrl(selectedItem?.avatar)"
                                :src="selectedItem.avatar"
                                class="w-full h-full object-cover"
                            />
                            <span v-else>{{
                                (selectedItem as any)?.emoji ||
                                (selectedItem as any)?.avatar ||
                                '📁'
                            }}</span>
                        </div>
                        <div>
                            <h3 class="text-white font-bold">
                                {{ (selectedItem as any)?.title || (selectedItem as any)?.name }}
                            </h3>
                            <div class="text-xs text-gray-400 mt-1">
                                Will be registered as:
                                <span class="text-blue-400 uppercase font-bold">{{
                                    selectedType
                                }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Form -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="space-y-2">
                            <label class="block text-sm font-medium text-gray-300">Category</label>
                            <select
                                v-model="category"
                                class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                            >
                                <option
                                    v-for="cat in categories"
                                    :key="cat.value"
                                    :value="cat.value"
                                >
                                    {{ cat.label }}
                                </option>
                            </select>
                        </div>
                        <div class="space-y-2">
                            <label class="block text-sm font-medium text-gray-300">
                                Price (Credits)
                                <span
                                    class="bg-blue-900 text-blue-200 text-xs px-2 py-0.5 rounded ml-2"
                                    >Coming Soon</span
                                >
                            </label>
                            <input
                                :value="0"
                                type="number"
                                disabled
                                class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-500 cursor-not-allowed focus:outline-none"
                            />
                        </div>
                    </div>

                    <div class="space-y-2">
                        <label class="block text-sm font-medium text-gray-300">Tags</label>
                        <input
                            v-model="tagsInput"
                            type="text"
                            placeholder="ai, automation, helper"
                            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                        />
                    </div>

                    <!-- Access Control Section -->
                    <div class="space-y-3 pt-4 border-t border-gray-800">
                        <h3 class="text-sm font-medium text-gray-300">
                            {{ t('marketplace.publish.access_control.title') }}
                        </h3>

                        <!-- Visibility Type -->
                        <div class="flex gap-4">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input
                                    v-model="visibility"
                                    type="radio"
                                    value="public"
                                    class="text-blue-600 focus:ring-blue-500 bg-gray-800 border-gray-700"
                                />
                                <span class="text-sm text-gray-300">{{
                                    t('marketplace.publish.access_control.public')
                                }}</span>
                            </label>
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input
                                    v-model="visibility"
                                    type="radio"
                                    value="restricted"
                                    class="text-blue-600 focus:ring-blue-500 bg-gray-800 border-gray-700"
                                />
                                <span class="text-sm text-gray-300">{{
                                    t('marketplace.publish.access_control.restricted')
                                }}</span>
                            </label>
                        </div>

                        <!-- Restricted Options -->
                        <div v-if="visibility === 'restricted'" class="space-y-3 pl-1 pt-2">
                            <!-- Allowed Emails -->
                            <div class="space-y-1">
                                <label class="block text-xs font-medium text-gray-400">{{
                                    t('marketplace.publish.access_control.emails')
                                }}</label>
                                <input
                                    v-model="allowedEmails"
                                    type="text"
                                    :placeholder="
                                        t('marketplace.publish.access_control.emails_placeholder')
                                    "
                                    class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                                />
                            </div>

                            <!-- Allowed Domains -->
                            <div class="space-y-1">
                                <label class="block text-xs font-medium text-gray-400">
                                    {{ t('marketplace.publish.access_control.domains') }}
                                    <span class="text-gray-500 font-normal ml-1"
                                        >-
                                        {{
                                            t('marketplace.publish.access_control.domains_hint')
                                        }}</span
                                    >
                                </label>
                                <input
                                    v-model="allowedDomains"
                                    type="text"
                                    :placeholder="
                                        t('marketplace.publish.access_control.domains_placeholder')
                                    "
                                    class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                        </div>
                    </div>

                    <div class="space-y-2">
                        <label class="block text-sm font-medium text-gray-300"
                            >Images (Max 5)</label
                        >
                        <div
                            class="border-2 border-dashed rounded-lg p-6 text-center transition-colors relative cursor-pointer"
                            :class="[
                                isDragging
                                    ? 'border-blue-500 bg-blue-500/10'
                                    : 'border-gray-700 hover:bg-gray-800/50',
                            ]"
                            @dragover.prevent="isDragging = true"
                            @dragleave.prevent="isDragging = false"
                            @drop.prevent="handleDrop"
                        >
                            <input
                                type="file"
                                multiple
                                accept="image/png, image/jpeg, image/webp"
                                class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                @change="handleFileSelect"
                            />
                            <div class="flex flex-col items-center gap-2 text-gray-400">
                                <span class="text-sm">Click or Drag & Drop to upload images</span>
                            </div>
                        </div>
                        <!-- Previews -->
                        <div v-if="previewUrls.length > 0" class="flex gap-2 overflow-x-auto pb-2">
                            <div
                                v-for="(url, idx) in previewUrls"
                                :key="idx"
                                class="relative group w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-800"
                            >
                                <img :src="url" class="w-full h-full object-cover" />
                                <button
                                    class="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl-lg opacity-0 group-hover:opacity-100"
                                    @click="removeFile(idx)"
                                >
                                    x
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div class="p-6 border-t border-gray-800 flex justify-between">
                <button
                    v-if="currentStep !== 'type-selection' && !isEditMode"
                    class="px-4 py-2 text-gray-400 hover:text-white"
                    @click="prevStep"
                >
                    Back
                </button>
                <div v-else></div>
                <!-- Spacer -->

                <button
                    v-if="currentStep === 'details'"
                    :disabled="loading || !isFormValid"
                    class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    @click="submit"
                >
                    <span
                        v-if="loading"
                        class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"
                    ></span>
                    {{
                        loading
                            ? 'Submitting...'
                            : initialSubmissionId
                              ? 'Update Item'
                              : 'Register Item'
                    }}
                </button>
                <button
                    v-else
                    :disabled="!selectedItem && currentStep === 'item-selection'"
                    class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50"
                    @click="nextStep"
                >
                    Next Step
                </button>
            </div>
        </div>
    </div>
</template>
