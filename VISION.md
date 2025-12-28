# NightShift Vision

**Version:** 1.0
**Last Updated:** 2025-12-28

---

## Mission Statement

**NightShift transforms idle developer workstations into an autonomous AI workforce, enabling engineering teams to wake up to completed code tasks, reviewed PRs, and solved problems.**

---

## Core Philosophy

### "Start Local, Scale to Team"

NightShift provides immediate value to a single engineer without any infrastructure setup, then seamlessly scales to team-wide task distribution when ready.

1. **Zero Friction Entry** - Download, run, use. No servers, no config, no learning curve.
2. **Immediate Value** - Useful from day one in standalone mode.
3. **Seamless Upgrade** - Connect to team Control Center without migration.
4. **Local-First** - Your machine, your repos, your credentials. Nothing leaves your PC.

### Fire-and-Forget Automation

Engineers shouldn't babysit AI agents. NightShift is designed for:
- Submit tasks before leaving work
- Wake up to completed PRs
- Review AI-generated code as part of normal workflow

### Safety by Default

All AI-generated changes go through standard code review:
- Every change creates a PR (never direct commits to main)
- Full session logs for auditability
- Self-triaging agents that know when to ask for help

---

## Target Users

### Primary: Game Engineers
- Working with massive repositories (200GB+ Unreal Engine)
- Have fully configured dev environments on their workstations
- Want to leverage overnight idle time for automation
- Prefer reviewing PRs over babysitting AI

### Secondary: Tech Leads & Managers
- Need visibility into AI automation across team
- Want to prioritize and route tasks intelligently
- Track productivity gains and success metrics

### Tertiary: Non-Technical Team Members
- Designers, QA, producers who want to request code changes
- Need simple web UI without CLI expertise
- Want clear feedback on task progress

---

## Strategic Principles

### 1. Daemon-First Architecture
The daemon is the product. Everything else (Control Center, cloud sync) is optional enhancement.

**Why:**
- Large repos can't be cloned on-demand (200GB+)
- Engineer machines already have everything configured
- Works offline, works in air-gapped environments
- No infrastructure team needed to get started

### 2. Workflow-Driven Execution
Tasks execute through multi-step workflows with full context preservation across steps.

**Why:**
- Complex tasks need structured approaches (investigate → plan → implement → verify)
- Single-step prompts lack rigor for production-quality work
- Workflows encode best practices and quality gates
- Enables model switching per step (Opus for analysis, Sonnet for execution)

### 3. Quality Over Quantity
Better to complete 5 tasks excellently than 20 tasks poorly.

**Why:**
- Engineers lose trust if AI produces buggy code
- Time reviewing bad PRs erases productivity gains
- Self-triaging (marking tasks as "needs human") preserves quality
- 70%+ success rate is the minimum viable threshold

### 4. Transparent Execution
Every action is logged, every decision is traceable.

**Why:**
- Engineers need to understand what the AI did
- Debugging failed tasks requires full context
- Audit trails for compliance and security
- Learning from AI behavior improves future tasks

### 5. Repository Safety
Never interfere with human work in progress.

**Why:**
- Engineers may have uncommitted changes
- Dirty working trees can cause merge conflicts
- Direct mode (large repos) requires exclusive access
- Worktree mode (smaller repos) enables parallel execution

---

## Success Metrics

| Metric | Target | Rationale |
|--------|--------|-----------|
| Time to first task | <5 min | Zero friction onboarding |
| Tasks completed per night | 10+ | Meaningful overnight productivity |
| Task success rate | >70% | Quality threshold for trust |
| Average task duration | <2 hours | Fast feedback loop |
| Engineer time saved/week | 10+ hours | Measurable ROI |
| PC utilization (scheduled hours) | >80% | Maximize idle time usage |

---

## Workflow Philosophy

Workflows are the core innovation of NightShift. They transform simple prompts into rigorous, multi-step execution with quality gates.

