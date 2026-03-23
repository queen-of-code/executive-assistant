import * as fs from "fs";
import * as path from "path";
import type {
  MEAState,
  ProcessedEmailLedger,
  CreatedIssuesLedger,
  MEAStats,
} from "./types";

// ─── Paths ────────────────────────────────────────────────────────────────────

function dataPath(filename: string): string {
  const dir = process.env["MEA_DATA_DIR"] ?? "task-data";
  return path.resolve(dir, filename);
}

// ─── Atomic Write ─────────────────────────────────────────────────────────────

// Write to a .tmp file and rename — prevents corruption if the process is
// interrupted mid-write. This is the only safe way to update JSON state in
// an isolated Cowork session where partial writes can't be recovered.
function atomicWrite(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

function readJson<T>(filePath: string, defaultValue: T): T {
  if (!fs.existsSync(filePath)) return defaultValue;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return defaultValue;
  }
}

// ─── Default State ───────────────────────────────────────────────────────────

const DEFAULT_STATS: MEAStats = {
  totalEmailsScanned: 0,
  totalIssuesCreated: 0,
  scansSinceInstall: 0,
  tierBreakdown: { tier1: 0, tier2: 0, tier3: 0 },
  categoryBreakdown: {},
};

const DEFAULT_STATE: MEAState = {
  mailboxes: {},
  lastMaintenanceRun: null,
  lastBriefingRun: null,
  stats: DEFAULT_STATS,
};

// ─── MEAState ───────────────────────────────────────────────────────────────

export function readState(): MEAState {
  return readJson<MEAState>(dataPath("mea-state.json"), DEFAULT_STATE);
}

export function writeState(state: MEAState): void {
  atomicWrite(dataPath("mea-state.json"), state);
}

export function updateMailboxScanState(
  mailboxId: string,
  update: {
    emailCount: number;
    issuesCreated: number;
    errors: string[];
  }
): void {
  const state = readState();
  state.mailboxes[mailboxId] = {
    lastScanTimestamp: new Date().toISOString(),
    lastScanEmailCount: update.emailCount,
    lastScanIssuesCreated: update.issuesCreated,
    lastScanErrors: update.errors,
  };
  state.stats.totalEmailsScanned += update.emailCount;
  state.stats.totalIssuesCreated += update.issuesCreated;
  state.stats.scansSinceInstall += 1;
  writeState(state);
}

export function getLastScanTimestamp(mailboxId: string): string | null {
  const state = readState();
  return state.mailboxes[mailboxId]?.lastScanTimestamp ?? null;
}

// ─── ProcessedEmailLedger ────────────────────────────────────────────────────

const DEFAULT_LEDGER: ProcessedEmailLedger = { entries: [] };

export function readProcessedEmails(): ProcessedEmailLedger {
  return readJson<ProcessedEmailLedger>(
    dataPath("processed-emails.json"),
    DEFAULT_LEDGER
  );
}

export function writeProcessedEmails(ledger: ProcessedEmailLedger): void {
  atomicWrite(dataPath("processed-emails.json"), ledger);
}

export function isEmailProcessed(messageId: string): boolean {
  const ledger = readProcessedEmails();
  return ledger.entries.some((e) => e.messageId === messageId);
}

export function markEmailProcessed(
  entry: ProcessedEmailLedger["entries"][number]
): void {
  const ledger = readProcessedEmails();
  ledger.entries.push(entry);
  writeProcessedEmails(ledger);
}

/** Prune entries older than retentionDays. Called by daily maintenance. */
export function pruneProcessedEmails(retentionDays: number): number {
  const ledger = readProcessedEmails();
  const cutoff = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const before = ledger.entries.length;
  ledger.entries = ledger.entries.filter((e) => e.processedAt >= cutoff);
  const pruned = before - ledger.entries.length;
  if (pruned > 0) writeProcessedEmails(ledger);
  return pruned;
}

// ─── CreatedIssuesLedger ─────────────────────────────────────────────────────

const DEFAULT_ISSUES_LEDGER: CreatedIssuesLedger = { entries: [] };

export function readCreatedIssues(): CreatedIssuesLedger {
  return readJson<CreatedIssuesLedger>(
    dataPath("created-issues.json"),
    DEFAULT_ISSUES_LEDGER
  );
}

export function writeCreatedIssues(ledger: CreatedIssuesLedger): void {
  atomicWrite(dataPath("created-issues.json"), ledger);
}

export function recordCreatedIssue(
  entry: CreatedIssuesLedger["entries"][number]
): void {
  const ledger = readCreatedIssues();
  ledger.entries.push(entry);
  writeCreatedIssues(ledger);
}

export function findIssueByMessageId(
  messageId: string
): CreatedIssuesLedger["entries"][number] | null {
  const ledger = readCreatedIssues();
  return ledger.entries.find((e) => e.messageId === messageId) ?? null;
}
