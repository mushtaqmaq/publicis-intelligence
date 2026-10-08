"use server";

import { requireFinanceUser } from "@/lib/auth/finance";
import * as svc from "@/lib/finance/service";
import type { DocType } from "@/lib/finance/rules";
import { withMessage } from "@/lib/core/formErrors";
import { CoreError } from "@/lib/core/service";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const dateOf = (f: FormData, k: string) => (str(f, k) ? new Date(str(f, k) + "T00:00:00Z") : null);
const TYPES: DocType[] = ["QUOTATION", "BOOKING_ORDER", "PURCHASE_ORDER", "INVOICE", "BILL"];

function parseDoc(f: FormData) {
  const lines: svc.LineInput[] = [];
  for (let i = 0; i < 60; i++) {
    const desc = str(f, `desc${i}`), price = str(f, `price${i}`);
    if (!desc && !price) continue;
    const q = str(f, `qty${i}`);
    lines.push({ description: desc, quantity: q === "" ? 1 : Number(q), unitPrice: price === "" ? 0 : price });
  }
  const tax = str(f, "taxRatePct");
  return { clientId: str(f, "clientId") || null, supplierId: str(f, "supplierId") || null, campaignId: str(f, "campaignId") || null, reference: str(f, "reference") || null, issueDate: dateOf(f, "issueDate"), dueDate: dateOf(f, "dueDate"), validUntil: dateOf(f, "validUntil"), taxRatePct: tax === "" ? 0 : Number(tax), notes: str(f, "notes") || null, lines };
}

export async function createDocumentAction(formData: FormData) {
  const { actor } = await requireFinanceUser();
  const type = str(formData, "type") as DocType;
  await withMessage(`/finance/documents/new?type=${type}`, async () => {
    if (!TYPES.includes(type)) throw new CoreError("Unknown document type.");
    const doc = await svc.createDocument(actor, { type, ...parseDoc(formData) });
    return `/finance/documents/${doc.id}`;
  });
}

export async function updateDraftAction(formData: FormData) {
  const { actor } = await requireFinanceUser();
  const id = str(formData, "id");
  await withMessage(`/finance/documents/${id}`, async () => { await svc.updateDraft(actor, id, parseDoc(formData)); }, "Saved");
}

export async function submitAction(formData: FormData) {
  const { actor } = await requireFinanceUser(); const id = str(formData, "id");
  await withMessage(`/finance/documents/${id}`, async () => { await svc.submitForApproval(actor, id); }, "Submitted");
}
export async function withdrawAction(formData: FormData) {
  const { actor } = await requireFinanceUser(); const id = str(formData, "id");
  await withMessage(`/finance/documents/${id}`, async () => { await svc.cancelPendingApproval(actor, id); }, "Approval withdrawn");
}
export async function moveAction(formData: FormData) {
  const { actor } = await requireFinanceUser(); const id = str(formData, "id");
  await withMessage(`/finance/documents/${id}`, async () => { await svc.move(actor, id, str(formData, "to"), { reference: str(formData, "reference") || undefined, issueDate: dateOf(formData, "issueDate") ?? undefined, dueDate: dateOf(formData, "dueDate") ?? undefined }); }, "Updated");
}
export async function toBookingOrderAction(formData: FormData) {
  const { actor } = await requireFinanceUser(); const id = str(formData, "id");
  await withMessage(`/finance/documents/${id}`, async () => { const bo = await svc.quotationToBookingOrder(actor, id, str(formData, "reference")); return `/finance/documents/${bo.id}`; });
}
export async function toInvoiceAction(formData: FormData) {
  const { actor } = await requireFinanceUser(); const id = str(formData, "id");
  await withMessage(`/finance/documents/${id}`, async () => { const pct = str(formData, "percent"); const inv = await svc.orderToInvoice(actor, id, pct ? { percent: Number(pct) } : {}); return `/finance/documents/${inv.id}`; });
}
export async function toBillAction(formData: FormData) {
  const { actor } = await requireFinanceUser(); const id = str(formData, "id");
  await withMessage(`/finance/documents/${id}`, async () => { const pct = str(formData, "percent"); const b = await svc.orderPurchaseToBill(actor, id, str(formData, "reference"), pct ? { percent: Number(pct) } : {}); return `/finance/documents/${b.id}`; });
}

export async function fromPlanAction(formData: FormData) {
  const { actor } = await requireFinanceUser();
  const planId = str(formData, "planId"), what = str(formData, "what");
  await withMessage("/finance/plans", async () => {
    if (what === "quotation") { const q = await svc.quotationFromPlan(actor, planId); return `/finance/documents/${q.id}`; }
    const r = await svc.purchaseOrdersFromPlan(actor, planId);
    return `/finance/documents?type=PURCHASE_ORDER&ok=${encodeURIComponent(`Created ${r.created.length} purchase order(s)${r.skipped.length ? `. Skipped: ${r.skipped.join("; ")}` : ""}`)}`;
  });
}

export async function recordPaymentAction(formData: FormData) {
  const { actor } = await requireFinanceUser();
  const direction = str(formData, "direction") === "OUT" ? "OUT" : "IN";
  const partyId = str(formData, "partyId");
  await withMessage(`/finance/payments?direction=${direction}&party=${partyId}`, async () => {
    const allocations: { documentId: string; amount: string }[] = [];
    for (const [k, v] of formData.entries()) if (k.startsWith("alloc_") && String(v).trim()) allocations.push({ documentId: k.slice(6), amount: String(v) });
    const paidOn = dateOf(formData, "paidOn");
    if (!paidOn) throw new CoreError("Enter the payment date.");
    await svc.recordPayment(actor, { direction, partyId, amount: str(formData, "amount"), paidOn, method: str(formData, "method") || "BANK_TRANSFER", reference: str(formData, "reference"), notes: str(formData, "notes"), allocations });
    return `/finance/payments?ok=${encodeURIComponent("Payment recorded")}`;
  });
}
export async function voidPaymentAction(formData: FormData) {
  const { actor } = await requireFinanceUser();
  await withMessage("/finance/payments", async () => { await svc.voidPayment(actor, str(formData, "id")); }, "Payment voided");
}
