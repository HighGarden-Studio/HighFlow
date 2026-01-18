<script setup lang="ts">
/**
 * Credits Tab
 *
 * 사용자의 크레딧 잔액 및 거래 내역을 표시하는 Settings 탭 컴포넌트
 */

import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '../../renderer/stores/userStore';
import { creditsAPI, type LedgerEntry, type TransactionType } from '../../renderer/api/credits';

const { t, locale } = useI18n();

const userStore = useUserStore();

// State
const ledgerEntries = ref<LedgerEntry[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);
const currentPage = ref(0);
const hasMore = ref(true);
const pageSize = 50;

// Filters
const selectedDateRange = ref<'7d' | '30d' | '90d' | 'all'>('30d');
const selectedTypes = ref<TransactionType[]>([]);

// Available transaction types
const transactionTypes = computed<{ value: TransactionType; label: string }[]>(() => [
    { value: 'signup_bonus', label: t('settings.credits.types.signup_bonus') },
    { value: 'admin_topup', label: t('settings.credits.types.admin_topup') },
    { value: 'workflow_execution', label: t('settings.credits.types.workflow_execution') },
    { value: 'marketplace_purchase', label: t('settings.credits.types.marketplace_purchase') },
    { value: 'execution_refund', label: t('settings.credits.types.execution_refund') },
    { value: 'execution_adjustment', label: t('settings.credits.types.execution_adjustment') },
]);

// Computed
const filteredEntries = computed(() => {
    let entries = ledgerEntries.value;

    // 날짜 필터
    if (selectedDateRange.value !== 'all') {
        const now = new Date();
        const cutoffDate = new Date();

        switch (selectedDateRange.value) {
            case '7d':
                cutoffDate.setDate(now.getDate() - 7);
                break;
            case '30d':
                cutoffDate.setDate(now.getDate() - 30);
                break;
            case '90d':
                cutoffDate.setDate(now.getDate() - 90);
                break;
        }

        entries = entries.filter((entry) => new Date(entry.createdAt) >= cutoffDate);
    }

    // 거래 유형 필터
    if (selectedTypes.value.length > 0) {
        entries = entries.filter((entry) => selectedTypes.value.includes(entry.type));
    }

    return entries;
});

// Actions
async function loadLedger(append = false) {
    if (isLoading.value) return;

    isLoading.value = true;
    error.value = null;

    try {
        const startDate = getStartDateForRange();
        const result = await creditsAPI.getLedger({
            limit: pageSize,
            offset: append ? ledgerEntries.value.length : 0,
            startDate: startDate ? startDate.toISOString() : undefined,
        });

        if (append) {
            ledgerEntries.value = [...ledgerEntries.value, ...result.entries];
        } else {
            ledgerEntries.value = result.entries;
            currentPage.value = 0;
        }

        hasMore.value = result.hasMore;
    } catch (err: any) {
        console.error('Failed to load ledger:', err);
        error.value =
            err.response?.data?.message || err.message || t('settings.credits.error_loading');
    } finally {
        isLoading.value = false;
    }
}

function getStartDateForRange(): Date | null {
    if (selectedDateRange.value === 'all') return null;

    const now = new Date();
    const cutoffDate = new Date();

    switch (selectedDateRange.value) {
        case '7d':
            cutoffDate.setDate(now.getDate() - 7);
            break;
        case '30d':
            cutoffDate.setDate(now.getDate() - 30);
            break;
        case '90d':
            cutoffDate.setDate(now.getDate() - 90);
            break;
    }

    return cutoffDate;
}

async function loadMore() {
    if (!hasMore.value || isLoading.value) return;
    await loadLedger(true);
}

async function handleFilterChange() {
    await loadLedger(false);
}

function toggleTypeFilter(type: TransactionType) {
    const index = selectedTypes.value.indexOf(type);
    if (index === -1) {
        selectedTypes.value.push(type);
    } else {
        selectedTypes.value.splice(index, 1);
    }
}

// Helpers
function getTypeColor(type: TransactionType): string {
    const colors: Record<TransactionType, string> = {
        signup_bonus: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
        admin_topup: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        workflow_execution:
            'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
        marketplace_purchase:
            'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
        execution_refund: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
        execution_adjustment: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    };
    return colors[type] || 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
}

