# Mother's Little Executive Assistant (MLEA)

> *Your life has a thousand moving parts. MLEA tracks all of them.*

MLEA is a personal life task management plugin for [Claude Cowork](https://claude.com/cowork). It scans your Gmail (read-only), processes meeting notes, handles manual input, and turns everything into tracked tasks on a GitHub Projects board — your existing one, not a new app.

You interact with it through three interfaces:
- **Cowork** (chat commands) — the primary interface for everything
- **GitHub Projects** (visual board) — where all tasks live, accessible from any device
- **Siri Shortcuts** (voice) — add and complete tasks hands-free *(Phase 3)*

All your data is stored in systems you own — locally on your machine inside a Cowork Project, or in your own GitHub repo.

---

## Current status: Phase 1 complete

| Phase | Status | What it covers |
|---|---|---|
| Phase 1 — Foundation + Core Loop | ✅ Complete | Email scanning (rule-based), manual task entry, task completion, daily briefing, health check |
| Phase 2 — Intelligence + Recurring | 🟡 In progress | Smart LLM classification, recurring tasks, domain onboarding wizard |
| Phase 3 — Meeting Notes + Voice | Not started | Meeting note extraction, Siri Shortcuts |
| Phase 4 — Weekly Review + Polish | Not started | Weekly review, advanced filtering, error handling |
| Phase 5 — Marketplace Prep | Not started | Config templates, packaged plugin |

See [`AGENTS.md`](AGENTS.md) for the full phase tracker and contributor guide.

---

## Prerequisites

Before you can use MLEA, you need:

1. **Claude Desktop** with a Pro, Max, Team, or Enterprise plan (required for Cowork and integrations)
2. **A Gmail account** you want MLEA to scan
3. **A GitHub account** with:
   - A repository to create issues in (can be private)
   - A [GitHub Projects board](https://docs.github.com/en/issues/planning-and-tracking-with-projects) associated with that repo (or your account)
   - Your project board number (the number in the URL: `github.com/users/you/projects/5` → `5`)

---

## Installation

### Step 1 — Connect Gmail (read-only)

MLEA reads your email but **never writes to it**. The Gmail connector is scoped to `gmail.readonly` — it cannot send, archive, delete, or modify any email. See [`CONNECTORS.md`](CONNECTORS.md) for the full list of what is and isn't accessed.

1. Open Claude Desktop → **Settings** → **Integrations**
2. Click **Connect Gmail**
3. Sign in with the Google account(s) you want to scan
4. Authorize the read-only scope when prompted

Repeat for each Gmail account you want MLEA to monitor.

### Step 2 — Connect GitHub

1. Open Claude Desktop → **Settings** → **Integrations**
2. Click **Connect GitHub**
3. Authorize with the account that owns your tasks repo

Or, if you prefer a personal access token:
```bash
export GITHUB_TOKEN=ghp_your_token_here
```
The token needs `repo` scope (to create and read issues).

### Step 3 — Install MLEA as a Cowork plugin

In Claude Desktop, open Cowork and run:

```
/install-plugin https://github.com/queen-of-code/executive-assistant
```

Or clone and load locally:

```bash
git clone https://github.com/queen-of-code/executive-assistant
```

Then in Cowork: **Settings** → **Plugins** → **Load from folder** → select the cloned directory.

### Step 4 — Run the setup wizard

In Cowork, run:

```
/configure-mlea
```

This will ask you for:
- Your name and common name variants (used for meeting note matching in Phase 3)
- The Gmail address(es) to scan
- Your GitHub username, repo name, and Projects board number
- Your timezone and briefing schedule preferences

It writes `task-data/mlea-config.json` (which is `.gitignore`d — your personal config never leaves your machine) and creates three scheduled Cowork tasks.

---

## Usage

Once configured, MLEA runs automatically. The scheduled tasks handle email scanning (4×/day), daily maintenance (6am), and your morning briefing (7am weekdays).

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

### How tasks end up in GitHub Projects

Every task — whether from email, a manual `/add-task`, or (Phase 2) a recurring schedule — becomes a GitHub Issue on your configured board. Labels carry multi-dimensional tags:

| Tag dimension | Examples |
|---|---|
| `domain/` | `domain/work`, `domain/kids`, `domain/home`, `domain/finance` |
| `type/` | `type/bill`, `type/action`, `type/meeting` |
| `urgency/` | `urgency/critical`, `urgency/high`, `urgency/medium` |
| `time/` | `time/has-due-date`, `time/overdue`, `time/recurring` |
| `source/` | `source/email`, `source/manual` |

You can filter and sort the board by any of these. You can also just drag tasks between columns like any normal GitHub Projects board.

---

## How email scanning works

MLEA uses **incremental scanning** — it never reads your entire inbox. Each scan only looks at emails that arrived since the last run, using a high-water timestamp stored in `task-data/mlea-state.json`.

Classification is **rule-first, LLM-second**:
- ~70% of emails are classified by regex rules (fast, free, auditable)
- The remaining ~30% use Haiku for lightweight LLM classification *(Phase 2)*

Email bodies are never stored. MLEA reads subject, sender, date, and a short snippet (~200 chars) only.

**If your laptop is closed**, scans are missed but nothing is lost. When Claude Desktop reopens, a catch-up run fetches everything since the last successful scan using the stored timestamp.

---

## Privacy

- Email bodies are never stored in state
- LLM classification sees at most the first 500 characters of an email body *(Phase 2)*
- All state files stay on your local machine (`task-data/`)
- Nothing is transmitted to third parties beyond what the Gmail and GitHub API calls require
- OAuth for Gmail uses `gmail.readonly` scope — MLEA has no write access to your email

See [`CONNECTORS.md`](CONNECTORS.md) for the full breakdown of what each connector can and cannot do.

---

## Repository structure

```
├── .claude-plugin/plugin.json   Plugin manifest
├── .mcp.json                    Connector declarations
├── AGENTS.md                    Phase tracker + contributor guide
├── CONNECTORS.md                What each connector can/cannot do
│
├── commands/                    Slash command definitions (Cowork reads these)
│   ├── configure-mlea.md
│   ├── scan-now.md
│   ├── add-task.md
│   ├── done.md
│   ├── my-day.md
│   └── mlea-status.md
│
├── lib/                         TypeScript guardrail code (no LLM)
│   ├── types.ts                 All core interfaces
│   ├── config.ts                Config schema + validation
│   ├── state.ts                 Atomic JSON state read/write
│   ├── tag-engine.ts            Tag registry management
│   ├── github-adapter.ts        GitHub Issues + Projects API
│   ├── classify.ts              Tier 1 rule-based classifier
│   ├── dedup.ts                 Email dedup (two-layer)
│   └── fuzzy-match.ts           Fuzzy task title matching for /done
│
├── skills/                      Cowork skill definitions
│   ├── email-scanner/SKILL.md
│   └── task-manager/SKILL.md
│
└── task-data/                   Runtime state (local only, .gitignore'd)
    ├── mlea-config.template.json  Starter template — copy to mlea-config.json
    └── README.md
```

---

## Contributing

See [`AGENTS.md`](AGENTS.md) for contributor rails, the skills table, and workflow expectations. The short version:

- No direct commits to `main` — use a feature branch
- Every `lib/` module needs a test file — CI blocks without it
- Don't add LLM calls to `lib/` — that code is intentionally LLM-free
- Run `npm run build && npm test` before opening a PR
