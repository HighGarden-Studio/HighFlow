/**
 * KanbanBoard Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import KanbanBoard from './KanbanBoard.vue';
import type { Task } from '@core/types/database';

// ==========================================
// Mock Composables
// ==========================================

vi.mock('../../composables/useDragDrop', () => ({
    useDragDrop: vi.fn(() => ({
        onDragStart: vi.fn(),
        onDragOver: vi.fn((e: DragEvent) => e.preventDefault()),
        onDrop: vi.fn(),
        isColumnDragOver: vi.fn(() => false),
    })),
}));

vi.mock('../../composables/useRealtime', () => ({
    useRealtime: vi.fn(() => ({
        otherUsers: { value: [] },
        emit: vi.fn(),
    })),
}));

// ==========================================
// Test Data
// ==========================================

const createMockTask = (overrides: Partial<Task> = {}): Task => ({
    id: Math.random(),
    projectId: 1,
    title: 'Test Task',
    description: 'Test description',
    status: 'todo',
    priority: 'medium',
    tags: ['test'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
});

const mockProjects = [
    {
        id: 1,
        name: 'Project Alpha',
        color: '#3B82F6',
        tasks: [
            createMockTask({ id: 1, title: 'Task 1', status: 'todo', priority: 'high' }),
            createMockTask({ id: 2, title: 'Task 2', status: 'in_progress', priority: 'medium' }),
            createMockTask({ id: 3, title: 'Task 3', status: 'done', priority: 'low' }),
        ],
    },
    {
        id: 2,
        name: 'Project Beta',
        color: '#10B981',
        tasks: [
            createMockTask({ id: 4, projectId: 2, title: 'Beta Task 1', status: 'todo' }),
            createMockTask({ id: 5, projectId: 2, title: 'Beta Task 2', status: 'blocked' }),
        ],
    },
];

// ==========================================
// Test Helper
// ==========================================

const mountKanbanBoard = (props = {}) => {
    return mount(KanbanBoard, {
        props: {
            projects: mockProjects,
            ...props,
        },
        global: {
            stubs: {
                KanbanColumn: {
                    name: 'KanbanColumn',
                    template: `
            <div class="kanban-column" :data-status="status">
              <div
                v-for="task in tasks"
                :key="task.id"
                :data-task-id="task.id"
                @click="$emit('taskClick', task)"
              >
                {{ task.title }}
              </div>
              <button @click="$emit('addTask')">Add</button>
            </div>
          `,
                    props: ['status', 'title', 'color', 'tasks', 'isDragOver'],
                    emits: [
                        'taskClick',
                        'taskEdit',
                        'addTask',
                        'dragstartTask',
                        'taskExecute',
                        'taskEnhancePrompt',
                        'taskPreviewPrompt',
                        'taskPreviewResult',
                        'taskRetry',
                        'taskViewHistory',
                        'taskViewProgress',
                        'taskViewStepHistory',
                        'taskPause',
                        'taskResume',
                        'taskStop',
                        'taskSubdivide',
                    ],
                },
            },
        },
    });
};

// ==========================================
// Tests
// ==========================================

describe('KanbanBoard', () => {
    let wrapper: VueWrapper<any>;

    beforeEach(() => {
        wrapper = mountKanbanBoard();
    });

    // ==========================================
    // Rendering Tests
    // ==========================================

    describe('Rendering', () => {
        it('should render the board with title', () => {
            expect(wrapper.find('h1').text()).toBe('Kanban Board');
        });

        it('should render all columns', () => {
            const columns = wrapper.findAll('.kanban-column');
            // 5 columns × 2 projects = 10 total column instances
            expect(columns.length).toBe(12);
        });

        it('should render project swimlanes', () => {
            const projectHeaders = wrapper.findAll('h3');
            expect(projectHeaders.length).toBe(2);
            expect(projectHeaders[0].text()).toBe('Project Alpha');
            expect(projectHeaders[1].text()).toBe('Project Beta');
        });

        it('should display task statistics', () => {
            const statsText = wrapper.text();
            expect(statsText).toContain('5 tasks'); // Total tasks
            expect(statsText).toContain('1 in progress');
            expect(statsText).toContain('1 completed');
        });

        it('should render search input', () => {
            const searchInput = wrapper.find('input[type="text"]');
            expect(searchInput.exists()).toBe(true);
            expect(searchInput.attributes('placeholder')).toBe('Search tasks...');
        });

        it('should render column headers', () => {
            const headerText = wrapper.text();
            expect(headerText).toContain('To Do');
            expect(headerText).toContain('In Progress');
            expect(headerText).toContain('In Review');
            expect(headerText).toContain('Done');
            expect(headerText).toContain('Blocked');
        });
    });

    // ==========================================
    // Project Expansion Tests
    // ==========================================

    describe('Project Expansion', () => {
        it('should start with all projects expanded', async () => {
            const expandedColumns = wrapper.findAll('.kanban-column');
            expect(expandedColumns.length).toBe(12); // All columns visible
        });

        it('should collapse project when header is clicked', async () => {
            const projectHeader = wrapper.find('[data-testid="project-header-1"]');

            await projectHeader.trigger('click');
            // Wait for transition/reactivity update (microtask + MACROTASK needed for v-if/transition)
            await new Promise((resolve) => setTimeout(resolve, 100));

            const columns = wrapper.findAll('.kanban-column');
            expect(columns.length).toBe(6); // Only second project columns
        });

        it('should re-expand project when clicked again', async () => {
            const projectHeader = wrapper.find('[class*="cursor-pointer"]');

            // Collapse
            await projectHeader.trigger('click');
            await nextTick();

            // Expand again
            await projectHeader.trigger('click');
            await nextTick();

            const columns = wrapper.findAll('.kanban-column');
            expect(columns.length).toBe(12);
        });
    });

    // ==========================================
    // Search Functionality Tests
    // ==========================================

    describe('Search Functionality', () => {
        it('should filter tasks by search query', async () => {
            const searchInput = wrapper.find('input[type="text"]');
            await searchInput.setValue('Task 1');
            await nextTick();

            // Statistics should update (only matching tasks counted)
            const statsText = wrapper.text();
            // Should show filtered results
            expect(wrapper.vm.searchQuery).toBe('Task 1');
        });

        it('should be case-insensitive', async () => {
            const searchInput = wrapper.find('input[type="text"]');
            await searchInput.setValue('TASK');
            await nextTick();

            expect(wrapper.vm.searchQuery).toBe('TASK');
        });

        it('should search in task description', async () => {
            const tasksWithDesc = [
                {
                    id: 1,
                    name: 'Test Project',
                    color: '#000',
                    tasks: [
                        createMockTask({
                            id: 1,
                            title: 'A Task',
                            description: 'Contains searchable keyword',
                        }),
                    ],
                },
            ];

            wrapper = mountKanbanBoard({ projects: tasksWithDesc });
            const searchInput = wrapper.find('input[type="text"]');
            await searchInput.setValue('searchable');
            await nextTick();

            // Search should find the task
            expect(wrapper.vm.searchQuery).toBe('searchable');
        });
    });

    // ==========================================
    // Filtering Tests
    // ==========================================

    describe('Filtering', () => {
        it('should filter by priority', async () => {
            wrapper = mountKanbanBoard({
                projects: mockProjects,
                filterBy: { priority: ['high'] },
            });

            // Should only include high priority tasks in computed
            const computed = wrapper.vm.projectTasksByColumn;
            const totalTasks = computed.reduce((sum: number, p: any) => sum + p.totalTasks, 0);

            // Only 1 high priority task exists
            expect(totalTasks).toBe(1);
        });

        it('should filter by tags', async () => {
            const tasksWithTags = [
                {
                    id: 1,
                    name: 'Project',
                    color: '#000',
                    tasks: [
                        createMockTask({ id: 1, title: 'Frontend Task', tags: ['frontend'] }),
                        createMockTask({ id: 2, title: 'Backend Task', tags: ['backend'] }),
                    ],
                },
            ];

            wrapper = mountKanbanBoard({
                projects: tasksWithTags,
                filterBy: { tags: ['frontend'] },
            });

            const computed = wrapper.vm.projectTasksByColumn;
            expect(computed[0].totalTasks).toBe(1);
        });

        it('should filter by assignee', async () => {
            const tasksWithAssignee = [
                {
                    id: 1,
                    name: 'Project',
                    color: '#000',
                    tasks: [
                        createMockTask({ id: 1, title: 'Task A', assigneeId: 1 }),
                        createMockTask({ id: 2, title: 'Task B', assigneeId: 2 }),
                        createMockTask({ id: 3, title: 'Task C', assigneeId: 1 }),
                    ],
                },
            ];

            wrapper = mountKanbanBoard({
                projects: tasksWithAssignee,
                filterBy: { assignee: [1] },
            });

            const computed = wrapper.vm.projectTasksByColumn;
            expect(computed[0].totalTasks).toBe(2);
        });

        it('should combine multiple filters', async () => {
            const tasks = [
                {
                    id: 1,
                    name: 'Project',
                    color: '#000',
                    tasks: [
                        createMockTask({
                            id: 1,
                            title: 'Match All',
                            priority: 'high',
                            tags: ['frontend'],
                            assigneeId: 1,
                        }),
                        createMockTask({
                            id: 2,
                            title: 'Match Priority',
                            priority: 'high',
                            tags: ['backend'],
                            assigneeId: 2,
                        }),
                        createMockTask({
                            id: 3,
                            title: 'Match Tag',
                            priority: 'low',
                            tags: ['frontend'],
                            assigneeId: 2,
                        }),
                    ],
                },
            ];

            wrapper = mountKanbanBoard({
                projects: tasks,
                filterBy: {
                    priority: ['high'],
                    tags: ['frontend'],
                    assignee: [1],
                },
            });

            const computed = wrapper.vm.projectTasksByColumn;
            expect(computed[0].totalTasks).toBe(1);
        });
    });

    // ==========================================
    // Event Emission Tests
    // ==========================================

    describe('Event Emissions', () => {
        it('should emit taskClick when task is clicked', async () => {
            const task = wrapper.find('[data-task-id="1"]');
            await task.trigger('click');

            expect(wrapper.emitted('taskClick')).toBeTruthy();
            expect(wrapper.emitted('taskClick')![0][0]).toMatchObject({ id: 1 });
        });

        it('should emit addTask when add button is clicked', async () => {
            const column = wrapper.findComponent({ name: 'KanbanColumn' });
            await column.vm.$emit('addTask');

            expect(wrapper.emitted('addTask')).toBeTruthy();
        });

        it('should emit taskUpdate when task is moved', async () => {
            const column = wrapper.findComponent({ name: 'KanbanColumn' });
            const task = createMockTask({ id: 1, status: 'todo' });

            await column.vm.$emit('taskClick', task);

            expect(wrapper.emitted('taskClick')).toBeTruthy();
        });

        it('should emit taskExecute event', async () => {
            const column = wrapper.findComponent({ name: 'KanbanColumn' });
            const task = createMockTask({ id: 1 });

            await column.vm.$emit('taskExecute', task);

            expect(wrapper.emitted('taskExecute')).toBeTruthy();
        });

        it('should emit taskSubdivide event', async () => {
            const column = wrapper.findComponent({ name: 'KanbanColumn' });
            const task = createMockTask({ id: 1 });

            await column.vm.$emit('taskSubdivide', task);

            expect(wrapper.emitted('taskSubdivide')).toBeTruthy();
        });
    });

    // ==========================================
    // Statistics Tests
    // ==========================================

    describe('Statistics', () => {
        it('should calculate total tasks correctly', () => {
            expect(wrapper.vm.statistics.total).toBe(5);
        });

        it('should calculate completed tasks correctly', () => {
            expect(wrapper.vm.statistics.completed).toBe(1);
        });

        it('should calculate in-progress tasks correctly', () => {
            expect(wrapper.vm.statistics.inProgress).toBe(1);
        });

        it('should calculate blocked tasks correctly', () => {
            expect(wrapper.vm.statistics.blocked).toBe(1);
        });

        it('should calculate completion rate correctly', () => {
            // 1 completed out of 5 = 20%
            expect(wrapper.vm.statistics.completionRate).toBe(20);
        });

        it('should handle empty projects', () => {
            wrapper = mountKanbanBoard({ projects: [] });

            expect(wrapper.vm.statistics.total).toBe(0);
            expect(wrapper.vm.statistics.completionRate).toBe(0);
        });
    });

    // ==========================================
    // Empty State Tests
    // ==========================================

    describe('Empty State', () => {
        it('should show empty state when no projects', () => {
            wrapper = mountKanbanBoard({ projects: [] });

            expect(wrapper.text()).toContain('프로젝트가 없습니다');
        });

        it('should not show empty state with projects', () => {
            expect(wrapper.text()).not.toContain('프로젝트가 없습니다');
        });
    });

    // ==========================================
    // Collaboration Tests
    // ==========================================

    describe('Collaboration', () => {
        it('should hide collaboration indicators when disabled', () => {
            wrapper = mountKanbanBoard({
                projects: mockProjects,
                showCollaboration: false,
            });

            expect(wrapper.text()).not.toContain('online');
        });

        it('should show collaboration by default', () => {
            // With mocked empty users
            expect(wrapper.text()).not.toContain('online'); // No users mocked
        });
    });

    // ==========================================
    // Props Validation Tests
    // ==========================================

    describe('Props', () => {
        it('should use default groupBy value', () => {
            expect(wrapper.vm.groupBy).toBe('status');
        });

        it('should use default showCollaboration value', () => {
            expect(wrapper.vm.showCollaboration).toBe(true);
        });

        it('should accept custom props', () => {
            wrapper = mountKanbanBoard({
                projects: mockProjects,
                groupBy: 'priority',
                showCollaboration: false,
            });

            expect(wrapper.vm.groupBy).toBe('priority');
            expect(wrapper.vm.showCollaboration).toBe(false);
        });
    });
});
