import type { RecurringTask } from "./types";

// ─── Recurring Task Engine ─────────────────────────────────────────────────────
//
// Pure code, no LLM. Manages the lifecycle of recurring tasks:
//   - Determine which tasks are due within a lookahead window
//   - Calculate the next occurrence date when a task is completed
//   - Detect overdue and stale issues for the daily maintenance task
//
// All scheduling logic is based on cron expressions stored in recurring-tasks.json.
// This module does NOT write state — callers are responsible for persisting changes.

// ─── Due Date Calculation ─────────────────────────────────────────────────────

/**
 * Returns true if a recurring task should have an issue created now.
 * A task is due if its nextDue date is within lookaheadDays from today.
 */
export function isTaskDueWithinWindow(
  task: RecurringTask,
  lookaheadDays: number,
  now: Date = new Date()
): boolean {
  const nextDue = new Date(task.nextDue);
  const windowEnd = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);
  return nextDue <= windowEnd;
}

/**
 * Returns true if a recurring task is overdue (nextDue is in the past).
 */
export function isTaskOverdue(
  task: RecurringTask,
  now: Date = new Date()
): boolean {
  return new Date(task.nextDue) < now;
}

/**
 * Calculates the next occurrence date from a cron expression and a base date.
 * Parses a subset of cron: minute, hour, day-of-month, month, day-of-week.
 * Returns an ISO date string (YYYY-MM-DD).
 *
 * Supports standard 5-field cron. For intervals like "* /2" (every 2 months),
 * increments from the base date by the appropriate period.
 * All arithmetic is done in UTC to avoid DST/timezone surprises.
 */
export function calculateNextOccurrence(
  cronExpression: string,
  fromDate: Date = new Date()
): string {
  const fields = cronExpression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(
      `Invalid cron expression: "${cronExpression}". Expected 5 fields.`
    );
  }

  const [, , dom, month, dow] = fields;

  const monthInterval = parseInterval(month);
  const domInterval = parseInterval(dom);
  const dowValue = parseDow(dow);

  // Work in UTC: extract year/month/day from ISO string to avoid timezone shifts
  const [year, mon, day] = fromDate
    .toISOString()
    .split("T")[0]!
    .split("-")
    .map(Number) as [number, number, number];

  if (monthInterval !== null) {
    // e.g., "0 9 1 */2 *" — 1st of every 2 months
    const nextMonth = mon - 1 + monthInterval; // 0-indexed
    const nextYear = year + Math.floor(nextMonth / 12);
    const normalizedMonth = nextMonth % 12;
    const targetDay = dom !== "*" && parseInterval(dom) === null ? parseInt(dom, 10) : 1;
    return formatDate(nextYear, normalizedMonth + 1, targetDay);
  }

  if (domInterval !== null) {
    // e.g., "0 9 */7 * *" — every N days
    const next = new Date(Date.UTC(year, mon - 1, day + domInterval));
    return toISODate(next);
  }

  if (dowValue !== null) {
    // e.g., "0 9 * * 1" — every Monday
    const base = new Date(Date.UTC(year, mon - 1, day + 1)); // At least tomorrow
    return toISODate(nextWeekday(base, dowValue));
  }

  // Specific month/day: e.g., "0 9 1 3 *" — March 1 every year
  const targetMonth = month === "*" ? null : parseInt(month, 10);
  const targetDom = dom === "*" ? null : parseInt(dom, 10);

  let nextYear = year;
  let nextMon = mon;
  let nextDay = day + 1; // At least tomorrow

  if (targetMonth !== null) {
    if (nextMon > targetMonth) nextYear += 1;
    nextMon = targetMonth;
  }
  if (targetDom !== null) {
    nextDay = targetDom;
  }

  return formatDate(nextYear, nextMon, nextDay);
}

// ─── Task Filtering ────────────────────────────────────────────────────────────

/**
 * Returns tasks that need an issue created: due within the lookahead window
 * and not already created since their lastCreated date.
 */
