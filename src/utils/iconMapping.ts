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
        // AI Providers - use simple-icons prefix for brands
        openai: 'simple-icons:openai',
        anthropic: 'simple-icons:anthropic',
        google: 'simple-icons:google',
        'azure-openai': 'simple-icons:microsoftazure',
        mistral: 'simple-icons:mistral',
        cohere: 'simple-icons:cohere',
        groq: 'simple-icons:groq',
        perplexity: 'ph:question',
        together: 'ph:stack',
        fireworks: 'ph:fire',
        deepseek: 'ph:binoculars',
        huggingface: 'simple-icons:huggingface',
        replicate: 'simple-icons:replicate',
        openrouter: 'ph:router',
        // Local Providers
        ollama: 'simple-icons:ollama',
        lmstudio: 'ph:desktop',
        // Chinese Providers
        zhipu: 'ph:robot',
        moonshot: 'ph:moon',
        qwen: 'simple-icons:alibabadotcom',
        baidu: 'simple-icons:baidu',
        // Dev Tools & MCP
        filesystem: 'ph:folder',
        git: 'simple-icons:git',
        github: 'simple-icons:github',
        gitlab: 'simple-icons:gitlab',
        slack: 'simple-icons:slack',
        postgres: 'simple-icons:postgresql',
        postgresql: 'simple-icons:postgresql',
        sqlite: 'simple-icons:sqlite',
        puppeteer: 'simple-icons:puppeteer',
        playwright: 'simple-icons:playwright',
        brave_search: 'simple-icons:brave',
        'brave-search': 'simple-icons:brave',
        google_maps: 'simple-icons:googlemaps',
        'google-maps': 'simple-icons:googlemaps',
        memory: 'ph:brain',
        fetch: 'ph:download',
        sequential_thinking: 'ph:brain',
        'sequential-thinking': 'ph:brain',
        everything: 'ph:magnifying-glass',
        // Local Agents
        'claude-code': 'simple-icons:anthropic',
        codex: 'simple-icons:openai',
        antigravity: 'simple-icons:google',
    };

    return providerIconMap[providerId] || 'ph:cube';
}

/**
 * Get file icon for script languages
 * Uses vscode-icons prefix for file type icons
 * @param language - The script language
 * @returns Iconify icon name for the language
 */
export function getScriptLanguageIcon(language: string): string {
    const languageIconMap: Record<string, string> = {
        javascript: 'vscode-icons:file-type-js-official',
        typescript: 'vscode-icons:file-type-typescript-official',
        python: 'vscode-icons:file-type-python',
    };

    return languageIconMap[language] || 'vscode-icons:file-type-text';
}
