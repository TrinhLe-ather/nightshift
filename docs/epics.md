---
stepsCompleted:
  [
    "step-01-validate-prerequisites",
    "step-02-design-epics",
    "step-03-create-stories",
    "step-04-final-validation",
  ]
status: complete
completedAt: "2025-12-23"
version: "2.0"
architectureVersion: "2.0 (Daemon-First)"
inputDocuments:
  - /Volumes/Data/Projects/claude-swarm/docs/prd.md
  - /Volumes/Data/Projects/claude-swarm/docs/architecture.md
  - /Volumes/Data/Projects/claude-swarm/docs/ux-design-specification.md
---

# Night Shift - Epic Breakdown (v2.0 Daemon-First)

## Overview

This document provides the complete epic and story breakdown for Night Shift v2.0, restructured around the **daemon-first architecture**. The key shift from v1.0: standalone value comes first (Phase 0), with server connectivity as an optional enhancement (Phase 1).

**Architecture Philosophy:** Download, run, use. No server required for immediate value.

## Requirements Inventory

### Functional Requirements

| ID    | Requirement                                    | Priority | Source |
| ----- | ---------------------------------------------- | -------- | ------ |
| FR-S1 | Download single executable, run without server | P0       | US-40  |
| FR-S2 | Create tasks via local web UI without CLI      | P0       | US-41  |
| FR-S3 | Quick CLI task add (`nightshift add`)          | P0       | US-42  |
| FR-S4 | Auto-update on daemon startup                  | P0       | US-43  |
| FR-S5 | See local vs remote queues when connected      | P1       | US-44  |
| FR-S6 | Updates never interrupt running tasks          | P0       | US-45  |
| FR-S7 | Manual update check from UI                    | P2       | US-46  |
| FR1   | Create task with text prompt                   | P0       | US-1   |
| FR2   | Attach GitHub issue link                       | P0       | US-2   |
| FR3   | Set task priority                              | P1       | US-3   |
| FR4   | Cancel running task                            | P1       | US-4   |
| FR5   | Attach files to task                           | P2       | US-5   |
| FR6   | Specify branch override                        | P2       | US-6   |
| FR7   | View task status real-time                     | P0       | US-10  |
| FR8   | Notification on completion                     | P0       | US-11  |
| FR9   | View full session log                          | P0       | US-12  |
| FR10  | Notification when clarification needed         | P0       | US-13  |
| FR11  | Provide clarification to stuck task            | P0       | US-14  |
| FR12  | View PR from UI                                | P1       | US-15  |
| FR13  | Register PC with Control Center via CLI        | P1       | US-20  |
| FR14  | Configure repos and paths via web UI           | P0       | US-21  |
| FR15  | Set schedule for remote tasks                  | P1       | US-22  |
| FR16  | Enable/disable PC for remote tasks             | P1       | US-23  |
| FR17  | View PC status via local web UI                | P0       | US-24  |
| FR18  | Add tasks from local web UI                    | P0       | US-25  |
| FR19  | Configure timeout                              | P2       | US-26  |
| FR20  | View all PCs from Control Center               | P1       | US-30  |
| FR21  | View/filter tasks by status/repo/priority      | P1       | US-31  |
| FR22  | Manually assign task to specific PC            | P2       | US-32  |
| FR23  | Retry failed task                              | P1       | US-33  |
| FR24  | View task history and stats                    | P2       | US-34  |

### Non-Functional Requirements

| ID    | Category    | Requirement                    | Target                         |
| ----- | ----------- | ------------------------------ | ------------------------------ |
| NFR1  | Performance | Daemon startup time            | <3 seconds                     |
| NFR2  | Performance | Local UI response time         | <200ms                         |
| NFR3  | Performance | Task claim latency (connected) | <5 seconds                     |
| NFR4  | Performance | Heartbeat interval             | 30 seconds                     |
| NFR5  | Performance | Concurrent tasks per PC        | 1 default, up to 10            |
| NFR6  | Reliability | Crash recovery                 | Within 60 seconds              |
| NFR7  | Reliability | Task timeout                   | Default 4 hours, configurable  |
| NFR8  | Reliability | Offline detection              | After 3 missed heartbeats      |
| NFR9  | Reliability | Data durability                | SQLite with WAL mode           |
| NFR10 | Reliability | Session log persistence        | Local + optional S3/R2         |
| NFR11 | Security    | Local UI access                | localhost only                 |
| NFR12 | Security    | API credentials                | Stored locally, never uploaded |
| NFR13 | Security    | Authentication (connected)     | OAuth with token refresh       |
| NFR14 | Scalability | Number of PCs (connected)      | 50+                            |
| NFR15 | Scalability | Concurrent tasks system-wide   | 100+                           |
| NFR16 | Scalability | Task history retention         | 90 days                        |
| NFR17 | Scalability | Session log size               | Up to 10MB                     |

### Additional Requirements

**From Architecture Document:**

