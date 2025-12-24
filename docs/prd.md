---
stepsCompleted: [1]
inputDocuments:
  - PRD.md
documentCounts:
  briefs: 0
  research: 0
  brainstorming: 0
  projectDocs: 1
workflowType: 'prd'
lastStep: 1
project_name: 'Night Shift'
user_name: 'Hoalong'
date: '2025-12-23'
version: '2.0'
status: 'draft'
---

# Night Shift - Product Requirements Document

**Author:** Hoalong
**Date:** 2025-12-23
**Version:** 2.0 (Daemon-First Architecture)

---

## Executive Summary

**Night Shift** is a daemon-first task execution system that enables game development teams to leverage idle engineer workstations for automated code tasks powered by Claude AI agents.

### The Problem

Our game development team works with massive Unreal Engine repositories (200GB+). We want to use Claude Code for automation tasks like bug fixing, PR reviews, and plugin development. However:

1. **Repository size makes cloud-based solutions impractical** - Cloning 200GB repos for each task is not feasible
2. **Existing local setups are underutilized** - Engineers have fully configured development environments sitting idle at night
3. **Manual task execution doesn't scale** - Engineers shouldn't need to babysit AI agents during work hours
4. **High barrier to entry** - Requiring server infrastructure prevents individual adoption

### The Solution

Night Shift is a **daemon-first** task execution system that starts simple and scales up:

**Standalone Mode (Default):**
- Single executable daemon runs on any engineer's PC
- Local web UI for task management - no CLI expertise needed
- Works completely offline - no server registration required
- Auto-updates on startup to stay current

**Connected Mode (Optional):**
- Register daemon with central Control Center
- Receive tasks from team queue during off-hours
- Intelligent routing based on repo availability
- Self-triaging agents that identify when human input is needed

This "start local, scale to team" approach means:
- **Zero friction onboarding** - download, run, use
- **Immediate value** - useful from day one without infrastructure
- **Seamless upgrade** - connect to server when ready, no migration

---

## Goals & Success Metrics

### Primary Goals

1. **Enable single-engineer productivity** - Useful without any server setup
2. **Maximize overnight productivity** - Complete code tasks while engineers sleep
3. **Minimize engineer overhead** - Tasks should be fire-and-forget
4. **Maintain code quality** - All changes go through normal PR review process

### Success Metrics

| Metric | Target |
|--------|--------|
| Time to first task (new user) | <5 minutes |
| Tasks completed per night | 10+ across all PCs |
| Task success rate | >70% (completed or needs_human) |
| Average task duration | <2 hours |
| Engineer time saved per week | 10+ hours per engineer |
| PC utilization (during scheduled hours) | >80% |

---

## Architecture Overview

Night Shift uses a **daemon-first architecture** with optional server connectivity.

### Operating Modes

| Mode | Description | Server Required |
|------|-------------|-----------------|
| **Standalone** | Daemon runs independently, local task queue only | No |
| **Connected** | Daemon registers with Control Center, receives remote tasks | Yes |
| **Hybrid** | Both local and remote task queues active | Yes |

### Standalone Mode (Default)

```
+---------------------------------------------+
|              Engineer's PC                  |
|  +-------------------------------------+    |
|  |         Night Shift Daemon          |   |
|  |  +---------+  +------------------+  |   |
|  |  |Local Web|  |  Claude Code SDK |  |   |
|  |  |   UI    |  |                  |  |   |
|  |  +----+----+  +--------+---------+  |   |
|  |       |                |            |   |
|  |  +----v----------------v-----+      |   |
|  |  |    Local Task Queue       |      |   |
|  |  |       (SQLite)            |      |   |
|  |  +---------------------------+      |   |
|  +-------------------------------------+   |
+---------------------------------------------+
```

### Connected Mode

```
+------------------+         +-------------------------------+
|  Control Center  |         |       Engineer's PC           |
|  +------------+  |         |  +-------------------------+  |
|  | Remote     |<-+---------+->|   Night Shift Daemon    |  |
|  | Task Queue |  |         |  |  +-------+  +---------+ |  |
|  +------------+  |         |  |  |Local  |  | Remote  | |  |
|  +------------+  |         |  |  |Queue  |  | Queue   | |  |
|  | Web UI     |  |         |  |  |(SQLite|  | (Convex)| |  |
|  +------------+  |         |  |  +-------+  +---------+ |  |
+------------------+         |  +-------------------------+  |
                             +-------------------------------+
```

### Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Daemon | **Bun** (compiled executable) | Single binary distribution, fast startup, TypeScript native |
| Local Storage | **SQLite** | Embedded, zero-config, crash recovery |
| Local Web UI | **Bun + Hono** | Lightweight, serves from daemon process |
| Control Center | **Convex** | Real-time sync, serverless, built-in auth |
| Control Center UI | **React** | Team familiarity, Convex integration |

### Daemon Distribution

Cross-platform compiled executables via Bun:

| Platform | Binary |
|----------|--------|
| macOS (Apple Silicon) | `nightshift-darwin-arm64` |
| macOS (Intel) | `nightshift-darwin-x64` |
| Linux | `nightshift-linux-x64` |
| Windows | `nightshift-win-x64.exe` |

---

## User Personas

### 1. Game Engineer (Primary User)

**Profile:** C++ developer working on Unreal Engine game code

**Needs:**
- Submit tasks before leaving work and find them done in the morning
- Use a simple web interface without CLI expertise
- Review AI-generated PRs as part of normal workflow
- See what their PC is working on remotely
- Add quick tasks from home if they think of something

**Pain Points:**
- Large repo makes context-switching expensive
- Repetitive bug fixes take time away from creative work
- Waiting for builds/tests during work hours
- Complex tooling requires too much setup

### 2. Tech Lead / Manager

**Profile:** Senior engineer responsible for team productivity

**Needs:**
- Overview of all task activity across the team
- Ability to prioritize urgent tasks
- Visibility into what the AI is producing
- Metrics on productivity gains

**Pain Points:**
- Hard to parallelize work across team
- Reviewing many small PRs is time-consuming
- Want to experiment with AI automation safely

### 3. Non-Technical User (New)

**Profile:** Designer, QA, or other team member with limited CLI experience

**Needs:**
- Simple web interface to submit tasks
- Clear feedback on task progress
- No command line required

**Pain Points:**
- CLI tools are intimidating
- Don't want to "break something"

---

## User Stories

### Standalone Mode

| ID | Story | Priority |
|----|-------|----------|
| US-40 | As an engineer, I can download a single executable and run Night Shift without any server setup | P0 |
| US-41 | As an engineer, I can create tasks via the local web UI without using the command line | P0 |
| US-42 | As an engineer, I can use `nightshift add "task"` to quickly queue a task from terminal | P0 |
| US-43 | As an engineer, the daemon auto-updates on startup so I always have the latest version | P0 |
| US-44 | As an engineer, I can see my local task queue separately from remote tasks when connected to a server | P1 |
| US-45 | As an engineer, updates never interrupt my running tasks | P0 |
| US-46 | As an engineer, I can manually trigger an update check from the UI | P2 |

### Task Creation & Management

| ID | Story | Priority |
|----|-------|----------|
| US-1 | As an engineer, I can create a task with a text prompt so that Claude works on it overnight | P0 |
| US-2 | As an engineer, I can attach a GitHub issue link to a task so Claude has context | P0 |
| US-3 | As an engineer, I can set task priority (low/medium/high/urgent) so important work happens first | P1 |
| US-4 | As an engineer, I can cancel a running task so I can stop work that's no longer needed | P1 |
| US-5 | As an engineer, I can attach files to a task so Claude can reference specs or designs | P2 |
| US-6 | As an engineer, I can specify which branch to base work on (override default) | P2 |

### Task Execution & Results

| ID | Story | Priority |
|----|-------|----------|
| US-10 | As an engineer, I can see my task's status in real-time so I know what's happening | P0 |
| US-11 | As an engineer, I receive a notification when my task completes so I can review the PR | P0 |
| US-12 | As an engineer, I can view the full Claude session log so I understand what it did | P0 |
| US-13 | As an engineer, I receive a notification when Claude needs clarification so tasks don't get stuck | P0 |
| US-14 | As an engineer, I can provide clarification to a stuck task so it can continue | P0 |
| US-15 | As an engineer, I can view the PR created by a task directly from the UI | P1 |

### PC Management

