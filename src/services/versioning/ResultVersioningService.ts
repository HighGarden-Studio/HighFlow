/**
 * Result Versioning Service
 *
 * Manages version history for task results and file outputs.
 * Allows users to view previous versions, compare changes, and rollback.
 *
 * Features:
 * - Automatic versioning of task outputs
 * - Diff generation between versions
 * - Rollback to previous versions
 * - Version metadata (author, timestamp, reason)
 * - Storage optimization (delta compression for large outputs)
 */

// ========================================
// Types
// ========================================

export interface Version {
    /** Version ID */
    id: string;
    /** Version number (v1, v2, etc.) */
    versionNumber: number;
    /** Parent task ID */
    taskId: number;
    /** Content type */
    contentType: 'text' | 'json' | 'binary' | 'file';
    /** The actual content or file path */
    content: string;
    /** Size in bytes */
    size: number;
    /** SHA256 hash for integrity */
    hash: string;
    /** Whether this is stored as delta from previous version */
    isDelta: boolean;
    /** Reference to previous version if delta */
    baseVersionId?: string;
    /** Metadata */
    metadata: VersionMetadata;
    /** Creation timestamp */
    createdAt: Date;
}

export interface VersionMetadata {
    /** Who created this version (user or AI provider) */
    author: string;
    /** Reason for the change */
    reason?: string;
    /** AI model used (if applicable) */
    aiModel?: string;
    /** Cost to generate (if applicable) */
    cost?: number;
    /** Token usage */
    tokens?: number;
    /** Custom labels */
    labels?: string[];
    /** Additional data */
    extra?: Record<string, unknown>;
}

export interface VersionDiff {
    /** Unique diff ID */
    id: string;
    /** From version */
    fromVersionId: string;
    fromVersionNumber: number;
    /** To version */
    toVersionId: string;
    toVersionNumber: number;
    /** Type of diff */
    diffType: 'text' | 'json' | 'binary';
    /** Diff content (unified diff format for text) */
    diff: string;
    /** Statistics */
    stats: DiffStats;
}

export interface DiffStats {
    /** Lines/items added */
    additions: number;
    /** Lines/items removed */
    deletions: number;
    /** Lines/items changed */
    changes: number;
    /** Total lines/items in old version */
    oldSize: number;
    /** Total lines/items in new version */
    newSize: number;
}

export interface VersionHistory {
    /** Task ID */
    taskId: number;
    /** All versions for this task */
    versions: Version[];
    /** Currently active version */
    currentVersionId: string;
    /** Total number of versions */
    totalVersions: number;
}

export interface RollbackResult {
    /** Whether rollback succeeded */
    success: boolean;
    /** The restored version */
    restoredVersion?: Version;
    /** New version created from rollback */
    newVersion?: Version;
    /** Error message if failed */
    error?: string;
}

// ========================================
// Result Versioning Service
// ========================================

class ResultVersioningService {
    private versions: Map<string, Version> = new Map();
    private taskVersions: Map<number, string[]> = new Map(); // taskId -> versionIds
    private currentVersions: Map<number, string> = new Map(); // taskId -> current versionId

    // Configuration
    private maxVersionsPerTask = 50;
    private deltaThresholdBytes = 10000; // Use delta for content > 10KB

