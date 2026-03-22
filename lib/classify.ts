import type {
  ClassificationResult,
  ClassificationRule,
  EmailMessage,
  UrgencyRules,
} from "./types";

// ─── Tier 1: Rule Engine ──────────────────────────────────────────────────────
//
// Pure code, no LLM. Pattern-matches email metadata against configured rules.
// Handles ~60-70% of emails: bills from known billers, calendar invites,
// school notifications from known domains, etc.

const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Attempts to classify an email using Tier 1 rule matching.
 * Returns null if no rule matches above the confidence threshold —
 * the caller should then attempt Tier 2, then Tier 3.
 */
export function classifyTier1(
  email: EmailMessage,
  rules: ClassificationRule[],
  urgencyRules: UrgencyRules
): ClassificationResult | null {
  let bestMatch: { rule: ClassificationRule; score: number } | null = null;

  for (const rule of rules) {
    const score = scoreRule(email, rule);
    if (score >= CONFIDENCE_THRESHOLD && score > (bestMatch?.score ?? 0)) {
      bestMatch = { rule, score };
    }
  }

  if (!bestMatch) return null;

  const urgency = deriveUrgency(email, urgencyRules, bestMatch.rule.tags);

  return {
    tags: bestMatch.rule.tags,
    confidence: bestMatch.score,
    tier: 1,
    reasoning: `Matched rule '${bestMatch.rule.name}' (score: ${bestMatch.score.toFixed(2)})`,
    suggestedUrgency: urgency,
    extractedDueDate: extractDueDate(email, bestMatch.rule.dueDateExtraction),
  };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreRule(email: EmailMessage, rule: ClassificationRule): number {
  const signals: boolean[] = [];
  const subjectLower = email.subject.toLowerCase();
  const senderLower = email.sender.toLowerCase();

  for (const keyword of rule.keywords) {
    signals.push(
      subjectLower.includes(keyword.toLowerCase()) ||
        email.snippet.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  for (const pattern of rule.senderPatterns) {
    signals.push(new RegExp(pattern, "i").test(senderLower));
  }

  for (const pattern of rule.subjectPatterns) {
    signals.push(new RegExp(pattern, "i").test(email.subject));
  }

  if (signals.length === 0) return 0;

  const hits = signals.filter(Boolean).length;
  // Weight: any sender match is strong signal; subject/keyword hits accumulate
  const senderHits = rule.senderPatterns.filter((p) =>
    new RegExp(p, "i").test(senderLower)
  ).length;

  const rawScore = hits / signals.length;
  // Boost score if a sender pattern matched — sender is more reliable than keywords
  const boost = senderHits > 0 ? 0.2 : 0;
  return Math.min(1, rawScore + boost);
}

// ─── Urgency ──────────────────────────────────────────────────────────────────

function deriveUrgency(
  email: EmailMessage,
  rules: UrgencyRules,
  tags: string[]
): ClassificationResult["suggestedUrgency"] {
  const senderLower = email.sender.toLowerCase();
  const subjectLower = email.subject.toLowerCase();

  if (rules.vipSenders.some((v) => senderLower.includes(v.toLowerCase()))) {
    return "high";
  }

  for (const [keyword, urgency] of Object.entries(rules.keywordEscalators)) {
    if (
      subjectLower.includes(keyword.toLowerCase()) ||
      email.snippet.toLowerCase().includes(keyword.toLowerCase())
    ) {
      return urgency;
    }
  }

  if (tags.includes("urgency/critical")) return "critical";
  if (tags.includes("urgency/high")) return "high";
  if (tags.includes("urgency/medium")) return "medium";
  if (tags.includes("urgency/low")) return "low";

  return "medium";
}

// ─── Due Date Extraction ──────────────────────────────────────────────────────

// Simple pattern matching for Phase 1 — Tier 3 LLM will handle complex cases in Phase 2
const DUE_DATE_PATTERNS = [
  /\bdue\s+(?:by\s+)?(\w+\s+\d{1,2}(?:,?\s+\d{4})?)/i,
  /\bby\s+(\w+\s+\d{1,2}(?:,?\s+\d{4})?)/i,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:,?\s+\d{4})?/i,
  /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/,
];

function extractDueDate(
  email: EmailMessage,
  strategy: ClassificationRule["dueDateExtraction"]
): string | null {
  if (strategy === "none") return null;

  const text = strategy === "subject" ? email.subject : email.snippet;
  for (const pattern of DUE_DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

// ─── Tier 2: Structural Signals ───────────────────────────────────────────────
//
// Pure code, no LLM. Checks email metadata for structural signals that indicate
// actionability regardless of content: calendar attachments, VIP senders,
// explicit date mentions in subject, known meeting note senders, etc.
// Catches an additional ~10-15% beyond Tier 1.

export interface Tier2Config {
  /** Senders that are always high-signal — creates issue regardless of content */
  vipSenders: string[];
  /** Known meeting note service sender patterns (regex) */
  meetingNoteSenderPatterns: string[];
  /** Thread ID → existing classification (for thread inheritance) */
  classifiedThreads?: Map<string, ClassificationResult>;
}

/**
 * Attempts Tier 2 structural classification.
 * Returns null if no structural signal is detected.
 */
export function classifyTier2(
  email: EmailMessage,
  urgencyRules: UrgencyRules,
  config: Tier2Config
): ClassificationResult | null {
  const signals: string[] = [];
  const tags: string[] = [`source/email`, `mailbox/${email.mailboxId}`];

  // Signal: .ics attachment indicator — subject patterns used as proxy
  // (The Gmail MCP snippet often includes the word "invitation" or ".ics")
  if (hasCalendarSignal(email)) {
    tags.push("type/meeting", "time/has-due-date");
    signals.push("calendar-signal");
  }

  // Signal: VIP sender
  const senderLower = email.sender.toLowerCase();
  const isVip = config.vipSenders.some((v) =>
    senderLower.includes(v.toLowerCase())
  );
  if (isVip) {
    signals.push("vip-sender");
  }

  // Signal: Known meeting note service sender
  const isMeetingNote = config.meetingNoteSenderPatterns.some((p) =>
    new RegExp(p, "i").test(email.sender)
  );
  if (isMeetingNote) {
    tags.push("source/meeting-notes", "type/action");
    signals.push("meeting-note-service");
  }

  // Signal: Subject contains an explicit date reference
  if (hasDateInSubject(email.subject)) {
    if (!tags.includes("time/has-due-date")) {
      tags.push("time/has-due-date");
    }
    signals.push("date-in-subject");
  }

  // Signal: Thread inheritance — if a prior message in this thread was classified
  if (config.classifiedThreads && email.messageId) {
    const prior = config.classifiedThreads.get(email.messageId);
    if (prior) {
      return {
        ...prior,
        tier: 2,
        reasoning: `Thread inheritance from prior classification: ${prior.reasoning}`,
      };
    }
  }

  if (signals.length === 0) return null;

  const urgency = deriveUrgency(email, urgencyRules, tags);
  const extractedDueDate = extractDueDate(email, "subject");

  return {
    tags: [...new Set(tags)],
    confidence: 0.65 + signals.length * 0.05,
    tier: 2,
    reasoning: `Structural signals: ${signals.join(", ")}`,
    suggestedUrgency: isVip ? "high" : urgency,
    extractedDueDate,
  };
}

// ─── Tier 2 Helpers ───────────────────────────────────────────────────────────

const CALENDAR_PATTERNS = [
  /\binvitation\b/i,
  /\bcalendar\s+invite\b/i,
  /\.ics\b/i,
  /\bschedule\b.*\bmeeting\b/i,
  /\bmeeting\s+request\b/i,
  /\byou(?:'re|'re)?\s+invited\b/i,
  /\bhas\s+shared\s+an?\s+event\b/i,
];

function hasCalendarSignal(email: EmailMessage): boolean {
  const text = `${email.subject} ${email.snippet}`;
  return CALENDAR_PATTERNS.some((p) => p.test(text));
}

const SUBJECT_DATE_PATTERNS = [
  /\b(today|tomorrow)\b/i,
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}\b/i,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
  /\bby\s+(?:end\s+of\s+)?(?:this\s+)?(week|month|day)\b/i,
];

function hasDateInSubject(subject: string): boolean {
  return SUBJECT_DATE_PATTERNS.some((p) => p.test(subject));
}

// ─── Fallback: unclassified result ───────────────────────────────────────────

/**
 * Returns a minimal classification for emails that fall through all tiers.
 * Used when Tier 1, Tier 2, and Tier 3 all fail to classify.
 */
export function unclassifiedResult(mailboxId: string): ClassificationResult {
  return {
    tags: [`mailbox/${mailboxId}`, "source/email"],
    confidence: 0,
    tier: 1,
    reasoning: "No rule matched; tagged with mailbox and source only",
    suggestedUrgency: null,
    extractedDueDate: null,
  };
}

// ─── Tier 3 Response Shape ────────────────────────────────────────────────────
//
// Tier 3 (Haiku LLM) is invoked by the skill/command layer, not from this lib.
// This lib defines the expected response shape so callers can type-check it.

export interface Tier3Response {
  tags: string[];
  confidence: number;
  reasoning: string;
  suggestedUrgency: "critical" | "high" | "medium" | "low" | null;
  extractedDueDate: string | null;
}

/**
 * Converts a validated Tier 3 LLM response into a ClassificationResult.
 * The LLM response is pre-validated by the caller before being passed here.
 */
export function tier3ResponseToResult(
  response: Tier3Response
): ClassificationResult {
  return {
    tags: response.tags,
    confidence: response.confidence,
    tier: 3,
    reasoning: response.reasoning,
    suggestedUrgency: response.suggestedUrgency,
    extractedDueDate: response.extractedDueDate,
  };
}

/**
 * Builds the Haiku prompt for Tier 3 classification.
 * Exported so callers (skills/commands) can use the canonical prompt.
 */
export function buildTier3Prompt(
  email: EmailMessage,
  availableTags: string[]
): string {
  return `You are a personal task classifier. Given an email, determine if it requires action and classify it with the appropriate tags.

Available tags: ${availableTags.join(", ")}

Email:
- Subject: ${email.subject}
- Sender: ${email.sender}
- Date: ${email.date}
- Snippet: ${email.snippet.slice(0, 500)}

Respond with valid JSON only — no markdown, no explanation outside the JSON:
{
  "tags": ["tag1", "tag2"],
  "confidence": 0.0,
  "reasoning": "brief reason",
  "suggestedUrgency": "medium",
  "extractedDueDate": null
}

Rules:
- Only use tags from the available list
- Always include source/email and the appropriate mailbox/ tag
- confidence is 0.0–1.0
- suggestedUrgency must be one of: critical, high, medium, low, or null
- extractedDueDate is an ISO date string like "2026-03-31" or null
- If the email is not actionable (newsletter, FYI, spam), return empty tags array and confidence 0.1`;
}
