# /configure-mea

Set up MEA for the first time. Walks through Gmail account(s), GitHub repo + project board, and default tags.

## When to use
Run once before using any other MEA command. If config already exists, this will show current settings and offer to update them.

## What this does
1. Asks for your name and common name variants (used for meeting note action-item matching)
2. Asks for one or more Gmail addresses to scan
3. Asks for your GitHub username, the repo to create issues in, and your GitHub Projects board number
4. **Validates GitHub access** — verifies the repo exists and is reachable, and that the Projects board number resolves (see below)
5. Shows a summary and confirms before saving
6. Writes `task-data/mea-config.json`
7. Guides the user to set up the three scheduled Cowork tasks manually (see below)

## GitHub validation (step 4)

Before showing the confirmation summary, perform these checks using the GitHub MCP connector:

### Check 1 — Repo exists and is accessible
Use the GitHub tool to get the repo (`GET /repos/{owner}/{repo}`). If this fails:
- 404: Tell the user the repo was not found. Ask them to double-check the owner and repo name.
- 401/403: Tell the user GitHub credentials are missing or lack `repo` scope. Prompt them to re-authenticate the GitHub connector or check their `GITHUB_TOKEN`.
- Any other error: Show the error and ask the user if they want to continue anyway (not recommended) or fix the issue first.

### Check 2 — Can create an issue (write access)
List issues on the repo (`GET /repos/{owner}/{repo}/issues`) to verify read access, then confirm write access by checking the user's permission level (`GET /repos/{owner}/{repo}/collaborators/{username}/permission`). Need at least `write` or `admin`. If the permission check fails, warn the user they may not be able to create issues.

### Check 3 — GitHub Project board is reachable
Attempt to look up the Project by number using the GitHub GraphQL API or REST `GET /repos/{owner}/{repo}/projects` (classic) or the user's org/user projects endpoint. If the board number doesn't resolve:
- Tell the user the project board number `{N}` was not found under `{owner}/{repo}`.
- Offer to list available project boards so they can pick the right number.
- Do **not** block setup if project board resolution fails — issue creation will still work without a board. Warn clearly and continue.

### After validation
If check 1 or 2 fail hard (no repo, no credentials), **do not save config** — ask the user to fix the issue first. If check 3 fails (board not found), save config but add a warning that issues won't be added to the board until the project number is corrected with `/configure-mea`.

## Scheduled task setup (user must do this manually)

> ⚠️ **Known limitation:** Cowork does not provide a plugin API for programmatically creating scheduled tasks. The user must create them in the Cowork Scheduled Tasks panel or via `/schedule` in Cowork. This command generates the prompt text for each task and tells the user what cadence to set.

After saving config, output instructions like:

```
MEA is configured. Now set up 3 scheduled tasks in Cowork:

Each task has two fields — Description (a short label) and Prompt (what Claude runs).
In Advanced Options, set Project folder to this project's folder. Without it, tasks won't see your config.

1. Email Scan — Cadence: Daily (or Hourly if you want more frequent scanning)
   Description: "MEA Email Scan"
   Prompt: "Run the MEA email scan using the email-scanner skill."

2. Daily Maintenance — Cadence: Daily
   Description: "MEA Daily Maintenance"
   Prompt: "Run the MEA daily maintenance task."

3. Daily Briefing — Cadence: On weekdays (optional, or run /my-day manually)
   Description: "MEA Daily Briefing"
   Prompt: "Run the MEA daily briefing using /my-day."

To create each: click "Scheduled" in the Cowork sidebar → "+ New task" → fill in Description, then Prompt, set the cadence, then open Advanced Options and set the Project folder.
```

> ⚠️ **Note on scan frequency:** Cowork's scheduler supports hourly, daily, weekly, on weekdays, or manual cadences. "4x/day" is not a native option. Use **hourly** for frequent scanning or **daily** for once-a-day. The `lastScanTimestamp` approach works correctly with any cadence.

## Implementation notes
- Uses `lib/config.ts` `buildDefaultConfig()` and `saveConfig()` to write the config
- Gmail accounts need the Gmail MCP connector connected in Claude settings before scanning will work
- GitHub token needs the GitHub MCP connector or `GITHUB_TOKEN` env var
- Gmail connector is **read-only** — MEA never sends, archives, or modifies emails

> ⚠️ **State persistence:** MEA's `task-data/` files must survive between Cowork sessions. This works if MEA is run inside a **Cowork Project** pointed at the repo directory (projects have persistent local storage). If run as a standalone session, files written inside Cowork's VM sandbox may not persist. **Recommend setting up MEA inside a Cowork Project.**

## Example
> /configure-mea

Claude will ask questions conversationally and confirm before writing anything.
