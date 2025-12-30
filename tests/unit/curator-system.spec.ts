import { describe, it, expect } from 'vitest';

/**
 * Curator System Tests
 *
 * Tests AI-powered project memory and context extraction
 */

describe('Curator - Project Memory', () => {
    describe('Memory Creation', () => {
        it('should create project memory on first run', async () => {
            const project = {
                id: 1,
                name: 'Data Pipeline',
                description: 'ETL pipeline for customer data',
                tasks: [
                    { title: 'Extract from DB', taskType: 'input' },
                    { title: 'Transform data', taskType: 'script' },
                    { title: 'Generate insights', taskType: 'ai' },
                ],
            };

            const memory = await createProjectMemory(project);

            expect(memory.projectId).toBe(1);
            expect(memory.summary).toBeDefined();
            expect(memory.keyEntities).toBeDefined(); // Extracted entities
        });

        it('should extract project goals', async () => {
            const project = {
                description: 'Build a customer segmentation model using ML',
            };

            const memory = await createProjectMemory(project);

            expect(memory.goals).toContain('customer segmentation');
            expect(memory.goals).toContain('ML');
        });

        it('should identify key technologies', async () => {
            const project = {
                tasks: [
                    { title: 'Analyze with Python pandas' },
                    { title: 'Train TensorFlow model' },
                ],
            };

            const memory = await createProjectMemory(project);

            expect(memory.technologies).toContain('Python');
            expect(memory.technologies).toContain('pandas');
            expect(memory.technologies).toContain('TensorFlow');
        });
    });

    describe('Task Context Extraction', () => {
        it('should extract relevant context for task', async () => {
            const task = {
                title: 'Analyze customer churn',
                description: 'Use ML to predict customer churn',
            };

            const context = await extractTaskContext(task);

            expect(context.domain).toBe('customer analytics');
            expect(context.techniques).toContain('ML');
            expect(context.objectives).toContain('predict churn');
        });

        it('should link task to related tasks', async () => {
            const tasks = [
                { id: 1, title: 'Load customer data' },
                { id: 2, title: 'Preprocess data' },
                { id: 3, title: 'Train churn model', dependencies: [1, 2] },
            ];

            const context = await extractTaskContext(tasks[2]);

            expect(context.relatedTasks).toContain(1);
            expect(context.relatedTasks).toContain(2);
        });
    });

    describe('Memory Search', () => {
        it('should search project memory by query', async () => {
            const memory = {
                projectId: 1,
                summaries: [
                    { text: 'Customer segmentation using clustering' },
                    { text: 'Revenue forecasting with ARIMA' },
                    { text: 'Churn prediction with logistic regression' },
                ],
            };

            const results = await searchMemory('churn prediction');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].text).toContain('Churn prediction');
        });

        it('should rank search results by relevance', async () => {
            const results = await searchMemory('machine learning');

            // Expected: Most relevant results first
            expect(results[0].score).toBeGreaterThan(results[1].score);
        });
    });

    describe('Memory Update', () => {
        it('should update memory when tasks change', async () => {
            const memory = await getProjectMemory(1);
            const initialVersion = memory.version;

            await updateTask(1, { title: 'New analysis approach' });
            await updateProjectMemory(1);

            const updatedMemory = await getProjectMemory(1);

            expect(updatedMemory.version).toBeGreaterThan(initialVersion);
            expect(updatedMemory.summary).toContain('New analysis approach');
        });

        it('should preserve memory history', async () => {
            await updateProjectMemory(1);
            await updateProjectMemory(1);

            const history = await getMemoryHistory(1);

            expect(history.length).toBeGreaterThan(1);
        });
    });

    describe('Context Injection', () => {
        it('should inject relevant context into AI prompts', async () => {
            const task = {
                prompt: 'Analyze the data',
                projectId: 1,
            };

            const memory = {
                context: 'This project uses Python pandas for data analysis',
                previousFindings: 'Customer churn rate is 15%',
            };

            const enhancedPrompt = await injectContext(task.prompt, memory);

            expect(enhancedPrompt).toContain('Python pandas');
            expect(enhancedPrompt).toContain('churn rate is 15%');
        });

        it('should not inject context for unrelated tasks', async () => {
            const task = { prompt: 'Translate to French', domain: 'translation' };
            const memory = { context: 'ML model training', domain: 'data-science' };

            const enhancedPrompt = await injectContext(task.prompt, memory);

            // Domains don't match, context not injected
            expect(enhancedPrompt).toBe(task.prompt);
        });
    });
});
