#!/usr/bin/env node
/**
 * Rebuild better-sqlite3 for Node.js (for migration scripts)
 */
const { execSync } = require('child_process');
const path = require('path');

const better_sqlite3_path = path.join(
    __dirname,
    '../node_modules/.pnpm/better-sqlite3@12.5.0/node_modules/better-sqlite3'
);

console.log('🔨 Rebuilding better-sqlite3 for Node.js...');
try {
    execSync('npx node-gyp rebuild', {
        cwd: better_sqlite3_path,
        stdio: 'inherit',
    });
    console.log('✅ better-sqlite3 rebuilt for Node.js');
} catch (error) {
    console.error('❌ Failed to rebuild better-sqlite3 for Node.js');
    process.exit(1);
}
