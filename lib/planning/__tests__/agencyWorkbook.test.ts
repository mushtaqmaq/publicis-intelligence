import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildAgencyWorkbook, type AgencyPlan } from "../agencyWorkbook";
import { TERMS_ONLINE, TERMS_OFFLINE } from "../terms";
import type { OnlineData } from "../online";

const online: OnlineData = {
  fx: 3.65,
  sections: [{ id: "s1", name: "Awareness", kpi: "Impressions", mode: "allocation", total: 100000, rows: [
    { id: "a", platform: "Meta", format: "Reels", placement: "Feed", specs: "9:16", unit: "CPM", price: 5, objective: "Reach", alloc: 0.6, qar: 0, weeks: ["2026-11-01", "2026-11-08"] },
    { id: "b", platform: "TikTok", format: "", placement: "", specs: "", unit: "CPV", price: 0.02, objective: "", alloc: 0.4, qar: 0, weeks: [] },
  ] }],
  targeting: [{ platform: "Meta", demographics: "25-44", geographics: "Qatar", interests: "Finance" }],
};
const header = { client: "QNB", reference: "QNB-2026-X", brand: "QNB Mobile", campaign: "Ramadan", start: "2026-11-01", end: "2026-11-30", market: "Qatar", planDate: "2026-10-07", fx: 3.65 };
const offline: AgencyPlan["offline"] = { agencyFee: 5000, groups: [{ name: "MUPI", vendor: "Al Mana", rows: [
  { asset: "Mupi A", location: "Corniche", start: "2026-11-01", end: "2026-11-14", qty: 5, faces: 2, gross: 20000, net: 18000, fees: 1000, total: 19000, pending: false },
  { asset: "Mupi B", location: "Pearl", start: "2026-11-15", end: "2026-11-30", qty: 3, faces: 1, gross: null, net: null, fees: 0, total: null, pending: true },
] }] };

const read = async (b: Buffer) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(b as unknown as ArrayBuffer); return wb; };
const val = (ws: ExcelJS.Worksheet, addr: string) => { const v = ws.getCell(addr).value as unknown; return v && typeof v === "object" && "result" in (v as object) ? (v as { result: unknown }).result : v; };
const findRow = (ws: ExcelJS.Worksheet, text: string) => { let hit = 0; ws.eachRow((row, i) => { row.eachCell((c) => { if (c.value === text && !hit) hit = i; }); }); return hit; };

