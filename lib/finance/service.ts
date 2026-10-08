import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { audit, CoreError, submitApproval, cancelApproval } from "@/lib/core/service";
import { nextNumber } from "@/lib/core/sequence";
import type { Actor } from "@/lib/core/approvals";
import { MoneyError, lineAmountMinor, toMinor, totals, fromMinor } from "./money";
import * as rules from "./rules";
import { sanitizeOnlineData, calcOnline } from "@/lib/planning/online";

export type FActor = Actor & { manager: boolean };
export type DocType = rules.DocType;
const PREFIX: Record<DocType, string> = { QUOTATION: "QUO", BOOKING_ORDER: "BO", PURCHASE_ORDER: "PO", INVOICE: "INV", BILL: "BILL" };
const NUMBER_AT_CREATE: DocType[] = ["QUOTATION", "BOOKING_ORDER", "PURCHASE_ORDER"];
const num = (v: unknown) => Number(v);
const minor = (v: unknown) => toMinor(num(v));

const wrap = async <T>(fn: () => Promise<T>) => {
  try { return await fn(); } catch (e) {
    if (e instanceof rules.RuleError || e instanceof MoneyError) throw new CoreError(e.message);
    throw e;
  }
};
const today = () => { const t = new Date(); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())); };
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);

export type LineInput = { description: string; quantity: number; unitPrice: number | string; sourceItemId?: string | null };
export type DocInput = { type: DocType; clientId?: string | null; supplierId?: string | null; campaignId?: string | null; mediaPlanId?: string | null; mediaPlanVersionId?: string | null; parentId?: string | null; reference?: string | null; issueDate?: Date | null; dueDate?: Date | null; validUntil?: Date | null; taxRatePct?: number; notes?: string | null; lines: LineInput[] };

function cleanLines(lines: LineInput[]) {
  const out = lines.filter((l) => l.description.trim() || Number(l.unitPrice)).map((l, i) => {
    const description = l.description.trim();
    if (!description) throw new CoreError(`Line ${i + 1} needs a description.`);
    const unit = toMinor(l.unitPrice);
    return { position: i + 1, description: description.slice(0, 500), quantity: l.quantity, unitMinor: unit, amountMinor: lineAmountMinor(l.quantity, unit), sourceItemId: l.sourceItemId ?? null };
  });
  return out;
}

async function party(input: DocInput) {
  if (input.clientId && !(await prisma.client.findUnique({ where: { id: input.clientId }, select: { id: true } }))) throw new CoreError("That client no longer exists.");
  if (input.supplierId && !(await prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } }))) throw new CoreError("That supplier no longer exists.");
  if (input.campaignId) {
    const c = await prisma.campaign.findUnique({ where: { id: input.campaignId }, select: { clientId: true } });
    if (!c) throw new CoreError("That campaign no longer exists.");
    if (input.clientId && c.clientId !== input.clientId) throw new CoreError("The campaign belongs to a different client.");
  }
}
function sides(type: DocType, input: DocInput) {
  const client = type === "QUOTATION" || type === "BOOKING_ORDER" || type === "INVOICE";
  if (client && input.supplierId) throw new CoreError("A client document cannot have a supplier.");
  if (!client && input.clientId) throw new CoreError("A supplier document cannot have a client.");
}

export async function createDocument(actor: FActor, input: DocInput) {
  return wrap(async () => {
    sides(input.type, input); await party(input);
    const lines = cleanLines(input.lines);
    const tax = input.taxRatePct ?? 0;
    const t = totals(lines.map((l) => ({ quantity: l.quantity, unitPriceMinor: l.unitMinor })), tax);
    const doc = await prisma.$transaction(async (tx) => {
      const code = NUMBER_AT_CREATE.includes(input.type) ? await nextNumber(tx as never, PREFIX[input.type], PREFIX[input.type]) : null;
      return tx.financeDocument.create({ data: {
        type: input.type, code, clientId: input.clientId || null, supplierId: input.supplierId || null, campaignId: input.campaignId || null, mediaPlanId: input.mediaPlanId || null, mediaPlanVersionId: input.mediaPlanVersionId || null, parentId: input.parentId || null,
        reference: input.reference?.trim() || null, issueDate: input.issueDate ?? null, dueDate: input.dueDate ?? null, validUntil: input.validUntil ?? null, taxRatePct: tax, notes: input.notes?.trim() || null, createdById: actor.id,
        subtotal: fromMinor(t.subtotal), taxAmount: fromMinor(t.tax), total: fromMinor(t.total),
        lines: { create: lines.map((l) => ({ position: l.position, description: l.description, quantity: l.quantity, unitPrice: fromMinor(l.unitMinor), amount: fromMinor(l.amountMinor), sourceItemId: l.sourceItemId })) },
      } });
    });
    await audit(actor.id, "FINANCE_DOC_CREATED", "FinanceDocument", doc.id, { type: input.type, code: doc.code, total: num(doc.total) });
    return doc;
  });
}

