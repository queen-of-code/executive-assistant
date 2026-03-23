# /configure-mea

Set up MEA for the first time. Walks through Gmail account(s), GitHub repo + project board, and default tags.

## When to use
Run once before using any other MEA command. If config already exists, this will show current settings and offer to update them.

## What this does
1. Asks for your name and common name variants (used for meeting note action-item matching)
2. Asks for one or more Gmail addresses to scan
3. Asks which Gmail mode to use: `connector` (single account, simpler) or `mcp` (multi-account, requires MCP server setup)
4. Asks for your GitHub username, the repo to create issues in, and your GitHub Projects board number
5. **Validates GitHub access** — verifies the repo exists and is reachable, and that the Projects board number resolves (see below)
6. **If `gmailMode === "mcp"`: validates MCP server setup** — see MCP server setup section below
7. Shows a summary and confirms before saving
8. Writes `task-data/mea-config.json`
9. Guides the user to set up the three scheduled Cowork tasks manually (see below)

## GitHub integration — how it works in Cowork

> **Important:** MEA uses the **GitHub MCP connector** in Cowork to create issues, not a `GITHUB_TOKEN` environment variable. When the GitHub connector is attached in Cowork, Claude can call `create_issue`, `list_labels`, etc. directly as MCP tools. `GITHUB_TOKEN` is only used if running MEA outside Cowork (e.g. CLI). Never prompt the user to create a PAT if they're already using Cowork with the connector attached.

If GitHub operations fail during a scan, check:
1. Is the GitHub connector attached in Claude Cowork settings? (Settings → Connections)
2. Is it authenticated to the right account?
3. Does that account have write access to the target repo?

## GitHub validation (step 5)

Before showing the confirmation summary, perform these checks **using the GitHub MCP connector tools**:

### Check 1 — Repo exists and is accessible
Call the GitHub MCP tool to get the repo. If this fails:
- Not found: Tell the user the repo was not found. Ask them to double-check the owner and repo name.
- Auth error: Tell the user the GitHub connector isn't working. Ask them to check Settings → Connections in Cowork.
- Any other error: Show the error and ask the user if they want to continue anyway (not recommended) or fix the issue first.

### Check 2 — Can create an issue (write access)
Use the GitHub MCP tool to list issues (confirms read), then check the authenticated user's permission level. Need at least `write` or `admin`. If the permission check fails, warn the user they may not be able to create issues.

### Check 3 — GitHub Project board is reachable
Attempt to look up the Project by number using the GitHub MCP tools. If the board number doesn't resolve:
- Tell the user the project board number `{N}` was not found under `{owner}/{repo}`.
- Offer to list available project boards so they can pick the right number.
- Do **not** block setup if project board resolution fails — issue creation will still work without a board. Warn clearly and continue.

### After validation
If check 1 or 2 fail hard (no repo, no credentials), **do not save config** — ask the user to fix the issue first. If check 3 fails (board not found), save config but add a warning that issues won't be added to the board until the project number is corrected with `/configure-mea`.

## MCP server setup (step 6 — only for `gmailMode === "mcp"`)

If the user chose multi-account Gmail mode, walk them through this **before** saving config or running any scan:

### Step A — Install dependencies
```
Tell the user to run in their terminal:
  cd mcp/gmail-server
  npm install
  npm run build
```
Ask them to confirm it completed without errors before continuing.

### Step B — GCP OAuth client
Ask if they already have a GCP OAuth client configured (i.e. `~/.mea/oauth-client.json` exists). If not:
```
They need to:
1. Go to console.cloud.google.com → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (type: Desktop app)
3. Download the JSON and save it to: ~/.mea/oauth-client.json
4. Enable the Gmail API for the project
```
Ask them to confirm the file exists before continuing.

### Step C — Authenticate each account
For each Gmail address they want to scan, tell them to run:
```
cd mcp/gmail-server
npm run auth -- --account <email>
```
This opens a browser window. They must complete the OAuth flow for each account.
Ask them to confirm each account authenticated successfully (they'll see a success message in the terminal).

### Step D — Verify accounts are registered
Tell them to run:
```
npm run inspect
```
and confirm their accounts appear in the `gmail_list_accounts` tool response. If an account is missing, they need to re-run Step C for it.

### Step E — Verify MCP server is wired in `.mcp.json`
The project's `.mcp.json` already includes the MCP server entry. Confirm with the user that:
- Their Cowork project has the `.mcp.json` from the repo root loaded
- The MCP server path resolves (it references `mcp/gmail-server/dist/index.js` — only works after `npm run build`)

**Only after all five steps confirm clean** proceed to save config and show the scheduled task setup instructions.

## Scheduled task setup (user must do this manually)

> ⚠️ **Known limitation:** Cowork does not provide a plugin API for programmatically creating scheduled tasks. The user must create them in the Cowork Scheduled Tasks panel or via `/schedule` in Cowork. This command generates the prompt text for each task and tells the user what cadence to set.

After saving config, output instructions like:

```
MEA is configured. Now set up 3 scheduled tasks in Cowork:

Each task has two fields — Description (a short label) and Prompt (what Claude runs).
In Advanced Options, set Project folder to this project's folder. Without it, tasks won't see your config.

1. Email Scan — Cadence: Daily (or Hourly if you want more frequent scanning)
   Description: "MEA Email Scan"
   Model: Sonnet  ← needs to reliably follow the multi-step scan pipeline; calls Haiku internally for Tier 3
   Prompt: "Run the MEA email scan using the email-scanner skill."

2. Daily Maintenance — Cadence: Daily
   Description: "MEA Daily Maintenance"
   Model: Haiku  ← pure logic (date checks, overdue flags); fast and cheap
   Prompt: "Run the MEA daily maintenance task."

3. Daily Briefing — Cadence: On weekdays (optional, or run /my-day manually)
   Description: "MEA Daily Briefing"
   Model: Sonnet  ← synthesis and writing quality matters for a useful morning summary
   Prompt: "Run the MEA daily briefing using /my-day."

To create each: click "Scheduled" in the Cowork sidebar → "+ New task" → fill in Description, then Prompt,
set the cadence and model, then open Advanced Options and set the Project folder.
```

> ⚠️ **Note on scan frequency:** Cowork's scheduler supports hourly, daily, weekly, on weekdays, or manual cadences. "4x/day" is not a native option. Use **hourly** for frequent scanning or **daily** for once-a-day. The `lastScanTimestamp` approach works correctly with any cadence.

## Implementation notes
- Uses `lib/config.ts` `buildDefaultConfig()` and `saveConfig()` to write the config
- **GitHub:** Use the GitHub MCP connector tools in Cowork. `lib/github-adapter.ts` is only used when `GITHUB_TOKEN` is set (outside Cowork).
- **Gmail (connector mode):** The built-in Gmail connector must be connected in Claude settings before scanning will work. Read-only scope only.
- **Gmail (MCP mode):** The bundled `mcp/gmail-server` must be built, OAuth clients configured, and each account authenticated via `npm run auth` before scanning.

> ⚠️ **State persistence:** MEA's `task-data/` files must survive between Cowork sessions. This works if MEA is run inside a **Cowork Project** pointed at the repo directory (projects have persistent local storage). If run as a standalone session, files written inside Cowork's VM sandbox may not persist. **Recommend setting up MEA inside a Cowork Project.**

## Example
> /configure-mea

Claude will ask questions conversationally and confirm before writing anything.
