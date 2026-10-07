import Link from "next/link";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { MapAsset } from "@/components/AssetMap";
import { MapClientWrapper } from "@/components/MapClientWrapper";
import { MediumSupplierSelect } from "@/components/MediumSupplierSelect";
import { PageHeader } from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

// Doha centroid — always the initial view. Never derived from "whichever
// asset happens to come back first" (arbitrary query order), which could
// center the map hundreds of km away on a single real but far-flung point.
const DOHA_CENTER: [number, number] = [25.2854, 51.531];

const MEDIA_CHANNELS = ["OOH", "RADIO", "TV", "PRINT", "CINEMA", "SMS", "DIGITAL"] as const;

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; supplier?: string }>;
}) {
  const params = await searchParams;

  const supplierWhere: Prisma.SupplierWhereInput = {};
  if (params.supplier) supplierWhere.id = params.supplier;
  else if (params.channel && (MEDIA_CHANNELS as readonly string[]).includes(params.channel)) {
    supplierWhere.mediaChannel = params.channel as (typeof MEDIA_CHANNELS)[number];
  }
  const assetWhere: Prisma.AssetWhereInput = Object.keys(supplierWhere).length > 0 ? { supplier: supplierWhere } : {};

  const [totalAssets, withPrimaryPoint, withMultipleLocations, geocodedSuppliers] = await Promise.all([
    prisma.asset.count({ where: assetWhere }),
    prisma.asset.findMany({
      where: { ...assetWhere, latitude: { not: null }, longitude: { not: null } },
      include: {
        supplier: true,
        images: { where: { kind: "primary" }, take: 1 },
        rates: { where: { publishedStatus: "PUBLISHED" }, orderBy: { rateYear: "desc" }, take: 1 },
        _count: { select: { locations: true } },
      },
    }),
    prisma.asset.findMany({
      where: { ...assetWhere, locations: { some: {} } },
      include: {
        supplier: true,
        images: { where: { kind: "primary" }, take: 1 },
        rates: { where: { publishedStatus: "PUBLISHED" }, orderBy: { rateYear: "desc" }, take: 1 },
        locations: true,
      },
    }),
    // Only suppliers with at least one real geocoded point are worth
    // offering in the filter — the rest would just show "0 assets found".
    prisma.supplier.findMany({
      where: { OR: [{ assets: { some: { latitude: { not: null } } } }, { assets: { some: { locations: { some: {} } } } }] },
      select: { id: true, name: true, mediaChannel: true },
      orderBy: { name: "asc" },
    }),
  ]);

  function baseFields(a: (typeof withPrimaryPoint)[number] | (typeof withMultipleLocations)[number]) {
    return {
      assetName: a.assetName,
      locationName: a.locationName,
      supplierName: a.supplier.name,
      format: a.format,
      numberOfFaces: a.numberOfFaces,
      numberOfScreens: a.numberOfScreens,
      latestRate:
        a.rates[0] && a.rates[0].grossRateStatus === "KNOWN"
          ? `QAR ${Number(a.rates[0].grossRate).toLocaleString()}`
          : a.rates[0]
            ? a.rates[0].grossRateStatus
            : null,
      primaryImageId: a.images[0]?.id ?? null,
    };
  }

  // A network/multi-circuit asset (Elan "MUPIS" covering hundreds of
  // physical panels) has real AssetLocation rows — plot every one of
  // those instead of the asset's own single lat/lng, so a multi-location
  // asset is never collapsed onto (or duplicated with) just one point.
  const multiLocationAssetIds = new Set(withMultipleLocations.map((a) => a.id));

  const mapAssets: MapAsset[] = [
    ...withPrimaryPoint
      .filter((a) => !multiLocationAssetIds.has(a.id))
      .map((a) => ({
        id: a.id,
        assetId: a.id,
        ...baseFields(a),
        latitude: Number(a.latitude),
        longitude: Number(a.longitude),
      })),
    ...withMultipleLocations.flatMap((a) =>
      a.locations.map((loc) => ({
        id: `${a.id}:${loc.id}`,
        assetId: a.id,
        ...baseFields(a),
        assetName: `${a.assetName} (${loc.label})`,
        latitude: Number(loc.latitude),
        longitude: Number(loc.longitude),
      }))
    ),
  ];

  const distinctAssetsPlotted = withPrimaryPoint.length + withMultipleLocations.filter((a) => a.latitude === null).length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6 pb-3 border-b border-border bg-surface">
        <PageHeader
          title="Map"
          subtitle={
            <>
              {distinctAssetsPlotted} of {totalAssets.toLocaleString()} assets have confirmed coordinates (
              {mapAssets.length.toLocaleString()} point{mapAssets.length === 1 ? "" : "s"} plotted — a
              multi-location asset shows one marker per real location).
              {distinctAssetsPlotted < totalAssets && (
                <span className="text-[var(--warning)]">
                  {" "}
                  The rest are not shown — coordinates are never estimated or fabricated. Add a real one via an
                  asset&apos;s Edit page, or Settings → Import KMZ.
                </span>
              )}
            </>
          }
        />

        <form className="flex flex-wrap items-center gap-3 mt-3" action="/map">
          <MediumSupplierSelect
            suppliers={geocodedSuppliers}
            initialMedium={params.channel ?? ""}
            initialSupplier={params.supplier ?? ""}
            mediumFieldName="channel"
            mediumPlaceholder="All media"
            supplierPlaceholder="All suppliers"
          />
          <button type="submit" className="rounded-md bg-accent text-accent-foreground px-4 py-1.5 text-sm font-medium">
            Filter
          </button>
          {(params.channel || params.supplier) && (
            <Link href="/planning/map" className="text-sm text-muted underline">
              Clear
            </Link>
          )}
        </form>
      </div>
      <div className="flex-1">
        {mapAssets.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted">
            No assets have confirmed coordinates yet.
          </div>
        ) : (
          <MapClientWrapper assets={mapAssets} center={DOHA_CENTER} />
        )}
      </div>
    </div>
  );
}
