---
name: email-scanner
description: Email scanning pipeline — fetches, deduplicates, and classifies emails from configured Gmail accounts, then creates GitHub Issues for actionable items.
type: skill
aidlc_phases: [build]
tags: [email, classification, gmail, scanning, dedup]
requires: []
---

# Email Scanner Skill

## Purpose
Guides execution of the MLEA email scan pipeline: Gmail fetch → dedup → Tier 1 classify → GitHub Issue creation → state update.

## Pipeline Steps

### 1. Load configuration
Read `task-data/mlea-config.json` using `lib/config.ts` `loadConfig()`. Fail clearly if not found — the user needs to run `/configure-mlea` first.

### 2. For each configured mailbox

**Determine scan window:**
- Call `lib/state.ts` `getLastScanTimestamp(mailboxId)`
- If null (first run): query Gmail with `is:unread`
- If set: query Gmail with `after:{lastScanTimestamp}`
- If `--backfill N`: query with `after:{N days ago}` regardless of timestamp

**Fetch emails:**
- Use Gmail MCP connector (read-only)
- Cap at `config.scheduling.emailScan.maxEmailsPerRun` (default: 50)
- If more available, fetch oldest first — pick up the rest next run
- Fields needed: `messageId`, `subject`, `sender`, `date`, `snippet`
- **Never fetch full email body in Phase 1** — snippet only

**Dedup (Layer 1):**
- Call `lib/dedup.ts` `filterNewEmails(emails)`
- Log skipped count in the scan summary

**Classify:**
- Call `lib/classify.ts` `classifyTier1(email, config.classificationRules, config.urgencyRules)`
- If no rule matches (returns null): use `unclassifiedResult(mailboxId)` as fallback
- Phase 2 will add Tier 2 and Tier 3 here

**Dedup (Layer 2):**
- Before creating any issue, check `lib/dedup.ts` `findExistingIssue(email)`
- If found: skip issue creation, still record in processed-emails ledger

**Create issue:**
- Ensure labels exist in the GitHub repo via `lib/github-adapter.ts` `ensureLabelsExist()`
- Call `createIssue()` with title = email subject, body = snippet + metadata block, labels = classification tags + mailbox tag
- Record with `lib/state.ts` `recordCreatedIssue()`

**Record processed:**
- Call `lib/dedup.ts` `recordProcessedEmail(email, result, issueNumber)`
- This is idempotent — must always happen, even for skipped emails

### 3. Update state
- Call `lib/state.ts` `updateMailboxScanState(mailboxId, { emailCount, issuesCreated, errors })`

### 4. Report summary
```
Scanned 12 emails (personal), 8 emails (work)
Created 3 issues, skipped 17 duplicates
Errors: none
```

## Security constraint
The Gmail MCP connector is connected with `gmail.readonly` OAuth scope. This skill must never attempt to send, archive, modify, or delete emails. Any code path that writes to Gmail is a bug.

## References
- [Classification rules](references/classification-rules.md)
- [Urgency scoring](references/urgency-scoring.md)
- [Meeting notes detection](references/meeting-notes.md) (Phase 3)
