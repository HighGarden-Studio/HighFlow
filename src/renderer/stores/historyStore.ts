/**
 * History Store - Managing Undo/Redo Stacks
 *
 * Implements Command Pattern for reversible operations
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Command } from '../../core/commands/Command';

const MAX_HISTORY_SIZE = 50;

export const useHistoryStore = defineStore('history', () => {
    // ========================================
    // State
    // ========================================

    const undoStack = ref<Command[]>([]);
    const redoStack = ref<Command[]>([]);
    const isExecuting = ref(false); // Prevent recursive history during undo/redo

    // ========================================
    // Getters
    // ========================================

    const canUndo = computed(() => undoStack.value.length > 0);
    const canRedo = computed(() => redoStack.value.length > 0);

    const undoDescription = computed(() => {
        const last = undoStack.value[undoStack.value.length - 1];
        return last?.description || '';
    });

    const redoDescription = computed(() => {
        const last = redoStack.value[redoStack.value.length - 1];
        return last?.description || '';
    });

    // ========================================
    // Actions
    // ========================================

    /**
     * Execute a command and add it to history
     */
    async function executeCommand(command: Command): Promise<void> {
        if (isExecuting.value) {
            // Don't add to history if we're doing undo/redo
            await command.execute();
            return;
        }

        try {
            await command.execute();

            // Add to undo stack
            undoStack.value.push(command);

            // Limit stack size
            if (undoStack.value.length > MAX_HISTORY_SIZE) {
                undoStack.value.shift(); // Remove oldest
            }

            // Clear redo stack when new command is executed
            redoStack.value = [];

            console.log(`✅ Command executed: ${command.description}`);
        } catch (error) {
            console.error('Command execution failed:', error);
            throw error;
        }
    }

    /**
     * Undo the last command
     */
    async function undo(): Promise<void> {
        if (!canUndo.value) {
            console.warn('Nothing to undo');
            return;
        }

        const command = undoStack.value.pop();
        if (!command) return;

        isExecuting.value = true;
        try {
            await command.undo();
            redoStack.value.push(command);
            console.log(`↩️ Undone: ${command.description}`);
        } catch (error) {
            console.error('Undo failed:', error);
            // Put it back on undo stack if undo fails
            undoStack.value.push(command);
            throw error;
        } finally {
            isExecuting.value = false;
        }
    }

    /**
     * Redo the last undone command
     */
    async function redo(): Promise<void> {
        if (!canRedo.value) {
            console.warn('Nothing to redo');
            return;
        }

        const command = redoStack.value.pop();
        if (!command) return;

        isExecuting.value = true;
        try {
            await command.execute();
            undoStack.value.push(command);
            console.log(`↪️ Redone: ${command.description}`);
        } catch (error) {
            console.error('Redo failed:', error);
            // Put it back on redo stack if redo fails
            redoStack.value.push(command);
            throw error;
        } finally {
            isExecuting.value = false;
        }
    }

    /**
     * Clear all history (e.g., when switching projects)
     */
    function clear(): void {
        undoStack.value = [];
        redoStack.value = [];
        console.log('🗑️ History cleared');
    }

    /**
     * Get current history state for debugging
     */
    function getHistorySnapshot() {
        return {
            undoStack: undoStack.value.map((c: Command) => c.description),
            redoStack: redoStack.value.map((c: Command) => c.description),
            canUndo: canUndo.value,
            canRedo: canRedo.value,
        };
    }

    return {
        // State
        undoStack,
        redoStack,
        isExecuting,
        // Getters
        canUndo,
        canRedo,
        undoDescription,
        redoDescription,
        // Actions
        executeCommand,
        undo,
        redo,
        clear,
        getHistorySnapshot,
    };
});
