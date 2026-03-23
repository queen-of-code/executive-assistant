# /onboard

Bootstrap a new life domain with recurring tasks, tags, and classification rules.

## Usage
```
/onboard <domain>
/onboard gardening
/onboard kids-soccer
/onboard household-bills
/onboard school
```

## What this does

The onboard wizard solves the cold-start problem. Instead of requiring manual configuration of keywords and recurring tasks, you describe a life domain in plain language and the wizard bootstraps everything.

### Flow

1. **Domain recognition** — Recognizes the domain name and generates appropriate interview questions (Sonnet). For "gardening," it asks about plants, climate, and maintenance schedules. For "kids-soccer," it asks about team, schedule, and communication channels.

2. **Interview** — 3–5 conversational questions. Your answers drive everything generated next.

3. **Generation** — Based on your answers, the wizard proposes:
   - New tags to add to the tag registry (e.g., `domain/garden`, `type/fertilize`)
   - Recurring tasks with cadences and cron expressions
   - Email classification rules (sender patterns, keywords) if the domain has email sources
   - Any initial one-time tasks implied by your answers

4. **Confirmation** — Shows the full plan before doing anything:
   > I'll create 4 recurring tasks, add 3 new tags, and set up 2 email rules. Sound good?

5. **Execution** — On approval: creates GitHub Issues for one-time tasks, adds recurring tasks to `task-data/recurring-tasks.json`, updates `task-data/mea-config.json` with new rules and tags, and adds tags to the tag registry.

## Implementation guide

### Step 1 — Load config
Read `task-data/mea-config.json`. Fail clearly if not found.

### Step 2 — Domain question generation (Sonnet)
Prompt:
```
You are helping a busy person set up a personal task management system for the domain: "{domain}".
Generate 3–5 interview questions to understand their recurring tasks, schedules, contacts, and any email sources relevant to this domain.
Be specific to the domain — gardening questions differ from finance questions.
Return a JSON array of question strings only.
```

### Step 3 — Run the interview
Ask each question conversationally. Collect and hold all answers.

### Step 4 — Generate the domain plan (Sonnet)
Prompt:
```
Based on these answers about the "{domain}" domain:
{answers}

Generate a structured domain setup plan as JSON:
{
  "tags": [
    { "dimension": "domain", "value": "garden" },
    { "dimension": "type", "value": "fertilize" }
  ],
  "recurringTasks": [
    {
      "id": "fertilize-citrus",
      "title": "Fertilize citrus trees",
      "cadence": "every 2 months",
      "cronExpression": "0 9 1 */2 *",
      "tags": ["domain/garden", "type/fertilize", "source/recurring", "time/recurring"],
      "nextDue": "YYYY-MM-DD",
      "issueTemplate": { "body": "...", "assignToSelf": true }
    }
  ],
  "classificationRules": [
    {
      "name": "armstrong-nursery",
      "tags": ["domain/garden", "source/email"],
      "keywords": ["planting guide", "seasonal sale"],
      "senderPatterns": ["@armstronggarden\\.com"],
      "subjectPatterns": [],
      "confidence": 0.7,
      "dueDateExtraction": "none"
    }
  ],
  "initialTasks": [
    { "title": "Set up drip irrigation", "tags": ["domain/garden", "type/action"] }
  ]
}

Use today's date to set reasonable nextDue values for recurring tasks.
Only generate what the answers support — don't invent things not mentioned.
```

### Step 5 — Present the plan
Format and show the proposed plan clearly. Example:
```
Here's what I'll set up for [domain]:

RECURRING TASKS (4):
  • Fertilize citrus trees — every 2 months (next: May 1)
  • Prune roses — January annually
  • Start tomato seeds indoors — March annually
  • Fall garden cleanup — October annually

NEW TAGS (3):
  • domain/garden, type/fertilize, type/seasonal

EMAIL RULES (2):
  • Armstrong Garden Centers (sender: @armstronggarden.com)
  • Peaceful Valley (keywords: planting guide, seed order)

ONE-TIME TASKS (1):
  • Set up drip irrigation

Want me to go ahead?
```

### Step 6 — Execute on confirmation
- Add new tags via `lib/tag-engine.ts` `addTagToDimension()` and `addDimension()`
- Append new recurring tasks to `config.recurringTasks`
- Append new classification rules to `config.classificationRules`
- Save config via `lib/config.ts` `saveConfig()`
- Create GitHub Issues for initial one-time tasks via `lib/github-adapter.ts`

### Step 7 — Confirm completion
```
Done! Set up [domain] with 4 recurring tasks and 2 email rules.
The next recurring issues will appear on your board starting [date].
Run /scan-now to classify any existing emails from this domain.
```

## Domain-specific question hints

| Domain keyword | Question topics |
|---|---|
| gardening, garden | Plants, climate zone, recurring maintenance, nursery emails |
| kids-soccer, soccer | Team name, practice days, game schedule, coach contact, TeamSnap |
| household-bills, bills, finance | Bills list, payment methods, email billers, due date cycle |
| school | Kid names, school name, communication method, grading periods |
| health, medical | Recurring appointments, prescription refills, health reminders |
| freelance, clients | Client names, invoice cycles, recurring deliverables |

## Requires
- `/configure-mlea` run first
- GitHub MCP connector (to create initial issues)
