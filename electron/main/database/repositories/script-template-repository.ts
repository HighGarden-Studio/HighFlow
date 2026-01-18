/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
/**
 * Script Template Repository
 *
 * Data access layer for Script Task Templates
 */

import { db } from '../client';
import { scriptTemplates } from '../schema';
import { eq, desc } from 'drizzle-orm';
import type { ScriptTemplate } from '@core/types/database';

export type NewScriptTemplate = Omit<ScriptTemplate, 'id' | 'createdAt' | 'updatedAt'>;

export class ScriptTemplateRepository {
    /**
     * Find all script templates
     */
    async findAll(): Promise<ScriptTemplate[]> {
        const results = await db
            .select()
            .from(scriptTemplates)
            .orderBy(desc(scriptTemplates.createdAt));

        // Parse JSON fields
        return results.map((tpl: any) => ({
            ...tpl,
            tags: typeof tpl.tags === 'string' ? JSON.parse(tpl.tags) : tpl.tags || [],
            defaultOptions:
                typeof tpl.defaultOptions === 'string'
                    ? JSON.parse(tpl.defaultOptions)
                    : tpl.defaultOptions || {},
        }));
    }

    /**
     * Find script template by ID
     */
    async findById(id: number): Promise<ScriptTemplate | undefined> {
        const [result] = await db
            .select()
            .from(scriptTemplates)
            .where(eq(scriptTemplates.id, id))
            .limit(1);

        if (!result) return undefined;

        // Parse JSON fields
        return {
            ...result,
            tags: typeof result.tags === 'string' ? JSON.parse(result.tags) : result.tags || [],
            defaultOptions:
                typeof result.defaultOptions === 'string'
                    ? JSON.parse(result.defaultOptions)
                    : result.defaultOptions || {},
        } as ScriptTemplate;
    }

    /**
     * Create new script template
     */
    async create(data: NewScriptTemplate): Promise<ScriptTemplate> {
        const [created] = await db
            .insert(scriptTemplates)
            .values({
                ...data,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        if (!created) {
            throw new Error('Failed to create script template');
        }

        return {
            ...created,
            tags: typeof created.tags === 'string' ? JSON.parse(created.tags) : created.tags || [],
            defaultOptions:
                typeof created.defaultOptions === 'string'
                    ? JSON.parse(created.defaultOptions)
                    : created.defaultOptions || {},
        } as ScriptTemplate;
    }

    /**
     * Update script template
     */
    async update(id: number, data: Partial<ScriptTemplate>): Promise<ScriptTemplate> {
        const [updated] = await db
            .update(scriptTemplates)
            .set({
                ...data,
                updatedAt: new Date(),
            })
            .where(eq(scriptTemplates.id, id))
            .returning();

        if (!updated) {
            throw new Error('Script template not found');
        }

        return {
            ...updated,
            tags: typeof updated.tags === 'string' ? JSON.parse(updated.tags) : updated.tags || [],
            defaultOptions:
                typeof updated.defaultOptions === 'string'
                    ? JSON.parse(updated.defaultOptions)
                    : updated.defaultOptions || {},
        } as ScriptTemplate;
    }

    /**
     * Delete script template
     */
    async delete(id: number): Promise<void> {
        await db.delete(scriptTemplates).where(eq(scriptTemplates.id, id));
    }
}

// Export singleton instance
export const scriptTemplateRepository = new ScriptTemplateRepository();
