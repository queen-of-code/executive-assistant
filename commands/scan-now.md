# /scan-now

Trigger an immediate email scan. Optionally backfill N days of history.

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
   b. Queries Gmail for emails after that timestamp (or all unread if first run)
   c. If `--backfill N`, queries for emails from the last N days instead
   d. Caps at `maxEmailsPerRun` (default 50) — oldest first
3. Deduplicates against `task-data/processed-emails.json`
4. Classifies using 3-tier pipeline (`lib/classify.ts`)
5. Creates GitHub Issues for actionable items (`lib/github-adapter.ts`)
6. Updates `lastScanTimestamp` and stats in `task-data/mea-state.json`
7. Reports a summary: X emails scanned, Y issues created, Z duplicates skipped

> ⚠️ **State persistence assumption:** Steps 1, 2a, and 3 read state files that must have been written by a previous session. This works if MEA runs inside a Cowork Project (persistent local storage). If run as a standalone Cowork session, these files may not exist. See architecture doc for details.

## Backfill behavior
- `--backfill` overrides the timestamp for this run only
- Dedup layer prevents duplicate issues even if emails were previously scanned
- Large backfills are processed in batches of 50 (Gmail rate limit safety)
- `task-data/mea-state.json` is updated after all batches complete

## Requires
- `/configure-mlea` run first
- Gmail MCP connector connected (read-only)
- GitHub MCP connector or `GITHUB_TOKEN` set
