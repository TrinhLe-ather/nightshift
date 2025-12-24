---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - prd.md (v2.0 - Daemon-First)
workflowType: "architecture"
lastStep: 8
project_name: "claude-swarm"
user_name: "Hoalong"
date: "2025-12-23T07:19:00Z"
status: "complete"
completedAt: "2025-12-23T09:27:23Z"
updatedAt: "2025-12-23"
version: "2.0"
architectureType: "daemon-first"
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

Night Shift is a **daemon-first task execution system** that enables engineers to leverage their own workstations for Claude-powered code automation, with optional team-scale distribution.

**Core functional areas (Standalone Mode - Phase 0):**

- Local Web UI as primary interface (localhost:3847) - no CLI expertise needed
- Local task queue with SQLite persistence
- Task creation with prompt, repo selection, priority, optional GitHub issue link
- Task execution via Claude Code SDK with full tool access
- Automatic git operations (branch, commit, PR via `gh`)
- Session log storage (local)
- Auto-update on daemon startup
- CLI commands for power users (`add`, `start`, `stop`, `status`)

**Connected Mode capabilities (Phase 1 - Optional):**

- OAuth-based registration with Control Center
- Remote task queue subscription
- Task routing based on repo availability
- Session log upload to cloud storage
- Slack notifications (completed/needs_human/failed)
- Schedule-based availability (e.g., 8pm-8am)

**Execution expectations:**

- Daemon claims tasks from local queue (standalone) or remote queue (connected)
- Runs Claude Code against existing local repo checkout
- Records session log and produces reviewable outputs (commits/branches/PRs)

**Non-Functional Requirements:**

| Category | Requirement | Target |
|----------|-------------|--------|
| Performance | Daemon startup time | <3 seconds |
| | Local UI response time | <200ms |
| | Task claim latency (connected) | <5 seconds |
| | Heartbeat interval | 30 seconds |
| | Concurrent tasks per PC | 1 default, up to 10 configurable |
| Reliability | Crash recovery | Resume/cleanup within 60s of restart |
| | Task timeout | Default 4 hours, configurable |
| | Offline detection | After 3 missed heartbeats |
| | Data durability | SQLite with WAL mode |
| Security | Local UI access | localhost only (no network exposure) |
| | API credentials | Stored locally, never uploaded |
| | Auth (connected) | OAuth with token refresh |
| Scalability | PCs (connected mode) | 50+ |
| | Concurrent tasks (system-wide) | 100+ |
| | Session log size | Up to 10MB per session |

**Scale & Complexity:**

- Primary domain: **Local-first daemon** with optional cloud connectivity
- Complexity level: Medium (daemon + local UI + optional distributed orchestration)
- Key complexity factors:
  - Dual-mode operation (standalone vs connected)
  - Cross-platform binary distribution (macOS/Linux/Windows)
  - Auto-update mechanism without interrupting running tasks
  - Mode transition (standalone → connected) without migration

### Technical Constraints & Dependencies

| Constraint | Implication |
|------------|-------------|
| Large repos (200GB+) | Execution on pre-existing local clones only |
| Zero-friction onboarding | No server setup required for initial value |
| Non-technical users | Local Web UI as primary interface, CLI optional |
| Cross-platform | Windows primary, macOS/Linux supported |
| Auto-update safety | Never interrupt running tasks; checksum verification |

**Implementation implications:**

- Task lifecycle semantics remain consistent and machine-actionable:
  - `needs_human` reserved for irreducible blockers (permissions/credentials/approval, missing access, ambiguity that cannot be safely inferred)
  - `failed` includes timeouts and rate limits as explicit, reason-coded failure modes
- A daemon health/preflight command (`nightshift doctor`) validates prerequisites (`claude`, `gh`, `git`, auth) and is reused at task start
- Session logs should be structured (event stream) to support debugging and UI rendering
- Local-first data model: SQLite is source of truth for standalone; syncs to Convex when connected

### Cross-Cutting Concerns Identified

- **Mode detection & transition**: Standalone vs Connected behavior switching
- **Local-first data**: SQLite as primary store, Convex as optional sync target
- **Isolation & safety**: Uncommitted changes detection, one task per repo
- **Observability**: Structured session events, local log viewer
- **Auto-update lifecycle**: Version check, download, verify, replace when idle
- **Cross-platform consistency**: Path normalization, OS-specific service management
- **Consistent error taxonomy**: Shared between daemon local UI and Control Center

## Starter Template Evaluation

### Primary Technology Domain

Local-first daemon with embedded web UI + optional cloud connectivity:

- Daemon with embedded HTTP server (primary)
- Local Web UI served by daemon
- Optional Control Center for team mode (Phase 1)