| ID | Story | Priority |
|----|-------|----------|
| US-20 | As an engineer, I can register my PC with the Control Center via CLI so it can receive remote tasks | P1 |
| US-21 | As an engineer, I can configure which repos my PC has and their local paths via the web UI | P0 |
| US-22 | As an engineer, I can set a schedule for when my PC accepts remote tasks (e.g., 8pm-8am) | P1 |
| US-23 | As an engineer, I can manually enable/disable my PC for remote task execution | P1 |
| US-24 | As an engineer, I can view my PC's current status and active tasks via local web UI | P0 |
| US-25 | As an engineer, I can add tasks directly from the local web UI on my PC | P0 |
| US-26 | As an engineer, I can configure timeout duration for tasks on my PC | P2 |

### Administration (Connected Mode)

| ID | Story | Priority |
|----|-------|----------|
| US-30 | As a tech lead, I can view all PCs and their status from the control center | P1 |
| US-31 | As a tech lead, I can view all tasks and filter by status/repo/priority | P1 |
| US-32 | As a tech lead, I can manually assign a task to a specific PC | P2 |
| US-33 | As a tech lead, I can retry a failed task | P1 |
| US-34 | As a tech lead, I can view task history and statistics | P2 |

---

## Features

### Core Features (Phase 0 - Standalone)

#### 1. Night Shift Daemon

A background service running on engineer workstations, designed to work standalone or connected.

**Core Capabilities (Standalone):**
- Local web UI as primary interface (accessible at `localhost:3847`)
- Local task queue with SQLite persistence
- Execute Claude Code via SDK with full tool access
- Automatic git operations (branch, commit, PR via `gh`)
- Session log storage (local, with optional cloud sync)
- Crash recovery from local SQLite state

**Auto-Update System:**
- Version check on daemon startup
- Download platform-specific binary from releases endpoint
- Verify checksum before replacing
- Update only when idle (no active tasks)
- Automatic restart after successful update
- Fallback: continue with current version if update fails

**Connected Mode Capabilities (when registered with server):**
- OAuth-based authentication (`nightshift auth login`)
- Subscribe to remote task queue
- Claim and execute remote tasks
- Upload session logs to cloud storage
- Heartbeat for online status
- Schedule-based availability (e.g., 8pm-8am)

**CLI Commands:**

| Command | Description |
|---------|-------------|
| `nightshift start` | Start daemon (opens web UI in browser) |
| `nightshift stop` | Stop daemon gracefully |
| `nightshift status` | Show daemon status and active tasks |
| `nightshift add "task description"` | Quick-add task to local queue |
| `nightshift add "task" --repo path/to/repo` | Add task for specific repo |
| `nightshift auth login` | Authenticate with Control Center (connected mode) |
| `nightshift auth logout` | Disconnect from Control Center |
| `nightshift config` | Open local web UI to settings page |
| `nightshift update` | Manually trigger update check |
| `nightshift version` | Show current version |

#### 2. Local Web UI

The **primary interface** for Night Shift, served by the daemon at `localhost:3847`.

**Design Principle:** Accessible to non-technical users. No CLI knowledge required.

**Dashboard:**
- Daemon status indicator (running/stopped/updating)
- Quick task input field ("What do you want Claude to work on?")
- Active task with live status
- Recent tasks list

**Task Queue View:**
- **Local Queue tab** - Tasks created locally, executed locally
- **Remote Queue tab** - Tasks from Control Center (connected mode only)
- Clear visual distinction between local vs remote tasks
- Filter by status: pending, in_progress, completed, failed, needs_human
- Task actions: view details, cancel, retry

**Task Creation:**
- Text prompt input (required)
- Repository selector (from configured repos)
- Priority selector (low/medium/high/urgent) - affects local queue order
- Optional: GitHub issue link for context
- Optional: Base branch override

**Task Detail View:**
- Full prompt text
- Status timeline
- Session log viewer (collapsible Claude conversation)
- PR link (if created)
- Error details (if failed)
- "Needs Human" question and response input

**Settings:**
- **Repos tab:** Add/edit/remove configured repositories (path, default branch)
- **Schedule tab:** Set availability hours (for connected mode)
- **Server tab:** Connect/disconnect from Control Center, view connection status
- **Updates tab:** Current version, last check, manual update button
- **About tab:** Version info, links to docs/support

**Notifications:**
- Browser notifications for: task completed, task failed, needs human input
- Optional: Desktop notifications via system tray

### Core Features (Phase 1 - Connected Mode)

#### 3. Control Center Web Application

