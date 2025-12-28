# Narrative Studio - UI/UX Specification

**Version:** 1.0.0
**Date:** 2025-12-28
**Author:** NightShift Team

---

## Executive Summary

The **Narrative Studio** is a dedicated interface within NightShift for cinematic scriptwriting departments working on AAA game narratives. It provides a project-centric view of the narrative development pipeline, document versioning, and real-time progress tracking across all 8 narrative workflow agents.

---

## Design Philosophy

### Core Principles

1. **Pipeline Visibility** - Show the entire narrative workflow at a glance
2. **Document-Centric** - Treat each deliverable as a first-class entity
3. **Version Control** - Full history of document iterations
4. **Progress Clarity** - Know exactly where the project stands
5. **Non-Technical UX** - Designed for writers, not engineers

### Visual Theme

Extends the NightShift "technical blueprint" aesthetic with a **writer's room** warmth:
- Warmer accent colors (amber, rose) for creative work
- Paper/document metaphors for deliverables
- Timeline/journey visualization for progress
- Card-based layout for scannable overview

---

## Information Architecture

### Route Structure

```
/narrative-studio                    → Project list (Narrative Studio home)
/narrative-studio/new                → New project wizard
/narrative-studio/:projectId         → Project dashboard (pipeline view)
/narrative-studio/:projectId/docs    → Document library
/narrative-studio/:projectId/docs/:docId → Document viewer with versions
/narrative-studio/:projectId/timeline → Visual timeline view
```

### Data Model

```typescript
interface NarrativeProject {
  id: string;
  name: string;                    // "Operation Nightfall"
  logline: string;                 // One-sentence hook
  genre: string;                   // "Action-Thriller"
  estimatedRuntime: string;        // "90+ minutes"
  endingCount: number;             // 2
  createdAt: string;
  updatedAt: string;
  status: ProjectStatus;           // draft | in_progress | review | complete
  phase: ProjectPhase;             // foundation | structure | production | polish
  repoId?: string;                 // Associated repo for file storage
}

type ProjectStatus = "draft" | "in_progress" | "review" | "complete";
type ProjectPhase = "foundation" | "structure" | "production" | "polish";

interface NarrativeDocument {
  id: string;
  projectId: string;
  type: DocumentType;              // story_bible | world_bible | character_bible | etc.
  name: string;
  currentVersion: number;
  status: DocumentStatus;          // not_started | generating | draft | review | approved
  workflowId: string;              // Which workflow generated this
  taskId?: string;                 // Current/last task
  createdAt: string;
  updatedAt: string;
}

type DocumentType =
  | "story_bible"      // From Story Architect
  | "world_bible"      // From World Builder
  | "character_bible"  // From Character Architect
  | "plot_structure"   // From Plot Designer
  | "screenplay"       // From Cinematic Screenwriter
  | "dialogue_polish"  // From Dialogue Specialist
  | "directors_notes"  // From Cinematic Director
  | "editorial_report" // From Story Editor
  ;

type DocumentStatus = "not_started" | "generating" | "draft" | "review" | "approved";

interface DocumentVersion {
  id: string;
  documentId: string;
  version: number;
  content: string;                 // Markdown content
  taskId: string;                  // Task that generated this version
  createdAt: string;
  changesSummary?: string;         // What changed from previous version
}
```

---

## Page Designs

### 1. Narrative Studio Home (`/narrative-studio`)

**Purpose:** Overview of all narrative projects

#### Layout
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │  NARRATIVE STUDIO                                    [+ New Project]    │ │
│ │  Cinematic Scriptwriting Department                                      │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─── Stats Bar ─────────────────────────────────────────────────────────┐  │
│ │  📁 3 Projects  │  📝 12 Documents  │  ✅ 8 Approved  │  🔄 2 Active  │  │
│ └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ ┌─── Filter/Sort ───────────────────────────────────────────────────────┐  │
│ │  [All Phases ▼]  [All Status ▼]  [Search...                       🔍] │  │
│ └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ ┌─── Project Cards Grid ────────────────────────────────────────────────┐  │
│ │                                                                        │  │
│ │  ┌──────────────────────┐  ┌──────────────────────┐                   │  │
│ │  │ 🎬 Operation         │  │ 🎬 The Last          │                   │  │
│ │  │    Nightfall         │  │    Horizon           │                   │  │
│ │  │                      │  │                      │                   │  │
│ │  │ "A black ops team    │  │ "In a dying world,  │                   │  │
│ │  │  discovers..."       │  │  one pilot..."      │                   │  │
│ │  │                      │  │                      │                   │  │
│ │  │ ████████░░ 80%       │  │ ███░░░░░░░ 30%      │                   │  │
│ │  │                      │  │                      │                   │  │
│ │  │ Phase: Production    │  │ Phase: Foundation    │                   │  │
│ │  │ 6/8 docs approved    │  │ 2/8 docs started     │                   │  │
│ │  │                      │  │                      │                   │  │
│ │  │ Updated 2h ago       │  │ Updated 1d ago       │                   │  │
│ │  └──────────────────────┘  └──────────────────────┘                   │  │
│ │                                                                        │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Project Card Component
- **Header:** Project name with genre icon
- **Logline:** Truncated to 2 lines
- **Progress Bar:** Visual percentage with phase color
- **Phase Badge:** Current phase (Foundation/Structure/Production/Polish)
- **Document Status:** "X/8 docs approved"
- **Timestamp:** Last updated relative time
- **Hover Effect:** Subtle glow, slight lift

