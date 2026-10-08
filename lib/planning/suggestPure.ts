// Inventory suggestions: the AI chooses WHICH real assets and HOW MANY from a catalogue built from the planner's
// own inventory and published rates. It never supplies a price: every pick is validated against the catalogue and
// re-priced by the planner engine. This module is pure (no database) so it can be tested directly.

export type RateOption = { id: string; durationValue: number | null; durationUnit: string | null; grossRateStatus: string };

export type Candidate = {
  assetId: string; assetName: string; supplier: string; area: string; mediaType: string; channel: string;
  rateId: string; rateYear: number | null; isFallback: boolean; period: string;
  /** Line total for ONE unit over the campaign period (QAR); null when a rate or fee is TBD/POA. */
  unitCost: number | null; maxQty: number;
};
export type Pick = { assetId: string; qty: number; why?: string };

/** Length of a stored rate period in days (null when unknown). */
export function durationDays(value: number | null, unit: string | null): number | null {
  if (value === null || !unit || !(value > 0)) return null;
  const u = unit.toLowerCase().replace(/s$/, "");
  const per: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
  return u in per ? value * per[u] : null;
}

/**
 * Chooses which published rate period to price a suggestion with: priced rates first, then the period closest to the
 * campaign length. (The add-asset page lets a planner switch period afterwards; this only picks a sensible default.)
 */
export function chooseRate<T extends RateOption>(rates: T[], campaignDays: number): T | null {
  if (!rates.length) return null;
  const score = (r: T) => {
    const d = durationDays(r.durationValue, r.durationUnit);
    return (r.grossRateStatus === "KNOWN" ? 0 : 1e9) + (d === null ? 1e6 : Math.abs(d - campaignDays));
  };
  return [...rates].sort((a, b) => score(a) - score(b))[0];
}

export const clampQty = (q: unknown, max: number): number => {
  const n = Math.floor(Number(q));
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), Math.max(1, Math.floor(max))) : 1;
};

/** Reads the model's JSON: { picks: [{ assetId, qty, why }] } (tolerates id/quantity/reason aliases). */
export function readPicks(json: unknown): Pick[] {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const arr = Array.isArray(o.picks) ? o.picks : Array.isArray(json) ? (json as unknown[]) : [];
  return arr.slice(0, 80).flatMap((p) => {
    const x = (p ?? {}) as Record<string, unknown>;
    const id = String(x.assetId ?? x.id ?? "").trim();
    return id ? [{ assetId: id, qty: Number(x.qty ?? x.quantity ?? 1), why: x.why == null && x.reason == null ? undefined : String(x.why ?? x.reason).slice(0, 300) }] : [];
  });
}

export type ValidatedLine = { assetId: string; qty: number; why?: string };
export type Dropped = { assetId: string; reason: string };

/** Keeps only picks that exist in the catalogue and have a known price; clamps quantities; removes duplicates. */
export function validatePicks(picks: Pick[], candidates: Candidate[]): { lines: ValidatedLine[]; dropped: Dropped[] } {
  const byId = new Map(candidates.map((c) => [c.assetId, c]));
  const seen = new Set<string>(); const lines: ValidatedLine[] = []; const dropped: Dropped[] = [];
  for (const p of picks) {
    const c = byId.get(p.assetId);
    if (!c) { dropped.push({ assetId: p.assetId, reason: "Not in the inventory catalogue (ignored)." }); continue; }
    if (seen.has(p.assetId)) { dropped.push({ assetId: p.assetId, reason: "Picked twice (kept the first)." }); continue; }
    if (c.unitCost === null) { dropped.push({ assetId: p.assetId, reason: `${c.assetName}: rate or fee is TBD/POA, so it needs a quote.` }); continue; }
    seen.add(p.assetId);
    lines.push({ assetId: p.assetId, qty: clampQty(p.qty, c.maxQty), why: p.why });
  }
  return { lines, dropped };
}

export const cost = (c: Candidate, qty: number) => (c.unitCost === null ? null : Math.round(c.unitCost * qty * 100) / 100);

export function suggestionPrompt(opts: { campaign: { start: string; end: string }; brief: string; budget: number | null; client?: string; candidates: Candidate[] }) {
  const priced = opts.candidates.filter((c) => c.unitCost !== null);
  const catalogue = priced.map((c) => [c.assetId, c.assetName, c.supplier, c.area, c.mediaType, c.channel, c.period, Math.round(c.unitCost as number), c.maxQty].join(" | ")).join("\n");
  const system = `You are the head of media planning at Publicis Media Qatar. Choose assets from the inventory catalogue below for the brief. Rules: use ONLY assetId values that appear in the catalogue; never invent assets or prices. unitCost is the REAL total in QAR for ONE unit over the whole campaign period; choose qty (a whole number from 1 to maxQty) so that the sum of qty x unitCost stays within the budget${opts.budget ? ` of QAR ${Math.round(opts.budget)}` : ""}. Prefer a sensible mix across areas and suppliers unless the brief asks otherwise, and give a one-sentence reason for each pick. Return only JSON: {"picks":[{"assetId":"...","qty":2,"why":"..."}]}\n\nCatalogue columns: assetId | name | supplier | area | type | channel | rate period | unitCost (QAR) | maxQty\n${catalogue}`;
  const user = `Brief: ${opts.brief.trim()}\n${opts.client ? `Client: ${opts.client}\n` : ""}Campaign dates: ${opts.campaign.start} to ${opts.campaign.end}\nBudget (QAR): ${opts.budget ? Math.round(opts.budget) : "decide sensibly"}`;
  return { system, user, pricedCount: priced.length };
}
