import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";
import { hasPermission } from "@/lib/auth/permissions";
import { createAvrSchemeAction, importAvrExcelAction } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

const SLAB_ROWS = 6;

export default async function AvrSchemesPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const user = await requireMediaUser("settings");
  if (!(await hasPermission(user, "dashboard.avr.view"))) notFound();
  const { error, notice } = await searchParams;

  const [schemes, suppliers] = await Promise.all([
    prisma.avrScheme.findMany({
      include: { supplier: { select: { id: true, name: true } }, slabs: { select: { id: true } } },
      orderBy: { supplier: { name: "asc" } },
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const currentYear = new Date().getFullYear();

  const bySupplier = new Map<string, { supplierId: string; supplierName: string; categories: Set<string>; years: Set<number>; slabCount: number; schemeCount: number }>();
  for (const s of schemes) {
    if (!bySupplier.has(s.supplierId)) {
      bySupplier.set(s.supplierId, { supplierId: s.supplierId, supplierName: s.supplier.name, categories: new Set(), years: new Set(), slabCount: 0, schemeCount: 0 });
    }
    const entry = bySupplier.get(s.supplierId)!;
    entry.categories.add(s.category);
    entry.years.add(s.year);
    entry.slabCount += s.slabs.length;
    entry.schemeCount += 1;
  }
  const supplierCards = Array.from(bySupplier.values()).sort((a, b) => a.supplierName.localeCompare(b.supplierName));

  return (
    <div className="p-8 max-w-4xl">
      <PageHeader
        eyebrow="Settings"
        title="Supplier AVR Schemes"
        subtitle={
          <>
            Each supplier&apos;s real, contracted Annual Volume Rebate slab structure, by commercial category
            (e.g. a supplier&apos;s OOH, DOOH, and Cinema inventory can each carry their own slab table). Once
            entered, the Admin dashboard&apos;s AVR Tracker computes live progress against real spend — nothing
            here is simulated.
          </>
        }
      />

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">{error}</div>}
      {notice && <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-[var(--success,#166534)]">{notice}</div>}

      <div className="mt-8">
        <h2 className="text-sm font-medium text-foreground mb-3">Upload an AVR Excel file</h2>
        <p className="text-xs text-muted mb-3">
          Upload a supplier&apos;s AVR workbook (e.g. &ldquo;AVR Elan.xlsx&rdquo;) and every category/year slab
          table it contains will be created automatically. Categories that already have a scheme for that year
          are skipped, never overwritten. Picked the wrong supplier by mistake? Open that supplier&apos;s card
          below and use Edit to reassign it — nothing is silently lost.
        </p>
        <form action={importAvrExcelAction} className="flex items-end gap-3 bg-surface border border-border rounded-lg p-5">
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Supplier</label>
            <select name="supplierId" required className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
              <option value="">Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Excel file (.xlsx)</label>
            <input
              type="file"
              name="file"
              accept=".xlsx,.xls"
              required
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm file:mr-2 file:rounded file:border-0 file:bg-accent file:text-accent-foreground file:px-2 file:py-1 file:text-xs"
            />
          </div>
          <button type="submit" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium whitespace-nowrap">
            Import
          </button>
        </form>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-medium text-foreground mb-3">Suppliers with an AVR scheme</h2>
        {supplierCards.length === 0 ? (
          <p className="text-sm text-muted">No AVR schemes entered yet — upload a file or add one manually below.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {supplierCards.map((card) => (
              <Link
                key={card.supplierId}
                href={`/media/settings/avr-schemes/${card.supplierId}`}
                className="bg-surface border border-border rounded-lg p-5 hover:border-accent transition-colors"
              >
                <h3 className="text-sm font-medium text-foreground">{card.supplierName}</h3>
                <p className="text-xs text-muted mt-1">
                  {card.schemeCount} categor{card.schemeCount === 1 ? "y" : "ies"} · {card.slabCount} slab{card.slabCount === 1 ? "" : "s"} ·{" "}
                  {Array.from(card.years).sort().join(", ")}
                </p>
                <p className="text-xs text-muted mt-2">{Array.from(card.categories).join(" · ")}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-medium text-foreground mb-3">Add a scheme manually</h2>
        <form action={createAvrSchemeAction} className="space-y-3 bg-surface border border-border rounded-lg p-5">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Supplier</label>
              <select name="supplierId" required className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
                <option value="">Select supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
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
              <input type="number" name="year" defaultValue={currentYear} required className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
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
            <p className="text-xs text-muted mt-1">
              Leave &quot;To&quot; blank for an open-ended top slab. Leave a whole row blank to skip it — order doesn&apos;t matter, slabs are sorted by
              threshold automatically.
            </p>
          </div>

          <button type="submit" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium">
            Save Scheme
          </button>
        </form>
      </div>
    </div>
  );
}
