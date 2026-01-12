# Technology Stack Rationale

## Executive Summary

This document explains the reasoning behind each technology choice, comparing alternatives and justifying selections based on project requirements.

---

## Desktop Framework: Electron

### Choice: **Electron 28+**

### Alternatives Considered:
1. **Tauri** (Rust + Web)
2. **Neutralino** (Lightweight)
3. **NW.js** (Similar to Electron)
4. **Native (Swift/Kotlin)**

### Why Electron?

**Pros:**
- ✅ Largest ecosystem and community
- ✅ Proven at scale (VS Code, Slack, Discord)
- ✅ Node.js access for AI SDKs and native modules
- ✅ Excellent DevTools and debugging
- ✅ Cross-platform parity (Windows, macOS, Linux)
- ✅ Rich plugin ecosystem

**Cons:**
- ❌ Larger bundle size (~150MB vs Tauri's ~10MB)
- ❌ Higher memory usage
- ❌ Chromium security surface area

**Decision Factors:**
1. **AI SDK Compatibility**: All major AI SDKs (OpenAI, Anthropic) are Node.js-first
2. **Development Speed**: Faster iteration with JavaScript/TypeScript
3. **Talent Pool**: Easier to hire web developers
4. **Mature Tooling**: Auto-updater, crash reporting, code signing

**Trade-off:** Accept larger bundle size for faster development and better AI integration.

---

## Frontend Framework: Vue 3

### Choice: **Vue 3.4+ (Composition API)**

### Alternatives Considered:
1. **React 18** (Industry standard)
2. **Svelte** (Lightweight, reactive)
3. **Solid.js** (Performance-focused)

### Why Vue 3?

**Pros:**
- ✅ Excellent performance (similar to React)
- ✅ Composition API (similar to React Hooks)
- ✅ Better TypeScript support than Vue 2
- ✅ Smaller learning curve than React
- ✅ Official state management (Pinia)
- ✅ Great DevTools

**Cons:**
- ❌ Smaller ecosystem than React
- ❌ Fewer job market resources

**Decision Factors:**
1. **Developer Preference**: Team familiarity
2. **Reactivity System**: Built-in reactive state without Context hell
3. **Single File Components**: Better code organization
4. **Performance**: Virtual DOM optimizations (compiler hints)

**Comparison:**
| Feature | Vue 3 | React | Svelte |
|---------|-------|-------|--------|
| Bundle Size | 33KB | 43KB | 2KB |
| Performance | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Ecosystem | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Learning Curve | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

---

## ORM: Drizzle

### Choice: **Drizzle ORM 0.30+**

### Alternatives Considered:
1. **Prisma** (Most popular)
2. **TypeORM** (Mature)
3. **Kysely** (Type-safe query builder)
4. **Raw SQL** (Maximum control)

### Why Drizzle?

**Pros:**
- ✅ No native binaries (critical for Electron)
- ✅ Tiny bundle size (~50KB vs Prisma's 10MB)
- ✅ SQL-like syntax (easier migration)
- ✅ Excellent TypeScript inference
- ✅ Migrations are just SQL files
- ✅ Zero runtime overhead

**Cons:**
- ❌ Smaller community than Prisma
- ❌ Less "magic" (more boilerplate)
- ❌ Fewer integrations

**Critical Issue with Prisma:**
```typescript
// Prisma requires native binaries per platform
// This causes issues in Electron:
// 1. Unpredictable binary paths
// 2. ASAR packaging issues
// 3. Platform-specific builds

// Drizzle is pure TypeScript
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const sqlite = new Database('workflow.db');
const db = drizzle(sqlite); // Works everywhere!
```

**Decision Factors:**
1. **Electron Compatibility**: No native binary hassles
2. **Performance**: Direct SQLite access
3. **Type Safety**: Inferred types from schema
4. **Migration Simplicity**: SQL-based migrations

---

## UI Library: Shadcn-vue (Radix)

### Choice: **Shadcn-vue + TailwindCSS**

### Alternatives Considered:
1. **Element Plus** (Feature-rich)
2. **Naive UI** (TypeScript-first)
3. **Ant Design Vue** (Enterprise)
4. **Vuetify** (Material Design)

### Why Shadcn-vue?

**Pros:**
- ✅ Copy-paste components (full control)
- ✅ Built on Radix (accessibility first)
- ✅ Modern design (not opinionated like Material)
- ✅ Tree-shakeable (only bundle what you use)
- ✅ TailwindCSS integration (utility-first)
- ✅ Easy customization (no CSS overrides)

**Cons:**
- ❌ Need to maintain component code
- ❌ Smaller component library
- ❌ Less "batteries-included"

**Comparison:**
| Feature | Shadcn-vue | Element Plus | Naive UI |
|---------|-----------|--------------|----------|
| Bundle Size | 📦 Small | 📦📦 Medium | 📦 Small |
| Customization | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Accessibility | ♿⭐⭐⭐⭐⭐ | ♿⭐⭐⭐ | ♿⭐⭐⭐⭐ |
| TypeScript | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Components | 30+ | 60+ | 80+ |

**Decision Factors:**
1. **Brand Identity**: Not tied to Material Design or Ant Design
2. **Accessibility**: Radix primitives are WCAG 2.1 AA compliant
3. **Flexibility**: Can modify components without fighting the library
4. **Modern Stack**: Aligns with current web trends (Vercel, Shadcn adoption)

---

## Real-time Sync: Liveblocks (Primary) / Supabase (Fallback)

### Choice: **Liveblocks** with **Supabase** option

### Alternatives Considered:
1. **Firebase Realtime Database**
2. **Ably** (Real-time messaging)
3. **Pusher** (WebSocket service)
4. **Custom WebSocket server**

### Why Liveblocks?

**Pros (Liveblocks):**
- ✅ Purpose-built for collaboration
- ✅ CRDT (Yjs) integration built-in
- ✅ Presence API (cursors, avatars)
- ✅ Undo/Redo out of the box
- ✅ Excellent DX (React/Vue hooks)
- ✅ Room-based isolation

**Cons (Liveblocks):**
- ❌ Usage-based pricing (can get expensive)
- ❌ Vendor lock-in
- ❌ Limited customization

**Why Supabase Fallback?**
- ✅ Free tier (generous)
- ✅ PostgreSQL (powerful queries)
- ✅ Built-in authentication
- ✅ Storage included
- ✅ Open-source (can self-host)

**Architecture:**
```typescript
// Abstraction layer supports both
interface CollabProvider {
  connect(roomId: string): Promise<void>;
  getPresence(): Presence[];
  updateDocument(doc: YDoc): void;
}

class LiveblocksProvider implements CollabProvider { }
class SupabaseProvider implements CollabProvider { }

// Switch via config
const provider = config.useSupabase
  ? new SupabaseProvider()
  : new LiveblocksProvider();
```

**Decision Factors:**
1. **Speed to Market**: Liveblocks is faster to implement
2. **Cost Flexibility**: Can switch to Supabase if costs spike
3. **Feature Parity**: Both support CRDT via Yjs
4. **User Control**: Let users choose (self-hosted vs cloud)

---

## AI Integration: Vercel AI SDK

### Choice: **Vercel AI SDK (`ai` package)**

### Alternatives Considered:
1. **LangChain** (Comprehensive)
2. **Direct SDKs** (OpenAI, Anthropic)
3. **LlamaIndex** (RAG-focused)

### Why Vercel AI SDK?

**Pros:**
- ✅ Unified API for all models
- ✅ Streaming built-in
- ✅ React/Vue hooks (`useChat`, `useCompletion`)
- ✅ Tool calling abstraction
- ✅ Token counting automatic
- ✅ Edge runtime support

**Cons:**
- ❌ Less flexible than LangChain
- ❌ Vercel ecosystem lock-in (minor)

**Comparison:**
```typescript
// Direct OpenAI SDK (complex)
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey });
const stream = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }],
  stream: true,
});
for await (const chunk of stream) {
  // Handle streaming manually
}

// Vercel AI SDK (simple)
import { streamText } from 'ai';
const result = await streamText({
  model: openai('gpt-4'),
  prompt: 'Hello',
});
for await (const chunk of result.textStream) {
  console.log(chunk);
}
```

**When to Use LangChain:**
- Complex RAG pipelines
- Multi-step agent workflows
- Document processing
- Custom tool chains

**Our Use Case:**
- ✅ Simple prompt-response
- ✅ Model switching
- ✅ Streaming responses
- ✅ Basic tool calling

**Decision:** Start with Vercel AI SDK, add LangChain if needed for complex workflows.

---

## State Management: Pinia

### Choice: **Pinia 2.1+**

### Alternatives Considered:
1. **Vuex** (Official, older)
2. **Plain Composition API** (No library)
3. **XState** (State machines)

### Why Pinia?

**Pros:**
- ✅ Official Vue state management (replaced Vuex)
- ✅ TypeScript-first design
- ✅ Composition API integration
- ✅ DevTools support
- ✅ Automatic code splitting
- ✅ Plugin ecosystem (persistence)

**Cons:**
- ❌ Vuex has more examples online

**Comparison to Vuex:**
```typescript
// Vuex (verbose)
export default {
  state: () => ({ count: 0 }),
  mutations: {
    increment(state) { state.count++; }
  },
  actions: {
    async fetch({ commit }) { }
  }
};

// Pinia (clean)
export const useCountStore = defineStore('count', () => {
  const count = ref(0);
  const increment = () => count.value++;
  const fetchData = async () => { };
  return { count, increment, fetchData };
});
```

**Decision Factors:**
1. **Official Recommendation**: Vue team recommends Pinia
2. **TypeScript**: Better inference than Vuex
3. **Composition API**: Natural integration
4. **Persistence Plugin**: Easy localStorage/IndexedDB sync

---

## Build Tool: Vite

### Choice: **Vite 5+**

### Alternatives Considered:
1. **Webpack** (Industry standard)
2. **Rollup** (Library bundler)
3. **esbuild** (Ultra-fast)

### Why Vite?

**Pros:**
- ✅ Lightning-fast HMR (<50ms)
- ✅ No bundling in dev (ESM)
- ✅ Built-in TypeScript support
- ✅ Optimized production builds (Rollup)
- ✅ Official Electron plugin
- ✅ Vue team recommendation

**Cons:**
- ❌ Newer ecosystem than Webpack
- ❌ Some plugins lag behind

**Performance:**
| Tool | Cold Start | HMR |
|------|-----------|-----|
| Vite | 1.5s | 50ms |
| Webpack | 8s | 500ms |
| esbuild | 0.5s | 30ms |

**Decision Factors:**
1. **Developer Experience**: Instant HMR improves iteration speed
2. **Vue Integration**: Official Vite plugin
3. **Production Performance**: Rollup optimizations
4. **Modern Standards**: ESM-first approach

---

## Testing: Vitest + Playwright

### Choice: **Vitest (unit)** + **Playwright (E2E)**

### Alternatives Considered:
1. **Jest** (Most popular)
2. **Mocha + Chai** (Classic)
3. **Cypress** (E2E)

### Why Vitest?

**Pros:**
- ✅ Vite-native (uses same config)
- ✅ 10x faster than Jest
- ✅ ESM support out of the box
- ✅ TypeScript no config needed
- ✅ Jest-compatible API

**Cons:**
- ❌ Smaller community than Jest
- ❌ Fewer plugins

### Why Playwright?

**Pros:**
- ✅ Multi-browser (Chromium, Firefox, WebKit)
- ✅ Auto-wait (no flaky tests)
- ✅ Electron support
- ✅ Trace viewer (debug tests visually)
- ✅ Parallel execution

**Cons:**
- ❌ Slower than Cypress for simple tests

**Decision Factors:**
1. **Speed**: Vitest is significantly faster
2. **Consistency**: Same Vite config for tests
3. **Reliability**: Playwright auto-wait reduces flakiness
4. **Electron**: Playwright can test actual Electron builds

---

## Database: SQLite + Better-SQLite3

### Choice: **SQLite** with **better-sqlite3** driver

### Alternatives Considered:
1. **PostgreSQL** (Local)
2. **IndexedDB** (Browser API)
3. **LevelDB** (Key-value)

### Why SQLite?

**Pros:**
- ✅ Zero-config (just a file)
- ✅ ACID transactions
- ✅ SQL queries (familiar)
- ✅ Fast (in-process)
- ✅ Reliable (battle-tested)
- ✅ Small footprint

**Cons:**
- ❌ No built-in network access
- ❌ Limited concurrency (one writer)

### Why better-sqlite3?

**Pros:**
- ✅ Synchronous API (simpler)
- ✅ Faster than node-sqlite3
- ✅ Well-maintained
- ✅ Prepared statements

**Performance:**
```typescript
// better-sqlite3 (synchronous, faster)
const row = db.prepare('SELECT * FROM users WHERE id = ?').get(1);

// node-sqlite3 (async, slower)
db.get('SELECT * FROM users WHERE id = ?', [1], (err, row) => {
  // Callback hell
});
```

**Decision Factors:**
1. **Offline-First**: Local database is requirement
2. **Performance**: SQLite is faster than PostgreSQL for local use
3. **Simplicity**: No server to manage
4. **Drizzle Support**: Excellent Drizzle integration

---

## Drag-and-Drop: @dnd-kit/core

### Choice: **@dnd-kit/core**

### Alternatives Considered:
1. **vue-draggable-plus** (Vue-specific)
2. **SortableJS** (Vanilla JS)
3. **react-beautiful-dnd** (React-only)

### Why @dnd-kit?

**Pros:**
- ✅ Framework-agnostic (works with Vue)
- ✅ Excellent accessibility
- ✅ Collision detection algorithms
- ✅ Custom sensors (mouse, touch, keyboard)
- ✅ Performance optimizations (virtual lists)
- ✅ Smooth animations

**Cons:**
- ❌ Requires more setup than vue-draggable-plus
- ❌ Originally for React (Vue wrapper needed)

**Decision Factors:**
1. **Performance**: Handles 1000+ items smoothly
2. **Accessibility**: Keyboard navigation built-in
3. **Flexibility**: Can build complex drag interactions
4. **Future-Proof**: Industry-standard library

---

## Summary: Technology Matrix

| Category | Choice | Alternative | Reason |
|----------|--------|-------------|--------|
| Desktop | Electron | Tauri | AI SDK compatibility |
| Frontend | Vue 3 | React | Reactivity system |
| ORM | Drizzle | Prisma | No native binaries |
| UI | Shadcn-vue | Element Plus | Customization |
| Sync | Liveblocks | Supabase | Collaboration-first |
| AI | Vercel AI SDK | LangChain | Simplicity |
| State | Pinia | Vuex | TypeScript support |
| Build | Vite | Webpack | Development speed |
| Test | Vitest | Jest | Vite integration |
| DB | SQLite | PostgreSQL | Offline-first |
| Drag | @dnd-kit | vue-draggable | Accessibility |

---

## Risk Assessment

### Low Risk
- ✅ Vue 3, Pinia, Vite (mature, well-adopted)
- ✅ SQLite, Drizzle (proven in production)

### Medium Risk
- ⚠️ Shadcn-vue (newer, need to maintain components)
- ⚠️ Vercel AI SDK (abstraction layer dependency)
- ⚠️ @dnd-kit in Vue (primarily React library)

### High Risk
- 🔴 Liveblocks pricing (can get expensive at scale)
- 🔴 Electron bundle size (may impact adoption)

### Mitigation Strategies
1. **Liveblocks**: Build abstraction layer, have Supabase fallback
2. **Electron**: Aggressive code splitting, lazy loading
3. **Shadcn-vue**: Keep components minimal, upgrade carefully
4. **Vercel AI SDK**: Monitor API changes, can revert to direct SDKs

---

## Conclusion

This stack prioritizes:
1. **Developer Experience**: Fast iteration, good tooling
2. **User Experience**: Performance, offline-first, accessibility
3. **Flexibility**: Escape hatches if vendors fail
4. **Modern Standards**: ESM, TypeScript, Composition API

**Trade-offs accepted:**
- Larger bundle size (Electron) for better AI integration
- Vendor lock-in (Liveblocks) for faster development
- Component maintenance (Shadcn-vue) for better customization

**This stack is optimized for:**
- Small-to-medium teams (1-5 developers)
- MVP in 6-8 weeks
- Scale to 10,000+ users
- Pivot if needed (abstraction layers)
