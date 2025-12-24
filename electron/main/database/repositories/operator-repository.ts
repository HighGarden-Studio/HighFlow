/**
 * Operator Repository
 *
 * Data access layer for AI Operators
 */

import { db } from '../client';
import { operators, operatorMCPs } from '../schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import type { Operator, OperatorMCP } from '@core/types/database';

export type NewOperator = Omit<
    Operator,
    'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'successRate'
>;
export type NewOperatorMCP = Omit<OperatorMCP, 'id' | 'createdAt'>;

export class OperatorRepository {
    /**
     * Find all operators for a project (including global)
     */
    async findByProject(projectId: number | null): Promise<Operator[]> {
        const results = await db
            .select()
            .from(operators)
            .where(
                projectId
                    ? and(
                          eq(operators.isActive, true),
                          // Project-specific OR global operators
                          (isNull(operators.projectId) as any) || eq(operators.projectId, projectId)
                      )
                    : and(eq(operators.isActive, true), isNull(operators.projectId))
            )
            .orderBy(desc(operators.usageCount), desc(operators.createdAt));

        // Parse tags from JSON string to array
        return results.map((op: any) => ({
            ...op,
            tags: typeof op.tags === 'string' ? JSON.parse(op.tags) : op.tags || [],
            specialty:
                typeof op.specialty === 'string' ? JSON.parse(op.specialty) : op.specialty || [],
        }));
    }

    /**
     * Find operator by ID
     */
    async findById(id: number): Promise<Operator | undefined> {
        const [result] = await db.select().from(operators).where(eq(operators.id, id)).limit(1);

        if (!result) return undefined;

        // Parse JSON fields
        return {
            ...result,
            tags: typeof result.tags === 'string' ? JSON.parse(result.tags) : result.tags || [],
            specialty:
                typeof result.specialty === 'string'
                    ? JSON.parse(result.specialty)
                    : result.specialty || [],
        } as Operator;
    }

    /**
     * Find operator with MCPs
     */
    async findWithMCPs(id: number): Promise<(Operator & { mcps: OperatorMCP[] }) | undefined> {
        const operator = await this.findById(id);
        if (!operator) return undefined;

        const mcps = (await db
            .select()
            .from(operatorMCPs)
            .where(eq(operatorMCPs.operatorId, id))) as any;

        return { ...operator, mcps };
    }

    /**
     * Create new operator
     */
    async create(data: NewOperator): Promise<Operator> {
        const [created] = await db
            .insert(operators)
            .values({
                ...data,
                usageCount: 0,
                successRate: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            })
            .returning();

        if (!created) {
            throw new Error('Failed to create operator');
        }

        return created;
    }

    /**
     * Update operator
     */
    async update(id: number, data: Partial<Operator>): Promise<Operator> {
        const [updated] = await db
            .update(operators)
            .set({
                ...data,
                updatedAt: new Date(),
            })
            .where(eq(operators.id, id))
            .returning();

        if (!updated) {
            throw new Error('Operator not found');
        }

        return updated;
    }

    /**
     * Delete operator
     */
    async delete(id: number): Promise<void> {
        await db.delete(operators).where(eq(operators.id, id));
    }

    /**
     * Increment usage count
     */
    async incrementUsage(id: number): Promise<void> {
        await db
            .update(operators)
            .set({
                usageCount: (operators.usageCount as any) + 1,
                updatedAt: new Date(),
            })
            .where(eq(operators.id, id));
    }

    /**
     * Update success rate
     */
    async updateSuccessRate(id: number, successRate: number): Promise<void> {
        await db
            .update(operators)
            .set({
                successRate,
                updatedAt: new Date(),
            })
            .where(eq(operators.id, id));
    }

    /**
     * Get operator MCPs
     */
    async getMCPs(operatorId: number): Promise<OperatorMCP[]> {
        return await db.select().from(operatorMCPs).where(eq(operatorMCPs.operatorId, operatorId));
    }

    /**
     * Add MCP to operator
     */
    async addMCP(data: NewOperatorMCP): Promise<OperatorMCP> {
        const [created] = await db
            .insert(operatorMCPs)
            .values({
                ...data,
                createdAt: new Date(),
            })
            .returning();

        if (!created) {
            throw new Error('Failed to add MCP to operator');
        }

        return created;
    }

    /**
     * Remove MCP from operator
     */
    async removeMCP(operatorId: number, mcpServerSlug: string): Promise<void> {
        await db
            .delete(operatorMCPs)
            .where(
                and(
                    eq(operatorMCPs.operatorId, operatorId),
                    eq(operatorMCPs.mcpServerSlug, mcpServerSlug)
                )
            );
    }

    /**
     * Update operator MCPs (replace all)
     */
    async updateMCPs(operatorId: number, mcps: NewOperatorMCP[]): Promise<void> {
        // Delete existing MCPs
        await db.delete(operatorMCPs).where(eq(operatorMCPs.operatorId, operatorId));

        // Insert new MCPs
        if (mcps.length > 0) {
            await db.insert(operatorMCPs).values(
                mcps.map((mcp) => ({
                    ...mcp,
                    operatorId,
                    createdAt: new Date(),
                }))
            );
        }
    }

    /**
     * Find reviewer operators for a project
     */
    async findReviewers(projectId: number | null): Promise<Operator[]> {
        const results = await db
            .select()
            .from(operators)
            .where(
                and(
                    eq(operators.isReviewer, true),
                    eq(operators.isActive, true),
                    projectId
                        ? (isNull(operators.projectId) as any) || eq(operators.projectId, projectId)
                        : isNull(operators.projectId)
                )
            )
            .orderBy(desc(operators.usageCount));

        // Parse JSON fields
        return results.map((op: any) => ({
            ...op,
            tags: typeof op.tags === 'string' ? JSON.parse(op.tags) : op.tags || [],
            specialty:
                typeof op.specialty === 'string' ? JSON.parse(op.specialty) : op.specialty || [],
        }));
    }

    /**
     * Find global curator operator
     */
    async findGlobalCurator(): Promise<Operator | undefined> {
        const [curator] = await db
            .select()
            .from(operators)
            .where(
                and(
                    eq(operators.isCurator, true),
                    isNull(operators.projectId), // Global operator only
                    eq(operators.isActive, true)
                )
            )
            .limit(1);

        return curator;
    }
}

// Export singleton instance
export const operatorRepository = new OperatorRepository();
