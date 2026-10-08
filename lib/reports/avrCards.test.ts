import { describe, it, expect } from "vitest";
import { buildCards, categoryIcon, categoryView } from "./avrCards";

const slabs = [{ thresholdFrom: 500000, rebatePct: 0.04 }, { thresholdFrom: 1000000, rebatePct: 0.06 }];
const scheme = (id: string, supplierName: string, category: string, s = slabs) => ({ id, supplierName, category, slabs: s });

describe("category icons", () => {
  it("maps asset types by name", () => {
    expect(categoryIcon("DOOH")).toBe("monitor"); expect(categoryIcon("DOOH-S")).toBe("monitor");
    expect(categoryIcon("OOH Large Format")).toBe("billboard"); expect(categoryIcon("OOH Small Format")).toBe("signpost");
    expect(categoryIcon("Doha Oasis")).toBe("store"); expect(categoryIcon("Gate Mall")).toBe("store"); expect(categoryIcon("AB")).toBe("store");
    expect(categoryIcon("Cinema")).toBe("cinema"); expect(categoryIcon("Metro")).toBe("rail");
    expect(categoryIcon("All Assets")).toBe("layers"); expect(categoryIcon("General")).toBe("layers");
    expect(categoryIcon("Something new")).toBe("pin");
  });
});

describe("category view", () => {
  it("below the first slab", () => {
    const v = categoryView(scheme("1", "A", "DOOH"), 170000);
    expect(v).toMatchObject({ state: "below", currentRebatePct: null, nextThreshold: 500000, nextRebatePct: 0.04, pending: 330000, estimatedRebate: 0 });
  });
  it("between slabs: rebate on spend so far, pending to next", () => {
    const v = categoryView(scheme("1", "A", "DOOH"), 780000);
    expect(v).toMatchObject({ state: "mid", currentRebatePct: 0.04, pending: 220000 });
    expect(v.estimatedRebate).toBeCloseTo(31200);
  });
  it("top slab: nothing pending", () => {
    expect(categoryView(scheme("1", "A", "DOOH"), 1200000)).toMatchObject({ state: "top", pending: 0, nextThreshold: null, currentRebatePct: 0.06 });
  });
  it("no slabs entered: never shows a number it does not have", () => {
    expect(categoryView(scheme("1", "A", "DOOH", []), 999)).toMatchObject({ state: "no-slabs", pending: 0, nextThreshold: null, estimatedRebate: 0 });
  });
  it("exactly on a threshold counts as reached", () => { expect(categoryView(scheme("1", "A", "x"), 500000).currentRebatePct).toBe(0.04); });
});

describe("supplier cards", () => {
  it("one card per supplier; nearest next slab drives the headline; sorted by closeness", () => {
    const spend = new Map([["Elan", 170000], ["Break", 780000], ["Sports", 1200000], ["Empty", 50]]);
    const cards = buildCards([
      scheme("1", "Elan", "DOOH"), scheme("2", "Elan", "Cinema", [{ thresholdFrom: 200000, rebatePct: 0.03 }]),
      scheme("3", "Break", "Mall"), scheme("4", "Sports", "DOOH"), scheme("5", "Empty", "All Assets", []),
    ], spend);
    expect(cards.map((c) => c.supplier)).toEqual(["Elan", "Break", "Sports", "Empty"]);
    const elan = cards[0];
    expect(elan.categories).toHaveLength(2);
    expect(elan.pending).toBe(30000); expect(elan.pendingCategory).toBe("Cinema"); expect(elan.pendingRebatePct).toBe(0.03);
    expect(elan.state).toBe("below"); expect(elan.progressPct).toBeCloseTo(85);
    expect(cards[1]).toMatchObject({ state: "mid", pending: 220000, bestRebatePct: 0.04 });
    expect(cards[2]).toMatchObject({ state: "top", pending: null, progressPct: 100 });
    expect(cards[3]).toMatchObject({ state: "no-slabs", pending: null, progressPct: 0 });
  });
  it("zero spend: below, full amount pending, 0 percent", () => {
    const c = buildCards([scheme("1", "Elan", "DOOH")], new Map())[0];
    expect(c).toMatchObject({ state: "below", pending: 500000, progressPct: 0, spend: 0 });
  });
});
