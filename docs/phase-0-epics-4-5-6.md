## Epic 4: Task Execution & Results

**Goal:** Tasks execute locally with Claude, session logs are captured, PRs are created.

**User Outcome:** Queue a task, see it run, review session log, click through to PR.

**FRs covered:** FR7, FR8, FR9, FR12, FR19
**NFRs addressed:** NFR5 (1 task at a time), NFR6 (crash recovery), NFR7 (timeout)

---

### Story 4.1: Implement Task Executor

As a **daemon**,
I want **to execute tasks from the local queue**,
So that **work happens automatically**.

**Acceptance Criteria:**

**Given** daemon is running and task is PENDING
**When** executor polls queue
**Then** claims oldest PENDING task matching configured repos
**And** task status transitions to CLAIMED
**And** begins preflight checks

**Given** task is claimed
**When** preflight passes
**Then** task status transitions to RUNNING
**And** execution begins

**Given** executor is processing a task
**When** another task is PENDING
**Then** it waits (one task at a time per repo)

---

### Story 4.2: Implement Preflight Checks (Repo Safety Gate)

As a **daemon**,
I want **to verify repo is clean before execution**,
So that **I don't interfere with uncommitted work**.

**Acceptance Criteria:**

**Given** task is claimed for a repo
**When** preflight runs
**Then** checks `git status` for uncommitted changes
**And** checks for untracked files

**Given** repo has uncommitted changes
**When** safety check fails
**Then** emits `PREFLIGHT_FAILED` event with `NEEDS_HUMAN_GIT_DIRTY`
**And** task transitions to NEEDS_HUMAN
**And** question: "Repo has uncommitted changes. Please stash or commit."

**Given** repo is clean
**When** safety check passes
**Then** acquires repo-level lock (cross-process safe)
**And** emits `REPO_LOCK_ACQUIRED` event
**And** proceeds to execution

---

### Story 4.3: Implement Claude Code SDK Integration

As a **daemon**,
I want **to execute tasks using Claude Code SDK**,
So that **Claude performs the work**.

**Acceptance Criteria:**

**Given** preflight passed and repo locked
**When** execution begins
**Then** invokes Claude Code SDK with task prompt
**And** emits `AGENT_STARTED` event
**And** captures all SDK events

**Given** Claude completes successfully
**When** execution finishes
**Then** emits `TASK_COMPLETED` event
**And** task status transitions to COMPLETED
**And** releases repo lock

**Given** Claude encounters error
**When** execution fails
**Then** emits `TASK_FAILED` event with error details
**And** task transitions to FAILED with `failureCode`
**And** releases repo lock

**Given** task runs longer than timeout
**When** timeout reached
**Then** terminates execution
**And** task transitions to FAILED with `FAILED_TIMEOUT`

---

### Story 4.4: Implement Self-Triaging Behavior

As an **AI agent**,
I want **to identify when I need human input**,
So that **I don't waste time on tasks I can't complete**.

**Acceptance Criteria:**

**Given** Claude is executing
**When** it determines clarification needed
**Then** signals `needs_human` via SDK with specific question

**Given** daemon receives needs_human signal
**When** processing
**Then** emits `AGENT_NEEDS_HUMAN` event with question
**And** task transitions to NEEDS_HUMAN
**And** `needsHumanQuestion` stores the question
**And** releases repo lock

---

### Story 4.5: Implement Git Operations and PR Creation

As a **daemon**,
I want **to commit changes and create PRs**,
So that **completed work goes through review**.

**Acceptance Criteria:**

**Given** Claude made code changes
**When** execution completes successfully
**Then** detects modified files via `git status`
**And** creates branch: `nightshift/{taskId}`

**Given** changes exist on branch
**When** creating commit
**Then** commits all modified files
**And** commit message from Claude or generated from prompt
**And** emits `ARTIFACT_COMMIT_CREATED` event

**Given** commit is created
**When** `gh` CLI is configured
**Then** pushes branch to remote
**And** creates PR via `gh pr create`
**And** PR title includes task prompt (truncated)
**And** emits `ARTIFACT_PR_CREATED` event
**And** stores `prUrl` on task record

**Given** `gh` CLI not configured
**When** PR creation skipped
**Then** task still completes successfully
**And** `prUrl` is null
**And** logs info about missing PR

---

### Story 4.6: Implement Session Logging

As a **system**,
I want **to capture full session logs**,
So that **engineers can review what Claude did**.

**Acceptance Criteria:**

**Given** task execution begins
**When** events are emitted
**Then** each event written as NDJSON with envelope:

- `schemaVersion`, `ts`, `seq`, `level`, `type`, `taskId`, `runId`, `data`

**Given** task completes
**When** session finalized
**Then** NDJSON file saved to `~/.nightshift/sessions/{taskId}.ndjson`
**And** session summary stored in SQLite

**Given** session exceeds 10MB
**When** limit approached
**Then** older events summarized to stay under limit

---

### Story 4.7: Create Session Log Viewer Component

As an **engineer**,
I want **to view session logs in terminal-like format**,
So that **I understand what Claude did**.

**Acceptance Criteria:**

**Given** task is COMPLETED or FAILED
**When** viewing task detail
**Then** SessionLogViewer displays
**And** shows events chronologically
**And** timestamps as relative time (e.g., "00:03")

