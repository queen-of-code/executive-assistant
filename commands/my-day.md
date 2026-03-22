# /my-day

Generate a daily briefing of what's on your plate today.

## Usage
```
/my-day
```

## What this does
Pulls from GitHub Issues and synthesizes a natural-language briefing using Sonnet.

**Sources pulled:**
- Issues due today (by due-date label or milestone)
- Overdue issues (labeled `time/overdue`)
- Issues created since yesterday's briefing (new incoming)
- Issues in "Waiting On Someone" that have been sitting > 5 days

**Output format (Sonnet synthesis):**
- **Must-do today** — urgent, due today, or overdue
- **On deck** — due this week, not today
- **Waiting on** — flagged as waiting with days elapsed
- **New since yesterday** — issues created in the last 24 hours

The briefing is a natural language narrative, not a dump of issue titles.

## LLM usage
Sonnet synthesis call. Reads from GitHub Issues (no email access). This is a read-only GitHub operation.

## Scheduled version
The daily briefing is also run automatically at 7am weekdays (as configured during `/configure-mlea`). The scheduled version runs the same logic as the on-demand command.

## Requires
- `/configure-mlea` run first
- GitHub MCP connector or `GITHUB_TOKEN` set
