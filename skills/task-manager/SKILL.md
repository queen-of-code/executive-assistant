---
name: task-manager
description: Task lifecycle management — creating, completing, querying, and maintaining GitHub Issues as MEA tasks.
type: skill
aidlc_phases: [build]
tags: [github, issues, tasks, completion, fuzzy-match]
requires: []
---

# Task Manager Skill

## Purpose
Guides execution of all task lifecycle operations: manual creation, completion, querying, and GitHub Issue management.

## Manual Task Creation (`/add-task`)

1. Parse the user's natural language description
2. **Simple path** (no dates, people, or special keywords): skip LLM, create directly
   - Tags: `source/manual` + any obvious domain hints from keywords
3. **Complex path** (dates, people, waiting-on language): use Haiku
   - Prompt: extract `{ description, dueDate, domain, people, isWaitingOn }`
   - Map people to `person/` tags if they're in the config's known persons
   - Add `status/waiting-on` if waiting-on language detected
   - Add `time/has-due-date` if a due date was extracted
4. Call `lib/github-adapter.ts` `createIssue()`
5. Confirm to user: "Created issue #42: [title]"

### Issue body format for manual tasks
```markdown
[task description]

---
**Source:** manual
**Created via:** /add-task
**Due:** [date if extracted]
```

## Task Completion (`/done`)

1. Fetch open issues via `lib/github-adapter.ts` `listIssues({ state: "open" })`
2. Run `lib/fuzzy-match.ts` `matchIssue(query, issues)`
3. Handle result:
   - **exact**: close immediately, confirm to user
   - **ambiguous**: show numbered list ("Which one? (1/2/3/none)")
   - **none**: show 5 most recent open issues, ask if any match

### Closing
- Call `lib/github-adapter.ts` `closeIssue(issueNumber)`
- Report: "Closed #42: [title] ✓"
- Note: recurring task renewal is Phase 2

## Issue Label Management

When creating issues, always call `ensureLabelsExist(labels)` before `createIssue()`. This creates any missing labels in the GitHub repo with dimension-based colors. It's idempotent — safe to call every time.

### Label color convention
| Dimension prefix | Color |
|---|---|
| `domain/` | Blue `#0075ca` |
| `source/` | Yellow `#e4e669` |
| `type/` | Orange `#d93f0b` |
| `urgency/` | Red `#b60205` |
| `time/` | Green `#0e8a16` |
| `person/` | Purple `#5319e7` |
| `status/` | Pink `#f9d0c4` |
| `mailbox/` | Light green `#c2e0c6` |

## References
- [GitHub adapter interface](references/github-adapter.md)
- [Recurring tasks lifecycle](references/recurring-tasks.md) (Phase 2)
- [Deduplication](references/deduplication.md)
- [Tag system](references/tag-system.md)
