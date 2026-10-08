import { prisma } from "@/lib/prisma";
import { requireFinanceUser } from "@/lib/auth/finance";
import { openItems } from "@/lib/finance/queries";
import { toMinor } from "@/lib/finance/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { Banner, field, labelCls } from "@/components/platform/Banner";
import { card, btn, btnGhost, money, fmtDay, label, th } from "@/components/finance/ui";
import { recordPaymentAction, voidPaymentAction } from "../actions";

export default async function Payments({ searchParams }: { searchParams: Promise<{ direction?: string; party?: string; error?: string; ok?: string }> }) {
  const { actor } = await requireFinanceUser();
  const sp = await searchParams;
  const direction = sp.direction === "OUT" ? "OUT" : "IN";
  const [clients, suppliers, recent] = await Promise.all([
    prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.financePayment.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { allocations: { include: { document: { select: { code: true } } } } } }),
  ]);
  const parties = direction === "IN" ? clients : suppliers;
  const open = sp.party ? (await openItems(direction === "IN" ? "AR" : "AP")).filter((i) => i.clientOrSupplierId === sp.party) : [];
  const names = new Map([...clients, ...suppliers].map((p) => [p.id, p.name]));
  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="Payments" subtitle="Money in against client invoices, money out against supplier bills. The whole payment must be allocated; nothing can be over-paid." />
      <Banner error={sp.error} ok={sp.ok} />
      <form className="mt-6 flex gap-2 items-end" method="get">
        <div><label className={labelCls}>Direction</label><select name="direction" defaultValue={direction} className={field}><option value="IN">Received from a client</option><option value="OUT">Paid to a supplier</option></select></div>
        <div><label className={labelCls}>{direction === "IN" ? "Client" : "Supplier"}</label><select name="party" defaultValue={sp.party ?? ""} className={field}><option value="">Choose</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <button className={btnGhost}>Show open {direction === "IN" ? "invoices" : "bills"}</button>
      </form>
      {sp.party && (
        <form action={recordPaymentAction} className={`${card} mt-4 space-y-3`}>
          <input type="hidden" name="direction" value={direction} /><input type="hidden" name="partyId" value={sp.party} />
          {open.length === 0 ? <p className="text-sm text-muted">Nothing is outstanding for {names.get(sp.party)}.</p> : <>
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted uppercase tracking-wide"><th className={th}>Document</th><th className={th}>Due</th><th className={`${th} text-right`}>Outstanding</th><th className={`${th} text-right`}>Apply (QAR)</th></tr></thead>
              <tbody>{open.map((i) => <tr key={i.id} className="border-t border-border"><td className="py-1.5">{i.code}</td><td className="py-1.5 tabular-nums">{fmtDay(i.dueDate)}</td><td className="py-1.5 text-right tabular-nums">{money(i.outstanding)}</td><td className="py-1.5 text-right"><input name={`alloc_${i.id}`} type="number" step="0.01" min="0" className={`${field} w-32 text-right`} /></td></tr>)}</tbody></table>
            <div className="grid grid-cols-5 gap-3">
              <div><label className={labelCls}>Total amount</label><input name="amount" type="number" step="0.01" min="0.01" required className={field} /></div>
              <div><label className={labelCls}>Date</label><input name="paidOn" type="date" required className={field} /></div>
              <div><label className={labelCls}>Method</label><select name="method" className={field}>{["BANK_TRANSFER", "CHEQUE", "CASH", "CARD", "OTHER"].map((m) => <option key={m} value={m}>{label(m)}</option>)}</select></div>
              <div><label className={labelCls}>Reference</label><input name="reference" maxLength={120} className={field} /></div>
              <div><label className={labelCls}>Notes</label><input name="notes" maxLength={300} className={field} /></div>
            </div>
            <button className={btn} disabled={!actor.manager}>{actor.manager ? "Record payment" : "Finance manager only"}</button></>}
        </form>
      )}
      <h2 className="mt-8 font-medium">Recent payments</h2>
      <table className="w-full text-sm border-collapse mt-2"><thead><tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border"><th className={th}>Number</th><th className={th}>Date</th><th className={th}>Party</th><th className={th}>Applied to</th><th className={`${th} text-right`}>Amount</th><th className={th} /></tr></thead>
        <tbody>{recent.map((p) => <tr key={p.id} className={`border-b border-border ${p.voidedAt ? "opacity-50 line-through" : ""}`}><td className="py-2 pr-4 tabular-nums">{p.code}</td><td className="py-2 pr-4">{fmtDay(p.paidOn)}</td><td className="py-2 pr-4">{names.get(p.clientId ?? p.supplierId ?? "") ?? "—"}</td><td className="py-2 pr-4 text-muted">{p.allocations.map((a) => a.document.code).join(", ") || "—"}</td><td className="py-2 pr-4 text-right tabular-nums">{money(toMinor(Number(p.amount)))}</td>
          <td className="py-2">{actor.manager && !p.voidedAt && <form action={voidPaymentAction}><input type="hidden" name="id" value={p.id} /><button className="text-xs text-muted underline">Void</button></form>}</td></tr>)}</tbody></table>
      {recent.length === 0 && <p className="text-sm text-muted mt-3">No payments yet.</p>}
    </div>
  );
}
