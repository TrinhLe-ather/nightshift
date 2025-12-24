## Epic 11: Task Lifecycle Management

**Goal:** Engineers can cancel and retry tasks; leads can assign manually.

**User Outcome:** Cancel running work, retry failures, route tasks to specific PCs.

**FRs covered:** FR4, FR22, FR23
**NFRs addressed:** (Operational controls)

---

### Story 11.1: Implement Task Cancellation

As an **engineer**,
I want **to cancel a task**,
So that **I can stop work no longer needed**.

**Acceptance Criteria:**

**Given** task is PENDING or CLAIMED
**When** user clicks Cancel
**Then** task → CANCELED
**And** toast: "Task cancelled"

**Given** task is RUNNING
**When** user clicks Cancel
**Then** confirmation: "Task is running. Cancel anyway?"
**And** if confirmed, sends cancel signal to daemon

**Given** daemon receives cancel
**When** task executing
**Then** terminates Claude gracefully
**And** releases repo lock
**And** task → CANCELED

---

### Story 11.2: Implement Task Retry

As an **engineer**,
I want **to retry a failed task**,
So that **I can try again after fixing issues**.

**Acceptance Criteria:**

**Given** task is FAILED
**When** user clicks Retry
**Then** task → PENDING
**And** enters queue at appropriate position
**And** toast: "Task queued for retry"

**Given** task retried
**When** execution begins
**Then** creates new session/runId
**And** previous session preserved for reference

---

### Story 11.3: Implement Manual PC Assignment

As a **tech lead**,
I want **to assign task to specific PC**,
So that **I control where critical work runs**.

**Acceptance Criteria:**

**Given** task is PENDING (Control Center)
**When** admin views detail
**Then** "Assign to PC" dropdown shows eligible PCs

**Given** admin selects PC
**When** confirming
**Then** task assigned exclusively to that PC
**And** badge: "Assigned: {PC name}"

**Given** assigned PC is offline
**When** viewing task
**Then** warning: "Assigned PC is offline"
**And** option to reassign

---

## Epic 12: Analytics & Advanced Features

**Goal:** Teams can view history, statistics, and attach files.

**User Outcome:** See productivity metrics, search task history, attach reference files.

**FRs covered:** FR5, FR24
**NFRs addressed:** NFR16 (90 day retention), NFR17 (10MB sessions)

---

### Story 12.1: Implement Task History View

As a **tech lead**,
I want **to view historical task data**,
So that **I can analyze patterns**.

**Acceptance Criteria:**

**Given** user navigates to /tasks/history
**When** page loads
**Then** shows tasks from last 90 days
**And** includes completed, failed, canceled
**And** supports same filtering as main list

**Given** viewing old tasks
**When** clicking detail
**Then** session logs still accessible

---

### Story 12.2: Implement Statistics Dashboard

As a **tech lead**,
I want **to see productivity metrics**,
So that **I can measure Night Shift impact**.

**Acceptance Criteria:**

**Given** user views Dashboard (Control Center)
**When** stats section loads
**Then** displays:

- Tasks completed this week
- Success rate (completed / total)
- Average task duration
- Active PCs

**Given** viewing trends
**When** chart rendered
**Then** shows tasks over time
**And** toggle: day/week/month

---

### Story 12.3: Implement File Attachments

As an **engineer**,
I want **to attach files to tasks**,
So that **Claude has reference materials**.

**Acceptance Criteria:**

**Given** command palette open
**When** user clicks attachment icon
**Then** file picker opens
**And** accepts: images, text, code, PDF (max 25MB)

**Given** file selected
**When** task created
**Then** file uploads to R2/S3
**And** attachment reference stored with task

**Given** task has attachments
**When** Claude executes
**Then** attachments provided as context
