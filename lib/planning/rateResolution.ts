import "server-only";
import { prisma } from "@/lib/prisma";
import { selectRateYear, type RateYearCandidate } from "@/lib/engine/rateYear";

export interface AvailableRatesResult {
  found: boolean;
  isFallback: boolean;
  requestedYear: number;
  rateYear: number | null;
  /** Every published AssetRate that belongs to the winning rate-card
   *  version — i.e. every period a planner can choose between (e.g. a
   *  legacy Excel asset with 2-week/3-month/6-month/12-month rows all
   *  under one version). */
  rates: Array<{
    id: string;
    pricingBasis: string;
    durationValue: number | null;
    durationUnit: string | null;
    grossRateStatus: string;
    grossRate: number | null;
    sourceDocument: string;
    sourcePage: number | null;
    fees: Array<{ feeType: string; status: string; amount: number | null }>;
  }>;
}

/**
 * Implements the project's rate-year selection rule exactly:
 * `selectedRateYear = MAX(rate_year WHERE rate_year <= campaignYear)`,
 * never a future year. Returns every rate row (period) published under
 * the winning rate-card version, so the caller can offer a period picker
 * rather than guessing which one the planner wants.
 */
export async function getApplicableRatesForAsset(
  assetId: string,
  campaignStart: Date
): Promise<AvailableRatesResult> {
  const requestedYear = campaignStart.getUTCFullYear();

  const allRates = await prisma.assetRate.findMany({
    where: { assetId, publishedStatus: "PUBLISHED" },
    include: {
      fees: true,
      rateCardVersion: { include: { rateCard: { include: { supplier: true } } } },
    },
  });

  if (allRates.length === 0) {
    return { found: false, isFallback: false, requestedYear, rateYear: null, rates: [] };
  }

  const versionMap = new Map<string, (typeof allRates)[number]["rateCardVersion"]>();
  for (const r of allRates) versionMap.set(r.rateCardVersionId, r.rateCardVersion);

  const candidates: RateYearCandidate[] = [...versionMap.values()].map((v) => ({
    id: v.id,
    rateYear: v.rateYear,
    effectiveFrom: v.effectiveFrom,
    effectiveTo: v.effectiveTo,
    publishedAt: v.publishedAt,
  }));

  const selection = selectRateYear(candidates, campaignStart);
  if (!selection.found) {
    return { found: false, isFallback: false, requestedYear, rateYear: null, rates: [] };
  }

  const winningVersionId = selection.selected.id;
  const matchingRates = allRates.filter((r) => r.rateCardVersionId === winningVersionId);

  return {
    found: true,
    isFallback: selection.isFallback,
    requestedYear,
    rateYear: selection.selected.rateYear,
    rates: matchingRates.map((r) => ({
      id: r.id,
      pricingBasis: r.pricingBasis,
      durationValue: r.durationValue ? Number(r.durationValue) : null,
      durationUnit: r.durationUnit,
      grossRateStatus: r.grossRateStatus,
      grossRate: r.grossRate ? Number(r.grossRate) : null,
      sourceDocument:
        r.rateCardVersion.rateCard.supplier.name === "__EXCEL_MIGRATION__"
          ? "Excel migration"
          : r.rateCardVersion.originalFilename,
      sourcePage: r.sourcePage,
      fees: r.fees.map((f) => ({ feeType: f.feeType, status: f.status, amount: f.amount ? Number(f.amount) : null })),
    })),
  };
}
