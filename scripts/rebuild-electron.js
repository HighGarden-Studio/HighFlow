#!/usr/bin/env node
/**
 * Rebuild better-sqlite3 for Electron
 */
const { execSync } = require('child_process');

console.log('🔨 Rebuilding better-sqlite3 for Electron...');
try {
    execSync('pnpm electron-rebuild -f -w better-sqlite3', {
        cwd: __dirname + '/..',
        stdio: 'inherit',
    });
    console.log('✅ better-sqlite3 rebuilt for Electron');
} catch (error) {
    console.error('❌ Failed to rebuild better-sqlite3 for Electron');
    process.exit(1);
}
