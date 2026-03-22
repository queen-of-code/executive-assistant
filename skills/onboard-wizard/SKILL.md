---
name: onboard-wizard
description: Domain onboarding wizard — interviews the user to bootstrap a new life domain with recurring tasks, tags, and email classification rules. Solves the cold-start problem for new domains.
type: skill
aidlc_phases: [build]
tags: [onboarding, recurring, tags, wizard, domain]
requires: []
---

# Onboard Wizard Skill

## Purpose
Guides execution of the `/onboard` wizard: domain interview → plan generation → user confirmation → config execution.

## When to Use
- User runs `/onboard <domain>`
- Setting up a completely new life domain (gardening, kids-soccer, household-bills, school, etc.)
- The user wants recurring tasks and email rules set up without manual config

## Pipeline

### Phase 1 — Interview
1. Load `task-data/mlea-config.json` (fail clearly if missing)
2. Generate 3–5 domain-specific interview questions using Sonnet (see prompt in `/commands/onboard.md`)
3. Ask questions conversationally — collect all answers before proceeding

### Phase 2 — Plan Generation (Sonnet)
Send the domain + all answers to Sonnet with the plan generation prompt from `/commands/onboard.md`.
Expect structured JSON output:
```json
{
  "tags": [...],
  "recurringTasks": [...],
  "classificationRules": [...],
  "initialTasks": [...]
}
```

**Validation before presenting:**
- All tags must pass `lib/tag-engine.ts` `isValidTag()` structural check
- All cron expressions must be 5-field strings
- Recurring task IDs must be unique within the existing `config.recurringTasks`
- Confidence values in rules must be 0–1

If validation fails, re-prompt Sonnet with the error before surfacing to the user.

### Phase 3 — Confirmation
Present the plan in a readable summary (see command doc for format). Require explicit "yes" or "go ahead" before executing.

### Phase 4 — Execution
Execute all changes atomically:

1. **Tags** — for each new tag:
   - If the dimension exists: `lib/tag-engine.ts` `addTagToDimension(dimensionName, tagValue, config.tagRegistry)`
   - If the dimension is new: `lib/tag-engine.ts` `addDimension(name, { prefix, tags }, config.tagRegistry)`

2. **Recurring tasks** — append each to `config.recurringTasks`. Set `lastCreated: ""`.

3. **Classification rules** — append each to `config.classificationRules`.

4. **Save config** — `lib/config.ts` `saveConfig(config)`. This is the atomic commit — everything is in one JSON write.

5. **Initial one-time tasks** — create GitHub Issues for `initialTasks`:
   - Labels: the task's tags
   - Body: task title (no template needed for one-off tasks)
   - Use `lib/github-adapter.ts` `createIssue()`

6. **Ensure labels exist** — call `lib/github-adapter.ts` `ensureLabelsExist()` with all new tag values before creating any issues.

### Phase 5 — Completion message
Summarize what was done. Tell the user when the first recurring issues will appear.

## Error handling
- If Sonnet returns malformed JSON: parse error gracefully, tell the user generation failed, and offer to try again.
- If GitHub issue creation fails: complete the config save (critical) but note that initial tasks failed. The user can run `/scan-now` to pick them up later.
- If the user declines the plan: offer to modify it ("Want to remove any of these?" or "Should I adjust any cadences?")

## References
- [Wizard question generation](references/wizard-question-generation.md)
- [Domain bootstrapping](references/domain-bootstrapping.md)
