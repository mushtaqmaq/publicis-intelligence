import { describe, it, expect } from "vitest";
import { buildAndCalculateLineItem, legacyPeriodKeyFromDuration, campaignDaysBetween } from "../buildLineItem";

describe("legacyPeriodKeyFromDuration", () => {
  it("maps the five periods the Excel workbook itself supports", () => {
    expect(legacyPeriodKeyFromDuration(2, "weeks")).toBe("2_WEEKS");
    expect(legacyPeriodKeyFromDuration(4, "weeks")).toBe("4_WEEKS");
    expect(legacyPeriodKeyFromDuration(3, "months")).toBe("3_MONTHS");
    expect(legacyPeriodKeyFromDuration(6, "months")).toBe("6_MONTHS");
    expect(legacyPeriodKeyFromDuration(12, "months")).toBe("12_MONTHS");
  });

  it("returns null instead of guessing for anything else", () => {
    expect(legacyPeriodKeyFromDuration(1, "weeks")).toBeNull();
    expect(legacyPeriodKeyFromDuration(null, null)).toBeNull();
  });
});

describe("campaignDaysBetween", () => {
  it("counts inclusive days (matches the Excel workbook's own M column formula)", () => {
    const start = new Date(Date.UTC(2026, 0, 1));
    const end = new Date(Date.UTC(2026, 0, 14));
    expect(campaignDaysBetween(start, end)).toBe(14);
  });
});

describe("buildAndCalculateLineItem", () => {
  // Reproduces the real "Crystal Walk · Gewan Island" line from
  // OOH_Rates_2026.xlsx's own Quote Calculator (see
  // docs/excel-migration-notes.md): rate 45,000, 14-day campaign against
  // a 2-week rate, 1 circuit, 25% discount, 1,500 production fee.
  it("reproduces the real Crystal Walk · Gewan Island Excel line exactly", () => {
    const { result } = buildAndCalculateLineItem({
      calculationMethod: "PRO_RATA",
      rate: {
        grossRateStatus: "KNOWN",
        grossRate: 45000,
        durationValue: 2,
        durationUnit: "weeks",
        fees: [{ feeType: "production", status: "KNOWN", amount: 1500 }],
      },
      campaignStart: new Date(Date.UTC(2026, 0, 1)),
      campaignEnd: new Date(Date.UTC(2026, 0, 14)),
      quantity: 1,
      discountPct: 0.25,
      additionalDiscountPct: 0,
    });

    expect(result.grossCost).toEqual({ status: "KNOWN", amount: 45000 });
    expect(result.netMedia).toEqual({ status: "KNOWN", amount: 33750 });
    expect(result.productionFee).toEqual({ status: "KNOWN", amount: 1500 });
    expect(result.lineTotal).toEqual({ status: "KNOWN", amount: 35250 });
  });

  it("never scales a FIXED package rate by quantity, even a large one", () => {
    const { result } = buildAndCalculateLineItem({
      calculationMethod: "FIXED",
      rate: {
        grossRateStatus: "KNOWN",
        grossRate: 185000,
        durationValue: 2,
        durationUnit: "weeks",
        fees: [{ feeType: "upload", status: "KNOWN", amount: 2000 }],
      },
      campaignStart: new Date(Date.UTC(2026, 0, 1)),
      campaignEnd: new Date(Date.UTC(2026, 0, 14)),
      quantity: 79, // the package's face count — must NOT multiply the rate
      discountPct: 0,
      additionalDiscountPct: 0,
    });

    expect(result.grossCost).toEqual({ status: "KNOWN", amount: 185000 });
  });

  it("falls back to no legacyPeriodKey (and a zero-period-day gross of 0) for an unrecognized PRO_RATA duration", () => {
    const { result, legacyPeriodKey } = buildAndCalculateLineItem({
      calculationMethod: "PRO_RATA",
      rate: {
        grossRateStatus: "KNOWN",
        grossRate: 10000,
        durationValue: 5,
        durationUnit: "weeks", // not one of the five legacy periods
        fees: [],
      },
      campaignStart: new Date(Date.UTC(2026, 0, 1)),
      campaignEnd: new Date(Date.UTC(2026, 0, 14)),
      quantity: 1,
      discountPct: 0,
      additionalDiscountPct: 0,
    });

    expect(legacyPeriodKey).toBeNull();
    expect(result.grossCost).toEqual({ status: "KNOWN", amount: 0 });
  });

  it("never coerces a TBD rate to zero", () => {
    const { result } = buildAndCalculateLineItem({
      calculationMethod: "PER_CIRCUIT",
      rate: { grossRateStatus: "TBD", grossRate: null, durationValue: null, durationUnit: null, fees: [] },
      campaignStart: new Date(Date.UTC(2026, 0, 1)),
      campaignEnd: new Date(Date.UTC(2026, 0, 14)),
      quantity: 2,
      discountPct: 0,
      additionalDiscountPct: 0,
    });

    expect(result.grossCost).toEqual({ status: "TBD", amount: null });
    expect(result.excludesPendingCost).toBe(true);
  });
});
