## Epic 7: Authentication & Server Registration

**Goal:** Engineers can connect their daemon to the Control Center for team features.

**User Outcome:** Run `nightshift auth login`, complete OAuth, PC appears in Control Center.

**FRs covered:** FR13
**NFRs addressed:** NFR13 (OAuth with refresh)

---

### Story 7.1: Implement OAuth Flow

As an **engineer**,
I want **to authenticate with Control Center via OAuth**,
So that **my daemon can access team features**.

**Acceptance Criteria:**

**Given** user runs `nightshift auth login`
**When** command executes
**Then** opens browser to Control Center OAuth page
**And** displays "Waiting for authentication..." in terminal

**Given** user completes Google OAuth
**When** auth succeeds
**Then** token stored (encrypted) in `~/.nightshift/auth.json`
**And** displays "Authenticated as: user@example.com"

**Given** user runs `nightshift auth logout`
**When** command executes
**Then** tokens deleted from `~/.nightshift/`
**And** displays "Logged out successfully"

**Given** user runs `nightshift auth status`
**When** authenticated
**Then** displays "Authenticated as: user@example.com"
**When** not authenticated
**Then** displays "Not authenticated. Run 'nightshift auth login'"

---

### Story 7.2: Implement Token Storage and Refresh

As a **daemon**,
I want **tokens stored securely with auto-refresh**,
So that **authentication persists reliably**.

**Acceptance Criteria:**

**Given** tokens are stored
**When** auth.json is written
**Then** file permissions restricted (600)
**And** tokens encrypted with machine-specific key

**Given** access token expires
**When** API call attempted
**Then** refresh token used to get new access token
**And** new tokens stored

**Given** refresh token expires
**When** API call attempted
**Then** user prompted to re-authenticate
**And** daemon falls back to standalone mode

---

### Story 7.3: Implement PC Registration

As an **engineer**,
I want **my PC to appear in Control Center**,
So that **it can receive team tasks**.

**Acceptance Criteria:**

**Given** authenticated user
**When** daemon connects to server
**Then** PC registration sent with: hostname, username, configured repos

**Given** PC is new
**When** registration received
**Then** PC appears in Control Center as "Pending Approval"
**And** can only claim own tasks (not org pool)

**Given** admin approves PC
**When** approval saved
**Then** PC can claim org pool tasks

---

### Story 7.4: Implement Mode Detection

As a **daemon**,
I want **to detect operating mode automatically**,
So that **behavior changes based on connection status**.

**Acceptance Criteria:**

**Given** no serverUrl or no valid token
**When** mode evaluated
**Then** returns `standalone`

**Given** serverUrl + valid token + localQueueEnabled=false
**When** mode evaluated
**Then** returns `connected`

**Given** serverUrl + valid token + localQueueEnabled=true
**When** mode evaluated
**Then** returns `hybrid`

**Given** mode is displayed
**When** viewing Settings
**Then** shows current mode with explanation

---

## Epic 8: Remote Queue & Sync

**Goal:** Daemon receives and executes tasks from Control Center.

**User Outcome:** Submit task in Control Center, PC claims and executes it.

**FRs covered:** FR-S5, FR15, FR16
**NFRs addressed:** NFR3 (<5s claim), NFR4 (heartbeat), NFR8 (offline detection)

---

### Story 8.1: Set Up Convex Backend

As a **developer**,
I want **Convex configured with schema**,
So that **server-side data management works**.

**Acceptance Criteria:**

**Given** packages/backend directory
**When** Convex initialized
**Then** schema includes: tasks, pcs, sessions, users, orgs
**And** all fields use camelCase
**And** better-auth configured for Google OAuth

---

### Story 8.2: Implement Remote Task Queue Subscription

As a **daemon**,
I want **to subscribe to remote task queue**,
So that **I receive team tasks**.

**Acceptance Criteria:**

