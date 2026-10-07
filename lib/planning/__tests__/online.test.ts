import { describe, it, expect } from "vitest";
import { calcOnline, campaignDays, weeksOf, n, sanitizeOnlineData, newOnlineData, onlineTotalQar, type OnlineData } from "../online";

// Verbatim copy of the original builder's calculation (public/js/mediaplan.js) used as the parity reference.
const legacyN = (v: unknown) => { const x = +String(v ?? "").replace(/[^0-9.\-]/g, ""); return isFinite(x) ? x : 0; };
const legacyDays = (h: { start: string; end: string }) => { const d = Math.round((+new Date(h.end) - +new Date(h.start)) / 864e5) + 1; return d > 0 ? d : 0; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function legacyCalcOnline(plan: any) {
  const fx = legacyN(plan.header.fx) || 3.65, D = legacyDays(plan.header) || 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return plan.online.sections.map((sec: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = sec.rows.map((r: any) => {
      const qar = sec.mode === "allocation" ? legacyN(sec.total) * legacyN(r.alloc) : legacyN(r.qar), usd = qar / fx, price = legacyN(r.price);
      const kpi = r.unit === "Flat" || !price ? 0 : (/CPM$/.test(r.unit) ? usd / price * 1000 : usd / price);
      return { qar, usd, kpi, dQar: qar / D, dUsd: usd / D };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tq = rows.reduce((a: number, r: any) => a + r.qar, 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { rows, qar: tq, usd: tq / fx, kpi: rows.reduce((a: number, r: any) => a + r.kpi, 0), alloc: sec.rows.reduce((a: number, r: any) => a + legacyN(r.alloc), 0), avgPrice: sec.rows.length ? sec.rows.reduce((a: number, r: any) => a + legacyN(r.price), 0) / sec.rows.length : 0, dQar: tq / D };
  });
}

const base = (over: Partial<OnlineData> = {}): OnlineData => ({
  fx: 3.65,
  sections: [{ id: "s1", name: "Awareness", kpi: "Impressions", mode: "allocation", total: 100000, rows: [
    { id: "r1", platform: "Meta", format: "", placement: "", specs: "", unit: "CPM", price: 5, objective: "", alloc: 0.5, qar: 0, weeks: [] },
    { id: "r2", platform: "TikTok", format: "", placement: "", specs: "", unit: "CPV", price: 0.02, objective: "", alloc: 0.5, qar: 0, weeks: [] },
  ] }],
  targeting: [], ...over,
});

describe("calcOnline", () => {
  it("allocation mode: budget x share, converts to USD, CPM divides by 1000", () => {
    const [s] = calcOnline(base(), "2026-11-01", "2026-11-30");
    expect(s.rows[0].qar).toBe(50000);
    expect(s.rows[0].usd).toBeCloseTo(50000 / 3.65, 6);
    expect(s.rows[0].kpi).toBeCloseTo((50000 / 3.65 / 5) * 1000, 4); // 2,739,726 impressions
    expect(s.rows[1].kpi).toBeCloseTo(50000 / 3.65 / 0.02, 4); // CPV: views = usd / price
    expect(s.qar).toBe(100000);
  });
  it("manual mode uses each row's own QAR and ignores the section total", () => {
    const d = base(); d.sections[0].mode = "manual"; d.sections[0].rows[0].qar = 1234; d.sections[0].rows[1].qar = 0;
    const [s] = calcOnline(d, "2026-11-01", "2026-11-30");
    expect(s.qar).toBe(1234);
  });
  it("Flat unit and a missing price produce no KPI, never a divide-by-zero", () => {
    const d = base(); d.sections[0].rows[0].unit = "Flat"; d.sections[0].rows[1].price = 0;
    const [s] = calcOnline(d, "2026-11-01", "2026-11-30");
    expect(s.rows[0].kpi).toBe(0); expect(s.rows[1].kpi).toBe(0);
  });
  it("falls back to 3.65 when the exchange rate is missing or zero", () => {
    expect(calcOnline(base({ fx: 0 }), "2026-11-01", "2026-11-30")[0].usd).toBeCloseTo(100000 / 3.65, 6);
  });
  it("daily spend divides by inclusive campaign days", () => {
    const [s] = calcOnline(base(), "2026-11-01", "2026-11-30");
    expect(s.dQar).toBeCloseTo(100000 / 30, 6);
  });
  it("matches the original builder exactly on randomized plans (parity)", () => {
    let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const units = ["CPM", "vCPM", "CPV", "CPCV", "CPC", "CPE", "CPL", "CPA", "CPI", "Flat"];
    for (let t = 0; t < 200; t++) {
      const sections = Array.from({ length: 1 + Math.floor(rnd() * 3) }, (_, i) => ({
        id: "s" + i, name: "S" + i, kpi: "Impressions", mode: rnd() < 0.5 ? "allocation" : "manual", total: Math.round(rnd() * 500000),
        rows: Array.from({ length: 1 + Math.floor(rnd() * 4) }, (_, j) => ({ id: "r" + j, platform: "", format: "", placement: "", specs: "", unit: units[Math.floor(rnd() * units.length)], price: rnd() < 0.15 ? 0 : +(rnd() * 20).toFixed(3), objective: "", alloc: +(rnd()).toFixed(3), qar: Math.round(rnd() * 90000), weeks: [] })),
      })) as OnlineData["sections"];
      const fx = rnd() < 0.2 ? 0 : +(3 + rnd()).toFixed(2);
      const start = "2026-" + String(1 + Math.floor(rnd() * 11)).padStart(2, "0") + "-01", end = "2026-12-" + String(1 + Math.floor(rnd() * 28)).padStart(2, "0");
      const mine = calcOnline({ fx, sections, targeting: [] }, start, end);
      const ref = legacyCalcOnline({ header: { fx, start, end }, online: { sections } });
      expect(JSON.parse(JSON.stringify(mine))).toEqual(JSON.parse(JSON.stringify(ref)));
    }
  });
});

describe("dates", () => {
  it("counts campaign days inclusively and returns 0 for a backwards range", () => {
    expect(campaignDays("2026-11-01", "2026-11-30")).toBe(30);
    expect(campaignDays("2026-11-05", "2026-11-05")).toBe(1);
    expect(campaignDays("2026-11-30", "2026-11-01")).toBe(0);
  });
  it("builds weekly columns labelled within each month", () => {
    const w = weeksOf("2026-11-01", "2026-11-30");
    expect(w.map((x) => x.label)).toEqual(["W1", "W2", "W3", "W4", "W5"]);
    expect(w[0]).toEqual({ month: "November 2026", label: "W1", date: "2026-11-01" });
    expect(weeksOf("2026-12-01", "2026-11-01")).toEqual([]);
  });
});

describe("n and sanitizeOnlineData", () => {
  it("n strips symbols and never returns NaN", () => {
    expect(n("QAR 1,250.50")).toBe(1250.5); expect(n("abc")).toBe(0); expect(n(null)).toBe(0); expect(n("-5")).toBe(-5);
  });
  it("sanitize keeps a valid block, coerces numbers and drops junk", () => {
    const out = sanitizeOnlineData({ fx: "3.7", sections: [{ id: "a", name: "X", kpi: "Clicks", mode: "bogus", total: "1,000", rows: [{ unit: "NOPE", price: "2", alloc: "0.5", weeks: ["2026-11-01"], extra: "dropped" }] }], targeting: [{ platform: "Meta" }], hack: "x" });
    expect(out.fx).toBe(3.7); expect(out.sections[0].mode).toBe("allocation"); expect(out.sections[0].total).toBe(1000);
    expect(out.sections[0].rows[0].unit).toBe("CPM"); expect(out.sections[0].rows[0].price).toBe(2);
    expect(Object.keys(out)).toEqual(["fx", "sections", "targeting", "terms"]);
  });
  it("sanitize survives garbage input and bounds sizes", () => {
    expect(sanitizeOnlineData(null).sections).toEqual([]);
    expect(sanitizeOnlineData({ sections: Array.from({ length: 500 }, () => ({ rows: [] })) }).sections.length).toBe(20);
    expect(onlineTotalQar(newOnlineData(), "2026-11-01", "2026-11-30")).toBe(0);
  });
});