async function loadDoc(id: string) {
  const d = await prisma.financeDocument.findUnique({ where: { id }, include: { lines: true } });
  if (!d) throw new CoreError("That document no longer exists.");
  return d;
}

// Edits a draft (header and all lines). Anything past DRAFT is locked.
export async function updateDraft(actor: FActor, id: string, input: Omit<DocInput, "type">) {
  return wrap(async () => {
    const d = await loadDoc(id);
    if (!rules.isEditable(d.status)) throw new CoreError("Only a draft can be edited.");
    const full: DocInput = { ...input, type: d.type };
    sides(d.type, full); await party(full);
    const lines = cleanLines(input.lines);
    const tax = input.taxRatePct ?? num(d.taxRatePct);
    const t = totals(lines.map((l) => ({ quantity: l.quantity, unitPriceMinor: l.unitMinor })), tax);
    await prisma.$transaction(async (tx) => {
      const locked = await tx.financeDocument.updateMany({ where: { id, status: "DRAFT" }, data: { clientId: input.clientId || null, supplierId: input.supplierId || null, campaignId: input.campaignId || null, reference: input.reference?.trim() || null, issueDate: input.issueDate ?? null, dueDate: input.dueDate ?? null, validUntil: input.validUntil ?? null, taxRatePct: tax, notes: input.notes?.trim() || null, subtotal: fromMinor(t.subtotal), taxAmount: fromMinor(t.tax), total: fromMinor(t.total) } });
      if (locked.count !== 1) throw new CoreError("This document just changed. Reload and try again.");
      await tx.financeLine.deleteMany({ where: { documentId: id } });
      await tx.financeLine.createMany({ data: lines.map((l) => ({ documentId: id, position: l.position, description: l.description, quantity: l.quantity, unitPrice: fromMinor(l.unitMinor), amount: fromMinor(l.amountMinor), sourceItemId: l.sourceItemId })) });
    });
    await audit(actor.id, "FINANCE_DOC_EDITED", "FinanceDocument", id, { total: fromMinor(t.total) }, { total: num(d.total) });
  });
}

const hasTemplate = async (documentType: string) => !!(await prisma.approvalTemplate.findUnique({ where: { documentType }, select: { id: true } }));

// DRAFT -> approval (if steps are configured for this type) or straight to APPROVED. Bills get their number here.
export async function submitForApproval(actor: FActor, id: string) {
  return wrap(async () => {
    const d = await loadDoc(id);
    if (!(["QUOTATION", "PURCHASE_ORDER", "BILL"] as DocType[]).includes(d.type)) throw new CoreError("This kind of document does not need approval.");
    if (d.status !== "DRAFT") throw new CoreError("Only a draft can be submitted.");
    rules.checkIssuable(d.type, { total: minor(d.total), lines: d.lines.length, clientId: d.clientId, supplierId: d.supplierId, issueDate: d.type === "BILL" ? d.issueDate : new Date(), dueDate: d.type === "BILL" ? d.dueDate : null });
    if (d.type === "BILL" && !d.reference) throw new CoreError("Enter the supplier's invoice number as the reference.");
    const tmpl = await hasTemplate(d.type);
    await prisma.$transaction(async (tx) => {
      const code = d.code ?? (d.type === "BILL" ? await nextNumber(tx as never, "BILL", "BILL") : null);
      const moved = await tx.financeDocument.updateMany({ where: { id, status: "DRAFT" }, data: { code, status: tmpl ? "PENDING_APPROVAL" : "APPROVED" } });
      if (moved.count !== 1) throw new CoreError("This document just changed. Reload and try again.");
    });
    if (tmpl) {
      try { await submitApproval(actor, { documentType: d.type, documentId: id, title: `${d.code ?? "Bill"} ${fromMinor(minor(d.total)).toLocaleString()} QAR`, amount: num(d.total) }); }
      catch (e) { await prisma.financeDocument.update({ where: { id }, data: { status: "DRAFT" } }); throw e; }
    }
    await audit(actor.id, "FINANCE_DOC_SUBMITTED", "FinanceDocument", id, { approval: tmpl });
  });
}

