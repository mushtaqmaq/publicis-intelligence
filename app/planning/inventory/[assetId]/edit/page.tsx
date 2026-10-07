import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  updateAssetAction,
  uploadAssetImageAction,
  setPrimaryImageAction,
  deleteAssetImageAction,
  addAssetRateAction,
  updateAssetRateAction,
  deleteAssetRateAction,
} from "./actions";
import { PackageComponentsEditor } from "./PackageComponentsEditor";
import { FormatFields } from "./FormatFields";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

export default async function EditAssetPage({
  params,
  searchParams,
}: {
  params: Promise<{ assetId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { assetId } = await params;
  const { error } = await searchParams;

  const [asset, categories] = await Promise.all([
    prisma.asset.findUnique({
      where: { id: assetId },
      include: {
        images: { orderBy: [{ kind: "asc" }, { createdAt: "asc" }] },
        packageComponents: { orderBy: { sortOrder: "asc" } },
        rates: { orderBy: [{ rateYear: "desc" }, { createdAt: "desc" }] },
      },
    }),
    prisma.assetCategory.findMany({ orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }] }),
  ]);
  if (!asset) notFound();

  const initialComponents = asset.packageComponents.map((c) => ({
    label: c.label,
    quantity: c.quantity?.toString() ?? "",
    sizeRaw: c.sizeRaw ?? "",
    linkedAssetId: c.linkedAssetId ?? "",
  }));

  return (
    <div className="p-8 max-w-3xl">
      <Link href={`/planning/inventory/${asset.id}`} className="text-sm text-accent underline">
        ← Back to {asset.assetName}
      </Link>
      <div className="mt-3">
        <PageHeader
          title="Edit Asset"
          subtitle="Correct anything the automated import got wrong — many asset names were extracted from messy PDF layouts and need a human's eye (see docs/ingestion-notes.md)."
        />
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      <section className="mt-6 bg-surface border border-border rounded-lg p-5">
        <h2 className="text-sm font-medium text-foreground mb-3">Photos</h2>
        <div className="flex gap-3 flex-wrap mb-4">
          {asset.images.map((img) => (
            <div key={img.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/asset-images/${img.id}`}
                alt=""
                className={`w-24 h-24 object-cover rounded-md border-2 ${
                  img.kind === "primary" ? "border-accent" : "border-border"
                }`}
              />
              <div className="flex gap-2 mt-1 text-[11px]">
                {img.kind === "primary" ? (
                  <span className="text-accent">Primary</span>
                ) : (
                  <form action={setPrimaryImageAction}>
                    <input type="hidden" name="assetId" value={asset.id} />
                    <input type="hidden" name="imageId" value={img.id} />
                    <button className="text-muted underline">Make primary</button>
                  </form>
                )}
                <form action={deleteAssetImageAction}>
                  <input type="hidden" name="assetId" value={asset.id} />
                  <input type="hidden" name="imageId" value={img.id} />
                  <button className="text-[var(--danger)] underline">Delete</button>
                </form>
              </div>
            </div>
          ))}
          {asset.images.length === 0 && <p className="text-sm text-muted">No photos yet.</p>}
        </div>
        <form action={uploadAssetImageAction} className="flex items-center gap-3">
          <input type="hidden" name="assetId" value={asset.id} />
          <input type="file" name="file" accept="image/*" required className="text-sm" />
          <SubmitButton pendingText="Uploading…" className="rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-sm font-medium">
            Upload
          </SubmitButton>
        </form>
      </section>

      <form action={updateAssetAction} className="mt-6 space-y-4 bg-surface border border-border rounded-lg p-5">
        <input type="hidden" name="assetId" value={asset.id} />

        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
            Asset Name
          </label>
          <input
            type="text"
            name="assetName"
            defaultValue={asset.assetName}
            required
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
              Location
            </label>
            <input
              type="text"
              name="locationName"
              defaultValue={asset.locationName}
              required
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
              Area
            </label>
            <input
              type="text"
              name="area"
              defaultValue={asset.area ?? ""}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </div>
        </div>

        <FormatFields
          initialFormat={asset.format ?? ""}
          categories={categories}
          defaultCategoryId={asset.mediaCategoryId}
          mediaType={asset.mediaType}
          numberOfFaces={asset.numberOfFaces}
          numberOfScreens={asset.numberOfScreens}
          numberOfCircuits={asset.numberOfCircuits}
          numberOfPoles={asset.numberOfPoles}
        />

        <div>
          <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">
            Notes
          </label>
          <textarea
            name="notes"
            defaultValue={asset.notes ?? ""}
            rows={3}
            className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
        </div>

        <div className="pt-2 border-t border-border">
          <h2 className="text-sm font-medium text-foreground mb-2">Package components</h2>
          <PackageComponentsEditor initial={initialComponents} />
        </div>

        <SubmitButton pendingText="Saving…" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium">
          Save Changes
        </SubmitButton>
      </form>

      <section className="mt-6 bg-surface border border-border rounded-lg p-5">
        <h2 className="text-sm font-medium text-foreground mb-1">Rates</h2>
        <p className="text-xs text-muted mb-4">
          Add or correct a rate directly — useful for digital platforms (CPM/CPC) or anything priced
          outside the rate-card upload flow. Every rate here still gets a traceable manual-entry
          receipt in Settings → Rate Cards.
        </p>

        {asset.rates.length > 0 && (
          <div className="space-y-2 mb-5">
            {asset.rates.map((r) => (
              <form
                key={r.id}
                action={updateAssetRateAction}
                className="flex flex-wrap items-center gap-2 border border-border rounded-md p-3"
              >
                <input type="hidden" name="assetId" value={asset.id} />
                <input type="hidden" name="rateId" value={r.id} />
                <span className="text-xs text-muted w-24">
                  {r.rateYear} · {r.pricingBasis.replace(/_/g, " ")}
                </span>
                <span className="text-xs text-muted w-32">{r.quantityBasis ?? "—"}</span>
                <select
                  name="grossRateStatus"
                  defaultValue={r.grossRateStatus}
                  className="text-sm rounded border border-border bg-background px-2 py-1"
                >
                  <option value="KNOWN">Known</option>
                  <option value="TBD">TBD</option>
                  <option value="ON_REQUEST">On Request</option>
                  <option value="POA">POA</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  name="grossRate"
                  defaultValue={r.grossRate?.toString() ?? ""}
                  placeholder="rate"
                  className="text-sm rounded border border-border bg-background px-2 py-1 w-28"
                />
                <select
                  name="currency"
                  defaultValue={r.currency}
                  className="text-sm rounded border border-border bg-background px-2 py-1 w-20"
                >
                  <option value="QAR">QAR</option>
                  <option value="USD">USD</option>
                </select>
                <SubmitButton className="text-xs px-2 py-1 rounded bg-accent text-accent-foreground font-medium">
                  Save
                </SubmitButton>
                <SubmitButton
                  formAction={deleteAssetRateAction}
                  className="text-xs px-2 py-1 rounded border border-border text-[var(--danger)]"
                >
                  Delete
                </SubmitButton>
              </form>
            ))}
          </div>
        )}
        {asset.rates.length === 0 && <p className="text-sm text-muted mb-4">No rates yet.</p>}

        <details>
          <summary className="text-sm text-accent underline cursor-pointer">+ Add a rate</summary>
          <form action={addAssetRateAction} className="mt-3 space-y-3">
            <input type="hidden" name="assetId" value={asset.id} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Calculation Method</label>
                <select name="pricingCalculationMethod" defaultValue={asset.pricingCalculationMethod} className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
                  {["FIXED", "PRO_RATA", "DAILY", "PER_FACE_DAILY", "PER_FACE", "PER_CIRCUIT", "PER_SPOT", "PER_INSERTION", "PER_MESSAGE", "PER_SCREEN", "PER_NETWORK", "PER_POLE", "CPM", "CPC", "MONTHLY", "CUSTOM"].map((m) => (
                    <option key={m} value={m}>
                      {m.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Pricing Basis</label>
                <select name="pricingBasis" defaultValue="PER_1000_IMPRESSIONS" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
                  {["PER_DAY", "PER_FACE", "PER_SCREEN", "PER_SCREEN_BUNDLE", "PER_POLE", "PER_CIRCUIT", "PER_NETWORK", "PER_SPOT", "PER_INSERTION", "PER_MESSAGE", "PER_1000_IMPRESSIONS", "PER_CLICK", "PER_WEEK", "PER_2_WEEKS", "PER_4_WEEKS", "PER_3_MONTHS", "PER_6_MONTHS", "PER_12_MONTHS", "FIXED_PACKAGE", "CUSTOM"].map((b) => (
                    <option key={b} value={b}>
                      {b.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Status</label>
                <select name="grossRateStatus" defaultValue="KNOWN" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
                  <option value="KNOWN">Known</option>
                  <option value="TBD">TBD</option>
                  <option value="ON_REQUEST">On Request</option>
                  <option value="POA">POA</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Gross Rate</label>
                <input type="number" step="0.01" name="grossRate" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Currency</label>
                <select name="currency" defaultValue="QAR" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm">
                  <option value="QAR">QAR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Quantity Basis</label>
                <input type="text" name="quantityBasis" placeholder="e.g. per 1,000 impressions" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Duration (value / unit)</label>
                <div className="flex gap-2">
                  <input type="number" name="durationValue" className="w-1/2 rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
                  <input type="text" name="durationUnit" placeholder="weeks" className="w-1/2 rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Rate Year</label>
                <input type="number" name="rateYear" defaultValue={new Date().getFullYear()} className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted uppercase tracking-wide mb-1">Source note</label>
              <input type="text" name="sourceNote" placeholder="e.g. Rate sheet from account manager, email 2026-10-01" className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm" />
            </div>
            <SubmitButton pendingText="Adding…" className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium">
              Add Rate
            </SubmitButton>
          </form>
        </details>
      </section>
    </div>
  );
}
