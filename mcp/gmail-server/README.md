# MEA Gmail MCP Server

A local stdio MCP server that gives MEA read-only access to multiple Gmail accounts.
Required only when `gmailMode: "mcp"` is set in your MEA config (i.e. you have more
than one Gmail account to scan). Single-account users use the built-in Claude connector
and can ignore this directory entirely.

---

## Prerequisites

- Node.js 18+
- A Google Cloud project with the Gmail API enabled
- OAuth2 Desktop App credentials downloaded from GCP

---

## GCP Setup (one-time)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and select your project
2. **APIs & Services → Library** → search "Gmail API" → **Enable**
3. **APIs & Services → OAuth consent screen**
   - User type: **External**
   - App name: anything (e.g. "MEA Gmail")
   - Scopes: add `https://www.googleapis.com/auth/gmail.readonly`
   - Test users: add every Gmail address you want to scan
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Desktop app**
   - Click **Create** → **Download JSON**
5. Save the downloaded file to `~/.mea/oauth-client.json`

The directory `~/.mea/` is created automatically when you run the auth flow.

---

## Authenticating accounts

Run the auth flow once per Gmail address:

```bash
cd mcp/gmail-server
npm install
npm run build

npm run auth -- --account melissa@queenofcode.dev
npm run auth -- --account melissa@govega.ai
npm run auth -- --account mbenua@gmail.com
```

Each command opens a browser tab. Sign in with the matching Google account and click
**Allow**. The refresh token is saved to `~/.mea/tokens/{account}.json`.

**If no refresh token is returned:** Go to
[myaccount.google.com/permissions](https://myaccount.google.com/permissions), revoke
access for your app, then run `npm run auth` again.

---

## Updating your MEA config

In `task-data/mea-config.json`, set:

```json
"gmailMode": "mcp"
```

And ensure your `mailboxes` array includes an entry for each account with the matching
`email` address. The scanner matches `mailbox.email` to the account address when calling
`gmail_search`.

---

## Testing the server

After authenticating at least one account, verify the server works:

```bash
npm run build
npm run inspect
```

This opens the MCP Inspector in your browser. Try:
- `gmail_list_accounts` — should return your authenticated addresses
- `gmail_search` with `account: "your@email.com"` and `query: "is:unread"` — should return emails

If `gmail_list_accounts` returns an empty array, no tokens have been stored yet.
Run `npm run auth -- --account your@email.com` first.

---

## Token storage

Tokens are stored at `~/.mea/tokens/`. They are:
- **Never committed** — `~/.mea/` is outside the repo entirely
- **Automatically refreshed** — the server refreshes expired access tokens on first use
  and writes the updated token back to disk

---

## Graceful failure modes

| Situation | Behaviour |
|---|---|
| No tokens configured | `gmail_list_accounts` returns `[]`. Scan skill surfaces a clear setup message. |
| Token exists but account not in config | Account is ignored by the scan — only `mailboxes` entries are scanned |
| Token expired, refresh succeeds | Transparent — user sees nothing |
| Token expired, refresh fails | Error message includes the account name and a link to re-auth |
| `~/.mea/oauth-client.json` missing | Server starts but every tool call returns a clear setup error |

---

## Files

```
mcp/gmail-server/
├── src/
│   ├── index.ts          MCP server entry point (stdio transport, 4 tools)
│   ├── gmail-client.ts   Gmail API wrapper — search, get, list_unread
│   ├── token-store.ts    Read/write ~/.mea/tokens/, load OAuth client creds
│   └── auth.ts           One-time OAuth2 browser flow CLI
├── dist/                 Compiled output (gitignored)
├── package.json
├── tsconfig.json
└── README.md
```
