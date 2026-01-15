<script setup lang="ts">
/**
 * Marketplace Publish Modal
 * Allows users to publish projects/templates to the marketplace with image attachments.
 */
import { ref, computed, onMounted } from 'vue';
import { marketplaceAPI } from '../../api/marketplace';
import type { MarketplaceCategory, ItemType } from '../../../core/types/marketplace';
import { useToast } from 'vue-toastification';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps<{
    show: boolean;
    initialData?: {
        workflowId: string;
        title: string;
        description: string;
        itemType: ItemType;
    };
}>();

const emit = defineEmits(['close', 'submitted']);
const toast = useToast();

const loading = ref(false);
const error = ref<string | null>(null);

// Form Data
const category = ref<MarketplaceCategory>('other');
const price = ref(0);
const version = ref('1.0.0');
const notes = ref('');
const selectedFiles = ref<File[]>([]);
const previewUrls = ref<string[]>([]);
const tagsInput = ref('');
// Access Control
const visibility = ref<'public' | 'restricted'>('public');
const allowedEmails = ref('');
const allowedDomains = ref('');

// Computed
const isValid = computed(() => {
    return (
        category.value &&
        version.value &&
        price.value >= 0 &&
        selectedFiles.value.length > 0 && // Require at least one image? Maybe optional. Handover says optional.
        // Let's make it optional based on handover doc "No" for required
        true
    );
});

// Categories (synced with types/marketplace.ts)
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

// Methods
function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) {
        const files = Array.from(input.files);
        // Validations (max 5 files, image types)
        const validFiles = files.filter(
            (f) => f.type.startsWith('image/') && f.size <= 5 * 1024 * 1024
        ); // 5MB limit

        if (validFiles.length + selectedFiles.value.length > 5) {
            toast.error('Maximum 5 images allowed');
            return;
        }

        selectedFiles.value.push(...validFiles);

        // Generate previews
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
}

function removeFile(index: number) {
    selectedFiles.value.splice(index, 1);
    previewUrls.value.splice(index, 1);
}

function close() {
    emit('close');
    // Reset form?
}

async function submit() {
    if (!props.initialData?.workflowId) return;

    loading.value = true;
    error.value = null;

    try {
        const tags = tagsInput.value
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t);

        // Process Access Control
        const emailList = allowedEmails.value
            .split(',')
            .map((e) => e.trim())
            .filter((e) => e);
        const domainList = allowedDomains.value
            .split(',')
            .map((d) => d.trim())
            .filter((d) => d);

        const accessControl = {
            type: visibility.value,
            allowedEmails: visibility.value === 'restricted' ? emailList : [],
            allowedDomains: visibility.value === 'restricted' ? domainList : [],
        };

        await marketplaceAPI.submitToMarketplace({
            itemId: props.initialData.workflowId,
            name: props.initialData.title,
            description: props.initialData.description,
            itemType: props.initialData.itemType,
            category: category.value,
            suggestedPrice: price.value,
            clientVersion: version.value,
            submissionNote: notes.value,
            tags: tags,
            accessControl: accessControl,
            previewImages: selectedFiles.value,
            // previewGraph: TODO: capture graph state if possible, currently optional
        });

        toast.success('Successfully submitted to marketplace!');
        emit('submitted');
        close();
    } catch (e: any) {
        console.error('Submission failed:', e);
        error.value = e.response?.data?.message || e.message || 'Failed to submit';
        toast.error('Submission failed: ' + error.value);
    } finally {
        loading.value = false;
    }
}

onMounted(async () => {
    try {
        if (window.electron?.app) {
            const appVersion = await window.electron.app.getVersion();
            version.value = appVersion;
        }
    } catch (e) {
        console.warn('Failed to get app version:', e);
    }
});
</script>

