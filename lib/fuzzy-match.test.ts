import { matchIssue } from "./fuzzy-match";
import type { Issue } from "./types";

function makeIssue(number: number, title: string): Issue {
  return {
    number,
    title,
    body: "",
    labels: [],
    state: "open",
    createdAt: "2026-03-22T00:00:00Z",
    updatedAt: "2026-03-22T00:00:00Z",
    url: `https://github.com/test/repo/issues/${number}`,
  };
}

const issues: Issue[] = [
  makeIssue(1, "Fertilize citrus trees"),
  makeIssue(2, "Pick up Timmy's soccer cleats"),
  makeIssue(3, "Review Q3 budget report"),
  makeIssue(4, "Pay Visa bill"),
  makeIssue(5, "Buy citrus fertilizer"),
];

describe("matchIssue", () => {
  it("returns exact match for near-identical input", () => {
    const result = matchIssue("Fertilize citrus trees", issues);
    expect(result.type).toBe("exact");
    if (result.type === "exact") {
      expect(result.match.issue.number).toBe(1);
    }
  });

  it("returns exact match for partial / abbreviated input", () => {
    const result = matchIssue("pay visa", issues);
    expect(result.type).toBe("exact");
    if (result.type === "exact") {
      expect(result.match.issue.number).toBe(4);
    }
  });

  it("returns ambiguous when two issues are similarly named", () => {
    const result = matchIssue("citrus", issues);
    // Both 'Fertilize citrus trees' and 'Buy citrus fertilizer' are candidates
    expect(result.type).toBe("ambiguous");
    if (result.type === "ambiguous") {
      const numbers = result.candidates.map((c: { issue: { number: number } }) => c.issue.number);
      expect(numbers).toContain(1);
      expect(numbers).toContain(5);
    }
  });

  it("returns none when no close match exists", () => {
    const result = matchIssue("completely unrelated thing", issues);
    expect(result.type).toBe("none");
  });

  it("handles empty issue list", () => {
    const result = matchIssue("anything", []);
    expect(result.type).toBe("none");
  });

  it("is case-insensitive", () => {
    const result = matchIssue("FERTILIZE CITRUS TREES", issues);
    expect(result.type).toBe("exact");
    if (result.type === "exact") {
      expect(result.match.issue.number).toBe(1);
    }
  });
});