// Called when the shared approval on a finance document closes.
export async function onFinanceApproval(documentId: string, result: "APPROVED" | "REJECTED", actorId: string) {
  const d = await prisma.financeDocument.findUnique({ where: { id: documentId } });
  if (!d || d.status !== "PENDING_APPROVAL") return;
  const to = result === "APPROVED" ? "APPROVED" : d.type === "PURCHASE_ORDER" ? "REJECTED" : "DRAFT";
  await prisma.financeDocument.update({ where: { id: documentId }, data: { status: to } });
  await audit(actorId, result === "APPROVED" ? "FINANCE_DOC_APPROVED" : "FINANCE_DOC_REJECTED", "FinanceDocument", documentId, { status: to });
}

// People-made moves: send, accept, confirm, issue, void, cancel, close.
export async function move(actor: FActor, id: string, to: string, extra: { reference?: string; issueDate?: Date; dueDate?: Date } = {}) {
  return wrap(async () => {
    const d = await loadDoc(id);
    if (!rules.canMove(d.type, d.status, to)) throw new CoreError(`A ${d.type.replace("_", " ").toLowerCase()} that is ${d.status.replace("_", " ").toLowerCase()} cannot be made ${to.replace("_", " ").toLowerCase()}.`);
    if ((d.type === "INVOICE" || to === "VOID") && !actor.manager) throw new CoreError("Only a finance manager can issue or void.");
    if (d.type === "QUOTATION" && d.status === "DRAFT" && to === "SENT" && (await hasTemplate("QUOTATION"))) throw new CoreError("Submit this quotation for approval first.");
    if (d.type === "BOOKING_ORDER" && to === "CONFIRMED") {
      const ref = (extra.reference ?? d.reference ?? "").trim();
      if (!ref) throw new CoreError("Enter the client's LPO / order reference to confirm.");
      extra.reference = ref;
    }
    if ((to === "VOID") && num(d.paidAmount) > 0) throw new CoreError("Void the payments first. This document has money allocated to it.");
    let issueDate = d.issueDate, dueDate = d.dueDate;
    if (d.type === "INVOICE" && to === "ISSUED") {
      issueDate = extra.issueDate ?? d.issueDate ?? today();
      const client = d.clientId ? await prisma.client.findUnique({ where: { id: d.clientId }, select: { paymentTermsDays: true } }) : null;
      dueDate = extra.dueDate ?? d.dueDate ?? addDays(issueDate, client?.paymentTermsDays ?? 30);
      rules.checkIssuable("INVOICE", { total: minor(d.total), lines: d.lines.length, clientId: d.clientId, issueDate, dueDate });
    }
    await prisma.$transaction(async (tx) => {
      const code = d.type === "INVOICE" && to === "ISSUED" && !d.code ? await nextNumber(tx as never, "INV", "INV", 5) : d.code;
      const moved = await tx.financeDocument.updateMany({ where: { id, status: d.status }, data: { status: to, code, issueDate, dueDate, reference: extra.reference ?? d.reference, voidedAt: to === "VOID" ? new Date() : null } });
      if (moved.count !== 1) throw new CoreError("This document just changed. Reload and try again.");
    });
    if (to === "CANCELLED" && d.status === "PENDING_APPROVAL") { /* approval is closed by afterDecision guard (status no longer pending) */ }
    await audit(actor.id, `FINANCE_DOC_${to}`, "FinanceDocument", id, { from: d.status });
  });
}

