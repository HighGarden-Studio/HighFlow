# Testing Guide for AI Developers

> **Purpose:** This guide helps AI assistants understand and maintain the test suite when continuing development.

## Quick Reference

**Test Status:** 98.8% passing (81/82 tests)  
**Framework:** Vitest  
**Critical Focus:** ProjectSequence-based dependencies

---

## 🎯 Core Principles

### 1. ProjectSequence is Sacred

**ALWAYS use projectSequence for dependencies, NEVER global IDs**

```typescript
// ✅ CORRECT
{
  projectSequence: 8,
  triggerConfig: {
    dependsOn: { taskIds: [5, 7] }  // ProjectSequence references
  }
}

// ❌ WRONG
{
  id: 22,
  triggerConfig: {
    dependsOn: { taskIds: [19, 23] }  // Global ID references - BREAKS EXPORT/IMPORT!
  }
}
```

**Why:** Global IDs change during export/import. ProjectSequence stays constant within a project.

### 2. Test Before Implementing

When adding new features:

1. Write failing test first
2. Implement feature
3. Ensure test passes
4. Verify no regressions

### 3. Mock Database Correctly

Use the 5-stage pattern for dependency-related tests (see examples below).

---

## 📁 Test File Structure

```
tests/
├── unit/                           # Unit tests
│   ├── core-features.spec.ts      # ✅ Core dependency/macro logic
│   ├── task-dependencies.spec.ts  # ✅ ProjectSequence validation
│   ├── macro-system.spec.ts       # ✅ All macro types
│   ├── ai-providers.spec.ts       # ✅ AI integration
│   ├── input-tasks.spec.ts        # ✅ Input task types
│   ├── output-tasks.spec.ts       # ✅ Output task types
│   └── [other].spec.ts            # 📝 Skeleton tests
├── integration/                    # Integration tests
│   └── workflow-scenarios.spec.ts # ✅ End-to-end workflows
└── README.md                       # Test documentation
```

---

## 🔧 Common Tasks

### Adding a New Feature

**Example:** Adding a new macro type `{{context.user}}`

```typescript
// 1. Add test to tests/unit/macro-system.spec.ts
describe('{{context.user}} Macro', () => {
    it('should resolve to current user', async () => {
        const task = {
            id: 10,
            projectSequence: 5,
            projectId: 1,
        };

        // Mock user context
        const context = { user: 'john@example.com' };

        const { resolveMacrosInCode } = await import('...');
        const code = 'const user = {{context.user}};';
        const resolved = await resolveMacrosInCode(code, task, 1, context);

        expect(resolved).toContain('john@example.com');
    });
});

// 2. Implement in electron/main/utils/macro-resolver.ts
// 3. Run test: pnpm test tests/unit/macro-system.spec.ts
```

### Modifying Dependency Logic

**⚠️ CRITICAL:** Any changes to dependency resolution MUST:

1. **Pass all dependency tests:**

    ```bash
    pnpm test tests/unit/task-dependencies.spec.ts
    pnpm test tests/unit/core-features.spec.ts
    ```

2. **Verify export/import still works:**

    ```bash
    pnpm test tests/integration/workflow-scenarios.spec.ts
    ```

3. **Maintain backward compatibility with global IDs**

### Adding a New AI Provider

**Example:** Adding Gemini Pro Vision

```typescript
// 1. Add test to tests/unit/ai-providers.spec.ts
describe('AI Providers - Gemini', () => {
    it('should generate response with Gemini', async () => {
        // Mock Gemini SDK
        const mockGemini = {
            generateContent: vi.fn().mockResolvedValue({
                response: { text: () => 'Gemini response' },
            }),
        };

        vi.mock('@google/generative-ai', () => ({
            GoogleGenerativeAI: vi.fn(() => ({
                /* ... */
            })),
        }));

        const { GeminiProvider } = await import('...');
        const provider = new GeminiProvider();
        provider.setApiKey('test-key');

        // IMPORTANT: Mock model list
        provider.setDynamicModels([
            {
                name: 'gemini-pro',
                provider: 'google',
                // ... other fields
            },
        ]);

        const result = await provider.execute('Test', { model: 'gemini-pro' }, {});
        expect(result.content).toBe('Gemini response');
    });
});

// 2. Implement GeminiProvider.ts
// 3. Test
```

---

## 🧪 Mocking Patterns

### Pattern 1: Database Mock (5-Stage)

**Use Case:** Testing macro resolution with dependencies

```typescript
let callCount = 0;
mockDb.select.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
            callCount++;

            // Stage 1: Get project
            if (callCount === 1) {
                return {
                    limit: vi.fn().mockResolvedValue([{ id: 1, title: 'Project' }]),
                };
            }

            // Stage 2: Detect format
            if (callCount === 2) {
                return Promise.resolve([{ id: 19, projectSequence: 5 }]);
            }

            // Stage 3: Convert sequences
            if (callCount === 3) {
                return Promise.resolve([{ id: 19, projectSequence: 5 }]);
            }

            // Stage 4: Get dependency list
            if (callCount === 4) {
                return Promise.resolve([{ id: 19, projectSequence: 5 }]);
            }

            // Stage 5: Get completed tasks
            if (callCount === 5) {
                return Promise.resolve([
                    {
                        id: 19,
                        projectSequence: 5,
                        status: 'done',
                        executionResult: JSON.stringify({
                            content: 'Result',
                        }),
                    },
                ]);
            }

            return Promise.resolve([]);
        }),
    }),
}));
```

