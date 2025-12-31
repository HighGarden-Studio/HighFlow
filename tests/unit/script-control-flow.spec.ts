import { describe, it, expect } from 'vitest';
import { parseScriptReturn, validateControlFlow } from '@core/types/workflow';

describe('ScriptTaskReturn Parsing', () => {
    describe('parseScriptReturn', () => {
        it('should parse ScriptTaskReturn format correctly', () => {
            const output = JSON.stringify({
                result: { data: 'test' },
                control: { next: [2, 3], reason: 'branching' },
            });

            const parsed = parseScriptReturn(output);
            expect(parsed.result).toEqual({ data: 'test' });
            expect(parsed.control?.next).toEqual([2, 3]);
            expect(parsed.control?.reason).toBe('branching');
        });

        it('should handle legacy format (no control)', () => {
            const output = 'simple string result';
            const parsed = parseScriptReturn(output);
            expect(parsed.result).toBe('simple string result');
            expect(parsed.control).toBeUndefined();
        });

        it('should handle legacy JSON format', () => {
            const output = JSON.stringify({ foo: 'bar' });
            const parsed = parseScriptReturn(output);
            expect(parsed.result).toEqual({ foo: 'bar' });
            expect(parsed.control).toBeUndefined();
        });

        it('should handle terminal nodes', () => {
            const output = JSON.stringify({
                result: 'done',
                control: { next: [], reason: 'condition not met' },
            });

            const parsed = parseScriptReturn(output);
            expect(parsed.control?.next).toEqual([]);
            expect(parsed.control?.reason).toBe('condition not met');
        });

        it('should handle null next (terminal)', () => {
            const output = JSON.stringify({
                result: 'stopped',
                control: { next: null, reason: 'no action needed' },
            });

            const parsed = parseScriptReturn(output);
            expect(parsed.control?.next).toBeNull();
        });

        it('should handle object input directly', () => {
            const output = {
                result: 'data',
                control: { next: [5] },
            };

            const parsed = parseScriptReturn(output);
            expect(parsed.result).toBe('data');
            expect(parsed.control?.next).toEqual([5]);
        });
    });

    describe('validateControlFlow', () => {
        it('should accept valid control flow', () => {
            const control = { next: [1, 2, 3], reason: 'branching' };
            const validation = validateControlFlow(control);
            expect(validation.valid).toBe(true);
        });

        it('should accept empty next array', () => {
            const control = { next: [], reason: 'terminal' };
            const validation = validateControlFlow(control);
            expect(validation.valid).toBe(true);
        });

        it('should accept null next', () => {
            const control = { next: null, reason: 'stop' };
            const validation = validateControlFlow(control);
            expect(validation.valid).toBe(true);
        });

        it('should accept undefined next', () => {
            const control = { reason: 'note' };
            const validation = validateControlFlow(control);
            expect(validation.valid).toBe(true);
        });

        it('should reject non-array next', () => {
            const control = { next: 'invalid' as any };
            const validation = validateControlFlow(control);
            expect(validation.valid).toBe(false);
            expect(validation.error).toContain('must be an array');
        });

        it('should reject non-number elements in next', () => {
            const control = { next: [1, 'two', 3] as any };
            const validation = validateControlFlow(control);
            expect(validation.valid).toBe(false);
            expect(validation.error).toContain('only numbers');
        });

        it('should reject non-string reason', () => {
            const control = { reason: 123 as any };
            const validation = validateControlFlow(control);
            expect(validation.valid).toBe(false);
            expect(validation.error).toContain('must be a string');
        });

        it('should accept control without reason', () => {
            const control = { next: [1, 2] };
            const validation = validateControlFlow(control);
            expect(validation.valid).toBe(true);
        });
    });
});
