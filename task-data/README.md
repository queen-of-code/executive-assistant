# task-data/

Runtime state files for MLEA. These are created and managed by the system — you should not edit them manually.

## Files

| File | Created by | Purpose |
|---|---|---|
| `mlea-config.json` | `/configure-mlea` | Your personal configuration (accounts, rules, tracker) |
| `mlea-state.json` | `/scan-now`, daily maintenance | Runtime state: last scan timestamps, stats |
| `processed-emails.json` | `/scan-now` | Email dedup ledger — which messages have been processed |
| `created-issues.json` | `/scan-now`, `/add-task` | Email → GitHub Issue number mapping |
| `recurring-tasks.json` | `/add-recurring`, `/onboard` (Phase 2) | Recurring task schedules |
| `tag-registry.json` | `/configure-mlea`, `/onboard` (Phase 2) | Extended tag registry beyond defaults |

## Template

`mlea-config.template.json` is a starter template showing all config fields. Run `/configure-mlea` to generate the real version with your settings.

## Privacy note

All state files stay on your local machine. Nothing is uploaded or synced elsewhere. The `.gitignore` excludes all `task-data/*.json` files (except the template) to prevent accidentally committing personal data.