export async function cancelPendingApproval(actor: FActor, id: string) {
  const d = await loadDoc(id);
  if (d.status !== "PENDING_APPROVAL") throw new CoreError("Nothing is waiting for approval.");
  const open = await prisma.approvalRequest.findMany({ where: { documentType: d.type, documentId: id, status: "PENDING" }, select: { id: true } });
  for (const a of open) await cancelApproval({ id: actor.id, role: actor.role }, a.id).catch(() => {});
  await prisma.financeDocument.update({ where: { id }, data: { status: "DRAFT" } });
  await audit(actor.id, "FINANCE_APPROVAL_WITHDRAWN", "FinanceDocument", id);
}

// ---- Conversions ------------------------------------------------------------------------------------------
const copyLines = (lines: { description: string; quantity: unknown; unitPrice: unknown; sourceItemId: string | null }[]): LineInput[] =>
  lines.map((l) => ({ description: l.description, quantity: num(l.quantity), unitPrice: num(l.unitPrice), sourceItemId: l.sourceItemId }));

export async function quotationToBookingOrder(actor: FActor, quotationId: string, clientReference: string) {
  const q = await loadDoc(quotationId);
  if (q.type !== "QUOTATION" || q.status !== "ACCEPTED") throw new CoreError("Only an accepted quotation can become a booking order.");
  if (await prisma.financeDocument.findFirst({ where: { parentId: q.id, type: "BOOKING_ORDER", status: { not: "CANCELLED" } }, select: { id: true } })) throw new CoreError("A booking order already exists for this quotation.");
  const bo = await createDocument(actor, { type: "BOOKING_ORDER", clientId: q.clientId, campaignId: q.campaignId, mediaPlanId: q.mediaPlanId, mediaPlanVersionId: q.mediaPlanVersionId, parentId: q.id, reference: clientReference, taxRatePct: num(q.taxRatePct), notes: q.notes, lines: copyLines(q.lines) });
  return bo;
}

// Bills the client for all of a booking order, or a percentage of it (stage billing). The invoiced total can never exceed the order.
export async function orderToInvoice(actor: FActor, orderId: string, mode: { percent?: number } = {}) {
  return wrap(async () => {
    const o = await loadDoc(orderId);
    if (o.type !== "BOOKING_ORDER" || o.status !== "CONFIRMED") throw new CoreError("Only a confirmed booking order can be invoiced.");
    const pct = mode.percent ?? 100;
    if (!(pct > 0 && pct <= 100)) throw new CoreError("The percentage must be above 0 and at most 100.");
    const existing = await prisma.financeDocument.findMany({ where: { parentId: o.id, type: "INVOICE", status: { not: "VOID" } }, select: { subtotal: true } });
    const done = existing.reduce((a, e) => a + minor(e.subtotal), 0);
    const cap = minor(o.subtotal);
    const lines: LineInput[] = pct === 100 && done === 0 ? copyLines(o.lines) : [{ description: `${pct}% of booking order ${o.code}${o.reference ? ` (${o.reference})` : ""}`, quantity: 1, unitPrice: fromMinor(Math.round((cap * pct) / 100)) }];
    const add = pct === 100 && done === 0 ? cap : Math.round((cap * pct) / 100);
    if (done + add > cap) throw new CoreError(`That would invoice more than the order. Already invoiced ${fromMinor(done).toFixed(2)} of ${fromMinor(cap).toFixed(2)}.`);
    const inv = await createDocument(actor, { type: "INVOICE", clientId: o.clientId, campaignId: o.campaignId, mediaPlanId: o.mediaPlanId, mediaPlanVersionId: o.mediaPlanVersionId, parentId: o.id, reference: o.reference, taxRatePct: num(o.taxRatePct), lines });
    return inv;
  });
}

