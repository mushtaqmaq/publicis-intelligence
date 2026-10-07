import { requireMediaUser } from "@/lib/auth/modules";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { MediumSupplierSelect } from "@/components/MediumSupplierSelect";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const MEDIA_CHANNELS = ["OOH", "RADIO", "TV", "PRINT", "CINEMA", "SMS", "DIGITAL"] as const;

interface InventorySearchParams {
  q?: string;
  supplier?: string;
  format?: string;
  channel?: string;
  page?: string;
}

async function getFilterOptions() {
  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, mediaChannel: true },
  });
  return { suppliers };
}

async function getAssets(params: InventorySearchParams) {
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const where: Prisma.AssetWhereInput = {};
  if (params.q) {
    where.OR = [
      { assetName: { contains: params.q, mode: "insensitive" } },
      { locationName: { contains: params.q, mode: "insensitive" } },
      { area: { contains: params.q, mode: "insensitive" } },
    ];
  }
  if (params.supplier) where.supplierId = params.supplier;
  if (params.format === "STATIC" || params.format === "DIGITAL") where.format = params.format;
  if (params.channel && (MEDIA_CHANNELS as readonly string[]).includes(params.channel)) {
    where.supplier = { mediaChannel: params.channel as (typeof MEDIA_CHANNELS)[number] };
  }

  const [total, assets] = await Promise.all([
    prisma.asset.count({ where }),
    prisma.asset.findMany({
      where,
      include: {
        supplier: true,
        rates: { orderBy: { rateYear: "desc" }, take: 1, include: { fees: true } },
        images: { where: { kind: "primary" }, take: 1 },
        _count: { select: { packageComponents: true } },
      },
      orderBy: [{ supplier: { name: "asc" } }, { assetName: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return { total, assets, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

function money(value: unknown, currency = "QAR") {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "object" && value !== null ? Number(value.toString()) : Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<InventorySearchParams>;
}) {
  await requireMediaUser();
  const params = await searchParams;
  const [{ suppliers }, { total, assets, page, pageCount }] = await Promise.all([
    getFilterOptions(),
    getAssets(params),
  ]);

  const buildHref = (overrides: Partial<InventorySearchParams>) => {
    const merged = { ...params, ...overrides };
    const qs = new URLSearchParams();
    if (merged.q) qs.set("q", merged.q);
    if (merged.supplier) qs.set("supplier", merged.supplier);
    if (merged.format) qs.set("format", merged.format);
    if (merged.channel) qs.set("channel", merged.channel);
    if (merged.page) qs.set("page", merged.page);
    const s = qs.toString();
    return s ? `/inventory?${s}` : "/inventory";
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-8 pb-4 border-b border-border bg-surface">
        <PageHeader
          title="Inventory"
          subtitle={`${total.toLocaleString()} assets`}
          actions={
            <Link href="/media/inventory/new" className="rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-sm font-medium">
              + New Asset
            </Link>
          }
        />

        <form className="flex flex-wrap items-center gap-3 mt-4" action="/inventory">
          <input
            type="text"
            name="q"
            defaultValue={params.q}
            placeholder="Search asset, location, area…"
            className="w-72 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
          <MediumSupplierSelect
            suppliers={suppliers}
            initialMedium={params.channel ?? ""}
            initialSupplier={params.supplier ?? ""}
            mediumFieldName="channel"
            mediumPlaceholder="All media"
            supplierPlaceholder="All suppliers"
          />
          <select
            name="format"
            defaultValue={params.format ?? ""}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          >
            <option value="">Static + Digital</option>
            <option value="STATIC">Static</option>
            <option value="DIGITAL">Digital</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-accent text-accent-foreground px-4 py-1.5 text-sm font-medium"
          >
            Filter
          </button>
          {(params.q || params.supplier || params.format || params.channel) && (
            <Link href="/media/inventory" className="text-sm text-muted underline">
              Clear
            </Link>
          )}
        </form>
      </div>

      <div className="flex-1 overflow-auto px-8 py-4">
        <table className="table-dense w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
              <th className="py-2 pr-4 font-medium"></th>
              <th className="py-2 pr-4 font-medium">Asset</th>
              <th className="py-2 pr-4 font-medium">Supplier</th>
              <th className="py-2 pr-4 font-medium">Location / Area</th>
              <th className="py-2 pr-4 font-medium">Format</th>
              <th className="py-2 pr-4 font-medium text-right">Faces</th>
              <th className="py-2 pr-4 font-medium text-right">Circuits</th>
              <th className="py-2 pr-4 font-medium">Latest rate</th>
              <th className="py-2 pr-4 font-medium">Rate year</th>
              <th className="py-2 pr-4 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const latestRate = asset.rates[0];
              const primaryImage = asset.images[0];
              const isPackage = asset._count.packageComponents > 0;
              return (
                <tr key={asset.id} className="border-b border-border hover:bg-background">
                  <td className="py-2 pr-4">
                    <Link href={`/media/inventory/${asset.id}`}>
                      <div className="w-10 h-10 rounded-md border border-border bg-background overflow-hidden flex items-center justify-center">
                        {primaryImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/asset-images/${primaryImage.id}`}
                            alt=""
                            className="w-full h-full object-cover"
                          />
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
                    {isPackage && (
                      <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 align-middle">
                        Package
                      </span>
                    )}
                    <div className="text-xs text-muted">{asset.assetCode}</div>
                  </td>
                  <td className="py-2 pr-4">{asset.supplier.name}</td>
                  <td className="py-2 pr-4">
                    {asset.locationName}
                    {asset.area && asset.area !== asset.locationName ? ` · ${asset.area}` : ""}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${
                        asset.format === "DIGITAL"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-gray-50 text-gray-700 border-gray-200"
                      }`}
                    >
                      {asset.format}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{asset.numberOfFaces ?? "—"}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{asset.numberOfCircuits ?? "—"}</td>
                  <td className="py-2 pr-4 tabular-nums">
                    {latestRate ? money(latestRate.grossRate) : "No rate"}
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

        {assets.length === 0 && (
          <div className="text-center text-muted text-sm py-16">No assets match these filters.</div>
        )}
      </div>

      <div className="px-8 py-3 border-t border-border bg-surface flex items-center justify-between text-sm">
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
  );
}
