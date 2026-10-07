// Agency-format Excel workbook (Publicis Media Qatar layout): Digital Media Plan, Targeting, Offline Media Plan,
// and a Summary for hybrid plans. Pure (no database access) so it can be tested directly.
// The digital sheet is a port of the original builder's export with live formulas; the offline sheet is built from
// the planner's inventory lines using the planner's own computed numbers (unknown TBD/POA values are never shown as 0).
import ExcelJS from "exceljs";
import { calcOnline, weeksOf, campaignDays, n, DEFAULT_FX, type OnlineData } from "./online";
import { TERMS_ONLINE, TERMS_OFFLINE } from "./terms";

export type AgencyOfflineRow = {
  asset: string; location: string; start: string; end: string;
  qty: number | null; faces: number | null;
  gross: number | null; net: number | null; fees: number | null; total: number | null; // null = unknown (TBD/POA)
  pending: boolean;
};
export type AgencyOfflineGroup = { name: string; vendor: string; rows: AgencyOfflineRow[] };
export type AgencyPlan = {
  planType: "OFFLINE" | "ONLINE" | "HYBRID";
  header: { client: string; reference: string; brand: string; campaign: string; start: string; end: string; market: string; planDate: string; fx: number };
  online: OnlineData | null;
  offline: { groups: AgencyOfflineGroup[]; agencyFee: number } | null;
  termsOnline?: string; termsOffline?: string;
};

const BLUE = "FF4165BB", GOLD = "FFC9971A", LIGHT = "FFF3F5FB", GREY = "FFE4E4E8", WHITE = "FFFFFFFF", DARK = "FF111114", PENDING = "FFFFF1D6";
const QAR = "[$QAR] #,##0", USD = "[$USD] #,##0.00", INT = "#,##0", PCT = "0%";

const col = (i: number) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

function titleBlock(ws: ExcelJS.Worksheet, title: string, client: string, lastCol: number, color: string) {
  ws.mergeCells(`B2:${col(lastCol)}3`);
  const c = ws.getCell("B2");
  c.value = `${title}\nCLIENT: ${client.toUpperCase()}`;
  c.font = { bold: true, size: 16, color: { argb: WHITE } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
  c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  ws.getRow(2).height = 26; ws.getRow(3).height = 26;
}

function headerFields(ws: ExcelJS.Worksheet, h: AgencyPlan["header"], startRow: number) {
  const days = campaignDays(h.start, h.end);
  const rows: [string, string | number | Date | null][] = [
    ["PLAN DATE", h.planDate ? new Date(h.planDate) : ""], ["CLIENT", h.client], ["REFERENCE NUMBER", h.reference], ["BRAND/PRODUCT", h.brand],
    ["CAMPAIGN NAME", h.campaign], ["START DATE", h.start ? new Date(h.start) : ""], ["END DATE", h.end ? new Date(h.end) : ""], ["DURATION", null],
    ["MARKET", h.market], ["EXCHANGE RATE (QAR PER USD)", n(h.fx) || DEFAULT_FX],
  ];
  rows.forEach(([k, v], i) => {
    const r = startRow + i;
    ws.getCell("B" + r).value = k; ws.getCell("B" + r).font = { bold: true };
    const c = ws.getCell("C" + r);
    if (k === "DURATION") c.value = { formula: `C${startRow + 6}-C${startRow + 5}+1`, result: days };
    else c.value = v as ExcelJS.CellValue;
    if (v instanceof Date) c.numFmt = "dd mmm yyyy";
    c.alignment = { horizontal: "left" };
  });
  return { fxCell: `$C$${startRow + 9}`, daysCell: `$C$${startRow + 7}`, next: startRow + rows.length + 2 };
}

type StyleOpts = { fill?: string; font?: Partial<ExcelJS.Font>; fmt?: string; align?: Partial<ExcelJS.Alignment> };
function style(cell: ExcelJS.Cell, o: StyleOpts) {
  if (o.fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: o.fill } };
  if (o.font) cell.font = o.font;
  if (o.fmt) cell.numFmt = o.fmt;
  if (o.align) cell.alignment = o.align;
  const b = { style: "thin" as const, color: { argb: GREY } };
  cell.border = { top: b, bottom: b, left: b, right: b };
}

