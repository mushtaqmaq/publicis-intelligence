import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getAssetBookings } from "@/lib/planning/availability";
import { PageHeader } from "@/components/ui/PageHeader";

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export const dynamic = "force-dynamic";

function money(v: unknown) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : String(v);
}

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;

  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    include: {
      supplier: true,
      mediaCategory: true,
      images: { orderBy: [{ kind: "asc" }, { createdAt: "asc" }] },
      packageComponents: {
        orderBy: { sortOrder: "asc" },
        include: { linkedAsset: { include: { images: true } } },
      },
      componentOfPackages: { include: { packageAsset: true } },
      rates: {
        orderBy: [{ rateYear: "desc" }, { createdAt: "desc" }],
        include: {
          fees: true,
          rateCardVersion: { include: { rateCard: { include: { supplier: true } } } },
        },
      },
    },
  });

  if (!asset) notFound();

  const bookings = await getAssetBookings(assetId);

  const primaryImage = asset.images.find((i) => i.kind === "primary") ?? asset.images[0] ?? null;
  const galleryImages = asset.images.filter((i) => i.id !== primaryImage?.id);
  const isPackage = asset.packageComponents.length > 0;

  return (
    <div className="p-8 max-w-5xl">
      <Link href="/media/inventory" className="text-sm text-accent underline">
        ← Back to Inventory
      </Link>

      <div className="flex items-start justify-between mt-4">
        <div className="flex gap-5">
          <div className="w-40 h-40 shrink-0 rounded-lg border border-border bg-background overflow-hidden flex items-center justify-center">
            {primaryImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/asset-images/${primaryImage.id}`}
                alt={asset.assetName}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs text-muted text-center px-2">No photo yet</span>
            )}
          </div>
          <div>
            <PageHeader
              title={asset.assetName}
              subtitle={`${asset.supplier.name} · ${asset.locationName}${asset.area && asset.area !== asset.locationName ? ` · ${asset.area}` : ""}`}
            />
            <div className="flex gap-2 mt-2">
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${
                  asset.format === "DIGITAL"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-gray-50 text-gray-700 border-gray-200"
                }`}
              >
                {asset.format}
              </span>
              <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200">
                {asset.mediaCategory.name}
              </span>
              {isPackage && (
                <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                  Package · {asset.packageComponents.length} components
                </span>
              )}
              <span className="text-xs text-muted self-center">{asset.assetCode}</span>
            </div>
            {asset.componentOfPackages.length > 0 && (
              <p className="text-xs text-muted mt-2">
                Part of package(s):{" "}
                {asset.componentOfPackages.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && ", "}
                    <Link href={`/media/inventory/${c.packageAsset.id}`} className="text-accent underline">
                      {c.packageAsset.assetName}
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </div>
        </div>
        <Link
          href={`/media/inventory/${asset.id}/edit`}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium shrink-0"
        >
          Edit
        </Link>
      </div>

      {galleryImages.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-foreground mb-2">Photos</h2>
          <div className="flex gap-2 flex-wrap">
            {galleryImages.map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={img.id}
                src={`/api/asset-images/${img.id}`}
                alt={img.caption ?? asset.assetName}
                className="w-24 h-24 object-cover rounded-md border border-border"
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 mt-8">
        <section className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-sm font-medium text-foreground mb-3">Overview</h2>
          <dl className="text-sm space-y-1.5">
            <Row label="Supplier" value={asset.supplier.name} />
            <Row label="Location" value={asset.locationName} />
            <Row label="Area" value={asset.area} />
            <Row label="Faces" value={asset.numberOfFaces} />
            <Row label="Screens" value={asset.numberOfScreens} />
            <Row label="Circuits" value={asset.numberOfCircuits} />
            <Row label="Poles" value={asset.numberOfPoles} />
            <Row label="Pricing method" value={asset.pricingCalculationMethod} />
            <Row label="Status" value={asset.status} />
          </dl>
        </section>

        <section className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-sm font-medium text-foreground mb-3">Notes</h2>
          <p className="text-sm text-muted whitespace-pre-wrap">{asset.notes || "—"}</p>
        </section>
      </div>

      {isPackage && (
        <section className="mt-6 bg-surface border border-border rounded-lg p-5">
          <h2 className="text-sm font-medium text-foreground mb-1">
            What&apos;s inside this package
          </h2>
          <p className="text-xs text-muted mb-3">
            This asset is sold as one commercial line item covering multiple physical components.
          </p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
                <th className="py-2 pr-4 font-medium">Photo</th>
                <th className="py-2 pr-4 font-medium">Component</th>
                <th className="py-2 pr-4 font-medium text-right">Quantity</th>
                <th className="py-2 pr-4 font-medium">Size</th>
                <th className="py-2 pr-4 font-medium">Linked asset</th>
              </tr>
            </thead>
            <tbody>
              {asset.packageComponents.map((c) => {
                const linkedImage = c.linkedAsset?.images?.[0];
                return (
                  <tr key={c.id} className="border-b border-border">
                    <td className="py-2 pr-4">
                      <div className="w-12 h-12 rounded border border-border bg-background overflow-hidden flex items-center justify-center">
                        {c.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.imageUrl} alt={c.label} className="w-full h-full object-cover" />
                        ) : linkedImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/asset-images/${linkedImage.id}`}
                            alt={c.label}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-[10px] text-muted">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-4">{c.label}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{c.quantity ?? "—"}</td>
                    <td className="py-2 pr-4">{c.sizeRaw ?? "—"}</td>
                    <td className="py-2 pr-4">
                      {c.linkedAsset ? (
                        <Link href={`/media/inventory/${c.linkedAsset.id}`} className="text-accent underline">
                          {c.linkedAsset.assetName}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <section className="mt-6 bg-surface border border-border rounded-lg p-5">
        <h2 className="text-sm font-medium text-foreground mb-3">Rate history</h2>
        {asset.rates.length === 0 ? (
          <p className="text-sm text-muted">No rate on file for this asset.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
                <th className="py-2 pr-4 font-medium">Year</th>
                <th className="py-2 pr-4 font-medium">Rate</th>
                <th className="py-2 pr-4 font-medium">Basis</th>
                <th className="py-2 pr-4 font-medium">Fees</th>
                <th className="py-2 pr-4 font-medium">Source</th>
                <th className="py-2 pr-4 font-medium">Page</th>
              </tr>
            </thead>
            <tbody>
              {asset.rates.map((r) => {
                const supplierName = r.rateCardVersion.rateCard.supplier.name;
                const source =
                  supplierName === "__EXCEL_MIGRATION__"
                    ? "Excel migration"
                    : r.rateCardVersion.originalFilename;
                return (
                  <tr key={r.id} className="border-b border-border">
                    <td className="py-2 pr-4">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-[var(--warning)] border border-amber-200">
                        {r.rateYear} RATE
                      </span>
                    </td>
                    <td className="py-2 pr-4 tabular-nums">
                      {r.grossRateStatus === "KNOWN" ? `QAR ${money(r.grossRate)}` : r.grossRateStatus}
                      {r.durationValue && (
                        <span className="text-xs text-muted">
                          {" "}
                          / {r.durationValue.toString()} {r.durationUnit}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted">{r.pricingBasis}</td>
                    <td className="py-2 pr-4 text-xs">
                      {r.fees.length === 0
                        ? "—"
                        : r.fees
                            .map((f) => `${f.feeType}: ${f.amount !== null ? "QAR " + money(f.amount) : f.status}`)
                            .join(", ")}
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted">
                      {supplierName !== "__EXCEL_MIGRATION__" && r.rateCardVersion.storageUrl.startsWith("http") ? (
                        <a
                          href={`/api/rate-cards/${r.rateCardVersion.id}/file`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent underline"
                        >
                          {source}
                        </a>
                      ) : (
                        source
                      )}
                    </td>
                    <td className="py-2 pr-4 text-xs text-muted">{r.sourcePage ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-6 bg-surface border border-border rounded-lg p-5">
        <h2 className="text-sm font-medium text-foreground mb-3">Committed bookings</h2>
        <p className="text-xs text-muted mb-3">
          Computed from real media plan line items on Approved/Booked/Completed plans — there is no
          separate availability calendar, this is the actual booking history.
        </p>
        {bookings.length === 0 ? (
          <p className="text-sm text-muted">No committed bookings for this asset.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-muted uppercase tracking-wide border-b border-border">
                <th className="py-2 pr-4 font-medium">Campaign</th>
                <th className="py-2 pr-4 font-medium">Client</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Dates</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b, i) => (
                <tr key={i} className="border-b border-border">
                  <td className="py-2 pr-4">
                    <Link href={`/media/plans/${b.planId}`} className="text-accent underline">
                      {b.campaignName}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-muted">{b.clientName}</td>
                  <td className="py-2 pr-4 text-xs">{b.status}</td>
                  <td className="py-2 pr-4 text-xs text-muted">
                    {fmtDate(b.startDate)} → {fmtDate(b.endDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-foreground text-right">{value ?? "—"}</dd>
    </div>
  );
}
