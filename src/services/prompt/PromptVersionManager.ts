/**
 * Prompt Version Manager
 *
 * Tracks prompt history, enables version comparison,
 * and supports rollback to previous versions.
 */

import { eventBus } from '../events/EventBus';

// ========================================
// Types
// ========================================

export interface PromptVersion {
    id: string;
    taskId: number;
    versionNumber: number;
    prompt: string;
    analysis?: PromptVersionAnalysis;
    metadata: PromptVersionMetadata;
    createdAt: Date;
}

export interface PromptVersionAnalysis {
    overallScore: number;
    clarity: number;
    specificity: number;
    completeness: number;
    actionability: number;
}

export interface PromptVersionMetadata {
    author?: string;
    reason?: string;
    source: 'manual' | 'ai_enhanced' | 'template' | 'rollback' | 'import';
    templateId?: string;
    parentVersionId?: string;
    labels?: string[];
}

export interface PromptHistory {
    taskId: number;
    currentVersionId: string;
    versions: PromptVersion[];
    maxVersions: number;
}

export interface PromptDiff {
    fromVersionId: string;
    toVersionId: string;
    fromVersionNumber: number;
    toVersionNumber: number;
    additions: DiffChange[];
    deletions: DiffChange[];
    modifications: DiffChange[];
    stats: {
        addedLines: number;
        deletedLines: number;
        changedLines: number;
        similarity: number;
    };
}

export interface DiffChange {
    type: 'add' | 'delete' | 'modify';
    lineNumber: number;
    content: string;
    originalContent?: string; // For modifications
}

export interface RollbackResult {
    success: boolean;
    newVersion?: PromptVersion;
    error?: string;
}

// ========================================
// Prompt Version Manager
// ========================================

class PromptVersionManager {
    private histories: Map<number, PromptHistory> = new Map();
    private readonly storageKey = 'prompt_versions';
    private readonly defaultMaxVersions = 50;

    constructor() {
        this.loadFromStorage();
    }

    // ========================================
    // Storage
    // ========================================

