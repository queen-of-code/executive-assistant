---
name: email-scanner
description: Email scanning pipeline — fetches, deduplicates, and classifies emails from all configured Gmail accounts using 3-tier classification, then creates GitHub Issues for actionable items.
type: skill
aidlc_phases: [build]
tags: [email, classification, gmail, scanning, dedup, tier2, tier3]
requires: []
---

# Email Scanner Skill

## Purpose
Guides execution of the MEA email scan pipeline: Gmail fetch → dedup → 3-tier classify → GitHub Issue creation → state update. Supports multiple mailboxes and full 3-tier classification (Phase 2).

## Pipeline Steps

### 1. Load configuration
Read `task-data/mea-config.json` using `lib/config.ts` `loadConfig()`. Fail clearly if not found — the user needs to run `/configure-mea` first.

### 2. For each configured mailbox

**Determine scan window:**
- Call `lib/state.ts` `getLastScanTimestamp(mailboxId)`
- If null (first run): **Ask the user:**
  > "How far back should I scan for the initial setup? (1–90 days, default 30)"
  Accept the answer (or default to 30) and use it as N for the first-run query.
- If set: query Gmail with `after:{lastScanTimestamp}` + category/spam filters (see below)
- If `--backfill N`: query with `after:{N days ago}` + filters, regardless of timestamp

**Gmail filter applied to all scans (connector and MCP mode):**
```
-category:promotions -category:social -category:updates -in:spam -in:trash
```
Append this to every query. This excludes Gmail's auto-categorised low-value tabs and captures read-but-unactioned emails that `is:unread` would miss.

**Fetch emails — method depends on `config.gmailMode`:**

**If `gmailMode === "connector"` (default, single account):**
- Use the built-in Claude Gmail connector tools
- Tool call syntax: native connector (search, list messages)
- Only the first configured mailbox is available via the connector

**If `gmailMode === "mcp"` (multi-account):**
- Use the `gmail_search` MCP tool from the bundled MCP server
- Tool call: `gmail_search({ account: mailbox.email, query: "after:{lastScanTimestamp} -category:promotions -category:social -category:updates -in:spam -in:trash", maxResults: 50 })`
- First run: `gmail_search({ account: mailbox.email, query: "after:{N days ago} -category:promotions -category:social -category:updates -in:spam -in:trash", maxResults: 50 })`
- If `gmail_list_accounts` returns an empty list, the MCP server has no tokens — surface a clear error:
  `"Gmail MCP server has no authenticated accounts. Run: cd mcp/gmail-server && npm run auth -- --account {email}"`

**Both modes:**
- Cap at `config.scheduling.emailScan.maxEmailsPerRun` (default: 50)
- If more available, fetch oldest first — pick up the rest next run
- Fields needed: `messageId`, `subject`, `sender`, `date`, `snippet`
- **Never fetch full email body** — snippet only (body is reserved for meeting note extraction in Phase 3)

**Dedup (Layer 1):**
- Call `lib/dedup.ts` `filterNewEmails(emails)`
- Log skipped count in the scan summary

**Classify — 3-tier pipeline:**

**Tier 1** — `lib/classify.ts` `classifyTier1(email, config.classificationRules, config.urgencyRules)`
- Handles ~60-70% of emails via pattern matching
- If a result is returned with confidence ≥ 0.6: use it, skip Tier 2 and Tier 3

**Tier 2** — `lib/classify.ts` `classifyTier2(email, config.urgencyRules, tier2Config)`
- Build `tier2Config` from:
  - `vipSenders`: from `config.urgencyRules.vipSenders`
  - `meetingNoteSenderPatterns`: from `config.meetingNotes.senderPatterns`
- Handles ~10-15% via structural signals (.ics, VIP senders, date in subject, meeting note services)
- If a result is returned: use it, skip Tier 3

**Tier 3** — Haiku LLM (for the remaining ~20%)
- Build the prompt using `lib/classify.ts` `buildTier3Prompt(email, availableTags)`
  - `availableTags`: all fully-prefixed tags from the tag registry (`lib/tag-engine.ts` `tagsForDimension()` across all dimensions)
- Call Haiku with the prompt. Parse the JSON response.
- Convert to result using `lib/classify.ts` `tier3ResponseToResult(response)`
- If Haiku response is invalid JSON or confidence < 0.2: fall through to `unclassifiedResult()`

**Fallback** — `lib/classify.ts` `unclassifiedResult(mailboxId)`
- Used when all tiers fail to produce a confident classification
- Tags with `mailbox/{id}` and `source/email` only

**Tier tracking:**
- Increment `state.stats.tierBreakdown.tier1 / .tier2 / .tier3` based on which tier classified the email

**Dedup (Layer 2):**
- Before creating any issue, check `lib/dedup.ts` `findExistingIssue(email)`
- If found: skip issue creation, still record in processed-emails ledger

**Create issue — method depends on what GitHub integration is available:**

> ⚠️ **Do NOT use `lib/github-adapter.ts` when running inside Cowork with the GitHub connector attached.** `GitHubAdapter` requires `GITHUB_TOKEN` and will fail if only the connector is present. Use whichever path applies:

**If the GitHub MCP connector is attached (Cowork default):**
- Use the GitHub MCP tools directly: `create_issue`, `add_labels_to_issue`, `list_labels_for_repo`, `create_label`
- These are the tools provided by the Cowork GitHub connector — use them natively
- To ensure labels exist: call `list_labels_for_repo`, then `create_label` for any missing
- To create the issue: call `create_issue` with title, body (snippet + metadata block), and labels array

**If `GITHUB_TOKEN` is set (CLI or GitHub Actions):**
- Instantiate `lib/github-adapter.ts` `GitHubAdapter(config.github)`
- Call `ensureLabelsExist()` then `createIssue()`

**Both modes — issue body format:**
- body: snippet + metadata block including `<!-- email-id: {messageId} -->` and `<!-- due-date: {extractedDueDate} -->` if present
- labels: classification tags + mailbox tag + urgency tag if suggestedUrgency is not null
- Record with `lib/state.ts` `recordCreatedIssue()`

**Record processed:**
- Call `lib/dedup.ts` `recordProcessedEmail(email, result, issueNumber)`
- This is idempotent — must always happen, even for skipped emails

### 3. Update state
- Call `lib/state.ts` `updateMailboxScanState(mailboxId, { emailCount, issuesCreated, errors })`

### 4. Report summary
```
Scanned 12 emails (personal), 8 emails (work)
Classification: 14 Tier 1 (rules), 3 Tier 2 (structural), 3 Tier 3 (Haiku)
Created 5 issues, skipped 15 duplicates
Errors: none
```

## Multi-account scanning
Process `config.mailboxes` in order. Each mailbox has its own `lastScanTimestamp` in `mea-state.json`. Errors in one mailbox do not prevent scanning others — catch per-mailbox and continue.

## Security constraint
Gmail access is read-only regardless of mode. In connector mode, the built-in connector uses `gmail.readonly` OAuth scope. In MCP mode, the bundled server uses the same `gmail.readonly` scope. This skill must never attempt to send, archive, modify, or delete emails. Any code path that writes to Gmail is a bug.

## Cost tracking
Track which tier classified each email. The `tierBreakdown` stat in `mea-state.json` surfaces this in `/mlea-status`. Tier 3 calls cost money; the breakdown lets the user see if their rules need tuning.

## References
- [Classification rules](references/classification-rules.md)
- [Urgency scoring](references/urgency-scoring.md)
- [Meeting notes detection](references/meeting-notes.md) (Phase 3)
