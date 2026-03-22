import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  readState,
  writeState,
  updateMailboxScanState,
  getLastScanTimestamp,
  readProcessedEmails,
  isEmailProcessed,
  markEmailProcessed,
  pruneProcessedEmails,
  recordCreatedIssue,
  findIssueByMessageId,
} from "./state";

// Use a temp directory per test run so tests don't stomp each other
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mlea-test-"));
  process.env["MLEA_DATA_DIR"] = tmpDir;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env["MLEA_DATA_DIR"];
});

describe("readState / writeState", () => {
  it("returns default state when file does not exist", () => {
    const state = readState();
    expect(state.mailboxes).toEqual({});
    expect(state.lastMaintenanceRun).toBeNull();
    expect(state.stats.totalEmailsScanned).toBe(0);
  });

  it("roundtrips state correctly", () => {
    const state = readState();
    state.lastMaintenanceRun = "2026-03-22T06:00:00Z";
    writeState(state);

    const loaded = readState();
    expect(loaded.lastMaintenanceRun).toBe("2026-03-22T06:00:00Z");
  });
});

describe("updateMailboxScanState", () => {
  it("updates mailbox scan state and increments stats", () => {
    updateMailboxScanState("personal", {
      emailCount: 10,
      issuesCreated: 3,
      errors: [],
    });

    const state = readState();
    expect(state.mailboxes["personal"]).toBeDefined();
    expect(state.mailboxes["personal"].lastScanEmailCount).toBe(10);
    expect(state.mailboxes["personal"].lastScanIssuesCreated).toBe(3);
    expect(state.stats.totalEmailsScanned).toBe(10);
    expect(state.stats.totalIssuesCreated).toBe(3);
    expect(state.stats.scansSinceInstall).toBe(1);
  });
});

describe("getLastScanTimestamp", () => {
  it("returns null when mailbox has no scan history", () => {
    expect(getLastScanTimestamp("work")).toBeNull();
  });

  it("returns the timestamp after a scan", () => {
    updateMailboxScanState("work", {
      emailCount: 5,
      issuesCreated: 1,
      errors: [],
    });
    const ts = getLastScanTimestamp("work");
    expect(ts).not.toBeNull();
    expect(new Date(ts!).getTime()).toBeGreaterThan(0);
  });
});

describe("processed email ledger", () => {
  it("returns false for unprocessed message", () => {
    expect(isEmailProcessed("msg-001")).toBe(false);
  });

  it("marks an email as processed and detects it", () => {
    markEmailProcessed({
      messageId: "msg-001",
      processedAt: new Date().toISOString(),
      tier: 1,
      tags: ["domain/finance"],
      issueNumber: 42,
      mailboxId: "personal",
    });
    expect(isEmailProcessed("msg-001")).toBe(true);
  });

  it("does not affect other message IDs", () => {
    markEmailProcessed({
      messageId: "msg-001",
      processedAt: new Date().toISOString(),
      tier: 1,
      tags: [],
      issueNumber: null,
      mailboxId: "personal",
    });
    expect(isEmailProcessed("msg-002")).toBe(false);
  });
});

describe("pruneProcessedEmails", () => {
  it("removes entries older than retention window", () => {
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date().toISOString();

    const ledger = readProcessedEmails();
    ledger.entries.push(
      { messageId: "old-msg", processedAt: old, tier: 1, tags: [], issueNumber: null, mailboxId: "personal" },
      { messageId: "new-msg", processedAt: recent, tier: 1, tags: [], issueNumber: null, mailboxId: "personal" }
    );
    // Write directly to bypass the single-entry API
    fs.writeFileSync(
      path.join(tmpDir, "processed-emails.json"),
      JSON.stringify(ledger, null, 2)
    );

    const pruned = pruneProcessedEmails(90);
    expect(pruned).toBe(1);
    expect(isEmailProcessed("old-msg")).toBe(false);
    expect(isEmailProcessed("new-msg")).toBe(true);
  });
});

describe("created issues ledger", () => {
  it("returns null for unknown message ID", () => {
    expect(findIssueByMessageId("msg-unknown")).toBeNull();
  });

  it("records and retrieves a created issue", () => {
    recordCreatedIssue({
      messageId: "msg-001",
      issueNumber: 42,
      issueUrl: "https://github.com/test/repo/issues/42",
      createdAt: new Date().toISOString(),
    });
    const record = findIssueByMessageId("msg-001");
    expect(record).not.toBeNull();
    expect(record?.issueNumber).toBe(42);
  });
});
