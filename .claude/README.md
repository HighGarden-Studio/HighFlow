# .claude Directory

> **Critical Reference Files for AI-Assisted Development**

This directory contains essential guidelines and templates that MUST be followed by Claude Code (or any AI assistant) when working on this project.

---

## 📚 Files Overview

### 1. **CLAUDE_CODE_INSTRUCTIONS.md** ⭐ START HERE
**Purpose**: Main instructions for AI assistants
**When to read**: BEFORE every coding task
**Contains**:
- Code generation workflow
- Feature development process
- Common tasks quick reference
- Response format template
- Pre-commit checklist

**Key sections**:
- Required reading order
- Step-by-step workflows
- Common mistakes to avoid
- Debugging tips

---

### 2. **DEVELOPMENT_GUIDELINES.md** 📐 CORE STANDARDS
**Purpose**: Comprehensive development standards and patterns
**When to read**: When implementing any feature
**Contains**:
- Architecture principles
- TypeScript strict rules
- Vue 3 Composition API patterns
- Pinia store conventions
- Electron IPC patterns
- Drizzle ORM conventions
- Security best practices
- Performance optimization
- Git commit conventions

**Critical rules**:
- NEVER use `any` type
- ALWAYS use Composition API
- ALWAYS handle errors
- ALWAYS use path aliases

---

### 3. **CODE_TEMPLATES.md** 🎨 COPY-PASTE READY
**Purpose**: Ready-to-use boilerplate code
**When to read**: When creating new components/modules
**Contains**:
- Feature module structure
- Vue component templates (List, Card, Form)
- Composable patterns
- Pinia store template
- Electron IPC templates
- Drizzle repository template
- Type definition template
- Test template

**How to use**:
1. Find the template you need
2. Copy entire code block
3. Replace `{feature}` with your feature name
4. Customize as needed

---

## 🔄 Recommended Reading Flow

### For New Features
```
1. CLAUDE_CODE_INSTRUCTIONS.md
   → "Feature Development Process"

2. CODE_TEMPLATES.md
   → Find relevant template (e.g., "Feature Module Template")

3. DEVELOPMENT_GUIDELINES.md
   → Review specific sections as needed
   → Check "Architecture Principles"
   → Review technology-specific conventions

4. Start coding with template
```

### For Bug Fixes
```
1. CLAUDE_CODE_INSTRUCTIONS.md
   → "Debugging Tips" section

2. DEVELOPMENT_GUIDELINES.md
   → Review relevant technology section
   → Check "Common Mistakes"

3. Find similar code in codebase
   → Ensure fix follows patterns
```

### For Refactoring
```
1. DEVELOPMENT_GUIDELINES.md
   → Review all relevant sections
   → Understand current patterns

2. CODE_TEMPLATES.md
   → Check if templates have better patterns

3. Update code to match templates
```

---

## 🎯 Quick Decision Tree

**"What file should I read?"**

```
START: I need to...

├─ Write new code
│  └─ Read: CODE_TEMPLATES.md (find template)
│     └─ Then: DEVELOPMENT_GUIDELINES.md (verify pattern)
│
├─ Understand project structure
│  └─ Read: CLAUDE_CODE_INSTRUCTIONS.md (workflow)
│     └─ Then: ../PROJECT_STRUCTURE.md (directory layout)
│
├─ Fix TypeScript error
│  └─ Read: DEVELOPMENT_GUIDELINES.md (TypeScript Standards)
│
├─ Create new feature
│  └─ Read: CLAUDE_CODE_INSTRUCTIONS.md (Feature Development Process)
│     └─ Then: CODE_TEMPLATES.md (Feature Module Template)
│
├─ Add IPC handler
│  └─ Read: CODE_TEMPLATES.md (Electron IPC Templates)
│     └─ Then: DEVELOPMENT_GUIDELINES.md (Electron IPC Patterns)
│
├─ Write component
│  └─ Read: CODE_TEMPLATES.md (Vue Component Templates)
│     └─ Then: DEVELOPMENT_GUIDELINES.md (Vue 3 Conventions)
│
└─ Not sure what to do
   └─ Read: CLAUDE_CODE_INSTRUCTIONS.md (start from top)
```

---

## 🚀 Quick Start for AI Assistants

If you're Claude Code (or another AI) working on this project:

### 1️⃣ First Time Setup
```markdown
Read in this order:
1. This file (README.md) - You are here ✓
2. CLAUDE_CODE_INSTRUCTIONS.md - Workflow overview
3. DEVELOPMENT_GUIDELINES.md - Skim all sections
4. CODE_TEMPLATES.md - Bookmark for reference
```

### 2️⃣ Before Every Task
```markdown
1. Read task requirements carefully
2. Open CLAUDE_CODE_INSTRUCTIONS.md
3. Find relevant section (e.g., "Adding a Component")
4. Follow step-by-step instructions
5. Use templates from CODE_TEMPLATES.md
6. Verify against DEVELOPMENT_GUIDELINES.md
```

### 3️⃣ While Coding
```markdown
Keep open:
- CODE_TEMPLATES.md (for copy-paste)
- DEVELOPMENT_GUIDELINES.md (for verification)

Reference frequently:
- Path aliases (use @/, @core/, @modules/)
- TypeScript patterns
- Error handling patterns
```

### 4️⃣ Before Responding
```markdown
Checklist:
✓ Code follows templates
✓ All imports use path aliases
✓ TypeScript types defined
✓ Error handling included
✓ No 'any' types
✓ Follows naming conventions
✓ Includes tests if needed
```

---

