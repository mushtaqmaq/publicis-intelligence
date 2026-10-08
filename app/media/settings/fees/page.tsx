import { requireMediaUser } from "@/lib/auth/modules";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { updateAssetFeeAction } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function money(value: unknown, currency = "QAR") {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "object" && value !== null ? Number(value.toString()) : Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

interface SearchParams {
  feeType?: string;
  supplier?: string;
  page?: string;
}

export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireMediaUser("settings");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const where: Prisma.AssetFeeWhereInput = {};
  if (params.feeType) where.feeType = params.feeType;
  if (params.supplier) where.assetRate = { asset: { supplierId: params.supplier } };

  const [suppliers, feeTypeBreakdown, total, fees] = await Promise.all([
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.assetFee.groupBy({ by: ["feeType"], _count: true, _sum: { amount: true } }),
    prisma.assetFee.count({ where }),
    prisma.assetFee.findMany({
      where,
      include: {
        assetRate: {
          select: {
            currency: true,
            rateYear: true,
            asset: { select: { assetName: true, assetCode: true, supplier: { select: { name: true } } } },
          },
        },
      },
      orderBy: { id: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildHref = (overrides: Partial<SearchParams>) => {
    const merged = { ...params, ...overrides };
    const qs = new URLSearchParams();
    if (merged.feeType) qs.set("feeType", merged.feeType);
    if (merged.supplier) qs.set("supplier", merged.supplier);
    if (merged.page) qs.set("page", merged.page);
    const s = qs.toString();
    return s ? `/media/settings/fees?${s}` : "/media/settings/fees";
  };
  const returnTo = buildHref({ page: String(page) });

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        eyebrow="Settings"
        title="Fees"
        subtitle="Every production / upload / installation / service / other fee attached to a rate, across all suppliers. Correct an amount here, or clear it back to TBD."
      />

      <div className="flex flex-wrap gap-3 mt-4">
        {feeTypeBreakdown.map((f) => (
          <a
            key={f.feeType}
            href={buildHref({ feeType: f.feeType, page: "1" })}
            className={`rounded-lg border px-3 py-2 text-xs ${
              params.feeType === f.feeType ? "border-accent bg-accent/5" : "border-border bg-surface"
            }`}
          >
            <div className="font-medium text-foreground capitalize">{f.feeType}</div>
            <div className="text-muted mt-0.5">
              {f._count} · {money(f._sum.amount)}
            </div>
          </a>
        ))}
        {params.feeType && (
          <a href={buildHref({ feeType: undefined, page: "1" })} className="text-xs text-accent underline self-center">
            Clear filter
          </a>
        )}
      </div>

      <form className="flex flex-wrap items-center gap-3 mt-4" action="/media/settings/fees">
        {params.feeType && <input type="hidden" name="feeType" value={params.feeType} />}
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

      <p className="text-xs text-muted mt-3">{total.toLocaleString()} fees</p>

      <table className="w-full text-sm border-collapse mt-2">
        <thead>
          <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
            <th className="py-2 pr-4 font-medium">Asset</th>
            <th className="py-2 pr-4 font-medium">Supplier</th>
            <th className="py-2 pr-4 font-medium">Fee type</th>
            <th className="py-2 pr-4 font-medium">Per unit</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {fees.map((f) => (
            <tr key={f.id} className="border-b border-border">
              <td className="py-2 pr-4">
                <div className="text-foreground">{f.assetRate.asset.assetName}</div>
                <div className="text-xs text-muted font-mono">{f.assetRate.asset.assetCode}</div>
              </td>
              <td className="py-2 pr-4 text-muted">{f.assetRate.asset.supplier.name}</td>
              <td className="py-2 pr-4 capitalize">{f.feeType}</td>
              <td className="py-2 pr-4 text-muted text-xs">{f.perUnit ?? "—"}</td>
              <td className="py-2 pr-4">
                <span
                  className={`text-xs px-1.5 py-0.5 rounded border ${
                    f.status === "KNOWN" ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-50 text-gray-500 border-gray-200"
                  }`}
                >
                  {f.status.replace(/_/g, " ")}
                </span>
              </td>
              <td className="py-2 pr-4">
                <form action={updateAssetFeeAction} className="inline-flex items-center gap-1.5">
                  <input type="hidden" name="feeId" value={f.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <input
                    type="number"
                    step="0.01"
                    name="amount"
                    defaultValue={f.amount ? Number(f.amount) : ""}
                    placeholder="TBD"
                    className="text-xs rounded border border-border bg-background px-1.5 py-0.5 w-24"
                  />
                  <button type="submit" className="text-xs text-accent underline">
                    Save
                  </button>
                </form>
              </td>
            </tr>
          ))}
          {fees.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-muted">
                No fees match this filter.
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
    </div>
  );
}
