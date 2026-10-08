// QAR only. All arithmetic is done in whole dirhams x 100 ("minor units", integers) so totals never drift.
export class MoneyError extends Error {}

const roundHalfAway = (x: number) => (x < 0 ? -Math.round(-x) : Math.round(x));

// "1234.56" | 1234.56 | Decimal-like -> 123456. Rejects NaN/Infinity and more than 2 decimal places of precision loss > 0.005.
export function toMinor(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, "").trim());
  if (!Number.isFinite(n)) throw new MoneyError("Enter a valid amount.");
  return roundHalfAway(n * 100 + (n < 0 ? -1e-7 : 1e-7));
}
export const fromMinor = (m: number) => m / 100;
export const fmtQar = (m: number) => `QAR ${(m / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function lineAmountMinor(quantity: number, unitPriceMinor: number): number {
  if (!Number.isFinite(quantity) || quantity < 0) throw new MoneyError("Quantity must be zero or more.");
  return roundHalfAway(quantity * unitPriceMinor);
}

export type LineIn = { quantity: number; unitPriceMinor: number };
export function totals(lines: LineIn[], taxRatePct: number) {
  if (!Number.isFinite(taxRatePct) || taxRatePct < 0 || taxRatePct > 100) throw new MoneyError("Tax must be between 0 and 100 percent.");
  const subtotal = lines.reduce((a, l) => a + lineAmountMinor(l.quantity, l.unitPriceMinor), 0);
  const tax = roundHalfAway((subtotal * taxRatePct) / 100);
  return { subtotal, tax, total: subtotal + tax };
}
