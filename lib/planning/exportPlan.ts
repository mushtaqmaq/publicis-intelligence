import "server-only";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";

export type ExportMode = "client" | "internal";

export type ExportRow = {
  asset: string;
  location: string;
  supplier: string;
  format: string | null;
  startDate: string;
  endDate: string;
  quantity: number | string;
  rateYear: number | string;
  grossCost: number | string;
  discountPct: number;
  netMedia: number | string;
  fees: number;
  total: number | string;
  sourceDocument?: string;
  sourcePage?: number | string;
  additionalDiscountPct?: number;
  notes?: string;
  buyingEntity?: string; // who actually executed the buy, when different from the supplier ("Direct" otherwise) — internal-only
};

export type PlanExportData = {
  plan: {
    campaignName: string;
    clientName: string;
    campaignStart: string;
    campaignEnd: string;
    currency: string;
    status: string;
    budget: number | null;
  };
  mode: ExportMode;
  rows: ExportRow[];
  totals: { gross: number; net: number; fees: number; total: number };
  anyPending: boolean;
};

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function num(v: unknown) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function gatherPlanExportData(
  planId: string,
  versionIdParam: string | null,
  mode: ExportMode
): Promise<PlanExportData | null> {
  const plan = await prisma.mediaPlan.findUnique({
    where: { id: planId },
    include: { client: true, versions: { orderBy: { versionNumber: "desc" }, select: { id: true } } },
  });
  if (!plan) return null;

  const versionId = (versionIdParam && plan.versions.some((v) => v.id === versionIdParam) ? versionIdParam : plan.versions[0]?.id) ?? null;
  if (!versionId) return null;

  const version = await prisma.mediaPlanVersion.findUniqueOrThrow({
    where: { id: versionId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { asset: { include: { supplier: true } }, buyingEntity: { select: { name: true } } },
      },
    },
  });

  const rows: ExportRow[] = [];
  let grossTotal = 0;
  let netTotal = 0;
  let feesTotal = 0;
  let grandTotal = 0;
  let anyPending = false;

  for (const item of version.items) {
    const snapshot = item.rateSnapshot as unknown as {
      rateYear?: number;
      sourceRateCard?: string;
      sourcePage?: number | null;
    };
    const fees =
      (num(item.productionFee) ?? 0) +
      (num(item.uploadFee) ?? 0) +
      (num(item.installationFee) ?? 0) +
      (num(item.serviceFee) ?? 0) +
      (num(item.otherFees) ?? 0);

    if (num(item.grossCost) !== null) grossTotal += num(item.grossCost)!;
    if (num(item.netMedia) !== null) netTotal += num(item.netMedia)!;
    feesTotal += fees;
    if (num(item.lineTotal) !== null) grandTotal += num(item.lineTotal)!;
    if (item.excludesPendingCost) anyPending = true;

    const row: ExportRow = {
      asset: item.asset.assetName,
      location: item.asset.locationName,
      supplier: item.asset.supplier.name,
      format: item.asset.format,
      startDate: fmtDate(item.startDate),
      endDate: fmtDate(item.endDate),
      quantity: item.selectedCircuits ?? item.selectedFaces ?? "",
      rateYear: snapshot.rateYear ?? "",
      grossCost: num(item.grossCost) ?? (item.excludesPendingCost ? "TBD" : ""),
      discountPct: item.discountPct ? Number(item.discountPct) * 100 : 0,
      netMedia: num(item.netMedia) ?? (item.excludesPendingCost ? "TBD" : ""),
      fees,
      total: num(item.lineTotal) ?? (item.excludesPendingCost ? "TBD" : ""),
    };

    if (mode === "internal") {
      row.sourceDocument = snapshot.sourceRateCard ?? "";
      row.sourcePage = snapshot.sourcePage ?? "";
      row.additionalDiscountPct = item.additionalDiscountPct ? Number(item.additionalDiscountPct) * 100 : 0;
      row.notes = item.notes ?? "";
      row.buyingEntity = item.buyingEntity?.name ?? "Direct";
    }

    rows.push(row);
  }

  return {
    plan: {
      campaignName: plan.campaignName,
      clientName: plan.client.name,
      campaignStart: fmtDate(plan.campaignStart),
      campaignEnd: fmtDate(plan.campaignEnd),
      currency: plan.currency,
      status: plan.status,
      budget: plan.budget ? Number(plan.budget) : null,
    },
    mode,
    rows,
    totals: { gross: grossTotal, net: netTotal, fees: feesTotal, total: grandTotal },
    anyPending,
  };
}

function sheetRows(data: PlanExportData): Record<string, unknown>[] {
  const rows = data.rows.map((r) => {
    const row: Record<string, unknown> = {
      Asset: r.asset,
      Location: r.location,
      Supplier: r.supplier,
      Format: r.format,
      "Start Date": r.startDate,
      "End Date": r.endDate,
      Quantity: r.quantity,
      "Rate Year": r.rateYear,
      "Gross Cost": r.grossCost,
      "Discount %": r.discountPct,
      "Net Media": r.netMedia,
      Fees: r.fees || "",
      Total: r.total,
    };
    if (data.mode === "internal") {
      row["Source Document"] = r.sourceDocument ?? "";
      row["Source Page"] = r.sourcePage ?? "";
      row["Additional Discount %"] = r.additionalDiscountPct ?? 0;
      row["Notes"] = r.notes ?? "";
      row["Buying Entity / Seat"] = r.buyingEntity ?? "Direct";
    }
    return row;
  });
  rows.push({});
  rows.push({
    Asset: "TOTALS",
    "Gross Cost": data.totals.gross,
    "Net Media": data.totals.net,
    Fees: data.totals.fees,
    Total: data.totals.total,
  });
  return rows;
}

