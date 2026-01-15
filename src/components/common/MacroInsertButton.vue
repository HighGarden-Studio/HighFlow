<script setup lang="ts">
/**
 * MacroInsertButton Component
 *
 * 프롬프트에 매크로를 삽입할 수 있는 드롭다운 버튼
 */
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import IconRenderer from './IconRenderer.vue';
import { MacroParser } from '../../services/workflow/MacroParser';

interface Props {
    dependentTaskIds?: number[];
    variables?: string[];
    disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    dependentTaskIds: () => [],
    variables: () => [],
    disabled: false,
});

const { t } = useI18n();

const emit = defineEmits<{
    (e: 'insert', macro: string): void;
}>();

const isOpen = ref(false);
const searchQuery = ref('');

// 매크로 제안 목록 생성
const suggestions = computed(() => {
    return MacroParser.getSuggestions(props.dependentTaskIds, props.variables);
});

// 카테고리별 그룹화
const groupedSuggestions = computed(() => {
    const filtered = suggestions.value.filter(
        (s) =>
            s.macro.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
            s.description.toLowerCase().includes(searchQuery.value.toLowerCase())
    );

    return {
        dependency: filtered.filter((s) => s.category === 'dependency'),
        context: filtered.filter((s) => s.category === 'context'),
        system: filtered.filter((s) => s.category === 'system'),
    };
});

const hasDependencies = computed(() => props.dependentTaskIds.length > 0);

function toggleDropdown() {
    if (!props.disabled) {
        isOpen.value = !isOpen.value;
        if (isOpen.value) {
            searchQuery.value = '';
        }
    }
}

function insertMacro(macro: string) {
    emit('insert', macro);
    isOpen.value = false;
}

function closeDropdown() {
    isOpen.value = false;
}
</script>

<template>
    <div class="macro-insert-container relative inline-block" @click.stop>
        <!-- 트리거 버튼 -->
        <button
            type="button"
            :disabled="disabled"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all"
            :class="[
                disabled
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                    : isOpen
                      ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400',
            ]"
            @click="toggleDropdown"
        >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                />
            </svg>
            <span>{{ t('task.macro.button_label') }}</span>
            <svg
                class="w-4 h-4 transition-transform"
                :class="{ 'rotate-180': isOpen }"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 9l-7 7-7-7"
                />
            </svg>
        </button>

        <!-- 드롭다운 메뉴 -->
        <Teleport to="body">
            <div v-if="isOpen" class="fixed inset-0 z-50" @click="closeDropdown">
                <div
                    class="absolute z-50 mt-2 w-80 max-h-96 overflow-hidden bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700"
                    :style="{
                        top: ($el as HTMLElement)?.getBoundingClientRect().bottom + 'px',
                        left: ($el as HTMLElement)?.getBoundingClientRect().left + 'px',
                    }"
                    @click.stop
                >
                    <!-- 검색 -->
                    <div class="p-3 border-b border-gray-200 dark:border-gray-700">
                        <input
                            v-model="searchQuery"
                            type="text"
                            :placeholder="t('task.macro.search_placeholder')"
                            class="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                    </div>

                    <!-- 매크로 목록 -->
                    <div class="max-h-72 overflow-y-auto">
                        <!-- 의존성 매크로 -->
                        <div v-if="groupedSuggestions.dependency.length > 0" class="p-2">
                            <div
                                class="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase"
                            >
                                {{ t('task.macro.dep_result_title') }}
                            </div>
                            <button
                                v-for="suggestion in groupedSuggestions.dependency"
                                :key="suggestion.macro"
                                type="button"
                                class="w-full px-3 py-2 text-left rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors group"
                                @click="insertMacro(suggestion.macro)"
                            >
                                <div class="flex items-center justify-between">
                                    <code
                                        class="text-sm font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/50 px-1.5 py-0.5 rounded"
                                    >
                                        {{ suggestion.macro }}
                                    </code>
                                    <span
                                        class="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        {{ t('task.macro.insert_click') }}
                                    </span>
                                </div>
                                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {{ suggestion.description }}
                                </p>
                            </button>
                        </div>

                        <!-- 의존성 없음 안내 -->
                        <div
                            v-else-if="!hasDependencies && searchQuery === ''"
                            class="p-4 text-center"
                        >
                            <div class="text-center py-8">
                                <IconRenderer emoji="🔗" class="w-12 h-12 mx-auto mb-2" />
                                <p class="text-sm text-gray-400">
                                    {{ t('task.macro.no_available') }}
                                </p>
                            </div>
                        </div>

                        <!-- 컨텍스트 변수 -->
                        <div
                            v-if="groupedSuggestions.context.length > 0"
                            class="p-2 border-t border-gray-100 dark:border-gray-700"
                        >
                            <div
                                class="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase"
                            >
                                {{ t('task.macro.context_title') }}
                            </div>
                            <button
                                v-for="suggestion in groupedSuggestions.context"
                                :key="suggestion.macro"
                                type="button"
                                class="w-full px-3 py-2 text-left rounded-lg hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors group"
                                @click="insertMacro(suggestion.macro)"
                            >
                                <div class="flex items-center justify-between">
                                    <code
                                        class="text-sm font-mono text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/50 px-1.5 py-0.5 rounded"
                                    >
                                        {{ suggestion.macro }}
                                    </code>
                                </div>
                                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {{ suggestion.description }}
                                </p>
                            </button>
                        </div>

                        <!-- 시스템 매크로 -->
                        <div
                            v-if="groupedSuggestions.system.length > 0"
                            class="p-2 border-t border-gray-100 dark:border-gray-700"
                        >
                            <div
                                class="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase"
                            >
                                {{ t('task.macro.system_title') }}
                            </div>
                            <button
                                v-for="suggestion in groupedSuggestions.system"
                                :key="suggestion.macro"
                                type="button"
                                class="w-full px-3 py-2 text-left rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
                                @click="insertMacro(suggestion.macro)"
                            >
                                <div class="flex items-center justify-between">
                                    <code
                                        class="text-sm font-mono text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded"
                                    >
                                        {{ suggestion.macro }}
                                    </code>
                                </div>
                                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {{ suggestion.description }}
                                </p>
                            </button>
                        </div>

                        <!-- 검색 결과 없음 -->
                        <div
                            v-if="
                                searchQuery &&
                                groupedSuggestions.dependency.length === 0 &&
                                groupedSuggestions.context.length === 0 &&
                                groupedSuggestions.system.length === 0
                            "
                            class="p-4 text-center text-sm text-gray-500 dark:text-gray-400"
                        >
                            {{ t('task.macro.empty_search') }}
                        </div>
                    </div>

                    <!-- 도움말 -->
                    <div
                        class="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50"
                    >
                        <p class="text-xs text-gray-500 dark:text-gray-400">
                            <span v-html="t('task.macro.tip')"></span>
                            <code
                                class="bg-gray-200 dark:bg-gray-700 px-1 rounded"
                                v-pre
                                >{{task.23}}</code
                            >
                            {{ t('common.or') }}
                            <code
                                class="bg-gray-200 dark:bg-gray-700 px-1 rounded"
                                v-pre
                                >{{prev.1}}</code
                            >
                        </p>
                    </div>
                </div>
            </div>
        </Teleport>
    </div>
</template>
