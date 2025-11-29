/**
 * Development Script
 *
 * Runs Vite dev server and Electron in development mode with hot reload
 */

import { spawn, ChildProcess } from 'node:child_process';
import { createServer, build, ViteDevServer } from 'vite';
import electron from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { watch } from 'node:fs';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

// Configuration
const VITE_DEV_SERVER_PORT = 5173;
const ELECTRON_ENTRY = path.join(ROOT, 'dist-electron/main/index.cjs');

let electronProcess: ChildProcess | null = null;
let viteServer: ViteDevServer | null = null;

/**
 * Build Electron main process and preload scripts
 */
async function buildElectronFiles(): Promise<void> {
    console.log('\n🔨 Building Electron files...\n');

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
                    // Check against static list
                    if (nodeExternalDeps.includes(id)) return true;
                    // Check for MCP SDK subpaths
                    if (id.startsWith('@modelcontextprotocol/sdk')) return true;
                    // Check for node: protocol
                    if (id.startsWith('node:')) return true;
                    return false;
                },
                output: {
                    entryFileNames: '[name].cjs',
                },
            },
            minify: false,
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

/**
 * Start Vite development server
 */
async function startViteServer(): Promise<ViteDevServer> {
    console.log('🚀 Starting Vite dev server...\n');

    const server = await createServer({
        configFile: path.join(ROOT, 'vite.config.ts'),
        server: {
            port: VITE_DEV_SERVER_PORT,
            strictPort: true,
        },
    });

    await server.listen();
    server.printUrls();

    return server;
}

/**
 * Start Electron process
 */
function startElectron(): ChildProcess {
    console.log('\n⚡ Starting Electron...\n');

    const args = [
        ELECTRON_ENTRY,
        '--inspect=5858', // Enable remote debugging
    ];

    const env = {
        ...process.env,
        NODE_ENV: 'development',
        VITE_DEV_SERVER_URL: `http://localhost:${VITE_DEV_SERVER_PORT}`,
    };

    const proc = spawn(electron as unknown as string, args, {
        cwd: ROOT,
        env,
        stdio: 'inherit',
    });

    proc.on('close', (code) => {
        if (code !== null) {
            console.log(`\nElectron exited with code ${code}`);
            cleanup();
        }
    });

    return proc;
}

/**
 * Restart Electron process
 */
function restartElectron(): void {
    console.log('\n🔄 Restarting Electron...\n');

    if (electronProcess) {
        electronProcess.kill('SIGTERM');
        electronProcess = null;
    }

    electronProcess = startElectron();
}

/**
 * Watch for changes in Electron files
 */
function watchElectronFiles(): void {
    const electronDir = path.join(ROOT, 'electron');
    let debounceTimer: NodeJS.Timeout | null = null;

    console.log('👀 Watching Electron files for changes...\n');

    const rebuild = async () => {
        try {
            await buildElectronFiles();
            restartElectron();
        } catch (error) {
            console.error('Error rebuilding Electron files:', error);
        }
    };

    watch(electronDir, { recursive: true }, (_event, filename) => {
        if (filename?.endsWith('.ts')) {
            console.log(`\n📝 Change detected: ${filename}`);

            // Debounce rebuilds
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(rebuild, 300);
        }
    });
}

/**
 * Cleanup on exit
 */
function cleanup(): void {
    console.log('\n🧹 Cleaning up...\n');

    if (electronProcess) {
        electronProcess.kill('SIGTERM');
    }

    if (viteServer) {
        viteServer.close();
    }

    process.exit(0);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
    console.log('\n===========================================');
    console.log('   AI Workflow Manager - Development Mode');
    console.log('===========================================\n');

    // Handle cleanup signals
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    try {
        // Step 1: Build Electron files
        await buildElectronFiles();

        // Step 2: Start Vite dev server
        viteServer = await startViteServer();

        // Step 3: Start Electron
        electronProcess = startElectron();

        // Step 4: Watch for Electron file changes
        watchElectronFiles();
    } catch (error) {
        console.error('Failed to start development server:', error);
        cleanup();
    }
}

// Run
main();
