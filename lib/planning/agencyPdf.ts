// Agency-format PDF (A3 landscape): header, totals, digital sections, targeting, offline groups, terms.
// Same data and numbers as the Excel (see agencyWorkbook.ts); unknown TBD/POA values print as "TBD", never 0.
import PDFDocument from "pdfkit";
import { calcOnline, weeksOf, campaignDays, n, DEFAULT_FX } from "./online";
import { TERMS_ONLINE, TERMS_OFFLINE } from "./terms";
import type { AgencyPlan } from "./agencyWorkbook";

const BLUE = "#4165BB", GOLD = "#C9971A", GREY = "#E4E4E8", MUTED = "#55555C";
const fmt = (v: number, d = 0) => v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const q = (v: number) => "QAR " + fmt(v);
const pct = (v: number) => fmt(v * 100, (v * 100) % 1 ? 1 : 0) + "%";
const money = (v: number | null) => (v === null ? "TBD" : fmt(v));

type Col = { w: number; align?: "left" | "right" | "center" };
type Cell = string | { text: string; bold?: boolean };
type Doc = InstanceType<typeof PDFDocument>;

function table(doc: Doc, cols: Col[], head: string[], rows: Cell[][], opts: { fill: string; weekCols?: { on: boolean[] }[] ; x?: number }) {
  const x0 = opts.x ?? doc.page.margins.left, bottom = () => doc.page.height - doc.page.margins.bottom - 20, pad = 3;
  const heightOf = (cells: Cell[], bold = false) => Math.max(14, ...cells.map((c, i) => {
    const t = typeof c === "string" ? c : c.text;
    doc.font(bold || (typeof c !== "string" && c.bold) ? "Helvetica-Bold" : "Helvetica").fontSize(7);
    return doc.heightOfString(t, { width: cols[i].w - pad * 2 }) + pad * 2;
  }));
  const drawHead = () => {
    const h = heightOf(head, true); let x = x0; const y = doc.y;
    head.forEach((t, i) => {
      doc.rect(x, y, cols[i].w, h).fill(opts.fill);
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(7).text(t, x + pad, y + pad, { width: cols[i].w - pad * 2, align: "center" });
      x += cols[i].w;
    });
    doc.y = y + h;
  };
  drawHead();
  rows.forEach((r, ri) => {
    const h = heightOf(r);
    if (doc.y + h > bottom()) { doc.addPage(); drawHead(); }
    let x = x0; const y = doc.y;
    r.forEach((c, i) => {
      const t = typeof c === "string" ? c : c.text, bold = typeof c !== "string" && c.bold;
      doc.rect(x, y, cols[i].w, h).strokeColor(GREY).lineWidth(0.5).stroke();
      const wk = opts.weekCols?.[ri];
      if (wk && i >= cols.length - wk.on.length && wk.on[i - (cols.length - wk.on.length)]) doc.rect(x, y, cols[i].w, h).fill(opts.fill);
      doc.fillColor("#111114").font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(7).text(t, x + pad, y + pad, { width: cols[i].w - pad * 2, align: cols[i].align ?? "left" });
      x += cols[i].w;
    });
    doc.y = y + h;
  });
  doc.x = doc.page.margins.left;
  doc.moveDown(0.6);
}