### Technical Preference: Cross-Platform Distribution

Primary target is Windows, with support for macOS and Linux.

Implications:

- Bun compile produces single executable per platform
- Prefer runtimes and dependencies that work consistently across OSes
- Keep MVP simple (foreground run); OS-specific service management deferred
- Normalize filesystem paths and implement repo-level locking

### Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Daemon | Bun (compiled executable) | Single binary, fast startup, TypeScript native, cross-platform |
| Local Web Server | Hono | Lightweight, fast, runs in Bun, serves local UI |
| Local Storage | SQLite (better-sqlite3) | Embedded, zero-config, WAL mode for crash recovery |
| Local UI | React (bundled static assets) | Served by Hono from daemon, no separate process |
| Control Center | Convex + React | Real-time sync, serverless (Phase 1 - optional) |

### Daemon Distribution

| Platform | Binary | Notes |
|----------|--------|-------|
| Windows | `nightshift-win-x64.exe` | Primary target |
| macOS (Apple Silicon) | `nightshift-darwin-arm64` | |
| macOS (Intel) | `nightshift-darwin-x64` | |
| Linux | `nightshift-linux-x64` | |

### Initialization Commands

```bash
# Monorepo setup
bun init
mkdir -p packages/{daemon,shared,admin,backend}

# Daemon (primary - Phase 0)
cd packages/daemon && bun init

# Local UI (bundled into daemon)
cd packages/daemon/ui && bun create vite . --template react-ts

# Control Center (Phase 1 - optional)
cd packages/admin && bun create vite . --template react-ts

# Convex backend (Phase 1 - optional)
cd packages/backend && bunx convex init
```

### Baseline Operational Conventions

- `nightshift start`: Launch daemon + open local UI in browser
- `nightshift doctor`: Validates `claude`, `gh`, `git`, repo paths; reused at task start
- `nightshift add "task"`: Quick CLI task addition to local queue
- Consistent error taxonomy across local UI and Control Center (e.g., `FAILED_TIMEOUT`, `FAILED_RATE_LIMIT`)
- Auto-update: Version check on startup, download when idle, checksum verify, restart
- MVP isolation: one repo per PC, one task per repo at a time

## Core Architectural Decisions

### Data Architecture

**Data Architecture Philosophy:**

SQLite-first for standalone value; Convex adds team coordination when connected.

#### Local Data Model (SQLite - Always Present)

SQLite is the **primary data store** for the daemon, regardless of mode.

**Tables:**

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `tasks` | Local task queue | `id`, `prompt`, `repoPath`, `priority`, `status`, `createdAt`, `remoteId?` |
| `sessions` | Execution logs | `id`, `taskId`, `events` (JSON), `startedAt`, `completedAt` |
| `repos` | Configured repositories | `id`, `name`, `path`, `defaultBranch` |
| `config` | Daemon settings | `key`, `value` (schedules, server URL, etc.) |
| `sync_queue` | Pending uploads (connected) | `id`, `entityType`, `entityId`, `syncedAt?` |

**Local-First Principles:**

- All operations work offline against SQLite
- No network required for standalone mode
- Connected mode syncs to Convex but SQLite remains source of truth for execution
- Crash recovery from SQLite state (WAL mode)

#### Remote Data Model (Convex - Connected Mode Only)

When connected to Control Center, Convex provides:

| Purpose | Convex Role |
|---------|-------------|
| Team task queue | Remote tasks distributed to PCs |
| PC registry | Which PCs are online, their repos, schedules |
| Session summaries | Pointers to session logs (not full logs) |
| User management | OAuth, org membership |

**Sync Behavior:**

| Direction | What Syncs | When |
|-----------|------------|------|
| Remote → Local | Assigned tasks | On claim from remote queue |
| Local → Remote | Task status updates | On status change |
| Local → Remote | Session summary + log URL | On task completion |
| Local → Remote | PC heartbeat | Every 30 seconds |

#### Session Logging (Both Modes)

- Stored locally as structured NDJSON in `~/.nightshift/sessions/`
- Connected mode: Upload to R2/S3, store URL pointer in Convex
- Standalone mode: Local storage only (configurable retention)

#### Data Boundaries (Hard Rules)

| Data | Location | Never Leaves PC |
|------|----------|-----------------|
| Claude API key | Local config | ✓ |
| Git credentials | Local git config | ✓ |
| Full session logs | Local filesystem | Uploaded only if connected |
| Task prompts | SQLite (local) | Synced to Convex if connected |
| Repo paths | SQLite (local) | Synced to Convex if connected |

#### Attachments (Phase 2)

- Store attachments in object storage (R2/S3) and reference from Convex via URLs/metadata
- MVP constraints: images/text/code/PDF allowed; max size 25MB
- Standalone mode: Local attachment storage in `~/.nightshift/attachments/`

