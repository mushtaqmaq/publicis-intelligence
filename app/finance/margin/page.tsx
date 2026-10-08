import Link from "next/link";
import { requireFinanceUser } from "@/lib/auth/finance";
import { marginByCampaign } from "@/lib/finance/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { money, th } from "@/components/finance/ui";

const pct = (v: number | null) => (v === null ? "—" : `${v.toFixed(1)}%`);

export default async function MarginPage() {
  await requireFinanceUser();
  const rows = await marginByCampaign();
  const sum = (k: "revenue" | "cost" | "invoiced" | "billed") => rows.reduce((a, r) => a + r[k], 0);
  return (
    <div className="p-8 max-w-6xl">
      <PageHeader title="Margin by campaign" subtitle="Actual = invoiced minus supplier bills received. Projected adds confirmed booking orders not yet invoiced and open purchase orders not yet billed. Amounts exclude tax. A cost nobody has entered is not guessed: projected margin is only as complete as the purchase orders and bills in the system." actions={<Link href="/finance/export/margin" className="text-sm text-accent">Export CSV</Link>} />
      <table className="w-full text-sm border-collapse mt-6">
        <thead><tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border"><th className={th}>Campaign</th><th className={`${th} text-right`}>Invoiced</th><th className={`${th} text-right`}>Billed</th><th className={`${th} text-right`}>Actual margin</th><th className={`${th} text-right`}>%</th><th className={`${th} text-right`}>Projected revenue</th><th className={`${th} text-right`}>Projected cost</th><th className={`${th} text-right`}>Projected margin</th><th className={`${th} text-right`}>%</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.campaignId ?? "none"} className="border-b border-border">
          <td className="py-2 pr-4 font-medium">{r.campaignId ? <Link href={`/campaigns/${r.campaignId}`} className="text-accent">{r.code} {r.name}</Link> : r.name}<div className="text-xs text-muted font-normal">{r.client}</div></td>
          <td className="py-2 pr-4 text-right tabular-nums">{money(r.invoiced)}</td><td className="py-2 pr-4 text-right tabular-nums">{money(r.billed)}</td>
          <td className={`py-2 pr-4 text-right tabular-nums ${r.actual < 0 ? "text-[var(--danger)]" : ""}`}>{money(r.actual)}</td><td className="py-2 pr-4 text-right tabular-nums">{pct(r.actualPct)}</td>
          <td className="py-2 pr-4 text-right tabular-nums">{money(r.revenue)}</td><td className="py-2 pr-4 text-right tabular-nums">{money(r.cost)}</td>
          <td className={`py-2 pr-4 text-right tabular-nums ${r.projected < 0 ? "text-[var(--danger)]" : ""}`}>{money(r.projected)}</td><td className="py-2 pr-4 text-right tabular-nums">{pct(r.projectedPct)}</td></tr>)}</tbody>
        <tfoot><tr className="font-medium"><td className="py-2 pr-4">Total</td><td className="py-2 pr-4 text-right tabular-nums">{money(sum("invoiced"))}</td><td className="py-2 pr-4 text-right tabular-nums">{money(sum("billed"))}</td><td className="py-2 pr-4 text-right tabular-nums">{money(sum("invoiced") - sum("billed"))}</td><td /><td className="py-2 pr-4 text-right tabular-nums">{money(sum("revenue"))}</td><td className="py-2 pr-4 text-right tabular-nums">{money(sum("cost"))}</td><td className="py-2 pr-4 text-right tabular-nums">{money(sum("revenue") - sum("cost"))}</td><td /></tr></tfoot>
      </table>
      {rows.length === 0 && <p className="text-sm text-muted mt-6">No issued invoices, bills or confirmed orders yet.</p>}
    </div>
  );
}
