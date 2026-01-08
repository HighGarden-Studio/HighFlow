import { build } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

async function buildMain() {
    console.log('\n🔨 Building Electron Main Process...\n');

    const nodeExternalDeps = [
        'electron',
        'better-sqlite3',
        '@modelcontextprotocol/sdk',
        'path',
        'fs',
        'url',
        'os',
        'crypto',
        'events',
        'util',
        'stream',
        'buffer',
        'child_process',
        'process',
        'node:path',
        'node:fs',
        'node:url',
        'node:os',
        'node:crypto',
        'node:events',
        'node:util',
        'node:stream',
        'node:buffer',
        'node:child_process',
        'node:process',
    ];

    // Build main process
    await build({
        configFile: false,
        build: {
            target: 'node20',
            ssr: true,
            outDir: 'dist-electron/main',
            lib: {
                entry: path.join(ROOT, 'electron/main/index.ts'),
                formats: ['cjs'],
                fileName: () => 'index.cjs',
            },
            rollupOptions: {
                external: (id) => {
                    if (nodeExternalDeps.includes(id)) return true;
                    if (id.startsWith('@modelcontextprotocol/sdk')) return true;
                    if (id.startsWith('node:')) return true;
                    return false;
                },
                output: {
                    entryFileNames: '[name].cjs',
                },
            },
            minify: false, // Keep false for debugging, or true for prod
            sourcemap: true,
            emptyOutDir: true,
        },
        resolve: {
            alias: {
                '@electron': path.join(ROOT, 'electron'),
            },
        },
    });

    // Build preload script
    await build({
        configFile: false,
        build: {
            target: 'node20',
            ssr: true,
            outDir: 'dist-electron/preload',
            lib: {
                entry: path.join(ROOT, 'electron/preload/index.ts'),
                formats: ['cjs'],
                fileName: () => 'index.cjs',
            },
            rollupOptions: {
                external: ['electron', 'node:process', 'process'],
                output: {
                    entryFileNames: '[name].cjs',
                },
            },
            minify: false,
            sourcemap: true,
            emptyOutDir: true,
        },
    });

    console.log('✅ Electron files built successfully\n');

    // Copy migrations folder
    const srcMigrations = path.join(ROOT, 'electron/main/database/migrations');
    const destMigrations = path.join(ROOT, 'dist-electron/main/migrations');

    if (fs.existsSync(srcMigrations)) {
        console.log('📂 Copying migrations folder...');
        fs.cpSync(srcMigrations, destMigrations, { recursive: true });
    }
}

buildMain().catch((err) => {
    console.error(err);
    process.exit(1);
});
