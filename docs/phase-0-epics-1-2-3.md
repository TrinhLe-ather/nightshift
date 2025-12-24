## Epic 1: Daemon Foundation

**Goal:** Engineers can download a single executable and run Night Shift without any server setup.

**User Outcome:** Download binary, run `nightshift start`, see local web UI—all working offline.

**FRs covered:** FR-S1, FR-S3
**NFRs addressed:** NFR1 (startup <3s), NFR9 (SQLite WAL), NFR11 (localhost only)

---

### Story 1.1: Initialize Monorepo Structure

As a **developer**,
I want **a properly structured monorepo with daemon as the primary package**,
So that **I can begin implementing features with consistent tooling**.

**Acceptance Criteria:**

**Given** a fresh project directory
**When** the monorepo is initialized
**Then** the following structure exists:

- `packages/daemon/` with Bun entrypoint
- `packages/shared/` with TypeScript config
- `packages/admin/` (stub for Phase 1)
- `packages/backend/` (stub for Phase 1)
- Root `package.json` with Bun workspaces
- `tsconfig.base.json` with shared settings
  **And** running `bun install` succeeds without errors
  **And** running `bun run typecheck` passes

---

### Story 1.2: Implement Shared Contracts

As a **developer**,
I want **shared type definitions and constants**,
So that **all packages use consistent task states, error codes, and event types**.

**Acceptance Criteria:**

**Given** the packages/shared directory exists
**When** shared contracts are implemented
**Then** `taskStates.ts` exports: `PENDING`, `CLAIMED`, `RUNNING`, `COMPLETED`, `FAILED`, `NEEDS_HUMAN`, `CANCELED`
**And** `errorCodes.ts` exports UPPER_CASE codes: `FAILED_TIMEOUT`, `FAILED_RATE_LIMIT`, `FAILED_EXECUTION`, `FAILED_ENV_PRECHECK`, `NEEDS_HUMAN_CLARIFICATION`, `NEEDS_HUMAN_GIT_DIRTY`
**And** `eventTypes.ts` exports session event types: `TASK_CLAIMED`, `TASK_STARTED`, `PREFLIGHT_PASSED`, `PREFLIGHT_FAILED`, `AGENT_STARTED`, `TASK_COMPLETED`, `TASK_FAILED`, etc.
**And** `schemas.ts` exports Zod validators for task, repo, session, and config
**And** all exports use camelCase for fields per Architecture

---

### Story 1.3: Set Up SQLite with Schema

As a **developer**,
I want **SQLite configured with the local data schema**,
So that **tasks, repos, sessions, and config persist across daemon restarts**.

**Acceptance Criteria:**

**Given** the daemon package
**When** SQLite is initialized
**Then** database file is created at `~/.nightshift/nightshift.db`
**And** WAL mode is enabled for crash recovery
**And** tables exist: `tasks`, `repos`, `sessions`, `config`, `sync_queue`
**And** all fields use camelCase per Architecture
**And** migrations system is in place for future schema changes

---

### Story 1.4: Implement Daemon CLI Basics

As an **engineer**,
I want **basic CLI commands to control the daemon**,
So that **I can start, stop, and check status from terminal**.

**Acceptance Criteria:**

**Given** a user runs `nightshift start`
**When** the command executes
**Then** daemon process starts in foreground
**And** local web server starts on `localhost:3847`
**And** default browser opens to `http://localhost:3847`
**And** displays "Night Shift running at http://localhost:3847"

**Given** a user runs `nightshift stop`
**When** daemon is running
**Then** daemon gracefully shuts down
**And** displays "Night Shift stopped"

**Given** a user runs `nightshift status`
**When** daemon is running
**Then** displays: "Running", port, active task (if any), version
**When** daemon is not running
**Then** displays: "Not running"

**Given** a user runs `nightshift version`
**When** the command executes
**Then** displays current version number

---

### Story 1.5: Implement nightshift doctor Command

As an **engineer**,
I want **to validate my setup before running tasks**,
So that **I can fix issues before tasks fail**.

**Acceptance Criteria:**

**Given** a user runs `nightshift doctor`
**When** all prerequisites are met
**Then** displays checkmarks for each validation:

- ✓ claude CLI found (version X.X.X)
- ✓ gh CLI found and authenticated
- ✓ git CLI found (version X.X.X)
- ✓ Night Shift data directory exists
- ✓ SQLite database accessible
  **And** exits with code 0

**Given** a user runs `nightshift doctor`
**When** a prerequisite fails
**Then** displays ✗ for failed check with explanation
**And** displays suggested fix action
**And** exits with code 1

---

### Story 1.6: Implement CLI Task Add

As an **engineer**,
I want **to quickly add a task from terminal**,
So that **I can queue work without opening the browser**.

**Acceptance Criteria:**

