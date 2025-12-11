/**
 * Command Pattern Interface for Undo/Redo System
 *
 * All reversible operations must implement this interface
 */

export interface Command {
    /**
     * Execute the command (perform the operation)
     */
    execute(): Promise<void>;

    /**
     * Undo the command (reverse the operation)
     */
    undo(): Promise<void>;

    /**
     * Human-readable description of this command
     * Used for UI tooltips and debugging
     */
    description: string;

    /**
     * Timestamp when command was executed
     */
    timestamp?: Date;
}

/**
 * Base class for commands with common functionality
 */
export abstract class BaseCommand implements Command {
    public timestamp: Date;

    constructor(public description: string) {
        this.timestamp = new Date();
    }

    abstract execute(): Promise<void>;
    abstract undo(): Promise<void>;
}
