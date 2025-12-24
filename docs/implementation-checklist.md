# Implementation Checklist: Worktree & Pause/Resume

Quick reference checklist. Full details in `implementation-plan-worktree.md`.

---

## Critical: Dual Execution Modes

**Large repos (200GB+ Unreal) can't use worktrees** - too slow, too much disk.

| Mode | Use Case | Parallel | Disk |
|------|----------|----------|------|
| `worktree` | Normal repos | Yes | High |
| `direct` | Large repos | No | Zero |

---

## Phase 1: Execution Mode Infrastructure (Day 1-2)

### 1.1 Execution Mode Detection
- [ ] Create `packages/daemon/src/repo/execution-mode.ts`
- [ ] Implement `detectExecutionMode(repoPath, configuredMode)`
- [ ] Implement `isUnrealProject()` - check for `.uproject`
- [ ] Implement `hasHeavyLfsConfig()` - parse `.gitattributes`
- [ ] Implement `isShallowClone()` - `git rev-parse --is-shallow-repository`
- [ ] Log detection reason for debugging

### 1.2 Worktree Manager
- [ ] Create `packages/daemon/src/repo/worktree.ts`
- [ ] Implement `WorktreeManager.create(taskId, repoPath)`
- [ ] Implement `WorktreeManager.remove(worktreePath)`
- [ ] Implement `WorktreeManager.exists(worktreePath)`
- [ ] Implement `WorktreeManager.prune(repoPath)`
- [ ] Add `WORKTREES_DIR` constant (`~/.nightshift/worktrees/`)
- [ ] Create worktrees directory on startup

### 1.3 Direct Mode Manager
- [ ] Create `packages/daemon/src/repo/direct-mode.ts`
- [ ] Implement `DirectModeManager.setup(taskId, repoPath)`
  - [ ] Check repo is clean
  - [ ] Save current branch
  - [ ] Create and checkout task branch
- [ ] Implement `DirectModeManager.teardown(repoPath, originalBranch)`
- [ ] Implement `isRepoDirty(repoPath)`
- [ ] Implement `getCurrentBranch(repoPath)`

### 1.4 Git Operations
- [ ] Add `getHeadSha(repoPath)`
- [ ] Add `worktreeAdd(path, branch, sha, repo)`
- [ ] Add `worktreeRemove(path, repo)`
- [ ] Add `worktreePrune(repo)`
- [ ] Add `branchExists(branch, repo)`
- [ ] Add `getDiffFromBase(path, baseSha)` → `DiffStats`

### 1.5 Database Migration
- [ ] Create `migrations/002_execution_modes.ts`
- [ ] **Repos table:**
  - [ ] Add column: `executionMode TEXT DEFAULT 'auto'`
- [ ] **Tasks table:**
  - [ ] Add column: `executionMode TEXT`
  - [ ] Add column: `workDir TEXT`
  - [ ] Add column: `baseCommitSha TEXT`
  - [ ] Add column: `originalBranch TEXT`
  - [ ] Add column: `pausedAt INTEGER`
  - [ ] Add column: `pauseReason TEXT`
  - [ ] Add column: `humanQuestion TEXT`
  - [ ] Add column: `humanResponse TEXT`
- [ ] Update schema version to 2

### 1.6 Task Types
- [ ] Add `'paused'` to `TaskStatus` enum
- [ ] Add `ExecutionMode` type: `'worktree' | 'direct'`
- [ ] Add `ExecutionModeConfig` type: `'auto' | 'worktree' | 'direct'`
- [ ] Add new fields to `Task` interface
- [ ] Add new field to `Repo` interface

**✅ Phase 1 Done When:** Both mode managers work, DB migrated, types updated

---

## Phase 2: Dual-Mode Task Executor (Day 2-3)

### 2.1 Unified Task Setup
- [ ] Create `packages/daemon/src/executor/task-setup.ts`
- [ ] Implement `setupTaskExecution(task, repo)`:
  - [ ] Call `detectExecutionMode()` to resolve mode
  - [ ] **Worktree mode**: call `WorktreeManager.create()`
  - [ ] **Direct mode**: call `DirectModeManager.setup()`
  - [ ] Store `executionMode`, `workDir`, `baseCommitSha` in task