function termsBlock(ws: ExcelJS.Worksheet, text: string, row: number, lastCol: number) {
  ws.getCell("B" + row).value = "TERMS AND CONDITIONS"; ws.getCell("B" + row).font = { bold: true };
  ws.mergeCells(`B${row + 1}:${col(lastCol)}${row + 1}`);
  const c = ws.getCell("B" + (row + 1));
  c.value = text; c.alignment = { wrapText: true, vertical: "top" };
  ws.getRow(row + 1).height = Math.max(60, text.split("\n").length * 15);
}

function monthSpans(W: { month: string }[]) {
  const months: { m: string; from: number; to: number }[] = [];
  W.forEach((w, i) => { if (months.length && months[months.length - 1].m === w.month) months[months.length - 1].to = i; else months.push({ m: w.month, from: i, to: i }); });
  return months;
}

export async function buildAgencyWorkbook(P: AgencyPlan): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Publicis Intelligence"; wb.created = new Date();
  const H = P.header;
  const W = weeksOf(H.start, H.end);
  const fx = n(H.fx) || DEFAULT_FX;
  const onCalc = P.online ? calcOnline({ ...P.online, fx }, H.start, H.end) : [];
  const onlineQ = onCalc.reduce((a, s) => a + s.qar, 0);
  const refs: { online: { name: string; cell: string; value: number }[]; onlineTotal?: string; offline?: string } = { online: [] };
  const hasOn = !!P.online, hasOff = !!P.offline;

  if (P.planType === "HYBRID") wb.addWorksheet("Summary");

  /* ---------- Digital media plan ---------- */
  if (P.online) {
    const ws = wb.addWorksheet("Digital Media Plan", { views: [{ showGridLines: false }] });
    const COLS = ["Platform", "Ad Format", "Ad Placement", "Ad Specs", "", "Pricing Unit", "Price Per Unit (USD)", "Objective", "Net Cost USD", "Net Cost QAR", "Daily Budget QAR", "Daily Budget USD", "Budget Allocation %"];
    const last = 1 + COLS.length + W.length;
    titleBlock(ws, "DIGITAL MEDIA PLAN", H.client, last, BLUE);
    const hf = headerFields(ws, H, 5);
    let r = hf.next;
    P.online.sections.forEach((s, si) => {
      const c0 = onCalc[si];
      ws.getCell("B" + r).value = s.name.toUpperCase(); ws.getCell("B" + r).font = { bold: true, size: 12, color: { argb: BLUE } };
      ws.getCell("J" + r).value = `Exchange rate: 1 USD = QAR ${fx}`; ws.getCell("J" + r).font = { italic: true, color: { argb: "FF6B7180" } };
      monthSpans(W).forEach((mo) => {
        const a = col(1 + COLS.length + mo.from), b = col(1 + COLS.length + mo.to);
        if (a !== b) ws.mergeCells(`${a}${r}:${b}${r}`);
        const c = ws.getCell(a + r); c.value = mo.m; c.alignment = { horizontal: "center" }; c.font = { bold: true };
      });
      r++;
      const hr = r;
      [...COLS.map((c, i) => (i === 4 ? s.kpi : c)), ...W.map((w) => w.label)].forEach((h, i) => {
        const c = ws.getCell(col(1 + i) + hr); c.value = h;
        style(c, { fill: BLUE, font: { bold: true, color: { argb: WHITE } }, align: { wrapText: true, vertical: "middle", horizontal: "center" } });
      });
      ws.getRow(hr).height = 32; r++;
      const first = r, lastRow = r + s.rows.length - 1, totRow = lastRow + 1;
      s.rows.forEach((row, ri) => {
        const rr = r + ri, c = c0.rows[ri];
        const vals: Record<string, string | number> = { B: row.platform, C: row.format, D: row.placement, E: row.specs, G: row.unit, H: n(row.price), I: row.objective };
        Object.entries(vals).forEach(([k, v]) => { const cell = ws.getCell(k + rr); cell.value = v; style(cell, { align: { wrapText: true, vertical: "middle" }, fmt: k === "H" ? "0.000" : undefined }); });
        const set = (k: string, formula: string, result: number, fmt: string) => { const cell = ws.getCell(k + rr); cell.value = { formula, result }; style(cell, { fmt, align: { vertical: "middle" } }); };
        set("K", s.mode === "allocation" ? `$K$${totRow}*N${rr}` : String(n(row.qar)), c.qar, QAR);
        if (s.mode !== "allocation") ws.getCell("K" + rr).value = n(row.qar);
        set("J", `K${rr}/${hf.fxCell}`, c.usd, USD);
        set("F", row.unit === "Flat" || !n(row.price) ? "0" : /CPM$/.test(row.unit) ? `IFERROR(J${rr}/H${rr}*1000,0)` : `IFERROR(J${rr}/H${rr},0)`, c.kpi, INT);
        set("L", `K${rr}/${hf.daysCell}`, c.dQar, QAR); set("M", `J${rr}/${hf.daysCell}`, c.dUsd, USD);
        const nc = ws.getCell("N" + rr);
        nc.value = s.mode === "allocation" ? n(row.alloc) : { formula: `IFERROR(K${rr}/$K$${totRow},0)`, result: c0.qar ? c.qar / c0.qar : 0 };
        style(nc, { fmt: PCT });
        W.forEach((w, wi) => { style(ws.getCell(col(1 + COLS.length + wi) + rr), row.weeks.includes(w.date) ? { fill: BLUE } : {}); });
      });
      const tset = (k: string, formula: string | null, result: number, fmt: string) => {
        const cell = ws.getCell(k + totRow); cell.value = formula == null ? result : { formula, result };
        style(cell, { fill: BLUE, font: { bold: true, color: { argb: WHITE } }, fmt });
      };
      ws.getCell("B" + totRow).value = "Total"; style(ws.getCell("B" + totRow), { fill: BLUE, font: { bold: true, color: { argb: WHITE } } });
      ["C", "D", "E", "G", "I", "M"].forEach((k) => style(ws.getCell(k + totRow), { fill: BLUE }));
      tset("F", `SUM(F${first}:F${lastRow})`, c0.kpi, INT); tset("H", `IFERROR(AVERAGE(H${first}:H${lastRow}),0)`, c0.avgPrice, "0.000");
      if (s.mode === "allocation") tset("K", null, n(s.total), QAR); else tset("K", `SUM(K${first}:K${lastRow})`, c0.qar, QAR);
      tset("J", `K${totRow}/${hf.fxCell}`, c0.usd, USD); tset("L", `SUM(L${first}:L${lastRow})`, c0.dQar, QAR);
      tset("N", `SUM(N${first}:N${lastRow})`, s.mode === "allocation" ? c0.alloc : 1, PCT);
      W.forEach((_, wi) => style(ws.getCell(col(1 + COLS.length + wi) + totRow), { fill: BLUE }));
      refs.online.push({ name: s.name, cell: `'Digital Media Plan'!K${totRow}`, value: c0.qar });
      r = totRow + 3;
    });
    const gt = r;
    ws.getCell("J" + gt).value = "TOTAL ONLINE (QAR)"; ws.getCell("J" + gt).font = { bold: true };
    const gc = ws.getCell("K" + gt);
    gc.value = { formula: refs.online.map((x) => x.cell.split("!")[1]).join("+") || "0", result: onlineQ };
    style(gc, { fill: BLUE, font: { bold: true, color: { argb: WHITE } }, fmt: QAR });
    refs.onlineTotal = `'Digital Media Plan'!K${gt}`;
    termsBlock(ws, P.termsOnline || TERMS_ONLINE, gt + 3, last);
    ws.getColumn(1).width = 3;
    [22, 22, 26, 20, 14, 12, 12, 22, 15, 16, 15, 14, 12].forEach((w, i) => (ws.getColumn(2 + i).width = w));
    W.forEach((_, i) => (ws.getColumn(2 + COLS.length + i).width = 6));

    const tg = wb.addWorksheet("Targeting", { views: [{ showGridLines: false }] });
    titleBlock(tg, "AUDIENCE TARGETING", H.client, 5, BLUE);
    ["Platform", "Demographics", "Geographics", "Interests / Behaviours"].forEach((h, i) => {
      const c = tg.getCell(col(1 + i) + 5); c.value = h; style(c, { fill: BLUE, font: { bold: true, color: { argb: WHITE } } });
    });
    P.online.targeting.forEach((t, i) => (["platform", "demographics", "geographics", "interests"] as const).forEach((k, j) => {
      const c = tg.getCell(col(1 + j) + (6 + i)); c.value = t[k]; style(c, { align: { wrapText: true, vertical: "top" } });
    }));
    tg.getColumn(1).width = 3; [18, 30, 20, 80].forEach((w, i) => (tg.getColumn(2 + i).width = w));
  }

  /* ---------- Offline / OOH media plan (planner inventory lines) ---------- */
  let offlineWithFee = 0;
  if (P.offline) {
    const ws = wb.addWorksheet("Offline Media Plan", { views: [{ showGridLines: false }] });
    const KEYS = ["asset", "location", "period", "qty", "faces", "gross", "disc", "net", "fees", "total"] as const;
    const HEAD: Record<(typeof KEYS)[number], string> = { asset: "ASSET / FORMAT", location: "LOCATION", period: "PERIOD", qty: "QTY", faces: "FACES", gross: "GROSS AMOUNT", disc: "DISCOUNT", net: "NET MEDIA COST", fees: "PRODUCTION AND OTHER FEES", total: "TOTAL" };
    const L = Object.fromEntries(KEYS.map((k, i) => [k, col(1 + i)])) as Record<(typeof KEYS)[number], string>;
    const last = KEYS.length + W.length;
    titleBlock(ws, "OFFLINE AND OOH MEDIA PLAN", H.client, last, GOLD);
    const hf = headerFields(ws, H, 5);
    let r = hf.next;
    monthSpans(W).forEach((mo) => {
      const a = col(1 + KEYS.length + mo.from), b = col(1 + KEYS.length + mo.to);
      if (a !== b) ws.mergeCells(`${a}${r}:${b}${r}`);
      const c = ws.getCell(a + r); c.value = mo.m; c.alignment = { horizontal: "center" }; c.font = { bold: true };
    });
    r++;
    [...KEYS.map((k) => HEAD[k]), ...W.map((w) => w.label)].forEach((h, i) => {
      const c = ws.getCell(col(1 + i) + r); c.value = h;
      style(c, { fill: GOLD, font: { bold: true, color: { argb: WHITE } }, align: { wrapText: true, vertical: "middle", horizontal: "center" } });
    });
    ws.getRow(r).height = 32; r++;
    const subs: number[] = [];
    let anyPending = false, gGross = 0, gNet = 0, gFees = 0, gTotal = 0;
    for (const g of P.offline.groups) {
      const gc = ws.getCell("B" + r); gc.value = g.name.toUpperCase() + (g.vendor ? " · " + g.vendor : ""); gc.font = { bold: true, color: { argb: GOLD } }; r++;
      const first = r;
      let sGross = 0, sNet = 0, sFees = 0, sTotal = 0, sFaces = 0;
      g.rows.forEach((row, ri) => {
        const rr = r + ri;
        const fill = row.pending ? PENDING : undefined;
        const put = (k: (typeof KEYS)[number], v: string | number, fmt?: string, al?: Partial<ExcelJS.Alignment>) => { const cell = ws.getCell(L[k] + rr); cell.value = v; style(cell, { fmt, fill, align: al ?? { vertical: "middle" } }); };
        const money = (k: (typeof KEYS)[number], v: number | null) => put(k, v === null ? "TBD" : v, v === null ? undefined : QAR, v === null ? { horizontal: "center", vertical: "middle" } : undefined);
        put("asset", row.asset, undefined, { wrapText: true, vertical: "middle" }); put("location", row.location, undefined, { wrapText: true, vertical: "middle" });
        put("period", `${row.start} to ${row.end}`);
        put("qty", row.qty ?? "", "0.0"); put("faces", row.faces ?? "", INT);
        money("gross", row.gross);
        const disc = row.gross !== null && row.net !== null && row.gross > 0 ? 1 - row.net / row.gross : 0;
        if (row.gross === null) put("disc", "-", undefined, { horizontal: "center", vertical: "middle" }); else put("disc", disc, PCT);
        money("net", row.net); money("fees", row.fees); money("total", row.total);
        W.forEach((w, wi) => {
          const ws0 = new Date(w.date + "T00:00:00Z").getTime(), we = ws0 + 6 * 864e5;
          const on = new Date(row.start + "T00:00:00Z").getTime() <= we && new Date(row.end + "T00:00:00Z").getTime() >= ws0;
          style(ws.getCell(col(1 + KEYS.length + wi) + rr), on ? { fill: GOLD } : {});
        });
        if (row.pending) anyPending = true;
        sGross += row.gross ?? 0; sNet += row.net ?? 0; sFees += row.fees ?? 0; sTotal += row.total ?? 0; sFaces += (row.faces ?? 0) * (row.qty ?? 0);
      });
      const lastR = r + g.rows.length - 1, sr = lastR + 1;
      const S2 = (k: (typeof KEYS)[number], formula: string, result: number, fmt: string) => { const cell = ws.getCell(L[k] + sr); cell.value = { formula, result }; style(cell, { fill: LIGHT, font: { bold: true }, fmt }); };
      ws.getCell("B" + sr).value = "Subtotal"; style(ws.getCell("B" + sr), { fill: LIGHT, font: { bold: true } });
      S2("gross", `SUM(${L.gross}${first}:${L.gross}${lastR})`, sGross, QAR); S2("net", `SUM(${L.net}${first}:${L.net}${lastR})`, sNet, QAR);
      S2("disc", `IFERROR(1-${L.net}${sr}/${L.gross}${sr},0)`, sGross ? 1 - sNet / sGross : 0, PCT);
      S2("fees", `SUM(${L.fees}${first}:${L.fees}${lastR})`, sFees, QAR); S2("total", `SUM(${L.total}${first}:${L.total}${lastR})`, sTotal, QAR);
      void sFaces;
      subs.push(sr); gGross += sGross; gNet += sNet; gFees += sFees; gTotal += sTotal;
      r = sr + 2;
    }
    const sum = (k: (typeof KEYS)[number]) => subs.map((s) => L[k] + s).join("+") || "0";
    const agency = P.offline.agencyFee;
    offlineWithFee = gTotal + agency;
    const lines: [string, string | null, number, boolean][] = [
      ["Total Media Gross", sum("gross"), gGross, false], ["Net Media Cost", sum("net"), gNet, false], ["Production and Other Fees", sum("fees"), gFees, false],
      ["Total Net Amount", "C{1}+C{2}", gTotal, true], ["Agency Fee", null, agency, false], ["Total with Agency Fee", "C{3}+C{4}", offlineWithFee, true],
    ];
    const base = r + 1, rowOf = (i: number) => base + i;
    lines.forEach(([label, f, v, bold], i) => {
      const rr = rowOf(i);
      ws.getCell("B" + rr).value = label; ws.getCell("B" + rr).font = { bold };
      const c = ws.getCell("C" + rr);
      c.value = f == null ? v : { formula: f.replace(/\{(\d)\}/g, (_, k) => String(rowOf(+k))), result: v };
      style(c, { fmt: QAR, font: { bold }, fill: i === 5 ? PENDING : undefined });
    });
    refs.offline = `'Offline Media Plan'!C${rowOf(5)}`;
    let nextRow = rowOf(lines.length) + 1;
    if (anyPending) {
      ws.mergeCells(`B${nextRow}:${col(last)}${nextRow}`);
      const nc = ws.getCell("B" + nextRow); nc.value = "Lines marked TBD have a rate or fee that is not yet confirmed (TBD/POA). They are excluded from the totals above and are never counted as zero.";
      nc.font = { italic: true, color: { argb: "FFA45D00" } }; nc.alignment = { wrapText: true }; ws.getRow(nextRow).height = 30; nextRow++;
    }
    termsBlock(ws, P.termsOffline || TERMS_OFFLINE, nextRow + 1, last);
    ws.getColumn(1).width = 3; [30, 28, 24, 8, 8, 16, 11, 16, 18, 16].forEach((w, i) => (ws.getColumn(2 + i).width = w));
    W.forEach((_, i) => (ws.getColumn(2 + KEYS.length + i).width = 6));
  }

  /* ---------- Summary (hybrid) ---------- */
  if (P.planType === "HYBRID") {
    const ws = wb.getWorksheet("Summary")!; ws.views = [{ showGridLines: false }];
    titleBlock(ws, "MEDIA PLAN SUMMARY", H.client, 4, DARK);
    ([["CLIENT", H.client], ["MARKET", H.market], ["CAMPAIGN NAME", H.campaign], ["START DATE", H.start ? new Date(H.start) : ""], ["END DATE", H.end ? new Date(H.end) : ""]] as [string, string | Date][]).forEach(([k, v], i) => {
      ws.getCell("B" + (5 + i)).value = k; ws.getCell("B" + (5 + i)).font = { bold: true };
      const c = ws.getCell("C" + (5 + i)); c.value = v; if (v instanceof Date) c.numFmt = "dd mmm yyyy";
    });
    let r = 12;
    ws.getCell("B" + r).value = "ONLINE"; ws.getCell("B" + r).font = { bold: true, color: { argb: BLUE } }; ws.getCell("C" + r).value = "QAR"; r++;
    refs.online.forEach((x) => { ws.getCell("B" + r).value = x.name; const c = ws.getCell("C" + r); c.value = { formula: x.cell, result: x.value }; c.numFmt = QAR; r++; });
    ws.getCell("B" + r).value = "Total online"; ws.getCell("B" + r).font = { bold: true };
    const on = ws.getCell("C" + r); on.value = { formula: refs.onlineTotal ?? "0", result: onlineQ }; on.numFmt = QAR; on.font = { bold: true };
    const onRow = r; r += 2;
    ws.getCell("B" + r).value = "OFFLINE AND OOH"; ws.getCell("B" + r).font = { bold: true, color: { argb: GOLD } }; r++;
    ws.getCell("B" + r).value = "Total offline with agency fee"; ws.getCell("B" + r).font = { bold: true };
    const of = ws.getCell("C" + r); of.value = { formula: refs.offline ?? "0", result: offlineWithFee }; of.numFmt = QAR; of.font = { bold: true };
    const offRow = r; r += 2;
    ws.getCell("B" + r).value = "GRAND TOTAL (QAR)";
    const g = ws.getCell("C" + r); g.value = { formula: `C${onRow}+C${offRow}`, result: onlineQ + offlineWithFee };
    style(ws.getCell("B" + r), { fill: DARK, font: { bold: true, color: { argb: WHITE } } });
    style(g, { fill: DARK, font: { bold: true, color: { argb: WHITE } }, fmt: QAR });
    ws.getColumn(1).width = 3; ws.getColumn(2).width = 36; ws.getColumn(3).width = 22;
  }
  void hasOn; void hasOff;

  return Buffer.from(await wb.xlsx.writeBuffer());
}
