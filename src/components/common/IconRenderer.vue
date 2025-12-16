<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import HighFlowLogo from '../../assets/logo/highflow_logo.svg';

/**
 * IconRenderer - Emoji to Iconify SVG Icon Mapper
 *
 * Automatically converts emoji strings to modern Phosphor Icons
 * Usage: <IconRenderer emoji="🖼️" class="w-5 h-5" />
 */

const props = defineProps<{
    emoji?: string;
    icon?: string; // Direct Iconify icon name (e.g., 'si:openai', 'ph:robot')
}>();

// Custom icons map
const CUSTOM_ICONS: Record<string, string> = {
    'custom:highflow-logo': HighFlowLogo,
};

// Emoji to Iconify icon mapping (Phosphor Icons + Logos for brands)
const ICON_MAP: Record<string, string> = {
    // AI & Tech - Generic (used in general context, not brand-specific)
    '🤖': 'ph:robot', // Generic robot/AI icon
    '🧠': 'ph:brain',
    '🔷': 'ph:diamond',

    // AI Providers - Brand Icons (Logos) - use colored circles
    '🟢': 'logos:openai-icon', // OpenAI (green circle → OpenAI logo)
    '🟣': 'logos:claude-icon', // Anthropic/Claude (purple circle → Claude logo)
    '🔵': 'logos:google-icon', // Google/Gemini (blue circle → Google logo)
    '⚪': 'ph:circle', // Generic/None
    '💻': 'logos:visual-studio-code', // VS Code / Code editors
    '🚀': 'custom:highflow-logo', // Antigravity (Rocket -> HighFlow Logo)
    '🏠': 'ph:house', // Local

    // File Types & Documents
    '📄': 'ph:file-text',
    '📁': 'ph:folder',
    '📂': 'ph:folder-open',
    '📝': 'ph:note-pencil',
    '🖼️': 'ph:image',
    '🎬': 'ph:film-strip',
    '🎵': 'ph:music-note',
    '🎨': 'ph:palette',
    '📊': 'ph:chart-bar',
    '📦': 'ph:package',
    '🗂️': 'ph:files',
    '🗄️': 'ph:database',
    '📜': 'ph:scroll',
    '🔀': 'ph:git-diff',
    '📋': 'ph:clipboard',
    '📅': 'ph:calendar',
    '🗓️': 'ph:calendar-blank',
    '📭': 'ph:mailbox',

    // Web & Network
    '🌐': 'ph:globe',
    '☁️': 'ph:cloud',
    '🌪️': 'ph:tornado',
    '🔗': 'ph:link', // Generic link icon (not Git)

    // Integration Services (using brand icons where available)
    '💬': 'logos:slack-icon', // Slack
    '🎮': 'logos:discord-icon', // Discord
    '📚': 'logos:git-icon', // Git
    // ☁️ already mapped above to ph:cloud, using for Google Drive context
    '🔔': 'ph:bell', // Webhooks/Notifications

    // Actions & Symbols
    '⚡': 'ph:lightning',
    '🔮': 'ph:crystal-ball',
    '🎯': 'ph:target',
    '💡': 'ph:lightbulb',
    '⚙️': 'ph:gear',
    '⚠️': 'ph:warning',
    '🛠️': 'ph:wrench',
    '🏗️': 'ph:buildings',
    '✨': 'ph:sparkle',
    '🔍': 'ph:magnifying-glass',
    '🌊': 'ph:waves',
    '✅': 'ph:check-circle',
    '🕐': 'ph:clock',
    '👤': 'ph:user',
    '🖥️': 'ph:monitor',
    '💚': 'ph:heart',

    // Default fallback
    '❓': 'ph:question',
};

// If icon prop is provided directly, use it; otherwise map from emoji
const iconName = computed<string>(() => {
    if (props.icon) return props.icon;
    if (props.emoji) return ICON_MAP[props.emoji] || ICON_MAP['❓'] || 'ph:question';
    return ICON_MAP['❓'] || 'ph:question';
});

const isCustomIcon = computed(() => {
    return iconName.value.startsWith('custom:');
});

const customIconSrc = computed(() => {
    return CUSTOM_ICONS[iconName.value] || '';
});
</script>

<template>
    <img v-if="isCustomIcon" :src="customIconSrc" alt="icon" />
    <Icon v-else :icon="iconName" />
</template>
