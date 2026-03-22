# Wizard Question Generation

How the onboard wizard generates domain-specific interview questions.

## Sonnet Prompt

```
You are helping a busy person set up a personal task management system for the domain: "{domain}".

Generate 3–5 interview questions to understand:
1. What recurring tasks or schedules exist in this domain
2. What people or entities are involved
3. Whether there are email sources (newsletters, notifications, service providers)
4. Any immediate one-time tasks implied by the domain

Make questions specific to the domain. Examples:
- For "gardening": ask about plants, climate, recurring maintenance (fertilizing, pruning), and nursery emails
- For "kids-soccer": ask about team name, practice schedule, game days, and how the team communicates (TeamSnap, email, etc.)
- For "household-bills": ask what bills they pay, when they're due, and whether they arrive by email
- For "school": ask how many kids, which school, and how the school communicates

Return a JSON array of question strings only. No explanation outside the JSON.
```

## Key principles
- Questions should be open-ended enough to capture real detail
- 3 questions minimum, 5 maximum — don't overwhelm
- Each question should unblock a specific type of output: recurring task, tag, or classification rule
- Never ask for PII (passwords, account numbers)