**Given** daemon is in connected or hybrid mode
**When** startup completes
**Then** subscribes to Convex query for available tasks
**And** filters to tasks matching configured repos

**Given** task becomes available
**When** daemon is eligible (online, enabled, in schedule)
**Then** claims task within 5 seconds
**And** task status → CLAIMED in Convex

---

### Story 8.3: Implement Heartbeat Mechanism

As a **system**,
I want **regular heartbeats from daemons**,
So that **offline PCs are detected**.

**Acceptance Criteria:**

**Given** daemon is connected
**When** running
**Then** sends heartbeat to Convex every 30 seconds
**And** updates `lastSeen` on PC record

**Given** PC misses 3 heartbeats (90 seconds)
**When** server evaluates
**Then** PC status → OFFLINE
**And** any CLAIMED tasks released back to queue

**Given** daemon receives SIGINT/SIGTERM
**When** shutting down
**Then** sends "going offline" message
**And** exits gracefully

---

### Story 8.4: Implement Session Log Upload

As a **daemon**,
I want **to upload session logs to cloud storage**,
So that **they're accessible from Control Center**.

**Acceptance Criteria:**

**Given** remote task completes
**When** session finalized
**Then** requests pre-signed upload URL from Convex
**And** uploads NDJSON to R2/S3
**And** stores storageKey in Convex session record

**Given** upload fails
**When** network error
**Then** retries 3 times with exponential backoff
**And** marks for later sync if all fail

---

### Story 8.5: Implement Schedule-Based Availability

As an **engineer**,
I want **to set when my PC accepts remote tasks**,
So that **it only runs during off-hours**.

**Acceptance Criteria:**

**Given** user configures schedule via Settings
**When** setting start/end times (e.g., 20:00-08:00)
**Then** schedule stored locally and synced to Convex

**Given** daemon with schedule
**When** current time outside schedule
**Then** PC does not claim remote tasks
**And** status shows "Scheduled" in Control Center

**Given** current time enters schedule window
**When** daemon evaluates
**Then** PC becomes eligible for remote tasks

---

### Story 8.6: Implement Local vs Remote Queue Tabs (Hybrid)

As an **engineer**,
I want **to see local and remote queues separately**,
So that **I know which tasks are mine vs team's**.

**Acceptance Criteria:**

**Given** daemon in hybrid mode
**When** viewing Tasks page
**Then** tabs show: "Local" and "Remote"
**And** each tab shows respective queue

**Given** local queue tab
**When** viewing tasks
**Then** shows tasks created locally (source: local)

**Given** remote queue tab
**When** viewing tasks
**Then** shows tasks from Control Center (source: remote)

---

## Epic 9: Control Center UI

**Goal:** Tech leads can manage team tasks via web app.

**User Outcome:** Log into Control Center, see all tasks and PCs, manage team work.

**FRs covered:** FR20, FR21
**NFRs addressed:** NFR14 (50+ PCs), NFR15 (100+ tasks)

---

### Story 9.1: Create Control Center App Shell

As a **developer**,
I want **Control Center web app scaffolded**,
So that **team management UI can be built**.

**Acceptance Criteria:**

**Given** packages/admin directory
**When** React app initialized
**Then** uses same design system (shadcn/ui, dark mode)
**And** Convex client configured
**And** routing set up for /login, /dashboard, /tasks, /pcs

---

### Story 9.2: Implement Authentication Flow

As a **user**,
I want **to sign into Control Center**,
So that **I can access team features**.

**Acceptance Criteria:**

**Given** unauthenticated user visits Control Center
**When** page loads
**Then** redirected to /login
**And** "Sign in with Google" button displayed

**Given** user clicks sign in
**When** OAuth completes with allowed domain
**Then** redirected to dashboard
**And** user auto-provisioned into default org

**Given** user signs in with non-allowed domain
**When** auth attempted
**Then** error: "Access restricted to authorized domains"

---

### Story 9.3: Create Task List with Filtering