    /**
     * Create a new version for a task result
     */
    createVersion(
        taskId: number,
        content: string,
        contentType: Version['contentType'],
        metadata: Partial<VersionMetadata> = {}
    ): Version {
        const existingVersions = this.taskVersions.get(taskId) || [];
        const versionNumber = existingVersions.length + 1;

        // Check if we should use delta compression
        const previousVersion = this.getLatestVersion(taskId);
        let isDelta = false;
        let baseVersionId: string | undefined;
        let storedContent = content;

        if (
            previousVersion &&
            contentType === 'text' &&
            content.length > this.deltaThresholdBytes
        ) {
            // Create delta
            const delta = this.createDelta(previousVersion.content, content);
            if (delta.length < content.length * 0.5) {
                // Only use delta if it saves > 50%
                isDelta = true;
                baseVersionId = previousVersion.id;
                storedContent = delta;
            }
        }

        const version: Version = {
            id: this.generateId(),
            versionNumber,
            taskId,
            contentType,
            content: storedContent,
            size: content.length,
            hash: this.hashContent(content),
            isDelta,
            baseVersionId,
            metadata: {
                author: metadata.author || 'system',
                reason: metadata.reason,
                aiModel: metadata.aiModel,
                cost: metadata.cost,
                tokens: metadata.tokens,
                labels: metadata.labels || [],
                extra: metadata.extra,
            },
            createdAt: new Date(),
        };

        // Store version
        this.versions.set(version.id, version);

        // Update task version list
        existingVersions.push(version.id);
        this.taskVersions.set(taskId, existingVersions);

        // Set as current version
        this.currentVersions.set(taskId, version.id);

        // Cleanup old versions if exceeding limit
        this.cleanupOldVersions(taskId);

        console.log(`[Versioning] Created version v${versionNumber} for task ${taskId}`);
        return version;
    }

    /**
     * Get a specific version
     */
    getVersion(versionId: string): Version | undefined {
        const version = this.versions.get(versionId);
        if (!version) return undefined;

        // If delta, reconstruct full content
        if (version.isDelta && version.baseVersionId) {
            const reconstructed = { ...version };
            reconstructed.content = this.reconstructFromDelta(version);
            return reconstructed;
        }

        return version;
    }

    /**
     * Get latest version for a task
     */
    getLatestVersion(taskId: number): Version | undefined {
        const versionId = this.currentVersions.get(taskId);
        if (!versionId) return undefined;
        return this.getVersion(versionId);
    }

    /**
     * Get version history for a task
     */
    getVersionHistory(taskId: number): VersionHistory | undefined {
        const versionIds = this.taskVersions.get(taskId);
        if (!versionIds || versionIds.length === 0) return undefined;

        const versions = versionIds
            .map((id) => this.getVersion(id))
            .filter((v): v is Version => v !== undefined)
            .sort((a, b) => b.versionNumber - a.versionNumber);

        const currentVersionId = this.currentVersions.get(taskId);

        return {
            taskId,
            versions,
            currentVersionId: currentVersionId || versions[0]?.id || '',
            totalVersions: versions.length,
        };
    }

    /**
     * Get version by number for a task
     */
    getVersionByNumber(taskId: number, versionNumber: number): Version | undefined {
        const versionIds = this.taskVersions.get(taskId);
        if (!versionIds) return undefined;

        for (const id of versionIds) {
            const version = this.versions.get(id);
            if (version && version.versionNumber === versionNumber) {
                return this.getVersion(id);
            }
        }

        return undefined;
    }

    /**
     * Compare two versions and generate diff
     */
    compareVersions(fromVersionId: string, toVersionId: string): VersionDiff | null {
        const fromVersion = this.getVersion(fromVersionId);
        const toVersion = this.getVersion(toVersionId);

        if (!fromVersion || !toVersion) {
            return null;
        }

        const diff = this.generateDiff(fromVersion.content, toVersion.content);
        const stats = this.calculateDiffStats(fromVersion.content, toVersion.content);

        return {
            id: this.generateId(),
            fromVersionId,
            fromVersionNumber: fromVersion.versionNumber,
            toVersionId,
            toVersionNumber: toVersion.versionNumber,
            diffType: fromVersion.contentType === 'json' ? 'json' : 'text',
            diff,
            stats,
        };
    }

    /**
     * Compare adjacent versions
     */
    compareWithPrevious(versionId: string): VersionDiff | null {
        const version = this.versions.get(versionId);
        if (!version) return null;

        const previousVersion = this.getVersionByNumber(version.taskId, version.versionNumber - 1);
        if (!previousVersion) return null;

        return this.compareVersions(previousVersion.id, versionId);
    }