export async function orderPurchaseToBill(actor: FActor, poId: string, supplierInvoiceNo: string, mode: { percent?: number } = {}) {
  return wrap(async () => {
    const po = await loadDoc(poId);
    if (po.type !== "PURCHASE_ORDER" || (po.status !== "APPROVED" && po.status !== "SENT")) throw new CoreError("Only an approved purchase order can be billed.");
    if (!supplierInvoiceNo.trim()) throw new CoreError("Enter the supplier's invoice number.");
    const pct = mode.percent ?? 100;
    if (!(pct > 0 && pct <= 100)) throw new CoreError("The percentage must be above 0 and at most 100.");
    const existing = await prisma.financeDocument.findMany({ where: { parentId: po.id, type: "BILL", status: { not: "VOID" } }, select: { subtotal: true } });
    const done = existing.reduce((a, e) => a + minor(e.subtotal), 0), cap = minor(po.subtotal);
    const whole = pct === 100 && done === 0;
    const add = whole ? cap : Math.round((cap * pct) / 100);
    if (done + add > cap) throw new CoreError(`That would bill more than the purchase order. Already billed ${fromMinor(done).toFixed(2)} of ${fromMinor(cap).toFixed(2)}.`);
    const lines: LineInput[] = whole ? copyLines(po.lines) : [{ description: `${pct}% of purchase order ${po.code}`, quantity: 1, unitPrice: fromMinor(add) }];
    return createDocument(actor, { type: "BILL", supplierId: po.supplierId, campaignId: po.campaignId, mediaPlanId: po.mediaPlanId, mediaPlanVersionId: po.mediaPlanVersionId, parentId: po.id, reference: supplierInvoiceNo, taxRatePct: num(po.taxRatePct), lines });
  });
}

// ---- From a media plan ------------------------------------------------------------------------------------
const PLAN_OK = ["CLIENT_SHARED", "APPROVED", "BOOKED", "COMPLETED"];

async function latestVersion(planId: string) {
  const plan = await prisma.mediaPlan.findUnique({ where: { id: planId }, include: { versions: { orderBy: { versionNumber: "desc" }, take: 1, include: { items: { orderBy: { sortOrder: "asc" }, include: { asset: { include: { supplier: true } } } } } } } });
  if (!plan || plan.versions.length === 0) throw new CoreError("That media plan has no version yet.");
  if (!PLAN_OK.includes(plan.status)) throw new CoreError("Share the plan with the client or approve it before preparing finance documents.");
  return { plan, version: plan.versions[0] };
}
const d10 = (d: Date) => d.toISOString().slice(0, 10);

// Quotation lines = what the client pays (Net to Client) per placement, plus each online section. A plan with a cost
// that is still TBD/POA is refused: a pending cost is never turned into zero.
export async function quotationFromPlan(actor: FActor, planId: string) {
  return wrap(async () => {
    const { plan, version } = await latestVersion(planId);
    const pending = version.items.filter((i) => i.excludesPendingCost || i.lineTotal == null);
    if (pending.length) throw new CoreError(`${pending.length} placement(s) still have a pending (TBD/POA) cost: ${pending.slice(0, 3).map((p) => p.asset.assetName).join(", ")}. Resolve them in the plan first.`);
    const lines: LineInput[] = version.items.map((i) => ({ description: `${i.asset.assetName}${i.asset.locationName ? `, ${i.asset.locationName}` : ""} (${d10(i.startDate)} to ${d10(i.endDate)})`, quantity: 1, unitPrice: num(i.lineTotal), sourceItemId: i.id }));
    if (plan.planType !== "OFFLINE" && version.onlineData) {
      const online = sanitizeOnlineData(version.onlineData);
      const calc = calcOnline(online, plan.campaignStart, plan.campaignEnd);
      online.sections.forEach((sec, idx) => { if (calc[idx].qar > 0) lines.push({ description: `Online: ${sec.name || "section"}`, quantity: 1, unitPrice: Math.round(calc[idx].qar * 100) / 100, sourceItemId: `online:${sec.id}` }); });
    }
    if (lines.length === 0) throw new CoreError("The plan has nothing to charge yet.");
    const dup = await prisma.financeDocument.findFirst({ where: { mediaPlanId: planId, mediaPlanVersionId: version.id, type: "QUOTATION", status: { notIn: ["CANCELLED", "REJECTED"] } }, select: { code: true } });
    if (dup) throw new CoreError(`${dup.code} already quotes this plan version.`);
    return createDocument(actor, { type: "QUOTATION", clientId: plan.clientId, campaignId: plan.campaignRefId, mediaPlanId: plan.id, mediaPlanVersionId: version.id, validUntil: addDays(today(), 30), notes: `From media plan ${plan.planCode}, ${version.label}.`, lines });
  });
}

