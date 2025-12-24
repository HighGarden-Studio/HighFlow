# Getting Started - HighFlow

> **Complete guide for developers starting work on this project**

---

## 📚 Documentation Map

This project has comprehensive documentation organized into different files. Here's what to read based on your role:

### 🚀 New Developer Onboarding

**Day 1: Understanding the Project**
1. **README.md** (10 min) - Project overview, features, tech stack
2. **ARCHITECTURE.md** (30 min) - System design, ADRs, data flow
3. **PROJECT_STRUCTURE.md** (15 min) - Directory layout
4. **TECH_STACK_RATIONALE.md** (20 min) - Why we chose each technology

**Day 2: Learning the Patterns**
1. **.claude/README.md** (5 min) - Guidelines overview
2. **.claude/DEVELOPMENT_GUIDELINES.md** (45 min) - All coding standards
3. **.claude/CODE_TEMPLATES.md** (30 min) - Boilerplate code

**Day 3: Development Setup**
1. **QUICK_START.md** (follow step-by-step)
2. **Set up environment** (install dependencies)
3. **Run the app** (verify everything works)
4. **Create a simple feature** (using templates)

### 🤖 AI Assistant (Claude Code)

**Always Read (in order)**
1. **.claude/README.md** - Start here
2. **.claude/CLAUDE_CODE_INSTRUCTIONS.md** - Your workflow guide
3. **.claude/DEVELOPMENT_GUIDELINES.md** - Standards reference
4. **.claude/CODE_TEMPLATES.md** - Copy-paste templates

**Before Every Task**
- Check relevant section in CLAUDE_CODE_INSTRUCTIONS.md
- Use templates from CODE_TEMPLATES.md
- Verify against DEVELOPMENT_GUIDELINES.md

### 👨‍💼 Project Manager

**Essential Reading**
1. **README.md** - Feature overview
2. **DEVELOPMENT_ROADMAP.md** - Milestones, timeline, KPIs
3. **ARCHITECTURE.md** - Technical decisions, risks

**For Planning**
- Use roadmap phases for sprint planning
- Reference success metrics for KPIs
- Check risk mitigation strategies

### 🔍 Code Reviewer

**Review Checklist**
1. **.claude/DEVELOPMENT_GUIDELINES.md** - Standards to enforce
2. **.claude/CODE_TEMPLATES.md** - Expected patterns
3. **Pre-commit checklist** (in CLAUDE_CODE_INSTRUCTIONS.md)

---

## 📖 Complete Documentation Index

### Root Directory

| File | Purpose | Read When |
|------|---------|-----------|
| **README.md** | Project overview, quick start | First time, sharing project |
| **ARCHITECTURE.md** | Design decisions, system architecture | Understanding design, making decisions |
| **PROJECT_STRUCTURE.md** | Directory layout, module organization | Creating new features, navigating code |
| **DEVELOPMENT_ROADMAP.md** | Milestones, timeline, KPIs | Planning sprints, tracking progress |
| **TECH_STACK_RATIONALE.md** | Technology choices explained | Understanding why we use X over Y |
| **QUICK_START.md** | Step-by-step setup guide | Initial setup, troubleshooting |
| **GETTING_STARTED.md** | This file - navigation guide | Finding the right documentation |

### .claude Directory (AI Assistant Guidelines)

| File | Purpose | Read When |
|------|---------|-----------|
| **.claude/README.md** | Overview of guidelines | Starting work, quick reference |
| **.claude/CLAUDE_CODE_INSTRUCTIONS.md** | AI workflow, processes | Before every coding task |
| **.claude/DEVELOPMENT_GUIDELINES.md** | Coding standards, patterns | Writing any code |
| **.claude/CODE_TEMPLATES.md** | Boilerplate code | Creating components, modules |

### Configuration Files

