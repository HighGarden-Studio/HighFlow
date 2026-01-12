<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { helpDocs } from '../../renderer/data/helpDocs';
import HelpMarkdownRenderer from '../common/HelpMarkdownRenderer.vue';

const { locale } = useI18n();

const content = computed(() => {
    const lang = locale.value === 'ko' ? 'ko' : 'en';
    return helpDocs[lang] || helpDocs.en;
});
</script>

<template>
    <div class="space-y-6">
        <section>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8">
                <HelpMarkdownRenderer :content="content" />
            </div>
        </section>
    </div>
</template>
