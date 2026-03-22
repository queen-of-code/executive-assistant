import {
  isTaskDueWithinWindow,
  isTaskOverdue,
  calculateNextOccurrence,
  getTasksDueForCreation,
  getOverdueTasks,
  markTaskCreated,
  advanceTaskSchedule,
  buildMaintenanceReport,
  daysOverdue,
} from "./recurring";
import type { RecurringTask } from "./types";

function makeTask(overrides: Partial<RecurringTask> = {}): RecurringTask {
  return {
    id: "fertilize-citrus",
    title: "Fertilize citrus trees",
    cadence: "every 2 months",
    cronExpression: "0 9 1 */2 *",
    tags: ["domain/home", "type/action", "source/recurring", "time/recurring"],
    nextDue: "2026-05-01",
    lastCreated: "2026-03-01",
    issueTemplate: {
      body: "Time to fertilize the citrus trees.",
      assignToSelf: true,
    },
    ...overrides,
  };
}

const FIXED_NOW = new Date("2026-04-28T10:00:00Z");

describe("isTaskDueWithinWindow", () => {
  it("returns true when nextDue is within the lookahead window", () => {
    const task = makeTask({ nextDue: "2026-04-30" });
    expect(isTaskDueWithinWindow(task, 3, FIXED_NOW)).toBe(true);
  });

  it("returns false when nextDue is beyond the lookahead window", () => {
    const task = makeTask({ nextDue: "2026-05-10" });
    expect(isTaskDueWithinWindow(task, 3, FIXED_NOW)).toBe(false);
  });

  it("returns true when nextDue is exactly at the window boundary", () => {
    const task = makeTask({ nextDue: "2026-05-01" });
    expect(isTaskDueWithinWindow(task, 3, FIXED_NOW)).toBe(true);
  });

  it("returns true when nextDue is in the past (overdue)", () => {
    const task = makeTask({ nextDue: "2026-04-01" });
    expect(isTaskDueWithinWindow(task, 3, FIXED_NOW)).toBe(true);
  });
});

describe("isTaskOverdue", () => {
  it("returns true when nextDue is in the past", () => {
    const task = makeTask({ nextDue: "2026-04-01" });
    expect(isTaskOverdue(task, FIXED_NOW)).toBe(true);
  });

  it("returns false when nextDue is in the future", () => {
    const task = makeTask({ nextDue: "2026-05-01" });
    expect(isTaskOverdue(task, FIXED_NOW)).toBe(false);
  });
});

describe("calculateNextOccurrence", () => {
  it("calculates next occurrence for every-2-months cron", () => {
    const from = new Date("2026-03-01T00:00:00Z");
    const next = calculateNextOccurrence("0 9 1 */2 *", from);
    expect(next).toBe("2026-05-01");
  });

  it("calculates next occurrence for weekly cron (every Monday)", () => {
    const from = new Date("2026-04-28T00:00:00Z"); // Tuesday
    const next = calculateNextOccurrence("0 9 * * 1", from);
    // Next Monday from Tuesday Apr 28 is May 4
    expect(next).toBe("2026-05-04");
  });

  it("calculates next occurrence for every-7-days cron", () => {
    const from = new Date("2026-04-01T00:00:00Z");
    const next = calculateNextOccurrence("0 9 */7 * *", from);
    expect(next).toBe("2026-04-08");
  });

  it("calculates specific annual date (March 1)", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const next = calculateNextOccurrence("0 9 1 3 *", from);
    expect(next).toBe("2026-03-01");
  });

  it("throws for invalid cron expression", () => {
    expect(() => calculateNextOccurrence("not a cron")).toThrow();
  });
});

describe("getTasksDueForCreation", () => {
  it("returns tasks within lookahead and not recently created", () => {
    const task = makeTask({ nextDue: "2026-04-30", lastCreated: "2026-03-01" });
    const result = getTasksDueForCreation([task], 3, FIXED_NOW);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("fertilize-citrus");
  });

  it("excludes tasks outside lookahead window", () => {
    const task = makeTask({ nextDue: "2026-05-15" });
    const result = getTasksDueForCreation([task], 3, FIXED_NOW);
    expect(result).toHaveLength(0);
  });

  it("excludes tasks created the same day as nextDue (already created)", () => {
    const task = makeTask({ nextDue: "2026-04-30", lastCreated: "2026-04-30" });
    const result = getTasksDueForCreation([task], 3, FIXED_NOW);
    expect(result).toHaveLength(0);
  });
});

describe("getOverdueTasks", () => {
  it("returns overdue tasks", () => {
    const tasks = [
      makeTask({ id: "t1", nextDue: "2026-04-01" }),
      makeTask({ id: "t2", nextDue: "2026-05-01" }),
    ];
    const overdue = getOverdueTasks(tasks, FIXED_NOW);
    expect(overdue).toHaveLength(1);
    expect(overdue[0]?.id).toBe("t1");
  });
});

describe("markTaskCreated", () => {
  it("updates lastCreated and leaves nextDue unchanged", () => {
    const task = makeTask({ nextDue: "2026-05-01", lastCreated: "" });
    const now = new Date("2026-04-28T10:00:00Z");
    const updated = markTaskCreated(task, now);
    expect(updated.nextDue).toBe("2026-05-01");
    expect(updated.lastCreated).toBe("2026-04-28T10:00:00.000Z");
  });
});

describe("advanceTaskSchedule", () => {
  it("advances nextDue and resets lastCreated", () => {
    const task = makeTask({
      cronExpression: "0 9 1 */2 *",
      nextDue: "2026-05-01",
      lastCreated: "2026-04-28",
    });
    const now = new Date("2026-05-01T12:00:00Z");
    const advanced = advanceTaskSchedule(task, now);
    expect(advanced.nextDue).toBe("2026-07-01");
    expect(advanced.lastCreated).toBe("");
  });
});

describe("buildMaintenanceReport", () => {
  it("reports tasks to create, advance, and overdue", () => {
    const tasks = [
      makeTask({ id: "t1", nextDue: "2026-04-30", lastCreated: "2026-03-01" }),
      makeTask({
        id: "t2",
        nextDue: "2026-04-01",
        lastCreated: "2026-04-01",
        cronExpression: "0 9 1 */1 *",
      }),
      makeTask({ id: "t3", nextDue: "2026-06-01", lastCreated: "" }),
    ];

    const report = buildMaintenanceReport(tasks, ["t2"], 3, FIXED_NOW);

    expect(report.tasksCreated).toContain("t1");
    expect(report.tasksCreated).not.toContain("t2");
    expect(report.tasksAdvanced).toContain("t2");
    expect(report.overdueTasks).toContain("t2");
  });
});

describe("daysOverdue", () => {
  it("returns 0 for non-overdue tasks", () => {
    const task = makeTask({ nextDue: "2026-05-01" });
    expect(daysOverdue(task, FIXED_NOW)).toBe(0);
  });

  it("returns correct number of days for overdue tasks", () => {
    const task = makeTask({ nextDue: "2026-04-14" }); // 14 days before Apr 28
    expect(daysOverdue(task, FIXED_NOW)).toBe(14);
  });
});