| File | Purpose |
|------|---------|
| **package.json** | Dependencies, scripts |
| **tsconfig.json** | TypeScript configuration |
| **vite.config.ts** | Build configuration |
| **drizzle.config.ts** | Database configuration |
| **tailwind.config.js** | UI styling configuration |
| **.eslintrc.cjs** | Linting rules |
| **.prettierrc.json** | Code formatting |

---

## 🎯 Quick Navigation by Task

### "I want to..."

#### Create a New Feature
```
1. Read: .claude/CLAUDE_CODE_INSTRUCTIONS.md
   → "Feature Development Process" section

2. Use: .claude/CODE_TEMPLATES.md
   → "Feature Module Template"

3. Follow: .claude/DEVELOPMENT_GUIDELINES.md
   → Verify patterns match
```

#### Add a Vue Component
```
1. Use: .claude/CODE_TEMPLATES.md
   → Find component template (List/Card/Form)

2. Follow: .claude/DEVELOPMENT_GUIDELINES.md
   → "Vue 3 Conventions" section

3. Check: Existing similar components in codebase
```

#### Add Database Table
```
1. Read: .claude/DEVELOPMENT_GUIDELINES.md
   → "Drizzle ORM Conventions" section

2. Use: .claude/CODE_TEMPLATES.md
   → "Drizzle Repository Template"

3. Follow: Steps in CLAUDE_CODE_INSTRUCTIONS.md
   → "Adding Database Table" task
```

#### Integrate AI Feature
```
1. Read: .claude/DEVELOPMENT_GUIDELINES.md
   → "AI Integration Patterns" section

2. Check: ARCHITECTURE.md
   → "AI Cost Tracking Strategy"

3. Use: Existing AI code as reference
   → src/core/ai/agents/
```

#### Fix a Bug
```
1. Read: .claude/CLAUDE_CODE_INSTRUCTIONS.md
   → "Debugging Tips" section

2. Check: .claude/DEVELOPMENT_GUIDELINES.md
   → "Common Mistakes to Avoid"

3. Verify: Fix follows established patterns
```

#### Add IPC Endpoint
```
1. Use: .claude/CODE_TEMPLATES.md
   → "Electron IPC Templates"

2. Follow: .claude/DEVELOPMENT_GUIDELINES.md
   → "Electron IPC Patterns"

3. Test: Both main and renderer processes
```

#### Write Tests
```
1. Use: .claude/CODE_TEMPLATES.md
   → "Test Template"

2. Follow: .claude/DEVELOPMENT_GUIDELINES.md
   → "Testing Standards"

3. Run: pnpm test
```

#### Understand Architecture
```
1. Read: ARCHITECTURE.md
   → ADR sections, system diagrams

2. Read: PROJECT_STRUCTURE.md
   → Module organization

3. Read: TECH_STACK_RATIONALE.md
   → Technology decisions
```

#### Set Up Development Environment
```
1. Follow: QUICK_START.md
   → Step-by-step instructions

2. Verify: All commands work

3. Create: Test project/task
```

---

## 🔑 Key Concepts

### 1. Module-Based Architecture
```
Each feature is a self-contained module:
src/renderer/modules/{feature}/
├── components/    # UI components
├── composables/   # Reusable logic
├── stores/        # State management
└── types.ts       # Type definitions
```

### 2. Path Aliases (ALWAYS USE)
```typescript
// ✅ CORRECT
import { Button } from '@/shared/components/ui/button';
import { useProject } from '@modules/projects/composables/useProject';
import { ProjectRepository } from '@core/database/repositories/project-repository';

// ❌ WRONG
import { Button } from '../../../shared/components/ui/button';
```

### 3. TypeScript Strict Mode
```typescript
// ✅ All code must be strictly typed
interface Props {
  project: Project;
  readonly?: boolean;
}

// ❌ Never use 'any'
const data: any = fetchData(); // NEVER DO THIS
```

### 4. Error Handling Required
```typescript
// ✅ All async operations must handle errors
try {
  const result = await someAsyncOperation();
  return result;
} catch (error) {
  console.error('Operation failed:', error);
  throw new Error('User-friendly message');
}
```

