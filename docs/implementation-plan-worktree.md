# Implementation Plan: Git Worktree & Pause/Resume

**Date:** 2025-12-24
**Status:** Draft
**Estimated Effort:** 6-8 days

---

## Executive Summary

This plan implements three interconnected features from the claude-squad reference:

1. **Git Worktree Support** - Isolated execution environments per task
2. **Pause/Resume Flow** - Preserve work, free resources, continue later
3. **Human-in-the-Loop via Pause** - Replace stuck `needs_human` with actionable pause state

These changes remove the "one task per repo" constraint and enable a clean human interaction model.

---

## Critical Consideration: Large Repositories

### The Problem

The primary use case is **200GB+ Unreal Engine game repositories**. Git worktrees are problematic for large repos:

| Issue | Impact |
|-------|--------|
| Disk space | Each worktree duplicates working files (200GB × N tasks) |
| Creation time | Checking out 200GB takes 10+ minutes |
| LFS complications | Game repos use Git LFS; worktrees + LFS can conflict |
| Network bandwidth | LFS pulls for each worktree |

### Solution: Dual Execution Modes

Repos are configured with an **execution mode**:

| Mode | Use Case | Parallel Tasks | Disk Overhead |
|------|----------|----------------|---------------|
| `worktree` | Normal repos (<10GB) | Yes (unlimited) | Full copy per task |
| `direct` | Large repos (200GB+) | No (one at a time) | Zero |

### Mode Selection

```typescript
// Per-repo configuration
interface RepoConfig {
  path: string;
  defaultBranch: string;
  executionMode: 'worktree' | 'direct';  // NEW
}
```

**Default behavior:**
- Auto-detect based on repo characteristics
- User can override per-repo in settings

