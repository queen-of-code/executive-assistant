# /scan-now

Trigger an immediate email scan. Optionally backfill N days of history.

## Usage
```
/scan-now
/scan-now --backfill 30
/scan-now --backfill 90
```

## Preflight checks (run BEFORE starting the scan)

Do not begin scanning until all preflight checks pass. Surface failures immediately with clear remediation steps.

### 1. Config exists
Check that `task-data/mea-config.json` exists and is parseable.
- Fail: "No config found. Run `/configure-mea` first."

### 2. GitHub connector is working
Try a lightweight GitHub MCP tool call (e.g. list issues or get the configured repo).
- If the GitHub MCP connector is not attached or returns an auth error:
  > "GitHub connector is not working. In Cowork, go to Settings → Connections and make sure the GitHub connector is connected and authenticated. MEA uses the GitHub connector to create issues — it does not use a GITHUB_TOKEN in Cowork."
- Do **not** create a `pending-issues.json` queue or tell the user to create a PAT. The connector is the right solution.
- Block the scan until this is confirmed working.

### 3. Gmail access is working (connector mode)
If `config.gmailMode === "connector"`, make a test search call with the built-in Gmail connector.
- If it fails: "Gmail connector is not working. Go to Cowork Settings → Connections and re-authenticate Gmail."

### 4. Gmail MCP server is working (MCP mode)
If `config.gmailMode === "mcp"`, call `gmail_list_accounts`.
- If the tool is not found: "Gmail MCP server is not running. Make sure `mcp/gmail-server/dist/index.js` is built (`npm run build`) and `.mcp.json` is loaded in your Cowork project."
- If the tool returns 0 accounts: "Gmail MCP server has no authenticated accounts. Run `cd mcp/gmail-server && npm run auth -- --account <email>` for each account."
- Block the scan until at least one account is listed.

## What this does (after preflight passes)
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
5. Creates GitHub Issues using **GitHub MCP connector tools** (not `github-adapter.ts` / GITHUB_TOKEN)
6. Updates `lastScanTimestamp` and stats in `task-data/mea-state.json`
7. Reports a summary: X emails scanned, Y issues created, Z duplicates skipped

> ⚠️ **State persistence:** Steps 1, 2a, and 3 read state files that must survive between Cowork sessions. This requires MEA to run inside a Cowork Project (persistent local storage). See architecture doc for details.

## Why not just scan unread?
`is:unread` misses emails you've read but not acted on. The time-bounded query with Gmail category filters captures everything potentially actionable while excluding Promotions, Social, Updates, spam, and trash.

## Gmail filter applied to all scans
```
-category:promotions -category:social -category:updates -in:spam -in:trash
```

## Backfill behavior
- `--backfill N` overrides the timestamp for this run only
- Dedup layer prevents duplicate issues even if emails were previously scanned
- Large backfills are processed in batches of 50 (Gmail rate limit safety)
- `task-data/mea-state.json` is updated after all batches complete

## Requires
- `/configure-mea` run first
- GitHub MCP connector attached and authenticated in Cowork
- Gmail connector authenticated (connector mode) OR `mcp/gmail-server` built and accounts authenticated (MCP mode)