### 5. Composition API Only
```vue
<!-- ✅ CORRECT: Use <script setup> -->
<script setup lang="ts">
import { ref, computed } from 'vue';

const count = ref(0);
const doubled = computed(() => count.value * 2);
</script>

<!-- ❌ WRONG: Options API -->
<script>
export default {
  data() { return { count: 0 } }
}
</script>
```

---

## 🛠️ Development Workflow

### Daily Workflow
```
1. Pull latest changes
   git pull origin main

2. Check what to build
   → Reference DEVELOPMENT_ROADMAP.md

3. Read relevant guidelines
   → .claude/DEVELOPMENT_GUIDELINES.md sections

4. Use templates
   → .claude/CODE_TEMPLATES.md

5. Write code following patterns

6. Test locally
   pnpm dev:electron

7. Run checks
   pnpm type-check
   pnpm lint
   pnpm test

8. Commit with conventional format
   git commit -m "feat(projects): add project duplication"
```

### Feature Development Workflow
```
1. Create feature branch
   git checkout -b feature/project-tags

2. Plan structure
   → Review PROJECT_STRUCTURE.md
   → Identify affected modules

3. Create module structure
   → Use Feature Module Template
   → Create all necessary files

4. Implement database layer
   → Schema → Repository → IPC

5. Implement UI layer
   → Store → Components → Views

6. Write tests
   → Unit tests for store
   → Component tests

7. Update documentation
   → Update PROJECT_STRUCTURE.md if needed
   → Add ADR if architectural decision made

8. Create PR
   → Reference templates used
   → Note any deviations and why
```

---

## 🧪 Testing Strategy

### What to Test

**Always test**:
- Pinia store actions
- Composables with logic
- IPC handlers
- Database repositories
- Utility functions

**Optional**:
- Simple presentational components
- Type definitions
- Getters/computed

### Running Tests
```bash
# All tests
pnpm test

# Watch mode (during development)
pnpm test --watch

# Specific file
pnpm test path/to/file.test.ts

# Coverage
pnpm test --coverage

# E2E tests
pnpm test:e2e
```

---

## 📦 Dependency Management

### Adding Dependencies
```bash
# Production dependency
pnpm add package-name

# Development dependency
pnpm add -D package-name

# Update all dependencies
pnpm update

# Check outdated
pnpm outdated
```

### When to Add Dependency
- ✅ Solves significant problem
- ✅ Well-maintained (recent updates)
- ✅ TypeScript support
- ✅ Small bundle size
- ✅ Team consensus

### When NOT to Add
- ❌ Can easily implement ourselves
- ❌ Abandoned/unmaintained
- ❌ No TypeScript types
- ❌ Large bundle size for small feature
- ❌ Only one team member wants it

---

## 🔒 Security Checklist

Before committing code, verify:

- [ ] No API keys in code (use .env)
- [ ] No secrets in comments
- [ ] All IPC inputs validated
- [ ] No SQL injection possible (Drizzle prevents this)
- [ ] No XSS vulnerabilities in templates
- [ ] API keys stored in OS keychain (not localStorage)
- [ ] Sensitive data encrypted in database
- [ ] No console.log of sensitive data

---

## 🚀 Performance Checklist

For optimal performance:

- [ ] Large lists use virtual scrolling
- [ ] Heavy components lazy loaded
- [ ] Images optimized and lazy loaded
- [ ] Debounce user input handlers
- [ ] Database queries indexed
- [ ] AI responses streamed
- [ ] Code split by route
- [ ] Bundle size < 5MB per chunk

---

## 🎨 UI/UX Guidelines

### Component Design
- Use Shadcn-vue components as base
- Follow TailwindCSS utility-first approach
- Maintain consistent spacing (4px grid)
- Support dark mode (when implemented)
- Ensure keyboard accessibility
- Add loading states
- Handle empty states
- Show error states clearly