- [ ] Implement `teardownTaskExecution(task, result)`:
  - [ ] Worktree + completed: push, PR, remove worktree
  - [ ] Worktree + paused: commit WIP, remove worktree
  - [ ] Direct + completed: push, PR, checkout original branch
  - [ ] Direct + paused: commit WIP, stay on task branch

### 2.2 Executor Mode Integration
- [ ] Call `setupTaskExecution()` on task claim
- [ ] Pass `workDir` to Claude runner
- [ ] **Worktree mode**: lock by worktree path (parallel OK)
- [ ] **Direct mode**: lock by repo path (exclusive, one at a time)
- [ ] Call `teardownTaskExecution()` on complete/fail/pause

### 2.3 Claude Runner Updates
- [ ] Accept `workDir` parameter
- [ ] Run Claude in workDir
- [ ] Detect `[NEEDS_HUMAN]` patterns
- [ ] Return `{ needsHuman: true, question }` when detected
- [ ] Support context injection on resume

### 2.4 Git Operations Updates
- [ ] All operations work in workDir context
- [ ] Add `getDiffStats(workDir, baseSha)`

### 2.5 Parallel Execution
- [ ] Make `maxConcurrentTasks` configurable (default: 3)
- [ ] **Worktree mode**: allow multiple tasks on same repo
- [ ] **Direct mode**: enforce one task per repo
- [ ] Update `getNextTask()` to respect mode constraints

**✅ Phase 2 Done When:** Both modes work, constraints respected

---

## Phase 3: Pause/Resume Implementation (Day 3-4)

### 3.1 Pause Operation
- [ ] Create `packages/daemon/src/executor/task-lifecycle.ts`
- [ ] Implement `pauseTask(taskId, reason, question?)`
  - [ ] Stop Claude process (SIGTERM)
  - [ ] Commit changes: `git add . && git commit -m "WIP"`
  - [ ] **Worktree mode**: remove worktree (keep branch)
  - [ ] **Direct mode**: stay on task branch (no removal)
  - [ ] Update task record
  - [ ] Emit `TASK_PAUSED` event

### 3.2 Resume Operation
- [ ] Implement `resumeTask(taskId, humanResponse?)`
  - [ ] **Worktree mode**: recreate worktree from branch
  - [ ] **Direct mode**:
    - [ ] Check repo is clean (error if dirty)
    - [ ] Checkout task branch
  - [ ] Update task record
  - [ ] Build resume prompt with human response
  - [ ] Queue task for execution
  - [ ] Emit `TASK_RESUMED` event

### 3.3 Direct Mode Resume Warning
- [ ] Check `git status --porcelain` before resume
- [ ] If dirty: return `NEEDS_HUMAN_GIT_DIRTY` error
- [ ] UI shows: "Commit or stash changes before resuming"

### 3.4 Auto-Pause on Needs Human
- [ ] Detect needs_human patterns in Claude output
- [ ] Extract question text
- [ ] Call `pauseTask(id, 'needs_human', question)`

### 3.4 Executor Integration
- [ ] Handle `needsHuman` result from Claude runner
- [ ] Handle rate limit → `pauseTask(id, 'rate_limit')`
- [ ] Skip paused tasks in polling loop

**✅ Phase 3 Done When:** Manual pause/resume works, auto-pause on needs_human works

---

## Phase 4: API & UI Updates (Day 4-5)

### 4.1 API Endpoints
- [ ] `POST /api/tasks/:id/pause` - body: `{ reason? }`
- [ ] `POST /api/tasks/:id/resume` - body: `{ response? }`
- [ ] `GET /api/tasks/:id/diff` - returns `DiffStats`
- [ ] Update task responses with new fields

### 4.2 API Client
- [ ] Add `pauseTask(id, reason?)`
- [ ] Add `resumeTask(id, response?)`
- [ ] Add `getTaskDiff(id)`
- [ ] Update `Task` type

### 4.3 Tasks List UI
- [ ] Add "Paused" filter chip
- [ ] Show paused icon (⏸️)
- [ ] Show pause reason badge
- [ ] Distinct styling for paused rows

### 4.4 Task Detail UI
- [ ] Show human question prominently
- [ ] Add response textarea input
- [ ] Add "Resume" button
- [ ] Add "Pause" button
- [ ] Show diff stats (+N -M)
- [ ] Add expandable diff viewer
- [ ] Show execution mode badge (Worktree / Direct)
- [ ] **Direct mode**: warn if repo dirty before resume

