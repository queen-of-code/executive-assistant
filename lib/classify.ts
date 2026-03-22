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
//
// Tier 2 (structural signals) and Tier 3 (LLM) are Phase 2 additions.

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

// ─── Fallback: unclassified result ───────────────────────────────────────────

/**
 * Returns a minimal classification for emails that fall through all tiers.
 * In Phase 1 (Tier 1 only), this is the fallback for anything that doesn't match rules.
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
