import type { Tag, TagRegistry, TagDimension } from "./types";

// ─── Validation ──────────────────────────────────────────────────────────────

/** Returns true if the tag string is structurally valid (has a prefix + value) */
export function isValidTag(tag: string): boolean {
  return /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]+$/.test(tag);
}

/**
 * Returns true if the tag is registered in the registry.
 * Unrecognized tags are allowed through (they may have been added by /onboard)
 * but this lets callers warn on unknown tags.
 */
export function isKnownTag(tag: Tag, registry: TagRegistry): boolean {
  for (const dim of Object.values(registry.dimensions)) {
    if (tag.startsWith(dim.prefix)) {
      const value = tag.slice(dim.prefix.length);
      return dim.tags.includes(value);
    }
  }
  return false;
}

// ─── Lookup ──────────────────────────────────────────────────────────────────

/** Returns all fully-prefixed tags for a given dimension, e.g. "domain" → ["domain/work", ...] */
export function tagsForDimension(
  dimensionName: string,
  registry: TagRegistry
): Tag[] {
  const dim = registry.dimensions[dimensionName];
  if (!dim) return [];
  return dim.tags.map((t) => `${dim.prefix}${t}`);
}

/** Returns the dimension name for a tag, or null if unrecognized */
export function dimensionOf(
  tag: Tag,
  registry: TagRegistry
): string | null {
  for (const [name, dim] of Object.entries(registry.dimensions)) {
    if (tag.startsWith(dim.prefix)) return name;
  }
  return null;
}

// ─── Registry Mutation ───────────────────────────────────────────────────────

/**
 * Adds a new tag value to an existing dimension.
 * Returns true if added, false if it already existed.
 */
export function addTagToDimension(
  dimensionName: string,
  tagValue: string,
  registry: TagRegistry
): boolean {
  const dim = registry.dimensions[dimensionName];
  if (!dim) return false;
  if (dim.tags.includes(tagValue)) return false;
  dim.tags.push(tagValue);
  return true;
}

/**
 * Adds an entirely new dimension to the registry.
 * Returns false if the dimension already exists.
 */
export function addDimension(
  name: string,
  dimension: TagDimension,
  registry: TagRegistry
): boolean {
  if (registry.dimensions[name]) return false;
  registry.dimensions[name] = dimension;
  return true;
}

// ─── GitHub Label Formatting ─────────────────────────────────────────────────

/**
 * Formats tags as GitHub issue labels.
 * Tags are used directly as label names — GitHub accepts slashes in label names.
 */
export function tagsToLabels(tags: Tag[]): string[] {
  return tags.filter(isValidTag);
}

// ─── Deduplication Helpers ────────────────────────────────────────────────────

/** Returns only unique tags, preserving first-seen order */
export function uniqueTags(tags: Tag[]): Tag[] {
  return [...new Set(tags)];
}

/** Merges two tag arrays, deduplicating */
export function mergeTags(a: Tag[], b: Tag[]): Tag[] {
  return uniqueTags([...a, ...b]);
}
