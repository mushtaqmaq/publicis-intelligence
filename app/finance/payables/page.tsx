import Link from "next/link";
import { requireFinanceUser } from "@/lib/auth/finance";
import { ageingReport } from "@/lib/finance/queries";
import { BUCKETS } from "@/lib/finance/reports";
import { PageHeader } from "@/components/ui/PageHeader";
import { money, fmtDay, card, th } from "@/components/finance/ui";

export default async function APPage() {
  await requireFinanceUser();
  const r = await ageingReport("AP");
  const today = Date.now();
  return (
    <div className="p-8 max-w-6xl">
      <PageHeader title="Payables" subtitle="Supplier bills that are not fully paid, by how late they are (QAR)." actions={<Link href="/finance/export/payables" className="text-sm text-accent">Export CSV</Link>} />
      <div className="mt-6 grid grid-cols-5 gap-3">{BUCKETS.map((b) => <div key={b} className={card}><div className="text-xs uppercase tracking-wide text-muted">{b}</div><div className="mt-1 tabular-nums font-medium">{money(r.total[b])}</div></div>)}</div>
      <p className="mt-3 text-sm">Total outstanding: <b className="tabular-nums">{money(r.grand)}</b></p>
      <h2 className="mt-6 font-medium">By supplier</h2>
      <table className="w-full text-sm border-collapse mt-2"><thead><tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border"><th className={th}>Supplier</th>{BUCKETS.map((b) => <th key={b} className={`${th} text-right`}>{b}</th>)}<th className={`${th} text-right`}>Total</th></tr></thead>
        <tbody>{r.byParty.map((p) => <tr key={p.party} className="border-b border-border"><td className="py-2 pr-4 font-medium">{p.party}</td>{BUCKETS.map((b) => <td key={b} className="py-2 pr-4 text-right tabular-nums">{p[b] ? money(p[b]) : ""}</td>)}<td className="py-2 pr-4 text-right tabular-nums font-medium">{money(p.sum)}</td></tr>)}</tbody></table>
      <h2 className="mt-8 font-medium">Open items</h2>
      <table className="w-full text-sm border-collapse mt-2"><thead><tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border"><th className={th}>Number</th><th className={th}>Supplier</th><th className={th}>Due</th><th className={`${th} text-right`}>Total</th><th className={`${th} text-right`}>Outstanding</th></tr></thead>
        <tbody>{r.items.map((i) => <tr key={i.id} className="border-b border-border"><td className="py-2 pr-4"><Link href={`/finance/documents/${i.id}`} className="text-accent">{i.code}</Link></td><td className="py-2 pr-4">{i.party}</td><td className={`py-2 pr-4 tabular-nums ${i.dueDate.getTime() < today && i.outstanding > 0 ? "text-[var(--danger)] font-medium" : ""}`}>{fmtDay(i.dueDate)}</td><td className="py-2 pr-4 text-right tabular-nums">{money(i.total)}</td><td className="py-2 pr-4 text-right tabular-nums">{money(i.outstanding)}</td></tr>)}</tbody></table>
      {r.items.length === 0 && <p className="text-sm text-muted mt-4">Nothing outstanding.</p>}
    </div>
  );
}
