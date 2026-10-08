import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";
import { hasPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { upsertRetainerFeeAction, deleteRetainerFeeAction } from "./actions";

export const dynamic = "force-dynamic";

const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function RetainerFeesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireMediaUser("settings");
  if (!(await hasPermission(user, "dashboard.revenue.view"))) notFound();
  const { error } = await searchParams;

  const [fees, clients] = await Promise.all([
    prisma.retainerFee.findMany({
      include: { client: { select: { name: true } } },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    prisma.client.findMany({ where: { departments: { has: "media" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader
        eyebrow="Settings"
        title="Retainer Fees"
        subtitle="Your real, recurring retainer invoices — logged per client per month as they actually happen. The Admin dashboard's Revenue figure is Agency Fee + IR + these retainer fees, never the gross client billing total."
      />

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">{error}</div>}

      <div className="mt-6">
        <h2 className="text-sm font-medium text-foreground mb-3">Log a retainer fee</h2>
        <form action={upsertRetainerFeeAction} className="grid grid-cols-2 md:grid-cols-6 gap-3 bg-surface border border-border rounded-lg p-5">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Client</label>
            <select name="clientId" required className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Year</label>
            <input type="number" name="year" defaultValue={currentYear} required className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Month</label>
            <select name="month" defaultValue={currentMonth} required className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
              {MONTH_LABEL.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Amount</label>
            <input type="number" step="0.01" name="amount" required className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Currency</label>
            <select name="currency" defaultValue="QAR" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
              <option value="QAR">QAR</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Notes (optional)</label>
            <input type="text" name="notes" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          </div>
          <button type="submit" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium col-span-2 md:col-span-1">
            Save
          </button>
        </form>
        <p className="text-xs text-muted mt-2">Saving again for the same client/year/month updates that entry — it never creates a duplicate.</p>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-medium text-foreground mb-3">Logged retainer fees</h2>
        {fees.length === 0 ? (
          <p className="text-sm text-muted">No retainer fees logged yet.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
                <th className="py-2 pr-4 font-medium">Client</th>
                <th className="py-2 pr-4 font-medium">Period</th>
                <th className="py-2 pr-4 font-medium text-right">Amount</th>
                <th className="py-2 pr-4 font-medium">Notes</th>
                <th className="py-2 pr-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {fees.map((f) => (
                <tr key={f.id} className="border-b border-border last:border-0">
                  <td className="py-2 pr-4 text-foreground">{f.client.name}</td>
                  <td className="py-2 pr-4 text-muted">
                    {MONTH_LABEL[f.month - 1]} {f.year}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{f.currency} {Number(f.amount).toLocaleString()}</td>
                  <td className="py-2 pr-4 text-muted">{f.notes ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <form action={deleteRetainerFeeAction}>
                      <input type="hidden" name="id" value={f.id} />
                      <button type="submit" className="text-xs text-[var(--danger)] underline">
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