<template>
    <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="close"></div>

        <!-- Modal -->
        <div
            class="relative bg-gray-900 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl border border-gray-700"
        >
            <!-- Header -->
            <div class="flex items-center justify-between p-6 border-b border-gray-800">
                <h2 class="text-xl font-bold text-white">{{ t('marketplace.publish.title') }}</h2>
                <button @click="close" class="text-gray-400 hover:text-white transition-colors">
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
            <div class="flex-1 overflow-y-auto p-6 space-y-6">
                <!-- Info Section -->
                <div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex gap-3">
                    <div class="text-blue-400">
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                        </svg>
                    </div>
                    <div class="text-sm text-blue-200">
                        You are submitting <strong>{{ initialData?.title }}</strong
                        >. It will be reviewed before appearing in the public marketplace.
                    </div>
                </div>

                <!-- Form Grid -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <!-- Category -->
                    <div class="space-y-2">
                        <label class="block text-sm font-medium text-gray-300">Category</label>
                        <select
                            v-model="category"
                            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                        >
                            <option v-for="cat in categories" :key="cat.value" :value="cat.value">
                                {{ cat.label }}
                            </option>
                        </select>
                    </div>

                    <!-- Price -->
                    <div class="space-y-2">
                        <label class="block text-sm font-medium text-gray-300"
                            >Price (Credits)</label
                        >
                        <input
                            v-model.number="price"
                            type="number"
                            min="0"
                            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                        />
                        <p class="text-xs text-gray-500">Set 0 for free items.</p>
                    </div>

                    <!-- Version -->
                    <div class="space-y-2">
                        <label class="block text-sm font-medium text-gray-300">Version</label>
                        <input
                            v-model="version"
                            type="text"
                            placeholder="1.0.0"
                            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                        />
                    </div>

                    <!-- Tags -->
                    <div class="space-y-2">
                        <label class="block text-sm font-medium text-gray-300">Tags</label>
                        <input
                            v-model="tagsInput"
                            type="text"
                            placeholder="ai, automation, helper (comma separated)"
                            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                        />
                    </div>
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
                                type="radio"
                                v-model="visibility"
                                value="public"
                                class="text-blue-600 focus:ring-blue-500 bg-gray-800 border-gray-700"
                            />
                            <span class="text-sm text-gray-300">{{
                                t('marketplace.publish.access_control.public')
                            }}</span>
                        </label>
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input
                                type="radio"
                                v-model="visibility"
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
                                    {{ t('marketplace.publish.access_control.domains_hint') }}</span
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

                <!-- Notes -->
                <div class="space-y-2">
                    <label class="block text-sm font-medium text-gray-300"
                        >Submission Notes (Optional)</label
                    >
                    <textarea
                        v-model="notes"
                        rows="3"
                        placeholder="Notes for the reviewer..."
                        class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none resize-none"
                    ></textarea>
                </div>

                <!-- Image Upload -->
                <div class="space-y-2">
                    <label class="block text-sm font-medium text-gray-300">Preview Images</label>
                    <div
                        class="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center hover:bg-gray-800/50 transition-colors relative cursor-pointer"
                    >
                        <input
                            type="file"
                            multiple
                            accept="image/png, image/jpeg, image/webp"
                            @change="handleFileSelect"
                            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <div class="flex flex-col items-center gap-2 text-gray-400">
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
                                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                                />
                            </svg>
                            <span class="text-sm">Click to upload or drag and drop</span>
                            <span class="text-xs text-gray-500"
                                >PNG, JPG, WEBP up to 5MB (Max 5)</span
                            >
                        </div>
                    </div>

                    <!-- Previews -->
                    <div v-if="previewUrls.length > 0" class="grid grid-cols-5 gap-2 mt-4">
                        <div
                            v-for="(url, idx) in previewUrls"
                            :key="idx"
                            class="relative group aspect-square rounded-lg overflow-hidden bg-gray-800 border border-gray-700"
                        >
                            <img :src="url" class="w-full h-full object-cover" />
                            <button
                                @click="removeFile(idx)"
                                class="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                            >
                                <svg
                                    class="w-3 h-3"
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
                    </div>
                </div>

                <!-- Error Message -->
                <div v-if="error" class="bg-red-500/10 text-red-400 p-3 rounded-lg text-sm">
                    {{ error }}
                </div>
            </div>

            <!-- Footer -->
            <div class="p-6 border-t border-gray-800 flex justify-end gap-3">
                <button
                    @click="close"
                    class="px-4 py-2 text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                    Cancel
                </button>
                <button
                    @click="submit"
                    :disabled="loading || !isValid"
                    class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    <span
                        v-if="loading"
                        class="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"
                    ></span>
                    {{ loading ? 'Publishing...' : 'Publish' }}
                </button>
            </div>
        </div>
    </div>
</template>
