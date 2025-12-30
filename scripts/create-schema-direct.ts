import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from '../electron/main/database/schema';
import { sql } from 'drizzle-orm';

const dbPath = '.dev-data/workflow-manager.db';
console.log(`Creating schema in: ${dbPath}`);

try {
    const sqlite = new Database(dbPath);
    const db = drizzle(sqlite, { schema });

    // Get all tables from schema
    const tables = Object.entries(schema).filter(
        ([_, value]) => value && typeof value === 'object' && 'getSQL' in value
    );

    console.log(`Found ${tables.length} tables to create`);

    // Create tables directly via CREATE TABLE statements
    for (const [tableName, table] of tables) {
        try {
            const createSQL = (table as any).getSQL?.();
            if (createSQL) {
                console.log(`Creating table: ${tableName}`);
                sqlite.exec(createSQL);
            }
        } catch (error) {
            console.error(`Failed to create ${tableName}:`, error);
        }
    }

    console.log('✅ Schema created successfully');
    sqlite.close();
    process.exit(0);
} catch (error) {
    console.error('❌ Schema creation failed:', error);
    process.exit(1);
}
