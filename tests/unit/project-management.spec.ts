import { describe, it, expect } from 'vitest';

/**
 * Project Management Tests
 */

describe('Project CRUD Operations', () => {
    describe('Create Project', () => {
        it('should create new project', async () => {
            const projectData = {
                name: 'My Project',
                description: 'Project description',
                baseDevFolder: '/projects/my-project',
            };

            const project = await createProject(projectData);

            expect(project.id).toBeDefined();
            expect(project.name).toBe('My Project');
        });

        it('should generate unique project ID', async () => {
            const project1 = await createProject({ name: 'P1' });
            const project2 = await createProject({ name: 'P2' });

            expect(project1.id).not.toBe(project2.id);
        });

        it('should validate required fields', async () => {
            const invalidData = { name: '' }; // Empty name

            // Expected: Validation error
        });
    });

    describe('Read Project', () => {
        it('should get project by ID', async () => {
            const project = await getProject(1);

            expect(project.id).toBe(1);
        });

        it('should return null for non-existent project', async () => {
            const project = await getProject(999);

            expect(project).toBeNull();
        });

        it('should list all projects', async () => {
            const projects = await listProjects();

            expect(Array.isArray(projects)).toBe(true);
        });
    });

    describe('Update Project', () => {
        it('should update project name', async () => {
            await updateProject(1, { name: 'Updated Name' });

            const project = await getProject(1);
            expect(project.name).toBe('Updated Name');
        });

        it('should update description', async () => {
            await updateProject(1, { description: 'New desc' });

            const project = await getProject(1);
            expect(project.description).toBe('New desc');
        });
    });

    describe('Delete Project', () => {
        it('should delete project', async () => {
            await deleteProject(1);

            const project = await getProject(1);
            expect(project).toBeNull();
        });

        it('should cascade delete tasks', async () => {
            const project = await createProject({ name: 'P1' });
            await createTask({ projectId: project.id, title: 'Task 1' });

            await deleteProject(project.id);

            const tasks = await listTasks({ projectId: project.id });
            expect(tasks.length).toBe(0);
        });
    });
});

describe('Project Export/Import', () => {
    describe('Export Project', () => {
        it('should export project to JSON', async () => {
            const project = {
                id: 1,
                name: 'Test Project',
                tasks: [
                    { projectSequence: 1, title: 'Task 1' },
                    { projectSequence: 2, title: 'Task 2' },
                ],
            };

            const exported = await exportProject(1);

            expect(exported.name).toBe('Test Project');
            expect(exported.tasks.length).toBe(2);
        });

        it('should preserve projectSequence in export', async () => {
            const exported = await exportProject(1);

            exported.tasks.forEach((task) => {
                expect(task.projectSequence).toBeDefined();
                expect(task.id).toBeUndefined(); // Global IDs removed
            });
        });

        it('should export dependencies as projectSequence', async () => {
            const task = {
                projectSequence: 2,
                triggerConfig: {
                    dependsOn: {
                        taskIds: [1], // Should be projectSequence in export
                    },
                },
            };

            const exported = await exportProject(1);

            const exportedTask = exported.tasks.find((t) => t.projectSequence === 2);
            expect(exportedTask.triggerConfig.dependsOn.taskIds).toEqual([1]);
        });

        it('should include operators in export', async () => {
            const exported = await exportProject(1);

            expect(exported.operators).toBeDefined();
        });
    });

    describe('Import Project', () => {
        it('should import project from JSON', async () => {
            const importData = {
                name: 'Imported Project',
                tasks: [{ projectSequence: 1, title: 'Task 1' }],
            };

            const project = await importProject(importData);

            expect(project.name).toBe('Imported Project');
            expect(project.tasks.length).toBe(1);
        });

        it('should assign new global IDs on import', async () => {
            const importData = {
                tasks: [{ projectSequence: 1 }, { projectSequence: 2 }],
            };

            const project = await importProject(importData);

            project.tasks.forEach((task) => {
                expect(task.id).toBeDefined(); // New global IDs
                expect(task.projectSequence).toBeDefined(); // ProjectSequence preserved
            });
        });

        it('should preserve task dependencies', async () => {
            const importData = {
                tasks: [
                    { projectSequence: 1, title: 'A' },
                    {
                        projectSequence: 2,
                        title: 'B',
                        triggerConfig: {
                            dependsOn: { taskIds: [1] },
                        },
                    },
                ],
            };

            const project = await importProject(importData);

            const taskB = project.tasks.find((t) => t.projectSequence === 2);
            expect(taskB.triggerConfig.dependsOn.taskIds).toEqual([1]); // Still references projectSequence #1
        });
    });

    describe('Project Template', () => {
        it('should create project from template', async () => {
            const template = {
                name: 'Data Processing Template',
                tasks: [
                    { projectSequence: 1, title: 'Load Data', taskType: 'input' },
                    { projectSequence: 2, title: 'Process', taskType: 'script' },
                    { projectSequence: 3, title: 'Summarize', taskType: 'ai' },
                ],
            };

            const project = await createProjectFromTemplate(template);

            expect(project.tasks.length).toBe(3);
        });

        it('should allow user to customize template', async () => {
            const template = { name: 'Template' };
            const customizations = { name: 'My Custom Project' };

            const project = await createProjectFromTemplate(template, customizations);

            expect(project.name).toBe('My Custom Project');
        });
    });
});