### User Feedback
- Show loading indicators for async operations
- Display success/error messages
- Confirm destructive actions
- Provide undo when possible
- Use optimistic UI updates
- Show progress for long operations

---

## 🤝 Collaboration Guidelines

### Code Reviews
**Reviewer checklist**:
- [ ] Follows patterns in DEVELOPMENT_GUIDELINES.md
- [ ] Uses templates from CODE_TEMPLATES.md
- [ ] No TypeScript errors
- [ ] Tests included
- [ ] Documentation updated

**Author checklist**:
- [ ] Pre-commit checklist completed
- [ ] Screenshots added (if UI change)
- [ ] Migration steps documented (if schema change)
- [ ] Breaking changes highlighted

### Communication
- Use clear commit messages
- Reference issue numbers
- Explain complex decisions in comments
- Update documentation proactively
- Ask questions early

---

## 📈 Success Criteria

You're doing it right if:

- ✅ Code passes type-check on first try
- ✅ No linting errors
- ✅ Tests pass immediately
- ✅ Code looks like existing code
- ✅ Other developers understand your code easily
- ✅ PRs approved quickly with few comments
- ✅ No questions like "why did you do it this way?"

---

## 🆘 Getting Help

### Documentation
1. Search this file for your task
2. Read relevant guideline section
3. Check code templates
4. Look at similar existing code

### Still Stuck?
1. Check CLAUDE_CODE_INSTRUCTIONS.md "When Stuck"
2. Search codebase for examples
3. Ask specific questions (not "how do I X?")
4. Share what you've tried

### Report Issues
- Documentation unclear → Update it
- Pattern inconsistent → Discuss with team
- Template doesn't fit → Propose update
- Guideline conflict → Raise issue

---

## 🎓 Learning Resources

### Internal (Read First)
1. All files in this repository
2. Existing code examples
3. Test cases

### External
- **Vue 3**: https://vuejs.org/
- **TypeScript**: https://www.typescriptlang.org/
- **Drizzle ORM**: https://orm.drizzle.team/
- **Electron**: https://www.electronjs.org/
- **Pinia**: https://pinia.vuejs.org/
- **Shadcn-vue**: https://www.shadcn-vue.com/
- **TailwindCSS**: https://tailwindcss.com/

---

## 🎯 Next Steps

**Choose your path**:

### Path 1: I'm a new developer
```
1. ✅ Read this file completely
2. → Follow "New Developer Onboarding" above
3. → Complete QUICK_START.md setup
4. → Create your first feature using templates
5. → Submit your first PR
```

### Path 2: I'm Claude Code (AI Assistant)
```
1. ✅ Read this file completely
2. → Read .claude/README.md
3. → Read .claude/CLAUDE_CODE_INSTRUCTIONS.md
4. → Bookmark .claude/DEVELOPMENT_GUIDELINES.md
5. → Start coding with templates
```

### Path 3: I'm a project manager
```
1. ✅ Read this file completely
2. → Read README.md (features overview)
3. → Read DEVELOPMENT_ROADMAP.md (timeline)
4. → Use roadmap for sprint planning
5. → Track KPIs from roadmap
```

### Path 4: I need to build something NOW
```
1. ✅ Read this file completely
2. → Find your task in "Quick Navigation by Task"
3. → Follow the 3-step process listed
4. → Use templates from CODE_TEMPLATES.md
5. → Ship it!
```

---

## ✅ Final Checklist

Before you start coding:

- [ ] I've read this file completely
- [ ] I know where to find guidelines for my task
- [ ] I've set up my development environment
- [ ] I understand the architecture
- [ ] I know which templates to use
- [ ] I understand the workflow
- [ ] I'm ready to write consistent, quality code

**Now go build something amazing! 🚀**

---

**Questions?** Check the documentation. **Still stuck?** Ask the team. **Found a bug in docs?** Fix it!

**Last Updated**: 2025-11-24