#### Color Coding by Phase
- **Foundation:** `violet-500` (building blocks)
- **Structure:** `sky-500` (architecture)
- **Production:** `amber-500` (active creation)
- **Polish:** `emerald-500` (finishing)

---

### 2. Project Dashboard (`/narrative-studio/:projectId`)

**Purpose:** Pipeline view showing all 8 workflow agents and their document status

#### Layout
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Back to Projects                                                          │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │  OPERATION NIGHTFALL                                                     │ │
│ │  "A black ops team discovers their own government is the enemy."        │ │
│ │                                                                          │ │
│ │  Action-Thriller  •  90+ min  •  2 Endings  •  Phase: Production        │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─── Pipeline View ─────────────────────────────────────────────────────┐  │
│ │                                                                        │  │
│ │  PHASE 1: FOUNDATION                                                   │  │
│ │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                    │  │
│ │  │ ✅ Story    │  │ ✅ World    │  │ ✅ Character│                    │  │
│ │  │   Architect │──│   Builder   │──│   Architect │                    │  │
│ │  │             │  │             │  │             │                    │  │
│ │  │ v3 Approved │  │ v2 Approved │  │ v2 Approved │                    │  │
│ │  └─────────────┘  └─────────────┘  └─────────────┘                    │  │
│ │         │                                  │                           │  │
│ │         └──────────────┬───────────────────┘                           │  │
│ │                        ▼                                               │  │
│ │  PHASE 2: STRUCTURE                                                    │  │
│ │  ┌─────────────────────────────┐                                       │  │
│ │  │ 🔄 Plot Designer            │                                       │  │
│ │  │                             │                                       │  │
│ │  │ Generating v1...  ████░░░░ │                                       │  │
│ │  │ Step 3/5: Scene Breakdown   │                                       │  │
│ │  └─────────────────────────────┘                                       │  │
│ │                        │                                               │  │
│ │                        ▼                                               │  │
│ │  PHASE 3: PRODUCTION                                                   │  │
│ │  ┌─────────────┐  ┌─────────────┐                                     │  │
│ │  │ ⏳ Cinematic │  │ ⏳ Dialogue │                                     │  │
│ │  │ Screenwriter│  │ Specialist  │                                     │  │
│ │  │             │  │             │                                     │  │
│ │  │ Not Started │  │ Not Started │                                     │  │
│ │  └─────────────┘  └─────────────┘                                     │  │
│ │                        │                                               │  │
│ │                        ▼                                               │  │
│ │  PHASE 4: POLISH                                                       │  │
│ │  ┌─────────────┐  ┌─────────────┐                                     │  │
│ │  │ ⏳ Cinematic │  │ ⏳ Story    │                                     │  │
│ │  │   Director  │  │   Editor    │                                     │  │
│ │  │             │  │             │                                     │  │
│ │  │ Not Started │  │ Not Started │                                     │  │
│ │  └─────────────┘  └─────────────┘                                     │  │
│ │                                                                        │  │
│ └────────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│ ┌─── Quick Actions ─────────────────────────────────────────────────────┐  │
│ │  [▶ Run Next Agent]  [📄 View All Docs]  [📊 Export Package]          │  │
│ └───────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Agent Card States

**Not Started (`⏳`)**
```
┌─────────────────────────┐
│ ⏳ Story Architect      │  ← Gray/muted
│                         │
│ Not Started             │
│                         │
│ [Start Agent ▶]         │  ← Primary action button
└─────────────────────────┘
```