export function exportFilename(data: PlanExportData, extension: string) {
  return `${data.plan.campaignName.replace(/[^a-z0-9]+/gi, "_")}_${data.mode}.${extension}`;
}

export function buildXlsxBuffer(data: PlanExportData): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(sheetRows(data));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Media Plan");

  const summarySheet = XLSX.utils.json_to_sheet([
    { Field: "Campaign", Value: data.plan.campaignName },
    { Field: "Client", Value: data.plan.clientName },
    { Field: "Campaign Start", Value: data.plan.campaignStart },
    { Field: "Campaign End", Value: data.plan.campaignEnd },
    { Field: "Currency", Value: data.plan.currency },
    { Field: "Status", Value: data.plan.status },
    { Field: "Budget", Value: data.plan.budget ?? "" },
    { Field: "Exported", Value: new Date().toISOString() },
    { Field: "Mode", Value: data.mode === "internal" ? "Internal Commercial" : "Client-Facing" },
  ]);
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function buildCsvBuffer(data: PlanExportData): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(sheetRows(data));
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  return Buffer.from(csv, "utf-8");
}

const PDF_COLUMNS_CLIENT: { key: keyof ExportRow; label: string; width: number; align?: "right" }[] = [
  { key: "asset", label: "Asset", width: 130 },
  { key: "supplier", label: "Supplier", width: 70 },
  { key: "startDate", label: "Start", width: 55 },
  { key: "endDate", label: "End", width: 55 },
  { key: "quantity", label: "Qty", width: 30, align: "right" },
  { key: "grossCost", label: "Gross", width: 60, align: "right" },
  { key: "discountPct", label: "Disc %", width: 40, align: "right" },
  { key: "total", label: "Total", width: 65, align: "right" },
];

const PDF_COLUMNS_INTERNAL: { key: keyof ExportRow; label: string; width: number; align?: "right" }[] = [
  { key: "asset", label: "Asset", width: 90 },
  { key: "supplier", label: "Supplier", width: 50 },
  { key: "startDate", label: "Start", width: 62 },
  { key: "endDate", label: "End", width: 62 },
  { key: "quantity", label: "Qty", width: 25, align: "right" },
  { key: "grossCost", label: "Gross", width: 50, align: "right" },
  { key: "netMedia", label: "Net", width: 50, align: "right" },
  { key: "total", label: "Total", width: 55, align: "right" },
  { key: "sourceDocument", label: "Source", width: 65 },
  { key: "buyingEntity", label: "Seat", width: 55 },
];

export async function buildPdfBuffer(data: PlanExportData): Promise<Buffer> {
  const columns = data.mode === "internal" ? PDF_COLUMNS_INTERNAL : PDF_COLUMNS_CLIENT;
  const doc = new PDFDocument({ size: "A4", margin: 36, layout: "landscape" });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.fontSize(16).text(data.plan.campaignName, { continued: false });
  doc.fontSize(10).fillColor("#555").text(`${data.plan.clientName} · ${data.plan.campaignStart} to ${data.plan.campaignEnd} · ${data.plan.currency}`);
  doc.text(`Status: ${data.plan.status} · Mode: ${data.mode === "internal" ? "Internal Commercial" : "Client-Facing"} · Exported ${fmtDate(new Date())}`);
  doc.moveDown(0.75);

  const startX = doc.page.margins.left;
  let y = doc.y;
  const rowHeight = 16;
  const tableWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const COLUMN_GUTTER = 8;

  function drawHeader() {
    doc.fontSize(8).fillColor("#000");
    let x = startX;
    for (const col of columns) {
      doc.text(col.label.toUpperCase(), x, y, { width: col.width - COLUMN_GUTTER, align: col.align ?? "left" });
      x += col.width;
    }
    y += rowHeight;
    doc.moveTo(startX, y - 2).lineTo(startX + tableWidth, y - 2).strokeColor("#ccc").stroke();
  }

  drawHeader();

  doc.fontSize(8).fillColor("#111");
  for (const row of data.rows) {
    if (y > doc.page.height - doc.page.margins.bottom - rowHeight * 3) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
      doc.fontSize(8).fillColor("#111");
    }
    let x = startX;
    for (const col of columns) {
      const raw = row[col.key];
      const value =
        typeof raw === "number"
          ? col.key === "discountPct"
            ? `${raw.toFixed(0)}%`
            : raw.toLocaleString(undefined, { maximumFractionDigits: 2 })
          : String(raw ?? "");
      doc.text(value, x, y, {
        width: col.width - COLUMN_GUTTER,
        height: rowHeight - 4,
        align: col.align ?? "left",
        ellipsis: true,
      });
      x += col.width;
    }
    y += rowHeight;
  }

  y += 6;
  doc.moveTo(startX, y).lineTo(startX + tableWidth, y).strokeColor("#000").stroke();
  y += 6;
  doc.fontSize(9).font("Helvetica-Bold");
  doc.text(`Gross: ${data.totals.gross.toLocaleString()}`, startX, y, { continued: true });
  doc.text(`   Net: ${data.totals.net.toLocaleString()}`, { continued: true });
  doc.text(`   Fees: ${data.totals.fees.toLocaleString()}`, { continued: true });
  doc.text(`   Total: ${data.totals.total.toLocaleString()} ${data.plan.currency}`);
  doc.font("Helvetica");
  if (data.anyPending) {
    doc.fontSize(8).fillColor("#a15c00").text("* One or more line items exclude a pending (TBD/POA) cost — totals above are partial.");
  }

  doc.end();
  return done;
}
