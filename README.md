# Mom's Executive Assistant (MEA)

> *Your life has a thousand moving parts. MEA tracks all of them.*

MEA is a personal life task management plugin for [Claude Cowork](https://claude.com/cowork). It scans your Gmail (read-only), processes meeting notes, handles manual input, and turns everything into tracked tasks on a GitHub Projects board — your existing one, not a new app.

You interact with it through three interfaces:
- **Cowork** (chat commands) — the primary interface for everything
- **GitHub Projects** (visual board) — where all tasks live, accessible from any device
- **Siri Shortcuts** (voice) — add and complete tasks hands-free *(Phase 3)*

All your data is stored in systems you own — locally on your machine inside a Cowork Project, or in your own GitHub repo.

---

## Current status: Phase 2 complete

| Phase | Status | What it covers |
|---|---|---|
| Phase 1 — Foundation + Core Loop | ✅ Complete | Email scanning (rule-based), manual task entry, task completion, daily briefing, health check |
| Phase 2 — Intelligence + Recurring | ✅ Complete | Tier 2/3 LLM classification, recurring task engine, `/onboard` wizard, `/add-recurring`, daily maintenance task |
| Phase 3 — Meeting Notes + Voice | 🟡 In progress | Meeting note extraction, Siri Shortcuts |
| Phase 4 — Weekly Review + Polish | Not started | Weekly review, advanced filtering, error handling |
| Phase 5 — Marketplace Prep | Not started | Config templates, packaged plugin |

See [`AGENTS.md`](AGENTS.md) for the full phase tracker and contributor guide.

---

## Prerequisites

Before you can use MEA, you need:

1. **Claude Desktop** with a Pro, Max, Team, or Enterprise plan (required for Cowork and integrations)
2. **A Gmail account** you want MEA to scan
3. **A GitHub account** with:
   - A repository to create issues in (can be private)
   - A [GitHub Projects board](https://docs.github.com/en/issues/planning-and-tracking-with-projects) associated with that repo (or your account)
   - Your project board number (the number in the URL: `github.com/users/you/projects/5` → `5`)

---

## Installation

### Step 1 — Clone this repo

```bash
git clone https://github.com/queen-of-code/executive-assistant
cd executive-assistant
```

This repo directory will become your MEA workspace — all state files live here (in `task-data/`, which is `.gitignore`'d).

### Step 2 — Create a Cowork Project pointed at this folder

MEA relies on state files (`task-data/mea-state.json`, etc.) persisting between Cowork sessions. This requires running inside a **Cowork Project** — standalone Cowork sessions don't reliably persist local file writes.

1. Open Claude Desktop → switch to the **Cowork** tab
2. In the left sidebar, click **Projects** → **+**
3. Choose **Use an existing folder**
4. Select the `executive-assistant/` directory you cloned in Step 1
5. Name it something like "MEA" and click **Create**

All MEA tasks — setup, scans, briefings — should be run from inside this project.

### Step 3 — Connect Gmail (read-only)

MEA reads your email but **never writes to it**. The Gmail connector is scoped to `gmail.readonly` — it cannot send, archive, delete, or modify any email. See [`CONNECTORS.md`](CONNECTORS.md) for the full list of what is and isn't accessed.

1. Open Claude Desktop → **Settings** → **Integrations**
2. Click **Connect Gmail**
3. Sign in with the Google account(s) you want to scan
4. Authorize the read-only scope when prompted

Repeat for each Gmail account you want MEA to monitor.

### Step 4 — Connect GitHub

1. Open Claude Desktop → **Settings** → **Integrations**
2. Click **Connect GitHub**
3. Authorize with the account that owns your tasks repo

Or, if you prefer a personal access token:
```bash
export GITHUB_TOKEN=ghp_your_token_here
```
The token needs `repo` scope (to create and read issues).

### Step 5 — Install MEA as a plugin

**Option A: Local install (development / personal use)**

Inside Cowork, run:

```
/plugin marketplace add queen-of-code/executive-assistant
/plugin install moms-executive-assistant@queen-of-code
```

This adds the GitHub repo as a marketplace and installs the plugin from it.

**Option B: Load directly without installing (quickest for testing)**

Start Claude Code with the plugin directory:

```bash
claude --plugin-dir ./executive-assistant
```

Or inside an active Cowork session:

```
/plugin marketplace add ./executive-assistant
/plugin install moms-executive-assistant@executive-assistant
```

> **Note:** Once the repo is public on GitHub, Option A is the cleanest path. For now (private repo), Option B works as long as you're authenticated.

### Step 6 — Run the setup wizard

Inside your MEA Cowork Project, run:

```
/configure-mlea
```

This will ask you for:
- Your name and common name variants (used for meeting note matching in Phase 3)
- The Gmail address(es) to scan
- Your GitHub username, repo name, and Projects board number

It writes `task-data/mea-config.json` (`.gitignore`'d — never leaves your machine).

### Step 7 — Set up scheduled tasks

Cowork's scheduler doesn't support cron — it uses plain-language cadences. You need to create three tasks manually inside your MEA project.

In your MEA Cowork Project, click **Scheduled** in the sidebar → **+ New task** for each:

Each task has two separate text fields: a **Description** (a short human-readable label) and a **Prompt** (what Claude actually runs). Don't confuse them.

> **Critical:** In each task's **Advanced Options**, set **Project folder** to your MEA Cowork Project folder. This is what gives the task access to your persistent `task-data/` state. Without it, tasks run in a stateless scratch session and won't see your config or previous scan timestamps.

| Description | Cadence | Model | Prompt |
|---|---|---|---|
| MEA Email Scan | Daily (or Hourly) | **Sonnet** | `Run the MEA email scan using the email-scanner skill. Read config from task-data/mea-config.json.` |
| MEA Daily Maintenance | Daily | **Haiku** | `Run the MEA daily maintenance task. Check for closed recurring issues, approaching due dates, and overdue items.` |
| MEA Daily Briefing | On weekdays *(optional)* | **Sonnet** | `Run /my-day to generate my daily task briefing.` |

**Why those models:**
- **Email Scan → Sonnet.** Needs to reliably follow the multi-step skill pipeline. Calls Haiku internally for Tier 3 classification on ambiguous emails — you don't need Opus on top of that.
- **Daily Maintenance → Haiku.** Pure logic: check dates, flag overdue items, close resolved recurring tasks. No synthesis or judgment needed; Haiku is fast and cheap here.
- **Daily Briefing → Sonnet.** Generates a readable summary of your open tasks and schedule. Quality of the writing matters — Haiku produces noticeably worse output for this.

> **Note on scan frequency:** Cowork offers hourly or daily as the closest options to the ideal "a few times a day." Hourly is more responsive but uses more of your usage quota. Daily is conservative. Start with daily and adjust.

> **Note on schedule execution:** Cowork scheduled tasks only run when the Claude app is open and your computer is awake. They are not background daemons.

---

## Usage

Once configured, MEA's scheduled tasks handle email scanning, daily maintenance, and your morning briefing automatically. You can also trigger anything manually.

### Available commands

| Command | What it does |
|---|---|
| `/configure-mlea` | First-time setup or update configuration |
| `/scan-now` | Trigger an immediate email scan |
| `/scan-now --backfill 30` | Scan the last 30 days of email (safe to run multiple times) |
| `/add-task <description>` | Add a task manually from natural language |
| `/done <task name>` | Mark a task complete (fuzzy-matched against open issues) |
| `/my-day` | Get your daily briefing |
| `/mlea-status` | Health check — last scan times, counts, connector status |
| `/onboard <domain>` | Bootstrap a new life domain with recurring tasks, tags, and email rules |
| `/add-recurring <description>` | Add a single recurring task |

### How tasks end up in GitHub Projects

Every task — whether from email, a manual `/add-task`, or a recurring schedule — becomes a GitHub Issue on your configured board. Labels carry multi-dimensional tags:

| Tag dimension | Examples |
|---|---|
| `domain/` | `domain/work`, `domain/kids`, `domain/home`, `domain/finance` |
| `type/` | `type/bill`, `type/action`, `type/meeting` |
| `urgency/` | `urgency/critical`, `urgency/high`, `urgency/medium` |
| `time/` | `time/has-due-date`, `time/overdue`, `time/recurring` |
| `source/` | `source/email`, `source/manual`, `source/recurring` |

You can filter and sort the board by any of these. You can also just drag tasks between columns like any normal GitHub Projects board.

---

## How email scanning works

MEA uses **incremental scanning** — it never reads your entire inbox. Each scan only looks at emails that arrived since the last run, using a high-water timestamp stored in `task-data/mea-state.json`.

Classification is **rule-first, LLM-second**:
- ~70% of emails are classified by regex rules (Tier 1 — fast, free, auditable)
- ~15% are classified by structural signals (Tier 2 — calendar invites, VIP senders, date in subject)
- The remaining ~15% use Haiku for lightweight LLM classification (Tier 3)

Email bodies are never stored. MEA reads subject, sender, date, and a short snippet only.

**If your laptop is closed**, scans are missed but nothing is lost. When Claude Desktop reopens, Cowork reruns the skipped task automatically. Because MEA uses `lastScanTimestamp`, the catch-up run fetches everything since the last successful scan in one batch.

---

## Privacy

- Email bodies are never stored in state
- LLM classification sees at most the first 500 characters of an email snippet (Tier 3 only)
- All state files stay on your local machine (`task-data/`)
- Nothing is transmitted to third parties beyond what the Gmail and GitHub API calls require
- OAuth for Gmail uses `gmail.readonly` scope — MEA has no write access to your email

See [`CONNECTORS.md`](CONNECTORS.md) for the full breakdown of what each connector can and cannot do.

---

## Repository structure

```
├── .claude-plugin/
│   ├── plugin.json              Plugin manifest
│   └── marketplace.json         GitHub marketplace catalog (install via /plugin marketplace add)
├── .mcp.json                    Connector declarations
├── AGENTS.md                    Phase tracker + contributor guide
├── CONNECTORS.md                What each connector can/cannot do
│
├── commands/                    Slash command definitions (Cowork reads these)
│   ├── configure-mea.md
│   ├── scan-now.md
│   ├── add-task.md
│   ├── done.md
│   ├── my-day.md
│   ├── mea-status.md
│   ├── onboard.md
│   ├── add-recurring.md
│   └── daily-maintenance.md
│
├── lib/                         TypeScript guardrail code (no LLM)
│   ├── types.ts                 All core interfaces
│   ├── config.ts                Config schema + validation
│   ├── state.ts                 Atomic JSON state read/write
│   ├── tag-engine.ts            Tag registry management
│   ├── github-adapter.ts        GitHub Issues + Projects API
│   ├── classify.ts              Tier 1 & 2 classifier + Tier 3 prompt builder
│   ├── dedup.ts                 Email dedup (two-layer)
│   ├── fuzzy-match.ts           Fuzzy task title matching for /done
│   └── recurring.ts             Recurring task scheduler
│
├── skills/                      Cowork skill definitions
│   ├── email-scanner/SKILL.md
│   ├── task-manager/SKILL.md
│   └── onboard-wizard/SKILL.md
│
└── task-data/                   Runtime state (local only, .gitignore'd)
    ├── mea-config.template.json  Starter template — copy to mea-config.json
    └── README.md
```

---

## Contributing

See [`AGENTS.md`](AGENTS.md) for contributor rails, the skills table, and workflow expectations. The short version:

- No direct commits to `main` — use a feature branch
- Every `lib/` module needs a test file — CI blocks without it
- Don't add LLM calls to `lib/` — that code is intentionally LLM-free
- Run `npm run build && npm test` before opening a PR
