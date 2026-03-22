import { isEmailProcessed, markEmailProcessed, findIssueByMessageId } from "./state";
import type { EmailMessage, ClassificationResult } from "./types";

// ─── Email Deduplication ──────────────────────────────────────────────────────
//
// Two-layer dedup system:
//   Layer 1 — processed-emails.json ledger: fast local check by messageId
//   Layer 2 — created-issues.json ledger: catches cases where the email was
//              processed but the issue creation failed, or during backfills
//              where the ledger may have been pruned
//
// Double-processing is structurally impossible as long as callers use
// recordProcessedEmail() after a successful issue creation.

/**
 * Returns true if this email should be skipped.
 * Checks the processed-emails ledger only (Layer 1).
 * Fast — pure file read, no API call.
 */
export function isDuplicate(email: EmailMessage): boolean {
  return isEmailProcessed(email.messageId);
}

/**
 * Returns the existing GitHub issue number if this email was already turned
 * into an issue, or null if not found.
 * Checks the created-issues ledger (Layer 2).
 */
export function findExistingIssue(email: EmailMessage): number | null {
  const record = findIssueByMessageId(email.messageId);
  return record?.issueNumber ?? null;
}

/**
 * Records a processed email in the dedup ledger.
 * Must be called after successful issue creation (or intentional skip).
 * issueNumber is null for skipped emails (e.g., not actionable).
 */
export function recordProcessedEmail(
  email: EmailMessage,
  result: ClassificationResult,
  issueNumber: number | null
): void {
  markEmailProcessed({
    messageId: email.messageId,
    processedAt: new Date().toISOString(),
    tier: result.tier,
    tags: result.tags,
    issueNumber,
    mailboxId: email.mailboxId,
  });
}

/**
 * Filters a batch of emails to only those not yet processed.
 * Logs skipped counts for scan summary reporting.
 */
export function filterNewEmails(emails: EmailMessage[]): {
  newEmails: EmailMessage[];
  skippedCount: number;
} {
  const newEmails = emails.filter((e) => !isDuplicate(e));
  return {
    newEmails,
    skippedCount: emails.length - newEmails.length,
  };
}