### 4.5 Repos UI - Execution Mode
- [ ] Add "Execution Mode" column to repos table
- [ ] Show mode badge: Auto / Worktree / Direct
- [ ] Add mode selector in add/edit repo dialog
- [ ] Show detected mode when "Auto" selected
- [ ] Warn if worktree mode on large repo
- [ ] Add `GET /api/repos/:id/detected-mode` endpoint

### 4.6 Dashboard UI
- [ ] Add "Paused" stat card
- [ ] Show "Needs Input" count
- [ ] Highlight tasks needing input

### 4.7 Diff Viewer Component
- [ ] Create `DiffViewer.tsx`
- [ ] Syntax highlighting
- [ ] Collapsible file sections
- [ ] Stats header

**✅ Phase 4 Done When:** Full UI flow for pause/resume/respond works

---

## Phase 5: Notifications & Polish (Day 5-6)

### 5.1 Browser Notifications
- [ ] Create `useNotifications` hook
- [ ] Request permission on load
- [ ] Notify: task completed, needs input, failed
- [ ] Add toggle in Settings

### 5.2 Needs Input Polling
- [ ] Create `useTasksNeedingInput` hook
- [ ] Show badge on sidebar
- [ ] Trigger notification for new needs_input

### 5.3 Session Log Events
- [ ] Add `TASK_PAUSED` event type
- [ ] Add `TASK_RESUMED` event type
- [ ] Add `WORKTREE_CREATED` event type
- [ ] Add `WORKTREE_REMOVED` event type
- [ ] Update SessionLogViewer

### 5.4 CLI Commands
- [ ] Add `nightshift pause <taskId>`
- [ ] Add `nightshift resume <taskId> [--response "..."]`
- [ ] Update `nightshift status` with paused count
- [ ] Add `nightshift tasks --paused` filter

**✅ Phase 5 Done When:** Notifications work, CLI commands work

---

## Phase 6: Testing & Documentation (Day 6-7)

### 6.1 Integration Tests
- [ ] Task → worktree → complete → PR
- [ ] Task → pause → resume → complete
- [ ] Task → needs_human → auto-pause → respond → complete
- [ ] Two tasks same repo → parallel worktrees
- [ ] Pause → daemon restart → still paused
- [ ] Resume → worktree recreated

### 6.2 Edge Case Tests
- [ ] Pause already paused → error
- [ ] Resume non-paused → error
- [ ] Worktree path exists → handle
- [ ] Branch deleted → helpful error
- [ ] Daemon killed mid-task → cleanup

### 6.3 Documentation
- [ ] Update README
- [ ] Document pause/resume flow
- [ ] Document human-in-the-loop
- [ ] Document worktree structure
- [ ] Add troubleshooting guide
- [ ] Update API docs

**✅ Phase 6 Done When:** All tests pass, docs complete

---

## Quick Reference: New Task Flow

```
                     ┌──────────────────────────────────────┐
                     │           HUMAN PROVIDES             │
                     │        RESPONSE IN UI/CLI            │
                     └──────────────┬───────────────────────┘
                                    │
                                    ▼
pending → claimed → running ───► paused ◄─── (manual pause)
              │         │           │
              │         │           │ resume
              │         │           ▼
              │         └────── running (continues)
              │                     │
              ▼                     ▼
          completed             completed
              │                     │
              ▼                     ▼
         PR created            PR created
```

---

## Config Changes

```typescript
// packages/daemon/src/config/defaults.ts
export const DEFAULT_CONFIG = {
  port: 3847,
  taskTimeoutMs: 4 * 60 * 60 * 1000,
  maxConcurrentTasks: 3,        // Changed from 1
  localQueueEnabled: true,
  autoResumeRateLimitMs: 60 * 60 * 1000,  // NEW: 1 hour
  preserveWorktreesOnFail: false,          // NEW
};
```

---

## Directory Structure After Implementation

```
~/.nightshift/
├── config.json
├── daemon.db           # SQLite with new columns
├── nightshift.pid
├── sessions/           # NDJSON event logs
│   └── {taskId}.ndjson
├── worktrees/          # NEW: Isolated task directories
│   ├── {taskId-1}/     # Git worktree for task 1
│   ├── {taskId-2}/     # Git worktree for task 2
│   └── ...
└── locks/              # Per-worktree locks (not per-repo)
    └── {worktreeHash}
```
