# MLEA Connectors

MLEA uses two external connectors: Gmail (read-only) and GitHub.

---

## Gmail

**Purpose:** Read-only email scanning to identify actionable items.

**OAuth scope:** `gmail.readonly` — the minimum required. MLEA can list, search, and read emails. It cannot send, archive, delete, label, or modify any email in any way.

**Setup:**
1. In Claude settings → Integrations → Connect Gmail
2. Sign in with the Google account(s) you want MLEA to scan
3. Authorize only the `gmail.readonly` scope when prompted

**What MLEA reads:**
- Email subject
- Sender address
- Date received
- Snippet (first ~200 characters)
- Message ID (for dedup)

**What MLEA never reads:**
- Full email body (except meeting note services, Phase 3)
- Attachments
- Email thread history beyond the current message

**What MLEA never does with Gmail:**
- Sends replies or new emails
- Archives or deletes emails
- Adds or removes labels
- Marks as read/unread

---

## GitHub

**Purpose:** Create and manage GitHub Issues as the persistent task database. Read from GitHub Projects for the `/my-day` briefing.

**Required permissions:**
- `repo` scope (to create issues and read project boards in your repo)

**Setup:**
1. In Claude settings → Integrations → Connect GitHub
   OR
2. Set `GITHUB_TOKEN` environment variable in your shell

**What MLEA does with GitHub:**
- Creates issues (one per actionable email or manual task)
- Closes issues (via `/done`)
- Adds and reads labels
- Reads open issues for briefings and `/done` matching

**What MLEA never does with GitHub:**
- Modifies your code or PRs
- Accesses repos other than the one configured in `task-data/mlea-config.json`
- Reads private repo content (issues and labels only)
