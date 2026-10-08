import { requireMediaUser } from "@/lib/auth/modules";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getApplicableRatesForAsset } from "@/lib/planning/rateResolution";
import { getAssetBookings, findConflicts } from "@/lib/planning/availability";
import { getBookingUnit } from "@/lib/planning/bookingUnit";
import { addAssetToPlanAction } from "../../actions";
import { PageHeader } from "@/components/ui/PageHeader";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export const dynamic = "force-dynamic";

function money(v: number | null) {
  return v === null ? "—" : `QAR ${v.toLocaleString()}`;
}

export default async function AddAssetToPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string; assetId: string }>;
  searchParams: Promise<{ error?: string; v?: string }>;
}) {
  await requireMediaUser("plans");
  const { planId, assetId } = await params;
  const { error, v } = await searchParams;

  const [plan, asset, suppliers] = await Promise.all([
    prisma.mediaPlan.findUnique({ where: { id: planId }, include: { versions: { orderBy: { versionNumber: "desc" } } } }),
    prisma.asset.findUnique({ where: { id: assetId }, include: { supplier: true, images: { where: { kind: "primary" }, take: 1 } } }),
    prisma.supplier.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  if (!plan || !asset) notFound();
  const version = (v && plan.versions.find((ver) => ver.id === v)) || plan.versions[0];

  const availability = await getApplicableRatesForAsset(assetId, plan.campaignStart);
  const defaultQuantity = asset.numberOfCircuits ?? asset.numberOfFaces ?? asset.numberOfScreens ?? 1;
  const unit = getBookingUnit(asset.supplier.mediaChannel, asset.pricingCalculationMethod);

  const bookings = await getAssetBookings(assetId);
  const conflicts = findConflicts(bookings, plan.campaignStart, plan.campaignEnd);

  return (
    <div className="p-8 max-w-2xl">
      <Link href={`/media/plans/${planId}`} className="text-sm text-accent underline">
        ← Back to {plan.campaignName}
      </Link>

      <div className="flex items-center gap-4 mt-4">
        <div className="w-16 h-16 rounded-md border border-border bg-background overflow-hidden flex items-center justify-center shrink-0">
          {asset.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/asset-images/${asset.images[0].id}`} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs text-muted">—</span>
          )}
        </div>
        <div>
          <PageHeader title={asset.assetName} subtitle={`${asset.supplier.name} · ${asset.locationName}`} />
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-[var(--warning)]">
          <strong>Possible double-booking.</strong> This asset is already committed on{" "}
          {conflicts.length === 1 ? "another plan" : `${conflicts.length} other plans`} that overlap this
          campaign&apos;s dates ({fmtDate(plan.campaignStart)} to {fmtDate(plan.campaignEnd)}):
          <ul className="mt-1.5 list-disc list-inside">
            {conflicts.map((c, i) => (
              <li key={i}>
                <Link href={`/media/plans/${c.planId}`} className="underline">
                  {c.campaignName}
                </Link>{" "}
                ({c.clientName}, {c.status}) · {fmtDate(c.startDate)} → {fmtDate(c.endDate)}
              </li>
            ))}
          </ul>
          This is only a heads-up, based on real bookings on Approved/Booked/Completed plans — nothing
          blocks adding it anyway if the asset genuinely has multiple faces/circuits available.
        </div>
      )}

      {bookings.length > 0 && conflicts.length === 0 && (
        <details className="mt-6 text-xs text-muted">
          <summary className="cursor-pointer">
            {bookings.length} existing committed booking{bookings.length === 1 ? "" : "s"} for this asset (no
            overlap with this campaign)
          </summary>
          <ul className="mt-1.5 list-disc list-inside">
            {bookings.map((b, i) => (
              <li key={i}>
                {b.campaignName} ({b.clientName}, {b.status}) · {fmtDate(b.startDate)} → {fmtDate(b.endDate)}
              </li>
            ))}
          </ul>
        </details>
      )}

      {!availability.found ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-[var(--danger)]">
          <strong>No valid historical rate available.</strong> This asset has no published rate at
          or before {availability.requestedYear} — it cannot be added to a campaign starting in{" "}
          {availability.requestedYear} without a rate to use. Add a rate for it first via Settings →
          Import Rate Card, or its Edit page.
        </div>
      ) : (
        <>
          <div className="mt-6 flex items-center gap-2">
            <span className="text-xs px-2 py-1 rounded bg-amber-50 text-[var(--warning)] border border-amber-200 font-medium">
              {availability.rateYear} RATE
            </span>
            {availability.isFallback && (
              <span className="text-xs text-muted">
                Fallback — no {availability.requestedYear} rate available, using the most recent
                earlier one.
              </span>
            )}
          </div>

          <form action={addAssetToPlanAction} className="mt-4 space-y-4 bg-surface border border-border rounded-lg p-5">
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="versionId" value={version.id} />
            <input type="hidden" name="assetId" value={assetId} />

            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
                {unit.rateLabel}
              </label>
              <select name="assetRateId" required className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
                {availability.rates.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.pricingBasis.replace(/_/g, " ")}
                    {r.durationValue ? ` · ${r.durationValue} ${r.durationUnit}` : ""} —{" "}
                    {r.grossRateStatus === "KNOWN" ? money(r.grossRate) : r.grossRateStatus} ({r.sourceDocument}
                    {r.sourcePage ? `, p.${r.sourcePage}` : ""})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  name="startDate"
                  defaultValue={plan.campaignStart.toISOString().slice(0, 10)}
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  name="endDate"
                  defaultValue={plan.campaignEnd.toISOString().slice(0, 10)}
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
                  {unit.quantityLabel}
                </label>
                <input
                  type="number"
                  name="quantity"
                  min={1}
                  defaultValue={defaultQuantity}
                  required
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                />
                <p className="text-[11px] text-muted mt-1">{unit.quantityHint}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
                  Discount %
                </label>
                <input
                  type="number"
                  name="discountPct"
                  step="0.01"
                  defaultValue={0}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
                  Additional Discount %
                </label>
                <input
                  type="number"
                  name="additionalDiscountPct"
                  step="0.01"
                  defaultValue={0}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
                Additional Discount Reason
              </label>
              <input
                type="text"
                name="discountOverrideReason"
                placeholder="Required only if Additional Discount % is non-zero"
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
              <p className="text-[11px] text-muted mt-1">
                Any non-zero Additional Discount % is a manual override on top of the standard
                discount — it requires a reason and is written to the Audit Log with your name and
                the date.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
                Buying Entity / Seat
              </label>
              <select name="buyingEntityId" defaultValue="" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
                <option value="">Direct (no intermediary)</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted mt-1">
                Who actually executed this buy, when different from {asset.supplier.name} itself (e.g. run through an
                agency&apos;s seat). Internal tracking only — never shown in a client-facing export.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
                Notes
              </label>
              <textarea name="notes" rows={2} className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
            </div>

            <button type="submit" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium">
              Add to Plan
            </button>
          </form>
        </>
      )}
    </div>
  );
}