### Pattern 2: AI Provider Mock

```typescript
const mockOpenAI = {
    chat: {
        completions: {
            create: vi.fn().mockResolvedValue({
                choices: [
                    {
                        message: { content: 'AI response' },
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 5,
                },
            }),
        },
    },
};

vi.mock('openai', () => ({
    default: vi.fn(() => mockOpenAI),
}));
```

### Pattern 3: Stream Mock

```typescript
const mockStream = {
    async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: 'chunk1' } }] };
        yield { choices: [{ delta: { content: 'chunk2' } }] };
    },
};

mockOpenAI.chat.completions.create.mockReturnValue(mockStream);
```

---

## ⚠️ Common Pitfalls

### 1. Forgetting Model Validation

```typescript
// ❌ This will fail
const provider = new GPTProvider();
await provider.execute('test', { model: 'gpt-4' }, {});

// ✅ Always set models first
provider.setDynamicModels([
    {
        name: 'gpt-4',
        provider: 'openai',
        // ... required fields
    },
]);
await provider.execute('test', { model: 'gpt-4' }, {});
```

### 2. Wrong Execute Signature

```typescript
// ❌ Wrong
await provider.execute({ model: 'gpt-4', prompt: 'test' }, {});

// ✅ Correct - prompt is first parameter
await provider.execute('test', { model: 'gpt-4' }, {});
```

### 3. Using Global IDs in Tests

```typescript
// ❌ Testing with global IDs
const task = {
    id: 22,
    triggerConfig: { dependsOn: { taskIds: [19] } }, // Global ID
};

// ✅ Always use projectSequence
const task = {
    id: 22,
    projectSequence: 8,
    triggerConfig: { dependsOn: { taskIds: [5] } }, // ProjectSequence
};
```

---

## 🚨 Critical Tests - Never Break These

### 1. Export/Import Compatibility

**File:** `tests/unit/task-dependencies.spec.ts`  
**Test:** "should preserve projectSequence dependencies across export/import"

**What it validates:**

- Project exported with projectSequence dependencies
- Imported with new global IDs
- Dependencies still work

**If this breaks:** Marketplace templates will fail!

### 2. Macro Resolution

**File:** `tests/unit/macro-system.spec.ts`  
**Tests:** All 7 tests

**What it validates:**

- {{prev}} gets last dependency result
- {{task.N}} references specific tasks
- String escaping works
- Format conversion works

**If this breaks:** Data won't flow between tasks!

### 3. Dependency Format Detection

**File:** `tests/unit/core-features.spec.ts`  
**Test:** "should detect projectSequence format correctly"

**What it validates:**

- System distinguishes projectSequence from global IDs
- Backward compatibility maintained

**If this breaks:** Legacy projects will fail!

---

## 📊 Test Quality Checklist

Before committing test changes:

- [ ] All critical tests pass (dependencies, macros, export/import)
- [ ] No regressions in existing tests
- [ ] New tests follow established patterns
- [ ] Mocks are properly configured
- [ ] Tests validate projectSequence, not global IDs
- [ ] Edge cases covered (empty dependencies, errors, etc.)

---

## 🔍 Debugging Failed Tests

### Step 1: Check Mock Configuration

```typescript
// Add logging to see what's being called
mockDb.select.mockImplementation(() => {
    console.log('SELECT called');
    return {
        from: vi.fn().mockImplementation((table) => {
            console.log('FROM table:', table);
            // ...
        }),
    };
});
```

### Step 2: Verify Call Count

```typescript
let callCount = 0;
mockDb.select.mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation(() => {
            callCount++;
            console.log('Query call #', callCount);
            // ...
        }),
    }),
}));
```

### Step 3: Check Actual vs Expected

```typescript
const resolved = await resolveMacrosInCode(code, task, 1);
console.log('Resolved:', resolved);
console.log('Expected:', expectedValue);
expect(resolved).toContain(expectedValue);
```

---

## 📚 Resources

- **Test Framework:** [Vitest Docs](https://vitest.dev/)
- **Mocking:** [Vitest Mock Functions](https://vitest.dev/api/vi.html)
- **Test Patterns:** See `tests/README.md`
- **Critical Concepts:** ProjectSequence documentation in tests/README.md

---

## 🤖 For AI Assistants

When continuing development:

1. **Read this file first** before modifying tests
2. **Run tests after any change** to dependency/macro code
3. **Follow the mocking patterns** - don't improvise
4. **Ask user** if breaking changes are needed to critical tests
5. **Document new patterns** if you create novel test approaches

**Golden Rule:** If it involves dependencies or macros, test with projectSequence format.

---

## Quick Commands

```bash
# Run all tests
pnpm test

# Run specific file
pnpm test tests/unit/macro-system.spec.ts

# Run critical tests only
pnpm test tests/unit/{core-features,task-dependencies,macro-system}.spec.ts

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage
```

**Happy Testing! 🎉**
