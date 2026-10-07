import "server-only";
import { prisma } from "@/lib/prisma";

export type Bucket = { label: string; gross: number; net: number; fees: number; total: number; count: number; anyPending: boolean };

export function newBucket(label: string): Bucket {
  return { label, gross: 0, net: 0, fees: 0, total: 0, count: 0, anyPending: false };
}

export function addToBucket(
  bucket: Bucket,
  item: {
    grossCost: unknown;
    netMedia: unknown;
    lineTotal: unknown;
    productionFee: unknown;
    uploadFee: unknown;
    installationFee: unknown;
    serviceFee: unknown;
    otherFees: unknown;
    excludesPendingCost: boolean;
  }
) {
  const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
  bucket.gross += num(item.grossCost);
  bucket.net += num(item.netMedia);
  bucket.fees += num(item.productionFee) + num(item.uploadFee) + num(item.installationFee) + num(item.serviceFee) + num(item.otherFees);
  bucket.total += num(item.lineTotal);
  bucket.count += 1;
  if (item.excludesPendingCost) bucket.anyPending = true;
}

export interface SpendAggregation {
  bySupplier: Map<string, Bucket>;
  byClient: Map<string, Bucket>;
  byArea: Map<string, Bucket>;
  byFormat: Map<string, Bucket>;
  byChannel: Map<string, Bucket>;
  byAsset: Map<string, Bucket & { assetId: string }>;
  byMonth: Map<string, Bucket>; // key "YYYY-MM", bucketed by each plan's campaignStart month
  grandTotal: number;
  agencyFeesEstimated: number; // sum of (client billing x client.defaultAgencyFeePct), only where a % is on file
  agencyFeesCoveredTotal: number; // the portion of grandTotal that had a fee % to estimate from
  agencyFeeRealTotal: number; // sum of real, per-item agencyFeeAmount — never estimated
  irRealTotal: number; // sum of real, per-item irAmount — never estimated
  anyPendingOverall: boolean;
  itemCount: number;
  planCount: number;
}

// The single source of truth for "spend across plans" — every consumer
// (Reports, the Admin dashboard) uses this instead of its own copy, so the
// numbers can never drift apart. Always uses each plan's latest version
// only, so a superseded version is never double-counted.
export async function getSpendAggregation(opts: {
  includeCancelled?: boolean;
  from?: Date | null;
  to?: Date | null;
  clientIds?: string[]; // scope to a specific set of clients (e.g. an Account Manager's own)
} = {}): Promise<SpendAggregation> {
  const plans = await prisma.mediaPlan.findMany({
    where: {
      ...(opts.includeCancelled ? {} : { status: { not: "CANCELLED" } }),
      ...(opts.clientIds ? { clientId: { in: opts.clientIds } } : {}),
      ...(opts.from || opts.to
        ? { campaignStart: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
        : {}),
    },
    include: {
      client: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
        include: { items: { include: { asset: { include: { supplier: true } } } } },
      },
    },
  });

  const bySupplier = new Map<string, Bucket>();
  const byClient = new Map<string, Bucket>();
  const byArea = new Map<string, Bucket>();
  const byFormat = new Map<string, Bucket>();
  const byChannel = new Map<string, Bucket>();
  const byAsset = new Map<string, Bucket & { assetId: string }>();
  const byMonth = new Map<string, Bucket>();

  let grandTotal = 0;
  let agencyFeesEstimated = 0;
  let agencyFeesCoveredTotal = 0;
  let agencyFeeRealTotal = 0;
  let irRealTotal = 0;
  let anyPendingOverall = false;
  let itemCount = 0;

  for (const plan of plans) {
    const version = plan.versions[0];
    if (!version) continue;
    let planTotal = 0;

    const monthLabel = `${plan.campaignStart.getUTCFullYear()}-${String(plan.campaignStart.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!byMonth.has(monthLabel)) byMonth.set(monthLabel, newBucket(monthLabel));

    for (const item of version.items) {
      itemCount += 1;
      const supplierLabel = item.asset.supplier.name;
      const clientLabel = plan.client.name;
      const areaLabel = item.asset.area?.trim() || "Unspecified";
      const formatLabel = item.asset.format ?? "N/A (non-OOH)";
      const channelLabel = item.asset.supplier.mediaChannel;

      if (!bySupplier.has(supplierLabel)) bySupplier.set(supplierLabel, newBucket(supplierLabel));
      if (!byClient.has(clientLabel)) byClient.set(clientLabel, newBucket(clientLabel));
      if (!byArea.has(areaLabel)) byArea.set(areaLabel, newBucket(areaLabel));
      if (!byFormat.has(formatLabel)) byFormat.set(formatLabel, newBucket(formatLabel));
      if (!byChannel.has(channelLabel)) byChannel.set(channelLabel, newBucket(channelLabel));
      if (!byAsset.has(item.assetId)) byAsset.set(item.assetId, { ...newBucket(item.asset.assetName), assetId: item.assetId });

      addToBucket(bySupplier.get(supplierLabel)!, item);
      addToBucket(byClient.get(clientLabel)!, item);
      addToBucket(byArea.get(areaLabel)!, item);
      addToBucket(byFormat.get(formatLabel)!, item);
      addToBucket(byChannel.get(channelLabel)!, item);
      addToBucket(byAsset.get(item.assetId)!, item);
      addToBucket(byMonth.get(monthLabel)!, item);

      const lineTotal = item.lineTotal !== null ? Number(item.lineTotal) : 0;
      grandTotal += lineTotal;
      planTotal += lineTotal;
      if (item.agencyFeeAmount !== null) agencyFeeRealTotal += Number(item.agencyFeeAmount);
      if (item.irAmount !== null) irRealTotal += Number(item.irAmount);
      if (item.excludesPendingCost) anyPendingOverall = true;
    }

    if (plan.client.defaultAgencyFeePct !== null) {
      agencyFeesEstimated += planTotal * Number(plan.client.defaultAgencyFeePct);
      agencyFeesCoveredTotal += planTotal;
    }
  }

  return {
    bySupplier,
    byClient,
    byArea,
    byFormat,
    byChannel,
    byAsset,
    byMonth,
    grandTotal,
    agencyFeesEstimated,
    agencyFeesCoveredTotal,
    agencyFeeRealTotal,
    irRealTotal,
    anyPendingOverall,
    itemCount,
    planCount: plans.length,
  };
}
