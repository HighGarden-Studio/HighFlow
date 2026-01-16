import { describe, it, expect } from 'vitest';
import type { Task } from '@core/types/database';

describe('Alias Check', () => {
    it('should resolve @core types', () => {
        const task: Task | null = null;
        expect(task).toBe(null);
    });
});