**Given** session log displayed
**When** viewing events
**Then** tool calls highlighted in orange (#F97316)
**And** success events in green
**And** error events in red
**And** uses JetBrains Mono font

**Given** session log is long
**When** scrolling
**Then** virtual scrolling maintains performance
**And** "Jump to end" button available

---

### Story 4.8: Display PR Link in Task Detail

As an **engineer**,
I want **to access the PR directly from task**,
So that **I can review and merge changes**.

**Acceptance Criteria:**

**Given** task COMPLETED with prUrl
**When** viewing detail
**Then** "View Pull Request" button displays prominently
**And** clicking opens PR in new tab

**Given** task COMPLETED without prUrl
**When** viewing detail
**Then** shows "No PR created"
**And** tooltip explains: "gh CLI not configured or no changes made"

---

### Story 4.9: Implement Local Notifications

As an **engineer**,
I want **browser notifications for task events**,
So that **I know when tasks complete without watching the UI**.

**Acceptance Criteria:**

**Given** task completes
**When** status changes to COMPLETED
**Then** browser notification: "Task completed: {prompt truncated}"
**And** clicking notification opens task detail

**Given** task fails
**When** status changes to FAILED
**Then** browser notification: "Task failed: {prompt truncated}"

**Given** task needs input
**When** status changes to NEEDS_HUMAN
**Then** browser notification: "Task needs input: {prompt truncated}"

---

## Epic 5: Repo Configuration

**Goal:** Engineers can configure which repos Night Shift can use.

**User Outcome:** Add repos via UI or CLI, see them in list, use them for tasks.

**FRs covered:** FR14
**NFRs addressed:** NFR9 (persistence)

---

### Story 5.1: Implement Repo Data Model and API

As a **developer**,
I want **repo CRUD operations**,
So that **repos can be added, edited, removed**.

**Acceptance Criteria:**

**Given** local API
**When** `POST /api/repos` with `{ path }`
**Then** validates path is git repository
**And** extracts repo name from git remote origin
**And** extracts default branch
**And** saves to SQLite
**And** returns repo object

**Given** local API
**When** `GET /api/repos`
**Then** returns array of configured repos

**Given** local API
**When** `DELETE /api/repos/:id`
**Then** removes repo from SQLite
**And** does NOT delete actual repo on disk

---

### Story 5.2: Create Repo Management UI

As an **engineer**,
I want **to manage repos via web UI**,
So that **I don't need CLI for configuration**.

**Acceptance Criteria:**

**Given** user navigates to `/repos`
**When** page loads
**Then** displays list of configured repos
**And** shows: name, path, default branch

**Given** user clicks "Add Repo"
**When** dialog opens
**Then** shows path input field
**And** browse button (if supported by browser)

**Given** user enters valid repo path
**When** they submit
**Then** repo is validated (git remote exists)
**And** added to list
**And** toast: "Repo added: {name}"

**Given** user clicks delete on a repo
**When** confirmation shown
**Then** repo is removed from config
**And** does NOT affect task history for that repo

---

### Story 5.3: Implement CLI Repo Commands

As an **engineer**,
I want **CLI commands for repo management**,
So that **I can configure from terminal**.

**Acceptance Criteria:**

**Given** user runs `nightshift repos add /path/to/repo`
**When** path is valid git repo
**Then** adds to config
**And** displays "Added repo: {name} at {path}"

**Given** user runs `nightshift repos list`
**When** repos configured
**Then** displays table: name, path, default branch

**Given** user runs `nightshift repos remove {name}`
**When** repo exists
**Then** removes from config
**And** displays "Removed repo: {name}"

---

## Epic 6: Auto-Update System

**Goal:** Daemon stays current without manual intervention.

**User Outcome:** Updates happen automatically on startup when idle.

**FRs covered:** FR-S4, FR-S6, FR-S7
**NFRs addressed:** NFR6 (reliability)

---

### Story 6.1: Implement Version Check on Startup

As a **daemon**,
I want **to check for updates when starting**,
So that **users always have latest features and fixes**.

**Acceptance Criteria:**

**Given** daemon starts
**When** startup sequence runs
**Then** fetches latest version from releases endpoint
**And** compares with current version

**Given** newer version available
**When** no task is running
**Then** displays "Update available: v{new} (current: v{old})"
**And** begins download

**Given** newer version available
**When** task IS running
**Then** displays "Update available but task in progress"
**And** defers update to next startup

---

### Story 6.2: Implement Binary Download and Verification

As a **daemon**,
I want **to safely download and verify updates**,
So that **corrupt downloads don't break the installation**.

**Acceptance Criteria:**

**Given** update download begins
**When** fetching binary
**Then** downloads platform-specific binary (darwin-arm64, darwin-x64, linux-x64, win-x64)
**And** shows download progress

**Given** download completes
**When** verifying
**Then** computes SHA256 checksum
**And** compares with published checksum
**And** fails if mismatch: "Checksum verification failed"

---

### Story 6.3: Implement Safe Binary Replacement

As a **daemon**,
I want **to replace itself without corruption**,
So that **updates don't break the installation**.

**Acceptance Criteria:**

**Given** checksum verified
**When** replacement begins
**Then** writes new binary to temp location
**And** renames current binary to `.backup`
**And** moves new binary to main location
**And** restarts daemon

**Given** replacement fails
**When** error occurs
**Then** restores from `.backup`
**And** logs error
**And** continues with current version

---

### Story 6.4: Implement Update UI in Settings

As an **engineer**,
I want **to see update status and trigger manual check**,
So that **I can control when updates happen**.

**Acceptance Criteria:**

**Given** user visits Settings > Updates
**When** page loads
**Then** displays current version
**And** displays last check time
**And** displays "Up to date" or "Update available: v{new}"

**Given** user clicks "Check for Updates"
**When** check runs
**Then** fetches latest version
**And** updates display
**And** toast: "You're up to date" or "Update available"

**Given** update available
**When** user clicks "Update Now"
**Then** begins update process (if no task running)
**Or** displays "Cannot update while task is running"

---
