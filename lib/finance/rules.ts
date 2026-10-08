// Document statuses and who may do what (pure). Statuses are strings in the database.
export type DocType = "QUOTATION" | "BOOKING_ORDER" | "PURCHASE_ORDER" | "INVOICE" | "BILL";
export class RuleError extends Error {}

export const STATUSES: Record<DocType, string[]> = {
  QUOTATION: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "ACCEPTED", "REJECTED", "CANCELLED"],
  BOOKING_ORDER: ["DRAFT", "CONFIRMED", "CLOSED", "CANCELLED"],
  PURCHASE_ORDER: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "CLOSED", "REJECTED", "CANCELLED"],
  INVOICE: ["DRAFT", "ISSUED", "PART_PAID", "PAID", "VOID"],
  BILL: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "PART_PAID", "PAID", "VOID"],
};

// Allowed moves made by people (payments move invoices/bills to PART_PAID/PAID automatically, approvals move PENDING_APPROVAL).
const MOVES: Record<DocType, Record<string, string[]>> = {
  QUOTATION: { DRAFT: ["SENT", "CANCELLED"], APPROVED: ["SENT", "CANCELLED"], SENT: ["ACCEPTED", "REJECTED", "CANCELLED"] },
  BOOKING_ORDER: { DRAFT: ["CONFIRMED", "CANCELLED"], CONFIRMED: ["CLOSED", "CANCELLED"] },
  PURCHASE_ORDER: { DRAFT: ["CANCELLED"], APPROVED: ["SENT", "CANCELLED"], SENT: ["CLOSED", "CANCELLED"] },
  INVOICE: { DRAFT: ["ISSUED"], ISSUED: ["VOID"], PART_PAID: [], PAID: [] },
  BILL: { DRAFT: ["VOID"], APPROVED: ["VOID"] },
};
export function canMove(type: DocType, from: string, to: string) { return (MOVES[type][from] ?? []).includes(to); }
export function nextMoves(type: DocType, from: string) { return MOVES[type][from] ?? []; }

// Documents that go through the shared approval engine before they can be sent / paid.
export const APPROVAL_TYPE: Partial<Record<DocType, string>> = { QUOTATION: "QUOTATION", PURCHASE_ORDER: "PURCHASE_ORDER", BILL: "BILL" };
export const needsApproval = (type: DocType, hasTemplate: boolean) => hasTemplate && type in APPROVAL_TYPE;

export const isEditable = (status: string) => status === "DRAFT";
export const isOpenReceivable = (type: DocType, status: string) => (type === "INVOICE" && (status === "ISSUED" || status === "PART_PAID")) || (type === "BILL" && (status === "APPROVED" || status === "PART_PAID"));

// Invoices are issued, bills accepted for payment, only with something to charge.
export function checkIssuable(type: DocType, d: { total: number; lines: number; clientId?: string | null; supplierId?: string | null; dueDate?: Date | null; issueDate?: Date | null }) {
  if (d.lines === 0) throw new RuleError("Add at least one line.");
  if (d.total <= 0) throw new RuleError("The total must be more than zero.");
  if ((type === "INVOICE" || type === "QUOTATION" || type === "BOOKING_ORDER") && !d.clientId) throw new RuleError("Choose a client.");
  if ((type === "PURCHASE_ORDER" || type === "BILL") && !d.supplierId) throw new RuleError("Choose a supplier.");
  if ((type === "INVOICE" || type === "BILL") && (!d.issueDate || !d.dueDate)) throw new RuleError("Set the issue date and the due date.");
  if (d.issueDate && d.dueDate && d.dueDate < d.issueDate) throw new RuleError("The due date is before the issue date.");
}

export const outstandingMinor = (totalMinor: number, paidMinor: number) => Math.max(0, totalMinor - paidMinor);
export function statusAfterPayment(totalMinor: number, paidMinor: number, current: string): string {
  if (paidMinor <= 0) return current === "PART_PAID" || current === "PAID" ? (current === "PAID" ? "ISSUED" : "ISSUED") : current;
  return paidMinor >= totalMinor ? "PAID" : "PART_PAID";
}
export const isOverdue = (dueDate: Date | null, outstanding: number, today = new Date()) => !!dueDate && outstanding > 0 && dueDate.getTime() < Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
