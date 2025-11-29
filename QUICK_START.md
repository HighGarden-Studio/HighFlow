# Quick Start Guide

## Step-by-Step Setup (First Time)

### 1. Install Prerequisites

**macOS:**
```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js 18+
brew install node@18

# Install pnpm
npm install -g pnpm
```

**Windows:**
```powershell
# Install using Chocolatey
choco install nodejs-lts pnpm

# OR download from https://nodejs.org/
# Then: npm install -g pnpm
```

**Linux:**
```bash
# Using nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# Install pnpm
npm install -g pnpm
```

### 2. Clone and Install

```bash
# Clone repository
git clone https://github.com/your-org/workflow-manager.git
cd workflow-manager

# Install dependencies (this will take a few minutes)
pnpm install

# Copy environment template
cp .env.example .env
```

### 3. Configure API Keys

Edit `.env` file with your API keys:

```bash
# Required for AI features
OPENAI_API_KEY=sk-proj-...           # Get from https://platform.openai.com/api-keys
ANTHROPIC_API_KEY=sk-ant-...         # Get from https://console.anthropic.com/

# Optional: Google AI
GOOGLE_AI_API_KEY=...                # Get from https://ai.google.dev/

# Optional: Real-time collaboration (choose one)
# Option A: Liveblocks (easier setup)
VITE_LIVEBLOCKS_PUBLIC_KEY=pk_...   # Get from https://liveblocks.io/

# Option B: Supabase (free tier)
VITE_SUPABASE_URL=https://....supabase.co
VITE_SUPABASE_ANON_KEY=...           # Get from https://supabase.com/
```

### 4. Initialize Database

```bash
# Generate database schema
pnpm db:generate

# Run migrations
pnpm db:push

# (Optional) Open Drizzle Studio to view database
pnpm db:studio
```

### 5. Start Development

```bash
# Start the app in development mode
pnpm dev:electron
```

The app window should open automatically!

---

## First Use: Create Your First Project

### Option 1: AI-Powered Creation (Recommended)

1. Click **"New Project"** button
2. Click **"Generate with AI"** tab
3. Enter a prompt:
   ```
   Create a project for building a personal blog website with Next.js
   ```
4. Select AI model (GPT-4 or Claude)
5. Click **"Generate"**
6. AI will create project structure with tasks!

### Option 2: Manual Creation

1. Click **"New Project"** button
2. Fill in:
   - **Name**: My First Project
   - **Description**: Learning the app
   - **Due Date**: (optional)
3. Click **"Create"**
4. Add tasks manually

---

## Understanding the Interface

### Main Views

**1. Projects View** (Default)
- Grid of all your projects
- Quick stats (tasks, progress)
- Filter by status, date, tags

**2. Kanban Board** (per project)
- Columns: To Do, In Progress, Done
- Drag tasks between columns
- Right-click for quick actions

**3. Timeline View**
- Gantt chart visualization
- Drag to adjust dates
- See task dependencies

**4. AI Assistant** (Sidebar)
- Chat with AI about your projects
- Ask questions: "What's overdue?"
- Generate subtasks

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + K` | Open command palette |
| `Cmd/Ctrl + N` | New project |
| `Cmd/Ctrl + Shift + N` | New task |
| `Cmd/Ctrl + F` | Search |
| `Cmd/Ctrl + ,` | Settings |
| `Cmd/Ctrl + /` | Toggle AI assistant |

---

## Common Tasks

### Creating Tasks

**Quick Add:**
1. Press `Cmd/Ctrl + Shift + N`
2. Type task title
3. Press Enter

**Detailed:**
1. Click **"+ New Task"** in project
2. Fill in:
   - Title
   - Description (Markdown supported)
   - Assignee
   - Due date
   - Labels
   - Priority

### Using AI to Break Down Tasks

1. Select a task
2. Click **"AI Actions"** menu
3. Select **"Generate Subtasks"**
4. AI will analyze and create subtasks

### Tracking Time

1. Open a task
2. Click **⏱️ Start Timer**
3. Timer runs in background
4. Click **⏹️ Stop** when done
5. View time reports in Analytics

### Collaborating (if enabled)

1. Click **"Share"** in project
2. Invite team members by email
3. They'll see live updates as you edit
4. Add comments with **@mentions**

---

## Troubleshooting

### App Won't Start

**Error: "Cannot find module 'electron'"**
```bash
# Reinstall dependencies
rm -rf node_modules
pnpm install
```

**Error: "Port 5173 already in use"**
```bash
# Kill process using port
lsof -ti:5173 | xargs kill -9

