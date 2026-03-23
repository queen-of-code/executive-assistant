# MEA – Agent & Contributor Guide

Mom's Executive Assistant (MEA) is a TypeScript project with an LLM intelligence layer. This file is the starting point for any AI agent or human contributor working in this repo.

---

## Current project status

> **Agents: read this before doing anything.** Only work on deliverables within the current phase. Do not implement features from future phases unless explicitly instructed.

| | Phase | Status | Summary |
|---|---|---|---|
| ▶ | **Phase 1 — Foundation + Core Loop** | ✅ Complete | Plugin scaffold, `lib/` foundation, email scanner (Tier 1), GitHub adapter, `/configure-mlea`, `/scan-now`, `/add-task`, `/done`, `/my-day`, `/mlea-status`, scheduled scan |
| ▶ | **Phase 2 — Intelligence + Recurring** | ✅ Complete | Tier 2/3 classification, `/onboard` wizard, recurring task engine, `/add-recurring`, daily maintenance task, multi-account scanning, urgency escalation, due date extraction |
| | **Phase 3 — Meeting Notes + Voice** | 🟡 In progress | Meeting note extraction, Siri Shortcuts |
| | Phase 4 — Weekly Review + Polish | Not started | `/weekly-review`, `/view-tasks`, error handling, README |
| | Phase 5 — Marketplace Prep | Not started | Config templates, package as `.plugin`, adapter generalization |

Full phase definitions — deliverables, exit criteria, and context — are in the [Milestone Plan section of the architecture doc](Project-Overview-Architecture.md#milestone-plan).

### Updating this status

**Updating this status tracker is part of the definition of done for completing a phase.** When all deliverables and exit criteria for a phase are met:

1. Change the completed phase row to `✅ Complete`.
2. Change the next phase row to `🟡 In progress`.
3. Commit the update as part of the phase-completion PR — not as a separate commit.

An agent must not declare a phase done without this file reflecting it.

---

## Project context

MEA is a personal life task management system. It unifies email, recurring schedules, manual input, and meeting notes into a single GitHub Projects board. The architecture is documented in [`Project-Overview-Architecture.md`](Project-Overview-Architecture.md) — read it before making structural changes.

**Core principle:** GitHub Projects is the UI *and* the database. Every task becomes a GitHub Issue. The `lib/` guardrail code handles all deterministic logic (classification, dedup, fuzzy matching, state). LLM calls are reserved for judgment-requiring tasks only.

---

## Agent rails

1. **Read the architecture doc first.** `Project-Overview-Architecture.md` is the ground truth. Don't contradict its decisions without flagging the conflict explicitly.
2. **Don't call LLMs for work that belongs in `lib/`.** Tier 1 and Tier 2 classification (`classify.ts`, `dedup.ts`, `fuzzy-match.ts`) are intentionally LLM-free. Keep them that way.
3. **Preserve idempotency.** The email scanner and recurring task engine are designed to be run multiple times safely. New features must not break this contract.
4. **State lives in JSON files.** Don't introduce a database. State is append-only or update-in-place on the files described in the architecture doc.
5. **No secrets in code.** All credentials (GitHub token, Gmail OAuth) flow through environment variables or config files excluded by `.gitignore`.
6. **TypeScript only in `lib/`.** No JavaScript files, no `any` types in guardrail code. Strict mode is on.

---

## Skills

This project uses [awesome-cursor](https://github.com/queen-of-code/awesome-cursor) skills for agent guidance. Install them if you're running Cursor or Claude Code with the skills plugin.

The skills relevant to this codebase:

| Skill | When to use |
|---|---|
| `git-workflow` | Any commit, branch, or PR operation. Enforces branch protection and commit message format. Always apply before committing. |
| `testing` | Writing or reviewing tests. This project requires `tool.test.ts` alongside every `tool.ts`; CI blocks PRs without them. |
| `work-tracking` | Breaking down features into issues and sub-tasks using GitHub Issues. Use when planning new capabilities. |
| `spec-management` | Creating or updating feature specs before implementation. New output features and input channels should have a spec. |
| `architecture` | Evaluating structural decisions — especially anything touching the 3-tier classifier, state files, or LLM/code boundaries. |
| `backend-saas` | API design, multi-tenancy patterns, and service boundaries. Relevant to the GitHub adapter and email MCP integration. |

---

## Workflow expectations

### Before implementing a new feature
1. Check `Project-Overview-Architecture.md` for an existing design decision that covers it.
2. If the feature adds a new input channel, output feature, or changes the classification pipeline — write or update a spec first (`spec-management` skill).
3. Break the work into GitHub Issues using the `work-tracking` skill. Use the parent/child issue pattern for anything with more than one logical step.

### Implementation
- Follow the TypeScript conventions already in `lib/`. New guardrail code must be pure functions with explicit input/output types.
- Tests are not optional. Every new `lib/` module needs a test file. The `testing` skill covers strategy.
- Keep LLM usage deliberate. When adding a new Haiku or Sonnet call, document the prompt inline and explain why code couldn't do the job.

### Committing and PRs
- Apply the `git-workflow` skill. Branch protection is enforced on `main`.
- Required commit format:
  ```
  <type>(<scope>): <brief description>

  <detailed description>

  Cursor-Task: <original task description>
  ```
- Valid types: `feat`, `fix`, `refactor`, `style`, `docs`, `test`, `infra`
- CI runs `npm run build` and `npm test` — both must pass before merge.

### Version bump on every PR

**Every PR must increment the minor version** in both files before merge. The marketplace uses this to show users that an update is available — without a version bump, Cowork won't know to offer a refresh.

Files to update:
- `.claude-plugin/plugin.json` → `"version"` field
- `package.json` → `"version"` field

Both must always match. Bump minor (the middle number): `0.2.0` → `0.3.0`. Include the bump in the same commit as the PR's changes, not as a separate commit.

If you forget: the user cannot tell a new version is available in the marketplace and has to manually force-refresh. Don't skip this.

---

## Key files and directories

| Path | Purpose |
|---|---|
| `Project-Overview-Architecture.md` | Full system design, tagging schema, all input/output channels |
| `lib/classify.ts` | Tier 1 & 2 rule-based classifier (no LLM) |
| `lib/dedup.ts` | Email dedup against processed-emails ledger |
| `lib/fuzzy-match.ts` | Fuzzy title matching for `/done` command |
| `lib/state.ts` | State file read/write abstraction |
| `lib/recurring.ts` | Recurring task schedule management |
| `lib/meeting-notes.ts` | Meeting note service detection and extraction |
| `lib/tag-engine.ts` | Tag registry management and label formatting |
| `state/` | JSON state files (config, processed-emails, created-issues, recurring-tasks) |
| `shortcuts/` | Importable Apple Shortcuts `.shortcut` files for Siri integration |

---

## What this project is not

- Not a general-purpose task manager SaaS — it's a personal tool designed around one user's life model
- Not a database-backed service — all state is flat JSON files in the repo or a config directory
- Not always-on — the email scanner runs on a schedule; nothing requires a persistent server