function getTypeLabel(type: TransactionType): string {
    return t(`settings.credits.types.${type}`);
}

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(locale.value, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function formatAmount(amount: number): string {
    const sign = amount >= 0 ? '+' : '';
    return `${sign}${amount.toLocaleString()}`;
}

// Lifecycle
onMounted(async () => {
    await loadLedger();
});
</script>

<template>
    <div class="space-y-6">
        <!-- 크레딧 잔액 카드 -->
        <section>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                {{ t('settings.credits.balance_title') }}
            </h2>
            <div class="bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg p-6 shadow-lg">
                <div class="text-white">
                    <p class="text-sm opacity-90 mb-2">
                        {{ t('settings.credits.available_credits') }}
                    </p>
                    <p class="text-4xl font-bold mb-1">
                        {{ userStore.creditBalance.toLocaleString() }}
                    </p>
                    <p class="text-sm opacity-75">{{ t('settings.credits.unit') }}</p>
                </div>
            </div>
        </section>

        <!-- 거래 내역 -->
        <section>
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {{ t('settings.credits.transaction_history') }}
                </h2>
                <button
                    :disabled="isLoading"
                    class="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                    @click="loadLedger(false)"
                >
                    <svg
                        class="w-4 h-4 inline-block mr-1"
                        :class="{ 'animate-spin': isLoading }"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                    </svg>
                    {{ t('settings.credits.refresh') }}
                </button>
            </div>

            <!-- 필터 -->
            <div class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm mb-4">
                <div class="flex flex-wrap gap-4">
                    <!-- 날짜 필터 -->
                    <div>
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                        >
                            {{ t('settings.credits.filter_period') }}
                        </label>
                        <select
                            v-model="selectedDateRange"
                            class="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                            @change="handleFilterChange"
                        >
                            <option value="7d">{{ t('settings.credits.period_7d') }}</option>
                            <option value="30d">{{ t('settings.credits.period_30d') }}</option>
                            <option value="90d">{{ t('settings.credits.period_90d') }}</option>
                            <option value="all">{{ t('settings.credits.period_all') }}</option>
                        </select>
                    </div>

                    <!-- 거래 유형 필터 -->
                    <div class="flex-1">
                        <label
                            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                        >
                            {{ t('settings.credits.filter_type') }}
                        </label>
                        <div class="flex flex-wrap gap-2">
                            <button
                                v-for="type in transactionTypes"
                                :key="type.value"
                                :class="[
                                    'px-3 py-1 rounded-full text-xs font-medium transition-all',
                                    selectedTypes.includes(type.value)
                                        ? getTypeColor(type.value) +
                                          ' ring-2 ring-offset-1 ring-blue-500'
                                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600',
                                ]"
                                @click="toggleTypeFilter(type.value)"
                            >
                                {{ type.label }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 에러 메시지 -->
            <div
                v-if="error"
                class="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
            >
                <p class="text-sm text-red-700 dark:text-red-300">{{ error }}</p>
            </div>

            <!-- 거래 내역 테이블 -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                <!-- 로딩 스피너 -->
                <div v-if="isLoading && ledgerEntries.length === 0" class="p-12 text-center">
                    <svg
                        class="w-8 h-8 mx-auto animate-spin text-blue-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            class="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            stroke-width="4"
                        />
                        <path
                            class="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                    </svg>
                    <p class="mt-3 text-sm text-gray-500 dark:text-gray-400">
                        {{ t('settings.credits.loading_history') }}
                    </p>
                </div>

                <!-- 빈 상태 -->
                <div
                    v-else-if="!isLoading && filteredEntries.length === 0"
                    class="p-12 text-center"
                >
                    <svg
                        class="w-16 h-16 mx-auto text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                    </svg>
                    <p class="mt-4 text-gray-500 dark:text-gray-400">
                        {{ t('settings.credits.no_history') }}
                    </p>
                </div>

                <!-- 테이블 -->
                <div v-else class="overflow-x-auto">
                    <table class="w-full">
                        <thead class="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                                <th
                                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                                >
                                    {{ t('settings.credits.th_date') }}
                                </th>
                                <th
                                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                                >
                                    {{ t('settings.credits.th_type') }}
                                </th>
                                <th
                                    class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                                >
                                    {{ t('settings.credits.th_description') }}
                                </th>
                                <th
                                    class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                                >
                                    {{ t('settings.credits.th_change') }}
                                </th>
                                <th
                                    class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                                >
                                    {{ t('settings.credits.th_balance') }}
                                </th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                            <tr
                                v-for="entry in filteredEntries"
                                :key="entry.id"
                                class="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                            >
                                <td
                                    class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100"
                                >
                                    {{ formatDate(entry.createdAt) }}
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <span
                                        :class="[
                                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                                            getTypeColor(entry.type),
                                        ]"
                                    >
                                        {{ getTypeLabel(entry.type) }}
                                    </span>
                                </td>
                                <td class="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                    <div v-if="entry.metadata?.workflowName">
                                        {{ entry.metadata.workflowName }}
                                    </div>
                                    <div v-else-if="entry.metadata?.note">
                                        {{ entry.metadata.note }}
                                    </div>
                                    <div v-else class="text-gray-400 dark:text-gray-500 italic">
                                        -
                                    </div>
                                </td>
                                <td
                                    class="px-6 py-4 whitespace-nowrap text-sm text-right font-medium"
                                    :class="
                                        entry.amount >= 0
                                            ? 'text-green-600 dark:text-green-400'
                                            : 'text-red-600 dark:text-red-400'
                                    "
                                >
                                    {{ formatAmount(entry.amount) }}
                                </td>
                                <td
                                    class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 text-right font-medium"
                                >
                                    {{ entry.balanceAfter.toLocaleString() }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <!-- Load More 버튼 -->
                <div
                    v-if="hasMore && filteredEntries.length > 0"
                    class="p-4 border-t border-gray-200 dark:border-gray-700 text-center"
                >
                    <button
                        :disabled="isLoading"
                        class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        @click="loadMore"
                    >
                        <span v-if="isLoading">{{ t('settings.credits.loading') }}</span>
                        <span v-else>{{ t('settings.credits.load_more') }}</span>
                    </button>
                </div>
            </div>
        </section>
    </div>
</template>
