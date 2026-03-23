import { validateConfig, buildDefaultConfig, ConfigValidationError } from "./config";
import type { MEAConfig } from "./types";

const validConfig: MEAConfig = buildDefaultConfig({
  userName: "Melissa",
  nameVariants: ["Melissa", "Mel"],
  mailboxes: [
    { id: "personal", label: "Personal", email: "me@gmail.com", defaultTags: ["mailbox/personal"] },
  ],
  issueTracker: {
    type: "github",
    github: { owner: "queen-of-code", repo: "life-tasks", projectNumber: 5, assignToSelf: true },
  },
});

describe("validateConfig", () => {
  it("accepts a valid config", () => {
    expect(() => validateConfig(validConfig)).not.toThrow();
  });

  it("throws on missing userName", () => {
    const bad = { ...validConfig, userName: "" };
    expect(() => validateConfig(bad)).toThrow(ConfigValidationError);
  });

  it("throws on empty mailboxes", () => {
    const bad = { ...validConfig, mailboxes: [] };
    expect(() => validateConfig(bad)).toThrow(ConfigValidationError);
  });

  it("throws if issueTracker.type is not github", () => {
    const bad = {
      ...validConfig,
      issueTracker: { type: "linear", linear: {} },
    };
    expect(() => validateConfig(bad)).toThrow(ConfigValidationError);
  });

  it("throws if github owner is missing", () => {
    const bad = {
      ...validConfig,
      issueTracker: {
        type: "github" as const,
        github: { owner: "", repo: "repo", projectNumber: 1, assignToSelf: true },
      },
    };
    expect(() => validateConfig(bad)).toThrow(ConfigValidationError);
  });

  it("throws on non-object input", () => {
    expect(() => validateConfig(null)).toThrow(ConfigValidationError);
    expect(() => validateConfig("string")).toThrow(ConfigValidationError);
  });
});

describe("buildDefaultConfig", () => {
  it("produces a valid config with default scheduling", () => {
    const cfg = buildDefaultConfig({
      userName: "Test User",
      nameVariants: ["Test"],
      mailboxes: [
        { id: "work", label: "Work", email: "test@work.com", defaultTags: [] },
      ],
      issueTracker: {
        type: "github",
        github: { owner: "test", repo: "tasks", projectNumber: 1, assignToSelf: false },
      },
    });
    expect(cfg.scheduling.emailScan.cronExpression).toBe("0 7,11,15,19 * * *");
    expect(cfg.scheduling.emailScan.maxEmailsPerRun).toBe(50);
    expect(cfg.tagRegistry.dimensions["domain"]).toBeDefined();
    expect(cfg.classificationRules).toEqual([]);
  });
});