A web-based dashboard for managing the entire Night Shift system across a team.

**Capabilities:**
- Create new tasks with prompt, priority, and optional GitHub issue link
- View all tasks with filtering by status, repo, and priority
- Real-time task status updates
- View registered PCs and their status
- Session log viewer for completed tasks
- PR links for completed tasks

#### 4. Task Routing Engine

Intelligent assignment of tasks to available PCs.

**Capabilities:**
- Match tasks to PCs that have the required repo configured
- Priority-based ordering (urgent > high > medium > low)
- Tag-based matching for specialized PCs
- Manual assignment override

#### 5. Self-Triaging Agent Workflow

Claude agents that identify when they need human help.

**Capabilities:**
- Analyze task on receipt
- If clarification needed: mark task as `needs_human`, add question, move on
- If can proceed: execute task normally
- Slack notification for `needs_human` tasks

### Future Features

| Feature | Description | Phase |
|---------|-------------|-------|
| File attachments | Attach specs, designs, or reference files to tasks | Phase 2 |
| Git worktree support | Parallel task execution on same repo (for smaller repos) | Phase 2 |
| Live output streaming | Watch Claude work in real-time | Phase 3 |
| Custom system prompts | Per-repo or per-task-type system prompts | Phase 3 |
| Task templates | Pre-defined task structures for common operations | Phase 4 |
| CI integration | Trigger tasks from GitHub Actions | Phase 4 |
| Cost tracking | Track Claude API usage per task/repo | Phase 4 |

---

## Task Lifecycle

```
User creates task (via UI or CLI)
       |
       v
   +--------+
   |PENDING | <-----------------------------+
   +----+---+                               |
        | Daemon claims task                |
        v                                   |
   +--------+                               |
   |ASSIGNED|                               |
   +----+---+                               |
        | Daemon starts execution           |
        v                                   |
+---------------+     +-------------+       |
|  IN_PROGRESS  |---->| NEEDS_HUMAN |-------+
+-------+-------+     +-------------+  (human clarifies)
        |
        +---------------+
        v               v
   +---------+     +--------+
   |COMPLETED|     | FAILED |
   +---------+     +--------+
        |               |
        v               v
   PR Created       Can Retry
   Session Saved    or Reassign
```

---

## Notifications

### Local Notifications (Standalone Mode)

| Event | Type | Message |
|-------|------|---------|
| Task Completed | Browser/Desktop | "Task completed: {title}" + PR link |
| Task Failed | Browser/Desktop | "Task failed: {title}" + error summary |
| Needs Clarification | Browser/Desktop | "Task needs input: {title}" + question |
| Update Available | Browser/Desktop | "Night Shift update available" |

### Slack Integration (Connected Mode)

| Event | Channel | Message |
|-------|---------|---------|
| Task Completed (with PR) | Team channel | `Task completed: "{title}" on {repo}` + PR link |
| Task Completed (no PR) | Team channel | `Task completed: "{title}" on {repo}` (no gh configured) |
| Task Needs Clarification | Team channel | `Task needs clarification: "{title}"` + question + link |
| Task Failed | Team channel | `Task failed: "{title}"` + error + link |

---

## Non-Functional Requirements

### Performance

| Requirement | Target |
|-------------|--------|
| Daemon startup time | <3 seconds |
| Local UI response time | <200ms for all operations |
| Task claim latency (connected) | <5 seconds from pending to assigned |
| Heartbeat interval | Every 30 seconds |
| Concurrent tasks per PC | 1 (default), up to 10 (configurable) |

### Reliability

| Requirement | Target |
|-------------|--------|
| Daemon crash recovery | Resume or cleanup within 60 seconds of restart |
| Task timeout | Configurable, default 4 hours |
| Offline detection | PC marked offline after 3 missed heartbeats |
| Data durability | Local SQLite with WAL mode |
| Session log persistence | Local + optional S3/R2 upload |

### Security

| Requirement | Implementation |
|-------------|----------------|
| Authentication (connected) | OAuth flow with token refresh |
| API credentials | Stored locally on PC only, never uploaded |
| Git credentials | Use local PC's configured git/gh |
| Session data | Stored in cloud but access-controlled |
| Local UI access | localhost only (no network exposure) |

### Scalability

