import { describe, it, expect } from "vitest";
import { calculateLineItem, KNOWN, TBD } from "../calculation";

describe("Legacy PRO_RATA — parity with OOH_Rates_2026.xlsx Quote Calculator", () => {
  // Row 19 of the live workbook: "Crystal Walk · Gewan Island" (Scoop),
  // rate 45,000, 14-day campaign against a 14-day (2-week) rate period,
  // 1 circuit, 25% default discount, 1,500 production fee per circuit.
  // Saved cell values: Gross=45000, Net=33750, Prod=1500, Total=35250.
  it("reproduces the Crystal Walk · Gewan Island line exactly", () => {
    const result = calculateLineItem({
      calculationMethod: "PRO_RATA",
      legacyPeriodKey: "2_WEEKS",
      campaignDays: 14,
      quantity: 1,
      grossRate: KNOWN(45000),
      discountPct: 0.25,
      additionalDiscountPct: 0,
      fees: { production: KNOWN(1500) },
    });

    expect(result.grossCost).toEqual(KNOWN(45000));
    expect(result.netMedia).toEqual(KNOWN(33750));
    expect(result.productionFee).toEqual(KNOWN(1500));
    expect(result.lineTotal).toEqual(KNOWN(35250));
  });

  // Row 20: "MUPIS LED · AL Maha Island" (PromoMedia), rate 200,000,
  // 14/14 days, 1 circuit, 25% discount, prod fee 1,500.
  // Saved: Gross=200000, Net=150000, Prod=1500, Total=151500.
  it("reproduces the MUPIS LED · AL Maha Island line exactly", () => {
    const result = calculateLineItem({
      calculationMethod: "PRO_RATA",
      legacyPeriodKey: "2_WEEKS",
      campaignDays: 14,
      quantity: 1,
      grossRate: KNOWN(200000),
      discountPct: 0.25,
      additionalDiscountPct: 0,
      fees: { production: KNOWN(1500) },
    });

    expect(result.lineTotal).toEqual(KNOWN(151500));
  });

  it("pro-rates a partial period correctly (7 of 14 days = half gross)", () => {
    const result = calculateLineItem({
      calculationMethod: "PRO_RATA",
      legacyPeriodKey: "2_WEEKS",
      campaignDays: 7,
      quantity: 1,
      grossRate: KNOWN(10000),
      discountPct: 0,
      additionalDiscountPct: 0,
      fees: {},
    });
    expect(result.grossCost.amount).toBeCloseTo(5000);
  });

  it("scales gross cost by circuits multiplicatively", () => {
    const result = calculateLineItem({
      calculationMethod: "PRO_RATA",
      legacyPeriodKey: "2_WEEKS",
      campaignDays: 14,
      quantity: 3,
      grossRate: KNOWN(10000),
      discountPct: 0,
      additionalDiscountPct: 0,
      fees: { production: KNOWN(500) },
    });
    expect(result.grossCost).toEqual(KNOWN(30000));
    // production fee is per-circuit, so it also scales with quantity
    expect(result.productionFee).toEqual(KNOWN(1500));
  });
});

describe("FIXED package pricing", () => {
  it("never pro-rates or multiplies a fixed package price", () => {
    const result = calculateLineItem({
      calculationMethod: "FIXED",
      campaignDays: 5, // irrelevant to a fixed package
      quantity: 79, // e.g. Break Media "City Centre Domination – 79 Faces"
      grossRate: KNOWN(500000),
      discountPct: 0.1,
      additionalDiscountPct: 0,
      fees: {},
    });
    expect(result.grossCost).toEqual(KNOWN(500000));
    expect(result.netMedia).toEqual(KNOWN(450000));
  });
});

describe("PER_SCREEN / PER_CIRCUIT period-locked pricing (Scoop-style)", () => {
  it("multiplies unit rate by quantity without pro-rating by days", () => {
    const result = calculateLineItem({
      calculationMethod: "PER_SCREEN",
      campaignDays: 9999, // must not affect the result
      quantity: 2,
      grossRate: KNOWN(65000), // "Rate Per Screen" from Scoop 2026
      discountPct: 0,
      additionalDiscountPct: 0,
      fees: { upload: KNOWN(1500) },
    });
    expect(result.grossCost).toEqual(KNOWN(130000));
    expect(result.uploadFee).toEqual(KNOWN(3000));
  });
});

