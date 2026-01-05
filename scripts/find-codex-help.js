const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function getNvmBinPaths(home) {
    const nvmVersionsDir = path.join(home, '.nvm', 'versions', 'node');
    const paths = [];

    try {
        if (fs.existsSync(nvmVersionsDir)) {
            const versions = fs.readdirSync(nvmVersionsDir);
            for (const version of versions) {
                const binPath = path.join(nvmVersionsDir, version, 'bin');
                if (fs.existsSync(binPath)) {
                    paths.push(binPath);
                }
            }
        }
    } catch (error) {
        console.warn('Failed to scan nvm directories:', error);
    }
    return paths;
}

function getEnhancedPath() {
    const currentPath = process.env.PATH || '';
    const additionalPaths = [];
    const home = process.env.HOME || '';

    additionalPaths.push(...getNvmBinPaths(home));
    additionalPaths.push(
        '/usr/local/bin',
        '/opt/homebrew/bin',
        path.join(home, '.npm-global/bin'),
        path.join(home, '.local/bin'),
        path.join(home, '.yarn/bin'),
        path.join(home, '.pnpm'),
        '/usr/bin'
    );

    return [...additionalPaths, currentPath].join(':');
}

const env = { ...process.env, PATH: getEnhancedPath() };

console.log('Running codex --help...');
const child = spawn('codex', ['--help'], { env, stdio: 'inherit' });

child.on('error', (err) => {
    console.error('Failed to start codex:', err);
});

child.on('close', (code) => {
    console.log(`Child process exited with code ${code}`);
});
