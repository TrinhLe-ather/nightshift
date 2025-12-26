# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NightShift is a daemon-based task automation system for Claude Code. It runs as a local daemon that manages a task queue, executes tasks via Claude Code, and provides a web UI for monitoring and control.

## Commands

```bash
# Install dependencies
bun install

# Development
bun run dev              # Start all packages in dev mode (via Turborepo)
bun run daemon dev       # Start daemon with hot reload

# Type checking
bun run typecheck        # Type check all packages (uses tsgo)
bun run daemon typecheck # Type check daemon only

# Linting/Formatting
bun run lint             # Lint all packages (oxlint)
bun run format           # Format all packages (oxfmt)

# Build
bun run build            # Build all packages
bun run daemon build     # Build daemon executable to dist/nightshift

# Database (Drizzle)
bun run daemon db:generate   # Generate migrations
bun run daemon db:migrate    # Run migrations
bun run daemon db:push       # Push schema changes
bun run daemon db:studio     # Open Drizzle Studio
```

## Architecture

### Monorepo Structure (Bun workspaces)

- **packages/daemon** - Primary package: CLI daemon with embedded web server
- **packages/shared** - Cross-boundary contracts (types, schemas, error codes, task states)
- **packages/admin** - Control Center UI (Phase 1, placeholder)
- **packages/backend** - Convex functions (Phase 1, placeholder)

### Daemon Package Architecture

The daemon is a self-contained Bun application with these core modules:

- **cli/** - Command routing (start, stop, status, add, repos, config, doctor, version)
- **server/** - Bun HTTP server with Hono, serves both API and React UI
- **orpc/** - Type-safe RPC API layer using oRPC with Zod schemas
  - Routers: status, config, tasks, sessions, repos, update
- **executor/** - Task execution engine
  - `TaskExecutor` - Main orchestrator polling queue, managing concurrent tasks
  - `SessionManager` - Tracks execution sessions and emits events
  - `ClaudeRunner` - Spawns Claude Code for task execution
  - `GitOperations` - Commits, pushes, creates PRs
  - Dual execution modes: "worktree" (parallel via git worktrees) or "direct" (in-place)
- **db/** - SQLite via Drizzle ORM
  - Schema: tasks, repos, sessions, config, syncQueue
- **web/** - React 19 SPA with React Router, TanStack Query, Tailwind v4
  - Pages: Dashboard, Tasks, TaskDetail, Repos, Settings
  - Components use shadcn/ui patterns with @base-ui/react

### Shared Package

Cross-boundary contracts imported by all packages:

- **taskStates.ts** - Task state machine (PENDING, CLAIMED, RUNNING, PAUSED, COMPLETED, FAILED, NEEDS_HUMAN, CANCELED)
- **errorCodes.ts** - FailureCode and NeedsHumanCode enums with helpers
- **eventTypes.ts** - Event types for session logging
- **schemas.ts** - Zod schemas for all entities
- **types.ts** - TypeScript types inferred from schemas

### Data Flow

1. Tasks enter queue via CLI (`nightshift add "prompt"`) or API
2. `TaskExecutor` polls for pending tasks, claims and transitions to RUNNING
3. Execution setup: preflight checks, git worktree creation (if enabled), lock acquisition
4. `ClaudeRunner` spawns Claude Code in work directory
5. On completion: commit changes, push, create PR, teardown worktree
6. Task marked COMPLETED/FAILED/NEEDS_HUMAN based on result

### Key Patterns

- All database field names use camelCase
- Dates stored as ISO strings in SQLite
- Session events stored as NDJSON files in ~/.nightshift/sessions/
- Config is key-value store in SQLite config table
- Repo locks prevent concurrent direct-mode execution on same repo

### Coding Practice

- Use tailwind v4 syntax + shadcn