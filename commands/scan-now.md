# /scan-now

Trigger an immediate email scan. On first run, prompts for how far back to look.

## Usage
```
/scan-now
/scan-now --backfill 30
/scan-now --backfill 90
```

## What this does
1. Reads `task-data/mea-config.json` to get mailbox list and classification rules
2. For each mailbox:
   a. Reads `lastScanTimestamp` from `task-data/mea-state.json`
   b. **First run (no timestamp):** Ask the user:
      > "How far back should I scan for the initial setup? (1–90 days, default 30)"
      Then query: `after:{N days ago} -category:promotions -category:social -category:updates -in:spam -in:trash`
   c. **Subsequent runs:** Query `after:{lastScanTimestamp} -category:promotions -category:social -category:updates -in:spam -in:trash`
   d. If `--backfill N`, query `after:{N days ago}` with the same filters, regardless of timestamp
   e. Caps at `maxEmailsPerRun` (default 50) — oldest first
3. Deduplicates against `task-data/processed-emails.json`
4. Classifies using 3-tier pipeline (`lib/classify.ts`)
5. Creates GitHub Issues for actionable items (`lib/github-adapter.ts`)
6. Updates `lastScanTimestamp` and stats in `task-data/mea-state.json`
7. Reports a summary: X emails scanned, Y issues created, Z duplicates skipped

> ⚠️ **State persistence assumption:** Steps 1, 2a, and 3 read state files that must have been written by a previous session. This works if MEA runs inside a Cowork Project (persistent local storage). If run as a standalone Cowork session, these files may not exist. See architecture doc for details.

## Why not just scan unread?
`is:unread` misses emails you've read but not acted on — common for anything you opened on mobile or skimmed. The time-bounded query with Gmail category filters gets everything potentially actionable while excluding Promotions, Social, Updates, spam, and trash tabs that are almost never worth tracking.

## Gmail filter applied to all scans
```
-category:promotions -category:social -category:updates -in:spam -in:trash
```
This excludes Gmail's auto-categorised low-value tabs. It does not exclude anything in your Primary or any custom label folders.

## Backfill behavior
- `--backfill N` overrides the timestamp for this run only
- Dedup layer prevents duplicate issues even if emails were previously scanned
- Large backfills are processed in batches of 50 (Gmail rate limit safety)
- `task-data/mea-state.json` is updated after all batches complete

## Requires
- `/configure-mea` run first
- Gmail connector (connector mode) or `~/.mea/tokens/` populated (MCP mode)
- GitHub MCP connector or `GITHUB_TOKEN` set
