#!/usr/bin/env node
/**
 * Rebuild better-sqlite3 for Electron
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🔨 Rebuilding better-sqlite3 for Electron...');

try {
    // Read electron version from package.json
    const packageJson = JSON.parse(
        fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
    );
    const electronVersion = packageJson.devDependencies.electron.replace(/^[\^~=]/, '');

    console.log(`Targeting Electron version: ${electronVersion}`);

    execSync(`pnpm electron-rebuild -f -w better-sqlite3 -v ${electronVersion}`, {
        cwd: __dirname + '/..',
        stdio: 'inherit',
    });
    console.log('✅ better-sqlite3 rebuilt for Electron');
} catch (error) {
    console.error('❌ Failed to rebuild better-sqlite3 for Electron');
    console.error(error);
    process.exit(1);
}