- **Monorepo structure:** packages/daemon (PRIMARY), packages/shared, packages/admin, packages/backend
- **Tech stack:** Bun (daemon), Hono (local server), SQLite (local data), Convex (connected mode)
- **Operating modes:** Standalone (default), Connected, Hybrid
- **Shared contracts** in packages/shared: task states, error codes, event types, Zod validators
- **Naming conventions:** camelCase everywhere, UPPER_CASE error codes
- **Session logging:** Structured NDJSON with canonical envelope
- **`nightshift doctor`:** Validates prerequisites (claude, gh, git, auth, repo paths)
- **Repo safety gate:** Require clean working tree before starting any task
- **Concurrency:** One task per repo at a time per PC (repo-level locking)
- **Rate limit circuit breaker:** FAILED_RATE_LIMIT disables PC for 1 hour with hourly probe
- **Local filesystem:** ~/.nightshift/ for config, auth, SQLite DB, sessions

**From UX Design Document:**

- **Design system:** shadcn/ui + Tailwind CSS
- **Typography:** JetBrains Mono (monospace throughout)
- **Dark-mode-first:** Background #0A0A0A, Surface #121212
- **Orange accent:** #F97316 for actions, links, focus
- **Command palette:** Cmd+K for task creation from any page
- **Task creation:** Must complete in <10 seconds
- **Morning review:** Dashboard scannable in <60 seconds
- **GitHub URL auto-detection:** Extract context during task creation
- **Keyboard navigation:** j/k for lists, Enter to select, Esc to close
- **Toast notifications:** Success auto-dismiss 3s, errors sticky
- **Split view:** Task list + detail panel
- **Session log viewer:** Terminal aesthetic, timestamps muted, tool calls in orange
- **Clarification banner:** Inline reply, no modal
- **Accessibility:** WCAG 2.1 Level AA, visible focus rings, semantic HTML

### FR Coverage Map

| FR    | Epic       | Description                   |
| ----- | ---------- | ----------------------------- |
| FR-S1 | Epic 1     | Single executable, no server  |
| FR-S2 | Epic 2, 3  | Local web UI task creation    |
| FR-S3 | Epic 1     | CLI task add                  |
| FR-S4 | Epic 6     | Auto-update on startup        |
| FR-S5 | Epic 8     | Local vs remote queue tabs    |
| FR-S6 | Epic 6     | Updates don't interrupt tasks |
| FR-S7 | Epic 6     | Manual update check           |
| FR1   | Epic 3     | Create task with prompt       |
| FR2   | Epic 3     | GitHub issue link             |
| FR3   | Epic 3     | Task priority                 |
| FR4   | Epic 11    | Cancel task                   |
| FR5   | Epic 12    | File attachments              |
| FR6   | Epic 3     | Branch override               |
| FR7   | Epic 3, 4  | Real-time status              |
| FR8   | Epic 4, 10 | Completion notification       |
| FR9   | Epic 4     | Session log viewer            |
| FR10  | Epic 10    | Clarification notification    |
| FR11  | Epic 10    | Provide clarification         |
| FR12  | Epic 4     | View PR from UI               |
| FR13  | Epic 7     | Register PC via CLI           |
| FR14  | Epic 5     | Configure repos via UI        |
| FR15  | Epic 8     | Schedule for remote tasks     |
| FR16  | Epic 8     | Enable/disable for remote     |
| FR17  | Epic 2     | View PC status locally        |
| FR18  | Epic 3     | Add tasks from local UI       |
| FR19  | Epic 4     | Configure timeout             |
| FR20  | Epic 9     | View all PCs (Control Center) |
| FR21  | Epic 9     | Filter tasks                  |
| FR22  | Epic 11    | Manual PC assignment          |
| FR23  | Epic 11    | Retry failed task             |
| FR24  | Epic 12    | Task history and stats        |

## Epic List

### Phase 0: Standalone Value

| Epic | Title                       | Goal                                             |
| ---- | --------------------------- | ------------------------------------------------ |
| 1    | Daemon Foundation           | Single executable with CLI basics and local data |
| 2    | Local Web UI Shell          | Dark-mode UI with dashboard and navigation       |
| 3    | Local Task Queue & Creation | Command palette, task list, GitHub detection     |
| 4    | Task Execution & Results    | Claude integration, session logs, PR creation    |
| 5    | Repo Configuration          | Add/edit repos via UI and CLI                    |
| 6    | Auto-Update System          | Version check, download, safe replacement        |

### Phase 1: Connected Mode

| Epic | Title                         | Goal                                          |
| ---- | ----------------------------- | --------------------------------------------- |
| 7    | Authentication & Registration | OAuth flow, PC registration with server       |
| 8    | Remote Queue & Sync           | Convex integration, heartbeat, session upload |
| 9    | Control Center UI             | Team task management web app                  |
| 10   | Notifications & Clarification | Slack integration, clarification flow         |

### Phase 2: Production Hardening

| Epic | Title                         | Goal                             |
| ---- | ----------------------------- | -------------------------------- |
| 11   | Task Lifecycle Management     | Cancel, retry, manual assignment |
| 12   | Analytics & Advanced Features | History, stats, file attachments |

---

## Epics 1 2 3: See @docs/phase-0-epics-1-2-3.md

## Epics 4 5 6: See @docs/phase-0-epics-4-5-6.md

## Epics 7 8 9 10: See @docs/phase-1-epics-7-8-9-10.md

## Epics 11 12: See @docs/phase-2-epics-11-12.md