| Requirement | Target |
|-------------|--------|
| Number of PCs (connected) | 50+ |
| Concurrent tasks (system-wide) | 100+ |
| Task history retention | 90 days |
| Session log size | Up to 10MB per session |

---

## Constraints & Assumptions

### Constraints

1. **Large repos cannot be cloned on-demand** - Must use existing local repos
2. **PCs are not always available** - Must handle offline gracefully
3. **Engineers may have uncommitted work** - Must detect and not interfere
4. **Network is over internet** - Must handle latency and disconnections

### Assumptions

1. Engineers are willing to leave PCs running overnight
2. Each PC has sufficient resources to run Claude Code
3. Git and GitHub CLI are already configured on PCs
4. Claude API keys are configured locally on PCs
5. Repos are already cloned and up-to-date on PCs

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Claude produces incorrect code | Medium | Medium | All changes go through PR review |
| Task runs too long, blocks PC | Low | Medium | Configurable timeout with hard limit |
| PC goes offline mid-task | Medium | Medium | Task marked failed, can reassign |
| Claude asks too many clarifying questions | Medium | Low | Tune system prompt to be more autonomous |
| Session logs contain sensitive data | High | Low | Access control, consider encryption |
| PC has uncommitted local changes | Low | Medium | Detect and refuse to start tasks |
| Auto-update corrupts binary | High | Low | Checksum verification, rollback capability |
| Non-technical users confused by errors | Medium | Medium | Clear error messages, help links |

---

## Release Plan

### Phase 0: Standalone Daemon (Foundation)
**Goal:** Single-user value without any infrastructure

- Daemon executable (Bun compiled) for macOS, Linux, Windows
- Local Web UI as primary interface
- Local task queue (SQLite)
- Execute Claude Code tasks with full tool access
- Automatic git operations (branch, commit, PR)
- Basic CLI commands: `start`, `stop`, `status`, `add`
- Local session log storage
- Auto-update on startup
- Repo configuration via UI

**Exit Criteria:** Single engineer can download binary, run it, submit tasks via web UI, and get PRs created overnight.

### Phase 1: Connected Mode (Team Scale)
**Goal:** Multiple engineers sharing a task queue

- Control Center web application (Convex)
- OAuth authentication flow
- Daemon registration with server
- Remote task queue subscription
- Task routing (match tasks to PCs with required repos)
- Session log upload to cloud
- Slack notifications (completed, needs_human, failed)
- Schedule-based availability
- UI shows Local Queue vs Remote Queue tabs

**Exit Criteria:** Team of 5+ can submit tasks centrally and have them distributed to available PCs overnight.

### Phase 2: Production Hardening
**Goal:** Reliable team-wide usage

- Full task lifecycle (cancel, retry, clarify flow)
- Priority and tag-based routing
- File attachments for tasks
- Heartbeat and offline detection
- Daemon crash recovery improvements
- Task timeout configuration
- Dashboard analytics (tasks/night, success rate)

### Phase 3: Advanced Features
**Goal:** Power user capabilities

- Git worktree support for parallel execution on same repo
- Live Claude output streaming (watch it work)
- Custom system prompts per repo
- Task templates for common operations
- Audit logging

### Phase 4: Enterprise
**Goal:** Large team / org deployment

- CI/GitHub Actions integration (trigger tasks from workflows)
- Cost tracking (Claude API usage per task/repo)
- Admin tools (quotas, bulk operations)
- SSO integration
- On-premise Control Center option

---

## Appendix

### Glossary

| Term | Definition |
|------|------------|
| Control Center | The central web application for managing Night Shift (connected mode) |
| Daemon | The background service running on engineer PCs |
| Task | A unit of work submitted to the system (prompt + metadata) |
| Session | The full Claude conversation log from executing a task |
| PC | A registered engineer workstation |
| Claim | When a PC takes ownership of a pending task |
| Heartbeat | Regular status ping from daemon to control center |
| Worktree | Git feature allowing multiple branches checked out simultaneously |
| Standalone Mode | Daemon operating independently without server connection |
| Connected Mode | Daemon registered with Control Center for team task distribution |

### Related Documents

- [SPEC.md](./SPEC.md) - Technical Specification
- [Original PRD](../PRD.md) - Version 1.0 (Server-First Architecture)

### Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-23 | Initial PRD (server-first architecture) |
| 2.0 | 2025-12-23 | Daemon-first architecture, standalone mode, auto-update, local web UI as primary interface |
