import { classifyTier1, unclassifiedResult, classifyTier2, buildTier3Prompt, tier3ResponseToResult } from "./classify";
import type {
  ClassificationRule,
  EmailMessage,
  UrgencyRules,
} from "./types";
import type { Tier2Config } from "./classify";

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

// ─── Tier 2 Tests ────────────────────────────────────────────────────────────

const tier2Config: Tier2Config = {
  vipSenders: ["boss@company.com", "ceo@corp.com"],
  meetingNoteSenderPatterns: ["no-reply@otter\\.ai", "meet@gemini\\.google\\.com"],
};

describe("classifyTier2 - calendar signals", () => {
  it("detects calendar invitation in subject", () => {
    const email = makeEmail({
      subject: "You're invited: Team standup",
      sender: "calendar-notification@google.com",
      snippet: "Dave has invited you to a meeting.",
    });
    const result = classifyTier2(email, urgencyRules, tier2Config);
    expect(result).not.toBeNull();
    expect(result?.tier).toBe(2);
    expect(result?.tags).toContain("type/meeting");
  });

  it("detects .ics mention in snippet", () => {
    const email = makeEmail({
      subject: "Meeting tomorrow",
      snippet: "See attached .ics file for calendar invite.",
    });
    const result = classifyTier2(email, urgencyRules, tier2Config);
    expect(result?.tags).toContain("type/meeting");
  });
});

describe("classifyTier2 - VIP senders", () => {
  it("elevates urgency for VIP sender", () => {
    const email = makeEmail({ sender: "boss@company.com" });
    const result = classifyTier2(email, urgencyRules, tier2Config);
    expect(result).not.toBeNull();
    expect(result?.suggestedUrgency).toBe("high");
  });

  it("returns null for non-VIP, non-structural email", () => {
    const email = makeEmail({
      subject: "Just a regular email",
      sender: "friend@example.com",
      snippet: "Nothing interesting here.",
    });
    const result = classifyTier2(email, urgencyRules, tier2Config);
    expect(result).toBeNull();
  });
});

describe("classifyTier2 - meeting note services", () => {
  it("detects meeting note sender", () => {
    const email = makeEmail({
      sender: "no-reply@otter.ai",
      subject: "Your meeting transcript from today",
      snippet: "Action items: 1. Follow up with Dave by Friday.",
    });
    const result = classifyTier2(email, urgencyRules, tier2Config);
    expect(result).not.toBeNull();
    expect(result?.tags).toContain("source/meeting-notes");
    expect(result?.tags).toContain("type/action");
  });
});

describe("classifyTier2 - date in subject", () => {
  it("adds time/has-due-date for subject with month/day", () => {
    const email = makeEmail({
      subject: "Performance review March 15",
      sender: "hr@company.com",
    });
    const result = classifyTier2(email, urgencyRules, tier2Config);
    expect(result?.tags).toContain("time/has-due-date");
  });

  it("adds time/has-due-date for subject with 'tomorrow'", () => {
    const email = makeEmail({
      subject: "Reminder: dentist appointment tomorrow",
      sender: "droffice@dental.com",
    });
    const result = classifyTier2(email, urgencyRules, tier2Config);
    expect(result?.tags).toContain("time/has-due-date");
  });
});

// ─── Tier 3 Helpers Tests ─────────────────────────────────────────────────────

describe("buildTier3Prompt", () => {
  it("includes email fields in prompt", () => {
    const email = makeEmail({ subject: "Timmy's soccer registration due", sender: "league@soccer.org" });
    const prompt = buildTier3Prompt(email, ["domain/kids", "type/action", "source/email"]);
    expect(prompt).toContain("Timmy's soccer registration due");
    expect(prompt).toContain("league@soccer.org");
    expect(prompt).toContain("domain/kids");
  });

  it("truncates snippet to 500 chars", () => {
    const longSnippet = "x".repeat(600);
    const email = makeEmail({ snippet: longSnippet });
    const prompt = buildTier3Prompt(email, ["source/email"]);
    expect(prompt).not.toContain("x".repeat(501));
  });
});

describe("tier3ResponseToResult", () => {
  it("converts LLM response to ClassificationResult with tier 3", () => {
    const response = {
      tags: ["domain/kids", "type/action", "source/email"],
      confidence: 0.85,
      reasoning: "Soccer registration with deadline",
      suggestedUrgency: "medium" as const,
      extractedDueDate: "2026-04-30",
    };
    const result = tier3ResponseToResult(response);
    expect(result.tier).toBe(3);
    expect(result.tags).toEqual(response.tags);
    expect(result.confidence).toBe(0.85);
    expect(result.extractedDueDate).toBe("2026-04-30");
  });
});
