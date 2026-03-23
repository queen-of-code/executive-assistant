# Mom's Executive Assistant (MEA)

## Product Vision

**Tagline:** *Your life has a thousand moving parts. MEA tracks all of them.*

MEA is a life task management system built as a Claude Cowork/Claude Code plugin. It unifies every source of "things I need to do" — email inboxes, meeting notes, recurring schedules, and your own brain — into a single tracked backlog on GitHub Projects. You interact with it through three interfaces: Cowork (conversational), GitHub Projects (visual board), and Siri (voice). The intelligence layer classifies, prioritizes, and synthesizes. The code layer keeps it fast, cheap, and auditable.

This isn't an email scanner with a task list bolted on. It's a personal operating system for busy people who juggle work, kids, home, and side projects — and need nothing to fall through the cracks.

---

## System Architecture

```
                    ┌─────────────────────────────────┐
                    │         INTERFACES               │
                    │                                   │
                    │  Cowork     GitHub      Siri      │
                    │  (chat)    Projects    Shortcuts   │
                    │    │        (board)       │        │
                    └────┼──────────┼───────────┼────────┘
                         │          │           │
                         ▼          ▼           ▼
┌────────────────────────────────────────────────────────────┐
│                     MEA CORE ENGINE                        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                 INPUT CHANNELS                          │  │
│  │                                                          │  │
│  │  Email Scanner ─┐                                        │  │
│  │  Manual Input ──┤                                        │  │
│  │  Recurring Sched┤──▶ Classifier ──▶ Issue Creator        │  │
│  │  Meeting Notes ─┤    (3-tier)       (GitHub adapter)     │  │
│  │  Onboard Wizard─┘                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                 OUTPUT CHANNELS                          │  │
│  │                                                          │  │
│  │  Daily Briefing (/my-day)                                │  │
│  │  Task Completion (/done)                                 │  │
│  │  Weekly Review (/weekly-review)                          │  │
│  │  Status Dashboard (/mlea-status)                         │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │          GUARDRAIL CODE (TypeScript, no LLM)            │  │
│  │                                                          │  │
│  │  classify.ts │ dedup.ts │ state.ts │ recurring.ts        │  │
│  │  meeting-notes.ts │ fuzzy-match.ts │ tag-engine.ts       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │               STATE (JSON files, persisted)              │  │
│  │                                                          │  │
│  │  config │ processed-emails │ created-issues              │  │
│  │  recurring-tasks │ scan-log │ onboarded-domains          │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
         ▲                                    ▲
         │                                    │
    ~~email MCP                     GitHub Issues + Projects API
    (Gmail, Outlook)                (source of truth for all tasks)
```

**Key architectural principle:** GitHub Projects is the UI and the database. Every task, regardless of source, becomes a GitHub Issue on a Project board. Cowork is the brain. Siri is the voice. The code layer (`lib/`) handles everything deterministic. The LLM handles everything that requires judgment.

---

## The Three Interfaces

### 1. Cowork (Conversational — primary)

This is where the intelligence lives. All commands, the onboard wizard, daily briefing, task completion, and configuration happen here. Cowork sessions can read/write state files and call the GitHub API.

### 2. GitHub Projects (Visual Board — persistent)

The user's existing GitHub Project board is the source of truth. Columns map to statuses: Inbox, In Progress, Waiting On Someone, Done. Labels carry the multi-dimensional tags (domain, source, urgency, kid, etc.). Users can drag tasks between columns, add comments, and triage visually. This is also how the system works from any device with a browser.