### Authentication & Security

**Authentication Philosophy:**

Standalone mode requires no authentication. Connected mode uses OAuth for Control Center access.

#### Standalone Mode (No Auth Required)

| Aspect | Behavior |
|--------|----------|
| Local UI Access | `localhost:3847` only - no network exposure |
| Who can access | Anyone with physical/remote access to the machine |
| Task creation | No identity attached - all tasks are "local" |
| Session logs | Stored locally, no access control |

**Security via localhost binding:**

- Hono server binds to `127.0.0.1` only
- No authentication needed because access = machine access
- Browser on same machine can access; remote browsers cannot

#### Connected Mode (OAuth Required)

| Aspect | Behavior |
|--------|----------|
| Initial auth | `nightshift auth login` opens browser OAuth flow |
| Provider | Google OAuth via better-auth |
| Domain allowlist | Enforce allowed email domains at sign-in |
| Token storage | Encrypted locally in `~/.nightshift/auth.json` |
| Token refresh | Automatic refresh before expiry |
| Logout | `nightshift auth logout` clears local tokens |

**PC Registration Flow:**

1. User runs `nightshift auth login`
2. Browser opens Control Center OAuth flow
3. User authenticates with Google
4. Control Center issues PC-specific token
5. Daemon stores token locally (encrypted)
6. PC appears in Control Center as "pending approval"
7. Admin approves PC → can claim org tasks

#### Secrets & Credential Boundaries (Hard Rules)

| Secret | Storage | Transmission |
|--------|---------|--------------|
| Claude API key | `~/.nightshift/config` or env var | Never transmitted |
| Git credentials | System git config | Never transmitted |
| GitHub token | System `gh` config | Never transmitted |
| OAuth tokens | `~/.nightshift/auth.json` (encrypted) | Used for Convex API calls only |

#### Local UI Security

| Concern | Mitigation |
|---------|------------|
| Network exposure | Bind to `127.0.0.1` only, never `0.0.0.0` |
| CSRF | Not applicable (same-origin, localhost) |
| XSS | Standard React escaping; no user-generated HTML |
| Session logs with secrets | Warn if secrets detected; optional redaction |

#### Rate Limiting (Connected Mode)

- On rate limit: task → `FAILED_RATE_LIMIT`, PC → `RATE_LIMITED`
- PC stops claiming for 1 hour (`disabled_until`)
- Hourly probe to re-enable; remain disabled on probe failure

## Operating Modes

Night Shift daemon operates in one of three modes, determined at runtime.

### Mode Definitions

| Mode | Description | Server Required | Local Queue | Remote Queue |
|------|-------------|-----------------|-------------|--------------|
| **Standalone** | Daemon runs independently | No | ✓ | ✗ |
| **Connected** | Daemon registered with Control Center | Yes | ✗ | ✓ |
| **Hybrid** | Both local and remote queues active | Yes | ✓ | ✓ |

### Standalone Mode (Default)

**When active:** No `serverUrl` configured OR no valid auth token

**Behavior:**

- Local Web UI at `localhost:3847` is the only interface
- Tasks created via UI or CLI go to local SQLite queue
- Execution happens against local repos
- Session logs stored locally in `~/.nightshift/sessions/`
- No network calls to any server
- Auto-update still checks GitHub releases (network optional)

**User experience:**

1. Download binary
2. Run `nightshift start`
3. Browser opens to local UI
4. Create tasks, see results — all local

### Connected Mode

**When active:** `serverUrl` configured AND valid token AND `localQueueEnabled = false`

**Behavior:**

- Daemon subscribes to Control Center for remote tasks
- Tasks come from team queue (Convex)
- Local UI shows remote task status
- Session logs uploaded to R2/S3
- Heartbeat sent every 30 seconds
- Schedule-based availability honored

**User experience:**

1. Run `nightshift auth login`
2. Authenticate via browser OAuth
3. PC appears in Control Center
4. Admin approves PC
5. Daemon claims and executes team tasks

### Hybrid Mode

**When active:** `serverUrl` configured AND valid token AND `localQueueEnabled = true`

**Behavior:**

- Both local and remote queues are active
- Remote tasks have priority (checked first)
- Local tasks execute when no remote tasks available
- Local UI shows both queues (tabs)
- Session logs: local tasks stay local, remote tasks sync

**User experience:**

- Best of both worlds
- Personal tasks execute immediately
- Team tasks claim when idle
- Clear separation in UI

### Mode Transition

