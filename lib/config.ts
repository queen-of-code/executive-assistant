import * as fs from "fs";
import * as path from "path";
import type {
  MLEAConfig,
  SchedulingConfig,
  UrgencyRules,
  MeetingNotesConfig,
} from "./types";

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_SCHEDULING: SchedulingConfig = {
  emailScan: {
    // Stored as a reference cadence — Cowork's scheduler uses plain-language options,
    // not cron expressions. ⚠️ 4x/day may not be achievable; verify in Cowork UI.
    cronExpression: "0 7,11,15,19 * * *",
    maxEmailsPerRun: 50,
    enabled: true,
  },
  dailyMaintenance: {
    // Cowork cadence: "daily"
    cronExpression: "0 6 * * *",
    enabled: true,
  },
  dailyBriefing: {
    // Cowork cadence: "on weekdays"
    cronExpression: "0 7 * * 1-5",
    enabled: true,
  },
  backfill: {
    maxDays: 90,
    batchSize: 50,
  },
  pruning: {
    ledgerRetentionDays: 90,
  },
};

export const DEFAULT_URGENCY_RULES: UrgencyRules = {
  vipSenders: [],
  keywordEscalators: {
    urgent: "high",
    "action required": "high",
    "time sensitive": "high",
    critical: "critical",
    emergency: "critical",
  },
};

export const DEFAULT_MEETING_NOTES_CONFIG: MeetingNotesConfig = {
  senderPatterns: [
    "meet@gemini\\.google\\.com",
    "no-reply@otter\\.ai",
    "no-reply@fireflies\\.ai",
    "no-reply@copilot\\.microsoft\\.com",
  ],
};

// ─── Validation ──────────────────────────────────────────────────────────────

export class ConfigValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string
  ) {
    super(`Config validation error at '${field}': ${message}`);
    this.name = "ConfigValidationError";
  }
}

export function validateConfig(config: unknown): MLEAConfig {
  if (!config || typeof config !== "object") {
    throw new ConfigValidationError("root", "config must be an object");
  }

  const c = config as Record<string, unknown>;

  if (typeof c["version"] !== "string" || !c["version"]) {
    throw new ConfigValidationError("version", "must be a non-empty string");
  }
  if (typeof c["userName"] !== "string" || !c["userName"]) {
    throw new ConfigValidationError("userName", "must be a non-empty string");
  }
  if (!Array.isArray(c["nameVariants"])) {
    throw new ConfigValidationError("nameVariants", "must be an array");
  }
  if (!Array.isArray(c["mailboxes"]) || c["mailboxes"].length === 0) {
    throw new ConfigValidationError(
      "mailboxes",
      "must be a non-empty array — at least one mailbox is required"
    );
  }

  for (const [i, mb] of (c["mailboxes"] as unknown[]).entries()) {
    const m = mb as Record<string, unknown>;
    if (!m["id"] || typeof m["id"] !== "string") {
      throw new ConfigValidationError(`mailboxes[${i}].id`, "must be a string");
    }
    if (!m["email"] || typeof m["email"] !== "string") {
      throw new ConfigValidationError(
        `mailboxes[${i}].email`,
        "must be a string"
      );
    }
  }

  const tracker = c["issueTracker"] as Record<string, unknown> | undefined;
  if (!tracker || tracker["type"] !== "github") {
    throw new ConfigValidationError(
      "issueTracker.type",
      "must be 'github' (the only supported tracker in Phase 1)"
    );
  }

  const gh = tracker["github"] as Record<string, unknown> | undefined;
  if (!gh) {
    throw new ConfigValidationError(
      "issueTracker.github",
      "github config block is required"
    );
  }
  if (!gh["owner"] || typeof gh["owner"] !== "string") {
    throw new ConfigValidationError(
      "issueTracker.github.owner",
      "must be a non-empty string"
    );
  }
  if (!gh["repo"] || typeof gh["repo"] !== "string") {
    throw new ConfigValidationError(
      "issueTracker.github.repo",
      "must be a non-empty string"
    );
  }
  if (typeof gh["projectNumber"] !== "number") {
    throw new ConfigValidationError(
      "issueTracker.github.projectNumber",
      "must be a number"
    );
  }

  return config as MLEAConfig;
}

// ─── Load / Save ──────────────────────────────────────────────────────────────

// ${CLAUDE_PLUGIN_DATA} is a real env var set by Claude Code for hook and MCP
// subprocess environments (https://code.claude.com/en/plugins-reference).
// Whether it's set in Cowork task sessions is unconfirmed — we fall back to
// task-data/ (relative to the working directory) so it works either way.
const DATA_DIR =
  process.env["MLEA_DATA_DIR"] ??
  (process.env["CLAUDE_PLUGIN_DATA"]
    ? path.join(process.env["CLAUDE_PLUGIN_DATA"], "mlea")
    : "task-data");

const CONFIG_PATH = path.resolve(
  process.env["MLEA_CONFIG_PATH"] ?? path.join(DATA_DIR, "mlea-config.json")
);

export { DATA_DIR };

export function loadConfig(): MLEAConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `MLEA config not found at ${CONFIG_PATH}. Run /configure-mlea to set up.`
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch (err) {
    throw new Error(
      `Failed to parse config at ${CONFIG_PATH}: ${(err as Error).message}`
    );
  }

  return validateConfig(raw);
}

export function saveConfig(config: MLEAConfig): void {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = `${CONFIG_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), "utf-8");
  fs.renameSync(tmp, CONFIG_PATH);
}

export function buildDefaultConfig(partial: {
  userName: string;
  nameVariants: string[];
  mailboxes: MLEAConfig["mailboxes"];
  issueTracker: MLEAConfig["issueTracker"];
}): MLEAConfig {
  return {
    version: "1.0.0",
    userName: partial.userName,
    nameVariants: partial.nameVariants,
    mailboxes: partial.mailboxes,
    gmailMode: "connector",
    tagRegistry: {
      dimensions: {
        domain: {
          prefix: "domain/",
          tags: ["work", "kids", "home", "finance", "health", "school"],
        },
        source: {
          prefix: "source/",
          tags: [
            "email",
            "manual",
            "recurring",
            "meeting-notes",
            "wizard",
          ],
        },
        type: {
          prefix: "type/",
          tags: [
            "bill",
            "meeting",
            "action",
            "info-request",
            "schedule-change",
            "assignment",
            "performance",
            "game",
          ],
        },
        urgency: {
          prefix: "urgency/",
          tags: ["critical", "high", "medium", "low"],
        },
        time: {
          prefix: "time/",
          tags: ["has-due-date", "recurring", "someday", "overdue"],
        },
        person: { prefix: "person/", tags: ["self"] },
        status: {
          prefix: "status/",
          tags: ["waiting-on", "delegated", "blocked"],
        },
        mailbox: { prefix: "mailbox/", tags: [] },
      },
    },
    classificationRules: [],
    urgencyRules: DEFAULT_URGENCY_RULES,
    meetingNotes: DEFAULT_MEETING_NOTES_CONFIG,
    issueTracker: partial.issueTracker,
    scheduling: DEFAULT_SCHEDULING,
    recurringTasks: [],
  };
}
