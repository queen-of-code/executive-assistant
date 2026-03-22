# /done

Mark a task as complete. Matches freeform text against open issue titles.

## Usage
```
/done <task description>
/done fertilize citrus
/done timmy soccer cleats
/done visa bill
```

## What this does
1. Fetches all open issues from GitHub
2. Runs `lib/fuzzy-match.ts` against the query
3. If one clear match (score ≥ 0.85): closes the issue immediately and confirms
4. If multiple close matches: shows a numbered list and asks "Which one? (1/2/3)"
5. If no match: says "No open task matched that description. Did you mean one of these?" and lists the 5 most recent issues

## Matching behavior
- Case-insensitive
- Ignores punctuation
- Uses combined Levenshtein distance + token overlap scoring
- Handles abbreviations and partial phrases well
- For truly ambiguous cases (Phase 2): Haiku resolves — in Phase 1, falls back to the numbered list

## After closing
- Reports: "Closed #42: Fertilize citrus trees ✓"
- Recurring task auto-renewal is a Phase 2 feature

## Requires
- `/configure-mlea` run first
- GitHub MCP connector or `GITHUB_TOKEN` set
