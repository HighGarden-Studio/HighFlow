/**
 * Google Drive Integration Service
 *
 * Provides Google Drive integration for syncing Skills
 * with support for upload, download, and change detection.
 */

import { getGoogleAuth } from '../auth/GoogleAuth';

// ========================================
// Types
// ========================================

export interface Skill {
    id: string;
    name: string;
    description: string;
    category: string;
    prompt: string;
    aiProvider: 'openai' | 'anthropic' | 'google' | 'local' | 'claude';
    aiModel?: string;
    mcpRequirements?: string[];
    inputSchema?: {
        type: 'object';
        properties: Record<string, { type: string; description?: string }>;
        required?: string[];
    };
    outputFormat?: 'text' | 'json' | 'markdown' | 'code';
    author?: string;
    version: string;
    tags?: string[];
    createdAt: string;
    updatedAt: string;
}

export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    size?: number;
    createdTime: string;
    modifiedTime: string;
    parents?: string[];
    webViewLink?: string;
    webContentLink?: string;
}

export interface DriveChange {
    type: 'added' | 'modified' | 'deleted';
    fileId: string;
    fileName?: string;
    file?: DriveFile;
    time: Date;
}

export interface SyncResult {
    added: Skill[];
    updated: Skill[];
    deleted: string[];
    errors: Array<{ fileId: string; error: string }>;
    syncedAt: Date;
}

export interface DriveFolder {
    id: string;
    name: string;
    path: string;
}

// ========================================
// Google Drive Integration Service
// ========================================

export class GoogleDriveIntegration {
    private skillsFolderId: string | null = null;
    private skillsCache: Map<string, { skill: Skill; fileId: string; modifiedTime: string }> =
        new Map();

    private changeCallback: ((changes: DriveChange[]) => void) | null = null;
    private pollingInterval: ReturnType<typeof setInterval> | null = null;

    private readonly baseUrl = 'https://www.googleapis.com/drive/v3';
    private readonly uploadUrl = 'https://www.googleapis.com/upload/drive/v3';
    private readonly skillsMimeType = 'application/json';

    // ========================================
    // Configuration
    // ========================================

    /**
     * Set the Skills folder by ID
     */
    async setSkillsFolder(folderId: string): Promise<void> {
        // Validate folder exists
        const folder = await this.getFile(folderId);

        if (folder.mimeType !== 'application/vnd.google-apps.folder') {
            throw new Error('The specified ID is not a folder');
        }

        this.skillsFolderId = folderId;
        this.skillsCache.clear();
    }

    /**
     * Get the current Skills folder ID
     */
    getSkillsFolderId(): string | null {
        return this.skillsFolderId;
    }

    /**
     * Create a Skills folder
     */
    async createSkillsFolder(name = 'AI Workflow Skills'): Promise<string> {
        const metadata = {
            name,
            mimeType: 'application/vnd.google-apps.folder',
        };

        const response = await this.driveRequest('/files', {
            method: 'POST',
            body: JSON.stringify(metadata),
        });

        this.skillsFolderId = response.id as string;
        return response.id as string;
    }

    /**
     * List folders in root or specific folder
     */
    async listFolders(parentId?: string): Promise<DriveFolder[]> {
        const query = parentId
            ? `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
            : `'root' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;

        const params = new URLSearchParams({
            q: query,
            fields: 'files(id,name,parents)',
            orderBy: 'name',
        });

        const response = await this.driveRequest(`/files?${params}`);
        const files = (response.files ?? []) as Array<Record<string, unknown>>;

        return files.map((f: Record<string, unknown>) => ({
            id: f.id as string,
            name: f.name as string,
            path: f.name as string, // Full path would need recursive lookup
        }));
    }

    // ========================================
    // Skills Sync
    // ========================================

