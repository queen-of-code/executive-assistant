import { classifyTier1, unclassifiedResult } from "./classify";
import type {
  ClassificationRule,
  EmailMessage,
  UrgencyRules,
} from "./types";

const urgencyRules: UrgencyRules = {
  vipSenders: ["boss@company.com"],
  keywordEscalators: {
    urgent: "high",
    "action required": "high",
    critical: "critical",
  },
};

function makeEmail(overrides: Partial<EmailMessage> = {}): EmailMessage {
  return {
    messageId: "msg-001",
    subject: "Your Visa bill is due",
    sender: "notifications@visa.com",
    date: "2026-03-22T10:00:00Z",
    snippet: "Your balance of $247 is due March 31.",
    mailboxId: "personal",
    ...overrides,
  };
}

const visaRule: ClassificationRule = {
  name: "visa-bill",
  tags: ["domain/finance", "type/bill", "source/email"],
  keywords: ["bill", "balance", "due"],
  senderPatterns: ["@visa\\.com"],
  subjectPatterns: ["bill\\s+is\\s+due"],
  confidence: 0.6,
  dueDateExtraction: "subject",
};

describe("classifyTier1", () => {
  it("matches a rule when sender and keywords align", () => {
    const result = classifyTier1(makeEmail(), [visaRule], urgencyRules);
    expect(result).not.toBeNull();
    expect(result?.tier).toBe(1);
    expect(result?.tags).toContain("domain/finance");
    expect(result?.tags).toContain("type/bill");
  });

  it("returns null when no rule matches", () => {
    const email = makeEmail({ subject: "Team lunch tomorrow", sender: "alice@company.com", snippet: "See you at noon." });
    const result = classifyTier1(email, [visaRule], urgencyRules);
    expect(result).toBeNull();
  });

  it("escalates urgency for VIP sender", () => {
    const email = makeEmail({ sender: "boss@company.com" });
    const result = classifyTier1(email, [visaRule], urgencyRules);
    expect(result?.suggestedUrgency).toBe("high");
  });

  it("escalates urgency for keyword match", () => {
    const email = makeEmail({ subject: "URGENT: Your Visa bill is due" });
    const result = classifyTier1(email, [visaRule], urgencyRules);
    expect(result?.suggestedUrgency).toBe("high");
  });

  it("extracts due date from subject when configured", () => {
    const email = makeEmail({ subject: "Bill due March 31" });
    const result = classifyTier1(email, [visaRule], urgencyRules);
    expect(result?.extractedDueDate).toMatch(/march\s+31/i);
  });

  it("does not extract due date when strategy is none", () => {
    const rule: ClassificationRule = { ...visaRule, dueDateExtraction: "none" };
    const result = classifyTier1(makeEmail(), [rule], urgencyRules);
    expect(result?.extractedDueDate).toBeNull();
  });

  it("picks the best-scoring rule when multiple match", () => {
    const weaker: ClassificationRule = {
      name: "generic-bill",
      tags: ["type/bill"],
      keywords: ["statement"],
      senderPatterns: [],
      subjectPatterns: [],
      confidence: 0.6,
      dueDateExtraction: "none",
    };
    // The email has a visa.com sender which only visaRule matches — should win clearly
    const result = classifyTier1(makeEmail(), [weaker, visaRule], urgencyRules);
    expect(result?.reasoning).toContain("visa-bill");
  });
});

describe("unclassifiedResult", () => {
  it("returns a safe fallback with mailbox and source tags", () => {
    const result = unclassifiedResult("personal");
    expect(result.tags).toContain("mailbox/personal");
    expect(result.tags).toContain("source/email");
    expect(result.confidence).toBe(0);
  });
});
