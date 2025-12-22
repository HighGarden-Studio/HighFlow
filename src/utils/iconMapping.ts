/**
 * Icon Mapping Utilities
 *
 * Maps provider/service IDs to their respective brand icons from Iconify
 * Uses Simple Icons (si:) for brand logos and Phosphor Icons (ph:) for generic icons
 */

/**
 * Get Iconify icon name for a provider/service by ID
 * @param providerId - The ID of the provider/service
 * @returns Iconify icon name (e.g., 'si:openai', 'ph:robot')
 */
export function getProviderIcon(providerId: string): string {
    const providerIconMap: Record<string, string> = {
        // AI Providers - use logos prefix for brands
        openai: 'logos:openai-icon',
        anthropic: 'logos:claude-icon',
        google: 'logos:google-icon',
        'azure-openai': 'logos:microsoft-azure',
        mistral: 'logos:mistral-ai-icon',
        cohere: 'simple-icons:cohere', // Not in logos, keep simple-icons
        groq: 'simple-icons:groq', // Not in logos, keep simple-icons
        perplexity: 'ph:question',
        together: 'ph:stack',
        fireworks: 'ph:fire',
        deepseek: 'ph:binoculars',
        huggingface: 'logos:huggingface-icon',
        replicate: 'simple-icons:replicate', // Not in logos
        openrouter: 'ph:router',
        // Local Providers
        ollama: 'simple-icons:ollama', // Not in logos
        lmstudio: 'ph:desktop',
        // Chinese Providers
        zhipu: 'ph:robot',
        moonshot: 'ph:moon',
        qwen: 'logos:alibaba-cloud',
        baidu: 'logos:baidu',
        // Dev Tools & MCP
        filesystem: 'ph:folder',
        git: 'logos:git-icon',
        github: 'logos:github-icon',
        gitlab: 'logos:gitlab',
        slack: 'logos:slack-icon',
        postgres: 'logos:postgresql',
        postgresql: 'logos:postgresql',
        sqlite: 'logos:sqlite',
        puppeteer: 'logos:puppeteer',
        playwright: 'logos:playwright',
        brave_search: 'logos:brave',
        'brave-search': 'logos:brave',
        google_maps: 'logos:google-maps',
        'google-maps': 'logos:google-maps',
        memory: 'ph:brain',
        fetch: 'ph:download',
        sequential_thinking: 'ph:brain',
        'sequential-thinking': 'ph:brain',
        everything: 'ph:magnifying-glass',
        // Local Agents
        'claude-code': 'logos:claude-icon',
        codex: 'logos:openai-icon',
        antigravity: 'custom:highflow-logo',
        // Default HighFlow
        'default-highflow': 'custom:highflow-logo',
    };

    // If the providerId already looks like an icon string (has colon), return it as is
    if (providerId.includes(':')) {
        return providerId;
    }

    const normalizedId = providerId.toLowerCase();
    return providerIconMap[normalizedId] || 'ph:cube';
}

/**
 * Get file icon for script languages
 * Uses logos prefix for file type icons
 * @param language - The script language
 * @returns Iconify icon name for the language
 */
export function getScriptLanguageIcon(language: string): string {
    const languageIconMap: Record<string, string> = {
        javascript: 'logos:javascript',
        typescript: 'logos:typescript-icon',
        python: 'logos:python',
    };

    return languageIconMap[language] || 'vscode-icons:file-type-text';
}
