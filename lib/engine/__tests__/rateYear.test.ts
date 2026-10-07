import { describe, it, expect } from "vitest";
import { selectRateYear, type RateYearCandidate } from "../rateYear";

function candidate(year: number, opts: Partial<RateYearCandidate> = {}): RateYearCandidate {
  return {
    rateYear: year,
    id: `rate-${year}`,
    effectiveFrom: new Date(Date.UTC(year, 0, 1)),
    effectiveTo: new Date(Date.UTC(year, 11, 31)),
    publishedAt: new Date(Date.UTC(year, 0, 1)),
    ...opts,
  };
}

const campaignStart = (year: number, month = 3, day = 15) => new Date(Date.UTC(year, month - 1, day));

describe("selectRateYear — from the project's own test matrix", () => {
  it("2026 rate exists -> select 2026", () => {
    const result = selectRateYear([candidate(2024), candidate(2025), candidate(2026)], campaignStart(2026));
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.selected.rateYear).toBe(2026);
      expect(result.isFallback).toBe(false);
    }
  });

  it("2026 missing + 2025 exists -> select 2025", () => {
    const result = selectRateYear([candidate(2024), candidate(2025)], campaignStart(2026));
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.selected.rateYear).toBe(2025);
      expect(result.isFallback).toBe(true);
    }
  });

  it("2026 missing + 2024 and 2025 exist -> select 2025", () => {
    const result = selectRateYear([candidate(2023), candidate(2024), candidate(2025)], campaignStart(2026));
    expect(result.found).toBe(true);
    if (result.found) expect(result.selected.rateYear).toBe(2025);
  });

  it("2026 missing + only 2027 exists -> NO RATE", () => {
    const result = selectRateYear([candidate(2027)], campaignStart(2026));
    expect(result.found).toBe(false);
    if (!result.found) expect(result.reason).toBe("NO_RATE_AT_OR_BEFORE_CAMPAIGN_YEAR");
  });

  it("2027 rate uploaded -> 2027 campaign uses 2027", () => {
    const result = selectRateYear([candidate(2026), candidate(2027)], campaignStart(2027));
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.selected.rateYear).toBe(2027);
      expect(result.isFallback).toBe(false);
    }
  });

  it("2028 campaign + latest rate 2027 -> use 2027 fallback", () => {
    const result = selectRateYear([candidate(2026), candidate(2027)], campaignStart(2028));
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.selected.rateYear).toBe(2027);
      expect(result.isFallback).toBe(true);
    }
  });

  it("never selects a future year even when it is the closest chronologically", () => {
    // Campaign in 2026, only a 2027 rate and a 2020 rate exist -> must pick 2020, not 2027.
    const result = selectRateYear([candidate(2020), candidate(2027)], campaignStart(2026));
    expect(result.found).toBe(true);
    if (result.found) expect(result.selected.rateYear).toBe(2020);
  });

  it("same-year revised rate card: prefers the most recently published version", () => {
    const older = candidate(2026, {
      id: "v1",
      publishedAt: new Date(Date.UTC(2026, 0, 1)),
    });
    const revised = candidate(2026, {
      id: "v2-revised",
      publishedAt: new Date(Date.UTC(2026, 5, 1)),
    });
    const result = selectRateYear([older, revised], campaignStart(2026, 8));
    expect(result.found).toBe(true);
    if (result.found) expect(result.selected.id).toBe("v2-revised");
  });

  it("prefers a version whose effective window actually covers the campaign start", () => {
    const early = candidate(2026, {
      id: "jan-jun",
      effectiveFrom: new Date(Date.UTC(2026, 0, 1)),
      effectiveTo: new Date(Date.UTC(2026, 5, 30)),
      publishedAt: new Date(Date.UTC(2026, 0, 1)),
    });
    const late = candidate(2026, {
      id: "jul-dec",
      effectiveFrom: new Date(Date.UTC(2026, 6, 1)),
      effectiveTo: new Date(Date.UTC(2026, 11, 31)),
      publishedAt: new Date(Date.UTC(2026, 5, 1)),
    });
    // Campaign starts in March -> must pick the jan-jun version even though
    // "late" was published more recently.
    const result = selectRateYear([early, late], campaignStart(2026, 3));
    expect(result.found).toBe(true);
    if (result.found) expect(result.selected.id).toBe("jan-jun");
  });
});
