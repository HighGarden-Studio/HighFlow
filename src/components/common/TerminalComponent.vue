<template>
    <div ref="terminalContainer" class="h-full w-full bg-black overflow-hidden relative group">
        <!-- Optional: overlay controls if needed -->
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { useResizeObserver } from '@vueuse/core';

const props = defineProps<{
    id: string; // Unique session ID
    cwd?: string; // Current working directory
}>();

const terminalContainer = ref<HTMLElement | null>(null);
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let cleanupDataListener: (() => void) | null = null;
let cleanupExitListener: (() => void) | null = null;

// Initialize Terminal
const initTerminal = async () => {
    if (!terminalContainer.value) return;

    terminal = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
            background: '#0f0f0f', // Match app background
            foreground: '#ffffff',
            cursor: '#ffffff',
            selectionBackground: 'rgba(255, 255, 255, 0.3)',
        },
        allowProposedApi: true,
    });

    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(terminalContainer.value);

    // Initial Fit
    nextTick(() => {
        fitAddon?.fit();
        // After fit, we know the cols/rows
        if (terminal && fitAddon) {
            connectToBackend(terminal.cols, terminal.rows);
        }
    });

    // Handle user input
    terminal.onData((data) => {
        window.electron.terminal.write(props.id, data);
    });
};

const connectToBackend = async (cols: number, rows: number) => {
    // Create session in backend
    try {
        await window.electron.terminal.create(props.id, props.cwd, cols, rows);
    } catch (err) {
        terminal?.writeln(`\r\n\x1b[31mFailed to start shell: ${err}\x1b[0m\r\n`);
        return;
    }

    // Listen for data
    if (cleanupDataListener) cleanupDataListener();
    cleanupDataListener = window.electron.terminal.onData(props.id, (data) => {
        terminal?.write(data);
    });

    // Listen for exit
    if (cleanupExitListener) cleanupExitListener();
    cleanupExitListener = window.electron.terminal.onExit(props.id, ({ exitCode }) => {
        terminal?.writeln(`\r\n\x1b[33mProcess exited with code ${exitCode}\x1b[0m\r\n`);
    });
};

// Handle Resize
useResizeObserver(terminalContainer, () => {
    if (!fitAddon || !terminal) return;

    try {
        fitAddon.fit();
        window.electron.terminal.resize(props.id, terminal.cols, terminal.rows);
    } catch (e) {
        // Ignore resize errors if element is hidden
    }
});

onMounted(() => {
    initTerminal();
});

onBeforeUnmount(async () => {
    if (cleanupDataListener) cleanupDataListener();
    if (cleanupExitListener) cleanupExitListener();

    // Kill backend session
    await window.electron.terminal.kill(props.id);

    terminal?.dispose();
});

// Watch cwd changes to restart?
// Usually integrated terminals don't change cwd dynamically like this without restarting shell,
// so we might assume this component is re-mounted if session changes.
</script>

<style scoped>
:deep(.xterm-viewport) {
    overflow-y: auto !important;
}
</style>
