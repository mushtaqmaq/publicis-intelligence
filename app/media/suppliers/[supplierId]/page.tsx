import { requireMediaUser } from "@/lib/auth/modules";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface SupplierPageParams {
  q?: string;
  category?: string;
  format?: string;
  rate?: string; // "known" | "missing"
  page?: string;
}

function money(value: unknown, currency = "QAR") {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "object" && value !== null ? Number(value.toString()) : Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const RATE_STATUS_LABEL: Record<string, string> = {
  KNOWN: "Known",
  TBD: "TBD",
  ON_REQUEST: "On Request",
  POA: "POA",
  NOT_APPLICABLE: "N/A",
  TO_BE_CONFIRMED: "To Be Confirmed",
};

const METRIC_LABEL: Record<string, { label: string; unit: string }> = {
  daily_footfall: { label: "Daily footfall", unit: "visitors/day" },
  ots: { label: "Opportunities to see", unit: "OTS" },
};

function metricLabel(metricType: string, unit: string) {
  if (METRIC_LABEL[metricType]) return METRIC_LABEL[metricType];
  if (metricType.startsWith("impressions")) {
    const period = metricType.replace("impressions_", "").replace("impressions", "").replace(/_/g, " ").trim();
    return { label: period ? `Impressions (${period})` : "Impressions", unit };
  }
  return { label: metricType.replace(/_/g, " "), unit };
}

export default async function SupplierDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>;
  searchParams: Promise<SupplierPageParams>;
}) {
  await requireMediaUser();
  const { supplierId } = await params;
  const filters = await searchParams;

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: { _count: { select: { assets: true, rateCards: true } } },
  });
  if (!supplier) notFound();

  const [categories, allAssetsForStats, audienceRows] = await Promise.all([
    prisma.assetCategory.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.asset.findMany({
      where: { supplierId },
      select: {
        id: true,
        format: true,
        mediaCategoryId: true,
        latitude: true,
        _count: { select: { locations: true } },
        rates: { orderBy: { rateYear: "desc" }, take: 1, select: { grossRateStatus: true } },
      },
    }),
    prisma.audienceMetric.findMany({
      where: { asset: { supplierId } },
      select: { metricType: true, value: true, unit: true, assetId: true },
    }),
  ]);

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  // Stats derived from the full (unpaginated) asset set, so filters on the
  // table below never skew the numbers above it.
  const withCoordinates = allAssetsForStats.filter((a) => a.latitude !== null || a._count.locations > 0).length;
  const rateStatusCounts = new Map<string, number>();
  for (const a of allAssetsForStats) {
    const status = a.rates[0]?.grossRateStatus ?? "NO_RATE";
    rateStatusCounts.set(status, (rateStatusCounts.get(status) ?? 0) + 1);
  }
  const categoryCounts = new Map<string, number>();
  for (const a of allAssetsForStats) {
    const name = categoryNameById.get(a.mediaCategoryId) ?? "Other";
    categoryCounts.set(name, (categoryCounts.get(name) ?? 0) + 1);
  }
  const formatCounts = new Map<string, number>();
  for (const a of allAssetsForStats) {
    const key = a.format ?? "N/A (non-OOH)";
    formatCounts.set(key, (formatCounts.get(key) ?? 0) + 1);
  }

  const audienceByMetric = new Map<string, { total: number; unit: string; assetIds: Set<string> }>();
  for (const row of audienceRows) {
    const entry = audienceByMetric.get(row.metricType) ?? { total: 0, unit: row.unit ?? "", assetIds: new Set<string>() };
    entry.total += Number(row.value);
    entry.assetIds.add(row.assetId);
    audienceByMetric.set(row.metricType, entry);
  }

  const categoryList = Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1]);
  const maxCategoryCount = Math.max(1, ...categoryList.map(([, c]) => c));

  // --- Filtered, paginated asset table ---
  const page = Math.max(1, Number(filters.page ?? "1") || 1);
  const where: Prisma.AssetWhereInput = { supplierId };
  if (filters.q) {
    where.OR = [
      { assetName: { contains: filters.q, mode: "insensitive" } },
      { locationName: { contains: filters.q, mode: "insensitive" } },
      { area: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.category) where.mediaCategoryId = filters.category;
  if (filters.format === "STATIC" || filters.format === "DIGITAL") where.format = filters.format;
  if (filters.rate === "missing") {
    where.rates = { none: { grossRateStatus: "KNOWN" } };
  } else if (filters.rate === "known") {
    where.rates = { some: { grossRateStatus: "KNOWN" } };
  }

  const [total, assets] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      include: {
        mediaCategory: true,
        rates: { orderBy: { rateYear: "desc" }, take: 1 },
        images: { where: { kind: "primary" }, take: 1 },
      },
      orderBy: { assetName: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildHref = (overrides: Partial<SupplierPageParams>) => {
    const merged = { ...filters, ...overrides };
    const qs = new URLSearchParams();
    if (merged.q) qs.set("q", merged.q);
    if (merged.category) qs.set("category", merged.category);
    if (merged.format) qs.set("format", merged.format);
    if (merged.rate) qs.set("rate", merged.rate);
    if (merged.page) qs.set("page", merged.page);
    const s = qs.toString();
    return s ? `/suppliers/${supplierId}?${s}` : `/suppliers/${supplierId}`;
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-8 max-w-6xl w-full mx-auto">
        <Link href="/media/suppliers" className="text-sm text-accent underline">
          ← Back to Suppliers
        </Link>

        <div className="mt-3">
          <PageHeader
            title={supplier.name}
            subtitle={
              <>
                <span className="inline-block px-1.5 py-0.5 rounded text-xs font-medium bg-background text-foreground border border-border mr-2">
                  {supplier.mediaChannel}
                </span>
                {supplier.contactEmail ?? "No contact on file"}
                {supplier.website && (
                  <>
                    {" · "}
                    <a href={supplier.website} target="_blank" rel="noreferrer" className="text-accent underline">
                      {supplier.website}
                    </a>
                  </>
                )}
              </>
            }
            actions={
              <>
                <Link href={`/media/map?supplier=${supplier.id}`} className="text-sm text-accent underline">
                  View on Map →
                </Link>
                <Link
                  href={`/media/settings/suppliers/${supplier.id}/edit`}
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium"
                >
                  Edit Supplier
                </Link>
              </>
            }
          />
        </div>
        {supplier.notes && <p className="text-sm text-muted mt-2 italic">{supplier.notes}</p>}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
          <StatCard label="Assets" value={supplier._count.assets} />
          <StatCard label="Rate Cards" value={supplier._count.rateCards} />
          <StatCard label="Known Rates" value={rateStatusCounts.get("KNOWN") ?? 0} />
          <StatCard label="On Map" value={withCoordinates} />
          <StatCard label="Default Discount" value={supplier.defaultDiscountPct ? `${Number(supplier.defaultDiscountPct)}%` : "—"} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          <div className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-sm font-medium text-foreground mb-4">Assets by category</h2>
            {categoryList.length === 0 ? (
              <p className="text-sm text-muted">No assets yet.</p>
            ) : (
              <div className="space-y-2.5">
                {categoryList.map(([name, count]) => (
                  <div key={name} className="flex items-center gap-3 text-sm">
                    <div className="w-28 shrink-0 truncate text-muted">{name}</div>
                    <div className="flex-1 h-2 rounded bg-border overflow-hidden">
                      <div className="h-full bg-accent" style={{ width: `${(count / maxCategoryCount) * 100}%` }} />
                    </div>
                    <div className="w-10 text-right tabular-nums text-foreground">{count}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-sm font-medium text-foreground mb-4">Rate coverage</h2>
            <div className="space-y-2">
              {Array.from(rateStatusCounts.entries()).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                  <span className="text-muted">{status === "NO_RATE" ? "No rate at all" : RATE_STATUS_LABEL[status] ?? status}</span>
                  <span className="font-medium tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {supplier.mediaChannel === "OOH" && formatCounts.size > 0 && (
            <div className="bg-surface border border-border rounded-lg p-5">
              <h2 className="text-sm font-medium text-foreground mb-4">Static vs Digital</h2>
              <div className="space-y-2">
                {Array.from(formatCounts.entries()).map(([key, count]) => (
                  <div key={key} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                    <span className="text-muted">{key}</span>
                    <span className="font-medium tabular-nums">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-sm font-medium text-foreground mb-4">Audience & visibility metrics</h2>
            {audienceByMetric.size === 0 ? (
              <p className="text-sm text-muted">
                No impressions, footfall, or OTS data on file for this supplier yet. Add it from an
                asset&apos;s Edit page, or via a spreadsheet enrichment batch.
              </p>
            ) : (
              <div className="space-y-2">
                {Array.from(audienceByMetric.entries()).map(([metricType, { total: sum, unit, assetIds }]) => {
                  const { label, unit: prettyUnit } = metricLabel(metricType, unit);
                  return (
                    <div key={metricType} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
                      <span className="text-muted">
                        {label} <span className="text-xs">({assetIds.size} asset{assetIds.size === 1 ? "" : "s"})</span>
                      </span>
                      <span className="font-medium tabular-nums">
                        {sum.toLocaleString()} {prettyUnit}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">Assets ({total.toLocaleString()})</h2>
          </div>

          <form className="flex flex-wrap items-center gap-3 mt-4" action={`/suppliers/${supplierId}`}>
            <input
              type="text"
              name="q"
              defaultValue={filters.q}
              placeholder="Search asset, location, area…"
              className="w-64 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
            <select name="category" defaultValue={filters.category ?? ""} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {supplier.mediaChannel === "OOH" && (
              <select name="format" defaultValue={filters.format ?? ""} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">
                <option value="">Static + Digital</option>
                <option value="STATIC">Static</option>
                <option value="DIGITAL">Digital</option>
              </select>
            )}
            <select name="rate" defaultValue={filters.rate ?? ""} className="rounded-md border border-border bg-background px-3 py-1.5 text-sm">
              <option value="">Any rate status</option>
              <option value="known">Has a known rate</option>
              <option value="missing">Missing a known rate</option>
            </select>
            <button type="submit" className="rounded-md bg-accent text-accent-foreground px-4 py-1.5 text-sm font-medium">
              Filter
            </button>
            {(filters.q || filters.category || filters.format || filters.rate) && (
              <Link href={`/media/suppliers/${supplierId}`} className="text-sm text-muted underline">
                Clear
              </Link>
            )}
          </form>

          <table className="table-dense w-full text-sm border-collapse mt-4">
            <thead>
              <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
                <th className="py-2 pr-4 font-medium"></th>
                <th className="py-2 pr-4 font-medium">Asset</th>
                <th className="py-2 pr-4 font-medium">Category</th>
                <th className="py-2 pr-4 font-medium">Location / Area</th>
                <th className="py-2 pr-4 font-medium">Format</th>
                <th className="py-2 pr-4 font-medium">Latest rate</th>
                <th className="py-2 pr-4 font-medium">Rate year</th>
                <th className="py-2 pr-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => {
                const latestRate = asset.rates[0];
                const primaryImage = asset.images[0];
                return (
                  <tr key={asset.id} className="border-b border-border hover:bg-background">
                    <td className="py-2 pr-4">
                      <Link href={`/media/inventory/${asset.id}`}>
                        <div className="w-10 h-10 rounded-md border border-border bg-background overflow-hidden flex items-center justify-center">
                          {primaryImage ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/api/asset-images/${primaryImage.id}`} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-muted text-[10px]">—</span>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <Link href={`/media/inventory/${asset.id}`} className="font-medium text-foreground hover:underline">
                        {asset.assetName}
                      </Link>
                      <div className="text-xs text-muted">{asset.assetCode}</div>
                    </td>
                    <td className="py-2 pr-4 text-muted">{asset.mediaCategory.name}</td>
                    <td className="py-2 pr-4">
                      {asset.locationName}
                      {asset.area && asset.area !== asset.locationName ? ` · ${asset.area}` : ""}
                    </td>
                    <td className="py-2 pr-4">
                      {asset.format ? (
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${
                            asset.format === "DIGITAL" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-700 border-gray-200"
                          }`}
                        >
                          {asset.format}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">
                      {latestRate ? money(latestRate.grossRate, latestRate.currency) : "No rate"}
                      {latestRate && latestRate.durationValue && (
                        <span className="text-xs text-muted ml-1">
                          /{latestRate.durationValue.toString()} {latestRate.durationUnit}
                        </span>
                      )}
                      {latestRate && !latestRate.durationValue && latestRate.quantityBasis && (
                        <span className="text-xs text-muted ml-1">/{latestRate.quantityBasis}</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {latestRate ? (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-[var(--warning)] border border-amber-200">
                          {latestRate.rateYear} RATE
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <Link href={`/media/inventory/${asset.id}/edit`} className="text-xs text-accent underline">
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {assets.length === 0 && <div className="text-center text-muted text-sm py-16">No assets match these filters.</div>}

          <div className="flex items-center justify-between text-sm mt-4">
            <span className="text-muted">
              Page {page} of {pageCount}
            </span>
            <div className="flex gap-2">
              <Link
                href={buildHref({ page: String(Math.max(1, page - 1)) })}
                className={`px-3 py-1.5 rounded border border-border ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-background"}`}
              >
                Previous
              </Link>
              <Link
                href={buildHref({ page: String(Math.min(pageCount, page + 1)) })}
                className={`px-3 py-1.5 rounded border border-border ${page >= pageCount ? "pointer-events-none opacity-40" : "hover:bg-background"}`}
              >
                Next
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-4">
      <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold text-foreground mt-1 tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}
