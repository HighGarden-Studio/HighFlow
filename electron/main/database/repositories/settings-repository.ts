/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
/**
 * Settings Repository
 *
 * Repository for managing application settings
 */

import { db } from '../client';
import { settings } from '../schema';
import { eq } from 'drizzle-orm';
import type { Setting, NewSetting } from '../schema';

export class SettingsRepository {
    /**
     * Get setting by key
     */
    async get(key: string): Promise<Setting | null> {
        const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
        return result[0] || null;
    }

    /**
     * Get setting value as string
     */
    async getValue(key: string): Promise<string | null> {
        const setting = await this.get(key);
        return setting?.value || null;
    }

    /**
     * Get setting value as JSON
     */
    async getJSON<T>(key: string): Promise<T | null> {
        const value = await this.getValue(key);
        if (!value) return null;

        try {
            return JSON.parse(value);
        } catch (error) {
            console.error(`Failed to parse JSON for setting ${key}:`, error);
            return null;
        }
    }

    /**
     * Set setting
     */
    async set(key: string, value: string): Promise<Setting> {
        const existing = await this.get(key);

        if (existing) {
            // Update existing
            await db
                .update(settings)
                .set({
                    value,
                    updatedAt: new Date(),
                })
                .where(eq(settings.key, key));

            return { ...existing, value, updatedAt: new Date() };
        } else {
            // Insert new
            const newSetting: NewSetting = {
                key,
                value,
            };

            await db.insert(settings).values(newSetting);

            const result = await this.get(key);
            if (!result) throw new Error(`Failed to create setting ${key}`);
            return result;
        }
    }

    /**
     * Set setting value as JSON
     */
    async setJSON(key: string, value: any): Promise<Setting> {
        return this.set(key, JSON.stringify(value));
    }

    /**
     * Delete setting
     */
    async delete(key: string): Promise<void> {
        await db.delete(settings).where(eq(settings.key, key));
    }

    /**
     * Get all settings
     */
    async getAll(): Promise<Setting[]> {
        return db.select().from(settings);
    }
}

// Singleton instance
export const settingsRepository = new SettingsRepository();
