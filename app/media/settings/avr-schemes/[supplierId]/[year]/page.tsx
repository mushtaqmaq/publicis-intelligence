import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";
import { hasPermission } from "@/lib/auth/permissions";
import { createAvrSchemeAction, updateAvrSchemeAction, deleteAvrSchemeAction } from "../../actions";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

const SLAB_ROWS = 6;

export default async function SupplierAvrYearSchemesPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string; year: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const user = await requireMediaUser();
  if (!(await hasPermission(user, "dashboard.avr.view"))) notFound();

  const { supplierId, year: yearParam } = await params;
  const { error, notice } = await searchParams;
  const year = Number(yearParam);
  if (!Number.isFinite(year)) notFound();

  const [supplier, suppliers, schemes] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true } }),
    prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.avrScheme.findMany({
      where: { supplierId, year },
      include: { slabs: { orderBy: { thresholdFrom: "asc" } } },
      orderBy: { category: "asc" },
    }),
  ]);

  if (!supplier) notFound();

  return (
    <div className="p-8 max-w-3xl">
      <Link href={`/media/settings/avr-schemes/${supplierId}`} className="text-xs text-accent underline">
        ← {supplier.name} — all years
      </Link>
      <div className="mt-2">
        <PageHeader
          title={`${supplier.name} — ${year}`}
          subtitle="Each category below carries its own real, contracted slab table for this year. Use Edit to correct a scheme — including moving it to a different year or reassigning it to a different supplier if it was uploaded to the wrong one."
        />
      </div>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">{error}</div>}
      {notice && <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-[var(--success,#166534)]">{notice}</div>}

      <div className="space-y-4 mt-6">
        {schemes.map((s) => (
          <div key={s.id} className="bg-surface border border-border rounded-lg p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-foreground">{s.category}</h2>
              <div className="flex items-center gap-3">
                <form action={deleteAvrSchemeAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="text-xs text-[var(--danger)] underline">
                    Delete
                  </button>
                </form>
              </div>
            </div>
            {s.notes && <p className="text-xs text-muted mt-1">{s.notes}</p>}
            <table className="w-full text-sm border-collapse mt-3">
              <thead>
                <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
                  <th className="py-1.5 pr-3 font-medium">Spend range</th>
                  <th className="py-1.5 pr-3 font-medium text-right">Rebate %</th>
                </tr>
              </thead>
              <tbody>
                {s.slabs.map((slab) => (
                  <tr key={slab.id} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-3 tabular-nums">
                      QAR {Number(slab.thresholdFrom).toLocaleString()}
                      {slab.thresholdTo !== null ? ` – ${Number(slab.thresholdTo).toLocaleString()}` : "+"}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{(Number(slab.rebatePct) * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <details className="mt-3 group">
              <summary className="text-xs text-accent underline cursor-pointer">Edit this scheme</summary>
              <form action={updateAvrSchemeAction} className="space-y-3 mt-3 border-t border-border pt-3">
                <input type="hidden" name="id" value={s.id} />
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Supplier</label>
                    <select name="supplierId" defaultValue={supplierId} required className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
                      {suppliers.map((sup) => (
                        <option key={sup.id} value={sup.id}>
                          {sup.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Category</label>
                    <input
                      type="text"
                      name="category"
                      defaultValue={s.category}
                      required
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Year</label>
                    <input type="number" name="year" defaultValue={s.year} required className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Notes (optional)</label>
                  <input type="text" name="notes" defaultValue={s.notes ?? ""} className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Slabs (spend from → to → rebate %)</label>
                  <div className="space-y-2">
                    {Array.from({ length: SLAB_ROWS }).map((_, i) => {
                      const slab = s.slabs[i];
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            name={`slabThresholdFrom${i}`}
                            defaultValue={slab ? Number(slab.thresholdFrom) : ""}
                            placeholder="From (QAR)"
                            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                          />
                          <input
                            type="number"
                            step="0.01"
                            name={`slabThresholdTo${i}`}
                            defaultValue={slab?.thresholdTo !== null && slab?.thresholdTo !== undefined ? Number(slab.thresholdTo) : ""}
                            placeholder="To (QAR, optional)"
                            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                          />
                          <input
                            type="number"
                            step="0.01"
                            name={`slabRebatePct${i}`}
                            defaultValue={slab ? Number(slab.rebatePct) * 100 : ""}
                            placeholder="Rebate %"
                            className="w-28 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                          />
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted mt-1">
                    Leave &quot;To&quot; blank for an open-ended top slab. Saving replaces all slabs on this scheme with what&apos;s shown here — leave a
                    whole row blank to drop it.
                  </p>
                </div>
                <button type="submit" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium">
                  Save Changes
                </button>
              </form>
            </details>
          </div>
        ))}
        {schemes.length === 0 && <p className="text-sm text-muted">No AVR schemes for {supplier.name} in {year} yet.</p>}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-medium text-foreground mb-3">Add a category for {supplier.name} — {year}</h2>
        <form action={createAvrSchemeAction} className="space-y-3 bg-surface border border-border rounded-lg p-5">
          <input type="hidden" name="supplierId" value={supplierId} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Category</label>
              <input
                type="text"
                name="category"
                defaultValue="General"
                placeholder="e.g. Doha OOH"
                required
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Year</label>
              <input type="number" name="year" defaultValue={year} required className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Notes (optional)</label>
            <input type="text" name="notes" placeholder="e.g. per the 2026 contract addendum" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Slabs (spend from → to → rebate %)</label>
            <div className="space-y-2">
              {Array.from({ length: SLAB_ROWS }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    name={`slabThresholdFrom${i}`}
                    placeholder="From (QAR)"
                    className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    name={`slabThresholdTo${i}`}
                    placeholder="To (QAR, optional)"
                    className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  />
                  <input
                    type="number"
                    step="0.01"
                    name={`slabRebatePct${i}`}
                    placeholder="Rebate %"
                    className="w-28 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted mt-1">Leave &quot;To&quot; blank for an open-ended top slab.</p>
          </div>
          <button type="submit" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium">
            Save Scheme
          </button>
        </form>
      </div>
    </div>
  );
}