    /**
     * Rollback to a previous version
     */
    rollback(taskId: number, targetVersionNumber: number, reason?: string): RollbackResult {
        const targetVersion = this.getVersionByNumber(taskId, targetVersionNumber);

        if (!targetVersion) {
            return {
                success: false,
                error: `버전 v${targetVersionNumber}을 찾을 수 없습니다.`,
            };
        }

        // Create a new version with the old content
        const newVersion = this.createVersion(
            taskId,
            targetVersion.content,
            targetVersion.contentType,
            {
                author: 'system',
                reason: reason || `v${targetVersionNumber}에서 롤백`,
                labels: ['rollback'],
                extra: {
                    rolledBackFrom: targetVersionNumber,
                },
            }
        );

        return {
            success: true,
            restoredVersion: targetVersion,
            newVersion,
        };
    }

    /**
     * Delete a specific version
     */
    deleteVersion(versionId: string): boolean {
        const version = this.versions.get(versionId);
        if (!version) return false;

        // Don't delete if other versions depend on it (delta base)
        for (const v of this.versions.values()) {
            if (v.baseVersionId === versionId) {
                // Reconstruct the dependent version first
                v.content = this.reconstructFromDelta(v);
                v.isDelta = false;
                v.baseVersionId = undefined;
            }
        }

        // Remove from task versions list
        const taskVersions = this.taskVersions.get(version.taskId);
        if (taskVersions) {
            const index = taskVersions.indexOf(versionId);
            if (index > -1) {
                taskVersions.splice(index, 1);
                this.taskVersions.set(version.taskId, taskVersions);
            }
        }

        // If current version, update to latest
        if (this.currentVersions.get(version.taskId) === versionId) {
            const remaining = this.taskVersions.get(version.taskId);
            if (remaining && remaining.length > 0) {
                this.currentVersions.set(version.taskId, remaining[remaining.length - 1]!);
            } else {
                this.currentVersions.delete(version.taskId);
            }
        }

        this.versions.delete(versionId);
        return true;
    }

    /**
     * Add label to a version
     */
    addLabel(versionId: string, label: string): boolean {
        const version = this.versions.get(versionId);
        if (!version) return false;

        if (!version.metadata.labels) {
            version.metadata.labels = [];
        }

        if (!version.metadata.labels.includes(label)) {
            version.metadata.labels.push(label);
        }

        return true;
    }

    /**
     * Get versions by label
     */
    getVersionsByLabel(taskId: number, label: string): Version[] {
        const versionIds = this.taskVersions.get(taskId) || [];
        return versionIds
            .map((id) => this.getVersion(id))
            .filter(
                (v): v is Version =>
                    v !== undefined && (v.metadata.labels?.includes(label) ?? false)
            );
    }

    // ========================================
    // Private Helpers
    // ========================================

    private cleanupOldVersions(taskId: number): void {
        const versionIds = this.taskVersions.get(taskId);
        if (!versionIds || versionIds.length <= this.maxVersionsPerTask) return;

        // Keep labeled versions and most recent
        const toKeep = new Set<string>();
        const versionsWithLabels = versionIds.filter((id) => {
            const v = this.versions.get(id);
            return v && v.metadata.labels && v.metadata.labels.length > 0;
        });

        versionsWithLabels.forEach((id) => toKeep.add(id));

        // Always keep the most recent versions
        const recentCount = Math.min(10, this.maxVersionsPerTask - toKeep.size);
        const recent = versionIds.slice(-recentCount);
        recent.forEach((id) => toKeep.add(id));

        // Delete others
        for (const id of versionIds) {
            if (!toKeep.has(id)) {
                this.deleteVersion(id);
            }
        }
    }

    private generateDiff(oldContent: string, newContent: string): string {
        // Simple line-by-line diff
        const oldLines = oldContent.split('\n');
        const newLines = newContent.split('\n');
        const diff: string[] = [];

        const maxLen = Math.max(oldLines.length, newLines.length);

        for (let i = 0; i < maxLen; i++) {
            const oldLine = oldLines[i];
            const newLine = newLines[i];

            if (oldLine === undefined) {
                diff.push(`+ ${newLine}`);
            } else if (newLine === undefined) {
                diff.push(`- ${oldLine}`);
            } else if (oldLine !== newLine) {
                diff.push(`- ${oldLine}`);
                diff.push(`+ ${newLine}`);
            } else {
                diff.push(`  ${oldLine}`);
            }
        }

        return diff.join('\n');
    }

