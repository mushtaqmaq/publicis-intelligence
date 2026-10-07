import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { removeItemAction, updateStatusAction, updateWorkflowStatusAction, createNewVersionAction, deleteMediaPlanAction } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { MediumSupplierSelect } from "@/components/MediumSupplierSelect";
import { requireSessionUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  "DRAFT",
  "PLANNING",
  "INTERNAL_REVIEW",
  "CLIENT_SHARED",
  "APPROVED",
  "AWAITING_ARTWORK",
  "BOOKED",
  "SCHEDULED",
  "LIVE",
  "COMPLETED",
  "CANCELLED",
] as const;

const ARTWORK_OPTIONS = ["NOT_SUBMITTED", "SUBMITTED", "APPROVED", "REJECTED"] as const;
const BO_PO_OPTIONS = ["NOT_REQUIRED", "PENDING", "ISSUED"] as const;
const SUPPLIER_CONFIRMATION_OPTIONS = ["PENDING", "CONFIRMED", "DECLINED"] as const;

function money(v: unknown) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : null;
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const MEDIA_CHANNELS = ["OOH", "RADIO", "TV", "PRINT", "CINEMA", "SMS", "DIGITAL"] as const;

export default async function MediaPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ q?: string; supplier?: string; medium?: string; v?: string }>;
}) {
  const { planId } = await params;
  const search = await searchParams;

  const user = await requireSessionUser();
  const canManageWorkflow = await hasPermission(user, "campaigns.manage_status");

  const plan = await prisma.mediaPlan.findUnique({
    where: { id: planId },
    include: {
      client: true,
      versions: { orderBy: { versionNumber: "desc" }, select: { id: true, versionNumber: true, label: true, isLocked: true } },
    },
  });
  if (!plan) notFound();

  const versionMeta = (search.v && plan.versions.find((v) => v.id === search.v)) || plan.versions[0];

  const version = await prisma.mediaPlanVersion.findUniqueOrThrow({
    where: { id: versionMeta.id },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          asset: { include: { supplier: true, images: { where: { kind: "primary" }, take: 1 } } },
          buyingEntity: { select: { name: true } },
        },
      },
    },
  });
  const items = version.items;

  // --- Sticky summary -----------------------------------------------------
  let grossTotal = 0;
  let netTotal = 0;
  let feesTotal = 0;
  let grandTotal = 0;
  let agencyFeeTotal = 0;
  let irTotal = 0;
  let anyPending = false;
  const supplierIds = new Set<string>();

  for (const item of items) {
    if (item.grossCost !== null) grossTotal += Number(item.grossCost);
    if (item.netMedia !== null) netTotal += Number(item.netMedia);
    const fees =
      (item.productionFee ? Number(item.productionFee) : 0) +
      (item.uploadFee ? Number(item.uploadFee) : 0) +
      (item.installationFee ? Number(item.installationFee) : 0) +
      (item.serviceFee ? Number(item.serviceFee) : 0) +
      (item.otherFees ? Number(item.otherFees) : 0);
    feesTotal += fees;
    if (item.lineTotal !== null) grandTotal += Number(item.lineTotal);
    if (item.agencyFeeAmount !== null) agencyFeeTotal += Number(item.agencyFeeAmount);
    if (item.irAmount !== null) irTotal += Number(item.irAmount);
    if (item.excludesPendingCost) anyPending = true;
    supplierIds.add(item.asset.supplierId);
  }
  const hasAgencyRevenueData = agencyFeeTotal > 0 || irTotal > 0;

  const budget = plan.budget ? Number(plan.budget) : null;
  const variance = budget !== null ? budget - grandTotal : null;

  // --- Asset search (only when the panel is open) --------------------------
  let searchResults: Array<{
    id: string;
    assetName: string;
    locationName: string;
    supplier: { name: string };
    images: { id: string }[];
    hasRate: boolean;
  }> = [];
  const validMedium =
    search.medium && (MEDIA_CHANNELS as readonly string[]).includes(search.medium)
      ? (search.medium as (typeof MEDIA_CHANNELS)[number])
      : undefined;

  if (search.q || search.supplier || validMedium) {
    const where: Prisma.AssetWhereInput = {};
    if (search.q) {
      where.OR = [
        { assetName: { contains: search.q, mode: "insensitive" } },
        { locationName: { contains: search.q, mode: "insensitive" } },
      ];
    }
    if (search.supplier) where.supplierId = search.supplier;
    if (validMedium) where.supplier = { mediaChannel: validMedium };
    const results = await prisma.asset.findMany({
      where,
      include: { supplier: true, images: { where: { kind: "primary" }, take: 1 }, rates: { where: { publishedStatus: "PUBLISHED" }, take: 1 } },
      take: 30,
      orderBy: { assetName: "asc" },
    });
    searchResults = results.map((r) => ({
      id: r.id,
      assetName: r.assetName,
      locationName: r.locationName,
      supplier: r.supplier,
      images: r.images,
      hasRate: r.rates.length > 0,
    }));
  }

  const suppliers = await prisma.supplier.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, mediaChannel: true },
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6 pb-4 border-b border-border bg-surface">
        <Link href="/media/plans" className="text-sm text-accent underline">
          ← All Media Plans
        </Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <PageHeader
              title={plan.campaignName}
              subtitle={`${plan.client.name} · ${fmtDate(plan.campaignStart)} → ${fmtDate(plan.campaignEnd)} · ${plan.currency}`}
            />
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex flex-col items-end gap-0.5 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-muted">Client:</span>
                {(["xlsx", "csv", "pdf"] as const).map((fmt) => (
                  <a
                    key={fmt}
                    href={`/media/plans/${planId}/export?v=${version.id}&mode=client&format=${fmt}`}
                    className="text-accent underline uppercase"
                  >
                    {fmt}
                  </a>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted">Internal:</span>
                {(["xlsx", "csv", "pdf"] as const).map((fmt) => (
                  <a
                    key={fmt}
                    href={`/media/plans/${planId}/export?v=${version.id}&mode=internal&format=${fmt}`}
                    className="text-accent underline uppercase"
                  >
                    {fmt}
                  </a>
                ))}
              </div>
              {items.length > 0 && (
                <a
                  href={`/media/plans/${planId}/photosheet?v=${version.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline"
                >
                  Photosheet (PDF)
                </a>
              )}
              {items.length > 0 && (
                <Link href={`/media/plans/${planId}/proof-of-posting?v=${version.id}`} className="text-accent underline">
                  Proof of Posting
                </Link>
              )}
            </div>
            <form action={updateStatusAction} className="flex items-center gap-2">
              <input type="hidden" name="planId" value={planId} />
              <input type="hidden" name="versionId" value={version.id} />
              <select
                name="status"
                defaultValue={plan.status}
                className="text-xs rounded border border-border bg-background px-2 py-1"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <button type="submit" className="text-xs px-2 py-1 rounded bg-accent text-accent-foreground font-medium">
                Update Status
              </button>
            </form>
            {user.role === "SUPER_ADMIN" && (
              <form action={deleteMediaPlanAction}>
                <input type="hidden" name="planId" value={planId} />
                <button type="submit" className="text-xs text-[var(--danger)] underline">
                  Delete this plan
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          {plan.versions.map((v) => (
            <Link
              key={v.id}
              href={`/media/plans/${planId}?v=${v.id}`}
              className={`text-xs px-2 py-1 rounded border ${
                v.id === version.id
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-surface text-muted border-border hover:bg-background"
              }`}
            >
              {v.label}
              {v.isLocked && " 🔒"}
            </Link>
          ))}
          <form action={createNewVersionAction}>
            <input type="hidden" name="planId" value={planId} />
            <button className="text-xs px-2 py-1 rounded border border-border text-accent">+ New Version</button>
          </form>
          {plan.versions.length >= 2 && (
            <Link
              href={`/media/plans/${planId}/compare?a=${plan.versions[1].id}&b=${plan.versions[0].id}`}
              className="text-xs px-2 py-1 rounded border border-border text-accent"
            >
              Compare Versions
            </Link>
          )}
        </div>

        {version.isLocked && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-[var(--warning)]">
            This version is locked ({plan.status.replace(/_/g, " ")}) — its line items can no longer
            be changed. Create a new version to make edits.
          </div>
        )}

        {canManageWorkflow && (
          <form action={updateWorkflowStatusAction} className="flex flex-wrap items-center gap-3 mt-3 text-xs">
            <input type="hidden" name="planId" value={planId} />
            <span className="text-muted uppercase tracking-wide">Workflow:</span>
            <label className="flex items-center gap-1.5">
              Artwork
              <select name="artworkStatus" defaultValue={plan.artworkStatus ?? ""} className="rounded border border-border bg-background px-1.5 py-0.5">
                <option value="">—</option>
                {ARTWORK_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              BO/PO
              <select name="boPoStatus" defaultValue={plan.boPoStatus ?? ""} className="rounded border border-border bg-background px-1.5 py-0.5">
                <option value="">—</option>
                {BO_PO_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5">
              Supplier Confirmation
              <select name="supplierConfirmationStatus" defaultValue={plan.supplierConfirmationStatus ?? ""} className="rounded border border-border bg-background px-1.5 py-0.5">
                <option value="">—</option>
                {SUPPLIER_CONFIRMATION_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="px-2 py-1 rounded bg-accent text-accent-foreground font-medium">
              Save
            </button>
          </form>
        )}
      </div>

      <div className="flex-1 overflow-auto px-8 py-5">
        {!version.isLocked && (
          <section className="bg-surface border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-foreground">Add assets</h2>
            </div>
            <form className="flex flex-wrap gap-3 items-center" action={`/media/plans/${planId}`}>
              <input type="hidden" name="v" value={version.id} />
              <MediumSupplierSelect
                suppliers={suppliers}
                initialMedium={validMedium ?? ""}
                initialSupplier={search.supplier ?? ""}
                mediumPlaceholder="1. Select medium…"
                supplierPlaceholder="2. All suppliers"
              />
              <input
                type="text"
                name="q"
                defaultValue={search.q}
                placeholder="Search asset or location…"
                className="w-64 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
              <button type="submit" className="rounded-md bg-accent text-accent-foreground px-4 py-1.5 text-sm font-medium">
                Search
              </button>
              {(search.q || search.supplier || validMedium) && (
                <Link href={`/media/plans/${planId}?v=${version.id}`} className="text-sm text-muted underline">
                  Clear
                </Link>
              )}
            </form>
            <p className="text-xs text-muted mt-2">
              Pick a medium first (TV, OOH, Radio, Print, Cinema, SMS, Digital) to narrow the supplier list, then the
              supplier, then search — each step filters what shows up next.
            </p>

            {(search.q || search.supplier || validMedium) && (
              <div className="mt-4">
                {searchResults.length === 0 ? (
                  <p className="text-sm text-muted">No assets match.</p>
                ) : (
                  <table className="w-full text-sm border-collapse">
                    <tbody>
                      {searchResults.map((r) => (
                        <tr key={r.id} className="border-b border-border">
                          <td className="py-2 pr-3 w-10">
                            <div className="w-8 h-8 rounded border border-border bg-background overflow-hidden flex items-center justify-center">
                              {r.images[0] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={`/api/asset-images/${r.images[0].id}`} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-[9px] text-muted">—</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 pr-3">
                            <div className="font-medium text-foreground">{r.assetName}</div>
                            <div className="text-xs text-muted">
                              {r.supplier.name} · {r.locationName}
                            </div>
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {r.hasRate ? (
                              <Link href={`/media/plans/${planId}/add-asset/${r.id}?v=${version.id}`} className="text-xs text-accent underline">
                                Add →
                              </Link>
                            ) : (
                              <span className="text-xs text-muted">No rate</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </section>
        )}

        <section className="mt-6">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
                <th className="py-2 pr-4 font-medium">Asset</th>
                <th className="py-2 pr-4 font-medium">Dates</th>
                <th className="py-2 pr-4 font-medium text-right">Qty</th>
                <th className="py-2 pr-4 font-medium text-right">Gross</th>
                <th className="py-2 pr-4 font-medium text-right">Disc %</th>
                <th className="py-2 pr-4 font-medium text-right">Net</th>
                <th className="py-2 pr-4 font-medium text-right">Fees</th>
                <th className="py-2 pr-4 font-medium text-right">Total</th>
                <th className="py-2 pr-4 font-medium">Rate Year</th>
                {!version.isLocked && <th className="py-2 pr-4 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const snapshot = item.rateSnapshot as unknown as { rateYear?: number; sourceRateCard?: string };
                const fees =
                  (item.productionFee ? Number(item.productionFee) : 0) +
                  (item.uploadFee ? Number(item.uploadFee) : 0) +
                  (item.installationFee ? Number(item.installationFee) : 0) +
                  (item.serviceFee ? Number(item.serviceFee) : 0) +
                  (item.otherFees ? Number(item.otherFees) : 0);
                return (
                  <tr key={item.id} className="border-b border-border">
                    <td className="py-2 pr-4">
                      <Link href={`/media/inventory/${item.asset.id}`} className="font-medium text-foreground hover:underline">
                        {item.asset.assetName}
                      </Link>
                      <div className="text-xs text-muted">
                        {item.asset.supplier.name} · {item.asset.locationName}
                        {item.buyingEntity && <> · via {item.buyingEntity.name}</>}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted">
                      {fmtDate(item.startDate)} → {fmtDate(item.endDate)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{item.selectedCircuits ?? "—"}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{money(item.grossCost) ?? "—"}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">
                      {item.discountPct ? `${(Number(item.discountPct) * 100).toFixed(0)}%` : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{money(item.netMedia) ?? "—"}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{fees ? fees.toLocaleString() : "—"}</td>
                    <td className="py-2 pr-4 text-right tabular-nums font-medium">
                      {money(item.lineTotal) ?? "—"}
                      {item.excludesPendingCost && (
                        <div className="text-[10px] text-[var(--warning)]">excludes pending cost</div>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-[var(--warning)] border border-amber-200">
                        {snapshot.rateYear ?? "—"} RATE
                      </span>
                    </td>
                    {!version.isLocked && (
                      <td className="py-2 pr-4 text-right">
                        <form action={removeItemAction}>
                          <input type="hidden" name="planId" value={planId} />
                          <input type="hidden" name="itemId" value={item.id} />
                          <button className="text-xs text-[var(--danger)] underline">Remove</button>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {items.length === 0 && (
            <div className="text-center text-muted text-sm py-12">
              No assets added yet — search above to add the first one.
            </div>
          )}
        </section>
      </div>

      <div className="px-8 py-4 border-t border-border bg-surface">
        <div className="grid grid-cols-6 gap-6 text-sm">
          <Stat label="Gross Media" value={`QAR ${grossTotal.toLocaleString()}`} />
          <Stat label="Net Media" value={`QAR ${netTotal.toLocaleString()}`} />
          <Stat label="Fees" value={`QAR ${feesTotal.toLocaleString()}`} />
          <Stat label="Grand Total" value={`QAR ${grandTotal.toLocaleString()}`} emphasize />
          <Stat
            label="Budget Variance"
            value={variance === null ? "No budget set" : `QAR ${variance.toLocaleString()}`}
            warn={variance !== null && variance < 0}
          />
          <Stat label="Assets / Suppliers" value={`${items.length} / ${supplierIds.size}`} />
        </div>
        {hasAgencyRevenueData && (
          <div className="grid grid-cols-6 gap-6 text-sm mt-3 pt-3 border-t border-border">
            <Stat label="Net to Media" value={`QAR ${netTotal.toLocaleString()}`} />
            <Stat label="Agency Fee" value={`QAR ${agencyFeeTotal.toLocaleString()}`} />
            <Stat label="IR (Incentive Rebate)" value={`QAR ${irTotal.toLocaleString()}`} />
            <Stat label="Total Revenue" value={`QAR ${(agencyFeeTotal + irTotal).toLocaleString()}`} emphasize />
            <Stat label="Net to Client" value={`QAR ${grandTotal.toLocaleString()}`} />
          </div>
        )}
        {anyPending && (
          <p className="text-xs text-[var(--warning)] mt-2">
            One or more line items exclude a pending (TBD/POA) cost — totals above are partial.
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, emphasize, warn }: { label: string; value: string; emphasize?: boolean; warn?: boolean }) {
  return (
    <div>
      <div className="text-xs text-muted uppercase tracking-wide">{label}</div>
      <div className={`mt-0.5 tabular-nums ${emphasize ? "text-lg font-semibold" : "font-medium"} ${warn ? "text-[var(--danger)]" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}
