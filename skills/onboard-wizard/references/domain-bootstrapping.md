# Domain Bootstrapping

How the wizard converts interview answers into a domain plan.

## Cron Expression Guide

| Cadence | Cron expression | Notes |
|---|---|---|
| Every day | `0 9 * * *` | 9am daily |
| Every week (Monday) | `0 9 * * 1` | 9am every Monday |
| Every 2 weeks | `0 9 */14 * *` | Every 14 days |
| Every month (1st) | `0 9 1 * *` | 1st of each month |
| Every 2 months | `0 9 1 */2 *` | 1st of Jan, Mar, May, Jul, Sep, Nov |
| Every 3 months | `0 9 1 */3 *` | 1st of Jan, Apr, Jul, Oct |
| Every 6 months | `0 9 1 */6 *` | 1st of Jan, Jul |
| Annually (March 1) | `0 9 1 3 *` | March 1st each year |
| Annually (October) | `0 9 1 10 *` | October 1st each year |

## Tag Inference Rules

When generating domain tags, follow these patterns:

| Domain | Suggested `domain/` tag | Common `type/` tags |
|---|---|---|
| gardening, plants, garden | `domain/garden` or `domain/home` | `type/fertilize`, `type/prune`, `type/water`, `type/plant` |
| kids-soccer, sports, team | `domain/kids` | `type/game`, `type/action`, `type/schedule-change` |
| household-bills, bills, finance | `domain/finance` | `type/bill`, `type/action` |
| school, homework, kids | `domain/school` | `type/assignment`, `type/action` |
| health, medical, doctor | `domain/health` | `type/action`, `type/meeting` |
| work, professional | `domain/work` | `type/action`, `type/meeting`, `type/info-request` |

## nextDue Calculation

Set `nextDue` based on:
1. The cadence and today's date
2. Seasonality when known (e.g., "prune roses in January" → January 1 of next year if after January)
3. "First run" heuristic: if the cadence puts the first occurrence more than a month away, bring it forward to within 2 weeks so the user sees the task quickly

## Unique ID Generation

Recurring task IDs are kebab-case slugs from the title:
- "Fertilize citrus trees" → `fertilize-citrus-trees`
- "Pay Visa bill" → `pay-visa-bill`
- "Soccer game day" → `soccer-game-day`

Check uniqueness against existing `config.recurringTasks` IDs before inserting.
