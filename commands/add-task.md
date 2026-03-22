# /add-task

Add a task manually from natural language. Skips email scanning entirely.

## Usage
```
/add-task <description>
/add-task fertilize the citrus trees by next Saturday
/add-task Pick up Timmy's soccer cleats
/add-task Review the Q3 budget — waiting on Dave's numbers first
```

## What this does
1. Parses the description for:
   - Due date (if mentioned — "by next Saturday", "March 31", etc.)
   - People mentioned (mapped to `person/` tags)
   - Domain hints ("finance", "work", "kids", etc.)
   - Waiting-on indicator ("waiting on X", "blocked by X")
2. For simple descriptions ("buy milk"), skips the LLM entirely — creates the issue with `source/manual` and basic tags
3. For complex descriptions with dates/people, uses Haiku to extract structured fields
4. Creates a GitHub Issue with appropriate tags
5. Confirms: "Created issue #42: Fertilize citrus trees"

## Tag inference
- Always adds: `source/manual`
- Infers domain from description keywords
- Adds `status/waiting-on` if waiting-on language detected
- Adds `time/has-due-date` if a due date was extracted

## Requires
- `/configure-mlea` run first
- GitHub MCP connector or `GITHUB_TOKEN` set
