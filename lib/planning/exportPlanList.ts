import "server-only";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma";
import type { MediaPlanStatus } from "@/generated/prisma/enums";

export type PlanListFilters = {
  status?: MediaPlanStatus;
  year?: number;
};

export type PlanListRow = {
  planCode: string;
  campaignName: string;
  clientName: string;
  campaignStart: string;
  campaignEnd: string;
  status: string;
  currency: string;
  assetCount: number;
  total: number;
};

export type PlanListExportData = {
  filters: PlanListFilters;
  rows: PlanListRow[];
  totalsByCurrency: Record<string, number>;
};

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// A plan is attributed to the year its campaign ENDS in — "completed in
// 2026" means the campaign wrapped up in 2026, regardless of when it started
// or was created.
export async function gatherPlanListExportData(filters: PlanListFilters): Promise<PlanListExportData> {
  const plans = await prisma.mediaPlan.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.year
        ? {
            campaignEnd: {
              gte: new Date(Date.UTC(filters.year, 0, 1)),
              lt: new Date(Date.UTC(filters.year + 1, 0, 1)),
            },
          }
        : {}),
    },
    orderBy: { campaignEnd: "desc" },
    include: {
      client: { select: { name: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: { items: { select: { lineTotal: true } } },
      },
    },
  });

  const rows: PlanListRow[] = [];
  const totalsByCurrency: Record<string, number> = {};

  for (const plan of plans) {
    const version = plan.versions[0];
    const total = version ? version.items.reduce((sum, i) => sum + (i.lineTotal ? Number(i.lineTotal) : 0), 0) : 0;
    totalsByCurrency[plan.currency] = (totalsByCurrency[plan.currency] ?? 0) + total;

    rows.push({
      planCode: plan.planCode,
      campaignName: plan.campaignName,
      clientName: plan.client.name,
      campaignStart: fmtDate(plan.campaignStart),
      campaignEnd: fmtDate(plan.campaignEnd),
      status: plan.status,
      currency: plan.currency,
      assetCount: version ? version.items.length : 0,
      total,
    });
  }

  return { filters, rows, totalsByCurrency };
}

export function exportListFilename(data: PlanListExportData, extension: string) {
  const parts = ["Media_Plans"];
  if (data.filters.status) parts.push(data.filters.status);
  if (data.filters.year) parts.push(String(data.filters.year));
  return `${parts.join("_")}.${extension}`;
}

function sheetRows(data: PlanListExportData): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = data.rows.map((r) => ({
    "Plan Code": r.planCode,
    Campaign: r.campaignName,
    Client: r.clientName,
    "Start Date": r.campaignStart,
    "End Date": r.campaignEnd,
    Status: r.status,
    Currency: r.currency,
    Assets: r.assetCount,
    Total: r.total,
  }));
  rows.push({});
  for (const [currency, total] of Object.entries(data.totalsByCurrency)) {
    rows.push({ "Plan Code": `TOTAL (${currency})`, Total: total });
  }
  return rows;
}

export function buildListXlsxBuffer(data: PlanListExportData): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(sheetRows(data));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Media Plans");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function buildListCsvBuffer(data: PlanListExportData): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(sheetRows(data));
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  return Buffer.from(csv, "utf-8");
}

const PDF_COLUMNS: { key: keyof PlanListRow; label: string; width: number; align?: "right" }[] = [
  { key: "planCode", label: "Plan Code", width: 70 },
  { key: "campaignName", label: "Campaign", width: 150 },
  { key: "clientName", label: "Client", width: 100 },
  { key: "campaignStart", label: "Start", width: 60 },
  { key: "campaignEnd", label: "End", width: 60 },
  { key: "status", label: "Status", width: 75 },
  { key: "assetCount", label: "Assets", width: 45, align: "right" },
  { key: "total", label: "Total", width: 75, align: "right" },
];

export async function buildListPdfBuffer(data: PlanListExportData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 36, layout: "landscape" });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const titleParts = ["Media Plans"];
  if (data.filters.status) titleParts.push(`— ${data.filters.status.replace(/_/g, " ")}`);
  if (data.filters.year) titleParts.push(`— ${data.filters.year}`);
  doc.fontSize(16).text(titleParts.join(" "));
  doc.fontSize(9).fillColor("#555").text(`${data.rows.length} plan(s) · Exported ${fmtDate(new Date())}`);
  doc.moveDown(0.75);

  const startX = doc.page.margins.left;
  let y = doc.y;
  const rowHeight = 16;
  const tableWidth = PDF_COLUMNS.reduce((sum, c) => sum + c.width, 0);
  const COLUMN_GUTTER = 8;

  function drawHeader() {
    doc.fontSize(8).fillColor("#000");
    let x = startX;
    for (const col of PDF_COLUMNS) {
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
    for (const col of PDF_COLUMNS) {
      const raw = row[col.key];
      const value =
        typeof raw === "number" ? raw.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(raw ?? "").replace(/_/g, " ");
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
  const totalsText = Object.entries(data.totalsByCurrency)
    .map(([currency, total]) => `${currency} ${total.toLocaleString()}`)
    .join("   ·   ");
  doc.text(data.rows.length > 0 ? `Total: ${totalsText}` : "No plans match these filters.", startX, y);
  doc.font("Helvetica");

  doc.end();
  return done;
}
