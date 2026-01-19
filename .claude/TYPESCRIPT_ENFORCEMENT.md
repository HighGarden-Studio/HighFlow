# 🚨 CRITICAL: TypeScript & Code Quality Enforcement Rules

## ⚠️ MANDATORY RULES - NEVER VIOLATE THESE

### 1. **ABSOLUTE TYPE SAFETY - NO EXCEPTIONS**

#### ❌ FORBIDDEN TYPES - NEVER USE:

```typescript
// BANNED - Will cause lint errors:
any; // Use specific types or unknown
{
} // Use Record<string, unknown> or object
Function; // Use proper function signatures: (args) => ReturnType
Object; // Use specific interface or Record<string, unknown>
```

#### ✅ REQUIRED ALTERNATIVES:

```typescript
// CORRECT - Always use these:
unknown                              // For truly unknown types
Record<string, unknown>              // For object types
(param: Type) => ReturnType         // For function types
interface MyType { ... }            // For structured objects
type MyUnion = 'a' | 'b'           // For union types
```

### 2. **MANDATORY VERIFICATION BEFORE EVERY COMMIT**

#### 🔴 CRITICAL: Run BOTH checks EVERY TIME:

```bash
# Step 1: Type Check (MUST PASS)
pnpm type-check

# Step 2: Lint Check (MUST PASS)
pnpm lint

# Step 3: Only commit if BOTH show 0 errors
git add -A && git commit -m "..."
```

#### ⛔ NEVER commit if:

- Type check shows ANY errors
- Lint shows ANY errors (warnings are acceptable)
- You haven't run both checks

### 3. **STRICT ESLINT COMPLIANCE**

#### 🚫 BANNED PATTERNS:

```typescript
// ❌ NEVER use @ts-ignore
// @ts-ignore
someCode();

// ❌ NEVER use any without eslint-disable
function foo(param: any) {}

// ❌ NEVER use {} as type
const map: Map<string, {}> = new Map();

// ❌ NEVER use Function as type
function bar(callback: Function) {}

// ❌ NEVER use console without eslint-disable (except in specific files)
console.log('debug');
```

#### ✅ CORRECT PATTERNS:

```typescript
// ✅ Use @ts-expect-error with explanation
// @ts-expect-error - Library types are incorrect, expects string but accepts number
someCode();

// ✅ Disable lint only when absolutely necessary with clear comment
/* eslint-disable @typescript-eslint/no-explicit-any */
// Reason: Third-party library has no types
function foo(param: any) {}

// ✅ Use proper types
const map: Map<string, Record<string, unknown>> = new Map();

// ✅ Use proper function signatures
function bar(callback: (data: string) => void) {}

// ✅ Use logger or disable lint for specific files
/* eslint-disable no-console */
console.log('Allowed in this file');
```

### 4. **FILE-LEVEL LINT DISABLING RULES**

#### When to use `/* eslint-disable */`:

- ✅ Test files (_.spec.ts, _.test.ts)
- ✅ Mock/fixture files
- ✅ Third-party type definitions (\*.d.ts)
- ✅ Legacy code being gradually migrated
- ❌ NEVER in new production code
- ❌ NEVER as a shortcut to avoid fixing issues

#### Proper format:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
// ^ Be specific about which rules to disable
// ^ Add comment explaining WHY

// Your code here...
```

### 5. **TYPE DEFINITION REQUIREMENTS**

#### ✅ ALWAYS define types for:

```typescript
// Function parameters and return types
function processData(input: DataType): ResultType {}

// Object properties
interface Config {
    timeout: number;
    retries: number;
    callback: (error: Error | null, result: string) => void;
}

// Array contents
const items: Array<{ id: number; name: string }> = [];

// Generic constraints
function transform<T extends Record<string, unknown>>(data: T): T {}
```

### 6. **PRE-COMMIT CHECKLIST** ✓

Before EVERY commit, verify:

- [ ] `pnpm type-check` passes (0 errors)
- [ ] `pnpm lint` passes (0 errors, warnings OK)
- [ ] No `any` types without eslint-disable
- [ ] No `{}` types (use `Record<string, unknown>`)
- [ ] No `Function` types (use proper signatures)
- [ ] No `@ts-ignore` (use `@ts-expect-error` with comment)
- [ ] All new code has proper TypeScript types
- [ ] Console statements only in allowed files or with eslint-disable

### 7. **CI/CD REQUIREMENTS**

#### The CI pipeline WILL FAIL if:

- Type check fails
- Lint check fails (errors only, warnings allowed)
- Any test fails

#### To prevent CI failures:

1. **ALWAYS** run checks locally first
2. **NEVER** push without verifying
3. **IMMEDIATELY** fix any errors before continuing

### 8. **EMERGENCY PROCEDURES**

#### If you encounter type errors:

1. **DO NOT** use `any` as a quick fix
2. **DO NOT** use `@ts-ignore`
3. **DO** investigate the proper type
4. **DO** use `unknown` and type guards if needed
5. **DO** ask for clarification if type is unclear

#### If you encounter lint errors:

1. **DO NOT** disable all eslint rules
2. **DO** fix the underlying issue
3. **DO** use specific rule disables only when necessary
4. **DO** add comments explaining why

### 9. **ALLOWED EXCEPTIONS**

These files MAY have relaxed rules:

- `tests/**/*.spec.ts` - Test files
- `tests/**/*.test.ts` - Test files
- `**/*.d.ts` - Type definition files
- `**/mock*.ts` - Mock files
- `electron/main/index.ts` - Main process (console allowed)
- `electron/main/database/seed.ts` - Seed data (console allowed)

### 10. **ENFORCEMENT**

#### Automated:

- Pre-commit hooks (if configured)
- CI/CD pipeline checks
- GitHub Actions validation

#### Manual:

- Code review requirements
- Pull request checks
- Regular audits

---

## 📋 QUICK REFERENCE

### Before Every Code Change:

```bash
# 1. Make your changes
# 2. Verify types
pnpm type-check
# 3. Verify lint
pnpm lint
# 4. If both pass, commit
git add -A && git commit -m "feat: your changes"
```

### Type Replacement Guide:

| ❌ NEVER Use | ✅ ALWAYS Use                          |
| ------------ | -------------------------------------- |
| `any`        | `unknown` or specific type             |
| `{}`         | `Record<string, unknown>` or `object`  |
| `Function`   | `(args: Type) => ReturnType`           |
| `Object`     | `Record<string, unknown>` or interface |
| `@ts-ignore` | `@ts-expect-error` with comment        |

---

## 🎯 REMEMBER

**Zero tolerance for:**

- Type errors in commits
- Lint errors in commits
- Using `any` without justification
- Using `{}` as a type
- Using `Function` as a type
- Skipping verification steps

**This is NOT optional. This is MANDATORY.**

Violations will cause CI failures and block deployments.
