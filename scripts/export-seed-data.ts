/**
 * Export Current Database to Seed Data
 *
 * This script exports the current database state to a JSON file
 * that can be used to update seed.ts
 */

import { db, schema } from '../electron/main/database/client';
import { eq } from 'drizzle-orm';
import { writeFileSync } from 'fs';
import { join } from 'path';

async function exportDbToSeed() {
    console.log('📦 Exporting database to seed format...\n');

    try {
        // Export projects
        const projects = await db.select().from(schema.projects);
        console.log(`✅ Found ${projects.length} projects`);

        // Export tasks for each project
        const projectsWithTasks = await Promise.all(
            projects.map(async (project) => {
                const tasks = await db
                    .select()
                    .from(schema.tasks)
                    .where(eq(schema.tasks.projectId, project.id));

                return {
                    project,
                    tasks,
                };
            })
        );

        console.log(
            `✅ Found ${projectsWithTasks.reduce((sum, p) => sum + p.tasks.length, 0)} total tasks\n`
        );

        // Export to JSON file
        const exportData = {
            exportedAt: new Date().toISOString(),
            projects: projectsWithTasks,
        };

        const outputPath = join(process.cwd(), 'scripts', 'seed-export.json');
        writeFileSync(outputPath, JSON.stringify(exportData, null, 2));

        console.log(`✅ Exported to: ${outputPath}\n`);
        console.log('📝 Next steps:');
        console.log('1. Review the exported JSON file');
        console.log('2. Update electron/main/database/seed.ts with this data');
        console.log('3. Adjust user IDs and team IDs as needed\n');
    } catch (error) {
        console.error('❌ Export failed:', error);
    }
}

// Run export
exportDbToSeed()
    .then(() => {
        console.log('✅ Export complete!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Export failed:', error);
        process.exit(1);
    });