**Auto-detection heuristics:**
1. Check for `.uproject` file (Unreal) → `direct`
2. Check for Git LFS config with large patterns → `direct`
3. Check shallow clone depth → `direct` (worktrees don't work well)
4. Otherwise → `worktree`

### Execution Mode Comparison

| Aspect | Worktree Mode | Direct Mode |
|--------|---------------|-------------|
| **Working directory** | `~/.nightshift/worktrees/{taskId}` | Original repo path |
| **Branch creation** | `git worktree add -b` | `git checkout -b` |
| **Parallel tasks** | Yes (isolated) | No (repo locked) |
| **Dirty tree check** | Not needed (fresh checkout) | Required (refuse if dirty) |
| **Pause behavior** | Commit + remove worktree | Commit only (stay on branch) |
| **Resume behavior** | Recreate worktree from branch | Checkout branch (must be clean) |
| **Disk usage** | High (full copy) | Zero overhead |
| **Startup time** | Slow (checkout) | Fast (branch only) |

### Direct Mode Constraints

When `executionMode: 'direct'`:

1. **One task per repo** - Enforced via repo lock
2. **Clean working tree required** - Task fails with `NEEDS_HUMAN_GIT_DIRTY` if uncommitted changes
3. **User workflow**:
   - Commit or stash your changes before task runs
   - Or: task runs overnight when you're not working
4. **Branch stays checked out** - On pause, branch remains (no worktree to remove)
5. **Resume requires clean tree** - User must not have uncommitted changes

---

## Architecture Changes

### Current Flow
```
pending → claimed → running → completed
                           ↘ failed
                           ↘ needs_human (stuck, no resume)
```

### New Flow
```
pending → claimed → running → completed
                  ↘ paused ↗    ↘ failed
                     │
            (human provides input,
             then resume continues)
```

### Key Insight: Pause as Human-in-the-Loop

When Claude needs human input:
1. **Pause** the task (commits WIP, removes worktree, frees resources)
2. Store the **question** in task record
3. User reviews question, provides **clarification** in UI
4. **Resume** the task with clarification injected into prompt
5. Claude continues execution with new context

This is better than `needs_human` because:
- Resources are freed while waiting
- User can resume whenever ready (hours/days later)
- Same mechanism for manual pause and AI-requested pause
- No special "stuck" state to handle

---

## Database Schema Changes

### Repos Table Updates

```sql
-- Add execution mode to repos
ALTER TABLE repos ADD COLUMN executionMode TEXT DEFAULT 'auto';
-- Values: 'auto' | 'worktree' | 'direct'
```

### Tasks Table Updates

```sql
-- Add new columns
ALTER TABLE tasks ADD COLUMN executionMode TEXT; -- Resolved mode: 'worktree' | 'direct'
ALTER TABLE tasks ADD COLUMN workDir TEXT;       -- Working directory (worktree path OR repo path)
ALTER TABLE tasks ADD COLUMN baseCommitSha TEXT;
ALTER TABLE tasks ADD COLUMN originalBranch TEXT; -- Branch before task started (direct mode)
ALTER TABLE tasks ADD COLUMN pausedAt INTEGER;
ALTER TABLE tasks ADD COLUMN pauseReason TEXT;   -- 'manual' | 'needs_human' | 'rate_limit'
ALTER TABLE tasks ADD COLUMN humanQuestion TEXT;
ALTER TABLE tasks ADD COLUMN humanResponse TEXT;

-- Update status enum (in TypeScript, not SQL)
-- Add: 'paused' status
```

### New Columns Explained

| Column | Type | Purpose |
|--------|------|---------|
| `executionMode` | TEXT | Resolved execution mode for this task: `worktree` or `direct` |
| `workDir` | TEXT | Where task executes: worktree path (worktree mode) or repo path (direct mode) |
| `baseCommitSha` | TEXT | HEAD SHA when task started (for clean diffs) |
| `originalBranch` | TEXT | Branch checked out before task (direct mode only, for cleanup) |
| `pausedAt` | INTEGER | Timestamp when paused (null if not paused) |
| `pauseReason` | TEXT | Why paused: `manual`, `needs_human`, `rate_limit` |
| `humanQuestion` | TEXT | Question from Claude requiring human input |
| `humanResponse` | TEXT | User's response to inject on resume |

### Repos Table New Column

| Column | Type | Purpose |
|--------|------|---------|
| `executionMode` | TEXT | `auto` (detect), `worktree` (force), `direct` (force) |

---

## Implementation Phases

### Phase 1: Execution Mode Infrastructure (Day 1-2)

Core infrastructure for dual-mode execution.

#### 1.1 Execution Mode Detection

**File:** `packages/daemon/src/repo/execution-mode.ts`

```typescript
export type ExecutionMode = 'worktree' | 'direct';
export type ExecutionModeConfig = 'auto' | 'worktree' | 'direct';

export interface ExecutionModeResult {
  mode: ExecutionMode;
  reason: string;  // Why this mode was chosen
}

export async function detectExecutionMode(
  repoPath: string,
  configuredMode: ExecutionModeConfig
): Promise<ExecutionModeResult>;

// Auto-detection heuristics
async function isLargeRepo(repoPath: string): Promise<boolean>;
async function isUnrealProject(repoPath: string): Promise<boolean>;
async function hasHeavyLfsConfig(repoPath: string): Promise<boolean>;
async function isShallowClone(repoPath: string): Promise<boolean>;
```

**Checklist:**
- [ ] Create `packages/daemon/src/repo/execution-mode.ts`
- [ ] Implement `detectExecutionMode()`:
  - [ ] If config is `worktree` or `direct` → use configured mode
  - [ ] If config is `auto` → run detection heuristics
- [ ] Implement `isUnrealProject()` - check for `.uproject` file
- [ ] Implement `hasHeavyLfsConfig()` - parse `.lfsconfig` / `.gitattributes` for large patterns
- [ ] Implement `isShallowClone()` - `git rev-parse --is-shallow-repository`
- [ ] Log detection reason for debugging

#### 1.2 Worktree Manager Module

**File:** `packages/daemon/src/repo/worktree.ts`

```typescript
export interface WorktreeInfo {
  path: string;
  branch: string;
  baseCommitSha: string;
}

export class WorktreeManager {
  constructor(private baseDir: string = WORKTREES_DIR) {}

  async create(taskId: string, repoPath: string): Promise<WorktreeInfo>;
  async remove(worktreePath: string): Promise<void>;
  async exists(worktreePath: string): Promise<boolean>;
  async prune(repoPath: string): Promise<void>;
}
```

**Checklist:**
- [ ] Create `packages/daemon/src/repo/worktree.ts`
- [ ] Implement `create()` - creates worktree with branch `nightshift/{taskId}`
- [ ] Implement `remove()` - removes worktree but keeps branch
- [ ] Implement `exists()` - checks if worktree path exists
- [ ] Implement `prune()` - cleans up dangling worktree refs
- [ ] Add `WORKTREES_DIR` to `packages/daemon/src/config/paths.ts` (`~/.nightshift/worktrees/`)
- [ ] Create directory on daemon startup if not exists

#### 1.3 Direct Mode Manager

**File:** `packages/daemon/src/repo/direct-mode.ts`

```typescript
export interface DirectModeSetup {
  originalBranch: string;  // Branch before we started
  taskBranch: string;      // nightshift/{taskId}
  baseCommitSha: string;   // HEAD when started
}

export class DirectModeManager {
  async setup(taskId: string, repoPath: string): Promise<DirectModeSetup>;
  async teardown(repoPath: string, originalBranch: string): Promise<void>;
  async isRepoDirty(repoPath: string): Promise<boolean>;
  async getCurrentBranch(repoPath: string): Promise<string>;
}
```

**Checklist:**
- [ ] Create `packages/daemon/src/repo/direct-mode.ts`
- [ ] Implement `setup()`:
  - [ ] Check repo is clean (fail with `NEEDS_HUMAN_GIT_DIRTY` if not)
  - [ ] Save current branch name
  - [ ] Get HEAD SHA
  - [ ] Create and checkout `nightshift/{taskId}` branch
- [ ] Implement `teardown()`:
  - [ ] Checkout original branch
  - [ ] Optionally delete task branch if completed
- [ ] Implement `isRepoDirty()` - `git status --porcelain`
- [ ] Implement `getCurrentBranch()` - `git branch --show-current`

#### 1.2 Git Operations Extensions

**File:** `packages/daemon/src/repo/git.ts` (extend existing)

```typescript
// New functions needed
export async function getHeadSha(repoPath: string): Promise<string>;
export async function worktreeAdd(worktreePath: string, branch: string, baseSha: string, repoPath: string): Promise<void>;
export async function worktreeRemove(worktreePath: string, repoPath: string): Promise<void>;
export async function worktreePrune(repoPath: string): Promise<void>;
export async function branchExists(branch: string, repoPath: string): Promise<boolean>;
export async function getDiffFromBase(worktreePath: string, baseSha: string): Promise<DiffStats>;
```

**Checklist:**
- [ ] Add `getHeadSha()` - `git rev-parse HEAD`
- [ ] Add `worktreeAdd()` - `git worktree add -b {branch} {path} {sha}`
- [ ] Add `worktreeRemove()` - `git worktree remove -f {path}`
- [ ] Add `worktreePrune()` - `git worktree prune`
- [ ] Add `branchExists()` - `git branch --list {branch}`
- [ ] Add `getDiffFromBase()` - stages untracked, diffs from base SHA
- [ ] Add `DiffStats` interface with `content`, `added`, `removed`, `files`

#### 1.3 Database Schema Migration

**File:** `packages/daemon/src/db/migrations/002_worktree_support.ts`

**Checklist:**
- [ ] Create migration file
- [ ] Add `worktreePath` column to tasks
- [ ] Add `baseCommitSha` column to tasks
- [ ] Add `pausedAt` column to tasks
- [ ] Add `pauseReason` column to tasks
- [ ] Add `humanQuestion` column to tasks
- [ ] Add `humanResponse` column to tasks
- [ ] Update schema version to 2
- [ ] Test migration on existing database

#### 1.4 Update Task Types

**File:** `packages/daemon/src/db/schema.ts`

**Checklist:**
- [ ] Add `'paused'` to TaskStatus type
- [ ] Add new columns to Task interface
- [ ] Update `createTask()` to not set worktree fields (set during claim)
- [ ] Add `updateTaskWorktree()` function
- [ ] Add `updateTaskPause()` function
- [ ] Add `updateTaskHumanResponse()` function

---

### Phase 2: Dual-Mode Task Executor (Day 2-3)

Modify executor to handle both worktree and direct execution modes.

#### 2.1 Unified Task Setup

**File:** `packages/daemon/src/executor/task-setup.ts` (new)

```typescript
export interface TaskSetupResult {
  executionMode: ExecutionMode;
  workDir: string;           // Where Claude runs
  baseCommitSha: string;
  originalBranch?: string;   // Only for direct mode
  taskBranch: string;
}

export async function setupTaskExecution(
  task: Task,
  repo: Repo
): Promise<TaskSetupResult>;

export async function teardownTaskExecution(
  task: Task,
  result: 'completed' | 'failed' | 'paused'
): Promise<void>;
```

**Checklist:**
- [ ] Create `packages/daemon/src/executor/task-setup.ts`
- [ ] Implement `setupTaskExecution()`:
  - [ ] Detect execution mode via `detectExecutionMode()`
  - [ ] If `worktree`: call `WorktreeManager.create()`
  - [ ] If `direct`: call `DirectModeManager.setup()`
  - [ ] Store mode and workDir in task record
  - [ ] Return unified result
- [ ] Implement `teardownTaskExecution()`:
  - [ ] If `worktree` + completed: push, create PR, remove worktree
  - [ ] If `worktree` + failed: optionally preserve for debugging
  - [ ] If `worktree` + paused: commit WIP, remove worktree
  - [ ] If `direct` + completed: push, create PR, checkout original branch
  - [ ] If `direct` + failed: checkout original branch
  - [ ] If `direct` + paused: commit WIP, stay on task branch

#### 2.2 Executor Mode Integration

**File:** `packages/daemon/src/executor/task-executor.ts`

**Checklist:**
- [ ] Call `setupTaskExecution()` on task claim
- [ ] Store execution mode, workDir, baseCommitSha in task
- [ ] Pass `workDir` (not `repoPath`) to Claude runner
- [ ] Handle locking correctly:
  - [ ] Worktree mode: lock by worktree path (parallel OK)
  - [ ] Direct mode: lock by repo path (exclusive)
- [ ] Call `teardownTaskExecution()` on complete/fail/pause
- [ ] For direct mode: enforce one task per repo

#### 2.2 Claude Runner Updates

**File:** `packages/daemon/src/executor/claude-runner.ts`

**Checklist:**
- [ ] Accept `workDir` parameter (worktree path)
- [ ] Run Claude in worktree directory
- [ ] Detect `[NEEDS_HUMAN]` pattern in output
- [ ] When needs_human detected: return structured result with question
- [ ] Add support for injecting context on resume (prepend to prompt)

#### 2.3 Git Operations in Worktree Context

**File:** `packages/daemon/src/executor/git-operations.ts`

**Checklist:**
- [ ] Update all git operations to work in worktree path
- [ ] `createBranch()` - not needed, branch created with worktree
- [ ] `commit()` - works in worktree, commits to its branch
- [ ] `push()` - pushes worktree's branch to origin
- [ ] `createPr()` - creates PR from worktree branch to default branch
- [ ] Add `getDiffStats()` method using baseCommitSha

#### 2.4 Parallel Execution Support

**Checklist:**
- [ ] Remove `maxConcurrentTasks: 1` as hard limit (make configurable)
- [ ] Update `getNextTask()` to allow multiple running tasks
- [ ] Each task gets own worktree - no conflicts
- [ ] Test: two tasks on same repo run in parallel
- [ ] Add config option: `maxConcurrentTasks` (default: 3)

---

### Phase 3: Pause/Resume Implementation (Day 3-4)

Core pause/resume functionality.

#### 3.1 Pause Task Operation

**File:** `packages/daemon/src/executor/task-lifecycle.ts` (new)

```typescript
export async function pauseTask(
  taskId: string,
  reason: 'manual' | 'needs_human' | 'rate_limit',
  question?: string
): Promise<void>;
```

**Checklist:**
- [ ] Create `task-lifecycle.ts` module
- [ ] Implement `pauseTask()`:
  - [ ] Verify task is in `running` state
  - [ ] Stop Claude process gracefully (SIGTERM)
  - [ ] Commit all changes: `git add . && git commit -m "WIP: paused"`
  - [ ] **Worktree mode**: Remove worktree (keep branch)
  - [ ] **Direct mode**: Stay on task branch (no worktree to remove)
  - [ ] Update task: `status='paused'`, `pausedAt`, `pauseReason`, `humanQuestion`
  - [ ] Emit session event: `TASK_PAUSED`
- [ ] Handle edge cases:
  - [ ] Task already paused → error
  - [ ] No changes to commit → skip commit
  - [ ] Worktree already removed → skip removal

#### 3.2 Resume Task Operation

**File:** `packages/daemon/src/executor/task-lifecycle.ts`

```typescript
export async function resumeTask(
  taskId: string,
  humanResponse?: string
): Promise<void>;
```

**Checklist:**
- [ ] Implement `resumeTask()`:
  - [ ] Verify task is in `paused` state
  - [ ] **Worktree mode**: Recreate worktree from existing branch
  - [ ] **Direct mode**:
    - [ ] Check repo is clean (fail with `NEEDS_HUMAN_GIT_DIRTY` if dirty)
    - [ ] Checkout task branch
  - [ ] Update task: `status='running'`, `humanResponse`, clear `pausedAt`
  - [ ] Build resume prompt (original + context + human response)
  - [ ] Queue task for execution (or execute immediately)
  - [ ] Emit session event: `TASK_RESUMED`
- [ ] Resume prompt format:
  ```
  [Previous task was paused. Human provided this clarification:]
  {humanResponse}

  [Continue with the original task:]
  {originalPrompt}
  ```

#### 3.2.1 Direct Mode Resume Edge Cases

**Important:** In direct mode, resuming requires the repo to be in a clean state.

**Checklist:**
- [ ] Before resume in direct mode:
  - [ ] Check `git status --porcelain` is empty
  - [ ] If dirty: return error `NEEDS_HUMAN_GIT_DIRTY` with message:
    ```
    Cannot resume task: repository has uncommitted changes.
    Please commit or stash your changes before resuming.
    ```
  - [ ] Check current branch (user might have switched)
  - [ ] Checkout task branch if not already on it
- [ ] UI should show clear message about requirement

#### 3.3 Auto-Pause on Needs Human

**File:** `packages/daemon/src/executor/claude-runner.ts`

**Checklist:**
- [ ] Detect needs_human patterns in Claude output:
  - [ ] `[NEEDS_HUMAN]` marker
  - [ ] "I need clarification" phrases
  - [ ] Explicit questions ending with `?`
- [ ] Extract the question text
- [ ] Return `{ needsHuman: true, question: "..." }` from runner
- [ ] Executor calls `pauseTask(taskId, 'needs_human', question)`
- [ ] Task enters paused state automatically

#### 3.4 Executor Integration

**File:** `packages/daemon/src/executor/task-executor.ts`

**Checklist:**
- [ ] After Claude execution:
  - [ ] If `needsHuman`: call `pauseTask()` with question
  - [ ] If success: proceed to git operations
  - [ ] If error: mark failed
- [ ] On rate limit from Claude API:
  - [ ] Call `pauseTask(taskId, 'rate_limit')`
  - [ ] Different handling than needs_human (auto-resume after cooldown?)
- [ ] Integrate with polling loop:
  - [ ] Skip paused tasks in `getNextTask()`
  - [ ] Resumed tasks re-enter queue

---

### Phase 4: API & UI Updates (Day 4-5)

Expose pause/resume via API and update UI.

#### 4.1 Tasks API Updates

**File:** `packages/daemon/src/server/routes/api/tasks.ts`

**Checklist:**
- [ ] Add `POST /api/tasks/:id/pause` endpoint
  - [ ] Body: `{ reason?: 'manual' }`
  - [ ] Only works for `running` tasks
  - [ ] Returns updated task
- [ ] Add `POST /api/tasks/:id/resume` endpoint
  - [ ] Body: `{ response?: string }`
  - [ ] Only works for `paused` tasks
  - [ ] Returns updated task
- [ ] Update `GET /api/tasks/:id` to include new fields
- [ ] Update `GET /api/tasks` to filter by `paused` status
- [ ] Add `GET /api/tasks/:id/diff` endpoint
  - [ ] Returns `DiffStats` from base commit
  - [ ] Works for running and paused tasks

#### 4.2 API Client Updates

**File:** `packages/daemon/ui/src/api/client.ts`

**Checklist:**
- [ ] Add `pauseTask(id: string, reason?: string): Promise<Task>`
- [ ] Add `resumeTask(id: string, response?: string): Promise<Task>`
- [ ] Add `getTaskDiff(id: string): Promise<DiffStats>`
- [ ] Update `Task` type with new fields

#### 4.3 Task List UI Updates

**File:** `packages/daemon/ui/src/pages/Tasks.tsx`

**Checklist:**
- [ ] Add "Paused" filter chip (alongside Pending, Running, etc.)
- [ ] Show paused status with distinct icon (⏸️ or similar)
- [ ] Show pause reason badge: "Needs Input" / "Rate Limited" / "Manual"
- [ ] Different row styling for paused tasks (muted? yellow highlight?)

#### 4.4 Task Detail UI Updates

**File:** `packages/daemon/ui/src/pages/TaskDetail.tsx`

**Checklist:**
- [ ] Show human question prominently when `pauseReason === 'needs_human'`
- [ ] Add response input field (textarea)
- [ ] Add "Resume" button (enabled when paused)
- [ ] Add "Pause" button (enabled when running)
- [ ] Show diff stats (+N -M lines changed)
- [ ] Add expandable diff viewer (syntax highlighted)
- [ ] Show pause timestamp and duration paused
- [ ] Show execution mode badge (Worktree / Direct)
- [ ] **Direct mode warning on resume**: Show if repo has uncommitted changes
- [ ] Clear visual states:
  - [ ] Running: green pulse, "In Progress"
  - [ ] Paused (needs input): yellow, question displayed, response input
  - [ ] Paused (manual): gray, "Paused" badge, resume button
  - [ ] Paused (rate limit): orange, auto-resume countdown?

#### 4.4.1 Repos UI - Execution Mode Config

**File:** `packages/daemon/ui/src/pages/Repos.tsx`

**Checklist:**
- [ ] Add "Execution Mode" column to repos table
- [ ] Show mode badge: Auto / Worktree / Direct
- [ ] In add/edit repo dialog:
  - [ ] Add execution mode selector (Auto / Worktree / Direct)
  - [ ] Show detected mode when "Auto" is selected
  - [ ] Tooltip explaining each mode:
    - Auto: "Automatically detect based on repo size and type"
    - Worktree: "Create isolated copy for each task (parallel execution)"
    - Direct: "Run in original repo (one task at a time, no extra disk space)"
- [ ] Show warning for worktree mode on detected large repos:
  ```
  ⚠️ This appears to be a large repository. Worktree mode will
  create full copies of the repo for each task. Consider using
  Direct mode to save disk space.
  ```
- [ ] API endpoint to get detected mode: `GET /api/repos/:id/detected-mode`

#### 4.5 Dashboard Updates

**File:** `packages/daemon/ui/src/pages/Dashboard.tsx`

**Checklist:**
- [ ] Add "Paused" count to stat cards
- [ ] Show "Needs Input" count separately (subset of paused)
- [ ] Highlight tasks needing input in recent tasks list
- [ ] Quick action: "N tasks need your input" → links to filtered list

#### 4.6 Diff Viewer Component

**File:** `packages/daemon/ui/src/components/DiffViewer.tsx` (new)

**Checklist:**
- [ ] Create diff viewer component
- [ ] Syntax highlighting for diff format
- [ ] Line numbers
- [ ] Collapsible file sections
- [ ] Stats header: "+15 -3 across 4 files"
- [ ] Copy button for diff content
- [ ] Integrate into TaskDetail page

---

### Phase 5: Notifications & Polish (Day 5-6)

Complete the user experience.

#### 5.1 Browser Notifications

**File:** `packages/daemon/ui/src/hooks/useNotifications.ts` (new)

**Checklist:**
- [ ] Request notification permission on app load
- [ ] Create `useNotifications` hook
- [ ] Notify on task state changes:
  - [ ] "Task completed" → link to PR
  - [ ] "Task needs input" → link to task detail
  - [ ] "Task failed" → link to task detail
- [ ] Store notification preference in localStorage
- [ ] Add toggle in Settings page

#### 5.2 Polling for Paused Tasks Needing Input

**File:** `packages/daemon/ui/src/hooks/useTasksNeedingInput.ts` (new)

**Checklist:**
- [ ] Poll for tasks where `status === 'paused' && pauseReason === 'needs_human'`
- [ ] Show badge on sidebar: "2 tasks need input"
- [ ] Trigger browser notification when new task needs input

#### 5.3 Session Log Updates

**File:** `packages/daemon/src/session/logger.ts`

**Checklist:**
- [ ] Add event types:
  - [ ] `TASK_PAUSED` - includes reason, question
  - [ ] `TASK_RESUMED` - includes human response
  - [ ] `WORKTREE_CREATED` - path, branch, baseSha
  - [ ] `WORKTREE_REMOVED` - path
  - [ ] `DIFF_COMPUTED` - stats
- [ ] Update SessionLogViewer to render new event types

#### 5.4 CLI Updates

**File:** `packages/daemon/src/cli/commands/`

**Checklist:**
- [ ] Add `nightshift pause <taskId>` command
- [ ] Add `nightshift resume <taskId> [--response "..."]` command
- [ ] Update `nightshift status` to show paused tasks count
- [ ] Add `nightshift tasks --paused` filter flag

---

### Phase 6: Testing & Documentation (Day 6-7)

Ensure reliability and document new features.

#### 6.1 Integration Tests

**Checklist:**
- [ ] Test: Create task → runs in worktree → completes → PR created
- [ ] Test: Create task → pause manually → resume → completes
- [ ] Test: Create task → needs_human → auto-pause → provide response → resume → completes
- [ ] Test: Two tasks on same repo → both run in parallel worktrees
- [ ] Test: Pause task → daemon restart → task still paused
- [ ] Test: Resume task → worktree recreated from branch
- [ ] Test: Task fails → worktree preserved for debugging

#### 6.2 Edge Case Tests

**Checklist:**
- [ ] Test: Pause already paused task → error
- [ ] Test: Resume non-paused task → error
- [ ] Test: Worktree path already exists → handle gracefully
- [ ] Test: Branch deleted externally → error with helpful message
- [ ] Test: Repo deleted while task paused → error with helpful message
- [ ] Test: Daemon killed mid-task → cleanup on restart

#### 6.3 Documentation Updates

**Checklist:**
- [ ] Update README with new features
- [ ] Document pause/resume flow
- [ ] Document human-in-the-loop workflow
- [ ] Document worktree directory structure
- [ ] Add troubleshooting section for worktree issues
- [ ] Update API documentation with new endpoints

---

## File Change Summary

### New Files
```
packages/daemon/src/repo/worktree.ts          # Worktree manager
packages/daemon/src/executor/task-lifecycle.ts # Pause/resume logic
packages/daemon/src/db/migrations/002_*.ts     # Schema migration
packages/daemon/ui/src/components/DiffViewer.tsx
packages/daemon/ui/src/hooks/useNotifications.ts
packages/daemon/ui/src/hooks/useTasksNeedingInput.ts
```

### Modified Files
```
packages/daemon/src/db/schema.ts              # New columns, paused status
packages/daemon/src/repo/git.ts               # Worktree git operations
packages/daemon/src/executor/task-executor.ts # Use worktrees
packages/daemon/src/executor/claude-runner.ts # Needs human detection
packages/daemon/src/executor/git-operations.ts # Work in worktree
packages/daemon/src/session/logger.ts         # New event types
packages/daemon/src/server/routes/api/tasks.ts # Pause/resume endpoints
packages/daemon/src/config/paths.ts           # WORKTREES_DIR
packages/daemon/ui/src/api/client.ts          # New API methods
packages/daemon/ui/src/pages/Tasks.tsx        # Paused filter
packages/daemon/ui/src/pages/TaskDetail.tsx   # Human response UI
packages/daemon/ui/src/pages/Dashboard.tsx    # Paused stats
```

---

## Success Criteria

### Phase 1 Complete When:
- [ ] `WorktreeManager` creates/removes worktrees
- [ ] Database has new columns
- [ ] Unit tests pass

### Phase 2 Complete When:
- [ ] Tasks execute in worktrees (not original repo)
- [ ] Two tasks on same repo can run simultaneously
- [ ] PRs created from worktree branches

### Phase 3 Complete When:
- [ ] Manual pause commits and removes worktree
- [ ] Resume recreates worktree from branch
- [ ] Claude needs_human triggers auto-pause
- [ ] Human response injected on resume

### Phase 4 Complete When:
- [ ] API endpoints work (pause, resume, diff)
- [ ] UI shows paused tasks correctly
- [ ] Human can respond and resume via UI
- [ ] Diff viewer shows changes

### Phase 5 Complete When:
- [ ] Browser notifications work
- [ ] Session logs capture pause/resume events
- [ ] CLI commands work

### Phase 6 Complete When:
- [ ] All integration tests pass
- [ ] Edge cases handled
- [ ] Documentation complete

---

## Rollback Plan

If issues arise:
1. Database migration is additive (new columns) - no data loss
2. Tasks without worktreePath fall back to original repoPath
3. Paused status can be manually changed to failed via SQL
4. Worktrees can be manually cleaned with `git worktree prune`

---

## Open Questions

1. **Worktree cleanup policy** - When do we delete worktrees for completed tasks?
   - Option A: Immediately after PR created
   - Option B: After N days
   - Option C: Manual cleanup command
   - **Recommendation:** Option A (immediate), with flag to preserve for debugging

2. **Rate limit auto-resume** - Should rate-limited tasks auto-resume after cooldown?
   - Option A: Yes, with exponential backoff
   - Option B: No, require manual resume
   - **Recommendation:** Option A, with configurable cooldown

3. **Parallel task limit** - What's the default max concurrent tasks?
   - Current: 1 (hard limit)
   - **Recommendation:** 3 (configurable), since worktrees isolate well

4. **Branch naming** - What format for worktree branches?
   - Option A: `nightshift/{taskId}` (current plan)
   - Option B: `nightshift/{timestamp}-{shortPrompt}`
   - **Recommendation:** Option A (predictable, easy to find)
