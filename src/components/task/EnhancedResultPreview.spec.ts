import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import EnhancedResultPreview from './EnhancedResultPreview.vue';
import { useI18n } from 'vue-i18n';

// Mock vue-i18n
vi.mock('vue-i18n', () => ({
    useI18n: vi.fn(() => ({
        t: (key: string) => key,
        d: (date: any) => date,
        n: (num: any) => num,
    })),
}));

// Mock stores
vi.mock('../../renderer/stores/projectStore', () => ({
    useProjectStore: vi.fn(() => ({
        projects: [],
        updateTask: vi.fn(),
        fetchProjects: vi.fn(),
        currentProject: null,
    })),
}));

vi.mock('../../renderer/stores/taskStore', () => ({
    useTaskStore: vi.fn(() => ({
        tasks: [],
        updateTask: vi.fn(),
    })),
}));

vi.mock('../../renderer/stores/activityLogStore', () => ({
    useActivityLogStore: vi.fn(() => ({
        addLog: vi.fn(),
        getByTask: vi.fn(() => []),
    })),
}));

vi.mock('../../renderer/stores/mcpStore', () => ({
    useMCPStore: vi.fn(() => ({
        servers: {},
        getExecutions: vi.fn(() => []),
    })),
}));

// Mock other components
vi.mock('./FileTreeItem.vue', () => ({
    default: { template: '<div>FileTreeItem</div>' },
}));
vi.mock('../common/CodeEditor.vue', () => ({
    default: { template: '<div>CodeEditor</div>' },
}));
vi.mock('../ai/MCPToolExecutionLog.vue', () => ({
    default: { template: '<div>MCPToolExecutionLog</div>' },
}));
vi.mock('vue-diff', () => ({
    Diff: { template: '<div>Diff</div>' },
}));

// Mock marked
vi.mock('marked', () => {
    class MockRenderer {}
    return {
        marked: {
            parse: (text: string) => text,
            Renderer: MockRenderer,
            parser: (tokens: any) => '',
            use: vi.fn(),
        },
    };
});

describe('EnhancedResultPreview', () => {
    let wrapper: any;

    beforeEach(() => {
        wrapper = mount(EnhancedResultPreview, {
            global: {
                stubs: {
                    'v-icon': true,
                    transition: false,
                },
                mocks: {
                    $t: (msg: string) => msg,
                },
            },
            props: {
                open: true,
                task: {
                    id: 1,
                    title: 'Test Task',
                    status: 'done',
                    result: 'Test Result',
                    projectId: 1,
                    projectSequence: 1,
                } as any,
            },
        });
    });

    it('should use i18n for the title', () => {
        expect(useI18n).toHaveBeenCalled();
        // Check if the title is rendered using the key (since mock t returns key)
        expect(wrapper.text()).toContain('result.preview.result_preview');
    });

    it('should use i18n for action buttons', async () => {
        // Full screen button tooltip
        const fullScreenBtn = wrapper.find('button[title="result.preview.full_screen"]');
        expect(fullScreenBtn.exists()).toBe(true);

        // Close button tooltip
        const closeBtn = wrapper.find('button[title="result.preview.close"]');
        expect(closeBtn.exists()).toBe(true);
    });

    it('should render content with markdown renderer', () => {
        expect(wrapper.text()).toContain('Test Result');
    });
});