**Given** daemon is running and user runs `nightshift add "Fix the login bug"`
**When** the command executes
**Then** task is created in local SQLite with status PENDING
**And** displays "Task queued: Fix the login bug"

**Given** user runs `nightshift add "task" --repo /path/to/repo`
**When** the repo path is valid
**Then** task is created with specified repo
**And** displays repo name in confirmation

**Given** user runs `nightshift add "task" --priority high`
**When** the command executes
**Then** task is created with HIGH priority

**Given** daemon is not running
**When** user runs `nightshift add "task"`
**Then** displays error: "Daemon not running. Start with 'nightshift start'"

---

### Story 1.7: Implement Local Config Management

As an **engineer**,
I want **daemon configuration stored locally**,
So that **settings persist across restarts**.

**Acceptance Criteria:**

**Given** the daemon starts for the first time
**When** no config exists
**Then** creates default config in `~/.nightshift/config.json`
**And** defaults: port 3847, timeout 4 hours, localQueueEnabled true

**Given** config exists
**When** daemon starts
**Then** loads config from `~/.nightshift/config.json`
**And** applies settings to daemon behavior

**Given** user runs `nightshift config`
**When** the command executes
**Then** opens browser to `http://localhost:3847/settings`

---

## Epic 2: Local Web UI Shell

**Goal:** Engineers can access Night Shift through a dark-mode web UI served locally.

**User Outcome:** Browser shows dashboard with status, navigation works, keyboard shortcuts function.

**FRs covered:** FR-S2, FR17
**NFRs addressed:** NFR2 (<200ms response), NFR11 (localhost only)

---

### Story 2.1: Create Hono Server with Static Serving

As a **developer**,
I want **Hono serving the React app and API routes**,
So that **the local UI works from the daemon process**.

**Acceptance Criteria:**

**Given** daemon starts
**When** Hono server initializes
**Then** binds to `127.0.0.1:3847` (localhost only, never 0.0.0.0)
**And** serves static files from bundled UI assets
**And** API routes available at `/api/*`
**And** all other routes serve `index.html` for SPA routing

**Given** port 3847 is in use
**When** daemon starts
**Then** tries ports 3847-3857 sequentially
**And** uses first available port
**And** displays actual port in console

---

### Story 2.2: Create React App Shell with Routing

As a **developer**,
I want **a React app with routing and layout**,
So that **users can navigate between pages**.

**Acceptance Criteria:**