    /**
     * Sync skills from Google Drive
     */
    async syncSkills(): Promise<SyncResult> {
        if (!this.skillsFolderId) {
            throw new Error('Skills folder not configured');
        }

        const result: SyncResult = {
            added: [],
            updated: [],
            deleted: [],
            errors: [],
            syncedAt: new Date(),
        };

        try {
            // Get all skill files in the folder
            const files = await this.listSkillFiles();
            const currentFileIds = new Set<string>();

            for (const file of files) {
                currentFileIds.add(file.id);

                try {
                    const cached = this.skillsCache.get(file.id);

                    if (cached && cached.modifiedTime === file.modifiedTime) {
                        // No changes
                        continue;
                    }

                    // Download and parse the skill
                    const skill = await this.downloadSkill(file.id);

                    if (cached) {
                        // Updated skill
                        result.updated.push(skill);
                    } else {
                        // New skill
                        result.added.push(skill);
                    }

                    // Update cache
                    this.skillsCache.set(file.id, {
                        skill,
                        fileId: file.id,
                        modifiedTime: file.modifiedTime,
                    });
                } catch (error) {
                    result.errors.push({
                        fileId: file.id,
                        error: error instanceof Error ? error.message : 'Unknown error',
                    });
                }
            }

            // Find deleted skills
            for (const [fileId] of this.skillsCache) {
                if (!currentFileIds.has(fileId)) {
                    const cached = this.skillsCache.get(fileId);
                    if (cached) {
                        result.deleted.push(cached.skill.id);
                        this.skillsCache.delete(fileId);
                    }
                }
            }
        } catch (error) {
            throw new Error(
                `Failed to sync skills: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }

        return result;
    }

    /**
     * Get all cached skills
     */
    getCachedSkills(): Skill[] {
        return Array.from(this.skillsCache.values()).map((c) => c.skill);
    }

    /**
     * Get a specific cached skill by ID
     */
    getCachedSkill(skillId: string): Skill | undefined {
        for (const cached of this.skillsCache.values()) {
            if (cached.skill.id === skillId) {
                return cached.skill;
            }
        }
        return undefined;
    }

    // ========================================
    // Upload / Download
    // ========================================

    /**
     * Upload a skill to Google Drive
     */
    async uploadSkill(skill: Skill): Promise<string> {
        if (!this.skillsFolderId) {
            throw new Error('Skills folder not configured');
        }

        const fileName = `${skill.id}.json`;
        const content = JSON.stringify(skill, null, 2);

        // Check if file already exists
        const existingFileId = this.findFileIdBySkillId(skill.id);

        if (existingFileId) {
            // Update existing file
            await this.updateFile(existingFileId, content);
            return existingFileId;
        }

        // Create new file
        const metadata = {
            name: fileName,
            parents: [this.skillsFolderId],
            mimeType: this.skillsMimeType,
        };

        const boundary = '-------314159265358979323846';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;

        const body =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            `Content-Type: ${this.skillsMimeType}\r\n\r\n` +
            content +
            closeDelimiter;

        const response = await this.uploadRequest('/files?uploadType=multipart', {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body,
        });
        const fileId = response.id as string;

        // Update cache
        this.skillsCache.set(fileId, {
            skill,
            fileId,
            modifiedTime: new Date().toISOString(),
        });

        return fileId;
    }

    /**
     * Download a skill from Google Drive
     */
    async downloadSkill(fileId: string): Promise<Skill> {
        const response = await this.driveRequest(`/files/${fileId}?alt=media`);

        // Validate skill structure
        this.validateSkill(response);

        return response as Skill;
    }

    /**
     * Delete a skill from Google Drive
     */
    async deleteSkill(skillId: string): Promise<void> {
        const fileId = this.findFileIdBySkillId(skillId);

        if (!fileId) {
            throw new Error(`Skill not found: ${skillId}`);
        }

        await this.driveRequest(`/files/${fileId}`, {
            method: 'DELETE',
        });

        this.skillsCache.delete(fileId);
    }

    // ========================================
    // Change Detection
    // ========================================

    /**
     * Watch folder for changes (polling-based)
     */
    async watchFolder(
        folderId: string,
        callback: (changes: DriveChange[]) => void,
        intervalMs = 30000
    ): Promise<void> {
        this.skillsFolderId = folderId;
        this.changeCallback = callback;

        // Initial sync to establish baseline
        await this.syncSkills();

        // Start polling
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        this.pollingInterval = setInterval(async () => {
            await this.checkForChanges();
        }, intervalMs);
    }

    /**
     * Stop watching for changes
     */
    stopWatching(): void {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }

        this.changeCallback = null;
    }

    /**
     * Check for changes since last sync
     */
    private async checkForChanges(): Promise<void> {
        if (!this.skillsFolderId || !this.changeCallback) {
            return;
        }

        try {
            const files = await this.listSkillFiles();
            const changes: DriveChange[] = [];
            const currentFileIds = new Set<string>();

            for (const file of files) {
                currentFileIds.add(file.id);

                const cached = this.skillsCache.get(file.id);

                if (!cached) {
                    // New file added
                    changes.push({
                        type: 'added',
                        fileId: file.id,
                        fileName: file.name,
                        file,
                        time: new Date(file.createdTime),
                    });
                } else if (cached.modifiedTime !== file.modifiedTime) {
                    // File modified
                    changes.push({
                        type: 'modified',
                        fileId: file.id,
                        fileName: file.name,
                        file,
                        time: new Date(file.modifiedTime),
                    });
                }
            }

            // Check for deleted files
            for (const [fileId, cached] of this.skillsCache) {
                if (!currentFileIds.has(fileId)) {
                    changes.push({
                        type: 'deleted',
                        fileId,
                        fileName: `${cached.skill.id}.json`,
                        time: new Date(),
                    });
                }
            }

            if (changes.length > 0) {
                // Update cache by syncing
                await this.syncSkills();

                // Notify callback
                this.changeCallback(changes);
            }
        } catch (error) {
            console.error('Error checking for changes:', error);
        }
    }

    // ========================================
    // Helper Methods
    // ========================================

    /**
     * List skill files in the skills folder
     */
    private async listSkillFiles(): Promise<DriveFile[]> {
        if (!this.skillsFolderId) {
            throw new Error('Skills folder not configured');
        }

        const query = `'${this.skillsFolderId}' in parents and mimeType='${this.skillsMimeType}' and trashed=false`;

        const params = new URLSearchParams({
            q: query,
            fields: 'files(id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink)',
            orderBy: 'name',
        });

        const response = await this.driveRequest(`/files?${params}`);
        const files = (response.files ?? []) as Array<Record<string, unknown>>;

        return files.map((f: Record<string, unknown>) => ({
            id: f.id as string,
            name: f.name as string,
            mimeType: f.mimeType as string,
            size: f.size ? parseInt(f.size as string) : undefined,
            createdTime: f.createdTime as string,
            modifiedTime: f.modifiedTime as string,
            parents: f.parents as string[] | undefined,
            webViewLink: f.webViewLink as string | undefined,
        }));
    }

    /**
     * Get file metadata
     */
    private async getFile(fileId: string): Promise<DriveFile> {
        const response = await this.driveRequest(
            `/files/${fileId}?fields=id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink`
        );

        return {
            id: response.id as string,
            name: response.name as string,
            mimeType: response.mimeType as string,
            size: response.size ? parseInt(String(response.size)) : undefined,
            createdTime: response.createdTime as string,
            modifiedTime: response.modifiedTime as string,
            parents: response.parents as string[] | undefined,
            webViewLink: response.webViewLink as string | undefined,
        };
    }

    /**
     * Update file content
     */
    private async updateFile(fileId: string, content: string): Promise<void> {
        await this.uploadRequest(`/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
                'Content-Type': this.skillsMimeType,
            },
            body: content,
        });

