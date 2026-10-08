import Link from "next/link";
import { requireFinanceUser } from "@/lib/auth/finance";
import { forecast } from "@/lib/finance/queries";
import { PageHeader } from "@/components/ui/PageHeader";
import { money, fmtDay, th } from "@/components/finance/ui";

export default async function ForecastPage() {
  await requireFinanceUser();
  const f = await forecast();
  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="Cash flow forecast" subtitle="Next 13 weeks. In: open invoices on their due date (overdue lands in week 1) plus confirmed orders not yet invoiced, expected the client's payment terms after the campaign ends. Out: open bills on their due date plus approved purchase orders not yet billed, expected 30 days after the campaign ends. Items with no date are listed separately, never guessed." actions={<Link href="/finance/export/forecast" className="text-sm text-accent">Export CSV</Link>} />
      <table className="w-full text-sm border-collapse mt-6">
        <thead><tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border"><th className={th}>Week starting</th><th className={`${th} text-right`}>In</th><th className={`${th} text-right`}>Out</th><th className={`${th} text-right`}>Net</th><th className={`${th} text-right`}>Running</th></tr></thead>
        <tbody>{f.rows.map((r) => <tr key={r.weekStart.toISOString()} className="border-b border-border"><td className="py-2 pr-4 tabular-nums">{fmtDay(r.weekStart)}</td><td className="py-2 pr-4 text-right tabular-nums">{r.in ? money(r.in) : ""}</td><td className="py-2 pr-4 text-right tabular-nums">{r.out ? money(r.out) : ""}</td><td className="py-2 pr-4 text-right tabular-nums">{r.net ? money(r.net) : ""}</td><td className={`py-2 pr-4 text-right tabular-nums ${r.cumulative < 0 ? "text-[var(--danger)]" : ""}`}>{money(r.cumulative)}</td></tr>)}</tbody>
      </table>
      <p className="mt-4 text-sm text-muted">Later than 13 weeks: in {money(f.beyond.in)}, out {money(f.beyond.out)}. No date known: in {money(f.undated.in)}, out {money(f.undated.out)}.</p>
    </div>
  );
}