**Given** user navigates to local UI
**When** app loads
**Then** displays dark-mode interface (background #0A0A0A)
**And** uses JetBrains Mono font throughout
**And** sidebar shows navigation: Dashboard, Tasks, Repos, Settings

**Given** navigation routes
**When** configured
**Then** `/` routes to Dashboard
**And** `/tasks` routes to Tasks list
**And** `/tasks/:id` routes to Task detail
**And** `/repos` routes to Repo management
**And** `/settings` routes to Settings

---

### Story 2.3: Implement Dashboard Page

As an **engineer**,
I want **a dashboard showing daemon status at a glance**,
So that **I know Night Shift is working and see recent activity**.

**Acceptance Criteria:**

**Given** user visits Dashboard
**When** page loads
**Then** displays daemon status (Running/Stopped)
**And** displays current version
**And** displays configured repos count
**And** displays summary cards: Tasks Pending, In Progress, Completed (last 24h), Failed

**Given** active task exists
**When** viewing Dashboard
**Then** displays "Currently Working On" section
**And** shows task prompt (truncated), repo, elapsed time
**And** status indicator pulses orange

**Given** no tasks exist
**When** viewing Dashboard
**Then** displays empty state: "No tasks yet"
**And** shows "Press Cmd+K to create your first task"

---

### Story 2.4: Implement Design System Foundation

As a **developer**,
I want **shadcn/ui components configured with dark theme**,
So that **UI is consistent and engineer-focused**.

**Acceptance Criteria:**

**Given** shadcn/ui is installed
**When** theme is configured
**Then** uses dark mode colors: Background #0A0A0A, Surface #121212, Border #262626
**And** accent color is orange #F97316
**And** text colors: Primary #FAFAFA, Muted #A3A3A3
**And** status colors: Success #22C55E, Warning #F59E0B, Destructive #EF4444

**Given** components are used
**When** rendering
**Then** Badge, Button, Card, Table, Toast, Dialog components available
**And** all respect dark theme
**And** focus rings are 2px orange outline

---

### Story 2.5: Implement Keyboard Shortcuts Foundation

As an **engineer**,
I want **keyboard shortcuts for common actions**,
So that **I can work efficiently without mouse**.

**Acceptance Criteria:**

**Given** user is on any page
**When** they press `Cmd+K` (or `Ctrl+K` on Windows)
**Then** command palette opens (placeholder for Epic 3)

**Given** user is on any page
**When** they press `?`
**Then** keyboard shortcuts help dialog appears

**Given** user is on a list view
**When** they press `j` or `↓`
**Then** selection moves down
**When** they press `k` or `↑`
**Then** selection moves up
**When** they press `Enter`
**Then** selected item opens

**Given** any modal or overlay is open
**When** user presses `Esc`
**Then** modal closes

---

## Epic 3: Local Task Queue & Creation

**Goal:** Engineers can create tasks via command palette and see them in a real-time list.

**User Outcome:** Press Cmd+K, type prompt, submit in <10 seconds, see task in list.

**FRs covered:** FR1, FR2, FR3, FR6, FR7, FR18, FR21
**NFRs addressed:** NFR2 (<200ms UI response)

---

### Story 3.1: Implement Task Data Model and API

As a **developer**,
I want **task CRUD operations via API**,
So that **UI can create, read, update tasks**.

**Acceptance Criteria:**

**Given** the local API
**When** `POST /api/tasks` is called with `{ prompt, repoId?, priority? }`
**Then** task is created in SQLite with status `PENDING`
**And** returns task object with id, createdAt

**Given** the local API
**When** `GET /api/tasks` is called
**Then** returns array of tasks with filters: status, repoId, limit, offset
**And** ordered by createdAt descending (newest first)

**Given** the local API
**When** `GET /api/tasks/:id` is called
**Then** returns full task object including session events if available

**Given** the local API
**When** `PATCH /api/tasks/:id` is called
**Then** updates allowed fields: status, priority, clarificationResponse

---

### Story 3.2: Implement Command Palette

As an **engineer**,
I want **to create tasks instantly with Cmd+K**,
So that **I can submit work in under 10 seconds**.

**Acceptance Criteria:**

**Given** user presses `Cmd+K` on any page
**When** palette opens
**Then** displays centered overlay (560px wide)
**And** input field is auto-focused
**And** placeholder: "Type a task or paste a GitHub URL..."

**Given** command palette is open
**When** user types prompt and presses Enter
**Then** task is created via API
**And** palette closes
**And** toast confirms: "Task queued"

**Given** command palette is open
**When** user presses Escape or clicks outside
**Then** palette closes without creating task

---

### Story 3.3: Implement GitHub URL Detection

As an **engineer**,
I want **GitHub URLs auto-detected and context extracted**,
So that **Claude has issue context without me copying it**.

**Acceptance Criteria:**

**Given** user pastes GitHub issue URL in command palette
**When** URL matches `github.com/{owner}/{repo}/issues/{number}`
**Then** GitHubIssuePreview component appears below input
**And** shows: repo name, issue number, title (fetched via API)
**And** repo auto-selected if configured locally

**Given** user pastes GitHub PR URL
**When** URL matches `github.com/{owner}/{repo}/pull/{number}`
**Then** similar preview shown for PR

**Given** GitHub API fetch fails
**When** network error or rate limit
**Then** displays "Could not fetch issue details"
**And** allows task creation with URL only

---

### Story 3.4: Implement Task Priority and Options

As an **engineer**,
I want **to set priority and options for my task**,
So that **important work happens first**.

**Acceptance Criteria:**

**Given** command palette is open
**When** user clicks priority selector (or Tab)
**Then** dropdown shows: Low, Medium (default), High, Urgent
**And** Urgent has red badge

**Given** user wants to specify branch
**When** they expand "Advanced options"
**Then** branch input appears
**And** defaults to repo's default branch

**Given** GitHub URL was detected
**When** repo is extracted
**Then** repo selector auto-fills with matching local repo

---

### Story 3.5: Create Task List View

As an **engineer**,
I want **to see all my tasks with filtering**,
So that **I can monitor and manage my queue**.

**Acceptance Criteria:**

**Given** user navigates to `/tasks`
**When** page loads
**Then** displays table of tasks (newest first)
**And** columns: Prompt (truncated), Status, Repo, Priority, Created

**Given** task list
**When** user selects status filter
**Then** list shows only tasks with selected status(es)
**And** filter chips display above table

**Given** task list
**When** user types in search
**Then** list filters to tasks matching prompt text

**Given** tasks in SQLite
**When** a task status changes
**Then** list updates via polling (every 2 seconds)
**And** status badge animates briefly

---

### Story 3.6: Implement Task Detail View

As an **engineer**,
I want **to see full task details**,
So that **I understand status and can take action**.

**Acceptance Criteria:**

**Given** user clicks task in list
**When** detail panel opens (split view)
**Then** shows full prompt text
**And** shows: status badge, priority badge, repo, branch
**And** shows: created at, duration (if completed)

**Given** task has GitHub issue linked
**When** viewing detail
**Then** GitHubIssuePreview displays
**And** "Open in GitHub" link works

**Given** task is PENDING
**When** viewing detail
**Then** shows "Waiting in queue..."

**Given** task is RUNNING
**When** viewing detail
**Then** status badge pulses orange
**And** shows elapsed time

---
