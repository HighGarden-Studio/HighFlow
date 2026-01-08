<script setup lang="ts">
import { helpDocs } from '../../renderer/data/helpDocs';
import HelpMarkdownRenderer from '../common/HelpMarkdownRenderer.vue';
</script>

<template>
    <div class="space-y-6">
        <section>
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8">
                <HelpMarkdownRenderer :content="helpDocs" />
            </div>
        </section>
    </div>
</template>
