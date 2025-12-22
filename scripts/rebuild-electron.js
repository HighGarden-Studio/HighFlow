#!/usr/bin/env node
/**
 * Rebuild better-sqlite3 for Electron
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🔨 Rebuilding better-sqlite3 for Electron...');

try {
    // Use electron-builder install-app-deps as it is more robust
    console.log('Running electron-builder install-app-deps...');

    execSync('pnpm electron-builder install-app-deps', {
        cwd: __dirname + '/..',
        stdio: 'inherit',
    });
    console.log('✅ better-sqlite3 rebuilt for Electron');
} catch (error) {
    console.error('❌ Failed to rebuild better-sqlite3 for Electron');
    console.error(error);
    process.exit(1);
}
