/**
 * The fixed tag vocabulary. The matcher selects items by tag, so a typo would
 * silently hide an item from every tailored page; the schema rejects unknown tags.
 * Add a tag here first, then use it in content.
 */
export const TAGS = [
  "accessibility",
  "ai",
  "algorithms",
  "architecture",
  "backend",
  "ci",
  "cloud",
  "correctness",
  "cost",
  "data",
  "data-modelling",
  "delivery",
  "design",
  "developer-experience",
  "documentation",
  "dogfooding",
  "edge",
  "embedded",
  "frontend",
  "hardware",
  "integrations",
  "leadership",
  "mobile",
  "multi-tenant",
  "operations",
  "optimisation",
  "ownership",
  "parsing",
  "performance",
  "product",
  "python",
  "quality",
  "real-time",
  "security",
  "sync",
  "systems",
  "teamwork",
  "testing",
  "tooling",
] as const;

export type Tag = (typeof TAGS)[number];
