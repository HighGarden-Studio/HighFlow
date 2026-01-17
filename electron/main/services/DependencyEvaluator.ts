export interface DependencyStatus {
    value: boolean; // Is the condition met?
    isNew: boolean; // Is it met because of a NEW event?
}

export interface TaskDependencyInfo {
    id: number;
    status: string;
    completedAt?: Date | string;
}

export class DependencyEvaluator {
    private pos = 0;
    private tokens: string[] = [];
    private tasks: Map<number, TaskDependencyInfo>;
    private dependentTaskLastRunAt?: Date;

    constructor(tasks: TaskDependencyInfo[], dependentTaskLastRunAt?: Date | string) {
        this.tasks = new Map(tasks.map((t) => [t.id, t]));
        this.dependentTaskLastRunAt = dependentTaskLastRunAt
            ? new Date(dependentTaskLastRunAt)
            : undefined;
    }

    public evaluate(expression: string): { met: boolean; reason?: string } {
        if (!expression || expression.trim() === '') {
            return { met: true };
        }

        try {
            this.tokenize(expression);
            const result = this.parseExpression();

            if (!result.value) {
                return { met: false, reason: 'Dependencies not satisfied' };
            }

            // Novelty Check:
            // If the dependent task has run before, we require at least one "New" event in the chain
            // that caused the condition to become true.
            if (this.dependentTaskLastRunAt) {
                if (!result.isNew) {
                    return {
                        met: false,
                        reason: 'No new dependency completion since last run',
                    };
                }
            }

            return { met: true };
        } catch (error) {
            console.error(`[DependencyEvaluator] Failed to evaluate: "${expression}"`, error);
            return {
                met: false,
                reason: `Evaluation failed: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            };
        }
    }

    private tokenize(expr: string) {
        // Simple tokenizer for integers (task IDs), &&, ||, (, ), !
        // Matches: \d+, &&, ||, (, ), !
        const regex = /(\d+|&&|\|\||\(|\)|!)/g;
        this.tokens = expr.match(regex) || [];
        this.pos = 0;
    }

    private peek(): string | undefined {
        return this.tokens[this.pos];
    }

    private consume(): string | undefined {
        return this.tokens[this.pos++];
    }

    // Expression -> Term { || Term }
    private parseExpression(): DependencyStatus {
        let left = this.parseTerm();

        while (this.peek() === '||') {
            this.consume(); // eat ||
            const right = this.parseTerm();

            // OR Logic:
            // Value: true if either is true
            // IsNew: If left is true and new, OR right is true and new.
            // NOTE: If both are true, we consider it new if EITHER side contributes a new event.
            // Actually, for OR:
            // If Left is True (Old) and Right is False -> Result is True (Old)
            // If Left is True (Old) and Right is True (New) -> Result is True (New) ??
            //    Yes, because the "Right" completion is a valid trigger.
            //    Example: (A || B). A is done (Old). B finishes (New). Should we re-run?
            //    YES. Because B finishing might offer a better path or just be a valid trigger.
            //    Wait, strictly speaking, if A is already done, the condition was ALREADY met.
            //    Does B finishing change the boolean value? No. It stays True.
            //    However, in a workflow system, often "ANY" means "When any of them happens".
            //    If I have a "Monitor" task waiting for A or B, and A happens -> run. B happens -> run again?
            //    Usually yes, "When A completes OR When B completes".
            //    So: isNew = (left.value && left.isNew) || (right.value && right.isNew)

            const newValue = left.value || right.value;
            const newIsNew = (left.value && left.isNew) || (right.value && right.isNew);

            left = { value: newValue, isNew: newIsNew };
        }

        return left;
    }

    // Term -> Factor { && Factor }
    private parseTerm(): DependencyStatus {
        let left = this.parseFactor();

        while (this.peek() === '&&') {
            this.consume(); // eat &&
            const right = this.parseFactor();

            // AND Logic:
            // Value: true if both are true
            // IsNew: Must be true (so both true), AND (at least one is new).
            // Example: (A && B). A done (Old). B done (New). -> Trigger!
            // Example: (A && B). A done (Old). B done (Old). -> No Trigger.

            const newValue = left.value && right.value;
            const newIsNew = newValue && (left.isNew || right.isNew);

            left = { value: newValue, isNew: newIsNew };
        }

        return left;
    }

    // Factor -> ( Expression ) | ! Factor | ID
    private parseFactor(): DependencyStatus {
        const token = this.peek();

        if (token === '(') {
            this.consume();
            const expr = this.parseExpression();
            if (this.consume() !== ')') {
                throw new Error('Missing closing parenthesis');
            }
            return expr;
        }

        if (token === '!') {
            this.consume();
            const factor = this.parseFactor();
            // NOT Logic:
            // Value: !factor.value
            // IsNew: If the value FLIPPED from the previous state?
            // This is tricky without history.
            // But generally, "NOT A" means "Start when A is NOT done".
            // This is usually a state check, not an event trigger.
            // If A was "not done" (Old) vs "not done" (New) is meaningless.
            // "NOT" usually implies a static condition gate, not a trigger.
            // So we treat isNew as... false? Or inherited?
            // Verification: If I say "(!A)", and A is not done.
            // Is it "New"? Well, it's always been not done.
            // Unless A *was* done and became Undone (reset).
            // For now, let's assume negations don't generate "Novelty" events unless checking for resets (which we aren't).
            // So !True (False) -> False/False.
            // So !False (True) -> True/False (It's static).
            // Exception: If A just Reset? (Status done -> todo).
            // But we only track 'done'.
            // Let's safe-defalut to isNew = false for negations.
            return { value: !factor.value, isNew: false };
        }

        // It's a Task ID
        if (token && /^\d+$/.test(token)) {
            this.consume();
            return this.evaluateAtom(parseInt(token, 10));
        }

        throw new Error(`Unexpected token: ${token}`);
    }

    private evaluateAtom(taskId: number): DependencyStatus {
        const task = this.tasks.get(taskId);
        if (!task) {
            // Task not found implies not done
            return { value: false, isNew: false };
        }

        const isDone = task.status === 'done';
        if (!isDone) {
            return { value: false, isNew: false };
        }

        // It is done. Is it New?
        let isNew = true;
        if (this.dependentTaskLastRunAt && task.completedAt) {
            const completedAt = new Date(task.completedAt).getTime();
            const lastRunAt = this.dependentTaskLastRunAt.getTime();
            // If completed AFTER or AT THE SAME TIME as the last run, it's new.
            // We use >= because DB timestamp precision (seconds) might cause events to appear simultaneous
            isNew = completedAt >= lastRunAt;
        }

        return { value: true, isNew };
    }
}