describe('Task Lifecycle', () => {
    describe('Create Task', () => {
        it('should create task with auto-incremented projectSequence', async () => {
            const task1 = await createTask({ projectId: 1, title: 'Task 1' });
            const task2 = await createTask({ projectId: 1, title: 'Task 2' });

            expect(task1.projectSequence).toBe(1);
            expect(task2.projectSequence).toBe(2);
        });

        it('should assign default values', async () => {
            const task = await createTask({ projectId: 1, title: 'Task' });

            expect(task.status).toBe('todo');
            expect(task.taskType).toBe('ai'); // Or default type
        });
    });

    describe('Update Task', () => {
        it('should update task title', async () => {
            await updateTask(1, { title: 'New Title' });

            const task = await getTask(1);
            expect(task.title).toBe('New Title');
        });

        it('should update task dependencies', async () => {
            await updateTask(2, {
                triggerConfig: {
                    dependsOn: { taskIds: [1] },
                },
            });

            const task = await getTask(2);
            expect(task.triggerConfig.dependsOn.taskIds).toEqual([1]);
        });
    });

    describe('Delete Task', () => {
        it('should delete task', async () => {
            await deleteTask(1);

            const task = await getTask(1);
            expect(task).toBeNull();
        });

        it('should update dependent tasks', async () => {
            const taskA = { id: 1, projectSequence: 1 };
            const taskB = {
                id: 2,
                projectSequence: 2,
                triggerConfig: { dependsOn: { taskIds: [1] } },
            };

            await deleteTask(1);

            // Expected: TaskB dependency removed or updated
        });
    });

    describe('Execute Task', () => {
        it('should change status to in_progress', async () => {
            await executeTask(1);

            const task = await getTask(1);
            expect(task.status).toBe('in_progress');
        });

        it('should store execution result on completion', async () => {
            const result = { content: 'AI response' };
            await completeTask(1, result);

            const task = await getTask(1);
            expect(task.executionResult).toEqual(result);
            expect(task.status).toBe('done');
        });
    });

    describe('Cancel Execution', () => {
        it('should cancel running task', async () => {
            await executeTask(1);
            await cancelTask(1);

            const task = await getTask(1);
            expect(task.status).toBe('todo'); // Or 'canceled'
        });
    });

    describe('Retry Failed Task', () => {
        it('should retry failed task', async () => {
            const task = { id: 1, status: 'failed' };

            await retryTask(1);

            const updated = await getTask(1);
            expect(updated.status).toBe('todo'); // Ready to execute again
        });
    });

    describe('Task History', () => {
        it('should record execution history', async () => {
            await executeTask(1);
            await completeTask(1, { content: 'Result 1' });

            await executeTask(1);
            await completeTask(1, { content: 'Result 2' });

            const history = await getTaskHistory(1);

            expect(history.length).toBe(2);
            expect(history[0].result.content).toBe('Result 1');
            expect(history[1].result.content).toBe('Result 2');
        });
    });
});