    private loadFromStorage(): void {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const data = JSON.parse(stored) as [number, PromptHistory][];
                for (const [taskId, history] of data) {
                    // Convert date strings back to Date objects
                    history.versions = history.versions.map((v) => ({
                        ...v,
                        createdAt: new Date(v.createdAt),
                    }));
                    this.histories.set(taskId, history);
                }
            }
        } catch (error) {
            console.warn('Failed to load prompt versions from storage:', error);
        }
    }

    private saveToStorage(): void {
        try {
            const data = [...this.histories.entries()];
            localStorage.setItem(this.storageKey, JSON.stringify(data));
        } catch (error) {
            console.warn('Failed to save prompt versions to storage:', error);
        }
    }

    // ========================================
    // Version Creation
    // ========================================

    /**
     * Create a new version of a prompt
     */
    createVersion(
        taskId: number,
        prompt: string,
        metadata: Omit<PromptVersionMetadata, 'parentVersionId'> = { source: 'manual' },
        analysis?: PromptVersionAnalysis
    ): PromptVersion {
        let history = this.histories.get(taskId);

        if (!history) {
            history = {
                taskId,
                currentVersionId: '',
                versions: [],
                maxVersions: this.defaultMaxVersions,
            };
            this.histories.set(taskId, history);
        }

        const versionNumber = history.versions.length + 1;
        const id = `pv_${taskId}_${versionNumber}_${Date.now()}`;

        const version: PromptVersion = {
            id,
            taskId,
            versionNumber,
            prompt,
            analysis,
            metadata: {
                ...metadata,
                parentVersionId: history.currentVersionId || undefined,
            },
            createdAt: new Date(),
        };

        history.versions.push(version);
        history.currentVersionId = id;

        // Trim old versions if exceeding max
        if (history.versions.length > history.maxVersions) {
            const toRemove = history.versions.length - history.maxVersions;
            history.versions.splice(0, toRemove);
        }

        this.saveToStorage();

        eventBus.emit('prompt:version:created', {
            taskId,
            versionId: id,
            versionNumber,
        });

        return version;
    }

    // ========================================
    // Version Retrieval
    // ========================================

    /**
     * Get the complete history for a task
     */
    getHistory(taskId: number): PromptHistory | undefined {
        return this.histories.get(taskId);
    }

    /**
     * Get a specific version by ID
     */
    getVersion(versionId: string): PromptVersion | undefined {
        for (const history of this.histories.values()) {
            const version = history.versions.find((v) => v.id === versionId);
            if (version) return version;
        }
        return undefined;
    }

    /**
     * Get the current version for a task
     */
    getCurrentVersion(taskId: number): PromptVersion | undefined {
        const history = this.histories.get(taskId);
        if (!history) return undefined;

        return history.versions.find((v) => v.id === history.currentVersionId);
    }

    /**
     * Get version by number for a task
     */
    getVersionByNumber(taskId: number, versionNumber: number): PromptVersion | undefined {
        const history = this.histories.get(taskId);
        if (!history) return undefined;

        return history.versions.find((v) => v.versionNumber === versionNumber);
    }

    /**
     * Get all versions for a task
     */
    getAllVersions(taskId: number): PromptVersion[] {
        const history = this.histories.get(taskId);
        return history ? [...history.versions] : [];
    }

    // ========================================
    // Version Comparison (Diff)
    // ========================================

    /**
     * Compare two versions and generate a diff
     */
    compareVersions(fromVersionId: string, toVersionId: string): PromptDiff | null {
        const fromVersion = this.getVersion(fromVersionId);
        const toVersion = this.getVersion(toVersionId);

        if (!fromVersion || !toVersion) return null;

        const fromLines = fromVersion.prompt.split('\n');
        const toLines = toVersion.prompt.split('\n');

        const additions: DiffChange[] = [];
        const deletions: DiffChange[] = [];
        const modifications: DiffChange[] = [];

        // Simple line-by-line diff
        const maxLines = Math.max(fromLines.length, toLines.length);

        for (let i = 0; i < maxLines; i++) {
            const fromLine = fromLines[i];
            const toLine = toLines[i];

            if (fromLine === undefined && toLine !== undefined) {
                additions.push({
                    type: 'add',
                    lineNumber: i + 1,
                    content: toLine,
                });
            } else if (fromLine !== undefined && toLine === undefined) {
                deletions.push({
                    type: 'delete',
                    lineNumber: i + 1,
                    content: fromLine,
                });
            } else if (fromLine !== toLine) {
                modifications.push({
                    type: 'modify',
                    lineNumber: i + 1,
                    content: toLine!,
                    originalContent: fromLine,
                });
            }
        }

        // Calculate similarity
        const totalChanges = additions.length + deletions.length + modifications.length;
        const totalLines = Math.max(fromLines.length, toLines.length);
        const similarity = totalLines > 0 ? Math.round((1 - totalChanges / totalLines) * 100) : 100;

        return {
            fromVersionId,
            toVersionId,
            fromVersionNumber: fromVersion.versionNumber,
            toVersionNumber: toVersion.versionNumber,
            additions,
            deletions,
            modifications,
            stats: {
                addedLines: additions.length,
                deletedLines: deletions.length,
                changedLines: modifications.length,
                similarity,
            },
        };
    }

    /**
     * Generate a unified diff string
     */
    generateUnifiedDiff(fromVersionId: string, toVersionId: string): string {
        const diff = this.compareVersions(fromVersionId, toVersionId);
        if (!diff) return '';

        const fromVersion = this.getVersion(fromVersionId);
        const toVersion = this.getVersion(toVersionId);
        if (!fromVersion || !toVersion) return '';

        const lines: string[] = [];
        lines.push(`--- Version ${fromVersion.versionNumber}`);
        lines.push(`+++ Version ${toVersion.versionNumber}`);
        lines.push('');

        const fromLines = fromVersion.prompt.split('\n');
        const toLines = toVersion.prompt.split('\n');

        // Create a set of changed line numbers for quick lookup
        const addedLines = new Set(diff.additions.map((a) => a.lineNumber));
        const deletedLines = new Set(diff.deletions.map((d) => d.lineNumber));
        const modifiedLines = new Set(diff.modifications.map((m) => m.lineNumber));

        const maxLines = Math.max(fromLines.length, toLines.length);

        for (let i = 0; i < maxLines; i++) {
            const lineNum = i + 1;

            if (deletedLines.has(lineNum)) {
                lines.push(`- ${fromLines[i]}`);
            }

            if (modifiedLines.has(lineNum)) {
                lines.push(`- ${fromLines[i]}`);
                lines.push(`+ ${toLines[i]}`);
            } else if (addedLines.has(lineNum)) {
                lines.push(`+ ${toLines[i]}`);
            } else if (toLines[i] !== undefined) {
                lines.push(`  ${toLines[i]}`);
            }
        }

        return lines.join('\n');
    }

    // ========================================
    // Rollback
    // ========================================

    /**
     * Rollback to a specific version
     */
    rollback(taskId: number, targetVersionNumber: number, reason?: string): RollbackResult {
        const history = this.histories.get(taskId);
        if (!history) {
            return { success: false, error: 'Task history not found' };
        }

        const targetVersion = history.versions.find((v) => v.versionNumber === targetVersionNumber);
        if (!targetVersion) {
            return { success: false, error: `Version ${targetVersionNumber} not found` };
        }

        // Create a new version with the rolled-back content
        const newVersion = this.createVersion(
            taskId,
            targetVersion.prompt,
            {
                source: 'rollback',
                reason: reason || `Rolled back to version ${targetVersionNumber}`,
                labels: ['rollback'],
            },
            targetVersion.analysis
        );

        eventBus.emit('prompt:version:rollback', {
            taskId,
            fromVersionNumber: history.versions[history.versions.length - 2]?.versionNumber,
            toVersionNumber: targetVersionNumber,
            newVersionId: newVersion.id,
        });

        return { success: true, newVersion };
    }

    // ========================================
    // Version Management
    // ========================================

    /**
     * Add a label to a version
     */
    addLabel(versionId: string, label: string): boolean {
        const version = this.getVersion(versionId);
        if (!version) return false;

        if (!version.metadata.labels) {
            version.metadata.labels = [];
        }

        if (!version.metadata.labels.includes(label)) {
            version.metadata.labels.push(label);
            this.saveToStorage();
        }

        return true;
    }

    /**
     * Remove a label from a version
     */
    removeLabel(versionId: string, label: string): boolean {
        const version = this.getVersion(versionId);
        if (!version || !version.metadata.labels) return false;

        const index = version.metadata.labels.indexOf(label);
        if (index >= 0) {
            version.metadata.labels.splice(index, 1);
            this.saveToStorage();
            return true;
        }

        return false;
    }

    /**
     * Find versions by label
     */
    findVersionsByLabel(taskId: number, label: string): PromptVersion[] {
        const history = this.histories.get(taskId);
        if (!history) return [];

        return history.versions.filter(
            (v) => v.metadata.labels && v.metadata.labels.includes(label)
        );
    }

    /**
     * Set max versions for a task
     */
    setMaxVersions(taskId: number, maxVersions: number): void {
        const history = this.histories.get(taskId);
        if (!history) return;

        history.maxVersions = maxVersions;

        // Trim if needed
        if (history.versions.length > maxVersions) {
            const toRemove = history.versions.length - maxVersions;
            history.versions.splice(0, toRemove);
        }

        this.saveToStorage();
    }

    // ========================================
    // Cleanup
    // ========================================

    /**
     * Delete all versions for a task
     */
    deleteHistory(taskId: number): boolean {
        const deleted = this.histories.delete(taskId);
        if (deleted) {
            this.saveToStorage();
            eventBus.emit('prompt:history:deleted', { taskId });
        }
        return deleted;
    }

    /**
     * Delete a specific version (if not current)
     */
    deleteVersion(versionId: string): boolean {
        for (const [taskId, history] of this.histories.entries()) {
            const index = history.versions.findIndex((v) => v.id === versionId);
            if (index >= 0) {
                // Can't delete current version
                if (history.currentVersionId === versionId) {
                    return false;
                }

                history.versions.splice(index, 1);
                this.saveToStorage();

                eventBus.emit('prompt:version:deleted', { taskId, versionId });
                return true;
            }
        }
        return false;
    }

    /**
     * Clean up old versions (keep only N most recent per task)
     */
    cleanup(keepVersions: number = 10): number {
        let totalRemoved = 0;

        for (const history of this.histories.values()) {
            if (history.versions.length > keepVersions) {
                const toRemove = history.versions.length - keepVersions;
                history.versions.splice(0, toRemove);
                totalRemoved += toRemove;
            }
        }

        if (totalRemoved > 0) {
            this.saveToStorage();
        }

        return totalRemoved;
    }

    // ========================================
    // Statistics
    // ========================================

    /**
     * Get statistics for a task's prompt history
     */
    getStats(taskId: number): {
        totalVersions: number;
        firstVersion?: Date;
        lastVersion?: Date;
        avgScore?: number;
        scoreImprovement?: number;
        mostUsedSource: string;
    } | null {
        const history = this.histories.get(taskId);
        if (!history || history.versions.length === 0) return null;

        const versions = history.versions;
        const firstVersion = versions[0];
        const lastVersion = versions[versions.length - 1];

        if (!firstVersion || !lastVersion) return null;

        // Calculate average score
        const versionsWithScore = versions.filter((v) => v.analysis?.overallScore);
        const avgScore =
            versionsWithScore.length > 0
                ? versionsWithScore.reduce((sum, v) => sum + v.analysis!.overallScore, 0) /
                  versionsWithScore.length
                : undefined;

        // Calculate score improvement
        let scoreImprovement: number | undefined;
        if (firstVersion.analysis && lastVersion.analysis) {
            scoreImprovement =
                lastVersion.analysis.overallScore - firstVersion.analysis.overallScore;
        }

        // Find most used source
        const sourceCounts = new Map<string, number>();
        for (const version of versions) {
            const source = version.metadata.source;
            sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
        }
        const mostUsedSource =
            [...sourceCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'manual';

        return {
            totalVersions: versions.length,
            firstVersion: firstVersion.createdAt,
            lastVersion: lastVersion.createdAt,
            avgScore,
            scoreImprovement,
            mostUsedSource,
        };
    }
}

// Export singleton instance
export const promptVersionManager = new PromptVersionManager();
export default promptVersionManager;
