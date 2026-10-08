import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { PricingCalculationMethod } from "@/generated/prisma/enums";
import { buildAndCalculateLineItem } from "./buildLineItem";

const moneyOrNull = (v: { status: string; amount: number | null }) => (v.status === "KNOWN" ? v.amount : null);

/**
 * Prices one inventory line with the planner engine and freezes the rate snapshot. Shared by "add asset" and
 * "add suggestions" so both always price identically. Unknown (TBD/POA) values stay null, never zero.
 */
export async function priceAssetLine(args: {
  assetId: string; assetRateId: string; start: Date; end: Date; quantity: number; discountPct: number; additionalDiscountPct: number;
}) {
  const [asset, rate] = await Promise.all([
    prisma.asset.findUniqueOrThrow({ where: { id: args.assetId } }),
    prisma.assetRate.findUniqueOrThrow({
      where: { id: args.assetRateId },
      include: { fees: true, rateCardVersion: { include: { rateCard: { include: { supplier: true } } } } },
    }),
  ]);

  const { result } = buildAndCalculateLineItem({
    calculationMethod: asset.pricingCalculationMethod as PricingCalculationMethod,
    rate: {
      grossRateStatus: rate.grossRateStatus,
      grossRate: rate.grossRate ? Number(rate.grossRate) : null,
      durationValue: rate.durationValue ? Number(rate.durationValue) : null,
      durationUnit: rate.durationUnit,
      fees: rate.fees.map((f) => ({ feeType: f.feeType, status: f.status, amount: f.amount ? Number(f.amount) : null })),
    },
    campaignStart: args.start,
    campaignEnd: args.end,
    quantity: args.quantity,
    discountPct: args.discountPct,
    additionalDiscountPct: args.additionalDiscountPct,
  });

  const sourceDocument = rate.rateCardVersion.rateCard.supplier.name === "__EXCEL_MIGRATION__" ? "Excel migration" : rate.rateCardVersion.originalFilename;
  const rateSnapshot = {
    rateId: rate.id, rateYear: rate.rateYear, sourceRateCard: sourceDocument, sourcePage: rate.sourcePage, pricingBasis: rate.pricingBasis,
    grossRate: rate.grossRate ? Number(rate.grossRate) : null, grossRateStatus: rate.grossRateStatus,
    fees: rate.fees.map((f) => ({ feeType: f.feeType, status: f.status, amount: f.amount ? Number(f.amount) : null })),
    calculationMethod: asset.pricingCalculationMethod, quantity: args.quantity, capturedAt: new Date().toISOString(),
  };

  return {
    asset, rate, result,
    data: {
      rateSnapshot: rateSnapshot as unknown as Prisma.InputJsonValue,
      grossCost: moneyOrNull(result.grossCost), netMedia: moneyOrNull(result.netMedia),
      productionFee: moneyOrNull(result.productionFee), uploadFee: moneyOrNull(result.uploadFee), installationFee: moneyOrNull(result.installationFee),
      serviceFee: moneyOrNull(result.serviceFee), otherFees: moneyOrNull(result.otherFees), lineTotal: moneyOrNull(result.lineTotal),
      excludesPendingCost: result.excludesPendingCost,
    },
  };
}
