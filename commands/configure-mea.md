# /configure-mlea

Set up MEA for the first time. Walks through Gmail account(s), GitHub repo + project board, and default tags.

## When to use
Run once before using any other MEA command. If config already exists, this will show current settings and offer to update them.

## What this does
1. Asks for your name and common name variants (used for meeting note action-item matching)
2. Asks for one or more Gmail addresses to scan
3. Asks for your GitHub username, the repo to create issues in, and your GitHub Projects board number
4. Shows a summary and confirms before saving
5. Writes `task-data/mea-config.json`
6. Guides the user to set up the three scheduled Cowork tasks manually (see below)

## Scheduled task setup (user must do this manually)

> ⚠️ **Known limitation:** Cowork does not provide a plugin API for programmatically creating scheduled tasks. The user must create them in the Cowork Scheduled Tasks panel or via `/schedule` in Cowork. This command generates the prompt text for each task and tells the user what cadence to set.

After saving config, output instructions like:

```
MEA is configured. Now set up 3 scheduled tasks in Cowork:

1. Email Scan — Cadence: Daily (or Hourly if you want more frequent scanning)
   Prompt: "Run the MEA email scan using the email-scanner skill."

2. Daily Maintenance — Cadence: Daily
   Prompt: "Run the MEA daily maintenance task."

3. Daily Briefing — Cadence: On weekdays (optional, or run /my-day manually)
   Prompt: "Run the MEA daily briefing using /my-day."

To create each: click "Scheduled" in the Cowork sidebar → "+ New task" → paste the prompt and set the cadence.
```

> ⚠️ **Note on scan frequency:** Cowork's scheduler supports hourly, daily, weekly, on weekdays, or manual cadences. "4x/day" is not a native option. Use **hourly** for frequent scanning or **daily** for once-a-day. The `lastScanTimestamp` approach works correctly with any cadence.

## Implementation notes
- Uses `lib/config.ts` `buildDefaultConfig()` and `saveConfig()` to write the config
- Gmail accounts need the Gmail MCP connector connected in Claude settings before scanning will work
- GitHub token needs the GitHub MCP connector or `GITHUB_TOKEN` env var
- Gmail connector is **read-only** — MEA never sends, archives, or modifies emails

> ⚠️ **State persistence:** MEA's `task-data/` files must survive between Cowork sessions. This works if MEA is run inside a **Cowork Project** pointed at the repo directory (projects have persistent local storage). If run as a standalone session, files written inside Cowork's VM sandbox may not persist. **Recommend setting up MEA inside a Cowork Project.**

## Example
> /configure-mlea

Claude will ask questions conversationally and confirm before writing anything.
