import "server-only";
import { prisma } from "@/lib/prisma";
import type { PricingBasis, PricingCalculationMethod } from "@/generated/prisma/enums";
import type { MoneyStatus } from "./normalize";
import { findAssetMatches, MATCH_CONFIDENT_THRESHOLD } from "./matching";
import { getDefaultAssetCategoryId } from "@/lib/categories";

interface NewValueShape {
  grossRate: number | null;
  grossRateStatus: MoneyStatus;
  durationLabel: string | null;
  durationValue: number | null;
  durationUnit: string | null;
  fees: Array<{ feeType: string; amountRaw: string; amount: number | null }>;
  sizeRaw: string | null;
  facesOrScreens: number | null;
  quantityLabel: string | null;
  sourcePage: number | null;
  /** Set only when a human has manually corrected a candidate (e.g. a
   *  bundle rate that already covers all N units, so it must be treated
   *  as FIXED/PER_SCREEN_BUNDLE rather than the default per-quantityLabel
   *  guess). See fix_scoop.mts for a real example. */
  pricingBasisOverride?: PricingBasis;
  calcMethodOverride?: PricingCalculationMethod;
}

function pricingBasisFromQuantityLabel(label: string | null): PricingBasis {
  switch (label) {
    case "Screens":
      return "PER_SCREEN";
    case "Circuits":
      return "PER_CIRCUIT";
    case "Faces":
      return "PER_FACE";
    case "Poles":
      return "PER_POLE";
    case "Networks":
      return "PER_NETWORK";
    default:
      return "CUSTOM";
  }
}

/**
 * Asset-level calculation method, derived from the same quantity label —
 * NOT hardcoded to FIXED. A "rate per screen" asset must scale with
 * quantity (calculateLineItem's FIXED path deliberately does NOT multiply
 * by quantity — it's for genuine flat packages only, e.g. Break Media's
 * "City Centre Domination" bundle). Only an asset with no quantity
 * dimension at all falls back to FIXED, because there's nothing to scale.
 */
function calculationMethodFromQuantityLabel(label: string | null): PricingCalculationMethod {
  switch (label) {
    case "Screens":
      return "PER_SCREEN";
    case "Circuits":
      return "PER_CIRCUIT";
    case "Faces":
      return "PER_FACE";
    case "Poles":
      return "PER_POLE";
    case "Networks":
      return "PER_NETWORK";
    default:
      return "FIXED";
  }
}

export class PublishRequiresDecisionError extends Error {}

/**
 * Publishes a single reviewed RateChange row into real Asset/AssetRate/
 * AssetFee data. CONFLICT and LOW_CONFIDENCE rows require the caller to
 * pass either `forceNewAsset: true` (publish as a brand-new asset) or
 * `mergeIntoAssetId` (attach the new rate to an existing asset instead)
 * — the only safe automatic action for an ambiguous row is to refuse
 * until a human makes one of those calls, or rejects it outright.
 */
