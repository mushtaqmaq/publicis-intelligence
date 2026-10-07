/**
 * Small normalization helpers shared by the ingestion pipeline. Kept
 * separate and pure so they're trivially unit-testable, and so the "never
 * treat TBD as zero" rule lives in exactly one place.
 */

export type MoneyStatus =
  | "KNOWN"
  | "TBD"
  | "NOT_APPLICABLE"
  | "ON_REQUEST"
  | "POA"
  | "TO_BE_CONFIRMED";

const STATUS_PATTERNS: Array<{ pattern: RegExp; status: MoneyStatus }> = [
  { pattern: /\bt\.?b\.?d\.?\b/i, status: "TBD" },
  { pattern: /\bto be confirmed\b/i, status: "TO_BE_CONFIRMED" },
  { pattern: /\bon request\b/i, status: "ON_REQUEST" },
  { pattern: /\bp\.?o\.?a\.?\b/i, status: "POA" },
  { pattern: /\bn\.?\/?a\.?\b/i, status: "NOT_APPLICABLE" },
];

/** Classifies a raw text value's money status. A present numeric value is
 *  always KNOWN even if surrounded by currency text; an absent/blank value
 *  is NOT_APPLICABLE, never silently coerced to zero. */
export function classifyMoneyStatus(raw: string | null | undefined): MoneyStatus {
  if (raw === null || raw === undefined || raw.trim() === "") return "NOT_APPLICABLE";
  for (const { pattern, status } of STATUS_PATTERNS) {
    if (pattern.test(raw)) return status;
  }
  return /\d/.test(raw) ? "KNOWN" : "NOT_APPLICABLE";
}

/** Parses free text like "2 weeks", "3 Months", "12months" into a
 *  {value, unit} pair. Returns null rather than guessing when the text
 *  doesn't match a recognized duration shape. */
export function parseDurationLabel(label: string | null): { value: number; unit: string } | null {
  if (!label) return null;
  const m = label.match(/(\d+)\s*(week|weeks|month|months|year|years|day|days)/i);
  if (!m) return null;
  const value = Number(m[1]);
  const unitRaw = m[2].toLowerCase();
  const unit = unitRaw.endsWith("s") ? unitRaw : `${unitRaw}s`;
  return { value, unit };
}
