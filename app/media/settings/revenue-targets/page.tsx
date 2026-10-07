import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";
import { hasPermission } from "@/lib/auth/permissions";
import { upsertRevenueTargetAction, deleteRevenueTargetAction } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function RevenueTargetsPage() {
  const user = await requireMediaUser();
  if (!(await hasPermission(user, "dashboard.revenue.view"))) notFound();

  const targets = await prisma.revenueTarget.findMany({ orderBy: { year: "desc" } });
  const currentYear = new Date().getFullYear();

  return (
    <div className="p-8 max-w-2xl">
      <PageHeader
        eyebrow="Settings"
        title="Revenue Targets"
        subtitle="Your real annual revenue target, by year. The Admin dashboard's Revenue Target Tracker reads directly from this — nothing is estimated until you enter it here."
      />

      <form action={upsertRevenueTargetAction} className="mt-6 flex flex-wrap items-end gap-3 bg-surface border border-border rounded-lg p-5">
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Year</label>
          <input type="number" name="year" defaultValue={currentYear} required className="w-28 rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Target Amount</label>
          <input type="number" step="0.01" name="targetAmount" required className="w-48 rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Currency</label>
          <select name="currency" defaultValue="QAR" className="w-24 rounded-md border border-border bg-background px-3 py-1.5 text-sm">
            <option value="QAR">QAR</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <button type="submit" className="rounded-md bg-accent text-accent-foreground px-4 py-1.5 text-sm font-medium">
          Save
        </button>
      </form>

      <table className="w-full text-sm border-collapse mt-6">
        <thead>
          <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
            <th className="py-2 pr-4 font-medium">Year</th>
            <th className="py-2 pr-4 font-medium text-right">Target</th>
            <th className="py-2 pr-4 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {targets.map((t) => (
            <tr key={t.id} className="border-b border-border">
              <td className="py-2 pr-4 font-medium text-foreground">{t.year}</td>
              <td className="py-2 pr-4 text-right tabular-nums">
                {t.currency} {Number(t.targetAmount).toLocaleString()}
              </td>
              <td className="py-2 pr-4 text-right">
                <form action={deleteRevenueTargetAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <button type="submit" className="text-xs text-[var(--danger)] underline">
                    Delete
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {targets.length === 0 && <p className="text-sm text-muted mt-4">No targets set yet.</p>}
    </div>
  );
}
