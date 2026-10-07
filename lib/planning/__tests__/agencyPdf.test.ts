import { describe, it, expect } from "vitest";
import { PDFParse } from "pdf-parse";
import { buildAgencyPdf } from "../agencyPdf";
import type { AgencyPlan } from "../agencyWorkbook";
import { TERMS_ONLINE, TERMS_OFFLINE } from "../terms";

const plan: AgencyPlan = {
  planType: "HYBRID",
  header: { client: "QNB", reference: "QNB-2026-X", brand: "QNB Mobile", campaign: "Ramadan", start: "2026-11-01", end: "2026-11-30", market: "Qatar", planDate: "2026-10-07", fx: 3.65 },
  online: { fx: 3.65, sections: [{ id: "s1", name: "Awareness", kpi: "Impressions", mode: "allocation", total: 100000, rows: [
    { id: "a", platform: "Meta", format: "Reels", placement: "Feed", specs: "9:16", unit: "CPM", price: 5, objective: "Reach", alloc: 0.6, qar: 0, weeks: ["2026-11-01"] },
    { id: "b", platform: "TikTok", format: "", placement: "", specs: "", unit: "CPV", price: 0.02, objective: "", alloc: 0.4, qar: 0, weeks: [] },
  ] }], targeting: [{ platform: "Meta", demographics: "25-44", geographics: "Qatar", interests: "Finance" }] },
  offline: { agencyFee: 5000, groups: [{ name: "MUPI", vendor: "Al Mana", rows: [
    { asset: "Mupi A", location: "Corniche", start: "2026-11-01", end: "2026-11-14", qty: 5, faces: 2, gross: 20000, net: 18000, fees: 1000, total: 19000, pending: false },
    { asset: "Mupi B", location: "Pearl", start: "2026-11-15", end: "2026-11-30", qty: 3, faces: 1, gross: null, net: null, fees: 0, total: null, pending: true },
  ] }] },
};
const text = async (b: Buffer) => { const p = new PDFParse({ data: b }); try { return (await p.getText()).text; } finally { await p.destroy?.(); } };

describe("agency PDF", () => {
  it("produces a PDF with the plan's headline numbers", async () => {
    const buf = await buildAgencyPdf(plan);
    expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
    const t = await text(buf);
    expect(t).toContain("QNB"); expect(t).toContain("Ramadan"); expect(t).toContain("Publicis Media Qatar");
    expect(t).toContain("QAR 100,000");      // online
    expect(t).toContain("QAR 24,000");       // offline 19,000 + 5,000 agency fee
    expect(t).toContain("QAR 124,000");      // grand total
  });
  it("shows TBD for unknown values, flags them, and includes the terms", async () => {
    const t = await text(await buildAgencyPdf(plan));
    expect(t).toContain("TBD");
    expect(t).toContain("excluded from the totals");
    expect(t).toContain(TERMS_ONLINE.split("\n")[0].slice(0, 40));
    expect(t).toContain(TERMS_OFFLINE.split("\n")[0].slice(0, 40));
  });
  it("never prints undefined or NaN", async () => {
    expect(await text(await buildAgencyPdf(plan))).not.toMatch(/undefined|NaN/);
  });
  it("handles online-only and offline-only plans", async () => {
    const on = await text(await buildAgencyPdf({ ...plan, planType: "ONLINE", offline: null }));
    expect(on).toContain("Awareness"); expect(on).not.toContain("Offline and OOH");
    const off = await text(await buildAgencyPdf({ ...plan, planType: "OFFLINE", online: null }));
    expect(off).toContain("Mupi A"); expect(off).not.toContain("Audience targeting");
  });
});
