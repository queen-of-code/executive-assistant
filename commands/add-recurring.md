# /add-recurring

Add a single recurring task without running the full onboard wizard.

## Usage
```
/add-recurring <description>
/add-recurring fertilize the citrus trees every 2 months
/add-recurring take car in for oil change every 5000 miles
/add-recurring review and pay credit card bill every month
```

## What this does

1. Parses the natural language description to extract:
   - Task title
   - Cadence (how often)
   - Tags (domain, type) — inferred from description
   - Any domain hints (kids, finance, home, work, etc.)

2. Converts cadence to a cron expression (Haiku):
   - "every 2 months" → `0 9 1 */2 *`
   - "every week" → `0 9 * * 1` (Mondays)
   - "every month" → `0 9 1 * *` (1st of month)
   - "every 3 months" → `0 9 1 */3 *`

3. Calculates the first `nextDue` date (relative to today).

4. Confirms the plan:
   ```
   I'll add a recurring task:
   • Title: Fertilize citrus trees
   • Cadence: Every 2 months (next: May 1, 2026)
   • Tags: domain/home, type/action, time/recurring
   Ready?
   ```

5. On confirmation:
   - Appends to `config.recurringTasks`
   - Saves config via `lib/config.ts` `saveConfig()`
   - Optionally creates the first GitHub Issue immediately if it's due soon

## Implementation guide

### Parsing prompt (Haiku)
```
Extract structured data from this recurring task description: "{description}"

Return JSON only:
{
  "title": "string",
  "cadence": "human-readable string",
  "cronExpression": "5-field cron",
  "tags": ["domain/X", "type/Y", "source/recurring", "time/recurring"],
  "nextDue": "YYYY-MM-DD"
}

Use today's date ({today}) to compute nextDue.
For cadence, produce a valid 5-field cron expression.
Tags should include source/recurring and time/recurring always.
Infer domain from context: citrus/garden → domain/home, credit card/bill → domain/finance, car → domain/home.
```

### After parsing
- Generate a unique ID from the title: lowercase, spaces replaced with hyphens, e.g., `fertilize-citrus-trees`
- Present the plan and ask for confirmation
- On approval, build the `RecurringTask` object and append to `config.recurringTasks`

## Requires
- `/configure-mlea` run first