    private calculateDiffStats(oldContent: string, newContent: string): DiffStats {
        const oldLines = oldContent.split('\n');
        const newLines = newContent.split('\n');

        let additions = 0;
        let deletions = 0;
        let changes = 0;

        const oldSet = new Set(oldLines);
        const newSet = new Set(newLines);

        for (const line of newLines) {
            if (!oldSet.has(line)) {
                additions++;
            }
        }

        for (const line of oldLines) {
            if (!newSet.has(line)) {
                deletions++;
            }
        }

        changes = Math.min(additions, deletions);
        additions -= changes;
        deletions -= changes;

        return {
            additions,
            deletions,
            changes,
            oldSize: oldLines.length,
            newSize: newLines.length,
        };
    }

    private createDelta(baseContent: string, newContent: string): string {
        // Simple delta: store as JSON with operation list
        // In production, use a proper diff algorithm like Myers
        // const operations = [];

        // For now, just use the full diff as delta
        return JSON.stringify({
            type: 'delta',
            diff: this.generateDiff(baseContent, newContent),
        });
    }

    private reconstructFromDelta(version: Version): string {
        if (!version.isDelta || !version.baseVersionId) {
            return version.content;
        }

        const baseVersion = this.versions.get(version.baseVersionId);
        if (!baseVersion) {
            console.error(`Base version ${version.baseVersionId} not found`);
            return version.content;
        }

        // Get base content (recursively if needed)
        let baseContent = baseVersion.content;
        if (baseVersion.isDelta) {
            baseContent = this.reconstructFromDelta(baseVersion);
        }

        // Apply delta
        try {
            const delta: any = JSON.parse(version.content);
            if (delta.type === 'delta' && delta.diff) {
                // Reconstruct from diff (simplified)
                return this.applyDiff(baseContent, delta.diff);
            }
        } catch {
            console.error('Failed to parse delta');
        }

        return version.content;
    }

    private applyDiff(_baseContent: string, diff: string): string {
        // Simplified diff application
        const lines = diff.split('\n');
        const result: string[] = [];

        for (const line of lines) {
            if (line.startsWith('+ ')) {
                result.push(line.slice(2));
            } else if (line.startsWith('  ')) {
                result.push(line.slice(2));
            }
            // Skip '- ' lines (deletions)
        }

        return result.join('\n');
    }

    private hashContent(content: string): string {
        // Simple hash (in production, use crypto.subtle.digest)
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    }

    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Clear all version data
     */
    clear(): void {
        this.versions.clear();
        this.taskVersions.clear();
        this.currentVersions.clear();
    }
}

// Export singleton
export const resultVersioningService = new ResultVersioningService();

// Export composable
export function useResultVersioning() {
    return {
        // Version management
        createVersion: (
            taskId: number,
            content: string,
            contentType: Version['contentType'],
            metadata?: Partial<VersionMetadata>
        ) => resultVersioningService.createVersion(taskId, content, contentType, metadata),
        getVersion: (versionId: string) => resultVersioningService.getVersion(versionId),
        getLatestVersion: (taskId: number) => resultVersioningService.getLatestVersion(taskId),
        getVersionHistory: (taskId: number) => resultVersioningService.getVersionHistory(taskId),
        getVersionByNumber: (taskId: number, versionNumber: number) =>
            resultVersioningService.getVersionByNumber(taskId, versionNumber),
        deleteVersion: (versionId: string) => resultVersioningService.deleteVersion(versionId),

        // Comparison
        compareVersions: (fromVersionId: string, toVersionId: string) =>
            resultVersioningService.compareVersions(fromVersionId, toVersionId),
        compareWithPrevious: (versionId: string) =>
            resultVersioningService.compareWithPrevious(versionId),

        // Rollback
        rollback: (taskId: number, targetVersionNumber: number, reason?: string) =>
            resultVersioningService.rollback(taskId, targetVersionNumber, reason),

        // Labels
        addLabel: (versionId: string, label: string) =>
            resultVersioningService.addLabel(versionId, label),
        getVersionsByLabel: (taskId: number, label: string) =>
            resultVersioningService.getVersionsByLabel(taskId, label),

        // Utility
        clear: () => resultVersioningService.clear(),
    };
}
