import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireFinanceUser } from "@/lib/auth/finance";
import * as rules from "@/lib/finance/rules";
import { toMinor } from "@/lib/finance/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { Banner, field, labelCls } from "@/components/platform/Banner";
import { DocForm } from "@/components/finance/DocForm";
import { money, label, fmtDay, card, btn, btnGhost, TYPE_ONE, TYPE_LABEL } from "@/components/finance/ui";
import { moveAction, submitAction, toBillAction, toBookingOrderAction, toInvoiceAction, updateDraftAction, withdrawAction } from "../../actions";

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { actor } = await requireFinanceUser();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const d = await prisma.financeDocument.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } }, client: true, supplier: true, campaign: { select: { id: true, code: true, name: true } }, mediaPlan: { select: { id: true, planCode: true } }, parent: { select: { id: true, code: true, type: true } }, children: { orderBy: { createdAt: "asc" }, select: { id: true, code: true, type: true, status: true, total: true } }, allocations: { include: { payment: { select: { code: true, paidOn: true, method: true, voidedAt: true } } } } } });
  if (!d) notFound();
  const type = d.type as rules.DocType;
  const [clients, suppliers, campaigns, approvals] = await Promise.all([
    rules.isEditable(d.status) ? prisma.client.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    rules.isEditable(d.status) ? prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : Promise.resolve([]),
    rules.isEditable(d.status) ? prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 300, select: { id: true, code: true, name: true } }) : Promise.resolve([]),
    prisma.approvalRequest.findMany({ where: { documentType: d.type, documentId: d.id }, orderBy: { createdAt: "desc" }, take: 3, include: { steps: { orderBy: { stepOrder: "asc" } } } }),
  ]);
  const out = toMinor(Number(d.total)) - toMinor(Number(d.paidAmount));
  const moves = rules.nextMoves(type, d.status).filter((m) => !(type === "INVOICE" && m !== "ISSUED" && m !== "VOID") );
  const hid = <input type="hidden" name="id" value={d.id} />;
  const needsApproval = ["QUOTATION", "PURCHASE_ORDER", "BILL"].includes(type);
  const party = d.client?.name ?? d.supplier?.name ?? "—";

  return (
    <div className="p-8 max-w-4xl">
      <PageHeader eyebrow={`${TYPE_ONE[type]}`} title={d.code ?? "Draft (number given when issued)"} subtitle={`${party} · ${label(d.status)} · ${money(toMinor(Number(d.total)))}`} actions={<Link href={`/finance/documents?type=${type}`} className="text-sm text-accent">All {TYPE_LABEL[type].toLowerCase()}</Link>} />
      <Banner error={sp.error} ok={sp.ok} />
      <div className="mt-4 text-sm text-muted">
        {d.campaign && <>Campaign: <Link href={`/campaigns/${d.campaign.id}`} className="text-accent">{d.campaign.code} {d.campaign.name}</Link> · </>}
        {d.mediaPlan && <>Plan: <Link href={`/media/plans/${d.mediaPlan.id}`} className="text-accent">{d.mediaPlan.planCode}</Link> · </>}
        {d.parent && <>From: <Link href={`/finance/documents/${d.parent.id}`} className="text-accent">{d.parent.code}</Link> · </>}
        {d.reference && <>Reference: {d.reference} · </>}
        Issue {fmtDay(d.issueDate)} · Due {fmtDay(d.dueDate)}{d.validUntil ? ` · Valid until ${fmtDay(d.validUntil)}` : ""}
      </div>

      {rules.isEditable(d.status) ? (
        <DocForm type={type} action={updateDraftAction} id={d.id} clients={clients} suppliers={suppliers} campaigns={campaigns.map((c) => ({ id: c.id, name: `${c.code} ${c.name}` }))} values={d} submitLabel="Save draft" />
      ) : (
        <section className={`${card} mt-6`}>
          <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted uppercase tracking-wide"><th className="py-1 font-medium">Description</th><th className="py-1 font-medium text-right">Qty</th><th className="py-1 font-medium text-right">Unit price</th><th className="py-1 font-medium text-right">Amount</th></tr></thead>
            <tbody>{d.lines.map((l) => <tr key={l.id} className="border-t border-border"><td className="py-1.5">{l.description}</td><td className="py-1.5 text-right tabular-nums">{String(l.quantity)}</td><td className="py-1.5 text-right tabular-nums">{money(toMinor(Number(l.unitPrice)))}</td><td className="py-1.5 text-right tabular-nums">{money(toMinor(Number(l.amount)))}</td></tr>)}</tbody>
            <tfoot className="text-sm"><tr className="border-t border-border"><td colSpan={3} className="py-1 text-right text-muted">Subtotal</td><td className="py-1 text-right tabular-nums">{money(toMinor(Number(d.subtotal)))}</td></tr>
              <tr><td colSpan={3} className="py-1 text-right text-muted">Tax {String(d.taxRatePct)}%</td><td className="py-1 text-right tabular-nums">{money(toMinor(Number(d.taxAmount)))}</td></tr>
              <tr className="font-medium"><td colSpan={3} className="py-1 text-right">Total</td><td className="py-1 text-right tabular-nums">{money(toMinor(Number(d.total)))}</td></tr>
              {(type === "INVOICE" || type === "BILL") && <><tr><td colSpan={3} className="py-1 text-right text-muted">Paid</td><td className="py-1 text-right tabular-nums">{money(toMinor(Number(d.paidAmount)))}</td></tr><tr className="font-medium"><td colSpan={3} className="py-1 text-right">Outstanding</td><td className="py-1 text-right tabular-nums">{money(Math.max(0, out))}</td></tr></>}
            </tfoot></table>
        </section>
      )}

      <section className={`${card} mt-6`}>
        <h2 className="font-medium">Actions</h2>
        <div className="mt-3 flex flex-wrap gap-3 items-end">
          {d.status === "DRAFT" && needsApproval && <form action={submitAction}>{hid}<button className={btn}>{type === "BILL" ? "Register bill" : "Submit"} (approval if steps are set)</button></form>}
          {d.status === "PENDING_APPROVAL" && <><span className="text-sm text-muted">Waiting for approval on the Approvals page.</span><form action={withdrawAction}>{hid}<button className={btnGhost}>Withdraw</button></form></>}
          {moves.map((m) => {
            if (m === "ISSUED") return <form key={m} action={moveAction} className="flex gap-2 items-end">{hid}<input type="hidden" name="to" value="ISSUED" /><div><label className={labelCls}>Issue date</label><input type="date" name="issueDate" defaultValue={fmtDay(d.issueDate ?? new Date())} className={field} /></div><div><label className={labelCls}>Due date</label><input type="date" name="dueDate" defaultValue={d.dueDate ? fmtDay(d.dueDate) : ""} className={field} /></div><button className={btn} disabled={!actor.manager} title={actor.manager ? "" : "Finance manager only"}>Issue invoice</button></form>;
            if (m === "CONFIRMED") return <form key={m} action={moveAction} className="flex gap-2 items-end">{hid}<input type="hidden" name="to" value="CONFIRMED" /><div><label className={labelCls}>Client LPO / order reference</label><input name="reference" defaultValue={d.reference ?? ""} className={field} /></div><button className={btn}>Confirm order</button></form>;
            return <form key={m} action={moveAction}>{hid}<input type="hidden" name="to" value={m} /><button className={m === "CANCELLED" || m === "VOID" || m === "REJECTED" ? btnGhost : btn}>{label(m === "VOID" ? "Void" : m)}</button></form>;
          })}
          {type === "QUOTATION" && d.status === "ACCEPTED" && <form action={toBookingOrderAction} className="flex gap-2 items-end">{hid}<div><label className={labelCls}>Client LPO / order reference</label><input name="reference" className={field} /></div><button className={btn}>Create booking order</button></form>}
          {type === "BOOKING_ORDER" && d.status === "CONFIRMED" && <form action={toInvoiceAction} className="flex gap-2 items-end">{hid}<div><label className={labelCls}>% to invoice (blank = all)</label><input type="number" name="percent" min="0.01" max="100" step="0.01" className={field} /></div><button className={btn}>Create invoice draft</button></form>}
          {type === "PURCHASE_ORDER" && ["APPROVED", "SENT"].includes(d.status) && <form action={toBillAction} className="flex gap-2 items-end">{hid}<div><label className={labelCls}>Supplier invoice no.</label><input name="reference" required className={field} /></div><div><label className={labelCls}>% (blank = all)</label><input type="number" name="percent" min="0.01" max="100" step="0.01" className={field} /></div><button className={btn}>Create bill draft</button></form>}
          {(type === "INVOICE" || type === "BILL") && ["ISSUED", "PART_PAID", "APPROVED"].includes(d.status) && <Link href={`/finance/payments?direction=${type === "INVOICE" ? "IN" : "OUT"}&party=${d.clientId ?? d.supplierId}`} className={btnGhost}>Record payment</Link>}
        </div>
      </section>

      {approvals.length > 0 && <section className={`${card} mt-6`}><h2 className="font-medium">Approval</h2>{approvals.map((a) => <div key={a.id} className="mt-2 text-sm"><span className="font-medium">{label(a.status)}</span><ol className="text-muted">{a.steps.map((s) => <li key={s.id}>{s.stepOrder}. {s.label}: {label(s.status)}{s.comment ? ` (${s.comment})` : ""}</li>)}</ol></div>)}</section>}
      {d.children.length > 0 && <section className={`${card} mt-6`}><h2 className="font-medium">Made from this</h2><ul className="mt-2 text-sm">{d.children.map((c) => <li key={c.id}><Link href={`/finance/documents/${c.id}`} className="text-accent">{c.code ?? "Draft"}</Link> <span className="text-muted">{label(c.type)} · {label(c.status)} · {money(toMinor(Number(c.total)))}</span></li>)}</ul></section>}
      {d.allocations.length > 0 && <section className={`${card} mt-6`}><h2 className="font-medium">Payments</h2><ul className="mt-2 text-sm">{d.allocations.map((a) => <li key={a.id}>{a.payment.code} · {fmtDay(a.payment.paidOn)} · {label(a.payment.method)} · {money(toMinor(Number(a.amount)))}</li>)}</ul></section>}
    </div>
  );
}
