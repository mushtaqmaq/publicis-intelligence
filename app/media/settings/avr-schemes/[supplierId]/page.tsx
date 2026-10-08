import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMediaUser } from "@/lib/auth/modules";
import { hasPermission } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/ui/PageHeader";
import { YearJumpForm } from "./YearJumpForm";

export const dynamic = "force-dynamic";

export default async function SupplierAvrYearsPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const user = await requireMediaUser("settings");
  if (!(await hasPermission(user, "dashboard.avr.view"))) notFound();

  const { supplierId } = await params;
  const { error, notice } = await searchParams;

  const [supplier, schemes] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true } }),
    prisma.avrScheme.findMany({
      where: { supplierId },
      include: { slabs: { select: { id: true } } },
      orderBy: { year: "desc" },
    }),
  ]);

  if (!supplier) notFound();

  const currentYear = new Date().getFullYear();

  const byYear = new Map<number, { year: number; categories: Set<string>; slabCount: number; schemeCount: number }>();
  for (const s of schemes) {
    if (!byYear.has(s.year)) byYear.set(s.year, { year: s.year, categories: new Set(), slabCount: 0, schemeCount: 0 });
    const entry = byYear.get(s.year)!;
    entry.categories.add(s.category);
    entry.slabCount += s.slabs.length;
    entry.schemeCount += 1;
  }
  const yearCards = Array.from(byYear.values()).sort((a, b) => b.year - a.year);

  return (
    <div className="p-8 max-w-3xl">
      <Link href="/media/settings/avr-schemes" className="text-xs text-accent underline">
        ← All suppliers
      </Link>
      <div className="mt-2">
        <PageHeader
          title={`${supplier.name} — AVR Schemes by Year`}
          subtitle="Each year keeps its own set of category slab tables, so you can compare one year's real terms against the next. Open a year to view, edit, or add categories for it."
        />
      </div>

      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">{error}</div>}
      {notice && <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-[var(--success,#166534)]">{notice}</div>}

      <div className="grid grid-cols-2 gap-4 mt-6">
        {yearCards.map((card) => (
          <Link
            key={card.year}
            href={`/media/settings/avr-schemes/${supplierId}/${card.year}`}
            className="bg-surface border border-border rounded-lg p-5 hover:border-accent transition-colors"
          >
            <h3 className="font-serif text-2xl text-foreground">{card.year}</h3>
            <p className="text-xs text-muted mt-1">
              {card.schemeCount} categor{card.schemeCount === 1 ? "y" : "ies"} · {card.slabCount} slab{card.slabCount === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-muted mt-2">{Array.from(card.categories).join(" · ")}</p>
          </Link>
        ))}
        {yearCards.length === 0 && <p className="text-sm text-muted">No AVR schemes for {supplier.name} yet — add a year below to get started.</p>}
      </div>

      <div className="mt-8 bg-surface border border-border rounded-lg p-5">
        <h2 className="text-sm font-medium text-foreground mb-3">Jump to a year</h2>
        <p className="text-xs text-muted mb-3">Open an existing year above, or enter a new year to start adding categories for it.</p>
        <YearJumpForm supplierId={supplierId} defaultYear={currentYear} />
      </div>
    </div>
  );
}
