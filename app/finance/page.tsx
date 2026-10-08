import Link from "next/link";
import { requireFinanceUser } from "@/lib/auth/finance";
import { dashboard } from "@/lib/finance/queries";
import { BUCKETS } from "@/lib/finance/reports";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat, money, card, TYPE_LABEL, label } from "@/components/finance/ui";

export default async function FinanceHome() {
  await requireFinanceUser();
  const d = await dashboard();
  const open: Record<string, number> = {};
  for (const c of d.counts) if (!["PAID", "VOID", "CANCELLED", "CLOSED", "REJECTED", "ACCEPTED"].includes(c.status)) open[c.type] = (open[c.type] ?? 0) + c._count._all;
  return (
    <div className="p-8 max-w-6xl">
      <PageHeader title="Finance" subtitle="QAR. Documents, receivables and payables, margin and cash flow." />
      <div className="mt-6 grid grid-cols-4 gap-4">
        <Stat title="Owed to us (AR)" value={money(d.arTotal)} sub={`${money(d.overdueAR)} overdue`} bad={d.overdueAR > 0} />
        <Stat title="We owe (AP)" value={money(d.apTotal)} />
        <Stat title="Invoiced this month" value={money(d.monthRevenue)} sub={`Billed by suppliers: ${money(d.monthCost)}`} />
        <Stat title="Cash this month" value={money(d.monthReceived - d.monthPaid)} sub={`In ${money(d.monthReceived)} · out ${money(d.monthPaid)}`} />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <section className={card}><h2 className="font-medium">Receivables ageing</h2>
          <table className="w-full text-sm mt-2"><tbody>{BUCKETS.map((b) => <tr key={b}><td className="py-1">{b}</td><td className="py-1 text-right tabular-nums">{money(d.ar[b])}</td></tr>)}</tbody></table>
          <Link href="/finance/receivables" className="text-sm text-accent">Open receivables</Link></section>
        <section className={card}><h2 className="font-medium">Payables ageing</h2>
          <table className="w-full text-sm mt-2"><tbody>{BUCKETS.map((b) => <tr key={b}><td className="py-1">{b}</td><td className="py-1 text-right tabular-nums">{money(d.ap[b])}</td></tr>)}</tbody></table>
          <Link href="/finance/payables" className="text-sm text-accent">Open payables</Link></section>
      </div>
      <section className={`${card} mt-6`}><h2 className="font-medium">Open documents</h2>
        <div className="mt-2 flex flex-wrap gap-6 text-sm">{Object.keys(TYPE_LABEL).map((t) => <Link key={t} href={`/finance/documents?type=${t}`} className="text-accent">{TYPE_LABEL[t]}: {open[t] ?? 0} open</Link>)}</div>
        <div className="mt-3 text-xs text-muted">{d.counts.filter((c) => c.status === "PENDING_APPROVAL").map((c) => `${c._count._all} ${label(c.type)} waiting for approval`).join(" · ") || "Nothing waiting for approval."}</div>
      </section>
    </div>
  );
}