**Generating (`🔄`)**
```
┌─────────────────────────┐
│ 🔄 Story Architect      │  ← Amber/pulsing
│                         │
│ Generating v1...        │
│ ████████░░░░ Step 2/3   │  ← Progress bar with step
│                         │
│ "Structure Design"      │  ← Current step name
│                         │
│ [View Progress]         │
└─────────────────────────┘
```

**Draft (`📝`)**
```
┌─────────────────────────┐
│ 📝 Story Architect      │  ← Sky/blue
│                         │
│ v2 Draft                │
│                         │
│ [Review] [Regenerate]   │
└─────────────────────────┘
```

**Approved (`✅`)**
```
┌─────────────────────────┐
│ ✅ Story Architect      │  ← Emerald/green
│                         │
│ v3 Approved             │
│                         │
│ [View] [New Version]    │
└─────────────────────────┘
```

**Needs Review (`⚠️`)**
```
┌─────────────────────────┐
│ ⚠️ Story Editor         │  ← Rose/red border
│                         │
│ Editorial Report Ready  │
│ 3 Critical Issues       │
│                         │
│ [Review Issues]         │
└─────────────────────────┘
```

---

### 3. Document Viewer (`/narrative-studio/:projectId/docs/:docId`)

**Purpose:** View document content with version history and approval workflow

#### Layout
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Back to Project                                                           │
│                                                                             │
│ ┌──────────────────────────────────────────┬────────────────────────────┐  │
│ │                                          │                            │  │
│ │  STORY BIBLE                             │  VERSION HISTORY           │  │
│ │  Operation Nightfall                     │                            │  │
│ │                                          │  ┌──────────────────────┐  │  │
│ │  Status: ✅ Approved                     │  │ v3 (current)         │  │  │
│ │  Version: 3                              │  │ ✅ Approved          │  │  │
│ │  Generated by: Story Architect           │  │ Dec 28, 2:30 PM     │  │  │
│ │                                          │  │                      │  │  │
│ │  ┌────────────────────────────────────┐  │  │ Changes: Added       │  │  │
│ │  │                                    │  │  │ branching paths      │  │  │
│ │  │  # Story Bible                     │  │  └──────────────────────┘  │  │
│ │  │                                    │  │                            │  │
│ │  │  ## Executive Summary              │  │  ┌──────────────────────┐  │  │
│ │  │                                    │  │  │ v2                   │  │  │
│ │  │  **Operation Nightfall** is a      │  │  │ 📝 Superseded        │  │  │
│ │  │  high-octane action thriller       │  │  │ Dec 27, 4:15 PM     │  │  │
│ │  │  that follows...                   │  │  └──────────────────────┘  │  │
│ │  │                                    │  │                            │  │
│ │  │  ## Thematic Framework             │  │  ┌──────────────────────┐  │  │
│ │  │                                    │  │  │ v1                   │  │  │
│ │  │  ### Central Theme                 │  │  │ 📝 Superseded        │  │  │
│ │  │  Trust must be earned...           │  │  │ Dec 26, 11:00 AM    │  │  │
│ │  │                                    │  │  └──────────────────────┘  │  │
│ │  │  ...                               │  │                            │  │
│ │  │                                    │  │                            │  │
│ │  └────────────────────────────────────┘  │                            │  │
│ │                                          │                            │  │
│ │  ┌────────────────────────────────────┐  │                            │  │
│ │  │ [📋 Copy] [📥 Export] [🔄 Regen]   │  │                            │  │
│ │  │ [✅ Approve] [💬 Request Changes]  │  │                            │  │
│ │  └────────────────────────────────────┘  │                            │  │
│ │                                          │                            │  │
│ └──────────────────────────────────────────┴────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Version History Card
- Version number with status badge
- Timestamp
- Changes summary (diff from previous)
- Click to view that version
- Compare button to diff two versions

#### Action Bar
- **Copy:** Copy markdown to clipboard
- **Export:** Download as .md, .pdf, or .fdx (Final Draft)
- **Regenerate:** Create new version with same or updated inputs
- **Approve:** Mark as approved (moves to next phase)
- **Request Changes:** Add feedback for regeneration

---

### 4. New Project Wizard (`/narrative-studio/new`)

**Purpose:** Guided setup for a new narrative project