## 📋 File Reference Matrix

| Task | Primary File | Secondary File | Section |
|------|-------------|----------------|---------|
| New feature module | CODE_TEMPLATES.md | DEVELOPMENT_GUIDELINES.md | Feature Module Template → Architecture Principles |
| Vue component | CODE_TEMPLATES.md | DEVELOPMENT_GUIDELINES.md | Vue Component Templates → Vue 3 Conventions |
| Pinia store | CODE_TEMPLATES.md | DEVELOPMENT_GUIDELINES.md | Pinia Store Template → Pinia Store Patterns |
| IPC handler | CODE_TEMPLATES.md | DEVELOPMENT_GUIDELINES.md | Electron IPC Templates → Electron IPC Patterns |
| Database query | CODE_TEMPLATES.md | DEVELOPMENT_GUIDELINES.md | Drizzle Repository → Drizzle ORM Conventions |
| Composable | CODE_TEMPLATES.md | DEVELOPMENT_GUIDELINES.md | Composable Templates → Vue 3 Conventions |
| Type definition | CODE_TEMPLATES.md | DEVELOPMENT_GUIDELINES.md | Type Template → TypeScript Standards |
| Unit test | CODE_TEMPLATES.md | DEVELOPMENT_GUIDELINES.md | Test Template → Testing Standards |
| Error handling | DEVELOPMENT_GUIDELINES.md | CODE_TEMPLATES.md | TypeScript Standards → Any template |
| Security | DEVELOPMENT_GUIDELINES.md | - | Security Best Practices |

---

## ⚠️ Critical Reminders

### DO ✅
- **Always** read instructions before coding
- **Always** use templates from CODE_TEMPLATES.md
- **Always** verify against DEVELOPMENT_GUIDELINES.md
- **Always** use path aliases (@/, @core/, @modules/)
- **Always** include TypeScript types
- **Always** handle errors
- **Always** follow naming conventions
- **Always** reference which guideline you're following

### DON'T ❌
- **Never** use `any` type
- **Never** skip error handling
- **Never** use relative imports
- **Never** bypass type checking
- **Never** ignore guidelines
- **Never** create patterns not documented
- **Never** commit code that violates rules
- **Never** assume - ask if unclear

---

## 🔧 Maintenance

### When to Update These Files

**CLAUDE_CODE_INSTRUCTIONS.md**:
- New workflow added
- Common task identified
- Better debugging technique discovered

**DEVELOPMENT_GUIDELINES.md**:
- Architecture decision changed
- New pattern established
- Technology updated
- Security issue found

**CODE_TEMPLATES.md**:
- Better template discovered
- New component pattern established
- Template bug fixed

### How to Update
1. Make changes following existing format
2. Update "Last Updated" date
3. Update version if major change
4. Notify team of changes
5. Update this README if structure changes

---

## 📞 Support

### Questions About Guidelines?
- Check CLAUDE_CODE_INSTRUCTIONS.md "When Stuck" section
- Review DEVELOPMENT_GUIDELINES.md relevant section
- Search existing code for examples
- Ask clarifying questions

### Found a Problem?
- Documentation unclear → Update relevant file
- Pattern inconsistency → Check with team
- Template outdated → Update CODE_TEMPLATES.md
- Guideline conflict → Resolve and document

---

## 📊 Compliance Checklist

Every piece of generated code should:

- [ ] Follow a template from CODE_TEMPLATES.md
- [ ] Match patterns in DEVELOPMENT_GUIDELINES.md
- [ ] Use path aliases exclusively
- [ ] Include TypeScript types
- [ ] Have error handling
- [ ] Follow naming conventions
- [ ] Include tests if critical
- [ ] Have JSDoc for public APIs
- [ ] No `any` types
- [ ] No console.log statements
- [ ] Formatted with Prettier
- [ ] Passes ESLint
- [ ] Passes TypeScript check

---

## 🎓 Learning Path

### Week 1: Foundation
- [ ] Read CLAUDE_CODE_INSTRUCTIONS.md fully
- [ ] Read DEVELOPMENT_GUIDELINES.md fully
- [ ] Browse CODE_TEMPLATES.md
- [ ] Read ../PROJECT_STRUCTURE.md
- [ ] Read ../ARCHITECTURE.md

### Week 2: Practice
- [ ] Create a simple feature using templates
- [ ] Add IPC handler
- [ ] Create Vue component
- [ ] Write Pinia store
- [ ] Add database repository

### Week 3: Mastery
- [ ] Refactor existing code to match patterns
- [ ] Create complex feature
- [ ] Write comprehensive tests
- [ ] Update documentation

---

## 📈 Success Metrics

Your code is following guidelines correctly if:

- ✅ No TypeScript errors on first try
- ✅ No ESLint warnings
- ✅ All imports use path aliases
- ✅ Pattern matches templates exactly
- ✅ Tests pass immediately
- ✅ Code review has no pattern violations
- ✅ Other developers can understand code easily
- ✅ No questions about "why is this done this way?"

---

## 🌟 Philosophy

These guidelines exist to:

1. **Maintain consistency** across the codebase
2. **Reduce cognitive load** by providing clear patterns
3. **Speed up development** with ready-to-use templates
4. **Ensure quality** through established practices
5. **Enable AI assistance** with clear instructions
6. **Facilitate onboarding** of new developers
7. **Prevent common mistakes** before they happen

**Remember**: These are not restrictions, they're enablers. Following them makes development faster and easier, not harder.

---

**Last Updated**: 2025-11-24
**Version**: 1.0.0
**Maintained by**: Development Team
