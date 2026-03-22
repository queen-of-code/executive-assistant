# /configure-mlea

Set up MLEA for the first time. Walks through Gmail account(s), GitHub repo + project board, and default tags.

## When to use
Run once before using any other MLEA command. If config already exists, this will show current settings and offer to update them.

## What this does
1. Asks for your name and common name variants (used for meeting note action-item matching)
2. Asks for one or more Gmail addresses to scan
3. Asks for your GitHub username, the repo to create issues in, and your GitHub Projects board number
4. Asks for your timezone (for cron scheduling)
5. Shows a summary and confirms before saving
6. Writes `task-data/mlea-config.json`
7. Creates the three scheduled Cowork tasks: email scan (4x/day), daily maintenance (6am), daily briefing (7am weekdays)

## Implementation notes
- Uses `lib/config.ts` `buildDefaultConfig()` and `saveConfig()` to write the config
- Gmail accounts need the Gmail MCP connector to be connected in Claude settings before scanning will work
- GitHub token needs the GitHub MCP connector or `GITHUB_TOKEN` env var
- Gmail connector is **read-only** — MLEA never sends, archives, or modifies emails

## Example
> /configure-mlea

Claude will ask questions conversationally and confirm before writing anything.
