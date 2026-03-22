import {
  isValidTag,
  isKnownTag,
  tagsForDimension,
  dimensionOf,
  addTagToDimension,
  addDimension,
  tagsToLabels,
  uniqueTags,
  mergeTags,
} from "./tag-engine";
import type { TagRegistry } from "./types";

const registry: TagRegistry = {
  dimensions: {
    domain: {
      prefix: "domain/",
      tags: ["work", "kids", "home"],
    },
    urgency: {
      prefix: "urgency/",
      tags: ["critical", "high", "medium", "low"],
    },
  },
};

describe("isValidTag", () => {
  it("accepts valid prefixed tags", () => {
    expect(isValidTag("domain/work")).toBe(true);
    expect(isValidTag("urgency/critical")).toBe(true);
    expect(isValidTag("source/email")).toBe(true);
  });

  it("rejects tags without prefix", () => {
    expect(isValidTag("work")).toBe(false);
    expect(isValidTag("")).toBe(false);
  });

  it("rejects tags with invalid characters", () => {
    expect(isValidTag("Domain/Work")).toBe(false);
    expect(isValidTag("domain / work")).toBe(false);
  });
});

describe("isKnownTag", () => {
  it("returns true for registered tags", () => {
    expect(isKnownTag("domain/work", registry)).toBe(true);
    expect(isKnownTag("urgency/high", registry)).toBe(true);
  });

  it("returns false for unregistered tags", () => {
    expect(isKnownTag("domain/gardening", registry)).toBe(false);
    expect(isKnownTag("person/timmy", registry)).toBe(false);
  });
});

describe("tagsForDimension", () => {
  it("returns prefixed tags for a dimension", () => {
    expect(tagsForDimension("domain", registry)).toEqual([
      "domain/work",
      "domain/kids",
      "domain/home",
    ]);
  });

  it("returns empty array for unknown dimension", () => {
    expect(tagsForDimension("nonexistent", registry)).toEqual([]);
  });
});

describe("dimensionOf", () => {
  it("returns the dimension name for a known tag", () => {
    expect(dimensionOf("domain/work", registry)).toBe("domain");
    expect(dimensionOf("urgency/critical", registry)).toBe("urgency");
  });

  it("returns null for unrecognized prefix", () => {
    expect(dimensionOf("person/timmy", registry)).toBeNull();
  });
});

describe("addTagToDimension", () => {
  it("adds a new tag value", () => {
    const reg: TagRegistry = {
      dimensions: {
        domain: { prefix: "domain/", tags: ["work"] },
      },
    };
    expect(addTagToDimension("domain", "garden", reg)).toBe(true);
    expect(reg.dimensions["domain"].tags).toContain("garden");
  });

  it("returns false if tag already exists", () => {
    const reg: TagRegistry = {
      dimensions: {
        domain: { prefix: "domain/", tags: ["work"] },
      },
    };
    expect(addTagToDimension("domain", "work", reg)).toBe(false);
  });

  it("returns false for unknown dimension", () => {
    expect(addTagToDimension("nonexistent", "foo", registry)).toBe(false);
  });
});

describe("addDimension", () => {
  it("adds a new dimension", () => {
    const reg: TagRegistry = { dimensions: {} };
    const result = addDimension(
      "person",
      { prefix: "person/", tags: ["self"] },
      reg
    );
    expect(result).toBe(true);
    expect(reg.dimensions["person"]).toBeDefined();
  });

  it("returns false if dimension already exists", () => {
    const reg: TagRegistry = {
      dimensions: { domain: { prefix: "domain/", tags: [] } },
    };
    expect(
      addDimension("domain", { prefix: "domain/", tags: [] }, reg)
    ).toBe(false);
  });
});

describe("tagsToLabels", () => {
  it("filters out invalid tags", () => {
    expect(tagsToLabels(["domain/work", "invalid", "urgency/high"])).toEqual([
      "domain/work",
      "urgency/high",
    ]);
  });
});

describe("uniqueTags", () => {
  it("deduplicates tags", () => {
    expect(uniqueTags(["domain/work", "domain/work", "urgency/high"])).toEqual([
      "domain/work",
      "urgency/high",
    ]);
  });
});

describe("mergeTags", () => {
  it("merges and deduplicates", () => {
    const result = mergeTags(
      ["domain/work", "urgency/high"],
      ["domain/work", "source/email"]
    );
    expect(result).toEqual(["domain/work", "urgency/high", "source/email"]);
  });
});