| From | To | Action Required |
|------|-----|-----------------|
| Standalone → Connected | `nightshift auth login` + admin approval |
| Connected → Standalone | `nightshift auth logout` OR token expiry |
| Connected → Hybrid | Enable local queue in settings |
| Hybrid → Connected | Disable local queue in settings |

**Data preservation:**

- Local tasks remain in SQLite across mode changes
- Auth logout does not delete local data
- Re-connecting preserves local history

## Local Web UI Architecture

The daemon embeds a full web UI served via Hono at `localhost:3847`.

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  Daemon Process                      │
│  ┌───────────────────────────────────────────────┐  │
│  │              Hono HTTP Server                  │  │
│  │  ┌─────────────┐  ┌─────────────────────────┐ │  │
│  │  │ Static Files│  │      API Routes         │ │  │
│  │  │ (React App) │  │  /api/tasks             │ │  │
│  │  │             │  │  /api/repos             │ │  │
│  │  │ index.html  │  │  /api/sessions          │ │  │
│  │  │ assets/*    │  │  /api/config            │ │  │
│  │  └─────────────┘  │  /api/status            │ │  │
│  │                   └─────────────────────────┘ │  │
│  └───────────────────────────────────────────────┘  │
│                         │                            │
│                         ▼                            │
│  ┌───────────────────────────────────────────────┐  │
│  │                   SQLite                       │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Server Configuration

```typescript
// packages/daemon/src/server/app.ts
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';

const app = new Hono();

// API routes
app.route('/api/tasks', tasksRouter);
app.route('/api/repos', reposRouter);
app.route('/api/sessions', sessionsRouter);
app.route('/api/config', configRouter);
app.route('/api/status', statusRouter);

// Static files (React build)
app.use('/*', serveStatic({ root: './ui/dist' }));

// Bind to localhost only
export function startServer() {
  return Bun.serve({
    fetch: app.fetch,
    hostname: '127.0.0.1',  // Security: localhost only
    port: 3847
  });
}
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Daemon status, mode, version, active task |
| `/api/tasks` | GET | List tasks (with filters) |
| `/api/tasks` | POST | Create new task |
| `/api/tasks/:id` | GET | Get task details |
| `/api/tasks/:id` | PATCH | Update task (cancel, retry) |
| `/api/repos` | GET | List configured repos |
| `/api/repos` | POST | Add repo |
| `/api/repos/:id` | DELETE | Remove repo |
| `/api/sessions/:id` | GET | Get session details + events |
| `/api/config` | GET | Get daemon config |
| `/api/config` | PATCH | Update config |

### UI Pages

| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/` | Status, quick task input, active task, recent tasks |
| Tasks | `/tasks` | Full task list, filters, Local/Remote tabs (hybrid) |
| Task Detail | `/tasks/:id` | Prompt, status timeline, session log, PR link |
| Repos | `/repos` | Add/edit/remove configured repositories |
| Sessions | `/sessions` | Browse past session logs |
| Settings | `/settings` | Server connection, schedule, updates |

### Real-Time Updates

```typescript
// Polling-based updates (simple, works everywhere)
// packages/daemon/ui/src/hooks/useStatus.ts

export function useStatus() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    const poll = async () => {
      const res = await fetch('/api/status');
      setStatus(await res.json());
    };

    poll();
    const interval = setInterval(poll, 2000);  // Poll every 2s
    return () => clearInterval(interval);
  }, []);

  return status;
}
```

### Build & Bundle

```bash
# Development (separate processes)
bun run dev:ui      # Vite dev server on :5173, proxies /api to :3847
bun run dev:daemon  # Daemon on :3847

# Production build
bun run build:ui    # Vite builds to packages/daemon/ui/dist/
bun run build       # Bun compiles daemon with embedded UI assets
```

**Embedded assets:** The React build output is embedded into the compiled binary, so distribution is a single executable file.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**
Key areas where AI agents commonly diverge and cause integration bugs:

- **Mode detection**: Standalone vs Connected vs Hybrid behavior
- Naming conventions across SQLite, Convex, UI, daemon, and logs
- Task state transitions and "terminal vs retryable" outcomes
- Session logging shape (event envelope, ordering, persistence)
- Error taxonomy and mapping to user-facing states
- **Conditional sync**: When to sync to server vs local-only
- Repo safety gates (dirty tree, repo lock, concurrency)
- API/message formats (local Hono API + optional Convex)
- File/project organization in daemon-first codebase

### Naming Patterns

**Canonical casing rule (hard):**

- Use `camelCase` everywhere for identifiers and data fields:
  - Convex documents/fields
  - JSON payloads (if any HTTP endpoints exist)
  - TypeScript variables, function names, config keys
- React components: `PascalCase` component names are OK, but props/state stay `camelCase`.

**Convex table naming (recommended):**

- Use lowercase plural nouns: `tasks`, `pcs`, `sessions`, `orgs`, `users`, `attachments`, `settings`.

**IDs and foreign keys:**

- Use `{entity}Id` fields (e.g., `taskId`, `pcId`, `orgId`, `userId`, `sessionId`).

### Structure Patterns

**Packages (daemon-first monorepo):**

- `packages/daemon/` (PRIMARY: Bun daemon + CLI + embedded local UI)
- `packages/shared/` (types, constants: task states, error codes, event types, validators)
- `packages/admin/` (Phase 1: Control Center web UI)
- `packages/backend/` (Phase 1: Convex schema + functions)

**Shared contracts (hard):**

- All cross-boundary enums/constants live in `packages/shared/`:
  - Task states
  - Error codes (UPPER_CASE_CODE)
  - Event `type` strings (see below)
  - Validation schemas (Zod or equivalent)
- Used by daemon, local UI, admin, and backend

### Format Patterns

**API/data format (canonical):**

- If any HTTP endpoints are introduced (daemon local UI, health endpoints), use:
  - Success: `{ ok: true, data }`
  - Error: `{ ok: false, error: { code, message, details?, retryable? } }`
- Use ISO-8601 UTC timestamps as strings everywhere (`2025-12-23T07:19:00Z`).

**Error taxonomy (hard):**

- Use `UPPER_CASE_CODE` strings.
- Every failure surfaced to Convex/UI includes:
  - `code` (UPPER_CASE_CODE)
  - `message` (human-readable, safe)
  - `retryable` (boolean)
  - `details` (structured, safe to store)
- Canonical examples:
  - `FAILED_TIMEOUT`
  - `FAILED_RATE_LIMIT`
  - `FAILED_EXECUTION`
  - `FAILED_ENV_PRECHECK`
  - `NEEDS_HUMAN_CLARIFICATION`
  - `NEEDS_HUMAN_APPROVAL`
  - `NEEDS_HUMAN_GIT_DIRTY`

### Communication Patterns

**Structured session logs (hard):**

- Persist a session event stream as NDJSON in object storage (R2/S3).
- Every line is a single event object with the canonical envelope:

```json
{
  "schemaVersion": 1,
  "ts": "2025-12-23T07:19:00Z",
  "seq": 42,
  "level": "info",
  "type": "TASK_CLAIMED",
  "orgId": "org_...",
  "taskId": "task_...",
  "pcId": "pc_...",
  "userId": "user_...",
  "runId": "run_...",
  "data": {}
}
```

**Event type naming (recommended):**

- Use `UPPER_CASE` event `type` strings so they’re consistent with error codes and easy to grep.
- Minimum standard event types:
  - `PC_HEARTBEAT_SENT`
  - `PC_ELIGIBILITY_CHANGED` (includes `eligible`, `reason`, `disabledUntil`)
  - `TASK_CLAIMED`
  - `TASK_STARTED`
  - `PREFLIGHT_STARTED`
  - `PREFLIGHT_PASSED`
  - `PREFLIGHT_FAILED` (includes error code)
  - `REPO_LOCK_ACQUIRED`
  - `REPO_LOCK_RELEASED`
  - `AGENT_STARTED`
  - `AGENT_NEEDS_HUMAN` (includes question)
  - `ARTIFACT_COMMIT_CREATED`
  - `ARTIFACT_PR_CREATED`
  - `SESSION_UPLOADED`
  - `TASK_STATE_CHANGED` (includes `from`, `to`, `reasonCode`)
  - `TASK_COMPLETED`
  - `TASK_FAILED`

### Process Patterns

**Repo safety gate (hard):**

- Default policy: require a clean working tree before starting any task.
- If repo is dirty:
  - Emit `PREFLIGHT_FAILED` with `NEEDS_HUMAN_GIT_DIRTY`
  - Transition task to `needs_human` with instructions (stash/commit/clean) and stop.

**MVP concurrency rules (hard):**

- One task per repo at a time per PC.
- Enforce via a repo-level lock (cross-process safe) and record lock acquisition/release in session events.

**PC approval gating (hard):**

- Unapproved PCs:
  - May claim only the registering user’s personal-pool tasks
  - Must not claim org-pool tasks
- Approved PCs:
  - May claim org-pool tasks (subject to PC config flags)

**Rate limit circuit breaker (hard):**

- On 429/rate limit:
  - Task transitions to `FAILED_RATE_LIMIT` (fail fast; do not keep consuming the lease)
  - PC transitions to `RATE_LIMITED` (`disabledUntil = now + 1h`) and stops claiming new work
  - Hourly re-enable uses a real Claude API probe (minimal “hello” prompt); remain disabled on probe failure

**Preflight command (hard interface):**

- Implement `nightshift doctor` as the single source of truth for environment checks:
  - verify `claude`, `gh`, `git` present
  - verify auth present (Convex/better-auth token)
  - verify repo paths accessible
  - verify Claude API probe (minimal prompt) if configured
- Task execution must reuse the same checks at startup and emit results into session events.

**Local filesystem conventions (recommended):**

- Use a consistent home-dir base:
  - Windows: `%USERPROFILE%\\.nightshift\\`
  - macOS/Linux: `~/.nightshift/`
- Store:
  - auth tokens (encrypted)
  - daemon config
  - SQLite DB
  - session logs
- repo locks / runtime markers

### Mode-Aware Patterns (New)

**Operating mode detection (hard):**

```typescript
// packages/daemon/src/config/mode.ts
export type OperatingMode = 'standalone' | 'connected' | 'hybrid';

export function getOperatingMode(): OperatingMode {
  const config = getConfig();

  if (!config.serverUrl || !hasValidToken()) {
    return 'standalone';
  }

  if (config.localQueueEnabled && config.remoteQueueEnabled) {
    return 'hybrid';
  }

  return 'connected';
}

export function isConnected(): boolean {
  return getOperatingMode() !== 'standalone';
}
```

**Conditional sync pattern (hard):**

```typescript
// Only sync when connected
async function onTaskComplete(task: Task, session: Session) {
  // Always: save locally
  await db.sessions.update(session.id, { status: 'completed' });

  // Connected mode: sync to server
  if (isConnected()) {
    await syncQueue.add({
      type: 'session_complete',
      taskId: task.id,
      sessionId: session.id
    });
  }
}
```

**Task queue with mode awareness (hard):**

```typescript
async function getNextTask(): Promise<Task | null> {
  const mode = getOperatingMode();

  // Standalone: local queue only
  if (mode === 'standalone') {
    return db.tasks.getNextPending();
  }

  // Connected: check remote first
  const remoteTask = await convex.claimNextTask();
  if (remoteTask) {
    await db.tasks.upsert({ ...remoteTask, source: 'remote' });
    return remoteTask;
  }

  // Hybrid: fall back to local queue
  if (mode === 'hybrid') {
    return db.tasks.getNextPending();
  }

  return null;
}
```

**Auto-update pattern (hard):**

```typescript
async function checkForUpdate(): Promise<UpdateInfo | null> {
  const latest = await fetchLatestVersion();

  if (semver.gt(latest.version, VERSION)) {
    return {
      version: latest.version,
      downloadUrl: latest.assets[PLATFORM],
      checksum: latest.checksums[PLATFORM]
    };
  }
  return null;
}

async function performUpdate(info: UpdateInfo): Promise<void> {
  // Only update when idle
  if (await hasActiveTask()) {
    throw new Error('Cannot update while task is running');
  }

  const binary = await download(info.downloadUrl);

  // Verify checksum
  if (sha256(binary) !== info.checksum) {
    throw new Error('Checksum mismatch');
  }

  await replaceBinary(binary);
  await restart();
}
```

## Project Structure & Boundaries

**Structure Philosophy:**

Daemon is the primary package. Control Center is optional (Phase 1).

### Complete Project Directory Structure

```
nightshift/
├── README.md
├── package.json                 # bun workspaces
├── bun.lockb
├── tsconfig.base.json
├── .gitignore
│
├── packages/
│   ├── daemon/                  # PRIMARY - Phase 0
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts         # Entry point
│   │   │   ├── cli/
│   │   │   │   ├── main.ts      # CLI parser
│   │   │   │   └── commands/
│   │   │   │       ├── start.ts
│   │   │   │       ├── stop.ts
│   │   │   │       ├── status.ts
│   │   │   │       ├── add.ts
│   │   │   │       ├── doctor.ts
│   │   │   │       ├── auth.ts      # Connected mode
│   │   │   │       └── update.ts
│   │   │   ├── server/
│   │   │   │   ├── app.ts           # Hono app
│   │   │   │   ├── routes/
│   │   │   │   │   ├── api/
│   │   │   │   │   │   ├── tasks.ts
│   │   │   │   │   │   ├── repos.ts
│   │   │   │   │   │   ├── sessions.ts
│   │   │   │   │   │   ├── config.ts
│   │   │   │   │   │   └── status.ts
│   │   │   │   │   └── static.ts    # Serve UI assets
│   │   │   │   └── middleware/
│   │   │   ├── db/
│   │   │   │   ├── sqlite.ts
│   │   │   │   ├── schema.ts
│   │   │   │   └── migrations/
│   │   │   ├── tasks/
│   │   │   │   ├── queue.ts
│   │   │   │   ├── executor.ts
│   │   │   │   ├── preflight.ts
│   │   │   │   └── claude.ts        # Claude Code SDK
│   │   │   ├── repo/
│   │   │   │   ├── lock.ts
│   │   │   │   ├── git.ts
│   │   │   │   └── status.ts
│   │   │   ├── session/
│   │   │   │   ├── logger.ts        # NDJSON events
│   │   │   │   └── storage.ts
│   │   │   ├── sync/                # Connected mode
│   │   │   │   ├── convex.ts
│   │   │   │   ├── heartbeat.ts
│   │   │   │   └── upload.ts
│   │   │   ├── update/
│   │   │   │   ├── checker.ts
│   │   │   │   └── installer.ts
│   │   │   └── config/
│   │   │       └── paths.ts
│   │   └── ui/                      # Local Web UI (React)
│   │       ├── package.json
│   │       ├── vite.config.ts
│   │       ├── index.html
│   │       └── src/
│   │           ├── main.tsx
│   │           ├── App.tsx
│   │           ├── api/             # Fetch from localhost API
│   │           ├── pages/
│   │           │   ├── Dashboard.tsx
│   │           │   ├── Tasks.tsx
│   │           │   ├── TaskDetail.tsx
│   │           │   ├── Repos.tsx
│   │           │   ├── Sessions.tsx
│   │           │   └── Settings.tsx
│   │           └── components/
│   │
│   ├── shared/                      # Cross-boundary contracts
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── taskStates.ts
│   │       ├── errorCodes.ts
│   │       ├── eventTypes.ts
│   │       ├── schemas.ts           # Zod validation
│   │       └── types.ts
│   │
│   ├── admin/                       # Control Center - Phase 1
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── routes/
│   │       ├── features/
│   │       └── components/
│   │
│   └── backend/                     # Convex - Phase 1
│       ├── package.json
│       ├── convex.json
│       └── convex/
│           ├── schema.ts
│           ├── auth.ts
│           ├── tasks.ts
│           ├── pcs.ts
│           ├── sessions.ts
│           └── integrations/
│               └── slack.ts
```

### Package Boundaries

| Package | Purpose | Phase |
|---------|---------|-------|
| `packages/daemon` | Daemon + CLI + Local Web UI + execution engine | Phase 0 |
| `packages/shared` | Types, constants, schemas shared across packages | Phase 0 |
| `packages/admin` | Control Center web app (team management) | Phase 1 |
| `packages/backend` | Convex functions (team coordination) | Phase 1 |

### Daemon Internal Boundaries

| Module | Responsibility |
|--------|----------------|
| `cli/` | Command parsing, entry points |
| `server/` | Hono HTTP server, API routes, static file serving |
| `db/` | SQLite operations, schema, migrations |
| `tasks/` | Queue management, execution, Claude SDK integration |
| `repo/` | Git operations, locking, status checks |
| `session/` | Event logging, storage |
| `sync/` | Convex sync, heartbeat (connected mode) |
| `update/` | Auto-update mechanism |
| `ui/` | React app (built and bundled into daemon) |

### Build & Distribution

```bash
# Development
bun run dev              # Start daemon in dev mode
bun run dev:ui           # Start UI in Vite dev mode

# Production build
bun run build:ui         # Build React UI to daemon/dist/ui
bun run build:daemon     # Compile daemon with embedded UI
bun run build:all        # Full production build

# Distribution binaries
dist/
├── nightshift-darwin-arm64
├── nightshift-darwin-x64
├── nightshift-linux-x64
└── nightshift-win-x64.exe
```

### Requirements → Structure Mapping

**Phase 0 (Standalone):**

| Requirement | Location |
|-------------|----------|
| Local task queue | `packages/daemon/src/tasks/queue.ts` |
| Task creation UI | `packages/daemon/ui/src/pages/Tasks.tsx` |
| Task execution | `packages/daemon/src/tasks/executor.ts` |
| Claude SDK integration | `packages/daemon/src/tasks/claude.ts` |
| Repo management | `packages/daemon/src/repo/*` |
| Session logging | `packages/daemon/src/session/*` |
| CLI commands | `packages/daemon/src/cli/commands/*` |
| Auto-update | `packages/daemon/src/update/*` |

**Phase 1 (Connected):**

| Requirement | Location |
|-------------|----------|
| Control Center UI | `packages/admin/src/*` |
| Team task queue | `packages/backend/convex/tasks.ts` |
| PC registry | `packages/backend/convex/pcs.ts` |
| Session sync | `packages/daemon/src/sync/*` |
| Slack notifications | `packages/backend/convex/integrations/slack.ts` |

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**

- Bun + TypeScript daemon with embedded Hono server supports cross-platform distribution
- SQLite-first with optional Convex sync enables standalone-to-connected progression
- Security boundaries maintained: localhost-only binding, secrets never leave PC

**Pattern Consistency:**

- `camelCase` everywhere avoids cross-layer drift
- UPPER_CASE codes unify error taxonomy with session event types
- Mode-aware patterns ensure consistent behavior across standalone/connected/hybrid

**Structure Alignment:**

- `packages/daemon` as primary matches daemon-first philosophy
- `packages/shared` prevents drift across daemon local UI and Control Center
- Phase-based structure (daemon first, server optional) matches PRD v2.0

### Requirements Coverage Validation ✅

**Phase 0 (Standalone) Requirements:**

| Requirement | Coverage |
|-------------|----------|
| Single executable distribution | ✓ Bun compile |
| Local Web UI (no CLI needed) | ✓ Hono + React at localhost:3847 |
| Local task queue | ✓ SQLite |
| Task execution | ✓ Claude Code SDK |
| Git operations | ✓ `gh` CLI integration |
| Auto-update | ✓ Version check + binary replacement |
| CLI for power users | ✓ `nightshift add`, `start`, `stop`, etc. |

**Phase 1 (Connected) Requirements:**

| Requirement | Coverage |
|-------------|----------|
| OAuth authentication | ✓ better-auth + Google OAuth |
| PC registration | ✓ CLI auth flow + admin approval |
| Remote task queue | ✓ Convex subscription |
| Session upload | ✓ R2/S3 + Convex pointers |
| Slack notifications | ✓ Convex integrations |
| Schedule-based availability | ✓ Config + daemon enforcement |

### Validation Issues Addressed (Preserved from v1)

1. **Canonical Task State Machine:**

- Task `state` is one of:
  - `PENDING | CLAIMED | RUNNING | COMPLETED | FAILED | NEEDS_HUMAN | CANCELED`
- Additional fields capture terminal reason without state explosion:
  - `failureCode` when `state=FAILED`
  - `needsHumanCode` when `state=NEEDS_HUMAN`

2. **Rate-Limit Circuit Breaker:**

- On rate limit: task → `FAILED_RATE_LIMIT`, PC → `RATE_LIMITED`
- Hourly probe to re-enable

### Gap Analysis Results

**Critical gaps:** None identified.

**Non-blocking notes:**

- Version pinning for Bun/Hono/Convex pending verification at implementation time
- Auto-update binary replacement mechanism needs platform-specific testing (especially Windows)

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Recommended implementation sequence:**

1. **Phase 0a:** Daemon scaffolding + SQLite + CLI basics (`start`, `stop`, `status`, `doctor`)
2. **Phase 0b:** Hono server + local API routes + React UI shell
3. **Phase 0c:** Task queue + executor + Claude SDK integration
4. **Phase 0d:** Auto-update mechanism
5. **Phase 1a:** Convex backend + auth flow
6. **Phase 1b:** Daemon sync + heartbeat + remote queue
7. **Phase 1c:** Control Center UI

## Architecture Completion Summary

### Workflow Completion

**Architecture Update:** COMPLETED
**Original Version:** v1.0 (Server-First)
**Updated Version:** v2.0 (Daemon-First)
**Date Updated:** 2025-12-23
**Document Location:** `_bmad-output/architecture.md`

### Key Changes from v1.0

| Aspect | v1.0 (Server-First) | v2.0 (Daemon-First) |
|--------|---------------------|---------------------|
| Primary interface | Control Center | Local Web UI |
| Data store | Convex (primary) | SQLite (primary) |
| Server requirement | Required | Optional |
| Onboarding | Register with server | Download and run |
| Value delivery | After team setup | Immediate (standalone) |

### Architecture Deliverables

- Daemon-first architecture for Night Shift with standalone/connected/hybrid modes
- SQLite-first data model with optional Convex sync
- Embedded local web UI via Hono at localhost:3847
- Mode-aware patterns for consistent behavior across modes
- Phased implementation path (standalone → connected)
- Cross-platform binary distribution (Windows/macOS/Linux)

### Implementation Handoff

**First implementation priority:**

- Scaffold daemon package with Bun, implement CLI basics, set up SQLite

**Development sequence:**

1. **Phase 0a:** Daemon scaffolding + SQLite + CLI (`start`, `stop`, `status`, `doctor`)
2. **Phase 0b:** Hono server + local API routes + React UI shell
3. **Phase 0c:** Task queue + executor + Claude SDK integration
4. **Phase 0d:** Auto-update mechanism
5. **Phase 1a:** Convex backend + auth flow
6. **Phase 1b:** Daemon sync + heartbeat + remote queue
7. **Phase 1c:** Control Center UI