// One draft purchase order per supplier from the placements' Net to Media. Online platform buys have no recorded cost
// in the plan, so they are not included. Returns what was created and what was skipped, with reasons.
export async function purchaseOrdersFromPlan(actor: FActor, planId: string) {
  return wrap(async () => {
    const { plan, version } = await latestVersion(planId);
    const missing = version.items.filter((i) => i.netMedia == null);
    if (missing.length) throw new CoreError(`${missing.length} placement(s) have no cost to the supplier recorded (${missing.slice(0, 3).map((p) => p.asset.assetName).join(", ")}). Resolve them in the plan first.`);
    const by = new Map<string, { name: string; items: typeof version.items }>();
    for (const i of version.items) {
      const sid = i.buyingEntityId ?? i.asset.supplierId;
      const g = by.get(sid) ?? { name: i.asset.supplier.name, items: [] as typeof version.items }; g.items.push(i); by.set(sid, g);
    }
    const created: { id: string; code: string | null; supplier: string }[] = [], skipped: string[] = [];
    for (const [supplierId, g] of by) {
      const dup = await prisma.financeDocument.findFirst({ where: { mediaPlanId: planId, mediaPlanVersionId: version.id, supplierId, type: "PURCHASE_ORDER", status: { notIn: ["CANCELLED", "REJECTED"] } }, select: { code: true } });
      if (dup) { skipped.push(`${g.name}: ${dup.code} already exists`); continue; }
      const lines: LineInput[] = g.items.map((i) => ({ description: `${i.asset.assetName}${i.asset.locationName ? `, ${i.asset.locationName}` : ""} (${d10(i.startDate)} to ${d10(i.endDate)})`, quantity: 1, unitPrice: num(i.netMedia), sourceItemId: i.id }));
      const po = await createDocument(actor, { type: "PURCHASE_ORDER", supplierId, campaignId: plan.campaignRefId, mediaPlanId: plan.id, mediaPlanVersionId: version.id, notes: `From media plan ${plan.planCode}, ${version.label}.`, lines });
      created.push({ id: po.id, code: po.code, supplier: g.name });
    }
    return { created, skipped };
  });
}

// ---- Payments ---------------------------------------------------------------------------------------------
export type PaymentInput = { direction: "IN" | "OUT"; partyId: string; amount: number | string; paidOn: Date; method?: string; reference?: string; notes?: string; allocations: { documentId: string; amount: number | string }[] };
const METHODS = ["BANK_TRANSFER", "CHEQUE", "CASH", "CARD", "OTHER"];