As a **tech lead**,
I want **to see all team tasks with filters**,
So that **I can monitor and prioritize work**.

**Acceptance Criteria:**

**Given** user navigates to /tasks
**When** page loads
**Then** shows all tasks in org (newest first)
**And** real-time updates via Convex subscription

**Given** task list
**When** user applies filters
**Then** can filter by: status, repo, priority, PC
**And** filters persist in URL

**Given** task list
**When** user searches
**Then** filters to tasks matching prompt text

---

### Story 9.4: Create PC List View

As a **tech lead**,
I want **to see all registered PCs**,
So that **I know fleet capacity**.

**Acceptance Criteria:**

**Given** user navigates to /pcs
**When** page loads
**Then** shows all PCs in org
**And** columns: Name, Owner, Status, Repos, Last Seen

**Given** PC status changes
**When** heartbeat received/missed
**Then** UI updates in real-time

**Given** user is admin
**When** viewing unapproved PC
**Then** "Approve" button available
**And** clicking approves for org tasks

---

### Story 9.5: Create Task Detail View (Control Center)

As a **tech lead**,
I want **to see full task details including session log**,
So that **I can review what Claude did**.

**Acceptance Criteria:**

**Given** user clicks task in list
**When** detail opens (split view or full page)
**Then** shows: prompt, status, repo, branch, created by, PC
**And** session log viewer (fetched from R2/S3)
**And** PR link if available

---

## Epic 10: Notifications & Clarification Flow

**Goal:** Engineers receive Slack notifications and can unblock stuck tasks.

**User Outcome:** Get Slack ping when task completes, answer questions inline.

**FRs covered:** FR8, FR10, FR11
**NFRs addressed:** (Slack integration)

---

### Story 10.1: Configure Slack Integration

As an **admin**,
I want **to connect Night Shift to Slack**,
So that **team receives notifications**.

**Acceptance Criteria:**

**Given** admin visits Settings > Integrations
**When** Slack section displayed
**Then** shows "Connect to Slack" button

**Given** admin connects Slack
**When** OAuth completes
**Then** webhook URL stored in Convex
**And** channel selector appears

---

### Story 10.2: Implement Completion Notifications

As an **engineer**,
I want **Slack notification when task completes**,
So that **I know to review the PR**.

**Acceptance Criteria:**

**Given** task completes with PR
**When** status → COMPLETED
**Then** Slack message: "✅ Task completed: {prompt} on {repo}"
**And** includes PR link button

**Given** Slack send fails
**When** webhook error
**Then** logs error, does NOT affect task status
**And** retries once after 30s

---

### Story 10.3: Implement Clarification Notifications

As an **engineer**,
I want **Slack notification when Claude needs input**,
So that **I can unblock quickly**.

**Acceptance Criteria:**

**Given** task needs clarification
**When** status → NEEDS_HUMAN
**Then** Slack message: "❓ Task needs input: {prompt}"
**And** includes Claude's question
**And** includes link to task detail

---

### Story 10.4: Implement Clarification Response UI

As an **engineer**,
I want **to answer questions directly in UI**,
So that **I can unblock tasks quickly**.

**Acceptance Criteria:**

**Given** task is NEEDS_HUMAN
**When** viewing task detail
**Then** ClarificationBanner displays prominently
**And** shows Claude's question
**And** reply input field visible and focused

**Given** user types reply and submits
**When** clicking Submit or pressing Enter
**Then** reply stored on task
**And** task status → PENDING (re-queued)
**And** toast: "Clarification sent, task resuming"

---

### Story 10.5: Implement Task Resume After Clarification

As a **daemon**,
I want **to resume tasks with clarification context**,
So that **work continues where it left off**.

**Acceptance Criteria:**

**Given** task received clarification
**When** daemon claims task
**Then** recognizes as resumed task
**And** includes original prompt + all clarifications in context

**Given** task resumes
**When** Claude executes
**Then** has access to previous session context
**And** continues from where it left off

---