        // Update cache modification time
        const cached = this.skillsCache.get(fileId);
        if (cached) {
            const skill = JSON.parse(content) as Skill;
            this.skillsCache.set(fileId, {
                skill,
                fileId,
                modifiedTime: new Date().toISOString(),
            });
        }
    }

    /**
     * Find file ID by skill ID
     */
    private findFileIdBySkillId(skillId: string): string | null {
        for (const [fileId, cached] of this.skillsCache) {
            if (cached.skill.id === skillId) {
                return fileId;
            }
        }
        return null;
    }

    /**
     * Validate skill structure
     */
    private validateSkill(data: unknown): asserts data is Skill {
        const skill = data as Record<string, unknown>;

        const required = ['id', 'name', 'description', 'prompt', 'aiProvider', 'version'];

        for (const field of required) {
            if (!skill[field]) {
                throw new Error(`Invalid skill: missing required field '${field}'`);
            }
        }

        const validProviders = ['openai', 'anthropic', 'google', 'local', 'claude'];
        if (!validProviders.includes(skill.aiProvider as string)) {
            throw new Error(`Invalid skill: invalid aiProvider '${skill.aiProvider}'`);
        }
    }

    // ========================================
    // API Request Methods
    // ========================================

    private async driveRequest(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<Record<string, unknown>> {
        const auth = getGoogleAuth();
        if (!auth) {
            throw new Error('Google Auth not initialized');
        }

        const accessToken = await auth.getAccessToken();
        if (!accessToken) {
            throw new Error('Not authenticated with Google');
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (options.method === 'DELETE' && response.status === 204) {
            return {};
        }

        if (!response.ok) {
            const error = await response.json();
            throw new Error(
                `Google Drive API error: ${error.error?.message || response.statusText}`
            );
        }

        // Handle empty responses
        const text = await response.text();
        return text ? JSON.parse(text) : {};
    }

    private async uploadRequest(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<Record<string, unknown>> {
        const auth = getGoogleAuth();
        if (!auth) {
            throw new Error('Google Auth not initialized');
        }

        const accessToken = await auth.getAccessToken();
        if (!accessToken) {
            throw new Error('Not authenticated with Google');
        }

        const response = await fetch(`${this.uploadUrl}${endpoint}`, {
            ...options,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(
                `Google Drive API error: ${error.error?.message || response.statusText}`
            );
        }

        return response.json();
    }
}

// ========================================
// Skill Builder Helper
// ========================================

export class SkillBuilder {
    private skill: Partial<Skill> = {
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    setId(id: string): this {
        this.skill.id = id;
        return this;
    }

    setName(name: string): this {
        this.skill.name = name;
        return this;
    }

    setDescription(description: string): this {
        this.skill.description = description;
        return this;
    }

    setCategory(category: string): this {
        this.skill.category = category;
        return this;
    }

    setPrompt(prompt: string): this {
        this.skill.prompt = prompt;
        return this;
    }

    setAIProvider(provider: Skill['aiProvider']): this {
        this.skill.aiProvider = provider;
        return this;
    }

    setAIModel(model: string): this {
        this.skill.aiModel = model;
        return this;
    }

    setMCPRequirements(requirements: string[]): this {
        this.skill.mcpRequirements = requirements;
        return this;
    }

    setInputSchema(schema: Skill['inputSchema']): this {
        this.skill.inputSchema = schema;
        return this;
    }

    setOutputFormat(format: Skill['outputFormat']): this {
        this.skill.outputFormat = format;
        return this;
    }

    setAuthor(author: string): this {
        this.skill.author = author;
        return this;
    }

    setVersion(version: string): this {
        this.skill.version = version;
        return this;
    }

    setTags(tags: string[]): this {
        this.skill.tags = tags;
        return this;
    }

    build(): Skill {
        const required = ['id', 'name', 'description', 'prompt', 'aiProvider'];

        for (const field of required) {
            if (!this.skill[field as keyof Skill]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        this.skill.updatedAt = new Date().toISOString();

        return this.skill as Skill;
    }
}

// ========================================
// Singleton Instance
// ========================================

let googleDriveInstance: GoogleDriveIntegration | null = null;

export function initializeGoogleDrive(): GoogleDriveIntegration {
    if (!googleDriveInstance) {
        googleDriveInstance = new GoogleDriveIntegration();
    }
    return googleDriveInstance;
}

export function getGoogleDriveIntegration(): GoogleDriveIntegration | null {
    return googleDriveInstance;
}

export default GoogleDriveIntegration;
