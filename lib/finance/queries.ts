import { prisma } from "@/lib/prisma";
import { toMinor } from "./money";
import { ageing, cashFlow, margin, type Flow, type Open } from "./reports";

const m = (v: unknown) => toMinor(Number(v));
const OPEN_INV = ["ISSUED", "PART_PAID"], OPEN_BILL = ["APPROVED", "PART_PAID"];

export async function openItems(kind: "AR" | "AP"): Promise<(Open & { clientOrSupplierId: string; issueDate: Date | null; total: number; paid: number })[]> {
  const docs = await prisma.financeDocument.findMany({
    where: kind === "AR" ? { type: "INVOICE", status: { in: OPEN_INV } } : { type: "BILL", status: { in: OPEN_BILL } },
    include: { client: { select: { name: true } }, supplier: { select: { name: true } } }, orderBy: { dueDate: "asc" },
  });
  return docs.filter((d) => d.dueDate).map((d) => ({ id: d.id, code: d.code ?? "", party: (kind === "AR" ? d.client?.name : d.supplier?.name) ?? "?", dueDate: d.dueDate!, outstanding: m(d.total) - m(d.paidAmount), clientOrSupplierId: (kind === "AR" ? d.clientId : d.supplierId) ?? "", issueDate: d.issueDate, total: m(d.total), paid: m(d.paidAmount) }));
}
export async function ageingReport(kind: "AR" | "AP", today = new Date()) { const items = await openItems(kind); return { items, ...ageing(items, today) }; }

type Slim = { id: string; type: string; status: string; subtotal: unknown; taxRatePct: unknown; parentId: string | null; campaignId: string | null };
// Per campaign: what is invoiced/billed so far and what is contracted but not yet invoiced/billed.
export async function marginByCampaign() {
  const docs: Slim[] = await prisma.financeDocument.findMany({ where: { status: { notIn: ["DRAFT", "CANCELLED", "REJECTED", "VOID", "PENDING_APPROVAL"] } }, select: { id: true, type: true, status: true, subtotal: true, taxRatePct: true, parentId: true, campaignId: true } });
  const children = new Map<string, number>();
  for (const d of docs) if (d.parentId && (d.type === "INVOICE" || d.type === "BILL")) children.set(d.parentId, (children.get(d.parentId) ?? 0) + m(d.subtotal));
  const rows = new Map<string, { invoiced: number; billed: number; bookedNotInvoiced: number; poNotBilled: number }>();
  const row = (k: string) => rows.get(k) ?? rows.set(k, { invoiced: 0, billed: 0, bookedNotInvoiced: 0, poNotBilled: 0 }).get(k)!;
  for (const d of docs) {
    const r = row(d.campaignId ?? "");
    if (d.type === "INVOICE" && ["ISSUED", "PART_PAID", "PAID"].includes(d.status)) r.invoiced += m(d.subtotal);
    if (d.type === "BILL" && ["APPROVED", "PART_PAID", "PAID"].includes(d.status)) r.billed += m(d.subtotal);
    if (d.type === "BOOKING_ORDER" && d.status === "CONFIRMED") r.bookedNotInvoiced += Math.max(0, m(d.subtotal) - (children.get(d.id) ?? 0));
    if (d.type === "PURCHASE_ORDER" && ["APPROVED", "SENT"].includes(d.status)) r.poNotBilled += Math.max(0, m(d.subtotal) - (children.get(d.id) ?? 0));
  }
  const campaigns = await prisma.campaign.findMany({ where: { id: { in: [...rows.keys()].filter(Boolean) } }, select: { id: true, code: true, name: true, client: { select: { name: true } } } });
  return [...rows.entries()].map(([id, r]) => { const c = campaigns.find((x) => x.id === id); return { campaignId: id || null, code: c?.code ?? "", name: c ? c.name : "(not linked to a campaign)", client: c?.client.name ?? "", ...r, ...margin(r) }; }).sort((a, b) => b.revenue - a.revenue);
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
export async function forecast(today = new Date()) {
  const [ar, ap, bos, pos] = await Promise.all([
    openItems("AR"), openItems("AP"),
    prisma.financeDocument.findMany({ where: { type: "BOOKING_ORDER", status: "CONFIRMED" }, include: { campaign: { select: { endDate: true } }, client: { select: { paymentTermsDays: true } }, children: { where: { type: "INVOICE", status: { not: "VOID" } }, select: { subtotal: true } } } }),
    prisma.financeDocument.findMany({ where: { type: "PURCHASE_ORDER", status: { in: ["APPROVED", "SENT"] } }, include: { campaign: { select: { endDate: true } }, children: { where: { type: "BILL", status: { not: "VOID" } }, select: { subtotal: true } } } }),
  ]);
  const inflows: Flow[] = ar.map((i) => ({ date: i.dueDate, amount: i.outstanding, label: `Invoice ${i.code} (${i.party})` }));
  for (const b of bos) {
    const rest = m(b.subtotal) - b.children.reduce((a, c) => a + m(c.subtotal), 0);
    if (rest > 0) inflows.push({ date: b.campaign?.endDate ? addDays(b.campaign.endDate, b.client?.paymentTermsDays ?? 30) : null, amount: Math.round(rest * (1 + Number(b.taxRatePct) / 100)), label: `Booked, not yet invoiced: ${b.code}` });
  }
  const outflows: Flow[] = ap.map((i) => ({ date: i.dueDate, amount: i.outstanding, label: `Bill ${i.code} (${i.party})` }));
  for (const p of pos) {
    const rest = m(p.subtotal) - p.children.reduce((a, c) => a + m(c.subtotal), 0);
    if (rest > 0) outflows.push({ date: p.campaign?.endDate ? addDays(p.campaign.endDate, 30) : null, amount: Math.round(rest * (1 + Number(p.taxRatePct) / 100)), label: `Ordered, not yet billed: ${p.code}` });
  }
  return { ...cashFlow(inflows, outflows, today, 13), inflows, outflows };
}

export async function dashboard(today = new Date()) {
  const [ar, ap, counts] = await Promise.all([ageingReport("AR", today), ageingReport("AP", today), prisma.financeDocument.groupBy({ by: ["type", "status"], _count: { _all: true } })]);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const [rev, cost, received, paidOut] = await Promise.all([
    prisma.financeDocument.aggregate({ where: { type: "INVOICE", status: { in: ["ISSUED", "PART_PAID", "PAID"] }, issueDate: { gte: monthStart } }, _sum: { subtotal: true } }),
    prisma.financeDocument.aggregate({ where: { type: "BILL", status: { in: ["APPROVED", "PART_PAID", "PAID"] }, issueDate: { gte: monthStart } }, _sum: { subtotal: true } }),
    prisma.financePayment.aggregate({ where: { direction: "IN", voidedAt: null, paidOn: { gte: monthStart } }, _sum: { amount: true } }),
    prisma.financePayment.aggregate({ where: { direction: "OUT", voidedAt: null, paidOn: { gte: monthStart } }, _sum: { amount: true } }),
  ]);
  const overdueAR = ar.items.filter((i) => i.dueDate.getTime() < Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).reduce((a, i) => a + i.outstanding, 0);
  return { arTotal: ar.grand, apTotal: ap.grand, overdueAR, ar: ar.total, ap: ap.total, monthRevenue: m(rev._sum.subtotal ?? 0), monthCost: m(cost._sum.subtotal ?? 0), monthReceived: m(received._sum.amount ?? 0), monthPaid: m(paidOut._sum.amount ?? 0), counts };
}