**Reference board:** `github.com/users/queen-of-code/projects/5` (Melissa's existing board, already has a Waiting On Someone column).

### 3. Siri Shortcuts (Voice — mobile)

Apple Shortcuts that hit the GitHub API directly. No custom server needed.

Planned shortcuts:
- **"Hey Siri, add a life task"** — prompts for description, creates a GitHub Issue with `mlea/manual` label
- **"Hey Siri, what's my day"** — triggers a Shortcut that reads today's issues and speaks a summary
- **"Hey Siri, I finished [task]"** — closes the matching issue
- **"Hey Siri, remind me to [thing]"** — creates an issue with a due date

Each shortcut is a simple HTTP call to `api.github.com`. We document these and provide importable `.shortcut` files.

---

## Tagging System (Multi-Dimensional, Not Flat Categories)

Flat categories don't scale to real life. Instead, every task gets tagged along multiple orthogonal dimensions using GitHub Issue labels:

### Tag Dimensions

| Dimension | Prefix | Examples | Purpose |
|-----------|--------|----------|---------|
| Domain | `domain/` | `domain/work`, `domain/kids`, `domain/home`, `domain/finance`, `domain/health`, `domain/school` | What area of life |
| Source | `source/` | `source/email`, `source/manual`, `source/recurring`, `source/meeting-notes`, `source/wizard` | Where the task came from |
| Type | `type/` | `type/bill`, `type/meeting`, `type/action`, `type/info-request`, `type/schedule-change`, `type/assignment`, `type/performance`, `type/game` | What kind of task |
| Urgency | `urgency/` | `urgency/critical`, `urgency/high`, `urgency/medium`, `urgency/low` | How urgent |
| Timeline | `time/` | `time/has-due-date`, `time/recurring`, `time/someday`, `time/overdue` | When it matters |
| Person | `person/` | `person/timmy`, `person/sarah`, `person/self` | Who it's about (kids, self, etc.) |
| Status | `status/` | `status/waiting-on`, `status/delegated`, `status/blocked` | Special states beyond board columns |
| Mailbox | `mailbox/` | `mailbox/work`, `mailbox/personal` | Which inbox it came from |

### Example Task Tags

"Timmy's soccer game moved to Saturday" →
`domain/kids`, `person/timmy`, `type/schedule-change`, `source/email`, `mailbox/personal`, `time/has-due-date`

"Visa bill due March 31" →
`domain/finance`, `type/bill`, `source/email`, `mailbox/personal`, `urgency/medium`, `time/has-due-date`

"Fertilize citrus trees" →
`domain/home`, `type/action`, `source/recurring`, `time/recurring`

"Draft Q3 report (from meeting with Dave)" →
`domain/work`, `type/action`, `source/meeting-notes`, `urgency/high`, `time/has-due-date`

Tags are user-extensible. The `/onboard` wizard creates new tags as needed for each domain it sets up. The config stores the full tag registry so the classifier knows what's available.

---

## Input Channels

### Channel 1: Email Scanner

**What:** Scans multiple Gmail accounts on a schedule (default: 4x/day). Classifies emails using the 3-tier hybrid system. Creates GitHub Issues for actionable items.

**Incremental Scanning (critical design):**

The scanner never reads the entire inbox. It uses a `lastScanTimestamp` per mailbox (stored in `mea-state.json`) to query only for emails that arrived since the last run. This keeps each scan fast and cheap regardless of inbox size.

```
Regular run:
  Read lastScanTimestamp for this mailbox from mea-state.json
  Query Gmail: "after:{lastScanTimestamp}" (only new emails)
  Process results → update lastScanTimestamp = now

First run (no timestamp yet):
  Query Gmail: "is:unread" (reasonable starting set)
  Process results → set lastScanTimestamp = now

Catch-up run (laptop was asleep/closed):
  Identical to regular run — lastScanTimestamp is just older
  Naturally fetches more emails (correct behavior, nothing lost)
  Process results → update lastScanTimestamp = now

Explicit backfill (/scan-now --backfill [days]):
  Override query: "after:{N days ago}" regardless of lastScanTimestamp
  Process in batches of 50 (Gmail rate limit safety)
  Dedup layer prevents duplicate issues for already-processed emails
  Update lastScanTimestamp = now when complete
```

The dedup layer (`processed-emails.json`) makes this bulletproof. Even if timestamps overlap between runs, or a backfill re-scans emails we've already processed, every messageId is checked against the ledger before classification. Double-processing is impossible.

**Pipeline:**

1. **Fetch** — For each configured mailbox, query Gmail MCP using `after:{lastScanTimestamp}` for that mailbox. Fetch subject, sender, date, snippet, message ID. Cap at `maxEmailsPerRun` (default 50). If more are available, process the oldest first and pick up the rest on the next run.

2. **Deduplicate** — `lib/dedup.ts` checks each email's messageId against `processed-emails.json`. Pure code, no LLM. This is the safety net that makes incremental scanning, backfills, and catch-up runs all idempotent.

3. **Classify (3-Tier Hybrid):**

   **Tier 1 — Rule Engine (`lib/classify.ts`, no LLM):** Pattern-match against the user's configured keywords, sender patterns, and subject patterns using regex. If a category matches with multiple signal hits, assign it with high confidence (>0.8). Handles 60-70% of emails: bills from known billers, calendar invites, school notifications from known domains, etc.

   **Tier 2 — Structural Signals (`lib/classify.ts`, no LLM):** Check email metadata: Has a .ics attachment? Sender on VIP list? Subject contains a date? Reply to an already-classified thread? Is from a known meeting note service? This catches another 10-15%.

   **Tier 3 — LLM Classification (Haiku):** For the remaining ~20%, send email subject + first 500 chars to Haiku with a structured prompt that includes the user's tag registry. Returns `{ tags: string[], confidence: number, reasoning: string, suggestedUrgency: string, extractedDueDate: string | null }`.

4. **Create Issue** — Dedup against tracker, format title/body/labels, create via GitHub API, record in state.

### Channel 2: Manual Input (`/add-task`)

**What:** User tells Cowork to add a task directly. Supports natural language.

**Examples:**
- `/add-task fertilize the citrus trees by next Saturday`
- `/add-task Pick up Timmy's soccer cleats`
- `/add-task Review the Q3 budget — waiting on Dave's numbers first`

**Processing:** Parse with Haiku (lightweight — just extract: description, due date if mentioned, domain hints, people mentioned, whether it's waiting-on). Apply tags from the tag registry. Create issue. If the input is very simple ("buy milk"), skip the LLM entirely and just create the issue with `source/manual` and let the user add tags on the board if they care.

### Channel 3: Recurring Task Engine

**What:** Tasks that repeat on a known schedule. When you close one, the system auto-creates the next occurrence.

**State:** `recurring-tasks.json` stores the schedule:

```jsonc
{
  "recurring": [
    {
      "id": "fertilize-citrus",
      "title": "Fertilize citrus trees",
      "cadence": "every 2 months",
      "cronExpression": "0 9 1 */2 *",  // 1st of every other month
      "tags": ["domain/home", "type/action", "source/recurring", "time/recurring"],
      "nextDue": "2026-05-01",
      "lastCreated": "2026-03-01",
      "issueTemplate": {
        "body": "Time to fertilize the citrus trees. Use the citrus-specific fertilizer in the garage.",
        "assignToSelf": true
      }
    }
  ]
}
```

**Lifecycle:**
1. The scheduled scan checks `recurring-tasks.json` on every run.
2. If `nextDue` is within the lookahead window (default: 3 days), create the issue.
3. When the issue is closed (via board drag, `/done`, or Siri), a daily maintenance task detects the closure and calculates the next occurrence date.
4. Updates `nextDue` and `lastCreated` in state.

**Creation:** Recurring tasks are created via the `/onboard` wizard or manually via `/add-recurring`.

### Channel 4: Meeting Notes Extraction

**What:** Detects emails from meeting note services (Gemini, Otter, Fireflies, Copilot). Extracts action items assigned to the user. Creates issues.

**Detection:** `lib/meeting-notes.ts` matches sender against configured source patterns. Pure code.

**Extraction:** Sends full email body to Sonnet (accuracy matters here) with the user's `nameVariants`. Prompt asks for structured JSON: `{ actionItems: [{ task, dueDate, owner, context }], summary }`. Only items where `owner` matches a name variant become issues.

**Tags:** Meeting-sourced issues get `source/meeting-notes` plus whatever domain/type tags the LLM infers from context.

### Channel 5: Onboard Wizard (`/onboard`)

**What:** Solves the cold-start problem for new life domains. User says "I need to track gardening tasks" and the wizard interviews them to bootstrap the domain.

**Flow:**

1. User: `/onboard gardening`
2. Wizard asks domain-aware questions (the questions themselves are generated by Sonnet based on the domain name — so it knows to ask about climate zones and plant types for gardening, game schedules and team names for kids' sports, billing cycles for finance, etc.)
3. User answers 3-5 questions conversationally.
4. Wizard generates:
   - New tags for the tag registry (e.g., `domain/garden`, `type/fertilize`, `type/prune`, `type/plant`)
   - Recurring tasks with appropriate cadences
   - Email classification rules (sender patterns, keywords) if the domain has email sources
   - An initial set of one-time tasks if applicable
5. Wizard presents the plan: "I'll create 4 recurring tasks, add 3 new tags, and set up email rules for nursery newsletters. Sound good?"
6. On approval: creates everything, adds to config, creates initial issues.

**Why this matters:** Without the wizard, the user has to manually configure every keyword, sender pattern, and recurring task. With it, they describe their life domain in plain language and the system bootstraps itself. After onboarding, adding individual tasks is trivial.

---

## Output Features

### Daily Briefing (`/my-day`)

The killer feature. Runs on demand or as a scheduled morning task (default: 7am).

**Pulls from:**
- GitHub Issues due today (by due date label or milestone)
- Overdue issues (due date in the past, still open)
- Issues created since yesterday's briefing (new incoming)
- Recurring tasks due this week
- Issues in "Waiting On Someone" that have been sitting > N days
- Calendar events if integrated (future)

**Output:** Natural-language synthesis by Sonnet. Not a dump of issue titles — an actual briefing:

> Good morning, Melissa. You have 5 things on your plate today.
>
> **Must-do:** Your Visa bill ($247) is due today — I tagged it critical yesterday. Timmy has soccer practice at 4pm (moved from Thursday, heads up). You told yourself to send Dave the Q3 numbers and it's been 3 days.
>
> **On deck:** Sarah's science project materials need ordering by Friday. The citrus trees are due for fertilizer this week.
>
> **Waiting on:** You asked Dave for the budget breakdown 5 days ago — might be time to nudge.
>
> **New since yesterday:** 3 emails classified — 1 bill (water utility), 1 meeting request from Jenny, 1 info request from the school about field trip permission.

### Task Completion (`/done`)

**Three paths, all cheap:**

1. **Drag on board** — Move to Done column in GitHub Projects. Already works, zero code needed.
2. **Cowork** — `/done fertilize citrus`. `lib/fuzzy-match.ts` matches against open issue titles. No LLM for obvious matches (Levenshtein distance < threshold). Haiku for ambiguous ones ("did you mean 'Fertilize citrus trees' or 'Buy citrus fertilizer'?"). Closes the issue. If recurring, triggers next-occurrence creation.
3. **Siri** — "Hey Siri, I finished fertilizing" → Shortcut hits GitHub API → closes matching issue.

### Weekly Review (`/weekly-review`)

GTD-style guided review, run on demand or scheduled for Sunday mornings.

**Walks the user through:**
1. Here are all open issues. Any of these done? (batch close)
2. Here are issues with no due date. Want to set dates or mark as someday?
3. Here are items in Waiting On Someone > 7 days. Want to follow up?
4. Here are the recurring tasks coming up next week. Anything to adjust?
5. Any new domains or tasks to add?
6. Summary: You closed N tasks this week, have M open, N overdue.

### Status Dashboard (`/mlea-status`)

Quick health check: last scan time, next scheduled scan, emails processed this period, issues created by category, any errors, MCP connection health.

---

## Plugin File Structure

```
moms-executive-assistant/
├── .claude-plugin/
│   └── plugin.json                     # Plugin manifest
├── .mcp.json                           # MCP connector declarations
├── CONNECTORS.md                       # Tool-agnostic connector docs
├── README.md                           # User guide + Siri Shortcuts docs
│
├── commands/
│   ├── scan-now.md                     # Trigger immediate email scan
│   ├── configure-mea.md              # Initial setup wizard
│   ├── add-task.md                     # Manual task creation
│   ├── done.md                         # Mark task complete
│   ├── my-day.md                       # Daily briefing
│   ├── onboard.md                      # Domain onboarding wizard
│   ├── add-recurring.md                # Add a single recurring task
│   ├── mea-status.md                  # Status dashboard
│   ├── view-tasks.md                   # Query/filter tasks
│   └── weekly-review.md               # Guided weekly review
│
├── skills/
│   ├── email-scanner/
│   │   ├── SKILL.md                    # Email scan + classify pipeline
│   │   └── references/
│   │       ├── classification-rules.md
│   │       ├── urgency-scoring.md
│   │       └── meeting-notes.md
│   │
│   ├── task-manager/
│   │   ├── SKILL.md                    # Task lifecycle management
│   │   └── references/
│   │       ├── github-adapter.md
│   │       ├── recurring-tasks.md
│   │       ├── deduplication.md
│   │       └── tag-system.md
│   │
│   └── onboard-wizard/
│       ├── SKILL.md                    # Domain onboarding logic
│       └── references/
│           ├── wizard-question-generation.md
│           └── domain-bootstrapping.md
│
├── lib/                                # TypeScript guardrail code (no LLM)
│   ├── types.ts                        # Shared type definitions
│   ├── config.ts                       # Config schema + validation
│   ├── classify.ts                     # Tier 1 & 2 rule engine
│   ├── dedup.ts                        # Email + issue deduplication
│   ├── state.ts                        # State read/write helpers
│   ├── recurring.ts                    # Recurring task scheduler
│   ├── meeting-notes.ts               # Meeting note source detection
│   ├── fuzzy-match.ts                 # Task name matching for /done
│   ├── tag-engine.ts                  # Tag registry + validation
│   ├── github-adapter.ts             # GitHub Issues + Projects API
│   └── tsconfig.json
│
├── shortcuts/                          # Apple Siri Shortcuts
│   ├── add-life-task.shortcut
│   ├── whats-my-day.shortcut
│   ├── task-finished.shortcut
│   └── SETUP.md                        # How to install + configure
│
└── task-data/                          # Runtime state (persisted between runs)
    ├── mea-config.json               # User configuration
    ├── mea-state.json                # Runtime state + stats
    ├── processed-emails.json          # Email dedup ledger
    ├── created-issues.json            # Email→Issue mapping
    ├── recurring-tasks.json           # Recurring task schedules
    └── tag-registry.json              # All known tags + metadata
```

---

## Configuration Schema

```typescript
// lib/types.ts — core types (abbreviated, full version in code)

interface MEAConfig {
  version: string;
  userName: string;
  nameVariants: string[];               // For meeting note "assigned to me" matching

  mailboxes: Mailbox[];
  tagRegistry: TagRegistry;
  classificationRules: ClassificationRule[];
  urgencyRules: UrgencyRules;
  meetingNotes: MeetingNotesConfig;
  issueTracker: IssueTrackerConfig;
  scheduling: SchedulingConfig;
  recurringTasks: RecurringTask[];
}

interface Mailbox {
  id: string;                           // "work", "personal"
  label: string;
  email: string;
  defaultTags: string[];                // Tags auto-applied to emails from this box
}

interface TagRegistry {
  dimensions: Record<string, TagDimension>;
  // e.g., { "domain": { prefix: "domain/", tags: ["work","kids","home",...] } }
}

interface ClassificationRule {
  name: string;
  tags: string[];                       // Tags to apply when matched
  keywords: string[];
  senderPatterns: string[];             // Regex
  subjectPatterns: string[];            // Regex
  confidence: number;                   // 0-1, threshold for Tier 1
  dueDateExtraction: "subject" | "body" | "none";
}

interface RecurringTask {
  id: string;
  title: string;
  cadence: string;                      // Human-readable: "every 2 months"
  cronExpression: string;               // Machine-readable
  tags: string[];
  nextDue: string;                      // ISO date
  lastCreated: string;                  // ISO date
  issueTemplate: { body: string; assignToSelf: boolean };
}

interface IssueTrackerConfig {
  type: "github";                       // Future: "linear" | "jira" | "asana"
  github: {
    owner: string;                      // GitHub username
    repo: string;                       // Repository name
    projectNumber: number;              // GitHub Projects board number
    assignToSelf: boolean;
  };
}

interface SchedulingConfig {
  emailScan: {
    cronExpression: string;             // Default: "0 7,11,15,19 * * *"
    maxEmailsPerRun: number;            // Default: 50
    enabled: boolean;
  };
  dailyMaintenance: {
    cronExpression: string;             // Default: "0 6 * * *"
    enabled: boolean;
  };
  dailyBriefing: {
    cronExpression: string;             // Default: "0 7 * * 1-5"
    enabled: boolean;
  };
  backfill: {
    maxDays: number;                    // Default: 90, max for /scan-now --backfill
    batchSize: number;                  // Default: 50, emails per batch during backfill
  };
  pruning: {
    ledgerRetentionDays: number;        // Default: 90, how long to keep processed-emails entries
  };
}
```

---

## The Onboard Wizard — How It Works

The wizard is MEA's answer to the cold-start problem. Rather than requiring users to manually configure keywords, patterns, and recurring tasks for every area of their life, the wizard interviews them and bootstraps the domain.

### Example: `/onboard gardening`

**Step 1 — Domain Recognition**
The wizard uses Sonnet to generate domain-appropriate questions. For "gardening," it knows to ask about plants, climate, recurring maintenance, and tools. For "kids soccer," it would ask about team name, practice schedule, game days, and coach contact.

**Step 2 — Interview (3-5 questions)**

> What do you grow? (citrus, vegetables, flowers, herbs, etc.)
>
> What's your climate zone or general location?
>
> What recurring maintenance do you already know about? (fertilizing, pruning, watering schedules, seasonal planting)
>
> Do you get gardening-related emails? (nursery newsletters, seed orders, HOA landscaping notices)

**Step 3 — Generation**
Based on answers, the wizard generates:

- **Tags:** `domain/garden`, and whatever type-level tags make sense (`type/fertilize`, `type/water`, `type/plant`, `type/prune`)
- **Recurring tasks:** Fertilize citrus every 2 months. Prune roses in January. Start tomato seeds indoors in March. Etc., based on climate zone and plants.
- **Classification rules:** If the user mentioned nursery newsletters, add sender patterns for common nurseries. Add keywords like "order shipped," "planting guide," "seasonal sale."
- **Initial one-time tasks:** If any are implied ("I need to set up drip irrigation"), create them.

**Step 4 — Confirmation**

> Here's what I'll set up:
>
> 4 recurring tasks: Fertilize citrus (every 2 months), Prune roses (January), Start tomato seeds (March), Fall cleanup (October)
>
> 3 new tags: domain/garden, type/fertilize, type/seasonal
>
> 2 email rules: Catch emails from Armstrong Garden Centers and Peaceful Valley
>
> Want me to go ahead?

**Step 5 — Execution**
Creates all issues, updates config, adds to tag registry, adds classification rules.

### Other Domain Examples

- `/onboard kids-soccer` → asks about practice days, game schedule, team communication (TeamSnap? email?), coach name. Creates recurring "soccer practice" tasks, game-day reminders, rules for TeamSnap emails.
- `/onboard household-bills` → asks what bills you have, when they're due, whether they arrive by email. Creates recurring reminders for each bill cycle, email rules for each biller.
- `/onboard school` → asks which kids, what school, how does the school communicate (email? app?), any known assignment due dates. Sets up per-kid tags, email rules for school domains.

---

## Recurring Task Lifecycle

```
  ┌──────────────┐     scheduled scan or     ┌──────────────────┐
  │ recurring-    │──── /onboard wizard ─────▶│  GitHub Issue     │
  │ tasks.json    │     creates issue when    │  (open, tagged    │
  │               │     nextDue in window     │   time/recurring) │
  └──────────────┘                            └────────┬─────────┘
        ▲                                              │
        │                                              │ user closes via
        │    daily maintenance task                    │ board / /done / Siri
        │    detects closure, calculates               │
        │    next date, updates state                  ▼
        │                                     ┌──────────────────┐
        └─────────────────────────────────────│  GitHub Issue     │
                                              │  (closed)         │
                                              └──────────────────┘
```

The daily maintenance scheduled task runs once per day (e.g., 6am) and handles:
1. Check for closed recurring issues → create next occurrence
2. Check for recurring tasks approaching nextDue → create issue if not already created
3. Check for overdue issues → add `time/overdue` label
4. Check for stale waiting-on issues (>7 days) → flag for weekly review

---

## GitHub Adapter Details

### Why GitHub Issues + Projects

| Need | GitHub Provides |
|------|----------------|
| Cloud-hosted task database | Issues API |
| Visual task board with columns | Projects (board view) |
| Multi-device access | Web + mobile app |
| API access from anywhere | REST + GraphQL APIs |
| Labels/tags | Issue labels (unlimited) |
| Status columns | Project board columns |
| Assignment | Issue assignees |
| Due dates | Project date fields or issue milestones |
| Free | For public repos, or private repos on free plan |
| Siri-accessible | Via API + Apple Shortcuts |

### Adapter Interface (`lib/github-adapter.ts`)

```typescript
interface IssueTrackerAdapter {
  createIssue(params: CreateIssueParams): Promise<{ id: number; url: string }>;
  closeIssue(issueNumber: number): Promise<void>;
  findSimilar(title: string, windowDays: number): Promise<Issue[]>;
  addLabels(issueNumber: number, labels: string[]): Promise<void>;
  removeLabels(issueNumber: number, labels: string[]): Promise<void>;
  listIssues(filters: IssueFilters): Promise<Issue[]>;
  moveToColumn(issueNumber: number, columnName: string): Promise<void>;
}

interface CreateIssueParams {
  title: string;
  body: string;
  labels: string[];
  assignee?: string;
  dueDate?: string;
  projectColumnName?: string;          // e.g., "Inbox"
}

interface IssueFilters {
  state?: "open" | "closed" | "all";
  labels?: string[];                    // AND logic
  dueBefore?: string;                   // ISO date
  dueAfter?: string;
  createdAfter?: string;
  search?: string;                      // Free-text search
}
```

Phase 1 implements this for GitHub. The interface is designed so future adapters (Linear, Jira, Asana) slot in without changing any calling code.

---

## LLM Usage Strategy

| Task | Model | When Used | Cost Strategy |
|------|-------|-----------|---------------|
| Email classification (Tier 3) | Haiku | ~20% of emails (rules handle 80%) | Cheap, fast, batched |
| Manual task parsing (`/add-task`) | Haiku | Only for complex input with dates/people | Skip for simple "buy milk" tasks |
| Meeting note extraction | Sonnet | Every meeting note email | Accuracy critical, worth the cost |
| Daily briefing synthesis | Sonnet | Once per day (or on demand) | Reads issue list, synthesizes narrative |
| Onboard wizard questions | Sonnet | Only during onboarding (rare) | One-time per domain |
| Task completion matching | None / Haiku | Fuzzy-match in code first; Haiku only for ambiguous | Almost always free |
| Weekly review | Sonnet | Once per week | Synthesis + recommendations |

**Cost estimate for typical usage:** If you scan 4x/day across 2 accounts, process ~40 emails/day, 80% hit rules (free), 20% hit Haiku (~8 calls), plus 1 Sonnet briefing — that's roughly $0.02-0.05/day. Negligible.

---

## Scheduling & State Persistence

### How Cowork Scheduled Tasks Work

MEA runs on Cowork's scheduled tasks system. The following is based on Anthropic's published documentation (support.claude.com, March 2026).

**Confirmed facts:**
- Each scheduled task runs as its own independent Cowork session with access to connected MCP tools and plugins.
- Cowork can read and write local files on the user's machine. Outputs are delivered "directly to your file system."
- Scheduled task cadences use plain-language options: **hourly, daily, weekly, on weekdays, or manually**. There are no cron expressions exposed to users.
- Tasks skip if the computer is asleep or Claude Desktop is closed. When the computer wakes up or the app reopens, Cowork reruns the skipped task automatically (one rerun, not one per missed slot — exact rerun behavior beyond this is not documented).
- MCP connectors (Gmail, GitHub) are available to scheduled tasks, provided the user has already authenticated them.

**⚠️ OPEN UNKNOWN — File persistence across sessions:**

Anthropic's docs confirm that Cowork writes files to the local filesystem and those files persist on disk. However, the docs also state:

> *"Memory is supported within projects but is not retained across standalone Cowork sessions."*

And a GitHub issue (#31422) documents that files/skills written inside Cowork's per-session VM sandbox (`~/.config/Claude/local-agent-mode-sessions/...`) are **silently deleted when the session is cleaned up**.

The critical open question: **Does `task-data/` survive between scheduled runs?**

The answer depends on where Cowork writes those files:
- If the scheduled task writes to a real local path (e.g., the project folder on disk) → files persist ✅
- If the task runs in a VM sandbox and writes to a path inside that sandbox → files are deleted when the session ends ❌

**Working hypothesis:** MEA must be set up as a **Cowork Project** pointed at the repo directory. Cowork Projects have persistent local file storage and memory scoped to the project. Scheduled tasks created within a project should read/write the project's folder, which lives on disk outside the ephemeral session sandbox. This is the most plausible path to reliable `task-data/` persistence — but **it has not been verified with a working MEA install**. This must be tested before treating the JSON state approach as validated.

**Fallback if file persistence fails:** Move state to GitHub — write `mea-state.json` as a file commit to the MEA repo after each run, and read it via the GitHub API at the start of the next run. This is slower and uses more API calls but is guaranteed to work regardless of Cowork's local storage behavior.

### The "Computer Must Be On" Limitation

**Confirmed:** Scheduled tasks only fire when the computer is awake and Claude Desktop is open. If the laptop is closed, the task skips.

**Confirmed:** When the computer wakes up / app reopens, Cowork reruns the most recently skipped task automatically. (The docs say "run it automatically once your computer wakes up" — it does not specify whether all skipped runs fire or just one. We're treating it as one rerun per task based on the language used.)

**⚠️ GUESSED:** The architecture doc previously claimed Cowork checks a 7-day window and fires the most-recently-missed run. **This level of detail is not in Anthropic's docs** and should be treated as an educated guess until tested.

**Why this is still acceptable for MEA:** The `lastScanTimestamp` approach is robust regardless of how many catch-up runs fire. If only one catch-up runs, it uses `lastScanTimestamp` from the last successful run and fetches everything since then — so no emails are lost, just delayed. The delay is typically hours (overnight) not days, since the laptop opens every morning.

**Typical scenario (based on confirmed behavior only):**
```
Friday 7pm:  Last scheduled scan runs. lastScanTimestamp = Fri 7pm.
Sat–Sun:     Laptop closed. Scans skipped.
Monday 7am:  Laptop opens. Cowork reruns the skipped task.
             Task reads lastScanTimestamp = Fri 7pm.
             Queries Gmail: "after:Fri 7pm" → gets all weekend emails.
             Classifies and creates issues. Updates lastScanTimestamp.
```

**⚠️ GUESSED:** The ordering guarantee (maintenance runs before scan, scan before briefing) was assumed in the original architecture. Cowork does not document task execution order for multiple scheduled tasks firing at similar times. This needs testing.

### Scheduled Task Setup

Cowork's scheduler uses plain-language cadences. MEA requires three scheduled tasks, set up manually by the user via `/schedule` or the Scheduled sidebar in Cowork.

**⚠️ UNKNOWN:** Whether a plugin's `/configure-mlea` command can programmatically create scheduled tasks on the user's behalf, or whether the user must create them manually. Anthropic's plugin/skill documentation does not describe a mechanism for plugins to register scheduled tasks. Assume **manual setup** until proven otherwise.

### 1. Email Scan

**Cadence:** Daily (4x/day is not a native option — closest is hourly or daily)

**⚠️ GUESSED:** The architecture calls for 4x/day scanning. Cowork's scheduler only exposes hourly, daily, weekly, on weekdays, or manually. "4x/day" is not a listed option. Options:
- Use **hourly** (more frequent, more compute cost)
- Use **daily** (once per day, less ideal)
- Use **manual** (user triggers `/scan-now` themselves)

The right answer depends on what cadences Cowork actually exposes in its UI. **Needs verification.**

Self-contained prompt: reads config from `task-data/mea-config.json`, reads `lastScanTimestamp` per mailbox from `mea-state.json`, runs the email scan pipeline (fetch → dedup → classify → create issues), updates state files, reports a summary.

### 2. Daily Maintenance

**Cadence:** Daily (runs before the first email scan of the day)

Checks for: closed recurring tasks needing renewal, approaching recurring task due dates, overdue issues needing the `time/overdue` label, stale waiting-on issues.

### 3. Daily Briefing (optional)

**Cadence:** On weekdays (daily on weekdays)

Generates and delivers the `/my-day` briefing. Also triggerable on demand via the `/my-day` command.

### Multi-Device Considerations

If MEA runs on multiple machines (e.g., MacBook and iMac), each has its own `mea-state.json` and `processed-emails.json`. Both machines could scan the same emails. The dedup-against-GitHub-Issues layer prevents duplicate tasks. But it's wasteful.

**Recommendation:** Designate one machine as the scanner. Use other devices only for Cowork commands (`/my-day`, `/done`, `/add-task`) and the GitHub Projects board.

### Cloud Execution Paths (Phase 5+, if needed)

If "scan happens when I open my laptop" proves insufficient, two escalation paths exist:

**Option A — GitHub Actions Cron:**
A lightweight GitHub Action runs on a schedule in the cloud. It uses a Gmail service account (or OAuth refresh token stored as a GitHub Secret), runs the TypeScript classification code directly, and creates issues via the GitHub API. The classification logic (`lib/classify.ts`) is portable plain TypeScript. LLM calls (Tier 3) would need to hit the Claude API directly.

**Option B — Google Apps Script:**
Runs natively in Google's cloud. Direct Gmail access, zero infrastructure cost. Downside: separate JavaScript codebase, no easy Tier 3 LLM classification. Still handles 80%+ of emails with Tier 1+2.

Both are documented for future reference. For Phase 1-4, the Cowork scheduled task approach is the right starting point — with the file persistence caveat above.

---

## Commands Reference

| Command | What It Does | LLM Usage |
|---------|-------------|-----------|
| `/configure-mlea` | Initial setup wizard (accounts, tracker, schedule) | Sonnet (interactive) |
| `/scan-now [--backfill N]` | Trigger immediate scan; `--backfill 90` scans last 90 days | Haiku (Tier 3 only) |
| `/add-task [description]` | Create a task from natural language | Haiku (if complex) or none |
| `/done [task name]` | Mark a task complete | None (fuzzy match) or Haiku (ambiguous) |
| `/my-day` | Generate daily briefing | Sonnet |
| `/onboard [domain]` | Bootstrap a new life domain | Sonnet (interactive) |
| `/add-recurring [description]` | Add a single recurring task | Haiku |
| `/mlea-status` | Health check + stats | None |
| `/view-tasks [filter]` | Query tasks (today/week/overdue/urgent/domain) | None |
| `/weekly-review` | Guided weekly review | Sonnet (interactive) |

---

## State Files

All persisted in `task-data/` as JSON. Human-readable, debuggable, no dependencies. Scheduled tasks read and write these files — they are the only shared state between isolated runs.

| File | Purpose | Growth Pattern |
|------|---------|---------------|
| `mea-config.json` | User config (accounts, rules, tracker) | Updated by wizard/configure |
| `tag-registry.json` | All known tags + metadata | Grows with `/onboard` |
| `recurring-tasks.json` | Recurring task schedules | Grows with `/onboard` + `/add-recurring` |
| `mea-state.json` | Runtime state (last scan timestamps, stats, errors) | Overwritten each scan |
| `processed-emails.json` | Email dedup ledger (append-only) | Grows ~40 entries/day, pruned monthly |
| `created-issues.json` | Email→Issue ID mapping | Grows with issues created |

### `mea-state.json` Detail

This is the most critical file for incremental scanning. It stores the high-water mark for each mailbox:

```jsonc
{
  "mailboxes": {
    "work": {
      "lastScanTimestamp": "2026-03-22T19:00:00Z",  // Last successful scan
      "lastScanEmailCount": 12,                       // Emails fetched in last scan
      "lastScanIssuesCreated": 3,
      "lastScanErrors": []
    },
    "personal": {
      "lastScanTimestamp": "2026-03-22T19:00:00Z",
      "lastScanEmailCount": 8,
      "lastScanIssuesCreated": 2,
      "lastScanErrors": []
    }
  },
  "lastMaintenanceRun": "2026-03-22T06:00:00Z",
  "lastBriefingRun": "2026-03-22T07:00:00Z",
  "stats": {
    "totalEmailsScanned": 1847,
    "totalIssuesCreated": 312,
    "scansSinceInstall": 89,
    "tierBreakdown": { "tier1": 1402, "tier2": 241, "tier3": 204 },
    "categoryBreakdown": { "type/bill": 45, "type/action": 189, "type/meeting": 38 }
  }
}
```

**Write safety:** State writes use atomic write-then-rename to prevent corruption if a scan is interrupted. `lib/state.ts` handles this.

### `processed-emails.json` and Pruning

This is an append-only ledger. Each entry records the messageId, classification result, and which tier decided. It grows at ~40 entries/day for a typical user.

**Pruning:** A monthly maintenance step (triggered by the daily maintenance task on the 1st of each month) removes entries older than 90 days. Entries older than 90 days are no longer needed for dedup since Gmail's `after:` query won't reach them in normal scanning. Backfills explicitly re-check dedup, so pruned entries that get re-fetched during a backfill will be caught by the dedup-against-GitHub-Issues layer (checking for existing issues with matching references).

---

## Milestone Plan

### Phase 1: Foundation + Core Loop (est. 2 weeks)

**Goal:** Can scan email, create issues, add tasks manually, mark tasks done, and get a daily briefing.

| Deliverable | Details |
|-------------|---------|
| Plugin scaffold | `plugin.json`, `.mcp.json`, `CONNECTORS.md`, directory structure |
| TypeScript lib foundation | `types.ts`, `config.ts`, `state.ts`, `tag-engine.ts`, `github-adapter.ts` |
| `/configure-mlea` | Setup wizard: Gmail account(s), GitHub repo + project board, default tags |
| Email scanner (Tier 1 only) | `classify.ts`, `dedup.ts` — rule-based classification, email fetch via Gmail MCP |
| GitHub Issues adapter | Create issues with labels, query issues, close issues |
| `/scan-now` | Manual scan trigger |
| `/add-task` | Manual task creation with basic tag inference |
| `/done` | Task completion with `fuzzy-match.ts` |
| `/my-day` | Daily briefing (Sonnet synthesis of open issues) |
| `/mlea-status` | Basic health check |
| Scheduled email scan | Cron task via Cowork scheduled tasks |

**Exit criteria:** End-to-end flow works: scan Gmail → classify by rules → create GitHub Issues with tags → `/my-day` shows them → `/done` closes them.

### Phase 2: Intelligence + Recurring (est. 2 weeks)

**Goal:** Smart classification, recurring tasks, and the onboard wizard.

| Deliverable | Details |
|-------------|---------|
| Tier 2 structural classification | `.ics` detection, VIP senders, thread inheritance |
| Tier 3 LLM classification (Haiku) | For ambiguous emails, with confidence scoring |
| `/onboard` wizard | Domain bootstrapping with interview + generation |
| Recurring task engine | `recurring.ts`, auto-create on schedule, auto-renew on close |
| `/add-recurring` | Single recurring task creation |
| Daily maintenance task | Scheduled task for recurring renewal + overdue detection |
| Multiple Gmail accounts | Scan all configured mailboxes |
| Urgency escalation rules | VIP senders, keyword escalators |
| Due date extraction | From subject and body, via rules + Haiku fallback |

**Exit criteria:** `/onboard gardening` creates a full set of recurring tasks. Closing a recurring issue auto-creates the next one. LLM handles ambiguous emails correctly.

### Phase 3: Meeting Notes + Voice (est. 1.5 weeks)

**Goal:** Extract action items from meetings. Add Siri as an interface.

| Deliverable | Details |
|-------------|---------|
| Meeting note detection | `meeting-notes.ts` — sender pattern matching |
| Action item extraction (Sonnet) | Structured extraction with name-variant matching |
| Meeting action → issues | Tagged `source/meeting-notes` |
| Siri Shortcuts | `.shortcut` files for add-task, whats-my-day, task-finished |
| Shortcuts documentation | `SETUP.md` with install instructions |

**Exit criteria:** Meeting notes from Gemini/Otter produce tracked issues. Siri can add and complete tasks.

### Phase 4: Weekly Review + Polish (est. 1.5 weeks)

**Goal:** Complete the output side. Polish for daily use.

| Deliverable | Details |
|-------------|---------|
| `/weekly-review` | Guided review with batch close, stale detection, reprioritization |
| `/view-tasks` with filters | Query by date, domain, urgency, person, etc. |
| Error handling + retry | Graceful degradation when Gmail or GitHub is down |
| Config validation | Helpful errors when config is malformed |
| README + user guide | Full documentation |

**Exit criteria:** System is robust enough for daily unattended use. All 10 commands work. Error handling is solid.

### Phase 5: Marketplace Prep (est. 1 week)

**Goal:** Package for other users.

| Deliverable | Details |
|-------------|---------|
| Default config templates | Personas: exec, parent, freelancer, student |
| Onboard wizard domain hints | Pre-built question sets for common domains |
| Package as `.plugin` file | Ready for Cowork marketplace |
| Generalize for other trackers | Abstract adapter interface documented, GitHub is default |

**Total estimated timeline: ~8 weeks**

---

## Design Decisions & Rationale

**Why GitHub Issues + Projects instead of a custom database?**
It's already a cloud-hosted task database with a web UI, mobile app, API, and label system. Building a custom web app on Firebase would mean maintaining two things — the intelligence layer AND a UI — when GitHub already provides the UI. The Firebase site exists for queenofcode.com, and it's tempting to reuse that deployment infra, but it's solving a problem we don't have. If GitHub Projects ever becomes limiting (custom fields, better mobile, richer views), we can revisit. For now, it's free infrastructure that works from every device.

**Why TypeScript for the lib/ code?**
Type safety on the config schema, tag registry, and adapter interfaces catches bugs before they hit production. Static analysis means we can refactor confidently. The classification rules, dedup logic, and fuzzy matching are all places where types prevent subtle errors (e.g., passing a tag without its prefix).

**Why 3-tier classification instead of pure LLM?**
Cost (~$0.02/day vs ~$0.50/day for all-LLM), speed (rules are instant), and auditability (the `tier` field in the ledger shows exactly what decided). The tiered approach also means the system works even if the LLM API is down — Tier 1 rules still classify the obvious stuff.

**Why the onboard wizard instead of manual config?**
Cold-start is the adoption killer. Nobody wants to write regex patterns for their garden nursery's email domain. The wizard makes the system feel like it understands your life, not like you're programming a robot.

**Why incremental scanning instead of full inbox reads?**
A full inbox scan on every run would be slow, hit Gmail rate limits, and waste classification cycles on emails we've already processed. Instead, each mailbox tracks a `lastScanTimestamp` high-water mark. Regular scans only see new emails. The dedup ledger (`processed-emails.json`) provides a second safety layer — even if timestamps overlap or a backfill re-fetches old emails, messageId-level dedup prevents any double-processing. The backfill mode (`/scan-now --backfill 90`) is a separate path that intentionally overrides the timestamp for one-time historical processing, still protected by dedup.

**Why JSON files instead of SQLite?**
Cowork scheduled tasks run in isolated sessions and need filesystem-based state. JSON is human-readable (you can debug by just reading the file), has zero dependencies, and handles the scale perfectly (hundreds of tasks, not millions). If we ever need queries beyond what JSON allows, we can migrate — but that's a Phase 6+ problem.

**Why accept the "laptop must be on" limitation?**
Cowork scheduled tasks require the computer to be awake and the app open. This is a real constraint. But the catch-up mechanism (one catch-up run per task when the app reopens, covering up to 7 days of missed runs) combined with incremental scanning (the catch-up naturally fetches all emails since the last successful scan) means nothing is ever lost — just delayed. For a personal task system where the user opens their laptop every morning, this delay is typically a few hours at most. The morning catch-up run fires before the daily briefing, so the user's `/my-day` is always current. If this proves insufficient (e.g., the user needs real-time scanning while traveling with only a phone), the GitHub Actions or Google Apps Script cloud paths are documented as Phase 5+ escalation options.

**Why not a web dashboard on Firebase?**
Three words: maintenance burden ratio. The intelligence layer (scanning, classifying, onboarding, briefing) is the hard part and the valuable part. The UI is table stakes, and GitHub provides it for free. Building a custom dashboard doubles the surface area for half the value. Ship the brain first, add a pretty face later if GitHub isn't enough.

---

## Security & Privacy

- Email bodies are never stored in state — only subjects, senders, metadata, and snippets.
- LLM classification sees at most the first 500 characters of email body.
- Meeting note extraction sees the full body but does not persist it — only the extracted action items.
- OAuth for Gmail via MCP connector (no passwords in config).
- GitHub API tokens live in MCP config / environment, not in MEA config files.
- All state files are local to the user's machine (or Cowork session). Nothing is transmitted to third parties.
- Siri Shortcuts use a GitHub personal access token stored in the Shortcut itself (user controls scope).

---

## Open Questions for Phase 1 Kickoff

1. **Which GitHub repo and project number?** We'll wire up to your existing project board at `queen-of-code/projects/5`. Need the repo name for issues.
2. **Gmail accounts to start with?** We know `mbenua@gmail.com` — any others for Phase 1?
3. **First onboard domains beyond email defaults?** Gardening and kids seem like natural Phase 2 wizard targets. Any others?
4. **Briefing delivery preference?** Just in Cowork when you ask, or also as a scheduled notification?