# Or change port in vite.config.ts
```

### Database Issues

**Error: "Database locked"**
```bash
# Close all instances of the app
# Delete database file (WARNING: loses data)
rm .dev-data/workflow-manager.db
pnpm db:push
```

**Want to reset database?**
```bash
# Backup first!
cp .dev-data/workflow-manager.db .dev-data/backup.db

# Drop and recreate
rm .dev-data/workflow-manager.db
pnpm db:push
```

### AI Features Not Working

**Check API keys:**
```bash
# Verify .env file has keys
cat .env | grep API_KEY

# Test OpenAI key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

**Rate limit errors:**
- Wait a few minutes
- Check your API usage on provider dashboard
- Consider upgrading API plan

### Performance Issues

**App is slow:**
1. Check task count (>10,000 tasks may slow down)
2. Archive old projects
3. Clear browser cache:
   - Open DevTools (`Cmd/Ctrl + Shift + I`)
   - Application → Clear Storage

**High memory usage:**
- Close unused projects
- Restart app
- Check Activity Monitor / Task Manager

---

## Development Commands

### Running Tests

```bash
# Unit tests
pnpm test

# Watch mode
pnpm test --watch

# E2E tests
pnpm test:e2e
```

### Code Quality

```bash
# Lint
pnpm lint

# Fix linting issues
pnpm lint --fix

# Format code
pnpm format

# Type check
pnpm type-check
```

### Building

```bash
# Build for current platform
pnpm build

# Build for specific platform
pnpm build:mac    # macOS DMG
pnpm build:win    # Windows installer
pnpm build:linux  # AppImage

# Build without packaging (faster for testing)
pnpm build:dir
```

### Database Management

```bash
# Open Drizzle Studio (database GUI)
pnpm db:studio

# Generate migration from schema changes
pnpm db:generate

# Apply migrations
pnpm db:push

# Custom migration script
pnpm db:migrate
```

---

## Next Steps

### Learn More
- Read [Architecture Overview](./ARCHITECTURE.md)
- Explore [API Documentation](./docs/API.md)
- Watch [Video Tutorials](#) (coming soon)

### Customize
- Configure keyboard shortcuts (Settings → Shortcuts)
- Install plugins (Settings → Plugins)
- Create custom templates

### Contribute
- Check [Contributing Guide](./docs/CONTRIBUTING.md)
- Join [Discord Community](#)
- Report bugs on [GitHub Issues](#)

---

## Getting Help

### Documentation
- **General**: [README.md](./README.md)
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Roadmap**: [DEVELOPMENT_ROADMAP.md](./DEVELOPMENT_ROADMAP.md)

### Support Channels
- **Discord**: [Join community](#)
- **Email**: support@example.com
- **GitHub**: [Open an issue](#)

### FAQ

**Q: Is this free?**
A: Yes, the app is free. You pay for AI API usage (OpenAI, Anthropic).

**Q: Can I use it offline?**
A: Yes! Offline-first design. Syncs when online.

**Q: Is my data private?**
A: Yes. Stored locally on your computer. Cloud sync is optional.

**Q: Can I self-host?**
A: Yes, you can use Supabase self-hosted for sync.

**Q: Mobile apps?**
A: Not yet, but on the roadmap for v2.

---

**Happy building! 🚀**