#### Step 1: Basic Info
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  NEW NARRATIVE PROJECT                                         Step 1 of 3 │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │  Project Name *                                                       │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ Operation Nightfall                                             │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │  Logline * (The one-sentence hook)                                   │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ A black ops team discovers their own government is the enemy,  │  │  │
│  │  │ forcing them to become the very terrorists they were hunting.  │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                       │  │
│  │  Genre *                                                              │  │
│  │  ┌────────────────────┐                                              │  │
│  │  │ Action-Thriller  ▼ │                                              │  │
│  │  └────────────────────┘                                              │  │
│  │                                                                       │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│                                            [Cancel]  [Next: Scope →]       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Step 2: Scope
- Estimated cinematic runtime
- Number of endings
- Branching complexity level
- Target tone reference (games/films)

#### Step 3: Existing Materials (Optional)
- Upload treatment/outline
- Paste synopsis
- Link to reference documents
- Import from previous project

---

## Component Library

### New Components Needed

```
components/narrative/
├── NarrativeProjectCard.tsx      # Project card for list view
├── AgentPipelineView.tsx         # Full pipeline visualization
├── AgentCard.tsx                 # Individual agent status card
├── DocumentViewer.tsx            # Markdown document viewer
├── VersionHistoryPanel.tsx       # Version list with diff
├── VersionCard.tsx               # Individual version item
├── PhaseProgressBar.tsx          # Visual phase progress
├── DocumentStatusBadge.tsx       # Status indicator badges
├── NewProjectWizard.tsx          # Multi-step project creation
├── NarrativeStats.tsx            # Stats bar component
└── ExportDialog.tsx              # Export format selection
```

### Existing Components to Reuse

- `Container` - Page wrapper
- `Card` - Base card component
- `Badge` - Status badges
- `Button` - Action buttons
- `Dialog` - Modals
- `Tabs` - Tab navigation
- `Progress` - Progress bars
- `Tooltip` - Hover info
- `ResizablePanel` - Split views
- `Separator` - Visual dividers

---

## Interaction Patterns

### 1. Starting an Agent

```
User clicks [Start Agent ▶] on "Story Architect"
  ↓
Dialog opens with:
  - Current inputs (logline, synopsis)
  - Option to add/modify inputs
  - Confirm button
  ↓
Task created with workflow="story-architect"
  ↓
Agent card transitions to "Generating" state
  ↓
Real-time progress updates via polling
  ↓
On completion: Card shows "Draft" with [Review] button
```

### 2. Approving a Document

```
User clicks [✅ Approve] on document
  ↓
Confirmation dialog:
  "Approve Story Bible v3?"
  "This will unlock the next phase agents."
  ↓
Document status → "Approved"
  ↓
Dependent agents become available
  ↓
Phase progress updates
```

### 3. Requesting Changes

```
User clicks [💬 Request Changes]
  ↓
Feedback dialog opens:
  - Text area for notes
  - Checkbox: "Focus on specific sections"
  - Section selector (if checked)
  ↓
New task created with:
  - Original document as context
  - User feedback as additional input
  ↓
Agent regenerates with feedback
  ↓
New version created (v+1)
```

---

## Real-Time Updates

### Polling Strategy

```typescript
// Project list: 5s interval
useQuery({
  queryKey: ['narrative-projects'],
  refetchInterval: 5000,
});

// Project dashboard: 2s interval (for active generation)
useQuery({
  queryKey: ['narrative-project', projectId],
  refetchInterval: 2000,
});

// Document viewer: 3s interval
useQuery({
  queryKey: ['narrative-document', docId],
  refetchInterval: 3000,
});
```

### Live Progress Updates

When an agent is generating:
1. Poll task status every 2 seconds
2. Display current step name and progress
3. Show step completion with checkmarks
4. Animate progress bar smoothly

---

## Responsive Design

### Desktop (1024px+)
- Full pipeline view with all 8 agents visible
- Side-by-side document + version history
- Floating action buttons

### Tablet (768px - 1023px)
- Condensed pipeline (2 agents per row)
- Stacked document/version panels
- Bottom action bar

### Mobile (< 768px)
- Vertical pipeline (1 agent per row)
- Bottom sheet for document actions
- Swipe between versions
- FAB for primary action

---

## Accessibility

- All interactive elements keyboard accessible
- Focus indicators on agent cards
- Screen reader announcements for status changes
- High contrast mode support
- Reduced motion option for animations

---

## Future Enhancements

### Phase 2
- Collaborative editing (multiple users)
- Comment threads on documents
- Real-time presence indicators
- Slack/Discord notifications

### Phase 3
- AI-powered consistency checker
- Cross-document reference linking
- Character mention highlighting
- Scene navigation sidebar

### Phase 4
- Final Draft export with proper formatting
- Audio script generation for VO
- Storyboard integration
- Analytics dashboard (word count, scene count, etc.)