export function getTasksDueForCreation(
  tasks: RecurringTask[],
  lookaheadDays: number,
  now: Date = new Date()
): RecurringTask[] {
  return tasks.filter((task) => {
    if (!isTaskDueWithinWindow(task, lookaheadDays, now)) return false;
    // Guard: don't create twice for the same occurrence
    // Consider already-created if lastCreated is within the same occurrence window
    if (task.lastCreated) {
      const lastCreated = new Date(task.lastCreated);
      const nextDue = new Date(task.nextDue);
      // If lastCreated is within a day of nextDue, assume already created
      const dayDiff = Math.abs(nextDue.getTime() - lastCreated.getTime()) / (24 * 60 * 60 * 1000);
      if (dayDiff < 1) return false;
    }
    return true;
  });
}

/**
 * Returns overdue tasks (nextDue in the past).
 */
export function getOverdueTasks(
  tasks: RecurringTask[],
  now: Date = new Date()
): RecurringTask[] {
  return tasks.filter((task) => isTaskOverdue(task, now));
}

// ─── Task State Updates ────────────────────────────────────────────────────────

/**
 * Returns an updated RecurringTask after an issue has been created.
 * Updates lastCreated. Does NOT advance nextDue — that happens on completion.
 */
export function markTaskCreated(
  task: RecurringTask,
  now: Date = new Date()
): RecurringTask {
  return {
    ...task,
    lastCreated: now.toISOString(),
  };
}

/**
 * Returns an updated RecurringTask after the current issue has been closed.
 * Calculates and sets the next occurrence date from the cron expression.
 */
export function advanceTaskSchedule(
  task: RecurringTask,
  now: Date = new Date()
): RecurringTask {
  const nextDue = calculateNextOccurrence(task.cronExpression, now);
  return {
    ...task,
    nextDue,
    lastCreated: "", // Reset — no issue created for the new cycle yet
  };
}

// ─── Daily Maintenance Checks ─────────────────────────────────────────────────

export interface MaintenanceReport {
  tasksCreated: string[];       // task IDs that need a new GitHub Issue
  tasksAdvanced: string[];      // task IDs whose schedule was advanced (after close)
  overdueTasks: string[];       // task IDs that are past their nextDue
}

/**
 * Generates the maintenance report for a set of recurring tasks.
 * Callers use this to determine what actions to take (create issues, advance schedules).
 */
export function buildMaintenanceReport(
  tasks: RecurringTask[],
  closedRecurringIssueTaskIds: string[],
  lookaheadDays: number = 3,
  now: Date = new Date()
): MaintenanceReport {
  const closedSet = new Set(closedRecurringIssueTaskIds);

  const tasksCreated = getTasksDueForCreation(tasks, lookaheadDays, now)
    .filter((t) => !closedSet.has(t.id))
    .map((t) => t.id);

  const tasksAdvanced = tasks
    .filter((t) => closedSet.has(t.id))
    .map((t) => t.id);

  const overdueTasks = getOverdueTasks(tasks, now).map((t) => t.id);

  return { tasksCreated, tasksAdvanced, overdueTasks };
}

// ─── Urgency Escalation for Overdue ──────────────────────────────────────────

/**
 * Returns how many days overdue a task is. 0 if not overdue.
 */
export function daysOverdue(task: RecurringTask, now: Date = new Date()): number {
  const nextDue = new Date(task.nextDue);
  if (nextDue >= now) return 0;
  return Math.floor((now.getTime() - nextDue.getTime()) / (24 * 60 * 60 * 1000));
}

// ─── Cron Parsing Helpers ─────────────────────────────────────────────────────

function parseInterval(field: string): number | null {
  const match = field.match(/^\*\/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}

function parseDow(field: string): number | null {
  if (field === "*") return null;
  const n = parseInt(field, 10);
  return isNaN(n) ? null : n;
}

function nextWeekday(from: Date, targetDow: number): Date {
  const d = new Date(from);
  // from is already set to "at least tomorrow" by caller
  while (d.getUTCDay() !== targetDow) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