### Workflow Characteristics

1. **Structured Approach** - Each workflow encodes best practices for its task type
2. **Context Preservation** - Full conversation history flows across steps
3. **Model Flexibility** - Use the right model for each step (Opus for analysis, Sonnet for execution)
4. **Quality Gates** - Tests must pass, verification steps are mandatory
5. **Sub-Agent Leverage** - Parallelize work using Explore and general-purpose agents

### Built-in Workflow Categories

| Category | Purpose | Example Workflows |
|----------|---------|-------------------|
| **Task Execution** | Quick, focused work | Quick Task |
| **Bug Fixing** | Investigation and repair | Investigate and Fix |
| **Code Quality** | Refactoring and improvement | Quality Refactor |
| **Feature Work** | New functionality | Feature Implementation |
| **Testing** | Test creation and expansion | Test Generation |
| **Documentation** | Docs and comments | Documentation Generator |
| **Review & Audit** | Code review and security | Code Review, Security Audit |
| **Maintenance** | Upgrades and migrations | Dependency Upgrade, Migration |

### Workflow Design Principles

1. **Read before write** - Always analyze before making changes
2. **Test before and after** - Verify current state, verify after changes
3. **Incremental execution** - Small, verifiable steps with rollback
4. **Clear deliverables** - Each step produces documented output
5. **Fail gracefully** - Know when to stop and ask for help

---

## Phased Roadmap

### Phase 0: Standalone Value
Single engineer productivity without infrastructure.
- Local daemon with embedded web UI
- Local task queue (SQLite)
- Workflow-based execution
- Auto-update mechanism

### Phase 1: Connected Mode
Team-scale task distribution.
- Control Center web app
- Remote task queue with routing
- OAuth authentication
- Slack notifications

### Phase 2: Production Hardening
Reliable team-wide usage.
- Full task lifecycle (cancel, retry, clarify)
- Priority-based routing
- Dashboard analytics

### Phase 3: Advanced Features
Power user capabilities.
- Git worktree for parallel execution
- Live output streaming
- Custom system prompts
- Task templates

### Phase 4: Enterprise
Large organization deployment.
- CI/GitHub Actions integration
- Cost tracking
- SSO integration
- On-premise Control Center

---

## Technical Non-Negotiables

1. **SQLite for local storage** - Embedded, zero-config, crash recovery
2. **Single binary distribution** - No dependencies, no runtime installation
3. **localhost-only web UI** - No network exposure by default
4. **Credentials never leave PC** - API keys, git auth stay local
5. **PR-based workflow** - All changes go through review process

---

## Anti-Patterns to Avoid

1. **Over-automation** - Don't try to replace engineers, augment them
2. **Magic black boxes** - All AI actions must be transparent and logged
3. **Premature complexity** - Keep standalone mode simple
4. **Cloud dependency** - Core functionality must work offline
5. **Unsafe defaults** - Always prefer caution (dirty tree detection, repo locks)

---

## Alignment Checklist

When designing new features or workflows, verify alignment:

- [ ] Does it work in standalone mode (no server required)?
- [ ] Does it preserve engineer review in the loop?
- [ ] Is execution transparent and auditable?
- [ ] Does it respect repository safety constraints?
- [ ] Does it follow the workflow philosophy (structured steps, quality gates)?
- [ ] Does it provide immediate value without configuration?
- [ ] Does it fail gracefully when uncertain?

---

## Appendix: Key Terms

| Term | Definition |
|------|------------|
| **Daemon** | Background service on engineer workstations |
| **Workflow** | Multi-step task execution template with prompts |
| **Control Center** | Optional team web app for task distribution |
| **Session** | Full Claude conversation log from task execution |
| **Worktree Mode** | Parallel execution via Git worktrees (smaller repos) |
| **Direct Mode** | In-place execution for large repos (one task at a time) |
| **Self-Triaging** | Agent ability to mark tasks as "needs human" |