describe("agency workbook", () => {
  it("builds the right sheets for each plan type", async () => {
    const hy = await read(await buildAgencyWorkbook({ planType: "HYBRID", header, online, offline }));
    expect(hy.worksheets.map((w) => w.name)).toEqual(["Summary", "Digital Media Plan", "Targeting", "Offline Media Plan"]);
    const on = await read(await buildAgencyWorkbook({ planType: "ONLINE", header, online, offline: null }));
    expect(on.worksheets.map((w) => w.name)).toEqual(["Digital Media Plan", "Targeting"]);
    const off = await read(await buildAgencyWorkbook({ planType: "OFFLINE", header, online: null, offline }));
    expect(off.worksheets.map((w) => w.name)).toEqual(["Offline Media Plan"]);
  });

  it("digital sheet: spend, KPI and totals match the calculations, with live formulas", async () => {
    const wb = await read(await buildAgencyWorkbook({ planType: "ONLINE", header, online, offline: null }));
    const ws = wb.getWorksheet("Digital Media Plan")!;
    const hr = findRow(ws, "Platform"), first = hr + 1;
    expect(ws.getCell("B" + first).value).toBe("Meta");
    expect(val(ws, "K" + first)).toBe(60000);                       // 100,000 x 60%
    expect(val(ws, "F" + first)).toBeCloseTo((60000 / 3.65 / 5) * 1000, 2); // impressions
    expect(val(ws, "F" + (first + 1))).toBeCloseTo(40000 / 3.65 / 0.02, 2);  // CPV views
    const tot = findRow(ws, "Total");
    expect((ws.getCell("F" + tot).value as { formula: string }).formula).toBe(`SUM(F${first}:F${first + 1})`);
    expect(val(ws, "K" + tot)).toBe(100000);
    const grand = findRow(ws, "TOTAL ONLINE (QAR)"); expect(val(ws, "K" + grand)).toBe(100000);
  });

  it("digital sheet shades the weeks the row runs", async () => {
    const ws = (await read(await buildAgencyWorkbook({ planType: "ONLINE", header, online, offline: null }))).getWorksheet("Digital Media Plan")!;
    const hr = findRow(ws, "Platform"), first = hr + 1;
    const fillOf = (a: string) => (ws.getCell(a).fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;
    expect(fillOf("O" + first)).toBe("FF4165BB");   // W1
    expect(fillOf("P" + first)).toBe("FF4165BB");   // W2
    expect(fillOf("Q" + first)).toBeUndefined();    // W3 not flighted
  });

  it("offline sheet: TBD is shown as TBD (never 0), excluded from totals, and flagged", async () => {
    const ws = (await read(await buildAgencyWorkbook({ planType: "OFFLINE", header, online: null, offline }))).getWorksheet("Offline Media Plan")!;
    const hr = findRow(ws, "ASSET / FORMAT"), a = hr + 2, b = hr + 3; // hr+1 is the group title row
    expect(ws.getCell("B" + a).value).toBe("Mupi A");
    expect(ws.getCell("G" + a).value).toBe(20000);
    expect(ws.getCell("G" + b).value).toBe("TBD");
    expect(ws.getCell("I" + b).value).toBe("TBD");
    const sub = findRow(ws, "Subtotal");
    expect(val(ws, "G" + sub)).toBe(20000); expect(val(ws, "K" + sub)).toBe(19000);
    expect(val(ws, "C" + findRow(ws, "Total with Agency Fee"))).toBe(24000); // 19,000 + 5,000 fee
    let flagged = false; ws.eachRow((row) => row.eachCell((c) => { if (typeof c.value === "string" && c.value.startsWith("Lines marked TBD")) flagged = true; }));
    expect(flagged).toBe(true);
  });

  it("offline sheet: a plan with no unknown values carries no TBD warning", async () => {
    const clean: AgencyPlan["offline"] = { agencyFee: 0, groups: [{ name: "MUPI", vendor: "V", rows: [offline!.groups[0].rows[0]] }] };
    const ws = (await read(await buildAgencyWorkbook({ planType: "OFFLINE", header, online: null, offline: clean }))).getWorksheet("Offline Media Plan")!;
    let flagged = false; ws.eachRow((row) => row.eachCell((c) => { if (typeof c.value === "string" && c.value.startsWith("Lines marked TBD")) flagged = true; }));
    expect(flagged).toBe(false);
  });

  it("hybrid summary: grand total is online plus offline with agency fee", async () => {
    const ws = (await read(await buildAgencyWorkbook({ planType: "HYBRID", header, online, offline }))).getWorksheet("Summary")!;
    expect(val(ws, "C" + findRow(ws, "Total online"))).toBe(100000);
    expect(val(ws, "C" + findRow(ws, "Total offline with agency fee"))).toBe(24000);
    expect(val(ws, "C" + findRow(ws, "GRAND TOTAL (QAR)"))).toBe(124000);
  });

  it("prints the standard terms and conditions", async () => {
    const wb = await read(await buildAgencyWorkbook({ planType: "HYBRID", header, online, offline }));
    const text = (ws: ExcelJS.Worksheet) => { const out: string[] = []; ws.eachRow((r) => r.eachCell((c) => { if (typeof c.value === "string") out.push(c.value); })); return out.join("\n"); };
    expect(text(wb.getWorksheet("Digital Media Plan")!)).toContain(TERMS_ONLINE.split("\n")[0]);
    expect(text(wb.getWorksheet("Offline Media Plan")!)).toContain(TERMS_OFFLINE.split("\n")[0]);
  });

  it("never writes 'undefined' or 'NaN' into a cell", async () => {
    const wb = await read(await buildAgencyWorkbook({ planType: "HYBRID", header, online, offline }));
    wb.eachSheet((ws) => ws.eachRow((r) => r.eachCell((c) => { const s = JSON.stringify(c.value); expect(s).not.toMatch(/undefined|NaN/); })));
  });
});
