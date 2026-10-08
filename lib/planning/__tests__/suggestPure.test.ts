import { describe, it, expect } from "vitest";
import { durationDays, chooseRate, clampQty, readPicks, validatePicks, suggestionPrompt, cost, type Candidate } from "../suggestPure";

const cand = (o: Partial<Candidate> & { assetId: string }): Candidate => ({ assetName: o.assetId, supplier: "S", area: "Doha", mediaType: "MUPI", channel: "OOH", rateId: "r", rateYear: 2026, isFallback: false, period: "2 weeks", unitCost: 1000, maxQty: 10, ...o });

describe("durationDays", () => {
  it("converts weeks, months and years, singular or plural", () => {
    expect(durationDays(2, "weeks")).toBe(14); expect(durationDays(1, "Month")).toBe(30); expect(durationDays(1, "years")).toBe(365); expect(durationDays(5, "days")).toBe(5);
  });
  it("returns null for anything unknown", () => {
    expect(durationDays(null, "weeks")).toBeNull(); expect(durationDays(2, null)).toBeNull(); expect(durationDays(2, "fortnights")).toBeNull(); expect(durationDays(0, "weeks")).toBeNull();
  });
});

describe("chooseRate", () => {
  const r = (id: string, v: number | null, u: string | null, st = "KNOWN") => ({ id, durationValue: v, durationUnit: u, grossRateStatus: st });
  it("picks the period closest to the campaign length", () => {
    const rates = [r("2w", 2, "weeks"), r("3m", 3, "months"), r("12m", 12, "months")];
    expect(chooseRate(rates, 30)!.id).toBe("2w");      // 14 vs 90 vs 360 days from 30
    expect(chooseRate(rates, 80)!.id).toBe("3m");
    expect(chooseRate(rates, 400)!.id).toBe("12m");
  });
  it("prefers a priced rate over a closer TBD one, and never fails on unknown durations", () => {
    expect(chooseRate([r("tbd", 4, "weeks", "TBD"), r("known", 12, "months")], 28)!.id).toBe("known");
    expect(chooseRate([r("a", null, null)], 30)!.id).toBe("a");
    expect(chooseRate([], 30)).toBeNull();
  });
});

describe("readPicks / clampQty", () => {
  it("reads picks with aliases and ignores junk", () => {
    expect(readPicks({ picks: [{ assetId: "a", qty: 2, why: "x" }, { id: "b", quantity: "3", reason: "y" }, {}, null] })).toEqual([{ assetId: "a", qty: 2, why: "x" }, { assetId: "b", qty: 3, why: "y" }]);
    expect(readPicks(null)).toEqual([]); expect(readPicks({ picks: "nope" })).toEqual([]);
  });
  it("clamps quantities to a whole number between 1 and the maximum", () => {
    expect(clampQty(0, 5)).toBe(1); expect(clampQty(99, 5)).toBe(5); expect(clampQty(2.9, 5)).toBe(2); expect(clampQty("x", 5)).toBe(1); expect(clampQty(3, 0)).toBe(1);
  });
});

describe("validatePicks", () => {
  const catalogue = [cand({ assetId: "a", maxQty: 4 }), cand({ assetId: "tbd", unitCost: null })];
  it("drops invented assets, TBD-priced assets and duplicates, and clamps quantities", () => {
    const { lines, dropped } = validatePicks([{ assetId: "a", qty: 99 }, { assetId: "ghost", qty: 1 }, { assetId: "tbd", qty: 1 }, { assetId: "a", qty: 2 }], catalogue);
    expect(lines).toEqual([{ assetId: "a", qty: 4, why: undefined }]);
    expect(dropped.map((d) => d.assetId)).toEqual(["ghost", "tbd", "a"]);
    expect(dropped.find((d) => d.assetId === "tbd")!.reason).toMatch(/TBD|quote/);
  });
});

describe("cost and prompt", () => {
  it("never turns an unknown price into a number", () => {
    expect(cost(cand({ assetId: "x", unitCost: 1234.5 }), 3)).toBe(3703.5); expect(cost(cand({ assetId: "x", unitCost: null }), 3)).toBeNull();
  });
  it("lists only priced assets and states the budget and the no-invention rules", () => {
    const p = suggestionPrompt({ campaign: { start: "2026-11-01", end: "2026-11-30" }, brief: "Reach commuters", budget: 250000, client: "QNB", candidates: [cand({ assetId: "a", assetName: "Corniche Mupi" }), cand({ assetId: "tbd", unitCost: null })] });
    expect(p.system).toContain("Corniche Mupi"); expect(p.system).not.toContain("tbd |"); expect(p.pricedCount).toBe(1);
    expect(p.system).toContain("QAR 250000"); expect(p.system).toMatch(/never invent/i); expect(p.user).toContain("Reach commuters");
  });
});
