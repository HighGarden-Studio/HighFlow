/**
 * AI Operator Role Presets
 *
 * Pre-defined roles with optimized system prompts for common use cases
 */

export interface RolePreset {
    id: string;
    name: string;
    emoji: string;
    description: string;
    systemPromptId: string;
    recommendedModel: string;
    recommendedProvider: string;
}

export const ROLE_PRESETS: RolePreset[] = [
    {
        id: 'senior-developer',
        name: 'Senior Developer',
        emoji: '👨‍💻',
        description: 'Experienced full-stack developer focused on code quality and architecture',
        recommendedProvider: 'anthropic',
        recommendedModel: 'claude-3-5-sonnet-20241022',
        systemPromptId: 'roles/senior-developer',
    },
    {
        id: 'qa-specialist',
        name: 'QA Specialist',
        emoji: '🔍',
        description: 'Quality assurance expert focused on testing and bug detection',
        recommendedProvider: 'anthropic',
        recommendedModel: 'claude-3-opus-20240229',
        systemPromptId: 'roles/qa-specialist',
    },
    {
        id: 'ui-ux-designer',
        name: 'UI/UX Designer',
        emoji: '🎨',
        description: 'Design expert focused on user experience and interface aesthetics',
        recommendedProvider: 'openai',
        recommendedModel: 'gpt-4-turbo',
        systemPromptId: 'roles/ui-ux-designer',
    },
    {
        id: 'code-reviewer',
        name: 'Code Reviewer',
        emoji: '📝',
        description: 'Expert code reviewer focused on quality, security, and best practices',
        recommendedProvider: 'anthropic',
        recommendedModel: 'claude-3-5-sonnet-20241022',
        systemPromptId: 'roles/code-reviewer',
    },
    {
        id: 'devops-engineer',
        name: 'DevOps Engineer',
        emoji: '⚙️',
        description: 'Infrastructure and automation expert focused on CI/CD and deployment',
        recommendedProvider: 'anthropic',
        recommendedModel: 'claude-3-5-sonnet-20241022',
        systemPromptId: 'roles/devops-engineer',
    },
    {
        id: 'tech-writer',
        name: 'Technical Writer',
        emoji: '📚',
        description: 'Documentation specialist creating clear and comprehensive technical docs',
        recommendedProvider: 'openai',
        recommendedModel: 'gpt-4-turbo',
        systemPromptId: 'roles/tech-writer',
    },
    {
        id: 'security-specialist',
        name: 'Security Specialist',
        emoji: '🔒',
        description: 'Security expert focused on vulnerability detection and secure coding',
        recommendedProvider: 'anthropic',
        recommendedModel: 'claude-3-opus-20240229',
        systemPromptId: 'roles/security-specialist',
    },
    {
        id: 'performance-optimizer',
        name: 'Performance Optimizer',
        emoji: '⚡',
        description: 'Performance expert focused on speed, efficiency, and optimization',
        recommendedProvider: 'anthropic',
        recommendedModel: 'claude-3-5-sonnet-20241022',
        systemPromptId: 'roles/performance-optimizer',
    },
    {
        id: 'product-manager',
        name: 'Product Manager',
        emoji: '📊',
        description: 'Product strategist focused on requirements, planning, and user value',
        recommendedProvider: 'openai',
        recommendedModel: 'gpt-4-turbo',
        systemPromptId: 'roles/product-manager',
    },
    {
        id: 'data-analyst',
        name: 'Data Analyst',
        emoji: '📈',
        description: 'Data expert focused on analysis, insights, and data-driven decisions',
        recommendedProvider: 'openai',
        recommendedModel: 'gpt-4-turbo',
        systemPromptId: 'roles/data-analyst',
    },
];

// Helper function to get a preset by ID
export function getRolePreset(id: string): RolePreset | undefined {
    return ROLE_PRESETS.find((preset) => preset.id === id);
}

// Helper function to get all preset names for dropdown
export function getRolePresetOptions() {
    return [
        { value: 'custom', label: '사용자 직접 지정', emoji: '✏️' },
        ...ROLE_PRESETS.map((preset) => ({
            value: preset.id,
            label: preset.name,
            emoji: preset.emoji,
            description: preset.description,
        })),
    ];
}
