import { db, schema } from '../client';
import { eq } from 'drizzle-orm';
import type { User, NewUser } from '../schema';

export class UserRepository {
    /**
     * Find user by ID
     */
    async findById(id: number): Promise<User | undefined> {
        const result = await db.select().from(schema.users).where(eq(schema.users.id, id));
        return result[0];
    }

    /**
     * Find user by Email
     */
    async findByEmail(email: string): Promise<User | undefined> {
        const result = await db.select().from(schema.users).where(eq(schema.users.email, email));
        return result[0];
    }

    /**
     * Find user by Google ID
     */
    async findByGoogleId(googleId: string): Promise<User | undefined> {
        const result = await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.googleId, googleId));
        return result[0];
    }

    /**
     * Find first user (for fallback)
     */
    async findFirst(): Promise<User | undefined> {
        const result = await db.select().from(schema.users).limit(1);
        return result[0];
    }

    /**
     * Create new user
     */
    async create(data: NewUser): Promise<User> {
        const result = await db.insert(schema.users).values(data).returning();
        if (!result[0]) throw new Error('Failed to create user');
        return result[0];
    }

    /**
     * Update user
     */
    async update(id: number, data: Partial<NewUser>): Promise<User> {
        const result = await db
            .update(schema.users)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(schema.users.id, id))
            .returning();
        if (!result[0]) throw new Error('User not found');
        return result[0];
    }

    /**
     * Ensure user exists by email (Find or Create)
     */
    async ensureUser(data: {
        email: string;
        name: string;
        googleId?: string;
        avatar?: string;
    }): Promise<User> {
        // 1. Try to find by email
        let user = await this.findByEmail(data.email);

        if (user) {
            // Update googleId if missing and provided
            if (data.googleId && !user.googleId) {
                user = await this.update(user.id, { googleId: data.googleId });
            }
            return user;
        }

        // 2. Try to find by googleId if provided
        if (data.googleId) {
            user = await this.findByGoogleId(data.googleId);
            if (user) {
                // Update email if different? (Usually google email is primary)
                return user;
            }
        }

        // 3. Create new user
        return await this.create({
            email: data.email,
            name: data.name,
            googleId: data.googleId,
            avatar: data.avatar,
            role: 'member',
            preferences: {},
            onboardingCompleted: false,
        });
    }
}

export const userRepository = new UserRepository();
