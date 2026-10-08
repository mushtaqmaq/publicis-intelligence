import { requireMediaUser } from "@/lib/auth/modules";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { updateAssetPricingMethodAction, updateSupplierDefaultDiscountAction } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const CALCULATION_METHODS = [
  "FIXED",
  "PRO_RATA",
  "DAILY",
  "PER_FACE_DAILY",
  "PER_FACE",
  "PER_CIRCUIT",
  "PER_SPOT",
  "PER_INSERTION",
  "PER_MESSAGE",
  "PER_SCREEN",
  "PER_NETWORK",
  "PER_POLE",
  "MONTHLY",
  "CUSTOM",
] as const;

interface SearchParams {
  q?: string;
  supplier?: string;
  page?: string;
}

export default async function PricingRulesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireMediaUser("settings");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const where: Prisma.AssetWhereInput = {};
  if (params.supplier) where.supplierId = params.supplier;
  if (params.q) {
    where.OR = [
      { assetName: { contains: params.q, mode: "insensitive" } },
      { assetCode: { contains: params.q, mode: "insensitive" } },
    ];
  }

  const [suppliers, total, assets] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, defaultDiscountPct: true, mediaChannel: true },
    }),
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      include: { supplier: { select: { name: true } } },
      orderBy: [{ supplier: { name: "asc" } }, { assetName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildHref = (overrides: Partial<SearchParams>) => {
    const merged = { ...params, ...overrides };
    const qs = new URLSearchParams();
    if (merged.q) qs.set("q", merged.q);
    if (merged.supplier) qs.set("supplier", merged.supplier);
    if (merged.page) qs.set("page", merged.page);
    const s = qs.toString();
    return s ? `/media/settings/pricing-rules?${s}` : "/media/settings/pricing-rules";
  };
  const returnTo = buildHref({ page: String(page) });

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="Pricing Rules"
        subtitle={
          <>
            Per-supplier default discount, and per-asset pricing-calculation-method overrides (how a line
            item&apos;s cost is derived — pro-rated by day, a fixed package, a per-spot/insertion/screen unit
            price, etc.).
          </>
        }
      />

      <section className="mt-6">
        <h2 className="text-sm font-medium text-foreground mb-3">Default discount by supplier</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
              <th className="py-2 pr-4 font-medium">Supplier</th>
              <th className="py-2 pr-4 font-medium">Channel</th>
              <th className="py-2 pr-4 font-medium">Default discount %</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b border-border">
                <td className="py-2 pr-4 text-foreground">{s.name}</td>
                <td className="py-2 pr-4 text-muted text-xs">{s.mediaChannel}</td>
                <td className="py-2 pr-4">
                  <form action={updateSupplierDefaultDiscountAction} className="inline-flex items-center gap-1.5">
                    <input type="hidden" name="supplierId" value={s.id} />
                    <input
                      type="number"
                      step="0.01"
                      name="defaultDiscountPct"
                      defaultValue={s.defaultDiscountPct ? Number(s.defaultDiscountPct) * 100 : ""}
                      placeholder="0"
                      className="text-xs rounded border border-border bg-background px-1.5 py-0.5 w-20"
                    />
                    <button type="submit" className="text-xs text-accent underline">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-foreground mb-3">Per-asset calculation method</h2>

        <form className="flex flex-wrap items-center gap-3" action="/media/settings/pricing-rules">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search asset name or code…"
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm w-64"
          />
          <select name="supplier" defaultValue={params.supplier ?? ""} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-sm font-medium">
            Filter
          </button>
        </form>

        <p className="text-xs text-muted mt-3">{total.toLocaleString()} assets</p>

        <table className="w-full text-sm border-collapse mt-2">
          <thead>
            <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
              <th className="py-2 pr-4 font-medium">Asset</th>
              <th className="py-2 pr-4 font-medium">Supplier</th>
              <th className="py-2 pr-4 font-medium">Calculation method</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id} className="border-b border-border">
                <td className="py-2 pr-4">
                  <div className="text-foreground">{a.assetName}</div>
                  <div className="text-xs text-muted font-mono">{a.assetCode}</div>
                </td>
                <td className="py-2 pr-4 text-muted">{a.supplier.name}</td>
                <td className="py-2 pr-4">
                  <form action={updateAssetPricingMethodAction} className="inline-flex items-center gap-1.5">
                    <input type="hidden" name="assetId" value={a.id} />
                    <input type="hidden" name="returnTo" value={returnTo} />
                    <select
                      name="pricingCalculationMethod"
                      defaultValue={a.pricingCalculationMethod}
                      className="text-xs rounded border border-border bg-background px-1.5 py-0.5"
                    >
                      {CALCULATION_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs text-accent underline">
                      Save
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {assets.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-muted">
                  No assets match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {pageCount > 1 && (
          <div className="flex items-center gap-3 mt-4 text-sm">
            <span className="text-muted">
              Page {page} of {pageCount}
            </span>
            {page > 1 && (
              <a href={buildHref({ page: String(page - 1) })} className="text-accent underline">
                Previous
              </a>
            )}
            {page < pageCount && (
              <a href={buildHref({ page: String(page + 1) })} className="text-accent underline">
                Next
              </a>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
