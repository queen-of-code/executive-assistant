# Spec: Gmail MCP Server (Multi-Account Support)

**Status:** Ready for implementation  
**Branch:** `feat-gmail-mcp-server`  
**Accounts:** melissa@queenofcode.dev, melissa@govega.ai, mbenua@gmail.com  
**GCP project:** queen-of-code

---

## Problem

The built-in Claude Gmail connector supports exactly one account. MEA needs to scan
three inboxes. Anthropic has no near-term plan to support multiple OAuth accounts in
a single connector instance (open issue: anthropics/claude-code#34834).

---

## Solution Overview

Ship a local stdio MCP server (`mcp/gmail-server/`) inside the MEA repo that manages
OAuth tokens for N Gmail accounts and exposes read-only tools to Claude. The built-in
connector becomes optional — users with a single inbox can still use the simpler flow.

### Gmail mode selector

`mea-config.json` gains a `gmailMode` field:

```json
"gmailMode": "connector"   // default — uses built-in Claude Gmail connector (1 account)
"gmailMode": "mcp"         // uses the bundled MCP server (N accounts, requires GCP setup)
```

`/configure-mea` asks during first-time setup:

> "How many Gmail accounts do you want to scan?  
> [1] Just one — use the simple built-in connector (no GCP required)  
> [2] Multiple accounts — set up the Gmail MCP server (requires a GCP OAuth client)"

The email scanner skill reads `gmailMode` and uses the appropriate tool call syntax.

---

## Architecture

```
~/.mea/
  oauth-client.json          ← GCP OAuth Desktop App credentials (never committed)
  tokens/
    melissa@queenofcode.dev.json   ← per-account refresh token
    melissa@govega.ai.json
    mbenua@gmail.com.json

mcp/gmail-server/            ← lives in the MEA repo, optional component
  src/
    index.ts                 ← MCP server entry point (stdio transport)
    gmail-client.ts          ← Gmail API wrapper (per-account)
    token-store.ts           ← reads/writes ~/.mea/tokens/
    auth.ts                  ← one-time OAuth2 browser flow per account
  package.json
  tsconfig.json
  README.md                  ← setup instructions for MCP mode
```

### .mcp.json (updated)

```json
{
  "mcpServers": {
    "gmail": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp/gmail-server/dist/index.js"],
      "env": {
        "MEA_TOKEN_DIR": "${HOME}/.mea/tokens",
        "MEA_OAUTH_CLIENT": "${HOME}/.mea/oauth-client.json"
      }
    }
  }
}
```

The server starts in both modes. In connector mode, `gmail_list_accounts` returns an
empty list and Claude ignores it. In MCP mode, Claude uses `gmail_search` etc.
No conditional launch logic needed.

---

## MCP Tools (read-only)

### `gmail_list_accounts`
Returns configured account addresses.

```typescript
// input: none
// output: { accounts: string[] }
```

### `gmail_search`
Runs a Gmail search query for one account.

```typescript
// input:
{
  account: string,          // e.g. "melissa@queenofcode.dev"
  query: string,            // Gmail search syntax, e.g. "after:2026/03/01 is:unread"
  maxResults?: number       // default 50, max 100
}
// output: array of { messageId, subject, from, date, snippet }
```

### `gmail_get_message`
Fetches full headers + snippet for a single message. No body stored.

```typescript
// input: { account: string, messageId: string }
// output: { messageId, subject, from, to, date, snippet, labelIds, hasAttachments }
```

### `gmail_list_unread`
Shorthand for `is:unread` — used by the daily briefing.

```typescript
// input: { account: string, maxResults?: number }
// output: same shape as gmail_search
```

---

## OAuth scope

`gmail.readonly` only. Same as the built-in connector.  
The GCP consent screen will request: `https://www.googleapis.com/auth/gmail.readonly`

---

## GCP Setup (one-time manual, done by user)

> ⚠️ This is only required for `gmailMode: "mcp"`. Single-account users skip this entirely.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → select `queen-of-code`
2. **APIs & Services → Library** → search "Gmail API" → Enable
3. **APIs & Services → OAuth consent screen**
   - User type: External
   - App name: "MEA Gmail"
   - Scopes: `gmail.readonly`
   - Test users: add all accounts you want to scan
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: Desktop app
   - Download the JSON file
5. Save the downloaded JSON as `~/.mea/oauth-client.json`

Then run the auth flow once per account:

```bash
cd mcp/gmail-server
npm install
npm run auth -- --account melissa@queenofcode.dev
npm run auth -- --account melissa@govega.ai
npm run auth -- --account mbenua@gmail.com
```

Each command opens a browser tab. Approve → token saved to `~/.mea/tokens/`.

---

## Changes to existing MEA files

| File | Change |
|---|---|
| `lib/types.ts` | Add `gmailMode: "connector" \| "mcp"` to `MEAConfig` |
| `lib/config.ts` | Default `gmailMode` to `"connector"` |
| `.mcp.json` | Replace connector declaration with MCP server subprocess config |
| `commands/configure-mea.md` | Add gmailMode selection step to setup wizard |
| `skills/email-scanner/SKILL.md` | Branch on `gmailMode` — use connector tools or `gmail_search` |
| `commands/scan-now.md` | Same branching |
| `CONNECTORS.md` | Document both modes |
| `README.md` | Update Step 3 — describe both paths with clear technical bar for each |

---

## Phased delivery

### Phase A — Server scaffold + single MCP account (unblocks your scanning)

- [ ] `mcp/gmail-server/` scaffolded: `package.json`, `tsconfig.json`, `src/index.ts`
- [ ] `token-store.ts` — read/write `~/.mea/tokens/`
- [ ] `auth.ts` — one-time OAuth2 browser flow CLI
- [ ] `gmail-client.ts` — Gmail API wrapper, `gmail_search` + `gmail_list_accounts`
- [ ] `.mcp.json` updated to launch the server
- [ ] `lib/types.ts` + `lib/config.ts` — add `gmailMode`
- [ ] `skills/email-scanner/SKILL.md` — branch on mode
- [ ] One account verified end-to-end

### Phase B — All 3 accounts + full tool set

- [ ] `gmail_get_message` + `gmail_list_unread` implemented
- [ ] Auth flow tested for all 3 accounts
- [ ] `commands/configure-mea.md` — gmailMode selection step
- [ ] `commands/scan-now.md` updated
- [ ] `CONNECTORS.md` updated

### Phase C — Single-account connector mode preserved

- [ ] `/configure-mea` routes to connector setup if user picks option 1
- [ ] Email scanner works correctly in both modes
- [ ] `README.md` Step 3 updated with both paths documented
- [ ] `mea-status` reports which mode is active + per-account token health in MCP mode

### Phase D — Hardening

- [ ] Automatic token refresh on expiry
- [ ] Graceful error if token missing for a configured account
- [ ] `npm run build` + tests for `mcp/gmail-server/`
- [ ] `.gitignore` entries for `~/.mea/` paths confirmed

---

## What is NOT in scope

- Sending, archiving, labelling, or modifying email in any way
- Outlook / non-Gmail accounts (future)
- Running the MCP server remotely (it's a local stdio process)
- GCP Cloud Run deployment (not needed — this runs on your machine)

---

## Open questions

| Question | Status |
|---|---|
| Does Claude Code's `.mcp.json` support `${HOME}` expansion in env values? | ✅ Resolved — NO. Only `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` are substituted. `token-store.ts` resolves `os.homedir()` directly in code instead. |
| Token storage in `${CLAUDE_PLUGIN_DATA}` vs `~/.mea/`? | ✅ Decided — `~/.mea/` so tokens survive plugin reinstalls, updates, and uninstalls. |
| Is `gmail.readonly` scope sufficient for `gmail_get_message` (full headers)? | ✅ Yes — readonly covers full message metadata read. |

---

## How to test

No automated tests are written for the MCP server (it's integration-heavy — it calls real OAuth and real Gmail APIs). Manual verification via MCP Inspector is sufficient:

```bash
cd mcp/gmail-server
npm run build
npm run auth -- --account melissa@queenofcode.dev   # first time only
npm run inspect
```

In the Inspector UI:
1. Call `gmail_list_accounts` — confirm your address appears
2. Call `gmail_search` with `account: "melissa@queenofcode.dev"` and `query: "is:unread"` — confirm emails come back
3. Call `gmail_get_message` with a `messageId` from step 2 — confirm headers are populated
4. Call `gmail_list_accounts` with NO tokens configured (rename tokens dir temporarily) — confirm empty array returned, no crash

