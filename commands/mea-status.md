# /mlea-status

Health check dashboard for MEA.

## Usage
```
/mlea-status
```

## What this shows
- Last scan time per mailbox and how long ago it was
- Next scheduled scan time
- Emails processed this week / this month
- Issues created this week / this month
- Tier breakdown: X% rule-matched (Tier 1), Y% LLM (Tier 3 — Phase 2 only)
- Category breakdown: top 5 tags by volume
- Any errors from the last scan
- Gmail MCP connector status (connected / not connected)
- GitHub MCP connector status (connected / not connected)

## Example output
```
MEA Status — March 22, 2026 10:00am

Mailboxes:
  personal  — last scan 47 min ago (3/22 9:13am) | next scan 11am
  work      — last scan 47 min ago (3/22 9:13am) | next scan 11am

This week:  42 emails scanned, 8 issues created
All time:   1,847 emails scanned, 312 issues created

Top tags:   type/bill (45), type/action (189), type/meeting (38)

Connectors: Gmail ✓  GitHub ✓

No errors.
```

## LLM usage
None — pure file reads and formatting.

## Requires
- `/configure-mlea` run first
