// Core type definitions for MLEA.
// These are the shared interfaces used across all lib/ modules.
// The architecture doc (Project-Overview-Architecture.md) is the source of truth.

// ─── Tag System ──────────────────────────────────────────────────────────────

export interface TagDimension {
  prefix: string;
  tags: string[];
}

export interface TagRegistry {
  dimensions: Record<string, TagDimension>;
}

/** Returns a fully-prefixed tag string, e.g. "domain/work" */
export type Tag = string;

// ─── Mailbox ─────────────────────────────────────────────────────────────────

export interface Mailbox {
  id: string;
  label: string;
  email: string;
  defaultTags: Tag[];
}

// ─── Classification ───────────────────────────────────────────────────────────

export interface ClassificationRule {
  name: string;
  tags: Tag[];
  keywords: string[];
  senderPatterns: string[];
  subjectPatterns: string[];
  /** 0–1, minimum signal density to trigger Tier 1 assignment */
  confidence: number;
  dueDateExtraction: "subject" | "body" | "none";
}

export type ClassificationTier = 1 | 2 | 3;

export interface ClassificationResult {
  tags: Tag[];
  confidence: number;
  tier: ClassificationTier;
  reasoning: string;
  suggestedUrgency: "critical" | "high" | "medium" | "low" | null;
  extractedDueDate: string | null;
}

// ─── Email ───────────────────────────────────────────────────────────────────

export interface EmailMessage {
  messageId: string;
  subject: string;
  sender: string;
  date: string;
  snippet: string;
  /** Full body — only populated for meeting note extraction (Phase 3) */
  body?: string;
  mailboxId: string;
}

// ─── Urgency ─────────────────────────────────────────────────────────────────

export interface UrgencyRules {
  vipSenders: string[];
  keywordEscalators: Record<string, "critical" | "high">;
}

// ─── Meeting Notes ────────────────────────────────────────────────────────────

export interface MeetingNotesConfig {
  senderPatterns: string[];
}

// ─── Recurring Tasks ─────────────────────────────────────────────────────────

export interface RecurringTask {
  id: string;
  title: string;
  cadence: string;
  cronExpression: string;
  tags: Tag[];
  nextDue: string;
  lastCreated: string;
  issueTemplate: {
    body: string;
    assignToSelf: boolean;
  };
}

// ─── Issue Tracker ───────────────────────────────────────────────────────────

export interface GitHubTrackerConfig {
  owner: string;
  repo: string;
  projectNumber: number;
  assignToSelf: boolean;
}

export interface IssueTrackerConfig {
  type: "github";
  github: GitHubTrackerConfig;
}

// ─── Scheduling ──────────────────────────────────────────────────────────────

export interface SchedulingConfig {
  emailScan: {
    /**
     * Intended cadence — stored for reference only. Cowork's scheduler
     * uses plain-language options (hourly, daily, etc.), not cron expressions.
     * ⚠️ UNVERIFIED: Whether 4x/day scanning is achievable via Cowork's scheduler.
     */
    cronExpression: string;
    maxEmailsPerRun: number;
    enabled: boolean;
  };
  dailyMaintenance: {
    /** Intended cadence — stored for reference. Actual Cowork cadence is "daily". */
    cronExpression: string;
    enabled: boolean;
  };
  dailyBriefing: {
    /** Intended cadence — stored for reference. Actual Cowork cadence is "on weekdays". */
    cronExpression: string;
    enabled: boolean;
  };
  backfill: {
    maxDays: number;
    batchSize: number;
  };
  pruning: {
    ledgerRetentionDays: number;
  };
}

// ─── Top-level Config ────────────────────────────────────────────────────────

export interface MLEAConfig {
  version: string;
  userName: string;
  nameVariants: string[];
  mailboxes: Mailbox[];
  /**
   * "connector" — use the built-in Claude Gmail connector (single account, no GCP setup).
   * "mcp"       — use the bundled gmail MCP server (multiple accounts, requires GCP OAuth client).
   * Defaults to "connector" so single-account users need no extra setup.
   */
  gmailMode: "connector" | "mcp";
  tagRegistry: TagRegistry;
  classificationRules: ClassificationRule[];
  urgencyRules: UrgencyRules;
  meetingNotes: MeetingNotesConfig;
  issueTracker: IssueTrackerConfig;
  scheduling: SchedulingConfig;
  recurringTasks: RecurringTask[];
}

// ─── Runtime State ────────────────────────────────────────────────────────────

export interface MailboxScanState {
  lastScanTimestamp: string;
  lastScanEmailCount: number;
  lastScanIssuesCreated: number;
  lastScanErrors: string[];
}

export interface MLEAStats {
  totalEmailsScanned: number;
  totalIssuesCreated: number;
  scansSinceInstall: number;
  tierBreakdown: { tier1: number; tier2: number; tier3: number };
  categoryBreakdown: Record<Tag, number>;
}

export interface MLEAState {
  mailboxes: Record<string, MailboxScanState>;
  lastMaintenanceRun: string | null;
  lastBriefingRun: string | null;
  stats: MLEAStats;
}

// ─── Dedup Ledger ────────────────────────────────────────────────────────────

export interface ProcessedEmailEntry {
  messageId: string;
  processedAt: string;
  tier: ClassificationTier;
  tags: Tag[];
  issueNumber: number | null;
  mailboxId: string;
}

export interface ProcessedEmailLedger {
  entries: ProcessedEmailEntry[];
}

// ─── Issue Tracking ───────────────────────────────────────────────────────────

export interface Issue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: "open" | "closed";
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface CreateIssueParams {
  title: string;
  body: string;
  labels: Tag[];
  assignee?: string;
  dueDate?: string;
  projectColumnName?: string;
}

export interface IssueFilters {
  state?: "open" | "closed" | "all";
  labels?: Tag[];
  dueBefore?: string;
  dueAfter?: string;
  createdAfter?: string;
  search?: string;
}

export interface CreatedIssueRecord {
  messageId: string;
  issueNumber: number;
  issueUrl: string;
  createdAt: string;
}

export interface CreatedIssuesLedger {
  entries: CreatedIssueRecord[];
}