// Records money in (against client invoices) or out (against supplier bills). The whole amount must be allocated
// and no document may be over-paid. Each document is locked while it is checked, so two people paying the same
// invoice at once cannot both overpay it.
export async function recordPayment(actor: FActor, p: PaymentInput) {
  return wrap(async () => {
    if (!actor.manager) throw new CoreError("Only a finance manager can record payments.");
    const amount = toMinor(p.amount);
    if (amount <= 0) throw new CoreError("The amount must be more than zero.");
    const allocs = p.allocations.map((a) => ({ documentId: a.documentId, amount: toMinor(a.amount) })).filter((a) => a.amount !== 0);
    if (allocs.length === 0) throw new CoreError("Choose the invoices or bills this payment is for.");
    if (allocs.some((a) => a.amount < 0)) throw new CoreError("Allocations must be positive.");
    if (new Set(allocs.map((a) => a.documentId)).size !== allocs.length) throw new CoreError("The same document is listed twice.");
    const sum = allocs.reduce((a, b) => a + b.amount, 0);
    if (sum !== amount) throw new CoreError(`The allocations add up to ${fromMinor(sum).toFixed(2)} but the payment is ${fromMinor(amount).toFixed(2)}. Allocate the whole payment.`);
    if (!METHODS.includes(p.method ?? "BANK_TRANSFER")) throw new CoreError("Unknown payment method.");
    if (p.paidOn.getTime() > Date.now() + 864e5) throw new CoreError("The payment date is in the future.");
    const type: DocType = p.direction === "IN" ? "INVOICE" : "BILL";
    const payment = await prisma.$transaction(async (tx) => {
      for (const a of [...allocs].sort((x, y) => x.documentId.localeCompare(y.documentId))) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"fin:" + a.documentId}))`;
      const docs = await tx.financeDocument.findMany({ where: { id: { in: allocs.map((a) => a.documentId) } } });
      for (const a of allocs) {
        const d = docs.find((x) => x.id === a.documentId);
        if (!d) throw new CoreError("A selected document no longer exists.");
        if (d.type !== type) throw new CoreError(`${d.code ?? "A document"} is not ${p.direction === "IN" ? "an invoice" : "a bill"}.`);
        if ((p.direction === "IN" ? d.clientId : d.supplierId) !== p.partyId) throw new CoreError(`${d.code} belongs to a different ${p.direction === "IN" ? "client" : "supplier"}.`);
        if (!rules.isOpenReceivable(d.type, d.status)) throw new CoreError(`${d.code} is ${d.status.replace("_", " ").toLowerCase()} and cannot take a payment.`);
        const out = rules.outstandingMinor(minor(d.total), minor(d.paidAmount));
        if (a.amount > out) throw new CoreError(`${d.code} only has ${fromMinor(out).toFixed(2)} outstanding.`);
      }
      const code = await nextNumber(tx as never, p.direction === "IN" ? "RCT" : "PAY", p.direction === "IN" ? "RCT" : "PAY");
      const pay = await tx.financePayment.create({ data: { code, direction: p.direction, clientId: p.direction === "IN" ? p.partyId : null, supplierId: p.direction === "OUT" ? p.partyId : null, amount: fromMinor(amount), paidOn: p.paidOn, method: p.method ?? "BANK_TRANSFER", reference: p.reference?.trim() || null, notes: p.notes?.trim() || null, createdById: actor.id } });
      for (const a of allocs) {
        const d = docs.find((x) => x.id === a.documentId)!;
        await tx.financeAllocation.create({ data: { paymentId: pay.id, documentId: d.id, amount: fromMinor(a.amount) } });
        const paid = minor(d.paidAmount) + a.amount;
        await tx.financeDocument.update({ where: { id: d.id }, data: { paidAmount: fromMinor(paid), status: rules.statusAfterPayment(minor(d.total), paid, d.status) } });
      }
      return pay;
    });
    await audit(actor.id, "FINANCE_PAYMENT_RECORDED", "FinancePayment", payment.id, { code: payment.code, direction: p.direction, amount: fromMinor(amount) });
    return payment;
  });
}

export async function voidPayment(actor: FActor, paymentId: string) {
  return wrap(async () => {
    if (!actor.manager) throw new CoreError("Only a finance manager can void payments.");
    await prisma.$transaction(async (tx) => {
      const pay = await tx.financePayment.findUnique({ where: { id: paymentId }, include: { allocations: true } });
      if (!pay) throw new CoreError("That payment no longer exists.");
      if (pay.voidedAt) throw new CoreError("That payment is already void.");
      for (const a of [...pay.allocations].sort((x, y) => x.documentId.localeCompare(y.documentId))) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"fin:" + a.documentId}))`;
      for (const a of pay.allocations) {
        const d = await tx.financeDocument.findUniqueOrThrow({ where: { id: a.documentId } });
        const paid = Math.max(0, minor(d.paidAmount) - minor(a.amount));
        const reopened = d.type === "BILL" ? "APPROVED" : "ISSUED";
        await tx.financeDocument.update({ where: { id: d.id }, data: { paidAmount: fromMinor(paid), status: paid <= 0 ? reopened : paid >= minor(d.total) ? "PAID" : "PART_PAID" } });
      }
      await tx.financeAllocation.deleteMany({ where: { paymentId } });
      await tx.financePayment.update({ where: { id: paymentId }, data: { voidedAt: new Date() } });
    });
    await audit(actor.id, "FINANCE_PAYMENT_VOIDED", "FinancePayment", paymentId);
  });
}