describe("PER_SPOT / PER_INSERTION / PER_MESSAGE pricing (radio/TV/print/SMS)", () => {
  it("PER_SPOT multiplies a per-airing rate by the number of spots bought, ignoring campaign days", () => {
    const result = calculateLineItem({
      calculationMethod: "PER_SPOT",
      campaignDays: 9999,
      quantity: 5, // 5 x 30-second Prime Time spots
      grossRate: KNOWN(250), // Fame FM real rate card: Prime Time, up to 30 seconds
      discountPct: 0,
      additionalDiscountPct: 0,
      fees: {},
    });
    expect(result.grossCost).toEqual(KNOWN(1250));
  });

  it("PER_INSERTION multiplies a per-appearance rate by the number of insertions", () => {
    const result = calculateLineItem({
      calculationMethod: "PER_INSERTION",
      campaignDays: 30,
      quantity: 3,
      grossRate: KNOWN(4000),
      discountPct: 0,
      additionalDiscountPct: 0,
      fees: {},
    });
    expect(result.grossCost).toEqual(KNOWN(12000));
  });

  it("PER_MESSAGE multiplies a per-message rate by the number of messages sent", () => {
    const result = calculateLineItem({
      calculationMethod: "PER_MESSAGE",
      campaignDays: 1,
      quantity: 10000,
      grossRate: KNOWN(0.05),
      discountPct: 0,
      additionalDiscountPct: 0,
      fees: {},
    });
    expect(result.grossCost).toEqual(KNOWN(500));
  });
});

describe("CPM / CPC pricing (digital: Meta/TikTok/Snapchat benchmarks)", () => {
  it("CPM divides impressions by 1000 before multiplying by the rate, ignoring campaign days", () => {
    const result = calculateLineItem({
      calculationMethod: "CPM",
      campaignDays: 9999,
      quantity: 250000, // 250k impressions
      grossRate: KNOWN(36.4), // QAR 36.40 CPM (Meta Qatar/Kuwait benchmark)
      discountPct: 0,
      additionalDiscountPct: 0,
      fees: {},
    });
    expect(result.grossCost).toEqual(KNOWN(9100));
  });

  it("CPC multiplies a per-click rate by the number of clicks bought", () => {
    const result = calculateLineItem({
      calculationMethod: "CPC",
      campaignDays: 30,
      quantity: 2000,
      grossRate: KNOWN(3.71), // QAR 3.71 CPC (TikTok global benchmark)
      discountPct: 0,
      additionalDiscountPct: 0,
      fees: {},
    });
    expect(result.grossCost).toEqual(KNOWN(7420));
  });
});

describe("TBD / POA handling", () => {
  it("never treats TBD production fee as zero, and flags the line as partial", () => {
    const result = calculateLineItem({
      calculationMethod: "FIXED",
      campaignDays: 14,
      quantity: 1,
      grossRate: KNOWN(85000),
      discountPct: 0,
      additionalDiscountPct: 0,
      fees: { production: TBD },
    });
    expect(result.productionFee).toEqual(TBD);
    expect(result.excludesPendingCost).toBe(true);
    // lineTotal must not silently become netMedia + 0
    expect(result.lineTotal.status).toBe("KNOWN");
    expect(result.excludesPendingCost).toBe(true);
  });

  it("never treats an unknown gross rate as zero", () => {
    const result = calculateLineItem({
      calculationMethod: "FIXED",
      campaignDays: 14,
      quantity: 1,
      grossRate: TBD,
      discountPct: 0.25,
      additionalDiscountPct: 0,
      fees: {},
    });
    expect(result.grossCost).toEqual(TBD);
    expect(result.netMedia).toEqual(TBD);
    expect(result.excludesPendingCost).toBe(true);
  });
});

describe("Discount engine", () => {
  it("stacks default and additional discount percentages", () => {
    const result = calculateLineItem({
      calculationMethod: "FIXED",
      campaignDays: 14,
      quantity: 1,
      grossRate: KNOWN(100000),
      discountPct: 0.2,
      additionalDiscountPct: 0.05,
      fees: {},
    });
    expect(result.netMedia).toEqual(KNOWN(75000));
  });
});
