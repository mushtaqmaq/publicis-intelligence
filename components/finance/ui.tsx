import { fmtQar } from "@/lib/finance/money";
export const money = (m: number) => fmtQar(m);
export const label = (s: string) => s.replace(/_/g, " ").toLowerCase();
export const fmtDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "—");
export const TYPE_LABEL: Record<string, string> = { QUOTATION: "Quotations", BOOKING_ORDER: "Booking orders", PURCHASE_ORDER: "Purchase orders", INVOICE: "Invoices", BILL: "Bills" };
export const TYPE_ONE: Record<string, string> = { QUOTATION: "quotation", BOOKING_ORDER: "booking order", PURCHASE_ORDER: "purchase order", INVOICE: "invoice", BILL: "bill" };
export const card = "bg-surface border border-border rounded-lg p-5";
export const btn = "rounded-md bg-foreground px-3 py-1.5 text-sm text-white";
export const btnGhost = "rounded-md border border-border px-3 py-1.5 text-sm";
export const th = "py-2 pr-4 font-medium";
export function Stat({ title, value, sub, bad }: { title: string; value: string; sub?: string; bad?: boolean }) {
  return <div className={card}><div className="text-xs uppercase tracking-wide text-muted">{title}</div><div className={`mt-1 text-xl font-medium tabular-nums ${bad ? "text-[var(--danger)]" : ""}`}>{value}</div>{sub && <div className="text-xs text-muted mt-1">{sub}</div>}</div>;
}