export function buildAgencyPdf(P: AgencyPlan): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A3", layout: "landscape", margins: { top: 30, bottom: 36, left: 30, right: 30 }, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const H = P.header, fx = n(H.fx) || DEFAULT_FX, W = weeksOf(H.start, H.end);
    const onCalc = P.online ? calcOnline({ ...P.online, fx }, H.start, H.end) : [];
    const onlineQ = onCalc.reduce((a, s) => a + s.qar, 0);
    let offTotal = 0, offGross = 0, offNet = 0, offFees = 0, anyPending = false;
    if (P.offline) for (const g of P.offline.groups) for (const r of g.rows) { offTotal += r.total ?? 0; offGross += r.gross ?? 0; offNet += r.net ?? 0; offFees += r.fees ?? 0; anyPending ||= r.pending; }
    const offWithFee = P.offline ? offTotal + P.offline.agencyFee : 0;
    const title = `${H.campaign}${H.brand ? " · " + H.brand : ""}`;
    const usable = doc.page.width - 60;

    // header
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#86868B").text("Publicis Media Qatar", 30, 30);
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#111114").text(title);
    doc.font("Helvetica").fontSize(9).fillColor("#111114").text(H.client, { continued: false });
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(`Plan date ${H.planDate}   Reference ${H.reference || "-"}   Market ${H.market}   ${H.start} to ${H.end} (${campaignDays(H.start, H.end)} days)`);
    doc.moveDown(0.8);
    const cardY = doc.y, cardW = usable / 3;
    ([["Online media", P.online ? q(onlineQ) : "-"], ["Offline with agency fee", P.offline ? q(offWithFee) : "-"], ["Grand total", q(onlineQ + offWithFee)]] as const).forEach(([k, v], i) => {
      doc.font("Helvetica").fontSize(8).fillColor("#86868B").text(k, 30 + i * cardW, cardY);
      doc.font("Helvetica-Bold").fontSize(13).fillColor("#111114").text(v, 30 + i * cardW, cardY + 11);
    });
    doc.x = 30; doc.y = cardY + 36;

    // digital
    if (P.online) {
      if (P.planType === "HYBRID") doc.font("Helvetica-Bold").fontSize(14).fillColor(BLUE).text("ONLINE MEDIA").moveDown(0.3);
      P.online.sections.forEach((s, si) => {
        const c = onCalc[si];
        doc.font("Helvetica-Bold").fontSize(11).fillColor("#111114").text(`${s.name} (${s.kpi})`).moveDown(0.2);
        const wkW = 16, main: Col[] = [{ w: 62 }, { w: 55 }, { w: 62 }, { w: 55 }, { w: 55, align: "right" }, { w: 34 }, { w: 40, align: "right" }, { w: 60 }, { w: 55, align: "right" }, { w: 58, align: "right" }, { w: 50, align: "right" }, { w: 34, align: "right" }];
        const cols = [...main, ...W.map(() => ({ w: wkW }))];
        const head = ["Platform", "Ad format", "Placement", "Specs", s.kpi, "Unit", "Price (USD)", "Objective", "Net USD", "Net QAR", "Daily QAR", "Alloc.", ...W.map((w) => w.label)];
        const rows: Cell[][] = s.rows.map((r, ri) => {
          const x = c.rows[ri];
          return [r.platform, r.format, r.placement, r.specs, r.unit === "Flat" || !n(r.price) ? "-" : fmt(x.kpi), r.unit, n(r.price).toFixed(3), r.objective, fmt(x.usd), fmt(x.qar), fmt(x.dQar), c.qar ? pct(x.qar / c.qar) : "-", ...W.map(() => "")];
        });
        rows.push([{ text: "Total", bold: true }, "", "", "", { text: fmt(c.kpi), bold: true }, "", "", "", { text: fmt(c.usd), bold: true }, { text: fmt(c.qar), bold: true }, { text: fmt(c.dQar), bold: true }, "", ...W.map(() => "")]);
        table(doc, cols, head, rows, { fill: BLUE, weekCols: [...s.rows.map((r) => ({ on: W.map((w) => r.weeks.includes(w.date)) })), { on: W.map(() => false) }] });
      });
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#111114").text("Audience targeting").moveDown(0.2);
      table(doc, [{ w: 90 }, { w: 200 }, { w: 120 }, { w: usable - 410 }], ["Platform", "Demographics", "Geographics", "Interests / behaviours"],
        P.online.targeting.map((t) => [t.platform, t.demographics, t.geographics, t.interests]), { fill: BLUE });
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111114").text("Terms and conditions").moveDown(0.2);
      doc.font("Helvetica").fontSize(6.5).fillColor(MUTED).text(P.termsOnline || TERMS_ONLINE, { width: usable }).moveDown(0.8);
    }

    // offline
    if (P.offline) {
      if (P.online) doc.addPage();
      doc.font("Helvetica-Bold").fontSize(14).fillColor("#A67A10").text(P.planType === "HYBRID" ? "OFFLINE AND OOH MEDIA" : "Offline and OOH media").moveDown(0.3);
      for (const g of P.offline.groups) {
        doc.font("Helvetica-Bold").fontSize(11).fillColor("#111114").text(g.name + (g.vendor ? " · " + g.vendor : "")).moveDown(0.2);
        const wkW = 16, main: Col[] = [{ w: 120 }, { w: 105 }, { w: 90 }, { w: 30, align: "right" }, { w: 32, align: "right" }, { w: 62, align: "right" }, { w: 36, align: "right" }, { w: 62, align: "right" }, { w: 62, align: "right" }, { w: 62, align: "right" }];
        const cols = [...main, ...W.map(() => ({ w: wkW }))];
        const head = ["Asset / format", "Location", "Period", "Qty", "Faces", "Gross", "Disc.", "Net media", "Fees", "Total", ...W.map((w) => w.label)];
        let sg = 0, sn = 0, sf = 0, st = 0;
        const rows: Cell[][] = g.rows.map((r) => {
          sg += r.gross ?? 0; sn += r.net ?? 0; sf += r.fees ?? 0; st += r.total ?? 0;
          const disc = r.gross !== null && r.net !== null && r.gross > 0 ? 1 - r.net / r.gross : 0;
          return [r.asset, r.location, `${r.start} to ${r.end}`, r.qty === null ? "" : fmt(r.qty, 1), r.faces === null ? "" : fmt(r.faces), money(r.gross), r.gross === null ? "-" : pct(disc), money(r.net), money(r.fees), money(r.total), ...W.map(() => "")];
        });
        rows.push([{ text: "Subtotal", bold: true }, "", "", "", "", { text: fmt(sg), bold: true }, { text: pct(sg ? 1 - sn / sg : 0), bold: true }, { text: fmt(sn), bold: true }, { text: fmt(sf), bold: true }, { text: fmt(st), bold: true }, ...W.map(() => "")]);
        const weekCols = [...g.rows.map((r) => ({ on: W.map((w) => { const a = new Date(w.date + "T00:00:00Z").getTime(), b = a + 6 * 864e5; return new Date(r.start + "T00:00:00Z").getTime() <= b && new Date(r.end + "T00:00:00Z").getTime() >= a; }) })), { on: W.map(() => false) }];
        table(doc, cols, head, rows, { fill: GOLD, weekCols });
      }
      const lines: [string, string, boolean][] = [["Total media gross", q(offGross), false], ["Net media cost", q(offNet), false], ["Production and other fees", q(offFees), false], ["Total net amount", q(offTotal), true], ["Agency fee", q(P.offline.agencyFee), false], ["Total with agency fee", q(offWithFee), true]];
      table(doc, [{ w: 220 }, { w: 120, align: "right" }], ["", ""], lines.map(([k, v, b]) => [{ text: k, bold: b }, { text: v, bold: b }]), { fill: "#FFFFFF", x: 30 });
      if (anyPending) doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#A45D00").text("Lines marked TBD have a rate or fee that is not yet confirmed (TBD/POA). They are excluded from the totals and are never counted as zero.", { width: usable }).moveDown(0.5);
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#111114").text("Terms and conditions").moveDown(0.2);
      doc.font("Helvetica").fontSize(6.5).fillColor(MUTED).text(P.termsOffline || TERMS_OFFLINE, { width: usable });
    }

    // footer on every page
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.font("Helvetica").fontSize(7).fillColor("#AEAEB2").text(`${title}   ${i + 1} / ${range.count}`, 30, doc.page.height - 26, { width: usable, align: "right", lineBreak: false });
    }
    doc.end();
  });
}
