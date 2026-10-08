import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFinanceUser } from "@/lib/auth/finance";
import { openItems, marginByCampaign, forecast } from "@/lib/finance/queries";
import { toCsv } from "@/lib/finance/csv";
import { fromMinor } from "@/lib/finance/money";

const q = (m: number) => fromMinor(m).toFixed(2);

// CSV exports for the finance reports. Same guard as the pages: signed in and holding the Finance module.
export async function GET(_req: Request, { params }: { params: Promise<{ report: string }> }) {
  await requireFinanceUser();
  const { report } = await params;
  let header: string[] = [], rows: unknown[][] = [];
  if (report === "receivables" || report === "payables") {
    const items = await openItems(report === "receivables" ? "AR" : "AP");
    header = ["Number", report === "receivables" ? "Client" : "Supplier", "Issued", "Due", "Total", "Paid", "Outstanding"];
    rows = items.map((i) => [i.code, i.party, i.issueDate, i.dueDate, q(i.total), q(i.paid), q(i.outstanding)]);
  } else if (report === "margin") {
    header = ["Campaign", "Name", "Client", "Invoiced", "Billed", "Actual margin", "Actual %", "Projected revenue", "Projected cost", "Projected margin", "Projected %"];
    rows = (await marginByCampaign()).map((r) => [r.code, r.name, r.client, q(r.invoiced), q(r.billed), q(r.actual), r.actualPct?.toFixed(1) ?? "", q(r.revenue), q(r.cost), q(r.projected), r.projectedPct?.toFixed(1) ?? ""]);
  } else if (report === "forecast") {
    const f = await forecast();
    header = ["Week starting", "In", "Out", "Net", "Running"];
    rows = f.rows.map((r) => [r.weekStart, q(r.in), q(r.out), q(r.net), q(r.cumulative)]);
  } else if (report === "invoices" || report === "bills") {
    const docs = await prisma.financeDocument.findMany({ where: { type: report === "invoices" ? "INVOICE" : "BILL", status: { not: "DRAFT" } }, orderBy: { createdAt: "asc" }, include: { client: { select: { name: true } }, supplier: { select: { name: true } }, campaign: { select: { code: true } } } });
    header = ["Number", "Party", "Campaign", "Reference", "Status", "Issued", "Due", "Subtotal", "Tax", "Total", "Paid"];
    rows = docs.map((d) => [d.code, d.client?.name ?? d.supplier?.name, d.campaign?.code, d.reference, d.status, d.issueDate, d.dueDate, d.subtotal.toString(), d.taxAmount.toString(), d.total.toString(), d.paidAmount.toString()]);
  } else if (report === "payments") {
    const pays = await prisma.financePayment.findMany({ orderBy: { paidOn: "asc" }, include: { allocations: { include: { document: { select: { code: true } } } } } });
    header = ["Number", "Direction", "Date", "Method", "Reference", "Amount", "Applied to", "Void"];
    rows = pays.map((p) => [p.code, p.direction, p.paidOn, p.method, p.reference, p.amount.toString(), p.allocations.map((a) => a.document.code).join(" "), p.voidedAt ? "yes" : ""]);
  } else return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  return new NextResponse(toCsv(header, rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${report}-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } });
}
