# Daily Maintenance Scheduled Task

**This is a scheduled Cowork task, not a user-facing command.** It is set up manually by the user in the Cowork Scheduled Tasks panel (or via `/schedule`), scoped to the MEA Cowork Project.

## Cadence
**Daily** — set to run once per day, before the email scan task.

> ⚠️ **Note:** Cowork's scheduler exposes plain-language cadences (hourly, daily, weekly, on weekdays, manually) — not cron expressions. The desired behavior is "daily, early morning." Exact time control within a daily cadence may be limited to what Cowork's UI exposes. The ordering relative to the email scan task is not guaranteed by the scheduler; the task prompt should be written defensively (i.e., it doesn't assume the scan hasn't already run).

## Purpose
Handles all recurring lifecycle management:
1. Advance recurring task schedules when their issues have been closed
2. Create new issues for recurring tasks due within the lookahead window
3. Label overdue issues with `time/overdue`
4. Flag stale "waiting on" issues for the weekly review

This task fires before the email scan (7am) and the daily briefing (7am), so the board is current before the user's morning context.

## Implementation guide

> ⚠️ **State persistence assumption:** Steps below assume `task-data/` files written in one Cowork session are readable in the next. This holds if MEA is run inside a Cowork Project pointed at the repo directory. If the files are written inside Cowork's ephemeral VM sandbox instead, they will not persist. **Test this before relying on it.** If persistence fails, the fallback is to read/write state via GitHub API (commit state files to the repo).

### Step 1 — Load state
- Read `task-data/mea-config.json` via `lib/config.ts` `loadConfig()`
- Read current state via `lib/state.ts` `readState()`

### Step 2 — Find closed recurring issues (GitHub)
Query GitHub for recently closed issues with the `time/recurring` label:
```
filters: { state: "closed", labels: ["time/recurring"], createdAfter: <7 days ago> }
```
Extract the recurring task ID from the issue body (stored as `<!-- recurring-task-id: {id} -->` in the issue body).

### Step 3 — Build the maintenance report
Call `lib/recurring.ts` `buildMaintenanceReport(config.recurringTasks, closedTaskIds, lookaheadDays=3)`.

### Step 4 — Advance completed recurring tasks
For each `tasksAdvanced` ID:
- Call `lib/recurring.ts` `advanceTaskSchedule(task, now)`
- Update the task in `config.recurringTasks`

### Step 5 — Create new issues for due tasks
For each `tasksCreated` ID:
- Get the RecurringTask from config
- Format issue title: task.title
- Format issue body:
  ```
  {task.issueTemplate.body}

  <!-- recurring-task-id: {task.id} -->
  <!-- cadence: {task.cadence} -->
  <!-- next-due: {task.nextDue} -->
  ```
- Labels: task.tags (already includes `time/recurring`)
- Create via `lib/github-adapter.ts` `createIssue()`
- Call `lib/recurring.ts` `markTaskCreated(task, now)` to update lastCreated
- Update task in `config.recurringTasks`

### Step 6 — Label overdue open issues
Query GitHub for open issues where the `time/has-due-date` label is set and the due date has passed.

Due dates are encoded in the issue body as `<!-- due-date: YYYY-MM-DD -->`. If the date is in the past and the issue is still open:
- Add label `time/overdue`
- Remove label `time/has-due-date` (avoid double-counting)

### Step 7 — Flag stale waiting-on issues
Query for open issues with `status/waiting-on` label, created more than 7 days ago.
For each stale issue: add label `status/stale-waiting` if not already present.
(The weekly review surfaces these for follow-up.)

### Step 8 — Monthly ledger pruning (1st of month only)
If today is the 1st of the month:
- Call `lib/state.ts` `pruneProcessedEmails(config.scheduling.pruning.ledgerRetentionDays)`
- Log pruned count

### Step 9 — Save updated config and state
- `lib/config.ts` `saveConfig(config)` — persists updated recurring task schedules
- `lib/state.ts` `writeState(state)` with `lastMaintenanceRun = now`

### Step 10 — Report summary (logged, not shown to user)
```
Daily maintenance complete:
  2 recurring issues created (fertilize-citrus, pay-visa-bill)
  1 task schedule advanced (prune-roses)
  3 issues labeled time/overdue
  1 stale waiting-on issue flagged
  No pruning (not 1st of month)
```

## Failure handling
- If GitHub is unreachable: log the error to `mea-state.lastMaintenanceRun` with an error note. Do not throw — the task must complete even partially.
- If config is malformed: stop and log the validation error. Do not attempt issue creation with bad data.

## Requires
- `/configure-mlea` run first
- GitHub MCP connector or `GITHUB_TOKEN` set