export async function publishRateChange(
  rateChangeId: string,
  opts: { forceNewAsset?: boolean; mergeIntoAssetId?: string; userId?: string } = {}
) {
  const change = await prisma.rateChange.findUniqueOrThrow({
    where: { id: rateChangeId },
    include: { rateCardVersion: { include: { rateCard: true } } },
  });

  if (change.decision === "PUBLISHED") return change;

  if (
    (change.changeType === "CONFLICT" || change.changeType === "LOW_CONFIDENCE") &&
    !opts.forceNewAsset &&
    !opts.mergeIntoAssetId
  ) {
    throw new PublishRequiresDecisionError(
      "This row needs a human decision before it can be published: reject it, publish it as a new " +
        "asset, or merge it into an existing asset."
    );
  }

  const newValue = change.newValue as unknown as NewValueShape;
  const supplierId = change.rateCardVersion.rateCard.supplierId;

  if (change.changeType === "UNCHANGED") {
    return prisma.rateChange.update({
      where: { id: rateChangeId },
      data: { decision: "PUBLISHED", decidedAt: new Date(), decidedById: opts.userId },
    });
  }

  let assetId: string;

  if (opts.mergeIntoAssetId) {
    await prisma.asset.findUniqueOrThrow({ where: { id: opts.mergeIntoAssetId } });
    assetId = opts.mergeIntoAssetId;
  } else if (change.assetId) {
    assetId = change.assetId;
  } else {
    if (!opts.forceNewAsset) {
      const existingAssets = await prisma.asset.findMany({
        where: { supplierId },
        select: { id: true, assetName: true, locationName: true, area: true },
      });
      const [topMatch] = findAssetMatches(change.candidateAssetName, change.candidateLocation, existingAssets);
      if (topMatch && topMatch.score >= MATCH_CONFIDENT_THRESHOLD) {
        throw new PublishRequiresDecisionError(
          `"${change.candidateAssetName}" looks similar to the existing asset "${topMatch.asset.assetName}" ` +
            `(${topMatch.asset.locationName}) — an automated duplicate scan caught this before creating a new ` +
            `asset. Merge into it if they're the same, or publish as new if they're genuinely different.`
        );
      }
    }
    const asset = await prisma.asset.create({
      data: {
        assetCode: `RC-${change.id.slice(-8).toUpperCase()}`,
        supplierId,
        assetName: change.candidateAssetName,
        locationName: change.candidateLocation ?? change.candidateAssetName,
        area: change.candidateLocation,
        format: "STATIC",
        mediaCategoryId: await getDefaultAssetCategoryId(),
        numberOfFaces: newValue.quantityLabel === "Faces" ? newValue.facesOrScreens : null,
        numberOfScreens: newValue.quantityLabel === "Screens" ? newValue.facesOrScreens : null,
        numberOfCircuits: newValue.quantityLabel === "Circuits" ? newValue.facesOrScreens : null,
        pricingCalculationMethod: newValue.calcMethodOverride ?? calculationMethodFromQuantityLabel(newValue.quantityLabel),
        extraAttributes: {
          createdFromRateChange: change.id,
          sourceDocument: change.rateCardVersion.originalFilename,
          sourcePage: newValue.sourcePage,
        },
      },
    });
    assetId = asset.id;
  }

  const assetRate = await prisma.assetRate.create({
    data: {
      assetId,
      supplierId,
      rateCardVersionId: change.rateCardVersionId,
      rateYear: change.rateCardVersion.rateYear,
      effectiveFrom: change.rateCardVersion.effectiveFrom,
      pricingBasis: newValue.pricingBasisOverride ?? pricingBasisFromQuantityLabel(newValue.quantityLabel),
      durationValue: newValue.durationValue,
      durationUnit: newValue.durationUnit,
      quantityBasis: newValue.quantityLabel ? `per ${newValue.quantityLabel.toLowerCase()}` : null,
      grossRateStatus: newValue.grossRateStatus,
      grossRate: newValue.grossRateStatus === "KNOWN" ? newValue.grossRate : null,
      publishedStatus: "PUBLISHED",
      sourcePage: newValue.sourcePage,
      sourceValueRaw: newValue.durationLabel,
    },
  });

  for (const fee of newValue.fees ?? []) {
    await prisma.assetFee.create({
      data: {
        assetRateId: assetRate.id,
        feeType: fee.feeType,
        status: fee.amount !== null ? "KNOWN" : "NOT_APPLICABLE",
        amount: fee.amount,
        sourceValueRaw: fee.amountRaw,
      },
    });
  }

  // CRITICAL for rate-year selection: selectRateYear's same-year tiebreak
  // picks the candidate with the latest `publishedAt`, treating a null as
  // the oldest possible value. Without this, every rate-card-sourced
  // AssetRate would silently lose that tiebreak to the Phase 1 Excel
  // migration snapshot forever (its RateCardVersion.publishedAt was set
  // once, at migration time) — the exact opposite of "prefer rate-card
  // data over Excel". Set it here, the first time this version actually
  // produces a live rate, not at upload/parse time.
  await prisma.rateCardVersion.update({
    where: { id: change.rateCardVersionId },
    data: { publishedAt: change.rateCardVersion.publishedAt ?? new Date() },
  });

  const updated = await prisma.rateChange.update({
    where: { id: rateChangeId },
    data: { assetId, decision: "PUBLISHED", decidedAt: new Date(), decidedById: opts.userId },
  });

  await maybeMarkVersionPublished(change.rateCardVersionId);
  return updated;
}

export async function rejectRateChange(rateChangeId: string, userId?: string) {
  const change = await prisma.rateChange.findUniqueOrThrow({ where: { id: rateChangeId } });
  const updated = await prisma.rateChange.update({
    where: { id: rateChangeId },
    data: { decision: "REJECTED", decidedAt: new Date(), decidedById: userId },
  });
  await maybeMarkVersionPublished(change.rateCardVersionId);
  return updated;
}

/** Once every candidate on a rate-card version has a decision (published
 *  or rejected — none left PENDING), the version itself is done being
 *  "in review". This only ever advances REVIEW -> PUBLISHED; it never
 *  touches a version that's UPLOADED/PARSING/FAILED/ARCHIVED. */
async function maybeMarkVersionPublished(rateCardVersionId: string) {
  const [version, pendingCount] = await Promise.all([
    prisma.rateCardVersion.findUnique({ where: { id: rateCardVersionId }, select: { status: true } }),
    prisma.rateChange.count({ where: { rateCardVersionId, decision: "PENDING" } }),
  ]);
  if (version?.status === "REVIEW" && pendingCount === 0) {
    await prisma.rateCardVersion.update({ where: { id: rateCardVersionId }, data: { status: "PUBLISHED" } });
  }
}

/** Publishes every eligible (non-conflict, non-low-confidence, not yet
 *  decided) row for a rate-card version in one action. */
export async function publishAllEligible(rateCardVersionId: string, userId?: string) {
  const eligible = await prisma.rateChange.findMany({
    where: {
      rateCardVersionId,
      decision: "PENDING",
      changeType: { in: ["NEW", "CHANGED", "UNCHANGED"] },
    },
    select: { id: true, candidateAssetName: true },
  });
  let published = 0;
  const skipped: Array<{ candidateAssetName: string; reason: string }> = [];
  for (const row of eligible) {
    try {
      await publishRateChange(row.id, { userId });
      published++;
    } catch (err) {
      if (err instanceof PublishRequiresDecisionError) {
        skipped.push({ candidateAssetName: row.candidateAssetName, reason: err.message });
      } else {
        throw err;
      }
    }
  }
  return { published, total: eligible.length, skipped };
}
